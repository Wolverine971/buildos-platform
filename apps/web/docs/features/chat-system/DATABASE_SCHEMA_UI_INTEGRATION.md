<!-- apps/web/docs/features/chat-system/DATABASE_SCHEMA_UI_INTEGRATION.md -->

# Database Schema & UI Integration Research

## Conversational Agent Interface - Comprehensive Analysis

**Document Date**: 2025-10-28  
**Scope**: Chat System Database Schema, Supabase Integration, UI Component Patterns, and Reusable Components

---

## Table of Contents

1. [Database Schema Overview](#database-schema-overview)
2. [Chat System Tables](#chat-system-tables)
3. [Supabase Integration Patterns](#supabase-integration-patterns)
4. [Existing UI Component Library](#existing-ui-component-library)
5. [Modal & Panel Components](#modal--panel-components)
6. [Operation Display Patterns](#operation-display-patterns)
7. [Form Component Patterns](#form-component-patterns)
8. [Real-Time Features](#real-time-features)
9. [Reusable Components for Agent Interface](#reusable-components-for-agent-interface)
10. [Implementation Recommendations](#implementation-recommendations)

---

## Database Schema Overview

### Core Tables

The BuildOS platform uses a PostgreSQL database managed by Supabase with Row-Level Security (RLS) policies. The database is organized into several logical domains:

- **Authentication**: Handled by Supabase Auth (auth.users)
- **Projects & Tasks**: Core productivity domain
- **Brain Dumps**: Input processing and AI-generated insights
- **Chat System**: New tables for conversational agent
- **Notifications**: Notification tracking and preferences
- **Time Blocks**: Calendar and scheduling integration

### Architecture Principles

1. **Row-Level Security (RLS)**: All user-owned tables have RLS policies enforcing auth.uid() checks
2. **Foreign Keys**: Proper referential integrity with ON DELETE CASCADE for cleanup
3. **Indexes**: Performance-optimized indexes on frequently queried columns
4. **Triggers**: Automatic statistics tracking (message counts, token usage)
5. **Timestamps**: All tables include created_at and updated_at for audit trails

---

## Chat System Tables

### 1. Chat Sessions Table (`chat_sessions`)

**Purpose**: Stores conversation sessions with context awareness and progressive disclosure support

**Schema**:

```sql
CREATE TABLE chat_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Session metadata
  title TEXT,                      -- User-assigned title (e.g., "Project Planning")
  auto_title TEXT,                -- AI-generated title from first message

  -- Context information (progressive disclosure pattern)
  context_type TEXT NOT NULL,      -- 'global', 'project', 'task', 'calendar'
  entity_id UUID,                  -- References projects.id or tasks.id

  -- Session state
  status TEXT DEFAULT 'active',    -- 'active', 'archived', 'compressed'

  -- Statistics (auto-updated by triggers)
  message_count INTEGER DEFAULT 0,
  total_tokens_used INTEGER DEFAULT 0,
  tool_call_count INTEGER DEFAULT 0,

  -- User preferences
  preferences JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_message_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  compressed_at TIMESTAMPTZ
);
```

**Key Features**:

- **Context Awareness**: `context_type` determines what domain the conversation relates to
- **Token Tracking**: `total_tokens_used` helps with LLM cost monitoring
- **Compression Support**: Long sessions can be compressed to stay within token limits
- **Auto-Statistics**: Triggers automatically update message/token counts

**Indexes**:

- `idx_chat_sessions_user_id`: Fast lookup by user
- `idx_chat_sessions_context`: Query by context type and entity
- `idx_chat_sessions_status`: Filter by active/archived status
- `idx_chat_sessions_user_active`: Composite index for active sessions by user

### 2. Chat Messages Table (`chat_messages`)

**Purpose**: Individual messages within a session, including tool calls and results

**Schema**:

```sql
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,

  -- Message content
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  content TEXT NOT NULL,

  -- Tool execution tracking
  tool_calls JSONB,                -- Array of {tool_name, arguments, tool_call_id}
  tool_call_id TEXT,               -- For tool result messages
  tool_name TEXT,                  -- Name of executed tool
  tool_result JSONB,               -- Result data from tool execution

  -- Token accounting
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_tokens INTEGER,

  -- Metadata
  metadata JSONB DEFAULT '{}',

  -- Error tracking
  error_message TEXT,
  error_code TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Message Flow**:

1. User sends message → `role='user'`
2. Assistant responds with text → `role='assistant'`, `content='...'`
3. Assistant calls tools → `role='assistant'`, `tool_calls=[...]`
4. Tool results returned → `role='tool'`, `tool_result={...}`

**Token Tracking**:

- Each message tracks prompt/completion/total tokens
- Helps with cost monitoring and compression decisions
- Aggregate stats stored in `chat_sessions.total_tokens_used`

### 3. Chat Tool Executions Table (`chat_tool_executions`)

**Purpose**: Detailed tracking of tool usage for analytics and optimization

**Schema**:

```sql
CREATE TABLE chat_tool_executions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  message_id UUID REFERENCES chat_messages(id) ON DELETE CASCADE,

  -- Tool information
  tool_name TEXT NOT NULL,
  tool_category TEXT,              -- 'list', 'detail', 'action', 'calendar'

  -- Execution details
  arguments JSONB NOT NULL,
  result JSONB,

  -- Performance metrics
  execution_time_ms INTEGER,
  tokens_consumed INTEGER,

  -- Success tracking
  success BOOLEAN NOT NULL DEFAULT true,
  error_message TEXT,
  requires_user_action BOOLEAN DEFAULT false,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Tool Categories**:

- `list`: Retrieves lists (tasks, projects, calendar events)
- `detail`: Fetches detailed information
- `action`: Executes changes (create, update, mark complete)
- `calendar`: Calendar-specific operations

### 4. Chat Context Cache Table (`chat_context_cache`)

**Purpose**: Caches abbreviated context for progressive disclosure and token optimization

**Schema**:

```sql
CREATE TABLE chat_context_cache (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Cache key
  context_type TEXT NOT NULL,
  entity_id UUID,
  cache_key TEXT GENERATED AS (
    COALESCE(context_type, 'global') || ':' || COALESCE(entity_id::TEXT, 'null')
  ) STORED,

  -- Cached data
  abbreviated_context JSONB NOT NULL,  -- Abbreviated data structure
  full_context_available BOOLEAN DEFAULT false,

  -- Token counts
  abbreviated_tokens INTEGER NOT NULL,
  full_tokens_estimate INTEGER,

  -- Related entities
  related_entity_ids UUID[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}',

  -- Cache management
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '1 hour',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  accessed_at TIMESTAMPTZ DEFAULT NOW(),
  access_count INTEGER DEFAULT 1,

  UNIQUE (user_id, cache_key)
);
```

**Progressive Disclosure Pattern**:

1. When session starts, load abbreviated context (e.g., project name, status)
2. Cache stores token counts for abbreviated vs full context
3. If user asks for more details, upgrade to full context
4. 1-hour expiration with automatic cleanup

### 5. Chat Compressions Table (`chat_compressions`)

**Purpose**: Store compressed conversation history for long sessions

**Schema**:

```sql
CREATE TABLE chat_compressions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,

  -- Compression metrics
  original_message_count INTEGER NOT NULL,
  compressed_message_count INTEGER NOT NULL,
  original_tokens INTEGER NOT NULL,
  compressed_tokens INTEGER NOT NULL,
  compression_ratio DECIMAL(5, 2),   -- % tokens saved

  -- Compressed content
  summary TEXT NOT NULL,             -- AI-generated summary
  key_points JSONB,                  -- Important points preserved
  tool_usage_summary JSONB,          -- Tools used and results

  -- Message range
  first_message_id UUID,
  last_message_id UUID,

  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**When to Compress**:

- Session exceeds token limit for LLM context window
- Useful for long-running projects or recurring agents
- Preserves key points while reducing token footprint

### RLS Policies

**Chat Sessions**: Users can only access their own sessions

```sql
CREATE POLICY "Users can view their own chat sessions"
  ON chat_sessions FOR SELECT
  USING (auth.uid() = user_id);
```

**Chat Messages**: Access through session ownership

```sql
CREATE POLICY "Users can view messages in their sessions"
  ON chat_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM chat_sessions
      WHERE chat_sessions.id = chat_messages.session_id
      AND chat_sessions.user_id = auth.uid()
    )
  );
```

---

## Supabase Integration Patterns

### Client Configuration

**File**: `/Users/annawayne/buildos-platform/apps/web/src/lib/supabase/index.ts`

**Pattern**: Three-tier client hierarchy

```typescript
// 1. Browser Client (Svelte Components)
export const supabase = browser ? createSupabaseBrowser() : null;

// Usage in components:
import { supabase } from '$lib/supabase';
if (supabase) {
	const { data, error } = await supabase.from('chat_sessions').select('*').eq('user_id', userId);
}

// 2. Server Client (Server-side rendering, API routes)
export const createSupabaseServer = (cookies: CookieMethodsServer) =>
	createServer(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, cookies);

// Usage in +page.server.ts or +server.ts:
const supabase = createSupabaseServer(cookies);

// 3. Admin Client (Workers, webhooks - bypasses RLS)
import { createAdminSupabaseClient } from '$lib/supabase/admin';
const supabase = createAdminSupabaseClient();
```

**Key Decision Tree**:

- **Svelte component** (.svelte file) → `createSupabaseBrowser()`
- **Server function** (+page.server.ts, +server.ts) → `createSupabaseServer(cookies)`
- **Background worker** or webhook → `createAdminSupabaseClient()`

### Real-Time Subscriptions

**Pattern**: Services handle subscription lifecycle

```typescript
// Example from realtimeProject.service.ts pattern
import { supabase } from '$lib/supabase';

export const realtimeService = {
	subscribe(userId: string, onUpdate: (data: any) => void) {
		const subscription = supabase
			.from('projects')
			.on('*', (payload) => {
				if (payload.new.user_id === userId) {
					onUpdate(payload.new);
				}
			})
			.subscribe();

		return () => subscription.unsubscribe();
	}
};
```

### Query Patterns

**Typed Queries** (using shared-types):

```typescript
import type { Database } from '@buildos/shared-types';

type ChatSession = Database['public']['Tables']['chat_sessions']['Row'];

// With proper typing:
const { data: sessions } = await supabase
	.from('chat_sessions')
	.select('*')
	.eq('user_id', userId)
	.eq('status', 'active')
	.order('last_message_at', { ascending: false })
	.limit(10);
```

---

## Existing UI Component Library

### Base Components

**Location**: `/Users/annawayne/buildos-platform/apps/web/src/lib/components/ui/`

#### Modal Component

**File**: `Modal.svelte`

**Features**:

- Focus trap (automatic focus management)
- Keyboard handling (Escape to close, Tab cycling)
- Mobile-aware (slides up from bottom on mobile)
- Accessibility: ARIA labels, roles, descriptions
- Configurable sizes: sm, md, lg, xl
- Backdrop click handling
- Portal rendering (mounts outside normal flow)

**Props**:

```typescript
interface ModalProps {
	isOpen: boolean;
	onClose: () => void;
	title?: string;
	size?: 'sm' | 'md' | 'lg' | 'xl';
	showCloseButton?: boolean;
	closeOnBackdrop?: boolean;
	closeOnEscape?: boolean;
	persistent?: boolean;
	customClasses?: string;
}
```

**Usage Example**:

```svelte
<Modal {isOpen} onClose={() => (isOpen = false)} title="Chat Settings" size="md">
	{#if $$slots.header}
		<div slot="header">Custom header</div>
	{/if}

	<!-- Main content -->
	Main content goes here

	<div slot="footer">
		<Button on:click={save}>Save</Button>
	</div>
</Modal>
```

#### Button Component

**File**: `Button.svelte`

**Variants**:

- `primary`: Blue gradient background
- `outline`: Border with transparent background
- `ghost`: No styling, hover effects only
- `danger`: Red for destructive actions

**Sizes**: sm, md, lg

**Features**:

- Icon support (left side)
- Loading state with spinner
- Disabled state styling
- Accessibility keyboard support

#### Form Components

**TextInput** (`TextInput.svelte`):

- Standard text, email, password, number, date, datetime-local
- Size variants: sm, md, lg
- Error state styling
- Focus states

**Textarea** (`Textarea.svelte`):

- Auto-resize capability
- Custom row heights
- Max row limits
- Markdown support integration

**Select** (`Select.svelte`):

- Dropdown selection
- Option groups support
- Disabled state
- Size variants

**FormField** (`FormField.svelte`):

- Label management
- Error message display
- Required indicator
- Description text

#### Card Components

**Card.svelte**: Main container

- Variants: default, elevated
- Padding options: sm, md, lg
- Custom classes
- Dark mode support

**CardHeader.svelte**: Titled header section

- Variants: default, gradient
- Custom background

**CardBody.svelte**: Main content area
**CardFooter.svelte**: Action area

#### Display Components

**Badge** (`Badge.svelte`):

- Variants: success, warning, error, info
- Sizes: sm, md, lg
- Custom styling

**Alert** (`Alert.svelte`):

- Type indicators: success, warning, error, info
- Icon support
- Dismissable

---

## Modal & Panel Components

### FormModal Component

**File**: `/Users/annawayne/buildos-platform/apps/web/src/lib/components/ui/FormModal.svelte`

**Purpose**: Dynamic form generation from config

**Key Features**:

- Field-driven form generation
- Automatic field type handling (text, textarea, select, date, etc.)
- Error management
- Markdown field support
- Delete confirmation flow
- Deep clone data handling to prevent mutations

**Form Config Type**:

```typescript
type FormConfig = Record<
	string,
	{
		label: string;
		type:
			| 'text'
			| 'textarea'
			| 'select'
			| 'date'
			| 'datetime-local'
			| 'number'
			| 'checkbox'
			| 'tags';
		required?: boolean;
		placeholder?: string;
		description?: string;
		options?: string[];
		rows?: number;
		min?: number;
		max?: number;
		markdown?: boolean;
		copyButton?: boolean;
	}
>;
```

**Usage Pattern**:

```svelte
<FormModal
	isOpen={isFormOpen}
	title="Edit Project"
	submitText="Save Changes"
	loadingText="Saving..."
	formConfig={projectFormConfig}
	initialData={selectedProject}
	on:submit={handleSave}
	onDelete={handleDelete}
	onClose={() => (isFormOpen = false)}
/>
```

### DiffView Component

**File**: `/Users/annawayne/buildos-platform/apps/web/src/lib/components/ui/DiffView.svelte`

**Purpose**: Side-by-side comparison of old vs new versions

**Features**:

- Line numbering
- Color-coded additions/removals
- Scrollable content areas
- Customizable labels
- Field priority indicators

**Type**:

```typescript
interface FieldDiff {
	field: string;
	label: string;
	oldLines: DiffLine[];
	newLines: DiffLine[];
}

interface DiffLine {
	lineNumber: number;
	content: string;
	type: 'added' | 'removed' | 'unchanged';
}
```

### Brain Dump UI Components (For Reference)

**DualProcessingResults.svelte**:

- Multi-stage processing visualization
- Progress bars with gradient colors
- Status badges and icons
- Retry indicators
- Expandable analysis panels

**ParseResultsDiffView.svelte**:

- Operation list with diff comparisons
- Expandable operation details
- Edit/delete/toggle capabilities
- Existing data fetching and comparison
- Loading states during fetch

**OperationsList.svelte**:

- Operation grouping (create/update/delete)
- Table type icons and colors
- Operation descriptions
- Main field value preview
- Error highlighting

**OperationErrorsDisplay.svelte**:

- Error categorization
- Severity levels
- Detailed error messages
- Resolution suggestions

---

## Operation Display Patterns

### Operation Type Styling

From existing brain dump components:

```typescript
const operationColors = {
	create: 'text-green-600 bg-green-50 border-green-200',
	update: 'text-blue-600 bg-blue-50 border-blue-200',
	delete: 'text-red-600 bg-red-50 border-red-200'
};

const tableIcons = {
	tasks: { icon: ListTodo, emoji: '✅' },
	projects: { icon: FolderOpen, emoji: '📁' },
	notes: { icon: FileText, emoji: '📝' },
	phases: { icon: Layers, emoji: '📊' },
	chat_sessions: { icon: MessageSquare, emoji: '💬' },
	chat_messages: { icon: Send, emoji: '📤' }
};
```

### Status Indicators

```typescript
const STATUS_META = {
	pending: { label: 'Queued', badge: 'info' },
	processing: { label: 'Processing', badge: 'info' },
	completed: { label: 'Ready', badge: 'success' },
	failed: { label: 'Needs attention', badge: 'error' },
	not_needed: { label: 'Skipped', badge: 'warning' }
};
```

---

## Form Component Patterns

### FormField Component

**Features**:

- Consistent label styling
- Error display
- Required indicator
- Description text
- Icon integration

**Usage**:

```svelte
<FormField label="Project Name" required error={errors.name} description="Unique, memorable name">
	<TextInput id="project-name" bind:value={formData.name} placeholder="My Awesome Project" />
</FormField>
```

### Validation Pattern

```typescript
// From FormModal component
const validationErrors: string[] = [];
for (const [field, config] of Object.entries(formConfig)) {
	if (config.required) {
		const value = formData[field];
		const isEmpty =
			value === undefined ||
			value === null ||
			value === '' ||
			(Array.isArray(value) && value.length === 0) ||
			(typeof value === 'string' && !value.trim());

		if (isEmpty) {
			validationErrors.push(`${config.label} is required`);
		}
	}
}

if (validationErrors.length > 0) {
	errors = validationErrors;
	return; // Prevent submission
}
```

---

## Real-Time Features

### Supabase Real-Time Architecture

**Supported Channels**:

1. **Presence**: Active user tracking
2. **Broadcast**: Real-time message delivery
3. **Postgres Changes**: Database update subscriptions

**Chat Session Real-Time Pattern**:

```typescript
// Subscribe to new messages in session
const subscription = supabase
	.channel(`chat_session:${sessionId}`)
	.on(
		'postgres_changes',
		{ event: 'INSERT', schema: 'public', table: 'chat_messages' },
		(payload) => {
			if (payload.new.session_id === sessionId) {
				// Add new message to UI
				messages = [...messages, payload.new];
			}
		}
	)
	.subscribe();
```

**Cleanup**:

```typescript
onDestroy(() => {
	supabase.removeChannel(subscription);
});
```

---

## Reusable Components for Agent Interface

### 1. Session Management Panel

**Reusable from**: ChatModal sidebar

**Components Needed**:

- Session list (filterable, sortable by recent)
- Active session indicator
- Session metadata (message count, last updated)
- Context badge
- Context type indicator

**Code Pattern** (from ChatModal):

```svelte
<div class="flex-1 overflow-y-auto">
	{#each sortedSessions as session (session.id)}
		<button
			class={isActive ? 'active-session-styles' : 'inactive-session-styles'}
			on:click={() => selectSession(session.id)}
		>
			<div class="flex justify-between items-center">
				<span class="font-semibold">{session.title || 'Untitled'}</span>
				<span class="text-xs text-gray-500">{formatDate(session.updated_at)}</span>
			</div>
			<div class="flex gap-2 text-xs">
				<Badge>{contextLabel}</Badge>
				<span>{session.message_count} messages</span>
			</div>
		</button>
	{/each}
</div>
```

### 2. Message Display Component

**Reusable from**: ChatMessage.svelte pattern

**Rendering**:

- User messages: Right-aligned, blue background
- Assistant messages: Left-aligned, lighter background
- Tool calls: Special visualization
- Tool results: Formatted data display
- Error messages: Alert styling

**Key Pattern**:

```svelte
{#each messages as message (message.id)}
	<div class={message.role === 'user' ? 'user-message' : 'assistant-message'}>
		<div class="message-content">
			{message.content}
		</div>

		{#if message.tool_calls}
			<ToolVisualization toolCalls={message.tool_calls} />
		{/if}

		{#if message.error_message}
			<Alert type="error">{message.error_message}</Alert>
		{/if}
	</div>
{/each}
```

### 3. Tool Execution Visualizer

**Purpose**: Display tool calls and their results

**Components**:

- Tool name and icon
- Arguments display
- Execution status
- Result data (table, list, or formatted)
- Execution time
- Error handling

**From**: ToolVisualization.svelte (chat system)

### 4. Operation List with Diff View

**Reusable from**: ParseResultsDiffView + OperationsList

**Features**:

- Grouped operations (create, update, delete)
- Expandable rows with diff comparison
- Toggle enable/disable
- Edit inline
- Delete operations
- Error highlighting
- Progress indicators

### 5. Progress Indicators

**Patterns**:

1. **Processing Card** (DualProcessingResults-style):
    - Multi-step progress visualization
    - Animated loading states
    - Phase messaging
    - Gradient progress bars
    - Circular progress indicators

2. **Status Badges**:
    - success, warning, error, info variants
    - Text + icon combinations
    - Animated states

### 6. Loading & State Components

**From Existing**:

- SkeletonLoader.svelte: Placeholder while loading
- LoadingModal.svelte: Full-modal loading state
- LoadingSkeleton.svelte: Individual skeleton elements

---

## Implementation Recommendations

### 1. Chat Session Panel

**Purpose**: View and manage chat history

**Structure**:

```
ChatPanel/
├── SessionList.svelte         # Reuse ChatModal sidebar pattern
├── SessionDetails.svelte       # Session metadata
├── SessionActions.svelte       # Rename, archive, delete
└── ContextIndicator.svelte     # Visual context type
```

**Key Props**:

- `sessions: ChatSession[]`
- `activeSessionId: string | null`
- `onSelectSession: (id: string) => void`
- `onDeleteSession: (id: string) => void`

### 2. Message Stream Component

**Purpose**: Display conversation history with streaming support

**Structure**:

```
MessageStream/
├── MessageList.svelte          # Message rendering loop
├── ChatMessage.svelte           # Individual message (reuse from ChatModal)
├── ToolVisualization.svelte     # Tool calls and results
└── StreamingIndicator.svelte    # "Assistant typing..." indicator
```

### 3. Context Selector

**Purpose**: Change session context (global, project, task, calendar)

**UI Pattern**:

```svelte
<div class="flex gap-2">
	{#each ['global', 'project', 'task', 'calendar'] as type}
		<Button
			variant={activeContext === type ? 'primary' : 'outline'}
			on:click={() => setContext(type)}
		>
			{contextMetaLabels[type].badge}
		</Button>
	{/each}
</div>
```

### 4. Tool Results Display

**Purpose**: Beautiful rendering of tool execution results

**Patterns**:

- **List Results**: Scrollable table or card grid
- **Detail Results**: Formatted key-value pairs
- **Actions Results**: Success confirmations
- **Calendar Results**: Timeline visualization

### 5. Token Usage Monitor

**Purpose**: Show LLM token consumption

**Implementation**:

```typescript
// Track from chat_sessions.total_tokens_used
// Display in session header or sidebar

let estimatedCost = totalTokens * costPerToken;
```

### 6. Error Boundaries

**Patterns from Existing**:

- Alert component for dismissable errors
- Toast service for transient messages
- Retry buttons for failed operations

---

## Database Integration Checklist

### For Chat System Implementation

- [ ] Verify RLS policies enforce user isolation
- [ ] Create indexes for common queries:
    - Chat sessions by user + status
    - Messages by session (ordered by created_at)
    - Tool executions by session
- [ ] Set up triggers for auto-stats:
    - Update message_count on INSERT
    - Update tool_call_count on tool execution
    - Update last_message_at
- [ ] Plan compression strategy:
    - When to trigger? (token threshold)
    - Cleanup policy for old sessions
- [ ] Cache invalidation:
    - Expire context cache after 1 hour
    - Manual invalidation on entity changes

### Supabase Client Setup

- [ ] Verify public/anon key configuration
- [ ] Test RLS policies with test user
- [ ] Set up real-time channel for message streaming
- [ ] Configure admin client for background jobs

---

## Service Layer Patterns

### Chat Service Structure

```typescript
// src/lib/services/chat.service.ts
export const chatService = {
  // Session management
  async createSession(contextType, entityId): Promise<ChatSession> { },
  async loadSession(sessionId): Promise<ChatSession & { messages: ChatMessage[] }> { },
  async updateSessionTitle(sessionId, title): Promise<ChatSession> { },
  async deleteSession(sessionId): Promise<void> { },

  // Messages
  async sendMessage(sessionId, content): Promise<ChatMessage> { },
  async streamMessage(sessionId, content, onChunk): Promise<void> { },

  // Tool execution
  async executeToolCall(sessionId, toolCall): Promise<ChatToolResult> { },

  // Real-time
  subscribeToMessages(sessionId, onMessage): () => void,
  subscribeToSessions(userId, onUpdate): () => void,
};
```

### Realtime Subscription Pattern

```typescript
// Auto-cleanup on component destroy
let unsubscribe: (() => void) | null = null;

onMount(() => {
	unsubscribe = chatService.subscribeToMessages(sessionId, (message) => {
		messages = [...messages, message];
	});

	return () => unsubscribe?.();
});
```

---

## Security Considerations

### RLS Enforcement

- All chat tables protected by RLS
- Messages only accessible via session ownership check
- Tool executions scoped to user's sessions

### Token Handling

- Never expose token counts directly to users
- Store in DB for cost accounting
- Use for internal optimization only

### Input Validation

- Validate message length before INSERT
- Sanitize tool arguments
- Rate limit message sending per user

### Data Privacy

- Compressed summaries should not leak sensitive data
- Tool results should be validated before display
- Consider encryption for sensitive session content

---

## Performance Optimization

### Pagination Strategy

```typescript
// Load messages in chunks, not all at once
const MESSAGES_PER_PAGE = 50;

const { data: messages } = await supabase
	.from('chat_messages')
	.select('*')
	.eq('session_id', sessionId)
	.order('created_at', { ascending: false })
	.range(page * MESSAGES_PER_PAGE, (page + 1) * MESSAGES_PER_PAGE - 1);
```

### Caching Strategy

- Context cache: 1-hour expiration
- Session metadata: Update on last_message_at change
- Message list: Progressive loading with pagination

### Index Strategy

- Composite index on (user_id, status) for active sessions
- Index on (session_id, created_at) for message ordering
- Index on tool_name for analytics queries

---

## Example: Agent Operation Logs Display

Based on brain dump operation display patterns:

```svelte
<div class="space-y-4">
	{#each groupedOperations as group}
		<div class="border rounded-lg overflow-hidden">
			<!-- Header -->
			<div class="bg-gray-100 px-4 py-3 flex items-center justify-between">
				<div class="flex items-center gap-2">
					<span class="font-semibold text-lg">
						{group.operation.toUpperCase()}
					</span>
					<Badge>{group.operations.length} items</Badge>
				</div>
				<Button variant="ghost" on:click={() => toggleGroup(group.operation)}>
					{expandedGroups.has(group.operation) ? 'Collapse' : 'Expand'}
				</Button>
			</div>

			{#if expandedGroups.has(group.operation)}
				<!-- Operations List -->
				<div class="divide-y">
					{#each group.operations as op (op.id)}
						<OperationRow {op} />
					{/each}
				</div>
			{/if}
		</div>
	{/each}
</div>
```

---

## Conclusion

The BuildOS platform provides a solid foundation for the conversational agent interface:

1. **Database**: Chat tables are comprehensive with progressive disclosure, token tracking, and compression support
2. **Supabase**: Well-configured with RLS, real-time, and proper client patterns
3. **UI Components**: Rich library of reusable components (modals, forms, cards, badges)
4. **Patterns**: Established patterns for operations display, streaming updates, and error handling

**Next Steps**:

- Implement chat service layer (wrapper around Supabase)
- Create SessionPanel component (reuse ChatModal patterns)
- Build MessageStream component (reuse ChatMessage patterns)
- Set up real-time subscriptions for live updates
- Integrate token usage monitoring
- Implement context-aware tool calling
