---
title: Brave Browser Support — Engineering Review
category: decision
created: 2026-05-21
updated: 2026-05-21
related: [[2026-05-21-brave-browser-support]], [[provider-whitelist]], [[security-threat-model]]
---

Engineering review locking in the execution plan from
[[2026-05-21-brave-browser-support]]. One **CRITICAL FINDING** reframes the
work. Test plan, code patterns, and failure modes documented.

---

## Critical Finding (surfaced before Step 0)

**README.md:295 already claims Brave support, and the claim is unverified.**

```
- **Brave** — works after enabling `brave://flags/#file-system-access-api`
  (Brave disables the API by default for privacy reasons).
```

Confidence: 9/10 that this is an unverified claim. Reasoning:
1. The git log shows no Brave testing commit. The stress test list in
   `wiki/backlog/backlog.md:24` says "close Edge, reopen" — testing happened
   on Edge, not Brave.
2. The flag URL `brave://flags/#file-system-access-api` is plausible-looking
   but the actual Brave flag for File System Access has historically been
   named differently and Brave's stance on this API has shifted at least
   once. Citing a specific flag without verification is a falsifiable claim.
3. The README's tone elsewhere is precise about what is "verified" vs
   "experimental" (lines 261-264). The Brave line is the only browser
   compatibility claim that asserts a procedure without evidence.

**Impact on the CEO plan:** E1 is no longer "add a Brave section." It is
"verify the existing claim, then either confirm or rewrite it." The
verification step is now load-bearing — we cannot ship E4 (the Brave
Community launch post) on top of a README claim that might embarrass us
if a Brave user tries the documented flow and it does not work.

**Action:** Verification (the "Hour 1" task in the CEO plan) becomes
mandatory and must complete before E1, E4 ship. If the documented flag
is wrong, README:294-296 gets rewritten with what actually works.

---

## Step 0 — Scope Challenge

### 0.1 — Existing code reuse
- README already has a Brave entry (line 295). Update, do not duplicate.
- `manifest.json` is already browser-agnostic MV3.
- `storage.js:27-50` uses standard IndexedDB API; runs in Brave unchanged.
- `popup.js:22-78` has a `COPY` constants object — extend, do not parallel-structure.
- `popup.js:783-786` already branches on platform for the "nothing here" message
  — extend that branch, do not duplicate the call site.

### 0.2 — Minimum changes
The CEO plan accepted 4 cherry-picks (E1, E2, E4, E6). Eng review confirms
all four are minimal:
- E1: edit existing README section (~10 LOC diff, not new section)
- E2: ~5 LOC in popup.js to detect + cache `isBrave` flag
- E4: 1 new file in `wiki/synthesis/`
- E6: ~3 LOC in popup.js (new COPY entry + branch at one call site)

### 0.3 — Complexity check
- Files touched: 4 (`README.md`, `popup.js`, `wiki/synthesis/brave-launch-post.md`,
  `wiki/backlog/backlog.md`). Under the 8-file smell threshold.
- New classes/services: 0. Under the 2-class smell threshold.
- **No scope reduction needed.**

### 0.4 — Search check
- `navigator.brave?.isBrave?.()` — Brave docs confirm: returns
  `Promise<boolean>` resolving to `true` on Brave, `undefined` on non-Brave
  browsers (the property does not exist). The optional chaining gives a
  clean feature-detection pattern. **[Layer 1]** — standard pattern.
- File System Access API in Brave — Brave's current default behavior needs
  empirical verification (see Critical Finding above). Do not assume.
- Shields impact on AI sites — verifiable only by running the v0.1 stress
  test inside Brave at each Shields level. **[Layer 3]** — first principles:
  the only honest answer is to measure.

### 0.5 — TODOs cross-reference
- `wiki/backlog/backlog.md:18-27` (v0.1 stress test checklist) — gets a
  duplicate entry: "run inside Brave under Shields Standard / Aggressive / Off"
- `wiki/backlog/backlog.md:62` (`InputEvent` fallback for auto-inject) — same
  risk in Brave as Chrome/Edge. Not Brave-specific. No new TODO.
- New TODOs from this plan: Leo provider (v0.3), Brave Search AI as platform
  (v0.2 platform coverage).

### 0.6 — Completeness check
Lake-scale work. ~50 LOC + 1 doc + 1 README edit + 1 launch post. Boil it.

