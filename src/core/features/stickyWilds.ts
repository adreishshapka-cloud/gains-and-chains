import {
  REELS,
  ROWS,
  STICKY_MULT_LADDER,
  Sym,
  type Grid,
  type SpinKind,
  type StickyWild,
} from '../types';

/**
 * ♂ STICKY GAINS.
 *
 * Порядок операций внутри спина критичен и легко ломается при рефакторинге:
 *
 *   1. ageSticky      — состарить липкие с прошлого спина (множитель растёт ЗДЕСЬ)
 *   2. applySticky    — впечатать их в свежую сетку поверх выпавшего
 *   3. evaluateLines  — посчитать выигрыш
 *   4. absorbNewWilds — новые ♂ становятся липкими с множителем ×1
 *
 * Из-за такого порядка ♂ в спине своего появления играет с ×1, а растёт
 * только со следующего — ровно как описано в дизайне.
 */

/**
 * Старение липких ♂. В базовой игре ♂ живёт четыре спина (×1 → ×2 → ×3 → ×5)
 * и уходит; во фриспинах остаётся до конца раунда, упёршись в ×5.
 */
export function ageSticky(prev: readonly StickyWild[], kind: SpinKind): StickyWild[] {
  const out: StickyWild[] = [];
  const top = STICKY_MULT_LADDER.length - 1;

  for (const s of prev) {
    const age = s.age + 1;
    if (kind === 'base' && age > top) continue; // отработал свои четыре спина
    out.push({
      reel: s.reel,
      row: s.row,
      age: Math.min(age, top),
      mult: STICKY_MULT_LADDER[Math.min(age, top)],
    });
  }
  return out;
}

/** Впечатывает липкие ♂ в сетку поверх того, что выпало. */
export function applySticky(grid: Grid, sticky: readonly StickyWild[]): void {
  for (const s of sticky) grid[s.reel][s.row] = Sym.WILD;
}

/** Свежевыпавшие ♂ становятся липкими с множителем ×1. */
export function absorbNewWilds(grid: Grid, sticky: StickyWild[]): StickyWild[] {
  const occupied = new Set<number>();
  for (const s of sticky) occupied.add(s.reel * ROWS + s.row);

  for (let reel = 0; reel < REELS; reel++) {
    for (let row = 0; row < ROWS; row++) {
      if (grid[reel][row] !== Sym.WILD) continue;
      const key = reel * ROWS + row;
      if (occupied.has(key)) continue;
      occupied.add(key);
      sticky.push({ reel, row, age: 0, mult: STICKY_MULT_LADDER[0] });
    }
  }
  return sticky;
}

/** Сумма множителей липких ♂ — так их складывают фриспины. */
export function stickyMultSum(sticky: readonly StickyWild[]): number {
  let sum = 0;
  for (const s of sticky) sum += s.mult;
  return sum;
}
