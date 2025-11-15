# Thinking Block Log UI Specification

## Overview

Transform the display of intermediary agent messages (thinking, tool usage, state changes) into consolidated "thinking block logs" that provide a terminal-style view of agent activity. Each thinking block represents one agent thinking cycle from user input to final response.

**Status:** Planning
**Created:** 2025-11-14
**Priority:** High
**Component:** `AgentChatModal.svelte`

---

## Design Vision

### User Experience Flow

1. **User sends message** → New thinking block appears with "Planning..." status
2. **Agent thinks** → Block fills with log entries in real-time (terminal style)
3. **Agent completes** → Block status changes to "Complete", can be collapsed
4. **User sends next message** → New thinking block appears for next cycle

### Visual Design

**Terminal/Console Aesthetic:**

- Monospace font for log entries
- Dark background with syntax-highlighted text
- Log prefixes: `[HH:MM:SS] [TYPE] message`
- Color coding + icons for different activity types
- Collapsible with status-based header

**Example Visual:**

```
┌─ Agent Thinking ──────────────────────────────── ▼ Collapse
│ Status: Executing plan...                    12 activities
│
│ ╭─────────────────────────────────────────────────────────╮
│ │ [12:34:56] [STATE] 🟢 Agent is processing your request...│
│ │ [12:34:57] [PLAN]  📋 Plan created with 3 steps          │
│ │ [12:34:58] [TOOL]  🔧 Using tool: fetch_project_data     │
│ │ [12:34:59] [TOOL]  ✓ Tool execution completed            │
│ │ [12:35:00] [STEP]  ➜ Starting: Step 1 - Analyze project  │
│ │ [12:35:02] [EXEC]  ⚙️ Executor started for task...       │
│ │ [12:35:04] [STEP]  ✓ Step 1 complete                     │
│ ╰─────────────────────────────────────────────────────────╯
└──────────────────────────────────────────────────────────────
```

**Collapsed State:**

```
┌─ Agent Thinking ──────────────────────────────── ▶ Expand
│ Status: Complete                              12 activities
└──────────────────────────────────────────────────────────────
```

---

## Technical Specification

### Data Structure Changes

#### New Message Type: `thinking_block`

```typescript
interface ThinkingBlockMessage extends UIMessage {
	type: 'thinking_block';
	activities: ActivityEntry[];
	status: 'active' | 'completed';
	agentState?: AgentLoopState; // 'thinking' | 'executing_plan' | 'waiting_on_user'
	isCollapsed?: boolean; // UI state
}

interface ActivityEntry {
	id: string;
	content: string;
	timestamp: Date;
	activityType: ActivityType;
	metadata?: {
		toolName?: string;
		stepNumber?: number;
		planSteps?: number;
		error?: string;
		[key: string]: any;
	};
}

type ActivityType =
	| 'tool_call' // Tool being invoked
	| 'tool_result' // Tool execution completed
	| 'plan_created' // Plan generation
	| 'plan_review' // Plan approval/rejection
	| 'state_change' // Agent state transitions
	| 'step_start' // Plan step starting
	| 'step_complete' // Plan step finished
	| 'executor_spawned' // Executor agent created
	| 'executor_result' // Executor completed
	| 'context_shift' // Context/focus changed
	| 'template_request' // Template creation request
	| 'template_status' // Template creation status
	| 'ontology_loaded' // Ontology context loaded
	| 'general'; // Generic activity
```

#### Update UIMessage Union

```typescript
interface UIMessage {
	id: string;
	session_id?: string;
	user_id?: string;
	role?: ChatRole;
	content: string;
	created_at?: string;
	updated_at?: string;
	type:
		| 'user'
		| 'assistant'
		| 'activity' // DEPRECATED - migrate to thinking_block
		| 'thinking_block' // NEW
		| 'plan'
		| 'step'
		| 'executor'
		| 'clarification';
	data?: any;
	timestamp: Date;
	tool_calls?: any;
	tool_call_id?: string;
}
```

### Component State Changes

```typescript
// New state for tracking current thinking block
let currentThinkingBlockId = $state<string | null>(null);

// Existing states to maintain
let messages = $state<UIMessage[]>([]);
let isStreaming = $state(false);
let agentState = $state<AgentLoopState | null>(null);
```

### Activity Type Mapping

