<?php
/**
 * test.php — DICC IoT Alert Test Command Center
 * Tests the full alert pipeline:
 *   1. Simulate ESP32 sensor reading (heatwave / flood / cyclone)
 *   2. Trigger real alert dispatch to all users in selected city
 *   3. Verify siren sounds in client.html
 *   4. Verify email queue
 *
 * ADMIN ONLY — requires session or runs locally.
 */

session_start();
require_once __DIR__ . '/api/db.php';

$pdo = getDB();
$now = time();
define('IST_OFF', 19800); /* UTC+5:30 */
function ist($ts=null){ return date('d M Y h:i:s A', ($ts??time())+IST_OFF).' IST'; }

/* ── Handle AJAX test actions ───────────────────────────────────── */
if (($_SERVER['REQUEST_METHOD'] === 'POST') && isset($_POST['action'])) {
    header('Content-Type: application/json; charset=UTF-8');

    $action = $_POST['action'];
    $city   = trim($_POST['city'] ?? 'Nagpur');
    $type   = $_POST['type']   ?? 'heatwave';
    $temp   = (float)($_POST['temp']  ?? 43.5);
    $hum    = (int)  ($_POST['hum']   ?? 82);
    $rainV  = (int)  ($_POST['rain']  ?? 800);   /* ADC raw */
    $soilV  = (int)  ($_POST['soil']  ?? 800);   /* ADC raw (lower=wetter) */

    /* ── 1. Inject fake ESP32 reading ─────────────────────────────── */
    if ($action === 'inject') {
        if (!$pdo) { echo json_encode(['ok'=>false,'error'=>'DB error']); exit; }

        /* Ensure node exists */
        $nodeId = 'DICC-TEST';
        $stmt = $pdo->prepare("SELECT id FROM iot_nodes WHERE id=? LIMIT 1");
        $stmt->execute([$nodeId]);
        if (!$stmt->fetch()) {
            /* City coords */
            $coords = [
                'Nagpur' =>[21.1458,79.0882],'Pune'=>[18.5204,73.8567],
                'Mumbai' =>[19.0760,72.8777],'Delhi'=>[28.6139,77.2090],
                'Bangalore'=>[12.9716,77.5946],'Hyderabad'=>[17.3850,78.4867],
            ];
            [$lat,$lon] = $coords[$city] ?? [20.5937,78.9629];
            $pdo->prepare("
                INSERT INTO iot_nodes (id,name,city,state,lat,lon,status,last_seen,firmware)
                VALUES (?,?,?,?,?,?,?,?,?)
            ")->execute([$nodeId,'DICC Test Node',$city,'Maharashtra',$lat,$lon,'online',$now,'4.0-TEST']);
        } else {
            $pdo->prepare("UPDATE iot_nodes SET city=?,last_seen=? WHERE id=?")
                ->execute([$city,$now,$nodeId]);
        }

        /* Calculate risk scores */
        $soilPct  = max(0, min(100, (4095-$soilV)/4095*100));
        $rainHeavy= ($rainV < 1200);
        $soilSat  = ($soilPct >= 70);
        $humHigh  = ($hum >= 80);
        $isHeat   = ($temp >= 40);
        $isFlood  = ($rainHeavy && $soilSat && $humHigh);
        $isCyc    = ($rainHeavy && $hum >= 85);

        $heatR  = $isHeat  ? min(1.0, ($temp-40)/10 + 0.35) : max(0, ($temp-35)/10);
        $floodR = $isFlood ? 0.85 : ($rainHeavy ? 0.50 : ($soilSat ? 0.30 : 0.10));
        $cycR   = $isCyc   ? 0.75 : ($rainHeavy ? 0.35 : 0.05);

        $rainStr = $rainV<800?'HEAVY':($rainV<2200?'MODERATE':($rainV<3200?'LIGHT':'DRY'));

        /* Insert sensor reading */
        $pdo->prepare("
            INSERT INTO sensor_readings
              (node_id,temperature,humidity,rain_sensor,rain_status,soil_moisture,soil_moisture_pct,
               flood_risk,heatwave_risk,cyclone_risk,timestamp)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)
        ")->execute([
            $nodeId,$temp,$hum,$rainV,$rainStr,$soilV,round($soilPct,1),
            $floodR,$heatR,$cycR,$now
        ]);

        /* ── 2. Trigger alert dispatch ──────────────────────────────── */
        $dispatched = [];
        $alertMsgs  = [];

        if ($isHeat) {
            $alertMsgs[] = ['type'=>'heatwave','msg'=>sprintf(
                '🌡️ HEATWAVE ALERT — ESP32 sensor in %s reads %.1f°C. Extreme heat detected! Stay indoors, avoid outdoor activity.',
                $city, $temp
            ),'sev'=>'HIGH'];
        }
        if ($isFlood) {
            $alertMsgs[] = ['type'=>'flood','msg'=>sprintf(
                '🌊 FLOOD RISK — Heavy rain + saturated soil detected in %s. Rain: %s, Soil: %.0f%%, Humidity: %d%%. Evacuate low-lying areas.',
                $city, $rainStr, $soilPct, $hum
            ),'sev'=>'HIGH'];
        }
        if ($isCyc) {
            $alertMsgs[] = ['type'=>'cyclone','msg'=>sprintf(
                '🌀 CYCLONE CONDITIONS — Extreme wind and rain patterns detected in %s. Secure structures. Stay indoors.',
                $city
            ),'sev'=>'HIGH'];
        }

        if ($alertMsgs && $pdo) {
            /* Get affected users */
            $users = $pdo->prepare("
                SELECT id,name,email,city,latitude,longitude,alerts_enabled,is_verified
                FROM users WHERE city LIKE ? AND role='user' AND is_verified=1
            ");
            $users->execute(['%'.$city.'%']);
            $clients = $users->fetchAll(PDO::FETCH_ASSOC);

            require_once __DIR__ . '/api/mailer.php';

            foreach ($clients as $u) {
                if (!$u['alerts_enabled']) continue;
                foreach ($alertMsgs as $am) {
                    /* Insert alert record */
                    $pdo->prepare("
                        INSERT INTO user_alerts
                          (user_id,disaster_type,message,severity,distance_km,sent_at)
                        VALUES (?,?,?,?,?,?)
                    ")->execute([$u['id'],$am['type'],$am['msg'],$am['sev'],0.5,$now]);

                    /* Send email */
                    $emailBody = buildAlertEmail($u['name'],$am['type'],$am['msg'],0.5);
                    $sent = sendEmail($u['email'], '⚠️ DICC Alert: '.strtoupper($am['type']).' in '.$city, $emailBody, $pdo);
                    $dispatched[] = ['user'=>$u['name'],'email'=>$u['email'],'sent'=>$sent,'type'=>$am['type']];
                }
            }
        }

        echo json_encode([
            'ok'         => true,
            'node_id'    => $nodeId,
            'city'       => $city,
            'readings'   => [
                'temperature'=>$temp,'humidity'=>$hum,
                'rain_status'=>$rainStr,'soil_pct'=>round($soilPct,1),
                'heatwave_risk'=>round($heatR,3),'flood_risk'=>round($floodR,3),
            ],
            'detected'   => $alertMsgs,
            'dispatched' => $dispatched,
            'ist_time'   => ist(),
        ]);
        exit;
    }

    /* ── Clear test node ──────────────────────────────────────────── */
    if ($action === 'clear' && $pdo) {
        $pdo->exec("DELETE FROM sensor_readings WHERE node_id='DICC-TEST'");
        $pdo->exec("DELETE FROM iot_nodes WHERE id='DICC-TEST'");
        echo json_encode(['ok'=>true,'msg'=>'Test node cleared']);
        exit;
    }

    /* ── Email queue status ───────────────────────────────────────── */
    if ($action === 'queue_status' && $pdo) {
        $rows = $pdo->query("SELECT to_email,subject,status,sent_at FROM email_queue ORDER BY id DESC LIMIT 10")->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode(['ok'=>true,'queue'=>$rows]);
        exit;
    }

    /* ── Users in city ───────────────────────────────────────────── */
    if ($action === 'get_users' && $pdo) {
        $city = trim($_POST['city'] ?? 'Nagpur');
        $rows = $pdo->prepare("SELECT name,email,city,alerts_enabled,is_verified FROM users WHERE city LIKE ? AND role='user' LIMIT 20");
        $rows->execute(['%'.$city.'%']);
        echo json_encode(['ok'=>true,'users'=>$rows->fetchAll(PDO::FETCH_ASSOC)]);
        exit;
    }

    echo json_encode(['ok'=>false,'error'=>'unknown action']); exit;
}

/* ── Fetch cities for dropdown ──────────────────────────────────── */
$cities = [];
if ($pdo) {
    $r = $pdo->query("SELECT city,COUNT(*) AS cnt FROM users WHERE city IS NOT NULL AND city!='' AND role='user' GROUP BY city ORDER BY cnt DESC LIMIT 20");
    $cities = $r ? $r->fetchAll(PDO::FETCH_ASSOC) : [];
}
if (!$cities) {
    $cities = [
        ['city'=>'Nagpur','cnt'=>0],['city'=>'Pune','cnt'=>0],['city'=>'Mumbai','cnt'=>0],
        ['city'=>'Delhi','cnt'=>0],['city'=>'Bangalore','cnt'=>0],
    ];
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>DICC — IoT Alert Test Lab</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&family=Orbitron:wght@700&display=swap" rel="stylesheet"/>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#030912;--bg2:rgba(6,18,40,.95);--bg3:rgba(10,24,54,.7);
  --accent:#00d4ff;--success:#00e5a0;--danger:#ff1144;--warn:#ff6600;
  --txt1:#e0eeff;--txt2:rgba(180,210,255,.75);--txt3:rgba(180,210,255,.4);
  --border:rgba(0,212,255,.15);--r:10px;
}
html,body{min-height:100vh;background:var(--bg);color:var(--txt1);font-family:'Inter',sans-serif}
body{display:flex;flex-direction:column}

/* Top bar */
#top-bar{
  height:54px;background:rgba(3,9,18,.98);border-bottom:1px solid var(--border);
  display:flex;align-items:center;gap:14px;padding:0 22px;flex-shrink:0;
}
.tb-logo{font-family:'Orbitron',sans-serif;font-size:.9rem;color:var(--accent);letter-spacing:2px}
.tb-title{font-size:.75rem;color:var(--txt3);margin-left:4px}
.tb-clock{margin-left:auto;font-family:'JetBrains Mono',monospace;font-size:.72rem;color:var(--accent);
          background:rgba(0,212,255,.06);border:1px solid rgba(0,212,255,.15);border-radius:6px;padding:3px 10px}
