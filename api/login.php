<?php
/**
 * login.php — User login
 * POST JSON: { email, password }
 * Returns: { ok, user: {id, name, email, city, lat, lon, alerts_enabled} }
 */

header('Content-Type: application/json; charset=UTF-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'POST')    { http_response_code(405); echo json_encode(['error' => 'POST only']); exit; }

require_once __DIR__ . '/db.php';

session_name(SESSION_NAME);
session_start();

$raw   = file_get_contents('php://input');
$data  = $raw ? json_decode($raw, true) : $_POST;
$email = strtolower(trim($data['email']    ?? ''));
$pass  = $data['password'] ?? '';

if (!$email || !$pass) {
    echo json_encode(['error' => 'Email and password are required']); exit;
}

$pdo = getDB();
if (!$pdo) { http_response_code(503); echo json_encode(['error' => 'DB unavailable']); exit; }

$stmt = $pdo->prepare("SELECT * FROM users WHERE email = ? LIMIT 1");
$stmt->execute([$email]);
$user = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$user || !password_verify($pass, $user['password_hash'])) {
    http_response_code(401);
    echo json_encode(['error' => 'Invalid email or password']);
    exit;
}

if (!$user['is_verified']) {
    echo json_encode(['error' => 'Please verify your email first. Check your inbox for the OTP.', 'needs_verify' => true]);
    exit;
}

/* Create session */
$_SESSION['user_id']   = $user['id'];
$_SESSION['user_name'] = $user['name'];
$_SESSION['user_email']= $user['email'];

/* Admin if email matches ADMIN_EMAIL constant */
$role = ($user['email'] === ADMIN_EMAIL) ? 'admin' : ($user['role'] ?? 'user');

echo json_encode([
    'ok'   => true,
    'role' => $role,
    'user' => [
        'id'             => (int)$user['id'],
        'name'           => $user['name'],
        'email'          => $user['email'],
        'role'           => $role,
        'city'           => $user['city'] ?? '',
        'latitude'       => $user['latitude']  ? (float)$user['latitude']  : null,
        'longitude'      => $user['longitude'] ? (float)$user['longitude'] : null,
        'alerts_enabled' => (bool)$user['alerts_enabled'],
    ],
]);

