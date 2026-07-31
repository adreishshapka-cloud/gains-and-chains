import { CHAIN_VALUES, CHAIN_WEIGHT_TOTAL } from '../paytable';
import type { Rng } from '../rng';
import { REELS, ROWS, Sym, type CollectWin, type Grid, type Pos } from '../types';

/**
 * OIL UP — золотые цепи и сборщик.
 *
 * Цепи копятся в пределах одного спина: если на экране есть кулак, он забирает
 * все видимые цепи разом. Кулак живёт только на пятом барабане, поэтому
 * развязка всегда приходится на остановку последнего барабана — это и есть
 * главный источник напряжения в базовой игре.
 *
 * Несколько кулаков умножают сбор: 4 кулака на пятом барабане — редчайший
 * случай, но именно из таких и складывается верхний хвост распределения.
 */

/** Разыгрывает номинал одной цепи, в общих ставках. */
export function rollChainValue(rng: Rng): number {
  let r = rng.next() * CHAIN_WEIGHT_TOTAL;
  for (const c of CHAIN_VALUES) {
    r -= c.weight;
    if (r < 0) return c.value;
  }
  return CHAIN_VALUES[0].value;
}

/**
 * Находит цепи и кулаки на поле и считает сбор.
 * Номиналы разыгрываются всегда — они показываются на цепях и без кулака,
 * иначе игрок не увидит, что именно он упустил.
 */
export function resolveCollect(grid: Grid, rng: Rng): CollectWin | null {
  const chains: { pos: Pos; value: number }[] = [];
  const fists: Pos[] = [];

  for (let reel = 0; reel < REELS; reel++) {
    for (let row = 0; row < ROWS; row++) {
      const s = grid[reel][row];
      if (s === Sym.CHAIN) chains.push({ pos: { reel, row }, value: rollChainValue(rng) });
      else if (s === Sym.FIST) fists.push({ reel, row });
    }
  }

  if (chains.length === 0) return null;

  let total = 0;
  if (fists.length > 0) {
    for (const c of chains) total += c.value;
    total *= fists.length;
  }

  return { fists, chains, total };
}
