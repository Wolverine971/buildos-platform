# Agentic Workflow Design Context

**Purpose:** This document provides comprehensive context for designing and implementing an agentic workflow system in the BuildOS platform.

**Target Audience:** LLM/AI agents designing the agentic workflow system

**Last Updated:** 2025-10-17

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Current Architecture](#current-architecture)
3. [Queue System & Worker Infrastructure](#queue-system--worker-infrastructure)
4. [Database Schema](#database-schema)
5. [LLM Integration Patterns](#llm-integration-patterns)
6. [Job Processing Patterns](#job-processing-patterns)
7. [Task & Project Management](#task--project-management)
8. [Communication & Notifications](#communication--notifications)
9. [Existing Agentic Patterns](#existing-agentic-patterns)
10. [Requirements for Agentic Workflow](#requirements-for-agentic-workflow)
11. [Integration Points](#integration-points)
12. [Code Patterns & Examples](#code-patterns--examples)
13. [Performance & Scalability](#performance--scalability)

---

## 1. Project Overview

### What is BuildOS?

BuildOS is an AI-powered productivity platform for ADHD minds that transforms unstructured thoughts into actionable plans.

**Core Innovation:** Brain Dump System - users write stream-of-consciousness thoughts, and AI automatically extracts projects, tasks, and context.

### Tech Stack

| Component          | Technology                                         |
| ------------------ | -------------------------------------------------- |
| **Monorepo**       | Turborepo + pnpm workspaces                        |
| **Web App**        | SvelteKit 2 + Svelte 5 (runes syntax)              |
| **Worker Service** | Node.js + Express + Supabase-based Queue           |
| **Database**       | Supabase (PostgreSQL + RLS)                        |
| **AI/LLM**         | OpenRouter with multiple models (DeepSeek primary) |
| **Auth**           | Supabase Auth + Google OAuth                       |
| **Deployment**     | Vercel (web) + Railway (worker)                    |

### Key Features

1. **Brain Dump Processing** - AI extracts projects, tasks, and context from unstructured text
2. **Daily Briefs** - AI-generated summaries of tasks and projects
3. **Phase Generation** - AI creates project phases and task breakdowns
4. **Calendar Integration** - Bidirectional sync with Google Calendar
5. **Multi-channel Notifications** - Email, SMS, push, in-app

---

## 2. Current Architecture

### Dual-Service Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    BuildOS Platform                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐                 ┌──────────────┐          │
│  │   Web App    │◄───────────────►│   Worker     │          │
│  │  (Vercel)    │   Via Supabase  │  (Railway)   │          │
│  │  SvelteKit   │      Queue      │   Express    │          │
│  └──────┬───────┘                 └──────┬───────┘          │
│         │                                │                  │
│         │      ┌──────────────┐          │                  │
│         └─────►│   Supabase   │◄─────────┘                  │
│                │   Database   │                             │
│                │   + Queue    │                             │
│                │   + Realtime │                             │
│                └──────────────┘                             │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Communication Patterns

**Key Principle:** Web and Worker **NEVER** communicate via HTTP. All communication happens through Supabase PostgreSQL.

#### 1. Queue-Based Communication (Web → Worker)

```typescript
// Web creates job
const job = await queue.add(
  "job_type",
  userId,
  {
    /* metadata */
  },
  { priority: 10, scheduledFor: new Date() },
);

// Worker claims and processes job
const jobs = await queue.claimPendingJobs(["job_type"], batchSize);
```

**Atomic Job Claiming:**

- Uses `SELECT FOR UPDATE SKIP LOCKED` for race-condition-free claiming
- Multiple workers can run concurrently without coordination
- Jobs have status lifecycle: `pending → processing → completed/failed/retrying`

#### 2. Real-Time Updates (Worker → Web)

```typescript
// Worker broadcasts notification
const channel = supabase.channel(`user:${userId}`);
await channel.send({
  type: "broadcast",
  event: "brief_completed",
  payload: { briefId, briefDate, taskCount },
});

// Web subscribes to notifications
const channel = supabase.channel(`user:${userId}`);
channel.on("broadcast", { event: "brief_completed" }, (payload) => {
  // Update UI
});
```

---

## 3. Queue System & Worker Infrastructure

### Queue Architecture

**Database-Based Queue (No Redis Required)**

The system uses Supabase PostgreSQL with atomic RPC functions for queue management.

#### Queue Jobs Table Schema

```sql
queue_jobs (
  id UUID PRIMARY KEY,
  queue_job_id TEXT UNIQUE,
  user_id UUID REFERENCES users,
  job_type TEXT,
  status TEXT, -- pending, processing, completed, failed, retrying, cancelled
  scheduled_for TIMESTAMP,
  metadata JSONB,
  result JSONB,
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  priority INTEGER DEFAULT 10, -- 1 = highest priority
  error_message TEXT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  started_at TIMESTAMP,
  processed_at TIMESTAMP,
  completed_at TIMESTAMP,
  dedup_key TEXT -- For preventing duplicate jobs
)
```

#### Atomic RPC Functions

**1. `add_queue_job()` - Create Job**

```sql
add_queue_job(
  p_user_id UUID,
  p_job_type TEXT,
  p_metadata JSONB,
  p_priority INTEGER DEFAULT 10,
  p_scheduled_for TIMESTAMP DEFAULT NOW(),
  p_dedup_key TEXT DEFAULT NULL
) RETURNS UUID
```

Features:

- Deduplication via unique `dedup_key`
- Returns `job_id` for tracking
- Idempotent (won't create duplicates)

**2. `claim_pending_jobs()` - Atomic Job Claiming**

```sql
claim_pending_jobs(
  p_job_types TEXT[],
  p_batch_size INTEGER DEFAULT 5
) RETURNS SETOF queue_jobs
```

Features:

- Atomic `SELECT FOR UPDATE SKIP LOCKED`
- Updates status to `processing`
- Prevents race conditions between workers
- Priority-based ordering

**3. `complete_queue_job()` - Mark Complete**

```sql
complete_queue_job(
  p_job_id UUID,
  p_result JSONB DEFAULT NULL
) RETURNS VOID
```

**4. `fail_queue_job()` - Mark Failed with Retry Logic**

```sql
fail_queue_job(
  p_job_id UUID,
  p_error_message TEXT,
  p_retry BOOLEAN DEFAULT FALSE
) RETURNS VOID
```

Logic:

- Increments `attempts`
- If `p_retry` and `attempts < max_attempts`:
  - Sets `status = 'retrying'`
  - Calculates retry delay: `2^attempts * 60 minutes`
- Else: Sets `status = 'failed'`

#### Current Job Types

| Job Type               | Purpose                         | Typical Duration |
| ---------------------- | ------------------------------- | ---------------- |
| `generate_daily_brief` | Generate AI-powered daily brief | 8-14 seconds     |
| `generate_brief_email` | Send brief via email            | 2-3 seconds      |
| `generate_phases`      | Generate project phases         | 10-15 seconds    |
| `onboarding_analysis`  | Analyze user onboarding         | 5-8 seconds      |
| `send_sms`             | Send SMS via Twilio             | 1-2 seconds      |
| `send_notification`    | Multi-channel notification      | 2-5 seconds      |
| `schedule_daily_sms`   | Schedule calendar event SMS     | 3-5 seconds      |

### Worker Service Architecture

**Location:** `/apps/worker/`

**Entry Points:**

- `src/index.ts` - Express API server for job queuing
- `src/worker.ts` - Job processor registration and execution
- `src/scheduler.ts` - Cron-based task scheduling

**Worker Lifecycle:**

```typescript
// 1. Register processors
queue.process("generate_daily_brief", processBrief);
queue.process("generate_phases", processPhases);

// 2. Start processing
await queue.start();

// 3. Poll for jobs (every 5 seconds by default)
// 4. Claim batch of jobs atomically
// 5. Process jobs concurrently with Promise.allSettled
// 6. Update job status (complete/fail)
// 7. Broadcast notifications
```

**Job Processor Pattern:**

```typescript
async function processJob(job: ProcessingJob) {
  // 1. Validate metadata
  const data = job.data;

  // 2. Fetch required data from database
  const context = await fetchContext(job.userId);

  // 3. Execute business logic (may include LLM calls)
  const result = await executeLogic(context, data);

  // 4. Save results to database
  await saveResults(result);

  // 5. Update job progress
  await job.updateProgress({ current: 100, total: 100 });

  // 6. Return result
  return { success: true, result };
}
```

---

## 4. Database Schema

### Key Tables for Agentic Workflow

#### Tasks Table

```typescript
tasks: {
  id: string;
  user_id: string;
  project_id: string | null;
  title: string;
  description: string | null;
  details: string | null;
  task_steps: string | null;
  status: string; // "pending", "in_progress", "completed", "cancelled"
  priority: string; // "low", "medium", "high", "critical"
  task_type: string; // "task", "milestone", "recurring"
  start_date: string | null;
  duration_minutes: number | null;
  completed_at: string | null;
  dependencies: string[] | null; // Array of task IDs
  parent_task_id: string | null; // For subtasks
  recurrence_pattern: string | null;
  recurrence_ends: string | null;
  source: string | null; // "brain_dump", "manual", "calendar", "ai_generated"
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
```

#### Projects Table

```typescript
projects: {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  context: string | null;
  executive_summary: string | null;
  status: string; // "active", "completed", "on_hold", "cancelled"
  start_date: string | null;
  end_date: string | null;
  tags: string[] | null;
  source: string | null; // "brain_dump", "manual", "calendar_analysis"
  created_at: string;
  updated_at: string;
}
```

#### Phases Table

```typescript
phases: {
  id: string;
  user_id: string;
  project_id: string;
  name: string;
  description: string | null;
  order: number;
  start_date: string;
  end_date: string;
  scheduling_method: string | null;
  created_at: string;
  updated_at: string;
}

phase_tasks: {
  id: string;
  phase_id: string;
  task_id: string;
  order: number;
  assignment_reason: string | null; // Why AI assigned this task to this phase
  suggested_start_date: string | null;
  created_at: string;
}
```

#### Notes Table

```typescript
notes: {
  id: string;
  user_id: string;
  project_id: string | null;
  title: string | null;
  content: string | null;
  category: string | null;
  tags: string[] | null;
  created_at: string;
  updated_at: string;
}
```

#### Brain Dumps Table

```typescript
brain_dumps: {
  id: string;
  user_id: string;
  project_id: string | null;
  content: string | null;
  title: string | null;
  status: string; // "pending", "processing", "completed", "failed"
  parsed_results: Json | null; // Extracted operations
  ai_summary: string | null;
  ai_insights: string | null;
  tags: string[] | null;
  metaData: Json | null;
  created_at: string;
  updated_at: string;
}

brain_dump_links: {
  id: number;
  brain_dump_id: string;
  project_id: string | null;
  task_id: string | null;
  note_id: string | null;
  created_at: string;
}
```

#### User Context Table

```typescript
user_context: {
  id: string;
  user_id: string;
  background: string | null;
  goals_overview: string | null;
  work_style: string | null;
  communication_style: string | null;
  priorities: string | null;
  focus_areas: string | null;
  productivity_challenges: string | null;
  active_projects: string | null;
  // ... many more context fields
  created_at: string;
  updated_at: string;
}
```

#### LLM Usage Logs Table

```typescript
llm_usage_logs: {
  id: string;
  user_id: string;
  operation_type: string; // "brain_dump", "brief_generation", "phase_generation", etc.
  model_requested: string;
  model_used: string;
  provider: string | null;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  input_cost_usd: number;
  output_cost_usd: number;
  total_cost_usd: number;
  response_time_ms: number;
  status: string; // "success", "error", "timeout"
  created_at: string;
}
```

---

## 5. LLM Integration Patterns

### SmartLLMService

**Location:** `/apps/worker/src/lib/services/smart-llm-service.ts`

The system uses a sophisticated LLM routing service that intelligently selects models based on task requirements.

#### Model Profiles

**JSON Generation Profiles:**

- `fast` - DeepSeek Chat V3, Qwen 2.5 72B ($0.14-0.35/1M tokens)
- `balanced` - DeepSeek + Qwen + Gemini Flash
- `powerful` - DeepSeek + Qwen + Gemini Flash
- `maximum` - DeepSeek + Qwen + GPT-4o

**Text Generation Profiles:**

- `speed` - Llama 3.1 8B Groq, Gemini Flash 8B ($0.05-0.08/1M tokens)
- `balanced` - DeepSeek Chat V3 ($0.14/1M tokens)
- `quality` - DeepSeek + Qwen + Gemini Flash
- `creative` - DeepSeek + Qwen + GPT-4o

#### Key Features

1. **Automatic Model Selection**
   - Analyzes prompt complexity
   - Considers cost, speed, and quality requirements
   - Provides fallback models via OpenRouter

2. **Cost Optimization**
   - DeepSeek as primary model (95% cost reduction vs Anthropic)
   - Tracks costs per model and operation
   - Automatic retry with more powerful models on JSON parse errors

3. **Provider Routing**
   ```typescript
   {
     order: ["deepseek", "qwen", "google", "anthropic"],
     allow_fallbacks: true,
     require_parameters: true,
     data_collection: "deny"
   }
   ```

#### Usage Pattern

**JSON Response:**

```typescript
const llmService = new SmartLLMService({
  apiKey: process.env.PRIVATE_OPENROUTER_API_KEY,
  supabase: supabase,
});

const result = await llmService.getJSONResponse({
  systemPrompt: "You are an expert at analyzing projects...",
  userPrompt: "Analyze this project and generate phases...",
  userId: userId,
  profile: "balanced", // or "fast", "powerful", "maximum"
  temperature: 0.2,
  validation: {
    retryOnParseError: true,
    maxRetries: 2,
  },
});
```

**Text Generation:**

```typescript
const text = await llmService.generateText({
  prompt: "Generate a brief summary...",
  userId: userId,
  profile: "balanced", // or "speed", "quality", "creative"
  temperature: 0.7,
  maxTokens: 4096,
});
```

---

## 6. Job Processing Patterns

### Job Adapter Pattern

**Purpose:** Provides backward compatibility for transitioning from BullMQ to Supabase queue.

**Location:** `/apps/worker/src/workers/shared/jobAdapter.ts`

```typescript
export interface LegacyJob<T = any> {
  id: string;
  data: T & { userId: string };
  attemptsMade: number;
  log: (message: string) => Promise<void>;
  updateProgress: (progress: JobProgress) => Promise<void>;
}

export function createLegacyJob<T = any>(
  processingJob: ProcessingJob<T>,
): LegacyJob<T> {
  return {
    id: processingJob.id,
    data: { ...processingJob.data, userId: processingJob.userId } as T & {
      userId: string;
    },
    attemptsMade: processingJob.attempts,
    log: processingJob.log,
    updateProgress: processingJob.updateProgress,
  };
}
```

### Existing Job Processors

#### 1. Brief Generation (`generate_daily_brief`)

**Location:** `/apps/worker/src/workers/brief/briefWorker.ts`

**Process:**

1. Resolve user timezone
2. Calculate brief date
3. Fetch projects, tasks, notes, phases, calendar events (parallel)
4. Generate per-project briefs (parallel)
5. Consolidate into main brief
6. Generate LLM analysis
7. Save to `daily_briefs` table
8. Emit notification event

**LLM Usage:**

- Profile: `balanced`
- Model: DeepSeek Chat V3
- Purpose: Generate insights and priority actions
- Cost: ~$0.001-0.003 per brief

#### 2. Phase Generation (`generate_phases`)

**Location:** `/apps/worker/src/workers/phases/phasesWorker.ts`

**Process:**

1. Fetch project data
2. Load strategy prompt template
3. Call LLM to generate phases JSON
4. Parse and validate response
5. Create phases in database
6. Create tasks for each phase
7. Link tasks to phases with reasoning

**LLM Usage:**

- Profile: `balanced`
- Model: DeepSeek Chat V3
- Purpose: Generate project phases and task breakdown
- Output: JSON with phases array

#### 3. Onboarding Analysis (`onboarding_analysis`)

**Location:** `/apps/worker/src/workers/onboarding/onboardingWorker.ts`

**Process:**

1. Fetch user context from onboarding input
2. Analyze using LLM
3. Extract projects, tasks, and insights
4. Create initial project structure
5. Update user context table

---

## 7. Task & Project Management

### Task Lifecycle

```
Created (pending) → In Progress → Completed
                  ↘ Cancelled
```

### Task Sources

1. **Brain Dump** - Extracted by AI from unstructured text
2. **Manual** - Created by user
3. **Calendar** - Synced from Google Calendar
4. **AI Generated** - Created by phase generation or other AI processes

### Task Dependencies

Tasks can have dependencies via the `dependencies` field (array of task IDs).

**Dependency Types:**

- Hard dependencies (must complete before next can start)
- Soft dependencies (suggested order)

### Subtasks

Tasks can have parent-child relationships via `parent_task_id`.

### Recurring Tasks

Tasks can recur with patterns stored in `recurrence_pattern` field.

**Instances Table:**

```typescript
recurring_task_instances: {
  id: string;
  task_id: string;
  user_id: string;
  instance_date: string;
  status: string;
  completed_at: string | null;
  skipped: boolean | null;
  calendar_event_id: string | null;
  created_at: string;
}
```

---

## 8. Communication & Notifications

### Notification System

**Architecture:** Event-driven with multi-channel delivery

**Tables:**

```typescript
notification_events: {
  id: string;
  event_type: string; // "brief.completed", "task.created", etc.
  event_source: string; // "worker_job", "web_app", "scheduler"
  target_user_id: string | null;
  actor_user_id: string | null;
  payload: Json;
  metadata: Json | null;
  correlation_id: string | null; // For tracking across services
  created_at: string;
}

notification_deliveries: {
  id: string;
  event_id: string | null;
  recipient_user_id: string;
  channel: string; // "email", "sms", "push", "in_app"
  status: string; // "pending", "sent", "delivered", "failed"
  payload: Json;
  channel_identifier: string | null; // email address, phone number, etc.
  external_id: string | null; // Twilio SID, email tracking ID, etc.
  tracking_id: string | null;
  correlation_id: string | null;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  created_at: string;
  sent_at: string | null;
  delivered_at: string | null;
}
```

### Emitting Notifications

```typescript
// Worker emits notification event
await supabase.rpc("emit_notification_event", {
  p_event_type: "brief.completed",
  p_event_source: "worker_job",
  p_target_user_id: userId,
  p_payload: {
    brief_id: briefId,
    brief_date: briefDate,
    task_count: taskCount,
  },
  p_metadata: {
    correlationId: generateCorrelationId(),
  },
});
```

### Notification Channels

1. **Email** - Via SMTP or webhook
2. **SMS** - Via Twilio (optional, requires configuration)
3. **Push** - Via Web Push API
4. **In-App** - Real-time via Supabase Realtime

---

## 9. Existing Agentic Patterns

### Brain Dump Processing

**Location:** `/apps/web/src/routes/api/brain-dump/process/+server.ts`

**Agentic Characteristics:**

- **Dual Processing:** Runs context extraction and task extraction in parallel
- **Multi-step Reasoning:** Preparatory analysis → Extraction → Validation → Execution
- **Streaming:** Real-time progress updates via SSE
- **Auto-execution:** Can automatically execute operations with high confidence

**Flow:**

```
User Input (Stream-of-consciousness)
    ↓
Preparatory Analysis (LLM)
    ↓
┌─────────────┬─────────────┐
│   Context   │    Tasks    │
│  Extraction │  Extraction │
│    (LLM)    │    (LLM)    │
└──────┬──────┴──────┬──────┘
       │             │
       └─────┬───────┘
             ↓
    Merge & Validate
             ↓
   ┌─────────┴─────────┐
   │  Auto-Accept?     │
   └───┬───────────┬───┘
       │           │
    Yes│           │No
       │           │
       ↓           ↓
   Execute    User Review
   Operations     ↓
       │      User Confirms
       │           ↓
       └───────→Execute
                   ↓
              Success
```

**Key Pattern: Dual Processing**

```typescript
const [contextResult, tasksResult] = await Promise.all([
  extractContext(systemPrompt, userContent),
  extractTasks(systemPrompt, userContent),
]);

const mergedOperations = mergeOperations(contextResult, tasksResult);
```

**Key Pattern: Streaming Progress**

```typescript
// Server sends SSE events
res.write(`data: ${JSON.stringify({ phase: "analysis", progress: 25 })}\n\n`);
res.write(`data: ${JSON.stringify({ phase: "extraction", progress: 50 })}\n\n`);
res.write(`data: ${JSON.stringify({ phase: "validation", progress: 75 })}\n\n`);
res.write(
  `data: ${JSON.stringify({ phase: "complete", result: operations })}\n\n`,
);
```

---

## 10. Requirements for Agentic Workflow

### Core Requirements

1. **Long-Running Tasks**
   - Must handle tasks that take minutes to hours
   - Progress tracking with real-time updates
   - Ability to pause/resume
   - Graceful failure and recovery

2. **Multi-Step Reasoning**
   - Break down complex tasks into subtasks
   - Execute subtasks in parallel or sequence
   - Validate results at each step
   - Aggregate results

3. **Tool Usage**
   - Access to database operations (read/write)
   - Access to LLM services
   - Access to external APIs (calendar, etc.)
   - File operations if needed

4. **State Management**
   - Persist workflow state in database
   - Resume from any step
   - Handle retries and failures
   - Track decision history

5. **User Interaction**
   - Request clarifications when needed
   - Show progress in real-time
   - Allow user intervention
   - Provide explanations of decisions

6. **Cost Management**
   - Track LLM token usage
   - Optimize model selection
   - Batch operations when possible
   - Budget constraints per workflow

### Workflow Types to Support

1. **Project Planning Workflow**
   - Analyze project requirements
   - Generate comprehensive project plan
   - Create phases and tasks
   - Assign priorities and dependencies
   - Schedule tasks on calendar

2. **Task Decomposition Workflow**
   - Break complex task into subtasks
   - Identify dependencies
   - Estimate durations
   - Generate actionable steps

3. **Research Workflow**
   - Gather information from notes and context
   - Synthesize findings
   - Generate summary report
   - Create follow-up tasks

4. **Optimization Workflow**
   - Analyze current projects and tasks
   - Identify bottlenecks
   - Suggest reorganization
   - Propose task consolidation

5. **Calendar Analysis Workflow**
   - Analyze calendar patterns
   - Identify recurring meetings/events
   - Suggest project creation
   - Generate tasks from meetings

---

## 11. Integration Points

### Where to Add Agentic Workflow Job Type

**1. Define Job Type**

Add to `/packages/shared-types/src/queue.types.ts`:

```typescript
export type QueueJobType =
  | "generate_daily_brief"
  | "generate_phases"
  | "onboarding_analysis"
  | "send_sms"
  | "send_notification"
  | "agentic_workflow"; // NEW

export interface AgenticWorkflowJobData {
  userId: string;
  workflowType: string; // "project_planning", "task_decomposition", etc.
  input: {
    taskId?: string;
    projectId?: string;
    userPrompt?: string;
    context?: any;
  };
  options: {
    maxSteps?: number;
    maxCost?: number;
    autoExecute?: boolean;
    requireConfirmation?: boolean;
  };
}

export interface JobMetadataMap {
  // ... existing types
  agentic_workflow: AgenticWorkflowJobData;
}
```

**2. Create Worker Processor**

Create `/apps/worker/src/workers/agentic/agenticWorkflowWorker.ts`:

```typescript
import { LegacyJob } from "../shared/jobAdapter";
import { AgenticWorkflowJobData } from "../shared/queueUtils";
import { AgenticWorkflowEngine } from "./agenticWorkflowEngine";

export async function processAgenticWorkflow(
  job: LegacyJob<AgenticWorkflowJobData>,
) {
  await job.log("Starting agentic workflow");

  const engine = new AgenticWorkflowEngine({
    userId: job.data.userId,
    workflowType: job.data.workflowType,
    supabase: supabase,
    llmService: llmService,
  });

  const result = await engine.execute(job.data.input, job.data.options);

  return result;
}
```

**3. Register Processor**

In `/apps/worker/src/worker.ts`:

```typescript
queue.process("agentic_workflow", processAgenticWorkflowWrapper);

async function processAgenticWorkflowWrapper(job: ProcessingJob) {
  await job.log("Processing agentic workflow");

  try {
    const legacyJob = createLegacyJob(job);
    await processAgenticWorkflow(legacyJob);
    await job.log("✅ Agentic workflow completed");

    return { success: true };
  } catch (error: any) {
    await job.log(`❌ Agentic workflow failed: ${error.message}`);
    throw error;
  }
}
```

**4. API Endpoint**

Create endpoint in `/apps/worker/src/index.ts`:

```typescript
app.post("/queue/agentic-workflow", async (req, res) => {
  const { userId, workflowType, input, options } = req.body;

  if (!userId || !workflowType) {
    return res.status(400).json({
      error: "userId and workflowType required",
    });
  }

  const job = await queue.add(
    "agentic_workflow",
    userId,
    { workflowType, input, options },
    { priority: 5 },
  );

  return res.json({
    success: true,
    jobId: job.queue_job_id,
  });
});
```

### Database Tables for Agentic Workflow

**Create Workflow State Table:**

```sql
CREATE TABLE agentic_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users NOT NULL,
  workflow_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',

  -- Input/Output
  input JSONB NOT NULL,
  output JSONB,

  -- Execution tracking
  current_step INTEGER DEFAULT 0,
  total_steps INTEGER,
  step_history JSONB DEFAULT '[]'::jsonb,

  -- State
  state JSONB DEFAULT '{}'::jsonb,
  variables JSONB DEFAULT '{}'::jsonb,

  -- Costs
  total_tokens INTEGER DEFAULT 0,
  total_cost_usd NUMERIC DEFAULT 0,

  -- Metadata
  queue_job_id TEXT,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  started_at TIMESTAMP,
  completed_at TIMESTAMP,

  CONSTRAINT fk_queue_job FOREIGN KEY (queue_job_id)
    REFERENCES queue_jobs(queue_job_id)
);

CREATE TABLE agentic_workflow_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID REFERENCES agentic_workflows NOT NULL,
  step_number INTEGER NOT NULL,
  step_type TEXT NOT NULL,

  -- Step details
  input JSONB NOT NULL,
  output JSONB,
  reasoning TEXT,

  -- Execution
  status TEXT NOT NULL DEFAULT 'pending',
  started_at TIMESTAMP,
  completed_at TIMESTAMP,

  -- LLM usage
  model_used TEXT,
  tokens_used INTEGER,
  cost_usd NUMERIC,

  -- Error handling
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,

  created_at TIMESTAMP DEFAULT NOW(),

  UNIQUE (workflow_id, step_number)
);

CREATE INDEX idx_workflows_user_status ON agentic_workflows(user_id, status);
CREATE INDEX idx_workflow_steps_workflow ON agentic_workflow_steps(workflow_id, step_number);
```

---

## 12. Code Patterns & Examples

### Pattern 1: Parallel LLM Calls

```typescript
const [analysis, suggestions] = await Promise.all([
  llmService.getJSONResponse({
    systemPrompt: "Analyze the project...",
    userPrompt: projectData,
    userId,
    profile: "balanced",
  }),
  llmService.getJSONResponse({
    systemPrompt: "Suggest improvements...",
    userPrompt: projectData,
    userId,
    profile: "fast",
  }),
]);
```

### Pattern 2: Progress Tracking

```typescript
async function executeWorkflow(job: ProcessingJob) {
  const totalSteps = 5;

  await job.updateProgress({
    current: 1,
    total: totalSteps,
    message: "Analyzing input",
  });

  const analysis = await analyzeInput();

  await job.updateProgress({
    current: 2,
    total: totalSteps,
    message: "Generating plan",
  });

  // ... continue with steps
}
```

### Pattern 3: State Persistence

```typescript
class WorkflowEngine {
  private async saveState(workflowId: string, state: any) {
    await supabase
      .from("agentic_workflows")
      .update({
        state,
        updated_at: new Date().toISOString(),
      })
      .eq("id", workflowId);
  }

  private async loadState(workflowId: string) {
    const { data } = await supabase
      .from("agentic_workflows")
      .select("state, current_step, variables")
      .eq("id", workflowId)
      .single();

    return data;
  }

  async resumeWorkflow(workflowId: string) {
    const state = await this.loadState(workflowId);
    // Resume from current_step
    await this.executeFromStep(state.current_step, state);
  }
}
```

### Pattern 4: Tool Execution

```typescript
interface Tool {
  name: string;
  description: string;
  execute: (params: any) => Promise<any>;
}

const tools: Tool[] = [
  {
    name: "fetch_project_tasks",
    description: "Fetch all tasks for a project",
    execute: async ({ projectId }) => {
      const { data } = await supabase
        .from("tasks")
        .select("*")
        .eq("project_id", projectId);
      return data;
    },
  },
  {
    name: "create_task",
    description: "Create a new task",
    execute: async ({ projectId, title, description }) => {
      const { data } = await supabase
        .from("tasks")
        .insert({ project_id: projectId, title, description, user_id })
        .select()
        .single();
      return data;
    },
  },
];

async function executeTool(toolName: string, params: any) {
  const tool = tools.find((t) => t.name === toolName);
  if (!tool) throw new Error(`Tool not found: ${toolName}`);

  return await tool.execute(params);
}
```

### Pattern 5: LLM with Tool Calling

```typescript
async function agenticStep(context: string, availableTools: Tool[]) {
  const systemPrompt = `
You are an AI agent that can use tools to accomplish tasks.

Available tools:
${availableTools.map((t) => `- ${t.name}: ${t.description}`).join("\n")}

Respond with JSON:
{
  "reasoning": "Why you chose this action",
  "action": "tool_name",
  "parameters": { ... },
  "is_final": false
}
`;

  const response = await llmService.getJSONResponse({
    systemPrompt,
    userPrompt: context,
    userId,
    profile: "balanced",
  });

  if (response.action === "finish") {
    return { done: true, result: response.result };
  }

  const toolResult = await executeTool(response.action, response.parameters);

  return {
    done: false,
    result: toolResult,
    nextContext: `${context}\n\nTool ${response.action} returned: ${JSON.stringify(toolResult)}`,
  };
}
```

---

## 13. Performance & Scalability

### Current Metrics

**Queue Processing:**

- Poll interval: 5 seconds
- Batch size: 5 jobs per claim
- Concurrent processing: Yes (Promise.allSettled)
- Max attempts: 3 with exponential backoff

**LLM Performance:**

- DeepSeek Chat V3: 2-4s response time
- Token limits: 8192 output tokens typical
- Cost: $0.14 per 1M input tokens, $0.28 per 1M output tokens

### Scaling Strategies

1. **Horizontal Worker Scaling**
   - Multiple worker instances claim jobs independently
   - No coordination needed (atomic claiming)
   - Linear scalability

2. **Job Prioritization**
   - Priority 1 = urgent/immediate
   - Priority 10 = normal/scheduled
   - Can create separate workers for priority levels

3. **Workflow Optimization**
   - Parallel step execution where possible
   - Caching of repeated LLM calls
   - Batch operations for database queries

### Constraints & Considerations

1. **Serverless Timeout**
   - Vercel: 60 seconds (extendable)
   - Railway: No timeout (long-running)
   - **Recommendation:** Run agentic workflows in worker service

2. **Database Connection Pool**
   - Supabase: 100 connections via PgBouncer
   - Be mindful of connection usage

3. **LLM Rate Limits**
   - OpenRouter handles rate limiting
   - Fallback routing helps avoid limits
   - Track usage to stay within budget

4. **Cost Management**
   - Set `maxCost` option for workflows
   - Track cumulative costs
   - Abort if budget exceeded

---

## Appendix A: File Locations Reference

### Key Files for Agentic Workflow Development

**Worker Service:**

- `/apps/worker/src/worker.ts` - Job processor registration
- `/apps/worker/src/index.ts` - API endpoints for job queuing
- `/apps/worker/src/lib/supabaseQueue.ts` - Queue implementation
- `/apps/worker/src/lib/services/smart-llm-service.ts` - LLM service
- `/apps/worker/src/workers/shared/jobAdapter.ts` - Job adapter pattern
- `/apps/worker/src/workers/brief/briefWorker.ts` - Example job processor
- `/apps/worker/src/workers/phases/phasesWorker.ts` - Phase generation example

**Shared Types:**

- `/packages/shared-types/src/queue.types.ts` - Queue job type definitions
- `/packages/shared-types/src/database.types.ts` - Database schema types
- `/packages/shared-types/src/database.schema.ts` - Lightweight schema

**Documentation:**

- `/docs/architecture/diagrams/WEB-WORKER-ARCHITECTURE.md` - Architecture overview
- `/docs/architecture/diagrams/QUEUE-SYSTEM-FLOW.md` - Queue system details
- `/docs/DEPLOYMENT_TOPOLOGY.md` - Deployment structure

---

## Appendix B: Environment Variables

**Required for Agentic Workflow:**

```bash
# OpenRouter API (for LLM calls)
PRIVATE_OPENROUTER_API_KEY=your_key_here

# Supabase (for database and queue)
PUBLIC_SUPABASE_URL=https://xxx.supabase.co
PRIVATE_SUPABASE_SERVICE_KEY=your_service_key

# Optional: OpenAI (for embeddings if needed)
OPENAI_API_KEY=sk-xxx
```

**Optional Configuration:**

```bash
# Queue settings
QUEUE_POLL_INTERVAL=5000
QUEUE_BATCH_SIZE=5
QUEUE_MAX_RETRIES=3

# LLM settings (can override in code)
DEFAULT_LLM_PROFILE=balanced
DEFAULT_LLM_TEMPERATURE=0.2
```

---

## Summary

This document provides comprehensive context for building an agentic workflow system in BuildOS:

✅ **Architecture:** Dual-service with Supabase-based queue, no Redis required
✅ **Queue System:** Atomic job claiming, retry logic, progress tracking
✅ **Database:** Complete schema with tasks, projects, phases, workflow tables
✅ **LLM Integration:** SmartLLMService with multiple models, cost optimization
✅ **Job Patterns:** Existing processors as reference implementations
✅ **Communication:** Real-time via Supabase Realtime, multi-channel notifications
✅ **Integration Points:** Clear guidance on where to add new job types
✅ **Code Examples:** Patterns for parallel execution, progress tracking, tool calling

The system is designed to be extended with agentic workflows that can:

- Run long-duration tasks
- Execute multi-step reasoning
- Use tools (database, LLM, external APIs)
- Track state and progress
- Handle failures gracefully
- Optimize costs

Next step: Design the agentic workflow engine architecture using this context.
