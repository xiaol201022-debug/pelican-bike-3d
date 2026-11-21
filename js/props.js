// Roadside props that scroll past and recycle: lamps, palms, rocks, fence, signs, lighthouse, boats, gulls.
(function (PB) {
  const { rand, pick, canvasTex, glowTexture, lerp } = PB.U;
  const C = PB.C;

  PB.createProps = function (scene) {
    const P = { items: [] };
    const root = new THREE.Group(); scene.add(root);
    const std = (c, o) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.8 }, o || {}));

    function addScroller(obj, z, span, onWrap) {
      obj.position.z = z;
      root.add(obj);
      P.items.push({ obj, span, onWrap });
    }

    // ---------- street lamps (right side) ----------
    const poleMat = std(0x2f3540, { metalness: 0.6, roughness: 0.4 });
    const bulbMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffc77a, emissiveIntensity: 0 });
    const glowMap = glowTexture('rgba(255,210,140,1)', 'rgba(255,160,60,0)');
    const poolMap = glowTexture('rgba(255,200,130,1)', 'rgba(255,150,60,0)');
    P.lampGlows = []; P.lampPools = [];
    const poleGeo = new THREE.CylinderGeometry(0.07, 0.11, 6.2, 8);
    const armGeo = new THREE.BoxGeometry(1.7, 0.08, 0.1);
    const headGeo = new THREE.BoxGeometry(0.6, 0.12, 0.3);
    for (let i = 0; i < 8; i++) {
      const g = new THREE.Group();
      const pole = new THREE.Mesh(poleGeo, poleMat); pole.position.set(0, 3.1, 0); pole.castShadow = true; g.add(pole);
      const arm = new THREE.Mesh(armGeo, poleMat); arm.position.set(-0.8, 6.1, 0); g.add(arm);
      const head = new THREE.Mesh(headGeo, poleMat); head.position.set(-1.55, 6.0, 0); g.add(head);
      const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.22), bulbMat); bulb.position.set(-1.55, 5.93, 0); g.add(bulb);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowMap, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
      glow.scale.setScalar(3.2); glow.position.set(-1.55, 5.85, 0); g.add(glow); P.lampGlows.push(glow);
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.MeshBasicMaterial({ map: poolMap, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
      pool.rotation.x = -Math.PI / 2; pool.position.set(-2.6, 0.03, 0); g.add(pool); P.lampPools.push(pool);
      g.position.x = 4.75;
      addScroller(g, -i * (C.SPAN / 8), C.SPAN);
    }

    // ---------- palms (beach side) ----------
    const trunkMat = std(0x8a6a48, { roughness: 0.95 });
    const frondMat = std(0x3f7a2e, { side: THREE.DoubleSide, roughness: 0.7 });
    const frondGeo = (() => {
      const g = new THREE.PlaneGeometry(0.7, 3.2, 1, 8);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i) + 1.6, t = y / 3.2;
        p.setX(i, p.getX(i) * Math.sin(Math.PI * Math.min(1, t * 1.1 + 0.05)));
        p.setZ(i, -t * t * 1.4);
        p.setY(i, y);
      }
      g.rotateX(-Math.PI / 2 + 0.25);
      g.computeVertexNormals();
      return g;
    })();
    P.palms = [];
    function makePalm() {
      const g = new THREE.Group();
      const h = rand(5, 8), lean = rand(-0.5, 0.15);
      const pts = []; for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push(new THREE.Vector3(Math.sin(t * 1.2) * lean * h * 0.4, t * h, 0)); }
      const curve = new THREE.CatmullRomCurve3(pts);
      const trunk = new THREE.Mesh(new THREE.TubeGeometry(curve, 10, 0.17, 7), trunkMat);
      trunk.castShadow = true; g.add(trunk);
      const top = new THREE.Group(); top.position.copy(pts[6]); g.add(top);
      for (let k = 0; k < 9; k++) {
        const f = new THREE.Mesh(frondGeo, frondMat);
        f.rotation.y = k / 9 * Math.PI * 2 + rand(-0.2, 0.2);
        f.rotation.z = rand(-0.1, 0.1);
        f.castShadow = true; top.add(f);
      }
      const nut = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), std(0x5a3e22));
      nut.position.set(0.15, -0.2, 0.1); top.add(nut);
      g.userData.top = top; g.userData.ph = rand(0, 6);
      g.rotation.y = rand(0, Math.PI * 2);
      return g;
    }
    for (let i = 0; i < 14; i++) {
      const p = makePalm();
      p.position.set(rand(-13, -6.5), -0.2, 0);
      P.palms.push(p);
      addScroller(p, -i * (C.SPAN / 14) - rand(0, 8), C.SPAN, (o) => { o.position.x = rand(-13, -6.5); });
    }

    // ---------- rocks ----------
    const rockMat = std(0x6d6660, { flatShading: true, roughness: 1 });
    for (let i = 0; i < 16; i++) {
      const r = new THREE.Mesh(new THREE.IcosahedronGeometry(rand(0.4, 1.6), 0), rockMat);
      r.scale.y = rand(0.4, 0.8);
      r.position.set(rand(-24, -12), -0.6, 0);
      r.rotation.set(rand(0, 3), rand(0, 3), 0);
      r.castShadow = true;
      addScroller(r, -rand(0, C.SPAN), C.SPAN, (o) => { o.position.x = rand(-24, -12); });
    }

    // ---------- fence posts (instanced) ----------
    const N_POST = 66, postGap = C.SPAN / N_POST;
    const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.9, 0.12), std(0x7a5a3a, { roughness: 1 }), N_POST);
    posts.castShadow = true; posts.frustumCulled = false;
    root.add(posts);
    const rope = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 900), std(0xcdb48a));
    rope.position.set(-4.45, 0.72, -300); root.add(rope);
    const m4 = new THREE.Matrix4();

    // ---------- fish-crossing signs ----------
    const signTex = canvasTex(256, 256, (g) => {
      g.fillStyle = '#f5c400'; g.translate(128, 128); g.rotate(Math.PI / 4);
      g.fillRect(-88, -88, 176, 176); g.strokeStyle = '#111'; g.lineWidth = 10; g.strokeRect(-80, -80, 160, 160);
      g.rotate(-Math.PI / 4); g.font = '90px serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('🐟', 0, -6);
      g.font = 'bold 26px sans-serif'; g.fillStyle = '#111'; g.fillText('鱼类出没', 0, 64);
    }, false);
    for (let i = 0; i < 2; i++) {
      const g = new THREE.Group();
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 6), poleMat); post.position.y = 1.3; g.add(post);
      const board = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3), new THREE.MeshStandardMaterial({ map: signTex, transparent: true, roughness: 0.5, side: THREE.DoubleSide }));
      board.position.y = 2.5; board.rotation.y = 0.15; g.add(board);
      g.position.x = 5.2;
      addScroller(g, -C.SPAN * (0.3 + i * 0.5), C.SPAN);
    }

    // ---------- lighthouse on an island ----------
    const lh = new THREE.Group();
    const stripe = canvasTex(64, 256, (g, w, h) => { for (let i = 0; i < 6; i++) { g.fillStyle = i % 2 ? '#c92a2a' : '#f4efe6'; g.fillRect(0, i * h / 6, w, h / 6); } }, false);
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 2.4, 18, 20), new THREE.MeshStandardMaterial({ map: stripe, roughness: 0.7 }));
    tower.position.y = 11; lh.add(tower);
    const isl = new THREE.Mesh(new THREE.IcosahedronGeometry(9, 1), rockMat); isl.scale.set(1.4, 0.5, 1); isl.position.y = 0.5; lh.add(isl);
    const lantern = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 1.8, 12), new THREE.MeshStandardMaterial({ color: 0x333333, emissive: 0xfff0b0, emissiveIntensity: 0.2 }));
    lantern.position.y = 21; lh.add(lantern);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(1.6, 1.6, 12), std(0x2a2a2a)); cap.position.y = 22.7; lh.add(cap);
    const beamTex = canvasTex(64, 256, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,240,190,.9)'); gr.addColorStop(1, 'rgba(255,240,190,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    }, false);
    const beamPivot = new THREE.Group(); beamPivot.position.y = 21; lh.add(beamPivot);
    const beamMat = new THREE.MeshBasicMaterial({ map: beamTex, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0, fog: false });
    for (const s of [1, -1]) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(9, 120, 16, 1, true), beamMat);
      cone.rotation.z = s * Math.PI / 2; cone.position.x = s * 60; beamPivot.add(cone);
    }
    const lhGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowMap, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, fog: false }));
    lhGlow.scale.setScalar(16); lhGlow.position.y = 21; lh.add(lhGlow);
    lh.position.set(-70, -0.8, 0);
    addScroller(lh, -420, 900);
    P.lighthouse = { beamPivot, beamMat, lhGlow, lantern };

    // ---------- sailboats ----------
    P.boats = [];
    const sailMat = std(0xf4efe6, { side: THREE.DoubleSide });
    for (let i = 0; i < 5; i++) {
      const b = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.7, 4.5), std(pick([0xffffff, 0x2a5d9a, 0xb83a2a])));
      hull.position.y = 0.2; b.add(hull);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 6, 5), std(0x444444)); mast.position.y = 3.3; b.add(mast);
      const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(0, 5.5); sh.lineTo(2.6, 0.2); sh.lineTo(0, 0);
      const sail = new THREE.Mesh(new THREE.ShapeGeometry(sh), sailMat); sail.rotation.y = Math.PI / 2; sail.position.set(0, 0.7, 0.2); b.add(sail);
      const lamp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowMap, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, fog: false }));
      lamp.scale.setScalar(4); lamp.position.y = 6.4; b.add(lamp);
      b.userData = { ph: rand(0, 6), lamp };
      b.position.set(rand(-260, -60), -0.8, 0);
      b.rotation.y = rand(-0.5, 0.5);
      P.boats.push(b);
      addScroller(b, -rand(0, 900), 900, (o) => { o.position.x = rand(-260, -60); });
    }

    // ---------- gulls ----------
    P.gulls = [];
    const gullMat = std(0xf2f2f2, { side: THREE.DoubleSide });
    const wingGeo = new THREE.BufferGeometry();
    wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.15, 0, 0, 0.2, 0.9, 0, 0.1], 3));
    wingGeo.computeVertexNormals();
    for (let i = 0; i < 7; i++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), gullMat); body.scale.z = 2.6; g.add(body);
      const wl = new THREE.Mesh(wingGeo, gullMat), wr = new THREE.Mesh(wingGeo, gullMat);
      wr.scale.x = -1; g.add(wl, wr);
      g.userData = { wl, wr, r: rand(10, 30), h: rand(7, 18), sp: rand(0.15, 0.35) * (Math.random() < 0.5 ? -1 : 1), a: rand(0, 6), cz: rand(-60, -10), ph: rand(0, 6) };
      root.add(g); P.gulls.push(g);
    }

    P.update = function (dt, speed, dist, t, night) {
      const dz = speed * dt;
      for (const it of P.items) {
        it.obj.position.z += dz;
        if (it.obj.position.z > 30) { it.obj.position.z -= it.span; if (it.onWrap) it.onWrap(it.obj); }
      }
      // fence posts
      for (let i = 0; i < N_POST; i++) {
        const z = ((i * postGap + dist) % C.SPAN) - (C.SPAN - 30);
        m4.makeTranslation(-4.45, 0.45, z);
        posts.setMatrixAt(i, m4);
      }
      posts.instanceMatrix.needsUpdate = true;
      // lamps
      const on = PB.U.smooth(0.2, 0.6, night);
      bulbMat.emissiveIntensity = on * 3;
      for (const g of P.lampGlows) g.material.opacity = on;
      for (const p of P.lampPools) p.material.opacity = on * 0.35;
      // palms sway
      for (const p of P.palms) {
        const tp = p.userData.top;
        tp.rotation.z = Math.sin(t * 1.1 + p.userData.ph) * 0.05;
        tp.rotation.x = Math.sin(t * 0.8 + p.userData.ph * 2) * 0.04;
      }
      // lighthouse
      const L = P.lighthouse;
      L.beamPivot.rotation.y = t * 0.9;
      L.beamMat.opacity = on * 0.22;
      L.lhGlow.material.opacity = 0.2 + on * 0.8;
      L.lantern.material.emissiveIntensity = 0.3 + on * 2.5;
      // boats bob
      for (const b of P.boats) {
        b.position.y = -0.8 + Math.sin(t * 1.2 + b.userData.ph) * 0.25;
        b.rotation.z = Math.sin(t * 0.9 + b.userData.ph) * 0.08;
        b.userData.lamp.material.opacity = on;
      }
      // gulls circle above, fade out at night
      const gs = lerp(1, 0.001, PB.U.smooth(0.5, 0.9, night));
      for (const g of P.gulls) {
        const u = g.userData;
        u.a += u.sp * dt;
        const x = -6 + Math.cos(u.a) * u.r, z = u.cz + Math.sin(u.a) * u.r * 0.6;
        g.position.set(x, u.h + Math.sin(t + u.ph) * 1.2, z);
        g.rotation.y = -u.a + (u.sp > 0 ? Math.PI : 0);
        const f = Math.sin(t * 7 + u.ph) * 0.6;
        u.wl.rotation.z = f; u.wr.rotation.z = -f;
        g.scale.setScalar(gs);
      }
    };
    return P;
  };
})(window.PB);
