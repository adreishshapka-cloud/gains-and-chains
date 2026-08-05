import {
  Application,
  Assets,
  Container,
  Graphics,
  Rectangle,
  Sprite,
  Text,
  Texture,
} from 'pixi.js';
import type { BeltReward } from '../core/features/beltCollection';
import { BONUS_BUY_COST, DOORS } from '../core/features/freeSpins';
import type { RoundEvent } from '../core/events';
import { COIN_ROWS_START } from '../core/features/coinRush';
import { REELS_BASE, REELS_FREE } from '../core/reels';
import {
  createGameState,
  emptyParts,
  finishRound,
  playBase,
  playCoins,
  playFree,
  type BonusId,
  type GameState,
} from '../core/round';
import { createRng } from '../core/rng';
import { drawGrid } from '../core/spin';
import { Sym, type CollectWin, type LineWin } from '../core/types';
import backgroundUrl from '../assets/ui/background.png';
import bonusRoomUrl from '../assets/ui/bonus-room.png';
import bossUrl from '../assets/ui/boss-throne.png';
import dungeonRoomUrl from '../assets/ui/dungeon-entrance.png';
import dungeonDoorUrl from '../assets/ui/dungeon-door.png';
import oilPanelUrl from '../assets/ui/oil-panel.png';
import rulesScreenUrl from '../assets/ui/rules-screen.png';
import menuScreenUrl from '../assets/ui/menu-screen.png';
import choiceScreenUrl from '../assets/ui/choice-screen.png';
import topupScreenUrl from '../assets/ui/topup-screen.png';
import vanUrl from '../assets/ui/van-stand.png';
import logoUrl from '../assets/ui/logo.png';
import signUrl from '../assets/ui/sign-van.png';
import tableUrl from '../assets/ui/table-still.png';
import bottomBarUrl from '../assets/ui/bottom-bar.png';
import skipUrl from '../assets/ui/skip-button.png';
import turboUrl from '../assets/ui/turbo-button.png';
import autoUrl from '../assets/ui/auto-button.png';
import menuUrl from '../assets/ui/menu-button.png';
import moneyPanelUrl from '../assets/ui/money-panel.png';
import stepperPanelUrl from '../assets/ui/stepper-panel.png';
import infoPanelUrl from '../assets/ui/info-panel.png';
import coinUrl from '../assets/symbols/coin.png';
import {
  clearSave,
  defaultSave,
  loadSave,
  rankFor,
  writeSave,
  type SaveData,
  type Stats,
} from '../state/save';
import { DoorScreen } from '../ui/DoorScreen';
import { HotZone } from '../ui/HotZone';
import { PaytableScreen } from '../ui/PaytableScreen';
import { SettingsScreen } from '../ui/SettingsScreen';
import { TopUpScreen } from '../ui/TopUpScreen';
import { label } from '../ui/widgets';
import { BeltStrip } from './BeltStrip';
import { BigWinBanner } from './BigWinBanner';
import { CoinField } from './CoinField';
import { loadCoinArt } from './coinTextures';
import { DungeonEntrance } from './DungeonEntrance';
import {
  BOSS_AT,
  BUTTONS,
  COIN,
  INFO,
  LOGO_AT,
  BOTTOM_BAR,
  ROW_BUTTONS,
  INFO_PANEL,
  MONEY,
  MONEY_PANEL,
  STEPPER_PANEL,
  OIL_BAR,
  OIL_PANEL,
  REELS_FRAME,
  PANEL_TOP,
  REELS_AT,
  SIGN_AT,
  TABLE_AT,
  STAGE_H,
  STAGE_W,
  VAN_AT,
} from './layout';
import { Mascot, type MascotBox } from './Mascot';
import { music, type Theme } from './music';
import { sound } from './sound';
import { COLOR } from './palette';
import { ReelDividers } from './ReelDividers';
import { ReelSet } from './ReelSet';
import { AUTO_ROUNDS, BET_LEVELS } from './rules';
import { StickyOverlay } from './StickyOverlay';
import { loadSymbolArt } from './symbolTextures';
import { pause, timing, TURBO_SPEED } from './timing';
import { TIERS, WinPresenter } from './WinPresenter';

/** Порог полноэкранного объявления выигрыша, в ставках. Обычный показ над
 *  барабанами есть у любого выигрыша; это — надстройка для по-настоящему
 *  крупных, которые должны бросаться в глаза, а не тонуть в размере окна барабанов. */
const BIG_WIN_THRESHOLD = 10;

/**
 * Сцена и игровой цикл.
 *
 * Весь интерфейс нарисован на фоне: рамки, панели, кнопки. Движок кладёт поверх
 * только изменяющееся — символы, числа, подсветку — по координатам из layout.ts.
 * Рисовать панели кодом поверх готового макета означало бы класть худшую копию
 * поверх лучшего оригинала.
 *
 * Ни одного решения о выплатах здесь нет: сцена берёт готовый лог событий
 * у мат-модели и разыгрывает его во времени.
 */

/** Значения правой панели: у них общая ячейка фиксированной ширины. */
const INFO_CELLS = new Set(['tokens', 'sticky', 'dry', 'betCoins', 'buyCoins']);

/** Ниже этого числа ставок пополнение начинает мигать. */
const LOW_BALANCE = 1;

/**
 * Комнаты. Их две, и различаются они ровно тремя вещами: картинкой фона,
 * фигурой в слоте маскота и темой музыки. Всё остальное — рамка барабанов,
 * панели, кнопки, координаты из layout.ts — у них общее, потому что фон
 * бонусной комнаты собран вокруг той же рамки (tools/prep_bonus_room.py).
 *
 * Из-за этого переключение стоит подмены двух текстур, и не приходится
 * держать вторую раскладку экрана со своими координатами для каждого числа.
 */
type Room = 'main' | 'bonus';

interface RoomArt {
  /** Фон целиком и его нижняя полоса отдельной рамкой — она идёт поверх маскота. */
  plate: Texture;
  floor: Texture;
  figure: Texture;
  figureBox: MascotBox;
  theme: Theme;
}

