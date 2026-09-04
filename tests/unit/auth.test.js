import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import appModule from '../../app.js';
import authModule from '../../server/auth.js';

const { createApp } = appModule;
const { createAuth } = authModule;

const config = {
  ai: { endpoint: 'https://example.test', key: 'test-key', timeoutMs: 1000 },
  auth: {
    disabled: false,
    tenantId: 'tenant',
    apiClientId: 'api-client',
    spaClientId: 'spa-client',
    scope: 'access_as_user',
    adminRole: 'ChatStudio.Admin',
  },
  databaseUrl: 'postgres://test',
  maxUploadBytes: 1024,
};

describe('authentication', () => {
  it('blocks protected routes without a bearer token', async () => {
    const response = await request(createApp({
      config,
      conversationRepository: { list: vi.fn() },
    })).get('/api/conversations');
    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'authentication_required' });
  });

  it('accepts a valid scoped token', async () => {
    const verifyToken = vi.fn().mockResolvedValue({
      tid: 'tenant', oid: 'user', name: 'Test User', scp: 'access_as_user', roles: [],
    });
    const auth = createAuth(config.auth, { verifyToken });
    const repository = { list: vi.fn().mockResolvedValue([]) };
    const response = await request(createApp({ config, auth, conversationRepository: repository }))
      .get('/api/conversations')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(200);
    expect(verifyToken).toHaveBeenCalledWith('valid-token');
  });

  it('returns the server-verified profile metadata', async () => {
    const auth = createAuth(config.auth, {
      verifyToken: vi.fn().mockResolvedValue({
        tid: 'tenant', oid: 'user', name: 'Test User', scp: 'access_as_user', roles: ['ChatStudio.Admin'],
      }),
    });
    const response = await request(createApp({ config, auth, conversationRepository: { list: vi.fn() } }))
      .get('/api/profile')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      displayName: 'Test User', tenantId: 'tenant', objectId: 'user', roles: ['ChatStudio.Admin'],
    });
  });

  it('logs only a safe verifier error code when rejecting a token', async () => {
    const logger = { warn: vi.fn() };
    const verificationError = Object.assign(new Error('sensitive verifier details'), {
      code: 'ERR_JWT_CLAIM_VALIDATION_FAILED',
    });
    const auth = createAuth(config.auth, {
      logger,
      verifyToken: vi.fn().mockRejectedValue(verificationError),
    });
    const response = await request(createApp({
      config,
      auth,
      conversationRepository: { list: vi.fn() },
    })).get('/api/conversations').set('Authorization', 'Bearer invalid-token');

    expect(response.status).toBe(401);
    expect(logger.warn).toHaveBeenCalledWith('auth.token.rejected', {
      errorCode: 'ERR_JWT_CLAIM_VALIDATION_FAILED',
    });
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('sensitive verifier details');
  });
});