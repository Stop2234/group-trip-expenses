# Правила проекта: скилл trip-expense-report

Короткие правила для агента, работающего в этом репозитории.

## Что делает скилл

`trip-expense-report` **читает** данные поездки и собирает Markdown-отчёт.
Он не изменяет приложение.

## Можно

- читать `GET /api/state`, `GET /api/settlements`, `GET /api/summary`,
  `GET /api/expenses`, `GET /api/participants`;
- вызывать MCP-инструменты чтения: `list_participants`, `list_expenses`,
  `calculate_settlements`, `get_summary`;
- читать `data/*.json` и файлы `knowledge/`;
- писать отчёт в `reports/` и запускать проверки из `tools/`.

## Нельзя (через скилл)

- добавлять, изменять или удалять участников и расходы
  (`add_expense`, `add_participant`, `remove_expense`, `load_demo`,
  `POST/PUT/DELETE /api/...`);
- выполнять денежные переводы;
- править данные приложения, чтобы «сойдётся» в отчёте;
- выдумывать числа, которых нет в источнике.

## Как писать отчёт

1. Шаблон: `.opencode/skills/trip-expense-report/templates/report-template.md`.
2. Требования: `STYLE_GUIDE.md` — ровно пять, каждое с способом проверки.
3. Денежная корректность проверяется **отдельно** от оформления.

## Проверки

```bash
node tools/check-style.mjs reports/<отчёт>.md                 # 5 требований стайлгайда
node tools/check-numbers.mjs --state data/<файл>.json \
                             --report reports/<отчёт>.md      # арифметика в копейках
```

Отчёт считается готовым, когда `check-style` даёт `5/5`, а `check-numbers` — `0` расхождений.
Если какая-то проверка не выполнялась — так и напиши, не выдавай её за пройденную.

## База знаний

`knowledge/INDEX.md` → читать только нужные справки, по мере надобности.
Основную базу не править; эксперименты с устаревшими записями — только в
`knowledge/_stale-demo/`.

## Данные и запуск

- хранилище — `data/*.json` (путь задаётся `DATA_FILE`);
- порт backend по умолчанию `3001`, но он может быть занят другим проектом —
  тогда запускай через `PORT=3101 npm run dev:server` и указывай этот адрес в
  отчёте;
- оба интерфейса (REST и MCP) читают одно и то же хранилище.
