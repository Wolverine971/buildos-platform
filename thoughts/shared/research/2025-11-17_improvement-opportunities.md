---
date: 2025-11-17T00:30:00-05:00
researcher: Claude
repository: buildos-platform
topic: 'Agentic Chat System - Improvement Opportunities'
tags: [research, buildos, agentic-chat, improvements, optimization, technical-debt]
status: complete
---

# Agentic Chat System - Improvement Opportunities

## Executive Summary

After analyzing the BuildOS agentic chat system (30 files, ~11,800 lines), I've identified **24 improvement opportunities** across 5 categories:

1. **Complexity Reduction** (8 items) - Simplify architecture
2. **Performance Optimization** (5 items) - Speed and efficiency
3. **UX Improvements** (4 items) - User experience friction
4. **Technical Debt** (4 items) - Maintenance concerns
5. **Developer Experience** (3 items) - Easier development

**Priority Recommendations**: Focus on items marked 🔥 HIGH PRIORITY for immediate impact.

---

## 📊 Current System Statistics

- **Files**: 30 TypeScript files
- **Total Lines**: ~11,800 lines
- **Console Logs**: 88 instances across 12 files
- **Service Layers**: 7 distinct layers
- **Event Types**: 25+ SSE event types
- **Tool Count**: 31 tools
- **Context Types**: 9 different contexts

---

## 1. Complexity Reduction (8 Opportunities)

### 🔥 1.1 Eliminate Draft-Only Plan Mode (HIGH PRIORITY)

**Current State**: System supports 3 plan execution modes:
- `auto_execute` - Immediate execution
- `draft_only` - Return plan for user approval (⚠️ **NOT USED IN FRONTEND**)
- `agent_review` - Internal reviewer critiques plan

**Issue**:
- `draft_only` mode is fully implemented but **never used** by the frontend
- Adds complexity to planning flow (branches in code)
- Extra SSE event type `plan_ready_for_review` not handled
- Database stores execution mode that's never leveraged

**Grep Results**: No usage of `draft_only` or plan approval UI in `AgentChatModal.svelte`

**Recommendation**:
```typescript
// REMOVE: draft_only mode
// KEEP: auto_execute (default), agent_review (optional)

// Simplified execution mode
type PlanExecutionMode = 'auto_execute' | 'agent_review';

// Remove from tool definition
const PLAN_TOOL_DEFINITION: ChatToolDefinition = {
  function: {
    parameters: {
      properties: {
        execution_mode: {
          type: 'string',
          enum: ['auto_execute', 'agent_review'], // Remove 'draft_only'
        }
      }
    }
  }
}
```

**Impact**:
- ✅ Remove ~150 lines of code
- ✅ Simplify planning logic branches
- ✅ Remove unused SSE event type
- ✅ Clearer system behavior

**Effort**: Medium (2-4 hours)
- Remove mode from types
- Clean up orchestrator branches
- Remove SSE event type
- Update tests

---

### 🔥 1.2 Simplify Last Turn Context Extraction (HIGH PRIORITY)

**Current State**: `/api/agent/stream/+server.ts` has **262 lines** (lines 258-523) dedicated to extracting entities from the last conversation turn.

**Issue**:
- Overly complex nested parsing
- Multiple helper functions: `recordEntityById`, `inferEntitySlotFromId`, `collectEntitiesFromPayload`, `inferEntitySlotFromStructure`, `recordEntityByKey`
- Deep recursion (max depth 6)
- Tries to extract entities from tool results, arguments, and payloads

**Example Complexity**:
```typescript
// Current: 6 helper functions, recursive parsing
function generateLastTurnContext(recentMessages, contextType, options) {
  // Extract from tool calls
  toolCalls.forEach((tc) => {
    const argsStr = tc.function?.arguments || tc.arguments;
    const args = typeof argsStr === 'string' ? JSON.parse(argsStr) : argsStr;
    // ... extract entities from args
  });

  // Extract from tool results
  recentToolResults.forEach((toolResult) => {
    const payload = toolResult.tool_result ?? toolResult.result ?? ...;
    collectEntitiesFromPayload(entities, payload); // Recursive
  });
}

function collectEntitiesFromPayload(entities, payload, depth = 0) {
  if (depth > 6) return; // Recursion limit
  // ... complex extraction logic
}
```

