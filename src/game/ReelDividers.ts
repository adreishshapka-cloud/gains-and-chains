import { Container, Graphics } from 'pixi.js';
import { REELS, ROWS } from '../core/types';
import { REELS_AT } from './layout';

/**
 * Разметка поля: пунктирная золотая строчка по границам ячеек.
 *
 * Поле на макете — сплошной тёмный прямоугольник, и пять колонок в нём
 * читаются только по расстоянию между символами. Строчка даёт им границу
 * и заодно поддерживает тему: она выглядит как прошивка по коже, что рифмуется
 * с ремнями и сбруей на самих символах.
 *
 * Первым заходом здесь висели вертикальные цепи из того же звена, что и символ
 * CHAIN. От них отказались: цепь — сама по себе символ, и второй такой же
 * рисунок между барабанами спорил с ним, а не разделял поле.
 *
 * Слой лежит ПОД символами: строчка — это разметка поля, а не решётка поверх
 * игры, и символ должен её перекрывать, когда доходит до края ячейки.
 *
 * Координаты МЕСТНЫЕ, от левого верхнего угла поля: слой добавляется внутрь
 * контейнера барабанов, который сам уже стоит в REELS_AT.
 */

/** Длина штриха и просвет между штрихами. Сняты с образца в наборе ассетов. */
const DASH = 8;
const GAP = 5;
const WIDTH = 2;
const COLOR_STITCH = 0xb8863c;
const ALPHA = 0.55;

/** Отступ строчки от края поля: вплотную она сливается с нарисованной рамкой. */
const INSET = 3;

export class ReelDividers {
  readonly view = new Container();

  constructor() {
    const cell = REELS_AT.cell;
    const w = REELS * cell;
    const h = ROWS * cell;
    const g = new Graphics();

    const dashRow = (y: number, from: number, to: number) => {
      for (let x = from; x < to; x += DASH + GAP) {
        g.moveTo(x, y).lineTo(Math.min(x + DASH, to), y);
      }
    };
    const dashColumn = (x: number, from: number, to: number) => {
      for (let y = from; y < to; y += DASH + GAP) {
        g.moveTo(x, y).lineTo(x, Math.min(y + DASH, to));
      }
    };

    // Внутренние границы ячеек.
    for (let seam = 1; seam < REELS; seam++) dashColumn(seam * cell, INSET, h - INSET);
    for (let row = 1; row < ROWS; row++) dashRow(row * cell, INSET, w - INSET);

    // Внешняя рамка поля — той же строчкой, иначе крайние ячейки выглядят
    // незакрытыми, а на образце из набора обшито всё поле целиком.
    dashRow(INSET, INSET, w - INSET);
    dashRow(h - INSET, INSET, w - INSET);
    dashColumn(INSET, INSET, h - INSET);
    dashColumn(w - INSET, INSET, h - INSET);

    g.stroke({ color: COLOR_STITCH, width: WIDTH, alpha: ALPHA, cap: 'butt' });
    this.view.addChild(g);
  }
}
