# Handoff: агент-тестировщик сайтов

Дата: 2026-05-17
Репозиторий: `C:\Users\user\Documents\GitHub\agent_test_site_QA`
VPS: `root@212.116.115.150`
Контейнер: `climat-simf-qa-agent`

## Текущее состояние

- Enterprise-прогон уже запущен. Пользователю не нужно запускать его вручную в Telegram.
- Lock-файл на VPS:
  ```json
  {
    "pid": 181,
    "depth": "enterprise",
    "startedAt": "2026-05-16T23:29:47.596Z"
  }
  ```
- Логи показывают:
  - `Enterprise run`
  - `Найдено URL: 1031`
  - `Running 69 tests using 2 workers`
- В свежем прогоне уже найден реальный сбой на главной странице: `500 Internal Server Error` и отменённые загрузки CSS/JS chunk-файлов.
- Telegram-бот отвечает, summary в Telegram отправлялся.
- Google Drive upload сейчас падает с `invalid_grant`: OAuth-токен истёк или отозван.

## Что сделано

- Добавлен новый режим глубины `enterprise`.
- Telegram-команды и кнопки теперь поддерживают `Enterprise`.
- Loop-скрипт теперь реально запускает `qa:run:enterprise`, а не откатывается к старым режимам.
- Enterprise-режим расширен:
  - до `1200` товаров;
  - до `350` категорий;
  - до `6 часов` бюджета deep-audit;
  - больше фильтров, сортировок, вложенных категорий и поисковых терминов.
- Исправлена модель отчётов: `skipped` больше не считается как `failed`.
- Добавлена `.dockerignore`, чтобы Docker build не тащил гигабайты `reports`, `test-results`, `storage`, видео и traces.
- Код закоммичен и запушен:
  - `38acff9 Add enterprise QA audit mode`
  - ветка `main`

## Проверки

- Локально:
  - targeted Playwright tests: passed
  - `tsc --noEmit`: passed
  - `npm run test:enterprise -- --list`: показывает `69 tests`
- В контейнере:
  - targeted tests: `24 passed`
- На VPS:
  - контейнер жив;
  - процесс `qa:run:enterprise` активен;
  - Playwright активен;
  - lock depth: `enterprise`.

## Важные замечания

- Не запускать новый прогон руками, пока текущий enterprise-run не завершится.
- Не делать `docker compose up -d` / пересоздание контейнера без успешного rebuild: Docker image всё ещё старый, контейнер сейчас hot-patched обновлёнными файлами.
- Попытки `docker compose build` и `docker commit` раньше обрывали SSH на этапе Docker export. `.dockerignore` уже исправляет огромный build-context, но сам rebuild нужно отдельно проверить завтра.
- Google Drive не починится сам: нужен новый OAuth refresh token через `qa:drive:auth` или ручная переавторизация.

## Что сделать утром

1. Проверить, завершился ли enterprise-run:
   ```bash
   ssh -i ~/.ssh/climat_simf_deploy root@212.116.115.150 "cat /root/climat-simf-qa-agent/storage/run.lock.json 2>/dev/null || true; docker logs --tail 120 climat-simf-qa-agent"
   ```
2. Если lock-файла нет, забрать итоговый отчёт и посмотреть summary.
3. Разобрать первые реальные падения:
   - `500 Internal Server Error` на главной;
   - отменённые загрузки `_next/static/chunks/*.css` и `*.js`.
4. Переавторизовать Google Drive upload.
5. Аккуратно проверить rebuild Docker image после `.dockerignore`.

## Быстрые команды

Статус контейнера:
```bash
ssh -i ~/.ssh/climat_simf_deploy root@212.116.115.150 "docker ps --filter name=climat-simf-qa-agent"
```

Свежие логи:
```bash
ssh -i ~/.ssh/climat_simf_deploy root@212.116.115.150 "docker logs --tail 160 climat-simf-qa-agent"
```

Процессы внутри контейнера:
```bash
ssh -i ~/.ssh/climat_simf_deploy root@212.116.115.150 "docker exec climat-simf-qa-agent ps -ef"
```

