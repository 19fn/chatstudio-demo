const { randomUUID } = require('crypto');
const express = require('express');
const { z } = require('zod');

const conversationInput = z.object({
  title: z.string().trim().min(1).max(120).default('New conversation'),
  model: z.string().trim().min(1).max(80),
  mode: z.enum(['chat', 'knowledge', 'vision', 'document', 'meeting']),
});
const renameInput = z.object({ title: z.string().trim().min(1).max(120) });

function createConversationRepository(database) {
  async function ensureUser(user) {
    const result = await database.query(
      `INSERT INTO users (tenant_id, object_id, display_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (tenant_id, object_id)
       DO UPDATE SET display_name = EXCLUDED.display_name, updated_at = NOW()
       RETURNING id`,
      [user.tenantId, user.objectId, user.displayName],
    );
    return result.rows[0].id;
  }

  return {
    async list(user) {
      const userId = await ensureUser(user);
      const result = await database.query(
        `SELECT id, title, model, mode, created_at AS "createdAt", updated_at AS "updatedAt"
         FROM conversations WHERE user_id = $1 ORDER BY updated_at DESC`,
        [userId],
      );
      return result.rows;
    },

    async create(user, input) {
      const userId = await ensureUser(user);
      const id = randomUUID();
      const result = await database.query(
        `INSERT INTO conversations (id, user_id, title, model, mode)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, title, model, mode, created_at AS "createdAt", updated_at AS "updatedAt"`,
        [id, userId, input.title, input.model, input.mode],
      );
      return result.rows[0];
    },

    async get(user, id) {
      const userId = await ensureUser(user);
      const conversation = await database.query(
        `SELECT id, title, model, mode, created_at AS "createdAt", updated_at AS "updatedAt"
         FROM conversations WHERE id = $1 AND user_id = $2`,
        [id, userId],
      );
      if (!conversation.rows[0]) return null;
      const messages = await database.query(
        `SELECT id, role, content, metadata, created_at AS "createdAt"
         FROM messages WHERE conversation_id = $1 ORDER BY created_at, id`,
        [id],
      );
      return { ...conversation.rows[0], messages: messages.rows };
    },

    async appendExchange(user, id, userContent, assistantContent, metadata = {}) {
      const userId = await ensureUser(user);
      const client = await database.connect();
      try {
        await client.query('BEGIN');
        const owned = await client.query(
          'SELECT id FROM conversations WHERE id = $1 AND user_id = $2 FOR UPDATE',
          [id, userId],
        );
        if (!owned.rows[0]) throw new Error('Conversation not found');
        await client.query(
          `INSERT INTO messages (conversation_id, role, content, metadata)
           VALUES ($1, 'user', $2, '{}'), ($1, 'assistant', $3, $4)`,
          [id, userContent, assistantContent, JSON.stringify(metadata)],
        );
        await client.query('UPDATE conversations SET updated_at = NOW() WHERE id = $1', [id]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },

    async usage(user) {
      const userId = await ensureUser(user);
      const result = await database.query(
        `SELECT COALESCE(SUM((messages.metadata -> 'tokens' ->> 'total_tokens')::BIGINT), 0) AS "totalTokens"
         FROM messages
         JOIN conversations ON conversations.id = messages.conversation_id
         WHERE conversations.user_id = $1
           AND messages.role = 'assistant'
           AND messages.metadata -> 'tokens' ->> 'total_tokens' ~ '^[0-9]+$'`,
        [userId],
      );
      return { totalTokens: Number(result.rows[0].totalTokens) };
    },

    async remove(user, id) {
      const userId = await ensureUser(user);
      const result = await database.query(
        'DELETE FROM conversations WHERE id = $1 AND user_id = $2 RETURNING id',
        [id, userId],
      );
      return Boolean(result.rowCount);
    },

    async rename(user, id, title) {
      const userId = await ensureUser(user);
      const result = await database.query(
        `UPDATE conversations SET title = $3, updated_at = NOW()
         WHERE id = $1 AND user_id = $2
         RETURNING id, title, model, mode, created_at AS "createdAt", updated_at AS "updatedAt"`,
        [id, userId, title],
      );
      return result.rows[0] || null;
    },

    async clear(user, id) {
      const userId = await ensureUser(user);
      const result = await database.query(
        `DELETE FROM messages USING conversations
         WHERE messages.conversation_id = conversations.id
           AND conversations.id = $1 AND conversations.user_id = $2
         RETURNING messages.id`,
        [id, userId],
      );
      return result.rowCount;
    },
  };
}

function createConversationRouter(repository) {
  const router = express.Router();

  router.get('/', async (request, response, next) => {
    try {
      response.json({ conversations: await repository.list(request.user) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/', async (request, response, next) => {
    const parsed = conversationInput.safeParse(request.body);
    if (!parsed.success) return response.status(400).json({ error: 'invalid_request' });
    try {
      return response.status(201).json(await repository.create(request.user, parsed.data));
    } catch (error) {
      return next(error);
    }
  });

  router.get('/usage', async (request, response, next) => {
    try {
      return response.json(await repository.usage(request.user));
    } catch (error) {
      return next(error);
    }
  });

  router.get('/:id', async (request, response, next) => {
    try {
      const conversation = await repository.get(request.user, request.params.id);
      return conversation
        ? response.json(conversation)
        : response.status(404).json({ error: 'conversation_not_found' });
    } catch (error) {
      return next(error);
    }
  });

  router.patch('/:id', async (request, response, next) => {
    const parsed = renameInput.safeParse(request.body);
    if (!parsed.success) return response.status(400).json({ error: 'invalid_request' });
    try {
      const conversation = await repository.rename(request.user, request.params.id, parsed.data.title);
      return conversation
        ? response.json(conversation)
        : response.status(404).json({ error: 'conversation_not_found' });
    } catch (error) {
      return next(error);
    }
  });

  router.delete('/:id/messages', async (request, response, next) => {
    try {
      await repository.clear(request.user, request.params.id);
      return response.status(204).end();
    } catch (error) {
      return next(error);
    }
  });

  router.delete('/:id', async (request, response, next) => {
    try {
      const removed = await repository.remove(request.user, request.params.id);
      return removed ? response.status(204).end() : response.status(404).json({ error: 'conversation_not_found' });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}

module.exports = { conversationInput, createConversationRepository, createConversationRouter };