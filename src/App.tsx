import { useCallback, useEffect, useState } from 'react';
import type { AppState } from './lib/types';
import { emptyState } from './lib/service';
import { api, httpStorage, ApiError } from './lib/api';
import { calculateBalances, calculateTransfers, totalExpenses } from './lib/calc';
import { formatMoney } from './lib/money';
import ParticipantsSection from './components/ParticipantsSection';
import ExpensesSection from './components/ExpensesSection';
import BalanceSection from './components/BalanceSection';
import TransfersSection from './components/TransfersSection';

type Tab = 'participants' | 'expenses' | 'balance' | 'transfers';

/**
 * Веб-интерфейс. Все данные читаются и изменяются через REST API
 * backend-сервера, который хранит их в общем JSON-хранилище —
 * том же, которое используют MCP-инструменты.
 */
export default function App() {
  const [state, setState] = useState<AppState>(emptyState);
  const [activeTab, setActiveTab] = useState<Tab>('participants');
  const [notification, setNotification] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  /** Перечитывает состояние из общего хранилища */
  const refresh = useCallback(async () => {
    try {
      setState(await httpStorage.load());
      setLoadError(null);
    } catch (err) {
      setLoadError(
        err instanceof ApiError
          ? `Сервер недоступен: ${err.message}`
          : 'Не удалось подключиться к серверу. Убедитесь, что backend запущен (npm run dev:server).',
      );
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const showNotification = useCallback((msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  }, []);

  const handleLoadDemo = async () => {
    if (state.participants.length > 0 || state.expenses.length > 0) {
      if (!window.confirm('Заменить текущие данные демонстрационными?')) return;
    }
    try {
      await api.loadDemo();
      await refresh();
      showNotification('Демонстрационные данные загружены');
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : 'Не удалось загрузить демо-данные');
    }
  };

  const handleClearAll = async () => {
    if (
      !window.confirm(
        'Удалить ВСЕ данные? Это действие нельзя отменить. Все участники и расходы будут удалены.',
      )
    ) {
      return;
    }
    try {
      await api.clearTrip();
      await refresh();
      showNotification('Все данные удалены');
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : 'Не удалось удалить данные');
    }
  };

  const handleResetTrip = async () => {
    if (
      !window.confirm(
        'Начать новую поездку? Текущие данные (участники и расходы) будут удалены.',
      )
    ) {
      return;
    }
    try {
      await api.clearTrip();
      await refresh();
      setActiveTab('participants');
      showNotification('Новая поездка начата');
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : 'Не удалось начать новую поездку');
    }
  };

  const balances = calculateBalances(state);
  const transfers = calculateTransfers(balances);
  const total = totalExpenses(state);

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'participants', label: `Участники (${state.participants.length})` },
    { id: 'expenses', label: `Расходы (${state.expenses.length})` },
    { id: 'balance', label: 'Баланс' },
    { id: 'transfers', label: `Переводы (${transfers.length})` },
  ];

  return (
    <div>
      <header style={{ marginBottom: 24 }}>
        <h1>Расходы группы после поездки</h1>
        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
          Учёт общих расходов, балансов и взаиморасчётов. Данные общие с MCP-агентом.
        </p>
      </header>

      {loadError && (
        <div className="error-list" role="alert">
          <ul>
            <li>{loadError}</li>
          </ul>
        </div>
      )}

      {notification && (
        <div className="success-message" role="status">
          {notification}
        </div>
      )}

      <div className="header-actions">
        <button className="btn btn-primary" onClick={() => void handleLoadDemo()}>
          Загрузить демо-данные
        </button>
        <button className="btn" onClick={() => void handleResetTrip()}>
          Новая поездка
        </button>
        <button className="btn btn-danger" onClick={() => void handleClearAll()}>
          Удалить всё
        </button>
        <button className="btn" onClick={() => void refresh()}>
          Обновить
        </button>
        <div style={{ flex: 1 }} />
        <div style={{ textAlign: 'right', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
          <div>Общая сумма: <strong className="amount">{formatMoney(total)}</strong></div>
          <div>Расходов: <strong>{state.expenses.length}</strong></div>
        </div>
      </div>

      <nav className="nav">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={activeTab === tab.id ? 'active' : ''}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === 'participants' && (
        <ParticipantsSection
          state={state}
          refresh={refresh}
          showNotification={showNotification}
        />
      )}
      {activeTab === 'expenses' && (
        <ExpensesSection
          state={state}
          refresh={refresh}
          showNotification={showNotification}
        />
      )}
      {activeTab === 'balance' && <BalanceSection state={state} />}
      {activeTab === 'transfers' && <TransfersSection state={state} />}
    </div>
  );
}
