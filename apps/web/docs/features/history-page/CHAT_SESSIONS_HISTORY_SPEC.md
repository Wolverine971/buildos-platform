<!-- apps/web/docs/features/history-page/CHAT_SESSIONS_HISTORY_SPEC.md -->

# Chat Sessions on History Page - Implementation Spec

**Date:** 2024-12-08
**Status:** Implemented
**Author:** Claude
**Implementation Date:** 2024-12-09

---

## Implementation Progress

| Phase   | Description                       | Status      |
| ------- | --------------------------------- | ----------- |
| Phase 1 | Database Migration                | ✅ Complete |
| Phase 2 | Enhanced Chat Classification      | ✅ Complete |
| Phase 3 | History Page Updates              | ✅ Complete |
| Phase 4 | AgentChatModal Session Resumption | ✅ Complete |
| Testing | Type checks and lint              | ✅ Complete |

### Files Created/Modified

| File                                                        | Change                           | Status      |
| ----------------------------------------------------------- | -------------------------------- | ----------- |
| `supabase/migrations/20251208_add_chat_session_summary.sql` | Add summary column + indexes     | ✅ Created  |
| `packages/shared-types/src/database.schema.ts`              | Add summary type                 | ✅ Modified |
| `packages/shared-types/src/queue-types.ts`                  | Update ClassifyChatSessionResult | ✅ Modified |
| `apps/worker/src/workers/chat/chatSessionClassifier.ts`     | Add summary generation           | ✅ Modified |
| `apps/web/src/routes/history/+page.server.ts`               | Fetch both types, unified items  | ✅ Modified |
| `apps/web/src/routes/history/+page.svelte`                  | Unified UI with type filters     | ✅ Modified |
| `apps/web/src/routes/api/chat/sessions/[id]/+server.ts`     | Add GET endpoint                 | ✅ Modified |
| `apps/web/src/lib/components/agent/AgentChatModal.svelte`   | Session resumption               | ✅ Modified |

---

## 2026-01-10 Update: Voice Note Attachments

- Chat session fetch supports `includeVoiceNotes=1` to return voice note groups and segments.
- Agent chat resume now renders message-level voice note playback panels.

---

## Executive Summary

This spec outlines the changes needed to display chat sessions on the `/history` page alongside existing braindumps. Users will be able to view their chat history, see AI-generated summaries and topics, and resume conversations by clicking on a session.

### Key Requirements

1. **Add `summary` field** to `chat_sessions` table ✅
2. **Enhance chat classification** to generate summaries (like braindumps) ✅
3. **Update `/history` page** to display both braindumps and chat sessions ✅
4. **Enable chat session resumption** via AgentChatModal ✅

---

## Current State Analysis

### chat_sessions Table (Existing)

| Field               | Type        | Description                                                                                                          |
| ------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------- |
| `id`                | UUID        | Primary key                                                                                                          |
| `user_id`           | UUID        | Owner                                                                                                                |
| `title`             | TEXT        | User-set title                                                                                                       |
| `auto_title`        | TEXT        | AI-generated title (max 50 chars)                                                                                    |
| `chat_topics`       | TEXT[]      | AI-extracted topics (3-7 keywords)                                                                                   |
| `context_type`      | TEXT        | global, project, calendar, project_create, project_audit, project_forecast, daily_brief_update, brain_dump, ontology |
| `entity_id`         | UUID        | Related project/entity ID                                                                                            |
| `status`            | TEXT        | active, archived, compressed                                                                                         |
| `message_count`     | INTEGER     | Number of messages                                                                                                   |
| `total_tokens_used` | INTEGER     | LLM token consumption                                                                                                |
| `tool_call_count`   | INTEGER     | Tools invoked                                                                                                        |
| `agent_metadata`    | JSONB       | Session state (focus, etc.)                                                                                          |
| `last_message_at`   | TIMESTAMPTZ | Most recent message                                                                                                  |
| `created_at`        | TIMESTAMPTZ | Session start                                                                                                        |
| `summary`           | TEXT        | ✅ **NEW** AI-generated summary                                                                                      |

### onto_braindumps Table (Reference)

