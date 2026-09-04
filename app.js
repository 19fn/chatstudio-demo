const express = require('express');
const helmet = require('helmet');
const path = require('path');
const { rateLimit } = require('express-rate-limit');

const uploadRoutes = require('./server/upload');
const listFileRoutes = require('./server/get');
const deleteFileRoutes = require('./server/delete');
const audioRoutes = require('./server/audio');
const { createAuth } = require('./server/auth');
const { createAiClient } = require('./server/ai');
const { createChatRouter } = require('./server/chat-v2');
const { configurationStatus, loadConfig } = require('./server/config');
const { createConversationRepository, createConversationRouter } = require('./server/conversations');
const { databaseReady } = require('./server/db');
const { createLogger, requestLogger } = require('./server/logger');
const { createModelRegistry } = require('./server/models');

function createApp(options = {}) {
  const app = express();
  const config = options.config || loadConfig();
  const logger = options.logger || createLogger(config.logLevel);
  const models = options.models || createModelRegistry(config.ai.modelDeployments, config.ai.defaultModel);
  const auth = options.auth || createAuth(config.auth, { logger });
  const aiClient = options.aiClient || createAiClient(config.ai);
  const conversationRepository = options.conversationRepository
    || (options.database ? createConversationRepository(options.database) : null);

  app.use(helmet({
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        styleSrc: ["'self'", 'https://fonts.googleapis.com'],
        connectSrc: ["'self'", 'https://login.microsoftonline.com'],
        imgSrc: ["'self'", 'data:'],
      },
    },
  }));
  app.use(express.json({ limit: '1mb' }));
  app.use(requestLogger(logger));
  app.use('/api', rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: 'draft-8' }));

  app.get('/health/live', (_request, response) => {
    response.json({ status: 'ok' });
  });

  app.get('/health/ready', async (_request, response) => {
    const checks = configurationStatus(config);
    if (options.database) checks.database = await databaseReady(options.database);
    const ready = Object.values(checks).every(Boolean);
    response.status(ready ? 200 : 503).json({
      status: ready ? 'ready' : 'not_ready',
      checks,
    });
  });

  app.get('/api/config', (_request, response) => {
    response.json({
      logLevel: config.logLevel,
      auth: {
        tenantId: config.auth.tenantId || null,
        clientId: config.auth.spaClientId || null,
        scope: config.auth.apiClientId
          ? `api://${config.auth.apiClientId}/${config.auth.scope}`
          : null,
        adminRole: config.auth.adminRole,
        disabled: config.auth.disabled,
      },
    });
  });

  app.get('/api/models', (_request, response) => {
    response.json({ models: models.listModels(), defaultModel: models.defaultModel });
  });

  app.post('/api/client-logs', (request, response) => {
    const event = typeof request.body?.event === 'string' ? request.body.event.slice(0, 80) : 'client.event';
    const errorCode = typeof request.body?.errorCode === 'string' ? request.body.errorCode.slice(0, 120) : undefined;
    logger.debug(event, errorCode ? { errorCode } : {});
    response.status(204).end();
  });

  app.use('/vendor/msal', express.static(path.join(__dirname, 'node_modules', '@azure', 'msal-browser', 'lib')));
  app.use('/vendor/marked', express.static(path.join(__dirname, 'node_modules', 'marked', 'lib')));
  app.use('/vendor/dompurify', express.static(path.join(__dirname, 'node_modules', 'dompurify', 'dist')));
  app.use(express.static(path.join(__dirname, 'public')));
  app.use(auth.requireAuth);
  if (conversationRepository) {
    app.use('/api/conversations', createConversationRouter(conversationRepository));
    app.use(createChatRouter({ aiClient, conversationRepository, getModel: models.getModel }));
  }
  app.use('/upload', auth.requireRole(config.auth.adminRole));
  app.use('/deletefile', auth.requireRole(config.auth.adminRole));
  app.use(uploadRoutes);
  app.use(listFileRoutes);
  app.use(deleteFileRoutes);
  app.use(audioRoutes);

  app.use((error, _request, response, _next) => {
    logger.error('http.request.failed', { error: error.message });
    response.status(500).json({ error: 'internal_error' });
  });

  return app;
}

module.exports = { createApp };