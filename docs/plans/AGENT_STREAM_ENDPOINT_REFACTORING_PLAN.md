# Agent Stream Endpoint Refactoring Plan

## Overview

This document outlines a comprehensive refactoring plan for the `/api/agent/stream` endpoint to improve code quality, maintainability, and testability by applying clean code principles.

**Target File:** `apps/web/src/routes/api/agent/stream/+server.ts`
**Current Size:** ~1,340 lines
**Target Size:** ~150-200 lines (main endpoint file)

---

## Current State Analysis

### Code Metrics

| Metric | Current Value | Target | Issue |
|--------|--------------|--------|-------|
| File size | ~1,340 lines | ~150-200 | Too large for single file |
| POST handler | ~700 lines | ~50-80 | Violates SRP |
| Nesting depth | Up to 6 levels | Max 3 | Hard to reason about |
| Helper functions | 15+ scattered | Organized modules | Poor organization |
| Type definitions | Inline | Separate file | Mixed concerns |

### Identified Issues

#### 1. Single Responsibility Principle (SRP) Violations

The POST handler does too many things:
- Authentication & authorization
- Rate limiting
- Session management (fetch/create)
- Project focus resolution
- Ontology context loading & caching
- User message persistence
- SSE stream creation
- Context usage tracking
- Event handling & mapping
- Tool call/result tracking
- Assistant response persistence
- Metadata persistence

#### 2. Function Size

| Function | Lines | Concern |
|----------|-------|---------|
| `POST` handler | ~700 | Way too large |
| `sendEvent` callback | ~140 | Too many responsibilities |
| `mapPlannerEventToSSE` | ~85 | Acceptable but could be data-driven |
| `loadOntologyContext` | ~50 | Multiple decision branches |

#### 3. Code Duplication

- `normalizeContextType` exists here AND in orchestrator
- Context shift handling logic duplicated between endpoint and orchestrator
- Entity assignment patterns repeated in multiple places
- Focus normalization duplicated

#### 4. Deep Nesting

```typescript
// Current pattern - up to 6 levels deep
if (session_id) {
  if (providedHistory.length === 0) {
    // nested logic
  }
}
// ...
if (focusProvided) {
  if (storedSerialized !== incomingSerialized) {
    // more nested logic
  }
}
```

#### 5. Mixed Abstraction Levels

The POST handler mixes:
- High-level orchestration logic
- Low-level database operations
- SSE protocol details
- Token counting algorithms

#### 6. Poor Separation of Concerns

```
Current Structure:
+server.ts
├── Types (inline)
├── Constants
├── Rate limiter (in-memory Map)
├── Helper functions (scattered)
├── POST handler (massive)
├── GET handler
└── More helper functions
```

---

## Clean Code Principles Applied

### Principles from Research

| Principle | Application |
|-----------|-------------|
| **SRP** | Each module/function has one reason to change |
| **OCP** | Event handling extensible without modifying core |
| **DRY** | Shared utilities extracted to reusable modules |
| **KISS** | Simple, focused functions with clear purposes |
| **ISP** | Narrow interfaces for each service |
| **DIP** | Depend on abstractions, not concrete implementations |

### Naming Conventions

- **Functions:** Verb + noun (e.g., `loadOntologyContext`, `persistChatMessage`)
- **Services:** Noun + "Service" suffix
- **Types:** PascalCase, descriptive
- **Constants:** SCREAMING_SNAKE_CASE

---

## Proposed Architecture

### New Directory Structure

```
apps/web/src/routes/api/agent/stream/
├── +server.ts              # Thin orchestrator (~150-200 lines)
├── services/
│   ├── index.ts            # Re-exports
│   ├── session-manager.ts  # Session CRUD operations
│   ├── ontology-loader.ts  # Ontology context management
│   ├── message-persister.ts # Chat message persistence
│   └── stream-handler.ts   # SSE stream management
├── utils/
│   ├── index.ts            # Re-exports
│   ├── context-utils.ts    # Context normalization helpers
│   ├── rate-limiter.ts     # Rate limiting logic
│   └── event-mapper.ts     # Event type mapping
├── types.ts                # Local type definitions
└── constants.ts            # Configuration constants
```

