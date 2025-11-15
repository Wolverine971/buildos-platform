# Thinking Block Compact Enhancement Spec

## Problem Statement

Current thinking block display is too verbose and doesn't provide meaningful context:

**Current Display:**

```
21:49:38 [TOOL] 🔧 Using tool: create_onto_task
21:49:40 [TOOL] 🔧 Using tool: create_onto_task
21:49:52 [TOOL] ✓ Tool execution completed
21:49:53 [TOOL] ✓ Tool execution completed
```

**Issues:**

- Generic messages don't show WHAT is being created
- Tool calls disconnected from results
- No progress indication
- Too much vertical space
- Repetitive, not informative

## Desired Display

**Improved Display:**

```
📚 Ontology context loaded for project
🟢 Analyzing request...
🔧 Creating task: "Build landing page" 🔄
🔧 Creating task: "Design mockups" 🔄
✓ Created task: "Build landing page"
✓ Created task: "Design mockups"
```

**Benefits:**

- Shows WHAT is happening (task names, entities)
- Clear progress indicators (🔄 in progress, ✓ complete)
- Compact, single-line format
- Updates in place (optional enhancement)

## Solution Architecture

### 1. Activity Status Tracking

**Add status field to ActivityEntry:**

```typescript
interface ActivityEntry {
	id: string;
	content: string;
	timestamp: Date;
	activityType: ActivityType;
	status?: 'pending' | 'completed' | 'failed'; // NEW
	toolCallId?: string; // NEW - for matching tool calls to results
	metadata?: Record<string, any>;
}
```

**Status Meanings:**

- `pending` - Tool call initiated, show loading spinner 🔄
- `completed` - Tool result received, show checkmark ✓
- `failed` - Tool failed, show error icon ❌
- `undefined` - Non-tool activities (state changes, etc.)

### 2. Tool Argument Parsing

**Create tool-specific formatters:**

```typescript
const TOOL_DISPLAY_FORMATTERS: Record<string, (args: any) => { action: string; target: string }> = {
	create_onto_task: (args) => ({
		action: 'Creating task',
		target: args.name || args.task_name || 'Unnamed task'
	}),
	update_onto_task: (args) => ({
		action: 'Updating task',
		target: args.name || args.task_name || 'task'
	}),
	delete_onto_task: (args) => ({
		action: 'Deleting task',
		target: args.name || args.task_name || 'task'
	}),
	create_onto_plan: (args) => ({
		action: 'Creating plan',
		target: args.name || 'plan'
	}),
	fetch_project_data: (args) => ({
		action: 'Fetching project',
		target: args.project_name || args.project_id || 'data'
	}),
	search_tasks: (args) => ({
		action: 'Searching tasks',
		target: args.query || 'all tasks'
	}),
	get_calendar_events: (args) => ({
		action: 'Loading calendar',
		target: args.date || 'events'
	})
};

function formatToolMessage(
	toolName: string,
	argsJson: string,
	status: 'pending' | 'completed' | 'failed'
): string {
	const formatter = TOOL_DISPLAY_FORMATTERS[toolName];

	if (!formatter) {
		// Fallback for unknown tools
		return status === 'pending' ? `Using tool: ${toolName}` : `Tool ${toolName} ${status}`;
	}

	try {
		const args = typeof argsJson === 'string' ? JSON.parse(argsJson) : argsJson;
		const { action, target } = formatter(args);

		if (status === 'pending') {
			return `${action}: "${target}"`;
		} else if (status === 'completed') {
			return `${action.replace('ing', 'ed')}: "${target}"`; // Creating → Created
		} else {
			return `Failed to ${action.toLowerCase()}: "${target}"`;
		}
	} catch (e) {
		console.error('Error parsing tool arguments:', e);
		return `Using tool: ${toolName}`;
	}
}
```

### 3. Tool Call/Result Matching

**Current Flow:**

```
SSE Event: tool_call → Add "Using tool: X"
SSE Event: tool_result → Add "Tool completed"
```

