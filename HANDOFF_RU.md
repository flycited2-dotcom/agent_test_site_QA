# Handoff: агент-тестировщик сайтов

Дата обновления: 2026-05-17
Репозиторий: `C:\Users\user\Documents\GitHub\agent_test_site_QA`
VPS: `root@212.116.115.150`
Контейнер: `climat-simf-qa-agent`
Ветка: `main`

## Текущее состояние

- Контейнер жив и запущен из нового образа:
  - image: `climat-simf-qa-agent-qa-agent`
  - command: `bash scripts/start-agent.sh`
- Агент стоит на паузе:
  ```json
  {"paused":true,"reason":"manual pause to restore telegram bot","updatedAt":"2026-05-17T00:00:00.000Z"}
  ```
- QA-прогон сейчас не идёт:
  - `storage/run.lock.json` отсутствует;
  - процессов `qa:run`, `playwright`, `ffmpeg` нет.
- Работают только:
  - `qa:bot`;
  - `agent-loop`.
- Последний контрольный smoke прошёл успешно:
  - `6 passed`;
  - `0` ошибок;
  - summary отправлен в Telegram.
- Telegram восстановлен:
  - `fetch('https://api.telegram.org')` внутри контейнера: `OK 200`;
  - тестовое сообщение ушло: `SEND 200`;
  - штатная отправка: `Telegram status: 200`.
- Google Drive восстановлен:
  - OAuth refresh token обновлён;
  - `npm run qa:drive` успешно загрузил отчёты в Drive.

## Что было причиной сбоев

- Тяжёлый `enterprise`-прогон перегрузил VPS: Playwright, retries и видео на падениях создавали лишнюю нагрузку.
- После этого Telegram-бот был жив, но не мог достучаться до Telegram API.
- DNS отдавал `api.telegram.org -> 149.154.166.110`, а этот IP с VPS таймаутился.
- Рабочий IP Telegram API для этого VPS: `149.154.167.220`.
- Google Drive отдельно падал из-за `invalid_grant`: старый OAuth refresh token истёк или был отозван.

## Что сделано

- Добавлен режим `enterprise`.
- Исправлено переключение режимов из Telegram.
- Enterprise теперь запускается бережнее для VPS:
  - `PLAYWRIGHT_WORKERS=1`;
  - `PLAYWRIGHT_VIDEO=off`;
  - `PLAYWRIGHT_RETRIES=0`.
- Добавлен `scripts/start-agent.sh`: бот теперь запускается под простым supervisor-циклом.
- В `docker-compose.yml` закреплён рабочий Telegram API host:
  ```yaml
  extra_hosts:
    - "api.telegram.org:149.154.167.220"
  ```
- Добавлена `.dockerignore`; Docker build context уменьшился до десятков KB вместо гигабайтов.
- Docker image успешно пересобран.
- Контейнер пересоздан и запущен из нового образа.
- OAuth Google Drive переавторизован, новый refresh token записан в серверный `.env`.
- Старые секреты не коммитились.

## Коммиты

- `38acff9 Add enterprise QA audit mode`
- `d2fa68d Add QA agent handoff`
- `a4459e6 Stabilize QA bot during enterprise runs`
- `d35d915 Pin Telegram API host for QA bot`

## Проверки

- Локально:
  - `npx tsc --noEmit`: passed;
  - targeted Playwright tests: `27 passed`;
  - `npm run test:enterprise -- --list`: `69 tests`.
- На VPS:
  - Docker build: passed;
  - container: up;
  - Telegram fetch: `OK 200`;
  - `npm run qa:telegram`: `Telegram status: 200`;
  - `npm run qa:drive`: files uploaded to Google Drive;
  - smoke run: `6 passed`.

## Что делать дальше

1. Не запускать сразу `enterprise`.
2. Сначала вручную запустить `critical`.
3. Если `critical` проходит и отчёты уходят в Telegram/Drive, запускать `enterprise` только контролируемо, лучше на ночь.
4. После любого тяжёлого прогона проверить:
   - `storage/run.lock.json`;
   - `docker logs --tail 120 climat-simf-qa-agent`;
   - Telegram summary;
   - Drive uploads.

## Быстрые команды

Статус:
```bash
ssh -i ~/.ssh/climat_simf_deploy root@212.116.115.150 "cd /root/climat-simf-qa-agent && docker ps --filter name=climat-simf-qa-agent && cat storage/control.json 2>/dev/null || true && cat storage/run.lock.json 2>/dev/null || true"
```

Логи:
```bash
ssh -i ~/.ssh/climat_simf_deploy root@212.116.115.150 "docker logs --tail 160 climat-simf-qa-agent"
```

Процессы:
```bash
ssh -i ~/.ssh/climat_simf_deploy root@212.116.115.150 "docker exec climat-simf-qa-agent ps -ef"
```

Ручной smoke:
```bash
ssh -i ~/.ssh/climat_simf_deploy root@212.116.115.150 "cd /root/climat-simf-qa-agent && docker exec climat-simf-qa-agent npm run qa:run:smoke"
```

Ручной critical:
```bash
ssh -i ~/.ssh/climat_simf_deploy root@212.116.115.150 "cd /root/climat-simf-qa-agent && docker exec climat-simf-qa-agent npm run qa:run:critical"
```
