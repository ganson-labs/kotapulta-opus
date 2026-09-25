// Прогресс игрока в localStorage (из file:// тоже работает; при запрете — живём в памяти).
const KEY = 'kotapulta.progress.v1';

export class Progress {
  constructor() {
    this.data = { best: {}, seen: [], style: 'color' };
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) Object.assign(this.data, JSON.parse(raw));
    } catch (e) { /* приватный режим — ок */ }
  }

  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch (e) { /* ignore */ }
  }

  best(id) {
    return this.data.best[id] || null;
  }

  record(id, score, stars) {
    const b = this.data.best[id];
    const isNew = !b || score > b.score;
    this.data.best[id] = { score: Math.max(score, b ? b.score : 0), stars: Math.max(stars, b ? b.stars : 0) };
    this.save();
    return isNew;
  }

  unlocked(levels) {
    let n = 1;
    for (const l of levels) if (this.data.best[l.id]) n = Math.max(n, l.id + 1);
    return Math.min(n, levels.length);
  }

  totalStars() {
    return Object.values(this.data.best).reduce((s, b) => s + b.stars, 0);
  }

  seen(type) {
    return this.data.seen.includes(type);
  }

  markSeen(type) {
    if (!this.seen(type)) {
      this.data.seen.push(type);
      this.save();
    }
  }
}
