# Agentic Chat Frontend Components - Complete Exploration

## Overview

This document provides a comprehensive exploration of the agentic chat streaming API frontend components, their state management, and user interaction flows. The system implements a multi-agent (Planner + Executor) architecture with real-time SSE streaming, project focus management, and rich agent activity visualization.

---

## 1. Main Chat Modal Component

### File Location

`/Users/annawayne/buildos-platform/apps/web/src/lib/components/agent/AgentChatModal.svelte`

### Purpose

Primary UI container for multi-agent chat interface showing:

- Chat message stream (user, assistant, thinking blocks)
- Project/task context selection
- Real-time agent activity tracking
- Plan creation and review workflows
- Voice input support

### Key Features

#### Context Selection

- **Types**: `global`, `project`, `task`, `calendar`, `project_create`, `project_audit`, `project_forecast`, `task_update`, `daily_brief_update`
- **Visual Indicators**: Context-specific badge colors with semantic meanings
- **Context Switching**: "Change focus" button to reset conversation and pick new context

#### Component Integration

```
AgentChatModal
├── ContextSelectionScreen (initial context picker)
├── ProjectFocusIndicator (shows current focus within project)
├── ProjectFocusSelector (modal to choose specific tasks/goals/plans)
└── ThinkingBlock (visualizes agent activity log)
```

### State Management (Svelte 5 Runes)

```typescript
// Context selection state
let selectedContextType = $state<ChatContextType | null>(null);
let selectedEntityId = $state<string | undefined>(undefined);
let selectedContextLabel = $state<string | null>(null);
let projectFocus = $state<ProjectFocus | null>(null);
let showFocusSelector = $state(false);

// Conversation state
let messages = $state<UIMessage[]>([]);
let currentSession = $state<ChatSession | null>(null);
let isStreaming = $state(false);
let currentStreamController: AbortController | null = null;
let inputValue = $state('');
let error = $state<string | null>(null);

// Agent state tracking
let agentState = $state<AgentLoopState | null>(null); // thinking | executing_plan | waiting_on_user
let agentStateDetails = $state<string | null>(null);
let currentActivity = $state<string>('');
let currentThinkingBlockId = $state<string | null>(null);

// Ontology integration
let lastTurnContext = $state<LastTurnContext | null>(null);
let ontologyLoaded = $state(false);
let ontologySummary = $state<string | null>(null);

// Voice input state
let isVoiceRecording = $state(false);
let isVoiceInitializing = $state(false);
let isVoiceTranscribing = $state(false);
let voiceErrorMessage = $state('');
let voiceSupportsLiveTranscript = $state(false);
let voiceRecordingDuration = $state(0);
```

### Message Types

#### UIMessage Interface

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
		| 'thinking_block'
		| 'plan'
		| 'step'
		| 'executor'
		| 'clarification'
		| 'activity';
	data?: any;
	timestamp: Date;
	tool_calls?: any;
	tool_call_id?: string;
}
```

#### ThinkingBlockMessage

```typescript
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
	status?: 'pending' | 'completed' | 'failed';
	toolCallId?: string;
	metadata?: Record<string, any>;
}
```

---

## 2. SSE Stream Initiation & Communication Flow

### How Chat Streaming is Initiated

#### sendMessage() Function (Line 724-872)

**Trigger**: User enters message + presses Send or Enter

**Flow**:

```
1. Validate message & context type
   ↓
2. Create user message (add to messages array)
   ↓
3. Create thinking block (agent activity log)
   ↓
4. POST to /api/agent/stream with request body
   ↓
5. SSEProcessor.processStream() consumes Response.body
   ↓
6. handleSSEMessage() dispatches individual events
   ↓
7. Update UI state based on event type
```

### API Request Structure

```typescript
// Request body sent to /api/agent/stream
{
  message: string;                              // User input text
  session_id?: string;                          // Existing session ID
  context_type: ChatContextType;                // global, project, task, calendar, etc.
  entity_id?: string;                           // Project/task/goal ID
  conversation_history: Partial<ChatMessage>[]; // Recent messages for context compression
  ontologyEntityType?: 'task' | 'plan' | 'goal'; // Ontology context loading hint
  projectFocus?: ProjectFocus | null;           // Current project focus selection
}
```

### AbortController Management

```typescript
// Create new controller for each stream
const streamController = new AbortController();
currentStreamController = streamController;

