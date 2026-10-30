# Учебная копия: исправление устаревшей записи

Задание требует показать исправление одной устаревшей записи **на учебной
копии**, не портя основную базу знаний.

- `before/project-map.md` — копия `knowledge/project-map.md` с сохранённой
  устаревшей записью;
- `after/project-map.md` — та же копия после исправления;
- основная справка `knowledge/project-map.md` **не изменялась**.

## Какая запись устарела

Раздел «Хранилище» утверждал, что данные лежат в `localStorage` под ключом
`group-trip-expenses-v1`, и ссылался на `src/lib/store.ts`. Это описание версии
1.0.0 проекта: в текущей (2.0.0) хранилище серверное, а файла `store.ts` уже
нет.

## Как это проверялось (2026-10-12)

```bash
$ ls src/lib/
api.ts  calc.test.ts  calc.ts  crypto.ts  demo.ts  money.ts
service.ts  types.ts  validation.test.ts  validation.ts
# → store.ts отсутствует

$ grep -rn "localStorage" src server
src/lib/api.ts:7: * Реализует StorageAdapter, поэтому используется вместо localStorage:
# → только комментарий о том, что REST API используется ВМЕСТО localStorage

$ grep -rn "STORAGE_KEY\|group-trip-expenses-v1" src server
# → совпадений нет

$ grep -rn "data/trip-data\|JsonFileStorage" server/index.ts server/storage.ts
server/index.ts:20:const DATA_FILE = process.env.DATA_FILE ?? new URL('../data/trip-data.json', import.meta.url).pathname;
server/index.ts:23:  const storage = new JsonFileStorage(dataFile);
server/storage.ts:14:export class JsonFileStorage {
# → фактическое хранилище: JSON-файл
```

## Исправленная запись (после)

- Файл JSON по умолчанию: `data/trip-data.json`; путь переопределяется
  переменной окружения `DATA_FILE`.
- Запись атомарная; повреждённый файл переименовывается в
  `*.corrupt-<timestamp>`, состояние начинается пустое.
- Источник: `server/storage.ts` (`JsonFileStorage.load/save`), `server/index.ts`
  (строка 20).
- Повод перепроверить: появится второе хранилище или сменится формат файла.

## Дифф (существенное отличие before → after)

```diff
- - Данные хранятся в **localStorage** браузера под ключом
-   `group-trip-expenses-v1`; они переживают перезагрузку страницы.
- - Очистка всех данных — кнопкой «Новая поездка» с подтверждением.
- - Источник: `src/lib/store.ts` (`loadState`, `saveState`, `STORAGE_KEY`).
+ - Файл JSON по умолчанию: `data/trip-data.json`; путь переопределяется
+   переменной окружения `DATA_FILE`.
+ - Запись атомарная; повреждённый файл переименовывается в
+   `*.corrupt-<timestamp>`, состояние начинается пустое.
+ - Источник: `server/storage.ts` (`JsonFileStorage.load/save`),
+   `server/index.ts` (строка 20).
```

## Правило на будущее

Запись в базе знаний считается достоверной только вместе с полями:
**источник** (файл и функция/строка), **дата проверки**, **повод перепроверить**.
Если источник не находится в текущем коде — запись устарела и правится так же,
как здесь.
