# Daily Briefs API Endpoints

This document provides comprehensive documentation for all Daily Briefs API endpoints in the BuildOS platform.

## Overview

The BuildOS platform contains **17 API endpoints** related to daily briefs functionality, organized into three main categories:

1. **Daily Briefs** (`/api/daily-briefs/*`) - 9 endpoints for daily brief generation and management
2. **Brief Jobs** (`/api/brief-jobs/*`) - 4 endpoints for queue job management
3. **Brief Preferences & Templates** - 4 endpoints for user preferences and project brief templates

All endpoints require authentication unless otherwise noted.

**Base Paths:**

- `/api/daily-briefs`
- `/api/brief-jobs`
- `/api/brief-preferences`
- `/api/brief-templates`

---

## Daily Briefs Endpoints

### 1. `GET /api/daily-briefs` - Get Daily Brief

**Purpose:** Fetch an existing daily brief for a specific date

**File:** `/apps/web/src/routes/api/daily-briefs/+server.ts`

**Authentication:** Required

#### Query Parameters

| Parameter | Type   | Required | Default | Description     |
| --------- | ------ | -------- | ------- | --------------- |
| `date`    | string | No       | Today   | ISO date string |

#### Response (Brief Found)

```typescript
{
	brief: DailyBrief;
}
```

#### Response (No Brief)

```typescript
{
  brief: null,
  message: "No brief found for this date"
}
```

#### Database Operations

- Query: `daily_briefs` table
- Filters: `user_id`, `brief_date`

---

### 2. `GET /api/daily-briefs/[id]` - Get Brief by ID

**Purpose:** Fetch a specific daily brief by ID

**File:** `/apps/web/src/routes/api/daily-briefs/[id]/+server.ts`

**Authentication:** Required

#### Path Parameters

| Parameter | Type          | Required | Description |
| --------- | ------------- | -------- | ----------- |
| `id`      | string (UUID) | Yes      | Brief ID    |

#### Response

```typescript
{
	brief: DailyBrief;
}
```

#### Error Response

```typescript
{
	error: 'Brief not found';
}
```

---

### 3. `PUT /api/daily-briefs/[id]` - Update Brief

**Purpose:** Update brief fields

**File:** `/apps/web/src/routes/api/daily-briefs/[id]/+server.ts`

**Authentication:** Required

#### Request Body

```typescript
{
  summary_content?: string;
  insights?: string;
  priority_actions?: string[];
  // ... other updatable fields
}
```

#### Response

```typescript
{
	brief: DailyBrief; // Updated brief
}
```

#### Validation

- Ensures user owns the brief (`user_id` match)
- Automatically updates `updated_at` timestamp

---

### 4. `DELETE /api/daily-briefs/[id]` - Delete Brief

**Purpose:** Delete a daily brief

**File:** `/apps/web/src/routes/api/daily-briefs/[id]/+server.ts`

**Authentication:** Required

#### Response

```typescript
{
	success: true;
}
```

#### Database Operations

- Cascades to `project_daily_briefs` (handled by database constraints)

---

### 5. `POST /api/daily-briefs/cancel` - Cancel Generation

**Purpose:** Cancel an in-progress brief generation

**File:** `/apps/web/src/routes/api/daily-briefs/cancel/+server.ts`

**Authentication:** Required

#### Request Body

```typescript
{
  briefDate?: string  // ISO date string (default: today)
}
```

#### Response

```typescript
{
  success: true,
  brief_id: string,
  message: "Brief generation cancelled successfully"
}
```

#### Database Operations

- Updates `daily_briefs.generation_status` to `'failed'`
- Sets `generation_error` to "Cancelled by user"
- Only cancels briefs with status `'processing'`
- Also cancels related `project_daily_briefs` with status `'processing'`

---

### 6. `POST /api/daily-briefs/generate` - Generate Brief

**Purpose:** Generate a new daily brief with multiple generation modes

**File:** `/apps/web/src/routes/api/daily-briefs/generate/+server.ts`

**Authentication:** Required

#### Request Body

```typescript
{
  briefDate?: string;           // Default: today
  forceRegenerate?: boolean;    // Default: false
  streaming?: boolean;          // Default: false - use SSE streaming
  background?: boolean;         // Default: false - async generation
}
```

