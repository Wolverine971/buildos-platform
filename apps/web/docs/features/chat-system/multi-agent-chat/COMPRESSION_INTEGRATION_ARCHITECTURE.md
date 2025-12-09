<!-- apps/web/docs/features/chat-system/multi-agent-chat/COMPRESSION_INTEGRATION_ARCHITECTURE.md -->

# Chat Compression Integration Architecture

**Date:** 2025-10-29
**Status:** 🏗️ Design Phase
**Author:** Claude (Sonnet 4.5)

---

## Executive Summary

This document outlines the clean architecture for integrating the existing `ChatCompressionService` into the multi-agent system. The integration will optimize token usage across three key flows while maintaining backward compatibility and clean code patterns.

---

## Problem Analysis

### Current State

The multi-agent system has **three chat history flows**, but only one uses proper compression:

| Flow                     | Current State        | Problem                                                                                       |
| ------------------------ | -------------------- | --------------------------------------------------------------------------------------------- |
| **User → Planner**       | ❌ Simple truncation | User conversation history uses basic trimming (last 10 messages), not intelligent compression |
| **Planner ↔ Executor**  | ❌ No compression    | Iterative conversations accumulate messages linearly, can exceed executor token budget        |
| **Existing ChatService** | ✅ Has compression   | Regular chat uses `ChatCompressionService` properly                                           |

### Chat History Flow Traced

#### Flow 1: User → Planner (Main Entry)

```
Client (conversationHistory)
    ↓
/api/agent/stream/+server.ts (line 222)
    ↓
plannerService.processUserMessage({ conversationHistory, ... })
    ↓
AgentContextService.buildPlannerContext()
    ↓
compressConversationForPlanner() (line 148)
    ↓
❌ CURRENT: Simple truncation (last 10 messages, trim to 2500 tokens)
✅ SHOULD: Use ChatCompressionService for intelligent compression
```

**Code Location:** `agent-context-service.ts` lines 281-314

**Current Implementation:**

```typescript
private async compressConversationForPlanner(
    messages: ChatMessage[],
    currentMessage: string,
    tokenBudget: number  // 2500 tokens
): Promise<LLMMessage[]> {
    // Takes last 10 messages
    const recentMessages = messages.slice(-10);

    // Converts to LLM format
    const llmMessages: LLMMessage[] = recentMessages.map(...);

    // Estimates tokens (4 chars per token)
    const estimatedTokens = this.estimateTokens(...);

    // If over budget, just truncates
    if (estimatedTokens > tokenBudget) {
        const maxMessages = Math.floor(tokenBudget / 200);
        return llmMessages.slice(-maxMessages);
    }

    return llmMessages;
}
```

**Problem:**

- **No intelligent summarization** - just drops old messages
- **Loses context** - important information from earlier conversation lost
- **Inefficient** - rough token estimation (4 chars/token)

#### Flow 2: Planner ↔ Executor (Iterative Conversations)

```
AgentConversationService.executeConversation()
    ↓
Loop (max 10 turns):
    session.messages.push(message)  // Accumulates in memory
    ↓
    buildExecutorMessages(session)  // Line 470
    ↓
    ❌ CURRENT: Converts ALL session.messages to LLM format
    ↓
    smartLLM.streamText({ messages, ... })  // Line 403
```

**Code Location:** `agent-conversation-service.ts` lines 470-497

**Current Implementation:**

```typescript
private buildExecutorMessages(session: ConversationSession): LLMMessage[] {
    const messages: LLMMessage[] = [];

    // System prompt
    messages.push({ role: 'system', content: this.getExecutorSystemPrompt(session) });

    // Conversation history - ALL messages
    for (const msg of session.messages) {
        if (msg.type === 'task_assignment' || msg.type === 'clarification') {
            messages.push({ role: 'user', content: msg.content });
        } else {
            messages.push({ role: 'assistant', content: msg.content });
        }
    }

    return messages;
}
```

**Problem:**

- **Linear growth** - Every turn adds messages, no compression
- **Token budget exceeded** - Executor budget is 1500 tokens:
    - System prompt: ~300 tokens
    - Task description: ~200 tokens
    - Tools: ~400 tokens
    - **Remaining for history: ~600 tokens**
    - But 10 turns × 100 tokens/message = **1000 tokens needed**
