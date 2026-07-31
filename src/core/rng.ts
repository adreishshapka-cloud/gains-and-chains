/**
 * Генератор случайных чисел.
 *
 * Два режима, и оба обязательны:
 *  - боевой  — crypto.getRandomValues, непредсказуемый;
 *  - seeded  — mulberry32, полностью воспроизводимый.
 *
 * Seed-режим нужен не для читерства, а для отладки: баг, который выстреливает
 * раз в десять тысяч спинов, без воспроизведения не ловится никогда.
 * Симулятор тоже гоняет seeded — иначе два прогона не сравнить между собой.
 */

export interface Rng {
  /** [0, 1) */
  next(): number;
  /** Целое из [0, max) */
  int(max: number): number;
  /** true с вероятностью p */
  chance(p: number): boolean;
  /** Случайный элемент массива */
  pick<T>(arr: readonly T[]): T;
}

/** Быстрый детерминированный PRNG. Период 2^32, для слота с запасом. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Криптографический источник с буферизацией — по одному вызову было бы медленно. */
function cryptoSource(): () => number {
  const BUF = 1024;
  const buf = new Uint32Array(BUF);
  let i = BUF;
  return function () {
    if (i >= BUF) {
      crypto.getRandomValues(buf);
      i = 0;
    }
    return buf[i++] / 4294967296;
  };
}

function wrap(next: () => number): Rng {
  return {
    next,
    int: (max) => Math.floor(next() * max),
    chance: (p) => next() < p,
    pick: (arr) => arr[Math.floor(next() * arr.length)],
  };
}

/**
 * @param seed если задан — детерминированный режим, иначе crypto.
 */
export function createRng(seed?: number): Rng {
  return wrap(seed === undefined ? cryptoSource() : mulberry32(seed));
}