// Callbacks contain early error handling
const callbacks: StreamCallbacks = {
	onProgress: (data: any) => handleSSEMessage(data as AgentSSEMessage),
	onError: (err) => {
		console.error('SSE error:', err);
		error = typeof err === 'string' ? err : 'Connection error occurred while streaming';
		isStreaming = false;
	},
	onComplete: () => {
		isStreaming = false;
		currentStreamController = null;
	}
};

// Process stream with 4-minute timeout for complex conversations
await SSEProcessor.processStream(response, callbacks, {
	timeout: 240000,
	parseJSON: true,
	signal: streamController.signal
});
```

---

## 3. SSE Message Processing

### SSEProcessor Utility (`sse-processor.ts`)

**Purpose**: Centralized SSE stream parsing and buffering logic

**Key Methods**:

- `processStream()` - Main entry point, handles streaming, buffering, JSON parsing
- `processStreamChunks()` - Chunk-level processing with buffer management
- `handleParsedEvent()` - Event type routing based on data.type field

**Features**:

- Line-by-line SSE event parsing
- Automatic JSON parsing with error handling
- Timeout support (inactivity-based, not wall-clock)
- AbortSignal integration for cancellation
- Custom error callbacks for graceful degradation

### SSE Message Types & Handling

The `handleSSEMessage()` function (line 874-1298) dispatches on message type:

#### Session Events

```typescript
case 'session':
  // Hydrate chat session and metadata
  if (event.session) {
    currentSession = event.session;
    // Auto-set context from session if not already selected
    selectedContextType = event.session.context_type;
    selectedEntityId = event.session.entity_id;

    // Load project focus from session metadata
    if (normalizedSessionContext === 'project' && event.session.entity_id) {
      projectFocus = buildProjectWideFocus(...);
    }
  }
```

#### Ontology Context Loading

```typescript
case 'ontology_loaded':
  ontologyLoaded = true;
  ontologySummary = event.summary;
  addActivityToThinkingBlock('Ontology context: ' + summary, 'ontology_loaded');
```

#### Last Turn Context

```typescript
case 'last_turn_context':
  // Store context for next message (conversation continuity)
  lastTurnContext = event.context;
```

#### Project Focus Management

```typescript
case 'focus_active':
  projectFocus = event.focus;

case 'focus_changed':
  projectFocus = event.focus;
  logFocusActivity('Focus changed', event.focus);
```

#### Agent State Updates

```typescript
case 'agent_state':
  const state = event.state; // 'thinking' | 'executing_plan' | 'waiting_on_user'
  agentState = state;
  agentStateDetails = event.details ?? null;
  updateThinkingBlockState(state, event.details);

  // Update activity indicator
  switch (state) {
    case 'waiting_on_user':
      currentActivity = 'Waiting on your direction...';
      break;
    case 'executing_plan':
      currentActivity = event.details ?? 'Executing plan...';
      break;
    case 'thinking':
      currentActivity = event.details ?? 'Analyzing request...';
  }
```

#### Plan Creation

```typescript
case 'plan_created':
  currentPlan = event.plan;
  currentActivity = `Executing plan with ${event.plan?.steps?.length || 0} steps...`;
  agentState = 'executing_plan';
  addActivityToThinkingBlock(`Plan created with ${step_count} steps`, 'plan_created', {...});

case 'plan_ready_for_review':
  currentPlan = event.plan;
  // Show summary, set state to waiting_on_user
  agentState = 'waiting_on_user';
  agentStateDetails = summary;
