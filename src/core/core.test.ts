import { describe, expect, it } from 'vitest';
import { countScatters, evaluateLines, lineWinsTotal, scatterPay } from './evaluate';
import { beltTokenChance, BELT_MAX_P } from './features/beltCollection';
import { DOORS, roundMultiplier, startFreeSpins } from './features/freeSpins';
import { resolveCollect } from './features/moneyCollect';
import { absorbNewWilds, ageSticky, applySticky } from './features/stickyWilds';
import { PAYLINES } from './lines';
import { PAYTABLE } from './paytable';
import { REELS_BASE, REELS_FREE, WEIGHTS_BASE } from './reels';
import { createGameState, playRound } from './round';
import { createRng } from './rng';
import { drawGrid, spinOnce } from './spin';
import {
  LINES,
  MAX_WIN_X,
  REELS,
  ROWS,
  STICKY_MULT_LADDER,
  Sym,
  type Grid,
  type StickyWild,
  type SymId,
} from './types';

/** Собирает поле из построчной записи — так тест-кейсы читаются как экран игры. */
function gridFromRows(rows: SymId[][]): Grid {
  const grid: Grid = Array.from({ length: REELS }, () => new Array(ROWS).fill(Sym.DUMBBELL));
  for (let row = 0; row < rows.length; row++) {
    for (let reel = 0; reel < REELS; reel++) grid[reel][row] = rows[row][reel];
  }
  return grid;
}

const D = Sym.DUMBBELL;
const K = Sym.DUKE;
const W = Sym.WILD;
const S = Sym.SCATTER;
const C = Sym.CHAIN;
const F = Sym.FIST;
const R = Sym.REF;

describe('линии выплат', () => {
  it('20 линий, все в пределах поля', () => {
    expect(PAYLINES).toHaveLength(LINES);
    for (const line of PAYLINES) {
      expect(line).toHaveLength(REELS);
      for (const row of line) expect(row).toBeGreaterThanOrEqual(0), expect(row).toBeLessThan(ROWS);
    }
  });

  it('линии не дублируются', () => {
    const seen = new Set(PAYLINES.map((l) => l.join('')));
    expect(seen.size).toBe(LINES);
  });
});

