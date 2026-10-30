import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ExpenseService } from '../src/lib/service';
import type { ExpenseInput } from '../src/lib/service';
import { formatMoney, toRubles } from '../src/lib/money';

/**
 * MCP-сервер приложения «Расходы группы после поездки».
 *
 * ВАЖНО: инструменты НЕ реализуют собственную денежную логику.
 * Все расчёты (доли, балансы, взаиморасчёты) выполняет общий
 * ExpenseService — тот же код, что используется веб-интерфейсом
 * через REST API. Хранилище у обоих путей одно.
 */

/** Плоский результат для MCP-инструмента */
interface ToolResult {
  [x: string]: unknown;
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

/** Упаковывает данные в успешный MCP-результат (JSON в текстовом блоке) */
export function toolOk(data: unknown): ToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify({ success: true, ...wrap(data) }, null, 2) }],
  };
}

function wrap(data: unknown): Record<string, unknown> {
  if (data && typeof data === 'object' && !Array.isArray(data) && 'data' in (data as object)) {
    return data as Record<string, unknown>;
  }
  return { data };
}

/** Упаковывает ошибку в MCP-результат с isError */
export function toolError(code: string, message: string): ToolResult {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ success: false, error: { code, message } }, null, 2),
      },
    ],
    isError: true,
  };
}

/** Вход add_expense */
export interface AddExpenseArgs {
  title: string;
  amount_rubles: number;
  paid_by: string;
  participants: string[];
  split_mode?: 'equal' | 'custom';
  custom_shares_rubles?: Record<string, number>;
}

/**
 * Обработчики MCP-инструментов.
 * Выделены в отдельные функции, чтобы тесты могли вызывать их напрямую,
 * минуя транспорт.
 */
