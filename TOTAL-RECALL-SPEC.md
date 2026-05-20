# Total Recall — Build Specification v0.1

**Project:** Total Recall Chrome Extension
**Engine:** Engram
**Author:** Rob Angeles / Archos Labs
**Date:** 2026-05-20
**Status:** Ready to build

---

## What You Are Building

Developers are already keeping `decision-log.md` files manually — a Chose/Why/Rejected format they paste into every AI session to give it context. Total Recall automates that entirely.

A Chrome extension that silently reads AI conversations, extracts strategic decision memory using Engram, and writes the results to a local `BRAIN.md` file on the user's machine. Three clicks per save after a one-time install — icon, Reconnect, Extract Now.

No cloud. No account. No server. Fully sovereign. Works across Claude.ai, ChatGPT, Gemini, and DeepSeek.

**The core insight:** Every existing AI memory tool stores who you are. Total Recall stores what you decided and why — including what you rejected and the reason. That is the gap every competitor missed.

---

## Non-Negotiables

- Vanilla JavaScript only. No React. No TypeScript. No build step. No bundler.
- Manifest V3 only.
- BRAIN.md lives on the user's machine via File System Access API.
- Zero network calls except the Engram LLM API call.
- Zero telemetry. Zero tracking.
- Works after browser restart without losing the brain folder connection.
- Non-technical user can set it up in under two minutes.

---

## Complete Folder Structure

Create this exact structure directly inside the existing `cc-total-recall/` project root. Do not create a nested `total-recall/` wrapper folder — the project root IS the extension folder that Chrome loads.

```
cc-total-recall/                ← existing project root, loaded directly by Chrome
  manifest.json
  background.js
  content.js
  engram.js
  storage.js
  templates.js
  popup.html
  popup.js
  popup.css
  BRAIN-template.md
  icons/
    icon16.png      ← placeholder 16x16 PNG (any solid colour)
    icon48.png      ← placeholder 48x48 PNG
    icon128.png     ← placeholder 128x128 PNG
  wiki/
    index.md
    log.md
    backlog/
      backlog.md
```

---

## File 1: manifest.json

```json
{
  "manifest_version": 3,
  "name": "Total Recall",
  "version": "0.1.0",
  "description": "Your AI finally remembers what you decided.",
  "permissions": [
    "storage",
    "activeTab",
    "scripting"
  ],
  "host_permissions": [
    "https://claude.ai/*",
    "https://chatgpt.com/*",
    "https://gemini.google.com/*",
    "https://chat.deepseek.com/*"
  ],
  "background": {
    "service_worker": "background.js"
  },
  "action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "content_scripts": [
    {
      "matches": [
        "https://claude.ai/*",
        "https://chatgpt.com/*",
        "https://gemini.google.com/*",
        "https://chat.deepseek.com/*"
      ],
      "js": ["content.js"],
      "run_at": "document_idle"
    }
  ],
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

---

## File 2: content.js

**Role:** Injected into each supported AI platform page. Reads the conversation from the DOM. Sends it to the service worker. Does nothing else.

**Behaviour:**
- On page load, detect which platform this is.
- Listen for a message from the service worker: `{ action: 'extract' }`.
- When triggered, read the conversation from the DOM using platform-specific selectors.
- Send the extracted text back: `{ action: 'conversation', text: '...', platform: '...' }`.
- If no conversation is found, send: `{ action: 'conversation', text: null, platform: '...' }`.

**Platform DOM selectors (verify against live pages before shipping):**

| Platform | URL match | Message container selector |
|---|---|---|
| Claude.ai | claude.ai | `[data-testid="human-turn"], [data-testid="ai-turn"]` |
| ChatGPT | chatgpt.com | `[data-message-author-role]` |
| Gemini | gemini.google.com | `.user-query-text, .model-response-text` |
| DeepSeek | chat.deepseek.com | `.user-message, .assistant-message` |

**Extraction logic:**
- Select all message containers in document order.
- For each message, detect role (user or assistant) from the element or its attributes.
- Build a plain text transcript: `User: [text]\n\nAssistant: [text]\n\n`
- Strip HTML tags. Keep line breaks. Remove excessive whitespace.
- Return the full transcript as a single string.

**Important:**
- Do not modify the DOM.
- Do not inject UI into the page.
- Do not make any API calls.
- If the selector returns zero elements, return null — do not guess.

```javascript
// content.js — skeleton showing required structure

