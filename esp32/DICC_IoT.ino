/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  DICC_IoT.ino  —  ESP32 Real-Time Disaster Node  v4.2          ║
 * ║  Disaster Intelligence Command Center  —  India Edition          ║
 * ╠══════════════════════════════════════════════════════════════════╣
 * ║  HARDWARE WIRING                                                 ║
 * ║  DHT11   VCC  → ESP32 3.3V                                      ║
 * ║          DATA → GPIO 4   (+ 10kΩ pull-up to 3.3V)              ║
 * ║          GND  → GND                                             ║
 * ║  Rain    VCC  → ESP32 VIN (5V)                                  ║
 * ║  Sensor  AO   → GPIO 34  (ADC, lower value = more rain)         ║
 * ║          GND  → GND                                             ║
 * ║  Soil    VCC  → ESP32 VIN (5V)                                  ║
 * ║  Sensor  AOUT → GPIO 35  (ADC, lower value = wetter)            ║
 * ║          GND  → GND                                             ║
 * ║  LED RED      → GPIO 25 → 220Ω → GND                           ║
 * ║  LED GREEN    → GPIO 26 → 220Ω → GND                           ║
 * ║  LED YELLOW   → GPIO 27 → 220Ω → GND                           ║
 * ║  Buzzer  (+)  → GPIO 32  (active buzzer, HIGH = ON)             ║
 * ║          (-)  → GND                                             ║
 * ╠══════════════════════════════════════════════════════════════════╣
 * ║  DISASTER THRESHOLDS                                             ║
 * ║  HEATWAVE  → temperature >= 40.0 C                              ║
 * ║  FLOOD     → rain ADC < 1200  AND soil >= 70%  AND hum >= 80%   ║
 * ║  CYCLONE   → rain ADC < 1200  AND humidity >= 85%               ║
 * ╠══════════════════════════════════════════════════════════════════╣
 * ║  REQUIRED LIBRARIES (Arduino Library Manager)                    ║
 * ║  1. DHT sensor library       — Adafruit  (>= 1.4.6)            ║
 * ║  2. Adafruit Unified Sensor  — Adafruit  (>= 1.1.14)           ║
 * ║  3. ArduinoJson              — Blanchon  (v6.x ONLY, NOT v7)    ║
 * ║  4. SPIFFS + Preferences     — built-in ESP32 core              ║
 * ╠══════════════════════════════════════════════════════════════════╣
 * ║  ARDUINO IDE SETTINGS                                            ║
 * ║  Board     : ESP32 Dev Module                                    ║
 * ║  Partition : Default 4MB with spiffs  (required for offline buf) ║
 * ║  Baud rate : 115200                                              ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

/* ── Includes ─────────────────────────────────────────────────────── */
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <SPIFFS.h>
#include <Preferences.h>

/* ── Stringify helpers (MUST be defined before use) ──────────────── */
#define STRINGIFY(x) #x
#define TOSTRING(x)  STRINGIFY(x)


/* ════════════════════════════════════════════════════════════════════
   CHANGE ONLY THESE VALUES — everything else is automatic
   ════════════════════════════════════════════════════════════════════ */

/* --- WiFi --------------------------------------------------------- */
#define WIFI_SSID   "YOUR_WIFI_SSID"       // Your 2.4GHz WiFi name
#define WIFI_PASS   "YOUR_WIFI_PASSWORD"   // Your WiFi password

/* --- Server ------------------------------------------------------- */
/* Run "ipconfig" in CMD → look for "IPv4 Address" under your WiFi   */
/* Example: 192.168.29.45  — use YOUR actual IP, not this example!   */
#define SERVER_HOST "192.168.1.4"          // <-- PUT YOUR PC IP HERE
#define SERVER_PORT 80                     // XAMPP Apache port (default 80)

/* --- Node identity (change when moving the device to a new city) -- */
#define NODE_ID     "DICC-01"             // Unique name, no spaces
#define NODE_CITY   "Nagpur"              // City where sensor is NOW
#define NODE_LAT    21.1458f              // Latitude  of that city
#define NODE_LON    79.0882f              // Longitude of that city

