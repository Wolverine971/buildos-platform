# LLM Service Integration - Quick Reference Index

**Full Research Document**: `/thoughts/shared/research/2025-10-28_llm-service-integration-research.md` (1305 lines)

## Quick Lookup

### How to...

**Use SmartLLMService for JSON responses?**

- Section 4: JSON Response Handling & Validation
- Section 10.1: Practical example with brain dump
- Key: Use `llmService.getJSONResponse<T>(options)` with profile selection

**Use SmartLLMService for streaming chat?**

- Section 8.2: Streaming Method for Chat
- Section 11: Best Practices for Conversational Agent
- Key: Use `llmService.streamText(options)` async generator

**Select the right model for my task?**

- Section 2.3: Model Selection Algorithm
- Section 11.1: Model Selection Strategy for Conversational Agent
- Key: Use `SmartLLMService.selectProfile()` or specify profile

**Track costs and usage?**

- Section 7: Cost Tracking & Usage Logging
- Section 7.3: LLMUsageService
- Key: Query `new LLMUsageService(supabase).getUserUsage()`

**Handle errors and retries?**

- Section 6: Error Handling & Retry Patterns
- Section 11.3: Error Handling for Chat
- Key: Retry on parse errors, check for timeouts, log to database

**Generate optimized prompts?**

- Section 5: Prompt Template Management
- Section 5.2-5.4: Prompt Components and Optimization
- Key: Use `PromptTemplateService` with atomic components

---

## Key Concepts

### Model Profiles

**JSON (structured output)**:

- `fast`: Speed-optimized, free tier options
- `balanced`: Cost-effective, reliable
- `powerful`: High quality (Claude 3.5 Sonnet)
- `maximum`: Maximum accuracy (Claude 3 Opus)

**Text (generation/chat)**:

- `speed`: Ultra-fast responses (<1s)
- `balanced`: Versatile, good quality
- `quality`: High-quality output
- `creative`: Creative writing (Claude 3 Opus)

### Cost Optimization Tips

1. **Use 'speed' profile for chat** (~$0.0001-0.001 per response)
2. **Enable prompt caching** (90% cost reduction on cached tokens)
3. **Use 'balanced' for balanced tasks** (~$0.001-0.01)
4. **Monitor via LLMUsageService** (daily, monthly aggregations)
5. **Set cost thresholds** (`checkCostThreshold()`)

### Error Handling Priority

1. **Parse Errors**: Retry with more capable model (Claude 3.5 Sonnet)
2. **Timeouts**: Suggest simpler request or wait
3. **Rate Limits**: Graceful backoff
4. **API Errors**: Log and bubble up with context

---

## Architecture Overview

```
User Input
    ↓
SmartLLMService
    ↓
    ├─ Model Selection (complexity + profile)
    │
    ├─ OpenRouter API Call
    │   ├─ Request (with provider preferences)
    │   ├─ Fallback Routing (models array)
    │   └─ Response (with usage data)
    │
    ├─ Response Processing
    │   ├─ JSON cleaning/parsing
    │   ├─ Text generation
    │   └─ Streaming (SSE handling)
    │
    ├─ Error Handling
    │   ├─ Parse errors → retry with powerful model
    │   ├─ API errors → timeout handling
    │   └─ Integration errors → database logging
    │
    └─ Usage Tracking
        ├─ Cost calculation
        ├─ Performance metrics
        └─ Database logging
    ↓
Return Result + Usage Metadata
```

---

## File Locations

| File                                                           | Lines | Purpose             |
| -------------------------------------------------------------- | ----- | ------------------- |
| `/apps/web/src/lib/services/smart-llm-service.ts`              | 1786  | Main LLM service    |
| `/apps/worker/src/lib/services/smart-llm-service.ts`           | 960   | Worker version      |
| `/apps/web/src/lib/services/promptTemplate.service.ts`         | 2070  | Prompt management   |
| `/apps/web/src/lib/services/llm-usage.service.ts`              | 317   | Cost tracking       |
| `/apps/web/src/lib/services/prompts/core/prompt-components.ts` | Large | Reusable components |
| `/apps/web/src/lib/types/llm.ts`                               | 57    | Type definitions    |
| `/apps/web/src/lib/chat/LLM_TOOL_INSTRUCTIONS.md`              | 341   | Tool specifications |

---

## Quick Code Snippets

### Initialize Service

```typescript
const llmService = new SmartLLMService({
	supabase,
	appName: 'MyApp'
});
```

### JSON Request

```typescript
const result = await llmService.getJSONResponse<MyType>({
	systemPrompt: 'System instructions',
	userPrompt: 'User input',
	userId: user.id,
	profile: 'balanced',
	validation: { retryOnParseError: true, maxRetries: 2 },
	operationType: 'chat'
});
```

### Streaming Response

```typescript
const stream = llmService.streamText({
	messages: conversationHistory,
	userId: user.id,
	profile: 'speed',
	temperature: 0.8
});

for await (const chunk of stream) {
	if (chunk.type === 'text') {
		socket.emit('chunk', chunk.content);
	}
}
```

### Track Usage

```typescript
const usage = await new LLMUsageService(supabase).getUserUsage(userId, startDate, endDate);
console.log(`Cost: $${usage.totalCost}, Requests: ${usage.totalRequests}`);
```

---

## Database Tables

- `llm_usage_logs`: Detailed per-request logging (30+ fields)
- `llm_usage_summary`: Daily/monthly aggregations
- Tracked fields: tokens, costs, latency, errors, model, operation type

---

## Important Numbers

- **Timeout**: 120 seconds (API), 30 seconds (recommended for chat)
- **Temperature**: 0.2 (JSON), 0.7 (text), 0.8 (chat)
- **Max tokens**: 8192 (JSON), 4096 (text), 2000 (chat)
- **Retry attempts**: Max 2
- **Cache reduction**: 90% for cached tokens
- **Cost range**: Free to $75M input tokens (Claude 3 Opus)

---

## Best Practices for Conversational Agent

1. **Profile**: Use 'speed' for fast responses
2. **Streaming**: Always use `streamText()` for real-time UX
3. **Temperature**: 0.8 (conversational warmth)
4. **Max tokens**: 2000 (reasonable conversation limits)
5. **Timeout**: 30 seconds max for user-facing requests
6. **Error messages**: Inform user of issues, suggest retry
7. **Cost monitoring**: Track per-session or per-user budgets
8. **Tools**: Use provided tool call accumulation pattern

---

## See Also

- `/docs/DEPLOYMENT_TOPOLOGY.md` - System architecture
- `/apps/web/CLAUDE.md` - Web app development guide
- `/apps/worker/CLAUDE.md` - Worker service guide
- `/docs/prompts/` - Prompt templates and architecture
