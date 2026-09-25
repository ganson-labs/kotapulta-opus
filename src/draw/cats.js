// Цветные коты. Рисуем в локальных координатах: y вниз, единица — радиус кота
// (для «батона»-сони — метры при s = 1). Смотрят вправо.
import { TAU } from '../util.js';

export const LOOKS = {
  ryzhik: {
    fur: '#F5A142', light: '#FFD08A', dark: '#D8742A', belly: '#FFF3DF', innerEar: '#FFB3AA',
    nose: '#F0707F', iris: '#71C35E', outline: '#6E3B1C', pattern: 'tabby',
  },
  ugolek: {
    fur: '#383344', light: '#5F5873', dark: '#211E29', belly: '#4D4760', innerEar: '#D98A9C',
    nose: '#D86F88', iris: '#FFD23F', outline: '#16131C', pattern: 'solid', whisker: '#D8D2E6',
  },
  barsik: {
    fur: '#A9B3C1', light: '#D7DEE7', dark: '#7D8898', belly: '#F2F5F8', innerEar: '#F4B6BE',
    nose: '#E68B9B', iris: '#5AA9EC', outline: '#4A5362', pattern: 'tabby',
  },
  trio: {
    fur: '#FFF6EA', light: '#FFFFFF', dark: '#E2D3C0', belly: '#FFFFFF', innerEar: '#FFB8B8',
    nose: '#F2808F', iris: '#8FCB5C', outline: '#6A5646', pattern: 'calico',
    patchA: '#F5A142', patchB: '#3D3644',
  },
  sleeper: {
    fur: '#9EAAC4', light: '#C8D2E6', dark: '#7884A0', belly: '#E8EDF6', innerEar: '#F2B4C2',
    nose: '#D98AA0', iris: '#F2A93B', outline: '#465068', pattern: 'solid',
  },
  sleeperB: {
    fur: '#F2C38E', light: '#FFE3BF', dark: '#D39A5E', belly: '#FFF6EA', innerEar: '#F7B0A6',
    nose: '#E5808A', iris: '#7CC06E', outline: '#6E4526', pattern: 'solid',
  },
  sleeperC: {
    fur: '#5B5563', light: '#8A8394', dark: '#3F3A46', belly: '#F4F1F6', innerEar: '#E59AAE',
    nose: '#E0869C', iris: '#9BD86B', outline: '#231F29', pattern: 'solid',
  },
  boss: {
    fur: '#E9E1D6', light: '#FFFFFF', dark: '#C9BBA8', belly: '#FFFFFF', innerEar: '#F6B5BF',
    nose: '#E68798', iris: '#6FB7F0', outline: '#5E5245', pattern: 'solid',
  },
  helper: {
    fur: '#B98D63', light: '#DDBB94', dark: '#8C6444', belly: '#F6E8D6', innerEar: '#F3B3A5',
    nose: '#DE7A7F', iris: '#7CC06E', outline: '#553A25', pattern: 'tabby',
  },
};
LOOKS.kitten = LOOKS.trio;

function ellipse(ctx, x, y, rx, ry, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.abs(rx), Math.abs(ry), rot, 0, TAU);
}

function fillStroke(ctx, fill, stroke, lw) {
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.stroke();
  }
}

