# LLM Usage Tracking System

## Overview

The LLM Usage Tracking system provides comprehensive monitoring of all AI/LLM API calls made through the SmartLLMService. It tracks costs, performance, and usage patterns per user, operation type, and model.

## Database Schema

### Tables

#### `llm_usage_logs`

Main table storing detailed logs of every LLM request.

**Key Fields:**

- `user_id` - User who made the request
- `operation_type` - Type of operation (brain_dump, daily_brief, etc.)
- `model_requested` - Model initially requested
- `model_used` - Actual model used (may differ due to OpenRouter routing)
- `prompt_tokens`, `completion_tokens`, `total_tokens` - Token usage
- `input_cost_usd`, `output_cost_usd`, `total_cost_usd` - Cost breakdown
- `response_time_ms` - Response time in milliseconds
- `status` - Success, failure, timeout, rate_limited, or invalid_response
- Related entity IDs: `project_id`, `brain_dump_id`, `task_id`, `brief_id`

#### `llm_usage_summary`

Aggregated daily/monthly summaries for faster queries.

**Key Fields:**

- `summary_date` - Date of the summary
- `summary_type` - 'daily' or 'monthly'
- Aggregated metrics: total requests, tokens, costs
- `models_used` - JSONB breakdown by model
- `operations_breakdown` - JSONB breakdown by operation

### Enums

- `llm_operation_type` - brain_dump, daily_brief, phase_generation, etc.
- `llm_request_status` - success, failure, timeout, rate_limited, invalid_response

## SmartLLMService Integration

### Automatic Logging

All calls to `getJSONResponse()` and `generateText()` automatically log usage to the database when a Supabase client is configured.

### Adding Context to Requests

To properly attribute usage, include optional context fields:

```typescript
const llmService = new SmartLLMService({
	supabase: supabaseClient,
	httpReferer: 'https://buildos.ai',
	appName: 'BuildOS'
});

const result = await llmService.getJSONResponse({
	systemPrompt: '...',
	userPrompt: '...',
	userId: user.id,
	profile: 'balanced',

	// Optional context for tracking
	operationType: 'brain_dump',
	projectId: project.id,
	brainDumpId: brainDump.id
});
```

### Operation Types

Use these standard operation types for consistency:

- `brain_dump` - Full brain dump processing
- `brain_dump_short` - Short brain dump
- `brain_dump_context` - Context extraction phase
- `brain_dump_tasks` - Task extraction phase
- `daily_brief` - Daily brief generation
- `project_brief` - Project brief generation
- `phase_generation` - Phase generation
- `task_scheduling` - Task scheduling
- `calendar_analysis` - Calendar analysis
- `project_synthesis` - Project synthesis
- `email_generation` - Email generation
- `question_generation` - Question generation
- `output_generation` - AI-generated content for outputs (articles, chapters, blog posts, etc.)
- `embedding` - Embedding generation
- `other` - Default fallback

## LLMUsageService

Service class for querying usage data.

### Initialize

```typescript
import { LLMUsageService } from '$lib/services/llm-usage.service';

const usageService = new LLMUsageService(supabaseClient);
```

### Methods

#### Get User Usage Summary

```typescript
const summary = await usageService.getUserUsage(userId, startDate, endDate);

// Returns:
// {
//   totalRequests: number,
//   totalCost: number,
//   totalTokens: number,
//   avgResponseTime: number,
//   byOperation: { brain_dump: { requests, cost, tokens }, ... },
//   byModel: { 'gpt-4o-mini': { requests, cost, tokens }, ... }
// }
```

#### Get Daily Breakdown

```typescript
const daily = await usageService.getDailyUsage(userId, startDate, endDate);

// Returns array of:
// [
//   { date: '2025-09-30', totalRequests: 45, totalCost: 0.23, totalTokens: 12500, successRate: 98.5 },
//   ...
// ]
```

#### Get Model Breakdown

