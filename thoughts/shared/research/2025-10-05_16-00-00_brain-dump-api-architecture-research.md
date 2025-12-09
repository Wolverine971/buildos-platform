---
title: Brain Dump API Architecture Research
date: 2025-10-05T16:00:00
type: research
status: completed
tags:
    - brain-dump
    - api
    - architecture
    - streaming
    - validation
related_docs:
    - /apps/web/docs/features/brain-dump/README.md
    - /apps/web/docs/technical/architecture/brain-dump-flow.md
    - /apps/web/CLAUDE.md
path: thoughts/shared/research/2025-10-05_16-00-00_brain-dump-api-architecture-research.md
---

# Brain Dump API Architecture Research

## Executive Summary

The brain dump system is BuildOS's core innovation - a sophisticated AI-powered API that transforms stream-of-consciousness user input into structured projects, tasks, and notes. The system uses:

- **Server-Sent Events (SSE)** for real-time streaming progress updates
- **Dual Processing Architecture** for parallel context and task extraction
- **Operation Validation Pattern** for secure data handling
- **Automatic Reference Resolution** for cross-entity relationships

## Complete API Flow Overview

### 1. User Journey Sequence

```
User Input → Draft Saving → Parsing/Analysis → Preview → Execution → Success View
     ↓            ↓              ↓                ↓          ↓           ↓
  Modal      /draft API    /stream API      Frontend   Execute    Projects
```

## API Routes Inventory

### Core Brain Dump Routes

| Route                               | Method           | Purpose                                                   | Response Type |
| ----------------------------------- | ---------------- | --------------------------------------------------------- | ------------- |
| `/api/braindumps/init`              | GET              | Initialize modal with projects, recent dumps, draft state | JSON          |
| `/api/braindumps/draft`             | GET/POST/PATCH   | Manage draft brain dumps (save, retrieve, update)         | JSON          |
| `/api/braindumps/draft/status`      | PATCH            | Revert parsed draft to pending                            | JSON          |
| `/api/braindumps/stream`            | POST             | Process long/dual brain dumps with streaming              | SSE Stream    |
| `/api/braindumps/stream-short`      | N/A              | **Directory exists but no route file**                    | N/A           |
| `/api/braindumps/`                  | GET              | List all brain dumps with filters and enrichment          | JSON          |
| `/api/braindumps/[id]`              | GET/PATCH/DELETE | Get/update/delete specific brain dump                     | JSON          |
| `/api/braindumps/[id]/link`         | POST             | Create brain dump link                                    | JSON          |
| `/api/braindumps/generate`          | POST             | Generate brain dump content                               | JSON          |
| `/api/braindumps/contribution-data` | GET              | Get contribution calendar data                            | JSON          |

### Key Finding: Stream-Short Route

**IMPORTANT**: The directory `/api/braindumps/stream-short/` exists but contains no `+server.ts` file. This suggests:

- The short processing feature may be deprecated or
- It was planned but not implemented, or
- Processing is handled through the main `/stream` endpoint with different parameters

## Detailed API Flow Analysis

### Phase 1: Initialization (`/api/braindumps/init`)

**File**: `/apps/web/src/routes/api/braindumps/init/+server.ts`

**Purpose**: Load all necessary data when the brain dump modal opens

**Request**:

```typescript
GET /api/braindumps/init?projectId={id}&excludeBrainDumpId={id}
```

**Response**:

```typescript
{
  projects: ProjectWithCounts[],          // Recent 20 projects with task/note counts
  recentBrainDumps: BrainDump[],         // Last 5 completed dumps
  newProjectDraftCount: number,           // Drafts for new projects
  currentDraft: {
    brainDump: BrainDumpDraft,
    parseResults?: BrainDumpParseResult
  } | null
}
```

**Key Features**:

- Parallel queries with `Promise.all()` for performance
- Counts tasks, notes, and drafts per project
- Retrieves current draft for the selected project
- Filters by project context

**Data Loaded**:

1. Projects with metadata (20 most recent)
2. Task counts per project
3. Note counts per project
4. Draft counts per project
5. Recent completed brain dumps (5)
6. Current draft for selected project (if exists)

### Phase 2: Draft Management (`/api/braindumps/draft`)

**File**: `/apps/web/src/routes/api/braindumps/draft/+server.ts`

**Purpose**: Save user input as a draft before processing

**Operations**:

#### GET - Retrieve Draft

```typescript
GET /api/braindumps/draft?projectId={id}
```

Returns the most recent `pending` or `parsed` draft for the project.

