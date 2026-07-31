import gsap from 'gsap';
import { Container, Graphics, Text } from 'pixi.js';
import { PAYLINES } from '../core/lines';
import { CHAIN_TIER_COLOR, chainTier } from '../core/paytable';
import { REELS, ROWS, type CollectWin, type LineWin } from '../core/types';
import { COLOR } from './palette';
import { CELL } from './placeholders';
import type { ReelSet } from './ReelSet';
import { dur, pause } from './timing';

/**
 * Показ выигрыша.
 *
 * Задача этого слоя — растянуть во времени то, что мат-модель посчитала
 * мгновенно, и расставить акценты: крупный выигрыш обязан ощущаться крупным,
 * мелкий не должен занимать столько же экранного времени. Ни одна цифра
 * здесь не вычисляется — только показывается.
 */

/**
 * Ступени подачи. Порог — во сколько ставок оценён выигрыш раунда.
 * Экспортируется: Game.ts сверяется с этими же порогами и цветами, когда решает,
 * показывать ли поверх обычного показа ещё и полноэкранный баннер большого
 * выигрыша — второй источник границ здесь был бы способом рассинхронизировать их.
 */
export const TIERS = [
  { min: 100, title: 'MAXIMUM GAINS', color: COLOR.neon, count: 3.4, hold: 1600 },
  { min: 40, title: 'MEGA PUMP', color: COLOR.cyan, count: 2.6, hold: 1300 },
  { min: 15, title: 'BIG LIFT', color: COLOR.gold, count: 1.9, hold: 1000 },
  { min: 5, title: 'GOOD REP', color: COLOR.gold, count: 1.2, hold: 700 },
] as const;

/** Цвета линий: соседние линии не должны сливаться, когда горят разом. */
const LINE_COLORS = [
  0xffd24a, 0x35e0d8, 0xc74be8, 0xff7a4a, 0x7ad45a, 0x4a9fff, 0xff5aa8, 0xffe97a,
];

const WIDTH = REELS * CELL;
const HEIGHT = ROWS * CELL;

function centerOf(reel: number, row: number): { x: number; y: number } {
  return { x: reel * CELL + CELL / 2, y: row * CELL + CELL / 2 };
}

export interface PresentOptions {
  lineWins: readonly LineWin[];
  collect: CollectWin | null;
  /** Итог спина в общих ставках. */
  totalWin: number;
  /** Множитель раунда фриспинов. Показывается под счётчиком, если больше единицы. */
  roundMult?: number;
  /** Куда сообщать текущее значение бегущего счётчика, в монетах. */
  onCount: (coins: number) => void;
  /** Монет в одной общей ставке. */
  betCoins: number;
}

export class WinPresenter {
  readonly view = new Container();

  private readonly lines = new Graphics();
  private readonly frames = new Graphics();
  private readonly amount: Text;
  private readonly tierLabel: Text;
  private readonly multLabel: Text;
  /** Номиналы цепей. Переиспользуются: цепей на экране не больше, чем ячеек. */
  private readonly chainTags: Text[] = [];
  private readonly reels: ReelSet;

  /**
   * Множитель длительности показа. Единица — боевой темп.
   * Поднимается из отладки, когда нужно рассмотреть подсветку и счётчик:
   * на нормальной скорости мелкий выигрыш живёт около секунды.
   */
  slowMotion = 1;

