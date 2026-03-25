<?php
/**
 * update_location.php — Update user's saved location
 * POST: { lat, lon, city }
 */
header('Content-Type: application/json; charset=UTF-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }

require_once __DIR__ . '/db.php';
session_name(SESSION_NAME);
session_start();

$userId = $_SESSION['user_id'] ?? null;
if (!$userId) { http_response_code(401); echo json_encode(['error' => 'Not logged in']); exit; }

$raw  = file_get_contents('php://input');
$data = $raw ? json_decode($raw, true) : $_POST;
$lat  = isset($data['lat'])  ? (float)$data['lat']  : null;
$lon  = isset($data['lon'])  ? (float)$data['lon']  : null;
$city = trim($data['city']  ?? '');

$pdo = getDB();
$pdo->prepare("UPDATE users SET latitude=?, longitude=?, city=? WHERE id=?")
    ->execute([$lat, $lon, $city, $userId]);

echo json_encode(['ok' => true, 'lat' => $lat, 'lon' => $lon, 'city' => $city]);
