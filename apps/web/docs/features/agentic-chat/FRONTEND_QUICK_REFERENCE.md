<!-- apps/web/docs/features/agentic-chat/FRONTEND_QUICK_REFERENCE.md -->

# Agentic Chat Frontend - Quick Reference

## File Locations

| Component           | File Path                                                         | Lines | Purpose                                  |
| ------------------- | ----------------------------------------------------------------- | ----- | ---------------------------------------- |
| **Main Modal**      | `/apps/web/src/lib/components/agent/AgentChatModal.svelte`        | 1941  | Chat UI + message streaming + state mgmt |
| **Thinking Block**  | `/apps/web/src/lib/components/agent/ThinkingBlock.svelte`         | 299   | Agent activity log visualization         |
| **Focus Indicator** | `/apps/web/src/lib/components/agent/ProjectFocusIndicator.svelte` | 94    | Current focus display                    |
| **Focus Selector**  | `/apps/web/src/lib/components/agent/ProjectFocusSelector.svelte`  | 299   | Entity selection modal                   |
| **SSE Processor**   | `/apps/web/src/lib/utils/sse-processor.ts`                        | 290   | Stream parsing utility                   |
| **API Endpoint**    | `/apps/web/src/routes/api/agent/stream/+server.ts`                | 500+  | Backend SSE handler                      |

## State Variables Cheat Sheet

### Context & Conversation

```typescript
selectedContextType: ChatContextType | null           // global, project, task, etc.
selectedEntityId: string | undefined                  // Project/task/goal ID
selectedContextLabel: string | null                   // Display name
messages: UIMessage[]                                 // Chat history + thinking blocks
currentSession: ChatSession | null                    // Active chat session
inputValue: string                                    // User input buffer
```

### Streaming & Agent State

```typescript
isStreaming: boolean; // Disable UI during stream
currentStreamController: AbortController | null; // Stream cancellation
agentState: 'thinking' | 'executing_plan' | 'waiting_on_user' | null;
agentStateDetails: string | null; // Status message
currentActivity: string; // What agent is doing now
currentThinkingBlockId: string | null; // Track active thinking block
error: string | null; // Error message display
```

### Project Focus

```typescript
projectFocus: ProjectFocus | null; // { focusType, focusEntityId, focusEntityName, projectId, projectName }
showFocusSelector: boolean; // Modal open state
```

### Ontology Integration

```typescript
lastTurnContext: LastTurnContext | null; // Conversation continuity
ontologyLoaded: boolean; // Context loaded indicator
ontologySummary: string | null; // Summary of context
```

### Voice Input

```typescript
isVoiceRecording: boolean; // Currently recording
isVoiceInitializing: boolean; // Setting up microphone
isVoiceTranscribing: boolean; // Transcribing audio
voiceErrorMessage: string; // Voice errors
voiceRecordingDuration: number; // Seconds recorded
voiceSupportsLiveTranscript: boolean; // Live transcription available
```

## Event Handling Map

### SSE Message Types → Handler Actions

| Event Type                       | Key Updates                                           | User Sees                                      |
| -------------------------------- | ----------------------------------------------------- | ---------------------------------------------- |
| `session`                        | currentSession, selectedContextType, selectedEntityId | Session hydration                              |
| `agent_state`                    | agentState, agentStateDetails, currentActivity        | "Thinking...", "Executing plan...", etc.       |
| `ontology_loaded`                | ontologyLoaded, ontologySummary                       | Activity log entry: "Ontology context: ..."    |
| `last_turn_context`              | lastTurnContext                                       | (hidden - used for next turn)                  |
| `focus_active` / `focus_changed` | projectFocus                                          | Focus indicator updates                        |
| `plan_created`                   | currentPlan, agentState → 'executing_plan'            | Plan with steps in activity log                |
| `plan_ready_for_review`          | currentPlan, agentState → 'waiting_on_user'           | "Waiting for your approval"                    |
| `tool_call`                      | Add pending activity with tool name + target          | "Creating task: 'X'..." (spinning)             |
| `tool_result`                    | Update tool_call activity status                      | "Created task: 'X'" or "Failed to create task" |
| `text`                           | Append to assistant message                           | Streaming response text                        |
| `clarifying_questions`           | Create special clarification message                  | Numbered Q&A display                           |
| `context_shift`                  | Switch context + focus                                | "Context updated to..."                        |
| `template_creation_*`            | Track template lifecycle                              | Template creation progress                     |
| `done`                           | Finalize thinking block, set isStreaming=false        | Input re-enabled                               |
| `error`                          | error field                                           | Error message banner                           |

## Function Quick Reference

### Message Management

```typescript
createThinkingBlock(); // Create new activity log
addActivityToThinkingBlock(content, type, meta); // Add entry to log
updateThinkingBlockState(state, details); // Update header status
finalizeThinkingBlock(); // Mark complete when done
toggleThinkingBlockCollapse(blockId); // User collapse/expand

addOrUpdateAssistantMessage(content); // Append to assistant message
finalizeAssistantMessage(); // Done streaming text
updateActivityStatus(toolCallId, status); // Update tool pending→complete
```

### Scroll Management

```typescript
scrollToBottomIfNeeded(); // Auto-scroll if at bottom
isScrolledToBottom(container, threshold); // Check scroll position
handleScroll(); // Track manual scrolling
```

### Stream Control

```typescript
sendMessage()                                        // Send user message + start stream
handleSSEMessage(event: AgentSSEMessage)             // Dispatch SSE events
```

### Context Management

```typescript
handleContextSelect(event); // User picks context
changeContext(); // Reset conversation
openFocusSelector(); // Open project focus modal
handleFocusSelection(focus); // User selected entity
handleFocusClear(); // Reset to project-wide
```

