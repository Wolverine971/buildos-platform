<!-- apps/web/docs/features/chat-system/multi-agent-chat/ITERATIVE_CONVERSATION_IMPLEMENTATION.md -->

# Iterative LLM-to-LLM Conversation Implementation

**Date:** 2025-10-29
**Status:** ✅ COMPLETE
**Architecture:** Option B - Full Iterative Conversations

---

## Executive Summary

Implemented the **full iterative LLM-to-LLM conversation pattern** as originally envisioned. The system now supports true back-and-forth conversations between planner and executor agents until tasks are completed.

### What Was Implemented

1. **AgentConversationService** - New orchestration layer for LLM-to-LLM conversations
2. **Iterative Conversation Loop** - Planner ↔ Executor dialogue with termination detection
3. **Message Protocol** - Structured conversation messages with types
4. **Real Executor Spawning** - Connected to actual executor agents (not placeholders)
5. **Fixed Constructor Injection** - Proper dependency injection pattern

---

## Architecture Overview

### Conversation Flow

```
User: "Update marketing project and schedule all tasks"
                    ↓
        Planner analyzes → Creates Plan
                    ↓
        For each step requiring executor:
                    ↓
    ┌─── Planner spawns Executor Agent ───┐
    │                                      │
    │  Conversation Service orchestrates:  │
    │                                      │
    │  1. Planner → Executor:              │
    │     "Find the marketing project"     │
    │                                      │
    │  2. Executor (tool calls):           │
    │     search_projects("marketing")     │
    │                                      │
    │  3. Executor → Planner:              │
    │     "QUESTION: Found 2 projects.     │
    │      'Marketing Campaign' and        │
    │      'Marketing Website'. Which?"    │
    │                                      │
    │  4. Planner → Executor:              │
    │     "Marketing Campaign"             │
    │                                      │
    │  5. Executor (tool calls):           │
    │     get_project_details(id)          │
    │                                      │
    │  6. Executor → Planner:              │
    │     "TASK COMPLETE: Found project.   │
    │      Here's the data: {...}"         │
    │                                      │
    └──────── Conversation Ends ──────────┘
                    ↓
        Planner continues to next step
```

---

## New Service: AgentConversationService

**File:** `/apps/web/src/lib/services/agent-conversation-service.ts`

### Responsibilities

1. **Session Management**
    - Creates `agent_chat_sessions` in database
    - Tracks conversation state (active/completed/failed)
    - Enforces max turns limit (10 turns default)

2. **Message Exchange**
    - Routes messages between planner and executor
    - Persists all messages to `agent_chat_messages` table
    - Maintains conversation history for context

3. **Executor Turn Processing**
    - Builds message history for executor LLM
    - Streams from executor (deepseek-coder, READ-ONLY tools)
    - Executes tools via ChatToolExecutor
    - Parses response to detect message type

4. **Planner Response Generation**
    - Activates when executor asks questions
    - Generates clarification via planner LLM (deepseek-chat)
    - Feeds answer back to executor

5. **Termination Detection**
    - Recognizes "TASK COMPLETE" signals
    - Detects errors and max turns reached
    - Extracts final result from conversation

### Message Types

```typescript
type ConversationMessageType =
	| 'task_assignment' // Planner → Executor: Initial task
	| 'question' // Executor → Planner: Need clarification
	| 'clarification' // Planner → Executor: Answer
	| 'progress_update' // Executor → Planner: Status
	| 'partial_result' // Executor → Planner: Intermediate data
	| 'task_complete' // Executor → Planner: Done!
	| 'error'; // Executor → Planner: Failed
```

### Key Methods

#### `startConversation()`

Creates conversation session in DB and returns session object.

#### `executeConversation()`

Main orchestration loop:

1. Send initial task to executor
2. Loop (max 10 turns):
    - Get executor response
    - Check termination conditions
    - If question → Get planner response
    - Continue until complete
3. Update session status
4. Return conversation result

#### `getExecutorTurn()`

