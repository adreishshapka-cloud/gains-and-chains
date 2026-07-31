import { Container, Graphics, Rectangle } from 'pixi.js';
import { BONUS_BUY_COST, DOORS } from '../core/features/freeSpins';
import { PAYTABLE, SCATTER_PAY, SCATTER_TRIGGER } from '../core/paytable';
import { LINES, MAX_WIN_X, STICKY_MULT_LADDER, Sym, SYM_NAME, type SymId } from '../core/types';
import { COLOR } from '../game/palette';
import { Button, label } from './widgets';

/**
 * Экран правил.
 *
 * Таблица выплат строится из той же PAYTABLE, по которой считаются деньги.
 * Расхождение между правилами и математикой — классический способ поссориться
 * с игроком, и единственная надёжная защита от него — не иметь второго
 * источника чисел.
 *
 * Вёрстка идёт по сетке от края панели, а не от «на глаз подобранных» позиций:
 * в прошлой версии колонки налезали на заголовок, а нижние блоки механик
 * уезжали за границу панели.
 */

const PANEL_W = 1200;
const PANEL_H = 780;
const PAD = 44;

/** Колонка выплат: где начинается каждое из трёх чисел. */
const PAY_COLS = [300, 380, 460];

/** Порядок символов сверху вниз: от самого дорогого к дешёвому. */
const ORDER: SymId[] = [
  Sym.DUKE,
  Sym.CHAMPION,
  Sym.REF,
  Sym.ROOKIE,
  Sym.SHAKER,
  Sym.OIL,
  Sym.HARNESS,
  Sym.WRISTBAND,
  Sym.DUMBBELL,
];

export class PaytableScreen {
  readonly view = new Container();

  constructor(width: number, height: number, rtpPercent: string) {
    this.view.visible = false;

    const shade = new Graphics();
    shade.rect(0, 0, width, height).fill({ color: 0x0a0510, alpha: 0.93 });
    shade.eventMode = 'static';
    // Явная hit-область обязательна: без неё клики проходят СКВОЗЬ затемнение
    // и попадают в панель управления под ним.
    shade.hitArea = new Rectangle(0, 0, width, height);
    shade.on('pointertap', () => this.hide());
    this.view.addChild(shade);

    const panel = new Container();
    panel.position.set((width - PANEL_W) / 2, (height - PANEL_H) / 2);
    panel.eventMode = 'static';
    panel.hitArea = new Rectangle(0, 0, PANEL_W, PANEL_H);
    this.view.addChild(panel);

    const bg = new Graphics();
    bg.roundRect(0, 0, PANEL_W, PANEL_H, 18).fill(COLOR.dim);
    bg.roundRect(0, 0, PANEL_W, PANEL_H, 18).stroke({ color: COLOR.brick, width: 5 });
    panel.addChild(bg);

    const title = label('ПРАВИЛА ПОДЗЕМЕЛЬЯ', 40, COLOR.gold);
    title.position.set(PAD, 30);
    panel.addChild(title);

    const sub = label(
      `${LINES} линий · выплаты слева направо · возврат ${rtpPercent} · потолок ×${MAX_WIN_X}`,
      18,
      0x9a8aaa,
    );
    sub.position.set(PAD + 2, 82);
    panel.addChild(sub);

    this.buildPaytable(panel);
    this.buildFeatures(panel);

    const close = new Button({
      text: 'ЗАКРЫТЬ',
      width: 200,
      height: 56,
      fontSize: 24,
      color: COLOR.neon,
      onTap: () => this.hide(),
    });
    close.view.position.set(PANEL_W - PAD - 200, PANEL_H - 78);
    panel.addChild(close.view);
  }

  private buildPaytable(panel: Container): void {
    const head = label('ВЫПЛАТЫ, в ставках на линию', 21, COLOR.cyan);
    head.position.set(PAD, 132);
    panel.addChild(head);

    // Заголовки колонок стоят ниже подписи раздела, а не на одной строке
    // с ней: в узкой панели они налезали на текст.
    for (const [i, count] of [3, 4, 5].entries()) {
      const col = label(String(count), 17, 0x8a7a9a);
      col.anchor.set(1, 0);
      col.position.set(PAY_COLS[i], 164);
      panel.addChild(col);
    }

    let y = 192;
    for (const sym of ORDER) {
      const row = PAYTABLE[sym];

      const name = label(SYM_NAME[sym], 20, COLOR.paper);
      name.position.set(PAD + 4, y);
      panel.addChild(name);

      for (const [i, count] of [3, 4, 5].entries()) {
        const value = row[count];
        const cell = label(value > 0 ? String(value) : '—', 20, value > 0 ? COLOR.gold : 0x6a5a7a);
        cell.anchor.set(1, 0);
        cell.position.set(PAY_COLS[i], y);
        panel.addChild(cell);
      }

      y += 32;
    }

    const note = label('Три младших символа платят от четырёх подряд.', 16, 0x8a7a9a);
    note.position.set(PAD + 4, y + 10);
    panel.addChild(note);

    const scatter = label(
      `DUNGEON DOOR: ${SCATTER_TRIGGER}+ в любом месте → фриспины\n` +
        `выплата ×${SCATTER_PAY[3]} / ×${SCATTER_PAY[4]} / ×${SCATTER_PAY[5]} от ставки`,
      18,
      COLOR.cyan,
      { lineHeight: 26 },
    );
    scatter.position.set(PAD + 4, y + 44);
    panel.addChild(scatter);
  }

  private buildFeatures(panel: Container): void {
    const x = 620;
    const ladder = STICKY_MULT_LADDER.map((m) => `×${m}`).join(' → ');

    const head = label('МЕХАНИКИ', 21, COLOR.cyan);
    head.position.set(x, 132);
    panel.addChild(head);

    const blocks: [string, string][] = [
      [
        '♂ STICKY GAINS',
        '♂ выпадает на трёх центральных барабанах, прилипает\n' +
          `и растит множитель ${ladder}. Несколько ♂ на одной линии —\n` +
          'множители перемножаются.',
      ],
      [
        'OIL UP',
        'Золотые цепи несут номиналы от ×1 до ×100. DUKE’S FIST\n' +
          'на пятом барабане забирает все цепи на экране разом.\n' +
          'Два кулака — двойной сбор.',
      ],
      [
        'BELT COLLECTION',
        'Три жетона — и DUKE снимает очки: выплата, вход\n' +
          'в подземелье или горсть липких ♂. Чем дольше нет\n' +
          'выигрышей, тем выше шанс жетона.',
      ],
      [
        'DUNGEON RUN',
        DOORS.map((d) => `${d.title}: ${d.spins} спинов, старт ×${d.startMult}`).join('\n') +
          '\nКаждый ♂ на поле даёт +1 к множителю раунда.',
      ],
      [
        'SKIP LEG DAY',
        `Купить вход в подземелье за ${BONUS_BUY_COST} ставок.\n` +
          'Возврат тот же, что и при обычной игре.',
      ],
    ];

    let y = 168;
    for (const [name, text] of blocks) {
      const title = label(name, 20, COLOR.gold);
      title.position.set(x, y);
      panel.addChild(title);

      const body = label(text, 16, COLOR.paper, { lineHeight: 22 });
      body.position.set(x, y + 26);
      panel.addChild(body);

      y += 26 + body.height + 18;
    }
  }

  show(): void {
    this.view.visible = true;
  }

  hide(): void {
    this.view.visible = false;
  }

  get isOpen(): boolean {
    return this.view.visible;
  }
}
