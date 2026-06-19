<!-- apps/web/docs/technical/audits/AGENTIC_CHAT_TOOL_DISCOVERY_VISIBILITY_TASKER_2026-06-19.md -->

# Agentic Chat Tool Discovery Visibility Tasker

Status: ready for follow-up agent
Created: 2026-06-19
Owner: BuildOS agentic chat
Source: `AGENTIC_CHAT_SEARCH_EVAL_2026-06-19.md` Step 4 defer

## TL;DR

Do not delete the legacy `search_onto_goals`, `search_onto_plans`,
`search_onto_milestones`, or `search_onto_risks` definitions from the shared tool registry.
They are zero-use in chat telemetry, but they are still public BuildOS Agent API read ops.

The follow-up task is to separate **chat discovery visibility** from the **external Agent API
registry** so chat can hide or deprecate these legacy entity-search tools without breaking
external callers.

Recommended implementation: add an explicit surface/audience flag to the registry/search path.
Chat `tool_search` should filter hidden-from-chat tools; external `tool_search`, `tool_schema`,
direct tool listing, and direct execution should still expose all allowed public ops.

## Required Reading

Read these before editing:

1. `apps/web/docs/technical/audits/AGENTIC_CHAT_SEARCH_EVAL_2026-06-19.md`
   - See F3 and Section 3.1.
   - This is where Step 4 was deferred because the registry is shared.
2. `apps/web/docs/technical/audits/AGENTIC_CHAT_SEARCH_AUDIT_2026-06-17.md`
   - Original audit context and Family B cleanup motivation.
3. `apps/web/docs/technical/audits/AGENTIC_CHAT_SEARCH_SMOKE_TEST_2026-06-19.md`
   - Test matrix that produced the chat-side evidence.
4. `packages/shared-types/src/agent-call.types.ts`
   - `BUILDOS_AGENT_READ_OPS` intentionally includes:
     - `onto.goal.search`
     - `onto.plan.search`
     - `onto.milestone.search`
     - `onto.risk.search`
5. `apps/web/src/lib/services/agentic-chat/tools/registry/tool-registry.ts`
   - Builds registry ops from `CHAT_TOOL_DEFINITIONS` plus `TOOL_METADATA`.
6. `apps/web/src/lib/services/agentic-chat/tools/registry/tool-search.ts`
   - `searchToolRegistry()` currently searches the full registry with no chat/external surface
     distinction.
7. `apps/web/src/lib/server/agent-call/external-tool-gateway.ts`
   - External gateway also calls `searchToolRegistry()` and then scopes results to allowed ops.
8. `packages/shared-agent-ops/src/gateway/op-execution-gateway.ts`
   - `buildExternalGatewayRegistry()` resolves allowed public ops from injected registry ops,
     falling back to `EXTERNAL_CUSTOM_OPS`.

## Current State

### What the chat search eval proved

- The agent used the smart search family for 8/8 live search tasks:
  - `search_all_projects`
  - `search_project`
- It used zero legacy Family B entity search tools in the evaluated run.
- Production chat telemetry showed zero total calls for:
  - `search_onto_goals`
  - `search_onto_plans`
  - `search_onto_milestones`
  - `search_onto_risks`

This is enough evidence to make those four tools **chat-deprecation candidates**.
It is not enough evidence to remove them from the shared registry because the telemetry is chat-only.

### Why Step 4 was deferred

An agent attempted to remove the four tool definitions and correctly reverted the change.
The failure mode is real:

- `CHAT_TOOL_DEFINITIONS` is not chat-only in practice.
- `getToolRegistry()` builds the op registry from `CHAT_TOOL_DEFINITIONS`.
- The external BuildOS Agent API gateway uses that same registry to expose allowed public ops.
- `BUILDOS_AGENT_READ_OPS` includes the four public search ops.
- Removing the tool definitions drops those external public ops from schemas/listing/discovery.
- Removing the tools only from chat context lists, such as `TOOL_GROUPS`, does not hide them from
  chat `tool_search`, because `searchToolRegistry()` searches `Object.values(registry.ops)`.

The external gateway test currently guards this. `external-tool-gateway.test.ts` has coverage that:

- Every op in `BUILDOS_AGENT_READ_OPS` has a schema.
- Read-only external callers see read tools such as `search_onto_plans`.
- Scoped external `tool_search` returns allowed ontology tools.

Current focused verification before this tasker was written:

```bash
cd apps/web
npm run test -- src/lib/server/agent-call/external-tool-gateway.test.ts
```

Result: 37/37 passing.

## Goal

Separate tool visibility by surface:

- **Chat discovery surface:** can hide legacy tools from chat `tool_search` results.
- **Chat direct/preload surface:** should not preload these four legacy tools for normal v2 chat.
- **External Agent API surface:** must keep existing public ops stable for callers whose scopes allow
  them.

After this task, the four zero-use legacy tools should be hidden from chat discovery without changing
the external Agent API contract.