```

#### Tool Execution Tracking

```typescript
case 'tool_call':
  const toolName = event.tool_call?.function?.name;
  const toolCallId = event.tool_call?.id;
  const args = event.tool_call?.function?.arguments;

  // Format human-readable message from tool + arguments
  const displayMessage = formatToolMessage(toolName, args, 'pending');

  // Add to thinking block with pending status
  messages = messages.map((msg) => {
    if (msg.id === currentThinkingBlockId && msg.type === 'thinking_block') {
      return {
        ...block,
        activities: [...block.activities, {
          id: crypto.randomUUID(),
          content: displayMessage,
          activityType: 'tool_call',
          status: 'pending',
          toolCallId,
          metadata: { toolName, arguments: args, ... }
        }]
      };
    }
    return msg;
  });

case 'tool_result':
  // Update matching tool_call activity with completion status
  updateActivityStatus(toolCallId, success ? 'completed' : 'failed');
```

#### Text Streaming

```typescript
case 'text':
  // Stream assistant response content character-by-character
  if (event.content) {
    addOrUpdateAssistantMessage(event.content);
  }
```

#### Clarifying Questions

```typescript
case 'clarifying_questions':
  // Create special clarification message with numbered questions
  const normalizedQuestions = Array.isArray(event.questions)
    ? event.questions.filter(q => typeof q === 'string' && q.trim())
    : [];

  if (normalizedQuestions.length > 0) {
    addClarifyingQuestionsMessage(normalizedQuestions);
    agentState = 'waiting_on_user';
    addActivityToThinkingBlock(`Clarifying questions requested (${count})`, 'clarification');
  }
```

#### Context Shifts

```typescript
case 'context_shift':
  // Agent requesting switch to different context
  const { new_context, entity_id, entity_name } = event.context_shift;
  selectedContextType = normalizeContextType(new_context);
  selectedEntityId = entity_id;
  selectedContextLabel = entity_name;

  // Update project focus if shifting to project context
  if (normalizedContext === 'project' && entity_id) {
    projectFocus = buildProjectWideFocus(entity_id, entity_name);
  }
```

#### Template Creation Lifecycle

```typescript
case 'template_creation_request':
  addActivityToThinkingBlock(
    `Escalating template creation (${request.realm_suggestion})...`,
    'template_request'
  );

case 'template_creation_status':
  addActivityToThinkingBlock(
    `Template creation status: ${event.status.replace(/_/g, ' ')}`,
    'template_status'
  );

case 'template_created':
  addActivityToThinkingBlock(
    `Template ready: ${template.name} (${template.type_key})`,
    'template_status'
  );

case 'template_creation_failed':
  addActivityToThinkingBlock(
    `Template creation failed: ${error}`,
    'template_status'
  );
  error = event.error || 'Template creation failed...';
```

#### Completion

```typescript
case 'done':
  // Stream complete
  currentActivity = '';
  agentState = null;
  agentStateDetails = null;
  finalizeAssistantMessage();
  finalizeThinkingBlock();
  isStreaming = false;

case 'error':
  error = event.error || 'An error occurred';
  isStreaming = false;
  agentState = null;
