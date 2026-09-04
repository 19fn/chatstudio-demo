import request from 'supertest';
import { describe, expect, it } from 'vitest';

import appModule from '../../app.js';

const { createApp } = appModule;

function testConfig(overrides = {}) {
  return {
    ai: { endpoint: 'https://example.test', key: 'test-key', timeoutMs: 1000 },
    auth: {
      disabled: true,
      tenantId: undefined,
      apiClientId: undefined,
      spaClientId: undefined,
      scope: 'access_as_user',
      adminRole: 'ChatStudio.Admin',
    },
    databaseUrl: 'postgres://test:test@database/test',
    maxUploadBytes: 1024,
    ...overrides,
  };
}

describe('health endpoints', () => {
  it('reports the process as live', async () => {
    const response = await request(createApp({ config: testConfig() })).get('/health/live');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
    expect(response.headers['cross-origin-opener-policy']).toBe('same-origin-allow-popups');
  });

  it('reports missing dependencies without exposing secrets', async () => {
    const response = await request(createApp({
      config: testConfig({
        ai: { endpoint: undefined, key: undefined, timeoutMs: 1000 },
        databaseUrl: undefined,
      }),
    })).get('/health/ready');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      status: 'not_ready',
      checks: { upstream: false, database: false, identity: true },
    });
    expect(response.text).not.toContain('test-key');
  });
});