import { Container, Graphics, Text, type Renderer, type Texture } from 'pixi.js';
import { SYM_COUNT, type SymId } from '../core/types';
import { COLOR, SYM_COLOR, SYM_LABEL } from './palette';

/**
 * Временные текстуры символов — цветные плитки с подписью.
 *
 * Весь игровой слой строится и отлаживается на них: физика барабанов,
 * подсветка линий, фичи. Настоящий арт подключается на восьмом этапе заменой
 * одной этой функции, и ничего больше в коде трогать не придётся.
 */

import { REELS_AT } from './layout';

/** Сторона ячейки. Задаётся макетом: поле обязано попасть в нарисованную рамку. */
export const CELL = REELS_AT.cell;

export function buildSymbolTextures(renderer: Renderer): Texture[] {
  const textures: Texture[] = new Array(SYM_COUNT);
  const pad = 4;
  const size = CELL - pad * 2;

  for (let s = 0; s < SYM_COUNT; s++) {
    const sym = s as SymId;
    const box = new Container();

    const fill = SYM_COLOR[sym];
    const g = new Graphics();
    g.roundRect(0, 0, size, size, 10).fill(fill);
    // Верхний блик и нижняя тень — плитка перестаёт выглядеть плоской заливкой,
    // и на крутящемся барабане легче считывать движение.
    g.roundRect(3, 3, size - 6, size * 0.42, 8).fill({ color: 0xffffff, alpha: 0.12 });
    g.roundRect(0, 0, size, size, 10).stroke({ color: COLOR.ink, width: 3, alpha: 0.85 });
    box.addChild(g);

    const label = new Text({
      text: SYM_LABEL[sym],
      style: {
        fontFamily: 'Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif',
        fontSize: SYM_LABEL[sym] === '♂' ? 58 : 26,
        fill: COLOR.ink,
        stroke: { color: 0xffffff, width: 3, alpha: 0.5 },
        align: 'center',
      },
    });
    label.anchor.set(0.5);
    label.position.set(size / 2, size / 2);
    box.addChild(label);

    textures[s] = renderer.generateTexture({ target: box, resolution: 2 });
    box.destroy({ children: true });
  }

  return textures;
}
