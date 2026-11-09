// Юнит-тесты логики: сопоставление названий, классификация лотов, итоговый расчёт.
// Запуск: node tests/unit.mjs  (нужен только Node 18+, без зависимостей)

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFileSync(path.join(here, 'fixtures', name), 'utf8');

// --- Подмена chrome.storage и сети ------------------------------------------
const memory = { local: {}, sync: {} };
const area = (store) => ({
  async get(keys) {
    if (keys === null || keys === undefined) return { ...store };
    const list = Array.isArray(keys) ? keys : [keys];
    return Object.fromEntries(list.filter((k) => k in store).map((k) => [k, store[k]]));
  },
  async set(items) {
    Object.assign(store, structuredClone(items));
  },
  async remove(keys) {
    for (const k of Array.isArray(keys) ? keys : [keys]) delete store[k];
  },
});
globalThis.chrome = { storage: { local: area(memory.local), sync: area(memory.sync) } };

let requests = [];
globalThis.__deshevleMockFetch = async (url, init) => {
  requests.push({ url: String(url), body: init?.body });
  const ok = (text) => ({ ok: true, status: 200, text: async () => text });
  if (String(url).includes('plati.io')) return ok(fixture('plati-detroit.json'));
  if (String(url).includes('api.ggsel.com')) return ok(fixture('ggsel-detroit.json'));
  if (String(url).includes('cbr-xml-daily')) {
    return ok(JSON.stringify({ Valute: { USD: { Nominal: 1, Value: 82 }, EUR: { Nominal: 1, Value: 92 }, KZT: { Nominal: 100, Value: 16 } } }));
  }
  return { ok: false, status: 404, text: async () => '' };
};

const { isRelevant, isAddonOnly, normalize } = await import('../src/lib/match.js');
const { classify, detectRegion } = await import('../src/lib/classify.js');
const { getOffersView } = await import('../src/lib/offers.js');
const { DEFAULT_SETTINGS, mergeSettings, topupUrlFor, TOPUP_URLS } = await import('../src/lib/config.js');

let passed = 0;
function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed++;
      console.log(`  ✓ ${name}`);
    })
    .catch((err) => {
      console.error(`  ✗ ${name}\n    ${err.message}`);
      process.exitCode = 1;
    });
}

console.log('match.js');
await test('normalize убирает эмодзи, знаки и «the»', () => {
  assert.equal(normalize('⭐️ The Witcher 3: Wild Hunt™'), 'witcher 3 wild hunt');
  assert.equal(normalize("Assassin's Creed® Ёлка"), 'assassins creed елка');
});
await test('сиквел и другие игры не считаются нашей игрой', () => {
  assert.equal(isRelevant('Hollow Knight: Silksong STEAM•RU', ['Hollow Knight']), false);
  assert.equal(isRelevant('Hollow Knight STEAM•RU АВТОВЫДАЧА', ['Hollow Knight']), true);
  assert.equal(isRelevant('Portal 2 Steam Key', ['Portal']), false);
  assert.equal(isRelevant('Portal 2 Steam Key', ['Portal 2']), true);
  assert.equal(isRelevant('DOOM Eternal Steam', ['DOOM']), false);
  assert.equal(isRelevant('Hades II Steam Gift', ['Hades']), false);
  assert.equal(isRelevant('Detroit: Become Human (2020)', ['Detroit: Become Human']), true);
  assert.equal(isRelevant('РФ+СНГ | DETROIT: BECOME HUMAN | STEAM КЛЮЧ', ['Detroit: Become Human']), true);
  assert.equal(isRelevant('The Wolf Among Us + Detroit: Become Human + Dispatch | Steam', ['Detroit: Become Human']), false);
});
await test('только DLC/саундтрек отсекается, «игра + все DLC» — нет', () => {
  assert.equal(isAddonOnly('Cyberpunk 2077 Soundtrack', ['Cyberpunk 2077']), true);
  assert.equal(isAddonOnly('Cyberpunk 2077 - DLC Phantom Liberty', ['Cyberpunk 2077']), true);
  assert.equal(isAddonOnly('Detroit: Become Human+Акаунт+ВСЕ DLC+Steam', ['Detroit: Become Human']), false);
  assert.equal(isAddonOnly('Detroit: Become Human +DLC Steam (GLOBAL)', ['Detroit: Become Human']), false);
});