/* ═══════════════════════════════════════════════════════════════════
   CITY COORDINATES REFERENCE
   Nagpur     21.1458,  79.0882       Pune       18.5204,  73.8567
   Mumbai     19.0760,  72.8777       Delhi      28.6139,  77.2090
   Bangalore  12.9716,  77.5946       Hyderabad  17.3850,  78.4867
   Chennai    13.0827,  80.2707       Kolkata    22.5726,  88.3639
   Ahmedabad  23.0225,  72.5714       Jaipur     26.9124,  75.7873
   ═══════════════════════════════════════════════════════════════════ */


/* ── Internal config (no need to change) ────────────────────────── */
#define NODE_NAME        "DICC Mobile Node"
#define NODE_STATE       "Maharashtra"
#define FIRMWARE         "4.2.0"
#define API_KEY          "DICC_IOT_SECRET_2025"  // Must match db.php IOT_API_KEY
#define IOT_ENDPOINT     "/Multidisaster/api/iot.php"

/* ── Disaster thresholds ─────────────────────────────────────────── */
#define HEAT_THRESH      40.0f  // Celsius — heatwave trigger
#define RAIN_HEAVY_ADC   1200   // ADC raw value — below this = HEAVY rain
#define RAIN_MOD_ADC     2200   // ADC raw value — below this = MODERATE rain
#define RAIN_LIGHT_ADC   3200   // ADC raw value — below this = LIGHT rain
#define SOIL_SAT_PCT     70.0f  // % — flood needs soil saturation >= this
#define HUM_FLOOD_PCT    80.0f  // % — flood needs humidity >= this
#define HUM_CYCLONE_PCT  85.0f  // % — cyclone needs humidity >= this

/* ── Timing ──────────────────────────────────────────────────────── */
#define SEND_EVERY_MS    10000UL  // POST to server every 10 seconds
#define WIFI_TIMEOUT_S   30       // Seconds to wait for WiFi
#define HTTP_TIMEOUT_MS  8000     // HTTP request timeout ms
#define OFFLINE_SYNC_MS  60000UL  // Re-sync SPIFFS buffer after reconnect
#define MAX_BUFFER_LINES 500      // Max offline readings before buffer clears

/* ── GPIO pins ───────────────────────────────────────────────────── */
#define DHT_PIN   4    // DHT11 DATA pin
#define RAIN_PIN  34   // Rain sensor AO  — ADC1 Ch6 (input only)
#define SOIL_PIN  35   // Soil sensor AO  — ADC1 Ch7 (input only)
#define LED_R     25   // Red    LED
#define LED_G     26   // Green  LED
#define LED_Y     27   // Yellow LED
#define BUZZ_PIN  32   // Active buzzer

/* ── Objects ─────────────────────────────────────────────────────── */
DHT        dht(DHT_PIN, DHT11);
Preferences prefs;

/* ── Runtime state ───────────────────────────────────────────────── */
static unsigned long _lastSendMs  = 0;
static unsigned long _lastSyncMs  = 0;
static int   _bufCount     = 0;
static int   _postOk       = 0;
static int   _postFail     = 0;
static bool  _wifiOk       = false;
static char  _assignedCity[101] = "";
static int   _assignedUsers = 0;
static const char* SPIFFS_FILE = "/buf.ndjson";

/* ── Forward declarations ────────────────────────────────────────── */
void _connectWiFi();
void _postAndParse(const String& body);
void _bufferLocally(const String& json);
void _syncOffline();
void _printBanner();
void _printReading(float t, float h, int rain, float soil,
                   bool heat, bool flood, bool cyc);
void _led(bool r, bool g, bool y);
void _beep(int n);
const char* _rainStr(int raw);


/* ══════════════════════════════════════════════════════════════════
   SETUP
   ══════════════════════════════════════════════════════════════════ */
