---
title: Brave Browser Support — CEO Review
category: decision
created: 2026-05-21
updated: 2026-05-21
related: [[provider-whitelist]], [[security-threat-model]]
---

CEO review of "wire Total Recall to work with Brave Browser." Conclusion: this is
not really an engineering task — it is a positioning decision. Recommended:
**Selective Expansion**, treat Brave as a first-class supported browser.

---

## Step 0A — Premise Challenge

**The request as stated:** "Wire Total Recall to work with Brave Browser."

**The honest answer:** Brave is Chromium-based. Total Recall is a Manifest V3
extension built on standard Chrome APIs (`chrome.storage`, `chrome.runtime`,
`chrome.scripting`, File System Access API, IndexedDB). Brave runs Chrome
extensions natively. There is no "wiring" required to make it load and run.

So the *real* question underneath the request is one of three things:

1. **"Does it work in Brave?"** → Empirically verify. ~10 minutes of testing.
2. **"Does it work *well* in Brave?"** → Brave has Shields, fingerprinting
   protection, strict third-party cookie blocking, and aggressive script
   blocking. These can break content scripts on AI sites or LLM API calls.
3. **"Should Brave be a supported, marketed browser?"** → Strategic question.
   Brave's audience (privacy-first, sovereignty-minded, anti-cloud) is the
   *exact* ICP for a tool whose pitch is "your AI memory lives on your
   machine, no cloud, no account." This is not a coincidence worth ignoring.

The third framing is the highest-leverage interpretation. The first two are
the gate to earning the right to make the third claim.

## Step 0B — Existing Code Leverage

Nothing in the current codebase is Chrome-specific in a way Brave breaks:
- `manifest.json` is MV3 standard
- `chrome.*` APIs are present in Brave (Brave aliases them; both `chrome.*` and `browser.*` work)
- File System Access API is in Chromium 86+ — Brave has it
- IndexedDB is universal
- The provider whitelist ([[provider-whitelist]]) already constrains where
  network calls go; Brave Shields will either allow or block these uniformly

**Nothing to rebuild. Everything to verify.**

## Step 0C — Dream State Mapping

```
CURRENT (2026-05-21)              THIS PLAN                      12-MONTH IDEAL
─────────────────────             ─────────────────              ──────────────
Edge-tested v0.1                  Brave-verified +              "Browser of choice
Chrome-implied support      ───▶  documented + listed     ───▶  for sovereign AI
No browser positioning            as a first-class              memory: Brave +
                                  supported browser              Total Recall"
                                                                Joint distribution
                                                                with Brave community
```

The 12-month version is not "the extension also works in Brave." It is "Brave
users discover Total Recall through Brave-aligned channels (r/brave, Brave
Community forum, Brave Search promotion of privacy extensions) because the
values match perfectly."

## Step 0C-bis — Implementation Alternatives

### APPROACH A — Minimal Viable: Smoke test + document
**Summary:** Load unpacked in Brave, run the existing v0.1 stress test
checklist on Claude.ai with Shields default, fix anything that breaks,
add a one-line "works in Brave" to README.

- **Effort:** S (human: ~2 hours / CC: ~15 min)
- **Risk:** Low
- **Pros:** Fastest path to claim support. Forces real test.
- **Cons:** No marketing leverage. Same generic browser story.
- **Reuses:** Existing stress test checklist verbatim.

### APPROACH B — Ideal Architecture: First-class Brave support
**Summary:** Verify on Brave, harden the known Shields-sensitive paths
(content-script injection on AI sites, LLM API host permissions, File
System Access prompt UX), add Brave-specific copy in popup/README,
prepare a Brave Community forum post for v0.2 launch.

- **Effort:** M (human: ~2 days / CC: ~2 hours)
- **Risk:** Low — purely additive, no breaking changes
- **Pros:** Captures ICP alignment. Creates a distribution channel. Earns
  Brave users' trust with browser-specific acknowledgment in the UI.
