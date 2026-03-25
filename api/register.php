<?php
/**
 * register.php — User registration
 * POST JSON: { name, email, password, latitude?, longitude?, city? }
 */

header('Content-Type: application/json; charset=UTF-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'POST')    { http_response_code(405); echo json_encode(['error' => 'POST only']); exit; }

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/mailer.php';

/* ── Parse & validate ─────────────────────────────────────────── */
$raw  = file_get_contents('php://input');
$data = $raw ? json_decode($raw, true) : $_POST;

$name     = trim($data['name']      ?? '');
$email    = strtolower(trim($data['email']    ?? ''));
$password = $data['password']               ?? '';
$lat      = isset($data['latitude'])  ? (float)$data['latitude']  : null;
$lon      = isset($data['longitude']) ? (float)$data['longitude'] : null;
$city     = trim($data['city'] ?? '');

if (!$name)  { echo json_encode(['error' => 'Name is required']);    exit; }
if (!$email) { echo json_encode(['error' => 'Email is required']);   exit; }
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) { echo json_encode(['error' => 'Invalid email format']); exit; }
if (strlen($password) < 6) { echo json_encode(['error' => 'Password must be ≥ 6 characters']); exit; }

/* ── Database ─────────────────────────────────────────────────── */
$pdo = getDB();
if (!$pdo) { http_response_code(503); echo json_encode(['error' => 'Database unavailable']); exit; }

/* Check duplicate */
$dup = $pdo->prepare("SELECT id FROM users WHERE email = ? LIMIT 1");
$dup->execute([$email]);
if ($dup->fetch()) { echo json_encode(['error' => 'Email already registered. Please log in.']); exit; }

/* Hash password */
$hash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 11]);

/* OTP */
$otp     = str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT);
$expires = time() + 900; /* 15 min */

/* Insert */
$stmt = $pdo->prepare("
    INSERT INTO users (name, email, password_hash, latitude, longitude, city, otp, otp_expires, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
");
$stmt->execute([$name, $email, $hash, $lat, $lon, $city, $otp, $expires, time()]);
$userId = (int)$pdo->lastInsertId();

/* Send OTP email */
$emailBody = buildOtpEmail($name, $otp);
sendEmail($email, '🔐 DICC India — Verify Your Account', $emailBody, $pdo);

echo json_encode([
    'ok'      => true,
    'user_id' => $userId,
    'message' => "Registration successful! OTP sent to {$email}",
    'dev_otp' => DEV_MODE ? $otp : null,   /* visible only in dev */
]);