### 0.7 — Distribution check
No new artifact. The extension is already distributed via "load unpacked"
in v0.1 and slated for Chrome Web Store in v0.4. Brave consumes the Chrome
Web Store directly — no separate distribution work.

**Step 0 verdict:** No complexity-trigger AskUserQuestion needed. Proceed.

---

## Section 1 — Architecture Review

### 1.1 — No architectural change
Existing system architecture (README:96-142) describes the data flow. None
of the components change. The plan is pure copy + one runtime detection.

### 1.2 — Async detection lifecycle (confidence: 8/10)
**Issue:** `navigator.brave.isBrave()` returns a `Promise<boolean>`. Most of
`popup.js` is synchronous render code that reads `COPY` constants directly
(see `popup.js:33-37` — string functions like `folderReconnect(name)`).

If we await Brave detection inline at every call site, we serialize render
behind a permissions check. If we detect once at popup boot and cache,
we get clean sync access at all call sites but introduce one new piece of
module state.

**Recommendation:** Detect once at popup init, cache in a module-level
constant. Pattern:

```js
// Near top of popup.js, after imports
let isBrave = false;
(async () => {
  try { isBrave = (await navigator.brave?.isBrave?.()) === true; }
  catch { /* non-Brave; ignore */ }
})();
```

Then COPY functions that vary by browser take `isBrave` as a parameter, or
read it at call site. No mutation of COPY, no async at call sites. Maps to
preference: **explicit over clever**, **smallest cleanly-expressing diff**.

### 1.3 — Production failure scenario
**Scenario:** Brave updates `navigator.brave.isBrave()` API surface (very
low probability — it has been stable since 2020). Our cached `isBrave`
silently stays `false`, users see generic copy instead of Brave-aware copy.
**Blast radius:** zero. Generic copy is honest. The only loss is one toast
string and one error hint. **No alarm.** Acceptable.

### 1.4 — Security architecture
Zero new attack surface. The Brave detection touches no network, no
storage, no DOM. Confidence: 10/10 no security delta.

**Section 1 verdict:** 1 finding (1.2), already resolved by recommendation
above. No critical gaps.

---

## Section 2 — Code Quality Review

### 2.1 — COPY structure consistency (confidence: 8/10)
**Issue:** The existing `COPY` object (`popup.js:22-78`) mixes static strings
and parameterized functions. Adding browser-conditional strings could be
done three ways:

```
Option A: Add `_brave` variants as new COPY keys
  COPY.messages.noConversation         = 'Nothing to read on this page...'
  COPY.messages.noConversationBrave    = 'Nothing to read. If you are on Brave...'
  Branch at call site: showMessage(isBrave ? noConversationBrave : noConversation)

Option B: Function-ize the conditional entries
  COPY.messages.noConversation = (isBrave) => isBrave ? '...Brave hint...' : '...generic...'

Option C: Module-level browser-conditional COPY assembly at popup init
  After Brave detection completes, build the COPY object once based on browser.
```

**Recommendation: A.** Two reasons:
1. **DRY-explicit:** the call site that branches makes the conditional
   visible. Future readers scanning popup.js see the Brave branch in
   the code that uses it, not buried in a function. Matches preference:
   **explicit over clever.**
2. **Smallest diff:** ~3 LOC for E6 (one new COPY key, one branch). B and
   C require restructuring existing COPY entries that work fine today.

Option B would be the right call if we had 5+ conditional strings.
We have 2 (E2 toast, E6 hint). Three more would justify B.

### 2.2 — Edge case in E6 branch (confidence: 7/10)
`popup.js:783-787` currently branches on platform: `claude` → `noConversation`,
`chatgpt/gemini/deepseek` → `experimentalPlatform`, else → `notSupportedTab`.

The Brave Shields hint should fire when:
- Platform is `claude` AND extracted.text is empty AND `isBrave === true`
- Probably also on the experimental platforms — Shields-Aggressive could
  block content script injection on chatgpt.com/gemini.google.com too.

**Recommendation:** Apply the Brave hint suffix to BOTH the `noConversation`
and `notSupportedTab` branches when `isBrave`. Skip the experimental branch
(message is already long and Brave + experimental compounds the noise).

```js
} else if (p === 'claude') {
  showMessage(
    isBrave ? COPY.messages.noConversationBrave : COPY.messages.noConversation,
    'error'
  );
} else {
  showMessage(
    isBrave ? COPY.messages.notSupportedTabBrave : COPY.messages.notSupportedTab,
    'error'
  );
}
```

