// @ts-check
import { fetchJson } from '../http.js';

/** @typedef {import('../types.js').RawOffer} RawOffer */

const API = 'https://plati.io/api/search.ashx';

/**
 * Поиск на Plati.Market через их открытый API.
 * @param {string} query
 * @returns {Promise<RawOffer[]>}
 */
export async function searchPlati(query) {
  const url = `${API}?query=${encodeURIComponent(query)}&pagesize=100&visibleOnly=true&response=json`;
  const data = await fetchJson(url);
  const items = Array.isArray(data?.items) ? data.items : [];
  return items
    .filter((/** @type {any} */ i) => i && i.name && Number(i.price_rur) > 0)
    .map((/** @type {any} */ i) => {
      const pos = Number(i.count_positiveresponses) || 0;
      const neg = Number(i.count_negativeresponses) || 0;
      /** @type {RawOffer} */
      const offer = {
        source: 'plati',
        id: String(i.id),
        title: String(i.name),
        url: String(i.url || `https://plati.market/itm/${i.id}`),
        price: {
          RUB: Number(i.price_rur),
          USD: Number(i.price_usd) || undefined,
          EUR: Number(i.price_eur) || undefined,
          UAH: Number(i.price_uah) || undefined,
        },
        seller: String(i.seller_name || ''),
        sold: Number(i.numsold) || 0,
        rating: pos + neg > 0 ? Math.round((pos / (pos + neg)) * 50) / 10 : null,
        reviews: { pos, neg },
        hint: { sectionId: Number(i.section_id) || undefined },
      };
      return offer;
    });
}

/** @param {string} query */
export function platiSearchUrl(query) {
  return `https://plati.market/search/${encodeURIComponent(query)}`;
}
