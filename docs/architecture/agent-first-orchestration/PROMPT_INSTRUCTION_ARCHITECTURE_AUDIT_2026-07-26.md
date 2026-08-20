<!-- docs/architecture/agent-first-orchestration/PROMPT_INSTRUCTION_ARCHITECTURE_AUDIT_2026-07-26.md -->

<!-- doc-status: point-in-time -->

> **Point-in-time document.** Written 2026-07-26; describes the state of the system at that moment.
> It is not a current reference. Verify against code before acting on anything here.

# Prompt Instruction Architecture Audit — tasker/39

**Date:** 2026-07-26. **Status:** audit complete AND stages 1–4 + 6 of §8 BUILT (same day, unit-green,
typecheck-clean — see the build log at the bottom). §5 (scratchpad) is owned by a separate agent per
DJ; Libri surface decision deferred per DJ ("outdated, don't touch").
**Scope:** the lite seed prompt (`build-lite-prompt.ts`), the tool-definition payload, and the §5
research-scratchpad mechanism.

Method: measured from `apps/web/.prompt-dumps/fb-2026-07-26T02-27-24-704Z-lite-turn1.txt` (real
`project` turn, 23 tools), cross-checked against the actual registry definitions by serializing them
directly (`JSON.stringify` of `CHAT_TOOL_DEFINITIONS` / gateway defs via `tsx`), plus a full trace of
the domain-sensing and skill-preload plumbing.

---

## 0. Two measurement corrections that reframe the tasker

### 0.1 The tool-definition numbers were inflated by a double-serialization artifact

The dump reports 8 of 23 tools at almost exactly **2× their authored size**. Verified by serializing
the registry definitions directly and comparing:

| Tool                        | Authored (chars) | Dump (chars) | Fits `2×(base−24)+16`? |
| --------------------------- | ---------------: | -----------: | :--------------------: |
| `update_onto_task`          |            2,110 |        4,188 |         exact          |
| `create_onto_document`      |            2,000 |        3,968 |         exact          |
| `tool_search`               |            1,414 |        2,796 |         exact          |
| `libri_search_capabilities` |              921 |        1,810 |         exact          |
| `get_project_overview`      |              850 |        1,668 |         exact          |
| `read_document_section`     |              593 |        1,154 |         exact          |
| `get_document_outline`      |              472 |          912 |         exact          |
| `web_search`                |            1,185 |        2,338 |         exact          |

The other 15 tools match their authored size **exactly** (e.g. `create_onto_task` 2,468 = 2,468).
The formula means each affected tool is serialized with its `function` body present **twice** —
nested (`function: {...}`) plus the same fields flattened at top level. Total phantom content:
**~9.3KB (~2,300 est. tokens) per dumped turn**.

Two mitigating facts, both verified:

1. **It never reaches the provider.** `smart-llm-service.ts:2183` runs every request through
   `normalizeToolsForRequest` (`:3202`), which rebuilds tools as nested-only. So this is not
   provider spend.
2. **It does corrupt all size telemetry.** The dump's cost breakdown, the tool-surface size report,
   and the `provider_payload_estimate` all measure the route-level array. Cross-check: the dump
   estimated ~14,816 payload tokens; the provider's actual Pass-1 usage was **12,610** — a ~2.2k gap
   that matches the phantom content almost exactly.

