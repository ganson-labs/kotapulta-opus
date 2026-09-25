// Симуляция уровня: физический мир, блоки, рыбки, спящие коты, запуск котов и ход игры.
// Модуль не трогает DOM и звук — всё наружу уходит через this.events, поэтому
// его же гоняет автотест уровней в Node.
import { World, Vec2, Box, Circle, Polygon } from 'planck';
import {
  GRAVITY, STEP, MATERIALS, BLOCK_KINDS, CAT_TYPES, LAUNCH, SCORE, DAMAGE_MIN,
} from './config.js';
import { clamp, lerp } from './util.js';

let nextId = 1;

export class Level {
  constructor(def) {
    this.def = def;
    this.world = new World({ gravity: Vec2(0, GRAVITY) });
    this.events = [];
    this.time = 0;
    this.score = 0;
    this.blocks = [];
    this.fishes = [];
    this.sleepers = [];
    this.cats = [];
    this.trail = [];
    this.prevTrail = [];
    this.queue = def.cats.slice();
    this.loaded = null;
    this.state = 'aim';
    this.stateT = 0;
    this.launcherX = def.launcher ?? 6;
    this.width = def.width;
    this.hits = new Map();
    this.toDestroy = [];
    this.shots = 0;
    this.lastWakeT = -1;
    this.spare = 0;

    const ground = this.world.createBody({ type: 'static', position: Vec2(0, 0) });
    ground.createFixture({ shape: new Box(600, 10, Vec2(100, -10), 0), friction: 0.9 });
    this.ground = { id: nextId++, kind: 'ground', body: ground };
    ground.setUserData(this.ground);

    for (const o of def.objects) this.spawn(o);
    this.fishTotal = this.fishes.length;
    this.fishGot = 0;

    this.approach = new Map();
    this.world.on('pre-solve', (c) => this.onPreSolve(c));
    this.world.on('post-solve', (c, imp) => this.onPostSolve(c, imp));
    this.world.on('begin-contact', (c) => this.onBeginContact(c));
    this.maxScore = this.computeMaxScore();
    this.loadNext();
  }

  emit(type, data = {}) {
    data.type = type;
    this.events.push(data);
  }

  // ---------- создание объектов ----------

  spawn(o) {
    if (o.t === 'fish') return this.spawnFish(o);
    if (o.t === 'sleeper') return this.spawnSleeper(o);
    return this.spawnBlock(o);
  }

  spawnBlock(o) {
    const material = BLOCK_KINDS[o.t];
    const m = MATERIALS[material];
    const body = this.world.createBody({
      type: 'dynamic', position: Vec2(o.x, o.y), angle: o.a || 0, awake: false,
      angularDamping: 0.1,
    });
    let shape, area, w = o.w, h = o.h, r = o.r;
    if (o.t === 'yarn') {
      shape = new Circle(r);
      area = Math.PI * r * r;
      w = h = r * 2;
    } else if (o.t === 'pot') {
      const bw = w * 0.34;
      shape = new Polygon([Vec2(-bw, -h / 2), Vec2(bw, -h / 2), Vec2(w / 2, h / 2), Vec2(-w / 2, h / 2)]);
      area = (bw * 2 + w) / 2 * h;
    } else {
      shape = new Box(w / 2, h / 2);
      area = w * h;
    }
    body.createFixture({ shape, density: m.density, friction: m.friction, restitution: m.restitution });
    const size = clamp(Math.sqrt(area / 1.5), 0.55, 2.2);
    const ent = {
      id: nextId++, kind: 'block', type: o.t, material, body, w, h, r,
      hp: m.hp * size, maxHp: m.hp * size,
      score: Math.round((m.score * size) / 50) * 50,
      alive: true, seed: (o.seed ?? nextId * 7919) >>> 0, v: o.v ?? 0,
      lastSoundT: -1, flash: 0,
    };
    body.setUserData(ent);
    this.blocks.push(ent);
    return ent;
  }

  spawnFish(o) {
    const body = this.world.createBody({
      type: 'dynamic', position: Vec2(o.x, o.y), angle: o.a || 0, awake: false,
    });
    body.createFixture({ shape: new Box(0.34, 0.15), density: 0.35, friction: 0.8, restitution: 0.1 });
    const ent = {
      id: nextId++, kind: 'fish', body, collected: false, startY: o.y,
      seed: nextId * 31, lastSoundT: -1,
    };
    body.setUserData(ent);
    this.fishes.push(ent);
    return ent;
  }

