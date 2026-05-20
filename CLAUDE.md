# CLAUDE.md — Total Recall

Behavioral guidelines for building the Total Recall Chrome extension.
Adapted from Archos Labs CLAUDE.md. Merge with session-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

---

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.
- Chrome extensions fail silently. Name the failure mode before writing the code.

---

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- Vanilla JavaScript only. No React. No build step. No bundler.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

---

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

The test: Every changed line should trace directly to the user's request.

---

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add extraction" → "Engram reads conversation and writes correct BRAIN.md entry"
- "Fix the bug" → "Reproduce it first, then fix it, then verify it's gone"
- "Update the popup" → "Load unpacked extension, confirm UI change renders"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

---

## 5. Debugging Protocol (MANDATORY)

ALWAYS follow this sequence. Do not skip steps.

1. Read the error output exactly as written. Do not interpret.
2. Identify the exact file, line, and function where the error originates.
3. State only what the error message confirms. Label anything else [Inference].
4. Do not suggest a fix until root cause is confirmed by evidence in the code or logs.
5. If root cause cannot be determined, state: "I need more information." Then list exactly what.
6. Never guess. Never patch. Never suggest multiple fixes hoping one works.
7. One confirmed problem. One evidence-based fix. One test to verify.

### Investigation Format

Every debugging response must follow this structure:

- Confirmed: [what the error proves]
- Evidence: [exact file, line, log output]
- Root cause: [only if confirmed by evidence]
- Fix: [only after root cause is confirmed]
- Verify with: [exact step in Chrome DevTools or extension console]

---

## 6. Chrome Extension Specific Rules

**Manifest V3 only. No legacy Manifest V2 patterns.**

- Service workers replace background pages. Do not use `background.html`.
- Content scripts run in page context. Service worker runs in extension context. They cannot share memory.
- All messaging between content script and service worker uses `chrome.runtime.sendMessage` and `chrome.runtime.onMessage`.
- Never use `eval()`. Manifest V3 blocks it.
- Content Security Policy is strict. Do not inline scripts.
- Test every permission in `manifest.json` — request only what is needed.

### File System Access API Rules

- User grants folder permission once via `window.showDirectoryPicker()`.
- Store the `FileSystemDirectoryHandle` in IndexedDB using `idb-keyval` or raw IndexedDB.
- On subsequent sessions, restore the handle from IndexedDB and call `handle.requestPermission({ mode: 'readwrite' })`.
- Always handle permission denial gracefully. Show clear UI when permission is missing.
- Never assume the handle is valid without checking.

### Silent Failure Prevention

Chrome extensions fail without obvious errors. Before shipping any feature:
- Open `chrome://extensions` → click "Service Worker" → check console for errors.
- Open DevTools on the target page → Console tab → check for content script errors.
- Open the popup → right-click → Inspect → check popup console.
- Test on all supported platforms: Claude.ai, ChatGPT, Gemini, DeepSeek.

---

## 7. Testing Standards

Every new feature requires:

1. Manual load test — load unpacked extension, trigger the feature, verify output
2. Console check — zero errors in service worker, content script, and popup consoles
3. BRAIN.md check — open the output file and verify the entry is correctly structured
4. Permission check — verify the feature works after browser restart (handle persistence)
5. Platform check — test on at least two supported AI platforms

---

------------------------------------------------------------------------

# Project Overview

## What Is Total Recall

Total Recall is an open source Chrome extension that gives AI conversations persistent strategic memory — locally, sovereignly, without cloud dependency.

It captures what you decided and why across any AI conversation. Not who you are. Not your preferences. Your decisions, your reasoning, and how your thinking evolves over time.

The extraction engine is called **Engram**.

---

## The Problem Total Recall Solves

Every AI platform forgets everything when you close the tab. Existing memory tools store personal facts and preferences. Nobody captures strategic decision memory — what was built, what was rejected, why, and how the thinking changed.

Solo founders, consultants, job seekers, and knowledge workers who use AI heavily across multiple workstreams lose their own thinking between sessions. They repeat context endlessly. They forget what they decided three weeks ago. They start from zero every time.

Total Recall ends the cold start.

---

## What Makes Total Recall Different

Every existing solution (Rethread, OpenMemory, MemoryPlugin, AI Context Flow) stores **profile memory** — facts about who you are.

Total Recall stores **decision memory** — what you are building and every decision made along the way.

