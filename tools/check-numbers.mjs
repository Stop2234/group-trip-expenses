#!/usr/bin/env node
// Независимая проверка арифметики в отчёте по данным источника.
// Считает всё заново в целых копейках и сверяет с таблицами отчёта.
// Проверку ОФОРМЛЕНИЯ (5 требований стайлгайда) выполняет tools/check-style.mjs.
//
// Использование:
//   node tools/check-numbers.mjs --state data/trip-data.json --report reports/report.md

import { readFileSync } from 'node:fs';

const USAGE =
  'Использование: node tools/check-numbers.mjs --state <состояние.json> --report <отчёт.md>';

const args = process.argv.slice(2);
let statePath = null;
let reportPath = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--state') statePath = args[++i];
  else if (args[i] === '--report') reportPath = args[++i];
}
if (!statePath || !reportPath) {
  console.error(USAGE);
  process.exit(2);
}

const state = JSON.parse(readFileSync(statePath, 'utf-8'));
const report = readFileSync(reportPath, 'utf-8');

const participants = state.participants ?? [];
const expenses = state.expenses ?? [];

/** Целые копейки → строка вида «1 234,56 ₽» (для сообщений об ошибках) */
function fmt(kopecks) {
  const sign = kopecks < 0 ? '-' : '';
  const abs = Math.abs(kopecks);
  const rubPart = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${sign}${rubPart},${String(abs % 100).padStart(2, '0')} ₽`;
}

const rub = fmt;

/** "1 234,56 ₽" | "-800,00 ₽" | "−800,00 ₽" → целые копейки (или null) */
function parseMoney(cell) {
  const s = String(cell).trim();
  const m = s.match(/^([-−]?)(\d{1,3}(?: \d{3})*|\d+),(\d{2}) ₽$/);
  if (!m) return null;
  const kopecks = Number(m[2].replace(/ /g, '')) * 100 + Number(m[3]);
  return m[1] ? -kopecks : kopecks;
}

/** Строки таблицы отчёта с данным заголовком */
function rows(header) {
  const lines = report.split('\n');
  const h = lines.findIndex((l) => l.trim() === header);
  if (h < 0) return null;
  const out = [];
  for (let i = h + 2; i < lines.length; i++) {
    const l = lines[i];
    if (l.trim() === '' || !l.trim().startsWith('|')) break;
    out.push(
      l
        .trim()
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((c) => c.trim()),
    );
  }
  return out;
}

const EXPENSES_HEADER = '| # | Название | Сумма | Плательщик | Участники | Доли |';
const BALANCES_HEADER = '| Участник | Заплатил | Должен был | Баланс |';
const TRANSFERS_HEADER = '| Кто | Кому | Сумма |';

const nameById = new Map(participants.map((p) => [p.id, p.name]));
const idByName = new Map();
let duplicateNames = false;
for (const p of participants) {
  const key = p.name.toLowerCase();
  if (idByName.has(key)) duplicateNames = true;
  idByName.set(key, p.id);
}

/** Доли расхода в копейках — пересчёт независимо от приложения */
function sharesOf(expense) {
  const ids = expense.participantIds ?? [];
  if (expense.splitMode === 'custom') {
    return ids.map((id) => [id, expense.customShares?.[id] ?? 0]);
  }
  const total = expense.amountKopecks;
  const n = ids.length;
  const base = n > 0 ? Math.floor(total / n) : 0;
  const remainder = n > 0 ? ((total % n) + n) % n : 0;
  return ids.map((id, i) => [id, base + (i < remainder ? 1 : 0)]);
}

/** Балансы — пересчёт */
function computeBalances() {
  const acc = new Map(participants.map((p) => [p.id, { paid: 0, owed: 0 }]));
  for (const e of expenses) {
    const payer = acc.get(e.paidById);
    if (payer) payer.paid += e.amountKopecks;
    for (const [id, share] of sharesOf(e)) {
      const b = acc.get(id);
      if (b) b.owed += share;
    }
  }
  return participants.map((p) => {
    const b = acc.get(p.id);
    return { id: p.id, name: p.name, paid: b.paid, owed: b.owed, net: b.paid - b.owed };
  });
}

/** Переводы — пересчёт (жадный алгоритм, как в src/lib/calc.ts) */
function computeTransfers(balances) {
  const debtors = balances
    .filter((b) => b.net < 0)
    .map((b) => ({ id: b.id, amount: -b.net }))
    .sort((a, b) => b.amount - a.amount);
  const creditors = balances
    .filter((b) => b.net > 0)
    .map((b) => ({ id: b.id, amount: b.net }))
    .sort((a, b) => b.amount - a.amount);
  const out = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].amount, creditors[j].amount);
    if (amount > 0) out.push({ from: debtors[i].id, to: creditors[j].id, amount });
    debtors[i].amount -= amount;
    creditors[j].amount -= amount;
    if (debtors[i].amount === 0) i++;
    if (creditors[j].amount === 0) j++;
  }
  return out;
}

const balances = computeBalances();
const transfers = computeTransfers(balances);
const total = expenses.reduce((s, e) => s + e.amountKopecks, 0);

const results = [];
function check(title, fn) {
  const problem = fn();
  results.push({ title, ok: problem === null, problem });
}

// ─── 1. Расходы: количество и построчное соответствие источнику ───────────────
check('Расходы совпадают с источником (количество, суммы, участники, доли)', () => {
  const rowsExp = rows(EXPENSES_HEADER);
  if (rowsExp === null) return 'таблица расходов в отчёте не найдена';
  if (rowsExp.length !== expenses.length) {
    return `строк в отчёте: ${rowsExp.length}, расходов в источнике: ${expenses.length}`;
  }
  const key = (title, amount, payer, people, shares) =>
    [title, amount, payer, [...people].sort().join('|'), [...shares].sort().join('|')].join('¦');
  const expected = new Map();
  for (const e of expenses) {
    const sh = sharesOf(e);
    const k = key(
      e.title,
      e.amountKopecks,
      nameById.get(e.paidById) ?? '?',
      (e.participantIds ?? []).map((id) => nameById.get(id) ?? '?'),
      sh.map(([id, k2]) => `${nameById.get(id) ?? '?'}=${k2}`),
    );
    expected.set(k, (expected.get(k) ?? 0) + 1);
  }
  for (const r of rowsExp) {
    const [idx, title, amountCell, payerCell, peopleCell, sharesCell] = r;
    if (!/^\d+$/.test(idx)) return `строка «${title}»: колонка # не число («${idx}»)`;
    const amount = parseMoney(amountCell);
    if (amount === null) return `строка «${title}»: сумма «${amountCell}» не соответствует формату`;
    const people = peopleCell.split(',').map((s) => s.trim()).filter(Boolean);
    const shares = sharesCell.split('/').map((s) => s.trim());
    if (people.length === 0) return `строка «${title}»: пустой список участников`;
    if (shares.length !== people.length) {
      return `строка «${title}»: долей (${shares.length}) не равно участникам (${people.length})`;
    }
    const sharesParsed = shares.map((s, i) => {
      const k = parseMoney(s);
      if (k === null) throw new Error(`строка «${title}»: доля «${s}» не соответствует формату`);
      return [people[i], k];
    });
    const sumShares = sharesParsed.reduce((s, [, k]) => s + k, 0);
    if (sumShares !== amount) {
      return `строка «${title}»: сумма долей ${rub(sumShares)} ≠ сумме расхода ${rub(amount)}`;
    }
    const k = key(
      title,
      amount,
      payerCell,
      people,
      sharesParsed.map(([n, v]) => `${n}=${v}`),
    );
    const left = expected.get(k) ?? 0;
    if (left <= 0) return `строка «${title}» на ${rub(amount)} не найдена в источнике`;
    expected.set(k, left - 1);
  }
  const missing = [...expected.entries()].filter(([, c]) => c > 0);
  if (missing.length) return `в отчёте не хватает расходов из источника: ${missing.length}`;
  return null;
});