- **Inefficient** - Passes entire conversation every turn

#### Flow 3: Existing Chat (For Reference)

```
/api/chat/stream/+server.ts
    ↓
ChatCompressionService.compressConversation()
    ↓
✅ WORKS: Keeps last 4 messages, compresses older with LLM
    ↓
Returns compressed messages + metadata
```

**Code Location:** `chat-compression-service.ts` lines 82-150

**This WORKS - we need to reuse this pattern.**

---

## Solution Architecture

### Design Principles

1. **Backward Compatible** - Compression is optional, system works without it
2. **Dependency Injection** - Services receive compression service via constructor
3. **Single Responsibility** - ChatCompressionService handles all compression logic
4. **Configurable** - Token budgets and compression thresholds configurable
5. **Observable** - Compressions saved to database for debugging

### Integration Strategy

**Two-Phase Rollout:**

| Phase       | Target                   | Impact                        | Risk                      |
| ----------- | ------------------------ | ----------------------------- | ------------------------- |
| **Phase 1** | User → Planner flow      | HIGH (every query uses this)  | LOW (well-tested service) |
| **Phase 2** | Planner ↔ Executor flow | MEDIUM (only complex queries) | MEDIUM (new context)      |

---

## Phase 1: Planner Context Compression

### Changes Required

#### 1. AgentContextService (`agent-context-service.ts`)

**Constructor Changes:**

```typescript
export class AgentContextService {
	private supabase: SupabaseClient<Database>;
	private compressionService?: ChatCompressionService; // ✅ NEW - Optional

	constructor(
		supabase: SupabaseClient<Database>,
		compressionService?: ChatCompressionService // ✅ NEW - Optional parameter
	) {
		this.supabase = supabase;
		this.compressionService = compressionService;
	}

	// ... rest of class
}
```

**Update `compressConversationForPlanner` Method (lines 281-314):**

```typescript
/**
 * Compress conversation history to fit within token budget
 * Uses ChatCompressionService if available, otherwise falls back to simple truncation
 */
private async compressConversationForPlanner(
    messages: ChatMessage[],
    currentMessage: string,
    tokenBudget: number,
    sessionId?: string  // ✅ NEW - For compression tracking
): Promise<LLMMessage[]> {
    // ✅ NEW: Use ChatCompressionService if available
    if (this.compressionService && sessionId) {
        try {
            const result = await this.compressionService.compressConversation(
                sessionId,
                messages,
                tokenBudget
            );

            // Add current message
            result.compressedMessages.push({
                role: 'user',
                content: currentMessage
            });

            return result.compressedMessages;
        } catch (error) {
            console.error('Compression failed, falling back to truncation:', error);
            // Fall through to simple truncation
        }
    }

    // ❌ FALLBACK: Simple truncation (existing code)
    const recentMessages = messages.slice(-10);
    const llmMessages: LLMMessage[] = recentMessages.map((msg) => ({
        role: msg.role as any,
        content: msg.content,
        tool_calls: msg.tool_calls as any,
        tool_call_id: msg.tool_call_id
    }));

    llmMessages.push({
        role: 'user',
        content: currentMessage
    });

    const estimatedTokens = this.estimateTokens(JSON.stringify(llmMessages));

    if (estimatedTokens <= tokenBudget) {
        return llmMessages;
    }

    const maxMessages = Math.floor(tokenBudget / 200);
    return llmMessages.slice(-maxMessages);
}
```

**Update `buildPlannerContext` Method (line 148):**

```typescript
// Line 147-152 - Pass sessionId for compression tracking
const compressedHistory = await this.compressConversationForPlanner(
	conversationHistory,
	userMessage,
	this.TOKEN_BUDGETS.PLANNER.CONVERSATION,
	sessionId // ✅ NEW - Pass sessionId
);
```

#### 2. AgentPlannerService (`agent-planner-service.ts`)

**Constructor Changes:**

