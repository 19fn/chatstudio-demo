import { marked } from '/vendor/marked/marked.esm.js';
import DOMPurify from '/vendor/dompurify/purify.es.mjs';
import { reconcileConversationSelection } from './conversation-selection.js';
import { profileDetails } from './profile-data.js';

const state = {
  authConfig: null,
  account: null,
  accessToken: null,
  conversationId: null,
  models: [],
  defaultModel: null,
  image: null,
  busy: false,
  requestController: null,
};

const elements = Object.fromEntries([
  'auth-banner', 'sign-in-button', 'sign-out-button', 'account-menu', 'account-menu-toggle', 'account-menu-items', 'profile-toggle', 'provider-settings-toggle', 'new-conversation',
  'conversation-list', 'conversation-title', 'model-select', 'mode-picker', 'mode-label',
  'rename-conversation', 'clear-conversation', 'delete-conversation',
  'system-message', 'max-tokens', 'max-tokens-value', 'temperature', 'temperature-value',
  'temperature-control', 'model-note', 'message-viewport', 'welcome-state', 'prompt-grid',
  'chat-messages', 'chat-form', 'chat-input', 'send-button', 'attachment-button', 'file-input',
  'attachment-preview', 'token-usage', 'details-toggle', 'details-close', 'details-panel',
  'navigation-toggle', 'navigation-panel', 'knowledge-toggle', 'knowledge-dialog',
  'knowledge-close', 'knowledge-role-note', 'upload-button', 'refresh-files', 'file-list', 'toast',
  'profile-dialog', 'profile-close', 'profile-details',
  'provider-settings-dialog', 'provider-settings-close', 'provider-settings-form', 'provider-select',
  'provider-endpoint', 'provider-deployment', 'provider-model', 'provider-api-key',
].map((id) => [id, document.getElementById(id)]));

const prompts = [
  'Turn these rough notes into a concise project update',
  'Compare two approaches and explain the tradeoffs',
  'Find the key facts in our approved knowledge base',
  'Create an action plan with owners and next steps',
];

let authClient;

function logClientEvent(event, details = {}) {
  if (state.authConfig?.logLevel !== 'debug') return;
  fetch('/api/client-logs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event, ...details }),
  }).catch(() => {});
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.remove('hidden');
  window.setTimeout(() => elements.toast.classList.add('hidden'), 3500);
}

function closeAccountMenu() {
  elements['account-menu-items'].classList.add('hidden');
  elements['account-menu-toggle'].setAttribute('aria-expanded', 'false');
}

function renderProfile(verifiedProfile) {
  elements['profile-details'].replaceChildren(...profileDetails(state.account, state.authConfig, verifiedProfile).flatMap(([label, value]) => {
    const term = document.createElement('dt');
    term.textContent = label;
    const description = document.createElement('dd');
    description.textContent = value;
    return [term, description];
  }));
}

async function openProviderSettings() {
  const { settings } = await apiFetch('/api/provider-settings');
  elements['provider-select'].value = settings?.provider || 'azure-openai';
  elements['provider-endpoint'].value = settings?.endpoint || '';
  elements['provider-deployment'].value = settings?.deploymentName || '';
  elements['provider-model'].value = settings?.modelId || 'gpt-5.4-mini';
  elements['provider-api-key'].value = '';
  elements['provider-settings-dialog'].showModal();
}

function setAuthenticated(account, token) {
  state.account = account;
  state.accessToken = token;
  const authenticated = Boolean(account);
  elements['auth-banner'].classList.toggle('hidden', authenticated);
  elements['sign-in-button'].classList.toggle('hidden', authenticated);
  elements['account-menu'].classList.toggle('hidden', !authenticated);
  if (!authenticated) closeAccountMenu();
  elements['provider-settings-toggle'].disabled = !state.authConfig?.providerSettingsEnabled;
  elements['provider-settings-toggle'].title = state.authConfig?.providerSettingsEnabled
    ? 'Open provider settings'
    : 'Provider settings require PROVIDER_SETTINGS_ENCRYPTION_KEY';
  elements['chat-input'].disabled = !authenticated;
  elements['chat-input'].placeholder = authenticated ? 'Message Chat Studio' : 'Sign in to start a conversation';
  elements['new-conversation'].disabled = !authenticated;
  elements['model-select'].disabled = !authenticated;
  elements['mode-picker'].disabled = !authenticated;
  elements['system-message'].disabled = !authenticated;
  elements['max-tokens'].disabled = !authenticated;
  elements.temperature.disabled = !authenticated;
  elements['knowledge-toggle'].disabled = !authenticated;
  elements['rename-conversation'].disabled = !authenticated || !state.conversationId;
  elements['clear-conversation'].disabled = !authenticated || !state.conversationId;
  elements['delete-conversation'].disabled = !authenticated || !state.conversationId;
  updateComposer();
  updateCapabilities();
}

