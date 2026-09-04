const { z } = require('zod');

const optionalString = z.preprocess(
  (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
  z.string().min(1).optional(),
);
const optionalUrl = z.preprocess(
  (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
  z.string().url().optional(),
);
const modelDeployments = z.string()
  .default('{"gpt-5.4-mini":"gpt-5.4-mini","gpt-5.4":"gpt-5.4"}')
  .transform((value, context) => {
    try {
      const parsed = JSON.parse(value);
      if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error();
      for (const [modelId, deployment] of Object.entries(parsed)) {
        if (!modelId.trim() || typeof deployment !== 'string' || !deployment.trim()) throw new Error();
      }
      return parsed;
    } catch (_error) {
      context.addIssue({ code: 'custom', message: 'Must be a JSON object mapping model IDs to deployments' });
      return z.NEVER;
    }
  });

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).optional(),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  AI_API_ENDPOINT: optionalUrl,
  AI_API_KEY: optionalString,
  AI_API_VERSION: z.string().min(1).default('2025-04-01-preview'),
  AI_MODEL_DEPLOYMENTS: modelDeployments,
  AI_DEFAULT_MODEL: z.string().min(1).default('gpt-5.4-mini'),
  DATABASE_URL: optionalString,
  ENTRA_TENANT_ID: optionalString,
  ENTRA_API_CLIENT_ID: optionalString,
  ENTRA_SPA_CLIENT_ID: optionalString,
  ENTRA_API_SCOPE: z.string().min(1).default('access_as_user'),
  ENTRA_ADMIN_ROLE: z.string().min(1).default('ChatStudio.Admin'),
  AUTH_DISABLED: z.string().default('false').transform((value) => value === 'true'),
  MAX_UPLOAD_MB: z.coerce.number().positive().default(20),
  UPSTREAM_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),
});

function loadConfig(environment = process.env) {
  const result = environmentSchema.safeParse(environment);
  if (!result.success) {
    throw new Error(`Invalid configuration: ${result.error.issues.map((issue) => issue.path.join('.')).join(', ')}`);
  }

  const values = result.data;
  return {
    nodeEnv: values.NODE_ENV,
    logLevel: values.LOG_LEVEL || (values.NODE_ENV === 'development' ? 'debug' : 'info'),
    port: values.PORT,
    ai: {
      endpoint: values.AI_API_ENDPOINT,
      key: values.AI_API_KEY,
      apiVersion: values.AI_API_VERSION,
      modelDeployments: values.AI_MODEL_DEPLOYMENTS,
      defaultModel: values.AI_DEFAULT_MODEL,
      timeoutMs: values.UPSTREAM_TIMEOUT_MS,
    },
    databaseUrl: values.DATABASE_URL,
    auth: {
      disabled: values.AUTH_DISABLED,
      tenantId: values.ENTRA_TENANT_ID,
      apiClientId: values.ENTRA_API_CLIENT_ID,
      spaClientId: values.ENTRA_SPA_CLIENT_ID,
      scope: values.ENTRA_API_SCOPE,
      adminRole: values.ENTRA_ADMIN_ROLE,
    },
    maxUploadBytes: values.MAX_UPLOAD_MB * 1024 * 1024,
  };
}

function configurationStatus(config) {
  const upstream = Boolean(config.ai.endpoint && config.ai.key);
  const database = Boolean(config.databaseUrl);
  const identity = config.auth.disabled || Boolean(
    config.auth.tenantId && config.auth.apiClientId && config.auth.spaClientId,
  );

  return { upstream, database, identity };
}

module.exports = { configurationStatus, loadConfig };