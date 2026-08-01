import gsap from 'gsap';
import { Container, Graphics, Rectangle } from 'pixi.js';
import { COLOR } from '../game/palette';
import { dur } from '../game/timing';
import type { Rect } from '../game/layout';

/**
 * Кликабельная зона поверх кнопки, нарисованной на фоне.
 *
 * Сама кнопка уже есть на макете — рисовать её заново означало бы положить
 * поверх худшую копию. Зона добавляет только то, чего у картинки быть не может:
 * реакцию на курсор, вспышку при нажатии и свечение включённого режима.
 *
 * Прямоугольник зоны обязан совпадать с нарисованной кнопкой пиксель в пиксель:
 * по его границе идёт подсветка, и зона, сидящая внутри кнопки с запасом,
 * прочерчивает рамку поперёк неё. Все числа в BUTTONS обмерены по рамкам
 * кнопок на фоне, а не прикинуты на глаз.
 */
export class HotZone {
  readonly view = new Container();

  private readonly glow = new Graphics();
  private enabled = true;
  private active = false;
  private hovered = false;

  constructor(rect: Rect, onTap: () => void, accent: number = COLOR.gold) {
    const [x, y, w, h] = rect;
    // Центр как точка отсчёта — чтобы утопление при нажатии шло от середины,
    // а не тянуло кнопку вправо вниз.
    this.view.pivot.set(w / 2, h / 2);
    this.view.position.set(x + w / 2, y + h / 2);

    // Свечение обводит кнопку по всему контуру и гаснет наружу — как на
    // образцах подсветки в наборе ассетов.
    //
    // Прежний вариант светил только двумя полосами по бокам: сверху и снизу
    // кнопка оставалась тёмной, и подсветка читалась как две отдельные
    // засветки рядом, а не как загоревшаяся кнопка. Ещё раньше заливалась вся
    // площадь — тогда это было похоже на выделение мышью, как строки текста.
    //
    // Градиент набирается вложенными контурами с падающей прозрачностью:
    // дешевле фильтра размытия, который на слабой машине проседает по кадрам.
    const bands = 8;
    const reach = 11;
    for (let i = bands; i >= 1; i--) {
      const t = i / bands;
      const spread = reach * t;
      this.glow.roundRect(-spread, -spread, w + spread * 2, h + spread * 2, 8 + spread).stroke({
        color: accent,
        width: 3,
        alpha: 0.26 * (1 - t) ** 1.3,
      });
    }
    // Яркая кромка по самому краю кнопки: на образцах горит именно она,
    // а внешнее свечение только расходится от неё.
    this.glow.roundRect(1, 1, w - 2, h - 2, 8).stroke({ color: accent, width: 3, alpha: 0.95 });
    this.glow.alpha = 0;
    this.view.addChild(this.glow);

    this.view.eventMode = 'static';
    this.view.cursor = 'pointer';
    this.view.hitArea = new Rectangle(0, 0, w, h);
    this.view.on('pointerover', () => {
      this.hovered = true;
      this.refresh();
    });
    this.view.on('pointerout', () => {
      this.hovered = false;
      this.refresh();
    });
    this.view.on('pointerdown', () => {
      if (this.enabled) this.press();
    });
    this.view.on('pointertap', () => {
      if (this.enabled) onTap();
    });
  }

  /**
   * Отклик на нажатие: кнопка утопляется и вспыхивает контуром.
   *
   * Вспышка гасится не в ноль, а в состояние, положенное кнопке сейчас
   * (включённый режим, курсор над ней) — иначе после нажатия «турбо» его
   * постоянная подсветка гасла бы вместе со вспышкой.
   */
  private press(): void {
    gsap.killTweensOf(this.view.scale);
    this.view.scale.set(0.96);
    gsap.to(this.view.scale, { x: 1, y: 1, duration: dur(0.16), ease: 'back.out(3)' });

    gsap.killTweensOf(this.glow);
    this.glow.alpha = 1;
    gsap.to(this.glow, {
      alpha: this.restAlpha(),
      duration: dur(0.34),
      ease: 'sine.out',
    });
  }

  private restAlpha(): number {
    if (!this.enabled) return 0;
    if (this.active) return 1;
    return this.hovered ? 0.6 : 0;
  }

  private refresh(): void {
    const target = this.restAlpha();
    gsap.killTweensOf(this.glow);
    // Разгорается медленнее, чем гаснет: так наведение читается как отклик,
    // а не как мигание при каждом проносе курсора над панелью.
    gsap.to(this.glow, {
      alpha: target,
      duration: dur(target > this.glow.alpha ? 0.28 : 0.16),
      ease: 'sine.out',
    });
  }

  /**
   * Недоступность показывается только курсором и погашенной подсветкой.
   *
   * Тёмную плёнку поверх кнопки убрали: её прямоугольник со скруглением
   * не совпадал с формой нарисованной кнопки — у SPIN плита с цепями
   * по краям, и плёнка ложилась поперёк них косым пятном. Кнопка и без
   * неё не нажимается, а нажатие всё равно отзывается утоплением.
   */
  setEnabled(on: boolean): void {
    this.enabled = on;
    this.view.cursor = on ? 'pointer' : 'default';
    this.refresh();
  }

  /** Режим включён — зона светится постоянно. */
  setActive(on: boolean): void {
    this.active = on;
    this.refresh();
  }

  /** Медленная пульсация: так подсвечивается SPIN, когда игра ждёт хода. */
  pulse(on: boolean): void {
    gsap.killTweensOf(this.glow);
    if (!on) {
      this.refresh();
      return;
    }
    this.glow.alpha = 0.2;
    gsap.to(this.glow, {
      alpha: 0.62,
      duration: dur(1.1),
      ease: 'sine.inOut',
      yoyo: true,
      repeat: -1,
    });
  }
}
