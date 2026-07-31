import { Container, Graphics, Text } from 'pixi.js';
import type { StickyWild } from '../core/types';
import { COLOR } from './palette';
import { CELL } from './placeholders';
import { label } from '../ui/widgets';

/**
 * Отметки липких ♂ поверх барабанов.
 *
 * Без этого слоя фича невидима: на поле просто лежит ещё один золотой символ,
 * и понять, что он останется на месте и уже дорос до ×3, нельзя ниоткуда.
 * Рамка говорит «этот никуда не денется», бейдж — на сколько он умножает.
 */

export type StickyMode = 'base' | 'free';

export class StickyOverlay {
  readonly view = new Container();

  private readonly frames = new Graphics();
  /** Бейджи переиспользуются: липких на поле не бывает больше, чем ячеек. */
  private readonly badges: Text[] = [];

  constructor() {
    this.view.addChild(this.frames);
  }

  /**
   * @param mode в базовой игре у каждого ♂ свой множитель по лестнице,
   *        во фриспинах все равны и дают по +1 к общему множителю раунда.
   */
  update(sticky: readonly StickyWild[], mode: StickyMode): void {
    this.frames.clear();
    for (const badge of this.badges) badge.visible = false;

    for (const [i, s] of sticky.entries()) {
      const x = s.reel * CELL;
      const y = s.row * CELL;

      this.frames.roundRect(x + 3, y + 3, CELL - 6, CELL - 6, 10).stroke({
        color: COLOR.gold,
        width: 4,
        alpha: 0.95,
      });
      // Уголки — чтобы рамка липкого не путалась с рамкой выигрышной линии,
      // которая рисуется в цвет своей линии и живёт только во время показа.
      const c = 16;
      this.frames.moveTo(x + 3, y + 3 + c).lineTo(x + 3, y + 3).lineTo(x + 3 + c, y + 3);
      this.frames
        .moveTo(x + CELL - 3 - c, y + CELL - 3)
        .lineTo(x + CELL - 3, y + CELL - 3)
        .lineTo(x + CELL - 3, y + CELL - 3 - c);
      this.frames.stroke({ color: COLOR.paper, width: 5, alpha: 0.9 });

      const text = mode === 'base' ? `×${s.mult}` : '+1';
      const badge = this.badgeAt(i);
      badge.text = text;
      badge.visible = true;
      badge.position.set(x + CELL - 10, y + 8);

      // Подложка уходит в frames, который лежит первым в контейнере,
      // поэтому текст бейджа всегда оказывается поверх неё.
      this.frames.roundRect(x + CELL - 10 - badge.width - 8, y + 5, badge.width + 14, 26, 8).fill({
        color: COLOR.ink,
        alpha: 0.92,
      });
    }
  }

  private badgeAt(index: number): Text {
    while (this.badges.length <= index) {
      const badge = label('', 19, COLOR.gold);
      badge.anchor.set(1, 0);
      badge.visible = false;
      this.badges.push(badge);
      this.view.addChild(badge);
    }
    return this.badges[index];
  }

  clear(): void {
    this.frames.clear();
    for (const badge of this.badges) badge.visible = false;
  }
}
