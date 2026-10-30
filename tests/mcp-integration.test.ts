import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createApp } from '../server/index';

/**
 * Интеграционный тест с РЕАЛЬНЫМ MCP-клиентом (SDK) поверх Streamable HTTP.
 *
 * Доказывает, что MCP endpoint /mcp реально работает:
 *   - инициализация сессии;
 *   - tools/list возвращает инструменты;
 *   - tools/call: add_expense → list_expenses → calculate_settlements;
 *   - ошибка валидации возвращается как isError, не роняет сервер;
 *   - данные, созданные через реальный MCP, видны через HTTP API (общий storage).
 */

let dir: string;
let dataFile: string;
let server: Server;
let baseUrl: string;
let client: Client;

async function connect(): Promise<Client> {
  const c = new Client({ name: 'integration-test-client', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`));
  await c.connect(transport);
  return c;
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'trip-expenses-mcp-'));
  dataFile = join(dir, 'data.json');
  const created = createApp(dataFile);
  await new Promise<void>((resolve) => {
    server = created.app.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}`;
  client = await connect();
});

afterAll(async () => {
  await client?.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(dir, { recursive: true, force: true });
});

/** Вызывает инструмент через реальный MCP-клиент и парсит JSON-ответ */
async function callTool(name: string, args: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const result = await client.callTool({ name, arguments: args });
  const content = result.content as Array<{ type: string; text: string }>;
  return JSON.parse(content[0].text) as Record<string, unknown>;
}

describe('Реальный MCP-клиент → сервер (Streamable HTTP)', () => {
  it('инициализируется и перечисляет инструменты', async () => {
    const tools = await client.listTools();
    const names = tools.tools.map((t) => t.name).sort();
    expect(names).toContain('add_expense');
    expect(names).toContain('list_expenses');
    expect(names).toContain('calculate_settlements');
    expect(names).toContain('list_participants');
    expect(names).toContain('add_participant');
  });

  it('описание add_expense предупреждает о неоднозначных запросах', async () => {
    const tools = await client.listTools();
    const addExpense = tools.tools.find((t) => t.name === 'add_expense');
    expect(addExpense?.description).toMatch(/неоднознач|уточнен/i);
    // Схема требует participants — без них агент не сможет вызвать инструмент
    const schema = addExpense?.inputSchema as { required?: string[] };
    expect(schema.required).toContain('participants');
    expect(schema.required).toContain('paid_by');
    expect(schema.required).toContain('amount_rubles');
  });

  it('полный цикл: add_participant → add_expense → list_expenses → calculate_settlements', async () => {
    // Добавляем участников
    const p1 = await callTool('add_participant', { name: 'Егор' });
    expect(p1.success).toBe(true);
    const p2 = await callTool('add_participant', { name: 'Анна' });
    expect(p2.success).toBe(true);

    // Добавляем расход через реальный MCP-вызов
    const added = await callTool('add_expense', {
      title: 'Ужин в ресторане',
      amount_rubles: 3000,
      paid_by: 'Егор',
      participants: ['Егор', 'Анна'],
    });
    expect(added.success).toBe(true);

    // Читаем список
    const list = await callTool('list_expenses');
    const expenses = (list.data as { expenses: Array<Record<string, unknown>> }).expenses;
    expect(expenses).toHaveLength(1);
    expect(expenses[0].title).toBe('Ужин в ресторане');

    // Считаем взаиморасчёты кодом приложения
    const settlements = await callTool('calculate_settlements');
    const data = settlements.data as {
      balances: Array<{ name: string; net_kopecks: number }>;
      transfers: Array<{ from: { name: string }; to: { name: string }; amount_kopecks: number }>;
    };
    expect(data.transfers).toHaveLength(1);
    expect(data.transfers[0].from.name).toBe('Анна');
    expect(data.transfers[0].to.name).toBe('Егор');
    expect(data.transfers[0].amount_kopecks).toBe(150000);
  });

  it('данные реального MCP-клиента видны через HTTP API (общий storage)', async () => {
    // Расход уже добавлен предыдущим тестом через реальный MCP
    const res = await fetch(`${baseUrl}/api/expenses`);
    const expenses = (await res.json()) as Array<{ title: string }>;
    expect(expenses.some((e) => e.title === 'Ужин в ресторане')).toBe(true);
  });

  it('HTTP API → реальный MCP: данные веб-интерфейса видны MCP-клиенту', async () => {
    // Добавляем расход через REST API (путь веб-интерфейса)
    await fetch(`${baseUrl}/api/expenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Из веб-интерфейса',
        amountRubles: 999.99,
        paidBy: 'Анна',
        participants: ['Егор', 'Анна'],
      }),
    });
    // Реальный MCP-клиент видит его
    const list = await callTool('list_expenses');
    const expenses = (list.data as { expenses: Array<{ title: string; amount_kopecks: number }> }).expenses;
    const found = expenses.find((e) => e.title === 'Из веб-интерфейса');
    expect(found).toBeDefined();
    expect(found?.amount_kopecks).toBe(99999);
  });

  it('ошибка валидации возвращается как isError с понятным сообщением, сервер жив', async () => {
    const result = await client.callTool({
      name: 'add_expense',
      arguments: {
        title: 'Ошибка',
        amount_rubles: 100,
        paid_by: 'Несуществующий человек',
        participants: ['Егор'],
      },
    });
    expect(result.isError).toBe(true);
    const content = result.content as Array<{ text: string }>;
    const parsed = JSON.parse(content[0].text) as { success: boolean; error: { code: string } };
    expect(parsed.success).toBe(false);
    expect(parsed.error.code).toBe('PAYER_NOT_FOUND');

    // Сервер после ошибки продолжает работать
    const list = await callTool('list_expenses');
    expect(list.success).toBe(true);
  });

  it('неравное распределение через реальный MCP сохраняет копейки', async () => {
    const added = await callTool('add_expense', {
      title: 'Сувениры',
      amount_rubles: 100.03,
      paid_by: 'Анна',
      participants: ['Егор', 'Анна'],
      split_mode: 'custom',
      custom_shares_rubles: { Егор: 40.01, Анна: 60.02 },
    });
    expect(added.success).toBe(true);
    const list = await callTool('list_expenses');
    const expenses = (list.data as { expenses: Array<{ title: string; amount_kopecks: number }> }).expenses;
    const souvenir = expenses.find((e) => e.title === 'Сувениры');
    expect(souvenir?.amount_kopecks).toBe(10003);
  });
});
