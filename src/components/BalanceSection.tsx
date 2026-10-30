import type { AppState } from '../lib/types';
import { calculateBalances, totalExpenses } from '../lib/calc';
import { formatMoney } from '../lib/money';

interface Props {
  state: AppState;
}

export default function BalanceSection({ state }: Props) {
  const balances = calculateBalances(state);
  const total = totalExpenses(state);

  if (state.participants.length === 0) {
    return (
      <div className="card">
        <h2>Баланс</h2>
        <div className="empty-state">
          <p>Нет данных для расчёта баланса.</p>
          <p style={{ fontSize: '0.875rem' }}>Добавьте участников и расходы.</p>
        </div>
      </div>
    );
  }

  const perPerson = state.participants.length > 0 ? Math.round(total / state.participants.length) : 0;

  return (
    <div className="card">
      <h2>Баланс участников</h2>

      <div style={{ marginBottom: 16, padding: 12, background: '#f0f9ff', borderRadius: 'var(--radius)' }}>
        <strong>Общая сумма расходов:</strong>{' '}
        <span className="amount">{formatMoney(total)}</span>
        <span style={{ marginLeft: 16 }}>
          <strong>В среднем на человека:</strong>{' '}
          <span className="amount">{formatMoney(perPerson)}</span>
        </span>
      </div>

      <table>
        <thead>
          <tr>
            <th>Участник</th>
            <th style={{ width: '140px' }}>Заплатил</th>
            <th style={{ width: '140px' }}>Должен был</th>
            <th style={{ width: '140px' }}>Баланс</th>
          </tr>
        </thead>
        <tbody>
          {balances.map((b) => {
            const name = state.participants.find((p) => p.id === b.participantId)?.name ?? '—';
            const netClass = b.net > 0 ? 'amount-positive' : b.net < 0 ? 'amount-negative' : '';
            return (
              <tr key={b.participantId}>
                <td>{name}</td>
                <td className="amount">{formatMoney(b.paid)}</td>
                <td className="amount">{formatMoney(b.owed)}</td>
                <td className={`amount ${netClass}`}>
                  {b.net > 0 ? '+' : ''}{formatMoney(b.net)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div style={{ marginTop: 16, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
        <p style={{ margin: '4px 0' }}>
          <span className="amount-positive">●</span> Положительный баланс — участнику должны вернуть деньги
        </p>
        <p style={{ margin: '4px 0' }}>
          <span className="amount-negative">●</span> Отрицательный баланс — участник должен доплатить
        </p>
      </div>
    </div>
  );
}
