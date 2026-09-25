// Игра: экраны, ввод, камера, анимации катапульты и кота-помощника, реакция на события уровня.
import { Level } from './level.js';
import { LEVELS } from './levels.js';
import { Camera } from './camera.js';
import { Particles } from './particles.js';
import { Background, THEMES } from './draw/background.js';
import { Renderer } from './renderer.js';
import { Audio } from './audio.js';
import { CAT_TYPES, LAUNCH, STEP } from './config.js';
import { Progress } from './progress.js';
import { UI } from './ui.js';
import { clamp, lerp, damp, ease, rand } from './util.js';

const ABILITY_HINT = {
  dash: 'Жми! — рывок',
  pound: 'Жми! — бомбочка',
  split: 'Жми! — три котёнка',
};

export class Game {
  constructor(canvas, root) {
    this.canvas = canvas;
    this.cam = new Camera();
    this.fx = new Particles();
    this.renderer = new Renderer(canvas);
    this.progress = new Progress();
    this.ui = new UI(this, root);
    this.style = 'sketch';
    this.wipe = null;
    this.screen = 'title';
    this.time = 0;
    this.acc = 0;
    this.timeScale = 1;
    this.slowmo = 0;
    this.level = null;
    this.bg = new Background('day');
    this.views = new Map();
    this.pointer = null;
    this.kbAim = null;
    this.camMode = 'auto';
    this.camOverride = null;
    this.snoreT = new Map();
    this.fishCombo = 0;
    this.lastFishT = -9;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.bindInput();
    this.loadLevel(0);
    this.cam.target(...this.overview());
    this.cam.snap();
    this.ui.setSketch(true);
    this.ui.show('title');
  }

  // ---------- размеры ----------
  resize() {
    const W = window.innerWidth, H = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.cam.resize(W, H, dpr);
    this.renderer.resize(W, H, dpr);
    this.bg.resize(W, H);
    if (this.level) {
      const [x, z] = this.camGoal();
      this.cam.target(x, z);
      this.cam.snap();
    }
  }

  // ---------- уровни ----------
  loadLevel(idx) {
    this.levelIndex = idx;
    this.def = LEVELS[idx];
    this.level = new Level(this.def);
    this.bg = new Background(this.def.theme);
    this.bg.resize(this.cam.W, this.cam.H);
    this.fx.clear();
    this.views.clear();
    this.snoreT.clear();
    this.launcher = { angle: LAUNCH.restAngle, vel: 0, mode: 'rest', t: 0, from: 0 };
    this.helper = { state: 'idle', t: 0, lean: 0, shift: 0, hop: 0 };
    this.reload = null;
    this.pending = null;
    this.aiming = null;
    this.kbAim = null;
    this.bonus = null;
    this.resultT = null;
    this.camMode = 'auto';
    this.camOverride = null;
    if (this.slowmo > 0) Audio.slowmo(false);
    this.slowmo = 0;
    this.timeScale = 1;
    this.aimT = -9;
    this.fort = this.level.bounds();
    this.cam.minX = this.level.launcherX - 7;
    this.cam.maxX = this.def.width + 4;
    this.fishCombo = 0;
    this.qShift = 0;
    this.helperPose = null;
  }

  startLevel(idx) {
    Audio.unlock();
    this.loadLevel(idx);
    this.screen = 'play';
    this.intro = { t: 0 };
    const [fx, fz] = this.fortView();
    this.cam.target(fx, fz);
    this.cam.snap();
    this.ui.show('hud');
    this.ui.banner(`Уровень ${this.def.id}`, this.def.name, this.def.subtitle);
    this.ui.hint(this.def.hint);
    this.ui.updateHud(this.hudData());
    this.firstShot = true;
    Audio.music(this.style === 'sketch' ? 'sketch' : 'level');
    // знакомство с новым котом
    const fresh = [...new Set(this.def.cats)].find((c) => !this.progress.seen(c));
    if (fresh) {
      setTimeout(() => this.ui.catIntro(fresh), 1400);
      this.progress.markSeen(fresh);
    }
  }

  restart() {
    if (this.screen !== 'play' && this.screen !== 'result' && this.screen !== 'pause') return;
    Audio.ui('click');
    this.startLevel(this.levelIndex);
  }

  next() {
    if (this.levelIndex + 1 < LEVELS.length) this.startLevel(this.levelIndex + 1);
    else this.toLevels();
  }

