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

    const usage = await fetch(`${baseUrl}/api/conversations/usage`);
    expect(usage.status).toBe(200);
    expect(await usage.json()).toEqual({ totalTokens: 9 });
  });

  it('persists encrypted provider settings without returning the API key', async () => {
    const saved = await fetch(`${baseUrl}/api/provider-settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'azure-openai',
        endpoint: 'http://mock-upstream:8080',
        apiKey: 'integration-secret',
        apiVersion: '2025-04-01-preview',
      }),
    });
    expect(saved.status).toBe(200);
    expect(await saved.json()).toEqual({
      settings: { provider: 'azure-openai', endpoint: 'http://mock-upstream:8080', apiVersion: '2025-04-01-preview', hasApiKey: true, activeModelId: null, models: [] },
    });

    const createdModel = await fetch(`${baseUrl}/api/provider-settings/models`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        modelId: 'my-gpt', deploymentName: 'chat', modes: ['chat'], supportsTemperature: false,
      }),
    });
    expect(createdModel.status).toBe(201);
    expect((await createdModel.json()).settings).toMatchObject({
      activeModelId: 'my-gpt', models: [expect.objectContaining({ id: 'my-gpt', deployment: 'chat', modes: ['chat'] })],
    });

    const secondModel = await fetch(`${baseUrl}/api/provider-settings/models`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        modelId: 'vision-gpt', deploymentName: 'vision-chat', modes: ['chat', 'vision'], supportsTemperature: true,
      }),
    });
    expect(secondModel.status).toBe(201);

    const activeModel = await fetch(`${baseUrl}/api/provider-settings/active-model`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modelId: 'vision-gpt' }),
    });
    expect(activeModel.status).toBe(200);
    expect((await activeModel.json()).settings.activeModelId).toBe('vision-gpt');

    const loaded = await fetch(`${baseUrl}/api/provider-settings`);
    expect(loaded.status).toBe(200);
    const body = await loaded.json();
    expect(body).toEqual({
      settings: {
        provider: 'azure-openai', endpoint: 'http://mock-upstream:8080', apiVersion: '2025-04-01-preview', hasApiKey: true,
        activeModelId: 'vision-gpt', models: [
          { id: 'my-gpt', deployment: 'chat', modes: ['chat'], temperature: false },
          { id: 'vision-gpt', deployment: 'vision-chat', modes: ['chat', 'vision'], temperature: true },
        ],
      },
    });
    expect(JSON.stringify(body)).not.toContain('integration-secret');

    const created = await fetch(`${baseUrl}/api/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Configured model chat', model: 'vision-gpt', mode: 'chat' }),
    });
    const conversation = await created.json();
    const completion = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId: conversation.id, message: 'Configured model test', model: 'vision-gpt', mode: 'chat' }),
    });
    expect(completion.status).toBe(200);
    expect((await completion.json()).message).toBe('Mock Chat Studio response');
  });
});