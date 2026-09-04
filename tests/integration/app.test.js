import { describe, expect, it } from 'vitest';

const baseUrl = process.env.CHAT_STUDIO_BASE_URL || 'http://127.0.0.1:3000';

describe('Chat Studio container', () => {
  it('serves a healthy branded application', async () => {
    const [health, page, models] = await Promise.all([
      fetch(`${baseUrl}/health/live`),
      fetch(`${baseUrl}/`),
      fetch(`${baseUrl}/api/models`),
    ]);

    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ status: 'ok' });
    expect(await page.text()).toContain('<title>Chat Studio</title>');
    expect((await models.json()).models).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'gpt-5.4-mini', vision: true, reasoning: true }),
      expect.objectContaining({ id: 'gpt-5.4', vision: true, reasoning: true }),
    ]));
  });

  it('persists a conversation and completes chat through the mock upstream', async () => {
    const created = await fetch(`${baseUrl}/api/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Integration chat', model: 'gpt-5.4-mini', mode: 'chat' }),
    });
    expect(created.status).toBe(201);
    const conversation = await created.json();

    const completion = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversationId: conversation.id,
        message: 'Hello from integration tests',
        model: 'gpt-5.4-mini',
        mode: 'chat',
      }),
    });
    expect(completion.status).toBe(200);
    expect((await completion.json()).message).toBe('Mock Chat Studio response');

    const stored = await fetch(`${baseUrl}/api/conversations/${conversation.id}`);
    expect(stored.status).toBe(200);
    expect((await stored.json()).messages).toHaveLength(2);
  });

  it('persists encrypted provider settings without returning the API key', async () => {
    const saved = await fetch(`${baseUrl}/api/provider-settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'azure-openai',
        endpoint: 'https://example.openai.azure.com',
        apiKey: 'integration-secret',
        deploymentName: 'chat',
        modelId: 'gpt-5.4-mini',
      }),
    });
    expect(saved.status).toBe(200);
    expect(await saved.json()).toEqual({
      settings: { provider: 'azure-openai', endpoint: 'https://example.openai.azure.com', deploymentName: 'chat', modelId: 'gpt-5.4-mini' },
    });

    const loaded = await fetch(`${baseUrl}/api/provider-settings`);
    expect(loaded.status).toBe(200);
    const body = await loaded.json();
    expect(body).toEqual({
      settings: { provider: 'azure-openai', endpoint: 'https://example.openai.azure.com', deploymentName: 'chat', modelId: 'gpt-5.4-mini' },
    });
    expect(JSON.stringify(body)).not.toContain('integration-secret');
  });
});