```

---

## 4. Project Focus Feature

### ProjectFocusIndicator Component

**File**: `/Users/annawayne/buildos-platform/apps/web/src/lib/components/agent/ProjectFocusIndicator.svelte`

**Purpose**: Display current project focus with entity-specific details

**Features**:

- Shows focus type icon (📘 project-wide, 📝 task, 🎯 goal, etc.)
- Displays focus entity name with context
- "Change" and "Clear" buttons to modify focus
- Responsive gradient background with dark mode support

**Props**:

```typescript
interface Props {
	focus: ProjectFocus | null;
	onChangeFocus?: () => void; // Opens ProjectFocusSelector
	onClearFocus?: () => void; // Resets to project-wide
}
```

**Focus Type Icons**:

- `project-wide`: 📘 (blue)
- `task`: 📝 (orange)
- `goal`: 🎯 (orange)
- `plan`: 📋 (purple)
- `document`: 📄 (pink)
- `output`: 📦 (pink)
- `milestone`: 🏁 (orange)

### ProjectFocusSelector Modal

**File**: `/Users/annawayne/buildos-platform/apps/web/src/lib/components/agent/ProjectFocusSelector.svelte`

**Purpose**: Browse and select specific entities to focus on within a project

**Flow**:

```
1. User clicks ProjectFocusIndicator "Change" button
2. Modal opens with focus type filter pills (Task, Goal, Plan, Document, Output, Milestone)
3. User selects focus type → loads entities of that type from /api/onto/projects/{projectId}/entities
4. User can search within entity type
5. User clicks entity → fires onSelect() callback with ProjectFocus object
6. Modal closes, focus indicator updates
```

**State Management**:

```typescript
let selectedType = $state<FocusEntityType>('task');
let entities = $state<FocusEntitySummary[]>([]);
let loading = $state(false);
let errorMessage = $state<string | null>(null);
let searchTerm = $state('');
let appliedSearch = $state('');
let abortController: AbortController | null = null;
```

**Effect-Driven Loading**:

```typescript
$effect(() => {
	if (!isOpen || !projectId) return;
	loadEntities(selectedType, appliedSearch);
});
```

**Race Condition Prevention**:

- Aborts previous fetch if user changes tab/search before response arrives
- Handles AbortError gracefully

**Entity Selection**:

```typescript
// Returns ProjectFocus object with entity details
onSelect({
	focusType: selectedType,
	focusEntityId: entity.id,
	focusEntityName: entity.name,
	projectId,
	projectName
});
```

### ProjectFocus Type Definition

```typescript
interface ProjectFocus {
	focusType: 'project-wide' | 'task' | 'goal' | 'plan' | 'document' | 'output' | 'milestone';
	focusEntityId: string | null; // null for project-wide
	focusEntityName: string | null; // null for project-wide
	projectId: string;
	projectName: string;
}
```

### Focus Management in Modal

```typescript
// Derived focus from context selection
const defaultProjectFocus = $derived.by<ProjectFocus | null>(() => {
	if (selectedContextType === 'project' && selectedEntityId) {
		return buildProjectWideFocus(selectedEntityId, selectedContextLabel);
	}
	return null;
});

// Override with user selection or use default
const resolvedProjectFocus = $derived.by<ProjectFocus | null>(() => {
	if (selectedContextType !== 'project') {
		return null;
	}
	return projectFocus ?? defaultProjectFocus;
});