#### Generation Modes

1. **Synchronous** (default): Waits for completion, returns full result
2. **Streaming** (`streaming: true`): Returns SSE stream with progress
3. **Background** (`background: true`): Returns immediately, processes async

#### Response (Synchronous/Background)

```typescript
{
  success: true,
  data: {
    brief_id: string,
    result?: DailyBriefResult,
    message?: string,
    status?: "processing"
  }
}
```

#### Response (Streaming - GET method)

**Server-Sent Events (SSE)** with the following event types:

```typescript
// Event types:
data: { type: "status", data: { message: string } }
data: { type: "project_brief", data: ProjectDailyBrief }
data: { type: "main_brief", data: { content: string } }
data: { type: "progress", data: { projects: { completed: number, total: number } } }
data: { type: "complete", data: DailyBriefResult }
data: { type: "error", data: { message: string } }
```

#### Services Used

- `DailyBriefGenerator`: Orchestrates brief generation
- `DailyBriefRepository`: Database operations
- `BriefGenerationValidator`: Validates generation can start
- `BriefStreamHandler`: Manages SSE streaming
- `DailyBriefEmailSender`: Sends email notifications
- `ActivityLogger`: Logs user activity

#### Validation

- Checks for concurrent generations
- Verifies no existing brief for date (unless `forceRegenerate`)

#### Error Handling

- Returns 409 if brief already exists
- Returns 429 if another generation is in progress
- Logs failed generation attempts

---

### 7. `GET /api/daily-briefs/history` - Get Brief History

**Purpose:** Retrieve paginated history of daily briefs with filtering

**File:** `/apps/web/src/routes/api/daily-briefs/history/+server.ts`

**Authentication:** Required

#### Query Parameters

| Parameter    | Type   | Required | Default | Description                                |
| ------------ | ------ | -------- | ------- | ------------------------------------------ |
| `page`       | number | No       | 1       | Page number                                |
| `limit`      | number | No       | 50      | Items per page (max: 50)                   |
| `start_date` | string | No       | -       | Filter briefs >= this date                 |
| `end_date`   | string | No       | -       | Filter briefs <= this date                 |
| `search`     | string | No       | -       | Search in `summary_content` and `insights` |

#### Response

```typescript
{
  briefs: DailyBrief[],
  pagination: {
    page: number,
    limit: number,
    total: number,
    totalPages: number,
    hasNext: boolean,
    hasPrev: boolean
  }
}
```

#### Search Behavior

- Case-insensitive search using PostgreSQL `ilike`
- Searches across `summary_content` and `insights` fields

#### Database Operations

- Orders by `brief_date` descending (newest first)
- Uses range-based pagination

---

### 8. `GET /api/daily-briefs/progress` - Get Generation Progress

**Purpose:** Get real-time generation progress for a specific date

**File:** `/apps/web/src/routes/api/daily-briefs/progress/+server.ts`

**Authentication:** Required

#### Query Parameters

| Parameter | Type   | Required | Default | Description     |
| --------- | ------ | -------- | ------- | --------------- |
| `date`    | string | No       | Today   | ISO date string |

#### Response (Brief Exists)

```typescript
{
  exists: true,
  brief_status: "pending" | "processing" | "completed" | "failed",
  main_brief: {
    id: string,
    content: string,
    priority_actions: string[]
  } | null,
  projects: {
    total: number,
    completed: number,
    failed: number,
    briefs: Array<{
      id: string,
      project_name: string,
      content: string
    }>
  },
  overall_progress: {
    total_items: number,
    completed_items: number,
    failed_items: number
  }
}
```

#### Response (No Brief)

```typescript
{
  exists: false,
  progress: null
}
```

#### Database Operations

- Queries `daily_briefs` for main brief status
- Queries `project_daily_briefs` with join to `projects` table
- Filters by `user_id`, `brief_date`

---

### 9. `GET /api/daily-briefs/search` - Search Briefs

**Purpose:** Advanced search across daily briefs and project briefs

**File:** `/apps/web/src/routes/api/daily-briefs/search/+server.ts`

**Authentication:** Required

#### Query Parameters

| Parameter | Type   | Required | Default | Description         |
| --------- | ------ | -------- | ------- | ------------------- |
| `q`       | string | Yes      | -       | Search query string |
| `limit`   | number | No       | 10      | Max results         |

