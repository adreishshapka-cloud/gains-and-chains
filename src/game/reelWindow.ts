import { ROWS, type SymId } from '../core/types';

/**
 * Чистая логика ленты барабана — без Pixi и без единого спрайта.
 *
 * Вынесено отдельно ради одной проверки: барабан обязан остановиться ровно
 * на тех символах, которые посчитала мат-модель. Ошибка здесь не видна глазом
 * (на барабане всё равно правдоподобные символы), но означает, что игрок
 * видит одно, а деньги начисляются за другое. Такое ловится только тестом.
 */

/** Плиток в полосе: видимое окно плюс по одной за каждым краем. */
export const STRIP_CELLS = ROWS + 2;

export class ReelWindow {
  /** cells[0] — над окном, cells[1..ROWS] — видимое, cells[ROWS+1] — под окном. */
  private readonly cells: SymId[];
  private queue: SymId[] = [];

  constructor(fill: () => SymId) {
    this.cells = Array.from({ length: STRIP_CELLS }, fill);
  }

  /** Символы, которые сейчас видны игроку, сверху вниз. */
  visible(): SymId[] {
    return this.cells.slice(1, 1 + ROWS);
  }

  at(index: number): SymId {
    return this.cells[index];
  }

  /** Сколько целевых символов ещё не подано. */
  get pending(): number {
    return this.queue.length;
  }

  /**
   * Поставить в очередь остановку на заданном окне.
   * Порядок обратный: сверху появляется тот символ, что окажется ниже всех.
   */
  enqueueStop(target: readonly SymId[]): void {
    this.queue = [];
    for (let row = ROWS - 1; row >= 0; row--) this.queue.push(target[row]);
  }

  /**
   * Сдвиг на одну ячейку: нижняя плитка переезжает наверх и получает
   * очередной символ — из очереди остановки, а если та пуста, случайный.
   * @returns символ, оказавшийся сверху.
   */
  shift(fallback: () => SymId): SymId {
    this.cells.unshift(this.cells.pop()!);
    const sym = this.queue.length > 0 ? this.queue.shift()! : fallback();
    this.cells[0] = sym;
    return sym;
  }

  /** Прямая установка окна — старт игры и восстановление сохранения. */
  setVisible(symbols: readonly SymId[], fallback: () => SymId): void {
    for (let row = 0; row < ROWS; row++) this.cells[row + 1] = symbols[row];
    this.cells[0] = fallback();
    this.cells[STRIP_CELLS - 1] = fallback();
    this.queue = [];
  }
}
