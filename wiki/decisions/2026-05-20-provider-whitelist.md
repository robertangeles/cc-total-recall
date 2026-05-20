---
title: Decision — LLM provider whitelist instead of free-form endpoint
category: decision
created: 2026-05-20
updated: 2026-05-20
related: [[security-threat-model]], [[engram]]
---

Chose hardcoded provider whitelist over user-configurable endpoint URL.

## Context

Step 8 builds Engram, the LLM-driven extraction engine. User asked for the LLM to be user-configurable (multi-provider). User also asked for the extension to be hardened against attack.

These two requirements pull in opposite directions if implemented naively: a free-form endpoint URL field is the most flexible, but it's also a textbook SSRF primitive — an attacker who can influence the URL can make the extension talk to internal services (`http://192.168.1.1/admin`, `http://localhost:8080/...`, cloud metadata endpoints, etc.).

## Decision

Chose a **fixed map of three providers** in [engram.js](../../engram.js):
- `anthropic` → `https://api.anthropic.com/v1/messages`
- `openai` → `https://api.openai.com/v1/chat/completions`
- `openrouter` → `https://openrouter.ai/api/v1/chat/completions`

User picks a provider by name (a map key). User never types a URL.

Rejected: free-form URL input with allow-listed prefix matching.
- Allow-list parsing is a known footgun (URL parsers vs regex differ; bypass via `userinfo`, fragments, etc.).
- Even with strict parsing, the user could mistype `https://api.anthropic.com.attacker.com` and we'd have to defend.
- Zero usability gain over a dropdown.

Rejected: per-call URL parameter.
- Same SSRF surface, more places to defend.

## How to apply

- New provider = code change + manifest `host_permissions` entry. No runtime URL acceptance, ever.
- Per-provider request shape and response parser live in the same map entry, so adding a provider is one diff.
- API key format regex lives in the map entry too, so we reject obviously-wrong keys before any network call.

## Why this is the right tradeoff

Three providers covers ~all production LLMs the target user would want for Engram:
- Anthropic direct: native Claude, lowest latency.
- OpenAI direct: GPT family, in case user has an existing OpenAI relationship.
- OpenRouter: gateway to everything else (Gemini, Llama, Mistral, etc.) via one key.

Adding more providers later is a small diff. Not worth carrying SSRF risk for the v0.2 case of "I want to use Cerebras directly."
