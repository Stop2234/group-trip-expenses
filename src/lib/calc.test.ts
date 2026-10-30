import { describe, it, expect } from 'vitest';
import { calculateBalances, calculateTransfers, validateCustomShares, totalExpenses, getShares } from './calc';
import { splitEvenly, toKopecks, parseMoneyInput, formatMoney } from './money';
import type { AppState, Participant, Expense } from './types';

function makeParticipant(name: string): Participant {
  return { id: name.toLowerCase(), name };
}

function makeExpense(
  partial: Partial<Expense> & { title: string; amountKopecks: number; paidById: string },
): Expense {
  return {
    id: Math.random().toString(36).slice(2),
    participantIds: [],
    splitMode: 'equal',
    ...partial,
  };
}

describe('splitEvenly', () => {
  it('делит сумму равномерно', () => {
    const shares = splitEvenly(1000, 3);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(1000);
    expect(shares).toEqual([334, 333, 333]);
  });

  it('делит без остатка', () => {
    const shares = splitEvenly(999, 3);
    expect(shares).toEqual([333, 333, 333]);
  });

  it('обрабатывает одного участника', () => {
    expect(splitEvenly(500, 1)).toEqual([500]);
  });

  it('возвращает пустой массив для нуля участников', () => {
    expect(splitEvenly(500, 0)).toEqual([]);
  });
});

describe('money utils', () => {
  it('конвертирует рубли в копейки', () => {
    expect(toKopecks(12.34)).toBe(1234);
    expect(toKopecks(0.01)).toBe(1);
    expect(toKopecks(1)).toBe(100);
  });

  it('парсит пользовательский ввод', () => {
    expect(parseMoneyInput('1234,56')).toBe(123456);
    expect(parseMoneyInput('100')).toBe(10000);
    expect(parseMoneyInput('0,01')).toBe(1);
    expect(parseMoneyInput('1 234,56')).toBe(123456);
    expect(parseMoneyInput('')).toBeNull();
    expect(parseMoneyInput('abc')).toBeNull();
    expect(parseMoneyInput('-5')).toBeNull();
    expect(parseMoneyInput('1.123')).toBeNull();
  });

  it('форматирует сумму в рублях', () => {
    expect(formatMoney(123456)).toBe('1 234,56 ₽');
    expect(formatMoney(100)).toBe('1,00 ₽');
    expect(formatMoney(0)).toBe('0,00 ₽');
    expect(formatMoney(-500)).toBe('−5,00 ₽');
  });
});

