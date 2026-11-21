// Fish & crabs: pooled meshes, spawn patterns, catch / bump detection, and a particle system for splashes.
(function (PB) {
  const { rand, pick, clamp, glowTexture } = PB.U;
  const LANES = PB.C.LANES;
  const LOW_Y = 1.78, HIGH_Y = 2.95;

  PB.createFish = function (scene) {
    const F = { fish: [], crabs: [], handlers: {} };
    const reflective = [];
    // ---------- fish meshes ----------
    const silver = new THREE.MeshStandardMaterial({ color: 0x9fc3d8, metalness: 0.7, roughness: 0.28, emissive: 0x1ad0ff, emissiveIntensity: 0, envMapIntensity: 1.3 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xffc43a, metalness: 1, roughness: 0.2, emissive: 0xff9a00, emissiveIntensity: 0.35, envMapIntensity: 1.6 });
    const finMat = new THREE.MeshStandardMaterial({ color: 0x4a7fa0, side: THREE.DoubleSide, roughness: 0.5 });
    const finGold = new THREE.MeshStandardMaterial({ color: 0xff8a1a, side: THREE.DoubleSide, roughness: 0.4, emissive: 0x552200 });
    reflective.push(silver, gold);
    const bodyGeo = new THREE.SphereGeometry(1, 16, 10);
    const tailGeo = new THREE.BufferGeometry();
    tailGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0.17, -0.2, 0, -0.17, -0.2], 3));
    tailGeo.computeVertexNormals();
    const eyeGeo = new THREE.SphereGeometry(0.025, 6, 4);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x050505 });
    const glowMap = glowTexture('rgba(120,230,255,1)', 'rgba(60,160,255,0)');
    const goldGlow = glowTexture('rgba(255,220,120,1)', 'rgba(255,160,0,0)');

    function makeFish() {
      const g = new THREE.Group();
      const body = new THREE.Mesh(bodyGeo, silver); body.scale.set(0.1, 0.14, 0.34); g.add(body);
      const tailP = new THREE.Group(); tailP.position.z = -0.3; g.add(tailP);
      const tail = new THREE.Mesh(tailGeo, finMat); tailP.add(tail);
      const dorsal = new THREE.Mesh(tailGeo, finMat); dorsal.scale.set(1, 0.6, 0.8); dorsal.rotation.x = -1.9; dorsal.position.set(0, 0.12, 0.02); g.add(dorsal);
      for (const s of [-1, 1]) { const e = new THREE.Mesh(eyeGeo, eyeMat); e.position.set(s * 0.07, 0.03, 0.24); g.add(e); }
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowMap, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
      glow.scale.setScalar(1.6); g.add(glow);
      g.traverse(m => { if (m.isMesh) m.castShadow = true; });
      g.userData = { body, tail, tailP, dorsal, glow };
      g.visible = false;
      scene.add(g);
      return g;
    }
    function setGolden(m, on) {
      const u = m.userData;
      u.body.material = on ? gold : silver;
      u.tail.material = u.dorsal.material = on ? finGold : finMat;
      u.glow.material.map = on ? goldGlow : glowMap;
      m.scale.setScalar(on ? 1.25 : 1);
    }
    const pool = []; for (let i = 0; i < 40; i++) pool.push({ mesh: makeFish(), alive: false });

    // ---------- crabs ----------
    const crabMat = new THREE.MeshStandardMaterial({ color: 0xd8432a, roughness: 0.5 });
    function makeCrab() {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 8), crabMat); body.scale.set(1.2, 0.5, 0.9); body.position.y = 0.2; g.add(body);
      const legs = [];
      for (const s of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          const l = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.36, 5), crabMat);
          l.position.set(s * 0.33, 0.12, (i - 1) * 0.14); l.rotation.z = s * 1.0; g.add(l); legs.push(l);
        }
        const claw = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), crabMat); claw.scale.set(1, 0.7, 1.4); claw.position.set(s * 0.28, 0.26, 0.32); g.add(claw);
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), eyeMat); eye.position.set(s * 0.08, 0.38, 0.18); g.add(eye);
      }
      g.traverse(m => { if (m.isMesh) m.castShadow = true; });
      g.userData = { legs }; g.visible = false; scene.add(g);
      return g;
    }
    const crabPool = []; for (let i = 0; i < 6; i++) crabPool.push({ mesh: makeCrab(), alive: false });

    // ---------- particles ----------
    const PN = 500;
    const pPos = new Float32Array(PN * 3), pCol = new Float32Array(PN * 3), pSize = new Float32Array(PN);
    const pVel = new Float32Array(PN * 3), pLife = new Float32Array(PN);
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    pg.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
    pg.setAttribute('aSize', new THREE.BufferAttribute(pSize, 1));
    const pMat = new THREE.ShaderMaterial({
      uniforms: { uPR: { value: 1 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true,
      vertexShader: `attribute float aSize; uniform float uPR; varying vec3 vC;
        void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position,1.); gl_Position = projectionMatrix * mv; gl_PointSize = aSize * uPR * 220. / -mv.z; }`,
      fragmentShader: `varying vec3 vC; void main(){ float d = length(gl_PointCoord - .5); float a = smoothstep(.5, .0, d); gl_FragColor = vec4(vC * a, a); }`
    });
    const points = new THREE.Points(pg, pMat); points.frustumCulled = false; scene.add(points);
    let pHead = 0;
    F.burst = function (pos, color, n, spd, size) {
      const c = new THREE.Color(color);
      for (let k = 0; k < n; k++) {
        const i = pHead; pHead = (pHead + 1) % PN;
        pPos[i * 3] = pos.x; pPos[i * 3 + 1] = pos.y; pPos[i * 3 + 2] = pos.z;
        const th = rand(0, 6.283), ph = rand(-1, 1), r = Math.sqrt(1 - ph * ph), s = rand(0.3, 1) * spd;
        pVel[i * 3] = Math.cos(th) * r * s; pVel[i * 3 + 1] = Math.abs(ph) * s + spd * 0.3; pVel[i * 3 + 2] = Math.sin(th) * r * s;
        pCol[i * 3] = c.r; pCol[i * 3 + 1] = c.g; pCol[i * 3 + 2] = c.b;
        pSize[i] = size * rand(0.5, 1.2); pLife[i] = rand(0.6, 1.2);
      }
    };
    function updateParticles(dt, speed) {
      for (let i = 0; i < PN; i++) {
        if (pLife[i] <= 0) { pSize[i] = 0; continue; }
        pLife[i] -= dt;
        pVel[i * 3 + 1] -= 7 * dt;
        pPos[i * 3] += pVel[i * 3] * dt; pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt; pPos[i * 3 + 2] += (pVel[i * 3 + 2] + speed) * dt;
        if (pLife[i] < 0.3) pSize[i] *= 0.9;
      }
      pg.attributes.position.needsUpdate = true; pg.attributes.color.needsUpdate = true; pg.attributes.aSize.needsUpdate = true;
    }

    // ---------- spawning ----------
    function spawnFish(o) {
      const slot = pool.find(p => !p.alive); if (!slot) return null;
      Object.assign(slot, { alive: true, t: rand(0, 6), golden: Math.random() < 0.07, type: 'float', active: true, missed: false }, o);
      slot.mesh.visible = true;
      setGolden(slot.mesh, slot.golden);
      slot.mesh.position.set(slot.x, slot.baseY, slot.z);
      return slot;
    }
    function spawnCrab(x, z) {
      const slot = crabPool.find(p => !p.alive); if (!slot) return;
      Object.assign(slot, { alive: true, x, z, t: rand(0, 6), scored: false, hit: false });
      slot.mesh.visible = true;
    }
    const Z0 = -150;
    const patterns = {
      row() { const L = pick(LANES), n = 4 + (Math.random() * 3 | 0); for (let i = 0; i < n; i++) spawnFish({ x: L, baseY: LOW_Y, z: Z0 - i * 3.6 }); },
      zigzag() { const seq = Math.random() < 0.5 ? [0, 1, 2, 1, 0] : [2, 1, 0, 1, 2]; seq.forEach((l, i) => spawnFish({ x: LANES[l], baseY: LOW_Y, z: Z0 - i * 7 })); },
      arch() { const L = pick(LANES); [LOW_Y, 2.35, HIGH_Y, HIGH_Y, 2.35, LOW_Y].forEach((y, i) => spawnFish({ x: L, baseY: y, z: Z0 - i * 2.4 })); },
      high() { const L = pick(LANES); for (let i = 0; i < 3; i++) spawnFish({ x: L, baseY: HIGH_Y, z: Z0 - i * 2.6 }); },
      leaper() { const n = 1 + (Math.random() * 3 | 0); for (let i = 0; i < n; i++) spawnFish({ type: 'leap', x: -17, baseY: -1, z: Z0 - i * 10, lane: pick(LANES), active: false, lt: 0 }); },
      crab() { const L = pick(LANES); spawnCrab(L, Z0); spawnFish({ x: L, baseY: HIGH_Y - 0.15, z: Z0 - 0.5 }); spawnFish({ x: pick(LANES.filter(v => v !== L)), baseY: LOW_Y, z: Z0 - 6 }); }
    };
    let nextAt = 20;
    F.reset = () => { nextAt = 20; };

    // ---------- per-frame ----------
    const catchBox = { x: 0.95, y: 0.85, z: 1.05 };
    F.update = function (dt, ctx) {
      // ctx: {speed, dist, time, night, catchPt, riderX, riderY, airborne}
      const sp = ctx.speed;
      if (ctx.dist > nextAt) {
        const keys = ctx.dist > 250 ? ['row', 'row', 'zigzag', 'arch', 'high', 'leaper', 'crab', 'crab'] : ['row', 'row', 'zigzag', 'arch', 'leaper'];
        patterns[pick(keys)]();
        nextAt = ctx.dist + rand(26, 42);
      }
      const nightGlow = ctx.night;
      for (const f of pool) {
        if (!f.alive) continue;
        const m = f.mesh, u = m.userData;
        f.t += dt; f.z += sp * dt;
        u.tailP.rotation.y = Math.sin(f.t * 14) * 0.5;
        if (f.type === 'leap') {
          const LEAP_T = 1.5, dx = f.lane + 17, frac = dx / 25;
          if (!f.active && f.z > -sp * LEAP_T * frac - 1.2) { f.active = true; f.lt = 0; F.burst(new THREE.Vector3(-17, -0.4, f.z), 0xbfe8ff, 14, 3, 0.25); if (F.handlers.splash) F.handlers.splash(); }
          if (f.active) {
            f.lt += dt;
            const k = f.lt / LEAP_T;
            f.x = -17 + k * 25;
            const y = -0.6 + 4 * 3.4 * k * (1 - k);
            m.position.set(f.x, Math.max(y, -1), f.z);
            const vy = 4 * 3.4 * (1 - 2 * k) / LEAP_T;
            m.rotation.set(-Math.atan2(vy, 25 / LEAP_T), Math.PI / 2, 0, 'YXZ');
            if (k > 1.25) f.alive = false;
          } else m.position.set(-17, -1.5, f.z);
        } else {
          m.position.set(f.x, f.baseY + Math.sin(f.t * 3) * 0.12, f.z);
          m.rotation.set(Math.sin(f.t * 2) * 0.1, Math.sin(f.t * 1.3) * 0.4, Math.sin(f.t * 2.4) * 0.15);
        }
        u.glow.material.opacity = f.golden ? 0.55 + 0.45 * Math.sin(f.t * 6) : nightGlow * 0.7;
        u.body.material.emissiveIntensity = f.golden ? 0.35 + nightGlow * 0.6 : nightGlow * 0.5;
        if (f.golden && Math.random() < 0.3) F.burst(m.position, 0xffd060, 1, 0.6, 0.12);
        // catch test
        const c = ctx.catchPt;
        if (Math.abs(m.position.x - c.x) < catchBox.x && Math.abs(m.position.y - c.y) < catchBox.y && Math.abs(m.position.z - c.z) < catchBox.z) {
          f.alive = false; m.visible = false;
          F.burst(m.position, f.golden ? 0xffd34a : 0xaee8ff, f.golden ? 40 : 22, f.golden ? 4 : 3, f.golden ? 0.35 : 0.25);
          if (F.handlers.catch) F.handlers.catch(f, m.position.clone());
          continue;
        }
        if (f.z > 6) { f.alive = false; if (f.type !== 'leap' && F.handlers.miss) F.handlers.miss(f); }
        if (!f.alive) m.visible = false;
      }
      for (const c of crabPool) {
        if (!c.alive) continue;
        c.t += dt; c.z += sp * dt;
        const m = c.mesh;
        m.position.set(c.x + Math.sin(c.t * 1.5) * 0.35, 0.02, c.z);
        m.rotation.y = Math.sin(c.t * 0.7) * 0.3;
        m.userData.legs.forEach((l, i) => { l.rotation.x = Math.sin(c.t * 16 + i) * 0.35; });
        const dx = Math.abs(m.position.x - ctx.riderX), dz = Math.abs(c.z - 0);
        if (!c.hit && !c.scored && dz < 0.7 && dx < 0.75) {
          if (ctx.riderY < 0.3) { c.hit = true; F.burst(m.position.clone().setY(0.4), 0xff6a4a, 18, 3, 0.25); if (F.handlers.crabHit) F.handlers.crabHit(c); }
          else { c.scored = true; if (F.handlers.crabJump) F.handlers.crabJump(c); }
        }
        if (c.z > 8) { c.alive = false; m.visible = false; }
      }
      updateParticles(dt, sp);
    };

    F.upcoming = function () { return pool.filter(f => f.alive && f.z < 0.5 && (f.type !== 'leap')); };
    F.upcomingLeapers = function () { return pool.filter(f => f.alive && f.type === 'leap'); };
    F.upcomingCrabs = function () { return crabPool.filter(c => c.alive && !c.hit && c.z < 0.5); };
    F.setEnvMap = (tex) => reflective.forEach(m => { m.envMap = tex; m.needsUpdate = true; });
    F.setPixelRatio = (pr) => { pMat.uniforms.uPR.value = pr; };
    return F;
  };
})(window.PB);
