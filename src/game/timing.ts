/**
 * Общий темп анимаций.
 *
 * Турбо-режим не должен быть отдельной веткой кода в каждом файле — иначе
 * рано или поздно какая-то пауза окажется незамеченной, и в турбо игра будет
 * дёргаться. Вместо этого все длительности делятся на один коэффициент.
 */

export const timing = {
  /** 1 — обычный темп, больше единицы — быстрее. */
  speed: 1,
};

export const TURBO_SPEED = 2.4;

/** Пауза с учётом текущего темпа, мс. */
export function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms / timing.speed));
}

/** Длительность анимации с учётом темпа, секунды. */
export function dur(seconds: number): number {
  return seconds / timing.speed;
}