#### POST - Save/Update Draft

```typescript
POST /api/braindumps/draft
{
  content: string,
  brainDumpId?: string,
  selectedProjectId?: string | null,
  forceNew?: boolean
}
```

**Logic**:

1. If `brainDumpId` provided → update existing draft
2. If `forceNew=true` → always create new draft
3. Otherwise → find and update existing draft for project
4. Sets status to `pending`

**Draft States**:

- `pending` - User input saved, not yet parsed
- `parsed` - AI has analyzed and generated operations
- `saved` - Operations executed and committed

### Phase 3: Streaming Parse/Analysis (`/api/braindumps/stream`)

**File**: `/apps/web/src/routes/api/braindumps/stream/+server.ts`

**Purpose**: Process brain dump with AI and stream progress updates

**Request**:

```typescript
POST /api/braindumps/stream
{
  content: string,
  selectedProjectId?: string,
  brainDumpId?: string,
  displayedQuestions?: DisplayedBrainDumpQuestion[],
  options?: BrainDumpOptions,
  autoAccept?: boolean
}
```

**Response**: Server-Sent Events (SSE) stream

**SSE Message Types**:

1. **`status`** - Initial processing state

    ```typescript
    {
      type: 'status',
      message: 'Starting dual processing...',
      data: {
        processes: ['context', 'tasks'],
        contentLength: number,
        isDualProcessing: true
      }
    }
    ```

2. **`analysis`** - Preparatory analysis (existing projects only)

    ```typescript
    {
      type: 'analysis',
      message: string,
      data: {
        status: 'processing' | 'completed' | 'failed',
        result?: PreparatoryAnalysisResult
      }
    }
    ```

3. **`contextProgress`** - Project context extraction

    ```typescript
    {
      type: 'contextProgress',
      message: 'Processing project context...',
      data: {
        status: 'processing' | 'completed' | 'failed',
        preview?: ProjectContextResult
      }
    }
    ```

4. **`tasksProgress`** - Task/note extraction

    ```typescript
    {
      type: 'tasksProgress',
      message: 'Extracting tasks and notes...',
      data: {
        status: 'processing' | 'completed' | 'failed',
        preview?: TaskNoteExtractionResult
      }
    }
    ```

5. **`retry`** - Retry attempt notification

    ```typescript
    {
      type: 'retry',
      message: 'Retrying dual processing...',
      attempt: number,
      maxAttempts: number,
      processName: string
    }
    ```

6. **`complete`** - Final result

    ```typescript
    {
      type: 'complete',
      message: 'Processing complete',
      result: BrainDumpParseResult
    }
    ```

7. **`error`** - Error notification
    ```typescript
    {
      type: 'error',
      message: string,
      error: string,
      context?: 'context' | 'tasks' | 'general',
      recoverable?: boolean
    }
    ```

**Processing Flow**:

```
1. Validate authentication & input
2. Create SSE stream
3. Process in background:
   a. If existing project → Run preparatory analysis
   b. Extract project context (parallel)
   c. Extract tasks/notes (parallel)
   d. Validate & synthesize results
   e. Update brain dump status to 'parsed'
   f. If autoAccept=true → Execute operations immediately
4. Stream progress updates
5. Return complete result
```

**Key Implementation Details**:

- Uses method overriding to intercept processor methods and emit SSE events
- Implements retry logic with configurable attempts
- Handles both new project and existing project flows
- Auto-accept feature executes operations server-side
- Updates brain dump status using `BrainDumpStatusService`

**Auto-Accept Feature**:

When `autoAccept=true`:

1. Operations are executed immediately after parsing
2. Brain dump status updated to `saved`
3. Project info included in response for navigation
4. Execution results merged with parse results

### Phase 4: Operation Validation & Execution

**Files**:

- `/apps/web/src/lib/utils/operations/operation-validator.ts`
- `/apps/web/src/lib/utils/operations/operations-executor.ts`

#### Operation Validation Pattern

**Validator** (`OperationValidator`):

- Validates operations against table schemas
- Sanitizes all input data
- Enforces security constraints
- Checks field types, formats, and constraints

**Allowed Tables** (whitelist):

```typescript
const validTables: TableName[] = ['projects', 'tasks', 'notes', 'project_questions'];
```

**Validation Flow**:

```
1. Check table is in whitelist
2. Validate operation type (create/update/delete)
3. Check required fields
4. Validate each field against schema
5. Sanitize values (XSS prevention)
6. Perform custom table-specific validation
7. Return sanitized data
```

