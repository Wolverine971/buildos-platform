# Brain Dumps API Endpoints

This document provides comprehensive documentation for all Brain Dump API endpoints in the BuildOS platform.

## Overview

The Brain Dumps API provides 9 endpoints for managing brain dump records, from initialization and draft management to processing, generation, and streaming. All endpoints require authentication via Supabase session.

**Base Path:** `/api/braindumps`

---

## Endpoints

### 1. `GET /api/braindumps` - List & Filter Brain Dumps

**Purpose:** Retrieve filtered list of brain dumps with enriched data

**File:** `/apps/web/src/routes/api/braindumps/+server.ts`

**Authentication:** Required

#### Query Parameters

| Parameter | Type   | Required | Default | Description                                    |
| --------- | ------ | -------- | ------- | ---------------------------------------------- |
| `search`  | string | No       | -       | Search across `title`, `content`, `ai_summary` |
| `year`    | string | No       | -       | Filter by year (format: `YYYY`)                |
| `day`     | string | No       | -       | Filter by specific day (format: `YYYY-MM-DD`)  |
| `limit`   | number | No       | 50      | Number of results (max: 100)                   |
| `offset`  | number | No       | 0       | Pagination offset                              |

#### Response

```typescript
{
  success: true,
  data: {
    braindumps: EnrichedBraindump[],
    total: number,
    hasMore: boolean
  }
}
```

#### EnrichedBraindump Type

```typescript
interface EnrichedBraindump extends BrainDump {
	brain_dump_links: Array<{
		id: string;
		brain_dump_id: string;
		project_id?: string;
		task_id?: string;
		note_id?: string;
		projects?: { id; name; slug; created_at };
		tasks?: { id; title; status };
		notes?: { id; title };
	}>;
	isNote: boolean; // True if unlinked (no project_id)
	isNewProject: boolean; // True if project created within 5 min
	linkedProject: {
		id;
		name;
		slug;
		description;
		created_at;
	} | null;
	linkedTypes: ('project' | 'task' | 'note')[];
}
```

#### Key Features

- **Performance optimized** with batch queries to avoid N+1 problems
- **Smart project detection**: Marks projects as "new" if created within 5 minutes of brain dump
- **Full-text search** across title, content, and AI summary
- **Date filtering** with timezone-aware range queries
- **Pagination** with `hasMore` hint for infinite scroll

#### Example

```bash
GET /api/braindumps?search=project&year=2025&limit=20&offset=0
```

---

### 2. `GET /api/braindumps/[id]` - Get Single Brain Dump

**Purpose:** Retrieve single brain dump with all linked entities and metadata

**File:** `/apps/web/src/routes/api/braindumps/[id]/+server.ts`

**Authentication:** Required

#### Path Parameters

| Parameter | Type          | Required | Description   |
| --------- | ------------- | -------- | ------------- |
| `id`      | string (UUID) | Yes      | Brain dump ID |

#### Response

```typescript
{
  success: true,
  data: {
    braindump: BrainDump,
    linkedData: {
      projects: Project[],
      tasks: Task[],
      notes: Note[]
    },
    metadata: {
      wordCount: number,
      characterCount: number,
      linkCount: number
    }
  }
}
```

#### Key Features

- Fetches brain dump with all linked entities in one query
- Calculates word count, character count, and link count
- Validates ownership (user_id check)

---

### 3. `PATCH /api/braindumps/[id]` - Update Brain Dump

**Purpose:** Update brain dump fields

**File:** `/apps/web/src/routes/api/braindumps/[id]/+server.ts`

**Authentication:** Required

#### Request Body

```typescript
{
  title?: string;
  content?: string;
  tags?: string[];
  status?: 'pending' | 'parsed' | 'saved' | 'parsed_and_deleted';
}
```

#### Response

```typescript
{
  success: true,
  data: {
    braindump: BrainDump
  }
}
```

#### Key Features

- Automatically updates `updated_at` timestamp
- Validates ownership before update

---

### 4. `DELETE /api/braindumps/[id]` - Delete Brain Dump

**Purpose:** Delete brain dump with cascading cleanup

**File:** `/apps/web/src/routes/api/braindumps/[id]/+server.ts`

**Authentication:** Required

#### Response

