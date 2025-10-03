# Type Inconsistency Fix Plan

## Current State Analysis

### 1. Database Enums (Already Exist)

The database already has proper enums defined:

- `queue_status`: "pending" | "processing" | "completed" | "failed" | "cancelled" | "retrying"
- `queue_type`: "generate_daily_brief" | "generate_phases" | "sync_calendar" | "process_brain_dump" | "send_email" | "update_recurring_tasks" | "cleanup_old_data" | "onboarding_analysis" | "other"
- `task_status`: "backlog" | "in_progress" | "done" | "blocked"
- `priority_level`: "low" | "medium" | "high"

### 2. Type Inconsistencies Found

#### A. Wrong Enum Values

- **Location**: `packages/shared-types/src/index.ts:17`
- **Issue**: Uses `"daily_brief"` instead of `"generate_daily_brief"`
- **Issue**: Uses `"project_brief"` which doesn't exist in database
- **Issue**: Uses `"phase_generation"` instead of `"generate_phases"`

#### B. Missing Status Values

- **Location**: `packages/shared-types/src/index.ts:18`
- **Issue**: Missing `"cancelled"` and `"retrying"` status values

#### C. Weak Typing with 'any'

- **Locations**:
  - `metadata?: Record<string, any>` throughout
  - `generation_progress?: any` in daily briefs
  - `result?: any` in queue jobs

#### D. Multiple QueueJob Definitions

- One in `packages/shared-types/src/index.ts` (wrong values)
- One referenced in `apps/web/src/lib/services/railwayWorker.service.ts`
- References to database types in various places

## Implementation Plan

### Phase 1: Create Strongly Typed Interfaces (Priority: HIGH)

#### 1.1 Create New Type Definitions File

**File**: `packages/shared-types/src/queue-types.ts`