// ─── 2. Балансы: пересчёт ─────────────────────────────────────────────────────
check('Балансы совпадают с независимым пересчётом', () => {
  if (duplicateNames) return 'в источнике есть участники с одинаковыми именами — сверять по имени нельзя';
  const rowsB = rows(BALANCES_HEADER);
  if (rowsB === null) return 'таблица балансов в отчёте не найдена';
  if (rowsB.length !== balances.length) {
    return `строк в отчёте: ${rowsB.length}, участников в источнике: ${balances.length}`;
  }
  const byName = new Map(balances.map((b) => [b.name, b]));
  for (const [name, paidCell, owedCell, netCell] of rowsB) {
    const b = byName.get(name);
    if (!b) return `участник «${name}» из отчёта отсутствует в источнике`;
    const paid = parseMoney(paidCell);
    const owed = parseMoney(owedCell);
    const net = parseMoney(netCell);
    if (paid === null || owed === null || net === null) {
      return `строка «${name}»: суммы не соответствуют формату («${paidCell}», «${owedCell}», «${netCell}»)`;
    }
    if (paid !== b.paid) return `«${name}»: заплатил ${rub(paid)}, а по данным ${rub(b.paid)}`;
    if (owed !== b.owed) return `«${name}»: должен был ${rub(owed)}, а по данным ${rub(b.owed)}`;
    if (net !== b.net) return `«${name}»: баланс ${rub(net)}, а пересчёт даёт ${rub(b.net)}`;
    if (paid - owed !== net) return `«${name}»: заплатил − должен был ≠ балансу`;
  }
  return null;
});

