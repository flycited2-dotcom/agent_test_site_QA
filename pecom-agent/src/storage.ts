import fs from 'node:fs';
import path from 'node:path';
import { config } from './config';

function filePath(name: string): string {
  return path.join(config.storageDir, name);
}

export function readJson<T>(name: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(filePath(name), 'utf8')) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(name: string, value: unknown): void {
  fs.mkdirSync(config.storageDir, { recursive: true });
  const target = filePath(name);
  const tmp = `${target}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(tmp, target);
}

/** Подписки на изменения статуса: chatId → { код груза → последний известный статус } */
export type Subscriptions = Record<string, Record<string, string>>;

export function readSubscriptions(): Subscriptions {
  return readJson<Subscriptions>('subscriptions.json', {});
}

export function writeSubscriptions(value: Subscriptions): void {
  writeJson('subscriptions.json', value);
}