void setup() {
    Serial.begin(115200);
    delay(400);

    /* GPIO */
    pinMode(LED_R,    OUTPUT);
    pinMode(LED_G,    OUTPUT);
    pinMode(LED_Y,    OUTPUT);
    pinMode(BUZZ_PIN, OUTPUT);
    _led(false, false, true);   // Yellow = booting

    _printBanner();

    /* Sensors */
    dht.begin();
    analogSetAttenuation(ADC_11db);  // 0-3.3V range on all ADC pins
    // NOTE: plain string concatenation here — F() cannot wrap macro expansion
    Serial.println("[SENSOR] DHT11 ready  -> GPIO " TOSTRING(DHT_PIN));
    Serial.println("[SENSOR] Rain ADC     -> GPIO " TOSTRING(RAIN_PIN));
    Serial.println("[SENSOR] Soil ADC     -> GPIO " TOSTRING(SOIL_PIN));

    /* NVS — restore saved city assignment across reboots */
    prefs.begin("dicc", false);
    String saved = prefs.getString("city", "");
    if (saved.length()) {
        saved.toCharArray(_assignedCity, 101);
        _assignedUsers = prefs.getInt("users", 0);
        Serial.printf("[NVS]    Restored city: %s (%d users)\r\n",
                      _assignedCity, _assignedUsers);
    }
    prefs.end();

    /* SPIFFS offline buffer */
    if (SPIFFS.begin(true)) {
        if (SPIFFS.exists(SPIFFS_FILE)) {
            File f = SPIFFS.open(SPIFFS_FILE, "r");
            if (f) {
                while (f.available()) {
                    if (f.readStringUntil('\n').length() > 2) _bufCount++;
                }
                f.close();
                if (_bufCount) {
                    Serial.printf("[SPIFFS] %d offline readings queued\r\n", _bufCount);
                }
            }
        }
    } else {
        Serial.println(F("[SPIFFS] WARN: mount failed — offline buffer disabled"));
    }

    /* WiFi */
    _connectWiFi();
    _led(false, true, false);   // Green = ready

    Serial.println();
    Serial.println(F("========================================="));
    Serial.println(F("  DICC Node READY — sensor loop starting"));
    Serial.println(F("========================================="));
    Serial.println();
}


/* ══════════════════════════════════════════════════════════════════
   LOOP
   ══════════════════════════════════════════════════════════════════ */
