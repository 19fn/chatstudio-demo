import { describe, expect, it, vi } from 'vitest';

import loggerModule from '../../server/logger.js';

const { createLogger } = loggerModule;

describe('logger', () => {
  it('emits debug entries at debug level without implicit sensitive data', () => {
    const output = { log: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const logger = createLogger('debug', output);

    logger.debug('http.request.started', { method: 'GET', path: '/health/live' });

    expect(output.log).toHaveBeenCalledOnce();
    const entry = JSON.parse(output.log.mock.calls[0][0]);
    expect(entry).toMatchObject({ level: 'debug', message: 'http.request.started', method: 'GET' });
  });

  it('filters debug messages at info level', () => {
    const output = { log: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const logger = createLogger('info', output);

    logger.debug('hidden');
    logger.info('visible');

    expect(output.log).not.toHaveBeenCalled();
    expect(output.info).toHaveBeenCalledOnce();
  });
});