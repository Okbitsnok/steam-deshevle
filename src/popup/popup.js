// @ts-check
import { money, plural, timeAgo, h, send } from '../ui/format.js';

/**
 * @typedef {Object} GameRow
 * @property {number} appId
 * @property {string} name
 * @property {string | null} image
 * @property {{ amount: number, currency: string } | null} steamPrice
 * @property {import('../lib/types.js').Offer | null} best
 * @property {number | null} savingsPct
 * @property {number} checkedAt
 * @property {string} [error]
 * @property {boolean} tracked
 * @property {boolean} inWishlist
 * @property {string} steamUrl
 */

/**
 * @typedef {Object} Progress
 * @property {number} [runId]
 * @property {boolean} running
 * @property {number} done
 * @property {number} total
 * @property {number} at
 * @property {number} [finishedAt]
 * @property {number} [errors]
 * @property {number} [newDeals]
 */

const $ = (/** @type {string} */ sel) => /** @type {HTMLElement} */ (document.querySelector(sel));

/** Если проверка «висит» дольше этого времени без новостей — считаем, что она оборвалась. */
const STALE_MS = 2 * 60 * 1000;

/**
 * watchRunId — номер проверки, которую запустили из этого окна. Итог показываем только для неё.
 * @type {{ games: GameRow[], wishlistSyncedAt: number, progress: Progress | null, filter: string, watchRunId: number | null }}
 */
const state = { games: [], wishlistSyncedAt: 0, progress: null, filter: 'all', watchRunId: null };

const KIND = { key: 'ключ', gift: 'гифт', account: 'аккаунт' };

/** @param {Progress | null} p */
function isRunning(p) {
  return Boolean(p && p.running && Date.now() - p.at < STALE_MS);
}

async function load() {
  try {
    const data = await send({ type: 'games:list' });
    state.games = data.games;
    state.wishlistSyncedAt = data.wishlistSyncedAt;
    state.progress = data.progress;
  } catch (err) {
    $('#list').replaceChildren(h('div', { class: 'empty' }, h('b', null, 'Ошибка'), h('p', null, String(err))));
    return;
  }
  render();
}

function render() {
  renderProgress();
  renderSummary();
  renderList();
  renderFooter();
}

function renderFooter() {
  const parts = [];
  const lastCheck = Math.max(0, ...state.games.map((g) => g.checkedAt || 0));
  if (lastCheck) parts.push(`Цены проверены ${timeAgo(lastCheck)}`);
  if (state.wishlistSyncedAt) parts.push(`список желаемого: ${timeAgo(state.wishlistSyncedAt)}`);
  parts.push('Plati, GGSel');
  $('#footer-text').textContent = parts.join(' · ');
}

function renderProgress() {
  const p = state.progress;
  const box = $('#progress');
  const btn = /** @type {HTMLButtonElement} */ ($('#refresh'));
  const running = isRunning(p);
  const empty = state.games.length === 0;
  box.hidden = !running;
  btn.disabled = running || empty;
  btn.classList.toggle('spin', running);
  btn.title = empty ? 'Пока нечего проверять — добавь игры' : running ? 'Проверяю…' : 'Проверить цены сейчас';
  if (running && p) {
    const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
    $('#progress-fill').style.width = `${pct}%`;
    $('#progress-text').textContent = `Проверяю цены: ${p.done} из ${p.total}`;
  }
}

/** @type {number | undefined} */
let statusTimer;
/**
 * Короткое сообщение под шапкой.
 * @param {string} text
 * @param {'ok' | 'info' | 'warn'} [kind]
 */
function showStatus(text, kind = 'ok') {
  const el = $('#status');
  el.textContent = text;
  el.className = `status ${kind}`;
  el.hidden = false;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => {
    el.hidden = true;
  }, 5000);
}

/**
 * Сообщение по итогам проверки, которую запустили из этого окна.
 * @param {Progress} p
 */
