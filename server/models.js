const MODEL_CAPABILITIES = Object.freeze({
  'gpt-5.4-mini': {
    id: 'gpt-5.4-mini',
    label: 'GPT-5.4 mini',
    description: 'Fast reasoning model for everyday analysis, knowledge work, images, and structured tasks.',
    reasoning: true,
    vision: true,
    temperature: false,
    modes: ['chat', 'knowledge', 'vision', 'document', 'meeting'],
  },
  'gpt-5.4': {
    id: 'gpt-5.4',
    label: 'GPT-5.4',
    description: 'Advanced reasoning model for complex analysis, planning, images, and high-accuracy work.',
    reasoning: true,
    vision: true,
    temperature: false,
    modes: ['chat', 'knowledge', 'vision', 'document', 'meeting'],
  },
});

function createModelRegistry(deployments = {
  'gpt-5.4-mini': 'gpt-5.4-mini',
  'gpt-5.4': 'gpt-5.4',
}, defaultModel = 'gpt-5.4-mini') {
  const configuredModels = Object.entries(deployments).map(([modelId, deployment]) => {
    const capabilities = MODEL_CAPABILITIES[modelId];
    if (!capabilities) throw new Error(`Unsupported model in AI_MODEL_DEPLOYMENTS: ${modelId}`);
    return { ...capabilities, deployment };
  });
  if (configuredModels.length === 0) throw new Error('AI_MODEL_DEPLOYMENTS must contain at least one model');
  if (!configuredModels.some((model) => model.id === defaultModel)) {
    throw new Error(`AI_DEFAULT_MODEL is not enabled: ${defaultModel}`);
  }

  const byId = new Map(configuredModels.map((model) => [model.id, model]));
  return {
    defaultModel,
    getModel(modelId) {
      return byId.get(modelId) || null;
    },
    listModels() {
      return configuredModels.map(({ deployment: _deployment, ...model }) => model);
    },
  };
}

module.exports = { createModelRegistry, MODEL_CAPABILITIES };