**Recommendation**:
```typescript
// SIMPLIFIED: Tool results already include entitiesAccessed
function generateLastTurnContext(recentMessages, contextType, options) {
  const lastAssistantMsg = recentMessages.filter(m => m.role === 'assistant').pop();

  // Simply use pre-extracted entities from tool execution
  const entities = {};
  options.toolResults?.forEach(result => {
    result.entitiesAccessed?.forEach(entityId => {
      assignEntityById(entities, entityId);
    });
  });

  return {
    summary: lastAssistantMsg.content.substring(0, 60),
    entities,
    context_type: contextType,
    data_accessed: toolResults.map(r => r.toolName),
    timestamp: new Date().toISOString()
  };
}
```

**Why This Works**:
- `ToolExecutionService` already extracts `entitiesAccessed` from results (line 641 in tool-execution-service.ts)
- No need to re-parse tool arguments or recursively scan payloads
- Trust the tool execution layer

**Impact**:
- ✅ Remove ~200 lines of code
- ✅ Eliminate 6 helper functions
- ✅ Faster execution (no recursive parsing)
- ✅ More maintainable

**Effort**: Medium (3-4 hours)

---

### 1.3 Consolidate Context Types

**Current State**: 9 different `ChatContextType` values:
- `global`, `project`, `task`, `calendar`, `project_create`, `project_audit`, `project_forecast`, `task_update`, `daily_brief_update`

**Issue**:
- Some contexts are rarely used (`project_forecast`, `daily_brief_update`)
- `project_audit` and `project` could be merged
- Creates branching complexity in tool filtering

**Recommendation**:
```typescript
// Consolidate to 5 core contexts
type ChatContextType =
  | 'global'        // General chat
  | 'project'       // Project context (includes audit/forecast)
  | 'task'          // Task context (includes updates)
  | 'calendar'      // Calendar integration
  | 'creation';     // Creating new entities

// Use metadata to specify intent
interface ServiceContext {
  contextType: ChatContextType;
  intent?: 'audit' | 'forecast' | 'update' | 'create';
}
```

**Impact**:
- ✅ Simpler tool filtering logic
- ✅ Easier to understand system state
- ✅ Reduce branching in code

**Effort**: High (8-12 hours) - requires database migration

---

### 1.4 Remove Deprecated `auto_execute` Parameter

**Current State**: Plan tool accepts both `execution_mode` (new) and `auto_execute` (deprecated):

```typescript
// apps/web/src/lib/services/agentic-chat/orchestration/agent-chat-orchestrator.ts:52
auto_execute: {
  type: 'boolean',
  description: 'Deprecated alias for execution_mode === auto_execute.'
}
```

**Issue**:
- Maintains backward compatibility for parameter that's not used
- Adds confusion in tool definition
- Extra parsing logic

**Recommendation**:
```typescript
// REMOVE auto_execute parameter entirely
// ONLY use execution_mode

// Update tool definition
parameters: {
  properties: {
    objective: { ... },
    execution_mode: {
      type: 'string',
      enum: ['auto_execute', 'agent_review'],
      default: 'auto_execute'
    }
    // REMOVE: auto_execute
  }
}
```

**Impact**:
- ✅ Cleaner API
- ✅ Remove parsing logic
- ✅ One way to do things

**Effort**: Low (1 hour)

---

### 1.5 Flatten Service Dependency Hierarchy

**Current State**: 7-layer service hierarchy:

```
AgentChatOrchestrator
  ├─ PlanOrchestrator
  │   └─ ExecutorCoordinator
  │       └─ AgentExecutorService
  ├─ ToolExecutionService
  ├─ ResponseSynthesizer
  ├─ AgentContextService
  └─ AgentPersistenceService
```

