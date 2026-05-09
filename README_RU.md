# QA Agent для https://climat-simf.ru/

Готовый стартовый комплект автономного QA-агента для интернет-магазина climat-simf.ru.

## Что внутри

- Playwright E2E тесты.
- Docker Compose развёртывание.
- Автоматический цикл smoke/critical/full.
- Проверка главной, каталога, карточек, корзины, форм, ссылок, SEO и технических ошибок.
- Отчёты HTML/JSON/Markdown.
- Telegram-уведомления при включении в `.env`.

## Рекомендуемый сервер

Минимум: 2 CPU / 4 GB RAM / 50 GB SSD.
Лучше для полного обхода: 4 CPU / 8 GB RAM / 80 GB SSD.

## Быстрый запуск на VPS Ubuntu

1. Загрузить архив на сервер.
2. Распаковать.
3. Выполнить:

```bash
chmod +x install_vps.sh
./install_vps.sh
```

После этого агент сам установит Docker, соберёт контейнер и запустится в фоне.

## Команды управления

```bash
./start.sh          # запустить
./stop.sh           # остановить
./status.sh         # статус и логи
./run_once.sh smoke # разовый быстрый прогон
./run_once.sh critical # разовый критический прогон
./run_once.sh full  # полный прогон
```

## Где отчёты

```text
reports/html       HTML-отчёт Playwright
reports/json       JSON-результат
reports/markdown   краткое ТЗ/отчёт для разработчика
test-results       trace/video/screenshots ошибок
storage            найденные URL
```

## Настройки

Главный файл: `.env`. В репозитории хранится только безопасный шаблон `.env.example`; реальный `.env` с токенами создаётся на сервере и не коммитится.

```bash
cp .env.example .env
```

```text
BASE_URL=https://climat-simf.ru/
MAX_PRODUCTS_FULL=300
MAX_PRODUCTS_SMOKE=8
TELEGRAM_ENABLED=false
```

Чтобы включить Telegram, создать бота через BotFather и прописать:

```text
TELEGRAM_ENABLED=true
TELEGRAM_BOT_TOKEN=ваш_токен
TELEGRAM_CHAT_ID=ваш_chat_id
```

## Google Drive отчёты

Агент генерирует CSV-отчёт `reports/spreadsheet/summary.csv`, который открывается в Google Таблицах и Excel.

Для обычного личного "Мой диск" используйте OAuth:

1. Скачать OAuth client JSON из Google Cloud Console.
2. Положить JSON на сервер вне Git-репозитория, например `/home/qa-agent/google-oauth-client.json`.
3. В `.env` прописать:

```text
GOOGLE_DRIVE_ENABLED=true
GOOGLE_DRIVE_FOLDER_ID=1vK3PE6VHTx-_BM-0VU0NdO8kuDr9Cg95
GOOGLE_OAUTH_CLIENT_JSON=/home/qa-agent/google-oauth-client.json
```

4. Один раз выполнить авторизацию:

```bash
npm run qa:drive:auth
```

5. Открыть ссылку, разрешить доступ, скопировать `code` из адресной строки и выполнить:

```bash
npm run qa:drive:auth -- "ВАШ_CODE"
```

6. Добавить полученный `GOOGLE_OAUTH_REFRESH_TOKEN=...` в `.env`.

Вариант через service account возможен только для папки внутри Shared drive / Общего диска. Обычная папка в личном "Мой диск" может отклонить загрузку, потому что у service account нет собственного хранилища.

1. Создать Google service account и скачать JSON-ключ.
2. Расшарить папку Drive на `client_email` из JSON с правом редактора.
3. Положить JSON на сервер вне Git-репозитория, например `/home/qa-agent/google-service-account.json`.
4. В `.env` прописать:

```text
GOOGLE_DRIVE_ENABLED=true
GOOGLE_DRIVE_FOLDER_ID=1vK3PE6VHTx-_BM-0VU0NdO8kuDr9Cg95
GOOGLE_SERVICE_ACCOUNT_JSON=/home/qa-agent/google-service-account.json
```

## Важная логика безопасности

Агент по умолчанию не обязан нажимать финальную кнопку реальной оплаты. Для заявок используются тестовые данные с пометкой QA TEST. На боевом сайте желательно добавить в backend обработку тестовых заявок и автоархив.

## Следующий этап доработки

Этот архив — рабочая стартовая версия. После первого запуска нужно посмотреть отчёт, определить реальные селекторы сайта и добавить `data-testid` на важные элементы: каталог, карточка, цена, корзина, checkout, формы, Telegram, телефон, email.
