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

      // Свечение только по контуру и наружу. Заливка всего слота, которая
      // стояла здесь раньше, закрашивала нарисованный жетон жёлтым пятном —
      // сам жетон переставало быть видно, а подсветка выглядела грубой.
      const bands = 7;
      const reach = 9;
      for (let i = bands; i >= 1; i--) {
        const t = i / bands;
        const spread = reach * t;
        light.roundRect(-spread, -spread, w + spread * 2, h + spread * 2, 7 + spread).stroke({
          color: COLOR.gold,
          width: 2,
          alpha: 0.16 * (1 - t) ** 1.2,
        });
      }
      light.roundRect(0.5, 0.5, w - 1, h - 1, 6).stroke({
        color: COLOR.gold,
        width: 2,
        alpha: 0.85,
      });

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
