<!-- docs/plans/AGENTIC_CHAT_LIGHTWEIGHT_HARNESS_PLAN.md -->

# Agentic Chat Lightweight Harness Plan

Status: Phase 6 dev/admin UI switch and eval capture implemented; eval scenario runs next
Date: 2026-04-14
Owner: BuildOS Agentic Chat

Related:

- [Seed Context Static and Dynamic Spec](/Users/djwayne/buildos-platform/docs/specs/agentic-chat-seed-context-static-dynamic.md)
- [Initial Seed Context Gap Analysis](/Users/djwayne/buildos-platform/docs/reports/agentic-chat-initial-seed-context-gap-analysis-2026-04-14.md)
- [Prompt Observability Plan](/Users/djwayne/buildos-platform/docs/plans/AGENTIC_CHAT_PROMPT_OBSERVABILITY_PLAN.md)
- [Prompt Observability Spec](/Users/djwayne/buildos-platform/docs/specs/AGENTIC_CHAT_PROMPT_OBSERVABILITY_SPEC.md)

## Goal

Build a lightweight harness for BuildOS agentic chat so we can simplify the
seed prompt and context hydration without breaking the existing FastChat v2
runtime.

The harness should make the prompt construction obvious:

```text
static frame + dynamic seed context + dynamic tool surface -> rendered system prompt
```

It should also make the swapped-in dynamic parts visible:

```text
focus, purpose, where, when, loaded context, retrieval map, tools, history summary
```

## Post-Cleanup Baseline

The cleanup pass made the current production path canonical:

```text
UI chat -> /api/agent/v2/stream
UI prewarm -> /api/agent/v2/prewarm
UI cancel -> /api/agent/v2/stream/cancel
LLM provider -> OpenRouterV2Service
Tool mode -> gateway/direct tool surface
Tool prompt text -> compact tool summary, with schemas supplied as model tools
Prompt builder -> agentic-chat-v2/master-prompt-builder.ts
Context loader -> agentic-chat-v2/context-loader.ts
Tool selector -> agentic-chat-v2/tool-selector.ts
Stream loop -> agentic-chat-v2/stream-orchestrator/index.ts
```

The lite harness should assume that baseline. It should not reintroduce
OpenRouter-vs-SmartLLM, gateway-on-vs-off, or compact-vs-full-tool-prompt
branches.

## Prompt Observability Cleanup

Status: implemented before runtime lite wiring.

The prompt dump should make provider tool payloads explicit:

- system prompt text lists tool names only
- provider tool schemas are sent separately in the model `tools` payload
- prompt dumps show current request tool count, total tool-definition chars, and
  per-tool char/token estimates
- prompt dumps include a context/profile size matrix for the canonical gateway
  surfaces

This cleanup prevents a misleading read of prompt dumps where schemas appear to
be missing even though they are sent outside the system prompt. It also gives us
the data needed to design smaller preloaded tool profiles later.

The context description should avoid low-signal labels like
`Context type: project.` and instead describe the useful working location and
scope directly.

## Practical Assessment

### What seems practical

The initial seed context framing is practical.

The system already knows enough before the user message to hydrate a useful
landscape:

- who BuildOS is
- what scope the chat is in
- why that scope matters
- where the agent is in the product and conversation
- when this is happening in the relevant timeline
- how the agent should behave
- which tools are currently available
- what context is loaded or intentionally omitted

This is the right place to simplify.

### What seems risky

A separate turn-specific routing layer is risky.

This shape is too close to a mini-router:

```text
what the user just asked
which capability/skill/tool route applies
what extra context must be fetched
```

If we force that before the model/tool loop, we duplicate what the model and
tools already do in a request/response pattern. It also creates a second place
where the system can misclassify intent, pick the wrong skill, or prefetch the
wrong context.

The practical boundary is:

- Do not build a pre-turn classifier first.
- Let the model read the seed context and choose the tool path.
- Record the actual chosen route for observability and evals.
- Add deterministic hints only when the UI/session already knows them, such as
  active project ID, focused entity ID, current surface, or recent context shift.

### What seems worth doing first

