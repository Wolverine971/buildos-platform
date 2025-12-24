---
date: 2025-10-29
tags: [architecture, chat-system, agent-system, integration, context-service]
status: active
related:
    - 2025-10-28_chat-agent-unified-integration-plan.md
    - 2025-10-28_23-30-00_chat-agent-integration-architecture.md
path: thoughts/shared/research/2025-10-29_chat-agent-unified-architecture.md
---

# Chat-Agent Unified Architecture (Revised)

## Executive Summary

This document outlines the **revised unified architecture** for integrating the chat system and agent system in BuildOS. The key insight is to **leverage existing chat infrastructure** (ChatModal, chat-context-service) rather than duplicating functionality.

## Core Principles

1. **Single Base Modal**: Use `ChatModal.svelte` as the foundation
2. **Single Context Service**: Expand `chat-context-service.ts` to handle all modes
3. **Pre-Selection Flow**: Add "Context Selection Screen" before chat begins
4. **Tool-Based Architecture**: Different modes get different tools
5. **Progressive Disclosure**: Reactive modes use list/detail pattern, proactive modes use operations

## System Components

### 1. ContextSelectionScreen Component

**Purpose**: First screen users see to choose their chat context

**File**: `/src/lib/components/chat/ContextSelectionScreen.svelte`

**Flow**:

```
┌─────────────────────────────────────┐
│     Context Selection Screen        │
├─────────────────────────────────────┤
│                                     │
│  ┌───────────┬────────────┬──────┐ │
│  │  Global   │  New       │ Existing│
│  │  Chat     │  Project   │ Project│
│  │  🌍       │  ➕       │ 📁     │
│  └───────────┴────────────┴──────┘ │
│                                     │
│  If "Existing Project" clicked:     │
│  ┌───────────────────────────────┐ │
│  │  Select Project               │ │
│  │  • Active Projects (grid)     │ │
│  └───────────────────────────────┘ │
│                                     │
│  If project selected:               │
│  ┌───────────────────────────────┐ │
│  │  Choose Mode                  │ │
│  │  • Update  • Audit  • Forecast│ │
│  └───────────────────────────────┘ │
│                                     │
│  → Dispatches: { contextType, entityId }│
└─────────────────────────────────────┘
```

**Props**:

```typescript
interface Props {
	projects: Project[];
	onSelect: (selection: { contextType: ChatContextType; entityId?: string }) => void;
}
```

**Context Types**:

- `global` - No project context, general assistant
- `project_create` - Guided project creation with dimension questions
- `project` - View/search existing project (reactive)
- `calendar` - Calendar operations (reactive)
- `general` - General assistant mode (proactive)
- `project_audit` - Audit project across dimensions (proactive)
- `project_forecast` - Scenario forecasting (proactive)
- `daily_brief_update` - Update brief preferences (proactive)
- `brain_dump` - Brain dump context (proactive)
- `ontology` - Ontology interactions (proactive)

### 2. Expanded chat-context-service.ts

**New Responsibilities**:

1. System prompt generation (✅ DONE in Phase 1)
2. **Tool definitions per context type** (NEW)
3. Context assembly with progressive disclosure
4. Token budgeting and management

**Tool Categories**:

#### Reactive Mode Tools (List/Detail Pattern)

```typescript
// For: global, project, task, calendar
const REACTIVE_TOOLS = {
  // LIST TOOLS (return abbreviated data)
  list_tasks: { ... },
  search_projects: { ... },
  search_notes: { ... },
  get_calendar_events: { ... },
  search_brain_dumps: { ... },

  // DETAIL TOOLS (drill down when needed)
  get_task_details: { ... },
  get_project_details: { ... },
  get_note_details: { ... },
  get_brain_dump_details: { ... },

  // READ-ONLY ACTIONS
  find_available_slots: { ... }
};
```

#### Proactive Mode Tools (Operation Pattern)