**Issue**:
- Deep dependency injection
- Hard to test in isolation
- Circular dependencies possible

**Recommendation**:
```typescript
// Create a single AgentService facade
class AgentService {
  private orchestrator: Orchestrator;
  private toolExecutor: ToolExecutor;
  private planExecutor: PlanExecutor;

  async streamConversation(request) {
    // Coordinate between layers
  }
}

// Simpler factory
function createAgentService(supabase, options) {
  return new AgentService(supabase, options);
}
```

**Impact**:
- ✅ Easier to understand
- ✅ Simpler testing
- ✅ Clearer responsibilities

**Effort**: Very High (16-24 hours) - major refactor

---

### 1.6 Simplify SSE Event Types

**Current State**: 25+ SSE event types

**Issue**:
- Some events are rarely used
- Events like `template_creation_*` could be consolidated

**Recommendation**:
```typescript
// Consolidate template events
type StreamEvent =
  | { type: 'template_event'; status: 'request' | 'status' | 'created' | 'failed'; ... }
  // Instead of 4 separate types:
  // - template_creation_request
  // - template_creation_status
  // - template_created
  // - template_creation_failed
```

**Impact**:
- ✅ Fewer event handlers
- ✅ Simpler frontend logic
- ✅ Easier to add new features

**Effort**: Medium (4-6 hours)

---

### 1.7 Remove Context Shift Feature (Consider)

**Current State**: Tools can emit `context_shift` to dynamically change conversation scope

**Issue**:
- Adds complexity to tool results
- Rare use case
- Can confuse users when context suddenly changes
- Requires special handling in API (lines 784-852 in +server.ts)

**Question**: How often do users actually benefit from automatic context shifts?

**Recommendation**:
```typescript
// Option 1: Remove entirely
// Let users manually change context via UI

// Option 2: Make it explicit
// Return a suggestion instead of automatic shift
{
  type: 'context_suggestion',
  suggested_context: 'task',
  entity_id: 'task_123',
  reason: 'This conversation is focused on a specific task'
}
```

**Impact**:
- ✅ Remove ~70 lines from API
- ✅ Simpler tool result handling
- ⚠️ May reduce some convenience

**Effort**: Medium (3-4 hours)

---

### 1.8 Consolidate Logging

**Current State**: 88 `console.log/warn/error` calls across 12 files

**Issue**:
- Inconsistent log format
- No structured logging
- Hard to filter in production
- Some logs are debug-only, others are important

**Recommendation**:
```typescript
// Use structured logger
class Logger {
  info(message: string, context?: Record<string, any>) {
    console.log(JSON.stringify({ level: 'info', message, ...context, timestamp: new Date() }));
  }

  warn(message: string, context?: Record<string, any>) { ... }
  error(error: Error, context?: Record<string, any>) { ... }
  debug(message: string, context?: Record<string, any>) {
    if (dev) console.log(...);
  }
}

// Usage
logger.info('Plan created', { planId, sessionId, stepCount });
logger.error(error, { context: 'tool_execution', toolName });
```

**Impact**:
- ✅ Structured logs for production monitoring
- ✅ Easy to filter/search
- ✅ Consistent format
- ✅ Debug logs auto-disabled in production

**Effort**: Medium (4-6 hours) - replace all console calls

---

## 2. Performance Optimization (5 Opportunities)

### 🔥 2.1 Cache Ontology Context Loading (HIGH PRIORITY)

**Current State**: Every message loads full ontology context from database

**Issue**:
- Lines 686-734 in `/api/agent/stream/+server.ts` load ontology on EVERY request
- For focused contexts, loads project + element context (2 DB queries)
- Same context often loaded repeatedly in multi-turn conversations

**Example**:
```typescript
// Current: Load on every message
let ontologyContext: OntologyContext | null = null;
if (resolvedProjectFocus?.projectId && normalizedContextType === 'project') {
  ontologyContext = await ontologyLoader.loadCombinedProjectElementContext(...);
  // ^^^ Expensive DB query every time
}
```

