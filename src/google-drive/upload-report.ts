import fs from 'node:fs';
import dotenv from 'dotenv';
import { GaxiosError } from 'gaxios';
import { google } from 'googleapis';
import { createOAuthClient, readOAuthClientConfigFile } from './oauth';
import { readRuntimeConfig } from '../utils/runtime-config';
import { listReportFiles, siteSlug, todayIso, type ReportFile } from '../reporters/report-files';

dotenv.config();

const enabled = (process.env.GOOGLE_DRIVE_ENABLED || 'false') === 'true';
const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID || '';
const credentialsPath = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '';
const oauthClientPath = process.env.GOOGLE_OAUTH_CLIENT_JSON || '';
const oauthRefreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN || '';
const mode = process.env.QA_MODE || 'manual';

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function escapeQueryText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

if (!enabled) {
  console.log('Google Drive отключён: GOOGLE_DRIVE_ENABLED=false');
  process.exit(0);
}

if (!folderId) {
  throw new Error('Google Drive не настроен: укажите GOOGLE_DRIVE_FOLDER_ID в .env');
}

if (!oauthRefreshToken && (!credentialsPath || !fs.existsSync(credentialsPath))) {
  throw new Error('Google Drive не настроен: укажите GOOGLE_OAUTH_REFRESH_TOKEN или путь GOOGLE_SERVICE_ACCOUNT_JSON');
}

const auth = oauthRefreshToken
  ? createOAuthClient(readOAuthClientConfigFile(oauthClientPath))
  : new google.auth.GoogleAuth({
    keyFile: credentialsPath,
    scopes: ['https://www.googleapis.com/auth/drive.file']
  });

if ('setCredentials' in auth) {
  auth.setCredentials({ refresh_token: oauthRefreshToken });
}

const drive = google.drive({ version: 'v3', auth });
const stamp = timestamp();
const runtime = readRuntimeConfig();
const day = todayIso();
const files = listReportFiles(day);

async function ensureFolder(name: string, parentId: string): Promise<string> {
  const safeName = escapeQueryText(name);
  const safeParent = escapeQueryText(parentId);
  const existing = await drive.files.list({
    q: `name='${safeName}' and '${safeParent}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id, name)',
    spaces: 'drive',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true
  });

  const found = existing.data.files?.[0]?.id;
  if (found) return found;

  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId]
    },
    fields: 'id',
    supportsAllDrives: true
  });

  if (!created.data.id) throw new Error(`Google Drive не вернул id папки: ${name}`);
  return created.data.id;
}

function fileFolder(file: ReportFile, activeFolder: string, dailyFolder: string): string {
  return file.group === 'active' ? activeFolder : dailyFolder;
}

async function uploadFile(file: ReportFile, parentId: string): Promise<void> {
  const response = await drive.files.create({
    requestBody: {
      name: `${mode}-${stamp}-${file.name}`,
      parents: [parentId]
    },
    media: {
      mimeType: file.mimeType,
      body: fs.createReadStream(file.path)
    },
    fields: 'id, name, webViewLink',
    supportsAllDrives: true
  });

  console.log(`Google Drive uploaded: ${response.data.name} ${response.data.webViewLink || response.data.id}`);
}

if (!files.length) {
  console.log('Файлы отчёта не найдены, Google Drive загрузка пропущена.');
  process.exit(0);
}

try {
  const siteFolder = await ensureFolder(siteSlug(runtime.site.url), folderId);
  const activeFolder = await ensureFolder('active', siteFolder);
  const dailyRootFolder = await ensureFolder('daily', siteFolder);
  const dailyFolder = await ensureFolder(day, dailyRootFolder);

  for (const file of files) {
    await uploadFile(file, fileFolder(file, activeFolder, dailyFolder));
  }
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