```typescript
// For: project_create, project, daily_brief_update, etc.
const PROACTIVE_TOOLS = {
  // PROJECT OPERATIONS
  create_project: { ... },
  update_project: { ... },
  update_project_dimension: { ... },

  // TASK OPERATIONS
  create_task: { ... },
  update_task: { ... },

  // CALENDAR OPERATIONS
  schedule_task: { ... },
  update_calendar_event: { ... },
  delete_calendar_event: { ... },

  // NOTE OPERATIONS
  create_note: { ... },

  // BRAIN DUMP OPERATIONS
  create_brain_dump: { ... }
};
```

**Method Structure**:

```typescript
class ChatContextService {
  // ✅ DONE
  public getSystemPrompt(
    contextType: ChatContextType,
    metadata?: SystemPromptMetadata
  ): string

  // NEW - Returns tools for given context
  public getTools(contextType: ChatContextType): ChatToolDefinition[]

  // NEW - Determines if tools should auto-execute or queue
  public shouldAutoExecute(contextType: ChatContextType): boolean

  // EXISTING
  public async assembleContext(...)
  public async loadLocationContext(...)
}
```

**Tool Selection Logic**:

```typescript
function getTools(contextType: ChatContextType): ChatToolDefinition[] {
	switch (contextType) {
		case 'global':
			return [
				...REACTIVE_TOOLS.list,
				...REACTIVE_TOOLS.detail,
				...PROACTIVE_TOOLS.note,
				...PROACTIVE_TOOLS.brain_dump
			];

		case 'project':
		case 'task':
		case 'calendar':
			return [...REACTIVE_TOOLS.list, ...REACTIVE_TOOLS.detail];

		case 'project_create':
			return [
				PROACTIVE_TOOLS.create_project,
				PROACTIVE_TOOLS.create_task,
				...REACTIVE_TOOLS.search // For reference
			];

		case 'project_update':
			return [
				PROACTIVE_TOOLS.update_project,
				PROACTIVE_TOOLS.update_task,
				PROACTIVE_TOOLS.create_task,
				...REACTIVE_TOOLS.detail
			];

		case 'project_audit':
			return [
				...REACTIVE_TOOLS.detail, // Read-only
				...REACTIVE_TOOLS.list
			];

		case 'project_forecast':
			return [
				...REACTIVE_TOOLS.detail, // Read-only
				...REACTIVE_TOOLS.list
			];

		case 'daily_brief_update':
			return [PROACTIVE_TOOLS.update_user_preferences];
	}
}
```

### 3. Updated ChatModal Integration

**File**: `/src/lib/components/chat/ChatModal.svelte`

**Modification Strategy**: Minimal changes to preserve existing functionality

**Changes**:

1. Add optional `showContextSelection` prop (default: false for backward compatibility)
2. Show ContextSelectionScreen when `showContextSelection=true` and no `contextType` set
3. Pass selected context to existing chat flow

**Pseudocode**:

```typescript
let selectedContextType = $state<ChatContextType | null>(contextType || null);
let selectedEntityId = $state<string | null>(entityId || null);
let showingSelection = $state(showContextSelection && !selectedContextType);

function handleContextSelect(selection: ContextSelection) {
	selectedContextType = selection.contextType;
	selectedEntityId = selection.entityId;
	showingSelection = false;

	// Start chat with selected context
	createNewSession();
}
```

### 4. API Endpoint Enhancement

**File**: `/src/routes/api/chat/stream/+server.ts`

**Current Flow**:

```
POST /api/chat/stream
  ├── Load/create session
  ├── Assemble context
  ├── Call LLM
  └── Stream response (SSE)
```

**Enhanced Flow**:

```
POST /api/chat/stream
  ├── Load/create session with context_type
  ├── Get system prompt (contextService.getSystemPrompt)
  ├── Get tools (contextService.getTools) ← NEW
  ├── Assemble context (progressive disclosure)
  ├── Call LLM with tools
  ├── Execute tool calls
  │   ├── If reactive mode → execute immediately
  │   └── If proactive mode → check auto_accept
  │       ├── true → execute
  │       └── false → queue for approval
  └── Stream response (SSE)
```

### 5. Tool Execution Architecture

**Reactive Mode** (Immediate Execution):

```typescript
// Tools execute immediately, results streamed back
async function executeReactiveTool(toolCall: ChatToolCall) {
	const result = await toolRegistry[toolCall.function.name](
		JSON.parse(toolCall.function.arguments)
	);

	return {
		tool_call_id: toolCall.id,
		result,
		success: true
	};
}
```

**Proactive Mode** (Queue or Auto-Execute):

```typescript
async function executeProactiveTool(toolCall: ChatToolCall, session: ChatSession) {
	const autoAccept = session.auto_accept_operations ?? false;

	if (autoAccept) {
		// Execute immediately
		return await executeOperation(toolCall);
	} else {
		// Queue for approval
		return await queueOperation(toolCall, session.id);
	}
}
```

## Data Flow Diagrams

### User Opens Chat

```
┌─────────────────┐
│  User clicks    │
│  "Chat" button  │
└────────┬────────┘
         │
         ↓
┌─────────────────────────────┐
│  ChatModal opens            │
│  showContextSelection=true  │
└────────┬────────────────────┘
         │
         ↓
┌───────────────────────────────┐
│  ContextSelectionScreen       │
│  shows 3 options              │
│  (Global, New Project,        │
│   Existing Project)           │
└────────┬──────────────────────┘
         │
         ↓
┌───────────────────────────────┐
│  User selects context         │
│  → dispatches                 │
│    { contextType, entityId }  │
└────────┬──────────────────────┘
         │
         ↓
┌───────────────────────────────┐
│  ChatModal receives selection │
│  → creates session            │
│  → shows chat interface       │
└────────┬──────────────────────┘
         │
         ↓
┌───────────────────────────────┐
│  Chat begins with proper      │
│  context and tools            │
└───────────────────────────────┘
```

### Message Flow

```
┌─────────────┐
│ User sends  │
│  message    │
└──────┬──────┘
       │
       ↓
┌──────────────────────────────┐
│  POST /api/chat/stream       │
│  { message, context_type,    │
│    entity_id, session_id }   │
└──────┬───────────────────────┘
       │
       ↓
┌──────────────────────────────┐
│  chat-context-service        │
│  • getSystemPrompt()         │
│  • getTools()                │
│  • assembleContext()         │
└──────┬───────────────────────┘
       │
       ↓
┌──────────────────────────────┐
│  Call LLM with:              │
│  • System prompt             │
│  • Tools                     │
│  • Context layers            │
│  • Message history           │
└──────┬───────────────────────┘
       │
       ↓
┌──────────────────────────────┐
│  LLM responds with:          │
│  • Text chunks               │
│  • Tool calls                │
└──────┬───────────────────────┘
       │
       ↓
┌──────────────────────────────┐
│  Execute tools based on mode:│
│  • Reactive → immediate      │
│  • Proactive → queue/execute │
└──────┬───────────────────────┘
       │
       ↓
┌──────────────────────────────┐
│  Stream SSE events:          │
│  • type: 'text'              │
│  • type: 'tool_call'         │
│  • type: 'tool_result'       │
│  • type: 'done'              │
└──────────────────────────────┘
```

## Implementation Phases

### Phase 3: Architecture Analysis ✅ DONE

- Read ChatModal structure
- Analyze existing patterns
- Create this architecture document

### Phase 4: Create ContextSelectionScreen

- Rename/adapt ProjectModeSelectionView
- Add proper event dispatching
- Integrate with project loading

### Phase 5: Expand chat-context-service with Tools

