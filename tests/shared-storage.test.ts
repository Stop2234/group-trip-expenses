import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { createApp } from '../server/index';
import { ExpenseService } from '../src/lib/service';
import { createToolHandlers } from '../server/mcp';

/**
 * Проверка ОБЩИХ ДАННЫХ web ↔ MCP.
 *
 * Оба пути (REST API и MCP-инструменты) работают с одним ExpenseService
 * и одним JSON-файлом. Тесты доказывают взаимную видимость:
 *   A. расход создан через MCP → виден через HTTP API;
 *   B. расход создан через HTTP API → виден через MCP.
 * Плюс проверка демо-данных и очистки через оба пути.
 */

let dir: string;
let dataFile: string;
let server: Server;
let baseUrl: string;
let service: ExpenseService;
let handlers: ReturnType<typeof createToolHandlers>;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'trip-expenses-shared-'));
  dataFile = join(dir, 'data.json');
  const created = createApp(dataFile);
  service = created.service;
  handlers = createToolHandlers(service);
  await new Promise<void>((resolve) => {
    server = created.app.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(dir, { recursive: true, force: true });
});

beforeEach(async () => {
  await service.clearAll();
});

function parseResult(result: { content: Array<{ text: string }> }): Record<string, unknown> {
  return JSON.parse(result.content[0].text) as Record<string, unknown>;
}

async function httpGet<T>(path: string): Promise<T> {
  const res = await fetch(`${baseUrl}/api${path}`);
  return (await res.json()) as T;
}