### Module Responsibilities

#### 1. `+server.ts` (Main Endpoint)

**Responsibility:** High-level request orchestration only

```typescript
// Pseudocode structure
export const POST: RequestHandler = async (event) => {
  // 1. Authenticate
  const user = await authenticateRequest(event);

  // 2. Validate & parse request
  const request = await parseAndValidateRequest(event.request);

  // 3. Resolve session
  const session = await sessionManager.resolveSession(request, user.id);

  // 4. Load context
  const context = await ontologyLoader.loadContext(request, session);

  // 5. Stream response
  return streamHandler.createStream({
    request, session, context, user
  });
};
```

#### 2. `services/session-manager.ts`

**Responsibility:** Chat session lifecycle management

```typescript
interface SessionManager {
  resolveSession(request: StreamRequest, userId: string): Promise<ChatSession>;
  updateSessionMetadata(sessionId: string, metadata: AgentSessionMetadata): Promise<void>;
  persistProjectFocus(sessionId: string, focus: ProjectFocus | null): Promise<void>;
}
```

**Functions:**
- `fetchChatSession()` - Load existing session
- `createChatSession()` - Create new session
- `resolveSession()` - Orchestrate fetch or create
- `updateSessionMetadata()` - Persist metadata changes

#### 3. `services/ontology-loader.ts`

**Responsibility:** Ontology context loading with caching

```typescript
interface OntologyLoaderService {
  loadContext(
    request: StreamRequest,
    session: ChatSession,
    actorId: string
  ): Promise<OntologyContext | null>;

  getCacheKey(focus: ProjectFocus | null, contextType: ChatContextType): string;
  isCacheValid(cache: OntologyCache | undefined, key: string): boolean;
}
```

**Functions:**
- `loadContext()` - Main entry point with caching
- `loadFreshContext()` - Direct loader without cache
- `generateCacheKey()` - Consistent cache key generation
- `validateCache()` - Cache validity checking

#### 4. `services/message-persister.ts`

**Responsibility:** Chat message persistence

```typescript
interface MessagePersister {
  persistUserMessage(params: UserMessageParams): Promise<void>;
  persistAssistantMessage(params: AssistantMessageParams): Promise<void>;
  persistToolResults(params: ToolResultsParams): Promise<void>;
  persistContextShiftMessage(params: ContextShiftParams): Promise<void>;
}
```

#### 5. `services/stream-handler.ts`

**Responsibility:** SSE stream lifecycle and event handling

```typescript
interface StreamHandler {
  createStream(params: StreamParams): Response;
  handleStreamEvents(generator: AsyncGenerator, callbacks: StreamCallbacks): Promise<void>;
}
```

**Encapsulates:**
- Stream creation
- Event callback registration
- Completion handling
- Error handling
- Cleanup/finalization

#### 6. `utils/context-utils.ts`

**Responsibility:** Context normalization and transformation

```typescript
// Pure functions - no side effects
export function normalizeContextType(type?: string): ChatContextType;
export function normalizeProjectFocus(focus?: ProjectFocus | null): ProjectFocus | null;
export function generateLastTurnContext(messages: ChatMessage[], contextType: ChatContextType): LastTurnContext | null;
export function buildContextShiftLastTurnContext(shift: ContextShift, defaultType: ChatContextType): LastTurnContext;
export function assignEntityByPrefix(entities: EntityMap, entityId: string): void;
```

#### 7. `utils/rate-limiter.ts`

**Responsibility:** Request rate limiting

```typescript
interface RateLimiter {
  checkLimit(userId: string): RateLimitResult;
  recordUsage(userId: string, tokens: number): void;
  isEnabled(): boolean;
}

// Encapsulates the in-memory Map and rate limit logic
```

