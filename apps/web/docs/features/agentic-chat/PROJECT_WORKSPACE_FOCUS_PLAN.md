# Project Workspace Focus System - Implementation Plan

**Last Updated**: 2025-11-15
**Status**: Ready for Implementation
**Related**: Agentic Chat System, Ontology Integration

---

## Executive Summary

Enable users to **focus their conversation on specific ontology entities** (tasks, goals, plans, documents, outputs, milestones) **within a project workspace** without losing project context. This creates a "zoom in/zoom out" UX where users can discuss the whole project or drill down into specific elements.

### Key User Story

> "I'm in my project workspace discussing my book project. I want to quickly focus on a specific task ('Write Chapter 3') to get AI help with it, then zoom back out to discuss the whole project, then zoom into a goal ('Complete first draft by Dec 1') - all in the same conversation."

### What This Enables

- **Contextual focus switching** - Select tasks/goals/plans while maintaining project awareness
- **Rich combined context** - Agent sees both project overview AND focused element details
- **Visual clarity** - User always knows what scope they're discussing
- **Conversation continuity** - Focus changes don't restart the conversation
- **Quick access** - Browse and select entities without leaving chat

---

## Current State Analysis

### What Already Works ✅

1. **Comprehensive ontology loading** - `OntologyContextLoader` supports:
    - Project context with relationships, metadata, entity counts
    - Element context (task/goal/plan/document/output) with parent project included
    - Combined loading via `loadElementContext()` returns both element + parent project

2. **Context tracking** - `LastTurnContext` tracks entities across conversation turns:

    ```typescript
    {
      entities: {
        project_id: 'proj_123',
        task_ids: ['task_456'],
        goal_ids: ['goal_789']
      }
    }
    ```

3. **Dynamic context shifting** - Tools can trigger context shifts mid-conversation with SSE events

4. **Multi-tier context selection** - Sophisticated 4-tier selection flow for initial context setup

5. **Agent services ready** - `AgentContextService` can build context with ontology data, `AgentChatOrchestrator` handles metadata threading

### What's Missing ❌

1. **No UI for in-conversation focus selection** - Once in "Project workspace" mode, no way to select a child entity
2. **No visual focus indicator** - User doesn't see "Currently discussing: Task XYZ"
3. **No focus persistence** - Chat sessions don't remember which element was in focus
4. **No focus-specific tool filtering** - All project tools available regardless of focus
5. **No combined context loading in API** - `/api/agent/stream` loads project OR element, not both

---

## Solution Design

### Approach: "Focus Layer" Pattern

Add a lightweight **focus layer** on top of the existing project workspace mode. Think of it like:

```
Project Workspace (container)
  └─ Focus Layer (optional zoom-in)
      ├─ Project-wide (default, no zoom)
      ├─ Task Focus (zoom into specific task)
      ├─ Goal Focus (zoom into specific goal)
      ├─ Plan Focus (zoom into specific plan)
      └─ Document/Output/Milestone Focus
```

### User Experience Flow

```
1. User selects "Project workspace" → chats about project
2. User clicks "Focus" button → sees entity selector
3. User picks "Task: Write Chapter 3" → focus activates
4. AI sees project context + task details, tools filtered to task operations
5. User clicks "Focus: Task" pill → can change to different task or remove focus
6. User clicks "× Clear focus" → back to project-wide view
```

### Visual Design

**Before Focus (Project-wide)**

```
┌────────────────────────────────────────────┐
│ 📘 My Book Project • Project workspace     │
│ [Change] [Focus ▼]                         │
├────────────────────────────────────────────┤
│ Chat messages...                           │
```

**After Focus (Task selected)**

```
┌────────────────────────────────────────────┐
│ 📘 My Book Project • Project workspace     │
│ [Change]                                   │
│ ┌──────────────────────────────────────┐   │
│ │ 🎯 Focused on: Write Chapter 3       │   │
│ │ (Task) [Change ▼] [× Clear]          │   │
│ └──────────────────────────────────────┘   │
├────────────────────────────────────────────┤
│ Chat messages...                           │
```

---

## Implementation Plan

### Phase 1: Focus State Management (Backend)

**Objective**: Enable API and services to handle focus metadata

#### 1.1 Type Definitions

**File**: `apps/web/src/lib/types/agent-chat-enhancement.ts`

Add:

```typescript
export interface ProjectFocus {
	focusType: 'project-wide' | 'task' | 'goal' | 'plan' | 'document' | 'output' | 'milestone';
	focusEntityId: string | null; // null for project-wide
	focusEntityName: string | null; // For display
	projectId: string; // Always present
	projectName: string; // For display
}

export interface FocusEntitySummary {
	id: string;
	name: string;
	type: 'task' | 'goal' | 'plan' | 'document' | 'output' | 'milestone';
	metadata?: {
		state_key?: string;
		priority?: number;
		due_at?: string;
		// Other relevant fields
	};
}
```

To keep the planner context consistent with the actual ontology schema, `OntologyContext` was expanded to expose typed `entities` buckets (projects, tasks, goals, plans, documents, outputs, milestones) instead of a single `data` blob. Each bucket now holds the real Supabase row for that entity type, and a new `scope` object captures the active project plus the current focused entity. This change eliminates redundant `entityId` plumbing and gives every downstream service a canonical view of the current ontology selection.

#### 1.2 API Request Extension

**File**: `apps/web/src/routes/api/agent/stream/+server.ts`

Extend `EnhancedAgentStreamRequest`:

```typescript
interface EnhancedAgentStreamRequest {
	// ... existing fields
	projectFocus?: ProjectFocus; // New field
}
```

Update request handling:

```typescript
// After loading project context, check for focus
if (projectFocus?.focusEntityId && projectFocus.focusType !== 'project-wide') {
	// Load combined context: project + element
	ontologyContext = await ontologyLoader.loadCombinedProjectElementContext(
		projectFocus.projectId,
		projectFocus.focusType,
		projectFocus.focusEntityId
	);
} else {
	// Load project-only context
	ontologyContext = await ontologyLoader.loadProjectContext(projectFocus.projectId);
}
```

Emit focus SSE event:

```typescript
sendSSE({ type: 'focus_active', focus: projectFocus });
```

#### 1.3 Ontology Loader Enhancement

**File**: `apps/web/src/lib/services/ontology-context-loader.ts`

Add new method:

```typescript
async loadCombinedProjectElementContext(
  projectId: string,
  elementType: 'task' | 'goal' | 'plan' | 'document' | 'output' | 'milestone',
  elementId: string
): Promise<OntologyContext> {
  // Load element context (already includes parent project)
  const elementContext = await this.loadElementContext(elementType, elementId);

  // Enhance with project relationships and metadata
  const projectData = await this.loadProjectContext(projectId);

  return {
    type: 'combined',
    entities: {
      project: projectData.entities.project,
      [elementType]: elementContext.entities[elementType]
    },
    relationships: {
      project_edges: projectData.relationships.edges,
      element_edges: elementContext.relationships.edges
    },
    metadata: {
      ...projectData.metadata,
      ...elementContext.metadata
    },
    scope: {
      projectId,
      projectName: projectData.entities.project?.name,
      focus: {
        type: elementType,
        id: elementId,
        name: this.getEntityDisplayName(elementContext.entities[elementType], elementType)
      }
    }
  };
}
```

#### 1.4 Session Persistence

**Table**: `chat_sessions`
**Column**: `agent_metadata` (existing JSONB)

Store focus in metadata:

```typescript
await supabase
	.from('chat_sessions')
	.update({
		agent_metadata: {
			...existingMetadata,
			focus: projectFocus
		}
	})
	.eq('id', sessionId);
```

`ServiceContext` now exposes a `contextScope` derived from `ontologyContext.scope` (or the fallback `entity_id`) so planners, tools, and executors can reference a single source of truth for the current project/entity without duplicating IDs across metadata payloads.

---

### Phase 2: Focus UI Components (Frontend)

**Objective**: Add focus selection and display to chat modal

#### 2.1 Focus Indicator Component

**File**: `apps/web/src/lib/components/agent/ProjectFocusIndicator.svelte`

