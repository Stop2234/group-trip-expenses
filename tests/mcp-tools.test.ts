import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JsonFileStorage } from '../server/storage';
import { ExpenseService } from '../src/lib/service';
import { createToolHandlers } from '../server/mcp';

/**
 * Тесты MCP-инструментов.
 * Обработчики вызываются напрямую (минуя транспорт) — это те же функции,
 * которые регистрируются как MCP-инструменты.
 */

let storage: JsonFileStorage;
let service: ExpenseService;
let handlers: ReturnType<typeof createToolHandlers>;
let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'trip-expenses-test-'));
  storage = new JsonFileStorage(join(dir, 'data.json'));
  service = new ExpenseService(storage);
  handlers = createToolHandlers(service);
});

/** Парсит JSON из текстового блока MCP-результата */
function parseResult(result: { content: Array<{ text: string }> }): Record<string, unknown> {
  return JSON.parse(result.content[0].text) as Record<string, unknown>;
}

describe('MCP add_expense', () => {
  beforeEach(async () => {
    await service.addParticipant('Егор');
    await service.addParticipant('Анна');
    await service.addParticipant('Иван');
  });

  it('добавляет расход с равным распределением', async () => {
    const result = await handlers.add_expense({
      title: 'Ужин',
      amount_rubles: 3000,
      paid_by: 'Егор',
      participants: ['Егор', 'Анна', 'Иван'],
    });
    const parsed = parseResult(result);
    expect(parsed.success).toBe(true);
    const expense = (parsed.data as { expense: Record<string, unknown> }).expense;
    expect(expense.title).toBe('Ужин');
    expect(expense.amount_kopecks).toBe(300000);
    expect(expense.split_mode).toBe('equal');
    expect((expense.participant_ids as string[]).length).toBe(3);
    expect(result.isError).toBeUndefined();
  });

  it('сохраняет копейки', async () => {
    const result = await handlers.add_expense({
      title: 'Такси',
      amount_rubles: 350.5,
      paid_by: 'Анна',
      participants: ['Анна', 'Иван'],
    });
    const parsed = parseResult(result);
    expect(parsed.success).toBe(true);
    const expense = (parsed.data as { expense: Record<string, unknown> }).expense;
    expect(expense.amount_kopecks).toBe(35050);
    expect(expense.amount_rubles).toBe(350.5);
  });

  it('поддерживает неравное распределение', async () => {
    const result = await handlers.add_expense({
      title: 'Сувениры',
      amount_rubles: 2750,
      paid_by: 'Егор',
      participants: ['Егор', 'Анна'],
      split_mode: 'custom',
      custom_shares_rubles: { Егор: 1000, Анна: 1750 },
    });
    const parsed = parseResult(result);
    expect(parsed.success).toBe(true);
    const expense = (parsed.data as { expense: Record<string, unknown> }).expense;
    expect(expense.split_mode).toBe('custom');
    const shares = expense.custom_shares_kopecks as Record<string, number>;
    expect(Object.values(shares).reduce((a, b) => a + b, 0)).toBe(275000);
  });
});

describe('MCP add_expense — ошибки', () => {
  beforeEach(async () => {
    await service.addParticipant('Егор');
    await service.addParticipant('Анна');
  });

  it('возвращает ошибку при неизвестном плательщике', async () => {
    const result = await handlers.add_expense({
      title: 'Ужин',
      amount_rubles: 1000,
      paid_by: 'Петя',
      participants: ['Егор'],
    });
    expect(result.isError).toBe(true);
    const parsed = parseResult(result);
    expect(parsed.success).toBe(false);
    const error = (parsed.error as { code: string; message: string });
    expect(error.code).toBe('PAYER_NOT_FOUND');
    expect(error.message).toContain('Петя');
  });

  it('возвращает ошибку при отрицательной сумме', async () => {
    const result = await handlers.add_expense({
      title: 'Ужин',
      amount_rubles: -1000,
      paid_by: 'Егор',
      participants: ['Егор'],
    });
    expect(result.isError).toBe(true);
    const parsed = parseResult(result);
    expect(parsed.success).toBe(false);
  });

  it('возвращает ошибку при нулевой сумме', async () => {
    const result = await handlers.add_expense({
      title: 'Ужин',
      amount_rubles: 0,
      paid_by: 'Егор',
      participants: ['Егор'],
    });
    expect(result.isError).toBe(true);
  });

  it('возвращает ошибку при неизвестном участнике', async () => {
    const result = await handlers.add_expense({
      title: 'Ужин',
      amount_rubles: 1000,
      paid_by: 'Егор',
      participants: ['Егор', 'Петя'],
    });
    expect(result.isError).toBe(true);
    const parsed = parseResult(result);
    expect((parsed.error as { code: string }).code).toBe('PARTICIPANT_NOT_FOUND');
  });

  it('возвращает ошибку при пустом списке участников', async () => {
    const result = await handlers.add_expense({
      title: 'Ужин',
      amount_rubles: 1000,
      paid_by: 'Егор',
      participants: [],
    });
    expect(result.isError).toBe(true);
    const parsed = parseResult(result);
    expect((parsed.error as { code: string }).code).toBe('NO_PARTICIPANTS');
  });

  it('возвращает ошибку при несовпадении суммы долей', async () => {
    const result = await handlers.add_expense({
      title: 'Сувениры',
      amount_rubles: 1000,
      paid_by: 'Егор',
      participants: ['Егор', 'Анна'],
      split_mode: 'custom',
      custom_shares_rubles: { Егор: 400, Анна: 500 },
    });
    expect(result.isError).toBe(true);
    const parsed = parseResult(result);
    expect((parsed.error as { code: string }).code).toBe('SHARES_MISMATCH');
  });

  it('НЕ повреждает данные после ошибки', async () => {
    await handlers.add_expense({
      title: 'Корректный',
      amount_rubles: 500,
      paid_by: 'Егор',
      participants: ['Егор'],
    });
    await handlers.add_expense({
      title: 'Ошибочный',
      amount_rubles: 100,
      paid_by: 'Несуществующий',
      participants: ['Егор'],
    });
    const state = await service.getState();
    expect(state.expenses).toHaveLength(1);
    expect(state.expenses[0].title).toBe('Корректный');
  });

  it('возвращает ошибку при дубликате участника', async () => {
    const result = await handlers.add_expense({
      title: 'Ужин',
      amount_rubles: 1000,
      paid_by: 'Егор',
      participants: ['Егор', 'Егор'],
    });
    expect(result.isError).toBe(true);
    const parsed = parseResult(result);
    expect((parsed.error as { code: string }).code).toBe('DUPLICATE_PARTICIPANT');
  });

  it('возвращает ошибку при сумме с более чем двумя знаками после запятой', async () => {
    const result = await handlers.add_expense({
      title: 'Ужин',
      amount_rubles: 100.555,
      paid_by: 'Егор',
      participants: ['Егор'],
    });
    expect(result.isError).toBe(true);
    const parsed = parseResult(result);
    expect((parsed.error as { code: string }).code).toBe('INVALID_AMOUNT');
  });
});

