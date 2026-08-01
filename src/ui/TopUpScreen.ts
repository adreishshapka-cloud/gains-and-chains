import gsap from 'gsap';
import { Container, Graphics, Rectangle } from 'pixi.js';
import { COLOR } from '../game/palette';
import { dur } from '../game/timing';
import { Button, label } from './widgets';

/**
 * Пополнение счёта.
 *
 * Монеты в игре виртуальные, покупать их не за что и не у кого, поэтому
 * порции выдаются просто так. Экран нужен не ради экономики, а чтобы кончившийся
 * баланс не превращался в тупик: без него единственным выходом была бы консоль.
 *
 * Формулировки намеренно спортзальные, а не платёжные — здесь ничего не
 * покупается, и выглядеть это должно соответственно.
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

const CARD_W = 300;
const CARD_H = 190;
const GAP = 28;

export class TopUpScreen {
  readonly view = new Container();

  private resolve: ((coins: number | null) => void) | null = null;
  private readonly cards: Container[] = [];

  constructor(width: number, height: number) {
    this.view.visible = false;

    const shade = new Graphics();
    shade.rect(0, 0, width, height).fill({ color: 0x0a0510, alpha: 0.92 });
    shade.eventMode = 'static';
    shade.hitArea = new Rectangle(0, 0, width, height);
    shade.on('pointertap', () => this.pick(null));
    this.view.addChild(shade);

    const title = label('ДОБАВИТЬ МОНЕТ', 46, COLOR.gold);
    title.anchor.set(0.5, 0);
    title.position.set(width / 2, height / 2 - 210);
    this.view.addChild(title);

    const sub = label(
      'Монеты игровые: они ничего не стоят и никуда не выводятся.',
      19,
      0x9a8aaa,
    );
    sub.anchor.set(0.5, 0);
    sub.position.set(width / 2, height / 2 - 156);
    this.view.addChild(sub);

    const totalW = TOP_UP_OPTIONS.length * CARD_W + (TOP_UP_OPTIONS.length - 1) * GAP;
    const startX = (width - totalW) / 2;
    const top = height / 2 - 96;

    for (const [i, option] of TOP_UP_OPTIONS.entries()) {
      const card = this.buildCard(option);
      card.position.set(startX + i * (CARD_W + GAP), top);
      this.cards.push(card);
      this.view.addChild(card);
    }

    const close = new Button({
      text: 'ЗАКРЫТЬ',
      width: 180,
      height: 52,
      fontSize: 22,
      onTap: () => this.pick(null),
    });
    close.view.position.set((width - 180) / 2, top + CARD_H + 44);
    this.view.addChild(close.view);
  }

  private buildCard(option: TopUpOption): Container {
    const holder = new Container();
    const card = new Container();

    const bg = new Graphics();
    bg.roundRect(0, 0, CARD_W, CARD_H, 16).fill(COLOR.dim);
    bg.roundRect(0, 0, CARD_W, CARD_H, 16).stroke({ color: COLOR.gold, width: 4 });
    card.addChild(bg);

    const name = label(option.title, 26, COLOR.gold);
    name.anchor.set(0.5, 0);
    name.position.set(CARD_W / 2, 22);
    card.addChild(name);

    const coins = label(`+${option.coins.toLocaleString('ru-RU')}`, 44, COLOR.paper);
    coins.anchor.set(0.5, 0);
    coins.position.set(CARD_W / 2, 64);
    card.addChild(coins);

    const note = label(option.note, 16, 0x9a8aaa);
    note.anchor.set(0.5, 0);
    note.position.set(CARD_W / 2, 124);
    card.addChild(note);

    card.pivot.set(CARD_W / 2, CARD_H / 2);
    card.position.set(CARD_W / 2, CARD_H / 2);
    holder.addChild(card);

    // События на обёртке: у карточки сдвинут pivot, и попадание в неё считается
    // неверно — та же ловушка, что была на экране выбора двери.
    holder.eventMode = 'static';
    holder.cursor = 'pointer';
    holder.hitArea = new Rectangle(0, 0, CARD_W, CARD_H);
    holder.on('pointerover', () =>
      gsap.to(card.scale, { x: 1.04, y: 1.04, duration: dur(0.16) }),
    );
    holder.on('pointerout', () => gsap.to(card.scale, { x: 1, y: 1, duration: dur(0.16) }));
    holder.on('pointertap', () => this.pick(option.coins));
    return holder;
  }

  private pick(coins: number | null): void {
    const done = this.resolve;
    this.resolve = null;
    this.view.visible = false;
    done?.(coins);
  }

  get isOpen(): boolean {
    return this.view.visible;
  }

  /** @returns сколько монет добавить, либо null, если игрок передумал. */
  choose(): Promise<number | null> {
    this.view.visible = true;
    for (const [i, holder] of this.cards.entries()) {
      const card = holder.children[0] as Container;
      card.scale.set(0.9);
      card.alpha = 0;
      gsap.to(card, { alpha: 1, duration: dur(0.22), delay: dur(0.06 * i) });
      gsap.to(card.scale, {
        x: 1,
        y: 1,
        duration: dur(0.3),
        delay: dur(0.06 * i),
        ease: 'back.out(2)',
      });
    }
    return new Promise((resolve) => {
      this.resolve = resolve;
    });
  }
}