Two new COPY entries, two branch swaps. ~6 LOC total.

### 2.3 — Stale README diagram check
README:96-142 has an ASCII architecture diagram. Brave plan does not change
any component, so the diagram stays accurate. No update needed. Confidence: 9/10.

**Section 2 verdict:** 2 findings, both resolved with concrete patterns
above. No critical gaps.

---

## Section 3 — Test Review

### 3.1 — Test framework status
The project has **no automated test framework** (confirmed by file
inventory: no `vitest`, `jest`, `playwright`, or `test/` directory). All
v0.1 verification is manual via the stress test checklist in
`wiki/backlog/backlog.md:18-27`. This is consistent with the project's
"zero dependencies, no build step" stance.

**Adding a test framework for this plan is out of scope.** It would be a
project-wide infrastructure decision worth its own ENG review.

### 3.2 — Test plan: manual stress test in Brave

Every changed codepath gets a manual test under three Brave Shields
configurations.

```
+======================================================================+
|   BRAVE STRESS-TEST COVERAGE MAP — v0.1 + Brave Support              |
+======================================================================+
| Codepath / Flow                  | Brave  | Brave   | Brave   | Test |
|                                  | Standard| Aggro   | Off     |      |
+----------------------------------+--------+---------+---------+------+
| Load unpacked in brave://ext     |  [T]   |  [T]    |  [T]    | ★★★  |
| popup.html opens                 |  [T]   |  [T]    |  [T]    | ★★   |
| Folder picker (FSA API)          |  [T]   |  [T]    |  [T]    | ★★★  |
| IndexedDB handle persist         |  [T]   |  [T]    |  [T]    | ★★   |
| Browser restart → reconnect      |  [T]   |  [T]    |  [T]    | ★★★  |
| content.js inject on claude.ai   |  [T]   |  [T]*   |  [T]    | ★★★  |
| Claude DOM read                  |  [T]   |  [T]*   |  [T]    | ★★★  |
| Auto-inject on claude.ai/new     |  [T]   |  [T]*   |  [T]    | ★★   |
| engram.js fetch to api provider  |  [T]   |  [T]    |  [T]    | ★★★  |
| BRAIN.md append                  |  [T]   |  [T]    |  [T]    | ★★   |
| Copy Brain on Claude             |  [T]   |  [T]    |  [T]    | ★★   |
| Copy Brain on ChatGPT            |  [T]   |  [T]    |  [T]    | ★★   |
| navigator.brave detection        |  [T]   |  [T]    |  [T]    | ★★★  |
| E6 Shields hint surfaces         |  [T]   |  [T]    |  [T]    | ★★   |
+----------------------------------+--------+---------+---------+------+
| TOTAL: 14 codepaths × 3 Shields = 42 manual checks                   |
+======================================================================+

[T] = test required   * = expected high failure rate; capture as evidence
★★★ = critical (must pass at Standard) | ★★ = important | ★ = nice-to-know
```

### 3.3 — Regression check
Plan modifies copy strings only. No existing automated tests exist to
regress. The manual stress test list in the backlog gets one new line
("run inside Brave under each Shields level"). No regression test in the
formal sense, but the v0.1 checklist itself is the regression gate.

### 3.4 — User-facing flows to verify
For each Brave-shields combination, the explicit user flows:

1. **First-run setup:** pick folder → confirm BRAIN.md created → set provider → key validation → close popup
2. **Browser restart:** reopen Brave → popup shows "reconnect needed" → click Reconnect → permission re-granted → BRAIN.md still readable
3. **Extract Now on Claude.ai conversation:** open claude.ai chat with history → click extension icon → click Extract Now → BRAIN.md has new entry
4. **Auto-inject on new Claude conversation:** navigate to claude.ai/new → input box pre-filled with BRAIN.md contents
5. **Copy Brain on non-Claude platform:** open ChatGPT → click Copy Brain → paste into input → contents formatted with template wrapper
6. **Empty conversation:** open fresh claude.ai/new with no chat → Extract Now → user sees `noConversation` (or `noConversationBrave` on Brave)

### 3.5 — Edge cases to verify
- **Brave Private Window:** FSA API likely disabled. Expected: folder
  picker fails. **Required behavior:** show `pickerFailed` message clearly.