```svelte
<script lang="ts">
	import type { ProjectFocus } from '$lib/types/agent-chat-enhancement';

	interface Props {
		focus: ProjectFocus;
		onChangeFocus?: () => void;
		onClearFocus?: () => void;
	}

	let { focus, onChangeFocus, onClearFocus }: Props = $props();

	const focusIcons = {
		task: '✓',
		goal: '🎯',
		plan: '📋',
		document: '📄',
		output: '📦',
		milestone: '🏁'
	};
</script>

{#if focus.focusType !== 'project-wide'}
	<div
		class="flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800"
	>
		<span class="text-lg">{focusIcons[focus.focusType]}</span>
		<div class="flex-1">
			<div class="text-sm font-medium text-gray-900 dark:text-white">
				Focused on: {focus.focusEntityName}
			</div>
			<div class="text-xs text-gray-600 dark:text-gray-400">
				{focus.focusType.charAt(0).toUpperCase() + focus.focusType.slice(1)} in {focus.projectName}
			</div>
		</div>
		<button
			onclick={onChangeFocus}
			class="text-sm text-blue-600 dark:text-blue-400 hover:underline"
		>
			Change
		</button>
		<button
			onclick={onClearFocus}
			class="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
		>
			× Clear
		</button>
	</div>
{/if}
```

#### 2.2 Focus Selector Modal

**File**: `apps/web/src/lib/components/agent/ProjectFocusSelector.svelte`

```svelte
<script lang="ts">
	import { Modal, Card, CardBody } from '$lib/components/ui';
	import type { ProjectFocus, FocusEntitySummary } from '$lib/types/agent-chat-enhancement';

	interface Props {
		isOpen: boolean;
		projectId: string;
		projectName: string;
		currentFocus: ProjectFocus | null;
		onSelect: (focus: ProjectFocus) => void;
		onClose: () => void;
	}

	let { isOpen, projectId, projectName, currentFocus, onSelect, onClose }: Props = $props();

	let selectedType = $state<'task' | 'goal' | 'plan' | 'document' | 'output' | 'milestone'>(
		'task'
	);
	let entities = $state<FocusEntitySummary[]>([]);
	let loading = $state(false);

	async function loadEntities(type: string) {
		loading = true;
		try {
			const response = await fetch(`/api/onto/projects/${projectId}/entities?type=${type}`);
			const data = await response.json();
			entities = data.data || [];
		} catch (error) {
			console.error('Failed to load entities:', error);
			entities = [];
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		if (isOpen && selectedType) {
			loadEntities(selectedType);
		}
	});

	function handleSelect(entity: FocusEntitySummary) {
		onSelect({
			focusType: selectedType,
			focusEntityId: entity.id,
			focusEntityName: entity.name,
			projectId,
			projectName
		});
		onClose();
	}

	const focusTypes = [
		{ value: 'task', label: 'Tasks', icon: '✓' },
		{ value: 'goal', label: 'Goals', icon: '🎯' },
		{ value: 'plan', label: 'Plans', icon: '📋' },
		{ value: 'document', label: 'Documents', icon: '📄' },
		{ value: 'output', label: 'Outputs', icon: '📦' },
		{ value: 'milestone', label: 'Milestones', icon: '🏁' }
	];
</script>

<Modal {isOpen} {onClose} title="Focus on..." size="lg">
	<div class="space-y-4">
		<!-- Type selector pills -->
		<div class="flex flex-wrap gap-2">
			{#each focusTypes as type}
				<button
					onclick={() => (selectedType = type.value)}
					class="px-4 py-2 rounded-lg text-sm font-medium transition-colors
                 {selectedType === type.value
						? 'bg-blue-600 text-white'
						: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}"
				>
					<span class="mr-2">{type.icon}</span>
					{type.label}
				</button>
			{/each}
		</div>

		<!-- Entity list -->
		<div class="max-h-96 overflow-y-auto space-y-2">
			{#if loading}
				<div class="text-center py-8 text-gray-500">Loading...</div>
			{:else if entities.length === 0}
				<div class="text-center py-8 text-gray-500">
					No {selectedType}s found in this project
				</div>
			{:else}
				{#each entities as entity}
					<Card
						variant="outlined"
						class="hover:border-blue-500 dark:hover:border-blue-400 cursor-pointer transition-colors"
					>
						<CardBody padding="sm">
							<button onclick={() => handleSelect(entity)} class="w-full text-left">
								<div class="font-medium text-gray-900 dark:text-white">
									{entity.name}
								</div>
								{#if entity.metadata?.state_key}
									<div class="text-sm text-gray-600 dark:text-gray-400">
										{entity.metadata.state_key}
									</div>
								{/if}
							</button>
						</CardBody>
					</Card>
				{/each}
			{/if}
		</div>
	</div>
</Modal>
```

#### 2.3 Integrate into AgentChatModal

**File**: `apps/web/src/lib/components/agent/AgentChatModal.svelte`

Add state:

```typescript
let projectFocus = $state<ProjectFocus | null>(null);
let showFocusSelector = $state(false);
```

