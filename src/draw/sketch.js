// «Режим салфетки»: та же сцена, нарисованная ручкой на тетрадном листе.
// Фигуры строит rough.js; дрожание линий — три варианта, сменяющиеся ~7 раз в секунду.
import rough from 'roughjs';
import { TAU, seeded } from '../util.js';
import { CAT_TYPES, LAUNCH } from '../config.js';

export const INK = '#26262E';
const S = 40; // единиц rough на метр

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

export class Sketch {
  constructor() {
    this.gen = rough.generator();
    this.cache = new Map();
    this.rcs = new WeakMap();
    this.frame = 0;
  }

  setTime(t) {
    this.frame = Math.floor(t * 7) % 3;
  }

  rc(ctx) {
    let rc = this.rcs.get(ctx.canvas);
    if (!rc) {
      rc = rough.canvas(ctx.canvas);
      this.rcs.set(ctx.canvas, rc);
    }
    return rc;
  }

  opts(seed, extra) {
    return { roughness: 1.25, bowing: 1.3, stroke: INK, strokeWidth: 2.1, seed: (seed % 2147483646) + 1, ...extra };
  }

  get(key, build) {
    const k = key + '|' + this.frame;
    let d = this.cache.get(k);
    if (!d) {
      if (this.cache.size > 4000) this.cache.clear();
      d = build(hash(key) + this.frame * 7919, this.gen);
      this.cache.set(k, d);
    }
    return d;
  }

  // Рисует набор фигур в локальных координатах тела (метры, y вниз).
  put(ctx, x, y, a, key, build, flip = 1) {
    const list = this.get(key, build);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.scale(flip / S, -1 / S);
    const rc = this.rc(ctx);
    for (const d of list) rc.draw(d);
    ctx.restore();
  }

  // ---------- объекты ----------

  block(ctx, b, x, y, a) {
    const w = b.w * S, h = b.h * S;
    const key = `b:${b.type}:${b.w}:${b.h}:${b.r}:${b.seed}`;
    this.put(ctx, x, y, a, key, (seed, g) => {
      const o = this.opts(seed);
      const L = [];
      if (b.type === 'yarn') {
        const R = b.r * S;
        L.push(g.circle(0, 0, R * 2, o));
        L.push(g.arc(0, 0, R * 1.3, R * 2, -1, 1.6, false, this.opts(seed + 1, { strokeWidth: 1.4 })));
        L.push(g.arc(0, 0, R * 2, R * 0.9, 0.3, 2.9, false, this.opts(seed + 2, { strokeWidth: 1.4 })));
      } else if (b.type === 'pot') {
        const bw = w * 0.34;
        L.push(g.polygon([[-bw, h / 2], [bw, h / 2], [w / 2 * 0.92, -h / 2 + 8], [-w / 2 * 0.92, -h / 2 + 8]], o));
        L.push(g.rectangle(-w / 2, -h / 2, w, 9, o));
        L.push(g.line(0, -h / 2, 0, -h / 2 - 20, o));
        L.push(g.circle(0, -h / 2 - 24, 9, this.opts(seed + 3)));
        L.push(g.ellipse(-7, -h / 2 - 9, 12, 5, this.opts(seed + 4, { strokeWidth: 1.5 })));
      } else if (b.type === 'pillow') {
        L.push(g.path(`M ${-w / 2} ${-h / 2} Q 0 ${-h / 2 - 8} ${w / 2} ${-h / 2} Q ${w / 2 + 6} 0 ${w / 2} ${h / 2} Q 0 ${h / 2 + 4} ${-w / 2} ${h / 2} Q ${-w / 2 - 6} 0 ${-w / 2} ${-h / 2} Z`, o));
      } else {
        L.push(g.rectangle(-w / 2, -h / 2, w, h, o));
        if (b.type === 'crate') L.push(g.line(-w / 2 + 3, h / 2 - 3, w / 2 - 3, -h / 2 + 3, this.opts(seed + 5, { strokeWidth: 1.6 })));
        if (b.type === 'brick') {
          L.push(g.line(-w / 2, 0, w / 2, 0, this.opts(seed + 6, { strokeWidth: 1.4 })));
          L.push(g.line(0, -h / 2, 0, 0, this.opts(seed + 7, { strokeWidth: 1.4 })));
          L.push(g.line(-w / 4, 0, -w / 4, h / 2, this.opts(seed + 8, { strokeWidth: 1.4 })));
          L.push(g.line(w / 4, 0, w / 4, h / 2, this.opts(seed + 9, { strokeWidth: 1.4 })));
        }
        if (b.type === 'box' && b.v % 2 === 1) L.push(g.line(-w / 2 + 4, -h / 2 + 9, w / 2 - 4, -h / 2 + 8, this.opts(seed + 10, { strokeWidth: 1.3, roughness: 1.8 })));
      }
      return L;
    });
    const dmg = b.hp === Infinity ? 0 : 1 - Math.max(0, b.hp) / b.maxHp;
    if (dmg > 0.3) {
      // трещина — пара чёрточек
      this.put(ctx, x, y, a, `crk:${b.seed}:${dmg > 0.6 ? 2 : 1}`, (seed, g) => {
        const r = seeded(seed);
        const L = [];
        const n = dmg > 0.6 ? 2 : 1;
        for (let i = 0; i < n; i++) {
          const x0 = (r() - 0.5) * w * 0.8;
          L.push(g.linearPath([[x0, -h / 2], [x0 + (r() - 0.5) * 10, -h / 2 + h * 0.25], [x0 + (r() - 0.5) * 12, -h / 2 + h * 0.45]], this.opts(seed + i, { strokeWidth: 1.4 })));
        }
        return L;
      });
    }
  }

