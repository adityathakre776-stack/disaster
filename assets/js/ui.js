/**
 * ui.js — UI Controller v2
 * Disaster Intelligence Command Center
 */

const UI = (() => {
    let severityChart = null;
    let activityChart = null;
    let selectedId = null;

    /* ============================================================
       CLOCK (IST)
    ============================================================ */
    function startClock() {
        const _fmt = new Intl.DateTimeFormat('en-IN', {
            timeZone: 'Asia/Kolkata',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true,
        });
        function tick() {
            const el = document.getElementById('top-clock');
            if (el) el.textContent = _fmt.format(new Date()) + ' IST';
        }
        tick();
        setInterval(tick, 1000);
    }

    /* ============================================================
       LIVE FEED
    ============================================================ */
    function renderFeed(eqEvents, wxEvents, onItemClick) {
        const list = document.getElementById('feed-list');
        if (!list) return;

        /* Merge & sort */
        const all = [
            ...eqEvents.map(e => ({ ...e, _t: e.time.getTime() })),
            ...wxEvents.map(e => ({ ...e, _t: e.time.getTime() })),
        ].sort((a, b) => b._t - a._t).slice(0, 90);

        const el_count = document.getElementById('event-count');
        if (el_count) el_count.textContent = all.length;

        const existingIds = new Set([...list.querySelectorAll('.feed-item')].map(el => el.dataset.id));
        const newIds = new Set(all.map(e => e.id));

        /* Remove stale */
        list.querySelectorAll('.feed-item').forEach(el => {
            if (!newIds.has(el.dataset.id)) {
                el.style.transition = 'opacity .3s, transform .3s';
                el.style.opacity = '0';
                el.style.transform = 'translateX(-12px)';
                setTimeout(() => el.remove(), 320);
            }
        });

        /* Add/update */
        all.forEach((ev, idx) => {
            let el = list.querySelector(`[data-id="${CSS.escape(ev.id)}"]`);
            const isNew = !existingIds.has(ev.id);

            if (!el) {
                el = document.createElement('div');
                el.className = 'feed-item' + (isNew ? ' new-event' : '');
                el.dataset.id = ev.id;
                el.addEventListener('click', () => {
                    setSelectedFeedItem(ev.id);
                    onItemClick?.(ev);
                });
            }

            const sev = ev.type === 'earthquake' ? DataManager.getSeverity(ev.magnitude) : 'wx';
            const color = { high: '#ff1144', med: '#ff6600', low: '#ffdd00', wx: '#22aaff' }[sev];
            el.style.setProperty('--item-color', color);
            el.classList.toggle('selected', ev.id === selectedId);

            if (ev.type === 'earthquake') {
                const mag = ev.magnitude.toFixed(1);
                el.innerHTML = `
          <div class="feed-mag ${sev}">M${mag}</div>
          <div class="feed-info">
            <div class="feed-location">${_trunc(ev.label, 36)}</div>
            <div class="feed-meta">
              <span class="feed-time">${_ago(ev.time)}</span>
              <span class="feed-badge badge-${sev}">${sev.toUpperCase()}</span>
              ${ev.depth > 0 ? `<span>${ev.depth.toFixed(0)}km</span>` : ''}
              ${ev.tsunami ? `<span class="badge-tsunami">🌊 TSU</span>` : ''}
            </div>
          </div>`;
            } else {
                const icon = _wxEmoji(ev.condition);
                el.innerHTML = `
          <div class="feed-mag weather-icon">${icon}</div>
          <div class="feed-info">
            <div class="feed-location">${ev.label}${ev.country ? ', ' + ev.country : ''}</div>
            <div class="feed-meta">
              <span style="color:#22aaff;font-weight:600">${ev.temperature.toFixed(1)}°C</span>
              <span class="feed-badge badge-wx">${ev.source === 'OpenWeatherMap' ? 'OWM LIVE' : 'WEATHER'}</span>
              <span>${_trunc(ev.condition, 14)}</span>
            </div>
          </div>`;
            }

            if (isNew) list.prepend(el);
            else if (idx === 0 && !list.firstElementChild) list.appendChild(el);
        });
    }

    function setSelectedFeedItem(id) {
        selectedId = id;
        document.querySelectorAll('.feed-item').forEach(el => {
            el.classList.toggle('selected', el.dataset.id === id);
        });
    }

    /* ============================================================
       POPUP
    ============================================================ */
    function showPopup(data) {
        const popup = document.getElementById('event-popup');
        if (!popup) return;
        popup.classList.remove('hidden');
        void popup.offsetWidth; // reflow for animation

        document.getElementById('popup-title').textContent = _trunc(data.label || data.city || 'Event', 42);

        if (data.type === 'earthquake') {
            document.getElementById('popup-icon').textContent = _eqIcon(data.magnitude);
            document.getElementById('popup-mag').textContent = `M ${data.magnitude.toFixed(1)}`;
            document.getElementById('popup-mag-row').style.display = 'flex';
            document.getElementById('popup-temp-row').style.display = 'none';
            document.getElementById('popup-cond-row').style.display = 'none';
            const humRow = document.getElementById('popup-humidity-row');
            const windRow = document.getElementById('popup-wind-row');
            const depRow = document.getElementById('popup-depth-row');
            if (humRow) humRow.style.display = 'none';
            if (windRow) windRow.style.display = 'none';
            if (depRow) depRow.style.display = 'flex';
            document.getElementById('popup-source').textContent = `USGS · ${data.net?.toUpperCase() || ''}`;
            document.getElementById('popup-link').href = data.url || '#';
            document.getElementById('popup-footer').style.display = '';

            const magEl = document.getElementById('popup-mag');
            const m = data.magnitude;
            magEl.style.color = m >= 5 ? 'var(--danger)' : m >= 3 ? 'var(--warning)' : '#ffe040';

            const tsunEl = document.getElementById('popup-tsunami-row');
            if (tsunEl) tsunEl.style.display = data.tsunami ? 'flex' : 'none';

            const depthVal = document.getElementById('popup-depth');
            if (depthVal) depthVal.textContent = data.depth > 0 ? `${data.depth.toFixed(1)} km` : '—';

        } else {
            /* Weather */
            const iconEl = document.getElementById('popup-icon');
            if (data.iconUrl) {
                iconEl.innerHTML = `<img src="${data.iconUrl}" alt="${data.condition}" style="width:38px;height:38px;object-fit:contain">`;
            } else {
                iconEl.textContent = _wxEmoji(data.condition);
            }
            document.getElementById('popup-mag-row').style.display = 'none';
            document.getElementById('popup-temp-row').style.display = 'flex';
            document.getElementById('popup-cond-row').style.display = 'flex';
            const depRow = document.getElementById('popup-depth-row');
            const humRow = document.getElementById('popup-humidity-row');
            const windRow = document.getElementById('popup-wind-row');
            if (depRow) depRow.style.display = 'none';
            if (humRow) humRow.style.display = 'flex';
            if (windRow) windRow.style.display = 'flex';
            document.getElementById('popup-temp').textContent = `${data.temperature.toFixed(1)}°C  (feels ${data.feelsLike?.toFixed(0) ?? '?'}°C)`;
            document.getElementById('popup-cond').textContent = data.condition;
            document.getElementById('popup-source').textContent = data.source || 'OpenWeatherMap';
            document.getElementById('popup-footer').style.display = 'none';

            const humEl = document.getElementById('popup-humidity');
            const windEl = document.getElementById('popup-wind');
            const tsunEl = document.getElementById('popup-tsunami-row');
            if (humEl) humEl.textContent = `${data.humidity ?? '—'}%  💧`;
            if (windEl) windEl.textContent = `${data.windSpeed ?? '—'} m/s`;
            if (tsunEl) tsunEl.style.display = 'none';
        }

        document.getElementById('popup-location').textContent = data.label || '—';
        document.getElementById('popup-time').textContent = _fmt(data.time);
    }

    function hidePopup() {
        const p = document.getElementById('event-popup');
        if (p) p.classList.add('hidden');
    }

    /* ============================================================
       STATS
    ============================================================ */
    function updateStats(analytics) {
        _counter('stat-total', analytics.total);
        _counter('stat-high', analytics.high);
        _counter('stat-med', analytics.med);
        _counter('stat-low', analytics.low);
        const ml = document.getElementById('marker-count-label');
        if (ml) ml.textContent = `Markers: ${analytics.total}`;
        const maxEl = document.getElementById('stat-max-mag');
        if (maxEl) maxEl.textContent = analytics.maxMag ? `Max: M${analytics.maxMag.toFixed(1)}` : '';
    }

    function _counter(id, target) {
        const el = document.getElementById(id);
        if (!el) return;
        const cur = parseInt(el.textContent) || 0;
        if (cur === target) return;
        const t0 = performance.now();
        const dur = 500;
        (function step(ts) {
            const p = Math.min((ts - t0) / dur, 1);
            el.textContent = Math.round(cur + (target - cur) * (1 - (1 - p) ** 3));
            if (p < 1) requestAnimationFrame(step);
        })(t0);
    }

    /* ============================================================
       CHARTS
    ============================================================ */
    function initCharts() {
        Chart.defaults.color = '#3d5a7a';
        Chart.defaults.font.family = "'JetBrains Mono', monospace";
        Chart.defaults.font.size = 10;

        /* Severity donut */
        const sCtx = document.getElementById('severity-chart');
        if (sCtx) {
            severityChart = new Chart(sCtx, {
                type: 'doughnut',
                data: {
                    labels: ['High M5+', 'Medium M3-5', 'Low <M3'],
                    datasets: [{
                        data: [0, 0, 0],
                        backgroundColor: ['rgba(255,17,68,0.82)', 'rgba(255,102,0,0.82)', 'rgba(255,221,0,0.72)'],
                        borderColor: ['#ff1144', '#ff6600', '#ffdd00'],
                        borderWidth: 1.5,
                        hoverOffset: 6,
                    }],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '68%',
                    animation: { duration: 600 },
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: { padding: 8, boxWidth: 9, font: { size: 9 }, color: '#7a9cc4' },
                        },
                        tooltip: {
                            backgroundColor: 'rgba(4,12,30,0.95)',
                            borderColor: '#00d4ff',
                            borderWidth: 1,
                            titleColor: '#00d4ff',
                            bodyColor: '#e8f4ff',
                        },
                    },
                },
            });
        }

        /* Activity bar */
        const aCtx = document.getElementById('activity-chart');
        if (aCtx) {
            activityChart = new Chart(aCtx, {
                type: 'bar',
                data: {
                    labels: Array.from({ length: 24 }, (_, i) => `${i}h`),
                    datasets: [{
                        label: 'Events',
                        data: Array(24).fill(0),
                        backgroundColor: 'rgba(0,212,255,0.22)',
                        borderColor: '#00d4ff',
                        borderWidth: 1,
                        borderRadius: 3,
                    }],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: { duration: 400 },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            backgroundColor: 'rgba(4,12,30,0.95)',
                            borderColor: '#00d4ff',
                            borderWidth: 1,
                            titleColor: '#00d4ff',
                        },
                    },
                    scales: {
                        x: {
                            grid: { color: 'rgba(0,212,255,0.06)' },
                            ticks: { maxTicksLimit: 12, color: '#3d5a7a', font: { size: 9 } },
                        },
                        y: {
                            grid: { color: 'rgba(0,212,255,0.06)' },
                            ticks: { color: '#3d5a7a', stepSize: 1, font: { size: 9 } },
                            beginAtZero: true,
                        },
                    },
                },
            });
        }
    }

    function updateCharts(analytics) {
        if (severityChart) {
            severityChart.data.datasets[0].data = [analytics.high, analytics.med, analytics.low];
            severityChart.update('none');
        }
        if (activityChart) {
            activityChart.data.datasets[0].data = analytics.buckets.map(b => b.count);
            activityChart.update('none');
        }
    }

    /* ============================================================
       WEATHER PANEL — ALL 28 India Cities, exact OWM readings
    ============================================================ */
    function renderWeatherSummary(wxEvents) {
        const el = document.getElementById('weather-list');
        if (!el) return;
        if (!wxEvents.length) {
            el.innerHTML = '<div class="weather-loading">Fetching live OWM data for 28 cities...</div>';
            return;
        }

        /* Sort by temperature DESC (hottest first) */
        const sorted = [...wxEvents].sort((a, b) => b.temperature - a.temperature);

        el.innerHTML = sorted.map(w => {
            const isLive = w.source === 'OpenWeatherMap';
            const liveBadge = isLive ? `<span class="live-badge owm-live">OWM</span>` : '';
            const icon = w.iconUrl
                ? `<img src="${w.iconUrl}" alt="${w.condition}" class="weather-owm-icon" loading="lazy">`
                : `<span class="weather-icon">${_wxEmoji(w.condition)}</span>`;

            const fDelta = (w.feelsLike - w.temperature).toFixed(1);
            const fSign = fDelta >= 0 ? '+' : '';
            const fColor = Math.abs(fDelta) > 3 ? '#ff8800' : '#888';
            const compass = _windDir(w.windDir);
            const pClass = w.pressure > 1013 ? 'pressure-high' : 'pressure-low';
            const visKm = (w.visibility / 1000).toFixed(1);
            const rain = (w.rain1h ?? 0) > 0 ? `🌧️ ${w.rain1h}mm/h · ` : '';
            const tColor = w.temperature >= 40 ? '#ff1144'
                : w.temperature >= 35 ? '#ff6600'
                    : w.temperature >= 30 ? '#ffaa00'
                        : w.temperature >= 20 ? '#00e5a0'
                            : '#00aaff';

            return `
        <div class="wx-card">
          <div class="wx-card-top">
            <div class="wx-icon-wrap">${icon}</div>
            <div class="wx-city-info">
              <div class="wx-city-name">${w.city || w.label}${liveBadge}</div>
              <div class="wx-state-label">${w.state || ''}</div>
            </div>
            <div class="wx-temp-big" style="color:${tColor}">${w.temperature.toFixed(1)}<span class="wx-deg">°C</span></div>
          </div>
          <div class="wx-metrics">
            <div class="wx-metric"><span>🌡️</span><span class="wx-m-lbl">Feels</span><span class="wx-m-val" style="color:${fColor}">${w.feelsLike.toFixed(1)}° <small>(${fSign}${fDelta})</small></span></div>
            <div class="wx-metric"><span>💧</span><span class="wx-m-lbl">Humidity</span><span class="wx-m-val">${w.humidity}%</span></div>
            <div class="wx-metric"><span>💨</span><span class="wx-m-lbl">Wind</span><span class="wx-m-val">${w.windSpeed} m/s ${compass}</span></div>
            <div class="wx-metric"><span>⬇️</span><span class="wx-m-lbl">Pressure</span><span class="wx-m-val ${pClass}">${w.pressure} hPa</span></div>
            <div class="wx-metric"><span>👁️</span><span class="wx-m-lbl">Visibility</span><span class="wx-m-val">${visKm} km</span></div>
            <div class="wx-metric cond-metric"><span>☁️</span><span class="wx-m-lbl">Sky</span><span class="wx-m-val">${rain}${_cap(w.condition)}</span></div>
          </div>
        </div>`;
        }).join('');
    }

    function _windDir(deg) {
        if (deg == null || isNaN(deg)) return '';
        const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
        return dirs[Math.round(deg / 45) % 8];
    }

    /* ============================================================
       ALERT
    ============================================================ */
    let _alertTimer;
    function showAlert(msg) {
        const banner = document.getElementById('alert-banner');
        const text = document.getElementById('alert-text');
        if (!banner || !text) return;
        text.textContent = msg;
        banner.classList.remove('hidden');
        clearTimeout(_alertTimer);
        _alertTimer = setTimeout(() => banner.classList.add('hidden'), 9000);
        if (typeof playAlertTone === 'function') playAlertTone();
    }

    /* ============================================================
       REFRESH TIMER
    ============================================================ */
    let _refreshInterval, _refreshStart;

    function startRefreshTimer(ms) {
        _refreshInterval = ms;
        _refreshStart = Date.now();
        _tickRefresh();
    }

    function _tickRefresh() {
        const elapsed = Date.now() - _refreshStart;
        const remaining = Math.max(0, _refreshInterval - elapsed);
        const pct = Math.min(100, (elapsed / _refreshInterval) * 100);

        const bar = document.getElementById('refresh-progress');
        const next = document.getElementById('next-refresh');
        if (bar) bar.style.width = pct + '%';
        if (next) next.textContent = Math.ceil(remaining / 1000) + 's';

        if (remaining > 0) setTimeout(_tickRefresh, 400);
    }

    function markUpdated() {
        const el = document.getElementById('last-updated');
        if (el) {
            const d = new Date();
            el.textContent = `${_p(d.getHours())}:${_p(d.getMinutes())}:${_p(d.getSeconds())}`;
        }
        _refreshStart = Date.now();
    }

    /* ============================================================
       LOADING
    ============================================================ */
    function setLoadingProgress(pct, status) {
        const bar = document.getElementById('loading-bar');
        const stat = document.getElementById('loading-status');
        if (bar) bar.style.width = pct + '%';
        if (stat) stat.textContent = status;
    }

    function hideLoading() {
        const el = document.getElementById('loading-screen');
        if (!el) return;
        setTimeout(() => {
            el.classList.add('fade-out');
            setTimeout(() => el.remove(), 900);
        }, 600);
    }

    /* ============================================================
       UTILS
    ============================================================ */
    function _trunc(s, n) { return s && s.length > n ? s.slice(0, n) + '…' : (s || '—'); }
    function _p(n) { return String(n).padStart(2, '0'); }
    function _cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }

    function _ago(date) {
        const diff = Date.now() - date.getTime();
        const m = Math.floor(diff / 60000);
        if (m < 1) return 'just now';
        if (m < 60) return `${m}m ago`;
        return `${Math.floor(m / 60)}h ago`;
    }

    function _fmt(date) {
        if (!date || !(date instanceof Date) || isNaN(date)) return '—';
        return date.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false });
    }

    function _eqIcon(mag) {
        if (mag >= 7) return '🔴';
        if (mag >= 5) return '🟠';
        if (mag >= 3) return '🟡';
        return '🟢';
    }

    function _wxEmoji(cond) {
        if (!cond) return '🌡️';
        const c = cond.toLowerCase();
        if (c.includes('thunder') || c.includes('storm')) return '⛈️';
        if (c.includes('drizzle')) return '🌦️';
        if (c.includes('rain') || c.includes('shower')) return '🌧️';
        if (c.includes('snow') || c.includes('sleet')) return '❄️';
        if (c.includes('mist') || c.includes('fog')) return '🌫️';
        if (c.includes('haze') || c.includes('smoke')) return '😶‍🌫️';
        if (c.includes('dust') || c.includes('sand')) return '🏜️';
        if (c.includes('overcast') || c.includes('broken')) return '☁️';
        if (c.includes('cloud') || c.includes('partly')) return '⛅';
        if (c.includes('clear') || c.includes('sun')) return '☀️';
        if (c.includes('wind')) return '💨';
        return '🌡️';
    }

    /* ============================================================
       PUBLIC API
    ============================================================ */
    return {
        startClock,
        renderFeed,
        setSelectedFeedItem,
        showPopup,
        hidePopup,
        updateStats,
        initCharts,
        updateCharts,
        renderWeatherSummary,
        showAlert,
        startRefreshTimer,
        markUpdated,
        setLoadingProgress,
        hideLoading,
    };
})();
