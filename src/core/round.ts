import {
  BELT_TARGET,
  createBeltState,
  rollBeltReward,
  type BeltReward,
  type BeltState,
} from './features/beltCollection';
import {
  BONUS_BUY_COST,
  DOORS,
  grantRetrigger,
  roundMultiplier,
  startFreeSpins,
  type DoorId,
} from './features/freeSpins';
import type { RoundEvent } from './events';
import type { Rng } from './rng';
import { spinOnce } from './spin';
import { LINES, MAX_WIN_X, REELS, ROWS, STICKY_MULT_LADDER, type StickyWild } from './types';

/**
 * Игровой раунд — всё, что происходит от одной ставки до возврата в покой.
 *
 * Раунд разбит на две фазы: базовый спин с накопителем жетонов и, отдельно,
 * блок фриспинов. Причина не в красоте, а в том, что между фазами игрок должен
 * выбрать дверь — а выбор нельзя сделать посреди синхронной функции.
 *
 * playRound() склеивает обе фазы для симулятора, игра вызывает их по очереди
 * и вставляет между ними экран выбора. Логика при этом ровно одна: как только
 * она раздвоится, отчёты по RTP перестанут что-либо значить.
 */

export interface GameState {
  /** Липкие ♂ базовой игры. Живут между спинами. */
  sticky: StickyWild[];
  belt: BeltState;
}

export function createGameState(): GameState {
  return { sticky: [], belt: createBeltState() };
}

/** Как выбирается дверь фриспинов. Живой игрок решает сам, симулятор — по стратегии. */
export type DoorChoice = DoorId | 'random';

/** Слагаемые выигрыша. Считаются по всем фазам и складываются один раз, в конце. */
export interface WinParts {
  baseWin: number;
  freeWin: number;
  beltWin: number;
  lineWin: number;
  scatterWin: number;
  chainWin: number;
}

export function emptyParts(): WinParts {
  return { baseWin: 0, freeWin: 0, beltWin: 0, lineWin: 0, scatterWin: 0, chainWin: 0 };
}

export interface RoundOptions {
  rng: Rng;
  state: GameState;
  door: DoorChoice;
  /** SKIP LEG DAY: купить вход в бонус вместо обычного спина. */
  buy?: boolean;
  /**
   * Аккумулятор выплат по символам, длиной SYM_COUNT. Заполняется только если передан.
   * Нужен симулятору, чтобы видеть, какой символ съедает RTP, и резать прицельно,
   * а не двигать всю таблицу выплат разом. В игре не используется.
   */
  symAccum?: number[];
  /**
   * Лента событий раунда для анимации. Заполняется только если передан массив.
   * Позволяет графике проигрывать раунд по шагам, не заводя второй экземпляр
   * игровой логики — см. `events.ts`.
   */
  log?: RoundEvent[];
}

export interface RoundResult {
  /** Ставка раунда в общих ставках: 1 за обычный спин, BONUS_BUY_COST за покупку. */
  cost: number;
  /** Итоговый выигрыш раунда в общих ставках, уже с учётом потолка. */
  win: number;

  baseWin: number;
  freeWin: number;
  beltWin: number;

  /** Разбивка по источникам за весь раунд — нужна симулятору, чтобы видеть,
   *  какая именно фича вытягивает или проедает RTP. */
  lineWin: number;
  scatterWin: number;
  chainWin: number;
  /** Липких ♂ на поле в конце раунда — диагностика разгона фичи. */
  stickyCount: number;

  hit: boolean;
  enteredFree: boolean;
  freeSpinsPlayed: number;
  beltReward: BeltReward | null;
  capped: boolean;
}

/** Раздаёт бонусные липкие ♂ на свободные позиции — награда BELT COLLECTION. */
function grantWilds(sticky: StickyWild[], count: number, rng: Rng): void {
  const free: { reel: number; row: number }[] = [];
  const taken = new Set<number>();
  for (const s of sticky) taken.add(s.reel * ROWS + s.row);

  for (let reel = 0; reel < REELS; reel++) {
    for (let row = 0; row < ROWS; row++) {
      if (!taken.has(reel * ROWS + row)) free.push({ reel, row });
    }
  }

  for (let i = 0; i < count && free.length > 0; i++) {
    const idx = rng.int(free.length);
    const pos = free[idx];
    free.splice(idx, 1);
    sticky.push({ reel: pos.reel, row: pos.row, age: 0, mult: STICKY_MULT_LADDER[0] });
  }
}

export function pickDoor(choice: DoorChoice, rng: Rng): DoorId {
  return choice === 'random' ? rng.pick(DOORS).id : choice;
}

// ─────────────────────────────────────────────────────────────
// Фаза 1: базовый спин и накопитель жетонов
// ─────────────────────────────────────────────────────────────

export interface BaseOptions {
  rng: Rng;
  state: GameState;
  parts: WinParts;
  symAccum?: number[];
  log?: RoundEvent[];
}

export interface BasePhase {
  /** Нужно ли переходить к фриспинам. */
  enterFree: boolean;
  beltReward: BeltReward | null;
}

