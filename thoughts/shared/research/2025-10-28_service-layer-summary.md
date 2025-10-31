# Service Layer Architecture Summary

**Date:** 2025-10-28  
**Status:** Complete Research  
**Scope:** Chat & Agent Systems Integration Analysis

---

## Quick Reference

### Core Services (Most Important)

| Service                | File                          | Lines  | Purpose                                        |
| ---------------------- | ----------------------------- | ------ | ---------------------------------------------- |
| **SmartLLMService**    | smart-llm-service.ts          | 1-1786 | OpenRouter API with model routing & streaming  |
| **ChatContextService** | chat-context-service.ts       | 1-963  | Token-efficient context management (10k limit) |
| **AgentOrchestrator**  | agent-orchestrator.service.ts | 1-1146 | Conversational flow for 7 agent chat types     |
| **OperationsExecutor** | operations-executor.ts        | 1-150+ | Atomic database transaction manager            |
| **DraftService**       | draft.service.ts              | 1-381  | One-draft-per-session project builder          |

### Key Methods by Use Case

**For Streaming Chat Responses:**

- `SmartLLMService.streamText()` - Lines 1503-1772
- Returns async generator of chunks
- Used by both agent and chat systems

**For Structured JSON Output:**

- `SmartLLMService.getJSONResponse<T>()` - Lines 549-813
- Includes retry logic for parse errors
- Per-operation cost tracking

**For Token-Efficient Context:**

- `ChatContextService.buildInitialContext()` - Lines 62-143
- Abbreviated by default (saves 70% tokens)
- Assembles within 10k token budget

**For Database Transactions:**

- `OperationsExecutor.executeOperations()` - Lines 47-150+
- Atomic: all-or-nothing with rollback
- Logs activity and tracks status

### Token Budget Breakdown

```
Hard Limit: 10,000 tokens

Initial Context:  2,300 tokens
├─ System prompt:        500
├─ User profile:         300
├─ Location (abbreviated): 1,000
└─ Related data:         500

Conversation: 4,000 tokens
Response Buffer: 2,000 tokens
Tool Results: 1,700 tokens
```

Cost: ~$0.0018 per 5-turn conversation (DeepSeek pricing)

---

## Service Integration Patterns

### Pattern 1: Dependency Injection

All services receive Supabase client in constructor:

```typescript
new SmartLLMService({ supabase, httpReferer, appName });
new ChatContextService(supabase);
new OperationsExecutor(supabase);
```

### Pattern 2: Streaming for UX

SSE endpoints use async generators:

```typescript
for await (const chunk of llmService.streamText({ ... })) {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`))
}
```

### Pattern 3: Profile-Based Model Selection

Auto-selects model based on context:

```typescript
SmartLLMService.selectProfile({
	taskCount: 5,
	complexity: 'moderate',
	priority: 'quality'
}); // Returns { json: 'balanced', text: 'quality' }
```

### Pattern 4: Progressive Disclosure

Load abbreviated context initially, drill down on demand:

```typescript
const abbreviated = await contextService.getAbbreviatedProject(projectId);
// Shows: name, status, 5 top tasks, 500 char context preview
// If user asks for details: load full project context via tool
```

---

## Duplication & Integration Opportunities

### HIGH PRIORITY Issues

1. **System Prompts** - Agent has 7 hardcoded prompts (lines 38-176), Brain Dump uses PromptTemplateService
    - **Impact:** Inconsistent quality, hard to A/B test
    - **Fix:** Migrate to PromptTemplateService

2. **Context Loading** - Brain Dump loads full context, Agent uses abbreviated
    - **Impact:** Brain Dump wastes tokens on large projects
    - **Fix:** Brain Dump should use ChatContextService.loadLocationContext()

3. **Error Logging** - Brain Dump has partial logging, Agent uses ErrorLoggerService
    - **Impact:** Incomplete error visibility
    - **Fix:** Brain Dump should consistently use ErrorLoggerService

### MEDIUM PRIORITY Issues

4. **Operation Generation** - Brain Dump and Agent both generate ParsedOperation[]
    - **Code Duplication:** ~200 lines
    - **Fix:** Create unified OperationBuilder service

5. **Question Generation** - Different logic for questions in both systems
    - **Impact:** Maintenance burden, inconsistent user experience
    - **Fix:** Create QuestionGenerationService

---

## File Navigation

### Most Important Files (Read These First)

1. **SmartLLMService** - `/apps/web/src/lib/services/smart-llm-service.ts`
    - Model configurations: 106-408
    - getJSONResponse: 549-813
    - streamText: 1503-1772

2. **AgentOrchestrator** - `/apps/web/src/lib/services/agent-orchestrator.service.ts`
    - System prompts: 38-176
    - processMessage: 200-234
    - Service composition: 187-195

3. **ChatContextService** - `/apps/web/src/lib/services/chat-context-service.ts`
    - Token budgets: 29-44
    - buildInitialContext: 62-143
    - getAbbreviatedProject: 548-588

4. **Agent Types** - `/packages/shared-types/src/agent.types.ts`
    - DIMENSION_QUESTIONS: 220-266
    - AGENT_LLM_PROFILES: 312-347
    - DEFAULT_AGENT_CONFIG: 286-306

### API Entry Points

- **Agent:** `/api/agent/stream` - `/apps/web/src/routes/api/agent/stream/+server.ts`
- **Chat:** `/api/chat/stream` - `/apps/web/src/routes/api/chat/stream/+server.ts`
- **Brain Dump:** `/api/braindumps/stream` - `/apps/web/src/routes/api/braindumps/stream/+server.ts`

---

## Quick Implementation Guide

### To Add a New Chat Mode

1. Add to AgentChatType in agent.types.ts
2. Add system prompt to AGENT_SYSTEM_PROMPTS in AgentOrchestrator
3. Add handler method: handleNewMode()
4. Add case to processMessage() switch statement
5. Update test coverage

**Estimated Time:** 2-3 hours per mode

### To Optimize Token Usage

1. Use ChatContextService.buildInitialContext() instead of manual loads
2. Set profile appropriately: fast/balanced/quality/creative
3. Monitor llm_usage_logs table for metrics
4. Adjust token budget allocation as needed

**Expected Savings:** 15-20% per operation

### To Debug LLM Issues

1. Check llm_usage_logs for actual model used (OpenRouter fallback routing)
2. Verify SmartLLMService is initialized with supabase
3. Check ErrorLoggerService singleton is working
4. Review request/response in browser DevTools Network tab
5. Search error_logs table for classification details

---

## Key Metrics to Monitor

| Metric             | Location                        | Value   | Target    |
| ------------------ | ------------------------------- | ------- | --------- |
| Avg tokens/session | llm_usage_logs                  | 8,600   | < 10,000  |
| Cost/session       | llm_usage_logs.total_cost_usd   | $0.0018 | < $0.003  |
| Cache hit rate     | llm_usage_logs                  | varies  | > 20%     |
| Error rate         | error_logs                      | < 1%    | < 0.1%    |
| Avg response time  | llm_usage_logs.response_time_ms | 1,200ms | < 2,000ms |

---

## Critical Dependencies

- **OpenRouter API:** All LLM calls routed through OpenRouter with fallback support
- **Supabase:** All data persistence and RLS
- **Google Calendar API:** For task scheduling (optional)
- **SvelteKit:** Request locals provide authenticated Supabase instance

---

## Next Steps

See the full research document for:

- Detailed service dependency graph
- Complete data flow examples
- Token management strategies
- Cost optimization recommendations
- 4-phase implementation roadmap

File: `2025-10-28_service-layer-architecture-research.md`
