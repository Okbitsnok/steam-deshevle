# Политика конфиденциальности «Дешевле»

*Обновлено: 9 ноября 2026*

«Дешевле» — расширение для браузера, которое показывает на странице игры в Steam цены на эту игру на площадках Plati и GGSel.

## Какие данные обрабатываются

| Данные | Зачем | Где хранятся |
|---|---|---|
| Название и цена игры со страницы Steam, которую ты открыл | Найти предложения на площадках | Не хранятся (только кэш результатов поиска) |
| Номера (ID) игр из списка желаемого Steam — только если ты уже вошёл в Steam в этом браузере | Следить за ценами и присылать уведомления о скидках | В твоём браузере (`chrome.storage.local`) |
| Игры, для которых ты нажал «Следить за ценой» | То же | В твоём браузере |
| Настройки расширения | Работа расширения | В твоём браузере (`chrome.storage.sync` — синхронизируется браузером между твоими устройствами, если синхронизация включена) |

## Чего расширение не делает

- Не читает и не передаёт пароли, почту, платёжные данные и другую информацию аккаунта Steam. На страницах входа, регистрации, аккаунта и оплаты Steam расширение не запускается.
- Не собирает историю браузера и не следит за другими сайтами.
- Не имеет своего сервера: разработчик не получает никаких данных.
- Не продаёт и не передаёт данные третьим лицам.
- Ничего не покупает от твоего имени.

## Куда отправляются запросы

- **store.steampowered.com** — открытые данные об игре (название, цена) и список желаемого (тот же запрос делает сам сайт Steam).
- **plati.io** и **api.ggsel.com** — поиск предложений по названию игры. Передаётся только название игры.
- **www.cbr-xml-daily.ru** — курсы валют ЦБ РФ для пересчёта цен.

Если в настройках указаны партнёрские ссылки, они применяются только к ссылкам на лоты, по которым ты сам переходишь.

## Как удалить данные

Удали расширение на странице `chrome://extensions` — все сохранённые им данные удалятся вместе с ним. Сохранённые цены можно очистить в настройках: «Для продвинутых» → «Очистить сохранённые цены».

## Контакты

Вопросы — через [Issues на GitHub](https://github.com/Okbitsnok/steam-deshevle/issues).

---

# Privacy Policy (English)

*Deshevle* is a browser extension that shows prices for the Steam game you are viewing on the Plati and GGSel marketplaces.

- **Data processed:** the title and price of the Steam game page you open; the IDs of games on your Steam wishlist (only if you are already signed in to Steam in this browser); games you chose to track; extension settings. All of it is stored locally in your browser.
- **Not collected:** passwords, email, payment details or any other Steam account information. The extension does not run on Steam sign-in, account or checkout pages. No browsing history is collected.
- **No server:** the extension has no backend; the developer receives no data. Data is never sold or shared.
- **Network requests:** store.steampowered.com (public game data, wishlist), plati.io and api.ggsel.com (search by game title only), www.cbr-xml-daily.ru (currency rates).
- **Deleting data:** removing the extension deletes all of its data.
- **Contact:** [GitHub Issues](https://github.com/Okbitsnok/steam-deshevle/issues).
