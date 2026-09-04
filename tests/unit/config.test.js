import { describe, expect, it } from 'vitest';

import configModule from '../../server/config.js';

const { configurationStatus, loadConfig } = configModule;

describe('configuration', () => {
  it('treats blank optional Compose variables as unset', () => {
    const config = loadConfig({
      AUTH_DISABLED: 'true',
      AI_API_ENDPOINT: 'https://example.test',
      AI_API_KEY: 'key',
      DATABASE_URL: 'postgres://database/test',
      ENTRA_TENANT_ID: '',
      ENTRA_API_CLIENT_ID: '',
      ENTRA_SPA_CLIENT_ID: '',
    });

    expect(config.auth.tenantId).toBeUndefined();
    expect(configurationStatus(config)).toEqual({ upstream: true, database: true, identity: true });
  });

  it('defaults development logging to debug and production logging to info', () => {
    expect(loadConfig({ NODE_ENV: 'development' }).logLevel).toBe('debug');
    expect(loadConfig({ NODE_ENV: 'production' }).logLevel).toBe('info');
    expect(loadConfig({ NODE_ENV: 'development', LOG_LEVEL: 'warn' }).logLevel).toBe('warn');
  });

  it('loads the provider settings encryption key separately from runtime AI configuration', () => {
    const config = loadConfig({ PROVIDER_SETTINGS_ENCRYPTION_KEY: 'test-key' });
    expect(config.providerSettingsEncryptionKey).toBe('test-key');
  });

  it('parses the deployment map and rejects malformed JSON', () => {
    const config = loadConfig({
      AI_MODEL_DEPLOYMENTS: '{"gpt-5.4-mini":"mini-deployment","gpt-5.4":"full-deployment"}',
      AI_DEFAULT_MODEL: 'gpt-5.4',
    });

    expect(config.ai.modelDeployments).toEqual({
      'gpt-5.4-mini': 'mini-deployment',
      'gpt-5.4': 'full-deployment',
    });
    expect(config.ai.defaultModel).toBe('gpt-5.4');
    expect(() => loadConfig({ AI_MODEL_DEPLOYMENTS: 'not-json' })).toThrow('AI_MODEL_DEPLOYMENTS');
  });
});