import { normalizeDepth, normalizeProfile, type SiteProfile, type TestDepth } from '../utils/runtime-config';

export type BotCommand =
  | { type: 'status' }
  | { type: 'report' }
  | { type: 'run'; depth: TestDepth }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'restart' }
  | { type: 'site'; url: string }
  | { type: 'profile'; profile: SiteProfile }
  | { type: 'depth'; depth: TestDepth }
  | { type: 'menu' }
  | { type: 'help' }
  | { type: 'unknown'; text: string };

const profileAliases: Record<string, SiteProfile> = {
  auto: 'auto',
  авто: 'auto',
  landing: 'landing',
  лендинг: 'landing',
  content: 'content',
  сайт: 'content',
  catalog: 'catalog',
  каталог: 'catalog',
  shop: 'shop',
  магазин: 'shop'
};

export function parseCommand(text: string): BotCommand {
  const [rawCommand, ...rest] = text.trim().split(/\s+/);
  const command = rawCommand?.toLowerCase();
  const arg = rest.join(' ').trim();

  if (command === '/меню' || command === '/start' || command === '/star') return { type: 'menu' };
  if (command === '/статус' || command === '/сводка') return { type: 'status' };
  if (command === '/отчет' || command === '/отчёт') return { type: 'report' };
  if (command === '/пауза' || command === '/стоп') return { type: 'pause' };
  if (command === '/продолжить' || command === '/старт') return { type: 'resume' };
  if (command === '/перезапуск') return { type: 'restart' };
  if (command === '/помощь' || command === '/help') return { type: 'help' };

  if (command === '/запуск') return { type: 'run', depth: normalizeDepth(arg || 'smoke') };
  if (command === '/глубина' || command === '/режим') return { type: 'depth', depth: normalizeDepth(arg) };
  if (command === '/профиль') return { type: 'profile', profile: profileAliases[arg.toLowerCase()] || normalizeProfile(arg) };
  if (command === '/сайт') return { type: 'site', url: arg };

  return { type: 'unknown', text };
}

export function helpText(): string {
  return [
    'Команды QA Agent:',
    '/меню — открыть кнопки управления',
    '/статус — текущий сайт, профиль, активные проблемы',
    '/отчет — прислать developer-отчёты',
    '/запуск smoke|critical|full — запустить проверку',
    '/сайт https://example.com — переключить сайт',
    '/профиль авто|лендинг|сайт|каталог|магазин — выбрать профиль',
    '/глубина smoke|critical|full — режим расписания',
    '/режим smoke|critical|full — то же самое',
    '/пауза — остановить расписание',
    '/продолжить — продолжить расписание',
    '/перезапуск — продолжить расписание и запустить проверку по текущей глубине',
    '/помощь — список команд'
  ].join('\n');
}
