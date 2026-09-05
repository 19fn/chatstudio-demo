const crypto = require('crypto');
const express = require('express');
const { z } = require('zod');

const settingsInput = z.object({
  provider: z.literal('azure-openai'),
  endpoint: z.string().url(),
  apiVersion: z.string().trim().min(1).max(160),
  apiKey: z.string().trim().min(1).max(4096).optional(),
});
const modelInput = z.object({
  modelId: z.string().trim().min(1).max(160),
  deploymentName: z.string().trim().min(1).max(160),
  modes: z.array(z.enum(['chat', 'knowledge', 'vision', 'document', 'meeting'])).min(1).refine((modes) => modes.includes('chat')),
  supportsTemperature: z.boolean().default(false),
});

function encryptionKey(value) {
  const key = Buffer.from(value || '', 'base64');
  if (key.length !== 32) throw new Error('PROVIDER_SETTINGS_ENCRYPTION_KEY must be a base64-encoded 32-byte key');
  return key;
}

function encryptApiKey(apiKey, keyValue) {
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(keyValue), nonce);
  const ciphertext = Buffer.concat([cipher.update(apiKey, 'utf8'), cipher.final()]);
  return [nonce, cipher.getAuthTag(), ciphertext].map((part) => part.toString('base64')).join('.');
}