(function() {
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

  function extractConversation() {
    // Platform-specific selector map
    const selectors = {
      claude: {
        user: '[data-testid="human-turn"]',
        assistant: '[data-testid="ai-turn"]',
        container: '[data-testid="human-turn"], [data-testid="ai-turn"]'
      },
      chatgpt: {
        container: '[data-message-author-role]'
      },
      gemini: {
        container: '.user-query-text, .model-response-text'
      },
      deepseek: {
        container: '.user-message, .assistant-message'
      }
    };

    const config = selectors[PLATFORM];
    if (!config) return null;

    const elements = document.querySelectorAll(config.container);
    if (!elements.length) return null;

    let transcript = '';

    elements.forEach(el => {
      // Determine role
      let role = 'Unknown';
      if (PLATFORM === 'chatgpt') {
        role = el.getAttribute('data-message-author-role') === 'user' ? 'User' : 'Assistant';
      } else if (PLATFORM === 'claude') {
        role = el.getAttribute('data-testid') === 'human-turn' ? 'User' : 'Assistant';
      } else if (PLATFORM === 'gemini') {
        role = el.classList.contains('user-query-text') ? 'User' : 'Assistant';
      } else if (PLATFORM === 'deepseek') {
        role = el.classList.contains('user-message') ? 'User' : 'Assistant';
      }

      const text = el.innerText.trim();
      if (text) {
        transcript += `${role}: ${text}\n\n`;
      }
    });

    return transcript.trim() || null;
  }

  // Listen for extract trigger from service worker via popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'extract') {
      const text = extractConversation();
      sendResponse({ action: 'conversation', text, platform: PLATFORM });
    }
    return true; // Keep channel open for async response
  });

})();
```

---

## File 3: storage.js

**Role:** All IndexedDB and File System Access API operations. No LLM calls. No DOM access.

**Responsibilities:**
1. Save and restore the `FileSystemDirectoryHandle` in IndexedDB.
2. Read the current `BRAIN.md` from the user's chosen folder.
3. Append a new Engram entry to `BRAIN.md`.
4. Initialize `BRAIN.md` if it does not exist yet.

**IndexedDB schema:**
- Database name: `total-recall-db`
- Version: 1
- Object store: `handles`
- Key: `brain-folder`
- Value: `FileSystemDirectoryHandle`

**Functions to implement:**

```javascript
// storage.js

// Save the folder handle to IndexedDB
async function saveFolderHandle(handle) {}

// Restore the folder handle from IndexedDB
// Returns null if not found
async function getFolderHandle() {}

// Check if the stored handle still has readwrite permission
// Requests permission if needed
// Returns true if permission granted, false if denied
async function verifyPermission(handle) {}

// Read BRAIN.md contents from the folder
// Returns empty string if file does not exist
async function readBrain(handle) {}

// Append an Engram entry to BRAIN.md
// Creates BRAIN.md from template if it does not exist
async function appendToBrain(handle, entry) {}

// Initialize BRAIN.md from template
async function initBrain(handle) {}
```

**BRAIN.md append logic:**
- Read current file contents.
- Find the `## Decisions Log` section header.
- Insert the new entry immediately after the header line.
- Write the full file back.
- Most recent decision appears first under the header.

**Permission handling:**
- After restoring handle from IndexedDB, always call `handle.queryPermission({ mode: 'readwrite' })`.
- If state is `'granted'`, proceed.
- If state is `'prompt'`, call `handle.requestPermission({ mode: 'readwrite' })`.
- If state is `'denied'`, return false and show UI error.
- Never assume permission without checking.

---

## File 4: engram.js

**Role:** The extraction engine. Takes a conversation transcript, calls the LLM API, returns a structured BRAIN.md entry. No DOM access. No file operations.

**Input:** `{ transcript: string, platform: string, apiKey: string, model: string }`
**Output:** `string` — a formatted BRAIN.md entry, or `null` if nothing worth capturing.

**Default LLM:** OpenRouter API
**Default model:** `anthropic/claude-3-5-haiku` (fast, cheap, accurate)
**API endpoint:** `https://openrouter.ai/api/v1/chat/completions`

**The Engram System Prompt (use exactly as written):**