export function createToolHandlers(service: ExpenseService) {
  return {
    async add_expense(args: AddExpenseArgs): Promise<ToolResult> {
      const input: ExpenseInput = {
        title: args.title,
        amountRubles: args.amount_rubles,
        paidBy: args.paid_by,
        participants: args.participants,
        splitMode: args.split_mode ?? 'equal',
        customSharesRubles: args.custom_shares_rubles,
      };
      const result = await service.addExpense(input);
      if (!result.success) {
        return toolError(result.error.code, result.error.message);
      }
      const e = result.data;
      return toolOk({
        expense: {
          id: e.id,
          title: e.title,
          amount_kopecks: e.amountKopecks,
          amount_rubles: toRubles(e.amountKopecks),
          amount_display: formatMoney(e.amountKopecks),
          paid_by_id: e.paidById,
          participant_ids: e.participantIds,
          split_mode: e.splitMode,
          custom_shares_kopecks: e.customShares ?? null,
        },
      });
    },

    async list_expenses(): Promise<ToolResult> {
      const state = await service.getState();
      const names = new Map(state.participants.map((p) => [p.id, p.name]));
      return toolOk({
        expenses: state.expenses.map((e) => ({
          id: e.id,
          title: e.title,
          amount_kopecks: e.amountKopecks,
          amount_rubles: toRubles(e.amountKopecks),
          amount_display: formatMoney(e.amountKopecks),
          paid_by: { id: e.paidById, name: names.get(e.paidById) ?? 'неизвестен' },
          participants: e.participantIds.map((id) => ({ id, name: names.get(id) ?? 'неизвестен' })),
          split_mode: e.splitMode,
          custom_shares_kopecks: e.customShares ?? null,
        })),
        total_count: state.expenses.length,
      });
    },

    async calculate_settlements(): Promise<ToolResult> {
      const state = await service.getState();
      const { balances, transfers, totalExpensesKopecks } = await service.getSettlements();
      const names = new Map(state.participants.map((p) => [p.id, p.name]));
      return toolOk({
        total_expenses_kopecks: totalExpensesKopecks,
        total_expenses_rubles: toRubles(totalExpensesKopecks),
        total_expenses_display: formatMoney(totalExpensesKopecks),
        balances: balances.map((b) => ({
          participant_id: b.participantId,
          name: names.get(b.participantId) ?? 'неизвестен',
          paid_kopecks: b.paid,
          paid_rubles: toRubles(b.paid),
          owed_kopecks: b.owed,
          owed_rubles: toRubles(b.owed),
          net_kopecks: b.net,
          net_rubles: toRubles(b.net),
          net_display: formatMoney(b.net),
        })),
        transfers: transfers.map((t) => ({
          from: { id: t.fromId, name: names.get(t.fromId) ?? 'неизвестен' },
          to: { id: t.toId, name: names.get(t.toId) ?? 'неизвестен' },
          amount_kopecks: t.amountKopecks,
          amount_rubles: toRubles(t.amountKopecks),
          amount_display: formatMoney(t.amountKopecks),
        })),
        note: 'Балансы и переводы рассчитаны кодом приложения (целые копейки). Положительный net — участнику должны вернуть деньги, отрицательный — он должен доплатить.',
      });
    },

    async list_participants(): Promise<ToolResult> {
      const state = await service.getState();
      return toolOk({
        participants: state.participants.map((p) => ({ id: p.id, name: p.name })),
        total_count: state.participants.length,
      });
    },

    async add_participant(args: { name: string }): Promise<ToolResult> {
      const result = await service.addParticipant(args.name);
      if (!result.success) {
        return toolError(result.error.code, result.error.message);
      }
      return toolOk({ participant: { id: result.data.id, name: result.data.name } });
    },

    async remove_expense(args: { expense_id: string }): Promise<ToolResult> {
      const result = await service.removeExpense(args.expense_id);
      if (!result.success) {
        return toolError(result.error.code, result.error.message);
      }
      return toolOk({ removed: { id: result.data.id, title: result.data.title } });
    },

    async load_demo(): Promise<ToolResult> {
      const state = await service.loadDemo();
      return toolOk({
        participants: state.participants.length,
        expenses: state.expenses.length,
        note: 'Демонстрационные данные загружены в общее хранилище. Веб-интерфейс увидит их после обновления страницы.',
      });
    },

    async get_summary(): Promise<ToolResult> {
      const summary = await service.getSummary();
      const names = new Map(summary.participants.map((p) => [p.id, p.name]));
      return toolOk({
        participants: summary.participants.map((p) => ({ id: p.id, name: p.name })),
        expenses_count: summary.expenses.length,
        total_expenses_kopecks: summary.totalExpensesKopecks,
        total_expenses_display: formatMoney(summary.totalExpensesKopecks),
        balances: summary.balances.map((b) => ({
          name: names.get(b.participantId) ?? 'неизвестен',
          paid_rubles: toRubles(b.paid),
          owed_rubles: toRubles(b.owed),
          net_display: formatMoney(b.net),
        })),
        transfers: summary.transfers.map((t) => ({
          from: names.get(t.fromId) ?? 'неизвестен',
          to: names.get(t.toId) ?? 'неизвестен',
          amount_display: formatMoney(t.amountKopecks),
        })),
      });
    },
  };
}

export type ToolHandlers = ReturnType<typeof createToolHandlers>;

/**
 * Регистрирует инструменты на McpServer.
 * Схемы строгие: участники и сумма обязательны.
 */
