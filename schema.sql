-- ============================================================
-- Disaster Intelligence Command Center — MySQL Schema
-- Run this manually if auto-creation in db.php doesn't work
-- ============================================================

CREATE DATABASE IF NOT EXISTS `disaster_intelligence`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE `disaster_intelligence`;

-- API response cache (TTL-based)
CREATE TABLE IF NOT EXISTS `api_cache` (
  `id`         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `cache_key`  VARCHAR(100)  NOT NULL,
  `data`       LONGTEXT      NOT NULL,
  `created_at` INT UNSIGNED  NOT NULL,
  `expires_at` INT UNSIGNED  NOT NULL,
  UNIQUE KEY `uq_key`     (`cache_key`),
  INDEX       `idx_expires` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Earthquake event log
CREATE TABLE IF NOT EXISTS `earthquakes` (
  `id`         VARCHAR(60)    NOT NULL PRIMARY KEY,
  `magnitude`  FLOAT          NOT NULL,
  `place`      VARCHAR(255),
  `lat`        DECIMAL(9,6),
  `lon`        DECIMAL(9,6),
  `depth`      FLOAT          DEFAULT 0,
  `eq_time`    INT UNSIGNED,
  `url`        VARCHAR(512),
  `net`        VARCHAR(20),
  `alert`      VARCHAR(20),
  `tsunami`    TINYINT(1)     DEFAULT 0,
  `fetched_at` INT UNSIGNED,
  INDEX `idx_mag`     (`magnitude`),
  INDEX `idx_time`    (`eq_time`),
  INDEX `idx_lat_lon` (`lat`, `lon`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Weather readings log
CREATE TABLE IF NOT EXISTS `weather_data` (
  `id`             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `city`           VARCHAR(100),
  `lat`            DECIMAL(9,6),
  `lon`            DECIMAL(9,6),
  `temperature`    FLOAT,
  `feels_like`     FLOAT,
  `humidity`       SMALLINT,
  `pressure`       SMALLINT,
  `condition_text` VARCHAR(100),
  `icon`           VARCHAR(20),
  `wind_speed`     FLOAT,
  `wind_dir`       SMALLINT,
  `visibility`     INT,
  `source`         VARCHAR(50),
  `fetched_at`     INT UNSIGNED,
  INDEX `idx_city`  (`city`),
  INDEX `idx_fetch` (`fetched_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