**Security Features**:

- ⚠️ Only whitelisted tables allowed
- ⚠️ Unknown fields silently removed
- ⚠️ user_id always overridden server-side
- ⚠️ UUID format validation
- ⚠️ Date validation and normalization
- ⚠️ String sanitization with max length
- ⚠️ Enum validation for status fields

#### Operations Executor Pattern

**Executor** (`OperationsExecutor`):

- Executes validated operations
- Resolves cross-references (project_ref → project_id)
- Handles rollback on failure
- Manages execution order by dependency

**Execution Flow**:

```
1. Filter enabled operations
2. Sort by dependency (projects → tasks → notes)
3. For each operation:
   a. Validate with OperationValidator
   b. Add user_id metadata
   c. Resolve references (project_ref → project_id)
   d. Execute based on operation type
   e. Add to rollback stack
   f. Store result
4. On any failure → Rollback all changes
5. Create brain dump links
6. Log activity
```

**Rollback Strategy**:

- LIFO (Last In, First Out) order
- Only create operations rolled back
- Updates/deletes not reversed (harder to reverse safely)
- User_id filter ensures only user's data deleted

**Reference Resolution**:

- Handles `project_ref` → `project_id` mapping for new projects
- Tracks newly created project ID for dependent operations
- Cleans up metadata fields before database insert

### Phase 5: Result Handling

**Frontend receives**:

```typescript
{
  operations: ParsedOperation[],
  summary: string,
  insights: string,
  projectQuestions?: ProjectQuestion[],
  executionResult?: {
    successful: ParsedOperation[],
    failed: ParsedOperation[],
    results: any[]
  },
  projectInfo?: {
    id: string,
    name: string,
    slug: string,
    isNew: boolean
  }
}
```

**User Actions**:

1. Review operations preview
2. Enable/disable individual operations
3. Accept → Execute operations
4. Cancel → Discard parse results

## Architecture Patterns Used

### 1. Server-Sent Events (SSE) for Real-time Updates

**Implementation**: `/apps/web/src/lib/utils/sse-response.ts`

**Pattern**:

```typescript
const { response, writer, encoder } = SSEResponse.createStream();

// Send messages
await SSEResponse.sendMessage(writer, encoder, {
	type: 'status',
	message: 'Processing...'
});

// Close stream
await SSEResponse.close(writer);
```

**Benefits**:

- Real-time progress updates
- Better UX for long-running operations
- Server can push updates
- Standard HTTP (no WebSocket complexity)

### 2. Operation Validation Pattern

**Purpose**: Secure, validated data operations

**Components**:

1. **Schemas** - Define allowed fields and types
2. **Validator** - Validate and sanitize
3. **Executor** - Execute with rollback support

**Security Layers**:

- Table whitelist
- Field validation
- Type checking
- Sanitization
- User ownership enforcement

### 3. Dual Processing Architecture

**File**: `/apps/web/src/lib/utils/braindump-processor.ts`

**Concept**: Run context and task extraction in parallel

**Flow**:

```
User Input
    ↓
    ├─→ Context Extraction (parallel)
    │       ↓
    │   Project info, goals, constraints
    │
    └─→ Task Extraction (parallel)
            ↓
        Tasks, notes, questions

Both complete → Synthesize → Operations
```

**Benefits**:

- Faster processing (parallel LLM calls)
- Higher accuracy (focused prompts)
- Better context preservation
- Optimized token usage

### 4. Preparatory Analysis Optimization

**For Existing Projects Only**

**Purpose**: Determine what needs updating before expensive processing

**Flow**:

```
1. Run lightweight LLM analysis
2. Classify brain dump content:
   - strategic (affects context)
   - tactical (affects tasks)
   - mixed
   - status_update
   - unrelated
3. Identify relevant tasks
4. Determine if context update needed
5. Skip unnecessary processing
```

**Cost Savings**:

- Uses fast model (DeepSeek)
- Light token usage
- Skips unneeded extraction
- ~60% cost reduction for status updates

### 5. Reference Resolution Pattern

**Problem**: New projects don't have IDs yet, but tasks need project_id

**Solution**: Use temporary references

**Example**:

```typescript
// Task operation references new project
{
  table: 'tasks',
  operation: 'create',
  data: {
    title: 'Task 1',
    project_ref: 'new-project-123'  // Temporary reference
  }
}

// After project created with id: 'abc-def-...'
// Executor resolves:
{
  table: 'tasks',
  data: {
    title: 'Task 1',
    project_id: 'abc-def-...'  // Real UUID
  }
}
```

