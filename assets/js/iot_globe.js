/**
 * iot_globe.js — Three.js 3D Earth Globe
 * Disaster Intelligence Command Center — IoT Edition
 * Three.js r128 + OrbitControls
 */

const IotGlobe = (() => {
    const RADIUS = 1.0;
    const EARTH_TX = 'https://unpkg.com/three-globe/example/img/earth-night.jpg';
    const BUMP_TX = 'https://unpkg.com/three-globe/example/img/earth-topology.png';

    let renderer, scene, camera, controls, globe, atmo;
    let markers = [];       /* {mesh, glow, data} */
    let raycaster, mouse;
    let autoRotate = true;
    let onClickCb = null;
    let _canvas = null;
    let animating = false;
    let animId = null;

    /* ─────────────────────────────── INIT ─────────────────────── */
    function init(canvasEl, clickCb) {
        _canvas = canvasEl;
        onClickCb = clickCb;
        const W = canvasEl.offsetWidth, H = canvasEl.offsetHeight;

        /* Renderer */
        renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
        renderer.setSize(W, H);
        renderer.outputEncoding = THREE.sRGBEncoding;

        /* Scene */
        scene = new THREE.Scene();

        /* Camera */
        camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100);
        camera.position.set(0, 0, 2.8);

        /* Lights */
        scene.add(new THREE.AmbientLight(0x223355, 1.0));
        const sun = new THREE.DirectionalLight(0xffffff, 1.4);
        sun.position.set(5, 3, 5);
        scene.add(sun);

        /* Stars */
        const starGeo = new THREE.BufferGeometry();
        const starVerts = [];
        for (let i = 0; i < 6000; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const r = 40 + Math.random() * 10;
            starVerts.push(
                r * Math.sin(phi) * Math.cos(theta),
                r * Math.cos(phi),
                r * Math.sin(phi) * Math.sin(theta)
            );
        }
        starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starVerts, 3));
        scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.08 })));

        /* Earth */
        const loader = new THREE.TextureLoader();
        loader.load(EARTH_TX, (earthTx) => {
            loader.load(BUMP_TX, (bumpTx) => {
                const geo = new THREE.SphereGeometry(RADIUS, 64, 64);
                const mat = new THREE.MeshPhongMaterial({
                    map: earthTx, bumpMap: bumpTx, bumpScale: 0.012,
                    specular: new THREE.Color(0x111122), shininess: 14,
                });
                globe = new THREE.Mesh(geo, mat);
                scene.add(globe);
            }, undefined, () => {
                /* Bump failed — use without it */
                const geo = new THREE.SphereGeometry(RADIUS, 64, 64);
                globe = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({ map: earthTx }));
                scene.add(globe);
            });
        }, undefined, () => {
            /* Fallback solid globe */
            globe = new THREE.Mesh(
                new THREE.SphereGeometry(RADIUS, 64, 64),
                new THREE.MeshPhongMaterial({ color: 0x0a3060 })
            );
            scene.add(globe);
        });

        /* Atmosphere glow */
        atmo = new THREE.Mesh(
            new THREE.SphereGeometry(RADIUS * 1.035, 64, 64),
            new THREE.MeshBasicMaterial({ color: 0x0044cc, transparent: true, opacity: 0.10, side: THREE.BackSide })
        );
        scene.add(atmo);

        /* OrbitControls */
        controls = new THREE.OrbitControls(camera, canvasEl);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.minDistance = 1.4;
        controls.maxDistance = 5.0;
        controls.enablePan = false;
        controls.rotateSpeed = 0.6;
        controls.addEventListener('start', () => { autoRotate = false; });
        controls.addEventListener('end', () => { setTimeout(() => autoRotate = true, 3000); });

        /* Raycaster */
        raycaster = new THREE.Raycaster();
        mouse = new THREE.Vector2();
        canvasEl.addEventListener('click', _onCanvasClick);

        /* Resize */
        window.addEventListener('resize', _resize);

        /* Start loop */
        _loop();
    }

    /* ─── Convert lat/lon → 3D position ────────────────────────── */
    function _latlonToVec3(lat, lon, r) {
        const phi = (90 - lat) * Math.PI / 180;
        const theta = (lon + 180) * Math.PI / 180;
        return new THREE.Vector3(
            -r * Math.sin(phi) * Math.cos(theta),
            r * Math.cos(phi),
            r * Math.sin(phi) * Math.sin(theta)
        );
    }

    /* ─── Add disaster marker ───────────────────────────────────── */
    const TYPE_COLOR = {
        earthquake: 0xff1144, flood: 0x0088ff,
        heatwave: 0xff6600, cyclone: 0xcc44ff,
    };

    function addMarker(data) {
        if (!scene) return;
        const color = TYPE_COLOR[data.type] || 0x00d4ff;
        const size = 0.010 + Math.min(0.025, (data.risk_score || 0.3) * 0.025);

        /* Core sphere */
        const core = new THREE.Mesh(
            new THREE.SphereGeometry(size, 10, 10),
            new THREE.MeshBasicMaterial({ color })
        );
        const pos = _latlonToVec3(data.lat, data.lon, RADIUS + 0.005);
        core.position.copy(pos);
        core.userData = data;
        scene.add(core);

        /* Glow halo */
        const glow = new THREE.Mesh(
            new THREE.SphereGeometry(size * 3, 10, 10),
            new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.20 })
        );
        glow.position.copy(pos);
        scene.add(glow);

        const entry = { core, glow, data, phase: Math.random() * Math.PI * 2 };
        markers.push(entry);
        return entry;
    }

    function clearMarkers() {
        markers.forEach(({ core, glow }) => { scene.remove(core); scene.remove(glow); });
        markers = [];
    }

    function updateMarkers(disasters) {
        clearMarkers();
        disasters.forEach(d => { if (d.lat && d.lon) addMarker(d); });
    }

    /* ─── Click detection via raycasting ───────────────────────── */
    function _onCanvasClick(e) {
        if (!scene || !markers.length) return;
        const rect = _canvas.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = ((e.clientY - rect.top) / rect.height) * -2 + 1;
        raycaster.setFromCamera(mouse, camera);
        const hits = raycaster.intersectObjects(markers.map(m => m.core));
        if (hits.length > 0) {
            onClickCb?.(hits[0].object.userData);
        }
    }

    /* ─── Fly camera to lat/lon ─────────────────────────────────── */
    function flyTo(lat, lon) {
        autoRotate = false;
        const target = _latlonToVec3(lat, lon, 2.4);
        const start = camera.position.clone();
        let t = 0;
        const step = () => {
            t += 0.02;
            camera.position.lerpVectors(start, target, Math.min(t, 1));
            camera.lookAt(0, 0, 0);
            if (t < 1) requestAnimationFrame(step);
            else setTimeout(() => autoRotate = true, 3000);
        };
        step();
    }

    /* ─── Animation ─────────────────────────────────────────────── */
    function _loop() {
        animating = true;
        animId = requestAnimationFrame(_loop);
        controls.update();
        if (autoRotate && globe) globe.rotation.y += 0.0015;

        /* Pulse glow markers */
        const t = performance.now() * 0.001;
        markers.forEach(({ glow, phase }) => {
            glow.material.opacity = 0.12 + 0.12 * Math.sin(t * 2 + phase);
        });

        renderer.render(scene, camera);
    }

    function _resize() {
        if (!_canvas) return;
        const W = _canvas.offsetWidth, H = _canvas.offsetHeight;
        camera.aspect = W / H; camera.updateProjectionMatrix();
        renderer.setSize(W, H);
    }

    function stop() { if (animId) cancelAnimationFrame(animId); animating = false; }
    function start() { if (!animating) _loop(); }

    return { init, updateMarkers, clearMarkers, flyTo, stop, start };
})();
