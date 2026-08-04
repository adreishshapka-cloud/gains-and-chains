import { Container, Graphics, Rectangle, Sprite, Text, type Texture } from 'pixi.js';
import { MENU_SCREEN } from '../game/layout';
import { COLOR } from '../game/palette';
import { rankFor, type Stats } from '../state/save';
import { HotZone } from './HotZone';
import { Slider, label } from './widgets';

/**
 * Настройки и личная статистика.
 *
 * Экран — готовая картинка из набора (menu-screen.png): рамка, заголовки,
 * подписи, пояснения и три кнопки нарисованы на ней. Движок кладёт поверх
 * только то, что меняется: громкость числом, ползунок и колонку значений
 * статистики. Запечённые значения при подготовке погашены
 * (tools/prep_screens.py), поэтому под живыми числами ничего не просвечивает.
 *
 * Координаты ниже — в системе самой картинки (1215x1295), а не сцены. Так их
 * можно снять с файла линейкой и не пересчитывать, если панель на сцене
 * поедет или сменит размер: пересчёт делает `at()`.
 */

export interface SettingsState {
  turbo: boolean;
  /** Громкость музыки, 0..1. */
  volume: number;
  stats: Stats;
  balance: number;
}

/** Кнопки, нарисованные на картинке. */
const TURBO_AT = { x: 72, y: 138, w: 319, h: 107 } as const;
const RESET_AT = { x: 72, y: 1121, w: 409, h: 97 } as const;
const CLOSE_AT = { x: 812, y: 1121, w: 321, h: 97 } as const;

/**
 * Ползунок громкости. На картинке нарисована только заполненная часть
 * дорожки — от 77 до 332 при 35%, отсюда полная длина 728.
 */
const SLIDER_AT = { x: 77, y: 360, w: 728 } as const;
const VOLUME_AT = { right: 1130, y: 300 } as const;

/**
 * Колонка значений статистики. Шаг строк 48.15 снят по первой и последней
 * подписи, а не подобран на глаз.
 *
 * Ранг стоит левее прочих: подпись у него короткая, и на картинке значение
 * начиналось сразу за ней.
 */
const STATS_AT = { x: 349, rankX: 259, top: 671, step: 48.15 } as const;

type Box = { x: number; y: number; w: number; h: number };

export class SettingsScreen {
  readonly view = new Container();

  onToggleTurbo: (() => void) | null = null;
  onVolume: ((value: number) => void) | null = null;
  onReset: (() => void) | null = null;

  private readonly panel = new Container();
  private readonly values: Text[] = [];
  private readonly volumeValue: Text;
  private readonly volumeSlider: Slider;
  private readonly turboOff = new Graphics();
  private readonly confirm = new Container();
  private readonly scale: number;
  private resetArmed = false;

