import gsap from 'gsap';
import { Container, Graphics } from 'pixi.js';
import { BELT_TARGET } from '../core/features/beltCollection';
import { BELT_SLOTS } from './layout';
import { COLOR } from './palette';
import { dur } from './timing';

/**
 * Накопитель билетов в подземелье.
 *
 * Сами билеты нарисованы на готовой панели из набора (TICKET_PANEL), поэтому
 * здесь их не рисуют — здесь ими управляют: несобранный гасится тёмной
 * плёнкой поверх, собранный открывается и обводится свечением. Рисовать
 * билеты движком пробовали: свои спрайты поверх панели давали второй ряд
 * билетов, чуть смещённый относительно нарисованного.
 *
 * Смысл полосы в том, чтобы дать глазу зацепку на глухих отрезках: игрок
 * видит, что даже пустой спин куда-то ведёт.
 */

/** Насколько гасится несобранный билет. */
const VEIL_ALPHA = 0.72;

export class BeltStrip {
  readonly view = new Container();

  private readonly lights: Graphics[] = [];
  private readonly veils: Graphics[] = [];
  private filled = 0;

  constructor() {
    for (const [x, y, w, h] of BELT_SLOTS) {
      // Плёнка чуть шире билета: у нарисованного края мягкие, и точно по
      // размеру она оставляла по контуру светлую кайму.
      const veil = new Graphics()
        .roundRect(x - 2, y - 2, w + 4, h + 4, 4)
        .fill({ color: 0x0d0a12, alpha: VEIL_ALPHA });
      this.veils.push(veil);
      this.view.addChild(veil);
    }

    for (const [x, y, w, h] of BELT_SLOTS) {
      const light = new Graphics();

      // Свечение только по контуру и наружу. Заливка всего слота, которая
      // стояла здесь раньше, закрашивала жетон жёлтым пятном — сам жетон
      // переставало быть видно, а подсветка выглядела грубой.
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
      this.veils[i].visible = i >= this.filled;
    }

    if (animate && this.filled > previous) {
      const light = this.lights[this.filled - 1];
      gsap.killTweensOf(light.scale);
      light.scale.set(1.7);
      gsap.to(light.scale, { x: 1, y: 1, duration: dur(0.42), ease: 'back.out(3)' });
    }
  }
}
