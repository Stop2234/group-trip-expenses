/**
 * Расчётная логика: доли расходов, балансы участников, взаиморасчёты.
 * Чистые функции без зависимостей от DOM и хранилища — удобно тестировать.
 */
import { splitEvenly } from './money.js';

/**
 * Вычисляет доли участников одного расхода.
 * Возвращает массив пар [participantId, shareKopecks].
 * Сумма долей строго равна сумме расхода.
 *
 * @param {{amountKopecks: number, splitMode: 'equal'|'custom', participantIds: string[], customShares?: Object<string, number>}} expense
 */
export function getShares(expense) {
  const ids = expense.participantIds;
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new Error('В расходе нет участников распределения');
  }

  if (expense.splitMode === 'equal') {
    const shares = splitEvenly(expense.amountKopecks, ids.length);
    return ids.map((id, i) => [id, shares[i]]);
  }

  // Неравное распределение: берём явно заданные суммы.
  const custom = expense.customShares ?? {};
  return ids.map((id) => [id, Number.isInteger(custom[id]) ? custom[id] : 0]);
}

/**
 * Вычисляет балансы всех участников.
 * Возвращает массив объектов { participantId, paid, owed, net } в копейках:
 *   paid — сколько реально заплатил;
 *   owed — сколько должен был оплатить по распределению;
 *   net  = paid - owed (положительный — должны вернуть, отрицательный — должен доплатить).
 */
export function calculateBalances(participants, expenses) {
  const balances = new Map();
  for (const p of participants) {
    balances.set(p.id, { participantId: p.id, paid: 0, owed: 0, net: 0 });
  }

  for (const expense of expenses) {
    const payer = balances.get(expense.paidBy);
    if (payer) {
      payer.paid += expense.amountKopecks;
    }
    for (const [participantId, share] of getShares(expense)) {
      const b = balances.get(participantId);
      if (b) {
        b.owed += share;
      }
    }
  }

  for (const b of balances.values()) {
    b.net = b.paid - b.owed;
  }
  return [...balances.values()];
}

/**
 * Вычисляет список переводов, закрывающих долги (жадный алгоритм:
 * крупнейший должник переводит крупнейшему кредитору).
 * После выполнения всех переводов балансы закрываются с точностью до копейки.
 * Нулевые переводы не создаются.
 */
export function calculateTransfers(balances) {
  const debtors = balances
    .filter((b) => b.net < 0)
    .map((b) => ({ id: b.participantId, amount: -b.net }))
    .sort((a, b) => b.amount - a.amount);

  const creditors = balances
    .filter((b) => b.net > 0)
    .map((b) => ({ id: b.participantId, amount: b.net }))
    .sort((a, b) => b.amount - a.amount);

  const transfers = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].amount, creditors[j].amount);
    if (amount > 0) {
      transfers.push({ fromId: debtors[i].id, toId: creditors[j].id, amountKopecks: amount });
    }
    debtors[i].amount -= amount;
    creditors[j].amount -= amount;
    if (debtors[i].amount === 0) i += 1;
    if (creditors[j].amount === 0) j += 1;
  }
  return transfers;
}

/** Общая сумма всех расходов в копейках. */
export function totalExpenses(expenses) {
  return expenses.reduce((sum, e) => sum + e.amountKopecks, 0);
}

/**
 * Проверяет корректность неравного распределения:
 * сумма явно заданных долей строго равна сумме расхода.
 */
export function validateCustomShares(expense) {
  if (expense.splitMode !== 'custom') return true;
  const custom = expense.customShares;
  if (!custom) return false;
  const total = expense.participantIds.reduce((sum, id) => sum + (custom[id] ?? 0), 0);
  return total === expense.amountKopecks;
}

/**
 * Проверяет, что плательщик и все участники распределения существуют
 * в списке участников, и что список распределения непуст.
 */
export function validateExpenseParticipants(expense, participants) {
  const ids = new Set(participants.map((p) => p.id));
  return (
    ids.has(expense.paidBy) &&
    expense.participantIds.length > 0 &&
    expense.participantIds.every((id) => ids.has(id))
  );
}