async function apiFetch(url, options = {}) {
  if (!state.account) throw new Error('Sign in to use Chat Studio.');
  const headers = new Headers(options.headers || {});
  if (state.accessToken) headers.set('Authorization', `Bearer ${state.accessToken}`);
  const response = await fetch(url, { ...options, headers });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(errorMessage(body, response.status));
  }
  return response.status === 204 ? null : response.json();
}

function currentMode() {
  return document.querySelector('input[name="mode"]:checked')?.value || 'chat';
}

function currentModel() {
  return state.models.find((model) => model.id === elements['model-select'].value);
}

function errorMessage(body, status) {
  const messages = {
    invalid_request: 'Chat request is invalid. Check the message and settings, then try again.',
    unsupported_model: 'This conversation used a model that is no longer available. Select an enabled model and try again.',
    unsupported_model_mode: 'The selected model does not support this mode. Choose a compatible mode and try again.',
    image_required: 'Attach an image before sending a Vision request.',
  };
  return messages[body.error] || body.error || `Request failed (${status})`;
}

function updateCapabilities() {
  const model = currentModel();
  if (!model) return;
  document.querySelectorAll('input[name="mode"]').forEach((control) => {
    control.disabled = !state.account || !model.modes.includes(control.value);
    if (control.checked && control.disabled) document.querySelector('input[name="mode"][value="chat"]').checked = true;
  });
  elements['temperature-control'].classList.toggle('hidden', !model.temperature);
  elements['model-note'].textContent = model.description;
  updateMode();
}

function updateMode() {
  const mode = currentMode();
  const labels = { chat: 'General assistant', knowledge: 'Knowledge search', vision: 'Image analysis', document: 'Document summary', meeting: 'Meeting notes' };
  elements['mode-label'].textContent = labels[mode];
  const accepts = {
    vision: 'image/png,image/jpeg,image/webp',
    document: '.pdf,.doc,.docx,.txt,.md,.csv,.ppt,.pptx,.xls,.xlsx',
    meeting: 'audio/*,video/mp4',
  };
  elements['file-input'].accept = accepts[mode] || '';
  elements['attachment-button'].disabled = !state.account || !accepts[mode] || (mode === 'document' && !isAdmin());
  state.image = null;
  elements['attachment-preview'].classList.add('hidden');
}

function isAdmin() {
  return state.authConfig?.disabled
    || state.account?.idTokenClaims?.roles?.includes(state.authConfig?.adminRole);
}

function updateComposer() {
  elements['send-button'].textContent = state.busy ? '■' : '↑';
  elements['send-button'].title = state.busy ? 'Stop response' : 'Send message';
  elements['send-button'].setAttribute('aria-label', state.busy ? 'Stop response' : 'Send message');
  elements['send-button'].disabled = !state.account || (!state.busy && (!elements['chat-input'].value.trim() || !state.conversationId));
}

function renderMessage(role, content, metadata = {}) {
  elements['welcome-state'].classList.add('hidden');
  const item = document.createElement('li');
  item.className = `message ${role}`;
  const avatar = document.createElement('span');
  avatar.className = 'message-avatar';
  avatar.textContent = role === 'assistant' ? 'CS' : 'YOU';
  const body = document.createElement('div');
  body.className = 'message-content';
  body.innerHTML = role === 'assistant'
    ? DOMPurify.sanitize(marked.parse(content))
    : DOMPurify.sanitize(content);
  if (metadata.citations?.length) {
    const citations = document.createElement('div');
    citations.className = 'citations';
    citations.textContent = `Sources: ${metadata.citations.map((item) => item.title || item.filepath || 'Document').join(', ')}`;
    body.appendChild(citations);
  }
  item.append(avatar, body);
  elements['chat-messages'].appendChild(item);
  elements['message-viewport'].scrollTop = elements['message-viewport'].scrollHeight;
  return { item, body };
}

async function streamChat(payload, onEvent, signal) {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (state.accessToken) headers.set('Authorization', `Bearer ${state.accessToken}`);
  const response = await fetch('/api/chat/stream', { method: 'POST', headers, body: JSON.stringify(payload), signal });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(errorMessage(body, response.status));
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split('\n\n');
    buffer = blocks.pop() || '';
    for (const block of blocks) {
      const data = block.split('\n').find((line) => line.startsWith('data: '));
      if (data) onEvent(JSON.parse(data.slice(6)));
    }
  }
}

