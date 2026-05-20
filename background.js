// background.js — Total Recall service worker.
// Routes messages between popup and content scripts.
// Full orchestration (extract-and-save) lands in Step 9 of TOTAL-RECALL-SPEC.md.

const BRAIN_CACHE_KEY = 'brain-cache';

self.addEventListener('install', () => {
  console.log('[Total Recall] service worker installed');
});

self.addEventListener('activate', () => {
  console.log('[Total Recall] service worker activated');
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.action !== 'string') return false;

  if (message.action === 'get-brain') {
    // Read the popup-maintained cache. The service worker cannot reliably read
    // BRAIN.md from disk (no user gesture for FSA permission upgrade), so the
    // popup mirrors the file into chrome.storage.local whenever it has a
    // granted handle in hand.
    chrome.storage.local.get([BRAIN_CACHE_KEY]).then((result) => {
      const brain = result[BRAIN_CACHE_KEY];
      sendResponse({ brain: brain && brain.trim() ? brain : null });
    }).catch((err) => {
      console.error('[Total Recall] get-brain failed:', err);
      sendResponse({ brain: null });
    });
    return true; // async sendResponse
  }

  return false;
});
