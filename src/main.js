import { Game } from './game.js';

async function boot() {
  // Шрифты встроены в dist/fonts.css; ждём, чтобы холст сразу рисовал текст ими.
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load('900 40px "Rubik Variable"'),
        document.fonts.load('700 40px Caveat'),
      ]),
      new Promise((r) => setTimeout(r, 1500)),
    ]);
  } catch (e) { /* без шрифтов тоже играем */ }

  const game = new Game(document.getElementById('game'), document.getElementById('ui'));
  window.__game = game; // для автотестов и отладки

  let last = performance.now();
  const loop = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    game.frame(dt);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

boot();
