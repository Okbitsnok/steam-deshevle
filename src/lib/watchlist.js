// @ts-check
import { getSettings } from './config.js';
import { getSteamAppInfo, steamAppUrl } from './steam.js';
import { getOffersView } from './offers.js';
import { sleep } from './http.js';

/** @typedef {import('./types.js').GameState} GameState */

/**
 * Список игр, за ценами которых следим:
 *  - список желаемого из Steam (подтягивается, когда ты заходишь в магазин);
 *  - игры, где ты нажал «Следить за ценой».
 */

const MAX_GAMES = 60;
const K = { wishlist: 'wishlist', tracked: 'tracked', games: 'games', progress: 'checkProgress', badge: 'badgeCount' };

/** @returns {Promise<{ appIds: number[], syncedAt: number }>} */
export async function getWishlist() {
  const d = await chrome.storage.local.get(K.wishlist);
  return d[K.wishlist] || { appIds: [], syncedAt: 0 };
}

/** @param {number[]} appIds */
export async function syncWishlist(appIds) {
  const clean = [...new Set(appIds.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  const prev = await getWishlist();
  await chrome.storage.local.set({ [K.wishlist]: { appIds: clean, syncedAt: Date.now() } });
  const added = clean.filter((id) => !prev.appIds.includes(id));
  return { count: clean.length, added: added.length };
}

/** @returns {Promise<Record<string, { addedAt: number, name?: string }>>} */
async function getTracked() {
  const d = await chrome.storage.local.get(K.tracked);
  return d[K.tracked] || {};
}

/** @returns {Promise<Record<string, GameState>>} */
async function getGames() {
  const d = await chrome.storage.local.get(K.games);
  return d[K.games] || {};
}

/**
 * @param {number} appId
 * @returns {Promise<{ tracked: boolean, inWishlist: boolean }>}
 */
export async function getWatchStatus(appId) {
  const [wl, tracked] = await Promise.all([getWishlist(), getTracked()]);
  return { tracked: Boolean(tracked[appId]), inWishlist: wl.appIds.includes(appId) };
}

/**
 * @param {number} appId
 * @param {string} [name]
 */
export async function toggleTracked(appId, name) {
  const tracked = await getTracked();
  if (tracked[appId]) delete tracked[appId];
  else tracked[appId] = { addedAt: Date.now(), name };
  await chrome.storage.local.set({ [K.tracked]: tracked });
  return getWatchStatus(appId);
}

/** @returns {Promise<number[]>} */
async function getWatchedIds() {
  const [wl, tracked] = await Promise.all([getWishlist(), getTracked()]);
  const ids = [...Object.keys(tracked).map(Number), ...wl.appIds];
  return [...new Set(ids)].slice(0, MAX_GAMES);
}

/**
 * Данные для попапа.
 */
export async function listGames() {
  const [ids, games, tracked, wl, progressData] = await Promise.all([
    getWatchedIds(),
    getGames(),
    getTracked(),
    getWishlist(),
    chrome.storage.local.get(K.progress),
  ]);
  const list = ids.map((id) => {
    const g = games[id];
    return {
      appId: id,
      name: g?.name || tracked[id]?.name || `App ${id}`,
      image: g?.image || null,
      steamPrice: g?.steamPrice || null,
      best: g?.best || null,
      savingsPct: g?.savingsPct ?? null,
      checkedAt: g?.checkedAt || 0,
      error: g?.error,
      tracked: Boolean(tracked[id]),
      inWishlist: wl.appIds.includes(id),
      steamUrl: steamAppUrl(id),
    };
  });
  return { games: list, wishlistSyncedAt: wl.syncedAt, progress: progressData[K.progress] || null };
}

/** @param {number} count */
async function setBadge(count) {
  await chrome.storage.local.set({ [K.badge]: count });
  await chrome.action.setBadgeBackgroundColor({ color: '#2fbf71' });
  await chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });
}

export async function resetBadge() {
  await setBadge(0);
}

/**
 * @param {number} amount
 * @param {string} currency
 */
function money(amount, currency) {
  try {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency,
      maximumFractionDigits: currency === 'RUB' ? 0 : 2,
    }).format(amount);
  } catch {
    return `${Math.round(amount)} ${currency}`;
  }
}