#### 8. `utils/event-mapper.ts`

**Responsibility:** Event type transformation

```typescript
// Data-driven mapping instead of giant switch statement
const EVENT_MAPPERS: Record<string, (event: StreamEvent) => AgentSSEMessage | null> = {
  session: (e) => ({ type: 'session', session: e.session }),
  text: (e) => ({ type: 'text', content: e.content }),
  // ... other mappers
};

export function mapPlannerEventToSSE(event: StreamEvent): AgentSSEMessage | null {
  const mapper = EVENT_MAPPERS[event.type];
  return mapper ? mapper(event) : null;
}
```

#### 9. `types.ts`

**Responsibility:** Local type definitions

```typescript
// Move these from inline definitions
export type OntologyCache = {
  context: OntologyContext;
  loadedAt: number;
  cacheKey: string;
};

export type ProjectClarificationMetadata = {
  roundNumber: number;
  accumulatedContext: string;
  previousQuestions: string[];
  previousResponses: string[];
};

export type AgentSessionMetadata = {
  focus?: ProjectFocus | null;
  ontologyCache?: OntologyCache;
  projectClarification?: ProjectClarificationMetadata;
  [key: string]: unknown;
};

// ... other local types
```

#### 10. `constants.ts`

**Responsibility:** Configuration values

```typescript
export const RATE_LIMIT_ENABLED = false;
export const RATE_LIMIT = {
  MAX_REQUESTS_PER_MINUTE: 20,
  MAX_TOKENS_PER_MINUTE: 30000
};

export const RECENT_MESSAGE_LIMIT = 50;
export const CONTEXT_USAGE_TOKEN_BUDGET = 2500;
export const ONTOLOGY_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
```

---

## Implementation Steps

### Phase 1: Extract Types and Constants

**Files to create:**
- `types.ts`
- `constants.ts`

**Effort:** Low
**Risk:** Low
**Tests:** None needed (pure refactor)

### Phase 2: Extract Pure Utility Functions

**Files to create:**
- `utils/context-utils.ts`
- `utils/rate-limiter.ts`
- `utils/event-mapper.ts`
- `utils/index.ts`

**Effort:** Medium
**Risk:** Low
**Tests:** Unit tests for each utility function

### Phase 3: Extract Service Modules

**Files to create:**
- `services/session-manager.ts`
- `services/ontology-loader.ts`
- `services/message-persister.ts`
- `services/index.ts`

**Effort:** Medium-High
**Risk:** Medium (database operations)
**Tests:** Integration tests with mocked Supabase

### Phase 4: Extract Stream Handler

**Files to create:**
- `services/stream-handler.ts`

**Effort:** High
**Risk:** Medium (SSE complexity)
**Tests:** Integration tests for stream behavior

### Phase 5: Refactor Main Endpoint

**Modify:**
- `+server.ts` - Reduce to thin orchestrator

**Effort:** Medium
**Risk:** Medium (integration point)
**Tests:** E2E tests for full flow

### Phase 6: Cleanup and Polish

- Remove dead code
- Add JSDoc comments to public APIs
- Update imports in consuming code
- Review error handling consistency

---

## Code Examples

### Before: Current POST Handler Pattern

```typescript
// ~700 lines with mixed concerns
export const POST: RequestHandler = async ({ request, fetch, locals }) => {
  // Auth check
  const { user } = await safeGetSession();
  if (!user?.id) return ApiResponse.unauthorized();

  // Actor resolution
  const { data: actorId } = await supabase.rpc('ensure_actor_for_user', ...);

  // Rate limiting (50+ lines)
  if (RATE_LIMIT_ENABLED) {
    // ... complex rate limit logic
  }

  try {
    const body = await request.json();
    // ... 600+ more lines of mixed logic
  } catch (err) {
    // ...
  }
};
```

### After: Refactored POST Handler

