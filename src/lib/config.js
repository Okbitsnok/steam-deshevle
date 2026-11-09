// @ts-check
/** @typedef {import('./types.js').Settings} Settings */
/** @typedef {import('./types.js').TopupProvider} TopupProvider */

/** Версия формата настроек. Увеличиваем, когда меняем значения по умолчанию. */
export const SETTINGS_VERSION = 2;

/** @type {Settings} */
export const DEFAULT_SETTINGS = {
  version: SETTINGS_VERSION,
  sources: { plati: true, ggsel: true },
  showKeys: true,
  showGifts: true,
  // Общие/офлайн-аккаунты показываем, но с предупреждением, и никогда не делаем «лучшей ценой».
  showAccounts: true,
  // Продавец считается «проверенным», если у лота столько продаж или больше.
  minSold: 20,
  // Примерная комиссия сервисов пополнения Steam.
  topupCommissionPct: 8,
  // Куда ведёт кнопка «Найти пополнение»: поиск на GGSel, на Plati или своя ссылка.
  topupProvider: 'ggsel',
  topupUrl: '',
  currencyMode: 'auto',
  notifications: true,
  checkIntervalHours: 12,
  dropThresholdPct: 10,
  cacheMinutes: 30,
  // Шаблоны партнёрских ссылок. {url} заменится на ссылку на лот, {id} — на номер лота.
  // Пример: 'https://plati.market/itm/{id}?ai=123456' — формат возьми в кабинете партнёра.
  affiliate: { plati: '', ggsel: '' },
  panelCollapsed: false,
};

/** Готовые ссылки для кнопки «Найти пополнение». */
export const TOPUP_URLS = /** @type {const} */ ({
  ggsel: 'https://ggsel.net/search/' + encodeURIComponent('пополнение steam'),
  plati: 'https://plati.market/search/' + encodeURIComponent('пополнение steam'),
});

/**
 * @param {Settings} s
 * @returns {string}
 */
export function topupUrlFor(s) {
  if (s.topupProvider === 'custom' && /^https?:\/\//i.test(s.topupUrl)) return s.topupUrl;
  if (s.topupProvider === 'plati') return TOPUP_URLS.plati;
  return TOPUP_URLS.ggsel;
}

const SETTINGS_KEY = 'settings';

/**
 * Склеивает сохранённые настройки с настройками по умолчанию,
 * чтобы новые поля из обновлений расширения появлялись сами.
 * @param {Partial<Settings> | undefined} saved
 * @returns {Settings}
 */
export function mergeSettings(saved) {
  const s = { ...(saved || {}) };
  const savedVersion = Number(s.version) || 1;
  if (saved && savedVersion < 2) {
    // v1 → v2: аккаунты теперь показываются по умолчанию,
    // а вместо поля со ссылкой на пополнение — выбор площадки.
    s.showAccounts = true;
    const oldUrl = String(s.topupUrl || '');
    if (oldUrl && !/ggsel\.net\/search\//.test(oldUrl)) {
      s.topupProvider = /plati\.market\/search\//.test(oldUrl) ? 'plati' : 'custom';
    } else {
      s.topupProvider = 'ggsel';
      s.topupUrl = '';
    }
  }
  return {
    ...DEFAULT_SETTINGS,
    ...s,
    version: SETTINGS_VERSION,
    sources: { ...DEFAULT_SETTINGS.sources, ...(s.sources || {}) },
    affiliate: { ...DEFAULT_SETTINGS.affiliate, ...(s.affiliate || {}) },
  };
}

/** @returns {Promise<Settings>} */
export async function getSettings() {
  const data = await chrome.storage.sync.get(SETTINGS_KEY);
  return mergeSettings(data[SETTINGS_KEY]);
}

/**
 * @param {Partial<Settings>} patch
 * @returns {Promise<Settings>}
 */
export async function saveSettings(patch) {
  const current = await getSettings();
  const next = mergeSettings({
    ...current,
    ...patch,
    sources: { ...current.sources, ...(patch.sources || {}) },
    affiliate: { ...current.affiliate, ...(patch.affiliate || {}) },
  });
  await chrome.storage.sync.set({ [SETTINGS_KEY]: next });
  return next;
}

export const SOURCE_NAMES = /** @type {const} */ ({ plati: 'Plati', ggsel: 'GGSel' });
