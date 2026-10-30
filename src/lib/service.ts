import type { AppState, Balance, Expense, Participant } from './types';
import {
  calculateBalances,
  calculateTransfers,
  totalExpenses,
  validateCustomShares,
} from './calc';
import { validateExpense, validateParticipantName, canDeleteParticipant } from './validation';
import { toKopecks, toRubles } from './money';
import { createDemoState } from './demo';
import { randomUUID } from './crypto';

/**
 * Адаптер хранения данных.
 * Единственная точка доступа к состоянию поездки.
 * Frontend использует HttpStorageAdapter (REST API),
 * backend — JsonFileStorageAdapter (JSON-файл).
 * Оба варианта хранят ОДНИ И ТЕ ЖЕ данные.
 */
export interface StorageAdapter {
  load(): Promise<AppState>;
  save(state: AppState): Promise<void>;
}

/** Пустое состояние поездки */
export function emptyState(): AppState {
  return { participants: [], expenses: [] };
}

/** Нормализует произвольный объект в корректное AppState */
export function normalizeState(raw: unknown): AppState {
  const obj = raw as Partial<AppState> | null;
  if (!obj || typeof obj !== 'object') return emptyState();
  const participants = Array.isArray(obj.participants)
    ? obj.participants.filter(
        (p): p is Participant =>
          !!p && typeof p === 'object' && typeof p.id === 'string' && typeof p.name === 'string',
      )
    : [];
  const knownIds = new Set(participants.map((p) => p.id));
  const expenses = Array.isArray(obj.expenses)
    ? obj.expenses.filter((e): e is Expense => {
        if (!e || typeof e !== 'object') return false;
        return (
          typeof e.id === 'string' &&
          typeof e.title === 'string' &&
          Number.isInteger(e.amountKopecks) &&
          typeof e.paidById === 'string' &&
          Array.isArray(e.participantIds) &&
          (e.splitMode === 'equal' || e.splitMode === 'custom')
        );
      })
    : [];
  const validExpenses = expenses.filter(
    (e) => knownIds.has(e.paidById) && e.participantIds.every((id) => knownIds.has(id)),
  );
  return { participants, expenses: validExpenses };
}

/** Структурированный результат операции */
export type OperationResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string } };

/** Входные данные расхода (суммы в рублях, копейки вычисляются кодом) */
export interface ExpenseInput {
  title: string;
  /** Сумма в рублях (можно с копейками, например 3200.50) */
  amountRubles: number;
  /** Имя или ID плательщика */
  paidBy: string;
  /** Имена или ID участников распределения */
  participants: string[];
  /** Способ распределения; по умолчанию equal */
  splitMode?: 'equal' | 'custom';
  /** Для custom: суммы в рублях по каждому участнику (ключ — имя или ID) */
  customSharesRubles?: Record<string, number>;
}

function fail<T>(code: string, message: string): OperationResult<T> {
  return { success: false, error: { code, message } };
}

function ok<T>(data: T): OperationResult<T> {
  return { success: true, data };
}

/**
 * Единый сервис предметной области поездки.
 * Используется и REST API (для веб-интерфейса), и MCP-инструментами.
 * Все денежные расчёты выполняются здесь (в целых копейках).
 */
export class ExpenseService {
  constructor(private readonly storage: StorageAdapter) {}

  /** Текущее состояние поездки */
  async getState(): Promise<AppState> {
    return normalizeState(await this.storage.load());
  }

  /** Балансы участников (копейки) */
  async getBalances(): Promise<Balance[]> {
    return calculateBalances(await this.getState());
  }

  /** Итоговая статистика поездки */
  async getSummary() {
    const state = await this.getState();
    const balances = calculateBalances(state);
    const transfers = calculateTransfers(balances);
    return {
      participants: state.participants,
      expenses: state.expenses,
      balances,
      transfers,
      totalExpensesKopecks: totalExpenses(state),
      totalExpensesRubles: toRubles(totalExpenses(state)),
    };
  }

