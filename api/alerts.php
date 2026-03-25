<?php
/**
 * alerts.php — User location-based alert system
 *
 * GET  → Return user's alerts + generate new ones from active disaster_events
 * POST ?action=read → Mark alerts as read
 * POST ?action=toggle → Toggle alerts_enabled for user
 */

header('Content-Type: application/json; charset=UTF-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/mailer.php';

session_name(SESSION_NAME);
session_start();

$userId = $_SESSION['user_id'] ?? null;
$method = $_SERVER['REQUEST_METHOD'];

/* ── Unauthenticated: return empty ─────────────────────────────── */
if (!$userId) {
    echo json_encode(['alerts' => [], 'count' => 0, 'auth' => false]); exit;
}

$pdo = getDB();
if (!$pdo) { echo json_encode(['alerts' => [], 'error' => 'DB unavailable']); exit; }

/* ── Get user ──────────────────────────────────────────────────── */
$user = $pdo->prepare("SELECT * FROM users WHERE id = ? LIMIT 1");
$user->execute([$userId]);
$me = $user->fetch(PDO::FETCH_ASSOC);
if (!$me) { echo json_encode(['alerts' => [], 'auth' => false]); exit; }

/* ── POST actions ──────────────────────────────────────────────── */
if ($method === 'POST') {
    $action = $_GET['action'] ?? '';

    if ($action === 'read') {
        $pdo->prepare("UPDATE user_alerts SET read_at=? WHERE user_id=? AND read_at IS NULL")
            ->execute([time(), $userId]);
        echo json_encode(['ok' => true]); exit;
    }

    if ($action === 'toggle') {
        $new = $me['alerts_enabled'] ? 0 : 1;
        $pdo->prepare("UPDATE users SET alerts_enabled=? WHERE id=?")->execute([$new, $userId]);
        echo json_encode(['ok' => true, 'alerts_enabled' => (bool)$new]); exit;
    }

    echo json_encode(['error' => 'Unknown action']); exit;
}

/* ── GET: generate alerts + return list ───────────────────────── */
$now = time();

if ($me['alerts_enabled'] && $me['latitude'] && $me['longitude']) {
    _generateAlerts($pdo, $me, $now);
}

/* Return last 20 alerts */
$rows = $pdo->prepare("
    SELECT * FROM user_alerts
    WHERE user_id = ?
    ORDER BY sent_at DESC
    LIMIT 20
");
$rows->execute([$userId]);
$alerts = $rows->fetchAll(PDO::FETCH_ASSOC);

$unread = count(array_filter($alerts, fn($a) => !$a['read_at']));

echo json_encode([
    'auth'   => true,
    'alerts' => $alerts,
    'unread' => $unread,
    'user'   => [
        'name'           => $me['name'],
        'city'           => $me['city'],
        'alerts_enabled' => (bool)$me['alerts_enabled'],
    ],
]);

/* ══ Helper — generate proximity alerts ═══════════════════════════ */
function _generateAlerts(PDO $pdo, array $me, int $now): void {
    /* Active disaster events in last hour */
    $events = $pdo->query("
        SELECT * FROM disaster_events
        WHERE active = 1 AND fetched_at > {$now} - 3600
        ORDER BY risk_score DESC
        LIMIT 100
    ")->fetchAll(PDO::FETCH_ASSOC);

    foreach ($events as $ev) {
        if (!$ev['lat'] || !$ev['lon']) continue;

        /* Avoid duplicate alerts per event per user per hour */
        $dup = $pdo->prepare("
            SELECT id FROM user_alerts
            WHERE user_id = ? AND node_id = ? AND sent_at > ? LIMIT 1
        ");
        $dup->execute([$me['id'], $ev['id'], $now - 3600]);
        if ($dup->fetch()) continue;

        $km = _haversine((float)$me['latitude'], (float)$me['longitude'],
                         (float)$ev['lat'],       (float)$ev['lon']);

        if ($km > 20) continue;  /* outside alert radius */

        $zone    = $km <= 5 ? 'HIGH' : ($km <= 10 ? 'MEDIUM' : 'LOW');
        $icon    = ['flood'=>'🌊','heatwave'=>'🌡️','cyclone'=>'🌀','earthquake'=>'🌍'][$ev['type']] ?? '⚡';
        $message = "{$icon} " . ucfirst($ev['type']) . " warning near your area ({$ev['label']}). "
                 . "Distance: " . round($km, 1) . " km. Risk: {$zone}. Stay safe.";

        /* Insert alert record */
        $pdo->prepare("
            INSERT INTO user_alerts
                (user_id, disaster_type, severity, distance_km, message, node_id, lat, lon, sent_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ")->execute([
            $me['id'], $ev['type'], $zone, $km, $message,
            $ev['id'], $ev['lat'], $ev['lon'], $now,
        ]);

        /* Send email alert */
        require_once __DIR__ . '/mailer.php';
        $emailBody = buildAlertEmail($me['name'], $ev['type'], $message, round($km, 1));
        sendEmail($me['email'], "{$icon} DICC Alert: " . ucfirst($ev['type']) . " near you", $emailBody, $pdo);
    }
}

function _haversine(float $lat1, float $lon1, float $lat2, float $lon2): float {
    $R = 6371; $r = M_PI / 180;
    $dLat = ($lat2 - $lat1) * $r; $dLon = ($lon2 - $lon1) * $r;
    $a = sin($dLat/2)**2 + cos($lat1*$r) * cos($lat2*$r) * sin($dLon/2)**2;
    return $R * 2 * atan2(sqrt($a), sqrt(1-$a));
}