- **Cons:** Pulls focus from v0.2 platform coverage (ChatGPT/Gemini/DeepSeek).
- **Reuses:** All v0.1 code. Adds verification + copy + one Shields
  troubleshooting section.

### APPROACH C — Strategic: Brave-native variant
**Summary:** Maintain a Brave-branded variant in a separate listing (Chrome
Web Store + a Brave-aware popup that detects `navigator.brave` and surfaces
Brave-specific guidance, e.g., Leo integration hints).

- **Effort:** L (human: ~1 week / CC: ~half a day)
- **Risk:** Medium — fork-shaped maintenance, two listings to keep in sync
- **Pros:** Maximum positioning differentiation. Leo (Brave's local LLM)
  integration would be a unique angle.
- **Cons:** Premature. v0.1 is not even stress-tested. Two SKUs before
  product-market-fit is a classic founder trap.
- **Reuses:** Everything, but adds a runtime branch.

**RECOMMENDATION:** **APPROACH B (Selective Expansion).**

Why: the ICP-alignment between Total Recall and Brave is the highest-leverage
free distribution this product has. Approach A captures the technical fact
but throws away the positioning. Approach C is premature optimization for
distribution before v0.1 is even stress-tested. B threads the needle: minimal
new code, real verification, real positioning groundwork.

## Step 0D — Selective Expansion: Cherry-pick Candidates

Treating Approach B as the baseline. Here are the individual expansion
opportunities the user can accept/defer/skip:

### E1 — Brave Shields compatibility doc
What: A short README section + popup help link covering the three known
Brave-on-AI-sites pitfalls (Shields default vs aggressive, third-party
cookies on chatgpt.com, fingerprinting protection on gemini.google.com).
Effort: S. Recommendation: **Accept** — this is the only doc Brave users
actually need from us.

### E2 — `navigator.brave` runtime detection
What: Detect Brave in popup.js, swap "Edge" / "Chrome" wording for "Brave"
in the reconnect copy (currently `COPY.actionDescriptions.reconnect` says
"Browsers drop the folder link…" — keep generic, but the toast on first
launch could acknowledge Brave by name).
Effort: S. Recommendation: **Accept** — costs ~10 lines, signals attentiveness.

### E3 — Leo (Brave's local LLM) as a provider option
What: Add Leo to the provider whitelist as a fourth option alongside
Anthropic / OpenAI / OpenRouter / Ollama. Leo exposes an API surface
similar to Ollama for local inference.
Effort: M. Recommendation: **Defer to v0.3** — this is genuine product
work, not Brave compatibility. Worth doing later when local-provider
breadth matters more.

### E4 — Brave Community launch post draft
What: A 200-word post for r/brave or the Brave Community forum, drafted
now, queued for v0.2 ship date.
Effort: S. Recommendation: **Accept** — capture the framing while the
positioning is fresh. Store in `wiki/synthesis/` (new folder).

### E5 — Test against Brave Search AI
What: Brave Search has its own AI Assistant. Add it to host_permissions
and content_scripts.
Effort: M. Recommendation: **Defer** — out of scope. Belongs on v0.2
platform-coverage list alongside ChatGPT/Gemini/DeepSeek.

### E6 — Shields-troubleshooting in-popup link
What: When extract fails on an AI site and Brave is detected, surface a
hint: "If you are on Brave, try lowering Shields for this site."
Effort: S. Recommendation: **Accept** — exact pattern as existing
`engramKeyRejected` messaging. Prevents support-volume drain.

**Accepted scope (for this plan):** E1, E2, E4, E6
**Deferred to backlog:** E3, E5

## Step 0E — Temporal Interrogation

**Hour 1 — Verify it loads.** Load unpacked in Brave. Open chrome://extensions
equivalent (`brave://extensions`), enable Dev Mode, load `cc-total-recall/`.
Confirm: service worker boots without errors, popup opens, settings persist.

**Hour 2-3 — Stress test on Claude.ai with Shields.** Run the v0.1 stress
test list (backlog lines 18-27) on Claude.ai inside Brave with Shields at
its three settings: Standard (default), Aggressive, Disabled. Document any
breakage per setting.

**Hour 4-5 — File System Access API check.** Brave has historically been
the *most* lenient of forks here (Edge has shown intermittent quirks; Brave
follows Chromium closely). Confirm folder picker, handle persistence in
IndexedDB across browser restart, `requestPermission({mode:'readwrite'})`
on subsequent sessions. This is the highest-risk path because it is the
hardest to debug if it fails silently.

**Hour 6 — Polish + commit.** Add the README section (E1), the runtime
detection copy nudge (E2), the Shields hint (E6), draft the launch post
(E4). One commit per concern.

## Step 0F — Mode

**SELECTIVE EXPANSION.** Baseline = "verify on Brave." Cherry-picks added:
E1, E2, E4, E6. Total delta from baseline: ~50 LOC + one wiki doc + one
README section + one queued post.

---

## Review Sections (condensed — most are N/A for a verification task)

### Section 1 — Architecture
No architectural change. Same MV3 extension, same content script, same
service worker, same File System Access path. The only architectural
question is whether Brave's process model treats the SW any differently
(it does not — Brave inherits Chromium's SW lifecycle verbatim).

### Section 2 — Error & Rescue Map

| Codepath | Brave-specific failure | Rescue |
|---|---|---|
| `content.js` selector match on claude.ai | Shields blocks script injection | Already silent fail — popup shows "Nothing to read on this page." Acceptable. |
| `engram.js` fetch to api.anthropic.com | Shields blocks cross-origin (rare; host_permissions usually bypass) | Existing `engramNetwork` message catches this. |
| `storage.js` `showDirectoryPicker()` | None known on Brave | N/A |
| `storage.js` `handle.requestPermission()` | None known on Brave | N/A |
| Auto-inject via `execCommand`/`InputEvent` | Already untested per backlog line 62 | Pre-existing v0.2 backlog item, not new. |

**No new failure modes introduced. No new rescue paths required.**

### Section 3 — Security & Threat Model
No new attack surface. Brave is, if anything, *more* defensive than Chrome
or Edge. The provider whitelist ([[provider-whitelist]]) constrains
egress; Brave Shields will respect those host permissions identically.

### Section 4 — Data Flow & Interaction Edge Cases
Identical flows to Chrome/Edge. The only new edge case: a Brave user with
Shields set to Aggressive on `claude.ai` may see content-script injection
blocked. Mitigation: E6 (the in-popup Shields hint).

### Section 5 — Code Quality
~50 LOC delta. Trivial. No DRY concerns, no new abstractions.

### Section 6 — Tests
Manual test plan = the v0.1 stress test checklist (already in backlog),
run inside Brave instead of Edge. No new automated tests needed for v0.1;
the project does not yet have a test harness and adding one for a
compatibility verification is out of scope.

### Section 7 — Performance
N/A. No new computation. Brave's perf profile on extensions is
indistinguishable from Chrome's for this workload.

### Section 8 — Observability
The existing popup console + service worker console + content script
console give full visibility. No new instrumentation required. Brave's
dev tools are Chrome dev tools.

### Section 9 — Deployment & Rollout
No deployment change. The same unpacked-extension load flow works. Chrome
Web Store distribution (v0.4) will also serve Brave users — Brave consumes
the Chrome Web Store directly.

### Section 10 — Long-Term Trajectory
**Reversibility: 5/5.** Every change in this plan is additive copy or
documentation. Nothing locks the product to Brave-specific APIs.

### Section 11 — Design & UX
The popup copy changes are micro-edits. No new UI surfaces. Skipping
/plan-design-review.

---

## NOT in scope
- Leo provider integration (E3 — deferred to v0.3)
- Brave Search AI as a platform (E5 — deferred to v0.2 platform coverage)
- Separate Brave-branded extension listing (Approach C — premature)
- Any code path that diverges from Chrome behavior at runtime beyond the
  cosmetic E2 detection

## What already exists
- MV3 manifest, standard Chrome APIs → run unchanged in Brave
- Provider whitelist → enforces egress regardless of browser
- IndexedDB handle persistence → standard Chromium behavior
- File System Access API usage → already tested on Edge, will work on Brave
- Stress test checklist in backlog → reused verbatim, just executed in Brave

## Failure Modes Registry

| Codepath | Failure | Rescued? | Test? | User sees | Logged? |
|---|---|---|---|---|---|
| content script inject on Shields-Aggressive | Yes (existing silent-fail) | N (manual via E6 hint) | "Nothing to read" | popup console |
| File System Access in Brave private window | Picker may be disabled | N (Brave UX) | Picker fails to open | console |
| Service worker restart | None Brave-specific | Y (already handled) | Reconnect prompt | console |

**No new CRITICAL GAPS introduced by this plan.**

## TODOS additions to wiki/backlog/backlog.md
- v0.1 stress-test list: add a duplicate "run in Brave with Shields
  Standard / Aggressive / Disabled" line
- v0.2 carry-forward: add Leo provider as v0.3 candidate (E3)
- v0.2 carry-forward: add Brave Search AI as platform-coverage candidate (E5)
- v0.4 open source: add "Brave Community launch post" alongside LinkedIn

## Diagrams

**Data flow — unchanged, but with Brave annotations:**

```
  AI page (Brave)        Total Recall (Brave)            BRAIN.md (disk)
  ─────────────          ────────────────────             ───────────────
  [Claude.ai DOM] ──▶ content.js ──msg──▶ service worker ──▶ engram.js
       │                  │                    │              │
       ▼                  ▼                    ▼              ▼
  [Shields?]         [scriptable?]      [fetch allowed?]  [FS handle?]
   Standard: yes      always (own-      host_permissions   IndexedDB
   Aggressive:        origin SW)         whitelisted        restored on
   blocks → E6 hint                                         popup open
```

## Completion Summary

```
+====================================================================+
|            CEO REVIEW — Brave Browser Support                       |
+====================================================================+
| Mode selected        | SELECTIVE EXPANSION                          |
| Approach selected    | B — First-class Brave support                |
| Cherry-picks accepted| 4 (E1, E2, E4, E6)                           |
| Cherry-picks deferred| 2 (E3, E5)                                   |
| New LOC est.         | ~50                                          |
| New tests required   | 0 (manual stress test reused)                |
| New attack surface   | None                                         |
| Architectural change | None                                         |
| Reversibility        | 5/5                                          |
| Critical gaps        | 0                                            |
| Unresolved decisions | 0 — auto-decided per Auto Mode               |
+====================================================================+
```

---

## Implementation Punch List (for follow-up after plan approval)

1. **Verify load in Brave** — `brave://extensions`, Dev Mode, load unpacked.
2. **Run v0.1 stress test in Brave** under Shields Standard / Aggressive /
   Disabled on Claude.ai. Document any deltas vs Edge.
3. **E1 — README section** "Works in Brave" with Shields guidance (3-4 lines).
4. **E2 — popup.js Brave detection** — `navigator.brave?.isBrave?.()` gate,
   swap one toast string. No behavioral change.
5. **E6 — Shields-hint message** — add to `COPY.messages` and surface when
   `noConversation` fires on Brave.
6. **E4 — Brave Community launch post** drafted in
   `wiki/synthesis/brave-launch-post.md` (new folder).
7. **Backlog updates** — append the deferred items to `wiki/backlog/backlog.md`.
8. **Wiki log** — append session entry to `wiki/log.md`.

Total implementation time: ~2 hours human / ~20 min with CC.