```typescript
export class AgentPlannerService {
	private supabase: SupabaseClient<Database>;
	private smartLLM: SmartLLMService;
	private contextService: AgentContextService;
	private executorService: AgentExecutorService;
	private conversationService: AgentConversationService;
	private compressionService?: ChatCompressionService; // ✅ NEW

	constructor(
		supabase: SupabaseClient<Database>,
		smartLLM: SmartLLMService,
		compressionService?: ChatCompressionService // ✅ NEW - Optional
	) {
		this.supabase = supabase;
		this.smartLLM = smartLLM;
		this.compressionService = compressionService;

		// Pass compression service to context service
		this.contextService = new AgentContextService(
			supabase,
			compressionService // ✅ NEW
		);

		this.executorService = new AgentExecutorService(supabase, smartLLM);
		this.conversationService = new AgentConversationService(supabase, smartLLM);
	}

	// ... rest of class
}
```

#### 3. API Endpoint (`/api/agent/stream/+server.ts`)

**Instantiate ChatCompressionService:**

```typescript
// Line ~204 - After SmartLLMService instantiation
const smartLLM = new SmartLLMService({ supabase });
const executorService = new AgentExecutorService(supabase, smartLLM);

// ✅ NEW: Instantiate compression service (creates its own SmartLLMService internally)
const compressionService = new ChatCompressionService(supabase);

// ✅ NEW: Pass to planner service
const plannerService = new AgentPlannerService(
	supabase,
	executorService,
	smartLLM,
	compressionService // ✅ NEW
);
```

### Testing Strategy for Phase 1

```bash
# 1. Type check
pnpm run check

# 2. Run agent system tests (when available)
# pnpm test agent-context-service.test.ts

# 3. Manual test with real API
curl -X POST http://localhost:5173/api/agent/stream \
  -H "Authorization: Bearer <token>" \
  -d '{
    "message": "Find the marketing project",
    "context_type": "global",
    "conversation_history": [
      {"role": "user", "content": "Earlier message 1"},
      {"role": "assistant", "content": "Response 1"},
      ...
      (20+ messages to trigger compression)
    ]
  }'

# 4. Check database for compression records
psql $DATABASE_URL -c "SELECT * FROM chat_compressions ORDER BY created_at DESC LIMIT 5;"
```

### Expected Behavior After Phase 1

- ✅ User conversation history compressed intelligently
- ✅ Recent 4 messages kept uncompressed
- ✅ Older messages summarized by LLM
- ✅ Compression saved to database for debugging
- ✅ Token budget respected (~2500 tokens)
- ✅ Fallback to truncation if compression fails

---

## Phase 2: Executor Conversation Compression

### Changes Required

#### 1. AgentConversationService (`agent-conversation-service.ts`)

**Constructor Changes:**

```typescript
export class AgentConversationService {
	private supabase: SupabaseClient<Database>;
	private smartLLM: SmartLLMService;
	private compressionService?: ChatCompressionService; // ✅ NEW

	constructor(
		supabase: SupabaseClient<Database>,
		smartLLM: SmartLLMService,
		compressionService?: ChatCompressionService // ✅ NEW
	) {
		this.supabase = supabase;
		this.smartLLM = smartLLM;
		this.compressionService = compressionService;
	}

	// ... rest of class
}
```

**Add Compression Method:**

```typescript
/**
 * Compress executor conversation history
 * Strategy: Keep last 2 turns (4 messages), compress earlier turns
 */
private async compressExecutorHistory(
    session: ConversationSession,
    targetTokens: number = 600  // Executor budget for history
): Promise<ConversationMessage[]> {
    // If compression service not available, return all messages
    if (!this.compressionService) {
        return session.messages;
    }

    // If under threshold, no compression needed
    const COMPRESSION_THRESHOLD = 5;  // Start compressing after 5 messages
    if (session.messages.length <= COMPRESSION_THRESHOLD) {
        return session.messages;
    }

    try {
        // Convert to ChatMessage format for compression service
        const chatMessages: ChatMessage[] = session.messages.map((msg) => ({
            id: uuidv4(),
            chat_session_id: session.parentSessionId,
            role: msg.type === 'task_assignment' || msg.type === 'clarification' ? 'user' : 'assistant',
            content: msg.content,
            created_at: msg.timestamp.toISOString()
        }));

        // Compress using ChatCompressionService
        const result = await this.compressionService.compressConversation(
            session.id,
            chatMessages,
            targetTokens
        );

        // Convert back to ConversationMessage format
        const compressedMessages: ConversationMessage[] = result.compressedMessages.map((msg) => ({
            type: msg.role === 'user' ? 'task_assignment' : 'partial_result',
            content: msg.content,
            timestamp: new Date()
        }));

        return compressedMessages;
    } catch (error) {
        console.error('Executor history compression failed:', error);
        return session.messages;  // Fallback: return all messages
    }
}
```

