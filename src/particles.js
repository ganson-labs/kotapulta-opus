// Частицы в мировых координатах (метры, y вверх).
import { TAU, rand, pick, clamp } from './util.js';
import { star } from './draw/cats.js';

const MAX = 1400;

export class Particles {
  constructor() {
    this.list = [];
  }

  clear() {
    this.list.length = 0;
  }

  add(p) {
    if (this.list.length >= MAX) this.list.shift();
    p.max = p.life;
    p.a = p.a ?? 0;
    p.va = p.va ?? 0;
    p.vx = p.vx ?? 0;
    p.vy = p.vy ?? 0;
    p.g = p.g ?? 0;
    p.ph = p.ph ?? Math.random() * TAU;
    this.list.push(p);
    return p;
  }

  update(dt) {
    const L = this.list;
    let j = 0;
    for (let i = 0; i < L.length; i++) {
      const p = L[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vy += p.g * dt;
      if (p.drag) {
        const k = Math.max(0, 1 - p.drag * dt);
        p.vx *= k;
        p.vy *= k;
      }
      if (p.k === 'feather' || p.k === 'confetti') {
        p.vy = Math.max(p.vy, p.k === 'feather' ? -0.9 : -2.2);
        p.x += Math.sin(p.life * 3 + p.ph) * 0.9 * dt;
        p.a = Math.sin(p.life * 3 + p.ph) * 0.8;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.a += p.va * dt;
      if (p.bounce && p.y < p.bounce) {
        p.y = p.bounce;
        p.vy = Math.abs(p.vy) * 0.3;
        p.vx *= 0.6;
        p.va *= 0.5;
        if (Math.abs(p.vy) < 0.4) p.vy = 0;
      }
      L[j++] = p;
    }
    L.length = j;
  }

  draw(ctx, sketch) {
    for (const p of this.list) {
      const u = p.life / p.max; // 1 → 0
      switch (p.k) {
        case 'dust': {
          const r = p.r1 + (p.r0 - p.r1) * u;
          ctx.globalAlpha = (p.alpha ?? 0.55) * u;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, TAU);
          if (sketch) {
            ctx.strokeStyle = '#555';
            ctx.lineWidth = 0.03;
            ctx.stroke();
          } else {
            ctx.fillStyle = p.color;
            ctx.fill();
          }
          break;
        }
        case 'chip':
        case 'confetti': {
          ctx.globalAlpha = clamp(u * 3, 0, 1);
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.a);
          if (sketch) {
            ctx.strokeStyle = '#333';
            ctx.lineWidth = 0.03;
            ctx.strokeRect(-p.w / 2, -p.h / 2, p.w, p.h);
          } else {
            ctx.fillStyle = p.color;
            ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
            if (p.edge) {
              ctx.strokeStyle = p.edge;
              ctx.lineWidth = 0.025;
              ctx.strokeRect(-p.w / 2, -p.h / 2, p.w, p.h);
            }
          }
          ctx.restore();
          break;
        }
        case 'shard': {
          ctx.globalAlpha = clamp(u * 3, 0, 1);
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.a);
          ctx.beginPath();
          ctx.moveTo(-p.w / 2, -p.h / 2);
          ctx.lineTo(p.w / 2, -p.h / 3);
          ctx.lineTo(0, p.h / 2);
          ctx.closePath();
          if (sketch) {
            ctx.strokeStyle = '#333';
            ctx.lineWidth = 0.03;
            ctx.stroke();
          } else {
            ctx.fillStyle = p.color;
            ctx.fill();
            ctx.strokeStyle = p.edge || 'rgba(0,0,0,0.3)';
            ctx.lineWidth = 0.02;
            ctx.stroke();
          }
          ctx.restore();
          break;
        }
        case 'feather': {
          ctx.globalAlpha = clamp(u * 2, 0, 1);
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.a);
          ctx.beginPath();
          ctx.ellipse(0, 0, 0.16, 0.06, 0, 0, TAU);
          if (!sketch) {
            ctx.fillStyle = p.color;
            ctx.fill();
          }
          ctx.strokeStyle = sketch ? '#333' : 'rgba(120,100,140,0.5)';
          ctx.lineWidth = 0.02;
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(-0.2, 0);
          ctx.lineTo(0.14, 0);
          ctx.stroke();
          ctx.restore();
          break;
        }
        case 'spark': {
          const s = p.size * (u > 0.7 ? (1 - u) / 0.3 : u / 0.7);
          ctx.globalAlpha = 1;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.a);
          star(ctx, 0, 0, s, s * 0.35, 4);
          if (sketch) {
            ctx.strokeStyle = '#333';
            ctx.lineWidth = 0.025;
            ctx.stroke();
          } else {
            ctx.fillStyle = p.color;
            ctx.fill();
          }
          ctx.restore();
          break;
        }
        case 'ring': {
          const r = p.r1 + (p.r0 - p.r1) * u;
          ctx.globalAlpha = u;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, TAU);
          ctx.strokeStyle = sketch ? '#333' : p.color;
          ctx.lineWidth = p.lw * u + 0.02;
          ctx.stroke();
          break;
        }
        case 'line': {
          ctx.globalAlpha = u * 0.8;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.dx * p.len, p.y - p.dy * p.len);
          ctx.strokeStyle = sketch ? '#333' : p.color;
          ctx.lineWidth = p.lw;
          ctx.lineCap = 'round';
          ctx.stroke();
          break;
        }
        case 'text': {
          const age = p.max - p.life;
          const pop = age < 0.18 ? 0.4 + (age / 0.18) * 0.8 : age < 0.3 ? 1.2 - ((age - 0.18) / 0.12) * 0.2 : 1;
          ctx.globalAlpha = clamp(u * 2.5, 0, 1);
          ctx.save();
          ctx.translate(p.x, p.y);
          // шрифт крупнее и обратный масштаб: крошечные кегли браузеры рисуют плохо
          ctx.scale(pop / 50, -pop / 50);
          ctx.font = sketch ? `700 ${p.size * 62}px Caveat, cursive` : `900 ${p.size * 50}px "Rubik Variable", sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          if (sketch) {
            ctx.fillStyle = '#2A2A2A';
            ctx.fillText(p.text, 0, 0);
          } else {
            ctx.lineJoin = 'round';
            ctx.strokeStyle = p.stroke || '#3A1D0B';
            ctx.lineWidth = p.size * 11;
            ctx.strokeText(p.text, 0, 0);
            ctx.fillStyle = p.color;
            ctx.fillText(p.text, 0, 0);
          }
          ctx.restore();
          break;
        }
        case 'heart': {
          ctx.globalAlpha = clamp(u * 2, 0, 1);
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.scale(p.size, -p.size);
          ctx.beginPath();
          ctx.moveTo(0, 0.35);
          ctx.bezierCurveTo(-0.6, -0.1, -0.35, -0.6, 0, -0.25);
          ctx.bezierCurveTo(0.35, -0.6, 0.6, -0.1, 0, 0.35);
          if (sketch) {
            ctx.strokeStyle = '#333';
            ctx.lineWidth = 0.08;
            ctx.stroke();
          } else {
            ctx.fillStyle = '#FF6B8A';
            ctx.fill();
          }
          ctx.restore();
          break;
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  // ---------- готовые эффекты ----------

  dust(x, y, n, color, spread = 1, size = 0.3) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU);
      const s = rand(0.5, 2.2) * spread;
      this.add({
        k: 'dust', x: x + rand(-0.2, 0.2) * spread, y: y + rand(-0.1, 0.2) * spread,
        vx: Math.cos(a) * s, vy: Math.abs(Math.sin(a)) * s * 0.7 + 0.2, drag: 2.5,
        r0: size * rand(0.5, 1), r1: size * rand(1.6, 2.6), life: rand(0.5, 1.1), color,
      });
    }
  }

  sparks(x, y, n, colors = ['#FFE27A', '#FFFFFF', '#FFC23D'], speed = 4) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU);
      const s = rand(0.4, 1) * speed;
      this.add({
        k: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, drag: 3, g: -2,
        size: rand(0.1, 0.22), life: rand(0.4, 0.9), color: pick(colors), va: rand(-6, 6),
      });
    }
  }

  text(x, y, text, color = '#FFE27A', size = 0.6, life = 1.3, stroke) {
    this.add({ k: 'text', x, y, vy: 1.1, drag: 0.8, text, color, size, life, stroke });
  }

  ring(x, y, r0, r1, color = '#FFFFFF', lw = 0.25, life = 0.5) {
    this.add({ k: 'ring', x, y, r0, r1, color, lw, life });
  }

  breakBlock(e, dust) {
    const b = e.block;
    const x = e.x, y = e.y;
    const area = (b.w || 1) * (b.h || 1);
    const n = Math.round(clamp(area * 10, 8, 26));
    const mat = b.material;
    const colors = {
      cardboard: ['#D9A066', '#C48648', '#E8BD85', '#B07438'],
      wood: ['#C98A4E', '#A86D35', '#E0A569'],
      ceramic: ['#D96C40', '#B8522B', '#E5835A'],
      brick: ['#B9563C', '#9E4430', '#E6D2B8'],
      pillow: ['#FFFFFF', '#F5F0FF'],
    }[mat] || ['#AAAAAA'];
    const rx = () => x + rand(-b.w / 2, b.w / 2) * 0.8;
    const ry = () => y + rand(-b.h / 2, b.h / 2) * 0.8;
    if (mat === 'pillow') {
      for (let i = 0; i < 40; i++) {
        this.add({
          k: 'feather', x: rx(), y: ry(), vx: rand(-3.5, 3.5), vy: rand(0.5, 5), g: -3, drag: 1.2,
          life: rand(2.2, 4), color: pick(['#FFFFFF', '#FFF4FA', '#F1ECFF']), ph: rand(0, TAU),
        });
      }
      this.dust(x, y, 6, '#FFFFFF', 1, 0.35);
      return;
    }
    for (let i = 0; i < n; i++) {
      const wood = mat === 'wood';
      const w = wood ? rand(0.25, 0.6) : mat === 'cardboard' ? rand(0.18, 0.42) : rand(0.12, 0.3);
      const h = wood ? rand(0.05, 0.1) : mat === 'cardboard' ? rand(0.12, 0.3) : rand(0.1, 0.25);
      this.add({
        k: mat === 'ceramic' ? 'shard' : 'chip', x: rx(), y: ry(),
        vx: rand(-4, 4) + (x - e.hx) * 1.5, vy: rand(1, 6), g: -14, va: rand(-12, 12),
        w, h, life: rand(0.9, 1.8), color: pick(colors), bounce: 0.06,
        edge: mat === 'cardboard' ? 'rgba(110,65,25,0.6)' : null,
      });
    }
    if (mat === 'ceramic') {
      // земля и лепестки из горшка
      for (let i = 0; i < 10; i++) {
        this.add({
          k: 'chip', x: x + rand(-0.2, 0.2), y: y + b.h * 0.4, vx: rand(-2.5, 2.5), vy: rand(1, 4), g: -12,
          w: 0.08, h: 0.08, va: rand(-8, 8), life: rand(0.8, 1.4), color: '#5A3A22', bounce: 0.04,
        });
      }
      for (let i = 0; i < 6; i++) {
        this.add({
          k: 'feather', x: x, y: y + b.h * 0.7, vx: rand(-1.5, 1.5), vy: rand(1, 3), g: -3,
          life: rand(1.5, 2.5), color: pick(['#FF6B8A', '#FFC93C', '#5DB04F']),
        });
      }
    }
    this.dust(x, y, Math.round(n / 2), dust, Math.sqrt(area), 0.3);
  }

  poof(x, y, dust) {
    this.dust(x, y, 12, dust, 1.1, 0.32);
    for (let i = 0; i < 3; i++) this.add({ k: 'heart', x: x + rand(-0.4, 0.4), y: y + 0.3, vy: rand(1, 1.8), size: rand(0.25, 0.35), life: 1.1 });
  }

  confetti(x, y, n = 80) {
    const cols = ['#FF6B8A', '#FFD23F', '#5AC8FA', '#7ED957', '#C77DFF', '#FF9F43'];
    for (let i = 0; i < n; i++) {
      this.add({
        k: 'confetti', x: x + rand(-4, 4), y: y + rand(-1, 1), vx: rand(-5, 5), vy: rand(4, 11), g: -9, drag: 0.6,
        w: rand(0.12, 0.2), h: rand(0.06, 0.1), life: rand(2.5, 4), color: pick(cols), ph: rand(0, TAU),
      });
    }
  }
}