function reportFinished(p) {
  const n = p.total;
  let text = `Готово: проверил ${n} ${plural(n, ['игру', 'игры', 'игр'])}`;
  if (p.newDeals) text += ` · подешевело: ${p.newDeals}`;
  if (p.errors) text += ` · не получилось: ${p.errors}`;
  showStatus(text, p.errors ? 'warn' : 'ok');
}

function renderSummary() {
  const box = $('#summary');
  const checked = state.games.filter((g) => g.checkedAt);
  if (!checked.length) {
    box.hidden = true;
    return;
  }
  const cheaper = checked.filter((g) => (g.savingsPct ?? 0) > 0);
  // Сумма экономии: считаем только в одной валюте (самой частой).
  /** @type {Record<string, number>} */
  const byCur = {};
  for (const g of cheaper) {
    if (!g.best || !g.steamPrice) continue;
    const cur = g.steamPrice.currency;
    byCur[cur] = (byCur[cur] || 0) + Math.max(0, g.steamPrice.amount - g.best.amount);
  }
  const top = Object.entries(byCur).sort((a, b) => b[1] - a[1])[0];
  box.hidden = false;
  box.replaceChildren(
    h(
      'div',
      { class: 'stat' },
      h('div', { class: 'stat-label' }, 'Дешевле, чем в Steam'),
      h('div', { class: 'stat-value' }, `${cheaper.length} `, h('span', { class: 'stat-label' }, `из ${state.games.length}`))
    ),
    h(
      'div',
      { class: 'stat' },
      h('div', { class: 'stat-label' }, 'Можно сэкономить'),
      h('div', { class: 'stat-value mint' }, top ? money(top[1], top[0]) : '—')
    )
  );
}

function filtered() {
  const list = [...state.games];
  list.sort((a, b) => (b.savingsPct ?? -999) - (a.savingsPct ?? -999) || a.name.localeCompare(b.name));
  if (state.filter === 'deals') return list.filter((g) => (g.savingsPct ?? 0) >= 30);
  if (state.filter === 'tracked') return list.filter((g) => g.tracked);
  return list;
}

function renderList() {
  const box = $('#list');
  $('.filters').hidden = state.games.length === 0;
  if (!state.games.length) {
    box.replaceChildren(
      h(
        'div',
        { class: 'empty' },
        emptyIcon(),
        h('b', null, 'Пока тут пусто'),
        h('p', null, 'Открой любую игру в магазине Steam. Рядом с кнопкой покупки появится панель с ценами. Входить в аккаунт для этого не нужно.'),
        h(
          'p',
          { class: 'empty-sub' },
          'Нажми «Следить за ценой» на странице игры, и она появится здесь. Если ты уже вошёл в Steam в этом браузере, сюда сами подтянутся игры из списка желаемого.'
        ),
        h('a', { class: 'btn btn-primary', href: 'https://store.steampowered.com/', target: '_blank' }, 'Открыть магазин Steam'),
        h('p', { class: 'empty-note' }, 'Расширение не читает пароли и данные аккаунта. Своего сервера у него нет.')
      )
    );
    return;
  }
  const list = filtered();
  if (!list.length) {
    box.replaceChildren(
      h(
        'div',
        { class: 'empty' },
        h('p', null, state.filter === 'deals' ? 'Пока нет игр со скидкой больше 30%.' : 'Ты ещё не нажимал «Следить за ценой» ни на одной игре.')
      )
    );
    return;
  }
  box.replaceChildren(...list.map(renderGame));
}

