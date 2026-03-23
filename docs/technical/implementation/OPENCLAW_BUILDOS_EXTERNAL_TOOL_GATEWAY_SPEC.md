<!-- docs/technical/implementation/OPENCLAW_BUILDOS_EXTERNAL_TOOL_GATEWAY_SPEC.md -->

# OpenCLAW + BuildOS External Tool Gateway Spec

## Purpose

This document defines how external agents like OpenCLAW should discover and execute BuildOS tools.

The goal is not to dump the full internal BuildOS tool catalog into OpenCLAW context.

The goal is to expose BuildOS the same way the internal `AGENTIC_CHAT_TOOL_GATEWAY` is designed:

- progressive disclosure
- CLI-like discovery
- exact-op schema lookup only when needed
- execution through a narrow, typed gateway

This spec is the bridge between the current external call gateway and the existing internal agentic tool gateway.

## Executive Decision

The existing internal gateway pattern is the right abstraction for OpenCLAW.

OpenCLAW should not receive:

- every BuildOS tool definition up front
- the full internal ontology write surface
- a separate ad hoc external tool catalog long term

OpenCLAW should receive:

- a small call/session protocol
- a tiny external tool surface
- progressive discovery through `tool_help`
- execution through `tool_exec`
- only the exact read/write operations allowed for that caller and scope

## Repo Findings

### What Already Exists

The internal BuildOS gateway already supports the behavior we want:

- gateway enablement flag in `apps/web/src/lib/services/agentic-chat/tools/registry/gateway-config.ts`
- progressive entrypoints in `apps/web/src/lib/services/agentic-chat/tools/core/definitions/gateway.ts`
- help-path discovery in `apps/web/src/lib/services/agentic-chat/tools/registry/tool-help.ts`
- canonical op registry in `apps/web/src/lib/services/agentic-chat/tools/registry/tool-registry.ts`
- discovery guidance in `apps/web/src/lib/services/agentic-chat/tools/registry/gateway-guidance.ts`
- gateway execution in `apps/web/src/lib/services/agentic-chat/execution/tool-execution-service.ts`

The current external bridge does not use that pattern yet:

- external scope is read-only only in `packages/shared-types/src/agent-call.types.ts`
- non-read-only calls are rejected in `apps/web/src/lib/server/agent-call/agent-call-service.ts`
- external tool listing is a flat public list in `apps/web/src/lib/server/agent-call/public-tool-registry.ts`
- external tool execution is a separate flat executor in `apps/web/src/lib/server/agent-call/public-tool-executor.ts`

### Conclusion

The current external bridge is good enough for proving inbound agent calls, but it is not the right long-term abstraction for OpenCLAW.

If we want thoughtful read + write access, the next step should be:

- keep the external call/session model
- replace the flat external public tool list with a filtered gateway model
- reuse the internal gateway semantics externally

## Product Behavior We Want

From OpenCLAW's perspective, BuildOS should feel like a CLI with discoverable commands.

That means:

1. OpenCLAW starts with a very small surface area.
2. OpenCLAW asks BuildOS what namespace to inspect.
3. BuildOS returns only the next layer of help.
4. OpenCLAW asks for the exact op schema only when needed.
5. OpenCLAW executes the exact op with exact args.
6. For writes, OpenCLAW should inspect the schema before mutating.

This keeps token usage low and teaches the external agent how to query BuildOS in the same way the internal planner is meant to work.

## Recommended External API Shape

### Keep the Existing Call Layer

Keep:

- `call.dial`
- `tools/list`
- `tools/call`
- `call.hangup`

This part is already working and OpenCLAW has already proven it can use it.

### Change What `tools/list` Returns

Instead of returning every exposed business tool, `tools/list` should return only the gateway tools:

- `tool_help`
- `tool_exec`
- optionally `tool_batch` later

This keeps the external protocol small while still allowing a large capability surface behind it.

### Change What `tools/call` Executes

`tools/call` should accept:

- `name: "tool_help"`
- `name: "tool_exec"`
- optionally `name: "tool_batch"`

The outer call/session protocol stays stable.

The inner tool protocol becomes the same progressive gateway model used internally.

## Why This Is Better Than the Current Flat List

### Context Efficiency

The current flat list is manageable for six read tools, but it scales poorly once writes are added.

