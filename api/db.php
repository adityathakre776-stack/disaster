<?php
/**
 * db.php — MySQL Database Connection & Schema Manager
 * Disaster Intelligence Command Center
 */

define('DB_HOST', 'localhost');
define('DB_NAME', 'disaster_intelligence');
define('DB_USER', 'root');
define('DB_PASS', '');
define('DB_PORT', 3306);

/* OpenWeatherMap API Key */
define('OWM_API_KEY', 'c11c675eb5f250330916e62b978fd221');

/* IoT API Secret (shared with ESP32 firmware) */
define('IOT_API_KEY', 'DICC_IOT_SECRET_2025');

/* ── Email / SMTP Config ────────────────────────────────── */
define('MAIL_FROM',    'adityathakre776@gmail.com');
define('MAIL_NAME',    'DICC India Alerts');
define('SMTP_HOST',    'smtp.gmail.com');
define('SMTP_PORT',    587);
define('SMTP_USER',    'adityathakre776@gmail.com');
define('SMTP_PASS',    'pntgjuibsljyxwru');  /* Google App Password (no spaces) */
define('DEV_MODE',     false);              /* Live email enabled */

/* ── App Base URL ────────────────────────────────────────── */
define('APP_URL',     'http://localhost/Multidisaster');
define('SESSION_NAME','dicc_sess');
define('ADMIN_EMAIL', 'adityathakre776@gmail.com');  /* This email = admin */

/* Cache TTLs */
define('EQ_CACHE_SECONDS',  20);
define('WX_CACHE_SECONDS',  25);   /* Refresh every ~30 seconds */