  spawnSleeper(o) {
    const s = o.s ?? 1;
    const hw = 0.82 * s, hh = 0.44 * s;
    const body = this.world.createBody({
      type: 'dynamic', position: Vec2(o.x, o.y ?? hh), awake: false,
    });
    body.createFixture({ shape: new Box(hw, hh), density: 0.7, friction: 0.9, restitution: 0.05 });
    const ent = {
      id: nextId++, kind: 'sleeper', body, s, hw, hh, awake: false,
      sleepHp: 3.2 * s * s * (o.tough ?? 1), boss: !!o.boss, flip: !!o.flip,
      startY: o.y, lastGrumbleT: -9, lastSoundT: -1,
      // после пробуждения — вне физики: испуг, затем прыжок прочь
      wx: 0, wy: 0, wa: 0, vx: 0, vy: 0, wakeT: 0, gone: false,
    };
    body.setUserData(ent);
    this.sleepers.push(ent);
    return ent;
  }

  makeCat(type, x, y, vx, vy) {
    const ct = CAT_TYPES[type];
    const body = this.world.createBody({
      type: 'dynamic', position: Vec2(x, y), bullet: true, angularDamping: 1.2,
    });
    body.createFixture({ shape: new Circle(ct.r), density: ct.density, friction: 0.6, restitution: 0.28 });
    body.setLinearVelocity(Vec2(vx, vy));
    const cat = {
      id: nextId++, kind: 'cat', type, r: ct.r, body, hit: false, hitT: 0, t0: this.time,
      stillT: 0, done: false, abilityUsed: false, pounding: false, boomed: false, dashT: 0,
      hitMult: 1.25, lastSoundT: -1, spin: 0,
    };
    body.setUserData(cat);
    this.cats.push(cat);
    return cat;
  }

  // ---------- катапульта ----------

  pivot() {
    return { x: this.launcherX, y: LAUNCH.pivotH };
  }

  // Позиция кота в чашке катапульты при заданном наклоне доски.
  cupPos(type, angle) {
    const r = CAT_TYPES[type].r;
    const p = this.pivot();
    const d = LAUNCH.halfLen - 0.45;
    const nx = -Math.sin(angle), ny = Math.cos(angle);
    return {
      x: p.x - d * Math.cos(angle) + nx * (r + 0.1),
      y: p.y - d * Math.sin(angle) + ny * (r + 0.1),
    };
  }

  launchPoint(type) {
    return this.cupPos(type, LAUNCH.fireAngle);
  }

  launchVelocity(type, angle, power) {
    const a = clamp(angle, LAUNCH.minAngle, LAUNCH.maxAngle);
    const sp = lerp(LAUNCH.minSpeed, LAUNCH.maxSpeed, clamp(power, 0, 1)) * CAT_TYPES[type].speed;
    return { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp };
  }

  // Та же схема интегрирования, что у planck, — прицел совпадает с полётом.
  trajectory(type, angle, power, maxT = 4) {
    const p = this.launchPoint(type);
    const v = this.launchVelocity(type, angle, power);
    const pts = [];
    let x = p.x, y = p.y, vx = v.vx, vy = v.vy;
    for (let t = 0; t < maxT; t += STEP) {
      vy += GRAVITY * STEP;
      x += vx * STEP;
      y += vy * STEP;
      pts.push(x, y);
      if (y < 0 || x > this.width + 20) break;
    }
    return pts;
  }

  loadNext() {
    this.loaded = this.queue.length ? this.queue.shift() : null;
    if (this.loaded) this.emit('load', { cat: this.loaded });
  }

  launch(angle, power) {
    if (this.state !== 'aim' || !this.loaded) return null;
    const type = this.loaded;
    const p = this.launchPoint(type);
    const v = this.launchVelocity(type, angle, power);
    this.loaded = null;
    this.prevTrail = this.trail;
    this.trail = [p.x, p.y];
    this.trailT = 0;
    const cat = this.makeCat(type, p.x, p.y, v.vx, v.vy);
    this.shots++;
    this.setState('fly');
    this.emit('launch', { cat: type, power, x: p.x, y: p.y });
    return cat;
  }

