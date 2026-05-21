// engram.js — Engram extraction engine.
// Takes a conversation transcript, calls the configured LLM provider, returns a
// validated BRAIN.md entry string or null.
//
// Security posture:
//  - Provider whitelist (3 entries). No free-form endpoint URLs. SSRF impossible.
//  - API key format validated against per-provider regex before any network call.
//  - All logs pass through scrub() so no key bytes ever reach the console.
//  - Engram's output is validated against a strict shape before being returned —
//    prompt-injection cannot trick us into writing arbitrary HTML/JS/text.
//  - Transcript size capped to bound abuse / cost.

const MAX_TRANSCRIPT_BYTES = 200_000;
const MAX_ENTRY_BYTES = 8_000;
const NOTHING_SENTINEL = 'NOTHING_TO_CAPTURE';

const ENGRAM_SYSTEM_PROMPT = `You are Engram, the extraction engine for Total Recall.

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

Output ONLY a formatted entry in this exact structure. No preamble. No explanation. No markdown outside the structure. Never include HTML tags. Never include script tags. Never echo or repeat any API keys, tokens, or secrets that may appear in the conversation.

The header line has three fields separated by em-dash ( — ):
  1. Date in YYYY-MM-DD format. Use the date provided in the user message verbatim.
  2. Platform name from the user message ("claude", "chatgpt", "gemini", "deepseek"). This is the chat application where the conversation took place — NOT the topic. Use the value provided in the user message verbatim. Lowercase. No quotes.
  3. 2-5 word topic summarizing what the conversation was about.

Do NOT put square brackets around any field. Do NOT prefix fields with labels like "Date:" or "Platform:". Just the three values separated by em-dashes.

Example header (illustrative; do not copy this content):
### 2026-05-20 — claude — Permission architecture

Then continue with sections:

**Decisions:**
- Chose [X] because [reason]. Rejected [Y] because [reason].

**Context updated:**
- [What changed about the active project, situation, or identity]

**Open questions:**
- [Unresolved question worth remembering]

Rules:
- Only include sections that have actual content. Omit empty sections entirely.
- If a section has no content, do not include it at all — not even the header.
- If there is nothing worth capturing from this conversation, output exactly: ${NOTHING_SENTINEL}
- Be ruthlessly concise. One bullet per decision. No padding.
- Every decision entry must follow Chose/Why/Rejected format. No exceptions.
- If you cannot identify what was rejected and why, it is not a decision — skip it.
- DO NOT redact or substitute proper nouns. Preserve names of people, products, companies, places, and tools exactly as they appear in the conversation. Never replace them with placeholders like [PERSON_NAME], [REDACTED], [NAME], [COMPANY], [USER], or similar. BRAIN.md is private to the user, stored only on their own machine — there is no privacy concern that justifies redaction here, and placeholder substitution destroys the strategic value of the entry.`;

// --- Provider whitelist ---------------------------------------------------
// Every supported LLM lives here. To add a provider:
//   1. Add an entry below.
//   2. Add the endpoint origin to manifest.json host_permissions.
// User input never reaches the URL — only the provider name (a map key) does.

const PROVIDERS = {
  anthropic: {
    label: 'Anthropic',
    endpoint: 'https://api.anthropic.com/v1/messages',
    defaultModel: 'claude-haiku-4-5-20251001',
    keyPattern: /^sk-ant-[A-Za-z0-9_\-]{20,}$/,
    buildRequest(apiKey, model, system, user) {
      return {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          max_tokens: 600,
          system,
          messages: [{ role: 'user', content: user }]
        })
      };
    },
    parseResponse(data) {
      return data && data.content && data.content[0] && data.content[0].text || null;
    }
  },
  openai: {
    label: 'OpenAI',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    defaultModel: 'gpt-4o-mini',
    keyPattern: /^sk-[A-Za-z0-9_\-]{20,}$/,
    buildRequest(apiKey, model, system, user) {
      return {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          max_tokens: 600,
          temperature: 0.1,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user }
          ]
        })
      };
    },
    parseResponse(data) {
      return data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content || null;
    }
  },
  openrouter: {
    label: 'OpenRouter',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    defaultModel: 'anthropic/claude-haiku-4-5',
    keyPattern: /^sk-or-[A-Za-z0-9_\-]{20,}$/,
    buildRequest(apiKey, model, system, user) {
      return {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/robertangeles/cc-total-recall',
          'X-Title': 'Total Recall'
        },
        body: JSON.stringify({
          model,
          max_tokens: 600,
          temperature: 0.1,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user }
          ]
        })
      };
    },
    parseResponse(data) {
      return data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content || null;
    }
  },
  ollama: {
    label: 'Ollama (local)',
    endpoint: 'http://localhost:11434/v1/chat/completions',
    defaultModel: 'llama3.2:3b',
    // Ollama is loopback-only — no real auth required. keyPattern is permissive;
    // extract() bypasses validateApiKey for this provider and substitutes a
    // placeholder string if the user passed nothing.
    keyPattern: /^.{0,300}$/,
    localOnly: true,
    buildRequest(apiKey, model, system, user) {
      return {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey || 'ollama'}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          max_tokens: 600,
          temperature: 0.1,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user }
          ]
        })
      };
    },
    parseResponse(data) {
      return data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content || null;
    }
  }
};