describe('оценка выигрышей', () => {
  it('три DUKE слева платят по таблице', () => {
    // Линия 1 — второй ряд. Кладём три DUKE подряд, дальше рвём.
    const grid = gridFromRows([
      [D, D, D, D, D],
      [K, K, K, R, D],
      [D, D, D, D, D],
      [D, D, D, D, D],
    ]);
    const wins = evaluateLines(grid, [], true);
    const duke = wins.find((w) => w.sym === Sym.DUKE);
    expect(duke).toBeDefined();
    expect(duke!.count).toBe(3);
    expect(duke!.pay).toBe(PAYTABLE[Sym.DUKE][3]);
  });

  it('♂ замещает обычный символ', () => {
    const grid = gridFromRows([
      [D, D, D, D, D],
      [K, W, K, R, D],
      [D, D, D, D, D],
      [D, D, D, D, D],
    ]);
    const wins = evaluateLines(grid, [], true);
    const duke = wins.find((w) => w.sym === Sym.DUKE && w.count === 3);
    expect(duke).toBeDefined();
    expect(duke!.pay).toBe(PAYTABLE[Sym.DUKE][3]);
  });

  it('линия целиком из ♂ платит как лучший символ', () => {
    const grid = gridFromRows([
      [D, D, D, D, D],
      [W, W, W, W, W],
      [D, D, D, D, D],
      [D, D, D, D, D],
    ]);
    const wins = evaluateLines(grid, [], true);
    const five = wins.find((w) => w.count === 5 && w.line === 0);
    expect(five).toBeDefined();
    expect(five!.pay).toBe(PAYTABLE[Sym.DUKE][5]);
  });

  it('scatter обрывает линию', () => {
    const grid = gridFromRows([
      [D, D, D, D, D],
      [K, K, S, K, K],
      [D, D, D, D, D],
      [D, D, D, D, D],
    ]);
    const wins = evaluateLines(grid, [], true);
    // Два DUKE до scatter'а — меньше трёх, значит по этой линии ничего.
    expect(wins.find((w) => w.line === 0 && w.sym === Sym.DUKE)).toBeUndefined();
  });

  it('выигрыш считается только слева направо', () => {
    // Три DUKE прижаты к правому краю — не платят.
    const grid = gridFromRows([
      [D, D, D, D, D],
      [R, R, K, K, K],
      [D, D, D, D, D],
      [D, D, D, D, D],
    ]);
    const wins = evaluateLines(grid, [], true);
    expect(wins.find((w) => w.sym === Sym.DUKE)).toBeUndefined();
  });

  it('множители липких ♂ перемножаются по линии', () => {
    const grid = gridFromRows([
      [D, D, D, D, D],
      [K, W, W, R, D],
      [D, D, D, D, D],
      [D, D, D, D, D],
    ]);
    const sticky: StickyWild[] = [
      { reel: 1, row: 1, mult: 2, age: 1 },
      { reel: 2, row: 1, mult: 3, age: 2 },
    ];
    const wins = evaluateLines(grid, sticky, true);
    const duke = wins.find((w) => w.sym === Sym.DUKE && w.count === 3);
    expect(duke!.mult).toBe(6);
    expect(duke!.pay).toBe(PAYTABLE[Sym.DUKE][3] * 6);
  });

  it('во фриспинах множители липких не применяются к линии', () => {
    const grid = gridFromRows([
      [D, D, D, D, D],
      [K, W, W, R, D],
      [D, D, D, D, D],
      [D, D, D, D, D],
    ]);
    const sticky: StickyWild[] = [
      { reel: 1, row: 1, mult: 2, age: 1 },
      { reel: 2, row: 1, mult: 3, age: 2 },
    ];
    const wins = evaluateLines(grid, sticky, false);
    const duke = wins.find((w) => w.sym === Sym.DUKE && w.count === 3);
    expect(duke!.mult).toBe(1);
  });

  it('scatter считается по всему полю независимо от позиций', () => {
    const grid = gridFromRows([
      [S, D, D, D, S],
      [D, D, S, D, D],
      [D, S, D, D, D],
      [D, D, D, S, D],
    ]);
    expect(countScatters(grid)).toBe(5);
    expect(scatterPay(5)).toBeGreaterThan(scatterPay(3));
  });

  it('линейные выплаты переводятся из ставки на линию в общую', () => {
    const wins = [{ line: 0, sym: Sym.DUKE, count: 3, pay: LINES, mult: 1, positions: [] }];
    expect(lineWinsTotal(wins)).toBe(1);
  });
});

describe('липкие ♂', () => {
  it('в спине появления ♂ работает с ×1', () => {
    const sticky: StickyWild[] = [];
    const grid = gridFromRows([
      [D, D, D, D, D],
      [D, W, D, D, D],
      [D, D, D, D, D],
      [D, D, D, D, D],
    ]);
    absorbNewWilds(grid, sticky);
    expect(sticky).toHaveLength(1);
    expect(sticky[0].mult).toBe(1);
  });

  it('множитель растёт по лестнице и упирается в потолок', () => {
    let sticky: StickyWild[] = [{ reel: 2, row: 1, mult: 1, age: 0 }];
    const seen: number[] = [];
    for (let i = 0; i < 3; i++) {
      sticky = ageSticky(sticky, 'free');
      if (sticky.length) seen.push(sticky[0].mult);
    }
    expect(seen[0]).toBe(STICKY_MULT_LADDER[1]);
    expect(seen[1]).toBe(STICKY_MULT_LADDER[2]);
    // Во фриспинах ♂ не исчезает и дальше держит верхнюю ступень.
    expect(seen[2]).toBe(STICKY_MULT_LADDER[STICKY_MULT_LADDER.length - 1]);
  });

  it('в базовой игре ♂ уходит, отработав лестницу', () => {
    let sticky: StickyWild[] = [{ reel: 2, row: 1, mult: 1, age: 0 }];
    for (let i = 0; i < STICKY_MULT_LADDER.length - 1; i++) sticky = ageSticky(sticky, 'base');
    expect(sticky).toHaveLength(1);
    sticky = ageSticky(sticky, 'base');
    expect(sticky).toHaveLength(0);
  });

  it('липкий ♂ впечатывается в новую сетку', () => {
    const grid = gridFromRows([
      [D, D, D, D, D],
      [D, D, R, D, D],
      [D, D, D, D, D],
      [D, D, D, D, D],
    ]);
    applySticky(grid, [{ reel: 2, row: 1, mult: 2, age: 1 }]);
    expect(grid[2][1]).toBe(Sym.WILD);
  });

  it('уже липкая позиция не дублируется', () => {
    const sticky: StickyWild[] = [{ reel: 2, row: 1, mult: 3, age: 2 }];
    const grid = gridFromRows([
      [D, D, D, D, D],
      [D, D, W, D, D],
      [D, D, D, D, D],
      [D, D, D, D, D],
    ]);
    absorbNewWilds(grid, sticky);
    expect(sticky).toHaveLength(1);
    expect(sticky[0].mult).toBe(3);
  });
});