```typescript
// ~100-150 lines, clear orchestration
export const POST: RequestHandler = async ({ request, fetch, locals }) => {
  const { supabase, safeGetSession } = locals;

  // 1. Authenticate
  const authResult = await authenticateUser(safeGetSession);
  if (!authResult.success) return authResult.response;
  const { userId, actorId } = authResult;

  // 2. Check rate limit
  const rateLimitResult = rateLimiter.checkLimit(userId);
  if (!rateLimitResult.allowed) {
    return ApiResponse.error(rateLimitResult.message, 429, 'RATE_LIMITED');
  }

  // 3. Parse and validate request
  const parseResult = await parseRequest(request);
  if (!parseResult.success) return parseResult.response;
  const streamRequest = parseResult.data;

  // 4. Resolve session
  const sessionResult = await sessionManager.resolveSession(
    supabase, streamRequest, userId
  );
  if (!sessionResult.success) return sessionResult.response;
  const { session, metadata } = sessionResult;

  // 5. Persist user message
  await messagePersister.persistUserMessage({
    supabase, sessionId: session.id, userId,
    content: streamRequest.message
  });

  // 6. Load ontology context
  const ontologyResult = await ontologyLoader.loadContext({
    supabase, request: streamRequest, session, metadata, actorId
  });
  if (!ontologyResult.success) return ontologyResult.response;

  // 7. Create and return stream
  return streamHandler.createAgentStream({
    supabase, fetch, request: streamRequest,
    session, ontologyContext: ontologyResult.context,
    metadata, userId, actorId
  });
};
```

### Before: Giant sendEvent Callback

```typescript
const sendEvent = async (event: StreamEvent | AgentSSEMessage | null | undefined) => {
  if (!event) return;

  if ((event as StreamEvent).type === 'text' && (event as any).content) {
    assistantResponse += (event as any).content;
  }

  if ((event as StreamEvent).type === 'tool_call' && (event as any).toolCall) {
    toolCalls.push((event as any).toolCall);
  }

  // ... 100+ more lines of nested conditionals
};
```

### After: Event Handler Pattern

```typescript
// In stream-handler.ts
class AgentStreamHandler {
  private eventHandlers: EventHandlerMap = {
    text: this.handleTextEvent.bind(this),
    tool_call: this.handleToolCallEvent.bind(this),
    tool_result: this.handleToolResultEvent.bind(this),
    clarifying_questions: this.handleClarifyingQuestionsEvent.bind(this),
    done: this.handleDoneEvent.bind(this)
  };

  async handleEvent(event: StreamEvent): Promise<void> {
    if (!event) return;

    const handler = this.eventHandlers[event.type];
    if (handler) {
      await handler(event);
    }

    const sseMessage = mapPlannerEventToSSE(event);
    if (sseMessage) {
      await this.stream.sendMessage(sseMessage);
    }
  }

  private handleTextEvent(event: TextEvent): void {
    this.state.assistantResponse += event.content;
  }

  private handleToolCallEvent(event: ToolCallEvent): void {
    this.state.toolCalls.push(event.toolCall);
  }

  // ... other handlers as small, focused methods
}
```

### Before: Giant Switch Statement

```typescript
function mapPlannerEventToSSE(event: StreamEvent): AgentSSEMessage | null {
  switch (event.type) {
    case 'session':
      return { type: 'session', session: (event as any).session };
    case 'ontology_loaded':
      return { type: 'ontology_loaded', summary: (event as any).summary };
    // ... 25+ more cases
    default:
      return null;
  }
}
```

### After: Data-Driven Mapping

```typescript
// In event-mapper.ts
const EVENT_MAPPERS: Record<string, EventMapper> = {
  session: (e) => ({ type: 'session', session: e.session }),
  ontology_loaded: (e) => ({ type: 'ontology_loaded', summary: e.summary }),
  last_turn_context: (e) => ({ type: 'last_turn_context', context: e.context }),
  agent_state: (e) => ({
    type: 'agent_state',
    state: e.state,
    contextType: normalizeContextType(e.contextType),
    details: e.details
  }),
  // ... easily extensible
};

export function mapPlannerEventToSSE(event: StreamEvent | null): AgentSSEMessage | null {
  if (!event) return null;
  const mapper = EVENT_MAPPERS[event.type];
  return mapper ? mapper(event) : null;
}
```

