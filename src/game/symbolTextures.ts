import { Assets, Texture, type Renderer } from 'pixi.js';
import { Sym, SYM_COUNT, type SymId } from '../core/types';
import { CHAIN_VALUES } from '../core/paytable';
import { buildSymbolTextures } from './placeholders';

/**
 * Загрузка нарисованных символов с откатом на плейсхолдеры.
 *
 * Файлы кладутся в src/assets/symbols/ по одному на символ. Чего нет —
 * то остаётся цветной плиткой, и игра всё равно запускается. Это важно:
 * арт приходит по частям, и ждать полного комплекта, чтобы увидеть хоть
 * что-то, не придётся.
 */

/** Имя файла для каждого символа. Цепи — по ступеням, см. CHAIN_VALUES. */
const FILE_NAME: Record<SymId, string> = {
  [Sym.DUMBBELL]: 'dumbbell',
  [Sym.WRISTBAND]: 'wristband',
  [Sym.HARNESS]: 'harness',
  [Sym.OIL]: 'oil',
  [Sym.SHAKER]: 'shaker',
  [Sym.ROOKIE]: 'rookie',
  [Sym.REF]: 'ref',
  [Sym.CHAMPION]: 'champion',
  [Sym.DUKE]: 'duke',
  [Sym.WILD]: 'wild',
  [Sym.SCATTER]: 'scatter',
  // Звенья без номинала: на барабане цепь показывается именно так, а число
  // поверх рисует движок. Спрайты chain-1…5 несут зашитые цифры, и они бы
  // спорили с настоящим номиналом, который зависит от текущей ставки.
  [Sym.CHAIN]: 'chain',
  [Sym.FIST]: 'fist',
};

/**
 * Цепь одна в мат-модели, но пять на экране — по ступени номинала.
 * Имена: chain-1 … chain-5, в порядке возрастания.
 */
export const CHAIN_FILES = CHAIN_VALUES.map((_, i) => `chain-${i + 1}`);

// Vite подхватывает всё, что лежит в папке, на этапе сборки. Пустая папка —
// пустой объект, и тогда просто works весь набор плейсхолдеров.
const FILES = import.meta.glob('../assets/symbols/*.png', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function urlFor(name: string): string | null {
  const key = Object.keys(FILES).find((path) => path.endsWith(`/${name}.png`));
  return key ? FILES[key] : null;
}

export interface SymbolArt {
  /** Текстуры по индексу символа. */
  textures: Texture[];
  /** Текстуры цепей по ступеням. Пустой массив — рисуем обычной цепью. */
  chains: Texture[];
  /** Сколько символов пришло из файлов, а не из плейсхолдеров. */
  loaded: number;
}

/** Пиксель-арт обязан масштабироваться без сглаживания, иначе всё поплывёт. */
function makePixelated(texture: Texture): Texture {
  texture.source.scaleMode = 'nearest';
  return texture;
}

export async function loadSymbolArt(renderer: Renderer): Promise<SymbolArt> {
  const fallback = buildSymbolTextures(renderer);
  const textures: Texture[] = [...fallback];
  const chains: Texture[] = [];
  let loaded = 0;

  for (let s = 0; s < SYM_COUNT; s++) {
    const url = urlFor(FILE_NAME[s as SymId]);
    if (!url) continue;
    try {
      textures[s] = makePixelated(await Assets.load<Texture>(url));
      loaded++;
    } catch {
      // Битый или отсутствующий файл не должен ронять игру — остаётся плитка.
    }
  }

  for (const name of CHAIN_FILES) {
    const url = urlFor(name);
    if (!url) continue;
    try {
      chains.push(makePixelated(await Assets.load<Texture>(url)));
    } catch {
      /* ступень останется без своего спрайта */
    }
  }

  return { textures, chains, loaded };
}