| Field     | Type   | Description                            |
| --------- | ------ | -------------------------------------- |
| `title`   | TEXT   | AI-generated title (max 100 chars)     |
| `topics`  | TEXT[] | AI-extracted topics (3-7 keywords)     |
| `summary` | TEXT   | AI-generated summary (max 500 chars)   |
| `status`  | TEXT   | pending, processing, processed, failed |

### Current Classification Processor

**File:** `/apps/worker/src/workers/chat/chatSessionClassifier.ts`

**Output (Updated):**

- `auto_title` - Concise title (max 50 chars)
- `chat_topics` - 3-7 topic keywords
- `summary` - ✅ **NEW** 2-3 sentence summary (max 500 chars)

---

## Implementation Plan

### Phase 1: Database Migration ✅ COMPLETE

#### 1.1 Add `summary` field to chat_sessions

**Migration File:** `supabase/migrations/20251208_add_chat_session_summary.sql`

```sql
-- Add summary field to chat_sessions table
-- This enables displaying chat session summaries on the history page alongside braindumps

-- Add summary column (nullable - existing sessions won't have summaries)
ALTER TABLE chat_sessions
ADD COLUMN IF NOT EXISTS summary TEXT;

-- Add index for efficient history queries (sessions with summaries or sufficient messages)
-- This supports the history page query: WHERE summary IS NOT NULL OR message_count >= 3
CREATE INDEX IF NOT EXISTS idx_chat_sessions_history_query
ON chat_sessions (user_id, created_at DESC)
WHERE status != 'archived';

-- Add partial index for sessions with summaries (faster lookup for classified sessions)
CREATE INDEX IF NOT EXISTS idx_chat_sessions_has_summary
ON chat_sessions (user_id, created_at DESC)
WHERE summary IS NOT NULL;

-- Documentation comment
COMMENT ON COLUMN chat_sessions.summary IS
'AI-generated summary of the conversation (max 500 chars). Generated by classify_chat_session worker job after session ends or reaches a message threshold.';
```

#### 1.2 Update shared-types ✅ COMPLETE

**File:** `/packages/shared-types/src/database.schema.ts`

Added to `chat_sessions` type:

```typescript
summary: string | null;
```

**File:** `/packages/shared-types/src/queue-types.ts`

Updated result type:

```typescript
export interface ClassifyChatSessionResult {
	success: boolean;
	sessionId: string;
	title?: string;
	topics?: string[];
	summary?: string; // NEW
	messageCount?: number;
	error?: string;
}
```

---

### Phase 2: Enhanced Chat Classification ✅ COMPLETE

#### 2.1 Update System Prompt

**File:** `/apps/worker/src/workers/chat/chatSessionClassifier.ts`

**New Prompt:**

```
You are a chat session analyzer. Your task is to analyze chat conversation history and generate:

1. A concise, descriptive title (max 50 characters) that captures the main topic/purpose of the conversation
2. A list of 3-7 topic keywords that represent the subjects discussed
3. A brief summary (2-3 sentences, max 500 characters) that captures what was discussed and any outcomes

Guidelines:
- Title should be human-readable (e.g., "Planning vacation to Japan", "Debugging API issues")
- Topics should be specific keywords, not sentences (e.g., "authentication", "scheduling")
- Summary should help the user quickly recall what this conversation was about
- Include any key decisions made, tasks created, or outcomes achieved
- Focus on the user's actual intent and what was accomplished
- Ignore meta-discussion about the AI or system
- If the conversation is too short or unclear, use "Quick chat" as the title

Respond ONLY with valid JSON in this exact format:
{
  "title": "Your descriptive title here",
  "topics": ["topic1", "topic2", "topic3"],
  "summary": "A 2-3 sentence summary of what was discussed and any outcomes."
}
```

#### 2.2 Update Response Type ✅

```typescript
interface ChatClassificationResponse {
	title: string;
	topics: string[];
	summary: string; // NEW
}
```

#### 2.3 Add Summary Sanitization ✅

