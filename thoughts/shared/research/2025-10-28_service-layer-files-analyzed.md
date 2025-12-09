<!-- thoughts/shared/research/2025-10-28_service-layer-files-analyzed.md -->
# Service Layer Research - Files Analyzed

**Research Date:** 2025-10-28  
**Scope:** Chat and Agent Systems Service Layer Architecture

---

## Core Services Analyzed

### SmartLLMService

**File:** `/Users/annawayne/buildos-platform/apps/web/src/lib/services/smart-llm-service.ts`  
**Lines:** 1,786 total  
**Key Content:**

- Model profiles: JSON (106-255) & Text (257-388)
- Profile mappings: 394-408
- getJSONResponse: 549-813
- generateText: 819-977
- streamText: 1503-1772
- callOpenRouter: 983-1079
- selectProfile: 1461-1493

**Integration Points:**

- Used by: AgentOrchestrator, BrainDumpProcessor, ProjectBriefTemplateGenerator, TimeBlockSuggestionService
- Dependencies: ErrorLoggerService, OpenRouter API
- Database: llm_usage_logs table for analytics

### AgentOrchestrator

**File:** `/Users/annawayne/buildos-platform/apps/web/src/lib/services/agent-orchestrator.service.ts`  
**Lines:** 1,146 total  
**Key Content:**

- System prompts: 38-176 (7 agent modes)
- processMessage: 200-234
- handleProjectCreate: 239-461
- handleProjectUpdate: 466-525
- handleProjectAudit: 530-577
- handleProjectForecast: 582-618
- handleTaskUpdate: 623-668
- handleDailyBriefUpdate: 673-701
- Constructor (service composition): 187-195

**Integration Points:**

- Dependencies: SmartLLMService, ChatContextService, OperationsExecutor, BrainDumpProcessor, DraftService, PromptTemplateService
- Database: chat_sessions, chat_messages, chat_operations, project_drafts tables

### ChatContextService

**File:** `/Users/annawayne/buildos-platform/apps/web/src/lib/services/chat-context-service.ts`  
**Lines:** 963 total  
**Key Content:**

- Token budgets: 29-44 (10,000 token hard limit)
- buildInitialContext: 62-143
- getSystemPrompt: 148-225
- loadUserProfile: 230-254
- loadLocationContext: 259-280
- getAbbreviatedProject: 548-588
- getAbbreviatedTasks: 593-627
- loadFullProjectContext: 632-703
- loadFullTaskContext: 708-779
- assembleContext: 784-824

**Integration Points:**

- Used by: Chat system, potentially Brain Dump
- Dependencies: Supabase client
- Database: projects, tasks, notes, calendar_events, users tables

### DraftService

**File:** `/Users/annawayne/buildos-platform/apps/web/src/lib/services/draft.service.ts`  
**Lines:** 382 total  
**Key Content:**

- getOrCreateDraft: 20-55
- getDraft: 60-78
- getUserDrafts: 83-102
- updateDimension: 107-134
- updateDraft: 139-152
- incrementQuestionCount: 157-173
- addDraftTask: 178-197
- isDraftReadyToFinalize: 262-281
- prepareDraftForFinalization: 297-321
- finalizeDraft: 233-245

**Integration Points:**

- Used by: AgentOrchestrator
- Dependencies: Supabase client
- Database: project_drafts, draft_tasks tables

### OperationsExecutor

**File:** `/Users/annawayne/buildos-platform/apps/web/src/lib/utils/operations/operations-executor.ts`  
**Lines:** 150+ (partial read)  
**Key Content:**

- executeOperations: 47-150+
- Operation filtering and sorting
- Reference resolution: 84-87
- Rollback logic: 128
- Activity logging integration
- Calendar service integration

**Integration Points:**

- Used by: AgentOrchestrator, BrainDumpProcessor
- Dependencies: ActivityLogger, ErrorLoggerService, CalendarService, OperationValidator, ReferenceResolver
- Database: projects, tasks, phases, notes tables + activity logging

### ErrorLoggerService

