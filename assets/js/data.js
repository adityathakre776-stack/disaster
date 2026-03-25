/**
 * data.js — Data Layer: API Calls, Normalization, Analytics
 * Disaster Intelligence Command Center — India Edition
 */

const DataManager = (() => {
    const BASE = 'api/';
    const CLI_TTL = 10000; // 10-second client-side de-bounce

    const _cache = {};
    const _fetchedAt = {};

    /* ============================================================
       EARTHQUAKES
    ============================================================ */
    async function fetchEarthquakes(range = '1h') {
        const key = `eq_${range}`;
        if (_cache[key] && (Date.now() - _fetchedAt[key]) < CLI_TTL) return _cache[key];

        try {
            const res = await fetch(`${BASE}earthquakes.php?range=${range}&_t=${Date.now()}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            const data = normalizeEarthquakes(json);
            _cache[key] = data; _fetchedAt[key] = Date.now();
            return data;
        } catch (err) {
            console.warn('[DataManager] EQ backend failed, trying USGS direct:', err.message);
            return _directUSGS(range);
        }
    }

    async function _directUSGS(range) {
        const url = range === '24h'
            ? 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson'
            : 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson';
        try {
            const res = await fetch(url);
            const json = await res.json();
            const data = normalizeEarthquakes(json);
            const key = `eq_${range}`;
            _cache[key] = data; _fetchedAt[key] = Date.now();
            return data;
        } catch (e) {
            console.error('[DataManager] USGS direct also failed:', e);
            return _cache[`eq_${range}`] || [];
        }
    }

    /* Normalize GeoJSON → flat array, India bbox filtered */
    function normalizeEarthquakes(geoJson) {
        if (!geoJson?.features) return [];
        return geoJson.features
            .filter(f => f.geometry && f.properties)
            .map(f => {
                const p = f.properties;
                const [lon, lat, depth] = f.geometry.coordinates;
                return {
                    id: f.id || `eq_${p.time}_${lat}_${lon}`,
                    type: 'earthquake',
                    lat: +lat, lon: +lon, depth: +(depth ?? 0),
                    magnitude: +(p.mag ?? 0),
                    label: p.place || 'Unknown Location',
                    time: new Date(p.time),
                    updated: new Date(p.updated),
                    url: p.url || '#',
                    alert: p.alert,
                    tsunami: !!p.tsunami,
                    net: p.net,
                    status: p.status,
                    felt: p.felt,
                };
            })
            /* India bounding box: lat 5.5–38, lon 67–98 */
            .filter(e =>
                !isNaN(e.lat) && !isNaN(e.lon) && !isNaN(e.magnitude) &&
                e.lat >= 5.5 && e.lat <= 38.0 &&
                e.lon >= 67.0 && e.lon <= 98.0
            )
            .sort((a, b) => b.time - a.time);
    }

    /* ============================================================
       WEATHER
    ============================================================ */
    async function fetchWeather() {
        const key = 'weather';
        if (_cache[key] && (Date.now() - _fetchedAt[key]) < 25000) return _cache[key];

        try {
            const res = await fetch(`${BASE}weather.php?_t=${Date.now()}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            const data = normalizeWeather(json);
            _cache[key] = data; _fetchedAt[key] = Date.now();
            return data;
        } catch (err) {
            console.warn('[DataManager] Weather fetch failed:', err.message);
            return _cache['weather'] || [];
        }
    }

    function normalizeWeather(arr) {
        if (!Array.isArray(arr)) return [];
        return arr
            .map(w => ({
                id: `wx_${(w.city || w.name || '').replace(/\s+/g, '_')}_${w.lat}`,
                type: 'weather',
                lat: +(w.lat ?? 0),
                lon: +(w.lon ?? 0),
                label: w.city || w.name || 'Unknown',
                city: w.city || w.name || 'Unknown',
                state: w.state || '',
                temperature: +(w.temperature ?? w.main?.temp ?? 0),
                feelsLike: +(w.feels_like ?? w.main?.feels_like ?? 0),
                humidity: +(w.humidity ?? w.main?.humidity ?? 0),
                pressure: +(w.pressure ?? w.main?.pressure ?? 0),
                condition: w.condition || w.weather?.[0]?.description || 'N/A',
                conditionId: +(w.condition_id ?? 800),
                icon: w.icon || w.weather?.[0]?.icon || '01d',
                iconUrl: w.icon_url || `https://openweathermap.org/img/wn/${w.icon || '01d'}@2x.png`,
                windSpeed: +(w.wind_speed ?? w.wind?.speed ?? 0),
                windDir: +(w.wind_dir ?? w.wind?.deg ?? 0),
                visibility: +(w.visibility ?? 10000),
                rain1h: +(w.rain_1h ?? 0),
                country: w.country || 'IN',
                source: w.source || 'OWM',
                time: w.time ? new Date(w.time * 1000) : new Date(),
            }))
            .filter(w => !isNaN(w.lat) && !isNaN(w.lon));
    }

    /* ============================================================
       ANALYTICS
    ============================================================ */
    function getSeverity(mag) {
        if (mag >= 5) return 'high';
        if (mag >= 3) return 'med';
        return 'low';
    }

    function analyzeEarthquakes(events) {
        const total = events.length;
        const high = events.filter(e => e.magnitude >= 5).length;
        const med = events.filter(e => e.magnitude >= 3 && e.magnitude < 5).length;
        const low = events.filter(e => e.magnitude < 3).length;

        const now = Date.now();
        const buckets = Array.from({ length: 24 }, (_, i) => ({
            hour: i, count: 0, label: `${i}:00`,
            start: now - (24 - i) * 3_600_000,
            end: now - (23 - i) * 3_600_000,
        }));

        events.forEach(e => {
            const t = e.time instanceof Date ? e.time.getTime() : e.time;
            const bkt = buckets.find(b => t >= b.start && t < b.end);
            if (bkt) bkt.count++;
        });

        const maxMag = events.reduce((m, e) => Math.max(m, e.magnitude), 0);
        const avgMag = total > 0
            ? (events.reduce((s, e) => s + e.magnitude, 0) / total).toFixed(1)
            : 0;

        return { total, high, med, low, buckets, maxMag, avgMag };
    }

    /* ============================================================
       DEDUPLICATION (proximity-based)
    ============================================================ */
    function deduplicateEvents(events, threshKm = 8) {
        const out = [];
        events.forEach(ev => {
            const dup = out.some(r =>
                r.type === ev.type &&
                _haversine(r.lat, r.lon, ev.lat, ev.lon) < threshKm &&
                Math.abs((r.magnitude || 0) - (ev.magnitude || 0)) < 0.15
            );
            if (!dup) out.push(ev);
        });
        return out;
    }

    function _haversine(lat1, lon1, lat2, lon2) {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2
            + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    /* Public */
    return {
        fetchEarthquakes, fetchWeather,
        normalizeEarthquakes, normalizeWeather,
        analyzeEarthquakes, getSeverity, deduplicateEvents,
    };
})();
