export function reconcileConversationSelection({ modelId, mode, models, defaultModel }) {
  const selectedModel = models.find((model) => model.id === modelId)
    || models.find((model) => model.id === defaultModel)
    || models[0];
  if (!selectedModel) return { modelId: '', mode: 'chat', changed: false };

  const selectedMode = selectedModel.modes.includes(mode)
    ? mode
    : selectedModel.modes.includes('chat')
      ? 'chat'
      : selectedModel.modes[0];

  return {
    modelId: selectedModel.id,
    mode: selectedMode,
    changed: selectedModel.id !== modelId || selectedMode !== mode,
  };
}