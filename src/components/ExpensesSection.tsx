import { useState } from 'react';
import type { AppState, Expense, SplitMode } from '../lib/types';
import { validateExpense } from '../lib/validation';
import { formatMoney, parseMoneyInput, splitEvenly, toRubles } from '../lib/money';
import { getShares } from '../lib/calc';
import { api, ApiError } from '../lib/api';

interface Props {
  state: AppState;
  /** Перечитывает состояние из общего хранилища (REST API → backend → JSON) */
  refresh: () => Promise<void>;
  showNotification: (msg: string) => void;
}

interface FormState {
  title: string;
  amountInput: string;
  paidById: string;
  participantIds: string[];
  splitMode: SplitMode;
  customShares: Record<string, string>;
}

const emptyForm = (defaultPayer = ''): FormState => ({
  title: '',
  amountInput: '',
  paidById: defaultPayer,
  participantIds: [],
  splitMode: 'equal',
  customShares: {},
});

export default function ExpensesSection({ state, refresh, showNotification }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [errors, setErrors] = useState<string[]>([]);

  const participantName = (id: string) =>
    state.participants.find((p) => p.id === id)?.name ?? 'Неизвестный';

  const openAddForm = () => {
    setForm(emptyForm(state.participants[0]?.id ?? ''));
    setEditingId(null);
    setErrors([]);
    setShowForm(true);
  };

  const openEditForm = (expense: Expense) => {
    const customShares: Record<string, string> = {};
    if (expense.customShares) {
      for (const [id, amount] of Object.entries(expense.customShares)) {
        customShares[id] = (amount / 100).toFixed(2);
      }
    }
    setForm({
      title: expense.title,
      amountInput: (expense.amountKopecks / 100).toFixed(2),
      paidById: expense.paidById,
      participantIds: [...expense.participantIds],
      splitMode: expense.splitMode,
      customShares,
    });
    setEditingId(expense.id);
    setErrors([]);
    setShowForm(true);
  };

  const handleSubmit = async () => {
    const amountKopecks = parseMoneyInput(form.amountInput);
    const customShares: Record<string, number> | undefined =
      form.splitMode === 'custom'
        ? Object.fromEntries(
            form.participantIds.map((id) => [
              id,
              parseMoneyInput(form.customShares[id] ?? '') ?? 0,
            ]),
          )
        : undefined;

    // Локальная валидация для мгновенной обратной связи
    const validation = validateExpense(
      {
        title: form.title,
        amountInput: form.amountInput,
        paidById: form.paidById,
        participantIds: form.participantIds,
        splitMode: form.splitMode,
        customShares,
      },
      state.participants,
      state.expenses,
      editingId ?? undefined,
    );

    if (!validation.valid) {
      setErrors(validation.errors);
      return;
    }

    if (amountKopecks === null || amountKopecks <= 0) {
      setErrors(['Сумма должна быть строго положительной']);
      return;
    }

    // payload для API: суммы в рублях, имена плательщика и участников
    const payload = {
      title: form.title.trim(),
      amountRubles: toRubles(amountKopecks),
      paidBy: participantName(form.paidById),
      participants: form.participantIds.map(participantName),
      splitMode: form.splitMode,
      customSharesRubles: customShares
        ? Object.fromEntries(
            Object.entries(customShares).map(([id, kopecks]) => [participantName(id), toRubles(kopecks)]),
          )
        : undefined,
    };

    try {
      if (editingId) {
        await api.updateExpense(editingId, payload);
        showNotification('Расход обновлён');
      } else {
        await api.addExpense(payload);
        showNotification(`Расход «${payload.title}» добавлен`);
      }
      await refresh();
      setShowForm(false);
      setForm(emptyForm());
      setEditingId(null);
      setErrors([]);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors([err.message]);
      } else {
        setErrors(['Не удалось сохранить расход']);
      }
    }
  };

  const handleDelete = async (id: string) => {
    const expense = state.expenses.find((e) => e.id === id);
    if (!expense) return;
    if (!window.confirm(`Удалить расход «${expense.title}»?`)) return;
    try {
      await api.removeExpense(id);
      await refresh();
      showNotification('Расход удалён');
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : 'Не удалось удалить расход');
    }
  };

  const toggleParticipant = (id: string) => {
    setForm((prev) => ({
      ...prev,
      participantIds: prev.participantIds.includes(id)
        ? prev.participantIds.filter((pid) => pid !== id)
        : [...prev.participantIds, id],
    }));
  };

  const handleSplitModeChange = (mode: SplitMode) => {
    setForm((prev) => {
      const customShares: Record<string, string> = {};
      if (mode === 'custom' && prev.participantIds.length > 0) {
        const amountKopecks = parseMoneyInput(prev.amountInput);
        if (amountKopecks !== null && amountKopecks > 0) {
          const shares = splitEvenly(amountKopecks, prev.participantIds.length);
          prev.participantIds.forEach((id, i) => {
            customShares[id] = (shares[i] / 100).toFixed(2);
          });
        }
      }
      return { ...prev, splitMode: mode, customShares };
    });
  };

  const handleAmountChange = (value: string) => {
    setForm((prev) => {
      const updated = { ...prev, amountInput: value };
      // Автоматически пересчитываем равные доли при смене суммы
      if (prev.splitMode === 'custom' && prev.participantIds.length > 0) {
        const amountKopecks = parseMoneyInput(value);
        if (amountKopecks !== null && amountKopecks > 0) {
          const shares = splitEvenly(amountKopecks, prev.participantIds.length);
          const customShares: Record<string, string> = {};
          prev.participantIds.forEach((id, i) => {
            customShares[id] = (shares[i] / 100).toFixed(2);
          });
          updated.customShares = customShares;
        }
      }
      return updated;
    });
  };

  return (
    <div className="card">
      <div className="section-title">
        <h2>Расходы</h2>
        {!showForm && (
          <button className="btn btn-primary btn-sm" onClick={openAddForm}>
            + Добавить расход
          </button>
        )}
      </div>

      {state.participants.length === 0 && (
        <div className="empty-state">
          <p>Сначала добавьте участников поездки.</p>
        </div>
      )}

      {showForm && (
        <div style={{ marginBottom: 20, padding: 16, background: '#f9fafb', borderRadius: 'var(--radius)' }}>
          <h3>{editingId ? 'Редактировать расход' : 'Новый расход'}</h3>

          {errors.length > 0 && (
            <div className="error-list">
              <ul>
                {errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="form-group">
            <label>Название</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
              placeholder="Например: Ужин в ресторане"
              maxLength={100}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Сумма (₽)</label>
              <input
                type="text"
                value={form.amountInput}
                onChange={(e) => handleAmountChange(e.target.value)}
                placeholder="0,00"
                inputMode="decimal"
              />
            </div>
            <div className="form-group">
              <label>Плательщик</label>
              <select
                value={form.paidById}
                onChange={(e) => setForm((prev) => ({ ...prev, paidById: e.target.value }))}
              >
                <option value="">— Выберите —</option>
                {state.participants.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label>Участники расхода</label>
            <div className="checkbox-group">
              {state.participants.map((p) => (
                <label key={p.id} className="checkbox-item">
                  <input
                    type="checkbox"
                    checked={form.participantIds.includes(p.id)}
                    onChange={() => toggleParticipant(p.id)}
                  />
                  {p.name}
                </label>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label>Способ распределения</label>
            <div className="checkbox-group">
              <label className="checkbox-item">
                <input
                  type="radio"
                  name="splitMode"
                  checked={form.splitMode === 'equal'}
                  onChange={() => handleSplitModeChange('equal')}
                />
                Равномерно
              </label>
              <label className="checkbox-item">
                <input
                  type="radio"
                  name="splitMode"
                  checked={form.splitMode === 'custom'}
                  onChange={() => handleSplitModeChange('custom')}
                />
                Задать доли вручную
              </label>
            </div>
          </div>

          {form.splitMode === 'custom' && form.participantIds.length > 0 && (
            <div className="form-group">
              <label>Доли участников (₽)</label>
              {form.participantIds.map((id) => (
                <div key={id} className="custom-share-input">
                  <span>{participantName(id)}</span>
                  <input
                    type="text"
                    value={form.customShares[id] ?? ''}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        customShares: { ...prev.customShares, [id]: e.target.value },
                      }))
                    }
                    placeholder="0,00"
                    inputMode="decimal"
                  />
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button className="btn btn-primary" onClick={() => void handleSubmit()}>
              {editingId ? 'Сохранить' : 'Добавить'}
            </button>
            <button
              className="btn"
              onClick={() => {
                setShowForm(false);
                setEditingId(null);
                setErrors([]);
              }}
            >
              Отмена
            </button>
          </div>
        </div>
      )}

      {state.expenses.length === 0 && state.participants.length > 0 && (
        <div className="empty-state">
          <p>Пока нет расходов.</p>
          <p style={{ fontSize: '0.875rem' }}>Добавьте первый расход или загрузите демо-данные.</p>
        </div>
      )}

      {state.expenses.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Название</th>
              <th style={{ width: '120px' }}>Сумма</th>
              <th style={{ width: '120px' }}>Плательщик</th>
              <th style={{ width: '200px' }}>Распределение</th>
              <th style={{ width: '140px' }}>Действия</th>
            </tr>
          </thead>
          <tbody>
            {state.expenses.map((expense) => {
              const shares = getShares(expense);
              return (
                <tr key={expense.id}>
                  <td>{expense.title}</td>
                  <td className="amount">{formatMoney(expense.amountKopecks)}</td>
                  <td>{participantName(expense.paidById)}</td>
                  <td>
                    {expense.splitMode === 'equal' ? (
                      <span>Равно: {expense.participantIds.length} уч.</span>
                    ) : (
                      <span>
                        {shares.map(([id, share]) => `${participantName(id)}: ${formatMoney(share)}`).join(', ')}
                      </span>
                    )}
                  </td>
                  <td>
                    <button className="btn btn-sm" onClick={() => openEditForm(expense)}>
                      Изменить
                    </button>{' '}
                    <button className="btn btn-sm btn-danger" onClick={() => void handleDelete(expense.id)}>
                      Удалить
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
