import { describe, expect, it } from 'vitest';
import { REELS_BASE } from '../core/reels';
import { createRng } from '../core/rng';
import { drawGrid } from '../core/spin';
import { REELS, ROWS, Sym, type SymId } from '../core/types';
import { ReelWindow } from './reelWindow';

const filler = () => Sym.DUMBBELL as SymId;

/** Крутит барабан до полной остановки и возвращает то, что увидит игрок. */
function spinTo(win: ReelWindow, target: readonly SymId[], idleSpins: number): SymId[] {
  for (let i = 0; i < idleSpins; i++) win.shift(filler);
  win.enqueueStop(target);
  while (win.pending > 0) win.shift(filler);
  // Последний сдвиг заводит верхний символ в окно — им заканчивается доводка.
  win.shift(filler);
  return win.visible();
}

describe('окно барабана', () => {
  it('останавливается ровно на заданных символах', () => {
    const win = new ReelWindow(filler);
    const target: SymId[] = [Sym.DUKE, Sym.WILD, Sym.SCATTER, Sym.REF];
    expect(spinTo(win, target, 7)).toEqual(target);
  });

  it('порядок символов не переворачивается', () => {
    const win = new ReelWindow(filler);
    const target: SymId[] = [Sym.DUMBBELL, Sym.WRISTBAND, Sym.HARNESS, Sym.OIL];
    const seen = spinTo(win, target, 3);
    expect(seen[0]).toBe(Sym.DUMBBELL);
    expect(seen[ROWS - 1]).toBe(Sym.OIL);
  });

  it('работает при любом числе холостых оборотов до остановки', () => {
    const target: SymId[] = [Sym.CHAIN, Sym.FIST, Sym.DUKE, Sym.SHAKER];
    for (let idle = 0; idle < 40; idle++) {
      const win = new ReelWindow(filler);
      expect(spinTo(win, target, idle)).toEqual(target);
    }
  });

  it('останавливается на настоящих полях из мат-модели', () => {
    const rng = createRng(31337);
    for (let n = 0; n < 300; n++) {
      const grid = drawGrid(rng, REELS_BASE);
      for (let reel = 0; reel < REELS; reel++) {
        const win = new ReelWindow(filler);
        expect(spinTo(win, grid[reel], 5 + (n % 11))).toEqual(grid[reel]);
      }
    }
  });

  it('прямая установка окна показывает ровно переданное', () => {
    const win = new ReelWindow(filler);
    const target: SymId[] = [Sym.REF, Sym.CHAMPION, Sym.ROOKIE, Sym.OIL];
    win.setVisible(target, filler);
    expect(win.visible()).toEqual(target);
  });

  it('повторная остановка не тянет за собой хвост прошлой очереди', () => {
    const win = new ReelWindow(filler);
    const first: SymId[] = [Sym.DUKE, Sym.DUKE, Sym.DUKE, Sym.DUKE];
    const second: SymId[] = [Sym.OIL, Sym.SHAKER, Sym.REF, Sym.WILD];
    spinTo(win, first, 4);
    expect(spinTo(win, second, 4)).toEqual(second);
  });
});
