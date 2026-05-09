import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { GaxiosError } from 'gaxios';
import { google } from 'googleapis';

dotenv.config();

const enabled = (process.env.GOOGLE_DRIVE_ENABLED || 'false') === 'true';
const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID || '';
const credentialsPath = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '';
const mode = process.env.QA_MODE || 'manual';

const files = [
  {
    path: path.resolve('reports/spreadsheet/summary.csv'),
    mimeType: 'text/csv',
    extension: 'csv'
  },
  {
    path: path.resolve('reports/markdown/summary.md'),
    mimeType: 'text/markdown',
    extension: 'md'
  }
];

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

if (!enabled) {
  console.log('Google Drive отключён: GOOGLE_DRIVE_ENABLED=false');
  process.exit(0);
}

if (!folderId) {
  throw new Error('Google Drive не настроен: укажите GOOGLE_DRIVE_FOLDER_ID в .env');
}

if (!credentialsPath || !fs.existsSync(credentialsPath)) {
  throw new Error('Google Drive не настроен: укажите путь GOOGLE_SERVICE_ACCOUNT_JSON к JSON service account');
}

const auth = new google.auth.GoogleAuth({
  keyFile: credentialsPath,
  scopes: ['https://www.googleapis.com/auth/drive.file']
});

const drive = google.drive({ version: 'v3', auth });
const stamp = timestamp();

for (const file of files) {
  if (!fs.existsSync(file.path)) {
    console.log(`Файл отчёта не найден, пропускаю: ${file.path}`);
    continue;
  }

  try {
    const response = await drive.files.create({
      requestBody: {
        name: `qa-report-${mode}-${stamp}.${file.extension}`,
        parents: [folderId]
      },
      media: {
        mimeType: file.mimeType,
        body: fs.createReadStream(file.path)
      },
      fields: 'id, name, webViewLink',
      supportsAllDrives: true
    });

    console.log(`Google Drive uploaded: ${response.data.name} ${response.data.webViewLink || response.data.id}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof GaxiosError && error.status === 403 && /storage quota/i.test(message)) {
      throw new Error(
        'Google Drive отклонил загрузку: service account не имеет собственного хранилища. ' +
        'Используйте папку внутри Shared drive / Общего диска или OAuth-доступ обычного Google-аккаунта.'
      );
    }
    throw error;
  }
}
