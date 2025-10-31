# Admin UI Specification - AI Chat Monitoring & Analytics

**Created:** 2025-10-29
**Purpose:** Comprehensive admin interface for monitoring, auditing, and analyzing AI chat system
**Target Users:** System administrators, product managers, QA team

---

## 📊 Overview

The admin UI provides complete visibility into both **user-facing chats** and the **multi-agent system**, including real-time monitoring, historical analysis, cost tracking, and quality auditing.

---

## 🗂️ Data Models & Tables

### User-Facing Chat System

| Table                  | Purpose              | Key Metrics                                  |
| ---------------------- | -------------------- | -------------------------------------------- |
| `chat_sessions`        | User chat sessions   | session_count, avg_duration, total_tokens    |
| `chat_messages`        | User↔Agent messages | message_count, avg_length, role_distribution |
| `chat_tool_executions` | Tool usage           | tool_calls, success_rate, avg_duration       |
| `chat_compressions`    | History compression  | compression_rate, tokens_saved, frequency    |
| `chat_context_cache`   | Context caching      | cache_hits, cache_size, effectiveness        |

### Multi-Agent System

| Table                 | Purpose                | Key Metrics                                             |
| --------------------- | ---------------------- | ------------------------------------------------------- |
| `agents`              | Agent instances        | agent_count, type_distribution, success_rate            |
| `agent_plans`         | Execution plans        | strategy_distribution, completion_rate, avg_steps       |
| `agent_chat_sessions` | LLM↔LLM conversations | session_count, avg_turns, success_rate                  |
| `agent_chat_messages` | Agent messages         | message_count, tokens_per_message, sender_distribution  |
| `agent_executions`    | Executor runs          | execution_count, success_rate, avg_duration, tool_usage |
| `chat_operations`     | Database operations    | operation_count, success_rate, type_distribution        |

### Context Relationships

| Table                        | Purpose          | Insights                                          |
| ---------------------------- | ---------------- | ------------------------------------------------- |
| `chat_sessions_projects`     | Project context  | Most discussed projects, project engagement       |
| `chat_sessions_tasks`        | Task context     | Task assistance frequency, completion correlation |
| `chat_sessions_daily_briefs` | Brief generation | Brief generation patterns, customization usage    |

---

## 📈 Page 1: Dashboard (Overview)

### Top-Level KPIs (Time-range filtered)

```typescript
interface DashboardKPIs {
	// User Engagement
	totalSessions: number;
	activeSessions: number;
	totalMessages: number;
	avgMessagesPerSession: number;
	uniqueUsers: number;

	// Agent Performance
	totalAgents: number;
	activePlans: number;
	agentSuccessRate: number; // % of completed vs failed
	avgPlanComplexity: number; // Avg steps per plan

	// Cost & Usage
	totalTokensUsed: number;
	estimatedCost: number; // Based on token pricing
	avgTokensPerSession: number;
	tokenTrend: TrendData; // Up/down from previous period

	// Quality Metrics
	compressionEffectiveness: number; // % tokens saved
	toolSuccessRate: number; // % successful tool calls
	avgResponseTime: number; // milliseconds
	errorRate: number; // % of failed requests

	// Time-based trends (last 24h, 7d, 30d)
	sessionsOverTime: TimeSeriesData[];
	tokensOverTime: TimeSeriesData[];
}
```

### Visual Components

**1. Real-time Activity Feed** (Last 50 events)

```typescript
interface ActivityEvent {
	timestamp: Date;
	type: 'session_start' | 'message' | 'plan_created' | 'agent_spawned' | 'compression' | 'error';
	user_id: string;
	session_id: string;
	details: string;
	tokens_used?: number;
}
```

**2. Token Usage Chart** (24h breakdown)

- Line chart showing token usage over time
- Breakdown by: user_chat vs agent_system
- Cost overlay

**3. Strategy Distribution** (Pie chart)

```typescript
interface StrategyBreakdown {
	direct: number; // Simple queries
	complex: number; // Multi-step with executors
	percentages: { direct: number; complex: number };
}
```

**4. Top Users by Activity**

```typescript
interface UserActivity {
	user_id: string;
	email: string;
	session_count: number;
	message_count: number;
	tokens_used: number;
	avg_session_length: number;
	last_active: Date;
}
```

