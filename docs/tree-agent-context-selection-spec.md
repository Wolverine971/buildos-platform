<!-- docs/tree-agent-context-selection-spec.md -->

# Tree Agent: Context Selection Implementation Spec

**Status**: Updated Draft
**Date**: 2026-01-27
**Objective**: Enable tree agent runs to support global vs per-project context selection UI, mirroring homework flow capabilities.

---

## Executive Summary

The tree agent currently supports context switching at the API level (global vs single project) but **lacks UI for users to select their context before/during a run**. The homework flow already implements this pattern. This spec outlines the architectural and UI changes needed to bring context selection to the tree agent page, and includes realtime event considerations for graph updates.

### Key Problem

- **Homework Page**: Users can select whether they're working in "global context" (all projects) or "project context" (specific project)
- **Tree Agent Page**: No UI to switch contexts; context is hardcoded or defaults to global
- **Gap**: Users can't explicitly choose their context, reducing the effectiveness of per-project focused work

---

## Current State Analysis

### Homework Context Selection (Reference Implementation)

| Component    | How It Works                                                                   |
| ------------ | ------------------------------------------------------------------------------ |
| **UI**       | Derives `workspaceProjectId` from workspace docs; displays project tree        |
| **API**      | Accepts `scope` ('global' \| 'project' \| 'multi_project') and `project_ids[]` |
| **Database** | Stores `scope` and `project_ids` as dedicated columns in `homework_runs`       |
| **Worker**   | Uses scope to filter entities and determine capabilities                       |

### Tree Agent Current Implementation

| Component    | Current Behavior                                                                                                                  |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| **UI**       | No context selection UI; just shows graph and events                                                                              |
| **API**      | Accepts `context_type` ('global' \| 'project') and optional `context_project_id`                                                  |
| **Database** | Stores context in `tree_agent_runs.metrics.context` (JSON). Each run has its own `workspace_project_id` for scratchpad/artifacts. |
| **Worker**   | Resolves context at startup; uses it to filter tools dynamically                                                                  |

### Key Difference

- **Homework**: Scope is an _operational constraint_ (what data can you access?)
- **Tree Agent**: Context is a _tool availability filter_ (which tools are available?)

---

## Proposed Solution

### Phase 1: UI Implementation (No Database Changes)

Add context selection UI to tree agent page using existing API capabilities. Store context in `metrics` (as it is now).

### Phase 2: Database Durability (Optional Future)

Migrate context to dedicated database columns (`scope`, `project_ids`) for consistency with homework and increased durability.

---

## Detailed Implementation Plan

### 1. UI/UX Changes

#### 1.1 Add Context Selection Modal

**File**: `/apps/web/src/lib/components/tree-agent/TreeAgentContextSelector.svelte` (NEW)

Create a modal that allows users to select context type and project:

```svelte
<script>
	import { ProjectService } from '$lib/services/projectService';

	const projectService = ProjectService.getInstance();

	let {
		currentContextType = 'global',
		currentProjectId = null,
		onContextChange,
		onClose,
		isOpen = false
	} = $props();

	let projects = $state([]);
	let selectedContextType = $state(currentContextType);
	let selectedProjectId = $state(currentProjectId);

	$effect(() => {
		if (isOpen) {
			loadProjects();
		}
	});

	async function loadProjects() {
		const response = await projectService.getUserProjects({
			limit: 100,
			status: 'active'
		});
		projects = response.success ? (response.data?.projects ?? []) : [];
	}

	function handleContextTypeChange(type) {
		selectedContextType = type;
		if (type === 'global') {
			selectedProjectId = null;
		}
	}

	function handleSubmit() {
		onContextChange({
			context_type: selectedContextType,
			context_project_id: selectedContextType === 'project' ? selectedProjectId : null
		});
	}

	function handleClose() {
		onClose?.();
	}
</script>

<!-- Modal template -->
{#if isOpen}
	<div class="modal">
		<h2>Chat Context</h2>

		<!-- Context Type Selection -->
		<div class="context-options">
			<button
				class:active={selectedContextType === 'global'}
				onclick={() => handleContextTypeChange('global')}
			>
				Global Context
				<span class="description">Chat about all projects</span>
			</button>

			<button
				class:active={selectedContextType === 'project'}
				onclick={() => handleContextTypeChange('project')}
			>
				Project Context
				<span class="description">Focus on a specific project</span>
			</button>
		</div>

		<!-- Project Selection (only shown for project context) -->
		{#if selectedContextType === 'project'}
			<div class="project-select">
				<label>Select Project</label>
				<select bind:value={selectedProjectId}>
					<option value="">-- Choose a project --</option>
					{#each projects as project}
						<option value={project.id}>{project.name}</option>
					{/each}
				</select>
			</div>
		{/if}

		<!-- Actions -->
		<div class="actions">
			<button onclick={() => (isOpen = false)}>Cancel</button>
			<button
				onclick={handleSubmit}
				disabled={selectedContextType === 'project' && !selectedProjectId}
			>
				Set Context
			</button>
		</div>
	</div>
{/if}
```

