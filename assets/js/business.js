/* =====================================================================
   Insup — business.html page script (D5 「夜の濃紺 × つながる線」)
   - the page's ONLY WebGL context: a custom network on the fixed #bg host
     (ported from v5parts/bizenter.html, decided T1 「つながって広がる」)
   - arrival from the entrance door (sessionStorage 'insup:door' = {x,y} in 0..1):
     an overlay that looks like the entrance (E4) is shown, then glowing nodes burst
     out of the door, connect with lines across the screen while the photo fades,
     and the hero text rises in (T1). Direct visit: the network simply fades in.
   - afterwards the network follows the mouse (nodes pulled toward the cursor, lines
     to the cursor) and changes shape per slide (stage 0 spread / 1 two groups / 2 globe).
   - per-slide placement keeps the dense part of the network off the text side:
     slides listed in PLACE below (or any slide with data-bg="right|left|center") move and
     shrink the shape to one half on wide screens and fade nodes/lines on the text half;
     on narrow / portrait screens (text everywhere) the network is dimmed instead.
   Contract with src/business/hero.html: this script sets html[data-arrival="door"|"direct"],
   dispatches  document 'insup:hero'  when the hero text should appear during T1 and adds
   html.t1-done when the arrival is over.
   ===================================================================== */
(() => {
  'use strict';
  const IS = window.InsupSite;
  if (!IS) return;
  const doc = document, root = doc.documentElement;
  const reduced = !!IS.reduced;

  /* ---------- entrance-door handoff ---------- */
  let door = null;
  try { door = JSON.parse(sessionStorage.getItem('insup:door') || 'null'); sessionStorage.removeItem('insup:door'); } catch (_) { door = null; }
  if (!door || !isFinite(door.x) || !isFinite(door.y)) door = null;
  const T1 = !!door && !reduced; /* reduced motion: no transition, final state at once */
  root.dataset.arrival = T1 ? 'door' : 'direct';

  /* ---------- easing helpers (from bizenter) ---------- */
  const cl = x => x < 0 ? 0 : x > 1 ? 1 : x;
  const sm = (a, b, x) => { x = cl((x - a) / (b - a)); return x * x * (3 - 2 * x); };
  const eo3 = x => 1 - Math.pow(1 - x, 3);
  const lerp = (a, b, t) => a + (b - a) * t;

  const HERO_AT = 1.8, DUR = 3.0; /* T1 timings (seconds) */
  /* shared timeline state (read by the WebGL effect) */
  const S = { phase: T1 ? 'ent' : 'done', t: 0, start: 0, doorNdc: [door ? door.x * 2 - 1 : 0, door ? -(door.y * 2 - 1) : -0.7], snapHome: false, stage: 0, place: null };

  /* ---------- per-slide placement of the network ----------
     side: 1 = shape on the right half (text on the left), -1 = left half, 0 = centred
     x: centre offset (fraction of the half screen width), k: shape scale, fade: how much nodes/lines
     on the text half are faded (wide screens); dim / kp: brightness and scale on narrow screens. */
  const NONE = { side: 0, x: 0, k: 1, fade: 0, dim: 1, kp: 1 };
  const SIDE = { side: 1, x: 0.45, k: 0.8, fade: 0.72, dim: 0.42, kp: 0.92 };
  const PLACE = { remote: SIDE }; /* フルリモート: text column left, photo right */
  function placeOf(el) {
    const v = el && el.dataset ? (el.dataset.bg || '') : '';
    if (v === 'right') return SIDE;
    if (v === 'left') return Object.assign({}, SIDE, { side: -1 });
    if (v === 'center') return NONE;
    return PLACE[IS.keyOf(el)] || NONE;
  }
  S.place = NONE;

  /* ================= custom network effect (based on fx.js network + bizenter T1) ================= */
  function netFX(st) {
    const N = 150, MAXL = 2600, TAN = Math.tan(22.5 * Math.PI / 180), CZ = 10, BASE = 0.17;
    const ICE = [0x75 / 255, 0xf2 / 255, 1], BLUE = [0x19 / 255, 0x76 / 255, 0xf6 / 255], SKY = [0x4d / 255, 0xb3 / 255, 1];
    const G = new THREE.Group(); st.scene.add(G);
    const pos = new Float32Array((N + 1) * 3), size = new Float32Array(N + 1), alpha = new Float32Array(N + 1), hot = new Float32Array(N + 1);
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); pg.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    pg.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1)); pg.setAttribute('aHot', new THREE.BufferAttribute(hot, 1));
    /* additive light with valid premultiplied output (rgb <= alpha), so every browser composites it the same way */
    const ADD = { transparent: true, depthWrite: false, depthTest: false, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor };
    const pm = new THREE.ShaderMaterial({
      ...ADD,
      uniforms: { uScale: { value: 300 }, uCap: { value: 70 }, cA: { value: new THREE.Color('#75f2ff') } },
      vertexShader: `attribute float aSize, aAlpha, aHot; uniform float uScale, uCap; varying float vA, vH;
        void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); vA = aAlpha; vH = aHot;
          gl_PointSize = (aAlpha < 0.002 || mv.z > -0.3) ? 0.0 : min(aSize*uScale/(-mv.z), uCap);
          gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `uniform vec3 cA; varying float vA, vH;
        void main(){ float d = length(gl_PointCoord-0.5); if(d>0.5) discard;
          float a = smoothstep(0.5,0.0,d); float core = smoothstep(0.2,0.04,d);
          vec3 col = mix(cA, vec3(1.0), clamp(vH*0.85 + core*0.45, 0.0, 1.0));
          float A = clamp(vA*(a*a*1.1 + core*0.75), 0.0, 1.0);
          gl_FragColor = vec4(col*A, A); }`
    });
    const pts = new THREE.Points(pg, pm); pts.frustumCulled = false; pts.renderOrder = 2;
    const lpos = new Float32Array(MAXL * 6), lcol = new Float32Array(MAXL * 6), lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(lpos, 3)); lg.setAttribute('aCol', new THREE.BufferAttribute(lcol, 3));
    const lm = new THREE.ShaderMaterial({
      ...ADD,
      vertexShader: `attribute vec3 aCol; varying vec3 vC;
        void main(){ vC = aCol; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `varying vec3 vC;
        void main(){ vec3 c = clamp(vC, 0.0, 1.0); gl_FragColor = vec4(c, max(c.r, max(c.g, c.b))); }`
    });
    const lines = new THREE.LineSegments(lg, lm);
    lines.frustumCulled = false; lines.renderOrder = 1;
    G.add(lines); G.add(pts);

    /* per node: random seeds; H* = stage 0 (spread over the screen), K* = stage 1 (two groups),
       S* = stage 2 (even points on a globe, unit radius) */
    const U = [], V = [], W = [], OFF = [], RND = [], DX = [], DY = [], DZ = [], RR = [];
    const HX = new Float32Array(N), HY = new Float32Array(N), HZ = new Float32Array(N);
    const KX = new Float32Array(N), KY = new Float32Array(N), KZ = new Float32Array(N);
    const SX = new Float32Array(N), SY = new Float32Array(N), SZ = new Float32Array(N);
    const PX = new Float32Array(N), PY = new Float32Array(N), PZ = new Float32Array(N), LV = new Float32Array(N);
    let pX = 0, pK = 1, pF = 0, pD = 1, pS = 0; /* current placement (eased toward S.place) */
    for (let i = 0; i < N; i++) {
      U.push(Math.random() * 2 - 1); V.push(Math.random() * 2 - 1); W.push(Math.random() * 2 - 1); OFF.push(Math.random() * 10); RND.push(Math.random());
      const a = Math.random() * Math.PI * 2, b = Math.acos(2 * Math.random() - 1);
      DX.push(Math.sin(b) * Math.cos(a)); DY.push(Math.sin(b) * Math.sin(a)); DZ.push(Math.cos(b)); RR.push(0.35 + 0.65 * Math.cbrt(Math.random()));
    }
    let halfH = TAN * CZ, halfW = halfH * 1.6, nAct = N, ox = 0, oy = 0, oz = 0, maxD = 1, lastStart = -1;
    let rS = 3, Rb = 1.9, Rcur = 1.9, spin = 0;
    function layout() {
      halfW = halfH * st.aspect;
      nAct = Math.round(Math.min(N, Math.max(72, N * st.aspect / 1.78)));
      /* line reach follows how crowded the screen is (phones: shorter lines, so it never turns into a solid ball) */
      const apn = (2 * halfW * 1.04) * (2 * halfH * 0.96) / nAct;
      Rb = 1.9 * Math.max(0.62, Math.min(1.05, Math.sqrt(apn / 0.81)));
      rS = Math.min(halfW * 0.86, halfH * 0.78);
      const land = st.aspect >= 1;
      const kr = land ? Math.min(halfH * 0.62, halfW * 0.34) : Math.min(halfW * 0.86, halfH * 0.36);
      for (let i = 0; i < N; i++) {
        HX[i] = U[i] * halfW * 1.04; HY[i] = V[i] * halfH * 0.96; HZ[i] = W[i] * 2.2;
        const n = i < nAct ? nAct : N, y = 1 - ((i < nAct ? i : i - nAct) + 0.5) / n * 2, r = Math.sqrt(1 - y * y), th = i * 2.399963; // even points on a sphere
        SX[i] = Math.cos(th) * r; SY[i] = y; SZ[i] = Math.sin(th) * r;
        const side = i % 2 ? 1 : -1, cx = land ? side * halfW * 0.5 : 0, cy = land ? 0 : side * halfH * 0.48;
        KX[i] = cx + DX[i] * kr * RR[i]; KY[i] = cy + DY[i] * kr * RR[i]; KZ[i] = DZ[i] * kr * RR[i] * 0.8;
      }
    }
    layout();
    for (let i = 0; i < N; i++) { PX[i] = HX[i]; PY[i] = HY[i]; PZ[i] = HZ[i]; }

    const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), mw = new THREE.Vector3(), ml = new THREE.Vector3(), nv = new THREE.Vector2();
    const toLocal = (ndcX, ndcY, out) => { nv.set(ndcX, ndcY); ray.setFromCamera(nv, st.camera); ray.ray.intersectPlane(plane, out); G.worldToLocal(out); return out; };
    function onStart() { /* T1 begins: the burst origin is the door */
      G.rotation.set(0, 0, 0); G.updateMatrixWorld();
      toLocal(S.doorNdc[0], S.doorNdc[1], mw); ox = mw.x; oy = mw.y; oz = 0;
      maxD = 0.1;
      for (let i = 0; i < nAct; i++) maxD = Math.max(maxD, Math.hypot(HX[i] - ox, HY[i] - oy, HZ[i] - oz));
    }

    let k = 0;
    const seg = (ax, ay, az, bx, by, bz, ca, cb) => {
      if (k >= MAXL) return; const o = k * 6;
      lpos[o] = ax; lpos[o + 1] = ay; lpos[o + 2] = az; lpos[o + 3] = bx; lpos[o + 4] = by; lpos[o + 5] = bz;
      lcol[o] = ca[0]; lcol[o + 1] = ca[1]; lcol[o + 2] = ca[2]; lcol[o + 3] = cb[0]; lcol[o + 4] = cb[1]; lcol[o + 5] = cb[2]; k++;
    };
    const cA = [0, 0, 0], cB = [0, 0, 0];
    const mul = (out, c, f) => { out[0] = c[0] * f; out[1] = c[1] * f; out[2] = c[2] * f; return out; };

    return {
      resize() { layout(); },
      next(stage) { S.stage = ((stage | 0) % 3 + 3) % 3; },
      update(dt) {
        if (S.start !== lastStart) { lastStart = S.start; if (S.phase === 'play') onStart(); }
        const ph = S.phase, t = S.t, playing = ph === 'play';
        pm.uniforms.uScale.value = st.renderer.domElement.height / 2;
        pm.uniforms.uCap.value = 72 * st.renderer.getPixelRatio();
        const rk = playing ? 0 : 1;
        G.rotation.y = lerp(G.rotation.y, st.mouse.x * 0.32 * rk, 0.05);
        G.rotation.x = lerp(G.rotation.x, -st.mouse.y * 0.22 * rk, 0.05);
        G.updateMatrixWorld();
        mw.set(99, 99, 0);
        if (ph === 'done') { ray.setFromCamera(st.mouse, st.camera); ray.ray.intersectPlane(plane, mw); }
        ml.copy(mw); G.worldToLocal(ml);
        const active = ph === 'done' && st.target.lengthSq() > 0;
        const wobA = IS.reduced ? 0 : 0.25, homeK = S.snapHome ? 1 : 1 - Math.exp(-dt * 1.8); // frame-rate independent settle
        S.snapHome = false;
        const stg = ph === 'done' ? S.stage : 0;
        if (stg === 2 && !IS.reduced) spin += dt * 0.12;
        const cs = Math.cos(spin), sn = Math.sin(spin);
        /* placement: wide screens move the shape to the free half, narrow screens dim it */
        const P = ph === 'done' && S.place ? S.place : NONE, wide = st.aspect >= 1.15;
        const tK = wide ? P.k : P.kp;
        pX = lerp(pX, wide ? P.side * P.x * halfW : 0, homeK); pK = lerp(pK, tK, homeK);
        pF = lerp(pF, wide ? P.fade : 0, homeK); pD = lerp(pD, wide ? 1 : P.dim, homeK);
        if (P.side) pS = P.side;
        const Rt = stg === 2 ? Math.min(Rb, rS * tK * 0.62) : stg === 1 ? Rb * 0.9 : Rb;
        Rcur = playing || ph === 'ent' ? Rb : lerp(Rcur, Rt, homeK);
        const R = Rcur;
        k = 0;
        let hubS = 0, hubA = 0;

        for (let i = 0; i < N; i++) {
          const act = i < nAct;
          const wx = Math.sin(st.t * 0.5 + OFF[i]) * wobA, wy = Math.cos(st.t * 0.4 + OFF[i]) * wobA;
          let tx, ty, tz;
          if (stg === 1) { tx = KX[i]; ty = KY[i]; tz = KZ[i]; }
          else if (stg === 2) { const x = SX[i] * rS, z = SZ[i] * rS; tx = x * cs - z * sn; ty = SY[i] * rS; tz = x * sn + z * cs; }
          else { tx = HX[i]; ty = HY[i]; tz = HZ[i]; }
          if (ph === 'done') { tx = tx * pK + pX; ty *= pK; tz *= pK; }
          const gx = tx + wx, gy = ty + wy, gz = tz;
          let a = 0, s = BASE, h = 0, lv = 0;
          if (ph === 'ent') { PX[i] = HX[i]; PY[i] = HY[i]; PZ[i] = HZ[i]; }
          else if (ph === 'done') {
            PX[i] = lerp(PX[i], gx, homeK); PY[i] = lerp(PY[i], gy, homeK); PZ[i] = lerp(PZ[i], gz, homeK);
            if (active) {
              const dx = ml.x - PX[i], dy = ml.y - PY[i], dz = ml.z - PZ[i], d = Math.hypot(dx, dy, dz);
              if (d < 3.2) { const f = 0.04 * (1 - d / 3.2); PX[i] += dx * f; PY[i] += dy * f; PZ[i] += dz * f; }
            }
            /* fade on the text half (pS = which side the shape sits on) and overall dim */
            const mk = (1 - pF * (1 - sm(-0.12, 0.3, pS * PX[i] / halfW))) * pD;
            a = act ? 0.95 * mk : 0; lv = act ? mk : 0;
          } else { /* T1: nodes fly out of the door one after another, trailing a light line back to it */
            const di = 0.12 + Math.hypot(HX[i] - ox, HY[i] - oy, HZ[i] - oz) / maxD * 1.0 + RND[i] * 0.22;
            const q = cl((t - di) / 0.9), p = eo3(q);
            PX[i] = ox + (gx - ox) * p; PY[i] = oy + (gy - oy) * p; PZ[i] = oz + (gz - oz) * p;
            a = act ? cl(q * 5) * 0.95 : 0; s = BASE * (1 + 2.4 * Math.sin(Math.PI * q)); h = 1 - p; lv = act ? sm(0.55, 1, q) : 0;
            if (act && q > 0 && q < 1) seg(ox, oy, oz, PX[i], PY[i], PZ[i], mul(cA, ICE, 0.05 * (1 - q)), mul(cB, ICE, 0.6 * (1 - q)));
          }
          pos[i * 3] = PX[i]; pos[i * 3 + 1] = PY[i]; pos[i * 3 + 2] = PZ[i];
          size[i] = s; alpha[i] = a; hot[i] = h; LV[i] = lv;
        }
        /* hub glow on the door at the start of T1 */
        if (playing) { hubS = 1.15 * sm(0, 0.12, t) * (1 - sm(0.45, 1.4, t)); hubA = 1; }
        pos[N * 3] = ox; pos[N * 3 + 1] = oy; pos[N * 3 + 2] = oz; size[N] = hubS; alpha[N] = hubS > 0.01 ? hubA : 0; hot[N] = 1;

        /* network lines (+ lines to the cursor) */
        for (let i = 0; i < nAct && k < MAXL; i++) {
          if (LV[i] <= 0.01) continue;
          const ax = PX[i], ay = PY[i], az = PZ[i];
          if (active) {
            const d = Math.hypot(ax - ml.x, ay - ml.y, az - ml.z);
            if (d < 3.0) { const f = 1 - d / 3.0; seg(ax, ay, az, ml.x, ml.y, ml.z, mul(cA, ICE, f), mul(cB, ICE, f)); }
          }
          for (let j = i + 1; j < nAct && k < MAXL; j++) {
            if (LV[j] <= 0.01) continue;
            const bx = PX[j], by = PY[j], bz = PZ[j], d = Math.hypot(ax - bx, ay - by, az - bz);
            if (d >= R) continue;
            const s = (1 - d / R) * 0.8, f = s * Math.min(LV[i], LV[j]);
            cA[0] = lerp(BLUE[0], SKY[0], s) * f; cA[1] = lerp(BLUE[1], SKY[1], s) * f; cA[2] = lerp(BLUE[2], SKY[2], s) * f;
            seg(ax, ay, az, bx, by, bz, cA, cA);
          }
        }
        lg.setDrawRange(0, k * 2);
        lg.attributes.position.needsUpdate = true; lg.attributes.aCol.needsUpdate = true;
        ['position', 'aSize', 'aAlpha', 'aHot'].forEach(n => pg.attributes[n].needsUpdate = true);
      }
    };
  }

  /* ================= mount the background (one WebGL context) ================= */
  const bgHost = doc.getElementById('bg');
  if (T1 && bgHost) bgHost.style.transition = 'none'; /* the burst must be visible from the first frame */
  let st = null;
  try { st = IS.mountBg(s => netFX(s), { onStage: (_st, _stage, el) => { S.place = placeOf(el); } }); } catch (e) { console.warn('business: 3D background unavailable', e); }
  if (T1 && bgHost) { bgHost.classList.add('is-ready'); setTimeout(() => { bgHost.style.transition = ''; }, 100); }

  const heroNow = () => { if (!root.classList.contains('hero-cued')) { root.classList.add('hero-cued'); doc.dispatchEvent(new Event('insup:hero')); } };
  if (!T1) { root.classList.add('t1-done'); return; }

  /* ================= T1 arrival: entrance look-alike overlay + DOM timeline ================= */
  const CSS = `
  html.t1-on .site-hd,html.t1-on .dots,html.t1-on .tabbar{opacity:0;visibility:hidden}
  html.t1-reveal .site-hd,html.t1-reveal .dots,html.t1-reveal .tabbar{animation:t1-in .9s ease both}
  @keyframes t1-in{from{opacity:0}to{opacity:1}}
  .t1-back{position:fixed;inset:0;z-index:0;overflow:hidden;background:#dfe8f4;pointer-events:none;will-change:opacity}
  .t1-back .t1-pan{position:absolute;inset:-4%}
  .t1-back .t1-photo{position:absolute;inset:0;background:url(assets/img/reception.jpg) 44% 50%/cover no-repeat;filter:brightness(1.24) saturate(1.04) contrast(1.02)}
  .t1-back .t1-lay{position:absolute;inset:0}
  .t1-back .t1-leak{background:radial-gradient(55% 65% at 100% 0%,rgba(255,255,255,.78) 0%,rgba(235,250,255,.38) 32%,rgba(117,242,255,.08) 55%,rgba(255,255,255,0) 72%),radial-gradient(45% 40% at 0% 100%,rgba(235,244,255,.35),rgba(235,244,255,0) 70%)}
  .t1-back .t1-shade{background:linear-gradient(180deg,rgba(255,255,255,0) 58%,rgba(244,250,255,.6) 84%,rgba(244,250,255,.85) 100%)}
  .t1-ui{position:fixed;inset:0;z-index:70;pointer-events:none;display:flex;flex-direction:column;color:#fff;font-family:var(--font-ja);line-height:1.7;
    padding:clamp(16px,2.6vw,32px) clamp(16px,3.2vw,44px) calc(clamp(14px,2.2vw,26px) + env(safe-area-inset-bottom,0px));will-change:opacity}
  .t1-ui p{margin:0}
  .t1-ui .t1-bar{display:flex;align-items:center;justify-content:space-between}
  .t1-ui .t1-plate{display:inline-flex;align-items:center;gap:7px;background:#fff;padding:6px 14px 6px 9px;border-radius:12px;box-shadow:0 4px 16px rgba(11,45,107,.14);line-height:0}
  .t1-ui .t1-plate img{height:26px;width:auto}
  .t1-ui .t1-plate img.type{height:16px}
  .t1-ui .t1-entry{margin-top:auto}
  .t1-ui .t1-tag{font:600 12px var(--font-en);letter-spacing:.3em;color:#0b2d6b;text-shadow:0 0 10px rgba(255,255,255,.95),0 0 2px rgba(255,255,255,.9)}
  .t1-ui .t1-msg{font-size:clamp(14px,1.5vw,18px);margin:4px 0 16px;color:#0b1d40;font-weight:700;text-shadow:0 0 14px rgba(255,255,255,.95),0 0 3px rgba(255,255,255,.95)}
  .t1-ui .t1-doors{display:grid;grid-template-columns:1fr 1fr;gap:14px;max-width:820px}
  .t1-ui .t1-door{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:16px 22px;border-radius:16px;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);transition:transform .25s,box-shadow .25s}
  .t1-ui .t1-door small{display:block;font:600 11px var(--font-en);letter-spacing:.25em;opacity:.85}
  .t1-ui .t1-door b{font-size:clamp(15px,1.6vw,19px)}
  .t1-ui .t1-door .arr{font:600 19px var(--font-en)}
  .t1-ui .t1-door.biz{background:linear-gradient(100deg,#1976f6,#4db3ff);color:#fff;box-shadow:0 8px 22px rgba(25,118,246,.26)}
  .t1-ui .t1-door.biz.press{transform:scale(.97);box-shadow:0 0 0 3px rgba(117,242,255,.75),0 0 34px rgba(77,179,255,.95)}
  .t1-ui .t1-door.car{background:rgba(255,255,255,.95);color:#0b2d6b;box-shadow:0 8px 22px rgba(11,45,107,.12);border:1px solid rgba(11,45,107,.08)}
  .t1-ui .t1-door.car small{color:#1976f6;opacity:1}
  .t1-ui .t1-fine{display:flex;flex-wrap:wrap;gap:4px 16px;align-items:center;margin:14px 0 0;font-size:12px;color:#3e4f70}
  .t1-ui .t1-fine small{font:500 11.5px var(--font-en)}
  .t1-ui .t1-fine span{color:#0b2d6b;text-decoration:underline;text-underline-offset:3px}
  @media (max-width:700px){
    .t1-ui .t1-doors{grid-template-columns:1fr;gap:10px}
    .t1-ui .t1-msg{display:none}
    .t1-ui .t1-tag{margin-bottom:10px}
    .t1-ui .t1-door{padding:13px 18px}
    .t1-ui .t1-plate{padding:5px 11px 5px 7px}.t1-ui .t1-plate img{height:22px}.t1-ui .t1-plate img.type{height:13px}
  }`;
  const style = doc.createElement('style');
  style.textContent = CSS;
  doc.head.appendChild(style);

  const back = doc.createElement('div');
  back.className = 't1-back'; back.setAttribute('aria-hidden', 'true');
  back.innerHTML = '<div class="t1-pan"><div class="t1-photo"></div></div><div class="t1-lay t1-leak"></div><div class="t1-lay t1-shade"></div>';
  const ui = doc.createElement('div');
  ui.className = 't1-ui'; ui.setAttribute('aria-hidden', 'true');
  ui.innerHTML = '<div class="t1-bar"><span class="t1-plate"><img src="assets/img/logo-mark.png" alt="" width="658" height="660"><img class="type" src="assets/img/logo-type.png" alt="" width="977" height="368"></span></div>' +
    '<div class="t1-entry"><p class="t1-tag">WELCOME TO INSUP</p><p class="t1-msg">テレアポBPOを軸に、インサイドセールス支援を行う企業です。</p>' +
    '<div class="t1-doors"><span class="t1-door biz press"><span><small>FOR BUSINESS</small><b>導入をご検討の企業様</b></span><span class="arr">→</span></span>' +
    '<span class="t1-door car"><span><small>FOR CAREERS</small><b>一緒に働きたい方</b></span><span class="arr">→</span></span></div>' +
    '<p class="t1-fine"><small>© 2025 Insup All Rights Reserved.</small><span>プライバシーポリシー</span></p></div>';
  root.classList.add('t1-on');
  if (bgHost) bgHost.parentNode.insertBefore(back, bgHost); else doc.body.insertBefore(back, doc.body.firstChild);
  doc.body.appendChild(ui);
  const doorEl = ui.querySelector('.t1-door.biz');

  let t0 = 0, raf = 0, revealed = false, over = false;
  function applyDom() {
    const t = S.t;
    doorEl.classList.toggle('press', t < 0.35);
    back.style.opacity = (1 - sm(0.35, 1.7, t)).toFixed(3);
    ui.style.opacity = (1 - sm(0.05, 0.45, t)).toFixed(3);
    if (t >= HERO_AT && !revealed) {
      revealed = true;
      root.classList.remove('t1-on'); root.classList.add('t1-reveal');
      heroNow();
    }
  }
  function finish(late) {
    if (over) return; over = true;
    cancelAnimationFrame(raf);
    S.phase = 'done'; S.start++; S.snapHome = !!late; /* late = the tab was hidden mid-transition: nodes straight home */
    if (!revealed) { revealed = true; root.classList.remove('t1-on'); root.classList.add('t1-reveal'); heroNow(); }
    back.remove(); ui.remove();
    root.classList.add('t1-done');
    setTimeout(() => { root.classList.remove('t1-reveal'); style.remove(); }, 1200);
  }
  function tick() {
    if (over) return;
    S.t = Math.max(0, (performance.now() - t0) / 1000);
    if (S.t >= DUR) finish(S.t > DUR + 0.25); else { applyDom(); raf = requestAnimationFrame(tick); }
  }
  function begin() {
    if (over || S.phase === 'play') return;
    /* burst origin = the door as drawn by the overlay (same layout as the entrance) */
    const r = doorEl.getBoundingClientRect(), w = window.innerWidth || 1, h = window.innerHeight || 1;
    if (r.width && r.height) S.doorNdc = [(r.left + r.width / 2) / w * 2 - 1, -((r.top + r.height / 2) / h * 2 - 1)];
    if (!st) { /* no WebGL: still fade the entrance away and show the page */ }
    S.phase = 'play'; S.t = 0; S.start++; t0 = performance.now();
    applyDom(); raf = requestAnimationFrame(tick);
  }
  /* start once the entrance photo is ready (normally cached from the entrance page), after a short beat */
  let started = false;
  const go = () => { if (started) return; started = true; requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(begin, 220))); };
  const img = new Image();
  img.onload = img.onerror = go;
  img.src = 'assets/img/reception.jpg';
  if (img.complete) go();
  setTimeout(go, 900);
  /* safety: never leave the overlay up */
  setTimeout(() => { if (!over && S.phase !== 'play') begin(); }, 2500);
})();
