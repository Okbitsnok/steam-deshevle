// @ts-check

/**
 * Загружает JSON с таймаутом.
 *
 * Для автотестов можно подменить сеть: если в service worker задана функция
 * globalThis.__deshevleMockFetch, запросы пойдут в неё, а не в интернет.
 *
 * @param {string} url
 * @param {RequestInit} [init]
 * @param {number} [timeoutMs]
 * @returns {Promise<any>}
 */
export async function fetchJson(url, init = {}, timeoutMs = 15000) {
  /** @type {typeof fetch} */
  const impl = /** @type {any} */ (globalThis).__deshevleMockFetch || fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await impl(url, { ...init, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    // Некоторые API отдают JSON с BOM или с content-type text/plain — парсим сами.
    const text = (await res.text()).replace(/^﻿/, '');
    return JSON.parse(text);
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('сервер не ответил вовремя');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
