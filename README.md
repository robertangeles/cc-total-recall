# Total Recall

<p align="center">
  <img src="icons/icon128.png" alt="Total Recall logo" width="96" height="96">
</p>

**Developers are already keeping `decision-log.md` files manually. Total Recall does it automatically.**

A free, open source Chrome extension that captures what you decided and why across any AI conversation — and writes it to a local file you own completely.

Verified on Claude.ai in v0.1. ChatGPT, Gemini, and DeepSeek are experimental — their page layouts change without warning and extraction may miss content. Copy Brain works on all four regardless.

---

## The problem

Every AI session starts from zero. You explained your architecture to Claude last week. You decided against a specific approach for a real reason. You were building toward something specific.

New session. Gone.

The tools that exist today remember who you are. Your name, your preferences, the fact that you use TypeScript. That is profile memory. Useful but shallow.

Nobody captures what you actually decided. What you chose. Why you chose it. What you rejected and the reason you rejected it. How your thinking evolved.

That is decision memory. And losing it is expensive.

---

## What developers are already doing

Some developers already solve this manually. They keep a `decision-log.md` in their project:

```markdown
### 2026-03-12: How to store notification send time
- **Chose:** Store all times in UTC
- **Why:** Avoids DST edge cases during storage and processing
- **Rejected:** Store in user's local timezone — causes silent bugs during DST transitions
```

They paste it into every AI session before describing the task. The session starts further along. The model works inside real constraints instead of guessing.

Total Recall automates that entirely.

---

## How it works

Install the extension once and configure a brain folder and an AI provider. After that, every save takes three clicks: click the toolbar icon, click Reconnect, click Extract Now.

> *Three clicks not one? Yes. Browsers (Chrome / Edge) drop folder-access permission every time the popup closes, which forces the Reconnect step. It is one tap, but it is honest to mention it up front. v0.2 may eliminate it via an offscreen document.*

Engram — the extraction engine — reads the conversation, identifies the real Chose / Why / Rejected decisions, and writes a structured entry to `BRAIN.md` on your machine.

On Claude.ai, Total Recall also **auto-injects** your `BRAIN.md` into the input box every time you open a new chat. You start the next conversation already in context — without copy-pasting anything.

For ChatGPT, Gemini, DeepSeek, and anywhere else, the popup's **Copy Brain** button wraps your `BRAIN.md` in a platform-specific intro and copies it to your clipboard. Paste, send, continue.

---

## What Engram captures

Not facts. Not preferences. Decisions.

```markdown
### 2026-05-20 — Claude — Product naming

**Decisions:**
- Chose "Total Recall" because culturally recognised, implies memory recovery.
  Rejected "Marrow" because too anatomical — first image is bone marrow, not depth.
- Chose "Engram" as the engine name because neuroscience-backed, credible to developers.
  Rejected "Breadcrumbs" because too passive, implies trail not storage.

**Context updated:**
- Project is open source Chrome extension targeting non-technical founders and knowledge workers.
- v0.1 ships Claude.ai only. Other platforms in v0.2.

**Open questions:**
- Whether to support Firefox in v0.3 or keep Chrome-only through initial launch.
```

If a conversation has nothing worth capturing, Engram returns nothing. No noise. No filler entries.

The Chose / Why / Rejected discipline is enforced by Engram's system prompt:

> *"A decision without a reason is not a decision. If you cannot identify what was rejected and why, it is not a decision — skip it."*

So "we decided to use Tailwind" with no reasoning attached becomes nothing. The discipline is what keeps `BRAIN.md` a strategic memory file instead of a kitchen-sink transcript dump.

---

## Architecture

Five JavaScript files, zero npm dependencies, no build step.

```
┌────────────────────────────────────────────────────────────┐
│ Your browser                                                │
│                                                             │
│  ┌──────────────────────┐    ┌──────────────────────┐     │
│  │ content.js            │    │ popup.html + popup.js │     │
│  │ (runs on AI sites)   │    │ (extension UI)        │     │
│  │                      │    │                       │     │
│  │ • Read DOM           │    │ • Pick folder         │     │
│  │ • Extract transcript │    │ • Configure provider  │     │
│  │ • Auto-inject brain  │    │ • Extract Now flow    │     │
│  │   on new Claude tab  │    │ • Copy Brain          │     │
│  └──────────┬───────────┘    └──────────┬────────────┘     │
│             │                            │                  │
│             │   chrome.runtime           │                  │
│             │   message passing          │                  │
│             └──────────┬─────────────────┘                  │
│                        ▼                                    │
│             ┌──────────────────────┐                        │
│             │ background.js         │                        │
│             │ (service worker)      │                        │
│             │                       │                        │
│             │ get-brain handler →   │                        │
│             │ reads cached BRAIN    │                        │
│             └──────────────────────┘                        │
│                                                             │
│  ┌──────────┐  ┌──────────────────┐  ┌──────────────────┐ │
│  │IndexedDB │  │ chrome.storage    │  │ File System      │ │
│  │ folder   │  │ .local            │  │ Access API       │ │
│  │ handle   │  │ • llm-provider    │  │ writes/reads     │ │
│  │          │  │ • llm-api-key     │  │ BRAIN.md to/from │ │
│  │          │  │ • brain-cache     │  │ your chosen      │ │
│  │          │  │ • last-extracted  │  │ folder           │ │
│  └──────────┘  └──────────────────┘  └──────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                          │
                          │ ONE outbound call per Extract Now:
                          ▼
                  ┌──────────────────┐
                  │ engram.js calls   │
                  │ your chosen LLM:  │
                  │ • Anthropic       │
                  │ • OpenAI          │
                  │ • OpenRouter      │
                  │ • Ollama (local)  │
                  └──────────────────┘
```