Add UI after context badge:

```svelte
{#if selectedContextType === 'project' && selectedEntityId}
	<ProjectFocusIndicator
		focus={projectFocus || defaultProjectFocus}
		onChangeFocus={() => (showFocusSelector = true)}
		onClearFocus={handleClearFocus}
	/>
{/if}

<ProjectFocusSelector
	isOpen={showFocusSelector}
	projectId={selectedEntityId}
	projectName={selectedContextLabel || 'Project'}
	currentFocus={projectFocus}
	onSelect={handleFocusChange}
	onClose={() => (showFocusSelector = false)}
/>
```

Add handlers:

```typescript
function handleFocusChange(newFocus: ProjectFocus) {
	projectFocus = newFocus;

	// Add activity message
	addActivityMessage({
		type: 'focus_change',
		message: `Focus changed to ${newFocus.focusEntityName}`,
		timestamp: new Date().toISOString()
	});

	// Reset streaming state for next message
	isStreaming = false;
}

function handleClearFocus() {
	projectFocus = {
		focusType: 'project-wide',
		focusEntityId: null,
		focusEntityName: null,
		projectId: selectedEntityId!,
		projectName: selectedContextLabel || 'Project'
	};

	addActivityMessage({
		type: 'focus_cleared',
		message: 'Focus cleared - back to project-wide view',
		timestamp: new Date().toISOString()
	});
}
```

Update `handleSend()` to include focus:

```typescript
const payload: EnhancedAgentStreamRequest = {
	message: currentMessage,
	context_type: selectedContextType!,
	entity_id: selectedEntityId,
	session_id: chatSession?.id,
	projectFocus: projectFocus // Include focus
	// ... other fields
};
```

---

### Phase 3: API Endpoint for Entity Listing

**Objective**: Provide endpoint for focus selector to load entities

**File**: `apps/web/src/routes/api/onto/projects/[id]/entities/+server.ts` (NEW)

```typescript
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

export const GET: RequestHandler = async ({ params, url, locals }) => {
	const { id: projectId } = params;
	const type = url.searchParams.get('type');
	const search = url.searchParams.get('search') || '';

	if (!type || !['task', 'goal', 'plan', 'document', 'output', 'milestone'].includes(type)) {
		return ApiResponse.error('Invalid type parameter', 400);
	}

	const supabase = locals.supabase;
	const tableName = `onto_${type}s`;

	try {
		let query = supabase
			.from(tableName)
			.select('id, name, state_key, priority, due_at, props')
			.eq('project_id', projectId)
			.limit(50);

		// Add search filter if provided
		if (search) {
			query = query.ilike('name', `%${search}%`);
		}

		// Order by recent or priority
		if (type === 'task') {
			query = query
				.order('priority', { ascending: false, nullsFirst: false })
				.order('created_at', { ascending: false });
		} else {
			query = query.order('created_at', { ascending: false });
		}

		const { data, error } = await query;

		if (error) {
			console.error(`Failed to load ${type}s:`, error);
			return ApiResponse.error(`Failed to load ${type}s`, 500);
		}

		// Transform to FocusEntitySummary format
		const entities = data.map((item) => ({
			id: item.id,
			name: item.name,
			type,
			metadata: {
				state_key: item.state_key,
				priority: item.priority,
				due_at: item.due_at
			}
		}));

		return ApiResponse.success(entities);
	} catch (error) {
		console.error('Error loading entities:', error);
		return ApiResponse.error('Internal server error', 500);
	}
};
```

---

### Phase 4: Agent Service Updates

**Objective**: Make agents focus-aware

#### 4.1 AgentContextService Enhancement

**File**: `apps/web/src/lib/services/agent-context-service.ts`

Update `buildPlannerContext()`:

```typescript
async buildPlannerContext(params: EnhancedBuildPlannerContextParams): Promise<EnhancedPlannerContext> {
  const { projectFocus, ontologyContext, ... } = params;

  // Build location context with focus awareness
  let locationContext = '';
  if (ontologyContext?.type === 'combined') {
    // Format combined project + element context
    locationContext = this.formatCombinedContext(ontologyContext, projectFocus);
  } else if (ontologyContext) {
    locationContext = this.formatOntologyContext(ontologyContext);
  }

  // Add focus metadata
  const metadata = {
    ...existingMetadata,
    focus: projectFocus
  };

  return {
    locationContext,
    metadata,
    tools: this.getToolsForFocus(contextType, projectFocus),
    // ... other fields
  };
}

private formatCombinedContext(context: OntologyContext, focus: ProjectFocus): string {
  return `
