// @ts-check
import { searchPlati, platiSearchUrl } from './sources/plati.js';
import { searchGgsel, ggselSearchUrl } from './sources/ggsel.js';
import { isRelevant, isAddonOnly, cleanTitle } from './match.js';
import { classify, detectRegion } from './classify.js';
import { getRubRates, fromRub, toRub } from './rates.js';
import { cacheGetEntry, cacheSet } from './cache.js';
import { SOURCE_NAMES, topupUrlFor } from './config.js';

/** @typedef {import('./types.js').RawOffer} RawOffer */
/** @typedef {import('./types.js').Offer} Offer */
/** @typedef {import('./types.js').OffersView} OffersView */
/** @typedef {import('./types.js').CategoryView} CategoryView */
/** @typedef {import('./types.js').SourceStatus} SourceStatus */
/** @typedef {import('./types.js').SourceId} SourceId */
/** @typedef {import('./types.js').Settings} Settings */
/** @typedef {import('./types.js').GameInput} GameInput */
/** @typedef {import('./types.js').Money} Money */

/** @type {Record<SourceId, { search: (q: string) => Promise<RawOffer[]>, searchUrl: (q: string) => string }>} */
const SOURCES = {
  plati: { search: searchPlati, searchUrl: platiSearchUrl },
  ggsel: { search: searchGgsel, searchUrl: ggselSearchUrl },
};

const CATEGORY_META = /** @type {const} */ ({
  key: {
    title: 'Ключи',
    hint: 'Ключ активируешь на своём аккаунте Steam. Смотри регион: ключ «РФ+СНГ» подойдёт аккаунту из России и СНГ.',
    risk: 'low',
  },
  gift: {
    title: 'Гифты',
    hint: 'Продавец покупает игру в Steam и отправляет её подарком на твой аккаунт. Обычно нужно добавить его в друзья.',
    risk: 'low',
  },
  account: {
    title: 'Аккаунты',
    hint: 'Тебе дают логин и пароль от чужого аккаунта с игрой, играешь в офлайн-режиме. Это нарушает правила Steam: доступ могут отнять в любой момент, а такие аккаунты бывают крадеными. Поэтому «лучшей ценой» они не считаются.',
    risk: 'high',
  },
});

/**
 * Ищет на одной площадке, с кэшем.
 * @param {SourceId} id
 * @param {string} query
 * @param {number} ttlMs
 * @param {boolean} force
 * @returns {Promise<{ items: RawOffer[], at: number }>}
 */
async function searchSource(id, query, ttlMs, force) {
  const key = `src:${id}:${query.toLowerCase()}`;
  if (!force) {
    const cached = await cacheGetEntry(key, ttlMs);
    if (cached) return { items: /** @type {RawOffer[]} */ (cached.v), at: cached.t };
  }
  const items = await SOURCES[id].search(query);
  await cacheSet(key, items);
  return { items, at: Date.now() };
}

/**
 * Подставляет партнёрский шаблон, если он задан в настройках.
 * @param {RawOffer} o
 * @param {Settings} settings
 */
export function withAffiliate(o, settings) {
  const tpl = settings.affiliate?.[o.source];
  if (!tpl) return o.url;
  return tpl.replace(/\{url\}/g, encodeURIComponent(o.url)).replace(/\{id\}/g, o.id);
}

/**
 * @param {RawOffer} o
 * @param {Settings} settings
 */
function isTrusted(o, settings) {
  if (o.sold < settings.minSold) return false;
  if (o.rating !== null && o.rating < 4.5) return false;
  if (o.reviews) {
    const total = o.reviews.pos + o.reviews.neg;
    if (total >= 5 && o.reviews.neg / total > 0.1) return false;
  }
  return true;
}

/**
 * Главная функция: ищет игру на площадках и собирает данные для панели.
 * @param {GameInput & { altTitles?: string[] }} game
 * @param {Settings} settings
 * @param {{ force?: boolean }} [opts]
 * @returns {Promise<OffersView>}
 */
