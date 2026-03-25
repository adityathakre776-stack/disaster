<?php
/**
 * weather.php — India Cities Weather Only
 * Disaster Intelligence Command Center — India Edition
 */

header('Content-Type: application/json; charset=UTF-8');
header('Access-Control-Allow-Origin: *');
header('Cache-Control: no-store');

require_once __DIR__ . '/db.php';

$cacheKey = 'weather_india_v2';
$pdo      = getDB();
$cached   = $pdo ? cacheGet($pdo, $cacheKey) : null;
if ($cached) { echo $cached; exit; }

$cacheDir  = dirname(__DIR__) . '/cache/';
$cacheFile = $cacheDir . 'weather_india.json';
if (!is_dir($cacheDir)) mkdir($cacheDir, 0755, true);
if (file_exists($cacheFile) && (time() - filemtime($cacheFile)) < WX_CACHE_SECONDS) {
    echo file_get_contents($cacheFile); exit;
}

/* ---- 28 Major Indian Cities ---- */
$cities = [
    ['name' => 'Mumbai',           'lat' =>  19.0760, 'lon' =>  72.8777, 'state' => 'Maharashtra'],
    ['name' => 'Delhi',            'lat' =>  28.6139, 'lon' =>  77.2090, 'state' => 'Delhi'],
    ['name' => 'Bangalore',        'lat' =>  12.9716, 'lon' =>  77.5946, 'state' => 'Karnataka'],
    ['name' => 'Chennai',          'lat' =>  13.0827, 'lon' =>  80.2707, 'state' => 'Tamil Nadu'],
    ['name' => 'Kolkata',          'lat' =>  22.5726, 'lon' =>  88.3639, 'state' => 'West Bengal'],
    ['name' => 'Hyderabad',        'lat' =>  17.3850, 'lon' =>  78.4867, 'state' => 'Telangana'],
    ['name' => 'Pune',             'lat' =>  18.5204, 'lon' =>  73.8567, 'state' => 'Maharashtra'],
    ['name' => 'Ahmedabad',        'lat' =>  23.0225, 'lon' =>  72.5714, 'state' => 'Gujarat'],
    ['name' => 'Jaipur',           'lat' =>  26.9124, 'lon' =>  75.7873, 'state' => 'Rajasthan'],
    ['name' => 'Lucknow',          'lat' =>  26.8467, 'lon' =>  80.9462, 'state' => 'Uttar Pradesh'],
    ['name' => 'Bhopal',           'lat' =>  23.2599, 'lon' =>  77.4126, 'state' => 'Madhya Pradesh'],
    ['name' => 'Patna',            'lat' =>  25.5941, 'lon' =>  85.1376, 'state' => 'Bihar'],
    ['name' => 'Kochi',            'lat' =>   9.9312, 'lon' =>  76.2673, 'state' => 'Kerala'],
    ['name' => 'Nagpur',           'lat' =>  21.1458, 'lon' =>  79.0882, 'state' => 'Maharashtra'],
    ['name' => 'Visakhapatnam',    'lat' =>  17.6868, 'lon' =>  83.2185, 'state' => 'Andhra Pradesh'],
    ['name' => 'Bhubaneswar',      'lat' =>  20.2961, 'lon' =>  85.8245, 'state' => 'Odisha'],
    ['name' => 'Guwahati',         'lat' =>  26.1445, 'lon' =>  91.7362, 'state' => 'Assam'],
    ['name' => 'Srinagar',         'lat' =>  34.0837, 'lon' =>  74.7973, 'state' => 'J&K'],
    ['name' => 'Dehradun',         'lat' =>  30.3165, 'lon' =>  78.0322, 'state' => 'Uttarakhand'],
    ['name' => 'Shimla',           'lat' =>  31.1048, 'lon' =>  77.1734, 'state' => 'Himachal Pradesh'],
    ['name' => 'Thiruvananthapuram','lat' =>   8.5241, 'lon' =>  76.9366, 'state' => 'Kerala'],
    ['name' => 'Raipur',           'lat' =>  21.2514, 'lon' =>  81.6296, 'state' => 'Chhattisgarh'],
    ['name' => 'Ranchi',           'lat' =>  23.3441, 'lon' =>  85.3096, 'state' => 'Jharkhand'],
    ['name' => 'Chandigarh',       'lat' =>  30.7333, 'lon' =>  76.7794, 'state' => 'Punjab/Haryana'],
    ['name' => 'Amritsar',         'lat' =>  31.6340, 'lon' =>  74.8723, 'state' => 'Punjab'],
    ['name' => 'Port Blair',       'lat' =>  11.6234, 'lon' =>  92.7265, 'state' => 'Andaman & Nicobar'],
    ['name' => 'Imphal',           'lat' =>  24.8170, 'lon' =>  93.9368, 'state' => 'Manipur'],
    ['name' => 'Gangtok',          'lat' =>  27.3314, 'lon' =>  88.6138, 'state' => 'Sikkim'],
];

$apiKey    = OWM_API_KEY;
$hasApiKey = !empty($apiKey) && strlen($apiKey) > 10;
$results   = [];
$dbRows    = [];

$ctx = stream_context_create([
    'http' => ['timeout' => 6, 'method' => 'GET', 'ignore_errors' => true, 'user_agent' => 'DICC-India/2.0'],
    'ssl'  => ['verify_peer' => false, 'verify_peer_name' => false],
]);

