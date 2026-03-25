<?php
/**
 * earthquakes.php — Earthquake Data Endpoint with MySQL Caching
 * Disaster Intelligence Command Center
 */

header('Content-Type: application/json; charset=UTF-8');
header('Access-Control-Allow-Origin: *');
header('Cache-Control: no-store');

require_once __DIR__ . '/db.php';

/* ---- India Bounding Box ---- */
define('INDIA_LAT_MIN',  5.5);
define('INDIA_LAT_MAX', 38.0);
define('INDIA_LON_MIN', 67.0);
define('INDIA_LON_MAX', 98.0);

$range = $_GET['range'] ?? '1h';
$range = in_array($range, ['1h', '24h']) ? $range : '1h';

$cacheKey = "earthquakes_{$range}";

/* ---- Try MySQL cache first ---- */
$pdo    = getDB();
$cached = $pdo ? cacheGet($pdo, $cacheKey) : null;

if ($cached) {
    echo $cached;
    exit;
}

/* ---- File-based fallback cache ---- */
$cacheDir  = dirname(__DIR__) . '/cache/';
$cacheFile = $cacheDir . "{$cacheKey}.json";
if (!is_dir($cacheDir)) mkdir($cacheDir, 0755, true);

if (!$cached && file_exists($cacheFile) && (time() - filemtime($cacheFile)) < EQ_CACHE_SECONDS) {
    $cached = file_get_contents($cacheFile);
    if ($cached) { echo $cached; exit; }
}

/* ---- USGS Feed ---- */
$feeds = [
    '1h'  => 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson',
    '24h' => 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson',
];

$ctx = stream_context_create([
    'http' => [
        'timeout'       => 12,
        'method'        => 'GET',
        'ignore_errors' => true,
        'user_agent'    => 'DICC/2.0 (Disaster Intelligence Command Center)',
        'header'        => "Accept: application/json\r\n",
    ],
    'ssl'  => ['verify_peer' => false, 'verify_peer_name' => false],
]);

$raw  = @file_get_contents($feeds[$range], false, $ctx);
$data = $raw ? json_decode($raw, true) : null;

if (!$data || !isset($data['features'])) {
    /* Stale file cache as last resort */
    if (file_exists($cacheFile)) {
        echo file_get_contents($cacheFile);
    } else {
        http_response_code(503);
        echo json_encode(['error' => 'USGS unavailable', 'features' => [], 'metadata' => ['count' => 0]]);
    }
    exit;
}

/* ---- Normalize ---- */
$events = [];
$dbRows = [];

foreach ($data['features'] as $f) {
    $p      = $f['properties'] ?? [];
    $coords = $f['geometry']['coordinates'] ?? [0, 0, 0];
    $mag    = isset($p['mag']) ? (float)$p['mag'] : null;
    if ($mag === null || $mag < -2) continue;

    $id      = $f['id'] ?? ('eq_' . md5($p['time'] . $coords[0] . $coords[1]));
    $lat     = (float)($coords[1] ?? 0);
    $lon     = (float)($coords[0] ?? 0);
    $depth   = (float)($coords[2] ?? 0);
    $eqTime  = isset($p['time'])    ? (int)($p['time']    / 1000) : time();
    $updated = isset($p['updated']) ? (int)($p['updated'] / 1000) : time();

    /* ---- INDIA-ONLY FILTER ---- */
    if ($lat < INDIA_LAT_MIN || $lat > INDIA_LAT_MAX ||
        $lon < INDIA_LON_MIN || $lon > INDIA_LON_MAX) {
        continue;
    }

    $events[] = [
        'id'        => $id,
        'type'      => 'earthquake',
        'lat'       => $lat,
        'lon'       => $lon,
        'depth'     => $depth,
        'magnitude' => $mag,
        'label'     => $p['place'] ?? 'Unknown Location',
        'time'      => $eqTime,
        'updated'   => $updated,
        'url'       => $p['url']   ?? '',
        'status'    => $p['status'] ?? '',
        'net'       => $p['net']   ?? '',
        'alert'     => $p['alert'] ?? null,
        'tsunami'   => (bool)($p['tsunami'] ?? false),
        'felt'      => $p['felt'] ?? null,
    ];

    $dbRows[] = [
        'id'        => $id,
        'magnitude' => $mag,
        'place'     => mb_substr($p['place'] ?? '', 0, 255),
        'lat'       => $lat,
        'lon'       => $lon,
        'depth'     => $depth,
        'eq_time'   => $eqTime,
        'url'       => mb_substr($p['url'] ?? '', 0, 512),
        'net'       => mb_substr($p['net'] ?? '', 0, 20),
        'alert'     => mb_substr($p['alert'] ?? '', 0, 20),
        'tsunami'   => (int)(bool)($p['tsunami'] ?? false),
        'fetched_at'=> time(),
    ];
}

/* Sort by time desc, limit 150 */
usort($events, fn($a, $b) => $b['time'] - $a['time']);
$events = array_slice($events, 0, 150);

/* ---- Build GeoJSON response ---- */
$response = [
    'type'     => 'FeatureCollection',
    'metadata' => [
        'generated'  => time(),
        'title'      => $data['metadata']['title'] ?? 'USGS Earthquakes',
        'count'      => count($events),
        'range'      => $range,
        'cached_via' => 'live',
    ],
    'features' => array_map(fn($ev) => [
        'id'       => $ev['id'],
        'type'     => 'Feature',
        'geometry' => ['type' => 'Point', 'coordinates' => [$ev['lon'], $ev['lat'], $ev['depth']]],
        'properties' => [
            'mag'     => $ev['magnitude'],
            'place'   => $ev['label'],
            'time'    => $ev['time'] * 1000,
            'updated' => $ev['updated'] * 1000,
            'url'     => $ev['url'],
            'status'  => $ev['status'],
            'net'     => $ev['net'],
            'alert'   => $ev['alert'],
            'tsunami' => $ev['tsunami'],
            'felt'    => $ev['felt'],
        ],
    ], $events),
];

$output = json_encode($response, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

/* ---- Store in MySQL cache ---- */
if ($pdo) {
    cacheSet($pdo, $cacheKey, $output, EQ_CACHE_SECONDS);
    cachePurge($pdo);

    /* Persist earthquake rows to DB (INSERT IGNORE to avoid duplicates) */
    try {
        $pdo->exec("USE `" . DB_NAME . "`");
        $stmt = $pdo->prepare(
            "INSERT IGNORE INTO earthquakes
             (id, magnitude, place, lat, lon, depth, eq_time, url, net, alert, tsunami, fetched_at)
             VALUES (:id,:magnitude,:place,:lat,:lon,:depth,:eq_time,:url,:net,:alert,:tsunami,:fetched_at)"
        );
        foreach (array_slice($dbRows, 0, 150) as $row) {
            $stmt->execute($row);
        }
    } catch (PDOException $e) {
        error_log('[DICC EQ DB] ' . $e->getMessage());
    }
}

/* ---- File cache backup ---- */
file_put_contents($cacheFile, $output);
echo $output;
