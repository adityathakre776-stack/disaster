/**
 * globe.js — Ultra-HD Three.js 3D Earth Engine v2
 * Disaster Intelligence Command Center
 *
 * Features:
 *  - High-res day + night (city lights) Earth texture
 *  - Multi-layer atmosphere shader (glow + Fresnel)
 *  - Cloud layer with separate opacity control
 *  - Dynamic sunlight simulation
 *  - Instanced spike markers with glow rings
 *  - GSAP cinema zoom & smooth damping controls
 *  - Canvas heatmap overlay
 *  - 5000-star field with parallax
 */

const Globe = (() => {

    /* ============================================================
       STATE
    ============================================================ */
    let renderer, scene, camera, controls;
    let earthMesh, nightMesh, atmosphereMesh, atmosphereInnerMesh, cloudMesh;
    let starField;
    let markerGroup;
    let raycaster, mouse;
    let animFrameId;
    let autoRotate = true;
    let markers = [];
    let hovered = null;
    let onMarkerClick = null;
    let onMarkerHover = null;
    let isHeatmapVisible = false;
    let heatmapMesh = null;
    let heatmapTexture = null;
    let clock;
    let fpsFrames = 0, fpsLast = 0;

    const EARTH_R = 2.0;
    const ATMO_R = EARTH_R * 1.015;
    const ATMO2_R = EARTH_R * 1.055;
    const CLOUD_R = EARTH_R * 1.007;
    const NIGHT_R = EARTH_R + 0.001;

    /* ============================================================
       INIT
    ============================================================ */
    function init(canvasId, clickCb, hoverCb) {
        onMarkerClick = clickCb;
        onMarkerHover = hoverCb;
        clock = new THREE.Clock();

        const canvas = document.getElementById(canvasId);
        const container = canvas.parentElement;

        /* ------ Renderer ------ */
        renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: true,
            alpha: false,
            powerPreference: 'high-performance',
            logarithmicDepthBuffer: false,
        });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(container.clientWidth, container.clientHeight);
        renderer.shadowMap.enabled = false;
        renderer.outputEncoding = THREE.sRGBEncoding;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.15;

        /* ------ Scene ------ */
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x020817);

        /* ------ Camera ------ */
        camera = new THREE.PerspectiveCamera(40, container.clientWidth / container.clientHeight, 0.1, 200);
        camera.position.set(0, 1.5, 6.5);
        camera.lookAt(0, 0, 0);

        /* ------ Lighting ------ */
        _setupLighting();

        /* ------ Objects ------ */
        _buildStarField();
        _buildEarth();

        /* ------ Markers ------ */
        markerGroup = new THREE.Group();
        scene.add(markerGroup);

        /* ------ Controls ------ */
        raycaster = new THREE.Raycaster();
        mouse = new THREE.Vector2(-9, -9);

        controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.rotateSpeed = 0.35;
        controls.zoomSpeed = 0.9;
        controls.minDistance = 2.4;
        controls.maxDistance = 16;
        controls.enablePan = false;
        controls.autoRotate = false;

        /* ------ Events ------ */
        canvas.addEventListener('mousemove', _onMouseMove, { passive: true });
        canvas.addEventListener('click', _onClick, { passive: true });
        canvas.addEventListener('touchend', _onTouch, { passive: true });
        window.addEventListener('resize', _onResize);

        /* ------ Start ------ */
        fpsLast = performance.now();
        _animate();
    }

    /* ============================================================
       LIGHTING
    ============================================================ */
    function _setupLighting() {
        /* Ambient — soft blue deep-space */
        scene.add(new THREE.AmbientLight(0x1a2a4a, 0.6));

        /* Sun directional */
        const sun = new THREE.DirectionalLight(0xfff5dd, 2.8);
        sun.position.set(6, 2, 4);
        scene.add(sun);

        /* Rim / fill from opposite side (thin blue edge light) */
        const rim = new THREE.DirectionalLight(0x2255aa, 0.45);
        rim.position.set(-4, -1, -4);
        scene.add(rim);
    }

    /* ============================================================
       STAR FIELD (5000 particles, two-layer)
    ============================================================ */
    function _buildStarField() {
        const count = 5000;
        const positions = new Float32Array(count * 3);
        const sizes = new Float32Array(count);

        for (let i = 0; i < count; i++) {
            const r = 60 + Math.random() * 40;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
            positions[i * 3 + 2] = r * Math.cos(phi);
            sizes[i] = Math.random() < 0.05 ? 2.2 : (Math.random() < 0.3 ? 1.4 : 0.8);
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

        const mat = new THREE.ShaderMaterial({
            uniforms: { uTime: { value: 0 } },
            vertexShader: `
        attribute float size;
        uniform float uTime;
        void main() {
          gl_PointSize = size * (1.0 + 0.15 * sin(uTime * 2.0 + position.x));
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
            fragmentShader: `
        void main() {
          float d = distance(gl_PointCoord, vec2(0.5));
          if (d > 0.5) discard;
          float alpha = 1.0 - smoothstep(0.2, 0.5, d);
          gl_FragColor = vec4(1.0, 1.0, 1.0, alpha * 0.85);
        }`,
            transparent: true,
            depthWrite: false,
        });

        starField = new THREE.Points(geo, mat);
        scene.add(starField);
    }

    /* ============================================================
       EARTH BUILD — Day + Night + Clouds + Dual Atmosphere
    ============================================================ */
    function _buildEarth() {
        const loader = new THREE.TextureLoader();

        /* ---- Source textures (NASA Blue Marble via CDN) ---- */
        const dayURL = 'https://raw.githubusercontent.com/turban/webgl-earth/master/images/2_no_clouds_4k.jpg';
        const nightURL = 'https://raw.githubusercontent.com/turban/webgl-earth/master/images/5_night_8k.jpg';
        const specURL = 'https://raw.githubusercontent.com/turban/webgl-earth/master/images/water_4k.png';
        const bumpURL = 'https://raw.githubusercontent.com/turban/webgl-earth/master/images/elev_bump_4k.jpg';
        const cloudURL = 'https://raw.githubusercontent.com/turban/webgl-earth/master/images/fair_clouds_4k.png';

        const dayTex = loader.load(dayURL, t => { earthMesh.material.needsUpdate = true; });
        const nightTex = loader.load(nightURL, t => { if (nightMesh) nightMesh.material.needsUpdate = true; });
        const specTex = loader.load(specURL);
        const bumpTex = loader.load(bumpURL);
        const cloudTex = loader.load(cloudURL);

        dayTex.anisotropy = 4;
        nightTex.anisotropy = 4;

        /* ---- Day earth (Phong + bump + specular) ---- */
        const earthGeo = new THREE.SphereGeometry(EARTH_R, 80, 80);
        const earthMat = new THREE.MeshPhongMaterial({
            map: dayTex,
            specularMap: specTex,
            specular: new THREE.Color(0x4488bb),
            shininess: 22,
            bumpMap: bumpTex,
            bumpScale: 0.022,
        });
        earthMesh = new THREE.Mesh(earthGeo, earthMat);
        scene.add(earthMesh);

        /* ---- Night city-light overlay (additive blend) ---- */
        const nightGeo = new THREE.SphereGeometry(NIGHT_R, 80, 80);
        const nightMat = new THREE.MeshBasicMaterial({
            map: nightTex,
            transparent: true,
            opacity: 0.0,   /* driven by sun angle in animate */
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });
        nightMesh = new THREE.Mesh(nightGeo, nightMat);
        scene.add(nightMesh);

        /* ---- Cloud Shell ---- */
        const cloudGeo = new THREE.SphereGeometry(CLOUD_R, 80, 80);
        const cloudMat = new THREE.MeshPhongMaterial({
            map: cloudTex,
            transparent: true,
            opacity: 0.38,
            depthWrite: false,
            blending: THREE.NormalBlending,
        });
        cloudMesh = new THREE.Mesh(cloudGeo, cloudMat);
        scene.add(cloudMesh);

        /* ---- Inner atmosphere (thin blue rim on dark side) ---- */
        const atmoInGeo = new THREE.SphereGeometry(ATMO_R, 64, 64);
        const atmoInMat = new THREE.ShaderMaterial({
            uniforms: {
                uSunDirection: { value: new THREE.Vector3(0.8, 0.3, 0.6).normalize() },
                uAtmosphereDay: { value: new THREE.Color(0.18, 0.55, 1.0) },
                uAtmosphereTwi: { value: new THREE.Color(1.0, 0.5, 0.2) },
            },
            vertexShader: `
        varying vec3 vNormal;
        varying vec3 vPosition;
        void main() {
          vNormal   = normalize(normalMatrix * normal);
          vPosition = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
            fragmentShader: `
        uniform vec3 uSunDirection;
        uniform vec3 uAtmosphereDay;
        uniform vec3 uAtmosphereTwi;
        varying vec3 vNormal;
        varying vec3 vPosition;
        void main() {
          vec3 viewDir  = normalize(cameraPosition - vPosition);
          float edge    = 1.0 - abs(dot(viewDir, vNormal));
          edge          = pow(edge, 3.2);
          float sunDot  = dot(vNormal, uSunDirection);
          float dayMix  = smoothstep(-0.1, 0.3, sunDot);
          vec3 color    = mix(uAtmosphereTwi, uAtmosphereDay, dayMix);
          float alpha   = edge * 0.72;
          gl_FragColor  = vec4(color, alpha);
        }`,
            side: THREE.BackSide,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });
        atmosphereInnerMesh = new THREE.Mesh(atmoInGeo, atmoInMat);
        scene.add(atmosphereInnerMesh);

        /* ---- Outer atmosphere glow halo ---- */
        const atmoGeo = new THREE.SphereGeometry(ATMO2_R, 64, 64);
        const atmoMat = new THREE.ShaderMaterial({
            uniforms: {
                uSunDirection: { value: new THREE.Vector3(0.8, 0.3, 0.6).normalize() },
            },
            vertexShader: `
        varying vec3 vNormal;
        varying vec3 vPosition;
        void main() {
          vNormal   = normalize(normalMatrix * normal);
          vPosition = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
            fragmentShader: `
        uniform vec3 uSunDirection;
        varying vec3 vNormal;
        varying vec3 vPosition;
        void main() {
          vec3  viewDir = normalize(cameraPosition - vPosition);
          float edge    = 1.0 - abs(dot(viewDir, vNormal));
          edge          = pow(edge, 5.5);
          float sunDot  = dot(vNormal, uSunDirection) * 0.5 + 0.5;
          vec3  dayCol  = vec3(0.10, 0.50, 1.0);
          vec3  limCol  = vec3(0.05, 0.25, 0.50);
          vec3  color   = mix(limCol, dayCol, sunDot);
          gl_FragColor  = vec4(color, edge * 0.45);
        }`,
            side: THREE.BackSide,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });
        atmosphereMesh = new THREE.Mesh(atmoGeo, atmoMat);
        scene.add(atmosphereMesh);
    }

    /* ============================================================
       LAT/LON → 3D VECTOR
    ============================================================ */
    function latLonToVec3(lat, lon, r) {
        const phi = (90 - lat) * (Math.PI / 180);
        const theta = (lon + 180) * (Math.PI / 180);
        return new THREE.Vector3(
            -r * Math.sin(phi) * Math.cos(theta),
            r * Math.cos(phi),
            r * Math.sin(phi) * Math.sin(theta)
        );
    }

    /* ============================================================
       ADD MARKER
    ============================================================ */
    function addMarker(data) {
        const { id, lat, lon, type, magnitude } = data;
        removeMarker(id);

        const surfaceR = EARTH_R + 0.018;
        const pos = latLonToVec3(lat, lon, surfaceR);
        const normal = pos.clone().normalize();

        /* Color scheme by type/severity */
        let coreColor, emitColor, glowColor, spikeH;
        if (type === 'earthquake') {
            if (magnitude >= 5) {
                coreColor = 0xff1144; emitColor = 0xff0033; glowColor = 0xff0044; spikeH = 0.26 + magnitude * 0.055;
            } else if (magnitude >= 3) {
                coreColor = 0xff6600; emitColor = 0xff4400; glowColor = 0xff6600; spikeH = 0.14 + magnitude * 0.03;
            } else {
                coreColor = 0xffdd00; emitColor = 0xffaa00; glowColor = 0xffcc00; spikeH = 0.10;
            }
        } else {
            coreColor = 0x22aaff; emitColor = 0x0077ff; glowColor = 0x44aaff; spikeH = 0.13;
        }

        const group = new THREE.Group();

        /* -- Spike (tapered cone from surface) -- */
        const spikeGeo = new THREE.CylinderGeometry(0, 0.012, spikeH, 6, 1, false);
        spikeGeo.translate(0, spikeH / 2, 0);
        const spikeMat = new THREE.MeshBasicMaterial({ color: coreColor, transparent: true, opacity: 0.85 });
        group.add(new THREE.Mesh(spikeGeo, spikeMat));

        /* -- Core orb -- */
        const coreR = type === 'earthquake' ? (0.018 + Math.min(magnitude, 8) * 0.005) : 0.016;
        const coreGeo = new THREE.SphereGeometry(coreR, 14, 14);
        const coreMat = new THREE.MeshStandardMaterial({
            color: coreColor, emissive: emitColor, emissiveIntensity: 2.0,
            transparent: true, opacity: 0.95, roughness: 0.2, metalness: 0.1,
        });
        const coreOrb = new THREE.Mesh(coreGeo, coreMat);
        coreOrb.position.y = spikeH;
        group.add(coreOrb);

        /* -- Glow halo (sprite-like sphere, additive) -- */
        const haloGeo = new THREE.SphereGeometry(coreR * 2.8, 10, 10);
        const haloMat = new THREE.MeshBasicMaterial({
            color: glowColor, transparent: true, opacity: 0.25,
            blending: THREE.AdditiveBlending, depthWrite: false,
        });
        const halo = new THREE.Mesh(haloGeo, haloMat);
        halo.position.y = spikeH;
        group.add(halo);

        /* -- Pulse ring #1 -- */
        const ring1Geo = new THREE.RingGeometry(coreR * 1.8, coreR * 2.4, 32);
        const ring1Mat = new THREE.MeshBasicMaterial({
            color: glowColor, transparent: true, opacity: 0.7,
            side: THREE.DoubleSide, depthWrite: false,
            blending: THREE.AdditiveBlending,
        });
        const ring1 = new THREE.Mesh(ring1Geo, ring1Mat);
        ring1.position.y = spikeH;
        group.add(ring1);

        /* -- Pulse ring #2 (offset phase) -- */
        const ring2Geo = new THREE.RingGeometry(coreR * 2.2, coreR * 3.0, 32);
        const ring2Mat = new THREE.MeshBasicMaterial({
            color: glowColor, transparent: true, opacity: 0.45,
            side: THREE.DoubleSide, depthWrite: false,
            blending: THREE.AdditiveBlending,
        });
        const ring2 = new THREE.Mesh(ring2Geo, ring2Mat);
        ring2.position.y = spikeH;
        group.add(ring2);

        /* -- Orient group to surface normal -- */
        group.position.copy(latLonToVec3(lat, lon, EARTH_R));
        const up = new THREE.Vector3(0, 1, 0);
        group.quaternion.setFromUnitVectors(up, normal);

        group.userData = {
            id, data, type, coreR,
            ring1, ring1Mat, ring2, ring2Mat, halo, haloMat, coreMat,
            isMarker: true,
            phase: Math.random() * Math.PI * 2, // random start phase for rings
        };

        markerGroup.add(group);

        /* Fade in */
        group.scale.set(0.001, 0.001, 0.001);
        _tweenScale(group, 1.0, 500);

        markers.push(group);
        return group;
    }

    /* ============================================================
       ANIMATE
    ============================================================ */
    function _animate() {
        animFrameId = requestAnimationFrame(_animate);
        const delta = clock.getDelta();
        const t = clock.getElapsedTime();

        /* FPS counter */
        fpsFrames++;
        const now = performance.now();
        if (now - fpsLast >= 1000) {
            const el = document.getElementById('fps-label');
            if (el) el.textContent = fpsFrames + ' FPS';
            fpsFrames = 0;
            fpsLast = now;
        }

        /* Star twinkle */
        if (starField) starField.material.uniforms.uTime.value = t;

        /* Earth slow rotate */
        if (autoRotate) {
            earthMesh.rotation.y += 0.0006;
            if (nightMesh) nightMesh.rotation.y = earthMesh.rotation.y;
            if (cloudMesh) cloudMesh.rotation.y = earthMesh.rotation.y + 0.00015 * t;
            if (atmosphereInnerMesh) atmosphereInnerMesh.rotation.y = earthMesh.rotation.y;
            markerGroup.rotation.y = earthMesh.rotation.y;
        }

        /* Dynamic night-side opacity — fades city lights depending on sun angle */
        if (nightMesh) {
            const sunDir = new THREE.Vector3(Math.cos(t * 0.01), 0.15, Math.sin(t * 0.01)).normalize();
            const camDir = camera.position.clone().normalize();
            const camSun = camDir.dot(sunDir);
            nightMesh.material.opacity = THREE.MathUtils.clamp((0.3 - camSun) * 1.8, 0.0, 0.85);
        }

        /* Pulse markers */
        markers.forEach(m => {
            const ud = m.userData;
            if (!ud.ring1Mat) return;
            const phase = t * 2.0 + ud.phase;
            const p1 = (phase % 1.0);
            const p2 = ((phase + 0.5) % 1.0);
            ud.ring1.scale.setScalar(1.0 + p1 * 3.5);
            ud.ring1Mat.opacity = (1.0 - p1) * 0.70;
            ud.ring2.scale.setScalar(1.0 + p2 * 3.5);
            ud.ring2Mat.opacity = (1.0 - p2) * 0.42;

            /* Halo breathe */
            if (ud.haloMat) {
                ud.haloMat.opacity = 0.18 + Math.sin(t * 2.5 + ud.phase) * 0.10;
            }
        });

        controls.update();
        renderer.render(scene, camera);
    }

    /* ============================================================
       MOUSE / TOUCH
    ============================================================ */
    function _onMouseMove(e) {
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        _checkHover();
    }

    function _onTouch(e) {
        if (!e.changedTouches.length) return;
        const t = e.changedTouches[0];
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((t.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((t.clientY - rect.top) / rect.height) * 2 + 1;
        _pickMarker();
    }

    function _checkHover() {
        raycaster.setFromCamera(mouse, camera);
        const hits = raycaster.intersectObjects(markerGroup.children, true);
        const found = _findMarkerInHits(hits);

        if (found !== hovered) {
            if (hovered) {
                _tweenScale(hovered, 1.0, 180);
                renderer.domElement.style.cursor = 'grab';
            }
            hovered = found;
            if (hovered) {
                _tweenScale(hovered, 1.45, 180);
                renderer.domElement.style.cursor = 'pointer';
                onMarkerHover && onMarkerHover(hovered.userData.data);
            }
        }
    }

    function _onClick() {
        _pickMarker();
    }

    function _pickMarker() {
        raycaster.setFromCamera(mouse, camera);
        const hits = raycaster.intersectObjects(markerGroup.children, true);
        const found = _findMarkerInHits(hits);
        if (found) {
            onMarkerClick && onMarkerClick(found.userData.data);
            zoomTo(found.userData.data.lat, found.userData.data.lon);
        }
    }

    function _findMarkerInHits(hits) {
        for (const hit of hits) {
            let obj = hit.object;
            while (obj && !obj.userData.isMarker) obj = obj.parent;
            if (obj && obj.userData.isMarker) return obj;
        }
        return null;
    }

    /* ============================================================
       CAMERA
    ============================================================ */
    function zoomTo(lat, lon, dist = 3.4) {
        const target = latLonToVec3(lat, lon, dist);
        if (typeof gsap !== 'undefined') {
            gsap.to(camera.position, {
                x: target.x, y: target.y, z: target.z,
                duration: 1.6, ease: 'power3.inOut',
                onUpdate: () => { camera.lookAt(0, 0, 0); controls.update(); },
            });
        } else {
            camera.position.set(target.x, target.y, target.z);
            camera.lookAt(0, 0, 0);
        }
    }

    function resetCamera() {
        if (typeof gsap !== 'undefined') {
            gsap.to(camera.position, {
                x: 0, y: 1.5, z: 6.5,
                duration: 1.4, ease: 'power2.inOut',
                onUpdate: () => { camera.lookAt(0, 0, 0); controls.update(); },
            });
        } else {
            camera.position.set(0, 1.5, 6.5);
            camera.lookAt(0, 0, 0);
        }
    }

    function zoomIn() {
        const d = camera.position.length();
        gsap?.to(camera.position, {
            x: camera.position.x / d * Math.max(d * 0.7, controls.minDistance),
            y: camera.position.y / d * Math.max(d * 0.7, controls.minDistance),
            z: camera.position.z / d * Math.max(d * 0.7, controls.minDistance),
            duration: 0.5, ease: 'power2.out',
            onUpdate: () => { camera.lookAt(0, 0, 0); controls.update(); },
        }) ?? (() => {
            const nd = Math.max(d * 0.7, controls.minDistance);
            camera.position.multiplyScalar(nd / d);
        })();
    }

    function zoomOut() {
        const d = camera.position.length();
        const nd = Math.min(d * 1.4, controls.maxDistance);
        gsap?.to(camera.position, {
            x: camera.position.x / d * nd,
            y: camera.position.y / d * nd,
            z: camera.position.z / d * nd,
            duration: 0.5, ease: 'power2.out',
            onUpdate: () => { camera.lookAt(0, 0, 0); controls.update(); },
        }) ?? camera.position.multiplyScalar(nd / d);
    }

    /* ============================================================
       HELPERS
    ============================================================ */
    function _tweenScale(obj, target, ms) {
        const t0 = performance.now();
        const s0 = obj.scale.x;
        (function step(now) {
            const p = Math.min((now - t0) / ms, 1);
            const ease = 1 - Math.pow(1 - p, 3);
            const s = s0 + (target - s0) * ease;
            obj.scale.set(s, s, s);
            if (p < 1) requestAnimationFrame(step);
        })(t0);
    }

    function removeMarker(id) {
        const i = markers.findIndex(m => m.userData.id === id);
        if (i === -1) return;
        const m = markers[i];
        markerGroup.remove(m);
        m.traverse(c => { c.geometry?.dispose(); c.material?.dispose(); });
        markers.splice(i, 1);
    }

    function clearMarkers() {
        markers.forEach(m => {
            markerGroup.remove(m);
            m.traverse(c => { c.geometry?.dispose(); c.material?.dispose(); });
        });
        markers = [];
    }

    function setTypeVisible(type, visible) {
        markers.forEach(m => { if (m.userData.type === type) m.visible = visible; });
    }

    function toggleAutoRotate() {
        autoRotate = !autoRotate;
        return autoRotate;
    }

    /* ============================================================
       HEATMAP
    ============================================================ */
    function showHeatmap(events) {
        const W = 2048, H = 1024;
        const canvas = document.createElement('canvas');
        canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, W, H);

        events.forEach(ev => {
            const x = ((ev.lon + 180) / 360) * W;
            const y = ((90 - ev.lat) / 180) * H;
            const mag = ev.magnitude || 1;
            const r = Math.max(18, mag * 18);
            const a = mag >= 5 ? 0.9 : mag >= 3 ? 0.6 : 0.35;
            const g = ctx.createRadialGradient(x, y, 0, x, y, r);
            g.addColorStop(0, `rgba(255, 20, 60, ${a})`);
            g.addColorStop(0.4, `rgba(255, 100, 0, ${a * 0.5})`);
            g.addColorStop(1, `rgba(255, 200, 0, 0)`);
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
        });

        if (!heatmapTexture) {
            heatmapTexture = new THREE.CanvasTexture(canvas);
        } else {
            heatmapTexture.image = canvas;
            heatmapTexture.needsUpdate = true;
        }

        if (!heatmapMesh) {
            const geo = new THREE.SphereGeometry(EARTH_R * 1.008, 64, 64);
            const mat = new THREE.MeshBasicMaterial({
                map: heatmapTexture, transparent: true, opacity: 0.75,
                blending: THREE.AdditiveBlending, depthWrite: false,
            });
            heatmapMesh = new THREE.Mesh(geo, mat);
            scene.add(heatmapMesh);
        }
        heatmapMesh.visible = true;
        isHeatmapVisible = true;
    }

    function hideHeatmap() {
        if (heatmapMesh) { heatmapMesh.visible = false; }
        isHeatmapVisible = false;
    }

    function toggleHeatmap(events) {
        if (isHeatmapVisible) { hideHeatmap(); return false; }
        showHeatmap(events);
        return true;
    }

    /* ============================================================
       RESIZE
    ============================================================ */
    function _onResize() {
        const container = renderer.domElement.parentElement;
        if (!container) return;
        const w = container.clientWidth, h = container.clientHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
    }

    function getMarkerCount() { return markers.length; }

    /* ============================================================
       PUBLIC API
    ============================================================ */
    return {
        init, addMarker, removeMarker, clearMarkers,
        zoomTo, resetCamera, zoomIn, zoomOut,
        toggleAutoRotate, setTypeVisible, getMarkerCount,
        showHeatmap, hideHeatmap, toggleHeatmap,
    };
})();
