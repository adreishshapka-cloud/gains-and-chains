import { Container, Graphics, Text } from 'pixi.js';
import { COLOR } from '../game/palette';
import { Button, label } from './widgets';

/** Панель управления: деньги слева, режимы и кнопки справа. */

const BAR_H = 112;

export class ControlBar {
  readonly view = new Container();

  onSpin: (() => void) | null = null;
  onAuto: (() => void) | null = null;
  onTurbo: (() => void) | null = null;
  onRules: (() => void) | null = null;
  onBuy: (() => void) | null = null;
  onBetStep: ((delta: number) => void) | null = null;

  private readonly balanceText: Text;
  private readonly betText: Text;
  private readonly winText: Text;
  private readonly statusText: Text;

  private readonly spinButton: Button;
  private readonly autoButton: Button;
  private readonly turboButton: Button;
  private readonly buyButton: Button;
  private readonly betDown: Button;
  private readonly betUp: Button;

  constructor(width: number) {
    const bg = new Graphics();
    bg.roundRect(0, 0, width, BAR_H, 12).fill(COLOR.dim);
    bg.roundRect(0, 0, width, BAR_H, 12).stroke({ color: COLOR.brick, width: 4 });
    this.view.addChild(bg);

    const caption = (t: string, x: number) => {
      const c = label(t, 14, 0x8a7a9a);
      c.position.set(x, 16);
      this.view.addChild(c);
    };

    caption('БАЛАНС', 24);
    this.balanceText = label('0', 30, COLOR.gold);
    this.balanceText.position.set(24, 36);
    this.view.addChild(this.balanceText);

    caption('СТАВКА', 210);
    this.betText = label('20', 30, COLOR.paper);
    this.betText.position.set(210, 36);
    this.view.addChild(this.betText);

    this.betDown = new Button({
      text: '−',
      width: 30,
      height: 30,
      fontSize: 24,
      onTap: () => this.onBetStep?.(-1),
    });
    this.betDown.view.position.set(310, 36);
    this.view.addChild(this.betDown.view);

    this.betUp = new Button({
      text: '+',
      width: 30,
      height: 30,
      fontSize: 24,
      onTap: () => this.onBetStep?.(1),
    });
    this.betUp.view.position.set(346, 36);
    this.view.addChild(this.betUp.view);

    caption('ВЫИГРЫШ', 400);
    this.winText = label('—', 30, COLOR.cyan);
    this.winText.position.set(400, 36);
    this.view.addChild(this.winText);

    this.statusText = label('Крути.', 16, 0xb9a8c9);
    this.statusText.position.set(24, 82);
    this.view.addChild(this.statusText);

    // ── Кнопки ───────────────────────────────────────────────
    const y = 24;

    this.buyButton = new Button({
      text: 'SKIP LEG DAY',
      width: 150,
      height: 64,
      fontSize: 17,
      color: COLOR.neon,
      onTap: () => this.onBuy?.(),
    });
    this.buyButton.view.position.set(width - 640, y);
    this.view.addChild(this.buyButton.view);

    const rules = new Button({
      text: 'ПРАВИЛА',
      width: 110,
      height: 64,
      fontSize: 18,
      onTap: () => this.onRules?.(),
    });
    rules.view.position.set(width - 474, y);
    this.view.addChild(rules.view);

    this.turboButton = new Button({
      text: 'ТУРБО',
      width: 100,
      height: 64,
      fontSize: 18,
      onTap: () => this.onTurbo?.(),
    });
    this.turboButton.view.position.set(width - 350, y);
    this.view.addChild(this.turboButton.view);

    this.autoButton = new Button({
      text: 'АВТО',
      width: 100,
      height: 64,
      fontSize: 18,
      onTap: () => this.onAuto?.(),
    });
    this.autoButton.view.position.set(width - 236, y);
    this.view.addChild(this.autoButton.view);

    this.spinButton = new Button({
      text: 'SPIN',
      width: 110,
      height: 64,
      fontSize: 32,
      color: COLOR.gold,
      textColor: COLOR.ink,
      onTap: () => this.onSpin?.(),
    });
    this.spinButton.view.position.set(width - 122, y);
    this.view.addChild(this.spinButton.view);
  }

  /** Блокировка на время раунда. Автоспин и правила остаются доступны. */
  setEnabled(on: boolean): void {
    this.spinButton.setEnabled(on);
    this.buyButton.setEnabled(on);
    this.betDown.setEnabled(on);
    this.betUp.setEnabled(on);
  }

  setBalance(coins: number): void {
    this.balanceText.text = coins.toLocaleString('ru-RU');
  }

  setBet(coins: number): void {
    this.betText.text = coins.toLocaleString('ru-RU');
  }

  setWin(coins: number | null): void {
    this.winText.text = coins === null ? '—' : coins.toLocaleString('ru-RU');
  }

  setStatus(text: string): void {
    this.statusText.text = text;
  }

  /** Автоспин: подпись показывает остаток, чтобы не заводить отдельный счётчик. */
  setAuto(active: boolean, left: number): void {
    this.autoButton.setActive(active);
    this.autoButton.setText(active ? `СТОП ${left}` : 'АВТО');
  }

  setTurbo(active: boolean): void {
    this.turboButton.setActive(active);
  }

  setBuyLabel(cost: number): void {
    this.buyButton.setText(`SKIP LEG DAY\n${cost.toLocaleString('ru-RU')}`);
  }
}
