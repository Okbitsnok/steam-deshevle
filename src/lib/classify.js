// @ts-check
import { normalize } from './match.js';

/** @typedef {import('./types.js').Kind} Kind */
/** @typedef {import('./types.js').RawOffer} RawOffer */

// В JS-регулярках \b не работает с кириллицей, поэтому границы слов задаём сами.
const L = '[a-zа-я0-9]';
/** @param {string} body */
const word = (body) => new RegExp(`(?<!${L})(?:${body})(?!${L})`);

const FOREIGN = word(
  'ps ?[345]|playstation|psn|xbox|epic|egs|nintendo|switch|vk ?play|gog|origin|ea app|uplay|ubisoft|battle ?net|rockstar|microsoft store|п[123]'
);
const RENTAL = /аренд|(?<![a-z])rent(?:al)?(?![a-z])/;
const ACCOUNT = word(
  'аккаунт[a-zа-я]*|акаунт[a-zа-я]*|акк|account|offline|оффлайн[a-zа-я]*|офлайн[a-zа-я]*|общий|shared|guard|гуард|login|логин|access'
);
const KEY = word('ключ[a-zа-я]*|key|cd ?key|activation code|код активации');
const GIFT = word(
  'gift|гифт|подар[a-zа-я]*|автодоставк[a-zа-я]*|автовыдач[a-zа-я]*|авто|auto|выбор региона|на (?:ваш|твой|свой) аккаунт'
);

/**
 * Определяет, что продаётся в лоте.
 *
 * Сначала смотрим подсказки площадки (раздел / тип контента),
 * потом — слова в названии. Название игры из строки предварительно убираем,
 * чтобы игра «Epic Mickey» не считалась товаром для Epic Games.
 *
 * @param {RawOffer} offer
 * @param {string[]} titles
 * @returns {Kind}
 */
export function classify(offer, titles) {
  // «+ ПОДАРОК» в конце — это бонус от продавца, а не способ доставки.
  const withoutBonus = offer.title.replace(/\+\s*(?:бонус\s*)?подар[а-яё]*/gi, ' ');
  let low = ` ${normalize(withoutBonus)} `;
  for (const t of titles) {
    const nt = normalize(t);
    if (nt) low = low.split(` ${nt} `).join(' ');
  }
  // «на ваш аккаунт» — это про гифт, а не про продажу аккаунта.
  const giftToYou = /на (ваш|твой|свой) аккаунт/.test(low);
  const lowNoGiftPhrase = low.replace(/на (ваш|твой|свой) аккаунт/g, ' ');

  const { contentTypeId, searchTitle, sectionId } = offer.hint || {};
  const st = (searchTitle || '').toLowerCase();

  // 1. Другая платформа
  if (/playstation|xbox|epic games|nintendo|vk play|gog/.test(st)) return 'foreign';
  if (FOREIGN.test(lowNoGiftPhrase)) return 'foreign';

  // 2. Аренда
  if (contentTypeId === 25 || RENTAL.test(low)) return 'rental';

  // 3. Аккаунты
  if (contentTypeId === 31 || (contentTypeId === 1 && st.includes('аккаунт'))) return 'account';
  if (!giftToYou && ACCOUNT.test(lowNoGiftPhrase)) return 'account';

  // 4. Ключ
  if (KEY.test(low) || offer.title.includes('🔑')) return 'key';
  if (contentTypeId === 2) return GIFT.test(low) ? 'gift' : 'key';

  // 5. Гифт / покупка на аккаунт покупателя
  if (contentTypeId === 48 || giftToYou || GIFT.test(low)) return 'gift';

  // 6. Подсказки разделов Plati
  if (sectionId === 22764) return 'account'; // Plati: «Steam аккаунты»
  if (sectionId === 22380) return 'foreign'; // Plati: консоли
  // Plati: раздел ключей/гифтов Steam. Гифты почти всегда подписаны («gift», «авто»),
  // поэтому лот без пометок считаем ключом.
  if (sectionId === 20887) return 'key';

  return 'other';
}

/**
 * Достаёт из названия лота регион активации.
 * @param {string} title
 * @returns {string | null}
 */
export function detectRegion(title) {
  const low = ` ${normalize(title)} `;
  const has = (/** @type {string} */ body) => word(body).test(low);
  const ru = has('рф|россия|ru|ру|снг|cis|russia');
  const world = has('global|глобал|region free|весь мир|мир|world|все страны|row');
  if (ru && world) return 'РФ + мир';
  if (world) return 'Весь мир';
  if (has('cn|китай|china')) return 'Китай';
  if (has('турция|turkey|tr')) return 'Турция';
  if (has('kz|казахстан')) return 'Казахстан';
  if (has('ua|укр|украина')) return 'Украина';
  if (ru) return 'РФ+СНГ';
  return null;
}
