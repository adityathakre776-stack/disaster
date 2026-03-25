/**
 * iot_status.js  —  DICC Real-Time ESP32 Connection Hub  v5.0
 *
 * Renders a complete real-time ESP32 connection UI in index.html:
 *  ┌─────────────────────────────────────────────┐
 *  │ 📡 ESP32 IoT Node      [🟢 CONNECTED  LIVE] │
 *  │ NODE LOCATION: Nagpur, Maharashtra           │
 *  │ IST: 05:43:22 AM  •  DICC-01                │
 *  │                                              │
 *  │ TEMPERATURE  HUMIDITY   RAIN    SOIL         │
 *  │   43.2°C      82%      HEAVY   78%           │
 *  │                                              │
 *  │ 🌡 HEAT ████████░ 87%  🌊 FLOOD ████░ 66%   │
 *  │                                              │
 *  │ ⚠ HEATWAVE DETECTED — temp 43.2°C            │
 *  │                              Last: 3s ago    │
 *  └─────────────────────────────────────────────┘
 *  Also injects top-bar live badge with 1-sec ticker.
 *  Slide panel shows city list → user details → shift node.
 */
(function IotHub() {
    'use strict';

    /* ── Config ───────────────────────────────────────────────── */
    const POLL_MS = 10000;    /* API poll every 10 s */
    const LIVE_THRESH = 15;   /* seconds — node is LIVE */
    const ONLINE_THRESH = 300; /* seconds — node counts as online */
    const API_URL = 'api/iot_dashboard.php';
    /* IST via Intl — correct on any OS timezone */
    const _istFmt = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
    const _istDateF = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });

    /* ── State ─────────────────────────────────────────────────── */
    let _data = null;       /* last API response */
    let _prevNode = null;       /* to detect new readings */
    let _panelOpen = false;
    let _panelEl = null;
    let _badgeEl = null;
    let _shiftEl = null;
    let _lastSeen = 0;
    let _onCount = 0;
    let _totCount = 0;
    let _connLog = [];        /* last 4 connection events */

    /* ── IST clock ─────────────────────────────────────────────── */
    function _istNow() { return _istFmt.format(new Date()) + ' IST'; }
    function _istDate() { return _istDateF.format(new Date()); }

    function _agoStr(sec) {
        if (sec < 5) return 'LIVE';
        if (sec < 60) return sec + 's ago';
        if (sec < 3600) return Math.floor(sec / 60) + 'm ago';
        return Math.floor(sec / 3600) + 'h ago';
    }

    /* ── Init ───────────────────────────────────────────────────── */
    function init() {
        _injectStyles();
        _injectBadge();
        _injectPanel();
        _injectShiftModal();
        _startTickers();
        _poll();
        setInterval(_poll, POLL_MS);
    }

    /* ── API poll ───────────────────────────────────────────────── */
    async function _poll() {
        try {
            const r = await fetch(`${API_URL}?action=status&_t=${Date.now()}`);
            if (!r.ok) return;
            _data = await r.json();
            const nodes = _data.nodes || [];
            _onCount = _data.online_count || 0;
            _totCount = _data.total_nodes || 0;

            /* Latest node (most recently seen) */
            const node = nodes.length
                ? nodes.reduce((a, b) => ((b.last_seen || 0) > (a.last_seen || 0) ? b : a), nodes[0])
                : null;

            const prevSeen = _lastSeen;
            _lastSeen = node?.last_seen || 0;

            /* Log connection event */
            const agoNow = _lastSeen ? Math.floor(Date.now() / 1000 - _lastSeen) : 9999;
            if (_lastSeen && _lastSeen !== prevSeen && agoNow <= LIVE_THRESH) {
                _addConnLog(node);
            }

            _updateAnalyticsCard(node);
            if (_panelOpen) _renderPanel();
        } catch (e) { console.warn('[IotHub]', e); }
    }

    /* ── Connection log ─────────────────────────────────────────── */
    function _addConnLog(node) {
        if (!node) return;
        const entry = {
            time: _istNow(),
            city: node.city || '?',
            temp: node.temperature != null ? parseFloat(node.temperature).toFixed(1) + '°C' : '—',
            hum: node.humidity != null ? parseInt(node.humidity) + '%' : '—',
            rain: node.rain_status || 'N/A',
        };
        _connLog.unshift(entry);
        if (_connLog.length > 4) _connLog.pop();

        /* Update log panel if visible */
        _updateConnLog();
    }

    function _updateConnLog() {
        const el = document.getElementById('iot-conn-log');
        if (!el || !_connLog.length) return;
        el.innerHTML = _connLog.map((e, i) => `
        <div style="display:flex;gap:6px;align-items:baseline;padding:3px 0;
                    border-bottom:1px solid rgba(0,212,255,.05);opacity:${1 - (i * .18)}">
          <span style="font-family:monospace;font-size:.58rem;color:#00d4ff;flex-shrink:0">${e.time}</span>
          <span style="font-size:.6rem;color:rgba(180,210,255,.55);flex-shrink:0">${e.city}</span>
          <span style="font-size:.6rem;color:#ff6600;flex-shrink:0">${e.temp}</span>
          <span style="font-size:.6rem;color:#00aaff;flex-shrink:0">${e.hum}</span>
          <span style="font-size:.58rem;color:${e.rain === 'HEAVY' ? '#0088ff' : e.rain === 'MODERATE' ? '#00aaff' : 'rgba(180,210,255,.4)'}">${e.rain}</span>
        </div>`).join('');
    }

    /* ── Analytics Card (right panel) ──────────────────────────── */
    function _updateAnalyticsCard(node) {
        const badge = document.getElementById('iot-conn-badge');
        const cityEl = document.getElementById('iot-current-city');
        const pingEl = document.getElementById('iot-last-ping');
        const alertsEl = document.getElementById('iot-live-alerts');
        const card = document.getElementById('iot-command-card');
        const clockEl = document.getElementById('iot-card-clock');
        const nodeIdEl = document.getElementById('iot-card-nodeid');
        if (!badge) return;

        const agoSec = _lastSeen ? Math.floor(Date.now() / 1000 - _lastSeen) : 9999;
        const isLive = agoSec <= LIVE_THRESH;
        const isOnl = agoSec <= ONLINE_THRESH && _lastSeen > 0;

        /* Connection badge */
        if (isLive) {
            badge.innerHTML = '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#00ff88;margin-right:5px;animation:iot-pulse 1.2s ease-out infinite"></span>CONNECTED';
            badge.style.color = '#00ff88';
            badge.style.background = 'rgba(0,255,136,.1)';
            badge.style.borderColor = 'rgba(0,255,136,.3)';
            if (card) card.style.borderColor = 'rgba(0,255,136,.25)';
        } else if (isOnl) {
            badge.innerHTML = '🟡 Connected';
            badge.style.color = '#ffaa00';
            badge.style.background = 'rgba(255,170,0,.1)';
            badge.style.borderColor = 'rgba(255,170,0,.3)';
            if (card) card.style.borderColor = 'rgba(255,170,0,.15)';
        } else {
            badge.innerHTML = '⚫ Offline';
            badge.style.color = 'rgba(180,210,255,.4)';
            badge.style.background = 'rgba(40,40,40,.3)';
            badge.style.borderColor = 'rgba(180,210,255,.08)';
            if (card) card.style.borderColor = 'rgba(180,210,255,.06)';
        }

        /* City + Node ID */
        if (cityEl) {
            cityEl.textContent = node ? (node.city || 'Unknown') + (node.state ? ', ' + node.state : '') : 'Not Connected';
            cityEl.style.color = isLive ? '#00ff88' : isOnl ? '#ffaa00' : 'rgba(180,210,255,.35)';
        }
        if (nodeIdEl && node) nodeIdEl.textContent = node.id || '—';

        if (!node || !isOnl) {
            /* Disconnected state — grey everything */
            ['iot-r-temp', 'iot-r-hum', 'iot-r-rain', 'iot-r-soil'].forEach(id => {
                const el = document.getElementById(id); if (el) el.textContent = '—';
            });
            ['iot-r-flood', 'iot-r-heat', 'iot-r-cyc'].forEach(id => _setBar(id, 0));
            if (alertsEl) alertsEl.style.display = 'none';
            if (pingEl) pingEl.textContent = 'Last ping: ' + (_lastSeen ? _agoStr(agoSec) : '—');
            return;
        }

        /* Sensor readings */
        const temp = node.temperature != null ? parseFloat(node.temperature) : null;
        const hum = node.humidity != null ? parseInt(node.humidity) : null;
        const rain = node.rain_status || 'DRY';
        const soil = node.soil_moisture_pct != null ? parseFloat(node.soil_moisture_pct) : null;
        const fr = parseFloat(node.flood_risk || 0);
        const hr = parseFloat(node.heatwave_risk || 0);
        const cr = parseFloat(node.cyclone_risk || 0);

        const tempEl = document.getElementById('iot-r-temp');
        const humEl = document.getElementById('iot-r-hum');
        const rainEl = document.getElementById('iot-r-rain');
        const soilEl = document.getElementById('iot-r-soil');

        if (tempEl) {
            tempEl.textContent = temp !== null ? temp.toFixed(1) + '°C' : '—';
            tempEl.style.color = temp >= 40 ? '#ff1144' : temp >= 35 ? '#ff6600' : temp >= 30 ? '#ffaa00' : '#00e5a0';
            /* Flash on new reading */
            if (temp !== null && _prevNode && parseFloat(_prevNode.temperature) !== temp) {
                tempEl.style.transition = 'none';
                tempEl.style.filter = 'brightness(2)';
                setTimeout(() => { tempEl.style.transition = 'filter .6s'; tempEl.style.filter = 'brightness(1)'; }, 50);
            }
        }
        if (humEl) {
            humEl.textContent = hum !== null ? hum + '%' : '—';
            humEl.style.color = hum >= 80 ? '#0088ff' : hum >= 60 ? '#00aaff' : '#e0eeff';
        }
        if (rainEl) {
            rainEl.textContent = rain;
            rainEl.style.color = rain === 'HEAVY' ? '#0088ff' : rain === 'MODERATE' ? '#00aaff' : rain === 'LIGHT' ? '#e0eeff' : 'rgba(180,210,255,.5)';
        }
        if (soilEl) {
            soilEl.textContent = soil !== null ? soil.toFixed(0) + '%' : '—';
            soilEl.style.color = soil >= 70 ? '#0088ff' : '#e0eeff';
        }

        /* Risk bars */
        _setBar('iot-r-flood', fr);
        _setBar('iot-r-heat', hr, true);
        _setBar('iot-r-cyc', cr);

        /* Alert log */
        const acts = [];
        if (hr >= 0.35) acts.push(`🌡️ HEATWAVE — ${temp !== null ? temp.toFixed(1) + '°C' : ''}`);
        if (fr >= 0.45) acts.push(`🌊 FLOOD RISK — Rain: ${rain}`);
        if (cr >= 0.50) acts.push(`🌀 CYCLONE conditions`);
        if (alertsEl) {
            if (acts.length) {
                alertsEl.style.display = 'block';
                alertsEl.innerHTML = acts.map(a => `<div style="padding:1px 0">⚠️ ${a}</div>`).join('');
            } else {
                alertsEl.style.display = 'none';
            }
        }

        /* Last ping */
        if (pingEl) pingEl.textContent = 'Last ping: ' + _agoStr(agoSec);
        _prevNode = node;
    }

    function _setBar(id, val, isHeat = false) {
        const bar = document.getElementById(id + '-bar');
        const pct = document.getElementById(id + '-pct');
        const p = Math.round(val * 100);
        let col = isHeat
            ? (p >= 70 ? '#ff1144' : p >= 40 ? '#ff6600' : '#ff8800')
            : (p >= 70 ? '#ff1144' : p >= 40 ? '#ff6600' : id.includes('flood') ? '#0088ff' : id.includes('cyc') ? '#cc44ff' : '#00e5a0');
        if (bar) { bar.style.width = p + '%'; bar.style.background = col; }
        if (pct) { pct.textContent = p + '%'; pct.style.color = p >= 70 ? '#ff1144' : p >= 40 ? '#ff6600' : 'rgba(180,210,255,.5)'; }
    }

    /* ── Start tickers ─────────────────────────────────────────── */
    function _startTickers() {
        /* Badge ticker — 1 second */
        setInterval(_tickBadge, 1000);

        /* IST clock in analytics card — 1 second */
        setInterval(() => {
            const el = document.getElementById('iot-card-clock');
            if (el) el.textContent = _istNow();
        }, 1000);
    }

    function _tickBadge() {
        const dot = document.getElementById('iot-pulse-dot');
        const lbl = document.getElementById('iot-badge-label');
        if (!dot || !lbl) return;
        const agoSec = _lastSeen ? Math.floor(Date.now() / 1000 - _lastSeen) : 9999;
        const isLive = agoSec <= LIVE_THRESH;
        const isOnl = agoSec <= ONLINE_THRESH && _lastSeen > 0;

        if (isLive && _onCount > 0) {
            dot.style.background = '#00ff88';
            dot.style.animationName = 'iot-pulse';
            lbl.textContent = `CONNECTED · ${_agoStr(agoSec)}`;
            lbl.style.color = '#00ff88';
        } else if (isOnl && _onCount > 0) {
            dot.style.background = '#ffaa00';
            dot.style.animationName = 'none';
            lbl.textContent = `${_onCount}/${_totCount} Online · ${_agoStr(agoSec)}`;
            lbl.style.color = '#ffaa00';
        } else if (_totCount > 0) {
            dot.style.background = '#ff6600';
            dot.style.animationName = 'none';
            lbl.textContent = 'ESP32 Offline';
            lbl.style.color = '#ff6600';
        } else {
            dot.style.background = '#444';
            dot.style.animationName = 'none';
            lbl.textContent = 'No Node';
            lbl.style.color = 'rgba(180,210,255,.35)';
        }
    }

    /* ── Top-bar badge injection ────────────────────────────────── */
    function _injectBadge() {
        const btn = document.getElementById('btn-iot-nodes');
        if (!btn) return;
        _badgeEl = document.createElement('span');
        _badgeEl.id = 'iot-live-badge';
        _badgeEl.title = 'ESP32 Real-Time Connection — click for details';
        _badgeEl.style.cssText = [
            'display:inline-flex;align-items:center;gap:5px;cursor:pointer;',
            'margin-left:8px;padding:3px 10px 3px 7px;border-radius:12px;',
            'background:rgba(0,0,0,.3);border:1px solid rgba(0,212,255,.18);',
            'font-size:.72rem;font-weight:700;color:#e0eeff;vertical-align:middle;',
            'transition:border-color .3s,background .2s;user-select:none;'
        ].join('');
        _badgeEl.innerHTML =
            `<span id="iot-pulse-dot" style="display:inline-block;width:8px;height:8px;
             border-radius:50%;background:#444;flex-shrink:0;
             animation-duration:1.2s;animation-timing-function:ease-out;
             animation-iteration-count:infinite"></span>
             <span id="iot-badge-label">No Node</span>`;
        _badgeEl.addEventListener('click', _togglePanel);
        _badgeEl.addEventListener('mouseenter', () => _badgeEl.style.background = 'rgba(0,212,255,.09)');
        _badgeEl.addEventListener('mouseleave', () => _badgeEl.style.background = 'rgba(0,0,0,.3)');
        btn.parentElement.insertBefore(_badgeEl, btn.nextSibling);

        /* Also inject the IST clock row into the IoT command card */
        setTimeout(_injectCardExtras, 1000);
    }

    function _injectCardExtras() {
        const cityRow = document.getElementById('iot-current-city');
        if (!cityRow || document.getElementById('iot-card-clock')) return;
        /* Insert IST clock + node ID row below city name */
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:6px;margin-top:3px;flex-wrap:wrap';
        row.innerHTML = `
            <span id="iot-card-clock" style="font-family:monospace;font-size:.65rem;color:#00d4ff;
                background:rgba(0,212,255,.08);border:1px solid rgba(0,212,255,.15);
                border-radius:5px;padding:1px 7px;letter-spacing:.03em">${_istNow()}</span>
            <span id="iot-card-nodeid" style="font-family:monospace;font-size:.6rem;
                color:rgba(180,210,255,.4);border:1px solid rgba(180,210,255,.1);
                border-radius:4px;padding:1px 6px">—</span>`;
        cityRow.parentElement.appendChild(row);

        /* Add connection log section above last-ping */
        const pingEl = document.getElementById('iot-last-ping');
        if (pingEl) {
            const logWrap = document.createElement('div');
            logWrap.style.cssText = 'margin-bottom:6px';
            logWrap.innerHTML = `
                <div style="font-size:.58rem;color:rgba(0,212,255,.4);font-weight:700;
                            letter-spacing:.06em;margin-bottom:4px">RECENT PINGS</div>
                <div id="iot-conn-log" style="font-size:.6rem;min-height:24px;
                    color:rgba(180,210,255,.5)">Waiting for node…</div>`;
            pingEl.parentElement.insertBefore(logWrap, pingEl);
        }
    }

    /* ── Slide panel ────────────────────────────────────────────── */
    function _injectPanel() {
        _panelEl = document.createElement('div');
        _panelEl.id = 'iot-status-panel';
        _panelEl.style.cssText = [
            'display:none;position:fixed;top:56px;right:16px;',
            'width:400px;max-height:80vh;overflow-y:auto;',
            'background:rgba(4,12,32,.97);border:1px solid rgba(0,212,255,.2);',
            'border-radius:12px;z-index:8000;',
            'box-shadow:0 12px 50px rgba(0,0,0,.7);backdrop-filter:blur(20px);',
            'animation:iotSlide .18s ease'
        ].join('');
        document.body.appendChild(_panelEl);
        document.addEventListener('click', e => {
            if (_panelOpen && !_panelEl.contains(e.target) && !_badgeEl?.contains(e.target)) _closePanel();
        });
    }

    function _togglePanel() { _panelOpen ? _closePanel() : _openPanel(); }
    function _openPanel() { _panelOpen = true; _panelEl.style.display = 'block'; _renderPanel(); }
    function _closePanel() { _panelOpen = false; _panelEl.style.display = 'none'; }

    /* ── Panel render ───────────────────────────────────────────── */
    function _renderPanel() {
        if (!_panelEl) return;
        const d = _data;
        if (!d) {
            _panelEl.innerHTML = '<div style="padding:24px;text-align:center;color:rgba(180,210,255,.3)">Loading…</div>';
            return;
        }

        const on = d.online_count ?? 0;
        const tot = d.total_nodes ?? 0;
        const usr = d.total_users ?? 0;
        const nodes = d.nodes || [];
        const asgn = d.assignments || [];
        const nowS = Math.floor(Date.now() / 1000);

        let html = `
        <!-- Header -->
        <div style="padding:14px 16px 10px;border-bottom:1px solid rgba(0,212,255,.1);
                    display:flex;align-items:center;gap:10px">
          <span style="font-size:1.2rem">📡</span>
          <div style="flex:1">
            <div style="font-size:.9rem;font-weight:700;color:#00d4ff">ESP32 IoT Connection Hub</div>
            <div style="font-size:.65rem;color:rgba(180,210,255,.4);margin-top:2px">
              ${on} online · ${tot} total · ${usr} users · IST ${_istNow()}
            </div>
          </div>
          <button onclick="document.getElementById('iot-status-panel').style.display='none'"
            style="background:none;border:none;color:rgba(180,210,255,.4);cursor:pointer;font-size:1.3rem;line-height:1">×</button>
        </div>

        <!-- Node Connection Status -->
        ${_panelNodeStatus(nodes, nowS)}

        <!-- City assignments -->
        <div style="padding:10px 16px 4px">
          <div style="font-size:.68rem;font-weight:700;color:rgba(0,212,255,.55);letter-spacing:.07em;margin-bottom:8px">
            🏙️ CITIES BY REGISTERED USERS
            <span style="font-weight:400;color:rgba(180,210,255,.3);font-size:.58rem">— click any city for details</span>
          </div>`;

        if (!asgn.length) {
            html += `<div style="text-align:center;padding:14px 0;color:rgba(180,210,255,.3);font-size:.75rem">
                No registered users yet</div>`;
        } else {
            asgn.forEach(a => {
                const dotC = a.node_online ? '#00ff88' : a.node_id ? '#888' : '#333';
                const anim = a.node_online ? 'iot-pulse 1.2s ease-out infinite' : 'none';
                html += `
                <div class="iot-city-row" data-city="${a.city}" data-lat="${a.avg_lat}" data-lon="${a.avg_lon}"
                  style="display:flex;align-items:center;gap:8px;padding:7px 10px;margin-bottom:4px;
                         border-radius:8px;cursor:pointer;border:1px solid rgba(0,212,255,.06);
                         background:rgba(0,212,255,.03);transition:background .12s"
                  onmouseenter="this.style.background='rgba(0,212,255,.09)'"
                  onmouseleave="this.style.background='rgba(0,212,255,.03)'">
                  <span style="width:7px;height:7px;border-radius:50%;flex-shrink:0;
                               background:${dotC};animation:${anim};display:inline-block"></span>
                  <div style="flex:1;min-width:0">
                    <div style="font-size:.82rem;font-weight:600;color:#e0eeff">${a.city}</div>
                    <div style="font-size:.6rem;color:rgba(180,210,255,.38);margin-top:1px">
                      👥 ${a.user_count} user${a.user_count != 1 ? 's' : ''}
                      ${a.node_id ? ` · <span style="font-family:monospace;color:${a.node_online ? '#00ff88' : '#888'}">${a.node_id}</span>` : ''}
                    </div>
                  </div>
                  <button class="iot-shift-to" data-city="${a.city}" data-lat="${a.avg_lat}" data-lon="${a.avg_lon}"
                    style="font-size:.58rem;padding:3px 8px;border-radius:6px;border:1px solid rgba(0,212,255,.2);
                           background:rgba(0,212,255,.06);color:#00d4ff;cursor:pointer;font-weight:700;white-space:nowrap"
                    title="Deploy node to ${a.city}">⇄ Set</button>
                  <span style="color:rgba(180,210,255,.3);font-size:.75rem">›</span>
                </div>`;
            });
        }
        html += `</div>`;
        _panelEl.innerHTML = html;

        /* Bind city clicks */
        _panelEl.querySelectorAll('.iot-city-row').forEach(row => {
            row.addEventListener('click', e => {
                if (e.target.classList.contains('iot-shift-to') || e.target.closest('.iot-shift-to')) return;
                const city = row.dataset.city;
                if (window.gotoLocation) gotoLocation(parseFloat(row.dataset.lat), parseFloat(row.dataset.lon), city, 10);
                _loadCityDetail(city, parseFloat(row.dataset.lat), parseFloat(row.dataset.lon));
            });
        });
        _panelEl.querySelectorAll('.iot-shift-to').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                _shiftNodeTo(btn.dataset.city, parseFloat(btn.dataset.lat), parseFloat(btn.dataset.lon));
            });
        });
    }

    function _panelNodeStatus(nodes, nowS) {
        if (!nodes.length) return `
        <div style="margin:8px 14px;padding:14px;border-radius:8px;text-align:center;
                    background:rgba(255,255,255,.02);border:1px dashed rgba(0,212,255,.12)">
          <div style="color:rgba(180,210,255,.4);font-size:.78rem">📡 No ESP32 nodes registered</div>
          <div style="color:rgba(180,210,255,.25);font-size:.65rem;margin-top:4px">
            Flash <code style="color:#00d4ff">DICC_IoT.ino</code> → connect to WiFi → POST to <code style="color:#00d4ff">api/iot.php</code>
          </div>
        </div>`;

        return nodes.map(n => {
            const ago = n.last_seen ? nowS - n.last_seen : 9999;
            const isLive = ago <= LIVE_THRESH;
            const isOnl = ago <= ONLINE_THRESH;
            const agoS = _agoStr(ago);
            const temp = n.temperature != null ? parseFloat(n.temperature).toFixed(1) + '°C' : '—';
            const hum = n.humidity != null ? parseInt(n.humidity) + '%' : '—';
            const hr = parseFloat(n.heatwave_risk || 0);
            const fr = parseFloat(n.flood_risk || 0);
            const cr = parseFloat(n.cyclone_risk || 0);
            const maxR = Math.max(hr, fr, cr);
            const rCol = maxR >= .7 ? '#ff1144' : maxR >= .4 ? '#ff6600' : '#00e5a0';

            const alrts = [
                hr >= .35 ? `🌡️ HEAT ${(hr * 100).toFixed(0)}%` : '',
                fr >= .45 ? `🌊 FLOOD ${(fr * 100).toFixed(0)}%` : '',
                cr >= .50 ? `🌀 CYCLONE ${(cr * 100).toFixed(0)}%` : '',
            ].filter(Boolean);

            return `
            <div style="margin:8px 14px;padding:11px 13px;border-radius:10px;
                        background:rgba(0,${isLive ? 255 : isOnl ? 170 : 60},${isLive ? 136 : isOnl ? 0 : 0},.05);
                        border:1px solid rgba(0,${isLive ? 255 : isOnl ? 170 : 60},${isLive ? 136 : isOnl ? 0 : 0},.15)">
              <div style="display:flex;align-items:center;gap:7px;margin-bottom:8px">
                <span style="width:9px;height:9px;border-radius:50%;flex-shrink:0;display:inline-block;
                             background:${isLive ? '#00ff88' : isOnl ? '#ffaa00' : '#666'};
                             ${isLive ? 'animation:iot-pulse 1.2s ease-out infinite' : ''}"></span>
                <span style="font-family:monospace;font-size:.82rem;font-weight:700;
                             color:${isLive ? '#00ff88' : isOnl ? '#ffaa00' : '#888'}">${n.id}</span>
                <span style="flex:1;font-size:.65rem;color:rgba(180,210,255,.4)">${n.city || '—'}${n.state ? ', ' + n.state : ''}</span>
                <span style="font-size:.62rem;font-family:monospace;
                             color:${isLive ? '#00ff88' : isOnl ? '#ffaa00' : 'rgba(180,210,255,.3)'}">
                  ${isLive ? '● LIVE' : '○ ' + agoS}
                </span>
              </div>
              <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:5px;font-size:.7rem">
                <div style="text-align:center;padding:5px 3px;background:rgba(255,255,255,.03);border-radius:5px">
                  <div style="font-weight:700;color:${parseFloat(temp) >= 40 ? '#ff1144' : parseFloat(temp) >= 35 ? '#ff6600' : '#e0eeff'}">${temp}</div>
                  <div style="font-size:.55rem;color:rgba(180,210,255,.35)">Temp</div>
                </div>
                <div style="text-align:center;padding:5px 3px;background:rgba(255,255,255,.03);border-radius:5px">
                  <div style="font-weight:700;color:#00aaff">${hum}</div>
                  <div style="font-size:.55rem;color:rgba(180,210,255,.35)">Humidity</div>
                </div>
                <div style="text-align:center;padding:5px 3px;background:rgba(255,255,255,.03);border-radius:5px">
                  <div style="font-weight:700;font-size:.65rem;color:${n.rain_status === 'HEAVY' || n.rain_status === 'MODERATE' ? '#0088ff' : 'rgba(180,210,255,.6)'}">${n.rain_status || 'DRY'}</div>
                  <div style="font-size:.55rem;color:rgba(180,210,255,.35)">Rain</div>
                </div>
                <div style="text-align:center;padding:5px 3px;background:rgba(255,255,255,.03);border-radius:5px">
                  <div style="font-weight:700;color:${rCol}">${(maxR * 100).toFixed(0)}%</div>
                  <div style="font-size:.55rem;color:rgba(180,210,255,.35)">Risk</div>
                </div>
              </div>
              ${alrts.length ? `<div style="margin-top:7px;font-size:.63rem;font-weight:700;color:#ff6600;letter-spacing:.03em">
                ⚠️ ${alrts.join(' · ')}</div>` : ''}
              <div style="height:3px;border-radius:2px;margin-top:8px;overflow:hidden;background:rgba(255,255,255,.04)">
                <div style="height:100%;width:${(maxR * 100).toFixed(0)}%;background:${rCol};transition:width .6s;border-radius:2px"></div>
              </div>
            </div>`;
        }).join('');
    }

    /* ── City user detail panel ─────────────────────────────────── */
    async function _loadCityDetail(city, lat, lon) {
        try {
            const r = await fetch(`${API_URL}?action=clients&city=${encodeURIComponent(city)}&_t=${Date.now()}`);
            const d = await r.json();
            _renderCityDetail(city, d.clients || [], lat, lon);
        } catch (e) { }
    }

    function _renderCityDetail(city, clients, lat, lon) {
        let panel = document.getElementById('iot-city-detail');
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'iot-city-detail';
            panel.style.cssText = [
                'position:fixed;right:16px;bottom:16px;width:320px;max-height:56vh;overflow-y:auto;',
                'background:rgba(4,12,32,.97);border:1px solid rgba(0,212,255,.22);',
                'border-radius:12px;z-index:8100;backdrop-filter:blur(18px);',
                'box-shadow:0 8px 40px rgba(0,0,0,.6);animation:iotSlide .2s ease'
            ].join('');
            document.body.appendChild(panel);
        }
        const nowS = Math.floor(Date.now() / 1000);
        const total = clients.length;
        const ver = clients.filter(c => c.is_verified).length;
        const alerts = clients.filter(c => c.is_verified && c.alerts_enabled).length;

        panel.innerHTML = `
        <div style="padding:12px 14px 9px;border-bottom:1px solid rgba(0,212,255,.1);
                    position:sticky;top:0;background:rgba(4,12,32,.98);z-index:1;
                    display:flex;align-items:center;gap:8px">
          <span style="font-size:1rem">🏙️</span>
          <div style="flex:1">
            <div style="font-size:.88rem;font-weight:700;color:#00d4ff">${city}</div>
            <div style="font-size:.6rem;color:rgba(180,210,255,.4)">${total} total · ${ver} verified · ${alerts} 🔔</div>
          </div>
          <button onclick="document.getElementById('iot-city-detail').remove()"
            style="background:none;border:none;color:rgba(180,210,255,.4);cursor:pointer;font-size:1rem">×</button>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:5px;padding:9px 12px;border-bottom:1px solid rgba(0,212,255,.06)">
          ${[['Registered', total, '#00d4ff'], ['Verified', ver, '#00e5a0'], ['Alerts 🔔', alerts, '#ffaa00']].map(([l, v, c]) => `
          <div style="text-align:center;padding:5px;background:rgba(0,0,0,.15);border-radius:6px">
            <div style="font-size:1rem;font-weight:700;color:${c}">${v}</div>
            <div style="font-size:.55rem;color:rgba(180,210,255,.35)">${l}</div>
          </div>`).join('')}
        </div>
        <div style="padding:7px 12px">
        ${clients.length ? clients.map(c => {
            const ini = (c.name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
            const ago = c.created_at ? Math.floor((nowS - c.created_at) / 86400) : null;
            return `
            <div style="display:flex;align-items:center;gap:8px;padding:6px 4px;border-bottom:1px solid rgba(0,212,255,.05)">
              <div style="width:28px;height:28px;flex-shrink:0;border-radius:50%;
                          background:linear-gradient(135deg,rgba(0,212,255,.2),rgba(204,68,255,.15));
                          border:1px solid rgba(0,212,255,.25);display:flex;align-items:center;
                          justify-content:center;font-size:.7rem;font-weight:700;color:#00d4ff">${ini}</div>
              <div style="flex:1;min-width:0">
                <div style="font-size:.78rem;font-weight:600;color:#e0eeff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c.name}</div>
                <div style="font-size:.58rem;color:rgba(180,210,255,.38);margin-top:1px">
                  📍 ${c.city || '—'}${ago !== null ? ' · ' + ago + 'd ago' : ''}
                  ${c.alerts_enabled ? '<span style="color:#ffaa00;margin-left:4px">🔔</span>' : ''}
                </div>
              </div>
              <span style="width:6px;height:6px;border-radius:50%;flex-shrink:0;
                           background:${c.is_verified ? '#00e5a0' : '#ff6600'}"></span>
            </div>`;
        }).join('')
                : `<div style="text-align:center;padding:16px;color:rgba(180,210,255,.3);font-size:.75rem">No users in ${city}</div>`}
        </div>
        <div style="padding:9px 12px;border-top:1px solid rgba(0,212,255,.07)">
          <button onclick="window._iotShiftDirect&&window._iotShiftDirect('${city}',${lat},${lon})"
            style="width:100%;padding:8px;border-radius:8px;border:1px solid rgba(0,212,255,.2);
                   background:rgba(0,212,255,.07);color:#00d4ff;cursor:pointer;font-weight:700;font-size:.76rem">
            ⇄ Deploy ESP32 Node to ${city}
          </button>
        </div>`;

        clearTimeout(panel._t);
        panel._t = setTimeout(() => panel?.remove(), 25000);
        panel.addEventListener('mouseenter', () => clearTimeout(panel._t));
        panel.addEventListener('mouseleave', () => { panel._t = setTimeout(() => panel?.remove(), 7000); });
    }

    /* ── Shift modal ────────────────────────────────────────────── */
    function _injectShiftModal() {
        _shiftEl = document.createElement('div');
        _shiftEl.id = 'iot-shift-modal';
        _shiftEl.style.cssText = [
            'display:none;position:fixed;inset:0;z-index:9500;',
            'background:rgba(0,0,0,.7);backdrop-filter:blur(6px);',
            'align-items:center;justify-content:center'
        ].join('');
        _shiftEl.innerHTML = `
        <div style="background:rgba(4,12,32,.98);border:1px solid rgba(0,212,255,.22);border-radius:14px;
                    width:360px;max-height:70vh;overflow-y:auto;box-shadow:0 16px 60px rgba(0,0,0,.8)">
          <div style="padding:16px 18px 10px;border-bottom:1px solid rgba(0,212,255,.1);display:flex;align-items:center;gap:10px">
            <span style="font-size:1.2rem">⇄</span>
            <div style="flex:1">
              <div style="font-size:.9rem;font-weight:700;color:#00d4ff">Shift Node to City</div>
              <div style="font-size:.63rem;color:rgba(180,210,255,.4)">Node will be assigned based on user registrations</div>
            </div>
            <button onclick="document.getElementById('iot-shift-modal').style.display='none'"
              style="background:none;border:none;color:rgba(180,210,255,.4);cursor:pointer;font-size:1.3rem">×</button>
          </div>
          <div id="iot-shift-list" style="padding:12px 14px"></div>
        </div>`;
        _shiftEl.addEventListener('click', e => { if (e.target === _shiftEl) _shiftEl.style.display = 'none'; });
        document.body.appendChild(_shiftEl);

        window._iotShiftOpen = () => { _renderShiftList(); _shiftEl.style.display = 'flex'; };
        window._iotShiftDirect = (c, lat, lon) => _shiftNodeTo(c, lat, lon);
    }

    function _renderShiftList() {
        const list = document.getElementById('iot-shift-list');
        if (!list || !_data) return;
        const asgn = _data.assignments || [];
        list.innerHTML = asgn.length ? asgn.map(a => `
        <div style="display:flex;align-items:center;gap:8px;padding:9px 10px;margin-bottom:5px;border-radius:8px;
                    border:1px solid rgba(0,212,255,.07);background:rgba(0,212,255,.03)">
          <div style="flex:1">
            <div style="font-size:.84rem;font-weight:600;color:#e0eeff">${a.city}</div>
            <div style="font-size:.62rem;color:rgba(180,210,255,.4)">👥 ${a.user_count} users</div>
          </div>
          <button onclick="window._iotShiftDirect('${a.city}',${a.avg_lat},${a.avg_lon})"
            style="padding:5px 12px;border-radius:7px;border:1px solid rgba(0,212,255,.2);
                   background:rgba(0,212,255,.08);color:#00d4ff;cursor:pointer;font-weight:700;font-size:.65rem">
            ⇄ Set
          </button>
        </div>`).join('')
            : '<div style="text-align:center;color:rgba(180,210,255,.3);padding:20px;font-size:.75rem">No city data yet</div>';
    }

    async function _shiftNodeTo(city, lat, lon) {
        document.getElementById('iot-shift-modal').style.display = 'none';
        document.getElementById('iot-city-detail')?.remove();

        const cityEl = document.getElementById('iot-current-city');
        if (cityEl) { cityEl.textContent = city + ' (shifting…)'; cityEl.style.color = '#ffaa00'; }
        _toast('⇄ Deploying node to ' + city + '…', '#00d4ff');

        try {
            await fetch(`${API_URL}?action=shift`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ city, lat, lon })
            });
        } catch (_) { }

        if (window.gotoLocation) gotoLocation(lat, lon, city, 10);
        setTimeout(_poll, 1200);
        const users = _data?.assignments?.find(a => a.city === city)?.user_count ?? '?';
        _toast(`✅ Node → ${city} · ${users} users will receive alerts`, '#00ff88');
    }

    /* ── Toast ──────────────────────────────────────────────────── */
    function _toast(msg, col) {
        const t = document.createElement('div');
        t.style.cssText = `position:fixed;bottom:22px;left:50%;transform:translateX(-50%);
            background:rgba(4,12,32,.97);border:1px solid ${col || '#00d4ff'};border-radius:10px;
            padding:8px 18px;font-size:.78rem;font-weight:600;color:${col || '#00d4ff'};
            z-index:10000;box-shadow:0 4px 24px rgba(0,0,0,.5);animation:iotSlide .2s ease;
            white-space:nowrap;pointer-events:none`;
        t.textContent = msg;
        document.body.appendChild(t);
        setTimeout(() => { t.style.transition = 'opacity .4s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 420); }, 3000);
    }

    /* ── CSS ────────────────────────────────────────────────────── */
    function _injectStyles() {
        const s = document.createElement('style');
        s.textContent = `
            @keyframes iot-pulse {
                0%   { box-shadow:0 0 0 0 rgba(0,255,136,.75); }
                70%  { box-shadow:0 0 0 8px rgba(0,255,136,0); }
                100% { box-shadow:0 0 0 0 rgba(0,255,136,0); }
            }
            @keyframes iotSlide {
                from { opacity:0; transform:translateY(8px); }
                to   { opacity:1; transform:translateY(0); }
            }
            #iot-status-panel::-webkit-scrollbar,
            #iot-city-detail::-webkit-scrollbar,
            #iot-shift-modal div::-webkit-scrollbar { width:3px; }
            #iot-status-panel::-webkit-scrollbar-thumb,
            #iot-city-detail::-webkit-scrollbar-thumb { background:rgba(0,212,255,.2);border-radius:2px; }
            #btn-shift-node:hover { background:rgba(0,212,255,.14) !important; }
            #iot-live-badge { transition:border-color .4s,background .2s; }
        `;
        document.head.appendChild(s);
    }

    /* ── Boot ───────────────────────────────────────────────────── */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(init, 2200));
    } else {
        setTimeout(init, 2200);
    }

})();
