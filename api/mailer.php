<?php
/**
 * mailer.php — SMTP Email Sender for DICC India
 * Uses native PHP sockets + STARTTLS — no PHPMailer required.
 * Gmail App Password configured in db.php
 */

require_once __DIR__ . '/db.php';

/**
 * Send an HTML email via SMTP (Gmail / any SMTP server).
 * Also stores in email_queue for audit.
 */
function sendEmail(string $to, string $subject, string $body, ?PDO $pdo = null): bool {
    /* Always queue in DB regardless of send outcome */
    if ($pdo) {
        try {
            $pdo->prepare("INSERT INTO email_queue (to_email, subject, body, status, created_at)
                           VALUES (?, ?, ?, 'pending', ?)")
                ->execute([$to, $subject, $body, time()]);
        } catch (\Throwable $_) {}
    }

    /* Try native SMTP */
    $sent = false;
    if (SMTP_USER && SMTP_PASS) {
        $sent = _smtpSend($to, $subject, $body);
    } else {
        /* Fallback: PHP mail() — requires server SMTP config */
        $headers  = "MIME-Version: 1.0\r\n";
        $headers .= "Content-type: text/html; charset=UTF-8\r\n";
        $headers .= "From: " . MAIL_NAME . " <" . MAIL_FROM . ">\r\n";
        $sent = @mail($to, $subject, $body, $headers);
    }

    /* Update queue status */
    if ($pdo) {
        try {
            $pdo->prepare("UPDATE email_queue SET status=?, sent_at=? WHERE to_email=? ORDER BY id DESC LIMIT 1")
                ->execute([$sent ? 'sent' : 'failed', time(), $to]);
        } catch (\Throwable $_) {}
    }

    if (!$sent) error_log("[DICC Mailer] Failed to send to {$to}: {$subject}");
    return $sent;
}

/**
 * Native SMTP implementation with STARTTLS (works with Gmail on port 587).
 */
function _smtpSend(string $to, string $subject, string $htmlBody): bool {
    $host = SMTP_HOST;
    $port = SMTP_PORT;
    $user = SMTP_USER;
    $pass = SMTP_PASS;
    $from = MAIL_FROM;
    $name = MAIL_NAME;

    /* ── Connect ── */
    $socket = @fsockopen($host, $port, $errno, $errstr, 15);
    if (!$socket) {
        error_log("[SMTPE] Connect failed: {$errstr} ({$errno})");
        return false;
    }
    stream_set_timeout($socket, 15);

    $read = fn() => fgets($socket, 512);
    $send = function (string $cmd) use ($socket) { fputs($socket, $cmd . "\r\n"); };

    /* ── Greeting ── */
    $read();                                          /* 220 smtp.gmail.com */

    /* ── EHLO ── */
    $send("EHLO dicc-india.in");
    do { $line = $read(); } while ($line && substr($line, 3, 1) === '-');

    /* ── STARTTLS ── */
    $send("STARTTLS");
    $tls = $read();
    if (strpos($tls, '220') === false) { fclose($socket); return false; }

    /* ── Upgrade to TLS ── */
    if (!stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
        error_log("[SMTPE] TLS upgrade failed");
        fclose($socket); return false;
    }

    /* ── Re-EHLO after TLS ── */
    $send("EHLO dicc-india.in");
    do { $line = $read(); } while ($line && substr($line, 3, 1) === '-');

    /* ── AUTH LOGIN ── */
    $send("AUTH LOGIN");
    $read();                                          /* 334 Username: */
    $send(base64_encode($user));
    $read();                                          /* 334 Password: */
    $send(base64_encode($pass));
    $authResp = $read();
    if (strpos($authResp, '235') === false) {
        error_log("[SMTPE] Auth failed: {$authResp}");
        $send("QUIT"); fclose($socket); return false;
    }

    /* ── Envelope ── */
    $send("MAIL FROM:<{$from}>");
    $read();
    $send("RCPT TO:<{$to}>");
    $read();

    /* ── DATA ── */
    $send("DATA");
    $read();

    /* ── RFC 2822 Message ── */
    $boundary = 'dicc_' . md5(uniqid());
    $msg  = "From: =?UTF-8?B?" . base64_encode($name) . "?= <{$from}>\r\n";
    $msg .= "To: <{$to}>\r\n";
    $msg .= "Subject: =?UTF-8?B?" . base64_encode($subject) . "?=\r\n";
    $msg .= "MIME-Version: 1.0\r\n";
    $msg .= "Content-Type: text/html; charset=UTF-8\r\n";
    $msg .= "Content-Transfer-Encoding: base64\r\n";
    $msg .= "X-Mailer: DICC-IoT/2.0\r\n";
    $msg .= "\r\n";
    $msg .= chunk_split(base64_encode($htmlBody)) . "\r\n";
    $msg .= ".";
    $send($msg);
    $sentResp = $read();

    $send("QUIT");
    fclose($socket);

    $ok = strpos($sentResp, '250') !== false;
    if ($ok) error_log("[SMTP] Sent to {$to}: {$subject}");
    return $ok;
}

/* ── Email Templates ──────────────────────────────────────────── */
function buildOtpEmail(string $name, string $otp): string {
    return <<<HTML
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#030912;font-family:Inter,-apple-system,sans-serif;padding:40px 20px}
.wrap{max-width:500px;margin:auto}
.logo{text-align:center;margin-bottom:24px}
.logo-title{font-size:18px;font-weight:800;color:#00d4ff;letter-spacing:3px}
.logo-sub{font-size:11px;color:rgba(180,210,255,.5);margin-top:4px}
.card{background:rgba(6,18,40,.95);border:1px solid rgba(0,212,255,.2);border-radius:14px;padding:32px}
h2{color:#e0eeff;font-size:17px;margin-bottom:12px}
p{color:rgba(180,210,255,.7);font-size:13px;line-height:1.6;margin-bottom:12px}
.otp-box{background:rgba(0,255,136,.07);border:1px solid rgba(0,255,136,.25);border-radius:10px;
         text-align:center;padding:20px;margin:20px 0}
.otp-val{font-size:40px;font-weight:900;letter-spacing:10px;color:#00ff88;
         font-family:'Courier New',monospace;display:block}
.otp-exp{font-size:11px;color:rgba(0,255,136,.5);margin-top:8px}
.footer{text-align:center;margin-top:24px;font-size:10px;color:rgba(180,210,255,.3)}
b{color:#e0eeff}
</style>
</head>
<body>
<div class="wrap">
  <div class="logo">
    <div class="logo-title">🌐 DICC INDIA</div>
    <div class="logo-sub">Disaster Intelligence Command Center</div>
  </div>
  <div class="card">
    <h2>🔐 Verify Your Account</h2>
    <p>Hi <b>{$name}</b>, welcome to DICC India — your hyperlocal disaster alert platform.</p>
    <p>Your One-Time Password is:</p>
    <div class="otp-box">
      <span class="otp-val">{$otp}</span>
      <div class="otp-exp">⏱ Expires in 15 minutes</div>
    </div>
    <p>Enter this OTP on the verification screen to activate your account and start receiving real-time disaster alerts.</p>
    <p style="color:rgba(255,68,68,.7);font-size:11px">Never share this OTP with anyone. DICC India will never ask for it.</p>
  </div>
  <div class="footer">© DICC India · Real-time Disaster Intelligence · 🇮🇳</div>
</div>
</body>
</html>
HTML;
}

function buildAlertEmail(string $name, string $type, string $message, float $km): string {
    $icon    = ['flood'=>'🌊','heatwave'=>'🌡️','cyclone'=>'🌀','earthquake'=>'🌍'][$type] ?? '⚡';
    $typeUC  = strtoupper($type);
    $border  = ['flood'=>'#0088ff','heatwave'=>'#ff6600','cyclone'=>'#cc44ff','earthquake'=>'#ff1144'][$type] ?? '#ff1144';
    $kmStr   = number_format($km, 1);
    $time    = date('d M Y, h:i A', time());

    return <<<HTML
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#030912;font-family:Inter,-apple-system,sans-serif;padding:40px 20px}
.wrap{max-width:500px;margin:auto}
.logo{text-align:center;margin-bottom:24px}
.logo-title{font-size:18px;font-weight:800;color:#00d4ff;letter-spacing:3px}
.logo-sub{font-size:11px;color:rgba(180,210,255,.5);margin-top:4px}
.card{background:rgba(6,18,40,.95);border:1px solid {$border};border-radius:14px;padding:32px;
      box-shadow:0 0 40px rgba(255,17,68,.08)}
.alert-header{display:flex;align-items:center;gap:12px;margin-bottom:18px}
.alert-icon{font-size:36px}
.alert-title{color:#e0eeff;font-size:18px;font-weight:700}
.alert-type{color:{$border};font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase}
.msg-box{background:rgba(255,17,68,.06);border:1px solid rgba(255,17,68,.15);border-radius:8px;
         padding:14px;color:#e0eeff;font-size:13px;line-height:1.5;margin-bottom:16px}
.stat-row{display:flex;gap:16px;margin-bottom:16px}
.stat{background:rgba(255,255,255,.04);border-radius:8px;padding:10px 14px;flex:1;text-align:center}
.stat-val{font-weight:700;color:#e0eeff;font-size:14px;display:block}
.stat-lbl{font-size:10px;color:rgba(180,210,255,.5);margin-top:3px;display:block}
.safety-tips{background:rgba(0,229,160,.05);border:1px solid rgba(0,229,160,.15);border-radius:8px;padding:14px}
.safety-tips h4{color:#00e5a0;font-size:12px;margin-bottom:8px}
.safety-tips li{color:rgba(180,210,255,.7);font-size:11px;line-height:1.6;margin-left:14px}
.footer{text-align:center;margin-top:24px;font-size:10px;color:rgba(180,210,255,.3)}
b{color:#e0eeff}
</style>
</head>
<body>
<div class="wrap">
  <div class="logo">
    <div class="logo-title">🌐 DICC INDIA</div>
    <div class="logo-sub">Disaster Intelligence Command Center</div>
  </div>
  <div class="card">
    <div class="alert-header">
      <div class="alert-icon">{$icon}</div>
      <div>
        <div class="alert-title">Disaster Alert</div>
        <div class="alert-type">{$typeUC} WARNING</div>
      </div>
    </div>
    <div class="msg-box">{$message}</div>
    <div class="stat-row">
      <div class="stat"><span class="stat-val">📍 {$kmStr} km</span><span class="stat-lbl">From your location</span></div>
      <div class="stat"><span class="stat-val">🕐 {$time}</span><span class="stat-lbl">Alert generated</span></div>
    </div>
    <div class="safety-tips">
      <h4>✅ Safety Guidelines</h4>
      <ul>
        <li>Stay indoors and away from windows</li>
        <li>Follow official NDMA instructions</li>
        <li>Keep emergency contacts ready</li>
        <li>Monitor DICC India dashboard for updates</li>
      </ul>
    </div>
  </div>
  <div class="footer">
    © DICC India · <a href="http://localhost/Multidisaster" style="color:#00d4ff">Open Dashboard</a> · 🇮🇳<br/>
    You received this because you registered for proximity alerts. Hi <b>{$name}</b>.
  </div>
</div>
</body>
</html>
HTML;
}