| SSE Event Type          | Activity Type      | Icon | Color (Dark Mode)            |
| ----------------------- | ------------------ | ---- | ---------------------------- |
| `tool_call`             | `tool_call`        | 🔧   | Blue (`text-blue-400`)       |
| `tool_result`           | `tool_result`      | ✓    | Green (`text-green-400`)     |
| `plan_created`          | `plan_created`     | 📋   | Purple (`text-purple-400`)   |
| `plan_ready_for_review` | `plan_created`     | 📋   | Purple (`text-purple-400`)   |
| `plan_review`           | `plan_review`      | ⚖️   | Amber (`text-amber-400`)     |
| `agent_state`           | `state_change`     | 🟢   | Emerald (`text-emerald-400`) |
| `step_start`            | `step_start`       | ➜    | Orange (`text-orange-400`)   |
| `step_complete`         | `step_complete`    | ✓    | Green (`text-green-400`)     |
| `executor_spawned`      | `executor_spawned` | ⚙️   | Teal (`text-teal-400`)       |
| `executor_result`       | `executor_result`  | ✓    | Green (`text-green-400`)     |
| `context_shift`         | `context_shift`    | 🔄   | Yellow (`text-yellow-400`)   |
| `template_creation_*`   | `template_*`       | 📄   | Pink (`text-pink-400`)       |
| `ontology_loaded`       | `ontology_loaded`  | 📚   | Indigo (`text-indigo-400`)   |
| Other                   | `general`          | ℹ️   | Slate (`text-slate-400`)     |

---

## Implementation Plan

### Phase 1: Core Data Structure

**File:** `AgentChatModal.svelte`

#### 1.1 Update Type Definitions (Lines 142-157)

```typescript
// Add new interfaces near existing UIMessage interface
interface ThinkingBlockMessage extends UIMessage {
	type: 'thinking_block';
	activities: ActivityEntry[];
	status: 'active' | 'completed';
	agentState?: AgentLoopState;
	isCollapsed?: boolean;
}

interface ActivityEntry {
	id: string;
	content: string;
	timestamp: Date;
	activityType: ActivityType;
	metadata?: Record<string, any>;
}

type ActivityType =
	| 'tool_call'
	| 'tool_result'
	| 'plan_created'
	| 'plan_review'
	| 'state_change'
	| 'step_start'
	| 'step_complete'
	| 'executor_spawned'
	| 'executor_result'
	| 'context_shift'
	| 'template_request'
	| 'template_status'
	| 'ontology_loaded'
	| 'general';
```

#### 1.2 Add State Variables (Lines 160-192)

```typescript
let currentThinkingBlockId = $state<string | null>(null);
```

### Phase 2: Message Handling Functions

#### 2.1 Create New Thinking Block Function

```typescript
/**
 * Creates a new thinking block when user sends a message
 */
function createThinkingBlock(): string {
	const blockId = crypto.randomUUID();
	const thinkingBlock: ThinkingBlockMessage = {
		id: blockId,
		type: 'thinking_block',
		activities: [],
		status: 'active',
		agentState: 'thinking',
		isCollapsed: false,
		content: 'Agent thinking...',
		timestamp: new Date()
	};
	messages = [...messages, thinkingBlock];
	currentThinkingBlockId = blockId;
	return blockId;
}
```

#### 2.2 Add Activity to Current Block

```typescript
/**
 * Adds an activity entry to the current thinking block
 */
function addActivityToThinkingBlock(
	content: string,
	activityType: ActivityType,
	metadata?: Record<string, any>
) {
	if (!currentThinkingBlockId) {
		// Fallback: create thinking block if none exists
		createThinkingBlock();
	}

	const activity: ActivityEntry = {
		id: crypto.randomUUID(),
		content,
		timestamp: new Date(),
		activityType,
		metadata
	};

	messages = messages.map((msg) => {
		if (msg.id === currentThinkingBlockId && msg.type === 'thinking_block') {
			return {
				...msg,
				activities: [...(msg as ThinkingBlockMessage).activities, activity]
			};
		}
		return msg;
	});
}
```

#### 2.3 Update Agent State in Block

```typescript
/**
 * Updates the agent state displayed in the thinking block header
 */
function updateThinkingBlockState(state: AgentLoopState, details?: string) {
	if (!currentThinkingBlockId) return;

	messages = messages.map((msg) => {
		if (msg.id === currentThinkingBlockId && msg.type === 'thinking_block') {
			return {
				...msg,
				agentState: state,
				content: details || AGENT_STATE_MESSAGES[state]
			};
		}
		return msg;
	});
}
```