### Component responsibilities

| File | Job |
|---|---|
| `content.js` | Injected into AI platform pages. Reads DOM via verified selectors. Auto-injects `BRAIN.md` into new Claude.ai conversations. |
| `popup.js` | Extension UI. Holds the FileSystemDirectoryHandle in memory after grant. Orchestrates the full Extract Now flow. |
| `background.js` | Service worker. Handles `get-brain` messages from the content script by reading the popup-maintained cache in `chrome.storage.local`. |
| `engram.js` | Provider-whitelisted LLM extraction. Validates API keys, scrubs logs of secrets, validates LLM output shape, rewrites date and platform fields deterministically. |
| `storage.js` | IndexedDB (handle persistence) + File System Access API (BRAIN.md read/write). |
| `templates.js` | Per-platform wrappers for the Copy Brain feature. |

### Data flow — Extract Now

1. User clicks **Extract Now** in the popup.
2. `popup.js` sends `chrome.tabs.sendMessage({action:'extract'})` to the active tab.
3. `content.js` reads the DOM, builds a `User: ... / Assistant: ...` transcript, sends it back.
4. `popup.js` calls `engram.extract(...)` — the **only** outbound network call.
5. `engram.js` POSTs to the configured LLM provider with the Engram system prompt + the transcript.
6. LLM returns a `### date — platform — topic` entry (or `NOTHING_TO_CAPTURE`).
7. `engram.js` validates the entry shape, rewrites date + platform deterministically, returns it.
8. `popup.js` calls `storage.appendToBrain(handle, entry)` — writes to `BRAIN.md` directly under the `## Decisions Log` header (newest first).
9. `popup.js` mirrors the new `BRAIN.md` into `chrome.storage.local['brain-cache']` so the auto-inject path can read it later without re-prompting for file access.

### Data flow — Auto-inject (Claude.ai only)

1. `content.js` polls `location.href` every 500ms on Claude.ai pages.
2. On URL change to `claude.ai/new` (or `claude.ai/`), and with zero existing turns in the DOM, `content.js` sends `get-brain` to the service worker.
3. `background.js` returns the cached `BRAIN.md` from `chrome.storage.local`.
4. `content.js` wraps the brain in the Claude template (`<context>…</context>` + a "treat as constraints" trailer) and injects into the ProseMirror input via `execCommand('insertText')` (with an `InputEvent` fallback if `execCommand` is removed by Chrome).
5. The user sees their decision history pre-filled. They can edit before sending.

---

## What makes this different

Every existing AI memory tool — Rethread, OpenMemory, MemoryPlugin, AI Context Flow — stores profile memory. Who you are. What you prefer. Facts about your setup.

Total Recall stores decision memory. What you chose. Why. What you ruled out and the reason.

There is also a sovereignty difference.

Every tool above stores your memory in their infrastructure — browser storage that is locked to their extension, or cloud servers you do not control. Total Recall writes to a plain markdown file on your machine. You own it. It travels with you to any AI tool. Delete the extension and the file stays.

---

## Sovereignty

`BRAIN.md` lives on your machine. Not in a database. Not in the cloud. Not in browser storage tied to this extension.

A plain markdown file in a folder you choose. Open it in any text editor. Paste it into any AI. Commit it to git. Share it with a teammate. Move it to a new machine.

The extension needs permission to write to that folder once. After that it writes silently, locally, with no network call except the Engram LLM extraction.

---

## Setup

> v0.1 is not yet on the Chrome Web Store. Install as a developer/unpacked extension.