If we expose:

- task reads
- task writes
- document reads
- document writes
- goal/plan tools
- calendar tools
- utility tools

then the flat catalog becomes a context tax on every OpenCLAW session.

The gateway avoids that by letting OpenCLAW ask for only:

- `root`
- `onto.task`
- `onto.task.update`

instead of carrying the whole toolbook in-context.

### Better Fit for LLM Behavior

The internal gateway guidance already encodes the behavior we want:

- choose a namespace
- inspect the exact op
- discover IDs before writes
- do not guess schemas
- retry using returned help paths

That is much closer to how OpenCLAW actually behaves than a giant static catalog.

### Better Fit for Writes

Writes are where progressive disclosure matters most.

A thoughtful write flow looks like:

1. `tool_help("onto.task")`
2. `tool_help("onto.task.update", format: "full", include_schemas: true)`
3. `tool_exec({ op: "onto.task.update", args: { ... } })`

That is much safer than telling the model every write schema up front and hoping it remembers them.

## Recommended External Permission Model

### Caller Policy Must Become More Expressive

Today caller policy is effectively:

- `allowed_project_ids`

That is not enough for safe writes.

We should extend caller or agent policy to support:

- `allowed_project_ids`
- `allowed_ops`
- `allow_write_ops`
- optional capability presets

Example:

```json
{
	"allowed_project_ids": ["project-uuid-1"],
	"allow_write_ops": true,
	"allowed_ops": [
		"onto.project.list",
		"onto.task.list",
		"onto.task.get",
		"onto.task.search",
		"onto.task.create",
		"onto.task.update",
		"onto.document.list",
		"onto.document.get",
		"onto.document.create",
		"onto.document.update"
	]
}
```

### Scope Must Expand Beyond `read_only`

The current scope type only supports:

- `mode: "read_only"`

We should extend this to at least:

- `mode: "read_only"`
- `mode: "read_write"`

And granted scope should still narrow by:

- caller policy
- user BuildOS agent policy
- visible projects
- requested project scope

### Do Not Use `read_write` To Mean "Everything"

`read_write` should not mean unrestricted internal mutations.

It should mean:

- writes are permitted in principle
- only for allowed ops
- only for allowed projects
- only through the external filtered gateway

## Recommended External Tool Registry Model

### Build a Filtered External Registry

The external gateway should derive from the internal registry, not duplicate it by hand.

Conceptually:

1. start from `getToolRegistry()`
2. remove ops not allowed for external callers
3. remove ops not allowed for this caller
4. remove ops not allowed for this granted scope
5. return help and execution only for the filtered set

This keeps canonical op names aligned with the internal system.

### External Registry Should Be Smaller Than Internal Registry

The internal registry includes operations that are too sharp for external callers.

Do not expose externally in the first write slice:

- `onto.edge.link`
- `onto.edge.unlink`
- `onto.project.graph.reorganize`
- delete ops
- project calendar mutation
- contact write ops
- generic project creation

Start with a disciplined subset.

## Recommended V1 External Read/Write Surface

### Read Ops

Recommended initial read allowlist:

- `onto.project.list`
- `onto.project.get`
- `onto.task.list`
- `onto.task.get`
- `onto.task.search`
- `onto.document.list`
- `onto.document.get`
- `onto.document.tree.get`
- `onto.goal.list`
- `onto.plan.list`
- `onto.search`

### Write Ops

Recommended initial write allowlist:

- `onto.task.create`
- `onto.task.update`
- `onto.document.create`
- `onto.document.update`
- `onto.task.docs.create_or_attach`

This is enough for useful collaboration without exposing destructive or graph-restructuring operations.

### Explicitly Exclude For Now

Do not expose yet:

- `*.delete`
- `onto.edge.*`
- `onto.project.graph.reorganize`
- `onto.project.create`
- `cal.*`
- `util.contact.*`
- `util.web.*`

Some of those are powerful, expensive, externally dependent, or too easy to misuse from a remote agent context.

## Recommended Execution Architecture

### Keep the Existing Call Service

The current external call gateway should remain responsible for:

- bearer auth
- caller identity
- callee resolution
- session lifecycle
- granted scope

### Add an External Gateway Layer Behind It

Introduce a dedicated external gateway service that:

1. builds the filtered registry for this call session
2. resolves `tool_help` against that filtered registry
3. resolves `tool_exec` against that filtered registry
4. rejects disallowed ops before any internal execution happens
5. records audit information for writes

### Do Not Reuse `getToolHelp()` Unfiltered

The existing `getToolHelp()` assumes the full internal registry.

Externally we need a filtered equivalent so OpenCLAW cannot discover ops it is not allowed to run.

That likely means either:

- parameterizing the help builder with a supplied registry
- or creating an external `tool_help` wrapper that uses the same formatting logic with a filtered registry input

### Do Not Execute Internal Ops Without a Policy Gate

The internal tool executor already checks user access, but that is not enough.

The external bridge must additionally check:

- this caller is allowed to know about this op
- this caller is allowed to run this op
- this op is allowed in the granted scope
- this project is inside the granted project set

The external gateway must enforce that before delegating to internal tool execution.

## Service Context Recommendation

The internal gateway can probably be reused for execution, but not raw.

The correct external execution shape is:

- synthetic `ServiceContext`
- user-bound executor
- call-session-aware policy filter
- external audit wrapper

A good session mapping is:

- `sessionId = call_id`
- `userId = caller.user_id`
- `contextType = "global"` unless a narrower project/entity context is intentionally supplied

But policy enforcement must happen before any tool execution, not through context defaults alone.

## OpenCLAW Instruction Model

The OpenCLAW bootstrap prompt should change to teach the gateway workflow, not a flat tool list.

### Recommended OpenCLAW Instruction Style

OpenCLAW should be told:

1. you only have `tool_help` and `tool_exec`
2. use `tool_help("root")` first when the namespace is unclear
3. narrow to the smallest relevant path
4. inspect exact write ops before execution
5. discover IDs before writes
6. never guess required fields

### Example Bootstrap Guidance

```text
When using BuildOS, do not assume the available operations up front.

Start with tool discovery:
- call tool_help with a narrow path
- if unsure, start with path "root"
- then narrow to a namespace like "onto.task" or "onto.document"

For writes:
- inspect the exact op first using tool_help(path=<exact op>, format="full", include_schemas=true)
- do not guess IDs
- if IDs are unknown, use list/search ops first

Then execute with tool_exec using the canonical op name and exact args.
```

That is a much better fit for OpenCLAW than copying a long static tool catalog into prompt context.

## UI / Provisioning Recommendation

The Agent Keys UI should eventually provision capability presets, not just projects.

Recommended presets:

- `Read only`
- `Tasks only`
- `Tasks + docs`
- `Advanced internal collaborator`

Those presets should map to:

- scope mode
- allowed ops
- allowed project IDs

That gives non-technical users a better mental model than editing raw op allowlists.

## Migration Recommendation

### Phase 1

Keep the current call/session protocol.

Replace the flat external public tool list with:

- `tool_help`
- `tool_exec`

Expose read-only ops only.

### Phase 2

Add filtered external registry support and filtered help output.

### Phase 3

Add `read_write` scope plus caller policy for `allowed_ops`.

Expose narrow write ops:

- task create/update
- document create/update

### Phase 4

Add write audit events and optional dry-run-first guidance for sensitive write flows.

## Readiness Assessment

### Are We Ready To Build This?

Yes, for the next slice.

We are not ready to safely expose unrestricted internal writes.

We are ready to implement:

- external filtered `tool_help`
- external filtered `tool_exec`
- read-only gateway exposure
- narrow write allowlists after that

### What Should Change First

The first code change should not be "add more public tools."

The first code change should be:

- introduce an external filtered gateway registry
- make `tools/list` return the gateway primitives
- route external tool help/execution through the filtered registry

That is the clean foundation for both read and write permissions.

## Final Recommendation

The right abstraction is:

- phone call for identity and trust
- gateway CLI for capability discovery
- filtered op allowlist for permissioning
- narrow writes through canonical ops

So the answer is:

- yes, the existing `AGENTIC_CHAT_TOOL_GATEWAY` is the right model
- no, we should not keep growing the current flat external public tool list
- yes, OpenCLAW should learn BuildOS progressively through `tool_help` and `tool_exec`
- yes, writes should be added, but only through a filtered external registry and explicit op allowlists