describe('calculateBalances', () => {
  it('равное распределение между всеми участниками', () => {
    const state: AppState = {
      participants: [makeParticipant('Егор'), makeParticipant('Анна'), makeParticipant('Иван')],
      expenses: [
        makeExpense({
          title: 'Ужин',
          amountKopecks: 6000_00,
          paidById: 'егор',
          participantIds: ['егор', 'анна', 'иван'],
          splitMode: 'equal',
        }),
      ],
    };
    const balances = calculateBalances(state);
    const eg = balances.find((b) => b.participantId === 'егор')!;
    const an = balances.find((b) => b.participantId === 'анна')!;
    const iv = balances.find((b) => b.participantId === 'иван')!;

    expect(eg.paid).toBe(6000_00);
    expect(eg.owed).toBe(2000_00);
    expect(eg.net).toBe(4000_00);

    expect(an.paid).toBe(0);
    expect(an.owed).toBe(2000_00);
    expect(an.net).toBe(-2000_00);

    expect(iv.paid).toBe(0);
    expect(iv.owed).toBe(2000_00);
    expect(iv.net).toBe(-2000_00);
  });

  it('неравное распределение с явными долями', () => {
    const state: AppState = {
      participants: [makeParticipant('Егор'), makeParticipant('Анна'), makeParticipant('Иван')],
      expenses: [
        makeExpense({
          title: 'Подарок',
          amountKopecks: 3000_00,
          paidById: 'егор',
          participantIds: ['егор', 'анна', 'иван'],
          splitMode: 'custom',
          customShares: { 'егор': 1500_00, 'анна': 1000_00, 'иван': 500_00 },
        }),
      ],
    };
    const balances = calculateBalances(state);
    const eg = balances.find((b) => b.participantId === 'егор')!;
    const an = balances.find((b) => b.participantId === 'анна')!;
    const iv = balances.find((b) => b.participantId === 'иван')!;

    expect(eg.paid).toBe(3000_00);
    expect(eg.owed).toBe(1500_00);
    expect(eg.net).toBe(1500_00);

    expect(an.owed).toBe(1000_00);
    expect(an.net).toBe(-1000_00);

    expect(iv.owed).toBe(500_00);
    expect(iv.net).toBe(-500_00);
  });

  it('деление между частью участников', () => {
    const state: AppState = {
      participants: [makeParticipant('Егор'), makeParticipant('Анна'), makeParticipant('Иван'), makeParticipant('Мария')],
      expenses: [
        makeExpense({
          title: 'Кофе',
          amountKopecks: 500_00,
          paidById: 'егор',
          participantIds: ['егор', 'иван'],
          splitMode: 'equal',
        }),
      ],
    };
    const balances = calculateBalances(state);
    const ma = balances.find((b) => b.participantId === 'мария')!;

    expect(ma.paid).toBe(0);
    expect(ma.owed).toBe(0);
    expect(ma.net).toBe(0);
  });

  it('плательщик не является участником расхода', () => {
    const state: AppState = {
      participants: [makeParticipant('Егор'), makeParticipant('Анна'), makeParticipant('Иван')],
      expenses: [
        makeExpense({
          title: 'Такси',
          amountKopecks: 900_00,
          paidById: 'егор',
          participantIds: ['анна', 'иван'],
          splitMode: 'equal',
        }),
      ],
    };
    const balances = calculateBalances(state);
    const eg = balances.find((b) => b.participantId === 'егор')!;
    const an = balances.find((b) => b.participantId === 'анна')!;

    expect(eg.paid).toBe(900_00);
    expect(eg.owed).toBe(0);
    expect(eg.net).toBe(900_00);

    expect(an.owed).toBe(450_00);
    expect(an.net).toBe(-450_00);
  });

  it('несколько расходов с разными плательщиками', () => {
    const state: AppState = {
      participants: [makeParticipant('Егор'), makeParticipant('Анна'), makeParticipant('Иван')],
      expenses: [
        makeExpense({
          title: 'Завтрак',
          amountKopecks: 1200_00,
          paidById: 'егор',
          participantIds: ['егор', 'анна', 'иван'],
          splitMode: 'equal',
        }),
        makeExpense({
          title: 'Обед',
          amountKopecks: 1800_00,
          paidById: 'анна',
          participantIds: ['егор', 'анна', 'иван'],
          splitMode: 'equal',
        }),
        makeExpense({
          title: 'Ужин',
          amountKopecks: 3000_00,
          paidById: 'иван',
          participantIds: ['егор', 'анна', 'иван'],
          splitMode: 'equal',
        }),
      ],
    };
    const balances = calculateBalances(state);
    // Каждый должен был по 2000 (400 + 600 + 1000)
    for (const b of balances) {
      expect(b.owed).toBe(2000_00);
    }
    // Балансы: Егор -800, Анна -200, Иван +1000
    const eg = balances.find((b) => b.participantId === 'егор')!;
    const an = balances.find((b) => b.participantId === 'анна')!;
    const iv = balances.find((b) => b.participantId === 'иван')!;
    expect(eg.net).toBe(-800_00);
    expect(an.net).toBe(-200_00);
    expect(iv.net).toBe(1000_00);
  });

  it('сумма всех балансов равна нулю', () => {
    const state: AppState = {
      participants: [makeParticipant('Егор'), makeParticipant('Анна'), makeParticipant('Иван')],
      expenses: [
        makeExpense({
          title: 'A',
          amountKopecks: 1000_01,
          paidById: 'егор',
          participantIds: ['егор', 'анна', 'иван'],
          splitMode: 'equal',
        }),
        makeExpense({
          title: 'B',
          amountKopecks: 555_55,
          paidById: 'анна',
          participantIds: ['егор', 'иван'],
          splitMode: 'custom',
          customShares: { 'егор': 277_77, 'иван': 277_78 },
        }),
      ],
    };
    const balances = calculateBalances(state);
    const sumNet = balances.reduce((sum, b) => sum + b.net, 0);
    expect(sumNet).toBe(0);
  });

  it('копейки и округления', () => {
    const state: AppState = {
      participants: [makeParticipant('Егор'), makeParticipant('Анна'), makeParticipant('Иван')],
      expenses: [
        makeExpense({
          title: 'Тест копеек',
          amountKopecks: 100_01, // 100.01 ₽ на 3 человек
          paidById: 'егор',
          participantIds: ['егор', 'анна', 'иван'],
          splitMode: 'equal',
        }),
      ],
    };
    const balances = calculateBalances(state);
    const eg = balances.find((b) => b.participantId === 'егор')!;
    // Доли: 33.34, 33.34, 33.33
    expect(eg.owed).toBe(3334);
    expect(eg.paid).toBe(10001);
    expect(eg.net).toBe(6667);
  });

  it('итоговые балансы корректны для пустого списка расходов', () => {
    const state: AppState = {
      participants: [makeParticipant('Егор')],
      expenses: [],
    };
    const balances = calculateBalances(state);
    expect(balances).toHaveLength(1);
    expect(balances[0].paid).toBe(0);
    expect(balances[0].owed).toBe(0);
    expect(balances[0].net).toBe(0);
  });
});

