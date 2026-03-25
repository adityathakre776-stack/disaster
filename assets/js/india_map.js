/**
 * india_map.js — Real 3D India Terrain Map Engine
 * Uses MapLibre GL JS with real elevation DEM for 3D terrain
 * Disaster Intelligence Command Center — India Edition
 */

const IndiaMap = (() => {

    /* ============================================================
       CONSTANTS
    ============================================================ */
    const INDIA_CENTER = [82.6, 22.5];
    const INIT_ZOOM = 4.6;
    const INIT_PITCH = 55;
    const INIT_BEARING = -8;

    /* India bounding box for fit-bounds */
    const INDIA_BOUNDS = [[68.0, 6.5], [97.5, 37.5]];

    /* ============================================================
       STATE
    ============================================================ */
    let map;
    let markerEls = {};  // id → HTMLElement markers
    let markerData = {};  // id → data object
    let onClickCb, onHoverCb;
    let autoRotating = false;
    let rotateTimer = null;
    let isLoaded = false;

    /* ============================================================
       INIT
    ============================================================ */
    function init(containerId, clickCb, hoverCb) {
        onClickCb = clickCb;
        onHoverCb = hoverCb;

        map = new maplibregl.Map({
            container: containerId,
            style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
            center: INDIA_CENTER,
            zoom: INIT_ZOOM,
            pitch: INIT_PITCH,
            bearing: INIT_BEARING,
            antialias: true,
            maxBounds: [[55.0, -2.0], [110.0, 44.0]],
            minZoom: 3.0,
            maxZoom: 14,
        });

        /* Navigation control */
        map.addControl(new maplibregl.NavigationControl({
            visualizePitch: true,
        }), 'bottom-left');

        map.on('load', _onMapLoaded);
        map.on('error', e => console.warn('[IndiaMap] Tile error:', e));
        window.addEventListener('resize', () => map.resize());
    }

    /* ============================================================
       ON MAP LOADED — add terrain, sky, state borders
    ============================================================ */
    function _onMapLoaded() {
        isLoaded = true;

        /* ---- Sky layer for atmosphere effect ---- */
        map.addLayer({
            id: 'sky',
            type: 'sky',
            paint: {
                'sky-type': 'atmosphere',
                'sky-atmosphere-color': 'rgba(5, 18, 45, 1)',
                'sky-atmosphere-halo-color': 'rgba(0, 212, 255, 0.4)',
                'sky-atmosphere-sun': [0.0, 90.0],
                'sky-atmosphere-sun-intensity': 10,
            },
        });

        /* ---- 3D Terrain (real elevation — shows Himalayas, Deccan) ---- */
        map.addSource('terrain-dem', {
            type: 'raster-dem',
            tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
            tileSize: 256,
            encoding: 'terrarium',
            maxzoom: 14,
        });
        map.setTerrain({ source: 'terrain-dem', exaggeration: 4.0 });

        /* ---- India state borders highlight overlay ---- */
        map.addSource('india-geojson', {
            type: 'geojson',
            data: 'https://raw.githubusercontent.com/geohacker/india/master/state/india_state.geojson',
        });

        map.addLayer({
            id: 'india-states-fill',
            type: 'fill',
            source: 'india-geojson',
            paint: {
                'fill-color': '#0a2040',
                'fill-opacity': 0.15,
            },
        });

        map.addLayer({
            id: 'india-states-border',
            type: 'line',
            source: 'india-geojson',
            paint: {
                'line-color': '#00d4ff',
                'line-width': 0.8,
                'line-opacity': 0.45,
            },
        });

        /* ---- Disaster zone risk overlay (seismic) ---- */
        _addSeismicZoneLayer();

        /* ---- Earthquake data layer (GeoJSON) ---- */
        map.addSource('earthquakes-src', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
        });

        map.addLayer({
            id: 'eq-glow',
            type: 'circle',
            source: 'earthquakes-src',
            paint: {
                'circle-radius': ['interpolate', ['linear'], ['get', 'magnitude'], 0, 4, 3, 7, 5, 14, 7, 22],
                'circle-color': ['interpolate', ['linear'], ['get', 'magnitude'], 0, '#ffdd00', 3, '#ff6600', 5, '#ff1144'],
                'circle-opacity': 0.25,
                'circle-blur': 1.0,
                'circle-stroke-width': 0,
                'circle-pitch-alignment': 'map',
            },
        });

        map.addLayer({
            id: 'eq-core',
            type: 'circle',
            source: 'earthquakes-src',
            paint: {
                'circle-radius': ['interpolate', ['linear'], ['get', 'magnitude'], 0, 2, 3, 4, 5, 7, 7, 11],
                'circle-color': ['interpolate', ['linear'], ['get', 'magnitude'], 0, '#ffdd00', 3, '#ff6600', 5, '#ff1144'],
                'circle-opacity': 0.92,
                'circle-stroke-width': 1.5,
                'circle-stroke-color': '#ffffff',
                'circle-stroke-opacity': 0.4,
                'circle-pitch-alignment': 'map',
            },
        });

        /* Click on eq layer */
        map.on('click', 'eq-core', e => {
            const props = e.features[0].properties;
            const id = props.id;
            if (id && markerData[id]) onClickCb?.(markerData[id]);
        });
        map.on('mouseenter', 'eq-core', () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', 'eq-core', () => { map.getCanvas().style.cursor = ''; });

        console.log('[IndiaMap] 3D Terrain map loaded ✓');
    }

    /* ============================================================
       SEISMIC ZONE OVERLAY — BIS seismic zones II–V
    ============================================================ */
    function _addSeismicZoneLayer() {
        /* Approximate India seismic high-risk polygon (Zone IV-V) */
        map.addSource('seismic-zones', {
            type: 'geojson',
            data: {
                type: 'FeatureCollection',
                features: [
                    /* Zone V — Highest: Himalayan region + NE India + Andaman */
                    {
                        type: 'Feature',
                        properties: { zone: 'V', label: 'Zone V (Very High)' },
                        geometry: {
                            type: 'MultiPolygon',
                            coordinates: [
                                /* Himalayan belt */
                                [[[68, 32], [97, 32], [97, 36], [68, 36], [68, 32]]],
                                /* NE India */
                                [[[89, 22], [97, 22], [97, 29], [89, 29], [89, 22]]],
                                /* Andaman */
                                [[[92, 10], [94, 10], [94, 14], [92, 14], [92, 10]]],
                            ],
                        },
                    },
                    /* Zone IV — Gujarat rift, Kashmir valley */
                    {
                        type: 'Feature',
                        properties: { zone: 'IV', label: 'Zone IV (High)' },
                        geometry: {
                            type: 'MultiPolygon',
                            coordinates: [
                                [[[68, 22], [76, 22], [76, 28], [68, 28], [68, 22]]],
                                [[[76, 28], [85, 28], [85, 32], [76, 32], [76, 28]]],
                            ],
                        },
                    },
                ],
            },
        });

        map.addLayer({
            id: 'seismic-fill',
            type: 'fill',
            source: 'seismic-zones',
            paint: {
                'fill-color': [
                    'match', ['get', 'zone'],
                    'V', 'rgba(255,17,68,0.04)',
                    'IV', 'rgba(255,102,0,0.04)',
                    'rgba(255,221,0,0.03)',
                ],
                'fill-opacity': 1,
            },
        }, 'india-states-border');
    }

    /* ============================================================
       ADD MARKER — HTML overlay with pulse animation
    ============================================================ */
    function addMarker(data) {
        const { id, lat, lon, type, magnitude } = data;
        removeMarker(id);

        /* Color theme per type/severity */
        let color, size, pulseSize;
        if (type === 'earthquake') {
            if (magnitude >= 5) { color = '#ff1144'; size = 18; pulseSize = 46; }
            else if (magnitude >= 3) { color = '#ff6600'; size = 13; pulseSize = 36; }
            else { color = '#ffdd00'; size = 10; pulseSize = 28; }
        } else if (type === 'iot_node') {
            color = '#00ff88'; size = 12; pulseSize = 32;
        } else if (type === 'cyclone') {
            color = '#cc44ff'; size = 18; pulseSize = 48;
        } else if (type === 'flood') {
            color = '#0088ff'; size = 14; pulseSize = 38;
        } else if (type === 'heatwave') {
            color = '#ff6600'; size = 14; pulseSize = 38;
        } else {
            color = '#22aaff'; size = 10; pulseSize = 26;
        }

        /* Build HTML marker element */
        const el = document.createElement('div');
        el.className = 'india-marker';
        el.dataset.id = id;
        el.innerHTML = `
      <div class="marker-pulse" style="width:${pulseSize}px;height:${pulseSize}px;border-color:${color};"></div>
      <div class="marker-pulse marker-pulse-2" style="width:${pulseSize}px;height:${pulseSize}px;border-color:${color};animation-delay:0.6s"></div>
      <div class="marker-core" style="width:${size}px;height:${size}px;background:${color};box-shadow:0 0 ${Math.round(size * 1.8)}px ${color}"></div>`;

        el.style.cssText = `
      position:absolute; cursor:pointer;
      width:${pulseSize}px; height:${pulseSize}px;
      display:flex; align-items:center; justify-content:center;`;

        el.addEventListener('click', () => onClickCb?.(data));
        el.addEventListener('mouseenter', () => onHoverCb?.(data));

        const mlMarker = new maplibregl.Marker({ element: el, anchor: 'center' })
            .setLngLat([lon, lat])
            .addTo(map);

        markerEls[id] = mlMarker;
        markerData[id] = data;

        /* Update earthquakes-src GeoJSON layer too */
        _updateEQLayer();

        return mlMarker;
    }

    /* ============================================================
       UPDATE EQ GEOJSON LAYER (for glow circles)
    ============================================================ */
    function _updateEQLayer() {
        if (!isLoaded || !map.getSource('earthquakes-src')) return;
        const features = Object.values(markerData)
            .filter(d => d.type === 'earthquake')
            .map(d => ({
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [d.lon, d.lat] },
                properties: { id: d.id, magnitude: d.magnitude },
            }));
        map.getSource('earthquakes-src').setData({ type: 'FeatureCollection', features });
    }

    /* ============================================================
       REMOVE / CLEAR MARKERS
    ============================================================ */
    function removeMarker(id) {
        if (markerEls[id]) { markerEls[id].remove(); delete markerEls[id]; delete markerData[id]; }
    }

    function clearMarkers() {
        Object.values(markerEls).forEach(m => m.remove());
        markerEls = {};
        markerData = {};
        _updateEQLayer();
    }

    /* ============================================================
       CAMERA
    ============================================================ */
    function flyTo(lat, lon, zoom = 8) {
        map.flyTo({ center: [lon, lat], zoom, pitch: 55, bearing: -8, duration: 1600, essential: true });
    }

    function resetCamera() {
        map.flyTo({
            center: INDIA_CENTER, zoom: INIT_ZOOM, pitch: INIT_PITCH, bearing: INIT_BEARING,
            duration: 1400, essential: true,
        });
    }

    function zoomIn() { map.zoomIn({ duration: 400 }); }
    function zoomOut() { map.zoomOut({ duration: 400 }); }

    /* ============================================================
       HEATMAP
    ============================================================ */
    let heatmapVisible = false;

    function showHeatmap(events) {
        if (!isLoaded) return;
        const src = map.getSource('heatmap-src');
        const features = events.map(ev => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [ev.lon, ev.lat] },
            properties: { weight: Math.min(ev.magnitude / 7, 1) || 0.3 },
        }));
        const data = { type: 'FeatureCollection', features };

        if (!src) {
            map.addSource('heatmap-src', { type: 'geojson', data });
            map.addLayer({
                id: 'heatmap-layer', type: 'heatmap', source: 'heatmap-src',
                paint: {
                    'heatmap-weight': ['get', 'weight'],
                    'heatmap-intensity': 1.5,
                    'heatmap-radius': 32,
                    'heatmap-opacity': 0.72,
                    'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'],
                        0, 'rgba(0,0,255,0)',
                        0.2, 'rgba(0,212,255,0.6)',
                        0.4, 'rgba(0,229,160,0.8)',
                        0.6, 'rgba(255,221,0,0.9)',
                        0.8, 'rgba(255,102,0,1)',
                        1.0, 'rgba(255,17,68,1)',
                    ],
                },
            });
        } else {
            map.getSource('heatmap-src').setData(data);
            if (map.getLayer('heatmap-layer')) map.setLayoutProperty('heatmap-layer', 'visibility', 'visible');
        }
        heatmapVisible = true;
    }

    function hideHeatmap() {
        if (map.getLayer('heatmap-layer')) map.setLayoutProperty('heatmap-layer', 'visibility', 'none');
        heatmapVisible = false;
    }

    function toggleHeatmap(events) {
        if (heatmapVisible) { hideHeatmap(); return false; }
        showHeatmap(events); return true;
    }

    function setTypeVisible(type, visible) {
        Object.entries(markerData).forEach(([id, d]) => {
            if (d.type === type && markerEls[id]) {
                markerEls[id].getElement().style.display = visible ? '' : 'none';
            }
        });
        if (type === 'earthquake') {
            ['eq-core', 'eq-glow'].forEach(l => {
                if (map.getLayer(l)) map.setLayoutProperty(l, 'visibility', visible ? 'visible' : 'none');
            });
        }
    }

    function getMarkerCount() { return Object.keys(markerEls).length; }

    /* ============================================================
       PUBLIC API
    ============================================================ */
    return {
        init, addMarker, removeMarker, clearMarkers,
        flyTo, resetCamera, zoomIn, zoomOut,
        showHeatmap, hideHeatmap, toggleHeatmap,
        setTypeVisible, getMarkerCount,
        get _map() { return map; },
    };
})();
