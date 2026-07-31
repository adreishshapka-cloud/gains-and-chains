import gsap from 'gsap';
import { Container, Sprite, type Texture } from 'pixi.js';
import type { SymId } from '../core/types';
import { CELL } from './placeholders';
import { ReelWindow, STRIP_CELLS } from './reelWindow';
import { dur, timing } from './timing';

/**
 * Один барабан: спрайты и физика вращения.
 *
 * Какой символ где стоит, решает ReelWindow — она вынесена отдельно и покрыта
 * тестами, потому что ошибка «остановились не на том» деньгами видна, а глазом
 * нет. Здесь остаётся только движение: разгон, кручение, доводка и удар.
 *
 * Спрайты никогда не переставляются местами — они стоят на своих y, а лента
 * «едет» за счёт смещения контейнера и подмены текстур.
 */

/** Ячеек в секунду на полном ходу. */
const MAX_SPEED = 24;
/** Разгон, ячеек в секунду за секунду. */
const ACCEL = 90;

export type ReelState = 'idle' | 'accel' | 'spin' | 'settle';

export class Reel {
  readonly view = new Container();

  private readonly strip = new Container();
  private readonly sprites: Sprite[] = [];
  private readonly textures: readonly Texture[];
  private readonly window: ReelWindow;

  /** Лента для холостого кручения. Меняется на фриспинах. */
  private source: readonly SymId[];

  private baseScale = 1;
  private offset = 0;
  private speed = 0;
  private stopRequested = false;
  private state: ReelState = 'idle';
  private onSettled: (() => void) | null = null;

  constructor(textures: readonly Texture[], source: readonly SymId[]) {
    this.textures = textures;
    this.source = source;
    this.window = new ReelWindow(() => this.randomSym());

    for (let i = 0; i < STRIP_CELLS; i++) {
      const sprite = new Sprite(textures[this.window.at(i)]);
      // Якорь по центру — чтобы выигравший символ разрастался из середины
      // ячейки, а не уползал вправо вниз.
      sprite.anchor.set(0.5);
      sprite.width = CELL;
      sprite.height = CELL;
      sprite.position.set(CELL / 2, i * CELL + CELL / 2);
      this.sprites.push(sprite);
      this.strip.addChild(sprite);
    }
    // width/height уже пересчитали scale под размер ячейки — запоминаем его
    // как единицу, от неё пляшет вся подсветка.
    this.baseScale = this.sprites[0].scale.x;

    this.view.addChild(this.strip);
    this.apply();
  }

  get isSpinning(): boolean {
    return this.state !== 'idle';
  }

  /**
   * Символы холостого кручения берутся обычным Math.random — намеренно НЕ
   * игровым Rng. Иначе анимация тратила бы числа из того же потока, что и
   * математика, и воспроизведение раунда по seed сломалось бы.
   */
  private randomSym(): SymId {
    return this.source[(Math.random() * this.source.length) | 0];
  }

  /**
   * Переключить ленту холостого кручения. На фриспинах состав символов другой,
   * и без этого барабан крутил бы одно, а останавливался на другом.
   */
  setSource(source: readonly SymId[]): void {
    this.source = source;
  }

  /** Мгновенно выставить видимые символы — старт игры, загрузка сохранения. */
  setWindow(symbols: readonly SymId[]): void {
    this.window.setVisible(symbols, () => this.randomSym());
    this.offset = 0;
    this.sync();
    this.apply();
  }

  startSpin(): void {
    gsap.killTweensOf(this);
    gsap.killTweensOf(this.strip);
    this.clearHighlights();
    this.stopRequested = false;
    this.speed = 0;
    this.state = 'accel';
  }

  /**
   * Затормозить на заданных символах окна.
   * @returns промис, который разрешится, когда барабан встанет и отыграет удар.
   */
  stopOn(symbols: readonly SymId[]): Promise<void> {
    this.window.enqueueStop(symbols);
    this.stopRequested = true;
    return new Promise((resolve) => {
      this.onSettled = resolve;
    });
  }

  update(dt: number): void {
    if (this.state !== 'accel' && this.state !== 'spin') return;

    const maxSpeed = MAX_SPEED * timing.speed;
    if (this.state === 'accel') {
      this.speed = Math.min(maxSpeed, this.speed + ACCEL * timing.speed * dt);
      if (this.speed >= maxSpeed) this.state = 'spin';
    }

    this.offset += this.speed * dt;
    while (this.offset >= 1) {
      this.offset -= 1;
      this.shift();
    }
    this.apply();

    // Все целевые символы поданы — остался последний сдвиг, его доводит settle().
    if (this.stopRequested && this.window.pending === 0) this.settle();
  }

  private settle(): void {
    this.state = 'settle';
    this.stopRequested = false;

    gsap.to(this, {
      offset: 1,
      duration: dur(0.18 + (1 - this.offset) * 0.12),
      ease: 'power2.out',
      onUpdate: () => this.apply(),
      onComplete: () => {
        this.shift();
        this.offset = 0;
        this.apply();
        this.bounce();
      },
    });
  }

  /** Короткий удар в конце — без него остановка выглядит как обрыв анимации. */
  private bounce(): void {
    const base = -CELL;
    gsap.fromTo(
      this.strip,
      { y: base },
      {
        y: base + 14,
        duration: dur(0.07),
        ease: 'sine.out',
        yoyo: true,
        repeat: 1,
        onComplete: () => {
          this.strip.y = base;
          this.state = 'idle';
          this.speed = 0;
          const done = this.onSettled;
          this.onSettled = null;
          done?.();
        },
      },
    );
  }

  /**
   * Подсветить выигравший символ в видимом ряду.
   * Пульсация повторяется, пока её не снимет clearHighlights() — показ выигрыша
   * длится столько, сколько нужно счётчику, и заранее его длительность неизвестна.
   */
  pulseCell(row: number): void {
    const sprite = this.sprites[row + 1];
    gsap.killTweensOf(sprite.scale);
    gsap.to(sprite.scale, {
      x: this.baseScale * 1.14,
      y: this.baseScale * 1.14,
      duration: 0.42,
      ease: 'sine.inOut',
      yoyo: true,
      repeat: -1,
    });
  }

  clearHighlights(): void {
    for (const sprite of this.sprites) {
      gsap.killTweensOf(sprite.scale);
      sprite.scale.set(this.baseScale);
    }
  }

  private shift(): void {
    this.window.shift(() => this.randomSym());
    this.sync();
  }

  private sync(): void {
    for (let i = 0; i < STRIP_CELLS; i++) {
      this.sprites[i].texture = this.textures[this.window.at(i)];
    }
  }

  private apply(): void {
    this.strip.y = this.offset * CELL - CELL;
  }
}
