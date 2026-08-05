import gsap from 'gsap';
import { Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import {
  COIN_COLS,
  COIN_RESPINS,
  COIN_ROWS_MAX,
  type CoinDrop,
  type CoinTier,
  type PumpTick,
} from '../core/features/coinRush';
import { label } from '../ui/widgets';
import { COIN_FIELD } from './layout';
import { COLOR } from './palette';
import { dur, pause } from './timing';

/**
 * Поле монетного бонуса OIL RUSH.
 *
 * Показывает то, что уже посчитала мат-модель: куда легли монеты, сколько
 * осталось респинов, какие ряды открыты. Ни одного решения здесь нет —
 * класс получает готовый лог событий раунда и разыгрывает его во времени.
 *
 * Своя рамка, а не барабанная: у бонуса 25 клеток против двадцати, и клетка
 * мельче. Барабаны на время бонуса прячутся целиком — это отдельная игра
 * на том же экране, и мешать их друг с другом нельзя.
 *
 * Монета — один и тот же спрайт, покрашенный по ступени номинала, плюс число
 * поверх. Ровно как цепи в базовой игре: номинал зависит от ставки, и зашитая
 * в картинку цифра начала бы врать при первой же смене ставки.
 */

/** Цвет металла по ступени. Тот же порядок, что у цепей в OIL UP. */
const TIER_COLOR: Record<CoinTier, number> = {
  bronze: 0xb87333,
  silver: 0xc3c9d6,
  gold: 0xffd24a,
  diamond: 0x7fe4ff,
};

/** Сколько ждать между падениями монет одного респина. */
const DROP_STEP = 90;

interface Slot {
  view: Container;
  value: Text;
  /** Номинал в ставках: качок его меняет, и подпись пересчитывается отсюда. */
  amount: number;
}

export class CoinField {
  readonly view = new Container();

  private readonly grid = new Graphics();
  private readonly locked = new Graphics();
  private readonly slots: (Slot | null)[] = new Array(COIN_COLS * COIN_ROWS_MAX).fill(null);
  private readonly coins = new Container();
  private readonly respinsText: Text;
  private readonly totalText: Text;
  private rows = 0;

  constructor(
    frame: Texture,
    private readonly art: {
      coin: Texture;
      fist: Texture;
      pump: Texture;
      wild: Texture;
    },
  ) {
    this.view.visible = false;
    this.view.position.set(COIN_FIELD.x, COIN_FIELD.y);

    const backdrop = new Sprite(frame);
    backdrop.width = COIN_FIELD.size;
    backdrop.height = COIN_FIELD.size;
    this.view.addChild(backdrop, this.grid, this.locked, this.coins);

    // Сетка клеток: тонкая, как разметка барабанов, — она размечает поле,
    // а не рисует решётку поверх игры.
    for (let i = 1; i < COIN_COLS; i++) {
      const x = COIN_FIELD.edge + COIN_FIELD.cell * i;
      this.grid.moveTo(x, COIN_FIELD.edge).lineTo(x, COIN_FIELD.size - COIN_FIELD.edge);
    }
    for (let i = 1; i < COIN_ROWS_MAX; i++) {
      const y = COIN_FIELD.edge + COIN_FIELD.cell * i;
      this.grid.moveTo(COIN_FIELD.edge, y).lineTo(COIN_FIELD.size - COIN_FIELD.edge, y);
    }
    this.grid.stroke({ color: 0x3a2b4a, width: 2, alpha: 0.55 });

    this.respinsText = label('', 30, COLOR.gold);
    this.respinsText.anchor.set(0.5, 1);
    this.respinsText.position.set(COIN_FIELD.size / 2, -10);
    this.view.addChild(this.respinsText);

    this.totalText = label('', 34, COLOR.paper);
    this.totalText.anchor.set(0.5, 0);
    this.totalText.position.set(COIN_FIELD.size / 2, COIN_FIELD.size + 8);
    this.view.addChild(this.totalText);
  }

  /** Центр клетки в координатах поля. */
  private cellAt(index: number): { x: number; y: number } {
    const col = index % COIN_COLS;
    const row = Math.floor(index / COIN_COLS);
    return {
      x: COIN_FIELD.edge + COIN_FIELD.cell * (col + 0.5),
      y: COIN_FIELD.edge + COIN_FIELD.cell * (row + 0.5),
    };
  }

  /** Закрытые ряды притеняются: видно, что поле ещё может вырасти. */
  private drawLocked(): void {
    this.locked.clear();
    if (this.rows >= COIN_ROWS_MAX) return;

    const top = COIN_FIELD.edge + COIN_FIELD.cell * this.rows;
    this.locked
      .rect(COIN_FIELD.edge, top, COIN_FIELD.cell * COIN_COLS, COIN_FIELD.size - COIN_FIELD.edge - top)
      .fill({ color: 0x05030a, alpha: 0.72 });
  }

  private textureFor(drop: CoinDrop): Texture {
    switch (drop.coin.kind) {
      case 'collector':
        return this.art.fist;
      case 'pump':
        return this.art.pump;
      case 'mult':
        return this.art.wild;
      default:
        return this.art.coin;
    }
  }

  /** Кладёт монету в клетку с прыжком: она падает, а не проявляется. */
  private putCoin(drop: CoinDrop, betCoins: number): void {
    const at = this.cellAt(drop.index);
    const slot = new Container();
    slot.position.set(at.x, at.y);

    const size = COIN_FIELD.cell - 16;

    // Ступень показывает кольцо под монетой, а не её собственный цвет.
    // Красить сам спрайт нельзя: он золотой, а tint в Pixi умножает —
    // «серебро» и «алмаз» выходили болотно-зелёными. Кольцо же читается
    // сразу и не портит рисунок монеты.
    if (drop.coin.kind === 'coin') {
      const ring = new Graphics()
        .circle(0, 0, size * 0.46)
        .fill({ color: TIER_COLOR[drop.coin.tier], alpha: 0.95 })
        .circle(0, 0, size * 0.46)
        .stroke({ color: 0x120a18, width: 3, alpha: 0.8 });
      slot.addChild(ring);
    }

    const sprite = new Sprite(this.textureFor(drop));
    sprite.anchor.set(0.5);
    sprite.width = drop.coin.kind === 'coin' ? size * 0.78 : size;
    sprite.height = drop.coin.kind === 'coin' ? size * 0.78 : size;
    slot.addChild(sprite);

    // Подпись: номинал в монетах у обычных, роль — у особых.
    const caption =
      drop.coin.kind === 'mult'
        ? `×${drop.coin.mult}`
        : drop.coin.kind === 'pump'
          ? '+'
          : drop.coin.kind === 'collector'
            ? Math.round(drop.coin.value * betCoins).toLocaleString('ru-RU')
            : Math.round(drop.coin.value * betCoins).toLocaleString('ru-RU');

    const value = label(caption, drop.coin.kind === 'coin' ? 20 : 22, COLOR.ink);
    value.anchor.set(0.5);
    value.position.set(0, size * 0.28);
    // Тёмная подложка под числом: на светлом металле монеты чёрные цифры
    // сливаются с бликами, а обводкой Pixi текст не обводит.
    const plate = new Graphics()
      .roundRect(-value.width / 2 - 6, value.y - value.height / 2 - 2, value.width + 12, value.height + 4, 6)
      .fill({ color: 0xf6e7c8, alpha: 0.92 });
    slot.addChild(plate, value);

    this.coins.addChild(slot);
    this.slots[drop.index] = { view: slot, value, amount: drop.coin.value };

    slot.scale.set(0.2);
    slot.alpha = 0;
    gsap.to(slot, { alpha: 1, duration: dur(0.12) });
    gsap.to(slot.scale, { x: 1, y: 1, duration: dur(0.26), ease: 'back.out(2.2)' });
  }

  /** Начало бонуса: пустое поле, стартовые монеты, полный счётчик. */
  async start(rows: number, drops: CoinDrop[], betCoins: number): Promise<void> {
    this.coins.removeChildren();
    this.slots.fill(null);
    this.rows = rows;
    this.drawLocked();
    this.setRespins(COIN_RESPINS);
    this.totalText.text = '';
    this.view.visible = true;
    this.view.alpha = 0;
    gsap.to(this.view, { alpha: 1, duration: dur(0.3) });

    await this.drop(drops, rows, betCoins);
  }

  /** Респин: монеты падают по очереди, потом открываются новые ряды. */
  async drop(drops: CoinDrop[], rows: number, betCoins: number): Promise<void> {
    for (const d of drops) {
      this.putCoin(d, betCoins);
      await pause(DROP_STEP);
    }

    if (rows !== this.rows) {
      this.rows = rows;
      this.drawLocked();
      // Открытие ряда — событие: поле мигает по новой кромке.
      const flash = new Graphics()
        .rect(
          COIN_FIELD.edge,
          COIN_FIELD.edge + COIN_FIELD.cell * (rows - 1),
          COIN_FIELD.cell * COIN_COLS,
          COIN_FIELD.cell,
        )
        .fill({ color: COLOR.gold, alpha: 0.35 });
      this.view.addChild(flash);
      await new Promise<void>((resolve) => {
        gsap.to(flash, {
          alpha: 0,
          duration: dur(0.5),
          onComplete: () => {
            flash.destroy();
            resolve();
          },
        });
      });
    }
  }

  /** Качок подкачал монету: число подрастает на месте. */
  async pump(ticks: PumpTick[], betCoins: number): Promise<void> {
    for (const tick of ticks) {
      const slot = this.slots[tick.index];
      if (!slot) continue;
      slot.amount += tick.add;
      slot.value.text = Math.round(slot.amount * betCoins).toLocaleString('ru-RU');
      gsap.fromTo(
        slot.view.scale,
        { x: 1, y: 1 },
        { x: 1.18, y: 1.18, duration: dur(0.14), yoyo: true, repeat: 1 },
      );
      await pause(130);
    }
  }

  setRespins(left: number): void {
    this.respinsText.text = left > 0 ? `РЕСПИНОВ ${left}` : 'ПОСЛЕДНИЙ ШАНС';
  }

  /** Итог: сумма поля, множитель и, если повезло, полное поле. */
  async finish(total: number, mult: number, filled: boolean, betCoins: number): Promise<void> {
    const coins = Math.round(total * betCoins).toLocaleString('ru-RU');
    this.totalText.text = filled
      ? `ВСЁ ПОЛЕ! ${coins}`
      : mult > 1
        ? `${coins}  (×${mult})`
        : coins;
    gsap.fromTo(
      this.totalText.scale,
      { x: 0.7, y: 0.7 },
      { x: 1, y: 1, duration: dur(0.4), ease: 'back.out(2)' },
    );
    await pause(1600);
  }

  async hide(): Promise<void> {
    await new Promise<void>((resolve) => {
      gsap.to(this.view, {
        alpha: 0,
        duration: dur(0.3),
        onComplete: () => {
          this.view.visible = false;
          resolve();
        },
      });
    });
  }
}
