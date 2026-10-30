import { useState } from 'react';
import type { AppState } from '../lib/types';
import { validateParticipantName } from '../lib/validation';
import { api, ApiError } from '../lib/api';

interface Props {
  state: AppState;
  /** Перечитывает состояние из общего хранилища (REST API → backend → JSON) */
  refresh: () => Promise<void>;
  showNotification: (msg: string) => void;
}

export default function ParticipantsSection({ state, refresh, showNotification }: Props) {
  const [newName, setNewName] = useState('');
  const [errors, setErrors] = useState<string[]>([]);

  const handleAdd = async () => {
    const validation = validateParticipantName(newName, state.participants);
    if (!validation.valid) {
      setErrors(validation.errors);
      return;
    }
    const trimmed = newName.trim();
    try {
      await api.addParticipant(trimmed);
      await refresh();
      setNewName('');
      setErrors([]);
      showNotification(`Участник «${trimmed}» добавлен`);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors([err.message]);
      } else {
        setErrors(['Не удалось добавить участника']);
      }
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Удалить участника?')) return;
    try {
      await api.removeParticipant(id);
      await refresh();
      showNotification('Участник удалён');
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : 'Не удалось удалить участника');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') void handleAdd();
  };

  return (
    <div className="card">
      <h2>Участники поездки</h2>

      {errors.length > 0 && (
        <div className="error-list">
          <ul>
            {errors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="form-row">
        <div className="form-group" style={{ flex: 1 }}>
          <input
            type="text"
            placeholder="Имя участника"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={handleKeyDown}
            maxLength={50}
          />
        </div>
        <div className="form-group">
          <button className="btn btn-primary" onClick={() => void handleAdd()}>
            Добавить
          </button>
        </div>
      </div>

      {state.participants.length === 0 ? (
        <div className="empty-state">
          <p>Пока нет участников.</p>
          <p style={{ fontSize: '0.875rem' }}>Добавьте первого участника или загрузите демо-данные.</p>
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th style={{ width: '60%' }}>Имя</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {state.participants.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={() => void handleDelete(p.id)}
                  >
                    Удалить
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