void loop() {
    unsigned long now = millis();

    if (now - _lastSendMs < SEND_EVERY_MS) {
        delay(100);
        return;
    }
    _lastSendMs = now;

    /* ── 1. Read sensors ────────────────────────────────────────── */
    float temp = dht.readTemperature();
    float hum  = dht.readHumidity();
    int   rain = analogRead(RAIN_PIN);  // 0=soaked, 4095=dry
    int   soil = analogRead(SOIL_PIN);  // 0=soaked, 4095=dry

    bool dhtOk = !isnan(temp) && !isnan(hum);
    if (!dhtOk) {
        Serial.println(F("[WARN] DHT11 read failed — check wiring & pull-up"));
        temp = -1.0f;
        hum  = -1.0f;
    }

    // Soil saturation % (inverted: lower raw = wetter)
    float soilPct = (soil >= 0)
        ? constrain((4095.0f - soil) / 4095.0f * 100.0f, 0.0f, 100.0f)
        : -1.0f;

    /* ── 2. Disaster detection ──────────────────────────────────── */
    bool rainHeavy = (rain >= 0 && rain < RAIN_HEAVY_ADC);
    bool soilSat   = (soilPct >= SOIL_SAT_PCT);
    bool humFlood  = (hum >= HUM_FLOOD_PCT);
    bool humCyc    = (hum >= HUM_CYCLONE_PCT);

    bool isHeat    = dhtOk && (temp >= HEAT_THRESH);
    bool isFlood   = rainHeavy && soilSat && humFlood;
    bool isCyclone = rainHeavy && humCyc;

    /* ── 3. Serial dashboard ────────────────────────────────────── */
    _printReading(temp, hum, rain, soilPct, isHeat, isFlood, isCyclone);

    /* ── 4. LED ─────────────────────────────────────────────────── */
    if      (isHeat || isFlood || isCyclone) _led(true,  false, false); // RED
    else if (rainHeavy || soilSat)           _led(true,  true,  false); // RED+YLW
    else if (_wifiOk)                        _led(false, true,  false); // GREEN
    else                                     _led(false, false, true);  // YELLOW

    /* ── 5. Buzzer ──────────────────────────────────────────────── */
    if (isHeat || isFlood || isCyclone) {
        _beep(3);
    }

    /* ── 6. Build JSON ──────────────────────────────────────────── */
    StaticJsonDocument<512> doc;
    doc["api_key"]       = API_KEY;
    doc["node_id"]       = NODE_ID;
    doc["name"]          = NODE_NAME;
    doc["city"]          = NODE_CITY;
    doc["state"]         = NODE_STATE;
    doc["lat"]           = NODE_LAT;
    doc["lon"]           = NODE_LON;
    doc["firmware"]      = FIRMWARE;
    if (dhtOk) {
        doc["temperature"] = round(temp * 10.0f) / 10.0f;
        doc["humidity"]    = round(hum);
    }
    doc["rain_sensor"]   = rain;  // raw ADC — server derives rain status
    doc["soil_moisture"] = soil;  // raw ADC — server derives soil %
    doc["timestamp"]     = (uint32_t)(millis() / 1000);

    String payload;
    serializeJson(doc, payload);

    /* ── 7. Send or buffer ──────────────────────────────────────── */
    if (WiFi.status() == WL_CONNECTED) {
        _wifiOk = true;
        _postAndParse(payload);
        // Sync any buffered offline readings
        if (_bufCount > 0 && (millis() - _lastSyncMs >= OFFLINE_SYNC_MS)) {
            _syncOffline();
            _lastSyncMs = millis();
        }
    } else {
        _wifiOk = false;
        _led(false, false, true);  // Yellow = offline
        Serial.println(F("  [OFFLINE] WiFi lost — reading saved to SPIFFS"));
        _bufferLocally(payload);
        WiFi.reconnect();
    }
}


/* ══════════════════════════════════════════════════════════════════
   HTTP POST + RESPONSE PARSE
   ══════════════════════════════════════════════════════════════════ */
void _postAndParse(const String& body) {
    HTTPClient http;
    String url = String("http://") + SERVER_HOST + ":" + SERVER_PORT + IOT_ENDPOINT;

    if (!http.begin(url)) {
        Serial.println(F("  [HTTP] begin() failed — check SERVER_HOST"));
        _postFail++;
        return;
    }
    http.addHeader("Content-Type", "application/json");
    http.addHeader("X-API-Key",    API_KEY);
    http.setTimeout(HTTP_TIMEOUT_MS);

    int code = http.POST(body);

    if (code == 200) {
        _postOk++;
        Serial.printf("  [HTTP] POST OK %d -> %s\r\n", code, url.c_str());
    } else if (code > 0) {
        _postFail++;
        Serial.printf("  [HTTP] POST ERR %d\r\n", code);
    } else {
        _postFail++;
        Serial.printf("  [HTTP] POST FAIL: %s\r\n", http.errorToString(code).c_str());
        http.end();
        return;
    }

    /* Parse response JSON */
    if (code == 200) {
        String resp = http.getString();
        StaticJsonDocument<512> rdoc;
        DeserializationError err = deserializeJson(rdoc, resp);

        if (!err) {
            const char* city  = rdoc["assigned_city"] | "";
            int         users = rdoc["assigned_users"] | 0;

            // Save new city assignment if server changed it
            if (city && strlen(city) > 0 && strcmp(city, _assignedCity) != 0) {
                strncpy(_assignedCity, city, 100);
                _assignedCity[100] = '\0';
                _assignedUsers = users;
                prefs.begin("dicc", false);
                prefs.putString("city", String(_assignedCity));
                prefs.putInt("users", _assignedUsers);
                prefs.end();
                Serial.println();
                Serial.printf("  [ASSIGN] City: %s | Users: %d\r\n",
                              _assignedCity, _assignedUsers);
                Serial.println();
            }

            // Print server-detected alerts
            JsonArray detected = rdoc["detected"].as<JsonArray>();
            for (JsonObject d : detected) {
                const char* t = d["type"]     | "unknown";
                const char* s = d["severity"] | "?";
                Serial.printf("  [ALERT] %s [%s] -> emails dispatched to %s\r\n",
                    t, s, _assignedCity[0] ? _assignedCity : NODE_CITY);
            }
        }
    }
    http.end();
}


