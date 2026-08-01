import gsap from 'gsap';
import { Container, Sprite, type Texture } from 'pixi.js';
import { dur } from './timing';

/**
 * Живой VAN поверх фона.
 *
 * Спрайт — вырезанная по контуру фигура на прозрачном фоне, уже сохранённая
 * в экранном размере (tools/prep_new_assets_1.py). Поэтому масштаб здесь
 * выходит равным единице, и текстура рисуется пиксель в пиксель — увеличение
 * больше чем вдвое сделано заранее хорошим фильтром, а не видеокартой в кадре.
 *
 * Прежнего маскота, нарисованного прямо на макете, спрайт не прячет, а просто
 * не встречает: с фона он снят совсем. Прятать пробовали, и это не работает —
 * вырез не сплошной прямоугольник, и в просветах вокруг фигуры вылезал
 * предшественник.
 *
 * Масштаб считается по осям раздельно: box может слегка не совпасть
 * с пропорцией текстуры, и тогда фигура всё равно займёт отведённое место
 * целиком. Единый множитель («cover») для этого не годится — при заметной
 * разнице пропорций он выносит фигуру далеко за верхнюю границу box.
 *
 * Система координат: контейнер `view` стоит в НИЖНЕЙ ТОЧКЕ ПО ЦЕНТРУ box —
 * там, где у фигуры пол (или сиденье трона в бонусной комнате). Спрайт внутри
 * контейнера всегда в точке (0,0) с якорем (0.5,1), поэтому дышит и напрягается
 * он верхней половиной, а нижняя точка не сдвигается ни на пиксель. Ноги при
 * этом могут уходить ниже экрана: низ макета Game рисует поверх маскота.
 */

export interface MascotBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Mood = 'idle' | 'watch' | 'nod' | 'flex' | 'shake';

const BREATH_SCALE = 1.014;

export class Mascot {
  readonly view = new Container();

  private readonly sprite: Sprite;
  private scaleX = 1;
  private scaleY = 1;
  private breath: gsap.core.Tween | null = null;
  private mood: Mood = 'idle';

  constructor(texture: Texture, box: MascotBox) {
    this.sprite = new Sprite(texture);
    this.sprite.anchor.set(0.5, 1);
    this.sprite.position.set(0, 0);
    // width/height — раздельные множители по осям, поэтому запоминаем их
    // отдельно и не пользуемся общим this.sprite.scale.set(k) для «дыхания»:
    // дышать он должен обеими осями от СВОИХ базовых множителей, не от одного.
    this.scaleX = box.w / texture.width;
    this.scaleY = box.h / texture.height;
    this.sprite.scale.set(this.scaleX, this.scaleY);

    this.view.position.set(box.x + box.w / 2, box.y + box.h);
    this.view.addChild(this.sprite);

    this.startBreathing();
  }

  private startBreathing(): void {
    this.breath?.kill();
    this.sprite.scale.set(this.scaleX, this.scaleY);
    this.breath = gsap.to(this.sprite.scale, {
      x: this.scaleX * BREATH_SCALE,
      y: this.scaleY * BREATH_SCALE,
      duration: dur(2.6),
      ease: 'sine.inOut',
      yoyo: true,
      repeat: -1,
    });
  }

  /** Реакция на то, чем кончился спин. */
  setMood(mood: Mood): void {
    if (mood === this.mood && mood === 'idle') return;
    this.mood = mood;

    switch (mood) {
      case 'watch':
        // Пока крутится — дышит чаще, как перед подходом.
        this.breath?.timeScale(2.1);
        break;

      case 'nod': {
        this.breath?.timeScale(1);
        gsap.killTweensOf(this.sprite);
        gsap.fromTo(
          this.sprite,
          { y: 0 },
          { y: 7, duration: dur(0.12), yoyo: true, repeat: 1, ease: 'sine.inOut' },
        );
        break;
      }

      case 'flex': {
        this.breath?.timeScale(1);
        gsap.killTweensOf(this.sprite.scale);
        gsap.fromTo(
          this.sprite.scale,
          { x: this.scaleX, y: this.scaleY },
          {
            x: this.scaleX * 1.055,
            y: this.scaleY * 1.055,
            duration: dur(0.22),
            ease: 'back.out(3)',
            yoyo: true,
            repeat: 1,
            onComplete: () => this.startBreathing(),
          },
        );
        break;
      }

      case 'shake': {
        this.breath?.timeScale(0.7);
        gsap.killTweensOf(this.sprite);
        gsap.fromTo(
          this.sprite,
          { angle: 0 },
          {
            angle: -1.1,
            duration: dur(0.5),
            ease: 'sine.inOut',
            yoyo: true,
            repeat: 1,
            onComplete: () => {
              this.sprite.angle = 0;
            },
          },
        );
        break;
      }

      case 'idle':
        this.breath?.timeScale(1);
        break;
    }
  }
}
