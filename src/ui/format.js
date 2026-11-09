// @ts-check
// Форматирование для попапа и настроек.

/**
 * @param {number} amount
 * @param {string} currency
 */
export function money(amount, currency) {
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

/**
 * @param {number} n
 * @param {[string, string, string]} forms
 */
export function plural(n, forms) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}

/** @param {number} ts */
export function timeAgo(ts) {
  if (!ts) return 'ещё не проверяли';
  const min = Math.round((Date.now() - ts) / 60000);
  if (min < 1) return 'только что';
  if (min < 60) return `${min} мин назад`;
  const hrs = Math.round(min / 60);
  if (hrs < 24) return `${hrs} ч назад`;
  const days = Math.round(hrs / 24);
  return `${days} ${plural(days, ['день', 'дня', 'дней'])} назад`;
}

/**
 * Создаёт элемент, текст вставляется безопасно (textContent).
 * @param {string} tag
 * @param {Record<string, any> | null} [props]
 * @param {...(Node | string | number | null | undefined | false)} children
 * @returns {HTMLElement}
 */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'string' || typeof c === 'number' ? String(c) : c);
  }
  return el;
}

/**
 * Отправляет команду фоновому скрипту.
 * @param {any} msg
 */
export async function send(msg) {
  const res = await chrome.runtime.sendMessage(msg);
  if (!res || !res.ok) throw new Error(res?.error || 'расширение не ответило');
  return res.data;
}