#### 1.2 Update Tree Agent Run Page

**File**: `/apps/web/src/routes/tree-agent/runs/[id]/+page.svelte`

Add context selector display and button:

```svelte
<script>
	import TreeAgentContextSelector from '$lib/components/tree-agent/TreeAgentContextSelector.svelte';

	let { data } = $props(); // include projectsMap from +page.server.ts for name lookup
	let contextSelectorOpen = $state(false);
	let currentContextType = $state('global');
	let currentProjectId = $state(null);

	$effect(() => {
		if (data.run?.metrics?.context) {
			currentContextType = data.run.metrics.context.type ?? 'global';
			currentProjectId = data.run.metrics.context.project_id ?? null;
		}
	});

	async function handleContextChange(newContext) {
		// Call API to start new run with different context
		const response = await fetch('/api/tree-agent/runs', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				objective: data.run.objective,
				context_type: newContext.context_type,
				context_project_id: newContext.context_project_id
			})
		});

		if (response.ok) {
			const newRun = await response.json();
			// Navigate to new run
			goto(`/tree-agent/runs/${newRun.id}`);
		}
	}
</script>

<!-- Header with Context Info -->
<div class="tree-agent-header">
	<div class="context-display">
		{#if currentContextType === 'global'}
			<span class="badge badge-global">Global Context</span>
		{:else if currentProjectId}
			<span class="badge badge-project">
				Project Context: {currentProject?.name}
			</span>
		{/if}

		<button onclick={() => (contextSelectorOpen = true)} class="btn-change-context">
			Change Context
		</button>
	</div>
</div>

<!-- Graph and Events -->
<TreeAgentGraph runId={data.run.id} />
<!-- Existing events panel already renders from events list -->

<!-- Context Selector Modal -->
	<TreeAgentContextSelector
		currentContextType
		currentProjectId
		onContextChange={handleContextChange}
		onClose={() => (contextSelectorOpen = false)}
		isOpen={contextSelectorOpen}
	/>
```

**Server data**: `/apps/web/src/routes/tree-agent/runs/[id]/+page.server.ts` should resolve the
current `context_project_id` (if any) into a lightweight `projectsMap` so the badge can show
the project name without extra client fetches.

#### 1.3 Context Display in Chat/Sidebar

**File**: `/apps/web/src/lib/components/tree-agent/TreeAgentChatHeader.svelte` (UPDATE)

Show current context in the chat area:

```svelte
<!-- In chat header -->
<div class="chat-context-info">
	{#if contextType === 'global'}
		<span class="context-badge">🌐 Global</span>
		<span class="context-description">Working with all projects</span>
	{:else if contextProjectId}
		<span class="context-badge">📁 {project?.name}</span>
		<span class="context-description">Focused on this project</span>
	{/if}
</div>
```

---

### 2. API Changes

#### 2.1 Extend Tree Agent Runs Endpoint

**File**: `/apps/web/src/routes/api/tree-agent/runs/+server.ts`

Ensure context is properly captured and validated:

**Request Payload**: `{ objective, context_type?, context_project_id?, budgets? }`  
The API creates `workspace_project_id` internally; the client does **not** send `workspace_id`.

```typescript
// POST /api/tree-agent/runs
export async function POST({ request, locals }) {
	const payload = await request.json();

	// Extract context parameters (already supported, but make explicit)
	const contextType = payload.context_type === 'project' ? 'project' : 'global';
	const contextProjectId = payload.context_project_id ?? null;

	// Validate project access if context is 'project'
	if (contextType === 'project' && contextProjectId) {
		const hasAccess = await validateProjectAccess(contextProjectId, locals.user.id);
		if (!hasAccess) {
			throw error(403, 'No access to this project');
		}
	}

	// Store context in metadata for worker
	const metadata = {
		run_id: run.id,
		root_node_id: rootNode.id,
		workspace_project_id: workspaceProject.id,
		context_type: contextType,
		context_project_id: contextProjectId,
		budgets
		// ... rest
	};

	// Store context in metrics for display
	await updateRunMetrics(run.id, {
		context: {
			type: contextType,
			project_id: contextProjectId,
			set_at: new Date().toISOString()
		}
	});

	return json(run);
}
```

