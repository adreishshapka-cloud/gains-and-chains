import type { BeltReward } from './features/beltCollection';
import type { CoinDrop, PumpTick } from './features/coinRush';
import type { Door } from './features/freeSpins';
import type { SpinResult } from './types';

/**
 * Лог событий раунда.
 *
 * playRound() проигрывает весь раунд разом — включая все фриспины — и это
 * правильно для симулятора, но графике нужно показывать происходящее по шагам.
 * Вместо того чтобы заводить второй, «анимационный» вариант логики (после чего
 * отчёты симулятора перестали бы что-либо значить), раунд просто записывает,
 * что с ним произошло. Игровой слой читает эту ленту и разыгрывает её во времени.
 *
 * Лог собирается только если в playRound передан массив — симулятор гоняет
 * миллионы раундов и не должен платить за аллокации.
 */
export type RoundEvent =
  | { type: 'baseSpin'; spin: SpinResult }
  | { type: 'beltToken'; tokens: number }
  | { type: 'beltReward'; reward: BeltReward }
  | { type: 'freeStart'; door: Door; carriedSticky: number }
  | { type: 'freeSpin'; spin: SpinResult; mult: number; spinsLeft: number; index: number }
  | { type: 'retrigger'; extra: number; spinsLeft: number }
  | { type: 'freeEnd'; won: number; spinsPlayed: number }
  // OIL RUSH. Респин отдаётся одним событием, а не по монете на событие:
  // монеты одного респина падают вместе, и разводить их по времени должен
  // игровой слой, а не мат-модель.
  | { type: 'coinStart'; rows: number; drops: CoinDrop[] }
  | {
      type: 'coinRespin';
      drops: CoinDrop[];
      pumps: PumpTick[];
      rows: number;
      respinsLeft: number;
      mult: number;
    }
  | { type: 'coinEnd'; total: number; filled: boolean; mult: number; coins: number }
  | { type: 'capped'; raw: number; capped: number };