Not: "User lives in Melbourne."
Yes: "Product name locked: Total Recall. Engine: Engram. Reason: cultural recognition + neuroscience grounding. Rejected: Marrow (too anatomical)."

---

## Core Principles

- **Sovereign** — BRAIN.md lives on the user's machine. No cloud. No account. No Anthropic. No Google.
- **Portable** — Plain markdown. Works with Claude, ChatGPT, Gemini, DeepSeek, Qwen, any AI.
- **Low friction** — Three clicks per save after one-time install (icon → Reconnect → Extract Now). Browser-imposed reconnect drops to once per browser session if v0.2 ships an offscreen document.
- **Non-technical** — Designed for founders, consultants, and knowledge workers. Not developers.
- **Open** — MIT licensed. Community builds on top of it.

---

## Architecture

Total Recall has three components:

### 1. Content Script (`content.js`)
- Injected into supported AI platform pages
- Reads the conversation from the DOM when the session ends or user triggers extraction
- Sends conversation text to the service worker via `chrome.runtime.sendMessage`
- Supported platforms: Claude.ai, ChatGPT, Gemini, DeepSeek

### 2. Service Worker (`background.js`)
- Receives conversation from content script
- Calls Engram extraction via the user's chosen LLM API (configurable)
- Receives structured BRAIN.md entry from Engram
- Writes the entry to `BRAIN.md` via File System Access API
- Manages FileSystemDirectoryHandle persistence in IndexedDB

### 3. Popup (`popup.html` / `popup.js`)
- Simple UI for first-time setup: choose brain folder, enter API key
- Status indicator: brain connected / disconnected
- Manual extraction trigger
- Last extraction timestamp
- No complexity. No dashboard. One screen.

---

## BRAIN.md Specification

BRAIN.md is a structured markdown file that lives on the user's machine.
Engram appends to it. It never overwrites. Every entry is dated.

### File Structure

```markdown
# BRAIN.md
> Your persistent decision memory. Updated by Engram after every AI session.

---

## Identity
[Who you are, what you are building, your current context]
Updated by Engram when identity signals shift.

---

## Active Projects
[What is in flight right now, key constraints, current stage]
Updated by Engram when project context changes.

---

## Decisions Log
[Chronological record of what was decided and why]
Append-only. Never deleted.

---

## Rejected Paths
[What was considered and ruled out, with reasons]
Prevents relitigating closed decisions.

---

## Voice and Style
[Communication preferences, tone, writing style locked in]
Updated by Engram when style signals appear.

---

## Open Questions
[Unresolved things worth carrying forward]
Cleared when answered, added when raised.
```

### Entry Format

Every Engram extraction appends a dated entry:

```markdown
### [YYYY-MM-DD] — [Platform] — [Session Topic]

**Decisions made:**
- [Decision]: [Reason]. Rejected: [Alternative] because [reason].

**Context updated:**
- [What changed about the active project or situation]

**Open questions carried forward:**
- [Unresolved question]
```

---

## Engram Extraction Prompt

This is the exact prompt Engram sends to the LLM after each conversation.

```
You are Engram, the extraction engine for Total Recall.

Read the following AI conversation and extract only what matters for persistent strategic memory.

You are looking for:
1. DECISIONS — What was concluded. What was rejected. Why.
2. CONTEXT SHIFTS — How the project, situation, or strategy changed.
3. IDENTITY SIGNALS — Facts about who the person is, what they are building, their current circumstances.
4. VOICE AND STYLE — Communication preferences, tone choices, formatting decisions.
5. OPEN QUESTIONS — Unresolved things explicitly raised that should carry forward.

You are NOT looking for:
- Generic facts or preferences ("user likes coffee")
- Technical implementation details unless they represent a strategic decision
- Anything that won't matter in the next conversation

Output ONLY a BRAIN.md entry in this exact format:

### [TODAY'S DATE] — [PLATFORM] — [2-4 word session topic]

**Decisions made:**
- [Decision]: [Reason]. Rejected: [Alternative] because [reason].

**Context updated:**
- [What changed]

**Open questions carried forward:**
- [Question]

If there are no decisions, no context shifts, no identity signals, no open questions — output nothing. Do not generate a placeholder entry.

CONVERSATION:
[CONVERSATION TEXT HERE]
```

---

## Supported Platforms

