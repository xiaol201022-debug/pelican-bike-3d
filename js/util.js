// Shared helpers, constants and GLSL snippets. Everything hangs off window.PB.
window.PB = window.PB || {};
(function (PB) {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
  const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];

  // 1D value noise for CPU-side wobble (gusts, camera shake)
  const perm = new Float32Array(512);
  for (let i = 0; i < 512; i++) perm[i] = Math.random();
  function noise1(x) {
    const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
    return lerp(perm[i & 511], perm[(i + 1) & 511], u) * 2 - 1;
  }

  function canvasTex(w, h, draw, repeat) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    if (repeat !== false) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    t.encoding = THREE.sRGBEncoding;
    return t;
  }

  function glowTexture(inner, outer) {
    return canvasTex(128, 128, (g, w, h) => {
      const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, inner); gr.addColorStop(0.25, inner.replace(/[\d.]+\)$/, '0.55)'));
      gr.addColorStop(1, outer);
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    }, false);
  }

  // place a unit-height Y-cylinder between two points
  const _up = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3();
  function placeBetween(mesh, a, b) {
    _d.subVectors(b, a);
    const len = _d.length();
    mesh.position.copy(a).addScaledVector(_d, 0.5);
    mesh.quaternion.setFromUnitVectors(_up, _d.normalize());
    mesh.scale.set(1, len, 1);
  }

  // colour from sRGB hex to linear (for shader uniforms)
  const lin = (hex) => new THREE.Color(hex).convertSRGBToLinear();

  // Uniforms shared by reference across all custom shaders (light, time, scroll)
  PB.shared = {
    uTime: { value: 0 },
    uScroll: { value: 0 },          // metres travelled; world patterns use (z - uScroll)
    uLightDir: { value: new THREE.Vector3(0, 1, 0) },
    uLightColor: { value: new THREE.Color(1, 1, 1) },
    uAmbient: { value: new THREE.Color(0.3, 0.3, 0.4) },
    uGround: { value: new THREE.Color(0.1, 0.08, 0.06) },
    uNight: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
    uSkyHorizon: { value: new THREE.Color() },
    uSkyTop: { value: new THREE.Color() },
    uSunColor: { value: new THREE.Color() }
  };

  PB.GLSL_NOISE = /* glsl */`
    float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.-2.*f);
      return mix(mix(hash12(i), hash12(i+vec2(1,0)), u.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), u.x), u.y); }
    float fbm(vec2 p){ float a = .5, s = 0.; for(int i=0;i<5;i++){ s += a*vnoise(p); p = p*2.03 + 17.1; a *= .5; } return s; }
  `;

  PB.GLSL_LIGHT = /* glsl */`
    uniform vec3 uLightDir; uniform vec3 uLightColor; uniform vec3 uAmbient; uniform vec3 uGround;
    vec3 shade(vec3 albedo, vec3 n){
      float d = max(dot(n, normalize(uLightDir)), 0.);
      vec3 amb = mix(uGround, uAmbient, n.y*.5+.5);
      return albedo * (amb + uLightColor * d);
    }
  `;

  // Build a fog-aware ShaderMaterial whose shared uniforms stay linked by reference
  PB.makeShader = function (opts) {
    const uniforms = Object.assign(THREE.UniformsUtils.clone(THREE.UniformsLib.fog), PB.shared, opts.uniforms || {});
    return new THREE.ShaderMaterial(Object.assign({
      uniforms, fog: true, lights: false
    }, opts, { uniforms }));
  };

  PB.U = { clamp, lerp, smooth, damp, rand, pick, noise1, canvasTex, glowTexture, placeBetween, lin };

  // Road layout constants (metres). Rider travels toward -Z; ocean on -X, hills on +X.
  PB.C = {
    LANES: [-2.2, 0, 2.2],
    ROAD_HALF: 3.8,
    SHORE_X: -17,
    WHEEL_R: 0.34,
    SPAN: 260 // recycle length for roadside props
  };
})(window.PB);
