import type { AppState } from '../lib/types';
import { calculateBalances, calculateTransfers } from '../lib/calc';
import { formatMoney } from '../lib/money';

interface Props {
  state: AppState;
}

export default function TransfersSection({ state }: Props) {
  const balances = calculateBalances(state);
  const transfers = calculateTransfers(balances);

  if (state.participants.length === 0) {
    return (
      <div className="card">
        <h2>Взаиморасчёты</h2>
        <div className="empty-state">
          <p>Нет данных для расчёта переводов.</p>
          <p style={{ fontSize: '0.875rem' }}>Добавьте участников и расходы.</p>
        </div>
      </div>
    );
  }

  if (transfers.length === 0) {
    return (
      <div className="card">
        <h2>Взаиморасчёты</h2>
        <div className="empty-state">
          <p>Все балансы закрыты — переводы не требуются.</p>
        </div>
      </div>
    );
  }

  const participantName = (id: string) =>
    state.participants.find((p) => p.id === id)?.name ?? 'Неизвестный';

  return (
    <div className="card">
      <h2>Рекомендуемые переводы</h2>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: 0 }}>
        После выполнения этих переводов все балансы закроются с точностью до копейки.
      </p>

      {transfers.map((t, i) => (
        <div key={i} className="transfer-item">
          <span style={{ fontWeight: 500 }}>{participantName(t.fromId)}</span>
          <span className="transfer-arrow">→</span>
          <span style={{ fontWeight: 500 }}>{participantName(t.toId)}</span>
          <span style={{ flex: 1 }} />
          <span className="amount" style={{ fontSize: '1rem', fontWeight: 600 }}>
            {formatMoney(t.amountKopecks)}
          </span>
        </div>
      ))}

      <div style={{ marginTop: 16, padding: 12, background: '#f0fdf4', borderRadius: 'var(--radius)', fontSize: '0.875rem' }}>
        Итого переводов: <strong>{transfers.length}</strong>
      </div>
    </div>
  );
}
