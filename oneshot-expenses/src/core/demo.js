/**
 * Демонстрационные данные для быстрой загрузки в приложение.
 * Сценарий: четверо друзей в поездке, разные плательщики,
 * деление между частью группы и неравное распределение, суммы с копейками.
 */
export function createDemoData() {
  return {
    participants: [
      { id: 'p1', name: 'Егор' },
      { id: 'p2', name: 'Анна' },
      { id: 'p3', name: 'Иван' },
      { id: 'p4', name: 'Мария' },
    ],
    expenses: [
      {
        id: 'e1',
        title: 'Отель',
        amountKopecks: 1200000,
        paidBy: 'p1',
        splitMode: 'equal',
        participantIds: ['p1', 'p2', 'p3', 'p4'],
      },
      {
        id: 'e2',
        title: 'Ужин',
        amountKopecks: 600000,
        paidBy: 'p3',
        splitMode: 'equal',
        participantIds: ['p1', 'p2', 'p3'],
      },
      {
        id: 'e3',
        title: 'Такси',
        amountKopecks: 150000,
        paidBy: 'p2',
        splitMode: 'equal',
        participantIds: ['p1', 'p2', 'p3', 'p4'],
      },
      {
        id: 'e4',
        title: 'Экскурсия',
        amountKopecks: 480000,
        paidBy: 'p4',
        splitMode: 'custom',
        participantIds: ['p1', 'p2', 'p3'],
        customShares: { p1: 200000, p2: 120000, p3: 160000 },
      },
      {
        id: 'e5',
        title: 'Продукты',
        amountKopecks: 234567,
        paidBy: 'p1',
        splitMode: 'equal',
        participantIds: ['p1', 'p2', 'p3', 'p4'],
      },
    ],
  };
}