// ─── 3. Сводные суммы ─────────────────────────────────────────────────────────
check('Σ заплатил = Σ должен был = общая сумма расходов', () => {
  const sumPaid = balances.reduce((s, b) => s + b.paid, 0);
  const sumOwed = balances.reduce((s, b) => s + b.owed, 0);
  if (sumPaid !== total) return `Σ «Заплатил» = ${rub(sumPaid)}, а расходы = ${rub(total)}`;
  if (sumOwed !== total) return `Σ «Должен был» = ${rub(sumOwed)}, а расходы = ${rub(total)}`;
  if (sumPaid !== sumOwed) return `Σ «Заплатил» ≠ Σ «Должен был»`;
  return null;
});

// ─── 4. Переводы ──────────────────────────────────────────────────────────────
check('Переводы совпадают с пересчётом и закрывают долги', () => {
  const rowsT = rows(TRANSFERS_HEADER);
  if (rowsT === null) return 'таблица переводов в отчёте не найдена';
  if (duplicateNames) return 'в источнике есть участники с одинаковыми именами';
  const actual = [];
  for (const [from, to, amountCell] of rowsT) {
    const amount = parseMoney(amountCell);
    if (amount === null) return `перевод «${from} → ${to}»: сумма «${amountCell}» не в формате`;
    if (amount <= 0) return `перевод «${from} → ${to}» не положительный: ${rub(amount)}`;
    const fromId = idByName.get(from.toLowerCase());
    const toId = idByName.get(to.toLowerCase());
    if (!fromId) return `перевод от «${from}»: участника нет в источнике`;
    if (!toId) return `перевод «${to}»: получателя нет в источнике`;
    actual.push({ from: fromId, to: toId, amount });
  }
  const norm = (t) => `${t.from}→${t.to}:${t.amount}`;
  const a = actual.map(norm).sort();
  const b = transfers.map(norm).sort();
  if (a.join(';') !== b.join(';')) {
    return `переводы в отчёте не совпадают с пересчётом (в отчёте ${a.length}, по расчёту ${b.length})`;
  }
  const need = balances.filter((x) => x.net < 0).reduce((s, x) => s - x.net, 0);
  const sum = actual.reduce((s, t) => s + t.amount, 0);
  if (sum !== need) return `сумма переводов ${rub(sum)} не закрывает долги (${rub(need)})`;
  const after = new Map(balances.map((x) => [x.id, x.net]));
  for (const t of actual) {
    after.set(t.from, after.get(t.from) + t.amount);
    after.set(t.to, after.get(t.to) - t.amount);
  }
  for (const [id, net] of after) {
    if (net !== 0) return `после переводов баланс «${nameById.get(id)}» не закрыт: ${rub(net)}`;
  }
  return null;
});

// ─── 5. Итоговая сумма расходов в отчёте ──────────────────────────────────────
check('Общая сумма расходов в отчёте равна сумме в источнике', () => {
  const line = report.split('\n').find((l) => l.includes('Общая сумма расходов:'));
  if (!line) return 'в разделе «1. Сводка» нет строки «- Общая сумма расходов: ...»';
  const value = line.split('Общая сумма расходов:')[1].replace(/\*/g, '').trim();
  const v = parseMoney(value);
  if (v === null) return `сумма «${value}» не соответствует формату «1 234,56 ₽»`;
  if (v !== total) return `в отчёте ${fmt(v)}, в источнике ${fmt(total)}`;
  return null;
});

for (const r of results) {
  if (r.ok) console.log(`PASS  ${r.title}`);
  else console.log(`FAIL  ${r.title}\n      → ${r.problem}`);
}
const passed = results.filter((r) => r.ok).length;
console.log(`\nИтог: ПРОЙДЕНА (${passed}/${results.length})`);
console.log(`Источник: ${statePath}`);
console.log(`Отчёт:    ${reportPath}`);
console.log(`Расходов: ${expenses.length}, участников: ${participants.length}, общая сумма: ${rub(total)}`);
process.exit(passed === results.length ? 0 : 1);
