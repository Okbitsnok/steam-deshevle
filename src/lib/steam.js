// @ts-check
import { fetchJson } from './http.js';
import { cacheGet, cacheSet } from './cache.js';

/** @typedef {import('./types.js').Money} Money */

/**
 * @typedef {Object} SteamAppInfo
 * @property {number} appId
 * @property {string} name        английское название (по нему лучше ищется)
 * @property {string | null} image
 * @property {boolean} isFree
 * @property {Money | null} price
 */

const TTL = 6 * 60 * 60 * 1000;

/**
 * Данные об игре из открытого API магазина Steam.
 * @param {number} appId
 * @returns {Promise<SteamAppInfo | null>}
 */
export async function getSteamAppInfo(appId) {
  const key = `steam:${appId}`;
  const cached = await cacheGet(key, TTL);
  if (cached) return /** @type {SteamAppInfo} */ (cached);
  try {
    const data = await fetchJson(
      `https://store.steampowered.com/api/appdetails?appids=${appId}&l=english&filters=basic,price_overview`
    );
    const entry = data?.[String(appId)];
    if (!entry?.success || !entry.data) return null;
    const d = entry.data;
    /** @type {SteamAppInfo} */
    const info = {
      appId,
      name: String(d.name || ''),
      image: d.capsule_image || d.header_image || null,
      isFree: Boolean(d.is_free),
      price: d.price_overview
        ? { amount: Number(d.price_overview.final) / 100, currency: String(d.price_overview.currency) }
        : null,
    };
    await cacheSet(key, info);
    return info;
  } catch {
    return null;
  }
}

/** @param {number} appId */
export function steamAppUrl(appId) {
  return `https://store.steampowered.com/app/${appId}/`;
}