---

## 💬 Page 2: Chat Sessions (List View)

### Filters & Search

```typescript
interface SessionFilters {
	// Time range
	dateRange: { start: Date; end: Date };

	// User
	userId?: string;
	userEmail?: string;

	// Context
	contextType?: 'global' | 'project' | 'task' | 'calendar';
	entityId?: string;

	// Status
	status?: 'active' | 'completed' | 'failed';

	// Metrics
	minMessages?: number;
	maxMessages?: number;
	minTokens?: number;
	maxTokens?: number;

	// Flags
	hasCompressions?: boolean;
	hasToolCalls?: boolean;
	hasErrors?: boolean;
	hasAgentPlans?: boolean; // Used multi-agent system

	// Sorting
	sortBy: 'created_at' | 'message_count' | 'total_tokens' | 'duration';
	sortOrder: 'asc' | 'desc';
}
```

### Session List Columns

```typescript
interface SessionListItem {
	// Identity
	id: string;
	title: string; // Auto-generated or custom
	user: {
		id: string;
		email: string;
		name: string;
	};

	// Metrics
	message_count: number;
	total_tokens: number;
	tool_call_count: number;

	// Context
	context_type: string;
	entity_id?: string;
	entity_name?: string; // Resolved from projects/tasks

	// Status
	status: 'active' | 'completed' | 'failed';

	// Timestamps
	created_at: Date;
	updated_at: Date;
	duration_minutes?: number;

	// Flags (visual indicators)
	has_agent_plan: boolean; // Multi-agent system used
	has_compression: boolean;
	has_errors: boolean;

	// Quick stats
	cost_estimate: number;
	quality_score?: number; // Derived metric
}
```

### Bulk Actions

- Export selected sessions (JSON/CSV)
- Flag for review
- Delete sessions (with confirmation)
- Archive sessions

---

## 🔍 Page 3: Session Detail View

### Header Summary

```typescript
interface SessionDetail {
	// Basic info
	id: string;
	title: string;
	user: UserInfo;
	created_at: Date;
	duration: number;

	// Context
	context_type: string;
	entity: {
		id: string;
		type: 'project' | 'task' | 'brief';
		name: string;
		link: string; // Deep link to entity
	};

	// Metrics
	metrics: {
		total_messages: number;
		user_messages: number;
		assistant_messages: number;
		system_messages: number;
		total_tokens: number;
		prompt_tokens: number;
		completion_tokens: number;
		cost_estimate: number;
		avg_response_time: number;
	};

	// Quality indicators
	quality: {
		compression_count: number;
		tokens_saved: number;
		tool_calls: number;
		tool_success_rate: number;
		error_count: number;
	};
}
```

### Conversation Thread

```typescript
interface MessageDisplay {
	id: string;
	role: 'user' | 'assistant' | 'system';
	content: string; // Rendered as markdown
	timestamp: Date;

	// Metadata (expandable)
	metadata: {
		tokens_used?: number;
		model?: string;
		tool_calls?: ToolCall[];
		tool_results?: ToolResult[];
		compressed_from?: number; // Original message count before compression
	};

	// Flags
	was_compressed: boolean;
	has_errors: boolean;

	// Actions
	canCopy: true;
	canFlag: true;
}
```

### Associated Agent Activity (If multi-agent used)

**Agent Plan View**

```typescript
interface AgentPlanDisplay {
	id: string;
	strategy: 'direct' | 'complex';
	status: 'pending' | 'executing' | 'completed' | 'failed';

	planner_agent: {
		id: string;
		name: string;
		model: string;
	};

	steps: PlanStep[];

	metrics: {
		total_executors: number;
		total_turns: number; // In LLM-to-LLM conversations
		total_tokens: number;
		duration_ms: number;
	};
}
```

**Executor Executions**

```typescript
interface ExecutionDisplay {
	id: string;
	step_number: number;
	executor_agent: {
		id: string;
		name: string;
		model: string;
		permissions: 'read_only';
	};

	task: {
		description: string;
		goal: string;
		constraints: string[];
	};

	conversation: {
		session_id: string;
		message_count: number;
		turn_count: number; // Back-and-forth iterations
		messages: AgentMessage[]; // Expandable
	};

	result: {
		success: boolean;
		data: any;
		error?: string;
	};

	metrics: {
		tokens_used: number;
		duration_ms: number;
		tool_calls_made: number;
	};
}
```