```typescript
{
  success: true,
  data: {
    success: true,
    deleted: {
      braindump_id: string,
      title: string,
      links_cleared: number,
      questions_affected: number
    }
  }
}
```

#### Key Features

- **Cascading cleanup**: Deletes `brain_dump_links` and clears `project_questions.answer_brain_dump_id` references
- **Audit trail**: Logs deletion to `user_activity` table with metadata
- **Ownership validation**: Ensures user owns the brain dump
- **Non-blocking activity log**: Uses `.then()` to avoid blocking deletion

---

### 5. `PATCH /api/braindumps/[id]/link` - Link to Project

**Purpose:** Link brain dump to a project

**File:** `/apps/web/src/routes/api/braindumps/[id]/link/+server.ts`

**Authentication:** Required

#### Request Body

```typescript
{
	project_id: string; // Required - UUID of target project
}
```

#### Response

```typescript
{
  success: true,
  data: {
    braindump: BrainDump,
    project: {
      id: string,
      name: string
    },
    message: string
  }
}
```

#### Key Features

- **Parallel ownership verification**: Validates both brain dump and project ownership simultaneously
- **Duplicate check**: Prevents linking if already linked to target project
- **Activity logging**: Uses `ActivityLogger` for audit trail
- **Cascading link updates**: Updates related `brain_dump_links` with project_id

#### Error Cases

- `400` - Project ID missing or already linked
- `403` - User doesn't own brain dump or project
- `404` - Brain dump or project not found

---

### 6. `DELETE /api/braindumps/[id]/link` - Unlink from Project

**Purpose:** Remove project association from brain dump

**File:** `/apps/web/src/routes/api/braindumps/[id]/link/+server.ts`

**Authentication:** Required

#### Response

```typescript
{
  success: true,
  data: {
    braindump: BrainDump,
    message: "Braindump unlinked from project"
  }
}
```

#### Key Features

- Sets `project_id` to `null`
- Logs unlinking activity
- Validates brain dump is currently linked

---

### 7. `GET /api/braindumps/contribution-data` - GitHub-style Activity

**Purpose:** Get contribution calendar data (GitHub-style heatmap)

**File:** `/apps/web/src/routes/api/braindumps/contribution-data/+server.ts`

**Authentication:** Required

#### Query Parameters

| Parameter | Type   | Required | Default      | Description                          |
| --------- | ------ | -------- | ------------ | ------------------------------------ |
| `year`    | number | No       | Current year | Year to fetch (format: `YYYY`)       |
| `search`  | string | No       | -            | Filter contributions by search query |

#### Response

```typescript
{
  success: true,
  data: {
    contributions: Array<{
      date: string,        // YYYY-MM-DD
      count: number,
      level: number        // 0-4 (like GitHub)
    }>,
    stats: {
      year: number,
      totalBraindumps: number,
      daysWithActivity: number,
      maxDailyCount: number,
      avgDailyCount: number,
      firstBraindumpDate: string,
      searchQuery?: string
    }
  }
}
```

#### Contribution Levels

- **Level 0**: 0 brain dumps
- **Level 1**: 1 brain dump
- **Level 2**: 2-3 brain dumps
- **Level 3**: 4-6 brain dumps
- **Level 4**: 7+ brain dumps

#### Key Features

- **Full year data**: Initializes all 365 days to zero
- **Search integration**: Can filter contributions by content search
- **Historical context**: Includes first brain dump date for account age
- **GitHub-style visualization data**: Compatible with activity heatmaps

---

### 8. `GET /api/braindumps/draft` - Get Draft

**Purpose:** Retrieve draft brain dump

**File:** `/apps/web/src/routes/api/braindumps/draft/+server.ts`

**Authentication:** Required

#### Query Parameters

| Parameter            | Type   | Required | Description                                         |
| -------------------- | ------ | -------- | --------------------------------------------------- |
| `projectId`          | string | No       | Filter by project (use `"new"` for unlinked drafts) |
| `excludeBrainDumpId` | string | No       | Exclude specific brain dump ID                      |

#### Response

```typescript
{
  success: true,
  data: {
    brainDump: BrainDump | null,
    parseResults?: {
      operations: ParsedOperation[],
      // ... other parse result fields
    } | null
  }
}
```

#### Key Features

