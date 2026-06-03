/**
 * Генератор входящих лидов — симулирует реальные каналы обращений:
 * 1. HTTP POST прямо на endpoint формы сайта
 * 2. Playwright (UI) — заполняет форму как живой посетитель
 * 3. Telegram webhook — отправляет поддельный update прямо в CRM webhook
 * 4. Email — отправляет письмо на CRM-ящик
 */

import * as https from 'https';
import * as http from 'http';
import * as nodemailer from 'nodemailer';
import { crm } from './config.js';

export interface LeadPayload {
  name: string;
  phone: string;
  email: string;
  comment: string;
  source?: string;
}

// ── 1. HTTP POST на endpoint формы сайта ─────────────────────────────────────

export async function sendLeadViaHttp(
  endpoint: string,
  payload: LeadPayload
): Promise<{ ok: boolean; status: number; body: string }> {
  return new Promise(resolve => {
    const data = new URLSearchParams({
      name:    payload.name,
      phone:   payload.phone,
      email:   payload.email,
      message: payload.comment,
      comment: payload.comment,
      source:  payload.source || 'QA Agent',
    }).toString();

    const url = new URL(endpoint);
    const lib = url.protocol === 'https:' ? https : http;

    const req = lib.request(
      {
        hostname: url.hostname,
        port:     url.port || (url.protocol === 'https:' ? 443 : 80),
        path:     url.pathname + url.search,
        method:   'POST',
        headers: {
          'Content-Type':   'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(data),
          'User-Agent':     'QA-Agent/1.0',
          'X-QA-Test':      '1',
        },
      },
      res => {
        let body = '';
        res.on('data', chunk => (body += chunk));
        res.on('end', () => resolve({ ok: res.statusCode! < 400, status: res.statusCode!, body }));
      }
    );

    req.on('error', err => resolve({ ok: false, status: 0, body: err.message }));
    req.setTimeout(15000, () => { req.destroy(); resolve({ ok: false, status: 0, body: 'timeout' }); });
    req.write(data);
    req.end();
  });
}

// JSON-вариант (REST API)
export async function sendLeadViaApi(
  endpoint: string,
  payload: LeadPayload,
  headers: Record<string, string> = {}
): Promise<{ ok: boolean; status: number; body: string }> {
  return new Promise(resolve => {
    const data = JSON.stringify({
      name:    payload.name,
      phone:   payload.phone,
      email:   payload.email,
      message: payload.comment,
      comment: payload.comment,
      source:  payload.source || 'QA Agent',
    });

    const url = new URL(endpoint);
    const lib = url.protocol === 'https:' ? https : http;

    const req = lib.request(
      {
        hostname: url.hostname,
        port:     url.port || (url.protocol === 'https:' ? 443 : 80),
        path:     url.pathname + url.search,
        method:   'POST',
        headers: {
          'Content-Type':   'application/json',
          'Content-Length': Buffer.byteLength(data),
          'User-Agent':     'QA-Agent/1.0',
          'X-QA-Test':      '1',
          ...headers,
        },
      },
      res => {
        let body = '';
        res.on('data', chunk => (body += chunk));
        res.on('end', () => resolve({ ok: res.statusCode! < 400, status: res.statusCode!, body }));
      }
    );

    req.on('error', err => resolve({ ok: false, status: 0, body: err.message }));
    req.setTimeout(15000, () => { req.destroy(); resolve({ ok: false, status: 0, body: 'timeout' }); });
    req.write(data);
    req.end();
  });
}

// ── 2. Telegram webhook — симуляция входящего сообщения ──────────────────────
// CRM принимает Telegram updates на свой webhook URL.
// Мы POST'им туда поддельный update так же, как это делает Telegram.

export interface TelegramWebhookConfig {
  webhookUrl: string;      // URL вашего CRM webhook (CRM_TELEGRAM_WEBHOOK_URL)
  secretToken?: string;    // X-Telegram-Bot-Api-Secret-Token если настроен
}

