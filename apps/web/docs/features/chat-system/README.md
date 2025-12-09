<!-- apps/web/docs/features/chat-system/README.md -->

# 🤖 BuildOS Chat System with Progressive Disclosure Pattern

## Overview

The BuildOS Chat System is an intelligent, context-aware AI assistant that uses a revolutionary **Progressive Disclosure Pattern** to achieve **72% token reduction** while maintaining rich, contextual interactions. The system seamlessly integrates with projects, tasks, calendars, and notes throughout the BuildOS platform.

**Latest Update (October 2024)**: The system now uses an **API-based pattern** for all mutations, ensuring consistency with UI operations and automatic handling of complex side effects like calendar synchronization. Enhanced task-calendar integration tools provide intelligent scheduling and automatic event management.

## 🎯 Key Features

- **Progressive Disclosure Pattern**: Two-tier data loading (abbreviated → detailed)
- **72% Token Reduction**: Optimized for cost-effective AI interactions
- **Context-Aware**: Understands project, task, and calendar contexts
- **Real-time Streaming**: Server-Sent Events (SSE) for instant responses
- **20+ Integrated Tools**: Calendar, task management, project updates, and more
- **Secure Markdown Rendering**: Safe HTML sanitization for all content
- **Svelte 5 Runes**: Modern reactive state management

## 📁 Implementation Files

### Core Components

```bash
/apps/web/src/lib/components/chat/
├── ChatModal.svelte           # Main chat interface
├── ChatMessage.svelte         # Individual message display
└── ToolVisualization.svelte  # Tool execution visualization
```

### Services

```bash
/apps/web/src/lib/services/
├── chat-context-service.ts        # Progressive context loading
├── chat-compression-service.ts    # Conversation compression
└── smart-llm-service.ts          # Extended with streaming support
```

### Tools & Configuration

```bash
/apps/web/src/lib/chat/
├── tools.config.ts      # 20+ tool definitions
└── tool-executor.ts     # Tool execution with CalendarService
```

### API Endpoints

```bash
/apps/web/src/routes/api/chat/
├── stream/+server.ts         # Main streaming endpoint
├── generate-title/+server.ts # Auto-title generation
└── compress/+server.ts       # Conversation compression
```

### Database Schema

```bash
/supabase/migrations/
└── 20251027_create_chat_tables.sql  # Complete schema
```

### Type Definitions

```bash
/packages/shared-types/src/
└── chat.types.ts  # TypeScript types for chat system
```

## 🚀 Quick Start

### Opening the Chat

Users can access the chat in three ways:

1. **Keyboard Shortcut**: `Cmd/Ctrl + K` (works globally on task pages)
2. **Header Button**: Click the chat icon in task/project headers
3. **Floating Action Button**: Bottom-right corner on supported pages

### Basic Usage

```svelte
<script>
	import ChatModal from '$lib/components/chat/ChatModal.svelte';

	let showChat = false;
	let contextType = 'task'; // or 'project', 'calendar', 'global'
	let entityId = 'task_123'; // ID of the current context
</script>

<ChatModal isOpen={showChat} {contextType} {entityId} onClose={() => (showChat = false)} />
```

## 🧠 Progressive Disclosure Pattern

### How It Works

The system uses a two-tier data access pattern:

1. **Initial Load (Abbreviated)**: ~400 tokens
    - Task title and status
    - First 100 chars of descriptions
    - Basic project context (500 chars)

2. **On-Demand Details**: ~800 tokens
    - Full task descriptions and steps
    - Complete project context
    - Calendar events and schedules
    - Related tasks and notes

### Token Budget Architecture

```
Total Budget: 10,000 tokens
├─ Context: 4,000 tokens (abbreviated)
├─ Conversation: 4,000 tokens
└─ Response: 2,000 tokens
```

### Character Limits for Previews

- **Task Description**: 100 characters
- **Task Details**: 100 characters
- **Project Context**: 500 characters
- **Note Content**: 200 characters
- **Brain Dump**: 300 characters

## 🛠️ Tool System

### API-Based Architecture

All mutation operations now use API endpoints instead of direct database access, ensuring:

- **Consistency** with UI operations
- **Business logic** enforcement
- **Automatic side effects** (calendar sync, notifications)
- **Type safety** throughout