foreach ($cities as $city) {
    $weatherData = null;

    if ($hasApiKey) {
        $url  = sprintf(
            'https://api.openweathermap.org/data/2.5/weather?lat=%s&lon=%s&appid=%s&units=metric',
            $city['lat'], $city['lon'], urlencode($apiKey)
        );
        $raw  = @file_get_contents($url, false, $ctx);
        $json = $raw ? json_decode($raw, true) : null;

        if ($json && isset($json['main']) && ($json['cod'] ?? 0) == 200) {
            $weatherData = [
                'city'        => $city['name'],
                'state'       => $city['state'],
                'lat'         => (float)$city['lat'],
                'lon'         => (float)$city['lon'],
                'temperature' => round((float)($json['main']['temp'] ?? 0), 1),
                'feels_like'  => round((float)($json['main']['feels_like'] ?? 0), 1),
                'humidity'    => (int)($json['main']['humidity'] ?? 0),
                'pressure'    => (int)($json['main']['pressure'] ?? 0),
                'condition'   => ucfirst($json['weather'][0]['description'] ?? 'unknown'),
                'condition_id'=> (int)($json['weather'][0]['id'] ?? 800),
                'icon'        => $json['weather'][0]['icon'] ?? '01d',
                'icon_url'    => 'https://openweathermap.org/img/wn/' . ($json['weather'][0]['icon'] ?? '01d') . '@2x.png',
                'wind_speed'  => round((float)($json['wind']['speed'] ?? 0), 1),
                'wind_dir'    => (int)($json['wind']['deg'] ?? 0),
                'visibility'  => (int)($json['visibility'] ?? 10000),
                'cloudiness'  => (int)($json['clouds']['all'] ?? 0),
                'rain_1h'     => (float)($json['rain']['1h'] ?? 0),
                'country'     => 'IN',
                'time'        => (int)($json['dt'] ?? time()),
                'source'      => 'OpenWeatherMap',
            ];
        }
    }

    if (!$weatherData) {
        $weatherData = _simulateIndiaWeather($city);
    }

    $results[] = $weatherData;
    $dbRows[]  = [
        'city'           => $weatherData['city'],
        'lat'            => $weatherData['lat'],
        'lon'            => $weatherData['lon'],
        'temperature'    => $weatherData['temperature'],
        'feels_like'     => $weatherData['feels_like'],
        'humidity'       => $weatherData['humidity'],
        'pressure'       => $weatherData['pressure'],
        'condition_text' => mb_substr($weatherData['condition'], 0, 100),
        'icon'           => $weatherData['icon'] ?? '',
        'wind_speed'     => $weatherData['wind_speed'],
        'wind_dir'       => $weatherData['wind_dir'],
        'visibility'     => $weatherData['visibility'],
        'source'         => $weatherData['source'],
        'fetched_at'     => time(),
    ];
}

$output = json_encode($results, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
if ($pdo) { cacheSet($pdo, $cacheKey, $output, WX_CACHE_SECONDS); }
file_put_contents($cacheFile, $output);
echo $output;

/* ---- India-specific climate simulation ---- */
function _simulateIndiaWeather(array $city): array {
    $lat   = (float)$city['lat'];
    $month = (int)date('n');

    /* India climate zones */
    if ($lat > 30)       $base = 8;   /* North/Hill stations */
    elseif ($lat > 25)   $base = 25;  /* Northern plains */
    elseif ($lat > 20)   $base = 30;  /* Central India */
    elseif ($lat > 15)   $base = 29;  /* Deccan */
    else                 $base = 30;  /* South India */

    /* Seasonal adjustment */
    if ($month >= 3 && $month <= 6)       $temp = $base + mt_rand(4, 12);  /* Hot summer */
    elseif ($month >= 7 && $month <= 9)   $temp = $base - mt_rand(2, 5);   /* Monsoon */
    elseif ($month >= 10 && $month <= 11) $temp = $base - mt_rand(0, 4);   /* Post-monsoon */
    else                                  $temp = $base - mt_rand(6, 14);   /* Winter */

    $isMonsoon = ($month >= 6 && $month <= 9);
    $conds = $isMonsoon
        ? [['Heavy rain', '10d', 501], ['Moderate rain', '10d', 500], ['Thunderstorm', '11d', 211], ['Overcast', '04d', 804]]
        : [['Clear sky', '01d', 800], ['Partly cloudy', '02d', 801], ['Hazy sunshine', '50d', 721], ['Broken clouds', '04d', 803]];
    $cond = $conds[array_rand($conds)];

    return [
        'city'        => $city['name'],
        'state'       => $city['state'],
        'lat'         => (float)$city['lat'],
        'lon'         => (float)$city['lon'],
        'temperature' => $temp,
        'feels_like'  => $temp + mt_rand(-3, 3),
        'humidity'    => $isMonsoon ? mt_rand(70, 95) : mt_rand(20, 60),
        'pressure'    => mt_rand(1000, 1018),
        'condition'   => $cond[0],
        'condition_id'=> $cond[2],
        'icon'        => $cond[1],
        'icon_url'    => 'https://openweathermap.org/img/wn/' . $cond[1] . '@2x.png',
        'wind_speed'  => round(mt_rand(5, 50) / 10.0, 1),
        'wind_dir'    => mt_rand(0, 359),
        'visibility'  => $isMonsoon ? mt_rand(3000, 7000) : mt_rand(8000, 10000),
        'cloudiness'  => $isMonsoon ? mt_rand(60, 100) : mt_rand(5, 40),
        'rain_1h'     => $isMonsoon ? round(mt_rand(0, 30) / 10, 1) : 0,
        'country'     => 'IN',
        'time'        => time(),
        'source'      => 'Simulated',
    ];
}
