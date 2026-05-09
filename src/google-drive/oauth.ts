import fs from 'node:fs';
import { google } from 'googleapis';

type RawOAuthConfig = {
  installed?: {
    client_id?: string;
    client_secret?: string;
    redirect_uris?: string[];
  };
  web?: {
    client_id?: string;
    client_secret?: string;
    redirect_uris?: string[];
  };
};

export type OAuthClientConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export function readOAuthClientConfig(raw: RawOAuthConfig): OAuthClientConfig {
  const client = raw.installed || raw.web;
  const clientId = client?.client_id;
  const clientSecret = client?.client_secret;
  const redirectUri = client?.redirect_uris?.[0];

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('OAuth client JSON должен содержать client_id, client_secret и redirect_uris');
  }

  return { clientId, clientSecret, redirectUri };
}

export function readOAuthClientConfigFile(filePath: string): OAuthClientConfig {
  return readOAuthClientConfig(JSON.parse(fs.readFileSync(filePath, 'utf8')) as RawOAuthConfig);
}

export function createOAuthClient(config: OAuthClientConfig) {
  return new google.auth.OAuth2(config.clientId, config.clientSecret, config.redirectUri);
}
