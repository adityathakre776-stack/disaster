<?php
/**
 * iot.php — ESP32 IoT Node REST Endpoint
 * POST  → ESP32 sends sensor readings (rain, DHT11, soil moisture)
 * GET   → Dashboard fetches live node list + latest readings
 * POST /api/iot.php?sync=1 → Bulk offline sync from SPIFFS buffer
 */

header('Content-Type: application/json; charset=UTF-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-API-Key');

require_once __DIR__ . '/db.php';

$method = $_SERVER['REQUEST_METHOD'];
if ($method === 'OPTIONS') { http_response_code(200); exit; }

/* ============================================================
   POST — Receive ESP32 sensor payload
   JSON body: {
     api_key, node_id, name?, city?, state?, lat, lon, firmware?,
     temperature, humidity,
     rain_sensor  (ADC 0-4095, lower = wetter),
     soil_moisture (ADC 0-4095, lower = wetter),
     wind_speed?  (m/s, optional from anemometer)
   }
============================================================ */
if ($method === 'POST') {
    $isBulkSync = isset($_GET['sync']);
    $raw  = file_get_contents('php://input');
    $data = $raw ? json_decode($raw, true) : null;

    if (!$data) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid JSON']); exit;
    }

    /* Auth */
    $key = $data['api_key'] ?? ($_SERVER['HTTP_X_API_KEY'] ?? '');
    if ($key !== IOT_API_KEY) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthorized']); exit;
    }

    $pdo = getDB();
    if (!$pdo) {
        http_response_code(503);
        echo json_encode(['error' => 'DB unavailable']); exit;
    }

    /* Bulk offline sync: array of readings */
    if ($isBulkSync && isset($data['readings']) && is_array($data['readings'])) {
        $nodeId = _sanitizeId($data['node_id'] ?? '');
        _upsertNode($pdo, $nodeId, $data);
        $inserted = 0;
        foreach ($data['readings'] as $r) {
            $r['node_id'] = $nodeId;
            _insertReading($pdo, $r);
            $inserted++;
        }
        echo json_encode(['ok' => true, 'synced' => $inserted]);
        exit;
    }

    /* Single real-time reading */
    if (!isset($data['node_id'])) {
        http_response_code(400);
        echo json_encode(['error' => 'node_id required']); exit;
    }

    $nodeId = _sanitizeId($data['node_id']);
    _upsertNode($pdo, $nodeId, $data);
    $result = _insertReading($pdo, $data);

    /* Smart city assignment: tell the ESP32 which city it's serving */
    $assignedCity = _getAssignedCity($pdo, $nodeId);

    /* Immediately dispatch alerts to users in the node's city */
    if (!empty($result['detected'])) {
        require_once __DIR__ . '/iot_alert_dispatch.php';
        iotDispatchAlerts(
            $pdo,
            $nodeId,
            $data['city'] ?? ($assignedCity['city'] ?? ''),
            (float)($data['lat'] ?? 0),
            (float)($data['lon'] ?? 0),
            $result['detected'],
            $result['readings']
        );
    }

    echo json_encode([
        'ok'             => true,
        'node_id'        => $nodeId,
        'received_at'    => time(),
        'detected'       => $result['detected'],
        'readings'       => $result['readings'],
        'assigned_city'  => $assignedCity['city']       ?? null,
        'assigned_users' => $assignedCity['user_count']  ?? 0,
    ]);
    exit;
}