```typescript
const models = await usageService.getModelBreakdown(userId, startDate, endDate);

// Returns array sorted by cost:
// [
//   { model: 'gpt-4o-mini', requests: 30, cost: 0.15, tokens: 8000, avgResponseTime: 1200 },
//   { model: 'deepseek-chat', requests: 15, cost: 0.08, tokens: 4500, avgResponseTime: 950 },
//   ...
// ]
```

#### Get Current Month Usage

```typescript
const monthUsage = await usageService.getCurrentMonthUsage(userId);
```

#### Get Today's Usage

```typescript
const todayUsage = await usageService.getTodayUsage(userId);
```

#### Check Cost Threshold

```typescript
const exceeded = await usageService.checkCostThreshold(userId, 10.0); // $10 threshold
if (exceeded) {
	// Alert user or restrict usage
}
```

#### Get Project Usage

```typescript
const projectUsage = await usageService.getProjectUsage(projectId, startDate, endDate);

// Returns:
// {
//   logs: [...],
//   summary: { totalRequests, totalCost, totalTokens, avgResponseTime }
// }
```

## API Endpoint

### GET /api/llm-usage/summary

Returns usage summary for authenticated user.

**Query Parameters:**

- `period` - 'today' | 'month' | 'custom' (default: 'month')
- `startDate` - ISO date string (required if period=custom)
- `endDate` - ISO date string (required if period=custom)

**Example:**

```typescript
// Get current month usage
const response = await fetch('/api/llm-usage/summary?period=month');
const { data } = await response.json();

// Get custom date range
const response = await fetch(
	'/api/llm-usage/summary?period=custom&startDate=2025-09-01&endDate=2025-09-30'
);
```

**Response:**

```json
{
  "success": true,
  "data": {
    "period": {
      "type": "month",
      "startDate": "2025-09-01T00:00:00Z",
      "endDate": "2025-09-30T23:59:59Z"
    },
    "summary": {
      "totalRequests": 145,
      "totalCost": 2.45,
      "totalTokens": 125000,
      "avgResponseTime": 1250,
      "byOperation": { ... },
      "byModel": { ... }
    },
    "dailyUsage": [ ... ],
    "modelBreakdown": [ ... ],
    "operationBreakdown": [ ... ]
  }
}
```

## Database Functions

### `get_user_llm_usage()`

RPC function for efficient user usage queries.

```sql
SELECT * FROM get_user_llm_usage(
  p_user_id := 'uuid',
  p_start_date := '2025-09-01',
  p_end_date := '2025-09-30'
);
```

### `update_llm_usage_summary()`

Updates daily summary for a user and date.

```sql
SELECT update_llm_usage_summary(
  p_user_id := 'uuid',
  p_date := '2025-09-30'
);
```

**Note:** This is automatically triggered after each insert to `llm_usage_logs`.

## Admin Views

### `admin_llm_cost_analytics`

Daily cost analytics across all users.

```sql
SELECT * FROM admin_llm_cost_analytics
WHERE date >= CURRENT_DATE - INTERVAL '30 days'
ORDER BY total_cost DESC;
```

### `admin_user_llm_costs`

User cost rankings.

```sql
SELECT * FROM admin_user_llm_costs
ORDER BY total_cost DESC
LIMIT 50;
```

## Security (RLS)

All tables have Row Level Security enabled:

- **Users** can only see their own usage logs and summaries
- **Service role** can insert logs and manage summaries
- **Admins** can see all logs and summaries

## Usage Examples

### Track Brain Dump Processing

```typescript
// In braindump-processor.ts
const llmService = new SmartLLMService({ supabase });

// Context extraction
const context = await llmService.getJSONResponse({
	systemPrompt: contextSystemPrompt,
	userPrompt: brainDumpContent,
	userId: user.id,
	profile: 'balanced',
	operationType: 'brain_dump_context',
	projectId: project?.id,
	brainDumpId: brainDump.id
});

// Task extraction
const tasks = await llmService.getJSONResponse({
	systemPrompt: tasksSystemPrompt,
	userPrompt: brainDumpContent,
	userId: user.id,
	profile: 'fast',
	operationType: 'brain_dump_tasks',
	projectId: project.id,
	brainDumpId: brainDump.id
});
```

