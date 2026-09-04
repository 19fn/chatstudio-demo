import request from 'supertest';
import { describe, expect, it } from 'vitest';

import appModule from '../../app.js';

const { createApp } = appModule;

const config = {
  ai: { endpoint: 'https://example.test', key: 'test-key', timeoutMs: 1000 },
  auth: { disabled: false, scope: 'access_as_user', adminRole: 'ChatStudio.Admin' },
  databaseUrl: 'postgres://test',
  maxUploadBytes: 1024,
};

function authWithRoles(roles) {
  return {
    requireAuth(request, _response, next) {
      request.user = { tenantId: 'tenant', objectId: 'user', roles };
      next();
    },
    requireRole(role) {
      return (request, response, next) => request.user.roles.includes(role)
        ? next()
        : response.status(403).json({ error: 'insufficient_role' });
    },
  };
}

describe('knowledge administration', () => {
  it('prevents a regular user from uploading documents', async () => {
    const response = await request(createApp({ config, auth: authWithRoles([]) }))
      .post('/upload');

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'insufficient_role' });
  });

  it('allows an administrator to reach upload validation', async () => {
    const response = await request(createApp({ config, auth: authWithRoles(['ChatStudio.Admin']) }))
      .post('/upload');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'No file uploaded' });
  });
});