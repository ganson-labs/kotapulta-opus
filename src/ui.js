// DOM-интерфейс поверх холста: титул, уровни, HUD, пауза, результаты.
import { Audio } from './audio.js';
import { LEVELS } from './levels.js';
import { CAT_TYPES } from './config.js';
import { LOOKS, drawBallCat } from './draw/cats.js';
import { Sketch } from './draw/sketch.js';

const ICON = {
  pause: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"><path d="M8 5v14M16 5v14"/></svg>',
  restart: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12a8 8 0 1 0 2.5-5.8"/><path d="M4 4v5h5"/></svg>',
  sound: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9z" fill="#fff"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/></svg>',
  mute: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9z" fill="#fff"/><path d="M17 9l5 6M22 9l-5 6"/></svg>',
  full: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  pencil: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l1-5L16 4l4 4L9 19z"/><path d="M13.5 6.5l4 4"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11l8-7 8 7v9H4z"/><path d="M10 20v-5h4v5"/></svg>',
  fish: '<svg viewBox="0 0 30 20"><path d="M3 10 L0 3 Q3 10 0 17 Z" fill="#3E9BE0" stroke="#1F5E96" stroke-width="1.2"/><path d="M3 10 C7 1 22 1 28 10 C22 19 7 19 3 10 Z" fill="#5EC2F2" stroke="#1F5E96" stroke-width="1.4"/><circle cx="22" cy="8.5" r="1.8" fill="#0B2540"/></svg>',
  moon: '<svg viewBox="0 0 30 20"><path d="M11 3 a8 8 0 1 0 9 11 a6.5 6.5 0 1 1 -9 -11z" fill="#FFE27A" stroke="#B07A00" stroke-width="1.3"/><text x="21" y="9" font-size="8" font-weight="900" fill="#fff" font-family="sans-serif">z</text></svg>',
  cat: '<svg viewBox="0 0 30 20"><path d="M8 7 L9 1 L13 5 Z M22 7 L21 1 L17 5 Z" fill="#F5A142" stroke="#6E3B1C" stroke-width="1.2" stroke-linejoin="round"/><circle cx="15" cy="11" r="8" fill="#F5A142" stroke="#6E3B1C" stroke-width="1.3"/><circle cx="12" cy="10" r="1.4" fill="#1A1420"/><circle cx="18" cy="10" r="1.4" fill="#1A1420"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"><rect x="5" y="11" width="14" height="10" rx="2" fill="rgba(255,255,255,.25)"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  hand: '<svg viewBox="0 0 64 64"><path d="M26 6c3 0 5 2 5 5v17l2-1c1-5 9-5 10 0l1 1c2-4 9-3 9 2v3c2-3 8-2 8 3v10c0 10-7 16-16 16H34c-6 0-10-3-13-8L12 38c-2-4 3-8 7-5l2 2V11c0-3 2-5 5-5z" fill="#fff" stroke="#3B2140" stroke-width="3" stroke-linejoin="round"/></svg>',
};

