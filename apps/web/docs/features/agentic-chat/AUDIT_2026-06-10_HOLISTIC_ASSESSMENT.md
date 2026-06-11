<!-- apps/web/docs/features/agentic-chat/AUDIT_2026-06-10_HOLISTIC_ASSESSMENT.md -->

# Agentic Chat Holistic Assessment — 2026-06-10

## Progress log

**2026-06-11 — telemetry pull + flag decisions executed (typecheck clean, 252 v2 tests passing):**

_Telemetry (read-only, last 30d: 66 turns, 1,313 turn events — refreshes the assessment's open questions):_

- **Funnel usage is low:** only 13.5% of tool-using turns (7/52) route through a skill first; `first_lane` is `unknown` for 42/59 completed turns. Skills do load reliably when requested (24 `skill_requested` → 24 `skill_loaded`). The funnel exists; the model under-uses it. Future fix is prompt nudges, not machinery.
- **Deterministic supervisor earns its keep:** 50 `supervisor_status_emitted`, 9 `supervisor_force_synthesis` (~14% of turns), 1 finalization guard, 0 `ask_user`. The LLM judge had **never run once** (config telemetry only).
- **Prepared prompts had never been exercised:** 0 hits / 60 misses, 100% `missing_key` — the flag was simply off. Context-build cost: `session_cache` ~8ms vs `fresh_load` ~215ms (p50). TTFR p50 ≈ 9s is dominated by LLM passes (p50 3/turn), not context build — expectations for the prewarm trial should be modest.
- **Turn shape:** tool rounds p50 2 / p90 7; tool calls p50 5 / p90 16; validation failures on 6.8% of turns (all single-failure). ~20 turn-event rows per run — write amplification is a non-issue at current volume.

_Changes shipped:_

1. **LLM turn-supervisor judge deleted** (§2). Removed `turn-supervisor/llm-judge.ts` (+tests), the `turnSupervisorJudge`/`maxSupervisorJudgeCalls` orchestrator params, `resolveTurnSupervisorJudgeConfig` + `supervisor_judge_config` event + wiring from the endpoint, and the judge exports/types. The decision **trigger classification was kept** (renamed `TurnSupervisorDecisionTrigger`) since it's recorded on turn events. **Revert path:** restore from commit `aa585535` (last commit containing the judge) — noted in a code comment at `turn-supervisor/types.ts`.
2. **Prepared-prompt prewarm enabled by default** (§5 item 2). `isPreparedPromptPrewarmEnabled` default flipped false → true for a ~1-week measured trial; `FASTCHAT_PREPARED_PROMPT_PREWARM_ENABLED=false` rolls it back (documented in `.env.example`). Tests added for default-on + env rollback. Hardening: the prewarm endpoint now **fails open** if prepared-prompt build throws (it's a cache — must never fail the prewarm). **Re-check in ~1 week:** `prepared_prompt_hit` rate and `time_to_first_response_ms` by `cache_source`.
3. **Zod boundary validation on the stream request** (§4 boundary). New `agentic-chat-v2/stream-request.ts`: permissive/passthrough schema (all fields optional, unknown keys allowed, nested payloads shape-checked only) → clear 400 with path-labelled issues instead of downstream `typeof` defense. Composes with the 2026-06-10 alias normalization. Unit tests in `stream-request.test.ts`; imported directly (not via barrel) so endpoint tests exercise real validation.
4. **Tool-surface slimming: re-evaluated and deliberately NOT shipped** (§1 item 3 — reverses the assessment's recommendation, per DJ). Production snapshot measurement showed the 2026-04-14 handoff is stale: `create_onto_task` is already 2,468 chars (old target ≤2,500 met), `create_onto_project` already ~5.3K (not ~11.8K). The dominant prompt cost is the **system prompt (~27–36K chars, ~2.4× the tool surface)**. New decision doc: `docs/specs/AGENTIC_CHAT_TOOL_SURFACE_REEVALUATION_2026-06-11.md` (current numbers, no-regression bar with telemetry baselines); old handoff marked SUPERSEDED.

---

**2026-06-10 — fixed (typecheck clean, endpoint + agent suites passing):**

1. **`supabase: any` removed from the stream endpoint** (§4). All nine helpers in `/api/agent/v2/stream/+server.ts` now take `FastChatSupabaseClient` (= `SupabaseClient<Database>`); the `(supabase as any).rpc('merge_chat_session_agent_metadata', …)` cast is gone. One deliberate, documented shim remains: `PreparedPromptsTableClient`, because `agentic_chat_prepared_prompts` (migration 20260502000002) is **not in the generated Database types** — run `pnpm gen:types` and delete the shim. (`chat_turn_checkpoints` is also missing; the turn-supervisor module already isolates that behind its own `SupabaseLike`.)
2. **`tool_result` SSE payload deduplicated** (§4 smaller items). `buildToolResultEventPayload` now emits canonical snake_case only (`tool_name`, `tool_call_id`, `result`); the `toolName`/`toolCallId` duplicates and the `data` alias are gone. Client readers (`agent-chat-sse-handler.ts` `computeToolResultInfo`, `agent-chat-tool-presenter.ts` `extractToolResultPayload`/`resolveProjectId`/`recordDataMutation`) read canonical fields first and keep the legacy names as deploy-window fallbacks only. `FastAgentStreamEvent['tool_result']` type tightened to match.
3. **Snake/camel dual reads eliminated from the endpoint** (§4 boundary validation). `FastAgentStreamRequestInput` (wire, accepts deprecated `last_turn_context`/`voice_note_group_id`/`prewarmed_context`/`prepared_prompt_key` aliases) is normalized exactly once in `parseRequest` via `normalizeFastAgentStreamRequest` (`agentic-chat-v2/types.ts`); everything downstream reads single canonical fields. Context-snapshot casing normalization is consolidated into `normalizeFastChatContextSnapshot` / `normalizeFastChatContextCache` in `agentic-chat-v2/context-cache.ts` — this deleted the endpoint-local `normalizePrewarmedContextCache` and collapsed the ~50-line camel/snake prepared-`context_payload` block into one call. Note: `context_payload` is only ever written camelCase by the prewarm endpoint, so the snake reads were pure paranoia; they now live in exactly one normalizer.

Not done (per DJ): `djtryserver.ts` stays — known experiment. Pre-existing unrelated test failure: `AgentComposer.test.ts` ("attach existing project image" button lookup) fails on clean main too.

---

**Scope:** Full-system review of the agentic chat: frontend (`AgentChatModal.svelte` + supporting modules), streaming endpoint (`/api/agent/v2/stream`), service layer (`agentic-chat`, `agentic-chat-lite`, `agentic-chat-v2`), capability → skill → tool funnel, context scoping (global / project / entity), domain sensing, and turn supervisor.

**Method:** Direct read of the two core files (5,322-line endpoint, 3,637-line modal) plus five parallel deep-dives: service-layer map, tool funnel, context system, frontend architecture, and a docs intent-vs-reality sweep.

---

## Overall verdict

This is a genuinely sophisticated harness — the architecture has converged on the right patterns, and several things that feel unfinished are further along than they appear. The capability → skill → tool funnel is real and well-shaped. The supervisor is mostly _done_, not half-done. The problems are not architectural; they are:

- **Concentration problems** — two god files carrying everything (the endpoint and the modal).
- **Duplication problems** — scope resolution copied in four places; snake/camel dual-reads scattered through the endpoint.
- **Decision debt** — two fully-built systems sitting behind off-by-default flags (LLM judge, prepared-prompt prewarm), plus domain sensing running live with nothing consuming its output.

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
3. **The tool-surface optimization handoff is the cheapest real win, unshipped.** `AGENTIC_CHAT_TOOL_SURFACE_OPTIMIZATION_HANDOFF.md`: `create_onto_project` is ~11.8K chars of schema, `create_onto_task` ~4.6K. Strategy already written (strip guidance into skills, keep machine schema, full detail via `tool_schema`; target ≤2,500 chars for `create_onto_task`). Ship it.

---

## 2. The turn supervisor: more finished than it feels

The deterministic supervisor (`turn-supervisor/deterministic-supervisor.ts`) is **fully wired** into the live loop. It observes every delta / LLM pass / tool event and its actions all have working endpoint plumbing:

- `emit_status` → `agent_state` SSE events
- `force_synthesis` → no-tool synthesis pass
- `ask_user` → **checkpoint/resume system** (checkpoint saved at `+server.ts:4510–4548`; next turn injects a resume system message at `+server.ts:3424–3488`; stale-resuming recovery and restore-on-failure both exist)
- `stop_with_message` → graceful halt

Default thresholds: force synthesis after 6 tool calls or 6 read-only rounds; ask-user after 2 repeated validation failures; first status after 10s of silence.

**Genuinely unfinished:**

- **LLM judge** — built but disabled (`FASTCHAT_TURN_SUPERVISOR_LLM_ENABLED=false`, 4s timeout, max 3 calls). Recommendation: **leave off, consider deleting.** The deterministic rules cover most of the value; a 4-second judge call mid-stream is a bad latency trade for a product whose pitch is speed.
- **Threshold calibration** — every supervisor decision is recorded in `chat_turn_events`. Calibrate from that data (e.g., how often does `force_synthesis` fire on turns that would have finished fine?).
- Endpoint-level tests for the checkpoint restore semantics (resuming → resumed → restore-on-fail) — orchestrator-level tests exist; the endpoint glue is intricate enough to deserve its own.

---

## 3. Domains: the one truly half-built thing — make a call

Domain sensing is **live on every turn**:

- `senseDomains()` called at `+server.ts:3187` with the user message + prior session state
- Prompt block injected (`renderDomainSensingPromptBlock`, `+server.ts:3796–3806`)
- Session state merged + persisted (`mergeDomainSessionState`, `+server.ts:3808–3829`)
- Research backlog entries accumulated and recorded as turn events

But **nothing downstream consumes it**: detection doesn't materialize skills or tools, and the research backlog is written and never read. Today it costs prompt tokens and metadata writes on every turn for observability-only value.

Note the doc/code divergence: `docs/brainstorms/2026-05-12-agentic-chat-domain-layer.md` still calls this "raw brainstorm, not implemented" — the docs are behind the code.

Two defensible paths:

- **(a) Finish Phase 1** — make the recommended-skill IDs from sensing actually nudge `skill_load`, and build the one consumer of the research backlog.
- **(b) Flag it off** until ready.

Running it half-wired is the only wrong option.

---

## 4. The streaming endpoint: right logic, wrong shape

The actual agentic loop lives in `streamFastChat()` (`stream-orchestrator/index.ts`, ~lines 787–1600) and the loop itself is solid — tool rounds, repair instructions, write ledger, read-loop escalation, finalization guard. The endpoint's problems are structural:

### Size & responsibility

- **5,322 lines; ~2,350 lines of helpers before `POST` even starts**, then a ~3,000-line handler wrapped in a `void (async () => …)()` IIFE.
- By volume, roughly **40% of the file is observability** (turn events, timing metrics, prompt snapshots).
- Extract into modules: attachments/live-vision (~450 lines), `LastTurnContext` building (~500 lines), turn-event/timing recording, supervisor-checkpoint glue.
- The file header still says _"Minimal SSE path … no planner loop"_ — that comment is now false and should go.

### Boundary validation

- `parseRequest` is `(await request.json()) as FastAgentStreamRequest` (`+server.ts:370`) — **zero validation.**
- Every downstream consumer compensates with defensive `typeof` checks and snake/camel dual-reads (`preparedPromptKey ?? prepared_prompt_key`, `contextType ?? context_type` — the pattern appears a dozen times).
- One zod schema that normalizes to a single wire format would delete hundreds of lines of defensive code.

### Write amplification

Per turn: turn-run insert + several updates, prompt snapshot, **one detached insert per turn event** (per tool call, per LLM pass, per supervisor decision), timing metric, tool-execution rows, messages, metadata merges, _plus_ an LLM-powered agent-state reconciliation after every turn (`+server.ts:5022–5064`). Easily 10–30 DB round trips per turn.

- Fine at current scale, but **batch the turn events** (accumulate, flush at finalize) — easy 80% of the win.
- Check whether the per-turn reconciliation LLM call earns its cost.
- The cancel watcher polls `chat_sessions` every 750ms per active turn — works, but is the chattiest possible design.

### Platform risk: detached turns on Vercel

When the client disconnects, the endpoint sets `streamDetached` and deliberately **skips `agentStream.close()`** so the turn keeps running (`+server.ts:5301–5303`). On Vercel, function lifetime is tied to the response stream — keeping it un-closed is what keeps the instance alive, but that mechanism is undocumented, and `waitUntil()` (from `@vercel/functions`) is **not** used for the genuinely detached tasks (`detachFastChatTask`, `detachTimingTask`). A function freeze after stream close can silently drop those writes. Either wrap detached work in `waitUntil` or document why the open-stream trick is sufficient. (The 285s turn timeout vs. 300s `maxDuration` headroom is deliberate and good.)

### Smaller items

- **`djtryserver.ts` (474 lines) in the route directory is dead** — nothing imports it. Delete.
- The fallback tool-executor branch at `+server.ts:4200` is unreachable (the `ToolExecutionService` wrapper always exists when the raw executor does).
- `supabase: any` throughout the helpers loses type safety on the most critical path.
- The `tool_result` SSE payload carries duplicated field names (`tool_name`/`toolName`, `tool_call_id`/`toolCallId`) — back-compat cruft worth a deprecation pass.
- The `LastTurnContext` entity extraction (~500 lines of recursive key-sniffing over arbitrary tool results, incl. prefix matching like `task_`/`proj_`) is heuristic soup. Longer-term: tools should declare their entity outputs explicitly instead of the endpoint guessing.

---

## 5. Context system: works, but four copies of the same brain

The three-scope model (global / project / entity-focus) is coherent end-to-end, and the layered cache (prepared prompt → session cache → request prewarm → fresh load, `+server.ts:3623–3770`) is a legitimate latency design. Issues:

1. **Scope resolution is duplicated in four files** — `context-loader.ts`, `prewarm/+server.ts`, `stream/+server.ts`, and client-side `agent-chat-session.ts` each re-derive "effective project ID / context type." Highest drift risk in the system. Build one `resolveScope()` module, used everywhere.
2. **Prepared-prompt prewarm is fully built and flagged off** (`FASTCHAT_PREPARED_PROMPT_PREWARM_ENABLED` defaults false). Carried machinery: nonce hashing, surface-profile pre-rendering, a dedicated table, the `consumePreparedPrompt` path with 10 distinct miss reasons. Same call as the judge: **enable it, measure TTFB for a week, then keep or delete.** The timing metrics to make this evidence-based already exist.
3. Cache invalidation is **TTL-only** (2 min) with a context-shift-hint bypass. Pragmatically fine; document the four-layer precedence in one place — right now it exists only as the if/else chain in the endpoint.
4. Context shape variants (`LightProject`, `ProjectContextData`, `OntologyContext`) create transformation burden across scopes — candidate for a discriminated union later, not urgent.
5. History composition runs in two places (prewarm + stream) with the same env-tunable settings — keep them importing the same function (they do today; don't let them fork).

---

## 6. Frontend: good bones, the modal is the last monolith

The extraction work already done is genuinely good:

| Module                               | Role                                       | Tests          |
| ------------------------------------ | ------------------------------------------ | -------------- |
| `agent-chat-sse-handler.ts`          | Parses 14–15 SSE event types, DI-injected  | 736 test lines |
| `agent-chat-tool-presenter.ts`       | Tool formatting, entity-name cache, toasts | 514 test lines |
| `agent-chat-session.ts`              | Session snapshot load, prewarm API         | substantive    |
| `agent-chat-prewarm.svelte.ts`       | Prewarm lifecycle controller               | substantive    |
| `agent-chat-voice.svelte.ts`         | Voice adapter                              | substantive    |
| skill/operation activity, formatters | Idempotent activity upserts                | solid          |

~85% of non-modal logic is tested. Svelte 5 runes are used correctly throughout; no legacy reactive syntax, no store misuse. Single app-wide modal instance mounted from `Navigation.svelte`; no state duplication with global stores.

The remaining problem is **`AgentChatModal.svelte` itself: 3,637 lines, ~40 `$state` vars, 10+ `$effect` blocks with implicit ordering dependencies, zero direct tests.** It is simultaneously a router (context selection → action selector → focus selector → A2A wizard → chat), an upload pipeline, and a stream lifecycle manager. Two extractions give the most relief:

1. **The agent-to-agent wizard mode** — a separate feature occupying ~400 lines of state + handlers + template. Own component, own state.
2. **The image attachment pipeline** (~500 lines: upload queue, SHA-256 hashing, OCR polling for draft and message attachments) — extract into a controller exactly like voice/prewarm. The pattern is already proven in this codebase.

`sendMessage()` (~300 lines: optimistic update + session bootstrap + stream + error rollback) shrinks naturally once those move.

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

- `AGENTIC_CHAT_LIGHTWEIGHT_HARNESS_PLAN.md` + `_CONTINUATION_HANDOFF.md` (self-marked superseded)
- `AGENTIC_CHAT_SERVICES_ANALYSIS.md` (Dec 2024 — pre-everything)
- `agentic-chat-skill-tool-architecture-v2.md` (self-marked historical)

**Update:**

- `docs/brainstorms/2026-05-12-agentic-chat-domain-layer.md` — sensing is partially live; doc says not implemented.
- `AGENTIC_CHAT_TOOL_SURFACE_OPTIMIZATION_HANDOFF.md` — still open; the one handoff worth executing.

---

## Prioritized recommendations

1. **Make the three flag decisions** (all are carried complexity with no verdict):
    - LLM judge → recommend **delete**.
    - Prepared-prompt prewarm → recommend **enable, measure TTFB for a week, keep or delete**.
    - Domain sensing → **finish Phase 1 or flag off**.
2. **Ship the tool-schema slimming** — biggest token/latency win, already spec'd, ~a day of work.
3. **Query existing telemetry** — `first_lane`/`first_skill_path` distribution (is the funnel used?), supervisor decision rates (are thresholds right?), `cache_source` distribution (is prewarm earning its keep?). The observability is unusually good; make it pay rent.
4. **Boundary hardening on the endpoint** — zod schema + single wire format; batch turn events; verify detached-turn behavior on Vercel (`waitUntil`).
5. **Carve the two god files** — endpoint helpers into modules; A2A wizard + image pipeline out of the modal.
6. **Housekeeping** — delete `djtryserver.ts`; fix the stale endpoint header comment; archive dead docs; build a single `resolveScope()` module.
