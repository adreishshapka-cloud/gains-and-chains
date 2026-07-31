/**
 * Базовые типы мат-модели GAINS & CHAINS.
 *
 * Правило слоя core: здесь нет ни одного импорта из game/ или ui/.
 * Всё, что лежит в core, должно уметь крутиться миллионы раз в консоли без графики.
 */

/** Идентификаторы символов. Числа, а не строки — симулятор гоняет их миллионами. */
export const Sym = {
  DUMBBELL: 0,
  WRISTBAND: 1,
  HARNESS: 2,
  OIL: 3,
  SHAKER: 4,
  ROOKIE: 5,
  REF: 6,
  CHAMPION: 7,
  DUKE: 8,
  WILD: 9,
  SCATTER: 10,
  CHAIN: 11,
  FIST: 12,
} as const;

export type SymId = (typeof Sym)[keyof typeof Sym];

export const SYM_COUNT = 13;

/** Порядок для вывода в отчётах и подписей в интерфейсе. */
export const SYM_NAME: Record<SymId, string> = {
  [Sym.DUMBBELL]: 'Гантель',
  [Sym.WRISTBAND]: 'Напульсник',
  [Sym.HARNESS]: 'Портупея',
  [Sym.OIL]: 'Масло',
  [Sym.SHAKER]: 'Шейкер',
  [Sym.ROOKIE]: 'ROOKIE',
  [Sym.REF]: 'REF',
  [Sym.CHAMPION]: 'CHAMPION',
  [Sym.DUKE]: 'DUKE',
  [Sym.WILD]: '♂ WILD',
  [Sym.SCATTER]: 'DUNGEON DOOR',
  [Sym.CHAIN]: 'GOLD CHAIN',
  [Sym.FIST]: "DUKE'S FIST",
};

/** Символы, которые не участвуют в линейных выплатах и не замещаются wild'ом. */
export function isSpecial(s: SymId): boolean {
  return s === Sym.SCATTER || s === Sym.CHAIN || s === Sym.FIST;
}

// ─────────────────────────────────────────────────────────────
// Геометрия
// ─────────────────────────────────────────────────────────────

export const REELS = 5;
export const ROWS = 4;

/**
 * Видимое поле. Индексация [reel][row], reel слева направо, row сверху вниз.
 * Плоский массив был бы быстрее, но читаемость мат-модели важнее:
 * ошибку в выплатах ловить дороже, чем сэкономленные проценты времени симуляции.
 */
export type Grid = SymId[][];

/** Позиция на поле. */
export interface Pos {
  reel: number;
  row: number;
}

// ─────────────────────────────────────────────────────────────
// Липкие wild'ы (♂ STICKY GAINS)
// ─────────────────────────────────────────────────────────────

export interface StickyWild {
  reel: number;
  row: number;
  /** Текущий множитель: 1 → 2 → 3. */
  mult: number;
  /** Сколько спинов ♂ уже держится. Дожив до конца лестницы, в базовой игре уходит. */
  age: number;
}

/**
 * Ступени роста множителя липкого ♂.
 * Лестница короткая намеренно: множители липких перемножаются по линии,
 * так что верхняя ступень попадает в выигрыш не линейно, а произведением —
 * ×5 на конце раздувало хвост распределения сильнее, чем давало ощущений.
 */
export const STICKY_MULT_LADDER = [1, 2, 3] as const;

// ─────────────────────────────────────────────────────────────
// Результат спина
// ─────────────────────────────────────────────────────────────

/** Одна выигрышная линия. */
export interface LineWin {
  line: number;
  sym: SymId;
  count: number;
  /** Выигрыш в единицах ставки на линию, уже с учётом множителей ♂. */
  pay: number;
  /** Произведение множителей липких ♂, попавших на линию. */
  mult: number;
  positions: Pos[];
}

/** Сработавший сбор цепей (OIL UP). */
export interface CollectWin {
  fists: Pos[];
  chains: { pos: Pos; value: number }[];
  /** Сумма всех собранных цепей в единицах общей ставки. */
  total: number;
}

export type SpinKind = 'base' | 'free';

export interface SpinResult {
  kind: SpinKind;
  grid: Grid;
  lineWins: LineWin[];
  scatterCount: number;
  /** Выплата за scatter'ы, в единицах общей ставки. */
  scatterPay: number;
  collect: CollectWin | null;
  /** Липкие ♂ после спина — то, что переезжает в следующий спин. */
  sticky: StickyWild[];
  /** Полный выигрыш спина в единицах ОБЩЕЙ ставки (не ставки на линию). */
  totalWin: number;
  /** Сработал ли вход во фриспины на этом спине. */
  triggeredFreeSpins: boolean;
  /** Упал ли жетон в накопитель BELT COLLECTION. */
  beltToken: boolean;
}

// ─────────────────────────────────────────────────────────────
// Экономика
// ─────────────────────────────────────────────────────────────

export const LINES = 20;

/** Общая ставка = LINES × ставка на линию. Все выигрыши наружу отдаём в ×ставки. */
export const TOTAL_BET_IN_LINE_BETS = LINES;

/** Потолок выигрыша за раунд, в общих ставках. Страховка от редкого выброса. */
export const MAX_WIN_X = 5000;
