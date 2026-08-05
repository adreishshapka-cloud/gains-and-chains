import { Container, Graphics, Sprite, type Renderer, type Texture } from 'pixi.js';
import { timing } from './timing';

/**
 * Искры — единственный слой частиц в игре.
 *
 * Каждая искра — спрайт с общей текстурой: белое пятно со свечением, которое
 * подкрашивается в нужный цвет. Рисовать их одним `Graphics`, перебирая круги
 * заново каждый кадр, тоже можно, но там за каждый кадр заново считается
 * разбивка сотни кругов на треугольники — и просадка приходится ровно на тот
 * момент, ради которого искры и заведены. Спрайты с общей текстурой уходят
 * в один пакет отрисовки и не считают ничего.
 *
 * Свечение запечено в текстуру, а не собирается из двух кругов на лету:
 * на тёмном фоне точка в четыре пикселя теряется среди символов, а с размытым
 * краем читается как свет. Складывающийся режим (`add`) — по той же причине:
 * искра должна подсвечивать то, над чем летит.
 *
 * Пул фиксированный, и это не экономия ради экономии: искры сыплются в те же
 * моменты, что и тряска экрана, и сборка мусора даёт рывок кадра ровно там,
 * где картинка должна быть плавной. Переполнение забирает самую старую искру —
 * она и так гаснет первой.
 *
 * Слой не ловит события мыши вовсе: он лежит поверх поля и кнопок, и без
 * этого искра, пролетевшая над кнопкой, съедала бы клик.
 */

interface Particle {
  sprite: Sprite;
  vx: number;
  vy: number;
  /** Сколько секунд искре осталось. */
  life: number;
  ttl: number;
  /** Радиус ядра искры в пикселях макета на старте. */
  size: number;
}

/** Ускорение падения, пиксели в секунду за секунду. */
const GRAVITY = 1400;

/** Потолок числа живых искр. Больше на экране всё равно не различить. */
const MAX = 220;

/** Сторона текстуры искры. Ядро занимает малую её часть, остальное — свечение. */
const TEX = 32;

/** Во сколько раз пятно на экране шире ядра искры. Подобрано по текстуре. */
const GLOW = 4.8;

export interface BurstOptions {
  /** Сколько искр выбросить. */
  count?: number;
  color?: number;
  /** Начальная скорость, пикселей в секунду. */
  power?: number;
  /** Разброс скорости: 0 — все с одинаковой, 1 — от нуля до полной. */
  spread?: number;
  /** Сколько живёт искра, секунды. */
  life?: number;
}

function buildSparkTexture(renderer: Renderer): Texture {
  const r = TEX / 2;
  const g = new Graphics();
  g.circle(r, r, r).fill({ color: 0xffffff, alpha: 0.16 });
  g.circle(r, r, r * 0.55).fill({ color: 0xffffff, alpha: 0.4 });
  g.circle(r, r, r * 0.28).fill(0xffffff);
  const texture = renderer.generateTexture({ target: g, resolution: 2 });
  g.destroy();
  return texture;
}

export class Sparks {
  readonly view = new Container();

  private readonly texture: Texture;
  private readonly live: Particle[] = [];
  /** Спрайты погасших искр — ждут следующего залпа. */
  private readonly idle: Sprite[] = [];
  private made = 0;

  constructor(renderer: Renderer) {
    this.texture = buildSparkTexture(renderer);
    this.view.eventMode = 'none';
  }

  /** Веер искр из точки. Направление случайное — это удар, а не фонтан. */
  burst(x: number, y: number, o: BurstOptions = {}): void {
    const count = o.count ?? 18;
    const color = o.color ?? 0xffd24a;
    const power = o.power ?? 420;
    const spread = o.spread ?? 0.6;
    const life = o.life ?? 0.7;

    for (let i = 0; i < count; i++) {
      // Угол берётся с равномерным шагом и сдвигом: чистая случайность
      // сбивается в комки и оставляет в веере пустые сектора.
      const angle = ((i + Math.random()) / count) * Math.PI * 2;
      const speed = power * (1 - spread * Math.random());
      // Старт не в самой точке, а немного в стороне по своему же направлению:
      // из одной точки все искры первый кадр стоят плотным комком, и вспышка
      // читается как нарисованный кружок, а не как разлёт.
      const start = 8 + Math.random() * 16;

      const p = this.take();
      p.vx = Math.cos(angle) * speed;
      // Вверх летят охотнее, чем вниз: искра, сразу ушедшая под клетку,
      // читается как обрезанная, а не как искра.
      p.vy = Math.sin(angle) * speed - power * 0.35;
      p.ttl = life * (0.7 + Math.random() * 0.6);
      p.life = p.ttl;
      p.size = 4 + Math.random() * 4;

      p.sprite.position.set(x + Math.cos(angle) * start, y + Math.sin(angle) * start);
      p.sprite.tint = color;
      p.sprite.visible = true;
      this.draw(p);
    }
  }

  /** Гасит всё разом. Нужно на смене сцены — искры не должны пережить комнату. */
  clear(): void {
    for (const p of this.live) this.retire(p);
    this.live.length = 0;
  }

  /**
   * Шаг мира, `dt` — секунды прошлого кадра.
   *
   * Время идёт с общим коэффициентом темпа: в турбо весь показ короче, и искры,
   * висящие прежнюю секунду, оставались бы гореть уже над следующим спином.
   */
  update(dt: number): void {
    if (this.live.length === 0) return;
    const step = dt * timing.speed;

    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];
      p.life -= step;
      if (p.life <= 0) {
        this.retire(p);
        // Порядок искр не важен — выкидываем перестановкой с хвостом,
        // чтобы не сдвигать весь массив на каждой погасшей.
        this.live[i] = this.live[this.live.length - 1];
        this.live.pop();
        continue;
      }

      p.vy += GRAVITY * step;
      p.sprite.x += p.vx * step;
      p.sprite.y += p.vy * step;
      this.draw(p);
    }
  }

  /** Размер и яркость по остатку жизни: искра гаснет, съёживаясь. */
  private draw(p: Particle): void {
    const k = p.life / p.ttl;
    p.sprite.scale.set((p.size * k * GLOW) / TEX);
    p.sprite.alpha = Math.min(1, k * 1.4);
  }

  private take(): Particle {
    const spare = this.idle.pop();
    if (spare) {
      const p: Particle = { sprite: spare, vx: 0, vy: 0, life: 0, ttl: 1, size: 4 };
      this.live.push(p);
      return p;
    }

    if (this.made < MAX) {
      const sprite = new Sprite(this.texture);
      sprite.anchor.set(0.5);
      sprite.blendMode = 'add';
      this.view.addChild(sprite);
      this.made++;
      const p: Particle = { sprite, vx: 0, vy: 0, life: 0, ttl: 1, size: 4 };
      this.live.push(p);
      return p;
    }

    // Пул полон: забираем искру с головы списка. Точного порядка рождения там
    // нет — погасшие выкидываются перестановкой с хвостом, — но голова всё
    // равно из самых старых, а на переполнении важно лишь не гасить ту,
    // которую только что выбросили.
    const oldest = this.live.shift()!;
    this.live.push(oldest);
    return oldest;
  }

  private retire(p: Particle): void {
    p.sprite.visible = false;
    this.idle.push(p.sprite);
  }
}
