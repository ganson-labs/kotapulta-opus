// Сборка звуковой лаборатории: tools/audio-lab/lab.js → tools/audio-lab/lab.bundle.js (IIFE, работает из file://).
// Запуск: node tools/audio-lab/build.mjs
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export async function buildLab() {
  await build({
    entryPoints: [path.join(here, 'lab.js')],
    bundle: true,
    format: 'iife',
    target: 'es2020',
    outfile: path.join(here, 'lab.bundle.js'),
    logLevel: 'warning',
    legalComments: 'none',
    charset: 'utf8',
  });
  return path.join(here, 'lab.bundle.js');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildLab().then((f) => console.log('собрано:', f));
}
