<!-- apps/web/docs/features/braindump-context/README.md -->

# Braindump Context Feature

## Overview

The Braindump Context is a new context type for the AgentChatModal that allows users to capture raw, unstructured thoughts. Unlike other agent contexts that immediately engage in conversation, the braindump context provides a simplified flow where users can dump their thoughts and then choose to either save them or explore them with AI assistance.

## Feature Specification

### User Requirements

1. **Simplified Input Mode**: When the braindump context is selected, show only a textarea (no immediate agentic chatting)
2. **Multi-modal Input**: Support both typing and voice recording
3. **Post-Submit Options**: After submitting content, present two choices:
    - **Save**: Persist the braindump for later reference
    - **Chat About It**: Start a conversation with the AI about the braindump content
4. **Background Processing**: Saved braindumps are asynchronously processed to generate:
    - A descriptive title (max 100 characters)
    - 3-7 topic keywords
    - A 2-3 sentence summary
5. **Thoughtful AI Interaction**: When chatting about a braindump, the AI acts as a "sounding board":
    - Helps clarify thoughts with gentle questions
    - Avoids premature structuring into projects/tasks
    - Only suggests converting to projects when the user clearly indicates readiness

### User Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     Context Selection                            │
│  ┌─────────┐ ┌─────────┐ ┌─────────────┐ ┌─────────┐           │
│  │ Project │ │  Task   │ │  Braindump  │ │  Other  │           │
│  └─────────┘ └─────────┘ └──────┬──────┘ └─────────┘           │
└─────────────────────────────────┼───────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Braindump Input Mode                          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                                                          │   │
│  │     [Large textarea for raw thought capture]             │   │
│  │                                                          │   │
│  │     "What's on your mind? Just let it flow..."          │   │
│  │                                                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│              [Voice] [Submit Braindump]                          │
└─────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Options Mode                                  │
│                                                                  │
│     "What would you like to do with this braindump?"            │
│                                                                  │
│     ┌──────────────────┐    ┌──────────────────────┐           │
│     │   Save for Later │    │  Chat About It       │           │
│     │   (Quick capture)│    │  (Explore with AI)   │           │
│     └──────────────────┘    └──────────────────────┘           │
│                                                                  │
│                      [Back to Edit]                              │
└─────────────────────────────────────────────────────────────────┘
                    │                        │
                    ▼                        ▼
┌───────────────────────────┐    ┌───────────────────────────────┐
│     Save Flow              │    │     Chat Flow                  │
│                            │    │                                │
│  • POST to /api/onto/      │    │  • Context changes to chat    │
│    braindumps              │    │  • First message = braindump  │
│  • Queue background        │    │  • AI acts as sounding board  │
│    processing              │    │                                │
│  • Close modal with        │    │  ┌────────────────────────┐   │
│    success message         │    │  │ User: [braindump text] │   │
│                            │    │  │                        │   │
│  Background Worker:        │    │  │ AI: I see you're       │   │
│  • Generate title          │    │  │ thinking about...      │   │
│  • Extract topics          │    │  │ Tell me more about...  │   │
│  • Create summary          │    │  └────────────────────────┘   │
└───────────────────────────┘    └───────────────────────────────┘
```

---

## Implementation Details

### Database Schema

#### New Table: `onto_braindumps`

```sql
CREATE TYPE onto_braindump_status AS ENUM ('pending', 'processing', 'processed', 'failed');

CREATE TABLE onto_braindumps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Content
    content TEXT NOT NULL,
    title TEXT,                          -- AI-generated, max 100 chars
    topics TEXT[] DEFAULT '{}',          -- AI-extracted, 3-7 keywords
    summary TEXT,                        -- AI-generated, 2-3 sentences

    -- Processing status
    status onto_braindump_status NOT NULL DEFAULT 'pending',

    -- Optional link to chat session
    chat_session_id UUID REFERENCES chat_sessions(id) ON DELETE SET NULL,

    -- Metadata
    metadata JSONB DEFAULT '{}',         -- source, content_length, etc.

    -- Processing details
    processed_at TIMESTAMPTZ,
    error_message TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_onto_braindumps_user_id ON onto_braindumps(user_id);
