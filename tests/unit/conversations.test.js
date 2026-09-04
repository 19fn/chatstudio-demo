import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import appModule from '../../app.js';

const { createApp } = appModule;

const config = {
  ai: { endpoint: 'https://example.test', key: 'test-key', timeoutMs: 1000 },
  auth: { disabled: true, scope: 'access_as_user', adminRole: 'ChatStudio.Admin' },
  databaseUrl: 'postgres://test',
  maxUploadBytes: 1024,
};

describe('conversation routes', () => {
  it('creates a validated conversation for the current user', async () => {
    const conversation = { id: 'conversation-id', title: 'Launch plan', model: 'gpt-5.4-mini', mode: 'chat' };
    const repository = { create: vi.fn().mockResolvedValue(conversation) };

    const response = await request(createApp({ config, conversationRepository: repository }))
      .post('/api/conversations')
      .send({ title: 'Launch plan', model: 'gpt-5.4-mini', mode: 'chat' });

    expect(response.status).toBe(201);
    expect(response.body).toEqual(conversation);
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ objectId: 'local-user' }),
      expect.objectContaining({ title: 'Launch plan' }),
    );
  });

  it('rejects unsupported modes before reaching persistence', async () => {
    const repository = { create: vi.fn() };
    const response = await request(createApp({ config, conversationRepository: repository }))
      .post('/api/conversations')
      .send({ title: 'Bad mode', model: 'gpt-5.4-mini', mode: 'magic' });

    expect(response.status).toBe(400);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('renames and clears only through repository ownership checks', async () => {
    const repository = {
      rename: vi.fn().mockResolvedValue({ id: 'owned', title: 'Renamed' }),
      clear: vi.fn().mockResolvedValue(2),
    };
    const app = createApp({ config, conversationRepository: repository });

    const renamed = await request(app).patch('/api/conversations/owned').send({ title: 'Renamed' });
    const cleared = await request(app).delete('/api/conversations/owned/messages');

    expect(renamed.status).toBe(200);
    expect(cleared.status).toBe(204);
    expect(repository.rename).toHaveBeenCalledWith(expect.any(Object), 'owned', 'Renamed');
    expect(repository.clear).toHaveBeenCalledWith(expect.any(Object), 'owned');
  });
});