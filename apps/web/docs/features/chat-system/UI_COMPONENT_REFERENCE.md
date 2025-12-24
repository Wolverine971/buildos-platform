<!-- apps/web/docs/features/chat-system/UI_COMPONENT_REFERENCE.md -->

# UI Component & Pattern Reference for Chat & Agent Systems

This document provides a quick reference for BuildOS UI components and patterns for developing chat and agent interfaces.

## Quick Links

- **Comprehensive Analysis**: See [UI_LAYER_ANALYSIS.md](./UI_LAYER_ANALYSIS.md) for detailed deep-dive
- **Chat Architecture**: [ChatModal Implementation](#chatmodal-component)
- **Message Display**: [ChatMessage Component](#chatmessage-component)
- **Tool Visualization**: [ToolVisualization Component](#toolvisualization-component)
- **Modal Patterns**: [Modal Base Component](#modal-base-component)

---

## Component Quick Reference

### ChatModal Component

**Purpose**: Main chat interface with session management and streaming  
**Location**: `src/lib/components/chat/ChatModal.svelte` (1573 lines)  
**Props**:

- `isOpen: boolean` - Modal visibility
- `contextType?: 'global' | 'project' | 'calendar'` - Context awareness
- `entityId?: string` - Associated entity (project/entity ID)
- `sessionId?: string` - Load existing session
- `initialMessage?: string` - Pre-fill input
- `onClose?: () => void` - Close callback

**Features**:

- SSE streaming for real-time messages
- Session history with rename/delete
- Voice recording with live transcription
- Auto-title generation
- Tool visualization
- Responsive sidebar layout

**Key State Variables**:

```typescript
let messages = $state<ChatMessage[]>([]); // All messages
let currentStreamingMessage = $state(''); // Incoming text
let currentToolCalls = $state<ChatToolCall[]>([]); // Active tools
let currentToolResults = $state<ChatToolResult[]>([]); // Tool outputs
let activeSessionId = $state<string | null>(null); // Current session
```

**Usage Example**:

```svelte
<ChatModal
	isOpen={showChat}
	contextType="project"
	entityId={projectId}
	onClose={() => (showChat = false)}
/>
```

---

### ChatMessage Component

**Purpose**: Display individual messages with role-aware rendering  
**Location**: `src/lib/components/chat/ChatMessage.svelte`  
**Props**:

- `message: ChatMessage` - Message to display
- `isStreaming?: boolean` - Show typing indicator
- `onRetry?: () => void` - Retry callback for failed messages

**Features**:

- Role-based avatars and styling (user, assistant, system, tool)
- Markdown rendering for assistant messages
- Streaming indicators with animated pulse
- Tool call indicators
- Error states with retry button
- Token usage display

**Message Roles**:

- **user**: Right-aligned, primary color bubble
- **assistant**: Left-aligned, markdown rendering
- **system**: Gray styling for system messages
- **tool**: Monospace font for tool results

---

### ToolVisualization Component

**Purpose**: Display tool calls and results during execution  
**Location**: `src/lib/components/chat/ToolVisualization.svelte`  
**Props**:

- `toolCalls: ChatToolCall[]` - Active tool invocations
- `toolResults?: ChatToolResult[]` - Tool execution results
- `isExecuting?: boolean` - Currently executing tools

**Features**:

- Color-coded by category (blue=list, purple=detail, green=calendar, orange=action)
- Real-time status indicators (spinner, checkmark, X)
- Execution duration tracking
- Arguments preview
- User action required indicators

**Tool Categories**:

```typescript
function getToolCategory(name: string): string {
	if (name.startsWith('list_') || name.startsWith('search_')) return 'list'; // Blue
	if (name.startsWith('get_')) return 'detail'; // Purple
	if (name.includes('calendar') || name.includes('schedule')) return 'calendar'; // Green
	return 'action'; // Orange
}
```

---

### Modal Base Component

**Purpose**: Base modal for dialogs, confirmations, and overlays  
**Location**: `src/lib/components/ui/Modal.svelte`  
**Props**:

- `isOpen: boolean` - Modal visibility
- `onClose: () => void` - Close handler
- `title?: string` - Modal title
- `size?: 'sm' | 'md' | 'lg' | 'xl'` - Modal size
- `showCloseButton?: boolean` - Show X button (default: true)
- `closeOnBackdrop?: boolean` - Allow backdrop click to close
- `closeOnEscape?: boolean` - Allow Escape key to close
- `persistent?: boolean` - Prevent closing (for critical operations)
- `customClasses?: string` - Additional Tailwind classes
- `ariaLabel?: string` - ARIA label for accessibility

**Features**:

- Focus trapping (keyboard navigation containment)
- Backdrop click detection
- Escape key handling
- Portal rendering (outside DOM hierarchy)
- Smooth fade/scale transitions

**Sizes**:

- `sm`: max-w-md (448px)
- `md`: max-w-2xl (672px) - default
- `lg`: max-w-4xl (896px)
- `xl`: max-w-6xl (1152px)

**Usage Pattern**:

```svelte
<Modal isOpen={showDialog} onClose={() => (showDialog = false)} title="Confirm Action" size="md">
	<!-- Content -->
</Modal>
```

---

### Button Component

**Purpose**: Standardized button with variants and sizes  
**Location**: `src/lib/components/ui/Button.svelte`  
**Props**:

- `variant?: ButtonVariant` - Button style
- `size?: ButtonSize` - Button size
- `loading?: boolean` - Show loading spinner
- `icon?: Component` - Icon to display (Lucide)
- `iconPosition?: 'left' | 'right'` - Icon placement
- `fullWidth?: boolean` - Stretch to fill width
- `disabled?: boolean` - Disable button

**Variants**:

- `primary`: Blue gradient with border (main action)
- `secondary`: Lighter blue gradient
- `ghost`: Transparent with hover background
- `danger`: Rose/red for destructive actions
- `outline`: Bordered only
- `success`: Green for affirmative actions
- `warning`: Orange for cautions

**Sizes** (WCAG AA: minimum 44x44px touch targets):

- `sm`: 32-44px (compact)
- `md`: 44px (standard)
- `lg`: 48px (large)
- `xl`: 56px (extra large)

**Usage Examples**:

```svelte
<!-- Primary action -->
<Button variant="primary" size="md">Send Message</Button>

<!-- Danger action -->
<Button variant="danger" icon={Trash2}>Delete</Button>

<!-- Loading state -->
<Button loading>Saving...</Button>

<!-- Full width -->
<Button fullWidth variant="secondary">Submit</Button>
```

---

### Card Component

**Purpose**: Content container with variants  
**Location**: `src/lib/components/ui/Card.svelte`  
**Props**:

- `variant?: CardVariant` - Card style
- `padding?: CardPadding` - Internal spacing
- `hoverable?: boolean` - Add hover effects
- `class?: string` - Additional classes

**Variants**:

- `default`: Basic card with subtle border and shadow
- `elevated`: Elevated card with stronger shadow
- `interactive`: Hoverable card with cursor pointer
- `outline`: Outlined only, no fill

**Padding** (Information density - Apple style):

- `none`: 0px
- `sm`: 8px (tight)
- `md`: 12px / 16px (balanced) - default
- `lg`: 16px / 24px (spacious)

---

## SSE Streaming Pattern

### Server-Sent Events (SSE) Processing

**File**: `src/lib/utils/sse-processor.ts`

```typescript
// 1. Set up callbacks
const callbacks: StreamCallbacks = {
	onProgress: (data: ChatSSEMessage) => {
		switch (data.type) {
			case 'session':
				handleSessionHydration(data.session);
				break;
			case 'text':
				currentStreamingMessage += data.content;
				break;
			case 'tool_call':
				currentToolCalls = [...currentToolCalls, data.tool_call];
				break;
			case 'tool_result':
				upsertToolResult(data.tool_result);
				break;
			case 'error':
				error = data.error;
				break;
			case 'done':
				finalizeAssistantMessage(data.usage);
				break;
		}
	},
	onError: (err) => {
		error = typeof err === 'string' ? err : 'Connection error';
		isStreaming = false;
	}
};

// 2. Process stream
await SSEProcessor.processStream(response, callbacks, {
	timeout: 60000,
	parseJSON: true
});
```

---

## Svelte 5 Rune Patterns

### Pattern 1: Grouped Derivations

Prevents cascading updates by grouping related values:

```typescript
let inputState = $derived.by(() => {
	const state = $store;
	return {
		text: state?.inputText ?? '',
		lastSaved: state?.lastSavedContent ?? '',
		isNew: state?.isNewProject ?? false
	};
});

let inputText = $derived(inputState.text);
let lastSavedContent = $derived(inputState.lastSaved);
```

### Pattern 2: Untracked Effects

Limits effect re-runs to specific dependencies:

```typescript
$effect(() => {
	const view = currentView; // Dependency
	untrack(() => {
		if (view && view !== previousView) {
			loadComponentsForView(view); // Only runs when view changes
		}
	});
});
```

### Pattern 3: Throttled Updates

Reduces store mutations by limiting update frequency:

```typescript
const throttledUpdateInput = throttle((text: string) => {
	brainDumpActions.updateInputText(text);
}, 100); // Max once per 100ms
```

### Pattern 4: Debounced Auto-save

Waits for user to stop typing before saving:

```typescript
function debouncedAutoSave() {
	if (autoSaveTimeout) clearTimeout(autoSaveTimeout);
	autoSaveTimeout = setTimeout(() => {
		autoSave();
	}, 2000); // 2 seconds after last change
}
```

### Pattern 5: Abort Controller for Cleanup

Cancels stale requests:

```typescript
let saveAbortController: AbortController | null = null;

async function autoSave() {
	if (saveAbortController) {
		saveAbortController.abort(); // Cancel previous
	}
	saveAbortController = new AbortController();
	await performSave(saveAbortController.signal);
}
```

---

## Accessibility Patterns

### Modal Accessibility

```svelte
<div role="dialog" aria-modal="true" aria-labelledby="dialog-title" aria-describedby="dialog-desc">
	<h2 id="dialog-title">Action Required</h2>
	<p id="dialog-desc">Confirm before proceeding.</p>
</div>
```

### Live Regions for Streaming

```svelte
<div aria-live="polite" role="status">Assistant is composing a response…</div>
```

### Keyboard Shortcuts

```typescript
function handleKeyDown(event: KeyboardEvent) {
	if (event.key === 'Enter' && !event.shiftKey) {
		event.preventDefault();
		sendMessage();
	}
	if (event.key === 'Escape') {
		closeDialog();
	}
}
```

---

## Performance Optimization Patterns

### Lazy Component Loading

```typescript
async function loadComponentsForView(view: string) {
	switch (view) {
		case 'processing':
			if (!componentsLoaded.processing) {
				ProcessingView = (await import('./ProcessingView.svelte')).default;
			}
			break;
	}
}
```

### Scroll Performance

```svelte
<div class="chat-scroll overflow-y-auto">
	{#each messages as message (message.id)}
		<ChatMessageComponent {message} />
	{/each}
</div>

<style>
	.chat-scroll {
		scrollbar-gutter: stable; /* Prevent layout shift */
	}
</style>
```

---

## Integration for Agent Systems

### 1. Extend Context Types

```typescript
// Add new context in ChatModal props
interface Props {
	contextType?: 'global' | 'project' | 'calendar' | 'agent';
}

// Add to CONTEXT_META
const CONTEXT_META = {
	agent: { badge: '🤖 Agent', description: 'Agent-focused session' }
};
```

### 2. Add Tool Categories

```typescript
function getToolLabel(name: string): string {
	const labels: Record<string, string> = {
		// ... existing tools
		agent_action: '🤖 Agent Action',
		research: '🔍 Research'
	};
	return labels[name] || name;
}
```

### 3. Progressive Disclosure Pattern

```svelte
{#if analysisComplete}
	<div transition:fade={{ duration: 300 }}>
		<AnalysisResults {results} />
	</div>
{/if}

{#if tasksExtracted}
	<div transition:slide={{ duration: 300 }}>
		<TasksList {tasks} />
	</div>
{/if}
```

### 4. Reuse Modal for Dialogs

```svelte
<Modal isOpen={showAgentDialog} onClose={handleClose} size="lg" persistent={isProcessing}>
	<AgentInterface {agent} />
</Modal>
```

---

## Performance Benchmarks

| Operation          | Time   | Notes                   |
| ------------------ | ------ | ----------------------- |
| Message Display    | <50ms  | Svelte 5 reactivity     |
| Streaming Update   | <100ms | SSE event to UI         |
| Modal Open         | ~300ms | With lazy loading       |
| Session Load       | <500ms | List + initial messages |
| Input Throttle     | 100ms  | Max mutation frequency  |
| Auto-save Debounce | 2s     | After typing stops      |

---

## File Structure

```
src/lib/
├── components/
│   ├── chat/
│   │   ├── ChatModal.svelte
│   │   ├── ChatMessage.svelte
│   │   └── ToolVisualization.svelte
│   ├── brain-dump/
│   │   ├── BrainDumpModal.svelte (reference implementation)
│   │   └── DualProcessingResults.svelte
│   └── ui/
│       ├── Modal.svelte
│       ├── Button.svelte
│       ├── Card.svelte
│       ├── Badge.svelte
│       └── ... (20+ components)
├── services/
│   ├── chat-context-service.ts
│   ├── chat-compression-service.ts
│   └── smart-llm-service.ts
├── chat/
│   ├── tool-executor.ts
│   └── tools.config.ts
└── utils/
    ├── sse-processor.ts
    └── sse-response.ts
```

---

## Next Steps

1. **Review** [UI_LAYER_ANALYSIS.md](./UI_LAYER_ANALYSIS.md) for comprehensive details
2. **Study** ChatModal implementation as blueprint
3. **Examine** Brain Dump Modal for multi-step workflows
4. **Test** streaming with SSEProcessor
5. **Implement** using component composition patterns
6. **Follow** WCAG AA accessibility guidelines

See the main chat system documentation in `ARCHITECTURE.md` and `README.md` for integration details.
