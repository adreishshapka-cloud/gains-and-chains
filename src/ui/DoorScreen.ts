import gsap from 'gsap';
import { Container, Graphics, Rectangle } from 'pixi.js';
import { COIN_CELLS, COIN_RESPINS, COIN_VALUES } from '../core/features/coinRush';
import { DOORS } from '../core/features/freeSpins';
import type { BonusId } from '../core/round';
import { COLOR } from '../game/palette';
import { dur } from '../game/timing';
import { Button, label } from './widgets';

/**
 * Выбор бонуса перед входом в подземелье.
 *
 * Единственный момент за всю игру, когда игрок на что-то влияет. Обе двери
 * сведены к близкому матожиданию симулятором (см. MATH.md), поэтому правильного
 * ответа нет — выбор про темперамент. Экран обязан это доносить: рядом с каждой
 * дверью написано, чем она отличается, и нигде не сказано, какая «лучше».
 *
 * Дверей было три, и все три вели во фриспины с разной длиной раунда. Замеры
 * показали разброс матожидания в четыре процентных пункта, то есть выбор был
 * не про темперамент, а про арифметику. Теперь их две, и они противоположны
 * по устройству: множитель против накопления.
 */

const CARD_W = 320;
const CARD_H = 340;
const GAP = 48;

/** Крупнейший номинал монеты — на карточке он обещание, а не мелкий шрифт. */
const TOP_COIN = COIN_VALUES.reduce((m, c) => Math.max(m, c.value), 0);

interface BonusCard {
  id: BonusId;
  title: string;
  subtitle: string;
  /** Крупное число в середине карточки и подпись под ним. */
  big: string;
  bigCap: string;
  /** Строка про главную ручку бонуса. */
  line: string;
  hint: string;
  color: number;
}

function cards(): BonusCard[] {
  const door = DOORS[0];
  return [
    {
      id: door.id,
      title: door.title,
      subtitle: 'Всё или ничего',
      big: String(door.spins),
      bigCap: 'СПИНОВ',
      line: `старт ×${door.startMult}`,
      hint: 'каждый ♂ даёт +1',
      color: 0xd4453a,
    },
    {
      id: 'OIL_RUSH',
      title: 'OIL RUSH',
      subtitle: 'Шаг за шагом',
      big: String(COIN_CELLS),
      bigCap: 'КЛЕТОК',
      line: `монеты до ×${TOP_COIN}`,
      hint: `новая монета — снова ${COIN_RESPINS} респина`,
      color: COLOR.cyan,
    },
  ];
}

export class DoorScreen {
  readonly view = new Container();

  private resolve: ((id: BonusId | null) => void) | null = null;
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

    const title = label('ВЫБЕРИ БОНУС', 46, COLOR.gold);
    title.anchor.set(0.5, 0);
    title.position.set(width / 2, 92);
    this.view.addChild(title);

    const sub = label('Два пути в подземелье. Ни один не лучше — они просто разные.', 19, 0x9a8aaa);
    sub.anchor.set(0.5, 0);
    sub.position.set(width / 2, 148);
    this.view.addChild(sub);

    const list = cards();
    const totalW = list.length * CARD_W + (list.length - 1) * GAP;
    const startX = (width - totalW) / 2;

    for (const [i, door] of list.entries()) {
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

  private buildCard(door: BonusCard): Container {
    const card = new Container();
    const accent = door.color;

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

    const spins = label(door.big, 76, COLOR.paper);
    spins.anchor.set(0.5, 0);
    spins.position.set(CARD_W / 2, 108);
    card.addChild(spins);

    const spinsCap = label(door.bigCap, 17, 0x9a8aaa);
    spinsCap.anchor.set(0.5, 0);
    spinsCap.position.set(CARD_W / 2, 196);
    card.addChild(spinsCap);

    const mult = label(door.line, 30, COLOR.gold);
    mult.anchor.set(0.5, 0);
    mult.position.set(CARD_W / 2, 230);
    card.addChild(mult);

    const hint = label(door.hint, 16, 0x9a8aaa);
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
   * @returns выбранная дверь либо null, если игрок передумал.
   */
  choose(cancellable = false): Promise<BonusId | null> {
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
  forcePick(id: BonusId): void {
    if (this.resolve) this.pick(id);
  }

  /** Разрешён ли сейчас отказ — по этому Game решает, реагировать ли на Escape. */
  get canCancel(): boolean {
    return this.cancellable;
  }
}
