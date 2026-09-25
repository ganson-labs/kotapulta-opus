// Камера: центр (x, y) в метрах и масштаб z (CSS-пикселей на метр).
// Земля всегда у нижнего края экрана: y выводится из масштаба.
import { damp, clamp } from './util.js';

export class Camera {
  constructor() {
    this.x = 20;
    this.y = 8;
    this.z = 40;
    this.W = 1280;
    this.H = 720;
    this.dpr = 1;
    this.zRef = 40;
    this.tx = 20;
    this.tz = 40;
    this.sx = 0;
    this.sy = 0;
    this.shake = 0;
    this.minX = -10;
    this.maxX = 60;
  }

  resize(W, H, dpr) {
    this.W = W;
    this.H = H;
    this.dpr = dpr;
    this.zRef = H / 17;
  }

  margin() {
    return this.H * 0.085;
  }

  groundY() {
    return this.H / 2 + this.y * this.z + this.sy;
  }

  // Масштаб, при котором по вертикали видно height метров над землёй.
  zForHeight(h) {
    return (this.H - this.margin()) / h;
  }

  zForWidth(w) {
    return this.W / w;
  }

  toScreen(x, y) {
    return [(x - this.x) * this.z + this.W / 2 + this.sx, this.H / 2 - (y - this.y) * this.z + this.sy];
  }

  toWorld(sx, sy) {
    return [(sx - this.W / 2 - this.sx) / this.z + this.x, (this.H / 2 + this.sy - sy) / this.z + this.y];
  }

  apply(ctx) {
    const d = this.dpr, z = this.z;
    ctx.setTransform(d * z, 0, 0, -d * z, d * (this.W / 2 - this.x * z + this.sx), d * (this.H / 2 + this.y * z + this.sy));
  }

  screen(ctx) {
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  target(x, z) {
    this.tx = x;
    this.tz = z;
  }

  clampX(x, z) {
    const half = this.W / 2 / z;
    const lo = this.minX + half, hi = this.maxX - half;
    return lo > hi ? (this.minX + this.maxX) / 2 : clamp(x, lo, hi);
  }

  snap() {
    this.z = this.tz;
    this.x = this.clampX(this.tx, this.z);
    this.y = (this.H / 2 - this.margin()) / this.z;
  }

  addShake(m) {
    this.shake = Math.min(1.2, this.shake + m);
  }

  update(dt, speed = 4) {
    this.z = Math.exp(damp(Math.log(this.z), Math.log(this.tz), speed, dt));
    this.x = damp(this.x, this.clampX(this.tx, this.z), speed, dt);
    this.x = this.clampX(this.x, this.z);
    this.y = (this.H / 2 - this.margin()) / this.z;
    this.shake = Math.max(0, this.shake - dt * 2.2);
    const s = this.shake * this.shake * 18;
    this.sx = (Math.random() - 0.5) * s;
    this.sy = (Math.random() - 0.5) * s;
  }
}