  fish(ctx, x, y, a) {
    this.put(ctx, x, y, a, 'fish', (seed, g) => {
      const o = this.opts(seed, { strokeWidth: 1.8, roughness: 1 });
      return [
        g.ellipse(2, 0, 22, 11, o),
        g.polygon([[-9, 0], [-15, -6], [-15, 6]], o),
        g.circle(7, -1, 3, this.opts(seed + 1, { fill: INK, fillStyle: 'solid', strokeWidth: 1 })),
      ];
    });
  }

  // Кот-мячик. expr: idle | fly | dizzy | closed | happy
  ballCat(ctx, x, y, a, r, expr, flip = 1, hat = null, scaleX = 1, scaleY = 1) {
    const R = r * S;
    const key = `cat:${r}:${expr}:${hat}`;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.scale(scaleX, scaleY);
    this.put(ctx, 0, 0, 0, key, (seed, g) => {
      const o = this.opts(seed, { strokeWidth: 2 });
      const thin = (k) => this.opts(seed + k, { strokeWidth: 1.4, roughness: 0.9 });
      const L = [];
      L.push(g.circle(0, 0, R * 2, o));
      for (const ea of [-2.08, -1.08]) {
        const b1 = [Math.cos(ea - 0.36) * R * 0.95, Math.sin(ea - 0.36) * R * 0.95];
        const tp = [Math.cos(ea) * R * 1.5, Math.sin(ea) * R * 1.5];
        const b2 = [Math.cos(ea + 0.36) * R * 0.95, Math.sin(ea + 0.36) * R * 0.95];
        L.push(g.linearPath([b1, tp, b2], this.opts(seed + 11, { strokeWidth: 2 })));
      }
      // хвост
      L.push(g.curve([[-R * 0.75, R * 0.5], [-R * 1.35, R * 0.3], [-R * 1.35, -R * 0.4], [-R * 1.1, -R * 0.85]], this.opts(seed + 12, { strokeWidth: 2 })));
      // глаза
      const E = [[R * 0.1, -R * 0.14], [R * 0.6, -R * 0.12]];
      for (const [ex, ey] of E) {
        if (expr === 'dizzy') {
          L.push(g.line(ex - R * 0.12, ey - R * 0.12, ex + R * 0.12, ey + R * 0.12, thin(20)));
          L.push(g.line(ex + R * 0.12, ey - R * 0.12, ex - R * 0.12, ey + R * 0.12, thin(21)));
        } else if (expr === 'closed' || expr === 'happy') {
          const up = expr === 'happy';
          L.push(g.arc(ex, ey + (up ? R * 0.08 : -R * 0.05), R * 0.3, R * 0.22, up ? Math.PI * 1.1 : Math.PI * 0.1, up ? Math.PI * 1.9 : Math.PI * 0.9, false, thin(22)));
        } else if (expr === 'fly') {
          L.push(g.circle(ex, ey, R * 0.36, thin(23)));
          L.push(g.circle(ex + R * 0.03, ey, R * 0.1, this.opts(seed + 24, { fill: INK, fillStyle: 'solid', strokeWidth: 1 })));
        } else {
          L.push(g.circle(ex, ey, R * 0.16, this.opts(seed + 25, { fill: INK, fillStyle: 'solid', strokeWidth: 1 })));
        }
      }
      // нос и рот
      L.push(g.polygon([[R * 0.3, R * 0.12], [R * 0.46, R * 0.12], [R * 0.38, R * 0.21]], thin(30)));
      if (expr === 'fly' || expr === 'dizzy') L.push(g.ellipse(R * 0.38, R * 0.42, R * 0.24, R * 0.3, thin(31)));
      else L.push(g.path(`M ${R * 0.24} ${R * 0.26} Q ${R * 0.31} ${R * 0.36} ${R * 0.38} ${R * 0.24} Q ${R * 0.45} ${R * 0.36} ${R * 0.52} ${R * 0.26}`, thin(32)));
      // усы
      for (const [dy, ey] of [[0.24, 0.1], [0.32, 0.36]]) {
        L.push(g.line(R * 0.1, R * dy, -R * 0.45, R * ey, thin(40)));
        L.push(g.line(R * 0.66, R * dy, R * 1.22, R * ey, thin(41)));
      }
      if (hat === 'helmet') {
        L.push(g.path(`M ${-R * 0.75} ${-R * 0.55} C ${-R * 0.7} ${-R * 1.25} ${R * 0.8} ${-R * 1.25} ${R * 0.85} ${-R * 0.55} Z`, this.opts(seed + 50, { fill: INK, fillStyle: 'hachure', hachureGap: 5, fillWeight: 1, strokeWidth: 2 })));
        L.push(g.line(-R * 0.95, -R * 0.52, R * 1.0, -R * 0.52, this.opts(seed + 51, { strokeWidth: 2 })));
      }
      return L;
    }, flip);
    ctx.restore();
  }

