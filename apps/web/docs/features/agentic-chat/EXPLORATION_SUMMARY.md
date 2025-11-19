# Agentic Chat Frontend Exploration - Summary

Generated: November 17, 2025

## Overview

Complete exploration of the BuildOS agentic chat streaming API frontend components, including all UI components, state management, SSE message handling, and project focus features.

## Key Findings

### 1. Main Component Architecture

**AgentChatModal** (1941 lines) is the central hub orchestrating:

- Chat message display with real-time streaming
- Project/task context selection
- Agent activity visualization via ThinkingBlock
- Project focus management with ProjectFocusIndicator/ProjectFocusSelector
- Voice input integration
- Responsive, dark-mode-aware UI

### 2. Real-time SSE Streaming

**How it Works**:

1. User sends message → `sendMessage()` validates and creates user message + thinking block
2. POST to `/api/agent/stream` with context, conversation history, and project focus
3. SSEProcessor opens EventSource stream with AbortController support
4. Backend sends 25+ different SSE event types
5. `handleSSEMessage()` dispatches each event, updating component state
6. UI reactively updates via Svelte 5 runes ($state, $derived, $effect)

**Stream Timeout**: 4 minutes (inactivity-based, resets on data received)

**Cancellation**: AbortController allows user to stop streaming mid-flight

### 3. Project Focus Feature

**What It Does**: Allows users to narrow down agent context to specific entities (tasks, goals, plans, documents, outputs, milestones) within a project.

**Components**:

- **ProjectFocusIndicator**: Shows current focus with emoji icon, entity name, project context
- **ProjectFocusSelector**: Modal to browse and select entities from selected entity type
- **State Management**: `projectFocus` object carries focus data through API requests

**Focus Types & Icons**:

- 📘 project-wide
- 📝 task
- 🎯 goal
- 📋 plan
- 📄 document
- 📦 output
- 🏁 milestone

### 4. Thinking Block (Agent Activity Log)

**Purpose**: Visualize agent's reasoning process in a collapsible terminal-style interface

**Features**:

- Real-time activity timeline with icons and color-coding
- 14 activity types (tool_call, plan_created, executor_spawned, etc.)
- Status indicators: pending (spinner), completed (checkmark), failed (X)
- Plan step expansion for visual breakdown of execution steps
- Collapse/expand with animation
- Custom scrollbar styling for dark mode

**Lifecycle**:

1. Created when message sent
2. Activities appended as SSE events arrive
3. Tool statuses transition: pending → completed/failed
4. Finalized when stream completes (marked as "Complete")

### 5. SSE Message Types (25+ Event Types)

| Category          | Types                                                                                           |
| ----------------- | ----------------------------------------------------------------------------------------------- |
| **Session**       | session, last_turn_context                                                                      |
| **Agent State**   | agent_state, focus_active, focus_changed                                                        |
| **Planning**      | plan_created, plan_ready_for_review, plan_review                                                |
| **Execution**     | step_start, step_complete, executor_spawned, executor_result                                    |
| **Tools**         | tool_call, tool_result                                                                          |
| **Text**          | text (streaming response)                                                                       |
| **Clarification** | clarifying_questions                                                                            |
| **Context**       | context_shift, ontology_loaded                                                                  |
| **Templates**     | template_creation_request, template_creation_status, template_created, template_creation_failed |
| **Completion**    | done, error                                                                                     |

### 6. State Management

**Key State Variables** (40+ Svelte 5 $state variables):

**Context**: selectedContextType, selectedEntityId, selectedContextLabel
**Messages**: messages[], currentSession, inputValue, error
**Streaming**: isStreaming, currentStreamController
**Agent**: agentState, agentStateDetails, currentActivity, currentThinkingBlockId
**Focus**: projectFocus, showFocusSelector
**Ontology**: lastTurnContext, ontologyLoaded, ontologySummary
**Voice**: isVoiceRecording, isVoiceInitializing, isVoiceTranscribing, voiceErrorMessage

**Derived Values**:

