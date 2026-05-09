import dotenv from 'dotenv';
import { readOAuthClientConfigFile, createOAuthClient } from './oauth';

dotenv.config();

const clientPath = process.env.GOOGLE_OAUTH_CLIENT_JSON || '';
const code = process.env.GOOGLE_OAUTH_CODE || process.argv[2] || '';

if (!clientPath) {
  throw new Error('Укажите GOOGLE_OAUTH_CLIENT_JSON в .env');
}

const oauth2Client = createOAuthClient(readOAuthClientConfigFile(clientPath));

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
  console.log('npm run qa:drive:auth -- "ВАШ_CODE"');
  process.exit(0);
}

const { tokens } = await oauth2Client.getToken(code);

if (!tokens.refresh_token) {
  throw new Error('Google не вернул refresh_token. Повторите авторизацию; для этого используется prompt=consent.');
}

console.log('Добавьте эту строку в .env на сервере:');
console.log(`GOOGLE_OAUTH_REFRESH_TOKEN=${tokens.refresh_token}`);
