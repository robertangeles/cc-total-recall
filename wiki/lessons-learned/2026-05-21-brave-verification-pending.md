---
title: Brave Verification — Pending Results
category: lessons-learned
created: 2026-05-21
updated: 2026-05-21
related: [[2026-05-21-brave-browser-support]], [[2026-05-21-brave-browser-eng-review]]
---

Verification matrix for Brave Browser support. **Status: PENDING — requires a
human at a keyboard with Brave installed.** Fill in results inline as each
check completes, then promote findings into the README.

## Why this exists

The previous README (pre-2026-05-21) claimed Brave worked after enabling
`brave://flags/#file-system-access-api`. That claim was never tested. The
eng review flagged it as a falsifiable, load-bearing claim. This doc
captures the actual test results so the README can be updated with truth.

---

## Setup

Before running the matrix:

1. Install Brave (current stable release).
2. Open `brave://extensions`.
3. Toggle **Developer mode** on (top-right).
4. Click **Load unpacked**, select the `cc-total-recall/` project root.
5. Pin the Total Recall icon to the Brave toolbar.

Record the Brave version tested:

- **Brave version:** 148.1.90.122
- **Chromium engine version:** _to capture from brave://version_
- **Test date:** 2026-05-21
- **Tester:** Rob Angeles (houseofbakunawa@gmail.com)
- **Required setup step:** Enable `brave://flags/#file-system-access-api` → set to **Enabled** → click **Relaunch**. Without this, `window.showDirectoryPicker` is undefined and the folder picker throws `TypeError`.

---

## File System Access API — flag verification

The old README cited `brave://flags/#file-system-access-api`. Verify:

- [ ] Open `brave://flags` and search "file system". Record the exact flag
      name(s) and current default state.
- [ ] If FSA works without any flag toggle in current Brave: confirm and
      remove the flag claim from README entirely.
- [ ] If a flag is required: record the exact flag URL and default state.
- [ ] If FSA is disabled entirely in current Brave: document the actual
      blocker (Shields setting, permission UI, etc.) and the workaround.

**Result (2026-05-21, partial):**

`typeof window.showDirectoryPicker === 'undefined'` in default Brave (Shields
Standard). The popup logs:

```
[Total Recall] pickFolder failed: TypeError: window.showDirectoryPicker is
not a function
    at pickFolder (popup.js:671:33)
```

This is API absence, not a permission denial. Shields setting irrelevant —
the function does not exist on `window`.

**Open question:** does `brave://flags` in current Brave expose a toggle that
re-installs the API, or has Brave removed FSA entirely from the build? See
"Open questions for tester" below.

---

## Stress test matrix (42 checks)

Each codepath × each Shields setting. Mark P=pass, F=fail, N=not-applicable.
Record notes inline for any non-pass.

| # | Codepath / Flow | Shields Standard | Shields Aggressive | Shields Off |
|---|---|---|---|---|
| 1 | Load unpacked in `brave://extensions` | P | _ | _ |
| 2 | popup.html opens via toolbar icon | P | _ | _ |
| 3 | Folder picker opens (FSA API, flag enabled) | P | _ | _ |
| 3a | Folder picker WITHOUT flag enabled | F (TypeError) | F | F |
| 4 | IndexedDB persists folder handle | P (in-session) | _ | _ |
| 5 | Browser restart → "reconnect needed" → re-grant works | P | _ | _ |
| 6 | content.js injects on claude.ai | P | _ | _ |
| 7 | Claude DOM read returns transcript | P | _ | _ |
| 8 | Auto-inject on claude.ai/new pre-fills input | P | _ | _ |
| 9 | engram.js fetch to chosen LLM provider succeeds | P (OpenRouter) | _ | _ |
| 10 | BRAIN.md append succeeds | P (4 entries written) | _ | _ |
| 11 | Copy Brain on Claude | P | _ | _ |
| 12 | Copy Brain on ChatGPT | P | _ | _ |
| 13 | `navigator.brave.isBrave()` returns true (DevTools check) | P | P | P |
| 14 | E6 Shields hint surfaces on empty extract | P | _ | _ |

---

## Edge cases

- [ ] **Brave Private Window:** does FSA picker open? Expected: blocked.
      Actual: _PENDING_
- [ ] **Brave Tor Window:** same expectation as Private. Actual: _PENDING_
- [ ] **Brave Leo open on Claude.ai tab:** does Leo's sidebar collide with
      our content script's DOM reads? Actual: _PENDING_
- [ ] **Ollama provider on localhost:** does Brave block extension fetches
      to `http://127.0.0.1:11434`? host_permissions should bypass.
      Actual: _PENDING_

---

## Regression check (Edge)

After completing the Brave matrix:

- [ ] Reload extension in Edge
- [ ] Verify Extract Now on Claude.ai still works
- [ ] Verify the E6 Shields hint does NOT fire on Edge (the
      `isBrave` flag should stay `false`)

Result: _PENDING_

---

## Findings to promote to README

After verification, update README.md "Browser compatibility" section with:

1. Whether any flag toggle is required (and the exact flag path if so)
2. Which Shields setting works out of the box for Claude.ai
3. Any Brave-specific gotchas worth warning users about

If the Brave Community launch post (`wiki/synthesis/brave-launch-post.md`)
is going to ship, gate it on this matrix completing with all critical
(★★★) rows passing.

---

## Additional findings from 2026-05-21 verification session

### Shields Aggressive spot-check (Claude.ai)
Set Brave Shields → "Block trackers & ads" → Aggressive on claude.ai,
reloaded page, ran Extract Now. **Result: still extracts cleanly.** The E6
Brave hint in popup.js did NOT fire because the content script was not
blocked — current Brave's Aggressive trackers/ads setting does not block
extension content scripts. The hint code remains as defensive guidance
for users who set Block Scripts manually or for future Brave versions.

### Alt-model empirical verification via OpenRouter
After fixing stale model slugs (commit 8ff8175 — `gemini-flash-1.5` was a
dead model, dotted slugs are canonical for Anthropic on OpenRouter):

| Model (OpenRouter slug) | Extract result | [PERSON_NAME] artifact |
|---|---|---|
| anthropic/claude-haiku-4.5 (default) | Saved | Yes (multiple occurrences) |
| openai/gpt-4o-mini | Saved (after header-prefix fix 5b7ce9f) | Yes |
| google/gemini-2.5-flash-lite | Saved | Not specifically tested for [PERSON_NAME] |
| meta-llama/llama-3.2-3b-instruct | Saved | Not specifically tested for [PERSON_NAME] |

Four OpenRouter models confirmed working with Engram's strict shape
validation. The header-prefix tolerance fix (5b7ce9f) was the unlock for
gpt-4o-mini; subsequent models worked without further accommodation.

[PERSON_NAME] redaction reflex was confirmed cross-model on Haiku and
gpt-4o-mini; not specifically retested on Gemini and Llama since the
finding (model-side PII reflex, not prompt-fixable) was already established.

## Format note

When this file is completed, rename it to
`2026-05-21-brave-verification-results.md` and update [[index]] +
[[2026-05-21-brave-browser-eng-review]] to link to it.