```typescript
import type { Database } from "./database.types";

// Re-export database enums as the single source of truth
export type QueueJobType = Database["public"]["Enums"]["queue_type"];
export type QueueJobStatus = Database["public"]["Enums"]["queue_status"];

// Metadata interfaces for each job type
export interface DailyBriefJobMetadata {
  briefDate: string; // YYYY-MM-DD format
  timezone: string; // IANA timezone
  forceRegenerate?: boolean;
  includeProjects?: string[];
  excludeProjects?: string[];
  customTemplate?: string;
  requestedBriefDate?: string;
  generation_progress?: BriefGenerationProgress;
}

export interface BriefGenerationProgress {
  step: BriefGenerationStep;
  progress: number; // 0-100
  message?: string;
  projects?: {
    completed: number;
    total: number;
    failed: number;
  };
  timestamp: string; // ISO timestamp
}

export type BriefGenerationStep =
  | "idle"
  | "initializing"
  | "starting"
  | "queued"
  | "gathering_data"
  | "data_gathered"
  | "fetching_projects"
  | "generating_project_briefs"
  | "consolidating_briefs"
  | "generating_main_brief"
  | "finalizing"
  | "completed"
  | "error";

export interface PhaseGenerationJobMetadata {
  projectId: string;
  regenerate?: boolean;
  template?: string;
  includeExistingTasks?: boolean;
}

export interface OnboardingAnalysisJobMetadata {
  userId: string;
  step: "initial" | "preferences" | "complete";
  responses?: Record<string, unknown>;
}

export interface CalendarSyncJobMetadata {
  calendarId: string;
  syncDirection: "to_google" | "from_google" | "bidirectional";
  dateRange?: {
    start: string;
    end: string;
  };
}

export interface BrainDumpProcessJobMetadata {
  brainDumpId: string;
  processMode: "full" | "quick";
  projectId?: string;
}

export interface EmailJobMetadata {
  recipientUserId: string;
  emailType: "daily_brief" | "welcome" | "trial_ending" | "payment_failed";
  templateId?: string;
  variables?: Record<string, string | number | boolean>;
}

// Map job types to their metadata
export interface JobMetadataMap {
  generate_daily_brief: DailyBriefJobMetadata;
  generate_phases: PhaseGenerationJobMetadata;
  onboarding_analysis: OnboardingAnalysisJobMetadata;
  sync_calendar: CalendarSyncJobMetadata;
  process_brain_dump: BrainDumpProcessJobMetadata;
  send_email: EmailJobMetadata;
  update_recurring_tasks: Record<string, unknown>;
  cleanup_old_data: Record<string, unknown>;
  other: Record<string, unknown>;
}

// Generic queue job with type-safe metadata
export interface QueueJob<T extends QueueJobType = QueueJobType> {
  id: string;
  queue_job_id: string;
  user_id: string;
  job_type: T;
  status: QueueJobStatus;
  scheduled_for: string;
  metadata: JobMetadataMap[T] | null;
  attempts: number;
  max_attempts: number;
  priority: number | null;
  created_at: string;
  updated_at: string | null;
  started_at: string | null;
  processed_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  result: JobResultMap[T] | null;
}

// Job result types
export interface JobResultMap {
  generate_daily_brief: DailyBriefResult;
  generate_phases: PhaseGenerationResult;
  onboarding_analysis: OnboardingAnalysisResult;
  sync_calendar: CalendarSyncResult;
  process_brain_dump: BrainDumpProcessResult;
  send_email: EmailSendResult;
  update_recurring_tasks: { updated: number };
  cleanup_old_data: { deleted: number };
  other: unknown;
}

export interface DailyBriefResult {
  briefId: string;
  briefDate: string;
  projectBriefsGenerated: number;
  emailSent: boolean;
  generationTimeMs: number;
}

export interface PhaseGenerationResult {
  projectId: string;
  phasesCreated: string[];
  tasksAssigned: number;
}

export interface OnboardingAnalysisResult {
  analysisComplete: boolean;
  suggestedProjects?: string[];
  userProfile?: Record<string, unknown>;
}

export interface CalendarSyncResult {
  eventsCreated: number;
  eventsUpdated: number;
  eventsDeleted: number;
  conflicts: string[];
}

export interface BrainDumpProcessResult {
  projectsCreated: string[];
  tasksCreated: string[];
  processingTimeMs: number;
}

export interface EmailSendResult {
  sent: boolean;
  messageId?: string;
  error?: string;
}

// Type guards
export function isValidJobMetadata<T extends QueueJobType>(
  jobType: T,
  metadata: unknown,
): metadata is JobMetadataMap[T] {
  // Implementation for each job type
  switch (jobType) {
    case "generate_daily_brief":
      return isDailyBriefMetadata(metadata);
    case "generate_phases":
      return isPhaseGenerationMetadata(metadata);
    // ... other cases
    default:
      return true;
  }
}

function isDailyBriefMetadata(obj: unknown): obj is DailyBriefJobMetadata {
  if (!obj || typeof obj !== "object") return false;
  const meta = obj as Record<string, unknown>;
  return (
    typeof meta.briefDate === "string" &&
    typeof meta.timezone === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(meta.briefDate as string)
  );
}

function isPhaseGenerationMetadata(
  obj: unknown,
): obj is PhaseGenerationJobMetadata {
  if (!obj || typeof obj !== "object") return false;
  const meta = obj as Record<string, unknown>;
  return typeof meta.projectId === "string";
}
```

### Phase 2: Update Existing Types (Priority: HIGH)

#### 2.1 Fix packages/shared-types/src/index.ts

- Remove the incorrect QueueJob interface
- Import and re-export from new queue-types.ts
- Remove all references to wrong enum values

#### 2.2 Create migration to ensure database consistency

**File**: `apps/web/supabase/migrations/20250927_enforce_queue_types.sql`

```sql
-- Ensure queue_type enum has all required values
DO $$
BEGIN
    -- Check if the enum exists and has correct values
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_enum e ON t.oid = e.enumtypid
        WHERE t.typname = 'queue_type'
        AND e.enumlabel = 'generate_daily_brief'
    ) THEN
        RAISE EXCEPTION 'queue_type enum is missing expected values';
    END IF;
END $$;

-- Add check constraints to enforce valid combinations
ALTER TABLE queue_jobs
ADD CONSTRAINT valid_job_metadata CHECK (
    CASE
        WHEN job_type = 'generate_daily_brief' THEN
            metadata ? 'briefDate' AND metadata ? 'timezone'
        WHEN job_type = 'generate_phases' THEN
            metadata ? 'projectId'
        ELSE TRUE
    END
);
```

### Phase 3: Update All References (Priority: MEDIUM)