**Recommendation**:
```typescript
// Cache in session metadata
const sessionMetadata = chatSession.agent_metadata as AgentSessionMetadata;

// Check cache first
let ontologyContext = sessionMetadata.ontologyContext;
const cacheAge = Date.now() - (sessionMetadata.ontologyLoadedAt || 0);

if (!ontologyContext || cacheAge > 300000) { // 5 min cache
  ontologyContext = await ontologyLoader.loadCombinedProjectElementContext(...);

  // Store in session
  await supabase.from('chat_sessions').update({
    agent_metadata: {
      ...sessionMetadata,
      ontologyContext,
      ontologyLoadedAt: Date.now()
    }
  }).eq('id', chatSession.id);
}
```

**Impact**:
- ✅ ~200-500ms saved per message (after first)
- ✅ Reduced database load
- ✅ Better user experience (faster responses)

**Effort**: Low (2-3 hours)

---

### 2.2 Lazy Load Recent Messages

**Current State**: Loads last 50 messages on every request (line 180 in +server.ts)

**Issue**:
- Always loads 50 messages even if only need 5-10 for context
- Large message payloads for long conversations

**Recommendation**:
```typescript
// Load progressively
const INITIAL_MESSAGE_LIMIT = 10;
const MAX_MESSAGE_LIMIT = 50;

// Load minimal context first
let messages = await loadRecentMessages(supabase, sessionId, INITIAL_MESSAGE_LIMIT);

// Compress history if needed
const compressed = await compressionService.compressHistory(messages);

// Only load more if compression wasn't sufficient
if (compressed.estimatedTokens > MAX_CONTEXT_TOKENS) {
  messages = await loadRecentMessages(supabase, sessionId, MAX_MESSAGE_LIMIT);
}
```

**Impact**:
- ✅ Faster initial load
- ✅ Reduced database query size
- ✅ Better for users with short conversations (majority)

**Effort**: Low (2 hours)

---

### 2.3 Debounce Tool Result Persistence

**Current State**: Each tool result saved immediately to database (line 201 in +server.ts)

**Issue**:
- For plans with 5 steps x 3 tools each = 15 sequential DB writes
- Blocks event stream

**Recommendation**:
```typescript
// Batch tool results at end of turn
const toolResultsBatch: ChatMessageInsert[] = [];

// Accumulate during execution
toolResults.forEach(result => {
  toolResultsBatch.push({
    session_id: chatSession.id,
    user_id: userId,
    role: 'tool',
    content: JSON.stringify(result),
    tool_call_id: result.toolCallId,
    created_at: new Date().toISOString()
  });
});

// Single batch insert at end
await supabase.from('chat_messages').insert(toolResultsBatch);
```

**Impact**:
- ✅ 10-15x faster for multi-tool executions
- ✅ Single transaction
- ✅ Reduced DB connection overhead

**Effort**: Low (1-2 hours)

---

### 2.4 Pre-compile Tool Filters

**Current State**: Tool filtering happens on every request in `AgentContextService`

**Issue**:
- Filters 31 tools by context type on every message
- Same filtering logic runs repeatedly

**Recommendation**:
```typescript
// Pre-compute at startup
const TOOL_FILTERS = {
  global: [/* filtered tools */],
  project: [/* filtered tools */],
  task: [/* filtered tools */],
  // ... etc
} as const;

// Instant lookup
function getToolsForContext(contextType: ChatContextType) {
  return TOOL_FILTERS[contextType] || TOOL_FILTERS.global;
}
```

**Impact**:
- ✅ O(1) lookup instead of O(n) filtering
- ✅ ~10ms saved per request
- ✅ More predictable performance

**Effort**: Low (1 hour)

---

### 2.5 Stream Tool Results Progressively

**Current State**: Wait for entire tool execution before streaming result

**Issue**:
- Large tool results (e.g., `onto_search_tasks` with 50 results) block stream
- User sees nothing until complete

