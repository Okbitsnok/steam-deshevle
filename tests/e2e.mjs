// Сквозной тест: грузит расширение в Chromium, открывает «страницу Steam»
// (локальная копия разметки), подменяет ответы площадок на сохранённые
// реальные данные и проверяет панель, попап и настройки. Делает скриншоты.
//
// Запуск: npm i -D playwright && npx playwright install chromium && node tests/e2e.mjs

import { chromium } from 'playwright';
import { readFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const here = path.dirname(fileURLToPath(import.meta.url));
const extPath = path.resolve(here, '..');
const shots = path.join(here, 'screenshots');
mkdirSync(shots, { recursive: true });
const fixture = (n) => readFileSync(path.join(here, 'fixtures', n), 'utf8');

const steamHtml = ({ cents, text, currency }) =>
  fixture('steam-app.html')
    .replaceAll('__PRICE_CENTS__', String(cents))
    .replaceAll('__PRICE_TEXT__', text)
    .replaceAll('__CURRENCY__', currency);

// Игры для попапа (список желаемого)
const GAMES = {
  1222140: { name: 'Detroit: Become Human', rub: 2499 },
  367520: { name: 'Hollow Knight', rub: 565 },
  1145360: { name: 'Hades', rub: 649 },
  1091500: { name: 'Cyberpunk 2077', rub: 2999 },
};

const context = await chromium.launchPersistentContext(mkdtempSync(path.join(tmpdir(), 'dz-')), {
  channel: 'chromium',
  headless: true,
  args: [`--disable-extensions-except=${extPath}`, `--load-extension=${extPath}`],
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: 2,
  locale: 'ru-RU',
});

let [sw] = context.serviceWorkers();
if (!sw) sw = await context.waitForEvent('serviceworker');
const extId = sw.url().split('/')[2];
console.log('extension id:', extId);

async function installMocks() {
  await sw.evaluate(
    ({ plati, ggsel, games }) => {
      const synthetic = (title, base) => ({
        plati: JSON.stringify({
          items: [
            { id: 900001, name: `${title} Steam Ключ РФ+СНГ`, price_rur: Math.round(base * 0.42), price_usd: 3, price_eur: 2.8, url: 'https://plati.market/itm/900001', seller_name: 'KeyStore', numsold: 812, count_positiveresponses: 120, count_negativeresponses: 1, section_id: 20887 },
            { id: 900002, name: `${title} STEAM GIFT АВТОДОСТАВКА`, price_rur: Math.round(base * 0.81), price_usd: 6, price_eur: 5.5, url: 'https://plati.market/itm/900002', seller_name: 'GiftHub', numsold: 233, count_positiveresponses: 40, count_negativeresponses: 0, section_id: 20887 },
          ],
        }),
        ggsel: JSON.stringify({ data: { items: [] } }),
      });
      const byTitle = {};
      for (const [id, g] of Object.entries(games)) {
        byTitle[g.name.toLowerCase()] = id === '1222140' ? { plati, ggsel } : synthetic(g.name, g.rub);
      }
      const pick = (q) => byTitle[String(q).toLowerCase()] || { plati: '{"items":[]}', ggsel: '{"data":{"items":[]}}' };
      globalThis.__deshevleMockFetch = async (url, init) => {
        url = String(url);
        await new Promise((r) => setTimeout(r, 250));
        const ok = (text) => new Response(text, { status: 200 });
        if (url.includes('plati.io')) return ok(pick(decodeURIComponent(/query=([^&]+)/.exec(url)[1])).plati);
        if (url.includes('api.ggsel.com')) return ok(pick(JSON.parse(init.body).search_term).ggsel);
        if (url.includes('appdetails')) {
          const id = /appids=(\d+)/.exec(url)[1];
          const g = games[id];
          return ok(
            JSON.stringify({
              [id]: {
                success: true,
                data: {
                  name: g.name,
                  is_free: false,
                  capsule_image: null,
                  header_image: null,
                  price_overview: { currency: 'RUB', final: g.rub * 100, initial: g.rub * 100 },
                },
              },
            })
          );
        }
        if (url.includes('cbr-xml-daily')) return ok(JSON.stringify({ Valute: { USD: { Nominal: 1, Value: 82 }, EUR: { Nominal: 1, Value: 92 } } }));
        return new Response('', { status: 404 });
      };
    },
    { plati: fixture('plati-detroit.json'), ggsel: fixture('ggsel-detroit.json'), games: GAMES }
  );
}
await installMocks();
// Плановая проверка цен срабатывает через 2 минуты после установки и мешала бы тестам.
await sw.evaluate(() => chrome.alarms.clearAll());

/** @param {{ cents: number, text: string, currency: string }} price */
async function openSteam(price) {
  await context.unroute('https://store.steampowered.com/**').catch(() => {});
  await context.route('https://store.steampowered.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: steamHtml(price) })
  );
  const page = await context.newPage();
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.goto('https://store.steampowered.com/app/1222140/Detroit_Become_Human/');
  return page;
}

let ok = 0;
const txt = async (loc) => (await loc.innerText()).replace(/[\u00a0\u202f]/g, ' ');
const step = (name) => console.log(`  ✓ ${name}`) || ok++;

// --- 0. Пустой попап (свежая установка, без входа в Steam) ---------------------
{
  const empty = await context.newPage();
  await empty.setViewportSize({ width: 380, height: 600 });
  await empty.goto(`chrome-extension://${extId}/src/popup/popup.html`);
  await empty.locator('.empty').waitFor();
  assert.match(await empty.locator('.empty').innerText(), /Входить в аккаунт для этого не нужно/);
  assert.equal(await empty.locator('#refresh').isDisabled(), true, 'кнопка проверки должна быть неактивна, когда игр нет');
  assert.equal(await empty.locator('.filters').isVisible(), false);
  assert.equal(await empty.locator('.empty a.btn').getAttribute('href'), 'https://store.steampowered.com/');
  await empty.screenshot({ path: path.join(shots, '5a-popup-empty.png') });
  step('пустой попап: понятное объяснение, ссылка на магазин, кнопка проверки неактивна');
  await empty.close();
}

// --- 1. Панель на странице игры (рубли) ---------------------------------------
const page = await openSteam({ cents: 249900, text: '2 499 ₽', currency: 'RUB' });
const panel = page.locator('#deshevle-root');
await panel.waitFor();
await page.locator('.dz-skel').first().waitFor({ state: 'visible', timeout: 3000 }).catch(() => {});
await page.screenshot({ path: path.join(shots, '0-loading.png'), clip: { x: 150, y: 120, width: 660, height: 420 } });
await page.locator('.hero-price').waitFor({ timeout: 15000 });
assert.equal(await txt(page.locator('.hero-price')), '399 ₽');
assert.equal(await page.locator('.dz-hero .pct').innerText(), '−84%');
step('лучшая цена 399 ₽ и скидка −84% на странице');

const tabs = await page.locator('.tab .tab-title').allInnerTexts();
assert.deepEqual(tabs.map((t) => t.replace(/\d+/g, '').trim()), ['Ключи', 'Гифты', 'Аккаунты', 'Пополнение']);
step('вкладки: Ключи, Гифты, Аккаунты, Пополнение');

const rows = await page.locator('.row .row-title').allInnerTexts();
assert.ok(rows.length === 5, `строк ${rows.length}`);
assert.ok(rows.every((t) => !/ps4|epic|аренд/i.test(t)));
step('в списке ключей нет PS4/Epic/аренды');

const box = await panel.boundingBox();
await page.screenshot({ path: path.join(shots, '1-panel-keys.png'), clip: { x: box.x - 16, y: box.y - 70, width: box.width + 32, height: box.height + 160 } });

await page.locator('.btn-more').click();
assert.ok((await page.locator('.row').count()) > 5);
step('«Показать ещё» раскрывает список');
await page.locator('.btn-more').click();

await page.locator('.tab', { hasText: 'Гифты' }).click();
await page.locator('.dz-hint').waitFor();
assert.match(await page.locator('.dz-hint').innerText(), /подарком/);
const box2 = await panel.boundingBox();
await page.screenshot({ path: path.join(shots, '2-panel-gifts.png'), clip: { x: box2.x - 16, y: box2.y - 16, width: box2.width + 32, height: box2.height + 32 } });
step('вкладка «Гифты»');

await page.locator('.tab', { hasText: 'Аккаунты' }).click();
assert.match(await page.locator('.dz-hint').innerText(), /нарушает правила Steam/i);
const boxAcc = await panel.boundingBox();
await page.screenshot({ path: path.join(shots, '7-panel-accounts.png'), clip: { x: boxAcc.x - 16, y: boxAcc.y - 16, width: boxAcc.width + 32, height: boxAcc.height + 32 } });
step('вкладка «Аккаунты» с предупреждением, но лучшая цена — ключ');

await page.locator('.tab', { hasText: 'Пополнение' }).click();
assert.match(await page.locator('.tc-row.total').innerText(), /2\s?699/);
const box3 = await panel.boundingBox();
await page.screenshot({ path: path.join(shots, '3-panel-topup.png'), clip: { x: box3.x - 16, y: box3.y - 16, width: box3.width + 32, height: box3.height + 32 } });
step('вкладка «Пополнение»: 2 499 ₽ + 8% ≈ 2 699 ₽');

await page.locator('.watch').click();
await page.locator('.watch.on').waitFor();
const tracked = await sw.evaluate(async () => (await chrome.storage.local.get('tracked')).tracked);
assert.ok(tracked && tracked['1222140']);
step('кнопка «Следить за ценой» добавляет игру');

await page.locator('.dz-actions .chev').click();
await page.locator('.dz.is-collapsed').waitFor();
assert.match(await page.locator('.dz-head-summary').innerText(), /399/);
const box4 = await panel.boundingBox();
await page.screenshot({ path: path.join(shots, '4-panel-collapsed.png'), clip: { x: box4.x - 16, y: box4.y - 16, width: box4.width + 32, height: box4.height + 120 } });
await page.locator('.dz-actions .chev').click();
await page.locator('.hero-price').waitFor();
step('сворачивание панели');
await page.close();

// --- 2. Цена Steam в евро ------------------------------------------------------
const pageEur = await openSteam({ cents: 3999, text: '39,99€', currency: 'EUR' });
await pageEur.locator('.hero-price').waitFor({ timeout: 15000 });
assert.match(await pageEur.locator('.hero-price').innerText(), /4,08\s?€/);
assert.equal(await pageEur.locator('.dz-hero .pct').innerText(), '−90%');
step('Steam в евро: 4,08 € и −90%');
await pageEur.close();

// --- 3. Попап со списком желаемого ----------------------------------------------
await sw.evaluate(async (ids) => {
  await chrome.storage.local.set({ wishlist: { appIds: ids, syncedAt: Date.now() - 5 * 60000 } });
}, Object.keys(GAMES).map(Number));
await installMocks();
const popup = await context.newPage();
await popup.setViewportSize({ width: 380, height: 600 });
await popup.goto(`chrome-extension://${extId}/src/popup/popup.html`);
await popup.locator('.game').first().waitFor();
await popup.waitForFunction(() => document.querySelectorAll('.game .game-price b').length >= 4, null, { timeout: 30000 });
await popup.waitForFunction(() => document.getElementById('progress')?.hidden === true, null, { timeout: 30000 });
const names = await popup.locator('.game-name').allInnerTexts();
assert.equal(names.length, 4);
assert.equal(names[0], 'Detroit: Become Human'); // самая большая выгода — первой
await popup.screenshot({ path: path.join(shots, '5-popup.png') });
step('попап: 4 игры из списка желаемого, сортировка по выгоде');

await popup.locator('#refresh').click();
await popup.locator('#progress').waitFor({ state: 'visible', timeout: 5000 });
await popup.locator('#progress').waitFor({ state: 'hidden', timeout: 30000 });
await popup.locator('#status.ok').waitFor({ timeout: 5000 });
const statusText = await popup.locator('#status').innerText();
assert.match(statusText, /Готово: проверил 4 игры/);
await popup.screenshot({ path: path.join(shots, '5b-popup-checked.png') });
step(`кнопка «Проверить цены» показывает итог: «${statusText}»`);

await popup.locator('.filter', { hasText: 'Отслеживаю' }).click();
assert.equal(await popup.locator('.game').count(), 1);
step('фильтр «Отслеживаю»');
await popup.close();

// --- 4. Уведомление о снижении цены ---------------------------------------------
const before = await sw.evaluate(async () => (await chrome.storage.local.get('games')).games['367520'].bestRub);
await sw.evaluate(async () => {
  const d = await chrome.storage.local.get('games');
  d.games['367520'].bestRub = 400; // будто раньше было дороже
  d.games['367520'].lastNotifiedRub = 400;
  await chrome.storage.local.set({ games: d.games });
});
await installMocks();
await sw.evaluate(async () => {
  globalThis.__notified = [];
  const orig = chrome.notifications.create;
  chrome.notifications.create = (id, opts) => {
    globalThis.__notified.push({ id, ...opts });
    return orig.call(chrome.notifications, id, opts);
  };
});
const popup2 = await context.newPage();
await popup2.goto(`chrome-extension://${extId}/src/popup/popup.html`);
await popup2.locator('#refresh').click();
await popup2.locator('#progress').waitFor({ state: 'visible', timeout: 5000 });
await popup2.locator('#progress').waitFor({ state: 'hidden', timeout: 30000 });
await popup2.locator('#status:not([hidden])').waitFor({ timeout: 5000 });
assert.match(await popup2.locator('#status').innerText(), /подешевело: 1/);
const notified = await sw.evaluate(() => globalThis.__notified);
assert.ok(notified.some((n) => n.id === 'deal:367520'), `уведомлений: ${JSON.stringify(notified)}`);
console.log('    уведомление:', notified.find((n) => n.id === 'deal:367520').title, '—', notified.find((n) => n.id === 'deal:367520').message, `(было 400 ₽, стало ${before} ₽)`);
step('уведомление, когда цена упала больше чем на 10%');
await popup2.close();

// --- 5. Настройки ----------------------------------------------------------------
const opts = await context.newPage();
await opts.setViewportSize({ width: 900, height: 1000 });
await opts.goto(`chrome-extension://${extId}/src/options/options.html#welcome`);
await opts.locator('input[name="showKeys"]').waitFor({ state: 'attached' });
await opts.waitForFunction(() => document.body.classList.contains('ready'));
await opts.screenshot({ path: path.join(shots, '6-options.png'), fullPage: true });
assert.equal(await opts.locator('input[name="showAccounts"]').isChecked(), true, 'аккаунты включены по умолчанию');

// Подсказка «?» появляется при наведении и не переключает тумблер
const tip = opts.locator('label.toggle.risky .tip');
await tip.scrollIntoViewIfNeeded();
await tip.hover();
await opts.waitForTimeout(250);
assert.equal(await opts.locator('label.toggle.risky .tip-bubble').isVisible(), true);
const tipBox = await opts.locator('label.toggle.risky').boundingBox();
await opts.screenshot({ path: path.join(shots, '6b-options-tooltip.png'), clip: { x: tipBox.x - 30, y: tipBox.y - 150, width: 640, height: 260 } });
await tip.click();
await opts.waitForTimeout(200);
assert.equal(await opts.locator('input[name="showAccounts"]').isChecked(), true, 'клик по «?» не должен переключать');
step('подсказка «?» показывается и не переключает настройку');

// Выпадающий список: стрелка с отступом от края
const pad = await opts.locator('#currencyMode').evaluate((el) => getComputedStyle(el).paddingRight);
assert.equal(pad, '40px');
step('у выпадающих списков своя стрелка с отступом');

// Своя ссылка на пополнение появляется только при выборе «Своя ссылка…»
assert.equal(await opts.locator('#topupUrl-field').isVisible(), false);
await opts.locator('#topupProvider').selectOption('custom');
await opts.locator('#topupUrl-field').waitFor();
await opts.locator('#topupUrl').fill('https://example.com/steam-topup');
await opts.locator('#topupUrl').blur();
await opts.waitForTimeout(300);
let s = await sw.evaluate(async () => (await chrome.storage.sync.get('settings')).settings);
assert.equal(s.topupProvider, 'custom');
assert.equal(s.topupUrl, 'https://example.com/steam-topup');
step('пополнение: выбор площадки или своя ссылка');

await opts.locator('label.toggle.risky').click();
await opts.waitForTimeout(300);
s = await sw.evaluate(async () => (await chrome.storage.sync.get('settings')).settings);
assert.equal(s.showAccounts, false);
step('настройки сохраняются (выключили аккаунты)');

// Аккаунты пропали со страницы игры, а кнопка пополнения ведёт на свою ссылку
const page3 = await openSteam({ cents: 249900, text: '2 499 ₽', currency: 'RUB' });
await page3.locator('.hero-price').waitFor({ timeout: 15000 });
assert.equal(await page3.locator('.tab', { hasText: 'Аккаунты' }).count(), 0);
await page3.locator('.tab', { hasText: 'Пополнение' }).click();
assert.equal(await page3.locator('.topup a.btn-ghost').getAttribute('href'), 'https://example.com/steam-topup');
step('без аккаунтов вкладки нет, «Найти пополнение» ведёт на свою ссылку');

await context.close();
console.log(`\n${ok} проверок прошло. Скриншоты: ${shots}`);