```
You are Engram, the extraction engine for Total Recall.

Your job is to read an AI conversation and extract only what matters for persistent strategic memory.

Total Recall automates the decision-log.md pattern that developers already use manually.
The format is: Chose X / Why / Rejected Y because Z.
This is the only decision format worth capturing. A decision without a reason is not a decision.

You are looking for:
1. DECISIONS — What was concluded. What was rejected and why. Use Chose/Why/Rejected format.
2. CONTEXT SHIFTS — How the project, situation, or strategy changed.
3. IDENTITY SIGNALS — Facts about who the person is, what they are building, their current circumstances.
4. VOICE AND STYLE — Communication preferences, tone choices, formatting decisions locked in.
5. OPEN QUESTIONS — Unresolved things explicitly raised that should carry forward.

You are NOT looking for:
- Generic facts or preferences ("user likes coffee", "user is in Melbourne")
- Technical implementation details unless they represent a strategic decision
- Conversation filler, pleasantries, or anything that won't matter next session
- Content that was discussed but not decided
- One-line decisions with no reasoning — these are facts, not decisions

Output ONLY a formatted entry in this exact structure. No preamble. No explanation. No markdown outside the structure.

### [TODAY'S DATE in YYYY-MM-DD] — [PLATFORM] — [2-5 word topic]

**Decisions:**
- Chose [X] because [reason]. Rejected [Y] because [reason].

**Context updated:**
- [What changed about the active project, situation, or identity]

**Open questions:**
- [Unresolved question worth remembering]

Rules:
- Only include sections that have actual content. Omit empty sections entirely.
- If a section has no content, do not include it at all — not even the header.
- If there is nothing worth capturing from this conversation, output exactly: NOTHING_TO_CAPTURE
- Be ruthlessly concise. One bullet per decision. No padding.
- Every decision entry must follow Chose/Why/Rejected format. No exceptions.
- If you cannot identify what was rejected and why, it is not a decision — skip it.
```

**User message to send:**

```
Platform: [PLATFORM]
Date: [TODAY'S DATE]

CONVERSATION:
[TRANSCRIPT]
```

**API call structure:**

```javascript
const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': 'https://github.com/robertangeles/cc-total-recall',
    'X-Title': 'Total Recall'
  },
  body: JSON.stringify({
    model: model || 'anthropic/claude-3-5-haiku',
    messages: [
      { role: 'system', content: ENGRAM_SYSTEM_PROMPT },
      { role: 'user', content: userMessage }
    ],
    max_tokens: 500,
    temperature: 0.1
  })
});
```

**Response handling:**
- Parse `response.choices[0].message.content`.
- If content is exactly `NOTHING_TO_CAPTURE`, return null.
- If content is empty or malformed, return null.
- Otherwise return the content string.
- Always wrap in try/catch. On any error, return null and log the error.

---

## File 5: background.js

**Role:** Service worker. Orchestrates the full extraction flow. Calls content script, calls Engram, calls storage. Does not touch the DOM.

**Message handlers:**

### Handler 1: `extract-and-save`
Triggered by popup when user clicks "Extract Now".

Flow:
1. Get active tab ID.
2. Send `{ action: 'extract' }` to content script via `chrome.tabs.sendMessage`.
3. Receive `{ text, platform }` from content script.
4. If `text` is null, send `{ success: false, reason: 'no_conversation' }` back to popup.
5. Get API key and model from `chrome.storage.local`.
6. If no API key, send `{ success: false, reason: 'no_api_key' }` back to popup.
7. Call `engram.extract({ transcript: text, platform, apiKey, model })`.
8. If Engram returns null, send `{ success: false, reason: 'nothing_to_capture' }` back to popup.
9. Get folder handle from storage.
10. If no handle, send `{ success: false, reason: 'no_folder' }` back to popup.
11. Verify permission on handle.
12. If permission denied, send `{ success: false, reason: 'permission_denied' }` back to popup.
13. Append Engram entry to BRAIN.md.
14. Send `{ success: true, entry: engramEntry }` back to popup.

### Handler 2: `save-settings`
Triggered by popup when user saves API key and model.

Flow:
1. Receive `{ apiKey, model }`.
2. Save to `chrome.storage.local`.
3. Return `{ success: true }`.

### Handler 3: `get-settings`
Triggered by popup on load.

Flow:
1. Read `apiKey` and `model` from `chrome.storage.local`.
2. Return `{ apiKey, model }`.

