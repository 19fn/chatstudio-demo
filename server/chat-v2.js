const express = require('express');
const { z } = require('zod');

const chatInput = z.object({
  conversationId: z.string().uuid(),
  message: z.string().trim().min(1).max(20000),
  model: z.string().trim().min(1),
  mode: z.enum(['chat', 'knowledge', 'vision', 'document', 'meeting']).default('chat'),
  systemMessage: z.string().trim().max(4000).default('You are a helpful AI assistant.'),
  maxTokens: z.coerce.number().int().min(1).max(16000).default(1200),
  temperature: z.coerce.number().min(0).max(1).default(0.4),
  image: z.string().regex(/^data:image\/(png|jpeg|webp);base64,/).nullish().transform((image) => image || undefined),
});

function buildMessages(input, history) {
  const userContent = input.mode === 'vision'
    ? [
        { type: 'text', text: input.message },
        { type: 'image_url', image_url: { url: input.image } },
      ]
    : input.message;

  return [
    { role: 'system', content: input.systemMessage },
    ...history,
    { role: 'user', content: userContent },
  ];
}

function createChatRouter({ resolveRuntime, conversationRepository, logger }) {
  const router = express.Router();

  function rejectValidation(request, response, error, details) {
    logger?.debug('chat.request.rejected', { path: request.path, error });
    return response.status(400).json(details ? { error, details } : { error });
  }

  async function prepareChat(request, response) {
    const legacyMode = request.path === '/rag-chat' ? 'knowledge' : 'chat';
    const parsed = chatInput.safeParse({ ...request.body, mode: request.body.mode || legacyMode });
    if (!parsed.success) {
      rejectValidation(request, response, 'invalid_request', parsed.error.flatten());
      return null;
    }
    const input = parsed.data;
    const runtime = await resolveRuntime(request.user);
    const model = runtime.getModel(input.model);
    if (!model) {
      rejectValidation(request, response, 'unsupported_model');
      return null;
    }
    if (!model.modes.includes(input.mode)) {
      rejectValidation(request, response, 'unsupported_model_mode');
      return null;
    }
    if (input.mode === 'vision' && !input.image) {
      rejectValidation(request, response, 'image_required');
      return null;
    }
    const conversation = await conversationRepository.get(request.user, input.conversationId);
    if (!conversation) {
      response.status(404).json({ error: 'conversation_not_found' });
      return null;
    }
    const history = conversation.messages
      .filter((message) => ['user', 'assistant'].includes(message.role))
      .slice(-20)
      .map(({ role, content }) => ({ role, content }));
    return { input, model, messages: buildMessages(input, history), runtime };
  }

  async function handleChat(request, response, next) {
    try {
      const prepared = await prepareChat(request, response);
      if (!prepared) return;
      const { input, model, messages, runtime } = prepared;
      const result = await runtime.aiClient.complete({
        model,
        mode: input.mode,
        messages,
        maxTokens: input.maxTokens,
        temperature: input.temperature,
      });
      await conversationRepository.appendExchange(
        request.user,
        input.conversationId,
        input.message,
        result.message,
        { citations: result.citations, tokens: result.tokens },
      );
      return response.json(result);
    } catch (error) {
      if (error.response) {
        return response.status(502).json({ error: 'upstream_error', status: error.response.status });
      }
      return next(error);
    }
  }

  async function handleStream(request, response, next) {
    try {
      const prepared = await prepareChat(request, response);
      if (!prepared) return;
      const { input, model, messages, runtime } = prepared;
      const controller = new AbortController();
      response.on('close', () => {
        if (!response.writableEnded) controller.abort();
      });
      response.set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      });
      response.flushHeaders();
      const send = (event) => response.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      const result = await runtime.aiClient.stream({
        model,
        mode: input.mode,
        messages,
        maxTokens: input.maxTokens,
        temperature: input.temperature,
        signal: controller.signal,
        onEvent: send,
      });
      await conversationRepository.appendExchange(
        request.user, input.conversationId, input.message, result.message, { citations: result.citations },
      );
      send({ type: 'done', citations: result.citations, followUpQuestions: result.followUpQuestions });
      response.end();
    } catch (error) {
      if (response.headersSent) {
        response.write(`event: error\ndata: ${JSON.stringify({ type: 'error', error: 'stream_failed' })}\n\n`);
        return response.end();
      }
      return next(error);
    }
  }

  router.post(['/api/chat', '/chat', '/rag-chat', '/basic-chat'], handleChat);
  router.post('/api/chat/stream', handleStream);
  return router;
}

module.exports = { buildMessages, chatInput, createChatRouter };