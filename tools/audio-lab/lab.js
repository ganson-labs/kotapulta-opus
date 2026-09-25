// Звуковая лаборатория Котапульты: ручное прослушивание + тестовые функции для tools/audio-check.mjs.
// Собирается в lab.bundle.js (IIFE), чтобы tools/audio-lab.html открывался двойным щелчком (file://).
import Audio from '../../src/audio.js';

window.KotaAudio = Audio;

// ------------------------------------------------------------ интерфейс

const $ = (sel) => document.querySelector(sel);
const el = (tag, props, ...kids) => {
  const n = document.createElement(tag);
  Object.assign(n, props || {});
  for (const k of kids) n.append(k);
  return n;
};

let unlocked = false;
function ensureUnlock() {
  if (!unlocked) {
    unlocked = true;
    Audio.unlock();
  }
}
document.addEventListener('pointerdown', ensureUnlock, true);
document.addEventListener('keydown', ensureUnlock, true);

const state = { strength: 0.7, pan: 0, combo: 0 };

function section(title, hint) {
  const box = el('section', { className: 'card' }, el('h2', { textContent: title }));
  if (hint) box.append(el('p', { className: 'hint', textContent: hint }));
  const row = el('div', { className: 'row' });
  box.append(row);
  $('#app').append(box);
  return row;
}
function btn(row, label, fn, cls) {
  const b = el('button', { textContent: label, className: cls || '' });
  b.addEventListener('click', () => {
    ensureUnlock();
    fn(b);
  });
  row.append(b);
  return b;
}
function slider(row, label, min, max, step, value, onInput) {
  const out = el('span', { className: 'val', textContent: String(value) });
  const inp = el('input', { type: 'range', min, max, step, value });
  inp.addEventListener('input', () => {
    out.textContent = inp.value;
    onInput(+inp.value);
  });
  row.append(el('label', { className: 'sl' }, label + ' ', inp, out));
}