  // Способность последнего летящего кота (до первого удара).
  ability() {
    const cat = [...this.cats].reverse().find((c) => !c.done && !c.hit && !c.abilityUsed);
    if (!cat) return false;
    const ab = CAT_TYPES[cat.type].ability;
    cat.abilityUsed = true;
    const b = cat.body;
    const p = b.getPosition(), v = b.getLinearVelocity();
    const sp = Math.hypot(v.x, v.y) || 1;
    if (!ab) {
      this.emit('meow', { cat: cat.type, x: p.x, y: p.y });
      return true;
    }
    if (ab === 'dash') {
      const ns = Math.max(34, sp * 1.5);
      const f = b.getFixtureList();
      f.setDensity(f.getDensity() * 2.2);
      b.resetMassData();
      b.setLinearVelocity(Vec2((v.x / sp) * ns, (v.y / sp) * ns));
      cat.dashT = 0.45;
      cat.hitMult = 2.6;
    } else if (ab === 'pound') {
      const f = b.getFixtureList();
      f.setDensity(f.getDensity() * 3.2);
      b.resetMassData();
      b.setLinearVelocity(Vec2(v.x * 0.08, -32));
      b.setAngularVelocity(-14);
      cat.pounding = true;
      cat.hitMult = 2.2;
    } else if (ab === 'split') {
      cat.done = true;
      cat.split = true;
      this.toDestroy.push(cat);
      const base = Math.atan2(v.y, v.x);
      const nx = -v.y / sp, ny = v.x / sp;
      [-0.2, 0, 0.2].forEach((da, i) => {
        const a = base + da;
        const off = (i - 1) * 0.5;
        const k = this.makeCat('kitten', p.x + nx * off, p.y + ny * off, Math.cos(a) * sp * 1.05, Math.sin(a) * sp * 1.05);
        k.abilityUsed = true;
        k.t0 = cat.t0;
      });
    }
    this.emit('ability', { cat: cat.type, ability: ab, x: p.x, y: p.y });
    return true;
  }

  // ---------- столкновения ----------

  onBeginContact(contact) {
    const ea = contact.getFixtureA().getBody().getUserData();
    const eb = contact.getFixtureB().getBody().getUserData();
    if (!ea || !eb) return;
    // Кот, коснувшийся рыбки, забирает её сразу.
    if (ea.kind === 'fish' && eb.kind === 'cat') this.collectFish(ea);
    else if (eb.kind === 'fish' && ea.kind === 'cat') this.collectFish(eb);
  }

  // Скорость сближения в точке контакта до решения. Лежащий груз даёт ~g·dt,
  // настоящий удар — метры в секунду: так вес башни не засчитывается как урон.
  onPreSolve(contact) {
    const ba = contact.getFixtureA().getBody(), bb = contact.getFixtureB().getBody();
    const ea = ba.getUserData(), eb = bb.getUserData();
    if (!ea || !eb) return;
    const n = contact.getManifold().pointCount;
    if (!n) return;
    const wm = contact.getWorldManifold(null);
    if (!wm) return;
    let best = 0;
    for (let i = 0; i < n; i++) {
      const p = wm.points[i];
      const va = ba.getLinearVelocityFromWorldPoint(p), vb = bb.getLinearVelocityFromWorldPoint(p);
      const rel = -((vb.x - va.x) * wm.normal.x + (vb.y - va.y) * wm.normal.y);
      if (rel > best) best = rel;
    }
    if (best < 0.7) return;
    const key = ea.id < eb.id ? ea.id * 1e6 + eb.id : eb.id * 1e6 + ea.id;
    this.approach.set(key, Math.max(best, this.approach.get(key) || 0));
  }

  onPostSolve(contact, impulse) {
    const ea = contact.getFixtureA().getBody().getUserData();
    const eb = contact.getFixtureB().getBody().getUserData();
    if (!ea || !eb) return;
    const key = ea.id < eb.id ? ea.id * 1e6 + eb.id : eb.id * 1e6 + ea.id;
    if (!this.approach.has(key)) return;
    const n = contact.getManifold().pointCount;
    let imp = 0;
    for (let i = 0; i < n; i++) imp += impulse.normalImpulses[i];
    if (imp < 0.35) return;
    const prev = this.hits.get(key);
    if (prev && prev.imp >= imp) return;
    const wm = contact.getWorldManifold(null);
    const pt = wm && wm.points[0] ? { x: wm.points[0].x, y: wm.points[0].y } : null;
    this.hits.set(key, { a: ea, b: eb, imp, pt });
  }