**File:** `/Users/annawayne/buildos-platform/apps/web/src/lib/services/errorLogger.service.ts`  
**Lines:** 100+ (partial read)  
**Key Content:**

- getInstance (Singleton): 24-29
- detectEnvironment: 31-42
- getBrowserInfo: 44-58
- extractErrorInfo: 60-81
- determineErrorType: 83-100+

**Integration Points:**

- Singleton pattern for system-wide error logging
- Used by: SmartLLMService, OperationsExecutor, AgentOrchestrator
- Database: error_logs table

---

## Supporting Services Analyzed

### BrainDumpProcessor

**File:** `/Users/annawayne/buildos-platform/apps/web/src/lib/utils/braindump-processor.ts`  
**Lines:** 200+ (partial read)  
**Key Content:**

- Service composition: 42-73
- runPreparatoryAnalysis: 170-200+
- Dependencies: SmartLLMService, PromptTemplateService, OperationsExecutor, TaskTimeSlotFinder, BrainDumpStatusService

**Integration Points:**

- Used by: AgentOrchestrator (imported but not fully utilized)
- Potential: Share context loading with ChatContextService

### CalendarService

**File:** `/Users/annawayne/buildos-platform/apps/web/src/lib/services/calendar-service.ts`  
**Lines:** 100+ (partial read)  
**Key Content:**

- Google Calendar API integration
- Parameter types: GetCalendarEventsParams, FindAvailableSlotsParams, ScheduleTaskParams
- Methods: getCalendarEvents, findAvailableSlots, scheduleTask, updateCalendarEvent

**Integration Points:**

- Used by: OperationsExecutor for task scheduling
- Dependencies: googleapis library, GoogleOAuthService
- Database: calendar_events table

---

## Type Definitions Analyzed

### Agent Types

**File:** `/Users/annawayne/buildos-platform/packages/shared-types/src/agent.types.ts`  
**Lines:** 397 total  
**Key Content:**

- TableName: 10-21
- OperationType: 23
- ParsedOperation interface: 25-44
- AgentChatType: 50-57
- ProjectDraft interface: 63-107
- DraftTask interface: 109-138
- ChatOperation interface: 144-162
- AgentMetadata interface: 168-188
- AgentSessionPhase: 190-196
- AgentSSEMessage: 202-214
- DIMENSION_QUESTIONS: 220-266
- AgentConfig & DEFAULT_AGENT_CONFIG: 272-306
- AGENT_LLM_PROFILES: 312-347
- Helper functions: 353-397

**Integration Points:**

- Used by: All agent and chat systems
- Shared across: web app and shared packages

---

## API Routes Analyzed

### Agent Streaming Endpoint

**File:** `/Users/annawayne/buildos-platform/apps/web/src/routes/api/agent/stream/+server.ts`  
**Lines:** 226 total  
**Key Content:**

- POST handler (SSE streaming): 16-167
- GET handler (session history): 173-225
- Session creation: 57-90
- Orchestrator instantiation: 106
- Event streaming loop: 122-139

**Integration Points:**

- Uses: AgentOrchestrator
- Database: chat_sessions, chat_messages, chat_operations tables

### Chat Streaming Endpoint

**File:** `/Users/annawayne/buildos-platform/apps/web/src/routes/api/chat/stream/+server.ts`  
**Status:** Located but not analyzed in detail  
**Integration:** Similar pattern to agent endpoint

### Brain Dump Streaming Endpoint

**File:** `/Users/annawayne/buildos-platform/apps/web/src/routes/api/braindumps/stream/+server.ts`  
**Status:** Located but not analyzed in detail  
**Integration:** Uses BrainDumpProcessor

---

## Database Tables Referenced

### Chat-Related Tables

- `chat_sessions` - Session metadata, context_type/chat_type, agent_metadata
- `chat_messages` - Conversation history, role-based (user/assistant)
- `chat_operations` - Queued/executed operations, status tracking
- `chat_context_cache` - 1-hour TTL context cache for optimization

### Project/Draft Tables

- `projects` - Main project data with all dimension fields
- `project_drafts` - One-per-session drafts during agent conversation
- `draft_tasks` - Tasks created within a draft
- `tasks` - Final task records after operations execute
- `phases` - Project phases (auto-generated or manual)

