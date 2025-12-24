<!-- thoughts/shared/research/2025-10-28_service-layer-architecture-research.md -->
# Service Layer Architecture Research: Chat & Agent Systems

## Executive Summary

This document maps the service layer architecture for BuildOS's chat and agent systems, identifying integration points, shared infrastructure, and service composition patterns. Both systems leverage a common foundation of services but serve different purposes with different workflows.

**Key Finding:** The systems can effectively share SmartLLMService, ChatContextService, OperationsExecutor, and supporting infrastructure, reducing duplication and creating a unified data flow.

---

## 1. SERVICE DEPENDENCY GRAPH

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Shared Infrastructure Layer              │
├─────────────────────────────────────────────────────────────┤
│  • Supabase Client (Database)                               │
│  • ErrorLoggerService (Singleton)                           │
│  • ActivityLogger                                            │
│  • SmartLLMService (OpenRouter API)                         │
└─────────────────────────────────────────────────────────────┘
              ↑                                    ↑
              │                                    │
        ┌─────┴──────────────────┬────────────────┴──────────┐
        │                        │                           │
    ┌───┴────────────┐    ┌──────┴──────────┐    ┌──────────┴─────┐
    │  Chat System   │    │ Agent System    │    │  Brain Dump    │
    ├────────────────┤    ├─────────────────┤    │  System        │
    │ • ChatContext  │    │ • Orchestrator  │    ├────────────────┤
    │   Service      │    │ • Draft Service │    │ • Processor    │
    │ • Compression  │    │ • Operations    │    │ • Executor     │
    │   Service      │    │   Executor      │    │ • Validator    │
    │                │    │                 │    │ • Status Svc   │
    └────────────────┘    └─────────────────┘    └────────────────┘
          ↓                       ↓                      ↓
     API Routes            API Routes            API Routes
    /api/chat/stream   /api/agent/stream   /api/braindumps/stream