export class Game {
  private readonly app = new Application();
  private readonly rng = createRng();
  private readonly state: GameState = createGameState();

  private reels!: ReelSet;
  private win!: WinPresenter;
  private bigWin!: BigWinBanner;
  /** Монета рядом с балансом — так же, как нарисовано на панели в наборе. */
  private coinTexture!: Texture;
  private coinIcon!: Sprite;
  private stickyOverlay!: StickyOverlay;
  private belt!: BeltStrip;
  private mascot!: Mascot;
  private rules!: PaytableScreen;
  private doors!: DoorScreen;
  private topUp!: TopUpScreen;
  private settings!: SettingsScreen;
  private entrance!: DungeonEntrance;
  private coinField!: CoinField;

  /** Две комнаты одной сцены: обстановка меняется, интерфейс остаётся на месте. */
  private rooms!: Record<Room, RoomArt>;
  private room: Room = 'main';
  /** Фон и его же низ вторым слоем поверх маскота — оба меняются вместе. */
  private bg!: Sprite;
  private floorLine!: Sprite;
  /** Обстановка только основной комнаты: в подземелье её нет. */
  private mainProps: Sprite[] = [];

  private banner!: Container;
  private bannerText!: Text;
  private statusText!: Text;

  private readonly texts = new Map<string, Text>();
  private readonly zones = new Map<string, HotZone>();

  private save!: SaveData;
  private balance = 0;
  private betIndex = 0;
  private stats!: Stats;
  private busy = false;
  private autoLeft = 0;
  private counterCoins = 0;

  private get betCoins(): number {
    return BET_LEVELS[this.betIndex];
  }

  get debug() {
    return {
      balance: this.balance,
      bet: this.betCoins,
      busy: this.busy,
      auto: this.autoLeft,
      turbo: timing.speed > 1,
      counter: this.counterCoins,
      presenting: this.win?.isPresenting ?? false,
      slowMotion: this.win?.slowMotion ?? 1,
      spinning: this.reels?.isSpinning ?? false,
      sticky: this.state.sticky.length,
      tokens: this.state.belt.tokens,
      dry: this.state.belt.dry,
      rank: rankFor(this.stats?.wagered ?? 0).title,
      stats: this.stats,
    };
  }

  async debugSpin(buy = false): Promise<void> {
    await this.spin(buy);
  }

  debugSlowMotion(factor: number): void {
    this.win.slowMotion = factor;
  }

  resetProgress(): void {
    if (this.busy) return;
    clearSave();
    const fresh = defaultSave();
    this.balance = fresh.balance;
    this.betIndex = fresh.betIndex;
    this.stats = fresh.stats;
    this.state.belt = { ...fresh.belt };
    this.state.sticky = [];
    this.autoLeft = 0;
    this.stickyOverlay.clear();
    this.restoreBoard();
    this.refreshAll();
    this.setStatus('Начали заново.');
  }

  // ── Запуск ──────────────────────────────────────────────────