  processHits() {
    for (const h of this.hits.values()) {
      const pt = h.pt || h.a.body.getPosition();
      this.applyHit(h.a, h.b, h.imp, pt);
      this.applyHit(h.b, h.a, h.imp, pt);
      this.soundHit(h.a, h.b, h.imp, pt);
    }
    this.hits.clear();
    this.approach.clear();
  }

  soundHit(a, b, imp, pt) {
    if (imp < 0.8) return;
    const pickMat = (e) =>
      e.kind === 'block' ? e.material : e.kind === 'cat' || e.kind === 'sleeper' ? 'cat' : e.kind === 'fish' ? 'fish' : 'ground';
    // Звучит «интереснее» тот, кто не земля; при ударе кота о блок — блок.
    let src = a.kind === 'ground' ? b : b.kind === 'ground' ? a : a.kind === 'block' ? a : b;
    if (this.time - (src.lastSoundT ?? -1) < 0.09) return;
    src.lastSoundT = this.time;
    const strength = clamp((imp - 0.6) / 14, 0.05, 1);
    this.emit('impact', { material: pickMat(src), strength, x: pt.x, y: pt.y, imp });
  }

  applyHit(t, o, imp, pt) {
    if (t.kind === 'block') {
      if (!t.alive || t.hp === Infinity) return;
      let dmg = imp - DAMAGE_MIN;
      if (dmg <= 0) return;
      if (o.kind === 'cat') dmg *= o.hitMult;
      t.hp -= dmg;
      t.flash = 1;
      if (t.hp <= 0) this.destroyBlock(t, pt);
      else if (dmg > t.maxHp * 0.25) this.emit('crack', { material: t.material, x: pt.x, y: pt.y, block: t });
    } else if (t.kind === 'sleeper') {
      if (t.awake) return;
      let d = imp - 0.6;
      if (d <= 0) return;
      if (o.kind === 'cat') d *= 1.6;
      t.sleepHp -= d;
      if (t.sleepHp <= 0) this.wakeSleeper(t);
      else if (d > 0.5 && this.time - t.lastGrumbleT > 1.2) {
        t.lastGrumbleT = this.time;
        const p = t.body.getPosition();
        this.emit('grumble', { x: p.x, y: p.y, sleeper: t });
      }
    } else if (t.kind === 'fish') {
      if (imp > 1.1) this.collectFish(t);
    } else if (t.kind === 'cat') {
      if (!t.hit) {
        t.hit = true;
        t.hitT = this.time;
        this.emit('catHit', { cat: t.type, x: pt.x, y: pt.y, imp, ent: t });
      }
      if (t.pounding && !t.boomed) this.boom(t);
    }
  }

  boom(cat) {
    cat.boomed = true;
    const c = cat.body.getPosition();
    const R = 4.6;
    this.emit('boom', { x: c.x, y: c.y, r: R });
    for (let b = this.world.getBodyList(); b; b = b.getNext()) {
      const e = b.getUserData();
      if (!e || e === cat || !b.isDynamic()) continue;
      const p = b.getWorldCenter();
      const dx = p.x - c.x, dy = p.y - c.y;
      const d = Math.hypot(dx, dy);
      if (d > R) continue;
      const f = 1 - d / R;
      const ux = dx / (d || 1), uy = dy / (d || 1) + 0.9;
      const ul = Math.hypot(ux, uy);
      const k = b.getMass() * 8 * f;
      b.setAwake(true);
      b.applyLinearImpulse(Vec2((ux / ul) * k, (uy / ul) * k), p, true);
      if (e.kind === 'block' && e.alive && e.hp !== Infinity) {
        e.hp -= 9 * f;
        e.flash = 1;
        if (e.hp <= 0) this.destroyBlock(e, p);
      } else if (e.kind === 'sleeper' && !e.awake) {
        e.sleepHp -= 7 * f;
        if (e.sleepHp <= 0) this.wakeSleeper(e);
      } else if (e.kind === 'fish') this.collectFish(e);
    }
  }

  destroyBlock(t, pt) {
    if (!t.alive) return;
    t.alive = false;
    this.toDestroy.push(t);
    this.score += t.score;
    const p = t.body.getPosition();
    this.emit('break', {
      material: t.material, block: t, x: p.x, y: p.y, a: t.body.getAngle(), score: t.score,
      hx: pt ? pt.x : p.x, hy: pt ? pt.y : p.y,
    });
  }