### Tool Execution Timeline

```typescript
interface ToolExecutionDisplay {
	id: string;
	timestamp: Date;
	tool_name: string;
	arguments: Record<string, any>;
	result: any;
	success: boolean;
	duration_ms: number;
	error?: string;

	// Context
	executed_by: 'planner' | 'executor';
	agent_id?: string;
}
```

### Compression History

```typescript
interface CompressionDisplay {
	id: string;
	timestamp: Date;
	original_messages: number;
	compressed_messages: number;
	tokens_before: number;
	tokens_after: number;
	tokens_saved: number;
	compression_ratio: number; // e.g., 65%

	// Expandable: show what was compressed
	summary: string; // LLM-generated summary of compressed content
}
```

---

## 🤖 Page 4: Agent Analytics

### Agent Performance Metrics

```typescript
interface AgentAnalytics {
	// Overview
	total_agents_created: number;
	active_agents: number;

	// Type breakdown
	planners: {
		total: number;
		active: number;
		avg_plans_per_planner: number;
		success_rate: number;
	};

	executors: {
		total: number;
		active: number;
		avg_executions_per_executor: number;
		success_rate: number;
	};

	// Strategy effectiveness
	strategies: {
		direct: {
			count: number;
			avg_tokens: number;
			avg_duration_ms: number;
			success_rate: number;
		};
		complex: {
			count: number;
			avg_steps: number;
			avg_executors: number;
			avg_tokens: number;
			avg_duration_ms: number;
			success_rate: number;
		};
	};

	// LLM-to-LLM conversations
	agent_conversations: {
		total_sessions: number;
		avg_turns: number;
		avg_messages_per_session: number;
		avg_tokens_per_session: number;
		clarification_rate: number; // % where executor asked questions
	};
}
```

### Agent List

```typescript
interface AgentListItem {
	id: string;
	type: 'planner' | 'executor';
	name: string;
	model: string;
	status: 'active' | 'completed' | 'failed';

	// Context
	created_for_session: string;
	created_for_plan?: string;
	user: {
		id: string;
		email: string;
	};

	// Performance
	plans_created?: number; // For planners
	executions_performed?: number; // For executors
	success_rate: number;
	avg_tokens_used: number;

	// Timestamps
	created_at: Date;
	completed_at?: Date;
	duration?: number;
}
```

---

## 💰 Page 5: Cost & Token Analytics

### Cost Dashboard

```typescript
interface CostAnalytics {
	// Total costs (time-range filtered)
	total_cost: number;

	// Breakdown by source
	by_source: {
		user_chat: { tokens: number; cost: number };
		agent_system: { tokens: number; cost: number };
		planner_agents: { tokens: number; cost: number };
		executor_agents: { tokens: number; cost: number };
	};

	// Breakdown by model
	by_model: {
		[model: string]: {
			tokens: number;
			cost: number;
			requests: number;
		};
	};

	// Per-user costs
	by_user: {
		user_id: string;
		email: string;
		tokens_used: number;
		cost: number;
		session_count: number;
		avg_cost_per_session: number;
	}[];

	// Trends
	daily_costs: TimeSeriesData[];
	monthly_projection: number;

	// Optimization
	compression_savings: {
		tokens_saved: number;
		cost_saved: number;
		percentage_saved: number;
	};
}
```

### Token Usage Breakdown

```typescript
interface TokenBreakdown {
	// By message type
	by_role: {
		user: number;
		assistant: number;
		system: number;
		tool: number;
	};

	// By context type
	by_context: {
		global: number;
		project: number;
		task: number;
		calendar: number;
	};

	// Compression impact
	before_compression: number;
	after_compression: number;
	saved: number;

	// Trends
	tokens_over_time: TimeSeriesData[];
	peak_usage_hours: HourlyData[];
}
```

---

## 🔧 Page 6: Tool Usage Analytics

### Tool Performance