Phase-specific context is practical and valuable.

This shape maps cleanly onto the existing tool lifecycle:

```text
what a tool just did
where the runtime is now
what should happen next
```

The current runtime already has the events needed for this:

- tool call emitted
- tool result received
- validation failure
- skill requested
- skill loaded
- context shift emitted
- LLM pass completed
- final answer or terminal failure

The first version should be observability-only: append this phase frame to prompt
dumps and turn events. Later, if needed, inject a concise repair or continuation
instruction into the next model pass.

## Codebase Research

Current FastChat v2 is not just a prompt builder. The stream endpoint owns auth,
session resolution, history, context cache, tool execution, stream events,
context shifts, cancellation, persistence, timing, and prompt snapshots.

Important existing seams:

| Area                | Current file                                                                         | Use in lightweight harness                                                           |
| ------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| Prompt construction | `apps/web/src/lib/services/agentic-chat-v2/master-prompt-builder.ts`                 | Compare against first. Do not replace live behavior until lite passes evals.         |
| Context hydration   | `apps/web/src/lib/services/agentic-chat-v2/context-loader.ts`                        | Reuse first. It already loads global, project, and focused entity context.           |
| Tool selection      | `apps/web/src/lib/services/agentic-chat-v2/tool-selector.ts`                         | Reuse first. Tool surface is now the canonical gateway/direct surface.               |
| Stream loop         | `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/index.ts`             | Reuse first. It already accepts `systemPrompt` and `tools`.                          |
| Prompt snapshots    | `apps/web/src/lib/services/agentic-chat-v2/prompt-observability.ts`                  | Extend with section-level data and prompt variant.                                   |
| Local prompt dumps  | `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/prompt-dump-debug.ts` | Extend with section breakdown and phase frames.                                      |
| API endpoint        | `apps/web/src/routes/api/agent/v2/stream/+server.ts`                                 | Do not copy blindly. Extract or parameterize before adding a real parallel endpoint. |
| UI stream call      | `apps/web/src/lib/components/agent/AgentChatModal.svelte`                            | Add a dev/admin backend choice after server support exists.                          |

Main constraint:

```text
Do not fork the full stream endpoint as the first move.
```

The endpoint is large and behavior-heavy. A copy would immediately create drift
in auth, session state, context shifts, cancel behavior, telemetry, and message
persistence.

## Recommended Architecture

Create a new prompt harness namespace, but keep the runtime shared at first.
Keep the first implementation small enough that the complete prompt construction
root is easy to read:

```text
apps/web/src/lib/services/agentic-chat-lite/
  index.ts
  prompt/
    build-lite-prompt.ts
    phase-frame.ts
    types.ts
```

The central entrypoint should be:

```ts
buildLitePromptEnvelope(input): LitePromptEnvelope
```

It should return:

```ts
type LitePromptEnvelope = {
	promptVariant: 'lite_seed_v1';
	systemPrompt: string;
	sections: LitePromptSection[];
	contextInventory: unknown;
	toolsSummary: unknown;
};
```

Each section should be inspectable:

```ts
type LitePromptSection = {
	id: string;
	title: string;
	kind: 'static' | 'dynamic' | 'mixed';
	source: string;
	content: string;
	slots?: Record<string, unknown>;
	chars: number;
	estimatedTokens: number;
};
```

The important design rule:

```text
The root prompt builder must show the complete section order and all dynamic slots.
```

No hidden prompt assembly spread across unrelated files. Section helper
functions are fine, but the root builder must show the actual section order.

## Prompt Shape

Use this as the first lite seed shape:

```text
1. Identity and Mission
2. Current Focus and Purpose
3. Location and Loaded Context
4. Timeline and Recent Activity
5. Operating Strategy
6. Capabilities, Skills, and Tools
7. Context Inventory and Retrieval Map
8. Safety and Data Rules
```

This keeps the 5W1H model without forcing artificial sections.

### Static first pass

Static:

- identity
- mission
- core behavior
- safety invariants
- high-level progressive disclosure policy
- high-level ontology model

### Dynamic first pass

