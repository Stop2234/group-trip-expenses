#!/usr/bin/env node
// Проверка отчёта на 5 требований стайлгайда (STYLE_GUIDE.md).
// Денежная арифметика здесь НЕ проверяется — для неё tools/check-numbers.mjs.
//
// Использование:
//   node tools/check-style.mjs reports/report.md [--state data/trip-data.json]

import { readFileSync } from 'node:fs';

const USAGE =
  'Использование: node tools/check-style.mjs <файл-отчёта.md> [--state <файл-состояния.json>]';

const args = process.argv.slice(2);
let reportPath = null;
let statePath = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--state') statePath = args[++i];
  else if (!reportPath) reportPath = args[i];
}
if (!reportPath) {
  console.error(USAGE);
  process.exit(2);
}

let text;
try {
  text = readFileSync(reportPath, 'utf-8');
} catch (err) {
  console.error(`Не удалось прочитать отчёт: ${reportPath}\n${err.message}`);
  process.exit(2);
}

const results = [];

function check(n, title, fn) {
  try {
    const problem = fn();
    results.push({ n, title, ok: problem === null, problem });
  } catch (err) {
    results.push({ n, title, ok: false, problem: `ошибка проверки: ${err.message}` });
  }
}

const SECTION_TITLES = [
  '## 1. Сводка',
  '## 2. Расходы',
  '## 3. Балансы',
  '## 4. Переводы',
  '## 5. Проверка расчётов',
  '## 6. Источник и ограничения',
];

const EXPENSES_HEADER = '| # | Название | Сумма | Плательщик | Участники | Доли |';
const BALANCES_HEADER = '| Участник | Заплатил | Должен был | Баланс |';
const TRANSFERS_HEADER = '| Кто | Кому | Сумма |';

/** Текст раздела (от его заголовка до следующего `## `) */
function section(title) {
  const start = text.indexOf('\n' + title + '\n');
  const from = start >= 0 ? start + 1 : text.startsWith(title + '\n') ? 0 : -1;
  if (from < 0) return null;
  const rest = text.slice(from + title.length + 1);
  const next = rest.search(/\n## /);
  return next < 0 ? rest : rest.slice(0, next + 1);
}

/** Таблица: заголовок + разделитель + строки данных */
function table(header) {
  const idx = text.indexOf(header);
  if (idx < 0) return null;
  const after = text.slice(idx + header.length);
  const lines = after.split('\n');
  const sepAt = lines.findIndex((l) => /^\s*\|?-{2,}/.test(l));
  if (sepAt !== 0) return { headerOk: true, separatorOk: false, rows: [] };
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const l = lines[i];
    if (l.trim() === '') break;
    if (!l.trim().startsWith('|')) break;
    rows.push(l);
  }
  return { headerOk: true, separatorOk: true, rows };
}

// ─── 1. Порядок разделов ───────────────────────────────────────────────────────
check(1, 'Фиксированный порядок разделов', () => {
  const found = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^##\s/.test(l));
  const problems = [];
  if (found.length !== SECTION_TITLES.length) {
    problems.push(`найдено разделов: ${found.length}, ожидалось ${SECTION_TITLES.length}`);
  }
  SECTION_TITLES.forEach((expected, i) => {
    if (found[i] !== expected) {
      problems.push(`место ${i + 1}: ожидалось «${expected}», найдено «${found[i] ?? '—'}»`);
    }
  });
  return problems.length ? problems.join('; ') : null;
});

// ─── 2. Формат сумм ───────────────────────────────────────────────────────────
check(2, 'Все суммы: рубли с двумя знаками (1 234,56 ₽)', () => {
  const MONEY = /([-−]?[\d][\d\s.,]*) ₽/g;
  const bad = [];
  let count = 0;
  for (const m of text.matchAll(MONEY)) {
    count++;
    const token = m[1];
    if (!/^[-−]?\d{1,3}(?: \d{3})*,\d{2}$/.test(token)) bad.push(`«${token} ₽»`);
  }
  if (count === 0) return 'в отчёте нет ни одной суммы с ₽';
  if (bad.length) {
    const shown = bad.slice(0, 5).join(', ');
    return `неверный формат: ${shown}${bad.length > 5 ? ` и ещё ${bad.length - 5}` : ''}`;
  }
  return null;
});