let running = false;
/** Номер текущей проверки — чтобы попап понимал, что закончилась именно «его» проверка. */
let currentRunId = 0;

/**
 * Проверяет цены на все отслеживаемые игры и шлёт уведомления о снижении.
 * @param {{ force?: boolean, runId?: number }} [opts]
 */
export async function checkAll(opts = {}) {
  if (running) return { started: false, total: 0, runId: currentRunId };
  running = true;
  const runId = opts.runId || Date.now();
  currentRunId = runId;
  /** @type {number[]} */
  let ids = [];
  let newDeals = 0;
  let errors = 0;
  try {
    const settings = await getSettings();
    ids = await getWatchedIds();
    await chrome.storage.local.set({ [K.progress]: { runId, running: true, done: 0, total: ids.length, at: Date.now() } });
    for (let i = 0; i < ids.length; i++) {
      const appId = ids[i];
      const games = await getGames();
      const prev = games[appId];
      try {
        const info = await getSteamAppInfo(appId);
        if (!info) throw new Error('Steam не отдал данные об игре');
        const view = await getOffersView(
          { appId, title: info.name, steamPrice: info.price, isFree: info.isFree },
          settings,
          { force: opts.force }
        );
        const best = view.best;
        const bestRub = best ? best.rub : null;
        let ref = prev?.lastNotifiedRub ?? prev?.bestRub ?? bestRub;
        if (bestRub !== null && ref !== null && bestRub > ref) ref = bestRub;

        if (
          settings.notifications &&
          best &&
          bestRub !== null &&
          ref !== null &&
          prev?.bestRub != null &&
          bestRub <= ref * (1 - settings.dropThresholdPct / 100)
        ) {
          newDeals += 1;
          ref = bestRub;
          const kind = best.kind === 'key' ? 'ключ' : 'гифт';
          const vs = best.savingsPct !== null && best.savingsPct > 0 ? ` — на ${best.savingsPct}% дешевле Steam` : '';
          await chrome.notifications.create(`deal:${appId}`, {
            type: 'basic',
            iconUrl: chrome.runtime.getURL('icons/icon128.png'),
            title: `${info.name} подешевела`,
            message: `${money(best.amount, view.currency)} (${kind}, ${best.sourceName})${vs}`,
            contextMessage: 'Дешевле · нажми, чтобы открыть игру',
            priority: 1,
          });
        }

        games[appId] = {
          appId,
          name: info.name,
          image: info.image,
          steamPrice: view.steamPrice,
          best,
          bestRub,
          savingsPct: best ? best.savingsPct : null,
          checkedAt: Date.now(),
          lastNotifiedRub: ref,
        };
      } catch (err) {
        errors += 1;
        games[appId] = {
          ...(prev || { appId, name: `App ${appId}`, image: null, steamPrice: null, best: null, bestRub: null, savingsPct: null, lastNotifiedRub: null }),
          checkedAt: Date.now(),
          error: String(/** @type {any} */ (err)?.message || err),
        };
      }
      await chrome.storage.local.set({
        [K.games]: games,
        [K.progress]: { runId, running: true, done: i + 1, total: ids.length, at: Date.now() },
      });
      if (i < ids.length - 1) await sleep(700);
    }
  } finally {
    const now = Date.now();
    try {
      if (newDeals > 0) {
        const d = await chrome.storage.local.get(K.badge);
        await setBadge((Number(d[K.badge]) || 0) + newDeals);
      }
      await chrome.storage.local.set({
        [K.progress]: { runId, running: false, done: ids.length, total: ids.length, at: now, finishedAt: now, errors, newDeals },
      });
    } finally {
      // Флаг снимаем последним: пока итог не записан, новая проверка не стартует.
      running = false;
    }
  }
  return { started: true, total: ids.length, newDeals, runId };
}

export function isChecking() {
  return running;
}

export function getCurrentRunId() {
  return currentRunId;
}

/** Сколько игр будет проверено (для попапа, чтобы не запускать пустую проверку). */
export async function watchedCount() {
  return (await getWatchedIds()).length;
}