export function playBase(o: BaseOptions): BasePhase {
  const { rng, state, parts } = o;

  const base = spinOnce({ rng, kind: 'base', sticky: state.sticky, belt: state.belt });

  state.sticky = base.sticky;
  parts.baseWin += base.totalWin;
  parts.scatterWin += base.scatterPay;
  parts.chainWin += base.collect?.total ?? 0;
  parts.lineWin += base.totalWin - base.scatterPay - (base.collect?.total ?? 0);
  if (o.symAccum) {
    for (const w of base.lineWins) o.symAccum[w.sym] += w.pay / LINES;
  }
  o.log?.push({ type: 'baseSpin', spin: base });

  let enterFree = base.triggeredFreeSpins;
  let beltReward: BeltReward | null = null;

  // ── Накопитель жетонов ──────────────────────────────────────
  if (base.beltToken) state.belt.tokens++;
  state.belt.dry = base.totalWin > 0 ? 0 : state.belt.dry + 1;
  if (base.beltToken) o.log?.push({ type: 'beltToken', tokens: state.belt.tokens });

  if (state.belt.tokens >= BELT_TARGET) {
    state.belt.tokens = 0;
    state.belt.dry = 0;
    beltReward = rollBeltReward(rng);
    o.log?.push({ type: 'beltReward', reward: beltReward });

    switch (beltReward.kind) {
      case 'cash':
        parts.beltWin += beltReward.cash;
        break;
      case 'freespins':
        enterFree = true;
        break;
      case 'wilds':
        grantWilds(state.sticky, beltReward.wilds, rng);
        break;
    }
  }

  return { enterFree, beltReward };
}

// ─────────────────────────────────────────────────────────────
// Фаза 2: DUNGEON RUN
// ─────────────────────────────────────────────────────────────

export interface FreeOptions {
  rng: Rng;
  state: GameState;
  parts: WinParts;
  /** Уже выбранная дверь: игроком на экране выбора или жребием в симуляторе. */
  door: DoorId;
  symAccum?: number[];
  log?: RoundEvent[];
}

export function playFree(o: FreeOptions): number {
  const { rng, state, parts } = o;
  const fs = startFreeSpins(o.door, state.sticky);
  o.log?.push({ type: 'freeStart', door: fs.door, carriedSticky: fs.sticky.length });

  let spinsPlayed = 0;

  while (fs.spinsLeft > 0) {
    fs.spinsLeft--;
    spinsPlayed++;

    // Множитель считается по липким, дожившим до начала спина:
    // свежий ♂ добавляет свой +1 только со следующего спина.
    const mult = roundMultiplier(fs);

    const r = spinOnce({ rng, kind: 'free', sticky: fs.sticky, roundMult: mult });
    fs.sticky = r.sticky;
    fs.won += r.totalWin;

    parts.scatterWin += r.scatterPay;
    parts.chainWin += r.collect?.total ?? 0;
    parts.lineWin += r.totalWin - r.scatterPay - (r.collect?.total ?? 0);
    if (o.symAccum) {
      for (const w of r.lineWins) o.symAccum[w.sym] += (w.pay / LINES) * mult;
    }

    o.log?.push({ type: 'freeSpin', spin: r, mult, spinsLeft: fs.spinsLeft, index: spinsPlayed });

    const extra = grantRetrigger(fs, r.scatterCount);
    if (extra > 0) o.log?.push({ type: 'retrigger', extra, spinsLeft: fs.spinsLeft });
  }

  parts.freeWin += fs.won;
  o.log?.push({ type: 'freeEnd', won: fs.won, spinsPlayed });

  // Раунд закончился — поле чистится, липкие в базовую игру не переезжают.
  state.sticky = [];
  state.belt.dry = 0;

  return spinsPlayed;
}

// ─────────────────────────────────────────────────────────────
// Итог
// ─────────────────────────────────────────────────────────────

/**
 * Складывает слагаемые и применяет потолок.
 * Вызывается один раз в конце — и симулятором, и игрой, чтобы кап не оказался
 * применён дважды или к разным суммам.
 */
export function finishRound(
  parts: WinParts,
  ctx: {
    cost: number;
    state: GameState;
    enteredFree: boolean;
    freeSpinsPlayed: number;
    beltReward: BeltReward | null;
    log?: RoundEvent[];
  },
): RoundResult {
  const raw = parts.baseWin + parts.beltWin + parts.freeWin;
  const capped = raw > MAX_WIN_X;
  const win = capped ? MAX_WIN_X : raw;
  if (capped) ctx.log?.push({ type: 'capped', raw, capped: win });

  return {
    cost: ctx.cost,
    win,
    baseWin: parts.baseWin,
    freeWin: parts.freeWin,
    beltWin: parts.beltWin,
    lineWin: parts.lineWin,
    scatterWin: parts.scatterWin,
    chainWin: parts.chainWin,
    stickyCount: ctx.state.sticky.length,
    hit: raw > 0,
    enteredFree: ctx.enteredFree,
    freeSpinsPlayed: ctx.freeSpinsPlayed,
    beltReward: ctx.beltReward,
    capped,
  };
}

/**
 * Весь раунд разом. Этим путём ходит симулятор; игра вызывает фазы по отдельности,
 * чтобы вклинить между ними экран выбора двери.
 */
export function playRound(o: RoundOptions): RoundResult {
  const { rng, state } = o;
  const buy = o.buy === true;
  const parts = emptyParts();

  let enterFree = buy;
  let beltReward: BeltReward | null = null;
  let freeSpinsPlayed = 0;

  // При покупке бонуса базовый спин не крутится: игрок платит за проход сразу.
  if (!buy) {
    const phase = playBase({ rng, state, parts, symAccum: o.symAccum, log: o.log });
    enterFree = phase.enterFree;
    beltReward = phase.beltReward;
  }

  if (enterFree) {
    freeSpinsPlayed = playFree({
      rng,
      state,
      parts,
      door: pickDoor(o.door, rng),
      symAccum: o.symAccum,
      log: o.log,
    });
  }

  return finishRound(parts, {
    cost: buy ? BONUS_BUY_COST : 1,
    state,
    enteredFree: enterFree,
    freeSpinsPlayed,
    beltReward,
    log: o.log,
  });
}
