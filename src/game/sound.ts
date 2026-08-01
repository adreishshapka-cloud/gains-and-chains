import { Howl } from 'howler';
import spinUrl from '../assets/audio/spin.mp3';

/**
 * Звуковые эффекты. Пока один — раскрутка барабанов.
 *
 * Отдельно от музыки намеренно: у них разные выключатели (кнопки «динамик»
 * и «нота»), разная громкость и разное поведение — музыка зациклена и одна
 * на комнату, эффект короткий и может наложиться сам на себя.
 *
 * Наложение здесь как раз запрещено: спин можно запустить, не дождавшись
 * конца предыдущего звука (турбо, автоспин), и без остановки предыдущего
 * они накладываются в кашу. Поэтому перед каждым запуском звук обрывается.
 */

const VOLUME = 0.5;

class SoundBoard {
  private spinSfx: Howl | null = null;
  private enabled = true;

  get isOn(): boolean {
    return this.enabled;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) this.spinSfx?.stop();
  }

  spin(): void {
    if (!this.enabled) return;
    // Howl создаётся при первом обращении, а не при загрузке модуля: до первого
    // действия игрока браузер всё равно не даст ничего воспроизвести.
    this.spinSfx ??= new Howl({ src: [spinUrl], volume: VOLUME, html5: false });
    this.spinSfx.stop();
    this.spinSfx.play();
  }

  /** Обрывает звук раскрутки — барабаны уже встали. */
  stopSpin(): void {
    this.spinSfx?.stop();
  }
}

export const sound = new SoundBoard();
