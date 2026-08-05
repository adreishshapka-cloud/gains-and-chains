import { Assets, Texture } from 'pixi.js';
import type { CoinTier } from '../core/features/coinRush';

/**
 * Монеты бонуса OIL RUSH.
 *
 * Каждый номинал — своя картинка с запечённым числом (`coin-v1` … `coin-v500`,
 * см. tools/prep_oil_rush.py). Так можно потому, что номинал монеты — это
 * множитель ОБЩЕЙ ставки и от её размера не зависит; цепям базовой игры такое
 * не подходит, там число обязано считаться на лету.
 *
 * Пустые монеты ступеней (`coin-bronze` … `coin-diamond`) — запас: если
 * в мат-модели заведут номинал, которого нет на листе, игра возьмёт пустую
 * монету нужного металла и напишет число сама. Молчаливой дыры на поле
 * при этом не появится.
 */

const FILES = import.meta.glob('../assets/ui/coin-*.png', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function urlFor(name: string): string | null {
  const key = Object.keys(FILES).find((path) => path.endsWith(`/${name}.png`));
  return key ? FILES[key] : null;
}

export interface CoinArt {
  /** Монеты с запечённым номиналом. Ключ — номинал в общих ставках. */
  byValue: Map<number, Texture>;
  /** Пустые монеты ступеней — запас под номинал без своей картинки. */
  tiers: Record<CoinTier, Texture>;
  fist: Texture;
  pump: Texture;
  mult: Texture;
}

async function load(name: string): Promise<Texture> {
  const url = urlFor(name);
  if (!url) throw new Error(`нет файла монеты: ${name}.png`);
  return Assets.load<Texture>(url);
}

export async function loadCoinArt(): Promise<CoinArt> {
  const [bronze, silver, gold, diamond, fist, pump, mult] = await Promise.all([
    load('coin-bronze'),
    load('coin-silver'),
    load('coin-gold'),
    load('coin-diamond'),
    load('coin-fist'),
    load('coin-pump'),
    load('coin-mult'),
  ]);

  // Номиналы разбираются из имён файлов, а не перечисляются здесь: добавить
  // ступень в мат-модель и подложить картинку должно хватать.
  const byValue = new Map<number, Texture>();
  for (const path of Object.keys(FILES)) {
    const match = /coin-v(\d+)\.png$/.exec(path);
    if (!match) continue;
    byValue.set(Number(match[1]), await Assets.load<Texture>(FILES[path]));
  }

  return { byValue, tiers: { bronze, silver, gold, diamond }, fist, pump, mult };
}