export function registerMcpTools(server: McpServer, handlers: ToolHandlers): void {
  server.registerTool(
    'add_expense',
    {
      title: 'Добавить расход',
      description:
        'Добавляет расход в общее хранилище поездки (тот же файл, что видит веб-интерфейс). ' +
        'ВАЖНО О неоднозначности: если из запроса пользователя невозможно однозначно определить ' +
        'ВСЕ участники распределения (кому принадлежит расход) или способ деления (равный/неравный, ' +
        'конкретные доли) — СНАЧАЛА запроси уточнение у пользователя и НЕ вызывай инструмент с ' +
        'придуманными значениями. Плательщик (paid_by) и участники (participants) указываются по именам ' +
        'или ID; суммы — в рублях (amount_rubles), допустимы копейки. Доли при split_mode=custom ' +
        'задаются в рублях и в сумме должны точно равняться сумме расхода. ' +
        'Денежные расчёты выполняет код приложения.',
      inputSchema: {
        title: z.string().min(1).describe('Название расхода, например «Ужин в ресторане»'),
        amount_rubles: z
          .number()
          .positive()
          .describe('Сумма расхода в рублях, строго положительная. Допустимы копейки (например 3200.50).'),
        paid_by: z.string().min(1).describe('Кто оплатил: имя или ID участника'),
        participants: z
          .array(z.string().min(1))
          .min(1)
          .describe(
            'Между кем распределяется расход: список имён или ID участников. ' +
              'Если из контекста непонятно, между кем делить — спроси пользователя, не передавай придуманные значения.',
          ),
        split_mode: z
          .enum(['equal', 'custom'])
          .optional()
          .describe('Способы распределения: equal (поровну) или custom (неравные доли). По умолчанию equal.'),
        custom_shares_rubles: z
          .record(z.string(), z.number())
          .optional()
          .describe(
            'Для split_mode=custom: суммы в рублях по каждому участнику ' +
              '(ключ — имя или ID участника). Сумма долей должна точно равняться amount_rubles.',
          ),
      },
    },
    async ({ title, amount_rubles, paid_by, participants, split_mode, custom_shares_rubles }) =>
      handlers.add_expense({
        title,
        amount_rubles,
        paid_by,
        participants,
        split_mode,
        custom_shares_rubles,
      }),
  );

  server.registerTool(
    'list_expenses',
    {
      title: 'Список расходов',
      description:
        'Возвращает все расходы поездки из общего хранилища (того же, что видит веб-интерфейс). ' +
        'Для каждого расхода: ID, название, сумма (копейки, рубли и отформатированная строка), ' +
        'плательщик, участники, способ распределения и доли.',
      inputSchema: {},
    },
    async () => handlers.list_expenses(),
  );

  server.registerTool(
    'calculate_settlements',
    {
      title: 'Рассчитать взаиморасчёты',
      description:
        'Вычисляет балансы участников и рекомендуемые переводы для закрытия долгов. ' +
        'Расчёт выполняет код приложения в целых копейках — не вычисляй долги самостоятельно. ' +
        'Возвращает: сколько каждый заплатил, сколько должен был оплатить, итоговый баланс ' +
        'и список переводов (кто кому и сколько).',
      inputSchema: {},
    },
    async () => handlers.calculate_settlements(),
  );

  server.registerTool(
    'list_participants',
    {
      title: 'Список участников',
      description: 'Возвращает участников поездки (имена и ID) из общего хранилища.',
      inputSchema: {},
    },
    async () => handlers.list_participants(),
  );

  server.registerTool(
    'add_participant',
    {
      title: 'Добавить участника',
      description:
        'Добавляет нового участника поездки. Имя должно быть непустым и не повторять существующее.',
      inputSchema: {
        name: z.string().min(1).describe('Имя участника'),
      },
    },
    async ({ name }) => handlers.add_participant({ name }),
  );

  server.registerTool(
    'remove_expense',
    {
      title: 'Удалить расход',
      description: 'Удаляет расход по ID. ID можно получить из list_expenses.',
      inputSchema: {
        expense_id: z.string().min(1).describe('ID расхода'),
      },
    },
    async ({ expense_id }) => handlers.remove_expense({ expense_id }),
  );

  server.registerTool(
    'load_demo',
    {
      title: 'Загрузить демо-данные',
      description:
        'Заменяет текущие данные демонстрационным набором (участники и расходы с разными плательщиками, ' +
        'неравное распределение). Данные пишутся в общее хранилище — веб-интерфейс увидит их после обновления.',
      inputSchema: {},
    },
    async () => handlers.load_demo(),
  );

  server.registerTool(
    'get_summary',
    {
      title: 'Итоговая статистика',
      description:
        'Возвращает сводку поездки: участники, количество расходов, общая сумма, балансы и переводы. ' +
        'Все числа рассчитаны кодом приложения.',
      inputSchema: {},
    },
    async () => handlers.get_summary(),
  );
}

/** Создаёт MCP-сервер с зарегистрированными инструментами */
export function createMcpServer(handlers: ToolHandlers): McpServer {
  const server = new McpServer({
    name: 'trip-expenses',
    version: '1.0.0',
  });
  registerMcpTools(server, handlers);
  return server;
}
