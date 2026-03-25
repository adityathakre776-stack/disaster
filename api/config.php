<?php
/**
 * config.php — Shared Configuration
 * Disaster Intelligence Command Center
 */

/* API Keys */
define('OWM_API_KEY', getenv('OWM_API_KEY') ?: 'YOUR_OPENWEATHER_API_KEY_HERE');

/* Cache */
define('CACHE_DIR', dirname(__DIR__) . '/cache/');
define('EQ_CACHE_TTL',   15);  // seconds
define('WX_CACHE_TTL',  600);  // 10 minutes

/* USGS Feeds */
define('USGS_1H',  'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson');
define('USGS_24H', 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson');

/* OpenWeatherMap */
define('OWM_BASE', 'https://api.openweathermap.org/data/2.5/weather');

/* Debug */
define('DEBUG', false);
