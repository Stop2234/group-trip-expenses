/**
 * Точка входа приложения: состояние, обработчики событий, связка UI и расчётного ядра.
 */
import { calculateBalances, calculateTransfers } from './core/settlement.js';
import { canDeleteParticipant, validateExpenseForm, validateParticipantName } from './core/validation.js';
import { createDemoData } from './core/demo.js';
import { clearState, loadState, saveState } from './storage.js';
import { renderExpenses, renderParticipants, renderSummary } from './ui/render.js';
import { escapeHtml } from './ui/format.js';

// ---------- Состояние ----------

function emptyState() {
  return { participants: [], expenses: [] };
}

function loadInitialState() {
  return loadState() ?? emptyState();
}

let state = loadInitialState();
let editingExpenseId = null; // id расхода, который сейчас редактируется (null — не редактируем)

// ---------- Утилиты ----------

function participantsById() {
  return new Map(state.participants.map((p) => [p.id, p]));
}

function findExpense(id) {
  return state.expenses.find((e) => e.id === id) ?? null;
}

function persist() {
  saveState(state);
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.classList.add('toast-visible'), 10);
  setTimeout(() => {
    toast.classList.remove('toast-visible');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function showFormError(containerId, message) {
  const container = document.getElementById(containerId);
  container.textContent = message;
  container.classList.add('form-error-visible');
}

function clearFormError(containerId) {
  const container = document.getElementById(containerId);
  container.textContent = '';
  container.classList.remove('form-error-visible');
}

// ---------- Рендер ----------

function render() {
  const balances = calculateBalances(state.participants, state.expenses);
  const transfers = calculateTransfers(balances);

  document.getElementById('participants-list').innerHTML = renderParticipants(
    state.participants,
    state.expenses,
  );
  document.getElementById('expenses-list').innerHTML = renderExpenses(
    state.expenses,
    participantsById(),
  );
  document.getElementById('summary-content').innerHTML = renderSummary(
    state.participants,
    state.expenses,
    balances,
    transfers,
  );

  updateFormOptions();

  document.querySelectorAll('.tab-button').forEach((btn) => {
    btn.classList.toggle('tab-button-active', btn.dataset.tab === activeTab);
  });
  document.querySelectorAll('.tab-panel').forEach((panel) => {
    panel.classList.toggle('tab-panel-active', panel.id === `tab-${activeTab}`);
  });
}

// ---------- Формы: динамические списки ----------

function updateFormOptions() {
  const payerSelect = document.getElementById('expense-payer');
  const currentPayer = payerSelect.value;
  payerSelect.innerHTML =
    '<option value="">— выберите плательщика —</option>' +
    state.participants
      .map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`)
      .join('');
  if (state.participants.some((p) => p.id === currentPayer)) {
    payerSelect.value = currentPayer;
  }

  const splitContainer = document.getElementById('split-participants');
  splitContainer.innerHTML = state.participants
    .map(
      (p) => `
      <label class="checkbox-label">
        <input type="checkbox" name="split-participant" value="${escapeHtml(p.id)}">
        <span>${escapeHtml(p.name)}</span>
      </label>`,
    )
    .join('');

  refreshCustomAmountFields();
}

function getSelectedSplitParticipantIds() {
  return [...document.querySelectorAll('input[name="split-participant"]:checked')].map(
    (cb) => cb.value,
  );
}

function refreshCustomAmountFields() {
  const mode = document.querySelector('input[name="split-mode"]:checked')?.value ?? 'equal';
  const wrapper = document.getElementById('custom-amounts');
  if (mode !== 'custom') {
    wrapper.innerHTML = '';
    wrapper.classList.add('hidden');
    return;
  }
  wrapper.classList.remove('hidden');
  const ids = getSelectedSplitParticipantIds();
  const byId = participantsById();
  wrapper.innerHTML =
    '<p class="hint">Укажите сумму доли для каждого участника. Сумма долей должна совпадать с суммой расхода.</p>' +
    ids
      .map(
        (id) => `
        <div class="form-row custom-amount-row">
          <label for="custom-amount-${escapeHtml(id)}">${escapeHtml(byId.get(id)?.name ?? '')}</label>
          <input type="text" id="custom-amount-${escapeHtml(id)}" class="custom-amount-input" placeholder="0.00" inputmode="decimal">
        </div>`,
      )
      .join('');
}

// ---------- Участники ----------

function handleAddParticipant(event) {
  event.preventDefault();
  clearFormError('participant-error');
  const form = event.target;
  const input = form.elements['participant-name'];
  const result = validateParticipantName(input.value, state.participants);
  if (!result.ok) {
    showFormError('participant-error', result.error);
    return;
  }
  state.participants.push({ id: crypto.randomUUID(), name: result.name });
  persist();
  form.reset();
  render();
  showToast(`Участник «${result.name}» добавлен`, 'success');
}

function handleDeleteParticipant(event) {
  const button = event.target.closest('[data-delete-participant]');
  if (!button) return;
  const id = button.dataset.deleteParticipant;
  const participant = state.participants.find((p) => p.id === id);
  if (!participant) return;

  const check = canDeleteParticipant(id, state.expenses);
  if (!check.ok) {
    showToast(check.error, 'error');
    return;
  }
  if (!window.confirm(`Удалить участника «${participant.name}»?`)) return;

  state.participants = state.participants.filter((p) => p.id !== id);
  persist();
  render();
  showToast(`Участник «${participant.name}» удалён`, 'success');
}

// ---------- Расходы ----------

function collectExpenseFormData() {
  const form = document.getElementById('expense-form');
  const splitMode = document.querySelector('input[name="split-mode"]:checked')?.value ?? 'equal';
  const customAmounts = {};
  if (splitMode === 'custom') {
    for (const id of getSelectedSplitParticipantIds()) {
      const input = document.getElementById(`custom-amount-${id}`);
      customAmounts[id] = input ? input.value : '';
    }
  }
  return {
    title: form.elements['expense-title'].value,
    amount: form.elements['expense-amount'].value,
    paidBy: form.elements['expense-payer'].value,
    splitMode,
    splitParticipantIds: getSelectedSplitParticipantIds(),
    customAmounts,
  };
}

function handleExpenseSubmit(event) {
  event.preventDefault();
  clearFormError('expense-error');
  const raw = collectExpenseFormData();
  const result = validateExpenseForm(raw, state.participants);
  if (!result.ok) {
    const messages = Object.values(result.errors)
      .flat()
      .filter(Boolean);
    showFormError('expense-error', messages.join(' '));
    return;
  }

  if (editingExpenseId) {
    const expense = findExpense(editingExpenseId);
    if (expense) {
      Object.assign(expense, result.data);
      showToast(`Расход «${result.data.title}» обновлён`, 'success');
    }
    exitEditMode();
  } else {
    state.expenses.push({ id: crypto.randomUUID(), ...result.data });
    showToast(`Расход «${result.data.title}» добавлен`, 'success');
  }
  persist();
  document.getElementById('expense-form').reset();
  refreshCustomAmountFields();
  render();
}

function handleEditExpense(event) {
  const button = event.target.closest('[data-edit-expense]');
  if (!button) return;
  const expense = findExpense(button.dataset.editExpense);
  if (!expense) return;

  editingExpenseId = expense.id;
  const form = document.getElementById('expense-form');
  form.elements['expense-title'].value = expense.title;
  form.elements['expense-amount'].value = (expense.amountKopecks / 100).toFixed(2).replace('.', ',');
  form.elements['expense-payer'].value = expense.paidBy;

  document.querySelectorAll('input[name="split-mode"]').forEach((radio) => {
    radio.checked = radio.value === expense.splitMode;
  });
  document.querySelectorAll('input[name="split-participant"]').forEach((cb) => {
    cb.checked = expense.participantIds.includes(cb.value);
  });
  if (expense.splitMode === 'custom' && expense.customShares) {
    setTimeout(() => {
      for (const [id, kopecks] of Object.entries(expense.customShares)) {
        const input = document.getElementById(`custom-amount-${id}`);
        if (input) input.value = (kopecks / 100).toFixed(2).replace('.', ',');
      }
    }, 0);
  }
  refreshCustomAmountFields();

  document.getElementById('expense-submit').textContent = 'Сохранить изменения';
  document.getElementById('expense-cancel').classList.remove('hidden');
  document.getElementById('expense-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function exitEditMode() {
  editingExpenseId = null;
  document.getElementById('expense-form').reset();
  document.getElementById('expense-submit').textContent = 'Добавить расход';
  document.getElementById('expense-cancel').classList.add('hidden');
  refreshCustomAmountFields();
}

function handleDeleteExpense(event) {
  const button = event.target.closest('[data-delete-expense]');
  if (!button) return;
  const expense = findExpense(button.dataset.deleteExpense);
  if (!expense) return;
  if (!window.confirm(`Удалить расход «${expense.title}»?`)) return;

  state.expenses = state.expenses.filter((e) => e.id !== expense.id);
  if (editingExpenseId === expense.id) exitEditMode();
  persist();
  render();
  showToast(`Расход «${expense.title}» удалён`, 'success');
}

// ---------- Демо и сброс ----------

function handleLoadDemo() {
  if (state.participants.length > 0 || state.expenses.length > 0) {
    if (!window.confirm('Загрузка демо-данных заменит текущие данные. Продолжить?')) return;
  }
  state = createDemoData();
  exitEditMode();
  persist();
  render();
  showToast('Демо-данные загружены', 'success');
}

function handleReset() {
  if (!window.confirm('Начать новую поездку? Все текущие данные будут удалены безвозвратно.')) return;
  clearState();
  state = emptyState();
  exitEditMode();
  render();
  showToast('Данные очищены. Можно начинать новую поездку.', 'success');
}

// ---------- Вкладки ----------

let activeTab = 'participants';

function switchTab(tabName) {
  activeTab = tabName;
  document.querySelectorAll('.tab-button').forEach((btn) => {
    btn.classList.toggle('tab-button-active', btn.dataset.tab === tabName);
  });
  document.querySelectorAll('.tab-panel').forEach((panel) => {
    panel.classList.toggle('tab-panel-active', panel.id === `tab-${tabName}`);
  });
}

// ---------- Инициализация ----------

function init() {
  document.getElementById('participant-form').addEventListener('submit', handleAddParticipant);
  document.getElementById('expense-form').addEventListener('submit', handleExpenseSubmit);
  document.getElementById('expense-cancel').addEventListener('click', () => {
    exitEditMode();
    clearFormError('expense-error');
  });
  document.getElementById('load-demo').addEventListener('click', handleLoadDemo);
  document.getElementById('reset-data').addEventListener('click', handleReset);

  document.querySelectorAll('.tab-button').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  document.getElementById('expense-form').addEventListener('change', (event) => {
    if (event.target.name === 'split-mode' || event.target.name === 'split-participant') {
      clearFormError('expense-error');
      refreshCustomAmountFields();
    }
  });

  document.getElementById('participants-list').addEventListener('click', handleDeleteParticipant);
  document.getElementById('expenses-list').addEventListener('click', (event) => {
    if (event.target.closest('[data-edit-expense]')) handleEditExpense(event);
    if (event.target.closest('[data-delete-expense]')) handleDeleteExpense(event);
  });

  render();
}

document.addEventListener('DOMContentLoaded', init);