Dynamic:

- context type
- product surface
- project/entity focus
- project/entity names and IDs
- conversation position
- current local time
- timeline scope
- loaded timeline summary
- recent activity summary
- context completeness and limits
- retrieval map
- preloaded tools
- enabled integrations
- conversation summary or recent referents

### Do not add in first pass

Avoid these initially:

- a pre-turn intent classifier
- a pre-turn skill router
- automatic extra-context prefetch based only on semantic interpretation
- a copied second stream endpoint
- a new tool execution framework

## Dynamic Hydration By Scope

### Global workspace

Load enough to orient across projects:

- workspace focus
- project count and returned project count
- compact active project index
- project state, updated_at, next_step_short
- recent cross-project activity summary
- due-soon or upcoming timeline highlights when available
- context limits and retrieval map

Do not load full task/doc/event graphs by default.

### Project

Load enough to work inside one project:

- project object
- goals, milestones, plans, prioritized tasks
- document tree or compact doc index
- event window
- member/permission context
- project recent activity
- project timeline highlights
- context limits and retrieval map

Do not load unrelated projects by default.

### Project entity focus

Load enough to understand the focused entity in the project:

- parent project
- focused entity full details
- linked entities and edges
- nearby siblings, parents, or children when relevant
- entity-specific recent updates
- project timeline items that affect this entity
- context limits and retrieval map

Do not load the full project graph unless the entity task needs it.

## Phase Context Plan

Add a small phase frame builder:

```ts
buildPhaseFrame({
	phase,
	toolCall,
	toolResult,
	effectiveContextType,
	effectiveEntityId,
	latestContextShift,
	nextActionHint
});
```

First output targets:

- `chat_turn_events`
- local prompt dumps
- admin/debug surfaces

Initial phase frame shape:

```text
Phase: after_tool
Tool: update_onto_task
Result: success
Runtime location: project task updated, context still project
Known IDs: task_id=...
Next: summarize update and mention any linked follow-up if relevant
```

Only inject phase frames into the model loop when there is a concrete need:

- validation repair
- repeated read loop
- context shift
- ambiguous continuation
- tool failure recovery

## Parallel Testing Strategy

Use a staged approach.

### Phase 0: Docs and decision record

Outcome:

- keep the seed-context docs
- add this harness plan
- explicitly mark heavy turn-specific routing as out of scope for first pass

### Phase 1: Prompt renderer only

Outcome:

- pure prompt builder exists
- no live chat behavior changes

Work:

- add `agentic-chat-lite/prompt/`
- build `buildLitePromptEnvelope`
- reuse existing `MasterPromptContext` shape where possible
- include the current canonical tool surface in the envelope
- add unit tests for global, project, and entity-focused contexts
- add tests for rendered section order
- add token/char section breakdown
- add an observability-only phase frame builder

Acceptance:

- existing FastChat v2 behavior unchanged
- lite prompt can be rendered from fixtures without calling an LLM
- section metadata shows what was static and what was swapped in
- phase frames can be rendered from a synthetic tool lifecycle event

### Phase 2: Prompt preview harness

Status: backend implemented on 2026-04-14.

Outcome:

- dev/admin can inspect the lite prompt before it is used live
- preview output should include the same tool definition size report that prompt
  dumps now include

Work:

- add a dev/admin-only prompt preview endpoint
- input: context type, entity ID, project focus, optional sample message
- output: prompt variant, rendered prompt, sections, tools, context inventory, cost breakdown
- optionally compare v2 prompt vs lite prompt side by side

Acceptance:

- can preview global, project, and entity prompt shapes
- no user-facing chat behavior changes

Implemented:

- Added `apps/web/src/lib/services/agentic-chat-lite/preview/`.
- Added admin-only endpoint:
  `apps/web/src/routes/api/admin/chat/lite-prompt-preview/+server.ts`.
- Reuses `loadFastChatPromptContext`, `selectFastChatTools`,
  `buildLitePromptEnvelope`, `buildMasterPrompt` when requested,
  `buildPromptCostBreakdown`, and `buildToolSurfaceSizeReport`.