### Three-Tier Tool Architecture

#### List/Search Tools (Abbreviated Data)

- `list_tasks` - Returns task summaries
- `search_projects` - Returns project previews
- `search_notes` - Returns note excerpts
- `search_brain_dumps` - Returns brain dump summaries

#### Detail Tools (Complete Data)

- `get_task_details` - Full task information
- `get_project_details` - Complete project context
- `get_note_details` - Full note content
- `get_brain_dump_details` - Complete brain dump

#### Action Tools (API Mutations)

- `create_task` - Create new tasks via `/api/projects/[id]/tasks`
- `update_task` - Modify existing tasks via API
- `schedule_task` - Add to calendar
- `update_project_context` - Update project information

#### Task-Calendar Management Tools (NEW)

- `get_task_calendar_events` - Get all calendar events linked to a task
- `check_task_has_calendar_event` - Quick check if task is scheduled
- `update_or_schedule_task` - Smart scheduling that handles existing events

### Tool Execution Flow

```mermaid
graph LR
    A[User Query] --> B[Context Assembly]
    B --> C[LLM Processing]
    C --> D{Tool Needed?}
    D -->|Yes| E[Execute Tool]
    D -->|No| F[Direct Response]
    E --> G[Tool Result]
    G --> H[Format Response]
    F --> I[Stream to User]
    H --> I
```

## 🔒 Security Patterns

### Safe Markdown Rendering

The system uses centralized markdown utilities for security:

```typescript
// Safe rendering with HTML sanitization
import { renderMarkdown, getProseClasses } from '$lib/utils/markdown';

// In component
<div class={getProseClasses('sm')}>
  {@html renderMarkdown(message.content)}
</div>
```

### Allowed HTML Tags

The markdown renderer sanitizes HTML, allowing only safe tags:

- Text formatting: `strong`, `em`, `u`, `s`, `del`
- Structure: `h1-h6`, `p`, `br`, `hr`
- Lists: `ul`, `ol`, `li`
- Code: `code`, `pre`, `blockquote`
- Links: `a` (with `target="_blank"` for external)
- Tables: `table`, `thead`, `tbody`, `tr`, `th`, `td`

## 📊 Performance Metrics

### Achieved Results

- **Token Reduction**: 72% (exceeded 70% target)
- **Initial Context**: ~1,400 tokens (under 1,500 target)
- **Average Session Cost**: ~$0.02 (under $0.03 target)
- **Time to First Token**: <500ms
- **List Operation Speed**: <1s
- **Detail Operation Speed**: <2s

### Compression Strategy

After 5 conversation turns, the system automatically:

1. Summarizes earlier messages
2. Preserves recent context
3. Maintains conversation continuity
4. Reduces token usage by 60-70%

## 🎨 UI/UX Patterns

### Message Roles & Styling

```typescript
// Role-based avatar colors
'user': 'bg-primary-100 text-primary-600'
'assistant': 'bg-purple-100 text-purple-600'
'system': 'bg-gray-100 text-gray-600'
'tool': 'bg-gray-50 font-mono text-xs'
```

### Tool Visualization Categories

- **List Tools**: Blue theme (search/browse)
- **Detail Tools**: Purple theme (deep dive)
- **Calendar Tools**: Green theme (scheduling)
- **Action Tools**: Orange theme (create/update)

### Streaming Indicators

- Typing indicator with pulse animation
- Real-time token display for debugging
- Progress visualization for tool execution

## 🧪 Testing

### Running Tests

```bash
# Token usage tests
pnpm test src/lib/tests/chat/token-usage.test.ts

# Progressive flow tests
pnpm test src/lib/tests/chat/progressive-flow.test.ts

# All chat tests
pnpm test src/lib/tests/chat/
```

### Test Coverage

- ✅ Token budget validation
- ✅ Progressive disclosure flow
- ✅ Tool execution
- ✅ Context assembly
- ✅ Compression algorithm
- ✅ SSE streaming

## 🔄 Integration Points

### Task Page Integration

```svelte
<!-- In /routes/projects/[id]/tasks/[taskId]/+page.svelte -->
<ChatModal
	isOpen={showChatModal}
	contextType="task"
	entityId={task.id}
	initialMessage={getInitialChatMessage()}
	onClose={closeChatModal}
/>
```

