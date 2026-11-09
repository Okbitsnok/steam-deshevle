// @ts-check

/**
 * Простой кэш поверх chrome.storage.local с временем жизни.
 * Нужен, чтобы не дёргать площадки при каждом открытии страницы.
 */

const PREFIX = 'cache:';

/**
 * @template T
 * @param {string} key
 * @param {number} maxAgeMs
 * @returns {Promise<T | null>}
 */
export async function cacheGet(key, maxAgeMs) {
  const entry = await cacheGetEntry(key, maxAgeMs);
  return entry ? /** @type {T} */ (entry.v) : null;
}

/**
 * То же, что cacheGet, но ещё возвращает время записи.
 * @param {string} key
 * @param {number} maxAgeMs
 * @returns {Promise<{ t: number, v: any } | null>}
 */
export async function cacheGetEntry(key, maxAgeMs) {
  const fullKey = PREFIX + key;
  const data = await chrome.storage.local.get(fullKey);
  const entry = data[fullKey];
  if (!entry || typeof entry.t !== 'number') return null;
  if (Date.now() - entry.t > maxAgeMs) return null;
  return entry;
}

/**
 * @param {string} key
 * @param {unknown} value
 */
export async function cacheSet(key, value) {
  await chrome.storage.local.set({ [PREFIX + key]: { t: Date.now(), v: value } });
}

/** Удаляет все записи кэша (настройки и список игр не трогает). */
export async function cacheClear() {
  const all = await chrome.storage.local.get(null);
  const keys = Object.keys(all).filter((k) => k.startsWith(PREFIX));
  if (keys.length) await chrome.storage.local.remove(keys);
  return keys.length;
}
