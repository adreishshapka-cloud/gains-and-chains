import type { StickyWild } from '../core/types';

/**
 * Сохранение прогресса.
 *
 * Игра локальная и на фантики, поэтому храним всё в localStorage без затей.
 * Сохраняем не только баланс, но и накопитель жетонов с липкими ♂: без этого
 * закрытие игры на двух собранных жетонах обнуляло бы прогресс, а сухая серия
 * начиналась бы заново — то есть страховка от глухих полос ломалась бы
 * ровно там, где она нужнее всего.
 */

const KEY = 'gains-and-chains/save/v1';

export interface Stats {
  rounds: number;
  /** Всего поставлено, монет. По нему считается ранг. */
  wagered: number;
  won: number;
  /** Лучший выигрыш раунда в ставках. */
  bestWinX: number;
  /** Самая длинная серия спинов без выигрыша. */
  worstDry: number;
  freeRounds: number;
  beltRewards: number;
  /** Сколько раз игрок доливал монет. */
  topUps: number;
}

export interface SaveData {
  version: 1;
  balance: number;
  betIndex: number;
  turbo: boolean;
  stats: Stats;
  belt: { tokens: number; dry: number };
  sticky: StickyWild[];
}

export const START_BALANCE = 20_000;

export function emptyStats(): Stats {
  return {
    rounds: 0,
    wagered: 0,
    won: 0,
    bestWinX: 0,
    worstDry: 0,
    freeRounds: 0,
    beltRewards: 0,
    topUps: 0,
  };
}

export function defaultSave(): SaveData {
  return {
    version: 1,
    balance: START_BALANCE,
    betIndex: 0,
    turbo: false,
    stats: emptyStats(),
    belt: { tokens: 0, dry: 0 },
    sticky: [],
  };
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultSave();
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    if (parsed.version !== 1) return defaultSave();

    // Поля добираются по одному: сохранение могло быть записано более ранней
    // сборкой, и падать из-за отсутствующего ключа игра не должна.
    const base = defaultSave();
    return {
      version: 1,
      balance: typeof parsed.balance === 'number' ? parsed.balance : base.balance,
      betIndex: typeof parsed.betIndex === 'number' ? parsed.betIndex : base.betIndex,
      turbo: typeof parsed.turbo === 'boolean' ? parsed.turbo : base.turbo,
      stats: { ...base.stats, ...(parsed.stats ?? {}) },
      belt: { ...base.belt, ...(parsed.belt ?? {}) },
      sticky: Array.isArray(parsed.sticky) ? parsed.sticky : [],
    };
  } catch {
    // Битое сохранение не повод не дать поиграть.
    return defaultSave();
  }
}

export function writeSave(data: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Переполнение или запрет записи — молча продолжаем без сохранения.
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* пусто */
  }
}

// ── Ранги ────────────────────────────────────────────────────

export interface Rank {
  min: number;
  title: string;
  ru: string;
}

/** Ранг растёт по обороту, а не по балансу: иначе он бы падал после проигрыша. */
export const RANKS: readonly Rank[] = [
  { min: 0, title: 'SKINNY', ru: 'Дрищ' },
  { min: 2_000, title: 'ROOKIE', ru: 'Новичок' },
  { min: 10_000, title: 'GYM RAT', ru: 'Завсегдатай' },
  { min: 50_000, title: 'HEAVY LIFTER', ru: 'Тяжеловес' },
  { min: 200_000, title: 'OILED LEGEND', ru: 'Масляная Легенда' },
  { min: 1_000_000, title: 'GRAND CHAMPION', ru: 'Абсолютный Чемпион' },
];

export function rankFor(wagered: number): Rank {
  let current = RANKS[0];
  for (const rank of RANKS) {
    if (wagered >= rank.min) current = rank;
  }
  return current;
}

/** Сколько ещё поставить до следующего ранга. null — уже максимальный. */
export function nextRankGap(wagered: number): { rank: Rank; left: number } | null {
  for (const rank of RANKS) {
    if (wagered < rank.min) return { rank, left: rank.min - wagered };
  }
  return null;
}