---

## Testing Strategy

### Unit Tests

| Module | Test Focus |
|--------|------------|
| `context-utils.ts` | Pure function transformations |
| `rate-limiter.ts` | Rate limiting logic, edge cases |
| `event-mapper.ts` | All event type mappings |
| `session-manager.ts` | Session resolution logic (mocked DB) |
| `ontology-loader.ts` | Caching logic, loader selection |
| `message-persister.ts` | Message formatting (mocked DB) |

### Integration Tests

| Test Scope | Coverage |
|------------|----------|
| Stream handler | Full stream lifecycle |
| Session + Ontology | Context loading with session |
| Full endpoint | POST/GET with mocked dependencies |

### E2E Tests

- Full conversation flow with real agent
- Context switching scenarios
- Project creation with clarifying questions

---

## Migration Checklist

- [ ] Create types.ts and move type definitions
- [ ] Create constants.ts and move constants
- [ ] Create utils/context-utils.ts with pure functions
- [ ] Create utils/rate-limiter.ts
- [ ] Create utils/event-mapper.ts with data-driven mapper
- [ ] Create services/session-manager.ts
- [ ] Create services/ontology-loader.ts
- [ ] Create services/message-persister.ts
- [ ] Create services/stream-handler.ts
- [ ] Refactor +server.ts to use new modules
- [ ] Add unit tests for utilities
- [ ] Add integration tests for services
- [ ] Verify existing E2E tests pass
- [ ] Remove dead code from original file
- [ ] Update any imports in other files
- [ ] Code review and cleanup

---

## Benefits

### Maintainability
- Each module has a single responsibility
- Changes are isolated to specific modules
- Easier to understand and modify

### Testability
- Pure functions can be unit tested in isolation
- Services can be mocked for integration tests
- Clear boundaries for test coverage

### Readability
- Main endpoint is a clear orchestration flow
- Function names describe their purpose
- Consistent patterns across modules

### Extensibility
- New event types easily added to mapper
- New context loaders can be added without touching main file
- Service interfaces allow alternative implementations

### Performance
- Caching logic isolated and optimizable
- Stream handling can be optimized independently
- No impact on existing functionality

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Breaking existing functionality | Incremental refactoring with tests at each step |
| SSE stream issues | Comprehensive integration tests for stream behavior |
| Database operation changes | Keep DB operations identical, just reorganize |
| Import path changes | Use index.ts re-exports for clean imports |

---

## Estimated Effort

| Phase | Effort | Time Estimate |
|-------|--------|---------------|
| Phase 1: Types/Constants | Low | 1-2 hours |
| Phase 2: Utilities | Medium | 3-4 hours |
| Phase 3: Services | Medium-High | 4-6 hours |
| Phase 4: Stream Handler | High | 4-6 hours |
| Phase 5: Main Endpoint | Medium | 2-3 hours |
| Phase 6: Cleanup/Tests | Medium | 3-4 hours |
| **Total** | | **17-25 hours** |

---

## Success Criteria

1. Main endpoint file is under 200 lines
2. All existing tests pass
3. No regression in functionality
4. New unit tests for extracted modules
5. Code coverage maintained or improved
6. Clear separation of concerns
7. Consistent naming and patterns

---

## References

- [Clean Code Principles](https://blog.codacy.com/clean-code-principles)
- [Single Responsibility Principle](https://en.wikipedia.org/wiki/Single-responsibility_principle)
- Existing pattern: `apps/web/src/lib/services/agentic-chat/orchestration/agent-chat-orchestrator.ts`
- BuildOS Design System: `apps/web/docs/technical/components/INKPRINT_DESIGN_SYSTEM.md`
