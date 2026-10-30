# Демонстрация MCP: реальные вызовы инструментов

Журнал содержит **реальные** request/response MCP-инструментов локального сервера
`trip-expenses`, выполненные через официальный MCP SDK-клиент по транспорту
Streamable HTTP (`http://127.0.0.1:<port>/mcp`).

Машинно-читаемый журнал тех же вызовов: [`demo_chat.jsonl`](demo_chat.jsonl).

Скрипт генерации журнала: `scripts/run-demo.ts` (запуск: `npx tsx scripts/run-demo.ts`).

Окружение: Node.js v22.23.3, @modelcontextprotocol/sdk 1.32.1.

---

## Подключение (реальный MCP-клиент)

```
MCP connect: Client({ name: "demo-client" }) + StreamableHTTPClientTransport(http://127.0.0.1:<port>/mcp)
```

`tools/list` вернул инструменты:
`add_expense`, `list_expenses`, `calculate_settlements`, `list_participants`,
`add_participant`, `remove_expense`, `load_demo`, `get_summary`.

---

## Подготовка

Участники добавлены через REST API (путь веб-интерфейса):

```
POST /api/participants {"name":"Егор"}
POST /api/participants {"name":"Анна"}
POST /api/participants {"name":"Иван"}
```

---

## Сценарий A — добавление расхода через MCP

**Пользователь:** «Добавь ужин на 3000 рублей, платил Егор, делили на троих — Егор, Анна и Иван».

**Запрос агента (реальный tools/call):**

```json
{
  "name": "add_expense",
  "arguments": {
    "title": "Ужин в ресторане",
    "amount_rubles": 3000,
    "paid_by": "Егор",
    "participants": ["Егор", "Анна", "Иван"]
  }
}
```

**Ответ сервера:**

```json
{
  "success": true,
  "data": {
    "expense": {
      "id": "688cc164-50c0-44a8-bf45-713def76e263",
      "title": "Ужин в ресторане",
      "amount_kopecks": 300000,
      "amount_rubles": 3000,
      "amount_display": "3 000,00 ₽",
      "paid_by_id": "f60c30be-…",
      "participant_ids": ["f60c30be-…", "3b10aebc-…", "c2ffa139-…"],
      "split_mode": "equal",
      "custom_shares_kopecks": null
    }
  }
}
```

### Проверка общих данных: MCP → web

Сразу после вызова MCP — чтение через REST API (его использует веб-интерфейс):

```
GET /api/expenses
```

```json
[{
  "id": "688cc164-50c0-44a8-bf45-713def76e263",
  "title": "Ужин в ресторане",
  "amountKopecks": 300000,
  "paidById": "f60c30be-…",
  "participantIds": ["f60c30be-…", "3b10aebc-…", "c2ffa139-…"],
  "splitMode": "equal"
}]
```

**ID совпадает** (`688cc164-…`) — одна и та же запись в одном хранилище,
а не две копии.

---

## Сценарий B — чтение расходов

**Пользователь:** «Покажи все расходы».

**tools/call:**

```json
{ "name": "list_expenses", "arguments": {} }
```

**Ответ:** список расходов с плательщиком, участниками, суммой в копейках,
рублях и отформатированной строкой. Данные читаются из того же JSON-файла,
который обновляет REST API.

---

## Сценарий C — взаиморасчёты (рассчитывает код приложения)

**Пользователь:** «Кто кому сколько должен?».

**tools/call:**

```json
{ "name": "calculate_settlements", "arguments": {} }
```

**Ответ:**

```json
{
  "success": true,
  "data": {
    "total_expenses_kopecks": 300000,
    "total_expenses_display": "3 000,00 ₽",
    "balances": [
      { "name": "Егор", "paid_rubles": 3000, "owed_rubles": 1000, "net_display": "2 000,00 ₽" },
      { "name": "Анна", "paid_rubles": 0,    "owed_rubles": 1000, "net_display": "−1 000,00 ₽" },
      { "name": "Иван", "paid_rubles": 0,    "owed_rubles": 1000, "net_display": "−1 000,00 ₽" }
    ],
    "transfers": [
      { "from": "Анна", "to": "Егор", "amount_display": "1 000,00 ₽" },
      { "from": "Иван", "to": "Егор", "amount_display": "1 000,00 ₽" }
    ]
  }
}
```

Числа посчитаны `ExpenseService` (общий доменный слой, целые копейки),
LLM долги не вычисляла.

---

## Сценарий D — неоднозначный запрос

**Пользователь:** «Добавь ужин на 3000 рублей, платил Егор».
Между кем делить — **не указано**.

1. Описание инструмента `add_expense` требует: если участники или способ деления
   не определяются однозначно — **сначала спросить пользователя** и не вызывать
   инструмент с придуманными значениями.
2. Схема делает `participants` **обязательным** полем:

```json
{ "required_fields": ["title", "amount_rubles", "paid_by", "participants"] }
```

3. Реальная попытка вызова без `participants` отклоняется **до записи**:

```
tools/call add_expense (без participants)
→ isError: true
→ "MCP error -32602: Input validation error: Invalid arguments for tool add_expense:
   Invalid input: expected array, received undefined at participants"
```

Расход не добавлен; придуманных участников не появилось. Агент обязан запросить
уточнение: «Между кем разделить ужин?».

---

## Сценарий E — обработка ошибки

**Пользователь:** «Добавь экскурсию за 1500, платил Петя». Петя не существует.

**tools/call:**

```json
{
  "name": "add_expense",
  "arguments": { "title": "Экскурсия", "amount_rubles": 1500, "paid_by": "Петя", "participants": ["Егор"] }
}
```

**Ответ (без stack trace):**

```json
{
  "success": false,
  "error": { "code": "PAYER_NOT_FOUND", "message": "Плательщик «Петя» не найден" }
}
```

**Проверка целостности данных после ошибки:**

```
tools/call list_expenses → total_count: 1, titles: ["Ужин в ресторане"]
```

Данные не повреждены, «Экскурсия» не появилась.

---

## Итоговая сводка (get_summary)

```json
{
  "expenses_count": 1,
  "total_expenses_display": "3 000,00 ₽",
  "balances": [
    { "name": "Егор", "net_display": "2 000,00 ₽" },
    { "name": "Анна", "net_display": "−1 000,00 ₽" },
    { "name": "Иван", "net_display": "−1 000,00 ₽" }
  ],
  "transfers": [
    { "from": "Анна", "to": "Егор", "amount_display": "1 000,00 ₽" },
    { "from": "Иван", "to": "Егор", "amount_display": "1 000,00 ₽" }
  ]
}
```

---

## Проверка общих данных: web → MCP

Выполнена в интеграционном тесте `tests/mcp-integration.test.ts`
(реальный MCP-клиент SDK):

1. `POST /api/expenses {"title":"Из веб-интерфейса","amountRubles":999.99,…}`
   (данные веб-интерфейса);
2. реальный `tools/call list_expenses` вернул этот расход:
   `amount_kopecks: 99999` — MCP видит изменения веб-интерфейса.

Тесты: **81 passed** (включая 7 интеграционных с реальным MCP-клиентом).