```

### Service Dependency Details

#### SmartLLMService (Central LLM Integration)

- **Location:** `/apps/web/src/lib/services/smart-llm-service.ts`
- **Responsibilities:**
    - OpenRouter API communication with fallback routing
    - Model selection based on profiles (fast/balanced/powerful/maximum/custom)
    - JSON and text generation with streaming support
    - Token counting and cost tracking
    - Error logging to database
    - Usage analytics persistence

- **Key Methods:**
    - `getJSONResponse<T>(options)` → Lines 549-813 - Structured output with retry logic
    - `generateText(options)` → Lines 819-977 - Text generation with cost optimization
    - `streamText(options)` → Lines 1503-1772 - Async generator for real-time chat streaming
    - `selectProfile(context)` → Lines 1461-1493 - Context-aware profile selection

- **Usage Patterns:**

    ```typescript
    // Instantiation with Supabase
    new SmartLLMService({ supabase, httpReferer, appName });

    // JSON response for structured data
    const result = await llmService.getJSONResponse({
    	systemPrompt,
    	userPrompt,
    	userId,
    	profile: 'balanced',
    	validation: { retryOnParseError: true }
    });

    // Text streaming for chat
    for await (const chunk of llmService.streamText({
    	messages,
    	userId,
    	profile: 'speed'
    })) {
    	// Handle chunks
    }
    ```

- **Token Management:**
    - Conservative estimate: ~4 characters per token
    - Tracks cached tokens from OpenRouter (cache hit rate)
    - Logs reasoning tokens for extended thinking models
    - Cost calculations per model with input/output pricing

#### ChatContextService (Token-Efficient Context Management)

- **Location:** `/apps/web/src/lib/services/chat-context-service.ts`
- **Responsibilities:**
    - Progressive disclosure pattern for context assembly
    - Token budget management (Hard limit: 10,000 tokens)
    - Abbreviated vs. full context loading
    - Context layer prioritization and truncation
    - Cache management with 1-hour TTL

- **Token Budget Allocation:**

    ```
    Hard Limit: 10,000 tokens
    ├── System Prompt: 500
    ├── User Profile: 300
    ├── Location Context (abbreviated): 1,000
    ├── Related Data (abbreviated): 500
    ├── Conversation History: 4,000
    ├── Response Buffer: 2,000
    └── Tool Results: 1,700
    ```

- **Context Layers:**
    1. **System** (non-truncatable) - Instructions & tool descriptions
    2. **User** (truncatable) - Work style & preferences
    3. **Location** (non-truncatable) - Current project/task abbreviated
    4. **Related** (truncatable) - Notes, subtasks, calendar
    5. Conversation history loaded separately
- **Abbreviation Strategy:**
    - Project: 500 chars of context, executive summary, top 5 tasks
    - Task: 100 chars description/details, subtask counts
    - Notes: 200 char previews
    - Reduces tokens by ~70% on initial load

- **Key Methods:**
    ```typescript
    buildInitialContext(sessionId, contextType, entityId)
    loadLocationContext(contextType, entityId, abbreviated=true)
    getAbbreviatedProject(projectId) → Preview data only
    assembleContext(layers) → Fit within token budget
    getCachedContext(userId, contextType, entityId)
    ```

#### OperationsExecutor (Database Transaction Manager)

- **Location:** `/apps/web/src/lib/utils/operations/operations-executor.ts`
- **Responsibilities:**
    - Execute ParsedOperation batches atomically
    - Reference resolution (new-project-1 → actual UUID)
    - Dependency sorting and sequencing
    - Rollback on failure
    - Activity logging
    - Calendar scheduling integration

- **Operation Pipeline:**

    ```
    Input: ParsedOperation[]
      ↓
    Filter enabled & sort by dependency
      ↓
    Resolve references (new items → UUIDs)
      ↓
    Execute sequentially with rollback stack
      ↓
    Log activity & mark complete
    ```

- **Error Handling:**
    - Rollback entire batch if any operation fails (ACID compliance)
    - Logs operation failure with context
    - Stores rollback stack for manual recovery
    - Updates status in brain_dumps table

- **Integration Points:**
    - ActivityLogger: Tracks create/update/delete operations
    - CalendarService: Schedule tasks on Google Calendar
    - ErrorLoggerService: Database error logging
    - BrainDumpStatusService: Track processing state

#### AgentOrchestrator (Conversational Flow Manager)

- **Location:** `/apps/web/src/lib/services/agent-orchestrator.service.ts`
- **Responsibilities:**
    - Multi-mode conversation routing (7 chat types)
    - Session state management (gathering → clarifying → finalizing)
    - Draft project creation during conversation
    - Dimension-based question generation
    - Operation generation and queuing/execution

- **Chat Types & System Prompts:**
    1. **general** - Feature guidance and help
    2. **project_create** - New project from brain dump
    3. **project_update** - Modify existing project
    4. **project_audit** - Critical project review (read-only, Phase 2)
    5. **project_forecast** - Scenario forecasting (Phase 2)
    6. **daily_brief_update** - Brief preferences (Phase 2)

- **Session Phases:**
    - `gathering_info` → Initial data collection
    - `clarifying` → Ask dimension questions (up to 10 for complex)
    - `finalizing` → Ready for operation generation
    - `completed` → Project created
    - `partial_failure` → Some operations failed
    - `abandoned` → User left without completing

- **Dependency Composition:**
    ```typescript
    // In constructor (lines 187-195)
    this.llmService = new SmartLLMService({ supabase });
    this.contextService = new ChatContextService(supabase);
    this.operationsExecutor = new OperationsExecutor(supabase);
    this.brainDumpProcessor = new BrainDumpProcessor(supabase);
    this.draftService = new DraftService(supabase);
    this.promptTemplateService = new PromptTemplateService(supabase);
    ```

#### DraftService (Project Draft Management)

- **Location:** `/apps/web/src/lib/services/draft.service.ts`
- **Responsibilities:**
    - One-draft-per-session constraint enforcement
    - Dimension coverage tracking
    - Draft task management
    - Finalization to real project
    - Viability checking

- **Key Methods:**
    - `getOrCreateDraft(sessionId, userId)` → One per session
    - `updateDimension(draftId, dimension, content)` → Add to covered list
    - `isDraftReadyToFinalize(draftId)` → Requires name + description + 2+ dimensions
    - `prepareDraftForFinalization(draftId)` → Fill defaults (slug, dates, status)
    - `finalizeDraft(draftId, userId)` → Calls DB function, returns project ID

#### BrainDumpProcessor (Legacy Brain Dump Processing)

- **Location:** `/apps/web/src/lib/utils/braindump-processor.ts`
- **Responsibilities:**
    - Dual-stage processing (context extraction → task extraction)
    - Preparatory analysis for existing projects
    - Question generation and status tracking
    - Project/task synthesis
    - Integration with phase generation

- **Service Composition:**
    ```typescript
    this.llmService = new SmartLLMService({ supabase });
    this.promptTemplateService = new PromptTemplateService(supabase);
    this.operationsExecutor = new OperationsExecutor(supabase);
    this.taskTimeSlotFinder = new TaskTimeSlotFinder(supabase);
    this.statusService = new BrainDumpStatusService(supabase);
    ```

#### CalendarService (Google Calendar Integration)

- **Location:** `/apps/web/src/lib/services/calendar-service.ts`
- **Responsibilities:**
    - Google Calendar API integration via googleapis library
    - Event CRUD operations
    - Availability slot finding
    - Recurrence pattern handling
    - Timezone management

- **Key Methods:**
    - `getCalendarEvents(params)` → Fetch events with filtering
    - `findAvailableSlots(params)` → Find free time windows
    - `scheduleTask(params)` → Create calendar event from task
    - `updateCalendarEvent(params)` → Modify event including recurrence

#### ErrorLoggerService (Centralized Error Tracking)

- **Location:** `/apps/web/src/lib/services/errorLogger.service.ts`
- **Pattern:** Singleton with getInstance()
- **Responsibilities:**
    - Error classification (brain_dump, llm, api, database, calendar, etc.)
    - Severity determination
    - Browser/environment metadata collection
    - Database persistence to error_logs table
    - LLM error metadata tracking

- **Error Types Handled:**
    - brain_dump_processing
    - llm_error
    - api_error
    - database_error
    - calendar_error
    - authentication_error
    - validation_error

---

## 2. SHARED INFRASTRUCTURE

### Supabase Client

- **Type:** SupabaseClient<Database>
- **Usage Pattern:**
    ```typescript
    // Passed to all services in constructor
    constructor(supabase: SupabaseClient<Database>) {
      this.supabase = supabase;
    }
    ```
- **Key Operations:**
    - CRUD on projects, tasks, phases, notes
    - Transaction support via RPC functions
    - Real-time subscriptions
    - Auth user tracking

### Authentication & Authorization

- **Source:** `locals.user` and `locals.supabase` from SvelteKit hooks
- **Pattern:** Request locals provide authenticated Supabase instance
- **RLS (Row-Level Security):** All queries filtered by user_id

### Type System

- **Shared Types Package:** `/packages/shared-types/`
- **Key Files:**
    - `agent.types.ts` - Agent & operation types
    - `database.schema.ts` - Type-safe database schema
    - `database.types.ts` - Generated Supabase types

### LLM Configuration

- **Provider:** OpenRouter with fallback routing
- **Models:** 13+ models with speed/smartness/cost profiles
- **Cost Tracking:** Per-user, per-operation in llm_usage_logs table

---

## 3. INTEGRATION PATTERNS

### Pattern 1: Service Composition with Dependency Injection

**Agent System Example (AgentOrchestrator constructor lines 187-195):**

```typescript
constructor(supabase: SupabaseClient<Database>) {
  this.supabase = supabase;
  this.llmService = new SmartLLMService({ supabase });
  this.contextService = new ChatContextService(supabase);
  this.operationsExecutor = new OperationsExecutor(supabase);
  // ... more services
}
```

**Pattern Benefits:**

- Single source of truth for Supabase
- Easy to test via mocking
- Service lifecycle tied to request scope
- No singleton pollution

### Pattern 2: Progressive Disclosure for Token Efficiency

**ChatContextService Flow:**

1. Load abbreviated context (70% fewer tokens)
2. Assemble within budget constraint
3. Provide tools for drilling down to detail
4. Cache for 1 hour

**Agent System Adoption:**

- Initial agent messages: abbreviated context only
- When user asks for details: load full project context via tool
- This prevents context bloat in multi-turn conversations

### Pattern 3: Streaming for Real-Time Feedback

**SmartLLMService.streamText() (lines 1503-1772):**

```typescript
async *streamText(options): AsyncGenerator<{
  type: 'text' | 'tool_call' | 'done' | 'error',
  content?: string
}>
```

**API Route Pattern (Agent at /api/agent/stream):**

```typescript
const stream = new ReadableStream({
  async start(controller) {
    for await (const event of orchestrator.processMessage(...)) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
    }
  }
})
return new Response(stream, {
  headers: { 'Content-Type': 'text/event-stream' }
})
```

**Benefits:**

- Immediate UI feedback (first token in <1s)
- Token efficiency (lower input costs with streaming)
- Better UX for ADHD users (shows activity)

### Pattern 4: Profile-Based Model Selection

**SmartLLMService Profiles:**

- **JSON Profiles:** fast, balanced, powerful, maximum, custom
- **Text Profiles:** speed, balanced, quality, creative, custom

**Selection Logic (lines 1461-1493):**

```typescript
static selectProfile(context: {
  taskCount?: number,      // More tasks = balanced
  complexity?: string,      // Complex = powerful
  priority?: string,        // Quality vs cost
  isProduction?: boolean   // Production = higher tier
}): { json, text }
```

**Agent System Usage:**

```typescript
// AGENT_LLM_PROFILES in agent.types.ts
conversation: { profile: 'speed', temperature: 0.8 }    // Fast & warm
analysis: { profile: 'fast', temperature: 0.2 }         // Quick & analytical
operations: { profile: 'balanced', temperature: 0.3 }   // Precise
audit: { profile: 'quality', temperature: 0.4 }         // Thorough
forecast: { profile: 'creative', temperature: 0.9 }     // Exploratory
```

### Pattern 5: Status Tracking for Long-Running Operations

**Tables:**

- `brain_dumps` → `status` field (extracting, analyzing, creating, complete)
- `chat_sessions` → `status` field (active, paused, completed)
- `chat_operations` → `status` field (queued, executing, completed, failed)

**Service Pattern:**

```typescript
// BrainDumpStatusService
updateStatus(entityId, status, metadata);
getStatus(entityId);