  constructor(reels: ReelSet) {
    this.reels = reels;

    this.view.addChild(this.frames);
    this.view.addChild(this.lines);

    this.amount = new Text({
      text: '',
      style: {
        fontFamily: 'Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif',
        fontSize: 66,
        fill: COLOR.gold,
        stroke: { color: COLOR.ink, width: 8 },
        align: 'center',
      },
    });
    this.amount.anchor.set(0.5);
    this.amount.position.set(WIDTH / 2, HEIGHT / 2);
    this.amount.visible = false;
    this.view.addChild(this.amount);

    this.tierLabel = new Text({
      text: '',
      style: {
        fontFamily: 'Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif',
        fontSize: 40,
        fill: COLOR.paper,
        stroke: { color: COLOR.ink, width: 7 },
        letterSpacing: 3,
        align: 'center',
      },
    });
    this.tierLabel.anchor.set(0.5);
    this.tierLabel.position.set(WIDTH / 2, HEIGHT / 2 - 62);
    this.tierLabel.visible = false;
    this.view.addChild(this.tierLabel);

    this.multLabel = new Text({
      text: '',
      style: {
        fontFamily: 'Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif',
        fontSize: 30,
        fill: COLOR.cyan,
        stroke: { color: COLOR.ink, width: 6 },
        align: 'center',
      },
    });
    this.multLabel.anchor.set(0.5);
    this.multLabel.position.set(WIDTH / 2, HEIGHT / 2 + 52);
    this.multLabel.visible = false;
    this.view.addChild(this.multLabel);
  }

  /** Идёт ли сейчас показ выигрыша. */
  get isPresenting(): boolean {
    return this.amount.visible;
  }

  /** Показать результат спина. Возвращается, когда показ окончен. */
  async present(o: PresentOptions): Promise<void> {
    if (o.totalWin <= 0) {
      this.clear();
      // Цепи без сборщика — не выигрыш, но показать их надо: иначе игрок
      // не увидит, какая сумма только что лежала на экране и не собралась.
      if (o.collect && o.collect.chains.length > 0) {
        this.drawCollect(o.collect);
        await pause(520);
        this.clear();
      }
      return;
    }

    const tier = TIERS.find((t) => o.totalWin >= t.min) ?? null;

    this.drawLineWins(o.lineWins);
    this.drawCollect(o.collect);
    this.pulseWinners(o.lineWins, o.collect);

    if (tier) {
      this.tierLabel.text = tier.title;
      this.tierLabel.style.fill = tier.color;
      this.tierLabel.visible = true;
      this.popIn(this.tierLabel);
    }

    if (o.roundMult !== undefined && o.roundMult > 1) {
      this.multLabel.text = `множитель ×${o.roundMult}`;
      this.multLabel.visible = true;
    }

    await this.runCounter(o, dur((tier?.count ?? 0.7) * this.slowMotion));
    await pause((tier?.hold ?? 380) * this.slowMotion);

    this.clear();
  }

  /** Бегущий счётчик. Ускорение к концу — так итог читается как результат, а не как процесс. */
  private runCounter(o: PresentOptions, seconds: number): Promise<void> {
    const target = o.totalWin * o.betCoins;
    this.amount.visible = true;
    this.amount.text = '0';
    this.popIn(this.amount);

    const box = { v: 0 };
    return new Promise((resolve) => {
      gsap.to(box, {
        v: target,
        duration: seconds,
        ease: 'power1.in',
        onUpdate: () => {
          const coins = Math.round(box.v);
          this.amount.text = coins.toLocaleString('ru-RU');
          o.onCount(coins);
        },
        onComplete: () => {
          this.amount.text = Math.round(target).toLocaleString('ru-RU');
          o.onCount(Math.round(target));
          resolve();
        },
      });
    });
  }

  private popIn(node: Text): void {
    gsap.killTweensOf(node.scale);
    node.scale.set(0.6);
    gsap.to(node.scale, { x: 1, y: 1, duration: dur(0.28), ease: 'back.out(2.4)' });
  }