**Recommendation**:
```typescript
// Return tool results as they're found
async function* handleSearchTasks(args, context) {
  const { data: tasks } = await supabase
    .from('tasks')
    .select('*')
    .limit(args.limit || 20);

  // Stream each task as found
  for (const task of tasks) {
    yield {
      type: 'tool_result_partial',
      data: { task },
      progress: { current: tasks.indexOf(task) + 1, total: tasks.length }
    };
  }

  yield {
    type: 'tool_result_complete',
    data: { tasks }
  };
}
```

**Impact**:
- ✅ Better perceived performance
- ✅ Immediate user feedback
- ✅ Can cancel long-running queries

**Effort**: High (12-16 hours) - requires SSE event changes

---

## 3. UX Improvements (4 Opportunities)

### 🔥 3.1 Add Plan Progress Indicator (HIGH PRIORITY)

**Current State**: Think blocks show steps, but no overall progress bar

**Issue**:
- User doesn't know "3 of 5 steps complete"
- Hard to estimate remaining time

**Recommendation**:
```svelte
<!-- In ThinkingBlock.svelte -->
{#if plan}
  <div class="mb-2">
    <div class="flex justify-between text-xs text-gray-500 mb-1">
      <span>Plan Progress</span>
      <span>{completedSteps} of {plan.steps.length} steps</span>
    </div>
    <div class="w-full bg-gray-200 rounded-full h-2">
      <div
        class="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full transition-all"
        style="width: {(completedSteps / plan.steps.length) * 100}%"
      />
    </div>
  </div>
{/if}
```

**Impact**:
- ✅ Better user expectations
- ✅ Reduce perceived wait time
- ✅ Professional UI polish

**Effort**: Low (1-2 hours)

---

### 3.2 Add Cancellation for Individual Steps

**Current State**: Can only cancel entire stream via "Stop" button

**Issue**:
- If step 3 of 5 is stuck, user must cancel everything
- Loses progress from completed steps

**Recommendation**:
```svelte
<!-- Add cancel button per step -->
<button
  onclick={() => cancelStep(step.stepNumber)}
  class="text-xs text-red-500 hover:underline"
>
  Cancel Step
</button>
```

**Backend**:
```typescript
// Add step cancellation endpoint
POST /api/agent/stream/cancel-step
{
  sessionId: string,
  planId: string,
  stepNumber: number
}

// Skip step, mark as 'cancelled', continue to next
```

**Impact**:
- ✅ Better control
- ✅ Don't lose partial progress
- ✅ Recover from stuck steps

**Effort**: Medium (4-6 hours)

---

### 3.3 Keyboard Shortcuts

**Current State**: No keyboard shortcuts

**Recommendation**:
```svelte
<script lang="ts">
  function handleKeydown(e: KeyboardEvent) {
    // Cmd/Ctrl + K: Open agent chat
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      isOpen = true;
    }

    // Escape: Close modal
    if (e.key === 'Escape' && !activeStreaming) {
      onClose();
    }

    // Cmd/Ctrl + Enter: Send message
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      sendMessage();
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />
```

**Impact**:
- ✅ Power user efficiency
- ✅ Modern UX expectation
- ✅ Better accessibility

**Effort**: Low (2 hours)

---

### 3.4 Collapsible Thinking Blocks

**Current State**: All think blocks always expanded

**Issue**:
- Long conversations with many plans = lots of scrolling
- Old activities clutter the view

**Recommendation**:
```svelte
<script lang="ts">
  let expanded = $state(true); // Start expanded for current activity

  // Auto-collapse when done
  $effect(() => {
    if (block.state === 'waiting_on_user' && !block.isCurrentBlock) {
      expanded = false;
    }
  });
</script>

<div class="think-block">
  <button
    onclick={() => expanded = !expanded}
    class="flex items-center gap-2 w-full"
  >
    <ChevronDown class={expanded ? '' : '-rotate-90'} />
    <span>{block.state}</span>
  </button>

  {#if expanded}
    <!-- Activities -->
  {/if}
</div>
```

