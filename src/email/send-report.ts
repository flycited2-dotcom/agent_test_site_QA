import fs from 'node:fs';
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';
import { readRuntimeConfig } from '../utils/runtime-config';
import { listReportFiles, todayIso } from '../reporters/report-files';

dotenv.config();

const enabled = (process.env.EMAIL_ENABLED || 'false') === 'true';
const host = process.env.EMAIL_SMTP_HOST || '';
const port = Number(process.env.EMAIL_SMTP_PORT || 587);
const secure = (process.env.EMAIL_SMTP_SECURE || 'false') === 'true';
const user = process.env.EMAIL_SMTP_USER || '';
const pass = process.env.EMAIL_SMTP_PASS || '';
const from = process.env.EMAIL_FROM || user;
const to = process.env.EMAIL_TO || 'flycited2@gmail.com';

if (!enabled) {
  console.log('Email отключён: EMAIL_ENABLED=false');
  process.exit(0);
}

if (!host || !user || !pass || !from || !to) {
  console.log('Email не настроен: заполните EMAIL_SMTP_HOST, EMAIL_SMTP_USER, EMAIL_SMTP_PASS, EMAIL_FROM, EMAIL_TO');
  process.exit(0);
}

const runtime = readRuntimeConfig();
const day = todayIso();
const files = listReportFiles(day);

if (!files.length) {
  console.log('Email отчёт не отправлен: файлы отчёта ещё не созданы.');
  process.exit(0);
}

const activeText = fs.existsSync('reports/developer/QA_ACTIVE_ISSUES.md')
  ? fs.readFileSync('reports/developer/QA_ACTIVE_ISSUES.md', 'utf8').slice(0, 1800)
  : 'Активный developer-отчёт ещё не создан.';

const transport = nodemailer.createTransport({
  host,
  port,
  secure,
  auth: { user, pass }
});

await transport.sendMail({
  from,
  to,
  subject: `QA отчёт ${runtime.site.url} за ${day}`,
  text: [
    `Сайт: ${runtime.site.url}`,
    `Профиль: ${runtime.site.profile}`,
    `Глубина: ${runtime.site.depth}`,
    '',
    activeText,
    '',
    'Полные файлы приложены к письму.'
  ].join('\n'),
  attachments: files.map(file => ({
    filename: file.name,
    path: file.path,
    contentType: file.mimeType
  }))
});

console.log(`Email отчёт отправлен: ${to}`);