```typescript
interface ToolAnalytics {
	// Overview
	total_tool_calls: number;
	unique_tools_used: number;
	success_rate: number;
	avg_execution_time: number;

	// Per-tool stats
	tools: {
		name: string;
		category: 'read' | 'write';
		call_count: number;
		success_count: number;
		failure_count: number;
		success_rate: number;
		avg_duration_ms: number;
		total_duration_ms: number;

		// Error analysis
		common_errors: { error: string; count: number }[];

		// Usage context
		used_by_planners: number;
		used_by_executors: number;
	}[];

	// Trends
	tool_usage_over_time: TimeSeriesData[];

	// Top failures
	most_failed_tools: ToolFailureStat[];
}
```

---

## 🎯 Page 7: Quality & Error Monitoring

### Error Dashboard

```typescript
interface ErrorAnalytics {
	// Overview
	total_errors: number;
	error_rate: number; // % of requests

	// Error types
	by_type: {
		api_errors: number;
		tool_failures: number;
		agent_failures: number;
		compression_failures: number;
		timeout_errors: number;
		rate_limit_errors: number;
	};

	// Recent errors (list)
	recent_errors: {
		timestamp: Date;
		error_type: string;
		error_message: string;
		session_id: string;
		user_id: string;
		stack_trace?: string;
		context: any;
	}[];

	// Error trends
	errors_over_time: TimeSeriesData[];

	// Impact analysis
	affected_users: number;
	affected_sessions: number;
}
```

### Quality Metrics

```typescript
interface QualityMetrics {
	// Response quality
	avg_response_time: number;
	p95_response_time: number;
	p99_response_time: number;

	// Conversation quality
	avg_conversation_length: number;
	bounce_rate: number; // % single-message sessions
	engagement_score: number; // Derived metric

	// Agent quality
	agent_success_rate: number;
	avg_plan_complexity: number;
	executor_iteration_rate: number; // Avg turns per executor

	// Compression quality
	compression_usage_rate: number; // % sessions with compression
	avg_compression_ratio: number;
	tokens_saved_per_compression: number;
}
```

---

## 🔍 Page 8: Search & Export

### Advanced Search

```typescript
interface AdvancedSearch {
  // Full-text search
  query: string; // Search in message content

  // Filters (all from Session Filters + more)
  ...SessionFilters;

  // Agent-specific
  agentType?: 'planner' | 'executor';
  strategy?: 'direct' | 'complex';
  hasExecutors?: boolean;

  // Tool-specific
  toolUsed?: string;
  toolStatus?: 'success' | 'failed';

  // Results
  searchIn: ('messages' | 'session_titles' | 'tool_results' | 'agent_plans')[];
}
```

### Export Options

```typescript
interface ExportConfig {
	format: 'json' | 'csv' | 'excel';
	include: {
		sessions: boolean;
		messages: boolean;
		tool_executions: boolean;
		agent_plans: boolean;
		agent_conversations: boolean;
		compressions: boolean;
	};
	filters: SessionFilters;
	dateRange: { start: Date; end: Date };
}
```

---

## 🎨 UI Components & Patterns

### Shared Components

**1. Metric Card**

```typescript
interface MetricCard {
	title: string;
	value: number | string;
	trend?: { value: number; direction: 'up' | 'down' };
	format?: 'number' | 'currency' | 'percentage' | 'duration';
	icon?: string;
	color?: 'blue' | 'green' | 'red' | 'yellow';
}
```

**2. Data Table**

- Sortable columns
- Filters (inline)
- Pagination
- Row actions (view, export, delete)
- Bulk selection

**3. Time Series Chart**

- Line/Area chart
- Zoom & pan
- Tooltip with details
- Multiple series support

**4. Session Card (Preview)**

```typescript
interface SessionCardProps {
	session: SessionListItem;
	onView: () => void;
	onExport: () => void;
	onFlag: () => void;
}
```

**5. Agent Flow Visualizer**

- Shows planner → executor relationships
- Conversation threads
- Step dependencies
- Interactive (click to drill down)

---

## 🔐 Access Control

### Permission Levels

```typescript
enum AdminPermission {
	VIEW_DASHBOARD = 'admin:dashboard:view',
	VIEW_SESSIONS = 'admin:sessions:view',
	VIEW_SESSION_DETAIL = 'admin:sessions:detail',
	EXPORT_DATA = 'admin:data:export',
	DELETE_SESSIONS = 'admin:sessions:delete',
	VIEW_COSTS = 'admin:costs:view',
	VIEW_ERRORS = 'admin:errors:view',
	VIEW_AGENTS = 'admin:agents:view'
}
```