- **Brave Tor Window:** stronger isolation. Same expectation as Private.
- **Brave Leo open on Claude.ai tab:** Brave's own LLM sidebar. Verify it
  does not collide with our content script's DOM reads.
- **Brave localhost-block:** verify Ollama provider can still reach
  `127.0.0.1:11434` from the extension (host_permissions should bypass
  this, but verify).
- **Shields-Aggressive on Claude:** content script may be blocked from
  reading certain DOM nodes. Expected silent fail → captured by existing
  empty-extracted-text branch → user sees E6 Brave-hint message.

### 3.6 — Eval scope
No LLM prompt changes in this plan. No evals required. Engram's prompt is
untouched.

**Section 3 verdict:** Manual test plan complete. 42 manual checks across
3 Shields configurations. No automated test gaps because no automated
tests exist project-wide.

---

## Section 4 — Performance Review

### 4.1 — One async call at popup init
`navigator.brave.isBrave()` resolves in <1ms on Brave (it is a synchronous
check wrapped in a Promise). On non-Brave, the optional chain short-circuits
to `undefined`. Performance impact: **zero observable.**

### 4.2 — No new fetches, no new storage I/O, no new DOM work
README:155-174 documents the existing data flow. Brave changes touch none
of those steps.

**Section 4 verdict:** No findings. Move on.

---

## NOT in scope

- **Automated test framework introduction** — project has none, adding one
  is a project-wide decision worth its own review
- **Leo provider integration** (CEO plan E3) — deferred to v0.3
- **Brave Search AI as supported platform** (CEO plan E5) — deferred to
  v0.2 platform coverage alongside ChatGPT/Gemini/DeepSeek selector work
- **Separate Brave-branded extension listing** (CEO plan Approach C) —
  premature; one SKU until v0.1 ships
- **`InputEvent` fallback testing** (backlog:62) — pre-existing concern,
  not Brave-specific
- **Firefox port** — explicitly out (different extension model entirely)

## What already exists

| Capability | File / Line | Brave plan reuses |
|---|---|---|
| Manifest V3 manifest | `manifest.json` | Yes — unchanged |
| IndexedDB handle persistence | `storage.js:27-71` | Yes — unchanged |
| File System Access API | `storage.js:79-179` | Yes — unchanged |
| `COPY` constants pattern | `popup.js:22-78` | Yes — extends, doesn't replace |
| Empty-extracted-text branch | `popup.js:783-787` | Yes — adds Brave variant |
| README browser compat section | `README.md:292-296` | Yes — corrects existing claim |
| v0.1 stress test checklist | `wiki/backlog/backlog.md:18-27` | Yes — runs in Brave |
| Provider whitelist | [[provider-whitelist]] | Yes — unchanged |

**Nothing rebuilt. Five files touched, none restructured.**

## Failure Modes Registry (Brave-specific)

| Codepath | Brave-specific failure | Test? | Handled? | User sees | Logged? |
|---|---|---|---|---|---|
| content script inject (Shields-Aggressive) | Script blocked | Manual ★★★ | Y (silent → empty extract) | E6 Brave hint | console |
| `navigator.brave.isBrave()` future API change | Returns wrong shape | No (impossible to test future) | Y (try/catch + default false) | Generic copy | catch swallows |
| FSA picker in Private Window | Picker disabled | Manual ★★★ | Y (existing `pickerFailed`) | `pickerFailed` message | console |
| FSA flag change in future Brave release | Picker silently disabled | Manual at each release | Y (existing) | `pickerFailed` message | console |
| Shields blocks `api.anthropic.com` | fetch rejected | Manual ★★ | Y (existing `engramNetwork`) | `engramNetwork` | console |
| Brave Leo collision on Claude DOM | DOM nodes shifted | Manual ★★ | N (relies on selector stability) | `noConversation` | console |

**Critical gaps: 0.** The Leo collision row is the closest to a gap — no
test exists today and the failure is silent — but it mirrors the existing
ChatGPT/Gemini/DeepSeek selector fragility risk (backlog:60-62). Not
Brave-specific enough to escalate.

## Worktree parallelization strategy

Sequential implementation, no parallelization opportunity. ~50 LOC total,
all in 4 closely-related files. Splitting into worktrees would cost more
than it saves.

## Diagrams

### Brave detection lifecycle

