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

function repository() {
  return {
    get: vi.fn().mockResolvedValue({
      id: 'ec8d60f4-47de-4b41-92a7-a15a22e44d4c',
      messages: [{ role: 'user', content: 'Earlier question' }],
    }),
    appendExchange: vi.fn().mockResolvedValue(undefined),
  };
}

describe('chat route', () => {
  it('rejects a model that is not enabled', async () => {
    const response = await request(createApp({
      config,
      conversationRepository: repository(),
      aiClient: { complete: vi.fn() },
    })).post('/api/chat').send({
      conversationId: 'ec8d60f4-47de-4b41-92a7-a15a22e44d4c',
      message: 'Describe this',
      model: 'unknown-model',
      mode: 'chat',
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('unsupported_model');
  });

  it('sends a valid multimodal request and persists the exchange', async () => {
    const conversations = repository();
    const aiClient = {
      complete: vi.fn().mockResolvedValue({
        message: 'The image shows a dashboard.', citations: [], tokens: { total_tokens: 10 },
      }),
    };
    const response = await request(createApp({ config, conversationRepository: conversations, aiClient }))
      .post('/api/chat')
      .send({
        conversationId: 'ec8d60f4-47de-4b41-92a7-a15a22e44d4c',
        message: 'Describe this',
        model: 'gpt-5.4-mini',
        mode: 'vision',
        image: 'data:image/png;base64,AAAA',
      });

    expect(response.status).toBe(200);
    expect(aiClient.complete).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'vision',
      messages: expect.arrayContaining([
        expect.objectContaining({ role: 'user', content: expect.any(Array) }),
      ]),
    }));
    expect(conversations.appendExchange).toHaveBeenCalledOnce();
  });

  it('streams content and persists only the completed response', async () => {
    const conversations = repository();
    const aiClient = {
      stream: vi.fn(async ({ onEvent }) => {
        onEvent({ type: 'content', content: 'Hello ' });
        onEvent({ type: 'content', content: 'world' });
        return { message: 'Hello world', citations: [], followUpQuestions: [] };
      }),
    };
    const response = await request(createApp({ config, conversationRepository: conversations, aiClient }))
      .post('/api/chat/stream')
      .send({
        conversationId: 'ec8d60f4-47de-4b41-92a7-a15a22e44d4c',
        message: 'Hello', model: 'gpt-5.4-mini', mode: 'chat',
      });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/event-stream');
    expect(response.text).toContain('"content":"Hello "');
    expect(response.text).toContain('"type":"done"');
    expect(conversations.appendExchange).toHaveBeenCalledWith(
      expect.any(Object), expect.any(String), 'Hello', 'Hello world', expect.any(Object),
    );
  });
});