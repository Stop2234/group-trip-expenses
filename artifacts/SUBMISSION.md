# Материалы к сдаче: expenses-mcp

Задание: **Расходы поездки: управление через MCP** (`expenses-mcp`).

---

## summary

К приложению «Расходы группы после поездки» (React + TypeScript из one-shot
задания) добавлен backend с REST API и MCP-сервером. Главное архитектурное
изменение: данные переведены из browser localStorage в **единое серверное
хранилище** (JSON-файл `data/trip-data.json`), которым одинаково пользуются
веб-интерфейс (через REST API) и MCP-агент (через MCP-инструменты).

Что изменено относительно исходного one-shot приложения:

- **Backend** (`server/`): Express 5 — REST API на `/api/*` и MCP endpoint
  на `/mcp` (Streamable HTTP, stateless, официальный SDK
  `@modelcontextprotocol/sdk` 1.32.1).
- **Общее хранилище**: `JsonFileStorage` — единый JSON-файл с атомарной
  записью; localStorage удалён, других копий состояния нет.
- **Общий domain layer** (`src/lib/service.ts`): класс `ExpenseService` —
  участники, расходы, валидация, балансы, взаиморасчёты. И REST API, и MCP
  инструменты вызывают ОДИН И ТОТ ЖЕ сервис; денежные расчёты (целые
  копейки) выполняет код приложения, LLM долги не вычисляет.
- **MCP-инструменты** (`server/mcp.ts`): `add_expense`, `list_expenses`,
  `calculate_settlements`, `list_participants`, `add_participant`,
  `remove_expense`, `load_demo`, `get_summary`. Схема `add_expense` делает
  `participants` обязательным, описание требует уточнять у пользователя
  неоднозначные случаи, а не придумывать значения.
- **Frontend**: React UI переведён на REST API (`src/lib/api.ts`), state
  перечитывается после каждой мутации; кнопки демо/очистки работают через API.
- **Тесты**: 81 тест (47 прежних domain-тестов сохранены + 34 новых), включая
  интеграционные с реальным MCP-клиентом SDK поверх HTTP.

## run_instructions

```bash
npm install
npm run dev          # backend (3001) + frontend (5173)
```

Приложение: http://localhost:5173 (Vite проксирует `/api` и `/mcp` на backend).

Раздельный запуск:

```bash
npm run dev:server   # backend: http://127.0.0.1:3001
npm run dev:web      # frontend: http://localhost:5173
```

Production:

```bash
npm run build        # tsc + vite build → dist/
npm start            # backend на 3001 (отдаёт dist/ и API)
```

Тесты и проверки:

```bash
npm test             # 81 тест
npm run typecheck
npm run build
```

Переменные окружения: `PORT` (по умолчанию 3001), `DATA_FILE`
(по умолчанию `data/trip-data.json`).

## connection_instructions

1. Запустите backend:

```bash
npm run dev:server
```

MCP endpoint: `http://127.0.0.1:3001/mcp` — Streamable HTTP, stateless,
без API-ключей и OAuth.

2. Добавьте сервер в OpenCode (в `opencode.json`):

```json
{
  "mcp": {
    "servers": {
      "trip-expenses": {
        "type": "remote",
        "url": "http://127.0.0.1:3001/mcp"
      }
    }
  }
}
```

Или командой:

```bash
opencode mcp add --transport http trip-expenses http://127.0.0.1:3001/mcp
```

Порядок: сначала `npm run dev:server`, затем открыть OpenCode-сессию.
Проверка: `opencode mcp list` показывает `trip-expenses`.

Примеры запросов агенту после подключения:

- «Добавь ужин на 3000 рублей, платил Егор, делили на троих: Егор, Анна, Иван»;
- «Покажи все расходы»;
- «Кто кому сколько должен?»;
- «Загрузи демо-данные».

## verification_notes

Выполненные проверки (фактически, с результатами):

1. **Тесты**: `npm test` — **81 passed / 81** (5 файлов). Прежние 47 domain-тестов
   сохранены, добавлено 34: MCP-инструменты, ошибки, копейки, неравное
   распределение, shared storage, интеграция.
