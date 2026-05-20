// content.js — Total Recall content script.
// Reads AI conversations from the DOM. Sends transcripts to the service worker / popup.
// Auto-injects BRAIN.md context into new Claude.ai conversations.

(function () {
  'use strict';

  const PLATFORM = detectPlatform();

  function detectPlatform() {
    const host = window.location.hostname;
    if (host.includes('claude.ai')) return 'claude';
    if (host.includes('chatgpt.com')) return 'chatgpt';
    if (host.includes('gemini.google.com')) return 'gemini';
    if (host.includes('chat.deepseek.com')) return 'deepseek';
    return 'unknown';
  }

  // ── Conversation extraction ──────────────────────────────────────────────
  // Selectors verified against current platform DOMs.
  // Claude.ai (2026-05-20): class-based — !font-user-message + font-claude-response.
  // The other three platforms are still spec-baseline and need verification before v0.2.
  const SELECTORS = {
    claude: {
      combined: '[class~="!font-user-message"], .font-claude-response',
      roleOf: (el) => el.classList.contains('font-claude-response') ? 'Assistant' : 'User'
    },
    chatgpt: {
      combined: '[data-message-author-role]',
      roleOf: (el) => el.getAttribute('data-message-author-role') === 'user' ? 'User' : 'Assistant'
    },
    gemini: {
      combined: '.user-query-text, .model-response-text',
      roleOf: (el) => el.classList.contains('user-query-text') ? 'User' : 'Assistant'
    },
    deepseek: {
      combined: '.user-message, .assistant-message',
      roleOf: (el) => el.classList.contains('user-message') ? 'User' : 'Assistant'
    }
  };

  function extractConversation() {
    const config = SELECTORS[PLATFORM];
    if (!config) return null;

    const elements = document.querySelectorAll(config.combined);
    if (!elements.length) return null;

    let transcript = '';
    elements.forEach((el) => {
      const role = config.roleOf(el);
      const text = (el.innerText || '').trim();
      if (text) {
        transcript += `${role}: ${text}\n\n`;
      }
    });

    return transcript.trim() || null;
  }

  // ── Claude.ai auto-inject ────────────────────────────────────────────────
  // Inlined Claude wrapper. Duplicates templates.js#claude on purpose — content
  // scripts can't cleanly import ES modules from extension origin without CSP gymnastics.
  function wrapClaude(brain) {
    return `<context>\n${brain}\n</context>\n\nI am continuing work on the above context. Treat all decisions as constraints not suggestions. Do not re-propose anything listed under Rejected.`;
  }

  // Belt-and-suspenders host check. manifest.matches already limits where
  // content.js runs, but if a future config change loosens that, this catches
  // accidental injection into lookalike domains (e.g. claude.ai.attacker.com).
  const EXPECTED_HOSTS = {
    claude: 'claude.ai',
    chatgpt: 'chatgpt.com',
    gemini: 'gemini.google.com',
    deepseek: 'chat.deepseek.com'
  };

  function isLegitimateHost() {
    const expected = EXPECTED_HOSTS[PLATFORM];
    return expected && location.hostname === expected;
  }

  function isClaudeNewConversation() {
    if (PLATFORM !== 'claude') return false;
    if (!isLegitimateHost()) return false;
    const path = location.pathname;
    if (path !== '/new' && path !== '/') return false;
    // Also require zero existing turns — guards against SPA mid-transition states.
    const turnCount = document.querySelectorAll(SELECTORS.claude.combined).length;
    return turnCount === 0;
  }

  function findClaudeInput() {
    // Try the spec selector first, then ProseMirror (Claude's editor lib), then any contenteditable.
    return document.querySelector('[contenteditable="true"][data-placeholder]')
        || document.querySelector('div.ProseMirror[contenteditable="true"]')
        || document.querySelector('[contenteditable="true"]');
  }

  async function waitForInput(timeoutMs = 5000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const input = findClaudeInput();
      if (input) return input;
      await new Promise((r) => setTimeout(r, 200));
    }
    return null;
  }

  async function injectIntoClaudeInput(text) {
    const input = await waitForInput();
    if (!input) {
      console.warn('[Total Recall] Claude input not found');
      return false;
    }
    if ((input.innerText || '').trim()) {
      // Don't clobber whatever the user has already typed.
      console.log('[Total Recall] input non-empty, skipping auto-inject');
      return false;
    }
    input.focus();
    const inserted = document.execCommand('insertText', false, text);
    if (!inserted) {
      input.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        cancelable: true,
        inputType: 'insertText',
        data: text
      }));
    }
    return true;
  }

  let injectedForUrl = null;

  async function maybeAutoInject() {
    if (PLATFORM !== 'claude') return;
    if (!isClaudeNewConversation()) return;
    if (injectedForUrl === location.href) return;

    let response;
    try {
      response = await chrome.runtime.sendMessage({ action: 'get-brain' });
    } catch (err) {
      console.warn('[Total Recall] get-brain failed:', err?.message);
      return;
    }
    const brain = response && response.brain;
    if (!brain || !brain.trim()) return;

    const ok = await injectIntoClaudeInput(wrapClaude(brain));
    if (ok) {
      injectedForUrl = location.href;
      console.log('[Total Recall] BRAIN.md auto-injected');
    }
  }

  // URL change watcher — Claude.ai is an SPA, so we poll location.href.
  let lastUrl = location.href;
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      injectedForUrl = null;
      setTimeout(maybeAutoInject, 500);
      setTimeout(maybeAutoInject, 1500); // safety re-check after slower SPA renders
    }
  }, 500);

  // Initial check after document_idle gives React a moment to render.
  setTimeout(maybeAutoInject, 1000);

  // ── Message channel ──────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message && message.action === 'extract') {
      const text = extractConversation();
      sendResponse({ action: 'conversation', text, platform: PLATFORM });
      return false;
    }
    return false;
  });

  console.log('[Total Recall] content script loaded on', PLATFORM);
})();
