# LLM Usage Tracking - Implementation Summary

## What Was Done

Implemented comprehensive LLM usage tracking to monitor costs, performance, and usage patterns across the BuildOS platform.

## Files Created/Modified

### 1. Database Migration

**File:** `apps/web/supabase/migrations/llm_usage_tracking.sql`

Creates:

- `llm_usage_logs` table - Detailed logs of every LLM request
- `llm_usage_summary` table - Aggregated daily/monthly summaries
- Helper functions for queries (`get_user_llm_usage`, `update_llm_usage_summary`)
- Admin views for analytics
- RLS policies for security
- Automatic triggers to update summaries

### 2. SmartLLMService Updates

**File:** `apps/web/src/lib/services/smart-llm-service.ts`

Modified:

- Added optional context fields to `JSONRequestOptions` and `TextGenerationOptions`:
    - `operationType`, `projectId`, `brainDumpId`, `taskId`, `briefId`
- Added `logUsageToDatabase()` method to log all requests
- Updated `getJSONResponse()` to log successful and failed requests
- Updated `generateText()` to log successful and failed requests

### 3. Usage Query Service

**File:** `apps/web/src/lib/services/llm-usage.service.ts`

Provides methods to:

- Get user usage summaries
- Get daily usage breakdowns
- Get model breakdowns
- Get operation breakdowns
- Get project-specific usage
- Check cost thresholds
- Query current month/today usage

### 4. API Endpoint

**File:** `apps/web/src/routes/api/llm-usage/summary/+server.ts`

Public API for users to view their usage:

- GET `/api/llm-usage/summary?period=today|month|custom`
- Returns comprehensive usage breakdown

### 5. Documentation

**File:** `apps/web/docs/technical/services/LLM_USAGE_TRACKING.md`

Complete documentation including:

- Schema overview
- Usage examples
- API reference
- Best practices
- Admin queries

## What Gets Tracked

### Per Request

- User ID and operation type
- Model requested vs model actually used
- Token usage (prompt, completion, total)
- Cost breakdown (input, output, total in USD)
- Response time in milliseconds
- Success/failure status with error messages
- Request parameters (temperature, max_tokens, profile)
- Related entity IDs (project, brain dump, task, brief)
- OpenRouter metadata (request ID, cache status, rate limits)

### Aggregated (Daily/Monthly)

- Total requests and success rate
- Total tokens and costs
- Performance metrics (avg/min/max response times)
- Breakdown by model
- Breakdown by operation type

## How to Use

### 1. Run the Migration

Go to Supabase Dashboard → SQL Editor and execute:

```sql
-- Copy entire contents of apps/web/supabase/migrations/llm_usage_tracking.sql
```

### 2. Update Existing Code

When calling SmartLLMService, add context:

```typescript
const llmService = new SmartLLMService({
	supabase,
	httpReferer: 'https://buildos.ai',
	appName: 'BuildOS'
});

const result = await llmService.getJSONResponse({
	systemPrompt: '...',
	userPrompt: '...',
	userId: user.id,
	profile: 'balanced',

	// Add these for tracking
	operationType: 'brain_dump',
	projectId: project.id,
	brainDumpId: brainDump.id
});
```

### 3. Query Usage Data

```typescript
import { LLMUsageService } from '$lib/services/llm-usage.service';

const usageService = new LLMUsageService(supabase);

// Get current month usage
const usage = await usageService.getCurrentMonthUsage(user.id);
console.log(`Cost this month: $${usage.totalCost.toFixed(2)}`);

// Check if over budget
const overBudget = await usageService.checkCostThreshold(user.id, 5.0);
```

### 4. API Access

```typescript
// From frontend
const response = await fetch('/api/llm-usage/summary?period=month');
const { data } = await response.json();

console.log('Total cost:', data.summary.totalCost);
console.log('Top models:', data.modelBreakdown);
```

## Operation Types to Use

When setting `operationType`, use these standard values:

- `brain_dump` - Full brain dump processing
- `brain_dump_short` - Short brain dump
- `brain_dump_context` - Context extraction
- `brain_dump_tasks` - Task extraction
- `daily_brief` - Daily brief generation
- `project_brief` - Project brief
- `phase_generation` - Phase generation
- `task_scheduling` - Task scheduling
- `calendar_analysis` - Calendar analysis
- `project_synthesis` - Project synthesis
- `email_generation` - Email generation
- `question_generation` - Question generation
- `other` - Default fallback

## Key Benefits

1. **Cost Attribution** - Know exactly what each user/project/operation costs
2. **Budget Controls** - Set and enforce usage limits
3. **Performance Monitoring** - Track response times by model
4. **Usage Analytics** - Understand usage patterns
5. **Model Optimization** - Compare model performance and costs
6. **Debugging** - Full audit trail of all LLM requests
7. **Billing** - Foundation for usage-based billing

## Next Steps

1. **Run the migration** in Supabase
2. **Update key services** to pass operationType:
    - `braindump-processor.ts`
    - `dailyBrief/generator.ts`
    - `phase-generation/strategies/*.ts`
    - `calendar-analysis.service.ts`
3. **Create usage dashboard** for users (optional)
4. **Set up cost alerts** (optional)
5. **Add to admin dashboard** for monitoring (optional)

## Admin Queries

```sql
-- Top users by cost
SELECT * FROM admin_user_llm_costs
ORDER BY total_cost DESC
LIMIT 20;

-- Daily cost trends
SELECT * FROM admin_llm_cost_analytics
WHERE date >= CURRENT_DATE - INTERVAL '30 days'
ORDER BY date DESC;

-- Today's usage
SELECT
  operation_type,
  COUNT(*) as requests,
  SUM(total_cost_usd) as cost,
  AVG(response_time_ms)::int as avg_ms
FROM llm_usage_logs
WHERE DATE(created_at) = CURRENT_DATE
GROUP BY operation_type
ORDER BY cost DESC;
```

## Important Notes

- Logging is **non-blocking** - failures won't break LLM requests
- Supabase client is **optional** - service works without it (just skips logging)
- Summary table is **auto-updated** via database trigger
- RLS ensures users can **only see their own data**
- All costs are in **USD** for consistency

## Testing

After migration, test with:

```typescript
// Make a test request
const llmService = new SmartLLMService({ supabase });
const result = await llmService.getJSONResponse({
	systemPrompt: 'You are a helpful assistant.',
	userPrompt: 'Say hello',
	userId: testUserId,
	operationType: 'other'
});

// Check it was logged
const logs = await usageService.getRecentLogs(testUserId, 1);
console.log('Latest log:', logs[0]);
```

## Questions?

See full documentation: `apps/web/docs/technical/services/LLM_USAGE_TRACKING.md`
