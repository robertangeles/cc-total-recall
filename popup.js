// popup.js — Total Recall popup logic.
// State machine + UI rendering. Hand-holding copy lives in COPY constants
// near the top so it's easy to tune.

import {
  saveFolderHandle,
  getFolderHandle,
  initBrain,
  appendToBrain,
  readBrain
} from './storage.js';

const BRAIN_CACHE_KEY = 'brain-cache';

// In-memory cache of the granted directory handle.
let currentHandle = null;

// --- Copy ------------------------------------------------------------------
// All user-facing strings live here. Year-6 reading level: short sentences,
// concrete nouns, friendly tone, no jargon.

const COPY = {
  actionDescriptions: {
    choose: 'Pick any folder on your computer. Total Recall will create a file called BRAIN.md inside it.',
    configure: 'Set up the AI helper that reads your chats and extracts your decisions.',
    reconnect: 'Browsers drop the folder link when this popup closes. One click puts it back.',
    extract: 'Read the current AI chat and save the decisions to BRAIN.md.',
    copyBrain: 'Copy your decision history. Paste it into any new AI chat to pick up where you left off.'
  },
  status: {
    folderNone: 'Brain folder: not connected',
    folderReconnect: (name) => `Brain folder: ${name} — reconnect needed`,
    folderReady: (name) => `Brain folder: ${name}`,
    providerNone: 'Engram: not configured',
    providerNoKey: (label) => `Engram: ${label} — key missing`,
    providerReady: (label) => `Engram: ${label}`
  },
  messages: {
    folderConnected: 'Folder connected — BRAIN.md ready',
    folderInitFailed: 'Folder connected, but BRAIN.md could not be created. Try Reconnect.',
    pickerFailed: 'Could not open the folder picker. Your browser may have blocked it.',
    reconnected: 'Reconnected — BRAIN.md ready',
    permissionDenied: 'Permission denied. Click Reconnect to try again.',
    noActiveTab: 'No active tab found.',
    notSupportedTab: 'Open a Claude, ChatGPT, Gemini, or DeepSeek chat first.',
    noConversation: 'Nothing to read on this page. Open an AI chat with some history.',
    experimentalPlatform: 'Extract is verified on Claude.ai only in v0.1. ChatGPT, Gemini, and DeepSeek are experimental — try Copy Brain instead.',
    needFolder: 'Pick a brain folder first.',
    needProvider: 'Set up an AI provider in Settings first.',
    needKey: (label) => `Add your ${label} key in Settings first.`,
    nothingToCapture: 'No decisions in this chat worth saving.',
    appendFailed: 'Could not save to BRAIN.md. Try Reconnect, then Extract Now again.',
    extractFailed: 'Extraction ran into a problem. See the popup console for details.',
    engramNetwork: 'Could not reach the AI provider. Check your internet.',
    engramKeyRejected: 'Your API key was rejected. Check it in Settings.',
    engramNoCredit: 'Your AI provider account has no credit.',
    engramNoModelAccess: 'Your API key does not have access to this model.',
    engramModelNotFound: 'Model not found. Pick another in Settings.',
    engramRateLimit: 'Rate limit hit. Wait a moment and try again.',
    engramProviderDown: 'AI provider is having issues. Try again in a moment.',
    engramHttp: (status) => `AI provider returned HTTP ${status}. See popup console.`,
    engramBadResponse: 'AI provider sent an unexpected response. See popup console.',
    engramMalformed: 'AI response failed safety check. See popup console.',
    engramUnknown: 'Engram failed. See popup console for details.',
    saved: 'Saved to BRAIN.md',
    copied: (platform) => `Copied — ready to paste into ${platform === 'default' ? 'any AI chat' : 'this chat'}.`,
    brainEmpty: 'Your BRAIN.md is empty. Run Extract Now first.',
    copyFailed: 'Could not copy to clipboard.',
    settingsSaved: 'Settings saved',
    keyRequired: 'API key is required.',
    keyInvalid: (label) => `Key does not match ${label} format.`,
    testOk: (label) => `${label} responded with a valid entry`,
    testFailed: 'Test call returned no entry. See popup console for the API response.',
    testThrown: 'Test failed. See popup console for details.',
    testNeedKey: 'Enter an API key first.'
  }
};