#### 2.4 Finalize Thinking Block

```typescript
/**
 * Marks the thinking block as completed
 */
function finalizeThinkingBlock() {
	if (!currentThinkingBlockId) return;

	messages = messages.map((msg) => {
		if (msg.id === currentThinkingBlockId && msg.type === 'thinking_block') {
			return {
				...msg,
				status: 'completed',
				content: 'Complete'
			};
		}
		return msg;
	});

	currentThinkingBlockId = null;
}
```

#### 2.5 Toggle Collapse State

```typescript
/**
 * Toggles collapse state of a thinking block
 */
function toggleThinkingBlockCollapse(blockId: string) {
	messages = messages.map((msg) => {
		if (msg.id === blockId && msg.type === 'thinking_block') {
			return {
				...msg,
				isCollapsed: !(msg as ThinkingBlockMessage).isCollapsed
			};
		}
		return msg;
	});
}
```

### Phase 3: Update SSE Message Handler

#### 3.1 Modify `handleSSEMessage` Function (Lines 478-714)

Replace calls to `addActivityMessage()` with `addActivityToThinkingBlock()`:

```typescript
function handleSSEMessage(event: AgentSSEMessage) {
	switch (event.type) {
		case 'ontology_loaded':
			ontologyLoaded = true;
			ontologySummary = event.summary || 'Ontology context loaded';
			// OLD: addActivityMessage(`Ontology context: ${ontologySummary}`);
			addActivityToThinkingBlock(`Ontology context: ${ontologySummary}`, 'ontology_loaded', {
				summary: ontologySummary
			});
			break;

		case 'agent_state': {
			const state = event.state as AgentLoopState;
			agentState = state;
			agentStateDetails = event.details ?? null;
			updateThinkingBlockState(state, event.details);
			if (event.details) {
				// OLD: addActivityMessage(event.details);
				addActivityToThinkingBlock(event.details, 'state_change', {
					state,
					details: event.details
				});
			}
			// ... rest of switch logic
			break;
		}

		case 'tool_call':
			const toolName = event.tool_call?.function?.name || 'unknown';
			// OLD: addActivityMessage(`Using tool: ${toolName}`);
			addActivityToThinkingBlock(`Using tool: ${toolName}`, 'tool_call', {
				toolName,
				toolCall: event.tool_call
			});
			break;

		case 'tool_result':
			// OLD: addActivityMessage('Tool execution completed');
			addActivityToThinkingBlock('Tool execution completed', 'tool_result');
			break;

		case 'plan_created':
			currentPlan = event.plan;
			currentActivity = `Executing plan with ${event.plan?.steps?.length || 0} steps...`;
			agentState = 'executing_plan';
			agentStateDetails = currentActivity;
			updateThinkingBlockState('executing_plan', currentActivity);
			addActivityToThinkingBlock(
				`Plan created with ${event.plan?.steps?.length || 0} steps`,
				'plan_created',
				{ plan: event.plan }
			);
			break;

		case 'step_start':
			currentActivity = `Step ${event.step?.stepNumber}: ${event.step?.description}`;
			// OLD: addActivityMessage(`Starting: ${event.step?.description}`);
			addActivityToThinkingBlock(`Starting: ${event.step?.description}`, 'step_start', {
				stepNumber: event.step?.stepNumber,
				description: event.step?.description
			});
			break;

		case 'step_complete':
			// OLD: addActivityMessage(`Step ${event.step?.stepNumber} complete`);
			addActivityToThinkingBlock(`Step ${event.step?.stepNumber} complete`, 'step_complete', {
				stepNumber: event.step?.stepNumber
			});
			break;

		case 'executor_spawned':
			currentActivity = `Executor working on task...`;
			agentState = 'executing_plan';
			agentStateDetails = currentActivity;
			updateThinkingBlockState('executing_plan', currentActivity);
			// OLD: addActivityMessage(`Executor started for: ${event.task?.description}`);
			addActivityToThinkingBlock(
				`Executor started for: ${event.task?.description}`,
				'executor_spawned',
				{ task: event.task }
			);
			break;

		case 'executor_result':
			// OLD: addActivityMessage(
			//   event.result?.success ? 'Executor completed successfully' : 'Executor failed'
			// );
			addActivityToThinkingBlock(
				event.result?.success ? 'Executor completed successfully' : 'Executor failed',
				'executor_result',
				{ result: event.result }
			);
			break;

		case 'context_shift': {
			const shift = event.context_shift;
			if (shift) {
				// ... existing context update logic ...
				const activityMessage =
					shift.message ??
					`Context updated to ${selectedContextLabel ?? normalizedContext}`;
				// OLD: addActivityMessage(activityMessage);
				addActivityToThinkingBlock(activityMessage, 'context_shift', {
					contextShift: shift
				});
			}
			break;
		}

		case 'template_creation_request': {
			const request = event.request;
			const realmLabel = request?.realm_suggestion || 'new realm';
			// OLD: addActivityMessage(`Escalating template creation (${realmLabel})...`);
			addActivityToThinkingBlock(
				`Escalating template creation (${realmLabel})...`,
				'template_request',
				{ request }
			);
			break;
		}

		case 'template_creation_status':
			// OLD: addActivityMessage(...)
			addActivityToThinkingBlock(
				`Template creation status: ${event.status.replace(/_/g, ' ')}${
					event.message ? ` · ${event.message}` : ''
				}`,
				'template_status',
				{ status: event.status, message: event.message }
			);
			break;

		case 'done':
			currentActivity = '';
			agentState = null;
			agentStateDetails = null;
			finalizeAssistantMessage();
			finalizeThinkingBlock(); // NEW: Close thinking block
			isStreaming = false;
			break;

		// ... other cases remain the same
	}
}
```

