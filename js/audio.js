// Everything audible is synthesized live with WebAudio: no sample files.
// Music: Am-F-C-G loop, tempo follows pedalling cadence, layers follow speed, filter darkens at night.
(function (PB) {
  const { clamp, rand, lerp } = PB.U;
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  PB.createAudio = function () {
    const A = { ready: false, muted: false, bpm: 84 };
    let ctx, master, musicBus, musicFilter, sfxBus, revIn, delayIn, noiseBuf;
    let surfGain, surfFilter, windGain, windFilter, tireGain, crickets = 0, gullNext = 4, tickAcc = 0;
    let step = 0, nextTime = 0, timer = null;
    const st = { speed: 0, cadence: 0, night: 0, pedaling: false, airborne: false };

    function impulse(sec, decay) {
      const len = ctx.sampleRate * sec, b = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
      return b;
    }
    function gainNode(v, dest) { const g = ctx.createGain(); g.gain.value = v; if (dest) g.connect(dest); return g; }
    function filt(type, f, q, dest) { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q != null) b.Q.value = q; if (dest) b.connect(dest); return b; }
    function noiseSrc(loop) { const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = !!loop; return s; }
    function env(g, t, a, peak, d, sustain) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + a);
      g.gain.exponentialRampToValueAtTime(Math.max(sustain || 0.0001, 0.0001), t + a + d);
    }

    A.init = function () {
      if (A.ready) { if (ctx.state === 'suspended') ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const nd = noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
      const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4; comp.connect(ctx.destination);
      master = gainNode(A.muted ? 0 : 0.85, comp);
      const rev = ctx.createConvolver(); rev.buffer = impulse(3, 2.6); rev.connect(gainNode(0.32, master));
      revIn = gainNode(1, rev);
      const delay = ctx.createDelay(1.5); delay.delayTime.value = 0.36;
      const fb = gainNode(0.38); const dl = filt('lowpass', 2600, 0.5);
      delay.connect(dl); dl.connect(fb); fb.connect(delay); dl.connect(gainNode(0.35, master));
      delayIn = gainNode(1, delay);
      musicBus = gainNode(0.5, master); musicBus.connect(revIn);
      musicFilter = filt('lowpass', 9000, 0.7, musicBus);
      sfxBus = gainNode(0.9, master); sfxBus.connect(gainNode(0.25, revIn));
      // ambience: surf, wind, tyre hum
      const n1 = noiseSrc(true); surfFilter = filt('lowpass', 500, 0.4); surfGain = gainNode(0.0, master);
      n1.connect(surfFilter); surfFilter.connect(surfGain); n1.start();
      const n2 = noiseSrc(true); windFilter = filt('bandpass', 500, 0.6); windGain = gainNode(0, master);
      n2.connect(windFilter); windFilter.connect(windGain); n2.start(0, 0.7);
      const n3 = noiseSrc(true); const tf = filt('lowpass', 140, 1); tireGain = gainNode(0, master);
      n3.connect(tf); tf.connect(tireGain); n3.start(0, 1.3);
      nextTime = ctx.currentTime + 0.1;
      timer = setInterval(schedule, 25);
      A.ready = true;
    };

    // ---------------- instruments ----------------
    function pad(t, notes, dur, night) {
      for (const m of notes) for (const det of [-7, 7]) {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = det;
        const f = filt('lowpass', night ? 700 : 1500, 0.6); const g = ctx.createGain();
        o.connect(f); f.connect(g); g.connect(musicFilter);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.022, t + 0.5);
        g.gain.setValueAtTime(0.022, t + dur - 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.6);
        o.start(t); o.stop(t + dur + 0.7);
      }
    }
    function bass(t, m, dur) {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = mtof(m);
      const s = ctx.createOscillator(); s.type = 'sine'; s.frequency.value = mtof(m - 12);
      const g = ctx.createGain(); o.connect(g); s.connect(g); g.connect(musicFilter);
      env(g, t, 0.01, 0.2, dur * 0.9); o.start(t); s.start(t); o.stop(t + dur + 0.05); s.stop(t + dur + 0.05);
    }
    function pluck(t, m, vol, night) {
      const o = ctx.createOscillator(); o.type = night ? 'sine' : 'square'; o.frequency.value = mtof(m);
      const f = filt('lowpass', night ? 1800 : 3200, 2); const g = ctx.createGain();
      o.connect(f); f.connect(g); g.connect(musicFilter); g.connect(delayIn);
      env(g, t, 0.004, vol, 0.22); o.start(t); o.stop(t + 0.3);
    }
    function kick(t) {
      const o = ctx.createOscillator(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.13);
      const g = ctx.createGain(); o.connect(g); g.connect(musicBus); env(g, t, 0.003, 0.75, 0.3); o.start(t); o.stop(t + 0.35);
    }
    function snare(t) {
      const n = noiseSrc(); const f = filt('bandpass', 1900, 0.8); const g = ctx.createGain();
      n.connect(f); f.connect(g); g.connect(musicBus); g.connect(revIn); env(g, t, 0.002, 0.28, 0.16); n.start(t, rand(0, 1.5)); n.stop(t + 0.2);
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = 190; const g2 = ctx.createGain();
      o.connect(g2); g2.connect(musicBus); env(g2, t, 0.002, 0.15, 0.08); o.start(t); o.stop(t + 0.1);
    }
    function hat(t, open, vol) {
      const n = noiseSrc(); const f = filt('highpass', 7500, 0.7); const g = ctx.createGain();
      n.connect(f); f.connect(g); g.connect(musicBus); env(g, t, 0.001, vol, open ? 0.22 : 0.045); n.start(t, rand(0, 1.5)); n.stop(t + 0.3);
    }

    // ---------------- sequencer ----------------
    const CHORDS = [
      { root: 45, notes: [57, 60, 64] },  // Am
      { root: 41, notes: [53, 57, 60] },  // F
      { root: 48, notes: [55, 60, 64] },  // C
      { root: 43, notes: [55, 59, 62] }   // G
    ];
    const PENTA = [69, 72, 74, 76, 79, 81, 84, 86];
    const ARP = [0, 2, 4, 2, 5, 4, 2, 1, 0, 3, 5, 7, 6, 4, 3, 1];
    function schedule() {
      if (!ctx) return;
      // tempo follows cadence (rpm) with a floor for coasting
      const target = st.cadence > 12 ? clamp(st.cadence * 1.1 + 6, 84, 152) : 82;
      A.bpm = lerp(A.bpm, target, 0.02);
      const stepDur = 60 / A.bpm / 4;
      while (nextTime < ctx.currentTime + 0.12) {
        playStep(step, nextTime, stepDur);
        nextTime += stepDur; step = (step + 1) % 64;
      }
    }
    function playStep(s, t, sd) {
      const energy = clamp(st.speed / 15, 0, 1), night = st.night > 0.5;
      const bar = (s / 16) | 0, b = s % 16, ch = CHORDS[bar];
      if (b === 0) pad(t, ch.notes, sd * 16, night);
      // bass
      if (energy > 0.08) { if (b % 2 === 0) bass(t, ch.root + (b % 8 === 6 ? 12 : 0), sd * 1.6); }
      else if (b === 0) bass(t, ch.root, sd * 12);
      // arp
      const arpEvery = energy > 0.55 ? 1 : energy > 0.15 ? 2 : 4;
      if (b % arpEvery === 0) {
        const idx = ARP[(b + bar * 3) % 16];
        let m = PENTA[idx];
        if (ch.root === 41 && m === 76) m = 77; // flavour note over F
        pluck(t, m - (night ? 12 : 0), night ? 0.06 : 0.045, night);
      }
      // drums
      if (st.airborne) return; // a breath of silence while airborne
      if (energy > 0.12 && (b === 0 || b === 8 || (energy > 0.6 && (b === 4 || b === 12)))) kick(t);
      if (energy > 0.35 && (b === 4 || b === 12)) snare(t);
      if (energy > 0.22 && b % 2 === 0) hat(t, b % 8 === 6, 0.07);
      if (energy > 0.75 && b % 2 === 1) hat(t, false, 0.035);
    }

    // ---------------- SFX ----------------
    function tone(t, type, f0, f1, dur, vol, dest) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t);
      if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      const g = ctx.createGain(); o.connect(g); g.connect(dest || sfxBus); env(g, t, 0.005, vol, dur); o.start(t); o.stop(t + dur + 0.05);
    }
    function whoosh(t, f0, f1, dur, vol) {
      const n = noiseSrc(); const f = filt('bandpass', f0, 1.2); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
      const g = ctx.createGain(); n.connect(f); f.connect(g); g.connect(sfxBus); env(g, t, dur * 0.3, vol, dur * 0.7); n.start(t, rand(0, 1)); n.stop(t + dur + 0.05);
    }
    A.sfx = function (name, opt) {
      if (!A.ready) return;
      const t = ctx.currentTime + 0.005;
      switch (name) {
        case 'catch': {
          const base = 76 + ((opt && opt.combo) || 0) % 5 * 2;
          [0, 4, 7].forEach((iv, i) => tone(t + i * 0.055, 'triangle', mtof(base + iv), null, 0.18, 0.18));
          tone(t + 0.12, 'sine', 220, 70, 0.22, 0.25); // gulp
          break;
        }
        case 'golden':
          [0, 4, 7, 11, 12, 16, 19].forEach((iv, i) => tone(t + i * 0.045, 'sine', mtof(84 + iv), null, 0.35, 0.12, revIn));
          tone(t, 'triangle', mtof(72), null, 0.5, 0.15);
          break;
        case 'jump': tone(t, 'sine', 260, 620, 0.18, 0.2); whoosh(t, 600, 2400, 0.3, 0.12); break;
        case 'land': tone(t, 'sine', 110, 40, 0.18, 0.4); whoosh(t, 800, 300, 0.15, 0.1); break;
        case 'wings': whoosh(t, 300, 1200, 0.45, 0.14); break;
        case 'crab': tone(t, 'square', 220, 70, 0.25, 0.14); tone(t + 0.08, 'square', 160, 60, 0.2, 0.1); break;
        case 'crabJump': tone(t, 'triangle', mtof(88), mtof(93), 0.12, 0.12); break;
        case 'splash': whoosh(t, 1800, 500, 0.35, 0.09); break;
        case 'click': tone(t, 'square', 1800, null, 0.03, 0.04); break;
        case 'achievement': {
          const ch = [72, 76, 79, 83, 84];
          ch.forEach((m, i) => { // FM bell
            const tt = t + i * 0.09, car = ctx.createOscillator(), mod = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain();
            car.frequency.value = mtof(m); mod.frequency.value = mtof(m) * 3.5; mg.gain.value = mtof(m) * 1.2;
            mod.connect(mg); mg.connect(car.frequency); car.connect(g); g.connect(sfxBus); g.connect(revIn);
            env(g, tt, 0.004, 0.14, 1.4); car.start(tt); mod.start(tt); car.stop(tt + 1.5); mod.stop(tt + 1.5);
          });
          break;
        }
        case 'star': tone(t, 'sine', 2600, 900, 0.9, 0.05, revIn); break;
      }
    };
    function gull(t) {
      for (let i = 0; i < 3; i++) {
        const tt = t + i * 0.28, o = ctx.createOscillator(), lfo = ctx.createOscillator(), lg = ctx.createGain(), g = ctx.createGain();
        o.type = 'sawtooth'; o.frequency.setValueAtTime(1500, tt); o.frequency.exponentialRampToValueAtTime(950, tt + 0.22);
        lfo.frequency.value = 28; lg.gain.value = 60; lfo.connect(lg); lg.connect(o.frequency);
        const f = filt('bandpass', 1800, 3); o.connect(f); f.connect(g); g.connect(sfxBus); g.connect(revIn);
        env(g, tt, 0.02, 0.025, 0.22); o.start(tt); lfo.start(tt); o.stop(tt + 0.3); lfo.stop(tt + 0.3);
      }
    }
    function cricket(t) {
      for (let i = 0; i < 4; i++) tone(t + i * 0.05, 'sine', 4300 + rand(-80, 80), null, 0.03, 0.012);
    }

    A.update = function (dt, s) {
      Object.assign(st, s);
      if (!A.ready) return;
      const now = ctx.currentTime;
      const sp = st.speed;
      // surf swells every few seconds, louder by day
      const swell = 0.5 + 0.5 * Math.sin(now * 0.75) * Math.sin(now * 0.31 + 1);
      surfGain.gain.setTargetAtTime(0.05 + swell * 0.09, now, 0.2);
      surfFilter.frequency.setTargetAtTime(350 + swell * 700, now, 0.2);
      windGain.gain.setTargetAtTime(Math.min(0.22, sp * sp * 0.0009), now, 0.15);
      windFilter.frequency.setTargetAtTime(300 + sp * 70, now, 0.2);
      tireGain.gain.setTargetAtTime(st.airborne ? 0 : Math.min(0.25, sp * 0.02), now, 0.05);
      musicFilter.frequency.setTargetAtTime(lerp(9000, 2400, st.night), now, 0.5);
      // freewheel ticks when coasting
      if (!st.pedaling && sp > 1 && !st.airborne) {
        tickAcc += dt * sp * 4;
        while (tickAcc > 1) { tickAcc -= 1; tone(now + Math.random() * 0.02, 'square', 3200, null, 0.008, 0.02); }
      }
      // wildlife
      gullNext -= dt;
      if (gullNext < 0) { gullNext = rand(7, 16); if (st.night < 0.5) gull(now + 0.05); }
      crickets -= dt;
      if (crickets < 0) { crickets = rand(0.25, 0.9); if (st.night > 0.6) cricket(now + 0.02); }
    };
    A.setMuted = function (m) {
      A.muted = m;
      if (A.ready) master.gain.setTargetAtTime(m ? 0 : 0.85, ctx.currentTime, 0.05);
    };
    return A;
  };
})(window.PB);
