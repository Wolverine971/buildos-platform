<!-- apps/web/docs/features/chat-system/QUICK_START.md -->

# Chat System Quick Start Guide

## 🚀 Getting Started in 5 Minutes

### 1. Run the Database Migration

```bash
cd /apps/web
supabase migration up 20251027_create_chat_tables
pnpm supabase:types  # Generate TypeScript types
```

### 2. Set Required Environment Variables

```bash
# In your .env file
OPENAI_API_KEY=sk-...              # Required for chat
OPENROUTER_API_KEY=sk-or-...       # Optional alternative
```

### 3. Test the Chat System

Open any task page and press `Cmd/Ctrl + K` to open the chat.

## 📦 Integration Examples

### Basic Integration (Any Page)

```svelte
<script>
	import ChatModal from '$lib/components/chat/ChatModal.svelte';

	let showChat = false;
</script>

<button on:click={() => (showChat = true)}> Open Chat </button>

<ChatModal isOpen={showChat} onClose={() => (showChat = false)} />
```

### Context-Aware Integration (Task Page)

```svelte
<script>
	import ChatModal from '$lib/components/chat/ChatModal.svelte';
	import { MessageCircle } from 'lucide-svelte';

	let showChat = false;

	// Keyboard shortcut
	function handleKeyDown(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
			e.preventDefault();
			showChat = true;
		}
	}
</script>

<svelte:window on:keydown={handleKeyDown} />

<!-- Header button -->
<button on:click={() => (showChat = true)} title="Chat (⌘K)">
	<MessageCircle class="w-5 h-5" />
</button>

<!-- Agent chat modal with task focus -->
{@const taskFocus = {
	focusType: 'task',
	focusEntityId: task.id,
	focusEntityName: task.title,
	projectId: project.id,
	projectName: project.name
}}
<AgentChatModal
	isOpen={showChat}
	initialProjectFocus={taskFocus}
	onClose={() => (showChat = false)}
/>
```

### Floating Action Button

```svelte
<!-- Fixed position FAB -->
<button
	on:click={() => (showChat = true)}
	class="fixed bottom-6 right-6 z-40 bg-primary-500 text-white rounded-full p-4 shadow-lg hover:bg-primary-600 transition-all"
>
	<MessageCircle class="w-6 h-6" />
</button>
```

## 🛠️ Available Context Types

```typescript
type ChatContextType =
	| 'global'
	| 'project'
	| 'calendar'
	| 'project_create'
	| 'project_audit'
	| 'project_forecast'
	| 'daily_brief_update'
	| 'brain_dump'
	| 'ontology';

// Global - No specific context
<ChatModal contextType="global" />

// Project - Project-specific context
<ChatModal contextType="project" entityId={projectId} />

// Calendar - Calendar event context
<ChatModal contextType="calendar" entityId={eventId} />
```

## 🎯 Key Features to Try

### 1. Progressive Disclosure

Ask the chat to "list my tasks" - it will show abbreviated summaries. Then ask "tell me more about task #3" to get full details.

### 2. Tool Execution

Try these commands:

- "Create a new task called 'Review documentation'"
- "Update task status to in progress"
- "Schedule this task for tomorrow at 2pm"
- "Find available time slots this week"

### 3. Context Awareness

Open chat from a task page - it automatically knows:

- Current task details
- Project context
- Related subtasks
- Calendar events

## 📊 Token Usage Examples

### Efficient Query (Uses Progressive Disclosure)

```
User: "What tasks do I have?"
System: Lists 5 tasks (200 tokens)

User: "Tell me about the third one"
System: Loads full details (800 tokens)

Total: ~1,000 tokens
```

### Inefficient Query (Without Progressive Disclosure)

```
User: "Show me all details for all my tasks"
System: Loads everything (3,000+ tokens)

Total: ~3,000 tokens
```

## 🔧 Debugging

### Check Token Usage

Token counts are displayed in the UI when in development mode:

```svelte
{#if import.meta.env.DEV && message.total_tokens}
	<div class="text-xs text-gray-400">
		{message.total_tokens} tokens
	</div>
{/if}
```

### Monitor SSE Stream

```javascript
// In browser console
window.addEventListener('message', (e) => {
	if (e.data.type === 'sse') {
		console.log('SSE Event:', e.data);
	}
});
```

### Test Tool Execution

```bash
# Check tool execution logs
tail -f /var/log/chat-tools.log

# Database query for tool history
SELECT * FROM chat_tool_executions
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;
```

## 🎨 Customization

### Custom Initial Message

```svelte
<ChatModal initialMessage="I need help breaking down this complex task into smaller steps" />
```

### Custom Session ID

```svelte
<ChatModal
  sessionId={existingSessionId}  // Continue previous conversation
/>
```

### Custom Styling

```svelte
<style>
	/* Override chat colors */
	:global(.chat-user-message) {
		background: var(--brand-primary);
	}

	:global(.chat-assistant-message) {
		background: var(--brand-secondary);
	}
</style>
```

## 📚 Learn More

- [Full Documentation](README.md)
- [Architecture Guide](ARCHITECTURE.md)
- [API Reference](/apps/web/src/routes/api/chat/README.md)
- [Tool Development Guide](/apps/web/src/lib/chat/TOOL_DEVELOPMENT.md)

## 💡 Pro Tips

1. **Use keyboard shortcut** `Cmd/Ctrl + K` for quick access
2. **Ask for lists first**, then details (saves tokens)
3. **Be specific** about context ("in this project" vs "in all projects")
4. **Use tool names** directly ("schedule task" vs "put on calendar")
5. **Check token usage** in dev mode to optimize queries

---

**Need Help?** The chat system itself can answer questions! Just ask: "How do you work?" or "What tools are available?"