#### 3.2 Update `sendMessage` Function (Lines 335-476)

Add thinking block creation:

```typescript
async function sendMessage() {
	// ... existing validation ...

	messages = [...messages, userMessage];
	inputValue = '';
	error = null;
	isStreaming = true;

	// NEW: Create thinking block for agent activity
	createThinkingBlock();

	currentActivity = 'Analyzing request...';
	agentState = 'thinking';
	agentStateDetails = 'Agent is processing your request...';
	updateThinkingBlockState('thinking', 'Agent is processing your request...');

	// ... rest of function
}
```

### Phase 4: Create ThinkingBlock Component

**New File:** `/src/lib/components/agent/ThinkingBlock.svelte`

```svelte
<script lang="ts">
	import type { ThinkingBlockMessage, ActivityEntry, ActivityType } from './types';
	import { ChevronDown, ChevronRight } from 'lucide-svelte';

	interface Props {
		block: ThinkingBlockMessage;
		onToggleCollapse: (blockId: string) => void;
	}

	let { block, onToggleCollapse }: Props = $props();

	// Derive status label
	const statusLabel = $derived(block.agentState ? block.content : 'Complete');
	const activityCount = $derived(block.activities.length);

	// Icon and color mapping
	const ACTIVITY_STYLES: Record<ActivityType, { icon: string; color: string; prefix: string }> = {
		tool_call: { icon: '🔧', color: 'text-blue-400', prefix: 'TOOL' },
		tool_result: { icon: '✓', color: 'text-green-400', prefix: 'TOOL' },
		plan_created: { icon: '📋', color: 'text-purple-400', prefix: 'PLAN' },
		plan_review: { icon: '⚖️', color: 'text-amber-400', prefix: 'PLAN' },
		state_change: { icon: '🟢', color: 'text-emerald-400', prefix: 'STATE' },
		step_start: { icon: '➜', color: 'text-orange-400', prefix: 'STEP' },
		step_complete: { icon: '✓', color: 'text-green-400', prefix: 'STEP' },
		executor_spawned: { icon: '⚙️', color: 'text-teal-400', prefix: 'EXEC' },
		executor_result: { icon: '✓', color: 'text-green-400', prefix: 'EXEC' },
		context_shift: { icon: '🔄', color: 'text-yellow-400', prefix: 'CONTEXT' },
		template_request: { icon: '📄', color: 'text-pink-400', prefix: 'TEMPLATE' },
		template_status: { icon: '📄', color: 'text-pink-400', prefix: 'TEMPLATE' },
		ontology_loaded: { icon: '📚', color: 'text-indigo-400', prefix: 'ONTO' },
		general: { icon: 'ℹ️', color: 'text-slate-400', prefix: 'INFO' }
	};

	function formatTime(date: Date): string {
		return date.toLocaleTimeString('en-US', {
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
			hour12: false
		});
	}

	function getActivityStyle(type: ActivityType) {
		return ACTIVITY_STYLES[type] || ACTIVITY_STYLES.general;
	}
</script>

<div
	class="thinking-block rounded-xl border border-slate-700 bg-slate-900/95 shadow-lg dark:border-slate-600 dark:bg-slate-800/95"
>
	<!-- Header -->
	<button
		onclick={() => onToggleCollapse(block.id)}
		class="flex w-full items-center justify-between gap-3 border-b border-slate-700 bg-slate-800/80 px-4 py-3 transition hover:bg-slate-800 dark:border-slate-600 dark:bg-slate-700/80 dark:hover:bg-slate-700"
	>
		<div class="flex items-center gap-3">
			{#if block.isCollapsed}
				<ChevronRight class="h-4 w-4 text-slate-400" />
			{:else}
				<ChevronDown class="h-4 w-4 text-slate-400" />
			{/if}
			<span class="font-mono text-sm font-semibold text-slate-200 dark:text-slate-100">
				Agent Thinking
			</span>
		</div>
		<div class="flex items-center gap-4 text-xs">
			<span
				class="font-mono font-medium {block.status === 'active'
					? 'text-emerald-400'
					: 'text-slate-400'}"
			>
				Status: {statusLabel}
			</span>
			<span class="font-mono text-slate-500">{activityCount} activities</span>
		</div>
	</button>

	<!-- Activity Log -->
	{#if !block.isCollapsed}
		<div
			class="max-h-96 space-y-0.5 overflow-y-auto bg-slate-950/60 p-3 font-mono text-xs dark:bg-slate-900/60"
		>
			{#if block.activities.length === 0}
				<div class="flex items-center gap-2 py-2 text-slate-500">
					<span class="inline-flex h-2 w-2 animate-pulse rounded-full bg-emerald-500"
					></span>
					<span>Waiting for agent activity...</span>
				</div>
			{:else}
				{#each block.activities as activity (activity.id)}
					{@const style = getActivityStyle(activity.activityType)}
					<div class="flex gap-2 py-1 leading-relaxed {style.color}">
						<span class="w-20 shrink-0 text-slate-500"
							>{formatTime(activity.timestamp)}</span
						>
						<span class="w-16 shrink-0 font-semibold">[{style.prefix}]</span>
						<span class="shrink-0">{style.icon}</span>
						<span class="flex-1 text-slate-300 dark:text-slate-200"
							>{activity.content}</span
						>
					</div>
				{/each}
			{/if}
		</div>
	{/if}
</div>

<style>
	.thinking-block {
		/* Terminal-style scrollbar */
		scrollbar-width: thin;
		scrollbar-color: rgb(71 85 105) rgb(15 23 42);
	}

	.thinking-block ::-webkit-scrollbar {
		width: 6px;
	}

	.thinking-block ::-webkit-scrollbar-track {
		background: rgb(15 23 42);
	}

	.thinking-block ::-webkit-scrollbar-thumb {
		background: rgb(71 85 105);
		border-radius: 3px;
	}

	.thinking-block ::-webkit-scrollbar-thumb:hover {
		background: rgb(100 116 139);
	}
</style>
```

