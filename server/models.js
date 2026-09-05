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

function createConfiguredModelRegistry(configuredModels, defaultModel) {
  if (!Array.isArray(configuredModels) || configuredModels.length === 0) {
    throw new Error('At least one configured model is required');
  }
  if (!configuredModels.some((model) => model.id === defaultModel)) {
    throw new Error('Configured default model is not enabled');
  }

  const byId = new Map(configuredModels.map((model) => [model.id, {
    id: model.id,
    label: model.label || model.id,
    description: model.description || 'Configured provider model.',
    deployment: model.deployment,
    modes: model.modes,
    temperature: model.temperature,
    vision: model.modes.includes('vision'),
    reasoning: false,
  }]));
  return {
    defaultModel,
    getModel(modelId) {
      return byId.get(modelId) || null;
    },
    listModels() {
      return [...byId.values()].map(({ deployment: _deployment, ...model }) => model);
    },
  };
}

module.exports = { createConfiguredModelRegistry, createModelRegistry, MODEL_CAPABILITIES };