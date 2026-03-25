<?php
/**
 * user.php — Return current session user
 * GET → { user: {...} } or { user: null }
 */

header('Content-Type: application/json; charset=UTF-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Credentials: true');

require_once __DIR__ . '/db.php';
session_name(SESSION_NAME);
session_start();

$userId = $_SESSION['user_id'] ?? null;
if (!$userId) { echo json_encode(['user' => null]); exit; }

$pdo = getDB();
if (!$pdo) { echo json_encode(['user' => null, 'error' => 'DB unavailable']); exit; }

$stmt = $pdo->prepare("SELECT id, name, email, city, latitude, longitude, alerts_enabled, role FROM users WHERE id = ? LIMIT 1");
$stmt->execute([$userId]);
$user = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$user) {
    session_unset(); session_destroy();
    echo json_encode(['user' => null]); exit;
}

/* Admin override: if email matches ADMIN_EMAIL constant, always admin */
$role = ($user['email'] === ADMIN_EMAIL) ? 'admin' : ($user['role'] ?? 'user');

/* Unread alert count */
$cnt = $pdo->prepare("SELECT COUNT(*) FROM user_alerts WHERE user_id = ? AND read_at IS NULL");
$cnt->execute([$userId]);
$unread = (int)$cnt->fetchColumn();

echo json_encode([
    'user' => [
        'id'             => (int)$user['id'],
        'name'           => $user['name'],
        'email'          => $user['email'],
        'role'           => $role,
        'city'           => $user['city'] ?? '',
        'latitude'       => $user['latitude']  ? (float)$user['latitude']  : null,
        'longitude'      => $user['longitude'] ? (float)$user['longitude'] : null,
        'alerts_enabled' => (bool)$user['alerts_enabled'],
        'unread_alerts'  => $unread,
    ],
]);

