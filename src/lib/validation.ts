import type { Expense, Participant } from './types';
import { parseMoneyInput } from './money';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/** Валидация имени участника */
export function validateParticipantName(
  name: string,
  existing: Participant[],
  excludeId?: string,
): ValidationResult {
  const errors: string[] = [];
  const trimmed = name.trim();

  if (trimmed === '') {
    errors.push('Имя не может быть пустым');
  } else if (trimmed.length > 50) {
    errors.push('Имя не может длиннее 50 символов');
  } else {
    const duplicate = existing.find(
      (p) => p.name.toLowerCase() === trimmed.toLowerCase() && p.id !== excludeId,
    );
    if (duplicate) {
      errors.push(`Участник «${trimmed}» уже существует`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/** Валидация расхода */
export function validateExpense(
  expense: {
    title: string;
    amountInput: string;
    paidById: string;
    participantIds: string[];
    splitMode: 'equal' | 'custom';
    customShares?: Record<string, number>;
  },
  participants: Participant[],
  existingExpenses: Expense[],
  excludeId?: string,
): ValidationResult {
  const errors: string[] = [];

  // Название
  const title = expense.title.trim();
  if (title === '') {
    errors.push('Название расхода не может быть пустым');
  } else if (title.length > 100) {
    errors.push('Название не может длиннее 100 символов');
  }

  // Сумма
  const amountKopecks = parseMoneyInput(expense.amountInput);
  if (amountKopecks === null) {
    errors.push('Сумма должна быть числом в формате 1234,56');
  } else if (amountKopecks <= 0) {
    errors.push('Сумма должна быть строго положительной');
  }

  // Плательщик
  if (!participants.some((p) => p.id === expense.paidById)) {
    errors.push('Выберите плательщика');
  }

  // Участники расхода
  if (expense.participantIds.length === 0) {
    errors.push('Выберите хотя бы одного участника расхода');
  }

  const participantIds = new Set(participants.map((p) => p.id));
  if (!expense.participantIds.every((id) => participantIds.has(id))) {
    errors.push('Все участники расхода должны быть из списка участников');
  }

  // Неравное распределение: проверяем сумму долей
  if (expense.splitMode === 'custom' && expense.customShares && amountKopecks !== null && amountKopecks > 0) {
    const totalShares = expense.participantIds.reduce(
      (sum, id) => sum + (expense.customShares?.[id] ?? 0),
      0,
    );
    if (totalShares !== amountKopecks) {
      errors.push(
        `Сумма долей (${(totalShares / 100).toFixed(2)} ₽) не совпадает с суммой расхода (${(amountKopecks / 100).toFixed(2)} ₽)`,
      );
    }
  }

  // Дубликат названия (мягкая проверка — предупреждение, не ошибка)
  const duplicate = existingExpenses.find(
    (e) => e.title.toLowerCase() === title.toLowerCase() && e.id !== excludeId,
  );
  if (duplicate) {
    errors.push(`Расход с названием «${title}» уже существует`);
  }

  return { valid: errors.length === 0, errors };
}

/** Проверяет, можно ли безопасно удалить участника */
export function canDeleteParticipant(
  participantId: string,
  expenses: Expense[],
): { safe: boolean; reason?: string } {
  const usedAsPayer = expenses.filter((e) => e.paidById === participantId);
  if (usedAsPayer.length > 0) {
    return {
      safe: false,
      reason: `Участник является плательщиком в ${usedAsPayer.length} расход(ах). Сначала удалите или измените эти расходы.`,
    };
  }

  const usedInExpenses = expenses.filter((e) => e.participantIds.includes(participantId));
  if (usedInExpenses.length > 0) {
    return {
      safe: false,
      reason: `Участник участвует в ${usedInExpenses.length} расход(ах). Сначала удалите или измените эти расходы.`,
    };
  }

  return { safe: true };
}
