import express from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { JsonFileStorage } from './storage';
import { createApiRouter } from './api';
import { createMcpServer, createToolHandlers } from './mcp';
import { ExpenseService } from '../src/lib/service';

/**
 * Backend-сервер приложения «Расходы группы после поездки».
 *
 * Предоставляет:
 *  - REST API на /api/* — для веб-интерфейса (React);
 *  - MCP endpoint на /mcp (Streamable HTTP, stateless) — для AI-агента.
 *
 * ОБА интерфейса используют один и тот же ExpenseService и одно
 * JSON-хранилище (по умолчанию data/trip-data.json).
 */

const PORT = Number(process.env.PORT ?? 3001);
const DATA_FILE = process.env.DATA_FILE ?? new URL('../data/trip-data.json', import.meta.url).pathname;

export function createApp(dataFile: string) {
  const storage = new JsonFileStorage(dataFile);
  const service = new ExpenseService(storage);
  const handlers = createToolHandlers(service);

  const app = express();
  app.use(express.json());

  // REST API для веб-интерфейса
  app.use('/api', createApiRouter(service));

  // MCP endpoint (Streamable HTTP, stateless — без сессий)
  app.post('/mcp', async (req, res) => {
    const server = createMcpServer(handlers);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    res.on('close', () => {
      transport.close();
      server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error('Ошибка обработки MCP-запроса:', err);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        });
      }
    }
  });

  // Остальные HTTP-методы MCP (GET/DELETE) в stateless-режиме не поддерживаются
  app.get('/mcp', (_req, res) => {
    res.status(405).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed. Используйте POST (stateless Streamable HTTP).' },
      id: null,
    });
  });
  app.delete('/mcp', (_req, res) => {
    res.status(405).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed' },
      id: null,
    });
  });

  // Обработчик ошибок Express
  app.use(
    (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      console.error('Ошибка сервера:', err);
      res.status(500).json({ error: { code: 'INTERNAL', message: 'Внутренняя ошибка сервера' } });
    },
  );

  return { app, service, storage };
}

// Запуск при выполнении напрямую (npm run dev:server / npm start)
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop() ?? '');
if (isMain) {
  const { app } = createApp(DATA_FILE);
  app.listen(PORT, '127.0.0.1', () => {
    console.log(`Сервер запущен: http://127.0.0.1:${PORT}`);
    console.log(`  REST API:  http://127.0.0.1:${PORT}/api/state`);
    console.log(`  MCP:       http://127.0.0.1:${PORT}/mcp`);
    console.log(`  Хранилище: ${DATA_FILE}`);
  });
}
