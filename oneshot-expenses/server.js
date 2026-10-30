/**
 * Минимальный статический файловый сервер без внешних зависимостей.
 * Раздаёт файлы приложения и открывает страницу по адресу http://localhost:3000
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PORT) || 3000;
const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)));

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function send(res, status, body, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': contentType });
  res.end(body);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/') pathname = '/index.html';

    // Защита от path traversal: путь не должен выходить за пределы ROOT
    const filePath = normalize(join(ROOT, pathname));
    if (!filePath.startsWith(ROOT)) {
      send(res, 403, 'Запрещено');
      return;
    }

    const data = await readFile(filePath);
    const contentType = MIME_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
    send(res, 200, data, contentType);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      send(res, 404, 'Файл не найден');
    } else {
      send(res, 500, 'Внутренняя ошибка сервера');
    }
  }
});

server.listen(PORT, () => {
  console.log(`Приложение «Расходы группы после поездки» запущено: http://localhost:${PORT}`);
});
