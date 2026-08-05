import type { Rng } from '../rng';

/**
 * OIL RUSH — второй бонус: монеты падают на поле и держатся до конца.
 *
 * Правило одно и объясняется в строчку: упала хотя бы одна монета — счётчик
 * респинов снова полный. Кончился — всё, что лежит на поле, складывается
 * и выплачивается. Игрок при этом ни разу не гадает: видно и сколько клеток
 * осталось, и сколько попыток.
 *
 * Механика намеренно противоположна фриспинам. Там выигрыш собирается
 * множителем и может не собраться вовсе — раунд с ×18 на старте либо
 * выстреливает, либо кончается ничем. Здесь выплата растёт мелкими шагами
 * и почти всегда что-то приносит, зато потолок ниже. Выбор двери от этого
 * становится выбором характера, а не выбором правильного ответа: матожидание
 * у обоих подогнано друг к другу симулятором.
 *
 * ЕДИНИЦЫ: номиналы монет — в ОБЩИХ ставках (как цепи в OIL UP, в отличие
 * от таблицы выплат, которая в ставках на линию).
 */

// ─────────────────────────────────────────────────────────────
// Поле
// ─────────────────────────────────────────────────────────────

export const COIN_COLS = 5;

/**
 * Поле открывается не всё сразу: сперва три ряда, дальше по ходу дела.
 *
 * Так расширение работает наградой за то, что и так идёт хорошо, а не просто
 * размером экрана: шестая монета открывает четвёртый ряд, одиннадцатая — пятый.
 * Заодно это чинит главную беду жанра — на пустом поле в двадцать пять клеток
 * первые респины выглядят одинаково безнадёжно.
 */
export const COIN_ROWS_START = 3;
export const COIN_ROWS_MAX = 5;
export const COIN_UNLOCK_AT: readonly number[] = [6, 11];

export const COIN_CELLS = COIN_COLS * COIN_ROWS_MAX;

/** Монет на входе. Меньше четырёх — поле выглядит пустым и вход не читается. */
export const COIN_SEED = 5;

/** Респинов после каждой новой монеты. */
export const COIN_RESPINS = 3;

/**
 * Шанс монеты на КАЖДУЮ открытую пустую клетку за респин.
 *
 * Главная ручка всей фичи: ею подогнано матожидание под дверь FULL NELSON,
 * чтобы выбор бонуса не был выбором большего числа. Трогать только вместе
 * с прогоном симулятора — см. MATH.md §6.1.
 */
export const COIN_CHANCE = 0.0626;

// ─────────────────────────────────────────────────────────────
// Номиналы
// ─────────────────────────────────────────────────────────────

/**
 * Ступени монет. Различаются цветом металла, как и цепи в базовой игре:
 * бронза — серебро — золото — алмаз. Номинал движок пишет поверх спрайта,
 * потому что он зависит от ставки.
 */
export type CoinTier = 'bronze' | 'silver' | 'gold' | 'diamond';

export const COIN_VALUES: readonly { value: number; tier: CoinTier; weight: number }[] = [
  { value: 1, tier: 'bronze', weight: 340 },
  { value: 2, tier: 'bronze', weight: 220 },
  { value: 3, tier: 'bronze', weight: 120 },
  { value: 4, tier: 'bronze', weight: 70 },
  { value: 5, tier: 'silver', weight: 90 },
  { value: 10, tier: 'silver', weight: 50 },
  { value: 15, tier: 'silver', weight: 25 },
  { value: 20, tier: 'silver', weight: 15 },
  { value: 25, tier: 'gold', weight: 12 },
  { value: 50, tier: 'gold', weight: 5 },
  { value: 100, tier: 'gold', weight: 1.8 },
  { value: 150, tier: 'gold', weight: 0.8 },
  { value: 200, tier: 'diamond', weight: 0.2 },
  { value: 300, tier: 'diamond', weight: 0.08 },
  { value: 500, tier: 'diamond', weight: 0.02 },
];

const VALUE_TOTAL = COIN_VALUES.reduce((s, c) => s + c.weight, 0);

/**
 * Особые монеты, доли от всех выпадений. Их сумма обязана оставаться заметно
 * меньше единицы: каждая из трёх бьёт по итогу сильнее обычной монеты,
 * и на десятке процентов фича перестаёт быть про накопление.
 */
export const P_COLLECTOR = 0.015;
export const P_PUMP = 0.015;
export const P_MULT = 0.01;

/** Прибавка качка к случайной монете за респин. */
export const PUMP_MIN = 1;
export const PUMP_MAX = 6;

/** Награда за полностью закрытое поле, в общих ставках. */
export const FULL_BOARD_BONUS = 150;

export type CoinKind = 'coin' | 'collector' | 'pump' | 'mult';

export interface Coin {
  kind: CoinKind;
  /** Номинал в общих ставках. У качка и множителя — ноль, они не платят сами. */
  value: number;
  tier: CoinTier;
  /** Для 'mult' — на сколько множится итог. */
  mult: number;
}

export interface CoinDrop {
  /** Индекс клетки: row * COIN_COLS + col, сверху вниз, слева направо. */
  index: number;
  coin: Coin;
}

// ─────────────────────────────────────────────────────────────
// Розыгрыш
// ─────────────────────────────────────────────────────────────

function rollValue(rng: Rng): { value: number; tier: CoinTier } {
  let r = rng.next() * VALUE_TOTAL;
  for (const c of COIN_VALUES) {
    r -= c.weight;
    if (r < 0) return { value: c.value, tier: c.tier };
  }
  return { value: COIN_VALUES[0].value, tier: COIN_VALUES[0].tier };
}