1. Download or clone the repository: [github.com/robertangeles/cc-total-recall](https://github.com/robertangeles/cc-total-recall)
   ```sh
   git clone https://github.com/robertangeles/cc-total-recall.git
   ```
2. Open `chrome://extensions` (or `edge://extensions`).
3. Toggle **Developer mode** on (top-right).
4. Click **Load unpacked** and select the project root (the folder containing `manifest.json`).
5. Pin the Total Recall icon to your toolbar.
6. Click the icon. The Welcome card walks you through the rest:
   - **Choose Brain Folder** — pick any folder on your machine. `BRAIN.md` will live there.
   - **Configure Engram** — pick a provider (Anthropic, OpenAI, OpenRouter, or Ollama for fully local), paste an API key (Ollama needs no key).

The Help panel inside the popup (the `?` icon in the header) has plain-English explanations of every step, including how to create an API key for each provider.

`BRAIN.md` is created from a template on first connection. Total Recall always appends — it never overwrites your file.

---

## Using BRAIN.md

Paste the contents of `BRAIN.md` at the start of any AI session where context matters:

```
Here is my decision memory. Treat these decisions as constraints, not suggestions.
[paste BRAIN.md contents]

Now: [your actual task]
```

The AI now knows what was already decided, what was already ruled out, and why. It works inside your actual constraints instead of proposing what you already rejected.

---

## Supported platforms (v0.1)

| Platform | Extract Now | Copy Brain | Auto-inject |
|---|---|---|---|
| **Claude.ai** | ✅ verified | ✅ | ✅ |
| **ChatGPT** | ⚠️ experimental | ✅ | — |
| **Gemini** | ⚠️ experimental | ✅ | — |
| **DeepSeek** | ⚠️ experimental | ✅ | — |

"Experimental" means the DOM selectors are spec-baseline and may be stale — extraction may find nothing on those sites. Copy Brain works regardless because it doesn't read the page; it just wraps your `BRAIN.md` and copies it to your clipboard.

Reliable extraction on all four platforms is on the v0.2 roadmap.

---

## Tech stack

- **Manifest V3** Chrome extension
- **Vanilla JavaScript** — no React, no TypeScript, no build step, no bundler, zero npm dependencies
- **File System Access API** for local `BRAIN.md` writes
- **IndexedDB** for directory handle persistence
- **chrome.storage.local** for settings and brain cache (never `chrome.storage.sync` — no cloud)
- **fetch** for the single outbound LLM call per Extract Now

### LLM providers — bring your own key (or none, with Ollama)

| Provider | Default model | Where to get a key |
|---|---|---|
| **Anthropic** | `claude-haiku-4-5-20251001` | console.anthropic.com/settings/keys |
| **OpenAI** | `gpt-4o-mini` | platform.openai.com/api-keys |
| **OpenRouter** | `anthropic/claude-haiku-4-5` | openrouter.ai/keys |
| **Ollama (local)** | `llama3.2:3b` | ollama.com/download — no key |

Cloud providers cost a fraction of a cent per Extract Now. Ollama is free.

### Browser compatibility

- **Chrome / Edge** — fully supported.
- **Brave** — works after enabling `brave://flags/#file-system-access-api` (Brave disables the API by default for privacy reasons).
- **Firefox** — not supported (no File System Access API, different extension model).

---

## Status — v0.1

### What works
- ✅ Claude.ai conversation extraction (DOM selectors verified live)
- ✅ `BRAIN.md` creation, append (newest-first under `## Decisions Log`), read
- ✅ Auto-inject brain context on `claude.ai/new`
- ✅ Copy Brain on all four supported AI sites with platform-specific wrappers
- ✅ Four LLM providers (Anthropic, OpenAI, OpenRouter, Ollama)
- ✅ Provider whitelist, API key format validation, LLM output validation, transcript size cap
- ✅ Settings UI with model dropdown + custom override, eye-toggle for API key
- ✅ In-popup Help panel covering every concept in plain language

### Known limitations
- ⚠️ Extract Now verified on Claude.ai only. Other platforms experimental.
- ⚠️ Three clicks per save (icon → Reconnect → Extract Now). Chromium permission lifecycle, not our choice.
- ⚠️ `document.execCommand('insertText')` is deprecated. The `InputEvent` fallback for auto-inject exists but is untested. If Chrome removes `execCommand`, auto-inject may silently fail until the fallback is verified.

### v0.2 roadmap
- Verify ChatGPT, Gemini, DeepSeek DOM selectors against live pages
- Test the `InputEvent` auto-inject fallback
- "Manual Capture" button (skip the LLM — let users type decisions directly)
- Encrypted API key storage (passphrase-derived)
- Cap the chrome.storage.local brain-cache to avoid the 10MB quota silently breaking auto-inject on long brains

Full backlog in `wiki/backlog/backlog.md`.

---

## Contributing

Total Recall is MIT licensed. The spec lives in `TOTAL-RECALL-SPEC.md`. `CLAUDE.md` defines how to build it. The pre-ship audit and threat model are in `wiki/`.

The most useful contributions right now:

- DOM selector verification for ChatGPT / Gemini / DeepSeek — these change frequently
- `InputEvent` auto-inject fallback testing against Claude's ProseMirror editor
- Firefox port
- Auto-extraction on conversation end (debounced idle trigger)

Open an issue before building a feature. The spec is the source of truth.

---

## Why this exists

I built this because I kept losing my own thinking between AI conversations.

I am a solo founder running an AI consulting practice, building two products at once, doing a job search in parallel, and writing a weekly newsletter. Every workstream lives in AI conversations. Every decision I made last week is gone by next week.

I looked for a tool that captured what I actually decided. Not my preferences. Not my profile. The specific choices, the reasoning, the things I ruled out.

It did not exist. So I built it.

— Rob Angeles, Archos Labs

---

## License

MIT. Use it, fork it, build on it.
