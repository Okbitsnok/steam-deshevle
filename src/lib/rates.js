// @ts-check
import { fetchJson } from './http.js';
import { cacheGet, cacheSet } from './cache.js';

// Курсы ЦБ РФ в удобном JSON. Нужны, если Steam показывает цены
// не в рублях/долларах/евро (например, в тенге).
const CBR_URL = 'https://www.cbr-xml-daily.ru/daily_json.js';
const TTL = 12 * 60 * 60 * 1000;

/**
 * @returns {Promise<Record<string, number> | null>} сколько рублей стоит 1 единица валюты
 */
export async function getRubRates() {
  const cached = await cacheGet('rates', TTL);
  if (cached) return /** @type {Record<string, number>} */ (cached);
  try {
    const data = await fetchJson(CBR_URL);
    /** @type {Record<string, number>} */
    const rates = { RUB: 1 };
    for (const [code, v] of Object.entries(data?.Valute || {})) {
      const val = /** @type {any} */ (v);
      if (val && val.Value && val.Nominal) rates[code] = val.Value / val.Nominal;
    }
    await cacheSet('rates', rates);
    return rates;
  } catch {
    return null;
  }
}

/**
 * @param {number} rub
 * @param {string} currency
 * @param {Record<string, number> | null} rates
 * @returns {number | null}
 */
export function fromRub(rub, currency, rates) {
  if (currency === 'RUB') return rub;
  const r = rates?.[currency];
  return r ? rub / r : null;
}

/**
 * @param {number} amount
 * @param {string} currency
 * @param {Record<string, number> | null} rates
 * @returns {number | null}
 */
export function toRub(amount, currency, rates) {
  if (currency === 'RUB') return amount;
  const r = rates?.[currency];
  return r ? amount * r : null;
}