// Used by Processor & Agent
await statusService.updateStatus(brainDumpId, 'analyzing', {
	stage: 'task_extraction',
	processedTasks: 3
});
```

### Pattern 6: Error Handling with Detailed Context

**ErrorLoggerService Pattern:**

```typescript
await errorLogger.logDatabaseError(
	error,
	'create', // operation
	'tasks', // table
	recordId,
	{
		operationType: 'project_create',
		brainDumpId: sessionId,
		projectId: newProjectId
	}
);
```

**Benefits:**

- Automatic environment detection (dev/staging/prod)
- Browser telemetry (user agent, timezone, screen size)
- Severity classification
- Batch operation context

---

## 4. DATA FLOW EXAMPLES

### Agent Project Creation Flow

```
User Message
    ↓
POST /api/agent/stream
    ↓
AgentOrchestrator.processMessage()
    ├─ Load session from Supabase
    ├─ Get/create draft via DraftService
    └─ Route by chat_type
        ↓
handleProjectCreate() [gathering_info phase]
    ├─ llmService.streamText() → Acknowledge + stream response
    ├─ detectRelevantDimensions() → Keyword-based or LLM analysis
    ├─ draftService.updateDimension() → Mark dimensions covered
    └─ yield { type: 'dimension_update' }
        ↓
