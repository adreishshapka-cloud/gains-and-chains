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

export interface SliderOptions {
  width: number;
  /** Стартовое значение, 0..1. */
  value: number;
  onChange: (value: number) => void;
}

/**
 * Ползунок 0..1 — пока один, для громкости музыки.
 *
 * Значение отдаётся наружу на каждое движение, а не по отпусканию: громкость
 * должна меняться прямо под пальцем, иначе выставить её на слух невозможно —
 * пришлось бы возить ползунок, отпускать, слушать и начинать заново.
 *
 * Тянется он за `globalpointermove`, а не за обычный `pointermove` на дорожке.
 * Обычный приходит только пока курсор над самой дорожкой, и стоит увести его
 * чуть выше или ниже — ползунок замирает на месте, хотя кнопку мыши не отпускали.
 */
export class Slider {
  readonly view = new Container();

  private readonly track = new Graphics();
  private readonly knob = new Graphics();
  private readonly width: number;
  private readonly onChange: (value: number) => void;
  private value: number;
  private dragging = false;

  constructor(o: SliderOptions) {
    this.width = o.width;
    this.value = Math.min(1, Math.max(0, o.value));
    this.onChange = o.onChange;

    this.view.addChild(this.track);
    this.view.addChild(this.knob);

    // Полоса ловит нажатие по всей высоте кнопки, а не по своей толщине:
    // в 8 пикселей попасть мышью тяжело.
    this.view.eventMode = 'static';
    this.view.cursor = 'pointer';
    this.view.hitArea = new Rectangle(-KNOB_R, -HIT_H / 2, o.width + KNOB_R * 2, HIT_H);

    this.view.on('pointerdown', (e) => {
      this.dragging = true;
      this.moveTo(e.global.x);
    });
    this.view.on('globalpointermove', (e) => {
      if (this.dragging) this.moveTo(e.global.x);
    });
    const stop = () => {
      this.dragging = false;
    };
    this.view.on('pointerup', stop);
    this.view.on('pointerupoutside', stop);

    this.redraw();
  }

  private moveTo(globalX: number): void {
    const local = this.view.toLocal({ x: globalX, y: 0 });
    const next = Math.min(1, Math.max(0, local.x / this.width));
    if (Math.abs(next - this.value) < 0.001) return;
    this.value = next;
    this.redraw();
    this.onChange(next);
  }

  setValue(value: number): void {
    this.value = Math.min(1, Math.max(0, value));
    this.redraw();
  }

  private redraw(): void {
    const filled = this.width * this.value;
    this.track
      .clear()
      .roundRect(0, -4, this.width, 8, 4)
      .fill(0x2a1a38)
      .roundRect(0, -4, filled, 8, 4)
      .fill(COLOR.gold);
    this.knob.clear().circle(filled, 0, KNOB_R).fill(COLOR.paper).stroke({
      color: COLOR.brick,
      width: 3,
    });
  }
}

/** Радиус головки и высота зоны захвата ползунка. */
const KNOB_R = 11;
const HIT_H = 44;