function decryptApiKey(ciphertext, keyValue) {
  const [nonce, tag, data] = ciphertext.split('.').map((part) => Buffer.from(part, 'base64'));
  if (!nonce || !tag || !data) throw new Error('Invalid encrypted provider setting');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(keyValue), nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

function createProviderSettingsRepository(database, keyValue) {
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

  async function getConnection(userId, includeSecret = false) {
    const result = await database.query(
      `SELECT provider, endpoint, api_version AS "apiVersion", active_model_id AS "activeModelId",
              ${includeSecret ? 'encrypted_api_key AS "encryptedApiKey"' : 'encrypted_api_key IS NOT NULL AS "hasApiKey"'}
       FROM provider_settings WHERE user_id = $1`, [userId],
    );
    return result.rows[0] || null;
  }

  async function getModels(userId) {
    const result = await database.query(
      `SELECT model_id AS id, deployment_name AS deployment, modes, supports_temperature AS temperature
       FROM provider_models WHERE user_id = $1 ORDER BY model_id`, [userId],
    );
    return result.rows;
  }

  async function getSettings(userId) {
    const connection = await getConnection(userId);
    if (!connection) return null;
    return { ...connection, models: await getModels(userId) };
  }

  const repository = {
    async get(user) {
      const userId = await ensureUser(user);
      return getSettings(userId);
    },

    async getRuntime(user) {
      const userId = await ensureUser(user);
      const connection = await getConnection(userId, true);
      if (!connection) return null;
      return {
        ...connection,
        apiKey: decryptApiKey(connection.encryptedApiKey, keyValue),
        models: await getModels(userId),
      };
    },

    async save(user, settings) {
      const userId = await ensureUser(user);
      const existing = await getConnection(userId, true);
      if (!settings.apiKey && !existing) {
        const error = new Error('An API key is required for a new provider connection');
        error.code = 'provider_api_key_required';
        throw error;
      }
      const encryptedApiKey = settings.apiKey ? encryptApiKey(settings.apiKey, keyValue) : existing.encryptedApiKey;
      await database.query(
        `INSERT INTO provider_settings (user_id, provider, endpoint, api_version, encrypted_api_key)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id) DO UPDATE SET provider = EXCLUDED.provider, endpoint = EXCLUDED.endpoint,
           api_version = EXCLUDED.api_version, encrypted_api_key = EXCLUDED.encrypted_api_key, updated_at = NOW()`,
        [userId, settings.provider, settings.endpoint, settings.apiVersion, encryptedApiKey],
      );
      return getSettings(userId);
    },

    async createModel(user, model) {
      const userId = await ensureUser(user);
      await database.query(
        `INSERT INTO provider_models (user_id, model_id, deployment_name, modes, supports_temperature)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, model.modelId, model.deploymentName, JSON.stringify(model.modes), model.supportsTemperature],
      );
      const connection = await getConnection(userId);
      if (!connection.activeModelId) {
        await database.query('UPDATE provider_settings SET active_model_id = $2 WHERE user_id = $1', [userId, model.modelId]);
      }
      return getSettings(userId);
    },

    async updateModel(user, modelId, model) {
      const userId = await ensureUser(user);
      const result = await database.query(
        `UPDATE provider_models SET deployment_name = $3, modes = $4, supports_temperature = $5, updated_at = NOW()
         WHERE user_id = $1 AND model_id = $2`,
        [userId, modelId, model.deploymentName, JSON.stringify(model.modes), model.supportsTemperature],
      );
      return result.rowCount ? getSettings(userId) : null;
    },

    async removeModel(user, modelId) {
      const userId = await ensureUser(user);
      const connection = await getConnection(userId);
      if (connection?.activeModelId === modelId) {
        const error = new Error('Select a different default model before deleting this one');
        error.code = 'active_provider_model';
        throw error;
      }
      const result = await database.query('DELETE FROM provider_models WHERE user_id = $1 AND model_id = $2', [userId, modelId]);
      return result.rowCount ? getSettings(userId) : null;
    },

    async setActiveModel(user, modelId) {
      const userId = await ensureUser(user);
      const model = await database.query('SELECT 1 FROM provider_models WHERE user_id = $1 AND model_id = $2', [userId, modelId]);
      if (!model.rowCount) return null;
      await database.query('UPDATE provider_settings SET active_model_id = $2, updated_at = NOW() WHERE user_id = $1', [userId, modelId]);
      return getSettings(userId);
    },
  };
  return repository;
}

function createProviderSettingsRouter(repository) {
  const router = express.Router();
  router.get('/', async (request, response, next) => {
    try {
      const settings = await repository.get(request.user);
      return response.json({ settings });
    } catch (error) {
      return next(error);
    }
  });
  router.put('/', async (request, response, next) => {
    const parsed = settingsInput.safeParse(request.body);
    if (!parsed.success) return response.status(400).json({ error: 'invalid_request' });
    try {
      return response.json({ settings: await repository.save(request.user, parsed.data) });
    } catch (error) {
      if (error.code === 'provider_api_key_required') return response.status(400).json({ error: error.code });
      return next(error);
    }
  });
  router.post('/models', async (request, response, next) => {
    const parsed = modelInput.safeParse(request.body);
    if (!parsed.success) return response.status(400).json({ error: 'invalid_request' });
    try {
      return response.status(201).json({ settings: await repository.createModel(request.user, parsed.data) });
    } catch (error) {
      if (error.code === '23505') return response.status(409).json({ error: 'model_already_exists' });
      return next(error);
    }
  });
  router.patch('/models/:modelId', async (request, response, next) => {
    const parsed = modelInput.omit({ modelId: true }).safeParse(request.body);
    if (!parsed.success) return response.status(400).json({ error: 'invalid_request' });
    try {
      const settings = await repository.updateModel(request.user, request.params.modelId, parsed.data);
      return settings ? response.json({ settings }) : response.status(404).json({ error: 'model_not_found' });
    } catch (error) {
      return next(error);
    }
  });
  router.delete('/models/:modelId', async (request, response, next) => {
    try {
      const settings = await repository.removeModel(request.user, request.params.modelId);
      return settings ? response.json({ settings }) : response.status(404).json({ error: 'model_not_found' });
    } catch (error) {
      if (error.code === 'active_provider_model') return response.status(409).json({ error: error.code });
      return next(error);
    }
  });
  router.put('/active-model', async (request, response, next) => {
    const parsed = z.object({ modelId: z.string().trim().min(1).max(160) }).safeParse(request.body);
    if (!parsed.success) return response.status(400).json({ error: 'invalid_request' });
    try {
      const settings = await repository.setActiveModel(request.user, parsed.data.modelId);
      return settings ? response.json({ settings }) : response.status(404).json({ error: 'model_not_found' });
    } catch (error) {
      return next(error);
    }
  });
  return router;
}

module.exports = {
  createProviderSettingsRepository, createProviderSettingsRouter, decryptApiKey, encryptApiKey,
};