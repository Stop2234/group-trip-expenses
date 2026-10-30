/**
 * Тесты расчётной логики: доли, балансы, взаиморасчёты.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBalances,
  calculateTransfers,
  getShares,
  totalExpenses,
} from '../src/core/settlement.js';

function makeExpense(overrides = {}) {
  return {
    id: 'e1',
    title: 'Тестовый расход',
    amountKopecks: 10000,
    paidBy: 'p1',
    splitMode: 'equal',
    participantIds: ['p1', 'p2'],
    ...overrides,
  };
}

function makeParticipant(id, name) {
  return { id, name };
}

test('getShares: равное распределение между всеми участниками', () => {
  const expense = makeExpense({
    amountKopecks: 9000,
    splitMode: 'equal',
    participantIds: ['p1', 'p2', 'p3'],
  });
  const shares = getShares(expense);
  assert.deepEqual(shares, [
    ['p1', 3000],
    ['p2', 3000],
    ['p3', 3000],
  ]);
});

test('getShares: неравное распределение по явным суммам', () => {
  const expense = makeExpense({
    amountKopecks: 6000,
    splitMode: 'custom',
    participantIds: ['p1', 'p2'],
    customShares: { p1: 2500, p2: 3500 },
  });
  const shares = getShares(expense);
  assert.deepEqual(shares, [
    ['p1', 2500],
    ['p2', 3500],
  ]);
});

test('getShares: равное распределение с неделимым остатком (копейки)', () => {
  const expense = makeExpense({
    amountKopecks: 100,
    splitMode: 'equal',
    participantIds: ['p1', 'p2', 'p3'],
  });
  const shares = getShares(expense);
  const total = shares.reduce((sum, [, v]) => sum + v, 0);
  assert.equal(total, 100);
  assert.deepEqual(shares, [
    ['p1', 34],
    ['p2', 33],
    ['p3', 33],
  ]);
});

test('getShares: деление между частью участников', () => {
  const expense = makeExpense({
    amountKopecks: 6000,
    splitMode: 'equal',
    participantIds: ['p1', 'p2'],
  });
  const shares = getShares(expense);
  assert.deepEqual(shares, [
    ['p1', 3000],
    ['p2', 3000],
  ]);
});

test('getShares: плательщик не является участником распределения', () => {
  const expense = makeExpense({
    amountKopecks: 5000,
    paidBy: 'p9',
    splitMode: 'equal',
    participantIds: ['p1', 'p2'],
  });
  const shares = getShares(expense);
  assert.deepEqual(shares, [
    ['p1', 2500],
    ['p2', 2500],
  ]);
});

test('calculateBalances: один расход, плательщик участвует в распределении', () => {
  const participants = [makeParticipant('p1', 'А'), makeParticipant('p2', 'Б')];
  const expenses = [makeExpense({ amountKopecks: 10000, paidBy: 'p1', participantIds: ['p1', 'p2'] })];
  const balances = calculateBalances(participants, expenses);
  const byId = Object.fromEntries(balances.map((b) => [b.participantId, b]));
  assert.equal(byId.p1.paid, 10000);
  assert.equal(byId.p1.owed, 5000);
  assert.equal(byId.p1.net, 5000); // должен получить 5000
  assert.equal(byId.p2.paid, 0);
  assert.equal(byId.p2.owed, 5000);
  assert.equal(byId.p2.net, -5000); // должен доплатить 5000
});

test('calculateBalances: плательщик не участвует в расходе', () => {
  const participants = [makeParticipant('p1', 'А'), makeParticipant('p2', 'Б'), makeParticipant('p9', 'Вне')];
  const expenses = [makeExpense({ amountKopecks: 5000, paidBy: 'p9', participantIds: ['p1', 'p2'] })];
  const balances = calculateBalances(participants, expenses);
  const byId = Object.fromEntries(balances.map((b) => [b.participantId, b]));
  assert.equal(byId.p9.net, 5000); // всё должны вернуть
  assert.equal(byId.p1.net, -2500);
  assert.equal(byId.p2.net, -2500);
});

test('calculateBalances: несколько расходов с разными плательщиками', () => {
  const participants = [
    makeParticipant('p1', 'Егор'),
    makeParticipant('p2', 'Анна'),
    makeParticipant('p3', 'Иван'),
    makeParticipant('p4', 'Мария'),
  ];
  const expenses = [
    makeExpense({ id: 'e1', amountKopecks: 1200000, paidBy: 'p1', participantIds: ['p1', 'p2', 'p3', 'p4'] }),
    makeExpense({ id: 'e2', amountKopecks: 600000, paidBy: 'p3', participantIds: ['p1', 'p2', 'p3'] }),
    makeExpense({ id: 'e3', amountKopecks: 480000, paidBy: 'p4', splitMode: 'custom', participantIds: ['p1', 'p2'], customShares: { p1: 200000, p2: 280000 } }),
  ];
  const balances = calculateBalances(participants, expenses);
  const byId = Object.fromEntries(balances.map((b) => [b.participantId, b]));

  assert.equal(byId.p1.paid, 1200000);
  assert.equal(byId.p1.owed, 300000 + 200000 + 200000); // 700000
  assert.equal(byId.p1.net, 500000);

  assert.equal(byId.p2.paid, 0);
  assert.equal(byId.p2.owed, 300000 + 200000 + 280000); // 780000
  assert.equal(byId.p2.net, -780000);

  assert.equal(byId.p3.paid, 600000);
  assert.equal(byId.p3.owed, 300000 + 200000); // 500000
  assert.equal(byId.p3.net, 100000);

  assert.equal(byId.p4.paid, 480000);
  assert.equal(byId.p4.owed, 300000); // 300000
  assert.equal(byId.p4.net, 180000);

  // Сумма балансов всегда равна нулю.
  const netSum = balances.reduce((s, b) => s + b.net, 0);
  assert.equal(netSum, 0);
});

test('calculateBalances: сумма всех балансов равна нулю', () => {
  const participants = [makeParticipant('p1', 'А'), makeParticipant('p2', 'Б')];
  const expenses = [
    makeExpense({ id: 'e1', amountKopecks: 3333, paidBy: 'p1', participantIds: ['p1', 'p2'] }),
    makeExpense({ id: 'e2', amountKopecks: 7777, paidBy: 'p2', participantIds: ['p2'] }),
  ];
  const balances = calculateBalances(participants, expenses);
  const netSum = balances.reduce((s, b) => s + b.net, 0);
  assert.equal(netSum, 0);
});

test('calculateTransfers: простой долг одного участника другому', () => {
  const balances = [
    { participantId: 'p1', paid: 10000, owed: 5000, net: 5000 },
    { participantId: 'p2', paid: 0, owed: 5000, net: -5000 },
  ];
  const transfers = calculateTransfers(balances);
  assert.deepEqual(transfers, [{ fromId: 'p2', toId: 'p1', amountKopecks: 5000 }]);
});

test('calculateTransfers: несколько должников и кредиторов', () => {
  const balances = [
    { participantId: 'p1', paid: 10000, owed: 5000, net: 5000 },
    { participantId: 'p2', paid: 10000, owed: 5000, net: 5000 },
    { participantId: 'p3', paid: 0, owed: 10000, net: -10000 },
  ];
  const transfers = calculateTransfers(balances);
  const total = transfers.reduce((s, t) => s + t.amountKopecks, 0);
  assert.equal(total, 10000);
  assert.equal(transfers.length, 2);
});

test('calculateTransfers: не создаёт нулевые переводы', () => {
  const balances = [
    { participantId: 'p1', paid: 0, owed: 0, net: 0 },
    { participantId: 'p2', paid: 100, owed: 100, net: 0 },
  ];
  const transfers = calculateTransfers(balances);
  assert.deepEqual(transfers, []);
  assert.ok(transfers.every((t) => t.amountKopecks > 0));
});

test('переводы полностью закрывают долги (сумма переводов закрывает балансы)', () => {
  // Случайный набор расходов: проверяем, что после переводов все балансы нулевые.
  const participants = [
    makeParticipant('p1', 'А'),
    makeParticipant('p2', 'Б'),
    makeParticipant('p3', 'В'),
    makeParticipant('p4', 'Г'),
  ];
  const expenses = [
    makeExpense({ id: 'e1', amountKopecks: 123456, paidBy: 'p1', participantIds: ['p1', 'p2', 'p3', 'p4'] }),
    makeExpense({ id: 'e2', amountKopecks: 654321, paidBy: 'p2', participantIds: ['p1', 'p2', 'p3'] }),
    makeExpense({ id: 'e3', amountKopecks: 98765, paidBy: 'p3', participantIds: ['p2', 'p4'] }),
    makeExpense({
      id: 'e4',
      amountKopecks: 500050,
      paidBy: 'p4',
      splitMode: 'custom',
      participantIds: ['p1', 'p2', 'p3', 'p4'],
      customShares: { p1: 100000, p2: 150050, p3: 200000, p4: 50000 },
    }),
  ];
  const balances = calculateBalances(participants, expenses);
  const transfers = calculateTransfers(balances);

  // Применяем перевода к балансам.
  const netById = Object.fromEntries(balances.map((b) => [b.participantId, b.net]));
  for (const t of transfers) {
    netById[t.fromId] += t.amountKopecks;
    netById[t.toId] -= t.amountKopecks;
  }
  for (const net of Object.values(netById)) {
    assert.equal(net, 0, `баланс не закрылся: ${net}`);
  }
});

test('расчёт с копейками: балансы сходятся с точностью до копейки', () => {
  const participants = [makeParticipant('p1', 'А'), makeParticipant('p2', 'Б'), makeParticipant('p3', 'В')];
  const expenses = [
    makeExpense({ id: 'e1', amountKopecks: 1, paidBy: 'p1', participantIds: ['p1', 'p2', 'p3'] }),
    makeExpense({ id: 'e2', amountKopecks: 2, paidBy: 'p2', participantIds: ['p1', 'p2', 'p3'] }),
  ];
  const balances = calculateBalances(participants, expenses);
  const byId = Object.fromEntries(balances.map((b) => [b.participantId, b]));
  // ₽0.01 / 3 = 0.0033... → доли 1, 0, 0 (остаток 1 копейка первому)
  assert.deepEqual(
    balances.map((b) => b.owed),
    [2, 1, 0],
  );
  const netSum = balances.reduce((s, b) => s + b.net, 0);
  assert.equal(netSum, 0);
  assert.equal(byId.p1.net, 1 - 2); // заплатил 1, должен 2
  assert.equal(byId.p2.net, 2 - 1); // заплатил 2, должен 1
  assert.equal(byId.p3.net, 0);
});

test('totalExpenses суммирует все расходы', () => {
  const expenses = [makeExpense({ id: 'e1', amountKopecks: 100 }), makeExpense({ id: 'e2', amountKopecks: 250 })];
  assert.equal(totalExpenses(expenses), 350);
  assert.equal(totalExpenses([]), 0);
});