# Project Context: ${context.project.name}

${context.project.description || ''}

## Current Focus: ${focus.focusEntityName}

**Type**: ${focus.focusType}
**Details**:
${JSON.stringify(context.element, null, 2)}

## Project Overview

- State: ${context.project.state_key}
- Type: ${context.project.type_key}
- Total Tasks: ${context.metadata.entity_count.task}
- Total Goals: ${context.metadata.entity_count.goal}

## Relationships

### Element Relationships
${context.relationships.element_edges.map(e => `- ${e.rel}: ${e.target_kind} ${e.target_id}`).join('\n')}

---

**Note**: User is focused on this ${focus.focusType}. Prioritize actions and information relevant to this element while maintaining project context awareness.
  `.trim();
}

private getToolsForFocus(contextType: string, focus: ProjectFocus | null): string[] {
  if (!focus || focus.focusType === 'project-wide') {
    return this.getToolsForContextType(contextType);
  }

  // Filter tools based on focus type
  const allTools = this.getToolsForContextType(contextType);
  const focusType = focus.focusType;

  return allTools.filter(tool => {
    // Include general tools
    if (tool.includes('get_') || tool.includes('list_')) return true;

    // Include focus-specific tools
    if (tool.includes(`_${focusType}`)) return true;

    // Exclude other entity-specific tools
    const otherTypes = ['task', 'goal', 'plan', 'document', 'output', 'milestone']
      .filter(t => t !== focusType);

    return !otherTypes.some(type => tool.includes(`_${type}`) && !tool.includes('list_'));
  });
}
```

#### 4.2 Response Synthesizer Enhancement

**File**: `apps/web/src/lib/services/agentic-chat/synthesis/response-synthesizer.ts`

Update synthesis to mention focus:

```typescript
async synthesize(params: SynthesisParams): Promise<string> {
  const { plannerContext, executionResults, ... } = params;

  let contextualPrefix = '';
  if (plannerContext.metadata.focus?.focusType !== 'project-wide') {
    const focus = plannerContext.metadata.focus;
    contextualPrefix = `Regarding **${focus.focusEntityName}** (${focus.focusType}):\n\n`;
  }

  return contextualPrefix + synthesizedResponse;
}
```

---

### Phase 5: SSE Events & Activity Messages

**Objective**: Communicate focus changes via streaming events

#### 5.1 New SSE Event Type

**File**: `packages/shared-types/src/chat.types.ts`

Add to `AgentSSEMessage`:

```typescript
| { type: 'focus_active'; focus: ProjectFocus }
| { type: 'focus_changed'; focus: ProjectFocus }
```

#### 5.2 Handle in Modal

**File**: `apps/web/src/lib/components/agent/AgentChatModal.svelte`

```typescript
function handleSSEMessage(event: AgentSSEMessage) {
	switch (event.type) {
		case 'focus_active':
			// Initial focus from session restore
			projectFocus = event.focus;
			break;

		case 'focus_changed':
			// Focus changed by tool or agent
			projectFocus = event.focus;
			addActivityMessage({
				type: 'focus_change',
				message: `Focus changed to ${event.focus.focusEntityName}`,
				timestamp: new Date().toISOString()
			});
			break;

		// ... other cases
	}
}
```

---

## Testing Strategy

### Unit Tests

1. **OntologyContextLoader**:
    - `loadCombinedProjectElementContext()` returns project + element
    - Handles missing elements gracefully
    - Relationship merging works correctly

2. **AgentContextService**:
    - `formatCombinedContext()` produces valid markdown
    - `getToolsForFocus()` filters tools correctly
    - Focus metadata passes through to planner context

3. **API Endpoint**:
    - `/api/onto/projects/[id]/entities` returns entities
    - Search filtering works
    - Type validation rejects invalid types

### Integration Tests

1. **Focus Selection Flow**:
    - User selects project workspace
    - User opens focus selector
    - User selects task
    - Focus indicator appears
    - Next message includes focus in payload

2. **Focus Persistence**:
    - Focus saved to session metadata
    - Focus restored on page reload
    - SSE `focus_active` event emitted on restore

3. **Context Loading**:
    - Combined context loads both project + element
    - Agent receives formatted context with focus section
    - Tools filtered based on focus type

### Manual Testing Checklist

