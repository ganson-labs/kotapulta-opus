(() => {
  // src/audio.js
  var STORE_KEY = "kotapulta.muted";
  var SFX_LEVEL = 0.8;
  var MUSIC_LEVEL = 0.44;
  var VERB_LEVEL = 0.5;
  var XFADE = 1.2;
  var LOOKAHEAD = 0.2;
  var TICK_MS = 25;
  var MAX_VOICES = 120;
  var MAX_IMPACTS = 10;
  var MAX_BREAKS = 6;
  var LV = {
    stretch: 0.92,
    launch: 1.47,
    meow: 0.33,
    i_cardboard: 1.55,
    i_wood: 0.99,
    i_ceramic: 0.84,
    i_yarn: 1.29,
    i_cat: 1.12,
    i_ground: 0.66,
    i_fish: 1.24,
    b_cardboard: 3,
    b_wood: 1.42,
    b_ceramic: 1.83,
    b_yarn: 0.92,
    fish: 2.9,
    snore: 0.275,
    wake: 0.75,
    dash: 2.98,
    pound: 0.57,
    boom: 0.78,
    split: 2.05,
    ui: 0.86,
    star: 1,
    win: 0.66,
    lose: 1.04,
    tick: 0.68,
    wipe: 1.51,
    scribble: 1.36,
    slowmo: 0.43
  };
  var TRIM_COMP = 0.7456;
  var TRIM_LIM = 0.8365;
  var clamp = (x, a, b) => x < a ? a : x > b ? b : x;
  var num = (x, d) => {
    const v = typeof x === "number" ? x : parseFloat(x);
    return Number.isFinite(v) ? v : d;
  };
  var c01 = (x, d = 0) => clamp(num(x, d), 0, 1);
  var cpan = (x) => clamp(num(x, 0), -1, 1);
  var mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  var noop = () => {
  };
  var perfNow = () => typeof performance !== "undefined" ? performance.now() : Date.now();
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function() {
      a = a + 1831565813 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function readMuted() {
    try {
      return typeof localStorage !== "undefined" && localStorage.getItem(STORE_KEY) === "1";
    } catch (e) {
      return false;
    }
  }
  function writeMuted(m) {
    try {
      if (typeof localStorage !== "undefined") localStorage.setItem(STORE_KEY, m ? "1" : "0");
    } catch (e) {
    }
  }
  function perc(p, t, peak, a, d) {
    p.setValueAtTime(0, t);
    p.linearRampToValueAtTime(Math.max(peak, 1e-4), t + a);
    p.exponentialRampToValueAtTime(1e-4, t + a + d);
  }
  function ahr(p, t, peak, a, h, r) {
    const pk = Math.max(peak, 1e-4);
    p.setValueAtTime(0, t);
    p.linearRampToValueAtTime(pk, t + a);
    p.setValueAtTime(pk, t + a + h);
    p.exponentialRampToValueAtTime(1e-4, t + a + h + r);
  }
  function glide(p, t, f0, f1, d) {
    p.setValueAtTime(Math.max(f0, 1), t);
    p.exponentialRampToValueAtTime(Math.max(f1, 1), t + d);
  }
  function hold(p, t) {
    if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t);
    else {
      const v = p.value;
      p.cancelScheduledValues(t);
      p.setValueAtTime(v, t);
    }
  }
  function curve(points, n, scale) {
    const out = new Float32Array(n);
    let j = 0;
    for (let i = 0; i < n; i++) {
      const x = i / (n - 1);
      while (j < points.length - 2 && x > points[j + 1][0]) j++;
      const x0 = points[j][0], y0 = points[j][1], x1 = points[j + 1][0], y1 = points[j + 1][1];
      const u = x1 > x0 ? clamp((x - x0) / (x1 - x0), 0, 1) : 1;
      out[i] = (y0 + (y1 - y0) * u * u * (3 - 2 * u)) * scale;
    }
    return out;
  }
  function makeNoise(ctx, rnd) {
    const len = Math.floor(ctx.sampleRate * 2);
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = rnd() * 2 - 1;
    return b;
  }
  function makeIR(ctx, dur, rnd) {
    const sr = ctx.sampleRate, len = Math.floor(sr * dur);
    const b = ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const a = 0.15 + 0.75 * (t / dur);
        lp += (1 - a) * (rnd() * 2 - 1 - lp);
        d[i] = lp * Math.exp(-t * 4.6) * (t < 0.015 ? t / 0.015 : 1);
      }
      const taps = ch ? [0.013, 0.022, 0.034, 0.049] : [0.011, 0.019, 0.029, 0.043];
      for (let k = 0; k < taps.length; k++) {
        const i = Math.floor(taps[k] * sr);
        if (i < len) d[i] += (k % 2 ? -0.35 : 0.35) / (k + 1);
      }
    }
    return b;
  }
  function softClipCurve() {
    const n = 4096, c = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = i / (n - 1) * 4 - 2;
      const ax = Math.abs(x);
      const y = ax < 0.8 ? ax : 0.8 + 0.19 * Math.tanh((ax - 0.8) / 0.19);
      c[i] = x < 0 ? -y : y;
    }
    return c;
  }
  function makeGlottal(ctx) {
    const N = 40, re = new Float32Array(N), im = new Float32Array(N);
    for (let n = 1; n < N; n++) im[n] = Math.pow(n, -1.15) * (n === 1 ? 0.8 : 1);
    return ctx.createPeriodicWave(re, im);
  }
  var Voice = class {
    constructor(eng, o) {
      const ctx = eng.ctx;
      this.eng = eng;
      this.ctx = ctx;
      this.cat = o.cat || "sfx";
      this.nodes = [];
      this.srcs = [];
      this.live = 0;
      this.freed = false;
      this._end = () => {
        if (--this.live <= 0) this.free();
      };
      const out = ctx.createGain();
      if (o.gain != null) out.gain.value = o.gain;
      this.out = out;
      this.nodes.push(out);
      let tail = out;
      if (o.pan || o.panner) {
        const p = ctx.createStereoPanner();
        p.pan.value = o.pan || 0;
        out.connect(p);
        tail = p;
        this.pan = p;
        this.nodes.push(p);
      }
      tail.connect(o.dest || eng.sfxIn);
      if (o.wet > 0) {
        const s = ctx.createGain();
        s.gain.value = o.wet;
        tail.connect(s);
        s.connect(o.wetDest || eng.verbIn);
        this.nodes.push(s);
      }
      eng._count(this.cat, 1);
    }
    gain(v, to) {
      const n = this.ctx.createGain();
      if (v != null) n.gain.value = v;
      this.nodes.push(n);
      if (to) n.connect(to);
      return n;
    }
    filter(type, f, q, to) {
      const n = this.ctx.createBiquadFilter();
      n.type = type;
      if (f != null) n.frequency.value = this.eng.fq(f);
      if (q != null) n.Q.value = q;
      this.nodes.push(n);
      if (to) n.connect(to);
      return n;
    }
    osc(type, f, t0, t1, to) {
      const n = this.ctx.createOscillator();
      if (typeof type === "string") n.type = type;
      else n.setPeriodicWave(type);
      if (f != null) n.frequency.value = this.eng.fq(f);
      if (to) n.connect(to);
      this._src(n, t0, t1);
      n.start(t0);
      n.stop(Math.max(t1, t0 + 0.01));
      return n;
    }
    noise(t0, t1, to, rate) {
      const n = this.ctx.createBufferSource();
      n.buffer = this.eng.noiseBuf;
      n.loop = true;
      if (rate) n.playbackRate.value = rate;
      if (to) n.connect(to);
      this._src(n, t0, t1);
      n.start(t0, this.eng.rnd() * 1.9);
      n.stop(Math.max(t1, t0 + 0.01));
      return n;
    }
    _src(n) {
      this.nodes.push(n);
      this.srcs.push(n);
      this.live++;
      n.onended = this._end;
    }
    // Досрочно остановить все источники в момент t.
    kill(t) {
      for (const s of this.srcs) {
        try {
          s.stop(t);
        } catch (e) {
        }
      }
    }
    free() {
      if (this.freed) return;
      this.freed = true;
      for (const n of this.nodes) {
        try {
          n.disconnect();
        } catch (e) {
        }
      }
      for (const s of this.srcs) s.onended = null;
      this.nodes = this.srcs = null;
      this.eng._count(this.cat, -1);
    }
  };
  function mv(e, a, o) {
    o.dest = o.dest || a.dry;
    o.wetDest = a.wet;
    o.cat = a.cat || "music";
    return e._voice(o);
  }
  var INS = {
    // Электропиано: FM (несущая 1:1) с затухающим индексом + «язычок» 4f на атаке.
    rhodes(e, a, t, midi, vel, dur) {
      const v = mv(e, a, { gain: 0, wet: 0.22, dest: a.rh || a.dry });
      if (!v) return;
      const f = mtof(midi), end = t + dur + 0.9, pk = 0.2 * vel, g = v.out.gain;
      g.setValueAtTime(0, t);
      g.linearRampToValueAtTime(pk, t + 5e-3);
      g.setTargetAtTime(pk * 0.5, t + 5e-3, 0.45);
      g.setTargetAtTime(0, t + dur, 0.13);
      const car = v.osc("sine", f, t, end, v.out);
      const mg = v.gain(null);
      mg.connect(car.frequency);
      mg.gain.setValueAtTime(f * (1 + 1.3 * vel), t);
      mg.gain.setTargetAtTime(f * 0.2, t, 0.25);
      v.osc("sine", f, t, end, mg);
      const tg = v.gain(0, v.out);
      perc(tg.gain, t, 0.22 * vel, 8e-4, 0.08);
      v.osc("sine", f * 4, t, t + 0.12, tg);
    },
    // Круглый бас: синус + треугольник через «щипковый» фильтр.
    bass(e, a, t, midi, vel, dur) {
      const v = mv(e, a, { gain: 0 });
      if (!v) return;
      const f = mtof(midi), pk = 0.18 * vel, g = v.out.gain;
      g.setValueAtTime(0, t);
      g.linearRampToValueAtTime(pk, t + 0.012);
      g.setTargetAtTime(pk * 0.6, t + 0.012, 0.35);
      g.setTargetAtTime(0, t + dur, 0.05);
      const lp = v.filter("lowpass", null, 1.1, v.out);
      lp.frequency.setValueAtTime(650 + 700 * vel, t);
      lp.frequency.setTargetAtTime(360, t, 0.1);
      v.osc("sine", f, t, t + dur + 0.35, lp);
      v.osc("sawtooth", f, t, t + dur + 0.35, v.gain(0.45, lp));
    },
    kick(e, a, t, vel) {
      const v = mv(e, a, { gain: 0 });
      if (!v) return;
      perc(v.out.gain, t, 0.9 * vel, 2e-3, 0.3);
      const o = v.osc("sine", null, t, t + 0.36, v.out);
      glide(o.frequency, t, 145, 50, 0.09);
      const kg = v.gain(0, v.out);
      perc(kg.gain, t, 0.35, 1e-3, 0.025);
      glide(v.osc("sine", null, t, t + 0.03, kg).frequency, t, 420, 160, 0.02);
    },
    // Мягкий «щёточный» малый.
    snare(e, a, t, vel, ghost) {
      const v = mv(e, a, { gain: 1, pan: -0.08, wet: ghost ? 0 : 0.14 });
      if (!v) return;
      const ng = v.gain(0, v.out);
      perc(ng.gain, t, 1.7 * vel * e.nb("bp", 2100, 0.8), 4e-3, ghost ? 0.06 : 0.17);
      v.noise(t, t + 0.25, v.filter("bandpass", 2100, 0.8, ng));
      if (!ghost) {
        const bg = v.gain(0, v.out);
        perc(bg.gain, t, 1 * vel, 2e-3, 0.07);
        glide(v.osc("triangle", null, t, t + 0.12, bg).frequency, t, 215, 175, 0.05);
      }
    },
    hat(e, a, t, vel, open) {
      const v = mv(e, a, { gain: 0, pan: 0.22 });
      if (!v) return;
      const d = open ? 0.2 : 0.035;
      perc(v.out.gain, t, 1.5 * vel * e.nb("hp", 7e3), 1e-3, d);
      v.noise(t, t + d + 0.02, v.filter("highpass", 7e3, 0.8, v.out));
    },
    // Маримба-подобный молоточек для хука.
    mallet(e, a, t, midi, vel, dur) {
      const v = mv(e, a, { gain: 0, wet: 0.2, pan: 0.12 });
      if (!v) return;
      const f = mtof(midi), d = Math.min(0.9, 0.35 + dur);
      perc(v.out.gain, t, 0.7 * vel, 2e-3, d);
      v.osc("sine", f, t, t + d + 0.02, v.out);
      const hg = v.gain(0, v.out);
      perc(hg.gain, t, 0.55, 1e-3, 0.05);
      v.osc("sine", f * 4, t, t + 0.07, hg);
    },
    glock(e, a, t, midi, vel) {
      const v = mv(e, a, { gain: 0, wet: 0.3, pan: -0.15 });
      if (!v) return;
      const f = mtof(midi);
      perc(v.out.gain, t, 0.26 * vel, 1e-3, 0.9);
      v.osc("sine", f, t, t + 0.95, v.out);
      const hg = v.gain(0, v.out);
      perc(hg.gain, t, 0.45, 1e-3, 0.12);
      v.osc("sine", f * 2.76, t, t + 0.14, hg);
    },
    // Музыкальная шкатулка: основной тон + октава + короткий «пинг» язычка.
    box(e, a, t, midi, vel, decay, pan) {
      const v = mv(e, a, { gain: 0, wet: 0.32, pan: pan || 0 });
      if (!v) return;
      const f = mtof(midi), d = decay || 1.8;
      perc(v.out.gain, t, 0.3 * vel, 15e-4, d);
      v.osc("sine", f, t, t + d + 0.02, v.out);
      const og = v.gain(0, v.out);
      perc(og.gain, t, 0.14, 1e-3, d * 0.35);
      v.osc("sine", f * 2, t, t + d * 0.35 + 0.02, og);
      const pg = v.gain(0, v.out);
      perc(pg.gain, t, 0.3, 5e-4, 0.045);
      v.osc("sine", f * 5.4, t, t + 0.06, pg);
    },
    // Пиццикато: пила/треугольник через быстро закрывающийся фильтр.
    pizz(e, a, t, midi, vel, bassy) {
      const v = mv(e, a, { gain: 0, wet: 0.22, pan: bassy ? -0.1 : 0.12 });
      if (!v) return;
      const f = mtof(midi), d = bassy ? 0.5 : 0.4;
      perc(v.out.gain, t, (bassy ? 1.05 : 0.54) * vel, 3e-3, d);
      const lp = v.filter("lowpass", null, bassy ? 1.4 : 2.2, v.out);
      glide(lp.frequency, t, bassy ? 1500 : Math.min(4500, f * 8), bassy ? 260 : Math.max(520, f * 1.6), 0.12);
      v.osc(bassy ? "triangle" : "sawtooth", f, t, t + d + 0.02, lp);
    },
    pad(e, a, t, midis, vel, dur) {
      const v = mv(e, a, { gain: 0, wet: 0.45 });
      if (!v) return;
      const g = v.out.gain, pk = 0.05 * vel;
      g.setValueAtTime(0, t);
      g.linearRampToValueAtTime(pk, t + Math.min(0.9, dur * 0.4));
      g.setValueAtTime(pk, t + dur);
      g.setTargetAtTime(0, t + dur, 0.45);
      const lp = v.filter("lowpass", 950, 0.5, v.out);
      for (const m of midis) {
        for (const dt of [-7, 7]) {
          const o = v.osc("triangle", mtof(m), t, t + dur + 2.4, lp);
          o.detune.value = dt;
        }
      }
    },
    softBass(e, a, t, midi, vel, dur) {
      const v = mv(e, a, { gain: 0 });
      if (!v) return;
      const f = mtof(midi), g = v.out.gain, pk = 0.2 * vel;
      g.setValueAtTime(0, t);
      g.linearRampToValueAtTime(pk, t + 0.03);
      g.setTargetAtTime(pk * 0.45, t + 0.03, 0.6);
      g.setTargetAtTime(0, t + dur, 0.2);
      v.osc("sine", f, t, t + dur + 1.2, v.out);
      v.osc("triangle", f * 2, t, t + dur + 1.2, v.gain(0.12, v.out));
    },
    // «Бумажный шейкер» для карандашной версии.
    shaker(e, a, t, vel) {
      const v = mv(e, a, { gain: 0, pan: 0.28 });
      if (!v) return;
      perc(v.out.gain, t, 1.7 * vel * e.nb("bp", 3600, 1.3), 0.014, 0.065);
      v.noise(t, t + 0.1, v.filter("bandpass", 3600, 1.3, v.out), 0.85);
    },
    // Постукивание карандашом.
    tap(e, a, t, vel) {
      const v = mv(e, a, { gain: 1, pan: -0.15, wet: 0.1 });
      if (!v) return;
      const g1 = v.gain(0, v.out);
      perc(g1.gain, t, 1 * vel, 1e-3, 0.03);
      v.osc("sine", 1250, t, t + 0.04, g1);
      const g2 = v.gain(0, v.out);
      perc(g2.gain, t, 1.1 * vel * e.nb("bp", 2600, 2), 8e-4, 0.018);
      v.noise(t, t + 0.03, v.filter("bandpass", 2600, 2, g2));
    },
    // Мягкий «пальцем по тетради».
    thump(e, a, t, vel) {
      const v = mv(e, a, { gain: 1 });
      if (!v) return;
      const g1 = v.gain(0, v.out);
      perc(g1.gain, t, 0.9 * vel, 3e-3, 0.14);
      glide(v.osc("sine", null, t, t + 0.16, g1).frequency, t, 115, 65, 0.08);
      const g2 = v.gain(0, v.out);
      perc(g2.gain, t, 0.35 * vel * e.nb("lp", 500), 2e-3, 0.04);
      v.noise(t, t + 0.06, v.filter("lowpass", 500, 0.7, g2));
    },
    // Колокольчик для звёзд.
    bell(e, v, t, midi, vel, bright, dec) {
      const f = mtof(midi);
      const P = [
        [1, 1, 1.4],
        [2, 0.42, 0.9],
        [3, 0.18, 0.5],
        [4.2, 0.22 * bright, 0.3],
        [5.4, 0.14 * bright, 0.18]
      ];
      for (const [r, g0, d] of P) {
        const g = v.gain(0, v.out);
        perc(g.gain, t, g0 * vel, 1e-3, d * dec);
        v.osc("sine", f * r, t, t + d * dec + 0.02, g);
      }
    }
  };
  var LOFI_CH = [
    [{ s: 0, root: 41, v: [57, 60, 64, 67] }],
    [{ s: 0, root: 40, v: [55, 59, 62, 67] }],
    [{ s: 0, root: 38, v: [53, 57, 60, 64] }],
    [{ s: 0, root: 43, v: [53, 57, 60, 62] }, { s: 8, root: 43, v: [53, 59, 64] }],
    [{ s: 0, root: 41, v: [57, 60, 64, 69] }],
    [{ s: 0, root: 40, v: [55, 59, 62, 64] }, { s: 8, root: 45, v: [55, 61, 65] }],
    [{ s: 0, root: 38, v: [53, 57, 60, 64] }, { s: 8, root: 43, v: [53, 59, 64] }],
    [{ s: 0, root: 36, v: [52, 55, 59, 62] }]
  ];
  var LOFI_HOOK = [
    [[0, 76, 3], [3, 79, 2], [5, 81, 2], [7, 79, 3], [10, 76, 2], [12, 72, 4]],
    [[0, 74, 3], [3, 76, 5], [8, 71, 6]],
    [[2, 72, 2], [4, 74, 2], [6, 77, 2], [8, 76, 2], [10, 74, 2], [12, 72, 4]],
    [[0, 74, 6], [10, 67, 2], [12, 69, 2], [14, 71, 2]],
    [[0, 76, 3], [3, 79, 2], [5, 81, 2], [7, 84, 3], [10, 83, 2], [12, 81, 4]],
    [[0, 79, 3], [3, 76, 5], [8, 76, 2], [10, 77, 2], [12, 76, 2], [14, 73, 2]],
    [[0, 74, 3], [3, 77, 3], [6, 81, 2], [8, 79, 2], [10, 77, 2], [12, 76, 2], [14, 74, 2]],
    [[0, 76, 4], [4, 79, 2], [6, 76, 2], [8, 72, 8]]
  ];
  var LOFI_ANS = { 3: [[12, 74, 1], [13, 76, 1], [14, 79, 2]], 7: [[10, 76, 2], [12, 79, 2], [14, 83, 2]] };
  var KICKS = [{ 0: 1, 10: 0.8 }, { 0: 1, 7: 0.5, 10: 0.8 }, { 0: 1, 10: 0.75, 13: 0.45, 15: 0.35 }];
  var RH_A = [[0, 6, 0.85], [6, 2, 0.45], [10, 5, 0.6]];
  var RH_B = [[0, 10, 0.85], [11, 4, 0.5]];
  var RH_2 = [[0, 7, 0.8], [8, 7, 0.75]];
  var SWING = [0, 0.05, 0.1, 0.05];
  var SK_ARP = [[0, 0, 0.8], [3, 2, 0.55], [6, 1, 0.6], [10, 3, 0.55], [12, 2, 0.45]];
  var lofiChord = (b8, s) => {
    const segs = LOFI_CH[b8];
    return segs.length > 1 && s >= segs[1].s ? segs[1] : segs[0];
  };
  function lofiBass(b8, s, cyc) {
    const segs = LOFI_CH[b8], r = segs[0].root, next = LOFI_CH[(b8 + 1) % 8][0].root;
    const appr = cyc & 1 ? next + 2 : next - 1;
    if (segs.length > 1) {
      if (s === 0) return [r, 6, 0.9];
      if (s === 8) return [segs[1].root, 5, 0.85];
      if (s === 14) return [appr, 2, 0.6];
      return null;
    }
    if (b8 & 1) {
      if (s === 0) return [r, 9, 0.9];
      if (s === 10) return [r + 12, 2, 0.5];
      if (s === 12) return [r + 7, 2, 0.7];
      if (s === 14) return [appr, 2, 0.6];
      return null;
    }
    if (s === 0) return [r, 6, 0.9];
    if (s === 7) return [r, 1, 0.45];
    if (s === 8) return [r + 7, 4, 0.75];
    if (s === 14) return [appr, 2, 0.6];
    return null;
  }
  function playLevel(p, a, step, t) {
    const e = p.eng, R = e.rnd;
    const bar = Math.floor(step / 16), s = step - bar * 16, b8 = bar % 8, cyc = Math.floor(bar / 8);
    const sd = p.song.stepDur(e.tempo), beat = sd * 4;
    const tt = t + SWING[s & 3] * beat + (R() - 0.5) * 6e-3;
    const hook = cyc % 2 === 1;
    const kv = KICKS[b8 === 7 ? 2 : b8 & 1][s];
    if (kv && bar >= 2) INS.kick(e, a, tt, kv * (0.9 + R() * 0.1));
    if (s === 4 || s === 12) INS.snare(e, a, tt, (s === 12 ? 1 : 0.88) * (0.9 + R() * 0.1));
    else if (s === 9 && b8 & 1 || s === 15 && R() < 0.2) INS.snare(e, a, tt, 0.3, true);
    if ((s & 1) === 0) {
      const open = s === 14 && (b8 === 3 || b8 === 7);
      INS.hat(e, a, tt, ((s & 3) === 0 ? 0.8 : 0.55) * (0.85 + R() * 0.3), open);
    } else if (s === 15 && R() < 0.3 || s === 7 && R() < 0.12) INS.hat(e, a, tt, 0.3);
    const bn = lofiBass(b8, s, cyc);
    if (bn) INS.bass(e, a, tt, bn[0], bn[2], bn[1] * sd * 0.95);
    const hits = LOFI_CH[b8].length > 1 ? RH_2 : b8 & 1 ? RH_B : RH_A;
    for (const h of hits) {
      if (h[0] !== s) continue;
      const ch = lofiChord(b8, s), vel = h[2] * (hook ? 0.8 : 1);
      for (let i = 0; i < ch.v.length; i++) {
        INS.rhodes(e, a, tt + i * 0.011 + R() * 4e-3, ch.v[i], vel * (0.85 + R() * 0.25), h[1] * sd);
      }
    }
    if (hook) {
      for (const n of LOFI_HOOK[b8]) {
        if (n[0] !== s) continue;
        INS.mallet(e, a, tt, n[1], 0.85 + R() * 0.15, n[2] * sd);
        if (cyc % 4 === 3) INS.glock(e, a, tt, n[1] + 12, 0.8);
      }
    } else if (cyc >= 2 && LOFI_ANS[b8]) {
      for (const n of LOFI_ANS[b8]) if (n[0] === s) INS.rhodes(e, a, tt, n[1], 0.5, n[2] * sd * 1.5);
    }
  }
  function playSketch(p, a, step, t) {
    const e = p.eng, R = e.rnd;
    const bar = Math.floor(step / 16), s = step - bar * 16, b8 = bar % 8, cyc = Math.floor(bar / 8);
    const sd = p.song.stepDur(e.tempo), beat = sd * 4;
    const tt = t + SWING[s & 3] * beat + (R() - 0.5) * 8e-3;
    const ch = lofiChord(b8, s);
    if ((s & 1) === 0) INS.shaker(e, a, tt, ((s & 3) === 2 ? 0.85 : 0.45) * (0.8 + R() * 0.4));
    if (s === 4 || s === 12) INS.tap(e, a, tt, 0.75 + R() * 0.2);
    if (bar >= 1 && (s === 0 || s === 10)) INS.thump(e, a, tt, s === 0 ? 0.85 : 0.5);
    for (const n of SK_ARP) {
      if (n[0] !== s) continue;
      INS.pizz(e, a, tt, ch.v[n[1] % ch.v.length] + 12, n[2] * (0.85 + R() * 0.3), false);
    }
    const bn = lofiBass(b8, s, cyc);
    if (bn && (s === 0 || s === 8 || s === 14 && b8 & 1)) INS.pizz(e, a, tt, bn[0] + 12, bn[2], true);
    if (cyc % 2 === 1) {
      for (const n of LOFI_HOOK[b8]) {
        if (n[0] !== s) continue;
        INS.box(e, a, tt, n[1], 1.25 + R() * 0.15, 1.3, 0.1);
        if (cyc % 4 === 3 && n[2] >= 4) INS.box(e, a, tt + 0.01, n[1] + 12, 0.25, 1, -0.2);
      }
    } else {
      if (s === 0) INS.box(e, a, tt, ch.v[ch.v.length - 1] + 12, 0.45, 1.6, 0.3);
      else if (s === 8 && b8 & 1) INS.box(e, a, tt, ch.v[ch.v.length - 2] + 12, 0.35, 1.3, -0.25);
      else if ((b8 === 3 || b8 === 7) && s === 12) INS.box(e, a, tt, ch.v[R() * ch.v.length | 0] + 24, 0.28, 1.4, 0.35);
    }
  }
  var TITLE_CH = [
    [{ s: 0, r: 41, c: [53, 57, 60] }],
    [{ s: 0, r: 38, c: [53, 57, 62] }],
    [{ s: 0, r: 46, c: [53, 58, 62] }],
    [{ s: 0, r: 48, c: [52, 55, 60] }],
    [{ s: 0, r: 41, c: [53, 57, 60] }],
    [{ s: 0, r: 45, c: [52, 57, 60] }],
    [{ s: 0, r: 46, c: [53, 58, 62] }, { s: 3, r: 48, c: [52, 55, 60] }],
    [{ s: 0, r: 41, c: [53, 57, 60] }],
    [{ s: 0, r: 46, c: [53, 58, 62] }],
    [{ s: 0, r: 41, c: [53, 57, 60] }],
    [{ s: 0, r: 43, c: [55, 58, 62] }],
    [{ s: 0, r: 48, c: [52, 55, 58] }],
    [{ s: 0, r: 38, c: [53, 57, 62] }],
    [{ s: 0, r: 46, c: [53, 58, 62] }],
    [{ s: 0, r: 43, c: [55, 58, 62] }, { s: 3, r: 48, c: [52, 55, 58] }],
    [{ s: 0, r: 41, c: [53, 57, 60] }]
  ];
  var TITLE_MEL = [
    [[0, 69, 2], [2, 72, 2], [4, 77, 2]],
    [[0, 76, 4], [4, 74, 2]],
    [[0, 74, 2], [2, 72, 2], [4, 70, 2]],
    [[0, 69, 2], [2, 67, 4]],
    [[0, 69, 2], [2, 72, 2], [4, 77, 2]],
    [[0, 76, 3], [3, 77, 1], [4, 76, 2]],
    [[0, 74, 3], [3, 76, 3]],
    [[0, 77, 6]],
    [[0, 74, 2], [2, 77, 2], [4, 74, 2]],
    [[0, 72, 4], [4, 69, 2]],
    [[0, 70, 2], [2, 74, 2], [4, 79, 2]],
    [[0, 76, 4], [4, 72, 2]],
    [[0, 74, 2], [2, 77, 2], [4, 81, 2]],
    [[0, 77, 4], [4, 74, 2]],
    [[0, 74, 3], [3, 72, 3]],
    [[0, 69, 6]]
  ];
  var ARP_A = [0, 0, 1, 2, 1, 0];
  var ARP_B = [0, 1, 2, 3, 2, 1];
  function playTitle(p, a, step, t) {
    const e = p.eng, R = e.rnd;
    const bar = Math.floor(step / 6), s = step - bar * 6, b16 = (bar % 16 + 16) % 16;
    const pass = bar < 0 ? 0 : Math.floor(bar / 16) % 3;
    const e8 = p.song.stepDur(e.tempo);
    const tt = t + (R() - 0.5) * 0.012;
    const segs = TITLE_CH[b16];
    const ch = segs.length > 1 && s >= segs[1].s ? segs[1] : segs[0];
    if (s === 0 || segs.length > 1 && s === segs[1].s) {
      const len = (segs.length > 1 ? 3 : 6) * e8;
      INS.softBass(e, a, tt, ch.r < 45 ? ch.r + 12 : ch.r, 0.75, len);
      INS.pad(e, a, tt, ch.c, 0.9, len);
    }
    if (s > 0) {
      const tones = [ch.c[0], ch.c[1], ch.c[2], ch.c[0] + 12];
      const idx = (pass === 1 ? ARP_B : ARP_A)[s];
      INS.box(e, a, tt, tones[idx], (s === 3 ? 0.36 : 0.3) * (0.85 + R() * 0.3), 1.2, -0.2);
    }
    if (bar >= 0) {
      for (const n of TITLE_MEL[b16]) {
        if (n[0] !== s) continue;
        INS.box(e, a, tt + 4e-3, n[1] + (pass === 1 ? 12 : 0), 1.35 + R() * 0.15, pass === 1 ? 1.8 : 2.4, 0.15);
        if (pass === 2) INS.box(e, a, tt + 0.012, n[1] + 12, 0.22, 1.4, 0.35);
      }
    }
    if (s === 5 && R() < 0.16) INS.box(e, a, tt, ch.c[R() * 3 | 0] + 24, 0.2, 1.5, 0.4);
  }
  var SONGS = {
    lofi: {
      name: "lofi",
      intro: 0,
      arrGain: { level: 1, sketch: 1.45 },
      stepDur: (tempo) => 60 / 94 / 4 / tempo,
      play(p, a, step, t) {
        if (a.name === "sketch") playSketch(p, a, step, t);
        else playLevel(p, a, step, t);
      },
      // Электропиано идёт через общий фильтр и лёгкий авто-панорамный тремоло.
      setup(p, a) {
        if (a.name !== "level") return;
        const c = p.ctx;
        const lp = c.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 3200;
        lp.Q.value = 0.5;
        const pan = c.createStereoPanner();
        const lfo = c.createOscillator();
        lfo.frequency.value = 3.2;
        const lg = c.createGain();
        lg.gain.value = 0.28;
        lfo.connect(lg);
        lg.connect(pan.pan);
        lp.connect(pan);
        pan.connect(a.dry);
        lfo.start(p.eng.now());
        a.rh = lp;
        p.persist.push(lfo, lg, lp, pan);
      }
    },
    title: {
      name: "title",
      gain: 1.05,
      intro: 12,
      // 2 такта вступления без мелодии
      stepDur: (tempo) => 60 / 72 / 2 / tempo,
      play: playTitle
    }
  };
  var Player = class {
    constructor(eng, song, arrName, t) {
      const c = eng.ctx;
      this.eng = eng;
      this.ctx = c;
      this.song = song;
      this.bus = c.createGain();
      this.bus.gain.value = 0;
      this.bus.connect(eng.musicIn);
      this.wbus = c.createGain();
      this.wbus.gain.value = 0;
      this.wbus.connect(eng.musicWetIn);
      this.arrs = {};
      this.persist = [];
      this.step = -(song.intro || 0);
      this.nextTime = t + 0.06;
      this.dieAt = Infinity;
      this.disposed = false;
      this.setArr(arrName, t, 0.01);
    }
    arr(name) {
      let a = this.arrs[name];
      if (!a) {
        const c = this.ctx;
        a = { name, dry: c.createGain(), wet: c.createGain(), target: 0, until: -1, cat: "music", rh: null };
        a.dry.gain.value = 0;
        a.wet.gain.value = 0;
        a.dry.connect(this.bus);
        a.wet.connect(this.wbus);
        if (this.song.setup) this.song.setup(this, a);
        this.arrs[name] = a;
      }
      return a;
    }
    setArr(name, t, dur) {
      for (const k in this.arrs) {
        const a2 = this.arrs[k];
        if (k !== name && a2.target > 0) {
          a2.target = 0;
          a2.until = t + dur;
          fadeTo([a2.dry.gain, a2.wet.gain], 0, t, dur);
        }
      }
      const a = this.arr(name);
      if (a.target !== 1) {
        a.target = 1;
        a.until = Infinity;
        fadeTo([a.dry.gain, a.wet.gain], this.song.arrGain && this.song.arrGain[name] || 1, t, dur);
      }
    }
    fade(v, t, dur) {
      fadeTo([this.bus.gain, this.wbus.gain], v, t, dur);
    }
    scheduleUntil(until) {
      const e = this.eng, now = e.now();
      const sd = this.song.stepDur(e.tempo);
      if (this.nextTime < now - 0.1) {
        const n = Math.ceil((now - this.nextTime) / sd);
        this.step += n;
        this.nextTime += n * sd;
      }
      let guard = 0;
      while (this.nextTime < until && guard++ < 4096) {
        const t = this.nextTime;
        for (const k in this.arrs) {
          const a = this.arrs[k];
          if (t < a.until) this.song.play(this, a, this.step, t);
        }
        this.step++;
        this.nextTime += this.song.stepDur(e.tempo);
      }
    }
    dispose() {
      if (this.disposed) return;
      this.disposed = true;
      for (const n of this.persist) {
        try {
          if (n.stop) n.stop();
        } catch (err) {
        }
        try {
          n.disconnect();
        } catch (err) {
        }
      }
      for (const k in this.arrs) {
        this.arrs[k].dry.disconnect();
        this.arrs[k].wet.disconnect();
      }
      this.bus.disconnect();
      this.wbus.disconnect();
      this.persist = [];
    }
  };
  function fadeTo(params, v, t, dur) {
    for (const p of params) {
      hold(p, t);
      p.linearRampToValueAtTime(v, t + Math.max(0.01, dur));
    }
  }
  var PENT_HI = [1568, 1760, 2093, 2349, 2637, 3136];
  var IMPACT = {
    cardboard(e, v, t, s) {
      const R = e.rnd, k = 0.9 + R() * 0.2;
      const f = 230 * k * (1 + 0.25 * s);
      const b = v.gain(0, v.out);
      perc(b.gain, t, 1 * e.nb("bp", f, 3), 2e-3, 0.09 + 0.07 * s);
      v.noise(t, t + 0.22, v.filter("bandpass", f, 3, b));
      const th = v.gain(0, v.out);
      perc(th.gain, t, 0.45, 2e-3, 0.08);
      glide(v.osc("sine", null, t, t + 0.11, th).frequency, t, 150 * k, 78 * k, 0.07);
      const pr = v.gain(0, v.out);
      perc(pr.gain, t, (0.25 + 0.3 * s) * e.nb("hp", 2400), 1e-3, 0.03);
      v.noise(t, t + 0.05, v.filter("highpass", 2400, 0.7, pr));
    },
    wood(e, v, t, s) {
      const R = e.rnd, f0 = (560 + R() * 240) * (1 + 0.12 * s);
      const ratios = [1, 2.32, 3.87], gains = [0.6, 0.3, 0.14], decs = [0.075, 0.04, 0.025];
      const nm = s > 0.4 ? 3 : 2;
      for (let i = 0; i < nm; i++) {
        const g = v.gain(0, v.out);
        const d = decs[i] * (0.8 + 0.5 * s);
        perc(g.gain, t, gains[i], 1e-3, d);
        v.osc("sine", f0 * ratios[i], t, t + d + 0.01, g);
      }
      const c = v.gain(0, v.out);
      perc(c.gain, t, 0.6 * e.nb("bp", 2800, 0.9), 5e-4, 0.014);
      v.noise(t, t + 0.03, v.filter("bandpass", 2800, 0.9, c));
      const g2 = v.gain(0, v.out);
      perc(g2.gain, t, 0.4 * s, 2e-3, 0.06);
      glide(v.osc("sine", null, t, t + 0.08, g2).frequency, t, 200, 120, 0.05);
    },
    ceramic(e, v, t, s) {
      const R = e.rnd, f0 = PENT_HI[R() * PENT_HI.length | 0] * (1 + (R() - 0.5) * 0.012);
      const ratios = [1, 2.71, 5.1], gains = [0.45, 0.26, 0.12], decs = [0.3, 0.13, 0.06];
      for (let i = 0; i < 3; i++) {
        const g = v.gain(0, v.out);
        const d = decs[i] * (0.6 + 0.6 * s);
        perc(g.gain, t, gains[i], 8e-4, d);
        v.osc("sine", f0 * ratios[i], t, t + d + 0.01, g);
      }
      const c = v.gain(0, v.out);
      perc(c.gain, t, 0.35 * e.nb("hp", 5e3), 5e-4, 7e-3);
      v.noise(t, t + 0.02, v.filter("highpass", 5e3, 0.7, c));
      if (s > 0.45) {
        const g = v.gain(0, v.out);
        perc(g.gain, t, 0.3 * s, 2e-3, 0.07);
        v.osc("sine", 430, t, t + 0.08, g);
      }
    },
    yarn(e, v, t, s) {
      const g = v.gain(0, v.out);
      perc(g.gain, t, 1 * e.nb("lp", 420), 6e-3, 0.09 + 0.05 * s);
      v.noise(t, t + 0.17, v.filter("lowpass", 420, 0.8, g));
      const g2 = v.gain(0, v.out);
      perc(g2.gain, t, 0.4, 4e-3, 0.08);
      glide(v.osc("sine", null, t, t + 0.1, g2).frequency, t, 110, 62, 0.07);
    },
    cat(e, v, t, s) {
      const g = v.gain(0, v.out);
      perc(g.gain, t, 0.85 * e.nb("lp", 900), 3e-3, 0.1);
      const lp = v.filter("lowpass", null, 0.8, g);
      glide(lp.frequency, t, 1400, 350, 0.08);
      v.noise(t, t + 0.12, lp);
      const g2 = v.gain(0, v.out);
      perc(g2.gain, t, 0.5, 2e-3, 0.1);
      glide(v.osc("sine", null, t, t + 0.12, g2).frequency, t, 165, 85, 0.07);
      if (s > 0.6) {
        const t1 = t + 0.015, q = v.gain(0, v.out);
        perc(q.gain, t1, 0.12 + 0.35 * (s - 0.6), 6e-3, 0.09);
        const o = v.osc("triangle", null, t1, t1 + 0.11, q);
        o.frequency.setValueAtTime(1500, t1);
        o.frequency.exponentialRampToValueAtTime(2100, t1 + 0.035);
        o.frequency.exponentialRampToValueAtTime(1350, t1 + 0.095);
      }
    },
    ground(e, v, t, s) {
      const g = v.gain(0, v.out);
      perc(g.gain, t, 0.9, 3e-3, 0.2);
      glide(v.osc("sine", null, t, t + 0.21, g).frequency, t, 88, 40, 0.12);
      const g2 = v.gain(0, v.out);
      perc(g2.gain, t, 0.75 * e.nb("lp", 280), 3e-3, 0.13);
      v.noise(t, t + 0.15, v.filter("lowpass", 280, 0.8, g2));
      const g3 = v.gain(0, v.out);
      perc(g3.gain, t, 0.25 * s * e.nb("bp", 1500, 1), 1e-3, 0.04);
      v.noise(t, t + 0.05, v.filter("bandpass", 1500, 1, g3));
    },
    fish(e, v, t, s) {
      const g = v.gain(0, v.out);
      perc(g.gain, t, 0.7 * e.nb("bp", 1800, 1.3), 1e-3, 0.03);
      v.noise(t, t + 0.04, v.filter("bandpass", 1800, 1.3, g));
      const g2 = v.gain(0, v.out);
      perc(g2.gain, t, 0.5, 2e-3, 0.07);
      glide(v.osc("sine", null, t, t + 0.08, g2).frequency, t, 720, 260, 0.06);
      const t1 = t + 0.035, g3 = v.gain(0, v.out);
      perc(g3.gain, t1, 0.25, 2e-3, 0.05);
      glide(v.osc("sine", null, t1, t1 + 0.06, g3).frequency, t1, 980, 420, 0.04);
    }
  };
  function grains(gp, fp, t, dur, n, peak, R, fr, dr) {
    gp.setValueAtTime(0, t);
    let tt = t;
    for (let i = 0; i < n; i++) {
      const d = dr[0] + R() * (dr[1] - dr[0]);
      const a = peak * (0.3 + 0.7 * R()) * (1 - 0.55 * i / n);
      gp.setValueAtTime(1e-4, tt);
      gp.linearRampToValueAtTime(Math.max(a, 2e-4), tt + 15e-4);
      gp.exponentialRampToValueAtTime(1e-4, tt + d);
      if (fp) fp.setValueAtTime(fr[0] + R() * (fr[1] - fr[0]), tt);
      tt += d + dur / n * (0.1 + R() * 0.9);
    }
    return tt;
  }
  var BREAK = {
    cardboard(e, v, t) {
      const R = e.rnd;
      const cg = v.gain(0, v.out);
      const cbp = v.filter("bandpass", 2400, 1.1, cg);
      const end = grains(cg.gain, cbp.frequency, t, 0.4, 14, 1.1 * e.nb("bp", 2400, 1.1), R, [1100, 4200], [8e-3, 0.03]);
      v.noise(t, end + 0.02, cbp);
      const t1 = t + 0.04, tg = v.gain(0, v.out);
      ahr(tg.gain, t1, 0.7 * e.nb("bp", 1700, 2), 0.03, 0.12, 0.12);
      const am = v.gain(0.5, tg);
      const tbp = v.filter("bandpass", null, 2, am);
      glide(tbp.frequency, t1, 900, 2600, 0.25);
      v.noise(t1, t1 + 0.3, tbp);
      v.osc("sawtooth", 38 + R() * 10, t1, t1 + 0.3, v.gain(0.5, am.gain));
      const b = v.gain(0, v.out);
      perc(b.gain, t, 0.9 * e.nb("bp", 200, 2.5), 3e-3, 0.15);
      v.noise(t, t + 0.2, v.filter("bandpass", 200, 2.5, b));
    },
    wood(e, v, t) {
      const R = e.rnd;
      const c = v.gain(0, v.out);
      perc(c.gain, t, 0.9 * e.nb("hp", 1200), 5e-4, 0.045);
      v.noise(t, t + 0.06, v.filter("highpass", 1200, 0.7, c));
      const r = v.gain(0, v.out);
      perc(r.gain, t, 0.9 * e.nb("bp", 1700, 5), 1e-3, 0.09);
      v.noise(t, t + 0.11, v.filter("bandpass", 1700, 5, r));
      const b = v.gain(0, v.out);
      perc(b.gain, t, 0.6, 2e-3, 0.12);
      glide(v.osc("sine", null, t, t + 0.13, b).frequency, t, 210, 110, 0.09);
      const sg = v.gain(0, v.out);
      const sbp = v.filter("bandpass", 3500, 1.5, sg);
      const end = grains(sg.gain, sbp.frequency, t + 0.03, 0.35, 10, 0.8 * e.nb("bp", 3500, 1.5), R, [2500, 6e3], [6e-3, 0.02]);
      v.noise(t + 0.03, end + 0.02, sbp);
      for (let i = 0; i < 3; i++) {
        const tt = t + 0.1 + R() * 0.3, g = v.gain(0, v.out);
        perc(g.gain, tt, 0.22 * (1 - i * 0.2), 1e-3, 0.035);
        v.osc("sine", 800 + R() * 600, tt, tt + 0.045, g);
      }
    },
    ceramic(e, v, t) {
      const R = e.rnd;
      const c = v.gain(0, v.out);
      perc(c.gain, t, 0.8 * e.nb("hp", 2800), 1e-3, 0.22);
      v.noise(t, t + 0.25, v.filter("highpass", 2800, 0.7, c));
      const sh = v.gain(0, v.out);
      ahr(sh.gain, t, 0.35 * e.nb("bp", 6e3, 2), 2e-3, 0.05, 0.35);
      v.noise(t, t + 0.42, v.filter("bandpass", 6e3, 2, sh));
      const k = v.gain(0, v.out);
      perc(k.gain, t, 0.45, 1e-3, 0.07);
      glide(v.osc("sine", null, t, t + 0.08, k).frequency, t, 380, 170, 0.05);
      const hi = [2349, 2637, 3136, 3520, 4186, 4699, 5274, 6272];
      for (let i = 0; i < 7; i++) {
        const tt = t + 0.01 + R() * 0.35, d = 0.08 + R() * 0.2, g = v.gain(0, v.out);
        perc(g.gain, tt, 0.22 * (1 - i / 10), 1e-3, d);
        v.osc("sine", hi[R() * hi.length | 0] * (1 + (R() - 0.5) * 0.02), tt, tt + d + 0.01, g);
      }
    },
    yarn(e, v, t) {
      const g = v.gain(0, v.out);
      perc(g.gain, t, 0.9 * e.nb("lp", 800), 0.02, 0.3);
      const lp = v.filter("lowpass", null, 0.7, g);
      glide(lp.frequency, t, 1400, 350, 0.25);
      v.noise(t, t + 0.34, lp);
      const g2 = v.gain(0, v.out);
      perc(g2.gain, t, 0.3, 5e-3, 0.15);
      glide(v.osc("sine", null, t, t + 0.17, g2).frequency, t, 150, 90, 0.12);
      const g3 = v.gain(0, v.out);
      perc(g3.gain, t, 0.15 * e.nb("bp", 2600, 1), 5e-3, 0.06);
      v.noise(t, t + 0.08, v.filter("bandpass", 2600, 1, g3));
    }
  };
  var VOWELS = {
    m: [280, 1100, 2300],
    i: [320, 2250, 2950],
    e: [480, 1900, 2600],
    a: [780, 1300, 2550],
    o: [520, 950, 2450],
    u: [360, 760, 2300]
  };
  var MEOWS = {
    ryzhik: {
      f0: 600,
      dur: 0.5,
      fs: 1.3,
      vib: 5.5,
      vibD: 0.018,
      breath: 0.05,
      lvl: 1,
      pitch: [[0, 0.8], [0.1, 0.98], [0.36, 1.2], [0.72, 1.02], [1, 0.72]],
      vowels: [[0, "m"], [0.1, "i"], [0.4, "a"], [0.82, "u"], [1, "u"]],
      amp: [[0, 0], [0.06, 0.4], [0.16, 0.85], [0.45, 1], [0.66, 0.85], [0.88, 0.3], [1, 0]],
      mouth: [[0, 700], [0.12, 4500], [0.7, 3800], [1, 1100]]
    },
    ugolek: {
      f0: 560,
      dur: 0.3,
      fs: 1.22,
      vib: 6.5,
      vibD: 0.01,
      breath: 0.06,
      lvl: 1.3,
      pitch: [[0, 0.92], [0.18, 1.14], [0.55, 1.06], [1, 0.8]],
      vowels: [[0, "m"], [0.07, "e"], [0.3, "a"], [0.85, "u"], [1, "u"]],
      amp: [[0, 0], [0.04, 0.55], [0.1, 0.85], [0.35, 1], [0.62, 0.8], [0.85, 0.3], [1, 0]],
      mouth: [[0, 900], [0.08, 5500], [0.7, 4500], [1, 1400]]
    },
    barsik: {
      f0: 330,
      dur: 0.95,
      fs: 1,
      vib: 4.6,
      vibD: 0.03,
      breath: 0.06,
      lvl: 1.45,
      pitch: [[0, 0.82], [0.12, 1.02], [0.3, 1.12], [0.6, 1.08], [0.82, 0.95], [1, 0.7]],
      vowels: [[0, "m"], [0.08, "i"], [0.25, "a"], [0.65, "a"], [0.9, "u"], [1, "u"]],
      amp: [[0, 0], [0.05, 0.4], [0.14, 0.95], [0.7, 0.85], [0.9, 0.35], [1, 0]],
      mouth: [[0, 600], [0.1, 3800], [0.75, 3200], [1, 900]]
    },
    kitten: {
      f0: 980,
      dur: 0.27,
      fs: 1.6,
      vib: 7.5,
      vibD: 0.015,
      breath: 0.04,
      lvl: 0.98,
      pitch: [[0, 0.88], [0.3, 1.2], [0.7, 1.12], [1, 0.95]],
      vowels: [[0, "m"], [0.1, "i"], [0.55, "a"], [1, "u"]],
      amp: [[0, 0], [0.08, 0.6], [0.2, 1], [0.7, 0.7], [1, 0]],
      mouth: [[0, 1400], [0.15, 7e3], [0.8, 5500], [1, 2e3]]
    },
    // «МРЯУ?!» — ворчливое «мрр» и резкий подъём с вопросительной интонацией.
    sleeper: {
      f0: 340,
      dur: 0.8,
      fs: 1.12,
      vib: 6,
      vibD: 0.02,
      breath: 0.08,
      lvl: 1.1,
      roughHz: 31,
      pitch: [[0, 0.72], [0.26, 0.8], [0.36, 1.25], [0.56, 1.3], [0.8, 1.42], [1, 1.66]],
      vowels: [[0, "m"], [0.1, "u"], [0.28, "o"], [0.37, "i"], [0.5, "a"], [0.82, "a"], [1, "u"]],
      amp: [[0, 0], [0.05, 0.5], [0.25, 0.6], [0.31, 0.35], [0.38, 1], [0.8, 0.9], [0.95, 0.4], [1, 0]],
      mouth: [[0, 600], [0.25, 1200], [0.37, 5e3], [0.85, 4200], [1, 1500]],
      rough: [[0, 0.8], [0.28, 0.7], [0.34, 0], [1, 0]]
    },
    // «мррр-рр» — натужное урчание кота-помощника.
    helper: {
      f0: 240,
      dur: 0.6,
      fs: 1,
      vib: 5,
      vibD: 0.012,
      breath: 0.12,
      lvl: 1.4,
      roughHz: 26,
      pitch: [[0, 0.9], [0.25, 1.05], [0.5, 1], [0.62, 0.92], [1, 0.85]],
      vowels: [[0, "m"], [0.15, "u"], [0.5, "o"], [1, "u"]],
      amp: [[0, 0], [0.08, 0.8], [0.5, 0.9], [0.58, 0.35], [0.66, 0.8], [0.9, 0.5], [1, 0]],
      mouth: [[0, 500], [0.2, 1300], [0.5, 1500], [1, 700]],
      rough: [[0, 0.85], [1, 0.85]]
    },
    // Сонное «мрр…» (grumble).
    grumble: {
      f0: 190,
      dur: 0.7,
      fs: 1,
      vib: 4,
      vibD: 0.01,
      breath: 0.1,
      lvl: 1.1,
      roughHz: 22,
      pitch: [[0, 1], [0.3, 1.06], [1, 0.8]],
      vowels: [[0, "m"], [0.3, "u"], [1, "u"]],
      amp: [[0, 0], [0.15, 0.7], [0.6, 0.6], [1, 0]],
      mouth: [[0, 400], [0.3, 900], [1, 500]],
      rough: [[0, 0.7], [1, 0.5]]
    }
  };
  var Engine = class {
    constructor() {
      this.ctx = null;
      this.offline = false;
      this.persist = true;
      this.muted = readMuted();
      this.hidden = false;
      this.track = null;
      this.players = [];
      this.timer = 0;
      this.tOver = null;
      this.tempo = 1;
      this.slow = false;
      this.rnd = Math.random;
      this.stats = { total: 0, created: 0, sfx: 0, impact: 0, brk: 0, music: 0, snore: 0 };
      this.last = /* @__PURE__ */ Object.create(null);
      this.duckEnd = 0;
      this.duckLevel = 1;
      this.str = null;
      this.strTimer = 0;
      this.muteT = 0;
      this.unlockAt = -1e9;
      this.tickN = 0;
      this.lastError = null;
    }
    // ---- служебное
    now() {
      return this.tOver != null ? this.tOver : this.ctx.currentTime;
    }
    t0() {
      return this.now() + (this.offline ? 0 : 3e-3);
    }
    fq(f) {
      return clamp(f, 1, this.nyq * 0.96);
    }
    // Нормировка полосового шума к RMS ≈ 0.2 (независимо от ширины полосы и частоты дискретизации).
    nb(type, f, q) {
      const ny = this.nyq;
      const bw = type === "bp" ? 1.57 * f / (q || 1) : type === "lp" ? f : Math.max(ny - f, 300);
      return Math.min(30, 0.35 / Math.sqrt(Math.min(1, bw / ny)));
    }
    _count(cat, d) {
      const s = this.stats;
      s[cat] = (s[cat] || 0) + d;
      s.total += d;
      if (d > 0) s.created++;
    }
    _voice(o) {
      if (o.cat !== "music" && this.stats.total - this.stats.music >= MAX_VOICES) return null;
      return new Voice(this, o);
    }
    _ok() {
      const c = this.ctx;
      if (!c || this.muted || this.hidden) return false;
      if (this.offline || c.state === "running") return true;
      return c.state === "suspended" && perfNow() - this.unlockAt < 600;
    }
    _gate(key, gap) {
      const t = this.now(), l = this.last[key];
      if (l !== void 0 && t >= l && t - l < gap) return false;
      this.last[key] = t;
      return true;
    }
    _build(opts) {
      const c = this.ctx;
      this.nyq = c.sampleRate / 2;
      this.noiseBuf = makeNoise(c, this.rnd);
      this.glottal = makeGlottal(c);
      const G = (v) => {
        const g = c.createGain();
        g.gain.value = v;
        return g;
      };
      const LP = (f, q) => {
        const n = c.createBiquadFilter();
        n.type = "lowpass";
        n.frequency.value = f;
        n.Q.value = q;
        return n;
      };
      this.open = Math.min(2e4, this.nyq * 0.95);
      this.master = G(this.muted ? 0 : 1);
      if (opts && opts.dry) {
        this.master.connect(c.destination);
      } else {
        const comp = c.createDynamicsCompressor();
        comp.threshold.value = -12;
        comp.knee.value = 10;
        comp.ratio.value = 2.5;
        comp.attack.value = 8e-3;
        comp.release.value = 0.25;
        const lim = c.createDynamicsCompressor();
        lim.threshold.value = -3;
        lim.knee.value = 1;
        lim.ratio.value = 20;
        lim.attack.value = 1e-3;
        lim.release.value = 0.08;
        const pre = G(0.5);
        const clip = c.createWaveShaper();
        clip.curve = softClipCurve();
        const trimC = G(TRIM_COMP), trimL = G(TRIM_LIM);
        this.master.connect(comp);
        comp.connect(trimC);
        trimC.connect(lim);
        lim.connect(trimL);
        trimL.connect(pre);
        pre.connect(clip);
        clip.connect(c.destination);
        this.comp = comp;
        this.outNode = clip;
      }
      this.sfxIn = G(SFX_LEVEL);
      this.sfxLP = LP(this.open, 0.5);
      this.sfxIn.connect(this.sfxLP);
      this.sfxLP.connect(this.master);
      this.musicIn = G(MUSIC_LEVEL);
      this.duckA = G(1);
      this.musicLP = LP(this.open, 0.6);
      this.musicIn.connect(this.duckA);
      this.duckA.connect(this.musicLP);
      this.musicLP.connect(this.master);
      this.verbIn = G(1);
      const verb = c.createConvolver();
      verb.buffer = makeIR(c, 1.6, this.rnd);
      this.verbOut = G(VERB_LEVEL);
      this.verbIn.connect(verb);
      verb.connect(this.verbOut);
      this.verbOut.connect(this.master);
      this.musicWetIn = G(MUSIC_LEVEL);
      this.duckB = G(1);
      this.musicWetIn.connect(this.duckB);
      this.duckB.connect(this.verbIn);
      this.sfxA = { dry: this.sfxIn, wet: this.verbIn, cat: "sfx" };
    }
    _listen() {
      if (typeof document === "undefined" || typeof window === "undefined") return;
      this.hidden = document.visibilityState === "hidden";
      document.addEventListener("visibilitychange", () => {
        this.hidden = document.visibilityState === "hidden";
        if (this.hidden) this.stretchStop();
        this._syncRun();
      });
      const evs = ["pointerdown", "keydown", "touchend", "mousedown"];
      const retry = () => {
        const c = this.ctx;
        if (c && c.state === "running") {
          for (const ev of evs) window.removeEventListener(ev, retry, true);
          return;
        }
        if (!this.muted && !this.hidden) {
          this.unlockAt = perfNow();
          this._syncRun();
        }
      };
      for (const ev of evs) window.addEventListener(ev, retry, true);
    }
    // Контекст работает, только когда звук включён и вкладка видима (экономия CPU,
    // музыка ставится на паузу и продолжается с того же места).
    _syncRun() {
      const c = this.ctx;
      if (!c || this.offline) return;
      const want = !this.muted && !this.hidden;
      if (want && c.state !== "running") c.resume().catch(noop);
      else if (!want && c.state === "running") c.suspend().catch(noop);
    }
    _initOffline(ctx, opts) {
      this.ctx = ctx;
      this.offline = true;
      this.persist = false;
      this.muted = false;
      this.rnd = mulberry32(opts && opts.seed || 1);
      this._build(opts);
    }
    // ---- публичное: жизненный цикл
    unlock() {
      if (this.offline) return;
      if (!this.ctx) {
        const AC = typeof window !== "undefined" ? window.AudioContext || window.webkitAudioContext : null;
        if (!AC) return;
        let c;
        try {
          c = new AC({ latencyHint: "interactive" });
        } catch (e) {
          try {
            c = new AC();
          } catch (e2) {
            return;
          }
        }
        this.ctx = c;
        this._build();
        this._listen();
        if (this.slow) this._applySlow(false);
        if (this.track) this._applyTrack();
      }
      this.unlockAt = perfNow();
      this._syncRun();
    }
    setMuted(m) {
      m = !!m;
      if (m !== this.muted) {
        this.muted = m;
        if (this.persist) writeMuted(m);
      }
      const c = this.ctx;
      if (!c) return m;
      const t = c.currentTime, g = this.master.gain;
      clearTimeout(this.muteT);
      hold(g, t);
      if (m) {
        g.linearRampToValueAtTime(0, t + 0.06);
        this.stretchStop();
        if (!this.offline) this.muteT = setTimeout(() => this._syncRun(), 120);
      } else {
        g.linearRampToValueAtTime(1, t + 0.12);
        this.unlockAt = perfNow();
        this._syncRun();
      }
      return m;
    }
    // ---- музыка
    music(track) {
      const tr = track === "title" || track === "level" || track === "sketch" ? track : null;
      if (tr === this.track) return;
      this.track = tr;
      if (this.ctx) this._applyTrack();
    }
    _applyTrack() {
      const tr = this.track, t = this.now();
      const songName = tr === "title" ? "title" : tr ? "lofi" : null;
      let alive = false;
      for (const p2 of this.players) {
        if (p2.dieAt === Infinity && p2.song.name !== songName) {
          p2.fade(0, t, XFADE);
          p2.dieAt = t + XFADE;
          alive = true;
        }
      }
      if (!songName) return;
      let p = null;
      for (const q of this.players) if (q.song.name === songName && !q.disposed) p = q;
      if (!p) {
        p = new Player(this, SONGS[songName], tr === "title" ? "title" : tr, t);
        p.fade(p.song.gain || 1, t, alive ? XFADE : 0.03);
        this.players.push(p);
      } else {
        if (p.dieAt !== Infinity) {
          p.dieAt = Infinity;
          p.fade(p.song.gain || 1, t, XFADE * 0.6);
        }
        if (songName === "lofi") p.setArr(tr, t, XFADE);
      }
      this._ensureTimer();
    }
    _ensureTimer() {
      if (this.offline || this.timer || !this.players.length) return;
      this.timer = setInterval(() => this._tick(), TICK_MS);
      this._tick();
    }
    _tick() {
      try {
        const c = this.ctx;
        if (c && c.state === "running") this._pump(c.currentTime + LOOKAHEAD);
        if (!this.players.length) {
          clearInterval(this.timer);
          this.timer = 0;
        }
      } catch (e) {
        this.lastError = e;
      }
    }
    _pump(until) {
      const now = this.now();
      for (let i = this.players.length - 1; i >= 0; i--) {
        const p = this.players[i];
        if (now > p.dieAt + 0.05) {
          p.dispose();
          this.players.splice(i, 1);
          continue;
        }
        p.scheduleUntil(Math.min(until, p.dieAt + 0.05));
      }
    }
    duck(amount, seconds) {
      if (!this.ctx) return;
      const am = c01(amount), sec = clamp(num(seconds, 0.5), 0, 30);
      if (am <= 0 || sec <= 0) return;
      const t = this.now();
      let level = 1 - am * 0.95;
      if (t < this.duckEnd) level = Math.min(level, this.duckLevel);
      this.duckLevel = level;
      this.duckEnd = Math.max(this.duckEnd, t + sec);
      for (const g of [this.duckA, this.duckB]) {
        const p = g.gain;
        hold(p, t);
        p.setTargetAtTime(level, t, 0.04);
        p.setTargetAtTime(1, this.duckEnd, 0.3);
      }
    }
    slowmo(on) {
      on = !!on;
      if (on === this.slow) return;
      this.slow = on;
      this.tempo = on ? 0.88 : 1;
      if (this.ctx) this._applySlow(true);
    }
    _applySlow(withSound) {
      const on = this.slow, t = this.now();
      const f = this.musicLP.frequency, sf = this.sfxLP.frequency, vg = this.verbOut.gain;
      hold(f, t);
      hold(sf, t);
      hold(vg, t);
      f.setTargetAtTime(on ? 650 : this.open, t, on ? 0.12 : 0.3);
      sf.setTargetAtTime(on ? 4200 : this.open, t, on ? 0.12 : 0.3);
      vg.setTargetAtTime(on ? VERB_LEVEL * 1.8 : VERB_LEVEL, t, 0.2);
      if (on && withSound && this._ok()) {
        const v = this._voice({ gain: LV.slowmo, wet: 0.3 });
        if (!v) return;
        const g = v.gain(0, v.out);
        perc(g.gain, t, 0.5, 0.05, 0.6);
        glide(v.osc("sine", null, t, t + 0.7, g).frequency, t, 190, 55, 0.6);
        const n = v.gain(0, v.out);
        perc(n.gain, t, 0.5 * this.nb("lp", 600), 0.12, 0.45);
        const lp = v.filter("lowpass", null, 1, n);
        glide(lp.frequency, t, 1200, 200, 0.55);
        v.noise(t, t + 0.6, lp);
      }
    }
    // ---- рогатка
    stretch(power) {
      if (!this._ok()) return;
      const p = c01(power);
      const wall = this.offline ? this.now() : perfNow() / 1e3;
      let S = this.str;
      if (!S) {
        S = this.str = this._mkStretch(this.t0(), wall);
        if (!S) return;
        this._watch();
      }
      S.lastCall = perfNow();
      if (wall - S.lastUpd < 0.03 && Math.abs(p - S.lastP) < 0.08) return;
      const dt = Math.max(0.016, wall - S.lastW);
      const motion = Math.min(1, Math.abs(p - S.lastP) / dt / 1.2);
      S.lastP = p;
      S.lastW = wall;
      S.lastUpd = wall;
      const t = this.now(), tc = 0.05;
      const creak = (0.18 + 0.82 * motion) * (0.25 + 0.75 * p);
      S.cg.gain.setTargetAtTime(creak, t, tc);
      S.osc.frequency.setTargetAtTime(24 + 60 * p + 45 * motion, t, tc);
      S.b1.frequency.setTargetAtTime(380 + 650 * p, t, tc);
      S.b2.frequency.setTargetAtTime(1250 + 1500 * p, t, tc);
      S.tg.gain.setTargetAtTime(0.12 * p * p, t, 0.08);
      S.tone.frequency.setTargetAtTime(95 + 260 * p, t, 0.06);
    }
    _mkStretch(t, wall) {
      const v = this._voice({ gain: LV.stretch, pan: -0.35, wet: 0.06 });
      if (!v) return null;
      const end = t + 600;
      const cg = v.gain(0, v.out);
      const hp = v.filter("highpass", 180, 0.7);
      const b1 = v.filter("bandpass", 420, 6, v.gain(2.2, cg));
      const b2 = v.filter("bandpass", 1400, 9, v.gain(1.6, cg));
      hp.connect(b1);
      hp.connect(b2);
      const osc = v.osc("sawtooth", 30, t, end, hp);
      v.noise(t, end, v.gain(9, osc.frequency), 8e-4);
      const tg = v.gain(0, v.out);
      const tone = v.osc("triangle", 95, t, end, v.filter("lowpass", 800, 0.7, tg));
      return { v, cg, osc, b1, b2, tg, tone, lastP: 0, lastW: wall, lastUpd: -1, lastCall: perfNow() };
    }
    _watch() {
      if (this.offline || this.strTimer) return;
      this.strTimer = setInterval(() => {
        const S = this.str;
        if (!S) {
          clearInterval(this.strTimer);
          this.strTimer = 0;
        } else if (perfNow() - S.lastCall > 120) this.stretchStop();
      }, 40);
    }
    stretchStop() {
      const S = this.str;
      if (this.strTimer) {
        clearInterval(this.strTimer);
        this.strTimer = 0;
      }
      if (!S) return;
      this.str = null;
      const t = this.now();
      S.v.out.gain.setTargetAtTime(0, t, 0.03);
      S.v.kill(t + 0.25);
    }
    launch(power) {
      this.stretchStop();
      if (!this._ok() || !this._gate("launch", 0.05)) return;
      const p = c01(power, 0.7), R = this.rnd, t = this.t0();
      const v = this._voice({ gain: LV.launch * (0.45 + 0.55 * p), panner: true, wet: 0.12 });
      if (!v) return;
      const th = v.gain(0, v.out);
      perc(th.gain, t, 0.9 * this.nb("bp", 950, 1.4), 1e-3, 0.09);
      v.noise(t, t + 0.11, v.filter("bandpass", 950, 1.4, th));
      const kn = v.gain(0, v.out);
      perc(kn.gain, t, 0.5, 1e-3, 0.07);
      glide(v.osc("triangle", null, t, t + 0.08, kn).frequency, t, 520 * (0.95 + R() * 0.1), 380, 0.06);
      const lo = v.gain(0, v.out);
      perc(lo.gain, t, 0.7, 2e-3, 0.12);
      glide(v.osc("sine", null, t, t + 0.13, lo).frequency, t, 170, 80, 0.1);
      const bf = 190 + 110 * p, bd = 0.45 + 0.2 * p;
      const bg = v.gain(0, v.out);
      perc(bg.gain, t + 0.01, 0.4, 4e-3, bd);
      const bo = v.osc("triangle", null, t, t + bd + 0.03, bg);
      bo.frequency.setValueAtTime(bf * 0.85, t);
      bo.frequency.exponentialRampToValueAtTime(bf * 1.1, t + 0.05);
      bo.frequency.exponentialRampToValueAtTime(bf * 0.9, t + bd);
      const wob = v.gain(null);
      wob.connect(bo.frequency);
      wob.gain.setValueAtTime(bf * 0.22, t);
      wob.gain.exponentialRampToValueAtTime(bf * 0.01, t + bd);
      v.osc("sine", 13 + 4 * p, t, t + bd + 0.03, wob);
      const wg = v.gain(0, v.out);
      wg.gain.setValueAtTime(0, t);
      wg.gain.linearRampToValueAtTime((0.1 + 0.6 * p) * this.nb("bp", 1800, 1.6), t + 0.07);
      wg.gain.exponentialRampToValueAtTime(1e-4, t + 0.5);
      const wf = v.filter("bandpass", null, 1.6, wg);
      wf.frequency.setValueAtTime(500, t);
      wf.frequency.exponentialRampToValueAtTime(2600 + 1200 * p, t + 0.12);
      wf.frequency.exponentialRampToValueAtTime(900, t + 0.5);
      v.noise(t, t + 0.52, wf);
      v.pan.pan.setValueAtTime(-0.25, t);
      v.pan.pan.linearRampToValueAtTime(0.45, t + 0.45);
    }
    // ---- коты
    meow(kind, pan) {
      if (!this._ok()) return;
      const k = MEOWS[kind] && kind !== "grumble" ? kind : "ryzhik";
      if (!this._gate("m_" + k, 0.08)) return;
      this._meow(k, cpan(pan), this.t0(), 1);
    }
    _meow(kind, pan, t, lvl) {
      const P = MEOWS[kind], R = this.rnd;
      const k = 1 + (R() * 2 - 1) * 0.08;
      const dur = P.dur * (0.94 + R() * 0.12);
      const fs = P.fs * (0.97 + R() * 0.06);
      const f0 = P.f0 * k, end = t + dur + 0.03;
      const v = this._voice({ gain: LV.meow * P.lvl * lvl, pan, wet: 0.14 });
      if (!v) return;
      const src = v.osc(this.glottal, null, t, end);
      src.frequency.setValueCurveAtTime(curve(P.pitch, 64, f0), t, dur);
      const vib = v.gain(null, src.frequency);
      vib.gain.setValueAtTime(0, t);
      vib.gain.linearRampToValueAtTime(f0 * P.vibD, t + dur * 0.4);
      v.osc("sine", P.vib * (0.95 + R() * 0.1), t, end, vib);
      const amp = v.gain(null);
      amp.gain.setValueCurveAtTime(curve(P.amp, 64, 1), t, dur);
      const mouth = v.filter("lowpass", null, 0.7, amp);
      mouth.frequency.setValueCurveAtTime(curve(P.mouth, 32, 1), t, dur);
      const fg = [1.7, 1.35, 0.8], fqs = [2.4, 3.4, 5];
      for (let i = 0; i < 3; i++) {
        const bp = v.filter("bandpass", null, fqs[i], v.gain(fg[i], mouth));
        const pts = P.vowels.map((p) => [p[0], VOWELS[p[1]][i] * fs]);
        bp.frequency.setValueCurveAtTime(curve(pts, 32, 1), t, dur);
        src.connect(bp);
      }
      src.connect(v.filter("lowpass", 900, 0.7, v.gain(0.35, mouth)));
      const bg = v.gain(0, mouth);
      ahr(bg.gain, t, P.breath * this.nb("hp", 1800), 0.03, dur * 0.6, dur * 0.4);
      v.noise(t, end, v.filter("highpass", 1800, 0.7, bg));
      if (P.rough) {
        const am = v.gain(null, v.out);
        amp.connect(am);
        const depth = P.rough;
        am.gain.setValueCurveAtTime(curve(depth.map((d) => [d[0], 1 - d[1] / 2]), 32, 1), t, dur);
        const lg = v.gain(null, am.gain);
        lg.gain.setValueCurveAtTime(curve(depth.map((d) => [d[0], d[1] / 2]), 32, 1), t, dur);
        v.osc("triangle", P.roughHz * (0.95 + R() * 0.1), t, end, lg);
      } else {
        amp.connect(v.out);
      }
    }
    // ---- физика
    impact(material, strength, pan) {
      if (!this._ok()) return;
      const s = c01(strength);
      if (s < 0.05) return;
      const m = IMPACT[material] ? material : "wood";
      if (this.stats.impact >= MAX_IMPACTS || !this._gate("i_" + m, 0.03)) return;
      const v = this._voice({ gain: LV["i_" + m] * Math.pow(s, 0.9), pan: cpan(pan), wet: 0.08, cat: "impact" });
      if (v) IMPACT[m](this, v, this.t0(), s);
    }
    breakBlock(material, pan) {
      if (!this._ok()) return;
      const m = BREAK[material] ? material : "wood";
      if (this.stats.brk >= MAX_BREAKS || !this._gate("b_" + m, 0.04)) return;
      const v = this._voice({ gain: LV["b_" + m], pan: cpan(pan), wet: 0.15, cat: "brk" });
      if (v) BREAK[m](this, v, this.t0());
    }
    fish(combo) {
      if (!this._ok() || !this._gate("fish", 0.035)) return;
      const c = Math.max(0, Math.floor(num(combo, 0))) % 8;
      const base = 79 + [0, 2, 4, 5, 7, 9, 11, 12][c];
      const v = this._voice({ gain: LV.fish, wet: 0.25, pan: 0.1 });
      if (!v) return;
      const t = this.t0(), R = this.rnd;
      [0, 7, 12].forEach((iv, i) => {
        const tt = t + i * 0.045, f = mtof(base + iv);
        const g = v.gain(0, v.out);
        perc(g.gain, tt, 0.2 - i * 0.02, 2e-3, 0.16);
        v.osc("square", f, tt, tt + 0.17, v.filter("lowpass", 3200, 0.7, g));
        const g2 = v.gain(0, v.out);
        perc(g2.gain, tt, 0.14, 1e-3, 0.09);
        v.osc("sine", f * 2, tt, tt + 0.1, g2);
      });
      for (let i = 0; i < 2; i++) {
        const tt = t + 0.13 + i * 0.05 + R() * 0.02, g = v.gain(0, v.out);
        perc(g.gain, tt, 0.07, 1e-3, 0.1);
        v.osc("sine", 3800 + R() * 2400, tt, tt + 0.11, g);
      }
    }
    // ---- соня
    snore(pan) {
      if (!this._ok() || this.stats.snore >= 3 || !this._gate("snore", 0.4)) return;
      const v = this._voice({ gain: LV.snore, pan: cpan(pan), wet: 0.15, cat: "snore" });
      if (!v) return;
      const t = this.t0(), R = this.rnd, k = 0.94 + R() * 0.12;
      const ig = v.gain(0, v.out);
      ig.gain.setValueAtTime(0, t);
      ig.gain.linearRampToValueAtTime(0.55, t + 0.75);
      ig.gain.linearRampToValueAtTime(0, t + 1.15);
      const ilp = v.filter("lowpass", null, 3, ig);
      ilp.frequency.setValueAtTime(280, t);
      ilp.frequency.linearRampToValueAtTime(520, t + 1);
      const saw = v.osc("sawtooth", null, t, t + 1.2, ilp);
      saw.frequency.setValueAtTime(26 * k, t);
      saw.frequency.linearRampToValueAtTime(34 * k, t + 0.9);
      v.noise(t, t + 1.2, v.filter("bandpass", 700, 0.8, v.gain(0.3 * this.nb("bp", 700, 0.8), ig)));
      const t2 = t + 1.3;
      const wg = v.gain(0, v.out);
      ahr(wg.gain, t2, 0.14, 0.25, 0.3, 0.45);
      const wh = v.osc("sine", null, t2, t2 + 1.05, wg);
      wh.frequency.setValueAtTime(820 * k, t2);
      wh.frequency.linearRampToValueAtTime(1250 * k, t2 + 0.3);
      wh.frequency.linearRampToValueAtTime(760 * k, t2 + 0.95);
      v.osc("sine", 6, t2, t2 + 1.05, v.gain(14, wh.frequency));
      const bg = v.gain(0, v.out);
      ahr(bg.gain, t2, 0.2 * this.nb("bp", 1300, 1.2), 0.2, 0.3, 0.45);
      v.noise(t2, t2 + 1.05, v.filter("bandpass", 1300, 1.2, bg));
    }
    grumble(pan) {
      if (!this._ok() || !this._gate("grumble", 0.3)) return;
      this._meow("grumble", cpan(pan), this.t0(), 1);
    }
    wake(pan) {
      if (!this._ok() || !this._gate("wake", 0.25)) return;
      const pn = cpan(pan), t = this.t0();
      this.duck(0.35, 1.1);
      const v = this._voice({ gain: LV.wake, pan: pn, wet: 0.18 });
      if (!v) return;
      [79, 84].forEach((m, i) => {
        const tt = t + i * 0.085, f = mtof(m);
        const g = v.gain(0, v.out);
        perc(g.gain, tt, 0.4, 2e-3, 0.2);
        v.osc("triangle", f, tt, tt + 0.21, g);
        const g2 = v.gain(0, v.out);
        perc(g2.gain, tt, 0.18, 1e-3, 0.06);
        v.osc("sine", f * 4, tt, tt + 0.07, g2);
      });
      const w = v.gain(0, v.out);
      perc(w.gain, t, 0.3 * this.nb("bp", 1800, 1.5), 5e-3, 0.08);
      const bp = v.filter("bandpass", null, 1.5, w);
      glide(bp.frequency, t, 800, 3e3, 0.08);
      v.noise(t, t + 0.1, bp);
      this._meow("sleeper", pn, t + 0.17, 1);
    }
    // ---- способности
    dash() {
      if (!this._ok() || !this._gate("dash", 0.1)) return;
      const t = this.t0();
      const v = this._voice({ gain: LV.dash, panner: true, wet: 0.12 });
      if (!v) return;
      const w = v.gain(0, v.out);
      w.gain.setValueAtTime(0, t);
      w.gain.linearRampToValueAtTime(0.9 * this.nb("bp", 1500, 1.8), t + 0.04);
      w.gain.exponentialRampToValueAtTime(1e-4, t + 0.45);
      const bp = v.filter("bandpass", null, 1.8, w);
      bp.frequency.setValueAtTime(450, t);
      bp.frequency.exponentialRampToValueAtTime(3800, t + 0.2);
      bp.frequency.exponentialRampToValueAtTime(1600, t + 0.45);
      v.noise(t, t + 0.46, bp);
      const z = v.gain(0, v.out);
      perc(z.gain, t, 0.16, 4e-3, 0.2);
      glide(v.osc("square", null, t, t + 0.21, v.filter("lowpass", 2400, 5, z)).frequency, t, 200, 1300, 0.15);
      const z2 = v.gain(0, v.out);
      perc(z2.gain, t, 0.12, 4e-3, 0.18);
      glide(v.osc("sine", null, t, t + 0.19, z2).frequency, t, 400, 2600, 0.15);
      v.pan.pan.setValueAtTime(-0.5, t);
      v.pan.pan.linearRampToValueAtTime(0.6, t + 0.35);
    }
    pound() {
      if (!this._ok() || !this._gate("pound", 0.15)) return;
      const t = this.t0();
      const v = this._voice({ gain: LV.pound, wet: 0.15 });
      if (!v) return;
      const g = v.gain(0, v.out);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.45, t + 0.03);
      g.gain.linearRampToValueAtTime(0.3, t + 0.42);
      g.gain.exponentialRampToValueAtTime(1e-4, t + 0.56);
      const o = v.osc("sine", null, t, t + 0.57, g);
      glide(o.frequency, t, 1900, 560, 0.5);
      v.osc("sine", 7, t, t + 0.57, v.gain(22, o.frequency));
      const a = v.gain(0, v.out);
      ahr(a.gain, t, 0.12 * this.nb("bp", 1e3, 4), 0.03, 0.38, 0.12);
      const bp = v.filter("bandpass", null, 4, a);
      glide(bp.frequency, t, 1900, 560, 0.5);
      v.noise(t, t + 0.56, bp);
    }
    boom(strength) {
      if (!this._ok() || !this._gate("boom", 0.08)) return;
      const s = c01(strength, 1), t = this.t0();
      const v = this._voice({ gain: LV.boom * (0.45 + 0.55 * s), wet: 0.2 });
      if (!v) return;
      this.duck(0.55 * s, 0.35);
      const sub = v.gain(0, v.out);
      const sd = 0.8 + 0.4 * s;
      perc(sub.gain, t, 1, 4e-3, sd);
      glide(v.osc("sine", null, t, t + sd + 0.01, sub).frequency, t, 95, 33, 0.45);
      const b = v.gain(0, v.out);
      perc(b.gain, t, 0.5, 2e-3, 0.25);
      glide(v.osc("sine", null, t, t + 0.26, b).frequency, t, 180, 70, 0.15);
      const r = v.gain(0, v.out);
      const rd = 1.1 + 0.4 * s;
      perc(r.gain, t, 0.9 * this.nb("lp", 170), 0.01, rd);
      v.noise(t, t + rd + 0.02, v.filter("lowpass", 170, 0.9, r));
      const c = v.gain(0, v.out);
      perc(c.gain, t, 0.35 * this.nb("lp", 3e3), 8e-4, 0.04);
      v.noise(t, t + 0.05, v.filter("lowpass", 3e3, 0.7, c));
      const dg = v.gain(0, v.out);
      const dbp = v.filter("bandpass", 900, 1.2, dg);
      const end = grains(dg.gain, dbp.frequency, t + 0.05, 0.5, 8, 0.35 * s * this.nb("bp", 900, 1.2), this.rnd, [600, 1500], [0.01, 0.04]);
      v.noise(t + 0.05, end + 0.02, dbp);
    }
    split() {
      if (!this._ok() || !this._gate("split", 0.1)) return;
      const t = this.t0(), R = this.rnd;
      [-0.45, 0, 0.45].forEach((pn, i) => {
        const v = this._voice({ gain: LV.split, pan: pn, wet: 0.12 });
        if (!v) return;
        const tt = t + i * 0.075, f = [520, 660, 820][i] * (0.97 + R() * 0.06);
        const g = v.gain(0, v.out);
        perc(g.gain, tt, 0.5, 1e-3, 0.08);
        const o = v.osc("sine", null, tt, tt + 0.09, g);
        o.frequency.setValueAtTime(f * 0.6, tt);
        o.frequency.exponentialRampToValueAtTime(f * 1.5, tt + 0.03);
        o.frequency.exponentialRampToValueAtTime(f * 1.2, tt + 0.08);
        const c = v.gain(0, v.out);
        perc(c.gain, tt, 0.3 * this.nb("bp", 2500, 1), 5e-4, 0.012);
        v.noise(tt, tt + 0.02, v.filter("bandpass", 2500, 1, c));
      });
    }
    // ---- интерфейс
    ui(kind) {
      if (!this._ok()) return;
      const k = kind === "hover" || kind === "back" || kind === "open" ? kind : "click";
      if (!this._gate("ui_" + k, k === "hover" ? 0.06 : 0.03)) return;
      const t = this.t0();
      const v = this._voice({ gain: LV.ui * (k === "hover" ? 0.46 : 1), wet: 0.08 });
      if (!v) return;
      const note = (m, tt, pk, d) => {
        const f = mtof(m), g = v.gain(0, v.out);
        perc(g.gain, tt, pk, 2e-3, d);
        v.osc("triangle", f, tt, tt + d + 0.01, g);
        const g2 = v.gain(0, v.out);
        perc(g2.gain, tt, pk * 0.5, 1e-3, d * 0.5);
        v.osc("sine", f * 2, tt, tt + d * 0.5 + 0.01, g2);
      };
      const nk = 1.4;
      if (k === "click") {
        const g = v.gain(0, v.out);
        perc(g.gain, t, 0.5, 1e-3, 0.05);
        glide(v.osc("sine", null, t, t + 0.06, g).frequency, t, 950, 650, 0.03);
        const g2 = v.gain(0, v.out);
        perc(g2.gain, t, 0.12, 5e-4, 0.015);
        v.osc("triangle", 1900, t, t + 0.02, g2);
      } else if (k === "hover") {
        const g = v.gain(0, v.out);
        perc(g.gain, t, 0.4, 2e-3, 0.03);
        v.osc("sine", 1650, t, t + 0.04, g);
      } else if (k === "back") {
        note(74, t, 0.35 * nk, 0.12);
        note(67, t + 0.07, 0.35 * nk, 0.16);
      } else {
        note(67, t, 0.3 * nk, 0.12);
        note(74, t + 0.06, 0.3 * nk, 0.12);
        note(79, t + 0.12, 0.32 * nk, 0.2);
        const w = v.gain(0, v.out);
        perc(w.gain, t, 0.12 * this.nb("bp", 3e3, 1.5), 0.04, 0.15);
        const bp = v.filter("bandpass", null, 1.5, w);
        glide(bp.frequency, t, 1500, 5e3, 0.18);
        v.noise(t, t + 0.2, bp);
      }
    }
    star(i) {
      if (!this._ok() || !this._gate("star", 0.05)) return;
      const n = clamp(Math.floor(num(i, 0)), 0, 2), t = this.t0(), R = this.rnd;
      this.duck(0.35, 0.9);
      const v = this._voice({ gain: LV.star * [1.17, 0.98, 1.66][n], wet: 0.3, pan: (n - 1) * 0.3 });
      if (!v) return;
      const bright = 0.55 + 0.25 * n, dec = 1 + 0.3 * n;
      const notes = [[84, 76], [88, 79], [91, 84]][n];
      INS.bell(this, v, t, notes[0], 0.3, bright, dec);
      INS.bell(this, v, t + 0.012, notes[1], 0.14, bright * 0.6, dec * 0.8);
      if (n === 2) {
        [96, 100, 103, 108].forEach((m, j) => INS.box(this, this.sfxA, t + 0.08 + j * 0.05, m, 0.35, 0.6, 0.3 - 0.2 * j));
        const w = v.gain(0, v.out);
        perc(w.gain, t, 0.06 * this.nb("bp", 7e3, 2), 0.05, 0.5);
        v.noise(t, t + 0.56, v.filter("bandpass", 7e3, 2, w));
      } else {
        INS.box(this, this.sfxA, t + 0.06, notes[0] + 12, 0.18, 0.5, 0.2);
      }
    }
    win() {
      if (!this._ok() || !this._gate("win", 0.5)) return;
      this.duck(0.85, 2.9);
      const t = this.t0(), R = this.rnd;
      const A = { dry: this._jingleBus(LV.win, 4.6), wet: this.verbIn, cat: "sfx" };
      if (!A.dry) return;
      [72, 76, 79, 84].forEach((m, i) => {
        INS.box(this, A, t + i * 0.1, m, 0.9, 0.9, -0.3 + i * 0.15);
        INS.mallet(this, A, t + i * 0.1, m, 0.55, 0.1);
      });
      [[0.46, 83, 0.1], [0.56, 84, 0.12], [0.7, 86, 0.18]].forEach(([dt, m, d]) => INS.mallet(this, A, t + dt, m, 0.9, d));
      const tc = t + 0.9;
      INS.mallet(this, A, tc, 88, 1, 0.6);
      INS.box(this, A, tc, 88, 0.8, 1.6, 0.1);
      [60, 64, 67, 71, 74].forEach((m, i) => INS.rhodes(this, A, tc + i * 0.012, m, 0.8, 1.3));
      INS.bass(this, A, tc, 36, 1, 1.2);
      INS.pad(this, A, tc, [64, 67, 71], 1.4, 1.2);
      INS.kick(this, A, tc, 0.9);
      [0.62, 0.68, 0.74, 0.8].forEach((dt, i) => INS.hat(this, A, t + dt, 0.35 + i * 0.1));
      const v = this._voice({ gain: 1, wet: 0.3, dest: A.dry });
      if (v) {
        const c = v.gain(0, v.out);
        perc(c.gain, tc, 0.22 * this.nb("hp", 5e3), 2e-3, 1.3);
        v.noise(tc, tc + 1.32, v.filter("highpass", 5e3, 0.7, c));
      }
      for (let i = 0; i < 5; i++) {
        INS.box(this, A, tc + 0.12 + i * 0.16 + R() * 0.05, [96, 100, 103, 108][R() * 4 | 0], 0.28, 0.7, R() - 0.5);
      }
    }
    lose() {
      if (!this._ok() || !this._gate("lose", 0.5)) return;
      this.duck(0.85, 2.4);
      const t = this.t0();
      [[55, 0, 0.34], [54, 0.38, 0.34], [53, 0.76, 0.34], [52, 1.14, 0.95]].forEach(([m, dt, d], i) => {
        const v = this._voice({ gain: LV.lose, wet: 0.14 });
        if (!v) return;
        const tt = t + dt, f = mtof(m), last = i === 3;
        const g = v.gain(0, v.out);
        ahr(g.gain, tt, 0.3, 0.025, d - 0.1, 0.1);
        const lp = v.filter("lowpass", null, 5, g);
        lp.frequency.setValueAtTime(350, tt);
        lp.frequency.exponentialRampToValueAtTime(1500, tt + 0.1);
        lp.frequency.exponentialRampToValueAtTime(last ? 420 : 500, tt + d);
        const saw = v.osc("sawtooth", null, tt, tt + d + 0.05, lp);
        saw.frequency.setValueAtTime(f, tt);
        saw.frequency.linearRampToValueAtTime(f * 0.985, tt + d);
        const sq = v.osc("square", null, tt, tt + d + 0.05, v.gain(0.25, lp));
        sq.frequency.setValueAtTime(f / 2, tt);
        sq.frequency.linearRampToValueAtTime(f / 2 * 0.985, tt + d);
        if (last) {
          const vg = v.gain(0);
          vg.gain.setValueAtTime(0, tt);
          vg.gain.linearRampToValueAtTime(f * 0.022, tt + 0.25);
          vg.connect(saw.frequency);
          v.osc("sine", 5.5, tt, tt + d + 0.05, vg);
          v.osc("sine", 5.5, tt, tt + d + 0.05, v.gain(350, lp.frequency));
        }
      });
    }
    tick() {
      if (!this._ok() || !this._gate("tick", 0.045)) return;
      this.tickN = (this.tickN + 1) % 3;
      const t = this.t0(), f = 2e3 * (1 + 0.03 * this.tickN);
      const v = this._voice({ gain: LV.tick });
      if (!v) return;
      const g = v.gain(0, v.out);
      perc(g.gain, t, 0.5, 1e-3, 0.03);
      v.osc("sine", f, t, t + 0.035, g);
      const g2 = v.gain(0, v.out);
      perc(g2.gain, t, 0.1, 5e-4, 0.012);
      v.osc("sine", f * 2, t, t + 0.015, g2);
    }
    // Волшебная смена мира (салфетка ⇄ цвет).
    wipe() {
      if (!this._ok() || !this._gate("wipe", 0.3)) return;
      const t = this.t0(), R = this.rnd;
      this.duck(0.3, 1.2);
      const v = this._voice({ gain: LV.wipe, panner: true, wet: 0.35 });
      if (!v) return;
      const w = v.gain(0, v.out);
      w.gain.setValueAtTime(0, t);
      w.gain.linearRampToValueAtTime(0.5 * this.nb("bp", 2e3, 1.4), t + 0.45);
      w.gain.linearRampToValueAtTime(0.3 * this.nb("bp", 2e3, 1.4), t + 0.9);
      w.gain.linearRampToValueAtTime(0, t + 1.25);
      const bp = v.filter("bandpass", null, 1.4, w);
      bp.frequency.setValueAtTime(250, t);
      bp.frequency.exponentialRampToValueAtTime(4500, t + 0.65);
      bp.frequency.exponentialRampToValueAtTime(1500, t + 1.2);
      v.noise(t, t + 1.27, bp);
      v.pan.pan.setValueAtTime(-0.7, t);
      v.pan.pan.linearRampToValueAtTime(0.7, t + 1.2);
      const sh = v.gain(0, v.out);
      sh.gain.setValueAtTime(0, t);
      sh.gain.linearRampToValueAtTime(0.05, t + 0.6);
      sh.gain.linearRampToValueAtTime(0, t + 1.3);
      const trem = v.gain(0.5, sh);
      v.osc("sine", 11, t, t + 1.32, v.gain(0.5, trem.gain));
      v.osc("sine", 2093, t, t + 1.32, trem);
      v.osc("sine", 3136, t, t + 1.32, v.gain(0.6, trem));
      const gl = [72, 74, 76, 79, 81, 84, 86, 88, 91, 93, 96];
      for (let i = 0; i < gl.length; i++) {
        const x = i / (gl.length - 1);
        INS.box(this, this.sfxA, t + 0.95 * Math.pow(x, 0.8) + R() * 0.01, gl[i], 0.62 + 0.71 * x, 0.9, -0.7 + 1.4 * x);
      }
    }
    // Карандаш по бумаге: несколько штрихов туда-сюда.
    scribble() {
      if (!this._ok() || !this._gate("scribble", 0.12)) return;
      const t = this.t0(), R = this.rnd;
      const v = this._voice({ gain: LV.scribble, pan: (R() - 0.5) * 0.4, wet: 0.05 });
      if (!v) return;
      const g = v.gain(0, v.out);
      const bp = v.filter("bandpass", 3400, 0.9, g);
      const hp = v.filter("highpass", 1600, 0.7, bp);
      const grit = v.filter("bandpass", 1300, 1.1, v.gain(0.5, g));
      const pk = 0.9 * this.nb("bp", 3400, 0.9);
      const n = 5 + (R() * 3 | 0);
      let tt = t;
      g.gain.setValueAtTime(0, t);
      for (let i = 0; i < n; i++) {
        const d = 0.04 + R() * 0.035, a = pk * (0.6 + 0.4 * R());
        g.gain.setValueAtTime(1e-4, tt);
        g.gain.linearRampToValueAtTime(a, tt + 0.012);
        g.gain.linearRampToValueAtTime(a * 0.7, tt + d - 0.012);
        g.gain.exponentialRampToValueAtTime(1e-4, tt + d);
        bp.frequency.setValueAtTime(i & 1 ? 4200 : 3e3, tt);
        tt += d + 4e-3 + R() * 0.012;
      }
      v.noise(t, tt + 0.02, hp);
      v.noise(t, tt + 0.02, grit, 0.5);
    }
    // Шина для джингла: своя огибающая громкости, освобождается вместе с голосом-держателем.
    _jingleBus(level, dur) {
      const v = this._voice({ gain: level });
      if (!v) return null;
      const t = this.t0();
      v.osc("sine", 20, t, t + dur, v.gain(0));
      return v.out;
    }
    statsSnapshot() {
      const c = this.ctx;
      return {
        ctx: c ? c.state : null,
        time: c ? +c.currentTime.toFixed(3) : 0,
        muted: this.muted,
        track: this.track,
        players: this.players.length,
        voices: this.stats.total,
        music: this.stats.music,
        impact: this.stats.impact,
        created: this.stats.created,
        stretching: !!this.str,
        lastError: this.lastError ? String(this.lastError) : null
      };
    }
  };
  var API = [
    "unlock",
    "setMuted",
    "music",
    "duck",
    "stretch",
    "stretchStop",
    "launch",
    "meow",
    "impact",
    "breakBlock",
    "fish",
    "snore",
    "grumble",
    "wake",
    "dash",
    "pound",
    "boom",
    "split",
    "ui",
    "star",
    "win",
    "lose",
    "tick",
    "wipe",
    "scribble",
    "slowmo"
  ];
  function facade(e, test) {
    const wrap = (fn, dflt) => function() {
      try {
        return fn.apply(e, arguments);
      } catch (err) {
        e.lastError = err;
        return typeof dflt === "function" ? dflt() : dflt;
      }
    };
    const api = {};
    for (const name of API) api[name] = wrap(e[name]);
    api.setMuted = wrap(e.setMuted, () => e.muted);
    api.isMuted = () => !!e.muted;
    api.toggleMute = wrap(() => e.setMuted(!e.muted), () => e.muted);
    api._stats = wrap(e.statsSnapshot, null);
    if (test) {
      api._at = (t) => {
        e.tOver = t;
      };
      api._pump = wrap(e._pump);
      api._engine = e;
    }
    return api;
  }
  var engine = new Engine();
  var Audio = facade(engine, false);
  Audio._test = {
    INS,
    // для диагностики (замеры по инструментам)
    LV,
    create(ctx, opts) {
      const e = new Engine();
      e._initOffline(ctx, opts || {});
      return facade(e, true);
    }
  };
  var audio_default = Audio;

  // tools/audio-lab/lab.js
  window.KotaAudio = audio_default;
  var $ = (sel) => document.querySelector(sel);
  var el = (tag, props, ...kids) => {
    const n = document.createElement(tag);
    Object.assign(n, props || {});
    for (const k of kids) n.append(k);
    return n;
  };
  var unlocked = false;
  function ensureUnlock() {
    if (!unlocked) {
      unlocked = true;
      audio_default.unlock();
    }
  }
  document.addEventListener("pointerdown", ensureUnlock, true);
  document.addEventListener("keydown", ensureUnlock, true);
  var state = { strength: 0.7, pan: 0, combo: 0 };
  function section(title, hint) {
    const box = el("section", { className: "card" }, el("h2", { textContent: title }));
    if (hint) box.append(el("p", { className: "hint", textContent: hint }));
    const row = el("div", { className: "row" });
    box.append(row);
    $("#app").append(box);
    return row;
  }
  function btn(row, label, fn, cls) {
    const b = el("button", { textContent: label, className: cls || "" });
    b.addEventListener("click", () => {
      ensureUnlock();
      fn(b);
    });
    row.append(b);
    return b;
  }
  function slider(row, label, min, max, step, value, onInput) {
    const out = el("span", { className: "val", textContent: String(value) });
    const inp = el("input", { type: "range", min, max, step, value });
    inp.addEventListener("input", () => {
      out.textContent = inp.value;
      onInput(+inp.value);
    });
    row.append(el("label", { className: "sl" }, label + " ", inp, out));
  }
  function buildUI() {
    let r = section("Музыка", "title — колыбельная; level ⇄ sketch — одна пьеса на общих часах (переоркестровка без рестарта).");
    for (const tr of ["title", "level", "sketch"]) btn(r, tr, () => audio_default.music(tr), "music");
    btn(r, "стоп (null)", () => audio_default.music(null));
    btn(r, "duck 0.7 × 1.5 с", () => audio_default.duck(0.7, 1.5));
    let slow = false;
    btn(r, "slowmo: выкл", (b) => {
      slow = !slow;
      audio_default.slowmo(slow);
      b.textContent = "slowmo: " + (slow ? "вкл" : "выкл");
    });
    btn(r, "мир: цвет ⇄ салфетка", () => {
      const next = audio_default._stats().track === "sketch" ? "level" : "sketch";
      audio_default.wipe();
      audio_default.music(next);
    });
    r = section("Рогатка", "Зажмите площадку и тяните: stretch(power) каждый кадр, отпускание — launch(power) + мяу.");
    const pad = el("div", { className: "pad", textContent: "тяни меня" });
    r.append(pad);
    let drag = null;
    pad.addEventListener("pointerdown", (ev) => {
      ensureUnlock();
      pad.setPointerCapture(ev.pointerId);
      drag = { x: ev.clientX, y: ev.clientY, power: 0 };
      audio_default.meow("helper");
      const loop = () => {
        if (!drag) return;
        audio_default.stretch(drag.power);
        pad.style.setProperty("--p", drag.power);
        pad.textContent = "сила " + drag.power.toFixed(2);
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });
    pad.addEventListener("pointermove", (ev) => {
      if (drag) drag.power = Math.min(1, Math.hypot(ev.clientX - drag.x, ev.clientY - drag.y) / 220);
    });
    const release = () => {
      if (!drag) return;
      const p = drag.power;
      drag = null;
      pad.textContent = "тяни меня";
      pad.style.setProperty("--p", 0);
      if (p > 0.08) {
        audio_default.launch(p);
        setTimeout(() => audio_default.meow("ryzhik"), 60);
      } else audio_default.stretchStop();
    };
    pad.addEventListener("pointerup", release);
    pad.addEventListener("pointercancel", release);
    btn(r, "launch(0.3)", () => audio_default.launch(0.3));
    btn(r, "launch(1)", () => audio_default.launch(1));
    r = section("Коты", "meow(kind), соня: snore / grumble / wake.");
    for (const k of ["ryzhik", "ugolek", "barsik", "kitten", "sleeper", "helper"]) btn(r, "мяу " + k, () => audio_default.meow(k, state.pan));
    btn(r, "snore", () => audio_default.snore(state.pan));
    btn(r, "grumble", () => audio_default.grumble(state.pan));
    btn(r, "wake", () => audio_default.wake(state.pan));
    r = section("Удары и разрушения", "impact(material, strength, pan); «обвал» — 3 с по 8 вызовов на кадр (лимиты внутри модуля).");
    slider(r, "сила", 0, 1, 0.05, state.strength, (v) => state.strength = v);
    slider(r, "панорама", -1, 1, 0.1, state.pan, (v) => state.pan = v);
    r = section("", "");
    for (const m of ["cardboard", "wood", "ceramic", "yarn", "cat", "ground", "fish"]) btn(r, m, () => audio_default.impact(m, state.strength, state.pan));
    r = section("", "");
    for (const m of ["cardboard", "wood", "ceramic", "yarn"]) btn(r, "break " + m, () => audio_default.breakBlock(m, state.pan), "warm");
    btn(r, "обвал!", collapse, "warm");
    r = section("Рыбки и способности");
    const fb = btn(r, "fish(0)", () => {
      audio_default.fish(state.combo);
      state.combo++;
      fb.textContent = "fish(" + state.combo + ")";
    });
    btn(r, "сброс комбо", () => {
      state.combo = 0;
      fb.textContent = "fish(0)";
    });
    btn(r, "dash", () => audio_default.dash());
    btn(r, "pound", () => audio_default.pound());
    btn(r, "pound → boom", () => {
      audio_default.pound();
      setTimeout(() => audio_default.boom(1), 520);
    });
    btn(r, "boom(0.4)", () => audio_default.boom(0.4));
    btn(r, "boom(1)", () => audio_default.boom(1));
    btn(r, "split", () => audio_default.split());
    r = section("Интерфейс и итоги", "Наведение на кнопки этого блока — ui('hover').");
    const uiRow = r;
    for (const k of ["click", "back", "open"]) btn(r, "ui " + k, () => audio_default.ui(k));
    btn(r, "tick × 1.5 с", () => {
      const t0 = performance.now();
      const f = () => {
        audio_default.tick();
        if (performance.now() - t0 < 1500) requestAnimationFrame(f);
      };
      f();
    });
    for (let i = 0; i < 3; i++) btn(r, "star(" + i + ")", () => audio_default.star(i));
    btn(r, "три звезды", () => [0, 1, 2].forEach((i) => setTimeout(() => audio_default.star(i), i * 450)));
    btn(r, "win", () => audio_default.win(), "warm");
    btn(r, "lose", () => audio_default.lose());
    uiRow.addEventListener("pointerover", (ev) => {
      if (ev.target.tagName === "BUTTON") audio_default.ui("hover");
    });
    r = section("Салфетка");
    btn(r, "wipe", () => audio_default.wipe());
    btn(r, "scribble", () => audio_default.scribble());
    r = section("Замеры", "Офлайн-рендер каждого звука (OfflineAudioContext): пик и RMS после мастер-цепочки и «сырой» пик до неё.");
    btn(r, "запустить замеры", async (b) => {
      b.disabled = true;
      b.textContent = "считаю…";
      const res = await measureAll();
      showTable(res);
      b.disabled = false;
      b.textContent = "запустить замеры";
    });
    $("#app").append(el("div", { id: "results" }));
    $("#mute").addEventListener("click", () => {
      ensureUnlock();
      audio_default.toggleMute();
    });
    setInterval(() => {
      const s = audio_default._stats() || {};
      $("#mute").textContent = audio_default.isMuted() ? "🔇 звук выкл" : "🔊 звук вкл";
      $("#status").textContent = `контекст: ${s.ctx || "—"} · трек: ${s.track || "—"} · голосов: ${s.voices || 0} (музыка ${s.music || 0}, удары ${s.impact || 0}) · создано: ${s.created || 0}`;
    }, 200);
  }
  function collapse() {
    const mats = ["cardboard", "wood", "ceramic", "yarn", "cat", "ground"];
    const t0 = performance.now();
    let frame = 0;
    const f = () => {
      const k = 1 - (performance.now() - t0) / 3e3;
      for (let i = 0; i < 8; i++) audio_default.impact(mats[Math.random() * mats.length | 0], Math.random() * k, Math.random() * 2 - 1);
      if (frame % 20 === 0) audio_default.breakBlock(mats[Math.random() * 4 | 0], Math.random() * 2 - 1);
      frame++;
      if (k > 0) requestAnimationFrame(f);
    };
    f();
  }
  var SR = 44100;
  function analyze(buf) {
    const n = buf.length, chs = [];
    for (let c = 0; c < buf.numberOfChannels; c++) chs.push(buf.getChannelData(c));
    let peak = 0, dc = 0;
    const win = Math.floor(buf.sampleRate * 0.05);
    const wins = [];
    for (let i = 0; i < n; i += win) {
      let s2 = 0, cnt2 = 0;
      for (const d of chs) {
        for (let j = i; j < Math.min(n, i + win); j++) {
          const x = d[j];
          s2 += x * x;
          cnt2++;
          const a = x < 0 ? -x : x;
          if (a > peak) peak = a;
          dc += x;
        }
      }
      wins.push(Math.sqrt(s2 / Math.max(1, cnt2)));
    }
    const db = (x) => x > 0 ? 20 * Math.log10(x) : -200;
    let first = -1, last = -1, maxW = 0;
    wins.forEach((w, i) => {
      if (w > 1e-3) {
        if (first < 0) first = i;
        last = i;
      }
      if (w > maxW) maxW = w;
    });
    let s = 0, cnt = 0;
    if (first >= 0) {
      for (const d of chs) {
        for (let j = first * win; j < Math.min(n, (last + 1) * win); j++) {
          s += d[j] * d[j];
          cnt++;
        }
      }
    }
    const rms = cnt ? Math.sqrt(s / cnt) : 0;
    const tail = wins.slice(-2).reduce((a, b) => Math.max(a, b), 0);
    return {
      peak: +peak.toFixed(3),
      peakDb: +db(peak).toFixed(1),
      rms: +rms.toFixed(4),
      rmsDb: +db(rms).toFixed(1),
      maxWinDb: +db(maxW).toFixed(1),
      activeSec: first >= 0 ? +((last - first + 1) * win / buf.sampleRate).toFixed(2) : 0,
      tailDb: +db(tail).toFixed(1),
      dc: +(dc / (n * chs.length)).toFixed(5)
    };
  }
  async function renderSim(dur, setup, onStep, opts = {}) {
    const sr = opts.sr || SR;
    const ctx = new OfflineAudioContext(opts.ch || 2, Math.ceil(sr * dur), sr);
    const A = audio_default._test.create(ctx, { dry: !!opts.dry, seed: opts.seed || 7 });
    const dt = opts.dt || 0.1;
    const samples = [];
    let t = 0;
    A._at(0);
    if (setup) setup(A, 0);
    A._pump(0.25);
    const next = () => {
      const tn = +(t + dt).toFixed(6);
      if (tn >= dur - 0.02) return;
      ctx.suspend(tn).then(() => {
        t = tn;
        A._at(t);
        if (onStep) onStep(A, t);
        A._pump(t + 0.25);
        if (opts.sample && Math.abs(t / opts.sample - Math.round(t / opts.sample)) < dt / 2 / opts.sample) samples.push({ t: +t.toFixed(2), ...A._stats() });
        next();
        ctx.resume();
      }).catch((e) => console.warn("suspend", e));
    };
    next();
    const buf = await ctx.startRendering();
    return { buf, A, samples };
  }
  var T0 = 0.5;
  async function renderOnce(fn, dur, dry) {
    const ctx = new OfflineAudioContext(2, Math.ceil(SR * (dur + T0)), SR);
    const A = audio_default._test.create(ctx, { dry, seed: 3 });
    A._at(T0);
    fn(A, T0);
    const buf = await ctx.startRendering();
    return { buf, A };
  }
  var stretchSeq = (A, t0) => {
    for (let i = 0; i <= 72; i++) {
      A._at(t0 + i / 60);
      A.stretch(Math.min(1, i / 60));
    }
    A._at(t0 + 1.4);
    A.stretchStop();
  };
  var CASES = [
    ["stretch 0→1", stretchSeq, 1.8],
    ["launch(0.3)", (A) => A.launch(0.3), 1],
    ["launch(1)", (A) => A.launch(1), 1],
    ...["ryzhik", "ugolek", "barsik", "kitten", "sleeper", "helper"].map((k) => ["meow " + k, (A) => A.meow(k), 1.3]),
    ...["cardboard", "wood", "ceramic", "yarn", "cat", "ground", "fish"].flatMap((m) => [
      ["impact " + m + " 0.2", (A) => A.impact(m, 0.2, 0), 0.6],
      ["impact " + m + " 1", (A) => A.impact(m, 1, 0), 0.6]
    ]),
    ...["cardboard", "wood", "ceramic", "yarn"].map((m) => ["break " + m, (A) => A.breakBlock(m, 0), 1]),
    ["fish(0)", (A) => A.fish(0), 0.6],
    ["fish(7)", (A) => A.fish(7), 0.6],
    ["snore", (A) => A.snore(0), 2.8],
    ["grumble", (A) => A.grumble(0), 1.1],
    ["wake", (A) => A.wake(0), 1.4],
    ["dash", (A) => A.dash(), 0.8],
    ["pound", (A) => A.pound(), 0.8],
    ["boom(0.4)", (A) => A.boom(0.4), 2],
    ["boom(1)", (A) => A.boom(1), 2],
    ["split", (A) => A.split(), 0.6],
    ["ui click", (A) => A.ui("click"), 0.3],
    ["ui hover", (A) => A.ui("hover"), 0.3],
    ["ui back", (A) => A.ui("back"), 0.5],
    ["ui open", (A) => A.ui("open"), 0.6],
    ["star(0)", (A) => A.star(0), 2.2],
    ["star(1)", (A) => A.star(1), 2.4],
    ["star(2)", (A) => A.star(2), 2.8],
    ["win", (A) => A.win(), 4],
    ["lose", (A) => A.lose(), 2.6],
    ["tick", (A) => A.tick(), 0.2],
    ["wipe", (A) => A.wipe(), 2.2],
    ["scribble", (A) => A.scribble(), 0.8],
    ["slowmo on", (A) => A.slowmo(true), 1],
    [
      "collapse storm 3 s",
      (A, t0) => {
        const mats = ["cardboard", "wood", "ceramic", "yarn", "cat", "ground"];
        let seed = 5;
        const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647;
        for (let f = 0; f < 180; f++) {
          A._at(t0 + f / 60);
          for (let i = 0; i < 8; i++) A.impact(mats[rnd() * 6 | 0], rnd(), rnd() * 2 - 1);
          if (f % 15 === 0) A.breakBlock(mats[rnd() * 4 | 0], rnd() * 2 - 1);
        }
      },
      3.6
    ]
  ];
  var MUSIC = [
    ["music title 0–40 s", (A) => A.music("title"), null, 40],
    ["music level 0–42 s", (A) => A.music("level"), null, 42],
    ["music sketch 0–42 s", (A) => A.music("sketch"), null, 42],
    [
      "level→sketch@6→level@12→title@18→null@26",
      (A) => A.music("level"),
      (A, t) => {
        if (Math.abs(t - 6) < 0.01) A.music("sketch");
        if (Math.abs(t - 12) < 0.01) A.music("level");
        if (Math.abs(t - 18) < 0.01) A.music("title");
        if (Math.abs(t - 26) < 0.01) A.music(null);
      },
      30
    ],
    [
      "level + win@5 (duck)",
      (A) => A.music("level"),
      (A, t) => {
        if (Math.abs(t - 5) < 0.01) A.win();
      },
      10
    ]
  ];
  function segments(buf, seg) {
    const d0 = buf.getChannelData(0), d1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : d0;
    const w = Math.floor(buf.sampleRate * seg), out = [];
    for (let i = 0; i + w <= buf.length; i += w) {
      let s = 0;
      for (let j = i; j < i + w; j++) s += (d0[j] * d0[j] + d1[j] * d1[j]) / 2;
      const r = Math.sqrt(s / w);
      out.push(r > 0 ? +(20 * Math.log10(r)).toFixed(1) : -200);
    }
    return out;
  }
  async function measureAll(filter) {
    const rows = [];
    for (const [name, fn, dur] of CASES) {
      if (filter && !name.includes(filter)) continue;
      const full = await renderOnce(fn, dur, false);
      const dry = await renderOnce(fn, dur, true);
      const a = analyze(full.buf), b = analyze(dry.buf);
      rows.push({ name, ...a, rawPeak: b.peak, rawPeakDb: b.peakDb, rawWinDb: b.maxWinDb, rawRmsDb: b.rmsDb, err: full.A._stats().lastError });
    }
    for (const [name, setup, step, dur] of MUSIC) {
      if (filter && !name.includes(filter)) continue;
      const full = await renderSim(dur, setup, step, { dt: 0.1 });
      const dry = await renderSim(dur, setup, step, { dt: 0.1, dry: true });
      const a = analyze(full.buf), b = analyze(dry.buf);
      rows.push({ name, ...a, rawPeak: b.peak, rawPeakDb: b.peakDb, rawWinDb: b.maxWinDb, rawRmsDb: b.rmsDb, seg2s: segments(full.buf, 2).join(" "), err: full.A._stats().lastError });
    }
    return rows;
  }
  async function session(minutes = 5) {
    const dur = minutes * 60;
    let seed = 11;
    const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647;
    const mats = ["cardboard", "wood", "ceramic", "yarn", "cat", "ground", "fish"];
    const tracks = ["title", "level", "sketch", "level", "sketch", null, "level", "title"];
    const calls = { impact: 0, breakBlock: 0, fish: 0, stretch: 0, music: 0, other: 0 };
    let combo = 0;
    const heap0 = performance.memory ? performance.memory.usedJSHeapSize : 0;
    const t0 = performance.now();
    const onStep = (A2, t) => {
      const shot = t % 12;
      if (Math.abs(t % 40 - 0) < 0.025) {
        A2.music(tracks[Math.round(t / 40) % tracks.length]);
        A2.wipe();
        A2.scribble();
        calls.music++;
      }
      if (shot < 1.5) {
        for (let i = 0; i < 3; i++) A2.stretch(shot / 1.5);
        calls.stretch += 3;
        if (shot < 0.03) A2.meow("helper");
      } else if (shot < 1.53) {
        A2.launch(0.5 + rnd() * 0.5);
        A2.meow(["ryzhik", "ugolek", "barsik", "kitten"][rnd() * 4 | 0]);
        calls.other += 2;
        combo = 0;
      } else if (shot < 5) {
        for (let i = 0; i < 24; i++) A2.impact(mats[rnd() * mats.length | 0], rnd(), rnd() * 2 - 1);
        calls.impact += 24;
        if (rnd() < 0.12) {
          A2.breakBlock(mats[rnd() * 4 | 0], rnd() * 2 - 1);
          calls.breakBlock++;
        }
        if (rnd() < 0.1) {
          A2.fish(combo++);
          calls.fish++;
        }
        if (rnd() < 0.01) A2.boom(rnd());
        if (rnd() < 0.01) A2.dash();
        if (rnd() < 0.01) A2.split();
        if (rnd() < 5e-3) A2.pound();
        if (rnd() < 0.02) A2.slowmo(rnd() < 0.5);
      } else if (shot > 6 && shot < 6.03) {
        A2.slowmo(false);
        if (t / 12 % 3 < 1) {
          A2.wake(0.5);
          A2.win();
          [0, 1, 2].forEach((i) => A2.star(i));
        } else A2.lose();
        calls.other += 3;
      } else if (shot > 7 && shot < 8.5) {
        for (let i = 0; i < 3; i++) A2.tick();
        calls.other += 3;
      }
      if (Math.abs(t % 3 - 0) < 0.025) {
        A2.snore(-0.5);
        A2.snore(0.6);
        if (rnd() < 0.3) A2.grumble(0);
        A2.ui(rnd() < 0.5 ? "hover" : "click");
        calls.other += 4;
      }
    };
    const { buf, A, samples } = await renderSim(dur, (A2) => A2.music("level"), onStep, { dt: 0.05, sr: 24e3, ch: 1, sample: 10 });
    await new Promise((r) => setTimeout(r, 300));
    const end = A._stats();
    const heap1 = performance.memory ? performance.memory.usedJSHeapSize : 0;
    return {
      renderMs: Math.round(performance.now() - t0),
      calls,
      samples: samples.map((s) => ({ t: s.t, voices: s.voices, music: s.music, impact: s.impact, created: s.created, players: s.players })),
      end,
      maxVoices: Math.max(...samples.map((s) => s.voices)),
      maxMusic: Math.max(...samples.map((s) => s.music)),
      maxPlayers: Math.max(...samples.map((s) => s.players)),
      audio: analyze(buf),
      heapMB: heap0 ? [+(heap0 / 1e6).toFixed(1), +(heap1 / 1e6).toFixed(1)] : null
    };
  }
  var EDGE = [void 0, null, NaN, Infinity, -Infinity, -5, 0, 0.5, 1, 7, "0.7", "мяу", {}, []];
  function callEverything(A) {
    const errs = [];
    const call = (name, ...args) => {
      try {
        A[name](...args);
      } catch (e) {
        errs.push(name + ": " + e.message);
      }
    };
    for (const x of EDGE) {
      for (const m of ["stretch", "launch", "fish", "snore", "grumble", "wake", "boom", "star", "slowmo", "duck"]) call(m, x, x);
      for (const mat of ["cardboard", "wood", "ceramic", "yarn", "cat", "ground", "fish", "бетон", x]) {
        call("impact", mat, x, x);
        call("breakBlock", mat, x);
      }
      for (const k of ["ryzhik", "ugolek", "barsik", "kitten", "sleeper", "helper", "tiger", x]) call("meow", k, x);
      for (const k of ["click", "hover", "back", "open", "boo", x]) call("ui", k);
    }
    for (const m of ["stretchStop", "dash", "pound", "split", "win", "lose", "tick", "wipe", "scribble"]) call(m);
    call("impact", "wood", 1, 0);
    call("stretch", 0.5);
    call("slowmo", false);
    return errs;
  }
  async function apiSmoke() {
    const A = audio_default;
    const rep = { errors: [], notes: [] };
    const before = A._stats();
    rep.errors.push(...callEverything(A));
    for (const tr of ["title", "level", "bogus", null, "sketch"]) A.music(tr);
    const afterNoUnlock = A._stats();
    rep.notes.push("до unlock: ctx=" + afterNoUnlock.ctx + ", голосов=" + afterNoUnlock.voices + ", lastError=" + afterNoUnlock.lastError);
    if (before.ctx !== null || afterNoUnlock.ctx !== null) rep.errors.push("контекст создан до unlock()");
    A.setMuted(false);
    const m1 = A.toggleMute();
    const ls1 = localStorage.getItem("kotapulta.muted");
    const m2 = A.toggleMute();
    const ls2 = localStorage.getItem("kotapulta.muted");
    rep.notes.push(`toggleMute → ${m1} (storage ${ls1}), → ${m2} (storage ${ls2}); isMuted=${A.isMuted()}`);
    if (m1 !== true || m2 !== false || ls1 !== "1" || ls2 !== "0") rep.errors.push("mute/localStorage работает неверно");
    A.unlock();
    A.unlock();
    for (let i = 0; i < 50 && A._stats().ctx !== "running"; i++) await new Promise((r) => setTimeout(r, 20));
    const s1 = A._stats();
    rep.notes.push("после unlock: ctx=" + s1.ctx + ", трек=" + s1.track + ", плееров=" + s1.players);
    rep.errors.push(...callEverything(A));
    for (const tr of ["title", "level", "sketch", "sketch", "level", "title", "bogus", "level"]) {
      A.music(tr);
      await new Promise((r) => setTimeout(r, 250));
    }
    A.setMuted(true);
    await new Promise((r) => setTimeout(r, 250));
    const sm = A._stats();
    A.impact("wood", 1, 0);
    A.setMuted(false);
    await new Promise((r) => setTimeout(r, 250));
    const su = A._stats();
    rep.notes.push(`mute: ctx=${sm.ctx}; unmute: ctx=${su.ctx}, трек=${su.track}`);
    let t = performance.now();
    for (let i = 0; i < 1e3; i++) A.impact("wood", 0.8, 0);
    rep.notes.push("1000× impact (в основном отсечены лимитом): " + (performance.now() - t).toFixed(2) + " мс");
    await new Promise((r) => setTimeout(r, 120));
    t = performance.now();
    const mats = ["cardboard", "wood", "ceramic", "yarn", "cat", "ground", "fish"];
    for (const m of mats) A.impact(m, 0.9, 0);
    rep.notes.push("7 реальных impact (по одному на материал): " + (performance.now() - t).toFixed(2) + " мс");
    t = performance.now();
    for (let i = 0; i < 60; i++) A.stretch(i / 60);
    rep.notes.push("60× stretch: " + (performance.now() - t).toFixed(2) + " мс");
    t = performance.now();
    A.meow("barsik");
    rep.notes.push("meow: " + (performance.now() - t).toFixed(2) + " мс");
    await new Promise((r) => setTimeout(r, 300));
    if (A._stats().stretching) rep.errors.push("stretch не остановился сам через 120 мс");
    A.music(null);
    await new Promise((r) => setTimeout(r, 3500));
    const s2 = A._stats();
    rep.notes.push(`через 3.5 с после music(null): голосов=${s2.voices}, музыка=${s2.music}, плееров=${s2.players}, создано=${s2.created}, lastError=${s2.lastError}`);
    if (s2.lastError) rep.errors.push("lastError: " + s2.lastError);
    if (s2.voices > 3) rep.errors.push("голоса не освобождаются: " + s2.voices);
    return rep;
  }
  function toWavB64(buf) {
    const nch = buf.numberOfChannels, n = buf.length, sr = buf.sampleRate;
    const out = new DataView(new ArrayBuffer(44 + n * nch * 2));
    const w = (o2, s) => [...s].forEach((c, i) => out.setUint8(o2 + i, c.charCodeAt(0)));
    w(0, "RIFF");
    out.setUint32(4, 36 + n * nch * 2, true);
    w(8, "WAVE");
    w(12, "fmt ");
    out.setUint32(16, 16, true);
    out.setUint16(20, 1, true);
    out.setUint16(22, nch, true);
    out.setUint32(24, sr, true);
    out.setUint32(28, sr * nch * 2, true);
    out.setUint16(32, nch * 2, true);
    out.setUint16(34, 16, true);
    w(36, "data");
    out.setUint32(40, n * nch * 2, true);
    const chs = [];
    for (let c = 0; c < nch; c++) chs.push(buf.getChannelData(c));
    let o = 44;
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < nch; c++) {
        const x = Math.max(-1, Math.min(1, chs[c][i]));
        out.setInt16(o, x * 32767, true);
        o += 2;
      }
    }
    const bytes = new Uint8Array(out.buffer);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 32768) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 32768));
    return btoa(bin);
  }
  async function wavs(filter) {
    const res = [];
    for (const [name, fn, dur] of CASES) {
      if (filter && !name.includes(filter)) continue;
      const { buf } = await renderOnce(fn, dur, false);
      res.push({ name, b64: toWavB64(buf) });
    }
    for (const [name, setup, step, dur] of MUSIC) {
      if (filter && !name.includes(filter)) continue;
      const { buf } = await renderSim(dur, setup, step, { dt: 0.1 });
      res.push({ name, b64: toWavB64(buf) });
    }
    return res;
  }
  function showTable(rows) {
    const t = el("table");
    t.append(el("tr", {}, ...["звук", "пик", "пик дБ", "RMS дБ", "макс 50мс дБ", "длит., с", "сырой пик"].map((h) => el("th", { textContent: h }))));
    for (const r of rows) {
      t.append(
        el(
          "tr",
          { className: r.peak >= 1 || r.rmsDb < -50 ? "bad" : "" },
          ...[r.name, r.peak, r.peakDb, r.rmsDb, r.maxWinDb, r.activeSec, r.rawPeak].map((v) => el("td", { textContent: String(v) }))
        )
      );
    }
    $("#results").replaceChildren(t);
  }
  async function chainGain() {
    const res = [];
    for (const amp of [0.05, 0.2, 0.5]) {
      const pk = [];
      for (const dry of [false, true]) {
        const c = new OfflineAudioContext(1, SR * 1.2, SR);
        const A = audio_default._test.create(c, { dry });
        const o = c.createOscillator();
        const g = c.createGain();
        g.gain.value = 0;
        g.gain.setValueAtTime(amp, 0.6);
        g.gain.setValueAtTime(0, 0.9);
        o.connect(g);
        g.connect(A._engine.master);
        o.start();
        const d = (await c.startRendering()).getChannelData(0);
        let m = 0;
        for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i]));
        pk.push(m);
      }
      res.push({ amp, dB: +(20 * Math.log10(pk[0] / pk[1])).toFixed(2) });
    }
    return res;
  }
  window.labTests = { chainGain, apiSmoke, measureAll, session, wavs, analyze, renderSim, renderOnce, segments, toWavB64, CASES, MUSIC };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", buildUI);
  else buildUI();
})();