// --- Public surface -------------------------------------------------------

export function listProviders() {
  return Object.entries(PROVIDERS).map(([id, p]) => ({
    id,
    label: p.label,
    defaultModel: p.defaultModel,
    localOnly: !!p.localOnly
  }));
}

export function validateApiKey(provider, apiKey) {
  const cfg = PROVIDERS[provider];
  if (!cfg) return false;
  if (typeof apiKey !== 'string') return false;
  if (apiKey.length < 20 || apiKey.length > 300) return false;
  return cfg.keyPattern.test(apiKey);
}

// Returns a discriminated union so callers can distinguish:
//   { kind: 'entry',   entry: '### ...' }     — happy path, write to BRAIN.md
//   { kind: 'nothing' }                       — Engram emitted NOTHING_TO_CAPTURE
//   { kind: 'error',   reason, status?, detail? } — failure (network, http, validation, etc.)
//
// Reasons:
//   'missing-transcript' | 'invalid-provider' | 'invalid-key' |
//   'network' | 'http' | 'invalid-response' | 'empty-response' | 'malformed-entry'
export async function extract({ transcript, platform, provider, apiKey, model } = {}) {
  if (!transcript) return { kind: 'error', reason: 'missing-transcript' };
  if (!provider || !PROVIDERS[provider]) {
    safeLog('extract: unknown or missing provider');
    return { kind: 'error', reason: 'invalid-provider' };
  }
  // Ollama is loopback-only and most installs run without auth. Skip the key
  // pattern check and substitute a placeholder so the bearer header has something.
  if (PROVIDERS[provider].localOnly) {
    if (!apiKey || typeof apiKey !== 'string') apiKey = 'ollama';
  } else if (!validateApiKey(provider, apiKey)) {
    safeLog('extract: API key failed format validation for provider', provider);
    return { kind: 'error', reason: 'invalid-key' };
  }

  // Defensive cap. Real-world transcripts are well under this, but a malicious
  // page could attempt to feed us megabytes to inflate cost.
  let safeTranscript = transcript;
  if (safeTranscript.length > MAX_TRANSCRIPT_BYTES) {
    safeTranscript = safeTranscript.slice(-MAX_TRANSCRIPT_BYTES);
  }

  const cfg = PROVIDERS[provider];
  const chosenModel = (typeof model === 'string' && model.trim()) ? model.trim() : cfg.defaultModel;
  const userMessage =
    `Platform: ${platform || 'unknown'}\n` +
    `Date: ${todayIso()}\n\n` +
    `CONVERSATION:\n${safeTranscript}`;

  let response;
  try {
    response = await fetch(cfg.endpoint, cfg.buildRequest(apiKey, chosenModel, ENGRAM_SYSTEM_PROMPT, userMessage));
  } catch (err) {
    safeLog('extract: fetch failed:', err);
    return { kind: 'error', reason: 'network', detail: err && err.message };
  }

  if (!response.ok) {
    let body = '';
    try { body = await response.text(); } catch { /* ignore */ }
    safeLog(`extract: ${provider} returned HTTP ${response.status}:`, body.slice(0, 300));
    return { kind: 'error', reason: 'http', status: response.status, detail: body.slice(0, 300) };
  }

  let data;
  try {
    data = await response.json();
  } catch (err) {
    safeLog('extract: response was not JSON:', err);
    return { kind: 'error', reason: 'invalid-response' };
  }

  const raw = cfg.parseResponse(data);
  if (!raw) {
    safeLog('extract: empty response body');
    return { kind: 'error', reason: 'empty-response' };
  }
  const trimmed = raw.trim();
  if (trimmed === NOTHING_SENTINEL) return { kind: 'nothing' };
  const normalized = normalizeHeader(trimmed, platform);
  if (!isValidEntry(normalized)) {
    safeLog('extract: response failed entry shape validation, discarding');
    return { kind: 'error', reason: 'malformed-entry' };
  }
  return { kind: 'entry', entry: normalized };
}

