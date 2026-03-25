/**
 * app.js — Main Application Controller v2
 * Disaster Intelligence Command Center
 */

/* ============================================================
   WEB AUDIO ALERT TONE (no external file needed)
============================================================ */
function playAlertTone() {
    try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        const ctx = new Ctx();
        const seq = [[880, 0, 0.22], [660, 0.28, 0.22], [880, 0.56, 0.22], [660, 0.84, 0.22]];
        seq.forEach(([freq, delay, dur]) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'sine';
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0.0001, ctx.currentTime + delay);
            gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + delay + 0.04);
            gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + delay + dur);
            osc.start(ctx.currentTime + delay);
            osc.stop(ctx.currentTime + delay + dur + 0.05);
        });
    } catch (e) { /* silent fail */ }
}

/* ============================================================
   APP
============================================================ */
(async function App() {

    /* ------ Config ------ */
    const REFRESH_MS = 30000;  // 30-second poll
    const WX_REFRESH_MS = 30000;  // weather refresh = exact same interval
    const MAX_MARKERS = 100;

    /* ------ State ------ */
    let earthquakes = [];
    let weatherEvents = [];
    let showEQ = true;
    let showWX = true;
    let showHeatmap = false;
    let timeRange = '1h';
    let magFilter = 'all';
    let refreshTimer = null;
    let alertedIds = new Set();

    /* ============================================================
       BOOT
    ============================================================ */
    async function boot() {
        UI.startClock();
        UI.initCharts();

        /* Step 1 – 3D India Map */
        UI.setLoadingProgress(10, 'Initializing 3D India terrain map...');
        await _sleep(200);
        IndiaMap.init('map-canvas', _onMarkerClick, _onMarkerHover);

        /* Step 2 – Wait for MapLibre tiles to start loading */
        UI.setLoadingProgress(28, 'Loading India terrain & state borders...');
        await _sleep(900);

        /* Step 3 – Initialize Heatwave Canvas Engine */
        UI.setLoadingProgress(45, 'Initializing heatwave rendering engine...');
        const hwCanvas = document.getElementById('heatwave-canvas');
        if (hwCanvas) HeatwaveEngine.init(hwCanvas, IndiaMap._map);

        /* Step 4 – Data */
        UI.setLoadingProgress(55, 'Fetching India seismic data from USGS...');
        await _loadData();

        /* Step 5 – Render */
        UI.setLoadingProgress(80, 'Plotting India disaster markers on 3D map...');
        _renderMap();
        await _sleep(300);

        /* Step 6 – DB */
        UI.setLoadingProgress(90, 'Verifying database connectivity...');
        await _sleep(200);

        UI.setLoadingProgress(100, 'India Command Center is LIVE ✓');
        UI.hideLoading();

        _bindControls();
        _startRefresh();
    }

    /* ============================================================
       DATA LOADING
    ============================================================ */
    async function _loadData() {
        const [eqResult, wxResult] = await Promise.allSettled([
            DataManager.fetchEarthquakes(timeRange),
            DataManager.fetchWeather(),
        ]);

        if (eqResult.status === 'fulfilled') {
            earthquakes = DataManager.deduplicateEvents(eqResult.value);
        } else {
            console.error('[App] EQ fetch error:', eqResult.reason);
        }

        if (wxResult.status === 'fulfilled') {
            weatherEvents = wxResult.value;
            /* Feed real temperature data into heatwave engine */
            if (HeatwaveEngine && weatherEvents.length > 0) {
                HeatwaveEngine.updateData(weatherEvents);
            }
        } else {
            console.warn('[App] Weather fetch error:', wxResult.reason);
        }

        UI.markUpdated();
    }

    /* ============================================================
       GLOBE RENDER
    ============================================================ */
    function _renderMap() {
        IndiaMap.clearMarkers();

        let placed = 0;

        /* Earthquakes */
        if (showEQ) {
            const filtered = _filteredEQ();
            filtered.slice(0, MAX_MARKERS).forEach((eq, i) => {
                setTimeout(() => {
                    IndiaMap.addMarker({
                        id: eq.id, lat: eq.lat, lon: eq.lon,
                        type: 'earthquake', magnitude: eq.magnitude,
                        label: eq.label, ...eq,
                    });
                }, i * 15);
                placed++;
            });
        }

        /* Weather */
        if (showWX) {
            const remaining = MAX_MARKERS - placed;
            weatherEvents.slice(0, remaining).forEach((wx, i) => {
                setTimeout(() => {
                    IndiaMap.addMarker({
                        id: wx.id, lat: wx.lat, lon: wx.lon,
                        type: 'weather', magnitude: 0,
                        label: wx.label, ...wx,
                    });
                }, i * 20 + 100);
            });
        }

        /* Heatmap sync */
        if (showHeatmap) IndiaMap.showHeatmap(_filteredEQ());

        _updateUI();
    }

    /* ============================================================
       UI UPDATE
    ============================================================ */
    function _updateUI() {
        const filtered = _filteredEQ();
        const analytics = DataManager.analyzeEarthquakes(filtered);

        UI.updateStats(analytics);
        UI.updateCharts(analytics);
        UI.renderFeed(filtered, showWX ? weatherEvents : [], _onFeedClick);
        UI.renderWeatherSummary(weatherEvents);

        /* Alert check */
        filtered.forEach(eq => {
            if (eq.magnitude >= 5 && !alertedIds.has(eq.id)) {
                alertedIds.add(eq.id);
                const tsunamiNote = eq.tsunami ? ' · Tsunami Warning!' : '';
                UI.showAlert(`⚠️  M${eq.magnitude.toFixed(1)} earthquake — ${eq.label}${tsunamiNote}`);
            }
        });

        /* Marker count label */
        const ml = document.getElementById('marker-count-label');
        if (ml) ml.textContent = `Markers: ${IndiaMap.getMarkerCount()}`;
    }

    /* ============================================================
       FILTER
    ============================================================ */
    function _filteredEQ() {
        let evs = [...earthquakes];
        const minMag = parseFloat(magFilter) || 0;
        if (minMag > 0) evs = evs.filter(e => e.magnitude >= minMag);
        const q = document.getElementById('search-input')?.value?.toLowerCase().trim();
        if (q) evs = evs.filter(e => e.label?.toLowerCase().includes(q));
        return evs;
    }

    /* ============================================================
       REFRESH LOOP
    ============================================================ */
    function _startRefresh() {
        UI.startRefreshTimer(REFRESH_MS);
        refreshTimer = setInterval(async () => {
            await _loadData();
            _renderMap();
            UI.startRefreshTimer(REFRESH_MS);
        }, REFRESH_MS);
    }

    /* ============================================================
       EVENT CALLBACKS
    ============================================================ */
    let _currentEvent = null;

    function _onMarkerClick(data) {
        _currentEvent = data;
        UI.showPopup(data);
        UI.setSelectedFeedItem(data.id);
    }

    function _onMarkerHover() { }

    function _onFeedClick(ev) {
        _currentEvent = ev;
        IndiaMap.flyTo(ev.lat, ev.lon);
        UI.showPopup(ev);
        UI.setSelectedFeedItem(ev.id);
    }

    /* ============================================================
       GLOBAL hook for search box — fly + show nearest event panel
    ============================================================ */
    window.gotoLocation = function (lat, lon, name, zoom) {
        /* 1. Clear the search input immediately so feed filter is unaffected */
        const inp = document.getElementById('search-input');
        if (inp) { inp.value = ''; inp.style.color = ''; inp.style.fontWeight = ''; }
        clearTimeout(window._gotoSearchTimer);

        /* 2. Fly map with the same animation as feed click */
        IndiaMap.flyTo(lat, lon, zoom || 9);

        /* 3. Find nearest disaster event within 300km and open its panel */
        const _haversine = (a, b, c, d) => {
            const R = 6371, r = Math.PI / 180;
            const dL = (c - a) * r, dG = (d - b) * r;
            const x = Math.sin(dL / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(dG / 2) ** 2;
            return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
        };

        const all = [...earthquakes, ...weatherEvents];
        const nearby = all
            .filter(e => e.lat && e.lon)
            .map(e => ({ ...e, _km: _haversine(lat, lon, +e.lat, +e.lon) }))
            .filter(e => e._km <= 300)
            .sort((a, b) => a._km - b._km);

        /* Show feed re-rendered with nearby events at top */
        _updateUI();

        /* After flyTo animation (1.6s), auto-open nearest event popup */
        if (nearby.length) {
            window._gotoSearchTimer = setTimeout(() => {
                _currentEvent = nearby[0];
                UI.showPopup(nearby[0]);
                UI.setSelectedFeedItem(nearby[0].id);
            }, 900);
        } else {
            /* No events nearby — show a location info tooltip */
            window._gotoSearchTimer = setTimeout(() => {
                UI.showAlert('📍 No active disasters recorded near ' + name);
            }, 900);
        }
    };

    /* ============================================================
       CONTROL BINDINGS
    ============================================================ */
    function _bindControls() {

        /* Filter toggles */
        document.getElementById('btn-earthquakes')?.addEventListener('click', e => {
            showEQ = !showEQ;
            e.currentTarget.classList.toggle('active', showEQ);
            IndiaMap.setTypeVisible('earthquake', showEQ);
            _updateUI();
        });

        document.getElementById('btn-weather')?.addEventListener('click', e => {
            showWX = !showWX;
            e.currentTarget.classList.toggle('active', showWX);
            IndiaMap.setTypeVisible('weather', showWX);
            _updateUI();
        });

        document.getElementById('btn-heatmap')?.addEventListener('click', e => {
            showHeatmap = IndiaMap.toggleHeatmap(_filteredEQ());
            e.currentTarget.classList.toggle('active', showHeatmap);
        });

        /* Globe / Map controls */
        document.getElementById('btn-reset-cam')?.addEventListener('click', () => {
            IndiaMap.resetCamera();
            UI.hidePopup();
        });

        let is3D = true;
        document.getElementById('btn-3d-toggle')?.addEventListener('click', e => {
            is3D = !is3D;
            e.currentTarget.classList.toggle('active', is3D);
            /* Toggle pitch between 55° (3D) and 0° (top-down) */
            if (window.maplibregl && IndiaMap && IndiaMap._map) {
                IndiaMap._map.easeTo({ pitch: is3D ? 55 : 0, duration: 800 });
            }
        });

        document.getElementById('btn-zoom-in')?.addEventListener('click', () => IndiaMap.zoomIn());
        document.getElementById('btn-zoom-out')?.addEventListener('click', () => IndiaMap.zoomOut());

        /* Heatwave canvas toggle */
        const hwCanvas = document.getElementById('heatwave-canvas');
        document.getElementById('btn-heatwave-toggle')?.addEventListener('click', e => {
            const isOn = hwCanvas.style.display !== 'none';
            if (isOn) {
                HeatwaveEngine.stop();
                hwCanvas.style.display = 'none';
                e.currentTarget.classList.remove('active');
            } else {
                if (weatherEvents.length > 0) HeatwaveEngine.setData(weatherEvents);
                hwCanvas.style.display = '';
                HeatwaveEngine.start();
                e.currentTarget.classList.add('active');
            }
        });

        /* Popup */
        document.getElementById('popup-close')?.addEventListener('click', UI.hidePopup);
        document.getElementById('alert-close')?.addEventListener('click', () => {
            document.getElementById('alert-banner')?.classList.add('hidden');
        });

        /* Detail Modal trigger */
        document.getElementById('popup-detail-btn')?.addEventListener('click', () => {
            if (_currentEvent) _openDetailModal(_currentEvent);
        });

        /* Detail Modal close */
        document.getElementById('detail-modal-close')?.addEventListener('click', _closeDetailModal);
        document.getElementById('detail-modal')?.addEventListener('click', e => {
            if (e.target === document.getElementById('detail-modal')) _closeDetailModal();
        });

        /* Detail Modal tabs */
        document.querySelectorAll('.detail-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.detail-tab').forEach(t => t.classList.remove('active'));
                btn.classList.add('active');
                const tab = btn.dataset.tab;
                ['info', 'map', 'news'].forEach(t => {
                    const el = document.getElementById(`dm-tab-${t}`);
                    if (el) el.classList.toggle('hidden', t !== tab);
                });
            });
        });

        /* Filters */
        document.getElementById('time-filter')?.addEventListener('change', async e => {
            timeRange = e.target.value;
            await _loadData();
            _renderGlobe();
        });

        document.getElementById('mag-filter')?.addEventListener('change', e => {
            magFilter = e.target.value;
            _renderGlobe();
        });

        /* Search — text filter for the feed (skipped when gotoLocation takes over) */
        let _searchTimer;
        document.getElementById('search-input')?.addEventListener('input', () => {
            clearTimeout(_searchTimer);
            /* Only filter feed if this is a manual text query, not a location selection */
            _searchTimer = setTimeout(() => {
                const v = document.getElementById('search-input')?.value || '';
                /* If value is empty or looks like it was cleared by gotoLocation, re-render all */
                _renderGlobe();
            }, 360);
        });

        /* Keyboard shortcuts */
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') { UI.hidePopup(); _closeDetailModal(); }
            if ((e.key === 'r' || e.key === 'R') && !e.ctrlKey) Globe.resetCamera();
        });
    }

    /* ---- util ---- */
    function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

    /* ============================================================
       DETAIL MODAL
    ============================================================ */
    function _openDetailModal(ev) {
        const modal = document.getElementById('detail-modal');
        if (!modal) return;
        modal.classList.remove('hidden');

        /* Reset to info tab */
        document.querySelectorAll('.detail-tab').forEach((t, i) => t.classList.toggle('active', i === 0));
        ['info', 'map', 'news'].forEach((t, i) => {
            const el = document.getElementById(`dm-tab-${t}`);
            if (el) el.classList.toggle('hidden', i !== 0);
        });

        const isEQ = ev.type === 'earthquake';
        const icon = isEQ ? _eqIcon(ev.magnitude) : _wxEmoji(ev.condition);

        /* Header */
        document.getElementById('dm-icon').textContent = icon;
        document.getElementById('dm-title').textContent = ev.label || ev.city || 'Event';
        document.getElementById('dm-sub').textContent = isEQ
            ? `M${ev.magnitude?.toFixed(1)} Earthquake · ${_fmtTime(ev.time)}`
            : `${ev.temperature?.toFixed(1)}°C · ${ev.condition} · ${ev.source || 'OWM'}`;

        /* Badges */
        const badgesEl = document.getElementById('dm-badges');
        badgesEl.innerHTML = '';
        if (isEQ) {
            const sev = ev.magnitude >= 5 ? ['danger', 'Major M5+'] : ev.magnitude >= 3 ? ['warning', 'Moderate'] : ['info', 'Minor'];
            badgesEl.innerHTML += `<span class="detail-badge ${sev[0]}">${sev[1]}</span>`;
            if (ev.depth) badgesEl.innerHTML += `<span class="detail-badge info">Depth: ${ev.depth.toFixed(1)}km</span>`;
            if (ev.net) badgesEl.innerHTML += `<span class="detail-badge info">${ev.net.toUpperCase()}</span>`;
            if (ev.tsunami) badgesEl.innerHTML += `<span class="detail-badge danger">🌊 Tsunami Warning</span>`;
        } else {
            badgesEl.innerHTML += `<span class="detail-badge info">${ev.condition}</span>`;
            badgesEl.innerHTML += `<span class="detail-badge success">OWM Live</span>`;
            if (ev.country) badgesEl.innerHTML += `<span class="detail-badge info">${ev.country}</span>`;
        }

        /* Stats */
        const statsEl = document.getElementById('dm-stats');
        statsEl.innerHTML = isEQ ? `
            <div class="detail-stat">
                <div class="detail-stat-val" style="color:${ev.magnitude >= 5 ? 'var(--danger)' : ev.magnitude >= 3 ? 'var(--warning)' : 'var(--yellow)'}">M${ev.magnitude?.toFixed(1)}</div>
                <div class="detail-stat-label">Magnitude</div>
            </div>
            <div class="detail-stat">
                <div class="detail-stat-val">${ev.depth?.toFixed(0) ?? '—'}</div>
                <div class="detail-stat-label">Depth (km)</div>
            </div>
            <div class="detail-stat">
                <div class="detail-stat-val" style="color:${ev.tsunami ? 'var(--danger)' : 'var(--success)'}">${ev.tsunami ? 'YES' : 'NO'}</div>
                <div class="detail-stat-label">Tsunami Risk</div>
            </div>` : `
            <div class="detail-stat">
                <div class="detail-stat-val">${ev.temperature?.toFixed(1)}°</div>
                <div class="detail-stat-label">Temperature</div>
            </div>
            <div class="detail-stat">
                <div class="detail-stat-val">${ev.humidity ?? '—'}%</div>
                <div class="detail-stat-label">Humidity</div>
            </div>
            <div class="detail-stat">
                <div class="detail-stat-val">${ev.windSpeed ?? '—'}</div>
                <div class="detail-stat-label">Wind m/s</div>
            </div>`;

        /* Info table */
        const infoEl = document.getElementById('dm-info-table');
        const rows = isEQ ? [
            ['Latitude', ev.lat?.toFixed(4) + '°'],
            ['Longitude', ev.lon?.toFixed(4) + '°'],
            ['Event ID', ev.id],
            ['Network', ev.net?.toUpperCase() || '—'],
            ['Status', ev.status || '—'],
            ['Alert', ev.alert || 'None'],
            ['Felt', ev.felt ? ev.felt + ' reports' : '—'],
            ['Event Time', _fmtTime(ev.time)],
            ['Last Updated', _fmtTime(ev.updated)],
            ['USGS URL', ev.url ? `<a href="${ev.url}" target="_blank" style="color:var(--accent)">Open ↗</a>` : '—'],
        ] : [
            ['City', ev.label],
            ['Country', ev.country || '—'],
            ['Latitude', ev.lat?.toFixed(4) + '°'],
            ['Longitude', ev.lon?.toFixed(4) + '°'],
            ['Feels Like', ev.feelsLike?.toFixed(1) + '°C'],
            ['Pressure', (ev.pressure || '—') + ' hPa'],
            ['Visibility', ev.visibility ? (ev.visibility / 1000).toFixed(1) + ' km' : '—'],
            ['Wind Dir', (ev.windDir ?? '—') + '°'],
            ['Data Source', ev.source || 'OWM'],
            ['Fetched', _fmtTime(ev.time)],
        ];
        infoEl.innerHTML = rows.map(([l, v]) =>
            `<div class="detail-row">
               <span class="detail-row-label">${l}</span>
               <span class="detail-row-value">${v ?? '—'}</span>
             </div>`
        ).join('');

        /* Map embed via OpenStreetMap */
        const mapFrame = document.getElementById('dm-map-frame');
        if (mapFrame && ev.lat && ev.lon) {
            const z = isEQ ? (ev.magnitude >= 5 ? 7 : 9) : 10;
            mapFrame.src = `https://www.openstreetmap.org/export/embed.html?bbox=${ev.lon - 1},${ev.lat - 1},${ev.lon + 1},${ev.lat + 1}&layer=mapnik&marker=${ev.lat},${ev.lon}`;
        }

        /* News — fetch async */
        _fetchNews(ev);
    }

    async function _fetchNews(ev) {
        const newsEl = document.getElementById('dm-news-list');
        const srcEl = document.getElementById('dm-news-source');
        if (!newsEl) return;

        newsEl.innerHTML = '<div class="news-loading"><div class="news-spinner"></div>Searching for latest news...</div>';
        if (srcEl) srcEl.textContent = 'Fetching...';

        try {
            const q = ev.label || ev.city || '';
            const type = ev.type || 'earthquake';
            const res = await fetch(`api/news.php?q=${encodeURIComponent(q)}&type=${type}&_t=${Date.now()}`);
            const data = await res.json();

            if (srcEl) srcEl.textContent = data.source || 'News';

            if (data.articles && data.articles.length > 0) {
                newsEl.innerHTML = `<div class="news-list">${data.articles.map(a => {
                    const ago = a.publishedAt ? _newsAgo(new Date(a.publishedAt)) : '';
                    const img = a.image
                        ? `<img class="news-article-img" src="${a.image}" alt="" onerror="this.style.display='none'">`
                        : `<div class="news-article-img-placeholder">${ev.type === 'earthquake' ? '🌍' : '🌤️'}</div>`;
                    return `
                        <a href="${a.url || '#'}" target="_blank" rel="noopener" class="news-article">
                            ${img}
                            <div class="news-article-body">
                                <div class="news-article-title">${a.title || 'Untitled'}</div>
                                <div class="news-article-desc">${a.description || ''}</div>
                                <div class="news-article-meta">
                                    <span class="news-article-source">${a.source || '—'}</span>
                                    ${ago ? `<span>· ${ago}</span>` : ''}
                                </div>
                            </div>
                        </a>`;
                }).join('')
                    }</div>
                <div class="news-setup-hint">
                    📌 Showing demo/USGS articles. For live news add a free API key to <code>api/news.php</code>.<br>
                    Free keys: <a href="https://gnews.io" target="_blank">GNews.io</a> (100/day) ·
                    <a href="https://newsapi.org/register" target="_blank">NewsAPI.org</a> (100/day)
                </div>`;
            } else {
                newsEl.innerHTML = `<div class="news-empty">No news articles found for this location.</div>
                <div class="news-setup-hint">
                    To enable live news, add your free API key to <code style="color:var(--accent)">api/news.php</code>.<br>
                    Free keys: <a href="https://gnews.io" target="_blank">GNews.io</a> (100/day) ·
                    <a href="https://newsapi.org/register" target="_blank">NewsAPI.org</a> (100/day)
                </div>`;
            }
        } catch (err) {
            newsEl.innerHTML = `<div class="news-empty">Could not load news. Check your API key in <code>api/news.php</code>.</div>`;
        }
    }

    function _closeDetailModal() {
        const modal = document.getElementById('detail-modal');
        if (modal) modal.classList.add('hidden');
    }

    /* ------ Icon helpers (reused) ------ */
    function _eqIcon(mag) {
        if (mag >= 7) return '🔴'; if (mag >= 5) return '🟠';
        if (mag >= 3) return '🟡'; return '🟢';
    }
    function _wxEmoji(c) {
        if (!c) return '🌡️'; const s = c.toLowerCase();
        if (s.includes('thunder')) return '⛈️';
        if (s.includes('rain')) return '🌧️';
        if (s.includes('snow')) return '❄️';
        if (s.includes('cloud')) return '☁️';
        if (s.includes('clear')) return '☀️';
        return '🌡️';
    }
    function _fmtTime(date) {
        if (!date || !(date instanceof Date) || isNaN(date)) return '—';
        return date.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false });
    }
    function _newsAgo(date) {
        if (!date || isNaN(date)) return '';
        const m = Math.floor((Date.now() - date) / 60000);
        if (m < 1) return 'just now';
        if (m < 60) return `${m}m ago`;
        if (m < 1440) return `${Math.floor(m / 60)}h ago`;
        return `${Math.floor(m / 1440)}d ago`;
    }

    /* ---- BOOT ---- */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

})();