#### Response

```typescript
{
  results: Array<{
    type: "daily" | "project",
    id: string,
    date: string,
    title: string,
    content: string,
    preview: string,      // First 200 chars
    created_at: string,
    project_name?: string // Only for type: "project"
  }>,
  total: number,
  query: string
}
```

#### Search Scope

- **Daily briefs:** `summary_content` and `insights`
- **Project briefs:** `brief_content`

#### Relevance Ranking

1. Position of query match (earlier = higher rank)
2. Date (newer = higher rank if equal relevance)

#### Database Operations

- Parallel queries to `daily_briefs` and `project_daily_briefs`
- Joins with `projects` table for project names

---

### 10. `GET /api/daily-briefs/stats` - Get Statistics

**Purpose:** Get user's brief generation statistics and streak

**File:** `/apps/web/src/routes/api/daily-briefs/stats/+server.ts`

**Authentication:** Required

#### Response

```typescript
{
  total_briefs: number,
  briefs_this_week: number,
  briefs_this_month: number,
  current_streak: number,        // Consecutive days with briefs
  last_brief_date: string | null,
  last_brief_created: string | null
}
```

#### Streak Calculation Logic

- Starts from today and counts backwards
- Breaks if any day is missing a brief
- Considers timezone-agnostic dates (UTC midnight)

#### Database Operations

- Multiple count queries with date filters
- Fetches up to 100 most recent briefs for streak calculation

---

### 11. `GET /api/daily-briefs/status` - Check Brief Status

**Purpose:** Check if a brief exists or is being generated for a specific date

**File:** `/apps/web/src/routes/api/daily-briefs/status/+server.ts`

**Authentication:** Required

#### Query Parameters

| Parameter | Type   | Required | Default      | Description     |
| --------- | ------ | -------- | ------------ | --------------- |
| `date`    | string | No       | Today        | ISO date string |
| `userId`  | string | No       | Current user | User ID         |

#### Response

```typescript
{
  brief: DailyBrief | null,
  generation_status: string | null,
  isGenerating: boolean,
  activeJob: {
    id: string,
    queue_job_id: string,
    status: "pending" | "processing" | "failed" | "completed" | "cancelled",
    scheduled_for: string,
    created_at: string,
    processed_at: string | null,
    error_message: string | null,
    progress: {
      projects: { completed: number, total: number },
      message: string,
      percentage: number
    } | null
  } | null,
  progress: {
    projects: { completed: number, total: number },
    message: string,
    percentage: number
  } | null
}
```

#### Database Operations

- Queries `daily_briefs` table
- Queries `queue_jobs` table for active generation jobs
- Filters by `job_type = 'generate_daily_brief'`
- Checks for jobs scheduled within the target date (00:00-23:59 UTC)

---

## Brief Jobs Endpoints

### 12. `GET /api/brief-jobs` - List Jobs

**Purpose:** List scheduled/completed brief generation jobs with pagination

**File:** `/apps/web/src/routes/api/brief-jobs/+server.ts`

**Authentication:** Required

#### Query Parameters

| Parameter  | Type   | Required | Default                | Description                                       |
| ---------- | ------ | -------- | ---------------------- | ------------------------------------------------- |
| `job_type` | string | No       | "generate_daily_brief" | Job type filter                                   |
| `status`   | string | No       | -                      | Comma-separated list (e.g., "pending,processing") |
| `limit`    | number | No       | 20                     | Max results (max: 100)                            |
| `offset`   | number | No       | 0                      | Pagination offset                                 |

#### Response

```typescript
{
  jobs: Array<{
    id: string,
    queue_job_id: string,
    user_id: string,
    job_type: string,
    status: "pending" | "processing" | "completed" | "failed" | "cancelled",
    scheduled_for: string,
    created_at: string,
    started_at: string | null,
    processed_at: string | null,
    completed_at: string | null,
    error_message: string | null,
    metadata: any | null,
    result: any | null,
    attempts: number | null,
    max_attempts: number | null,
    priority: number | null
  }>,
  total: number,
  limit: number,
  offset: number,
  hasMore: boolean
}
```

#### Database Operations

- Queries `queue_jobs` table
- Orders by `created_at` descending
- Supports status filtering with `IN` clause

