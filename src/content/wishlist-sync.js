// @ts-check
// Работает на любых страницах магазина Steam. Если ты вошёл в аккаунт,
// раз в 30 минут забирает список желаемого (тот же запрос делает сам Steam)
// и передаёт его расширению — чтобы следить за ценами этих игр.
// Логин, пароль и куки никуда не отправляются: запрос идёт на сам Steam.

(() => {
  'use strict';

  const w = /** @type {any} */ (window);
  if (w.__deshevleWishlistSync) return;
  w.__deshevleWishlistSync = true;

  // Признаки того, что в Steam выполнен вход: меню аккаунта или аватар в шапке.
  const loggedIn = Boolean(
    document.querySelector('#account_pulldown, #global_actions .user_avatar, #global_action_menu .user_avatar')
  );
  if (!loggedIn) return;

  const KEY = 'deshevle:wishlist-sync';
  try {
    const last = Number(sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last < 30 * 60 * 1000) return;
  } catch {
    /* sessionStorage может быть недоступен — не страшно */
  }

  fetch('/dynamicstore/userdata/', { credentials: 'include' })
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      if (!data || !Array.isArray(data.rgWishlist)) return;
      try {
        sessionStorage.setItem(KEY, String(Date.now()));
      } catch {
        /* ignore */
      }
      return chrome.runtime.sendMessage({ type: 'wishlist:sync', appIds: data.rgWishlist });
    })
    .catch(() => {
      /* тихо игнорируем — это фоновая функция */
    });
})();
