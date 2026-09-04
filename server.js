const dotenv = require('dotenv');

dotenv.config();

const { createApp } = require('./app');
const { loadConfig } = require('./server/config');
const { createDatabase, migrate } = require('./server/db');
const { createLogger } = require('./server/logger');

const config = loadConfig();
const logger = createLogger(config.logLevel);
const database = createDatabase(config.databaseUrl);
let server;

async function start() {
  await migrate(database);
  logger.debug('database.migrations.completed');
  server = createApp({ config, database, logger }).listen(config.port, () => {
    logger.info('server.started', {
      port: config.port,
      environment: config.nodeEnv,
      logLevel: config.logLevel,
      authDisabled: config.auth.disabled,
    });
  });
}

function shutdown(signal) {
  logger.info('server.shutdown.started', { signal });
  if (!server) return;
  server.close((error) => {
    if (error) {
      logger.error('server.shutdown.failed', { error: error.message });
      process.exitCode = 1;
    }
    database?.end();
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start().catch((error) => {
  logger.error('server.start.failed', { error: error.message });
  process.exitCode = 1;
});
