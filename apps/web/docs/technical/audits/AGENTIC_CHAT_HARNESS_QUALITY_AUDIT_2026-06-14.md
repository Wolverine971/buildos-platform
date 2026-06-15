<!-- apps/web/docs/technical/audits/AGENTIC_CHAT_HARNESS_QUALITY_AUDIT_2026-06-14.md -->

# Agentic Chat Harness — Quality Audit & Tier 1 Remediation

**Date:** 2026-06-14
**Scope:** Full agentic chat flow — `AgentChatModal.svelte` → `POST /api/agent/v2/stream` → `streamFastChat` orchestrator → lite prompt builder → tool/gateway surface → model routing.
**Status:** Audit complete. Tier 1 remediation in progress (see checklist at bottom).

This document tracks an independent quality evaluation of the agentic chat harness, triggered by an external agent review. It verifies the external claims against ground truth, records findings the external review missed, and lays out a tiered remediation plan.

---

## 1. System map (the live path)

| Layer           | File                                                                                                                     | Notes                                                                  |
| --------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| UI entry        | `apps/web/src/lib/components/agent/AgentChatModal.svelte`                                                                | 112KB; `sendMessage()` ~line 2366; consumes SSE via `createSSEHandler` |
| SSE handler     | `apps/web/src/lib/components/agent/agent-chat-sse-handler.ts`                                                            | switch at ~line 440                                                    |
| Endpoint        | `apps/web/src/routes/api/agent/v2/stream/+server.ts`                                                                     | **5,217 lines**; single ~2,900-line detached handler closure           |
| Orchestrator    | `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/index.ts`                                                 | **1,592 lines**; single `while(true)` tool loop                        |
| Prompt builder  | `apps/web/src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.ts`                                                | **1,993 lines**                                                        |
| Gateway surface | `apps/web/src/lib/services/agentic-chat/tools/core/gateway-surface.ts`                                                   | 281 lines                                                              |
| Skill registry  | `apps/web/src/lib/services/agentic-chat/tools/skills/registry.ts`                                                        | 45 skills (44 with Libri off)                                          |
| Model routing   | `packages/smart-llm/src/model-config.ts`, `model-selection.ts`, `apps/web/src/lib/services/openrouter-v2/model-lanes.ts` | OpenRouter primary                                                     |

Three generations coexist: `agentic-chat` (legacy tools/skills), `agentic-chat-v2` (live orchestrator + endpoint), `agentic-chat-lite` (live prompt builder). v2 + lite is the production path.

---

## 2. Verdict on the external review

| #   | External claim                                                                                                    | Verdict                                        | Severity |
| --- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | -------- |
| A   | Full catalog (capabilities, domain index, root + child skill tables, tool surface) inlined every turn             | **CONFIRMED**                                  | Medium   |
| B   | Product logic lives as prompt prose duplicating validators/schemas/supervisor/repair                              | **CONFIRMED, stronger than stated**            | **High** |
| C   | Gateway/discovery tools preloaded too aggressively; orchestrator flips into recovery/supervisor mode when present | **CONFIRMED mechanically; framing overstated** | Medium   |
| D   | Model routing is experiment-biased (qwen3.7-plus), not lane-biased                                                | **OVERSTATED / mostly NOT supported**          | Low      |

### A — Catalog bloat (CONFIRMED)

`buildCapabilitiesSkillsToolsSection()` (`build-lite-prompt.ts:492`) takes no args and is emitted unconditionally for every context (incl. `project_create`, which has 1 tool and zero skill routing). `LITE_PROMPT_VARIANT` is a cache-key label, not a branch.

- Always-on catalog ≈ **1,900–2,400 tokens** (12 capabilities + 13-domain index + 22-row root table + **23-row child table**).
- Total static floor ≈ **3,800–4,200 tokens** before user data, re-sent every tool round.
- The static prefix is **byte-identical across contexts by design** (test `build-lite-prompt.test.ts:892`) to enable provider prefix-caching. This is a deliberate feature — fixes must preserve it.

> **Ground-truth correction:** an early read suggested the child-skill table was dead (no `parentId` in `*.skill.ts`). In fact skills are defined via `defineMarkdownSkill(...)` which parses `parent_id` from each `SKILL.md` frontmatter. **23 of 45 skills are children.** The child table is real and is the single largest always-on catalog chunk.

### B — Prose duplicates runtime enforcement (CONFIRMED, stronger)

The project-create contract exists in **five places**:

1. Prompt prose `PROJECT_CREATE_WORKFLOW_LITE` (`build-lite-prompt.ts:93-108`)
2. Near-identical second copy in `buildLocationLoadedContextSection` project_create branch (`:300-312`)
3. `create_onto_project` tool-schema description (`agentic-chat/tools/core/definitions/ontology-write.ts:753-1037`) — nearly verbatim
4. Zod validators (`ProjectSpecRelationshipNodeSchema`)
5. Three repair builders in `stream-orchestrator/repair-instructions.ts` (`:31-41`, `:289-310`, `:421-427`)

Write-truthfulness safety bullets (`build-lite-prompt.ts:643-652`) are _also_ deterministically enforced by `enforceMutationOutcomeIntegrity` (rewrites final text), the `<write_ledger>` injection, and the document-claim corrector. The test file documents **three real regressions** caused by prose drifting against the runtime (commits `bc05e6ac`, `1af1c70b`, `1aea16fb`).

### C — Gateway preloaded + flips orchestrator mode (CONFIRMED, framing overstated)

`gateway-surface.ts:206` prepends all 6 discovery tools (`domain_search, skill_search, skill_load, skill_reference_load, tool_search, tool_schema`) to **every profile except `project_create_minimal`**. `stream-orchestrator/index.ts:182`:

```ts
const gatewayModeActive =
	allowedToolNames.has('tool_search') ||
	allowedToolNames.has('tool_schema') ||
	allowedToolNames.has('skill_load');
```

gates ~20 branches. **But this is the default, not an occasional mode** — those tools are always present, so `gatewayModeActive` is true on essentially every real turn. There is no "direct-first, discover-on-miss" contract; it is "gateway always mounted + direct tools expand on miss." The on-miss materialization machinery (`:1219-1234`, `:1276-1281`) already exists — the lean inversion is ~80% wired but mounted eagerly.

Per-context launch surface (direct + discovery):

- general/global: 7 + 6 = 13 · project read: 8 + 6 = 14 · project mutation: 12 + 6 = 18 · daily_brief: 14 + 6 = 20 · **project_create: 1 + 0 = 1** (the one lean profile)

### D — Model routing (OVERSTATED)

`ACTIVE_EXPERIMENT_MODEL = 'qwen/qwen3.7-plus'` (`model-config.ts:7,16`) — but in **every lane it is the last/tail fallback**, reached only after 3–4 higher-priority models fail. The live `tool_calling` lane order: Tencent Hy3 → DeepSeek V4 Flash → MiniMax M3 → Xiaomi MiMo → qwen. The "simple selection" injections (`model-selection.ts:60,92`) require `powerful`/`quality` profiles, but the orchestrator always calls with `profile: 'balanced'`, so they never fire on a chat turn. **Zero model-specific branching exists in the prompt/tool layer** — there is a genuine stable cross-model tool-calling contract. Real (smaller) concerns: using the experiment constant as the universal last-resort fallback (`model-lanes.ts:169` + five `|| ACTIVE_EXPERIMENT_MODEL` defaults) is a foot-gun; the dead `agentRecommendations.agentChat.{planner,executor,synthesis}` config (`model-config.ts:864-878`) describes a split that does not exist and misled the external reviewer.

---

## 3. Findings the external review missed

