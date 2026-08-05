import gsap from 'gsap';
import { Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import {
  COIN_COLS,
  COIN_RESPINS,
  COIN_ROWS_MAX,
  COIN_VALUES,
  type Coin,
  type CoinDrop,
  type PumpTick,
} from '../core/features/coinRush';
import { label } from '../ui/widgets';
import type { CoinArt } from './coinTextures';
import { COIN_FIELD } from './layout';
import { COLOR } from './palette';
import { ReelDividers } from './ReelDividers';
import { dur, pause } from './timing';

/**
 * Поле монетного бонуса OIL RUSH.
 *
 * Показывает то, что уже посчитала мат-модель: куда легли монеты, сколько
 * осталось респинов, какие ряды открыты. Ни одного решения здесь нет — класс
 * получает готовый лог событий раунда и разыгрывает его во времени.
 *
 * Поле занимает окно барабанов целиком: барабаны на время бонуса прячутся,
 * и монеты играют на их месте, в той же нарисованной рамке. Клетка при этом
 * не квадратная (136×109): пять рядов в высоту окна иначе не помещаются,
 * а монета всё равно круглая и садится по меньшей стороне.
 *
 * Монеты — картинки из макета бонуса с ПУСТЫМ лицом (tools/prep_oil_rush.py),
 * номинал пишет движок. Как и у цепей в базовой игре: номинал зависит
 * от ставки, и зашитое в картинку число начало бы врать при её смене.
 */

/**
 * Сколько монета летит до своей клетки.
 *
 * Долго и с торможением: монета проносится вниз, замедляется и только в конце
 * встаёт. Быстрое падение пробовали, и оно съедает весь смысл респина — весь
 * он в том, упадёт монета или нет, и на четверти секунды переживать нечего.
 */
const FALL_TIME = 1.15;
/** Пауза между монетами ОДНОЙ колонки. */
const FALL_STAGGER = 260;

/**
 * Респин идёт как ход барабанов: сперва крутятся ВСЕ столбцы разом, потом
 * гаснут слева направо.
 *
 * Раньше шевелились только те столбцы, куда монета и так падала, — а значит
 * по первому же кадру было видно, где ничего не будет, и половина поля стояла
 * мёртвой. Пустой респин при этом не показывал вообще ничего.
 *
 * Теперь мимо каждого столбца летят монеты, и до самой его остановки неясно,
 * встанет там что-нибудь или пронесёт. Проигранный респин от выигранного
 * отличается только концом — а смотреть на него столько же интересно.
 */
const SPIN_LEAD = 300;
/** Между остановками соседних столбцов. */
const COLUMN_STOP = 190;
/** Сколько монета летит через всё поле насквозь, секунд. */
const FLY_TIME = 0.62;
/** Пауза между монетами в ленте одного столбца. */
const FLY_GAP = 195;
/** Пролетающие мимо приглушены: садится — значит твоя, летит — значит ничья. */
const FLY_ALPHA = 0.85;
/** Оборотов пролетающей монеты. Целое здесь не нужно: она нигде не встаёт. */
const FLY_SPINS = 2;

/**
 * Оборотов монеты за падение.
 *
 * Ровно целое число, и не для красоты: у кулака, качка и множителя лицо
 * не круглое, и сесть в клетку боком они не должны. Оборот отсчитывается
 * назад от конечного нуля тем же торможением, что и падение, — к посадке
 * монета уже почти не крутится и последнюю четверть оборота доворачивает
 * на глазах. Это и есть ожидание: видно, что она вот-вот встанет.
 */
const FALL_SPINS = 1;

/**
 * След за монетой — полупрозрачные копии, остающиеся на пройденных местах.
 *
 * Смысл в том, чтобы падение читалось покадрово: не смазанная полоса, а
 * отдельные монеты, «проскочившие» мимо. Поэтому призраки ставятся через
 * равные ПРОМЕЖУТКИ ПУТИ, а не через равное время: по времени они на разгоне
 * ложились бы редко, а на торможении — стопкой в одну кучу, и весь эффект
 * превращался в мутное пятно над клеткой.
 */
const GHOST_STEP = 40;
/**
 * Сколько живёт призрак, секунд.
 *
 * Заметно дольше промежутка между ними: за монетой должно тянуться несколько
 * копий разом, иначе это не след, а мигание одной.
 */
const GHOST_LIFE = 0.42;
/** Прозрачность свежего призрака. */
const GHOST_ALPHA = 0.42;

/**
 * Лента монет столбца: что игрок видит пролетающим мимо.
 *
 * Веса взяты из мат-модели, но приглушены корнем: с настоящими четыре пятых
 * ленты заняла бы бронза, а алмаз не показался бы за весь бонус ни разу.
 *
 * Розыгрыша лента не касается вовсе — он давно сыгран в core. Поэтому
 * и случайность здесь своя, Math.random: тянуть декорацию из сеяного
 * генератора нельзя, иначе один и тот же seed перестанет повторять раунд.
 */
const STRIP = COIN_VALUES.map((c) => ({ value: c.value, weight: Math.sqrt(c.weight) }));
const STRIP_TOTAL = STRIP.reduce((sum, c) => sum + c.weight, 0);

function stripValue(): number {
  let r = Math.random() * STRIP_TOTAL;
  for (const c of STRIP) {
    r -= c.weight;
    if (r <= 0) return c.value;
  }
  return STRIP[0].value;
}

/** Табличка на монете: номинал кулака или прибавка качка. */
interface Plate {
  view: Container;
  back: Graphics;
  text: Text;
}

interface Slot {
  view: Container;
  /** Номинал в ставках: качок его двигает. */
  amount: number;
  /** Сколько в монету накачал качок. */
  bonus: number;
  /** Табличка, если она этой монете нужна. */
  plate: Plate | null;
  /**
   * Табличка показывает НОМИНАЛ, а не прибавку.
   *
   * Так у кулака: своё число у него есть, а на картинке его нет и быть
   * не может — он забирает сумму поля, и она у каждого захода своя.
   */
  showsTotal: boolean;
  /**
   * Число посреди монеты — только для номинала, которому не нашлось картинки.
   * У остальных номинал запечён в саму монету, и писать поверх нечего.
   */
  value: Text | null;
}

export class CoinField {
  readonly view = new Container();

  private readonly locked = new Graphics();
  private readonly coins = new Container();
  /**
   * След падающих монет. Лежит внутри `coins` первым слоем, поэтому обрезается
   * той же маской, а призраки всегда проходят ПОД уже упавшими монетами —
   * иначе чужой полупрозрачный кружок наезжал бы на их номиналы.
   */
  private readonly trail = new Container();
  /**
   * Монеты, пролетающие поле насквозь. Слоем выше следа и ниже упавших:
   * пролетающая не должна закрывать собой ту, что уже легла в клетку.
   */
  private readonly stream = new Container();
  /**
   * Номер набивки поля. Растёт на каждой очистке.
   *
   * Нужен всему, что живёт дольше одного кадра: падение, лента, призраки.
   * Поле могли пересобрать под шторкой, пока анимация ещё идёт, — и тогда
   * её остатки высыпались бы уже на следующий бонус.
   */
  private generation = 0;
  private readonly slots: (Slot | null)[] = new Array(COIN_COLS * COIN_ROWS_MAX).fill(null);
  private readonly respinsText: Text;
  private readonly totalText: Text;
  private rows = 0;

  constructor(private readonly art: CoinArt) {
    this.view.visible = false;
    this.view.position.set(COIN_FIELD.x, COIN_FIELD.y);

    const width = COIN_FIELD.cellW * COIN_COLS;
    const height = COIN_FIELD.cellH * COIN_ROWS_MAX;

    // Подложка глухая, без прозрачности: под окном барабанов на фоне нарисована
    // таблица выплат, и даже шесть процентов прозрачности показывали её призраки
    // в пустых клетках.
    const backdrop = new Graphics().rect(0, 0, width, height).fill(0x0a0710);

    // Разметка — ТА ЖЕ, что у барабанов: пунктирная строчка по границам ячеек.
    // Своя, нарисованная сплошными линиями, пробовалась и оказалась чужой:
    // бонус играет в том же окне той же машины, и поле у него должно быть
    // её полем, а не отдельным экраном со своим стилем.
    const stitching = new ReelDividers({
      cols: COIN_COLS,
      rows: COIN_ROWS_MAX,
      cellW: COIN_FIELD.cellW,
      cellH: COIN_FIELD.cellH,
    });

    // Монеты обрезаются рамкой поля: они прилетают сверху, из-за его края,
    // и без маски видно, как они летят по комнате и по счётчику респинов.
    const clip = new Graphics().rect(0, 0, width, height).fill(0xffffff);
    this.coins.mask = clip;
    this.coins.addChild(this.trail, this.stream, this.locked);

    this.view.addChild(backdrop, stitching.view, this.coins, clip);

    this.respinsText = label('', 28, COLOR.gold);
    this.respinsText.anchor.set(0.5, 1);
    this.respinsText.position.set(width / 2, -8);
    this.view.addChild(this.respinsText);

    this.totalText = label('', 34, COLOR.paper);
    this.totalText.anchor.set(0.5, 0);
    this.totalText.position.set(width / 2, height + 6);
    this.view.addChild(this.totalText);
  }

  /**
   * Убирает с поля всё: упавшие монеты, пролетающие и след.
   *
   * Спрайты живут не сами по себе, а на анимации — их мало снять со сцены,
   * иначе gsap продолжит гасить уже выброшенные.
   *
   * Порядок слоёв восстанавливается тот же: след, лента, затенение закрытых
   * рядов, и только потом упавшие монеты. Затенение стоит НАД лентой,
   * чтобы пролетающая монета в закрытом ряду гасла вместе с ним, — иначе
   * она проносится по нему в полную яркость, и ряд перестаёт читаться
   * закрытым.
   */
  private clearCoins(): void {
    this.generation++;
    for (const box of [this.trail, this.stream]) {
      for (const sprite of box.removeChildren()) {
        gsap.killTweensOf(sprite);
        sprite.destroy();
      }
    }
    this.coins.removeChildren();
    this.coins.addChild(this.trail, this.stream, this.locked);
    this.slots.fill(null);
  }

  /**
   * Оставляет на месте монеты её полупрозрачный отпечаток.
   *
   * Отпечаток неподвижен — он ровно то место, где монета была кадр назад,
   * с тем же поворотом. Двигаться вслед за ней он не должен: тогда это уже
   * не след, а вторая монета.
   */
  private spawnGhost(texture: Texture, size: number, x: number, y: number, rotation: number): void {
    const ghost = new Sprite(texture);
    ghost.anchor.set(0.5);
    ghost.width = size;
    ghost.height = size;
    ghost.rotation = rotation;
    ghost.position.set(x, y);
    ghost.alpha = GHOST_ALPHA;
    this.trail.addChild(ghost);

    gsap.to(ghost, {
      alpha: 0,
      duration: dur(GHOST_LIFE),
      // Ровное угасание: с ускорением хвост обрубается и снова читается смазом.
      ease: 'none',
      onComplete: () => {
        if (!ghost.destroyed) ghost.destroy();
      },
    });
  }

  /** Размер монеты в клетке. Клетка не квадратная, монета садится по меньшей. */
  private get coinSize(): number {
    return Math.min(COIN_FIELD.cellW, COIN_FIELD.cellH) - 12;
  }

  /**
   * Пускает по столбцу монету, которая нигде не остановится.
   *
   * Летит ровно, без торможения, и уходит за нижний край поля под маску.
   * Номинал у неё настоящий, с картинки: смысл в том, чтобы игрок успел
   * прочитать, ЧТО именно пронесло мимо.
   */
  private flyCoin(col: number): void {
    const texture = this.art.byValue.get(stripValue());
    if (!texture) return;

    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5);
    sprite.width = this.coinSize;
    sprite.height = this.coinSize;
    sprite.alpha = FLY_ALPHA;
    sprite.position.set(COIN_FIELD.cellW * (col + 0.5), -COIN_FIELD.cellH);
    this.stream.addChild(sprite);

    const out = COIN_FIELD.cellH * (COIN_ROWS_MAX + 1);
    gsap.to(sprite, {
      y: out,
      rotation: Math.PI * 2 * FLY_SPINS,
      duration: dur(FLY_TIME),
      ease: 'none',
      onComplete: () => {
        if (!sprite.destroyed) sprite.destroy();
      },
    });
  }

  /**
   * Держит ленту столбца, пока его не остановят.
   *
   * Лента живёт своей жизнью, а не пачкой заранее запланированных монет:
   * сколько их пролетит, зависит только от того, когда столбец встанет.
   */
  private runStream(col: number, spinning: boolean[]): void {
    const gen = this.generation;
    void (async () => {
      while (spinning[col] && this.generation === gen) {
        this.flyCoin(col);
        await pause(FLY_GAP);
      }
    })();
  }

  /** Центр клетки в координатах поля. */
  private cellAt(index: number): { x: number; y: number } {
    const col = index % COIN_COLS;
    const row = Math.floor(index / COIN_COLS);
    return {
      x: COIN_FIELD.cellW * (col + 0.5),
      y: COIN_FIELD.cellH * (row + 0.5),
    };
  }

  /** Закрытые ряды притеняются: видно, что поле ещё может вырасти. */
  private drawLocked(): void {
    this.locked.clear();
    if (this.rows >= COIN_ROWS_MAX) return;

    const top = COIN_FIELD.cellH * this.rows;
    this.locked
      .rect(0, top, COIN_FIELD.cellW * COIN_COLS, COIN_FIELD.cellH * COIN_ROWS_MAX - top)
      .fill({ color: 0x05030a, alpha: 0.78 });
  }

  /**
   * Картинка монеты. У обычных она своя на каждый номинал — с запечённым
   * числом, фактурой и свечением, которых движку не нарисовать.
   */
  private textureFor(coin: Coin): Texture {
    switch (coin.kind) {
      case 'collector':
        return this.art.fist;
      case 'pump':
        return this.art.pump;
      case 'mult':
        return this.art.mult;
      default:
        return this.art.byValue.get(Math.round(coin.value)) ?? this.art.tiers[coin.tier];
    }
  }

  /** Есть ли у номинала своя монета. Нет — число придётся писать движком. */
  private hasArtFor(coin: Coin): boolean {
    return this.art.byValue.has(Math.round(coin.value));
  }

  /**
   * Табличка поверх монеты.
   *
   * Нужна там, где число нельзя взять с картинки: у кулака (его номинал —
   * собранная сумма поля) и у подкачанной монеты (её номинал вырос, а
   * запечённый остался прежним). Табличка не спорит с рисунком, а ложится
   * на нижнюю кромку — видно, что это приписка, а не сам номинал.
   */
  private setPlate(slot: Slot, text: string): void {
    let plate = slot.plate;
    if (!plate) {
      const back = new Graphics();
      const caption = label('', 24, COLOR.gold, { stroke: { color: COLOR.ink, width: 4 } });
      caption.anchor.set(0.5);
      const view = new Container();
      view.addChild(back, caption);
      view.y = Math.min(COIN_FIELD.cellW, COIN_FIELD.cellH) * 0.27;
      slot.view.addChild(view);
      plate = { view, back, text: caption };
      slot.plate = plate;
    }

    plate.text.text = text;
    const w = plate.text.width + 18;
    const h = plate.text.height + 4;
    plate.back
      .clear()
      .roundRect(-w / 2, -h / 2, w, h, 6)
      .fill({ color: 0x140c06, alpha: 0.92 })
      .stroke({ color: COLOR.gold, width: 2, alpha: 0.75 });
  }

  /**
   * Роняет монету в клетку.
   *
   * Монета не появляется на месте, а проносится сверху через всё поле —
   * как символ на барабане. Ход именно тормозящий: сперва быстро, потом всё
   * медленнее, и только в конце она садится в клетку. Разгон к концу
   * (как падает камень) пробовали — так монета проскакивает мимо внимания,
   * а тут наоборот, к моменту остановки на неё уже смотрят.
   *
   * За монетой тянется след из её же полупрозрачных копий, а сама она при этом
   * доворачивается до упора — см. GHOST_STEP и FALL_SPINS.
   */
  private dropCoin(drop: CoinDrop): Promise<void> {
    const at = this.cellAt(drop.index);
    const slot = new Container();
    // Старт выше поля на два ряда: монете нужно место, чтобы разогнаться
    // до того, как её станет видно из-под маски.
    slot.position.set(at.x, -COIN_FIELD.cellH * 2);

    const gen = this.generation;
    const size = this.coinSize;
    const texture = this.textureFor(drop.coin);
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5);
    sprite.width = size;
    sprite.height = size;
    sprite.rotation = -Math.PI * 2 * FALL_SPINS;
    slot.addChild(sprite);

    const kind = drop.coin.kind;
    const known = kind !== 'coin' || this.hasArtFor(drop.coin);

    // Число посреди монеты — только запасному варианту, у которого лицо пустое.
    let value: Text | null = null;
    if (!known) {
      value = label(`×${Math.round(drop.coin.value)}`, 30, 0xfff3d6, {
        stroke: { color: 0x1a0f06, width: 5 },
      });
      value.anchor.set(0.5);
      slot.addChild(value);
    }

    const state: Slot = {
      view: slot,
      amount: drop.coin.value,
      bonus: 0,
      plate: null,
      showsTotal: kind === 'collector',
      value,
    };
    // Кулак приходит со своим числом сразу: оно и есть весь смысл его падения.
    if (state.showsTotal) this.setPlate(state, `×${Math.round(state.amount)}`);

    this.coins.addChild(slot);
    this.slots[drop.index] = state;

    // Поворот идёт тем же торможением и той же длительностью, что и падение:
    // монета встаёт лицом ровно в тот кадр, в который садится в клетку.
    gsap.to(sprite, { rotation: 0, duration: dur(FALL_TIME), ease: 'power3.out' });

    let lastY = slot.y;
    let travelled = 0;

    return new Promise((resolve) => {
      gsap.to(slot, {
        y: at.y,
        duration: dur(FALL_TIME),
        // Торможение к концу: пролетела, замедлилась, встала.
        ease: 'power3.out',
        onUpdate: () => {
          travelled += slot.y - lastY;
          lastY = slot.y;
          if (travelled < GHOST_STEP) return;
          // Поле могли пересобрать прямо в полёте — шторкой на выходе или
          // новым бонусом. Падение при этом доигрывается вхолостую (иначе
          // некому разрешить промис), но след от снятой монеты попал бы
          // уже на следующее поле.
          if (this.generation !== gen) return;
          // Ближе одного шага к своей клетке след обрывается: последний призрак
          // иначе ложится почти на саму монету и читается не кадром, а двоением.
          // Условие считается по ПУТИ, а не по скорости за кадр: скорость
          // за кадр зависит и от частоты кадров, и от турбо-темпа.
          if (at.y - slot.y < GHOST_STEP) return;
          travelled = 0;
          this.spawnGhost(texture, size, slot.x, slot.y, sprite.rotation);
        },
        onComplete: () => {
          // Удар о клетку: короткое приседание и обратно.
          gsap.fromTo(
            slot.scale,
            { x: 1.16, y: 0.84 },
            { x: 1, y: 1, duration: dur(0.22), ease: 'back.out(3)' },
          );
          resolve();
        },
      });
    });
  }

  /** Начало бонуса: пустое поле, стартовые монеты, полный счётчик. */
  async start(rows: number, drops: CoinDrop[]): Promise<void> {
    this.clearCoins();
    this.rows = rows;
    this.drawLocked();
    this.setRespins(COIN_RESPINS);
    this.totalText.text = '';

    await this.drop(drops, rows);
  }

  /**
   * Готовит пустое поле ДО того, как игрок его увидит.
   *
   * Зовётся под чёрной шторкой сцены входа: барабаны к этому моменту уже
   * спрятаны, и когда шторка поднимается, на их месте сразу стоит поле бонуса.
   * Раньше поле проявлялось поверх барабанов, и в эти триста миллисекунд
   * сквозь него просвечивала нарисованная в рамке таблица выплат.
   */
  prepare(rows: number): void {
    this.clearCoins();
    this.rows = rows;
    this.drawLocked();
    this.setRespins(COIN_RESPINS);
    this.totalText.text = '';
    this.view.alpha = 1;
    this.view.visible = true;
  }

  /** Монеты одного столбца — по одной, сверху вниз. */
  private async dropColumn(list: CoinDrop[]): Promise<void> {
    for (const d of list) {
      await this.dropCoin(d);
      await pause(FALL_STAGGER);
    }
  }

  /**
   * Респин: крутятся все столбцы, гаснут слева направо.
   *
   * Столбцы останавливаются по часам, а не по концу падения: иначе один
   * столбец с тремя монетами задерживал бы остановку всех остальных на
   * четыре секунды, и ход респина разваливался бы на несвязанные куски.
   * Поэтому падения идут внахлёст, и раунд ждёт их уже после прохода.
   */
  async drop(drops: CoinDrop[], rows: number): Promise<void> {
    const byColumn = new Map<number, CoinDrop[]>();
    for (const d of drops) {
      const col = d.index % COIN_COLS;
      const list = byColumn.get(col);
      if (list) list.push(d);
      else byColumn.set(col, [d]);
    }

    const spinning = new Array<boolean>(COIN_COLS).fill(true);
    for (let col = 0; col < COIN_COLS; col++) this.runStream(col, spinning);
    await pause(SPIN_LEAD);

    const landings: Promise<void>[] = [];
    for (let col = 0; col < COIN_COLS; col++) {
      spinning[col] = false;
      const list = byColumn.get(col);
      if (list) landings.push(this.dropColumn(list));
      await pause(COLUMN_STOP);
    }
    await Promise.all(landings);

    if (rows !== this.rows) {
      this.rows = rows;
      this.drawLocked();
      const flash = new Graphics()
        .rect(0, COIN_FIELD.cellH * (rows - 1), COIN_FIELD.cellW * COIN_COLS, COIN_FIELD.cellH)
        .fill({ color: COLOR.gold, alpha: 0.35 });
      this.view.addChild(flash);
      await new Promise<void>((resolve) => {
        gsap.to(flash, {
          alpha: 0,
          duration: dur(0.5),
          onComplete: () => {
            flash.destroy();
            resolve();
          },
        });
      });
    }
  }

  /** Качок подкачал монету: число подрастает на месте. */
  async pump(ticks: PumpTick[]): Promise<void> {
    for (const tick of ticks) {
      const slot = this.slots[tick.index];
      if (!slot) continue;
      slot.amount += tick.add;
      slot.bonus += tick.add;

      if (slot.value) slot.value.text = `×${Math.round(slot.amount)}`;
      else if (slot.showsTotal) this.setPlate(slot, `×${Math.round(slot.amount)}`);
      else this.setPlate(slot, `+${slot.bonus}`);

      gsap.fromTo(
        slot.view.scale,
        { x: 1, y: 1 },
        { x: 1.18, y: 1.18, duration: dur(0.14), yoyo: true, repeat: 1 },
      );
      await pause(130);
    }
  }

  setRespins(left: number): void {
    this.respinsText.text = left > 0 ? `РЕСПИНЫ: ${left}` : 'ПОСЛЕДНИЙ ШАНС';
  }

  /** Итог: сумма поля, множитель и, если повезло, полное поле. */
  async finish(total: number, mult: number, filled: boolean, betCoins: number): Promise<void> {
    const coins = Math.round(total * betCoins).toLocaleString('ru-RU');
    this.totalText.text = filled ? `ВСЁ ПОЛЕ! ${coins}` : mult > 1 ? `${coins}  (×${mult})` : coins;
    gsap.fromTo(
      this.totalText.scale,
      { x: 0.7, y: 0.7 },
      { x: 1, y: 1, duration: dur(0.4), ease: 'back.out(2)' },
    );
    await pause(1600);
  }

  /** Убирает поле. Как и появление, происходит под шторкой — без проявлений. */
  hide(): void {
    this.view.visible = false;
    this.clearCoins();
  }
}