2. **TypeScript**: `npm run typecheck` — без ошибок.
3. **Production build**: `npm run build` — успешно (Vite, dist/ собран).
4. **Реальный запуск backend**: `npm run dev:server` — сервер поднялся,
   REST API и MCP endpoint отвечают.
5. **HTTP API вживую** (curl): `POST /api/demo`, `GET /api/state`
   (4 участника, 5 расходов демо), `POST /api/expenses` — расход
   «Проверка E2E» на 100.55 ₽ создан, `amountKopecks: 10055`.
6. **Реальные MCP-вызовы**:
   - через реальный MCP-клиент SDK (`tests/mcp-integration.test.ts`,
     7 тестов): initialize, tools/list, add_participant, add_expense,
     list_expenses, calculate_settlements, get_summary;
   - через curl (JSON-RPC/SSE): `initialize` → `serverInfo: trip-expenses`;
     `tools/list` → 8 инструментов; `tools/call add_participant`
     («Тестовый»); `tools/call add_expense` («MCP расход» 777.25 ₽ →
     `amount_kopecks: 77725`).
7. **Общие данные web ↔ MCP** (доказательства):
   - **MCP → HTTP**: расход, добавленный MCP `add_expense` («MCP расход»,
     id `aa03f797-…`), увиден через `GET /api/state`: тот же id и сумма
     77725 копеек — одна запись в одном файле;
   - **HTTP → MCP**: расход «Из веб-интерфейса» (999.99 ₽), созданный
     `POST /api/expenses`, возвращён реальным MCP `list_expenses`
     (`amount_kopecks: 99999`) — тест `tests/mcp-integration.test.ts`;
   - в тестах то же доказано для участников, демо-данных и очистки;
   - персистентность: данные переживают перезапуск сервиса на том же файле
     (тест + реальный перезапуск E2E).
8. **Неоднозначный запрос**: схема `add_expense` требует `participants`
   (обязательное поле, `required` в JSON Schema). Реальная попытка вызова без
   `participants` отклонена до записи: `MCP error -32602: Input validation
   error: … expected array, received undefined at participants` (журнал
   `artifacts/demo_chat.jsonl`, сценарий D). Описание инструмента требует
   запросить уточнение у пользователя, а не придумывать значения.
9. **Обработка ошибки**: реальный вызов с неизвестным плательщиком вернул
   `{"success": false, "error": {"code": "PAYER_NOT_FOUND", "message":
   "Плательщик «Петя» не найден"}}` c `isError: true`; последующий
   `list_expenses` подтвердил, что данные не повреждены (сценарий E).
10. **Демо-данные**: загружены через HTTP (`POST /api/demo`) и через MCP
    (`load_demo`) — оба пути пишут в один файл; веб-интерфейс видит данные
    после обновления.

Реальный журнал MCP-вызовов с request/response:
`artifacts/demo_chat.jsonl` (12 записей) и человекочитаемый
`artifacts/demo_chat.md`. Журнал сгенерирован скриптом `scripts/run-demo.ts`
официальным MCP-клиентом SDK — ничего не выдумывалось.

## artifacts

- ZIP проекта: `artifacts/expenses-mcp-project.zip`
- Демонстрация MCP (журнал реальных вызовов): `artifacts/demo_chat.jsonl`
- Демонстрация MCP (человекочитаемая): `artifacts/demo_chat.md`
- Настоящий файл: `artifacts/SUBMISSION.md`

## remaining_issues

- Данные хранятся локально в одном JSON-файле, синхронизации между
  устройствами нет (соответствует заданию — локальный MCP допустим).
- Веб-UI не имеет собственного WebSocket-push: после изменений через MCP
  интерфейс показывает новые данные после нажатия «Обновить» или обновления
  страницы. Данные при этом одни и те же.
- MCP endpoint stateless: сессии между запросами не сохраняются (особенность
  выбранного транспорта, на локальном запуске не влияет).
- Остальное необходимое выполнено: backend, общее хранилище, MCP-инструменты,
  неоднозначный запрос, обработка ошибок, тесты, README с инструкцией
  подключения.