  /** Взаиморасчёты: балансы + рекомендуемые переводы (рассчитывает код приложения) */
  async getSettlements() {
    const state = await this.getState();
    const balances = calculateBalances(state);
    const transfers = calculateTransfers(balances);
    return { balances, transfers, totalExpensesKopecks: totalExpenses(state) };
  }

  /** Добавляет участника. Принимает имя. */
  async addParticipant(name: string): Promise<OperationResult<Participant>> {
    const state = await this.getState();
    const validation = validateParticipantName(name, state.participants);
    if (!validation.valid) {
      return fail('VALIDATION_ERROR', validation.errors.join('; '));
    }
    const participant: Participant = { id: randomUUID(), name: name.trim() };
    state.participants.push(participant);
    await this.storage.save(state);
    return ok(participant);
  }

  /** Удаляет участника. Безопасно: отказывается, если участник используется в расходах. */
  async removeParticipant(idOrName: string): Promise<OperationResult<Participant>> {
    const state = await this.getState();
    const participant = findParticipant(state.participants, idOrName);
    if (!participant) {
      return fail('NOT_FOUND', `Участник «${idOrName}» не найден`);
    }
    const safety = canDeleteParticipant(participant.id, state.expenses);
    if (!safety.safe) {
      return fail('UNSAFE_DELETE', safety.reason ?? 'Участника нельзя удалить');
    }
    state.participants = state.participants.filter((p) => p.id !== participant.id);
    await this.storage.save(state);
    return ok(participant);
  }

  /** Добавляет расход. Все суммы в рублях; расчёт долей — кодом приложения. */
  async addExpense(input: ExpenseInput): Promise<OperationResult<Expense>> {
    const state = await this.getState();

    // Сумма: строго положительное число, максимум 2 знака после запятой
    if (typeof input.amountRubles !== 'number' || !Number.isFinite(input.amountRubles)) {
      return fail('INVALID_AMOUNT', 'Сумма должна быть числом');
    }
    if (Math.abs(input.amountRubles * 100 - Math.round(input.amountRubles * 100)) > 1e-6) {
      return fail(
        'INVALID_AMOUNT',
        'Сумма может содержать не более двух знаков после запятой (копейки)',
      );
    }
    const amountKopecks = toKopecks(input.amountRubles);
    if (amountKopecks <= 0) {
      return fail('INVALID_AMOUNT', 'Сумма должна быть строго положительной');
    }

    // Плательщик и участники: ищем по имени или ID
    const payer = findParticipant(state.participants, input.paidBy);
    if (!payer) {
      return fail('PAYER_NOT_FOUND', `Плательщик «${input.paidBy}» не найден`);
    }
    const splitMode = input.splitMode ?? 'equal';
    if (splitMode !== 'equal' && splitMode !== 'custom') {
      return fail('INVALID_SPLIT_MODE', `Неизвестный способ распределения: ${String(splitMode)}`);
    }
    if (!Array.isArray(input.participants) || input.participants.length === 0) {
      return fail('NO_PARTICIPANTS', 'Нужно указать участников распределения');
    }

    const participantIds: string[] = [];
    const missing: string[] = [];
    const seen = new Set<string>();
    for (const ref of input.participants) {
      const p = findParticipant(state.participants, ref);
      if (!p) {
        missing.push(ref);
      } else if (seen.has(p.id)) {
        return fail('DUPLICATE_PARTICIPANT', `Участник «${ref}» указан дважды`);
      } else {
        seen.add(p.id);
        participantIds.push(p.id);
      }
    }
    if (missing.length > 0) {
      return fail('PARTICIPANT_NOT_FOUND', `Участники не найдены: ${missing.join(', ')}`);
    }

    // Неравное распределение: доли суммируются до суммы расхода
    let customShares: Record<string, number> | undefined;
    if (splitMode === 'custom') {
      if (!input.customSharesRubles || Object.keys(input.customSharesRubles).length === 0) {
        return fail('NO_SHARES', 'Для неравного распределения укажите доли каждого участника');
      }
      customShares = {};
      for (const ref of Object.keys(input.customSharesRubles)) {
        const p = findParticipant(state.participants, ref);
        if (!p) {
          return fail('PARTICIPANT_NOT_FOUND', `Участник доли «${ref}» не найден`);
        }
        if (!seen.has(p.id)) {
          return fail(
            'PARTICIPANT_NOT_IN_SPLIT',
            `Участник «${ref}» не входит в список участников распределения`,
          );
        }
        const rub = input.customSharesRubles[ref];
        if (typeof rub !== 'number' || !Number.isFinite(rub) || rub < 0) {
          return fail('INVALID_SHARE', `Доля участника «${ref}» должна быть неотрицательным числом`);
        }
        customShares[p.id] = toKopecks(rub);
      }
      const totalShares = participantIds.reduce((sum, id) => sum + (customShares?.[id] ?? 0), 0);
      if (totalShares !== amountKopecks) {
        return fail(
          'SHARES_MISMATCH',
          `Сумма долей (${toRubles(totalShares).toFixed(2)} ₽) не совпадает с суммой расхода (${toRubles(amountKopecks).toFixed(2)} ₽)`,
        );
      }
    }

    // Собираем кандидата и прогоняем через общую валидацию приложения
    const candidate: Expense = {
      id: randomUUID(),
      title: input.title.trim(),
      amountKopecks,
      paidById: payer.id,
      participantIds,
      splitMode,
      ...(customShares ? { customShares } : {}),
    };
    const validation = validateExpense(
      {
        title: candidate.title,
        amountInput: toRubles(candidate.amountKopecks).toFixed(2),
        paidById: candidate.paidById,
        participantIds: candidate.participantIds,
        splitMode: candidate.splitMode,
        customShares: candidate.customShares,
      },
      state.participants,
      state.expenses,
    );
    if (!validation.valid) {
      return fail('VALIDATION_ERROR', validation.errors.join('; '));
    }
    if (!validateCustomShares(candidate)) {
      return fail('SHARES_MISMATCH', 'Сумма долей не совпадает с суммой расхода');
    }

    state.expenses.push(candidate);
    await this.storage.save(state);
    return ok(candidate);
  }

