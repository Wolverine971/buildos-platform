# Brain Dump Stream API - Quick Reference

## Core Files at a Glance

```
Backend:
├── /api/braindumps/stream/+server.ts         (580 lines, main streaming logic)
├── /lib/utils/sse-response.ts                (158 lines, SSE utilities)
└── /lib/types/sse-messages.ts                (166 lines, message types)

Frontend:
├── /lib/utils/sse-processor.ts               (245 lines, stream consumption)
├── /lib/services/braindump-api.service.ts    (299+ lines, API calls)
└── /lib/components/brain-dump/BrainDumpModal.svelte (1781 lines, UI)
```

## Endpoint Quick Facts

| Aspect         | Details                       |
| -------------- | ----------------------------- |
| **Route**      | `POST /api/braindumps/stream` |
| **Auth**       | Required (Supabase session)   |
| **Rate Limit** | Per-user, AI operations       |
| **Max Input**  | 50KB (content length)         |
| **Timeout**    | 180s (3 minutes)              |
| **Transport**  | SSE (Server-Sent Events)      |
| **Response**   | text/event-stream             |

## Message Types Sent

```
1. SSEStatus          → Initial status with process list
2. SSEAnalysis        → Preparatory analysis results (if existing project)
3. SSEContextProgress → Context extraction progress + preview
4. SSETasksProgress   → Task extraction progress + preview
5. SSERetry           → Retry attempt notification
6. SSEComplete        → Final results with operations
7. SSEError           → Error occurred
```

## Processing Pipeline

```
Input → Auth & Validation → SSEStatus
                              ↓
                        Analysis (if project)
                              ↓
                        Context Processing
                              ↓
                        Task Processing
                              ↓
                        Auto-Accept? (optional)
                              ↓
                        SSEComplete or SSEError
```

## Request Body Template

```json
{
  "content": "Brain dump text (max 50KB)",
  "selectedProjectId": "optional-project-id or null",
  "brainDumpId": "existing-dump-id or new UUID",
  "displayedQuestions": [],
  "autoAccept": false,
  "options": {
    "streamResults": true,
    "useDualProcessing": true
  }
}
```

## Response Message Format

```json
{
  "type": "status|analysis|contextProgress|tasksProgress|retry|complete|error",
  "message": "Human-readable message",
  "data": {
    "status": "pending|processing|completed|failed",
    "preview": {
      /* ProjectContextResult or TaskNoteExtractionResult */
    },
    "error": "Error message if failed"
  }
}
```

## Frontend Integration Snippet

```typescript
import { brainDumpService } from "$lib/services/braindump-api.service";

// Start streaming
await brainDumpService.parseBrainDumpWithStream(
  "Brain dump content",
  projectId,
  brainDumpId,
  questions,
  {
    onProgress: (status) => {
      console.log("Progress:", status.type, status.message);
      // Update UI with progress
    },
    onComplete: (result) => {
      console.log("Done! Operations:", result.operations.length);
      // Show results modal
    },
    onError: (error) => {
      console.error("Failed:", error);
      // Show error toast
    },
  },
);
```

## Error Status Codes

```
401 → Not authenticated
400 → Content too long, validation failed
429 → Rate limited (includes Retry-After header)
422 → Invalid request structure
500 → Server error
```

## Key Performance Features

✅ **Dual Processing**: Context + tasks extracted in parallel
✅ **Preparatory Analysis**: For existing projects, optimizes processing
✅ **Auto-Accept**: Optional immediate operation execution
✅ **Preview Data**: Show extracted data during processing
✅ **Error Recovery**: Automatic retry on failures
✅ **Timeout Handling**: 3-minute timeout for complex projects

## Security Checklist

✅ Content length validation (50KB max)
✅ Type validation on all fields
✅ Authentication required
✅ Per-user rate limiting
✅ Input sanitization (null bytes)
✅ No sensitive info in errors
✅ Cache-Control headers set
✅ MIME sniffing prevention

## Testing the Endpoint

```bash
# With curl
curl -X POST http://localhost:5173/api/braindumps/stream \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "content": "I need to build...",
    "brainDumpId": "test-123",
    "options": { "streamResults": true }
  }'

# Look for streaming responses in format:
# data: {"type":"status","message":"..."}
# data: {"type":"contextProgress","message":"..."}
# ...
```

## Common Issues & Solutions

| Issue            | Solution                                     |
| ---------------- | -------------------------------------------- |
| 401 Error        | Ensure user is authenticated                 |
| 429 Error        | Wait for Retry-After seconds before retrying |
| Content too long | Reduce input to under 50KB                   |
| Stream timeout   | May need > 180s for very large dumps         |
| Parse errors     | Check JSON format of message data            |

## Related Documentation

- Full API docs: `docs/architecture/BRAIN_DUMP_STREAM_API_EXPLORATION.md`
- Frontend modal: `apps/web/src/lib/components/brain-dump/BrainDumpModal.svelte`
- Non-streaming endpoint: `POST /api/braindumps/generate`
- Service layer: `apps/web/src/lib/services/braindump-api.service.ts`
