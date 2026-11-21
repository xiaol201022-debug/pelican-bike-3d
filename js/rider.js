// Pelican + bicycle, built from primitives. Bike-local frame: ground at y=0, forward is -Z.
// root sits at the rear-wheel contact point so a wheelie pivots naturally.
(function (PB) {
  const { placeBetween, canvasTex, clamp, lerp } = PB.U;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const R = PB.C.WHEEL_R;

  PB.createRider = function (scene) {
    const rider = {};
    const root = new THREE.Group(); scene.add(root);
    const bike = new THREE.Group(); bike.position.z = -0.52; root.add(bike);
    const reflective = [];
    const mat = (c, o) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.6 }, o || {}));
    const unitCyl = (r0, r1) => { const g = new THREE.CylinderGeometry(r1 == null ? r0 : r1, r0, 1, 10); g.translate(0, 0.5, 0); return g; };
    const shadowAll = (o) => o.traverse(m => { if (m.isMesh) { m.castShadow = true; } });

    // ================= BICYCLE =================
    const frameMat = mat(0x18b7a8, { metalness: 0.55, roughness: 0.25, envMapIntensity: 1.4 });
    const darkMat = mat(0x1d1d22, { roughness: 0.5, metalness: 0.4 });
    const chromeMat = mat(0xdddddd, { metalness: 1, roughness: 0.18 });
    reflective.push(frameMat, chromeMat);
    const tube = (a, b, r, m) => { const t = new THREE.Mesh(unitCyl(r), m || frameMat); t.position.copy(a); t.quaternion.setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize()); t.scale.y = a.distanceTo(b); bike.add(t); return t; };
    // placeBetween expects centred cylinders; we use base-anchored ones above instead.
    const P = {
      rear: V(0, R, 0.52), front: V(0, R, -0.52), bb: V(0, 0.3, 0.08),
      seat: V(0, 0.8, 0.25), headTop: V(0, 0.82, -0.36), headBot: V(0, 0.6, -0.41)
    };
    tube(P.bb, P.seat, 0.022);                       // seat tube
    tube(P.seat, P.headTop, 0.02);                   // top tube
    tube(P.bb, P.headBot, 0.026);                    // down tube
    tube(P.headBot, P.headTop, 0.03);                // head tube
    for (const s of [-1, 1]) {
      tube(P.bb.clone().setX(s * 0.03), P.rear.clone().setX(s * 0.05), 0.012);   // chainstays
      tube(P.seat.clone().setX(s * 0.02), P.rear.clone().setX(s * 0.05), 0.011);  // seatstays
      tube(P.headBot.clone().setX(s * 0.03), P.front.clone().setX(s * 0.045), 0.014, chromeMat); // fork
    }
    // seatpost + saddle
    tube(P.seat, V(0, 0.9, 0.29), 0.014, chromeMat);
    const saddle = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), darkMat);
    saddle.scale.set(0.7, 0.28, 1.4); saddle.position.set(0, 0.91, 0.28); bike.add(saddle);
    // stem + handlebar
    const barC = V(0, 0.96, -0.42);
    tube(P.headTop, barC, 0.016, chromeMat);
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.56, 8), chromeMat);
    bar.rotation.z = Math.PI / 2; bar.position.copy(barC); bike.add(bar);
    for (const s of [-1, 1]) {
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 8), darkMat);
      grip.rotation.z = Math.PI / 2; grip.position.set(s * 0.24, barC.y, barC.z); bike.add(grip);
    }
    // basket on the front, for the catch of the day
    const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.13, 0.16, 12, 1, true), mat(0xb8874e, { side: THREE.DoubleSide, roughness: 0.9 }));
    basket.position.set(0, 0.82, -0.58); bike.add(basket);
    rider.basketFish = new THREE.Group(); rider.basketFish.position.copy(basket.position); bike.add(rider.basketFish);

    // wheels
    function makeWheel() {
      const w = new THREE.Group();
      const tire = new THREE.Mesh(new THREE.TorusGeometry(R - 0.022, 0.024, 8, 40), darkMat); w.add(tire);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(R - 0.05, 0.01, 6, 40), chromeMat); w.add(rim);
      const sp = [];
      for (let i = 0; i < 20; i++) {
        const a = i / 20 * Math.PI * 2, side = (i % 2 ? 1 : -1) * 0.025;
        sp.push(0, 0, side, Math.cos(a) * (R - 0.05), Math.sin(a) * (R - 0.05), 0);
      }
      const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
      w.add(new THREE.LineSegments(sg, new THREE.LineBasicMaterial({ color: 0xcccccc })));
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.09, 10), chromeMat); hub.rotation.x = Math.PI / 2; w.add(hub);
      w.rotation.y = Math.PI / 2; // wheel plane = YZ
      const spin = new THREE.Group(); spin.add(w);
      return spin;
    }
    const wheelR = makeWheel(); wheelR.position.copy(P.rear); bike.add(wheelR);
    const wheelF = makeWheel(); wheelF.position.copy(P.front); bike.add(wheelF);

    // drivetrain
    const crank = new THREE.Group(); crank.position.copy(P.bb); bike.add(crank);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.012, 6, 24), chromeMat); ring.rotation.y = Math.PI / 2; ring.position.x = 0.05; crank.add(ring);
    const CR = 0.15;
    for (const s of [1, -1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.02, CR, 0.03), chromeMat);
      arm.position.set(s * 0.07, s * CR / 2, 0); crank.add(arm);
      const ped = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.02, 0.06), darkMat);
      ped.position.set(s * 0.12, s * CR, 0); crank.add(ped);
    }
    const chain = new THREE.Mesh(new THREE.TorusGeometry(1, 0.006, 4, 30), darkMat);
    chain.scale.set(0.23, 0.07, 1); chain.rotation.y = Math.PI / 2; chain.position.set(0.05, 0.31, 0.3); bike.add(chain);

    // headlight + tail light
    const lampBody = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.07, 10), darkMat);
    lampBody.rotation.x = Math.PI / 2; lampBody.position.set(0, 0.9, -0.47); bike.add(lampBody);
    const lensMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xfff2c8, emissiveIntensity: 0.2 });
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.03, 12), lensMat); lens.position.set(0, 0.9, -0.506); lens.rotation.y = Math.PI; bike.add(lens);
    const head = new THREE.SpotLight(0xfff0d0, 0, 45, 0.42, 0.55, 1.2);
    head.position.set(0, 0.9, -0.5); bike.add(head);
    head.target.position.set(0, -1.2, -14); bike.add(head.target);
    const beamTex = canvasTex(32, 128, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,240,200,0.6)'); gr.addColorStop(1, 'rgba(255,240,200,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }, false);
    const beam = new THREE.Mesh(new THREE.ConeGeometry(1.4, 7, 16, 1, true), new THREE.MeshBasicMaterial({ map: beamTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, opacity: 0 }));
    beam.rotation.x = Math.PI / 2 + 0.12; beam.position.set(0, 0.62, -0.5 - 3.5); bike.add(beam);
    const tailMat = new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff2010, emissiveIntensity: 0 });
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.02), tailMat); tail.position.set(0, 0.78, 0.36); bike.add(tail);

    // ================= PELICAN =================
    const bird = new THREE.Group(); bike.add(bird);
    const featherMat = mat(0xf6f1e8, { roughness: 0.85 });
    const featherShade = mat(0xe3dccf, { roughness: 0.9 });
    const blackMat = mat(0x1c1a1e, { roughness: 0.7 });
    const beakMat = mat(0xffaa2e, { roughness: 0.45 });
    const pouchMat = mat(0xff8a4c, { roughness: 0.4, emissive: 0x301000 });
    const legMat = mat(0xf5925a, { roughness: 0.6 });

    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), featherMat);
    body.scale.set(0.27, 0.3, 0.5); body.position.set(0, 1.16, 0.14); body.rotation.x = 0.28; bird.add(body);
    const belly = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), featherShade);
    belly.scale.set(0.22, 0.2, 0.36); belly.position.set(0, 1.03, 0.08); bird.add(belly);
    for (let i = 0; i < 5; i++) { // tail fan
      const f = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), featherShade);
      f.scale.set(0.05, 0.02, 0.18); f.position.set((i - 2) * 0.04, 1.05, 0.66); f.rotation.y = (i - 2) * 0.18; f.rotation.x = -0.25; bird.add(f);
    }

    // neck + head group (pivot at neck base so head can bob)
    const neckPivot = new THREE.Group(); neckPivot.position.set(0, 1.34, -0.2); bird.add(neckPivot);
    const neckCurve = new THREE.CatmullRomCurve3([V(0, 0, 0), V(0, 0.18, 0.06), V(0, 0.38, 0.0), V(0, 0.55, -0.14), V(0, 0.6, -0.22)]);
    const neck = new THREE.Mesh(new THREE.TubeGeometry(neckCurve, 20, 0.075, 10), featherMat); neckPivot.add(neck);
    const headG = new THREE.Group(); headG.position.set(0, 0.6, -0.22); neckPivot.add(headG);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.12, 18, 14), featherMat); skull.scale.set(0.9, 1, 1.1); headG.add(skull);
    const crest = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), mat(0xffe9a8)); crest.scale.set(0.6, 0.5, 1.6); crest.position.set(0, 0.06, 0.12); headG.add(crest);
    // beak: upper mandible, hook tip, pouch
    const beakDir = V(0, -0.3, -1).normalize();
    const beakBase = V(0, -0.01, -0.1), beakLen = 0.62;
    const beakTip = beakBase.clone().addScaledVector(beakDir, beakLen);
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.045, 1, 10), beakMat);
    upper.scale.set(1, 1, 0.55);
    { const tmp = new THREE.Mesh(); placeBetween(tmp, beakBase, beakTip); upper.position.copy(tmp.position); upper.quaternion.copy(tmp.quaternion); upper.scale.y = tmp.scale.y; }
    upper.position.y += 0.02; headG.add(upper);
    const hook = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), mat(0xe0442a)); hook.position.copy(beakTip).add(V(0, 0.0, 0)); headG.add(hook);
    const pouch = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), pouchMat);
    const pouchPivot = new THREE.Group(); pouchPivot.position.copy(beakBase.clone().lerp(beakTip, 0.48)); pouchPivot.quaternion.setFromUnitVectors(V(0, 0, -1), beakDir);
    pouch.scale.set(0.045, 0.05, 0.29); pouch.position.set(0, -0.045, 0); pouchPivot.add(pouch); headG.add(pouchPivot);
    rider.catchPoint = new THREE.Object3D(); rider.catchPoint.position.copy(beakBase.clone().lerp(beakTip, 0.6)); headG.add(rider.catchPoint);

    // helmet
    const helmTex = canvasTex(256, 128, (g, w, h) => {
      g.fillStyle = '#ffcc1a'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#1b1b22'; for (let i = 0; i < 6; i++) g.fillRect(i * w / 6 + 14, 0, 12, h * 0.75);
      g.fillStyle = '#e0302b'; g.fillRect(0, h * 0.78, w, h * 0.12);
    }, false);
    const helmMat = new THREE.MeshStandardMaterial({ map: helmTex, roughness: 0.22, metalness: 0.15, envMapIntensity: 1.2 });
    reflective.push(helmMat);
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.155, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), helmMat);
    helmet.scale.set(1, 0.82, 1.3); helmet.position.set(0, 0.035, 0.02); helmet.rotation.x = -0.12; headG.add(helmet);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.012, 0.07), blackMat); visor.position.set(0, 0.05, -0.18); visor.rotation.x = 0.25; headG.add(visor);
    const strap = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.006, 4, 24, Math.PI), blackMat); strap.rotation.y = Math.PI / 2; strap.rotation.z = Math.PI; strap.position.y = 0.02; headG.add(strap);

    // sunglasses
    const lensGlass = new THREE.MeshStandardMaterial({ color: 0x0a0a12, metalness: 1, roughness: 0.06, envMapIntensity: 2.2 });
    reflective.push(lensGlass);
    for (const s of [-1, 1]) {
      const l = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), lensGlass);
      l.scale.set(0.058, 0.04, 0.018); l.position.set(s * 0.078, 0.015, -0.095); l.rotation.y = -s * 0.55; headG.add(l);
      const armG = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.008, 0.14), blackMat); armG.position.set(s * 0.108, 0.02, -0.02); headG.add(armG);
    }
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.01, 0.01), blackMat); bridge.position.set(0, 0.03, -0.115); headG.add(bridge);
    rider.eye = new THREE.Object3D(); rider.eye.position.set(0, 0.085, -0.27); headG.add(rider.eye);

    // wings
    const wingShape = new THREE.Shape([V(0, -0.1), V(0.4, -0.14), V(0.78, -0.11), V(0.78, 0.25), V(0.6, 0.29), V(0.4, 0.31), V(0.2, 0.3), V(0, 0.25)].map(v => new THREE.Vector2(v.x, v.y)));
    const tipShape = new THREE.Shape([[0.74, -0.11], [0.82, -0.1], [1.12, 0.0], [1.06, 0.1], [1.0, 0.07], [0.98, 0.17], [0.9, 0.13], [0.88, 0.22], [0.8, 0.19], [0.74, 0.26]].map(p => new THREE.Vector2(p[0], p[1])));
    const wg = new THREE.ShapeGeometry(wingShape); wg.rotateX(Math.PI / 2);
    const tg = new THREE.ShapeGeometry(tipShape); tg.rotateX(Math.PI / 2); tg.translate(0, 0.004, 0);
    const wingMatD = mat(0xf6f1e8, { side: THREE.DoubleSide, roughness: 0.85 });
    const tipMatD = mat(0x1c1a1e, { side: THREE.DoubleSide, roughness: 0.7 });
    const qFold = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -Math.PI / 2, 0)).premultiply(new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), Math.PI / 2 - 0.1));
    const wings = [];
    for (const s of [1, -1]) {
      const mirror = new THREE.Group(); mirror.scale.x = s; bird.add(mirror);
      const pivot = new THREE.Group(); pivot.position.set(0.22, 1.3, -0.08); mirror.add(pivot);
      const w = new THREE.Mesh(wg, wingMatD), tp = new THREE.Mesh(tg, tipMatD);
      pivot.add(w, tp);
      wings.push(pivot);
    }

    // legs (2-bone IK to the pedals) + webbed feet
    const legs = [];
    const footGeo = new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(0, 0.03), new THREE.Vector2(-0.06, -0.12), new THREE.Vector2(0, -0.09), new THREE.Vector2(0.06, -0.12)]));
    footGeo.rotateX(Math.PI / 2);
    for (const s of [1, -1]) {
      const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 1, 8), legMat);
      const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.028, 1, 8), legMat);
      const foot = new THREE.Mesh(footGeo, mat(0xf07a46, { side: THREE.DoubleSide }));
      const knee = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 6), legMat);
      bird.add(thigh, shin, foot, knee);
      legs.push({ s, thigh, shin, foot, knee, hip: V(s * 0.1, 0.94, 0.2) });
    }
    const L1 = 0.37, L2 = 0.41;
    function solveLeg(leg, pedal) {
      const H = leg.hip;
      const dy = pedal.y - H.y, dz = pedal.z - H.z;
      const d = clamp(Math.hypot(dy, dz), 0.1, L1 + L2 - 0.005);
      const th = Math.atan2(dy, dz);
      const a = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
      let k1z = H.z + Math.cos(th + a) * L1, k1y = H.y + Math.sin(th + a) * L1;
      let k2z = H.z + Math.cos(th - a) * L1, k2y = H.y + Math.sin(th - a) * L1;
      const kz = k1z < k2z ? k1z : k2z, ky = k1z < k2z ? k1y : k2y;   // knee forward
      const K = V(lerp(H.x, pedal.x, 0.5), ky, kz);
      placeBetween(leg.thigh, H, K); placeBetween(leg.shin, K, pedal);
      leg.knee.position.copy(K);
      leg.foot.position.copy(pedal).add(V(0, 0.015, 0));
    }

    shadowAll(root);
    beam.castShadow = false;

    // ================= STATE / UPDATE =================
    rider.root = root; rider.bike = bike; rider.bird = bird; rider.headG = headG; rider.neckPivot = neckPivot;
    rider.wings = wings; rider.pouch = pouch; rider.basket = basket;
    rider.headlight = head;
    rider.neckAnchor = { pivot: neckPivot, curve: neckCurve };
    let crankA = 0, gulp = 0, flapT = 0;
    const tmpQ = new THREE.Quaternion(), qSpread = new THREE.Quaternion(), qFlap = new THREE.Quaternion();

    rider.setEnvMap = (tex) => { reflective.forEach(m => { m.envMap = tex; m.needsUpdate = true; }); };
    rider.gulp = () => { gulp = 1; };

    rider.update = function (dt, st) {
      // st: {speed, x, y, lean, pitch, wings, airborne, steer, night, t, pedaling}
      root.position.set(st.x, st.y, 0.52);
      root.rotation.set(st.pitch, 0, st.lean, 'YXZ');
      const wAng = st.speed / R * dt;
      wheelR.rotation.x -= wAng; wheelF.rotation.x -= wAng;
      if (!st.airborne && st.pedaling) crankA += wAng / 2.6;
      crank.rotation.x = -crankA;
      rider.cadence = st.airborne || !st.pedaling ? 0 : (st.speed / R / 2.6) * 60 / (Math.PI * 2);
      // legs follow pedals
      const c = Math.cos(crankA), s = Math.sin(crankA);
      solveLeg(legs[0], V(0.12, P.bb.y + CR * c, P.bb.z - CR * s));
      solveLeg(legs[1], V(-0.12, P.bb.y - CR * c, P.bb.z + CR * s));
      // body rocking with each stroke, head bob & steer look
      const effort = clamp(st.speed / 12, 0, 1) * (st.pedaling ? 1 : 0.2);
      bird.position.y = Math.abs(Math.sin(crankA)) * 0.018 * effort;
      bird.rotation.z = Math.sin(crankA) * 0.03 * effort;
      neckPivot.rotation.x = Math.sin(crankA * 2) * 0.04 * effort - st.pitch * 0.6 + (st.airborne ? 0.1 : 0);
      neckPivot.rotation.y = -st.steer * 0.25;
      headG.rotation.z = st.lean * -0.6;
      // gulp: pouch bulges then shrinks with a swallow
      gulp = Math.max(0, gulp - dt * 1.3);
      const g = Math.sin(Math.min(1, (1 - gulp)) * Math.PI) * (gulp > 0 ? 1 : 0);
      pouch.scale.set(0.045 + g * 0.05, 0.05 + g * 0.09, 0.29);
      headG.rotation.x = -g * 0.25;
      // wings: fold <-> spread, flapping when gliding
      flapT += dt * (st.airborne ? 7 : 3.5);
      const sp = st.wings;
      for (const w of wings) {
        qSpread.setFromAxisAngle(V(0, 0, 1), 0.12 + Math.sin(flapT) * (st.airborne ? 0.45 : 0.15));
        tmpQ.copy(qFold).slerp(qSpread, sp);
        w.quaternion.copy(tmpQ);
        w.scale.x = lerp(0.6, 1.05, sp);
      }
      // lights
      const on = PB.U.smooth(0.15, 0.55, st.night);
      head.intensity = on * 4.5;
      beam.material.opacity = on * 0.35;
      lensMat.emissiveIntensity = 0.2 + on * 4;
      tailMat.emissiveIntensity = on * (Math.sin(st.t * 9) > 0 ? 4 : 0.3);
    };

    rider.worldCatch = new THREE.Vector3();
    rider.getCatchPoint = () => { rider.catchPoint.getWorldPosition(rider.worldCatch); return rider.worldCatch; };
    return rider;
  };
})(window.PB);
