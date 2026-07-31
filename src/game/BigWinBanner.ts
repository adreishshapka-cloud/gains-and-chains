import gsap from 'gsap';
import { Container, Graphics } from 'pixi.js';
import { label } from '../ui/widgets';
import { STAGE_H, STAGE_W } from './layout';
import { COLOR } from './palette';
import { dur, pause } from './timing';

/**
 * Полноэкранное объявление крупного выигрыша.
 *
 * Обычный показ (WinPresenter) держится в границах барабанов — так и должно
 * быть для рядового выигрыша. Но для действительно крупного занизывать эффект
 * до размера окна барабанов неправильно: он должен закрыть собой весь стол,
 * как и в конце пройденного подземелья. Это не замена WinPresenter, а надстройка
 * поверх него — обычный показ уже отыграл своё к моменту, когда включается этот.
 */
export class BigWinBanner {
  readonly view = new Container();

  private readonly shade = new Graphics();
  private readonly burst = new Graphics();
  private readonly title = label('', 56, COLOR.gold, {
    stroke: { color: COLOR.ink, width: 9 },
    letterSpacing: 4,
  });
  private readonly amount = label('', 132, COLOR.gold, {
    stroke: { color: COLOR.ink, width: 15 },
  });
  private pulse: gsap.core.Tween | null = null;

  constructor() {
    this.view.visible = false;
    // Клики должны проходить сквозь баннер к тому, что под ним — это чистое
    // объявление, не модальный экран, ждать реакции игрока не нужно.
    this.view.eventMode = 'none';

    this.shade.rect(0, 0, STAGE_W, STAGE_H).fill({ color: 0x000000, alpha: 0.6 });
    this.view.addChild(this.shade);
    this.view.addChild(this.burst);

    this.title.anchor.set(0.5);
    this.title.position.set(STAGE_W / 2, STAGE_H / 2 - 96);
    this.view.addChild(this.title);

    this.amount.anchor.set(0.5);
    this.amount.position.set(STAGE_W / 2, STAGE_H / 2 + 34);
    this.view.addChild(this.amount);
  }

  private drawBurst(color: number): void {
    const cx = STAGE_W / 2;
    const cy = STAGE_H / 2 - 30;
    const rays = 14;

    this.burst.clear();
    for (let i = 0; i < rays; i++) {
      const a = (i / rays) * Math.PI * 2;
      const x1 = cx + Math.cos(a) * 50;
      const y1 = cy + Math.sin(a) * 50;
      const x2 = cx + Math.cos(a) * 560;
      const y2 = cy + Math.sin(a) * 560;
      this.burst.moveTo(x1, y1).lineTo(x2, y2).stroke({ color, width: 40, alpha: 0.08 });
    }
    this.burst.pivot.set(cx, cy);
    this.burst.position.set(cx, cy);
  }

  /** Показывает баннер и держит его `ms` миллисекунд, затем гасит. */
  async show(title: string, amountCoins: number, color: number, ms: number): Promise<void> {
    this.title.text = title;
    this.title.style.fill = color;
    this.amount.text = amountCoins.toLocaleString('ru-RU');
    this.drawBurst(color);

    gsap.killTweensOf(this.view);
    gsap.killTweensOf(this.title.scale);
    gsap.killTweensOf(this.amount.scale);
    gsap.killTweensOf(this.burst);
    this.pulse?.kill();

    this.view.visible = true;
    this.view.alpha = 0;
    this.title.scale.set(0.5);
    this.amount.scale.set(0.4);
    this.burst.rotation = 0;

    gsap.to(this.view, { alpha: 1, duration: dur(0.16) });
    gsap.to(this.title.scale, { x: 1, y: 1, duration: dur(0.3), ease: 'back.out(2.6)' });
    gsap.to(this.amount.scale, {
      x: 1,
      y: 1,
      duration: dur(0.36),
      delay: dur(0.06),
      ease: 'back.out(3)',
    });
    gsap.to(this.burst, { rotation: 0.5, duration: dur(ms / 1000 + 0.3), ease: 'sine.out' });

    // Лёгкий пульс, пока сумма держится на экране — иначе застывшая цифра
    // на весь экран выглядит как зависшая заставка, а не как живой момент.
    this.pulse = gsap.to(this.amount.scale, {
      x: 1.06,
      y: 1.06,
      duration: dur(0.5),
      delay: dur(0.4),
      yoyo: true,
      repeat: -1,
      ease: 'sine.inOut',
    });

    await pause(ms);

    this.pulse?.kill();
    this.pulse = null;
    await new Promise<void>((resolve) => {
      gsap.to(this.view, {
        alpha: 0,
        duration: dur(0.24),
        onComplete: () => {
          this.view.visible = false;
          resolve();
        },
      });
    });
  }
}
