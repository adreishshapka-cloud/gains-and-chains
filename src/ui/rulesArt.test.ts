import { describe, expect, it } from 'vitest';
import { BONUS_BUY_COST, DOORS } from '../core/features/freeSpins';
import { PAYTABLE, SCATTER_PAY, SCATTER_TRIGGER } from '../core/paytable';
import { LINES, MAX_WIN_X, STICKY_MULT_LADDER, Sym } from '../core/types';
import { AUTO_ROUNDS, RTP_LABEL } from '../game/rules';

/**
 * Сторож правил.
 *
 * Экран правил больше не строится из мат-модели: он пришёл готовой картинкой
 * (src/assets/ui/rules-screen.png), и числа на ней нарисованы. Это удобно ровно
 * до первой правки выплат — после неё правила начнут врать, и никто этого
 * не заметит, потому что код продолжит работать.
 *
 * Поэтому здесь переписано всё, что на картинке нарисовано. Тест падает не от
 * того, что «в модели ошибка», а от того, что КАРТИНКА УСТАРЕЛА: правь числа
 * ниже вместе с ней, и никак иначе.
 *
 * Заодно это опись: чтобы понять, что именно обещано игроку, читать нужно
 * этот файл, а не разглядывать png.
 */

describe('числа, нарисованные на экране правил', () => {
  it('шапка: линии, возврат, потолок', () => {
    expect(LINES).toBe(20);
    expect(RTP_LABEL).toBe('95.9%');
    expect(MAX_WIN_X).toBe(5000);
  });

  it('таблица выплат', () => {
    // [3 подряд, 4 подряд, 5 подряд]; 0 — прочерк на картинке.
    const drawn: Record<string, [number, number, number]> = {
      VAN: [18, 75, 375],
      TICKET: [12, 41, 165],
      REF: [9, 28, 90],
      ROOKIE: [7, 18, 55],
      Шейкер: [4, 10, 32],
      Масло: [3, 8, 25],
      Портупея: [0, 10, 32],
      Напульсник: [0, 8, 25],
      Гантель: [0, 7, 20],
    };
    const model: Record<string, readonly number[]> = {
      VAN: PAYTABLE[Sym.DUKE],
      TICKET: PAYTABLE[Sym.CHAMPION],
      REF: PAYTABLE[Sym.REF],
      ROOKIE: PAYTABLE[Sym.ROOKIE],
      Шейкер: PAYTABLE[Sym.SHAKER],
      Масло: PAYTABLE[Sym.OIL],
      Портупея: PAYTABLE[Sym.HARNESS],
      Напульсник: PAYTABLE[Sym.WRISTBAND],
      Гантель: PAYTABLE[Sym.DUMBBELL],
    };

    for (const [name, row] of Object.entries(drawn)) {
      expect([model[name][3], model[name][4], model[name][5]], name).toEqual(row);
    }
  });

  it('DUNGEON DOOR: вход и выплаты за scatter', () => {
    expect(SCATTER_TRIGGER).toBe(3);
    expect([SCATTER_PAY[3], SCATTER_PAY[4], SCATTER_PAY[5]]).toEqual([2, 5, 20]);
  });

  it('лестница липких ♂', () => {
    expect([...STICKY_MULT_LADDER]).toEqual([1, 2, 3]);
  });

  it('двери подземелья', () => {
    expect(DOORS.map((d) => [d.title, d.spins, d.startMult])).toEqual([
      ['ARM WRESTLE', 10, 1],
      ['SUBMISSION', 8, 5],
      ['FULL NELSON', 5, 18],
    ]);
  });

  it('цена покупки бонуса', () => {
    expect(BONUS_BUY_COST).toBe(64);
  });
});

describe('числа, нарисованные на экране настроек', () => {
  it('сколько раундов крутит автоспин', () => {
    expect(AUTO_ROUNDS).toBe(25);
  });
});