// --- Provider metadata (display-side) --------------------------------------

const PROVIDER_INFO = {
  anthropic: {
    label: 'Anthropic Claude',
    keyRequired: true,
    keyPlaceholder: 'sk-ant-...',
    defaultModel: 'claude-haiku-4-5-20251001',
    altModels: [
      { id: 'claude-sonnet-4-6-20251001', label: 'Claude Sonnet 4.6 — higher quality, costs more' },
      { id: 'claude-opus-4-7',            label: 'Claude Opus 4.7 — top quality, overkill for Engram' }
    ],
    helpHtml: `<strong>Get an API key</strong>
      <ol>
        <li>Open <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">console.anthropic.com/settings/keys</a></li>
        <li>Sign in or sign up</li>
        <li>Click <em>Create Key</em>, name it "Total Recall"</li>
        <li>Copy the key (starts with <code>sk-ant-</code>) and paste it above</li>
      </ol>
      <strong>Model</strong>
      The dropdown lists the small fast Haiku as the default (recommended for Engram) plus larger options. Full catalogue: <a href="https://docs.anthropic.com/en/docs/about-claude/models" target="_blank" rel="noopener">Anthropic's models docs</a>.`
  },
  openai: {
    label: 'OpenAI',
    keyRequired: true,
    keyPlaceholder: 'sk-...',
    defaultModel: 'gpt-4o-mini',
    altModels: [
      { id: 'gpt-4o',         label: 'GPT-4o — higher quality, costs more' },
      { id: 'gpt-4.1-mini',   label: 'GPT-4.1 mini — newer small model' }
    ],
    helpHtml: `<strong>Get an API key</strong>
      <ol>
        <li>Open <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener">platform.openai.com/api-keys</a></li>
        <li>Sign in</li>
        <li>Click <em>Create new secret key</em></li>
        <li>Copy the key (starts with <code>sk-</code>) and paste it above</li>
      </ol>
      <strong>Model</strong>
      The dropdown lists <code>gpt-4o-mini</code> as the default (recommended for Engram). Full catalogue: <a href="https://platform.openai.com/docs/models" target="_blank" rel="noopener">OpenAI's models docs</a>.`
  },
  openrouter: {
    label: 'OpenRouter',
    keyRequired: true,
    keyPlaceholder: 'sk-or-...',
    defaultModel: 'anthropic/claude-haiku-4-5',
    altModels: [
      { id: 'openai/gpt-4o-mini',                   label: 'OpenAI GPT-4o mini — small, cheap' },
      { id: 'google/gemini-flash-1.5',              label: 'Google Gemini Flash 1.5 — small, cheap' },
      { id: 'meta-llama/llama-3.2-3b-instruct',     label: 'Llama 3.2 3B — open-source, ~free' },
      { id: 'anthropic/claude-sonnet-4-6',          label: 'Claude Sonnet 4.6 — higher quality, costs more' }
    ],
    helpHtml: `<strong>Get an API key</strong>
      <ol>
        <li>Open <a href="https://openrouter.ai/keys" target="_blank" rel="noopener">openrouter.ai/keys</a></li>
        <li>Sign in</li>
        <li>Click <em>Create Key</em></li>
        <li>Copy the key (starts with <code>sk-or-</code>) and paste it above</li>
      </ol>
      <strong>Model</strong>
      OpenRouter uses <code>provider/model</code> slugs. The dropdown lists Claude Haiku as the default plus a few cheap alternatives. Full catalogue: <a href="https://openrouter.ai/models" target="_blank" rel="noopener">openrouter.ai/models</a>.`
  },
  ollama: {
    label: 'Ollama (local)',
    keyRequired: false,
    keyPlaceholder: '(not needed for Ollama)',
    defaultModel: 'llama3.2:3b',
    altModels: [
      { id: 'qwen2.5:3b',     label: 'Qwen 2.5 3B — Alibaba small, very good at instructions' },
      { id: 'gemma2:2b',      label: 'Gemma 2 2B — Google smallest open' },
      { id: 'phi3.5:3.8b',    label: 'Phi 3.5 mini — Microsoft small' }
    ],
    helpHtml: `<strong>Ollama runs locally — no key needed.</strong>
      <ol>
        <li>Install Ollama from <a href="https://ollama.com/download" target="_blank" rel="noopener">ollama.com/download</a></li>
        <li>In your terminal, run <code>ollama pull llama3.2:3b</code> (or whichever model you pick)</li>
        <li>Click <em>Test connection</em> to check that Ollama is running</li>
      </ol>
      <strong>Model</strong>
      Pick from the dropdown — but remember to <code>ollama pull &lt;model&gt;</code> first. Full catalogue: <a href="https://ollama.com/library" target="_blank" rel="noopener">ollama.com/library</a>.`
  }
};

