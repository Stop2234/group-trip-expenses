/**
 * Денежные вычисления.
 *
 * Все суммы в приложении хранятся и обрабатываются как ЦЕЛОЕ число копеек.
 * Это полностью исключает ошибки бинарной плавающей запятой
 * (например, 0.1 + 0.2 !== 0.3) при денежных расчётах.
 */

/**
 * Парсит пользовательский ввод суммы в целое число копеек.
 * Принимает строку ("1234.56", "1234,56", "1 234", "12") или конечное неотрицательное число.
 * Бросает Error с понятным сообщением при некорректном вводе.
 */
export function parseMoneyToKopecks(input) {
  let str;
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) {
      throw new Error('Сумма должна быть конечным числом');
    }
    if (input < 0) {
      throw new Error('Сумма не может быть отрицательной');
    }
    // Числа конвертируем через строку с фиксированной точностью, чтобы избежать
    // сюрпризов плавающей запятых и экспоненциальной записи.
    str = input.toFixed(2);
  } else if (typeof input === 'string') {
    str = input
      .trim()
      .replace(/[\s\u00A0\u202F]/g, '')
      .replace(',', '.');
  } else {
    throw new Error('Сумма должна быть числом или строкой');
  }

  if (str === '') {
    throw new Error('Введите сумму');
  }
  if (!/^\d+(\.\d{1,2})?$/.test(str)) {
    throw new Error(`Некорректная сумма «${input}». Ожидается положительное число, например 1234.56`);
  }

  const dotIndex = str.indexOf('.');
  const rublesPart = dotIndex === -1 ? str : str.slice(0, dotIndex);
  const kopecksPart = dotIndex === -1 ? '' : str.slice(dotIndex + 1);

  const rubles = Number(rublesPart);
  const kopecks = Number((kopecksPart + '00').slice(0, 2));
  return rubles * 100 + kopecks;
}

/**
 * Форматирует целое число копеек как строку в рублях: "1 234,56 ₽".
 * Отрицательные суммы показываются со знаком минус: "-100,00 ₽".
 */
export function formatMoney(kopecks) {
  if (!Number.isInteger(kopecks)) {
    throw new Error('formatMoney ожидает целое число копеек');
  }
  const negative = kopecks < 0;
  const abs = Math.abs(kopecks);
  const rubles = Math.floor(abs / 100);
  const kopecksPart = abs % 100;
  const rublesStr = String(rubles).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0');
  const sign = negative ? '-' : '';
  return `${sign}${rublesStr},${String(kopecksPart).padStart(2, '0')} ₽`;
}

/**
 * Распределяет целую сумму в копейках равномерно между count участниками.
 * Остаток от деления раздаётся по одной копейке первым участникам.
 * Гарантирует: сумма возвращённых долей строго равна totalKopecks.
 */
export function splitEvenly(totalKopecks, count) {
  if (!Number.isInteger(totalKopecks) || totalKopecks < 0) {
    throw new Error('splitEvenly: сумма должна быть целым неотрицательным числом копеек');
  }
  if (!Number.isInteger(count) || count <= 0) {
    throw new Error('splitEvenly: количество участников должно быть положительным целым числом');
  }
  const base = Math.floor(totalKopecks / count);
  const remainder = totalKopecks - base * count; // в пределах 0..count-1
  const shares = [];
  for (let i = 0; i < count; i += 1) {
    shares.push(base + (i < remainder ? 1 : 0));
  }
  return shares;
}

/** Складывает массив целых чисел копеек (для проверок и тестов). */
export function sumKopecks(values) {
  return values.reduce((acc, v) => acc + v, 0);
}