**Impact**:
- ✅ Cleaner UI for long conversations
- ✅ Focus on current activity
- ✅ Easier to review history

**Effort**: Low (2 hours)

---

## 4. Technical Debt (4 Opportunities)

### 4.1 Add Unit Tests for Core Services

**Current State**: Limited test coverage for agentic-chat services

**Recommendation**:
```typescript
// Test plan orchestrator
describe('PlanOrchestrator', () => {
  it('should validate plans for circular dependencies', () => {
    const plan = {
      steps: [
        { stepNumber: 1, dependsOn: [2] },
        { stepNumber: 2, dependsOn: [1] }
      ]
    };

    const result = planOrchestrator.validatePlan(plan);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('circular dependency');
  });

  it('should execute steps in dependency order', async () => {
    // ...
  });
});

// Test tool execution service
describe('ToolExecutionService', () => {
  it('should extract entities from tool results', () => {
    // ...
  });
});
```

**Priority Tests**:
- Plan validation
- Tool execution
- Context building
- SSE event mapping

**Impact**:
- ✅ Catch regressions
- ✅ Safer refactoring
- ✅ Documentation via tests

**Effort**: High (16-24 hours)

---

### 4.2 Type Safety for SSE Events

**Current State**: SSE events loosely typed in frontend

**Issue**:
```typescript
// Current: any typing
function handleSSEMessage(event: MessageEvent) {
  const data = JSON.parse(event.data); // any
  switch (data.type) {
    // ...
  }
}
```

**Recommendation**:
```typescript
// Strict discriminated union
type AgentSSEMessage =
  | { type: 'session'; session: ChatSession }
  | { type: 'tool_call'; tool_call: ChatToolCall }
  | { type: 'text'; content: string }
  // ... all 25+ types

function handleSSEMessage(event: MessageEvent) {
  const data = JSON.parse(event.data) as AgentSSEMessage;

  // TypeScript enforces exhaustive checking
  switch (data.type) {
    case 'session':
      // data.session is typed ✅
      break;
    case 'tool_call':
      // data.tool_call is typed ✅
      break;
    // ...
  }
}
```

**Impact**:
- ✅ Catch type errors at compile time
- ✅ Better IDE autocomplete
- ✅ Self-documenting

**Effort**: Medium (4-6 hours)

---

### 4.3 Error Recovery Strategy

**Current State**: Errors often stop entire stream

**Recommendation**:
```typescript
// Add retry logic for transient failures
class ToolExecutionService {
  async executeTool(toolCall, context, options) {
    const maxRetries = 3;
    const retryDelay = 1000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.executeToolInternal(toolCall, context, options);
      } catch (error) {
        if (!isRetryable(error) || attempt === maxRetries) {
          throw error;
        }

        await sleep(retryDelay * attempt);
        logger.warn('Retrying tool execution', {
          toolName: toolCall.function.name,
          attempt
        });
      }
    }
  }
}

function isRetryable(error: Error) {
  // Database timeouts, network errors, rate limits
  return error.message.includes('timeout') ||
         error.message.includes('ECONNRESET') ||
         error.message.includes('rate limit');
}
```

**Impact**:
- ✅ More resilient to transient failures
- ✅ Better user experience
- ✅ Fewer "something went wrong" errors

**Effort**: Medium (6-8 hours)

---

### 4.4 Monitoring and Observability

**Current State**: No structured metrics

**Recommendation**:
```typescript
// Add metrics collection
class MetricsService {
  track(metric: string, value: number, tags?: Record<string, string>) {
    // Send to analytics service (PostHog, Mixpanel, etc.)
  }
}

// In orchestrator
metrics.track('agent.conversation.duration', duration, {
  contextType,
  hadPlan: !!plan,
  toolCount: toolResults.length
});

metrics.track('agent.plan.execution', stepCount, {
  success: plan.status === 'completed',
  executorCount: executorResults.length
});

metrics.track('agent.tool.execution', executionTime, {
  toolName,
  success: !error
});
```

