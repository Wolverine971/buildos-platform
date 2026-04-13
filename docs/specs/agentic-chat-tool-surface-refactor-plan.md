<!-- docs/specs/agentic-chat-tool-surface-refactor-plan.md -->

# Agentic Chat Tool Surface Refactor Plan

Date: 2026-04-10
Status: Phase 1 implemented and verified
Owner: BuildOS Agentic Chat

Related:

- [Agentic Chat Skill + Tool Architecture V2](/Users/djwayne/buildos-platform/docs/specs/agentic-chat-skill-tool-architecture-v2.md)
- [Agentic Tool Schemas, BuildOS Audit, and OpenClaw Pattern Reevaluation](/Users/djwayne/buildos-platform/docs/technical/2026-04-10_agentic-tool-schemas-and-openclaw-pattern-reevaluation.md)

## 0. Implementation update: 2026-04-10

Phase 1 has been implemented. Gateway mode now uses the OpenClaw-style hybrid surface:

- preloaded direct tools selected by chat context,
- `skill_load` for on-demand playbooks,
- `tool_search` for long-tail tool discovery,
- `tool_schema` for exact op/schema inspection,
- no model-facing `execute_op` in the gateway tool surface.

The important implementation files are:

- [gateway-surface.ts](/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat/tools/core/gateway-surface.ts)
- [tool-selector.ts](/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat-v2/tool-selector.ts)
- [master-prompt-builder.ts](/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat-v2/master-prompt-builder.ts)
- [stream-orchestrator/index.ts](/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/index.ts)
- [tool-validation.ts](/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/tool-validation.ts)
- [repair-instructions.ts](/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/repair-instructions.ts)
- [agent-chat-orchestrator.ts](/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat/orchestration/agent-chat-orchestrator.ts)

The first implementation deliberately keeps internal legacy compatibility shims for `tool_exec`, `tool_help`, `buildos_call`, and `execute_op` so old persisted traces/tests and non-gateway paths do not break abruptly. Those shims are not part of the new model-facing gateway contract.

Focused verification:

```bash
npm run test -- src/lib/services/agentic-chat-v2/tool-selector.test.ts src/lib/services/agentic-chat-v2/master-prompt-builder.test.ts src/lib/services/agentic-chat/prompts/prompt-generation-service.test.ts src/lib/services/agentic-chat-v2/stream-orchestrator.test.ts
```

Result: 4 files passed, 52 tests passed.

Broader agentic-chat verification:

```bash
npm run test -- src/lib/services/agentic-chat-v2 src/lib/services/agentic-chat/tools/registry src/lib/services/agentic-chat/tools/skills src/lib/services/agentic-chat/execution/tool-execution-service.gateway.test.ts src/lib/services/agentic-chat/prompts/prompt-generation-service.test.ts
```

Result: 20 files passed, 161 tests passed.

Focused lint verification:

```bash
node scripts/run-eslint.cjs src/lib/services/agentic-chat-v2/tool-selector.ts src/lib/services/agentic-chat-v2/master-prompt-builder.ts src/lib/services/agentic-chat-v2/stream-orchestrator/index.ts src/lib/services/agentic-chat-v2/stream-orchestrator/repair-instructions.ts src/lib/services/agentic-chat-v2/stream-orchestrator/round-analysis.ts src/lib/services/agentic-chat-v2/stream-orchestrator/tool-validation.ts src/lib/services/agentic-chat/tools/core/gateway-surface.ts src/lib/services/agentic-chat/tools/core/definitions/gateway.ts src/lib/services/agentic-chat/tools/registry/tool-search.ts src/lib/services/agentic-chat/tools/registry/tool-schema.ts src/lib/services/agentic-chat/analysis/tool-selection-service.ts src/lib/services/agentic-chat/execution/tool-execution-service.ts src/lib/services/agentic-chat/orchestration/agent-chat-orchestrator.ts
```

Result: passed.

Full workspace type/Svelte check:

```bash
npm run check
```

Result: failed on the existing workspace backlog. Two tool-surface diagnostics were found and fixed during this stability pass. A filtered rerun against the touched tool-surface paths produced no diagnostics. Remaining failures are outside this workstream, including admin UI components, onboarding/profile/project routes, overdue task utilities, voice recording, and public project graph routes.

