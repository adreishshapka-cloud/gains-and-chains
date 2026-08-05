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

export interface DividerGrid {
  cols: number;
  rows: number;
  cellW: number;
  cellH: number;
}

/** Разметка поля барабанов: пять колонок по четыре ряда, клетка квадратная. */
const REEL_GRID: DividerGrid = {
  cols: REELS,
  rows: ROWS,
  cellW: REELS_AT.cell,
  cellH: REELS_AT.cell,
};

export class ReelDividers {
  readonly view = new Container();

  /**
   * @param grid какое поле размечать. По умолчанию барабанное; монетный бонус
   *        передаёт своё — 5×5 с невысокой клеткой. Строчка у обоих одна и та
   *        же намеренно: это одна и та же машина, и поле бонуса должно читаться
   *        её полем, а не отдельным экраном.
   */
  constructor(grid: DividerGrid = REEL_GRID) {
    const { cols, rows, cellW, cellH } = grid;
    const w = cols * cellW;
    const h = rows * cellH;
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
    for (let seam = 1; seam < cols; seam++) dashColumn(seam * cellW, INSET, h - INSET);
    for (let row = 1; row < rows; row++) dashRow(row * cellH, INSET, w - INSET);

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