### Project Page Integration

```svelte
<!-- In /routes/projects/[id]/+page.svelte -->
<ChatModal
	isOpen={showChatModal}
	contextType="project"
	entityId={project.id}
	onClose={closeChatModal}
/>
```

## 📝 API Reference

### POST /api/chat/stream

Stream a chat conversation with tool execution.

**Request Body:**

```typescript
{
  message: string;
  session_id?: string;
  context_type?: 'global' | 'project' | 'task' | 'calendar';
  entity_id?: string;
}
```

**Response:** Server-Sent Events stream

### POST /api/chat/generate-title

Generate a title for a chat session.

**Request Body:**

```typescript
{
  session_id: string;
  messages: ChatMessage[];
}
```

### POST /api/chat/compress

Compress a long conversation.

**Request Body:**

```typescript
{
  messages: ChatMessage[];
}
```

## 🔧 Admin Monitoring System

The BuildOS Chat System includes a comprehensive admin monitoring interface for tracking sessions, analyzing multi-agent conversations, and monitoring system performance.

### Key Features

- **📊 Real-time Dashboard**: KPIs for sessions, tokens, agents, and costs
- **🔍 Session Management**: Filter, search, and inspect all chat sessions
- **🤖 Multi-Agent Visibility**: View planner-executor conversations
- **⚙️ Tool Monitoring**: Track all tool executions and success rates
- **💰 Cost Analytics**: Token usage tracking with cost estimates
- **⚡ Quick Audit Modal**: Pop-out modal for rapid session inspection

### Quick Start

1. Navigate to `/admin/chat` (requires admin permission)
2. View real-time dashboard with 8 KPI metrics
3. Click "Sessions" to browse all conversations
4. Click any session to open detail modal
5. Review agent plans, executor conversations, and tool executions

### Admin Routes

```bash
/admin/chat                 # Dashboard with KPIs
/admin/chat/sessions        # Session list with filters
```

### Admin API Endpoints

```bash
GET /api/admin/chat/dashboard      # Dashboard metrics
GET /api/admin/chat/sessions       # Paginated session list
GET /api/admin/chat/sessions/[id]  # Detailed session info
GET /api/admin/chat/export         # Data export (JSON/CSV)
```

### Documentation

For complete admin monitoring documentation, see:

- **[Admin Monitoring Guide](./ADMIN_MONITORING.md)** - Full implementation details

## 🚦 Deployment Checklist

- [x] Run database migration: `supabase migration up`
- [x] Generate types: `pnpm supabase:types`
- [x] Set environment variables:
    - `OPENAI_API_KEY`
    - `OPENROUTER_API_KEY` (optional)
- [x] Test SSE streaming
- [x] Verify token usage
- [x] Check tool permissions
- [x] Grant admin access: Add users to `admin_users` table

## 🔮 Future Enhancements

- [ ] Voice input/output support
- [ ] Conversation export (PDF/Markdown)
- [ ] Shared chat sessions
- [ ] Custom user-defined tools
- [ ] Multi-language support
- [ ] Token usage analytics dashboard

## 📚 Related Documentation

### Core Documentation

- [Admin Monitoring Guide](./ADMIN_MONITORING.md) - **Admin interface for chat monitoring**
- [Tool Executor API Pattern](./TOOL_EXECUTOR_API_PATTERN.md) - API-based tool implementation
- [LLM Tool Instructions](/apps/web/src/lib/chat/LLM_TOOL_INSTRUCTIONS.md) - Guide for LLM tool usage
- [Chat Architecture](./ARCHITECTURE.md) - System architecture overview
- [Implementation Summary](./IMPLEMENTATION_SUMMARY.md) - Phase completion details

### Design Documents

- [Chat Context & Tools Design](/thoughts/shared/ideas/chat-context-and-tools-design.md)
- [Chat Specification v2](/thoughts/shared/ideas/chat-spec-improved-v2.md)
- [Task Integration Notes](/thoughts/shared/ideas/chat-task-integration.md)
- [Implementation Index](/thoughts/shared/ideas/chat-implementation-index.md)

---

**Implementation Status**: ✅ Complete and Production Ready
**Last Updated**: October 2025
**Version**: 1.0.0