---

### 13. `GET /api/brief-jobs/[id]` - Get Job Status

**Purpose:** Fetch a specific queue job by ID

**File:** `/apps/web/src/routes/api/brief-jobs/[id]/+server.ts`

**Authentication:** Required

#### Response

```typescript
{
  id: string,
  queue_job_id: string,
  // ... all queue_jobs fields
}
```

#### Lookup Strategy

1. First attempts to find by primary key `queue_job_id`
2. Falls back to searching by `queue_job_id` field (backward compatibility)
3. Returns 404 if not found

#### Database Operations

- Two query attempts for backward compatibility
- Ensures user owns the job (`user_id` match)

---

### 14. `POST /api/brief-jobs/cancel` - Cancel Jobs

**Purpose:** Cancel all pending/processing jobs for a specific date

**File:** `/apps/web/src/routes/api/brief-jobs/cancel/+server.ts`

**Authentication:** Required

#### Request Body

```typescript
{
  briefDate: string,                    // Required: ISO date string
  jobType?: string                      // Optional: default "generate_daily_brief"
}
```

#### Response

```typescript
{
  success: true,
  cancelledCount: number
}
```

#### Date Handling

- Validates date format
- Creates UTC date boundaries (start of day to start of next day)
- Cancels all jobs within that 24-hour window

#### Database Operations

- Updates `queue_jobs` table
- Sets `status = 'cancelled'`
- Sets `error_message = 'Cancelled by manual generation'`
- Sets `processed_at` to current timestamp
- Only affects jobs with status `'pending'` or `'processing'`

---

### 15. `GET /api/brief-jobs/next-scheduled` - Get Next Job

**Purpose:** Get the next scheduled brief generation job for the user

**File:** `/apps/web/src/routes/api/brief-jobs/next-scheduled/+server.ts`

**Authentication:** Required

#### Response

```typescript
{
  success: true,
  nextScheduledBrief: {
    scheduledFor: string,
    createdAt: string,
    status: "pending" | "scheduled",
    jobType: string
  } | null
}
```

#### Database Operations

- Queries `queue_jobs` table
- Filters: `job_type = 'generate_daily_brief'`, `status IN ('pending', 'scheduled')`
- Only returns future jobs (`scheduled_for >= now`)
- Orders by `scheduled_for` ascending (earliest first)
- Limits to 1 result

#### Error Handling

- Handles `PGRST116` (no rows) gracefully
- Returns `null` for `nextScheduledBrief` if no jobs found

---

## Brief Preferences & Templates Endpoints

### 16. `GET /api/brief-preferences` - Get Preferences

**Purpose:** Get user's daily brief scheduling preferences

**File:** `/apps/web/src/routes/api/brief-preferences/+server.ts`

**Authentication:** Required

#### Response

```typescript
{
  preferences: {
    id: string,
    user_id: string,
    frequency: "daily" | "weekly",
    day_of_week: number | null,    // 0-6 (0=Sunday, 1=Monday, etc.)
    time_of_day: string,            // "HH:MM:SS" format
    timezone: string,               // IANA timezone
    is_active: boolean,
    email_daily_brief: boolean,
    created_at: string,
    updated_at: string
  }
}
```

#### Auto-creation

If no preferences exist, creates default preferences:

```typescript
{
  frequency: 'daily',
  day_of_week: 1,           // Monday
  time_of_day: '09:00:00',
  timezone: 'UTC',
  is_active: true,
  email_daily_brief: false
}
```

---

### 17. `POST /api/brief-preferences` - Update Preferences

**Purpose:** Update user's daily brief scheduling preferences

**File:** `/apps/web/src/routes/api/brief-preferences/+server.ts`

**Authentication:** Required

#### Request Body

```typescript
{
  frequency: "daily" | "weekly",    // Required
  day_of_week?: number,             // Required for weekly (0-6)
  time_of_day: string,              // Required: "HH:MM:SS"
  timezone: string,                 // Required: IANA timezone
  is_active?: boolean,              // Optional: default true
  email_daily_brief?: boolean       // Optional: default false/existing
}
```

#### Validation

- `frequency` must be "daily" or "weekly"
- `day_of_week` required for weekly (0-6 range)
- `time_of_day` must match `HH:MM:SS` format
- `timezone` is required