- [ ] Can select different entity types (task, goal, plan, etc.)
- [ ] Focus indicator displays correctly
- [ ] Changing focus adds activity message
- [ ] Clearing focus returns to project-wide
- [ ] Focus persists across page reload
- [ ] Agent responses reference focused entity
- [ ] Tool suggestions filtered to focus type
- [ ] Search in entity selector works
- [ ] Empty state when no entities exist
- [ ] Dark mode styling correct
- [ ] Responsive on mobile

---

## Migration & Rollout

### Phase 1: Backend Foundation (Week 1)

- Add type definitions
- Implement `loadCombinedProjectElementContext()`
- Add `/api/onto/projects/[id]/entities` endpoint
- Update API to accept `projectFocus`
- Add SSE events

### Phase 2: UI Components (Week 1-2)

- Build `ProjectFocusIndicator`
- Build `ProjectFocusSelector`
- Integrate into `AgentChatModal`
- Add activity message handling

### Phase 3: Agent Intelligence (Week 2)

- Update `AgentContextService` for combined context
- Add focus-aware tool filtering
- Update response synthesis
- Add focus hints to prompts

### Phase 4: Polish & Test (Week 2-3)

- Write unit tests
- Integration testing
- Manual QA
- Documentation updates
- Performance testing

### Phase 5: Beta Release (Week 3)

- Deploy to staging
- Beta user testing
- Gather feedback
- Iterate on UX

### Phase 6: Production (Week 4)

- Deploy to production
- Monitor usage metrics
- Track focus adoption rate
- Iterate based on analytics

---

## Success Metrics

### Quantitative

- **Adoption Rate**: % of project workspace conversations using focus
- **Focus Changes per Session**: Average # of focus switches
- **Session Length**: Do focused sessions last longer?
- **Task Completion**: Do focused task conversations complete tasks faster?

### Qualitative

- User feedback: "Focus made it easier to work on specific parts"
- Agent response quality: Responses more relevant when focused
- Reduced confusion: Fewer "which task?" clarifying questions

---

## Future Enhancements

### Phase 2 Features (Post-MVP)

1. **Focus Suggestions**:
    - Agent proactively suggests "Want to focus on Task X?"
    - Based on conversation context and recent entity mentions

2. **Multi-Focus**:
    - Allow selecting multiple related entities
    - "Focus on Tasks 1, 2, and 3"

3. **Focus History**:
    - Quick switcher showing recently focused entities
    - "You were last discussing Task X"

4. **Focus Templates**:
    - Saved focus configurations
    - "Daily standup focus" (specific tasks + goals)

5. **Focus Shortcuts**:
    - Keyboard shortcuts: Cmd+F to open focus selector
    - Quick links in chat: "Focus on this task" buttons in task mentions

6. **Focus Analytics**:
    - Dashboard showing most-focused entities
    - Time spent per focus area
    - Focus patterns and productivity insights

---

## Related Documentation

- [Agentic Chat System](/apps/web/docs/features/agentic-chat/)
- [Ontology Data Models](/apps/web/docs/features/ontology/DATA_MODELS.md)
- [Agent Context Service](/apps/web/docs/technical/services/agent-context-service.md)
- [BuildOS Style Guide](/apps/web/docs/technical/components/BUILDOS_STYLE_GUIDE.md)

---

## Appendix: Key Differences from Original Plan

### What Changed Since Original Plan

1. **Comprehensive ontology support already exists** - Original plan assumed minimal ontology integration; current system has full support for 6+ entity types with relationships

2. **Multi-tier context selection is sophisticated** - Original plan didn't account for existing 4-tier selection flow; new plan integrates as a layer within project workspace mode

3. **LastTurnContext provides conversation continuity** - Original plan didn't know about this feature; new plan leverages it for tracking focus across turns

4. **OntologyContextLoader already powerful** - Original plan proposed building context loaders; they exist with `loadElementContext()` returning parent project

5. **Context shifts are first-class** - Original plan treated this as new; current system already supports dynamic context shifts via tools and SSE

### Why This Plan is Better

1. **Builds on existing infrastructure** - Doesn't reinvent wheels, extends what works
2. **Simpler UX model** - "Focus layer" concept is clearer than "scope/mode" terminology
3. **Gradual enhancement** - Works seamlessly with existing project workspace mode
4. **Backwards compatible** - Default project-wide mode unchanged
5. **Aligned with current patterns** - Uses SSE events, activity messages, and metadata threading that already exist