#### 2.2 Optional: Lightweight Project List Endpoint

Prefer reusing `/api/projects` via `ProjectService.getUserProjects()` for the context selector.  
If the payload is too heavy, add a lightweight endpoint that returns `{ id, name }[]` for
projects the user can access.

---

### 3. Database Schema Changes (Phase 2)

**Note**: For Phase 1, use existing `metrics` storage. Phase 2 can add these columns.

#### 3.1 Tree Agent Runs Table

**File**: `supabase/migrations/YYYYMMDD_HHMMSS_tree_agent_context_fields.sql`

```sql
-- Add explicit context fields for consistency with homework_runs
ALTER TABLE public.tree_agent_runs
ADD COLUMN scope TEXT DEFAULT 'global' CHECK (scope IN ('global', 'project', 'multi_project')),
ADD COLUMN project_ids TEXT[] DEFAULT NULL;

-- Create index for filtering runs by scope/project
CREATE INDEX idx_tree_agent_runs_scope_project_ids
  ON public.tree_agent_runs(scope, project_ids);

-- Backfill existing runs based on metrics.context
UPDATE tree_agent_runs
SET
  scope = CASE
    WHEN metrics->>'context' IS NOT NULL AND
         metrics->'context'->>'type' = 'project'
    THEN 'project'
    ELSE 'global'
  END,
  project_ids = CASE
    WHEN metrics->>'context' IS NOT NULL AND
         metrics->'context'->>'type' = 'project' AND
         metrics->'context'->>'project_id' IS NOT NULL
    THEN ARRAY[metrics->'context'->>'project_id']
    ELSE NULL
  END
WHERE metrics IS NOT NULL;
```

---

### 4. Queue Types Update

#### 4.1 Extend TreeAgentJobMetadata

**File**: `/packages/shared-types/src/queue-types.ts`

```typescript
export interface TreeAgentJobMetadata {
	run_id: string;
	root_node_id: string;
	workspace_project_id: string;
	budgets: { max_wall_clock_ms: number };
	// Context fields (NEW - make explicit)
	context_type?: 'global' | 'project';
	context_project_id?: string | null;
	// Optional: support for multi_project in future
	scope?: 'global' | 'project' | 'multi_project';
	project_ids?: string[] | null;
}
```

---

### 5. Worker Changes

#### 5.1 Update TreeAgentWorker

**File**: `/apps/worker/src/workers/tree-agent/treeAgentWorker.ts`

Enhance context resolution to use metadata (and fall back to metrics):

```typescript
function resolveRunContext(
	run: TreeAgentRunRow,
	metadata: TreeAgentJobMetadata
): TreeAgentRunContext {
	// Priority: metadata > metrics (metadata is source of truth during execution)
	const contextType =
		metadata.context_type ?? (run.metrics?.context?.type === 'project' ? 'project' : 'global');

	const projectId =
		metadata.context_project_id ??
		(contextType === 'project' ? run.metrics?.context?.project_id : null);

	return {
		type: contextType,
		projectId: projectId,
		scope: metadata.scope ?? (contextType === 'project' ? 'project' : 'global'),
		projectIds: metadata.project_ids ?? (projectId ? [projectId] : null)
	};
}

// Tool availability filtering
function getAvailableTools(context: TreeAgentRunContext) {
	const toolNames = getDefaultToolNamesForContextType(context.type);

	// If project-scoped, further filter tools
	if (context.type === 'project' && context.projectId) {
		return toolNames.filter((name) => isToolAvailableForProject(name, context.projectId));
	}

	return toolNames;
}
```

#### 5.2 Log Context Changes

**File**: `/apps/worker/src/workers/tree-agent/treeAgentWorker.ts`

Add logging when context is applied:

```typescript
logger.info('Tree Agent Context Applied', {
	run_id: run.id,
	context_type: context.type,
	context_project_id: context.projectId,
	scope: context.scope,
	available_tools: availableTools.length,
	timestamp: new Date().toISOString()
});
```

---

### 6. Component Improvements

#### 6.1 Context Indicator in TreeAgentGraph

**File**: `/apps/web/src/lib/components/tree-agent/TreeAgentGraph.svelte`

Add visual indicator of current context:

