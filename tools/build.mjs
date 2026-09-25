// Сборка игры: src/main.js -> dist/game.js (IIFE, работает из file://)
// и шрифты -> dist/fonts.css (base64, чтобы не зависеть от сети и CORS).
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dist = path.join(root, 'dist');
const watch = process.argv.includes('--watch');
fs.mkdirSync(dist, { recursive: true });

function inlineFonts(cssFile, keepSubsets) {
  const dir = path.dirname(cssFile);
  const css = fs.readFileSync(cssFile, 'utf8');
  const blocks = css.split('/* ').slice(1);
  let out = '';
  for (const block of blocks) {
    const subset = block.slice(0, block.indexOf(' */'));
    if (!keepSubsets.some((s) => subset.includes(`-${s}-`))) continue;
    const face = block.slice(block.indexOf('@font-face'));
    const woff2 = face.match(/url\(\.\/(files\/[^)]+\.woff2)\)/)[1];
    const data = fs.readFileSync(path.join(dir, woff2)).toString('base64');
    out += face.replace(/src:[^;]+;/, `src: url(data:font/woff2;base64,${data}) format('woff2');`) + '\n';
  }
  return out;
}

const fontCss =
  inlineFonts(path.join(root, 'node_modules/@fontsource-variable/rubik/index.css'), ['cyrillic', 'latin']) +
  inlineFonts(path.join(root, 'node_modules/@fontsource/caveat/700.css'), ['cyrillic', 'latin']);
fs.writeFileSync(path.join(dist, 'fonts.css'), fontCss);

const options = {
  entryPoints: [path.join(root, 'src/main.js')],
  bundle: true,
  format: 'iife',
  target: 'es2020',
  outfile: path.join(dist, 'game.js'),
  minify: !watch,
  sourcemap: watch ? 'inline' : false,
  legalComments: 'none',
  logLevel: 'info',
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log('Слежу за src/ …');
} else {
  await esbuild.build(options);
}