  private drawLineWins(wins: readonly LineWin[]): void {
    this.lines.clear();
    this.frames.clear();

    for (const [i, win] of wins.entries()) {
      const color = LINE_COLORS[win.line % LINE_COLORS.length];
      const path = PAYLINES[win.line];

      // Ломаная только по выигравшей части линии — хвост подсвечивать нечестно.
      const first = centerOf(0, path[0]);
      this.lines.moveTo(first.x, first.y);
      for (let reel = 1; reel < win.count; reel++) {
        const p = centerOf(reel, path[reel]);
        this.lines.lineTo(p.x, p.y);
      }
      this.lines.stroke({ color, width: 5, alpha: 0.9, join: 'round', cap: 'round' });

      for (const pos of win.positions) {
        this.frames
          .roundRect(pos.reel * CELL + 4, pos.row * CELL + 4, CELL - 8, CELL - 8, 10)
          .stroke({ color, width: 4, alpha: 0.95 });
      }

      // Множитель липкого ♂ подписывается прямо у линии — иначе игрок
      // не поймёт, почему выплата отличается от таблицы.
      if (win.mult > 1 && i === 0) {
        const tag = centerOf(win.count - 1, path[win.count - 1]);
        this.frames.circle(tag.x + CELL / 2 - 14, tag.y - CELL / 2 + 14, 15).fill(COLOR.ink);
        this.frames
          .circle(tag.x + CELL / 2 - 14, tag.y - CELL / 2 + 14, 15)
          .stroke({ color: COLOR.gold, width: 3 });
      }
    }
  }

  private drawCollect(collect: CollectWin | null): void {
    if (!collect || collect.chains.length === 0) return;

    const collected = collect.total > 0;

    for (const [i, chain] of collect.chains.entries()) {
      const x = chain.pos.reel * CELL;
      const y = chain.pos.row * CELL;

      this.frames.roundRect(x + 4, y + 4, CELL - 8, CELL - 8, 10).stroke({
        color: COLOR.gold,
        width: 5,
        alpha: collected ? 1 : 0.55,
      });

      // Номинал цепи виден всегда: он и есть содержание фичи.
      // Цвет по ступени — его глаз ловит быстрее, чем успевает прочесть число.
      const tag = this.chainTagAt(i);
      tag.text = `×${chain.value}`;
      tag.style.fill = CHAIN_TIER_COLOR[chainTier(chain.value)];
      tag.visible = true;
      tag.alpha = collected ? 1 : 0.7;
      tag.position.set(x + CELL / 2, y + CELL - 30);

      this.frames
        .roundRect(x + CELL / 2 - tag.width / 2 - 9, y + CELL - 33, tag.width + 18, 26, 8)
        .fill({ color: COLOR.ink, alpha: 0.9 });
    }

    for (const fist of collect.fists) {
      this.frames
        .roundRect(fist.reel * CELL + 2, fist.row * CELL + 2, CELL - 4, CELL - 4, 12)
        .stroke({ color: COLOR.neon, width: 6, alpha: 1 });
    }
  }

  private chainTagAt(index: number): Text {
    while (this.chainTags.length <= index) {
      const tag = new Text({
        text: '',
        style: {
          fontFamily: 'Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif',
          fontSize: 21,
          fill: COLOR.gold,
        },
      });
      tag.anchor.set(0.5, 0);
      tag.visible = false;
      this.chainTags.push(tag);
      this.view.addChild(tag);
    }
    return this.chainTags[index];
  }

  private pulseWinners(wins: readonly LineWin[], collect: CollectWin | null): void {
    const seen = new Set<number>();
    const mark = (reel: number, row: number) => {
      const key = reel * ROWS + row;
      if (seen.has(key)) return;
      seen.add(key);
      this.reels.pulse(reel, row);
    };

    for (const win of wins) {
      for (const pos of win.positions) mark(pos.reel, pos.row);
    }
    if (collect && collect.total > 0) {
      for (const chain of collect.chains) mark(chain.pos.reel, chain.pos.row);
      for (const fist of collect.fists) mark(fist.reel, fist.row);
    }
  }

  clear(): void {
    this.lines.clear();
    this.frames.clear();
    this.amount.visible = false;
    this.tierLabel.visible = false;
    this.multLabel.visible = false;
    for (const tag of this.chainTags) tag.visible = false;
    this.reels.clearHighlights();
  }
}
