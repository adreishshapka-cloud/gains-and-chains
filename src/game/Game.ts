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
import { BONUS_BUY_COST, DOORS, type DoorId } from '../core/features/freeSpins';
import type { RoundEvent } from '../core/events';
import { CHAIN_VALUES, PAYTABLE } from '../core/paytable';
import { REELS_BASE, REELS_FREE } from '../core/reels';
import {
  createGameState,
  emptyParts,
  finishRound,
  playBase,
  playFree,
  type GameState,
} from '../core/round';
import { createRng } from '../core/rng';
import { drawGrid } from '../core/spin';
import {
  LINES,
  STICKY_MULT_LADDER,
  Sym,
  type CollectWin,
  type LineWin,
} from '../core/types';
import backgroundUrl from '../assets/ui/background.png';
import vanUrl from '../assets/ui/van-stand.png';
import logoUrl from '../assets/ui/logo.png';
import signUrl from '../assets/ui/sign-van.png';
import tableUrl from '../assets/ui/table-still.png';
import ticketPanelUrl from '../assets/ui/ticket-panel.png';
import skipUrl from '../assets/ui/skip-button.png';
import turboUrl from '../assets/ui/turbo-button.png';
import autoUrl from '../assets/ui/auto-button.png';
import menuUrl from '../assets/ui/menu-button.png';
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
import {
  BUTTONS,
  FIST_LABEL,
  INFO,
  LOGO_AT,
  TICKET_PANEL,
  ROW_BUTTONS,
  MONEY,
  OIL_BAR,
  PANEL_TOP,
  REELS_AT,
  SIGN_AT,
  TABLE_AT,
  STAGE_H,
  STAGE_W,
  VAN_AT,
} from './layout';
import { Mascot } from './Mascot';
import { music } from './music';
import { COLOR } from './palette';
import { ReelDividers } from './ReelDividers';
import { ReelSet } from './ReelSet';
import { AUTO_ROUNDS, BET_LEVELS, RTP_LABEL } from './rules';
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

/** Ниже этого числа ставок пополнение начинает мигать. */
const LOW_BALANCE = 1;

export class Game {
  private readonly app = new Application();
  private readonly rng = createRng();
  private readonly state: GameState = createGameState();