// Pass focus with API request
const response = await fetch('/api/agent/stream', {
	body: JSON.stringify({
		...otherFields,
		projectFocus: resolvedProjectFocus
	})
});
```

---

## 5. ThinkingBlock Component

### File Location

`/Users/annawayne/buildos-platform/apps/web/src/lib/components/agent/ThinkingBlock.svelte`

### Purpose

Visualizes agent's internal reasoning and activity log in a collapsible terminal-style interface

### Features

- **Collapsible Header**: Shows agent state, activity count, status label
- **Activity Log**: Terminal-style, monospace timeline of agent actions
- **Status Indicators**: Spinner for pending, checkmark for completed, X for failed
- **Plan Step Expansion**: Shows numbered steps from plan_created activities
- **Dark Mode**: Full dark theme support with custom scrollbar styling

### Activity Types & Styling

```typescript
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
	clarification: { icon: '❓', color: 'text-blue-400', prefix: 'CLARIFY' },
	general: { icon: 'ℹ️', color: 'text-slate-400', prefix: 'INFO' }
};
```

### Thinking Block Lifecycle

```typescript
// 1. Created when user sends message
createThinkingBlock(): string {
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

// 2. Activities added throughout streaming
addActivityToThinkingBlock(
  content: string,
  activityType: ActivityType,
  metadata?: Record<string, any>
) {
  messages = messages.map((msg) => {
    if (msg.id === currentThinkingBlockId && msg.type === 'thinking_block') {
      const block = msg as ThinkingBlockMessage;
      return {
        ...block,
        activities: [...block.activities, activity]
      };
    }
    return msg;
  });
}

// 3. Agent state updated during streaming
updateThinkingBlockState(state: AgentLoopState, details?: string) {
  messages = messages.map((msg) => {
    if (msg.id === currentThinkingBlockId) {
      return {
        ...msg,
        agentState: state,
        content: details || AGENT_STATE_MESSAGES[state]
      };
    }
    return msg;
  });
}

// 4. Finalized when stream completes
finalizeThinkingBlock() {
  messages = messages.map((msg) => {
    if (msg.id === currentThinkingBlockId) {
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

### Activity Status Updates

```typescript
// Tool status transitions: pending → completed/failed
updateActivityStatus(toolCallId: string, status: 'completed' | 'failed') {
  messages = messages.map((msg) => {
    if (msg.id === currentThinkingBlockId) {
      const block = msg as ThinkingBlockMessage;
      return {
        ...block,
        activities: block.activities.map((activity) => {
          if (activity.toolCallId === toolCallId && activity.activityType === 'tool_call') {
            // Convert "Creating task: X" → "Created task: X"
            const newContent = formatToolMessage(toolName, args, status);
            return {
              ...activity,
              content: newContent,
              status,
              metadata: { ...activity.metadata, status }
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

---

## 6. Tool Message Formatting

### Tool Display Formatters

```typescript
const TOOL_DISPLAY_FORMATTERS: Record<string, (args: any) => { action: string; target?: string }> =
	{
		create_onto_task: (args) => ({
			action: 'Creating task',
			target: args.name || args.task_name
		}),
		update_onto_task: (args) => ({
			action: 'Updating task',
			target: args.name || args.task_name
		}),
		delete_onto_task: (args) => ({
			action: 'Deleting task',
			target: args.name || args.task_name
		}),
		create_onto_plan: (args) => ({
			action: 'Creating plan',
			target: args.name
		}),
		fetch_project_data: (args) => ({
			action: 'Fetching project',
			target: args.project_name || args.project_id
		}),
		search_tasks: (args) => ({
			action: 'Searching tasks',
			target: args.query
		}),
		get_calendar_events: (args) => ({
			action: 'Loading calendar',
			target: args.date
		})
		// ... more tools
	};

function formatToolMessage(
	toolName: string,
	argsJson: string,
	status: 'pending' | 'completed' | 'failed'
): string {
	const formatter = TOOL_DISPLAY_FORMATTERS[toolName];
	if (!formatter) {
		if (status === 'pending') return `Using tool: ${toolName}`;
		if (status === 'completed') return `Tool ${toolName} completed`;
		return `Tool ${toolName} failed`;
	}

	const { action, target } = formatter(JSON.parse(argsJson));

	if (status === 'pending') {
		return target ? `${action}: "${target}"` : `${action}...`;
	} else if (status === 'completed') {
		const pastTense = action.replace(/ing$/, 'ed').replace(/ching$/, 'ched');
		return target ? `${pastTense}: "${target}"` : `${action} completed`;
	} else {
		return target
			? `Failed to ${action.toLowerCase()}: "${target}"`
			: `Failed to ${action.toLowerCase()}`;
	}
}
```

---

## 7. Message Scrolling & Auto-scroll Behavior

### Scroll Position Tracking

```typescript
// Helper: Check if user is scrolled to bottom (within 100px threshold)
function isScrolledToBottom(container: HTMLElement, threshold = 100): boolean {
	const scrollPosition = container.scrollTop + container.clientHeight;
	const scrollHeight = container.scrollHeight;
	return scrollHeight - scrollPosition < threshold;
}

// Helper: Smooth scroll to bottom (respects user scrolling)
function scrollToBottomIfNeeded() {
	if (!messagesContainer) return;

	// Only scroll if user hasn't manually scrolled up
	if (!userHasScrolled || isScrolledToBottom(messagesContainer)) {
		tick().then(() => {
			if (messagesContainer) {
				messagesContainer.scrollTop = messagesContainer.scrollHeight;
				userHasScrolled = false;
			}
		});
	}
}

// Track manual scrolling by user
function handleScroll() {
	if (!messagesContainer) return;
	// If user is at bottom, reset the flag (allow auto-scroll to resume)
	if (isScrolledToBottom(messagesContainer)) {
		userHasScrolled = false;
	} else {
		// User has manually scrolled up
		userHasScrolled = true;
	}
}

// Effect: Auto-scroll on new messages
$effect(() => {
	if (messages.length > 0) {
		scrollToBottomIfNeeded();
	}
});
```

---

## 8. Voice Input Integration

### Voice Components Integration

```typescript
// TextareaWithVoice component provides speech-to-text
<TextareaWithVoice
  bind:this={voiceInputRef}
  bind:value={inputValue}
  bind:isRecording={isVoiceRecording}
  bind:isInitializing={isVoiceInitializing}
  bind:isTranscribing={isVoiceTranscribing}
  bind:voiceError={voiceErrorMessage}
  bind:recordingDuration={voiceRecordingDuration}
  bind:canUseLiveTranscript={voiceSupportsLiveTranscript}
  disabled={isStreaming}
  voiceBlocked={isStreaming}
/>

// State tracking
let isVoiceRecording = $state(false);
let isVoiceInitializing = $state(false);
let isVoiceTranscribing = $state(false);
let voiceErrorMessage = $state('');
let voiceSupportsLiveTranscript = $state(false);
let voiceRecordingDuration = $state(0);

// Cleanup on destroy
onDestroy(() => {
  stopVoiceInput();
  cleanupVoiceInput();
});
```

---

## 9. Error Handling & Resilience

### Stream Error Recovery

```typescript
// Graceful error handling during streaming
const callbacks: StreamCallbacks = {
	onProgress: (data: any) => {
		handleSSEMessage(data as AgentSSEMessage);
	},
	onError: (err) => {
		console.error('SSE error:', err);
		error = typeof err === 'string' ? err : 'Connection error occurred while streaming';
		isStreaming = false;
		currentActivity = '';
		currentStreamController = null;
	},
	onComplete: () => {
		isStreaming = false;
		currentActivity = '';
		currentStreamController = null;
	}
};

// Stream processing with timeout protection
try {
	await SSEProcessor.processStream(response, callbacks, {
		timeout: 240000, // 4 minutes for complex agent conversations
		parseJSON: true,
		signal: streamController.signal
	});
} catch (err) {
	currentStreamController = null;
	if ((err as DOMException)?.name === 'AbortError') {
		// User cancelled stream
		if (dev) console.debug('[AgentChat] Stream aborted');
		isStreaming = false;
		currentActivity = '';
		return;
	}

	console.error('Failed to send message:', err);
	error = 'Failed to send message. Please try again.';
	isStreaming = false;

	// Remove user message on error (don't leave orphaned messages)
	messages = messages.filter((m) => m.id !== userMessage.id);
	inputValue = trimmed; // Restore input for retry
}
```

### Message Validation & Recovery

```typescript
// Parse tool results with error handling
function generateLastTurnContext(recentMessages: ChatMessage[]): LastTurnContext | null {
  if (!recentMessages || recentMessages.length < 2) return null;

  try {
    // Parse tool calls with fallback
    const toolCalls = Array.isArray(lastAssistantMsg.tool_calls)
      ? lastAssistantMsg.tool_calls
      : JSON.parse(lastAssistantMsg.tool_calls as any);

    toolCalls.forEach((tc: any) => {
      try {
        const args = typeof argsStr === 'string' ? JSON.parse(argsStr) : argsStr;
        // Extract entities...
      } catch (e) {
        console.warn('[API] Failed to parse tool arguments:', e);
        // Continue processing other tool calls
      }
    });
  } catch (e) {
    console.warn('[API] Failed to extract tool calls:', e);
    // Don't fail the entire last turn context
  }

  return { ... };
}
```

---

## 10. Accessibility & UX Features

### ARIA Labels & Roles

```svelte
<!-- Thinking block collapse button -->
<button
  type="button"
  onclick={() => onToggleCollapse(block.id)}
  aria-expanded={!block.isCollapsed}
  aria-label={block.isCollapsed ? 'Expand agent thinking log' : 'Collapse agent thinking log'}
>

<!-- Activity log status -->
<div
  role="status"
  aria-live="polite"
  aria-label={`${activityCount} ${activityCount === 1 ? 'activity' : 'activities'}`}
>

<!-- Voice recording indicator -->
<span role="alert" class="flex items-center gap-2">
  Recording indicator
</span>
```

### Visual Feedback

- **Activity Indicator**: Animated pulse (emerald) during streaming
- **Loading States**: Spinner animation for pending operations
- **Status Transitions**: Color changes for completed/failed states
- **Voice Recording**: Real-time duration display with visual feedback

---

## 11. Complete User Interaction Flow

### From Message Send to Response Display

```
User enters message + hits Send
           ↓
Validate input & context type
           ↓
Create UserMessage & add to messages[]
           ↓
Create ThinkingBlock (empty, status='active')
           ↓
Reset scroll flag (userHasScrolled = false)
           ↓
POST /api/agent/stream
  └─ Include: message, context, conversation_history, projectFocus, etc.
           ↓
SSEProcessor opens stream (AbortController-backed)
           ↓
Process SSE events in-flight:
  ├─ 'session' → Hydrate currentSession, update context if needed
  ├─ 'agent_state' → Update agentState, agentStateDetails, currentActivity
  ├─ 'ontology_loaded' → Set ontologyLoaded, add activity
  ├─ 'last_turn_context' → Store for next turn
  ├─ 'focus_changed' → Update projectFocus
  ├─ 'tool_call' → Add pending activity with tool details
  ├─ 'tool_result' → Update tool_call activity to completed/failed
  ├─ 'text' → Append to assistant message (streaming)
  ├─ 'plan_created' → Show plan with steps, add activity
  ├─ 'clarifying_questions' → Create special clarification message
  ├─ 'context_shift' → Switch context/entity
  ├─ 'plan_review' → Update agent state based on verdict
  ├─ 'executor_*' → Track executor execution
  ├─ 'template_creation_*' → Track template creation lifecycle
  └─ 'done' → Finalize thinking block, set isStreaming=false
           ↓
ScrollToBottomIfNeeded() fires on messages.length change
           ↓
UI updates automatically via Svelte reactivity
           ↓
User sees streaming response + agent activity timeline
           ↓
Stream completes (onComplete callback)
           ↓
Send button re-enabled, input focuses
```

---

## 12. API Types & Contracts

### Agent SSE Message Type (from agent.types.ts)

```typescript
export type AgentSSEMessage =
	| { type: 'session'; session?: ChatSession; sessionId?: string }
	| { type: 'ontology_loaded'; summary: string }
	| { type: 'last_turn_context'; context: LastTurnContext }
	| { type: 'focus_active'; focus: ProjectFocus }
	| { type: 'focus_changed'; focus: ProjectFocus }
	| {
			type: 'agent_state';
			state: 'thinking' | 'executing_plan' | 'waiting_on_user';
			contextType: ChatContextType;
			details?: string;
	  }
	| { type: 'clarifying_questions'; questions: string[] }
	| { type: 'plan_created'; plan: AgentPlan }
	| {
			type: 'plan_ready_for_review';
			plan: AgentPlan;
			summary?: string;
			recommendations?: string[];
	  }
	| { type: 'step_start'; step: AgentPlanStep }
	| { type: 'step_complete'; step: AgentPlanStep }
	| { type: 'executor_spawned'; executorId: string; task: Record<string, any> }
	| { type: 'executor_result'; executorId: string; result: Record<string, any> }
	| {
			type: 'plan_review';
			plan: AgentPlan;
			verdict: 'approved' | 'changes_requested' | 'rejected';
			notes?: string;
			reviewer?: string;
	  }
	| { type: 'text'; content: string }
	| { type: 'tool_call'; tool_call: ChatToolCall }
	| { type: 'tool_result'; result: Record<string, any> }
	| { type: 'context_shift'; context_shift: ContextShiftPayload }
	| TemplateCreationEvent
	| { type: 'error'; error: string }
	| { type: 'done'; usage?: { total_tokens: number } };
```

---

## 13. Key Component Files Reference

| Component              | Path                                                              | Purpose                          |
| ---------------------- | ----------------------------------------------------------------- | -------------------------------- |
| AgentChatModal         | `/apps/web/src/lib/components/agent/AgentChatModal.svelte`        | Main chat interface (1941 lines) |
| ThinkingBlock          | `/apps/web/src/lib/components/agent/ThinkingBlock.svelte`         | Agent activity visualization     |
| ProjectFocusIndicator  | `/apps/web/src/lib/components/agent/ProjectFocusIndicator.svelte` | Focus display with controls      |
| ProjectFocusSelector   | `/apps/web/src/lib/components/agent/ProjectFocusSelector.svelte`  | Entity selection modal           |
| SSEProcessor           | `/apps/web/src/lib/utils/sse-processor.ts`                        | Stream parsing utility           |
| Stream Endpoint        | `/apps/web/src/routes/api/agent/stream/+server.ts`                | Backend SSE handler              |
| Agent Types            | `/packages/shared-types/src/agent.types.ts`                       | Type definitions                 |
| Chat Enhancement Types | `/apps/web/src/lib/types/agent-chat-enhancement.ts`               | Ontology integration types       |

---

## 14. State Management Summary

### Key State Variables & Their Lifecycle

| Variable                 | Initial   | Modified By                          | Purpose                                    |
| ------------------------ | --------- | ------------------------------------ | ------------------------------------------ |
| `selectedContextType`    | null      | Context selection, session hydration | Chat context (global, project, task, etc.) |
| `selectedEntityId`       | undefined | Context selection, session hydration | Entity ID (project, task, goal)            |
| `messages`               | []        | Every SSE message                    | Chat history + thinking blocks             |
| `currentThinkingBlockId` | null      | Create/finalize thinking block       | Track active thinking block                |
| `isStreaming`            | false     | Send message, on SSE complete        | Disable input during streaming             |
| `projectFocus`           | null      | Focus selector, context shift SSE    | Current entity focus within project        |
| `agentState`             | null      | agent_state SSE                      | thinking, executing_plan, waiting_on_user  |
| `currentActivity`        | ''        | agent_state SSE                      | Display hint about what agent is doing     |
| `ontologyLoaded`         | false     | ontology_loaded SSE                  | Show ontology readiness indicator          |
| `lastTurnContext`        | null      | last_turn_context SSE                | Pass to next message for continuity        |
| `error`                  | null      | Error SSE or catch blocks            | Error message display                      |

---

## 15. Performance & Optimization Notes

### Efficient Update Patterns

- **Immutable message array updates**: Uses `.map()` to create new array references (avoids Svelte reactivity issues)
- **Thinking block consolidation**: All activity logged in single thinking block (not individual messages)
- **Buffered SSE processing**: Handles multiple chunks per read cycle
- **AbortController cleanup**: Prevents memory leaks from in-flight requests
- **Scroll detection**: Only auto-scrolls if at bottom (prevents jarring behavior)
- **Entity list scrolling**: Custom scrollbar styling for smooth UX

### Timeout Strategy

- **4-minute timeout** for stream processing (accounts for complex multi-step plans)
- **Inactivity-based**: Timeout resets on each new data chunk received
- **Not wall-clock timeout**: Allows long operations if data flowing

---

## Summary

The agentic chat system provides a sophisticated frontend interface for real-time multi-agent conversations with:

1. **Rich Streaming**: SSE-based real-time updates with comprehensive event types
2. **Project Focus**: Context-aware scoping to specific tasks, goals, or plans
3. **Agent Transparency**: Activity log showing thinking steps, tool calls, and plan execution
4. **Graceful Degradation**: Error recovery, abort handling, and validation
5. **UX Polish**: Auto-scrolling, voice input, accessibility, dark mode, responsive design

The architecture cleanly separates concerns between UI (AgentChatModal), streaming (SSEProcessor), and project focus management (ProjectFocusIndicator/Selector), while maintaining shared state through Svelte 5 runes.
