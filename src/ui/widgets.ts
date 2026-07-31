import { Container, Graphics, Rectangle, Text, type TextStyleOptions } from 'pixi.js';
import { COLOR } from '../game/palette';

/** Общие мелочи интерфейса, чтобы шрифт и повадки кнопок не расползались по файлам. */

export const FONT = 'Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif';

export function label(
  content: string,
  size: number,
  color: number,
  extra: Partial<TextStyleOptions> = {},
): Text {
  return new Text({
    text: content,
    style: { fontFamily: FONT, fontSize: size, fill: color, letterSpacing: 1, ...extra },
  });
}

export interface ButtonOptions {
  text: string;
  width: number;
  height: number;
  fontSize?: number;
  /** Цвет заливки во включённом состоянии. */
  color?: number;
  textColor?: number;
  onTap: () => void;
}

/**
 * Кнопка с тремя состояниями: обычная, выключенная и «горит».
 * Горящее состояние нужно переключателям — турбо и автоспину: игрок должен
 * видеть, что режим включён, не вчитываясь в подпись.
 */
export class Button {
  readonly view = new Container();

  private readonly fill = new Graphics();
  private readonly caption: Text;
  private readonly opts: Required<Omit<ButtonOptions, 'onTap'>>;
  private enabled = true;
  private active = false;

  constructor(o: ButtonOptions) {
    this.opts = {
      text: o.text,
      width: o.width,
      height: o.height,
      fontSize: o.fontSize ?? 20,
      color: o.color ?? COLOR.brick,
      textColor: o.textColor ?? COLOR.paper,
    };

    this.view.addChild(this.fill);

    this.caption = label(o.text, this.opts.fontSize, this.opts.textColor);
    this.caption.anchor.set(0.5);
    this.caption.position.set(this.opts.width / 2, this.opts.height / 2);
    this.view.addChild(this.caption);

    this.view.eventMode = 'static';
    // Явный прямоугольник вместо hit-теста по геометрии: иначе клик по надписи
    // или по скруглённому углу может не засчитаться.
    this.view.hitArea = new Rectangle(0, 0, this.opts.width, this.opts.height);
    this.view.cursor = 'pointer';
    this.view.on('pointertap', () => {
      if (this.enabled) o.onTap();
    });

    this.redraw();
  }

  private redraw(): void {
    const { width, height, color } = this.opts;
    const base = this.active ? COLOR.gold : color;
    const g = this.fill;
    g.clear();
    g.roundRect(0, 0, width, height, 10).fill(this.enabled ? base : 0x2b2233);
    g.roundRect(0, 0, width, height, 10).stroke({
      color: this.active ? COLOR.paper : COLOR.ink,
      width: 3,
    });
    this.caption.style.fill = this.active ? COLOR.ink : this.opts.textColor;
    this.caption.alpha = this.enabled ? 1 : 0.4;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    this.view.cursor = on ? 'pointer' : 'default';
    this.redraw();
  }

  setActive(on: boolean): void {
    this.active = on;
    this.redraw();
  }

  setText(text: string): void {
    this.caption.text = text;
  }
}