/* ══════════════════════════════════════════════════════════════════
   WIFI CONNECT
   ══════════════════════════════════════════════════════════════════ */
void _connectWiFi() {
    Serial.printf("[WiFi]  Connecting to \"%s\"", WIFI_SSID);
    WiFi.mode(WIFI_STA);
    WiFi.setAutoReconnect(true);
    WiFi.begin(WIFI_SSID, WIFI_PASS);

    int t = 0;
    while (WiFi.status() != WL_CONNECTED && t < WIFI_TIMEOUT_S * 2) {
        delay(500);
        Serial.print('.');
        t++;
    }
    Serial.println();

    if (WiFi.status() == WL_CONNECTED) {
        _wifiOk = true;
        Serial.printf("[WiFi]  CONNECTED  IP: %s  RSSI: %d dBm\r\n",
            WiFi.localIP().toString().c_str(), WiFi.RSSI());
    } else {
        _wifiOk = false;
        Serial.println(F("[WiFi]  FAILED — offline mode active"));
        Serial.println(F("[WiFi]  TIP: Check SSID (must be 2.4GHz), password, router"));
    }
}


/* ══════════════════════════════════════════════════════════════════
   SERIAL DASHBOARD
   ══════════════════════════════════════════════════════════════════ */
void _printReading(float t, float h, int rain, float soil,
                   bool heat, bool flood, bool cyc)
{
    Serial.println(F("--------------------------------------------"));
    Serial.printf("  Node    : %s  (%s, %s)\r\n", NODE_ID, NODE_CITY, NODE_STATE);

    if (_assignedCity[0]) {
        Serial.printf("  Assigned: %s (%d users)\r\n", _assignedCity, _assignedUsers);
    }

    Serial.printf("  Posts   : %d ok / %d fail", _postOk, _postFail);
    if (_bufCount) Serial.printf("  | Buffered: %d", _bufCount);
    Serial.println();
    Serial.println();

    // Temperature
    if (t >= 0) {
        Serial.printf("  Temp    : %.1f C%s\r\n", t,
            heat ? "   >>> HEATWAVE DETECTED <<<" : (t >= 35 ? "  (elevated)" : ""));
    } else {
        Serial.println(F("  Temp    : READ FAILED (check DHT11 wiring)"));
    }

    // Humidity
    if (h >= 0) {
        Serial.printf("  Humidity: %.0f%%%s\r\n", h,
            h >= 85 ? "  (VERY HIGH)" : h >= 80 ? "  (HIGH)" : "");
    } else {
        Serial.println(F("  Humidity: READ FAILED"));
    }

    // Rain
    Serial.printf("  Rain ADC: %d  -> %s\r\n", rain, _rainStr(rain));

    // Soil
    if (soil >= 0) {
        Serial.printf("  Soil    : %.0f%%%s\r\n", soil,
            soil >= 70 ? "  (SATURATED)" : soil >= 40 ? "  (MOIST)" : "  (DRY)");
    } else {
        Serial.println(F("  Soil    : sensor error"));
    }

    // Alerts
    if (flood)   Serial.println(F("\r\n  *** FLOOD RISK  (rain + soil + humidity) ***"));
    if (cyc)     Serial.println(F("\r\n  *** CYCLONE CONDITIONS  (rain + humidity)  ***"));
    Serial.println();
}

