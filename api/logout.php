<?php
/**
 * logout.php — Destroy session
 */

require_once __DIR__ . '/db.php';
session_name(SESSION_NAME);
session_start();
session_unset();
session_destroy();

header('Content-Type: application/json');
echo json_encode(['ok' => true]);