function buildUI() {
  // --- музыка
  let r = section('Музыка', 'title — колыбельная; level ⇄ sketch — одна пьеса на общих часах (переоркестровка без рестарта).');
  for (const tr of ['title', 'level', 'sketch']) btn(r, tr, () => Audio.music(tr), 'music');
  btn(r, 'стоп (null)', () => Audio.music(null));
  btn(r, 'duck 0.7 × 1.5 с', () => Audio.duck(0.7, 1.5));
  let slow = false;
  btn(r, 'slowmo: выкл', (b) => {
    slow = !slow;
    Audio.slowmo(slow);
    b.textContent = 'slowmo: ' + (slow ? 'вкл' : 'выкл');
  });
  btn(r, 'мир: цвет ⇄ салфетка', () => {
    const next = Audio._stats().track === 'sketch' ? 'level' : 'sketch';
    Audio.wipe();
    Audio.music(next);
  });

  // --- рогатка
  r = section('Рогатка', 'Зажмите площадку и тяните: stretch(power) каждый кадр, отпускание — launch(power) + мяу.');
  const pad = el('div', { className: 'pad', textContent: 'тяни меня' });
  r.append(pad);
  let drag = null;
  pad.addEventListener('pointerdown', (ev) => {
    ensureUnlock();
    pad.setPointerCapture(ev.pointerId);
    drag = { x: ev.clientX, y: ev.clientY, power: 0 };
    Audio.meow('helper');
    const loop = () => {
      if (!drag) return;
      Audio.stretch(drag.power);
      pad.style.setProperty('--p', drag.power);
      pad.textContent = 'сила ' + drag.power.toFixed(2);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
  pad.addEventListener('pointermove', (ev) => {
    if (drag) drag.power = Math.min(1, Math.hypot(ev.clientX - drag.x, ev.clientY - drag.y) / 220);
  });
  const release = () => {
    if (!drag) return;
    const p = drag.power;
    drag = null;
    pad.textContent = 'тяни меня';
    pad.style.setProperty('--p', 0);
    if (p > 0.08) {
      Audio.launch(p);
      setTimeout(() => Audio.meow('ryzhik'), 60);
    } else Audio.stretchStop();
  };
  pad.addEventListener('pointerup', release);
  pad.addEventListener('pointercancel', release);
  btn(r, 'launch(0.3)', () => Audio.launch(0.3));
  btn(r, 'launch(1)', () => Audio.launch(1));

  // --- коты
  r = section('Коты', 'meow(kind), соня: snore / grumble / wake.');
  for (const k of ['ryzhik', 'ugolek', 'barsik', 'kitten', 'sleeper', 'helper']) btn(r, 'мяу ' + k, () => Audio.meow(k, state.pan));
  btn(r, 'snore', () => Audio.snore(state.pan));
  btn(r, 'grumble', () => Audio.grumble(state.pan));
  btn(r, 'wake', () => Audio.wake(state.pan));

  // --- удары
  r = section('Удары и разрушения', 'impact(material, strength, pan); «обвал» — 3 с по 8 вызовов на кадр (лимиты внутри модуля).');
  slider(r, 'сила', 0, 1, 0.05, state.strength, (v) => (state.strength = v));
  slider(r, 'панорама', -1, 1, 0.1, state.pan, (v) => (state.pan = v));
  r = section('', '');
  for (const m of ['cardboard', 'wood', 'ceramic', 'yarn', 'cat', 'ground', 'fish']) btn(r, m, () => Audio.impact(m, state.strength, state.pan));
  r = section('', '');
  for (const m of ['cardboard', 'wood', 'ceramic', 'yarn']) btn(r, 'break ' + m, () => Audio.breakBlock(m, state.pan), 'warm');
  btn(r, 'обвал!', collapse, 'warm');

  // --- рыбки и способности
  r = section('Рыбки и способности');
  const fb = btn(r, 'fish(0)', () => {
    Audio.fish(state.combo);
    state.combo++;
    fb.textContent = 'fish(' + state.combo + ')';
  });
  btn(r, 'сброс комбо', () => {
    state.combo = 0;
    fb.textContent = 'fish(0)';
  });
  btn(r, 'dash', () => Audio.dash());
  btn(r, 'pound', () => Audio.pound());
  btn(r, 'pound → boom', () => {
    Audio.pound();
    setTimeout(() => Audio.boom(1), 520);
  });
  btn(r, 'boom(0.4)', () => Audio.boom(0.4));
  btn(r, 'boom(1)', () => Audio.boom(1));
  btn(r, 'split', () => Audio.split());

  // --- интерфейс и итоги
  r = section('Интерфейс и итоги', 'Наведение на кнопки этого блока — ui(\'hover\').');
  const uiRow = r;
  for (const k of ['click', 'back', 'open']) btn(r, 'ui ' + k, () => Audio.ui(k));
  btn(r, 'tick × 1.5 с', () => {
    const t0 = performance.now();
    const f = () => {
      Audio.tick();
      if (performance.now() - t0 < 1500) requestAnimationFrame(f);
    };
    f();
  });
  for (let i = 0; i < 3; i++) btn(r, 'star(' + i + ')', () => Audio.star(i));
  btn(r, 'три звезды', () => [0, 1, 2].forEach((i) => setTimeout(() => Audio.star(i), i * 450)));
  btn(r, 'win', () => Audio.win(), 'warm');
  btn(r, 'lose', () => Audio.lose());
  uiRow.addEventListener('pointerover', (ev) => {
    if (ev.target.tagName === 'BUTTON') Audio.ui('hover');
  });

  // --- салфетка
  r = section('Салфетка');
  btn(r, 'wipe', () => Audio.wipe());
  btn(r, 'scribble', () => Audio.scribble());

  // --- замеры
  r = section('Замеры', 'Офлайн-рендер каждого звука (OfflineAudioContext): пик и RMS после мастер-цепочки и «сырой» пик до неё.');
  btn(r, 'запустить замеры', async (b) => {
    b.disabled = true;
    b.textContent = 'считаю…';
    const res = await measureAll();
    showTable(res);
    b.disabled = false;
    b.textContent = 'запустить замеры';
  });
  $('#app').append(el('div', { id: 'results' }));

  // --- шапка
  $('#mute').addEventListener('click', () => {
    ensureUnlock();
    Audio.toggleMute();
  });
  setInterval(() => {
    const s = Audio._stats() || {};
    $('#mute').textContent = Audio.isMuted() ? '🔇 звук выкл' : '🔊 звук вкл';
    $('#status').textContent = `контекст: ${s.ctx || '—'} · трек: ${s.track || '—'} · голосов: ${s.voices || 0} (музыка ${s.music || 0}, удары ${s.impact || 0}) · создано: ${s.created || 0}`;
  }, 200);
}

function collapse() {
  const mats = ['cardboard', 'wood', 'ceramic', 'yarn', 'cat', 'ground'];
  const t0 = performance.now();
  let frame = 0;
  const f = () => {
    const k = 1 - (performance.now() - t0) / 3000;
    for (let i = 0; i < 8; i++) Audio.impact(mats[(Math.random() * mats.length) | 0], Math.random() * k, Math.random() * 2 - 1);
    if (frame % 20 === 0) Audio.breakBlock(mats[(Math.random() * 4) | 0], Math.random() * 2 - 1);
    frame++;
    if (k > 0) requestAnimationFrame(f);
  };
  f();
}

// ------------------------------------------------------------ офлайн-рендер и анализ

const SR = 44100;

function analyze(buf) {
  const n = buf.length, chs = [];
  for (let c = 0; c < buf.numberOfChannels; c++) chs.push(buf.getChannelData(c));
  let peak = 0, dc = 0;
  const win = Math.floor(buf.sampleRate * 0.05);
  const wins = [];
  for (let i = 0; i < n; i += win) {
    let s = 0, cnt = 0;
    for (const d of chs) {
      for (let j = i; j < Math.min(n, i + win); j++) {
        const x = d[j];
        s += x * x;
        cnt++;
        const a = x < 0 ? -x : x;
        if (a > peak) peak = a;
        dc += x;
      }
    }
    wins.push(Math.sqrt(s / Math.max(1, cnt)));
  }
  const db = (x) => (x > 0 ? 20 * Math.log10(x) : -200);
  let first = -1, last = -1, maxW = 0;
  wins.forEach((w, i) => {
    if (w > 0.001) {
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
    activeSec: first >= 0 ? +(((last - first + 1) * win) / buf.sampleRate).toFixed(2) : 0,
    tailDb: +db(tail).toFixed(1),
    dc: +(dc / (n * chs.length)).toFixed(5),
  };
}

// Рендер с пошаговой прокруткой (ctx.suspend) — как в реальном времени: планировщик музыки
// и игровые события вызываются каждые dt секунд аудио-времени.
async function renderSim(dur, setup, onStep, opts = {}) {
  const sr = opts.sr || SR;
  const ctx = new OfflineAudioContext(opts.ch || 2, Math.ceil(sr * dur), sr);
  const A = Audio._test.create(ctx, { dry: !!opts.dry, seed: opts.seed || 7 });
  const dt = opts.dt || 0.1;
  const samples = [];
  let t = 0;
  A._at(0);
  if (setup) setup(A, 0);
  A._pump(0.25);
  const next = () => {
    const tn = +(t + dt).toFixed(6);
    if (tn >= dur - 0.02) return;
    ctx
      .suspend(tn)
      .then(() => {
        t = tn;
        A._at(t);
        if (onStep) onStep(A, t);
        A._pump(t + 0.25);
        if (opts.sample && Math.abs(t / opts.sample - Math.round(t / opts.sample)) < dt / 2 / opts.sample) samples.push({ t: +t.toFixed(2), ...A._stats() });
        next();
        ctx.resume();
      })
      .catch((e) => console.warn('suspend', e));
  };
  next();
  const buf = await ctx.startRendering();
  return { buf, A, samples };
}

// Звук стартует в T0 = 0.5 с: DynamicsCompressor в Chrome первые ~0.3 с после старта контекста
// находится в «сжатом» состоянии, и замер в самом начале занижал бы короткие звуки на 3–10 дБ.
const T0 = 0.5;
async function renderOnce(fn, dur, dry) {
  const ctx = new OfflineAudioContext(2, Math.ceil(SR * (dur + T0)), SR);
  const A = Audio._test.create(ctx, { dry, seed: 3 });
  A._at(T0);
  fn(A, T0);
  const buf = await ctx.startRendering();
  return { buf, A };
}

const stretchSeq = (A, t0) => {
  for (let i = 0; i <= 72; i++) {
    A._at(t0 + i / 60);
    A.stretch(Math.min(1, i / 60));
  }
  A._at(t0 + 1.4);
  A.stretchStop();
};

// [имя, функция, длительность рендера]
const CASES = [
  ['stretch 0→1', stretchSeq, 1.8],
  ['launch(0.3)', (A) => A.launch(0.3), 1.0],
  ['launch(1)', (A) => A.launch(1), 1.0],
  ...['ryzhik', 'ugolek', 'barsik', 'kitten', 'sleeper', 'helper'].map((k) => ['meow ' + k, (A) => A.meow(k), 1.3]),
  ...['cardboard', 'wood', 'ceramic', 'yarn', 'cat', 'ground', 'fish'].flatMap((m) => [
    ['impact ' + m + ' 0.2', (A) => A.impact(m, 0.2, 0), 0.6],
    ['impact ' + m + ' 1', (A) => A.impact(m, 1, 0), 0.6],
  ]),
  ...['cardboard', 'wood', 'ceramic', 'yarn'].map((m) => ['break ' + m, (A) => A.breakBlock(m, 0), 1.0]),
  ['fish(0)', (A) => A.fish(0), 0.6],
  ['fish(7)', (A) => A.fish(7), 0.6],
  ['snore', (A) => A.snore(0), 2.8],
  ['grumble', (A) => A.grumble(0), 1.1],
  ['wake', (A) => A.wake(0), 1.4],
  ['dash', (A) => A.dash(), 0.8],
  ['pound', (A) => A.pound(), 0.8],
  ['boom(0.4)', (A) => A.boom(0.4), 2.0],
  ['boom(1)', (A) => A.boom(1), 2.0],
  ['split', (A) => A.split(), 0.6],
  ['ui click', (A) => A.ui('click'), 0.3],
  ['ui hover', (A) => A.ui('hover'), 0.3],
  ['ui back', (A) => A.ui('back'), 0.5],
  ['ui open', (A) => A.ui('open'), 0.6],
  ['star(0)', (A) => A.star(0), 2.2],
  ['star(1)', (A) => A.star(1), 2.4],
  ['star(2)', (A) => A.star(2), 2.8],
  ['win', (A) => A.win(), 4.0],
  ['lose', (A) => A.lose(), 2.6],
  ['tick', (A) => A.tick(), 0.2],
  ['wipe', (A) => A.wipe(), 2.2],
  ['scribble', (A) => A.scribble(), 0.8],
  ['slowmo on', (A) => A.slowmo(true), 1.0],
  [
    'collapse storm 3 s',
    (A, t0) => {
      const mats = ['cardboard', 'wood', 'ceramic', 'yarn', 'cat', 'ground'];
      let seed = 5;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let f = 0; f < 180; f++) {
        A._at(t0 + f / 60);
        for (let i = 0; i < 8; i++) A.impact(mats[(rnd() * 6) | 0], rnd(), rnd() * 2 - 1);
        if (f % 15 === 0) A.breakBlock(mats[(rnd() * 4) | 0], rnd() * 2 - 1);
      }
    },
    3.6,
  ],
];

const MUSIC = [
  ['music title 0–40 s', (A) => A.music('title'), null, 40],
  ['music level 0–42 s', (A) => A.music('level'), null, 42],
  ['music sketch 0–42 s', (A) => A.music('sketch'), null, 42],
  [
    'level→sketch@6→level@12→title@18→null@26',
    (A) => A.music('level'),
    (A, t) => {
      if (Math.abs(t - 6) < 0.01) A.music('sketch');
      if (Math.abs(t - 12) < 0.01) A.music('level');
      if (Math.abs(t - 18) < 0.01) A.music('title');
      if (Math.abs(t - 26) < 0.01) A.music(null);
    },
    30,
  ],
  [
    'level + win@5 (duck)',
    (A) => A.music('level'),
    (A, t) => {
      if (Math.abs(t - 5) < 0.01) A.win();
    },
    10,
  ],
];

// Сегментные RMS (по 2 с) — видно, что музыка не пропадает при переключениях.
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
    rows.push({ name, ...a, rawPeak: b.peak, rawPeakDb: b.peakDb, rawWinDb: b.maxWinDb, rawRmsDb: b.rmsDb, seg2s: segments(full.buf, 2).join(' '), err: full.A._stats().lastError });
  }
  return rows;
}

// 5-минутная «игровая сессия»: сотни ударов, рыбок, смены треков — следим за числом живых голосов.
async function session(minutes = 5) {
  const dur = minutes * 60;
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const mats = ['cardboard', 'wood', 'ceramic', 'yarn', 'cat', 'ground', 'fish'];
  const tracks = ['title', 'level', 'sketch', 'level', 'sketch', null, 'level', 'title'];
  const calls = { impact: 0, breakBlock: 0, fish: 0, stretch: 0, music: 0, other: 0 };
  let combo = 0;
  const heap0 = performance.memory ? performance.memory.usedJSHeapSize : 0;
  const t0 = performance.now();
  const onStep = (A, t) => {
    const shot = t % 12;
    if (Math.abs((t % 40) - 0) < 0.025) {
      A.music(tracks[Math.round(t / 40) % tracks.length]);
      A.wipe();
      A.scribble();
      calls.music++;
    }
    if (shot < 1.5) {
      for (let i = 0; i < 3; i++) A.stretch(shot / 1.5);
      calls.stretch += 3;
      if (shot < 0.03) A.meow('helper');
    } else if (shot < 1.53) {
      A.launch(0.5 + rnd() * 0.5);
      A.meow(['ryzhik', 'ugolek', 'barsik', 'kitten'][(rnd() * 4) | 0]);
      calls.other += 2;
      combo = 0;
    } else if (shot < 5) {
      for (let i = 0; i < 24; i++) A.impact(mats[(rnd() * mats.length) | 0], rnd(), rnd() * 2 - 1);
      calls.impact += 24;
      if (rnd() < 0.12) {
        A.breakBlock(mats[(rnd() * 4) | 0], rnd() * 2 - 1);
        calls.breakBlock++;
      }
      if (rnd() < 0.1) {
        A.fish(combo++);
        calls.fish++;
      }
      if (rnd() < 0.01) A.boom(rnd());
      if (rnd() < 0.01) A.dash();
      if (rnd() < 0.01) A.split();
      if (rnd() < 0.005) A.pound();
      if (rnd() < 0.02) A.slowmo(rnd() < 0.5);
    } else if (shot > 6 && shot < 6.03) {
      A.slowmo(false);
      if ((t / 12) % 3 < 1) {
        A.wake(0.5);
        A.win();
        [0, 1, 2].forEach((i) => A.star(i));
      } else A.lose();
      calls.other += 3;
    } else if (shot > 7 && shot < 8.5) {
      for (let i = 0; i < 3; i++) A.tick();
      calls.other += 3;
    }
    if (Math.abs((t % 3) - 0) < 0.025) {
      A.snore(-0.5);
      A.snore(0.6);
      if (rnd() < 0.3) A.grumble(0);
      A.ui(rnd() < 0.5 ? 'hover' : 'click');
      calls.other += 4;
    }
  };
  const { buf, A, samples } = await renderSim(dur, (A) => A.music('level'), onStep, { dt: 0.05, sr: 24000, ch: 1, sample: 10 });
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
    heapMB: heap0 ? [+(heap0 / 1e6).toFixed(1), +(heap1 / 1e6).toFixed(1)] : null,
  };
}

// Вызов всех методов с обычными и «кривыми» аргументами — до и после unlock().
const EDGE = [undefined, null, NaN, Infinity, -Infinity, -5, 0, 0.5, 1, 7, '0.7', 'мяу', {}, []];
function callEverything(A) {
  const errs = [];
  const call = (name, ...args) => {
    try {
      A[name](...args);
    } catch (e) {
      errs.push(name + ': ' + e.message);
    }
  };
  for (const x of EDGE) {
    for (const m of ['stretch', 'launch', 'fish', 'snore', 'grumble', 'wake', 'boom', 'star', 'slowmo', 'duck']) call(m, x, x);
    for (const mat of ['cardboard', 'wood', 'ceramic', 'yarn', 'cat', 'ground', 'fish', 'бетон', x]) {
      call('impact', mat, x, x);
      call('breakBlock', mat, x);
    }
    for (const k of ['ryzhik', 'ugolek', 'barsik', 'kitten', 'sleeper', 'helper', 'tiger', x]) call('meow', k, x);
    for (const k of ['click', 'hover', 'back', 'open', 'boo', x]) call('ui', k);
  }
  for (const m of ['stretchStop', 'dash', 'pound', 'split', 'win', 'lose', 'tick', 'wipe', 'scribble']) call(m);
  call('impact', 'wood', 1, 0);
  call('stretch', 0.5);
  call('slowmo', false);
  return errs;
}

async function apiSmoke() {
  const A = Audio;
  const rep = { errors: [], notes: [] };
  const before = A._stats();
  rep.errors.push(...callEverything(A));
  for (const tr of ['title', 'level', 'bogus', null, 'sketch']) A.music(tr);
  const afterNoUnlock = A._stats();
  rep.notes.push('до unlock: ctx=' + afterNoUnlock.ctx + ', голосов=' + afterNoUnlock.voices + ', lastError=' + afterNoUnlock.lastError);
  if (before.ctx !== null || afterNoUnlock.ctx !== null) rep.errors.push('контекст создан до unlock()');
  // mute + localStorage
  A.setMuted(false);
  const m1 = A.toggleMute();
  const ls1 = localStorage.getItem('kotapulta.muted');
  const m2 = A.toggleMute();
  const ls2 = localStorage.getItem('kotapulta.muted');
  rep.notes.push(`toggleMute → ${m1} (storage ${ls1}), → ${m2} (storage ${ls2}); isMuted=${A.isMuted()}`);
  if (m1 !== true || m2 !== false || ls1 !== '1' || ls2 !== '0') rep.errors.push('mute/localStorage работает неверно');
  // unlock
  A.unlock();
  A.unlock();
  for (let i = 0; i < 50 && A._stats().ctx !== 'running'; i++) await new Promise((r) => setTimeout(r, 20));
  const s1 = A._stats();
  rep.notes.push('после unlock: ctx=' + s1.ctx + ', трек=' + s1.track + ', плееров=' + s1.players);
  rep.errors.push(...callEverything(A));
  // музыка
  for (const tr of ['title', 'level', 'sketch', 'sketch', 'level', 'title', 'bogus', 'level']) {
    A.music(tr);
    await new Promise((r) => setTimeout(r, 250));
  }
  // mute во время музыки и обратно
  A.setMuted(true);
  await new Promise((r) => setTimeout(r, 250));
  const sm = A._stats();
  A.impact('wood', 1, 0);
  A.setMuted(false);
  await new Promise((r) => setTimeout(r, 250));
  const su = A._stats();
  rep.notes.push(`mute: ctx=${sm.ctx}; unmute: ctx=${su.ctx}, трек=${su.track}`);
  // стоимость вызовов
  let t = performance.now();
  for (let i = 0; i < 1000; i++) A.impact('wood', 0.8, 0);
  rep.notes.push('1000× impact (в основном отсечены лимитом): ' + (performance.now() - t).toFixed(2) + ' мс');
  await new Promise((r) => setTimeout(r, 120));
  t = performance.now();
  const mats = ['cardboard', 'wood', 'ceramic', 'yarn', 'cat', 'ground', 'fish'];
  for (const m of mats) A.impact(m, 0.9, 0);
  rep.notes.push('7 реальных impact (по одному на материал): ' + (performance.now() - t).toFixed(2) + ' мс');
  t = performance.now();
  for (let i = 0; i < 60; i++) A.stretch(i / 60);
  rep.notes.push('60× stretch: ' + (performance.now() - t).toFixed(2) + ' мс');
  t = performance.now();
  A.meow('barsik');
  rep.notes.push('meow: ' + (performance.now() - t).toFixed(2) + ' мс');
  // автостоп натяжения
  await new Promise((r) => setTimeout(r, 300));
  if (A._stats().stretching) rep.errors.push('stretch не остановился сам через 120 мс');
  // голоса освобождаются
  A.music(null);
  await new Promise((r) => setTimeout(r, 3500));
  const s2 = A._stats();
  rep.notes.push(`через 3.5 с после music(null): голосов=${s2.voices}, музыка=${s2.music}, плееров=${s2.players}, создано=${s2.created}, lastError=${s2.lastError}`);
  if (s2.lastError) rep.errors.push('lastError: ' + s2.lastError);
  if (s2.voices > 3) rep.errors.push('голоса не освобождаются: ' + s2.voices);
  return rep;
}

// WAV (16 бит) в base64 — для прослушивания отрендеренных звуков вне браузера.
function toWavB64(buf) {
  const nch = buf.numberOfChannels, n = buf.length, sr = buf.sampleRate;
  const out = new DataView(new ArrayBuffer(44 + n * nch * 2));
  const w = (o, s) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF');
  out.setUint32(4, 36 + n * nch * 2, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  out.setUint32(16, 16, true);
  out.setUint16(20, 1, true);
  out.setUint16(22, nch, true);
  out.setUint32(24, sr, true);
  out.setUint32(28, sr * nch * 2, true);
  out.setUint16(32, nch * 2, true);
  out.setUint16(34, 16, true);
  w(36, 'data');
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
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
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
  const t = el('table');
  t.append(el('tr', {}, ...['звук', 'пик', 'пик дБ', 'RMS дБ', 'макс 50мс дБ', 'длит., с', 'сырой пик'].map((h) => el('th', { textContent: h }))));
  for (const r of rows) {
    t.append(
      el(
        'tr',
        { className: r.peak >= 1 || r.rmsDb < -50 ? 'bad' : '' },
        ...[r.name, r.peak, r.peakDb, r.rmsDb, r.maxWinDb, r.activeSec, r.rawPeak].map((v) => el('td', { textContent: String(v) }))
      )
    );
  }
  $('#results').replaceChildren(t);
}

// Усиление мастер-цепочки для обычного сигнала (должно быть ≈0 дБ; иначе устарели TRIM_* в audio.js).
async function chainGain() {
  const res = [];
  for (const amp of [0.05, 0.2, 0.5]) {
    const pk = [];
    for (const dry of [false, true]) {
      const c = new OfflineAudioContext(1, SR * 1.2, SR);
      const A = Audio._test.create(c, { dry });
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

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildUI);
else buildUI();