export async function getOffersView(game, settings, opts = {}) {
  const titles = [...new Set([game.title, ...(game.altTitles || [])].map(cleanTitle).filter(Boolean))];
  // Искать лучше по английскому названию — так пишут почти все продавцы.
  const query = titles[titles.length - 1] || cleanTitle(game.title);
  const ttl = settings.cacheMinutes * 60 * 1000;

  const enabled = /** @type {SourceId[]} */ (Object.keys(SOURCES)).filter((id) => settings.sources[id]);
  const results = await Promise.allSettled(enabled.map((id) => searchSource(id, query, ttl, !!opts.force)));

  /** @type {SourceStatus[]} */
  const sources = [];
  /** @type {RawOffer[]} */
  const raw = [];
  let fetchedAt = Date.now();
  results.forEach((r, i) => {
    const id = enabled[i];
    const base = { id, name: SOURCE_NAMES[id], searchUrl: SOURCES[id].searchUrl(query) };
    if (r.status === 'fulfilled') {
      raw.push(...r.value.items);
      fetchedAt = Math.min(fetchedAt, r.value.at);
      sources.push({ ...base, ok: true, count: 0 });
    } else {
      sources.push({ ...base, ok: false, count: 0, error: String(r.reason?.message || r.reason) });
    }
  });

  // --- Валюта показа ---------------------------------------------------
  const steamCur = game.steamPrice?.currency || null;
  let currency = settings.currencyMode === 'RUB' || !steamCur ? 'RUB' : steamCur;
  const direct = ['RUB', 'USD', 'EUR'];
  const rates = direct.includes(currency) ? null : await getRubRates();
  if (!direct.includes(currency) && !rates) currency = 'RUB';

  /** @type {Money | null} */
  let steamPrice = null;
  if (game.steamPrice && !game.isFree && game.steamPrice.amount > 0) {
    if (game.steamPrice.currency === currency) {
      steamPrice = { ...game.steamPrice };
    } else {
      const converted = currency === 'RUB'
        ? toRub(game.steamPrice.amount, game.steamPrice.currency, rates || (await getRubRates()))
        : null;
      steamPrice = converted ? { amount: converted, currency } : null;
    }
  }

  /** @param {RawOffer} o */
  const priceIn = (o) => {
    const native = /** @type {Record<string, number | undefined>} */ (o.price)[currency];
    if (native) return native;
    return fromRub(o.price.RUB || 0, currency, rates);
  };

  // --- Фильтрация и классификация -------------------------------------
  /** @type {Offer[]} */
  const offers = [];
  const seen = new Set();
  for (const o of raw) {
    if (!isRelevant(o.title, titles)) continue;
    if (isAddonOnly(o.title, titles)) continue;
    const kind = classify(o, titles);
    if (kind !== 'key' && kind !== 'gift' && kind !== 'account') continue;
    const amount = priceIn(o);
    if (!amount || !o.price.RUB) continue;
    const dedupKey = `${o.source}:${o.id}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);
    offers.push({
      source: o.source,
      sourceName: SOURCE_NAMES[o.source],
      id: o.id,
      title: o.title,
      url: withAffiliate(o, settings),
      kind,
      region: detectRegion(o.title),
      amount,
      rub: o.price.RUB,
      seller: o.seller,
      sold: o.sold,
      rating: o.rating,
      trusted: isTrusted(o, settings),
      savingsPct: steamPrice ? Math.round((1 - amount / steamPrice.amount) * 100) : null,
    });
  }

  // --- Категории --------------------------------------------------------
  /** @type {CategoryView[]} */
  const categories = [];
  /** @type {Array<'key' | 'gift' | 'account'>} */
  const order = ['key', 'gift', 'account'];
  for (const id of order) {
    if (id === 'key' && !settings.showKeys) continue;
    if (id === 'gift' && !settings.showGifts) continue;
    if (id === 'account' && !settings.showAccounts) continue;
    const list = offers
      .filter((o) => o.kind === id)
      .sort((a, b) => a.amount - b.amount || b.sold - a.sold);
    const best = list.find((o) => o.trusted) || null;
    categories.push({ id, ...CATEGORY_META[id], offers: list, best });
  }

  // Сколько показанных предложений пришло с каждой площадки.
  for (const c of categories) {
    for (const o of c.offers) {
      const src = sources.find((s) => s.id === o.source);
      if (src) src.count += 1;
    }
  }

  // Лучшее предложение — только среди ключей и гифтов от проверенных продавцов.
  /** @type {Offer | null} */
  let best = null;
  for (const c of categories) {
    if (c.id === 'account' || !c.best) continue;
    if (!best || c.best.amount < best.amount) best = c.best;
  }

  const topup = steamPrice
    ? {
        amount: steamPrice.amount * (1 + settings.topupCommissionPct / 100),
        commissionPct: settings.topupCommissionPct,
        url: topupUrlFor(settings),
      }
    : null;

  return {
    appId: game.appId,
    query,
    fetchedAt,
    currency,
    steamPrice,
    categories,
    best,
    topup,
    sources,
    totalFound: raw.length,
    totalRelevant: categories.reduce((n, c) => n + c.offers.length, 0),
  };
}