  private reels!: ReelSet;
  private win!: WinPresenter;
  private bigWin!: BigWinBanner;
  /** Иконка монеты из исходного макета — стоит рядом со стоимостью покупки. */
  private coinTexture!: Texture;
  private coinIcon!: Sprite;
  private stickyOverlay!: StickyOverlay;
  private belt!: BeltStrip;
  private mascot!: Mascot;
  private rules!: PaytableScreen;
  private doors!: DoorScreen;
  private topUp!: TopUpScreen;
  private settings!: SettingsScreen;

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
      vanTexture,
      coinTexture,
      logoTexture,
      signTexture,
      tableTexture,
      ticketTexture,
      skipTexture,
      turboTexture,
      autoTexture,
      menuTexture,
    ] = await Promise.all([
      Assets.load<Texture>(backgroundUrl),
      Assets.load<Texture>(vanUrl),
      Assets.load<Texture>(coinUrl),
      Assets.load<Texture>(logoUrl),
      Assets.load<Texture>(signUrl),
      Assets.load<Texture>(tableUrl),
      Assets.load<Texture>(ticketPanelUrl),
      Assets.load<Texture>(skipUrl),
      Assets.load<Texture>(turboUrl),
      Assets.load<Texture>(autoUrl),
      Assets.load<Texture>(menuUrl),
    ]);
    coinTexture.source.scaleMode = 'nearest';
    this.coinTexture = coinTexture;
    const art = await loadSymbolArt(this.app.renderer);

    const bg = new Sprite(background);
    bg.width = STAGE_W;
    bg.height = STAGE_H;
    this.app.stage.addChild(bg);

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

    this.mascot = new Mascot(vanTexture, VAN_AT);
    this.app.stage.addChild(this.mascot.view);

    // Нижняя часть макета — панель баланса и ряд иконок — рисуется ВТОРЫМ
    // слоем поверх маскота, тем же изображением фона. VAN стоит на полу
    // комнаты, а не на панели: без этого слоя его ноги лежали бы поверх
    // «БАЛАНС / СТАВКА / ВЫИГРЫШ». Спрайт при этом можно строить в полный
    // рост и не подгонять его высоту под верхний край панели.
    const floorLine = new Sprite(
      new Texture({
        source: background.source,
        frame: new Rectangle(0, PANEL_TOP, STAGE_W, STAGE_H - PANEL_TOP),
      }),
    );
    floorLine.position.set(0, PANEL_TOP);
    this.app.stage.addChild(floorLine);

    this.reels = new ReelSet(art.textures, REELS_BASE);
    this.reels.view.position.set(REELS_AT.x, REELS_AT.y);
    this.app.stage.addChild(this.reels.view);

    // Порядок слоёв: отметки липких ♂ под линиями выплат, иначе рамки спорят.
    this.stickyOverlay = new StickyOverlay();
    this.reels.overlayParent.addChild(this.stickyOverlay.view);
    this.win = new WinPresenter(this.reels);
    this.reels.overlayParent.addChild(this.win.view);

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

    // Панель накопителя целиком — заголовок и три билета одним рисунком.
    const ticketPanel = new Sprite(ticketTexture);
    ticketPanel.position.set(TICKET_PANEL.x, TICKET_PANEL.y);
    this.app.stage.addChild(ticketPanel);

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

    this.rules = new PaytableScreen(STAGE_W, STAGE_H, RTP_LABEL);
    this.app.stage.addChild(this.rules.view);
    this.doors = new DoorScreen(STAGE_W, STAGE_H);
    this.app.stage.addChild(this.doors.view);
    this.topUp = new TopUpScreen(STAGE_W, STAGE_H);
    this.app.stage.addChild(this.topUp.view);
    this.settings = new SettingsScreen(STAGE_W, STAGE_H);
    this.settings.onToggleTurbo = () => {
      this.toggleTurbo();
      this.settings.show({ turbo: timing.speed > 1, stats: this.stats, balance: this.balance });
    };
    this.settings.onReset = () => this.resetProgress();
    this.app.stage.addChild(this.settings.view);

    this.restoreBoard();
    this.refreshAll();

    // Музыка основной комнаты — сразу при входе, если её не выключали.
    // Слушатели ниже нужны только на случай браузера: там политика автозапуска
    // может отклонить первый play(), пока страницу не тронули, и запуск
    // повторяется с первого же клика или клавиши.
    music.setEnabled(this.save.music);
    music.play('main');
    const unlock = () => music.unlock();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });

    this.app.ticker.add((ticker) => this.reels.update(ticker.deltaMS / 1000));
    window.addEventListener('keydown', (e) => this.onKey(e));
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
    const money = (x: number, y: number, size: number, color: number) => {
      const t = label('', size, color);
      t.position.set(x, y);
      return t;
    };

    this.put('balance', money(MONEY.balance.x, MONEY.balance.y, 30, COLOR.gold));
    this.put('bet', money(MONEY.bet.x, MONEY.bet.y, 30, COLOR.paper));
    this.put('win', money(MONEY.win.x, MONEY.win.y, 30, COLOR.cyan));

    const stepper = label('', 30, COLOR.paper);
    stepper.anchor.set(0.5, 0);
    stepper.position.set(MONEY.stepper.x, MONEY.stepper.y);
    this.put('stepper', stepper);

    // Подпись шкалы в нижней полосе — там, где на макете было «DUKE'S FIST».
    // Цвет снят с соседних запечённых подписей («BELT COLLECTION», «OIL UP»),
    // иначе одна надпись в ряду светится ярче остальных.
    const fist = label("VAN'S FIST", FIST_LABEL.size, 0xc08b2e, { letterSpacing: 1 });
    fist.position.set(FIST_LABEL.x, FIST_LABEL.y);
    this.app.stage.addChild(fist);

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
  private buildInfoPanel(): void {
    const rules = new Graphics();
    for (const y of INFO.rules) {
      rules.moveTo(INFO.labelX, y).lineTo(INFO.valueRight, y);
    }
    rules.stroke({ color: 0x6b4429, width: 2, alpha: 0.8 });
    this.app.stage.addChild(rules);

    const row = (key: string, top: number, index: number, caption: string, color: number) => {
      const y = top + index * INFO.step;

      const name = label(caption, 18, color);
      name.position.set(INFO.labelX, y);
      this.app.stage.addChild(name);

      const value = label('', 18, COLOR.paper);
      value.anchor.set(1, 0);
      value.position.set(INFO.valueRight, y);
      this.put(key, value);
    };

    row('tokens', INFO.statsTop, 0, 'Жетоны', 0x9a8aaa);
    row('sticky', INFO.statsTop, 1, 'Липких ♂', 0x9a8aaa);
    row('dry', INFO.statsTop, 2, 'Сухая серия', 0x9a8aaa);

    row('lines', INFO.betTop, 0, 'Линий', 0x9a8aaa);
    row('betCoins', INFO.betTop, 1, 'Ставка', 0x9a8aaa);
    row('buyCoins', INFO.betTop, 2, 'Покупка', 0x9a8aaa);

    // Монета из исходного макета: там она стояла рядом с ценой покупки бонуса
    // («80 x 🪙»). Число подрастает с ростом ставки, поэтому монета не прибита
    // гвоздями — она едет вслед за левым краем текста в setText().
    this.coinIcon = new Sprite(this.coinTexture);
    this.coinIcon.anchor.set(1, 0.15);
    this.coinIcon.width = 22;
    this.coinIcon.height = 22;
    this.coinIcon.y = INFO.betTop + 2 * INFO.step;
    this.app.stage.addChild(this.coinIcon);

    // Цвета повторяют раскладку макета: старшие символы тёплые, младшие холодные.
    const pays: [string, number][] = [
      ['VAN', 0xff6b9a],
      ['TICKET', 0xd4453a],
      ['REF', 0x4a9fff],
      ['ROOKIE', 0x7a6bff],
      ['FIST', 0xff9a3a],
      ['CHAIN', COLOR.gold],
      ['WILD', COLOR.gold],
    ];
    for (const [i, [caption, color]] of pays.entries()) {
      row(`pay${i}`, INFO.payTop, i, caption, color);
    }
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
    add('sound', () => this.setStatus('Звука пока нет — он следующим этапом.'), COLOR.fire);
    add('music', () => this.toggleMusic(), COLOR.fire);

    // Кнопка горит, пока музыка включена, — как «турбо» и «авто».
    this.zones.get('music')?.setActive(music.isOn);
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
    this.settings.show({ turbo: timing.speed > 1, stats: this.stats, balance: this.balance });
  }

  private stepBet(delta: number): void {
    if (this.busy) return;
    const next = this.betIndex + delta;
    if (next < 0 || next >= BET_LEVELS.length) return;
    this.betIndex = next;
    this.refreshAll();
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
    let boughtDoor: DoorId | null = null;
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
      const door = boughtDoor ?? (await this.doors.choose(false)) ?? DOORS[1].id;
      const freeLog: RoundEvent[] = [];
      freeSpinsPlayed = playFree({
        rng: this.rng,
        state: this.state,
        parts,
        door,
        log: freeLog,
      });
      await this.playLog(freeLog);
    }

    const result = finishRound(parts, {
      cost: buy ? BONUS_BUY_COST : 1,
      state: this.state,
      enteredFree: enterFree,
      freeSpinsPlayed,
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

    if (key === 'buyCoins') {
      // Число право-выровнено по INFO.valueRight и меняет ширину с каждой
      // цифрой — монета цепляется за его левый край, а не стоит в фиксированной
      // точке, иначе на пятизначных суммах она бы наехала на текст.
      this.coinIcon.x = t.x - t.width - 6;
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
    this.setText('lines', String(LINES));
    // Без слова «монет»: с ним длинные суммы упирались в край панели.
    this.setText('betCoins', this.betCoins.toLocaleString('ru-RU'));
    this.setText('buyCoins', (BONUS_BUY_COST * this.betCoins).toLocaleString('ru-RU'));

    // Строки таблицы выплат идут в том же порядке, что подписи на фоне.
    const ladder = STICKY_MULT_LADDER;
    const rows = [
      `${PAYTABLE[Sym.DUKE][3]} – ${PAYTABLE[Sym.DUKE][5]}`,
      `${PAYTABLE[Sym.CHAMPION][3]} – ${PAYTABLE[Sym.CHAMPION][5]}`,
      `${PAYTABLE[Sym.REF][3]} – ${PAYTABLE[Sym.REF][5]}`,
      `${PAYTABLE[Sym.ROOKIE][3]} – ${PAYTABLE[Sym.ROOKIE][5]}`,
      'собирает всё',
      `×${CHAIN_VALUES[0].value} – ×${CHAIN_VALUES[CHAIN_VALUES.length - 1].value}`,
      `×${ladder[0]} → ×${ladder[ladder.length - 1]}`,
    ];
    for (const [i, value] of rows.entries()) this.setText(`pay${i}`, value);

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
      stats: this.stats,
      belt: { ...this.state.belt },
      sticky: this.state.sticky.map((s) => ({ ...s })),
    });
  }
}