### Handler 4: `connect-folder`
Triggered by popup when user clicks "Choose Brain Folder".

Flow:
1. Cannot call `showDirectoryPicker` from service worker — must be called from popup.
2. This handler does not exist. Folder selection happens in popup.js directly.
3. Popup sends the handle to background via: not possible — handles cannot be sent via messages.
4. **Solution:** Popup calls `showDirectoryPicker`, then saves the handle to IndexedDB directly by calling `saveFolderHandle` from popup.js (import storage.js into popup.js).

### Handler 5: `check-status`
Triggered by popup on load to check brain connection status.

Flow:
1. Get folder handle from IndexedDB.
2. If no handle, return `{ connected: false }`.
3. Verify permission. If denied, return `{ connected: false, reason: 'permission_denied' }`.
4. Return `{ connected: true, folderName: handle.name }`.

---

## File 6: popup.html

**Role:** The extension popup. One screen. Setup + status + trigger.

**UI states:**

**State 1 — Not configured (first run)**
- Heading: "Total Recall"
- Subtext: "Set up your brain to get started."
- Input: API Key (password type)
- Input: Model (text, default value: `anthropic/claude-3-5-haiku`)
- Button: "Choose Brain Folder"
- Button: "Save Settings"
- Status: "Not connected"

**State 2 — Configured and connected**
- Heading: "Total Recall"
- Status indicator: green dot + "Brain connected: [folder name]"
- Button: "Extract Now"
- Small text: "Last extracted: [timestamp or 'Never']"
- Link: "Change settings"

**State 3 — Extracting**
- Button disabled, text: "Extracting..."
- Small spinner or animated dots

**State 4 — Result**
- Success: "Saved to BRAIN.md" — show for 3 seconds then return to State 2
- Nothing found: "Nothing to capture from this conversation"
- Error: Show specific error message from background handler

**Design rules:**
- Width: 320px
- Clean, minimal. No decoration. No branding beyond the name.
- Font: System font stack
- Primary colour: #1a1a1a (near black)
- Accent: #22c55e (green) for connected state
- Error: #ef4444 (red)
- No animations except the 3-second success flash

---

## File 7: popup.js

**Role:** Popup UI logic. Handles folder selection (File System Access API must be called from user gesture in popup context). Saves handle to IndexedDB. Communicates with background.

**On popup open:**
1. Call `chrome.runtime.sendMessage({ action: 'get-settings' })` to restore API key and model.
2. Call `chrome.runtime.sendMessage({ action: 'check-status' })` to get connection status.
3. Render appropriate UI state.

**On "Choose Brain Folder" click:**
1. Call `window.showDirectoryPicker({ mode: 'readwrite' })`.
2. Save returned handle to IndexedDB via `saveFolderHandle(handle)`.
3. Update UI to show folder name.
4. Handle user cancellation gracefully (DOMException with name 'AbortError').

**On "Save Settings" click:**
1. Read API key and model from inputs.
2. Validate: API key must not be empty.
3. Send `{ action: 'save-settings', apiKey, model }` to background.
4. Show confirmation.

**On "Extract Now" click:**
1. Disable button. Show "Extracting..."
2. Send `{ action: 'extract-and-save' }` to background.
3. Handle response:
   - `success: true` → show "Saved to BRAIN.md", re-enable after 3s
   - `reason: 'no_conversation'` → "No conversation found on this page"
   - `reason: 'no_api_key'` → "Please add your API key in settings"
   - `reason: 'no_folder'` → "Please connect your brain folder"
   - `reason: 'nothing_to_capture'` → "Nothing worth capturing in this conversation"
   - `reason: 'permission_denied'` → "Folder access denied. Click to reconnect."
4. Always re-enable button after response.

**Import storage.js:**
- popup.js needs access to `saveFolderHandle` and `getFolderHandle`.
- Use ES module import: `<script type="module" src="popup.js"></script>` in popup.html.
- `storage.js` must export its functions as ES modules.

---

## File 8: popup.css

Minimal styles only. The popup must look clean and trustworthy, not designed.

Key rules:
- `body { width: 320px; padding: 16px; font-family: system-ui, sans-serif; }`
- No external fonts. No icons beyond Unicode characters.
- Input fields: full width, clear border, readable at small size.
- Buttons: full width, clear hover state.
- Status dot: 8px circle, inline-block, margin-right: 6px.

