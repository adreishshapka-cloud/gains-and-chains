import gsap from 'gsap';
import { Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import { DOOR_AT, DOOR_SHEET, STAGE_H, STAGE_W } from './layout';

/**
 * Вход в подземелье: то, что происходит между выбором двери и первым фриспином.
 *
 * Порядок такой. Экран гаснет, и в темноте игрок стоит секунды две — этого
 * достаточно, чтобы обстановка сменилась, и мало, чтобы он решил, будто игра
 * зависла. Потом из темноты проявляется вход: четверо у стены и запертая дверь
 * с надписью ENTER THE DUNGEON. Дверь открывается покадрово, за ней темнота,
 * и кадр наезжает в проём, снова уходя в чёрное. Оттуда игрок выходит уже
 * в бонусной комнате.
 *
 * Комната и кадры створки — готовые картинки (tools/prep_dungeon_entrance.py).
 * Здесь только время: сцена ничего не рисует сама и ничего не знает ни о
 * бонусной комнате, ни о фриспинах. Она умеет три вещи — увести экран в темноту,
 * показать вход, вернуть картинку из темноты, — а что подменить, пока темно,
 * решает Game.
 *
 * Затемнение живёт здесь же, а не отдельным слоем в Game: тем же чёрным
 * прямоугольником накрывается и возврат из бонусной комнаты (`swap`), и
 * держать две одинаковые шторки в разных файлах незачем.
 *
 * Турбо на эту сцену не действует, и это единственное место в игре, которое
 * его не слушает. Турбо снимает ожидание между спинами, а здесь ожидания нет:
 * вход в подземелье случается раз в две сотни спинов и длится ровно столько,
 * сколько нужно, чтобы темнота успела прочитаться темнотой, а не морганием.
 * На тройной скорости от двух секунд остаётся восемьсот миллисекунд — за них
 * не происходит ничего.
 */

/** Сколько экран остаётся полностью чёрным перед появлением входа, мс. */
const DARK_HOLD = 1150;
const FADE_OUT = 0.42;
const FADE_IN = 0.55;

/** Пауза перед тем, как дверь тронется: игрок успевает разглядеть комнату. */
const BEFORE_DOOR = 620;
/** Шаг покадровой анимации. Шестнадцать кадров укладываются в полторы секунды. */
const FRAME_STEP = 92;
/** Сколько держится распахнутая дверь перед наездом в проём. */
const AFTER_DOOR = 520;

const PUSH_IN = 1.15;
const PUSH_SCALE = 1.7;

/** Пауза в миллисекундах, без оглядки на темп игры. */
function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class DungeonEntrance {
  readonly view = new Container();

  private readonly scene = new Container();
  private readonly door: Sprite;
  private readonly veil = new Graphics();
  private readonly frames: Texture[];

  constructor(room: Texture, sheet: Texture) {
    const backdrop = new Sprite(room);
    backdrop.width = STAGE_W;
    backdrop.height = STAGE_H;

    this.frames = cutFrames(sheet);
    this.door = new Sprite(this.frames[0]);
    this.door.position.set(DOOR_AT.x, DOOR_AT.y);
    this.door.width = DOOR_AT.w;
    this.door.height = DOOR_AT.h;

    // Наезд идёт на проём, а не на середину кадра: шаг делают в дверь.
    // Точка взята чуть ниже середины створки — на уровне пола за порогом,
    // иначе кадр «поднимается» к притолоке, а не входит внутрь.
    this.scene.addChild(backdrop, this.door);
    this.scene.pivot.set(DOOR_AT.x + DOOR_AT.w / 2, DOOR_AT.y + DOOR_AT.h * 0.62);
    this.scene.position.set(this.scene.pivot.x, this.scene.pivot.y);

    this.veil.rect(0, 0, STAGE_W, STAGE_H).fill(0x000000);
    this.veil.alpha = 0;

    this.view.addChild(this.scene, this.veil);
    this.view.visible = false;
    this.view.eventMode = 'static';
    this.view.hitArea = new Rectangle(0, 0, STAGE_W, STAGE_H);
  }

  /**
   * От основной комнаты до темноты за распахнутой дверью.
   *
   * Возврата в игру после этого нет: экран остаётся чёрным, и вызывающий
   * обязан подменить комнату и позвать `reveal()`.
   */
  async enter(): Promise<void> {
    this.reset();
    this.scene.visible = false;
    this.view.visible = true;

    await this.fade(1, FADE_OUT);
    await wait(DARK_HOLD);

    this.scene.visible = true;
    await this.fade(0, FADE_IN);
    await wait(BEFORE_DOOR);

    for (const frame of this.frames.slice(1)) {
      this.door.texture = frame;
      await wait(FRAME_STEP);
    }
    await wait(AFTER_DOOR);

    // Шаг в проём: наезд и затемнение идут вместе, поэтому увеличение
    // не успевает показать, что за дверью ничего не нарисовано.
    gsap.to(this.scene.scale, { x: PUSH_SCALE, y: PUSH_SCALE, duration: PUSH_IN, ease: 'power2.in' });
    await this.fade(1, PUSH_IN * 0.85);
  }

  /** Проявляет то, что подменили, пока было темно. */
  async reveal(): Promise<void> {
    this.reset();
    this.scene.visible = false;
    await this.fade(0, FADE_IN);
    this.view.visible = false;
  }

  /** Снимает наезд предыдущего входа вместе с его анимацией. */
  private reset(): void {
    gsap.killTweensOf(this.scene.scale);
    this.scene.scale.set(1);
    this.door.texture = this.frames[0];
  }

  /**
   * Короткое затемнение вокруг подмены — для возврата из бонусной комнаты.
   * Сцену входа при этом не показывает: назад из подземелья идут не дверью.
   */
  async swap(change: () => void): Promise<void> {
    this.scene.visible = false;
    this.view.visible = true;

    await this.fade(1, FADE_OUT);
    change();
    await wait(220);
    await this.fade(0, FADE_IN);

    this.view.visible = false;
  }

  private fade(to: number, seconds: number): Promise<void> {
    return new Promise((resolve) => {
      gsap.killTweensOf(this.veil);
      gsap.to(this.veil, { alpha: to, duration: seconds, ease: 'sine.inOut', onComplete: resolve });
    });
  }
}

/** Режет лист 4x4 на отдельные кадры. */
function cutFrames(sheet: Texture): Texture[] {
  const w = sheet.width / DOOR_SHEET.cols;
  const h = sheet.height / DOOR_SHEET.rows;

  const frames: Texture[] = [];
  for (let row = 0; row < DOOR_SHEET.rows; row++) {
    for (let col = 0; col < DOOR_SHEET.cols; col++) {
      frames.push(
        new Texture({
          source: sheet.source,
          frame: new Rectangle(col * w, row * h, w, h),
        }),
      );
    }
  }
  return frames;
}
