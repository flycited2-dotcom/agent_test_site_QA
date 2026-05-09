import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
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
const text = fs.existsSync(summaryPath) ? fs.readFileSync(summaryPath, 'utf8') : 'QA отчёт не найден.';
const short = text.length > 3900
  ? `${text.slice(0, 3900)}\n\nОтчёт обрезан. Полная версия в reports/markdown/summary.md`
  : text;
const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ chat_id: chatId, text: short })
});
console.log(`Telegram status: ${res.status}`);
if (!res.ok) {
  const body = await res.text().catch(() => '');
  throw new Error(`Telegram API не принял сообщение: ${res.status} ${body}`);
}