**New Flow:**

```
SSE Event: tool_call → Add activity with status='pending', toolCallId
SSE Event: tool_result → Find matching activity, update status='completed'
```

**Implementation:**

```typescript
// When tool_call arrives
case 'tool_call':
  const toolName = event.tool_call?.function?.name || 'unknown';
  const toolCallId = event.tool_call?.id;
  const args = event.tool_call?.function?.arguments;

  const displayMessage = formatToolMessage(toolName, args, 'pending');

  addActivityToThinkingBlock(
    displayMessage,
    'tool_call',
    {
      toolName,
      toolCallId, // Store for matching
      status: 'pending',
      arguments: args
    }
  );
  break;

// When tool_result arrives
case 'tool_result':
  const resultToolCallId = event.tool_call_id;
  const success = !event.error;

  if (resultToolCallId) {
    // Update the matching activity
    updateActivityStatus(resultToolCallId, success ? 'completed' : 'failed');
  } else {
    // Fallback: no matching ID
    addActivityToThinkingBlock(
      success ? 'Tool execution completed' : 'Tool execution failed',
      'tool_result',
      { status: success ? 'completed' : 'failed' }
    );
  }
  break;
```

### 4. Update Activity Status Function

**New function to update existing activities:**

```typescript
/**
 * Updates the status of an activity by tool call ID
 * Also updates the content to show completion (Creating → Created)
 */
function updateActivityStatus(toolCallId: string, status: 'completed' | 'failed') {
	if (!currentThinkingBlockId) return;

	messages = messages.map((msg) => {
		if (msg.id === currentThinkingBlockId && msg.type === 'thinking_block') {
			const block = msg as ThinkingBlockMessage;
			return {
				...block,
				activities: block.activities.map((activity) => {
					if (
						activity.metadata?.toolCallId === toolCallId &&
						activity.activityType === 'tool_call'
					) {
						// Update content from "Creating task: X" to "Created task: X"
						const toolName = activity.metadata.toolName;
						const args = activity.metadata.arguments;
						const newContent = formatToolMessage(toolName, args, status);

						return {
							...activity,
							content: newContent,
							metadata: {
								...activity.metadata,
								status
							}
						};
					}
					return activity;
				})
			};
		}
		return msg;
	});
}
```

### 5. Compact UI Display

**Current ThinkingBlock layout:**

```svelte
<div class="flex gap-2 leading-relaxed {style.color}">
	<span class="w-20 shrink-0">{formatTime(timestamp)}</span>
	<span class="w-16 shrink-0">[{prefix}]</span>
	<span class="shrink-0">{icon}</span>
	<span class="flex-1">{content}</span>
</div>
```

**New compact layout:**

```svelte
<div class="flex items-center gap-2 py-0.5 leading-tight">
	<!-- Icon based on activity type -->
	<span class="shrink-0 {style.color}">{icon}</span>

	<!-- Content -->
	<span class="flex-1 text-slate-300 dark:text-slate-200">{content}</span>

	<!-- Status indicator (only for tool calls) -->
	{#if activity.metadata?.status === 'pending'}
		<Loader class="h-3 w-3 animate-spin text-slate-400" />
	{:else if activity.metadata?.status === 'completed'}
		<Check class="h-3 w-3 text-green-400" />
	{:else if activity.metadata?.status === 'failed'}
		<X class="h-3 w-3 text-red-400" />
	{/if}
</div>
```

**Spacing changes:**

- Remove timestamp column (save horizontal space)
- Remove `[TYPE]` prefix (redundant with icon)
- Reduce `py-1` to `py-0.5` (tighter vertical spacing)
- Add inline status icons on the right

### 6. Visual Examples

**Before:**

```
21:49:30 [ONTO] 📚 Ontology context: Ontology context loaded for project
21:49:30 [STATE] 🟢 Analyzing request...
21:49:38 [TOOL] 🔧 Using tool: create_onto_task
21:49:40 [TOOL] 🔧 Using tool: create_onto_task
21:49:42 [TOOL] 🔧 Using tool: create_onto_task
21:49:52 [TOOL] ✓ Tool execution completed
21:49:53 [TOOL] ✓ Tool execution completed
21:49:54 [TOOL] ✓ Tool execution completed
```