  // Спящий «батон» — как на рисунке.
  sleeper(ctx, x, y, a, s, t, boss, flip = 1) {
    const br = 1 + Math.sin(t * 1.7) * 0.035;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.scale(s * flip, s * br);
    this.put(ctx, 0, 0, 0, `sl:${boss}`, (seed, g) => {
      const o = this.opts(seed, { strokeWidth: 2.2 });
      const thin = (k) => this.opts(seed + k, { strokeWidth: 1.5, roughness: 0.9 });
      const L = [];
      L.push(g.ellipse(-0.15 * S, 0.05 * S, 1.65 * S, 0.8 * S, o));
      L.push(g.curve([[-0.95 * S, 0.1 * S], [-1.25 * S, -0.15 * S], [-1.1 * S, -0.35 * S]], thin(1)));
      const hx = 0.6 * S, hy = -0.12 * S, hr = 0.42 * S;
      L.push(g.circle(hx, hy, hr * 2, o));
      L.push(g.linearPath([[hx - hr * 0.8, hy - hr * 0.55], [hx - hr * 0.65, hy - hr * 1.35], [hx - hr * 0.2, hy - hr * 0.9]], thin(2)));
      L.push(g.linearPath([[hx + hr * 0.25, hy - hr * 0.9], [hx + hr * 0.7, hy - hr * 1.35], [hx + hr * 0.85, hy - hr * 0.55]], thin(3)));
      L.push(g.line(hx - hr * 0.55, hy - hr * 0.05, hx - hr * 0.15, hy - hr * 0.05, thin(4)));
      L.push(g.line(hx + hr * 0.15, hy - hr * 0.05, hx + hr * 0.55, hy - hr * 0.05, thin(5)));
      L.push(g.path(`M ${hx - hr * 0.2} ${hy + hr * 0.35} Q ${hx} ${hy + hr * 0.5} ${hx + hr * 0.2} ${hy + hr * 0.35}`, thin(6)));
      L.push(g.line(hx - hr * 0.3, hy + hr * 0.25, hx - hr * 1.1, hy + hr * 0.15, thin(7)));
      L.push(g.line(hx + hr * 0.3, hy + hr * 0.25, hx + hr * 1.1, hy + hr * 0.15, thin(8)));
      if (boss) L.push(g.polygon([[hx - hr * 0.7, hy - hr * 0.8], [hx + hr * 0.6, hy - hr * 1.0], [hx + hr * 1.4, hy - hr * 2.0]], this.opts(seed + 9, { fill: INK, fillStyle: 'hachure', hachureGap: 5 })));
      return L;
    });
    ctx.restore();
  }

