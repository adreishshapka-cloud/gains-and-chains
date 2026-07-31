/**
 * Проверяет спрайты и собирает страницу для просмотра.
 *
 *   npx tsx art/build-preview.ts
 *
 * Проверка важнее сборки: строка, где на один пиксель больше или меньше,
 * на глаз не отличается, а спрайт после неё едет целиком. Скрипт ругается
 * с точным номером строки, поэтому набирать арт руками вообще возможно.
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PALETTE, SPRITE } from './palette';
import { SPRITES } from './sprites';

const here = dirname(fileURLToPath(import.meta.url));

// ── Проверка ─────────────────────────────────────────────────

const problems: string[] = [];

for (const [name, rows] of Object.entries(SPRITES)) {
  if (rows.length !== SPRITE) {
    problems.push(`${name}: строк ${rows.length}, нужно ${SPRITE}`);
  }
  for (const [i, row] of rows.entries()) {
    if (row.length !== SPRITE) {
      problems.push(`${name}, строка ${i}: длина ${row.length}, нужно ${SPRITE}  «${row}»`);
    }
    for (const ch of row) {
      if (!(ch in PALETTE)) {
        problems.push(`${name}, строка ${i}: символ «${ch}» вне палитры`);
        break;
      }
    }
  }
}

if (problems.length > 0) {
  console.error(`\n  Спрайты не сходятся — ${problems.length} замечаний:\n`);
  for (const p of problems) console.error('   ' + p);
  console.error('');
  process.exit(1);
}

const count = Object.keys(SPRITES).length;
console.log(`\n  Проверено: ${count} спрайтов ${SPRITE}×${SPRITE}, все ровные.`);

// ── Сборка страницы ──────────────────────────────────────────

const data = JSON.stringify({ palette: PALETTE, sprites: SPRITES, size: SPRITE });

const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>GAINS &amp; CHAINS — пиксель-арт</title>
<style>
  :root { color-scheme: dark; }
  body {
    margin: 0; padding: 28px 32px 60px;
    background: #140a1c;
    color: #f2e8dc;
    font: 15px/1.5 "Segoe UI", system-ui, sans-serif;
  }
  h1 { font-size: 26px; margin: 0 0 4px; letter-spacing: 1px; color: #ffd24a; }
  .sub { color: #9a8aaa; margin: 0 0 26px; font-size: 14px; }
  h2 { font-size: 15px; color: #c74be8; margin: 30px 0 12px; letter-spacing: 2px; text-transform: uppercase; }
  .grid { display: flex; flex-wrap: wrap; gap: 18px; }
  .cell { text-align: center; }
  .cell canvas {
    image-rendering: pixelated;
    background: #1a0e24;
    border: 3px solid #3d2317;
    border-radius: 8px;
    display: block;
  }
  .cell span { display: block; margin-top: 7px; font-size: 12px; color: #9a8aaa; letter-spacing: 1px; }
  .reel {
    display: inline-flex; gap: 0;
    background: #0d0713; padding: 10px; border-radius: 12px; border: 4px solid #3d2317;
  }
  .reel canvas { image-rendering: pixelated; display: block; }
  .swatches { display: flex; flex-wrap: wrap; gap: 8px; }
  .sw { width: 58px; text-align: center; font-size: 11px; color: #9a8aaa; }
  .sw i { display: block; height: 30px; border-radius: 5px; border: 2px solid #0d0713; }
</style>
</head>
<body>
<h1>GAINS &amp; CHAINS — пиксель-арт</h1>
<p class="sub">Спрайты ${SPRITE}×${SPRITE}. В игре пойдут ×4 внутри ячейки 108&nbsp;px. Пока никуда не подключены.</p>

<h2>Символы крупно</h2>
<div class="grid" id="big"></div>

<h2>Как это ляжет на барабан</h2>
<div class="reel" id="reel"></div>

<h2>Палитра</h2>
<div class="swatches" id="sw"></div>

<script>
const DATA = ${data};

function draw(canvas, name, scale) {
  const { palette, sprites, size } = DATA;
  canvas.width = size * scale;
  canvas.height = size * scale;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const rows = sprites[name];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const color = palette[rows[y][x]];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  }
}

const big = document.getElementById('big');
for (const name of Object.keys(DATA.sprites)) {
  const cell = document.createElement('div');
  cell.className = 'cell';
  const c = document.createElement('canvas');
  draw(c, name, 7);
  const s = document.createElement('span');
  s.textContent = name;
  cell.append(c, s);
  big.append(cell);
}

// Пять произвольных символов подряд — так их видно рядом, как на барабане.
const reel = document.getElementById('reel');
for (const name of ['DUKE', 'WILD', 'CHAIN', 'CHAMPION', 'FIST']) {
  const c = document.createElement('canvas');
  draw(c, name, 4);
  reel.append(c);
}

const sw = document.getElementById('sw');
for (const [key, color] of Object.entries(DATA.palette)) {
  if (!color) continue;
  const d = document.createElement('div');
  d.className = 'sw';
  d.innerHTML = '<i style="background:' + color + '"></i>' + key;
  sw.append(d);
}
</script>
</body>
</html>
`;

const out = join(here, 'preview.html');
writeFileSync(out, html, 'utf8');
console.log(`  Превью: ${out}\n`);