```
  popup.html load
       │
       ▼
  popup.js module top-level IIFE
       │
       ▼
  navigator.brave?.isBrave?.()
       │
       ├── undefined (non-Brave) ──┐
       │                           ▼
       │                       isBrave = false (default)
       │                           │
       ▼                           │
  Promise<true> (Brave)            │
       │                           │
       ▼                           │
  isBrave = true ─────────────────┤
                                   ▼
                          All subsequent COPY-reading
                          call sites read isBrave sync.
```

### E6 message-selection flow

```
  Extract Now click
       │
       ▼
  chrome.tabs.sendMessage(tabId, {action:'extract'})
       │
       ▼
  extracted.text === empty?
       ├── No  → proceed to engram.js
       └── Yes
             │
             ▼
       Switch on extracted.platform:
       ├── claude     → isBrave ? noConversationBrave : noConversation
       ├── chatgpt etc → experimentalPlatform (unchanged — Brave hint omitted)
       └── unknown    → isBrave ? notSupportedTabBrave : notSupportedTab
```

## Updated Implementation Punch List

Strict ordering — **verification gates everything else.**

### Phase 1 — Verify (blocking)
1. **Load unpacked in Brave** at `brave://extensions` with Dev Mode on.
2. **Confirm or refute `brave://flags/#file-system-access-api` claim** in
   README:295. If wrong, capture the actual flag/setting path (or note
   that FSA works without any flag in current Brave).
3. **Run the 42-check stress matrix** (Section 3.2) on Claude.ai.
4. **Document deltas vs Edge** in a new wiki entry
   `wiki/lessons-learned/2026-05-21-brave-verification-results.md`.

### Phase 2 — Implement (only after Phase 1 confirms what works)
5. **README:292-296** — rewrite Brave entry with verified facts. If
   FSA-flag claim is wrong, replace with the actual procedure (or state
   "works out of the box, Shields may need adjusting per-site").
6. **popup.js** — add module-level `isBrave` detection (Section 1.2 pattern).
7. **popup.js COPY** — add `noConversationBrave`, `notSupportedTabBrave`
   entries (Section 2.1 Option A).
8. **popup.js call sites** — update lines ~783-787 to branch on `isBrave`
   (Section 2.2 pattern).
9. **wiki/synthesis/brave-launch-post.md** — draft the 200-word post.
   Status: DRAFT until v0.2 ship.
10. **wiki/backlog/backlog.md** — append:
    - v0.1 stress test: "+ run inside Brave under Shields Standard /
      Aggressive / Off"
    - v0.3 candidates: Leo provider, Brave Search AI as platform

### Phase 3 — Smoke
11. Reload extension, re-run full stress test in Brave once more.
12. Run stress test in **Edge** to verify nothing regressed for non-Brave users.

**Total estimated time:** Phase 1 ~1h human / ~15m CC. Phase 2 ~30m human
/ ~10m CC. Phase 3 ~30m human / ~5m CC.

---

## Completion Summary

```
+======================================================================+
|             ENG REVIEW — Brave Browser Support                       |
+======================================================================+
| Critical findings (pre-step-0)| 1 — README:295 unverified claim       |
| Step 0: Scope Challenge       | scope accepted as-is                  |
| Architecture Review           | 1 issue (1.2 async detection), resolved|
| Code Quality Review           | 2 issues (2.1, 2.2), both resolved    |
| Test Review                   | manual 42-check matrix, 0 gaps        |
| Performance Review            | 0 issues                              |
| NOT in scope                  | written                               |
| What already exists           | written                               |
| Failure modes                 | 6 mapped, 0 critical gaps             |
| TODOs surfaced                | 2 (Leo v0.3, Brave Search AI v0.2)    |
| Outside voice                 | skipped (not gated; Brave is low-stakes)|
| Parallelization               | sequential, no opportunity            |
| Lake Score                    | full lake boiled (manual exhaustive)  |
| Unresolved decisions          | 0                                     |
+======================================================================+
```

---

## Next Steps

1. **Run /ship is premature** — Phase 1 verification must complete first.
2. **No /plan-design-review needed** — no UI surfaces change beyond copy strings.
3. **No /plan-ceo-review needed** — already done; this review is its execution lock.
4. **Recommended order:** execute Phase 1 → update this review with verification
   findings → execute Phase 2 → execute Phase 3 → then /ship.