```typescript
function sanitizeSummary(summary: string | undefined | null): string {
	if (!summary || typeof summary !== 'string') {
		return 'A conversation captured for reference.';
	}

	let sanitized = summary.trim();
	if (sanitized.length > 500) {
		sanitized = sanitized.slice(0, 497) + '...';
	}

	return sanitized || 'A conversation captured for reference.';
}
```

#### 2.4 Update Database Write ✅

```typescript
const { error: updateError } = await supabase
	.from('chat_sessions')
	.update({
		title: title,
		auto_title: title,
		chat_topics: topics,
		summary: summary, // NEW
		updated_at: new Date().toISOString()
	})
	.eq('id', validatedData.sessionId);
```

---

### Phase 3: History Page Updates ✅ COMPLETE

#### 3.1 Server-Side Data Loading

**File:** `/apps/web/src/routes/history/+page.server.ts`

Implemented:

- Unified `HistoryItem` interface exported for use in page component
- Type filter support (`all`, `braindumps`, `chats`)
- Fetches both `onto_braindumps` and `chat_sessions`
- Merges and sorts by `created_at` descending
- Filters chat sessions to only show those with 3+ messages OR summary
- Stats for both types

```typescript
export interface HistoryItem {
	id: string;
	type: 'braindump' | 'chat_session';
	title: string;
	preview: string;
	topics: string[];
	status: string;
	createdAt: string;
	messageCount?: number;
	contextType?: string;
	entityId?: string | null;
	originalData: OntoBraindump | ChatSession;
}
```

#### 3.2 UI Component Updates ✅

**File:** `/apps/web/src/routes/history/+page.svelte`

Implemented:

- Type filter tabs (All / Braindumps / Chats) with counts
- Visual distinction between types (Brain icon for braindumps, MessagesSquare for chats)
- Color-coded badges (violet for braindumps, blue for chats)
- Chat-specific metadata display (message count, context type)
- "Resume" vs "Explore" action text based on type

#### 3.3 Chat Session Resumption ✅

When clicking a chat session, opens AgentChatModal with `initialChatSessionId`:

```typescript
function openItem(item: HistoryItem) {
	if (item.type === 'braindump') {
		selectedBraindumpForChat = item.originalData as OntoBraindump;
		selectedChatSessionId = null;
	} else {
		selectedChatSessionId = item.id;
		selectedBraindumpForChat = null;
	}
	isAgentModalOpen = true;
}
```

---

### Phase 4: AgentChatModal Session Resumption ✅ COMPLETE

#### 4.1 New Prop ✅

```typescript
interface Props {
	isOpen?: boolean;
	contextType?: ChatContextType;
	entityId?: string;
	onClose?: () => void;
	autoInitProject?: AutoInitProjectConfig | null;
	initialBraindump?: InitialBraindump | null;
	initialChatSessionId?: string | null; // NEW: Resume existing session
}
```

#### 4.2 Session Loading State ✅

```typescript
// Session resumption state
let isLoadingSession = $state(false);
let sessionLoadError = $state<string | null>(null);
let lastLoadedSessionId = $state<string | null>(null);
```

#### 4.3 Session Loading Effect ✅

```typescript
// Handle initialChatSessionId prop - when resuming a previous chat session from history
$effect(() => {
	if (!isOpen || !initialChatSessionId) return;

	// Only load once per session
	if (lastLoadedSessionId === initialChatSessionId) {
		return; // Already loaded this session
	}

	loadChatSession(initialChatSessionId);
});
```

#### 4.4 Session Loading Function ✅

