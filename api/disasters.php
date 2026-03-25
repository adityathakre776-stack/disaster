<?php
/**
 * disasters.php — Unified Disaster Intelligence API
 * Combines: USGS global earthquakes + OWM anomaly detection + ESP32 IoT events
 *
 * GET params:
 *   view=global|india   (default: global — for 3D globe)
 *   range=1h|24h        (default: 24h)
 *   types=eq,flood,heatwave,cyclone  (default: all)
 */

header('Content-Type: application/json; charset=UTF-8');
header('Access-Control-Allow-Origin: *');
header('Cache-Control: no-store');

require_once __DIR__ . '/db.php';

$view  = ($_GET['view']  ?? 'global') === 'india' ? 'india' : 'global';
$range = ($_GET['range'] ?? '24h')    === '1h'    ? '1h'    : '24h';
$now   = time();

$pdo      = getDB();
$cacheKey = "disasters_{$view}_{$range}";
$cached   = $pdo ? cacheGet($pdo, $cacheKey) : null;
if ($cached) { echo $cached; exit; }

$disasters = [];

/* ==========================================================
   1. USGS GLOBAL EARTHQUAKES (M4.5+ / 24h or M2.5+ / 1h)
========================================================== */
$usgsFeeds = [
    '24h' => 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson',
    '1h'  => 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_hour.geojson',
];
$ctx = stream_context_create([
    'http' => ['timeout' => 12, 'method' => 'GET',
               'user_agent' => 'DICC-IoT/2.0', 'ignore_errors' => true],
    'ssl'  => ['verify_peer' => false],
]);

$raw  = @file_get_contents($usgsFeeds[$range], false, $ctx);
$usgs = $raw ? json_decode($raw, true) : null;

if ($usgs && isset($usgs['features'])) {
    foreach ($usgs['features'] as $f) {
        $p   = $f['properties'] ?? [];
        $c   = $f['geometry']['coordinates'] ?? [0, 0, 0];
        $mag = (float)($p['mag'] ?? 0);
        $lat = (float)($c[1] ?? 0);
        $lon = (float)($c[0] ?? 0);

        /* India-only filter */
        if ($view === 'india' && ($lat < 5.5 || $lat > 38 || $lon < 67 || $lon > 98)) continue;

        $score = round(min(1.0, $mag / 8.0), 2);
        $sev   = $mag >= 7 ? 'CRITICAL' : ($mag >= 5 ? 'HIGH' : ($mag >= 4.5 ? 'MEDIUM' : 'LOW'));

        $disasters[] = [
            'id'        => $f['id'],
            'type'      => 'earthquake',
            'source'    => 'usgs',
            'severity'  => $sev,
            'risk_score'=> $score,
            'lat'       => $lat,
            'lon'       => $lon,
            'depth'     => (float)($c[2] ?? 0),
            'magnitude' => $mag,
            'label'     => $p['place'] ?? 'Unknown',
            'url'       => $p['url']   ?? '',
            'tsunami'   => (bool)($p['tsunami'] ?? false),
            'time'      => isset($p['time']) ? (int)($p['time'] / 1000) : $now,
        ];
    }
}

/* ==========================================================
   2. OWM HEATWAVE & CYCLONE DETECTION — India cities
========================================================== */
$owmKey = OWM_API_KEY;
$cities = [
    ['Delhi',28.6139,77.2090], ['Mumbai',19.0760,72.8777],
    ['Chennai',13.0827,80.2707], ['Kolkata',22.5726,88.3639],
    ['Hyderabad',17.3850,78.4867], ['Ahmedabad',23.0225,72.5714],
    ['Bhubaneswar',20.2961,85.8245], ['Srinagar',34.0837,74.7973],
    ['Guwahati',26.1445,91.7362], ['Port Blair',11.6234,92.7265],
];