- Define REACTIVE_TOOLS constant
- Define PROACTIVE_TOOLS constant
- Implement `getTools()` method
- Implement `shouldAutoExecute()` method
- Create tool registry with implementations

### Phase 6: Integrate with ChatModal

- Add `showContextSelection` prop
- Show ContextSelectionScreen when needed
- Handle context selection events
- Pass context to existing chat flow

### Phase 7: Update API Endpoint

- Modify `/api/chat/stream/+server.ts`
- Add tool retrieval from context service
- Implement tool execution router (reactive vs proactive)
- Add operation queuing logic

### Phase 8: Tool Implementation

- Implement reactive tools (list/detail)
- Implement proactive tools (operations)
- Add tool result formatting
- Add error handling

### Phase 9: Testing

- Test each context type
- Test tool execution
- Test progressive disclosure
- Test operation queueing
- End-to-end flow testing

## Key Design Decisions

### 1. Why Use ChatModal Instead of AgentModal?

**Reasons**:

- ChatModal is production-ready with SSE streaming
- Has session management and persistence
- Includes voice recording
- Has sidebar for session history
- Mobile responsive
- Dark mode support

**AgentModal Issues**:

- Duplicates chat functionality
- Has custom operation queue UI
- Not integrated with existing chat infrastructure

**Solution**: Deprecate AgentModal, enhance ChatModal

### 2. Why Expand chat-context-service?

**Reasons**:

- Already has system prompt logic
- Already does context assembly
- Already understands progressive disclosure
- Single source of truth for context

**Alternative Considered**: Keep agent-orchestrator separate
**Why Rejected**: Creates duplication and sync issues

### 3. Why Pre-Selection Screen?

**Reasons**:

- User needs to understand what mode they're in
- Different modes have different capabilities
- Clear mental model for users
- Prevents confusion about tool availability

**Alternative Considered**: Auto-detect mode from first message
**Why Rejected**: Ambiguous, error-prone, confusing UX

### 4. Why Tool-Based Architecture?

**Reasons**:

- LLMs are designed for tool use
- Type-safe function calling
- Easy to add new capabilities
- Clear separation of concerns
- Testable in isolation

**Alternative Considered**: Direct API calls from LLM responses
**Why Rejected**: Less safe, harder to validate, no queue support

## Migration from Existing Systems

### From Agent System

1. ✅ Move AGENT_SYSTEM_PROMPTS → chat-context-service (DONE)
2. Move dimension detection → chat-context-service tools
3. Move operation generation → proactive tools
4. Move draft service integration → project_create tools
5. Deprecate agent-orchestrator.service.ts
6. Deprecate AgentModal.svelte

### From Brain Dump System

- Keep brain dump as separate flow (already works well)
- Add `create_brain_dump` tool to chat for quick capture
- Brain dump can create draft → project_create mode can resume

### Backward Compatibility

- Existing chat sessions continue working
- `/api/chat/stream` maintains existing behavior
- Context selection is optional (prop-based)
- All existing context types supported

## Success Criteria

✅ **Unified Architecture**:

- Single modal for all chat/agent interactions
- Single context service
- No duplication

✅ **Clear UX**:

- User understands what mode they're in
- Context selection is intuitive
- Tool execution is transparent

✅ **Type Safety**:

- All tools properly typed
- Context types complete
- Tool arguments validated

✅ **Performance**:

- Progressive disclosure reduces tokens
- Tool execution is fast
- Streaming works smoothly

✅ **Maintainability**:

- Single source of truth
- Easy to add new modes
- Easy to add new tools
- Well-documented

## Next Steps

1. Complete Phase 4: Create ContextSelectionScreen
2. Start Phase 5: Expand chat-context-service with tools
3. Wire up ChatModal integration
4. Update API endpoint
5. Implement tools
6. Test end-to-end

---

**Status**: Architecture complete, ready for implementation
**Owner**: Development team
**Timeline**: 4-5 phases remaining, ~2-3 days work
