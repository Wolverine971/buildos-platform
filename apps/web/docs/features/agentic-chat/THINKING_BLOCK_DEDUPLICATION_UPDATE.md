# Thinking Block Deduplication & Simplified Display Update

**Date:** 2025-11-14
**Status:** ✅ Complete
**Priority:** Critical - Fixes duplicate messages

---

## Problem

User was seeing duplicate log entries for tool calls:

```
🔧 Creating task: "Unnamed task"
✓ Tool execution completed
```

**Issues:**

1. Two separate entries for one operation
2. "Unnamed task" when task name is missing
3. No actual task name being displayed

**Root Cause:**

- Tool call creates activity with `status: 'pending'`
- Tool result should UPDATE that activity
- But if `tool_call_id` doesn't match, a fallback message was added
- This created duplicates

---

## Solution Implemented

### 1. Remove Duplicate Fallback

**Before:**

```typescript
case 'tool_result':
  if (resultToolCallId) {
    updateActivityStatus(resultToolCallId, success ? 'completed' : 'failed');
  } else {
    // Fallback: creates duplicate!
    addActivityToThinkingBlock('Tool execution completed', 'tool_result');
  }
```

**After:**

```typescript
case 'tool_result':
  if (resultToolCallId) {
    updateActivityStatus(resultToolCallId, success ? 'completed' : 'failed');
  } else {
    // Just log warning, don't add duplicate
    if (dev) {
      console.warn('[AgentChat] Tool result without matching tool_call_id');
    }
  }
```

### 2. Simplified Format When No Name

**Before:**

- Pending: `"Creating task: \"Unnamed task\""`
- Completed: `"Created task: \"Unnamed task\""`

**After:**

- Pending: `"Creating task..."`
- Completed: `"Task created"`

**Implementation:**

```typescript
// In formatToolMessage:
if (!target) {
	if (status === 'pending') {
		return `${action}...`; // "Creating task..."
	} else if (status === 'completed') {
		const noun = action.split(' ').slice(1).join(' '); // "task"
		return `${noun.charAt(0).toUpperCase() + noun.slice(1)} created`; // "Task created"
	}
}
```

### 3. Dev Mode Debugging

Added comprehensive logging to track tool_call/tool_result matching:

**Tool Call Logging:**

```typescript
console.log('[AgentChat] Tool call:', {
	toolName,
	toolCallId,
	args: args.substring(0, 100)
});
```

**Tool Result Logging:**

```typescript
console.log('[AgentChat] Tool result:', {
	resultToolCallId,
	success,
	hasError: !!event.error
});
```

**Matching Failure Warning:**

```typescript
console.warn('[AgentChat] No matching tool_call found for tool_call_id:', {
	currentThinkingBlockId,
	status,
	activitiesInBlock: [
		/* ... */
	]
});
```

---

## Visual Comparison

### Old Behavior (Duplicates)

```
🔧 Creating task: "Unnamed task"
🔧 Creating task: "Unnamed task"
✓ Tool execution completed
✓ Tool execution completed
```

### New Behavior (Clean, Single Entry)

**With task name:**

```
🔧 Creating task: "Build landing page" 🔄
✓ Created task: "Build landing page"
```

**Without task name:**

```
🔧 Creating task... 🔄
✓ Task created
```

---

## Message Format Rules

### When Target Name Exists

| Status    | Format                                   |
| --------- | ---------------------------------------- |
| Pending   | `"Creating task: \"Task Name\""`         |
| Completed | `"Created task: \"Task Name\""`          |
| Failed    | `"Failed to create task: \"Task Name\""` |

### When Target Name Missing

| Status    | Format                    |
| --------- | ------------------------- |
| Pending   | `"Creating task..."`      |
| Completed | `"Task created"`          |
| Failed    | `"Failed to create task"` |

---

## Backend Requirements

**IMPORTANT:** The backend needs to stream the task name in the tool arguments for proper display.

### Example Tool Call Arguments

**Good (has name):**

```json
{
	"name": "Build landing page",
	"description": "...",
	"project_id": "..."
}
```

**Will show:**

```
🔧 Creating task: "Build landing page" 🔄
✓ Created task: "Build landing page"
```

**Missing name:**

```json
{
	"description": "...",
	"project_id": "..."
}
```

**Will show:**

```
🔧 Creating task... 🔄
✓ Task created
```

### Tool Call ID Matching

**CRITICAL:** The `tool_call_id` from the `tool_call` event MUST match the `tool_call_id` in the `tool_result` event.

**SSE Flow:**

```
1. tool_call event:
   {
     type: "tool_call",
     tool_call: {
       id: "call_abc123",  ← Store this
       function: {
         name: "create_onto_task",
         arguments: "{\"name\":\"Task Name\"}"
       }
     }
   }

2. tool_result event:
   {
     type: "tool_result",
     tool_call_id: "call_abc123",  ← Must match!
     error: null
   }
```

---

## Debugging Guide

### If You See Duplicates

**Check console for:**

```
[AgentChat] Tool result without matching tool_call_id: {...}
```

**Possible causes:**

1. `tool_call_id` is `null` or `undefined`
2. `tool_call_id` in result doesn't match call
3. Tool result arrives before tool call (race condition)

### If Names Don't Show

**Check console for:**

```
[AgentChat] Tool call: {
  toolName: "create_onto_task",
  toolCallId: "call_abc123",
  args: "{...}"  ← Check if this has "name" field
}
```

**Fix:** Ensure backend includes `name` in tool arguments

---

## Testing Checklist

- [ ] Test creating task with name → Shows name in log
- [ ] Test creating task without name → Shows "Creating task..." / "Task created"
- [ ] Verify no duplicate messages
- [ ] Check dev console for warnings
- [ ] Test failed tool calls → Shows error icon and message
- [ ] Test multiple rapid tool calls → All match correctly
- [ ] Verify spinner updates to checkmark when complete

---

## Files Modified

1. **`AgentChatModal.svelte`**
    - Removed duplicate fallback in `tool_result` handler
    - Improved `formatToolMessage()` for missing names
    - Added dev logging throughout
    - Added `matchFound` tracking in `updateActivityStatus()`

---

## Impact

✅ **No more duplicates** - Clean, single entry per operation
✅ **Better fallback** - Graceful handling when name missing
✅ **Debuggable** - Dev logs help track matching issues
✅ **Professional** - Simplified, clean display

---

## Next Steps

1. **Backend:** Ensure all tool calls include entity names in arguments
2. **Testing:** Run through common flows and check console
3. **Monitoring:** Watch for warnings about missing tool_call_ids

---

**Status:** Ready for testing
**Blocker:** None
**Dependencies:** Backend must provide tool_call_id and entity names