- **Project-scoped drafts**: Returns most recent draft for specific project
- **Parse results recovery**: Extracts stored parse results from `parsed_results` field
- **Validation**: Checks parse results structure and sets to null if corrupted
- **Status filtering**: Only returns `pending` or `parsed` status brain dumps

---

### 9. `POST /api/braindumps/draft` - Create/Update Draft

**Purpose:** Create or update draft brain dump

**File:** `/apps/web/src/routes/api/braindumps/draft/+server.ts`

**Authentication:** Required

#### Request Body

```typescript
{
  content: string,              // Required
  brainDumpId?: string,         // Optional - for updates
  selectedProjectId?: string,   // Optional - project to link
  forceNew?: boolean           // Optional - force new draft
}
```

#### Response

```typescript
{
  success: true,
  data: {
    brainDumpId: string
  }
}
```

#### Key Features

- **Auto-save logic**: Reuses existing draft or creates new
- **Force new**: Can bypass draft reuse with `forceNew` flag
- **Status preservation**: Doesn't change status to `pending` if already `saved`
- **Activity logging**: Non-blocking log to `user_activity_logs`
- **Smart defaults**: Auto-generates title with date

#### Validation

- Content required and must be non-empty string

---

### 10. `PATCH /api/braindumps/draft` - Update Draft Project

**Purpose:** Update draft's project association

**File:** `/apps/web/src/routes/api/braindumps/draft/+server.ts`

**Authentication:** Required

#### Request Body

```typescript
{
  brainDumpId: string,  // Required
  projectId?: string    // Optional - null to unlink
}
```

#### Response

```typescript
{
  success: true,
  data: {
    success: true
  }
}
```

#### Key Features

- Updates `project_id` only
- Logs project change activity

---

### 11. `PATCH /api/braindumps/draft/status` - Update Status

**Purpose:** Update draft status with validation

**File:** `/apps/web/src/routes/api/braindumps/draft/status/+server.ts`

**Authentication:** Required

#### Request Body

```typescript
{
  brainDumpId: string,
  status: 'pending' | 'parsed' | 'saved' | 'parsed_and_deleted'
}
```

#### Response

```typescript
{
  success: true,
  data: {
    success: true,
    previousStatus: string,
    newStatus: string
  }
}
```

#### Valid Status Transitions

| From State           | Allowed To States                              |
| -------------------- | ---------------------------------------------- |
| `pending`            | `parsed`, `parsed_and_deleted`                 |
| `parsed`             | `saved`, `pending` (revert for corrupted data) |
| `saved`              | None (terminal state)                          |
| `parsed_and_deleted` | None (terminal state)                          |

#### Key Features

- **State machine validation**: Enforces valid status transitions
- **Data cleanup on revert**: Clears `ai_insights` and `ai_summary` when reverting to `pending`
- **Activity logging**: Logs status changes with reason

---

### 12. `POST /api/braindumps/generate` - Parse or Save

**Purpose:** Main processing endpoint with two actions: `parse` and `save`

**File:** `/apps/web/src/routes/api/braindumps/generate/+server.ts`

**Authentication:** Required

#### Action: `parse` - AI Processing

**Request Body:**

```typescript
{
  action: "parse",
  text: string,
  selectedProjectId?: string,
  displayedQuestions?: DisplayedBrainDumpQuestion[],
  brainDumpId?: string,
  options?: {
    autoExecute?: boolean,
    streamResults?: boolean,
    useDualProcessing?: boolean,
    retryAttempts?: number  // Default: 3
  }
}
```

**Response:**

```typescript
{
  success: true,
  data: {
    title: string,
    summary: string,
    insights: string,
    operations: ParsedOperation[],
    tags?: string[],
    metadata: BrainDumpMetadata,
    brainDumpId: string,
    executionResult?: ExecutionResult  // If autoExecute=true
  }
}
```

**Key Features:**

- **Auto-creates brain dump**: Creates new record if `brainDumpId` not provided
- **LLM retry logic**: Configurable retry attempts (default: 3)
- **Processing timeout**: Wrapped with timeout handling
- **Error logging**: Comprehensive LLM error tracking
- **Parse result validation**: Validates structure before storing
- **Status update**: Sets to `saved` if auto-executed, otherwise `parsed`
- **Processor caching**: Uses WeakRef-based cache for performance

#### Action: `save` - Execute Operations

**Request Body:**

