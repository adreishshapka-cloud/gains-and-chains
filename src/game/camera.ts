import gsap from 'gsap';
import type { Container } from 'pixi.js';
import { STAGE_H, STAGE_W } from './layout';
import { dur } from './timing';

/**
 * Тряска экрана на ударных моментах: сбор цепей кулаком, крупный выигрыш,
 * развязка бонуса.
 *
 * Трясётся вся сцена целиком, а не отдельный слой. Иначе интерфейс остался бы
 * стоять на месте, пока барабаны дёргаются, — и удар читался бы как рассинхрон
 * картинки, а не как удар.
 *
 * Главная тонкость — края. Сдвиг сцены на десяток пикселей открывает под ней
 * пустой фон канваса: макет нарисован ровно в размер экрана, запаса по краям
 * у него нет. Поэтому на время тряски сцена подмасштабируется ровно настолько,
 * чтобы сдвиг любой силы остался внутри картинки. Наезд заодно работает на
 * ощущение удара, так что это не только заплатка на швы.
 *
 * Тряска не спрашивает про турбо отдельно: длительность идёт через `dur()`,
 * как все прочие анимации.
 */
export class Camera {
  private tween: gsap.core.Tween | null = null;

  constructor(private readonly stage: Container) {}

  /**
   * Толчок силой `power` пикселей длиной `seconds` секунд.
   *
   * Повторный вызов поверх идущей тряски перебивает её, а не складывается
   * с ней: два наложенных сдвига дают дребезг вдвое сильнее задуманного,
   * а моменты в игре идут подряд (кулак — счётчик — баннер).
   */
  shake(power: number, seconds = 0.45): void {
    this.tween?.kill();

    const cx = STAGE_W / 2;
    const cy = STAGE_H / 2;
    // Запас по вертикали (сторона короче) с гарантией покрывает и горизонталь,
    // а масштаб остаётся равномерным — иначе картинку растянуло бы.
    const zoom = 1 + (2 * power) / STAGE_H;

    this.stage.pivot.set(cx, cy);
    this.stage.scale.set(zoom);

    const box = { t: 0 };
    this.tween = gsap.to(box, {
      t: 1,
      duration: dur(seconds),
      ease: 'none',
      onUpdate: () => {
        // Затухание квадратом: удар весь в первых кадрах, дальше — отзвук.
        const amp = power * (1 - box.t) ** 2;
        this.stage.position.set(
          cx + (Math.random() * 2 - 1) * amp,
          cy + (Math.random() * 2 - 1) * amp,
        );
      },
      onComplete: () => this.reset(),
    });
  }

  /** Возвращает сцену в исходное положение. */
  private reset(): void {
    this.tween = null;
    this.stage.pivot.set(0, 0);
    this.stage.position.set(0, 0);
    this.stage.scale.set(1);
  }
}
