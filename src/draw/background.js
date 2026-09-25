// Фон: небо, солнце/луна, облака и три слоя параллакса (город, холмы с деревьями, забор),
// земля с травой. Слои заранее рисуются в полосы-холсты и прокручиваются.
import { TAU, seeded } from '../util.js';

export const THEMES = {
  day: {
    sky: [[0, '#4FA9EA'], [0.55, '#9ED6F7'], [1, '#E6F6FF']],
    sun: { x: 0.8, y: 0.17, r: 0.05, color: '#FFF8DC', glow: 'rgba(255,238,160,0.55)' },
    cloud: '#FFFFFF', cloudShade: '#D3E6F5', cloudAlpha: 0.95,
    far: '#A7C6E0', farLight: '#C3DBEE', windows: 'rgba(255,255,255,0.35)', lit: 0,
    hills: '#8DC873', hillsDark: '#74B35D', trees: '#5FA24A', treesDark: '#468536', trunk: '#7A5638',
    fence: '#E0AF78', fenceDark: '#A9784A',
    grass: '#76C451', grassDark: '#4F9E36', grassLight: '#A7E27A', soil: '#9C6D46', soilDark: '#6A462C',
    haze: [230, 245, 255], tint: null, dust: '#F3E6D0',
  },
  sunset: {
    sky: [[0, '#393A8A'], [0.35, '#A9588F'], [0.7, '#FF9468'], [1, '#FFD592']],
    sun: { x: 0.74, y: 0.7, r: 0.06, color: '#FFE9B8', glow: 'rgba(255,160,90,0.6)' },
    cloud: '#FFC0A6', cloudShade: '#D1809A', cloudAlpha: 0.9,
    far: '#8A5A8F', farLight: '#A06E9C', windows: 'rgba(255,214,140,0.8)', lit: 0.35,
    hills: '#7E5E86', hillsDark: '#6A4C74', trees: '#5B4270', treesDark: '#4A3460', trunk: '#3F2C4E',
    fence: '#C98B63', fenceDark: '#8E5A45',
    grass: '#79A84A', grassDark: '#557F34', grassLight: '#A4C86A', soil: '#8A5A42', soilDark: '#5C3A2C',
    haze: [255, 190, 150], tint: 'rgba(255,130,70,0.07)', dust: '#F5D8C0',
  },
  night: {
    sky: [[0, '#060A22'], [0.5, '#15225A'], [1, '#34457F']],
    moon: { x: 0.2, y: 0.18, r: 0.045 },
    stars: true,
    cloud: '#3B4A80', cloudShade: '#27335F', cloudAlpha: 0.7,
    far: '#1D2552', farLight: '#28316A', windows: 'rgba(255,214,120,0.95)', lit: 0.45,
    hills: '#1E2F4E', hillsDark: '#172641', trees: '#172A3E', treesDark: '#101F30', trunk: '#101820',
    fence: '#5A4A5E', fenceDark: '#3C3042',
    grass: '#3F6E47', grassDark: '#2B5134', grassLight: '#5D8F5E', soil: '#4A3A3A', soilDark: '#2E2426',
    haze: [70, 90, 150], tint: 'rgba(25,35,100,0.25)', dust: '#B8C0DC',
  },
};

const STRIP_W = 2400;

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