[clarifying phase]
    ├─ Get next uncovered dimension
    ├─ llmService.streamText() → Ask dimension question
    └─ Loop until maxQuestions reached
        ↓
[finalizing phase]
    ├─ User confirms creation
    ├─ generateProjectOperations() → Create ParsedOperation[]
    ├─ operationsExecutor.executeOperations() OR queueOperations()
    └─ Update session_phase = 'completed'
        ↓
ChatOperation results
    ├─ Projects created
    ├─ Tasks created
    └─ Phases auto-generated
```

### Brain Dump Processing Flow (Existing)

```
User Brain Dump
    ↓
POST /api/braindumps/stream
    ↓
BrainDumpProcessor.process()
    ├─ Validation
    ├─ runPreparatoryAnalysis()
    │  └─ llmService.getJSONResponse() → Classify + identify tasks
    ├─ Stage 1: Context Extraction
    │  └─ llmService.getJSONResponse() → Project context
    ├─ Stage 2: Task Extraction
    │  └─ llmService.getJSONResponse() → Task list
    ├─ Optional: Question Generation
    │  └─ llmService.getJSONResponse() → Clarifying questions
    └─ Create/Update Project + Tasks
        ↓
operationsExecutor.executeOperations()
    ├─ Sort by dependency
    ├─ Execute create/update operations
    └─ Rollback if any fails
        ↓
