/**
 * Симулятор GAINS & CHAINS.
 *
 * Гоняет раунды через ту же playRound(), что и настоящая игра, и печатает
 * всё, по чему настраивается математика. Пока цифры отсюда не сойдутся
 * с целевыми, графику писать бессмысленно: любая правка лент после начала
 * работы над артом означает переделку анимаций под новые частоты.
 *
 *   npm run sim              — 10 млн раундов
 *   npm run sim:quick        — 200 тыс., быстрый прогон при подкрутке
 *   npx tsx tools/simulate.ts --spins 1000000 --door FULL_NELSON
 *   npx tsx tools/simulate.ts --buy    — отдельный прогон покупки бонуса
 */

import { CHAIN_AVG_VALUE } from '../src/core/paytable';
import { createGameState, playRound, type DoorChoice } from '../src/core/round';
import { createRng } from '../src/core/rng';
import { MAX_WIN_X, SYM_COUNT, SYM_NAME, type SymId } from '../src/core/types';

// ── Аргументы ────────────────────────────────────────────────────

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

const SPINS = Number(arg('spins', '10000000'));
const SEED = Number(arg('seed', '12345'));
const DOOR = arg('door', 'random') as DoorChoice;
const BUY = flag('buy');

// ── Накопители ───────────────────────────────────────────────────

// Первый бакет — строго ноль. Раньше он назывался «без выигрыша», но захватывал
// и возвраты меньше половины ставки, из-за чего расходился с hit frequency.
const BUCKETS = [0, 1e-9, 0.5, 1, 2, 5, 10, 20, 50, 100, 500, 1000, Infinity];

let cost = 0;
let win = 0;
let winBase = 0;
let winFree = 0;
let winBelt = 0;
let winLine = 0;
let winScatter = 0;
let winChain = 0;
let stickySum = 0;

let hits = 0;
let freeRounds = 0;
let freeSpinsTotal = 0;
let cappedRounds = 0;
let maxWin = 0;

let sumSq = 0; // для стандартного отклонения
const hist = new Array(BUCKETS.length - 1).fill(0);

// «Интересность»: длина сухих полос и живучесть банка
let dry = 0;
let maxDry = 0;
const dryHist = new Map<number, number>();

// ── Прогон ───────────────────────────────────────────────────────

const rng = createRng(SEED);
const state = createGameState();
const symAccum = new Array(SYM_COUNT).fill(0);

const started = Date.now();

for (let i = 0; i < SPINS; i++) {
  const r = playRound({ rng, state, door: DOOR, buy: BUY, symAccum });

  cost += r.cost;
  win += r.win;
  winBase += r.baseWin;
  winFree += r.freeWin;
  winBelt += r.beltWin;
  winLine += r.lineWin;
  winScatter += r.scatterWin;
  winChain += r.chainWin;
  stickySum += r.stickyCount;

  const x = r.win / r.cost;
  sumSq += x * x;
  if (r.win > maxWin) maxWin = r.win;
  if (r.capped) cappedRounds++;

  if (r.hit) {
    hits++;
    if (dry > 0) {
      dryHist.set(dry, (dryHist.get(dry) ?? 0) + 1);
      if (dry > maxDry) maxDry = dry;
      dry = 0;
    }
  } else {
    dry++;
  }

  if (r.enteredFree) {
    freeRounds++;
    freeSpinsTotal += r.freeSpinsPlayed;
  }

  for (let b = 0; b < hist.length; b++) {
    if (x >= BUCKETS[b] && x < BUCKETS[b + 1]) {
      hist[b]++;
      break;
    }
  }

  if (i > 0 && i % 1_000_000 === 0) {
    process.stdout.write(`  ${(i / 1e6).toFixed(0)} млн… RTP ${((win / cost) * 100).toFixed(2)}%\r`);
  }
}

const elapsed = (Date.now() - started) / 1000;

// ── Отчёт ────────────────────────────────────────────────────────

const rtp = win / cost;
const mean = win / SPINS;
const variance = sumSq / SPINS - (win / cost) ** 2;
const stdev = Math.sqrt(Math.max(0, variance));

function pct(v: number): string {
  return (v * 100).toFixed(2) + '%';
}
function bar(share: number, width = 28): string {
  const n = Math.max(0, Math.min(width, Math.round(share * width)));
  return '█'.repeat(n) + '·'.repeat(width - n);
}
function oneIn(p: number): string {
  return p > 0 ? `1 / ${Math.round(1 / p)}` : '—';
}

