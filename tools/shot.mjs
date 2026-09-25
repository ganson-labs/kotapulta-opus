// Снимки игры в настоящем Chrome (headless) для визуальной проверки.
// node tools/shot.mjs <папка> [сценарий] [--w 1600 --h 900]
// Сценарии описаны ниже; каждый шаг — действие и/или снимок. Ошибки консоли печатаются.
import puppeteer from 'puppeteer-core';
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const outDir = path.resolve(args[0] || path.join(root, '.shots'));
const scenario = args[1] && !args[1].startsWith('--') ? args[1] : 'basic';
const opt = (k, d) => {
  const i = args.indexOf('--' + k);
  return i >= 0 ? args[i + 1] : d;
};
const W = +opt('w', 1600), H = +opt('h', 900);
fs.mkdirSync(outDir, { recursive: true });

const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required', '--allow-file-access-from-files', `--window-size=${W},${H}`],
  defaultViewport: { width: W, height: H, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`);
});
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
await page.goto(pathToFileURL(path.join(root, 'index.html')).href);
await page.waitForFunction('window.__game', { timeout: 10000 });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let n = 0;
const shot = async (name) => {
  const f = path.join(outDir, `${String(++n).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: f });
  console.log('снимок', f);
};
const ev = (fn, ...a) => page.evaluate(fn, ...a);

// Прицел мышью: от кота назад на (dx, dy) пикселей.
async function aimDrag(dx, dy, release = true) {
  const p = await ev(() => {
    const g = window.__game;
    const c = g.loadedPos();
    return g.cam.toScreen(c.x, c.y);
  });
  await page.mouse.move(p[0], p[1]);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(p[0] + (dx * i) / 10, p[1] + (dy * i) / 10);
    await sleep(16);
  }
  if (release) await page.mouse.up();
}

const waitState = (s, ms = 20000) => page.waitForFunction((s) => window.__game.level && s.split('|').includes(window.__game.level.state) && !window.__game.reload, { timeout: ms }, s);

const scenarios = {
  async basic() {
    await sleep(1200);
    await shot('title');
    await page.click('[data-a="play"]');
    await sleep(700);
    await shot('wipe');
    await sleep(2600);
    await shot('level-intro');
    await ev(() => { window.__game.intro = null; });
    await sleep(1500);
    await shot('aim-ready');
    await aimDrag(-150, 95, false);
    await sleep(300);
    await shot('aiming');
    await page.mouse.up();
    await sleep(450);
    await shot('flying');
    await sleep(700);
    await shot('impact');
    await sleep(1500);
    await shot('after');
    await waitState('aim|win|lose');
    await sleep(1500);
    await shot('settled');
    await ev(() => window.__game.toggleStyle());
    await sleep(550);
    await shot('wipe-to-sketch');
    await sleep(900);
    await shot('sketch');
  },
  async level() {
    const idx = +opt('level', 1) - 1;
    const style = opt('style', 'color');
    await ev((idx, style) => {
      const g = window.__game;
      g.style = style;
      g.ui.setSketch(style === 'sketch');
      g.startLevel(idx);
      g.intro = null;
    }, idx, style);
    await sleep(2200);
    await shot(`level${idx + 1}-${style}`);
  },
  async levels() {
    const style = opt('style', 'color');
    for (const idx of opt('list', '3,6,7,9,10,11').split(',').map((v) => +v - 1)) {
      await ev((idx, style) => {
        const g = window.__game;
        g.style = style;
        g.ui.setSketch(style === 'sketch');
        g.startLevel(idx);
        g.intro = null;
        g.ui.hint(null);
      }, idx, style);
      await sleep(2600);
      await shot(`level${idx + 1}-${style}`);
    }
  },
  async ability() {
    const idx = +opt('level', 4) - 1;
    const a = +opt('a', 0.1), p = +opt('p', 0.65), abt = +opt('abt', 0.6);
    const style = opt('style', 'color');
    await ev((idx, style) => {
      const g = window.__game;
      g.style = style;
      g.ui.setSketch(style === 'sketch');
      g.startLevel(idx);
      g.intro = null;
      g.ui.hint(null);
      document.querySelector('.catslot').innerHTML = '';
    }, idx, style);
    await sleep(1200);
    await ev((a, p) => window.__game.fire(a, p), a, p);
    await sleep(abt * 1000 + 75);
    await ev(() => window.__game.level.ability());
    for (let i = 0; i < 6; i++) {
      await sleep(i < 4 ? 130 : 500);
      await shot(`ab${i}`);
    }
  },
  async menus() {
    await ev(() => {
      const g = window.__game;
      g.style = 'color';
      g.ui.setSketch(false);
      g.startLevel(2);
      g.intro = null;
    });
    await sleep(800);
    for (let i = 0; i < 3; i++) {
      await page.waitForFunction(() => window.__game.canAim(), { timeout: 20000 });
      await ev(() => window.__game.fire(1.3, 0.2));
      await sleep(500);
    }
    await waitState('lose', 30000);
    await sleep(2200);
    await shot('lose');
    await page.click('#result [data-a="levels"]');
    await sleep(600);
    await shot('levels');
    await page.click('#levels .lv[data-i="0"]');
    await sleep(1500);
    await page.keyboard.press('Escape');
    await sleep(500);
    await shot('pause');
  },
  async perf() {
    const idx = +opt('level', 11) - 1;
    const style = opt('style', 'color');
    await ev((idx, style) => {
      const g = window.__game;
      g.style = style;
      g.ui.setSketch(style === 'sketch');
      g.startLevel(idx);
      g.intro = null;
    }, idx, style);
    await sleep(1000);
    await ev(() => window.__game.fire(0.3, 0.9));
    await sleep(900);
    const r = await ev(() => {
      const g = window.__game;
      const times = [];
      for (let i = 0; i < 90; i++) {
        const t0 = performance.now();
        g.frame(1 / 60);
        times.push(performance.now() - t0);
      }
      times.sort((a, b) => a - b);
      return { med: times[45].toFixed(2), p95: times[85].toFixed(2), max: times[89].toFixed(2), bodies: g.level.world.getBodyCount(), particles: g.fx.list.length };
    });
    console.log('кадр, мс:', JSON.stringify(r));
    await shot('perf');
  },
  async win() {
    // прогон решения из автотеста: угол/сила
    const idx = +opt('level', 1) - 1;
    const a = +opt('a', 0.2), p = +opt('p', 0.95);
    await ev((idx) => {
      const g = window.__game;
      g.style = 'color';
      g.ui.setSketch(false);
      g.startLevel(idx);
      g.intro = null;
    }, idx);
    await sleep(1500);
    await ev((a, p) => window.__game.fire(a, p), a, p);
    for (let i = 0; i < 6; i++) {
      await sleep(i < 3 ? 350 : 700);
      await shot(`w${i}`);
    }
    await waitState('win|lose', 30000);
    await sleep(900);
    await shot('bonus');
    await sleep(3000);
    await shot('result');
  },
};

try {
  await scenarios[scenario]();
} catch (e) {
  console.log('ОШИБКА сценария:', e.message);
  await shot('error');
}
console.log(errors.length ? 'Консоль:\n' + errors.join('\n') : 'Ошибок в консоли нет');
await browser.close();
