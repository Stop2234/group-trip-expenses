/**
 * Форматирование данных для отображения в интерфейсе.
 */
import { formatMoney } from '../core/money.js';

/** Экранирует HTML в пользовательских строках (защита от XSS). */
export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Форматирует сумму в копейках как строку в рублях. */
export function money(kopecks) {
  return formatMoney(kopecks);
}

/** Подпись способа распределения расхода. */
export function splitModeLabel(expense) {
  if (expense.splitMode === 'custom') return 'неравное';
  return 'равное';
}

/** Описание распределения расхода для списка расходов. */
export function splitDescription(expense, participantsById) {
  const names = expense.participantIds.map((id) => participantsById.get(id)?.name ?? '—');
  if (expense.splitMode === 'custom') {
    const parts = expense.participantIds.map((id) => {
      const name = participantsById.get(id)?.name ?? '—';
      return `${name} — ${formatMoney(expense.customShares?.[id] ?? 0)}`;
    });
    return `Неравное: ${parts.join(', ')}`;
  }
  return `Между: ${names.join(', ')}`;
}
