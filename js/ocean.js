// Ocean (GPU waves + shore breakers), beach with swash, road, and GPU-displaced hills.
// All patterns are sampled at (z - uScroll) so the world appears to slide past the rider.
(function (PB) {
  const { canvasTex, rand } = PB.U;
  const C = PB.C;

  PB.createTerrain = function (scene) {
    const T = {};

    // ---------- OCEAN ----------
    const oceanW = 640, oceanL = 900;
    const og = new THREE.PlaneGeometry(oceanW, oceanL, 220, 260);
    og.rotateX(-Math.PI / 2);
    og.translate(C.SHORE_X + 6 - oceanW / 2, 0, -oceanL / 2 + 150);
    const oceanMat = PB.makeShader({
      uniforms: { uDeep: { value: PB.U.lin(0x0a3a5c) }, uShallow: { value: PB.U.lin(0x2aa3a8) }, uShore: { value: C.SHORE_X } },
      vertexShader: `
        uniform float uTime, uScroll, uShore;
        varying vec3 vW; varying vec3 vN; varying float vCrest;
        #include <fog_pars_vertex>
        vec3 wave(vec2 p, vec2 dir, float k, float a, float sp, inout vec3 dx, inout vec3 dz){
          float ph = dot(dir, p) * k - uTime * sp;
          float s = sin(ph), c = cos(ph);
          dx += vec3(0., a * k * dir.x * c, 0.);
          dz += vec3(0., a * k * dir.y * c, 0.);
          return vec3(-dir.x * a * .6 * c, a * s, -dir.y * a * .6 * c);
        }
        void main(){
          vec3 p = position;
          vec2 q = vec2(p.x, p.z - uScroll);
          float shoreD = uShore - p.x;              // >0 in water
          float amp = smoothstep(0., 30., shoreD) * .85 + .15;
          float far = 1. - smoothstep(150., 420., length(p.xz)) * .7;
          vec3 dx = vec3(0.), dz = vec3(0.);
          vec3 o = vec3(0.);
          o += wave(q, normalize(vec2(1., .25)), .16, .38 * amp, 1.3, dx, dz);
          o += wave(q, normalize(vec2(.8, -.6)), .27, .18 * amp, 1.7, dx, dz);
          o += wave(q, normalize(vec2(.3, 1.)), .45, .09 * far, 2.3, dx, dz);
          o += wave(q, normalize(vec2(-.6, .8)), .9, .04 * far, 3.1, dx, dz);
          o += wave(q, normalize(vec2(1., -.1)), 1.7, .018 * far, 4.2, dx, dz);
          p += o * far;
          vCrest = o.y;
          vN = normalize(vec3(-dx.y, 1., -dz.y));
          vec4 wp = modelMatrix * vec4(p, 1.);
          vW = wp.xyz;
          vec4 mvPosition = viewMatrix * wp;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `
        uniform float uTime, uScroll, uShore, uNight;
        uniform vec3 uDeep, uShallow, uSkyHorizon, uSkyTop, uLightDir, uLightColor, uSunDir, uMoonDir, uAmbient;
        varying vec3 vW; varying vec3 vN; varying float vCrest;
        #include <fog_pars_fragment>
        ${PB.GLSL_NOISE}
        void main(){
          vec2 q = vec2(vW.x, vW.z - uScroll);
          // micro-normal detail
          float e = .35;
          float n0 = fbm(q * .55 + vec2(uTime * .25, uTime * .1));
          float n1 = fbm((q + vec2(e, 0.)) * .55 + vec2(uTime * .25, uTime * .1));
          float n2 = fbm((q + vec2(0., e)) * .55 + vec2(uTime * .25, uTime * .1));
          vec3 N = normalize(vN + vec3(n0 - n1, 0., n0 - n2) * 1.2);
          vec3 V = normalize(cameraPosition - vW);
          float fres = .03 + .97 * pow(1. - max(dot(N, V), 0.), 5.);
          float shoreD = uShore - vW.x;
          vec3 water = mix(uShallow, uDeep, smoothstep(2., 40., shoreD));
          water *= (uAmbient * 1.2 + uLightColor * .35 * max(dot(N, uLightDir), 0.));
          vec3 R = reflect(-V, N);
          vec3 skyR = mix(uSkyHorizon, uSkyTop, pow(clamp(R.y, 0., 1.), .5));
          vec3 col = mix(water, skyR, fres);
          // sun & moon glitter
          float sunUp = smoothstep(-.05, .05, uSunDir.y);
          col += uLightColor * pow(max(dot(R, uSunDir), 0.), 320.) * 9. * sunUp;
          col += uLightColor * pow(max(dot(R, uSunDir), 0.), 18.) * .25 * sunUp;
          float moonUp = smoothstep(0., .1, uMoonDir.y) * uNight;
          col += vec3(.75,.82,1.) * pow(max(dot(R, uMoonDir), 0.), 220.) * 6. * moonUp;
          col += vec3(.6,.7,1.) * pow(max(dot(R, uMoonDir), 0.), 22.) * .18 * moonUp;
          // breaking surf: crest lines marching toward the shore
          float nz = vnoise(q * vec2(.15, .08));
          float ph = shoreD * .55 + uTime * 1.6 + nz * 3.;
          float line = smoothstep(.82, .97, sin(ph)) * smoothstep(30., 6., shoreD) * smoothstep(-.5, 1.5, shoreD);
          float foam = line * (.6 + .4 * fbm(q * 1.6 + uTime * .3));
          foam += smoothstep(2.2, 0., shoreD) * (.55 + .45 * fbm(q * 2. - uTime * .4));
          foam += smoothstep(.15, .45, vCrest) * .35 * fbm(q * 2.5);
          vec3 foamCol = (uAmbient * 1.4 + uLightColor * .6) * vec3(.95, .97, 1.);
          col = mix(col, foamCol, clamp(foam, 0., 1.));
          gl_FragColor = vec4(col, 1.);
          #include <tonemapping_fragment>
          #include <encodings_fragment>
          #include <fog_fragment>
        }`
    });
    const ocean = new THREE.Mesh(og, oceanMat);
    ocean.frustumCulled = false;
    ocean.position.y = -0.72;
    scene.add(ocean);
    T.ocean = ocean;

    // ---------- BEACH (sloped sand + swash) ----------
    const bx0 = C.SHORE_X - 8, bx1 = -C.ROAD_HALF;
    const bg = new THREE.PlaneGeometry(bx1 - bx0, oceanL, 40, 200);
    bg.rotateX(-Math.PI / 2);
    bg.translate((bx0 + bx1) / 2, 0, -oceanL / 2 + 150);
    const bpos = bg.attributes.position;
    for (let i = 0; i < bpos.count; i++) {
      const x = bpos.getX(i);
      const t = (x - bx0) / (bx1 - bx0);
      bpos.setY(i, -1.25 + t * 1.3 - Math.pow(1 - t, 6) * 0.3);
    }
    bg.computeVertexNormals();
    const beachMat = PB.makeShader({
      uniforms: { uShore: { value: C.SHORE_X } },
      vertexShader: `varying vec3 vW; varying vec3 vN;
        #include <fog_pars_vertex>
        void main(){ vec4 wp = modelMatrix * vec4(position,1.); vW = wp.xyz; vN = normal;
          vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `
        uniform float uTime, uScroll, uShore; varying vec3 vW; varying vec3 vN;
        #include <fog_pars_fragment>
        ${PB.GLSL_NOISE}
        ${PB.GLSL_LIGHT}
        void main(){
          vec2 q = vec2(vW.x, vW.z - uScroll);
          float g = fbm(q * 3.) * .5 + vnoise(q * 40.) * .25;
          vec3 sand = mix(vec3(.62,.48,.3), vec3(.78,.64,.42), g);
          // swash: thin sheet of water running up and down the sand
          float run = 2.2 + 2.6 * (.5 + .5 * sin(uTime * .8 + vnoise(q * vec2(.0,.07)) * 4.));
          run += (vnoise(vec2(q.y * .09, uTime * .2)) - .5) * 2.;
          float edge = uShore + run;
          float wet = smoothstep(edge + 3.5, edge - .5, vW.x);
          sand = mix(sand, sand * .55, wet);
          float sheet = smoothstep(edge + .15, edge - .3, vW.x);
          vec3 col = shade(sand, normalize(vN));
          vec3 waterCol = shade(vec3(.35,.6,.62), vec3(0.,1.,0.));
          col = mix(col, waterCol, sheet * .55);
          float lip = smoothstep(.5, 0., abs(vW.x - edge)) * (.6 + .4 * fbm(q * 3. + uTime));
          col = mix(col, shade(vec3(.95), vec3(0.,1.,0.)) * 1.1, clamp(lip, 0., 1.));
          // shells & pebbles
          float sp = step(.985, hash12(floor(q * 6.)));
          col = mix(col, shade(vec3(.9,.86,.8), vec3(0.,1.,0.)), sp * .6 * (1. - sheet));
          gl_FragColor = vec4(col, 1.);
          #include <tonemapping_fragment>
          #include <encodings_fragment>
          #include <fog_fragment>
        }`
    });
    const beach = new THREE.Mesh(bg, beachMat);
    beach.frustumCulled = false;
    scene.add(beach);

    // ---------- ROAD ----------
    const TILE = 24;
    const roadTex = canvasTex(256, 768, (g, w, h) => {
      g.fillStyle = '#3a3a40'; g.fillRect(0, 0, w, h);
      const img = g.getImageData(0, 0, w, h);
      for (let i = 0; i < img.data.length; i += 4) {
        const n = (Math.random() - 0.5) * 38;
        img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n + 2;
      }
      g.putImageData(img, 0, 0);
      for (let i = 0; i < 26; i++) { // tar patches
        g.fillStyle = `rgba(20,20,24,${rand(0.08, 0.22)})`;
        g.beginPath(); g.ellipse(rand(0, w), rand(0, h), rand(8, 40), rand(20, 90), rand(0, 3), 0, 7); g.fill();
      }
      const px = (x) => (x / 8 + 0.5) * w; // road is 8m wide
      g.fillStyle = '#f2efe6';
      g.fillRect(px(-3.45) - 3, 0, 6, h); g.fillRect(px(3.45) - 3, 0, 6, h);
      g.fillStyle = '#f5f0e0';
      for (const lx of [-1.1, 1.1]) for (let y = 0; y < h; y += h / 3) g.fillRect(px(lx) - 3, y, 6, h / 6);
      // little fish stencils on the shoulder
      g.font = '40px serif'; g.globalAlpha = 0.35; g.fillText('🐟', px(0) - 20, h * 0.92); g.globalAlpha = 1;
    });
    roadTex.repeat.set(1, oceanL / TILE);
    const roadMat = new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.82, metalness: 0.0 });
    const road = new THREE.Mesh(new THREE.PlaneGeometry(8, oceanL), roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0.01, -oceanL / 2 + 150);
    road.receiveShadow = true;
    scene.add(road);
    // curbs
    const curbMat = new THREE.MeshStandardMaterial({ color: 0xbdb6a8, roughness: 0.9 });
    for (const sx of [-1, 1]) {
      const curb = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.14, oceanL), curbMat);
      curb.position.set(sx * 4.05, 0.07, -oceanL / 2 + 150);
      curb.receiveShadow = true;
      scene.add(curb);
    }
    T.roadTex = roadTex; T.TILE = TILE;

    // ---------- HILLS (right side) ----------
    const hx0 = 4.1, hx1 = 300;
    const hg = new THREE.PlaneGeometry(hx1 - hx0, oceanL, 110, 230);
    hg.rotateX(-Math.PI / 2);
    hg.translate((hx0 + hx1) / 2, 0, -oceanL / 2 + 150);
    const hillMat = PB.makeShader({
      vertexShader: `
        uniform float uScroll; varying vec3 vW; varying vec3 vN; varying float vH;
        #include <fog_pars_vertex>
        ${PB.GLSL_NOISE}
        float H(vec2 p){
          float x = p.x;
          float rise = smoothstep(4.5, 30., x);
          float big = fbm(vec2(x, p.y) * .011) * 70. * smoothstep(20., 120., x);
          float mid = fbm(vec2(x, p.y) * .045 + 7.) * 9.;
          return rise * (mid + big + 3.) + smoothstep(4.2, 8., x) * .4;
        }
        void main(){
          vec3 p = position;
          vec2 q = vec2(p.x, p.z - uScroll);
          float h = H(q);
          float e = 1.2;
          float hx = H(q + vec2(e, 0.)), hz = H(q + vec2(0., e));
          vN = normalize(vec3(h - hx, e, h - hz));
          p.y = h; vH = h;
          vec4 wp = modelMatrix * vec4(p,1.); vW = wp.xyz;
          vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `
        uniform float uScroll, uNight; varying vec3 vW; varying vec3 vN; varying float vH;
        #include <fog_pars_fragment>
        ${PB.GLSL_NOISE}
        ${PB.GLSL_LIGHT}
        void main(){
          vec2 q = vec2(vW.x, vW.z - uScroll);
          float n = fbm(q * .25);
          vec3 grass = mix(vec3(.2,.34,.12), vec3(.42,.5,.2), n);
          grass = mix(grass, vec3(.5,.45,.3), smoothstep(.35, .8, 1. - vN.y));   // rocky slopes
          grass = mix(grass, vec3(.34,.42,.24), smoothstep(30., 60., vH) * .6);
          float flowers = step(.992, hash12(floor(q * 3.))) * (1. - smoothstep(8., 20., vW.x - 4.));
          grass = mix(grass, vec3(.95,.8,.3), flowers);
          vec3 col = shade(grass, normalize(vN));
          // fireflies twinkle on the hills at night
          float ff = step(.997, hash12(floor(q * 1.3))) * uNight * (.5 + .5 * sin(uScroll * .0 + vW.x * 3. + q.y));
          col += vec3(.9,1.,.4) * ff * 1.4;
          gl_FragColor = vec4(col, 1.);
          #include <tonemapping_fragment>
          #include <encodings_fragment>
          #include <fog_fragment>
        }`
    });
    const hills = new THREE.Mesh(hg, hillMat);
    hills.frustumCulled = false;
    scene.add(hills);

    T.update = function (dist) {
      roadTex.offset.y = (dist / TILE) % 1;
    };
    return T;
  };
})(window.PB);