## Non-Goals

Do not do these in this task:

- Do not remove any entries from `BUILDOS_AGENT_READ_OPS`.
- Do not delete the four tool definitions from `CHAT_TOOL_DEFINITIONS` unless you also implement a
  deliberate external-only replacement and update tests accordingly.
- Do not change external op names, schemas, handlers, or scope policy.
- Do not change the smart search SQL/RPC/index behavior.
- Do not tune FTS/trigram scoring.
- Do not delete executor support for the four tools.

## Recommended Design

Use a surface-aware registry/search flag. Keep the shared registry complete; filter at discovery time.

### 1. Add metadata for chat discovery visibility

Extend `ToolMetadata` in:

```text
apps/web/src/lib/services/agentic-chat/tools/core/definitions/types.ts
```

Recommended shape:

```ts
export interface ToolMetadata {
  summary: string;
  capabilities: string[];
  contexts: ToolContextScope[];
  category: 'search' | 'read' | 'write' | 'utility';
  timeoutMs?: number;
  chatDiscovery?: 'visible' | 'hidden';
}
```

Default should be visible when unset.

Then mark these four tools as hidden in:

```text
apps/web/src/lib/services/agentic-chat/tools/core/definitions/tool-metadata.ts
```

```ts
search_onto_goals: {
  ...
  chatDiscovery: 'hidden'
}
```

Repeat for plans, milestones, and risks.

Naming is flexible. `surfaceVisibility`, `discoverability`, or `chatDiscoverable: false` are also
acceptable if they fit existing code better. Prefer a name that makes the external API separation
obvious.

### 2. Carry the flag into the registry

Extend `RegistryOp` in:

```text
apps/web/src/lib/services/agentic-chat/tools/registry/tool-registry.ts
```

Candidate field:

```ts
chat_discoverable?: boolean;
```

When building each `registryOp`, set:

```ts
chat_discoverable: toolMeta?.chatDiscovery !== 'hidden'
```

Default true. Do not let this field affect op derivation, `byToolName`, schemas, external execution,
or registry version semantics unless tests show the version must account for changed discovery
metadata.

### 3. Make `searchToolRegistry()` surface-aware

Change `ToolSearchOptions` in:

```text
apps/web/src/lib/services/agentic-chat/tools/registry/tool-search.ts
```

Candidate field:

```ts
surface?: 'chat' | 'external' | 'all';
```

Recommended behavior:

- `surface: 'chat'`: filter out entries where `chat_discoverable === false`.
- `surface: 'external'`: do not apply the chat-discovery filter.
- `surface: 'all'`: do not apply the chat-discovery filter.

Pick a safe default deliberately. The recommended default is `surface: 'chat'`, but only after all
known call sites are updated. If you choose `surface: 'all'` for backward compatibility, add a test
that the chat execution path explicitly passes `surface: 'chat'`.

Known call sites:

```text
apps/web/src/lib/services/agentic-chat/execution/tool-execution-service.ts
apps/web/src/lib/server/agent-call/external-tool-gateway.ts
```

The chat call should pass:

```ts
surface: 'chat'
```

The external gateway call should pass:

```ts
surface: 'external'
```

This is the core fix. It lets the same registry serve both surfaces with different discovery
visibility.

### 4. Check chat preload/default surfaces

The current v2 gateway profiles in:

```text
apps/web/src/lib/services/agentic-chat/tools/core/gateway-surface.ts
```

do not preload the four legacy tools in the main profiles. Verify that remains true.

Older/default tool selection paths in:

```text
apps/web/src/lib/services/agentic-chat/tools/core/tools.config.ts
```

still list the four tools in `TOOL_CATEGORIES` and `TOOL_GROUPS`. Decide carefully before changing
those lists:

- If those lists are still used in a legacy non-v2 provider surface, remove the four tools from chat
  default contexts and add tests proving they are not preloaded.
- If those lists are only used for docs/reporting/legacy compatibility, avoid unrelated churn and
  document that this task only changes chat `tool_search` discovery.

Do not rely on `TOOL_GROUPS` as the main fix. It does not affect `searchToolRegistry()`.

## Alternate Design: External Custom Ops

There is an escape hatch in:

```text
packages/shared-agent-ops/src/gateway/op-execution-gateway.ts
```

`EXTERNAL_CUSTOM_OPS` lets the external gateway expose public ops that are not present in the
internal registry. `buildExternalGatewayRegistry()` uses:

```ts
const entry = registryOps[op] ?? EXTERNAL_CUSTOM_OPS[op];
```

This means another possible solution is:

1. Add external-only `RegistryOp` entries for:
   - `onto.goal.search`
   - `onto.plan.search`
   - `onto.milestone.search`
   - `onto.risk.search`
2. Then delete the chat tool definitions.
3. Prove external listing/search/schema/direct execution still works.

