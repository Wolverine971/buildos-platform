---
title: Project Context Shift After Creation - Implementation Specification
date: 2025-11-04
status: approved
phase: agent-chat-integration
related:
    - /apps/web/docs/features/ontology/INTELLIGENT_PROJECT_CREATION.md
    - /apps/web/docs/features/ontology/CRUD_TOOLS_IMPLEMENTATION.md
    - /apps/web/src/lib/components/agent/ChatInterface.svelte
    - /apps/web/src/routes/api/agent/stream/+server.ts
path: docs/technical/implementation/PROJECT_CONTEXT_SHIFT_SPEC.md
---

# Project Context Shift After Creation - Implementation Specification

## Executive Summary

After a user successfully creates a project via the agent chat, the context must automatically shift from `project_create` to `project` mode. This enables seamless continuation where the user can immediately start managing their new project without manually switching contexts or navigating away.

**Goal**: Transform the post-creation experience from:

- ❌ "Project created! [User confused what to do next]"

To:

- ✅ "Project created! What would you like to add first?" [Context ready for updates]

## Current State Analysis

### What Exists Today

1. **Context Types Already Defined** (`ChatContextType` enum):
    - `project_create` - For creating new projects
    - `project` - For updating existing projects
    - Both contexts supported in UI and backend

2. **Chat Interface** (`ChatInterface.svelte`):
    - Accepts `chatType` prop (ChatContextType)
    - Shows context-specific welcome messages
    - Sends `context_type` to API

3. **Agent Stream API** (`/api/agent/stream`):
    - Receives `context_type` and `entity_id`
    - Creates/updates chat sessions with context
    - Loads context-specific system prompts

4. **Tool Executor** (`tool-executor.ts`):
    - `createOntoProject()` returns `project_id`
    - No mechanism to trigger context change

5. **System Prompts** (`chat-context-service.ts`):
    - Different prompts for different contexts
    - Tools filtered based on context

### What's Missing

1. **Context Switch Mechanism** 🚨
    - No way to change context mid-conversation
    - Chat session context is set at creation, never updated
    - No event/signal to trigger context shift

2. **UI State Management** 🚨
    - No visual indicator of current context
    - No breadcrumb showing "Now managing: Project X"
    - No way to exit project context

3. **Tool Adaptation** 🚨
    - Tools don't auto-hide based on context
    - `project_id` not auto-filled in tools
    - Can still call `create_onto_project` in project context

4. **Thread Continuity** 🚨
    - No system message indicating context shift
    - User confused about what changed

## Requirements

### Functional Requirements

#### FR-1: Automatic Context Shift

**When**: User successfully creates a project via `create_onto_project` tool
**Then**:

- Chat context automatically switches to `project`
- Chat session `entity_id` updates to new `project_id`
- Chat session `context_type` updates to `project`
- User can immediately issue update commands

**Priority**: P0 (Critical)

#### FR-2: Visual Context Indicator

**When**: Context shift occurs
**Then**:

- UI shows clear indicator: "Now managing: [Project Name]"
- Breadcrumb or header displays project context
- Visual distinction from global chat mode

**Priority**: P0 (Critical)

#### FR-3: Thread Continuity

**When**: Context shifts
**Then**:

- Same chat session continues (no new thread)
- System message inserted: "✓ Project created. I'm now helping you manage '[Project Name]'. What would you like to add?"
- Conversation history preserved

**Priority**: P0 (Critical)

#### FR-4: Tool Adaptation

**When**: In `project` context
**Then**:

- `create_onto_project` tool hidden/disabled
- `update_onto_project`, `create_onto_task`, `create_onto_goal`, `create_onto_plan` become primary
- `project_id` parameter auto-filled in creation tools
- System prompt reflects available tools

**Priority**: P1 (High)

#### FR-5: Context Exit

**When**: User wants to leave project context
**Then**:

- Command/button to "Exit project mode"
- Returns to `global` context
- Can create/manage other projects

**Priority**: P1 (High)

#### FR-6: Project Information Available

**When**: In `project` context
**Then**:

- Project details loaded into context (name, type_key, description, current state)
- Tasks, goals, plans abbreviated list available
- LLM aware of project structure

**Priority**: P0 (Critical)

