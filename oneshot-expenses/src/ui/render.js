/**
 * Рендеринг секций приложения в DOM.
 * Каждая функция строит HTML для своей секции на основе состояния.
 */
import { formatMoney } from '../core/money.js';
import { escapeHtml, splitDescription, splitModeLabel } from './format.js';

export function renderParticipants(participants, expenses) {
  if (participants.length === 0) {
    return `
      <p class="empty-state">Пока нет ни одного участника.</p>
      <p class="empty-state">Добавьте первого участника в форме выше или загрузите демо-данные.</p>`;
  }

  const rows = participants
    .map((p) => {
      const isUsed =
        expenses.some((e) => e.paidBy === p.id) ||
        expenses.some((e) => e.participantIds.includes(p.id));
      const deleteButton = isUsed
        ? `<button class="btn btn-danger btn-small" data-delete-participant="${escapeHtml(p.id)}" disabled title="Участник используется в расходах — сначала удалите или измените их">Удалить</button>`
        : `<button class="btn btn-danger btn-small" data-delete-participant="${escapeHtml(p.id)}">Удалить</button>`;
      return `
        <li class="participant-item">
          <span class="participant-name">${escapeHtml(p.name)}</span>
          ${deleteButton}
        </li>`;
    })
    .join('');

  return `<ul class="participant-list">${rows}</ul>`;
}

export function renderExpenses(expenses, participantsById) {
  if (expenses.length === 0) {
    return `
      <p class="empty-state">Расходов пока нет.</p>
      <p class="empty-state">Добавьте первый расход в форме выше или загрузите демо-данные.</p>`;
  }

  const items = expenses
    .map((e) => {
      const payerName = participantsById.get(e.paidBy)?.name ?? '—';
      return `
        <li class="expense-item">
          <div class="expense-main">
            <span class="expense-title">${escapeHtml(e.title)}</span>
            <span class="expense-amount">${formatMoney(e.amountKopecks)}</span>
          </div>
          <div class="expense-details">
            <span>Плательщик: ${escapeHtml(payerName)}</span>
            <span>Деление: ${splitModeLabel(e)}</span>
            <span>${splitDescription(e, participantsById)}</span>
          </div>
          <div class="expense-actions">
            <button class="btn btn-secondary btn-small" data-edit-expense="${escapeHtml(e.id)}">Изменить</button>
            <button class="btn btn-danger btn-small" data-delete-expense="${escapeHtml(e.id)}">Удалить</button>
          </div>
        </li>`;
    })
    .join('');

  return `<ul class="expense-list">${items}</ul>`;
}

export function renderSummary(participants, expenses, balances, transfers) {
  const participantsById = new Map(participants.map((p) => [p.id, p]));
  const total = expenses.reduce((sum, e) => sum + e.amountKopecks, 0);

  const rows = balances
    .map((b) => {
      const name = participantsById.get(b.participantId)?.name ?? '—';
      const netClass = b.net > 0 ? 'balance-positive' : b.net < 0 ? 'balance-negative' : 'balance-zero';
      const netLabel = b.net > 0 ? 'должны вернуть' : b.net < 0 ? 'должен доплатить' : 'без долгов';
      return `
        <tr>
          <td>${escapeHtml(name)}</td>
          <td class="num">${formatMoney(b.paid)}</td>
          <td class="num">${formatMoney(b.owed)}</td>
          <td class="num ${netClass}">${formatMoney(b.net)}</td>
          <td class="balance-label">${netLabel}</td>
        </tr>`;
    })
    .join('');

  let transfersHtml;
  if (transfers.length === 0) {
    transfersHtml = '<p class="empty-state">Долгов нет — все расчёты закрыты.</p>';
  } else {
    const transferItems = transfers
      .map((t) => {
        const fromName = participantsById.get(t.fromId)?.name ?? '—';
        const toName = participantsById.get(t.toId)?.name ?? '—';
        return `
          <li class="transfer-item">
            <span class="transfer-route">${escapeHtml(fromName)} → ${escapeHtml(toName)}</span>
            <span class="expense-amount">${formatMoney(t.amountKopecks)}</span>
          </li>`;
      })
      .join('');
    transfersHtml = `<ul class="transfer-list">${transferItems}</ul>`;
  }

  return `
    <div class="stats-cards">
      <div class="stat-card">
        <div class="stat-value">${formatMoney(total)}</div>
        <div class="stat-label">Общая сумма расходов</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${expenses.length}</div>
        <div class="stat-label">Количество расходов</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${participants.length}</div>
        <div class="stat-label">Участников</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${transfers.length}</div>
        <div class="stat-label">Переводов для закрытия долгов</div>
      </div>
    </div>

    <h3>Баланс участников</h3>
    <table class="summary-table">
      <thead>
        <tr>
          <th>Участник</th>
          <th class="num">Заплатил</th>
          <th class="num">Должен был оплатить</th>
          <th class="num">Итоговый баланс</th>
          <th>Статус</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="hint">Положительный баланс — участнику должны вернуть деньги. Отрицательный — участник должен доплатить.</p>

    <h3>Рекомендуемые переводы</h3>
    ${transfersHtml}
    <p class="hint">После выполнения этих переводов все балансы закроются с точностью до копейки.</p>`;
}