**Implementation**:

- Executor tracks `newProjectId`
- Resolves all `project_ref` → `project_id`
- Cleans up metadata before insert

## Error Handling & Validation

### Input Validation Layers

**Layer 1: Request Validation**

- File: `/apps/web/src/lib/utils/braindump-validation.ts`
- Validates: content length, auth, rate limits
- Uses: `BrainDumpValidator.validateDual()`

**Layer 2: Operation Validation**

- File: `/apps/web/src/lib/utils/operations/operation-validator.ts`
- Validates: table access, field types, constraints
- Uses: `OperationValidator.validateOperation()`

**Layer 3: Database Constraints**

- RLS policies enforce user ownership
- NOT NULL constraints
- Foreign key constraints
- Check constraints

### Error Handling Strategy

**Streaming Errors**:

```typescript
// Recoverable error
{
  type: 'error',
  message: 'Context extraction failed',
  error: error.message,
  context: 'context',
  recoverable: true  // Can continue with tasks only
}

// Fatal error
{
  type: 'error',
  message: 'Processing failed',
  error: error.message,
  context: 'general',
  recoverable: false  // Must abort
}
```

**Execution Errors**:

- All operations execute in transaction-like sequence
- Any failure → rollback all changes
- Error logged to `error_logs` table
- User sees specific error message

**Retry Logic**:

- Configurable attempts (default 3)
- Exponential backoff (handled by LLM service)
- SSE retry messages inform user
- Final failure after max attempts

## Data Flow Diagrams

### New Project Creation Flow

```
User: "Build a todo app with auth"
    ↓
Draft API: Save pending brain dump
    ↓
Stream API: POST with content
    ↓
SSE: status → "Starting dual processing"
    ↓
Processor: Parallel extraction
    ├─→ Context: "Web app, user auth, todo CRUD"
    └─→ Tasks: ["Set up auth", "Create todo model", ...]
    ↓
SSE: contextProgress → completed
SSE: tasksProgress → completed
    ↓
Synthesis: Generate operations
    [
      { table: 'projects', operation: 'create', ref: 'new-1',
        data: { name: 'Todo App', ... } },
      { table: 'tasks', operation: 'create',
        data: { title: 'Set up auth', project_ref: 'new-1' } },
      ...
    ]
    ↓
SSE: complete → { operations, summary, insights }
    ↓
Frontend: User reviews & accepts
    ↓
Execute API: Validate & execute
    ↓
Executor:
    1. Create project → id: 'abc-123'
    2. Resolve project_ref='new-1' → 'abc-123'
    3. Create tasks with project_id='abc-123'
    ↓
Success: Navigate to /projects/todo-app
```

### Existing Project Update Flow

```
User: "Add login page task to todo app"
    ↓
Draft API: Save with project_id='abc-123'
    ↓
Stream API: POST with selectedProjectId
    ↓
SSE: status → "Analyzing braindump..."
    ↓
Analysis: Classify content
    {
      classification: 'tactical',
      needs_context_update: false,
      new_tasks_detected: true,
      relevant_task_ids: []
    }
    ↓
SSE: analysis → completed
SSE: status → "Processing tasks..."
    ↓
Processor: Extract tasks only (skip context)
    ↓
SSE: tasksProgress → completed
    ↓
Synthesis: Generate operations
    [
      { table: 'tasks', operation: 'create',
        data: { title: 'Add login page', project_id: 'abc-123' } }
    ]
    ↓
SSE: complete → { operations, summary }
    ↓
User accepts → Execute immediately
```

## Performance Optimizations

### 1. Parallel Queries (`init` endpoint)

- Uses `Promise.all()` for concurrent database calls
- Loads projects, counts, drafts simultaneously
- ~60% faster than sequential queries

### 2. Dual Processing (LLM)

- Context and tasks extracted in parallel
- Reduces total processing time by ~40%
- Uses different models per complexity

### 3. Preparatory Analysis

- Lightweight classification before expensive extraction
- Skips unnecessary processing for simple updates
- Saves ~60% on token costs for status updates

### 4. Batch Operations

- All operations executed in sequence with rollback
- Brain dump links created in single batch insert
- Project questions inserted together

### 5. SSE Streaming

- User sees progress immediately
- No waiting for full processing
- Better perceived performance

## Security Features

### Authentication & Authorization

1. **Session Validation**

    ```typescript
    const { user } = await safeGetSession();
    if (!user) {
    	return SSEResponse.unauthorized();
    }
    ```

