import { Game } from './game/Game';

const mount = document.getElementById('app');
if (!mount) throw new Error('Не найден контейнер #app');

const game = new Game();
await game.init(mount);

// Отладочный доступ только в dev-сборке: подсунуть спин, посмотреть состояние,
// прогнать сотню раундов без кликов. В собранной игре этого объекта нет.
if (import.meta.env.DEV) {
  (globalThis as unknown as { game: Game }).game = game;
}