- contextDescriptor, displayContextLabel (context display)
- defaultProjectFocus, resolvedProjectFocus (focus logic)
- isSendDisabled, agentStateLabel (UI state)

### 7. User Interaction Flow

```
Send Message
  ↓
Validate + Create UI messages
  ↓
POST /api/agent/stream
  ↓
SSE Stream Processing:
  session → hydrate context
  agent_state → update status
  ontology_loaded → show ready
  tool_call → add pending activity
  tool_result → complete activity
  text → append to response
  ... 20+ more event types
  done → finalize
  ↓
UI Reactively Updates
  ↓
User sees:
  - Streaming response text
  - Agent activity timeline
  - Tool execution tracking
  - Plan steps
  - Focus indicator
  - Status indicators
```

### 8. Tool Execution Tracking

**Smart Tool Messages**: AgentChatModal formats tool messages based on:

- Tool name (create_onto_task, update_onto_plan, search_tasks, etc.)
- Arguments (to extract meaningful targets)
- Status (pending, completed, failed)

**Examples**:

- Pending: "Creating task: 'Email campaign'..."
- Completed: "Created task: 'Email campaign'"
- Failed: "Failed to create task: 'Email campaign'"

### 9. Auto-Scroll Behavior

**Smart Sticky Scrolling**:

1. Detects if user manually scrolled up (userHasScrolled flag)
2. Only auto-scrolls if user at bottom OR manually scrolled down
3. Uses 100px threshold to detect "at bottom"
4. Respects user preference to review earlier messages

### 10. Error Handling & Resilience

- **Stream Abort**: User can cancel mid-flight with AbortController
- **Timeout Protection**: 4-minute inactivity timeout (resets on data)
- **Error Recovery**: Failed messages returned to input, orphaned messages cleaned up
- **Graceful Degradation**: Optional SSE callbacks for custom error handling
- **Tool Parsing**: Safe JSON parsing with fallback formatters

### 11. Accessibility

- ARIA labels on collapsible sections
- aria-live regions for status updates
- aria-expanded for thinking block toggle
- Semantic HTML (role="status", role="alert")
- Keyboard: Enter to send, Shift+Enter for newline

### 12. Performance Optimizations

- **Immutable Updates**: Always create new array references for Svelte reactivity
- **Thinking Block Consolidation**: All activities in one block (not individual messages)
- **Stream Buffering**: Handles multiple chunks per read cycle efficiently
- **Resource Cleanup**: AbortController cleanup prevents memory leaks
- **Scroll Detection**: Only auto-scrolls when needed

---

## File Reference

### Core Components

- `/apps/web/src/lib/components/agent/AgentChatModal.svelte` (1941 lines)
    - Main chat UI, streaming orchestration, state management
- `/apps/web/src/lib/components/agent/ThinkingBlock.svelte` (299 lines)
    - Agent activity log visualization
- `/apps/web/src/lib/components/agent/ProjectFocusIndicator.svelte` (94 lines)
    - Focus display with Change/Clear buttons
- `/apps/web/src/lib/components/agent/ProjectFocusSelector.svelte` (299 lines)
    - Entity selection modal with search and filtering

### Utilities

- `/apps/web/src/lib/utils/sse-processor.ts` (290 lines)
    - Centralized SSE stream parsing, buffering, JSON parsing, timeout handling

### Backend

- `/apps/web/src/routes/api/agent/stream/+server.ts` (500+ lines)
    - SSE endpoint, session management, ontology loading, conversation history

### Types

- `/packages/shared-types/src/agent.types.ts`
    - AgentSSEMessage type with all 25+ event types
    - ProjectFocus, FocusEntitySummary types
    - LastTurnContext for conversation continuity
- `/apps/web/src/lib/types/agent-chat-enhancement.ts`
    - OntologyContext, StrategyAnalysis, EnhancedAgentStreamRequest
    - ServiceContext for backend coordination

### Other Components

