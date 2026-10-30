import { describe, it, expect } from 'vitest';
import { validateParticipantName, validateExpense, canDeleteParticipant } from './validation';
import type { Participant, Expense } from './types';

describe('validateParticipantName', () => {
  const participants: Participant[] = [
    { id: '1', name: 'Егор' },
    { id: '2', name: 'Анна' },
  ];

  it('принимает корректное имя', () => {
    const result = validateParticipantName('Иван', participants);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('отклоняет пустое имя', () => {
    const result = validateParticipantName('', participants);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Имя не может быть пустым');
  });

  it('отклоняет имя из пробелов', () => {
    const result = validateParticipantName('   ', participants);
    expect(result.valid).toBe(false);
  });

  it('отклоняет дубликат', () => {
    const result = validateParticipantName('Егор', participants);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('уже существует'))).toBe(true);
  });

  it('отклоняет дубликат без учёта регистра', () => {
    const result = validateParticipantName('егор', participants);
    expect(result.valid).toBe(false);
  });

  it('отклоняет слишком длинное имя', () => {
    const result = validateParticipantName('а'.repeat(51), participants);
    expect(result.valid).toBe(false);
  });

  it('позволяет то же имя при исключении его ID (редактирование)', () => {
    const result = validateParticipantName('Егор', participants, '1');
    expect(result.valid).toBe(true);
  });
});

describe('validateExpense', () => {
  const participants: Participant[] = [
    { id: '1', name: 'Егор' },
    { id: '2', name: 'Анна' },
  ];

  const validExpense = {
    title: 'Ужин',
    amountInput: '1000,00',
    paidById: '1',
    participantIds: ['1', '2'],
    splitMode: 'equal' as const,
  };

  it('принимает корректный расход', () => {
    const result = validateExpense(validExpense, participants, []);
    expect(result.valid).toBe(true);
  });

  it('отклоняет пустое название', () => {
    const result = validateExpense({ ...validExpense, title: '' }, participants, []);
    expect(result.valid).toBe(false);
  });

  it('отклоняет нулевую сумму', () => {
    const result = validateExpense({ ...validExpense, amountInput: '0' }, participants, []);
    expect(result.valid).toBe(false);
  });

  it('отклоняет отрицательную сумму', () => {
    const result = validateExpense({ ...validExpense, amountInput: '-100' }, participants, []);
    expect(result.valid).toBe(false);
  });

  it('отклоняет некорректную сумму', () => {
    const result = validateExpense({ ...validExpense, amountInput: 'abc' }, participants, []);
    expect(result.valid).toBe(false);
  });

  it('отклоняет отсутствие участников', () => {
    const result = validateExpense({ ...validExpense, participantIds: [] }, participants, []);
    expect(result.valid).toBe(false);
  });

  it('отклоняет несуществующего плательщика', () => {
    const result = validateExpense({ ...validExpense, paidById: '999' }, participants, []);
    expect(result.valid).toBe(false);
  });

  it('отклоняет несуществующих участников', () => {
    const result = validateExpense({ ...validExpense, participantIds: ['1', '999'] }, participants, []);
    expect(result.valid).toBe(false);
  });

  it('отклоняет custom-доли с неверной суммой', () => {
    const result = validateExpense(
      {
        ...validExpense,
        splitMode: 'custom',
        customShares: { '1': 600_00, '2': 300_00 },
      },
      participants,
      [],
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('не совпадает'))).toBe(true);
  });

  it('принимает custom-доли с верной суммой', () => {
    const result = validateExpense(
      {
        ...validExpense,
        splitMode: 'custom',
        customShares: { '1': 600_00, '2': 400_00 },
      },
      participants,
      [],
    );
    expect(result.valid).toBe(true);
  });

  it('отклоняет дубликат названия', () => {
    const existing: Expense[] = [
      {
        id: 'e1',
        title: 'Ужин',
        amountKopecks: 1000_00,
        paidById: '1',
        participantIds: ['1', '2'],
        splitMode: 'equal',
      },
    ];
    const result = validateExpense(validExpense, participants, existing);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('уже существует'))).toBe(true);
  });
});

describe('canDeleteParticipant', () => {
  const expenses: Expense[] = [
    {
      id: 'e1',
      title: 'Ужин',
      amountKopecks: 1000_00,
      paidById: '1',
      participantIds: ['1', '2'],
      splitMode: 'equal',
    },
    {
      id: 'e2',
      title: 'Кофе',
      amountKopecks: 500_00,
      paidById: '2',
      participantIds: ['1', '2'],
      splitMode: 'equal',
    },
  ];

  it('позволяет удалить свободного участника', () => {
    const result = canDeleteParticipant('3', expenses);
    expect(result.safe).toBe(true);
  });

  it('запрещает удалить плательщика', () => {
    const result = canDeleteParticipant('1', expenses);
    expect(result.safe).toBe(false);
    expect(result.reason).toBeDefined();
  });

  it('запрещает удалить участника расходов', () => {
    const result = canDeleteParticipant('2', expenses);
    expect(result.safe).toBe(false);
    expect(result.reason).toBeDefined();
  });
});
