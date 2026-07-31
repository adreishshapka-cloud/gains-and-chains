import gsap from 'gsap';
import { Container, Graphics, Rectangle } from 'pixi.js';
import { DOORS, type Door, type DoorId } from '../core/features/freeSpins';
import { COLOR } from '../game/palette';
import { dur } from '../game/timing';
import { Button, label } from './widgets';

/**
 * Выбор двери перед фриспинами.
 *
 * Единственный момент за всю игру, когда игрок на что-то влияет. Все три двери
 * сведены к близкому матожиданию (см. MATH.md), поэтому правильного ответа нет —
 * выбор про темперамент. Экран обязан это доносить: рядом с каждой дверью
 * написано, чем она отличается, и нигде не сказано, какая «лучше».
 */

const CARD_W = 300;
const CARD_H = 340;
const GAP = 32;

/** Чем короче забег, тем горячее цвет — подсказка про характер, а не про выгоду. */
const CARD_COLOR: Record<DoorId, number> = {
  ARM_WRESTLE: 0x3f9e7a,
  SUBMISSION: COLOR.cyan,
  FULL_NELSON: 0xd4453a,
};

export class DoorScreen {
  readonly view = new Container();

  private resolve: ((id: DoorId | null) => void) | null = null;
  private readonly cards: Container[] = [];
  private readonly cancelButton: Container;
  /** Можно ли уйти с экрана без выбора. */
  private cancellable = false;

  constructor(width: number, height: number) {
    this.view.visible = false;

    const shade = new Graphics();
    shade.rect(0, 0, width, height).fill({ color: 0x0a0510, alpha: 0.9 });
    shade.eventMode = 'static';
    // Без hit-области клики проваливаются на панель управления под экраном.
    shade.hitArea = new Rectangle(0, 0, width, height);
    shade.on('pointertap', () => this.cancel());
    this.view.addChild(shade);

    const title = label('ВЫБЕРИ ДВЕРЬ', 46, COLOR.gold);
    title.anchor.set(0.5, 0);
    title.position.set(width / 2, 92);
    this.view.addChild(title);

    const sub = label('Три пути в подземелье. Ни один не лучше — они просто разные.', 19, 0x9a8aaa);
    sub.anchor.set(0.5, 0);
    sub.position.set(width / 2, 148);
    this.view.addChild(sub);

    const totalW = DOORS.length * CARD_W + (DOORS.length - 1) * GAP;
    const startX = (width - totalW) / 2;

    for (const [i, door] of DOORS.entries()) {
      const card = this.buildCard(door);
      card.position.set(startX + i * (CARD_W + GAP), 210);
      this.cards.push(card);
      this.view.addChild(card);
    }

    // Отказ доступен только при покупке бонуса: там игрок ещё ничего не потратил.
    // Когда дверь выпала по scatter'ам, раунд уже оплачен обычной ставкой,
    // и уйти с экрана значило бы просто потерять его.
    this.cancelButton = new Button({
      text: 'ПЕРЕДУМАЛ',
      width: 240,
      height: 54,
      fontSize: 21,
      onTap: () => this.cancel(),
    }).view;
    this.cancelButton.position.set((width - 240) / 2, 210 + CARD_H + 46);
    this.view.addChild(this.cancelButton);
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

  private buildCard(door: Door): Container {
    const card = new Container();
    const accent = CARD_COLOR[door.id];

    const bg = new Graphics();
    bg.roundRect(0, 0, CARD_W, CARD_H, 16).fill(COLOR.dim);
    bg.roundRect(0, 0, CARD_W, CARD_H, 16).stroke({ color: accent, width: 5 });
    card.addChild(bg);

    const name = label(door.title, 30, accent);
    name.anchor.set(0.5, 0);
    name.position.set(CARD_W / 2, 28);
    card.addChild(name);

    const mood = label(door.subtitle, 17, 0x9a8aaa);
    mood.anchor.set(0.5, 0);
    mood.position.set(CARD_W / 2, 66);
    card.addChild(mood);

    const spins = label(String(door.spins), 76, COLOR.paper);
    spins.anchor.set(0.5, 0);
    spins.position.set(CARD_W / 2, 108);
    card.addChild(spins);

    const spinsCap = label('СПИНОВ', 17, 0x9a8aaa);
    spinsCap.anchor.set(0.5, 0);
    spinsCap.position.set(CARD_W / 2, 196);
    card.addChild(spinsCap);

    const mult = label(`старт ×${door.startMult}`, 30, COLOR.gold);
    mult.anchor.set(0.5, 0);
    mult.position.set(CARD_W / 2, 230);
    card.addChild(mult);

    const hint = label('каждый ♂ даёт +1', 16, 0x9a8aaa);
    hint.anchor.set(0.5, 0);
    hint.position.set(CARD_W / 2, 272);
    card.addChild(hint);

    const pick = new Graphics();
    pick.roundRect(24, 296, CARD_W - 48, 30, 8).fill(accent);
    card.addChild(pick);

    const pickText = label('ВЫБРАТЬ', 19, COLOR.ink);
    pickText.anchor.set(0.5);
    pickText.position.set(CARD_W / 2, 311);
    card.addChild(pickText);

    // Точка отсчёта — центр карточки, иначе при наведении она уползает вправо вниз.
    card.pivot.set(CARD_W / 2, CARD_H / 2);
    card.position.set(CARD_W / 2, CARD_H / 2);

    // События висят на обёртке, а не на самой карточке: сдвинутый pivot ломает
    // попадание в hitArea, и клики просто не доходят. Обёртка стоит без сдвигов,
    // поэтому её прямоугольник совпадает с тем, что видит игрок.
    const holder = new Container();
    holder.addChild(card);
    holder.eventMode = 'static';
    holder.cursor = 'pointer';
    holder.hitArea = new Rectangle(0, 0, CARD_W, CARD_H);
    holder.on('pointerover', () => gsap.to(card.scale, { x: 1.04, y: 1.04, duration: dur(0.16) }));
    holder.on('pointerout', () => gsap.to(card.scale, { x: 1, y: 1, duration: dur(0.16) }));
    holder.on('pointertap', () => this.pick(door.id));
    return holder;
  }

  private pick(id: DoorId): void {
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
   * @returns выбранная дверь либо null, если игрок передумал.
   */
  choose(cancellable = false): Promise<DoorId | null> {
    this.cancellable = cancellable;
    this.cancelButton.visible = cancellable;
    this.view.visible = true;
    for (const [i, holder] of this.cards.entries()) {
      const card = holder.children[0] as Container;
      card.scale.set(0.86);
      card.alpha = 0;
      gsap.to(card, { alpha: 1, duration: dur(0.24), delay: dur(0.07 * i) });
      gsap.to(card.scale, {
        x: 1,
        y: 1,
        duration: dur(0.34),
        delay: dur(0.07 * i),
        ease: 'back.out(2)',
      });
    }
    return new Promise((resolve) => {
      this.resolve = resolve;
    });
  }

  /** Аварийный выход: выбрать за игрока, если экран нужно закрыть принудительно. */
  forcePick(id: DoorId): void {
    if (this.resolve) this.pick(id);
  }

  /** Разрешён ли сейчас отказ — по этому Game решает, реагировать ли на Escape. */
  get canCancel(): boolean {
    return this.cancellable;
  }
}
