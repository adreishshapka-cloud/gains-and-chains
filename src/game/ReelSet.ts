import { Container, Graphics, type Texture } from 'pixi.js';
import type { ReelSet as CoreReelSet } from '../core/reels';
import { REELS, ROWS, Sym, type Grid } from '../core/types';
import { CELL } from './placeholders';
import { COLOR } from './palette';
import { Reel } from './Reel';
import { pause } from './timing';

/**
 * Пять барабанов в общем окне.
 *
 * Барабаны останавливаются по очереди слева направо — это не украшение,
 * а способ растянуть развязку: игрок читает результат постепенно.
 * Если к четвёртому барабану на поле уже два scatter'а, оставшиеся крутятся
 * заметно дольше. Этот приём (anticipation) стоит слоту почти ничего,
 * а даёт лучшие несколько секунд во всей игре.
 */

/** Пауза между остановками соседних барабанов, мс. */
const STOP_GAP = 170;
/** Сколько крутится первый барабан после команды, мс. */
const FIRST_STOP_DELAY = 520;
/** Удлинённая пауза, когда на подходе третий scatter. */
const ANTICIPATION_DELAY = 1250;

const WIDTH = REELS * CELL;
const HEIGHT = ROWS * CELL;

export class ReelSet {
  readonly view = new Container();
  readonly width = WIDTH;
  readonly height = HEIGHT;

  private readonly reels: Reel[] = [];
  private readonly glow: Graphics;

  constructor(textures: readonly Texture[], strips: CoreReelSet) {
    const backdrop = new Graphics();
    backdrop.roundRect(-10, -10, WIDTH + 20, HEIGHT + 20, 14).fill(COLOR.ink);
    backdrop.roundRect(-10, -10, WIDTH + 20, HEIGHT + 20, 14).stroke({
      color: COLOR.brick,
      width: 6,
    });
    this.view.addChild(backdrop);

    const window = new Container();
    for (let i = 0; i < REELS; i++) {
      const reel = new Reel(textures, strips[i]);
      reel.view.x = i * CELL;
      this.reels.push(reel);
      window.addChild(reel.view);
    }

    const mask = new Graphics();
    mask.rect(0, 0, WIDTH, HEIGHT).fill(0xffffff);
    window.addChild(mask);
    window.mask = mask;
    this.view.addChild(window);

    // Подсветка, которая загорается в момент anticipation.
    this.glow = new Graphics();
    this.glow.roundRect(-10, -10, WIDTH + 20, HEIGHT + 20, 14).stroke({
      color: COLOR.cyan,
      width: 6,
    });
    this.glow.alpha = 0;
    this.view.addChild(this.glow);
  }

  get isSpinning(): boolean {
    return this.reels.some((r) => r.isSpinning);
  }

  /** Слой поверх окна барабанов — линии выплат и счётчик выигрыша. */
  get overlayParent(): Container {
    return this.view;
  }

  /** Подсветить выигравший символ. */
  pulse(reel: number, row: number): void {
    this.reels[reel].pulseCell(row);
  }

  clearHighlights(): void {
    for (const reel of this.reels) reel.clearHighlights();
  }

  /** Переключить набор лент — базовая игра или фриспины. */
  setStrips(strips: CoreReelSet): void {
    for (let i = 0; i < REELS; i++) this.reels[i].setSource(strips[i]);
  }

  /** Мгновенно показать поле — старт игры, загрузка сохранения, отладка. */
  setGrid(grid: Grid): void {
    for (let i = 0; i < REELS; i++) this.reels[i].setWindow(grid[i]);
  }

  /** Прокрутить и остановиться на переданном поле. */
  async spin(grid: Grid): Promise<void> {
    for (const reel of this.reels) reel.startSpin();

    let scatters = 0;
    for (let i = 0; i < REELS; i++) {
      // Anticipation имеет смысл только там, где третий scatter ещё может выпасть.
      const anticipate = scatters >= 2 && i >= 2;
      if (anticipate) this.setGlow(true);

      await pause(i === 0 ? FIRST_STOP_DELAY : anticipate ? ANTICIPATION_DELAY : STOP_GAP);
      await this.reels[i].stopOn(grid[i]);

      for (let row = 0; row < ROWS; row++) {
        if (grid[i][row] === Sym.SCATTER) scatters++;
      }
      if (anticipate) this.setGlow(false);
    }
  }

  update(dt: number): void {
    for (const reel of this.reels) reel.update(dt);
  }

  private setGlow(on: boolean): void {
    this.glow.alpha = on ? 1 : 0;
  }
}