function rollKind(rng: Rng): CoinKind {
  const r = rng.next();
  if (r < P_COLLECTOR) return 'collector';
  if (r < P_COLLECTOR + P_PUMP) return 'pump';
  if (r < P_COLLECTOR + P_PUMP + P_MULT) return 'mult';
  return 'coin';
}

export interface CoinBoard {
  /** COIN_CELLS ячеек; null — пусто. Клетки за пределами открытых рядов не заполняются. */
  cells: (Coin | null)[];
  rows: number;
  respinsLeft: number;
  /** Сколько монет уже упало — по нему открываются ряды. */
  count: number;
  /** Сколько качков на поле: каждый качает свою монету каждый респин. */
  pumps: number;
  /** Произведение всех выпавших множителей. */
  mult: number;
}

export function createCoinBoard(): CoinBoard {
  return {
    cells: new Array(COIN_CELLS).fill(null),
    rows: COIN_ROWS_START,
    respinsLeft: COIN_RESPINS,
    count: 0,
    pumps: 0,
    mult: 1,
  };
}

/** Сколько клеток сейчас открыто. */
export function openCells(board: CoinBoard): number {
  return board.rows * COIN_COLS;
}

/** Сумма номиналов на поле, без множителя и без награды за полное поле. */
export function boardSum(board: CoinBoard): number {
  let sum = 0;
  for (const cell of board.cells) if (cell) sum += cell.value;
  return sum;
}

export function isBoardFull(board: CoinBoard): boolean {
  if (board.rows < COIN_ROWS_MAX) return false;
  for (let i = 0; i < openCells(board); i++) if (!board.cells[i]) return false;
  return true;
}

/**
 * Кладёт монету в клетку и разбирается с её видом.
 * Возвращает то, что легло, — для лога событий.
 */
function place(board: CoinBoard, index: number, rng: Rng): CoinDrop {
  const kind = rollKind(rng);
  board.count++;

  let coin: Coin;
  switch (kind) {
    case 'pump':
      board.pumps++;
      coin = { kind, value: 0, tier: 'silver', mult: 1 };
      break;

    case 'mult': {
      // Двойка вчетверо чаще тройки: тройка должна оставаться событием.
      const mult = rng.next() < 0.75 ? 2 : 3;
      board.mult *= mult;
      coin = { kind, value: 0, tier: 'gold', mult };
      break;
    }

    case 'collector': {
      // Кулак VAN забирает всё, что лежит на поле, себе — ровно как в OIL UP.
      // Свой номинал у него тоже есть, иначе на пустом поле он пустышка.
      const own = rollValue(rng);
      coin = { kind, value: own.value + boardSum(board), tier: 'gold', mult: 1 };
      break;
    }

    default: {
      const rolled = rollValue(rng);
      coin = { kind, value: rolled.value, tier: rolled.tier, mult: 1 };
    }
  }

  board.cells[index] = coin;
  if (board.rows < COIN_ROWS_MAX && COIN_UNLOCK_AT.includes(board.count)) board.rows++;
  return { index, coin };
}

/** Свободные клетки среди открытых. */
function freeCells(board: CoinBoard): number[] {
  const free: number[] = [];
  for (let i = 0; i < openCells(board); i++) if (!board.cells[i]) free.push(i);
  return free;
}

/** Стартовая раздача: COIN_SEED монет по случайным клеткам. */
export function seedBoard(board: CoinBoard, rng: Rng): CoinDrop[] {
  const drops: CoinDrop[] = [];
  for (let n = 0; n < COIN_SEED; n++) {
    const free = freeCells(board);
    if (free.length === 0) break;
    drops.push(place(board, free[rng.int(free.length)], rng));
  }
  return drops;
}

/**
 * Один респин: монеты сыплются на открытые пустые клетки независимо друг
 * от друга. Порядок обхода клеток — сверху вниз: он важен для кулака,
 * который забирает поле в момент своего падения.
 */
export function dropCoins(board: CoinBoard, rng: Rng): CoinDrop[] {
  const drops: CoinDrop[] = [];
  for (let i = 0; i < openCells(board); i++) {
    if (board.cells[i]) continue;
    if (rng.chance(COIN_CHANCE)) drops.push(place(board, i, rng));
  }
  return drops;
}

export interface PumpTick {
  index: number;
  add: number;
}

/** Качки качают: каждый добавляет случайной платящей монете PUMP_MIN..PUMP_MAX. */
export function runPumps(board: CoinBoard, rng: Rng): PumpTick[] {
  if (board.pumps === 0) return [];

  const ticks: PumpTick[] = [];
  for (let p = 0; p < board.pumps; p++) {
    const targets: number[] = [];
    for (let i = 0; i < board.cells.length; i++) {
      const cell = board.cells[i];
      if (cell && cell.value > 0) targets.push(i);
    }
    if (targets.length === 0) break;

    const index = targets[rng.int(targets.length)];
    const add = PUMP_MIN + rng.int(PUMP_MAX - PUMP_MIN + 1);
    board.cells[index]!.value += add;
    ticks.push({ index, add });
  }
  return ticks;
}

/** Итог бонуса в общих ставках: сумма поля, награда за полное поле, множитель. */
export function coinPayout(board: CoinBoard): number {
  const full = isBoardFull(board);
  return (boardSum(board) + (full ? FULL_BOARD_BONUS : 0)) * board.mult;
}