- `/apps/web/src/lib/components/agent/OperationsQueue.svelte`
- `/apps/web/src/lib/components/agent/OperationsLog.svelte`
- `/apps/web/src/lib/components/agent/DraftsList.svelte`
- `/apps/web/src/lib/components/agent/ProjectModeSelectionView.svelte`

### Services

- `/apps/web/src/lib/services/agentic-chat/` (38 files)
    - Orchestration, planning, execution, persistence, analysis, prompt generation
    - Tool execution service, response synthesis

---

## Documentation Files Generated

1. **FRONTEND_EXPLORATION.md** (6500+ lines)
    - Comprehensive deep-dive with code examples, state diagrams, message handling details
    - Best for: Understanding full architecture and implementation details

2. **FRONTEND_QUICK_REFERENCE.md** (500+ lines)
    - Quick lookup tables, cheat sheets, pattern examples
    - Best for: Day-to-day development reference

3. **This Summary** (AGENTIC_CHAT_EXPLORATION_SUMMARY.md)
    - High-level overview and key findings
    - Best for: Getting oriented with the system

---

## Key Technologies

- **Svelte 5**: Runes syntax ($state, $derived, $effect)
- **SSE (Server-Sent Events)**: Streaming API via EventSource
- **TypeScript**: Full type safety across frontend and backend
- **Supabase**: Session and chat message persistence
- **Tailwind CSS**: Responsive design, dark mode support
- **Web APIs**: AbortController for stream cancellation, ReadableStream for SSE parsing

---

## Integration Points

### Frontend → Backend

- POST `/api/agent/stream` with ChatStreamRequest
- Receives AgentSSEMessage stream

### Frontend → Services

- OntologyContextLoader: Load entity context
- AgentChatOrchestrator: Coordinate agent execution
- Tool definitions, response synthesis

### Frontend → Database

- Chat sessions and messages via Supabase
- Session hydration on stream

---

## Next Steps for Development

### If Adding New SSE Event Types:

1. Add type to `AgentSSEMessage` union in agent.types.ts
2. Add case in `handleSSEMessage()` switch statement
3. Update thinking block with new ActivityType if needed
4. Add activity styling to ThinkingBlock.svelte if visual representation needed

### If Modifying Streaming Flow:

1. Update SSEProcessor if changing parsing logic
2. Update callbacks in sendMessage() if changing completion handling
3. Consider timeout implications for complex operations

### If Adding Project Focus Entities:

1. Add focusType to ProjectFocus interface
2. Add icon mapping to ProjectFocusIndicator
3. Add to focusTypes array in ProjectFocusSelector
4. Ensure backend returns FocusEntitySummary data

### If Changing State Management:

1. Keep immutable patterns for Svelte 5 reactivity
2. Use $derived for computed values
3. Use $effect for side effects (avoid reactive statements)
4. Document new state in state management section

---

## Known Limitations & Future Enhancements

### Current Limitations

- 4-minute timeout for streams (reasonable for complex operations)
- No stream resume/checkpoint capability
- Single thinking block per message (no nested parallelization UI)

### Potential Enhancements

- Progressive entity loading in ProjectFocusSelector (large projects)
- Keyboard navigation for entity selection
- Thinking block filtering (show only tool_calls, for example)
- Message export (save conversation as markdown)
- Auto-save of project focus preference per context type

---

## Quality Assurance Checklist

When modifying agentic chat components:

- [ ] Test with multiple SSE event types
- [ ] Verify scroll behavior with long responses
- [ ] Test focus changes mid-conversation
- [ ] Check dark mode rendering
- [ ] Test voice input with various inputs
- [ ] Verify error messages display clearly
- [ ] Test stream abort/cancellation
- [ ] Check accessibility with screen reader
- [ ] Verify TypeScript compilation (pnpm typecheck)
- [ ] Run tests (pnpm test)

---

**End of Summary**

For detailed information, see:

- FRONTEND_EXPLORATION.md - Full technical reference
- FRONTEND_QUICK_REFERENCE.md - Quick lookup guide
- AgentChatModal.svelte - Source of truth for implementation
