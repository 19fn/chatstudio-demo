const LEVELS = Object.freeze({ error: 0, warn: 1, info: 2, debug: 3 });

function createLogger(level = 'info', output = console) {
  const threshold = LEVELS[level] ?? LEVELS.info;

  function write(severity, message, details = {}) {
    if (LEVELS[severity] > threshold) return;
    const entry = JSON.stringify({
      timestamp: new Date().toISOString(),
      level: severity,
      message,
      ...details,
    });
    const method = severity === 'debug' ? 'log' : severity;
    (output[method] || output.log).call(output, entry);
  }

  return {
    error: (message, details) => write('error', message, details),
    warn: (message, details) => write('warn', message, details),
    info: (message, details) => write('info', message, details),
    debug: (message, details) => write('debug', message, details),
  };
}

function requestLogger(logger) {
  return (request, response, next) => {
    const startedAt = process.hrtime.bigint();
    logger.debug('http.request.started', { method: request.method, path: request.path });
    response.on('finish', () => {
      logger.debug('http.request.completed', {
        method: request.method,
        path: request.path,
        status: response.statusCode,
        durationMs: Number(process.hrtime.bigint() - startedAt) / 1e6,
      });
    });
    next();
  };
}

module.exports = { createLogger, requestLogger };