## 1. Why this plan exists

The current BuildOS gateway solved one problem and created another.

It solved:

- too many raw tools in the prompt,
- no clean skill-loading path,
- weak discovery for the long tail.

It created:

- a generic execution bottleneck,
- heavy prompt protocol,
- repair loops that mostly work by scolding the model in natural language,
- loss of context-specific preloaded tool surfaces.

The goal of this refactor is not to remove discovery or skills. The goal is to keep those benefits while restoring a real model-facing tool surface.

## 2. Pre-implementation state summary

This section describes the state before Phase 1 landed. It is retained to explain why the change was necessary.

### 2.1 What already existed

BuildOS still has context-aware tool bundles in [tools.config.ts](/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat/tools/core/tools.config.ts):

- `global`
- `project`
- `project_create`
- `project_audit`
- `project_forecast`
- aliases like `ontology`, `calendar`, `daily_brief`

Those bundles were still used when gateway mode was off.

### 2.2 What gateway mode did before Phase 1

When the gateway flag was enabled, [tool-selector.ts](/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat-v2/tool-selector.ts) returned only:

- `skill_load`
- `tool_search`
- `tool_schema`
- `execute_op`

So gateway mode effectively bypassed the context-aware direct tool bundles.

### 2.3 Why repair loops were brittle

The pre-Phase-1 repair path was mostly prompt-driven:

- validation errors append system guidance,
- repeated failures append more repair guidance,
- the model is told to call `tool_schema` again or retry `execute_op`,
- special cases exist for `onto.project.create`, repeated root help, and missing required fields.

Relevant files:

- [agent-chat-orchestrator.ts](/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat/orchestration/agent-chat-orchestrator.ts)
- [stream-orchestrator/index.ts](/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/index.ts)

That made recovery too dependent on the model following prose instructions correctly.

## 3. Design decisions

### 3.1 Use a hybrid tool surface

BuildOS should stop choosing between:

- "all direct tools"
- "only four meta-tools"

The correct shape is hybrid:

- direct hot-path tools for the current context,
- `skill_load` for workflow playbooks,
- `tool_search` for long-tail discovery,
- `tool_schema` for schema inspection and debugging,
- no model-facing `execute_op` in normal gateway mode.

### 3.2 Restore context-specific preloading

Context types should matter again at the provider-facing tool layer.

At minimum:

- `global` gets workspace-wide and cross-project tools,
- `project` gets project-scoped read/write tools,
- `project entity focus` gets entity-specific tools plus neighboring project tools,
- `project_create` gets project creation tools and the creation skill.

This should be driven by the current session scope, not just static global defaults.

### 3.3 Keep skills as playbooks

The current `skill_load` direction is good and should remain.

Skills should continue to answer:

- how to approach this workflow,
- what mistakes to avoid,
- which related ops are common.

Skills should not continue carrying the burden of compensating for a missing real execution surface.

### 3.4 Treat discovery and execution as separate layers

`tool_search` and `tool_schema` should help the model find or inspect tools.

They should not force every final action through one generic call wrapper.

### 3.5 Move repair logic out of prompt prose and into runtime policy

The runtime should deterministically classify failures and decide whether to:

- auto-fill missing data from structured context,
- materialize the exact tool needed for the next round,
- ask one concise question,
- or stop retries.

This is a control problem, not primarily a prompt-writing problem.

## 4. Target architecture

## 4.1 Initial tool surface per turn

Each turn should start with:

1. Base utilities
    - `skill_load`
    - `tool_search`
    - `tool_schema`
2. A context bundle of direct tools

The direct tool bundle should be small and high-confidence.

Target size:

- global: roughly 8-15 direct tools
- project: roughly 10-18 direct tools
- project entity focus: roughly 8-12 direct tools

The exact numbers should be adjusted with telemetry.

## 4.2 Context bundles

### Global bundle

Initial candidates:

- workspace overview
- project overview
- project search/list
- ontology search
- task search/list
- document search/list
- calendar list/get/create/update
- web search / web visit if needed

### Project bundle

