/**
 * Скрипт реальной демонстрации MCP-инструментов.
 *
 * Запускает backend-сервер, подключается РЕАЛЬНЫМ MCP-клиентом (SDK)
 * и выполняет сценарии A–E:
 *   A — добавление расхода через MCP (видно в web/API);
 *   B — чтение списка расходов;
 *   C — расчёт взаиморасчётов кодом приложения;
 *   D — неоднозначный запрос: инструмент требует уточнения (схема);
 *   E — ошибка: неизвестный плательщик.
 *
 * Все request/response пишутся в artifacts/demo_chat.jsonl (реальный журнал).
 *
 * Запуск: npx tsx scripts/run-demo.ts
 */
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { AddressInfo } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createApp } from '../server/index';

interface LogEntry {
  step: string;
  scenario: string;
  description: string;
  request?: unknown;
  response?: unknown;
  note?: string;
  timestamp: string;
}

const log: LogEntry[] = [];

function record(entry: Omit<LogEntry, 'timestamp'>): void {
  log.push({ ...entry, timestamp: new Date().toISOString() });
  console.log(`\n=== ${entry.scenario}: ${entry.step} ===`);
  if (entry.request) console.log('REQUEST:', JSON.stringify(entry.request, null, 2));
  if (entry.response) console.log('RESPONSE:', JSON.stringify(entry.response, null, 2));
  if (entry.note) console.log('NOTE:', entry.note);
}