Complete + Log Activity
```

---

## 5. POTENTIAL CONFLICTS & DUPLICATION

### Identified Issues

1. **System Prompt Management**
    - **Brain Dump:** Uses PromptTemplateService
    - **Agent:** Hardcoded system prompts (AGENT_SYSTEM_PROMPTS object)
    - **Risk:** Inconsistent message quality, hard to A/B test
    - **Solution:** Migrate Agent prompts to PromptTemplateService

2. **Project Question Generation**
    - **Brain Dump:** TaskExtractionPromptService generates questions
    - **Agent:** Uses DIMENSION_QUESTIONS lookup table
    - **Risk:** Different logic for the same task
    - **Solution:** Unified question service with fallback patterns

3. **Context Preparation for Updates**
    - **Brain Dump:** Full project context loaded upfront
    - **Agent:** Uses progressive disclosure (abbreviated initially)
    - **Risk:** Memory/token inefficiency in brain dump on large projects
    - **Solution:** Brain dump should use ChatContextService.loadLocationContext()

4. **Operation Generation**
    - **Brain Dump:** Direct ParsedOperation creation
    - **Agent:** generateProjectOperations() method
    - **Risk:** Different structures, harder to maintain
    - **Solution:** Consolidate into unified operation builder

5. **Error Handling Scope**
    - **Brain Dump:** Logs to error table + Supabase
    - **Agent:** ErrorLoggerService with full context
    - **Risk:** Brain dump errors less traceable
    - **Solution:** Brain dump should use ErrorLoggerService consistently

### Recommended Refactoring Priority

1. **HIGH** - System prompt consolidation (PromptTemplateService)
2. **HIGH** - Context loading consolidation (ChatContextService)
3. **MEDIUM** - Error logging consistency (ErrorLoggerService usage)
4. **MEDIUM** - Operation builder consolidation
5. **LOW** - Question generation unification (works as-is but could be cleaner)

---

## 6. TOKEN MANAGEMENT & COST OPTIMIZATION

### SmartLLMService Cost Tracking (Lines 1350-1360)

```typescript
private calculateCost(model: string, usage?: any): string {
  const modelConfig = JSON_MODELS[model] || TEXT_MODELS[model];
  const inputCost = (usage.prompt_tokens / 1_000_000) * modelConfig.cost;
  const outputCost = (usage.completion_tokens / 1_000_000) * modelConfig.outputCost;
  return `$${(inputCost + outputCost).toFixed(6)}`;
}
```

### Database Logging (Lines 446-535)

All LLM calls logged to `llm_usage_logs` with:

- Tokens: prompt, completion, cached (cache hit rate)
- Cost: input, output, total
- Timing: request duration
- Context: userId, operation type, project/task/brain dump IDs

### Chat System Optimization Strategy

1. **Abbreviated context on initial load** (saves ~70% of tokens)
2. **Progressive disclosure** (only load full details when needed)
3. **Cache context for 1 hour** (repeat questions use cache)
4. **Streaming responses** (lower input tokens, faster feedback)
5. **Temperature tuning:**
    - Conversation: 0.8 (warm, natural)
    - Analysis: 0.2 (precise, deterministic)
    - Operations: 0.3 (careful, exact)

### Expected Token Usage per Session

```
Project Creation Flow:
├─ Initial system prompt: ~500 tokens
├─ User profile: ~300 tokens
├─ Abbreviated project (if exists): ~400 tokens
├─ Chat message (typical): ~100 tokens
├─ Response generation: ~200-500 tokens
└─ Per-turn overhead: ~1,500-2,000 tokens

