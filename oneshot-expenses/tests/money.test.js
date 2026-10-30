/**
 * Тесты денежных функций: парсинг, форматирование, равное распределение.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatMoney, parseMoneyToKopecks, splitEvenly, sumKopecks } from '../src/core/money.js';

test('parseMoneyToKopecks парсит корректные строки', () => {
  assert.equal(parseMoneyToKopecks('1234.56'), 123456);
  assert.equal(parseMoneyToKopecks('1234,56'), 123456);
  assert.equal(parseMoneyToKopecks('1234'), 123400);
  assert.equal(parseMoneyToKopecks('0.01'), 1);
  assert.equal(parseMoneyToKopecks('0.99'), 99);
  assert.equal(parseMoneyToKopecks('1 234.56'), 123456);
  assert.equal(parseMoneyToKopecks('  42.5  '), 4250);
  assert.equal(parseMoneyToKopecks('100'), 10000);
});

test('parseMoneyToKopecks принимает конечные неотрицательные числа', () => {
  assert.equal(parseMoneyToKopecks(1234.56), 123456);
  assert.equal(parseMoneyToKopecks(0), 0);
  assert.equal(parseMoneyToKopecks(42.5), 4250);
});

test('parseMoneyToKopecks отклоняет некорректный ввод', () => {
  assert.throws(() => parseMoneyToKopecks(''), /Введите сумму/);
  assert.throws(() => parseMoneyToKopecks('   '), /Введите сумму/);
  assert.throws(() => parseMoneyToKopecks('abc'), /Некорректная сумма/);
  assert.throws(() => parseMoneyToKopecks('12.345'), /Некорректная сумма/);
  assert.throws(() => parseMoneyToKopecks('-5'), /Некорректная сумма/);
  assert.throws(() => parseMoneyToKopecks('1.2.3'), /Некорректная сумма/);
  assert.throws(() => parseMoneyToKopecks(NaN), /конечным числом/);
  assert.throws(() => parseMoneyToKopecks(Infinity), /конечным числом/);
  assert.throws(() => parseMoneyToKopecks(-1), /отрицательной/);
  assert.throws(() => parseMoneyToKopecks(null), /числом или строкой/);
  assert.throws(() => parseMoneyToKopecks({}), /числом или строкой/);
});

test('formatMoney форматирует суммы в рублях', () => {
  // Между разрядами — неразрывный пробел (\u00A0).
  assert.equal(formatMoney(123456), '1\u00A0234,56 ₽');
  assert.equal(formatMoney(10000), '100,00 ₽');
  assert.equal(formatMoney(1), '0,01 ₽');
  assert.equal(formatMoney(0), '0,00 ₽');
  assert.equal(formatMoney(2664567), '26\u00A0645,67 ₽');
});

test('formatMoney показывает отрицательные суммы с минусом', () => {
  assert.equal(formatMoney(-10000), '-100,00 ₽');
  assert.equal(formatMoney(-1), '-0,01 ₽');
});

test('formatMoney отклоняет нецелые значения', () => {
  assert.throws(() => formatMoney(1.5), /целое число/);
});

test('splitEvenly делит сумму без потери копеек', () => {
  const shares = splitEvenly(10000, 4);
  assert.deepEqual(shares, [2500, 2500, 2500, 2500]);
  assert.equal(sumKopecks(shares), 10000);
});

test('splitEvenly раздаёт остаток по копейкам первым участникам', () => {
  // 100 копеек на 3 участников: 34 + 33 + 33
  const shares = splitEvenly(100, 3);
  assert.deepEqual(shares, [34, 33, 33]);
  assert.equal(sumKopecks(shares), 100);
});

test('splitEvenly корректно работает с суммами с копейками', () => {
  // 2345.67 ₽ на 4 участников: 586.42 + 586.42 + 586.42 + 586.41
  const shares = splitEvenly(234567, 4);
  assert.deepEqual(shares, [58642, 58642, 58642, 58641]);
  assert.equal(sumKopecks(shares), 234567);
});

test('splitEvenly отклоняет некорректные аргументы', () => {
  assert.throws(() => splitEvenly(100, 0), /положительным/);
  assert.throws(() => splitEvenly(100, -1), /положительным/);
  assert.throws(() => splitEvenly(-1, 3), /неотрицательным/);
  assert.throws(() => splitEvenly(1.5, 3), /целым/);
});

test('parse + format — круговой переход без потерь', () => {
  for (const input of ['0.01', '1.00', '999.99', '12345.67', '0.10']) {
    const kopecks = parseMoneyToKopecks(input);
    const formatted = formatMoney(kopecks);
    const again = parseMoneyToKopecks(formatted.replace(/[\s\u00A0]/g, '').replace('₽', ''));
    assert.equal(again, kopecks, `круговой переход для ${input}`);
  }
});
