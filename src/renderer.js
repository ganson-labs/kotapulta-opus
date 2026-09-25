// Отрисовка сцены. Два стиля: 'color' — цветной мир, 'sketch' — рисунок ручкой на листе.
// Переход между стилями — расширяющийся круг, внутри которого уже новый стиль.
import { LOOKS, drawBallCat, drawSleeper } from './draw/cats.js';
import { drawBlock, drawFish, drawLauncherBase, drawLauncherPlank } from './draw/objects.js';
import { Sketch, INK } from './draw/sketch.js';
import { CAT_TYPES, LAUNCH } from './config.js';
import { TAU, clamp, ease } from './util.js';

function local(ctx, x, y, a, s = 1) {
  ctx.save();
  ctx.translate(x, y);
  if (a) ctx.rotate(a);
  ctx.scale(s, -s);
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.off = document.createElement('canvas');
    this.offCtx = this.off.getContext('2d');
    this.sketch = new Sketch();
  }

  resize(W, H, dpr) {
    for (const c of [this.canvas, this.off]) {
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
    }
    this.canvas.style.width = W + 'px';
    this.canvas.style.height = H + 'px';
  }

  render(g) {
    const ctx = this.ctx;
    this.sketch.setTime(g.time);
    const w = g.wipe;
    if (!w) {
      this.drawScene(ctx, g, g.style);
      return;
    }
    // старый стиль целиком, новый — внутри растущего круга
    this.drawScene(ctx, g, w.from);
    this.drawScene(this.offCtx, g, w.to);
    const cam = g.cam;
    const u = ease.inOutCubic(clamp(w.t / w.dur, 0, 1));
    const R = Math.hypot(cam.W, cam.H) * 1.05 * u;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.save();
    ctx.beginPath();
    const d = cam.dpr;
    // рваный край круга
    const n = 64;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * TAU;
      const rr = R * (1 + Math.sin(a * 7 + g.time * 9) * 0.025 + Math.sin(a * 13 - g.time * 5) * 0.015);
      const px = (w.x + Math.cos(a) * rr) * d, py = (w.y + Math.sin(a) * rr) * d;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(this.off, 0, 0);
    ctx.restore();
    // чернильная кромка
    ctx.save();
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * TAU;
      const rr = R * (1 + Math.sin(a * 7 + g.time * 9) * 0.025 + Math.sin(a * 13 - g.time * 5) * 0.015);
      const px = (w.x + Math.cos(a) * rr) * d, py = (w.y + Math.sin(a) * rr) * d;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = w.to === 'sketch' ? 'rgba(38,38,46,0.85)' : 'rgba(255,236,170,0.9)';
    ctx.lineWidth = 5 * d * (1 - u * 0.6);
    ctx.shadowColor = w.to === 'sketch' ? 'rgba(0,0,0,0.3)' : 'rgba(255,220,120,0.9)';
    ctx.shadowBlur = 18 * d;
    ctx.stroke();
    ctx.restore();
  }

  drawScene(ctx, g, style) {
    const cam = g.cam;
    const sk = style === 'sketch';
    const t = g.time;
    cam.screen(ctx);
    if (sk) this.sketch.paper(ctx, cam, t);
    else g.bg.drawSky(ctx, cam, t);
    cam.apply(ctx);
    if (sk) this.sketch.ground(ctx, cam);
    else g.bg.drawGround(ctx, cam);
    const lv = g.level;
    if (lv) {
      if (!sk) this.shadows(ctx, g);
      this.trails(ctx, g, sk);
      this.launcherBase(ctx, g, sk);
      for (const b of lv.blocks) if (b.alive && b.body) this.block(ctx, b, sk, t);
      for (const f of lv.fishes) if (!f.collected && f.body) this.fish(ctx, f, sk, t);
      for (const s of lv.sleepers) this.sleeper(ctx, g, s, sk, t);
      this.launcherTop(ctx, g, sk, t);
      for (const c of lv.cats) if (!c.done && c.body) this.flyingCat(ctx, g, c, sk, t);
      this.aim(ctx, g, sk);
      g.fx.draw(ctx, sk);
      this.sleepMarks(ctx, g, sk, t);
    } else {
      g.fx.draw(ctx, sk);
    }
    cam.screen(ctx);
    if (!sk) g.bg.drawOverlay(ctx);
  }

  // ---------- тени ----------
  shadows(ctx, g) {
    const lv = g.level;
    ctx.fillStyle = 'rgba(30,20,40,1)';
    const sh = (x, y, w) => {
      const a = 0.22 * clamp(1 - y / 5, 0, 1);
      if (a <= 0.01) return;
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.ellipse(x, 0.02, w * (0.55 + y * 0.05), 0.12 + y * 0.01, 0, 0, TAU);
      ctx.fill();
    };
    for (const b of lv.blocks) {
      if (!b.alive || !b.body) continue;
      const p = b.body.getPosition();
      sh(p.x, Math.max(0, p.y - b.h / 2), b.w);
    }
    for (const c of lv.cats) if (c.body) { const p = c.body.getPosition(); sh(p.x, p.y - c.r, c.r * 2); }
    for (const s of lv.sleepers) if (s.body) { const p = s.body.getPosition(); sh(p.x, p.y - s.hh, s.hw * 2); }
    const lx = lv.launcherX;
    sh(lx, 0, 2.4);
    ctx.globalAlpha = 1;
  }

  // ---------- пунктир полёта (как на рисунке) ----------
  trails(ctx, g, sk) {
    const lv = g.level;
    const draw = (pts, alpha) => {
      if (pts.length < 4) return;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = 0; i + 3 < pts.length; i += 4) {
        ctx.moveTo(pts[i], pts[i + 1]);
        ctx.lineTo(pts[i + 2], pts[i + 3]);
      }
      if (sk) {
        ctx.strokeStyle = INK;
        ctx.globalAlpha = alpha;
        ctx.lineWidth = 0.07;
        ctx.stroke();
      } else {
        ctx.globalAlpha = alpha * 0.5;
        ctx.strokeStyle = '#3A2A40';
        ctx.lineWidth = 0.16;
        ctx.stroke();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 0.1;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    };
    draw(lv.prevTrail, 0.35);
    draw(lv.trail, 0.85);
  }

  // ---------- блоки, рыба ----------
  block(ctx, b, sk, t) {
    const p = b.body.getPosition(), a = b.body.getAngle();
    if (sk) return this.sketch.block(ctx, b, p.x, p.y, a);
    local(ctx, p.x, p.y, a);
    drawBlock(ctx, b, t);
    ctx.restore();
  }

  fish(ctx, f, sk, t) {
    const p = f.body.getPosition(), a = f.body.getAngle();
    const bob = f.body.isAwake() ? 0 : Math.sin(t * 2 + f.seed) * 0.03;
    if (sk) return this.sketch.fish(ctx, p.x, p.y + bob, a);
    local(ctx, p.x, p.y + bob, a);
    drawFish(ctx, t, f.seed);
    ctx.restore();
  }

  // ---------- соня ----------
  sleeper(ctx, g, s, sk, t) {
    const idx = g.level.sleepers.indexOf(s);
    const look = s.boss ? LOOKS.boss : [LOOKS.sleeper, LOOKS.sleeperB, LOOKS.sleeperC][idx % 3];
    const view = g.sleeperView(s);
    if (!s.awake && s.body) {
      const p = s.body.getPosition(), a = s.body.getAngle();
      const flip = s.flip ? -1 : 1;
      if (sk) return this.sketch.sleeper(ctx, p.x, p.y, a, s.s, t + s.id, s.boss, flip);
      local(ctx, p.x, p.y, a, s.s);
      ctx.scale(flip, 1);
      drawSleeper(ctx, look, { t: t + s.id, peek: view.peek, boss: s.boss });
      ctx.restore();
      return;
    }
    if (!s.awake || s.gone) return;
    // проснулся: испуганный пушистый шар, потом прыжок прочь
    const r = 0.62 * s.s;
    const age = g.level.time - s.wakeT;
    const pop = age < 0.25 ? ease.outBack(age / 0.25) : 1;
    if (sk) {
      this.sketch.ballCat(ctx, s.wx, s.wy + 0.2, s.wa, r * pop, 'fly');
      return;
    }
    local(ctx, s.wx, s.wy + 0.2 * s.s, s.wa, r * pop);
    drawBallCat(ctx, look, { t, expr: 'shock', spiky: true, tailUp: true, paws: 0.6, hat: null });
    ctx.restore();
  }

  sleepMarks(ctx, g, sk, t) {
    for (const s of g.level.sleepers) {
      let hx, hy;
      if (!s.awake && s.body) {
        const p = s.body.getPosition(), a = s.body.getAngle();
        const f = s.flip ? -1 : 1;
        const lx = 0.6 * f * s.s, ly = 0.2 * s.s;
        hx = p.x + lx * Math.cos(a) - ly * Math.sin(a);
        hy = p.y + lx * Math.sin(a) + ly * Math.cos(a);
        // Z z z
        for (let k = 0; k < 3; k++) {
          const ph = (t * 0.45 + k / 3 + s.id * 0.17) % 1;
          const x = hx + 0.2 * f + ph * 0.9 * f + Math.sin(ph * 6 + k) * 0.12;
          const y = hy + 0.35 + ph * 1.5;
          const size = (0.28 + ph * 0.3) * Math.sqrt(s.s);
          const alpha = Math.sin(ph * Math.PI);
          this.letter(ctx, x, y, k === 0 && ph > 0.66 ? 'z' : 'Z', size, alpha, sk, '#FFFFFF', '#4A5A8A');
        }
        const view = g.sleeperView(s);
        if (view.peek > 0.3) this.letter(ctx, hx + 0.1, hy + 1.0, '?', 0.5, view.peek, sk, '#FFE27A', '#6B3A1E');
      } else if (s.awake && !s.gone) {
        const age = g.level.time - s.wakeT;
        if (age < 1.2) {
          const pop = age < 0.2 ? ease.outBack(age / 0.2) : 1;
          this.letter(ctx, s.wx, s.wy + 1.45 * s.s, '!', 0.9 * pop, clamp((1.2 - age) * 3, 0, 1), sk, '#FF5A5A', '#5A0A0A');
        }
      }
    }
  }

  letter(ctx, x, y, ch, size, alpha, sk, fill, stroke) {
    if (alpha <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.scale(0.02, -0.02);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (sk) {
      ctx.font = `700 ${size * 62}px Caveat, cursive`;
      ctx.fillStyle = INK;
      ctx.fillText(ch, 0, 0);
    } else {
      ctx.font = `900 ${size * 50}px "Rubik Variable", sans-serif`;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = stroke;
      ctx.lineWidth = size * 9;
      ctx.strokeText(ch, 0, 0);
      ctx.fillStyle = fill;
      ctx.fillText(ch, 0, 0);
    }
    ctx.restore();
  }

  // ---------- катапульта, помощник, очередь ----------
  launcherBase(ctx, g, sk) {
    const lv = g.level;
    if (sk) return;
    local(ctx, lv.launcherX, LAUNCH.pivotH, 0);
    drawLauncherBase(ctx, LAUNCH.pivotH);
    ctx.restore();
  }

  launcherTop(ctx, g, sk, t) {
    const lv = g.level;
    const L = g.launcher;
    const px = lv.launcherX, py = LAUNCH.pivotH;
    const ang = L.angle;
    // очередь котов
    const q = g.queueView();
    for (const c of q) this.sittingCat(ctx, g, c, sk, t);
    // доска
    if (sk) this.sketch.launcher(ctx, px, py, ang);
    else {
      local(ctx, px, py, ang);
      drawLauncherPlank(ctx, LAUNCH.halfLen);
      ctx.restore();
    }
    // кот в чашке
    const lc = g.loadedView();
    if (lc) this.sittingCat(ctx, g, lc, sk, t);
    // помощник и верёвка
    const h = g.helperView();
    const ring = {
      x: px + Math.cos(ang) * (LAUNCH.halfLen - 0.18) - Math.sin(ang) * 0.21,
      y: py + Math.sin(ang) * (LAUNCH.halfLen - 0.18) + Math.cos(ang) * 0.21,
    };
    const mx = (ring.x + h.mouth.x) / 2, my = (ring.y + h.mouth.y) / 2 - h.sag;
    if (sk) this.sketch.rope(ctx, [ring.x, ring.y, mx, my, h.mouth.x, h.mouth.y]);
    else {
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(ring.x, ring.y);
      ctx.quadraticCurveTo(mx, my, h.mouth.x, h.mouth.y);
      ctx.strokeStyle = '#6E4E2A';
      ctx.lineWidth = 0.11;
      ctx.stroke();
      ctx.strokeStyle = '#D8B27A';
      ctx.lineWidth = 0.065;
      ctx.stroke();
      ctx.setLineDash([0.05, 0.08]);
      ctx.strokeStyle = '#A9814E';
      ctx.stroke();
      ctx.setLineDash([]);
    }
    this.helper(ctx, h, sk, t);
  }

  sittingCat(ctx, g, c, sk, t) {
    const r = CAT_TYPES[c.type].r;
    if (sk) {
      this.sketch.ballCat(ctx, c.x, c.y, c.a || 0, r, c.expr === 'aim' ? 'idle' : c.blink ? 'closed' : c.expr === 'happy' ? 'happy' : 'idle', 1, null, c.sx || 1, c.sy || 1);
      return;
    }
    ctx.save();
    ctx.translate(c.x, c.y - r * (1 - (c.sy || 1)));
    ctx.rotate(c.a || 0);
    ctx.scale((c.sx || 1) * r, -(c.sy || 1) * r);
    drawBallCat(ctx, LOOKS[c.type], { t: t + c.phase, expr: c.expr, blink: c.blink, lx: c.lx ?? 0.5, ly: c.ly ?? -0.2, paws: c.paws ?? 0, phase: c.phase });
    ctx.restore();
  }

  helper(ctx, h, sk, t) {
    const r = h.r;
    if (sk) {
      this.sketch.ballCat(ctx, h.x, h.y, h.a, r, h.expr === 'dizzy' ? 'dizzy' : h.expr === 'happy' ? 'happy' : 'idle', -1, 'helmet');
      return;
    }
    local(ctx, h.x, h.y, h.a, r);
    ctx.scale(-1, 1);
    drawBallCat(ctx, LOOKS.helper, { t, expr: h.expr, blink: h.blink, hat: 'helmet', lx: 0.6, ly: 0, phase: 1.3 });
    // капли пота
    if (h.sweat > 0) {
      ctx.globalAlpha = h.sweat;
      for (const [dx, dy, k] of [[-0.6, -0.9, 0], [-0.9, -0.5, 1.3]]) {
        const yy = dy + ((t * 1.3 + k) % 1) * 0.4;
        ctx.beginPath();
        ctx.moveTo(dx, yy - 0.14);
        ctx.quadraticCurveTo(dx + 0.09, yy, dx, yy + 0.05);
        ctx.quadraticCurveTo(dx - 0.09, yy, dx, yy - 0.14);
        ctx.fillStyle = '#8FD3FF';
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  // ---------- летящие коты ----------
  flyingCat(ctx, g, c, sk, t) {
    const b = c.body;
    const p = b.getPosition(), a = b.getAngle(), v = b.getLinearVelocity();
    const sp = Math.hypot(v.x, v.y);
    const view = g.catView(c);
    const k = c.hit ? 0 : clamp((sp - 8) / 40, 0, 0.22);
    const va = Math.atan2(v.y, v.x);
    if (!sk && c.dashT > 0) {
      // шлейф рывка
      for (let i = 1; i <= 4; i++) {
        ctx.globalAlpha = 0.18 * (1 - i / 5);
        ctx.beginPath();
        ctx.arc(p.x - (v.x / sp) * i * 0.45, p.y - (v.y / sp) * i * 0.45, c.r, 0, TAU);
        ctx.fillStyle = '#9A7CFF';
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(va);
    ctx.scale(1 + k, 1 - k);
    ctx.rotate(-va);
    if (sk) {
      this.sketch.ballCat(ctx, 0, 0, a, c.r, c.hit ? 'dizzy' : 'fly');
      ctx.restore();
      return;
    }
    ctx.rotate(a);
    ctx.scale(c.r, -c.r);
    drawBallCat(ctx, LOOKS[c.type], { t, expr: view.expr, paws: c.hit ? 0.2 : 1, lx: 0.6, ly: 0, phase: c.id });
    ctx.restore();
    if (c.hit && view.expr === 'dizzy') {
      // звёздочки над головой
      for (let i = 0; i < 3; i++) {
        const an = t * 5 + (i * TAU) / 3;
        const x = p.x + Math.cos(an) * c.r * 0.9, y = p.y + c.r * 1.15 + Math.sin(an) * c.r * 0.25;
        this.letter(ctx, x, y, '★', 0.32, 1, sk, '#FFE27A', '#8A5A00');
      }
    }
  }

  // ---------- прицел ----------
  aim(ctx, g, sk) {
    const A = g.aimInfo();
    if (!A) return;
    const pts = g.level.trajectory(A.type, A.angle, A.power, 2.2);
    const n = pts.length / 2;
    const maxN = Math.floor(n * 0.62);
    ctx.lineCap = 'round';
    for (let i = 3; i + 2 < maxN; i += 5) {
      const u = 1 - i / maxN;
      const x0 = pts[i * 2], y0 = pts[i * 2 + 1], x1 = pts[i * 2 + 4], y1 = pts[i * 2 + 5];
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      if (sk) {
        ctx.globalAlpha = u;
        ctx.strokeStyle = INK;
        ctx.lineWidth = 0.08;
        ctx.stroke();
      } else {
        ctx.globalAlpha = u * 0.6;
        ctx.strokeStyle = '#2A1A30';
        ctx.lineWidth = 0.2;
        ctx.stroke();
        ctx.globalAlpha = u;
        ctx.strokeStyle = A.power > 0.95 ? '#FFD23F' : '#FFFFFF';
        ctx.lineWidth = 0.12;
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }
}