### LLM/Error Tracking Tables

- `llm_usage_logs` - Token counts, costs, model selection, timing
- `error_logs` - Classified errors with environment metadata

---

## External Dependencies

### OpenRouter API

- Used by: SmartLLMService
- Features: Model fallback routing, prometheus metrics integration
- Models: 13+ with cost/speed/smartness profiles

### Google APIs (googleapis library)

- Used by: CalendarService
- Scope: Calendar events, availability slots, recurrence patterns

### Supabase

- Used by: All services
- Features: PostgreSQL database, RLS policies, real-time subscriptions, auth

### SvelteKit

- Used by: API route handlers
- Features: Request locals for auth context, type-safe types

---

## Code Patterns Identified

### Pattern 1: Service Constructor Dependency Injection

```typescript
constructor(supabase: SupabaseClient<Database>) {
  this.supabase = supabase;
  this.innerService = new InnerService(supabase);
}
```

Found in: ChatContextService, DraftService, AgentOrchestrator

### Pattern 2: Singleton Error Logger

```typescript
public static getInstance(supabase: SupabaseClient<Database>): ErrorLoggerService {
  if (!ErrorLoggerService.instance) {
    ErrorLoggerService.instance = new ErrorLoggerService(supabase);
  }
  return ErrorLoggerService.instance;
}
```

Found in: ErrorLoggerService

### Pattern 3: Async Generators for Streaming

```typescript
async *streamText(options): AsyncGenerator<{ type, content? }>
```

Found in: SmartLLMService, AgentOrchestrator

### Pattern 4: Progressive Disclosure Pattern

```typescript
// Abbreviated initially
const abbreviated = await getAbbreviatedProject(projectId);
// Full details on demand
const full = await getFullProjectContext(projectId);
```

Found in: ChatContextService

### Pattern 5: Status Tracking

```typescript
await statusService.updateStatus(entityId, 'processing', { stage: 'extraction' });
```

Found in: BrainDumpProcessor, OperationsExecutor

---

## Duplication Findings

### System Prompts

- **Agent:** Hardcoded AGENT_SYSTEM_PROMPTS object (7 modes, ~140 lines)
- **Brain Dump:** Uses PromptTemplateService
- **Issue:** No A/B testing, inconsistent maintenance

### Context Loading

- **Agent:** ChatContextService with abbreviated context
- **Brain Dump:** Direct full project context loading
- **Issue:** Inconsistent token efficiency

### Operation Generation

- **Agent:** generateProjectOperations() method
- **Brain Dump:** Direct ParsedOperation creation
- **Issue:** ~200 lines of similar code

### Error Handling

- **Agent:** Uses ErrorLoggerService consistently
- **Brain Dump:** Partial error logging
- **Issue:** Incomplete visibility into failures

---

## Recommendations Summary

### HIGH PRIORITY

1. Extract Agent system prompts to PromptTemplateService
2. Brain Dump should use ChatContextService.loadLocationContext()
3. Brain Dump should use ErrorLoggerService consistently

### MEDIUM PRIORITY

4. Create unified OperationBuilder service
5. Create QuestionGenerationService

### LOW PRIORITY

6. Add observability hooks
7. Create cost tracking dashboard

---

## File Statistics

- **Core Service Files:** 5 (SmartLLMService, AgentOrchestrator, ChatContextService, DraftService, OperationsExecutor)
- **Supporting Service Files:** 3+ (BrainDumpProcessor, CalendarService, ErrorLoggerService)
- **Type Definition Files:** 1 (agent.types.ts)
- **API Route Files:** 3+ (agent/stream, chat/stream, braindumps/stream)
- **Total Lines Analyzed:** ~5,000+

---

## Research Artifacts

Generated research documents:

1. `2025-10-28_service-layer-architecture-research.md` - Full 27KB detailed analysis
2. `2025-10-28_service-layer-summary.md` - Quick reference guide
3. `2025-10-28_service-layer-files-analyzed.md` - This document

All available in `/thoughts/shared/research/`
