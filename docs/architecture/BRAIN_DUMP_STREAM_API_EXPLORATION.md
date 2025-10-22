# Brain Dump API Endpoints - Complete Exploration

## Executive Summary

The BuildOS platform implements a sophisticated **Server-Sent Events (SSE) streaming system** for brain dump processing. The main streaming endpoint (`/api/braindumps/stream`) handles real-time progress updates from the server to the frontend while processing brain dumps through a dual-processing pipeline (analysis → context extraction → task extraction).

---

## Architecture Overview

### Main Endpoints

| Endpoint                   | Method   | Purpose                                               | Streaming     |
| -------------------------- | -------- | ----------------------------------------------------- | ------------- |
| `/api/braindumps/stream`   | POST     | Real-time brain dump processing with progress updates | **Yes (SSE)** |
| `/api/braindumps/generate` | POST     | Traditional brain dump parsing/saving (non-streaming) | No            |
| `/api/braindumps/init`     | GET      | Load initial data for the modal                       | No            |
| `/api/braindumps/draft`    | GET/POST | Manage brain dump drafts                              | No            |
| `/api/braindumps`          | GET      | List all brain dumps                                  | No            |
| `/api/braindumps/[id]`     | GET      | Get specific brain dump                               | No            |

---

## 1. Brain Dump Stream API Endpoint

### File Location

- **Backend**: `/Users/annawayne/buildos-platform/apps/web/src/routes/api/braindumps/stream/+server.ts`
- **Size**: ~580 lines of comprehensive streaming logic

### HTTP Method & Route

```typescript
POST / api / braindumps / stream;
```

### Authentication

- **Required**: Yes - User must be authenticated via Supabase
- **Validation**: `safeGetSession()` called at start of request (line 35)
- **Error Response**: Returns 401 Unauthorized if user not authenticated

### Rate Limiting

- **Type**: Per-user rate limiting on expensive AI operations
- **Config**: `rateLimiter.check(user.id, RATE_LIMITS.API_AI)`
- **Response**: 429 Too Many Requests with `Retry-After` header
- **Headers Included**:
    - `X-RateLimit-Limit`: Total requests allowed
    - `X-RateLimit-Remaining`: Requests remaining
    - `X-RateLimit-Reset`: Unix timestamp when limit resets

### Request Body Structure

```typescript
{
  // Required
  content: string;              // Brain dump text (max 50KB)

  // Optional
  selectedProjectId?: string;   // For existing project updates
  brainDumpId?: string;        // ID of brain dump being processed
  displayedQuestions?: DisplayedBrainDumpQuestion[];

  // Options
  options?: {
    streamResults?: boolean;
    useDualProcessing?: boolean;
    autoAccept?: boolean;
  };

  // Auto-accept flag
  autoAccept?: boolean;        // Auto-execute operations after parsing
}
```

### Input Validation

**Content Length Validation (DoS Prevention)**

```typescript
const MAX_CONTENT_LENGTH = 50000; // 50KB
if (content.length > MAX_CONTENT_LENGTH) {
	return SSEResponse.badRequest(
		`Content too long. Maximum ${MAX_CONTENT_LENGTH} characters allowed.`
	);
}
```

**Schema Validation** (line 67)

```typescript
const validation = await BrainDumpValidator.validateDual(requestBody);
if (!validation.isValid) {
	return validation.error!;
}
```

---

## 2. Server-Sent Events (SSE) Implementation

### Response Headers

```typescript
{
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  'Connection': 'keep-alive',
  'X-Content-Type-Options': 'nosniff'
}
```

### Stream Creation

```typescript
// From SSEResponse.createStream()
const { response, writer, encoder } = SSEResponse.createStream();

// response: Response object with proper SSE headers
// writer: WritableStreamDefaultWriter for sending data
// encoder: TextEncoder for encoding messages
```

### SSE Message Format

All messages follow the standard SSE format:

```
event: [optional-event-type]
data: {JSON-stringified-message}

```

Each message ends with a blank line (`\n\n`).

---

## 3. Streaming Messages & Data Types

### Message Types Sent During Processing

**Located in**: `/Users/annawayne/buildos-platform/apps/web/src/lib/types/sse-messages.ts`

#### 1. **SSEStatus** - Initial Status Message

