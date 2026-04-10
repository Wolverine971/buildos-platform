<!-- docs/reports/agentic-chat-prompt-dump-assessment-2026-04-09.md -->

# Agentic Chat Prompt Dump Assessment

Date: 2026-04-09

## Scope

Reviewed:

- [apps/web/docs/features/agentic-chat/README.md](/Users/djwayne/buildos-platform/apps/web/docs/features/agentic-chat/README.md)
- [docs/specs/agentic-chat-operating-model.md](/Users/djwayne/buildos-platform/docs/specs/agentic-chat-operating-model.md)
- [docs/specs/agentic-chat-skill-tool-architecture-v2.md](/Users/djwayne/buildos-platform/docs/specs/agentic-chat-skill-tool-architecture-v2.md)
- [apps/web/.prompt-dumps/fastchat-2026-04-09T20-24-29-978Z.txt](/Users/djwayne/buildos-platform/apps/web/.prompt-dumps/fastchat-2026-04-09T20-24-29-978Z.txt)
- [apps/web/.prompt-dumps/fastchat-2026-04-09T20-30-32-247Z.txt](/Users/djwayne/buildos-platform/apps/web/.prompt-dumps/fastchat-2026-04-09T20-30-32-247Z.txt)
- [apps/web/.prompt-dumps/fastchat-2026-04-09T21-13-51-858Z.txt](/Users/djwayne/buildos-platform/apps/web/.prompt-dumps/fastchat-2026-04-09T21-13-51-858Z.txt)
- [apps/web/.prompt-dumps/fastchat-2026-04-09T21-44-10-768Z.txt](/Users/djwayne/buildos-platform/apps/web/.prompt-dumps/fastchat-2026-04-09T21-44-10-768Z.txt)
- [apps/web/.prompt-dumps/fastchat-2026-04-09T21-45-43-525Z.txt](/Users/djwayne/buildos-platform/apps/web/.prompt-dumps/fastchat-2026-04-09T21-45-43-525Z.txt)
- [apps/web/.prompt-dumps/fastchat-2026-04-09T21-46-30-398Z.txt](/Users/djwayne/buildos-platform/apps/web/.prompt-dumps/fastchat-2026-04-09T21-46-30-398Z.txt)
- [apps/web/.prompt-dumps/fastchat-2026-04-09T21-48-22-284Z.txt](/Users/djwayne/buildos-platform/apps/web/.prompt-dumps/fastchat-2026-04-09T21-48-22-284Z.txt)
- [apps/web/.prompt-dumps/fastchat-2026-04-09T21-51-17-363Z.txt](/Users/djwayne/buildos-platform/apps/web/.prompt-dumps/fastchat-2026-04-09T21-51-17-363Z.txt)
- [apps/web/.prompt-dumps/fastchat-2026-04-09T23-28-12-656Z.txt](/Users/djwayne/buildos-platform/apps/web/.prompt-dumps/fastchat-2026-04-09T23-28-12-656Z.txt)
- [apps/web/.prompt-dumps/fastchat-2026-04-09T23-30-36-928Z.txt](/Users/djwayne/buildos-platform/apps/web/.prompt-dumps/fastchat-2026-04-09T23-30-36-928Z.txt)
- [apps/web/.prompt-dumps/fastchat-2026-04-09T23-31-16-566Z.txt](/Users/djwayne/buildos-platform/apps/web/.prompt-dumps/fastchat-2026-04-09T23-31-16-566Z.txt)

## Concrete Problems

### 1. Gateway prompt mismatch

The gateway prompt teaches `util.workspace.overview` and `util.project.overview` as if they are directly callable tools, but gateway mode exposes only:

- `skill_load`
- `tool_search`
- `tool_schema`
- `buildos_call`

Observed failure:

- The model attempted a direct `util.project.overview` call and got `Tool not available in this context`.

Impact:

- The model is being taught an execution pattern that the runtime rejects.
- Status/drill-in turns waste tool rounds and create avoidable failures.

Current status:

- Fixed in code and verified absent in the latest dumps.

### 2. Project drill-in is not sticky

After the conversation narrowed to `9takes`, the later prompt was still built in global context with no active project focus.

Impact:

- The model must rediscover project scope from history instead of starting with the narrowed scope.
- Project-specific follow-up actions are harder than they should be.

Status:

- This is currently being treated as a product-design issue, not an immediate bug fix.
- Desired direction from the current discussion: context should be the starting scope for the turn, but the agent should be able to move across projects based on the latest message.

### 3. Injected `agent_state` is contradictory

The prompt injected an active item telling the model to confirm the exact task ID even though the exact task ID had already been surfaced in the prior assistant turn.

Impact:

- The model is nudged toward unnecessary clarification.
- Prompt authority becomes split between history, structured context, and synthesized state.

Current direction:

- Strong candidate to remove or drastically reduce `agent_state` from the model prompt.

Current status:

- Removed from the fastchat prompt path and absent in the latest dumps.

### 4. Retry loop is too permissive

In the latest run, the model repeated the same invalid `onto.task.search` call with empty args multiple times before recovering.

Impact:

- Simple tasks take too many LLM passes.
- Validation churn is treated as recoverable for too long.
- The system looks unreliable even when it eventually succeeds.

Current direction:

- Research and redesign needed.
- Likely fix area: fail faster on repeated required-field misses and switch to a narrower repair path.

### 5. Continuity mechanism is weak in short chats

`lastTurnContext` is sent and stored, but continuity hints are largely ignored whenever raw history is preserved.

Impact:

- The system does not reliably carry forward structured state across normal short conversations.
- Follow-up turns depend too much on plain conversational text.

Status:

- Real issue, but not the first fix to land.
- In the latest dumps this is showing up more concretely as referent/ID carry-forward failure for follow-up task work.

## Prioritized Fix Order

1. Fix exact entity/task referent carry-forward so follow-up turns reliably reuse known IDs.
2. Add write-success gating so failed writes cannot be narrated as completed work.
3. Redesign the retry loop after targeted research.
4. Revisit context handling and continuity together instead of patching project stickiness in isolation.

## Notes From Current Discussion

- Global threads should be able to move across projects based on the latest user message.
- Project-page threads should start within that project scope.
- The hard problem is not entering project scope; it is knowing when the user intends to return to global scope.
- That likely needs a turn-level scope resolution model rather than sticky project focus alone.

## What Changed In This Session

### New spec

A focused entity-resolution spec now exists:

- [docs/specs/agentic-chat-entity-resolution-spec.md](/Users/djwayne/buildos-platform/docs/specs/agentic-chat-entity-resolution-spec.md)

This spec keeps the change deliberately small:

- reuse exact ids first
- search only when unresolved
- prefer project-scoped search before workspace-wide search
- keep `tool_search` scoped to op discovery
- do not redesign retry behavior yet

### Completed fix

The first fix was implemented: gateway-mode prompt guidance now consistently teaches that overview operations are executed via `buildos_call`, not as directly callable top-level tools.

Files changed:

- [apps/web/src/lib/services/agentic-chat-v2/master-prompt-builder.ts](/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat-v2/master-prompt-builder.ts)
- [apps/web/src/lib/services/agentic-chat/tools/registry/gateway-guidance.ts](/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat/tools/registry/gateway-guidance.ts)
- [apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator.ts](/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator.ts)
- [apps/web/src/lib/services/agentic-chat-v2/master-prompt-builder.test.ts](/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat-v2/master-prompt-builder.test.ts)
- [apps/web/src/lib/services/agentic-chat/prompts/prompt-generation-service.test.ts](/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat/prompts/prompt-generation-service.test.ts)

### Exact prompt behavior changed

Before:

- The prompt said things like "Workspace-wide status -> `util.workspace.overview`" and "Named or in-scope project status -> `util.project.overview`".
- That wording implied those ops were directly callable tools.

After:

- The prompt now says overview ops are canonical op ids in gateway mode.
- It explicitly instructs the model to use:
    - `buildos_call({ op: "util.workspace.overview", args: {} })`
    - `buildos_call({ op: "util.project.overview", args: { project_id: "<uuid>" } })`
    - or `buildos_call({ op: "util.project.overview", args: { query: "<project name>" } })`

### Recovery guidance also changed

The runtime repair messages were updated too, so the system does not reintroduce the old mental model after a validation error.

Changed areas:

- validation repair instruction text
- required-field retry guidance
- repeated root-help loop guidance

This matters because fixing only the initial system prompt would still leave the orchestrator injecting the older direct-call framing mid-turn.

### Completed follow-on cleanup

The prompt no longer injects `agent_state`, and the remaining root-help repair wording was updated so it no longer nudges the model back toward legacy path browsing.

Files changed:

- [apps/web/src/lib/services/agentic-chat-v2/master-prompt-builder.ts](/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat-v2/master-prompt-builder.ts)
- [apps/web/src/routes/api/agent/v2/stream/+server.ts](/Users/djwayne/buildos-platform/apps/web/src/routes/api/agent/v2/stream/+server.ts)
- [apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator.ts](/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator.ts)
- [apps/web/src/lib/services/agentic-chat-v2/master-prompt-builder.test.ts](/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat-v2/master-prompt-builder.test.ts)
- [apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator.test.ts](/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator.test.ts)

What changed:

- The prompt no longer tells the model to reuse `agent_state`.
- The `<agent_state>` block is no longer injected into the fastchat prompt.
- Recovery guidance now points the model to `tool_search`, `tool_schema`, and `buildos_call` instead of old `tool_help("root")` / path-browsing behavior.

Why this mattered:

- Older dumps at `20:24` and `20:30` contained contradictory synthesized state like "confirm exact task ID" even when the exact ID was already present in history and structured context.
- The latest dumps no longer show that extra authority layer competing with history/context.

### Completed entity-resolution phase 1

The first implementation pass for entity resolution has landed.

Files changed:

- [apps/web/src/lib/services/agentic-chat-v2/entity-resolution.ts](/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat-v2/entity-resolution.ts)
- [apps/web/src/lib/services/agentic-chat-v2/master-prompt-builder.ts](/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat-v2/master-prompt-builder.ts)
- [apps/web/src/routes/api/agent/v2/stream/+server.ts](/Users/djwayne/buildos-platform/apps/web/src/routes/api/agent/v2/stream/+server.ts)
- [apps/web/src/lib/services/agentic-chat/tools/registry/gateway-guidance.ts](/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat/tools/registry/gateway-guidance.ts)
- [apps/web/src/lib/services/agentic-chat/tools/skills/definitions/task_management/SKILL.md](/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat/tools/skills/definitions/task_management/SKILL.md)

What landed:

- the master prompt now contains an explicit entity-resolution block
- the prompt now distinguishes `tool_search` from actual entity lookup
- the prompt now teaches "reuse exact ids first, otherwise search"
- the runtime now derives a compact `recent_referents` hint from `lastTurnContext`
- `lastTurnContext` now extracts explicit assistant-text entity mentions with exact UUIDs, so task ids surfaced to the user can survive into the next turn more reliably
- the task-management skill now explicitly says to reuse exact ids from recent context or the prior assistant turn before searching again

What this should improve:

- follow-up turns like "mark that one done" after the assistant just listed task ids
- compressed-history turns where the prior assistant response surfaced exact ids in text
- model understanding that search is the correct fallback when the entity is unresolved

What this does not do:

- it does not redesign the retry loop
- it does not add automatic hidden search+write recovery
- it does not yet replace the current entity search ops with the future `search_buildos` / `search_project` surface

### Completed write-success gating

The next trust fix has now landed in the orchestrator.

Files changed:

- [apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator.ts](/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator.ts)
- [apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator.test.ts](/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator.test.ts)

What landed:

- the final assistant summary now checks actual write outcomes before letting mutation-success language pass through
- if there were write attempts, zero successful writes, and the final text still claims success, the orchestrator replaces that with an honest failure message
- bulk success framing like "Updates confirmed" is also blocked when writes failed

What this fixes:

- the exact trust failure seen in the latest prompt dumps, where failed task updates were later narrated as completed work

Current limitation:

- this is a safety gate on the final summary path
- it does not yet repair the write automatically
- it does not yet reason about partially successful multi-write turns beyond blocking obviously false bulk confirmation language

## Checkpoint Update From Latest Dumps

The newer dumps show that the gateway migration is now landing correctly at the prompt layer:

- The callable surface is consistently `skill_load`, `tool_search`, `tool_schema`, and `buildos_call`.
- The prompt consistently teaches canonical ops through `buildos_call`.
- The newer dumps no longer contain the old `agent_state` block.

This means the original prompt-architecture mismatch is no longer the main reason task updates are failing.

### Project context shape change

The newer dumps also reflect the project context reshaping work:

- each project now carries nested `goals`, `plans`, and `milestones` arrays
- the old top-level `project_goals`, `project_milestones`, and `project_plans` sections are gone in the newer format

This is a clear improvement.

Observed effect:

- older prompt dump at `21:13` was `71741` chars (`~17936` tokens)
- older prompt dump at `20:30` was `72884` chars (`~18221` tokens)
- newer prompt dumps at `21:48` / `21:51` are `~35765` chars (`~8941` tokens)

Conclusion:

- the project-shape compaction materially reduced prompt size
- it is more readable for the model
- it does not appear to be causing the failed task-update calls

### Current failure pattern

The main failure mode in the latest dumps is now argument construction and referent carry-forward.

Observed in [fastchat-2026-04-09T21-48-22-284Z.txt](/Users/djwayne/buildos-platform/apps/web/.prompt-dumps/fastchat-2026-04-09T21-48-22-284Z.txt):

- the previous assistant message already listed:
    - `Draft Announcement Email for NRL Partnership` = `881823a4-e74e-48d2-bf3e-b77db7e47b5f`
    - `Invite Phil to BuildOS` = `3cdf0778-5301-43da-a899-a67561b4fa73`
- the user then said to mark those exact tasks done
- the model still emitted repeated `buildos_call({ op: "onto.task.update", args: {} })`

Observed tool failures:

- `onto.task.update` with empty `args`
- `util.project.overview` with empty `args`
- later recovery to `tool_schema({ op: "onto.task.update" })`
- then more empty `onto.task.update` calls even after schema inspection

Observed in [fastchat-2026-04-09T21-51-17-363Z.txt](/Users/djwayne/buildos-platform/apps/web/.prompt-dumps/fastchat-2026-04-09T21-51-17-363Z.txt):

- the conversation history already contains the exact task id for `Invite Phil to BuildOS`
- the continuity hint also preserves project/task context
- the model still emitted repeated `buildos_call({ op: "onto.task.get", args: {} })`
- it eventually fell back to `util.project.overview` and `onto.task.list` instead of directly resolving the known task

### More serious product issue: false success claims

The latest dumps show a more important trust problem than the raw validation errors.

In [fastchat-2026-04-09T21-48-22-284Z.txt](/Users/djwayne/buildos-platform/apps/web/.prompt-dumps/fastchat-2026-04-09T21-48-22-284Z.txt), every attempted `onto.task.update` failed validation. But the following turn's compressed history in [fastchat-2026-04-09T21-51-17-363Z.txt](/Users/djwayne/buildos-platform/apps/web/.prompt-dumps/fastchat-2026-04-09T21-51-17-363Z.txt) says:

- `Draft Announcement Email for NRL Partnership` marked done
- `Invite Phil to BuildOS` marked done

That means the user was told the tasks were updated even though no successful mutation is visible in the recorded tool execution trace.

Impact:

- reliability/trust is currently the bigger product problem than the pure validation churn
- the system is not only failing some writes; it is sometimes narrating failed writes as completed work

### What the current fixes did and did not fix

What the completed fixes addressed:

- removed the old gateway prompt mismatch
- removed contradictory `agent_state` prompt pressure
- reduced prompt size substantially through the newer project context shape
- aligned the prompt and repair language with the new capability / skill / tool architecture

What they did not solve:

- exact task/entity referent carry-forward from recent turns into concrete tool args
- preventing empty-args write calls when the model has not actually resolved the required id/fields
- preventing false success claims when writes fail

So the current failed task-update calls are not explained by the project data shape, and they are not fully solved by the prompt cleanup already landed.

Current status after the entity-resolution phase 1 implementation:

- referent carry-forward is now materially better specified and better represented in the prompt/runtime path
- prompt guidance now clearly teaches search fallback
- explicit write-success gating is now in place for the final assistant summary path

Current status after the next entity-lookup cleanup:

- gateway missing-id detail fallbacks now prefer entity search over list when a usable query can be inferred
- this now applies to `onto.project.get` and the core ontology detail ops (`task`, `goal`, `plan`, `document`, `milestone`, `risk`)
- list fallback still exists, but only when no usable query is available
- repair guidance now matches the runtime and tells the model to use search/list/tree candidates, not list/tree only

Why this matters:

- the runtime now better matches the intended rule: reuse exact ids first, otherwise search
- follow-up detail turns no longer immediately broaden into list calls when the latest user message already contains the entity wording needed to search
- this does not replace proper referent carry-forward, but it reduces the cost of missing it

## Checkpoint Update From Latest Test Run

The latest three dumps show a mixed result:

- the status-update turn behaved well
- the mutation trust fix behaved well
- but the first write turn still failed even though the exact `plan_id` was already available in the prompt

### What worked

Observed in [fastchat-2026-04-09T23-28-12-656Z.txt](/Users/djwayne/buildos-platform/apps/web/.prompt-dumps/fastchat-2026-04-09T23-28-12-656Z.txt):

- the model answered the project-status question directly from the structured project context
- it did not waste a tool round on overview or ontology re-fetches
- `tool_rounds=0`, `tool_calls=0`

This is a good outcome and shows the prompt is successfully teaching "answer from context when the snapshot already contains the answer."

### What still failed

Observed in [fastchat-2026-04-09T23-30-36-928Z.txt](/Users/djwayne/buildos-platform/apps/web/.prompt-dumps/fastchat-2026-04-09T23-30-36-928Z.txt):

- the user asked: `ok this is over "Maryland Student Walkout Coverage" so please mark that plan complete or done`
- the exact plan record was already present in structured prompt data:
    - `debd6c62-8701-4f2a-972d-9036d1bc7c2f`
    - `Maryland Student Walkout Coverage`
- the model still did:
    - `tool_schema({ op: "onto.plan.update" })`
    - `buildos_call({ op: "onto.plan.update", args: {} })`

Result:

- validation failure for missing `plan_id`
- validation failure for missing update fields

This is important because it means the remaining failure is not unresolved entity lookup. The exact ID was already available. The model simply failed to ground available prompt data into write args.

### What improved compared to earlier failures

The write-success gate worked exactly as intended.

Observed in [fastchat-2026-04-09T23-31-16-566Z.txt](/Users/djwayne/buildos-platform/apps/web/.prompt-dumps/fastchat-2026-04-09T23-31-16-566Z.txt):

- the prior assistant turn correctly said:
    - `I couldn't complete that update because no write call succeeded. I need to retry with the exact ID and valid arguments.`
- the system did not falsely narrate the failed update as completed

That is a real trust improvement over the earlier task-update dumps.

### What still looks bad in the retry turn

The retry eventually succeeded, but it still wasted rounds:

- first retry write: empty `onto.plan.update`
- second retry write: same empty `onto.plan.update`
- third retry write: correct payload with
    - `plan_id: "debd6c62-8701-4f2a-972d-9036d1bc7c2f"`
    - `state_key: "completed"`

So the system now recovers honestly, but it is still too slow and too permissive when the model repeats the same invalid write shape.

### New concrete bug: placeholder IDs leaking into recent referents

Observed in [fastchat-2026-04-09T23-31-16-566Z.txt](/Users/djwayne/buildos-platform/apps/web/.prompt-dumps/fastchat-2026-04-09T23-31-16-566Z.txt):

- `<recent_referents>` includes:
    - `project: (unnamed) (<project_id_uuid>)`
    - `plan: (unnamed) (<plan_id_uuid>)`

This is a real bug.

Those are symbolic example placeholders, not entity IDs. They should never appear in the continuity artifact that is supposed to carry exact referents across turns.

Most likely source:

- `tool_schema` returns rewritten `tool_help` examples
- those examples include placeholder values like `<project_id_uuid>` and `<plan_id_uuid>`
- `buildLastTurnContext()` currently scans tool result payloads too broadly and accepts any non-empty string as an entity id candidate

Impact:

- the continuity layer can now inject fake referents into the next prompt
- that weakens the "recent_referents" mechanism
- it may compete with real IDs already present elsewhere in the prompt

### Current read on the architecture after this run

The latest run shows three distinct classes of behavior:

1. Read-from-context behavior is materially improved.
2. Search fallback and write-success gating are necessary and are helping.
3. The remaining failed write is now primarily a write-arg grounding problem, not a search problem.

In other words:

- the new entity lookup work is still correct
- but it will not, by itself, fix cases where the model already has the exact ID in prompt data and still emits `args: {}`

### Most likely next fix

The next highest-value cleanup is now:

- sanitize `lastTurnContext` entity extraction so only real UUIDs are accepted as carry-forward entity ids
- ignore schema/example placeholder ids when mining tool result payloads
- then tighten write-side guidance or repair behavior for "exact ID already in prompt data but missing from emitted args"

That is a narrower and better-targeted next step than expanding search behavior further.

### Completed after this assessment

That follow-on fix has now landed.

Files changed:

- [apps/web/src/lib/services/agentic-chat-v2/exact-entity-id.ts](/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat-v2/exact-entity-id.ts)
- [apps/web/src/routes/api/agent/v2/stream/+server.ts](/Users/djwayne/buildos-platform/apps/web/src/routes/api/agent/v2/stream/+server.ts)
- [apps/web/src/lib/services/agentic-chat-v2/entity-resolution.ts](/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat-v2/entity-resolution.ts)
- [apps/web/src/lib/services/agentic-chat-v2/master-prompt-builder.ts](/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat-v2/master-prompt-builder.ts)
- [apps/web/src/lib/services/agentic-chat/tools/registry/gateway-guidance.ts](/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat/tools/registry/gateway-guidance.ts)
- [apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator.ts](/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator.ts)
- [apps/web/src/lib/services/agentic-chat/tools/skills/definitions/plan_management/SKILL.md](/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat/tools/skills/definitions/plan_management/SKILL.md)

What landed:

- carry-forward entity ids are now sanitized through a shared exact-id helper
- only real UUIDs are accepted as ontology referents
- placeholder/example ids like `<project_id_uuid>` and `<plan_id_uuid>` are now rejected
- `lastTurnContext` no longer mines referents from `tool_schema`, `tool_help`, `tool_search`, or `skill_load` payloads
- `recent_referents` now filters invalid ids even if an older stored context still contains them
- prompt and repair guidance now explicitly tell the model to copy exact UUIDs from current structured context when the named entity is already visible there

What this should fix:

- fake placeholder ids leaking into `<recent_referents>`
- continuity pollution from schema/example payloads
- some empty update retries where the exact entity id is already visible in current prompt data

Current limitation:

- this does not guarantee the model will always ground writes correctly on the first try
- it removes a real continuity bug and strengthens the repair path, but it still needs fresh prompt-dump verification on a new mutation run

## Verification

Targeted tests were run and passed:

- `pnpm exec vitest run src/lib/services/agentic-chat-v2/master-prompt-builder.test.ts src/lib/services/agentic-chat/prompts/prompt-generation-service.test.ts`
- `pnpm exec vitest run src/lib/services/agentic-chat-v2/master-prompt-builder.test.ts src/lib/services/agentic-chat-v2/stream-orchestrator.test.ts src/lib/services/agentic-chat/prompts/prompt-generation-service.test.ts`
- `pnpm --dir apps/web exec vitest run src/lib/services/agentic-chat-v2/entity-resolution.test.ts src/lib/services/agentic-chat-v2/master-prompt-builder.test.ts src/lib/services/agentic-chat/prompts/prompt-generation-service.test.ts`
- `pnpm --dir apps/web exec vitest run src/lib/services/agentic-chat-v2/history-composer.test.ts`
- `pnpm --dir apps/web exec vitest run src/lib/services/agentic-chat-v2/stream-orchestrator.test.ts`
- `pnpm --dir apps/web exec vitest run src/lib/services/agentic-chat/execution/tool-execution-service.gateway.test.ts`
- `pnpm --dir apps/web exec vitest run src/lib/services/agentic-chat-v2/exact-entity-id.test.ts src/lib/services/agentic-chat-v2/entity-resolution.test.ts src/lib/services/agentic-chat-v2/master-prompt-builder.test.ts src/lib/services/agentic-chat/prompts/prompt-generation-service.test.ts src/lib/services/agentic-chat-v2/stream-orchestrator.test.ts`

