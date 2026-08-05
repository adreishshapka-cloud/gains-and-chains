import gsap from 'gsap';
import { Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import {
  COIN_COLS,
  COIN_RESPINS,
  COIN_ROWS_MAX,
  type CoinDrop,
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
 * осталось респинов, какие ряды открыты. Ни одного решения здесь нет — класс
 * получает готовый лог событий раунда и разыгрывает его во времени.
 *
 * Поле занимает окно барабанов целиком: барабаны на время бонуса прячутся,
 * и монеты играют на их месте, в той же нарисованной рамке. Клетка при этом
 * не квадратная (136×109): пять рядов в высоту окна иначе не помещаются,
 * а монета всё равно круглая и садится по меньшей стороне.
 *
 * Монеты — картинки из макета бонуса с ПУСТЫМ лицом (tools/prep_oil_rush.py),
 * номинал пишет движок. Как и у цепей в базовой игре: номинал зависит
 * от ставки, и зашитое в картинку число начало бы врать при её смене.
 */

/** Сколько монета летит до своей клетки. */
const FALL_TIME = 0.72;
/** Задержка между монетами одного респина: они сыплются, а не появляются разом. */
const FALL_STAGGER = 150;

interface Slot {
  view: Container;
  value: Text;
  /** Номинал в ставках: качок его меняет, и подпись пересчитывается отсюда. */
  amount: number;
}

export interface CoinArt {
  bronze: Texture;
  silver: Texture;
  gold: Texture;
  diamond: Texture;
  fist: Texture;
  pump: Texture;
  mult: Texture;
}

export class CoinField {
  readonly view = new Container();

  private readonly grid = new Graphics();
  private readonly locked = new Graphics();
  private readonly coins = new Container();
  private readonly slots: (Slot | null)[] = new Array(COIN_COLS * COIN_ROWS_MAX).fill(null);
  private readonly respinsText: Text;
  private readonly totalText: Text;
  private rows = 0;

  constructor(private readonly art: CoinArt) {
    this.view.visible = false;
    this.view.position.set(COIN_FIELD.x, COIN_FIELD.y);

    const width = COIN_FIELD.cellW * COIN_COLS;
    const height = COIN_FIELD.cellH * COIN_ROWS_MAX;

    // Подложка глухая, без прозрачности: под окном барабанов на фоне нарисована
    // таблица выплат, и даже шесть процентов прозрачности показывали её призраки
    // в пустых клетках.
    const backdrop = new Graphics().rect(0, 0, width, height).fill(0x0a0710);

    // Разметка клеток — тонкая, как у барабанов: она размечает поле,
    // а не рисует решётку поверх игры.
    for (let i = 1; i < COIN_COLS; i++) {
      const x = COIN_FIELD.cellW * i;
      this.grid.moveTo(x, 0).lineTo(x, height);
    }
    for (let i = 1; i < COIN_ROWS_MAX; i++) {
      const y = COIN_FIELD.cellH * i;
      this.grid.moveTo(0, y).lineTo(width, y);
    }
    this.grid.stroke({ color: 0x3a2b4a, width: 2, alpha: 0.6 });

    // Монеты обрезаются рамкой поля: они прилетают сверху, из-за его края,
    // и без маски видно, как они летят по комнате и по счётчику респинов.
    const clip = new Graphics().rect(0, 0, width, height).fill(0xffffff);
    this.coins.mask = clip;

    this.view.addChild(backdrop, this.grid, this.locked, this.coins, clip);

    this.respinsText = label('', 28, COLOR.gold);
    this.respinsText.anchor.set(0.5, 1);
    this.respinsText.position.set(width / 2, -8);
    this.view.addChild(this.respinsText);

    this.totalText = label('', 34, COLOR.paper);
    this.totalText.anchor.set(0.5, 0);
    this.totalText.position.set(width / 2, height + 6);
    this.view.addChild(this.totalText);
  }

  /** Центр клетки в координатах поля. */
  private cellAt(index: number): { x: number; y: number } {
    const col = index % COIN_COLS;
    const row = Math.floor(index / COIN_COLS);
    return {
      x: COIN_FIELD.cellW * (col + 0.5),
      y: COIN_FIELD.cellH * (row + 0.5),
    };
  }

  /** Закрытые ряды притеняются: видно, что поле ещё может вырасти. */
  private drawLocked(): void {
    this.locked.clear();
    if (this.rows >= COIN_ROWS_MAX) return;

    const top = COIN_FIELD.cellH * this.rows;
    this.locked
      .rect(0, top, COIN_FIELD.cellW * COIN_COLS, COIN_FIELD.cellH * COIN_ROWS_MAX - top)
      .fill({ color: 0x05030a, alpha: 0.78 });
  }

  private textureFor(drop: CoinDrop): Texture {
    switch (drop.coin.kind) {
      case 'collector':
        return this.art.fist;
      case 'pump':
        return this.art.pump;
      case 'mult':
        return this.art.mult;
      default:
        return this.art[drop.coin.tier];
    }
  }

  /** Подпись на монете: номинал у обычных, у особых он нарисован. */
  private captionFor(drop: CoinDrop): string {
    if (drop.coin.kind === 'mult' || drop.coin.kind === 'pump') return '';
    return `×${Math.round(drop.coin.value)}`;
  }

  /**
   * Роняет монету в клетку.
   *
   * Монета не появляется на месте, а падает сверху — так же, как символы
   * на барабанах, только дольше. Лететь ей нужно именно долго: весь смысл
   * респина в том, упадёт монета или нет, и мгновенное появление съедает
   * это ожидание целиком.
   */
  private dropCoin(drop: CoinDrop): Promise<void> {
    const at = this.cellAt(drop.index);
    const slot = new Container();
    slot.position.set(at.x, -COIN_FIELD.cellH);

    const size = Math.min(COIN_FIELD.cellW, COIN_FIELD.cellH) - 12;
    const sprite = new Sprite(this.textureFor(drop));
    sprite.anchor.set(0.5);
    sprite.width = size;
    sprite.height = size;
    slot.addChild(sprite);

    const value = label(this.captionFor(drop), 30, 0xfff3d6, {
      stroke: { color: 0x1a0f06, width: 5 },
    });
    value.anchor.set(0.5);
    slot.addChild(value);

    this.coins.addChild(slot);
    this.slots[drop.index] = { view: slot, value, amount: drop.coin.value };

    return new Promise((resolve) => {
      gsap.to(slot, {
        y: at.y,
        duration: dur(FALL_TIME),
        // Ускорение к концу: монета падает, а не опускается.
        ease: 'power2.in',
        onComplete: () => {
          // Удар о клетку: короткое приседание и обратно.
          gsap.fromTo(
            slot.scale,
            { x: 1.16, y: 0.84 },
            { x: 1, y: 1, duration: dur(0.22), ease: 'back.out(3)' },
          );
          resolve();
        },
      });
    });
  }

  /** Начало бонуса: пустое поле, стартовые монеты, полный счётчик. */
  async start(rows: number, drops: CoinDrop[]): Promise<void> {
    this.coins.removeChildren();
    this.slots.fill(null);
    this.rows = rows;
    this.drawLocked();
    this.setRespins(COIN_RESPINS);
    this.totalText.text = '';
    this.view.visible = true;
    this.view.alpha = 0;
    gsap.to(this.view, { alpha: 1, duration: dur(0.3) });

    await this.drop(drops, rows);
  }

  /** Респин: монеты сыплются одна за другой, потом открываются новые ряды. */
  async drop(drops: CoinDrop[], rows: number): Promise<void> {
    const falling: Promise<void>[] = [];
    for (const d of drops) {
      falling.push(this.dropCoin(d));
      await pause(FALL_STAGGER);
    }
    await Promise.all(falling);

    if (rows !== this.rows) {
      this.rows = rows;
      this.drawLocked();
      const flash = new Graphics()
        .rect(0, COIN_FIELD.cellH * (rows - 1), COIN_FIELD.cellW * COIN_COLS, COIN_FIELD.cellH)
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
  async pump(ticks: PumpTick[]): Promise<void> {
    for (const tick of ticks) {
      const slot = this.slots[tick.index];
      if (!slot) continue;
      slot.amount += tick.add;
      slot.value.text = `×${Math.round(slot.amount)}`;
      gsap.fromTo(
        slot.view.scale,
        { x: 1, y: 1 },
        { x: 1.18, y: 1.18, duration: dur(0.14), yoyo: true, repeat: 1 },
      );
      await pause(130);
    }
  }

  setRespins(left: number): void {
    this.respinsText.text = left > 0 ? `РЕСПИНЫ: ${left}` : 'ПОСЛЕДНИЙ ШАНС';
  }

  /** Итог: сумма поля, множитель и, если повезло, полное поле. */
  async finish(total: number, mult: number, filled: boolean, betCoins: number): Promise<void> {
    const coins = Math.round(total * betCoins).toLocaleString('ru-RU');
    this.totalText.text = filled ? `ВСЁ ПОЛЕ! ${coins}` : mult > 1 ? `${coins}  (×${mult})` : coins;
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
