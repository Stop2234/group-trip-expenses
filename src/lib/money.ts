/**
 * Денежные вычисления в целых копейках.
 * Все суммы хранятся и обрабатываются как целое число копеек,
 * что исключает ошибки бинарной плавающей запятой.
 */

/** Конвертирует рубли (число) в копейки (целое). Округляет до ближайшей копейки. */
export function toKopecks(rubles: number): number {
  return Math.round(rubles * 100);
}

/** Конвертирует копейки в рубли (число для отображения). */
export function toRubles(kopecks: number): number {
  return kopecks / 100;
}

/** Форматирует сумму в копейках как строку в рублях: "1 234,56 ₽" */
export function formatMoney(kopecks: number): string {
  const negative = kopecks < 0;
  const abs = Math.abs(kopecks);
  const rub = Math.floor(abs / 100);
  const kop = abs % 100;
  const rubStr = rub.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const sign = negative ? '−' : '';
  return `${sign}${rubStr},${kop.toString().padStart(2, '0')} ₽`;
}

/** Парсит пользовательский ввод суммы в копейки. Возвращает null при ошибке. */
export function parseMoneyInput(input: string): number | null {
  const trimmed = input.trim().replace(/\s/g, '').replace(',', '.');
  if (trimmed === '' || !/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    return null;
  }
  const [rub, kop = ''] = trimmed.split('.');
  const kopPadded = (kop + '00').slice(0, 2);
  return Number(rub) * 100 + Number(kopPadded);
}

/** Распределяет сумму в копейках равномерно между n участниками.
 *  Возвращает массив долей, сумма которых строго равна исходной сумме.
 *  Остаток от деления распределяется по копейкам между первыми участниками. */
export function splitEvenly(totalKopecks: number, count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor(totalKopecks / count);
  const remainder = totalKopecksMod(totalKopecks, count);
  const shares: number[] = [];
  for (let i = 0; i < count; i++) {
    shares.push(base + (i < remainder ? 1 : 0));
  }
  return shares;
}

function totalKopecksMod(a: number, b: number): number {
  return ((a % b) + b) % b;
}
