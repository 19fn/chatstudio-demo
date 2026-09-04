import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import appModule from '../../app.js';
import providerSettingsModule from '../../server/provider-settings.js';

const { createApp } = appModule;
const { decryptApiKey, encryptApiKey } = providerSettingsModule;
const encryptionKey = Buffer.alloc(32, 7).toString('base64');
const config = {
  ai: { endpoint: 'https://example.test', key: 'test-key', timeoutMs: 1000 },
  auth: { disabled: true, scope: 'access_as_user', adminRole: 'ChatStudio.Admin' },
  databaseUrl: 'postgres://test',
  maxUploadBytes: 1024,
  providerSettingsEncryptionKey: encryptionKey,
};

describe('provider settings', () => {
  it('encrypts and decrypts API keys without retaining plaintext ciphertext', () => {
    const encrypted = encryptApiKey('secret-api-key', encryptionKey);
    expect(encrypted).not.toContain('secret-api-key');
    expect(decryptApiKey(encrypted, encryptionKey)).toBe('secret-api-key');
  });

  it('saves validated settings without returning the API key', async () => {
    const repository = {
      save: vi.fn().mockResolvedValue({
        provider: 'azure-openai', endpoint: 'https://example.openai.azure.com', deploymentName: 'chat',
      }),
      get: vi.fn().mockResolvedValue(null),
    };
    const response = await request(createApp({ config, providerSettingsRepository: repository }))
      .put('/api/provider-settings')
      .send({
        provider: 'azure-openai', endpoint: 'https://example.openai.azure.com', apiKey: 'secret-api-key', deploymentName: 'chat',
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      settings: { provider: 'azure-openai', endpoint: 'https://example.openai.azure.com', deploymentName: 'chat' },
    });
    expect(JSON.stringify(response.body)).not.toContain('secret-api-key');
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({ objectId: 'local-user' }), expect.objectContaining({ apiKey: 'secret-api-key' }),
    );
  });
});