**Where it enters is unfound** — the registry, gateway surface, tool selector, and
`materializeGatewayTools` all produce clean shapes when exercised directly; the doubling appears
only in the live dev-server process, which points at in-place mutation of the module-singleton
definition objects (the affected set is arbitrary in exactly the way "whichever defs a mutating code
path touched since server start" would be). **Follow-up bug, filed in §8.**

**Corrected budget for the dumped turn:**

| Component        | Tasker claimed                 | Corrected                            |
| ---------------- | ------------------------------ | ------------------------------------ |
| Tool definitions | 32,890 chars (~8,223 tok, 56%) | **~23,600 chars (~5,900 tok, ~47%)** |
| System prompt    | 26,165 chars (~6,542 tok, 44%) | unchanged (~53%)                     |

So: tool schemas do **not** cost more than the system prompt. `update_onto_task` is **~527 tokens,
not ~1,047** — about half the "How to act" section, not equal to it. The honest headline is that the
two halves are roughly equal, and the single biggest _fixable_ line item is the telemetry bug plus
the navigation layer (§3), not tool prose.

### 0.2 The "~3,150-token navigation layer" double-counts

`skill_catalog` (888 tok) is not a separate section — it is the catalog table **inside**
`capabilities_skills_tools` (1,141 tok), reported under an alias, same as
`execution_protocol`/`agent_behavior` aliasing `operating_strategy`. The real instruction-navigation
layer is:

| Piece                                                              | Est. tokens |
| ------------------------------------------------------------------ | ----------: |
| `capabilities_skills_tools` (incl. the 24-row catalog ≈ 800 tok)   |       1,141 |
| `active_domain_signals` (this dump: gate satisfied-by-preload)     |       1,125 |
| Discovery/navigation bullets inside `operating_strategy` (7 of 19) |        ~410 |
| **Total**                                                          |  **~2,675** |

Still the largest coherent block in the prompt and still the right thing to attack — just from an
honest baseline.

---

## 1. Exit condition 1 — the "How to act" bullets, classified

The rendered section has **19 bullets** (the tasker's "20" likely counted the header or a since-
merged variant). Numbering below follows render order in the dump. Verdicts use the tasker's five
buckets; "situational" means server-emitted only when the situation is live (§2).

| #   | Bullet (abbrev.)                                                                 | Verdict                                          | Rationale                                                                                                                                                                                                                                                                                                 |
| --- | -------------------------------------------------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Start with loaded context                                                        | **Always-true**                                  | 1 line, cheap, universally applicable. Keep.                                                                                                                                                                                                                                                              |
| 2   | 1–2 sentence lead-in before tools                                                | **Always-true** (scaffold-gated)                 | Already gated on `retiredModelCoaching`; weak-model UX coaching. Keep gated.                                                                                                                                                                                                                              |
| 3   | Direct tools first; discovery when op unknown                                    | **Always-true**                                  | The 1-line summary of the whole discovery layer. Keep.                                                                                                                                                                                                                                                    |
| 4   | `domain_search` when subject area unclear                                        | **Cut (dedupe)**                                 | Verbatim duplicate of the routing paragraph already in `capabilities_skills_tools`; sensing runs server-side every turn and emits its own next step.                                                                                                                                                      |
| 5   | `outcome_card_load` / `resource_search` / `resource_load`                        | **Situational** → signals section                | Cards arrive ranked in Active Domain Signals with load hints; the preload path explicitly says _don't_ call `outcome_card_load`. Teach it only when cards are actually listed. (Sensing currently drops resource handles entirely — the static bullet teaches tools the model is almost never routed to.) |
| 6   | `skill_search` when domain known, skill unclear                                  | **Situational** → signals section                | Only meaningful mid-routing; fold into the gate-ACTIVE rendering.                                                                                                                                                                                                                                         |
| 7   | `skill_load` before skill-covered work ("routing failure, not a shortcut")       | **Always-true, compressed**                      | The load-bearing routing rule (its absence is a measured failure mode). But cut the 40-word craft-domain enumeration — that's what catalog rows are for. ~90 words → ~25.                                                                                                                                 |
| 8   | Gate-ACTIVE handling + `omit format` + `include_examples` micro-rules            | **Situational + belongs-on-tool**                | The server knows gate state at render time; the ACTIVE instruction already renders inside Active Domain Signals. Format micro-rules move to the `skill_load` tool description.                                                                                                                            |
| 9   | Loaded-skills ledger counts as loaded                                            | **Situational**                                  | Only meaningful when the ledger is non-empty; the preload block already carries "counts as loaded; do NOT call skill_load again." Emit with the ledger, not statically.                                                                                                                                   |
| 10  | Root vs child depth; `skill_reference_load` mechanics                            | **Belongs-on-tool**                              | `capabilities_skills_tools` already explains child skills; the mechanics belong on `skill_load`/`skill_reference_load` descriptions.                                                                                                                                                                      |
| 11  | Web research: when to search, workspace-first, primary sources                   | **Situational block + belongs-on-tool**          | "You are doing web research" is the canonical situational block. Source-quality tail (primary sources, verify by visiting) belongs on `web_search`'s description — loads exactly when the tool does.                                                                                                      |
| 12  | Parallelize, no guessed URLs, cite sources                                       | **Situational block**                            | Same block as 11.                                                                                                                                                                                                                                                                                         |
| 13  | Research persistence (2+ web calls → save with Sources)                          | **Situational block + mechanism**                | The measured 0/5→4/5 rule. Keep in the research block AND keep the code floor (`shouldRepairResearchNoPersist`, `RESEARCH_CAPTURE_MINIMUM_CALLS=2`); §5's mechanism makes it 5/5 by construction.                                                                                                         |
| 14  | User-stated durables → task/doc/event/START HERE                                 | **Always-true, move to Final Response Contract** | No pre-turn signal can predict it, so it can't be situational. It is also the known forward-carry gap (0/4 surfaces in Tier 1) — move it to the recency-position section (`final_response_contract`), where the write-truth rules already live, phrased as a before-you-finish check.                     |
| 15  | Entity resolution order                                                          | **Situational** (write-intent turns)             | `resolveFastChatTurnIntent` already classifies write turns pre-LLM. Merge with safety's exact-ID rule into one "write turn" block.                                                                                                                                                                        |
| 16  | One clarification only when blocked                                              | **Always-true**                                  | 1 line, applies to reads and writes. Keep.                                                                                                                                                                                                                                                                |
| 17  | `change_chat_context` early; "its tool description carries the full zoom policy" | **Cut → belongs-on-tool**                        | The bullet itself admits the policy lives on the tool (1,756-char description). Add "prefer early in the turn" there; delete the bullet.                                                                                                                                                                  |
| 18  | Anchor next step in actual tool results                                          | **Always-true** (scaffold-gated)                 | Weak-model grounding coaching; cheap. Keep, arguably behind `retiredModelCoaching`.                                                                                                                                                                                                                       |
| 19  | Keep scratch reasoning private                                                   | **Cut (dedupe)**                                 | Third statement of the same invariant: the preamble (`VISIBLE_ASSISTANT_CONTENT_CONTRACT`) and safety bullet 1 both already carry it. Keep the boundary-position preamble; delete here.                                                                                                                   |

**Net effect on `operating_strategy`:** 19 bullets (~1,164 tok) → **7 always-true bullets (~350–400
tok)**, with 6 bullets' content re-homed to server-emitted situational blocks, 3 to tool
descriptions, and 3 deduped outright.

Grouped tally: always-true **7** (1, 2, 3, 7, 14, 16, 18 — with 14 relocating to the final
contract), situational **6** (5, 6, 8, 9, 11–13 as two blocks, 15), belongs-on-tool **3** (8-part,
10, 11-part, 17), cut/dedupe **3** (4, 17, 19).

---

## 2. Exit condition 2 — situational blocks: yes, emitted server-side

**Decision: emit situational rule blocks from signals the server already computes before the first
LLM pass.** No new inference infrastructure is required; this is the same pattern
`active_domain_signals` + `skillGatePreload` already use (per-turn overlay onto the prepared prompt
via `applyActiveDomainSignalsOverlay`).

The blocks and their triggers:

| Block                 | Rules it carries (from §1)                                                                 | Emission signal                                                                                                                                                                                      | Signal exists today?                                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Write turn**        | entity-resolution order (15), exact-full-IDs (safety #4), `state_key` coverage (safety #5) | `resolveFastChatTurnIntent(...).requiresWrite` (`turn-intent.ts:102-157`) — already computed pre-LLM and already routes the tool surface                                                             | **Yes**                                                                                                                       |
| **Web research turn** | when-to-search (11), parallelize/cite (12), persistence (13)                               | Union of: web tools present on the launch surface; `web_research` in the sensed cards' `buildos_capability_ids` (computed today, then thrown away by the renderer); `looksLikeDelegatedResearchTurn` | **Partially** — the capability-id hook is free; a dedicated `looksLikeWebResearchTurn` regex next to turn-intent is ~20 lines |
| **Routing / gate**    | gate-ACTIVE handling (8), `skill_search` fallback (6), outcome-card guidance (5)           | Already emitted: the Active Domain Signals section renders gate state per turn                                                                                                                       | **Yes — done**                                                                                                                |
| **Ledger**            | loaded-skills ledger semantics (9)                                                         | `extractLoadedSkillIdsFromHistory` non-empty                                                                                                                                                         | **Yes**                                                                                                                       |

**The mid-turn arrival problem, and its existing solution.** A situational block computed pre-turn
misses situations that develop mid-turn (the model decides to research on round 3). The runtime
already has the right seam: `materializeDirectTools` (`stream-orchestrator/index.ts:542-555`)
injects a system notice whenever tools materialize mid-turn ("Additional tools now available…").
**Attach the block's rules to that notice** — when `web_search`/`web_visit` materialize mid-turn,
the notice carries the research rules (including persistence). Rules then arrive at exactly the
moment they become applicable, in the recency position, instead of sitting mid-list from turn one.

Constraints to respect (verified in code):

- Turn-intent **bypasses domain sensing** for pure native writes (`turn-preparation.ts:125-127`) —
  the write block must key off turn-intent itself, not sensing.
- `project_create` gets no situational sections (its fork already omits signals).
- Prepared-prompt caching: situational blocks must render via the overlay path, and should sit
  **after** the static prefix. Today `active_domain_signals` is inserted at position 4, which cuts
  the cacheable prefix off before `operating_strategy`/`safety` (Pass-1 cache hit in the dump:
  40.6%). Moving per-turn dynamic sections after the static rule sections is a free cache win and
  should ship with this restructure.
- Each block gets a scaffold flag (like `skillRoutingCoaching`) so it's A/B-able in the harness.

**What about `activation: always_on`?** Leave it dead — and remove or repurpose the enum value.
Wiring always-on _skills_ would just move static prompt text into a registry file at the cost of
indirection; the two reliable homes for every-turn behavior remain the base prompt and code
(tasker §4 stands). Situational blocks are base-prompt content, conditionally rendered — consistent
with that constraint. If a skill's content must ride a situation, the existing
`skillGatePreload`/`renderPreloadedSkillPromptContent` path is the seam (it already handles short-
format loading, ledger dedupe, and the overlay), extended to iterate a configured list instead of
gate-candidate[0].

---

## 3. Exit condition 3 — instruction-navigation layer target

Honest baseline **~2,675 tok** (§0.2). Target: **~1,500 tok (−45%)**, composed as:

| Piece                               |        Now |           Target | How                                                                                                                                                                                                                                                                                                                              |
| ----------------------------------- | ---------: | ---------------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Catalog table (24 rows)             |       ~800 |             ~800 | **Keep.** It is the only cold-routing index the model has; Tier 1 showed cold routing works. Rows are already dieted (`catalog_line`, WP-2). Do not cut rows to save tokens — cut a row only when the skill fails the AUTHORING_GUIDE delta test.                                                                                |
| `capabilities_skills_tools` framing |       ~340 |             ~150 | Delete the routing-signals paragraph (duplicated by bullets 4–6 _and_ by the signals section itself — after §1 it survives in exactly one place: the signals section). Two-layer framing compresses to 2 lines.                                                                                                                  |
| `active_domain_signals`             |     ~1,125 |         ~450–650 | When gate = SATISFIED BY PRELOAD: drop the candidate-domain and candidate-card metadata lines entirely (the section already tells the model they're "routing metadata the preload covers" — stop paying ~300 tok to list what it says to ignore). Cap preload "When to use" at 3 lines (now 6). Advisory turns: candidates stay. |
| Navigation bullets in strategy      |       ~410 |              ~60 | §1: bullets 4–6, 8–10 leave the static list; bullet 3 + compressed 7 remain.                                                                                                                                                                                                                                                     |
| **Total**                           | **~2,675** | **~1,470–1,670** |                                                                                                                                                                                                                                                                                                                                  |

Rationale for not going lower: the catalog is load-bearing for cold routing, and the signals section
is the delivery vehicle for the situational design in §2 — shrinking it below ~450 tok on gated
turns would strip the preloaded workflow content that made the preload worth building (WP-7).

---

## 4. Exit condition 4 — trim verdicts for the (true) five largest schemas

Reframed by §0.1: the top-5 by _authored_ size on the project surface, plus the two the tasker
named. Every verdict is against the chat-surface definition only (ops-layer schemas unaffected).

| Tool                                         | True size                                                                                                                                                                                                                                                                                                                                                          | Verdict |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| `create_onto_task` (2,468 ch / ~617 tok)     | **Trim ~700 chars.** The `parent`/`parents`/`connections` trio is three nested object schemas for graph-linking that chat turns essentially never express directly (`link_onto_entities` and the graph skills cover it). Drop `connections` and `parents` from the chat definition; keep single `parent`. Check tool-call telemetry for `connections` usage first. |
| `update_onto_task` (2,110 ch / ~527 tok)     | **Keep, minor trim (~10%).** It was never the ~1,047-token monster — that was the doubling artifact. Compress the `assignee_actor_ids` description (redundant with `assignee_handles`'s). Every other field earns its place; this tool is the platform's most-exercised write.                                                                                     |
| `create_onto_document` (2,000 ch / ~500 tok) | **Trim ~450 chars — clear win.** `parent`/`parents` are marked "(legacy)" in their own descriptions while `parent_id`/`position` are the real placement API. Delete the legacy pair from the chat surface.                                                                                                                                                         |
| `change_chat_context` (1,756 ch / ~439 tok)  | **Keep.** It absorbs the full zoom policy _by design_ (§1 bullet 17 moves here). This is the "per-tool rules belong on the tool" pattern working as intended.                                                                                                                                                                                                      |
| `update_onto_document` (1,736 ch / ~434 tok) | **Keep.** Carries the append/merge contract that safety rules reference; recently exercised by repair scenarios.                                                                                                                                                                                                                                                   |
| `tool_search` (1,414 ch / ~354 tok)          | **Trim ~300 chars, low priority.** Param descriptions carry worked examples that mattered more before direct surfaces + signals shrank its role.                                                                                                                                                                                                                   |
| `web_search` (1,185 ch / ~296 tok)           | **Keep, then grow slightly:** this is where bullet 11's source-quality tail lands (~120 chars). Net cheaper than the static bullet it replaces.                                                                                                                                                                                                                    |

Honest total from prose trims: **~1.5KB (~380 tok)** — worthwhile but secondary. The two bigger
tool-payload levers, in order:

1. **Fix the double-serialization bug** (§0.1) — restores trustworthy telemetry and un-breaks the
   `prompt-size-budget` assertions' relationship to reality.
2. **Surface composition question (flagged, not decided):** the 3 Libri tools ride every
   global/project launch surface (~490 tok true size) and the dumped "mark a task done" turn
   mounted 23 tools. Whether Libri belongs on launch or behind discovery is a product call — listed
   in §8 for DJ.

---

## 5. Exit condition 5 — research scratchpad landing place

**Decision: deterministic capture at the executor/finalization layer, landing in a per-project
"Research Log" document; synthesis stays the model's job; promotion on demand.**

Concretely:

- **Capture (deterministic, cannot fail):** `web_visit` already persists page snapshots
  (`persist: true` default). Add the missing turn-level record: when a turn's web tool calls ≥ 2,
  the finalization runner — which already computes exactly this condition for
  `shouldRepairResearchNoPersist` — appends a compact record (queries, visited URLs, one-line
  snippets, timestamp, triggering user message) to a lazily-created `document.knowledge.research`
  doc titled "Research Log" in the focused project. No model call involved.
- **Synthesis (opportunistic):** the existing prompt rule + `research_capture` skill keep steering
  the model to write the _good_ doc. When it does, the deterministic record still appends —
  cheap, and it cross-links the model's doc.
- **Promotion:** "turn this log entry into a real document" is a normal chat request; no new infra.
- **Why not `packages/agent-orchestrator/src/artifacts/`:** it's an empty directory in a package
  the chat runtime doesn't consume; landing there couples a shipping fix to unbuilt architecture.
  If/when agent-first artifacts materialize, the Research Log rows are the obvious migration source.
- **Repair interplay:** `RESEARCH_CAPTURE_MINIMUM_CALLS` repair stays as the model-behavior
  enforcement; the deterministic append makes the _data_ outcome 5/5 regardless of model
  compliance. The 4/5 prompt-rule pass rate stops being load-bearing.
- **`research_capture` skill fix (independent bug):** the skill is absent from
  `tools/domains/catalog.ts`, so domain sensing can never rank or preload it — it is reachable only
  via the static catalog row or explicit search. Add it to the web-research domain's skill list.

User-visible fork for DJ (see §8): auto-created "Research Log" docs appear in projects without the
user asking. Alternatives if that feels noisy: a dedicated table surfaced in the activity timeline
instead of a document (cleaner, more work), or capture-only-on-repair (log appears only when the
model failed to save — smallest footprint).

---

## 6. What this audit deliberately does not change

- **Safety & data rules (534 tok):** mostly true invariants; only two bullets move (exact-IDs and
  `state_key` join the write block; the anti-echo bullet absorbs deleted strategy bullet 19).
- **Final response contract at the end:** WP-6 placement is working; it gains bullet 14
  (user-stated durables) as a before-you-finish check.
- **`project_create` fork:** untouched; it already demonstrates the per-situation prompt at the
  context level.
- **Code-level floors:** repair instructions stay. The lesson of the 0/5 measurement is priority
  order — **mechanism > placement > size**. Nothing in this restructure trades a working code floor
  for a prompt rule.

## 7. Verification

Per tasker: `pnpm --filter @buildos/web test:agentic` with `AGENTIC_SCENARIOS=<id>`, `--retry=0`,
**≥5 runs per change**. Sensitive scenarios per §8 stage: research persistence + forward-carry for
the block/mechanism work; `task-multi-update` and `document-from-vague-description` for write-block
and tool-trim changes; the full Tier-1 set (13 scenarios) before/after the strategy-list rewrite.
Also re-run the `prompt-size-budget` test after the §0.1 fix — its 20,000-char ceiling currently
budgets against partially-phantom numbers.

## 8. Build order (each stage independently shippable + measurable)

1. **Find and fix the tool-definition double-serialization** (route-level; telemetry integrity).
   Start by diffing `JSON.stringify` of each def in `TOOL_DEFINITION_MAP` against a fresh import at
   server runtime; suspect in-place mutation of module singletons.
2. **Dedupe pass (no structure change):** delete bullets 4, 17, 19; compress bullet 7; trim the
   capabilities framing paragraph. ~−500 tok, zero behavioral novelty. Full Tier-1 before/after.
3. **Situational blocks:** write-turn block (signal exists), research-turn block (add the small
   classifier + ride `materializeDirectTools` notices for mid-turn), move bullets 5/6/8/9/10/15
   accordingly; tool-description moves (`skill_load`, `change_chat_context`, `web_search`).
   Scaffold-flag each block.
4. **Signals-section diet + section reorder** (candidates dropped when preloaded; dynamic sections
   after static prefix). Watch cache-hit % in dumps as the metric.
5. **Research Log deterministic capture** (§5) + `research_capture` domain-catalog fix.
6. **Tool prose trims** (§4): create_onto_document legacy fields, create_onto_task connections
   (after telemetry check), tool_search.

**DJ decision points:** (a) auto-created Research Log doc vs timeline-surfaced record vs
capture-only-on-repair (§5); (b) Libri on every launch surface vs behind discovery (§4); everything
else is implementation-level and pre-decided above.

---

## Build log — 2026-07-26 (same session, uncommitted)

Stages 1–4 + 6 of §8 are BUILT. §5 is owned by a separate agent (per DJ); the Libri surface question
is deferred (per DJ: Libri is outdated, don't touch).

1. **Double-serialization bug: found and fixed.** The mutator was
   `ToolExecutionService.getToolDefinition` (`tool-execution-service.ts`) — it "normalized" the
   matched definition by copying `function.name/description/parameters` onto the root **of the
   shared module-singleton object**, so every tool that ever executed stayed doubled for the life of
   the server process (exactly the arbitrary-looking affected set). All callers already read both
   shapes defensively; the mutation block is deleted and a regression test pins the invariant
   (definitions round-trip byte-identical through `getToolDefinition`).
2. **Dedupe pass:** bullets 4/17/19 deleted, bullet 7 compressed, bullet 14 moved to the Final
   Response Contract, capabilities routing paragraph compressed to one pointer.
3. **Situational blocks:** new `situational_rules` section (`situational-rules.ts`), rendered by
   seed build + the per-turn overlay. Write block = entity-resolution order + exact-full-IDs +
   `state_key` coverage (triggers on `turnIntent.requiresWrite` OR write tools mounted — capability,
   not guessed intent, so coverage is complete). Research block = bullets 11–13 (triggers on web
   tools mounted OR `looksLikeWebResearchTurn`, which also mounts web tools at launch via the tool
   selector). Mid-turn arrivals ride `materializeDirectTools` notices. Scaffold-flagged
   (`situationalRules`, variant `no-situational-rules`). Also fixed: prepared-prompt hits on
   sensing-bypassed native-write turns previously skipped the overlay entirely — the rebuild guard
   now also fires on an active situation. Tool-description moves: `skill_load` (ledger/format/
   examples/child-depth), `skill_reference_load`, `web_search` (source-quality tail).
4. **Signals diet + reorder:** preload-satisfied turns now render ONLY the preload block + next step
   (candidates/recommended/gap lists dropped); preload "When to use" capped 6→3. Section order is
   now statics-first (identity → capabilities → strategy → safety → tool surface → per-turn
   overlays → context sections → final contract) so the cacheable prefix survives past the rules.
5. **Tool prose trims:** `create_onto_task` 2,468 → 2,015 chars (dropped `parents`/`connections`;
   0 usages in recorded executions; executor still accepts them), `create_onto_document` 2,000 →
   1,598 (legacy `parent`/`parents` gone), `tool_search` 1,414 → 990.

**Measured section deltas** (probe build, project write turn): `operating_strategy` 4,656 → **964
chars (~241 tok, −79%)**; `safety_data_rules` 2,133 → 1,611; `capabilities_skills_tools` 4,562 →
4,230; `final_response_contract` 1,005 → 1,330 (+durables); `situational_rules` +808 only when
live. Net static-rules cost per turn: ~6.8KB → ~2.6KB.

**Verification:** 128 test files / 1,097 unit tests green (incl. 16 new situational-rules tests +
the double-serialization regression test); `pnpm typecheck` clean; prettier clean. Live e2e smoke
(1× each, `--retry=0`, real endpoint): `task-multi-update` PASS, `document-from-vague-description`
PASS, `task-complete-cold-reference` FAIL on the pre-existing forward-carry assertion (stated next
step on 0/4 surfaces — the known Tier-1 gap, unchanged from baseline; targeted by the §5 scratchpad
mechanism, not this restructure). No regressions observed.

**Remaining gate before calling the behavior verified: the tasker's ≥5×, `--retry=0` battery on the
Tier-1 scenario set.** Sequencing note: run it AFTER the scratchpad-mechanism agent lands its
changes — both edits touch the same runtime (finalization/repair paths), the dev server hot-reloads
uncommitted edits mid-battery, and one battery over the combined state is both cheaper and cleaner
than two confounded ones. Compare against `TIER_1_RESULTS_2026-07-25.md` baselines; also pull one
fresh prompt dump to confirm (a) per-tool sizes now report authored values and (b) Pass-1 cache-hit
% improved from the 40.6% baseline after the statics-first reorder.

_Related: tasker/39 (tracker) · `TIER_1_RESULTS_2026-07-25.md` (verification suite) ·
`research/SYNTHESIS.md` §3 (context-rot evidence) · `AUTHORING_GUIDE.md` (skill sizing rules this
stays consistent with)._
