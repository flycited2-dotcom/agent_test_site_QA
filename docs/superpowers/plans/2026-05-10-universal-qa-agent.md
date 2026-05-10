# Universal QA Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the current single-site QA runner into a universal QA agent with site profiles, grouped developer reports, Russian Telegram control commands, Google Drive uploads, and optional email delivery.

**Architecture:** Keep Playwright tests as the execution engine. Add a runtime config layer under `storage/runtime-config.json`, a developer issue aggregation layer under `reports/developer`, and a Telegram bot process that writes control state and can trigger runs. Existing summary/Drive/Telegram senders will use the new grouped report files.

**Tech Stack:** TypeScript, Playwright, Node fetch, Google Drive API, Docker Compose, SMTP via nodemailer.

---

### Task 1: Runtime Config And Site Profiles

**Files:**
- Create: `src/utils/runtime-config.ts`
- Modify: `src/utils/config.ts`
- Modify: `playwright.config.ts`
- Test: `tests/00-runtime-config.spec.ts`

- [ ] Add typed runtime config with `site.url`, `site.profile`, `site.depth`, `safeMode`, and notifications.
- [ ] Use runtime base URL in Playwright and tests while keeping `.env` fallback.
- [ ] Add profile values: `auto`, `landing`, `content`, `catalog`, `shop`.

### Task 2: Developer Issue Aggregation

**Files:**
- Create: `src/reporters/issue-store.ts`
- Modify: `src/reporters/build-summary.ts`
- Test: `tests/00-issue-store.spec.ts`

- [ ] Build deterministic issue fingerprint from site, file, title, normalized URL, and error type.
- [ ] Maintain `reports/developer/state/issues.json`.
- [ ] Write `QA_ACTIVE_ISSUES.md/csv` and `daily/YYYY-MM-DD/QA_DAILY_SUMMARY.md/csv`.
- [ ] Keep occurrence counters and first/last seen timestamps.

### Task 3: Telegram Bot Control Plane

**Files:**
- Create: `src/telegram/bot.ts`
- Create: `src/telegram/commands.ts`
- Modify: `package.json`
- Modify: `Dockerfile` or `scripts/agent-loop.sh`
- Test: `tests/00-telegram-commands.spec.ts`

- [ ] Add Russian commands: `/статус`, `/отчет`, `/отчёт`, `/запуск`, `/пауза`, `/продолжить`, `/перезапуск`, `/сайт`, `/профиль`, `/глубина`, `/помощь`.
- [ ] Restrict control to `TELEGRAM_CHAT_ID`.
- [ ] `/отчет` sends active and daily developer files.
- [ ] `/сайт URL` updates runtime config without code changes.

### Task 4: Notifications And Uploads

**Files:**
- Modify: `src/telegram/send-summary.ts`
- Modify: `src/google-drive/upload-report.ts`
- Create: `src/email/send-report.ts`
- Modify: `.env.example`, `README_RU.md`, `package.json`

- [ ] Send short Telegram notifications by default.
- [ ] Upload developer files to Google Drive grouped by site/date.
- [ ] Add optional SMTP email to `flycited2@gmail.com`.

### Task 5: Verification And Deployment

**Files:**
- Modify: `docker-compose.yml` if needed.
- [ ] Run TypeScript check.
- [ ] Run unit tests.
- [ ] Run report generation.
- [ ] Push to GitHub.
- [ ] Deploy to `/root/climat-simf-qa-agent` and verify container, Telegram, Drive.