function cityStrip(th, h) {
  const c = makeCanvas(STRIP_W, h);
  const ctx = c.getContext('2d');
  const rnd = seeded(42);
  let x = -20;
  while (x < STRIP_W) {
    const bw = 50 + rnd() * 110;
    const bh = h * (0.28 + rnd() * 0.62);
    const top = h - bh;
    ctx.fillStyle = th.far;
    ctx.fillRect(x, top, bw, bh);
    ctx.fillStyle = th.farLight;
    ctx.fillRect(x, top, bw, 4);
    const kind = rnd();
    if (kind < 0.2) {
      ctx.fillStyle = th.far;
      ctx.fillRect(x + bw * 0.6, top - 26, 3, 26);
      ctx.beginPath();
      ctx.arc(x + bw * 0.6 + 1.5, top - 26, 3, 0, TAU);
      ctx.fillStyle = th.lit ? '#FF6B6B' : th.far;
      ctx.fill();
    } else if (kind < 0.35) {
      ctx.fillStyle = th.far;
      ctx.fillRect(x + bw * 0.2, top - 18, bw * 0.25, 18);
      ctx.beginPath();
      ctx.moveTo(x + bw * 0.18, top - 18);
      ctx.lineTo(x + bw * 0.325, top - 30);
      ctx.lineTo(x + bw * 0.47, top - 18);
      ctx.fill();
    } else if (kind < 0.5) {
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x + bw / 2, top - bw * 0.35);
      ctx.lineTo(x + bw, top);
      ctx.fillStyle = th.far;
      ctx.fill();
    }
    // окна
    const cols = Math.floor((bw - 12) / 16);
    const rows = Math.floor((bh - 16) / 20);
    for (let i = 0; i < cols; i++)
      for (let j = 0; j < rows; j++) {
        const lit = rnd() < th.lit;
        if (!lit && !th.windows) continue;
        ctx.fillStyle = lit ? th.windows : 'rgba(255,255,255,0.10)';
        if (!lit && th.lit > 0) ctx.fillStyle = 'rgba(0,0,0,0.12)';
        ctx.fillRect(x + 8 + i * 16, top + 12 + j * 20, 8, 11);
      }
    x += bw + rnd() * 14;
  }
  // дымка у земли
  const [r, g, b] = th.haze;
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, `rgba(${r},${g},${b},0)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0.55)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, STRIP_W, h);
  return c;
}

function hillsStrip(th, h) {
  const c = makeCanvas(STRIP_W, h);
  const ctx = c.getContext('2d');
  const rnd = seeded(7);
  const wave = (x, a) => Math.sin((x / STRIP_W) * TAU * 2 + a) * 0.5 + Math.sin((x / STRIP_W) * TAU * 5 + a * 2) * 0.25;
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let x = 0; x <= STRIP_W; x += 10) ctx.lineTo(x, h * (0.55 + wave(x, 1) * 0.18));
  ctx.lineTo(STRIP_W, h);
  ctx.fillStyle = th.hillsDark;
  ctx.fill();
  // деревья
  for (let i = 0; i < 26; i++) {
    const x = rnd() * STRIP_W;
    const base = h * (0.62 + wave(x, 1) * 0.18);
    const s = 0.6 + rnd() * 0.7;
    const draw = (ox) => {
      ctx.fillStyle = th.trunk;
      ctx.fillRect(ox + x - 4 * s, base - 30 * s, 8 * s, 34 * s);
      const blobs = [[0, -62, 34], [-24, -46, 26], [24, -46, 26], [0, -86, 24]];
      ctx.fillStyle = th.treesDark;
      for (const [bx, by, br] of blobs) {
        ctx.beginPath();
        ctx.arc(ox + x + bx * s, base + by * s, br * s, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = th.trees;
      for (const [bx, by, br] of blobs) {
        ctx.beginPath();
        ctx.arc(ox + x + bx * s - 5 * s, base + by * s - 6 * s, br * s * 0.78, 0, TAU);
        ctx.fill();
      }
    };
    draw(0);
    if (x < 120) draw(STRIP_W);
    if (x > STRIP_W - 120) draw(-STRIP_W);
  }
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let x = 0; x <= STRIP_W; x += 10) ctx.lineTo(x, h * (0.72 + wave(x, 4) * 0.12));
  ctx.lineTo(STRIP_W, h);
  ctx.fillStyle = th.hills;
  ctx.fill();
  const [r, g, b] = th.haze;
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, `rgba(${r},${g},${b},0.25)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0.05)`);
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, STRIP_W, h);
  ctx.globalCompositeOperation = 'source-over';
  return c;
}

function fenceStrip(th, h) {
  const c = makeCanvas(STRIP_W, h);
  const ctx = c.getContext('2d');
  const rnd = seeded(99);
  const pw = 34, gap = 6;
  const top = h * 0.12;
  // перекладины
  ctx.fillStyle = th.fenceDark;
  ctx.fillRect(0, h * 0.32, STRIP_W, 12);
  ctx.fillRect(0, h * 0.72, STRIP_W, 12);
  for (let x = 0; x < STRIP_W; x += pw + gap) {
    const t = top + rnd() * 10;
    ctx.beginPath();
    ctx.moveTo(x, h);
    ctx.lineTo(x, t + 12);
    ctx.lineTo(x + pw / 2, t);
    ctx.lineTo(x + pw, t + 12);
    ctx.lineTo(x + pw, h);
    ctx.closePath();
    ctx.fillStyle = th.fence;
    ctx.fill();
    ctx.strokeStyle = th.fenceDark;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.fillRect(x + pw - 7, t + 12, 7, h - t);
    ctx.fillStyle = th.fenceDark;
    ctx.beginPath();
    ctx.arc(x + pw / 2, h * 0.32 + 6, 2.2, 0, TAU);
    ctx.arc(x + pw / 2, h * 0.72 + 6, 2.2, 0, TAU);
    ctx.fill();
  }
  // кусты перед забором
  for (let i = 0; i < 14; i++) {
    const x = rnd() * STRIP_W;
    const s = 0.7 + rnd() * 0.8;
    const bush = (ox) => {
      for (const [bx, by, br, col] of [[-26, -18, 24, th.treesDark], [22, -16, 22, th.treesDark], [0, -30, 28, th.trees], [-12, -22, 18, th.trees]]) {
        ctx.beginPath();
        ctx.arc(ox + x + bx * s, h + by * s, br * s, 0, TAU);
        ctx.fillStyle = col;
        ctx.fill();
      }
      if (rnd() < 0.6) {
        ctx.fillStyle = ['#FF7FA6', '#FFE066', '#FFFFFF'][i % 3];
        for (let k = 0; k < 4; k++) {
          ctx.beginPath();
          ctx.arc(ox + x + (rnd() - 0.5) * 50 * s, h - 20 * s - rnd() * 22 * s, 3.2, 0, TAU);
          ctx.fill();
        }
      }
    };
    bush(0);
    if (x < 80) bush(STRIP_W);
    if (x > STRIP_W - 80) bush(-STRIP_W);
  }
  return c;
}

function cloudSprite(th, seed) {
  const c = makeCanvas(420, 190);
  const ctx = c.getContext('2d');
  const rnd = seeded(seed);
  const base = 150;
  // пухлые шапки: в середине крупнее, по краям мельче
  const puffs = [];
  const n = 5 + Math.floor(rnd() * 3);
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    const r = 34 + Math.sin(u * Math.PI) * (34 + rnd() * 22);
    puffs.push([60 + u * 300 + (rnd() - 0.5) * 20, base - r * 0.55 - rnd() * 12, r]);
  }
  const blob = (dx, dy, k) => {
    ctx.beginPath();
    for (const [x, y, r] of puffs) {
      ctx.moveTo(x + dx + r * k, y + dy);
      ctx.arc(x + dx, y + dy, r * k, 0, TAU);
    }
    ctx.fill();
  };
  ctx.fillStyle = th.cloudShade;
  blob(0, 10, 1);
  ctx.fillStyle = th.cloud;
  blob(-3, 0, 0.96);
  // плоское донышко
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillRect(0, base + 8, c.width, c.height);
  ctx.globalCompositeOperation = 'source-over';
  // мягкий свет сверху
  ctx.globalCompositeOperation = 'source-atop';
  const hl = ctx.createLinearGradient(0, 40, 0, base);
  hl.addColorStop(0, 'rgba(255,255,255,0.35)');
  hl.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hl;
  ctx.fillRect(0, 0, c.width, base);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  return c;
}

export class Background {
  constructor(themeName) {
    this.name = themeName;
    this.th = THEMES[themeName] || THEMES.day;
    this.W = 0;
    this.H = 0;
  }

  resize(W, H) {
    if (W === this.W && H === this.H) return;
    this.W = W;
    this.H = H;
    const th = this.th;
    this.sky = makeCanvas(4, 256);
    const sctx = this.sky.getContext('2d');
    const g = sctx.createLinearGradient(0, 0, 0, 256);
    for (const [o, col] of th.sky) g.addColorStop(o, col);
    sctx.fillStyle = g;
    sctx.fillRect(0, 0, 4, 256);
    const ref = Math.max(420, H);
    this.city = cityStrip(th, ref * 0.42);
    this.hills = hillsStrip(th, ref * 0.3);
    this.fence = fenceStrip(th, ref * 0.13);
    this.clouds = [cloudSprite(th, 1), cloudSprite(th, 2), cloudSprite(th, 3)];
    const rnd = seeded(5);
    this.stars = [];
    for (let i = 0; i < 140; i++) this.stars.push([rnd(), rnd() * 0.7, rnd() * 1.6 + 0.4, rnd() * TAU]);
    this.vignette = makeCanvas(W / 4, H / 4);
    const vctx = this.vignette.getContext('2d');
    const vg = vctx.createRadialGradient(W / 8, H / 8, Math.min(W, H) / 10, W / 8, H / 8, Math.max(W, H) / 6.5);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(20,10,30,0.32)');
    vctx.fillStyle = vg;
    vctx.fillRect(0, 0, W / 4, H / 4);
  }

  strip(ctx, img, factor, cam, groundY, scale, sink) {
    const w = img.width * scale, h = img.height * scale;
    let off = -((cam.x * cam.z * factor) % w);
    if (off > 0) off -= w;
    const y = groundY - h + sink * scale;
    for (let x = off; x < this.W; x += w) ctx.drawImage(img, x, y, w + 1, h);
  }

  // Рисует всё небо и параллакс (в экранных координатах CSS-пикселей).
  drawSky(ctx, cam, t) {
    const { W, H, th } = this;
    const groundY = cam.groundY();
    ctx.drawImage(this.sky, 0, 0, W, Math.max(groundY, H * 0.5));
    if (groundY < H) {
      ctx.fillStyle = th.sky[th.sky.length - 1][1];
      ctx.fillRect(0, groundY - 1, W, H - groundY + 1);
    }
    const S = Math.min(W, H);
    if (th.stars) {
      for (const [sx, sy, sr, ph] of this.stars) {
        const a = 0.5 + Math.sin(t * 1.5 + ph) * 0.4;
        ctx.globalAlpha = a;
        ctx.fillStyle = '#FFFFFF';
        const x = (((sx * W * 1.3 - cam.x * cam.z * 0.02) % (W * 1.3)) + W * 1.3) % (W * 1.3);
        ctx.fillRect(x, sy * groundY, sr, sr);
      }
      ctx.globalAlpha = 1;
    }
    if (th.sun) {
      const sx = th.sun.x * W - cam.x * cam.z * 0.01, sy = th.sun.y * groundY;
      const r = th.sun.r * S * 1.6;
      const gl = ctx.createRadialGradient(sx, sy, r * 0.3, sx, sy, r * 4.5);
      gl.addColorStop(0, th.sun.glow);
      gl.addColorStop(1, 'rgba(255,220,150,0)');
      ctx.fillStyle = gl;
      ctx.fillRect(sx - r * 5, sy - r * 5, r * 10, r * 10);
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, TAU);
      ctx.fillStyle = th.sun.color;
      ctx.fill();
    }
    if (th.moon) {
      const mx = th.moon.x * W - cam.x * cam.z * 0.01, my = th.moon.y * groundY;
      const r = th.moon.r * S * 1.6;
      const gl = ctx.createRadialGradient(mx, my, r, mx, my, r * 5);
      gl.addColorStop(0, 'rgba(200,215,255,0.35)');
      gl.addColorStop(1, 'rgba(200,215,255,0)');
      ctx.fillStyle = gl;
      ctx.fillRect(mx - r * 5, my - r * 5, r * 10, r * 10);
      ctx.beginPath();
      ctx.arc(mx, my, r, 0, TAU);
      ctx.fillStyle = '#F4F1DE';
      ctx.fill();
      ctx.fillStyle = 'rgba(180,175,160,0.5)';
      for (const [dx, dy, rr] of [[-0.3, -0.2, 0.22], [0.25, 0.3, 0.16], [0.2, -0.35, 0.1]]) {
        ctx.beginPath();
        ctx.arc(mx + dx * r, my + dy * r, rr * r, 0, TAU);
        ctx.fill();
      }
    }
    // облака
    const cw = this.clouds[0].width;
    const span = W + cw * 2;
    ctx.globalAlpha = th.cloudAlpha;
    for (let i = 0; i < 6; i++) {
      const img = this.clouds[i % 3];
      const sc = (0.55 + (i % 3) * 0.25) * (S / 900);
      const x = ((((i * 0.37 + 0.1) * span + t * (6 + i * 2) - cam.x * cam.z * 0.05) % span) + span) % span - cw;
      const y = groundY * (0.08 + ((i * 0.23) % 0.45));
      ctx.drawImage(img, x, y, img.width * sc, img.height * sc);
    }
    ctx.globalAlpha = 1;
    const zs = (p) => Math.pow(cam.z / cam.zRef, p);
    this.strip(ctx, this.city, 0.12, cam, groundY, 0.9 * zs(0.25) * (H / this.city.height / 2.4), 0);
    this.strip(ctx, this.hills, 0.3, cam, groundY, zs(0.45) * (H / this.hills.height / 3.3), 6);
    this.strip(ctx, this.fence, 0.62, cam, groundY, zs(0.7) * (H / this.fence.height / 7.5), 4);
  }

  // Земля в мировых координатах: вызывается при установленном мировом преобразовании (y вверх).
  drawGround(ctx, cam) {
    const th = this.th;
    const x0 = cam.x - cam.W / 2 / cam.z - 1, x1 = cam.x + cam.W / 2 / cam.z + 1;
    const yb = cam.y - cam.H / 2 / cam.z - 1;
    const g = ctx.createLinearGradient(0, 0, 0, Math.min(-1, yb));
    g.addColorStop(0, th.soil);
    g.addColorStop(1, th.soilDark);
    ctx.fillStyle = g;
    ctx.fillRect(x0, yb, x1 - x0, -yb);
    // камешки
    const i0 = Math.floor(x0), i1 = Math.ceil(x1);
    for (let i = i0; i < i1; i++) {
      const r = seeded((i * 2654435761) >>> 0);
      const n = 2;
      for (let k = 0; k < n; k++) {
        ctx.beginPath();
        ctx.ellipse(i + r(), -0.4 - r() * 1.4, 0.06 + r() * 0.06, 0.04 + r() * 0.03, 0, 0, TAU);
        ctx.fillStyle = 'rgba(0,0,0,0.13)';
        ctx.fill();
      }
    }
    // трава
    ctx.fillStyle = th.grassDark;
    ctx.fillRect(x0, -0.32, x1 - x0, 0.34);
    ctx.fillStyle = th.grass;
    ctx.beginPath();
    ctx.moveTo(x0, -0.12);
    const step = 0.16;
    for (let x = Math.floor(x0 / step) * step; x <= x1; x += step) {
      const r = seeded((Math.round(x / step) * 40503) >>> 0);
      ctx.lineTo(x + step * 0.25, 0.02);
      ctx.lineTo(x + step * 0.5, 0.1 + r() * 0.16);
      ctx.lineTo(x + step * 0.75, 0.02);
    }
    ctx.lineTo(x1, -0.12);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = th.grassLight;
    ctx.fillRect(x0, -0.02, x1 - x0, 0.05);
    // цветочки в траве
    for (let i = i0; i < i1; i++) {
      const r = seeded((i * 7919 + 13) >>> 0);
      if (r() > 0.35) continue;
      const fx = i + r(), fy = 0.1 + r() * 0.1;
      ctx.fillStyle = ['#FFFFFF', '#FFE066', '#FF9EC0'][Math.floor(r() * 3)];
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * TAU;
        ctx.beginPath();
        ctx.arc(fx + Math.cos(a) * 0.04, fy + Math.sin(a) * 0.04, 0.035, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = '#F2A93B';
      ctx.beginPath();
      ctx.arc(fx, fy, 0.025, 0, TAU);
      ctx.fill();
    }
  }

  drawOverlay(ctx) {
    if (this.th.tint) {
      ctx.fillStyle = this.th.tint;
      ctx.fillRect(0, 0, this.W, this.H);
    }
    ctx.drawImage(this.vignette, 0, 0, this.W, this.H);
  }
}
