/**
 * Сборка настольного приложения.
 *
 *   node tools/build-app.mjs [--portable]
 *
 * Зачем обёртка вместо прямого вызова electron-builder: путь к проекту содержит
 * кириллицу («проект слот»), а распаковщик electron-builder на таком пути падает
 * с EPERM при переименовании временной папки. Поэтому дистрибутив собирается
 * в каталог с чисто латинским путём, а сюда только сообщается, где он лежит.
 *
 * Если проект переедет в путь без кириллицы, обёртка не помешает — она просто
 * продолжит складывать сборки в тот же каталог.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const OUT = join(homedir(), 'gains-build');

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: true });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

mkdirSync(OUT, { recursive: true });

const portableOnly = process.argv.includes('--portable');
const targets = portableOnly ? ['portable'] : [];

console.log('\n  Собираю веб-часть…\n');
run('npm', ['run', 'build']);

console.log(`\n  Пакую в ${OUT}\n`);
run('npx', [
  'electron-builder',
  '--win',
  ...targets,
  `--config.directories.output=${OUT}`,
]);

console.log('\n  Готово:\n');
for (const name of readdirSync(OUT)) {
  const full = join(OUT, name);
  if (!existsSync(full) || statSync(full).isDirectory()) continue;
  if (!name.endsWith('.exe')) continue;
  const mb = (statSync(full).size / 1024 / 1024).toFixed(1);
  console.log(`   ${name}  ${mb} MB`);
}
console.log(`\n   Папка: ${OUT}\n`);