describe('MCP list_expenses', () => {
  it('возвращает пустой список без расходов', async () => {
    const result = await handlers.list_expenses();
    const parsed = parseResult(result);
    expect(parsed.success).toBe(true);
    expect((parsed.data as { expenses: unknown[] }).expenses).toHaveLength(0);
  });

  it('возвращает добавленные расходы с именами участников', async () => {
    await service.addParticipant('Егор');
    await service.addParticipant('Анна');
    await handlers.add_expense({
      title: 'Ужин',
      amount_rubles: 3000,
      paid_by: 'Егор',
      participants: ['Егор', 'Анна'],
    });
    const result = await handlers.list_expenses();
    const parsed = parseResult(result);
    const expenses = (parsed.data as { expenses: Array<Record<string, unknown>> }).expenses;
    expect(expenses).toHaveLength(1);
    expect(expenses[0].title).toBe('Ужин');
    expect((expenses[0].paid_by as { name: string }).name).toBe('Егор');
  });
});

describe('MCP calculate_settlements', () => {
  it('рассчитывает балансы и переводы кодом приложения', async () => {
    await service.addParticipant('Егор');
    await service.addParticipant('Анна');
    // Егор заплатил 3000, делится поровну на двоих: Анна должна Егору 1500
    await handlers.add_expense({
      title: 'Ужин',
      amount_rubles: 3000,
      paid_by: 'Егор',
      participants: ['Егор', 'Анна'],
    });
    const result = await handlers.calculate_settlements();
    const parsed = parseResult(result);
    expect(parsed.success).toBe(true);
    const data = parsed.data as {
      balances: Array<{ name: string; net_kopecks: number }>;
      transfers: Array<{ from: { name: string }; to: { name: string }; amount_kopecks: number }>;
    };
    const egor = data.balances.find((b) => b.name === 'Егор');
    const anna = data.balances.find((b) => b.name === 'Анна');
    expect(egor?.net_kopecks).toBe(150000);
    expect(anna?.net_kopecks).toBe(-150000);
    expect(data.transfers).toHaveLength(1);
    expect(data.transfers[0].from.name).toBe('Анна');
    expect(data.transfers[0].to.name).toBe('Егор');
    expect(data.transfers[0].amount_kopecks).toBe(150000);
  });

  it('закрывает долги с точностью до копейки', async () => {
    await service.addParticipant('А');
    await service.addParticipant('Б');
    await service.addParticipant('В');
    await handlers.add_expense({
      title: 'Трата А',
      amount_rubles: 100.01,
      paid_by: 'А',
      participants: ['А', 'Б', 'В'],
    });
    await handlers.add_expense({
      title: 'Трата Б',
      amount_rubles: 55.55,
      paid_by: 'Б',
      participants: ['А', 'Б', 'В'],
    });
    const result = await handlers.calculate_settlements();
    const parsed = parseResult(result);
    const data = parsed.data as {
      balances: Array<{ net_kopecks: number }>;
      transfers: Array<{ amount_kopecks: number }>;
    };
    // Сумма балансов должна быть нулевой
    const totalNet = data.balances.reduce((sum, b) => sum + b.net_kopecks, 0);
    expect(totalNet).toBe(0);
    // Сумма переводов должна закрывать все долги
    const totalTransfers = data.transfers.reduce((sum, t) => sum + t.amount_kopecks, 0);
    const totalDebt = data.balances.filter((b) => b.net_kopecks < 0).reduce((sum, b) => sum + -b.net_kopecks, 0);
    expect(totalTransfers).toBe(totalDebt);
  });
});
