import { test, expect } from '@playwright/test';
import { readOAuthClientConfig } from '../src/google-drive/oauth';

test('reads installed OAuth client config', () => {
  const config = readOAuthClientConfig({
    installed: {
      client_id: 'client-id',
      client_secret: 'client-secret',
      redirect_uris: ['http://localhost']
    }
  });

  expect(config).toEqual({
    clientId: 'client-id',
    clientSecret: 'client-secret',
    redirectUri: 'http://localhost'
  });
});