if (!empty($owmKey) && strlen($owmKey) > 10 && $view !== 'global') {
    foreach ($cities as [$city, $clat, $clon]) {
        $url = sprintf(
            'https://api.openweathermap.org/data/2.5/weather?lat=%s&lon=%s&appid=%s&units=metric',
            $clat, $clon, $owmKey
        );
        $raw  = @file_get_contents($url, false, $ctx);
        $json = $raw ? json_decode($raw, true) : null;
        if (!$json || ($json['cod'] ?? 0) != 200) continue;

        $temp     = (float)($json['main']['temp']     ?? 0);
        $humidity = (float)($json['main']['humidity'] ?? 0);
        $windSpd  = (float)($json['wind']['speed']    ?? 0);
        $rain1h   = (float)($json['rain']['1h']       ?? 0);

        /* Heatwave: temp > 40°C */
        if ($temp >= 40) {
            $score = round(min(1, ($temp - 40) / 10), 2);
            $sev   = $temp >= 46 ? 'CRITICAL' : ($temp >= 43 ? 'HIGH' : 'MEDIUM');
            $disasters[] = [
                'id'        => "heatwave_owm_{$city}",
                'type'      => 'heatwave',
                'source'    => 'owm',
                'severity'  => $sev,
                'risk_score'=> $score,
                'lat'       => $clat, 'lon' => $clon,
                'magnitude' => null,
                'label'     => "{$temp}°C Heatwave — {$city}",
                'time'      => $now,
            ];
        }

        /* Cyclone: high wind + high rain + high humidity */
        $cycloneScore = 0;
        if ($windSpd >= 15) $cycloneScore += ($windSpd / 30) * 0.40;
        if ($rain1h  >= 10) $cycloneScore += min(1, $rain1h / 50) * 0.35;
        if ($humidity >= 85) $cycloneScore += (($humidity - 85) / 15) * 0.25;
        $cycloneScore = round(min(1, $cycloneScore), 2);

        if ($cycloneScore >= 0.45) {
            $sev = $cycloneScore >= 0.75 ? 'HIGH' : 'MEDIUM';
            $disasters[] = [
                'id'        => "cyclone_owm_{$city}",
                'type'      => 'cyclone',
                'source'    => 'owm',
                'severity'  => $sev,
                'risk_score'=> $cycloneScore,
                'lat'       => $clat, 'lon' => $clon,
                'magnitude' => null,
                'label'     => "Cyclone risk {$windSpd}m/s — {$city}",
                'time'      => $now,
            ];
        }
    }
}

/* ==========================================================
   3. ESP32 IoT DISASTER EVENTS from MySQL
========================================================== */
if ($pdo) {
    $where = ($view === 'india')
        ? 'AND lat BETWEEN 5.5 AND 38 AND lon BETWEEN 67 AND 98'
        : '';
    $rows = $pdo->query("
        SELECT id, type, source, severity, risk_score, lat, lon, label, magnitude, node_id, event_time
        FROM disaster_events
        WHERE active = 1
          AND fetched_at > {$now} - 3600
          {$where}
        ORDER BY risk_score DESC
        LIMIT 50
    ")->fetchAll(PDO::FETCH_ASSOC);

    foreach ($rows as $row) {
        $disasters[] = [
            'id'        => $row['id'],
            'type'      => $row['type'],
            'source'    => $row['source'],
            'severity'  => $row['severity'],
            'risk_score'=> (float)$row['risk_score'],
            'lat'       => (float)$row['lat'],
            'lon'       => (float)$row['lon'],
            'magnitude' => $row['magnitude'] ? (float)$row['magnitude'] : null,
            'label'     => $row['label'],
            'node_id'   => $row['node_id'],
            'time'      => (int)$row['event_time'],
        ];
    }
}

/* ==========================================================
   4. BUILD RESPONSE + ANALYTICS
========================================================== */
/* Sort by risk_score desc */
usort($disasters, fn($a, $b) => $b['risk_score'] <=> $a['risk_score']);
$disasters = array_slice($disasters, 0, 300);

$analytics = [
    'total'      => count($disasters),
    'critical'   => count(array_filter($disasters, fn($d) => $d['severity'] === 'CRITICAL')),
    'high'       => count(array_filter($disasters, fn($d) => $d['severity'] === 'HIGH')),
    'by_type'    => [
        'earthquake' => count(array_filter($disasters, fn($d) => $d['type'] === 'earthquake')),
        'flood'      => count(array_filter($disasters, fn($d) => $d['type'] === 'flood')),
        'heatwave'   => count(array_filter($disasters, fn($d) => $d['type'] === 'heatwave')),
        'cyclone'    => count(array_filter($disasters, fn($d) => $d['type'] === 'cyclone')),
    ],
];

$output = json_encode([
    'disasters'  => $disasters,
    'analytics'  => $analytics,
    'view'       => $view,
    'range'      => $range,
    'generated'  => $now,
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

if ($pdo) cacheSet($pdo, $cacheKey, $output, 30); /* 30-sec cache */
echo $output;
