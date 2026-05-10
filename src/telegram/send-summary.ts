import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { readIssueState } from '../reporters/issue-store';
import { readRuntimeConfig } from '../utils/runtime-config';
dotenv.config();

const enabled = (process.env.TELEGRAM_ENABLED || 'false') === 'true';
const token = process.env.TELEGRAM_BOT_TOKEN || '';
const chatId = process.env.TELEGRAM_CHAT_ID || '';
const summaryPath = path.resolve('reports/markdown/summary.md');

if (!enabled) {
  console.log('Telegram отключён: TELEGRAM_ENABLED=false');
  process.exit(0);
}
if (!token || !chatId) {
  console.log('Telegram не настроен: укажите TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID в .env');
  process.exit(0);
}
function buildMessage(): string {
  const runtime = readRuntimeConfig();
  const state = readIssueState();
  const active = state.issues.filter(issue => issue.site === runtime.site.url && issue.status !== 'resolved');
  const today = new Date().toISOString().slice(0, 10);
  const fresh = active.filter(issue => issue.firstSeen.startsWith(today));

  if (state.issues.length) {
    return [
      'QA проверка завершена.',
      `Сайт: ${runtime.site.url}`,
      `Профиль: ${runtime.site.profile}`,
      `Глубина: ${runtime.site.depth}`,
      `Активных проблем: ${active.length}`,
      `Новых сегодня: ${fresh.length}`,
      '',
      active.slice(0, 5).map(issue => `${issue.id}: ${issue.title}`).join('\n'),
      '',
      'Полные файлы: команда /отчет'
    ].filter(Boolean).join('\n');
  }

  const text = fs.existsSync(summaryPath) ? fs.readFileSync(summaryPath, 'utf8') : 'QA отчёт не найден.';
  return text.length > 3900
    ? `${text.slice(0, 3900)}\n\nОтчёт обрезан. Полная версия в reports/markdown/summary.md`
    : text;
}

const short = buildMessage();

async function sendTelegram(): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    return await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: short }),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

let lastError: unknown;
for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    const res = await sendTelegram();
    console.log(`Telegram status: ${res.status}`);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Telegram API не принял сообщение: ${res.status} ${body}`);
    }
    process.exit(0);
  } catch (error) {
    lastError = error;
    console.log(`Telegram attempt ${attempt} failed: ${(error as Error).message}`);
    if (attempt < 3) await new Promise(resolve => setTimeout(resolve, attempt * 5000));
  }
}

throw lastError;
