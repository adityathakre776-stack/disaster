/**
 * auth_guard.js — Authentication Layer for DICC India dashboard
 *
 * Injects into existing index.html via script tag ONLY.
 * Does NOT modify any existing HTML elements.
 * Adds: user pill in top bar · personal alerts panel · logout ·
 *       real-time alert polling · notification badge
 */
(function AuthGuard() {

    const API_USER = 'api/user.php';
    const API_ALERTS = 'api/alerts.php';
    const API_LOGOUT = 'api/logout.php';
    const POLL_MS = 12000;

    let currentUser = null;

    /* ── Boot ───────────────────────────────────────────────────── */
    async function init() {
        try {
            const res = await fetch(API_USER, { credentials: 'include' });
            const data = await res.json();
            currentUser = data.user;
            if (currentUser) {
                /* ⛔ Non-admin must not be on index.html */
                if (currentUser.role !== 'admin') {
                    window.location.replace('client.html');
                    return;
                }
                _injectUserUI(currentUser);
                _injectAlertsPanel();
                await _loadAlerts();
                setInterval(_loadAlerts, POLL_MS);
            } else {
                _injectLoginButton();
            }
        } catch (_) {
            _injectLoginButton();
        }
    }

    /* ── Inject user pill in top-bar-right ─────────────────────── */
    function _injectUserUI(user) {
        const topRight = document.querySelector('.top-bar-right');
        if (!topRight || document.getElementById('auth-user-pill')) return;

        const pill = document.createElement('div');
        pill.id = 'auth-user-pill';
        pill.style.cssText = [
            'display:flex', 'align-items:center', 'gap:7px',
            'background:rgba(0,212,255,.08)', 'border:1px solid rgba(0,212,255,.2)',
            'border-radius:20px', 'padding:3px 10px 3px 5px', 'cursor:default',
        ].join(';');

        const initial = (user.name || 'U').charAt(0).toUpperCase();
        pill.innerHTML = `
      <div style="width:22px;height:22px;background:linear-gradient(135deg,#00d4ff,#0055ff);
                  border-radius:50%;display:flex;align-items:center;justify-content:center;
                  font-size:11px;font-weight:700;color:#000;flex-shrink:0">${initial}</div>
      <span style="font-size:11px;font-weight:500;color:var(--txt-1,#e0eeff);max-width:90px;
                   overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${user.name.split(' ')[0]}</span>
      <span id="auth-alert-badge" style="background:#ff1144;color:#fff;font-size:9px;font-weight:700;
            padding:1px 5px;border-radius:8px;font-family:monospace;display:${user.unread_alerts > 0 ? 'inline' : 'none'}">${user.unread_alerts}</span>
      <button id="auth-logout-btn" title="Logout"
              style="background:transparent;border:none;color:rgba(180,210,255,.4);cursor:pointer;
                     font-size:13px;padding:0;line-height:1;transition:color .2s">↩</button>
    `;
        topRight.insertBefore(pill, topRight.firstChild);
        document.getElementById('auth-logout-btn').addEventListener('click', _logout);
    }

    /* ── Inject login button ────────────────────────────────────── */
    function _injectLoginButton() {
        const topRight = document.querySelector('.top-bar-right');
        if (!topRight || document.getElementById('auth-login-btn')) return;

        const btn = document.createElement('a');
        btn.id = 'auth-login-btn';
        btn.href = 'auth/login.html';
        btn.style.cssText = [
            'display:flex', 'align-items:center', 'gap:5px',
            'padding:5px 12px', 'border-radius:16px',
            'border:1px solid rgba(0,212,255,.2)', 'background:rgba(0,212,255,.06)',
            'color:var(--accent,#00d4ff)', 'font-size:11px', 'font-weight:600',
            'text-decoration:none', 'transition:all .2s',
        ].join(';');
        btn.textContent = '🔐 Login';
        btn.addEventListener('mouseenter', () => { btn.style.background = 'rgba(0,212,255,.15)'; });
        btn.addEventListener('mouseleave', () => { btn.style.background = 'rgba(0,212,255,.06)'; });
        topRight.insertBefore(btn, topRight.firstChild);
    }

    /* ── Inject "My Alerts" panel in right sidebar ──────────────── */
    function _injectAlertsPanel() {
        const updateStatus = document.querySelector('.update-status');
        if (!updateStatus || document.getElementById('auth-alerts-panel')) return;

        const panel = document.createElement('div');
        panel.id = 'auth-alerts-panel';
        panel.style.cssText = [
            'background:var(--bg-card,rgba(10,28,60,.7))',
            'border:1px solid var(--border,rgba(0,212,255,.1))',
            'border-radius:var(--r-sm,8px)', 'padding:10px 11px', 'flex-shrink:0',
        ].join(';');

        const toggleStyle = [
            'background:transparent', 'border:none', 'cursor:pointer',
            'font-size:10px', 'color:var(--accent,#00d4ff)', 'font-family:var(--mono,monospace)',
            'padding:1px 6px', 'border-radius:3px',
            'border:1px solid rgba(0,212,255,.2)', 'margin-left:5px',
        ].join(';');

        panel.innerHTML = `
      <div style="font-size:9px;font-weight:600;letter-spacing:1px;text-transform:uppercase;
                  color:var(--txt-3,rgba(180,210,255,.55));margin-bottom:8px;display:flex;align-items:center;gap:6px">
        🔔 My Alerts
        <span id="auth-unread-badge" style="background:rgba(255,17,68,.15);color:#ff4466;
              font-family:monospace;font-size:9px;padding:1px 5px;border-radius:3px;display:none">0</span>
        <button id="auth-toggle-alerts" style="${toggleStyle}" title="Toggle alerts on/off">
          ${currentUser?.alerts_enabled ? '🔔 ON' : '🔕 OFF'}
        </button>
        <button id="auth-read-all" style="${toggleStyle.replace('#00d4ff', 'rgba(180,210,255,.4)')}">
          ✓ Read
        </button>
      </div>
      <div id="auth-alerts-list" style="max-height:160px;overflow-y:auto">
        <div style="font-size:10px;color:var(--txt-3,rgba(180,210,255,.4));text-align:center;padding:8px">
          Loading alerts...</div>
      </div>`;

        updateStatus.parentNode.insertBefore(panel, updateStatus);

        document.getElementById('auth-toggle-alerts')?.addEventListener('click', async () => {
            const res = await fetch(API_ALERTS + '?action=toggle', { method: 'POST', credentials: 'include' });
            const data = await res.json();
            if (data.ok) {
                document.getElementById('auth-toggle-alerts').textContent = data.alerts_enabled ? '🔔 ON' : '🔕 OFF';
            }
        });

        document.getElementById('auth-read-all')?.addEventListener('click', async () => {
            await fetch(API_ALERTS + '?action=read', { method: 'POST', credentials: 'include' });
            document.querySelectorAll('.auth-alert-item.unread').forEach(el => {
                el.classList.remove('unread'); el.classList.add('read');
            });
            _setBadge(0);
        });
    }

    /* ── Load & render alerts ────────────────────────────────────── */
    async function _loadAlerts() {
        try {
            const res = await fetch(API_ALERTS, { credentials: 'include' });
            const data = await res.json();
            if (!data.auth) return;

            _setBadge(data.unread || 0);
            _renderAlerts(data.alerts || []);
            _checkBrowserNotifications(data.alerts || []);
        } catch (_) { }
    }

    function _renderAlerts(alerts) {
        const list = document.getElementById('auth-alerts-list');
        if (!list) return;

        if (!alerts.length) {
            list.innerHTML = `<div style="font-size:10px;color:var(--txt-3,rgba(180,210,255,.4));text-align:center;padding:8px">
        No proximity alerts yet</div>`;
            return;
        }

        const ICON = { flood: '🌊', heatwave: '🌡️', cyclone: '🌀', earthquake: '🌍' };
        const SEV_COL = { HIGH: '#ff1144', MEDIUM: '#ff6600', LOW: '#ffd700' };

        list.innerHTML = alerts.slice(0, 8).map(a => `
      <div class="auth-alert-item ${a.read_at ? 'read' : 'unread'}" style="
        display:flex;align-items:flex-start;gap:7px;padding:5px 0;
        border-bottom:1px solid rgba(0,212,255,.07);font-size:10px;
        opacity:${a.read_at ? 0.55 : 1}">
        <span style="font-size:12px;flex-shrink:0">${ICON[a.disaster_type] || '⚡'}</span>
        <div style="flex:1;min-width:0">
          <div style="color:var(--txt-1,#e0eeff);line-height:1.3;font-size:10px;
               white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${a.message}">${a.message}</div>
          <div style="color:var(--txt-3,rgba(180,210,255,.4));margin-top:2px">
            📍 ${parseFloat(a.distance_km).toFixed(1)}km · ${_ago(a.sent_at)}</div>
        </div>
        <span style="font-size:8px;font-weight:700;padding:1px 5px;border-radius:3px;flex-shrink:0;
              background:rgba(${SEV_COL[a.severity]?.slice(1)?.match(/../g)?.map(h => parseInt(h, 16)).join(',')},0.15);
              color:${SEV_COL[a.severity] || '#888'}">${a.severity}</span>
      </div>`).join('');

        /* Restore marker on main map if IndiaMap is available */
        alerts.filter(a => !a.read_at && a.lat && a.lon).forEach(a => {
            try {
                if (window.IndiaMap) {
                    IndiaMap.addMarker({
                        id: 'user_alert_' + a.id, type: a.disaster_type || 'flood',
                        lat: parseFloat(a.lat), lon: parseFloat(a.lon),
                        magnitude: 0.5, label: a.message, source: 'Your Alert',
                        time: a.sent_at,
                    });
                }
            } catch (_) { }
        });
    }

    /* ── Browser push notification for new unread alerts ─────────── */
    let notifiedIds = new Set();
    function _checkBrowserNotifications(alerts) {
        if (Notification.permission !== 'granted') {
            Notification.requestPermission();
        }
        alerts.filter(a => !a.read_at && !notifiedIds.has(a.id)).forEach(a => {
            notifiedIds.add(a.id);
            if (Notification.permission === 'granted') {
                const ICON = { flood: '🌊', heatwave: '🌡️', cyclone: '🌀', earthquake: '🌍' };
                new Notification(`${ICON[a.disaster_type] || '⚡'} DICC Alert — ${a.severity} Risk`, {
                    body: a.message,
                });
            }
            /* Audio tone */
            _playTone();
        });
    }

    function _playTone() {
        try {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (!Ctx) return;
            const ctx = new Ctx();
            [[880, 0, 0.15], [660, 0.2, 0.15]].forEach(([f, t, d]) => {
                const o = ctx.createOscillator(), g = ctx.createGain();
                o.connect(g); g.connect(ctx.destination);
                o.type = 'sine'; o.frequency.value = f;
                g.gain.setValueAtTime(0.001, ctx.currentTime + t);
                g.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + t + 0.04);
                g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + d);
                o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + d + 0.05);
            });
        } catch (_) { }
    }

    function _setBadge(count) {
        const badge1 = document.getElementById('auth-alert-badge');
        const badge2 = document.getElementById('auth-unread-badge');
        [badge1, badge2].forEach(b => {
            if (b) { b.textContent = count; b.style.display = count > 0 ? 'inline' : 'none'; }
        });
    }

    async function _logout() {
        await fetch(API_LOGOUT, { credentials: 'include' });
        window.location.href = 'auth/login.html';
    }

    function _ago(unix) {
        if (!unix) return '—';
        const m = Math.floor((Date.now() / 1000 - unix) / 60);
        if (m < 1) return 'just now';
        if (m < 60) return `${m}m ago`;
        if (m < 1440) return `${Math.floor(m / 60)}h ago`;
        return `${Math.floor(m / 1440)}d ago`;
    }

    /* ── Start after existing app boots ────────────────────────────── */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(init, 500));
    } else {
        setTimeout(init, 500);
    }

})();