**Update `buildExecutorMessages` Method (lines 470-497):**

```typescript
/**
 * Build message array for executor with compressed conversation context
 */
private async buildExecutorMessages(session: ConversationSession): Promise<LLMMessage[]> {
    const messages: LLMMessage[] = [];

    // System prompt
    messages.push({
        role: 'system',
        content: this.getExecutorSystemPrompt(session)
    });

    // ✅ NEW: Compress conversation history if needed
    const conversationMessages = await this.compressExecutorHistory(session);

    // Convert to LLM format
    for (const msg of conversationMessages) {
        if (msg.type === 'task_assignment' || msg.type === 'clarification') {
            messages.push({
                role: 'user',
                content: msg.content
            });
        } else {
            messages.push({
                role: 'assistant',
                content: msg.content
            });
        }
    }

    return messages;
}
```

**Update `getExecutorTurn` Method (line 379):**

```typescript
// Line 389-390 - Now async
private async getExecutorTurn(
    session: ConversationSession,
    userId: string
): Promise<{...}> {
    // ✅ CHANGED: Now async
    const messages = await this.buildExecutorMessages(session);

    // ... rest of method unchanged
}
```

**Update `executeConversation` Method (line 206):**

```typescript
// Line 241 - Now await
const executorResponse = await this.getExecutorTurn(session, userId);
```

#### 2. AgentPlannerService (`agent-planner-service.ts`)

**Update ConversationService Instantiation:**

```typescript
constructor(
    supabase: SupabaseClient<Database>,
    smartLLM: SmartLLMService,
    compressionService?: ChatCompressionService
) {
    this.supabase = supabase;
    this.smartLLM = smartLLM;
    this.compressionService = compressionService;

    this.contextService = new AgentContextService(supabase, compressionService);
    this.executorService = new AgentExecutorService(supabase, smartLLM);

    // ✅ NEW: Pass compression service to conversation service
    this.conversationService = new AgentConversationService(
        supabase,
        smartLLM,
        compressionService  // ✅ NEW
    );
}
```

### Configuration

**Add Compression Config Type:**

```typescript
// packages/shared-types/src/agent.types.ts

/**
 * Compression configuration for agent conversations
 */
export interface CompressionConfig {
	/** Enable compression (default: true if service available) */
	enabled: boolean;

	/** Number of recent messages to keep uncompressed */
	recentMessagesCount: number;

	/** Target token count for compressed history */
	targetTokens: number;

	/** Minimum messages before compression kicks in */
	compressionThreshold: number;
}

/**
 * Default compression configurations
 */
export const DEFAULT_COMPRESSION_CONFIG: {
	planner: CompressionConfig;
	executor: CompressionConfig;
} = {
	planner: {
		enabled: true,
		recentMessagesCount: 4,
		targetTokens: 2500,
		compressionThreshold: 10
	},
	executor: {
		enabled: true,
		recentMessagesCount: 4, // 2 turns
		targetTokens: 600,
		compressionThreshold: 5
	}
};
```

### Testing Strategy for Phase 2

```bash
# 1. Type check
pnpm run check

# 2. Test complex query with many turns
curl -X POST http://localhost:5173/api/agent/stream \
  -H "Authorization: Bearer <token>" \
  -d '{
    "message": "Find the marketing project and analyze all its tasks",
    "context_type": "global"
  }'

# Watch for multiple executor turns - should compress after 5 messages

# 3. Check database for executor compressions
psql $DATABASE_URL -c "
  SELECT c.*, acs.session_type
  FROM chat_compressions c
  JOIN agent_chat_sessions acs ON c.chat_session_id = acs.id
  WHERE acs.session_type = 'planner_executor'
  ORDER BY c.created_at DESC
  LIMIT 5;
"
```

### Expected Behavior After Phase 2