  async init(mount: HTMLElement): Promise<void> {
    this.save = loadSave();
    this.balance = this.save.balance;
    this.betIndex = Math.min(Math.max(0, this.save.betIndex), BET_LEVELS.length - 1);
    this.stats = this.save.stats;
    this.state.belt = { ...this.save.belt };
    this.state.sticky = this.save.sticky.map((s) => ({ ...s }));
    timing.speed = this.save.turbo ? TURBO_SPEED : 1;

    await this.app.init({
      width: STAGE_W,
      height: STAGE_H,
      background: 0x0a0510,
      antialias: false,
      resolution: Math.min(2, window.devicePixelRatio || 1),
      autoDensity: true,
    });
    mount.appendChild(this.app.canvas);
    this.fitToWindow();
    window.addEventListener('resize', () => this.fitToWindow());

    const [
      background,
      bonusRoomTexture,
      bossTexture,
      dungeonRoomTexture,
      dungeonDoorTexture,
      vanTexture,
      logoTexture,
      signTexture,
      tableTexture,
      bottomBarTexture,
      skipTexture,
      turboTexture,
      autoTexture,
      menuTexture,
      moneyTexture,
      stepperTexture,
      infoTexture,
      oilPanelTexture,
      rulesScreenTexture,
      menuScreenTexture,
      choiceScreenTexture,
      topupScreenTexture,
      coinTexture,
    ] = await Promise.all([
      Assets.load<Texture>(backgroundUrl),
      Assets.load<Texture>(bonusRoomUrl),
      Assets.load<Texture>(bossUrl),
      Assets.load<Texture>(dungeonRoomUrl),
      Assets.load<Texture>(dungeonDoorUrl),
      Assets.load<Texture>(vanUrl),
      Assets.load<Texture>(logoUrl),
      Assets.load<Texture>(signUrl),
      Assets.load<Texture>(tableUrl),
      Assets.load<Texture>(bottomBarUrl),
      Assets.load<Texture>(skipUrl),
      Assets.load<Texture>(turboUrl),
      Assets.load<Texture>(autoUrl),
      Assets.load<Texture>(menuUrl),
      Assets.load<Texture>(moneyPanelUrl),
      Assets.load<Texture>(stepperPanelUrl),
      Assets.load<Texture>(infoPanelUrl),
      Assets.load<Texture>(oilPanelUrl),
      Assets.load<Texture>(rulesScreenUrl),
      Assets.load<Texture>(menuScreenUrl),
      Assets.load<Texture>(choiceScreenUrl),
      Assets.load<Texture>(topupScreenUrl),
      Assets.load<Texture>(coinUrl),
    ]);
    coinTexture.source.scaleMode = 'nearest';
    this.coinTexture = coinTexture;
    const art = await loadSymbolArt(this.app.renderer);

    // Низ фона рисуется вторым слоем поверх маскота (см. floorLine ниже),
    // поэтому у каждой комнаты своя пара: вся картинка и её нижняя полоса.
    const floorFrame = (texture: Texture) =>
      new Texture({
        source: texture.source,
        frame: new Rectangle(0, PANEL_TOP, STAGE_W, STAGE_H - PANEL_TOP),
      });

    this.rooms = {
      main: {
        plate: background,
        floor: floorFrame(background),
        figure: vanTexture,
        figureBox: VAN_AT,
        theme: 'main',
      },
      bonus: {
        plate: bonusRoomTexture,
        floor: floorFrame(bonusRoomTexture),
        figure: bossTexture,
        figureBox: BOSS_AT,
        theme: 'bonus',
      },
    };

    this.bg = new Sprite(background);
    this.bg.width = STAGE_W;
    this.bg.height = STAGE_H;
    this.app.stage.addChild(this.bg);

    // Новый логотип ложится ровно на старый, запечённый в фон.
    //
    // Это одна и та же картинка, просто выгруженная отдельным файлом, поэтому
    // прямоугольник взят по чернилам старой надписи (обмерено: 13,23 411x101),
    // а не «на глаз покрупнее». Буквы совпадают одна в одну, и старая надпись
    // не просвечивает в просветах — а именно там она и двоилась, когда логотип
    // клали произвольного размера. Стирать старую с фона не пришлось: через
    // неё проходят цепи, и вместе с буквами они повисали в воздухе.
    const logo = new Sprite(logoTexture);
    logo.position.set(LOGO_AT.x, LOGO_AT.y);
    logo.width = LOGO_AT.w;
    logo.height = (LOGO_AT.w / logoTexture.width) * logoTexture.height;
    this.app.stage.addChild(logo);

    // Табличка на стене — до маскота: она висит за ним, и если по кадру они
    // соприкоснутся, перекрывать должен он, а не она.
    const sign = new Sprite(signTexture);
    sign.position.set(SIGN_AT.x, SIGN_AT.y);
    sign.width = SIGN_AT.w;
    sign.height = (SIGN_AT.w / signTexture.width) * signTexture.height;
    this.app.stage.addChild(sign);

    // Посуда на тумбе — тоже до маскота: он стоит перед тумбой и заслоняет
    // её краем, как и было на макете.
    const still = new Sprite(tableTexture);
    still.width = TABLE_AT.w;
    still.height = (TABLE_AT.w / tableTexture.width) * tableTexture.height;
    still.position.set(TABLE_AT.x, TABLE_AT.y - still.height);
    this.app.stage.addChild(still);

    // Обстановка основной комнаты. Табличка с именем VAN и его тумба — потому
    // что в подземелье у стены сидит другой хозяин, и его именем эти вещи
    // не подписать. Заголовок игры — потому что на его месте в бонусной комнате
    // горит своя вывеска «NO EXCUSES», и вдвоём они спорят за один угол.
    this.mainProps = [logo, sign, still];

    this.mascot = new Mascot(vanTexture, VAN_AT);
    this.app.stage.addChild(this.mascot.view);

    // Нижняя часть макета — панель баланса и ряд иконок — рисуется ВТОРЫМ
    // слоем поверх маскота, тем же изображением фона. VAN стоит на полу
    // комнаты, а не на панели: без этого слоя его ноги лежали бы поверх
    // «БАЛАНС / СТАВКА / ВЫИГРЫШ». Спрайт при этом можно строить в полный
    // рост и не подгонять его высоту под верхний край панели.
    this.floorLine = new Sprite(this.rooms.main.floor);
    this.floorLine.position.set(0, PANEL_TOP);
    this.app.stage.addChild(this.floorLine);

    // Деревянная рамка вокруг окна закрывается тёмной плитой: на макете она
    // обводит поле коричневым кантом с заклёпками и тянет взгляд на себя,
    // а смотреть надо на символы. Плита кладётся ПОД барабаны и под поле
    // монет, поэтому обеим играм достаётся ровный тёмный прямоугольник.
    const frameCover = new Graphics()
      .rect(REELS_FRAME.x, REELS_FRAME.y, REELS_FRAME.w, REELS_FRAME.h)
      .fill(0x0a0710);
    this.app.stage.addChild(frameCover);

    this.reels = new ReelSet(art.textures, REELS_BASE);
    this.reels.onReelStop = () => sound.reelStop();
    this.reels.view.position.set(REELS_AT.x, REELS_AT.y);
    this.app.stage.addChild(this.reels.view);

    // Поле монетного бонуса — поверх барабанов: на время OIL RUSH барабаны
    // прячутся целиком, это отдельная игра на том же экране.
    this.coinField = new CoinField(await loadCoinArt());
    this.app.stage.addChild(this.coinField.view);

    // Порядок слоёв: отметки липких ♂ под линиями выплат, иначе рамки спорят.
    this.stickyOverlay = new StickyOverlay();
    this.reels.overlayParent.addChild(this.stickyOverlay.view);
    this.win = new WinPresenter(this.reels);
    this.reels.overlayParent.addChild(this.win.view);

    // Готовые панели поверх нарисованных на макете: деньги, степпер, правая
    // таблица. Всё три идут после слоя нижней полосы — иначе она бы их накрыла.
    for (const [texture, box] of [
      [moneyTexture, MONEY_PANEL],
      [stepperTexture, STEPPER_PANEL],
      [infoTexture, INFO_PANEL],
    ] as const) {
      const panel = new Sprite(texture);
      panel.position.set(box.x, box.y);
      panel.width = box.w;
      panel.height = box.h;
      this.app.stage.addChild(panel);
    }

    // Ряд кнопок готовыми рисунками поверх нарисованных на макете.
    for (const [texture, box] of [
      [skipTexture, ROW_BUTTONS.buy],
      [turboTexture, ROW_BUTTONS.turbo],
      [autoTexture, ROW_BUTTONS.auto],
      [menuTexture, ROW_BUTTONS.menu],
    ] as const) {
      const button = new Sprite(texture);
      button.position.set(box.x, box.y);
      button.width = box.w;
      button.height = box.h;
      this.app.stage.addChild(button);
    }

    // Разметка поля — сразу над подложкой барабанов и ПОД символами:
    // строчка размечает ячейки, а не лежит решёткой поверх игры.
    this.reels.view.addChildAt(new ReelDividers().view, 1);

    // Правая половина нижней полосы одним рисунком: накопитель, «OIL UP»
    // и шкала «VAN'S FIST» на общем фоне.
    const bottomBar = new Sprite(bottomBarTexture);
    bottomBar.position.set(BOTTOM_BAR.x, BOTTOM_BAR.y);
    bottomBar.width = BOTTOM_BAR.w;
    bottomBar.height = BOTTOM_BAR.h;
    this.app.stage.addChild(bottomBar);

    // Секция «OIL UP» отдельной панелью поверх полосы: у неё чистая ячейка
    // счётчика, а у нарисованной на полосе — след от гашения запечённой цифры.
    const oilPanel = new Sprite(oilPanelTexture);
    oilPanel.position.set(OIL_PANEL.x, OIL_PANEL.y);
    oilPanel.width = OIL_PANEL.w;
    oilPanel.height = OIL_PANEL.h;
    this.app.stage.addChild(oilPanel);

    this.belt = new BeltStrip();
    this.app.stage.addChild(this.belt.view);

    this.buildTexts();
    this.buildZones();
    this.buildBanner();

    // Поверх обычного показа и модального ряда экранов: полноэкранный баннер
    // не ждёт решения игрока, поэтому конкурировать с DoorScreen/PaytableScreen
    // ему не за что, а показываться он обязан поверх абсолютно всего.
    this.bigWin = new BigWinBanner();
    this.app.stage.addChild(this.bigWin.view);

    this.rules = new PaytableScreen(STAGE_W, STAGE_H, rulesScreenTexture);
    this.app.stage.addChild(this.rules.view);
    this.doors = new DoorScreen(STAGE_W, STAGE_H, choiceScreenTexture);
    this.app.stage.addChild(this.doors.view);
    this.topUp = new TopUpScreen(STAGE_W, STAGE_H, topupScreenTexture);
    this.app.stage.addChild(this.topUp.view);
    this.settings = new SettingsScreen(STAGE_W, STAGE_H, menuScreenTexture);
    this.settings.onToggleTurbo = () => {
      this.toggleTurbo();
      this.settings.show({ turbo: timing.speed > 1, volume: music.level, stats: this.stats, balance: this.balance });
    };
    this.settings.onVolume = (value) => {
      music.setVolume(value);
      this.persist();
    };
    this.settings.onReset = () => this.resetProgress();
    this.app.stage.addChild(this.settings.view);

    // Последним слоем: сцена входа накрывает собой всё, включая баннеры
    // и экраны. Пока она на экране, игра ничего не ждёт от игрока.
    this.entrance = new DungeonEntrance(dungeonRoomTexture, dungeonDoorTexture);
    this.app.stage.addChild(this.entrance.view);

    this.restoreBoard();
    this.refreshAll();

    // Музыка основной комнаты — сразу при входе, если её не выключали.
    // Слушатели ниже нужны только на случай браузера: там политика автозапуска
    // может отклонить первый play(), пока страницу не тронули, и запуск
    // повторяется с первого же клика или клавиши.
    music.setVolume(this.save.musicVolume);
    music.setEnabled(this.save.music);
    sound.setEnabled(this.save.sound);
    music.play('main');
    const unlock = () => music.unlock();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });

    this.app.ticker.add((ticker) => this.reels.update(ticker.deltaMS / 1000));
    window.addEventListener('keydown', (e) => this.onKey(e));
  }

  /**
   * Переводит сцену в другую комнату.
   *
   * Меняются три вещи: картинка фона (вместе с её нижней полосой), фигура
   * в слоте маскота и тема музыки. Координаты не трогаются вовсе — фон
   * бонусной комнаты собран вокруг той же рамки барабанов и той же полосы,
   * что и основной, поэтому весь интерфейс остаётся на своих местах.
   *
   * Вызывать только под затемнением: подмена мгновенная, и в открытом кадре
   * она читается как сбой.
   */
  private setRoom(room: Room): void {
    if (this.room === room) return;
    this.room = room;

    const art = this.rooms[room];
    this.bg.texture = art.plate;
    this.bg.width = STAGE_W;
    this.bg.height = STAGE_H;
    this.floorLine.texture = art.floor;
    this.mascot.setFigure(art.figure, art.figureBox);
    for (const prop of this.mainProps) prop.visible = room === 'main';
    music.play(art.theme);
  }

  /** Канвас вписывается в окно целиком, сохраняя пропорции макета. */
  private fitToWindow(): void {
    const scale = Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H);

    // Плотность рисования подгоняется под то, во сколько раз макет растянут
    // на экране. Иначе картинка пересчитывается дважды: сначала движок рисует
    // сцену в канвас 1609x918, потом браузер растягивает готовый канвас под
    // размер окна своим фильтром — и всё, включая маскота и надписи, слегка
    // мылится. С подогнанной плотностью пересчёт один: движок сразу рисует
    // в том разрешении, в каком картинку увидят.
    const density = Math.min(3, Math.max(1, scale * (window.devicePixelRatio || 1)));
    if (Math.abs(this.app.renderer.resolution - density) > 0.01) {
      this.app.renderer.resize(STAGE_W, STAGE_H, density);
    }

    // Строго после resize: он сам выставляет размер канваса в CSS-пикселях
    // (autoDensity), и без этого канвас вернулся бы к размеру макета.
    const canvas = this.app.canvas;
    canvas.style.width = `${Math.floor(STAGE_W * scale)}px`;
    canvas.style.height = `${Math.floor(STAGE_H * scale)}px`;
  }

  // ── Сборка ──────────────────────────────────────────────────

  private put(key: string, text: Text): void {
    this.texts.set(key, text);
    this.app.stage.addChild(text);
  }

  private buildTexts(): void {
    // Значения стоят по центру своих ячеек на новых панелях, поэтому якорь
    // посередине, а не в левом верхнем углу, как было на плоской полосе.
    const money = (x: number, y: number, size: number, color: number) => {
      const t = label('', size, color);
      t.anchor.set(0.5, 0.5);
      t.position.set(x, y);
      return t;
    };

    this.put('balance', money(MONEY.balance.x, MONEY.balance.y, 30, COLOR.gold));

    // Монета сразу за суммой баланса — на панели из набора она нарисована
    // именно так. Число меняет ширину с каждой цифрой, поэтому монета не
    // прибита гвоздями: её и саму сумму двигает setText(), удерживая пару
    // по центру ячейки.
    this.coinIcon = new Sprite(this.coinTexture);
    this.coinIcon.anchor.set(0.5, 0.5);
    this.coinIcon.width = COIN.size;
    this.coinIcon.height = COIN.size;
    this.coinIcon.y = MONEY.balance.y + 1;
    this.app.stage.addChild(this.coinIcon);
    // Ставка и выигрыш тем же золотом, что и баланс: на панели из набора
    // все три значения одного цвета, и белое с бирюзовым рядом с ним
    // выглядели как три разных интерфейса в одной полосе.
    this.put('bet', money(MONEY.bet.x, MONEY.bet.y, 30, COLOR.gold));
    this.put('win', money(MONEY.win.x, MONEY.win.y, 30, COLOR.gold));

    const stepper = label('', 30, COLOR.paper);
    stepper.anchor.set(0.5, 0.5);
    stepper.position.set(MONEY.stepper.x, MONEY.stepper.y);
    this.put('stepper', stepper);

    this.buildInfoPanel();

    // Счётчик цепей на экране — в полосе OIL UP.
    const oil = label('', 22, COLOR.gold);
    oil.anchor.set(0.5, 0.5);
    oil.position.set(OIL_BAR[0] + OIL_BAR[2] / 2, OIL_BAR[1] + OIL_BAR[3] / 2);
    this.put('oil', oil);

    this.statusText = label('', 19, 0xb9a8c9);
    this.statusText.anchor.set(0.5, 0);
    this.statusText.position.set(REELS_AT.x + (REELS_AT.cell * 5) / 2, 664);
    this.app.stage.addChild(this.statusText);
  }

  /**
   * Правая панель целиком: подписи, значения и разделители.
   * С макета её нутро стёрто — так обе колонки гарантированно выровнены.
   */
  /**
   * Пять значений правой панели.
   *
   * Всё остальное — подписи, разделители, рамки ячеек, таблица выплат
   * и строка горячих клавиш — нарисовано на самой панели (INFO_PANEL).
   * Раньше движок рисовал там обе колонки целиком; теперь панель приходит
   * готовой, и держать вторую копию постоянных чисел незачем.
   */
  private buildInfoPanel(): void {
    // Цвет снят с запечённых значений той же панели («Линий 20» осталось
    // нарисованным) — иначе живые числа светились белым рядом с золотыми.
    const cell = (key: string, y: number) => {
      const value = label('', INFO.size, 0xe1af4c);
      value.anchor.set(1, 0.5);
      value.position.set(INFO.valueRight, y);
      this.put(key, value);
    };

    cell('tokens', INFO.rows.tokens);
    cell('sticky', INFO.rows.sticky);
    cell('dry', INFO.rows.dry);
    cell('betCoins', INFO.rows.bet);
    cell('buyCoins', INFO.rows.buy);
  }

  private buildZones(): void {
    const add = (key: string, onTap: () => void, accent?: number) => {
      const zone = new HotZone(BUTTONS[key], onTap, accent);
      this.zones.set(key, zone);
      this.app.stage.addChild(zone.view);
    };

    // Цвета подсветки — по образцам из набора ассетов: покупка бонуса
    // неоново-фиолетовая, весь остальной металл раскалённый.
    //
    // SPIN тоже раскалённый, а не золотой, хотя сама кнопка золотая: золото
    // по золоту не читается вовсе — подсветку было не отличить от блика
    // на самой кнопке. На образце вокруг SPIN как раз тёплый оранжевый ореол.
    add('spin', () => void this.spin(), COLOR.fire);
    add('buy', () => void this.spin(true), COLOR.neon);
    add('turbo', () => this.toggleTurbo(), COLOR.fire);
    add('auto', () => this.toggleAuto(), COLOR.fire);
    add('menu', () => this.openSettings(), COLOR.fire);
    add('betDown', () => this.stepBet(-1), COLOR.fire);
    add('betUp', () => this.stepBet(1), COLOR.fire);
    add('topUp', () => void this.openTopUp(), COLOR.fire);
    // Правила открываются только отсюда: одноимённая кнопка на панели была
    // третьим входом в тот же экран и убрана с макета.
    add('help', () => this.rules.show(), COLOR.fire);
    add('fullscreen', () => this.toggleFullscreen(), COLOR.fire);
    add('settings', () => this.openSettings(), COLOR.fire);
    add('sound', () => this.toggleSound(), COLOR.fire);
    add('music', () => this.toggleMusic(), COLOR.fire);

    // Кнопка горит, пока музыка включена, — как «турбо» и «авто».
    this.zones.get('music')?.setActive(music.isOn);
    this.zones.get('sound')?.setActive(sound.isOn);
  }

  private buildBanner(): void {
    this.banner = new Container();
    this.banner.visible = false;

    const g = new Graphics();
    g.roundRect(0, 0, 700, 140, 18).fill({ color: 0x0a0510, alpha: 0.95 });
    g.roundRect(0, 0, 700, 140, 18).stroke({ color: COLOR.gold, width: 5 });
    this.banner.addChild(g);

    this.bannerText = label('', 40, COLOR.gold);
    this.bannerText.anchor.set(0.5);
    this.bannerText.position.set(350, 70);
    this.banner.addChild(this.bannerText);

    this.banner.position.set((STAGE_W - 700) / 2, 300);
    this.app.stage.addChild(this.banner);
  }

  private restoreBoard(): void {
    const grid = drawGrid(this.rng, REELS_BASE);
    for (const s of this.state.sticky) grid[s.reel][s.row] = Sym.WILD;
    this.reels.setGrid(grid);
    this.stickyOverlay.update(this.state.sticky, 'base');
    this.belt.set(this.state.belt.tokens);
    // Поле набрано случайное, цепей на нём не считали — счётчик показывает ноль,
    // а не пустую ячейку: пустая читается сломанной панелью, а не нулём.
    this.setText('oil', '0');
  }

  // ── Управление ──────────────────────────────────────────────

  private get modalOpen(): boolean {
    return this.rules.isOpen || this.doors.isOpen || this.topUp.isOpen || this.settings.isOpen;
  }

  private onKey(e: KeyboardEvent): void {
    if (e.code === 'Escape') {
      if (this.rules.isOpen) this.rules.hide();
      if (this.settings.isOpen) this.settings.hide();
      if (this.doors.isOpen && this.doors.canCancel) this.doors.requestClose();
      return;
    }
    if (this.modalOpen) return;

    switch (e.code) {
      case 'Space':
        e.preventDefault();
        void this.spin();
        break;
      case 'KeyA':
        this.toggleAuto();
        break;
      case 'KeyT':
        this.toggleTurbo();
        break;
      case 'KeyP':
        this.rules.show();
        break;
      case 'KeyF':
        this.toggleFullscreen();
        break;
    }
  }

  private toggleFullscreen(): void {
    // В упакованном приложении окно переводит Electron: браузерный API там
    // требует доверенного жеста и отказывает молча.
    const desktop = (globalThis as { desktop?: { toggleFullscreen(): Promise<boolean> } }).desktop;
    if (desktop) {
      void desktop.toggleFullscreen().then(() => {
        requestAnimationFrame(() => this.fitToWindow());
        setTimeout(() => this.fitToWindow(), 140);
      });
      return;
    }

    const done = () => {
      // Полный экран меняет размеры окна не мгновенно: пересчитываем канвас
      // после того, как браузер применит новый размер, иначе игра останется
      // в старом масштабе с чёрными полями.
      requestAnimationFrame(() => this.fitToWindow());
      setTimeout(() => this.fitToWindow(), 120);
    };

    if (document.fullscreenElement) {
      void document
        .exitFullscreen()
        .then(done)
        .catch(() => this.setStatus('Не вышло выйти из полного экрана.'));
      return;
    }

    void document.documentElement
      .requestFullscreen()
      .then(done)
      .catch(() => this.setStatus('Полный экран недоступен — жми F11.'));
  }

  private openSettings(): void {
    if (this.busy) return;
    this.settings.show({ turbo: timing.speed > 1, volume: music.level, stats: this.stats, balance: this.balance });
  }

  private stepBet(delta: number): void {
    if (this.busy) return;
    const next = this.betIndex + delta;
    if (next < 0 || next >= BET_LEVELS.length) return;
    this.betIndex = next;
    this.refreshAll();
    this.persist();
  }

  private toggleSound(): void {
    const on = !sound.isOn;
    sound.setEnabled(on);
    this.zones.get('sound')?.setActive(on);
    this.setStatus(on ? 'Звук включён.' : 'Звук выключен.');
    this.persist();
  }

  private toggleMusic(): void {
    const on = !music.isOn;
    music.setEnabled(on);
    this.zones.get('music')?.setActive(on);
    this.setStatus(on ? 'Музыка включена.' : 'Музыка выключена.');
    this.persist();
  }

  private toggleTurbo(): void {
    const on = timing.speed === 1;
    timing.speed = on ? TURBO_SPEED : 1;
    this.zones.get('turbo')?.setActive(on);
    this.persist();
  }

  private toggleAuto(): void {
    if (this.autoLeft > 0) {
      this.autoLeft = 0;
      this.zones.get('auto')?.setActive(false);
      this.setStatus('Автоспин остановлен.');
      return;
    }
    this.autoLeft = AUTO_ROUNDS;
    this.zones.get('auto')?.setActive(true);
    void this.runAuto();
  }

  private async runAuto(): Promise<void> {
    while (this.autoLeft > 0) {
      if (this.balance < this.betCoins) break;
      this.autoLeft--;
      await this.spin();
      if (this.autoLeft > 0) await pause(250);
    }
    this.autoLeft = 0;
    this.zones.get('auto')?.setActive(false);
  }

  private async openTopUp(): Promise<void> {
    if (this.busy) return;
    const coins = await this.topUp.choose();
    if (coins === null) return;
    this.balance += coins;
    this.stats.topUps = (this.stats.topUps ?? 0) + 1;
    this.refreshAll();
    this.persist();
    this.mascot.setMood('nod');
    this.setStatus(`Плюс ${coins.toLocaleString('ru-RU')} монет. Работаем.`);
  }

  // ── Игровой цикл ────────────────────────────────────────────

  private async spin(buy = false): Promise<void> {
    if (this.busy || this.modalOpen) return;

    const cost = buy ? BONUS_BUY_COST * this.betCoins : this.betCoins;
    if (this.balance < cost) {
      this.autoLeft = 0;
      this.zones.get('auto')?.setActive(false);
      this.setStatus(
        buy ? 'На покупку не хватает монет.' : 'Монеты кончились — жми банку с маслом.',
      );
      return;
    }

    // При покупке дверь выбирается ДО списания: передумать должно быть бесплатно.
    // Если спросить после, отказ означал бы потерю уже снятых монет — а отказаться
    // игрок хочет как раз тогда, когда увидел цену.
    let boughtDoor: BonusId | null = null;
    if (buy) {
      this.busy = true;
      this.setInteractive(false);
      boughtDoor = await this.doors.choose(true);
      this.busy = false;
      this.setInteractive(true);
      if (boughtDoor === null) {
        this.setStatus('Передумал — монеты на месте.');
        return;
      }
    }

    this.busy = true;
    this.setInteractive(false);
    this.counterCoins = 0;
    this.balance -= cost;
    this.stats.rounds++;
    this.stats.wagered += cost;
    this.setText('win', '0');
    this.refreshMoney();
    this.mascot.setMood('watch');

    const parts = emptyParts();
    let enterFree = buy;
    let beltReward: BeltReward | null = null;
    let freeSpinsPlayed = 0;
    let coinsCollected = 0;
    let chosen: BonusId | null = null;

    if (!buy) {
      const baseLog: RoundEvent[] = [];
      const phase = playBase({ rng: this.rng, state: this.state, parts, log: baseLog });
      await this.playLog(baseLog);
      enterFree = phase.enterFree;
      beltReward = phase.beltReward;
    }

    if (enterFree) {
      // Дверь либо уже выбрана при покупке, либо спрашивается сейчас — и тогда
      // отказаться нельзя: раунд оплачен обычной ставкой.
      const door = boughtDoor ?? (await this.doors.choose(false)) ?? DOORS[0].id;
      chosen = door;

      // Сначала игрок туда доходит. Экран гаснет, из темноты проявляется
      // вход, дверь открывается — и только за ней комната подменяется на
      // бонусную. Подмена под затемнением, в открытом кадре её не бывает.
      await this.entrance.enter();
      this.setRoom('bonus');
      // Поле бонуса готовится ЗДЕСЬ, пока экран ещё чёрный: барабаны уходят,
      // на их месте встаёт пустое поле монет. Если делать это после шторки,
      // поле проявляется поверх барабанов, и сквозь него на мгновение видно
      // и символы, и нарисованную в рамке таблицу выплат.
      if (door === 'OIL_RUSH') {
        this.reels.view.visible = false;
        this.coinField.prepare(COIN_ROWS_START);
      }
      await this.entrance.reveal();

      const bonusLog: RoundEvent[] = [];
      if (door === 'OIL_RUSH') {
        coinsCollected = playCoins({ rng: this.rng, state: this.state, parts, log: bonusLog });
      } else {
        freeSpinsPlayed = playFree({
          rng: this.rng,
          state: this.state,
          parts,
          door,
          log: bonusLog,
        });
      }
      await this.playLog(bonusLog);

      // Обратно — просто затемнением: из подземелья выходят не через дверь.
      // Поле монет убирается там же, под шторкой, и барабаны возвращаются
      // на своё место незаметно.
      await this.entrance.swap(() => {
        this.coinField.hide();
        this.reels.view.visible = true;
        this.setRoom('main');
      });
    }

    const result = finishRound(parts, {
      cost: buy ? BONUS_BUY_COST : 1,
      state: this.state,
      enteredFree: enterFree,
      bonus: chosen,
      freeSpinsPlayed,
      coinsCollected,
      beltReward,
    });

    if (result.capped) await this.showBanner(`ПОТОЛОК ×${result.win}`, 2000);

    const coins = Math.round(result.win * this.betCoins);
    this.balance += coins;
    this.stats.won += coins;
    if (result.win > this.stats.bestWinX) this.stats.bestWinX = result.win;
    if (this.state.belt.dry > this.stats.worstDry) this.stats.worstDry = this.state.belt.dry;
    if (result.enteredFree) this.stats.freeRounds++;
    if (result.beltReward) this.stats.beltRewards++;

    this.setText('win', coins.toLocaleString('ru-RU'));
    this.mascot.setMood(result.win >= 20 ? 'flex' : result.win > 0 ? 'nod' : 'shake');
    this.setStatus(
      coins > 0 ? `Выигрыш ×${result.win.toFixed(2)} от ставки` : 'Пусто. Ещё подход.',
    );

    this.refreshAll();
    this.persist();

    this.busy = false;
    this.setInteractive(true);
  }

  private async playLog(log: readonly RoundEvent[]): Promise<void> {
    for (const ev of log) {
      switch (ev.type) {
        case 'baseSpin': {
          await this.reels.spin(ev.spin.grid);
          this.stickyOverlay.update(ev.spin.sticky, 'base');
          this.setText('oil', String(ev.spin.collect?.chains.length ?? 0));
          await this.presentSpin(ev.spin.lineWins, ev.spin.collect, ev.spin.totalWin);
          await this.maybeShowBigWin(ev.spin.totalWin);
          break;
        }

        case 'beltToken': {
          this.setStatus(`Жетон чемпиона: ${ev.tokens} из 3`);
          this.belt.set(ev.tokens, true);
          await pause(340);
          break;
        }

        case 'beltReward': {
          const what =
            ev.reward.kind === 'cash'
              ? `×${ev.reward.cash} ОТ СТАВКИ`
              : ev.reward.kind === 'freespins'
                ? 'ВХОД В ПОДЗЕМЕЛЬЕ'
                : `${ev.reward.wilds} ЛИПКИХ ♂`;
          this.mascot.setMood('flex');
          await this.showBanner(`ТРИ ЖЕТОНА — ${what}`, 1400);
          this.belt.set(0);
          this.stickyOverlay.update(this.state.sticky, 'base');
          break;
        }

        case 'freeStart': {
          this.reels.setStrips(REELS_FREE);
          this.mascot.setMood('flex');
          await this.showBanner(`DUNGEON RUN — ${ev.door.title}`, 1300);
          break;
        }

        case 'freeSpin': {
          this.setStatus(
            `Фриспин ${ev.index} · множитель ×${ev.mult} · осталось ${ev.spinsLeft}`,
          );
          await this.reels.spin(ev.spin.grid);
          this.stickyOverlay.update(ev.spin.sticky, 'free');
          await this.presentSpin(ev.spin.lineWins, ev.spin.collect, ev.spin.totalWin, ev.mult);
          await this.maybeShowBigWin(ev.spin.totalWin);
          if (ev.spin.totalWin === 0) await pause(170);
          break;
        }

        case 'retrigger':
          await this.showBanner(`+${ev.extra} СПИНА`, 900);
          break;

        case 'freeEnd': {
          this.reels.setStrips(REELS_BASE);
          this.stickyOverlay.clear();
          // Итог бонуса — не рядовой показ, а развязка всего раунда: баннер
          // берёт весь экран, а не только окно барабанов, как обычный выигрыш.
          await this.bigWin.show(
            'ПОДЗЕМЕЛЬЕ ПРОЙДЕНО',
            Math.round(ev.won * this.betCoins),
            COLOR.neon,
            2400,
          );
          break;
        }

        // ── OIL RUSH ────────────────────────────────────────────
        case 'coinStart': {
          // Поле и барабаны переключены раньше, под чёрной шторкой входа
          // (см. spin). Здесь остаётся только уронить стартовые монеты.
          this.setStatus('OIL RUSH — монеты держатся до конца');
          await this.coinField.start(ev.rows, ev.drops);
          break;
        }

        case 'coinRespin': {
          await this.coinField.drop(ev.drops, ev.rows);
          await this.coinField.pump(ev.pumps);
          this.coinField.setRespins(ev.respinsLeft);
          if (ev.drops.length === 0) await pause(260);
          break;
        }

        case 'coinEnd': {
          await this.coinField.finish(ev.total, ev.mult, ev.filled, this.betCoins);
          await this.bigWin.show(
            ev.filled ? 'ВСЁ ПОЛЕ' : 'OIL RUSH',
            Math.round(ev.total * this.betCoins),
            COLOR.gold,
            2400,
          );
          break;
        }

        case 'capped':
          await this.showBanner(`ПОТОЛОК ×${ev.capped}`, 2000);
          break;
      }
    }
  }

  /**
   * Полноэкранное объявление для по-настоящему крупного выигрыша одного спина.
   * Обычный показ (WinPresenter) уже отыграл своё к этому моменту — это надстройка
   * поверх него, а не замена: рядовые выигрыши в ней не нуждаются.
   */
  private async maybeShowBigWin(totalWin: number): Promise<void> {
    if (totalWin < BIG_WIN_THRESHOLD) return;
    const tier = TIERS.find((t) => totalWin >= t.min) ?? TIERS[TIERS.length - 1];
    const coins = Math.round(totalWin * this.betCoins);
    await this.bigWin.show(tier.title, coins, tier.color, tier.hold + 500);
  }

  private presentSpin(
    lineWins: readonly LineWin[],
    collect: CollectWin | null,
    totalWin: number,
    roundMult?: number,
  ): Promise<void> {
    return this.win.present({
      lineWins,
      collect,
      totalWin,
      roundMult,
      betCoins: this.betCoins,
      onCount: (coins) => {
        this.counterCoins = coins;
        this.setText('win', coins.toLocaleString('ru-RU'));
      },
    });
  }

  private async showBanner(message: string, ms: number): Promise<void> {
    this.bannerText.text = message;
    this.banner.visible = true;
    await pause(ms);
    this.banner.visible = false;
  }

  // ── Обновление подписей ─────────────────────────────────────

  private setText(key: string, value: string): void {
    const t = this.texts.get(key);
    if (!t) return;
    t.text = value;

    if (key === 'balance') {
      // Сумма и монета — одна группа по центру ячейки: сумма сдвигается влево
      // ровно на половину того места, которое занимает монета с зазором.
      const shift = (COIN.size + COIN.gap) / 2;
      t.x = MONEY.balance.x - shift;
      this.coinIcon.x = t.x + t.width / 2 + COIN.gap + COIN.size / 2;
    }

    // Значения правой панели ужимаются, если не влезли в свою ячейку:
    // она нарисована под четыре цифры, а на максимальной ставке их бывает семь.
    if (INFO_CELLS.has(key)) {
      t.scale.set(Math.min(1, INFO.maxWidth / Math.max(1, t.width / t.scale.x)));
    }

  }

  private setStatus(text: string): void {
    this.statusText.text = text;
  }

  private setInteractive(on: boolean): void {
    for (const key of ['spin', 'buy', 'betDown', 'betUp', 'topUp']) {
      this.zones.get(key)?.setEnabled(on && (key !== 'spin' || this.balance >= this.betCoins));
    }
    this.zones.get('spin')?.pulse(on && this.balance >= this.betCoins);
  }

  private refreshMoney(): void {
    this.setText('balance', this.balance.toLocaleString('ru-RU'));
    this.setText('bet', this.betCoins.toLocaleString('ru-RU'));
    this.setText('stepper', this.betCoins.toLocaleString('ru-RU'));
    // Поле выигрыша не должно быть пустым до первого спина.
    if (!this.texts.get('win')?.text) this.setText('win', '0');
  }

  private refreshAll(): void {
    this.refreshMoney();
    this.setText('tokens', `${this.state.belt.tokens} / 3`);
    this.setText('sticky', String(this.state.sticky.length));
    this.setText('dry', String(this.state.belt.dry));
    // Без слова «монет»: с ним длинные суммы упирались в край панели.
    this.setText('betCoins', this.betCoins.toLocaleString('ru-RU'));
    this.setText('buyCoins', (BONUS_BUY_COST * this.betCoins).toLocaleString('ru-RU'));

    this.belt.set(this.state.belt.tokens);
    this.setInteractive(!this.busy);
    this.zones.get('topUp')?.pulse(this.balance < LOW_BALANCE * this.betCoins);
  }

  private persist(): void {
    writeSave({
      version: 1,
      balance: this.balance,
      betIndex: this.betIndex,
      turbo: timing.speed > 1,
      music: music.isOn,
      sound: sound.isOn,
      musicVolume: music.level,
      stats: this.stats,
      belt: { ...this.state.belt },
      sticky: this.state.sticky.map((s) => ({ ...s })),
    });
  }
}
