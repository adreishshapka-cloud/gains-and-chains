import { Howl } from 'howler';
import bonusUrl from '../assets/audio/theme-bonus.mp3';
import mainUrl from '../assets/audio/theme-main.mp3';
import { DEFAULT_VOLUME } from '../state/save';

/**
 * Фоновая музыка: одна тема в основной комнате, другая в бонусной.
 *
 * Музыка играет всегда, пока её не выключили кнопкой: тема запускается сразу
 * при входе в игру, а не по первому действию игрока.
 *
 * Оговорка одна, и она про браузер: политика автозапуска может отклонить
 * первый play(), пока страницу не тронули. В упакованном приложении этого
 * не происходит, а на всякий случай тот же запуск повторяется с первого
 * клика или нажатия клавиши — см. `unlock()`.
 *
 * Треки лежат в памяти целиком (`html5: false`). Они короткие и зациклены,
 * а потоковый режим на зацикливании даёт слышимый разрыв в стыке.
 *
 * Переключение тем идёт через затухание, а не встык: резкая смена трека на
 * входе в бонус звучит как сбой, даже когда всё работает правильно.
 */

export type Theme = 'main' | 'bonus';

const FADE_MS = 700;

const SOURCES: Record<Theme, string> = {
  main: mainUrl,
  bonus: bonusUrl,
};

class MusicPlayer {
  private tracks = new Map<Theme, Howl>();
  private current: Theme | null = null;
  private enabled = false;
  private volume = DEFAULT_VOLUME;
  /** Тема, которую надо запустить, как только браузер разрешит звук. */
  private pending: Theme | null = null;
  private unlocked = false;

  get isOn(): boolean {
    return this.enabled;
  }

  get level(): number {
    return this.volume;
  }

  /**
   * Громкость 0..1. Применяется сразу, без плавного перехода: ползунок
   * двигают на слух, и задержка в семьсот миллисекунд превратила бы
   * подстройку в угадайку.
   *
   * Ставится не через `volume()`, а мгновенным затуханием: у Howler нет
   * способа отменить уже идущее затухание, и обычная установка громкости
   * посреди него тут же затирается его следующим шагом. Затухание в 1 мс
   * такое же затухание — оно просто заменяет предыдущее собой.
   *
   * Когда музыка выключена, трогать нечего: там как раз идёт затухание
   * на остановку, и вмешиваться в него означало бы вернуть трек к жизни.
   */
  setVolume(value: number): void {
    this.volume = Math.min(1, Math.max(0, value));
    if (!this.enabled || !this.current) return;
    const current = this.tracks.get(this.current);
    if (current?.playing()) current.fade(current.volume(), this.volume, 1);
  }

  /**
   * Повторная попытка запуска после первого действия игрока.
   *
   * Запуск при входе в игру пробуется сразу и в упакованном приложении
   * проходит. В браузере его может отклонить политика автозапуска — вот на
   * этот случай тот же запуск вызывается ещё раз с первого клика или клавиши.
   */
  unlock(): void {
    if (this.unlocked) return;
    this.unlocked = true;
    if (this.enabled && this.pending) this.start(this.pending);
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (on) this.start(this.pending ?? this.current ?? 'main');
    else this.stopAll();
  }

  /** Какая тема должна звучать сейчас. Работает и при выключенной музыке. */
  play(theme: Theme): void {
    this.pending = theme;
    if (this.enabled) this.start(theme);
  }

  private start(theme: Theme): void {
    const next = this.track(theme);
    if (this.current === theme && next.playing()) return;

    for (const [name, howl] of this.tracks) {
      if (name !== theme) this.fadeOut(howl);
    }

    this.current = theme;
    this.pending = theme;
    // Тема могла быть в процессе затухания — снимаем с неё обработчик остановки,
    // иначе он сработает уже после того, как мы её вернули, и трек замолчит.
    next.off('fade');
    if (!next.playing()) next.play();
    next.fade(next.volume(), this.volume, FADE_MS);
  }

  private stopAll(): void {
    for (const howl of this.tracks.values()) this.fadeOut(howl);
    this.current = null;
  }

  /**
   * Гасит трек и останавливает его, когда затухание дошло до конца.
   *
   * Обработчик именно одноразовый и вешается только здесь. Постоянный
   * («погас до нуля — стоп») пробовали, и он глушил музыку на старте:
   * плавное появление тоже испускает событие `fade`, и при неудачном порядке
   * громкость в этот момент ещё нулевая — трек останавливался сразу после
   * того, как его включили.
   */
  private fadeOut(howl: Howl): void {
    if (!howl.playing()) return;
    howl.off('fade');
    howl.once('fade', () => howl.stop());
    howl.fade(howl.volume(), 0, FADE_MS);
  }

  private track(theme: Theme): Howl {
    let howl = this.tracks.get(theme);
    if (!howl) {
      howl = new Howl({ src: [SOURCES[theme]], loop: true, volume: 0, html5: false });
      this.tracks.set(theme, howl);
    }
    return howl;
  }
}

export const music = new MusicPlayer();
