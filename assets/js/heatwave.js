/**
 * heatwave.js — Real-Time Heatwave Canvas Renderer
 * India Disaster Intelligence Command Center
 *
 * Engine: Canvas 2D + IDW spatial interpolation + GPU-composited radial gradients
 * Data:   Live OWM temperature readings from 28 Indian cities
 * FPS:    60fps via requestAnimationFrame with delta-time smoothing
 */

const HeatwaveEngine = (() => {

    /* ============================================================
       CONFIG
    ============================================================ */
    const CFG = {
        baseRadius: 200,      // px — influence radius per city at zoom 5
        minAlpha: 0.22,
        maxAlpha: 0.72,
        pulseSpeed: 0.0008,   // per ms
        shimmerCount: 180,      // heat-shimmer particles
        shimmerMaxHeight: 55,       // px — upward drift
        shimmerSpeed: 0.45,     // px/frame base
        blurPx: 18,       // pre-blur on offscreen canvas
        /* Temperature → hue colour map (HSL) */
        tempMap: [
            { t: 5, h: 240, s: 90, l: 55 },  // deep blue
            { t: 15, h: 200, s: 85, l: 55 },  // cyan
            { t: 25, h: 130, s: 80, l: 45 },  // green
            { t: 32, h: 60, s: 95, l: 50 },  // yellow
            { t: 38, h: 30, s: 100, l: 50 },  // orange
            { t: 43, h: 0, s: 100, l: 48 },  // red
            { t: 50, h: 300, s: 100, l: 40 },  // purple (extreme)
        ],
    };

    /* ============================================================
       STATE
    ============================================================ */
    let _canvas = null;
    let _offscreen = null;   // offscreen canvas for blur pass
    let _ctx = null;
    let _offCtx = null;
    let _map = null;
    let _data = [];       // [{lat,lon,temp,city}]
    let _shimmerParticles = [];
    let _raf = null;
    let _running = false;
    let _t = 0;        // animation time (ms)
    let _lastTs = 0;

    /* ============================================================
       INIT
    ============================================================ */
    function init(canvasEl, mapInstance) {
        _canvas = canvasEl;
        _ctx = canvasEl.getContext('2d');
        _map = mapInstance;

        /* Offscreen canvas for blur effect */
        _offscreen = document.createElement('canvas');
        _offCtx = _offscreen.getContext('2d');

        /* Resize canvas on window resize and map move */
        window.addEventListener('resize', _resize);
        _map?.on('move', _onMapMove);
        _map?.on('zoom', _onMapMove);
        _map?.on('rotate', _onMapMove);
        _resize();

        console.log('[Heatwave] Engine initialized ✓');
    }

    function _resize() {
        const container = _canvas?.parentElement;
        if (!container) return;
        const w = container.offsetWidth;
        const h = container.offsetHeight;
        if (_canvas.width !== w || _canvas.height !== h) {
            _canvas.width = w; _canvas.height = h;
            _offscreen.width = w; _offscreen.height = h;
        }
    }

    function _onMapMove() {
        /* Redraw immediately on map pan/zoom for responsiveness */
        if (_running) _drawFrame(performance.now());
    }

    /* ============================================================
       DATA INGESTION — receives normalized weather events
    ============================================================ */
    function setData(weatherEvents) {
        _data = weatherEvents
            .map(w => ({
                lat: w.lat,
                lon: w.lon,
                temp: w.temperature ?? 25,
                city: w.label || w.city || '',
            }))
            .filter(d => d.lat && d.lon && !isNaN(d.temp));

        _initShimmerParticles();
        console.log(`[Heatwave] Loaded ${_data.length} real temperature data points`);
    }

    /* ============================================================
       SHIMMER PARTICLES — heat-distortion upward drift
    ============================================================ */
    function _initShimmerParticles() {
        _shimmerParticles = [];
        /* Only spawn particles near hot cities (>32°C) */
        const hotCities = _data.filter(d => d.temp >= 32);
        if (hotCities.length === 0) return;

        for (let i = 0; i < CFG.shimmerCount; i++) {
            const src = hotCities[Math.floor(Math.random() * hotCities.length)];
            /* Offset within ~1 degree of the city */
            const jitterLat = src.lat + (Math.random() - 0.5) * 2.0;
            const jitterLon = src.lon + (Math.random() - 0.5) * 2.0;
            _shimmerParticles.push({
                baseLat: jitterLat, baseLon: jitterLon,
                srcTemp: src.temp,
                phase: Math.random() * Math.PI * 2,
                speed: CFG.shimmerSpeed * (0.5 + Math.random()),
                size: 1.5 + Math.random() * 2.5,
                alpha: 0.3 + Math.random() * 0.4,
                yOffset: Math.random() * CFG.shimmerMaxHeight,
            });
        }
    }

    /* ============================================================
       COLOUR INTERPOLATION
    ============================================================ */
    function _tempToHSL(temp, alpha) {
        const map = CFG.tempMap;
        let lower = map[0], upper = map[map.length - 1];
        for (let i = 0; i < map.length - 1; i++) {
            if (temp >= map[i].t && temp <= map[i + 1].t) {
                lower = map[i]; upper = map[i + 1]; break;
            }
        }
        const p = lower.t === upper.t ? 0 : (temp - lower.t) / (upper.t - lower.t);
        const h = lower.h + p * (upper.h - lower.h);
        const s = lower.s + p * (upper.s - lower.s);
        const l = lower.l + p * (upper.l - lower.l);
        return `hsla(${h | 0},${s | 0}%,${l | 0}%,${alpha.toFixed(3)})`;
    }

    /* ============================================================
       RENDER LOOP
    ============================================================ */
    function start() {
        if (_running) return;
        _running = true;
        _lastTs = performance.now();
        _raf = requestAnimationFrame(_tick);
        console.log('[Heatwave] Render loop started ♻');
    }

    function stop() {
        _running = false;
        if (_raf) { cancelAnimationFrame(_raf); _raf = null; }
        if (_ctx && _canvas) _ctx.clearRect(0, 0, _canvas.width, _canvas.height);
        console.log('[Heatwave] Render loop stopped');
    }

    function _tick(ts) {
        if (!_running) return;
        const dt = ts - _lastTs;
        _lastTs = ts;
        _t += dt;
        _drawFrame(ts);
        _raf = requestAnimationFrame(_tick);
    }

    /* ============================================================
       DRAW FRAME — the heart of the engine
    ============================================================ */
    function _drawFrame(ts) {
        if (!_canvas || !_ctx || !_map || _data.length === 0) return;
        _resize();

        const W = _canvas.width;
        const H = _canvas.height;

        /* ---- Pass 1: draw heatmap onto offscreen canvas ---- */
        _offCtx.clearRect(0, 0, W, H);

        /* Global composite: 'screen' blends hot blobs beautifully */
        _offCtx.globalCompositeOperation = 'source-over';

        /* Pulse factor: 0..1 oscillates smoothly */
        const pulse = 0.5 + 0.5 * Math.sin(_t * CFG.pulseSpeed * 2 * Math.PI);

        for (const city of _data) {
            let px;
            try { px = _map.project([city.lon, city.lat]); }
            catch { continue; }

            /* Skip if off-screen with margin */
            if (px.x < -300 || px.x > W + 300 || px.y < -300 || px.y > H + 300) continue;

            /* Scale radius with zoom level */
            const zoom = _map.getZoom?.() ?? 5;
            const zScale = Math.pow(2, zoom - 4.6);  // normalise to initial zoom 4.6
            const radius = CFG.baseRadius * zScale * _tempInfluence(city.temp);

            /* Pulsing alpha: hot cities pulse more aggressively */
            const hotness = Math.max(0, Math.min(1, (city.temp - 20) / 30));
            const alphaBase = CFG.minAlpha + hotness * (CFG.maxAlpha - CFG.minAlpha);
            const alpha = alphaBase * (0.75 + 0.25 * pulse);

            /* Radial gradient: hot core → transparent edge */
            const grad = _offCtx.createRadialGradient(px.x, px.y, 0, px.x, px.y, radius);
            grad.addColorStop(0.00, _tempToHSL(city.temp, alpha));
            grad.addColorStop(0.35, _tempToHSL(city.temp - 2, alpha * 0.7));
            grad.addColorStop(0.70, _tempToHSL(city.temp - 5, alpha * 0.35));
            grad.addColorStop(1.00, _tempToHSL(city.temp - 8, 0));

            _offCtx.globalCompositeOperation = city.temp >= 38 ? 'screen' : 'source-over';
            _offCtx.fillStyle = grad;
            _offCtx.beginPath();
            _offCtx.arc(px.x, px.y, radius, 0, Math.PI * 2);
            _offCtx.fill();
        }

        /* ---- Pass 2: copy offscreen → main canvas with blur ---- */
        _ctx.clearRect(0, 0, W, H);
        _ctx.filter = `blur(${CFG.blurPx}px)`;
        _ctx.drawImage(_offscreen, 0, 0);
        _ctx.filter = 'none';

        /* ---- Pass 3: heat shimmer particles ---- */
        _drawShimmerParticles(ts);

        /* ---- Pass 4: temperature labels for major cities ---- */
        _drawLabels();
    }

    /* ---- Influence radius multiplier by temperature ---- */
    function _tempInfluence(temp) {
        if (temp >= 40) return 1.45;
        if (temp >= 35) return 1.20;
        if (temp >= 30) return 1.00;
        if (temp >= 25) return 0.82;
        return 0.65;
    }

    /* ============================================================
       SHIMMER PARTICLES
    ============================================================ */
    function _drawShimmerParticles(ts) {
        const zoom = _map.getZoom?.() ?? 5;
        if (zoom < 4) return; /* Don't show particles when zoomed too far out */

        for (const p of _shimmerParticles) {
            /* Drift upward, reset at top */
            p.yOffset -= p.speed;
            if (p.yOffset < 0) p.yOffset = CFG.shimmerMaxHeight;

            let px;
            try { px = _map.project([p.baseLon, p.baseLat]); }
            catch { continue; }

            const screenX = px.x + Math.sin(ts * 0.001 + p.phase) * 6;
            const screenY = px.y - p.yOffset;

            /* Skip off-screen */
            if (screenX < 0 || screenX > _canvas.width || screenY < 0 || screenY > _canvas.height) continue;

            /* Fade in/out based on yOffset */
            const fadeAlpha = p.alpha * (1 - Math.abs(p.yOffset / CFG.shimmerMaxHeight - 0.5) * 2);

            /* Temperature-coloured shimmer dot */
            const tempColor = p.srcTemp >= 40 ? `rgba(255,80,0,${fadeAlpha})` :
                p.srcTemp >= 35 ? `rgba(255,180,0,${fadeAlpha})` :
                    `rgba(255,255,100,${fadeAlpha * 0.6})`;

            _ctx.globalCompositeOperation = 'lighter';
            _ctx.beginPath();
            _ctx.arc(screenX, screenY, p.size, 0, Math.PI * 2);
            _ctx.fillStyle = tempColor;
            _ctx.fill();
        }
        _ctx.globalCompositeOperation = 'source-over';
    }

    /* ============================================================
       TEMPERATURE LABELS
    ============================================================ */
    function _drawLabels() {
        const zoom = _map.getZoom?.() ?? 5;
        if (zoom < 5.5) return; /* Only show labels when zoomed enough */

        _ctx.font = 'bold 11px "JetBrains Mono", monospace';
        _ctx.textAlign = 'center';
        _ctx.textBaseline = 'middle';
        _ctx.globalCompositeOperation = 'source-over';

        for (const city of _data) {
            let px;
            try { px = _map.project([city.lon, city.lat]); }
            catch { continue; }

            /* Background pill */
            const label = `${city.temp.toFixed(1)}°C`;
            const tw = _ctx.measureText(label).width;
            const bgAlpha = 0.78;

            let bgColor, textColor;
            if (city.temp >= 40) { bgColor = `rgba(180,0,0,${bgAlpha})`; textColor = '#fff'; }
            else if (city.temp >= 35) { bgColor = `rgba(255,80,0,${bgAlpha})`; textColor = '#fff'; }
            else if (city.temp >= 30) { bgColor = `rgba(200,150,0,${bgAlpha})`; textColor = '#000'; }
            else { bgColor = `rgba(0,100,180,${bgAlpha})`; textColor = '#fff'; }

            const pw = tw + 10, ph = 16, pr = 5;
            const bx = px.x - pw / 2, by = px.y + 18;

            _ctx.beginPath();
            _ctx.roundRect(bx, by, pw, ph, pr);
            _ctx.fillStyle = bgColor;
            _ctx.fill();

            _ctx.fillStyle = textColor;
            _ctx.fillText(label, px.x, by + ph / 2);

            if (zoom >= 6.5 && city.city) {
                _ctx.fillStyle = 'rgba(255,255,255,0.7)';
                _ctx.font = '9px Inter, sans-serif';
                _ctx.fillText(city.city, px.x, by + ph + 8);
                _ctx.font = 'bold 11px "JetBrains Mono", monospace';
            }
        }
    }

    /* ============================================================
       PUBLIC API
    ============================================================ */
    function isRunning() { return _running; }
    function updateData(weatherEvents) { setData(weatherEvents); }

    return { init, setData, updateData, start, stop, isRunning };

})();