  collectFish(f) {
    if (f.collected) return;
    f.collected = true;
    this.toDestroy.push(f);
    this.fishGot++;
    this.score += SCORE.fish;
    const p = f.body.getPosition();
    this.emit('fish', { x: p.x, y: p.y, a: f.body.getAngle(), score: SCORE.fish });
  }

  wakeSleeper(s) {
    if (s.awake) return;
    s.awake = true;
    s.wakeT = this.time;
    this.lastWakeT = this.time;
    const p = s.body.getPosition();
    s.wx = p.x;
    s.wy = p.y;
    s.wa = s.body.getAngle();
    this.toDestroy.push(s);
    this.score += SCORE.sleeper;
    const left = this.sleepers.filter((z) => !z.awake).length;
    this.emit('wake', { x: p.x, y: p.y, sleeper: s, last: left === 0, score: SCORE.sleeper });
  }

  flushDestroy() {
    if (!this.toDestroy.length) return;
    for (const e of this.toDestroy) {
      if (!e.body) continue;
      const p = e.body.getPosition();
      this.world.destroyBody(e.body);
      e.lastPos = { x: p.x, y: p.y };
      e.body = null;
      this.wakeAround(p.x, p.y, 3.5);
    }
    this.toDestroy.length = 0;
  }

  // Box2D не будит соседей при удалении тела — будим сами, иначе башня повиснет в воздухе.
  wakeAround(x, y, r) {
    for (let b = this.world.getBodyList(); b; b = b.getNext()) {
      if (!b.isDynamic()) continue;
      const p = b.getPosition();
      if (Math.abs(p.x - x) < r + 2 && Math.abs(p.y - y) < r + 4) b.setAwake(true);
    }
  }

  // ---------- шаг ----------

  step(dt = STEP) {
    this.time += dt;
    this.stateT += dt;
    this.world.step(dt, 10, 4);
    this.processHits();
    this.checkObjects();
    this.updateCats(dt);
    this.flushDestroy();
    this.updateWoken(dt);
    this.updateState(dt);
  }

  checkObjects() {
    for (const f of this.fishes) {
      if (f.collected || !f.body) continue;
      const v = f.body.getLinearVelocity();
      const p = f.body.getPosition();
      if (Math.hypot(v.x, v.y) > 2.4 || (f.startY > 1 && p.y < 0.45) || p.y < -2) this.collectFish(f);
    }
    for (const s of this.sleepers) {
      if (s.awake || !s.body) continue;
      const p = s.body.getPosition();
      const a = s.body.getAngle();
      if (s.startY - p.y > 0.85 || Math.abs(a) > 0.95 || p.y < -2) this.wakeSleeper(s);
    }
    for (const b of this.blocks) {
      if (!b.alive || !b.body) continue;
      const p = b.body.getPosition();
      if (p.y < -3 || p.x < -30 || p.x > this.width + 40) {
        b.alive = false;
        this.toDestroy.push(b);
      }
      if (b.flash > 0) b.flash = Math.max(0, b.flash - STEP * 4);
    }
  }

  updateCats(dt) {
    for (const c of this.cats) {
      if (c.done || !c.body) continue;
      const b = c.body;
      const p = b.getPosition();
      const v = b.getLinearVelocity();
      const sp = Math.hypot(v.x, v.y);
      if (c.dashT > 0) c.dashT -= dt;
      // след полёта — пунктир, как на рисунке
      if (!c.hit || this.time - c.hitT < 0.15) {
        this.trailT += dt;
        if (this.trailT > 0.035 && c.type !== 'kitten') {
          this.trailT = 0;
          this.trail.push(p.x, p.y);
        }
      }
      c.stillT = sp < 0.35 ? c.stillT + dt : 0;
      const age = this.time - c.t0;
      const out = p.x < -20 || p.x > this.width + 25 || p.y < -4;
      if (out || (c.hit && c.stillT > 0.45) || c.stillT > 1.2 || age > 9 || (c.hit && this.time - c.hitT > 4.5)) {
        c.done = true;
        this.toDestroy.push(c);
        this.emit('catPoof', { cat: c.type, x: p.x, y: p.y, out });
      }
    }
  }

