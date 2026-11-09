// @ts-check
// Фоновый скрипт (service worker). Он ходит в API площадок — у страницы Steam
// на это нет прав из-за CORS, а у расширения есть (host_permissions в manifest.json).

import { getSettings, saveSettings } from './lib/config.js';
import { getOffersView } from './lib/offers.js';
import { getSteamAppInfo, steamAppUrl } from './lib/steam.js';
import { cacheClear } from './lib/cache.js';
import {
  syncWishlist,
  toggleTracked,
  getWatchStatus,
  listGames,
  checkAll,
  resetBadge,
  isChecking,
  getCurrentRunId,
  watchedCount,
} from './lib/watchlist.js';

const ALARM = 'price-check';

async function scheduleAlarm() {
  const settings = await getSettings();
  await chrome.alarms.clear(ALARM);
  if (!settings.notifications) return;
  const period = Math.max(1, settings.checkIntervalHours) * 60;
  await chrome.alarms.create(ALARM, { delayInMinutes: 2, periodInMinutes: period });
}

chrome.runtime.onInstalled.addListener((details) => {
  scheduleAlarm();
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/options/options.html#welcome') });
  }
});

chrome.runtime.onStartup.addListener(() => {
  scheduleAlarm();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) checkAll();
});

chrome.notifications.onClicked.addListener((id) => {
  const m = /^deal:(\d+)$/.exec(id);
  if (m) chrome.tabs.create({ url: steamAppUrl(Number(m[1])) });
  chrome.notifications.clear(id);
});

/**
 * @param {any} msg
 * @param {chrome.runtime.MessageSender} _sender
 */
async function handle(msg, _sender) {
  switch (msg?.type) {
    case 'offers:get': {
      const settings = await getSettings();
      const game = msg.game;
      const info = await getSteamAppInfo(game.appId);
      const altTitles = info?.name ? [info.name] : [];
      const [view, watch] = await Promise.all([
        getOffersView({ ...game, altTitles }, settings, { force: Boolean(msg.force) }),
        getWatchStatus(game.appId),
      ]);
      return { view, watch, collapsed: settings.panelCollapsed };
    }
    case 'wishlist:sync':
      return syncWishlist(Array.isArray(msg.appIds) ? msg.appIds : []);
    case 'track:toggle':
      return toggleTracked(Number(msg.appId), msg.name);
    case 'games:list':
      return listGames();
    case 'games:check': {
      if (isChecking()) return { started: false, running: true, runId: getCurrentRunId() };
      const total = await watchedCount();
      if (total === 0) return { started: false, total: 0 };
      const runId = Date.now();
      checkAll({ force: true, runId }); // не ждём: попап следит за прогрессом через storage
      return { started: true, total, runId };
    }
    case 'settings:get':
      return getSettings();
    case 'settings:save': {
      const prev = await getSettings();
      const next = await saveSettings(msg.patch || {});
      // Расписание проверок пересоздаём, только если поменялись связанные настройки
      // (иначе, например, сворачивание панели сбрасывало бы таймер).
      if (prev.notifications !== next.notifications || prev.checkIntervalHours !== next.checkIntervalHours) {
        await scheduleAlarm();
      }
      return next;
    }
    case 'cache:clear':
      return { removed: await cacheClear() };
    case 'badge:reset':
      await resetBadge();
      return true;
    case 'options:open':
      await chrome.runtime.openOptionsPage();
      return true;
    default:
      throw new Error(`Неизвестная команда: ${msg?.type}`);
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handle(msg, sender)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
  return true; // ответ придёт асинхронно
});
