// @ts-check
// Контент-скрипт для страниц игр в магазине Steam (store.steampowered.com/app/...).
// Читает со страницы название и цену игры, просит фоновый скрипт найти
// предложения и рисует панель «Дешевле» над блоком покупки.
//
// Панель живёт внутри Shadow DOM — так стили Steam и наши не мешают друг другу.

(() => {
  'use strict';

  const w = /** @type {any} */ (window);
  if (w.__deshevleLoaded) return;
  w.__deshevleLoaded = true;

  const match = /\/app\/(\d+)/.exec(location.pathname);
  if (!match) return;
  const appId = Number(match[1]);

  /** @typedef {import('../lib/types.js').OffersView} OffersView */
  /** @typedef {import('../lib/types.js').Offer} Offer */
  /** @typedef {import('../lib/types.js').CategoryView} CategoryView */

  // ---------------------------------------------------------------------------
  // Мелкие помощники
  // ---------------------------------------------------------------------------

  /**
   * Создаёт элемент. Текст всегда вставляется как textContent — это защищает
   * от того, что продавец впишет HTML в название лота.
   * @param {string} tag
   * @param {Record<string, any> | null} [props]
   * @param {...(Node | string | number | null | undefined | false)} children
   * @returns {HTMLElement}
   */
  function h(tag, props, ...children) {
    const el = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (v === undefined || v === null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'dataset') Object.assign(el.dataset, v);
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

  /** Иконки — статичные SVG, без пользовательских данных. */
  const ICONS = {
    logo: '<svg viewBox="0 0 24 24" fill="none"><path d="M3.5 12.6V5a1.5 1.5 0 0 1 1.5-1.5h7.6c.4 0 .78.16 1.06.44l7.4 7.4a1.5 1.5 0 0 1 0 2.12l-7.6 7.6a1.5 1.5 0 0 1-2.12 0l-7.4-7.4a1.5 1.5 0 0 1-.44-1.06Z" fill="currentColor" opacity=".22"/><path d="M3.5 12.6V5a1.5 1.5 0 0 1 1.5-1.5h7.6c.4 0 .78.16 1.06.44l7.4 7.4a1.5 1.5 0 0 1 0 2.12l-7.6 7.6a1.5 1.5 0 0 1-2.12 0l-7.4-7.4a1.5 1.5 0 0 1-.44-1.06Z" stroke="currentColor" stroke-width="1.6"/><path d="M12.5 9v6.2m0 0-2.4-2.4m2.4 2.4 2.4-2.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="7.4" cy="7.4" r="1.4" fill="currentColor"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" fill="none"><path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v4.5h-4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z" stroke="currentColor" stroke-width="1.8"/><path d="M19.4 13.5a7.7 7.7 0 0 0 0-3l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-2.6-1.5L14 2.5h-4l-.4 2.5A7.6 7.6 0 0 0 7 6.5l-2.4-1-2 3.4 2 1.6a7.7 7.7 0 0 0 0 3l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 2.6 1.5l.4 2.5h4l.4-2.5a7.6 7.6 0 0 0 2.6-1.5l2.4 1 2-3.4-2-1.6Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    chevron: '<svg viewBox="0 0 24 24" fill="none"><path d="m6 9 6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" fill="none"><path d="M5 12h14m0 0-5-5m5 5-5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    external: '<svg viewBox="0 0 24 24" fill="none"><path d="M14 4h6v6m0-6-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    bell: '<svg viewBox="0 0 24 24" fill="none"><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Zm4 4h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    bellOn: '<svg viewBox="0 0 24 24" fill="none"><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Z" fill="currentColor"/><path d="M10 20h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    shield: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6l-7-3Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="m9 12 2 2 4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    warn: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 4 2.5 20h19L12 4Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 10v4.5M12 17.5v.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    wallet: '<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="6" width="18" height="13" rx="2.5" stroke="currentColor" stroke-width="1.8"/><path d="M16 12.5h2M3 9.5h18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    star: '<svg viewBox="0 0 24 24"><path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9L12 3.5Z" fill="currentColor"/></svg>',
  };

  /**
   * @param {keyof typeof ICONS} name
   * @param {string} [cls]
   */
  function icon(name, cls = 'ic') {
    const span = document.createElement('span');
    span.className = cls;
    span.innerHTML = ICONS[name]; // статичная строка из кода выше
    return span;
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
        minimumFractionDigits: currency === 'RUB' ? 0 : undefined,
      }).format(amount);
    } catch {
      return `${Math.round(amount)} ${currency}`;
    }
  }

  /**
   * @param {number} n
   * @param {[string, string, string]} forms
   */
  function plural(n, forms) {
    const a = Math.abs(n) % 100;
    const b = a % 10;
    if (a > 10 && a < 20) return forms[2];
    if (b > 1 && b < 5) return forms[1];
    if (b === 1) return forms[0];
    return forms[2];
  }

  /** @param {number} n */
  function compact(n) {
    if (n >= 10000) return `${Math.round(n / 1000)}k`;
    if (n >= 1000) return `${(n / 1000).toFixed(1).replace('.0', '')}k`;
    return String(n);
  }

  /** «1.5k продаж», «42 продажи», «1 продажа» */
  /** @param {number} n */
  function soldText(n) {
    if (n >= 1000) return `${compact(n)} продаж`;
    return `${n} ${plural(n, ['продажа', 'продажи', 'продаж'])}`;
  }

  /** @param {number} ts */
  function timeAgo(ts) {
    const min = Math.round((Date.now() - ts) / 60000);
    if (min < 1) return 'только что';
    if (min < 60) return `${min} мин назад`;
    const hrs = Math.round(min / 60);
    return `${hrs} ч назад`;
  }

  const KIND_LABEL = { key: 'Ключ', gift: 'Гифт', account: 'Аккаунт' };

  // ---------------------------------------------------------------------------
  // Чтение данных со страницы Steam
  // ---------------------------------------------------------------------------

  function readGame() {
    const title = (
      document.querySelector('#appHubAppName')?.textContent ||
      document.querySelector('.apphub_AppName')?.textContent ||
      document.title.replace(/\s+(в|on|in)\s+Steam\s*$/i, '')
    ).trim();

    const currency = document.querySelector('meta[itemprop="priceCurrency"]')?.getAttribute('content') || null;
    const priceEl =
      document.querySelector('[id^="game_area_purchase_section_add_to_cart_"] [data-price-final]') ||
      document.querySelector('.game_area_purchase_game:not(.demo_above_purchase) [data-price-final]');
    const cents = priceEl ? Number(priceEl.getAttribute('data-price-final')) : NaN;
    const freeText = document.querySelector('#game_area_purchase .game_purchase_price')?.textContent || '';
    const isFree = cents === 0 || (!priceEl && /free to play|бесплатн/i.test(freeText));

    return {
      appId,
      title,
      steamPrice: currency && cents > 0 ? { amount: cents / 100, currency } : null,
      isFree,
      owned: Boolean(document.querySelector('.game_area_already_owned')),
    };
  }

  const game = readGame();
  if (!game.title || game.isFree) return;

  // ---------------------------------------------------------------------------
  // Встраиваем панель
  // ---------------------------------------------------------------------------

  const host = document.createElement('div');
  host.id = 'deshevle-root';
  host.style.cssText = 'display:block;margin:0 0 22px;';
  const purchaseArea = document.querySelector('#game_area_purchase');
  const fallback =
    document.querySelector('.leftcol.game_description_column') || document.querySelector('.game_page_autocollapse_ctn');
  if (purchaseArea) purchaseArea.prepend(host);
  else if (fallback) fallback.prepend(host);
  else return;

  const shadow = host.attachShadow({ mode: 'open' });
  shadow.append(h('link', { rel: 'stylesheet', href: chrome.runtime.getURL('src/content/panel.css') }));
  const root = h('div', { class: 'dz', role: 'region', 'aria-label': 'Дешевле: где купить игру выгоднее' });
  shadow.append(root);

  /**
   * @type {{
   *   view: OffersView | null, watch: { tracked: boolean, inWishlist: boolean },
   *   collapsed: boolean, tab: string | null, expanded: Record<string, boolean>,
   *   loading: boolean, refreshing: boolean, error: string | null
   * }}
   */
  const state = {
    view: null,
    watch: { tracked: false, inWishlist: false },
    collapsed: false,
    tab: null,
    expanded: {},
    loading: true,
    refreshing: false,
    error: null,
  };

  /** @param {any} msg */
  async function send(msg) {
    const res = await chrome.runtime.sendMessage(msg);
    if (!res || !res.ok) throw new Error(res?.error || 'расширение не ответило');
    return res.data;
  }

  /** @param {boolean} force */
  async function load(force) {
    state.error = null;
    if (force) state.refreshing = true;
    else state.loading = true;
    render();
    try {
      const data = await send({
        type: 'offers:get',
        force,
        game: { appId: game.appId, title: game.title, steamPrice: game.steamPrice, isFree: game.isFree },
      });
      state.view = data.view;
      state.watch = data.watch;
      state.collapsed = Boolean(data.collapsed);
      const tabs = tabList();
      if (!state.tab || !tabs.some((t) => t.id === state.tab)) {
        const withOffers = tabs.find((t) => t.count > 0);
        state.tab = (withOffers || tabs[0])?.id || null;
      }
    } catch (err) {
      state.error = String(/** @type {any} */ (err)?.message || err);
    } finally {
      state.loading = false;
      state.refreshing = false;
      render();
    }
  }

  function tabList() {
    const v = state.view;
    if (!v) return [];
    /** @type {Array<{ id: string, title: string, count: number, from: number | null }>} */
    const tabs = v.categories.map((c) => ({
      id: c.id,
      title: c.title,
      count: c.offers.length,
      from: (c.best || c.offers[0])?.amount ?? null,
    }));
    if (v.topup) tabs.push({ id: 'topup', title: 'Пополнение', count: -1, from: v.topup.amount });
    return tabs;
  }

  // ---------------------------------------------------------------------------
  // Отрисовка
  // ---------------------------------------------------------------------------

  function render() {
    root.replaceChildren(renderHeader());
    root.classList.toggle('is-collapsed', state.collapsed);
    if (state.collapsed) return;
    if (state.loading) {
      root.append(renderSkeleton());
      return;
    }
    if (state.error) {
      root.append(renderError(state.error));
      return;
    }
    const v = state.view;
    if (!v) return;
    root.append(renderHero(v));
    if (v.totalRelevant === 0) {
      root.append(renderEmpty(v));
    } else {
      root.append(renderTabs(), renderTabBody(v));
    }
    root.append(renderFooter(v));
  }

  function renderHeader() {
    const v = state.view;
    const summary =
      state.collapsed && v?.best
        ? h(
            'span',
            { class: 'dz-head-summary' },
            'от ',
            h('b', null, money(v.best.amount, v.currency)),
            v.best.savingsPct && v.best.savingsPct > 0 ? h('span', { class: 'pct sm' }, `−${v.best.savingsPct}%`) : null
          )
        : h('span', { class: 'dz-sub' }, 'где купить эту игру выгоднее');

    return h(
      'div',
      { class: 'dz-head' },
      h(
        'button',
        {
          class: 'dz-brand',
          type: 'button',
          title: state.collapsed ? 'Развернуть' : 'Свернуть',
          onclick: toggleCollapsed,
        },
        icon('logo', 'dz-logo'),
        h('span', { class: 'dz-name' }, 'Дешевле'),
        summary
      ),
      h(
        'div',
        { class: 'dz-actions' },
        !state.collapsed &&
          h(
            'button',
            {
              class: `btn-icon${state.refreshing ? ' spin' : ''}`,
              type: 'button',
              title: 'Обновить цены',
              'aria-label': 'Обновить цены',
              disabled: state.loading || state.refreshing,
              onclick: () => load(true),
            },
            icon('refresh')
          ),
        !state.collapsed &&
          h(
            'button',
            {
              class: 'btn-icon',
              type: 'button',
              title: 'Настройки',
              'aria-label': 'Настройки',
              onclick: () => send({ type: 'options:open' }).catch(() => {}),
            },
            icon('gear')
          ),
        h(
          'button',
          {
            class: `btn-icon chev${state.collapsed ? ' up' : ''}`,
            type: 'button',
            title: state.collapsed ? 'Развернуть' : 'Свернуть',
            'aria-label': state.collapsed ? 'Развернуть' : 'Свернуть',
            'aria-expanded': String(!state.collapsed),
            onclick: toggleCollapsed,
          },
          icon('chevron')
        )
      )
    );
  }

  async function toggleCollapsed() {
    state.collapsed = !state.collapsed;
    render();
    send({ type: 'settings:save', patch: { panelCollapsed: state.collapsed } }).catch(() => {});
    if (!state.collapsed && !state.view && !state.loading) load(false);
  }

  function renderSkeleton() {
    return h(
      'div',
      { class: 'dz-skel', 'aria-busy': 'true', 'aria-label': 'Ищу предложения' },
      h('div', { class: 'sk sk-a' }),
      h('div', { class: 'sk sk-b' }),
      h('div', { class: 'sk-row' }, h('div', { class: 'sk sk-c' }), h('div', { class: 'sk sk-c' }), h('div', { class: 'sk sk-c' })),
      h('div', { class: 'sk sk-d' }),
      h('div', { class: 'sk sk-d' }),
      h('p', { class: 'sk-note' }, 'Ищу «', game.title, '» на Plati и GGSel…')
    );
  }

  /** @param {string} message */
  function renderError(message) {
    return h(
      'div',
      { class: 'dz-msg' },
      icon('warn', 'ic warn'),
      h('div', null, h('b', null, 'Не получилось загрузить цены'), h('p', null, message)),
      h('button', { class: 'btn-ghost', type: 'button', onclick: () => load(true) }, 'Повторить')
    );
  }

  /** @param {OffersView} v */
  function renderHero(v) {
    const best = v.best;
    const steam = v.steamPrice;

    if (!best) {
      const any = v.categories.flatMap((c) => c.offers).sort((a, b) => a.amount - b.amount)[0];
      return h(
        'div',
        { class: 'dz-hero muted' },
        h(
          'div',
          { class: 'hero-main' },
          h('div', { class: 'hero-label' }, 'Лучшая цена'),
          h(
            'div',
            { class: 'hero-empty' },
            any
              ? 'Есть только предложения от продавцов с малым числом продаж — смотри внимательно.'
              : 'Ключей и гифтов от проверенных продавцов не нашли.'
          ),
          steam ? h('div', { class: 'hero-steam' }, 'В Steam: ', h('b', null, money(steam.amount, steam.currency))) : null
        )
      );
    }

    const pct = best.savingsPct;
    const cheaper = pct !== null && pct > 0;
    return h(
      'div',
      { class: 'dz-hero' },
      h(
        'div',
        { class: 'hero-main' },
        h('div', { class: 'hero-label' }, cheaper ? 'Лучшая цена · проверенный продавец' : 'Лучшая цена'),
        h(
          'div',
          { class: 'hero-price-row' },
          h('span', { class: 'hero-price' }, money(best.amount, v.currency)),
          cheaper ? h('span', { class: 'pct' }, `−${pct}%`) : null,
          steam
            ? h(
                'span',
                { class: 'hero-steam' },
                'в Steam ',
                h(cheaper ? 's' : 'b', null, money(steam.amount, steam.currency))
              )
            : h('span', { class: 'hero-steam' }, 'В Steam игра недоступна для твоего региона')
        ),
        h(
          'div',
          { class: 'hero-meta' },
          h('span', { class: `chip kind-${best.kind}` }, KIND_LABEL[/** @type {'key'|'gift'} */ (best.kind)] || best.kind),
          best.region ? h('span', { class: 'chip' }, best.region) : null,
          h('span', { class: `src src-${best.source}` }, best.sourceName),
          h('span', { class: 'seller' }, best.seller),
          best.rating !== null ? h('span', { class: 'rating' }, icon('star', 'ic star'), best.rating.toFixed(1)) : null,
          h('span', { class: 'sold' }, soldText(best.sold))
        ),
        cheaper && steam
          ? h(
              'div',
              { class: 'hero-save' },
              'Экономия ',
              h('b', null, money(steam.amount - best.amount, v.currency)),
              ' по сравнению с покупкой в Steam'
            )
          : null
      ),
      h(
        'a',
        { class: 'btn-buy', href: best.url, target: '_blank', rel: 'noopener noreferrer' },
        h('span', null, `Купить на ${best.sourceName}`),
        icon('arrow')
      )
    );
  }

  function renderTabs() {
    const v = /** @type {OffersView} */ (state.view);
    const tabs = tabList();
    return h(
      'div',
      { class: 'dz-tabs', role: 'tablist' },
      ...tabs.map((t) =>
        h(
          'button',
          {
            class: `tab${t.id === state.tab ? ' active' : ''}${t.id === 'account' ? ' risky' : ''}`,
            type: 'button',
            role: 'tab',
            'aria-selected': String(t.id === state.tab),
            onclick: () => {
              state.tab = t.id;
              render();
            },
          },
          h(
            'span',
            { class: 'tab-title' },
            t.id === 'topup' ? icon('wallet', 'ic tab-ic') : null,
            t.id === 'account' ? icon('warn', 'ic tab-ic') : null,
            t.title,
            t.count >= 0 ? h('span', { class: 'tab-count' }, t.count) : null
          ),
          h('span', { class: 'tab-from' }, t.from !== null ? `${t.id === 'topup' ? '≈ ' : 'от '}${money(t.from, v.currency)}` : 'нет')
        )
      )
    );
  }

  /** @param {OffersView} v */
  function renderTabBody(v) {
    if (state.tab === 'topup' && v.topup) return renderTopup(v);
    const cat = v.categories.find((c) => c.id === state.tab);
    if (!cat) return h('div');

    const LIMIT = 5;
    const expanded = Boolean(state.expanded[cat.id]);
    const list = expanded ? cat.offers.slice(0, 40) : cat.offers.slice(0, LIMIT);

    return h(
      'div',
      { class: 'dz-body', role: 'tabpanel' },
      h(
        'div',
        { class: `dz-hint risk-${cat.risk}` },
        icon(cat.risk === 'high' ? 'warn' : 'shield', 'ic'),
        h('span', null, cat.hint)
      ),
      cat.offers.length === 0
        ? h('div', { class: 'dz-none' }, 'В этой категории ничего не нашли.')
        : h('div', { class: 'rows' }, ...list.map((o) => renderRow(o, v))),
      cat.offers.length > LIMIT
        ? h(
            'button',
            {
              class: 'btn-more',
              type: 'button',
              onclick: () => {
                state.expanded[cat.id] = !expanded;
                render();
              },
            },
            expanded ? 'Свернуть' : `Показать ещё ${Math.min(cat.offers.length, 40) - LIMIT}`
          )
        : null
    );
  }

  /**
   * @param {Offer} o
   * @param {OffersView} v
   */
  function renderRow(o, v) {
    const pct = o.savingsPct;
    return h(
      'a',
      {
        class: `row${o.trusted ? '' : ' untrusted'}`,
        href: o.url,
        target: '_blank',
        rel: 'noopener noreferrer',
        title: o.title,
      },
      h('span', { class: `src src-${o.source}` }, o.sourceName),
      h(
        'span',
        { class: 'row-main' },
        h('span', { class: 'row-title' }, o.title),
        h(
          'span',
          { class: 'row-meta' },
          o.region ? h('span', { class: 'chip sm' }, o.region) : null,
          h('span', { class: 'seller' }, o.seller),
          o.rating !== null ? h('span', { class: 'rating' }, icon('star', 'ic star'), o.rating.toFixed(1)) : null,
          h('span', { class: 'sold' }, soldText(o.sold)),
          o.trusted ? null : h('span', { class: 'flag' }, 'мало продаж')
        )
      ),
      h(
        'span',
        { class: 'row-price' },
        h('b', null, money(o.amount, v.currency)),
        pct !== null
          ? h('span', { class: `pct sm${pct > 0 ? '' : ' worse'}` }, pct > 0 ? `−${pct}%` : `+${Math.abs(pct)}%`)
          : null
      ),
      icon('external', 'ic row-go')
    );
  }

  /** @param {OffersView} v */
  function renderTopup(v) {
    const t = /** @type {NonNullable<OffersView['topup']>} */ (v.topup);
    const steam = /** @type {NonNullable<OffersView['steamPrice']>} */ (v.steamPrice);
    return h(
      'div',
      { class: 'dz-body', role: 'tabpanel' },
      h(
        'div',
        { class: 'dz-hint risk-low' },
        icon('shield', 'ic'),
        h(
          'span',
          null,
          'Самый надёжный способ: пополняешь кошелёк Steam через сервис и покупаешь игру в магазине как обычно — она навсегда остаётся на твоём аккаунте.'
        )
      ),
      h(
        'div',
        { class: 'topup' },
        h(
          'div',
          { class: 'topup-calc' },
          h('div', { class: 'tc-row' }, h('span', null, 'Цена в Steam'), h('b', null, money(steam.amount, v.currency))),
          h(
            'div',
            { class: 'tc-row' },
            h('span', null, `Комиссия сервиса ~${t.commissionPct}%`),
            h('b', null, `+ ${money(t.amount - steam.amount, v.currency)}`)
          ),
          h('div', { class: 'tc-row total' }, h('span', null, 'Итого'), h('b', null, `≈ ${money(t.amount, v.currency)}`))
        ),
        h(
          'a',
          { class: 'btn-ghost', href: t.url, target: '_blank', rel: 'noopener noreferrer' },
          'Найти пополнение',
          icon('external')
        )
      ),
      h('p', { class: 'dz-foot-note' }, 'Комиссию можно поменять в настройках — у разных сервисов она от 0 до 15%.')
    );
  }

  /** @param {OffersView} v */
  function renderEmpty(v) {
    return h(
      'div',
      { class: 'dz-msg' },
      icon('warn', 'ic'),
      h(
        'div',
        null,
        h('b', null, 'Подходящих предложений не нашлось'),
        h(
          'p',
          null,
          `Площадки вернули ${v.totalFound} ${plural(v.totalFound, ['лот', 'лота', 'лотов'])}, но среди них нет ключей или гифтов именно этой игры. Можно поискать вручную:`
        ),
        h(
          'div',
          { class: 'links' },
          ...v.sources.map((s) =>
            h('a', { href: s.searchUrl, target: '_blank', rel: 'noopener noreferrer', class: 'link' }, `Поиск на ${s.name}`, icon('external'))
          )
        )
      )
    );
  }

  /** @param {OffersView} v */
  function renderFooter(v) {
    const watching = state.watch.tracked || state.watch.inWishlist;
    return h(
      'div',
      { class: 'dz-foot' },
      h(
        'div',
        { class: 'sources' },
        ...v.sources.map((s) =>
          h(
            'a',
            {
              class: `source ${s.ok ? 'ok' : 'fail'}`,
              href: s.searchUrl,
              target: '_blank',
              rel: 'noopener noreferrer',
              title: s.ok ? `Открыть поиск на ${s.name}` : `Ошибка: ${s.error}`,
            },
            h('span', { class: 'dot' }),
            s.name,
            h('span', { class: 'cnt' }, s.ok ? String(s.count) : 'ошибка')
          )
        ),
        h('span', { class: 'updated' }, `обновлено ${timeAgo(v.fetchedAt)}`)
      ),
      state.watch.inWishlist && !state.watch.tracked
        ? h('span', { class: 'watch on static', title: 'Игра в списке желаемого — цены проверяются автоматически' }, icon('bellOn'), 'В списке желаемого')
        : h(
            'button',
            {
              class: `watch${watching ? ' on' : ''}`,
              type: 'button',
              title: 'Пришлём уведомление, когда цена упадёт',
              onclick: async () => {
                try {
                  state.watch = await send({ type: 'track:toggle', appId: game.appId, name: game.title });
                  render();
                } catch {
                  /* ignore */
                }
              },
            },
            icon(watching ? 'bellOn' : 'bell'),
            watching ? 'Слежу за ценой' : 'Следить за ценой'
          )
    );
  }

  render();
  load(false);
})();