Do not choose this as the first implementation unless the product decision is to remove the tools
from the internal chat registry entirely. It duplicates public schemas and is more brittle than a
chat-discovery visibility flag.

## Suggested Implementation Steps

1. Add the metadata flag and registry field.
2. Mark only the four zero-use legacy tools as hidden from chat discovery.
3. Add a `surface` or equivalent option to `searchToolRegistry()`.
4. Pass `surface: 'chat'` from chat execution.
5. Pass `surface: 'external'` from the external Agent API gateway.
6. Add focused tests for chat discovery filtering.
7. Extend external gateway tests so this exact regression cannot return.
8. Run focused tests and `npm run check`.
9. Update `AGENTIC_CHAT_SEARCH_EVAL_2026-06-19.md` Step 4 status if the task ships.

## Required Tests

Add or update tests around these cases.

### Chat discovery

Create a focused test for `searchToolRegistry()` if one does not exist.

Cases:

- `searchToolRegistry({ surface: 'chat', query: 'goal search', group: 'onto', kind: 'read' })`
  does not return `onto.goal.search` / `search_onto_goals`.
- Same for plan, milestone, and risk.
- Smart search remains discoverable:
  - `x.search.all_projects` / `search_all_projects`
  - `x.search.project` / `search_project`
- Non-hidden read tools remain discoverable where expected, for example list/detail tools.

### External gateway

Keep and/or extend:

```text
apps/web/src/lib/server/agent-call/external-tool-gateway.test.ts
```

Cases:

- `getBuildosAgentGatewayTools({ mode: 'read_only', allowed_ops: BUILDOS_AGENT_READ_OPS })`
  still includes:
  - `search_onto_goals`
  - `search_onto_plans`
  - `search_onto_milestones`
  - `search_onto_risks`
- `tool_schema` returns schemas for all four ops.
- External `tool_search` with `surface: 'external'` behavior still returns the allowed public ops
  when queried directly:
  - query `goal search`, group `onto`, kind `read`
  - query `plan search`, group `onto`, kind `read`
  - query `milestone search`, group `onto`, kind `read`
  - query `risk search`, group `onto`, kind `read`
- Read-only callers still do not see write tools.

### Chat preload/default surface

Check existing tests:

```text
apps/web/src/lib/services/agentic-chat-v2/tool-selector.test.ts
apps/web/src/lib/services/agentic-chat-v2/tool-surface-size-report.test.ts
```

If your changes alter provider surfaces, update tests intentionally. Do not just bump budgets unless
the surface change is understood.

## Verification Commands

Run these from `apps/web` unless noted:

```bash
npm run test -- src/lib/server/agent-call/external-tool-gateway.test.ts
npm run test -- src/lib/services/agentic-chat-v2/tool-selector.test.ts src/lib/services/agentic-chat-v2/tool-surface-size-report.test.ts
npm run test -- src/lib/services/agentic-chat/tools/registry/tool-search.test.ts
npm run check
```

If you do not create `tool-search.test.ts`, replace that command with the actual focused test file.

If changes touch `packages/shared-agent-ops`, also run from repo root:

```bash
pnpm --filter @buildos/shared-agent-ops build
pnpm --filter @buildos/shared-agent-ops typecheck
```

## Acceptance Criteria

The task is done when all of these are true:

- Chat `tool_search` no longer returns the four hidden legacy search tools.
- Chat can still discover and use `search_all_projects` and `search_project`.
- External Agent API still exposes the four public read ops to read scopes.
- External `tool_schema` works for every op in `BUILDOS_AGENT_READ_OPS`.
- External `tool_search` still returns the four public read ops when queried by an external caller
  whose scope allows them.
- No changes are made to `BUILDOS_AGENT_READ_OPS`.
- No public op names or schemas are changed.
- Focused tests and `npm run check` pass.
- The search eval doc is updated from "deferred" to the actual shipped behavior, or left deferred if
  the implementation is not completed.

## Landmines

- `CHAT_TOOL_DEFINITIONS` is not chat-only in practice. Treat it as the source of the internal
  registry that external gateway currently consumes.
- `TOOL_GROUPS` and `gateway-surface.ts` are not the same thing as `tool_search`.
- Hiding from chat discovery is not the same as deleting definitions.
- External API usage is not measured by chat telemetry. Zero chat calls does not mean zero external
  callers.
- The worker/shared package must remain free of web-only imports. If you edit
  `packages/shared-agent-ops`, do not import `$lib`, `$env`, `CHAT_TOOL_DEFINITIONS`, or web registry
  modules into package src.
- The repo may have a dirty working tree. Do not revert unrelated changes from other agents.

## Closing Report Template

When handing back, report:

- Chosen design: metadata filter or external custom ops.
- Exact hidden tools.
- Whether chat direct/preload surfaces changed.
- External API compatibility evidence.
- Test commands run and results.
- Any remaining follow-up, especially if old non-v2 chat paths still preload the legacy tools.