export async function sendLeadViaTelegramWebhook(
  config: TelegramWebhookConfig,
  payload: LeadPayload
): Promise<{ ok: boolean; status: number; body: string }> {
  const updateId = Math.floor(Math.random() * 900000000) + 100000000;
  const userId   = Math.floor(Math.random() * 900000000) + 100000000;

  const update = {
    update_id: updateId,
    message: {
      message_id: Math.floor(Math.random() * 99999) + 1,
      from: {
        id:         userId,
        is_bot:     false,
        first_name: payload.name.split(' ')[0] || 'QA',
        last_name:  payload.name.split(' ')[1] || 'Test',
        username:   'qa_agent_test',
        language_code: 'ru',
      },
      chat: {
        id:         userId,
        first_name: payload.name.split(' ')[0] || 'QA',
        type:       'private',
      },
      date: Math.floor(Date.now() / 1000),
      text: `Хочу заказать кондиционер.\nИмя: ${payload.name}\nТелефон: ${payload.phone}\nEmail: ${payload.email}\n${payload.comment}`,
    },
  };

  const data = JSON.stringify(update);
  const url  = new URL(config.webhookUrl);
  const lib  = url.protocol === 'https:' ? https : http;

  return new Promise(resolve => {
    const headers: Record<string, string | number> = {
      'Content-Type':   'application/json',
      'Content-Length': Buffer.byteLength(data),
      'User-Agent':     'TelegramBot (QA simulation)',
    };

    if (config.secretToken) {
      headers['X-Telegram-Bot-Api-Secret-Token'] = config.secretToken;
    }

    const req = lib.request(
      { hostname: url.hostname, port: url.port || (url.protocol === 'https:' ? 443 : 80), path: url.pathname, method: 'POST', headers },
      res => {
        let body = '';
        res.on('data', chunk => (body += chunk));
        res.on('end', () => resolve({ ok: res.statusCode! < 400, status: res.statusCode!, body }));
      }
    );

    req.on('error', err => resolve({ ok: false, status: 0, body: err.message }));
    req.setTimeout(15000, () => { req.destroy(); resolve({ ok: false, status: 0, body: 'timeout' }); });
    req.write(data);
    req.end();
  });
}

// ── 3. Email — отправляет письмо на CRM inbox ─────────────────────────────────

export interface EmailLeadConfig {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  fromEmail: string;
  toEmail: string;   // CRM inbox email
}

export async function sendLeadViaEmail(
  config: EmailLeadConfig,
  payload: LeadPayload
): Promise<{ ok: boolean; error?: string }> {
  try {
    const transporter = nodemailer.createTransport({
      host:   config.smtpHost,
      port:   config.smtpPort,
      secure: config.smtpPort === 465,
      auth:   { user: config.smtpUser, pass: config.smtpPass },
    });

    await transporter.sendMail({
      from:    `"QA Agent" <${config.fromEmail}>`,
      to:      config.toEmail,
      subject: `[QA] Новая заявка от ${payload.name}`,
      text: [
        `Имя: ${payload.name}`,
        `Телефон: ${payload.phone}`,
        `Email: ${payload.email}`,
        `Комментарий: ${payload.comment}`,
        `Источник: QA Agent (автоматический тест)`,
      ].join('\n'),
      html: `
        <h3>[QA] Новая заявка</h3>
        <p><b>Имя:</b> ${payload.name}</p>
        <p><b>Телефон:</b> ${payload.phone}</p>
        <p><b>Email:</b> ${payload.email}</p>
        <p><b>Комментарий:</b> ${payload.comment}</p>
        <hr><small>Автоматический тест QA Agent. Не обрабатывать.</small>
      `,
    });

    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: String(err) };
  }
}

// ── Хелпер: стандартный тестовый лид ─────────────────────────────────────────

export function makeTestLead(suffix: string | number = Date.now()): LeadPayload {
  return {
    name:    `${crm.prefix} Агент ${suffix}`,
    phone:   crm.testPhone,
    email:   crm.testEmail,
    comment: crm.testComment,
    source:  'QA Agent',
  };
}