// --- DOM refs --------------------------------------------------------------

const $ = (id) => document.getElementById(id);
const mainView       = $('mainView');
const settingsView   = $('settingsView');
const helpView       = $('helpView');
const settingsToggle = $('settingsToggle');
const helpToggle     = $('helpToggle');
const backBtn        = $('backBtn');
const helpBackBtn    = $('helpBackBtn');

const welcomeCard    = $('welcomeCard');
const welcomeHelpLink = $('welcomeHelpLink');

const folderDot      = $('folderDot');
const folderStatus   = $('folderStatus');
const providerDot    = $('providerDot');
const providerStatus = $('providerStatus');
const actionsArea    = $('actionsArea');
const metaEl         = $('meta');

const providerSelect    = $('providerSelect');
const apiKeyInput       = $('apiKeyInput');
const apiKeyToggle      = $('apiKeyToggle');
const apiKeyValidation  = $('apiKeyValidation');
const modelSelect       = $('modelSelect');
const modelInput        = $('modelInput');
const modelCustomToggle = $('modelCustomToggle');
const providerHelp      = $('providerHelp');
const testConnBtn       = $('testConnBtn');
const saveSettingsBtn   = $('saveSettingsBtn');

const messageEl = $('message');

// --- UI helpers ------------------------------------------------------------

let messageTimer = null;
function showMessage(text, kind = 'info', stickyMs = 3500) {
  if (messageTimer) clearTimeout(messageTimer);
  messageEl.textContent = text;
  messageEl.className = `message message-${kind}`;
  messageTimer = setTimeout(() => {
    messageEl.textContent = '';
    messageEl.className = 'message';
    messageTimer = null;
  }, stickyMs);
}

function setStatus(dotEl, textEl, state, text) {
  dotEl.className = `dot dot-${state}`;
  textEl.textContent = text;
}

function showMain() {
  mainView.hidden = false;
  settingsView.hidden = true;
  helpView.hidden = true;
  render();
}

async function showSettings() {
  mainView.hidden = true;
  settingsView.hidden = false;
  helpView.hidden = true;
  const stored = await chrome.storage.local.get(['llm-provider', 'llm-api-key', 'llm-model']);
  providerSelect.value = stored['llm-provider'] || 'anthropic';
  apiKeyInput.value = stored['llm-api-key'] || '';
  updateProviderUI();
  applyStoredModel(stored['llm-model'] || '');
}

function showHelp() {
  mainView.hidden = true;
  settingsView.hidden = true;
  helpView.hidden = false;
  helpView.scrollTop = 0;
}

function updateProviderUI() {
  const info = PROVIDER_INFO[providerSelect.value];
  apiKeyInput.placeholder = info.keyPlaceholder;
  apiKeyInput.disabled = !info.keyRequired;
  providerHelp.innerHTML = info.helpHtml;
  modelInput.placeholder = info.defaultModel;
  rebuildModelSelect(info);
  setModelMode('select');
  validateApiKeyLive();
}

function rebuildModelSelect(info) {
  modelSelect.innerHTML = '';
  const defaultOpt = document.createElement('option');
  defaultOpt.value = '';
  defaultOpt.textContent = `Default — ${info.defaultModel}`;
  modelSelect.appendChild(defaultOpt);
  (info.altModels || []).forEach((m) => {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = m.label;
    modelSelect.appendChild(opt);
  });
}

