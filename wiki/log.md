# Session Log

## 2026-05-20 — Project Initialised

Total Recall project created. CLAUDE.md and build spec written.
Architecture decided: Manifest V3, vanilla JS, File System Access API, OpenRouter.
BRAIN.md format specified. Engram extraction prompt finalised.

## 2026-05-20 — Scaffold Complete (Step 1)

All files and folders created directly in `cc-total-recall/` project root (no nested wrapper).
Extension scaffold ready to load unpacked in Chrome.
Files contain minimal stubs or final spec content; full logic arrives in Steps 2-10.

## 2026-05-20 — Steps 2-3: handle persistence + folder picker

`storage.js` IndexedDB persistence implemented for the FileSystemDirectoryHandle.
Popup folder selection working. Discovered that FSA permission grants are bound
to the specific JS handle object — fresh IDB-retrieved handles always come back
in `'prompt'` state. Added in-memory `currentHandle` cache in popup so file ops
use the granted reference. Added Reconnect button for the once-per-popup-session
permission upgrade.

## 2026-05-20 — Step 4: BRAIN.md init + append

`storage.js` BRAIN.md operations complete. `initBrain` writes template if missing,
`appendToBrain` inserts new entries directly under `## Decisions Log` (newest first).
Auto-inits on append. Validated against real test-brain folder.

## 2026-05-20 — Steps 5-7: templates, extraction, auto-inject

`templates.js` already correct from scaffold (verified all five branches via Node).
`content.js` Claude.ai DOM extraction updated for current site (class-based
`!font-user-message` + `.font-claude-response`). The spec's data-testid selectors
were stale; new ones verified via probe.
Auto-inject on `claude.ai/new` working — content script reads cached brain from
`chrome.storage.local`, wraps in Claude template, injects into ProseMirror input
via `execCommand('insertText')` with `InputEvent` fallback.

## 2026-05-20 — Steps 8 + 8.5: Engram + security hardening

`engram.js` calls a whitelisted LLM provider (Anthropic, OpenAI, OpenRouter, Ollama),
returns a validated `### date — platform — topic` BRAIN.md entry.
Security pass: provider whitelist prevents SSRF, API key format validation per provider,
`safeLog()` scrubs key-like substrings before any console output, Engram output
validated against entry shape (no HTML, no scripts), content-script hostname re-check,
explicit manifest CSP `script-src 'self'; object-src 'self'; base-uri 'self'`,
transcript capped at 200KB.
Threat model documented in `wiki/concepts/security-threat-model.md`.

## 2026-05-20 — Step 9: full end-to-end flow

New popup UI with status rows, settings panel, provider picker with per-provider
onboarding help, live key format validation, Test connection button, Extract Now,
Copy Brain. Full extract→engram→append→cache-refresh flow verified end-to-end
against OpenRouter on a real Claude.ai conversation. Engram entry quality is
high — captured actual Chose/Why/Rejected decisions, real context shifts, and the
correct open question. Cross-platform Copy Brain verified producing distinct
wrappers per AI platform.

Polish: `engram.js` now post-processes the header (`normalizeHeader`) so date and
platform fields are deterministic regardless of LLM output. The LLM keeps the topic
field. Fix lands for future entries; one prior entry in BRAIN.md still has the
LLM's `[PERSON_NAME]` placeholder cosmetic bug — left in place as evidence.

v0.1 is functionally complete pending stress tests.
