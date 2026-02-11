<!-- apps/web/src/lib/services/agentic-chat/tools/progressive-tool-disclosure-spec.md -->

# Progressive Tool Disclosure Gateway Spec

Status: Draft
Owner: BuildOS Agentic Chat
Date: 2026-02-11

## 1. Objective

Reduce the tool surface given to the LLM while preserving full capability coverage. Replace the current "send dozens of tools" approach with a gateway that supports CLI-like discovery and execution.

## 2. Goals

- Expose 2-3 gateway tools to the LLM: `tool_help`, `tool_exec`, optional `tool_batch`.
- Allow on-demand discovery of tools and schemas (progressive disclosure).
- Preserve current validation, defaults, safety rules, and execution behavior.
- Preserve UI operation events and analytics.
- Support ontology read/write, utility, and calendar tools from the existing definitions.

## 2.1 Feature Flag

This is experimental and must be gated behind an environment variable so the legacy tool flow remains available.

- Env var: `AGENTIC_CHAT_TOOL_GATEWAY`
- When enabled:
    - LLM only sees gateway tools
    - Tool discovery guidance is injected into prompts
- When disabled:
    - Legacy tool selection and direct tool usage remain unchanged

## 3. Non-Goals

- No rework of existing ontology/calendar executors.
- No API contract changes for underlying tools.
- No new UI surface for tools.

## 4. Current System Touchpoints

- Tool definitions: `apps/web/src/lib/services/agentic-chat/tools/core/definitions/*.ts`
- Tool selection: `apps/web/src/lib/services/agentic-chat/tools/core/tools.config.ts`
- Tool execution: `apps/web/src/lib/services/agentic-chat/execution/tool-execution-service.ts`
- Tool dispatch: `apps/web/src/lib/services/agentic-chat/tools/core/tool-executor-refactored.ts`
- Planner prompts: `apps/web/src/lib/services/agentic-chat/planning/plan-orchestrator.ts`
- Streaming loop and UI op events: `apps/web/src/lib/services/agentic-chat/orchestration/agent-chat-orchestrator.ts`
- Tool usage copy: `apps/web/src/lib/services/agentic-chat/prompts/config/context-prompts.ts`

## 5. Gateway Tools

### 5.1 `tool_help`

Purpose: Discover available commands and schemas.

Input:

```json
{
	"path": "string",
	"format": "short|full",
	"include_examples": true,
	"include_schemas": false
}
```

Behavior:

- `""` or `"root"` returns top-level groups.
- `onto`, `util`, `cal` return group summaries.
- `onto.task` returns entity-level operations.
- `onto.task.update` returns op-level detail.

### 5.2 `tool_exec`

Purpose: Execute a discovered command.

Input:

```json
{
	"op": "string",
	"args": "object",
	"idempotency_key": "optional string",
	"dry_run": false
}
```

Success envelope:

```json
{
	"op": "onto.task.list",
	"ok": true,
	"result": {},
	"meta": { "trace_id": "tr_...", "latency_ms": 123, "warnings": [] }
}
```

Error envelope:

```json
{
	"op": "onto.task.update",
	"ok": false,
	"error": {
		"code": "VALIDATION_ERROR|PERMISSION_DENIED|NOT_FOUND|CONFLICT|INTERNAL",
		"message": "Human readable",
		"details": { "field_errors": [] },
		"help_path": "onto.task.update"
	}
}
```

### 5.3 `tool_batch` (optional)

Purpose: Combine multiple help/exec calls in a single round trip.

Input:

```json
{
	"ops": [
		{ "type": "help", "path": "onto.task.update", "format": "short" },
		{ "type": "exec", "op": "onto.task.list", "args": { "project_id": "..." } }
	],
	"mode": "sequential|parallel"
}
```

## 6. CLI Namespace

### 6.1 Ontology Read

- `onto.task.list`, `onto.task.search`, `onto.task.get`
- `onto.project.list`, `onto.project.search`, `onto.project.get`
- `onto.document.list`, `onto.document.search`, `onto.document.get`
- `onto.goal.list`, `onto.goal.get`
- `onto.plan.list`, `onto.plan.get`
- `onto.milestone.list`, `onto.milestone.get`
- `onto.risk.list`, `onto.risk.get`
- `onto.requirement.list`, `onto.requirement.get`
- `onto.search`
- `onto.project.graph.get`
- `onto.document.tree.get`
- `onto.document.path.get`
- `onto.entity.relationships.get`
- `onto.entity.links.get`
- `onto.task.docs.list`

### 6.2 Ontology Write