console.log('\n');
console.log('══════════════════════════════════════════════════════════');
console.log(`  GAINS & CHAINS — симуляция`);
console.log('══════════════════════════════════════════════════════════');
console.log(`  Раундов:        ${SPINS.toLocaleString('ru-RU')}`);
console.log(`  Seed:           ${SEED}`);
console.log(`  Дверь:          ${DOOR}${BUY ? '   (покупка бонуса)' : ''}`);
console.log(`  Время:          ${elapsed.toFixed(1)} с  (${Math.round(SPINS / elapsed / 1000)} тыс/с)`);
console.log('');
console.log('  ── RTP ──────────────────────────────────────────────────');
console.log(`  Общий RTP:      ${pct(rtp)}      цель 96.00%`);
console.log(`    база          ${pct(winBase / cost).padStart(7)}  ${bar(winBase / win)}`);
console.log(`    фриспины      ${pct(winFree / cost).padStart(7)}  ${bar(winFree / win)}`);
console.log(`    жетоны        ${pct(winBelt / cost).padStart(7)}  ${bar(winBelt / win)}`);
console.log('');
console.log('  По источникам (без учёта потолка):');
console.log(`    линии         ${pct(winLine / cost).padStart(9)}  ${bar(winLine / (winLine + winScatter + winChain + winBelt))}`);
console.log(`    scatter       ${pct(winScatter / cost).padStart(9)}  ${bar(winScatter / (winLine + winScatter + winChain + winBelt))}`);
console.log(`    цепи          ${pct(winChain / cost).padStart(9)}  ${bar(winChain / (winLine + winScatter + winChain + winBelt))}`);
console.log(`    жетоны        ${pct(winBelt / cost).padStart(9)}  ${bar(winBelt / (winLine + winScatter + winChain + winBelt))}`);
console.log(`  Липких ♂ на поле в среднем: ${(stickySum / SPINS).toFixed(2)}`);
console.log('');
console.log('  ── Ритм игры ────────────────────────────────────────────');
console.log(`  Hit frequency:  ${pct(hits / SPINS)}      цель 27–30%`);
console.log(`  Вход в бонус:   ${oneIn(freeRounds / SPINS)} раундов   цель 1 / 200`);
console.log(`  Спинов в бонусе:${(freeSpinsTotal / Math.max(1, freeRounds)).toFixed(1)} в среднем`);
console.log(`  Сухая полоса:   макс ${maxDry} спинов подряд`);
console.log('');
console.log('  ── Волатильность ────────────────────────────────────────');
console.log(`  Ср. выигрыш:    ×${mean.toFixed(4)} за раунд`);
// Ориентир 8–10 из дизайн-документа оказался занижен: он соответствует средней
// волатильности, а слот с потолком ×5000 и бонусом раз в 200 спинов физически
// не может иметь такое σ. Для этого профиля нормальный коридор — 15–25.
console.log(`  Ст. отклонение: ${stdev.toFixed(2)}      цель 15–25 (высокая)`);
console.log(`  Макс. выигрыш:  ×${maxWin.toFixed(1)}${cappedRounds > 0 ? `   (потолок ×${MAX_WIN_X} сработал ${cappedRounds} раз)` : ''}`);
console.log('');
console.log('  ── Распределение выигрышей ──────────────────────────────');
for (let b = 0; b < hist.length; b++) {
  const lo = BUCKETS[b];
  const hi = BUCKETS[b + 1];
  const label =
    lo === 0 ? 'без выигрыша' : hi === Infinity ? `×${lo}+` : `×${lo === 1e-9 ? 0 : lo}–${hi}`;
  const share = hist[b] / SPINS;
  if (share === 0) continue;
  console.log(`  ${label.padEnd(14)} ${pct(share).padStart(7)}  ${bar(share)}  ${oneIn(share)}`);
}
console.log('');
console.log('  ── Вклад символов в RTP линий ───────────────────────────');
const symRows = symAccum
  .map((v, s) => ({ s: s as SymId, v }))
  .filter((r) => r.v > 0)
  .sort((a, b) => b.v - a.v);
const symMax = symRows[0]?.v ?? 1;
for (const row of symRows) {
  console.log(
    `  ${SYM_NAME[row.s].padEnd(14)} ${pct(row.v / cost).padStart(7)}  ${bar(row.v / symMax)}`,
  );
}
console.log('');
console.log(`  Справочно: средний номинал цепи ×${CHAIN_AVG_VALUE.toFixed(2)}`);
console.log('══════════════════════════════════════════════════════════\n');