### Non-Functional Requirements

#### NFR-1: Seamless Transition

- Context shift happens instantly (<500ms)
- No page reload or navigation required
- Feels like natural conversation continuation

#### NFR-2: Clear Affordances

- User always knows what context they're in
- Clear path to exit project context
- Help text explains context modes

#### NFR-3: Backward Compatibility

- Existing global chat sessions continue working
- Can still manually create project-scoped chats
- No breaking changes to existing API

## Technical Design

### Architecture Overview

```
User: "Create a book writing project"
    ↓
[Chat Interface] → POST /api/agent/stream (context_type='project_create')
    ↓
[LLM calls create_onto_project tool]
    ↓
[Tool Executor] → POST /api/onto/projects/instantiate
    ↓
[API returns project_id: "abc-123"]
    ↓
[Tool Executor detects context_shift_trigger]
    ↓
*** NEW: Context Shift Flow ***
    ↓
[Agent emits SSE event: { type: 'context_shift', new_context: 'project', entity_id: 'abc-123' }]
    ↓
[Chat Interface receives context_shift event]
    ↓
[Updates local state: chatType = 'project', entityId = 'abc-123']
    ↓
[Updates chat session in DB via PATCH /api/agent/sessions/[id]]
    ↓
[Inserts system message: "Now managing: Book Writing Project"]
    ↓
[Loads project context from /api/onto/projects/abc-123]
    ↓
[Updates UI header with project name + exit button]
    ↓
[Next message uses project tools with auto-filled project_id]
```

### Database Changes

#### 1. Add `context_shift_events` Table (Optional - for analytics)

```sql
CREATE TABLE chat_context_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES chat_sessions(id) ON DELETE CASCADE,
  from_context text NOT NULL,
  to_context text NOT NULL,
  entity_id text,
  trigger_tool text, -- e.g., 'create_onto_project'
  created_at timestamptz DEFAULT now()
);
```

**Why**: Track context shifts for analytics, debugging, and user flow analysis.

#### 2. Update `chat_sessions` Table

No schema changes needed! Already has:

- `context_type` (can be updated)
- `entity_id` (can be updated)

### API Changes

#### 1. New SSE Event Type

**File**: `/apps/web/src/routes/api/agent/stream/+server.ts`

Add new event type to `AgentSSEMessage`:

```typescript
interface AgentSSEMessage {
	type:
		| 'content'
		| 'tool_call'
		| 'tool_result'
		| 'phase'
		| 'operation'
		| 'clarification'
		| 'thinking'
		| 'error'
		| 'done'
		| 'context_shift'; // NEW

	content?: string;
	tool_call?: ToolCall;
	tool_result?: ToolResult;
	phase?: string;
	operation?: ChatOperation;
	clarification?: ClarificationRequest;
	error?: string;

	// NEW: Context shift data
	context_shift?: {
		new_context: ChatContextType;
		entity_id: string;
		entity_name: string;
		entity_type: 'project' | 'task' | 'plan' | 'goal';
		message: string; // System message to display
	};
}
```

#### 2. Detect Context Shift Triggers

**File**: `/apps/web/src/lib/chat/tool-executor.ts`

Update `createOntoProject()` to emit context shift signal:

```typescript
private async createOntoProject(args: CreateOntoProjectArgs): Promise<{
  project_id: string;
  counts: {...};
  message: string;
  // NEW: Signal context shift
  context_shift?: {
    new_context: 'project';
    entity_id: string;
    entity_name: string;
    entity_type: 'project';
  };
}> {
  // ... existing code ...

  // After successful creation
  return {
    project_id: result.project_id,
    counts: result.counts,
    message,
    // NEW: Include context shift metadata
    context_shift: {
      new_context: 'project',
      entity_id: result.project_id,
      entity_name: args.project.name,
      entity_type: 'project'
    }
  };
}
```

#### 3. Emit Context Shift Event

**File**: `/apps/web/src/routes/api/agent/stream/+server.ts`

After tool execution, check for context shifts:

```typescript
// After tool execution completes
if (toolResult.context_shift) {
	// Send context shift event to client
	await sendSSE({
		type: 'context_shift',
		context_shift: {
			new_context: toolResult.context_shift.new_context,
			entity_id: toolResult.context_shift.entity_id,
			entity_name: toolResult.context_shift.entity_name,
			entity_type: toolResult.context_shift.entity_type,
			message: `✓ Project created successfully. I'm now helping you manage "${toolResult.context_shift.entity_name}". What would you like to add?`
		}
	});

	// Update chat session in database
	await supabase
		.from('chat_sessions')
		.update({
			context_type: toolResult.context_shift.new_context,
			entity_id: toolResult.context_shift.entity_id,
			updated_at: new Date().toISOString()
		})
		.eq('id', sessionId);

	// Insert system message
	await supabase.from('chat_messages').insert({
		chat_session_id: sessionId,
		role: 'system',
		content: `Context shifted to ${toolResult.context_shift.new_context} for ${toolResult.context_shift.entity_name}`,
		created_at: new Date().toISOString()
	});
}
```

### Frontend Changes

#### 1. Update ChatInterface.svelte

**File**: `/apps/web/src/lib/components/agent/ChatInterface.svelte`

Add context shift handling:

```svelte
<script lang="ts">
	// ... existing imports ...
	import type { ChatContextType } from '@buildos/shared-types';

	// Props
	let { chatType, entityId, sessionId, autoAcceptOperations }: Props = $props();

	// NEW: Local state for context (can change during conversation)
	let currentContext = $state<ChatContextType>(chatType);
	let currentEntityId = $state<string | null>(entityId);
	let currentEntityName = $state<string | null>(null);

	// ... existing state ...

	// NEW: Handle SSE events including context shifts
	for (const line of lines) {
		if (line.startsWith('data: ')) {
			const data = line.slice(6);
			if (data === '[DONE]') continue;

			try {
				const event: AgentSSEMessage = JSON.parse(data);

				// ... existing event handlers ...

				// NEW: Handle context shift
				if (event.type === 'context_shift' && event.context_shift) {
					handleContextShift(event.context_shift);
				}
			} catch (err) {
				console.error('Error parsing SSE event:', err);
			}
		}
	}

	// NEW: Context shift handler
	function handleContextShift(shift: {
		new_context: ChatContextType;
		entity_id: string;
		entity_name: string;
		entity_type: string;
		message: string;
	}) {
		// Update local context
		currentContext = shift.new_context;
		currentEntityId = shift.entity_id;
		currentEntityName = shift.entity_name;

		// Add system message to chat
		messages = [
			...messages,
			{
				role: 'system',
				content: shift.message
			}
		];

		// Dispatch event to parent (for UI updates)
		dispatch('context_changed', {
			context: shift.new_context,
			entity_id: shift.entity_id,
			entity_name: shift.entity_name,
			entity_type: shift.entity_type
		});

		// Visual feedback
		console.log(`✓ Context shifted to ${shift.new_context} for ${shift.entity_name}`);
	}

	// NEW: Exit project context
	async function exitProjectContext() {
		currentContext = 'global';
		currentEntityId = null;
		currentEntityName = null;

		// Update session in DB
		if (sessionId) {
			await fetch(`/api/agent/sessions/${sessionId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					context_type: 'global',
					entity_id: null
				})
			});
		}

		// Add system message
		messages = [
			...messages,
			{
				role: 'system',
				content: 'Returned to global chat mode.'
			}
		];

		dispatch('context_changed', {
			context: 'global',
			entity_id: null
		});
	}
</script>

<!-- NEW: Context indicator header -->
{#if currentContext === 'project' && currentEntityName}
	<div
		class="context-header bg-blue-50 dark:bg-blue-900/20 p-3 border-b border-blue-200 dark:border-blue-800 flex items-center justify-between"
	>
		<div class="flex items-center gap-2">
			<svg
				class="w-4 h-4 text-blue-600 dark:text-blue-400"
				fill="currentColor"
				viewBox="0 0 20 20"
			>
				<path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
			</svg>
			<span class="text-sm font-medium text-blue-900 dark:text-blue-100">
				Managing: {currentEntityName}
			</span>
		</div>
		<button
			onclick={exitProjectContext}
			class="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
		>
			Exit Project Mode
		</button>
	</div>
{/if}

<!-- Existing chat UI -->
<div class="chat-messages">
	<!-- ... existing message rendering ... -->
</div>
```

#### 2. Update Parent Component

**File**: `/apps/web/src/lib/components/agent/AgentChatModal.svelte` (or wherever ChatInterface is used)

Handle context change events:

```svelte
<script lang="ts">
	let chatContext = $state<ChatContextType>('project_create');
	let entityId = $state<string | null>(null);
	let entityName = $state<string | null>(null);

	function handleContextChanged(event: CustomEvent) {
		chatContext = event.detail.context;
		entityId = event.detail.entity_id;
		entityName = event.detail.entity_name;

		// Optional: Navigate to project page
		if (chatContext === 'project' && entityId) {
			// Could show a toast: "View project details →"
			// Or automatically navigate after delay
		}
	}
</script>

<ChatInterface
	{chatContext}
	{entityId}
	{sessionId}
	{autoAcceptOperations}
	on:context_changed={handleContextChanged}
/>
```

### System Prompt Updates

**File**: `/apps/web/src/lib/services/chat-context-service.ts`

Update `getSystemPrompt()` to adapt tools based on context:

```typescript
private getSystemPrompt(contextType: ChatContextType): string {
  const basePrompt = `You are BuildOS, an AI assistant...`;

  switch (contextType) {
    case 'project_create':
      return basePrompt + `
## AVAILABLE TOOLS (PROJECT CREATION)

You have access to:
- list_onto_templates: Search for project templates
- create_onto_project: Create complete projects

DO NOT mention update/delete tools - project doesn't exist yet.
`;

    case 'project':
      return basePrompt + `
## AVAILABLE TOOLS (PROJECT MANAGEMENT)

You are currently managing a project. You have access to:
- create_onto_task: Add tasks to this project (project_id auto-filled)
- create_onto_goal: Add goals to this project (project_id auto-filled)
- create_onto_plan: Create plans for organizing tasks
- update_onto_project: Update project details
- update_onto_task: Modify existing tasks
- delete_onto_task: Remove tasks
- delete_onto_goal: Remove goals
- delete_onto_plan: Remove plans
- list_onto_templates: Search for task/goal/plan templates

DO NOT offer to create new projects - you're in project management mode.
To create a new project, user must exit project mode first.
`;

    // ... other contexts ...
  }
}
```

### Tool Auto-Fill Logic

**File**: `/apps/web/src/lib/chat/tool-executor.ts`

Add context awareness to tool executor:

```typescript
export class ChatToolExecutor {
  private sessionContext?: {
    type: ChatContextType;
    entity_id?: string;
  };

  constructor(
    private supabase: SupabaseClient<Database>,
    sessionContext?: { type: ChatContextType; entity_id?: string }
  ) {
    this.sessionContext = sessionContext;
  }

  // Auto-fill project_id in project context
  private async createOntoTask(args: CreateOntoTaskArgs): Promise<...> {
    // Auto-fill project_id if in project context and not provided
    if (!args.project_id && this.sessionContext?.type === 'project') {
      args.project_id = this.sessionContext.entity_id;
    }

    if (!args.project_id) {
      throw new Error('project_id is required');
    }

    // ... rest of implementation ...
  }

  // Similar for create_onto_goal, create_onto_plan
}
```

**Update in API**:

```typescript
// In /api/agent/stream/+server.ts
const executor = new ChatToolExecutor(supabase, {
	type: normalizedContextType,
	entity_id: entity_id
});
```

## Implementation Plan

### Phase 1: Core Context Shift (P0)

**Timeline**: 2-3 days

1. **Day 1: Backend Changes**
    - [ ] Add `context_shift` to tool result types
    - [ ] Update `createOntoProject()` to return context_shift metadata
    - [ ] Add `context_shift` SSE event type
    - [ ] Implement context shift detection in stream API
    - [ ] Update chat session on context shift
    - [ ] Insert system message on shift

2. **Day 2: Frontend Changes**
    - [ ] Update `ChatInterface.svelte` to handle context_shift events
    - [ ] Add local state for current context
    - [ ] Implement `handleContextShift()` function
    - [ ] Add context indicator header UI
    - [ ] Implement exit project mode button

3. **Day 3: Testing & Polish**
    - [ ] Test end-to-end flow
    - [ ] Verify session updates in DB
    - [ ] Test error cases
    - [ ] Add logging for debugging
    - [ ] Document new flow

### Phase 2: Tool Adaptation (P1)

**Timeline**: 1-2 days

4. **Day 4: System Prompts & Tool Filtering**
    - [ ] Update system prompts for each context
    - [ ] Implement tool visibility rules
    - [ ] Add context-aware help text

5. **Day 5: Auto-Fill & Validation**
    - [ ] Add sessionContext to ChatToolExecutor
    - [ ] Implement auto-fill for project_id
    - [ ] Update tool validation
    - [ ] Test auto-fill behavior

### Phase 3: Enhanced UX (P2)

**Timeline**: 1-2 days

6. **Day 6: Project Context Loading**
    - [ ] Load project details when context shifts
    - [ ] Add project summary to context
    - [ ] Show task/goal counts in header

7. **Day 7: Navigation & Polish**
    - [ ] Add "View Project →" link in header
    - [ ] Implement smooth transitions
    - [ ] Add helpful onboarding tooltips
    - [ ] Polish UI/UX details

## Testing Strategy

### Unit Tests

```typescript
// tool-executor.test.ts
describe('createOntoProject', () => {
	it('should include context_shift metadata in result', async () => {
		const result = await executor.createOntoProject({
			project: { name: 'Test Project', type_key: 'project.generic' }
		});

		expect(result.context_shift).toBeDefined();
		expect(result.context_shift.new_context).toBe('project');
		expect(result.context_shift.entity_id).toBe(result.project_id);
		expect(result.context_shift.entity_name).toBe('Test Project');
	});
});

// chat-interface.test.ts
describe('ChatInterface context shift', () => {
	it('should update context when receiving context_shift event', async () => {
		const { component } = render(ChatInterface, {
			chatType: 'project_create',
			entityId: null
		});

		await fireEvent.sseMessage({
			type: 'context_shift',
			context_shift: {
				new_context: 'project',
				entity_id: 'abc-123',
				entity_name: 'My Project',
				message: 'Now managing My Project'
			}
		});

		expect(component.currentContext).toBe('project');
		expect(component.currentEntityId).toBe('abc-123');
	});
});
```

### Integration Tests

1. **Full Flow Test**:
    - Start in `project_create` context
    - Create project via chat
    - Verify context shifts to `project`
    - Verify session updated in DB
    - Verify can create task immediately

2. **Error Handling**:
    - Project creation fails
    - Verify context stays in `project_create`
    - No orphaned context shifts

3. **Context Exit**:
    - In `project` mode
    - Click "Exit Project Mode"
    - Verify returns to `global`
    - Verify can create new project

### Manual Testing Checklist

- [ ] Create project via "Create a book writing project"
- [ ] Verify context header appears with project name
- [ ] Immediately say "Add a task to review the outline"
- [ ] Verify task created in correct project
- [ ] Click "Exit Project Mode"
- [ ] Verify header disappears
- [ ] Verify can create new project
- [ ] Test on mobile (responsive design)
- [ ] Test dark mode appearance
- [ ] Test with clarifications flow
- [ ] Test with failed project creation

## Edge Cases & Error Handling

### Edge Case 1: Clarifications During Creation

**Scenario**: Project creation requires clarifications

**Solution**:

- Context shift ONLY happens after successful creation (no clarifications)
- If clarifications returned, stay in `project_create` context
- After user answers and project created successfully, THEN shift

### Edge Case 2: Multiple Projects Created

**Scenario**: User creates project A, then creates project B in same chat

**Solution**:

- Each successful creation triggers context shift to new project
- Previous project context is replaced
- Add warning: "Switching to manage new project. Exit to return to [Project A]."

### Edge Case 3: Session Resumption

**Scenario**: User closes chat and reopens later

**Solution**:

- Load session from DB with `context_type` and `entity_id`
- ChatInterface initializes with correct context
- Header shows project name from DB

### Edge Case 4: Project Deletion

**Scenario**: Project is deleted while in project mode

**Solution**:

- Detect deletion (404 when loading project context)
- Automatically return to `global` context
- Show message: "Project no longer exists. Returned to global chat."

### Edge Case 5: Rapid Context Switches

**Scenario**: Multiple context shift events in quick succession

**Solution**:

- Debounce context shift handling (500ms)
- Use latest context shift
- Log all shifts for debugging

## Metrics & Success Criteria

### Success Metrics

1. **Adoption Rate**
    - % of users who continue chatting after project creation
    - Target: >60% (vs <20% today)

2. **Task Creation Time**
    - Time from project creation to first task creation
    - Target: <30 seconds (vs >2 minutes manual navigation)

3. **Context Awareness**
    - % of tasks created in correct project
    - Target: >95%

4. **User Satisfaction**
    - Survey: "Was it clear what happened after project creation?"
    - Target: >4.0/5.0

### Monitoring

**Database Queries**:

```sql
-- Track context shifts
SELECT
  COUNT(*) as total_shifts,
  AVG(EXTRACT(EPOCH FROM (created_at - session_created))) as avg_time_to_shift_seconds
FROM chat_context_shifts
WHERE from_context = 'project_create'
  AND to_context = 'project';

-- Find abandoned projects (created but no tasks)
SELECT p.id, p.name, p.created_at
FROM onto_projects p
LEFT JOIN onto_tasks t ON t.project_id = p.id
WHERE t.id IS NULL
  AND p.created_at > NOW() - INTERVAL '7 days';
```

**Logging**:

```typescript
// Add to all context shift events
logger.info('Context shift', {
	session_id: sessionId,
	from_context: 'project_create',
	to_context: 'project',
	entity_id: projectId,
	entity_name: projectName,
	time_in_previous_context_seconds: durationSeconds
});
```

## Security Considerations

### Authorization

- **Session Ownership**: Verify user owns chat session before updating
- **Project Access**: Verify user has access to project when shifting context
- **Entity_id Validation**: Sanitize and validate entity_id before storing

### Attack Vectors

1. **Malicious Context Shift**
    - Attacker tries to shift context to someone else's project
    - **Mitigation**: Always verify project ownership via RLS

2. **Context Injection**
    - Attacker tries to inject arbitrary entity_id
    - **Mitigation**: Validate entity exists and user has access

3. **Session Hijacking**
    - Attacker tries to modify someone else's session
    - **Mitigation**: Use RLS policies, verify user_id matches session

## Future Enhancements

### Phase 4: Multi-Project Context (Future)

Allow managing multiple projects in parallel:

- Tabs for different projects
- Quick-switch between projects
- Recent projects dropdown

### Phase 5: Smart Context Inference (Future)

LLM detects intent and suggests context:

- "Would you like to switch to managing Project X?"
- Auto-switch when user mentions specific project

### Phase 6: Context History (Future)

Navigate through context history:

- Back/forward buttons
- Context breadcrumb trail
- "Return to previous project"

## Open Questions

1. **Should we auto-navigate to project page after creation?**
    - Pro: Helps user see visual representation
    - Con: Disrupts chat flow
    - **Decision Needed**: Get user feedback

2. **How long to show context indicator?**
    - Always visible? Collapsible? Auto-hide after timeout?
    - **Recommendation**: Always visible, but minimized

3. **What happens if project creation has errors but partial success?**
    - Project created, but some tasks failed
    - **Recommendation**: Still shift context, show warnings

4. **Should we support nested contexts?**
    - Project → Task → Subtask
    - **Recommendation**: Defer to Phase 4+

## References

- [Intelligent Project Creation Docs](/apps/web/docs/features/ontology/INTELLIGENT_PROJECT_CREATION.md)
- [CRUD Tools Implementation](/apps/web/docs/features/ontology/CRUD_TOOLS_IMPLEMENTATION.md)
- [ChatInterface Component](/apps/web/src/lib/components/agent/ChatInterface.svelte)
- [Agent Stream API](/apps/web/src/routes/api/agent/stream/+server.ts)
- [Chat Context Service](/apps/web/src/lib/services/chat-context-service.ts)

---

**Status**: ✅ Ready for Implementation
**Estimated Effort**: 5-7 developer days
**Risk Level**: Medium (requires careful coordination of backend/frontend state)
**Dependencies**: None (all prerequisites exist)