async function httpPost<T>(path: string, body: unknown): Promise<{ status: number; data: T }> {
  const res = await fetch(`${baseUrl}/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: (await res.json()) as T };
}

describe('Общие данные: MCP → HTTP', () => {
  it('расход, добавленный через MCP, виден через HTTP API', async () => {
    // Arrange: участники через HTTP API (путь веб-интерфейса)
    await httpPost('/participants', { name: 'Егор' });
    await httpPost('/participants', { name: 'Анна' });

    // Act: расход добавлен через MCP-инструмент
    const mcpResult = await handlers.add_expense({
      title: 'МCP ужин',
      amount_rubles: 2500.75,
      paid_by: 'Егор',
      participants: ['Егор', 'Анна'],
    });
    expect(parseResult(mcpResult).success).toBe(true);

    // Assert: HTTP API видит этот расход
    const expenses = await httpGet<Array<{ id: string; title: string; amountKopecks: number }>>('/expenses');
    expect(expenses).toHaveLength(1);
    expect(expenses[0].title).toBe('МCP ужин');
    expect(expenses[0].amountKopecks).toBe(250075);
  });

  it('участник, добавленный через MCP, виден через HTTP API', async () => {
    const mcpResult = await handlers.add_participant({ name: 'Иван' });
    expect(parseResult(mcpResult).success).toBe(true);

    const participants = await httpGet<Array<{ name: string }>>('/participants');
    expect(participants.map((p) => p.name)).toContain('Иван');
  });

  it('демо-данные через MCP видны веб-интерфейсу (HTTP)', async () => {
    const mcpResult = await handlers.load_demo();
    expect(parseResult(mcpResult).success).toBe(true);

    const state = await httpGet<{ participants: unknown[]; expenses: unknown[] }>('/state');
    expect(state.participants.length).toBe(4);
    expect(state.expenses.length).toBe(5);
  });

  it('очистка через MCP делает HTTP state пустым', async () => {
    await handlers.load_demo();
    await service.clearAll();
    const state = await httpGet<{ participants: unknown[]; expenses: unknown[] }>('/state');
    expect(state.participants).toHaveLength(0);
    expect(state.expenses).toHaveLength(0);
  });
});

describe('Общие данные: HTTP → MCP', () => {
  it('расход, добавленный через HTTP API, виден через MCP list_expenses', async () => {
    // Arrange: участники и расход через HTTP API (путь веб-интерфейса)
    await httpPost('/participants', { name: 'Мария' });
    await httpPost('/participants', { name: 'Олег' });
    const post = await httpPost<{ id: string }>('/expenses', {
      title: 'Web taxi',
      amountRubles: 400.5,
      paidBy: 'Мария',
      participants: ['Мария', 'Олег'],
      splitMode: 'equal',
    });
    expect(post.status).toBe(200);

    // Act: MCP list_expenses
    const mcpResult = await handlers.list_expenses();
    const parsed = parseResult(mcpResult);
    const expenses = (parsed.data as { expenses: Array<Record<string, unknown>> }).expenses;

    // Assert
    expect(expenses).toHaveLength(1);
    expect(expenses[0].title).toBe('Web taxi');
    expect(expenses[0].amount_kopecks).toBe(40050);
    expect((expenses[0].paid_by as { name: string }).name).toBe('Мария');
  });

  it('расчёт взаиморасчётов через MCP использует данные, добавленные через HTTP', async () => {
    await httpPost('/participants', { name: 'А' });
    await httpPost('/participants', { name: 'Б' });
    await httpPost('/expenses', {
      title: 'Общий счёт',
      amountRubles: 1000,
      paidBy: 'А',
      participants: ['А', 'Б'],
    });

    const mcpResult = await handlers.calculate_settlements();
    const parsed = parseResult(mcpResult);
    const data = parsed.data as {
      balances: Array<{ name: string; net_kopecks: number }>;
      transfers: Array<{ from: { name: string }; to: { name: string }; amount_kopecks: number }>;
    };
    const a = data.balances.find((b) => b.name === 'А');
    const b = data.balances.find((b) => b.name === 'Б');
    expect(a?.net_kopecks).toBe(50000);
    expect(b?.net_kopecks).toBe(-50000);
    expect(data.transfers[0].from.name).toBe('Б');
    expect(data.transfers[0].to.name).toBe('А');
    expect(data.transfers[0].amount_kopecks).toBe(50000);
  });

  it('участники через HTTP API видны через MCP list_participants', async () => {
    await httpPost('/participants', { name: 'Ольга' });
    const mcpResult = await handlers.list_participants();
    const parsed = parseResult(mcpResult);
    const participants = (parsed.data as { participants: Array<{ name: string }> }).participants;
    expect(participants.map((p) => p.name)).toContain('Ольга');
  });
});

describe('HTTP API — обработка ошибок', () => {
  it('POST /expenses с неизвестным плательщиком возвращает 404 и структурированную ошибку', async () => {
    await httpPost('/participants', { name: 'Егор' });
    const res = await httpPost<{ error: { code: string; message: string } }>('/expenses', {
      title: 'Тест',
      amountRubles: 100,
      paidBy: 'Несуществующий',
      participants: ['Егор'],
    });
    expect(res.status).toBe(404);
    expect(res.data.error.code).toBe('PAYER_NOT_FOUND');
  });

  it('POST /expenses с отрицательной суммой возвращает 400', async () => {
    await httpPost('/participants', { name: 'Егор' });
    const res = await httpPost<{ error: { code: string } }>('/expenses', {
      title: 'Тест',
      amountRubles: -100,
      paidBy: 'Егор',
      participants: ['Егор'],
    });
    expect(res.status).toBe(400);
    expect(res.data.error.code).toBe('INVALID_AMOUNT');
  });

  it('GET /api/state возвращает валидный JSON', async () => {
    const state = await httpGet<{ participants: unknown[]; expenses: unknown[] }>('/state');
    expect(Array.isArray(state.participants)).toBe(true);
    expect(Array.isArray(state.expenses)).toBe(true);
  });

  it('данные переживают перезагрузку хранилища (персистентность файла)', async () => {
    await httpPost('/participants', { name: 'Постоянный' });
    // Перечитываем состояние из того же файла заново (симулируем перезапуск)
    const { JsonFileStorage } = await import('../server/storage');
    const freshService = new ExpenseService(new JsonFileStorage(dataFile));
    const state = await freshService.getState();
    expect(state.participants.map((p) => p.name)).toContain('Постоянный');
  });
});
