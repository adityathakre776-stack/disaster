<?php
/**
 * iot_alert_dispatch.php
 *
 * Called internally from iot.php when ESP32 detects a real disaster.
 * Immediately dispatches:
 *  1. Browser alerts → inserts into user_alerts for all users in that city
 *  2. Email alerts   → queues/sends via mailer.php
 *
 * Only fires if threshold crossed AND not already fired in last 30 min
 * (de-duplication per node per disaster type).
 */

require_once __DIR__ . '/mailer.php';

/**
 * Main dispatch function.
 *
 * @param PDO    $pdo
 * @param string $nodeId    e.g. "DICC-01"
 * @param string $city      e.g. "Nagpur"
 * @param float  $nodeLat
 * @param float  $nodeLon
 * @param array  $detected  [['type'=>'heatwave','severity'=>'HIGH','risk'=>0.7], ...]
 * @param array  $readings  ['temperature'=>42, 'humidity'=>55, ...]
 */
function iotDispatchAlerts(
    PDO    $pdo,
    string $nodeId,
    string $city,
    float  $nodeLat,
    float  $nodeLon,
    array  $detected,
    array  $readings
): void {
    if (empty($detected) || !$city) return;

    $now = time();

    foreach ($detected as $d) {
        $type = $d['type']     ?? 'unknown';
        $sev  = $d['severity'] ?? 'MEDIUM';
        $risk = (float)($d['risk'] ?? 0.5);

        /* De-duplicate: max once per 30 minutes per node per type */
        $dedupKey = "iot_{$type}_{$nodeId}";
        $dup = $pdo->prepare(
            "SELECT id FROM user_alerts WHERE node_id = ? AND disaster_type = ? AND sent_at > ? LIMIT 1"
        );
        $dup->execute([$dedupKey, $type, $now - 1800]);
        if ($dup->fetch()) continue; /* already sent in last 30 min */

        /* Build alert message */
        $icons   = ['flood'=>'🌊','heatwave'=>'🌡️','cyclone'=>'🌀','earthquake'=>'🌍'];
        $icon    = $icons[$type] ?? '⚡';
        $reading = _readingSummary($type, $readings);
        $message = "{$icon} {$type} DETECTED by IoT node in {$city}. "
                 . "{$reading} "
                 . "Severity: {$sev}. ESP32 Node: {$nodeId}. Stay alert.";

        /* Find verified users in that city with alerts enabled */
        $users = $pdo->prepare("
            SELECT id, name, email, latitude, longitude, city
            FROM users
            WHERE alerts_enabled = 1
              AND is_verified = 1
              AND city LIKE ?
        ");
        $users->execute(['%' . $city . '%']);
        $recipients = $users->fetchAll(PDO::FETCH_ASSOC);

        $emailsSent = 0;
        foreach ($recipients as $u) {
            /* Distance from node to user */
            $km = _hav(
                (float)$u['latitude'], (float)$u['longitude'],
                $nodeLat, $nodeLon
            );

            $zone = $km <= 5 ? 'HIGH' : ($km <= 10 ? 'MEDIUM' : 'LOW');
            $userMsg = "{$icon} {$type} alert for {$city}. "
                     . "{$reading} "
                     . "Node {$nodeId} is {$km}km from you. Risk: {$zone}.";

            /* Insert user_alerts (browser notification) */
            $pdo->prepare("
                INSERT INTO user_alerts
                    (user_id, disaster_type, severity, distance_km, message, node_id, lat, lon, sent_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ")->execute([
                $u['id'], $type, $zone, round($km, 1),
                $userMsg, $dedupKey,
                $nodeLat, $nodeLon, $now,
            ]);

            /* Email alert */
            if ($emailsSent < 50) { /* cap per dispatch */
                $emailBody = _buildIotAlertEmail($u['name'], $city, $type, $icon, $reading, round($km, 1), $zone, $nodeId);
                sendEmail($u['email'], "{$icon} DICC IoT Alert: " . ucfirst($type) . " in {$city}", $emailBody, $pdo);
                $emailsSent++;
            }
        }

        error_log("[IoT Dispatch] {$type} in {$city} → {$emailsSent} users alerted via node {$nodeId}");
    }
}

/* ── Reading summary for alert message ─────────────────────────── */
function _readingSummary(string $type, array $r): string {
    $temp = isset($r['temperature'])    ? round($r['temperature'], 1) . '°C' : null;
    $hum  = isset($r['humidity'])       ? round($r['humidity']) . '% humidity'  : null;
    $rain = $r['rain_status']           ?? null;
    $soil = isset($r['soil_moisture_pct']) ? round($r['soil_moisture_pct']) . '% soil' : null;

    if ($type === 'heatwave') return $temp ? "Temperature: {$temp}." : '';
    if ($type === 'flood')    return implode(', ', array_filter([$rain ? "Rain: {$rain}" : null, $soil, $hum])) . '.';
    if ($type === 'cyclone')  return implode(', ', array_filter([$rain ? "Rain: {$rain}" : null, $hum])) . '.';
    return '';
}

/* ── HTML email for IoT alerts ──────────────────────────────────── */
function _buildIotAlertEmail(
    string $name, string $city, string $type, string $icon,
    string $reading, float $km, string $zone, string $nodeId
): string {
    $zoneColor = $zone === 'HIGH' ? '#ff1144' : ($zone === 'MEDIUM' ? '#ff6600' : '#ffaa00');
    $typeUC    = strtoupper($type);
    $cityUC    = htmlspecialchars($city);

    return '<!DOCTYPE html>
<html>
<head><meta charset="UTF-8">
<style>
  body { margin:0;padding:0;background:#080e1f;font-family:Arial,sans-serif;color:#e0eeff; }
  .wrap { max-width:560px;margin:0 auto;background:#0d1a38;border-radius:12px;overflow:hidden;border:1px solid #1a3060; }
  .hdr  { background:linear-gradient(135deg,#0d1a38,#0a2040);padding:28px 24px;text-align:center;border-bottom:1px solid #1a3060; }
  .hdrico { font-size:3rem; }
  .hdrtitle { font-size:1.4rem;font-weight:700;color:#00d4ff;margin:8px 0 4px; }
  .hdrsub { font-size:.85rem;color:rgba(180,210,255,.5); }
  .body { padding:24px; }
  .badge { display:inline-block;padding:4px 14px;border-radius:20px;font-size:.78rem;font-weight:700;
           background:rgba(255,17,68,.12);border:1px solid rgba(255,17,68,.3); }
  .info-row { display:flex;align-items:flex-start;gap:10px;margin:12px 0;padding:12px;
              background:rgba(0,0,0,.2);border-radius:8px;border-left:3px solid #00d4ff; }
  .info-label { font-size:.72rem;color:rgba(180,210,255,.5);margin-bottom:3px; }
  .info-val { font-size:.9rem;font-weight:600;color:#e0eeff; }
  .zone-box { text-align:center;padding:16px;margin:16px 0;border-radius:8px;
              background:rgba(255,17,68,.08);border:1px solid rgba(255,17,68,.2); }
  .zone-label { font-size:1.1rem;font-weight:700; }
  .footer { font-size:.72rem;color:rgba(180,210,255,.3);text-align:center;padding:16px;
            border-top:1px solid #1a3060; }
  .btn { display:inline-block;margin-top:14px;padding:10px 24px;background:#00d4ff;
         color:#080e1f;font-weight:700;border-radius:8px;text-decoration:none;font-size:.85rem; }
</style>
</head>
<body>
<div class="wrap">
  <div class="hdr">
    <div class="hdrico">' . $icon . '</div>
    <div class="hdrtitle">IoT ' . $typeUC . ' Alert — ' . $cityUC . '</div>
    <div class="hdrsub">Real-time ESP32 Sensor Detection &bull; DICC India</div>
  </div>
  <div class="body">
    <p>Dear <strong>' . htmlspecialchars($name) . '</strong>,</p>
    <p>Our ESP32 IoT sensor node deployed in <strong>' . $cityUC . '</strong> has detected
    <strong>' . $typeUC . '</strong> conditions. Please take precautionary measures.</p>

    <div class="info-row">
      <div>
        <div class="info-label">Sensor Reading</div>
        <div class="info-val">' . htmlspecialchars($reading) . '</div>
      </div>
    </div>
    <div class="info-row">
      <div>
        <div class="info-label">Distance from node</div>
        <div class="info-val">' . $km . ' km from your registered location</div>
      </div>
    </div>
    <div class="info-row">
      <div>
        <div class="info-label">Node ID</div>
        <div class="info-val" style="font-family:monospace">' . htmlspecialchars($nodeId) . '</div>
      </div>
    </div>

    <div class="zone-box">
      <div class="info-label">Your Risk Zone</div>
      <div class="zone-label" style="color:' . $zoneColor . '">' . $zone . ' RISK</div>
    </div>

    <div style="background:rgba(0,212,255,.05);border-radius:8px;padding:14px;margin-top:8px">
      <strong style="color:#00d4ff">Safety Advice:</strong><br>
      ' . _safetyAdvice($type) . '
    </div>

    <div style="text-align:center">
      <a href="http://localhost/Multidisaster/client.html" class="btn">Open My Dashboard</a>
    </div>
  </div>
  <div class="footer">
    Disaster Intelligence Command Centre (DICC) India &bull; IoT Alert System<br>
    You receive this because your alerts are enabled. <em>Stay safe.</em>
  </div>
</div>
</body></html>';
}

function _safetyAdvice(string $type): string {
    $advice = [
        'heatwave'  => 'Stay indoors between 11am–4pm. Drink water frequently. Avoid direct sun exposure. Check on elderly neighbours.',
        'flood'     => 'Avoid low-lying areas and flooded roads. Move valuables to higher ground. Follow local authority advisories.',
        'cyclone'   => 'Secure loose outdoor objects. Stay indoors away from windows. Keep emergency kit ready.',
        'earthquake'=> 'Drop, Cover, and Hold On. Stay away from windows. After shaking, check for gas leaks.',
    ];
    return $advice[$type] ?? 'Follow local emergency guidelines. Stay safe.';
}

function _hav(float $lat1, float $lon1, float $lat2, float $lon2): float {
    $R = 6371; $r = M_PI / 180;
    $a = sin(($lat2-$lat1)*$r/2)**2 + cos($lat1*$r)*cos($lat2*$r)*sin(($lon2-$lon1)*$r/2)**2;
    return $R * 2 * atan2(sqrt($a), sqrt(1-$a));
}
