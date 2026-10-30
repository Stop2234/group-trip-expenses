/**
 * Слой хранения состояния приложения в localStorage.
 * Данные переживают обновление страницы и закрытие браузера.
 */

const STORAGE_KEY = 'oneshot-expenses-state-v1';

/** Загружает состояние из localStorage. Возвращает null, если данных нет или они повреждены. */
export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const state = JSON.parse(raw);
    if (!state || !Array.isArray(state.participants) || !Array.isArray(state.expenses)) {
      return null;
    }
    return state;
  } catch {
    return null;
  }
}

/** Сохраняет состояние в localStorage. */
export function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/** Полностью удаляет сохранённое состояние (новая поездка). */
export function clearState() {
  localStorage.removeItem(STORAGE_KEY);
}
