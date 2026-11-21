// Frame loop: physics, autopilot, achievements, HUD, adaptive quality.
(function (PB) {
  const { clamp, lerp, damp, smooth, rand } = PB.U;
  const LANES = PB.C.LANES;
  const $ = (id) => document.getElementById(id);
  const G = PB.G, X = PB.game;
  const { renderer, scene, camera, sky, terrain, props, rider, scarf, fish, cams, audio, composer, bloom, keys } = X;

  // ---------------- achievements ----------------
  const ACH = [
    ['first', '🐟', '开张大吉', '抓到第一条鱼'],
    ['fish10', '🎣', '小有收获', '累计抓到 10 条鱼'],
    ['fish50', '🧺', '满载而归', '累计抓到 50 条鱼'],
    ['combo5', '🔥', '连击 ×5', '4 秒内接连抓到 5 条'],
    ['golden', '✨', '金色传说', '抓到一条金鱼'],
    ['speed', '💨', '风驰电掣', '时速达到 55 km/h'],
    ['jump', '🦘', '腾空而起', '第一次跳跃'],
    ['airfish', '🛫', '空中接鱼', '在空中抓到鱼'],
    ['wheelie', '🚲', '独轮特技', '抬前轮坚持 3 秒'],
    ['glide', '🪽', '鹈鹕滑翔', '展翅滞空 1.3 秒'],
    ['night', '🌙', '夜骑者', '骑进星空月夜'],
    ['dawn', '🌅', '新的一天', '一路骑到日出'],
    ['director', '🎬', '导演', '用过全部 5 种镜头'],
    ['km3', '🛣️', '长途骑行', '骑行 3 公里']
  ];
  let got = {};
  try { got = JSON.parse(localStorage.getItem('pelican-ach-v1') || '{}') || {}; } catch (e) { got = {}; }
  function save() { try { localStorage.setItem('pelican-ach-v1', JSON.stringify(got)); } catch (e) { /* storage blocked */ } }
  function countAch() { $('achCount').textContent = ACH.filter(a => got[a[0]]).length; }
  PB.unlock = function (id) {
    if (got[id] || !G.started) return;
    const a = ACH.find(x => x[0] === id); if (!a) return;
    got[id] = Date.now(); save(); countAch();
    const t = document.createElement('div'); t.className = 'toast';
    t.innerHTML = `<span class="ic">${a[1]}</span><div><b>成就解锁 · ${a[2]}</b><span>${a[3]}</span></div>`;
    $('toasts').appendChild(t); setTimeout(() => t.remove(), 4000);
    audio.sfx('achievement');
  };
  PB.renderAch = function () {
    $('achGrid').innerHTML = ACH.map(a => `<div class="ach ${got[a[0]] ? 'on' : ''}"><span class="ic">${a[1]}</span><div><b>${a[2]}</b><span>${a[3]}</span></div></div>`).join('');
  };
  countAch();
  const unlock = PB.unlock;

  // ---------------- fish events ----------------
  const tmpV = new THREE.Vector3();
  function popup(pos, text, cls) {
    tmpV.copy(pos).project(camera);
    if (tmpV.z > 1) return;
    const el = document.createElement('div'); el.className = 'pop ' + (cls || '');
    el.textContent = text;
    el.style.left = ((tmpV.x * 0.5 + 0.5) * innerWidth) + 'px';
    el.style.top = ((-tmpV.y * 0.5 + 0.5) * innerHeight) + 'px';
    $('pops').appendChild(el); setTimeout(() => el.remove(), 1000);
  }
  fish.handlers.catch = (f, pos) => {
    const pts = f.golden ? 5 : 1;
    G.fishCount += pts;
    G.combo = G.comboTimer > 0 ? G.combo + 1 : 1;
    G.comboTimer = 4;
    rider.gulp();
    audio.sfx(f.golden ? 'golden' : 'catch', { combo: G.combo });
    popup(pos, (f.golden ? '金鱼 +5' : '+1') + (G.combo > 1 ? `  ×${G.combo}` : ''), f.golden ? 'gold' : '');
    unlock('first');
    if (G.fishCount >= 10) unlock('fish10');
    if (G.fishCount >= 50) unlock('fish50');
    if (G.combo >= 5) unlock('combo5');
    if (f.golden) unlock('golden');
    if (G.airborne) unlock('airfish');
    addBasketFish(f.golden);
  };
  fish.handlers.crabHit = (c) => {
    G.speed *= 0.45; G.combo = 0; G.comboTimer = 0; cams.shake = 1;
    G.wobble = 1; audio.sfx('crab'); popup(c.mesh.position.clone().setY(1), '哎哟!', 'bad');
  };
  fish.handlers.crabJump = (c) => { audio.sfx('crabJump'); popup(c.mesh.position.clone().setY(1.2), '跳过螃蟹'); };
  fish.handlers.splash = () => audio.sfx('splash');
  fish.handlers.miss = () => {};
  // a few fish pile up in the front basket
  const basketMeshes = [];
  function addBasketFish(golden) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6), new THREE.MeshStandardMaterial({ color: golden ? 0xffc43a : 0x9fc3d8, metalness: 0.6, roughness: 0.3 }));
    m.scale.set(0.04, 0.05, 0.13);
    m.position.set(rand(-0.08, 0.08), 0.05 + basketMeshes.length * 0.012, rand(-0.05, 0.05));
    m.rotation.set(rand(-0.5, 0.5), rand(0, 3), rand(-0.3, 0.3));
    rider.basketFish.add(m); basketMeshes.push(m);
    if (basketMeshes.length > 7) { const o = basketMeshes.shift(); rider.basketFish.remove(o); basketMeshes.forEach((b, i) => b.position.y = 0.05 + i * 0.012); }
  }

  // ---------------- autopilot ----------------
  const ai = { up: false, down: false, jump: false, wing: false, laneT: 0 };
  function autopilot(dt) {
    ai.up = G.speed < 11.5; ai.down = G.speed > 14;
    ai.jump = false;
    const cz = -0.9;
    let target = null, best = -1e9;
    for (const f of fish.upcoming()) {
      if (f.z > cz + 0.4 || f.z < -70) continue;
      const score = f.z + (f.golden ? 25 : 0);
      if (score > best) { best = score; target = f; }
    }
    for (const f of fish.upcomingLeapers()) {
      if (f.z > cz + 0.4 || f.z < -45) continue;
      const score = f.z + 6;
      if (score > best) { best = score; target = { x: f.lane, baseY: 1.9, z: f.z }; }
    }
    let wantLane = G.lane;
    if (target) {
      let bi = 1, bd = 99; LANES.forEach((l, i) => { const d = Math.abs(l - target.x); if (d < bd) { bd = d; bi = i; } });
      wantLane = bi;
      const tUntil = (cz - target.z) / Math.max(G.speed, 1);
      if (target.baseY > 2.4 && tUntil < 0.33 && tUntil > 0.05) ai.jump = true;
      ai.wing = target.baseY > 2.4 && G.airborne;
    } else ai.wing = false;
    // dodge crabs in the chosen lane when no high fish is above them
    for (const c of fish.upcomingCrabs()) {
      if (Math.abs(c.x - LANES[wantLane]) < 0.8) {
        const tUntil = -c.z / Math.max(G.speed, 1);
        if (tUntil < 0.3 && tUntil > 0) ai.jump = true;
      }
    }
    // show off: an occasional wheelie on empty road
    G.autoNext -= dt;
    if (!target && G.autoNext < 0) { G.autoWing = 2.2; G.autoNext = rand(9, 16); }
    if (G.autoWing > 0) { G.autoWing -= dt; ai.wing = true; }
    ai.laneT -= dt;
    if (wantLane !== G.lane && ai.laneT <= 0) { G.lane += Math.sign(wantLane - G.lane); ai.laneT = 0.28; }
    if (ai.jump && !G.airborne) X.doJump();
  }

  // ---------------- physics ----------------
  const MAXV = 16.8;
  function physics(dt) {
    const c = G.auto ? ai : keys;
    G.pedaling = c.up || G.speed < 5;
    if (c.up) G.speed += 5.2 * (1 - G.speed / MAXV) * dt;
    else if (c.down) G.speed -= 11 * dt;
    else G.speed -= (0.12 + 0.0035 * G.speed * G.speed) * dt;
    if (G.speed < 5 && !c.down) G.speed += 2.5 * dt;
    if (G.wings > 0.5 && !G.airborne) G.speed -= 0.4 * dt;
    G.speed = clamp(G.speed, 0, MAXV);
    G.maxSpeed = Math.max(G.maxSpeed, G.speed);
    if (G.speed * 3.6 >= 55) unlock('speed');

    G.wings = damp(G.wings, c.wing ? 1 : 0, 7, dt);
    // vertical
    if (G.airborne) {
      G.airTime += dt;
      const g = G.wings > 0.5 ? 7.5 : 19;
      G.vy -= g * dt;
      if (G.wings > 0.5 && G.vy < -1.6) G.vy = damp(G.vy, -1.6, 6, dt);
      G.y += G.vy * dt;
      if (G.y <= 0) {
        G.y = 0; G.airborne = false; G.vy = 0;
        if (G.airTime > 1.3) unlock('glide');
        cams.shake = Math.min(1, 0.4 + G.airTime * 0.3);
        audio.sfx('land');
        fish.burst(new THREE.Vector3(G.x, 0.1, 0.3), 0xd8c7a0, 10, 1.5, 0.18);
      }
    }
    // wheelie
    const wheelieTarget = !G.airborne && c.wing ? 0.42 : (G.airborne ? -0.04 : 0);
    G.pitch = damp(G.pitch, wheelieTarget, G.airborne ? 3 : 5, dt);
    if (!G.airborne && G.pitch > 0.3) { G.wheelie += dt; if (G.wheelie > 3) unlock('wheelie'); } else G.wheelie = 0;
    // lanes and lean
    const prevX = G.x;
    G.x = damp(G.x, LANES[G.lane], 8, dt);
    G.latVel = (G.x - prevX) / Math.max(dt, 1e-4);
    G.wobble = Math.max(0, (G.wobble || 0) - dt * 1.5);
    G.lean = damp(G.lean, clamp(-G.latVel * 0.09, -0.38, 0.38) + Math.sin(G.time * 25) * 0.12 * G.wobble, 10, dt);
    G.dist += G.speed * dt;
    if (G.dist >= 3000) unlock('km3');
    G.comboTimer = Math.max(0, G.comboTimer - dt);
    if (G.comboTimer === 0) G.combo = 0;
  }

  // ---------------- adaptive quality ----------------
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  const LEVELS = [
    { name: '低', pr: 0.6, shadow: false, bloom: false },
    { name: '中', pr: 0.8, shadow: false, bloom: false },
    { name: '高', pr: 1, shadow: true, bloom: false },
    { name: '极高', pr: Math.max(1, Math.min(DPR, 1.5)), shadow: true, bloom: true },
    { name: '超清', pr: DPR, shadow: true, bloom: true }
  ];
  const Q = { level: isTouchDevice() ? 2 : 3, frames: 0, acc: 0, cool: 3, ceiling: 4, upHold: 0 };
  function isTouchDevice() { return document.body.classList.contains('touch'); }
  function applyQuality() {
    const L = LEVELS[Q.level];
    renderer.setPixelRatio(L.pr);
    renderer.setSize(innerWidth, innerHeight, false);
    if (composer) { composer.setPixelRatio(L.pr); composer.setSize(innerWidth, innerHeight); }
    sky.key.castShadow = L.shadow;
    sky.starMat.uniforms.uPR.value = L.pr;
    fish.setPixelRatio(L.pr);
    $('qual').textContent = '画质 ' + L.name;
  }
  function qualityTick(dt) {
    Q.frames++; Q.acc += dt; Q.cool -= dt;
    if (Q.acc < 2) return;
    const fps = Q.frames / Q.acc; Q.frames = 0; Q.acc = 0;
    if (Q.cool > 0) return;
    if (fps < 42 && Q.level > 0) { Q.ceiling = Q.level - 1; Q.level--; Q.cool = 3; Q.upHold = 25; applyQuality(); }
    else if (fps > 57) {
      Q.upHold -= 2;
      if (Q.upHold <= 0 && Q.level < 4) { if (Q.level >= Q.ceiling) Q.ceiling = Q.level + 1; Q.level++; Q.cool = 3; Q.upHold = 10; applyQuality(); }
    }
  }
  addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); applyQuality(); });
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  applyQuality();

  // ---------------- HUD ----------------
  let hudT = 0;
  function hud(dt) {
    hudT -= dt; if (hudT > 0) return; hudT = 0.1;
    $('spd').textContent = Math.round(G.speed * 3.6);
    const rpm = Math.round(rider.cadence || 0);
    $('rpm').textContent = rpm + ' rpm';
    $('cad').firstElementChild.style.width = clamp(rpm / 130 * 100, 0, 100) + '%';
    $('dist').textContent = G.dist < 1000 ? Math.round(G.dist) + ' m' : (G.dist / 1000).toFixed(2) + ' km';
    const h = sky.hour, hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
    $('clock').textContent = (sky.night > 0.5 ? '🌙 ' : '☀️ ') + String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
    $('fish').textContent = G.fishCount;
    $('combo').textContent = G.combo > 1 ? `连击 ×${G.combo}` : '';
  }

  // ---------------- loop ----------------
  const clock = new THREE.Clock();
  const focus = new THREE.Vector3();
  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05);
    G.time += dt;
    const S = PB.shared;
    S.uTime.value = G.time;

    // idle -> autopilot
    if (G.started) {
      G.idle += dt;
      const anyKey = keys.up || keys.down || keys.wing;
      if (anyKey) G.idle = 0;
      if (!G.auto && G.idle > 5) { G.auto = true; X.updateAutoChip(); }
    }
    if (G.auto) autopilot(dt);
    physics(dt);
    S.uScroll.value = G.dist;

    focus.set(G.x, 0, -4);
    sky.update(dt, camera, focus, G.speed);
    if (sky.night > 0.8) { G.sawNight = true; unlock('night'); }
    if (G.sawNight && sky.elev > 0.02) unlock('dawn');
    terrain.update(G.dist);
    props.update(dt, G.speed, G.dist, G.time, sky.night);

    rider.update(dt, { speed: G.speed, x: G.x, y: G.y, lean: G.lean, pitch: G.pitch, wings: G.wings, airborne: G.airborne,
      steer: clamp(G.latVel * 0.2, -1, 1), night: sky.night, t: G.time, pedaling: G.pedaling });
    rider.root.updateMatrixWorld(true);
    scarf.update(dt, G.speed, G.time, G.latVel);
    fish.update(dt, { speed: G.speed, dist: G.dist, time: G.time, night: sky.night, catchPt: rider.getCatchPoint(), riderX: G.x, riderY: G.y, airborne: G.airborne });
    cams.update(dt, { x: G.x, y: G.y, speed: G.speed, airborne: G.airborne, t: G.time, lean: G.lean });
    audio.update(dt, { speed: G.speed, cadence: rider.cadence || 0, night: sky.night, pedaling: G.pedaling, airborne: G.airborne });
    X.envTick(dt);

    const L = LEVELS[Q.level];
    if (composer && L.bloom) {
      bloom.strength = lerp(0.35, 0.85, sky.night);
      composer.render(dt);
    } else renderer.render(scene, camera);
    hud(dt);
    qualityTick(dt);
  }
  frame();

  // expose a tiny debug handle
  window.__pelican = { G, Q, LEVELS, sky, cams };
})(window.PB);
