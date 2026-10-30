import type { AppState, Balance, Expense, Participant, Transfer } from './types';
import { splitEvenly } from './money';

/**
 * Вычисляет балансы всех участников.
 * Баланс = сколько заплатил - сколько должен был оплатить.
 * Положительный баланс — участнику должны вернуть деньги.
 * Отрицательный баланс — участник должен доплатить.
 */
export function calculateBalances(state: AppState): Balance[] {
  const balances = new Map<string, { paid: number; owed: number }>();

  for (const p of state.participants) {
    balances.set(p.id, { paid: 0, owed: 0 });
  }

  for (const expense of state.expenses) {
    // Плательщик заплатил полную сумму
    const payer = balances.get(expense.paidById);
    if (payer) {
      payer.paid += expense.amountKopecks;
    }

    // Распределяем долю между участниками расхода
    const shares = getShares(expense);
    for (const [participantId, share] of shares) {
      const b = balances.get(participantId);
      if (b) {
        b.owed += share;
      }
    }
  }

  return state.participants.map((p) => {
    const b = balances.get(p.id) ?? { paid: 0, owed: 0 };
    return {
      participantId: p.id,
      paid: b.paid,
      owed: b.owed,
      net: b.paid - b.owed,
    };
  });
}

/**
 * Возвращает доли участников расхода в виде массива [participantId, shareKopecks].
 * Сумма долей строго равна сумме расхода.
 */
export function getShares(expense: Expense): Array<[string, number]> {
  if (expense.splitMode === 'equal') {
    const shares = splitEvenly(expense.amountKopecks, expense.participantIds.length);
    return expense.participantIds.map((id, i) => [id, shares[i]]);
  }

  // Неравное распределение: используем явно заданные доли
  const shares: Array<[string, number]> = [];
  for (const id of expense.participantIds) {
    shares.push([id, expense.customShares?.[id] ?? 0]);
  }
  return shares;
}

/**
 * Вычисляет оптимальный список переводов для закрытия долгов.
 * Использует жадный алгоритм: максимальный должник максимальному кредитору.
 * После выполнения всех переводов балансы закрываются с точностью до копейки.
 */
export function calculateTransfers(balances: Balance[]): Transfer[] {
  // Разделяем на должников (net < 0) и кредиторов (net > 0)
  const debtors = balances
    .filter((b) => b.net < 0)
    .map((b) => ({ id: b.participantId, amount: -b.net }))
    .sort((a, b) => b.amount - a.amount);

  const creditors = balances
    .filter((b) => b.net > 0)
    .map((b) => ({ id: b.participantId, amount: b.net }))
    .sort((a, b) => b.amount - a.amount);

  const transfers: Transfer[] = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].amount, creditors[j].amount);
    if (amount > 0) {
      transfers.push({
        fromId: debtors[i].id,
        toId: creditors[j].id,
        amountKopecks: amount,
      });
    }
    debtors[i].amount -= amount;
    creditors[j].amount -= amount;
    if (debtors[i].amount === 0) i++;
    if (creditors[j].amount === 0) j++;
  }

  return transfers;
}

/** Общая сумма всех расходов в копейках */
export function totalExpenses(state: AppState): number {
  return state.expenses.reduce((sum, e) => sum + e.amountKopecks, 0);
}

/** Проверяет, что сумма долей строго равна сумме расхода */
export function validateCustomShares(expense: Expense): boolean {
  if (expense.splitMode !== 'custom') return true;
  if (!expense.customShares) return false;
  const total = expense.participantIds.reduce(
    (sum, id) => sum + (expense.customShares?.[id] ?? 0),
    0,
  );
  return total === expense.amountKopecks;
}

/** Проверяет, что все участники расхода существуют в списке участников */
export function validateExpenseParticipants(
  expense: Expense,
  participants: Participant[],
): boolean {
  const ids = new Set(participants.map((p) => p.id));
  return (
    ids.has(expense.paidById) &&
    expense.participantIds.length > 0 &&
    expense.participantIds.every((id) => ids.has(id))
  );
}