function ear(ctx, look, a, len = 1.5, spread = 0.36) {
  const bx1 = Math.cos(a - spread) * 0.9, by1 = Math.sin(a - spread) * 0.9;
  const bx2 = Math.cos(a + spread) * 0.9, by2 = Math.sin(a + spread) * 0.9;
  const tx = Math.cos(a) * len, ty = Math.sin(a) * len;
  ctx.beginPath();
  ctx.moveTo(bx1, by1);
  ctx.quadraticCurveTo(tx * 0.92 + Math.cos(a - 0.5) * 0.06, ty * 0.92 + Math.sin(a - 0.5) * 0.06, tx, ty);
  ctx.quadraticCurveTo(tx * 0.92 + Math.cos(a + 0.5) * 0.06, ty * 0.92 + Math.sin(a + 0.5) * 0.06, bx2, by2);
  ctx.closePath();
  fillStroke(ctx, look.fur, look.outline, 0.08);
  const ix1 = Math.cos(a - 0.2) * 1.0, iy1 = Math.sin(a - 0.2) * 1.0;
  const ix2 = Math.cos(a + 0.2) * 1.0, iy2 = Math.sin(a + 0.2) * 1.0;
  const itx = Math.cos(a) * (len - 0.2), ity = Math.sin(a) * (len - 0.2);
  ctx.beginPath();
  ctx.moveTo(ix1, iy1);
  ctx.quadraticCurveTo(itx * 0.95, ity * 0.95, itx, ity);
  ctx.quadraticCurveTo(itx * 0.95, ity * 0.95, ix2, iy2);
  ctx.closePath();
  ctx.fillStyle = look.innerEar;
  ctx.fill();
}