// Deterministically rewrite the header's date and platform fields. The LLM
// occasionally substitutes placeholders ("[PERSON_NAME]") or rewrites the
// platform name. We control these two fields; the LLM keeps the topic.
function normalizeHeader(entry, platform) {
  const today = todayIso();
  const platformValue = (platform || 'unknown').toString().toLowerCase().trim();
  // Match: ### YYYY-MM-DD — anything-not-emdash-or-newline — topic
  const headerRe = /^### (\d{4}-\d{2}-\d{2})\s*—\s*([^\n—]+?)\s*—\s*([^\n]+)/;
  const match = entry.match(headerRe);
  if (!match) return entry; // header malformed; let isValidEntry reject if needed
  const topic = match[3].trim();
  const newHeader = `### ${today} — ${platformValue} — ${topic}`;
  return entry.replace(headerRe, newHeader);
}

// --- Internals ------------------------------------------------------------

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

// Validates Engram output before it gets anywhere near BRAIN.md.
// Defense against prompt injection: a malicious conversation cannot trick the
// LLM into outputting executable HTML, scripts, or text outside the expected
// markdown entry shape.
//
// Threat model: an attacker plants a Claude/ChatGPT/etc. conversation that
// the user later runs Extract Now on. If Engram echoes the attacker's
// malicious content (markdown link with javascript: URI, raw <a href=...>,
// embedded data: URI, etc.) into BRAIN.md, opening BRAIN.md in a markdown
// renderer could trigger the payload. We reject these before write.
function isValidEntry(text) {
  if (typeof text !== 'string') return false;
  if (text.length === 0 || text.length > MAX_ENTRY_BYTES) return false;
  if (!text.startsWith('### ')) return false;
  if (!/\*\*(Decisions|Context updated|Open questions):\*\*/.test(text)) return false;

  // HTML tags / event-handler attributes that could execute or fetch.
  if (/<\s*\/?\s*(script|iframe|object|embed|link|style|meta|svg|img|a\b|on\w+\s*=)/i.test(text)) return false;

  // Markdown link with dangerous URI scheme:  [text](javascript:...) / data: / vbscript: / file:
  if (/\]\s*\(\s*(javascript|data|vbscript|file)\s*:/i.test(text)) return false;

  // Angle-bracket auto-link with dangerous URI scheme:  <javascript:...>
  if (/<\s*(javascript|data|vbscript|file)\s*:/i.test(text)) return false;

  // HTML href attribute with dangerous URI scheme (defence in depth).
  if (/\bhref\s*=\s*["']?\s*(javascript|data|vbscript|file)\s*:/i.test(text)) return false;

  return true;
}

// Scrub anything that looks like an API key, bearer token, or other secret
// before it touches the console. Conservative — false positives just become "***".
function scrub(value) {
  if (typeof value === 'string') {
    return value
      .replace(/sk-ant-[A-Za-z0-9_\-]+/g, 'sk-ant-***')
      .replace(/sk-or-[A-Za-z0-9_\-]+/g, 'sk-or-***')
      .replace(/sk-[A-Za-z0-9_\-]{20,}/g, 'sk-***')
      .replace(/AIza[A-Za-z0-9_\-]+/g, 'AIza***')
      .replace(/Bearer\s+[A-Za-z0-9_.\-]+/gi, 'Bearer ***')
      .replace(/"x-api-key"\s*:\s*"[^"]+"/gi, '"x-api-key":"***"')
      .replace(/"authorization"\s*:\s*"[^"]+"/gi, '"authorization":"***"');
  }
  if (value instanceof Error) {
    const cloned = new Error(scrub(value.message || ''));
    cloned.name = value.name;
    cloned.stack = scrub(value.stack || '');
    return cloned;
  }
  return value;
}

function safeLog(...args) {
  console.error('[Total Recall]', ...args.map(scrub));
}