/* --- PDO Singleton --- */
function getDB(): PDO {
    static $pdo = null;
    if ($pdo) return $pdo;

    try {
        $dsn = sprintf('mysql:host=%s;port=%d;charset=utf8mb4', DB_HOST, DB_PORT);
        $pdo = new PDO($dsn, DB_USER, DB_PASS, [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]);

        /* Create database if not exists */
        $pdo->exec("CREATE DATABASE IF NOT EXISTS `" . DB_NAME . "` 
                    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
        $pdo->exec("USE `" . DB_NAME . "`");

        /* Create tables */
        _createSchema($pdo);

        return $pdo;
    } catch (PDOException $e) {
        /* Return null-safe fallback — caller must handle */
        error_log('[DICC DB Error] ' . $e->getMessage());
        return null;
    }
}

function _createSchema(PDO $pdo): void {
    /* API cache table */
    $pdo->exec("CREATE TABLE IF NOT EXISTS `api_cache` (
        `id`          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        `cache_key`   VARCHAR(100) NOT NULL UNIQUE,
        `data`        LONGTEXT NOT NULL,
        `created_at`  INT UNSIGNED NOT NULL,
        `expires_at`  INT UNSIGNED NOT NULL,
        INDEX `idx_expires` (`expires_at`),
        INDEX `idx_key`     (`cache_key`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    /* Earthquake events log */
    $pdo->exec("CREATE TABLE IF NOT EXISTS `earthquakes` (
        `id`          VARCHAR(50) PRIMARY KEY,
        `magnitude`   FLOAT NOT NULL,
        `place`       VARCHAR(255),
        `lat`         DECIMAL(9,6),
        `lon`         DECIMAL(9,6),
        `depth`       FLOAT,
        `eq_time`     INT UNSIGNED,
        `url`         VARCHAR(512),
        `net`         VARCHAR(20),
        `alert`       VARCHAR(20),
        `tsunami`     TINYINT(1) DEFAULT 0,
        `fetched_at`  INT UNSIGNED,
        INDEX `idx_mag`     (`magnitude`),
        INDEX `idx_time`    (`eq_time`),
        INDEX `idx_lat_lon` (`lat`, `lon`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    /* IoT sensor nodes registry */
    $pdo->exec("CREATE TABLE IF NOT EXISTS `iot_nodes` (
        `id`         VARCHAR(20)  NOT NULL PRIMARY KEY,
        `name`       VARCHAR(100),
        `city`       VARCHAR(100),
        `state`      VARCHAR(100),
        `lat`        DECIMAL(9,6),
        `lon`        DECIMAL(9,6),
        `firmware`   VARCHAR(20),
        `last_seen`  INT UNSIGNED,
        `status`     ENUM('online','offline','alert') DEFAULT 'offline',
        INDEX `idx_status` (`status`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    /* IoT sensor readings (time-series) */
    $pdo->exec("CREATE TABLE IF NOT EXISTS `sensor_readings` (
        `id`               BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        `node_id`          VARCHAR(20)  NOT NULL,
        `timestamp`        INT UNSIGNED NOT NULL,
        `temperature`      FLOAT,
        `humidity`         FLOAT,
        `rain_sensor`      INT,
        `rain_status`      ENUM('DRY','LIGHT','MODERATE','HEAVY') DEFAULT 'DRY',
        `soil_moisture`    INT,
        `soil_moisture_pct` FLOAT,
        `flood_risk`       FLOAT DEFAULT 0,
        `heatwave_risk`    FLOAT DEFAULT 0,
        `cyclone_risk`     FLOAT DEFAULT 0,
        INDEX `idx_node_time` (`node_id`, `timestamp`),
        INDEX `idx_time`      (`timestamp`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    /* Unified disaster events (from USGS + OWM + ESP32) */
    $pdo->exec("CREATE TABLE IF NOT EXISTS `disaster_events` (
        `id`         VARCHAR(80)  NOT NULL PRIMARY KEY,
        `type`       ENUM('earthquake','flood','heatwave','cyclone') NOT NULL,
        `source`     ENUM('usgs','owm','esp32') NOT NULL,
        `severity`   ENUM('LOW','MEDIUM','HIGH','CRITICAL') DEFAULT 'LOW',
        `risk_score` FLOAT DEFAULT 0,
        `lat`        DECIMAL(9,6),
        `lon`        DECIMAL(9,6),
        `label`      VARCHAR(255),
        `magnitude`  FLOAT,
        `node_id`    VARCHAR(20),
        `event_time` INT UNSIGNED,
        `fetched_at` INT UNSIGNED,
        `active`     TINYINT(1) DEFAULT 1,
        INDEX `idx_type`   (`type`),
        INDEX `idx_active` (`active`),
        INDEX `idx_time`   (`event_time`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    /* Offline buffer — ESP32 syncs when reconnected */
    $pdo->exec("CREATE TABLE IF NOT EXISTS `offline_buffer` (
        `id`          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        `node_id`     VARCHAR(20),
        `payload`     LONGTEXT,
        `buffered_at` INT UNSIGNED,
        `synced`      TINYINT(1) DEFAULT 0,
        INDEX `idx_synced` (`synced`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    /* Weather data log */
    $pdo->exec("CREATE TABLE IF NOT EXISTS `weather_data` (
        `id`          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        `city`        VARCHAR(100),
        `lat`         DECIMAL(9,6),
        `lon`         DECIMAL(9,6),
        `temperature` FLOAT,
        `feels_like`  FLOAT,
        `humidity`    SMALLINT,
        `pressure`    SMALLINT,
        `condition_text` VARCHAR(100),
        `icon`        VARCHAR(20),
        `wind_speed`  FLOAT,
        `wind_dir`    SMALLINT,
        `visibility`  INT,
        `source`      VARCHAR(50),
        `fetched_at`  INT UNSIGNED,
        INDEX `idx_city`   (`city`),
        INDEX `idx_fetch`  (`fetched_at`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    /* Registered users */
    $pdo->exec("CREATE TABLE IF NOT EXISTS `users` (
        `id`            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        `name`          VARCHAR(100)  NOT NULL,
        `email`         VARCHAR(150)  NOT NULL UNIQUE,
        `password_hash` VARCHAR(255)  NOT NULL,
        `role`          ENUM('admin','user') DEFAULT 'user',
        `latitude`      DECIMAL(9,6),
        `longitude`     DECIMAL(9,6),
        `city`          VARCHAR(100),
        `alerts_enabled` TINYINT(1)  DEFAULT 1,
        `is_verified`   TINYINT(1)  DEFAULT 0,
        `otp`           VARCHAR(10),
        `otp_expires`   INT UNSIGNED,
        `created_at`    INT UNSIGNED,
        INDEX `idx_email`  (`email`),
        INDEX `idx_loc`    (`latitude`, `longitude`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    /* Add role column to existing tables (safe on re-run) */
    try { $pdo->exec("ALTER TABLE `users` ADD COLUMN `role` ENUM('admin','user') DEFAULT 'user' AFTER `password_hash`"); } catch(\Throwable $e) {}

    /* User alert records */
    $pdo->exec("CREATE TABLE IF NOT EXISTS `user_alerts` (
        `id`           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        `user_id`      INT UNSIGNED NOT NULL,
        `disaster_type` VARCHAR(30),
        `severity`     VARCHAR(20),
        `distance_km`  FLOAT,
        `message`      VARCHAR(500),
        `node_id`      VARCHAR(20),
        `lat`          DECIMAL(9,6),
        `lon`          DECIMAL(9,6),
        `sent_at`      INT UNSIGNED,
        `read_at`      INT UNSIGNED,
        INDEX `idx_user` (`user_id`),
        INDEX `idx_sent` (`sent_at`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    /* Email queue (dev mode fallback + audit log) */
    $pdo->exec("CREATE TABLE IF NOT EXISTS `email_queue` (
        `id`         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        `to_email`   VARCHAR(150),
        `subject`    VARCHAR(300),
        `body`       LONGTEXT,
        `status`     ENUM('pending','sent','failed') DEFAULT 'pending',
        `created_at` INT UNSIGNED,
        `sent_at`    INT UNSIGNED,
        INDEX `idx_status` (`status`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}

/* --- Cache Helpers --- */
function cacheGet(PDO $pdo, string $key): ?string {
    if (!$pdo) return null;
    try {
        $stmt = $pdo->prepare(
            "SELECT data FROM api_cache WHERE cache_key = ? AND expires_at > ? LIMIT 1"
        );
        $stmt->execute([$key, time()]);
        $row = $stmt->fetch();
        return $row ? $row['data'] : null;
    } catch (PDOException $e) {
        error_log('[DICC Cache Get] ' . $e->getMessage());
        return null;
    }
}

function cacheSet(PDO $pdo, string $key, string $data, int $ttl): bool {
    if (!$pdo) return false;
    try {
        $now     = time();
        $expires = $now + $ttl;
        $stmt = $pdo->prepare(
            "INSERT INTO api_cache (cache_key, data, created_at, expires_at)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE data=VALUES(data), created_at=VALUES(created_at), expires_at=VALUES(expires_at)"
        );
        return $stmt->execute([$key, $data, $now, $expires]);
    } catch (PDOException $e) {
        error_log('[DICC Cache Set] ' . $e->getMessage());
        return false;
    }
}

/* --- Purge expired cache (run occasionally) --- */
function cachePurge(PDO $pdo): void {
    if (!$pdo) return;
    try {
        $pdo->prepare("DELETE FROM api_cache WHERE expires_at < ?")->execute([time()]);
    } catch (PDOException $e) {}
}
