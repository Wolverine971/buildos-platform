<!-- apps/web/docs/features/agentic-chat/DATA_REFRESH_ON_CLOSE_SPEC.md -->

# Data Refresh on Agentic Chat Modal Close (Simplified)

## Goal

When agent chat mutates project data, refresh the relevant data when the chat modal closes. This is primarily for `/projects/[id]` pages where stale tasks/goals/docs are most visible. Avoid full page reloads.

## Approach

- Track successful mutation tools during a chat session.
- Track affected project IDs when available (best effort).
- On modal close:
    - Build a small mutation summary.
    - If we are in a project context and have a project ID, invalidate that project's data.
    - Pass the summary to `onClose` so consumers can optionally do additional invalidation.

This keeps the logic centralized in `AgentChatModal` and avoids wiring every consumer.

## Data Model

```ts
// apps/web/src/lib/components/agent/agent-chat.types.ts
export interface DataMutationSummary {
	hasChanges: boolean;
	totalMutations: number;
	affectedProjectIds: string[];
}
```

## Mutation Tracking

### What counts as a mutation

Use the existing `DATA_MUTATION_TOOLS` list plus a few structural tools:

- `create_task_document`
- `link_onto_entities`
- `unlink_onto_edge`

### How project IDs are derived

Priority order:

1. Tool args: `args.project_id`
2. Tool result payload: `result.data.*.project_id` or `result.data.project_id`
3. Project context fallback: `selectedEntityId` if `selectedContextType` is a project context

Special case:

- `create_onto_project` returning `clarifications` should **not** count as a mutation (no data created).

## Implementation Details

### 1) Track mutations in `AgentChatModal`

```ts
let mutationCount = 0;
const mutatedProjectIds = new Set<string>();

function recordDataMutation(toolName, argsJson, success, toolResult) {
	if (!toolName || !success) return;
	if (!MUTATION_TRACKED_TOOLS.has(toolName)) return;
	if (toolName === 'create_onto_project' && toolResult?.data?.clarifications?.length) return;

	const args = safeParseArgs(argsJson);
	const projectId = resolveProjectId(args, toolResult);
	mutationCount += 1;
	if (projectId) mutatedProjectIds.add(projectId);
}
```

### 2) Record in `tool_result` handler

```ts
case 'tool_result': {
  // ... existing logic ...
  recordDataMutation(resolvedToolName, resolvedArgs, success, toolResult);
  break;
}
```

### 3) Close behavior

```ts
function handleClose() {
	// ... existing cleanup ...
	const summary = buildMutationSummary();

	if (summary.hasChanges && isProjectContext(selectedContextType) && selectedEntityId) {
		void createProjectInvalidation(selectedEntityId).all();
	}

	resetMutationTracking();
	onClose?.(summary);
}
```

### 4) Reset on conversation reset

```ts
function resetConversation(...) {
  // ... existing resets ...
  resetMutationTracking();
}
```

## Optional Consumer Usage

Consumers can still use the summary if they want extra invalidation.

```ts
function handleChatClose(summary?: DataMutationSummary) {
	showChatModal = false;
	if (summary?.hasChanges) invalidateAll();
}
```

## Testing

- Start chat in project context, create/update/delete a task, then close modal -> project data refreshes.
- Close without any mutation -> no invalidation.
- `create_onto_project` that returns clarifications -> no mutation recorded.