- Does not call an LLM, mutate data, create chat sessions, or change live chat
  behavior.
- Focused tests cover global preview, focused entity preview, optional current
  v2 comparison, invalid input, unauthenticated access, and non-admin access.

### Phase 3: Shadow comparison

Status: snapshot-backed comparison implemented on 2026-04-14.

Outcome:

- compare lite prompt construction against existing prompt dumps and snapshots

Work:

- render lite prompt from stored `context_payload` where available
- compare section sizes, total prompt size, tool list, context inventory
- add report output for gaps
- tag results with `prompt_variant = lite_seed_v1`

Implementation direction:

- Start with a pure comparison service under
  `apps/web/src/lib/services/agentic-chat-lite/shadow/`.
- Input should be a `chat_prompt_snapshots` row or an equivalent fixture, so
  tests can run without database access.
- Reconstruct `MasterPromptContext` from `prompt_sections`,
  `request_payload`, and `context_payload`.
- Render lite with the current canonical selected tools, then compare it against
  the stored v2 snapshot prompt and stored provider tool definitions.
- Keep this observability-only. Do not wire lite into `/api/agent/v2/stream`
  until Phase 4.

Implemented:

- Added `apps/web/src/lib/services/agentic-chat-lite/shadow/`.
- Added `buildLiteShadowComparison({ promptSnapshot })`.
- Added `formatLiteShadowComparisonReport(comparison)`.
- Added admin-only endpoint:
  `apps/web/src/routes/api/admin/chat/lite-shadow-comparison/+server.ts`.
- Endpoint accepts `prompt_snapshot_id` or `turn_run_id`, loads the stored
  `chat_prompt_snapshots` row, and returns structured comparison output plus an
  optional text report.
- Comparison output includes:
    - `prompt_variant = "lite_seed_v1"`
    - snapshot/version identifiers
    - reconstructed context scope
    - v2 and lite cost breakdowns
    - v2 and lite provider tool surface reports
    - prompt/provider payload deltas
    - tool names kept, added, and removed
    - context keys kept, added, and missing
    - gaps such as missing `context_payload`

Still out of scope:

- Parsing local `.prompt-dumps` files directly. Phase 3 currently targets
  database-backed prompt snapshots.
- Running lite by default or creating a parallel lite stream route. Those remain
  later rollout/evaluation decisions.

Acceptance:

- can answer "what got removed, moved, or kept"
- can identify missing global/project/entity context before live testing

### Phase 4: Runtime prompt variant

Status: implemented on 2026-04-14.

Outcome:

- existing v2 endpoint can run with lite prompt for selected dev/admin turns

Work:

- add request-level prompt variant, guarded by admin/server availability checks
- keep the same stream endpoint and same runtime loop
- when variant is lite, call `buildLitePromptEnvelope` instead of `buildMasterPrompt`
- persist prompt variant and section metadata in snapshots
- extend local prompt dumps with section breakdown

Request-level selector:

```text
prompt_variant: "lite_seed_v1"
```

Do not add another long-lived runtime fork for the default chat path. If a
server-side gate is needed for deployment safety, treat it as an availability
guard for dev/admin testing, not as a second product mode.

Acceptance:

- v2 remains default
- lite can be tested in the same chat infrastructure
- failures are traceable to prompt variant

Implemented:

- Added guarded request-level `prompt_variant` parsing for `/api/agent/v2/stream`.
- Kept untagged requests on `fastchat_prompt_v1`.
- Allowed `lite_seed_v1` only in dev or for users in `admin_users`.
- Reused the existing context/session/history/tool/runtime stream path.
- Swapped only prompt construction to `buildLitePromptEnvelope` when the lite
  variant is selected.
- Persisted `prompt_variant` in `chat_prompt_snapshots`.
- Added lite section metadata, context inventory, tools summary, prompt cost,
  and tool surface report metadata to prompt snapshots.
- Added lite section breakdowns to local prompt dumps when lite is selected.

Intentionally still out of scope:

- normal-user access to `lite_seed_v1`
- changing the default v2 prompt
- adding a parallel `/api/agent/lite/stream` route
- adding a frontend switch