**Track**:
- Conversation duration
- Tool execution times
- Plan success rate
- Error rates by type
- Token usage per context type

**Impact**:
- ✅ Identify bottlenecks
- ✅ Track system health
- ✅ Data-driven optimization

**Effort**: Medium (8-10 hours)

---

## 5. Developer Experience (3 Opportunities)

### 5.1 Better Error Messages

**Current State**: Generic errors like "Failed to execute tool"

**Recommendation**:
```typescript
// Before
throw new Error('Failed to execute tool');

// After
throw new ToolExecutionError(
  `Failed to execute tool '${toolName}': ${error.message}`,
  {
    toolName,
    args,
    originalError: error,
    context: {
      sessionId,
      userId,
      contextType
    }
  }
);
```

**Impact**:
- ✅ Faster debugging
- ✅ Better user-facing errors
- ✅ Easier support

**Effort**: Low (2-3 hours)

---

### 5.2 Development Mode Helpers

**Current State**: No dev-specific tooling

**Recommendation**:
```typescript
// Add debug panel in dev mode
{#if dev}
  <div class="fixed bottom-4 right-4 bg-black text-white p-4 rounded-lg">
    <h3>Debug Panel</h3>
    <ul class="text-xs">
      <li>Session: {sessionId}</li>
      <li>Context: {contextType}</li>
      <li>Focus: {projectFocus?.focusEntityName || 'None'}</li>
      <li>Messages: {messages.length}</li>
      <li>Active Tools: {activeToolCalls.length}</li>
      <li>Last Event: {lastEventType}</li>
    </ul>

    <button onclick={dumpState}>Dump State to Console</button>
    <button onclick={clearSession}>Clear Session</button>
  </div>
{/if}
```

**Impact**:
- ✅ Faster development
- ✅ Easier debugging
- ✅ Better demos

**Effort**: Low (3-4 hours)

---

### 5.3 Tool Development CLI

**Current State**: Adding tools requires manual edits to 3 files

**Recommendation**:
```bash
# CLI tool to scaffold new tools
pnpm run create-tool onto_example_action

# Generates:
# - Tool definition in tool-definitions.ts
# - Handler method in tool-executor.ts
# - Test file in tool-executor.test.ts
# - Updates tools.config.ts with default context filtering

# Interactive prompts:
# - Tool name
# - Description
# - Parameters (name, type, description, required)
# - Category (search/read/write/utility)
# - Default contexts
```

**Impact**:
- ✅ Faster tool development
- ✅ Consistent patterns
- ✅ Less error-prone

**Effort**: Medium (6-8 hours)

---

## 📊 Priority Matrix

### Immediate Wins (High Impact, Low Effort)

| Item | Impact | Effort | Priority |
|------|--------|--------|----------|
| 1.1 Remove draft_only mode | High | Medium | 🔥 **DO FIRST** |
| 1.4 Remove auto_execute param | Medium | Low | ✅ Quick win |
| 2.1 Cache ontology context | High | Low | 🔥 **DO FIRST** |
| 2.2 Lazy load messages | Medium | Low | ✅ Quick win |
| 2.3 Batch tool result persistence | High | Low | 🔥 **DO FIRST** |
| 3.1 Add plan progress indicator | Medium | Low | ✅ Quick win |
| 3.3 Keyboard shortcuts | Medium | Low | ✅ Quick win |

### Medium Priority (Worth Doing)

| Item | Impact | Effort | Priority |
|------|--------|--------|----------|
| 1.2 Simplify last turn context | High | Medium | ⭐ Recommended |
| 1.8 Consolidate logging | Medium | Medium | ⭐ Recommended |
| 2.4 Pre-compile tool filters | Low | Low | ✅ Easy |
| 3.2 Step cancellation | Medium | Medium | ⭐ Nice to have |
| 3.4 Collapsible think blocks | Low | Low | ✅ Easy |
| 4.2 Type safety for SSE | Medium | Medium | ⭐ Recommended |
| 5.1 Better error messages | Medium | Low | ✅ Easy |

