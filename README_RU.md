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
reports/developer  активный мастер-отчёт, CSV и дневные срезы для разработчика
test-results       trace/video/screenshots ошибок
storage            найденные URL
```

## Telegram-команды агента

Команды пишутся боту на русском:

```text
/статус                         текущий сайт, профиль, глубина и активные проблемы
/отчет                          прислать текущий мастер-отчёт и дневные файлы
/запуск smoke|critical|full      запустить проверку прямо сейчас
/сайт https://example.com        переключить агента на другой сайт
/профиль авто|лендинг|сайт|каталог|магазин
/глубина smoke|critical|full     глубина по умолчанию
/пауза                           остановить плановые проверки
/продолжить                      вернуть плановые проверки
/перезапуск                      продолжить расписание и запустить проверку
/помощь                          список команд
```

После `/сайт ...` агент продолжает работать по тем же правилам: Telegram, Google Drive, email, дедупликация проблем и дневные отчёты сохраняются.

## Группировка developer-отчётов

Агент ведёт контрольные точки, чтобы не пересылать разработчику десятки сообщений:

```text
reports/developer/QA_ACTIVE_ISSUES.md       текущий мастер-файл активных проблем
reports/developer/QA_ACTIVE_ISSUES.csv      та же таблица для Google Sheets/Excel
reports/developer/daily/YYYY-MM-DD/         дневной срез новых/активных/решённых проблем
reports/developer/state/issues.json         техническое состояние дедупликации
```

В Google Drive файлы складываются в структуру:

```text
<папка из GOOGLE_DRIVE_FOLDER_ID>/<site>/active/
<папка из GOOGLE_DRIVE_FOLDER_ID>/<site>/daily/YYYY-MM-DD/
```

Для разработчика обычно достаточно отправить дневную папку `daily/YYYY-MM-DD` или файл `QA_ACTIVE_ISSUES.csv`.

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
2. Положить JSON на сервер в `secrets/google-oauth-client.json`. Эта папка монтируется в контейнер как `/app/secrets`.
3. В `.env` прописать:

```text
GOOGLE_DRIVE_ENABLED=true
GOOGLE_DRIVE_FOLDER_ID=1vK3PE6VHTx-_BM-0VU0NdO8kuDr9Cg95
GOOGLE_OAUTH_CLIENT_JSON=/app/secrets/google-oauth-client.json
```

4. Один раз выполнить авторизацию:

```bash
npm run qa:drive:auth
```

5. Открыть ссылку, разрешить доступ. Если браузер откроет `http://localhost/...` и страница не загрузится, это нормально: скопируйте весь URL из адресной строки или только параметр `code`.

```bash
npm run qa:drive:auth -- "ВАШ_CODE_ИЛИ_ПОЛНЫЙ_LOCALHOST_URL"
```

6. Команда сама сохранит `GOOGLE_OAUTH_REFRESH_TOKEN` в локальный `.env`.

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

## Email-отчёты

Email-канал опциональный. Для Gmail нужен пароль приложения, обычный пароль аккаунта Google не подойдёт.

```text
EMAIL_ENABLED=true
EMAIL_SMTP_HOST=smtp.gmail.com
EMAIL_SMTP_PORT=587
EMAIL_SMTP_SECURE=false
EMAIL_SMTP_USER=ваш_email@gmail.com
EMAIL_SMTP_PASS=пароль_приложения
EMAIL_FROM=ваш_email@gmail.com
EMAIL_TO=flycited2@gmail.com
```

Если `EMAIL_ENABLED=false`, агент просто пропускает отправку почты и продолжает Telegram/Drive.

## Важная логика безопасности

Агент по умолчанию не обязан нажимать финальную кнопку реальной оплаты. Для заявок используются тестовые данные с пометкой QA TEST. На боевом сайте желательно добавить в backend обработку тестовых заявок и автоархив.

## Следующий этап доработки

Этот архив — рабочая стартовая версия. После первого запуска нужно посмотреть отчёт, определить реальные селекторы сайта и добавить `data-testid` на важные элементы: каталог, карточка, цена, корзина, checkout, формы, Telegram, телефон, email.
