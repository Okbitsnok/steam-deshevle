// Собирает расширение в zip-архив для раздела Releases на GitHub и для магазинов.
//
// Запуск: npm run build
// Результат:
//   dist/deshevle.zip            — постоянное имя, на него ведёт кнопка «Скачать» в README
//   dist/deshevle-vX.Y.Z.zip     — то же самое, но с версией в имени
//
// В архив попадает только то, что нужно браузеру: manifest.json, src/ и icons/.
// Файлы лежат в корне архива (без вложенной папки), чтобы после «Извлечь всё»
// получилась одна папка, внутри которой сразу manifest.json.
//
// Внешних зависимостей нет: zip собирается вручную через встроенный zlib.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INCLUDE = ['manifest.json', 'src', 'icons'];

/** @param {string} rel */
function collect(rel) {
  const abs = path.join(root, rel);
  if (statSync(abs).isDirectory()) {
    return readdirSync(abs)
      .sort()
      .flatMap((name) => collect(path.join(rel, name)));
  }
  return [rel.split(path.sep).join('/')];
}

// --- CRC32 (контрольная сумма, которую требует формат zip) --------------------
const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
/** @param {Buffer} buf */
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// Дата/время в формате MS-DOS — так их хранит zip.
const now = new Date();
const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

const files = INCLUDE.flatMap(collect);
const locals = [];
const centrals = [];
let offset = 0;

for (const name of files) {
  const data = readFileSync(path.join(root, name));
  const packed = deflateRawSync(data, { level: 9 });
  const nameBuf = Buffer.from(name, 'utf8');
  const crc = crc32(data);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); // сигнатура локального заголовка
  local.writeUInt16LE(20, 4); // версия формата
  local.writeUInt16LE(0x0800, 6); // имена в UTF-8
  local.writeUInt16LE(8, 8); // сжатие deflate
  local.writeUInt16LE(dosTime, 10);
  local.writeUInt16LE(dosDate, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(packed.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  local.writeUInt16LE(0, 28);
  locals.push(local, nameBuf, packed);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0); // сигнатура записи оглавления
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x0800, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt16LE(dosTime, 12);
  central.writeUInt16LE(dosDate, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(packed.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(nameBuf.length, 28);
  central.writeUInt32LE(offset, 42); // где в архиве лежит файл
  centrals.push(central, nameBuf);

  offset += local.length + nameBuf.length + packed.length;
}

const centralSize = centrals.reduce((n, b) => n + b.length, 0);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); // конец оглавления
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(centralSize, 12);
end.writeUInt32LE(offset, 16);

const zip = Buffer.concat([...locals, ...centrals, end]);
const { version } = JSON.parse(readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const dist = path.join(root, 'dist');
mkdirSync(dist, { recursive: true });
writeFileSync(path.join(dist, 'deshevle.zip'), zip);
writeFileSync(path.join(dist, `deshevle-v${version}.zip`), zip);

console.log(`Готово: ${files.length} файлов, ${(zip.length / 1024).toFixed(1)} КБ`);
console.log(`  dist/deshevle.zip`);
console.log(`  dist/deshevle-v${version}.zip`);
