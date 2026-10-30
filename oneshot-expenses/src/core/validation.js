/**
 * Валидация пользовательского ввода: участники и расходы.
 * Все функции возвращают результат в виде { ok: true, ... } или
 * { ok: false, error } / { ok: false, errors: { поле: сообщение } }.
 */
import { formatMoney, parseMoneyToKopecks } from './money.js';

const MAX_NAME_LENGTH = 50;
const MAX_TITLE_LENGTH = 100;

/**
 * Валидирует имя участника.
 * Не допускает пустые имена и дубли (без учёта регистра и крайних пробелов).
 */
export function validateParticipantName(rawName, existingParticipants) {
  const name = String(rawName ?? '').trim();
  if (name === '') {
    return { ok: false, error: 'Имя участника не может быть пустым' };
  }
  if (name.length > MAX_NAME_LENGTH) {
    return { ok: false, error: `Имя слишком длинное (максимум ${MAX_NAME_LENGTH} символов)` };
  }
  const isDuplicate = existingParticipants.some(
    (p) => p.name.toLowerCase() === name.toLowerCase(),
  );
  if (isDuplicate) {
    return { ok: false, error: `Участник «${name}» уже есть в списке` };
  }
  return { ok: true, name };
}

/**
 * Валидирует расход из сырых данных формы.
 * raw: { title, amount, paidBy, splitMode, splitParticipantIds, customAmounts }
 * Возвращает { ok: true, data } с нормализованными данными (суммы в копейках)
 * или { ok: false, errors } с сообщениями по полям.
 */
export function validateExpenseForm(raw, participants) {
  const errors = {};

  // --- Название ---
  const title = String(raw.title ?? '').trim();
  if (title === '') {
    errors.title = 'Укажите название расхода';
  } else if (title.length > MAX_TITLE_LENGTH) {
    errors.title = `Название слишком длинное (максимум ${MAX_TITLE_LENGTH} символов)`;
  }

  // --- Сумма ---
  let amountKopecks = 0;
  try {
    amountKopecks = parseMoneyToKopecks(raw.amount);
    if (amountKopecks <= 0) {
      errors.amount = 'Сумма должна быть больше нуля';
    }
  } catch (error) {
    errors.amount = error.message;
  }

  // --- Плательщик ---
  const paidBy = String(raw.paidBy ?? '');
  if (!participants.some((p) => p.id === paidBy)) {
    errors.paidBy = 'Выберите плательщика из списка участников';
  }

  // --- Участники распределения ---
  const splitMode = raw.splitMode === 'custom' ? 'custom' : 'equal';
  const splitParticipantIds = [...new Set(raw.splitParticipantIds ?? [])];
  if (splitParticipantIds.length === 0) {
    errors.split = 'Выберите хотя бы одного участника, между которыми делится расход';
  } else {
    const unknown = splitParticipantIds.filter((id) => !participants.some((p) => p.id === id));
    if (unknown.length > 0) {
      errors.split = 'В распределении есть участники вне списка поездки';
    }
  }

  // --- Неравное распределение: явные суммы долей ---
  let customShares = null;
  if (splitMode === 'custom') {
    customShares = {};
    const customErrors = {};
    let sum = 0;
    let allZero = true;

    for (const id of splitParticipantIds) {
      const rawAmount = raw.customAmounts?.[id] ?? '';
      try {
        const kopecks = parseMoneyToKopecks(rawAmount);
        if (kopecks < 0) {
          throw new Error('Доля не может быть отрицательной');
        }
        customShares[id] = kopecks;
        sum += kopecks;
        if (kopecks > 0) allZero = false;
      } catch (error) {
        customErrors[id] = error.message;
      }
    }

    if (Object.keys(customErrors).length > 0) {
      errors.customAmounts = customErrors;
    } else if (!errors.amount) {
      // Сумму долей сравниваем только если сама сумма расхода валидна.
      if (allZero) {
        errors.customAmounts = { _sum: 'Хотя бы одна доля должна быть больше нуля' };
      } else if (sum !== amountKopecks) {
        errors.customAmounts = {
          _sum: `Сумма долей (${formatMoney(sum)}) не совпадает с суммой расхода (${formatMoney(amountKopecks)}). Разница: ${formatMoney(Math.abs(sum - amountKopecks))}`,
        };
      }
    }
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    data: {
      title,
      amountKopecks,
      paidBy,
      splitMode,
      splitParticipantIds,
      customShares,
    },
  };
}

/**
 * Проверяет, можно ли безопасно удалить участника.
 * Удаление невозможно, если участник — плательщик или входит в распределение
 * какого-либо расхода: это нарушило бы целостность данных.
 * Возвращает { ok: true } или { ok: false, error, usedIn: [...] }.
 */
export function canDeleteParticipant(participantId, expenses) {
  const usedIn = [];
  for (const e of expenses) {
    if (e.paidBy === participantId) {
      usedIn.push(`плательщик расхода «${e.title}»`);
    } else if (e.participantIds.includes(participantId)) {
      usedIn.push(`участник распределения расхода «${e.title}»`);
    }
  }
  if (usedIn.length > 0) {
    return {
      ok: false,
      error: `Нельзя удалить участника: он используется в расходах (${usedIn.join(', ')}). Сначала удалите или измените эти расходы.`,
    };
  }
  return { ok: true };
}