// Глаз: kind = open | wide | tiny | closed | happy | squint | dizzy | determined | sleepy
function eye(ctx, look, x, y, rx, ry, kind, lx, ly, t, left) {
  ctx.lineCap = 'round';
  if (kind === 'closed' || kind === 'happy' || kind === 'sleepy') {
    ctx.beginPath();
    if (kind === 'happy') ctx.arc(x, y + ry * 0.35, rx * 0.85, Math.PI * 1.15, Math.PI * 1.85);
    else ctx.arc(x, y - ry * 0.25, rx * 0.85, Math.PI * 0.15, Math.PI * 0.85);
    ctx.strokeStyle = look.outline;
    ctx.lineWidth = 0.075;
    ctx.stroke();
    if (kind === 'sleepy') {
      // ресницы
      for (const d of [-0.5, 0, 0.5]) {
        const ax = x + d * rx * 0.8, ay = y - ry * 0.25 + Math.cos(d) * rx * 0.85;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(ax + d * 0.06, ay + 0.08);
        ctx.lineWidth = 0.04;
        ctx.stroke();
      }
    }
    return;
  }
  if (kind === 'squint') {
    const s = left ? 1 : -1;
    ctx.beginPath();
    ctx.moveTo(x - rx * 0.8 * s, y - ry * 0.6);
    ctx.lineTo(x + rx * 0.6 * s, y);
    ctx.lineTo(x - rx * 0.8 * s, y + ry * 0.6);
    ctx.strokeStyle = look.outline;
    ctx.lineWidth = 0.08;
    ctx.stroke();
    return;
  }
  const wide = kind === 'wide' || kind === 'tiny';
  const sx = wide ? 1.12 : 1;
  ellipse(ctx, x, y, rx * sx, ry * sx);
  fillStroke(ctx, '#FFFFFF', look.outline, 0.055);
  if (kind === 'dizzy') {
    ctx.beginPath();
    const turns = 2.2;
    for (let i = 0; i <= 40; i++) {
      const u = i / 40;
      const a = u * turns * TAU + t * 8 * (left ? 1 : -1);
      const rr = u * rx * 0.85;
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr * (ry / rx);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = look.outline;
    ctx.lineWidth = 0.045;
    ctx.stroke();
    return;
  }
  const ir = Math.min(rx, ry) * (kind === 'tiny' ? 0.42 : wide ? 0.62 : 0.8);
  const ix = x + lx * rx * 0.3, iy = y + ly * ry * 0.3;
  ctx.save();
  ellipse(ctx, x, y, rx * sx, ry * sx);
  ctx.clip();
  const g = ctx.createRadialGradient(ix - ir * 0.3, iy - ir * 0.3, ir * 0.1, ix, iy, ir);
  g.addColorStop(0, '#FFFFFF');
  g.addColorStop(0.25, look.iris);
  g.addColorStop(1, shade(look.iris, -0.35));
  ellipse(ctx, ix, iy, ir, ir);
  ctx.fillStyle = g;
  ctx.fill();
  ellipse(ctx, ix, iy, ir * (kind === 'tiny' ? 0.45 : 0.55), ir * (kind === 'tiny' ? 0.5 : 0.62));
  ctx.fillStyle = '#1A1420';
  ctx.fill();
  ellipse(ctx, ix - ir * 0.32, iy - ir * 0.38, ir * 0.3, ir * 0.3);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ellipse(ctx, ix + ir * 0.3, iy + ir * 0.3, ir * 0.13, ir * 0.13);
  ctx.fill();
  if (kind === 'determined') {
    // верхнее веко — решительный прищур
    ctx.beginPath();
    const s = left ? -1 : 1;
    ctx.moveTo(x - rx * 1.3, y - ry * 1.3);
    ctx.lineTo(x + rx * 1.3, y - ry * 1.3);
    ctx.lineTo(x + rx * 1.3, y - ry * (0.25 + 0.3 * s));
    ctx.lineTo(x - rx * 1.3, y - ry * (0.25 - 0.3 * s));
    ctx.closePath();
    ctx.fillStyle = look.fur;
    ctx.fill();
  }
  ctx.restore();
  if (kind === 'determined') {
    const s = left ? -1 : 1;
    ctx.beginPath();
    ctx.moveTo(x - rx, y - ry * (0.25 - 0.3 * s));
    ctx.lineTo(x + rx, y - ry * (0.25 + 0.3 * s));
    ctx.strokeStyle = look.outline;
    ctx.lineWidth = 0.07;
    ctx.stroke();
  }
  ellipse(ctx, x, y, rx * sx, ry * sx);
  ctx.strokeStyle = look.outline;
  ctx.lineWidth = 0.055;
  ctx.stroke();
}

export function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (k < 0) {
    r *= 1 + k; g *= 1 + k; b *= 1 + k;
  } else {
    r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k;
  }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

function mouth(ctx, look, kind, x, y, t) {
  ctx.strokeStyle = look.outline;
  ctx.lineWidth = 0.05;
  ctx.lineCap = 'round';
  if (kind === 'open' || kind === 'scream') {
    const h = kind === 'scream' ? 0.26 : 0.18;
    ellipse(ctx, x, y + h * 0.55, 0.14, h);
    fillStroke(ctx, '#6B2233', look.outline, 0.05);
    ellipse(ctx, x, y + h * 1.05, 0.09, 0.06);
    ctx.fillStyle = '#F2808F';
    ctx.fill();
  } else if (kind === 'smile') {
    ctx.beginPath();
    ctx.moveTo(x - 0.16, y + 0.04);
    ctx.quadraticCurveTo(x, y + 0.26, x + 0.16, y + 0.04);
    ctx.closePath();
    fillStroke(ctx, '#6B2233', look.outline, 0.05);
  } else if (kind === 'bite') {
    ctx.beginPath();
    ctx.moveTo(x - 0.14, y + 0.08);
    ctx.lineTo(x + 0.14, y + 0.08);
    ctx.stroke();
    // клычки, сжимающие верёвку
    ctx.fillStyle = '#FFFFFF';
    for (const dx of [-0.07, 0.07]) {
      ctx.beginPath();
      ctx.moveTo(x + dx - 0.03, y + 0.07);
      ctx.lineTo(x + dx, y + 0.14);
      ctx.lineTo(x + dx + 0.03, y + 0.07);
      ctx.fill();
    }
  } else if (kind === 'frown') {
    ctx.beginPath();
    ctx.arc(x, y + 0.2, 0.1, Math.PI * 1.2, Math.PI * 1.8);
    ctx.stroke();
  } else {
    // «w»
    ctx.beginPath();
    ctx.moveTo(x - 0.13, y + 0.04);
    ctx.quadraticCurveTo(x - 0.065, y + 0.14, x, y + 0.04);
    ctx.quadraticCurveTo(x + 0.065, y + 0.14, x + 0.13, y + 0.04);
    ctx.stroke();
  }
}

const EXPR = {
  idle: { eyes: 'open', mouth: 'w' },
  aim: { eyes: 'determined', mouth: 'w' },
  fly: { eyes: 'wide', mouth: 'scream' },
  hit: { eyes: 'squint', mouth: 'open' },
  dizzy: { eyes: 'dizzy', mouth: 'open' },
  happy: { eyes: 'happy', mouth: 'smile' },
  meow: { eyes: 'happy', mouth: 'open' },
  shock: { eyes: 'tiny', mouth: 'scream' },
  effort: { eyes: 'squint', mouth: 'bite' },
  bite: { eyes: 'open', mouth: 'bite' },
  sleep: { eyes: 'sleepy', mouth: 'w' },
};

// Круглый кот. o: { t, expr, blink, lx, ly, paws (0 — сидит, 1 — лапы вперёд),
// spiky, hat, tailUp, phase }
export function drawBallCat(ctx, look, o = {}) {
  const t = o.t ?? 0;
  const ex = EXPR[o.expr || 'idle'];
  const blink = o.blink && ex.eyes === 'open';
  const paws = o.paws ?? 0;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Хвост
  const sway = Math.sin(t * 2.4 + (o.phase ?? 0)) * 0.14;
  ctx.beginPath();
  if (o.tailUp) {
    ctx.moveTo(-0.7, 0.3);
    ctx.bezierCurveTo(-1.1, 0.1, -1.05 + sway, -0.9, -0.85 + sway * 1.5, -1.45);
  } else {
    ctx.moveTo(-0.72, 0.5);
    ctx.bezierCurveTo(-1.38, 0.42 + sway * 0.4, -1.5 + sway, -0.3, -1.12 + sway * 1.4, -0.82);
  }
  const tw = o.spiky ? 0.34 : 0.22;
  ctx.strokeStyle = look.outline;
  ctx.lineWidth = tw + 0.13;
  ctx.stroke();
  ctx.strokeStyle = look.fur;
  ctx.lineWidth = tw;
  ctx.stroke();
  if (look.pattern === 'tabby') {
    ctx.setLineDash([0.1, 0.17]);
    ctx.strokeStyle = look.dark;
    ctx.stroke();
    ctx.setLineDash([]);
  } else if (look.pattern === 'calico') {
    ctx.setLineDash([0.001, 0.55, 0.5, 10]);
    ctx.strokeStyle = look.patchB;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Задние лапы
  for (const fx of [-0.42, 0.28]) {
    ellipse(ctx, fx, 0.9, 0.27, 0.17);
    fillStroke(ctx, look.fur, look.outline, 0.07);
  }

  // Уши
  ear(ctx, look, -2.08);
  ear(ctx, look, -1.08);

  // Шерсть дыбом
  if (o.spiky) {
    ctx.beginPath();
    const n = 18;
    for (let i = 0; i <= n * 2; i++) {
      const a = (i / (n * 2)) * TAU;
      const rr = i % 2 ? 1.0 : 1.2 + Math.sin(i * 7.3) * 0.05;
      const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    fillStroke(ctx, look.fur, look.outline, 0.07);
  }

  // Тело
  const g = ctx.createRadialGradient(-0.35, -0.45, 0.1, 0, 0, 1.2);
  g.addColorStop(0, look.light);
  g.addColorStop(0.55, look.fur);
  g.addColorStop(1, look.dark);
  ellipse(ctx, 0, 0, 1, 1);
  ctx.fillStyle = g;
  ctx.fill();

  ctx.save();
  ellipse(ctx, 0, 0, 1, 1);
  ctx.clip();
  if (look.pattern === 'tabby') {
    ctx.strokeStyle = look.dark;
    ctx.lineWidth = 0.13;
    for (const [a0, a1, rr] of [[-2.9, -2.2, 0.82], [-2.6, -1.9, 0.62], [-2.2, -1.55, 0.95]]) {
      ctx.beginPath();
      ctx.arc(-0.25, 0.1, rr, a0, a1);
      ctx.stroke();
    }
    // полоски на лбу
    for (const dx of [0.28, 0.4, 0.52]) {
      ctx.beginPath();
      ctx.moveTo(dx, -0.95);
      ctx.lineTo(dx + (dx - 0.4) * 0.3, -0.62 - (dx === 0.4 ? 0.08 : 0));
      ctx.lineWidth = 0.07;
      ctx.stroke();
    }
  } else if (look.pattern === 'calico') {
    ellipse(ctx, -0.55, -0.55, 0.62, 0.5, 0.4);
    ctx.fillStyle = look.patchA;
    ctx.fill();
    ellipse(ctx, -0.75, 0.35, 0.42, 0.38, -0.3);
    ctx.fillStyle = look.patchB;
    ctx.fill();
    ellipse(ctx, 0.75, -0.72, 0.38, 0.3, 0.2);
    ctx.fillStyle = look.patchB;
    ctx.fill();
  }
  // живот
  ellipse(ctx, 0.3, 0.52, 0.62, 0.48);
  ctx.fillStyle = look.belly;
  ctx.globalAlpha = 0.95;
  ctx.fill();
  ctx.globalAlpha = 1;
  // мягкий рефлекс снизу
  ellipse(ctx, -0.1, 1.05, 1.1, 0.35);
  ctx.fillStyle = 'rgba(0,0,0,0.10)';
  ctx.fill();
  ctx.restore();

  ellipse(ctx, 0, 0, 1, 1);
  ctx.strokeStyle = look.outline;
  ctx.lineWidth = 0.08;
  ctx.stroke();

  // Шапка
  if (o.hat === 'helmet') drawHelmet(ctx);

  // Лицо
  const lx = o.lx ?? 0.4, ly = o.ly ?? 0;
  const ek = blink ? 'closed' : ex.eyes;
  eye(ctx, look, 0.1, -0.14, 0.2, 0.24, ek, lx, ly, t, true);
  eye(ctx, look, 0.62, -0.12, 0.19, 0.23, ek, lx, ly, t, false);

  // румянец
  ellipse(ctx, -0.1, 0.2, 0.14, 0.08);
  ctx.fillStyle = 'rgba(255,120,140,0.35)';
  ctx.fill();
  ellipse(ctx, 0.82, 0.2, 0.12, 0.08);
  ctx.fill();

  // мордочка
  ellipse(ctx, 0.26, 0.26, 0.17, 0.13);
  ctx.fillStyle = look.belly;
  ctx.fill();
  ellipse(ctx, 0.5, 0.26, 0.17, 0.13);
  ctx.fill();
  // нос
  ctx.beginPath();
  ctx.moveTo(0.3, 0.12);
  ctx.quadraticCurveTo(0.38, 0.08, 0.46, 0.12);
  ctx.quadraticCurveTo(0.42, 0.2, 0.38, 0.21);
  ctx.quadraticCurveTo(0.34, 0.2, 0.3, 0.12);
  fillStroke(ctx, look.nose, look.outline, 0.035);
  mouth(ctx, look, ex.mouth, 0.38, 0.2, t);

  // усы
  ctx.strokeStyle = look.whisker || 'rgba(60,40,30,0.55)';
  ctx.lineWidth = 0.028;
  const wob = Math.sin(t * 5) * 0.02;
  for (const [dy, ey] of [[0.22, 0.12], [0.28, 0.3], [0.34, 0.48]]) {
    ctx.beginPath();
    ctx.moveTo(0.12, dy);
    ctx.quadraticCurveTo(-0.15, dy - 0.02, -0.42, ey - 0.12 + wob);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0.64, dy);
    ctx.quadraticCurveTo(0.9, dy - 0.02, 1.18, ey - 0.12 - wob);
    ctx.stroke();
  }

  // Передние лапки
  const px1 = 0.02 + paws * 0.85, py1 = 0.8 - paws * 0.72;
  const px2 = 0.56 + paws * 0.42, py2 = 0.84 - paws * 0.3;
  for (const [px, py] of [[px1, py1], [px2, py2]]) {
    ellipse(ctx, px, py, 0.2, 0.15);
    fillStroke(ctx, look.belly, look.outline, 0.06);
    ctx.beginPath();
    ctx.moveTo(px - 0.05, py + 0.04);
    ctx.lineTo(px - 0.05, py + 0.13);
    ctx.moveTo(px + 0.05, py + 0.04);
    ctx.lineTo(px + 0.05, py + 0.13);
    ctx.lineWidth = 0.03;
    ctx.stroke();
  }
  ctx.restore();
}

function drawHelmet(ctx) {
  ctx.save();
  ctx.translate(0.05, -0.62);
  ctx.rotate(-0.08);
  const g = ctx.createLinearGradient(0, -0.6, 0, 0.1);
  g.addColorStop(0, '#FFE066');
  g.addColorStop(1, '#F2B21B');
  ctx.beginPath();
  ctx.moveTo(-0.72, 0.1);
  ctx.bezierCurveTo(-0.72, -0.62, 0.72, -0.62, 0.72, 0.1);
  ctx.closePath();
  fillStroke(ctx, g, '#8A5A00', 0.07);
  ctx.beginPath();
  ctx.moveTo(0, -0.46);
  ctx.lineTo(0, 0.08);
  ctx.strokeStyle = '#D99A0B';
  ctx.lineWidth = 0.16;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(0.02, 0.12, 0.92, 0.12, 0, 0, TAU);
  fillStroke(ctx, '#F7C531', '#8A5A00', 0.06);
  ctx.restore();
}

function drawNightcap(ctx, t) {
  ctx.save();
  ctx.translate(0.52, -0.52);
  ctx.rotate(-0.5);
  const flop = Math.sin(t * 1.8) * 0.05;
  ctx.beginPath();
  ctx.moveTo(-0.42, 0.05);
  ctx.quadraticCurveTo(-0.2, -0.75, 0.45 + flop, -0.8);
  ctx.quadraticCurveTo(0.95 + flop, -0.7, 0.95 + flop, -0.35);
  ctx.quadraticCurveTo(0.5, -0.5, 0.42, 0.05);
  ctx.closePath();
  const g = ctx.createLinearGradient(-0.4, 0, 0.9, -0.7);
  g.addColorStop(0, '#4E6BD8');
  g.addColorStop(1, '#2F46A8');
  fillStroke(ctx, g, '#1D2A66', 0.06);
  // звёздочки на колпаке
  ctx.fillStyle = '#FFE27A';
  for (const [sx, sy] of [[-0.1, -0.25], [0.3, -0.5], [0.15, -0.1]]) {
    star(ctx, sx, sy, 0.07, 0.03, 5);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.ellipse(0, 0.05, 0.5, 0.13, 0, 0, TAU);
  fillStroke(ctx, '#FFFFFF', '#9AA3BF', 0.05);
  ctx.beginPath();
  ctx.arc(0.98 + flop, -0.3, 0.15, 0, TAU);
  fillStroke(ctx, '#FFFFFF', '#9AA3BF', 0.05);
  ctx.restore();
}

export function star(ctx, x, y, R, r, n) {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * TAU - Math.PI / 2;
    const rr = i % 2 ? r : R;
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

// Спящий кот-«батон». Локальные метры при s = 1: физический бокс ±0.82 × ±0.44.
// o: { t, breathe, peek (0..1 — приоткрыл глаз), boss }
export function drawSleeper(ctx, look, o = {}) {
  const t = o.t ?? 0;
  const br = 1 + Math.sin(t * 1.7) * 0.035;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // дыхание — от нижней грани
  ctx.translate(0, 0.44);
  ctx.scale(1 + (br - 1) * 0.4, br);
  ctx.translate(0, -0.44);

  // тело
  const g = ctx.createRadialGradient(-0.4, -0.35, 0.05, -0.1, 0, 1.1);
  g.addColorStop(0, look.light);
  g.addColorStop(0.6, look.fur);
  g.addColorStop(1, look.dark);
  ctx.beginPath();
  ctx.moveTo(-0.62, 0.46);
  ctx.bezierCurveTo(-1.02, 0.46, -1.02, -0.46, -0.3, -0.46);
  ctx.bezierCurveTo(0.2, -0.46, 0.55, -0.35, 0.72, -0.1);
  ctx.lineTo(0.72, 0.46);
  ctx.closePath();
  fillStroke(ctx, g, look.outline, 0.07);
  // полоски на спине (едва заметные)
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = look.dark;
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = 0.08;
  for (const x of [-0.55, -0.3, -0.05]) {
    ctx.beginPath();
    ctx.moveTo(x, -0.5);
    ctx.quadraticCurveTo(x - 0.08, -0.3, x + 0.02, -0.16);
    ctx.stroke();
  }
  ctx.restore();

  // хвост вокруг лап
  ctx.beginPath();
  ctx.moveTo(-0.8, 0.2);
  ctx.bezierCurveTo(-1.02, 0.52, -0.3, 0.5, 0.25, 0.42);
  ctx.strokeStyle = look.outline;
  ctx.lineWidth = 0.28;
  ctx.stroke();
  ctx.strokeStyle = look.fur;
  ctx.lineWidth = 0.17;
  ctx.stroke();

  // голова
  ctx.save();
  ctx.translate(0.6, -0.05);
  const hr = 0.46;
  ctx.scale(hr, hr);
  ear(ctx, look, -2.2, 1.45, 0.34);
  ear(ctx, look, -1.1, 1.45, 0.34);
  const hg = ctx.createRadialGradient(-0.3, -0.4, 0.1, 0, 0, 1.15);
  hg.addColorStop(0, look.light);
  hg.addColorStop(0.6, look.fur);
  hg.addColorStop(1, look.dark);
  ellipse(ctx, 0, 0, 1.08, 0.95);
  fillStroke(ctx, hg, look.outline, 0.15);
  if (o.boss) drawNightcap(ctx, t);
  // мордочка
  const peek = o.peek ?? 0;
  eye(ctx, look, -0.38, -0.05, 0.28, 0.3, 'sleepy', 0, 0, t, true);
  if (peek > 0.3) eye(ctx, look, 0.38, -0.05, 0.26, 0.26 * peek, 'open', -1, 0.5, t, false);
  else eye(ctx, look, 0.38, -0.05, 0.28, 0.3, 'sleepy', 0, 0, t, false);
  ellipse(ctx, -0.5, 0.32, 0.2, 0.12);
  ctx.fillStyle = 'rgba(255,120,140,0.35)';
  ctx.fill();
  ellipse(ctx, 0.5, 0.32, 0.2, 0.12);
  ctx.fill();
  ellipse(ctx, -0.14, 0.42, 0.24, 0.18);
  ctx.fillStyle = look.belly;
  ctx.fill();
  ellipse(ctx, 0.14, 0.42, 0.24, 0.18);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-0.1, 0.22);
  ctx.quadraticCurveTo(0, 0.18, 0.1, 0.22);
  ctx.quadraticCurveTo(0.05, 0.33, 0, 0.34);
  ctx.quadraticCurveTo(-0.05, 0.33, -0.1, 0.22);
  fillStroke(ctx, look.nose, look.outline, 0.06);
  ctx.strokeStyle = look.outline;
  ctx.lineWidth = 0.08;
  ctx.beginPath();
  if (peek > 0.3) {
    ctx.arc(0, 0.62, 0.14, Math.PI * 1.2, Math.PI * 1.8);
  } else {
    ctx.moveTo(-0.16, 0.4);
    ctx.quadraticCurveTo(-0.08, 0.52, 0, 0.4);
    ctx.quadraticCurveTo(0.08, 0.52, 0.16, 0.4);
  }
  ctx.stroke();
  // усы
  ctx.strokeStyle = 'rgba(60,50,70,0.5)';
  ctx.lineWidth = 0.05;
  for (const dy of [0.36, 0.46]) {
    ctx.beginPath();
    ctx.moveTo(-0.35, dy);
    ctx.lineTo(-1.15, dy - 0.08 + (dy - 0.4));
    ctx.moveTo(0.35, dy);
    ctx.lineTo(1.15, dy - 0.08 + (dy - 0.4));
    ctx.stroke();
  }
  ctx.restore();

  // лапки под головой
  for (const px of [0.38, 0.74]) {
    ellipse(ctx, px, 0.38, 0.17, 0.1);
    fillStroke(ctx, look.belly, look.outline, 0.05);
  }
  ctx.restore();
}