## Key Derived Values ($derived)

```typescript
// Context display
contextDescriptor = CONTEXT_DESCRIPTORS[selectedContextType]
displayContextLabel = selectedContextLabel ?? contextDescriptor?.title
displayContextSubtitle = contextDescriptor?.subtitle

// Focus logic
defaultProjectFocus = buildProjectWideFocus(selectedEntityId, selectedContextLabel)
resolvedProjectFocus = projectFocus ?? defaultProjectFocus  // User override or default

// UI state
isSendDisabled = !selectedContextType || !inputValue.trim() || isStreaming || voiceRecording...
agentStateLabel = agentStateDetails ?? AGENT_STATE_MESSAGES[agentState]
isScrolledToBottom = scrollPosition + clientHeight < scrollHeight (100px threshold)
```

## Tool Formatting

### How Tool Messages Display

```typescript
// Pending: "Creating task: 'Email campaign'"
// Completed: "Created task: 'Email campaign'"
// Failed: "Failed to create task: 'Email campaign'"

// Custom formatters map tool names to actions + targets:
create_onto_task: (args) => ({ action: 'Creating task', target: args.name });
update_onto_plan: (args) => ({ action: 'Updating plan', target: args.name });
search_tasks: (args) => ({ action: 'Searching tasks', target: args.query });
```

## Activity Types & Icons

| Type               | Icon | Color       | Prefix   |
| ------------------ | ---- | ----------- | -------- |
| `tool_call`        | 🔧   | blue-400    | TOOL     |
| `plan_created`     | 📋   | purple-400  | PLAN     |
| `state_change`     | 🟢   | emerald-400 | STATE    |
| `step_start`       | ➜    | orange-400  | STEP     |
| `executor_spawned` | ⚙️   | teal-400    | EXEC     |
| `context_shift`    | 🔄   | yellow-400  | CONTEXT  |
| `template_status`  | 📄   | pink-400    | TEMPLATE |
| `ontology_loaded`  | 📚   | indigo-400  | ONTO     |
| `clarification`    | ❓   | blue-400    | CLARIFY  |

## ProjectFocus Types

```typescript
interface ProjectFocus {
	focusType: 'project-wide' | 'task' | 'goal' | 'plan' | 'document' | 'output' | 'milestone';
	focusEntityId: string | null; // null for project-wide
	focusEntityName: string | null; // null for project-wide
	projectId: string;
	projectName: string;
}
```

Focus icons: 📘 project-wide, 📝 task, 🎯 goal, 📋 plan, 📄 document, 📦 output, 🏁 milestone

## Common Patterns

### Immutable Array Update (Svelte 5 runes)

```typescript
// Always create new array reference for reactivity
messages = messages.map((msg) => (msg.id === targetId ? { ...msg, field: newValue } : msg));
```

### Thinking Block Activity Addition

```typescript
addActivityToThinkingBlock(content, activityType, metadata) {
  messages = messages.map((msg) => {
    if (msg.id === currentThinkingBlockId && msg.type === 'thinking_block') {
      return {
        ...msg,
        activities: [...msg.activities, newActivity]
      };
    }
    return msg;
  });
}
```

### SSE Stream with Timeout & Abort

```typescript
const streamController = new AbortController();
currentStreamController = streamController;

await SSEProcessor.processStream(response, callbacks, {
	timeout: 240000, // 4 minutes (inactivity-based)
	parseJSON: true,
	signal: streamController.signal
});
```

### Derived Project Focus

```typescript
// Default from context
const defaultProjectFocus = $derived.by(() => {
	if (selectedContextType === 'project' && selectedEntityId) {
		return buildProjectWideFocus(selectedEntityId, selectedContextLabel);
	}
	return null;
});

// Override with user selection or use default
const resolvedProjectFocus = $derived.by(() => {
	if (selectedContextType !== 'project') return null;
	return projectFocus ?? defaultProjectFocus;
});
```

## Configuration Constants

```typescript
// Context type labels & descriptions
CONTEXT_DESCRIPTORS: Record<ChatContextType, { title: string; subtitle: string }> = {
	global: { title: 'Global conversation', subtitle: '...' },
	project: { title: 'Project workspace', subtitle: '...' }
	// ...
};

// Context badge color classes
CONTEXT_BADGE_CLASSES: Record<ChatContextType, string> = {
	global: 'bg-blue-500/10 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300',
	project: 'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300'
	// ...
};

// Tool formatters for human-readable messages
TOOL_DISPLAY_FORMATTERS: Record<string, (args: any) => { action: string; target?: string }> = {
	create_onto_task: (args) => ({ action: 'Creating task', target: args.name })
	// ...
};

// Agent state messages
AGENT_STATE_MESSAGES = {
	thinking: 'Agent is thinking...',
	executing_plan: 'Agent is executing...',
	waiting_on_user: 'Waiting on your direction...'
};
```

## Keyboard Shortcuts

- **Enter**: Send message (if not shift)
- **Shift + Enter**: New line in textarea
- **Escape**: Close ProjectFocusSelector modal

## CSS Classes for Styling

```scss
.agent-chat-scroll {
} // Messages container (custom scrollbar)
.thinking-block {
} // Thinking block container
.thinking-log {
} // Activity log (custom scrollbar)
.entity-list-scroll {
} // ProjectFocusSelector entity list
```

## Voice Input Integration

```typescript
// TextareaWithVoice component handles speech-to-text
// Bindings automatically update inputValue on transcription
// Display recording duration: formatDuration(voiceRecordingDuration)
// Disable during streaming: voiceBlocked={isStreaming}
```
