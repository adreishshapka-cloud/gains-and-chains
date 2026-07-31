import gsap from 'gsap';
import { Container, Sprite, type Texture } from 'pixi.js';
import { DUKE_AT } from './layout';
import { dur } from './timing';

/**
 * Живой DUKE поверх фона.
 *
 * Спрайт — прямоугольный кусок стены вместе с фигурой, с растушёванными краями
 * (см. tools/prep_background.py). Из этого следует железное правило: масштаб
 * никогда не опускается ниже единицы. Спрайт обязан перекрывать нарисованный
 * на фоне оригинал целиком, иначе из-под него полезет второй DUKE.
 *
 * Точка отсчёта — низ фигуры: дышит и напрягается он верхней половиной,
 * ноги при этом стоят на полу.
 */

export type Mood = 'idle' | 'watch' | 'nod' | 'flex' | 'shake';

const BREATH_SCALE = 1.014;

export class Mascot {
  readonly view = new Container();

  private readonly sprite: Sprite;
  private breath: gsap.core.Tween | null = null;
  private mood: Mood = 'idle';

  constructor(texture: Texture) {
    this.sprite = new Sprite(texture);
    this.sprite.width = DUKE_AT.w;
    this.sprite.height = DUKE_AT.h;
    // Якорь по низу-центру: увеличение поднимает грудь и плечи, а не отрывает
    // фигуру от пола.
    this.sprite.anchor.set(0.5, 1);
    this.sprite.position.set(DUKE_AT.w / 2, DUKE_AT.h);
    this.view.position.set(DUKE_AT.x, DUKE_AT.y);
    this.view.addChild(this.sprite);

    this.startBreathing();
  }

  private startBreathing(): void {
    this.breath?.kill();
    this.sprite.scale.set(1);
    this.breath = gsap.to(this.sprite.scale, {
      x: BREATH_SCALE,
      y: BREATH_SCALE,
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
          { y: DUKE_AT.h },
          { y: DUKE_AT.h + 7, duration: dur(0.12), yoyo: true, repeat: 1, ease: 'sine.inOut' },
        );
        break;
      }

      case 'flex': {
        this.breath?.timeScale(1);
        gsap.killTweensOf(this.sprite.scale);
        gsap.fromTo(
          this.sprite.scale,
          { x: 1, y: 1 },
          {
            x: 1.055,
            y: 1.055,
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