.tb-back{text-decoration:none;font-size:.73rem;color:var(--txt3);border:1px solid var(--border);
         border-radius:6px;padding:4px 10px;transition:all .15s}
.tb-back:hover{color:var(--accent);border-color:var(--accent)}

/* Layout */
main{flex:1;display:grid;grid-template-columns:380px 1fr;gap:20px;padding:20px;max-width:1300px;margin:0 auto;width:100%}
@media(max-width:900px){main{grid-template-columns:1fr;}}

h2{font-size:.72rem;font-weight:700;color:rgba(0,212,255,.55);letter-spacing:.09em;text-transform:uppercase;margin-bottom:12px}

/* Card */
.card{background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);padding:18px}
.card+.card{margin-top:14px}

/* Form */
.frow{margin-bottom:12px}
.frow label{display:block;font-size:.68rem;color:var(--txt3);margin-bottom:5px;font-weight:600;letter-spacing:.04em}
select,input[type=number],input[type=range]{
  width:100%;padding:7px 10px;background:rgba(0,0,0,.3);border:1px solid var(--border);
  border-radius:7px;color:var(--txt1);font-size:.8rem;font-family:'Inter',sans-serif;outline:none;
  transition:border-color .15s;
}
select:focus,input:focus{border-color:var(--accent)}
input[type=range]{padding:4px 0;cursor:pointer;accent-color:var(--accent)}
.val-badge{display:inline-block;font-family:'JetBrains Mono',monospace;font-size:.72rem;
           color:var(--accent);background:rgba(0,212,255,.07);border:1px solid rgba(0,212,255,.15);
           border-radius:5px;padding:1px 7px;margin-left:6px;min-width:52px;text-align:center}

