import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

function list(value: string | undefined): string[] {
  return (value || '')
    .split(/[,;\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function num(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const config = {
  pec: {
    login: process.env.PEC_LOGIN || '',
    apiKey: process.env.PEC_API_KEY || '',
    baseUrl: (process.env.PEC_API_URL || 'https://kabinet.pecom.ru/api/v1').replace(/\/+$/, ''),
    timeoutMs: num(process.env.PEC_TIMEOUT_MS, 30000),
    // Продукты/тарифы для расчёта: 3 — LTL Автоперевозка, 1 — Express Авиа, 12 — EasyWay (нужен договор)
    calcTypes: list(process.env.PEC_CALC_TYPES || '3,1').map(Number).filter((n) => Number.isInteger(n) && n > 0)
  },
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN || '',
    allowedChatIds: list(process.env.TELEGRAM_ALLOWED_CHAT_IDS),
    apiUrl: (process.env.TELEGRAM_API_URL || 'https://api.telegram.org').replace(/\/+$/, '')
  },
  ai: {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    model: process.env.ANTHROPIC_MODEL || 'claude-opus-5-5',
    effort: (process.env.ANTHROPIC_EFFORT || 'low') as 'low' | 'medium' | 'high' | 'xhigh' | 'max',
    maxHistoryMessages: num(process.env.AI_MAX_HISTORY_MESSAGES, 40)
  },
  watch: {
    intervalMinutes: num(process.env.WATCH_INTERVAL_MINUTES, 30)
  },
  storageDir: path.resolve(process.env.STORAGE_DIR || 'storage'),
  timezone: process.env.TIMEZONE || 'Europe/Moscow'
};

export function aiEnabled(): boolean {
  return Boolean(config.ai.apiKey || process.env.ANTHROPIC_AUTH_TOKEN);
}