function applyStoredModel(storedModel) {
  if (!storedModel) {
    modelSelect.value = '';
    modelInput.value = '';
    setModelMode('select');
    return;
  }
  const options = Array.from(modelSelect.options).map((o) => o.value);
  if (options.includes(storedModel)) {
    modelSelect.value = storedModel;
    modelInput.value = '';
    setModelMode('select');
  } else {
    modelInput.value = storedModel;
    setModelMode('custom');
  }
}

function setModelMode(mode) {
  if (mode === 'custom') {
    modelSelect.hidden = true;
    modelInput.hidden = false;
    modelCustomToggle.textContent = 'Choose from list';
  } else {
    modelSelect.hidden = false;
    modelInput.hidden = true;
    modelCustomToggle.textContent = 'Use custom model ID';
  }
}

function getSelectedModel() {
  return !modelInput.hidden ? modelInput.value.trim() : modelSelect.value;
}

async function validateApiKeyLive() {
  const provider = providerSelect.value;
  const info = PROVIDER_INFO[provider];
  const key = apiKeyInput.value.trim();
  if (!info.keyRequired) {
    apiKeyValidation.textContent = '';
    apiKeyValidation.className = 'hint';
    return;
  }
  if (!key) {
    apiKeyValidation.textContent = '';
    apiKeyValidation.className = 'hint';
    return;
  }
  const engram = await import(chrome.runtime.getURL('engram.js'));
  if (engram.validateApiKey(provider, key)) {
    apiKeyValidation.textContent = '✓ Key format looks valid';
    apiKeyValidation.className = 'hint hint-ok';
  } else {
    apiKeyValidation.textContent = `✗ Does not match ${info.label} key format`;
    apiKeyValidation.className = 'hint hint-error';
  }
}

// --- State derivation ------------------------------------------------------

async function getState() {
  const handle = await getFolderHandle();
  let folderState = 'none';
  let folderName = null;
  if (handle) {
    folderName = handle.name;
    try {
      const perm = await handle.queryPermission({ mode: 'readwrite' });
      folderState = perm === 'granted' ? 'granted' : 'prompt';
    } catch {
      folderState = 'prompt';
    }
  }

  const stored = await chrome.storage.local.get(['llm-provider', 'llm-api-key', 'last-extracted-at']);
  const provider = stored['llm-provider'];
  const apiKey = stored['llm-api-key'];
  const lastExtractedAt = stored['last-extracted-at'] || null;

  let providerReady = false;
  if (provider && PROVIDER_INFO[provider]) {
    if (PROVIDER_INFO[provider].keyRequired) {
      providerReady = !!apiKey;
    } else {
      providerReady = true;
    }
  }

  return { folderState, folderName, handle, provider, providerReady, lastExtractedAt };
}

// --- Render ----------------------------------------------------------------

async function render() {
  const state = await getState();

  // Welcome card — show only when truly nothing is set up yet.
  const isFirstRun = state.folderState === 'none' && !state.provider;
  welcomeCard.hidden = !isFirstRun;

  // Folder row
  if (state.folderState === 'none') {
    setStatus(folderDot, folderStatus, 'off', COPY.status.folderNone);
  } else if (state.folderState === 'prompt') {
    setStatus(folderDot, folderStatus, 'warn', COPY.status.folderReconnect(state.folderName));
    currentHandle = null;
  } else {
    setStatus(folderDot, folderStatus, 'on', COPY.status.folderReady(state.folderName));
    currentHandle = state.handle;
  }

  // Provider row
  if (!state.provider) {
    setStatus(providerDot, providerStatus, 'off', COPY.status.providerNone);
  } else if (!state.providerReady) {
    setStatus(providerDot, providerStatus, 'warn', COPY.status.providerNoKey(PROVIDER_INFO[state.provider].label));
  } else {
    setStatus(providerDot, providerStatus, 'on', COPY.status.providerReady(PROVIDER_INFO[state.provider].label));
  }

  // Actions
  actionsArea.innerHTML = '';
  if (state.folderState === 'none') {
    addAction('Choose Brain Folder', 'btn-primary', pickFolder, COPY.actionDescriptions.choose);
  } else if (state.folderState === 'prompt') {
    addAction('Reconnect', 'btn-primary', reconnectFolder, COPY.actionDescriptions.reconnect);
  } else if (!state.providerReady) {
    addAction('Configure Engram', 'btn-primary', showSettings, COPY.actionDescriptions.configure);
  } else {
    addAction('Extract Now', 'btn-primary', extractNow, COPY.actionDescriptions.extract);
    addAction('Copy Brain', 'btn-secondary', copyBrain, COPY.actionDescriptions.copyBrain);
  }

  // Meta
  if (state.lastExtractedAt) {
    const d = new Date(state.lastExtractedAt);
    metaEl.textContent = `Last extracted: ${formatRelativeTime(d)}`;
  } else {
    metaEl.textContent = '';
  }
}