#### 3.1 Update imports in web app

- `apps/web/src/lib/services/railwayWorker.service.ts`
- `apps/web/src/lib/services/briefClient.service.ts`
- Any other files importing queue types

#### 3.2 Update imports in worker app

- `apps/worker/src/lib/supabaseQueue.ts`
- `apps/worker/src/workers/shared/queueUtils.ts`
- `apps/worker/src/workers/brief/briefWorker.ts`

### Phase 4: Add Validation (Priority: MEDIUM)

#### 4.1 Create validation utility

**File**: `packages/shared-types/src/validation.ts`

```typescript
import { z } from "zod";
import type { QueueJobType, JobMetadataMap } from "./queue-types";

// Zod schemas for runtime validation
export const DailyBriefMetadataSchema = z.object({
  briefDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timezone: z.string(),
  forceRegenerate: z.boolean().optional(),
  includeProjects: z.array(z.string()).optional(),
  excludeProjects: z.array(z.string()).optional(),
  customTemplate: z.string().optional(),
});

export const PhaseGenerationMetadataSchema = z.object({
  projectId: z.string().uuid(),
  regenerate: z.boolean().optional(),
  template: z.string().optional(),
  includeExistingTasks: z.boolean().optional(),
});

// Validation function
export function validateJobMetadata<T extends QueueJobType>(
  jobType: T,
  metadata: unknown,
): JobMetadataMap[T] {
  switch (jobType) {
    case "generate_daily_brief":
      return DailyBriefMetadataSchema.parse(metadata) as JobMetadataMap[T];
    case "generate_phases":
      return PhaseGenerationMetadataSchema.parse(metadata) as JobMetadataMap[T];
    default:
      return metadata as JobMetadataMap[T];
  }
}
```

### Phase 5: Create API Response Types (Priority: LOW)

#### 5.1 Create standardized API types

**File**: `packages/shared-types/src/api-types.ts`

```typescript
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
  timestamp: string;
}

export interface ApiError {
  code: ErrorCode;
  message: string;
  details?: unknown;
  status: number;
}

export enum ErrorCode {
  // Authentication
  UNAUTHORIZED = "UNAUTHORIZED",
  FORBIDDEN = "FORBIDDEN",

  // Validation
  INVALID_REQUEST = "INVALID_REQUEST",
  INVALID_JOB_TYPE = "INVALID_JOB_TYPE",
  INVALID_METADATA = "INVALID_METADATA",

  // Queue specific
  JOB_NOT_FOUND = "JOB_NOT_FOUND",
  JOB_ALREADY_PROCESSING = "JOB_ALREADY_PROCESSING",

  // Brief specific
  BRIEF_ALREADY_EXISTS = "BRIEF_ALREADY_EXISTS",
  BRIEF_GENERATION_FAILED = "BRIEF_GENERATION_FAILED",
}
```

## Migration Strategy

### Step 1: Create new type files (Day 1)

1. Create `queue-types.ts` with all proper types
2. Create `validation.ts` with validation schemas
3. Create `api-types.ts` for API responses

### Step 2: Update shared-types package (Day 1)

1. Remove incorrect QueueJob interface from index.ts
2. Re-export new types from queue-types.ts
3. Publish updated package

### Step 3: Update web app (Day 2)

1. Update all imports to use new types
2. Replace any 'any' types with specific interfaces
3. Add validation where needed

### Step 4: Update worker app (Day 2)

1. Update all imports to use new types
2. Add metadata validation in job processors
3. Update error handling to use new error codes

### Step 5: Database migration (Day 3)

1. Run migration to add check constraints
2. Verify all existing data conforms to new types
3. Update any non-conforming data

## Testing Plan

### Unit Tests

- Test all type guards
- Test validation functions
- Test metadata parsing

### Integration Tests

- Test job creation with proper metadata
- Test job processing with type validation
- Test API endpoints with new types

### End-to-End Tests

- Test complete daily brief flow
- Test phase generation flow
- Test error handling

## Rollback Plan

If issues arise:

1. Revert type changes in shared-types
2. Redeploy apps with previous version
3. Remove database constraints if added

## Success Metrics

- Zero TypeScript errors
- All `any` types replaced
- 100% type coverage for queue operations
- No runtime type errors in production