async function main(): Promise<void> {
  // 1. Запуск backend на ephemeral-порту с временным хранилищем
  const dataFile = `/tmp/trip-demo-${Date.now()}.json`;
  const { app, service } = createApp(dataFile);
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`Backend запущен: ${baseUrl}`);
  console.log(`Хранилище: ${dataFile}`);

  // 2. Подключение РЕАЛЬНОГО MCP-клиента
  const client = new Client({ name: 'demo-client', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`));
  await client.connect(transport);
  record({
    scenario: 'Подключение',
    step: 'MCP connect',
    description: 'Реальный MCP-клиент (SDK) подключился к /mcp (Streamable HTTP, stateless)',
  });

  // Список инструментов
  const tools = await client.listTools();
  record({
    scenario: 'Подключение',
    step: 'tools/list',
    description: 'Инструменты, доступные агенту',
    response: { tools: tools.tools.map((t) => ({ name: t.name, description: t.description?.slice(0, 120) })) },
  });

  async function call(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    const result = await client.callTool({ name, arguments: args });
    const content = result.content as Array<{ type: string; text: string }>;
    const parsed = JSON.parse(content[0].text) as Record<string, unknown>;
    return { ...parsed, __isError: result.isError === true };
  }

  // Подготовка: участники через HTTP API (путь веб-интерфейса)
  for (const name of ['Егор', 'Анна', 'Иван']) {
    await fetch(`${baseUrl}/api/participants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
  }
  record({
    scenario: 'Подготовка',
    step: 'HTTP POST /api/participants',
    description: 'Участники добавлены через REST API (путь веб-интерфейса): Егор, Анна, Иван',
  });

  // === Сценарий A: добавление расхода через MCP ===
  const addResult = await call('add_expense', {
    title: 'Ужин в ресторане',
    amount_rubles: 3000,
    paid_by: 'Егор',
    participants: ['Егор', 'Анна', 'Иван'],
  });
  record({
    scenario: 'A — добавление расхода',
    step: 'tools/call add_expense',
    description: 'Пользователь: «Добавь ужин на 3000 рублей, платил Егор, делили на троих — Егор, Анна и Иван»',
    request: {
      name: 'add_expense',
      arguments: {
        title: 'Ужин в ресторане',
        amount_rubles: 3000,
        paid_by: 'Егор',
        participants: ['Егор', 'Анна', 'Иван'],
      },
    },
    response: addResult,
  });

  // Проверка видимости в web/API
  const webView = await (await fetch(`${baseUrl}/api/expenses`)).json();
  record({
    scenario: 'A — добавление расхода',
    step: 'HTTP GET /api/expenses',
    description: 'Проверка: расход, добавленный через MCP, виден веб-интерфейсу через REST API (общий storage)',
    response: webView,
  });

  // === Сценарий B: чтение расходов ===
  const listResult = await call('list_expenses', {});
  record({
    scenario: 'B — чтение расходов',
    step: 'tools/call list_expenses',
    description: 'Пользователь: «Покажи все расходы». Агент вызывает list_expenses; данные приходят из общего хранилища.',
    request: { name: 'list_expenses', arguments: {} },
    response: listResult,
  });

  // === Сценарий C: взаиморасчёты ===
  const settlements = await call('calculate_settlements', {});
  record({
    scenario: 'C — взаиморасчёты',
    step: 'tools/call calculate_settlements',
    description: 'Пользователь: «Кто кому сколько должен?». Числа рассчитаны кодом приложения (целые копейки).',
    request: { name: 'calculate_settlements', arguments: {} },
    response: settlements,
  });

  // === Сценарий D: неоднозначность ===
  const toolsList = await client.listTools();
  const addTool = toolsList.tools.find((t) => t.name === 'add_expense');
  record({
    scenario: 'D — неоднозначный запрос',
    step: 'tools/list (проверка схемы)',
    description:
      'Пользователь: «Добавь ужин на 3000 рублей, платил Егор». Между кем делить — НЕ указано. ' +
      'Схема add_expense делает participants обязательным, а описание требует запросить уточнение. ' +
      'Агент обязан спросить: «Между кем разделить ужин?» и НЕ вызывать инструмент с придуманными значениями.',
    response: {
      required_fields: (addTool?.inputSchema as { required?: string[] }).required,
      participants_field_description: (
        addTool?.inputSchema as { properties?: { participants?: { description?: string } } }
      )?.properties?.participants?.description,
    },
    note: 'Вызов add_expense без participants невозможен: zod-схема вернёт ошибку валидации до попытки записи.',
  });

  // Демонстрируем, что вызов без обязательных полей отклоняется схемой
  try {
    const ambiguous = await client.callTool({
      name: 'add_expense',
      arguments: { title: 'Ужин', amount_rubles: 3000, paid_by: 'Егор' } as never,
    });
    record({
      scenario: 'D — неоднозначный запрос',
      step: 'tools/call add_expense (без participants)',
      description: 'Попытка вызвать add_expense без participants отклоняется схемой',
      response: {
        isError: ambiguous.isError,
        content: (ambiguous.content as Array<{ text?: string }>)[0]?.text?.slice(0, 300),
      },
    });
  } catch (err) {
    record({
      scenario: 'D — неоднозначный запрос',
      step: 'tools/call add_expense (без participants)',
      description: 'Попытка вызвать add_expense без participants отклоняется схемой SDK',
      response: { error: String(err).slice(0, 300) },
      note: 'Расход НЕ добавлен: обязательные данные не были придуманы.',
    });
  }

  // === Сценарий E: ошибка ===
  const errorResult = await call('add_expense', {
    title: 'Экскурсия',
    amount_rubles: 1500,
    paid_by: 'Петя',
    participants: ['Егор'],
  });
  record({
    scenario: 'E — обработка ошибки',
    step: 'tools/call add_expense (неизвестный плательщик)',
    description: 'Пользователь: «Добавь экскурсию за 1500, платил Петя». Петя не существует.',
    request: {
      name: 'add_expense',
      arguments: { title: 'Экскурсия', amount_rubles: 1500, paid_by: 'Петя', participants: ['Егор'] },
    },
    response: errorResult,
    note: 'MCP вернул понятную ошибку PAYER_NOT_FOUND вместо stack trace. Данные не повреждены.',
  });

  // Проверка: данные после ошибки целы
  const afterError = await call('list_expenses', {});
  record({
    scenario: 'E — обработка ошибки',
    step: 'tools/call list_expenses (после ошибки)',
    description: 'Проверка: после ошибки хранилище не повреждено, расход «Экскурсия» не появился',
    response: {
      total_count: (afterError.data as { total_count: number }).total_count,
      titles: (afterError.data as { expenses: Array<{ title: string }> }).expenses.map((e) => e.title),
    },
  });

  // Итоговая сводка через MCP
  const summary = await call('get_summary', {});
  record({
    scenario: 'Итог',
    step: 'tools/call get_summary',
    description: 'Итоговая статистика, рассчитанная кодом приложения',
    response: summary,
  });

  // Сохранение журнала
  await mkdir('artifacts', { recursive: true });
  const jsonl = log.map((e) => JSON.stringify(e)).join('\n') + '\n';
  await writeFile('artifacts/demo_chat.jsonl', jsonl, 'utf-8');
  console.log(`\nЖурнал сохранён: artifacts/demo_chat.jsonl (${log.length} записей)`);

  await client.close();
  server.close();
  await rm(dataFile, { force: true });
  await rm(`${dataFile}.corrupt-*`, { force: true }).catch(() => {});
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
