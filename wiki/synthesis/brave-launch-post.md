---
title: Brave Community Launch Post — Draft
category: synthesis
created: 2026-05-21
updated: 2026-05-21
status: DRAFT — gated on verification matrix passing
related: [[2026-05-21-brave-browser-support]], [[2026-05-21-brave-browser-eng-review]], [[2026-05-21-brave-verification-pending]]
---

Draft launch post for r/brave or the Brave Community forum. **Do not ship**
until the verification matrix in
[[2026-05-21-brave-verification-pending]] completes with all critical rows
passing. Pasting this post on top of a broken setup procedure burns trust
that takes months to rebuild.

---

## Target venues (pick one or two, not all)

- **r/brave** (Reddit) — 250k+ subscribers, friendly to extension launches
  if framed as "built for the Brave audience" not "shilling on Brave"
- **community.brave.com** — Brave's own forum, "Brave Feature Requests" or
  "Browser Support" category
- **Brave Community Discord** — slower-moving, but admins do amplify

Avoid HackerNews for this — wrong audience for a Brave-specific framing.

---

## Post body

**Title:** Total Recall — open source AI memory that writes to your machine,
not the cloud. Now Brave-aware.

---

I built an open source Chrome extension that captures what you decided in
AI conversations and writes it to a local markdown file you own. Not the
cloud. Not their database. A file in a folder you choose.

It works in Brave. The popup detects you're on Brave and gives you a
Shields-specific hint if extraction comes back empty (usually means
Shields-Aggressive on the AI site). v0.1 stress-tested on Brave under each
Shields setting — results in the repo.

Why I think Brave users in particular might want this:

- BRAIN.md lives on your machine. Not their infrastructure. Same trust
  model Brave has trained you to expect.
- Works with Anthropic, OpenAI, OpenRouter, or fully local via Ollama. Zero
  cloud is a real option.
- No account. No telemetry. No analytics. The single outbound network
  call per save is to whatever LLM you chose. That is it.
- MIT licensed. Fork it, audit it, run it.

The pitch: every existing AI memory tool stores profile memory — facts
about who you are. Total Recall stores decision memory — what you chose,
why, and what you ruled out. Different problem, different shape.

Install (load unpacked from `brave://extensions`):
https://github.com/robertangeles/cc-total-recall

Feedback welcome, especially from anyone running Shields-Aggressive on
Claude.ai — I want to know if the in-popup hint is enough or if you'd
want a different UX.

---

## Why this framing works for Brave specifically

1. **Sovereignty alignment** — Brave's pitch is "your data, your machine."
   Total Recall's pitch is the same applied to AI memory.
2. **Privacy without preaching** — the post does not lecture about privacy.
   It assumes the reader gets it.
3. **Concrete, not hype** — names the actual config (Shields levels,
   provider list, Ollama option), no buzzwords.
4. **Asks for feedback, not just installs** — invites the audience to be
   testers, which is what they actually want to do.

## Things to NOT do in this post

- Do not call it "the only privacy-first AI memory tool" (it is the only
  one I know of, but unverifiable superlatives read as marketing)
- Do not mention competitors by name (Rethread, OpenMemory etc.) — picks
  a fight, wrong audience for it
- Do not promise Firefox support (we do not have it, do not start a fight
  about it now)
- Do not paste the README — link to it, post should stand alone
- Do not post until verification matrix passes

## Timing

Target ship: v0.2 release window. Reasons:
1. v0.1 has known limitations (3-clicks-per-save, experimental platform
   selectors) that Brave audience will hammer on
2. v0.2 ships ChatGPT/Gemini/DeepSeek selector fixes — strictly better
   first impression
3. Verification matrix needs to pass before the post is honest

If v0.2 slips, post anyway with a clear "v0.1, verified on Claude.ai
only" preface. Honesty beats waiting.