describe('calculateTransfers', () => {
  it('расчёт взаиморасчётов закрывает долги', () => {
    const state: AppState = {
      participants: [makeParticipant('Егор'), makeParticipant('Анна'), makeParticipant('Иван')],
      expenses: [
        makeExpense({
          title: 'Ужин',
          amountKopecks: 6000_00,
          paidById: 'егор',
          participantIds: ['егор', 'анна', 'иван'],
          splitMode: 'equal',
        }),
      ],
    };
    const balances = calculateBalances(state);
    const transfers = calculateTransfers(balances);

    // Анна и Иван должны Егору по 2000
    expect(transfers).toHaveLength(2);
    const annaTransfer = transfers.find((t) => t.fromId === 'анна')!;
    const ivanTransfer = transfers.find((t) => t.fromId === 'иван')!;
    expect(annaTransfer.toId).toBe('егор');
    expect(annaTransfer.amountKopecks).toBe(2000_00);
    expect(ivanTransfer.toId).toBe('егор');
    expect(ivanTransfer.amountKopecks).toBe(2000_00);
  });

  it('сумма переводов корректно закрывает долги', () => {
    const state: AppState = {
      participants: [makeParticipant('Егор'), makeParticipant('Анна'), makeParticipant('Иван'), makeParticipant('Мария')],
      expenses: [
        makeExpense({
          title: 'A',
          amountKopecks: 10000_00,
          paidById: 'егор',
          participantIds: ['егор', 'анна', 'иван', 'мария'],
          splitMode: 'equal',
        }),
        makeExpense({
          title: 'B',
          amountKopecks: 5000_00,
          paidById: 'анна',
          participantIds: ['егор', 'анна', 'иван', 'мария'],
          splitMode: 'equal',
        }),
        makeExpense({
          title: 'C',
          amountKopecks: 2000_00,
          paidById: 'иван',
          participantIds: ['егор', 'анна', 'иван', 'мария'],
          splitMode: 'equal',
        }),
      ],
    };
    const balances = calculateBalances(state);
    const transfers = calculateTransfers(balances);

    // Проверяем, что сумма переводов от каждого должника равна его долгу
    for (const b of balances) {
      if (b.net < 0) {
        const sent = transfers
          .filter((t) => t.fromId === b.participantId)
          .reduce((sum, t) => sum + t.amountKopecks, 0);
        expect(sent).toBe(-b.net);
      }
      if (b.net > 0) {
        const received = transfers
          .filter((t) => t.toId === b.participantId)
          .reduce((sum, t) => sum + t.amountKopecks, 0);
        expect(received).toBe(b.net);
      }
    }
  });

  it('нет нулевых переводов', () => {
    const state: AppState = {
      participants: [makeParticipant('Егор'), makeParticipant('Анна')],
      expenses: [
        makeExpense({
          title: 'Тест',
          amountKopecks: 1000_00,
          paidById: 'егор',
          participantIds: ['егор', 'анна'],
          splitMode: 'equal',
        }),
      ],
    };
    const balances = calculateBalances(state);
    const transfers = calculateTransfers(balances);
    expect(transfers.length).toBeGreaterThan(0);
    for (const t of transfers) {
      expect(t.amountKopecks).toBeGreaterThan(0);
    }
  });

  it('нет переводов при нулевых балансах', () => {
    const state: AppState = {
      participants: [makeParticipant('Егор'), makeParticipant('Анна')],
      expenses: [],
    };
    const balances = calculateBalances(state);
    const transfers = calculateTransfers(balances);
    expect(transfers).toHaveLength(0);
  });
});

