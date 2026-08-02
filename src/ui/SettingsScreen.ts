import { Container, Graphics, Rectangle, Text } from 'pixi.js';
import { AUTO_ROUNDS } from '../game/rules';
import { COLOR } from '../game/palette';
import { rankFor, type Stats } from '../state/save';
import { Button, Slider, label } from './widgets';

/**
 * Настройки и личная статистика.
 *
 * Раньше шестерёнка открывала правила — то есть делала ровно то же, что «?»
 * рядом с ней. Кнопке нужно своё содержание: переключатели, статистика
 * и единственное необратимое действие в игре — сброс прогресса.
 */

export interface SettingsState {
  turbo: boolean;
  /** Громкость музыки, 0..1. */
  volume: number;
  stats: Stats;
  balance: number;
}

export class SettingsScreen {
  readonly view = new Container();

  onToggleTurbo: (() => void) | null = null;
  onVolume: ((value: number) => void) | null = null;
  onReset: (() => void) | null = null;

  private readonly statsText: Text;
  private readonly turboButton: Button;
  private readonly volumeSlider: Slider;
  private readonly volumeValue: Text;
  private readonly resetButton: Button;
  private resetArmed = false;

  constructor(width: number, height: number) {
    this.view.visible = false;

    const shade = new Graphics();
    shade.rect(0, 0, width, height).fill({ color: 0x0a0510, alpha: 0.93 });
    shade.eventMode = 'static';
    shade.hitArea = new Rectangle(0, 0, width, height);
    shade.on('pointertap', () => this.hide());
    this.view.addChild(shade);

    const panelW = 760;
    // Высота считается от содержимого: три раздела с пояснениями, девять строк
    // статистики и ряд кнопок. При 560 последняя строка уезжала под кнопку
    // сброса, при 726 — не влезал добавленный ползунок громкости.
    const panelH = 820;
    const panel = new Container();
    panel.position.set((width - panelW) / 2, (height - panelH) / 2);
    panel.eventMode = 'static';
    panel.hitArea = new Rectangle(0, 0, panelW, panelH);
    this.view.addChild(panel);

    const bg = new Graphics();
    bg.roundRect(0, 0, panelW, panelH, 18).fill(COLOR.dim);
    bg.roundRect(0, 0, panelW, panelH, 18).stroke({ color: COLOR.brick, width: 5 });
    panel.addChild(bg);

    const title = label('НАСТРОЙКИ', 38, COLOR.gold);
    title.position.set(36, 28);
    panel.addChild(title);

    this.turboButton = new Button({
      text: 'ТУРБО',
      width: 190,
      height: 56,
      fontSize: 22,
      onTap: () => this.onToggleTurbo?.(),
    });
    this.turboButton.view.position.set(36, 92);
    panel.addChild(this.turboButton.view);

    const turboNote = label('Ускоряет барабаны и показ выигрыша.', 17, 0x9a8aaa);
    turboNote.position.set(246, 110);
    panel.addChild(turboNote);

    // Громкость музыки. Кнопка «нота» в нижнем ряду только включает и выключает
    // её целиком; тише или громче сделать было нечем, а музыка играет постоянно.
    const volumeTitle = label('ГРОМКОСТЬ МУЗЫКИ', 22, COLOR.gold);
    volumeTitle.position.set(36, 172);
    panel.addChild(volumeTitle);

    this.volumeValue = label('', 20, COLOR.paper);
    this.volumeValue.anchor.set(1, 0.5);
    this.volumeValue.position.set(panelW - 36, 183);
    panel.addChild(this.volumeValue);

    this.volumeSlider = new Slider({
      width: 420,
      value: 0,
      onChange: (v) => {
        this.volumeValue.text = `${Math.round(v * 100)}%`;
        this.onVolume?.(v);
      },
    });
    this.volumeSlider.view.position.set(36, 224);
    panel.addChild(this.volumeSlider.view);

    // Про автоспин игрок иначе не узнает: кнопка «АВТО» не объясняет,
    // сколько раундов она запускает и как её остановить.
    const autoTitle = label('АВТО', 22, COLOR.gold);
    autoTitle.position.set(36, 262);
    panel.addChild(autoTitle);

    const autoNote = label(
      `Крутит ${AUTO_ROUNDS} раундов подряд. Повторное нажатие останавливает\n` +
        'после текущего раунда. Автоспин сам встанет, если кончатся монеты.',
      17,
      0x9a8aaa,
      { lineHeight: 24 },
    );
    autoNote.position.set(36, 292);
    panel.addChild(autoNote);

    const statsTitle = label('ТВОЯ СТАТИСТИКА', 22, COLOR.cyan);
    statsTitle.position.set(36, 356);
    panel.addChild(statsTitle);

    this.statsText = label('', 19, COLOR.paper, { lineHeight: 30 });
    this.statsText.position.set(36, 396);
    panel.addChild(this.statsText);

    this.resetButton = new Button({
      text: 'НАЧАТЬ ЗАНОВО',
      width: 260,
      height: 56,
      fontSize: 20,
      color: 0x7a2a2a,
      onTap: () => this.handleReset(),
    });
    this.resetButton.view.position.set(36, panelH - 88);
    panel.addChild(this.resetButton.view);

    const close = new Button({
      text: 'ЗАКРЫТЬ',
      width: 180,
      height: 56,
      fontSize: 22,
      color: COLOR.neon,
      onTap: () => this.hide(),
    });
    close.view.position.set(panelW - 216, panelH - 88);
    panel.addChild(close.view);
  }

  /** Сброс требует второго нажатия: отменить его потом будет нечем. */
  private handleReset(): void {
    if (!this.resetArmed) {
      this.resetArmed = true;
      this.resetButton.setText('ТОЧНО? ЖМИ ЕЩЁ РАЗ');
      return;
    }
    this.resetArmed = false;
    this.resetButton.setText('НАЧАТЬ ЗАНОВО');
    this.onReset?.();
    this.hide();
  }

  show(state: SettingsState): void {
    this.resetArmed = false;
    this.resetButton.setText('НАЧАТЬ ЗАНОВО');
    this.turboButton.setActive(state.turbo);
    this.volumeSlider.setValue(state.volume);
    this.volumeValue.text = `${Math.round(state.volume * 100)}%`;

    const s = state.stats;
    const rtp = s.wagered > 0 ? ((s.won / s.wagered) * 100).toFixed(1) + '%' : '—';
    this.statsText.text = [
      `Ранг:              ${rankFor(s.wagered).title} — ${rankFor(s.wagered).ru}`,
      `Раундов сыграно:   ${s.rounds.toLocaleString('ru-RU')}`,
      `Поставлено:        ${s.wagered.toLocaleString('ru-RU')}`,
      `Выиграно:          ${s.won.toLocaleString('ru-RU')}`,
      `Твой возврат:      ${rtp}`,
      `Лучший занос:      ×${s.bestWinX.toFixed(2)}`,
      `Худшая сушь:       ${s.worstDry} спинов подряд`,
      `Заходов в бонус:   ${s.freeRounds}`,
      `Доливов монет:     ${s.topUps ?? 0}`,
    ].join('\n');

    this.view.visible = true;
  }

  hide(): void {
    this.view.visible = false;
  }

  get isOpen(): boolean {
    return this.view.visible;
  }
}
