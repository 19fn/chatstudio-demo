import { describe, expect, it } from 'vitest';

import modelsModule from '../../server/models.js';

const { createModelRegistry } = modelsModule;

describe('model registry', () => {
  it('exposes capabilities without leaking deployment names', () => {
    const registry = createModelRegistry({
      'gpt-5.4-mini': 'private-mini-deployment',
      'gpt-5.4': 'private-full-deployment',
    });

    expect(registry.listModels()).toEqual([
      expect.objectContaining({ id: 'gpt-5.4-mini', vision: true, reasoning: true }),
      expect.objectContaining({ id: 'gpt-5.4', vision: true, reasoning: true }),
    ]);
    expect(JSON.stringify(registry.listModels())).not.toContain('private-');
    expect(registry.getModel('gpt-5.4').deployment).toBe('private-full-deployment');
  });

  it('rejects unsupported models and a disabled default', () => {
    expect(() => createModelRegistry({ unknown: 'deployment' })).toThrow('Unsupported model');
    expect(() => createModelRegistry({ 'gpt-5.4': 'full' }, 'gpt-5.4-mini'))
      .toThrow('AI_DEFAULT_MODEL is not enabled');
  });
});