Executes one turn from executor:

- Builds message history
- Streams from executor LLM
- Executes tools (READ-ONLY)
- Parses response type

#### `getPlannerResponse()`

Generates planner's answer to executor question.

---

## Changes to AgentPlannerService

**File:** `/apps/web/src/lib/services/agent-planner-service.ts`

### 1. Constructor Fixed ✅

**Before:**

```typescript
constructor(
  private supabase: SupabaseClient<Database>,
  smartLLM?: SmartLLMService
) {
  this.executorService = new AgentExecutorService(supabase, smartLLM);
}
```

**After:**

```typescript
constructor(
  private supabase: SupabaseClient<Database>,
  executorService?: AgentExecutorService,  // ✅ Now accepts injected service
  smartLLM?: SmartLLMService
) {
  // Use injected or create new
  this.executorService = executorService || new AgentExecutorService(supabase, this.smartLLM);

  // Initialize conversation service
  this.conversationService = new AgentConversationService(supabase, this.smartLLM);
}
```

**Impact:** Proper dependency injection enables testing and service reuse.

### 2. spawnExecutor() Updated ✅

**Before:** Simple method returning `Promise<ExecutorResult>`

**After:** Generator function with iterative conversation

```typescript
private async *spawnExecutor(
  step: PlanStep,
  sessionId: string,
  userId: string,
  planId: string,
  plannerAgentId: string
): AsyncGenerator<PlannerEvent> {
  // 1. Create executor agent
  const executorAgentId = await this.executorService.createExecutorAgent(...);

  yield { type: 'executor_spawned', executorId, task };

  // 2. Start conversation
  const session = await this.conversationService.startConversation({
    plannerAgentId,
    executorAgentId,
    parentSessionId: sessionId,
    userId,
    planId,
    stepNumber: step.stepNumber,
    task,
    tools
  });

  // 3. Execute iterative conversation
  for await (const response of this.conversationService.executeConversation(session, userId)) {
    // Stream conversation events to user
    if (response.type === 'message') {
      yield { type: 'text', content: `[Executor] ${response.content}` };
    }
  }

  // 4. Return result
  yield { type: 'executor_result', executorId, result };
}
```

**Impact:** Real iterative conversations instead of single-shot execution.

### 3. handleComplexQuery() Updated ✅

**Before:** Placeholder executor results

```typescript
// ❌ Hardcoded placeholder
const result: ExecutorResult = {
	data: { message: 'Executor result will be implemented' },
	tokensUsed: 1200
};
```

**After:** Real executor spawning with streaming

```typescript
for (const step of plan.steps) {
  if (step.executorRequired && plannerAgentId && dbPlanId) {
    yield { type: 'step_start', step };

    // ✅ Stream real executor conversation
    let result: ExecutorResult | undefined;
    for await (const event of this.spawnExecutor(step, sessionId, userId, dbPlanId, plannerAgentId)) {
      yield event; // Forward all events to user

      if (event.type === 'executor_result') {
        result = event.result;
      }
    }

    // Update step with actual result
    step.status = result?.success ? 'completed' : 'failed';
    step.result = result?.data;
  }
}
```

**Impact:** Complex queries now execute real agent-to-agent conversations.

---

## Database Persistence

### Tables Used

1. **`agents`** - Both planner and executor agents created
2. **`agent_plans`** - Plans persisted with steps
3. **`agent_chat_sessions`** - Conversation sessions tracked
4. **`agent_chat_messages`** - All messages saved (planner ↔ executor)
5. **`agent_executions`** - Execution records (can be added in future enhancement)

### Message Flow

```
User message
    ↓
chat_messages (user → system)
    ↓
agents (planner created)
    ↓
agent_plans (plan created)
    ↓
agents (executor created)
    ↓
agent_chat_sessions (conversation started)
    ↓
agent_chat_messages (task assignment)
    ↓
agent_chat_messages (executor response)
    ↓
agent_chat_messages (planner clarification) ← if needed
    ↓
agent_chat_messages (executor response)
    ↓
... (repeat until complete)
    ↓
agent_chat_sessions (status = completed)
    ↓
agents (executor status = completed)
    ↓
agent_plans (status = completed)
    ↓
agents (planner status = completed)
```

