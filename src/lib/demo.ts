import type { AppState, Expense, Participant } from './types';
import { randomUUID } from './crypto';

/**
 * Демонстрационный набор данных для быстрой демонстрации преподавателю.
 * Содержит: нескольких участников, разных плательщиков,
 * расход между частью участников и пример неравного распределения.
 */
export function createDemoState(): AppState {
  const p1: Participant = { id: randomUUID(), name: 'Егор' };
  const p2: Participant = { id: randomUUID(), name: 'Анна' };
  const p3: Participant = { id: randomUUID(), name: 'Иван' };
  const p4: Participant = { id: randomUUID(), name: 'Мария' };

  const e1: Expense = {
    id: randomUUID(),
    title: 'Ужин в ресторане',
    amountKopecks: 6000_00,
    paidById: p1.id,
    participantIds: [p1.id, p2.id, p3.id],
    splitMode: 'equal',
  };

  const e2: Expense = {
    id: randomUUID(),
    title: 'Аренда квартиры',
    amountKopecks: 12500_00,
    paidById: p2.id,
    participantIds: [p1.id, p2.id, p3.id, p4.id],
    splitMode: 'equal',
  };

  const e3: Expense = {
    id: randomUUID(),
    title: 'Бензин',
    amountKopecks: 3200_50,
    paidById: p3.id,
    participantIds: [p1.id, p2.id, p3.id, p4.id],
    splitMode: 'equal',
  };

  const e4: Expense = {
    id: randomUUID(),
    title: 'Сувениры',
    amountKopecks: 2750_00,
    paidById: p4.id,
    participantIds: [p1.id, p2.id, p3.id, p4.id],
    splitMode: 'custom',
    customShares: {
      [p1.id]: 1000_00,
      [p2.id]: 750_00,
      [p3.id]: 500_00,
      [p4.id]: 500_00,
    },
  };

  const e5: Expense = {
    id: randomUUID(),
    title: 'Кофе на вынос',
    amountKopecks: 890_00,
    paidById: p1.id,
    participantIds: [p1.id, p4.id],
    splitMode: 'equal',
  };

  return {
    participants: [p1, p2, p3, p4],
    expenses: [e1, e2, e3, e4, e5],
  };
}