  /** Обновляет расход по ID */
  async updateExpense(
    id: string,
    input: ExpenseInput,
  ): Promise<OperationResult<Expense>> {
    const state = await this.getState();
    const existing = state.expenses.find((e) => e.id === id);
    if (!existing) {
      return fail('NOT_FOUND', `Расход с ID «${id}» не найден`);
    }
    // Временно убираем расход из списка, чтобы валидация дубликатов его игнорировала
    state.expenses = state.expenses.filter((e) => e.id !== id);
    const result = await this.addExpense(input);
    if (!result.success) {
      // Возвращаем исходный список без изменений
      state.expenses.push(existing);
      await this.storage.save(state);
      return result;
    }
    // Сохраняем исходный ID расхода
    const updated = { ...result.data, id };
    const idx = state.expenses.findIndex((e) => e.id === result.data.id);
    if (idx >= 0) state.expenses[idx] = updated;
    await this.storage.save(state);
    return ok(updated);
  }

  /** Удаляет расход по ID */
  async removeExpense(id: string): Promise<OperationResult<Expense>> {
    const state = await this.getState();
    const expense = state.expenses.find((e) => e.id === id);
    if (!expense) {
      return fail('NOT_FOUND', `Расход с ID «${id}» не найден`);
    }
    state.expenses = state.expenses.filter((e) => e.id !== id);
    await this.storage.save(state);
    return ok(expense);
  }

  /** Загружает демонстрационные данные (заменяет текущие) */
  async loadDemo(): Promise<AppState> {
    const state = createDemoState();
    await this.storage.save(state);
    return state;
  }

  /** Очищает все данные поездки */
  async clearAll(): Promise<AppState> {
    const state = emptyState();
    await this.storage.save(state);
    return state;
  }
}

/** Ищет участника по ID или по имени (регистронезависимо, точное совпадение) */
export function findParticipant(
  participants: Participant[],
  idOrName: string,
): Participant | undefined {
  const ref = idOrName.trim();
  return (
    participants.find((p) => p.id === ref) ??
    participants.find((p) => p.name.toLowerCase() === ref.toLowerCase())
  );
}
