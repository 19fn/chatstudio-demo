const crypto = require('crypto');
const express = require('express');
const { z } = require('zod');

const settingsInput = z.object({
  provider: z.literal('azure-openai'),
  endpoint: z.string().url(),
  apiKey: z.string().trim().min(1).max(4096),
  deploymentName: z.string().trim().min(1).max(160),
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

  return {
    async get(user) {
      const userId = await ensureUser(user);
      const result = await database.query(
        `SELECT provider, endpoint, deployment_name AS "deploymentName"
         FROM provider_settings WHERE user_id = $1`, [userId],
      );
      return result.rows[0] || null;
    },

    async save(user, settings) {
      const userId = await ensureUser(user);
      const encryptedApiKey = encryptApiKey(settings.apiKey, keyValue);
      const result = await database.query(
        `INSERT INTO provider_settings (user_id, provider, endpoint, deployment_name, encrypted_api_key)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id) DO UPDATE SET provider = EXCLUDED.provider, endpoint = EXCLUDED.endpoint,
           deployment_name = EXCLUDED.deployment_name, encrypted_api_key = EXCLUDED.encrypted_api_key, updated_at = NOW()
         RETURNING provider, endpoint, deployment_name AS "deploymentName"`,
        [userId, settings.provider, settings.endpoint, settings.deploymentName, encryptedApiKey],
      );
      return result.rows[0];
    },
  };
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
      return next(error);
    }
  });
  return router;
}

module.exports = {
  createProviderSettingsRepository, createProviderSettingsRouter, decryptApiKey, encryptApiKey,
};