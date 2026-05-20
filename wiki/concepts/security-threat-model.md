---
title: Security Threat Model
category: concept
created: 2026-05-20
updated: 2026-05-20
related: [[engram]], [[provider-whitelist]]
---

Adversary-facing summary of how Total Recall could be attacked and what's been done about it. Updated as we discover new attack surfaces.

## Assets we protect

1. **The user's LLM API key** — high value, lets attacker spend the user's money and impersonate them with the LLM provider.
2. **The user's BRAIN.md content** — strategic decision history. Sensitive but the user already keeps it as plaintext on their disk by design.
3. **The user's AI conversation transcripts** — only handled in-memory and at the LLM call, never persisted by us.

## Threat table

| Threat | Vector | Mitigation | Status |
|---|---|---|---|
| Key theft by other extension | Reading our `chrome.storage.local` | Chrome sandboxes storage per-extension | Structural |
| Key theft by AI page | Cross-context reads | Content script isolated world; popup is `chrome-extension://` origin | Structural |
| Key in console logs | `console.log(err)` leaks key in stack/message | `safeLog()` in engram.js scrubs all key-shaped substrings before logging | Code |
| Key in BRAIN.md | Bad string interpolation | Engram output is validated against entry shape before write; system prompt explicitly forbids echoing secrets | Code + prompt |
| SSRF via configurable endpoint | User input → arbitrary URL → internal network access | Provider whitelist in engram.js — only `anthropic`, `openai`, `openrouter`, `ollama` map keys accepted, endpoints hardcoded | Code |
| Loopback HTTP exposure (Ollama) | Plaintext fetch to `http://localhost:11434` | Loopback never leaves the machine; not subject to network sniffing. An attacker with process-level access already wins. Acceptable exception to "HTTPS only." | Documented |
| Prompt injection | Adversarial conversation tells Engram to output malicious content | Output validation: must start with `### `, must have one of three known section headers, no HTML tags allowed | Code |
| Auto-inject to lookalike domain | DNS hijack or extension misconfig | manifest `matches` limits hosts + content.js re-checks `location.hostname === 'claude.ai'` before injection | Code (defense-in-depth) |
| XSS in popup | `innerHTML` of untrusted text | We only use `textContent`/`className`; explicit CSP `script-src 'self'; object-src 'self'; base-uri 'self'` in manifest | Code |
| Supply chain (npm) | Compromised dependency | Zero npm dependencies. Vanilla JS, no build step, no `package.json` | Structural |
| Cost-of-service abuse | Massive transcript inflates LLM bill | Transcript capped to 200 KB before send | Code |
| Phishing fork | Attacker publishes typo-domain copy with exfiltration | Publisher hygiene at Web Store ship time | Out of code scope |
| Filesystem compromise | Attacker already controls user's disk | None — if attacker has filesystem access they have everything | Out of scope (sovereign tradeoff) |
| Web Store publisher compromise | Push malicious update via official channel | 2FA on publisher account at ship time | Out of code scope |

## Design rules (binding)

These hold for every change to this codebase:

1. **No `eval`, no `new Function`, no inline scripts.** MV3 forbids them anyway; the explicit CSP enforces this.
2. **No `innerHTML` with user-controlled or LLM-output content.** Use `textContent`.
3. **No free-form URL input.** Anything that becomes a `fetch()` target must come from the `PROVIDERS` map in [engram.js](../engram.js) or `host_permissions` in [manifest.json](../manifest.json).
4. **No log emits any value that has not gone through `scrub()`.** Anywhere in the extension that handles an API key.
5. **No `web_accessible_resources`** unless required by a specific feature with a documented reason. Empty list means pages cannot fingerprint or load our files.
6. **No silent permission upgrades.** If we want a new origin or capability, it goes into `manifest.json` and ships as an update the user reviews.
7. **Engram output is untrusted.** Every LLM response gets shape-validated by `isValidEntry()` before it can reach BRAIN.md.
8. **Content scripts re-check hostname** even though manifest limits hosts. Defense in depth.

## What "secure" honestly means here

Total Recall is not unbreakable. An attacker who can:
- compromise Chromium itself, **or**
- gain code execution on the user's machine, **or**
- compromise the LLM provider's API, **or**
- trick the user into installing a fork

…can defeat us. We don't claim defense against those.

What we do claim:
- **No content the user visits** can read their key, their BRAIN.md, or their conversation transcripts through Total Recall.
- **No prompt injection** can cause the extension to fetch an unexpected URL, write arbitrary content to disk, or run code.
- **No silent data egress.** The only outbound network call is to the user-chosen LLM provider, carrying the user's own conversation, with the user's own key.

## Future work (v0.2+)

- **Encrypted key storage** — passphrase-derived key wraps the API key at rest. Mitigates filesystem-compromise threat partially. Costs onboarding friction.
- **Audit log** — append-only record of what Total Recall did and when. User-visible.
- **Signed releases** — Web Store publication step.
- **Optional Tor / proxy support** — for users who don't want their LLM provider to see their IP.
