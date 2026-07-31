import gsap from 'gsap';
import { Container, Graphics, Rectangle } from 'pixi.js';
import { COLOR } from '../game/palette';
import { dur } from '../game/timing';
import type { Rect } from '../game/layout';

/**
 * Кликабельная зона поверх кнопки, нарисованной на фоне.
 *
 * Сама кнопка уже есть на макете — рисовать её заново означало бы положить
 * поверх худшую копию. Зона добавляет только то, чего у картинки быть не может:
 * реакцию на курсор, свечение включённого режима и гашение, когда кнопка
 * недоступна.
 */
export class HotZone {
  readonly view = new Container();

  private readonly glow = new Graphics();
  private readonly veil = new Graphics();
  private enabled = true;
  private active = false;
  private hovered = false;

  constructor(rect: Rect, onTap: () => void, accent: number = COLOR.gold) {
    const [x, y, w, h] = rect;
    // Центр как точка отсчёта — чтобы утопление при нажатии шло от середины,
    // а не тянуло кнопку вправо вниз.
    this.view.pivot.set(w / 2, h / 2);
    this.view.position.set(x + w / 2, y + h / 2);

    // Свечение рисуется несколькими вложенными рамками с падающей прозрачностью:
    // дешёвый способ получить мягкий ореол без фильтров, которые на слабых
    // машинах стоят заметно дороже.
    for (let i = 4; i >= 1; i--) {
      this.glow
        .roundRect(-i * 3, -i * 3, w + i * 6, h + i * 6, 10 + i * 2)
        .stroke({ color: accent, width: 3, alpha: 0.16 });
    }
    this.glow.roundRect(0, 0, w, h, 8).fill({ color: accent, alpha: 0.14 });
    this.glow.alpha = 0;
    this.view.addChild(this.glow);

    this.veil.roundRect(0, 0, w, h, 8).fill({ color: 0x0a0510, alpha: 0.62 });
    this.veil.visible = false;
    this.view.addChild(this.veil);

    this.view.eventMode = 'static';
    this.view.cursor = 'pointer';
    this.view.hitArea = new Rectangle(0, 0, w, h);
    this.view.on('pointerover', () => {
      this.hovered = true;
      this.refresh();
    });
    this.view.on('pointerout', () => {
      this.hovered = false;
      this.refresh();
    });
    this.view.on('pointerdown', () => {
      if (this.enabled) this.press();
    });
    this.view.on('pointertap', () => {
      if (this.enabled) onTap();
    });
  }

  /** Короткое утопление — единственный отклик, который картинка дать не может. */
  private press(): void {
    gsap.killTweensOf(this.view.scale);
    this.view.scale.set(0.96);
    gsap.to(this.view.scale, { x: 1, y: 1, duration: dur(0.16), ease: 'back.out(3)' });
  }

  private refresh(): void {
    const target = !this.enabled ? 0 : this.active ? 1 : this.hovered ? 0.55 : 0;
    gsap.killTweensOf(this.glow);
    gsap.to(this.glow, { alpha: target, duration: dur(0.18) });
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    this.view.cursor = on ? 'pointer' : 'default';
    this.veil.visible = !on;
    this.refresh();
  }

  /** Режим включён — зона светится постоянно. */
  setActive(on: boolean): void {
    this.active = on;
    this.refresh();
  }

  /** Медленная пульсация: так подсвечивается SPIN, когда игра ждёт хода. */
  pulse(on: boolean): void {
    gsap.killTweensOf(this.glow);
    if (!on) {
      this.refresh();
      return;
    }
    this.glow.alpha = 0.2;
    gsap.to(this.glow, {
      alpha: 0.62,
      duration: dur(1.1),
      ease: 'sine.inOut',
      yoyo: true,
      repeat: -1,
    });
  }
}