CREATE INDEX idx_onto_braindumps_status ON onto_braindumps(status);
CREATE INDEX idx_onto_braindumps_created_at ON onto_braindumps(created_at DESC);
```

#### Queue Type Addition

Added `process_onto_braindump` to the `queue_type` enum for background job processing.

---

### API Endpoints

#### POST `/api/onto/braindumps`

Creates a new braindump and queues background processing.

**Request Body:**

```json
{
	"content": "string (required, max 50,000 chars)",
	"metadata": "object (optional)",
	"chat_session_id": "uuid (optional)"
}
```

**Response (201):**

```json
{
	"success": true,
	"data": {
		"braindump": {
			"id": "uuid",
			"status": "pending",
			"created_at": "timestamp"
		},
		"message": "Braindump saved successfully"
	}
}
```

#### GET `/api/onto/braindumps`

Lists user's braindumps with pagination and filtering.

**Query Parameters:**

- `limit`: number (default: 20, max: 100)
- `offset`: number (default: 0)
- `status`: 'pending' | 'processing' | 'processed' | 'failed'

**Response (200):**

```json
{
  "success": true,
  "data": {
    "braindumps": [...],
    "total": 42,
    "limit": 20,
    "offset": 0,
    "hasMore": true
  }
}
```

---

### Worker Processing

#### Job Type: `process_onto_braindump`

**Queue Priority:** 7 (low - background task)

**Job Data:**

```typescript
interface OntoBraindumpProcessingJobMetadata {
	braindumpId: string;
	userId: string;
}
```

**Processing Steps:**

1. Validate job data (UUID format)
2. Fetch braindump from database
3. Check if already processed (skip if so)
4. Handle insufficient content (< 10 chars) with defaults
5. Call LLM to generate title, topics, summary
6. Sanitize and validate LLM response
7. Update braindump record with results

**LLM Prompt:**

```
You are a thought analyst helping users organize raw braindumps. Your task is to analyze unstructured thoughts and generate:

1. A concise, descriptive title (max 100 characters) that captures the essence
2. A list of 3-7 topic keywords that represent the main themes
3. A brief summary (2-3 sentences) that captures the core ideas

Guidelines:
- The title should be human-readable and capture the main intent or topic
- Topics should be specific keywords, not sentences
- The summary should be a helpful distillation
- Be supportive and non-judgmental - braindumps are raw thoughts
- If the content is very brief or unclear, generate reasonable defaults
```

**Result:**

```typescript
interface OntoBraindumpProcessingResult {
	success: boolean;
	braindumpId: string;
	title?: string;
	topics?: string[];
	summary?: string;
	contentLength?: number;
	skipped?: boolean;
	reason?: string;
	error?: string;
}
```

---

### Frontend Components

#### AgentChatModal Changes

**New State Variables:**

```typescript
type BraindumpMode = 'input' | 'options' | 'chat';

let braindumpMode = $state<BraindumpMode>('input');
let pendingBraindumpContent = $state('');
let isSavingBraindump = $state(false);
let braindumpSaveError = $state<string | null>(null);

const isBraindumpContext = $derived(selectedContextType === 'brain_dump');
```

**New Handler Functions:**

- `handleBraindumpSubmit()`: Transitions from input to options mode
- `saveBraindump()`: Saves to API and closes modal
- `chatAboutBraindump()`: Transitions to chat mode with braindump as first message
- `cancelBraindumpOptions()`: Returns to input mode for editing

#### ContextSelectionScreen Changes

Added new braindump card with violet styling:

```svelte
<button onclick={selectBraindump} class="...violet styling...">
	<Lightbulb class="h-5 w-5" />
	<h3>Braindump</h3>
	<p>Capture raw thoughts, then save them or explore with AI as a thought partner.</p>
</button>
```

#### Agent Context Service

**New System Prompt for Braindump Context:**

```
## BRAINDUMP EXPLORATION CONTEXT

The user has shared a braindump - raw, unstructured thoughts they want to
explore. Your role is to be a thoughtful sounding board.

### Your Core Approach
1. **BE A SOUNDING BOARD**: Listen, reflect, help clarify
2. **MIRROR THEIR ENERGY**: If exploring, explore with them
3. **ASK GENTLE QUESTIONS**: Only when it helps clarify
4. **IDENTIFY PATTERNS**: Notice themes, goals, potential projects
5. **AVOID PREMATURE STRUCTURING**: Don't immediately create projects/tasks

### What NOT to Do:
- Don't immediately ask "What project is this for?"
- Don't create projects/tasks without clear signals
- Don't push for immediate action
- Don't over-organize raw thoughts
```

---

## Files Changed/Created

### New Files

| File                                                      | Purpose                                                          |
| --------------------------------------------------------- | ---------------------------------------------------------------- |
| `supabase/migrations/20251209_create_onto_braindumps.sql` | Database migration for onto_braindumps table and queue_type enum |
| `apps/web/src/routes/api/onto/braindumps/+server.ts`      | API endpoint for braindump CRUD                                  |
| `apps/worker/src/workers/braindump/braindumpProcessor.ts` | Worker processor for LLM-based braindump analysis                |
| `apps/web/docs/features/braindump-context/README.md`      | This documentation file                                          |

### Modified Files

| File                                                             | Changes                                           |
| ---------------------------------------------------------------- | ------------------------------------------------- |
| `packages/shared-types/src/database.schema.ts`                   | Added `onto_braindumps` type definition           |
| `packages/shared-types/src/database.types.ts`                    | Added `process_onto_braindump` to queue_type enum |
| `packages/shared-types/src/queue-types.ts`                       | Added job metadata, result types, and validation  |
| `apps/web/src/lib/services/railwayWorker.service.ts`             | Added `queueBraindumpProcessing()` method         |
| `apps/worker/src/workers/shared/queueUtils.ts`                   | Added job data interface and validation function  |
| `apps/worker/src/index.ts`                                       | Added `/queue/braindump/process` endpoint         |
| `apps/worker/src/worker.ts`                                      | Registered braindump processor                    |
| `apps/web/src/lib/components/agent/agent-chat.constants.ts`      | Added braindump context descriptor                |
| `apps/web/src/lib/components/chat/ContextSelectionScreen.svelte` | Added braindump selection card                    |
| `apps/web/src/lib/components/agent/AgentChatModal.svelte`        | Added braindump UI modes and handlers             |
| `apps/web/src/lib/services/agent-context-service.ts`             | Added braindump system prompt                     |

---

## Type Definitions

### Shared Types (`@buildos/shared-types`)

```typescript
// Job metadata for braindump processing
export interface OntoBraindumpProcessingJobMetadata {
	braindumpId: string;
	userId: string;
}

