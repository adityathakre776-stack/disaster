<?php
/**
 * iot_dashboard.php
 * GET  → admin IoT status widget data
 *   ?action=status    → node list + city assignment summary
 *   ?action=assign    → force recalculate city→node assignment
 *   ?city=Nagpur      → registered clients for that city
 */

header('Content-Type: application/json; charset=UTF-8');
header('Access-Control-Allow-Origin: *');

require_once __DIR__ . '/db.php';

session_start();
/* Restrict to admin only if session active; allow API key fallback */
// (light check — full guard is auth_guard.js on frontend)

$pdo = getDB();
if (!$pdo) {
    echo json_encode(['error' => 'DB unavailable']); exit;
}

$action = $_GET['action'] ?? 'status';
$now    = time();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

/* ============================================================
   POST — shift node to new city
============================================================ */
if ($method === 'POST' && $action === 'shift') {
    $raw  = file_get_contents('php://input');
    $body = $raw ? json_decode($raw, true) : null;
    $city = trim($body['city'] ?? '');
    $lat  = (float)($body['lat'] ?? 0);
    $lon  = (float)($body['lon'] ?? 0);

    if ($city && $pdo) {
        /* Update the most-recently-seen node with the new city */
        $pdo->prepare("
            UPDATE iot_nodes SET city=?, lat=?, lon=?, last_seen=?
            WHERE id = (SELECT id FROM (SELECT id FROM iot_nodes ORDER BY last_seen DESC LIMIT 1) AS t)
        ")->execute([$city, $lat, $lon, $now]);
        echo json_encode(['ok' => true, 'city' => $city]);
    } else {
        echo json_encode(['ok' => false, 'error' => 'missing city']);
    }
    exit;
}


/* ============================================================
   STATUS — node list + city user counts + smart assignment
============================================================ */
if ($action === 'status' || !$action) {

    /* Online nodes (seen in last 5 min) */
    $nodes = $pdo->query("
        SELECT n.id, n.name, n.city, n.state, n.lat, n.lon, n.status, n.last_seen, n.firmware,
               r.temperature, r.humidity, r.rain_status, r.soil_moisture_pct,
               r.flood_risk, r.heatwave_risk, r.cyclone_risk,
               r.timestamp AS last_reading
        FROM iot_nodes n
        LEFT JOIN sensor_readings r ON r.id = (
            SELECT id FROM sensor_readings WHERE node_id = n.id ORDER BY timestamp DESC LIMIT 1
        )
        ORDER BY n.last_seen DESC
    ")->fetchAll(PDO::FETCH_ASSOC);

    /* Mark online/offline */
    foreach ($nodes as &$n) {
        $n['online'] = ($n['last_seen'] >= $now - 300);
        $n['ago'] = $n['last_seen'] ? ($now - $n['last_seen']) : null;
    }
    unset($n);

    /* City user counts — top cities by registration */
    $cityCounts = $pdo->query("
        SELECT city, COUNT(*) AS user_count,
               AVG(latitude)  AS avg_lat,
               AVG(longitude) AS avg_lon
        FROM users
        WHERE city IS NOT NULL AND city != '' AND is_verified = 1
        GROUP BY city
        ORDER BY user_count DESC
        LIMIT 10
    ")->fetchAll(PDO::FETCH_ASSOC);

    /* City assignment: top N cities get an IoT node assigned */
    $onlineNodesCount = count(array_filter($nodes, fn($n) => $n['online']));
    $allNodesCount    = count($nodes);
    $assignments      = _calcAssignments($pdo, $cityCounts, $nodes);

    /* Summary counts */
    $totalUsers = (int)$pdo->query("SELECT COUNT(*) FROM users WHERE is_verified=1")->fetchColumn();

    echo json_encode([
        'nodes'        => $nodes,
        'online_count' => $onlineNodesCount,
        'total_nodes'  => $allNodesCount,
        'city_counts'  => $cityCounts,
        'assignments'  => $assignments,
        'total_users'  => $totalUsers,
        'generated'    => $now,
        'server_unix'  => $now,
        'server_ist'   => date('h:i:s A', $now + 19800) . ' IST',  /* UTC+5:30 */
    ]);
    exit;
}

/* ============================================================
   CLIENTS — registered users in a given city
============================================================ */
if ($action === 'clients') {
    $city = trim($_GET['city'] ?? '');
    if (!$city) { echo json_encode(['clients' => []]); exit; }

    $stmt = $pdo->prepare("
        SELECT id, name, city, latitude, longitude,
               alerts_enabled, is_verified, created_at
        FROM users
        WHERE city LIKE ? AND role = 'user'
        ORDER BY created_at DESC
        LIMIT 50
    ");
    $stmt->execute(['%' . $city . '%']);
    $clients = $stmt->fetchAll(PDO::FETCH_ASSOC);

    /* Remove any sensitive data */
    foreach ($clients as &$c) { unset($c['password_hash'], $c['otp']); }

    echo json_encode(['clients' => $clients, 'city' => $city]);
    exit;
}

/* ============================================================
   ASSIGN — returns recommended city per node
============================================================ */
if ($action === 'assign') {
    $cityCounts  = $pdo->query("
        SELECT city, COUNT(*) AS user_count, AVG(latitude) AS avg_lat, AVG(longitude) AS avg_lon
        FROM users WHERE city IS NOT NULL AND city != '' AND is_verified=1
        GROUP BY city ORDER BY user_count DESC LIMIT 10
    ")->fetchAll(PDO::FETCH_ASSOC);

    $nodes       = $pdo->query("SELECT id, city, lat, lon FROM iot_nodes")->fetchAll(PDO::FETCH_ASSOC);
    $assignments = _calcAssignments($pdo, $cityCounts, $nodes);

    echo json_encode(['assignments' => $assignments, 'city_counts' => $cityCounts]);
    exit;
}

/* ============================================================
   HELPER — Smart city assignment algorithm
   Rule: top cities by user count → assign available nodes in order
============================================================ */
function _calcAssignments(PDO $pdo, array $cityCounts, array $nodes): array {
    $assignments = [];
    $nodeIds     = array_column($nodes, 'id');
    $used        = [];

    foreach ($cityCounts as $i => $cc) {
        $city    = $cc['city'];
        $cnt     = (int)$cc['user_count'];
        $avgLat  = (float)$cc['avg_lat'];
        $avgLon  = (float)$cc['avg_lon'];

        /* Find nearest unassigned online node */
        $best = null; $bestDist = PHP_INT_MAX;
        foreach ($nodes as $n) {
            if (in_array($n['id'], $used)) continue;
            $isOnline = (isset($n['online']) ? $n['online'] : false)
                     || (isset($n['last_seen']) && (time() - (int)$n['last_seen']) < 300);
            $nlat = (float)($n['lat'] ?? 0);
            $nlon = (float)($n['lon'] ?? 0);
            $dist = sqrt(($nlat - $avgLat)**2 + ($nlon - $avgLon)**2);
            if ($dist < $bestDist) { $bestDist = $dist; $best = $n; }
        }

        $assignments[] = [
            'city'        => $city,
            'user_count'  => $cnt,
            'priority'    => $i + 1,
            'avg_lat'     => round($avgLat, 4),
            'avg_lon'     => round($avgLon, 4),
            'node_id'     => $best ? $best['id'] : null,
            'node_city'   => $best ? ($best['city'] ?? '') : null,
            'node_online' => $best ? (isset($best['online']) ? $best['online'] : false) : false,
        ];

        if ($best) $used[] = $best['id'];
    }

    return $assignments;
}
