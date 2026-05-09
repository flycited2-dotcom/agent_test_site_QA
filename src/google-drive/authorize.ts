import fs from 'node:fs';
import dotenv from 'dotenv';
import { readOAuthClientConfigFile, createOAuthClient } from './oauth';

dotenv.config();

const envPath = '.env';
const clientPath = process.env.GOOGLE_OAUTH_CLIENT_JSON || '';
const input = process.env.GOOGLE_OAUTH_CODE || process.argv[2] || '';
const code = parseCode(input);

if (!clientPath) {
  throw new Error('Укажите GOOGLE_OAUTH_CLIENT_JSON в .env');
}

const oauth2Client = createOAuthClient(readOAuthClientConfigFile(clientPath));

function parseCode(value: string): string {
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return new URL(value).searchParams.get('code') || '';
  return value;
}

function saveRefreshToken(refreshToken: string): void {
  const current = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  const next = current
    .split(/\r?\n/)
    .filter(line => line && !line.startsWith('GOOGLE_OAUTH_REFRESH_TOKEN='))
    .concat(`GOOGLE_OAUTH_REFRESH_TOKEN=${refreshToken}`)
    .join('\n');

  fs.writeFileSync(envPath, `${next}\n`, 'utf8');
}

if (!code) {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/drive.file']
  });

  console.log('Откройте ссылку в браузере, разрешите доступ и скопируйте code из адресной строки:');
  console.log(url);
  console.log('');
  console.log('Затем выполните:');
  console.log('npm run qa:drive:auth -- "ВАШ_CODE_ИЛИ_ПОЛНЫЙ_LOCALHOST_URL"');
  process.exit(0);
}

const { tokens } = await oauth2Client.getToken(code);

if (!tokens.refresh_token) {
  throw new Error('Google не вернул refresh_token. Повторите авторизацию; для этого используется prompt=consent.');
}

saveRefreshToken(tokens.refresh_token);
console.log('GOOGLE_OAUTH_REFRESH_TOKEN сохранён в локальный .env');