  constructor(width: number, height: number, art: Texture) {
    this.view.visible = false;
    this.scale = MENU_SCREEN.w / art.width;

    const shade = new Graphics();
    shade.rect(0, 0, width, height).fill({ color: 0x0a0510, alpha: 0.93 });
    shade.eventMode = 'static';
    shade.hitArea = new Rectangle(0, 0, width, height);
    shade.on('pointertap', () => this.hide());
    this.view.addChild(shade);

    this.panel.position.set(MENU_SCREEN.x, MENU_SCREEN.y);
    this.view.addChild(this.panel);

    const backdrop = new Sprite(art);
    backdrop.width = MENU_SCREEN.w;
    backdrop.height = MENU_SCREEN.h;
    // Панель перехватывает клики: иначе промах мимо кнопки закрывал бы экран.
    backdrop.eventMode = 'static';
    this.panel.addChild(backdrop);

    // Выключенное турбо: на картинке кнопка горит всегда, погасить её можно
    // только сверху. Затемнение, а не своя кнопка поверх: своя была бы
    // копией нарисованной, и хуже неё.
    const [tx, ty, tw, th] = this.local(TURBO_AT);
    this.turboOff.roundRect(tx, ty, tw, th, 10).fill({ color: 0x0a0510, alpha: 0.62 });
    this.panel.addChild(this.turboOff);

    this.panel.addChild(
      new HotZone(this.rect(TURBO_AT), () => this.onToggleTurbo?.()).view,
      new HotZone(this.rect(RESET_AT), () => this.handleReset(), 0xc0553c).view,
      new HotZone(this.rect(CLOSE_AT), () => this.hide(), 0xb96ce0).view,
    );

    this.volumeValue = label('', this.size(34), COLOR.gold);
    this.volumeValue.anchor.set(1, 0.5);
    this.volumeValue.position.set(this.at(VOLUME_AT.right), this.at(VOLUME_AT.y));
    this.panel.addChild(this.volumeValue);

    this.volumeSlider = new Slider({
      width: this.at(SLIDER_AT.w),
      value: 0,
      onChange: (v) => {
        this.volumeValue.text = `${Math.round(v * 100)}%`;
        this.onVolume?.(v);
      },
    });
    this.volumeSlider.view.position.set(this.at(SLIDER_AT.x), this.at(SLIDER_AT.y));
    this.panel.addChild(this.volumeSlider.view);

    for (let i = 0; i < 9; i++) {
      const value = label('', this.size(30), COLOR.paper);
      value.anchor.set(0, 0.5);
      value.position.set(
        this.at(i === 0 ? STATS_AT.rankX : STATS_AT.x),
        this.at(STATS_AT.top + STATS_AT.step * i),
      );
      this.values.push(value);
      this.panel.addChild(value);
    }

    // Подтверждение сброса закрывает собой нарисованную подпись кнопки.
    this.confirm.visible = false;
    const [rx, ry, rw, rh] = this.local(RESET_AT);
    const backing = new Graphics().roundRect(rx, ry, rw, rh, 10).fill({
      color: 0x1a0c10,
      alpha: 0.94,
    });
    const confirmText = label('ТОЧНО? ЖМИ ЕЩЁ РАЗ', this.size(30), 0xe8b6a2);
    confirmText.anchor.set(0.5, 0.5);
    confirmText.position.set(rx + rw / 2, ry + rh / 2);
    this.confirm.addChild(backing, confirmText);
    this.panel.addChild(this.confirm);
  }

  /** Координата картинки → координата внутри панели. */
  private at(value: number): number {
    return value * this.scale;
  }

  /** Кегль, заданный по картинке, → кегль на сцене. */
  private size(value: number): number {
    return Math.round(value * this.scale);
  }

  /** Прямоугольник картинки → прямоугольник внутри панели. */
  private local(box: Box): [number, number, number, number] {
    return [this.at(box.x), this.at(box.y), this.at(box.w), this.at(box.h)];
  }

  /** Прямоугольник картинки → прямоугольник на сцене (зоны живут вне панели). */
  private rect(box: Box): [number, number, number, number] {
    const [x, y, w, h] = this.local(box);
    return [MENU_SCREEN.x + x, MENU_SCREEN.y + y, w, h];
  }

  /** Сброс требует второго нажатия: отменить его потом будет нечем. */
  private handleReset(): void {
    if (!this.resetArmed) {
      this.resetArmed = true;
      this.confirm.visible = true;
      return;
    }
    this.resetArmed = false;
    this.confirm.visible = false;
    this.onReset?.();
    this.hide();
  }

  show(state: SettingsState): void {
    this.resetArmed = false;
    this.confirm.visible = false;
    this.turboOff.visible = !state.turbo;
    this.volumeSlider.setValue(state.volume);
    this.volumeValue.text = `${Math.round(state.volume * 100)}%`;

    const s = state.stats;
    const rank = rankFor(s.wagered);
    const rtp = s.wagered > 0 ? ((s.won / s.wagered) * 100).toFixed(1) + '%' : '—';
    const lines = [
      `${rank.title} — ${rank.ru}`,
      s.rounds.toLocaleString('ru-RU'),
      s.wagered.toLocaleString('ru-RU'),
      s.won.toLocaleString('ru-RU'),
      rtp,
      `×${s.bestWinX.toFixed(2)}`,
      `${s.worstDry} спинов подряд`,
      String(s.freeRounds),
      String(s.topUps ?? 0),
    ];
    for (const [i, text] of lines.entries()) this.values[i].text = text;

    this.view.visible = true;
  }

  hide(): void {
    this.view.visible = false;
  }

  get isOpen(): boolean {
    return this.view.visible;
  }
}