describe('цепи и сборщик', () => {
  const rng = createRng(777);

  it('без кулака цепи не выплачиваются, но номиналы видны', () => {
    const grid = gridFromRows([
      [C, D, C, D, D],
      [D, D, D, D, D],
      [D, D, D, D, D],
      [D, D, D, D, D],
    ]);
    const collect = resolveCollect(grid, rng);
    expect(collect).not.toBeNull();
    expect(collect!.chains).toHaveLength(2);
    expect(collect!.total).toBe(0);
  });

  it('кулак забирает все цепи на поле', () => {
    const grid = gridFromRows([
      [C, D, C, D, F],
      [D, D, D, D, D],
      [D, D, D, D, D],
      [D, D, D, D, D],
    ]);
    const collect = resolveCollect(grid, rng)!;
    const sum = collect.chains.reduce((s, c) => s + c.value, 0);
    expect(collect.fists).toHaveLength(1);
    expect(collect.total).toBe(sum);
  });

  it('два кулака удваивают сбор', () => {
    const grid = gridFromRows([
      [C, D, C, D, F],
      [D, D, D, D, F],
      [D, D, D, D, D],
      [D, D, D, D, D],
    ]);
    const collect = resolveCollect(grid, rng)!;
    const sum = collect.chains.reduce((s, c) => s + c.value, 0);
    expect(collect.total).toBe(sum * 2);
  });

  it('без цепей сбора нет', () => {
    const grid = gridFromRows([
      [D, D, D, D, F],
      [D, D, D, D, D],
      [D, D, D, D, D],
      [D, D, D, D, D],
    ]);
    expect(resolveCollect(grid, rng)).toBeNull();
  });
});