// ─── 3. Таблица расходов ──────────────────────────────────────────────────────
check(3, 'Таблица расходов с фиксированными колонками', () => {
  const sec = section('## 2. Расходы');
  if (sec === null) return 'раздел «## 2. Расходы» не найден';
  if (!sec.includes(EXPENSES_HEADER)) {
    return `заголовок не совпадает с эталоном: нужно строку «${EXPENSES_HEADER}»`;
  }
  const lines = sec.split('\n');
  const h = lines.findIndex((l) => l.trim() === EXPENSES_HEADER);
  const sep = (lines[h + 1] ?? '').trim();
  if (!/^\|?-{2,}/.test(sep)) return 'после заголовка нет строки разделителя |---|';
  const rows = [];
  for (let i = h + 2; i < lines.length; i++) {
    const l = lines[i];
    if (l.trim() === '' || !l.trim().startsWith('|')) break;
    rows.push(l);
  }
  if (rows.length === 0) return 'в таблице нет ни одной строки расхода';
  if (statePath) {
    let state;
    try {
      state = JSON.parse(readFileSync(statePath, 'utf-8'));
    } catch (err) {
      return `не удалось прочитать --state: ${err.message}`;
    }
    const n = Array.isArray(state.expenses) ? state.expenses.length : -1;
    if (n >= 0 && rows.length !== n) {
      return `строк в таблице: ${rows.length}, расходов в источнике: ${n}`;
    }
  }
  return null;
});

// ─── 4. Две отдельные таблицы: балансы и переводы ─────────────────────────────
check(4, 'Балансы и переводы — две отдельные таблицы', () => {
  const secB = section('## 3. Балансы');
  const secT = section('## 4. Переводы');
  if (secB === null) return 'раздел «## 3. Балансы» не найден';
  if (secT === null) return 'раздел «## 4. Переводы» не найден';
  if (!secB.includes(BALANCES_HEADER)) {
    return `в разделе балансов нет заголовка «${BALANCES_HEADER}»`;
  }
  if (!secT.includes(TRANSFERS_HEADER)) {
    return `в разделе переводов нет заголовка «${TRANSFERS_HEADER}»`;
  }
  const rowsIn = (sec, header) => {
    const lines = sec.split('\n');
    const h = lines.findIndex((l) => l.trim() === header);
    const rows = [];
    for (let i = h + 2; i < lines.length; i++) {
      const l = lines[i];
      if (l.trim() === '' || !l.trim().startsWith('|')) break;
      rows.push(l);
    }
    return rows;
  };
  const rb = rowsIn(secB, BALANCES_HEADER);
  const rt = rowsIn(secT, TRANSFERS_HEADER);
  if (rb.length === 0) return 'таблица балансов пуста';
  if (rt.length === 0) {
    // Пустая таблица переводов допустима только при явном обосновании
    if (!/все балансы закрыты|переводы не требуются|ноль переводов/i.test(secT)) {
      return 'таблица переводов пуста без обоснования в этом же разделе';
    }
  }
  return null;
});

// ─── 5. Источник данных и результат проверки ─────────────────────────────────
check(5, 'Источник данных и результат контрольной проверки', () => {
  const src = text.match(/^\*\*Источник данных:\*\*\s*(.+)$/m);
  const chk = text.match(/^\*\*Контрольная проверка:\*\*\s*(.+)$/m);
  const problems = [];
  if (!src) problems.push('нет строки «**Источник данных:**»');
  else if (src[1].trim().length < 10) problems.push('источник данных пуст или слишком краток');
  if (!chk) problems.push('нет строки «**Контрольная проверка:**»');
  else {
    const v = chk[1].trim();
    const ok = /^ПРОЙДЕНА \(\d+\/\d+\)$/.test(v) || /^НЕ ПРОЙДЕНА\b/.test(v);
    if (!ok) {
      problems.push(
        `значение должно быть «ПРОЙДЕНА (N/M)» или «НЕ ПРОЙДЕНА ...», а получено «${v}»`,
      );
    }
  }
  return problems.length ? problems.join('; ') : null;
});

// ─── Итог ─────────────────────────────────────────────────────────────────────
for (const r of results) {
  if (r.ok) console.log(`PASS  ${r.n}. ${r.title}`);
  else console.log(`FAIL  ${r.n}. ${r.title}\n      → ${r.problem}`);
}
const passed = results.filter((r) => r.ok).length;
console.log(`\nИтог: ${passed}/${results.length}`);
if (statePath) console.log(`Файл состояния: ${statePath}`);
console.log(`Проверенный отчёт: ${reportPath}`);
process.exit(passed === results.length ? 0 : 1);
