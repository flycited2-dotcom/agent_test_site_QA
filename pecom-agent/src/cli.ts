/**
 * Проверка подключения и ручные запросы к ПЭК из консоли.
 *   npm run check                                   — профиль ЛК и список тарифов
 *   npm run cli -- track 780339690775               — статус груза
 *   npm run cli -- zone "Симферополь"                — зона/филиал адреса
 *   npm run cli -- offices "Симферополь" send        — ближайшие отделения
 *   npm run cli -- calc "Москва; Симферополь; 50; 60x40x30; 2; 15000"
 */
import { config } from './config';
import { pecApi } from './pec-api';
import {
  calculate,
  findOffices,
  formatCalc,
  formatOffices,
  formatTrack,
  formatZone,
  parseDimensions,
  parseNumber,
  parseVolume,
  resolveZone,
  track
} from './services';

const plain = (html: string) =>
  html.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

async function main(): Promise<void> {
  const [command = 'check', ...args] = process.argv.slice(2);
  switch (command) {
    case 'check': {
      console.log(`Логин: ${config.pec.login || '(не задан)'}; ключ: ${config.pec.apiKey ? config.pec.apiKey.slice(0, 4) + '…' : '(не задан)'}`);
      const profile = await pecApi.profileData();
      console.log('Профиль ЛК:', profile);
      const types = await pecApi.typesOfDelivery();
      console.log('Тарифы:', types.map((t) => `${t.type} — ${t.fullName}${t.contractIsRequired ? ' (нужен договор)' : ''}`).join('\n  '));
      console.log('OK: API ПЭК доступен');
      return;
    }
    case 'track':
      console.log(plain(formatTrack(await track(args, true))));
      return;
    case 'zone':
      console.log(plain(formatZone(await resolveZone(args.join(' ')))));
      return;
    case 'offices': {
      const operation = args[1] === 'receive' ? 'receive' : 'send';
      console.log(plain(formatOffices(args[0], await findOffices(args[0], operation), operation)));
      return;
    }
    case 'calc': {
      const [from, to, w, size, places, value] = args.join(' ').split(';').map((s) => s.trim());
      const dims = parseDimensions(size || '');
      const volume = dims ? null : parseVolume(size || '');
      const result = await calculate({
        from,
        to,
        cargo: { weightKg: parseNumber(w || '') || 1, places: parseNumber(places || '') || 1, ...(dims || {}), ...(volume || {}) },
        declaredValue: parseNumber(value || '') || 0
      });
      console.log(plain(await formatCalc(result)));
      return;
    }
    default:
      console.log('Команды: check | track КОД | zone АДРЕС | offices АДРЕС [send|receive] | calc "откуда; куда; вес; ДxШxВ; мест; стоимость"');
  }
}

main().catch((error) => {
  console.error('Ошибка:', (error as Error).message);
  process.exit(1);
});
