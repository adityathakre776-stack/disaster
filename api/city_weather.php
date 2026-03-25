<?php
/**
 * city_weather.php — Real-time weather for a specific city or coordinates
 * Uses OpenWeatherMap Current Weather API
 * Cached in MySQL for 5 minutes
 *
 * GET ?city=Mumbai         → by city name (adds ,IN for India)
 * GET ?lat=19.07&lon=72.87 → by coordinates (more accurate after geolocation)
 */

header('Content-Type: application/json; charset=UTF-8');
header('Access-Control-Allow-Origin: *');
header('Cache-Control: no-store');

require_once __DIR__ . '/db.php';

$city = trim($_GET['city'] ?? '');
$lat  = isset($_GET['lat']) && is_numeric($_GET['lat']) ? (float)$_GET['lat'] : null;
$lon  = isset($_GET['lon']) && is_numeric($_GET['lon']) ? (float)$_GET['lon'] : null;

if (!$city && ($lat === null || $lon === null)) {
    echo json_encode(['error' => 'Provide city or lat & lon']); exit;
}

$pdo = getDB();

/* Cache key */
$cacheKey = ($lat !== null && $lon !== null)
    ? 'cw_' . round($lat, 2) . '_' . round($lon, 2)
    : 'cw_' . strtolower(preg_replace('/\s+/', '_', $city));

/* Read from cache */
$cached = cacheGet($pdo, $cacheKey);
if ($cached) {
    echo $cached; exit;
}

/* Build OWM URL */
if ($lat !== null && $lon !== null) {
    $url = "https://api.openweathermap.org/data/2.5/weather?lat={$lat}&lon={$lon}&appid=" . OWM_API_KEY . "&units=metric";
} else {
    $url = "https://api.openweathermap.org/data/2.5/weather?q=" . urlencode($city . ',IN') . "&appid=" . OWM_API_KEY . "&units=metric";
}

/* Fetch */
$ctx  = stream_context_create(['http' => ['timeout' => 10, 'user_agent' => 'DICC-India/2.0']]);
$resp = @file_get_contents($url, false, $ctx);

if ($resp === false) {
    /* Fallback: try without ,IN */
    if (!$lat && $city) {
        $url2 = "https://api.openweathermap.org/data/2.5/weather?q=" . urlencode($city) . "&appid=" . OWM_API_KEY . "&units=metric";
        $resp = @file_get_contents($url2, false, $ctx);
    }
    if ($resp === false) { echo json_encode(['error' => 'OWM fetch failed — check network']); exit; }
}

$owm = json_decode($resp, true);

if (($owm['cod'] ?? '') != 200) {
    echo json_encode(['error' => $owm['message'] ?? 'OWM error', 'cod' => $owm['cod'] ?? 0]); exit;
}

/* ── City mismatch guard ────────────────────────────────────────
   If OWM returns a completely different city (e.g. asked "Nagpur" but got
   "Mumbai"), bust the cache and retry WITHOUT the ,IN country suffix.       */
if ($city && isset($owm['name'])) {
    $reqNorm = strtolower(trim($city));
    $retNorm = strtolower(trim($owm['name']));
    $similar  = similar_text($reqNorm, $retNorm, $pct);
    if ($pct < 50) {
        /* Retry without ,IN */
        $urlRetry = "https://api.openweathermap.org/data/2.5/weather?q=" . urlencode($city) . "&appid=" . OWM_API_KEY . "&units=metric";
        $resp2 = @file_get_contents($urlRetry, false, $ctx);
        if ($resp2) {
            $owm2 = json_decode($resp2, true);
            if (($owm2['cod'] ?? '') == 200) {
                $owm = $owm2; /* Use the better match */
                /* Delete the bad cache so we don't return Mumbai for Nagpur */
                try { cacheSet($pdo, $cacheKey, '', -1); } catch(\Throwable $_) {}
            }
        }
    }
}


/* Wind direction from degrees */
$windDeg = (int)($owm['wind']['deg'] ?? 0);
$dirs    = ['N','NE','E','SE','S','SW','W','NW'];
$windDir = $dirs[round($windDeg / 45) % 8];

/* Heatwave / flood / cyclone flags */
$temp    = (float)($owm['main']['temp'] ?? 0);
$hum     = (int)($owm['main']['humidity'] ?? 0);
$windSpd = (float)($owm['wind']['speed'] ?? 0);
$rain1h  = (float)($owm['rain']['1h'] ?? $owm['rain']['3h'] ?? 0);

$flags = [
    'heatwave' => $temp >= 40.0,
    'cyclone'  => $windSpd >= 17.0 && $hum >= 75 && $rain1h > 0,
    'flood'    => $rain1h >= 15.0 && $hum >= 80,
];

/* Sunrise / sunset in IST */
$tz      = (int)($owm['timezone'] ?? 19800);
$sunrise = isset($owm['sys']['sunrise']) ? $owm['sys']['sunrise'] + $tz : null;
$sunset  = isset($owm['sys']['sunset'])  ? $owm['sys']['sunset']  + $tz : null;

$iconCode = $owm['weather'][0]['icon'] ?? '01d';

$data = [
    'city'           => $owm['name'],
    'country'        => $owm['sys']['country'] ?? 'IN',
    'lat'            => (float)$owm['coord']['lat'],
    'lon'            => (float)$owm['coord']['lon'],
    'temperature'    => round($temp, 1),
    'feels_like'     => round((float)($owm['main']['feels_like'] ?? $temp), 1),
    'temp_min'       => round((float)($owm['main']['temp_min'] ?? $temp), 1),
    'temp_max'       => round((float)($owm['main']['temp_max'] ?? $temp), 1),
    'humidity'       => $hum,
    'pressure'       => (int)($owm['main']['pressure'] ?? 1013),
    'visibility_km'  => isset($owm['visibility']) ? round($owm['visibility'] / 1000, 1) : null,
    'wind_speed'     => round($windSpd, 1),
    'wind_speed_kmh' => round($windSpd * 3.6, 1),
    'wind_dir'       => $windDir,
    'wind_deg'       => $windDeg,
    'wind_gust'      => isset($owm['wind']['gust']) ? round((float)$owm['wind']['gust'], 1) : null,
    'clouds_pct'     => (int)($owm['clouds']['all'] ?? 0),
    'rain_1h_mm'     => round($rain1h, 2),
    'condition'      => $owm['weather'][0]['main'] ?? '',
    'condition_text' => ucfirst($owm['weather'][0]['description'] ?? ''),
    'icon_code'      => $iconCode,
    'icon_url'       => "https://openweathermap.org/img/wn/{$iconCode}@2x.png",
    'sunrise_unix'   => $sunrise,
    'sunset_unix'    => $sunset,
    'aqi'            => null,            /* AQI via separate call if needed */
    'flags'          => $flags,
    'fetched_at'     => time(),
    'source'         => 'OpenWeatherMap (Live)',
];

$json = json_encode(['weather' => $data]);

/* Cache for 5 minutes */
cacheSet($pdo, $cacheKey, $json, 300);

echo $json;
