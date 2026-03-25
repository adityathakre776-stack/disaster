/**
 * iot_integration.js — IoT Feature Layer for DICC India
 *
 * Attaches to the existing index.html dashboard.
 * Adds:  ESP32 node markers · Flood/Heatwave/Cyclone events ·
 *        Proximity alerts · Right-panel IoT readings · Feed items
 *
 * Does NOT touch: the map tile, terrain, existing markers, layout.
 */
(function IotIntegration() {

    const POLL_MS = 15000;           /* match existing 30 s cycle / half */
    const IOT_URL = 'api/iot.php';
    const DIS_URL = 'api/disasters.php?view=india&range=24h';

    /* ── State ─────────────────────────────────────────────────── */
    let iotNodes = [];
    let disasterEvents = [];   /* from /api/disasters.php */
    let userLat = null;
    let userLon = null;
    let showIotMarkers = false;
    let showFlood = false;
    let showHeatwave = false;
    let showCyclone = false;
    let alertedIds = new Set();
    let iotMapIds = new Set(); /* track ids added to IndiaMap */

    /* ── Data load ──────────────────────────────────────────────── */
    async function loadAll() {
        try {
            const [disRes, iotRes] = await Promise.allSettled([
                fetch(DIS_URL + '&_t=' + Date.now()).then(r => r.json()),
                fetch(IOT_URL + '?_t=' + Date.now()).then(r => r.json()),
            ]);

            if (disRes.status === 'fulfilled' && disRes.value.disasters) {
                disasterEvents = disRes.value.disasters;
                _renderDisasterMarkers();
                _renderIotAlertsFeed();
            }

            if (iotRes.status === 'fulfilled' && iotRes.value.nodes) {
                iotNodes = iotRes.value.nodes;
                _renderIotNodesPanel();
                _renderIotNodeMarkers();
            }

            _checkProximityAlerts();
        } catch (e) {
            console.warn('[IoT Integration]', e);
        }
    }

    /* ── IoT node markers on MapLibre map ───────────────────────── */
    function _renderIotNodeMarkers() {
        if (!window.IndiaMap) return;

        /* Remove stale IoT node markers */
        iotMapIds.forEach(id => {
            try { IndiaMap.removeMarker(id); } catch (_) { }
        });
        iotMapIds.clear();

        if (!showIotMarkers) return;

        iotNodes.forEach(n => {
            if (!n.lat || !n.lon) return;
            const id = 'iot_' + n.id;
            IndiaMap.addMarker({
                id, type: 'iot_node', magnitude: 0,
                lat: parseFloat(n.lat), lon: parseFloat(n.lon),
                label: `[IoT] ${n.id} — ${n.city || ''}`,
                city: n.city || '', state: n.state || '',
                temperature: n.temperature, humidity: n.humidity,
                rain_status: n.rain_status,
                soil_moisture_pct: n.soil_moisture_pct,
                flood_risk: n.flood_risk, heatwave_risk: n.heatwave_risk,
                source: 'ESP32 IoT Node', time: n.last_reading || Date.now() / 1000,
            });
            iotMapIds.add(id);
        });
    }

    /* ── Disaster event markers (flood/heatwave/cyclone) ────────── */
    function _renderDisasterMarkers() {
        if (!window.IndiaMap) return;

        /* Remove stale disaster markers */
        iotMapIds.forEach(id => {
            if (id.startsWith('dis_')) { try { IndiaMap.removeMarker(id); } catch (_) { } iotMapIds.delete(id); }
        });

        const typeMap = { flood: showFlood, heatwave: showHeatwave, cyclone: showCyclone };

        disasterEvents
            .filter(d => d.type !== 'earthquake' && typeMap[d.type])
            .forEach(d => {
                if (!d.lat || !d.lon) return;
                const id = 'dis_' + d.id;
                IndiaMap.addMarker({
                    id, type: d.type, magnitude: d.risk_score * 5,
                    lat: parseFloat(d.lat), lon: parseFloat(d.lon),
                    label: d.label,
                    source: d.source?.toUpperCase() || 'DICC',
                    severity: d.severity,
                    risk_score: d.risk_score,
                    time: d.time || Date.now() / 1000,
                });
                iotMapIds.add(id);
            });
    }

    /* ── Right panel — IoT nodes ────────────────────────────────── */
    function _renderIotNodesPanel() {
        const list = document.getElementById('iot-nodes-list');
        const cntEl = document.getElementById('iot-online-count');
        if (!list) return;

        if (cntEl) cntEl.textContent = iotNodes.length ? `(${iotNodes.length} online)` : '';

        if (!iotNodes.length) {
            list.innerHTML = '<div class="iot-no-nodes">No nodes online — flash ESP32 &amp; POST to <code>api/iot.php</code></div>';
            return;
        }

        list.innerHTML = iotNodes.map(n => {
            const temp = n.temperature != null ? parseFloat(n.temperature).toFixed(1) : '—';
            const hum = n.humidity != null ? parseInt(n.humidity) + '%' : '—';
            const rain = n.rain_status || 'DRY';
            const soil = n.soil_moisture_pct != null ? parseFloat(n.soil_moisture_pct).toFixed(0) + '%' : '—';
            const fr = parseFloat(n.flood_risk || 0);
            const hr = parseFloat(n.heatwave_risk || 0);
            const cr = parseFloat(n.cyclone_risk || 0);
            const st = n.status || 'offline';

            /* Risk tags */
            const tags = [
                fr >= 0.45 ? '<span class="iot-tag flood">FLOOD</span>' : '',
                hr >= 0.35 ? '<span class="iot-tag heat">HEAT</span>' : '',
                cr >= 0.50 ? '<span class="iot-tag cyclone">CYCLONE</span>' : '',
            ].filter(Boolean).join('');

            /* Risk bars */
            const bar = (val, col) =>
                `<div class="iot-bar-track"><div class="iot-bar-fill" style="width:${(val * 100).toFixed(0)}%;background:${col}"></div></div>`;

            return `
      <div class="iot-node-card">
        <div class="iot-node-hdr">
          <span class="iot-status-dot ${st}"></span>
          <span class="iot-nid">${n.id}</span>
          <span class="iot-ncity">${n.city || ''}${n.state ? ', ' + n.state : ''}</span>
        </div>
        <div class="iot-readings-grid">
          <div class="iot-rdg"><span class="iot-rlbl">Temp</span><span class="iot-rval${parseFloat(temp) >= 40 ? ' hot' : ''}">${temp}°C</span></div>
          <div class="iot-rdg"><span class="iot-rlbl">Humidity</span><span class="iot-rval">${hum}</span></div>
          <div class="iot-rdg"><span class="iot-rlbl">Rain</span><span class="iot-rval${rain === 'HEAVY' || rain === 'MODERATE' ? ' wet' : ''}">${rain}</span></div>
          <div class="iot-rdg"><span class="iot-rlbl">Soil Sat.</span><span class="iot-rval${parseFloat(soil) >= 70 ? ' wet' : ''}">${soil}</span></div>
        </div>
        ${tags ? `<div class="iot-tags">${tags}</div>` : ''}
        <div class="iot-risk-bars">
          ${bar(fr, '#0088ff')}${bar(hr, '#ff6600')}${bar(cr, '#cc44ff')}
        </div>
      </div>`;
        }).join('');
    }

    /* ── Right panel — IoT detected disasters feed ──────────────── */
    function _renderIotAlertsFeed() {
        const section = document.getElementById('iot-alerts-section');
        const list = document.getElementById('iot-alert-list');
        const cnt = document.getElementById('iot-alert-count');
        if (!section || !list) return;

        const iotEvents = disasterEvents.filter(d => d.source === 'esp32');
        if (!iotEvents.length) { section.style.display = 'none'; return; }

        section.style.display = '';
        if (cnt) cnt.textContent = iotEvents.length;

        const ICON = { flood: '🌊', heatwave: '🌡️', cyclone: '🌀' };
        list.innerHTML = iotEvents.map(d => `
      <div class="iot-alert-row">
        <span class="iot-alert-icon">${ICON[d.type] || '⚡'}</span>
        <span class="iot-alert-label">${d.label}</span>
        <span class="iot-alert-sev sev-${d.severity}">${d.severity}</span>
      </div>`).join('');
    }

    /* ── Proximity alert system ─────────────────────────────────── */
    function _checkProximityAlerts() {
        if (userLat === null || !disasterEvents.length) return;

        let nearest = null, nearestKm = Infinity;

        disasterEvents.forEach(d => {
            if (!d.lat || !d.lon) return;
            const km = _haversine(userLat, userLon, parseFloat(d.lat), parseFloat(d.lon));
            if (km < nearestKm) { nearestKm = km; nearest = d; }

            /* First-time alert */
            if (km <= 20 && !alertedIds.has(d.id)) {
                alertedIds.add(d.id);
                _playAlert();
                if (Notification.permission === 'granted' && km <= 10) {
                    const icon = { earthquake: '🌍', flood: '🌊', heatwave: '🌡️', cyclone: '🌀' }[d.type] || '⚡';
                    new Notification(`${icon} ${d.type.toUpperCase()} Alert!`, {
                        body: `${d.label}\n${km.toFixed(1)} km from your location`,
                    });
                }
            }
        });

        /* Update existing alert banner */
        if (nearest && nearestKm <= 20) {
            const banner = document.getElementById('alert-banner');
            const text = document.getElementById('alert-text');
            if (banner && text) {
                const zone = nearestKm <= 5 ? '🔴 HIGH' : nearestKm <= 10 ? '🟠 MEDIUM' : '🟡 LOW';
                text.textContent = `📍 ${nearest.type.toUpperCase()}: ${nearest.label} — ${nearestKm.toFixed(1)}km [${zone} risk]`;
                banner.classList.remove('hidden');
            }
        }
    }

    function _haversine(lat1, lon1, lat2, lon2) {
        const R = 6371, r = Math.PI / 180;
        const dL = (lat2 - lat1) * r, dG = (lon2 - lon1) * r;
        const a = Math.sin(dL / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dG / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    function _playAlert() {
        try {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (!Ctx) return;
            const ctx = new Ctx();
            [[880, 0, 0.18], [660, 0.22, 0.18], [880, 0.44, 0.18]].forEach(([f, t, d]) => {
                const o = ctx.createOscillator(), g = ctx.createGain();
                o.connect(g); g.connect(ctx.destination);
                o.type = 'sine'; o.frequency.value = f;
                g.gain.setValueAtTime(0.001, ctx.currentTime + t);
                g.gain.exponentialRampToValueAtTime(0.14, ctx.currentTime + t + 0.04);
                g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + d);
                o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + d + 0.05);
            });
        } catch (_) { }
    }

    /* ── Location request ───────────────────────────────────────── */
    function _requestLocation() {
        const btn = document.getElementById('btn-location');
        if (!navigator.geolocation) { alert('Geolocation not supported by your browser'); return; }
        if (btn) { btn.textContent = '⏳ Locating...'; btn.disabled = true; }
        navigator.geolocation.getCurrentPosition(
            pos => {
                userLat = pos.coords.latitude; userLon = pos.coords.longitude;
                if (btn) {
                    btn.textContent = '📍 Active';
                    btn.classList.add('located'); btn.disabled = false;
                    btn.title = `Monitoring: ${userLat.toFixed(4)}, ${userLon.toFixed(4)}`;
                }
                Notification.requestPermission();
                _checkProximityAlerts();
            },
            () => { if (btn) { btn.textContent = '📍 Alerts'; btn.disabled = false; } }
        );
    }

    /* ── Control bindings ───────────────────────────────────────── */
    function _bindControls() {
        /* Location / proximity alerts */
        document.getElementById('btn-location')
            ?.addEventListener('click', _requestLocation);

        /* IoT Nodes toggle */
        document.getElementById('btn-iot-nodes')?.addEventListener('click', e => {
            showIotMarkers = !showIotMarkers;
            e.currentTarget.classList.toggle('active', showIotMarkers);
            _renderIotNodeMarkers();
        });

        /* Flood toggle */
        document.getElementById('btn-flood')?.addEventListener('click', e => {
            showFlood = !showFlood;
            e.currentTarget.classList.toggle('active', showFlood);
            _renderDisasterMarkers();
        });

        /* Heatwave toggle */
        document.getElementById('btn-heatwave')?.addEventListener('click', e => {
            showHeatwave = !showHeatwave;
            e.currentTarget.classList.toggle('active', showHeatwave);
            _renderDisasterMarkers();
        });

        /* Cyclone toggle */
        document.getElementById('btn-cyclone')?.addEventListener('click', e => {
            showCyclone = !showCyclone;
            e.currentTarget.classList.toggle('active', showCyclone);
            _renderDisasterMarkers();
        });
    }

    /* ── Boot ───────────────────────────────────────────────────── */
    function init() {
        _bindControls();
        /* First load after existing app has booted (~2s) */
        setTimeout(() => {
            loadAll();
            setInterval(loadAll, POLL_MS);
        }, 2200);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