```typescript
{
  type: 'status',
  message: string;
  data: {
    processes: ('analysis' | 'context' | 'tasks')[],
    contentLength: number,
    isDualProcessing?: boolean,
    source?: string  // 'analysis-then-dual' | 'dual-processing'
  }
}
```

**Example**:

```json
{
	"type": "status",
	"message": "Analyzing braindump...",
	"data": {
		"processes": ["analysis", "context", "tasks"],
		"contentLength": 1250,
		"isDualProcessing": true,
		"source": "analysis-then-dual"
	}
}
```

#### 2. **SSEAnalysis** - Preparatory Analysis Progress

```typescript
{
  type: 'analysis',
  message: string;
  data: {
    status: 'pending' | 'processing' | 'completed' | 'failed',
    result?: PreparatoryAnalysisResult,
    error?: string
  }
}
```

**Timeline**:

- "Analyzing braindump content and identifying relevant data..." (processing starts)
- "Analysis complete: mixed content detected (5 relevant tasks)" (processing ends)
- Sent when `selectedProjectId` is provided (existing project flow)

#### 3. **SSEContextProgress** - Context Extraction Progress

```typescript
{
  type: 'contextProgress',
  message: string;
  data: {
    status: 'pending' | 'processing' | 'completed' | 'failed',
    preview?: ProjectContextResult,
    error?: string,
    allowContinue?: boolean
  }
}
```

**Messages**:

- "Processing project context..." (when starting)
- "Project context processed" (when complete with preview data)

#### 4. **SSETasksProgress** - Task Extraction Progress

```typescript
{
  type: 'tasksProgress',
  message: string;
  data: {
    status: 'pending' | 'processing' | 'completed' | 'failed',
    preview?: TaskNoteExtractionResult,
    error?: string
  }
}
```

**Messages**:

- "Extracting tasks and notes..." (when starting)
- "Tasks and notes extracted" (when complete with preview data)

#### 5. **SSERetry** - Retry Attempt Message

```typescript
{
  type: 'retry',
  message: string;
  attempt: number,
  maxAttempts: number,
  processName: string  // 'dual-processing'
}
```

**Triggered**: When AI processing fails and retry logic kicks in

#### 6. **SSEComplete** - Final Completion Message

```typescript
{
  type: 'complete',
  message: string;
  result: BrainDumpParseResult
}
```

**Message Examples**:

- "Processing complete - operations applied" (auto-accept enabled)
- "Processing complete - operations applied with errors" (auto-accept with failures)
- "Processing complete" (auto-accept disabled)

**Result Structure**:

```typescript
{
  title: string;
  operations: ParsedOperation[];
  summary: string;
  insights: string;
  tags: string[];
  projectQuestions?: any;
  executionResult?: {
    successful: Operation[];
    failed: FailedOperation[];
    results: OperationResult[];
    error?: string;
    projectInfo?: {
      id: string;
      name: string;
      slug: string;
      isNew: boolean;
    }
  }
}
```

#### 7. **SSEError** - Error Message

```typescript
{
  type: 'error',
  message: string;
  error: string;
  context?: 'context' | 'tasks' | 'general',
  recoverable?: boolean
}
```

### Processing Pipeline Diagram

```
START
  ↓
[SSEStatus] - "Starting dual processing..." or "Analyzing braindump..."
  ↓
IF (selectedProjectId) {
  [SSEAnalysis] - "Analyzing braindump content..."
  [SSEAnalysis] - "Analysis complete: classification detected"
  [SSEStatus] - "Processing context and tasks..."
}
  ↓
[SSEContextProgress] - "Processing project context..."
[SSEContextProgress] - "Project context processed" (with preview)
  ↓
[SSETasksProgress] - "Extracting tasks and notes..."
[SSETasksProgress] - "Tasks and notes extracted" (with preview)
  ↓
IF (autoAccept) {
  [Execute operations in background]
  [SSEComplete] - "Processing complete - operations applied"
} ELSE {
  [SSEComplete] - "Processing complete"
}
  ↓
END

ON ERROR:
  [SSERetry] - "Retrying dual processing..." (attempts up to maxAttempts)
  OR
  [SSEError] - "Processing failed"
```

---

## 4. Processing Backend Implementation

### Stream Processing Function (Line 108-572)

