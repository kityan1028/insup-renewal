/* Insup 3D background effects (three.js r128, global THREE) */
(() => {
  const C = {
    navy: new THREE.Color('#0b2d6b'), deep: new THREE.Color('#051c50'), blue: new THREE.Color('#1976f6'),
    sky: new THREE.Color('#4db3ff'), ice: new THREE.Color('#75f2ff'), pale: new THREE.Color('#ebf4ff')
  };
  const lerp = (a, b, t) => a + (b - a) * t;
  const demos = [];
  const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), tmpV = new THREE.Vector3();
  const pointerWorld = (st, out) => { ray.setFromCamera(st.mouse, st.camera); ray.ray.intersectPlane(plane, out); return out; };

  /* mount(canvasHost, effect, {hit}) — hit = element whose pointer moves drive the effect */
  function mount(host, effect, opts = {}) {
    const hit = opts.hit || host;
    const canvas = document.createElement('canvas');
    canvas.className = 'fx-canvas';
    host.appendChild(canvas);
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1.6, 0.1, 200);
    camera.position.set(0, 0, 10);
    const st = { host, canvas, renderer, scene, camera, t: 0, stage: 0, mouse: new THREE.Vector2(), target: new THREE.Vector2(), visible: false, enabled: true, aspect: 1.6 };
    const api = (typeof effect === 'function' ? effect : FX[effect])(st);
    st.api = api;
    hit.addEventListener('pointermove', e => { const r = hit.getBoundingClientRect(); st.target.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height * 2 - 1)); });
    hit.addEventListener('pointerleave', () => st.target.set(0, 0));
    const resize = () => { const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; st.aspect = w / h; camera.updateProjectionMatrix(); api.resize && api.resize(); };
    new ResizeObserver(resize).observe(host); resize();
    new IntersectionObserver(es => es.forEach(e => st.visible = e.isIntersecting), { rootMargin: '100px' }).observe(host);
    st.next = stage => { st.stage = stage; api.next && api.next(stage); };
    demos.push(st);
    return st;
  }

  /* ---------- ribbons (light bands like the logo) ---------- */
  function ribbon(st) {
    const group = new THREE.Group(); st.scene.add(group);
    const vs = `
      uniform float uTime, uAmp, uTwist, uPhase, uWidth, uY, uLen, uZ; uniform vec2 uMouse;
      varying float vU, vV, vShade;
      vec3 curve(float u){
        float x = u*uLen;
        float bump = exp(-pow(x - uMouse.x*6.5, 2.0)*0.06);
        float y = uY + sin(u*3.1 + uTime*0.35 + uPhase)*uAmp + sin(u*7.3 - uTime*0.27 + uPhase*2.0)*0.25*uAmp + uMouse.y*3.2*bump;
        float z = uZ + cos(u*2.4 + uTime*0.3 + uPhase)*1.6 + bump*uMouse.y*1.5;
        return vec3(x,y,z);
      }
      void main(){
        float u = position.x, v = position.y;
        vec3 p = curve(u), p2 = curve(u+0.003);
        vec3 T = normalize(p2-p), N = normalize(cross(T, vec3(0.0,0.0,1.0))), B = normalize(cross(T, N));
        float ang = u*uTwist + uTime*0.22 + uPhase + uMouse.x*1.8;
        vec3 W = N*cos(ang) + B*sin(ang);
        vec3 nrm = normalize(cross(T, W));
        vShade = abs(normalize(normalMatrix*nrm).z); vU = u; vV = v;
        gl_Position = projectionMatrix*modelViewMatrix*vec4(p + W*v*uWidth, 1.0);
      }`;
    const fs = `
      uniform vec3 c1,c2,c3,c4; uniform float uAlpha; varying float vU, vV, vShade;
      void main(){
        float s = vShade;
        vec3 col = mix(c1, c2, smoothstep(0.0,0.7,s));
        col = mix(col, c3, smoothstep(0.55,0.95,s)*0.9);
        col = mix(col, c4, pow(s,8.0)*0.8);
        col += c4*smoothstep(0.42,0.5,abs(vV))*0.35*s;
        gl_FragColor = vec4(col, smoothstep(0.5,0.38,abs(vU))*uAlpha);
      }`;
    const P = [{ uY: 1.3, uWidth: 1.1, uPhase: 0.0, uTwist: 5.0, uZ: 0.0 }, { uY: -0.2, uWidth: 0.7, uPhase: 2.1, uTwist: 7.0, uZ: -1.5 }, { uY: -1.8, uWidth: 1.3, uPhase: 4.0, uTwist: 4.0, uZ: -0.5 }];
    const STG = [{ amp: 1.0, len: 16, rotZ: 0.0 }, { amp: 2.2, len: 18, rotZ: -0.45 }, { amp: 0.5, len: 14, rotZ: 0.35 }];
    const mats = P.map(p => {
      const m = new THREE.ShaderMaterial({
        vertexShader: vs, fragmentShader: fs, transparent: true, side: THREE.DoubleSide, depthWrite: false,
        uniforms: { uTime: { value: 0 }, uAmp: { value: 1 }, uTwist: { value: p.uTwist }, uPhase: { value: p.uPhase }, uWidth: { value: p.uWidth }, uY: { value: p.uY }, uLen: { value: 16 }, uZ: { value: p.uZ }, uMouse: { value: new THREE.Vector2() }, uAlpha: { value: 1 },
          c1: { value: C.deep }, c2: { value: C.navy.clone().lerp(C.blue, 0.5) }, c3: { value: C.blue }, c4: { value: C.ice } }
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 500, 2), m); mesh.frustumCulled = false; group.add(mesh); return m;
    });
    const cur = { amp: 1, len: 16, rotZ: 0 };
    return {
      update() {
        const s = STG[st.stage % STG.length];
        cur.amp = lerp(cur.amp, s.amp, 0.03); cur.len = lerp(cur.len, s.len, 0.03); cur.rotZ = lerp(cur.rotZ, s.rotZ, 0.03);
        mats.forEach((m, i) => { m.uniforms.uTime.value = st.t; m.uniforms.uMouse.value.copy(st.mouse); m.uniforms.uAmp.value = cur.amp * (1 + Math.abs(st.mouse.y) * 0.6) * (i === 1 ? 0.8 : 1); m.uniforms.uLen.value = cur.len; });
        group.rotation.set(-st.mouse.y * 0.35, st.mouse.x * 0.55, cur.rotZ);
      }
    };
  }

  /* ---------- particles forming the two speech bubbles ---------- */
  function particles(st, o = {}) {
    const N = o.count || 7000, cloud = new Float32Array(N * 3), bubble = new Float32Array(N * 3), grid = new Float32Array(N * 3), col = new Float32Array(N * 3), rnd = new Float32Array(N);
    const bubbleShape = (cx, cy, w, h, r, tail) => {
      const s = new THREE.Shape(), x0 = cx - w / 2, y0 = cy - h / 2, x1 = cx + w / 2, y1 = cy + h / 2;
      s.moveTo(x0 + r, y0); if (tail) { s.lineTo(x0 + r + 0.15, y0 - 0.7); s.lineTo(x0 + r + 0.6, y0); }
      s.lineTo(x1 - r, y0); s.quadraticCurveTo(x1, y0, x1, y0 + r); s.lineTo(x1, y1 - r); s.quadraticCurveTo(x1, y1, x1 - r, y1); s.lineTo(x0 + r, y1); s.quadraticCurveTo(x0, y1, x0, y1 - r); s.lineTo(x0, y0 + r); s.quadraticCurveTo(x0, y0, x0 + r, y0);
      return s.getSpacedPoints(900);
    };
    const outlines = [bubbleShape(-1.5, 1.05, 3.6, 2.5, 0.9, true), bubbleShape(1.5, -1.15, 3.6, 2.5, 0.9, false)];
    const gw = 110, gh = 64;
    for (let i = 0; i < N; i++) {
      const v = Math.acos(2 * Math.random() - 1), th = Math.random() * Math.PI * 2, r = 3.2 + Math.random() * 2.6;
      cloud.set([Math.sin(v) * Math.cos(th) * r * 1.5, Math.sin(v) * Math.sin(th) * r * 0.85, Math.cos(v) * r], i * 3);
      const o = outlines[i % 2], p = o[(Math.random() * o.length) | 0];
      bubble.set([p.x + (Math.random() - 0.5) * 0.32, p.y + (Math.random() - 0.5) * 0.32, (Math.random() - 0.5) * 0.6], i * 3);
      grid.set([((i % gw) / (gw - 1) - 0.5) * 15, ((Math.floor(i / gw) % gh) / (gh - 1) - 0.5) * 8.5, 0], i * 3);
      const c = o.bright
        ? C.sky.clone().lerp(C.ice, Math.random()).lerp(new THREE.Color('#ffffff'), Math.random() < 0.35 ? 0.85 : 0.25)
        : C.blue.clone().lerp(C.sky, Math.random()).lerp(new THREE.Color('#ffffff'), Math.random() < 0.12 ? 0.7 : 0);
      col.set([c.r, c.g, c.b], i * 3); rnd[i] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(cloud, 3)); g.setAttribute('aBubble', new THREE.BufferAttribute(bubble, 3));
    g.setAttribute('aGrid', new THREE.BufferAttribute(grid, 3)); g.setAttribute('aCol', new THREE.BufferAttribute(col, 3)); g.setAttribute('aRnd', new THREE.BufferAttribute(rnd, 1));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uW: { value: new THREE.Vector3(1, 0, 0) }, uM: { value: new THREE.Vector3(99, 99, 0) }, uPR: { value: st.renderer.getPixelRatio() * (o.size || 1) } },
      vertexShader: `
        attribute vec3 aBubble, aGrid, aCol; attribute float aRnd; uniform float uTime, uPR; uniform vec3 uW, uM;
        varying vec3 vCol; varying float vA;
        void main(){
          vec3 gp = aGrid; gp.z = sin(gp.x*0.7+uTime*0.9)*cos(gp.y*0.9+uTime*0.6)*0.9;
          vec3 cp = position; float a = uTime*0.08; cp.xz = mat2(cos(a),-sin(a),sin(a),cos(a))*cp.xz;
          vec3 p = cp*uW.x + aBubble*uW.y + gp*uW.z;
          p += vec3(sin(uTime*0.7+aRnd*20.0), cos(uTime*0.6+aRnd*15.0), sin(uTime*0.5+aRnd*9.0))*0.06;
          vec2 d = p.xy - uM.xy; float f = exp(-dot(d,d)*0.55);
          p.xy += normalize(d+1e-4)*f*1.6; p.z += f*1.8;
          vCol = aCol + f*0.5; vA = 0.55 + f*0.45;
          vec4 mv = modelViewMatrix*vec4(p,1.0);
          gl_PointSize = (2.0 + aRnd*2.6 + f*3.0) * uPR * (9.0 / -mv.z);
          gl_Position = projectionMatrix*mv;
        }`,
      fragmentShader: `varying vec3 vCol; varying float vA;
        void main(){ float d = length(gl_PointCoord-0.5); if(d>0.5) discard; gl_FragColor = vec4(vCol, vA*smoothstep(0.5,0.0,d)); }`
    });
    const pts = new THREE.Points(g, m); pts.frustumCulled = false; st.scene.add(pts);
    const W = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)], local = new THREE.Vector3();
    return {
      update() {
        m.uniforms.uTime.value = st.t;
        m.uniforms.uW.value.lerp(W[st.stage % 3], 0.035);
        pts.rotation.y = lerp(pts.rotation.y, st.mouse.x * 0.5, 0.08);
        pts.rotation.x = lerp(pts.rotation.x, -st.mouse.y * 0.35, 0.08);
        pts.updateMatrixWorld();
        pointerWorld(st, tmpV); local.copy(tmpV); pts.worldToLocal(local);
        if (st.target.lengthSq() === 0 && st.mouse.lengthSq() < 0.001) local.set(99, 99, 0);
        m.uniforms.uM.value.lerp(local, 0.25);
      }
    };
  }

  /* ---------- network of nodes ---------- */
  function network(st) {
    const N = 150, MAXL = 1600, nodes = [], targets = [[], [], []];
    for (let i = 0; i < N; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 15, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 5);
      nodes.push({ p: v.clone(), off: Math.random() * 10 }); targets[0].push(v);
      const side = i % 2 ? 1 : -1, a = Math.random() * Math.PI * 2, b = Math.acos(2 * Math.random() - 1), r = 1.2 + Math.random() * 1.6;
      targets[1].push(new THREE.Vector3(side * 3.6 + Math.sin(b) * Math.cos(a) * r, Math.sin(b) * Math.sin(a) * r, Math.cos(b) * r));
      targets[2].push(new THREE.Vector3(Math.sin(b) * Math.cos(a) * 3.4, Math.sin(b) * Math.sin(a) * 3.4, Math.cos(b) * 3.4));
    }
    const ppos = new Float32Array(N * 3), pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(ppos, 3));
    const group = new THREE.Group(); st.scene.add(group);
    group.add(new THREE.Points(pg, new THREE.PointsMaterial({ color: 0x75f2ff, size: 0.09, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false })));
    const lpos = new Float32Array(MAXL * 6), lcol = new Float32Array(MAXL * 6), lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(lpos, 3)); lg.setAttribute('color', new THREE.BufferAttribute(lcol, 3));
    const lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    lines.frustumCulled = false; group.add(lines);
    const mw = new THREE.Vector3(), ml = new THREE.Vector3();
    return {
      update() {
        group.rotation.y = lerp(group.rotation.y, st.mouse.x * 0.6 + (st.stage % 3 === 2 ? st.t * 0.15 : 0), 0.05);
        group.rotation.x = lerp(group.rotation.x, -st.mouse.y * 0.4, 0.05);
        group.updateMatrixWorld();
        pointerWorld(st, mw); ml.copy(mw); group.worldToLocal(ml);
        const active = st.target.lengthSq() > 0, T = targets[st.stage % 3];
        nodes.forEach((n, i) => {
          const t = T[i];
          n.p.x = lerp(n.p.x, t.x + Math.sin(st.t * 0.5 + n.off) * 0.25, 0.03);
          n.p.y = lerp(n.p.y, t.y + Math.cos(st.t * 0.4 + n.off) * 0.25, 0.03);
          n.p.z = lerp(n.p.z, t.z, 0.03);
          if (active) { const d = n.p.distanceTo(ml); if (d < 3.2) n.p.lerp(ml, 0.04 * (1 - d / 3.2)); }
          ppos[i * 3] = n.p.x; ppos[i * 3 + 1] = n.p.y; ppos[i * 3 + 2] = n.p.z;
        });
        pg.attributes.position.needsUpdate = true;
        let k = 0; const R = 1.9;
        for (let i = 0; i < N && k < MAXL; i++) {
          const a = nodes[i].p;
          if (active) { const d = a.distanceTo(ml); if (d < 3.0) { const s = 1 - d / 3.0; lpos.set([a.x, a.y, a.z, ml.x, ml.y, ml.z], k * 6); lcol.set([C.ice.r * s, C.ice.g * s, C.ice.b * s, C.ice.r * s, C.ice.g * s, C.ice.b * s], k * 6); k++; } }
          for (let j = i + 1; j < N && k < MAXL; j++) {
            const b = nodes[j].p, d = a.distanceTo(b);
            if (d < R) { const s = (1 - d / R) * 0.8, c = C.blue.clone().lerp(C.sky, s); lpos.set([a.x, a.y, a.z, b.x, b.y, b.z], k * 6); lcol.set([c.r * s, c.g * s, c.b * s, c.r * s, c.g * s, c.b * s], k * 6); k++; }
          }
        }
        lg.setDrawRange(0, k * 2); lg.attributes.position.needsUpdate = true; lg.attributes.color.needsUpdate = true;
      }
    };
  }

  /* ---------- photo with depth parallax + glowing sign ---------- */
  function photoDepth(st, o) {
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1); st.camera = cam;
    const load = url => { const t = new THREE.TextureLoader().load(url); t.minFilter = THREE.LinearFilter; return t; };
    const u = {
      uTex: { value: load(o.image) }, uDepth: { value: load(o.depth) }, uMouse: { value: new THREE.Vector2() }, uAspect: { value: 1.6 }, uImg: { value: o.imageAspect },
      uCenter: { value: new THREE.Vector2(o.center[0], o.center[1]) }, uSign: { value: new THREE.Vector2(o.sign[0], o.sign[1]) }, uTime: { value: 0 }, uZoom: { value: 1 }, uGlow: { value: 0 }
    };
    const m = new THREE.ShaderMaterial({
      uniforms: u,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: `
        uniform sampler2D uTex, uDepth; uniform vec2 uMouse, uCenter, uSign; uniform float uAspect, uImg, uTime, uZoom, uGlow;
        varying vec2 vUv;
        void main(){
          vec2 uv = vUv - 0.5;
          float r = uAspect / uImg;
          if (r > 1.0) uv.y /= r; else uv.x *= r;
          uv = uv / uZoom * 0.92 + uCenter;
          float d = texture2D(uDepth, uv).r;
          vec2 p = uv - uMouse * (d - 0.35) * vec2(0.05, 0.035);
          vec3 c = texture2D(uTex, p).rgb;
          vec2 mp = uCenter + uMouse * vec2(0.28, 0.25);
          vec2 q = (p - mp) * vec2(uImg, 1.0);
          c *= 0.78 + 0.38 * exp(-dot(q, q) * 6.0);
          vec2 s = (p - uSign) * vec2(uImg, 1.0) * vec2(2.2, 1.4);
          float pulse = 0.55 + 0.45 * sin(uTime * 1.6);
          c += vec3(0.10, 0.45, 1.0) * exp(-dot(s, s) * 9.0) * (0.18 + 0.22 * uGlow) * pulse;
          gl_FragColor = vec4(c, 1.0);
        }`
    });
    st.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m));
    return {
      update() {
        u.uTime.value = st.t; u.uAspect.value = st.aspect; u.uMouse.value.copy(st.mouse);
        const near = 1 - Math.min(1, Math.hypot(st.mouse.x * 1.2, st.mouse.y));
        u.uGlow.value = lerp(u.uGlow.value, st.target.lengthSq() > 0 ? near : 0.3, 0.06);
        u.uZoom.value = lerp(u.uZoom.value, st.stage ? 2.4 : 1, 0.045);
      }
    };
  }

  /* ---------- glossy 3D speech bubbles (for light backgrounds) ---------- */
  function glass(st) {
    const sc = st.scene;
    sc.add(new THREE.HemisphereLight(0xffffff, 0xbcd4ff, 0.75));
    const key = new THREE.DirectionalLight(0xffffff, 0.9); key.position.set(3, 5, 8); sc.add(key);
    const lc = new THREE.PointLight(0x4db3ff, 2.2, 30); sc.add(lc);
    const lb = new THREE.PointLight(0x1976f6, 1.6, 30); lb.position.set(-6, -3, 5); sc.add(lb);
    function bubbleGeo(w, h, r, t, tail) {
      const x0 = -w / 2, y0 = -h / 2, x1 = w / 2, y1 = h / 2, s = new THREE.Shape();
      s.moveTo(x0 + r, y0); if (tail) { s.lineTo(x0 + r + 0.05, y0 - 0.75); s.lineTo(x0 + r + 0.65, y0); }
      s.lineTo(x1 - r, y0); s.quadraticCurveTo(x1, y0, x1, y0 + r); s.lineTo(x1, y1 - r); s.quadraticCurveTo(x1, y1, x1 - r, y1); s.lineTo(x0 + r, y1); s.quadraticCurveTo(x0, y1, x0, y1 - r); s.lineTo(x0, y0 + r); s.quadraticCurveTo(x0, y0, x0 + r, y0);
      const hi = new THREE.Path(), a0 = x0 + t, b0 = y0 + t, a1 = x1 - t, b1 = y1 - t, ri = Math.max(r - t, 0.15);
      hi.moveTo(a0 + ri, b0); hi.lineTo(a1 - ri, b0); hi.quadraticCurveTo(a1, b0, a1, b0 + ri); hi.lineTo(a1, b1 - ri); hi.quadraticCurveTo(a1, b1, a1 - ri, b1); hi.lineTo(a0 + ri, b1); hi.quadraticCurveTo(a0, b1, a0, b1 - ri); hi.lineTo(a0, b0 + ri); hi.quadraticCurveTo(a0, b0, a0 + ri, b0);
      s.holes.push(hi);
      const g = new THREE.ExtrudeGeometry(s, { depth: 0.45, bevelEnabled: true, bevelThickness: 0.16, bevelSize: 0.13, bevelSegments: 6, curveSegments: 24 });
      g.center(); return g;
    }
    const geoA = bubbleGeo(3.0, 2.2, 0.8, 0.42, true), geoB = bubbleGeo(3.0, 2.2, 0.8, 0.42, false);
    const mk = c => new THREE.MeshPhysicalMaterial({ color: c, metalness: 0.15, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08 });
    const defs = [{ g: geoA, c: '#1976f6', s: 1.0 }, { g: geoB, c: '#1460d8', s: 1.0 }, { g: geoA, c: '#4db3ff', s: 0.55 }, { g: geoB, c: '#0b2d6b', s: 0.45 }, { g: geoA, c: '#75d4ff', s: 0.35 }, { g: geoB, c: '#1976f6', s: 0.3 }];
    const L = [
      [[3.2, 0.9, 0, 0.2, -0.5, 0.1], [4.8, -1.3, -1.5, -0.2, -0.7, -0.1], [0.6, 2.6, -2, 0.4, 0.3, 0.3], [6.2, 2.4, -3, 0.1, 0.8, 0.2], [-1.5, -2.6, -1, 0.3, 0.4, -0.2], [7, -2.8, -2, -0.4, 0.2, 0.4]],
      [[2.6, 0.9, 0.5, 0, -0.25, 0], [4.4, -0.8, -0.2, 0, -0.25, 0], [-4.5, 2.8, -3, 0.5, 0.6, 0.2], [7, 2.6, -4, 0.3, 0.4, 0.1], [-5.5, -2.5, -3, -0.3, 0.5, 0.4], [6.5, -3.0, -3, 0.4, -0.3, 0.2]],
      [[-3.2, 2.2, -2, 0.6, 0.9, 0.4], [3.6, -2.0, -1, -0.5, -0.8, 0.3], [4.5, 2.0, 0, 0.2, -1.2, 0.5], [-5.5, -1.8, -1, 0.8, 0.5, -0.4], [1.0, -3.2, -0.5, -0.2, 0.9, 0.6], [7.2, 0.2, -2, 0.5, -0.5, -0.3]],
    ];
    const meshes = defs.map((d, i) => { const m = new THREE.Mesh(d.g, mk(d.c)); m.scale.setScalar(d.s); const l = L[0][i]; m.position.set(l[0], l[1], l[2]); m.rotation.set(l[3], l[4], l[5]); sc.add(m); return m; });
    return {
      update() {
        const lay = L[st.stage % 3];
        meshes.forEach((m, i) => {
          const l = lay[i], k = 0.04, depth = 1 + (2 + l[2]) * 0.25;
          m.position.x = lerp(m.position.x, l[0] + st.mouse.x * 0.6 * depth, k);
          m.position.y = lerp(m.position.y, l[1] + st.mouse.y * 0.4 * depth + Math.sin(st.t * 0.8 + i) * 0.12, k);
          m.position.z = lerp(m.position.z, l[2], k);
          m.rotation.x = lerp(m.rotation.x, l[3] - st.mouse.y * 0.9, k * 1.5);
          m.rotation.y = lerp(m.rotation.y, l[4] + st.mouse.x * 1.1 + Math.sin(st.t * 0.5 + i) * 0.08, k * 1.5);
          m.rotation.z = lerp(m.rotation.z, l[5], k);
        });
        lc.position.set(st.mouse.x * 7, st.mouse.y * 4.5, 4);
        lb.position.set(-st.mouse.x * 6, -st.mouse.y * 3 - 1, 5);
      }
    };
  }

  /* ---------- glowing wave surface ---------- */
  function wave(st) {
    const g = new THREE.PlaneGeometry(26, 16, 260, 160);
    const m = new THREE.ShaderMaterial({
      transparent: true,
      uniforms: { uTime: { value: 0 }, uM: { value: new THREE.Vector2() }, uAmp: { value: 1 }, uFreq: { value: 1 }, uRip: { value: 0 }, c1: { value: C.deep }, c2: { value: C.blue }, c3: { value: C.ice } },
      vertexShader: `
        uniform float uTime, uAmp, uFreq, uRip; uniform vec2 uM; varying float vH; varying vec3 vN; varying vec2 vP;
        float h(vec2 p){
          float f = uFreq;
          float z = sin(p.x*0.45*f + uTime*0.6)*0.9 + sin(p.y*0.6*f - uTime*0.45)*0.7 + sin((p.x+p.y)*0.32*f + uTime*0.35)*0.8;
          float d = distance(p, uM);
          z += sin(d*2.2 - uTime*3.2)*exp(-d*0.28)*1.3*uRip;
          return z*uAmp*0.55;
        }
        void main(){
          vec2 p = position.xy; float e = 0.06; float z = h(p);
          vec3 n = normalize(vec3(h(p-vec2(e,0.0))-h(p+vec2(e,0.0)), h(p-vec2(0.0,e))-h(p+vec2(0.0,e)), 2.0*e));
          vH = z; vN = normalMatrix*n; vP = p;
          gl_Position = projectionMatrix*modelViewMatrix*vec4(p, z, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 c1,c2,c3; varying float vH; varying vec3 vN; varying vec2 vP;
        void main(){
          vec3 n = normalize(vN);
          float l = clamp(dot(n, normalize(vec3(0.3,0.6,0.8))),0.0,1.0);
          float spec = pow(clamp(dot(reflect(-normalize(vec3(-0.2,0.5,0.8)), n), vec3(0.0,0.0,1.0)),0.0,1.0), 24.0);
          vec3 col = mix(c1, c2, smoothstep(-1.0,0.9,vH+l*0.6));
          col = mix(col, c3, smoothstep(0.55,1.3,vH+l*0.5)*0.75) + spec*0.6*c3;
          vec2 gl = abs(fract(vP*0.9)-0.5);
          col += c3*smoothstep(0.035,0.0,min(gl.x,gl.y))*0.12;
          gl_FragColor = vec4(col, smoothstep(13.0,9.0,abs(vP.x))*smoothstep(8.0,5.0,abs(vP.y))*0.95);
        }`
    });
    const mesh = new THREE.Mesh(g, m); mesh.rotation.x = -1.05; mesh.position.set(0, -1.6, 0); st.scene.add(mesh);
    const STG = [{ amp: 1, freq: 1, rx: -1.05, y: -1.6 }, { amp: 1.8, freq: 1.5, rx: -0.75, y: -0.6 }, { amp: 0.6, freq: 0.7, rx: -1.3, y: -2.4 }];
    const loc = new THREE.Vector3(); let rip = 0;
    return {
      update() {
        const s = STG[st.stage % 3];
        m.uniforms.uTime.value = st.t;
        m.uniforms.uAmp.value = lerp(m.uniforms.uAmp.value, s.amp, 0.03);
        m.uniforms.uFreq.value = lerp(m.uniforms.uFreq.value, s.freq, 0.03);
        mesh.rotation.x = lerp(mesh.rotation.x, s.rx + st.mouse.y * 0.25, 0.04);
        mesh.rotation.z = lerp(mesh.rotation.z, st.mouse.x * 0.35, 0.05);
        mesh.position.y = lerp(mesh.position.y, s.y, 0.04);
        mesh.updateMatrixWorld();
        ray.setFromCamera(st.mouse, st.camera);
        const hit = ray.intersectObject(mesh)[0];
        if (hit) { loc.copy(hit.point); mesh.worldToLocal(loc); m.uniforms.uM.value.lerp(new THREE.Vector2(loc.x, loc.y), 0.2); }
        rip = lerp(rip, st.target.lengthSq() > 0 ? 1 : 0.25, 0.05); m.uniforms.uRip.value = rip;
      }
    };
  }

  /* ---------- flowing lines (for light backgrounds) ---------- */
  function lines(st) {
    const NL = 64, P = 180, group = new THREE.Group(); st.scene.add(group);
    const objs = [];
    for (let i = 0; i < NL; i++) {
      const pos = new Float32Array(P * 3), g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const t = i / (NL - 1), c = C.navy.clone().lerp(C.blue, Math.min(t * 1.6, 1)).lerp(C.sky, Math.max(0, t * 1.4 - 0.5));
      const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: 0.75 }));
      line.frustumCulled = false; group.add(line); objs.push({ pos, g, base: (t - 0.5) * 9 });
    }
    const STG = [{ amp: 0.7, f: 0.45, rz: -0.18 }, { amp: 1.6, f: 0.3, rz: 0.35 }, { amp: 0.35, f: 0.8, rz: -0.6 }];
    const cur = { amp: 0.7, f: 0.45, rz: -0.18 }, mw = new THREE.Vector3(), ml = new THREE.Vector3();
    let strength = 0;
    return {
      update() {
        const s = STG[st.stage % 3];
        for (const k in cur) cur[k] = lerp(cur[k], s[k], 0.03);
        group.rotation.z = cur.rz + st.mouse.x * 0.12; group.rotation.x = -st.mouse.y * 0.25;
        group.updateMatrixWorld();
        pointerWorld(st, mw); ml.copy(mw); group.worldToLocal(ml);
        strength = lerp(strength, st.target.lengthSq() > 0 ? 1 : 0, 0.06);
        objs.forEach((o, i) => {
          for (let j = 0; j < P; j++) {
            const x = (j / (P - 1) - 0.5) * 20;
            let y = o.base + Math.sin(x * cur.f + st.t * 0.6 + i * 0.09) * cur.amp + Math.sin(x * 0.17 - st.t * 0.3) * 0.6;
            const dx = x - ml.x, dy = y - ml.y;
            y += Math.sign(dy || 1) * Math.exp(-(dx * dx + dy * dy) * 0.22) * 1.7 * strength;
            o.pos[j * 3] = x; o.pos[j * 3 + 1] = y; o.pos[j * 3 + 2] = Math.cos(x * 0.3 + i * 0.07 + st.t * 0.4) * 1.2;
          }
          o.g.attributes.position.needsUpdate = true;
        });
      }
    };
  }

  const FX = { ribbon, particles, network, photoDepth, glass, wave, lines };

  const clock = new THREE.Clock();
  (function loop() {
    requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.05);
    for (const st of demos) {
      if (!st.visible || !st.enabled) continue;
      st.t += dt; st.mouse.lerp(st.target, 0.07);
      st.api.update(dt);
      st.renderer.render(st.scene, st.camera);
    }
  })();

  window.InsupFX = { mount, FX };
})();