---

## File 9: BRAIN-template.md

This is the initial content written to BRAIN.md when a user first connects their folder.

```markdown
# BRAIN.md
> Your persistent decision memory. Maintained by Total Recall + Engram.
> This file is appended automatically after every AI session where decisions were made.
> It is plain markdown. You can read it, edit it, or paste it into any AI tool.

---

## Identity
[Engram will populate this as it learns who you are and what you are building.]

---

## Active Projects
[Engram will track what is in flight, the current stage, and key constraints.]

---

## Decisions Log
[Most recent decisions appear first. Engram appends here after every session.]

---

## Rejected Paths
[What was considered and ruled out. Prevents relitigating closed decisions.]

---

## Voice and Style
[Communication preferences and tone choices that Engram has observed.]

---

## Open Questions
[Unresolved things worth carrying into the next conversation.]
```

---

## File 10: wiki/index.md

```markdown
---
title: Total Recall Wiki Index
category: index
created: 2026-05-20
updated: 2026-05-20
---

Master catalog of all wiki pages for the Total Recall project.

## Entities
[none yet]

## Concepts
[none yet]

## Decisions
[none yet]

## Lessons Learned
[none yet]
```

---

## File 11: wiki/log.md

```markdown
# Session Log

## 2026-05-20 — Project Initialised

Total Recall project created. CLAUDE.md and build spec written.
Architecture decided: Manifest V3, vanilla JS, File System Access API, OpenRouter.
BRAIN.md format specified. Engram extraction prompt finalised.
```

---

## File 12: wiki/backlog/backlog.md

```markdown
# Total Recall Backlog

Ordered by priority. Top = build next.

## v0.1 — Core (build this first)
- [ ] manifest.json — complete with all permissions
- [ ] content.js — DOM extraction for Claude.ai only
- [ ] content.js — auto-inject BRAIN.md on new Claude.ai conversation
- [ ] templates.js — platform injection templates (all four platforms)
- [ ] storage.js — IndexedDB handle persistence + BRAIN.md read/write + get-brain handler
- [ ] engram.js — Engram extraction via OpenRouter with Chose/Why/Rejected format
- [ ] background.js — orchestration service worker + get-brain message handler
- [ ] popup.html/js/css — setup + extract + Copy Brain button
- [ ] BRAIN-template.md — initial file template
- [ ] Manual test: load unpacked, connect folder, extract on Claude.ai, verify auto-inject

## v0.2 — Platform Coverage
- [ ] content.js — ChatGPT DOM extraction + auto-inject
- [ ] content.js — Gemini DOM extraction + auto-inject
- [ ] content.js — DeepSeek DOM extraction + auto-inject
- [ ] Verify all selectors on live pages before shipping

## v0.3 — Polish
- [ ] Auto-extraction on conversation end (detect new message, debounce)
- [ ] Last extracted timestamp in popup
- [ ] Settings page for model selection
- [ ] Error recovery: handle permission denied after restart

## v0.4 — Open Source Release
- [ ] README.md
- [ ] CONTRIBUTING.md
- [ ] GitHub repo setup
- [ ] Chrome Web Store listing
- [ ] LinkedIn announcement post
```

---

## File 13: templates.js

**Role:** Platform-specific injection templates. Same BRAIN.md content, different wrapper per platform. Exported as ES module.

Each AI model responds differently to how context is framed. Claude responds to XML tags. ChatGPT to explicit memory framing. Gemini to conversational setup. DeepSeek to system-style phrasing.

```javascript
// templates.js

const TEMPLATES = {

  claude: (brain) => `<context>
${brain}
</context>

I am continuing work on the above context. Treat all decisions as constraints not suggestions. Do not re-propose anything listed under Rejected.`,

  chatgpt: (brain) => `Memory context from my previous sessions:

${brain}

Treat these decisions as established. Work within these constraints. Do not re-suggest rejected paths.`,

  gemini: (brain) => `Before we start, here is my decision history from previous AI sessions:

${brain}

Continue from this context. Treat decisions as settled.`,

  deepseek: (brain) => `System context:

${brain}

Work within these decisions. Do not re-open rejected paths unless I explicitly ask.`,

  default: (brain) => `Context from previous sessions:

${brain}