  play(x, y) {
    // «Играть» с титульного экрана: салфетка оживает
    Audio.unlock();
    Audio.ui('open');
    const idx = Math.min(this.progress.unlocked(LEVELS), LEVELS.length) - 1;
    this.startFromMenu(idx, x, y);
  }

  startFromMenu(idx, x = this.cam.W / 2, y = this.cam.H * 0.5) {
    const from = this.style;
    const toColor = this.progress.data.style !== 'sketch';
    this.startLevel(idx);
    if (from === 'sketch' && toColor) this.startWipe('color', x, y, 1.7);
  }

  toLevels() {
    Audio.ui('open');
    this.screen = 'levels';
    this.ui.renderLevels();
    this.ui.show('levels');
  }

  toTitle() {
    Audio.ui('back');
    this.screen = 'title';
    this.loadLevel(0);
    this.cam.target(...this.overview());
    this.cam.snap();
    Audio.music('title');
    if (this.style !== 'sketch') this.startWipe('sketch', this.cam.W / 2, this.cam.H / 2);
    this.ui.show('title');
  }

  pause(on = this.screen === 'play') {
    if (on && this.screen === 'play') {
      this.screen = 'pause';
      this.ui.show('pause');
      Audio.ui('open');
    } else if (!on && this.screen === 'pause') {
      this.screen = 'play';
      this.ui.show('hud');
      Audio.ui('back');
    }
  }

  // ---------- стиль: цвет ⇄ салфетка ----------
  toggleStyle(x = this.cam.W / 2, y = this.cam.H / 2) {
    if (this.wipe) return;
    const to = this.style === 'sketch' ? 'color' : 'sketch';
    if (this.screen !== 'title') {
      this.progress.data.style = to;
      this.progress.save();
    }
    this.startWipe(to, x, y);
  }

  startWipe(to, x, y, dur = 1.1) {
    if (to === this.style && !this.wipe) return;
    this.wipe = { from: this.style, to, t: 0, dur, x, y, flipped: false };
    Audio.wipe();
    if (this.screen === 'play' || this.screen === 'pause' || this.screen === 'result') Audio.music(to === 'sketch' ? 'sketch' : 'level');
  }

