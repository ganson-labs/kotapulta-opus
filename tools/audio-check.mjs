// Автопроверка звукового модуля в headless Chrome:
//  1) все методы API с обычными и «кривыми» аргументами до и после unlock() — без ошибок;
//  2) офлайн-рендер каждого звука и музыки: пик < 1.0 (без клиппинга), RMS заметно выше тишины;
//  3) 5-минутная сессия: число живых голосов не растёт.
// Запуск: node tools/audio-check.mjs [--only <подстрока>] [--no-session] [--wav <папка>]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';
import { buildLab } from './audio-lab/build.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const only = opt('--only');
const wavDir = opt('--wav');
const noSession = argv.includes('--no-session');

const CHROME = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((p) => p && fs.existsSync(p));
if (!CHROME) {
  console.error('Не найден Chrome/Edge. Укажите CHROME_PATH.');
  process.exit(2);
}

await buildLab();
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  protocolTimeout: 900000,
  args: ['--autoplay-policy=no-user-gesture-required', '--enable-precise-memory-info', '--no-first-run'],
});
const page = await browser.newPage();
const problems = [];
const warnings = [];
page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error') problems.push('console.error: ' + m.text());
  else if (m.type() === 'warning' || m.type() === 'warn') warnings.push(m.text());
});
await page.goto(pathToFileURL(path.join(here, 'audio-lab.html')).href);
await page.waitForFunction(() => !!window.labTests);

let ok = true;
const fail = (msg) => {
  ok = false;
  console.log('  ✗ ' + msg);
};

// 1. API
console.log('\n== 1. API (реальный AudioContext) ==');
const smoke = await page.evaluate(() => window.labTests.apiSmoke());
for (const n of smoke.notes) console.log('  · ' + n);
for (const e of smoke.errors) fail(e);
if (!smoke.errors.length) console.log('  ✓ все методы отработали без исключений');

// 1b. Мастер-цепочка прозрачна для обычных уровней
const cg = await page.evaluate(() => window.labTests.chainGain());
console.log('\n== 1b. Усиление мастер-цепочки (синус, дБ относительно обхода компрессора) ==');
console.log('  ' + cg.map((x) => `амплитуда ${x.amp}: ${x.dB > 0 ? '+' : ''}${x.dB} дБ`).join('; '));
for (const x of cg) if (x.amp <= 0.2 && Math.abs(x.dB) > 1) fail(`цепочка меняет тихий сигнал на ${x.dB} дБ — пересчитайте TRIM_COMP/TRIM_LIM`);

// 2. Замеры
console.log('\n== 2. Офлайн-рендер: пик (после мастер-цепочки), RMS активной части, «сырой» пик до компрессора ==');
const t0 = Date.now();
const rows = await page.evaluate((f) => window.labTests.measureAll(f), only || null);
const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);
console.log('  ' + pad('звук', 42) + lpad('пик', 7) + lpad('пик дБ', 8) + lpad('RMS дБ', 8) + lpad('макс50мс', 9) + lpad('сек', 6) + lpad('сырой', 7));
for (const r of rows) {
  const quietOk = r.name === 'ui hover' || r.name === 'tick' ? -60 : -45;
  const bad = r.peak >= 1 || r.rmsDb < quietOk || r.err;
  console.log(
    (bad ? '✗ ' : '  ') + pad(r.name, 42) + lpad(r.peak, 7) + lpad(r.peakDb, 8) + lpad(r.rmsDb, 8) + lpad(r.maxWinDb, 9) + lpad(r.activeSec, 6) + lpad(r.rawPeak, 7)
  );
  if (r.seg2s) console.log('      RMS по 2 с: ' + r.seg2s);
  if (r.peak >= 1) fail(r.name + ': клиппинг, пик ' + r.peak);
  if (r.rmsDb < quietOk) fail(r.name + ': слишком тихо, RMS ' + r.rmsDb + ' дБ');
  if (r.err) fail(r.name + ': ' + r.err);
}
console.log(`  (${rows.length} рендеров за ${((Date.now() - t0) / 1000).toFixed(1)} с)`);

// 3. Сессия
if (!noSession && !only) {
  console.log('\n== 3. 5-минутная сессия (офлайн, 24 кГц): живые голоса по времени ==');
  const s = await page.evaluate(() => window.labTests.session(5));
  console.log('  вызовов:', JSON.stringify(s.calls));
  console.log('  рендер:', s.renderMs, 'мс; аудио:', JSON.stringify(s.audio));
  const line = s.samples.filter((x, i) => i % 3 === 0).map((x) => `${x.t}s:${x.voices}`).join(' ');
  console.log('  голоса (каждые 30 с):', line);
  console.log(`  макс. голосов: ${s.maxVoices} (музыка ${s.maxMusic}), макс. плееров: ${s.maxPlayers}, создано всего: ${s.end.created}, в конце живых: ${s.end.voices}`);
  if (s.heapMB) console.log('  JS heap, МБ (до → после):', s.heapMB.join(' → '));
  const firstHalf = Math.max(...s.samples.filter((x) => x.t < 150).map((x) => x.voices));
  const secondHalf = Math.max(...s.samples.filter((x) => x.t >= 150).map((x) => x.voices));
  console.log(`  макс. голосов в 1-й половине: ${firstHalf}, во 2-й: ${secondHalf}`);
  if (s.maxVoices > 250 || secondHalf > firstHalf * 1.5 + 20) fail('число голосов растёт: ' + firstHalf + ' → ' + secondHalf);
  if (s.audio.peak >= 1) fail('клиппинг в сессии: ' + s.audio.peak);
  if (s.end.lastError) fail('lastError в сессии: ' + s.end.lastError);
}

// WAV для прослушивания
if (wavDir) {
  fs.mkdirSync(wavDir, { recursive: true });
  const w = await page.evaluate((f) => window.labTests.wavs(f), only || null);
  for (const { name, b64 } of w) {
    fs.writeFileSync(path.join(wavDir, name.replace(/[^\w.-]+/g, '_') + '.wav'), Buffer.from(b64, 'base64'));
  }
  console.log(`\nWAV: ${w.length} файлов → ${wavDir}`);
}

await browser.close();

console.log('\n== Консоль браузера ==');
if (problems.length) problems.forEach((p) => fail(p));
else console.log('  ✓ ошибок нет');
if (warnings.length) console.log('  предупреждений: ' + warnings.length + '\n    ' + [...new Set(warnings)].slice(0, 8).join('\n    '));

console.log(ok ? '\nИТОГ: OK' : '\nИТОГ: ЕСТЬ ПРОБЛЕМЫ');
process.exit(ok ? 0 : 1);
