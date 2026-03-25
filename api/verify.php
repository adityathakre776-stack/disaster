<?php
/**
 * verify.php — Email OTP verification
 * POST JSON: { email, otp }
 */

header('Content-Type: application/json; charset=UTF-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }

require_once __DIR__ . '/db.php';

$raw   = file_get_contents('php://input');
$data  = $raw ? json_decode($raw, true) : $_POST;
$email = strtolower(trim($data['email'] ?? ''));
$otp   = trim($data['otp']   ?? '');

if (!$email || !$otp) {
    echo json_encode(['error' => 'Email and OTP are required']); exit;
}

$pdo = getDB();
if (!$pdo) { http_response_code(503); echo json_encode(['error' => 'DB unavailable']); exit; }

$stmt = $pdo->prepare("SELECT id, otp, otp_expires, is_verified FROM users WHERE email = ? LIMIT 1");
$stmt->execute([$email]);
$user = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$user) {
    echo json_encode(['error' => 'Email not found. Please register first.']); exit;
}
if ($user['is_verified']) {
    echo json_encode(['ok' => true, 'message' => 'Account already verified. Please log in.']); exit;
}
if ($user['otp'] !== $otp) {
    echo json_encode(['error' => 'Incorrect OTP. Please try again.']); exit;
}
if (time() > (int)$user['otp_expires']) {
    /* Auto-regenerate OTP */
    require_once __DIR__ . '/mailer.php';
    $newOtp = str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT);
    $pdo->prepare("UPDATE users SET otp=?, otp_expires=? WHERE id=?")
        ->execute([$newOtp, time() + 900, $user['id']]);
    $row = $pdo->prepare("SELECT name FROM users WHERE id = ?")->execute([$user['id']]);
    sendEmail($email, '🔐 DICC India — New OTP', buildOtpEmail('User', $newOtp), $pdo);
    echo json_encode([
        'error'   => 'OTP expired. A new OTP has been sent.',
        'dev_otp' => DEV_MODE ? $newOtp : null,
    ]);
    exit;
}

/* Verify! */
$pdo->prepare("UPDATE users SET is_verified=1, otp=NULL, otp_expires=NULL WHERE id=?")
    ->execute([$user['id']]);

echo json_encode(['ok' => true, 'message' => 'Email verified! You can now log in.']);
