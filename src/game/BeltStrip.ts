import gsap from 'gsap';
import { Container, Graphics } from 'pixi.js';
import { BELT_TARGET } from '../core/features/beltCollection';
import { BELT_SLOTS } from './layout';
import { COLOR } from './palette';
import { dur } from './timing';

/**
 * Подсветка чемпионских жетонов.
 *
 * Сами слоты нарисованы на фоне — здесь только свечение поверх заполненных.
 * Смысл полосы в том, чтобы дать глазу зацепку на глухих отрезках: игрок
 * видит, что даже пустой спин куда-то ведёт.
 */
export class BeltStrip {
  readonly view = new Container();

  private readonly lights: Graphics[] = [];
  private filled = 0;

  constructor() {
    for (const [x, y, w, h] of BELT_SLOTS) {
      const light = new Graphics();
      // Несколько рамок с падающей прозрачностью дают мягкий ореол
      // без фильтров, которые заметно дороже на слабых машинах.
      for (let i = 3; i >= 1; i--) {
        light
          .roundRect(-i * 3, -i * 3, w + i * 6, h + i * 6, 8 + i * 2)
          .stroke({ color: COLOR.gold, width: 3, alpha: 0.18 });
      }
      light.roundRect(0, 0, w, h, 7).fill({ color: COLOR.gold, alpha: 0.3 });
      light.position.set(x, y);
      light.pivot.set(w / 2, h / 2);
      light.position.set(x + w / 2, y + h / 2);
      light.alpha = 0;
      this.lights.push(light);
      this.view.addChild(light);
    }
  }

  /** @param animate подсветить только что упавший жетон. */
  set(tokens: number, animate = false): void {
    const previous = this.filled;
    this.filled = Math.max(0, Math.min(BELT_TARGET, tokens));

    for (const [i, light] of this.lights.entries()) {
      gsap.killTweensOf(light);
      light.alpha = i < this.filled ? 1 : 0;
    }

    if (animate && this.filled > previous) {
      const light = this.lights[this.filled - 1];
      gsap.killTweensOf(light.scale);
      light.scale.set(1.7);
      gsap.to(light.scale, { x: 1, y: 1, duration: dur(0.42), ease: 'back.out(3)' });
    }
  }
}