Result:

- 5 targeted test runs passed
- 29 orchestrator tests passed in the newest write-success gating verification pass
- gateway fallback coverage now includes search-first missing-id resolution for `onto.plan.get` and `onto.project.get`
- continuity sanitation and write-grounding reinforcement tests now pass: 46 tests across the new helper, entity-resolution, prompt generation, and orchestrator suites

## Current Product / Architecture Read

### Context handling recommendation

Do not solve this with permanently sticky conversational project focus.

Recommended model:

- Page/default scope:
    - Global chat page starts in `global`
    - Project page starts in that `project`
- Turn-resolved scope:
    - Each new user turn resolves target scope from the latest message
    - If nothing overrides it, fall back to the page/default scope

Why this is better:

- In global chat, users can move across multiple projects naturally.
- In project chat, the project page still gives a strong default.
- "Switching back to global" becomes a normal turn-resolution behavior instead of a special state transition problem.

### `agent_state` recommendation

Current recommendation: keep `agent_state` out of the model prompt.

Reasoning:

- It is synthesized by another LLM after the turn.
- It competes with raw history and structured prompt context.
- It can become stale or over-assertive.
- It already caused contradictory guidance in the observed dump.

Safer path:

- Continue not injecting `agent_state` into the prompt.
- Keep storing it in session metadata temporarily if it is still useful for UI, analytics, or debugging.
- Reassess later whether any subset should be reintroduced as a strictly bounded server-authored artifact.

### Retry-loop recommendation

Current recommendation: make retries much stricter.

Suggested policy:

- Allow automatic continuation for normal tool/result loops.
- Allow at most one schema-repair pass for a new validation failure.
- If the failure is one of the following, stop fast:
    - missing required parameter
    - empty `args`
    - repeated same op fingerprint
    - repeated same required-field miss
- After that, do exactly one of:
    - ask one concise clarification question
    - perform one deterministic schema/read step if the next step is obvious

Why:

- The current loop is too permissive for simple mistakes.
- It inflates latency and token use.
- It makes trivial tasks look unreliable.

External guidance used for this recommendation:

- [OpenAI Agents SDK: Running Agents](https://openai.github.io/openai-agents-js/guides/running-agents/)
- [OpenAI Function Calling Guide](https://developers.openai.com/api/docs/guides/function-calling)
- [Anthropic Tool Use Guide](https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/implement-tool-use)

Key takeaways from those references:

- agent/tool loops should be bounded
- max-turn safety limits are normal
- stronger tool models should seek clarification when needed
- missing parameters should not lead to unlimited retry churn

## Recommended Next Task

The next fix to implement is:

1. Improve residual unresolved-entity recovery before touching retry policy.

Why this next:

- The prompt/runtime path now teaches entity resolution more clearly and preserves recent exact referents better.
- Failed writes are no longer allowed to be narrated as successful when no write actually succeeded.
- The remaining gap is still entity resolution when the referent is not already known or not preserved strongly enough.

Suggested implementation direction:

- Make the search fallback more explicit and more usable in practice.
- Prefer project-scoped ontology search when project scope is known.
- Continue simplifying toward the planned primary search surface (`search_buildos` / `search_project`) without broadening retry behavior yet.

## After That

Recommended sequence after unresolved-entity recovery:

1. Tighten the retry loop.
2. Design turn-resolved scope handling.
3. Keep moving toward the simpler search end-state (`search_buildos` / `search_project`).

## Handoff Summary

Another agent picking this up should know:

- The gateway prompt mismatch has already been fixed in code and tested.
- Project drill-in stickiness was intentionally not patched because the product model likely needs turn-resolved scope instead.
- `agent_state` has already been removed from the prompt path.
- The new project data shape (`projects[].goals[]`, `projects[].plans[]`, `projects[].milestones[]`) is live, improves readability, and materially shrank prompt size.
- The entity-resolution/search-fallback spec now exists and phase 1 of it has been implemented.
- The write-success gating fix is now implemented, so failed writes should no longer be narrated as completed when no mutation succeeded.
- The current primary remaining failure is unresolved entity lookup and any residual referent/ID misses.
- Retry behavior should still be redesigned, but it is no longer the only or clearly the first cleanup step.
