import { createRng } from './rng';
import { REELS, ROWS, SYM_COUNT, Sym, type SymId } from './types';

/**
 * Ленты барабанов.
 *
 * Ленты не выписаны символ за символом, а собираются из таблицы весов.
 * Это осознанный выбор: RTP настраивается именно частотами, и править
 * одно число в таблице несравнимо удобнее, чем переставлять сотню элементов
 * в литерале — а ошибиться при этом почти невозможно.
 *
 * Длина ленты 100 выбрана не случайно: вес символа сразу читается как проценты,
 * и это даёт нужную точность на редких событиях (scatter, кулак).
 */

/**
 * Веса символов по барабанам для базовой игры.
 *
 * Суммы колонок специально НЕ обязаны быть одинаковыми: длина ленты равна
 * сумме её весов, вероятность символа — его доля. Требование «ровно 100»
 * ничего не давало математике, зато заставляло вручную пересчитывать
 * всю колонку при правке одного числа — и дважды приводило к опечатке.
 * Держать их около сотни всё же удобно: вес тогда читается как проценты.
 */
export const WEIGHTS_BASE: readonly (readonly number[])[] = buildWeightTable('base', [
  // барабан:            1   2   3   4   5
  [Sym.DUMBBELL,        15, 14, 14, 14, 15],
  [Sym.WRISTBAND,       14, 13, 13, 13, 14],
  [Sym.HARNESS,         13, 13, 12, 13, 13],
  [Sym.OIL,             12, 12, 12, 12, 12],
  [Sym.SHAKER,          11, 11, 11, 11, 11],
  [Sym.ROOKIE,           9,  9,  9,  9,  9],
  [Sym.REF,              8,  8,  8,  8,  8],
  [Sym.CHAMPION,         6,  6,  6,  6,  5],
  [Sym.DUKE,             5,  4,  4,  4,  4],
  // ♂ живёт только на трёх центральных барабанах.
  // На крайних он ломал математику: wild на первом барабане превращает линию
  // в почти гарантированный выигрыш, а два подряд — в гарантированный,
  // и никакая настройка выплат этого уже не компенсирует.
  [Sym.WILD,             0,  2,  3,  2,  0],
  [Sym.SCATTER,          2,  2,  2,  2,  2],
  [Sym.CHAIN,            5,  6,  6,  6,  6],
  // Кулак живёт только на пятом барабане. Это даёт то самое напряжение
  // «цепи набрались, придёт ли сборщик» ровно в момент остановки последнего барабана.
  [Sym.FIST,             0,  0,  0,  0,  1],
]);

/**
 * Веса для фриспинов (DUNGEON RUN).
 * Больше ♂ — фича построена на липких wild'ах, и их дефицит убил бы весь раунд.
 * Больше цепей и кулаков, меньше scatter'ов (они здесь только ретриггерят).
 */
export const WEIGHTS_FREE: readonly (readonly number[])[] = buildWeightTable('free', [
  // барабан:            1   2   3   4   5
  [Sym.DUMBBELL,        12, 12, 12, 12, 12],
  [Sym.WRISTBAND,       12, 12, 11, 12, 12],
  [Sym.HARNESS,         11, 11, 11, 11, 11],
  [Sym.OIL,             11, 11, 11, 11, 11],
  [Sym.SHAKER,          10, 10, 10, 10, 10],
  [Sym.ROOKIE,           9,  9,  9,  9,  9],
  [Sym.REF,              8,  8,  8,  8,  8],
  [Sym.CHAMPION,         6,  6,  6,  6,  6],
  [Sym.DUKE,             5,  5,  5,  5,  4],
  // ♂ во фриспинах не чаще, чем в базе. Здесь они не исчезают до конца раунда,
  // и каждый лишний ♂ бьёт дважды: усиливает линии и поднимает множитель.
  // При вчетверо большей частоте фриспины давали втрое больше RTP, чем вся
  // остальная игра вместе взятая.
  [Sym.WILD,             0,  2,  3,  2,  0],
  [Sym.SCATTER,          1,  1,  1,  1,  1],
  [Sym.CHAIN,           12, 11, 11, 11, 12],
  [Sym.FIST,             0,  0,  0,  0,  1],
]);

/** Разворачивает удобную для чтения построчную таблицу в [reel][sym]. */
function buildWeightTable(name: string, rows: readonly (readonly number[])[]): number[][] {
  const table: number[][] = Array.from({ length: REELS }, () => new Array(SYM_COUNT).fill(0));
  for (const row of rows) {
    const sym = row[0];
    for (let reel = 0; reel < REELS; reel++) {
      table[reel][sym] = row[reel + 1];
    }
  }
  for (let reel = 0; reel < REELS; reel++) {
    const sum = table[reel].reduce((a, b) => a + b, 0);
    // Лента короче поля означала бы, что окно видит один и тот же символ дважды.
    if (sum < ROWS * 2) {
      throw new Error(`Ленты «${name}», барабан ${reel + 1}: сумма весов ${sum} слишком мала`);
    }
  }
  return table;
}

/** Длины получившихся лент — печатает симулятор в справке. */
export function stripLengths(weights: readonly (readonly number[])[]): number[] {
  return weights.map((w) => w.reduce((a, b) => a + b, 0));
}

/**
 * Раскладывает символы по ленте согласно весам.
 *
 * Одинаковые символы разводятся по соседним позициям: на поле видно 4 ряда сразу,
 * и случайная стопка из четырёх DUKE подряд превратилась бы в выигрыш,
 * которого нет в расчётах. Полностью убрать соседство при высоких весах нельзя,
 * поэтому проход разводит то, что разводится, и оставляет остальное.
 */
function buildStrip(weights: readonly number[], seed: number): SymId[] {
  const strip: SymId[] = [];
  for (let sym = 0; sym < SYM_COUNT; sym++) {
    for (let i = 0; i < weights[sym]; i++) strip.push(sym as SymId);
  }

  // Детерминированное перемешивание: ленты обязаны быть одинаковыми
  // в игре, в тестах и в симуляторе, иначе цифры RTP ничего не значат.
  const rng = createRng(seed);
  for (let i = strip.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [strip[i], strip[j]] = [strip[j], strip[i]];
  }

  // Разведение соседних дубликатов. Лента кольцевая, поэтому последний элемент
  // сравнивается с первым.
  const n = strip.length;
  for (let pass = 0; pass < 4; pass++) {
    let swapped = false;
    for (let i = 0; i < n; i++) {
      if (strip[i] !== strip[(i + 1) % n]) continue;
      for (let k = 2; k < n; k++) {
        const j = (i + k) % n;
        const prev = strip[(j - 1 + n) % n];
        const next = strip[(j + 1) % n];
        if (strip[j] !== strip[i] && prev !== strip[i] && next !== strip[i]) {
          [strip[(i + 1) % n], strip[j]] = [strip[j], strip[(i + 1) % n]];
          swapped = true;
          break;
        }
      }
    }
    if (!swapped) break;
  }

  return strip;
}

/** Набор из пяти лент. */
export type ReelSet = readonly SymId[][];

function buildSet(weights: readonly (readonly number[])[], seedBase: number): ReelSet {
  return weights.map((w, reel) => buildStrip(w, seedBase + reel * 7919));
}

// Seed'ы зафиксированы намеренно — ленты должны быть неизменными между запусками.
export const REELS_BASE: ReelSet = buildSet(WEIGHTS_BASE, 0x9e3779b1);
export const REELS_FREE: ReelSet = buildSet(WEIGHTS_FREE, 0x85ebca6b);
