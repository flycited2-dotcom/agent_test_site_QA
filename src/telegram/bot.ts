import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import dotenv from 'dotenv';
import { parseCommand, helpText } from './commands';
import { readRuntimeConfig, writeRuntimeConfig, updateRuntimeSite } from '../utils/runtime-config';
import { listReportFiles, todayIso } from '../reporters/report-files';

dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN || '';
const chatId = process.env.TELEGRAM_CHAT_ID || '';
const controlPath = path.resolve('storage/control.json');
const offsetPath = path.resolve('storage/telegram-offset.txt');

if (!token || !chatId) {
  console.log('Telegram bot disabled: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is empty');
  process.exit(0);
}

function writeControl(value: Record<string, unknown>): void {
  fs.mkdirSync(path.dirname(controlPath), { recursive: true });
  fs.writeFileSync(controlPath, JSON.stringify(value, null, 2), 'utf8');
}

async function telegram(method: string, body: Record<string, unknown> | FormData): Promise<any> {
  const isForm = body instanceof FormData;
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: isForm ? undefined : { 'Content-Type': 'application/json' },
    body: isForm ? body : JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Telegram ${method} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function sendMessage(text: string): Promise<void> {
  await telegram('sendMessage', { chat_id: chatId, text });
}

async function sendDocument(filePath: string): Promise<void> {
  if (!fs.existsSync(filePath)) return;
  const data = new FormData();
  data.set('chat_id', chatId);
  data.set('document', new Blob([fs.readFileSync(filePath)]), path.basename(filePath));
  await telegram('sendDocument', data);
}

function runCommand(command: string, args: string[]): void {
  const child = spawn(command, args, { stdio: 'ignore', detached: true, shell: process.platform === 'win32' });
  child.unref();
}

async function handle(text: string): Promise<void> {
  const command = parseCommand(text);
  const runtime = readRuntimeConfig();

  if (command.type === 'status') {
    const activePath = path.resolve('reports/developer/QA_ACTIVE_ISSUES.md');
    const active = fs.existsSync(activePath) ? fs.readFileSync(activePath, 'utf8') : 'Активный отчёт ещё не создан.';
    await sendMessage(`Сайт: ${runtime.site.url}\nПрофиль: ${runtime.site.profile}\nГлубина: ${runtime.site.depth}\n\n${active.slice(0, 2500)}`);
    return;
  }

  if (command.type === 'report') {
    const files = listReportFiles(todayIso());
    for (const file of files) await sendDocument(file.path);
    await sendMessage(files.length ? 'Отчёты отправлены.' : 'Отчёты ещё не созданы. Запустите /запуск smoke.');
    return;
  }

  if (command.type === 'run') {
    runCommand('npm', ['run', `qa:run:${command.depth}`]);
    await sendMessage(`Запустил проверку: ${command.depth}`);
    return;
  }

  if (command.type === 'pause') {
    writeControl({ paused: true, updatedAt: new Date().toISOString() });
    await sendMessage('Расписание поставлено на паузу.');
    return;
  }

  if (command.type === 'resume') {
    writeControl({ paused: false, updatedAt: new Date().toISOString() });
    await sendMessage('Расписание продолжено.');
    return;
  }

  if (command.type === 'restart') {
    writeControl({ paused: false, restartedAt: new Date().toISOString() });
    runCommand('npm', ['run', `qa:run:${runtime.site.depth}`]);
    await sendMessage(`Перезапустил агента и запустил проверку: ${runtime.site.depth}`);
    return;
  }

  if (command.type === 'site') {
    const next = updateRuntimeSite(command.url);
    await sendMessage(`Сайт переключён: ${next.site.url}\nПрофиль: ${next.site.profile}`);
    return;
  }

  if (command.type === 'profile') {
    runtime.site.profile = command.profile;
    writeRuntimeConfig(runtime);
    await sendMessage(`Профиль установлен: ${command.profile}`);
    return;
  }

  if (command.type === 'depth') {
    runtime.site.depth = command.depth;
    writeRuntimeConfig(runtime);
    await sendMessage(`Глубина установлена: ${command.depth}`);
    return;
  }

  await sendMessage(helpText());
}

async function poll(): Promise<void> {
  let offset = fs.existsSync(offsetPath) ? Number(fs.readFileSync(offsetPath, 'utf8')) : 0;
  while (true) {
    try {
      const updates = await telegram('getUpdates', { timeout: 25, offset });
      for (const update of updates.result || []) {
        offset = update.update_id + 1;
        fs.mkdirSync(path.dirname(offsetPath), { recursive: true });
        fs.writeFileSync(offsetPath, String(offset), 'utf8');
        const message = update.message;
        if (!message || String(message.chat?.id) !== String(chatId) || !message.text) continue;
        await handle(message.text);
      }
    } catch (error) {
      console.log(`Telegram bot polling error: ${(error as Error).message}`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

await poll();