// Job result from braindump processing
export interface OntoBraindumpProcessingResult {
	success: boolean;
	braindumpId: string;
	title?: string;
	topics?: string[];
	summary?: string;
	contentLength?: number;
	skipped?: boolean;
	reason?: string;
	error?: string;
}
```

### Database Schema Types

```typescript
// In database.schema.ts
onto_braindumps: {
  chat_session_id: string | null;
  content: string;
  created_at: string;
  error_message: string | null;
  id: string;
  metadata: Json | null;
  processed_at: string | null;
  status: string;
  summary: string | null;
  title: string | null;
  topics: string[] | null;
  updated_at: string;
  user_id: string;
}
```

---

## Configuration

### Environment Variables

No new environment variables required. Uses existing:

- `PUBLIC_APP_URL` - For LLM service HTTP referer
- Supabase credentials for database access
- OpenRouter/LLM credentials for AI processing

### Queue Settings

- **Job Type**: `process_onto_braindump`
- **Priority**: 7 (low priority background task)
- **Dedup Key**: `process-onto-braindump-{braindumpId}`
- **Profile**: `fast` (uses cost-effective LLM model)
- **Temperature**: 0.3 (consistent, focused outputs)

---

## Testing

### Manual Testing Checklist

- [ ] Select braindump context from context selection screen
- [ ] Enter text in braindump textarea
- [ ] Submit and see options (save/chat)
- [ ] Test "Save for Later" flow
    - [ ] Verify braindump created in database
    - [ ] Verify background job queued
    - [ ] Verify title/topics/summary generated after processing
- [ ] Test "Chat About It" flow
    - [ ] Verify context switches to chat mode
    - [ ] Verify braindump appears as first message
    - [ ] Verify AI responds as sounding board
- [ ] Test back navigation from options
- [ ] Test error handling (empty content, API failures)

### Database Verification

```sql
-- Check braindump was created
SELECT * FROM onto_braindumps WHERE user_id = '<user_id>' ORDER BY created_at DESC;

-- Check processing job was queued
SELECT * FROM queue_jobs
WHERE job_type = 'process_onto_braindump'
AND metadata->>'braindumpId' = '<braindump_id>';

-- Check processing completed
SELECT id, title, topics, summary, status, processed_at
FROM onto_braindumps
WHERE id = '<braindump_id>';
```

---

## Future Enhancements

1. **Voice Recording**: Add speech-to-text for voice braindumps
2. **Braindump History**: UI to view/search past braindumps
3. **Convert to Project**: One-click conversion of processed braindumps to projects
4. **Tagging System**: Allow users to add custom tags
5. **Search/Filter**: Full-text search across braindumps
6. **Export**: Export braindumps to markdown/PDF
7. **Linking**: Connect braindumps to related projects/tasks

---

## Deployment Notes

### Pre-deployment

1. Run database migration:

    ```bash
    supabase db push
    # or apply migration manually in Supabase dashboard
    ```

2. Regenerate Supabase types (optional but recommended):
    ```bash
    pnpm supabase gen types typescript --project-id <project_id> > packages/shared-types/src/database.types.ts
    ```

### Post-deployment

1. Verify worker is processing `process_onto_braindump` jobs
2. Monitor for any processing errors in worker logs
3. Check braindumps are being processed (status changes from 'pending' to 'processed')

---

## Related Documentation

- [AgentChatModal Technical Analysis](/apps/web/docs/technical/components/modals/TECHNICAL_ANALYSIS.md)
- [Worker CLAUDE.md](/apps/worker/CLAUDE.md)
- [Queue System Flow](/docs/architecture/diagrams/QUEUE-SYSTEM-FLOW.md)
- [Ontology System](/apps/web/docs/features/ontology/README.md)