  launcher(ctx, px, py, angle) {
    this.put(ctx, px, 0, 0, 'lb', (seed, g) => [
      g.polygon([[0, -LAUNCH.pivotH * S], [0.95 * S, 0], [-0.95 * S, 0]], this.opts(seed, { strokeWidth: 2.2 })),
    ]);
    const hl = LAUNCH.halfLen * S;
    this.put(ctx, px, py, angle, 'lp', (seed, g) => [
      g.rectangle(-hl, -5, hl * 2, 10, this.opts(seed, { strokeWidth: 2 })),
      g.arc(-hl + 18, -5, 44, 28, 0, Math.PI, false, this.opts(seed + 1, { strokeWidth: 1.8 })),
    ]);
  }

  rope(ctx, pts) {
    this.put(ctx, 0, 0, 0, `rope:${pts.map((v) => v.toFixed(1)).join(',')}`, (seed, g) => [
      g.curve(pts.reduce((acc, v, i) => (i % 2 ? acc : [...acc, [v * S, -pts[i + 1] * S]]), []), this.opts(seed, { strokeWidth: 1.5, roughness: 0.8 })),
    ]);
  }

  // ---------- лист бумаги ----------

  paper(ctx, cam, t) {
    const { W, H } = cam;
    ctx.fillStyle = '#FAF7EE';
    ctx.fillRect(0, 0, W, H);
    if (!this.grain) {
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const g = c.getContext('2d');
      const r = seeded(3);
      for (let i = 0; i < 2600; i++) {
        g.fillStyle = `rgba(90,80,60,${r() * 0.07})`;
        g.fillRect(r() * 256, r() * 256, 1 + r() * 1.5, 1 + r() * 1.5);
      }
      this.grain = ctx.createPattern(c, 'repeat');
    }
    ctx.fillStyle = this.grain;
    ctx.fillRect(0, 0, W, H);
    // вертикальные линейки, как на тетрадном листе с рисунка — привязаны к миру
    const step = 1.45;
    const x0 = Math.floor((cam.x - W / 2 / cam.z) / step) * step;
    ctx.strokeStyle = 'rgba(70,70,82,0.32)';
    ctx.lineWidth = 1.2;
    const top = 26, bot = H - 30;
    ctx.beginPath();
    for (let x = x0; x < cam.x + W / 2 / cam.z + step; x += step) {
      const [sx] = cam.toScreen(x, 0);
      ctx.moveTo(sx, top);
      ctx.lineTo(sx, bot);
    }
    ctx.stroke();
    // рамка листа
    ctx.strokeStyle = 'rgba(70,70,82,0.45)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(14, 18, W - 28, H - 42, 16) : ctx.rect(14, 18, W - 28, H - 42);
    ctx.stroke();
    // пружина блокнота снизу
    ctx.fillStyle = '#3A3A44';
    for (let x = 22; x < W - 10; x += 26) {
      ctx.beginPath();
      ctx.ellipse(x, H - 8, 5, 9, 0.35, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#9A9AA6';
      ctx.fillRect(x - 1, H - 16, 2, 5);
      ctx.fillStyle = '#3A3A44';
    }
    // каракули: солнышко в углу
    const sx = W * 0.86, sy = H * 0.14, R = Math.min(W, H) * 0.045;
    ctx.save();
    ctx.translate(sx, sy);
    const list = this.get('sun', (seed, g) => {
      const L = [g.circle(0, 0, R * 2, this.opts(seed, { strokeWidth: 1.8 }))];
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * TAU;
        L.push(g.line(Math.cos(a) * R * 1.35, Math.sin(a) * R * 1.35, Math.cos(a) * R * 1.85, Math.sin(a) * R * 1.85, this.opts(seed + i + 1, { strokeWidth: 1.6 })));
      }
      return L;
    });
    const rc = this.rc(ctx);
    ctx.rotate(t * 0.1);
    for (const d of list) rc.draw(d);
    ctx.restore();
  }

  ground(ctx, cam) {
    const seg = 8;
    const x0 = Math.floor((cam.x - cam.W / 2 / cam.z) / seg) * seg;
    for (let x = x0; x < cam.x + cam.W / 2 / cam.z + seg; x += seg) {
      this.put(ctx, x, 0, 0, `g:${x}`, (seed, g) => [
        g.line(0, 0, seg * S + 6, (seeded(seed)() - 0.5) * 3, this.opts(seed, { strokeWidth: 2.4, roughness: 1.5 })),
      ]);
    }
  }
}

export const SKETCH_SCALE = S;
export { CAT_TYPES };
