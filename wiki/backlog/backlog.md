# Total Recall Backlog

Ordered by priority. Top = build next.

## v0.1 — Core (functionally complete 2026-05-20)
- [x] Step 1 — Scaffold: all files and folders created
- [x] Step 2 — storage.js: IndexedDB handle persistence
- [x] Step 3 — popup.html/js: folder selection flow
- [x] Step 4 — storage.js: BRAIN.md initBrain + appendToBrain
- [x] Step 5 — templates.js: all four platform wrappers verified
- [x] Step 6 — content.js: Claude.ai DOM extraction (class-based selectors)
- [x] Step 7 — content.js: Claude.ai new-conversation auto-inject
- [x] Step 8 — engram.js: LLM extraction with Chose/Why/Rejected
- [x] Step 8.5 — security hardening (provider whitelist, validation, CSP, threat model)
- [x] Step 9 — popup UI: settings, Extract Now, Copy Brain, full flow
- [ ] Stress tests (see below) before declaring DONE

## Stress test checklist (before declaring v0.1 DONE)
- [ ] Phase 6: fresh Extract Now produces clean `— claude —` header (no `[PERSON_NAME]`)
- [ ] Switch provider in settings (e.g. OpenRouter → Anthropic), save, run Extract Now
- [ ] "Nothing to capture" path: extract from a small-talk conversation, verify entry is NOT written
- [ ] Bad API key: enter sk-or-INVALID in settings, Test connection → expect clear error
- [ ] Browser restart: close Edge, reopen, popup should show "reconnect needed" for folder, key still saved
- [ ] Long conversation: scroll-load a very long Claude.ai chat, extract, verify transcript cap applies
- [ ] Test Ollama if installed (local privacy path)
- [ ] Copy Brain on Gemini and DeepSeek (verify those wrappers work, not just Claude/ChatGPT)
- [ ] Settings persistence across popup close/reopen
- [ ] **Brave matrix:** run the full v0.1 stress test inside Brave under Shields Standard / Aggressive / Off. Track in `wiki/lessons-learned/2026-05-21-brave-verification-pending.md`. Promote findings to README on completion.

## v0.2 — Platform Coverage
- [ ] content.js — ChatGPT DOM extraction + auto-inject
- [ ] content.js — Gemini DOM extraction + auto-inject
- [ ] content.js — DeepSeek DOM extraction + auto-inject
- [ ] Verify all selectors on live pages before shipping

## v0.2 — UX polish
- [ ] Manual Capture button — let user type a one-line decision directly, no LLM call
- [x] ~~UTF-8 BOM on BRAIN.md so Notepad opens it correctly~~ — shipped 2026-05-21 (storage.js: BOM prepended on initBrain + appendToBrain; readBrain strips for downstream consumers; existing files auto-migrate on next append)
- [ ] Disable auto-inject toggle (some users may want manual paste only)
- [ ] First-run onboarding wizard (currently the settings panel doubles as setup)
- [ ] Encrypted API key storage (passphrase-derived)

## v0.3 — Auto-extraction
- [ ] Detect conversation-end signal (idle threshold) and auto-trigger Extract Now
- [ ] Settings toggle for auto-extract on/off
- [ ] Settings for idle threshold

## v0.3 — Brave-aligned candidates (from 2026-05-21 CEO review)
- [ ] **Leo provider integration** — add Brave's local LLM (Leo) to the provider whitelist as a fifth option alongside Anthropic / OpenAI / OpenRouter / Ollama. Leo exposes an API surface similar to Ollama. Genuine product work, not Brave compatibility.

## v0.2 — Brave-aligned candidates (from 2026-05-21 CEO review)
- [ ] **Brave Search AI as a supported platform** — add to host_permissions + content_scripts alongside Claude / ChatGPT / Gemini / DeepSeek. DOM selectors TBD. Belongs with the rest of the v0.2 platform-coverage selector work.

## v0.4 — Open Source Release
- [ ] README.md (write after v0.1 ship)
- [ ] CONTRIBUTING.md
- [ ] GitHub repo setup
- [ ] Chrome Web Store listing
- [ ] LinkedIn announcement post