### Long-term Improvements (High Effort)

| Item | Impact | Effort | Priority |
|------|--------|--------|----------|
| 1.3 Consolidate context types | High | High | 🔮 Future |
| 1.5 Flatten service hierarchy | Very High | Very High | 🔮 Future |
| 1.6 Simplify SSE event types | Medium | Medium | 🔮 Consider |
| 2.5 Stream tool results progressively | High | High | 🔮 Future |
| 4.1 Add unit tests | Very High | High | 🔮 Essential |
| 4.3 Error recovery strategy | High | Medium | 🔮 Important |
| 5.3 Tool development CLI | Medium | Medium | 🔮 Nice to have |

---

## 🎯 Recommended 2-Week Sprint

### Week 1: Quick Wins + High Impact

**Day 1-2**:
- Remove `draft_only` plan mode (1.1)
- Remove `auto_execute` parameter (1.4)

**Day 3-4**:
- Cache ontology context (2.1)
- Batch tool result persistence (2.3)
- Lazy load messages (2.2)

**Day 5**:
- Add plan progress indicator (3.1)
- Keyboard shortcuts (3.3)
- Collapsible think blocks (3.4)

**Estimated Impact**: ~30% performance improvement, reduced complexity

### Week 2: Quality & Maintainability

**Day 1-3**:
- Simplify last turn context extraction (1.2)
- Consolidate logging (1.8)

**Day 4-5**:
- Type safety for SSE events (4.2)
- Better error messages (5.1)
- Development mode helpers (5.2)

**Estimated Impact**: Better DX, fewer bugs, easier debugging

---

## 📈 Expected Outcomes

### Performance
- **30-40% faster** response times (caching, batching)
- **Reduced DB load** by ~50% (lazy loading, batching)
- **Better perceived performance** (progress indicators, streaming)

### Code Quality
- **~500-700 fewer lines** of code (removed complexity)
- **Better type safety** (SSE events, error handling)
- **Easier testing** (simpler services)

### User Experience
- **Clearer progress feedback** (progress bars, step indicators)
- **Faster interactions** (keyboard shortcuts)
- **Better error recovery** (retries, clearer messages)

### Developer Experience
- **Faster debugging** (structured logs, dev helpers)
- **Easier feature development** (fewer layers, clearer types)
- **Better documentation** (via tests, error messages)

---

## ❓ Questions to Consider

### Product Decisions

1. **Draft-only mode**: Was this planned for a future feature? If not used, remove it.
2. **Context shifting**: How often do users benefit from automatic context changes? Consider making it opt-in.
3. **Agent review mode**: Is internal plan review actually used? Or always auto-execute?
4. **Think blocks**: Should old activities auto-collapse, or always show full history?

### Technical Decisions

1. **Service architecture**: Keep layered or move to facade pattern?
2. **SSE events**: Consolidate similar events or keep granular?
3. **Context types**: Merge similar contexts or keep separate for future features?
4. **Error handling**: Retry automatically or always surface to user?

---

## 🚀 Next Steps

1. **Review priorities** with team
2. **Validate assumptions** (e.g., draft_only mode not used)
3. **Choose 2-week sprint items**
4. **Create tickets** with detailed specs
5. **Implement & test**
6. **Measure impact** (performance, user satisfaction)

---

## Conclusion

The agentic chat system is **well-architected and feature-rich**, but has accumulated complexity that can be reduced without sacrificing functionality. Focusing on the **high-impact, low-effort items** will yield immediate benefits, while the longer-term improvements can be tackled as time allows.

**Key Insight**: Many features were built "just in case" but aren't actually used (`draft_only` mode, complex entity extraction). Removing these will make the system faster and easier to maintain without losing real value.

---

**Research Completed**: 2025-11-17
**Next Review**: After sprint implementation