Initial candidates:

- project overview
- project details / graph
- task list/get/search/create/update
- goal list/get/create/update
- plan list/get/create/update
- document list/get/create/update/move
- milestone/risk list/get
- project calendar get/set

### Project entity focus bundle

Initial candidates:

- exact entity get/update
- siblings/linked entities reads
- entity-specific create-child actions
- document tree/path reads when relevant
- project overview as a fallback anchor

### Project create bundle

Initial candidates:

- project create
- supporting ontology create ops needed during initial skeleton creation
- project creation skill

## 4.3 Direct tools should be generated from canonical ops

Canonical ops should remain the source of truth.

But instead of only exposing:

- `execute_op({ op, input })`

BuildOS should also generate provider-facing direct tool definitions such as:

- `onto_task_update`
- `util_project_overview`
- `cal_event_create`

These direct tools should map back to the same canonical op registry and runtime executors.

That gives BuildOS:

- one canonical backend model,
- multiple provider-facing surfaces,
- less prompt protocol burden.

## 4.4 Deferred tool materialization

When the current bundle does not include the needed tool:

1. the model can call `tool_search`,
2. the runtime selects the exact canonical op,
3. the runtime materializes the direct tool definition for the next round,
4. the model calls that direct tool.

`tool_schema` can still be used to inspect the exact input shape before the call.

This preserves the progressive-disclosure benefit without collapsing execution into generic RPC.

## 4.5 `execute_op` is not model-facing in gateway mode

`execute_op` remains temporarily as an internal/legacy compatibility path for:

- compatibility during migration,
- persisted traces and tests that still exercise old tool calls,
- old non-gateway paths that have not been migrated yet,
- internal eval comparison while this refactor is stabilized.

It should not be exposed in the provider-facing gateway tool list. Normal reads and writes should end in direct tools.

## 5. Repair and self-healing redesign

## 5.1 Current problem

Current repair loops are too conversational. The runtime notices a bad tool call, then tells the model things like:

- do not call `tool_help("root")` again,
- do not use tools willy-nilly,
- include a required field next time,
- call `tool_schema` and retry.

This works sometimes, but it is fragile.

## 5.2 Replace prose-first repair with typed recovery classes

Failures should be normalized into recovery classes such as:

- `tool_not_loaded`
- `missing_required_field`
- `missing_exact_id`
- `invalid_enum_or_type`
- `stale_context_reference`
- `no_progress_read_loop`
- `no_progress_write_loop`
- `policy_blocked`

Each class should have deterministic recovery rules.

## 5.3 Deterministic recovery rules

Examples:

- `tool_not_loaded`
    - materialize a context-appropriate direct tool or long-tail direct tool
    - replan once
- `missing_exact_id`
    - if exact ID exists in structured context, inject it
    - otherwise load a read tool or ask one concise question
- `missing_required_field`
    - if the field is recoverable from the user message or structured context, inject it
    - otherwise ask one concise question
- `no_progress_read_loop`
    - stop repeating reads and either answer or ask
- `no_progress_write_loop`
    - stop retrying writes until exact missing data is resolved

The key change is that the runtime should decide the next state first, then prompt the model minimally if needed.

## 5.4 Schema-aware repair

When a direct tool is available, repair should operate against that tool's schema, not against a generic `input` bag.

That makes:

- required field detection simpler,
- error messages clearer,
- retries less ambiguous.

## 6. OpenClaw-style control plane for admin repair

This is separate from normal user-facing tool calling.

OpenClaw's `gateway` tool is not a generic execution tool. It is an owner-only control-plane surface for:

- `config.schema.lookup`
- `config.get`
- `config.patch`
- `config.apply`
- `update.run`

If BuildOS wants better self-repair for agent configuration, prompts, or runtime switches, it should copy that pattern as a separate admin/control-plane tool set.

Recommended BuildOS equivalent:

- `runtime_config_schema_lookup`
- `runtime_config_get`
- `runtime_config_patch`
- `runtime_reload`
- `runtime_repair_run`

Principles:

- owner-only or admin-only
- strict optimistic concurrency
- patch-by-schema, not freeform text mutation
- isolated from normal project/task/document tools