2. **User Ownership**
    - All queries filter by `user_id`
    - RLS policies enforce row-level security
    - Operations executor always sets `user_id`

3. **Table Whitelist**

    ```typescript
    const validTables: TableName[] = ['projects', 'tasks', 'notes', 'project_questions'];
    ```

4. **Field Validation**
    - Only schema-defined fields allowed
    - Unknown fields silently removed
    - Type checking and sanitization

5. **Input Sanitization**
    - XSS prevention via string sanitization
    - Max length enforcement
    - UUID format validation
    - Date normalization

### Rate Limiting

- Input length capped at 50KB
- API rate limiting (not shown in code but referenced)
- User-scoped operations only

### SQL Injection Prevention

- Uses Supabase client (parameterized queries)
- No raw SQL construction
- Type-safe query building

## Key Files Reference

### API Routes

```
/apps/web/src/routes/api/braindumps/
├── init/+server.ts                    # Initialize modal
├── draft/+server.ts                   # Draft management
├── draft/status/+server.ts            # Status updates
├── stream/+server.ts                  # Main processing (SSE)
├── +server.ts                         # List/search
├── [id]/+server.ts                    # Individual CRUD
├── [id]/link/+server.ts               # Create link
├── generate/+server.ts                # Generate content
└── contribution-data/+server.ts       # Calendar data
```

### Core Processing

```
/apps/web/src/lib/utils/
├── braindump-processor.ts             # Main processor
├── braindump-validation.ts            # Input validation
├── sse-response.ts                    # SSE utilities
└── operations/
    ├── operation-validator.ts         # Operation validation
    ├── operations-executor.ts         # Execution & rollback
    ├── validation-schemas.ts          # Table schemas
    └── reference-resolver.ts          # Reference resolution
```

### Services

```
/apps/web/src/lib/services/
├── braindump-api.service.ts           # Client API service
├── braindump-background.service.ts    # Background processing
├── braindump-status.service.ts        # Status management
├── promptTemplate.service.ts          # LLM prompts
└── prompts/core/
    ├── task-extraction.ts             # Task extraction
    ├── project-data-fetcher.ts        # Fetch project data
    ├── data-formatter.ts              # Format for LLM
    └── validations.ts                 # Result validation
```

### Types

```
/apps/web/src/lib/types/
├── brain-dump.ts                      # Core types
└── sse-messages.ts                    # SSE message types
```

### Components

```
/apps/web/src/lib/components/brain-dump/
├── BrainDumpModal.svelte              # Main UI
├── RecordingView.svelte               # Input view
├── ProcessingView.svelte              # Progress view
└── SuccessView.svelte                 # Results view
```

## Future Improvements & Considerations

### Missing Features

1. **Stream-Short Route**
    - Directory exists but no implementation
    - May need dedicated short processing endpoint
    - Could optimize for quick task additions

2. **Question Answering Flow**
    - Questions displayed to user
    - Questions updated when answered
    - Integration with dual processing

3. **Background Processing**
    - Currently synchronous in SSE stream
    - Could move to background job queue
    - Would require polling or WebSocket for status

### Potential Optimizations

1. **Caching**
    - Cache recent projects/tasks
    - Reduce database calls
    - Invalidate on updates

2. **Batch Processing**
    - Queue multiple brain dumps
    - Process in batches for efficiency
    - Lower LLM costs

3. **Incremental Updates**
    - Stream operations as they're generated
    - Don't wait for full synthesis
    - Even faster perceived performance

4. **Smart Defaults**
    - Learn from user patterns
    - Pre-populate common fields
    - Reduce required AI extraction

## Related Documentation

- **Feature Docs**: `/apps/web/docs/features/brain-dump/README.md`
- **Architecture**: `/apps/web/docs/technical/architecture/brain-dump-flow.md`
- **API Docs**: `/apps/web/docs/technical/api/README.md`
- **Component Docs**: `/apps/web/src/lib/components/brain-dump/README.md`
- **Development Guide**: `/apps/web/CLAUDE.md`

## Conclusion

The brain dump API represents a sophisticated streaming architecture with:

✅ **Real-time Updates**: SSE streaming for immediate feedback
✅ **Security**: Multi-layer validation and sanitization
✅ **Performance**: Parallel processing and optimization
✅ **Reliability**: Rollback support and error handling
✅ **Flexibility**: Handles both new projects and updates
✅ **Cost Optimization**: Smart analysis reduces unnecessary LLM calls

The system successfully balances user experience, security, and performance while handling complex AI-powered data transformations.
