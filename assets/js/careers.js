/* Insup — careers.html page script.
   D3 background: glossy 3D speech bubbles on the fixed #bg host — the page's only WebGL context.
   Same look and stages 0/1/2 as InsupFX 'glass' (fx.js, untouched), plus extra arrangements that slides can ask for
   with data-stage:
     3 = 「社員紹介」(P3 吹き出しで話す): small bubbles kept in the corners, clear of the chat (layout from v5parts/staff.html P3)
     4 = 「募集ポジション」: bubbles peek from the edges, clear of the heading and the three cards
   Default stage = the slide's data-stage, else index % 3 (InsupSite.stageOf). */
(() => {
  'use strict';
  if (!window.InsupSite) return;
  if (!window.THREE || !window.InsupFX) { InsupSite.mountBg('glass'); return; }

  const lerp = (a, b, t) => a + (b - a) * t;

  function glassPlus(st) {
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
    /* stages 0-2: world coords [x, y, z, rotX, rotY, rotZ] — identical to fx.js 'glass' */
    const L = [
      [[3.2, 0.9, 0, 0.2, -0.5, 0.1], [4.8, -1.3, -1.5, -0.2, -0.7, -0.1], [0.6, 2.6, -2, 0.4, 0.3, 0.3], [6.2, 2.4, -3, 0.1, 0.8, 0.2], [-1.5, -2.6, -1, 0.3, 0.4, -0.2], [7, -2.8, -2, -0.4, 0.2, 0.4]],
      [[2.6, 0.9, 0.5, 0, -0.25, 0], [4.4, -0.8, -0.2, 0, -0.25, 0], [-4.5, 2.8, -3, 0.5, 0.6, 0.2], [7, 2.6, -4, 0.3, 0.4, 0.1], [-5.5, -2.5, -3, -0.3, 0.5, 0.4], [6.5, -3.0, -3, 0.4, -0.3, 0.2]],
      [[-3.2, 2.2, -2, 0.6, 0.9, 0.4], [3.6, -2.0, -1, -0.5, -0.8, 0.3], [4.5, 2.0, 0, 0.2, -1.2, 0.5], [-5.5, -1.8, -1, 0.8, 0.5, -0.4], [1.0, -3.2, -0.5, -0.2, 0.9, 0.6], [7.2, 0.2, -2, 0.5, -0.5, -0.3]],
    ];
    /* extra stages: screen-relative [x, y (-1..1), z, size, rotX, rotY, rotZ]; pc = landscape, sp = portrait (phones) */
    const N = {
      3: { /* 社員紹介 P3 — from v5parts/staff.html L.P3 */
        pc: [[-0.86, -0.18, 0, 0.42, 0.2, 0.6, -0.1], [0.85, 0.22, -0.5, 0.36, -0.2, -0.6, 0.15], [0.93, -0.30, -1, 0.2, 0.3, -0.3, 0.3], [0.42, 0.76, -1, 0.24, -0.3, 0.4, -0.2], [-0.9, -0.78, -2, 0.16, 0.4, 0.3, 0.25], [0.72, -0.86, -2, 0.12, 0.3, -0.4, 0.2]],
        sp: [[0.62, 0.72, 0, 0.18, 0.2, 0.6, -0.1], [0.88, 0.70, -1, 0.12, -0.2, -0.6, 0.15], [0.94, 0.57, -1, 0.08, 0.3, -0.3, 0.3], [1.4, 0.9, -2, 0.001, 0, 0, 0], [-1.4, 0.9, -2, 0.001, 0, 0, 0], [1.4, -0.9, -2, 0.001, 0, 0, 0]]
      },
      4: { /* 募集ポジション: heading, 「応募方法」 and the three cards stay clear; bubbles peek from the edges */
        pc: [[0.16, 0.66, -1, 0.42, 0.2, -0.5, 0.1], [0.96, -0.12, -1, 0.36, -0.2, -0.7, -0.1], [-0.96, -0.36, -1, 0.28, 0.4, 0.3, 0.3], [0.52, 0.86, -3, 0.2, 0.1, 0.8, 0.2], [-0.46, -0.84, -1, 0.2, 0.3, 0.4, -0.2], [0.56, -0.84, -2, 0.16, -0.4, 0.2, 0.4]],
        sp: [[0.62, 0.74, 0, 0.18, 0.2, -0.5, 0.1], [0.9, 0.66, -1, 0.12, -0.2, -0.7, -0.1], [0.96, 0.56, -1, 0.08, 0.4, 0.3, 0.3], [1.4, 0.9, -2, 0.001, 0, 0, 0], [-1.4, 0.9, -2, 0.001, 0, 0, 0], [1.4, -0.9, -2, 0.001, 0, 0, 0]]
      }
    };
    const tanH = Math.tan(THREE.MathUtils.degToRad(22.5));
    const meshes = defs.map((d, i) => { const m = new THREE.Mesh(d.g, mk(d.c)); m.scale.setScalar(d.s); const l = L[0][i]; m.position.set(l[0], l[1], l[2]); m.rotation.set(l[3], l[4], l[5]); sc.add(m); return m; });
    const target = (i) => { /* -> [x, y, z, rx, ry, rz, scale] for the current stage */
      const ex = N[st.stage];
      if (ex) {
        const l = ex[st.aspect < 1 ? 'sp' : 'pc'][i], hh = tanH * (10 - l[2]);
        return [l[0] * hh * st.aspect, l[1] * hh, l[2], l[4], l[5], l[6], l[3]];
      }
      const l = L[st.stage % 3][i];
      return [l[0], l[1], l[2], l[3], l[4], l[5], defs[i].s];
    };
    return {
      update() {
        const fl = InsupSite.reduced ? 0 : 1;
        meshes.forEach((m, i) => {
          const l = target(i), k = 0.04, depth = 1 + (2 + l[2]) * 0.25;
          m.position.x = lerp(m.position.x, l[0] + st.mouse.x * 0.6 * depth, k);
          m.position.y = lerp(m.position.y, l[1] + st.mouse.y * 0.4 * depth + Math.sin(st.t * 0.8 + i) * 0.12 * fl, k);
          m.position.z = lerp(m.position.z, l[2], k);
          m.rotation.x = lerp(m.rotation.x, l[3] - st.mouse.y * 0.9, k * 1.5);
          m.rotation.y = lerp(m.rotation.y, l[4] + st.mouse.x * 1.1 + Math.sin(st.t * 0.5 + i) * 0.08 * fl, k * 1.5);
          m.rotation.z = lerp(m.rotation.z, l[5], k);
          m.scale.setScalar(Math.max(0.001, lerp(m.scale.x, l[6], k)));
        });
        lc.position.set(st.mouse.x * 7, st.mouse.y * 4.5, 4);
        lb.position.set(-st.mouse.x * 6, -st.mouse.y * 3 - 1, 5);
      }
    };
  }

  InsupSite.mountBg(glassPlus);
})();
