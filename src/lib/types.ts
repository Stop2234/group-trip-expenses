/** Участник поездки */
export interface Participant {
  id: string;
  name: string;
}

/** Способ распределения расхода */
export type SplitMode = 'equal' | 'custom';

/** Расход */
export interface Expense {
  id: string;
  title: string;
  /** Сумма в копейках, строго положительная */
  amountKopecks: number;
  /** ID плательщика */
  paidById: string;
  /** ID участников, между которыми распределяется расход */
  participantIds: string[];
  /** Способ распределения */
  splitMode: SplitMode;
  /** Для custom: суммы в копейках по каждому участнику (ключ — participantId) */
  customShares?: Record<string, number>;
}

/** Баланс участника */
export interface Balance {
  participantId: string;
  /** Сколько реально заплатил (в копейках) */
  paid: number;
  /** Сколько должен был оплатить по распределению (в копейках) */
  owed: number;
  /** Итоговый баланс: paid - owed. Положительный — должны вернуть, отрицательный — должен доплатить */
  net: number;
}

/** Рекомендуемый перевод */
export interface Transfer {
  fromId: string;
  toId: string;
  amountKopecks: number;
}

/** Состояние приложения */
export interface AppState {
  participants: Participant[];
  expenses: Expense[];
}
