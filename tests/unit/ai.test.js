import { describe, expect, it, vi } from 'vitest';
import { Readable } from 'node:stream';

import aiModule from '../../server/ai.js';
import modelsModule from '../../server/models.js';

const { createAiClient } = aiModule;
const { createModelRegistry } = modelsModule;
const models = createModelRegistry({
  'gpt-5.4-mini': 'mini-production-deployment',
  'gpt-5.4': 'full-production-deployment',
});

describe('AI client', () => {
  it('omits temperature for reasoning models', async () => {
    const httpClient = {
      post: vi.fn().mockResolvedValue({
        data: { choices: [{ message: { content: 'Done' } }] },
      }),
    };
    const client = createAiClient({ endpoint: 'https://ai.test/', key: 'key', timeoutMs: 500 }, httpClient);

    await client.complete({
      model: models.getModel('gpt-5.4'), mode: 'chat', messages: [], maxTokens: 1000, temperature: 0.8,
    });

    expect(httpClient.post.mock.calls[0][1]).not.toHaveProperty('temperature');
    expect(httpClient.post.mock.calls[0][0]).toContain('/openai/deployments/full-production-deployment/');
  });

  it('uses the knowledge endpoint and preserves citations', async () => {
    const httpClient = {
      post: vi.fn().mockResolvedValue({
        data: {
          choices: [{ message: { content: 'Answer [doc1]', context: { citations: [{ title: 'Guide' }] } } }],
          usage: { total_tokens: 12 },
        },
      }),
    };
    const client = createAiClient({ endpoint: 'https://ai.test', key: 'key', timeoutMs: 500 }, httpClient);
    const result = await client.complete({
      model: models.getModel('gpt-5.4-mini'), mode: 'knowledge', messages: [], maxTokens: 1000, temperature: 0.2,
    });

    expect(httpClient.post.mock.calls[0][0]).toContain('/data/openai/');
    expect(result.message).toBe('Answer [doc1]');
    expect(result.citations).toEqual([{ title: 'Guide' }]);
  });

  it('returns usage emitted by a streaming completion', async () => {
    const httpClient = {
      post: vi.fn().mockResolvedValue({
        data: Readable.from(['data: {"choices":[{"delta":{"content":"Done"}}]}\n\ndata: {"usage":{"total_tokens":12}}\n\n']),
      }),
    };
    const client = createAiClient({ endpoint: 'https://ai.test', key: 'key', timeoutMs: 500 }, httpClient);

    const result = await client.stream({
      model: models.getModel('gpt-5.4-mini'), mode: 'chat', messages: [], maxTokens: 1000, temperature: 0.2,
      onEvent: vi.fn(),
    });

    expect(result).toMatchObject({ message: 'Done', tokens: { total_tokens: 12 } });
    expect(httpClient.post.mock.calls[0][1]).toMatchObject({
      stream: true,
      stream_options: { include_usage: true },
    });
  });
});