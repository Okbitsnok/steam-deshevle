// @ts-check

/**
 * Проверка «этот лот — про нашу игру?».
 *
 * Площадки ищут по словам, поэтому по запросу «Hollow Knight» приходят
 * и «Hollow Knight: Silksong», и «Hollow Knight + Cuphead». Здесь мы оставляем
 * только лоты, где название игры стоит целиком, а сразу после него идут
 * «служебные» слова (steam, ключ, ru, gift…) или ничего.
 */

/** Слова, которые продавцы пишут рядом с названием игры. */
const NOISE = new Set(
  [
    // платформа / тип товара
    'steam', 'стим', 'key', 'ключ', 'ключи', 'cd', 'gift', 'гифт', 'подарок', 'подарком',
    'account', 'аккаунт', 'акаунт', 'акк', 'offline', 'оффлайн', 'офлайн', 'online', 'онлайн',
    'activation', 'активация', 'лицензия', 'license', 'pc', 'пк', 'windows', 'win',
    // регионы
    'ru', 'рф', 'ру', 'россия', 'russia', 'снг', 'cis', 'global', 'глобал', 'мир', 'world',
    'region', 'регион', 'free', 'row', 'eu', 'europe', 'us', 'usa', 'kz', 'ua', 'cn', 'tr',
    'турция', 'казахстан', 'украина', 'все', 'страны', 'весь',
    // доставка
    'авто', 'auto', 'автодоставка', 'автовыдача', 'моментально', 'мгновенно', 'instant',
    'быстро', 'гарантия', 'warranty', 'скидка', 'акция', 'sale', 'new', 'новый',
    // издания
    'deluxe', 'edition', 'издание', 'ultimate', 'gold', 'goty', 'complete', 'definitive',
    'standard', 'стандартное', 'digital', 'цифровое', 'premium', 'collectors', 'enhanced',
    'полная', 'версия', 'full', 'version', 'all', 'dlc', 'dlcs', 'with', 'and', 'с', 'и', 'без',
    'комиссии', 'комиссий', 'официально', 'официальный', 'лучшая', 'цена',
  ]
);

/** Следующее слово-цифра/римская цифра = это сиквел, а не наша игра. */
const SEQUEL = /^(?:[0-9]{1,2}|ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii)$/;

/**
 * Приводит строку к виду «слова через пробел»: нижний регистр, без эмодзи и знаков.
 * @param {string} s
 * @returns {string}
 */
export function normalize(s) {
  return (s || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/['’`´]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9а-я]+/g, ' ')
    .replace(/^the /, '')
    .replace(/ the /g, ' ')
    .trim();
}

/**
 * Убирает из названия игры значки ™ ® © и лишние пробелы.
 * @param {string} title
 * @returns {string}
 */
export function cleanTitle(title) {
  return (title || '').replace(/[™®©]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * @param {string | undefined} next следующее слово после названия
 * @param {string} title нормализованное название
 */
function isOkNext(next, title) {
  if (!next) return true;
  if (SEQUEL.test(next) && !/\d$/.test(title)) return false;
  if (/^(19|20)\d\d$/.test(next)) return true; // год выпуска
  return NOISE.has(next);
}

/**
 * @param {string} offerName название лота
 * @param {string[]} titles варианты названия игры (из Steam, на английском и т.п.)
 * @returns {boolean}
 */
export function isRelevant(offerName, titles) {
  const name = ` ${normalize(offerName)} `;
  for (const raw of titles) {
    const title = normalize(raw);
    if (!title) continue;
    const needle = ` ${title} `;
    let idx = name.indexOf(needle);
    while (idx !== -1) {
      const rest = name.slice(idx + needle.length).trim();
      const next = rest ? rest.split(' ')[0] : undefined;
      if (isOkNext(next, title)) return true;
      idx = name.indexOf(needle, idx + 1);
    }
  }
  return false;
}

/**
 * Лот — это только DLC / саундтрек, а не сама игра?
 * «Игра + все DLC» при этом считается игрой.
 * @param {string} offerName
 * @param {string[]} titles
 * @returns {boolean}
 */
export function isAddonOnly(offerName, titles) {
  const low = offerName.toLowerCase();
  const titleHasAddon = titles.some((t) => /dlc|soundtrack|season pass/i.test(t));
  if (titleHasAddon) return false; // мы и так на странице DLC
  if (/(soundtrack|саундтрек|\bost\b|artbook|артбук|season pass|сезонный абонемент)/.test(low)) return true;
  if (/\bdlc\b/.test(low) && !/(\+\s*(все\s*|all\s*)?dlc|все dlc|all dlc|with dlc|с dlc|\+\s*dlc|и dlc)/.test(low)) {
    return true;
  }
  return false;
}
