import type { StickyWild } from '../types';

/**
 * DUNGEON RUN — фриспины.
 *
 * Единственное решение, которое игрок принимает за всю игру: какую дверь открыть.
 * Все три двери намеренно сведены к близкому матожиданию — выбор должен быть
 * про темперамент, а не про то, кто прочитал таблицу и знает правильный ответ.
 *
 * Внутри раунда липкие ♂ не исчезают, и КАЖДЫЙ из них даёт +1 к общему
 * множителю раунда (в базовой игре они вместо этого растят собственный
 * множитель по лестнице и перемножаются по линии).
 *
 * Почему +1 за штуку, а не сумма их лестниц: липкие копятся весь раунд, и
 * суммирование лестниц разгоняло множитель до ×80 к концу двенадцати спинов.
 * Вместе с тем, что каждый ♂ и сам по себе усиливает линии, это давало
 * неуправляемый хвост распределения. Линейное правило держит фичу в рамках
 * и вдобавок объясняется игроку одной строкой.
 */

export type DoorId = 'ARM_WRESTLE' | 'SUBMISSION' | 'FULL_NELSON';

export interface Door {
  id: DoorId;
  title: string;
  subtitle: string;
  spins: number;
  /** Стартовый множитель раунда. */
  startMult: number;
}

export const DOORS: readonly Door[] = [
  {
    id: 'ARM_WRESTLE',
    title: 'ARM WRESTLE',
    subtitle: 'Долго и ровно',
    spins: 10,
    startMult: 1,
  },
  {
    id: 'SUBMISSION',
    title: 'SUBMISSION',
    subtitle: 'Золотая середина',
    spins: 8,
    startMult: 5,
  },
  {
    id: 'FULL_NELSON',
    title: 'FULL NELSON',
    subtitle: 'Всё или ничего',
    spins: 5,
    startMult: 18,
  },
];

export function getDoor(id: DoorId): Door {
  const door = DOORS.find((d) => d.id === id);
  if (!door) throw new Error(`Неизвестная дверь: ${id}`);
  return door;
}

/** Каждый scatter внутри раунда добавляет спинов. */
export const RETRIGGER_SPINS = 2;

/**
 * Стоимость покупки бонуса (SKIP LEG DAY), в общих ставках.
 * Подобрана так, чтобы RTP покупки совпадал с RTP обычной игры: покупка должна
 * экономить время, а не быть выгоднее или невыгоднее кручения.
 */
export const BONUS_BUY_COST = 64;

export interface FreeSpinsState {
  door: Door;
  spinsLeft: number;
  /** Сколько всего спинов выдано за раунд, включая ретриггеры. */
  spinsTotal: number;
  sticky: StickyWild[];
  /** Накопленный выигрыш раунда в общих ставках. */
  won: number;
}

export function startFreeSpins(doorId: DoorId, carriedSticky: StickyWild[] = []): FreeSpinsState {
  const door = getDoor(doorId);
  return {
    door,
    spinsLeft: door.spins,
    spinsTotal: door.spins,
    // Липкие ♂ из базовой игры переезжают в раунд — приятная мелочь,
    // и повод не ждать конца серии перед покупкой бонуса.
    sticky: carriedSticky.map((s) => ({ ...s })),
    won: 0,
  };
}

/**
 * Общий множитель раунда: стартовый плюс по +1 за каждый липкий ♂ на поле.
 * Применяется только к линейным выигрышам — цепи и scatter'ы платят сами по себе,
 * иначе редкий сбор цепей на высоком множителе улетал бы за все разумные пределы.
 */
export function roundMultiplier(state: FreeSpinsState): number {
  return state.door.startMult + state.sticky.length;
}

export function grantRetrigger(state: FreeSpinsState, scatters: number): number {
  if (scatters <= 0) return 0;
  const extra = scatters * RETRIGGER_SPINS;
  state.spinsLeft += extra;
  state.spinsTotal += extra;
  return extra;
}
