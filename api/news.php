<?php
/**
 * news.php — Latest News API for a given location/query
 * Disaster Intelligence Command Center
 *
 * Uses GNews API (free tier: 100 req/day, no credit card)
 * Free key at: https://gnews.io/  — also works with NewsAPI.org
 */

header('Content-Type: application/json; charset=UTF-8');
header('Access-Control-Allow-Origin: *');
header('Cache-Control: no-store');

require_once __DIR__ . '/db.php';

$query    = isset($_GET['q']) ? trim(strip_tags($_GET['q'])) : '';
$location = isset($_GET['loc']) ? trim(strip_tags($_GET['loc'])) : '';
$type     = isset($_GET['type']) ? $_GET['type'] : 'earthquake';

if (empty($query) && empty($location)) {
    echo json_encode(['articles' => [], 'error' => 'No query provided']);
    exit;
}

/* Build search query based on type */
if ($type === 'weather') {
    /* Weather-specific: heatwave, forecast, temperature alerts */
    $city = !empty($location) ? $location : (!empty($query) ? $query : 'India');
    $searchQuery = 'India weather ' . $city . ' heatwave forecast temperature';
} elseif ($type === 'earthquake' || !empty($query)) {
    /* Earthquake-specific */
    $base = !empty($query) ? $query : $location;
    $searchQuery = 'earthquake ' . $base . ' India seismic';
} else {
    $searchQuery = 'India disaster alert';
}
$searchQuery = mb_substr(trim($searchQuery), 0, 100);

/* Cache key */
$cacheKey = 'news_' . md5($searchQuery);
$pdo      = getDB();
if ($pdo) {
    $cached = cacheGet($pdo, $cacheKey);
    if ($cached) { echo $cached; exit; }
}

/* File cache */
$cacheDir  = dirname(__DIR__) . '/cache/';
$cacheFile = $cacheDir . 'news_' . md5($searchQuery) . '.json';
if (file_exists($cacheFile) && (time() - filemtime($cacheFile)) < 300) {
    echo file_get_contents($cacheFile); exit;
}

/* ---- GNews API (free, 100/day) ---- */
$gnewsKey = '89f56a6fcfd71f622462b4aef7e2475b';

/* ---- NewsAPI.org fallback (100/day free) ---- */
$newsapiKey = '3d0f00339624428c927a2b99f0b531d3';

$articles = [];
$hasGNews   = !empty($gnewsKey)   && $gnewsKey   !== 'YOUR_GNEWS_API_KEY_HERE';
$hasNewsApi = !empty($newsapiKey) && $newsapiKey  !== 'YOUR_NEWSAPI_KEY_HERE';

$ctx = stream_context_create([
    'http' => [
        'timeout'       => 8,
        'method'        => 'GET',
        'ignore_errors' => true,
        'user_agent'    => 'DICC/2.0',
    ],
    'ssl' => ['verify_peer' => false, 'verify_peer_name' => false],
]);

/* ---- Try GNews first ---- */
if ($hasGNews) {
    $url  = sprintf(
        'https://gnews.io/api/v4/search?q=%s&lang=en&max=5&token=%s',
        urlencode($searchQuery), urlencode($gnewsKey)
    );
    $raw  = @file_get_contents($url, false, $ctx);
    $data = $raw ? json_decode($raw, true) : null;
    if ($data && !empty($data['articles'])) {
        $articles = array_map(fn($a) => [
            'title'       => $a['title']       ?? '',
            'description' => $a['description'] ?? '',
            'url'         => $a['url']         ?? '#',
            'source'      => $a['source']['name'] ?? 'GNews',
            'image'       => $a['image']       ?? null,
            'publishedAt' => $a['publishedAt'] ?? null,
        ], array_slice($data['articles'], 0, 5));
    }
}

/* ---- Try NewsAPI if GNews failed or not configured ---- */
if (empty($articles) && $hasNewsApi) {
    $url  = sprintf(
        'https://newsapi.org/v2/everything?q=%s&language=en&sortBy=publishedAt&pageSize=5&apiKey=%s',
        urlencode($searchQuery), urlencode($newsapiKey)
    );
    $raw  = @file_get_contents($url, false, $ctx);
    $data = $raw ? json_decode($raw, true) : null;
    if ($data && !empty($data['articles'])) {
        $articles = array_map(fn($a) => [
            'title'       => $a['title']       ?? '',
            'description' => $a['description'] ?? '',
            'url'         => $a['url']         ?? '#',
            'source'      => $a['source']['name'] ?? 'NewsAPI',
            'image'       => $a['urlToImage']  ?? null,
            'publishedAt' => $a['publishedAt'] ?? null,
        ], array_slice($data['articles'], 0, 5));
    }
}

/* ---- Fallback: curated placeholder articles ---- */
if (empty($articles)) {
    $articles = _fallbackArticles($searchQuery, $type);
}

$result = [
    'query'    => $searchQuery,
    'count'    => count($articles),
    'articles' => $articles,
    'source'   => $hasGNews ? 'GNews' : ($hasNewsApi ? 'NewsAPI' : 'Demo'),
];

$output = json_encode($result, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
if ($pdo) cacheSet($pdo, $cacheKey, $output, 300);
file_put_contents($cacheFile, $output);
echo $output;

/* ---- Curated demo articles ---- */
function _fallbackArticles(string $query, string $type): array {
    $q = urlencode($query);
    return [
        [
            'title'       => "Latest updates on {$query}",
            'description' => "Follow real-time updates about seismic and geological events near {$query}. USGS monitoring systems track all significant activity.",
            'url'         => "https://earthquake.usgs.gov/earthquakes/map/?extent=-89.30514,-359.64844&extent=89.30514,0.35156",
            'source'      => 'USGS',
            'image'       => null,
            'publishedAt' => date('c'),
        ],
        [
            'title'       => "USGS Real-Time Earthquake Map",
            'description' => "Interactive map showing earthquakes worldwide in real-time. Click any event for detailed seismological data.",
            'url'         => "https://earthquake.usgs.gov/earthquakes/map/",
            'source'      => 'USGS',
            'image'       => null,
            'publishedAt' => date('c', strtotime('-1 hour')),
        ],
        [
            'title'       => "Global Seismic Monitor",
            'description' => "IRIS Seismic Monitor provides near-real-time maps of earthquake activity with waveform data for major events.",
            'url'         => "https://ds.iris.edu/seismon/",
            'source'      => 'IRIS',
            'image'       => null,
            'publishedAt' => date('c', strtotime('-2 hours')),
        ],
    ];
}