Treat these decisions as constraints.`

};

export function getTemplate(platform, brainContent) {
  const fn = TEMPLATES[platform] || TEMPLATES.default;
  return fn(brainContent);
}
```

---

## Auto-Inject Architecture

### v0.1 — Claude.ai auto-inject, Copy Brain button for all others

**Claude.ai:** On new conversation detected, content script requests BRAIN.md from background, wraps in Claude template, injects into input. User sees brain context pre-loaded. They can edit before sending. They are never asked to do anything.

**All other platforms in v0.1:** Popup shows a "Copy Brain" button. One click copies the platform-appropriate template to clipboard. User pastes. Two seconds of friction. Completely reliable.

### New conversation detection (Claude.ai)

Content script checks on every URL change:
- Is this a new conversation URL? (matches `/new` or fresh chat path)
- Are there zero message elements in the DOM?

If both true: inject.

Use a `MutationObserver` or check on `DOMContentLoaded` after navigation. Add a debounce of 500ms to avoid race conditions with the page rendering.

### Input injection for Claude.ai

Claude.ai uses a React-controlled contenteditable div. Direct `.value` assignment will not work. Use this pattern:

```javascript
async function injectIntoClaudeInput(text) {
  // Verify this selector on a live Claude.ai page before shipping
  const input = document.querySelector('[contenteditable="true"][data-placeholder]');
  if (!input) {
    console.error('[Total Recall] Claude input not found');
    return false;
  }

  input.focus();

  // Try execCommand first (works in most cases)
  const inserted = document.execCommand('insertText', false, text);

  if (!inserted) {
    // Fallback: dispatch InputEvent
    input.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertText',
      data: text
    }));
  }

  return true;
}
```

If injection fails, fall back to clipboard copy silently and show popup notification: "Brain copied to clipboard — paste to inject context."

### Background handler: get-brain

Add to background.js message handler:

```javascript
case 'get-brain': {
  const handle = await getFolderHandle();
  if (!handle) { sendResponse({ brain: null }); return; }
  const permitted = await verifyPermission(handle);
  if (!permitted) { sendResponse({ brain: null }); return; }
  const brain = await readBrain(handle);
  sendResponse({ brain: brain || null });
  break;
}
```

### Copy Brain button (popup)

Add to popup State 2 (connected):
- Button: "Copy Brain"
- On click:
  1. Send `{ action: 'get-brain' }` to background
  2. Detect platform from active tab URL
  3. Call `getTemplate(platform, brain)` 
  4. Copy to clipboard via `navigator.clipboard.writeText()`
  5. Button shows "Copied!" for 2 seconds, then resets

Platform detection from URL:

```javascript
function detectPlatformFromUrl(url) {
  if (url.includes('claude.ai')) return 'claude';
  if (url.includes('chatgpt.com')) return 'chatgpt';
  if (url.includes('gemini.google.com')) return 'gemini';
  if (url.includes('chat.deepseek.com')) return 'deepseek';
  return 'default';
}
```

### Updated popup State 2 UI

```
● Brain connected: [folder name]

[ Extract Now ]
[ Copy Brain  ]

Last extracted: [timestamp or 'Never']
Change settings
```

---

Build in this exact order. Verify each step before moving to the next.

**Step 1 — Scaffold**
Create all files and folders. Placeholder content only. Load unpacked in Chrome. Confirm extension loads without errors.

Verify: `chrome://extensions` shows Total Recall with no errors.

**Step 2 — storage.js**
Build IndexedDB operations and File System Access API. Test `saveFolderHandle` and `getFolderHandle` in isolation.

Verify: Save a handle, reload the extension, restore the handle, confirm it is the same folder.

**Step 3 — popup.html + popup.js (folder selection only)**
Build the folder selection flow. User clicks "Choose Brain Folder", handle is saved to IndexedDB.

Verify: Click button, select a folder, reload popup, confirm folder name is shown.

**Step 4 — BRAIN.md initialisation**
Build `initBrain` and `appendToBrain` in storage.js.

Verify: BRAIN.md is created in the chosen folder with the template content. A test entry appends correctly.

**Step 5 — templates.js**
Build all four platform templates and the `getTemplate(platform, brainContent)` dispatcher.

Verify: Call `getTemplate('claude', 'test brain content')` and confirm the output wraps correctly in XML tags. Call for each platform and confirm the wrapper changes.