console.log('classify.js');
const T = ['Detroit: Become Human'];
const raw = (title, hint = {}) => ({ source: 'plati', id: '1', title, url: '', price: { RUB: 1 }, seller: '', sold: 0, rating: null, reviews: null, hint });
await test('ключи', () => {
  assert.equal(classify(raw('Detroit: Become Human  / STEAM KEY / РФ+СНГ'), T), 'key');
  assert.equal(classify(raw('Detroit: Become Human 🔑 Steam 0% РФ+СНГ'), T), 'key');
  assert.equal(classify(raw('DETROIT BECOME HUMAN (STEAM/RU) КЛЮЧ + ПОДАРОК'), T), 'key');
  assert.equal(classify(raw('Detroit: Become Human Ключ - АВТО - РУ+СНГ', { contentTypeId: 2 }), T), 'key');
});
await test('гифты', () => {
  assert.equal(classify(raw('Detroit: Become Human STEAM GIFT 🚀АВТОДОСТАВКА💳0%'), T), 'gift');
  assert.equal(classify(raw('Detroit: Become Human МИР АВТО'), T), 'gift');
  assert.equal(classify(raw('✅Detroit: Become Human🎁Steam 🌐Выбор региона'), T), 'gift');
  assert.equal(classify(raw('Detroit: Become Human STEAM•RU АВТОВЫДАЧА', { contentTypeId: 48 }), T), 'gift');
  assert.equal(classify(raw('Игра подарком на ваш аккаунт Detroit: Become Human'), T), 'gift');
});
await test('аккаунты и аренда', () => {
  assert.equal(classify(raw('Detroit: Become Human (Steam Offline) + Обновления'), T), 'account');
  assert.equal(classify(raw('Detroit: Become Human+Акаунт+ВСЕ DLC+Steam🌎'), T), 'account');
  assert.equal(classify(raw('⭐️ Detroit: Become Human - STEAM (Region free)', { sectionId: 22764 }), T), 'account');
  assert.equal(classify(raw('Detroit: Become Human Steam (GLOBAL)', { contentTypeId: 31 }), T), 'account');
  assert.equal(classify(raw('Detroit: Become Human (Аренда Steam 7 дней)'), T), 'rental');
});
await test('другие платформы', () => {
  assert.equal(classify(raw('Detroit: Become Human (PS4/RUS) П3 Активация'), T), 'foreign');
  assert.equal(classify(raw('Detroit: Become Human [EPIC GAMES] RU/MULTI'), T), 'foreign');
  assert.equal(classify(raw('Detroit Become Human / П3 активация PS4'), T), 'foreign');
  assert.equal(classify(raw('Detroit: Become Human PS4 Турция', { searchTitle: 'услуги активации PlayStation' }), T), 'foreign');
  // слово из названия игры не должно сбивать платформу
  assert.equal(classify(raw('Epic Mickey Steam Key РФ'), ['Epic Mickey']), 'key');
});
await test('регион', () => {
  assert.equal(detectRegion('Detroit: Become Human Steam Ключ РФ+СНГ'), 'РФ+СНГ');
  assert.equal(detectRegion('Detroit: Become Human - АВТО - РУ+МИР'), 'РФ + мир');
  assert.equal(detectRegion('Detroit: Become Human Steam Key GLOBAL'), 'Весь мир');
  assert.equal(detectRegion('Detroit: Become Human | ПОДАРОК STEAM CN'), 'Китай');
  assert.equal(detectRegion('Detroit: Become Human'), null);
});

