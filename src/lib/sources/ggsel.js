// @ts-check
import { fetchJson } from '../http.js';

/** @typedef {import('../types.js').RawOffer} RawOffer */

// Внутренний API, которым пользуется сам сайт ggsel.net (поиск по каталогу).
// Официально не документирован — если GGSel его поменяет, править нужно тут.
const API = 'https://api.ggsel.com/elastic/goods/query';

/**
 * @param {string} query
 * @returns {Promise<RawOffer[]>}
 */
export async function searchGgsel(query) {
  const data = await fetchJson(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      search_term: query,
      limit: 100,
      search_after: [],
      is_preorders: false,
      with_filters: false,
      with_categories: false,
      sort: 'sortByRec',
      content_type_ids: [],
      with_forbidden: false,
      currency: 'wmr',
      lang: 'ru',
    }),
  });
  const items = Array.isArray(data?.data?.items) ? data.data.items : [];
  return items
    .filter(
      (/** @type {any} */ i) =>
        i && i.name && i.is_active !== false && !i.hidden_from_search && !i.is_preorder && Number(i.price_wmr) > 0
    )
    .map((/** @type {any} */ i) => {
      /** @type {RawOffer} */
      const offer = {
        source: 'ggsel',
        id: String(i.id_goods),
        title: String(i.name),
        url: `https://ggsel.net/catalog/product/${i.url}`,
        price: {
          RUB: Number(i.price_wmr),
          USD: Number(i.price_wmz) || undefined,
          EUR: Number(i.price_wme) || undefined,
        },
        seller: String(i.seller_name || ''),
        sold: Number(i.cnt_sell) || 0,
        rating: typeof i.rating === 'number' ? i.rating : null,
        reviews: null,
        hint: { contentTypeId: Number(i.content_type_id) || undefined, searchTitle: String(i.search_title || '') },
      };
      return offer;
    });
}

/** @param {string} query */
export function ggselSearchUrl(query) {
  return `https://ggsel.net/search/${encodeURIComponent(query)}`;
}