/* Sliders row */
.sliders{display:grid;grid-template-columns:1fr 1fr;gap:10px}

/* Buttons */
.btn{display:inline-flex;align-items:center;gap:7px;padding:10px 18px;border-radius:8px;
     border:none;cursor:pointer;font-weight:700;font-size:.82rem;font-family:'Inter',sans-serif;
     transition:all .15s;letter-spacing:.02em}
.btn-heat{background:linear-gradient(135deg,#7a1a00,#3a0a00);color:#ff6600;border:1px solid #ff660033}
.btn-heat:hover{background:linear-gradient(135deg,#aa2200,#5a1000);box-shadow:0 0 16px rgba(255,100,0,.25)}
.btn-flood{background:linear-gradient(135deg,#001a3a,#000a1a);color:#0088ff;border:1px solid #0088ff33}
.btn-flood:hover{background:linear-gradient(135deg,#002555,#001530);box-shadow:0 0 16px rgba(0,136,255,.2)}
.btn-cyc{background:linear-gradient(135deg,#2a0045,#1a0035);color:#cc44ff;border:1px solid #cc44ff33}
.btn-cyc:hover{background:linear-gradient(135deg,#3a0060,#200045);box-shadow:0 0 16px rgba(204,68,255,.2)}
.btn-clear{background:rgba(255,255,255,.04);color:var(--txt3);border:1px solid rgba(180,210,255,.1)}
.btn-clear:hover{color:var(--txt1);border-color:rgba(180,210,255,.2)}
.btn-full{width:100%;justify-content:center;margin-bottom:9px}
.btn-row{display:flex;gap:8px;flex-wrap:wrap}
.btn:disabled{opacity:.45;cursor:not-allowed}

/* User list */
.user-row{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:6px;
          background:rgba(0,0,0,.15);margin-bottom:5px}
.user-avatar{width:26px;height:26px;border-radius:50%;background:linear-gradient(135deg,rgba(0,212,255,.2),rgba(204,68,255,.15));
             border:1px solid rgba(0,212,255,.25);display:flex;align-items:center;justify-content:center;
             font-size:.65rem;font-weight:700;color:var(--accent);flex-shrink:0}
.user-name{font-size:.78rem;font-weight:600;color:var(--txt1)}
.user-email{font-size:.6rem;color:var(--txt3);font-family:'JetBrains Mono',monospace}
.badge{display:inline-block;font-size:.55rem;padding:1px 5px;border-radius:3px;font-weight:700;margin-left:4px}
.badge-v{background:rgba(0,229,160,.12);color:#00e5a0;border:1px solid rgba(0,229,160,.2)}
.badge-a{background:rgba(255,170,0,.12);color:#ffaa00;border:1px solid rgba(255,170,0,.2)}
.badge-na{background:rgba(255,68,68,.1);color:#ff6666;border:1px solid rgba(255,68,68,.15)}

/* Log panel */
#result-panel{flex:1;overflow-y:auto}
.log-entry{padding:11px 14px;border-radius:8px;margin-bottom:10px;font-size:.78rem;
           border:1px solid rgba(180,210,255,.08);background:rgba(255,255,255,.02);
           animation:slideIn .2s ease}
@keyframes slideIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
.log-entry.ok{border-color:rgba(0,229,160,.2);background:rgba(0,229,160,.03)}
.log-entry.err{border-color:rgba(255,17,68,.2);background:rgba(255,17,68,.03)}
.log-ts{font-family:'JetBrains Mono',monospace;font-size:.62rem;color:var(--txt3);margin-bottom:5px}
.log-badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:.65rem;font-weight:700;margin-right:5px}
.log-badge.heat{background:rgba(255,100,0,.15);color:#ff6600;border:1px solid #ff660033}
.log-badge.flood{background:rgba(0,136,255,.12);color:#0088ff;border:1px solid #0088ff33}
.log-badge.cyc{background:rgba(204,68,255,.12);color:#cc44ff;border:1px solid #cc44ff33}

/* Email row */
.email-sent{color:#00e5a0;font-size:.65rem}
.email-fail{color:#ff1144;font-size:.65rem}

/* Siren test */
#siren-bar{padding:12px 14px;border-radius:8px;border:1px solid rgba(0,212,255,.1);
           background:rgba(0,212,255,.03);display:flex;align-items:center;gap:10px;margin-bottom:10px}

/* Risk bars */
.risk-bar-wrap{margin-top:8px}
.risk-row{display:flex;align-items:center;gap:8px;margin-bottom:4px;font-size:.65rem}
.risk-label{color:var(--txt3);width:60px;flex-shrink:0}
.risk-track{flex:1;height:5px;border-radius:3px;background:rgba(255,255,255,.05);overflow:hidden}
.risk-fill{height:100%;border-radius:3px;transition:width .5s ease}
.risk-val{width:32px;text-align:right;font-family:'JetBrains Mono',monospace;color:var(--txt3)}

/* Status indicator */
.status-dot{width:8px;height:8px;border-radius:50%;display:inline-block;margin-right:5px}
.dot-ok{background:#00e5a0;animation:iotPulse 1.2s ease infinite}
.dot-warn{background:#ffaa00}
.dot-err{background:#ff1144}
@keyframes iotPulse{0%{box-shadow:0 0 0 0 rgba(0,229,160,.7)}70%{box-shadow:0 0 0 7px transparent}100%{box-shadow:0 0 0 0 transparent}}

/* Empty */
.empty{text-align:center;padding:28px;color:var(--txt3);font-size:.78rem}
.empty-icon{font-size:2rem;display:block;margin-bottom:8px}

/* Scrollbar */
::-webkit-scrollbar{width:3px}
::-webkit-scrollbar-thumb{background:rgba(0,212,255,.2);border-radius:2px}
</style>
</head>
<body>

<!-- Top bar -->
<div id="top-bar">
  <div class="tb-logo">DICC</div>
  <div class="tb-title">▸ IoT Alert Test Lab</div>
  <a href="index.html" class="tb-back">← Admin Dashboard</a>
  <a href="client.html" class="tb-back" target="_blank">Client View ↗</a>
  <div class="tb-clock" id="top-clock">--:--:-- IST</div>
</div>

<main>
  <!-- LEFT PANEL — Controls -->
  <div>
    <!-- City + Type -->
    <div class="card">
      <h2>🎯 Test Configuration</h2>

      <div class="frow">
        <label>TARGET CITY</label>
        <select id="sel-city">
          <?php foreach($cities as $c): ?>
          <option value="<?= htmlspecialchars($c['city']) ?>"><?= htmlspecialchars($c['city']) ?> (<?= $c['cnt'] ?> users)</option>
          <?php endforeach; ?>
        </select>
      </div>

      <!-- City user status -->
      <div id="city-users" style="margin-bottom:14px;min-height:28px">
        <div style="font-size:.65rem;color:var(--txt3)">Loading city data…</div>
      </div>
    </div>

    <!-- Sensor sliders -->
    <div class="card">
      <h2>🌡️ Sensor Values</h2>

      <div class="frow">
        <label>TEMPERATURE  <span class="val-badge" id="vt">43.5°C</span></label>
        <input type="range" id="sl-temp" min="20" max="60" step="0.5" value="43.5"
               oninput="document.getElementById('vt').textContent=this.value+'°C';updatePreview()"/>
        <div style="display:flex;justify-content:space-between;font-size:.58rem;color:var(--txt3);margin-top:2px">
          <span>20°C</span><span style="color:#ffaa00">40°C threshold →</span><span>60°C</span>
        </div>
      </div>

      <div class="sliders">
        <div class="frow">
          <label>HUMIDITY  <span class="val-badge" id="vh">82%</span></label>
          <input type="range" id="sl-hum" min="10" max="100" step="1" value="82"
                 oninput="document.getElementById('vh').textContent=this.value+'%';updatePreview()"/>
        </div>
        <div class="frow">
          <label>RAIN ADC  <span class="val-badge" id="vr">800</span></label>
          <input type="range" id="sl-rain" min="0" max="4095" step="10" value="800"
                 oninput="document.getElementById('vr').textContent=this.value;updatePreview()"/>
          <div style="font-size:.55rem;color:var(--txt3);margin-top:2px">Lower = heavier rain</div>
        </div>
        <div class="frow">
          <label>SOIL ADC  <span class="val-badge" id="vs">800</span></label>
          <input type="range" id="sl-soil" min="0" max="4095" step="10" value="800"
                 oninput="document.getElementById('vs').textContent=this.value;updatePreview()"/>
          <div style="font-size:.55rem;color:var(--txt3);margin-top:2px">Lower = wetter soil</div>
        </div>
      </div>

      <!-- Live preview of what will be detected -->
      <div id="preview" style="padding:10px 12px;border-radius:7px;background:rgba(0,0,0,.2);margin-top:4px;
           border:1px solid rgba(180,210,255,.07)">
        <div style="font-size:.6rem;color:rgba(0,212,255,.4);font-weight:700;margin-bottom:6px">DETECTION PREVIEW</div>
        <div id="preview-body" style="font-size:.72rem"></div>
        <div class="risk-bar-wrap" id="preview-bars"></div>
      </div>
    </div>

    <!-- Test buttons -->
    <div class="card">
      <h2>🚀 Fire Test</h2>

      <button class="btn btn-heat btn-full" id="btn-heat" onclick="fireTest('heatwave')">
        🌡️ Simulate HEATWAVE (Temp > 40°C)
      </button>
      <button class="btn btn-flood btn-full" id="btn-flood" onclick="fireTest('flood')">
        🌊 Simulate FLOOD RISK (Rain+Soil+Humid)
      </button>
      <button class="btn btn-cyc btn-full" id="btn-cyc" onclick="fireTest('cyclone')">
        🌀 Simulate CYCLONE CONDITIONS
      </button>
      <button class="btn btn-full" style="background:linear-gradient(135deg,#1a3a00,#0a1a00);color:#00e5a0;border:1px solid #00e5a033"
              onclick="fireAll()">
        ⚡ Fire ALL Simultaneously
      </button>

      <!-- Siren test -->
      <div id="siren-bar">
        <span style="font-size:1.1rem">🔊</span>
        <div style="flex:1">
          <div style="font-size:.78rem;font-weight:700;color:var(--txt1)">Browser Siren Test</div>
          <div style="font-size:.6rem;color:var(--txt3)">Test sound in current browser (no ESP32 needed)</div>
        </div>
        <div class="btn-row">
          <button class="btn" style="padding:6px 12px;font-size:.68rem;background:rgba(255,100,0,.1);color:#ff6600;border:1px solid #ff660033"
                  onclick="playHeat()">🌡️</button>
          <button class="btn" style="padding:6px 12px;font-size:.68rem;background:rgba(0,136,255,.1);color:#0088ff;border:1px solid #0088ff33"
                  onclick="playFlood()">🌊</button>
        </div>
      </div>

      <div class="btn-row">
        <button class="btn btn-clear" onclick="clearTest()">🗑️ Clear Test Node</button>
        <button class="btn btn-clear" onclick="checkQueue()">📬 Email Queue</button>
      </div>
    </div>
  </div>

  <!-- RIGHT PANEL — Results -->
  <div style="display:flex;flex-direction:column;gap:14px">
    <!-- Status header -->
    <div class="card" style="padding:14px 18px">
      <div style="display:flex;align-items:center;gap:12px">
        <span id="status-dot" class="status-dot dot-warn"></span>
        <div style="flex:1">
          <div id="status-title" style="font-size:.88rem;font-weight:700;color:var(--txt1)">Ready to test</div>
          <div id="status-sub" style="font-size:.65rem;color:var(--txt3);margin-top:2px">
            Configure sensor values → click Fire Test → watch client.html for siren
          </div>
        </div>
        <div id="status-time" style="font-family:'JetBrains Mono',monospace;font-size:.6rem;color:var(--txt3)"></div>
      </div>
    </div>

    <!-- Log -->
    <div class="card" style="flex:1;overflow:hidden;display:flex;flex-direction:column">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
        <h2 style="margin:0">📋 Test Results Log</h2>
        <button onclick="clearLog()" style="margin-left:auto;background:none;border:1px solid var(--border);
                border-radius:5px;color:var(--txt3);cursor:pointer;font-size:.62rem;padding:2px 8px">Clear</button>
      </div>
      <div id="result-panel">
        <div class="empty"><span class="empty-icon">🧪</span>No tests run yet</div>
      </div>
    </div>
  </div>
</main>

<script>
/* ── IST Clock ─────────────────────────────────────────────────── */
(function(){
  const fmt = new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',
      hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true});
  function tick(){
    const el = document.getElementById('top-clock');
    if(el) el.textContent = fmt.format(new Date()) + ' IST';
  }
  tick(); setInterval(tick,1000);
})();

/* ── Detection Math (mirrors PHP) ─────────────────────────────── */
function getValues(){
  return {
    temp : parseFloat(document.getElementById('sl-temp').value),
    hum  : parseInt(document.getElementById('sl-hum').value),
    rain : parseInt(document.getElementById('sl-rain').value),
    soil : parseInt(document.getElementById('sl-soil').value),
  };
}
function calcDetect(v){
  const soilPct  = Math.max(0,Math.min(100,(4095-v.soil)/4095*100));
  const rainHeavy= v.rain < 1200;
  const soilSat  = soilPct >= 70;
  const humHigh  = v.hum  >= 80;
  const isHeat   = v.temp >= 40;
  const isFlood  = rainHeavy && soilSat && humHigh;
  const isCyc    = rainHeavy && v.hum >= 85;
  const heatR    = isHeat  ? Math.min(1,(v.temp-40)/10+0.35) : Math.max(0,(v.temp-35)/10);
  const floodR   = isFlood ? 0.85 : (rainHeavy ? 0.50 : (soilSat ? 0.30 : 0.10));
  const cycR     = isCyc   ? 0.75 : (rainHeavy ? 0.35 : 0.05);
  const rainStr  = v.rain<800?'HEAVY':v.rain<2200?'MODERATE':v.rain<3200?'LIGHT':'DRY';
  return {isHeat,isFlood,isCyc,heatR,floodR,cycR,soilPct,rainStr};
}

function updatePreview(){
  const v=getValues(), d=calcDetect(v);
  const tags=[];
  if(d.isHeat)  tags.push('<span style="color:#ff6600;font-weight:700">🌡️ HEATWAVE</span>');
  if(d.isFlood) tags.push('<span style="color:#0088ff;font-weight:700">🌊 FLOOD RISK</span>');
  if(d.isCyc)   tags.push('<span style="color:#cc44ff;font-weight:700">🌀 CYCLONE</span>');
  if(!tags.length) tags.push('<span style="color:rgba(180,210,255,.4)">✅ No threats detected</span>');
  document.getElementById('preview-body').innerHTML = tags.join(' &nbsp; ')
    +`<div style="font-size:.6rem;color:rgba(180,210,255,.4);margin-top:4px">
       Rain: ${d.rainStr} · Soil: ${d.soilPct.toFixed(0)}% · Hum: ${v.hum}%</div>`;

  document.getElementById('preview-bars').innerHTML = `
    ${bar('HEAT',  d.heatR,  d.heatR>=.35?'#ff6600':'#555')}
    ${bar('FLOOD', d.floodR, d.floodR>=.45?'#0088ff':'#555')}
    ${bar('CYCL',  d.cycR,   d.cycR>=.50?'#cc44ff':'#555')}`;
}
function bar(lbl,val,col){
  const p=Math.round(val*100);
  return `<div class="risk-row"><div class="risk-label">${lbl}</div>
  <div class="risk-track"><div class="risk-fill" style="width:${p}%;background:${col}"></div></div>
  <div class="risk-val" style="color:${col}">${p}%</div></div>`;
}
updatePreview();

/* ── Fire test ──────────────────────────────────────────────────── */
async function fireTest(type){
  const city = document.getElementById('sel-city').value;
  const v = getValues();
  const d = calcDetect(v);

  /* Adjust sliders for the specific type if not already triggering */
  if(type==='heatwave' && !d.isHeat){
    document.getElementById('sl-temp').value = 43.5;
    document.getElementById('vt').textContent = '43.5°C';
  }
  if(type==='flood' && !d.isFlood){
    document.getElementById('sl-rain').value = 700;
    document.getElementById('vr').textContent = '700';
    document.getElementById('sl-soil').value = 700;
    document.getElementById('vs').textContent = '700';
    document.getElementById('sl-hum').value = 85;
    document.getElementById('vh').textContent = '85%';
    updatePreview();
  }
  if(type==='cyclone' && !d.isCyc){
    document.getElementById('sl-rain').value = 700;
    document.getElementById('vr').textContent = '700';
    document.getElementById('sl-hum').value = 88;
    document.getElementById('vh').textContent = '88%';
    updatePreview();
  }

  await _post(city);
}

async function fireAll(){
  /* Set all thresholds crossed */
  document.getElementById('sl-temp').value=44;document.getElementById('vt').textContent='44°C';
  document.getElementById('sl-hum').value=88;document.getElementById('vh').textContent='88%';
  document.getElementById('sl-rain').value=700;document.getElementById('vr').textContent='700';
  document.getElementById('sl-soil').value=700;document.getElementById('vs').textContent='700';
  updatePreview();
  await _post(document.getElementById('sel-city').value);
}

async function _post(city){
  setStatus('running','Sending test alert to '+city+'…');
  ['btn-heat','btn-flood','btn-cyc'].forEach(id=>{
    const b=document.getElementById(id); if(b){b.disabled=true;}
  });
  const v = getValues();
  const fd = new FormData();
  fd.append('action','inject');
  fd.append('city',city);
  fd.append('temp',v.temp);
  fd.append('hum',v.hum);
  fd.append('rain',v.rain);
  fd.append('soil',v.soil);
  try{
    const r = await fetch('test.php',{method:'POST',body:fd});
    const d = await r.json();
    appendLog(d);
    if(d.ok){
      setStatus('ok','Test dispatched ✅ — Check client.html for siren');
      /* Also trigger siren locally for preview */
      const det=d.detected||[];
      if(det.find(x=>x.type==='heatwave')) setTimeout(playHeat,200);
      else if(det.find(x=>x.type==='flood')) setTimeout(playFlood,200);
    } else {
      setStatus('err','Error: '+(d.error||'unknown'));
    }
  }catch(e){
    setStatus('err','Network error: '+e.message);
    appendLog({ok:false,error:e.message,ist_time:_istNow()});
  }
  ['btn-heat','btn-flood','btn-cyc'].forEach(id=>{
    const b=document.getElementById(id); if(b){b.disabled=false;}
  });
}

function appendLog(d){
  const panel = document.getElementById('result-panel');
  /* Remove empty placeholder */
  const empty = panel.querySelector('.empty');
  if(empty) empty.remove();

  const det = (d.detected||[]);
  const dis = (d.dispatched||[]);
  const typeCls = det.length ? (det[0].type==='heatwave'?'heat':det[0].type==='flood'?'flood':'cyc') : '';

  const badgeHtml = det.map(x=>`<span class="log-badge ${x.type==='heatwave'?'heat':x.type==='flood'?'flood':'cyc'}">${x.type.toUpperCase()} ${x.sev}</span>`).join('');
  const emailRows = dis.slice(0,8).map(u=>`
    <div style="display:flex;align-items:center;gap:6px;padding:3px 0;border-top:1px solid rgba(0,212,255,.05)">
      <span class="${u.sent?'email-sent':'email-fail'}">${u.sent?'✅':'❌'}</span>
      <span style="font-size:.65rem;color:#e0eeff">${u.user}</span>
      <span style="font-size:.6rem;color:rgba(180,210,255,.35);font-family:monospace">${u.email}</span>
      <span class="log-badge ${u.type==='heatwave'?'heat':u.type==='flood'?'flood':'cyc'}" style="padding:1px 5px;font-size:.55rem">${u.type}</span>
    </div>`).join('');

  const readings = d.readings||{};
  const riskBars = `
    ${readings.heatwave_risk!=null?bar2('HEAT', readings.heatwave_risk, readings.heatwave_risk>=.35?'#ff6600':'#555'):''}
    ${readings.flood_risk!=null?bar2('FLOOD',readings.flood_risk,readings.flood_risk>=.45?'#0088ff':'#555'):''}`;

  const entry = document.createElement('div');
  entry.className = 'log-entry '+(d.ok?'ok':'err');
  entry.innerHTML = `
    <div class="log-ts">${d.ist_time||_istNow()}</div>
    <div style="margin-bottom:6px">
      ${badgeHtml}
      <span style="font-size:.72rem;color:#e0eeff;font-weight:600">${d.city||'—'}</span>
      ${d.node_id?`<span style="font-size:.6rem;color:rgba(180,210,255,.35);font-family:monospace;margin-left:4px">${d.node_id}</span>`:''}
    </div>
    ${readings.temperature!=null?`
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin-bottom:8px;font-size:.68rem">
      <div style="text-align:center;padding:4px;background:rgba(255,255,255,.03);border-radius:5px">
        <div style="font-weight:700;color:${readings.temperature>=40?'#ff1144':'#e0eeff'}">${parseFloat(readings.temperature).toFixed(1)}°C</div>
        <div style="font-size:.52rem;color:rgba(180,210,255,.35)">Temp</div>
      </div>
      <div style="text-align:center;padding:4px;background:rgba(255,255,255,.03);border-radius:5px">
        <div style="font-weight:700;color:#00aaff">${readings.humidity||'—'}%</div>
        <div style="font-size:.52rem;color:rgba(180,210,255,.35)">Humidity</div>
      </div>
      <div style="text-align:center;padding:4px;background:rgba(255,255,255,.03);border-radius:5px">
        <div style="font-weight:700;font-size:.62rem;color:${readings.rain_status==='HEAVY'?'#0088ff':'rgba(180,210,255,.6)'}">${readings.rain_status||'—'}</div>
        <div style="font-size:.52rem;color:rgba(180,210,255,.35)">Rain</div>
      </div>
      <div style="text-align:center;padding:4px;background:rgba(255,255,255,.03);border-radius:5px">
        <div style="font-weight:700;color:#e0eeff">${readings.soil_pct!=null?parseFloat(readings.soil_pct).toFixed(0)+'%':'—'}</div>
        <div style="font-size:.52rem;color:rgba(180,210,255,.35)">Soil</div>
      </div>
    </div>`:''}
    ${riskBars}
    ${det.length?`<div style="margin:7px 0 5px;font-size:.65rem;font-weight:700;color:#ff6600">
      ⚠️ Detected: ${det.map(x=>x.msg.slice(0,60)+'…').join(' | ')}</div>`:''}
    ${dis.length?`<div style="margin-top:6px;font-size:.62rem;font-weight:700;color:rgba(0,212,255,.55);margin-bottom:4px">
      📧 ${dis.filter(x=>x.sent).length}/${dis.length} emails sent</div>${emailRows}`
    :`<div style="margin-top:4px;font-size:.65rem;color:rgba(180,210,255,.3)">ℹ️ No users in city with alerts enabled</div>`}
    ${!d.ok?`<div style="color:#ff1144;font-size:.72rem;margin-top:4px">❌ ${d.error}</div>`:''}`;

  panel.prepend(entry);
}

function bar2(lbl,val,col){
  const p=Math.round((val||0)*100);
  return `<div class="risk-row"><div class="risk-label">${lbl}</div>
  <div class="risk-track"><div class="risk-fill" style="width:${p}%;background:${col}"></div></div>
  <div class="risk-val" style="color:${col}">${p}%</div></div>`;
}

async function clearTest(){
  const fd=new FormData(); fd.append('action','clear');
  const r=await fetch('test.php',{method:'POST',body:fd});
  const d=await r.json();
  setStatus(d.ok?'ok':'err', d.msg||d.error);
}

async function checkQueue(){
  const fd=new FormData(); fd.append('action','queue_status');
  const r=await fetch('test.php',{method:'POST',body:fd});
  const d=await r.json();
  const panel=document.getElementById('result-panel');
  const empty=panel.querySelector('.empty'); if(empty)empty.remove();
  const entry=document.createElement('div');
  entry.className='log-entry';
  entry.innerHTML=`<div class="log-ts">${_istNow()}</div>
    <div style="font-size:.7rem;font-weight:700;color:rgba(0,212,255,.6);margin-bottom:6px">📬 Email Queue (last 10)</div>
    ${(d.queue||[]).map(e=>`
    <div style="display:flex;gap:6px;align-items:center;padding:3px 0;border-top:1px solid rgba(0,212,255,.05);font-size:.64rem">
      <span style="color:${e.status==='sent'?'#00e5a0':e.status==='failed'?'#ff1144':'#ffaa00'}">${e.status==='sent'?'✅':e.status==='failed'?'❌':'⏳'}</span>
      <span style="color:#e0eeff;font-family:monospace">${e.to_email}</span>
      <span style="color:rgba(180,210,255,.35);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${e.subject}</span>
    </div>`).join('')||'<div style="color:rgba(180,210,255,.3);padding:8px 0">Queue empty</div>'}`;
  panel.prepend(entry);
}

/* ── Load city users ────────────────────────────────────────────── */
async function loadCityUsers(){
  const city = document.getElementById('sel-city').value;
  const fd=new FormData(); fd.append('action','get_users'); fd.append('city',city);
  try{
    const r=await fetch('test.php',{method:'POST',body:fd});
    const d=await r.json();
    const wrap=document.getElementById('city-users');
    const users=d.users||[];
    if(!users.length){
      wrap.innerHTML='<div style="font-size:.65rem;color:rgba(180,210,255,.3)">No registered users in '+city+'</div>';
      return;
    }
    wrap.innerHTML=users.slice(0,5).map(u=>{
      const ini=(u.name||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
      return `<div class="user-row">
        <div class="user-avatar">${ini}</div>
        <div style="flex:1;min-width:0">
          <div class="user-name">${u.name}<span class="badge ${u.is_verified?'badge-v':'badge-na'}">${u.is_verified?'✓ VER':'UNVERF'}</span>${u.alerts_enabled?'<span class="badge badge-a">🔔 ALERTS</span>':''}</div>
          <div class="user-email">${u.email}</div>
        </div>
      </div>`;
    }).join('');
    if(users.length>5) wrap.innerHTML+=`<div style="font-size:.6rem;color:rgba(180,210,255,.3);text-align:center;padding-top:4px">+${users.length-5} more</div>`;
  }catch(_){}
}
document.getElementById('sel-city').addEventListener('change', loadCityUsers);
loadCityUsers();

/* ── Siren sounds (Web Audio) ───────────────────────────────────── */
function playHeat(){
  try{
    const Ctx=window.AudioContext||window.webkitAudioContext; if(!Ctx)return;
    const ctx=new Ctx();
    const osc=ctx.createOscillator(), gain=ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type='sawtooth';
    const now=ctx.currentTime;
    for(let i=0;i<3;i++){
      const t=now+i*1.0;
      osc.frequency.setValueAtTime(400,t);
      osc.frequency.linearRampToValueAtTime(1200,t+0.7);
      osc.frequency.setValueAtTime(400,t+0.8);
      gain.gain.setValueAtTime(0.0001,t);
      gain.gain.linearRampToValueAtTime(0.2,t+0.05);
      gain.gain.setValueAtTime(0.2,t+0.65);
      gain.gain.linearRampToValueAtTime(0.0001,t+0.8);
    }
    osc.start(now); osc.stop(now+3.1);
    osc.onended=()=>ctx.close();
  }catch(_){}
}

function playFlood(){
  try{
    const Ctx=window.AudioContext||window.webkitAudioContext; if(!Ctx)return;
    const ctx=new Ctx();
    const now=ctx.currentTime;
    [[220,0],[440,.3],[220,.6],[440,.9],[220,1.2],[440,1.5]].forEach(([freq,t])=>{
      const o=ctx.createOscillator(), g=ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type='sine'; o.frequency.value=freq;
      g.gain.setValueAtTime(0.0001,now+t);
      g.gain.linearRampToValueAtTime(0.22,now+t+0.04);
      g.gain.exponentialRampToValueAtTime(0.0001,now+t+0.22);
      o.start(now+t); o.stop(now+t+0.25);
    });
    setTimeout(()=>ctx.close(),2500);
  }catch(_){}
}

/* ── Status helper ──────────────────────────────────────────────── */
function setStatus(st,msg){
  const dot=document.getElementById('status-dot');
  const title=document.getElementById('status-title');
  const sub=document.getElementById('status-sub');
  const time=document.getElementById('status-time');
  dot.className='status-dot '+(st==='ok'?'dot-ok':st==='err'?'dot-err':'dot-warn');
  title.textContent=msg;
  time.textContent=_istNow();
}

function clearLog(){
  document.getElementById('result-panel').innerHTML='<div class="empty"><span class="empty-icon">🧪</span>Log cleared</div>';
}

function _istNow(){
  return new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',
    hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true}).format(new Date())+' IST';
}
</script>
</body>
</html>