function addAction(label, klass, handler, description) {
  const wrap = document.createElement('div');
  wrap.className = 'action-wrap';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = klass;
  btn.textContent = label;
  btn.addEventListener('click', () => handler(btn));
  wrap.appendChild(btn);

  if (description) {
    const desc = document.createElement('p');
    desc.className = 'action-description';
    desc.textContent = description;
    wrap.appendChild(desc);
  }
  actionsArea.appendChild(wrap);
}

function formatRelativeTime(d) {
  const diff = Date.now() - d.getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

// --- Brain cache sync ------------------------------------------------------

async function refreshBrainCache(handle) {
  try {
    const content = await readBrain(handle);
    await chrome.storage.local.set({ [BRAIN_CACHE_KEY]: content || '' });
    return true;
  } catch (err) {
    console.error('[Total Recall] refreshBrainCache failed:', err);
    return false;
  }
}

// --- Actions ---------------------------------------------------------------

async function pickFolder(btn) {
  if (btn) btn.disabled = true;
  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    const saved = await saveFolderHandle(handle);
    if (!saved) {
      showMessage(COPY.messages.appendFailed, 'error');
      return;
    }
    currentHandle = handle;
    const initialized = await initBrain(handle);
    if (!initialized) {
      showMessage(COPY.messages.folderInitFailed, 'error');
      return;
    }
    await refreshBrainCache(handle);
    showMessage(COPY.messages.folderConnected, 'success');
    render();
  } catch (err) {
    if (err && err.name === 'AbortError') return;
    console.error('[Total Recall] pickFolder failed:', err);
    showMessage(COPY.messages.pickerFailed, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function reconnectFolder(btn) {
  if (btn) btn.disabled = true;
  try {
    const handle = await getFolderHandle();
    if (!handle) {
      showMessage(COPY.messages.needFolder, 'error');
      render();
      return;
    }
    const state = await handle.requestPermission({ mode: 'readwrite' });
    if (state !== 'granted') {
      showMessage(COPY.messages.permissionDenied, 'error');
      return;
    }
    currentHandle = handle;
    const initialized = await initBrain(handle);
    if (initialized) {
      await refreshBrainCache(handle);
      showMessage(COPY.messages.reconnected, 'success');
    } else {
      showMessage(COPY.messages.folderInitFailed, 'error');
    }
    render();
  } catch (err) {
    console.error('[Total Recall] reconnectFolder failed:', err);
    showMessage(COPY.messages.appendFailed, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

function engramErrorMessage(result) {
  const r = result.reason;
  if (r === 'network') return COPY.messages.engramNetwork;
  if (r === 'malformed-entry') return COPY.messages.engramMalformed;
  if (r === 'invalid-response' || r === 'empty-response') return COPY.messages.engramBadResponse;
  if (r === 'http') {
    const s = result.status;
    if (s === 401 || s === 403) return COPY.messages.engramKeyRejected;
    if (s === 402) return COPY.messages.engramNoCredit;
    if (s === 404) return COPY.messages.engramModelNotFound;
    if (s === 429) return COPY.messages.engramRateLimit;
    if (s >= 500) return COPY.messages.engramProviderDown;
    return COPY.messages.engramHttp(s);
  }
  return COPY.messages.engramUnknown;
}

async function extractNow(btn) {
  if (!currentHandle) {
    showMessage(COPY.messages.needFolder, 'error');
    return;
  }

  const stored = await chrome.storage.local.get(['llm-provider', 'llm-api-key', 'llm-model']);
  const provider = stored['llm-provider'];
  const apiKey = stored['llm-api-key'];
  const model = stored['llm-model'] || undefined;
  if (!provider) {
    showMessage(COPY.messages.needProvider, 'error');
    return;
  }
  if (PROVIDER_INFO[provider].keyRequired && !apiKey) {
    showMessage(COPY.messages.needKey(PROVIDER_INFO[provider].label), 'error');
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Extracting…';
  }

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) {
      showMessage(COPY.messages.noActiveTab, 'error');
      return;
    }
    let extracted;
    try {
      extracted = await chrome.tabs.sendMessage(tab.id, { action: 'extract' });
    } catch (err) {
      showMessage(COPY.messages.notSupportedTab, 'error');
      return;
    }
    if (!extracted || !extracted.text) {
      // Distinguish "Claude page with no conversation" from "experimental platform
      // (chatgpt/gemini/deepseek) where selectors may be stale" from "wrong tab".
      const p = extracted && extracted.platform;
      if (p === 'chatgpt' || p === 'gemini' || p === 'deepseek') {
        showMessage(COPY.messages.experimentalPlatform, 'info', 6000);
      } else if (p === 'claude') {
        showMessage(COPY.messages.noConversation, 'error');
      } else {
        showMessage(COPY.messages.notSupportedTab, 'error');
      }
      return;
    }

    // Experimental platforms — let user know before spending API credits.
    if (extracted.platform === 'chatgpt' || extracted.platform === 'gemini' || extracted.platform === 'deepseek') {
      showMessage(COPY.messages.experimentalPlatform, 'info', 6000);
      // Still try — selectors may have happened to match, in which case extraction works.
    }

    const engram = await import(chrome.runtime.getURL('engram.js'));
    const result = await engram.extract({
      transcript: extracted.text,
      platform: extracted.platform,
      provider,
      apiKey: apiKey || 'ollama',
      model
    });

    if (result.kind === 'nothing') {
      showMessage(COPY.messages.nothingToCapture, 'info');
      return;
    }
    if (result.kind === 'error') {
      showMessage(engramErrorMessage(result), 'error', 5000);
      return;
    }
    // kind === 'entry'
    const appended = await appendToBrain(currentHandle, result.entry);
    if (!appended) {
      showMessage(COPY.messages.appendFailed, 'error');
      return;
    }

    await refreshBrainCache(currentHandle);
    await chrome.storage.local.set({ 'last-extracted-at': new Date().toISOString() });

    showMessage(COPY.messages.saved, 'success');
    render();
  } catch (err) {
    console.error('[Total Recall] extractNow failed:', err);
    showMessage(COPY.messages.extractFailed, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Extract Now';
    }
  }
}

async function copyBrain(btn) {
  if (!currentHandle) {
    showMessage(COPY.messages.needFolder, 'error');
    return;
  }
  if (btn) btn.disabled = true;
  try {
    const brain = await readBrain(currentHandle);
    if (!brain || !brain.trim()) {
      showMessage(COPY.messages.brainEmpty, 'error');
      return;
    }
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    let platform = 'default';
    if (tab && tab.url) {
      if (tab.url.includes('claude.ai')) platform = 'claude';
      else if (tab.url.includes('chatgpt.com')) platform = 'chatgpt';
      else if (tab.url.includes('gemini.google.com')) platform = 'gemini';
      else if (tab.url.includes('chat.deepseek.com')) platform = 'deepseek';
    }
    const templates = await import(chrome.runtime.getURL('templates.js'));
    const wrapped = templates.getTemplate(platform, brain);
    await navigator.clipboard.writeText(wrapped);
    showMessage(COPY.messages.copied(platform), 'success');
  } catch (err) {
    console.error('[Total Recall] copyBrain failed:', err);
    showMessage(COPY.messages.copyFailed, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function saveSettings() {
  const provider = providerSelect.value;
  const info = PROVIDER_INFO[provider];
  const apiKey = apiKeyInput.value.trim();
  const model = getSelectedModel();

  if (info.keyRequired) {
    if (!apiKey) {
      showMessage(COPY.messages.keyRequired, 'error');
      return;
    }
    const engram = await import(chrome.runtime.getURL('engram.js'));
    if (!engram.validateApiKey(provider, apiKey)) {
      showMessage(COPY.messages.keyInvalid(info.label), 'error');
      return;
    }
  }

  await chrome.storage.local.set({
    'llm-provider': provider,
    'llm-api-key': info.keyRequired ? apiKey : '',
    'llm-model': model
  });
  showMessage(COPY.messages.settingsSaved, 'success');
  showMain();
}

async function testConnection() {
  const provider = providerSelect.value;
  const info = PROVIDER_INFO[provider];
  const apiKey = apiKeyInput.value.trim();
  const model = getSelectedModel() || undefined;

  if (info.keyRequired && !apiKey) {
    showMessage(COPY.messages.testNeedKey, 'error');
    return;
  }

  testConnBtn.disabled = true;
  testConnBtn.textContent = 'Testing…';
  try {
    const engram = await import(chrome.runtime.getURL('engram.js'));
    if (info.keyRequired && !engram.validateApiKey(provider, apiKey)) {
      showMessage(COPY.messages.keyInvalid(info.label), 'error');
      return;
    }
    const result = await engram.extract({
      transcript: 'User: I am torn between two options. Should I pick X or Y?\n\nAssistant: Pick X because it has property Z that Y lacks. Reject Y because it has property W which is a dealbreaker for your use case.',
      platform: 'test',
      provider,
      apiKey: apiKey || 'ollama',
      model
    });
    if (result.kind === 'entry') {
      showMessage(COPY.messages.testOk(info.label), 'success', 5000);
    } else if (result.kind === 'nothing') {
      // Connection works; model just didn't extract anything from the test prompt.
      showMessage(`${info.label} responded — connection works.`, 'success', 5000);
    } else {
      // kind === 'error' — surface the specific reason
      showMessage(engramErrorMessage(result), 'error', 5000);
    }
  } catch (err) {
    console.error('[Total Recall] testConnection failed:', err);
    showMessage(COPY.messages.testThrown, 'error');
  } finally {
    testConnBtn.disabled = false;
    testConnBtn.textContent = 'Test connection';
  }
}

// --- Debug surface (kept for diagnostics) ----------------------------------

window.__totalRecall = {
  get handle() { return currentHandle; },
  read: () => currentHandle ? readBrain(currentHandle) : Promise.resolve(''),
  extract: async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) return null;
    try {
      return await chrome.tabs.sendMessage(tab.id, { action: 'extract' });
    } catch (err) {
      console.warn('[Total Recall] extract failed:', err?.message);
      return null;
    }
  }
};

// --- Wire up ---------------------------------------------------------------

settingsToggle.addEventListener('click', showSettings);
helpToggle.addEventListener('click', showHelp);
backBtn.addEventListener('click', showMain);
helpBackBtn.addEventListener('click', showMain);
if (welcomeHelpLink) {
  welcomeHelpLink.addEventListener('click', (e) => {
    e.preventDefault();
    showHelp();
  });
}
providerSelect.addEventListener('change', updateProviderUI);
apiKeyInput.addEventListener('input', validateApiKeyLive);
saveSettingsBtn.addEventListener('click', saveSettings);
testConnBtn.addEventListener('click', testConnection);

apiKeyToggle.addEventListener('click', () => {
  const showing = apiKeyInput.type === 'text';
  apiKeyInput.type = showing ? 'password' : 'text';
  apiKeyToggle.classList.toggle('is-visible', !showing);
  const label = showing ? 'Show API key' : 'Hide API key';
  apiKeyToggle.setAttribute('aria-label', label);
  apiKeyToggle.setAttribute('title', label);
});
modelCustomToggle.addEventListener('click', () => {
  const isCustom = !modelInput.hidden;
  setModelMode(isCustom ? 'select' : 'custom');
  if (!isCustom && !modelInput.value) {
    modelInput.value = modelSelect.value || PROVIDER_INFO[providerSelect.value].defaultModel;
  }
});

render();