console.log('offers.js (на реальных данных Plati и GGSel)');
const settings = mergeSettings({});
await test('рубли: лучший ключ 399 ₽, аккаунты в своей вкладке, PS/Epic/аренда отфильтрованы', async () => {
  requests = [];
  const view = await getOffersView(
    { appId: 1222140, title: 'Detroit: Become Human', steamPrice: { amount: 2499, currency: 'RUB' } },
    settings,
    { force: true }
  );
  assert.equal(view.currency, 'RUB');
  assert.deepEqual(view.categories.map((c) => c.id), ['key', 'gift', 'account']);
  assert.ok(view.categories.find((c) => c.id === 'account').offers.length >= 3);
  const all = view.categories.flatMap((c) => c.offers);
  assert.ok(all.length > 10, `найдено ${all.length}`);
  assert.ok(!all.some((o) => /ps4|ps5|epic|аренд|vk play|п3/i.test(o.title)), 'чужие платформы просочились');
  assert.equal(view.best?.kind, 'key', 'аккаунт не может быть «лучшей ценой», даже если он дешевле');
  assert.ok(!all.some((o) => /wolf among us|beyond/i.test(o.title)), 'чужие игры просочились');
  assert.equal(view.best?.amount, 399);
  assert.equal(view.best?.kind, 'key');
  assert.equal(view.best?.seller, 'SOFT-KLUB'); // при равной цене — у кого больше продаж
  assert.equal(view.best?.savingsPct, 84);
  const gift = view.categories.find((c) => c.id === 'gift');
  assert.equal(gift.best.amount, 1699);
  assert.equal(Math.round(view.topup.amount), Math.round(2499 * 1.08));
  const happy = all.find((o) => o.seller === 'Happy Games');
  assert.equal(happy?.trusted, false, 'лот с 6 продажами не должен быть проверенным');
  assert.equal(view.sources.length, 2);
  assert.ok(view.sources.every((s) => s.ok));
  // GGSel получил правильный запрос
  const gg = requests.find((r) => r.url.includes('ggsel'));
  assert.equal(JSON.parse(gg.body).search_term, 'Detroit: Become Human');
});
await test('евро: цены берутся в EUR, экономия считается от 39,99 €', async () => {
  const view = await getOffersView(
    { appId: 1222140, title: 'Detroit: Become Human', steamPrice: { amount: 39.99, currency: 'EUR' } },
    settings
  );
  assert.equal(view.currency, 'EUR');
  assert.equal(view.best?.amount, 4.08);
  assert.equal(view.best?.savingsPct, 90);
});
await test('тенге: конвертация через курс ЦБ', async () => {
  const view = await getOffersView(
    { appId: 1222140, title: 'Detroit: Become Human', steamPrice: { amount: 9990, currency: 'KZT' } },
    settings
  );
  assert.equal(view.currency, 'KZT');
  // 399 ₽ / (16/100 ₽ за тенге) = 2493.75 ₸
  assert.equal(Math.round(view.best?.amount), 2494);
});
await test('аккаунты появляются, если включить их в настройках', async () => {
  const view = await getOffersView(
    { appId: 1222140, title: 'Detroit: Become Human', steamPrice: null },
    mergeSettings({ showAccounts: true })
  );
  const acc = view.categories.find((c) => c.id === 'account');
  assert.ok(acc && acc.offers.length >= 3);
  assert.equal(view.topup, null, 'без цены Steam пополнение не считаем');
  assert.ok(view.best && view.best.kind !== 'account', 'аккаунт не может быть «лучшей ценой»');
});
await test('партнёрский шаблон подставляется в ссылку', async () => {
  const view = await getOffersView(
    { appId: 1222140, title: 'Detroit: Become Human', steamPrice: null },
    mergeSettings({ affiliate: { plati: 'https://plati.market/itm/{id}?ai=777', ggsel: '' } })
  );
  const p = view.categories.flatMap((c) => c.offers).find((o) => o.source === 'plati');
  assert.match(p.url, /\?ai=777$/);
});
await test('ошибка одной площадки не ломает вторую', async () => {
  const orig = globalThis.__deshevleMockFetch;
  globalThis.__deshevleMockFetch = async (url, init) =>
    String(url).includes('api.ggsel.com') ? { ok: false, status: 503, text: async () => '' } : orig(url, init);
  const view = await getOffersView(
    { appId: 1222140, title: 'Detroit: Become Human', steamPrice: { amount: 2499, currency: 'RUB' } },
    settings,
    { force: true }
  );
  globalThis.__deshevleMockFetch = orig;
  const gg = view.sources.find((s) => s.id === 'ggsel');
  assert.equal(gg.ok, false);
  assert.match(gg.error, /503/);
  assert.equal(view.best?.amount, 399);
});

console.log('config.js');
await test('по умолчанию аккаунты показываются, пополнение ищется на GGSel', () => {
  assert.equal(DEFAULT_SETTINGS.showAccounts, true);
  assert.equal(topupUrlFor(mergeSettings({})), TOPUP_URLS.ggsel);
});
await test('аккаунты можно скрыть в настройках', async () => {
  const view = await getOffersView(
    { appId: 1222140, title: 'Detroit: Become Human', steamPrice: { amount: 2499, currency: 'RUB' } },
    mergeSettings({ version: 2, showAccounts: false })
  );
  assert.deepEqual(view.categories.map((c) => c.id), ['key', 'gift']);
});
await test('старые настройки (v1) обновляются: аккаунты включаются, ссылка превращается в выбор площадки', () => {
  const v1 = mergeSettings({ showAccounts: false, topupUrl: 'https://ggsel.net/search/%D0%BF%D0%BE', minSold: 50 });
  assert.equal(v1.showAccounts, true);
  assert.equal(v1.topupProvider, 'ggsel');
  assert.equal(v1.minSold, 50, 'остальные настройки сохраняются');
  assert.equal(v1.version, 2);
  const v1custom = mergeSettings({ topupUrl: 'https://my-topup.example/steam' });
  assert.equal(v1custom.topupProvider, 'custom');
  assert.equal(topupUrlFor(v1custom), 'https://my-topup.example/steam');
});
await test('если в v2 аккаунты выключили — они остаются выключенными', () => {
  const v2 = mergeSettings({ version: 2, showAccounts: false });
  assert.equal(v2.showAccounts, false);
});
await test('своя ссылка без https не используется', () => {
  assert.equal(topupUrlFor(mergeSettings({ version: 2, topupProvider: 'custom', topupUrl: 'javascript:alert(1)' })), TOPUP_URLS.ggsel);
  assert.equal(topupUrlFor(mergeSettings({ version: 2, topupProvider: 'plati' })), TOPUP_URLS.plati);
});
console.log(`\n${passed} тестов прошло${process.exitCode ? ', есть ошибки' : ''}`);