/* ============================================================
   GET — Return live node data for IoT dashboard
============================================================ */
if ($method === 'GET') {
    $pdo = getDB();
    if (!$pdo) {
        echo json_encode(['nodes' => [], 'offline' => [], 'error' => 'DB unavailable']);
        exit;
    }

    $now = time();

    /* Online nodes: seen in last 5 minutes */
    $online = $pdo->query("
        SELECT n.id, n.name, n.city, n.state, n.lat, n.lon, n.status, n.last_seen, n.firmware,
               r.temperature, r.humidity,
               r.rain_sensor, r.rain_status,
               r.soil_moisture_pct,
               r.flood_risk, r.heatwave_risk, r.cyclone_risk,
               r.timestamp AS last_reading
        FROM iot_nodes n
        LEFT JOIN sensor_readings r ON r.id = (
            SELECT id FROM sensor_readings WHERE node_id = n.id ORDER BY timestamp DESC LIMIT 1
        )
        WHERE n.last_seen > {$now} - 300
        ORDER BY n.last_seen DESC
    ")->fetchAll(PDO::FETCH_ASSOC);

    /* Offline nodes: seen in last 24h but not in 5 min */
    $offline = $pdo->query("
        SELECT id, name, city, state, lat, lon, last_seen
        FROM iot_nodes
        WHERE last_seen <= {$now} - 300 AND last_seen > {$now} - 86400
        ORDER BY last_seen DESC
    ")->fetchAll(PDO::FETCH_ASSOC);

    /* Active IoT alerts */
    $alerts = $pdo->query("
        SELECT id, type, severity, risk_score, lat, lon, label, node_id, event_time
        FROM disaster_events
        WHERE source = 'esp32' AND active = 1 AND fetched_at > {$now} - 3600
        ORDER BY risk_score DESC LIMIT 20
    ")->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode([
        'nodes'     => $online,
        'offline'   => $offline,
        'alerts'    => $alerts,
        'generated' => $now,
    ]);
    exit;
}

/* ============================================================
   HELPER FUNCTIONS
============================================================ */

/**
 * Smart city assignment: find which city has the most registered users
 * and return the top city that is not already served by another node,
 * OR the top city overall if only one node exists.
 */
function _getAssignedCity(PDO $pdo, string $nodeId): array {
    /* Count registered (verified) users per city */
    $cities = $pdo->query("
        SELECT city, COUNT(*) AS user_count
        FROM users
        WHERE city IS NOT NULL AND city != '' AND is_verified = 1
        GROUP BY city
        ORDER BY user_count DESC
        LIMIT 10
    ")->fetchAll(PDO::FETCH_ASSOC);

    if (!$cities) return [];

    /* Find how many nodes are registered */
    $allNodes = $pdo->query("
        SELECT id FROM iot_nodes ORDER BY last_seen DESC
    ")->fetchAll(PDO::FETCH_COLUMN);

    /* Assign city by node index (round-robin by last-seen order) */
    $idx = array_search($nodeId, $allNodes);
    if ($idx === false) $idx = 0;
    $cityIdx = $idx % count($cities);
    return $cities[$cityIdx];
}

function _sanitizeId(string $raw): string {

    return substr(preg_replace('/[^A-Z0-9\-]/', '', strtoupper($raw)), 0, 20);
}

function _upsertNode(PDO $pdo, string $nodeId, array $data): void {
    $ts = time();
    $pdo->prepare("
        INSERT INTO iot_nodes (id, name, city, state, lat, lon, firmware, last_seen, status)
        VALUES (:id, :name, :city, :state, :lat, :lon, :fw, :ts, 'online')
        ON DUPLICATE KEY UPDATE
            last_seen = :ts2, status = 'online',
            name  = COALESCE(NULLIF(:name2,  ''), name),
            city  = COALESCE(NULLIF(:city2,  ''), city),
            state = COALESCE(NULLIF(:state2, ''), state)
    ")->execute([
        ':id'     => $nodeId,
        ':name'   => substr($data['name']  ?? $nodeId, 0, 100),
        ':city'   => substr($data['city']  ?? '', 0, 100),
        ':state'  => substr($data['state'] ?? '', 0, 100),
        ':lat'    => (float)($data['lat']  ?? 0),
        ':lon'    => (float)($data['lon']  ?? 0),
        ':fw'     => substr($data['firmware'] ?? '1.0', 0, 20),
        ':ts'     => $ts, ':ts2'  => $ts,
        ':name2'  => substr($data['name']  ?? '', 0, 100),
        ':city2'  => substr($data['city']  ?? '', 0, 100),
        ':state2' => substr($data['state'] ?? '', 0, 100),
    ]);
}

function _insertReading(PDO $pdo, array $data): array {
    $nodeId   = _sanitizeId($data['node_id'] ?? '');
    $ts       = isset($data['timestamp']) ? (int)$data['timestamp'] : time();
    $temp     = (float)($data['temperature']  ?? 0);
    $humidity = (float)($data['humidity']     ?? 0);
    $rainRaw  = (int)($data['rain_sensor']    ?? 4095); /* 0=soaked, 4095=dry */
    $soilRaw  = (int)($data['soil_moisture']  ?? 4095); /* 0=soaked, 4095=dry */
    $windSpd  = (float)($data['wind_speed']   ?? 0);

    /* Derived */
    $soilPct    = round(max(0, min(100, (4095 - $soilRaw) / 4095 * 100)), 1);
    $rainStatus = _rainStatus($rainRaw);

    /* Risk scores (0.0 → 1.0) */
    $floodRisk    = _floodRisk($rainRaw, $soilPct, $humidity);
    $heatwaveRisk = _heatwaveRisk($temp);
    $cycloneRisk  = _cycloneRisk($rainRaw, $humidity, $windSpd);

    $pdo->prepare("
        INSERT INTO sensor_readings
            (node_id, timestamp, temperature, humidity,
             rain_sensor, rain_status, soil_moisture, soil_moisture_pct,
             flood_risk, heatwave_risk, cyclone_risk)
        VALUES
            (:nid, :ts, :temp, :hum,
             :rain, :rst,  :soil, :spct,
             :fr,   :hr,   :cr)
    ")->execute([
        ':nid'  => $nodeId, ':ts'  => $ts,
        ':temp' => $temp,   ':hum' => $humidity,
        ':rain' => $rainRaw, ':rst' => $rainStatus,
        ':soil' => $soilRaw, ':spct' => $soilPct,
        ':fr'   => $floodRisk, ':hr' => $heatwaveRisk, ':cr' => $cycloneRisk,
    ]);

    /* Persist disaster events if over threshold */
    $lat = (float)($data['lat'] ?? 0);
    $lon = (float)($data['lon'] ?? 0);
    $detected = [];

    if ($floodRisk >= 0.45) {
        $sev = $floodRisk >= 0.80 ? 'CRITICAL' : ($floodRisk >= 0.60 ? 'HIGH' : 'MEDIUM');
        _upsertEvent($pdo, "flood_{$nodeId}", 'flood', $sev, $floodRisk, $lat, $lon,
            "Flood conditions at node {$nodeId}", null, $nodeId, $ts);
        $detected[] = ['type' => 'flood', 'severity' => $sev, 'risk' => $floodRisk];
    } else {
        /* Clear stale flood event if conditions improved */
        $pdo->prepare("UPDATE disaster_events SET active=0 WHERE id=?")->execute(["flood_{$nodeId}"]);
    }

    if ($heatwaveRisk >= 0.35) {
        $sev = $heatwaveRisk >= 0.80 ? 'CRITICAL' : ($heatwaveRisk >= 0.60 ? 'HIGH' : 'MEDIUM');
        _upsertEvent($pdo, "heatwave_{$nodeId}", 'heatwave', $sev, $heatwaveRisk, $lat, $lon,
            "{$temp}°C heatwave at node {$nodeId}", null, $nodeId, $ts);
        $detected[] = ['type' => 'heatwave', 'severity' => $sev, 'risk' => $heatwaveRisk];
    } else {
        $pdo->prepare("UPDATE disaster_events SET active=0 WHERE id=?")->execute(["heatwave_{$nodeId}"]);
    }

    if ($cycloneRisk >= 0.50) {
        $sev = $cycloneRisk >= 0.75 ? 'HIGH' : 'MEDIUM';
        _upsertEvent($pdo, "cyclone_{$nodeId}", 'cyclone', $sev, $cycloneRisk, $lat, $lon,
            "Cyclone conditions at node {$nodeId}", null, $nodeId, $ts);
        $detected[] = ['type' => 'cyclone', 'severity' => $sev, 'risk' => $cycloneRisk];
    } else {
        $pdo->prepare("UPDATE disaster_events SET active=0 WHERE id=?")->execute(["cyclone_{$nodeId}"]);
    }

    return [
        'detected' => $detected,
        'readings' => [
            'temperature'    => $temp,
            'humidity'       => $humidity,
            'rain_status'    => $rainStatus,
            'soil_pct'       => $soilPct,
            'flood_risk'     => $floodRisk,
            'heatwave_risk'  => $heatwaveRisk,
            'cyclone_risk'   => $cycloneRisk,
        ],
    ];
}

/* Risk scoring functions */
function _rainStatus(int $raw): string {
    if ($raw < 800)  return 'HEAVY';
    if ($raw < 2000) return 'MODERATE';
    if ($raw < 3200) return 'LIGHT';
    return 'DRY';
}

function _floodRisk(int $rainRaw, float $soilPct, float $humidity): float {
    $r = max(0.0, (3200 - $rainRaw) / 3200);        /* rain contribution  */
    $s = $soilPct / 100.0;                           /* soil saturation    */
    $h = max(0.0, ($humidity - 60.0) / 40.0);        /* humidity ≥60% adds */
    return round(min(1.0, $r * 0.40 + $s * 0.40 + $h * 0.20), 3);
}

function _heatwaveRisk(float $temp): float {
    if ($temp < 38) return 0.0;
    return round(min(1.0, ($temp - 38.0) / 12.0), 3); /* 38°C→0, 50°C→1 */
}

function _cycloneRisk(int $rainRaw, float $humidity, float $wind): float {
    $r = max(0.0, (2500 - $rainRaw) / 2500);
    $h = max(0.0, ($humidity - 70.0) / 30.0);
    $w = min(1.0, $wind / 28.0);                     /* 28 m/s = storm force */
    return round(min(1.0, $r * 0.30 + $h * 0.35 + $w * 0.35), 3);
}

function _upsertEvent(PDO $pdo, string $id, string $type, string $sev,
                      float $score, float $lat, float $lon,
                      string $label, ?float $mag, string $nodeId, int $ts): void {
    $pdo->prepare("
        INSERT INTO disaster_events
            (id, type, source, severity, risk_score, lat, lon, label, magnitude, node_id, event_time, fetched_at, active)
        VALUES
            (:id,:type,'esp32',:sev,:score,:lat,:lon,:lbl,:mag,:nid,:ts,:ts2,1)
        ON DUPLICATE KEY UPDATE
            severity=:sev2, risk_score=:score2, fetched_at=:ts3, active=1
    ")->execute([
        ':id'     => $id,    ':type'   => $type,  ':sev'   => $sev,
        ':score'  => $score, ':lat'    => $lat,   ':lon'   => $lon,
        ':lbl'    => $label, ':mag'    => $mag,   ':nid'   => $nodeId,
        ':ts'     => $ts,    ':ts2'    => $ts,
        ':sev2'   => $sev,   ':score2' => $score, ':ts3'   => $ts,
    ]);
}