### Track Output Generation

```typescript
// In /api/onto/outputs/generate/+server.ts
const smartLLM = new SmartLLMService({
	supabase: locals.supabase,
	httpReferer: 'https://build-os.com',
	appName: 'BuildOS Output Generator'
});

const content = await smartLLM.generateText({
	prompt: generationPrompt,
	userId: user.id,
	profile: 'quality', // Uses high-quality models
	systemPrompt: 'You are a professional content writer...',
	temperature: 0.7,
	maxTokens: 4000,
	operationType: 'output_generation', // Tracked as output generation
	projectId: project_id // Attribution to project
});

// This will automatically log:
// - Model used (e.g., Claude 3.5 Sonnet, GPT-4o)
// - Token usage and costs
// - Response time
// - Project attribution
```

### Display Usage to User

```typescript
// In profile page or usage dashboard
const usageService = new LLMUsageService(supabase);

// Current month
const monthUsage = await usageService.getCurrentMonthUsage(user.id);
console.log(
	`This month: ${monthUsage.totalRequests} requests, $${monthUsage.totalCost.toFixed(2)}`
);

// Model breakdown
const models = await usageService.getModelBreakdown(
	user.id,
	new Date(2025, 8, 1), // Sept 1
	new Date(2025, 8, 30) // Sept 30
);
console.log('Top models:', models.slice(0, 3));

// Operation breakdown
const operations = await usageService.getOperationBreakdown(
	user.id,
	new Date(2025, 8, 1),
	new Date(2025, 8, 30)
);
console.log('Most expensive operations:', operations.slice(0, 3));
```

### Cost Monitoring

```typescript
// Check if user exceeded monthly budget
const monthlyBudget = 5.0; // $5
const exceeded = await usageService.checkCostThreshold(user.id, monthlyBudget);

if (exceeded) {
	// Show warning or restrict usage
	await notifyUser({
		title: 'Usage Limit Reached',
		message: `You've exceeded your monthly AI usage budget of $${monthlyBudget}`,
		type: 'warning'
	});
}
```

### Project Cost Attribution

```typescript
// See how much a specific project has cost
const projectUsage = await usageService.getProjectUsage(project.id);

console.log(`Project "${project.name}" usage:
  Requests: ${projectUsage.summary.totalRequests}
  Cost: $${projectUsage.summary.totalCost.toFixed(4)}
  Avg response: ${projectUsage.summary.avgResponseTime}ms
`);
```

## Migration

The migration file is located at:

```
apps/web/supabase/migrations/llm_usage_tracking.sql
```

To apply:

1. Go to Supabase Dashboard → SQL Editor
2. Copy and paste the entire migration file
3. Execute the SQL

This will create:

- 2 tables (`llm_usage_logs`, `llm_usage_summary`)
- 2 enums (`llm_operation_type`, `llm_request_status`)
- Multiple indexes for performance
- RLS policies for security
- Helper functions for queries
- Admin views for analytics
- Automatic triggers for summary updates

## Best Practices

1. **Always pass operationType** - This enables proper cost attribution
2. **Include entity IDs** - Pass projectId, brainDumpId, etc. for detailed tracking
3. **Monitor costs regularly** - Set up alerts for unusual usage
4. **Use summaries for dashboards** - Query `llm_usage_summary` instead of logs for better performance
5. **Archive old logs** - Consider archiving logs older than 6 months
6. **Review model performance** - Use the model breakdown to optimize model selection

## Performance Considerations

- **Logs table** can grow large - indexes are optimized for common queries
- **Summary table** is updated automatically via trigger - lightweight operation
- **Use date ranges** - Always filter by date when querying logs
- **Cache summaries** - Cache monthly summaries in your app for frequently accessed data

## Future Enhancements

Potential improvements:

- Real-time usage dashboard
- Budget alerts via email/SMS
- Cost forecasting based on usage trends
- Per-operation cost optimization recommendations
- Team usage aggregation
- Export usage reports (CSV, PDF)
- Integration with billing system
