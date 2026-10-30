import type { AppState } from './types';
import type { StorageAdapter } from './service';
import { normalizeState } from './service';

/**
 * HTTP-клиент REST API backend-сервера.
 * Реализует StorageAdapter, поэтому используется вместо localStorage:
 * веб-интерфейс читает и пишет данные через API в то же хранилище,
 * что и MCP-инструменты.
 */
const API_BASE = (import.meta.env?.VITE_API_BASE as string | undefined) ?? '/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      body && typeof body === 'object' && 'error' in body
        ? (body as { error?: { message?: string } }).error?.message ?? `HTTP ${res.status}`
        : `HTTP ${res.status}`;
    throw new ApiError(message, res.status, body);
  }
  return body as T;
}

/** Ошибка REST API с кодом и структурированным телом */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get code(): string {
    const err = (this.body as { error?: { code?: string } } | null)?.error;
    return err?.code ?? 'UNKNOWN';
  }
}

/** Данные поездки через REST API (общее хранилище с MCP) */
export const httpStorage: StorageAdapter = {
  async load(): Promise<AppState> {
    return normalizeState(await request<unknown>('/state'));
  },
  async save(): Promise<void> {
    throw new Error(
      'Прямая запись состояния недоступна: используйте операции API (POST/DELETE /api/...) или MCP-инструменты',
    );
  },
};

/** Операции REST API для компонентов интерфейса */
export const api = {
  getSummary: () => request<unknown>('/summary'),
  getSettlements: () => request<unknown>('/settlements'),

  addParticipant: (name: string) =>
    request<{ id: string; name: string }>('/participants', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  removeParticipant: (id: string) =>
    request<unknown>(`/participants/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  addExpense: (payload: {
    title: string;
    amountRubles: number;
    paidBy: string;
    participants: string[];
    splitMode?: 'equal' | 'custom';
    customSharesRubles?: Record<string, number>;
  }) =>
    request<{ id: string }>('/expenses', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateExpense: (
    id: string,
    payload: {
      title: string;
      amountRubles: number;
      paidBy: string;
      participants: string[];
      splitMode?: 'equal' | 'custom';
      customSharesRubles?: Record<string, number>;
    },
  ) =>
    request<{ id: string }>(`/expenses/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  removeExpense: (id: string) =>
    request<unknown>(`/expenses/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  loadDemo: () => request<AppState>('/demo', { method: 'POST' }),

  clearTrip: () => request<AppState>('/trip', { method: 'DELETE' }),
};