describe('фриспины', () => {
  it('множитель раунда = стартовый плюс по +1 за липкий ♂', () => {
    const fs = startFreeSpins('SUBMISSION', [
      { reel: 1, row: 0, mult: 3, age: 2 },
      { reel: 2, row: 1, mult: 1, age: 0 },
    ]);
    expect(roundMultiplier(fs)).toBe(fs.door.startMult + 2);
  });

  it('липкие ♂ из базовой игры переезжают в раунд', () => {
    const carried: StickyWild[] = [{ reel: 1, row: 0, mult: 2, age: 1 }];
    const fs = startFreeSpins('ARM_WRESTLE', carried);
    expect(fs.sticky).toHaveLength(1);
    // Копия, а не ссылка: раунд не должен править состояние базовой игры.
    fs.sticky[0].mult = 99;
    expect(carried[0].mult).toBe(2);
  });

  it('у всех дверей заданы спины и множитель', () => {
    expect(DOORS).toHaveLength(3);
    for (const d of DOORS) {
      expect(d.spins).toBeGreaterThan(0);
      expect(d.startMult).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('накопитель жетонов', () => {
  it('шанс растёт с сухой полосой и упирается в потолок', () => {
    expect(beltTokenChance(10)).toBeGreaterThan(beltTokenChance(0));
    expect(beltTokenChance(10_000)).toBe(BELT_MAX_P);
  });
});

describe('ленты', () => {
  it('лента длиннее видимого окна', () => {
    for (const strip of [...REELS_BASE, ...REELS_FREE]) {
      expect(strip.length).toBeGreaterThan(ROWS);
    }
  });

  it('♂ не встречается на крайних барабанах', () => {
    for (const reels of [REELS_BASE, REELS_FREE]) {
      expect(reels[0].includes(Sym.WILD)).toBe(false);
      expect(reels[REELS - 1].includes(Sym.WILD)).toBe(false);
    }
  });

  it('кулак живёт только на пятом барабане', () => {
    for (const reels of [REELS_BASE, REELS_FREE]) {
      for (let r = 0; r < REELS - 1; r++) expect(reels[r].includes(Sym.FIST)).toBe(false);
      expect(reels[REELS - 1].includes(Sym.FIST)).toBe(true);
    }
  });

  it('состав ленты точно соответствует таблице весов', () => {
    for (let reel = 0; reel < REELS; reel++) {
      const counts = new Map<number, number>();
      for (const s of REELS_BASE[reel]) counts.set(s, (counts.get(s) ?? 0) + 1);
      for (let sym = 0; sym < WEIGHTS_BASE[reel].length; sym++) {
        expect(counts.get(sym) ?? 0).toBe(WEIGHTS_BASE[reel][sym]);
      }
    }
  });
});

describe('генерация поля', () => {
  it('размер поля всегда 5×4', () => {
    const rng = createRng(1);
    for (let i = 0; i < 100; i++) {
      const grid = drawGrid(rng, REELS_BASE);
      expect(grid).toHaveLength(REELS);
      for (const col of grid) expect(col).toHaveLength(ROWS);
    }
  });
});

describe('раунд', () => {
  it('одинаковый seed даёт одинаковый результат', () => {
    const run = () => {
      const rng = createRng(42);
      const state = createGameState();
      const wins: number[] = [];
      for (let i = 0; i < 500; i++) wins.push(playRound({ rng, state, door: 'SUBMISSION' }).win);
      return wins;
    };
    expect(run()).toEqual(run());
  });

  it('выигрыш никогда не превышает потолок', () => {
    const rng = createRng(9001);
    const state = createGameState();
    for (let i = 0; i < 20000; i++) {
      expect(playRound({ rng, state, door: 'random' }).win).toBeLessThanOrEqual(MAX_WIN_X);
    }
  });

  it('покупка бонуса всегда запускает фриспины', () => {
    const rng = createRng(5);
    const state = createGameState();
    for (let i = 0; i < 200; i++) {
      const r = playRound({ rng, state, door: 'FULL_NELSON', buy: true });
      expect(r.enteredFree).toBe(true);
      expect(r.freeSpinsPlayed).toBeGreaterThanOrEqual(DOORS[2].spins);
      expect(r.cost).toBeGreaterThan(1);
    }
  });

  it('после фриспинов поле очищается от липких ♂', () => {
    const rng = createRng(11);
    const state = createGameState();
    const r = playRound({ rng, state, door: 'ARM_WRESTLE', buy: true });
    expect(r.enteredFree).toBe(true);
    expect(state.sticky).toHaveLength(0);
  });

  it('разбивка по источникам сходится с общим выигрышем', () => {
    const rng = createRng(2024);
    const state = createGameState();
    for (let i = 0; i < 5000; i++) {
      const r = playRound({ rng, state, door: 'random' });
      if (r.capped) continue;
      const parts = r.lineWin + r.scatterWin + r.chainWin + r.beltWin;
      expect(parts).toBeCloseTo(r.win, 6);
    }
  });
});

describe('спин', () => {
  it('множитель раунда поднимает линии, но не трогает цепи', () => {
    // Один и тот же seed даёт одно и то же поле, поэтому разница в результате
    // объясняется только множителем. Цепи обязаны остаться прежними: иначе
    // редкий крупный сбор на высоком множителе улетал бы за потолок.
    const plain = spinOnce({ rng: createRng(3), kind: 'free', sticky: [], roundMult: 1 });
    const boosted = spinOnce({ rng: createRng(3), kind: 'free', sticky: [], roundMult: 10 });

    expect(boosted.grid).toEqual(plain.grid);
    expect(boosted.collect?.total ?? 0).toBe(plain.collect?.total ?? 0);

    const plainLines = lineWinsTotal(plain.lineWins);
    if (plainLines > 0) {
      expect(boosted.totalWin - (boosted.collect?.total ?? 0) - boosted.scatterPay).toBeCloseTo(
        plainLines * 10,
        6,
      );
    }
  });
});