/** @param {GameRow} g */
function renderGame(g) {
  const best = g.best;
  const steam = g.steamPrice;
  const pct = g.savingsPct;
  /** @type {HTMLElement} */
  let priceBlock;
  if (best) {
    priceBlock = h(
      'a',
      { class: 'game-price', href: best.url, target: '_blank', rel: 'noopener noreferrer', title: `Открыть лот на ${best.sourceName}` },
      h('b', null, money(best.amount, steam?.currency || 'RUB')),
      pct !== null ? h('span', { class: `pct${pct > 0 ? '' : ' worse'}` }, pct > 0 ? `−${pct}%` : `+${Math.abs(pct)}%`) : null
    );
  } else {
    priceBlock = h(
      'span',
      { class: 'game-price' },
      h('span', { class: 'none' }, g.checkedAt ? (g.error ? 'ошибка' : 'нет предложений') : 'ещё не проверяли')
    );
  }

  const meta = [];
  if (best) {
    meta.push(h('span', { class: `src src-${best.source}` }, best.sourceName));
    meta.push(h('span', null, KIND[/** @type {'key' | 'gift'} */ (best.kind)] || ''));
  }
  if (steam) meta.push(h('span', null, 'Steam ', best && pct !== null && pct > 0 ? h('s', null, money(steam.amount, steam.currency)) : money(steam.amount, steam.currency)));
  if (g.error) meta.push(h('span', { class: 'err', title: g.error }, '⚠'));

  return h(
    'div',
    { class: 'game' },
    h(
      'a',
      { href: g.steamUrl, target: '_blank', rel: 'noopener noreferrer', title: 'Открыть в Steam' },
      g.image ? h('img', { class: 'thumb', src: g.image, alt: '', loading: 'lazy' }) : h('div', { class: 'thumb ph' }, 'Steam')
    ),
    h(
      'a',
      { class: 'game-main', href: g.steamUrl, target: '_blank', rel: 'noopener noreferrer' },
      h('div', { class: 'game-name' }, g.name),
      h('div', { class: 'game-meta' }, ...meta)
    ),
    priceBlock
  );
}

function emptyIcon() {
  const span = document.createElement('span');
  span.className = 'empty-ic';
  span.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" width="24" height="24"><path d="M3.5 12.6V5a1.5 1.5 0 0 1 1.5-1.5h7.6c.4 0 .78.16 1.06.44l7.4 7.4a1.5 1.5 0 0 1 0 2.12l-7.6 7.6a1.5 1.5 0 0 1-2.12 0l-7.4-7.4a1.5 1.5 0 0 1-.44-1.06Z" stroke="currentColor" stroke-width="1.6"/><circle cx="7.4" cy="7.4" r="1.4" fill="currentColor"/></svg>';
  return span;
}

/**
 * Запускает проверку цен.
 * @param {boolean} fromButton нажата ли кнопка (тогда покажем, если проверять нечего)
 */
async function startCheck(fromButton) {
  try {
    const res = await send({ type: 'games:check' });
    if (res.started) {
      state.watchRunId = res.runId;
      state.progress = { runId: res.runId, running: true, done: 0, total: res.total, at: Date.now() };
      renderProgress();
    } else if (res.running) {
      state.watchRunId = res.runId;
      if (fromButton) showStatus('Проверка уже идёт…', 'info');
    } else if (fromButton) {
      showStatus('Пока нечего проверять — добавь игры', 'info');
    }
  } catch (err) {
    if (fromButton) showStatus(`Не получилось: ${err}`, 'warn');
  }
}

// --- События -----------------------------------------------------------------

$('#refresh').addEventListener('click', () => startCheck(true));

$('#settings').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

document.querySelectorAll('.filter').forEach((btn) => {
  btn.addEventListener('click', () => {
    const el = /** @type {HTMLElement} */ (btn);
    state.filter = el.dataset.filter || 'all';
    document.querySelectorAll('.filter').forEach((b) => {
      b.classList.toggle('active', b === btn);
      b.setAttribute('aria-selected', String(b === btn));
    });
    renderList();
  });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.checkProgress) {
    /** @type {Progress} */
    const next = changes.checkProgress.newValue;
    state.progress = next;
    renderProgress();
    if (next && !next.running && state.watchRunId !== null && next.runId === state.watchRunId) {
      state.watchRunId = null;
      reportFinished(next);
    }
  }
  if (changes.games || changes.wishlist || changes.tracked) load();
});

(async () => {
  send({ type: 'badge:reset' }).catch(() => {});
  await load();
  // Если есть игры без проверки, сразу запускаем её.
  if (state.games.some((g) => !g.checkedAt) && !isRunning(state.progress)) {
    startCheck(false);
  }
})();