```typescript
async function processBrainDumpWithStreaming({
	content,
	selectedProjectId,
	brainDumpId,
	displayedQuestions,
	writer,
	encoder,
	userId,
	supabase,
	options,
	autoAccept,
	processingDateTime
});
```

### Key Processing Phases

**Phase 1: Initialization** (Line 137-152)

- Send initial status message with process list
- Set up progress tracking variables
- Initialize analysis, context, and tasks progress states

**Phase 2: Override Preparatory Analysis** (Line 159-247)

- Only if `selectedProjectId` is provided
- Intercepts `runPreparatoryAnalysis()` to emit SSE events
- Sends analysis messages during and after completion
- Can classify content as: 'mixed', 'strategic', 'tactical', etc.
- Determines which subsequent phases to run

**Phase 3: Override Context Extraction** (Line 250-295)

- Intercepts `extractProjectContext()` method
- Emits progress messages during processing
- Sends formatted `ProjectContextResult` preview on completion
- Contains: summary, goals, constraints, scope

**Phase 4: Override Task Extraction** (Line 297-339)

- Intercepts `extractTasks()` method
- Emits progress messages during processing
- Sends formatted `TaskNoteExtractionResult` preview on completion
- Contains: extracted tasks with descriptions, priorities, estimates

**Phase 5: Dual Processing Execution** (Line 342-365)

- Calls `processor.processBrainDump()` with retry callback
- Retry callback emits `SSERetry` messages
- Validates result using `validateSynthesisResult()`
- Updates brain dump status using centralized service

**Phase 6: Auto-Accept Execution** (Line 392-537)

- If `autoAccept` is enabled and operations exist:
    - Creates `OperationsExecutor` instance
    - Executes all enabled operations
    - Fetches project info for created/updated projects
    - Updates brain dump status to 'saved'
    - Includes execution summary in metadata

**Phase 7: Completion** (Line 539-572)

- Sends final `SSEComplete` message with full result
- Logs activity
- Handles errors and sends `SSEError` message
- Gracefully closes stream

---

## 5. Frontend Implementation - Stream Consumption

### File: `/Users/annawayne/buildos-platform/apps/web/src/lib/utils/sse-processor.ts`

#### SSEProcessor Class

**Main Method**: `SSEProcessor.processStream()`

```typescript
static async processStream(
  response: Response,
  callbacks: StreamCallbacks,
  options: SSEProcessorOptions = {}
): Promise<void>
```

**Callbacks Available**:

```typescript
interface StreamCallbacks {
	onProgress?: (data: any) => void; // For status/progress messages
	onComplete?: (result: any) => void; // For completion message
	onError?: (error: string | Error) => void;
	onStatus?: (status: string) => void; // For custom event types
}
```

**Options**:

```typescript
interface SSEProcessorOptions {
	timeout?: number; // Default: 60000ms
	parseJSON?: boolean; // Default: true
	onParseError?: (error: Error, chunk: string) => void;
}
```

#### Stream Parsing Logic (Lines 84-161)

1. **Buffer Management**: Reads stream chunks and buffers incomplete lines
2. **Event Parsing**: Splits on `\n` and processes complete events
3. **Data Extraction**: Parses `data: ` prefix and JSON
4. **Error Handling**: Catches JSON parse errors without crashing stream
5. **Timeout**: Enforces timeout (default 60s, configurable to 180s for long dumps)
6. **Event Type Detection**: Routes messages to appropriate callbacks:
    - `type === 'status'` → onStatus
    - `type === 'progress'` → onProgress
    - `type === 'complete'` → onComplete
    - `type === 'error'` → onError

---

## 6. Frontend Service Integration

### File: `/Users/annawayne/buildos-platform/apps/web/src/lib/services/braindump-api.service.ts`

#### Stream Parsing Method (Lines 183-271)

```typescript
async parseBrainDumpWithStream(
  text: string,
  selectedProjectId?: string | null,
  brainDumpId?: string,
  displayedQuestions?: DisplayedBrainDumpQuestion[],
  options?: {
    autoAccept?: boolean;
    onProgress?: (status: StreamingMessage) => void;
    onComplete?: (result: BrainDumpParseResult) => void;
    onError?: (error: string) => void;
  }
): Promise<void>
```

#### Request Body Sent to Backend