```typescript
{
  action: "save",
  operations: ParsedOperation[],  // Required - max 50
  brainDumpId: string,
  selectedProjectId?: string,
  title?: string,
  summary?: string,
  insights?: string,
  originalText?: string,
  projectQuestions?: Array<{...}>
}
```

**Response:**

```typescript
{
  success: true,
  data: {
    totalOperations: number,
    successfulOperations: number,
    failedOperations: number,
    brainDumpId: string,
    projectInfo?: {
      id: string,
      name: string,
      isNew: boolean
    },
    results: Array<{
      table: string,
      operation: string,
      id?: string,
      error?: string,
      operationType: 'create' | 'update'
    }>,
    executionSummary: {
      createdRecords: number,
      updatedRecords: number,
      failedValidations: number,
      referenceErrors: number
    }
  }
}
```

**Key Features:**

- **Operation validation**: Max 50 operations
- **Status validation**: Brain dump must exist and be in correct state
- **Project detection**: Detects if new project was created
- **Metadata storage**: Stores execution summary in `metaData` field
- **Error resilience**: Continues even if status update fails
- **Detailed response**: Returns both successful and failed operations

---

### 13. `GET /api/braindumps/init` - Initialize Modal

**Purpose:** Load initialization data for brain dump modal

**File:** `/apps/web/src/routes/api/braindumps/init/+server.ts`

**Authentication:** Required

#### Query Parameters

| Parameter            | Type   | Required | Description                                                |
| -------------------- | ------ | -------- | ---------------------------------------------------------- |
| `projectId`          | string | No       | Load draft for specific project (use `"new"` for unlinked) |
| `excludeBrainDumpId` | string | No       | Exclude specific brain dump from current draft             |

#### Response

```typescript
{
  success: true,
  data: {
    projects: Array<{
      id, name, slug, description, created_at, updated_at,
      taskCount: number,
      noteCount: number,
      draftCount: number
    }>,
    recentBrainDumps: Array<{
      id, content, created_at, ai_summary, ai_insights,
      status, project_id, title
    }>,
    newProjectDraftCount: number,
    currentDraft: {
      brainDump: BrainDump,
      parseResults?: {
        operations: ParsedOperation[],
        // ... other fields
      }
    } | null
  }
}
```

#### Key Features

- **Parallel data loading**: Fetches all data simultaneously
- **Project enrichment**: Adds task/note/draft counts
- **Recent context**: Last 5 completed brain dumps
- **Draft recovery**: Loads current draft with parse results if available
- **Parse result validation**: Ensures structure is valid
- **Smart filtering**: Can exclude specific brain dumps

#### Performance Optimizations

- Uses `Promise.all()` for parallel queries
- Limits projects to 20 most recent
- Limits recent brain dumps to 5

---

### 14. `POST /api/braindumps/stream` - Streaming Processing

**Purpose:** Stream brain dump processing with Server-Sent Events

**File:** `/apps/web/src/routes/api/braindumps/stream/+server.ts`

**Authentication:** Required

#### Request Body

```typescript
{
  content: string,                        // Required - max 50KB
  selectedProjectId?: string,
  brainDumpId?: string,
  displayedQuestions?: DisplayedBrainDumpQuestion[],
  autoAccept?: boolean,
  options?: BrainDumpOptions
}
```

#### Response Type

**Server-Sent Events (SSE)** stream with `Content-Type: text/event-stream`

#### SSE Message Types

##### 1. SSEStatus - Initial Status

```typescript
{
  type: "status",
  message: string,
  data: {
    processes: ('analysis' | 'context' | 'tasks')[],
    contentLength: number,
    isDualProcessing?: boolean,
    isShortBraindump?: boolean,
    source?: string
  }
}
```

##### 2. SSEAnalysis - Preparatory Analysis

```typescript
{
  type: "analysis",
  message: string,
  data: {
    status: 'pending' | 'processing' | 'completed' | 'failed',
    result?: PreparatoryAnalysisResult,
    error?: string
  }
}
```

##### 3. SSEContextProgress - Context Extraction

```typescript
{
  type: "contextProgress",
  message: string,
  data: {
    status: 'pending' | 'processing' | 'completed' | 'failed',
    preview?: ProjectContextResult,
    error?: string
  }
}
```

##### 4. SSETasksProgress - Task Extraction

