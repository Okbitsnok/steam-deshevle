// @ts-check
// Только описания типов (JSDoc). Кода здесь нет — файл нужен, чтобы tsc
// мог проверять остальные модули.

/**
 * @typedef {'plati' | 'ggsel'} SourceId
 *
 * Что именно продаётся в лоте:
 *  key     — ключ Steam, активируешь на своём аккаунте
 *  gift    — продавец покупает игру и дарит её на твой аккаунт
 *  account — чужой (общий/офлайн) аккаунт с игрой
 *  rental  — аренда аккаунта на время
 *  foreign — другая платформа (PlayStation, Epic и т.д.)
 *  other   — не смогли понять
 * @typedef {'key' | 'gift' | 'account' | 'rental' | 'foreign' | 'other'} Kind
 *
 * @typedef {{ RUB?: number, USD?: number, EUR?: number, UAH?: number }} PriceMap
 */

/**
 * Лот в том виде, в каком его отдаёт площадка (уже приведённый к общему формату).
 * @typedef {Object} RawOffer
 * @property {SourceId} source
 * @property {string} id
 * @property {string} title
 * @property {string} url
 * @property {PriceMap} price
 * @property {string} seller
 * @property {number} sold
 * @property {number | null} rating            0..5
 * @property {{ pos: number, neg: number } | null} reviews
 * @property {{ sectionId?: number, contentTypeId?: number, searchTitle?: string }} hint
 */

/**
 * Лот, готовый к показу.
 * @typedef {Object} Offer
 * @property {SourceId} source
 * @property {string} sourceName
 * @property {string} id
 * @property {string} title
 * @property {string} url
 * @property {Kind} kind
 * @property {string | null} region
 * @property {number} amount          цена в валюте показа
 * @property {number} rub             цена в рублях (для сравнения между играми)
 * @property {string} seller
 * @property {number} sold
 * @property {number | null} rating
 * @property {boolean} trusted
 * @property {number | null} savingsPct  на сколько % дешевле Steam (может быть отрицательным)
 */

/**
 * @typedef {Object} Money
 * @property {number} amount
 * @property {string} currency
 */

/**
 * @typedef {Object} GameInput
 * @property {number} appId
 * @property {string} title
 * @property {Money | null} steamPrice
 * @property {boolean} [isFree]
 */

/**
 * @typedef {'key' | 'gift' | 'account'} CategoryId
 *
 * @typedef {Object} CategoryView
 * @property {CategoryId} id
 * @property {string} title
 * @property {string} hint
 * @property {'low' | 'medium' | 'high'} risk
 * @property {Offer[]} offers
 * @property {Offer | null} best
 */

/**
 * @typedef {Object} SourceStatus
 * @property {SourceId} id
 * @property {string} name
 * @property {boolean} ok
 * @property {number} count
 * @property {string} [error]
 * @property {string} searchUrl
 */

/**
 * Всё, что нужно панели на странице игры.
 * @typedef {Object} OffersView
 * @property {number} appId
 * @property {string} query
 * @property {number} fetchedAt
 * @property {string} currency
 * @property {Money | null} steamPrice
 * @property {CategoryView[]} categories
 * @property {Offer | null} best
 * @property {{ amount: number, commissionPct: number, url: string } | null} topup
 * @property {SourceStatus[]} sources
 * @property {number} totalFound
 * @property {number} totalRelevant
 */

/**
 * @typedef {'ggsel' | 'plati' | 'custom'} TopupProvider
 *
 * @typedef {Object} Settings
 * @property {number} version
 * @property {{ plati: boolean, ggsel: boolean }} sources
 * @property {boolean} showKeys
 * @property {boolean} showGifts
 * @property {boolean} showAccounts
 * @property {number} minSold
 * @property {number} topupCommissionPct
 * @property {TopupProvider} topupProvider
 * @property {string} topupUrl              своя ссылка, если topupProvider === 'custom'
 * @property {'auto' | 'RUB'} currencyMode
 * @property {boolean} notifications
 * @property {number} checkIntervalHours
 * @property {number} dropThresholdPct
 * @property {number} cacheMinutes
 * @property {{ plati: string, ggsel: string }} affiliate
 * @property {boolean} panelCollapsed
 */

/**
 * Состояние игры из списка желаемого / отслеживаемых.
 * @typedef {Object} GameState
 * @property {number} appId
 * @property {string} name
 * @property {string | null} image
 * @property {Money | null} steamPrice
 * @property {Offer | null} best
 * @property {number | null} bestRub
 * @property {number | null} savingsPct
 * @property {number} checkedAt
 * @property {number | null} lastNotifiedRub
 * @property {string} [error]
 */

export {};