#### Side Effects

- Cancels all existing pending/processing jobs in `queue_jobs`
- Allows scheduler to reschedule based on new preferences
- Sets `error_message = 'Cancelled due to preference change'`

#### Response

```typescript
{
  preferences: UserBriefPreferences,
  message: "Preferences updated successfully. New briefs will be scheduled according to your updated preferences."
}
```

---

### 18. `GET /api/brief-templates/project` - List Templates

**Purpose:** Get all project brief templates

**File:** `/apps/web/src/routes/api/brief-templates/project/+server.ts`

**Authentication:** Required

#### Response

```typescript
{
  templates: ProjectBriefTemplate[]
}
```

#### Database Operations

- Queries `project_brief_templates` table
- Orders by `created_at` descending
- No user filtering (returns all templates)

---

### 19. `POST /api/brief-templates/project` - Create Template

**Purpose:** Create a new project brief template

**File:** `/apps/web/src/routes/api/brief-templates/project/+server.ts`

**Authentication:** Required

#### Request Body

```typescript
{
  name: string,
  description?: string | null,
  template_content: string,
  variables?: any,
  project_id?: string | null,
  user_id?: string | null,
  in_use?: boolean | null,
  is_default?: boolean | null,
  metadata?: any
}
```

#### Response

```typescript
{
	template: ProjectBriefTemplate;
}
```

---

### 20. `GET /api/brief-templates/project/[id]` - Get Template

**Purpose:** Get a specific project brief template

**File:** `/apps/web/src/routes/api/brief-templates/project/[id]/+server.ts`

**Authentication:** Required

#### Response

```typescript
{
	template: ProjectBriefTemplate;
}
```

---

### 21. `PUT /api/brief-templates/project/[id]` - Update Template

**Purpose:** Update template fields

**File:** `/apps/web/src/routes/api/brief-templates/project/[id]/+server.ts`

**Authentication:** Required

#### Request Body

Partial update - any fields from ProjectBriefTemplate

#### Response

```typescript
{
	template: ProjectBriefTemplate;
}
```

#### Auto-updates

Sets `updated_at` timestamp

---

### 22. `DELETE /api/brief-templates/project/[id]` - Delete Template

**Purpose:** Delete a project brief template

**File:** `/apps/web/src/routes/api/brief-templates/project/[id]/+server.ts`

**Authentication:** Required

#### Response

```typescript
{
	success: true;
}
```

---

## Common Types

### DailyBrief

```typescript
interface DailyBrief {
	id: string;
	user_id: string;
	brief_date: string;
	summary_content: string;
	project_brief_ids?: string[];
	insights?: string;
	priority_actions?: string[];
	generation_status?: 'pending' | 'completed' | 'failed';
	generation_error?: string;
	generation_started_at?: string;
	generation_completed_at?: string;
	generation_progress?: any;
	metadata?: any;
	created_at?: string;
	updated_at?: string;
}
```

### ProjectDailyBrief

```typescript
interface ProjectDailyBrief {
	id: string;
	user_id: string;
	project_id: string;
	template_id?: string;
	brief_content: string;
	brief_date: string;
	generation_status?: 'pending' | 'completed' | 'failed';
	metadata?: any;
	created_at?: string;
	updated_at?: string;
	projects?: {
		name: string;
		description?: string;
		slug: string;
	};
}
```

### DailyBriefResult

```typescript
interface DailyBriefResult {
	project_briefs: Array<{
		id: string;
		content: string;
		project_name: string;
	}>;
	main_brief?: {
		id: string;
		content: string;
	};
}
```

### ProjectBriefTemplate

```typescript
interface ProjectBriefTemplate {
	id: string;
	name: string;
	description: string | null;
	template_content: string;
	variables: ProjectBriefVariables | null;
	project_id: string | null;
	user_id: string | null;
	in_use: boolean | null;
	is_default: boolean | null;
	created_at: string | null;
	updated_at: string | null;
}
```

---

## Authentication

All endpoints use Supabase session authentication:

```typescript
const { user } = await safeGetSession();
if (!user) {
	return json({ error: 'Unauthorized' }, { status: 401 });
}
```

---

## Error Handling

### Common Error Responses

