// @ts-check
import { send } from '../ui/format.js';

/** @typedef {import('../lib/types.js').Settings} Settings */

const form = /** @type {HTMLFormElement} */ (document.getElementById('form'));
const toast = /** @type {HTMLElement} */ (document.getElementById('toast'));
const minSoldOut = /** @type {HTMLOutputElement} */ (document.getElementById('minSold-out'));

const NUMBER_FIELDS = new Set(['minSold', 'topupCommissionPct', 'checkIntervalHours', 'dropThresholdPct', 'cacheMinutes']);

/** @type {number | undefined} */
let toastTimer;
/** @param {string} text */
function showToast(text) {
  toast.textContent = text;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 1600);
}

/**
 * @param {any} obj
 * @param {string} path  например "sources.plati"
 */
function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

/** @param {Settings} s */
function fill(s) {
  for (const el of Array.from(form.elements)) {
    const input = /** @type {HTMLInputElement} */ (el);
    if (!input.name) continue;
    const value = getPath(s, input.name);
    if (input.type === 'checkbox') input.checked = Boolean(value);
    else if (value !== undefined) input.value = String(value);
  }
  minSoldOut.textContent = String(s.minSold);
  syncTopupField();
  requestAnimationFrame(() => document.body.classList.add('ready'));
}

/** Поле «своя ссылка» видно только когда выбран вариант «Своя ссылка…». */
function syncTopupField() {
  const provider = /** @type {HTMLSelectElement} */ (form.elements.namedItem('topupProvider'));
  const field = document.getElementById('topupUrl-field');
  if (field && provider) field.hidden = provider.value !== 'custom';
}

/**
 * @param {HTMLInputElement} input
 * @returns {any}
 */
function patchFor(input) {
  /** @type {string | number | boolean} */
  let value = input.type === 'checkbox' ? input.checked : input.value;
  if (NUMBER_FIELDS.has(input.name)) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return null;
    value = n;
  }
  const [head, sub] = input.name.split('.');
  return sub ? { [head]: { [sub]: value } } : { [head]: value };
}

form.addEventListener('input', (e) => {
  const input = /** @type {HTMLInputElement} */ (e.target);
  if (input.name === 'minSold') minSoldOut.textContent = input.value;
});

form.addEventListener('change', async (e) => {
  const input = /** @type {HTMLInputElement} */ (e.target);
  if (!input.name) return;
  if (input.name === 'topupProvider') {
    syncTopupField();
    if (input.value === 'custom') document.getElementById('topupUrl')?.focus();
  }
  if (input.name === 'topupUrl' && input.value && !/^https?:\/\//i.test(input.value)) {
    showToast('Ссылка должна начинаться с https://');
    return;
  }
  const patch = patchFor(input);
  if (!patch) return;
  try {
    await send({ type: 'settings:save', patch });
    showToast('Сохранено');
  } catch (err) {
    showToast(`Ошибка: ${err}`);
  }
});

document.getElementById('clear-cache')?.addEventListener('click', async () => {
  const res = await send({ type: 'cache:clear' });
  showToast(`Сохранённые цены очищены (${res.removed})`);
});

// Клик по «?» внутри переключателя не должен его переключать.
document.querySelectorAll('.tip').forEach((tip) => {
  tip.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
});

if (location.hash === '#welcome') {
  const w = document.getElementById('welcome');
  if (w) w.hidden = false;
}

send({ type: 'settings:get' }).then(fill).catch((err) => showToast(`Ошибка: ${err}`));
