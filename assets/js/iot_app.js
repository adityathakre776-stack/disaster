/**
 * iot_app.js — Main Controller for IoT Hyperlocal Dashboard
 * Handles: data polling, alert system, charts, feed, IoT panel
 */

(async function IotApp() {

    const POLL_MS = 15000;   /* 15-second refresh */
    const ALERT_RADII = [5, 10, 20]; /* km thresholds */

    /* ── State ─────────────────────────────────────────────────── */
    let disasters = [];
    let iotNodes = [];
    let userLat = null, userLon = null;
    let activeFilter = 'all';   /* all | earthquake | flood | heatwave | cyclone */
    let viewMode = 'globe'; /* globe | map */
    let alertedIds = new Set();
    let sevChart = null, actChart = null;
    let leafletMap = null, leafletMarkers = [], alertCircles = [];
    let pollTimer = null;

    /* ── Leaflet map (lazy-init on first switch) ─────────────────── */
    function _initLeaflet() {
        if (leafletMap) return;
        leafletMap = L.map('leaflet-map', { zoomControl: false, attributionControl: false })
            .setView([22.5, 82.6], 5);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 18 }).addTo(leafletMap);
        L.control.zoom({ position: 'bottomleft' }).addTo(leafletMap);
        setTimeout(() => leafletMap.invalidateSize(), 100);
    }

    function _renderLeaflet() {
        if (!leafletMap) return;
        /* Clear old layers */
        leafletMarkers.forEach(m => m.remove());
        alertCircles.forEach(c => c.remove());
        leafletMarkers = []; alertCircles = [];

        const TYPE_COLOR = { earthquake: '#ff1144', flood: '#0088ff', heatwave: '#ff6600', cyclone: '#cc44ff' };

        /* User location + proximity rings */
        if (userLat !== null) {
            L.circleMarker([userLat, userLon], {
                radius: 8, color: '#00ff88', fillColor: '#00ff88', fillOpacity: 0.9,
                weight: 2,
            }).bindPopup('📍 Your Location').addTo(leafletMap);

            /* Draw alert radius rings if near any disaster */
            const nearDisasters = disasters.filter(d => _kmDist(userLat, userLon, d.lat, d.lon) <= 25);
            if (nearDisasters.length > 0) {
                const colors = ['rgba(255,17,68,0.12)', 'rgba(255,102,0,0.10)', 'rgba(255,215,0,0.08)'];
                ALERT_RADII.forEach((r, i) => {
                    const c = L.circle([userLat, userLon], {
                        radius: r * 1000, color: ['#ff1144', '#ff6600', '#ffd700'][i],
                        fillColor: colors[i], fillOpacity: 1, weight: 1, dashArray: '4,6',
                    }).addTo(leafletMap);
                    alertCircles.push(c);
                });
            }
        }

        /* Disaster zone circles + markers */
        const shown = _filtered();
        shown.forEach(d => {
            const col = TYPE_COLOR[d.type] || '#00d4ff';
            const rKm = Math.max(5, (d.risk_score || 0.3) * 40);
            const zone = L.circle([d.lat, d.lon], {
                radius: rKm * 1000, color: col, fillColor: col,
                fillOpacity: 0.06, weight: 1,
            }).addTo(leafletMap);
            leafletMarkers.push(zone);

            const icon = { earthquake: '🔴', flood: '🔵', heatwave: '🟠', cyclone: '🟣' }[d.type] || '⚪';
            const mk = L.circleMarker([d.lat, d.lon], {
                radius: 7 + (d.risk_score || 0) * 8, color: col, fillColor: col,
                fillOpacity: 0.85, weight: 2,
            }).bindPopup(`<b>${icon} ${d.label}</b><br>Type: ${d.type}<br>Severity: ${d.severity}<br>Source: ${d.source}`)
                .on('click', () => _showPopup(d)).addTo(leafletMap);
            leafletMarkers.push(mk);
        });

        /* IoT blue markers */
        iotNodes.forEach(n => {
            if (!n.lat || !n.lon) return;
            const mk = L.circleMarker([n.lat, n.lon], {
                radius: 9, color: '#00d4ff', fillColor: '#00d4ff', fillOpacity: 0.9, weight: 2,
            }).bindPopup(`<b>📡 ${n.id}</b><br>${n.city || ''}${n.state ? ', ' + n.state : ''}<br>T: ${n.temperature ?? '—'}°C<br>Rain: ${n.rain_status || '—'}`)
                .addTo(leafletMap);
            leafletMarkers.push(mk);
        });
    }

    /* ── Globe render ────────────────────────────────────────────── */
    function _renderGlobe() {
        IotGlobe.updateMarkers(_filtered());
    }

    /* ── Filtered disasters ──────────────────────────────────────── */
    function _filtered() {
        let evs = [...disasters];
        if (activeFilter !== 'all') evs = evs.filter(d => d.type === activeFilter);
        const q = document.getElementById('iot-search')?.value?.toLowerCase().trim();
        if (q) evs = evs.filter(d => d.label?.toLowerCase().includes(q));
        return evs;
    }

    /* ── Feed ────────────────────────────────────────────────────── */
    function _renderFeed() {
        const el = document.getElementById('iot-feed');
        if (!el) return;
        const items = _filtered().slice(0, 80);
        if (!items.length) { el.innerHTML = '<div class="feed-empty">No events match the filter.</div>'; return; }
        const ICON = { earthquake: '🌍', flood: '🌊', heatwave: '🌡️', cyclone: '🌀' };
        el.innerHTML = items.map(d => `
      <div class="feed-item" data-id="${d.id}" onclick="IotAppPublic.onFeedClick('${d.id}')">
        <div class="feed-icon">${ICON[d.type] || '⚡'}</div>
        <div class="feed-body">
          <div class="feed-label" title="${d.label}">${d.label}</div>
          <div class="feed-meta">${d.source.toUpperCase()} · ${_ago(d.time)}</div>
        </div>
        <div class="feed-sev sev-${d.severity}">${d.severity}</div>
      </div>`).join('');
        document.getElementById('feed-count').textContent = items.length;
    }

    /* ── Analytics (right panel) ────────────────────────────────── */
    function _updateStats(analytics) {
        _setEl('stat-total', analytics.total);
        _setEl('stat-critical', analytics.critical);
        _setEl('stat-high', analytics.high);
        _setEl('stat-iot', iotNodes.length);
    }

    function _updateCharts(analytics) {
        const bt = analytics.by_type;

        /* Severity doughnut */
        const sevCtx = document.getElementById('sev-chart')?.getContext('2d');
        if (sevCtx) {
            if (sevChart) sevChart.destroy();
            sevChart = new Chart(sevCtx, {
                type: 'doughnut',
                data: {
                    labels: ['Earthquake', 'Flood', 'Heatwave', 'Cyclone'],
                    datasets: [{
                        data: [bt.earthquake, bt.flood, bt.heatwave, bt.cyclone],
                        backgroundColor: ['#ff1144', '#0088ff', '#ff6600', '#cc44ff'],
                        borderWidth: 0, hoverOffset: 4
                    }],
                },
                options: {
                    plugins: { legend: { display: false } }, cutout: '68%',
                    animation: { duration: 500 }
                },
            });
        }

        /* Activity bar (last 12 entries risk scores) */
        const actCtx = document.getElementById('act-chart')?.getContext('2d');
        const recent = [...disasters].sort((a, b) => b.time - a.time).slice(0, 12).reverse();
        if (actCtx && recent.length) {
            if (actChart) actChart.destroy();
            actChart = new Chart(actCtx, {
                type: 'bar',
                data: {
                    labels: recent.map(d => d.type.charAt(0).toUpperCase()),
                    datasets: [{
                        data: recent.map(d => +(d.risk_score * 100).toFixed(0)),
                        backgroundColor: recent.map(d =>
                            ({
                                earthquake: 'rgba(255,17,68,0.7)', flood: 'rgba(0,136,255,0.7)',
                                heatwave: 'rgba(255,102,0,0.7)', cyclone: 'rgba(204,68,255,0.7)'
                            })[d.type] || '#00d4ff'),
                        borderRadius: 3, borderWidth: 0
                    }],
                },
                options: {
                    plugins: { legend: { display: false } },
                    scales: {
                        x: { ticks: { color: '#88aacc', font: { size: 9 } }, grid: { display: false } },
                        y: { ticks: { color: '#88aacc', font: { size: 9 } }, grid: { color: 'rgba(255,255,255,0.05)' }, max: 100 },
                    },
                    animation: { duration: 400 },
                },
            });
        }
    }

    /* ── IoT Node Panel ─────────────────────────────────────────── */
    function _renderIotPanel() {
        const el = document.getElementById('iot-nodes-list');
        if (!el) return;

        if (!iotNodes.length) {
            el.innerHTML = `<div class="no-iot">
        <div class="no-iot-icon">📡</div>
        <h4>No ESP32 Nodes Online</h4>
        <p>Connect your ESP32 and POST data to<br>
        <code>api/iot.php</code> with API key<br>
        <code>DICC_IOT_SECRET_2025</code></p>
      </div>`;
            return;
        }

        el.innerHTML = iotNodes.map(n => {
            const temp = n.temperature != null ? parseFloat(n.temperature).toFixed(1) : '—';
            const hum = n.humidity != null ? parseInt(n.humidity) + '%' : '—';
            const rain = n.rain_status || '—';
            const soil = n.soil_moisture_pct != null ? parseFloat(n.soil_moisture_pct).toFixed(0) + '%' : '—';
            const fr = parseFloat(n.flood_risk || 0);
            const hr = parseFloat(n.heatwave_risk || 0);
            const cr = parseFloat(n.cyclone_risk || 0);
            const hotClass = parseFloat(temp) >= 40 ? 'hot' : '';
            const rainClass = rain === 'HEAVY' || rain === 'MODERATE' ? 'rain' : '';
            const soilClass = parseFloat(soil) >= 70 ? 'flood' : '';
            const st = n.status || 'offline';
            const pills = [
                fr >= 0.45 ? `<span class="risk-pill flood">FLOOD ${(fr * 100).toFixed(0)}%</span>` : '',
                hr >= 0.35 ? `<span class="risk-pill heatwave">HEAT ${(hr * 100).toFixed(0)}%</span>` : '',
                cr >= 0.50 ? `<span class="risk-pill cyclone">CYCLONE ${(cr * 100).toFixed(0)}%</span>` : '',
            ].filter(Boolean).join('');

            return `<div class="iot-node-card ${st}">
        <div class="node-header">
          <div class="node-status-dot ${st}"></div>
          <div class="node-id">${n.id}</div>
          <div class="node-city">${n.city || ''}${n.state ? ', ' + n.state : ''}</div>
        </div>
        <div class="node-readings">
          <div class="node-reading"><div class="nr-lbl">Temp</div><div class="nr-val ${hotClass}">${temp}°C</div></div>
          <div class="node-reading"><div class="nr-lbl">Humidity</div><div class="nr-val">${hum}</div></div>
          <div class="node-reading"><div class="nr-lbl">Rain</div><div class="nr-val ${rainClass}">${rain}</div></div>
          <div class="node-reading"><div class="nr-lbl">Soil</div><div class="nr-val ${soilClass}">${soil}</div></div>
        </div>
        ${pills ? `<div class="node-risks">${pills}</div>` : ''}
        <div class="risk-bar-wrap" style="margin-top:6px">
          <div class="risk-bar-track" style="flex:1"><div class="risk-bar-fill" style="width:${fr * 100}%;background:#0088ff"></div></div>
          <div class="risk-bar-track" style="flex:1"><div class="risk-bar-fill" style="width:${hr * 100}%;background:#ff6600"></div></div>
          <div class="risk-bar-track" style="flex:1"><div class="risk-bar-fill" style="width:${cr * 100}%;background:#cc44ff"></div></div>
        </div>
      </div>`;
        }).join('');
    }

    /* ── Location-Based Alert System ────────────────────────────── */
    function _checkProximityAlerts() {
        if (userLat === null) return;
        const banner = document.getElementById('alert-banner');
        let worstDist = Infinity, worstEvent = null;

        _filtered().forEach(d => {
            if (!d.lat || !d.lon) return;
            const km = _kmDist(userLat, userLon, d.lat, d.lon);
            if (km < worstDist) { worstDist = km; worstEvent = d; }
            if (km <= 20 && !alertedIds.has(d.id)) {
                alertedIds.add(d.id);
                _triggerNotification(d, km);
            }
        });

        if (worstEvent && worstDist <= 20 && banner) {
            const level = worstDist <= 5 ? 'crit' : worstDist <= 10 ? 'high' : 'med';
            const icon = worstDist <= 5 ? '🚨' : worstDist <= 10 ? '⚠️' : '📍';
            const sev = worstDist <= 5 ? 'HIGH risk' : worstDist <= 10 ? 'MEDIUM risk' : 'LOW risk';
            banner.className = `alert-banner ${level}`;
            banner.querySelector('.alert-icon').textContent = icon;
            banner.querySelector('.alert-text').textContent = `${worstEvent.type.toUpperCase()}: ${worstEvent.label}`;
            banner.querySelector('.alert-dist').textContent = `${worstDist.toFixed(1)}km away — ${sev}`;
        }
    }

    function _triggerNotification(disaster, km) {
        /* Browser sound alert */
        try {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (Ctx) {
                const ctx = new Ctx();
                [[880, 0, 0.2], [660, 0.25, 0.2], [880, 0.5, 0.2]].forEach(([f, t, d]) => {
                    const o = ctx.createOscillator(), g = ctx.createGain();
                    o.connect(g); g.connect(ctx.destination);
                    o.type = 'sine'; o.frequency.value = f;
                    g.gain.setValueAtTime(0.001, ctx.currentTime + t);
                    g.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + t + 0.04);
                    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + d);
                    o.start(ctx.currentTime + t);
                    o.stop(ctx.currentTime + t + d + 0.05);
                });
            }
        } catch (_) { }

        /* Browser Notification */
        if (Notification.permission === 'granted' && km <= 10) {
            const icon = { earthquake: '🌍', flood: '🌊', heatwave: '🌡️', cyclone: '🌀' }[disaster.type] || '⚡';
            new Notification(`${icon} ${disaster.type.toUpperCase()} Alert!`, {
                body: `${disaster.label}\n${km.toFixed(1)} km from your location`,
            });
        }
    }

    /* ── Geolocation ────────────────────────────────────────────── */
    function requestLocation() {
        const btn = document.getElementById('loc-btn');
        if (!navigator.geolocation) { alert('Geolocation not supported'); return; }
        if (btn) btn.textContent = '⏳ Locating...';
        navigator.geolocation.getCurrentPosition(
            pos => {
                userLat = pos.coords.latitude;
                userLon = pos.coords.longitude;
                if (btn) { btn.textContent = '📍 Located'; btn.classList.add('located'); }
                Notification.requestPermission();
                _checkProximityAlerts();
                _renderLeaflet();
            },
            () => { if (btn) btn.textContent = '📍 Location'; }
        );
    }

    /* ── Popup ───────────────────────────────────────────────────── */
    function _showPopup(data) {
        const popup = document.getElementById('event-popup');
        if (!popup) return;
        popup.classList.remove('hidden');
        const ICON = { earthquake: '🌍', flood: '🌊', heatwave: '🌡️', cyclone: '🌀' };
        _setEl('popup-icon', ICON[data.type] || '⚡');
        _setEl('popup-title', data.label || 'Event');
        _setEl('popup-type', data.type);
        _setEl('popup-sev', data.severity);
        _setEl('popup-src', data.source?.toUpperCase());
        _setEl('popup-score', ((data.risk_score || 0) * 100).toFixed(0) + '%');
        _setEl('popup-time', _ago(data.time));
        if (data.magnitude) _setEl('popup-mag', 'M' + parseFloat(data.magnitude).toFixed(1));
        else _setEl('popup-mag', '—');

        if (viewMode === 'globe') IotGlobe.flyTo(data.lat, data.lon);
        else if (leafletMap) leafletMap.flyTo([data.lat, data.lon], 8, { duration: 1 });
    }

    function _hidePopup() {
        document.getElementById('event-popup')?.classList.add('hidden');
    }

    /* ── View toggle (Globe ↔ Map) ──────────────────────────────── */
    function switchView(mode) {
        viewMode = mode;
        const globeDiv = document.getElementById('globe-view');
        const mapDiv = document.getElementById('leaflet-view');
        const btnGlobe = document.getElementById('vt-globe');
        const btnMap = document.getElementById('vt-map');

        if (mode === 'globe') {
            globeDiv.style.display = ''; mapDiv.style.display = 'none';
            btnGlobe.classList.add('active'); btnMap.classList.remove('active');
            IotGlobe.start();
        } else {
            globeDiv.style.display = 'none'; mapDiv.style.display = '';
            btnGlobe.classList.remove('active'); btnMap.classList.add('active');
            _initLeaflet(); _renderLeaflet();
        }
    }

    /* ── Data Loading ────────────────────────────────────────────── */
    async function _loadData() {
        try {
            const view = viewMode === 'globe' ? 'global' : 'india';
            const [disRes, iotRes] = await Promise.allSettled([
                fetch(`api/disasters.php?view=${view}&range=24h&_t=${Date.now()}`).then(r => r.json()),
                fetch(`api/iot.php?_t=${Date.now()}`).then(r => r.json()),
            ]);

            if (disRes.status === 'fulfilled' && disRes.value.disasters) {
                disasters = disRes.value.disasters;
                _updateStats(disRes.value.analytics || { total: disasters.length, critical: 0, high: 0, by_type: {} });
                _updateCharts(disRes.value.analytics || { by_type: { earthquake: 0, flood: 0, heatwave: 0, cyclone: 0 } });
            }
            if (iotRes.status === 'fulfilled' && iotRes.value.nodes) {
                iotNodes = iotRes.value.nodes;
                _renderIotPanel();
            }

            _renderFeed();
            _renderGlobe();
            if (viewMode === 'map') _renderLeaflet();
            _checkProximityAlerts();
            _updateClock();
        } catch (e) {
            console.error('[IotApp] Load error:', e);
        }
    }

    /* ── Refresh Timer UI ───────────────────────────────────────── */
    function _startRefresh() {
        let elapsed = 0;
        const fill = document.getElementById('refresh-fill');
        const next = document.getElementById('next-refresh');
        const tick = setInterval(() => {
            elapsed += 1000;
            const pct = Math.min(100, (elapsed / POLL_MS) * 100);
            if (fill) fill.style.width = pct + '%';
            const rem = Math.ceil((POLL_MS - elapsed) / 1000);
            if (next) next.textContent = rem + 's';
            if (elapsed >= POLL_MS) { elapsed = 0; _loadData(); }
        }, 1000);
        return () => clearInterval(tick);
    }

    /* ── Clock ───────────────────────────────────────────────────── */
    function _updateClock() {
        const el = document.getElementById('iot-clock');
        if (el) {
            el.textContent = new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false }) + ' IST';
        }
    }

    /* ── Helpers ─────────────────────────────────────────────────── */
    function _kmDist(lat1, lon1, lat2, lon2) {
        const R = 6371, d2r = Math.PI / 180;
        const dLat = (lat2 - lat1) * d2r, dLon = (lon2 - lon1) * d2r;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * d2r) * Math.cos(lat2 * d2r) * Math.sin(dLon / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    function _ago(unix) {
        if (!unix) return '—';
        const m = Math.floor((Date.now() / 1000 - unix) / 60);
        if (m < 1) return 'just now';
        if (m < 60) return `${m}m ago`;
        if (m < 1440) return `${Math.floor(m / 60)}h ago`;
        return `${Math.floor(m / 1440)}d ago`;
    }

    function _setEl(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }

    /* ── Loading Screen ──────────────────────────────────────────── */
    async function _boot() {
        const steps = [
            [10, 'Initializing 3D Globe engine...'],
            [25, 'Loading Three.js scene...'],
            [45, 'Connecting to disaster APIs...'],
            [65, 'Fetching IoT node data...'],
            [82, 'Running detection engine...'],
            [95, 'Rendering disaster map...'],
            [100, 'IoT Command Center LIVE ✓'],
        ];
        const bar = document.getElementById('ld-bar');
        const step = document.getElementById('ld-step');
        for (const [pct, msg] of steps) {
            if (bar) bar.style.width = pct + '%';
            if (step) step.textContent = msg;
            await new Promise(r => setTimeout(r, pct === 100 ? 400 : 300));
        }

        /* Init Globe */
        const canvas = document.getElementById('globe-canvas');
        if (canvas) IotGlobe.init(canvas, _showPopup);

        /* Load data */
        await _loadData();

        /* Hide loading */
        const ld = document.getElementById('iot-loading');
        if (ld) { ld.style.opacity = '0'; ld.style.transition = 'opacity 0.4s'; setTimeout(() => ld.remove(), 400); }

        /* Bind controls */
        document.getElementById('vt-globe')?.addEventListener('click', () => switchView('globe'));
        document.getElementById('vt-map')?.addEventListener('click', () => switchView('map'));
        document.getElementById('loc-btn')?.addEventListener('click', requestLocation);
        document.getElementById('popup-close')?.addEventListener('click', _hidePopup);
        document.getElementById('alert-close')?.addEventListener('click', () => {
            document.getElementById('alert-banner')?.classList.add('hidden');
        });
        document.getElementById('iot-search')?.addEventListener('input', () => { _renderFeed(); _renderGlobe(); if (viewMode === 'map') _renderLeaflet(); });

        /* Filter buttons */
        document.querySelectorAll('.flt-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.flt-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                activeFilter = btn.dataset.type;
                _renderFeed(); _renderGlobe(); if (viewMode === 'map') _renderLeaflet();
            });
        });

        _startRefresh();
        setInterval(_updateClock, 1000);
    }

    /* ── Public API (used by HTML onclick) ───────────────────────── */
    window.IotAppPublic = {
        onFeedClick(id) {
            const ev = disasters.find(d => d.id === id);
            if (!ev) return;
            document.querySelectorAll('.feed-item').forEach(el => el.classList.toggle('selected', el.dataset.id === id));
            _showPopup(ev);
        },
    };

    /* ── Start ───────────────────────────────────────────────────── */
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _boot);
    else _boot();

})();