### Phase 5: Update AgentChatModal UI

#### 5.1 Import ThinkingBlock Component

```typescript
import ThinkingBlock from './ThinkingBlock.svelte';
```

#### 5.2 Update Message Rendering Loop (Lines 969-1098)

```svelte
{#each messages as message (message.id)}
	{#if message.type === 'user'}
		<!-- Existing user message rendering -->
		<!-- ... -->
	{:else if message.type === 'assistant'}
		<!-- Existing assistant message rendering -->
		<!-- ... -->
	{:else if message.type === 'thinking_block'}
		<!-- NEW: Render thinking block -->
		<ThinkingBlock block={message} onToggleCollapse={toggleThinkingBlockCollapse} />
	{:else if message.type === 'clarification'}
		<!-- Existing clarification rendering -->
		<!-- ... -->
	{:else if message.type === 'plan'}
		<!-- DECISION: Keep plan messages or integrate into thinking block? -->
		<!-- Recommendation: Keep for now, integrate in Phase 2 -->
		<!-- ... -->
	{:else if message.type === 'activity'}
		<!-- DEPRECATED: Remove or show migration warning in dev mode -->
		{#if dev}
			<div class="text-xs text-red-500">
				Warning: Legacy activity message (should be in thinking block)
			</div>
		{/if}
	{/if}
{/each}
```