---

## System Prompts

### Executor System Prompt (Conversation Mode)

```
You are a Task Executor Agent in BuildOS, working with a Planner Agent to complete a task.

## Conversation Protocol

You are in an ITERATIVE conversation with the Planner Agent. You can:

1. **Ask Questions** - If you need clarification, ask the planner
   Format: "QUESTION: [your question]"

2. **Report Progress** - Keep planner informed
   Format: "PROGRESS: [what you're working on]"

3. **Return Results** - When you have the answer
   Format: "TASK COMPLETE: [summary]\n\nResults: [data]"

4. **Report Errors** - If you encounter issues
   Format: "ERROR: [description]"

Current turn: ${turnCount}/${maxTurns}
```

### Planner Evaluation Prompt

When planner needs to answer executor's question:

```
You are a Planning Agent supervising an Executor Agent.

The executor has asked you a question. Your job:
1. Understand what the executor needs
2. Provide a clear, specific answer
3. Help the executor make progress

Be specific and actionable.
```

---

## Termination Conditions

Conversation ends when:

1. **Task Complete** - Executor signals "TASK COMPLETE"
2. **Error** - Executor signals "ERROR"
3. **Max Turns** - Reached 10 turns without completion
4. **Manual Stop** - External cancellation (future)

---

## Example Conversation

### User Request

"Find the marketing project and list its tasks"

### Conversation Trace

```
[Turn 1]
Planner → Executor:
  "Please complete this task:
   Description: Find the marketing project
   Goal: Return project_id, name, and task list"

Executor (tool: search_projects):
  Searches for "marketing"

Executor → Planner:
  "QUESTION: Found 2 projects - 'Marketing Campaign' and 'Marketing Website'.
   Which one should I use?"

[Turn 2]
Planner → Executor:
  "Marketing Campaign"

Executor (tool: get_project_details):
  Retrieves project ID abc-123

Executor (tool: list_tasks):
  Gets tasks for project abc-123

Executor → Planner:
  "TASK COMPLETE: Found Marketing Campaign project.

   Results:
   - Project ID: abc-123
   - Name: Marketing Campaign
   - Tasks: 15 tasks (3 completed, 12 pending)"

[Conversation ends - 2 turns]
```

---

## Token Optimization

### Cost Savings vs Single-Shot

**Single-Shot Approach:**

- Planner context: ~5000 tokens per request
- No iteration = No refinement
- Total: ~5000 tokens

**Iterative Approach:**

- Planner context: ~5000 tokens (first request)
- Executor context: ~1500 tokens per turn
- Planner clarification: ~500 tokens per question
- Example (2 turns): 5000 + 1500 + 500 + 1500 = **8500 tokens**

**Trade-off:**

- ❌ Higher token cost per request (~70% increase)
- ✅ Much higher success rate (executor can ask questions)
- ✅ More accurate results (clarification loop)
- ✅ Better user experience (shows progress)

---

## Future Enhancements

### Phase 5 Possibilities

1. **Parallel Executors**
    - Execute independent steps concurrently
    - Aggregate results when all complete

2. **Executor-to-Executor Communication**
    - Allow executors to share results
    - Collaborative task execution

3. **Conversation Summarization**
    - Compress long conversations
    - Maintain key context, reduce tokens

4. **Smart Termination**
    - LLM-based evaluation of "is task done?"
    - Reduce false completions

5. **Conversation Replay**
    - Debug failed conversations
    - Analyze conversation patterns

6. **Token Tracking**
    - Track tokens per turn
    - Optimize conversation efficiency

---

## Testing Strategy

### Unit Tests Needed

1. **AgentConversationService**
    - `startConversation()` creates DB session
    - `executeConversation()` loops until termination
    - `parseExecutorResponse()` detects message types
    - `shouldEndConversation()` termination logic