- `onto.task.create`, `onto.task.update`, `onto.task.delete`
- `onto.project.create`, `onto.project.update`
- `onto.goal.create`, `onto.goal.update`, `onto.goal.delete`
- `onto.plan.create`, `onto.plan.update`, `onto.plan.delete`
- `onto.document.create`, `onto.document.update`, `onto.document.delete`
- `onto.task.docs.create_or_attach`
- `onto.edge.link`, `onto.edge.unlink`
- `onto.project.graph.reorganize`
- `onto.document.tree.move`

### 6.3 Utility

- `util.schema.field_info`
- `util.web.search`
- `util.web.visit`
- `util.buildos.overview`
- `util.buildos.usage_guide`

### 6.4 Calendar

- `cal.event.list`, `cal.event.get`
- `cal.event.create`, `cal.event.update`, `cal.event.delete`
- `cal.project.get`, `cal.project.set`

## 7. Registry

### 7.1 Input Sources

- `ONTOLOGY_READ_TOOLS`
- `ONTOLOGY_WRITE_TOOLS`
- `UTILITY_TOOL_DEFINITIONS`
- `CALENDAR_TOOL_DEFINITIONS`
- `TOOL_METADATA`

### 7.2 Registry Record Shape

```ts
type RegistryOp = {
	op: string;
	tool_name: string;
	description: string;
	parameters_schema: JSONSchema;
	group: 'onto' | 'util' | 'cal' | 'x';
	kind: 'read' | 'write';
	entity?: string;
	action?: string;
	contexts?: ToolContextScope[];
	examples?: Example[];
	policy?: Policy;
};
```

### 7.3 Versioning

- `registry_version = hash(definitions + metadata + op-map)`
- Used as the cache key for help responses.

## 8. Help Output

### 8.1 Standard Fields

- `summary`
- `usage`
- `args` (name, type, required, default)
- `notes`
- `examples`

### 8.2 Policy Extraction

For tools with behavioral rules, include a compact policy object:

```json
{
	"do": ["..."],
	"dont": ["..."],
	"edge_cases": ["..."]
}
```

## 9. Execution Semantics

### 9.1 `tool_exec` Flow

- Resolve `op` to `tool_name` via registry.
- Validate args using existing schemas.
- Apply schema defaults and context defaults (project_id, document payload normalization).
- Dispatch to the existing tool executor.
- Wrap response in the gateway envelope.

### 9.2 Error Handling

- Always return `help_path` in error envelopes.
- Validation errors should be surfaced with actionable details.

## 10. Progressive Disclosure Rules

- The LLM only sees gateway tools.
- Call `tool_help` only when args are uncertain or when a validation error occurs.
- Prefer list/search before write operations.
- Cache help results by `registry_version + path + format + include_schemas + include_examples`.

## 10.1 Prompting (Fast Chat / V2)

When the gateway is enabled, the system prompt must teach the agent how to discover tools and schemas.

Required query pattern:

1. `tool_help("root")` to discover top-level groups.
2. `tool_help("onto.task")` (or relevant group) to list ops.
3. `tool_help("onto.task.update")` to read args and required fields.
4. `tool_exec({ op, args })` using the exact schema from help.

Retry pattern:

- If `tool_exec` returns `help_path`, call `tool_help(help_path)` and retry with corrected args.
- Never guess IDs or required fields; use list/search/get ops via `tool_exec` to retrieve them.
- Treat `tool_help` args list as the source of truth for required parameters and types.

## 11. Integration Plan

### 11.1 Phase 1: Registry + Gateway Definitions

- Add gateway tool definitions.
- Build registry module (op mapping, metadata, help index).
- Add policy metadata for `create_onto_task` and `create_onto_project`.

### 11.2 Phase 2: Gateway Execution

- Implement `tool_help` and `tool_exec` in `ToolExecutionService`.
- Add optional `tool_batch` support.
- Preserve default validation + context defaults.

### 11.3 Phase 3: Planner + Orchestrator Updates

- Update planner prompts to describe gateway tools, not raw tool names.
- Update operation event mapping to parse `tool_exec` ops.
- Update validation repair guidance to reference `help_path`.

### 11.4 Phase 4: Tool Selection Switch

- Gate on feature flag `AGENTIC_CHAT_TOOL_GATEWAY`.
- When enabled, expose only gateway tools to the LLM.
- Disable LLM-based tool selection when in gateway mode.

## 12. Rollout

- Feature flag on a small cohort in dev.
- Gradual expansion after validation.

## 13. Acceptance Criteria

- LLM tool list size <= 3.
- All existing ontology, utility, and calendar tools are reachable via `tool_exec`.
- Validation errors always include `help_path`.
- Operation events still emit correct entity/action.
- Tool calls remain logged for analytics.

## 14. Open Questions

- Keep op naming as `onto.*` or use a different namespace?
- Should `tool_batch` allow parallel execution?
- Should calendar ops be under `cal.*` or `util.calendar.*`?
