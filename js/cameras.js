// Camera rig with five modes. Cinematic mode runs a small shot list with cuts and moves.
(function (PB) {
  const { damp, lerp, rand, noise1, clamp } = PB.U;
  const V = THREE.Vector3;

  PB.createCameras = function (camera, rider) {
    const K = {
      mode: 0,
      names: ['追尾镜头', '侧面镜头', '航拍镜头', '电影运镜', '鹈鹕视角'],
      used: new Set([0]),
      shake: 0
    };
    const pos = new V(0, 3, 8), look = new V(0, 1.4, -6);
    const tPos = new V(), tLook = new V();
    let fov = 60;
    // cinematic director state
    const shots = ['front', 'orbit', 'roadside', 'crane', 'scarf', 'wide', 'wheel'];
    let shot = 0, shotT = 0, shotLen = 6, snap = true;
    const fixed = new V();
    const tmpQ = new THREE.Quaternion(), fwd = new V();

    K.set = function (m) {
      K.mode = (m + 5) % 5; K.used.add(K.mode); snap = true;
      if (K.mode === 3) { shot = (Math.random() * shots.length) | 0; startShot(); }
      document.body.classList.toggle('cine', K.mode === 3);
      const pov = document.getElementById('pov'); if (pov) pov.classList.toggle('on', K.mode === 4);
      if (K.onChange) K.onChange(K.mode);
    };
    K.next = () => K.set(K.mode + 1);

    function startShot() {
      shotT = 0; snap = true;
      const s = shots[shot];
      shotLen = s === 'roadside' ? 99 : rand(5, 8);
      if (s === 'roadside') fixed.set(rand(0, 1) < 0.5 ? 5.6 : -5.5, rand(0.6, 2.2), -45);
    }

    K.update = function (dt, st) {
      // st: {x, y, speed, airborne, t}
      const x = st.x, y = st.y, sp = st.speed;
      let lambda = 5;
      fov = 60;
      camera.near = 0.1;
      switch (K.mode) {
        case 0: // chase
          tPos.set(x * 0.75, 2.5 + y * 0.6, 6.0 + sp * 0.07);
          tLook.set(x * 0.9, 1.45 + y * 0.8, -6);
          fov = 58 + sp * 0.75;
          break;
        case 1: // side: looking across the rider toward the sea
          tPos.set(x + 7.2, 1.9 + y * 0.5, 0.6);
          tLook.set(x - 1.5, 1.35 + y * 0.8, -1.2);
          fov = 48;
          break;
        case 2: // aerial
          tPos.set(x * 0.5 + 7, 17, 11);
          tLook.set(x, 0.5, -9);
          fov = 55; lambda = 3;
          break;
        case 3: { // cinematic
          shotT += dt;
          const s = shots[shot], k = shotT / shotLen;
          lambda = 9;
          if (s === 'front') { tPos.set(x + 1.3, 0.75 + y, -5.2 - Math.sin(shotT * 0.3)); tLook.set(x, 1.5 + y, 0); fov = 42; }
          else if (s === 'orbit') { const a = 0.6 + shotT * 0.42; tPos.set(x + Math.sin(a) * 4.8, 1.7 + y * 0.5, Math.cos(a) * 4.8); tLook.set(x, 1.35 + y, -0.2); fov = 45; }
          else if (s === 'roadside') {
            fixed.z += sp * dt; tPos.copy(fixed); tLook.set(x, 1.3 + y, 0); fov = clamp(30 + Math.abs(fixed.z) * 0.6, 25, 60); lambda = 60;
            if (fixed.z > 10 || (sp < 1 && shotT > 6)) shotLen = 0;
          }
          else if (s === 'crane') { tPos.set(x + lerp(0.5, 4, k), lerp(0.6, 11, k * k), lerp(3.5, 10, k)); tLook.set(x, 1.2 + y, lerp(-1, -8, k)); fov = 50; lambda = 6; }
          else if (s === 'scarf') { tPos.set(x - 0.75, 2.05 + y, 1.05); tLook.set(x - 0.1, 1.6 + y, 0.4); fov = 46; }
          else if (s === 'wide') { tPos.set(x + 11, 0.7, -9 + k * 4); tLook.set(x - 6, 2.6 + y * 0.5, 0); fov = 40; }
          else if (s === 'wheel') { tPos.set(x - 0.75, 0.35, -1.8 + k * 2.2); tLook.set(x, 0.55 + y, 0.4); fov = 55; }
          if (shotT > shotLen) { shot = (shot + 1 + ((Math.random() * 2) | 0)) % shots.length; startShot(); }
          break;
        }
        case 4: { // pelican POV through the sunglasses
          rider.eye.getWorldPosition(tPos);
          rider.headG.getWorldQuaternion(tmpQ);
          fwd.set(0, -0.12, -1).applyQuaternion(tmpQ);
          tLook.copy(tPos).addScaledVector(fwd, 10);
          fov = 74; camera.near = 0.03; lambda = 60;
          break;
        }
      }
      if (snap) { pos.copy(tPos); look.copy(tLook); snap = false; }
      else { pos.x = damp(pos.x, tPos.x, lambda, dt); pos.y = damp(pos.y, tPos.y, lambda, dt); pos.z = damp(pos.z, tPos.z, lambda, dt);
        look.x = damp(look.x, tLook.x, lambda, dt); look.y = damp(look.y, tLook.y, lambda, dt); look.z = damp(look.z, tLook.z, lambda, dt); }
      // shake from speed and landings
      K.shake = Math.max(0, K.shake - dt * 2.5);
      const sh = K.shake * 0.12 + (K.mode === 0 ? Math.max(0, sp - 10) * 0.0025 : 0);
      camera.position.set(pos.x + noise1(st.t * 23) * sh, pos.y + noise1(st.t * 29 + 7) * sh, pos.z);
      camera.lookAt(look);
      if (K.mode === 4) camera.rotateZ(-st.lean * 0.5);
      camera.fov = damp(camera.fov, fov, K.mode === 3 && shotT < 0.05 ? 60 : 4, dt);
      camera.updateProjectionMatrix();
    };
    return K;
  };
})(window.PB);
