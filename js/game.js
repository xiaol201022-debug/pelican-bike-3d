// Main: renderer + post, game state, input, physics, autopilot, achievements, HUD, adaptive quality.
(function (PB) {
  const { clamp, lerp, damp, smooth, rand } = PB.U;
  const LANES = PB.C.LANES;
  const $ = (id) => document.getElementById(id);

  // ---------------- renderer / scene ----------------
  const canvas = $('scene');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 2600);

  const sky = PB.createSky(scene);
  const terrain = PB.createTerrain(scene);
  const props = PB.createProps(scene);
  const rider = PB.createRider(scene);
  const scarf = PB.createScarf(scene, rider);
  const fish = PB.createFish(scene);
  const cams = PB.createCameras(camera, rider);
  const audio = PB.createAudio();

  // dynamic environment map: a cube camera that sees only the sky (layer 1)
  sky.group.traverse(o => o.layers.enable(1));
  const cubeRT = new THREE.WebGLCubeRenderTarget(128, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, encoding: THREE.sRGBEncoding });
  const cubeCam = new THREE.CubeCamera(1, 3000, cubeRT);
  cubeCam.children.forEach(c => c.layers.set(1));
  scene.add(cubeCam);
  rider.setEnvMap(cubeRT.texture);
  fish.setEnvMap(cubeRT.texture);
  let envTimer = 0;

  // post-processing (bloom) when the example scripts loaded
  let composer = null, bloom = null;
  const hasPost = !!(THREE.EffectComposer && THREE.UnrealBloomPass && THREE.RenderPass && THREE.ShaderPass);
  if (hasPost) {
    composer = new THREE.EffectComposer(renderer);
    composer.addPass(new THREE.RenderPass(scene, camera));
    bloom = new THREE.UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.45, 0.82);
    composer.addPass(bloom);
    composer.addPass(new THREE.ShaderPass({
      uniforms: { tDiffuse: { value: null } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
      fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv); gl_FragColor = LinearTosRGB(c); }'
    }));
  }

  // ---------------- state ----------------
  const G = {
    started: false, time: 0,
    speed: 7, dist: 0, lane: 1, x: 0, y: 0, vy: 0, airborne: false, airTime: 0,
    pitch: 0, lean: 0, wings: 0, wheelie: 0, pedaling: true, latVel: 0,
    fishCount: 0, combo: 0, comboTimer: 0, maxSpeed: 0,
    auto: true, idle: 99, autoWing: 0, autoNext: 8,
    usedNight: false, sawNight: false
  };

  // ---------------- input ----------------
  const keys = { up: false, down: false, left: false, right: false, jump: false, wing: false };
  const pressed = new Set();
  function userActed() { G.idle = 0; if (G.auto) { G.auto = false; updateAutoChip(); } }
  function laneShift(d) { G.lane = clamp(G.lane + d, 0, 2); }
  function doJump() {
    if (!G.airborne) { G.vy = 6.9; G.airborne = true; G.airTime = 0; audio.sfx('jump'); unlock('jump'); }
  }
  const KEYMAP = { KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', Space: 'jump', KeyT: 'wing' };
  addEventListener('keydown', (e) => {
    if (!G.started) { if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); start(); } return; }
    const k = KEYMAP[e.code];
    if (k) {
      e.preventDefault();
      userActed();
      if (!keys[k]) {
        if (k === 'left') laneShift(-1);
        if (k === 'right') laneShift(1);
        if (k === 'jump') doJump();
        if (k === 'wing') audio.sfx('wings');
      }
      keys[k] = true;
      return;
    }
    if (e.repeat) return;
    if (e.code === 'KeyC') { cams.next(); audio.sfx('click'); }
    else if (/^Digit[1-5]$/.test(e.code)) { cams.set(+e.code.slice(5) - 1); audio.sfx('click'); }
    else if (e.code === 'KeyM') toggleMute();
    else if (e.code === 'KeyH') toggleAch();
    else if (e.code === 'Escape') { $('achPanel').hidden = true; }
  });
  addEventListener('keyup', (e) => { const k = KEYMAP[e.code]; if (k) keys[k] = false; });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

  // touch buttons
  const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  if (isTouch) document.body.classList.add('touch');
  document.querySelectorAll('.tb').forEach(b => {
    const k = b.dataset.k;
    const down = (e) => {
      e.preventDefault(); b.classList.add('on');
      if (!G.started) start();
      if (k === 'cam') { cams.next(); return; }
      if (k === 'ach') { toggleAch(); return; }
      userActed();
      if (k === 'left') laneShift(-1);
      else if (k === 'right') laneShift(1);
      else if (k === 'jump') doJump();
      else { if (k === 'wing' && !keys.wing) audio.sfx('wings'); keys[k] = true; }
    };
    const up = (e) => { e.preventDefault(); b.classList.remove('on'); if (keys[k] !== undefined) keys[k] = false; };
    b.addEventListener('pointerdown', down);
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up);
  });
  // swipe on the canvas: left/right = lane, up = jump
  let sw = null;
  canvas.addEventListener('pointerdown', (e) => { sw = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  canvas.addEventListener('pointerup', (e) => {
    if (!sw || !G.started) return;
    const dx = e.clientX - sw.x, dy = e.clientY - sw.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) > 40 && performance.now() - sw.t < 600) {
      userActed();
      if (Math.abs(dx) > Math.abs(dy)) laneShift(dx > 0 ? 1 : -1); else if (dy < 0) doJump();
    }
    sw = null;
  });

  $('btnCam').onclick = () => { cams.next(); audio.sfx('click'); };
  $('btnMute').onclick = toggleMute;
  $('btnAch').onclick = toggleAch;
  $('achClose').onclick = toggleAch;
  $('go').onclick = start;
  function toggleMute() { audio.setMuted(!audio.muted); $('btnMute').textContent = audio.muted ? '🔇' : '🔊'; }
  function toggleAch() { renderAch(); $('achPanel').hidden = !$('achPanel').hidden; }
  function start() {
    if (G.started) return;
    G.started = true; G.auto = false; G.idle = 0;
    $('start').hidden = true;
    audio.init();
    updateAutoChip();
  }
  function updateAutoChip() { $('autoChip').hidden = !G.auto || !G.started; }
  cams.onChange = (m) => {
    $('camName').textContent = cams.names[m];
    if (cams.used.size >= 5) unlock('director');
  };

  PB.onShootingStar = () => audio.sfx('star');

  // expose for the second half of this file
  PB.G = G; PB.game = { renderer, scene, camera, sky, terrain, props, rider, scarf, fish, cams, audio, composer, bloom, keys, cubeCam, doJump, laneShift, updateAutoChip };
  PB.game.envTick = (dt) => {
    envTimer -= dt;
    if (envTimer <= 0) { envTimer = 1.2; cubeCam.position.set(G.x, 2, 0); cubeCam.update(renderer, scene); }
  };

  // filled in below
  function unlock(id) { PB.unlock && PB.unlock(id); }
  function renderAch() { PB.renderAch && PB.renderAch(); }
})(window.PB);