2. **Planner Integration**
    - `spawnExecutor()` creates executor and starts conversation
    - `handleComplexQuery()` executes plan with real executors

### Integration Tests

1. **Simple Conversation** (1 turn)
    - Executor completes task immediately
    - No questions needed

2. **Clarification Conversation** (3 turns)
    - Executor asks 1 question
    - Planner answers
    - Executor completes

3. **Multi-Tool Conversation** (5 turns)
    - Executor uses multiple tools
    - Reports progress
    - Completes successfully

4. **Max Turns Reached**
    - Conversation hits limit
    - Graceful failure handling

5. **Error Handling**
    - Tool execution fails
    - Executor reports error
    - Conversation terminates

### Manual Testing

```bash
# 1. Start dev server
pnpm dev

# 2. Send complex query via API
curl -X POST http://localhost:5173/api/agent/stream \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Find the marketing project and list all incomplete tasks",
    "context_type": "global"
  }'

# 3. Observe SSE stream
# Should see:
# - analysis
# - plan_created
# - step_start
# - executor_spawned
# - text (conversation messages)
# - executor_result
# - step_complete
# - done

# 4. Check database
# Verify:
# - agents table has planner + executor
# - agent_plans has plan with steps
# - agent_chat_sessions has conversation
# - agent_chat_messages has all messages
```

---

## Success Criteria ✅

| Criterion                              | Status | Notes                                         |
| -------------------------------------- | ------ | --------------------------------------------- |
| AgentConversationService created       | ✅     | Full implementation with all methods          |
| Constructor dependency injection fixed | ✅     | Planner accepts executorService               |
| spawnExecutor uses conversations       | ✅     | Iterative loop implemented                    |
| handleComplexQuery calls spawnExecutor | ✅     | Real executors, no placeholders               |
| Type safety verified                   | ✅     | No TypeScript errors                          |
| Database persistence                   | ✅     | Agents, plans, sessions, messages saved       |
| Message protocol defined               | ✅     | 7 message types with clear semantics          |
| Termination detection                  | ✅     | TASK_COMPLETE, ERROR, max turns               |
| Streaming to user                      | ✅     | All conversation events yielded               |
| Documentation complete                 | ✅     | This document + updated STATUS.md + REVIEW.md |

---

## Files Modified

### Created

- ✅ `/apps/web/src/lib/services/agent-conversation-service.ts` (670 lines)
- ✅ `/apps/web/docs/features/chat-system/multi-agent-chat/ITERATIVE_CONVERSATION_IMPLEMENTATION.md`

### Modified

- ✅ `/apps/web/src/lib/services/agent-planner-service.ts`
    - Constructor: Added executorService parameter
    - Added conversationService property
    - Updated `spawnExecutor()`: Now streams conversation
    - Updated `handleComplexQuery()`: Calls real spawnExecutor
- ✅ `/apps/web/docs/features/chat-system/multi-agent-chat/STATUS.md`
- ✅ `/apps/web/docs/features/chat-system/multi-agent-chat/IMPLEMENTATION_REVIEW.md`

### No Changes Needed

- ✅ `/apps/web/src/routes/api/agent/stream/+server.ts` - Already correct
- ✅ `/apps/web/src/lib/services/agent-executor-service.ts` - DB methods ready for future use
- ✅ `/apps/web/src/lib/services/agent-context-service.ts` - Working as expected

---

## Conclusion

**The iterative LLM-to-LLM conversation architecture is now fully implemented.**

✅ Agents can have back-and-forth conversations
✅ Executor can ask planner for clarification
✅ Full database persistence and audit trail
✅ Type-safe implementation with zero TypeScript errors
✅ Streaming events to user for visibility

**Ready for Phase 5: Testing & UI Integration**

---

**Implementation Date:** 2025-10-29
**Implemented By:** Claude (Senior Engineer Mode)
**Architecture:** Option B - Full Iterative Conversations ✅