async function loadModels() {
  const response = await fetch('/api/models');
  const { models, defaultModel } = await response.json();
  state.models = models;
  state.defaultModel = defaultModel;
  elements['model-select'].replaceChildren(...models.map((model) => new Option(model.label, model.id)));
  elements['model-select'].value = defaultModel;
  updateCapabilities();
}

async function loadConversations() {
  const data = await apiFetch('/api/conversations');
  elements['conversation-list'].replaceChildren();
  if (!data.conversations.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-copy';
    empty.textContent = 'No saved conversations yet.';
    elements['conversation-list'].appendChild(empty);
    return;
  }
  data.conversations.forEach((conversation) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `conversation-item${conversation.id === state.conversationId ? ' active' : ''}`;
    button.innerHTML = `<strong></strong><small></small>`;
    button.querySelector('strong').textContent = conversation.title;
    button.querySelector('small').textContent = `${conversation.mode} · ${conversation.model}`;
    button.addEventListener('click', () => openConversation(conversation.id));
    elements['conversation-list'].appendChild(button);
  });
}

async function createConversation() {
  const model = elements['model-select'].value || state.defaultModel;
  const conversation = await apiFetch('/api/conversations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'New conversation', model, mode: currentMode() }),
  });
  state.conversationId = conversation.id;
  elements['conversation-title'].textContent = conversation.title;
  elements['chat-messages'].replaceChildren();
  elements['welcome-state'].classList.remove('hidden');
  await loadConversations();
  updateComposer();
  setAuthenticated(state.account, state.accessToken);
}

async function openConversation(id) {
  const conversation = await apiFetch(`/api/conversations/${id}`);
  const selection = reconcileConversationSelection({
    modelId: conversation.model,
    mode: conversation.mode,
    models: state.models,
    defaultModel: state.defaultModel,
  });
  state.conversationId = id;
  elements['conversation-title'].textContent = conversation.title;
  elements['model-select'].value = selection.modelId;
  const mode = document.querySelector(`input[name="mode"][value="${selection.mode}"]`);
  if (mode) mode.checked = true;
  elements['chat-messages'].replaceChildren();
  conversation.messages.forEach((message) => renderMessage(message.role, message.content, message.metadata));
  updateCapabilities();
  await loadConversations();
  updateComposer();
  setAuthenticated(state.account, state.accessToken);
}

async function sendMessage(event) {
  event.preventDefault();
  if (state.busy) {
    state.requestController?.abort();
    return;
  }
  const message = elements['chat-input'].value.trim();
  if (!message || !state.conversationId || state.busy) return;
  renderMessage('user', message);
  elements['chat-input'].value = '';
  state.busy = true;
  state.requestController = new AbortController();
  updateComposer();
  let assistantText = '';
  const assistant = renderMessage('assistant', '');
  try {
    await streamChat({
      conversationId: state.conversationId,
      message,
      model: elements['model-select'].value,
      mode: currentMode(),
      systemMessage: elements['system-message'].value,
      maxTokens: elements['max-tokens'].value,
      temperature: elements.temperature.value,
      image: state.image,
    }, (streamEvent) => {
      if (streamEvent.type === 'content') {
        assistantText += streamEvent.content;
        assistant.body.innerHTML = DOMPurify.sanitize(marked.parse(assistantText));
      }
      if (streamEvent.type === 'usage' && streamEvent.usage?.total_tokens) {
        elements['token-usage'].textContent = `${streamEvent.usage.total_tokens} tokens`;
      }
      if (streamEvent.type === 'done' && streamEvent.citations?.length) {
        const citations = document.createElement('div');
        citations.className = 'citations';
        citations.textContent = `Sources: ${streamEvent.citations.map((item) => item.title || item.filepath || 'Document').join(', ')}`;
        assistant.body.appendChild(citations);
      }
      if (streamEvent.type === 'error') throw new Error('The response stream ended unexpectedly.');
      elements['message-viewport'].scrollTop = elements['message-viewport'].scrollHeight;
    }, state.requestController.signal);
    state.image = null;
    elements['attachment-preview'].classList.add('hidden');
    await loadConversations();
  } catch (error) {
    if (error.name === 'AbortError') {
      assistant.item.remove();
      showToast('Response stopped.');
    } else {
      assistant.item.remove();
      showToast(error.message);
    }
  } finally {
    state.busy = false;
    state.requestController = null;
    updateComposer();
  }
}