**After (with in-place updates):**

```
📚 Ontology context loaded for project
🟢 Analyzing request...
✓ Created task: "Build landing page"
✓ Created task: "Design mockups"
✓ Created task: "Implement auth"
```

**After (without in-place updates, showing progression):**

```
📚 Ontology context loaded for project
🟢 Analyzing request...
🔧 Creating task: "Build landing page" 🔄
🔧 Creating task: "Design mockups" 🔄
🔧 Creating task: "Implement auth" 🔄
✓ Created task: "Build landing page"
✓ Created task: "Design mockups"
✓ Created task: "Implement auth"
```

## Implementation Phases

### Phase 1: Update Data Structures ✅

- [x] Add `status` field to ActivityEntry
- [x] Add `toolCallId` field to ActivityEntry

### Phase 2: Tool Formatters

- [ ] Create TOOL_DISPLAY_FORMATTERS mapping
- [ ] Implement formatToolMessage function
- [ ] Add formatters for common tools (create_onto_task, update_onto_task, etc.)

### Phase 3: Activity Status Updates

- [ ] Implement updateActivityStatus function
- [ ] Update handleSSEMessage for tool_call to parse args
- [ ] Update handleSSEMessage for tool_result to match by toolCallId

### Phase 4: Compact UI

- [ ] Remove timestamp column
- [ ] Remove [TYPE] prefix
- [ ] Add inline status indicators (Loader, Check, X icons)
- [ ] Reduce spacing (py-1 → py-0.5)
- [ ] Import Loader, Check, X from lucide-svelte

### Phase 5: Testing

- [ ] Test with multiple tool calls
- [ ] Verify status updates work correctly
- [ ] Check display for failed tools
- [ ] Test with tools that don't have formatters

## Tool Coverage Plan

**High Priority Tools (implement first):**

- ✅ create_onto_task
- ✅ update_onto_task
- ✅ delete_onto_task
- ✅ create_onto_plan
- ✅ fetch_project_data

**Medium Priority:**

- search_tasks
- get_calendar_events
- create_calendar_event
- update_calendar_event

**Low Priority:**

- Generic fallback handles all other tools

## Edge Cases

1. **Tool result without matching call**
    - Fallback: Show generic "Tool completed" message
    - Log warning in dev mode

2. **Tool with no arguments**
    - Use tool name as target: "Creating task: (no name provided)"

3. **Tool that fails**
    - Update status to 'failed'
    - Show error icon ❌
    - Content: "Failed to create task: X"

4. **Duplicate tool call IDs** (shouldn't happen)
    - Update first matching activity
    - Log warning in dev mode

5. **SSE events out of order**
    - If tool_result arrives before tool_call, add as standalone
    - System should handle this gracefully

## Future Enhancements

1. **In-Place Updates**
    - Remove pending activity when completed
    - Only show final result
    - Requires removing activities from array (more complex)

2. **Grouping**
    - Group multiple similar activities: "Created 6 tasks ✓"
    - Expandable to see individual task names

3. **Progress Bar**
    - For batch operations: "Creating tasks... 3/6 complete"
    - Show progress percentage

4. **Timestamps on Hover**
    - Hide timestamps by default
    - Show on hover for debugging

## Success Criteria

✅ **Display is compact**

- Max 1 line per activity (no multi-line wrapping)
- Reduced vertical spacing

✅ **Display is informative**

- Shows entity names from tool arguments
- Clear action being performed

✅ **Progress is clear**

- Loading spinner for in-progress
- Checkmark for completed
- Error icon for failed

✅ **No duplicates**

- Tool calls and results are paired
- Only 1 line per operation (if in-place updates enabled)

---

**Status:** Ready for implementation
**Priority:** High
**Effort:** Medium (4-6 hours)