```svelte
<!-- At top of graph -->
<div class="graph-context-banner">
	{#if run.metrics?.context?.type === 'project'}
		<div class="context-indicator project-context">
			<span class="icon">📁</span>
			<span class="label">Project-Scoped Context</span>
			{#if run.metrics?.context?.project_id}
				<span class="project-name">{getProjectName(run.metrics.context.project_id)}</span>
			{/if}
		</div>
	{:else}
		<div class="context-indicator global-context">
			<span class="icon">🌐</span>
			<span class="label">Global Context</span>
		</div>
	{/if}
</div>
```

#### 6.2 Context in Tree Agent Chat Modal

**File**: `/apps/web/src/lib/components/agent/AgentChatModal.svelte`

Show context information in chat:

```svelte
<!-- In message history or header -->
<div class="message-context-info">
	{#if chatContext?.type === 'project'}
		Working in project context: <strong>{chatContext.projectName}</strong>
	{:else}
		Working in global context across all projects
	{/if}
</div>
```

#### 6.3 Realtime Tool Call Indicators (Graph)

**Files**:

- `/packages/shared-types/src/tree-agent.types.ts`
- `/apps/web/src/lib/stores/treeAgentGraph.store.ts`
- `/apps/web/src/lib/components/tree-agent/TreeAgentGraph.svelte`

The worker emits tool call events during execution:

- `tree.tool_call_requested` with `{ toolName, args?, purpose?, phase?, startedAt? }`
- `tree.tool_call_result` with `{ toolName, ok, summary?, error?, phase?, completedAt? }`

The graph store should track the latest tool call per node (e.g., `lastTool`) and the graph
should render a third label line to reflect activity, such as:

```
Objective Title
EXECUTING
TOOL: list_onto_projects [RUNNING]
```

This keeps the UI aligned with realtime tool activity without needing a new UI panel.

---

## Implementation Roadmap

### Phase 1: UI Layer (No DB Changes) - Recommended First Step

**Timeline**: 1-2 days
**Scope**: Implement context selection UI using existing API
**Benefits**: Users get context selection immediately; no migration risk
**Files**:

- [ ] Create `TreeAgentContextSelector.svelte` component
- [ ] Update tree agent run page with context display
- [ ] Reuse `/api/projects` for project list (or add lightweight endpoint if needed)
- [ ] Update chat components to show context
- [ ] Surface tool call events in graph nodes (tree.tool*call*\*)
- [ ] Add styling/design tokens for context indicators

**Testing**:

- [ ] Verify context selection modal appears
- [ ] Verify project filtering works
- [ ] Verify new runs are created with correct context
- [ ] Verify context persists in run metadata
- [ ] Verify tool call events render in graph labels
- [ ] Test both global and project context modes

### Phase 2: Database Durability (Optional) - Future

**Timeline**: 1-2 days (after Phase 1 validates usage)
**Scope**: Migrate context to dedicated columns for consistency with homework
**Benefits**: Durability, consistency with homework, better querying
**Files**:

- [ ] Create migration adding `scope` and `project_ids` columns
- [ ] Update `TreeAgentJobMetadata` type to include new fields
- [ ] Update worker context resolution to prefer metadata
- [ ] Add backfill script for existing runs
- [ ] Update API to populate new fields

**Testing**:

- [ ] Verify migration succeeds on test database
- [ ] Verify backfill populates existing runs correctly
- [ ] Verify queries use new indexes efficiently
- [ ] Verify backward compatibility during rollout

### Phase 3: Advanced Features (Future)

- [ ] Multi-project context support (like homework)
- [ ] Context-specific tool configurations
- [ ] Context history/switching within a single chat session
- [ ] Favorite/recent contexts quick-select

---

## User Stories

### Story 1: User Starts Chat in Project Context

```
Given a user opens the tree agent page
When they click "New Chat"
Then they should see a context selector modal
And they can choose "Project Context" and select a specific project
And the chat/run starts in that project's context
```

### Story 2: User Switches Project Context Mid-Session

```
Given a user is in a tree agent run with global context
When they click "Change Context"
Then they should see the context selector modal
And they can change to project context for a specific project
And a new run is created with the new context
```

### Story 3: Context Affects Tool Availability

```
Given a tree agent run in project context for Project A
When the agent analyzes available tools
Then only tools available to Project A are shown
And the agent cannot access tools from other projects
```

### Story 4: User Views Context Status

```
Given a user views a tree agent run
When they look at the run details
Then they should see a badge/indicator showing "Global Context" or "Project Context: [ProjectName]"
```

---

## Design Considerations

### 1. Context Persistence vs Flexibility

**Decision**: Context is per-run, not global session state.

**Rationale**:

- Users may want to switch contexts between runs
- Allows comparing results across different contexts
- Mirrors homework flow pattern

**Implementation**: Each run creation specifies its context; changing context = new run.