1. **Two redundant read-loop detectors.** `read-loop-escalation.ts` AND `context-gathering-ledger.ts` (395 lines) both detect "reading without new evidence" and both can force synthesis. ~430 lines reclaimable.
2. **Dead LLM-judge vestiges.** The supervisor LLM judge was removed 2026-06-11 but `resolveSupervisorDecisionTrigger` (`index.ts:578-611`) + digest cost still run as telemetry. `types.ts:122` says "restore from commit aa585535 if ever needed."
3. **Unfinished refactor, stale docs.** `REFACTOR-STATUS.md` Phase 4 unchecked; it claims `index.ts` is 1,103 lines — it's **1,592**. ~30 mutable loop-local flags.
4. **Inconsistent round budgets.** Supervisor `maxToolRounds=8` vs orchestrator `12`/`gatewayRoundCap`.
5. **Dead request field.** UI sends `ontologyEntityType` every turn (`AgentChatModal.svelte:2539-2561`); endpoint never reads it.
6. **Caching is Moonshot-only.** `prompt_cache_key` is forwarded only when `provider === 'moonshot'` (`openrouter-v2-service.ts:895`); the primary OpenRouter path sends no caching directive. Anthropic-style `cache_control` is used nowhere. (See Tier 1 #3 note below.)

---

## 4. Overall assessment

The harness is at the **"successful but over-grown"** stage. Every guardrail traces to a real past failure (model lied about a write, looped on reads, ended on a lead-in). That was correct against weaker models. The cost now: ~2k wasted tokens/turn, redundant enforcement that drifts, and a refactor frozen halfway. The strategic direction the external review reached for is right — **as models get smarter, the static harness becomes friction** — but the work is mostly **collapse and invert**, not rewrite. The lean architecture (pull-based discovery, direct-first) is ~80% already in the code, mounted eagerly instead of lazily. `project_create` proves the lean path works end-to-end.

---

## 5. Tiered remediation roadmap

### Tier 1 — high value, low risk (this PR)

1. **Remove the child-skill table from the static catalog (all contexts).** Replace with a one-line pointer; children remain reachable via `skill_search`/`skill_load`. Preserves byte-identical prefix. (Claim A)
2. **Collapse the duplicated project-create prose.** Remove the rule lines in `buildLocationLoadedContextSection` that restate `PROJECT_CREATE_WORKFLOW_LITE`; keep one canonical block. (Claim B, safe subset)
3. **Prompt caching** — reclassified. The byte-identical static prefix already enables OpenRouter automatic prefix caching for providers that support it (e.g. DeepSeek). Anthropic-style `cache_control` only helps Anthropic/Gemini, which are not in the primary lanes, and would require restructuring system messages into content-array breakpoints. **Decision: do not ship speculative caching.** The real near-term token win is Tier 1 #1. Revisit explicit `cache_control` if/when an Anthropic or Gemini model enters a primary lane.

### Tier 2 — the strategic inversion (✅ items 4/5/6 SHIPPED 2026-06-14, behind flag)

4. **DONE** — Trim always-on discovery to `skill_search` + `domain_search`; materialize the other 4 on first use. Gated by `FASTCHAT_LEAN_DISCOVERY` (default OFF).
5. **DONE (revised, safer)** — Decouple `gatewayModeActive` from the _specific_ tools removed at launch by broadening it to also recognize `skill_search`/`domain_search`. **Deliberately did NOT lazy-arm recovery on first miss** — that would leave write-recovery machinery disarmed on write turns (writes are direct tools, never "miss"), regressing reliability on weaker models. Recovery stays armed for all gateway-capable turns.
6. **DONE** — Replace the full 13-domain index with a `domain_search` pointer (domains still injected conditionally via Active Domain Signals).
7. **CANCELLED** — Collapse project-create field rules to schema-only. DJ vetoed: BuildOS routes across a wide model pool incl. weak/older models that fail project creation without explicit in-prompt guidance. The prose is load-bearing, not redundant. See `feedback_keep_project_create_prose` memory.

### Tier 3 — debt cleanup

8. **NEEDS STAGED ROLLOUT (not done)** — Merge the read-loop detectors. Investigation 2026-06-15 found **three** overlapping force-synthesis systems (`read-loop-escalation.ts`, `context-gathering-ledger.ts`, `turn-supervisor/deterministic-supervisor.ts`) with genuinely different threshold semantics (discovery-round exclusion, budget 8 vs 12, gateway-gating asymmetry, a token-saturation trigger unique to the ledger). A naive merge would **move when synthesis fires** on real traffic → reliability risk on weak models. Verdict: shadow-compare → flag (`AGENTIC_CHAT_CONSOLIDATED_READ_LOOP=off|shadow|on`) → delete, with golden fire-round characterization tests first. Held pending DJ go-ahead.
9. **CANCELLED (premise wrong)** — "Delete LLM-judge vestiges." On inspection these are NOT dead: the LLM judge was already cleanly removed 2026-06-11 (commit aa585535). What remains — `resolveSupervisorDecisionTrigger`, `TurnSupervisorDecisionTrigger`, the `trigger` field, and the `digest` — is **live telemetry** persisted to `chat_turn_events` (`+server.ts:4352-4368`) and summarized in turn logs (`:4496-4507`), deliberately retained ("useful on its own"). Especially valuable during the lean-discovery canary. No change made.
10. Finish Phase 4 (extract `gateway-recovery.ts`, fix stale line counts), reconcile round budgets.
11. **DONE 2026-06-15** — Introduced `LAST_RESORT_MODEL` (= DeepSeek V4 Flash) decoupling the universal fallback from `ACTIVE_EXPERIMENT_MODEL`; deleted the dead `agentRecommendations.agentChat` config (no source consumers); removed the dead `ontologyEntityType` field end-to-end (UI, types, request schema, test).

---

## 6. Tier 1 progress checklist — ✅ COMPLETE (2026-06-14)

- [x] **T1.1** Remove child-skill table from `buildCapabilitiesSkillsToolsSection` + add pointer line; drop unused `listChildSkills` import
- [x] **T1.1** Update `build-lite-prompt.test.ts` child-table assertions (now `.not.toContain` + pointer)
- [x] **T1.2** Trim duplicated project-create rules in `buildLocationLoadedContextSection` (4 lines → 1 pointer)
- [x] **T1.2** Preserve the one genuinely-unique fragment ("snake_case prop keys") by folding it into canonical `PROJECT_CREATE_WORKFLOW_LITE`
- [x] **T1.3** Caching reclassified (no code change) — see Tier 1 #3 above
- [x] **Verify** `agentic-chat-lite` suite green (27/27: prompt 21, preview 3, shadow 3)
- [x] **Verify** `svelte-check` 0 errors (1 pre-existing unrelated warning)
- [x] **Verify** independent review of diff — SAFE TO SHIP; discoverability preserved via `skill_search`/`skill_load`, byte-identical prefix held, no live dangling refs
- [x] **Verify** no other consumers depend on child-table rendering (only `listChildSkillsForSkill` per-parent path used by `skill_load`, untouched)

### Measured impact

- **~550–850 tokens removed** from every lite turn's static prefix (23-row child table → 1 pointer line).
- Project-create rule duplication reduced from 2 prompt copies to 1 canonical block (drift surface narrowed).
- Byte-identical static-prefix caching property preserved.

### Follow-up nits (Tier 3, non-blocking)

- `listChildSkills()` (`registry.ts:148`) is now unused (only `listChildSkillsForSkill` is called) — safe to delete in a later sweep.

---

## 7. Tier 2 progress checklist — ✅ items 4/5/6 COMPLETE (2026-06-14)

- [x] **T2.6** Domain index → `domain_search` pointer in `buildCapabilitiesSkillsToolsSection`; drop unused `listDomains` import; tests updated
- [x] **T2.4** `gateway-surface.ts`: `GATEWAY_LAUNCH_DISCOVERY_TOOL_NAMES = [skill_search, domain_search]` + `isLeanDiscoveryEnabled()`; `getGatewayDiscoveryTools()` branches on `FASTCHAT_LEAN_DISCOVERY` (default OFF)
- [x] **T2.5** `stream-orchestrator/index.ts`: broadened `gatewayModeActive` to recognize `skill_search`/`domain_search` (keeps on-demand loading + recovery armed under lean; byte-identical when flag off)
- [x] **T2.4** `skill-search.ts`: `materialized_tools: ['skill_load']` so the search→load hop is round-free (robust for weak models; no-op when flag off)
- [x] **T2.4** `tool-trace.ts`: classify `skill_search`/`domain_search` as `read_discovery` for accurate rollout traces
- [x] **Flag** `FASTCHAT_LEAN_DISCOVERY` documented in both `.env.example` files (default OFF)
- [x] **Tests** added: lean tool-selector (2), make-or-break orchestrator on-miss materialization under lean launch (1), skill-search `materialized_tools` (1), trace classification (2)
- [x] **Verify** affected suites green: agentic-chat-lite (27), tool-selector (14), stream-orchestrator sibling (16) + subdir (12 files), skill-search (2), tool-trace (15)
- [x] **Verify** `svelte-check` 0 errors
- [x] **Verify** independent review of runtime diff — GO; flag-off provably inert, write-recovery preserved
- [x] **Verify** pre-existing `tool-executor.test.ts` failures (5) confirmed unrelated via `git stash` (fail identically on base)

### Design decision (important)

Item 5 was implemented as a **minimal broadening**, not the originally-planned "lazy arm-on-first-miss." Lazy arming would disarm write-recovery on write turns (writes don't trigger a tool miss), which is exactly the reliability the weak-model pool depends on. The broadening keeps the recovery machinery armed for every gateway-capable turn while still enabling on-demand discovery under lean.

### Rollout

`FASTCHAT_LEAN_DISCOVERY` ships **dark (OFF)**. Enable in canary/shadow, watch project-creation success + skill-load behavior across the weak end of the model pool before defaulting ON. Trace category `read_discovery` now covers the lean launch tools for that analysis.

### Measured impact (Tier 2)

- Launch discovery surface drops from 6 tools → 2 under the flag (the other 4 load on demand); ~4 fewer tool schemas in the opening menu on every non-create turn, on top of the ~700 tokens saved by removing the domain index.

---

## 8. Tier 3 progress (2026-06-15)

### Item 11 — ✅ COMPLETE (3 cleanups, no behavior change)

- [x] **11a** `LAST_RESORT_MODEL` (= `DEEPSEEK_V4_FLASH_MODEL`) added in `smart-llm/model-config.ts`; the universal last-resort fallback in `model-lanes.ts:169` and the five `|| ...` defaults in `openrouter-v2-service.ts` now point to it instead of `ACTIVE_EXPERIMENT_MODEL`. Rotating the experiment no longer changes the safety net. (Experiment model still intentionally appended to route tails — unchanged.)
- [x] **11b** Deleted dead `agentRecommendations.agentChat.{planner,executor,synthesis}` config (no source consumers; described routing that doesn't exist).
- [x] **11c** Removed dead `ontologyEntityType` field end-to-end: `AgentChatModal.svelte`, `agent-chat-enhancement.ts`, `agentic-chat-v2/types.ts`, `stream-request.ts` (zod), `stream-request.test.ts`.
- [x] **Verify** `smart-llm` rebuilt; tests green — smart-llm (39), model-lanes (16), openrouter-v2-service (18), stream-request (7); `svelte-check` 0 errors.

### Item 9 — ❌ CANCELLED (premise wrong; no change)

The "vestiges" are live telemetry. The LLM judge was already cleanly removed 2026-06-11 (commit aa585535); what remains (`resolveSupervisorDecisionTrigger`, `TurnSupervisorDecisionTrigger`, `trigger`, `digest`) is persisted to `chat_turn_events` (`+server.ts:4352-4368`) and summarized in turn logs (`:4496-4507`), deliberately retained. Especially useful during the lean-discovery canary. Left intact.

### Item 8 — 🟡 IN PROGRESS — Phase 1 (golden characterization) DONE 2026-06-15

Staged plan: (1) golden fire-round characterization tests to lock current behavior ✅, (2) shadow-compare a consolidated supervisor decision, (3) flag `AGENTIC_CHAT_CONSOLIDATED_READ_LOOP`, (4) delete after parity. Phases 2–4 not started — behavior-changing, awaiting go-ahead.

**Phase 1 deliverable:** `apps/web/src/lib/services/agentic-chat-v2/read-loop-synthesis.golden.test.ts` — drives the real `streamFastChat` round loop and asserts the exact round at which a no-tool synthesis pass is forced. This is the regression contract: any consolidation must keep these numbers (or change them as a reviewed decision). No production code changed in Phase 1.

**Baseline force-synthesis behavior (snapshot, 5 scenarios):**

| Scenario                               | gateway? | Binding trigger                                               | Synthesis at toolRounds |
| -------------------------------------- | -------- | ------------------------------------------------------------- | ----------------------- |
| Same read op repeated                  | yes      | `repeatedReadOpSetCount >= 3` (`index.ts:1388`)               | **3**                   |
| Varied search ops, repeated entity ids | yes      | ledger low-novelty (`lowNoveltyRounds >= 3`)                  | **4**                   |
| Varied novel reads                     | yes      | read-round cap (escalation / supervisor `readRounds`)         | **6**                   |
| Varied novel reads, NO discovery tool  | no       | supervisor alone (ledger + escalation off)                    | **6**                   |
| Read → write@3 → read                  | yes      | write resets + sticky-disables gateway block; supervisor only | **11**                  |

**Findings that change the consolidation design:**

- The **dominant real-world trigger is `repeatedReadOpSetCount >= 3`** (model repeats the same search → fires at round 3) — a _fourth_ force-synthesis path beyond the three named detectors. The investigation under-counted it. Any consolidation must preserve this.
- A **write sticky-disables the entire gateway read-loop block** (`hasWriteAttempt` never resets, `index.ts:1354`). After any write, only the supervisor can force synthesis, which is why the write scenario runs to 11. This asymmetry must be preserved or deliberately changed.
- The ledger's **low-novelty trigger is fragile**: a single detail (`get_*`) read of an already-seen id resets `lowNoveltyRounds` (re-counts it as "newly opened" evidence), so low-novelty only fires cleanly under search-only loops. Consolidation could accidentally make it fire more aggressively.
