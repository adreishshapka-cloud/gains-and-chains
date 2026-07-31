import { countScatters, evaluateLines, lineWinsTotal, scatterPay } from './evaluate';
import { rollBeltToken, type BeltState } from './features/beltCollection';
import { resolveCollect } from './features/moneyCollect';
import { absorbNewWilds, ageSticky, applySticky } from './features/stickyWilds';
import { SCATTER_TRIGGER } from './paytable';
import { REELS_BASE, REELS_FREE, type ReelSet } from './reels';
import type { Rng } from './rng';
import {
  REELS,
  ROWS,
  type Grid,
  type SpinKind,
  type SpinResult,
  type StickyWild,
  type SymId,
} from './types';

/** Снимает видимое окно с лент: по случайной позиции на каждом барабане. */
export function drawGrid(rng: Rng, reels: ReelSet): Grid {
  const grid: Grid = new Array(REELS);
  for (let reel = 0; reel < REELS; reel++) {
    const strip = reels[reel];
    const len = strip.length;
    const start = rng.int(len);
    const col: SymId[] = new Array(ROWS);
    for (let row = 0; row < ROWS; row++) col[row] = strip[(start + row) % len];
    grid[reel] = col;
  }
  return grid;
}

export interface SpinOptions {
  rng: Rng;
  kind: SpinKind;
  /** Липкие ♂ с предыдущего спина. Массив не мутируется. */
  sticky: readonly StickyWild[];
  /** Множитель раунда фриспинов. В базовой игре игнорируется. */
  roundMult?: number;
  /** Накопитель жетонов. Разыгрывается только в базовой игре. */
  belt?: BeltState;
}

/**
 * Один спин целиком.
 *
 * Порядок операций здесь — не стилистика, а часть мат-модели.
 * Липкие стареют ДО оценки, новые ♂ поглощаются ПОСЛЕ неё: только так
 * ♂ играет с ×1 в спине своего появления.
 */
export function spinOnce(o: SpinOptions): SpinResult {
  const { rng, kind } = o;
  const isFree = kind === 'free';

  const grid = drawGrid(rng, isFree ? REELS_FREE : REELS_BASE);

  const sticky = ageSticky(o.sticky, kind);
  applySticky(grid, sticky);

  // В базовой игре множители липких перемножаются по линии.
  // Во фриспинах их роль берёт на себя общий множитель раунда.
  const lineWins = evaluateLines(grid, sticky, !isFree);
  const scatterCount = countScatters(grid);
  const sPay = scatterPay(scatterCount);
  const collect = resolveCollect(grid, rng);

  absorbNewWilds(grid, sticky);

  const roundMult = isFree ? (o.roundMult ?? 1) : 1;
  const linePart = lineWinsTotal(lineWins) * roundMult;
  const totalWin = linePart + sPay + (collect?.total ?? 0);

  const beltToken = !isFree && o.belt ? rollBeltToken(o.belt, rng) : false;

  return {
    kind,
    grid,
    lineWins,
    scatterCount,
    scatterPay: sPay,
    collect,
    sticky,
    totalWin,
    triggeredFreeSpins: !isFree && scatterCount >= SCATTER_TRIGGER,
    beltToken,
  };
}