describe('validateCustomShares', () => {
  it('принимает корректные доли', () => {
    const expense = makeExpense({
      title: 'Тест',
      amountKopecks: 1000_00,
      paidById: 'егор',
      participantIds: ['егор', 'анна'],
      splitMode: 'custom',
      customShares: { 'егор': 600_00, 'анна': 400_00 },
    });
    expect(validateCustomShares(expense)).toBe(true);
  });

  it('отклоняет несовпадающую сумму долей', () => {
    const expense = makeExpense({
      title: 'Тест',
      amountKopecks: 1000_00,
      paidById: 'егор',
      participantIds: ['егор', 'анна'],
      splitMode: 'custom',
      customShares: { 'егор': 500_00, 'анна': 400_00 },
    });
    expect(validateCustomShares(expense)).toBe(false);
  });

  it('отклоняет отсутствие долей', () => {
    const expense = makeExpense({
      title: 'Тест',
      amountKopecks: 1000_00,
      paidById: 'егор',
      participantIds: ['егор', 'анна'],
      splitMode: 'custom',
    });
    expect(validateCustomShares(expense)).toBe(false);
  });
});

describe('totalExpenses', () => {
  it('считает общую сумму', () => {
    const state: AppState = {
      participants: [makeParticipant('Егор')],
      expenses: [
        makeExpense({ title: 'A', amountKopecks: 100_00, paidById: 'егор', participantIds: ['егор'] }),
        makeExpense({ title: 'B', amountKopecks: 250_50, paidById: 'егор', participantIds: ['егор'] }),
      ],
    };
    expect(totalExpenses(state)).toBe(350_50);
  });

  it('возвращает 0 для пустого списка', () => {
    const state: AppState = { participants: [], expenses: [] };
    expect(totalExpenses(state)).toBe(0);
  });
});

describe('getShares', () => {
  it('возвращает равные доли', () => {
    const expense = makeExpense({
      title: 'Тест',
      amountKopecks: 900_00,
      paidById: 'егор',
      participantIds: ['егор', 'анна', 'иван'],
      splitMode: 'equal',
    });
    const shares = getShares(expense);
    expect(shares).toEqual([
      ['егор', 300_00],
      ['анна', 300_00],
      ['иван', 300_00],
    ]);
  });

  it('возвращает пользовательские доли', () => {
    const expense = makeExpense({
      title: 'Тест',
      amountKopecks: 1000_00,
      paidById: 'егор',
      participantIds: ['егор', 'анна'],
      splitMode: 'custom',
      customShares: { 'егор': 700_00, 'анна': 300_00 },
    });
    const shares = getShares(expense);
    expect(shares).toEqual([
      ['егор', 700_00],
      ['анна', 300_00],
    ]);
  });
});