```typescript
{
  type: "tasksProgress",
  message: string,
  data: {
    status: 'pending' | 'processing' | 'completed' | 'failed',
    preview?: TaskNoteExtractionResult,
    error?: string
  }
}
```

##### 5. SSERetry - Retry Attempt

```typescript
{
  type: "retry",
  message: string,
  attempt: number,
  maxAttempts: number,
  processName: string
}
```

##### 6. SSEComplete - Processing Complete

```typescript
{
  type: "complete",
  message: string,
  result: BrainDumpParseResult & {
    executionResult?: ExecutionResult,
    projectInfo?: {
      id, name, slug, isNew
    }
  }
}
```

##### 7. SSEError - Error Occurred

```typescript
{
  type: "error",
  message: string,
  error: string,
  context?: 'context' | 'tasks' | 'general',
  recoverable?: boolean
}
```

#### Key Features

##### Dual Processing Architecture

- **Stage 1 (Analysis)**: Lightweight analysis for existing projects
- **Stage 2 (Context)**: Extract project context and updates
- **Stage 3 (Tasks)**: Extract tasks and notes

##### Auto-Accept Flow

When `autoAccept=true`:

1. Execute all operations after parsing
2. Fetch created/updated project info
3. Update brain dump status to `saved`
4. Include execution results in completion message

##### Background Processing

- Processing happens in background
- Immediate SSE response return
- Stream remains open during processing

##### Status Updates

- **Parsed state**: Updates to `parsed` after processing
- **Saved state**: Updates to `saved` if auto-accepted
- **Metadata storage**: Stores execution summary in `metaData` field

---

## Common Types

### BrainDump

```typescript
interface BrainDump {
	id: string;
	user_id: string;
	title: string;
	content: string;
	project_id?: string;
	status: 'pending' | 'parsed' | 'saved' | 'parsed_and_deleted';
	ai_summary?: string;
	ai_insights?: string;
	parsed_results?: any;
	tags?: string[];
	created_at: string;
	updated_at: string;
}
```

### ParsedOperation

```typescript
interface ParsedOperation {
	table: 'projects' | 'tasks' | 'notes' | 'phases';
	operation: 'create' | 'update';
	data: Record<string, any>;
	id?: string; // For updates
}
```

---

## Authentication

All endpoints use Supabase session authentication:

```typescript
const { user } = await safeGetSession();
if (!user) {
	return ApiResponse.unauthorized();
}
```

---

## Error Handling

### Common Error Responses

| Scenario              | Status | Code            | Response                        |
| --------------------- | ------ | --------------- | ------------------------------- |
| Not authenticated     | 401    | UNAUTHORIZED    | `ApiResponse.unauthorized()`    |
| Not owner of resource | 403    | FORBIDDEN       | `ApiResponse.forbidden()`       |
| Resource not found    | 404    | NOT_FOUND       | `ApiResponse.notFound()`        |
| Invalid input         | 400    | INVALID_REQUEST | `ApiResponse.badRequest()`      |
| Validation failed     | 422    | INVALID_FIELD   | `ApiResponse.validationError()` |

---

## Performance Optimizations

### 1. Batch Queries (List Endpoint)

- Fetches all brain dumps in one query
- Batch fetches all links for all brain dumps
- Batch fetches all projects
- Groups data by ID for O(1) lookups
- **Avoids N+1 queries**

### 2. Processor Caching (Generate Endpoint)

- WeakRef-based cache for automatic GC
- 5-minute TTL
- LRU eviction when cache full
- Periodic cleanup (60s interval)

### 3. Parallel Data Loading (Init Endpoint)

- Uses `Promise.all()` for simultaneous queries
- Loads projects, brain dumps, drafts, and counts in parallel

### 4. Pagination (List Endpoint)

- Configurable limit (max 100)
- Offset-based pagination
- `hasMore` hint for client-side infinite scroll

---

## Related Documentation

- **Types:** `/apps/web/src/lib/types/brain-dump.ts`
- **SSE Types:** `/apps/web/src/lib/types/sse-messages.ts`
- **Validation:** `/apps/web/src/lib/utils/operations/validation-schemas.ts`
- **API Utils:** `/apps/web/src/lib/utils/api-response.ts`
- **Processor:** `/apps/web/src/lib/utils/braindump-processor.ts`
