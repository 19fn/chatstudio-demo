import { describe, expect, it } from 'vitest';

import { reconcileConversationSelection } from '../../public/js/conversation-selection.js';

const models = [
  { id: 'gpt-5.4-mini', modes: ['chat', 'knowledge'] },
  { id: 'gpt-5.4', modes: ['chat', 'vision'] },
];

describe('reconcileConversationSelection', () => {
  it('resets an unavailable model and stale mode to enabled chat defaults', () => {
    expect(reconcileConversationSelection({
      modelId: 'retired-model', mode: 'meeting', models, defaultModel: 'gpt-5.4-mini',
    })).toEqual({ modelId: 'gpt-5.4-mini', mode: 'chat', changed: true });
  });

  it('retains a valid model and compatible mode', () => {
    expect(reconcileConversationSelection({
      modelId: 'gpt-5.4', mode: 'vision', models, defaultModel: 'gpt-5.4-mini',
    })).toEqual({ modelId: 'gpt-5.4', mode: 'vision', changed: false });
  });
});