```javascript
{
  content: text,
  selectedProjectId,
  brainDumpId,
  displayedQuestions,
  options: {
    streamResults: true,
    useDualProcessing: true,
    autoAccept: options?.autoAccept || false
  }
}
```

#### Message Routing (Lines 220-248)

```typescript
switch (data.type) {
	case 'status':
	case 'contextProgress':
	case 'tasksProgress':
	case 'retry':
		options?.onProgress?.(data);
		break;

	case 'complete':
		if (data.result) {
			options?.onComplete?.(data.result);
		}
		break;

	case 'error':
		options?.onError?.(data.error || 'Unknown error');
		break;

	default:
		options?.onProgress?.(data);
}
```

#### Timeout Configuration

```typescript
{
  timeout: 180000,  // 3 minutes for long brain dumps
  parseJSON: true,
  onParseError: (error, chunk) => {
    console.error('Failed to parse SSE data:', error, 'Chunk:', chunk);
  }
}
```

---

## 7. Component-Level Stream Handling

### File: `/Users/annawayne/buildos-platform/apps/web/src/lib/components/brain-dump/BrainDumpModal.svelte`

#### Usage in Modal (Line 880+)

```typescript
async function parseBrainDump(event?: CustomEvent) {
	// ... validation ...

	// Start processing through unified store
	processingStarted = await brainDumpV2Store.startBrainDump(brainDumpId, {
		inputText: inputText,
		selectedProject: selectedProject,
		isNewProject: selectedProject?.id === 'new',
		processingType: 'dual',
		autoAcceptEnabled: autoAccept,
		displayedQuestions: displayedQuestions
	});
}
```

---

## 8. Response Status Codes

### Success Responses

| Status     | Condition                  | Headers                         |
| ---------- | -------------------------- | ------------------------------- |
| **200 OK** | SSE connection established | Content-Type: text/event-stream |

### Error Responses

| Status  | Reason            | Response Body                                                | Retry Header           |
| ------- | ----------------- | ------------------------------------------------------------ | ---------------------- |
| **401** | Not authenticated | `{ error: "Unauthorized", code: "UNAUTHORIZED" }`            | No                     |
| **400** | Content too long  | `{ error: "Content too long. Maximum 50000..." }`            | No                     |
| **429** | Rate limited      | `{ error: "Rate limit exceeded...", retryAfter: 30 }`        | Yes: `Retry-After: 30` |
| **422** | Validation failed | `{ error: "...", code: "INVALID_REQUEST" }`                  | No                     |
| **500** | Server error      | `{ error: "Internal server error", code: "INTERNAL_ERROR" }` | No                     |

### Error Response Format

```json
{
	"error": "Error message",
	"code": "ERROR_CODE",
	"status": 400,
	"timestamp": "2024-10-20T12:34:56.000Z"
}
```

---

## 9. Data Flow Example

### Scenario: User Creates New Project Brain Dump

```
Frontend Request:
POST /api/braindumps/stream
{
  "content": "I need to build a mobile app...",
  "selectedProjectId": null,
  "brainDumpId": "dump-123",
  "options": {
    "streamResults": true,
    "useDualProcessing": true
  }
}

Backend Response Stream:

1. SSEStatus
   → "Starting dual processing..."

2. SSEContextProgress
   → "Processing project context..."
   → [AI extracts goals, scope, constraints]
   → "Project context processed"
   → { preview: ProjectContextResult }

3. SSETasksProgress
   → "Extracting tasks and notes..."
   → [AI extracts tasks with descriptions]
   → "Tasks and notes extracted"
   → { preview: TaskNoteExtractionResult }

4. SSEComplete
   → "Processing complete"
   → {
       result: {
         title: "Mobile App Project",
         operations: [
           { table: 'projects', operation: 'create', data: {...} },
           { table: 'tasks', operation: 'create', data: {...} },
           ...
         ],
         summary: "3 main phases identified",
         insights: "..."
       }
     }

Frontend Handler:
- onProgress() → Show context progress UI
- onProgress() → Show task extraction progress
- onComplete() → Display parsed results modal
```

---

## 10. Error Handling & Recovery

### Client-Side Error Handling

**From BrainDumpModal.svelte**:

```typescript
try {
	await brainDumpService.parseBrainDumpWithStream(
		inputText,
		selectedProjectId,
		brainDumpId,
		displayedQuestions,
		{
			onProgress: (status) => {
				/* handle progress */
			},
			onComplete: (result) => {
				/* handle complete */
			},
			onError: (error) => {
				toastService.error(error);
				brainDumpActions.setProcessingPhase('idle');
			}
		}
	);
} catch (error) {
	console.error('Processing error:', error);
	toastService.error('Processing failed: ' + error.message);
}
```

### Server-Side Retry Logic

**From stream/+server.ts (Lines 352-361)**:

```typescript
onRetry: async (attempt: number, maxAttempts: number) => {
	const retryMessage: SSERetry = {
		type: 'retry',
		message: `Retrying dual processing...`,
		attempt,
		maxAttempts,
		processName: 'dual-processing'
	};
	await sendSSEMessage(writer, encoder, retryMessage);
};
```

### Stream Error Handling

**From sse-processor.ts (Lines 125-131)**:

```typescript
try {
	if (parseJSON) {
		const parsed = JSON.parse(data);
		this.handleParsedEvent(parsed, callbacks);
	}
} catch (error) {
	if (onParseError) {
		onParseError(error as Error, data);
	} else {
		console.error('Failed to parse SSE data:', error);
	}
}
```

---

## 11. Performance Considerations

### Streaming Advantages

1. **Real-time Feedback**: User sees progress immediately
2. **No Blocking**: Multiple processes send updates asynchronously
3. **Large Payload Support**: 50KB content limit allows complex projects
4. **Timeout Handling**: 3-minute timeout accommodates slow AI processing

### Backend Optimizations

1. **Dual Processing**: Parallel context + task extraction
2. **Preparatory Analysis**: For existing projects, determines which phases to run
3. **Validation Caching**: Schema validation reused
4. **Error Recovery**: Automatic retry on AI failures

---

## 12. Security Features

### Input Validation

- ✅ Content length limited to 50KB (DoS prevention)
- ✅ Type checking for all fields
- ✅ UTF-16 encoding handled correctly
- ✅ Null byte sanitization

### Authentication & Authorization

- ✅ Session validation required
- ✅ User ID attached to all operations
- ✅ RLS policies enforced on database

### Rate Limiting

- ✅ Per-user rate limiting on AI operations
- ✅ Configurable limits per time window
- ✅ Clear `Retry-After` headers

### Data Protection

- ✅ No sensitive info in error messages (development mode only)
- ✅ X-Content-Type-Options header prevents MIME sniffing
- ✅ Cache-Control headers prevent caching

---

## 13. Related API Endpoints

### `/api/braindumps/generate` - Non-Streaming Alternative

```typescript
POST /api/braindumps/generate
{
  "action": "parse",
  "text": "...",
  "selectedProjectId": "...",
  "options": {
    "streamResults": true,
    "useDualProcessing": true
  }
}

Response: { data: BrainDumpParseResult }
```

**Use Cases**: Shorter brain dumps, fallback when SSE not available

### `/api/braindumps/init` - Modal Initialization

```typescript
GET /api/braindumps/init?projectId=...&excludeBrainDumpId=...

Response: {
  projects: [],
  recentBrainDumps: [],
  newProjectDraftCount: 0,
  currentDraft?: { brainDump, parseResults }
}
```

---

## 14. Testing Notes

### Test File Location

- `/Users/annawayne/buildos-platform/apps/web/src/routes/api/braindumps/stream/server.test.ts`

### Test Coverage

- ✅ Content length validation (DoS prevention)
- ✅ Input type validation
- ✅ Authentication requirements
- ✅ Rate limiting logic
- ✅ Error response format
- ✅ Edge cases (Unicode, null bytes, malformed JSON)

---

## Summary

The brain dump stream API is a **robust, production-ready implementation** of SSE streaming in SvelteKit that:

1. **Handles real-time progress** through typed SSE messages
2. **Implements dual processing** (analysis → context → tasks)
3. **Supports auto-execution** of operations with full feedback
4. **Includes comprehensive error handling** and retry logic
5. **Enforces security** with validation, auth, and rate limiting
6. **Provides excellent UX** with granular progress updates and preview data
7. **Scales efficiently** with timeout management and resource cleanup

The implementation demonstrates **best practices** for streaming APIs, including proper message framing, error recovery, and frontend-backend coordination.