void _printBanner() {
    Serial.println();
    Serial.println(F("╔════════════════════════════════════════════╗"));
    Serial.println(F("║  DICC ESP32 Disaster Node  v4.2           ║"));
    Serial.println(F("║  Disaster Intelligence Command Center      ║"));
    Serial.println(F("╠════════════════════════════════════════════╣"));
    Serial.printf ("║  Node   : %-32s║\r\n", NODE_ID);
    Serial.printf ("║  City   : %-32s║\r\n", NODE_CITY);
    Serial.printf ("║  Server : %-32s║\r\n", SERVER_HOST);
    Serial.println(F("╠════════════════════════════════════════════╣"));
    Serial.println(F("║  Heatwave  : temp >= 40 C                 ║"));
    Serial.println(F("║  Flood     : rain+soil+hum all HIGH       ║"));
    Serial.println(F("║  Cyclone   : rain+hum >= 85%              ║"));
    Serial.println(F("╚════════════════════════════════════════════╝"));
    Serial.println();
}


/* ══════════════════════════════════════════════════════════════════
   SPIFFS OFFLINE BUFFER
   ══════════════════════════════════════════════════════════════════ */
void _bufferLocally(const String& json) {
    if (_bufCount >= MAX_BUFFER_LINES) {
        SPIFFS.remove(SPIFFS_FILE);
        _bufCount = 0;
        Serial.println(F("[SPIFFS] Buffer full — oldest readings cleared"));
    }
    File f = SPIFFS.open(SPIFFS_FILE, "a");
    if (f) {
        f.println(json);
        f.close();
        _bufCount++;
    }
}

void _syncOffline() {
    if (!_bufCount || !SPIFFS.exists(SPIFFS_FILE)) return;
    Serial.printf("[SYNC]  Uploading %d buffered readings...\r\n", _bufCount);

    File f = SPIFFS.open(SPIFFS_FILE, "r");
    if (!f) return;

    DynamicJsonDocument bulk(8192);
    bulk["api_key"] = API_KEY;
    bulk["node_id"] = NODE_ID;
    JsonArray arr   = bulk.createNestedArray("readings");

    int c = 0;
    while (f.available() && c < 50) {
        String line = f.readStringUntil('\n');
        line.trim();
        if (line.length() < 5) continue;
        DynamicJsonDocument rec(512);
        if (!deserializeJson(rec, line)) {
            arr.add(rec.as<JsonObject>());
            c++;
        }
    }
    f.close();

    String payload;
    serializeJson(bulk, payload);

    HTTPClient http;
    String url = String("http://") + SERVER_HOST + ":" + SERVER_PORT
                 + IOT_ENDPOINT + "?sync=1";
    http.begin(url);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("X-API-Key", API_KEY);
    http.setTimeout(HTTP_TIMEOUT_MS);

    int code = http.POST(payload);
    http.end();

    if (code == 200) {
        SPIFFS.remove(SPIFFS_FILE);
        _bufCount = 0;
        Serial.printf("[SYNC]  Done — %d readings cleared\r\n", c);
    } else {
        Serial.printf("[SYNC]  Failed HTTP %d — will retry\r\n", code);
    }
}


/* ══════════════════════════════════════════════════════════════════
   HELPERS
   ══════════════════════════════════════════════════════════════════ */
const char* _rainStr(int raw) {
    if (raw < RAIN_HEAVY_ADC) return "HEAVY    (flood risk)";
    if (raw < RAIN_MOD_ADC)   return "MODERATE";
    if (raw < RAIN_LIGHT_ADC) return "LIGHT";
    return "DRY";
}

void _led(bool r, bool g, bool y) {
    digitalWrite(LED_R, r ? HIGH : LOW);
    digitalWrite(LED_G, g ? HIGH : LOW);
    digitalWrite(LED_Y, y ? HIGH : LOW);
}

void _beep(int n) {
    for (int i = 0; i < n; i++) {
        digitalWrite(BUZZ_PIN, HIGH); delay(80);
        digitalWrite(BUZZ_PIN, LOW);  delay(70);
    }
}