| Scenario               | Status | Code         | Response                    |
| ---------------------- | ------ | ------------ | --------------------------- |
| Not authenticated      | 401    | UNAUTHORIZED | `{ error: 'Unauthorized' }` |
| Brief already exists   | 409    | CONFLICT     | Conflict message            |
| Generation in progress | 429    | RATE_LIMITED | Rate limit message          |
| Not found              | 404    | NOT_FOUND    | Not found message           |
| Invalid input          | 400    | BAD_REQUEST  | Validation error            |

---

## Database Schema

### daily_briefs

```typescript
{
  brief_date: string;
  created_at: string;
  generation_completed_at: string | null;
  generation_error: string | null;
  generation_progress: Json | null;
  generation_started_at: string | null;
  generation_status: string;
  id: string;
  insights: string | null;
  llm_analysis: string | null;
  metadata: Json | null;
  priority_actions: string[] | null;
  project_brief_ids: string[] | null;
  summary_content: string;
  updated_at: string;
  user_id: string;
}
```

### project_daily_briefs

```typescript
{
	brief_content: string;
	brief_date: string;
	created_at: string;
	generation_completed_at: string | null;
	generation_error: string | null;
	generation_started_at: string | null;
	generation_status: string;
	id: string;
	metadata: Json | null;
	project_id: string;
	template_id: string | null;
	updated_at: string;
	user_id: string;
}
```

### queue_jobs

```typescript
{
	attempts: number | null;
	completed_at: string | null;
	created_at: string;
	error_message: string | null;
	id: string;
	job_type: string;
	max_attempts: number | null;
	metadata: Json | null;
	priority: number | null;
	processed_at: string | null;
	queue_job_id: string;
	result: Json | null;
	scheduled_for: string;
	started_at: string | null;
	status: string;
	updated_at: string | null;
	user_id: string;
}
```

### user_brief_preferences

```typescript
{
	created_at: string;
	day_of_week: number | null;
	email_daily_brief: boolean | null; // DEPRECATED: Use user_notification_preferences.should_email_daily_brief
	frequency: string | null;
	id: string;
	is_active: boolean | null;
	time_of_day: string | null;
	timezone: string | null;
	updated_at: string;
	user_id: string;
}
```