**Step 6 — content.js (Claude.ai extraction)**
Build DOM extraction for Claude.ai. Test by opening a Claude.ai conversation and triggering extract via Chrome DevTools console.

Verify: `extractConversation()` returns a readable transcript.

**Step 7 — content.js (Claude.ai auto-inject)**
Build new conversation detection and BRAIN.md injection for Claude.ai. On new conversation detected, request brain from background, wrap in Claude template, inject into input.

Verify: Open a new Claude.ai conversation. BRAIN.md content appears pre-loaded in the input wrapped in the Claude template. User can edit before sending.

**Step 8 — engram.js**
Build the Engram extraction call with Chose/Why/Rejected prompt.

Verify: Engram returns correctly formatted BRAIN.md entry with Chose/Why/Rejected format. Returns null for trivial conversations.

**Step 9 — background.js**
Build orchestration layer including get-brain handler.

Verify: Click "Extract Now" in popup on a Claude.ai conversation. BRAIN.md is updated. Background correctly serves brain contents to content script on request.

**Step 10 — popup Copy Brain button**
Add Copy Brain button to popup. On click, gets brain, wraps in platform template, copies to clipboard.

Verify: Click Copy Brain while on ChatGPT. Paste into ChatGPT input. Confirm it uses the ChatGPT template not the Claude template.

**Step 11 — Full flow test**
Open a real Claude.ai conversation. Have a real conversation with real decisions. Click Extract Now. Open BRAIN.md. Confirm entry is correct. Open a new Claude.ai conversation. Confirm brain is auto-injected. Click Copy Brain while on ChatGPT. Paste and confirm template is correct.

---

## API Key Storage

Store the API key in `chrome.storage.local` under the key `openrouter-api-key`.

Do NOT store it in:
- `manifest.json`
- Any committed file
- `chrome.storage.sync` (syncs to cloud — not sovereign)

The user enters it once in the popup. It persists locally.

---

## Error Handling Rules

Every function that touches the file system, IndexedDB, or the LLM API must:
1. Be wrapped in try/catch.
2. Return null or false on failure — never throw to the caller.
3. Log the error to console with a specific prefix: `[Total Recall]`.
4. Send a human-readable error reason back to the popup.

Example:
```javascript
async function appendToBrain(handle, entry) {
  try {
    // ... file operations
  } catch (err) {
    console.error('[Total Recall] appendToBrain failed:', err);
    return false;
  }
}
```

---

## Testing Checklist Before v0.1 Ship

- [ ] Extension loads in Chrome with zero console errors
- [ ] Folder selection works and persists after browser restart
- [ ] BRAIN.md is created correctly from template on first use
- [ ] Extraction works on a real Claude.ai conversation
- [ ] Engram entry is correctly formatted and appended to BRAIN.md
- [ ] Nothing to capture: Engram returns null for trivial conversations
- [ ] API key saves and restores correctly
- [ ] Permission denied after restart: popup shows correct error
- [ ] No conversation found: popup shows correct message
- [ ] Extension does not throw any errors in service worker console
- [ ] Extension does not throw any errors in content script console
- [ ] Extension does not throw any errors in popup console

---

## What v0.1 Does NOT Include

Do not build these for v0.1:

- Auto-extraction (user must click "Extract Now")
- ChatGPT, Gemini, DeepSeek support (Claude.ai only)
- Conversation history browser
- BRAIN.md viewer inside the popup
- Multiple brain folders
- Encryption
- Export/import
- Sync across devices
- Firefox support

Build the smallest thing that works end to end for one platform. Ship it. Expand from there.

---

## Open Source Notes

This project will be published on GitHub under the MIT license.

Do not include any proprietary Archos Labs content in this repo.
Do not include Rob's API key or any secrets anywhere in the codebase.
The README will be written after v0.1 is verified working.

---

## Questions Claude Code Must Answer Before Building

Before writing the first line of code, answer these:

1. What files already exist in the `cc-total-recall/` project root? (The root itself IS the extension folder — do not create a nested `total-recall/` wrapper.)
2. Is Node.js or any package manager available? (Should not need it — vanilla JS only)
3. What is today's date? (For BRAIN.md log entry)
4. Confirm: no TypeScript, no React, no build step. Plain files only.

If any of these cannot be confirmed, stop and ask.
