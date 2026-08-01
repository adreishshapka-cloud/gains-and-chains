import { PAYTABLE, SCATTER_PAY } from './paytable';
import {
  isSpecial,
  LINES,
  REELS,
  ROWS,
  Sym,
  type Grid,
  type LineWin,
  type Pos,
  type StickyWild,
  type SymId,
} from './types';
import { PAYLINES } from './lines';

/**
 * Подсчёт выигрыша по видимому полю.
 *
 * Правила линии:
 *  - считаем слева направо, только с первого барабана, минимум 3 подряд;
 *  - ♂ замещает любой обычный символ;
 *  - scatter, цепь и кулак линию обрывают — они живут по своим правилам;
 *  - линия целиком из ♂ платит как лучший обычный символ (это VAN, ключ Sym.DUKE).
 */

/** Наибольшая выплата за пять символов среди обычных — для линии из одних ♂. */
const BEST_FIVE_SYM: SymId = (() => {
  let best: SymId = Sym.DUKE;
  let bestPay = -1;
  for (let s = 0; s <= Sym.DUKE; s++) {
    const pay = PAYTABLE[s as SymId][5];
    if (pay > bestPay) {
      bestPay = pay;
      best = s as SymId;
    }
  }
  return best;
})();

/** Карта множителей липких ♂ по позициям. Отсутствие липкого = 1. */
function stickyMultMap(sticky: readonly StickyWild[]): number[][] {
  const map: number[][] = Array.from({ length: REELS }, () => new Array(ROWS).fill(1));
  for (const s of sticky) map[s.reel][s.row] = s.mult;
  return map;
}

/**
 * @param applyStickyMult в базовой игре множители липких ♂ перемножаются по линии;
 *        во фриспинах они вместо этого суммируются в общий множитель раунда,
 *        поэтому там линии считаются «чистыми».
 */
export function evaluateLines(
  grid: Grid,
  sticky: readonly StickyWild[],
  applyStickyMult: boolean,
): LineWin[] {
  const multMap = applyStickyMult ? stickyMultMap(sticky) : null;
  const wins: LineWin[] = [];

  for (let li = 0; li < LINES; li++) {
    const line = PAYLINES[li];

    let base: SymId | null = null;
    let count = 0;

    for (let reel = 0; reel < REELS; reel++) {
      const s = grid[reel][line[reel]];

      if (s === Sym.WILD) {
        count++;
        continue;
      }
      if (isSpecial(s)) break;
      if (base === null) {
        base = s;
        count++;
        continue;
      }
      if (s === base) {
        count++;
        continue;
      }
      break;
    }

    if (count < 3) continue;

    // Линия целиком из ♂ — платим как лучший обычный символ.
    const paySym: SymId = base ?? BEST_FIVE_SYM;
    const basePay = PAYTABLE[paySym][count];
    if (basePay <= 0) continue;

    const positions: Pos[] = [];
    let mult = 1;
    for (let reel = 0; reel < count; reel++) {
      const row = line[reel];
      positions.push({ reel, row });
      if (multMap) mult *= multMap[reel][row];
    }

    wins.push({ line: li, sym: paySym, count, pay: basePay * mult, mult, positions });
  }

  return wins;
}

/** Scatter'ы считаются по всему полю, положение не важно. */
export function countScatters(grid: Grid): number {
  let n = 0;
  for (let reel = 0; reel < REELS; reel++) {
    for (let row = 0; row < ROWS; row++) {
      if (grid[reel][row] === Sym.SCATTER) n++;
    }
  }
  return n;
}

/** Выплата за scatter'ы, в общих ставках. */
export function scatterPay(count: number): number {
  return count < SCATTER_PAY.length ? SCATTER_PAY[count] : SCATTER_PAY[SCATTER_PAY.length - 1];
}

/** Сумма линейных выигрышей, переведённая из ставок на линию в общие ставки. */
export function lineWinsTotal(wins: readonly LineWin[]): number {
  let sum = 0;
  for (const w of wins) sum += w.pay;
  return sum / LINES;
}
