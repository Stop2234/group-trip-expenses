/**
 * Кроссплатформенная генерация UUID.
 * В браузере использует Web Crypto, в Node.js — глобальный crypto (Node 19+).
 */
export function randomUUID(): string {
  const c = globalThis.crypto;
  if (!c || typeof c.randomUUID !== 'function') {
    throw new Error('crypto.randomUUID недоступен в этом окружении');
  }
  return c.randomUUID();
}