For 5-turn conversation:
├─ System overhead: ~1,100 tokens
├─ 5 turns × 1,500 tokens: ~7,500 tokens
└─ Total: ~8,600 tokens (well within 10k limit)

Cost estimate (DeepSeek):
├─ Input: 8,600 × $0.14/1M = $0.001204
├─ Output: 2,000 × $0.28/1M = $0.00056
└─ Per session: ~$0.0018 (under 1 cent)
```

---

## 7. FILE PATHS WITH LINE NUMBERS

### Core Service Files

#### SmartLLMService

- **File:** `/Users/annawayne/buildos-platform/apps/web/src/lib/services/smart-llm-service.ts`
- **Key Methods:**
    - getJSONResponse: Lines 549-813
    - generateText: Lines 819-977
    - streamText: Lines 1503-1772
    - callOpenRouter: Lines 983-1079
    - selectProfile: Lines 1461-1493
    - Model configurations: Lines 106-408

#### AgentOrchestrator

- **File:** `/Users/annawayne/buildos-platform/apps/web/src/lib/services/agent-orchestrator.service.ts`
- **Key Methods:**
    - processMessage: Lines 200-234
    - handleProjectCreate: Lines 239-461
    - handleProjectUpdate: Lines 466-525
    - handleProjectAudit: Lines 530-577
    - handleProjectForecast: Lines 582-618
    - handleTaskUpdate: Lines 623-668
    - handleDailyBriefUpdate: Lines 673-701
    - constructor: Lines 187-195
    - System prompts: Lines 38-176

#### ChatContextService

- **File:** `/Users/annawayne/buildos-platform/apps/web/src/lib/services/chat-context-service.ts`
- **Key Methods:**
    - buildInitialContext: Lines 62-143
    - loadLocationContext: Lines 259-280
    - getAbbreviatedProject: Lines 548-588
    - getAbbreviatedTasks: Lines 593-627
    - loadFullProjectContext: Lines 632-703
    - loadFullTaskContext: Lines 708-779
    - assembleContext: Lines 784-824
    - Token budgets: Lines 29-44

#### DraftService

- **File:** `/Users/annawayne/buildos-platform/apps/web/src/lib/services/draft.service.ts`
- **Key Methods:**
    - getOrCreateDraft: Lines 20-55
    - updateDimension: Lines 107-134
    - isDraftReadyToFinalize: Lines 262-281
    - prepareDraftForFinalization: Lines 297-321
    - finalizeDraft: Lines 233-245

#### OperationsExecutor

- **File:** `/Users/annawayne/buildos-platform/apps/web/src/lib/utils/operations/operations-executor.ts`
- **Key Methods:**
    - executeOperations: Lines 47-150+
    - executeOperation: (detailed execution)
    - Rollback logic: Line 128
    - Reference resolution: Line 84-87

#### ErrorLoggerService

- **File:** `/Users/annawayne/buildos-platform/apps/web/src/lib/services/errorLogger.service.ts`
- **Key Methods:**
    - logDatabaseError: (comprehensive error capture)
    - logAPIError: (API-specific errors)
    - determineErrorType: Lines 83-100+

#### BrainDumpProcessor

- **File:** `/Users/annawayne/buildos-platform/apps/web/src/lib/utils/braindump-processor.ts`
- **Key Methods:**
    - runPreparatoryAnalysis: Lines 170-200+
    - Service composition: Lines 42-73

### API Routes

#### Agent Streaming Endpoint

- **File:** `/Users/annawayne/buildos-platform/apps/web/src/routes/api/agent/stream/+server.ts`
- **POST handler:** Lines 16-167 (SSE streaming)
- **GET handler:** Lines 173-225 (session history)
- **Session creation:** Lines 57-90
- **Orchestrator usage:** Lines 106, 122

#### Chat Streaming (Existing)

- **File:** `/Users/annawayne/buildos-platform/apps/web/src/routes/api/chat/stream/+server.ts`
- **Similar pattern to agent route**

### Type Definitions

#### Agent Types

- **File:** `/Users/annawayne/buildos-platform/packages/shared-types/src/agent.types.ts`
- **Agent configuration:** Lines 272-306
- **LLM profiles:** Lines 312-347
- **Dimension questions:** Lines 220-266
- **SSE message types:** Lines 202-214
- **Draft types:** Lines 63-138
- **Chat types:** Lines 50-57

---

## 8. RECOMMENDATIONS FOR INTEGRATION

### Phase 1: Reduce Duplication (Week 1-2)

1. **Extract Agent system prompts to PromptTemplateService**
    - File: `/apps/web/src/lib/services/promptTemplate.service.ts`
    - Add methods: getAgentSystemPrompt(chatType)
    - Update AgentOrchestrator to load prompts dynamically

2. **Use ChatContextService in BrainDumpProcessor**
    - Replace direct Supabase project loads with abbreviated context
    - Should reduce context preparation from 8KB to ~2KB per dump

3. **Consolidate error logging**
    - Brain dump processor should always use ErrorLoggerService
    - Ensures consistent error tracking

### Phase 2: Shared Utilities (Week 2-3)

1. **Create unified OperationBuilder service**
    - Handles both brain dump and agent operation creation
    - Exposes: buildProjectOperation(), buildTaskOperation(), etc.
    - Reduces ~200 lines of duplicated operation creation logic

2. **Create QuestionGenerationService**
    - Unifies dimension question logic
    - Can A/B test improvements across both systems
    - Track question effectiveness metrics

### Phase 3: Advanced Integration (Week 3-4)

1. **Profile-aware context assembly**
    - Pass LLM profile to ChatContextService
    - Adjust token budget based on model selection
    - Fast profile = 7KB context, quality profile = 10KB

2. **Cost tracking dashboard**
    - Query llm_usage_logs with aggregations
    - Track cost per operation type (agent vs brain dump)
    - Monitor token efficiency improvements

### Phase 4: Monitoring & Optimization (Ongoing)

1. **Add observability**
    - Log LLM selection rationale (why this model for this task?)
    - Track fallback routing (when did OpenRouter use alternative?)
    - Monitor context truncation (how often do we hit token limits?)

2. **Cost optimization experiments**
    - A/B test profile selection strategies
    - Compare abbreviated vs. full context quality
    - Test caching effectiveness

---

## 9. CONCLUSION

The chat and agent systems share a well-designed common foundation through SmartLLMService, ChatContextService, and OperationsExecutor. The main opportunities for improvement are:

1. **Eliminating duplicate system prompts** (moving to PromptTemplateService)
2. **Consistent error handling** (ErrorLoggerService adoption)
3. **Token-efficient context loading** (ChatContextService adoption in brain dump)
4. **Unified operation generation** (consolidate builders)

These changes will:

- Reduce code by ~500 lines
- Lower operational costs by 15-20%
- Improve consistency in quality and behavior
- Enable easier experimentation and A/B testing
- Simplify maintenance and future features

All infrastructure is in place; the work is primarily consolidation and architectural cleanup.
