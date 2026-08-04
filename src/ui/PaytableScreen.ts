import { Container, Graphics, Rectangle, Sprite, type Texture } from 'pixi.js';
import { RULES_SCREEN } from '../game/layout';
import { HotZone } from './HotZone';

/**
 * Экран правил.
 *
 * Сам экран — готовая картинка из набора (rules-screen.png). Поверх неё движок
 * не рисует ничего: живых значений на этом экране нет ни одного. Таблица
 * выплат, двери, цена покупки и возврат — числа постоянные.
 *
 * Отсюда единственный риск: правку в мат-модели легко не донести до картинки,
 * и правила начнут врать. Раньше от этого защищало то, что экран строился
 * прямо из PAYTABLE; теперь защищает `rulesArt.test.ts` — он держит все числа,
 * которые на картинке нарисованы, и падает с требованием перерисовать её,
 * если хоть одно в модели изменилось.
 *
 * Закрывается кнопкой «ЗАКРЫТЬ», кликом по фону вокруг панели и клавишей Esc.
 */

/** Кнопка «ЗАКРЫТЬ» в координатах самой картинки (1554x1012). */
const CLOSE_AT = { x: 1203, y: 891, w: 278, h: 82 } as const;

export class PaytableScreen {
  readonly view = new Container();

  constructor(width: number, height: number, art: Texture) {
    this.view.visible = false;

    const shade = new Graphics();
    shade.rect(0, 0, width, height).fill({ color: 0x0a0510, alpha: 0.93 });
    shade.eventMode = 'static';
    // Явная hit-область обязательна: без неё клики проходят СКВОЗЬ затемнение
    // и попадают в панель управления под ним.
    shade.hitArea = new Rectangle(0, 0, width, height);
    shade.on('pointertap', () => this.hide());
    this.view.addChild(shade);

    const panel = new Sprite(art);
    panel.position.set(RULES_SCREEN.x, RULES_SCREEN.y);
    panel.width = RULES_SCREEN.w;
    panel.height = RULES_SCREEN.h;
    // Панель перехватывает клики: иначе промах мимо кнопки закрывал бы экран.
    panel.eventMode = 'static';
    this.view.addChild(panel);

    const k = RULES_SCREEN.w / art.width;
    const close = new HotZone(
      [
        RULES_SCREEN.x + CLOSE_AT.x * k,
        RULES_SCREEN.y + CLOSE_AT.y * k,
        CLOSE_AT.w * k,
        CLOSE_AT.h * k,
      ],
      () => this.hide(),
      0xb96ce0,
    );
    this.view.addChild(close.view);
  }

  show(): void {
    this.view.visible = true;
  }

  hide(): void {
    this.view.visible = false;
  }

  get isOpen(): boolean {
    return this.view.visible;
  }
}