async function handleAttachment(file) {
  if (!file) return;
  if (currentMode() === 'vision') {
    state.image = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    elements['attachment-preview'].textContent = `Image attached: ${file.name}`;
    elements['attachment-preview'].classList.remove('hidden');
    return;
  }

  const target = currentMode() === 'meeting' ? '/upload-audio' : '/upload';
  const form = new FormData();
  form.append('file', file);
  const result = await apiFetch(target, { method: 'POST', body: form });
  elements['attachment-preview'].textContent = `${file.name} is ready.`;
  elements['attachment-preview'].classList.remove('hidden');
  if (result.text) elements['chat-input'].value = result.text;
  updateComposer();
}

async function loadFiles() {
  const data = await apiFetch('/listfiles');
  const files = Array.isArray(data.detail) ? data.detail : [];
  elements['file-list'].replaceChildren(...files.map((file) => {
    const item = document.createElement('li');
    const name = file.name || file;
    const label = document.createElement('span');
    label.textContent = name;
    item.appendChild(label);
    if (isAdmin()) {
      const remove = document.createElement('button');
      remove.className = 'text-button';
      remove.textContent = 'Delete';
      remove.addEventListener('click', async () => {
        await apiFetch(`/deletefile/${encodeURIComponent(name)}`, { method: 'DELETE' });
        await loadFiles();
      });
      item.appendChild(remove);
    }
    return item;
  }));
}

async function initializeAuth() {
  const response = await fetch('/api/config');
  const { auth, logLevel, providerSettingsEnabled } = await response.json();
  state.authConfig = { ...auth, logLevel, providerSettingsEnabled };
  if (auth.disabled) {
    setAuthenticated({ name: 'Local Developer', idTokenClaims: { roles: [auth.adminRole] } }, null);
    await loadConversations();
    return;
  }
  if (!auth.tenantId || !auth.clientId || !auth.scope) return;
  authClient = new msal.PublicClientApplication({
    auth: {
      clientId: auth.clientId,
      authority: `https://login.microsoftonline.com/${auth.tenantId}`,
      redirectUri: `${location.origin}/auth/callback.html`,
      navigateToLoginRequestUrl: false,
    },
    cache: { cacheLocation: 'localStorage', storeAuthStateInCookie: false },
    system: {
      loggerOptions: {
        logLevel: logLevel === 'debug' ? msal.LogLevel.Verbose : msal.LogLevel.Warning,
        loggerCallback(level, message, containsPii) {
          if (!containsPii && logLevel === 'debug') console.debug(`[MSAL:${level}] ${message}`);
        },
      },
    },
  });
  await authClient.initialize();
  const account = authClient.getActiveAccount() || authClient.getAllAccounts()[0];
  if (account) {
    authClient.setActiveAccount(account);
    try {
      await activateAccount(account);
    } catch (error) {
      console.debug('[MSAL] Cached account requires a new interactive sign-in.', error.errorCode || error.message);
      logClientEvent('auth.cached_token.failed', { errorCode: error.errorCode || 'unknown' });
      setAuthenticated(null, null);
    }
  }
}

async function activateAccount(account) {
  try {
    const token = await authClient.acquireTokenSilent({ account, scopes: [state.authConfig.scope] });
    setAuthenticated(account, token.accessToken);
    await loadConversations();
  } catch (error) {
    if (!(error instanceof msal.InteractionRequiredAuthError)) throw error;
    logClientEvent('auth.token.redirect.required', { errorCode: error.errorCode || 'interaction_required' });
    await authClient.acquireTokenRedirect({ account, scopes: [state.authConfig.scope] });
  }
}

async function signIn() {
  elements['sign-in-button'].disabled = true;
  elements['sign-in-button'].textContent = 'Signing in...';
  logClientEvent('auth.sign_in.redirect.started');
  await authClient.loginRedirect({ scopes: [state.authConfig.scope] });
}

