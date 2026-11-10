import { config } from './config';

export type InlineButton = { text: string; callback_data: string };
export type ReplyMarkup =
  | { inline_keyboard: InlineButton[][] }
  | { keyboard: Array<Array<{ text: string }>>; resize_keyboard?: boolean; is_persistent?: boolean }
  | { remove_keyboard: true };

export type TgUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number; type: string };
    from?: { id: number; first_name?: string; username?: string };
    text?: string;
  };
  callback_query?: {
    id: string;
    from: { id: number };
    message?: { message_id: number; chat: { id: number } };
    data?: string;
  };
};

export async function tg<T = unknown>(method: string, body: Record<string, unknown>, timeoutMs = 40000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${config.telegram.apiUrl}/bot${config.telegram.token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const data = (await response.json()) as { ok: boolean; result?: T; description?: string };
    if (!data.ok) throw new Error(`Telegram ${method}: ${data.description || response.status}`);
    return data.result as T;
  } finally {
    clearTimeout(timer);
  }
}

/** Делит длинный текст по строкам на куски ≤ 4000 символов (лимит Telegram — 4096) */
export function splitMessage(text: string, limit = 4000): string[] {
  if (text.length <= limit) return [text];
  const parts: string[] = [];
  let current = '';
  for (const line of text.split('\n')) {
    if ((current + '\n' + line).length > limit && current) {
      parts.push(current);
      current = line;
    } else {
      current = current ? `${current}\n${line}` : line;
    }
  }
  if (current) parts.push(current);
  return parts.flatMap((part) => (part.length > limit ? part.match(new RegExp(`[\\s\\S]{1,${limit}}`, 'g')) || [] : [part]));
}

export async function sendText(
  chatId: string | number,
  text: string,
  options: { html?: boolean; markup?: ReplyMarkup } = {}
): Promise<void> {
  const parts = splitMessage(text);
  for (let i = 0; i < parts.length; i += 1) {
    const body: Record<string, unknown> = {
      chat_id: chatId,
      text: parts[i],
      link_preview_options: { is_disabled: true }
    };
    if (options.html !== false) body.parse_mode = 'HTML';
    if (options.markup && i === parts.length - 1) body.reply_markup = options.markup;
    try {
      await tg('sendMessage', body);
    } catch (error) {
      // если HTML не разобрался — отправляем как обычный текст
      if (body.parse_mode) {
        delete body.parse_mode;
        body.text = parts[i]
          .replace(/<[^>]+>/g, '')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&amp;/g, '&');
        await tg('sendMessage', body);
      } else {
        throw error;
      }
    }
  }
}
