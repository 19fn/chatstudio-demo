const axios = require('axios');

function createAiClient(config, httpClient = axios) {
  const baseUrl = config.endpoint?.replace(/\/$/, '');

  async function complete({ model, mode, messages, maxTokens, temperature }) {
    const route = ['knowledge', 'document'].includes(mode) ? 'data/openai' : 'openai';
    const url = `${baseUrl}/${route}/deployments/${encodeURIComponent(model.deployment)}/chat/completions`;
    const payload = {
      messages,
      max_completion_tokens: maxTokens,
    };
    if (model.temperature) payload.temperature = temperature;

    const response = await httpClient.post(url, payload, {
      headers: { 'Content-Type': 'application/json', 'api-key': config.key },
      params: { 'api-version': config.apiVersion || '2025-04-01-preview' },
      timeout: config.timeoutMs,
    });

    const choice = response.data?.choices?.[0]?.message;
    if (!choice || typeof choice.content !== 'string') {
      throw new Error('The AI service returned an invalid response');
    }

    return {
      message: choice.content,
      citations: choice.context?.citations || [],
      followUpQuestions: choice.context?.intent || [],
      tokens: response.data.usage || null,
    };
  }

  async function stream({ model, mode, messages, maxTokens, temperature, signal, onEvent }) {
    const route = ['knowledge', 'document'].includes(mode) ? 'data/openai' : 'openai';
    const url = `${baseUrl}/${route}/deployments/${encodeURIComponent(model.deployment)}/chat/completions`;
    const payload = { messages, max_completion_tokens: maxTokens, stream: true };
    if (model.temperature) payload.temperature = temperature;

    const response = await httpClient.post(url, payload, {
      headers: { 'Content-Type': 'application/json', 'api-key': config.key },
      params: { 'api-version': config.apiVersion || '2025-04-01-preview' },
      timeout: config.timeoutMs,
      responseType: 'stream',
      signal,
    });

    let buffer = '';
    let content = '';
    let metadata = {};
    for await (const chunk of response.data) {
      buffer += chunk.toString('utf8');
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        const event = JSON.parse(data);
        const choice = event.choices?.[0] || {};
        const text = choice.delta?.content || '';
        if (text) {
          content += text;
          onEvent({ type: 'content', content: text });
        }
        if (choice.message?.context || choice.delta?.context) {
          metadata = choice.message?.context || choice.delta?.context;
        }
        if (event.usage) onEvent({ type: 'usage', usage: event.usage });
      }
    }
    return {
      message: content,
      citations: metadata.citations || [],
      followUpQuestions: metadata.intent || [],
    };
  }

  return { complete, stream };
}

module.exports = { createAiClient };