import type { Rng } from '../rng';

/**
 * BELT COLLECTION — накопитель из трёх чемпионских жетонов.
 *
 * Смысл фичи не в выплатах, а в темпе. Вероятность жетона растёт с числом
 * пустых спинов подряд, поэтому глухая полоса всё равно к чему-то ведёт.
 * Без такой страховки высоковолатильный слот на дистанции превращается
 * в двести спинов тишины, и играть в него невозможно, какой бы ни был RTP.
 */

export const BELT_TARGET = 3;

/** Базовый шанс жетона на спин. */
export const BELT_BASE_P = 0.008;
/** Прибавка за каждый спин без единого выигрыша. */
export const BELT_DRY_STEP = 0.0015;
/** Потолок — иначе на длинной сухой серии жетоны посыпались бы стеной. */
export const BELT_MAX_P = 0.05;

export interface BeltState {
  /** Собрано жетонов: 0..BELT_TARGET-1. */
  tokens: number;
  /** Спинов подряд без выигрыша. */
  dry: number;
}

export function createBeltState(): BeltState {
  return { tokens: 0, dry: 0 };
}

export function beltTokenChance(dry: number): number {
  return Math.min(BELT_MAX_P, BELT_BASE_P + dry * BELT_DRY_STEP);
}

/** Разыгрывает падение жетона. Состояние не меняет — это делает spin(). */
export function rollBeltToken(state: BeltState, rng: Rng): boolean {
  return rng.chance(beltTokenChance(state.dry));
}

export type BeltRewardKind = 'cash' | 'freespins' | 'wilds';

export interface BeltReward {
  kind: BeltRewardKind;
  /** Для 'cash' — выплата в общих ставках. */
  cash: number;
  /** Для 'wilds' — сколько позиций превратить в липкие ♂. */
  wilds: number;
}

const CASH_TIERS: readonly { value: number; weight: number }[] = [
  { value: 5, weight: 45 },
  { value: 8, weight: 25 },
  { value: 12, weight: 15 },
  { value: 20, weight: 9 },
  { value: 35, weight: 5 },
  { value: 60, weight: 1 },
];
const CASH_TOTAL = CASH_TIERS.reduce((s, t) => s + t.weight, 0);

/**
 * Награда за три жетона. DUKE снимает очки — и выдаёт одно из трёх.
 * Раздача бонусных ♂ ощущается щедрее выплаты той же стоимости,
 * потому что игрок сам видит, во что они превратятся.
 */
export function rollBeltReward(rng: Rng): BeltReward {
  const roll = rng.next();

  if (roll < 0.5) {
    let r = rng.next() * CASH_TOTAL;
    for (const t of CASH_TIERS) {
      r -= t.weight;
      if (r < 0) return { kind: 'cash', cash: t.value, wilds: 0 };
    }
    return { kind: 'cash', cash: CASH_TIERS[0].value, wilds: 0 };
  }

  if (roll < 0.7) {
    return { kind: 'freespins', cash: 0, wilds: 0 };
  }

  return { kind: 'wilds', cash: 0, wilds: 2 + rng.int(4) }; // 2..5
}