This should not be mixed into the normal user-facing tool surface.

## 7. Implementation phases

## Phase 0: Freeze terminology

Before any major code change:

- choose one canonical gateway vocabulary,
- stop mixing `tool_help` / `tool_exec` with `tool_schema` / direct tools,
- update docs to match runtime.

Outcome:

- one stable mental model.

Status:

- Partially complete. Model-facing prompt and skill docs now use `skill_load`, `tool_search`, `tool_schema`, and direct tools.
- Internal legacy helper and test paths still reference `tool_help`, `tool_exec`, and `execute_op` for compatibility.

## Phase 1: Re-enable context-aware tool surfacing in gateway mode

Change the gateway path so it returns:

- `skill_load`
- `tool_search`
- `tool_schema`
- a direct context bundle

Do not expose only the four meta-tools anymore.

Outcome:

- immediate restoration of context-sensitive preloading.

Status:

- Complete. Implemented in [gateway-surface.ts](/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat/tools/core/gateway-surface.ts), [tool-selector.ts](/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat-v2/tool-selector.ts), and [tool-selection-service.ts](/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat/analysis/tool-selection-service.ts).
- Gateway mode now returns discovery tools plus curated direct bundles for `global`, `project`, `project_create`, `project_audit`, `project_forecast`, `calendar`, and aliases.
- `execute_op` is not included in [gateway.ts](/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat/tools/core/definitions/gateway.ts).

## Phase 2: Generate direct tools from canonical ops

Build a generator that turns canonical registry ops into provider-facing direct tool definitions.

Requirements:

- canonical op remains the source of truth,
- descriptions and parameter docs are generated from the same source,
- provider adapters can post-process schemas.

Outcome:

- BuildOS stops hand-maintaining separate execution and registry surfaces.

## Phase 3: Deferred tool materialization

After `tool_search`, let the runtime load the exact direct tool for subsequent rounds.

Outcome:

- long-tail coverage without giant initial tool lists.

Status:

- Complete for the stream orchestrator and legacy orchestrator first pass.
- `tool_search` and `tool_schema` results can materialize direct tool definitions for the rest of the turn.
- Unknown direct tool calls in gateway mode attempt deterministic materialization before returning unavailable-tool guidance.

## Phase 4: Rewrite repair loops as typed runtime policies

Replace natural-language repair-first behavior with structured failure handling.

Outcome:

- fewer repeated bad retries,
- fewer root/help/schema loops,
- more predictable recovery.

Status:

- Partially complete. Direct tools now resolve back to canonical ops in validation and round analysis, so repeated required-field failures and mutation-stop checks work for direct tools instead of only wrapper calls.
- Remaining repair logic is still prose-heavy and should be converted into explicit recovery classes in the next phase.

## Phase 5: Optional admin control-plane gateway

If BuildOS wants agent/runtime self-repair:

- implement a separate owner-only config/runtime mutation surface,
- keep it out of normal project execution.

Outcome:

- better repair for system configuration without polluting user task tools.

## 8. Immediate next implementation steps

These are the next concrete steps I would take in the repo.

1. Add observability to measure:
    - which direct tools are used by context,
    - when `tool_search` is invoked,
    - when long-tail tools are materialized,
    - which repair classes fire most often.
2. Replace remaining prose repair branches with typed recovery classes.
3. Update or retire legacy `tool_help` / `tool_exec` / `execute_op` compatibility paths once persisted/eval coverage no longer depends on them.
4. Decide whether the old [tool-help.ts](/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat/tools/registry/tool-help.ts) payloads should be rewritten directly or continue to be adapted through [tool-schema.ts](/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat/tools/registry/tool-schema.ts).
5. Design the separate admin/control-plane gateway if runtime config repair is still desired.

## 9. Bottom line

The path forward is not "delete the gateway."

The path forward is:

- restore context-aware direct tools,
- keep skills and discovery,
- remove model-facing `execute_op` from normal gateway mode,
- make repair logic runtime-native,
- keep any admin self-repair in a separate control plane.

That gets BuildOS much closer to the strong parts of OpenClaw without losing the parts of the current BuildOS gateway that were directionally right.
