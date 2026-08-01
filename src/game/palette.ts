import { Sym, type SymId } from '../core/types';

/** Палитра из дизайн-документа. Держим в одном месте — арт будет её наследовать. */
export const COLOR = {
  bg: 0x1a0e24, // тёмный баклажан, подвал
  brick: 0x3d2317, // кирпич и дерево
  neon: 0xc74be8, // пурпурный неон
  gold: 0xffd24a, // золото выигрыша
  cyan: 0x35e0d8, // бонус и фриспины
  skin: 0xc9884a, // масляная кожа
  ink: 0x0d0713, // почти чёрный, обводки
  paper: 0xf2e8dc, // светлый текст
  dim: 0x2a1a38, // панели
  fire: 0xff5a1e, // раскалённый металл — подсветка нажатых кнопок
} as const;

/**
 * Цвета символов-плейсхолдеров.
 * Младшие намеренно приглушены, старшие — насыщенные: даже на квадратах
 * должно читаться, что выпало что-то ценное. Этот порядок переедет в арт.
 */
export const SYM_COLOR: Record<SymId, number> = {
  [Sym.DUMBBELL]: 0x5a5f6b,
  [Sym.WRISTBAND]: 0x6b5344,
  [Sym.HARNESS]: 0x7a4a35,
  [Sym.OIL]: 0x8a6a3a,
  [Sym.SHAKER]: 0x9a7f4a,
  [Sym.ROOKIE]: 0x4a7fa8,
  [Sym.REF]: 0x3f9e7a,
  [Sym.CHAMPION]: 0xd45a3a,
  [Sym.DUKE]: 0xb03a8f,
  [Sym.WILD]: COLOR.gold,
  [Sym.SCATTER]: COLOR.cyan,
  [Sym.CHAIN]: 0xe0a83a,
  [Sym.FIST]: COLOR.neon,
};

/** Короткие подписи для плейсхолдеров — арт их заменит целиком. */
export const SYM_LABEL: Record<SymId, string> = {
  [Sym.DUMBBELL]: 'ГНТ',
  [Sym.WRISTBAND]: 'НПЛ',
  [Sym.HARNESS]: 'ПРТ',
  [Sym.OIL]: 'МСЛ',
  [Sym.SHAKER]: 'ШЕЙ',
  [Sym.ROOKIE]: 'RKI',
  [Sym.REF]: 'REF',
  [Sym.CHAMPION]: 'TKT',
  [Sym.DUKE]: 'VAN',
  [Sym.WILD]: '♂',
  [Sym.SCATTER]: 'ДВЕРЬ',
  [Sym.CHAIN]: 'ЦЕПЬ',
  [Sym.FIST]: 'КУЛАК',
};
