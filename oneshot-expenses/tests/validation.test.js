/**
 * Тесты валидации: участники, расходы, неравное распределение, удаление.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canDeleteParticipant, validateExpenseForm, validateParticipantName } from '../src/core/validation.js';
import { formatMoney } from '../src/core/money.js';

const PARTICIPANTS = [
  { id: 'p1', name: 'Егор' },
  { id: 'p2', name: 'Анна' },
  { id: 'p3', name: 'Иван' },
];

function validExpenseRaw(overrides = {}) {
  return {
    title: 'Ужин',
    amount: '6000',
    paidBy: 'p1',
    splitMode: 'equal',
    splitParticipantIds: ['p1', 'p2', 'p3'],
    customAmounts: {},
    ...overrides,
  };
}

// ---------- Участники ----------

test('validateParticipantName: принимает корректное имя', () => {
  const result = validateParticipantName('  Мария  ', PARTICIPANTS);
  assert.equal(result.ok, true);
  assert.equal(result.name, 'Мария');
});

test('validateParticipantName: отклоняет пустое имя', () => {
  for (const value of ['', '   ', null, undefined]) {
    const result = validateParticipantName(value, PARTICIPANTS);
    assert.equal(result.ok, false);
    assert.match(result.error, /пустым/);
  }
});

test('validateParticipantName: отклоняет дубликаты', () => {
  const result = validateParticipantName('  егор ', PARTICIPANTS);
  assert.equal(result.ok, false);
  assert.match(result.error, /уже есть/);
});

test('validateParticipantName: отклоняет слишком длинное имя', () => {
  const result = validateParticipantName('А'.repeat(51), PARTICIPANTS);
  assert.equal(result.ok, false);
  assert.match(result.error, /длинное/);
});

// ---------- Расходы: равное распределение ----------

test('validateExpenseForm: корректный расход проходит валидацию', () => {
  const result = validateExpenseForm(validExpenseRaw(), PARTICIPANTS);
  assert.equal(result.ok, true);
  assert.equal(result.data.amountKopecks, 600000);
  assert.equal(result.data.title, 'Ужин');
  assert.equal(result.data.splitMode, 'equal');
  assert.deepEqual(result.data.splitParticipantIds, ['p1', 'p2', 'p3']);
});

test('validateExpenseForm: сумма с копейками и запятой', () => {
  const result = validateExpenseForm(validExpenseRaw({ amount: '1234,56' }), PARTICIPANTS);
  assert.equal(result.ok, true);
  assert.equal(result.data.amountKopecks, 123456);
});

test('validateExpenseForm: отклоняет пустое название', () => {
  const result = validateExpenseForm(validExpenseRaw({ title: '  ' }), PARTICIPANTS);
  assert.equal(result.ok, false);
  assert.match(result.errors.title, /название/i);
});

test('validateExpenseForm: отклоняет нулевую сумму', () => {
  const result = validateExpenseForm(validExpenseRaw({ amount: '0' }), PARTICIPANTS);
  assert.equal(result.ok, false);
  assert.match(result.errors.amount, /больше нуля/);
});

test('validateExpenseForm: отклоняет отрицательную сумму', () => {
  const result = validateExpenseForm(validExpenseRaw({ amount: '-100' }), PARTICIPANTS);
  assert.equal(result.ok, false);
  assert.match(result.errors.amount, /Некорректная сумма/);
});

test('validateExpenseForm: отклоняет некорректную сумму', () => {
  const result = validateExpenseForm(validExpenseRaw({ amount: 'abc' }), PARTICIPANTS);
  assert.equal(result.ok, false);
  assert.match(result.errors.amount, /Некорректная сумма/);
});

test('validateExpenseForm: отклоняет сумму больше чем с 2 знаками после запятой', () => {
  const result = validateExpenseForm(validExpenseRaw({ amount: '10.001' }), PARTICIPANTS);
  assert.equal(result.ok, false);
  assert.match(result.errors.amount, /Некорректная сумма/);
});

test('validateExpenseForm: отклоняет несуществующего плательщика', () => {
  const result = validateExpenseForm(validExpenseRaw({ paidBy: 'p999' }), PARTICIPANTS);
  assert.equal(result.ok, false);
  assert.match(result.errors.paidBy, /плательщика/);
});

test('validateExpenseForm: отклоняет пустой список распределения', () => {
  const result = validateExpenseForm(validExpenseRaw({ splitParticipantIds: [] }), PARTICIPANTS);
  assert.equal(result.ok, false);
  assert.match(result.errors.split, /хотя бы одного/);
});

test('validateExpenseForm: отклоняет дубли в списке распределения', () => {
  const result = validateExpenseForm(
    validExpenseRaw({ splitParticipantIds: ['p1', 'p1', 'p2'] }),
    PARTICIPANTS,
  );
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.splitParticipantIds, ['p1', 'p2']);
});

// ---------- Расходы: неравное распределение ----------

test('validateExpenseForm: неравное распределение с верной суммой долей', () => {
  const result = validateExpenseForm(
    validExpenseRaw({
      amount: '4800',
      splitMode: 'custom',
      splitParticipantIds: ['p1', 'p2', 'p3'],
      customAmounts: { p1: '2000', p2: '1200', p3: '1600' },
    }),
    PARTICIPANTS,
  );
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.customShares, { p1: 200000, p2: 120000, p3: 160000 });
});

test('validateExpenseForm: отклоняет неравное распределение, где сумма долей меньше суммы расхода', () => {
  const result = validateExpenseForm(
    validExpenseRaw({
      amount: '4800',
      splitMode: 'custom',
      splitParticipantIds: ['p1', 'p2'],
      customAmounts: { p1: '2000', p2: '1200' },
    }),
    PARTICIPANTS,
  );
  assert.equal(result.ok, false);
  assert.match(result.errors.customAmounts._sum, /не совпадает/);
  // В сообщении должны быть обе суммы.
  assert.ok(result.errors.customAmounts._sum.includes(formatMoney(320000)));
  assert.ok(result.errors.customAmounts._sum.includes(formatMoney(480000)));
});

test('validateExpenseForm: отклоняет неравное распределение, где сумма долей больше суммы расхода', () => {
  const result = validateExpenseForm(
    validExpenseRaw({
      amount: '1000',
      splitMode: 'custom',
      splitParticipantIds: ['p1', 'p2'],
      customAmounts: { p1: '600', p2: '600' },
    }),
    PARTICIPANTS,
  );
  assert.equal(result.ok, false);
  assert.match(result.errors.customAmounts._sum, /не совпадает/);
});

test('validateExpenseForm: отклоняет все нулевые доли', () => {
  const result = validateExpenseForm(
    validExpenseRaw({
      amount: '1000',
      splitMode: 'custom',
      splitParticipantIds: ['p1', 'p2'],
      customAmounts: { p1: '0', p2: '0' },
    }),
    PARTICIPANTS,
  );
  assert.equal(result.ok, false);
  assert.match(result.errors.customAmounts._sum, /Хотя бы одна доля/);
});

test('validateExpenseForm: отклоняет некорректную сумму доли', () => {
  const result = validateExpenseForm(
    validExpenseRaw({
      amount: '1000',
      splitMode: 'custom',
      splitParticipantIds: ['p1', 'p2'],
      customAmounts: { p1: 'abc', p2: '500' },
    }),
    PARTICIPANTS,
  );
  assert.equal(result.ok, false);
  assert.ok(result.errors.customAmounts.p1);
});

// ---------- Удаление участника ----------

test('canDeleteParticipant: разрешает удаление свободного участника', () => {
  const expenses = [
    { id: 'e1', title: 'Ужин', paidBy: 'p1', participantIds: ['p1', 'p2'] },
  ];
  const result = canDeleteParticipant('p3', expenses);
  assert.equal(result.ok, true);
});

test('canDeleteParticipant: запрещает удаление плательщика', () => {
  const expenses = [
    { id: 'e1', title: 'Ужин', paidBy: 'p1', participantIds: ['p1', 'p2'] },
  ];
  const result = canDeleteParticipant('p1', expenses);
  assert.equal(result.ok, false);
  assert.match(result.error, /плательщик расхода «Ужин»/);
});

test('canDeleteParticipant: запрещает удаление участника распределения', () => {
  const expenses = [
    { id: 'e1', title: 'Ужин', paidBy: 'p1', participantIds: ['p1', 'p2'] },
  ];
  const result = canDeleteParticipant('p2', expenses);
  assert.equal(result.ok, false);
  assert.match(result.error, /участник распределения расхода «Ужин»/);
});

test('canDeleteParticipant: разрешает удаление, если расходов нет', () => {
  const result = canDeleteParticipant('p1', []);
  assert.equal(result.ok, true);
});