function bindEvents() {
  prompts.forEach((prompt) => {
    const button = document.createElement('button');
    button.className = 'prompt-card';
    button.type = 'button';
    button.textContent = prompt;
    button.addEventListener('click', () => {
      elements['chat-input'].value = prompt;
      updateComposer();
    });
    elements['prompt-grid'].appendChild(button);
  });
  elements['chat-input'].addEventListener('input', updateComposer);
  elements['chat-input'].addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); elements['chat-form'].requestSubmit(); }
  });
  elements['chat-form'].addEventListener('submit', sendMessage);
  elements['new-conversation'].addEventListener('click', () => createConversation().catch((error) => showToast(error.message)));
  elements['rename-conversation'].addEventListener('click', async () => {
    const title = window.prompt('Conversation name', elements['conversation-title'].textContent)?.trim();
    if (!title) return;
    await apiFetch(`/api/conversations/${state.conversationId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }),
    });
    elements['conversation-title'].textContent = title;
    await loadConversations();
  });
  elements['clear-conversation'].addEventListener('click', async () => {
    await apiFetch(`/api/conversations/${state.conversationId}/messages`, { method: 'DELETE' });
    elements['chat-messages'].replaceChildren();
    elements['welcome-state'].classList.remove('hidden');
  });
  elements['delete-conversation'].addEventListener('click', async () => {
    await apiFetch(`/api/conversations/${state.conversationId}`, { method: 'DELETE' });
    state.conversationId = null;
    elements['conversation-title'].textContent = 'New conversation';
    elements['chat-messages'].replaceChildren();
    elements['welcome-state'].classList.remove('hidden');
    await loadConversations();
    setAuthenticated(state.account, state.accessToken);
  });
  elements['model-select'].addEventListener('change', updateCapabilities);
  elements['mode-picker'].addEventListener('change', updateMode);
  elements['max-tokens'].addEventListener('input', () => { elements['max-tokens-value'].value = elements['max-tokens'].value; });
  elements.temperature.addEventListener('input', () => { elements['temperature-value'].value = elements.temperature.value; });
  elements['attachment-button'].addEventListener('click', () => elements['file-input'].click());
  elements['file-input'].addEventListener('change', (event) => handleAttachment(event.target.files[0]).catch((error) => showToast(error.message)));
  elements['details-toggle'].addEventListener('click', () => elements['details-panel'].classList.toggle('open'));
  elements['details-close'].addEventListener('click', () => elements['details-panel'].classList.remove('open'));
  elements['navigation-toggle'].addEventListener('click', () => elements['navigation-panel'].classList.toggle('open'));
  elements['knowledge-toggle'].addEventListener('click', async () => { elements['knowledge-dialog'].showModal(); await loadFiles(); });
  elements['knowledge-close'].addEventListener('click', () => elements['knowledge-dialog'].close());
  elements['account-menu-toggle'].addEventListener('click', () => {
    const open = elements['account-menu-items'].classList.toggle('hidden');
    elements['account-menu-toggle'].setAttribute('aria-expanded', String(!open));
  });
  elements['profile-toggle'].addEventListener('click', async () => {
    closeAccountMenu();
    const profile = await apiFetch('/api/profile');
    renderProfile(profile);
    elements['profile-dialog'].showModal();
  });
  elements['profile-close'].addEventListener('click', () => elements['profile-dialog'].close());
  elements['provider-settings-toggle'].addEventListener('click', () => {
    closeAccountMenu();
    openProviderSettings().catch((error) => showToast(error.message));
  });
  elements['provider-settings-close'].addEventListener('click', () => elements['provider-settings-dialog'].close());
  elements['provider-settings-form'].addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const settings = await apiFetch('/api/provider-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: elements['provider-select'].value,
          endpoint: elements['provider-endpoint'].value,
          deploymentName: elements['provider-deployment'].value,
          modelId: elements['provider-model'].value,
          apiKey: elements['provider-api-key'].value,
        }),
      });
      elements['provider-endpoint'].value = settings.settings.endpoint;
      elements['provider-deployment'].value = settings.settings.deploymentName;
      elements['provider-model'].value = settings.settings.modelId;
      elements['provider-api-key'].value = '';
      showToast('Provider settings saved.');
    } catch (error) {
      showToast(error.message);
    }
  });
  elements['refresh-files'].addEventListener('click', () => loadFiles().catch((error) => showToast(error.message)));
  elements['upload-button'].addEventListener('click', () => elements['file-input'].click());
  elements['sign-in-button'].addEventListener('click', async () => {
    try {
      await signIn();
    } catch (error) {
      console.debug('[MSAL] Interactive sign-in failed.', error.errorCode || error.message);
      logClientEvent('auth.sign_in.failed', { errorCode: error.errorCode || 'unknown' });
      showToast(error.errorMessage || error.message || 'Sign-in failed.');
    }
  });
  elements['sign-out-button'].addEventListener('click', () => {
    closeAccountMenu();
    authClient?.logoutRedirect({ postLogoutRedirectUri: location.origin });
  });
  document.addEventListener('click', (event) => {
    if (!elements['account-menu'].contains(event.target)) closeAccountMenu();
  });
}

async function main() {
  bindEvents();
  await loadModels();
  await initializeAuth();
  elements['upload-button'].disabled = !isAdmin();
  elements['refresh-files'].disabled = !state.account;
  elements['knowledge-role-note'].textContent = isAdmin()
    ? 'You can add or remove shared documents.'
    : 'You can use approved shared documents. An administrator manages this collection.';
}

main().catch((error) => showToast(error.message));