### Phase 5: Parallel stream endpoint

Outcome:

- actual parallel backend exists without copying the full endpoint.

Work:

- extract the shared v2 stream request pipeline into a server service
- parameterize endpoint label, app name, prompt builder, prompt variant, and snapshot version
- add `/api/agent/lite/stream`
- add `/api/agent/lite/stream/cancel` only if cancellation cannot safely reuse the existing cancel path

Important:

```text
Do not copy apps/web/src/routes/api/agent/v2/stream/+server.ts into a lite folder.
```

The correct move is extraction plus parameterization.

Acceptance:

- `/api/agent/v2/stream` still works as default
- `/api/agent/lite/stream` uses the same auth/session/tool/runtime guarantees
- prompt snapshots clearly distinguish `fastchat_prompt_v1` and `lite_seed_v1`

### Phase 6: UI side-by-side testing

Status: implemented on 2026-04-14.

Outcome:

- selected users can test v2 and lite side by side.

Work:

- add dev/admin backend selector or query-param override
- keep any server-side availability gate separate from the request-level selector
- send selected endpoint or `prompt_variant` from `AgentChatModal.svelte`
- mark visible debug metadata in dev builds only

Acceptance:

- normal users stay on v2
- dev/admin can switch one chat turn or one session to lite
- no cross-contamination of prompt variant in snapshots

Implemented:

- Added a dev/admin-only prompt variant selector in `AgentChatModal.svelte`.
- Kept normal-user payloads untagged so they remain on `fastchat_prompt_v1`.
- Sends `prompt_variant: "lite_seed_v1"` only when the selector is explicitly
  set for the next turn.
- Resets the selector to `fastchat_prompt_v1` after each send and on
  conversation reset.
- Shows prompt variant in admin session prompt snapshot summaries and the
  prompt snapshot metric card.
- Includes prompt variant in session audit markdown and prompt eval targets.

Intentionally still out of scope:

- exposing lite to normal users
- making lite sticky across sessions
- adding a parallel `/api/agent/lite/stream` route

### Phase 7: Evals and migration decision

Outcome:

- decide whether lite is better by evidence, not feel.

Initial scenarios:

- global workspace overview
- named project overview
- project follow-up after overview
- focused task update
- focused document question
- Libri inventory question
- project creation
- ambiguous target write
- tool validation repair
- context shift after project creation

Compare:

- answer quality
- first tool called
- number of tool rounds
- validation failures
- prompt tokens
- latency
- final context shift
- user-visible clarity

Migration only starts if lite matches or beats v2 on these cases.

## Recommended First Implementation Slice

The smallest useful slice is:

1. Add `agentic-chat-lite/prompt/` with pure prompt rendering.
2. Add tests with hand-built global/project/entity fixtures.
3. Add section metadata that can later feed prompt dump/preview output.
4. Add phase frame builder as observability-only.
5. Stop before changing the live v2 endpoint.

This gives us the root prompt construction place the system is missing while
keeping the working chat intact.

## Non-Goals For The First Slice

- no new semantic turn router
- no new tool executor
- no full endpoint copy
- no automatic context prefetcher
- no default user-facing switch
- no removal of existing FastChat v2 prompt until evals justify it

## Success Criteria

The harness is successful when:

- the current chat is unchanged by default
- the lite prompt has one obvious construction root
- static and dynamic sections are visible before the LLM call
- prompt dumps show what was swapped in
- phase frames show what happened after tools
- global, project, and entity contexts can be previewed
- v2 and lite can be compared on the same scenarios
- simplification decisions are backed by prompt size, tool behavior, and answer quality

## Open Questions

- Should lite use a new route first, or a request-level prompt variant first?
  Recommendation: prompt variant first, route after extraction.
- Should phase frames be model-visible?
  Recommendation: observability-only first; inject only for repair or continuation.
- Should the UI expose a full backend toggle?
  Recommendation: dev/admin only until evals are stable.
- Should skills remain in the seed prompt?
  Recommendation: keep skill metadata high level, load full skill files on demand.
