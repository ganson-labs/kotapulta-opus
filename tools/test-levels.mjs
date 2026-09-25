// Автотест уровней без браузера:
//  1) устойчивость — разбуженная физика 8 секунд не должна ничего ронять и будить;
//  2) проходимость — перебором углов и силы ищем, что уровень проходится
//     не больше чем за отведённое число котов (жадно, выстрел за выстрелом).
// Запуск: node tools/test-levels.mjs [номер уровня] [--quick]
import { Level } from '../src/level.js';
import { LEVELS } from '../src/levels.js';
import { CAT_TYPES } from '../src/config.js';

const args = process.argv.slice(2);
const only = args.find((a) => /^\d+$/.test(a));
const quick = args.includes('--quick');
const verbose = args.includes('-v');

function drain(level) {
  level.events.length = 0;
}

function stability(def) {
  const lv = new Level(def);
  const start = new Map();
  for (const b of lv.blocks) start.set(b, { ...b.body.getPosition(), a: b.body.getAngle() });
  for (let b = lv.world.getBodyList(); b; b = b.getNext()) if (b.isDynamic()) b.setAwake(true);
  let maxMove = 0, worst = null;
  for (let i = 0; i < 60 * 8; i++) lv.step();
  for (const b of lv.blocks) {
    if (!b.body) { maxMove = Infinity; worst = b; continue; }
    const s = start.get(b), p = b.body.getPosition();
    const m = Math.hypot(p.x - s.x, p.y - s.y) + Math.abs(b.body.getAngle() - s.a);
    if (m > maxMove) { maxMove = m; worst = b; }
  }
  const woke = lv.sleepers.filter((s) => s.awake).length;
  const ok = maxMove < 0.12 && woke === 0 && lv.fishGot === 0;
  return { ok, maxMove: +maxMove.toFixed(3), woke, fish: lv.fishGot, worst: worst && `${worst.type}@${worst.body ? worst.body.getPosition().x.toFixed(1) : 'gone'}` };
}

// Прогон выстрела; ability: null | число секунд после запуска | 'x:<м>' — когда кот пересечёт x.
function shoot(lv, angle, power, ability) {
  const cat = lv.launch(angle, power);
  if (!cat) return false;
  let used = false;
  for (let i = 0; i < 60 * 25; i++) {
    lv.step();
    if (!used && ability != null && cat.body) {
      const t = lv.time - cat.t0;
      const p = cat.body.getPosition();
      if ((typeof ability === 'number' && t >= ability) || (typeof ability === 'string' && p.x >= +ability.slice(2))) {
        lv.ability();
        used = true;
      }
    }
    drain(lv);
    if (lv.state !== 'fly' && lv.state !== 'settle') break;
  }
  return true;
}

function replay(def, shots) {
  const lv = new Level(def);
  for (const s of shots) shoot(lv, s.angle, s.power, s.ability);
  return lv;
}

function abilityOptions(def, type, sleeperXs) {
  const ab = CAT_TYPES[type].ability;
  if (!ab) return [null];
  if (ab === 'pound') return [null, ...sleeperXs.map((x) => `x:${(x - 0.6).toFixed(1)}`)];
  return [null, 0.35, 0.6, 0.9];
}

function solve(def) {
  const shots = [];
  let lv = replay(def, shots);
  const angles = [];
  for (let a = -0.2; a <= 1.3; a += quick ? 0.1 : 0.05) angles.push(+a.toFixed(3));
  const powers = [];
  for (let p = 0.35; p <= 1.0001; p += quick ? 0.1 : 0.05) powers.push(+p.toFixed(3));
  const log = [];
  while (lv.state === 'aim') {
    const type = lv.loaded;
    const sx = lv.sleepers.filter((s) => !s.awake).map((s) => s.body.getPosition().x);
    const opts = abilityOptions(def, type, sx);
    let best = null, wins = 0, tried = 0;
    for (const angle of angles)
      for (const power of powers)
        for (const ability of opts) {
          const t = replay(def, [...shots, { angle, power, ability }]);
          tried++;
          const woke = t.sleepers.filter((s) => s.awake).length;
          if (t.state === 'win') wins++;
          const key = woke * 1e7 + t.score;
          if (!best || key > best.key) best = { key, angle, power, ability, woke, score: t.score, state: t.state };
        }
    shots.push({ angle: best.angle, power: best.power, ability: best.ability });
    log.push(`${type}: a=${best.angle} p=${best.power}${best.ability != null ? ' ab=' + best.ability : ''} → проснулось ${best.woke}/${def.objects.filter((o) => o.t === 'sleeper').length}, очки ${best.score}, побед ${wins}/${tried}`);
    lv = replay(def, shots);
  }
  return { won: lv.state === 'win', shots: shots.length, score: lv.score, max: lv.maxScore, stars: lv.stars(), log };
}

let failed = 0;
for (const def of LEVELS) {
  if (only && def.id !== +only) continue;
  const t0 = Date.now();
  const st = stability(def);
  const sol = solve(def);
  const ms = Date.now() - t0;
  const ok = st.ok && sol.won;
  if (!ok) failed++;
  console.log(`${ok ? 'OK ' : 'FAIL'} #${def.id} «${def.name}»  устойчивость: ${st.ok ? 'да' : 'НЕТ'} (сдвиг ${st.maxMove}, ${st.worst}, проснулось ${st.woke}, рыб ${st.fish})  ` +
    `прохождение: ${sol.won ? 'да' : 'НЕТ'} за ${sol.shots}/${def.cats.length}, очки ${sol.score}/${sol.max} ★${sol.stars}  [${ms} мс]`);
  if (verbose || !ok) for (const l of sol.log) console.log('     ' + l);
}
process.exit(failed ? 1 : 0);