### Phase 6: Migration & Cleanup

#### 6.1 Deprecate Legacy Activity Messages

- Mark `addActivityMessage()` as deprecated
- Add console warnings in dev mode
- Gradually remove old 'activity' and 'plan' message types

#### 6.2 Update Types Export

**File:** `/src/lib/components/agent/types.ts` (create if doesn't exist)

```typescript
export type {
	UIMessage,
	ThinkingBlockMessage,
	ActivityEntry,
	ActivityType
} from './AgentChatModal.svelte';
```

---

## Design Specifications

### Colors (Dark Mode)

| Element         | Tailwind Class     | Hex     |
| --------------- | ------------------ | ------- |
| Background      | `bg-slate-950/60`  | #020617 |
| Border          | `border-slate-700` | #334155 |
| Header BG       | `bg-slate-800/80`  | #1e293b |
| Text (log)      | `text-slate-300`   | #cbd5e1 |
| Timestamp       | `text-slate-500`   | #64748b |
| Active status   | `text-emerald-400` | #34d399 |
| Complete status | `text-slate-400`   | #94a3b8 |

### Typography

| Element             | Font Family | Size      | Weight          |
| ------------------- | ----------- | --------- | --------------- |
| Header title        | `font-mono` | `text-sm` | `font-semibold` |
| Status text         | `font-mono` | `text-xs` | `font-medium`   |
| Log timestamp       | `font-mono` | `text-xs` | normal          |
| Log prefix `[TYPE]` | `font-mono` | `text-xs` | `font-semibold` |
| Log content         | `font-mono` | `text-xs` | normal          |

### Spacing

| Element              | Padding/Margin     |
| -------------------- | ------------------ |
| Header padding       | `px-4 py-3`        |
| Log container        | `p-3`              |
| Activity entry       | `py-1`             |
| Gap between elements | `gap-2` to `gap-4` |

### Animation

- **Collapse/Expand:** CSS transition on height
- **Pulse:** Active status indicator (when `status === 'active'`)
- **Smooth scroll:** Auto-scroll to bottom as activities appear

---

## Testing Requirements

### Unit Tests

**File:** `/src/lib/components/agent/ThinkingBlock.test.ts`

- Render empty thinking block
- Render with activities
- Toggle collapse/expand
- Verify icon and color mapping
- Test status labels

**File:** `/src/lib/components/agent/AgentChatModal.test.ts`

- Create thinking block on message send
- Add activities to current block
- Finalize block on completion
- Multiple thinking blocks in sequence
- Collapse state persistence

### Integration Tests

- Full conversation flow with thinking blocks
- SSE message handling creates correct activity types
- Responsive design on mobile and desktop
- Dark mode rendering
- Accessibility (keyboard navigation, ARIA labels)

### Visual Regression Tests

- Collapsed vs expanded states
- Empty vs populated activity logs
- Active vs completed status
- Different activity types with colors/icons

---

## Performance Considerations

### Optimization Strategies

1. **Virtual Scrolling:** If activity count exceeds 100, implement virtual scrolling
2. **Activity Limit:** Cap activities at 500 per block with "show more" option
3. **Lazy Rendering:** Collapsed blocks don't render activity DOM until expanded
4. **Memoization:** Derive activity count and status labels efficiently

### Memory Management

- Clear completed thinking blocks from memory after N messages (e.g., keep last 20)
- Implement "load more history" for older blocks

---

## Accessibility

### ARIA Labels

- `aria-label="Agent thinking log"` on thinking block container
- `aria-expanded={!block.isCollapsed}` on collapse button
- `role="log"` on activity list container
- `aria-live="polite"` for new activities (when block is active)

### Keyboard Navigation

- **Space/Enter:** Toggle collapse on header button
- **Tab:** Navigate through thinking blocks
- **Arrow keys:** Navigate activities within expanded block

### Screen Reader Support

- Announce activity count changes
- Announce status changes (thinking → executing → complete)
- Provide context for each activity type

---

## Migration Path

### Phase 1: Parallel Implementation (Week 1)

- Implement new thinking block system
- Keep old activity messages for comparison
- Feature flag: `USE_THINKING_BLOCKS` (default: false)

### Phase 2: Testing & Refinement (Week 2)

- Enable for internal testing
- Gather feedback on UX
- Refine visual design and performance

### Phase 3: Rollout (Week 3)

- Enable for all users (set flag to true)
- Monitor for errors and feedback
- Deprecate old activity message rendering

### Phase 4: Cleanup (Week 4)

- Remove old activity message code
- Remove feature flag
- Update documentation

---

## Open Questions & Decisions

### Q1: Plan Messages

**Question:** Should `plan` type messages be integrated into thinking blocks, or remain separate?

**Options:**

1. **Integrate:** Add plan as an activity type with expanded view for steps
2. **Keep Separate:** Maintain plan messages as standalone for visibility
3. **Hybrid:** Small plan summary in thinking block, full plan in separate message

**Recommendation:** Keep separate for now (clearer UX), integrate in Phase 2 if feedback supports it.

### Q2: Clarification Messages

**Question:** Should clarification messages appear inside thinking blocks or remain separate?

**Recommendation:** Keep separate - they require user input and should stand out visually.

### Q3: Activity Retention

**Question:** How long should we keep thinking block activities in memory?

**Options:**

1. Keep all (simple, but memory intensive)
2. Keep last 20 blocks, lazy load older
3. Keep last 50 activities total, summarize rest

**Recommendation:** Start with keeping all, add pagination/lazy loading if performance issues arise.

### Q4: Export/Copy Functionality

**Question:** Should users be able to export/copy thinking block logs?

**Use Case:** Debugging, sharing with support, understanding agent behavior

**Recommendation:** Add in Phase 2 with "Copy logs" button on each block.

---

## Success Metrics

### User Experience

- Users can easily understand agent activity
- Reduced confusion about "what is the agent doing?"
- Improved troubleshooting for errors

### Technical

- No performance degradation with 100+ activities
- Smooth animations and transitions
- Responsive on mobile devices
- Accessible to screen readers

### Engagement

- Increased user confidence in agent capabilities
- Reduced support tickets about "hanging" agents
- Higher completion rates for complex tasks

---

## Future Enhancements (Post-MVP)

1. **Search/Filter:** Search within activity logs, filter by type
2. **Export Logs:** Download thinking blocks as JSON/text
3. **Sharing:** Share thinking block permalink for debugging
4. **Replay:** Step-by-step replay of agent thinking process
5. **Insights:** Analytics on common activity patterns
6. **Custom Themes:** User-selectable terminal themes (dark, light, matrix, etc.)

---

## References

- **Component:** `/apps/web/src/lib/components/agent/AgentChatModal.svelte`
- **API Endpoint:** `/apps/web/src/routes/api/agent/stream/+server.ts`
- **SSE Types:** `@buildos/shared-types` package
- **Style Guide:** `/apps/web/docs/technical/components/BUILDOS_STYLE_GUIDE.md`
- **Modal Guide:** `/apps/web/docs/technical/components/modals/README.md`

---

## Appendix A: Complete Code Example

See Phase 4 above for complete `ThinkingBlock.svelte` component code.

---

## Appendix B: Color Reference Chart

| Activity Type    | Icon | Light Mode Color   | Dark Mode Color    |
| ---------------- | ---- | ------------------ | ------------------ |
| Tool Call        | 🔧   | `text-blue-600`    | `text-blue-400`    |
| Tool Result      | ✓    | `text-green-600`   | `text-green-400`   |
| Plan Created     | 📋   | `text-purple-600`  | `text-purple-400`  |
| Plan Review      | ⚖️   | `text-amber-600`   | `text-amber-400`   |
| State Change     | 🟢   | `text-emerald-600` | `text-emerald-400` |
| Step Start       | ➜    | `text-orange-600`  | `text-orange-400`  |
| Step Complete    | ✓    | `text-green-600`   | `text-green-400`   |
| Executor Spawned | ⚙️   | `text-teal-600`    | `text-teal-400`    |
| Executor Result  | ✓    | `text-green-600`   | `text-green-400`   |
| Context Shift    | 🔄   | `text-yellow-600`  | `text-yellow-400`  |
| Template Request | 📄   | `text-pink-600`    | `text-pink-400`    |
| Template Status  | 📄   | `text-pink-600`    | `text-pink-400`    |
| Ontology Loaded  | 📚   | `text-indigo-600`  | `text-indigo-400`  |
| General          | ℹ️   | `text-slate-600`   | `text-slate-400`   |

---

**End of Specification**
