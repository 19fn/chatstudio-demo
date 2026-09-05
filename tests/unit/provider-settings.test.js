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
        provider: 'azure-openai', endpoint: 'https://example.openai.azure.com', apiVersion: '2025-04-01-preview', hasApiKey: true, activeModelId: 'custom-chat', models: [],
      }),
      get: vi.fn().mockResolvedValue(null),
    };
    const response = await request(createApp({ config, providerSettingsRepository: repository }))
      .put('/api/provider-settings')
      .send({
        provider: 'azure-openai', endpoint: 'https://example.openai.azure.com', apiKey: 'secret-api-key', apiVersion: '2025-04-01-preview',
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      settings: { provider: 'azure-openai', endpoint: 'https://example.openai.azure.com', apiVersion: '2025-04-01-preview', hasApiKey: true, activeModelId: 'custom-chat', models: [] },
    });
    expect(JSON.stringify(response.body)).not.toContain('secret-api-key');
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({ objectId: 'local-user' }), expect.objectContaining({ apiKey: 'secret-api-key' }),
    );
  });

  it('creates an arbitrary model and makes it available as the default', async () => {
    const settings = {
      provider: 'azure-openai', endpoint: 'https://example.openai.azure.com', apiVersion: '2025-04-01-preview', hasApiKey: true,
      activeModelId: 'my-gpt', models: [{ id: 'my-gpt', deployment: 'production-gpt', modes: ['chat', 'vision'], temperature: true }],
    };
    const repository = { createModel: vi.fn().mockResolvedValue(settings), get: vi.fn() };
    const response = await request(createApp({ config, providerSettingsRepository: repository }))
      .post('/api/provider-settings/models')
      .send({ modelId: 'my-gpt', deploymentName: 'production-gpt', modes: ['chat', 'vision'], supportsTemperature: true });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ settings });
    expect(repository.createModel).toHaveBeenCalledWith(expect.objectContaining({ objectId: 'local-user' }), {
      modelId: 'my-gpt', deploymentName: 'production-gpt', modes: ['chat', 'vision'], supportsTemperature: true,
    });
  });

  it('returns a conflict when the active model cannot be deleted', async () => {
    const error = new Error('Select a different default model before deleting this one');
    error.code = 'active_provider_model';
    const repository = { removeModel: vi.fn().mockRejectedValue(error), get: vi.fn() };
    const response = await request(createApp({ config, providerSettingsRepository: repository }))
      .delete('/api/provider-settings/models/my-gpt');

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: 'active_provider_model' });
  });

  it('updates and removes a non-active configured model', async () => {
    const updatedSettings = {
      provider: 'azure-openai', endpoint: 'https://example.openai.azure.com', apiVersion: '2025-04-01-preview', hasApiKey: true,
      activeModelId: 'primary', models: [{ id: 'primary', deployment: 'primary-deployment', modes: ['chat'], temperature: false }, { id: 'secondary', deployment: 'updated-deployment', modes: ['chat', 'vision'], temperature: true }],
    };
    const removedSettings = { ...updatedSettings, models: [updatedSettings.models[0]] };
    const repository = {
      updateModel: vi.fn().mockResolvedValue(updatedSettings),
      removeModel: vi.fn().mockResolvedValue(removedSettings),
      get: vi.fn(),
    };
    const app = createApp({ config, providerSettingsRepository: repository });

    const updated = await request(app).patch('/api/provider-settings/models/secondary').send({
      deploymentName: 'updated-deployment', modes: ['chat', 'vision'], supportsTemperature: true,
    });
    const removed = await request(app).delete('/api/provider-settings/models/secondary');

    expect(updated.status).toBe(200);
    expect(removed.status).toBe(200);
    expect(repository.updateModel).toHaveBeenCalledWith(expect.any(Object), 'secondary', {
      deploymentName: 'updated-deployment', modes: ['chat', 'vision'], supportsTemperature: true,
    });
    expect(repository.removeModel).toHaveBeenCalledWith(expect.any(Object), 'secondary');
  });
});