### 2. Default Context

**Decision**: Default to "global" context.

**Rationale**:

- Consistent with homework
- Broadest access for exploration
- Users must opt-in to project-scoped context

**Implementation**: API defaults to `context_type: 'global'` if not specified.

### 3. Context vs Scope Terminology

**Decision**: Use "context" for UI/discussion, map to "scope" in database.

**Rationale**:

- "Context" is more intuitive for users ("I'm working in project context")
- "Scope" is more technical ("global scope", "project scope", "multi_project scope")
- Matches homework terminology pattern

**Implementation**: API and UI use "context_type"; database uses "scope".

### 4. Tool Filtering

**Decision**: Context determines tool availability, not access restrictions.

**Rationale**:

- Tree agent is a planning tool, not a data accessor
- Prevents unintended data exposure through tool availability
- Reflects user's intended focus

**Implementation**: `getDefaultToolNamesForContextType(context_type)` filters at tool registration.

### 5. Gradual Migration Path

**Decision**: Phase 1 uses existing `metrics` storage; Phase 2 adds dedicated columns.

**Rationale**:

- Validates pattern before database schema change
- Reduces risk of data corruption
- Allows A/B testing if needed
- Easier rollback if needed

**Implementation**: Worker code accepts context from both metadata and metrics.

---

## Success Criteria

- [ ] Users can select context (global vs project) before starting tree agent run
- [ ] Context selection UI is discoverable and easy to use
- [ ] Context is displayed prominently in run details
- [ ] Tool availability adapts based on selected context
- [ ] Graph surfaces tool call activity in near real time
- [ ] No regression in existing tree agent functionality
- [ ] Parity with homework context selection UX
- [ ] All tests pass (unit, integration, e2e)
- [ ] No performance impact on runs or queries

---

## Migration & Rollout Strategy

### Pre-Launch Validation

1. **Code Review**: PR review of UI, API, and worker changes
2. **Testing**:
    - Unit tests for context selector component
    - Integration tests for API context handling
    - E2E tests for user workflows
3. **QA**: Manual testing of all context switching scenarios
4. **Performance**: Profile database queries, no regression

### Deployment Order

1. Deploy UI changes (backward compatible)
2. Deploy API endpoint changes (backward compatible)
3. Deploy worker enhancements (reads old format, supports new)
4. Monitor metrics and user feedback

### Rollback Plan

- UI changes: Simple revert to previous build
- API: Continues to work with old context format
- Worker: Gracefully falls back to metrics-based context resolution

---

## Open Questions & Risks

### Questions

1. **Multi-project support**: Does tree agent need to support multiple projects in scope like homework does?
    - Current assumption: No, keep it simpler with single project focus

2. **Context in chat history**: Should chat history be scoped by context, or should context be changeable within a session?
    - Current assumption: Each run has fixed context; switching context = new run

3. **Tool filtering breadth**: How aggressively should we filter tools? Full isolation or permissive?
    - Current assumption: Use `getDefaultToolNamesForContextType()` as implemented

### Risks

1. **Database Performance**: Large `project_ids[]` arrays could slow queries
    - Mitigation: Add indexes, cap array size, use dedicated columns in Phase 2

2. **Context Mismatch**: User selects project context but data comes from global
    - Mitigation: Strict validation at API level, tool filtering at worker level

3. **User Confusion**: Users don't understand when to use which context
    - Mitigation: Clear UI labels, help text, documentation

4. **Tool Registry Changes**: Adding context-aware tool filtering could break existing logic
    - Mitigation: Implement as additive filter, test thoroughly, gradual rollout

---

## Documentation Updates Required

After implementation:

1. **User Documentation**: How to select context in tree agent
2. **Developer Documentation**: Context handling in tree agent architecture
3. **API Documentation**: Update tree agent runs endpoint schema
4. **Component Documentation**: Document TreeAgentContextSelector component
5. **Database Documentation**: Document scope and project_ids fields

---

## Appendix: Reference Implementation (Homework)

See `/apps/web/src/routes/homework/runs/[id]/+page.svelte` for reference on:

- Context selector UI patterns
- Workspace tree rendering
- Project/task entity display
- Modal interaction patterns

Key differences tree agent should maintain:

- Tree agent uses graph visualization (not tree)
- Tree agent filters tools (not entities)
- Tree agent has per-run context (not session-level)

---

## Sign-Off

- **Spec Written**: 2026-01-27
- **Status**: Ready for Phase 1 implementation approval
- **Next Step**: Get stakeholder approval to proceed with Phase 1 (UI Layer)