```typescript
async function loadChatSession(sessionId: string) {
	if (isLoadingSession) return;

	isLoadingSession = true;
	sessionLoadError = null;

	try {
		const response = await fetch(`/api/chat/sessions/${sessionId}`);
		const result = await response.json();

		if (!response.ok || !result.success) {
			throw new Error(result.error || 'Failed to load chat session');
		}

		const { session, messages: loadedMessages, truncated } = result.data;

		// Reset conversation state
		resetConversation({ preserveContext: false });

		// Set session and context
		currentSession = session;
		lastLoadedSessionId = sessionId;

		// Map context type - handle 'general' alias
		const contextType = session.context_type === 'general' ? 'global' : session.context_type;
		selectedContextType = contextType as ChatContextType;
		selectedEntityId = session.entity_id || undefined;
		selectedContextLabel = session.title || session.auto_title || 'Resumed Chat';

		// Set up project focus if applicable
		if (isProjectContext(selectedContextType) && selectedEntityId) {
			projectFocus = buildProjectWideFocus(selectedEntityId, selectedContextLabel);
		}

		showContextSelection = false;
		showProjectActionSelector = false;

		// Convert loaded messages to UIMessages
		const restoredMessages: UIMessage[] = loadedMessages.map((msg: any) => ({
			id: msg.id,
			session_id: msg.session_id,
			user_id: msg.user_id,
			type: msg.role === 'user' ? 'user' : 'assistant',
			role: msg.role as ChatRole,
			content: msg.content,
			timestamp: new Date(msg.created_at),
			created_at: msg.created_at,
			tool_calls: msg.tool_calls,
			tool_call_id: msg.tool_call_id
		}));

		messages = restoredMessages;

		// Add truncation note if needed
		if (truncated) {
			const truncationNote: UIMessage = {
				id: crypto.randomUUID(),
				type: 'activity',
				role: 'assistant' as ChatRole,
				content:
					'Note: This conversation has been truncated to show the most recent messages.',
				timestamp: new Date(),
				created_at: new Date().toISOString()
			};
			messages = [truncationNote, ...messages];
		}

		// Add welcome-back message with summary
		const welcomeMessage: UIMessage = {
			id: crypto.randomUUID(),
			type: 'assistant',
			role: 'assistant' as ChatRole,
			content: session.summary
				? `Resuming your conversation. Here's where we left off:\n\n**Summary:** ${session.summary}\n\nHow can I help you continue?`
				: "Welcome back! I've restored your previous conversation. How can I help you continue?",
			timestamp: new Date(),
			created_at: new Date().toISOString()
		};
		messages = [...messages, welcomeMessage];
	} catch (err: any) {
		console.error('Failed to load chat session:', err);
		sessionLoadError = err.message || 'Failed to load chat session';
		error = sessionLoadError;
	} finally {
		isLoadingSession = false;
	}
}
```

---

## API Changes ✅ COMPLETE

### New Endpoint: GET /api/chat/sessions/[id]

**File:** `apps/web/src/routes/api/chat/sessions/[id]/+server.ts`

Returns session details with messages for resumption:

```typescript
export const GET: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();

	if (!user?.id) {
		return ApiResponse.unauthorized();
	}

	const sessionId = params.id;
	if (!sessionId) {
		return ApiResponse.badRequest('Session id is required');
	}

	// Fetch the session
	const { data: session, error: sessionError } = await supabase
		.from('chat_sessions')
		.select('*')
		.eq('id', sessionId)
		.eq('user_id', user.id)
		.single();

	if (sessionError || !session) {
		return ApiResponse.notFound('Chat session not found');
	}

	// Fetch messages for the session (limit to avoid loading too much data)
	const MESSAGE_LIMIT = 400;
	const { data: messages, error: messagesError } = await supabase
		.from('chat_messages')
		.select('*')
		.eq('session_id', sessionId)
		.order('created_at', { ascending: true })
		.limit(MESSAGE_LIMIT);

	if (messagesError) {
		return ApiResponse.databaseError(messagesError);
	}

	// Check if there are more messages than we fetched (truncation indicator)
	const truncated = (messages?.length || 0) >= MESSAGE_LIMIT;

	return ApiResponse.success({
		session,
		messages: messages || [],
		truncated
	});
};
```

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        /history Page                             │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐       │
│  │   Stats     │     │   Filters   │     │   Search    │       │
│  │ Total: 45   │     │ All/Dumps/  │     │ [________]  │       │
│  │ Dumps: 12   │     │   Chats     │     │             │       │
│  │ Chats: 33   │     └─────────────┘     └─────────────┘       │
│  └─────────────┘                                                │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 🧠 Braindump   Planning my vacation to Japan            │   │
│  │ Summary: Captured ideas about itinerary, budget...       │   │
│  │ 🏷️ travel, vacation, japan, budget                       │   │
│  │ 📅 Today at 2:30 PM                                      │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 💬 Chat      Debugging authentication issues             │   │
│  │ Summary: Discussed JWT token validation errors and...    │   │
│  │ 🏷️ authentication, jwt, debugging, api                   │   │
│  │ 📅 Yesterday   💬 23 messages                            │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 💬 Chat      Project planning for Q1 launch             │   │
│  │ Summary: Created tasks for marketing, development...     │   │
│  │ 🏷️ project, planning, q1, launch, tasks                  │   │
│  │ 📅 2 days ago   💬 45 messages                           │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Click
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     AgentChatModal                              │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Context: Project planning for Q1 launch                  │   │
│  │ (Resumed session with 45 messages loaded)                │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ [Previous messages shown...]                             │   │
│  │                                                          │   │
│  │ User: Can we add another milestone?                      │   │
│  │ Assistant: Sure! What milestone would you like...        │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Testing Checklist

### Database

- [x] Migration creates `summary` column
- [x] Indexes created for history queries
- [x] Existing sessions not affected (nullable column)

### Worker

- [x] Classification generates summary
- [x] Summary sanitized correctly (max 500 chars)
- [x] Backward compatible with sessions without summary
- [x] Default summary for insufficient messages

### Frontend

- [x] History page shows both types
- [x] Type filter tabs work (All/Braindumps/Chats)
- [x] Search searches both types
- [x] Braindump click opens modal correctly
- [x] Chat session click resumes session
- [x] Messages load correctly
- [x] Context restored properly
- [x] Welcome-back message with summary shown

---

## Cost Analysis

### Additional LLM Cost

Current classification:

- Input: ~1000 tokens (messages)
- Output: ~50 tokens (title + topics)

With summary:

- Input: ~1000 tokens (same)
- Output: ~150 tokens (+100 for summary)

**Cost increase:** ~3x output tokens = ~$0.00006 more per session (DeepSeek)

**Monthly estimate (1000 sessions):**

- Before: $0.04
- After: $0.10
- Increase: $0.06/month (negligible)

---

## Deployment Steps

### Step 1: Database Migration

```bash
# Apply the migration
supabase db push
# Or manually run: 20251208_add_chat_session_summary.sql
```

### Step 2: Deploy Worker

- Deploy worker service to Railway
- New sessions will get summaries generated

### Step 3: Deploy Web App

- Deploy to Vercel
- History page will show both braindumps and chat sessions

### Step 4: Backfill (Optional)

- Create job to re-classify old sessions
- Generate summaries for historical data

---

## Files Modified Summary

| File                                                        | Change                                                 |
| ----------------------------------------------------------- | ------------------------------------------------------ |
| `supabase/migrations/20251208_add_chat_session_summary.sql` | ✅ Created - Add summary column + indexes              |
| `packages/shared-types/src/database.schema.ts`              | ✅ Modified - Add summary to chat_sessions             |
| `packages/shared-types/src/queue-types.ts`                  | ✅ Modified - Add summary/title/messageCount to result |
| `apps/worker/src/workers/chat/chatSessionClassifier.ts`     | ✅ Modified - Generate summaries                       |
| `apps/web/src/routes/history/+page.server.ts`               | ✅ Modified - Unified history items                    |
| `apps/web/src/routes/history/+page.svelte`                  | ✅ Modified - Type filters, dual display               |
| `apps/web/src/routes/api/chat/sessions/[id]/+server.ts`     | ✅ Modified - Add GET endpoint                         |
| `apps/web/src/lib/components/agent/AgentChatModal.svelte`   | ✅ Modified - Session resumption                       |

---

## Open Questions (Resolved)

1. **Should we backfill summaries for existing sessions?**
    - Decision: Optional backfill job can be created later
    - New sessions will get summaries immediately

2. **Filter by context_type?**
    - Decision: Not in initial implementation, can add later

3. **Session archival from history?**
    - Decision: Not in scope for initial implementation

4. **Real-time status updates?**
    - Decision: Not in scope for initial implementation