- ✅ Executor conversations compressed after 5 messages
- ✅ Last 2 turns (4 messages) kept uncompressed
- ✅ Earlier turns summarized
- ✅ Token budget respected (~600 tokens for history)
- ✅ Compression tracked in database
- ✅ Fallback if compression fails

---

## Implementation Checklist

### Phase 1: Planner Context

- [ ] Update `AgentContextService`:
    - [ ] Add `compressionService` to constructor (optional)
    - [ ] Update `compressConversationForPlanner()` to use service
    - [ ] Add sessionId parameter
    - [ ] Add try-catch with fallback
- [ ] Update `AgentPlannerService`:
    - [ ] Add `compressionService` to constructor (optional)
    - [ ] Pass to `AgentContextService`
- [ ] Update `/api/agent/stream/+server.ts`:
    - [ ] Instantiate `ChatCompressionService`
    - [ ] Pass to `AgentPlannerService`
- [ ] Test:
    - [ ] Type checking passes
    - [ ] Manual API test with long conversation
    - [ ] Verify compression records in database
    - [ ] Verify fallback works without service

### Phase 2: Executor Conversation

- [ ] Update `AgentConversationService`:
    - [ ] Add `compressionService` to constructor (optional)
    - [ ] Add `compressExecutorHistory()` method
    - [ ] Update `buildExecutorMessages()` to async
    - [ ] Update `getExecutorTurn()` to async
    - [ ] Update `executeConversation()` to await
- [ ] Update `AgentPlannerService`:
    - [ ] Pass `compressionService` to `AgentConversationService`
- [ ] Add compression config types:
    - [ ] Create `CompressionConfig` interface
    - [ ] Add default configs
- [ ] Test:
    - [ ] Type checking passes
    - [ ] Complex query with multiple turns
    - [ ] Verify executor compressions in database
    - [ ] Verify token budgets respected

---

## Benefits Summary

### Token Efficiency

| Scenario                             | Before       | After       | Savings           |
| ------------------------------------ | ------------ | ----------- | ----------------- |
| Long user conversation (20 messages) | 2000+ tokens | ~700 tokens | **65% reduction** |
| Executor 10-turn conversation        | 1000+ tokens | ~600 tokens | **40% reduction** |

### Code Quality

- ✅ **Backward compatible** - Works with or without compression service
- ✅ **Clean architecture** - Dependency injection, single responsibility
- ✅ **Observable** - Compressions tracked in database
- ✅ **Testable** - Easy to test with/without compression
- ✅ **Maintainable** - Reuses existing well-tested service

### User Experience

- ✅ **Faster responses** - Less token usage = faster processing
- ✅ **Lower costs** - Significant reduction in API costs
- ✅ **Better context** - Intelligent summarization preserves key information
- ✅ **More conversation history** - Can handle much longer conversations

---

## Risks and Mitigations

| Risk                        | Impact | Mitigation                                       |
| --------------------------- | ------ | ------------------------------------------------ |
| Compression service fails   | HIGH   | Try-catch with fallback to simple truncation     |
| Summarization loses context | MEDIUM | Keep recent 4 messages uncompressed              |
| Performance degradation     | LOW    | Compression is async, doesn't block main flow    |
| Database storage grows      | LOW    | Compressions are small, can add retention policy |

---

## Future Enhancements

1. **Adaptive Compression** - Adjust compression based on conversation complexity
2. **Compression Caching** - Cache compression results for repeated patterns
3. **Token Usage Analytics** - Dashboard showing compression effectiveness
4. **Custom Compression Strategies** - Different strategies for different contexts

---

## Related Documentation

- **Implementation Review:** `IMPLEMENTATION_REVIEW.md` - Original bug analysis
- **Bug Fixes:** `BUGFIX_SUMMARY.md` - Phase 4 bug fixes
- **Status Tracker:** `STATUS.md` - Current progress
- **Iterative Conversations:** `ITERATIVE_CONVERSATION_IMPLEMENTATION.md` - Phase 4 architecture
- **ChatCompressionService:** `apps/web/src/lib/services/chat-compression-service.ts` - Existing service

---

**Design Status:** ✅ Ready for Implementation
**Next Step:** Begin Phase 1 implementation (Planner context compression)
