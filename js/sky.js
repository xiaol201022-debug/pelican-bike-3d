// Sky dome, day-night cycle, sun, moon, stars, milky way, clouds, shooting stars and scene lights.
(function (PB) {
  const { clamp, lerp, smooth, rand, lin, canvasTex, glowTexture } = PB.U;
  const S = PB.shared;

  // Palette keyed by sun elevation (sunDir.y). Colours are sRGB hex, converted to linear on use.
  const KEYS = [
    { e: 0.55, top: 0x2f73d6, hor: 0xa8d3f2, glow: 0xfff1d2, fog: 0xb8d6ec, sun: 0xfff4e2, si: 2.7, amb: 0x9cbde6, ai: 0.95, gnd: 0x6a6150 },
    { e: 0.16, top: 0x4561ad, hor: 0xffbe7a, glow: 0xffa050, fog: 0xe8b08a, sun: 0xffc080, si: 2.3, amb: 0x8a9ed0, ai: 0.8, gnd: 0x6a4a3a },
    { e: 0.02, top: 0x3a3c88, hor: 0xff7d48, glow: 0xff5620, fog: 0xc8785f, sun: 0xff7a38, si: 1.5, amb: 0x7a6aa0, ai: 0.65, gnd: 0x4a3030 },
    { e: -0.07, top: 0x1d2464, hor: 0xa4507a, glow: 0x8a3266, fog: 0x55405e, sun: 0xff5030, si: 0.0, amb: 0x5a5490, ai: 0.5, gnd: 0x2a2030 },
    { e: -0.2, top: 0x0a1036, hor: 0x2c2c62, glow: 0x201a48, fog: 0x1a1d3e, sun: 0x000000, si: 0.0, amb: 0x3a4680, ai: 0.42, gnd: 0x141420 },
    { e: -0.55, top: 0x02040e, hor: 0x0c1834, glow: 0x05081a, fog: 0x0c1328, sun: 0x000000, si: 0.0, amb: 0x34427a, ai: 0.4, gnd: 0x0c0c14 }
  ];
  KEYS.forEach(k => { ['top', 'hor', 'glow', 'fog', 'sun', 'amb', 'gnd'].forEach(n => { k[n] = lin(k[n]); }); });

  function samplePalette(e, out) {
    let a = KEYS[0], b = KEYS[0], t = 0;
    if (e >= KEYS[0].e) { a = b = KEYS[0]; }
    else if (e <= KEYS[KEYS.length - 1].e) { a = b = KEYS[KEYS.length - 1]; }
    else for (let i = 0; i < KEYS.length - 1; i++) {
      if (e <= KEYS[i].e && e >= KEYS[i + 1].e) { a = KEYS[i]; b = KEYS[i + 1]; t = (KEYS[i].e - e) / (KEYS[i].e - KEYS[i + 1].e); break; }
    }
    ['top', 'hor', 'glow', 'fog', 'sun', 'amb', 'gnd'].forEach(n => out[n].copy(a[n]).lerp(b[n], t));
    out.si = lerp(a.si, b.si, t); out.ai = lerp(a.ai, b.ai, t);
    return out;
  }

  PB.createSky = function (scene) {
    const CYCLE = 240; // seconds for a full day
    const sky = { t: 0, cycle: CYCLE, night: 0, elev: 0, hour: 18 };
    const pal = { top: new THREE.Color(), hor: new THREE.Color(), glow: new THREE.Color(), fog: new THREE.Color(), sun: new THREE.Color(), amb: new THREE.Color(), gnd: new THREE.Color(), si: 0, ai: 0 };
    const group = new THREE.Group(); group.name = 'skyGroup'; scene.add(group);

    // --- dome ---
    const domeMat = new THREE.ShaderMaterial({
      uniforms: Object.assign({}, S, { uGlow: { value: new THREE.Color() } }),
      side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
      fragmentShader: `
        uniform vec3 uSkyTop, uSkyHorizon, uGlow, uSunDir, uMoonDir, uSunColor; uniform float uNight, uTime;
        varying vec3 vDir;
        ${PB.GLSL_NOISE}
        void main(){
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 col = mix(uSkyHorizon, uSkyTop, pow(clamp(h,0.,1.), .45));
          col = mix(col, uSkyHorizon*.55, smoothstep(0., -.25, h));
          float sd = max(dot(d, uSunDir), 0.);
          float sunUp = smoothstep(-.12, .02, uSunDir.y);
          col += uGlow * (pow(sd, 6.) * .9 + pow(sd, 48.) * .8) * sunUp * (1. - clamp(h,0.,1.)*.6);
          col += uSunColor * smoothstep(.9993, .9997, sd) * 6. * sunUp;
          float md = max(dot(d, uMoonDir), 0.);
          col += vec3(.45,.55,.8) * pow(md, 90.) * .35 * uNight;
          // milky way
          vec3 mwN = normalize(vec3(.35, .45, .82));
          float band = exp(-pow(dot(d, mwN) * 5., 2.));
          float clouds = fbm(d.xy * 5. + 3.) * fbm(d.zy * 7. - 2.) * 2.2;
          col += vec3(.55,.5,.75) * band * clouds * .22 * uNight * smoothstep(0., .25, h);
          gl_FragColor = vec4(col, 1.);
          #include <tonemapping_fragment>
          #include <encodings_fragment>
        }`
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1400, 48, 24), domeMat);
    dome.renderOrder = -10; dome.frustumCulled = false;
    group.add(dome);

    // --- stars ---
    const N = 3200, pos = new Float32Array(N * 3), size = new Float32Array(N), ph = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const u = Math.random(), v = Math.random() * 0.92 + 0.04;
      const th = u * Math.PI * 2, y = v, r = Math.sqrt(1 - y * y);
      pos[i * 3] = Math.cos(th) * r * 1100; pos[i * 3 + 1] = y * 1100; pos[i * 3 + 2] = Math.sin(th) * r * 1100;
      size[i] = Math.pow(Math.random(), 6) * 7 + 1.2; ph[i] = Math.random() * 6.28;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    sg.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    sg.setAttribute('aPh', new THREE.BufferAttribute(ph, 1));
    const starMat = new THREE.ShaderMaterial({
      uniforms: { uNight: S.uNight, uTime: S.uTime, uPR: { value: 1 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      vertexShader: `attribute float aSize; attribute float aPh; uniform float uTime, uPR; varying float vA;
        void main(){ vec4 mv = modelViewMatrix * vec4(position,1.); gl_Position = projectionMatrix * mv;
          float tw = .65 + .35 * sin(uTime * (1.5 + aPh) + aPh * 7.);
          vA = tw * smoothstep(0., 120., position.y);
          gl_PointSize = aSize * uPR * (.8 + .2 * tw); }`,
      fragmentShader: `uniform float uNight; varying float vA;
        void main(){ vec2 c = gl_PointCoord - .5; float d = length(c); float a = smoothstep(.5, 0., d); a *= a;
          gl_FragColor = vec4(vec3(.85,.9,1.) * a * vA * uNight, 1.); }`
    });
    const stars = new THREE.Points(sg, starMat);
    stars.renderOrder = -9; stars.frustumCulled = false;
    group.add(stars);
    sky.starMat = starMat;

    // --- moon ---
    const moonTex = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#f3efe2'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 70; i++) {
        const x = Math.random() * w, y = Math.random() * h, r = Math.pow(Math.random(), 2) * 30 + 3;
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, 'rgba(150,145,140,.55)'); gr.addColorStop(.8, 'rgba(170,165,160,.25)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
      }
    }, false);
    const moon = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16),
      new THREE.MeshBasicMaterial({ map: moonTex, color: 0xffffff, fog: false, transparent: true, depthWrite: false }));
    moon.scale.setScalar(30); moon.renderOrder = -8;
    group.add(moon);
    const moonGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(190,210,255,1)', 'rgba(120,150,255,0)'), blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true }));
    moonGlow.scale.setScalar(260); moonGlow.renderOrder = -8;
    group.add(moonGlow);
    const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255,220,170,1)', 'rgba(255,120,40,0)'), blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true }));
    sunGlow.scale.setScalar(420); sunGlow.renderOrder = -8;
    group.add(sunGlow);

    // --- clouds ---
    const cloudTex = canvasTex(256, 128, (g, w, h) => {
      for (let i = 0; i < 26; i++) {
        const x = rand(40, w - 40), y = rand(50, h - 30) - (Math.abs(x - w / 2) / w) * 30, r = rand(18, 42);
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
      }
    }, false);
    const clouds = [];
    for (let i = 0; i < 18; i++) {
      const m = new THREE.SpriteMaterial({ map: cloudTex, transparent: true, depthWrite: false, fog: false, opacity: 0.85 });
      const sp = new THREE.Sprite(m);
      const w = rand(160, 360);
      sp.scale.set(w, w * 0.42, 1);
      sp.userData = { x: rand(-700, 500), y: rand(70, 230), z: rand(-900, 300) };
      sp.renderOrder = -7;
      clouds.push(sp); group.add(sp);
    }

    // --- shooting star ---
    const ssGeo = new THREE.BufferGeometry();
    ssGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    ssGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array([1, 1, 1, 0, 0, 0]), 3));
    const shoot = new THREE.Line(ssGeo, new THREE.LineBasicMaterial({ vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }));
    shoot.frustumCulled = false; shoot.visible = false; shoot.renderOrder = -7;
    group.add(shoot);
    const ss = { t: 0, next: 8, life: 0.9, a: new THREE.Vector3(), v: new THREE.Vector3() };

    // --- lights ---
    const key = new THREE.DirectionalLight(0xffffff, 2);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    const sc = key.shadow.camera; sc.left = -16; sc.right = 16; sc.top = 16; sc.bottom = -16; sc.near = 1; sc.far = 160;
    key.shadow.bias = -0.0004; key.shadow.normalBias = 0.03;
    scene.add(key); scene.add(key.target);
    const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.8);
    scene.add(hemi);
    scene.fog = new THREE.FogExp2(0x000000, 0.0042);

    const sunDir = new THREE.Vector3(), moonDir = new THREE.Vector3(), tmp = new THREE.Vector3();
    const cloudCol = new THREE.Color(), WHITE = new THREE.Color(1, 1, 1), MOONLIGHT = new THREE.Color(0.55, 0.66, 1.0);

    sky.update = function (dt, camera, focus, speed) {
      sky.t = (sky.t + dt / CYCLE) % 1;
      const a = Math.PI - 0.17 + sky.t * Math.PI * 2;
      sunDir.set(Math.cos(a), Math.sin(a), -0.42).normalize();
      const ma = a - Math.PI + 0.95;
      moonDir.set(Math.cos(ma), Math.sin(ma), -0.55).normalize();
      if (moonDir.y < 0.05) moonDir.y = lerp(moonDir.y, 0.05, 0.0); // keep as computed
      const e = sunDir.y;
      sky.elev = e;
      samplePalette(e, pal);
      const night = smooth(-0.04, -0.28, e);
      sky.night = night;
      sky.hour = (18.5 + (a - Math.PI) / (Math.PI * 2) * 24 + 48) % 24;

      S.uSunDir.value.copy(sunDir); S.uMoonDir.value.copy(moonDir);
      S.uSkyTop.value.copy(pal.top); S.uSkyHorizon.value.copy(pal.hor);
      S.uSunColor.value.copy(pal.sun);
      domeMat.uniforms.uGlow.value.copy(pal.glow);
      S.uNight.value = night;

      // light: sun by day, moon by night
      const moonI = 0.75 * smooth(-0.06, -0.3, e) * smooth(-0.05, 0.25, moonDir.y);
      const useMoon = pal.si < moonI || e < -0.07;
      const ldir = useMoon ? moonDir : sunDir;
      const li = useMoon ? moonI : pal.si;
      key.color.copy(useMoon ? MOONLIGHT : pal.sun);
      key.intensity = li;
      key.position.copy(focus).addScaledVector(ldir, 80);
      key.target.position.copy(focus);
      S.uLightDir.value.copy(ldir);
      S.uLightColor.value.copy(key.color).multiplyScalar(li);
      hemi.color.copy(pal.amb); hemi.groundColor.copy(pal.gnd); hemi.intensity = pal.ai;
      S.uAmbient.value.copy(pal.amb).multiplyScalar(pal.ai);
      S.uGround.value.copy(pal.gnd).multiplyScalar(pal.ai);
      scene.fog.color.copy(pal.fog).lerp(pal.hor, 0.35);
      scene.fog.density = lerp(0.0036, 0.0055, night);

      // follow camera so the dome is "infinitely" far
      group.position.copy(camera.position);
      moon.position.copy(moonDir).multiplyScalar(900);
      moon.lookAt(0, 0, 0);
      moon.material.opacity = 0.3 + 0.7 * night;
      moon.visible = moonGlow.visible = moonDir.y > -0.04;
      moonGlow.position.copy(moon.position);
      moonGlow.material.opacity = 0.15 + 0.85 * night;
      sunGlow.position.copy(sunDir).multiplyScalar(950);
      sunGlow.material.color.copy(pal.glow);
      sunGlow.material.opacity = smooth(-0.1, 0.03, e) * (1 - smooth(0.3, 0.6, e) * 0.7);

      // clouds drift with parallax, tinted by sky
      const cDay = cloudCol.copy(pal.hor).lerp(WHITE, smooth(0, 0.5, e) * 0.7);
      for (const c of clouds) {
        const u = c.userData;
        u.z += (speed * 0.04 + 1.5) * dt;
        if (u.z > 400) { u.z -= 1300; u.x = rand(-700, 500); }
        c.position.set(u.x, u.y, u.z);
        const rim = Math.max(0, 1 - c.position.clone().normalize().distanceTo(sunDir)) * smooth(-0.1, 0.2, e);
        c.material.color.copy(cDay).multiplyScalar(lerp(1, 0.28, night)).addScalar(rim * 0.25);
        c.material.color.r += rim * 0.4;
        c.material.opacity = lerp(0.85, 0.45, night);
      }

      // shooting stars at night
      ss.next -= dt;
      if (ss.t > 0) {
        ss.t -= dt;
        const k = 1 - ss.t / ss.life;
        const p = shoot.geometry.attributes.position.array;
        const head = tmp.copy(ss.a).addScaledVector(ss.v, k);
        p[0] = head.x; p[1] = head.y; p[2] = head.z;
        const tail = head.clone().addScaledVector(ss.v, -0.25);
        p[3] = tail.x; p[4] = tail.y; p[5] = tail.z;
        shoot.geometry.attributes.position.needsUpdate = true;
        shoot.material.opacity = Math.sin(k * Math.PI) * night;
        if (ss.t <= 0) shoot.visible = false;
      } else if (ss.next < 0 && night > 0.6) {
        ss.next = rand(5, 14); ss.t = ss.life;
        const th = rand(0, Math.PI * 2);
        ss.a.set(Math.cos(th) * 700, rand(250, 600), Math.sin(th) * 700 - 300);
        ss.v.set(rand(-1, 1), rand(-0.6, -0.25), rand(-1, 1)).normalize().multiplyScalar(420);
        shoot.visible = true;
        if (PB.onShootingStar) PB.onShootingStar();
      }
    };

    sky.key = key; sky.hemi = hemi; sky.group = group; sky.sunDir = sunDir; sky.moonDir = moonDir; sky.pal = pal;
    return sky;
  };
})(window.PB);
