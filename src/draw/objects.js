// Цветная отрисовка предметов. Локальные координаты — метры, y вниз, центр тела в (0,0).
import { TAU, seeded, roundRectPath } from '../util.js';
import { shade, star } from './cats.js';

const INK = '#5B3A1E';

function strokeFill(ctx, fill, stroke, lw) {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lw;
  ctx.stroke();
}

function damageCracks(ctx, b, w, h, color) {
  const dmg = 1 - Math.max(0, b.hp) / b.maxHp;
  if (dmg < 0.25) return;
  const rnd = seeded(b.seed + 17);
  const n = dmg > 0.6 ? 4 : 2;
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.035;
  ctx.lineJoin = 'miter';
  for (let i = 0; i < n; i++) {
    let x = (rnd() - 0.5) * w * 0.9, y = (rnd() < 0.5 ? -1 : 1) * h * 0.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const steps = 3 + Math.floor(rnd() * 3);
    for (let s = 0; s < steps; s++) {
      x += (rnd() - 0.5) * w * 0.25;
      y += (y > 0 ? -1 : 1) * h * (0.08 + rnd() * 0.12);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

// ---------- картон ----------
function drawBox(ctx, b) {
  const w = b.w, h = b.h;
  const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  g.addColorStop(0, '#E2AC6E');
  g.addColorStop(1, '#C48648');
  roundRectPath(ctx, -w / 2, -h / 2, w, h, 0.05);
  strokeFill(ctx, g, '#7E5024', 0.06);
  ctx.save();
  roundRectPath(ctx, -w / 2, -h / 2, w, h, 0.05);
  ctx.clip();
  // объём: тень справа, блик слева
  ctx.fillStyle = 'rgba(90,50,15,0.16)';
  ctx.fillRect(w / 2 - 0.16, -h / 2, 0.16, h);
  ctx.fillStyle = 'rgba(255,240,210,0.18)';
  ctx.fillRect(-w / 2, -h / 2, 0.1, h);
  // клапаны
  ctx.strokeStyle = 'rgba(110,65,25,0.55)';
  ctx.lineWidth = 0.035;
  ctx.beginPath();
  ctx.moveTo(-w / 2, -h / 2 + 0.2);
  ctx.lineTo(w / 2, -h / 2 + 0.2);
  ctx.stroke();
  // скотч
  ctx.fillStyle = 'rgba(245,226,176,0.8)';
  ctx.fillRect(-0.15, -h / 2, 0.3, Math.min(0.42, h * 0.38));
  ctx.strokeStyle = 'rgba(160,120,60,0.35)';
  ctx.lineWidth = 0.02;
  ctx.strokeRect(-0.15, -h / 2, 0.3, Math.min(0.42, h * 0.38));
  // печать
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = INK;
  ctx.strokeStyle = INK;
  const cy = 0.12;
  const v = b.v % 4;
  if (v === 0) {
    // «верх» — две стрелки
    ctx.lineWidth = 0.06;
    for (const dx of [-0.18, 0.18]) {
      ctx.beginPath();
      ctx.moveTo(dx, cy + 0.2);
      ctx.lineTo(dx, cy - 0.16);
      ctx.moveTo(dx - 0.1, cy - 0.06);
      ctx.lineTo(dx, cy - 0.18);
      ctx.lineTo(dx + 0.1, cy - 0.06);
      ctx.stroke();
    }
  } else if (v === 1) {
    // рыбка-логотип
    ctx.beginPath();
    ctx.ellipse(0.04, cy, 0.24, 0.12, 0, 0, TAU);
    ctx.moveTo(-0.18, cy);
    ctx.lineTo(-0.34, cy - 0.12);
    ctx.lineTo(-0.34, cy + 0.12);
    ctx.closePath();
    ctx.fill();
  } else if (v === 2) {
    ctx.save();
    ctx.scale(0.01, 0.01);
    ctx.font = `700 ${Math.min(22, w * 13)}px "Rubik Variable", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('ХРУПКО', 0, (cy + 0.04) * 100);
    ctx.restore();
    ctx.lineWidth = 0.035;
    ctx.beginPath();
    ctx.moveTo(-w * 0.32, cy + 0.2);
    ctx.lineTo(w * 0.32, cy + 0.2);
    ctx.stroke();
  } else {
    // лапка
    ctx.beginPath();
    ctx.ellipse(0, cy + 0.08, 0.14, 0.11, 0, 0, TAU);
    ctx.fill();
    for (const [dx, dy] of [[-0.17, -0.08], [-0.06, -0.16], [0.06, -0.16], [0.17, -0.08]]) {
      ctx.beginPath();
      ctx.ellipse(dx, cy + dy, 0.05, 0.06, 0, 0, TAU);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  damageCracks(ctx, b, w, h, 'rgba(80,40,10,0.7)');
  const dmg = 1 - Math.max(0, b.hp) / b.maxHp;
  if (dmg > 0.55) {
    // оторванный уголок
    ctx.fillStyle = '#6E4620';
    ctx.beginPath();
    ctx.moveTo(w / 2, h / 2 - 0.34);
    ctx.lineTo(w / 2 - 0.3, h / 2);
    ctx.lineTo(w / 2, h / 2);
    ctx.fill();
  }
  ctx.restore();
}

// ---------- дерево ----------
function woodGrain(ctx, b, w, h, horizontal) {
  const rnd = seeded(b.seed);
  ctx.strokeStyle = 'rgba(95,52,18,0.35)';
  ctx.lineWidth = 0.025;
  const n = Math.max(2, Math.round((horizontal ? h : w) / 0.14));
  for (let i = 0; i < n; i++) {
    const o = ((i + 0.5) / n - 0.5) * (horizontal ? h : w);
    ctx.beginPath();
    if (horizontal) {
      ctx.moveTo(-w / 2, o);
      ctx.bezierCurveTo(-w / 6, o + (rnd() - 0.5) * 0.06, w / 6, o + (rnd() - 0.5) * 0.06, w / 2, o);
    } else {
      ctx.moveTo(o, -h / 2);
      ctx.bezierCurveTo(o + (rnd() - 0.5) * 0.06, -h / 6, o + (rnd() - 0.5) * 0.06, h / 6, o, h / 2);
    }
    ctx.stroke();
  }
  // сучок
  if (rnd() < 0.7) {
    ctx.beginPath();
    ctx.ellipse((rnd() - 0.5) * w * 0.6, (rnd() - 0.5) * h * 0.5, 0.06, 0.035, horizontal ? 0 : Math.PI / 2, 0, TAU);
    ctx.stroke();
  }
}

function nail(ctx, x, y) {
  ctx.beginPath();
  ctx.arc(x, y, 0.035, 0, TAU);
  ctx.fillStyle = '#5E5A57';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x - 0.01, y - 0.01, 0.014, 0, TAU);
  ctx.fillStyle = '#C8C4BE';
  ctx.fill();
}

function drawCrate(ctx, b) {
  const w = b.w, h = b.h;
  const g = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
  g.addColorStop(0, '#D4955A');
  g.addColorStop(1, '#AD6E36');
  roundRectPath(ctx, -w / 2, -h / 2, w, h, 0.04);
  strokeFill(ctx, g, '#5C3514', 0.06);
  ctx.save();
  ctx.clip();
  woodGrain(ctx, b, w, h, true);
  // рамка и диагональ
  const f = Math.min(w, h) * 0.16;
  ctx.fillStyle = 'rgba(120,68,28,0.55)';
  ctx.fillRect(-w / 2, -h / 2, w, f);
  ctx.fillRect(-w / 2, h / 2 - f, w, f);
  ctx.fillRect(-w / 2, -h / 2, f, h);
  ctx.fillRect(w / 2 - f, -h / 2, f, h);
  ctx.save();
  ctx.beginPath();
  ctx.rect(-w / 2 + f, -h / 2 + f, w - 2 * f, h - 2 * f);
  ctx.clip();
  ctx.translate(0, 0);
  ctx.rotate(Math.atan2(h, w));
  ctx.fillStyle = '#C07F45';
  ctx.fillRect(-w, -f / 2, w * 2, f);
  ctx.strokeStyle = 'rgba(70,35,10,0.5)';
  ctx.lineWidth = 0.03;
  ctx.strokeRect(-w, -f / 2, w * 2, f);
  ctx.restore();
  ctx.strokeStyle = 'rgba(70,35,10,0.5)';
  ctx.lineWidth = 0.03;
  ctx.strokeRect(-w / 2 + f, -h / 2 + f, w - 2 * f, h - 2 * f);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) nail(ctx, sx * (w / 2 - f / 2), sy * (h / 2 - f / 2));
  damageCracks(ctx, b, w, h, 'rgba(50,25,5,0.8)');
  ctx.fillStyle = 'rgba(255,230,190,0.15)';
  ctx.fillRect(-w / 2, -h / 2, w, 0.06);
  ctx.restore();
}

function drawPlank(ctx, b) {
  const w = b.w, h = b.h;
  const horizontal = w >= h;
  const g = horizontal ? ctx.createLinearGradient(0, -h / 2, 0, h / 2) : ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
  g.addColorStop(0, '#DDA367');
  g.addColorStop(1, '#A7682F');
  roundRectPath(ctx, -w / 2, -h / 2, w, h, Math.min(w, h) * 0.25);
  strokeFill(ctx, g, '#5C3514', 0.055);
  ctx.save();
  ctx.clip();
  woodGrain(ctx, b, w, h, horizontal);
  damageCracks(ctx, b, w, h, 'rgba(50,25,5,0.8)');
  ctx.restore();
  const L = Math.max(w, h) / 2 - 0.18;
  if (horizontal) { nail(ctx, -L, 0); nail(ctx, L, 0); } else { nail(ctx, 0, -L); nail(ctx, 0, L); }
}

// ---------- кирпич ----------
function drawBrick(ctx, b) {
  const w = b.w, h = b.h;
  roundRectPath(ctx, -w / 2, -h / 2, w, h, 0.03);
  strokeFill(ctx, '#E6D2B8', '#5A2E22', 0.06);
  ctx.save();
  ctx.clip();
  const rows = Math.max(1, Math.round(h / 0.3));
  const rh = h / rows;
  const bw = 0.5;
  const rnd = seeded(b.seed);
  for (let r = 0; r < rows; r++) {
    const y = -h / 2 + r * rh;
    const off = r % 2 ? bw / 2 : 0;
    for (let x = -w / 2 - off; x < w / 2; x += bw) {
      const tone = 0.85 + rnd() * 0.25;
      ctx.fillStyle = `rgb(${(185 * tone) | 0},${(86 * tone) | 0},${(60 * tone) | 0})`;
      roundRectPath(ctx, x + 0.025, y + 0.025, bw - 0.05, rh - 0.05, 0.03);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,200,170,0.25)';
      ctx.fillRect(x + 0.04, y + 0.03, bw - 0.08, 0.035);
    }
  }
  damageCracks(ctx, b, w, h, 'rgba(40,15,10,0.85)');
  ctx.restore();
}

// ---------- подушка ----------
const PILLOW = [['#C9B6F2', '#9C84D8'], ['#F7BFD6', '#DB8EB2'], ['#AEE3D0', '#78C2A8']];
function drawPillow(ctx, b) {
  const w = b.w, h = b.h;
  const [c1, c2] = PILLOW[b.v % PILLOW.length];
  const x0 = -w / 2, y0 = -h / 2, bulge = h * 0.22;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.quadraticCurveTo(0, y0 - bulge, -x0, y0);
  ctx.quadraticCurveTo(-x0 + bulge, 0, -x0, -y0);
  ctx.quadraticCurveTo(0, -y0 + bulge * 0.5, x0, -y0);
  ctx.quadraticCurveTo(x0 - bulge, 0, x0, y0);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, y0, 0, -y0);
  g.addColorStop(0, shade(c1, 0.3));
  g.addColorStop(1, c2);
  strokeFill(ctx, g, shade(c2, -0.45), 0.055);
  ctx.save();
  ctx.clip();
  ctx.setLineDash([0.06, 0.06]);
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 0.025;
  roundRectPath(ctx, x0 + 0.12, y0 + 0.08, w - 0.24, h - 0.16, 0.12);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.ellipse(-w * 0.2, -h * 0.18, w * 0.22, h * 0.12, -0.1, 0, TAU);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fill();
  damageCracks(ctx, b, w, h, 'rgba(90,60,110,0.6)');
  ctx.restore();
}

// ---------- горшок с цветком ----------
const FLOWERS = ['#FF6B8A', '#FFC93C', '#8FD3FF', '#C77DFF'];
function drawPot(ctx, b, t) {
  const w = b.w, h = b.h, bw = w * 0.34;
  // растение (над горшком, вне физики)
  ctx.save();
  const sway = Math.sin(t * 1.5 + b.seed) * 0.05;
  ctx.translate(0, -h / 2);
  ctx.rotate(sway);
  ctx.strokeStyle = '#3F8A3A';
  ctx.lineWidth = 0.06;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(0.05, -0.3, 0, -0.55);
  ctx.stroke();
  for (const [s, y] of [[-1, -0.18], [1, -0.3]]) {
    ctx.beginPath();
    ctx.ellipse(s * 0.16, y, 0.16, 0.07, s * -0.5, 0, TAU);
    ctx.fillStyle = '#5DB04F';
    ctx.fill();
    ctx.strokeStyle = '#2F6F2B';
    ctx.lineWidth = 0.025;
    ctx.stroke();
  }
  const fc = FLOWERS[b.v % FLOWERS.length];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU;
    ctx.beginPath();
    ctx.ellipse(Math.cos(a) * 0.1, -0.6 + Math.sin(a) * 0.1, 0.09, 0.06, a, 0, TAU);
    ctx.fillStyle = fc;
    ctx.fill();
    ctx.strokeStyle = shade(fc, -0.4);
    ctx.lineWidth = 0.02;
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(0, -0.6, 0.06, 0, TAU);
  ctx.fillStyle = '#FFE36B';
  ctx.fill();
  ctx.restore();
  // горшок
  ctx.beginPath();
  ctx.moveTo(-bw, h / 2);
  ctx.lineTo(bw, h / 2);
  ctx.lineTo(w / 2 * 0.92, -h / 2 + 0.2);
  ctx.lineTo(-w / 2 * 0.92, -h / 2 + 0.2);
  ctx.closePath();
  const g = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
  g.addColorStop(0, '#E07A4C');
  g.addColorStop(0.4, '#CF6337');
  g.addColorStop(1, '#9E4424');
  strokeFill(ctx, g, '#6B2A12', 0.055);
  // обод
  roundRectPath(ctx, -w / 2, -h / 2, w, 0.24, 0.05);
  strokeFill(ctx, '#E5835A', '#6B2A12', 0.055);
  ctx.fillStyle = 'rgba(255,220,190,0.35)';
  ctx.fillRect(-w / 2 + 0.06, -h / 2 + 0.04, w - 0.12, 0.05);
  // узор
  ctx.strokeStyle = 'rgba(255,230,200,0.55)';
  ctx.lineWidth = 0.035;
  ctx.beginPath();
  for (let i = 0; i <= 6; i++) {
    const x = -0.26 + i * 0.087;
    const y = 0.05 + (i % 2 ? 0.07 : 0);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  const dmg = 1 - Math.max(0, b.hp) / b.maxHp;
  if (dmg > 0.3) damageCracks(ctx, b, w * 0.7, h, 'rgba(60,20,5,0.9)');
}

// ---------- клубок ----------
const YARN = [['#FF8FB3', '#D9567F'], ['#7FB8F5', '#3F78C4'], ['#FFD166', '#D99A1E'], ['#A5E08A', '#5DA83F']];
function drawYarn(ctx, b) {
  const r = b.r;
  const [c1, c2] = YARN[b.v % YARN.length];
  const g = ctx.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.1, 0, 0, r * 1.1);
  g.addColorStop(0, shade(c1, 0.35));
  g.addColorStop(0.6, c1);
  g.addColorStop(1, c2);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  strokeFill(ctx, g, shade(c2, -0.4), 0.05);
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = shade(c2, -0.15);
  ctx.lineWidth = 0.035;
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.05, r * (0.25 + i * 0.16), 0.9 + i * 0.12, 0, TAU);
    ctx.stroke();
  }
  ctx.strokeStyle = shade(c1, 0.3);
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.ellipse(0, 0, r * (0.3 + i * 0.25), r * 1.05, -0.5, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
  // хвостик нитки
  ctx.beginPath();
  ctx.moveTo(r * 0.7, r * 0.7);
  ctx.bezierCurveTo(r * 1.2, r * 1.0, r * 1.1, r * 0.2, r * 1.5, r * 0.5);
  ctx.strokeStyle = c2;
  ctx.lineWidth = 0.04;
  ctx.lineCap = 'round';
  ctx.stroke();
}

export function drawBlock(ctx, b, t) {
  switch (b.type) {
    case 'box': drawBox(ctx, b); break;
    case 'crate': drawCrate(ctx, b); break;
    case 'plank': drawPlank(ctx, b); break;
    case 'brick': drawBrick(ctx, b); break;
    case 'pillow': drawPillow(ctx, b); break;
    case 'pot': drawPot(ctx, b, t); break;
    case 'yarn': drawYarn(ctx, b); break;
  }
  if (b.flash > 0 && b.type !== 'yarn') {
    ctx.globalAlpha = b.flash * 0.45;
    ctx.fillStyle = '#FFFFFF';
    if (b.type === 'pot') ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
    else {
      roundRectPath(ctx, -b.w / 2, -b.h / 2, b.w, b.h, 0.05);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

// ---------- рыбка ----------
export function drawFish(ctx, t, seed = 0, glow = true) {
  if (glow) {
    const pulse = 0.75 + Math.sin(t * 3 + seed) * 0.25;
    const g = ctx.createRadialGradient(0, 0, 0.05, 0, 0, 0.7);
    g.addColorStop(0, `rgba(255,250,200,${0.55 * pulse})`);
    g.addColorStop(1, 'rgba(255,250,200,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-0.7, -0.7, 1.4, 1.4);
  }
  ctx.lineJoin = 'round';
  // хвост
  ctx.beginPath();
  ctx.moveTo(-0.2, 0);
  ctx.lineTo(-0.38, -0.16);
  ctx.quadraticCurveTo(-0.32, 0, -0.38, 0.16);
  ctx.closePath();
  strokeFill(ctx, '#3E9BE0', '#1F5E96', 0.035);
  // тело
  const g = ctx.createLinearGradient(0, -0.15, 0, 0.15);
  g.addColorStop(0, '#6FD0FA');
  g.addColorStop(0.55, '#46A8E6');
  g.addColorStop(1, '#DDF4FF');
  ctx.beginPath();
  ctx.moveTo(-0.24, 0);
  ctx.bezierCurveTo(-0.1, -0.2, 0.22, -0.2, 0.34, 0);
  ctx.bezierCurveTo(0.22, 0.18, -0.1, 0.18, -0.24, 0);
  strokeFill(ctx, g, '#1F5E96', 0.035);
  // плавник
  ctx.beginPath();
  ctx.moveTo(-0.02, -0.12);
  ctx.quadraticCurveTo(0.06, -0.24, 0.14, -0.13);
  ctx.fillStyle = '#3E9BE0';
  ctx.fill();
  // жабра, глаз
  ctx.strokeStyle = '#1F5E96';
  ctx.lineWidth = 0.025;
  ctx.beginPath();
  ctx.arc(0.14, 0, 0.08, -1, 1);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0.24, -0.03, 0.035, 0, TAU);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0.25, -0.03, 0.02, 0, TAU);
  ctx.fillStyle = '#0B2540';
  ctx.fill();
  // блик-искра
  const s = (Math.sin(t * 2.2 + seed * 1.7) + 1) / 2;
  if (s > 0.8) {
    ctx.fillStyle = `rgba(255,255,255,${(s - 0.8) * 5})`;
    star(ctx, 0.02, -0.06, 0.1, 0.025, 4);
    ctx.fill();
  }
}

// ---------- катапульта ----------
// Рисуется в мировых метрах (y вверх уже развёрнут вызывающим: здесь y вниз от pivot).
export function drawLauncherBase(ctx, pivotH) {
  // треугольная опора как на рисунке — деревянная
  const hw = 0.95;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(hw, pivotH);
  ctx.lineTo(-hw, pivotH);
  ctx.closePath();
  const g = ctx.createLinearGradient(-hw, 0, hw, pivotH);
  g.addColorStop(0, '#C98A4E');
  g.addColorStop(1, '#8E5628');
  strokeFill(ctx, g, '#4E2C10', 0.07);
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = 'rgba(70,35,10,0.35)';
  ctx.lineWidth = 0.03;
  for (let y = 0.3; y < pivotH; y += 0.28) {
    ctx.beginPath();
    ctx.moveTo(-hw, y);
    ctx.lineTo(hw, y);
    ctx.stroke();
  }
  ctx.restore();
  // ось
  ctx.beginPath();
  ctx.arc(0, 0, 0.16, 0, TAU);
  strokeFill(ctx, '#8C8C94', '#3A3A40', 0.05);
  ctx.beginPath();
  ctx.arc(-0.04, -0.04, 0.05, 0, TAU);
  ctx.fillStyle = '#E4E4EA';
  ctx.fill();
}

export function drawLauncherPlank(ctx, halfLen) {
  // доска с чашкой слева и кольцом для верёвки справа (локально: ось в 0,0, y вниз)
  const h = 0.26;
  const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  g.addColorStop(0, '#E0A569');
  g.addColorStop(1, '#9E6230');
  roundRectPath(ctx, -halfLen, -h / 2, halfLen * 2, h, 0.08);
  strokeFill(ctx, g, '#4E2C10', 0.06);
  ctx.strokeStyle = 'rgba(80,40,10,0.35)';
  ctx.lineWidth = 0.025;
  ctx.beginPath();
  ctx.moveTo(-halfLen + 0.1, 0);
  ctx.lineTo(halfLen - 0.1, 0);
  ctx.stroke();
  // чашка-корзинка
  ctx.save();
  ctx.translate(-halfLen + 0.45, -h / 2);
  ctx.beginPath();
  ctx.moveTo(-0.5, 0);
  ctx.quadraticCurveTo(-0.55, -0.35, -0.62, -0.42);
  ctx.lineTo(-0.44, -0.42);
  ctx.quadraticCurveTo(-0.35, -0.12, 0, -0.1);
  ctx.quadraticCurveTo(0.35, -0.12, 0.44, -0.42);
  ctx.lineTo(0.62, -0.42);
  ctx.quadraticCurveTo(0.55, -0.35, 0.5, 0);
  ctx.closePath();
  strokeFill(ctx, '#D2493F', '#6E1A14', 0.05);
  ctx.restore();
  // кольцо
  ctx.beginPath();
  ctx.arc(halfLen - 0.18, -h / 2 - 0.08, 0.1, 0, TAU);
  ctx.strokeStyle = '#55555C';
  ctx.lineWidth = 0.05;
  ctx.stroke();
}