function starSvg(on, cls = '') {
  return `<svg class="${on ? 'on' : ''} ${cls}" viewBox="0 0 24 24"><path d="M12 2.5l2.9 6 6.6.8-4.9 4.5 1.3 6.5L12 17.1l-5.9 3.2 1.3-6.5L2.5 9.3l6.6-.8z" fill="${on ? '#FFC93C' : 'rgba(0,0,0,.18)'}" stroke="${on ? '#B06A00' : 'rgba(0,0,0,.25)'}" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
}

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export class UI {
  constructor(game, root) {
    this.g = game;
    this.root = root;
    this.layers = {};
    this.shownScore = 0;
    this.sketchArt = new Sketch();
    this.build();
    // первое касание открывает звук (политика автозапуска браузеров)
    const unlock = () => {
      Audio.unlock();
      if (this.g.screen === 'title') Audio.music('title');
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    this.syncMute();
  }

  layer(name, html) {
    const node = el(`<div class="layer" id="${name}">${html}</div>`);
    this.root.appendChild(node);
    this.layers[name] = node;
    return node;
  }

  bindButtons(node) {
    node.querySelectorAll('button').forEach((b) => {
      b.addEventListener('pointerenter', () => Audio.ui('hover'));
    });
  }

  build() {
    const title = this.layer('title', `
      <div class="center">
        <h1 class="logo">${[...'Котапульта'].map((c, i) => `<span style="animation-delay:${-i * 0.18}s">${c}</span>`).join('')}</h1>
        <div class="tagline">Разбуди соню. Кошачьей катапультой.</div>
        <div class="menu">
          <button class="btn" data-a="play">Играть</button>
          <button class="btn alt" data-a="levels">Уровни</button>
        </div>
      </div>
      <div class="polaroid" title="Исходный рисунок"><img src="assets/napkin.jpg" alt="Исходный рисунок игры"><span>с этого всё началось</span></div>
      <div class="corner">
        <button class="ibtn" data-a="style" title="Салфетка ⇄ цвет (N)">${ICON.pencil}</button>
        <button class="ibtn" data-a="mute" title="Звук (M)">${ICON.sound}</button>
        <button class="ibtn" data-a="full" title="Полный экран (F)">${ICON.full}</button>
      </div>
      <div class="keys">Тяни кота мышью · клик в полёте — суперсила · <b>N</b> салфетка ⇄ цвет · <b>F</b> полный экран · <b>H</b> скрыть интерфейс</div>
    `);
    const levels = this.layer('levels', `
      <div class="dim"></div>
      <div class="panel">
        <h2>Уровни</h2>
        <div class="totalstars"></div>
        <div class="grid"></div>
        <div class="row"><button class="btn ghost" data-a="title" style="color:#3B2140;box-shadow:inset 0 0 0 2px #3B2140">← Назад</button></div>
      </div>
    `);
    const hud = this.layer('hud', `
      <div class="tl">
        <button class="ibtn" data-a="pause" title="Пауза (Esc)">${ICON.pause}</button>
        <button class="ibtn" data-a="restart" title="Заново (R)">${ICON.restart}</button>
      </div>
      <div class="lvlname"></div>
      <div class="tr">
        <div class="score">0</div>
        <div class="pills">
          <span class="pill p-cats">${ICON.cat}<span></span></span>
          <span class="pill p-fish">${ICON.fish}<span></span></span>
          <span class="pill p-sleep">${ICON.moon}<span></span></span>
        </div>
      </div>
      <div class="br">
        <button class="ibtn" data-a="style" title="Салфетка ⇄ цвет (N)">${ICON.pencil}</button>
        <button class="ibtn" data-a="mute" title="Звук (M)">${ICON.sound}</button>
        <button class="ibtn" data-a="full" title="Полный экран (F)">${ICON.full}</button>
      </div>
      <div class="hint hidden"></div>
      <div class="ability hidden"></div>
      <div class="banner"><div class="small"></div><div class="big"></div><div class="sub"></div></div>
      <div class="catslot"></div>
      <div class="hand hidden">${ICON.hand}</div>
    `);
    const pause = this.layer('pause', `
      <div class="dim"></div>
      <div class="panel">
        <h2>Пауза</h2>
        <div class="sub">Соня пока досматривает сон…</div>
        <div class="row">
          <button class="btn" data-a="resume">Продолжить</button>
        </div>
        <div class="row">
          <button class="btn alt" data-a="restart">Заново</button>
          <button class="btn alt" data-a="levels">Уровни</button>
        </div>
      </div>
    `);
    const result = this.layer('result', `
      <div class="dim"></div>
      <div class="panel">
        <h2></h2>
        <div class="sub"></div>
        <div class="stars"></div>
        <div class="bigscore">0</div>
        <div class="meta"></div>
        <div class="newrec hidden">Новый рекорд!</div>
        <div class="row"></div>
      </div>
    `);
    this.hudEls = {
      score: hud.querySelector('.score'),
      name: hud.querySelector('.lvlname'),
      cats: hud.querySelector('.p-cats span'),
      fish: hud.querySelector('.p-fish span'),
      sleep: hud.querySelector('.p-sleep span'),
      fishPill: hud.querySelector('.p-fish'),
      sleepPill: hud.querySelector('.p-sleep'),
      hint: hud.querySelector('.hint'),
      ability: hud.querySelector('.ability'),
      banner: hud.querySelector('.banner'),
      catslot: hud.querySelector('.catslot'),
      hand: hud.querySelector('.hand'),
    };
    for (const node of [title, levels, hud, pause, result]) {
      node.addEventListener('click', (e) => {
        const b = e.target.closest('[data-a]');
        if (b) this.action(b.dataset.a, b, e);
      });
      this.bindButtons(node);
    }
  }

  action(a, b, e) {
    const g = this.g;
    Audio.unlock();
    switch (a) {
      case 'play': {
        const r = b.getBoundingClientRect();
        return g.play(r.left + r.width / 2, r.top + r.height / 2);
      }
      case 'levels': return g.toLevels();
      case 'title': return g.toTitle();
      case 'pause': return g.pause(true);
      case 'resume': return g.pause(false);
      case 'restart': return g.restart();
      case 'next': return g.next();
      case 'mute': Audio.ui('click'); return this.toggleMute();
      case 'full': Audio.ui('click'); return this.toggleFullscreen();
      case 'style': {
        const r = b.getBoundingClientRect();
        return g.toggleStyle(r.left + r.width / 2, r.top + r.height / 2);
      }
      case 'lv': {
        const idx = +b.dataset.i;
        const r = b.getBoundingClientRect();
        Audio.ui('click');
        return g.startFromMenu(idx, r.left + r.width / 2, r.top + r.height / 2);
      }
    }
  }

  show(name) {
    for (const [k, node] of Object.entries(this.layers)) node.classList.toggle('on', k === name || (name === 'pause' && k === 'hud') || (name === 'result' && k === 'hud'));
    if (name === 'hud') this.hudEls.hand.classList.add('hidden');
  }

  setSketch(on) {
    document.body.classList.toggle('sketch', on);
  }

  toggleMute() {
    Audio.toggleMute();
    this.syncMute();
  }

  syncMute() {
    const m = Audio.isMuted();
    this.root.querySelectorAll('[data-a="mute"]').forEach((b) => {
      b.innerHTML = m ? ICON.mute : ICON.sound;
      b.classList.toggle('off', m);
    });
  }

  // Кинорежим для записи видео: интерфейс прячется, остаётся только сцена.
  toggleHidden() {
    this.root.style.visibility = this.root.style.visibility === 'hidden' ? '' : 'hidden';
  }

  toggleFullscreen() {
    const d = document;
    if (!d.fullscreenElement) d.documentElement.requestFullscreen?.().catch(() => {});
    else d.exitFullscreen?.();
  }

  // ---------- HUD ----------
  banner(small, big, sub) {
    const B = this.hudEls.banner;
    B.querySelector('.small').textContent = small;
    B.querySelector('.big').textContent = big;
    B.querySelector('.sub').textContent = sub || '';
    B.classList.remove('go');
    void B.offsetWidth;
    B.classList.add('go');
    this.hudEls.name.textContent = `${small} · ${big}`;
    this.hudEls.catslot.innerHTML = '';
    this.shownScore = 0;
  }

  hint(text) {
    const h = this.hudEls.hint;
    if (text) {
      h.textContent = text;
      h.classList.remove('hidden');
      // подсказка-рука на первом уровне
      if (this.g.def.id === 1 && !this.g.progress.best(1)) {
        this.handT = 3.2;
      }
    } else {
      h.classList.add('hidden');
      this.hudEls.hand.classList.add('hidden');
      this.handT = null;
    }
  }

  abilityHint(text) {
    const a = this.hudEls.ability;
    if (text) {
      a.textContent = text;
      a.classList.remove('hidden');
    } else a.classList.add('hidden');
  }

  updateHud(d) {
    const E = this.hudEls;
    this.shownScore += (d.score - this.shownScore) * 0.18;
    if (Math.abs(d.score - this.shownScore) < 1) this.shownScore = d.score;
    E.score.textContent = Math.round(this.shownScore).toLocaleString('ru-RU');
    const f = `${d.fish}/${d.fishTotal}`;
    if (E.fish.textContent !== f) {
      if (E.fish.textContent) this.bump(E.fishPill);
      E.fish.textContent = f;
    }
    const s = `${d.sleepers}/${d.sleepersTotal}`;
    if (E.sleep.textContent !== s) {
      if (E.sleep.textContent) this.bump(E.sleepPill);
      E.sleep.textContent = s;
    }
    E.cats.textContent = `×${d.cats}`;
    E.fishPill.classList.toggle('hidden', d.fishTotal === 0);
  }

  bump(node) {
    node.classList.remove('bump');
    void node.offsetWidth;
    node.classList.add('bump');
  }

  fishFly(sx, sy) {
    const target = this.hudEls.fishPill.getBoundingClientRect();
    const f = el(`<div class="flyfish">${ICON.fish}</div>`);
    f.style.left = `${sx - 22}px`;
    f.style.top = `${sy - 15}px`;
    document.body.appendChild(f);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        f.style.transform = `translate(${target.left + 10 - sx}px, ${target.top + 4 - sy}px) scale(.8) rotate(360deg)`;
        f.style.opacity = '0.2';
      });
    });
    setTimeout(() => f.remove(), 800);
  }

  catIntro(type) {
    const ct = CAT_TYPES[type];
    const card = el(`<div class="catcard"><canvas width="192" height="192"></canvas><div><div class="nm">${ct.name}</div><div class="ds">${ct.intro}</div></div></div>`);
    this.portrait(card.querySelector('canvas'), type);
    this.hudEls.catslot.innerHTML = '';
    this.hudEls.catslot.appendChild(card);
    Audio.meow(type === 'barsik' ? 'barsik' : type === 'ugolek' ? 'ugolek' : type === 'trio' ? 'kitten' : 'ryzhik');
    setTimeout(() => {
      card.style.transition = 'transform .4s, opacity .4s';
      card.style.transform = 'translateX(-120%)';
      card.style.opacity = '0';
      setTimeout(() => card.remove(), 450);
    }, 5200);
  }

  portrait(canvas, type) {
    const ctx = canvas.getContext('2d');
    const r = 58;
    if (document.body.classList.contains('sketch')) {
      ctx.setTransform(1, 0, 0, -1, 0, canvas.height);
      ctx.translate(96, 84);
      ctx.scale(r, r);
      this.sketchArt.ballCat(ctx, 0, 0, 0, 1, 'idle');
      return;
    }
    ctx.translate(92, 108);
    ctx.scale(r, r);
    drawBallCat(ctx, LOOKS[type], { t: 0, expr: 'happy', paws: 0 });
  }

  update(dt) {
    if (this.handT != null) {
      this.handT -= dt;
      const g = this.g;
      if (this.handT < 0 && g.canAim() && !g.aimInfo()) {
        const p = g.loadedPos();
        const [sx, sy] = g.cam.toScreen(p.x, p.y);
        const h = this.hudEls.hand;
        h.style.left = `${sx - 14}px`;
        h.style.top = `${sy - 10}px`;
        h.classList.remove('hidden');
      } else if (g.aimInfo()) this.hudEls.hand.classList.add('hidden');
    }
  }

  // ---------- уровни ----------
  renderLevels() {
    const node = this.layers.levels;
    const grid = node.querySelector('.grid');
    const P = this.g.progress;
    const unlocked = P.unlocked(LEVELS);
    grid.innerHTML = '';
    LEVELS.forEach((L, i) => {
      const locked = i >= unlocked;
      const best = P.best(L.id);
      const st = best ? best.stars : 0;
      const b = el(`<button class="lv t-${L.theme} ${locked ? 'locked' : ''}" data-a="${locked ? '' : 'lv'}" data-i="${i}">
        <div class="n">${L.id}</div>
        ${locked ? `<div class="lock">${ICON.lock}</div>` : `<div class="t">${L.name}</div><div class="s">${starSvg(st > 0)}${starSvg(st > 1)}${starSvg(st > 2)}</div>`}
      </button>`);
      if (locked) b.querySelector('.n').style.opacity = '0.5';
      grid.appendChild(b);
    });
    node.querySelector('.totalstars').innerHTML = `${starSvg(true)} ${P.totalStars()} из ${LEVELS.length * 3}`;
    this.bindButtons(grid);
  }

  // ---------- результат ----------
  showResult(r) {
    const node = this.layers.result;
    node.querySelector('h2').textContent = r.won ? 'Соня проснулся!' : 'Соня спит дальше…';
    node.querySelector('.sub').textContent = r.won ? `Уровень ${r.id} · ${r.name}` : 'Коты кончились. Попробуй другой угол!';
    const stars = node.querySelector('.stars');
    stars.innerHTML = [0, 1, 2].map((i) => starSvg(false, i === 1 ? 'mid' : '')).join('');
    stars.classList.toggle('hidden', !r.won);
    const scoreEl = node.querySelector('.bigscore');
    scoreEl.textContent = '0';
    scoreEl.classList.toggle('hidden', !r.won);
    node.querySelector('.meta').innerHTML = r.won
      ? `Рыбок: ${r.fish} из ${r.fishTotal}${r.best ? ` · Рекорд: ${r.best.score.toLocaleString('ru-RU')}` : ''}`
      : `Рыбок собрано: ${r.fish} из ${r.fishTotal}`;
    node.querySelector('.newrec').classList.add('hidden');
    const row = node.querySelector('.row');
    row.innerHTML = r.won
      ? `<button class="btn alt" data-a="levels">Уровни</button><button class="btn alt" data-a="restart">Заново</button>${r.hasNext ? '<button class="btn" data-a="next">Дальше ▶</button>' : '<button class="btn" data-a="levels">Финал ★</button>'}`
      : `<button class="btn alt" data-a="levels">Уровни</button><button class="btn" data-a="restart">Ещё раз</button>`;
    this.bindButtons(row);
    this.primary = r.won ? (r.hasNext ? 'next' : 'levels') : 'restart';
    this.show('result');
    if (!r.won) return;
    // звёзды по очереди и счёт
    const svgs = stars.querySelectorAll('svg');
    for (let i = 0; i < r.stars; i++) {
      setTimeout(() => {
        svgs[i].outerHTML = starSvg(true, i === 1 ? 'mid' : '');
        Audio.star(i);
      }, 450 + i * 420);
    }
    const t0 = performance.now();
    const dur = 1100;
    let lastTick = 0;
    const tick = (now) => {
      const u = Math.min(1, (now - t0) / dur);
      scoreEl.textContent = Math.round(r.score * (1 - Math.pow(1 - u, 3))).toLocaleString('ru-RU');
      if (now - lastTick > 70 && u < 1) {
        Audio.tick();
        lastTick = now;
      }
      if (u < 1) requestAnimationFrame(tick);
      else if (r.isNew) node.querySelector('.newrec').classList.remove('hidden');
    };
    requestAnimationFrame(tick);
  }

  resultPrimary() {
    if (this.primary) this.action(this.primary);
  }
}
