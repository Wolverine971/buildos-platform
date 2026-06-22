<!-- apps/web/docs/features/agentic-chat/AUDIT_2026-06-10_HOLISTIC_ASSESSMENT.md -->

# Agentic Chat Holistic Assessment — 2026-06-10

The progress log below supersedes earlier recommendations in the original audit
body where they conflict.

## Progress log

**2026-06-11 — telemetry pull + flag decisions executed (typecheck clean, 252 v2 tests passing):**

_Telemetry (read-only, last 30d: 66 turns, 1,313 turn events — refreshes the assessment's open questions):_

- **Funnel usage is low:** only 13.5% of tool-using turns (7/52) route through a skill first; `first_lane` is `unknown` for 42/59 completed turns. Skills do load reliably when requested (24 `skill_requested` → 24 `skill_loaded`). The funnel exists; the model under-uses it. Future fix is prompt nudges, not machinery.
- **Deterministic supervisor earns its keep:** 50 `supervisor_status_emitted`, 9 `supervisor_force_synthesis` (~14% of turns), 1 finalization guard, 0 `ask_user`. The LLM judge had **never run once** (config telemetry only).
- **Prepared prompts had never been exercised:** 0 hits / 60 misses, 100% `missing_key` — the flag was simply off. Context-build cost: `session_cache` ~8ms vs `fresh_load` ~215ms (p50). TTFR p50 ≈ 9s is dominated by LLM passes (p50 3/turn), not context build — expectations for the prewarm trial should be modest.
- **Turn shape:** tool rounds p50 2 / p90 7; tool calls p50 5 / p90 16; validation failures on 6.8% of turns (all single-failure). ~20 turn-event rows per run — write amplification is a non-issue at current volume.

_Changes shipped:_

1. **LLM turn-supervisor judge deleted** (§2). Removed `turn-supervisor/llm-judge.ts` (+tests), the `turnSupervisorJudge`/`maxSupervisorJudgeCalls` orchestrator params, `resolveTurnSupervisorJudgeConfig` + `supervisor_judge_config` event + wiring from the endpoint, and the judge exports/types. The decision **trigger classification was kept** (renamed `TurnSupervisorDecisionTrigger`) since it's recorded on turn events. **Revert path:** restore from commit `aa585535` (last commit containing the judge) — noted in a code comment at `turn-supervisor/types.ts`.
2. **Prepared-prompt prewarm enabled by default** (§5 item 2). `isPreparedPromptPrewarmEnabled` default flipped false → true for a measured rollout; `FASTCHAT_PREPARED_PROMPT_PREWARM_ENABLED=false` rolls it back. Tests added for default-on + env rollback. Hardening: the prewarm endpoint now **fails open** if prepared-prompt build throws (it's a cache — must never fail the prewarm). **Before changing the default:** re-check `prepared_prompt_hit` rate and `time_to_first_response_ms` by `cache_source`.
3. **Zod boundary validation on the stream request** (§4 boundary). New `agentic-chat-v2/stream-request.ts`: permissive/passthrough schema (all fields optional, unknown keys allowed, nested payloads shape-checked only) → clear 400 with path-labelled issues instead of downstream `typeof` defense. Composes with the 2026-06-10 alias normalization. Unit tests in `stream-request.test.ts`; imported directly (not via barrel) so endpoint tests exercise real validation.
4. **Tool-surface slimming: re-evaluated and deliberately NOT shipped** (§1 item 3 — reverses the assessment's recommendation, per DJ). Production snapshot measurement showed the 2026-04-14 handoff is stale: `create_onto_task` is already 2,468 chars (old target ≤2,500 met), `create_onto_project` already ~5.3K (not ~11.8K). The dominant prompt cost is the **system prompt (~27–36K chars, ~2.4× the tool surface)**. New decision doc: `docs/specs/AGENTIC_CHAT_TOOL_SURFACE_REEVALUATION_2026-06-11.md` (current numbers, no-regression bar with telemetry baselines); old handoff marked SUPERSEDED.

**2026-06-22 — doc cleanup/status review:**

- The old services analysis and current-path cleanup prompt were removed as stale working guidance. The product path is now `/api/agent/v2/stream`, `/api/agent/v2/prewarm`, and `/api/agent/v2/stream/cancel`; the old route family and runtime flag branches are gone.
- The legacy planner/executor UI cruft from the April spec is already deleted. `agentic-chat-cruft-removal-2026-04-17.md` remains useful as the implementation log and deferred rename/decomposition record.
- Domain sensing has more downstream support than this original audit body described: active domain signals feed the prompt, the admin domain page reads the backlog, and `/api/admin/chat/domains/research-queue/promote` can promote session backlog into `domain_research_queue`. The remaining decision is not "is there a consumer?" but whether to make domain routing more forceful/product-critical and how to measure that.

**2026-06-22 — operational cleanup completed:**

- Generated DB types now include `agentic_chat_prepared_prompts` and `chat_turn_checkpoints`; the stream endpoint prepared-prompt table-client shim was removed, and checkpoint service types now use the generated Supabase client surface.
- Prepared-prompt prewarm remains default-on as the rollout posture. `FASTCHAT_PREPARED_PROMPT_PREWARM_ENABLED=false` is the rollback override, not the production default. Before changing the default again, review `prepared_prompt_hit`, `cache_source`, and `time_to_first_response_ms`.
- The stream endpoint header now names the current live responsibilities: request normalization, scope/context/prepared-prompt resolution, LLM/tool streaming with supervisor checkpoint/resume, and persistence/telemetry.
- Backend endpoint carving progressed: `last-turn-context.ts` now owns prior-turn continuity building/hints, `stream-attachments.ts` now owns stream-time attachment validation and live-vision signed image preparation, and `TurnObservabilityWriter` batches `chat_turn_events` until endpoint cleanup.
- Frontend decomposition progressed again: image/OCR attachment handling, send/receive/cancel stream lifecycle, and shell routing now live in `agent-chat-attachments.svelte.ts`, `agent-chat-stream-controller.svelte.ts`, and `agent-chat-shell-router.svelte.ts`. `AgentChatModal.svelte` is now ~2,498 LOC and primarily owns modal rendering, message/activity panes, session hydration glue, and controller wiring.
- Current doc status: the old tool-surface optimization handoff remains superseded by `docs/specs/AGENTIC_CHAT_TOOL_SURFACE_REEVALUATION_2026-06-11.md`; the turn supervisor spec now marks the LLM judge path as removed; domain docs now distinguish active prompt/admin consumption from the open product decision about stronger routing.
- Remaining follow-up: decide whether domain routing should stay advisory/admin-visible or become product-critical. Suggested measurement set: domain signal frequency, prompt-injected domain usage, research-backlog promotion rate, and downstream skill/tool usage by domain.

---

**2026-06-10 — fixed (typecheck clean, endpoint + agent suites passing):**

1. **`supabase: any` removed from the stream endpoint** (§4). All nine helpers in `/api/agent/v2/stream/+server.ts` now take `FastChatSupabaseClient` (= `SupabaseClient<Database>`); the `(supabase as any).rpc('merge_chat_session_agent_metadata', …)` cast is gone. 2026-06-22 cleanup: generated types now include `agentic_chat_prepared_prompts` and `chat_turn_checkpoints`, so the prepared-prompt table shim was removed and checkpoint service types now use the generated Supabase client surface.
2. **`tool_result` SSE payload deduplicated** (§4 smaller items). `buildToolResultEventPayload` now emits canonical snake_case only (`tool_name`, `tool_call_id`, `result`); the `toolName`/`toolCallId` duplicates and the `data` alias are gone. Client readers (`agent-chat-sse-handler.ts` `computeToolResultInfo`, `agent-chat-tool-presenter.ts` `extractToolResultPayload`/`resolveProjectId`/`recordDataMutation`) read canonical fields first and keep the legacy names as deploy-window fallbacks only. `FastAgentStreamEvent['tool_result']` type tightened to match.
3. **Snake/camel dual reads eliminated from the endpoint** (§4 boundary validation). `FastAgentStreamRequestInput` (wire, accepts deprecated `last_turn_context`/`voice_note_group_id`/`prewarmed_context`/`prepared_prompt_key` aliases) is normalized exactly once in `parseRequest` via `normalizeFastAgentStreamRequest` (`agentic-chat-v2/types.ts`); everything downstream reads single canonical fields. Context-snapshot casing normalization is consolidated into `normalizeFastChatContextSnapshot` / `normalizeFastChatContextCache` in `agentic-chat-v2/context-cache.ts` — this deleted the endpoint-local `normalizePrewarmedContextCache` and collapsed the ~50-line camel/snake prepared-`context_payload` block into one call. Note: `context_payload` is only ever written camelCase by the prewarm endpoint, so the snake reads were pure paranoia; they now live in exactly one normalizer.

Not done (per DJ): `djtryserver.ts` stays — known experiment. Pre-existing unrelated test failure: `AgentComposer.test.ts` ("attach existing project image" button lookup) fails on clean main too.

---

**Scope:** Full-system review of the agentic chat: frontend (`AgentChatModal.svelte` + supporting modules), streaming endpoint (`/api/agent/v2/stream`), service layer (`agentic-chat`, `agentic-chat-lite`, `agentic-chat-v2`), capability → skill → tool funnel, context scoping (global / project / entity), domain sensing, and turn supervisor.

**Method:** Direct read of the two core files (stream endpoint now ~4,250 lines after the June endpoint extractions, modal now ~2,498 lines after the June frontend extractions) plus five parallel deep-dives: service-layer map, tool funnel, context system, frontend architecture, and a docs intent-vs-reality sweep.

---

## Overall verdict

This is a genuinely sophisticated harness — the architecture has converged on the right patterns, and several things that feel unfinished are further along than they appear. The capability → skill → tool funnel is real and well-shaped. The supervisor is mostly _done_, not half-done. The problems are not architectural; they are:

- **Concentration problems** — two god files carrying everything (the endpoint and the modal).
- **Duplication problems** — scope resolution copied in four places; snake/camel dual-reads scattered through the endpoint.
- **Decision debt** — the LLM judge was deleted on 2026-06-11; prepared-prompt prewarm is default-on pending telemetry review; domain sensing is consumed by prompt/admin surfaces, but its product role is still advisory unless a future routing decision makes it stronger.

The system is at the point where the highest-value work is pruning and consolidating, not adding.

---

## 1. The capability → skill → tool funnel: built, and the right shape

The stated design goal — "the agent should understand BuildOS capabilities, then call the proper skills, then call the proper tools" — **is implemented and works as intended.**

- **96 tools** registered (`tools/core/definitions/`), but never exposed all at once. Seven surface profiles (`global_basic`, `project_basic`, `project_write`, `project_document`, `project_write_document`, `project_calendar`, `project_create_minimal` — `tools/core/gateway-surface.ts:37–195`) expose 8–12 direct tools per turn, plus discovery tools (`skill_load`, `tool_search`, `tool_schema`) which are always present.
- **34 markdown skills** with a root/child hierarchy (`tools/skills/registry.ts:46–165`), indexed as a compact table in the system prompt (~500 tokens); full markdown loads only on `skill_load`.
- **13 capabilities** (`tools/registry/capability-catalog.ts:35–256`) described in the prompt so the model orients on "what BuildOS can do" before picking how.
- The funnel is **advisory, not gating** — loading a skill doesn't unlock tools. That is the correct call; gating tools behind skills creates dead-ends when the model skips the skill.

This matches current best practice (progressive disclosure + discovery tools). Weaknesses:

1. **Profile selection is regex sniffing.** `tool-selector.ts:10–65` picks the surface profile by pattern-matching the user message (`looksLikeProjectMutationTurn`, etc.). Pragmatic but brittle for multi-turn drift ("now add those to the doc" after a read-only turn). The gateway tools are the safety net — acceptable, but that's the load-bearing fallback.
2. **No measurement of whether the funnel is actually used.** `chat_turn_runs` already records `first_lane`, `first_skill_path`, `first_help_path`. Query it: what fraction of workflow-shaped turns route through `skill_load` first vs. going straight to tools? That single measurement validates (or falsifies) the funnel in practice.
3. **Superseded by 2026-06-11 re-evaluation.** Do not execute the old tool-surface optimization handoff. Production prompt snapshots showed the old size numbers and target premise were stale; the current decision is no tool-definition slimming unless a future prompt-cost effort passes the no-regression bar in `docs/specs/AGENTIC_CHAT_TOOL_SURFACE_REEVALUATION_2026-06-11.md`.

---

## 2. The turn supervisor: more finished than it feels

The deterministic supervisor (`turn-supervisor/deterministic-supervisor.ts`) is **fully wired** into the live loop. It observes every delta / LLM pass / tool event and its actions all have working endpoint plumbing:

- `emit_status` → `agent_state` SSE events
- `force_synthesis` → no-tool synthesis pass
- `ask_user` → **checkpoint/resume system** (checkpoint saved at `+server.ts:4510–4548`; next turn injects a resume system message at `+server.ts:3424–3488`; stale-resuming recovery and restore-on-failure both exist)
- `stop_with_message` → graceful halt

Default thresholds: force synthesis after 6 tool calls or 6 read-only rounds; ask-user after 2 repeated validation failures; first status after 10s of silence.

**Genuinely unfinished/current:**

- **LLM judge removed** — the optional judge path was deleted on 2026-06-11. Keep `TurnSupervisorDecisionTrigger`/digest telemetry; it is live turn-event signal, not judge residue.
- **Threshold calibration** — every supervisor decision is recorded in `chat_turn_events`. Calibrate from that data (e.g., how often does `force_synthesis` fire on turns that would have finished fine?).
- Endpoint-level tests for the checkpoint restore semantics (resuming → resumed → restore-on-fail) — orchestrator-level tests exist; the endpoint glue is intricate enough to deserve its own.

---

## 3. Domains: active signals, advisory routing — make the product call

Domain sensing is **live on every turn**:

- `senseDomains()` called at `+server.ts:3187` with the user message + prior session state
- Prompt block injected (`renderDomainSensingPromptBlock`, `+server.ts:3796–3806`)
- Session state merged + persisted (`mergeDomainSessionState`, `+server.ts:3808–3829`)
- Research backlog entries accumulated and recorded as turn events

The stale finding was "nothing downstream consumes it." Current reality is narrower: active domain signals are injected into the prompt, session state supports follow-up turns, the admin domain page reads demand/backlog, and `/api/admin/chat/domains/research-queue/promote` can promote session backlog into the durable queue.

The remaining product question is whether domain routing should stay advisory/admin-visible or become product-critical. A stronger route would make active domains/work capabilities nudge skill loading or tool selection more forcefully; the conservative route keeps them as prompt context and demand signal until evals prove no quality/latency regression.

Suggested metrics before changing the route strength:

- domain signal frequency by context type
- prompt-injected active-domain usage and follow-up continuity
- research backlog candidate creation and promotion rate
- downstream skill/tool usage by sensed domain and work capability
- TTFR/prompt-token delta for domain-active vs routine BuildOS turns

---

## 4. The streaming endpoint: right logic, wrong shape

The actual agentic loop lives in `streamFastChat()` (`stream-orchestrator/index.ts`, ~lines 787–1600) and the loop itself is solid — tool rounds, repair instructions, write ledger, read-loop escalation, finalization guard. The endpoint's problems are structural:

### Size & responsibility

- **Still large at ~4,250 lines**, but the June cleanup moved stream attachment/live-vision handling into `stream-attachments.ts` and `LastTurnContext` building into `last-turn-context.ts`.
- By volume, observability is still substantial (turn runs, turn events, timing metrics, prompt snapshots), but `TurnObservabilityWriter` now owns batched turn-event persistence instead of per-event detached writes.
- Remaining extraction targets: supervisor-checkpoint glue, session hydration/finalization branches, and any remaining endpoint-local helper clusters that do not need route state.
- The endpoint header used to say _"Minimal SSE path … no planner loop"_; the 2026-06-22 cleanup replaced it with the current live responsibilities.

### Boundary validation

- `parseRequest` is `(await request.json()) as FastAgentStreamRequest` (`+server.ts:370`) — **zero validation.**
- Every downstream consumer compensates with defensive `typeof` checks and snake/camel dual-reads (`preparedPromptKey ?? prepared_prompt_key`, `contextType ?? context_type` — the pattern appears a dozen times).
- One zod schema that normalizes to a single wire format would delete hundreds of lines of defensive code.

### Write amplification

Per turn: turn-run insert + several updates, prompt snapshot, a **batched turn-event insert at endpoint cleanup**, timing metric, tool-execution rows, messages, metadata merges, _plus_ an LLM-powered agent-state reconciliation after every turn. Still several DB round trips per turn, but the highest-churn event path no longer does one detached insert per event.

- Watch batch size/error telemetry for `fastchat_turn_event_batch`; the event rows still preserve `sequence_index`.
- Check whether the per-turn reconciliation LLM call earns its cost.
- The cancel watcher polls `chat_sessions` every 750ms per active turn — works, but is the chattiest possible design.

### Platform risk: detached turns on Vercel

When the client disconnects, the endpoint sets `streamDetached` and deliberately **skips `agentStream.close()`** so the turn keeps running (`+server.ts:5301–5303`). On Vercel, function lifetime is tied to the response stream — keeping it un-closed is what keeps the instance alive, but that mechanism is undocumented, and `waitUntil()` (from `@vercel/functions`) is **not** used for the genuinely detached tasks (`detachFastChatTask`, `detachTimingTask`). A function freeze after stream close can silently drop those writes. Either wrap detached work in `waitUntil` or document why the open-stream trick is sufficient. (The 285s turn timeout vs. 300s `maxDuration` headroom is deliberate and good.)

### Smaller items

- **`djtryserver.ts` (474 lines) in the route directory is a retained experiment** — nothing imports it, but it is explicitly out of scope for cleanup unless a future task deletes it.
- The fallback tool-executor branch at `+server.ts:4200` is unreachable (the `ToolExecutionService` wrapper always exists when the raw executor does).
- `supabase: any` throughout the helpers loses type safety on the most critical path.
- The `tool_result` SSE payload carries duplicated field names (`tool_name`/`toolName`, `tool_call_id`/`toolCallId`) — back-compat cruft worth a deprecation pass.
- The `LastTurnContext` entity extraction now lives outside the endpoint in `last-turn-context.ts`, but the underlying recursive key-sniffing remains heuristic. Longer-term: tools should declare their entity outputs explicitly instead of the continuity helper guessing.

---

## 5. Context system: works, but four copies of the same brain

The three-scope model (global / project / entity-focus) is coherent end-to-end, and the layered cache (prepared prompt → session cache → request prewarm → fresh load, `+server.ts:3623–3770`) is a legitimate latency design. Issues:

1. **Scope resolution is duplicated in four files** — `context-loader.ts`, `prewarm/+server.ts`, `stream/+server.ts`, and client-side `agent-chat-session.ts` each re-derive "effective project ID / context type." Highest drift risk in the system. Build one `resolveScope()` module, used everywhere.
2. **Prepared-prompt prewarm is fully built and default-on** (`isPreparedPromptPrewarmEnabled` falls back to true). `FASTCHAT_PREPARED_PROMPT_PREWARM_ENABLED=false` is the rollback override. Keep the default-on rollout until `prepared_prompt_hit`, `cache_source`, and `time_to_first_response_ms` are reviewed.
3. Cache invalidation is **TTL-only** (2 min) with a context-shift-hint bypass. Pragmatically fine; document the four-layer precedence in one place — right now it exists only as the if/else chain in the endpoint.
4. Context shape variants (`LightProject`, `ProjectContextData`, `OntologyContext`) create transformation burden across scopes — candidate for a discriminated union later, not urgent.
5. History composition runs in two places (prewarm + stream) with the same env-tunable settings — keep them importing the same function (they do today; don't let them fork).

---

## 6. Frontend: good bones, the modal is the last monolith

The extraction work already done is genuinely good:

| Module                                   | Role                                                    | Tests          |
| ---------------------------------------- | ------------------------------------------------------- | -------------- |
| `agent-chat-sse-handler.ts`              | Parses 14–15 SSE event types, DI-injected               | 736 test lines |
| `agent-chat-tool-presenter.ts`           | Tool formatting, entity-name cache, toasts              | 514 test lines |
| `agent-chat-session.ts`                  | Session snapshot load, prewarm API                      | substantive    |
| `agent-chat-prewarm.svelte.ts`           | Prewarm lifecycle controller                            | substantive    |
| `agent-chat-voice.svelte.ts`             | Voice adapter                                           | substantive    |
| `agent-chat-attachments.svelte.ts`       | Draft/message image upload + OCR polling                | substantive    |
| `agent-chat-stream-controller.svelte.ts` | Send/receive/cancel lifecycle, stale-run guards, timing | substantive    |
| `agent-chat-shell-router.svelte.ts`      | Context/focus routing + A2A wizard state                | focused        |
| skill/operation activity, formatters     | Idempotent activity upserts                             | solid          |

~85% of non-modal logic is tested. Svelte 5 runes are used correctly throughout; no legacy reactive syntax, no store misuse. Single app-wide modal instance mounted from `Navigation.svelte`; no state duplication with global stores.

The remaining problem is **`AgentChatModal.svelte` itself: ~2,498 lines, still with enough session/message/effect glue to deserve another pass and zero direct modal tests.** It is no longer the upload pipeline, stream lifecycle manager, or shell router; those controllers have shipped. It is now mainly a render coordinator, session hydration bridge, activity/message owner, and dependency wiring layer. Two next extractions give the most relief:

1. **Session hydration/finalization controller** — resume/load/finalize/session metadata and active-turn refresh still live inline.
2. **A2A turn runner** — the wizard state moved, but the helper-message fetch + auto-run loop still depends on stream transport and can be split once its tests pin behavior.

`sendMessage()`/cancel/finalization moved into `agent-chat-stream-controller.svelte.ts` during the 2026-06-22 cleanup and now has colocated regression coverage.

---

## 7. Service layer: three generations, all partially live

| Dir                 | Status      | Notes                                                                                                                       |
| ------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------- |
| `agentic-chat-v2`   | ✅ Primary  | 20 imports from the stream endpoint: orchestrator, context-loader, supervisor, observability.                               |
| `agentic-chat-lite` | ✅ Required | Sole prompt builder. Every turn pinned to `LITE_PROMPT_VARIANT` (request `prompt_variant` ignored).                         |
| `agentic-chat`      | ⚠️ Hybrid   | Shared tool registry, gateway surface, domains, execution service, state reconciliation. Older planner/executor paths dead. |

God files beyond the endpoint: `stream-orchestrator/index.ts` (53K), `context-loader.ts` (89K — loads 25+ context shapes), `repair-instructions.ts` (36K — all six repair strategies in one file). Duplicated logic between `tool-arguments.ts` and `turn-supervisor/digest.ts` (both parse/classify tool errors). Zero TODO/FIXME markers — forward work lives in docs instead, which is fine but means the docs must stay honest (see §8).

LLM calls per turn: typically 3–5; max 12 rounds; plus the post-turn reconciliation call.

---

## 8. Docs: prune the graveyard

Roughly a third of the agentic-chat docs are stale or superseded and actively misleading (several still describe `fastchat_prompt_v1` and dual-prompt routing that died April 2026).

**Source of truth (keep & follow):**

- `docs/specs/agentic-chat-operating-model.md` (2026-04-09, canonical mental model)
- `docs/specs/agentic-chat-lite-prompt-consolidation-2026-04-16.md` (shipped prompt architecture)
- `docs/specs/AGENTIC_CHAT_TURN_SUPERVISOR_SPEC_2026-05-23.md` (implemented)
- `apps/web/docs/features/agentic-chat/README.md` + `AUDIT_2026-04-17_OVERVIEW.md`

**Archive (superseded/stale):**

- `AGENTIC_CHAT_LIGHTWEIGHT_HARNESS_PLAN.md` + `_CONTINUATION_HANDOFF.md` (self-marked superseded; removed during 2026-06-22 cleanup)
- `AGENTIC_CHAT_SERVICES_ANALYSIS.md` (Dec 2024 — pre-everything; removed during doc cleanup)
- `agentic-chat-skill-tool-architecture-v2.md` (self-marked historical)

**Update:**

- `docs/brainstorms/2026-05-12-agentic-chat-domain-layer.md` — now marked historical with a 2026-06-22 current-status block.
- `AGENTIC_CHAT_TOOL_SURFACE_OPTIMIZATION_HANDOFF.md` — superseded by `docs/specs/AGENTIC_CHAT_TOOL_SURFACE_REEVALUATION_2026-06-11.md` and removed during 2026-06-22 cleanup; do not execute.

---

## Prioritized recommendations

1. **Make the three flag decisions** (all are carried complexity with no verdict):
    - LLM judge → **done:** deleted on 2026-06-11; keep deterministic trigger/digest telemetry.
    - Prepared-prompt prewarm → **current:** default-on rollout; review telemetry before changing the default.
    - Domain sensing → **current:** consumed by prompt/admin queue flow; decide whether routing stays advisory or becomes product-critical.
2. **Do not ship the superseded tool-schema slimming handoff.** Future prompt-cost work should start with system-prompt section profiling and the no-regression bar in the 2026-06-11 re-evaluation.
3. **Query existing telemetry** — `first_lane`/`first_skill_path` distribution (is the funnel used?), supervisor decision rates (are thresholds right?), `cache_source` distribution (is prewarm earning its keep?). The observability is unusually good; make it pay rent.
4. **Boundary hardening on the endpoint** — zod schema + single wire format; batch turn events; verify detached-turn behavior on Vercel (`waitUntil`).
5. **Carve the remaining monoliths** — endpoint helpers into modules; session hydration/finalization and A2A turn runner out of the modal.
6. **Housekeeping** — delete `djtryserver.ts`; build a single `resolveScope()` module; keep docs pointed at current specs instead of removed tasker/handoff files.