**Note:** The `email_daily_brief` field is deprecated as of 2025-10-13. Use `user_notification_preferences` with `event_type='user'` for daily brief notification settings. See [Notification Preferences Refactor](#notification-preferences-refactor-2025-10-13) below.

### project_brief_templates

```typescript
{
	context_snapshot: Json | null;
	created_at: string | null;
	description: string | null;
	generated_by: string | null;
	generation_model: string | null;
	id: string;
	in_use: boolean | null;
	is_default: boolean | null;
	metadata: Json | null;
	name: string;
	project_id: string | null;
	template_content: string;
	updated_at: string | null;
	user_id: string | null;
	variables: Json | null;
}
```

---

## Key Services

### Daily Brief Generation Services

**Location:** `/apps/web/src/lib/services/dailyBrief/`

1. **DailyBriefGenerator** (`generator.ts`) - Orchestrates brief generation
2. **DailyBriefRepository** (`repository.ts`) - Database operations
3. **BriefGenerationValidator** (`validator.ts`) - Pre-generation validation
4. **BriefStreamHandler** (`streamHandler.ts`) - SSE streaming
5. **DailyBriefEmailSender** (`emailSender.ts`) - Email notifications
6. **ProjectBriefGenerator** (`projectBriefGenerator.ts`) - Project-specific briefs
7. **MainBriefGenerator** (`mainBriefGenerator.ts`) - Summary brief generation

### Other Services

- **ProjectBriefTemplateGeneratorService** - AI template generation
- **ActivityLogger** - User activity tracking

---

## Usage Examples

### Generate a Daily Brief (Synchronous)

```typescript
const response = await fetch('/api/daily-briefs/generate', {
	method: 'POST',
	body: JSON.stringify({
		briefDate: '2025-10-05',
		forceRegenerate: false
	})
});
const result = await response.json();
```

### Generate with Streaming

```typescript
const eventSource = new EventSource(
	'/api/daily-briefs/generate?streaming=true&briefDate=2025-10-05'
);

eventSource.addEventListener('status', (e) => {
	const data = JSON.parse(e.data);
	console.log('Status:', data.message);
});

eventSource.addEventListener('progress', (e) => {
	const data = JSON.parse(e.data);
	console.log('Progress:', data.projects);
});

eventSource.addEventListener('complete', (e) => {
	const data = JSON.parse(e.data);
	console.log('Complete:', data);
	eventSource.close();
});
```

### Check Brief Status

```typescript
const response = await fetch('/api/daily-briefs/status?date=2025-10-05');
const status = await response.json();
console.log('Brief exists:', status.brief !== null);
console.log('Is generating:', status.isGenerating);
```

### Update Brief Preferences

```typescript
const response = await fetch('/api/brief-preferences', {
	method: 'POST',
	body: JSON.stringify({
		frequency: 'daily',
		time_of_day: '09:00:00',
		timezone: 'America/New_York',
		email_daily_brief: true
	})
});
```

### Search Briefs

```typescript
const response = await fetch('/api/daily-briefs/search?q=meeting&limit=10');
const { results, total } = await response.json();
```

### user_notification_preferences

```typescript
{
	user_id: string;
	event_type: string; // Use 'user' for daily brief notifications
	push_enabled: boolean | null;
	email_enabled: boolean | null;
	sms_enabled: boolean | null;
	in_app_enabled: boolean | null;
	should_email_daily_brief: boolean | null; // NEW (2025-10-13)
	should_sms_daily_brief: boolean | null; // NEW (2025-10-13)
	quiet_hours_enabled: boolean | null;
	quiet_hours_start: string | null;
	quiet_hours_end: string | null;
	timezone: string | null;
	priority: string | null;
	batch_enabled: boolean | null;
	batch_interval_minutes: number | null;
	max_per_hour: number | null;
	max_per_day: number | null;
	created_at: string | null;
	updated_at: string | null;
}
```

**Note:** Daily brief notifications use `event_type='user'` to distinguish user-level preferences from event-based notifications. See [Notification Preferences Refactor](#notification-preferences-refactor-2025-10-13) below.

---

## Notification Preferences Refactor (2025-10-13)

### Overview

On 2025-10-13, the daily brief notification system underwent a major refactor to separate **brief generation timing** from **notification delivery**. This change addresses the conflation of concerns where a single field controlled both when briefs were generated and how users were notified.

**Implementation Plan:** `/thoughts/shared/research/2025-10-13_06-00-00_daily-brief-notification-refactor-plan.md`

### Key Changes

#### 1. Separated Concerns

**Before:** `user_brief_preferences.email_daily_brief` controlled both generation and notification

**After:**

- `user_brief_preferences` → Controls WHEN briefs are generated (frequency, timing, timezone)
- `user_notification_preferences` (with `event_type='user'`) → Controls HOW users are notified (email, SMS)

#### 2. New Fields

Added to `user_notification_preferences`:

- `should_email_daily_brief` → Controls email notifications for daily briefs
- `should_sms_daily_brief` → Controls SMS notifications for daily briefs (with phone verification)

#### 3. User-Level vs Event-Based Preferences

**User-Level Preferences** (`event_type='user'`):

- Daily brief email notifications (`should_email_daily_brief`)
- Daily brief SMS notifications (`should_sms_daily_brief`)

**Event-Based Preferences** (`event_type='brief.completed'`):

- Push notifications for brief completion events
- In-app notifications for brief completion events

This architecture maintains the composite primary key `(user_id, event_type)` while allowing clear separation of user-level settings from event-driven notifications.

### Migration

- **Migration File:** `/supabase/migrations/20251013_refactor_daily_brief_notification_prefs.sql`
- **Data Migration:** Automatically migrated existing `email_daily_brief` values to `should_email_daily_brief`
- **Backward Compatibility:** Old `email_daily_brief` field preserved but marked as deprecated
- **Index:** Performance index added on new columns

### API Changes

#### Brief Preferences Endpoint (`/api/brief-preferences`)

**Changed:** No longer handles `email_daily_brief` field

**POST Request:**

```typescript
// Before (deprecated)
{
  frequency: "daily",
  time_of_day: "09:00:00",
  timezone: "America/New_York",
  email_daily_brief: true  // ❌ No longer accepted
}

// After (correct)
{
  frequency: "daily",
  time_of_day: "09:00:00",
  timezone: "America/New_York",
  is_active: true
}
// Use notification-preferences endpoint for email/SMS settings
```

#### Notification Preferences Endpoint (`/api/notification-preferences`)

**New:** Extended with `?daily_brief=true` query parameter

**GET `/api/notification-preferences?daily_brief=true`**

Returns user-level daily brief notification preferences:

```typescript
{
  should_email_daily_brief: boolean,
  should_sms_daily_brief: boolean,
  updated_at: string
}
```

**POST `/api/notification-preferences?daily_brief=true`**

Updates user-level daily brief notification preferences:

```typescript
// Request body
{
  should_email_daily_brief: boolean,
  should_sms_daily_brief: boolean
}

// Response
{
  success: true,
  data: {
    should_email_daily_brief: boolean,
    should_sms_daily_brief: boolean,
    updated_at: string
  }
}
```

**Validation:**

- Enabling SMS requires verified phone number
- Returns 400 error if phone not verified: `{ error: "phone_verification_required" }`

### Usage Examples

#### Updating Brief Generation Preferences

```typescript
// Update WHEN briefs are generated
const response = await fetch('/api/brief-preferences', {
	method: 'POST',
	body: JSON.stringify({
		frequency: 'daily',
		time_of_day: '09:00:00',
		timezone: 'America/New_York',
		is_active: true
		// Note: email_daily_brief removed
	})
});
```

#### Updating Daily Brief Notification Preferences

```typescript
// Update HOW users are notified about briefs
const response = await fetch('/api/notification-preferences?daily_brief=true', {
	method: 'POST',
	body: JSON.stringify({
		should_email_daily_brief: true,
		should_sms_daily_brief: false
	})
});

const result = await response.json();
if (!result.success) {
	// Handle phone verification requirement for SMS
	if (result.error === 'phone_verification_required') {
		console.log('Please verify your phone number first');
	}
}
```

#### Getting Daily Brief Notification Preferences

```typescript
const response = await fetch('/api/notification-preferences?daily_brief=true');
const prefs = await response.json();

console.log('Email notifications:', prefs.should_email_daily_brief);
console.log('SMS notifications:', prefs.should_sms_daily_brief);
```

### Worker Behavior

#### Brief Generation Worker

After successfully generating a brief, the worker checks notification preferences:

```typescript
// Query user-level notification preferences
const { data: notificationPrefs } = await supabase
	.from('user_notification_preferences')
	.select('should_email_daily_brief, should_sms_daily_brief')
	.eq('user_id', userId)
	.eq('event_type', 'user') // IMPORTANT: Filter by event_type
	.single();

// Send email if enabled
if (notificationPrefs?.should_email_daily_brief) {
	// Create email record and queue job
}

// Send SMS if enabled AND phone verified
if (notificationPrefs?.should_sms_daily_brief) {
	// Check phone verification
	// Queue SMS notification if verified
}
```

**Critical:** All worker queries must include `.eq("event_type", "user")` to avoid conflicts with event-based preference rows.

### Benefits

- **Clear Separation:** Generation timing and notification delivery are independent
- **Flexible Notifications:** Users can choose email, SMS, or both for daily briefs
- **SMS Support:** Infrastructure ready for SMS notifications with phone verification
- **No Breaking Changes:** Old column preserved for safe rollback
- **Future-Proof:** Architecture supports additional user-level notification preferences
- **Type-Safe:** Full TypeScript support across entire stack

### Related Documentation

- **Implementation Plan:** `/thoughts/shared/research/2025-10-13_06-00-00_daily-brief-notification-refactor-plan.md`
- **Phase 3 Implementation:** `/apps/web/docs/features/notifications/implementation/NOTIFICATION_PHASE3_IMPLEMENTATION.md`
- **Notification Preferences API:** See [notification-preferences.md](./notification-preferences.md) (if exists)

---

## Related Documentation

- **Daily Brief Types:** `/apps/web/src/lib/types/daily-brief.ts`
- **Template Types:** `/apps/web/src/lib/types/project-brief-template.ts`
- **Services:** `/apps/web/src/lib/services/dailyBrief/`
- **Database Schema:** `/apps/web/src/lib/database.schema.ts`