### User Roles

| Role                | Permissions                                      | Use Case                 |
| ------------------- | ------------------------------------------------ | ------------------------ |
| **Admin**           | All permissions                                  | Full system access       |
| **Product Manager** | View dashboard, sessions, costs, quality metrics | Analytics & optimization |
| **Support**         | View sessions, messages, errors                  | User support             |
| **Finance**         | View costs only                                  | Budget tracking          |
| **QA**              | View sessions, errors, quality metrics           | Quality assurance        |

---

## 📊 SQL Queries for Key Metrics

### Dashboard KPIs

```sql
-- Total sessions (time-filtered)
SELECT COUNT(*) FROM chat_sessions
WHERE created_at >= $startDate AND created_at <= $endDate;

-- Token usage
SELECT
  SUM(total_tokens_used) as total_tokens,
  AVG(total_tokens_used) as avg_per_session
FROM chat_sessions
WHERE created_at >= $startDate AND created_at <= $endDate;

-- Agent success rate
SELECT
  COUNT(*) as total,
  SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)::float / COUNT(*) as success_rate
FROM agents
WHERE created_at >= $startDate AND created_at <= $endDate;

-- Strategy distribution
SELECT
  strategy,
  COUNT(*) as count,
  AVG(JSONB_ARRAY_LENGTH(steps)) as avg_steps
FROM agent_plans
WHERE created_at >= $startDate AND created_at <= $endDate
GROUP BY strategy;
```

### Cost Analytics

```sql
-- Token cost breakdown by source
WITH token_costs AS (
  SELECT
    'user_chat' as source,
    SUM(cm.tokens_used) as tokens
  FROM chat_messages cm
  WHERE cm.created_at >= $startDate

  UNION ALL

  SELECT
    'agent_planner' as source,
    SUM(acm.tokens_used) as tokens
  FROM agent_chat_messages acm
  JOIN agents a ON acm.sender_agent_id = a.id
  WHERE a.type = 'planner' AND acm.created_at >= $startDate

  UNION ALL

  SELECT
    'agent_executor' as source,
    SUM(acm.tokens_used) as tokens
  FROM agent_chat_messages acm
  JOIN agents a ON acm.sender_agent_id = a.id
  WHERE a.type = 'executor' AND acm.created_at >= $startDate
)
SELECT
  source,
  tokens,
  tokens * $tokenCost as cost
FROM token_costs;
```

### Compression Effectiveness

```sql
SELECT
  COUNT(*) as compression_count,
  SUM(tokens_saved) as total_tokens_saved,
  AVG(tokens_saved::float / original_tokens) as avg_compression_ratio
FROM chat_compressions
WHERE created_at >= $startDate;
```

---

## 🚀 Implementation Priority

### Phase 1: Essential Monitoring (MVP)

1. ✅ Dashboard (Overview KPIs)
2. ✅ Session List with filters
3. ✅ Session Detail View
4. ✅ Basic export (JSON)

### Phase 2: Analytics

5. ✅ Cost & Token Analytics
6. ✅ Agent Analytics
7. ✅ Tool Usage Analytics

### Phase 3: Advanced Features

8. ✅ Error monitoring
9. ✅ Quality metrics
10. ✅ Advanced search
11. ✅ Bulk operations

### Phase 4: Optimizations

12. ⏳ Real-time monitoring (WebSocket)
13. ⏳ Custom dashboards
14. ⏳ Alerts & notifications
15. ⏳ Performance optimization

---

## 📝 Notes

- All timestamps should support timezone conversion
- All monetary values in USD (configurable)
- Token costs based on model pricing (DeepSeek: ~$0.14/$0.28 per million)
- Implement rate limiting on export operations
- Cache expensive queries (dashboard KPIs)
- Consider pagination for large datasets (sessions, messages)

---

**See related documentation:**

- **Database Schema:** `supabase/migrations/20251029_create_agent_architecture.sql`
- **Agent System:** `apps/web/docs/features/chat-system/multi-agent-chat/README.md`
- **API Endpoints:** `apps/web/src/routes/api/agent/stream/+server.ts`
