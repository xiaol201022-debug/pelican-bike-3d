// Red scarf: a wrap around the neck plus two cloth tails simulated with Verlet integration.
// Forces: gravity, aerodynamic drag toward apparent wind (rider speed + gusts), flutter waves.
// Constraints: structural, shear and bending springs; collisions with body/neck spheres and the ground.
(function (PB) {
  const { canvasTex, noise1, clamp } = PB.U;
  const V3 = THREE.Vector3;

  PB.createScarf = function (scene, rider) {
    const S = { tails: [] };
    const { pivot, curve } = rider.neckAnchor;

    const tex = canvasTex(64, 256, (g, w, h) => {
      g.fillStyle = '#d8231f'; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(120,0,10,.45)'; for (let y = 10; y < h - 30; y += 34) g.fillRect(0, y, w, 7);
      g.fillStyle = 'rgba(255,210,120,.55)'; for (let y = 26; y < h - 30; y += 68) g.fillRect(0, y, w, 3);
      // fringe at the end: alternating transparent strands
      g.clearRect(0, h - 22, w, 22);
      g.fillStyle = '#d8231f'; for (let x = 2; x < w; x += 7) g.fillRect(x, h - 22, 4, 22);
    }, false);
    tex.wrapS = THREE.ClampToEdgeWrapping; tex.wrapT = THREE.ClampToEdgeWrapping;
    const clothMat = new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.85, alphaTest: 0.5 });

    // the wrap: a torus around the neck, aligned to the neck tangent
    const u = 0.32;
    const wrapPos = curve.getPointAt(u), tan = curve.getTangentAt(u);
    for (let i = 0; i < 2; i++) {
      const wrap = new THREE.Mesh(new THREE.TorusGeometry(0.088 - i * 0.004, 0.032, 10, 24), clothMat);
      wrap.position.copy(wrapPos).addScaledVector(tan, i * 0.045);
      wrap.quaternion.setFromUnitVectors(new V3(0, 0, 1), tan);
      wrap.castShadow = true;
      pivot.add(wrap);
    }
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), clothMat);
    knot.position.copy(wrapPos).add(new V3(0.02, 0.0, 0.085)); pivot.add(knot);

    function makeTail(W, H, dx, sp, len) {
      const t = { W, H, n: W * H, p: [], q: [], cons: [], anchors: [] };
      for (let c = 0; c < W; c++) t.anchors.push(wrapPos.clone().add(new V3(dx + (c - (W - 1) / 2) * sp, -0.02, 0.09)));
      for (let i = 0; i < t.n; i++) { t.p.push(new V3()); t.q.push(new V3()); }
      const id = (r, c) => r * W + c;
      const add = (a, b, k, rest) => t.cons.push([a, b, rest, k]);
      for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
        if (c < W - 1) add(id(r, c), id(r, c + 1), 1, sp);
        if (r < H - 1) add(id(r, c), id(r + 1, c), 1, len);
        if (r < H - 1 && c < W - 1) { const dg = Math.hypot(sp, len); add(id(r, c), id(r + 1, c + 1), 0.6, dg); add(id(r, c + 1), id(r + 1, c), 0.6, dg); }
        if (r < H - 2) add(id(r, c), id(r + 2, c), 0.15, len * 2);
      }
      // geometry
      const pos = new Float32Array(t.n * 3), uv = new Float32Array(t.n * 2), idx = [];
      for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) { uv[id(r, c) * 2] = c / (W - 1); uv[id(r, c) * 2 + 1] = 1 - r / (H - 1); }
      for (let r = 0; r < H - 1; r++) for (let c = 0; c < W - 1; c++) idx.push(id(r, c), id(r + 1, c), id(r, c + 1), id(r, c + 1), id(r + 1, c), id(r + 1, c + 1));
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.setIndex(idx);
      t.geo = geo;
      t.mesh = new THREE.Mesh(geo, clothMat);
      t.mesh.castShadow = true; t.mesh.frustumCulled = false;
      scene.add(t.mesh);
      t.len = len; t.phase = Math.random() * 10;
      return t;
    }
    S.tails.push(makeTail(3, 15, -0.025, 0.05, 0.068));
    S.tails.push(makeTail(3, 12, 0.03, 0.045, 0.066));

    const tmp = new V3(), wind = new V3(), vel = new V3(), acc = new V3(), d = new V3();
    const spheres = [{ c: new V3(), r: 0.33 }, { c: new V3(), r: 0.1 }, { c: new V3(), r: 0.09 }];
    let inited = false;

    function anchorWorld(t, c, out) { return pivot.localToWorld(out.copy(t.anchors[c])); }

    function reset() {
      rider.root.updateMatrixWorld(true);
      for (const t of S.tails) for (let r = 0; r < t.H; r++) for (let c = 0; c < t.W; c++) {
        const i = r * t.W + c;
        anchorWorld(t, c, t.p[i]); t.p[i].y -= r * t.len * 0.5; t.p[i].z += r * t.len * 0.85;
        t.q[i].copy(t.p[i]);
      }
      inited = true;
    }

    S.update = function (dt, speed, time, lateralVel) {
      if (!inited || !isFinite(S.tails[0].p[S.tails[0].n - 1].x)) reset();
      if (!(dt > 1e-4)) return;
      dt = Math.min(dt, 1 / 30);
      const sub = 3, h = dt / sub;
      // collision spheres follow the bird
      rider.bird.localToWorld(spheres[0].c.set(0, 1.16, 0.14));
      pivot.localToWorld(spheres[1].c.copy(curve.getPointAt(0.55)));
      pivot.localToWorld(spheres[2].c.copy(curve.getPointAt(0.1)));
      const gust = 1 + 0.35 * noise1(time * 0.9) + 0.15 * noise1(time * 3.1 + 5);
      for (const t of S.tails) {
        for (let s = 0; s < sub; s++) {
          const tt = time + s * h;
          for (let r = 0; r < t.H; r++) {
            const k = r / (t.H - 1);
            for (let c = 0; c < t.W; c++) {
              const i = r * t.W + c, p = t.p[i], q = t.q[i];
              if (r === 0) { anchorWorld(t, c, p); q.copy(p); continue; }
              vel.subVectors(p, q).divideScalar(h);
              // apparent wind (world slides toward +Z at rider speed)
              const fl = Math.sin(tt * (7 + speed * 0.9) - r * 0.85 + t.phase) * (0.6 + speed * 0.32) * k;
              wind.set(-lateralVel + fl * 0.55 + noise1(tt * 2 + r * 0.3 + t.phase) * 0.6, fl * 0.8 + 0.4 * noise1(tt * 1.7 + t.phase), speed * gust + 0.6);
              acc.subVectors(wind, vel).multiplyScalar(3.2);
              acc.y -= 9.8;
              tmp.copy(p);
              p.addScaledVector(vel, h * 0.985).addScaledVector(acc, h * h);
              q.copy(tmp);
            }
          }
          for (let it = 0; it < 6; it++) {
            for (const [a, b, rest, kk] of t.cons) {
              const pa = t.p[a], pb = t.p[b];
              d.subVectors(pb, pa);
              const len = d.length() || 1e-6;
              const diff = (len - rest) / len * kk;
              const pinA = a < t.W, pinB = b < t.W;
              if (pinA && pinB) continue;
              if (pinA) pb.addScaledVector(d, -diff);
              else if (pinB) pa.addScaledVector(d, diff);
              else { pa.addScaledVector(d, diff * 0.5); pb.addScaledVector(d, -diff * 0.5); }
            }
            for (let i = t.W; i < t.n; i++) {
              const p = t.p[i];
              for (const sp of spheres) {
                d.subVectors(p, sp.c); const l = d.length();
                if (l < sp.r) p.addScaledVector(d, (sp.r - l) / (l || 1e-6));
              }
              if (p.y < 0.03) p.y = 0.03;
            }
          }
        }
        const arr = t.geo.attributes.position.array;
        for (let i = 0; i < t.n; i++) { arr[i * 3] = t.p[i].x; arr[i * 3 + 1] = t.p[i].y; arr[i * 3 + 2] = t.p[i].z; }
        t.geo.attributes.position.needsUpdate = true;
        t.geo.computeVertexNormals();
        t.geo.computeBoundingSphere();
      }
    };
    S.reset = reset;
    return S;
  };
})(window.PB);