  // ---------- ввод ----------
  bindInput() {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => this.onDown(e));
    c.addEventListener('pointermove', (e) => this.onMove(e));
    c.addEventListener('pointerup', (e) => this.onUp(e));
    c.addEventListener('pointercancel', (e) => this.onUp(e, true));
    c.addEventListener('wheel', (e) => {
      if (this.screen !== 'play') return;
      e.preventDefault();
      this.camMode = 'free';
      const z = clamp(this.cam.tz * Math.exp(-e.deltaY * 0.0012), this.zMin() * 0.8, this.zMax());
      this.cam.target(this.cam.tx, z);
    }, { passive: false });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => this.onKey(e));
  }

  canAim() {
    const lv = this.level;
    return this.screen === 'play' && lv && lv.state === 'aim' && lv.loaded && !this.reload && !this.pending && !this.intro;
  }

  onDown(e) {
    Audio.unlock();
    if (this.screen === 'title') return;
    if (this.screen !== 'play') return;
    if (this.intro) {
      this.intro = null;
      return;
    }
    const lv = this.level;
    if (e.button === 2) {
      this.aiming = null;
      return;
    }
    if (lv.state === 'fly') {
      if (lv.ability()) return;
    }
    const sx = e.clientX, sy = e.clientY;
    if (this.canAim()) {
      const p = this.loadedPos();
      const [cx, cy] = this.cam.toScreen(p.x, p.y);
      const near = Math.hypot(sx - cx, sy - cy) < Math.max(90, 2.2 * this.cam.z);
      // левее катапульты — тоже прицел (удобнее, если кот мелкий)
      const [lsx] = this.cam.toScreen(lv.launcherX + 1.5, 0);
      if (near || sx < lsx) {
        this.aiming = { id: e.pointerId, x0: sx, y0: sy, x: sx, y: sy, angle: 0.5, power: 0 };
        this.kbAim = null;
        this.canvas.setPointerCapture(e.pointerId);
        this.camMode = 'auto';
        return;
      }
    }
    this.pointer = { id: e.pointerId, x0: sx, camX: this.cam.x, moved: false };
    this.canvas.setPointerCapture(e.pointerId);
  }

  onMove(e) {
    if (this.aiming && e.pointerId === this.aiming.id) {
      const A = this.aiming;
      A.x = e.clientX;
      A.y = e.clientY;
      const dx = A.x0 - A.x, dy = A.y - A.y0; // тянем назад — летим вперёд
      const len = Math.hypot(dx, dy);
      A.power = clamp(len / (Math.min(this.cam.W, this.cam.H) * 0.26), 0, 1);
      if (len > 4) A.angle = clamp(Math.atan2(dy, dx), LAUNCH.minAngle, LAUNCH.maxAngle);
      this.aimT = this.time;
      return;
    }
    const P = this.pointer;
    if (P && e.pointerId === P.id) {
      const d = e.clientX - P.x0;
      if (Math.abs(d) > 6) P.moved = true;
      if (P.moved) {
        this.camMode = 'free';
        this.cam.target(P.camX - d / this.cam.z, this.cam.tz);
        this.cam.x = this.cam.clampX(P.camX - d / this.cam.z, this.cam.z);
      }
    }
  }

  onUp(e, cancel) {
    if (this.aiming && e.pointerId === this.aiming.id) {
      const A = this.aiming;
      this.aiming = null;
      Audio.stretchStop();
      if (!cancel && A.power > 0.12 && this.canAim()) this.fire(A.angle, A.power);
      return;
    }
    if (this.pointer && e.pointerId === this.pointer.id) this.pointer = null;
  }

  onKey(e) {
    const k = e.key;
    if (e.repeat && !k.startsWith('Arrow')) return;
    if (k === 'n' || k === 'N' || k === 'т' || k === 'Т') return this.toggleStyle();
    if (k === 'f' || k === 'F' || k === 'а' || k === 'А') return this.ui.toggleFullscreen();
    if (k === 'm' || k === 'M' || k === 'ь' || k === 'Ь') return this.ui.toggleMute();
    if (k === 'h' || k === 'H' || k === 'р' || k === 'Р') return this.ui.toggleHidden();
    if (k === 'Escape') {
      if (this.screen === 'play') return this.pause(true);
      if (this.screen === 'pause') return this.pause(false);
      if (this.screen === 'levels') return this.toTitle();
      return;
    }
    if (this.screen === 'title' && (k === 'Enter' || k === ' ')) return this.play(this.cam.W / 2, this.cam.H * 0.45);
    if (this.screen === 'result' && (k === 'Enter' || k === ' ')) return this.ui.resultPrimary();
    if (this.screen !== 'play') return;
    if (k === 'r' || k === 'R' || k === 'к' || k === 'К') return this.restart();
    if (this.intro && (k === ' ' || k === 'Enter')) {
      this.intro = null;
      return;
    }
    const lv = this.level;
    if (k === ' ' || k === 'Enter') {
      e.preventDefault();
      if (lv.state === 'fly') return void lv.ability();
      if (this.kbAim && this.canAim()) {
        const { angle, power } = this.kbAim;
        this.kbAim = null;
        Audio.stretchStop();
        this.fire(angle, power);
      } else if (this.canAim()) this.kbAim = { angle: 0.55, power: 0.7 };
      return;
    }
    if (k.startsWith('Arrow') && this.canAim()) {
      e.preventDefault();
      if (!this.kbAim) this.kbAim = { angle: 0.55, power: 0.7 };
      const A = this.kbAim;
      if (k === 'ArrowUp') A.angle = clamp(A.angle + 0.02, LAUNCH.minAngle, LAUNCH.maxAngle);
      if (k === 'ArrowDown') A.angle = clamp(A.angle - 0.02, LAUNCH.minAngle, LAUNCH.maxAngle);
      if (k === 'ArrowRight') A.power = clamp(A.power + 0.02, 0.15, 1);
      if (k === 'ArrowLeft') A.power = clamp(A.power - 0.02, 0.15, 1);
      this.aimT = this.time;
    }
  }

  aimInfo() {
    const lv = this.level;
    if (!lv || !lv.loaded || this.reload) return null;
    if (this.aiming && this.aiming.power > 0.05) return { type: lv.loaded, angle: this.aiming.angle, power: this.aiming.power };
    if (this.kbAim) return { type: lv.loaded, angle: this.kbAim.angle, power: this.kbAim.power };
    return null;
  }

  fire(angle, power) {
    const L = this.launcher;
    L.mode = 'fire';
    L.t = 0;
    L.from = L.angle;
    this.pending = { t: 0.075, angle, power };
    this.helper.state = 'yank';
    this.helper.t = 0;
    Audio.launch(power);
    Audio.meow('helper');
    if (this.firstShot) {
      this.firstShot = false;
      this.ui.hint(null);
    }
  }

  // ---------- камера ----------
  zMin() {
    return this.cam.H / 36;
  }

  zMax() {
    return this.cam.H / 11;
  }

  overview() {
    const lv = this.level, f = this.fort;
    const xL = lv.launcherX - 6, xR = f.maxX + 3;
    const z = clamp(Math.min(this.cam.zForWidth(xR - xL), this.cam.zForHeight(f.maxY + 7)), this.cam.H / 60, this.zMax());
    return [(xL + xR) / 2, z];
  }

  fortView() {
    const f = this.level.bounds();
    const z = clamp(Math.min(this.cam.zForHeight(f.maxY + 4.5), this.cam.zForWidth(f.maxX - f.minX + 12)), this.zMin(), this.zMax());
    return [(f.minX + f.maxX) / 2, z];
  }

  aimView() {
    const lv = this.level, f = this.fort;
    const xL = lv.launcherX - 5.8;
    const xR = Math.max(f.maxX + 2.5, xL + 18);
    const z = clamp(Math.min(this.cam.zForWidth(xR - xL), this.cam.zForHeight(Math.max(f.maxY + 3.5, 9))), this.zMin(), this.zMax());
    let x = (xL + xR) / 2;
    if (this.cam.W / z < xR - xL) x = xL + this.cam.W / 2 / z;
    return [x, z];
  }

  camGoal() {
    const lv = this.level;
    if (this.screen === 'title' || this.screen === 'levels') return this.overview();
    if (this.camOverride) return [this.camOverride.x, this.camOverride.z];
    if (this.intro) return this.intro.t < 1.5 ? this.fortView() : this.aimView();
    const [ax, az] = this.aimView();
    if (lv.state === 'fly') {
      const c = [...lv.cats].reverse().find((k) => !k.done && k.body);
      if (c) {
        const p = c.body.getPosition(), v = c.body.getLinearVelocity();
        const z = clamp(Math.min(az * 1.08, this.cam.zForHeight(p.y + 3.2)), this.cam.H / 50, this.zMax());
        return [p.x + clamp(v.x * 0.22, -4, 6), z];
      }
    }
    if (lv.state === 'settle' || lv.state === 'win' || lv.state === 'lose') {
      const f = lv.bounds();
      return [Math.max(ax, (f.minX + f.maxX) / 2), az];
    }
    return [ax, az];
  }

  // ---------- кадр ----------
  update(dt) {
    this.time += dt;
    if (this.wipe) {
      this.wipe.t += dt;
      if (!this.wipe.flipped && this.wipe.t > this.wipe.dur * 0.45) {
        this.wipe.flipped = true;
        this.ui.setSketch(this.wipe.to === 'sketch');
      }
      if (this.wipe.t >= this.wipe.dur) {
        this.style = this.wipe.to;
        this.wipe = null;
      }
    }
    const lv = this.level;
    const paused = this.screen === 'pause' || this.screen === 'levels';
    if (this.slowmo > 0) {
      this.slowmo -= dt;
      this.timeScale = damp(this.timeScale, 0.25, 12, dt);
      if (this.slowmo <= 0) Audio.slowmo(false);
    } else this.timeScale = damp(this.timeScale, 1, 6, dt);
    const gdt = paused ? 0 : dt * this.timeScale;

    if (this.intro) {
      this.intro.t += dt;
      if (this.intro.t > 3.1) this.intro = null;
    }

    if (lv && !paused) {
      if (this.pending) {
        this.pending.t -= gdt;
        if (this.pending.t <= 0) {
          lv.launch(this.pending.angle, this.pending.power);
          this.pending = null;
          this.camMode = 'auto';
        }
      }
      if (this.screen !== 'title') {
        this.acc += gdt;
        let n = 0;
        while (this.acc >= STEP && n < 6) {
          lv.step(STEP);
          this.acc -= STEP;
          n++;
          this.handleEvents();
        }
        if (n === 6) this.acc = 0;
      }
      this.updateViews(dt, gdt);
    }
    this.fx.update(gdt);

    // камера
    if (lv) {
      if (this.camOverride) {
        this.camOverride.t -= dt;
        if (this.camOverride.t <= 0) this.camOverride = null;
      }
      if (this.camMode !== 'free' || this.camOverride) {
        const [x, z] = this.camGoal();
        this.cam.target(x, z);
      }
      const speed = lv.state === 'fly' ? 5 : this.intro ? 2.2 : 3;
      this.cam.update(dt, speed);
    }

    // натяжение
    const A = this.aimInfo();
    // скрип — только пока натяжение меняется
    if (A && this.screen === 'play' && this.time - this.aimT < 0.15) Audio.stretch(A.power);

    if (this.screen === 'play' || this.screen === 'result') this.ui.updateHud(this.hudData());
    this.ui.update(dt);
  }

  updateViews(dt, gdt) {
    const lv = this.level;
    const L = this.launcher;
    const A = this.aimInfo();
    // доска катапульты
    if (L.mode === 'fire') {
      L.t += gdt;
      const u = clamp(L.t / 0.085, 0, 1);
      L.angle = lerp(L.from, LAUNCH.fireAngle, u * u);
      if (u >= 1) {
        L.mode = 'down';
        L.vel = 0;
        this.fx.dust(lv.launcherX + LAUNCH.halfLen * 0.9, 0.1, 6, this.bg.th.dust, 0.8, 0.25);
        this.cam.addShake(0.12);
      }
    } else {
      const target = L.mode === 'down' ? LAUNCH.fireAngle : LAUNCH.restAngle + (A ? Math.sin(this.time * 55) * 0.006 * A.power : 0);
      L.vel += ((target - L.angle) * 170 - L.vel * 9) * gdt;
      L.angle += L.vel * gdt;
    }
    // перезарядка: следующий кот прыгает в чашку
    if (this.reload) {
      const R = this.reload;
      R.t += gdt;
      if (R.t >= R.dur) {
        this.reload = null;
        L.mode = 'rest';
        L.vel = 2.5;
        this.fx.dust(this.level.cupPos(R.type, L.angle).x, 0.3, 4, this.bg.th.dust, 0.6, 0.2);
      }
    }
    this.qShift = damp(this.qShift, 0, 6, gdt);
    // помощник
    const H = this.helper;
    H.t += gdt;
    if (H.state === 'yank' && H.t > 1.35) H.state = 'idle';
    if (lv.state === 'win' && H.state !== 'cheer') { H.state = 'cheer'; H.t = 0; }
    if (lv.state === 'lose' && H.state !== 'sad') { H.state = 'sad'; H.t = 0; }
    this.updateHelper(gdt || dt);
    // сони: подглядывание
    for (const s of lv.sleepers) {
      const v = this.sleeperView(s);
      v.peek = Math.max(0, v.peek - dt * 0.9);
      if (!s.awake && this.screen === 'play') {
        const t = (this.snoreT.get(s.id) ?? rand(0.5, 2.5)) - dt;
        if (t <= 0) {
          Audio.snore(this.panOf(s.body.getPosition().x));
          this.snoreT.set(s.id, 3.4 + rand(0, 0.8));
        } else this.snoreT.set(s.id, t);
      }
    }
    // бонус за оставшихся котов
    if (this.bonus) {
      const B = this.bonus;
      B.t += dt;
      while (B.shown < B.count && B.t > 0.35 + B.shown * 0.42) {
        const c = B.cats[B.shown];
        this.fx.text(c.x, c.y + 1.2, '+10 000', '#FFE27A', 0.55, 1.4);
        this.fx.sparks(c.x, c.y + 0.5, 10);
        Audio.tick();
        Audio.meow(c.type === 'barsik' ? 'barsik' : 'kitten');
        B.shown++;
      }
    }
    if (this.resultT != null) {
      this.resultT -= dt;
      if (this.resultT <= 0) {
        this.resultT = null;
        this.showResult();
      }
    }
  }

  catView(c) {
    const lv = this.level;
    if (!c.hit) return { expr: c.pounding || c.dashT > 0 ? 'aim' : 'fly' };
    return { expr: lv.time - c.hitT < 0.35 ? 'hit' : 'dizzy' };
  }

  sleeperView(s) {
    let v = this.views.get(s.id);
    if (!v) {
      v = { peek: 0 };
      this.views.set(s.id, v);
    }
    return v;
  }

  slotPos(i, type) {
    const r = CAT_TYPES[type].r;
    return { x: this.level.launcherX - 3.4 - i * 1.3 - (r - 0.55) * 0.5, y: r };
  }

  queueView() {
    const lv = this.level;
    const list = [];
    const t = this.time;
    const bonusHop = (i) => {
      if (!this.bonus) return 0;
      const bt = this.bonus.t - 0.35 - i * 0.42;
      return bt > 0 && bt < 0.45 ? Math.sin((bt / 0.45) * Math.PI) * 1.1 : 0;
    };
    const offset = this.bonus && lv.loaded ? 1 : 0;
    lv.queue.forEach((type, i) => {
      const p = this.slotPos(i, type);
      const shift = this.qShift * 1.3;
      const hop = this.qShift > 0.05 ? Math.abs(Math.sin(this.qShift * 9)) * 0.25 : 0;
      const phase = i * 1.7 + 0.3;
      const blink = (t + phase) % 3.7 < 0.13;
      const watch = lv.state === 'fly' ? 0.9 : 0.5;
      list.push({
        type, x: p.x - shift, y: p.y + hop + bonusHop(i + offset), phase, blink,
        expr: lv.state === 'win' ? 'happy' : lv.state === 'lose' ? 'idle' : 'idle', lx: watch, ly: lv.state === 'fly' ? -0.6 : -0.1,
      });
    });
    return list;
  }

  loadedPos() {
    const lv = this.level;
    return lv.cupPos(lv.loaded, this.launcher.angle);
  }

  loadedView() {
    const lv = this.level;
    if (!lv.loaded) return null;
    const type = lv.loaded;
    const r = CAT_TYPES[type].r;
    if (this.reload) {
      const R = this.reload;
      const u = ease.inOutCubic(clamp(R.t / R.dur, 0, 1));
      const to = lv.cupPos(type, this.launcher.angle);
      return {
        type, x: lerp(R.from.x, to.x, u), y: lerp(R.from.y, to.y, u) + Math.sin(u * Math.PI) * 1.6,
        a: -u * Math.PI * 2 * 0.0, expr: 'happy', phase: 0.7, sx: 1, sy: 1, lx: 0.6,
      };
    }
    const p = lv.cupPos(type, this.launcher.angle);
    const A = this.aimInfo();
    const pw = A ? A.power : 0;
    const blink = (this.time % 3.1) < 0.12;
    const bh = this.bonus ? (() => {
      const bt = this.bonus.t - 0.35;
      return bt > 0 && bt < 0.45 ? Math.sin((bt / 0.45) * Math.PI) * 1.1 : 0;
    })() : 0;
    return {
      type, x: p.x, y: p.y + bh, a: this.launcher.angle * 0.4, expr: A || this.pending ? 'aim' : this.level.state === 'win' ? 'happy' : 'idle',
      blink: !A && blink, phase: 0.7, sx: 1 + pw * 0.12, sy: 1 - pw * 0.16, lx: A ? Math.cos(A.angle) : 0.6, ly: A ? -Math.sin(A.angle) * 0.8 : -0.2,
    };
  }

  updateHelper(dt) {
    const lv = this.level;
    const H = this.helper;
    const A = this.aimInfo();
    const r = 0.55;
    let lean = 0, shift = 0, expr = 'bite', sag = 0.35, sweat = 0, hop = 0;
    if (H.state === 'yank') {
      const t = H.t;
      if (t < 0.12) { lean = lerp(0.2, 1.0, t / 0.12); shift = lerp(0.2, 0.9, t / 0.12); expr = 'effort'; sag = 0.02; }
      else if (t < 0.85) { lean = 1.45; shift = 1.1; expr = 'dizzy'; sag = 0.55; }
      else { const u = ease.outBack(clamp((t - 0.85) / 0.5, 0, 1)); lean = lerp(1.45, 0, u); shift = lerp(1.1, 0, u); expr = 'bite'; }
    } else if (H.state === 'cheer') {
      hop = Math.abs(Math.sin(H.t * 7)) * 0.55;
      lean = Math.sin(H.t * 7) * 0.12;
      expr = 'happy';
    } else if (H.state === 'sad') {
      lean = -0.18;
      expr = 'idle';
    } else if (A) {
      lean = 0.1 + A.power * 0.42;
      shift = A.power * 0.4;
      expr = A.power > 0.3 ? 'effort' : 'bite';
      sag = 0.3 * (1 - A.power) * (1 - A.power);
      sweat = clamp((A.power - 0.7) * 3.3, 0, 1);
    }
    const k = H.state === 'yank' ? 30 : 10;
    H.lean = damp(H.lean, lean, k, dt);
    H.shift = damp(H.shift, shift, k, dt);
    H.sag = damp(H.sag ?? sag, sag, 12, dt);
    const fx = lv.launcherX + LAUNCH.halfLen + 1.0 + H.shift;
    const a = -H.lean;
    const cx = fx + Math.sin(H.lean) * r, cy = Math.cos(H.lean) * r + hop;
    const mx = cx - 0.38 * r * Math.cos(a) + 0.24 * r * Math.sin(a);
    const my = cy - 0.38 * r * Math.sin(a) - 0.24 * r * Math.cos(a);
    const blink = (this.time % 4.3) < 0.12;
    this.helperPose = { x: cx, y: cy, a, r, expr, blink, sweat, mouth: { x: mx, y: my }, sag: H.sag };
  }

  helperView() {
    if (!this.helperPose) this.updateHelper(0);
    return this.helperPose;
  }

  panOf(x) {
    return clamp(((x - this.cam.x) * this.cam.z) / (this.cam.W / 2), -1, 1) * 0.8;
  }

  // ---------- события уровня ----------
  handleEvents() {
    const lv = this.level;
    const th = this.bg.th;
    for (const e of lv.events) {
      switch (e.type) {
        case 'load':
          if (lv.shots > 0) {
            const from = this.slotPos(0, e.cat);
            this.reload = { t: 0, dur: 0.55, type: e.cat, from };
            this.qShift = 1;
          }
          break;
        case 'launch':
          this.fx.dust(e.x, e.y - 0.4, 5, th.dust, 0.7, 0.25);
          Audio.meow(e.cat === 'barsik' ? 'barsik' : e.cat === 'ugolek' ? 'ugolek' : e.cat === 'trio' ? 'kitten' : 'ryzhik');
          if (!CAT_TYPES[e.cat].ability) this.ui.abilityHint(null);
          else this.ui.abilityHint(ABILITY_HINT[CAT_TYPES[e.cat].ability]);
          break;
        case 'impact': {
          Audio.impact(e.material, e.strength, this.panOf(e.x));
          if (e.strength > 0.25) this.fx.dust(e.x, e.y, Math.round(2 + e.strength * 6), th.dust, 0.6 + e.strength, 0.18 + e.strength * 0.2);
          if (e.strength > 0.55) this.cam.addShake(0.1 * e.strength);
          break;
        }
        case 'crack':
          this.fx.sparks(e.x, e.y, 3, ['#FFFFFF', '#FFE9C0'], 2.5);
          break;
        case 'break':
          this.fx.breakBlock(e, th.dust);
          Audio.breakBlock(e.material, this.panOf(e.x));
          this.fx.text(e.x, e.y + 0.4, `+${e.score}`, '#FFFFFF', 0.42, 1.0, '#3A2A1A');
          this.cam.addShake(0.08);
          break;
        case 'fish': {
          this.fishCombo = this.time - this.lastFishT < 1.4 ? this.fishCombo + 1 : 0;
          this.lastFishT = this.time;
          Audio.fish(this.fishCombo);
          this.fx.sparks(e.x, e.y, 14, ['#8FE3FF', '#FFFFFF', '#FFE27A'], 5);
          this.fx.ring(e.x, e.y, 0.2, 1.1, '#BDF0FF', 0.12, 0.45);
          this.fx.text(e.x, e.y + 0.5, '+1000', '#8FE3FF', 0.5, 1.2, '#0E3A5A');
          const [sx, sy] = this.cam.toScreen(e.x, e.y);
          this.ui.fishFly(sx, sy);
          break;
        }
        case 'grumble':
          this.sleeperView(e.sleeper).peek = 1.2;
          Audio.grumble(this.panOf(e.x));
          break;
        case 'wake': {
          Audio.wake(this.panOf(e.x));
          this.fx.ring(e.x, e.y, 0.3, 2.6, '#FFFFFF', 0.3, 0.6);
          this.fx.sparks(e.x, e.y + 0.5, 22, ['#FFE27A', '#FFFFFF', '#FF9EC0'], 6);
          this.fx.text(e.x, e.y + 2.3, 'ПРОСНУЛСЯ!', '#FFE27A', 0.7, 1.8, '#5A2A00');
          this.fx.text(e.x, e.y + 1.6, '+5000', '#FFFFFF', 0.5, 1.6, '#3A2A1A');
          this.cam.addShake(0.35);
          if (e.last) {
            this.slowmo = 1.25;
            Audio.slowmo(true);
            this.camOverride = { x: e.x, z: clamp(this.cam.z * 1.45, this.zMin(), this.zMax() * 1.3), t: 1.35 };
          }
          break;
        }
        case 'flee':
          this.fx.dust(e.x, e.y, 8, th.dust, 1, 0.3);
          Audio.meow('sleeper');
          break;
        case 'catHit':
          this.ui.abilityHint(null);
          if (e.imp > 6) Audio.meow(e.cat === 'barsik' ? 'barsik' : 'kitten');
          break;
        case 'catPoof':
          if (!e.out) this.fx.poof(e.x, e.y, th.dust);
          break;
        case 'ability':
          this.ui.abilityHint(null);
          if (e.ability === 'dash') {
            Audio.dash();
            for (let i = 0; i < 10; i++) this.fx.add({ k: 'line', x: e.x + rand(-0.6, 0.6), y: e.y + rand(-0.6, 0.6), dx: 1, dy: 0, len: rand(0.8, 1.6), lw: 0.06, color: '#FFFFFF', life: 0.35, vx: 20, vy: 0 });
            this.fx.ring(e.x, e.y, 0.3, 1.4, '#C9B8FF', 0.2, 0.3);
          } else if (e.ability === 'pound') {
            Audio.pound();
            this.fx.ring(e.x, e.y, 0.3, 1.5, '#FFFFFF', 0.2, 0.35);
          } else if (e.ability === 'split') {
            Audio.split();
            this.fx.sparks(e.x, e.y, 16, ['#FFE27A', '#FF9EC0', '#FFFFFF'], 5);
            this.fx.dust(e.x, e.y, 6, '#FFFFFF', 0.6, 0.25);
          } else if (e.ability == null) {
            Audio.meow('ryzhik');
            this.fx.text(e.x, e.y + 0.9, 'Мяу!', '#FFFFFF', 0.45, 0.9, '#6E3B1C');
          }
          break;
        case 'boom':
          Audio.boom(1);
          this.fx.ring(e.x, e.y, 0.4, e.r, '#FFFFFF', 0.45, 0.55);
          this.fx.ring(e.x, e.y, 0.2, e.r * 0.7, th.dust, 0.3, 0.7);
          this.fx.dust(e.x, e.y, 20, th.dust, 2.4, 0.35);
          this.cam.addShake(0.9);
          break;
        case 'win': {
          this.ui.abilityHint(null);
          Audio.win();
          const f = lv.bounds();
          this.fx.confetti((f.minX + f.maxX) / 2, f.maxY + 5, 110);
          const cats = [];
          if (lv.loaded) cats.push({ type: lv.loaded, ...lv.cupPos(lv.loaded, this.launcher.angle) });
          lv.queue.forEach((type, i) => cats.push({ type, ...this.slotPos(i, type) }));
          this.bonus = { t: 0, count: e.spare, shown: 0, cats };
          this.resultT = 1.6 + e.spare * 0.42;
          break;
        }
        case 'lose':
          this.ui.abilityHint(null);
          Audio.lose();
          this.resultT = 1.3;
          break;
      }
    }
    lv.events.length = 0;
  }

  showResult() {
    const lv = this.level;
    const won = lv.state === 'win';
    const stars = lv.stars();
    const prev = this.progress.best(this.def.id);
    let isNew = false;
    if (won) isNew = this.progress.record(this.def.id, lv.score, stars) && !!prev;
    this.screen = 'result';
    this.ui.showResult({
      won, stars, score: lv.score, isNew, best: prev,
      fish: lv.fishGot, fishTotal: lv.fishTotal, name: this.def.name, id: this.def.id,
      hasNext: this.levelIndex + 1 < LEVELS.length,
    });
  }

  hudData() {
    const lv = this.level;
    return {
      score: lv.score, fish: lv.fishGot, fishTotal: lv.fishTotal,
      sleepers: lv.sleepers.length - lv.sleepersLeft(), sleepersTotal: lv.sleepers.length,
      cats: (lv.loaded ? 1 : 0) + lv.queue.length,
    };
  }

  frame(dt) {
    this.update(dt);
    this.renderer.render(this);
  }
}

export { LEVELS, THEMES };