## Architectural opens (discovered during build)
- Service worker file system access: SW can't reliably read BRAIN.md (handle permission resets on every fetch). Worked around via chrome.storage.local mirror updated by popup. If we want SW-driven background extraction (v0.3), the offscreen document API may be the answer.
- Permission lifetime: amber "reconnect" appears once per popup-open. Could investigate offscreen document for "always granted in this browser session" UX.

## v0.2 — Model catalog validation (from 2026-05-21 empirical failure)

- [ ] **Validate the Anthropic direct API model list** (`claude-haiku-4-5-20251001`, `claude-sonnet-4-6-20251001`, `claude-opus-4-7` in popup.js) against the Anthropic /v1/models endpoint. Currently unverified — point-in-time hardcoded slugs that may drift. Test with a real Anthropic key.
- [ ] **Validate the OpenAI direct API model list** (`gpt-4o-mini`, `gpt-4o`, `gpt-4.1-mini` in popup.js) against the OpenAI /v1/models endpoint. Same risk class. Test with a real OpenAI key.
- [ ] **Consider runtime model fetching** — replace hardcoded altModels with a one-shot fetch of each provider's /models endpoint on first popup open per session. Trades a tiny startup cost for the model lists never going stale again. v0.3 candidate if hardcoded lists keep drifting.
- [ ] **Detect orphaned saved model slugs and warn the user.** When `applyStoredModel` (popup.js:320-336) falls back to custom-text mode because the saved slug doesn't match any altModel option, the UI silently shows the stale slug as plain text. The toggle button at popup.js:1150 says "Choose from list" but users may not realise their saved model is broken. On popup open: if the saved slug doesn't match the current altModels AND triggers a 404 on the next Extract Now, surface a banner offering to reset to the current default. Empirically encountered 2026-05-21 when a v0.1 user upgraded to a popup.js that no longer included `google/gemini-flash-1.5` in altModels — Extract Now kept returning "Model not found" with no hint that the saved model was the cause.

**Why this matters:** the OpenRouter list shipped in v0.1 contained `google/gemini-flash-1.5` (404 — model deprecated) and `anthropic/claude-haiku-4-5` (worked only via OpenRouter's silent alias; canonical slug uses a dot, not a hyphen). Empirically discovered 2026-05-21 during cross-model testing. Fixed in same-day commits, but the broader concern — no provider list was validated at v0.1 ship time — applies to Anthropic and OpenAI lists too.

## v0.2 — Carry-forward items from pre-ship audit (2026-05-20)
- [ ] **Verify ChatGPT DOM selectors against live page** — currently spec-baseline (`[data-message-author-role]`). Run the probe snippet on chatgpt.com, update content.js SELECTORS.chatgpt, mark platform as verified in popup help.
- [ ] **Verify Gemini DOM selectors against live page** — currently spec-baseline (`.user-query-text, .model-response-text`). Same probe + update flow.
- [ ] **Verify DeepSeek DOM selectors against live page** — currently spec-baseline (`.user-message, .assistant-message`). Same probe + update flow.
- [ ] **Test auto-inject's `InputEvent` fallback** — `document.execCommand('insertText')` is deprecated and may be removed by Chrome. The fallback at content.js:124-130 dispatches a synthetic `InputEvent` but is currently UNTESTED against Claude.ai's ProseMirror-controlled React editor. Verify the fallback actually moves text into the input. If it doesn't, we need a different injection strategy (e.g., direct ProseMirror commands via the page context, or `clipboard.write` + auto-paste).
- [ ] **Stress test failure modes** from pre-ship audit:
  - Trigger real OpenRouter API failures (bad key, 402, 429) and verify each branch of `engramErrorMessage` shows the right message
  - Grow BRAIN.md to 4MB+ and confirm append latency, then to 10MB+ where chrome.storage.local cache silently fails
- [ ] **Cap the chrome.storage.local brain-cache to last N entries** — the full BRAIN.md on disk stays uncapped, but the auto-inject mirror could be bounded (e.g., last 50 entries) to avoid the 10MB quota silently breaking auto-inject on long-running brains.
- [ ] **Distinguish "Engram returned nothing" from quota-cache-stale silently failing** — currently both look the same to users.