| Platform | URL Pattern | DOM Selector Strategy |
|---|---|---|
| Claude.ai | claude.ai/* | `.font-claude-message` containers |
| ChatGPT | chatgpt.com/* | `[data-message-author-role]` containers |
| Gemini | gemini.google.com/* | `.model-response-text` containers |
| DeepSeek | chat.deepseek.com/* | `.ds-message` containers |

DOM selectors must be verified against live pages before shipping.
These change without notice. Check before every release.

---

## Tech Stack

- **Extension type:** Chrome Extension, Manifest V3
- **Language:** Vanilla JavaScript. No TypeScript. No build step.
- **Storage:** File System Access API for BRAIN.md. IndexedDB for handle persistence.
- **LLM API:** User-configurable. Default: OpenRouter (supports Claude, GPT-4, Gemini).
- **Styling:** Plain CSS. No framework.
- **Package manager:** None. Zero dependencies.

---

## Folder Structure

The `cc-total-recall/` project root IS the extension folder Chrome loads. Do not create a nested `total-recall/` wrapper.

```
cc-total-recall/          ← project root, loaded directly by Chrome
  manifest.json           ← Extension config. Permissions. Content script registration.
  background.js           ← Service worker. Engram calls. File writes.
  content.js              ← DOM reading. Conversation extraction. Message passing.
  popup.html              ← Setup UI. Status. Manual trigger.
  popup.js                ← Popup logic.
  popup.css               ← Popup styles.
  engram.js               ← Engram prompt. LLM API call. Response parsing.
  storage.js              ← IndexedDB handle persistence. Read/write BRAIN.md.
  icons/
    icon16.png
    icon48.png
    icon128.png
  wiki/
    index.md              ← Master catalog of all wiki pages
    log.md                ← Append-only session log
    entities/             ← Named things: Total Recall, Engram, BRAIN.md
    concepts/             ← Patterns: extraction logic, DOM selectors, handle persistence
    decisions/            ← Architectural decisions with date and rationale
    lessons-learned/      ← Problem / Fix / Rule. Never repeat mistakes.
    backlog/              ← Prioritised build list ordered by what matters most
```

---

## manifest.json Structure

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

## Development Workflow

### Load unpacked extension
1. Open `chrome://extensions`
2. Enable Developer Mode (top right toggle)
3. Click "Load unpacked"
4. Select the `cc-total-recall/` project root folder
5. Pin the extension to the toolbar

### After every code change
1. Go to `chrome://extensions`
2. Click the refresh icon on Total Recall
3. Reload the target AI platform page
4. Test the change
5. Check all three consoles: service worker, content script, popup

### Never
- Ship without testing on a live AI platform page
- Assume a DOM selector still works without verifying
- Store API keys in `manifest.json` or any committed file
- Request permissions not actively used
- Use Manifest V2 patterns

---

## LLM Wiki

This project maintains a living knowledge wiki in `wiki/`.

### At the start of every session
Read `wiki/index.md` to understand what is already known before doing any work.

### During the session
When you make a significant decision, discover a non-obvious pattern, or implement something architecturally important — write it to the appropriate wiki folder.

### At the end of every session
Update `wiki/log.md` with a summary of what was done and decided today.

### Wiki rules
- `wiki/entities/` — named things: Total Recall, Engram, BRAIN.md, supported platforms
- `wiki/concepts/` — patterns: extraction logic, DOM selector strategy, handle persistence, Engram prompt design
- `wiki/decisions/` — architectural decisions with date and rationale
- `wiki/lessons-learned/` — Problem / Fix / Rule format. Never repeat mistakes.
- `wiki/backlog/` — prioritised list of work ordered by what matters most now

### Wiki page format
Every wiki page must start with:

```
---
title: [page title]
category: [entity | concept | decision | lessons-learned]
created: [YYYY-MM-DD]
updated: [YYYY-MM-DD]
related: [[page-name]], [[page-name]]
---

[one sentence summary]

[content]
```

---

## Git Commit Format

```
<verb> <area>: <detail>

Examples:
Add content: Claude.ai DOM extraction
Fix engram: handle empty conversation response
Update manifest: add DeepSeek host permission
Chore: update icon assets
```

## Never
- Commit API keys or secrets
- Push without testing the extension loads cleanly
- Force push to main
- Ship a feature without a wiki entry documenting the decision