  updateWoken(dt) {
    for (const s of this.sleepers) {
      if (!s.awake || s.gone) continue;
      const t = this.time - s.wakeT;
      if (t < 0.55) continue; // замер от испуга: «!»
      if (!s.jumped) {
        s.jumped = true;
        s.vx = 5.5 + Math.random() * 1.5;
        s.vy = 10;
        this.emit('flee', { x: s.wx, y: s.wy, sleeper: s });
      }
      s.vy += GRAVITY * 1.2 * dt;
      s.wx += s.vx * dt;
      s.wy += s.vy * dt;
      s.wa = Math.sin(t * 9) * 0.25;
      if (s.wy < -3 || s.wx > this.width + 30) s.gone = true;
    }
  }

  sleepersLeft() {
    let n = 0;
    for (const s of this.sleepers) if (!s.awake) n++;
    return n;
  }

  calm() {
    for (let b = this.world.getBodyList(); b; b = b.getNext()) {
      if (!b.isDynamic() || !b.isAwake()) continue;
      const p = b.getPosition();
      if (p.y < -1 || p.x > this.width + 20 || p.x < -15) continue;
      const v = b.getLinearVelocity();
      if (Math.hypot(v.x, v.y) > 0.25 || Math.abs(b.getAngularVelocity()) > 0.6) return false;
    }
    return true;
  }

  setState(s) {
    this.state = s;
    this.stateT = 0;
  }

  updateState() {
    const s = this.state;
    // соня мог проснуться от запоздалого обвала, пока заряжен следующий кот
    if (s === 'aim' && this.sleepersLeft() === 0 && this.time - this.lastWakeT > 1) {
      this.finish(true);
      return;
    }
    if (s === 'fly') {
      const allDone = this.cats.every((c) => c.done);
      // все проснулись — не ждём, пока кот докатится
      const wokeAll = this.sleepersLeft() === 0 && this.time - this.lastWakeT > 2.2;
      if (allDone || wokeAll) this.setState('settle');
    } else if (s === 'settle') {
      const t = this.stateT;
      if (this.sleepersLeft() === 0) {
        if ((t > 0.8 && this.calm()) || t > 2.5) this.finish(true);
      } else if ((t > 0.6 && this.calm()) || t > 4.5) {
        if (this.loaded || this.queue.length) {
          for (const c of this.cats) if (!c.done) { c.done = true; this.toDestroy.push(c); }
          this.flushDestroy();
          this.cats = this.cats.filter((c) => !c.done || c.body);
          if (!this.loaded) this.loadNext();
          this.setState('aim');
        } else if (t > 1.2) this.finish(false);
      }
    }
  }

  finish(won) {
    for (const c of this.cats) if (!c.done) { c.done = true; this.toDestroy.push(c); }
    this.flushDestroy();
    if (won) {
      this.spare = this.queue.length + (this.loaded ? 1 : 0);
      this.score += this.spare * SCORE.spareCat;
      this.setState('win');
      this.emit('win', { spare: this.spare });
    } else {
      this.setState('lose');
      this.emit('lose');
    }
  }

  computeMaxScore() {
    let s = this.sleepers.length * SCORE.sleeper + this.fishes.length * SCORE.fish;
    for (const b of this.blocks) s += b.score;
    return s + (this.def.cats.length - 1) * SCORE.spareCat;
  }

  stars() {
    if (this.state !== 'win') return 0;
    const [t2, t3] = this.def.stars || [this.maxScore * 0.5, this.maxScore * 0.7];
    return this.score >= t3 ? 3 : this.score >= t2 ? 2 : 1;
  }

  // Все тела с текущей позой — для отрисовки.
  bounds() {
    let minX = Infinity, maxX = -Infinity, maxY = 0;
    const add = (x, y, r) => {
      minX = Math.min(minX, x - r);
      maxX = Math.max(maxX, x + r);
      maxY = Math.max(maxY, y + r);
    };
    for (const b of this.blocks) if (b.alive && b.body) { const p = b.body.getPosition(); add(p.x, p.y, Math.max(b.w, b.h) / 2); }
    for (const s of this.sleepers) if (!s.awake && s.body) { const p = s.body.getPosition(); add(p.x, p.y, s.hw + 0.8); }
    if (minX === Infinity) return { minX: this.width * 0.6, maxX: this.width * 0.8, maxY: 4 };
    return { minX, maxX, maxY };
  }
}
