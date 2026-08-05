import gsap from 'gsap';
import { Container, Graphics, Rectangle, Sprite, type Texture } from 'pixi.js';
import { TOPUP_SCREEN } from '../game/layout';
import { dur } from '../game/timing';
import { HotZone } from './HotZone';

/**
 * Пополнение счёта.
 *
 * Монеты в игре виртуальные, покупать их не за что и не у кого, поэтому
 * порции выдаются просто так. Экран нужен не ради экономики, а чтобы кончившийся
 * баланс не превращался в тупик: без него единственным выходом была бы консоль.
 *
 * Формулировки намеренно спортзальные, а не платёжные — здесь ничего
 * не покупается, и выглядеть это должно соответственно.
 *
 * Экран — готовая картинка из набора; порции на ней нарисованы, а движок
 * добавляет только зоны нажатия. Числа порций держит `rulesArt.test.ts`,
 * чтобы картинка и код не разошлись молча.
 */

export interface TopUpOption {
  coins: number;
  title: string;
  note: string;
}

export const TOP_UP_OPTIONS: readonly TopUpOption[] = [
  { coins: 5_000, title: 'РАЗМИНКА', note: 'подход на пробу' },
  { coins: 20_000, title: 'РАБОЧИЙ ВЕС', note: 'обычная тренировка' },
  { coins: 100_000, title: 'МАКСИМУМ', note: 'VAN одобряет' },
];

/** Карточки порций и «ЗАКРЫТЬ» в координатах картинки (1672x941). */
const CARD_BOXES: readonly [number, number, number, number][] = [
  [91, 254, 475, 416],
  [594, 254, 480, 416],
  [1102, 254, 478, 416],
];
const CLOSE_AT: [number, number, number, number] = [608, 714, 449, 129];

export class TopUpScreen {
  readonly view = new Container();

  private resolve: ((coins: number | null) => void) | null = null;
  private readonly panel = new Container();

  constructor(width: number, height: number, art: Texture) {
    this.view.visible = false;

    const shade = new Graphics();
    shade.rect(0, 0, width, height).fill({ color: 0x0a0510, alpha: 0.92 });
    shade.eventMode = 'static';
    shade.hitArea = new Rectangle(0, 0, width, height);
    shade.on('pointertap', () => this.pick(null));
    this.view.addChild(shade, this.panel);

    this.panel.position.set(TOPUP_SCREEN.x, TOPUP_SCREEN.y);

    const backdrop = new Sprite(art);
    backdrop.width = TOPUP_SCREEN.w;
    backdrop.height = TOPUP_SCREEN.h;
    backdrop.eventMode = 'static';
    this.panel.addChild(backdrop);

    const k = TOPUP_SCREEN.w / art.width;
    const at = (box: [number, number, number, number]): [number, number, number, number] => [
      box[0] * k,
      box[1] * k,
      box[2] * k,
      box[3] * k,
    ];

    for (const [i, box] of CARD_BOXES.entries()) {
      const zone = new HotZone(at(box), () => this.pick(TOP_UP_OPTIONS[i].coins));
      this.panel.addChild(zone.view);
    }

    const close = new HotZone(at(CLOSE_AT), () => this.pick(null), 0xc0553c);
    this.panel.addChild(close.view);
  }

  private pick(coins: number | null): void {
    const done = this.resolve;
    this.resolve = null;
    this.view.visible = false;
    done?.(coins);
  }

  /** Закрыть по Escape. */
  requestClose(): void {
    this.pick(null);
  }

  get isOpen(): boolean {
    return this.view.visible;
  }

  /** Показывает экран и ждёт выбора порции. null — закрыл, ничего не взял. */
  choose(): Promise<number | null> {
    this.view.visible = true;
    this.panel.alpha = 0;
    this.panel.scale.set(0.94);
    gsap.to(this.panel, { alpha: 1, duration: dur(0.26) });
    gsap.to(this.panel.scale, { x: 1, y: 1, duration: dur(0.34), ease: 'back.out(1.8)' });

    return new Promise((resolve) => {
      this.resolve = resolve;
    });
  }
}
