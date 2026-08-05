import gsap from 'gsap';
import { Container, Graphics, Rectangle, Sprite, type Texture } from 'pixi.js';
import type { BonusId } from '../core/round';
import { CHOICE_SCREEN } from '../game/layout';
import { dur } from '../game/timing';
import { HotZone } from './HotZone';

/**
 * Выбор бонуса перед входом в подземелье.
 *
 * Единственный момент за всю игру, когда игрок на что-то влияет. Оба бонуса
 * сведены к близкому матожиданию симулятором (см. MATH.md), поэтому правильного
 * ответа нет — выбор про темперамент. Экран это и говорит прямо: «ни один
 * не лучше — они просто разные».
 *
 * Сам экран — готовая картинка из набора. Живых значений на нём нет: и число
 * спинов, и стартовый множитель, и размер поля — постоянные. Чтобы картинка
 * не разошлась с моделью молча, её числа закреплены `rulesArt.test.ts`.
 */

/** Карточки и кнопка отказа в координатах картинки (1536x1024). */
const CARDS: readonly { id: BonusId; box: [number, number, number, number] }[] = [
  { id: 'FULL_NELSON', box: [153, 195, 588, 690] },
  { id: 'OIL_RUSH', box: [790, 195, 593, 690] },
];
const CANCEL_AT: [number, number, number, number] = [476, 900, 477, 92];

export class DoorScreen {
  readonly view = new Container();

  private resolve: ((id: BonusId | null) => void) | null = null;
  private readonly panel = new Container();
  private readonly cancelZone: HotZone;
  /** Заглушка поверх нарисованной кнопки «ПЕРЕДУМАЛ», когда отказ запрещён. */
  private readonly cancelOff = new Graphics();
  private cancellable = false;

  constructor(width: number, height: number, art: Texture) {
    this.view.visible = false;

    const shade = new Graphics();
    shade.rect(0, 0, width, height).fill({ color: 0x0a0510, alpha: 0.9 });
    shade.eventMode = 'static';
    // Без hit-области клики проваливаются на панель управления под экраном.
    shade.hitArea = new Rectangle(0, 0, width, height);
    shade.on('pointertap', () => this.cancel());
    this.view.addChild(shade, this.panel);

    this.panel.position.set(CHOICE_SCREEN.x, CHOICE_SCREEN.y);

    const backdrop = new Sprite(art);
    backdrop.width = CHOICE_SCREEN.w;
    backdrop.height = CHOICE_SCREEN.h;
    backdrop.eventMode = 'static';
    this.panel.addChild(backdrop);

    const k = CHOICE_SCREEN.w / art.width;
    const at = (box: [number, number, number, number]): [number, number, number, number] => [
      box[0] * k,
      box[1] * k,
      box[2] * k,
      box[3] * k,
    ];

    for (const card of CARDS) {
      const zone = new HotZone(
        at(card.box),
        () => this.pick(card.id),
        card.id === 'OIL_RUSH' ? 0x35e0d8 : 0xc74be8,
      );
      this.panel.addChild(zone.view);
    }

    const [cx, cy, cw, ch] = at(CANCEL_AT);
    this.cancelOff.roundRect(cx, cy, cw, ch, 10).fill({ color: 0x0a0510, alpha: 0.78 });
    this.panel.addChild(this.cancelOff);

    this.cancelZone = new HotZone(at(CANCEL_AT), () => this.cancel());
    this.panel.addChild(this.cancelZone.view);
  }

  private cancel(): void {
    if (!this.cancellable) return;
    const done = this.resolve;
    this.resolve = null;
    this.view.visible = false;
    done?.(null);
  }

  /** Закрыть по Escape — работает только там, где отказ вообще разрешён. */
  requestClose(): void {
    this.cancel();
  }

  private pick(id: BonusId): void {
    const done = this.resolve;
    this.resolve = null;
    this.view.visible = false;
    done?.(id);
  }

  get isOpen(): boolean {
    return this.view.visible;
  }

  /**
   * Показывает экран и ждёт решения.
   * @param cancellable разрешён ли отказ. При покупке бонуса — да: игрок ещё
   *        ничего не потратил. Когда дверь выпала по scatter'ам — нет: раунд
   *        уже оплачен ставкой, и уход с экрана означал бы потерю денег.
   * @returns выбранный бонус либо null, если игрок передумал.
   */
  choose(cancellable = false): Promise<BonusId | null> {
    this.cancellable = cancellable;
    // Кнопка нарисована на картинке всегда, поэтому запрещённый отказ
    // не прячется, а гасится: видно, что кнопка есть, но сейчас не её черёд.
    this.cancelOff.visible = !cancellable;
    this.cancelZone.view.visible = cancellable;
    this.view.visible = true;

    this.panel.alpha = 0;
    this.panel.scale.set(0.94);
    gsap.to(this.panel, { alpha: 1, duration: dur(0.26) });
    gsap.to(this.panel.scale, { x: 1, y: 1, duration: dur(0.34), ease: 'back.out(1.8)' });

    return new Promise((resolve) => {
      this.resolve = resolve;
    });
  }

  /** Аварийный выход: выбрать за игрока, если экран нужно закрыть принудительно. */
  forcePick(id: BonusId): void {
    if (this.resolve) this.pick(id);
  }

  /** Разрешён ли сейчас отказ — по этому Game решает, реагировать ли на Escape. */
  get canCancel(): boolean {
    return this.cancellable;
  }
}
