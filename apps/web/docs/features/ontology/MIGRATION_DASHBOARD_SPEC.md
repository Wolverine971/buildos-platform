# Migration Dashboard Specification

> **Version:** 2.2
> **Last Updated:** 2025-12-07
> **Status:** Complete (Phases 1-7)

---

## Implementation Progress

### Completed Components

| Phase       | Component                                         | Status      | Notes                                                         |
| ----------- | ------------------------------------------------- | ----------- | ------------------------------------------------------------- |
| **Phase 1** | Database Schema                                   | ✅ Complete | `supabase/migrations/20251206_migration_dashboard_schema.sql` |
| **Phase 1** | `migration-stats.service.ts`                      | ✅ Complete | Global progress, user stats, lock management                  |
| **Phase 1** | `migration-error.service.ts`                      | ✅ Complete | Error retrieval, classification, remediation                  |
| **Phase 1** | `migration-retry.service.ts`                      | ✅ Complete | Targeted retry with backoff                                   |
| **Phase 1** | `GET /api/admin/migration/progress`               | ✅ Complete | Global stats endpoint                                         |
| **Phase 1** | `GET /api/admin/migration/users`                  | ✅ Complete | Paginated user list                                           |
| **Phase 1** | `GET /api/admin/migration/errors`                 | ✅ Complete | Filterable error list                                         |
| **Phase 1** | `POST /api/admin/migration/retry`                 | ✅ Complete | Targeted retry endpoint                                       |
| **Phase 1** | `POST /api/admin/migration/refresh-stats`         | ✅ Complete | Refresh materialized view                                     |
| **Phase 1** | `GET /api/admin/migration/lock`                   | ✅ Complete | Lock status check                                             |
| **Phase 1** | `POST /api/admin/migration/pause`                 | ✅ Complete | Pause active run                                              |
| **Phase 1** | `POST /api/admin/migration/resume`                | ✅ Complete | Resume paused run                                             |
| **Phase 1** | `POST /api/admin/migration/start`                 | ✅ Enhanced | Platform-wide support, lock acquisition                       |
| **Phase 2** | `ProgressCards.svelte`                            | ✅ Complete | 4 stat cards (projects, tasks, users, errors)                 |
| **Phase 2** | `GlobalProgressBar.svelte`                        | ✅ Complete | Segmented progress visualization                              |
| **Phase 2** | `UserList.svelte`                                 | ✅ Complete | Paginated, searchable, filterable                             |
| **Phase 2** | `RecentRuns.svelte`                               | ✅ Complete | Run history with actions                                      |
| **Phase 2** | `ConfirmationModal.svelte`                        | ✅ Complete | Type-to-confirm modal with cost estimation                    |
| **Phase 2** | `ErrorBrowser.svelte`                             | ✅ Complete | Filterable error list with bulk actions                       |
| **Phase 2** | `/admin/migration/+page.svelte`                   | ✅ Complete | Global dashboard with tabs                                    |
| **Phase 2** | `/admin/migration/+page.server.ts`                | ✅ Complete | Server-side data loading                                      |
| **Phase 3** | `/admin/migration/users/[userId]/+page.svelte`    | ✅ Complete | User detail view                                              |
| **Phase 3** | `/admin/migration/users/[userId]/+page.server.ts` | ✅ Complete | User data loading                                             |
| **Phase 4** | `/admin/migration/errors/+page.svelte`            | ✅ Complete | Error browser page                                            |
| **Phase 4** | `/admin/migration/errors/+page.server.ts`         | ✅ Complete | Error data loading                                            |
| **Phase 5** | `migration-llm.service.ts`                        | ✅ Complete | LLM rate limiter with circuit breaker                         |
| **Phase 5** | `GET /api/admin/migration/estimate`               | ✅ Complete | Cost estimation endpoint                                      |
| **Phase 5** | Cost estimation UI                                | ✅ Complete | Token/cost display in ConfirmationModal                       |
| **Phase 6** | `migration-rollback.service.ts`                   | ✅ Complete | Hard/soft rollback with cascade deletion                      |
| **Phase 6** | Enhanced rollback endpoint                        | ✅ Complete | Soft/hard modes, validation, confirmation code                |
| **Phase 7** | `migration-llm.service.test.ts`                   | ✅ Complete | 25 unit tests passing                                         |
| **Phase 7** | `migration-error.service.test.ts`                 | ✅ Complete | 24 unit tests passing                                         |

### Recent Implementation (2025-12-07)

#### Phase 5: LLM Rate Limiter & Cost Estimation

Created `migration-llm.service.ts` with:

- `LLMRateLimiter` class with circuit breaker pattern
- `estimateMigrationCost()` - Calculate costs for project batches
- `estimateCostForEntities()` - Calculate costs for specific entity counts
- `createLLMUsageMetadata()` - Create metadata for migration logs
- Token costs for DeepSeek, GPT-4o, GPT-4o-mini, GPT-4-turbo
- Processing time estimates per entity type

Created `GET /api/admin/migration/estimate` endpoint:

- Estimates cost for pending migrations
- Supports user filtering and project selection
- Returns token breakdown and model comparison

Updated `ConfirmationModal.svelte`:

- Added `costEstimate` and `showCostEstimate` props
- Displays tokens, cost, and estimated duration
- Shows model being used

#### Phase 6: Enhanced Rollback

Created `migration-rollback.service.ts` with:

- `validateRollback()` - Safety checks before rollback
- `rollback()` - Performs soft or hard rollback
- Soft mode: Sets `deleted_at` on onto\_\* entities
- Hard mode: Permanent deletion with cascade
- Removes legacy_entity_mappings entries
- Updates migration_log status

Updated `POST /api/admin/migration/rollback`:

- Added `mode: 'soft' | 'hard'` parameter
- Added `confirmationCode` requirement for hard mode
- Added `entityTypes` and `fromTimestamp` filters
- Added `GET` endpoint for validation preview

#### Phase 7: Unit Tests

Created comprehensive test suites:

- `migration-llm.service.test.ts` - 25 tests for rate limiter and cost estimation
- `migration-error.service.test.ts` - 24 tests for error classification and remediation

### Remaining Optional Work

| Item                   | Priority | Notes                                |
| ---------------------- | -------- | ------------------------------------ |
| Integration tests      | Low      | Orchestrator integration tests       |
| E2E tests              | Low      | Dashboard flow tests with Playwright |
| Real-time subscription | Medium   | Supabase Realtime for live progress  |
| Run detail page        | Low      | `/admin/migration/runs/[runId]` view |

### Required Setup Steps

Before using the dashboard:

1. **Apply database migration:**

    ```bash
    npx supabase migration up
    # Or manually apply: supabase/migrations/20251206_migration_dashboard_schema.sql
    ```

2. **Regenerate TypeScript types:**

    ```bash
    npx supabase gen types typescript --project-id <project-id> > packages/shared-types/src/database.types.ts
    ```

3. **Refresh materialized view (initial):**
    ```sql
    SELECT refresh_user_migration_stats();
    ```

### Known Type Errors

The services reference columns (`user_id`, `retry_count`, `error_category`, `last_retry_at`) that will be added by the migration. Until the migration is applied and types regenerated, TypeScript will show errors. These are expected and will resolve after setup.

---

## Table of Contents

1. [Overview](#overview)
2. [Goals & Non-Goals](#goals--non-goals)
3. [Current State Analysis](#current-state-analysis)
4. [Architecture](#architecture)
5. [Database Schema](#database-schema)
6. [API Reference](#api-reference)
7. [UI Specification](#ui-specification)
8. [Error Handling & Recovery](#error-handling--recovery)
9. [LLM Integration & Cost Controls](#llm-integration--cost-controls)
10. [Rollback Strategy](#rollback-strategy)
11. [Performance & Scaling](#performance--scaling)
12. [Real-Time Updates](#real-time-updates)
13. [Security & Authorization](#security--authorization)
14. [Testing Strategy](#testing-strategy)
15. [Implementation Plan](#implementation-plan)
16. [Success Metrics & SLOs](#success-metrics--slos)
17. [Decision Log](#decision-log)
18. [Related Documentation](#related-documentation)

---

## Overview

This specification defines the admin dashboard and backend infrastructure for migrating all users' legacy `projects` to the ontology-based `onto_projects` system. The migration operates in **enhanced mode by default** (template inference + property extraction via LLM).

### Scope

| In Scope                        | Out of Scope                 |
| ------------------------------- | ---------------------------- |
| Legacy projects → onto_projects | New project creation flows   |
| Legacy phases → onto_plans      | Template authoring UI        |
| Legacy tasks → onto_tasks       | End-user migration controls  |
| Calendar event linking          | Organization/team migrations |
| Admin dashboard for visibility  | Billing/subscription impacts |
| Error recovery and retry        | Data export/import tools     |

### Key Entities Being Migrated

```
Legacy System              Ontology System
─────────────              ───────────────
projects           →       onto_projects (+ context document)
phases             →       onto_plans
tasks              →       onto_tasks
task_calendar_events →     onto_events (linked via edges)
```

---

## Goals & Non-Goals

### Goals

| #   | Goal                      | Success Criteria                                                 |
| --- | ------------------------- | ---------------------------------------------------------------- |
| G1  | **Multi-User Visibility** | View all users with migration status at a glance                 |
| G2  | **Batch Operations**      | Migrate all projects for a user or entire platform in one action |
| G3  | **Real-Time Progress**    | Live progress updates during migration runs                      |
| G4  | **Error Surfacing**       | Actionable error display with context and remediation hints      |
| G5  | **Fault Tolerance**       | Individual failures don't block other migrations                 |
| G6  | **Resumability**          | Retry failed items, resume interrupted runs                      |
| G7  | **Cost Visibility**       | Track LLM token usage and provide cost estimates                 |
| G8  | **Rollback Capability**   | Undo migrations with data integrity guarantees                   |

### Non-Goals

- **Email notifications** - Not implementing batch completion emails
- **Scheduled migrations** - No cron-based automatic migration
- **Organization scoping** - Migrations are user-scoped, not org-scoped
- **Legacy system deprecation** - Both systems coexist; no forced cutover
- **Data transformation UI** - No visual data mapping editor

---

## Current State Analysis

### Existing Infrastructure

#### Database Tables

| Table                    | Purpose                           | Key Columns                                               |
| ------------------------ | --------------------------------- | --------------------------------------------------------- |
| `migration_log`          | Tracks runs and entity migrations | `run_id`, `entity_type`, `status`, `legacy_id`, `onto_id` |
| `legacy_entity_mappings` | 1:1 mapping legacy → ontology     | `legacy_table`, `legacy_id`, `onto_id`, `migrated_at`     |

#### Services (`src/lib/services/ontology/`)

| Service                         | Responsibility                                 |
| ------------------------------- | ---------------------------------------------- |
| `OntologyMigrationOrchestrator` | Coordinates all migrations, manages batches    |
| `ProjectMigrationService`       | Project → onto_project with template inference |
| `PhaseMigrationService`         | Phase → onto_plan with type classification     |
| `TaskMigrationService`          | Task → onto_task with work mode detection      |
| `CalendarMigrationService`      | Calendar event linking                         |
| `LegacyMappingService`          | CRUD for legacy_entity_mappings                |

#### Existing API Endpoints (`/api/admin/migration/`)

| Method | Endpoint    | Purpose                                    |
| ------ | ----------- | ------------------------------------------ |
| POST   | `/analyze`  | Analyze projects for migration readiness   |
| POST   | `/start`    | Start a migration run                      |
| GET    | `/status`   | Get run status (single run or recent runs) |
| POST   | `/validate` | Validate completed run integrity           |
| POST   | `/rollback` | Mark run as rolled back                    |
| POST   | `/pause`    | Pause an in-progress run                   |
| POST   | `/resume`   | Resume a paused run                        |

#### Current UI (`/admin/migration`)

- Single-user focused interface
- Project-level actions: Analyze, Dry Run, Migrate
- Preview modal for LLM-generated output
- Run history panel

### Gap Analysis

| Need                      | Current State                  | Gap                                           |
| ------------------------- | ------------------------------ | --------------------------------------------- |
| Multi-user view           | Single user by ID              | Need paginated user list with stats           |
| Batch migration           | One project at a time (max 25) | Need "migrate all for user" and platform-wide |
| Global progress           | No aggregate view              | Need platform-wide dashboard                  |
| Error dashboard           | Errors buried in run logs      | Need dedicated filterable error browser       |
| Retry capability          | Manual re-run only             | Need targeted entity retry                    |
| Real-time updates         | Manual refresh                 | Need Supabase Realtime subscription           |
| Rollback                  | Log status only                | Need actual data deletion option              |
| User filtering            | None                           | Need search, sort, status filter              |
| LLM cost tracking         | None                           | Need token usage in logs                      |
| Concurrent run protection | None                           | Need mutex for platform-wide runs             |

---

## Architecture

### Route Structure

```
/admin/migration/
├── +page.svelte                    # Global dashboard
├── +page.server.ts                 # Load global stats, user list
├── +layout.svelte                  # Shared layout with nav
├── users/
│   └── [userId]/
│       ├── +page.svelte            # User detail view
│       └── +page.server.ts         # Load user projects/errors
├── errors/
│   ├── +page.svelte                # Error browser
│   └── +page.server.ts             # Load filtered errors
└── runs/
    └── [runId]/
        ├── +page.svelte            # Run detail view
        └── +page.server.ts         # Load run details
```

### Component Architecture

```
src/lib/components/admin/migration/
├── MigrationDashboard.svelte       # Main dashboard container
├── ProgressCards.svelte            # Stats cards (projects, tasks, users, errors)
├── GlobalProgressBar.svelte        # Platform-wide progress indicator
├── UserList.svelte                 # Paginated, filterable user list
├── UserRow.svelte                  # Individual user row with actions
├── RecentRuns.svelte               # Recent run history panel
├── RunStatusBadge.svelte           # Status indicator component
├── UserDetailView.svelte           # User-specific migration view
├── ProjectList.svelte              # User's projects with status
├── ErrorBrowser.svelte             # Filterable error list
├── ErrorDetailPanel.svelte         # Expandable error details
├── MigrationActions.svelte         # Action buttons (migrate, retry, etc.)
├── ConfirmationModal.svelte        # Destructive action confirmations
├── DryRunPreviewModal.svelte       # LLM output preview
└── CostEstimateCard.svelte         # LLM token/cost estimate display
```

### Service Architecture

```typescript
// New services to add
src/lib/services/ontology/
├── migration-stats.service.ts      # Aggregate statistics queries
├── migration-error.service.ts      # Error retrieval and categorization
├── migration-retry.service.ts      # Targeted retry logic
├── migration-rollback.service.ts   # Actual data rollback (not just log status)
└── migration-realtime.service.ts   # Supabase Realtime subscriptions
```

---

## Database Schema

### Existing Tables

#### `migration_log`

```sql
-- Current schema (from 20251124_create_migration_log.sql)
CREATE TABLE migration_log (
    id BIGSERIAL PRIMARY KEY,
    run_id UUID NOT NULL,
    batch_id TEXT,
    org_id UUID,                    -- Currently unused, keeping for future
    entity_type TEXT NOT NULL,      -- 'run' | 'project' | 'phase' | 'task' | 'calendar'
    operation TEXT NOT NULL DEFAULT 'migrate',
    legacy_table TEXT,
    legacy_id UUID,
    onto_table TEXT,
    onto_id UUID,
    status TEXT NOT NULL DEFAULT 'pending',
    error_message TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### `legacy_entity_mappings`

```sql
-- Current schema (from 20251122_legacy_mapping_backfill.sql)
CREATE TABLE legacy_entity_mappings (
    id BIGSERIAL PRIMARY KEY,
    legacy_table TEXT NOT NULL,
    legacy_id UUID NOT NULL,
    onto_table TEXT NOT NULL,
    onto_id UUID NOT NULL,
    migrated_at TIMESTAMPTZ DEFAULT now(),
    run_id UUID,
    UNIQUE(legacy_table, legacy_id)
);
```

### Schema Modifications

#### 1. Add `user_id` to `migration_log`

This enables efficient per-user queries without joining through projects.

```sql
-- Migration: Add user_id for efficient user filtering
ALTER TABLE migration_log
    ADD COLUMN user_id UUID REFERENCES auth.users(id);

-- Backfill from projects
UPDATE migration_log ml
SET user_id = p.user_id
FROM projects p
WHERE ml.legacy_id = p.id AND ml.entity_type = 'project';

-- For tasks/phases, get user_id via project
UPDATE migration_log ml
SET user_id = p.user_id
FROM tasks t
JOIN projects p ON t.project_id = p.id
WHERE ml.legacy_id = t.id AND ml.entity_type = 'task';

UPDATE migration_log ml
SET user_id = p.user_id
FROM phases ph
JOIN projects p ON ph.project_id = p.id
WHERE ml.legacy_id = ph.id AND ml.entity_type = 'phase';

-- Index for user queries
CREATE INDEX idx_migration_log_user
    ON migration_log (user_id)
    WHERE user_id IS NOT NULL;
```

#### 2. Add Error Category and Retry Tracking

```sql
-- Add structured error metadata columns
ALTER TABLE migration_log
    ADD COLUMN error_category TEXT,  -- 'recoverable' | 'data' | 'fatal'
    ADD COLUMN retry_count INTEGER DEFAULT 0,
    ADD COLUMN last_retry_at TIMESTAMPTZ;

-- Index for error filtering
CREATE INDEX idx_migration_log_errors
    ON migration_log (error_category, entity_type, status)
    WHERE status = 'failed';
```

#### 3. Add Platform Run Mutex Table

Prevents concurrent platform-wide migrations.

```sql
CREATE TABLE migration_platform_lock (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),  -- Singleton row
    run_id UUID,
    locked_by UUID REFERENCES auth.users(id),
    locked_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    CONSTRAINT single_row CHECK (id = 1)
);

-- Initialize the singleton row
INSERT INTO migration_platform_lock (id) VALUES (1);
```

#### 4. User Migration Stats View

Materialized view for dashboard performance.

```sql
CREATE MATERIALIZED VIEW user_migration_stats AS
SELECT
    u.id AS user_id,
    u.email,
    u.raw_user_meta_data->>'name' AS name,
    u.raw_user_meta_data->>'avatar_url' AS avatar_url,
    COALESCE(project_counts.total_projects, 0) AS total_projects,
    COALESCE(project_counts.migrated_projects, 0) AS migrated_projects,
    COALESCE(project_counts.total_projects, 0) - COALESCE(project_counts.migrated_projects, 0) AS pending_projects,
    COALESCE(error_counts.failed_projects, 0) AS failed_projects,
    COALESCE(task_counts.total_tasks, 0) AS total_tasks,
    COALESCE(task_counts.migrated_tasks, 0) AS migrated_tasks,
    project_counts.last_migration_at,
    CASE
        WHEN COALESCE(project_counts.total_projects, 0) = 0 THEN 'no_projects'
        WHEN COALESCE(project_counts.migrated_projects, 0) = 0 THEN 'not_started'
        WHEN COALESCE(error_counts.failed_projects, 0) > 0 THEN 'has_errors'
        WHEN project_counts.migrated_projects = project_counts.total_projects THEN 'complete'
        ELSE 'partial'
    END AS migration_status,
    CASE
        WHEN COALESCE(project_counts.total_projects, 0) = 0 THEN 0
        ELSE ROUND(
            (COALESCE(project_counts.migrated_projects, 0)::NUMERIC /
             project_counts.total_projects) * 100, 1
        )
    END AS percent_complete
FROM auth.users u
LEFT JOIN LATERAL (
    SELECT
        COUNT(DISTINCT p.id) AS total_projects,
        COUNT(DISTINCT CASE WHEN lem.onto_id IS NOT NULL THEN p.id END) AS migrated_projects,
        MAX(lem.migrated_at) AS last_migration_at
    FROM projects p
    LEFT JOIN legacy_entity_mappings lem
        ON lem.legacy_table = 'projects' AND lem.legacy_id = p.id
    WHERE p.user_id = u.id
        AND p.deleted_at IS NULL
) project_counts ON true
LEFT JOIN LATERAL (
    SELECT COUNT(DISTINCT ml.legacy_id) AS failed_projects
    FROM migration_log ml
    WHERE ml.user_id = u.id
        AND ml.entity_type = 'project'
        AND ml.status = 'failed'
) error_counts ON true
LEFT JOIN LATERAL (
    SELECT
        COUNT(DISTINCT t.id) AS total_tasks,
        COUNT(DISTINCT CASE WHEN lem.onto_id IS NOT NULL THEN t.id END) AS migrated_tasks
    FROM tasks t
    JOIN projects p ON t.project_id = p.id
    LEFT JOIN legacy_entity_mappings lem
        ON lem.legacy_table = 'tasks' AND lem.legacy_id = t.id
    WHERE p.user_id = u.id
        AND t.deleted_at IS NULL
) task_counts ON true
WHERE u.deleted_at IS NULL;

-- Unique index for efficient refresh
CREATE UNIQUE INDEX idx_user_migration_stats_user
    ON user_migration_stats (user_id);

-- Function to refresh the view
CREATE OR REPLACE FUNCTION refresh_user_migration_stats()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY user_migration_stats;
END;
$$ LANGUAGE plpgsql;
```

#### 5. Global Progress View

```sql
CREATE OR REPLACE VIEW global_migration_progress AS
SELECT
    (SELECT COUNT(*) FROM projects WHERE deleted_at IS NULL) AS total_projects,
    (SELECT COUNT(DISTINCT legacy_id)
     FROM legacy_entity_mappings
     WHERE legacy_table = 'projects') AS migrated_projects,
    (SELECT COUNT(DISTINCT legacy_id)
     FROM migration_log
     WHERE entity_type = 'project' AND status = 'failed') AS failed_projects,
    (SELECT COUNT(*) FROM tasks WHERE deleted_at IS NULL) AS total_tasks,
    (SELECT COUNT(DISTINCT legacy_id)
     FROM legacy_entity_mappings
     WHERE legacy_table = 'tasks') AS migrated_tasks,
    (SELECT COUNT(*) FROM auth.users WHERE deleted_at IS NULL) AS total_users,
    (SELECT COUNT(DISTINCT u.id)
     FROM auth.users u
     JOIN projects p ON p.user_id = u.id
     WHERE p.deleted_at IS NULL AND u.deleted_at IS NULL) AS users_with_projects;
```

---

## API Reference

### Existing Endpoint Updates

#### `POST /api/admin/migration/start`

**Changes:**

- Allow full-platform runs: if `projectIds` and `userId` are omitted, fetch all eligible projects (exclude deleted; include archived only when `includeArchived` is true).
- Skip already-mapped projects by default (`skipAlreadyMigrated` true) to keep runs idempotent.
- Keep `skipCompletedTasks` default true (avoid migrating done tasks).
- Default concurrencies: `projectConcurrency=3`, `phaseConcurrency=5`, `taskConcurrency=5`, `eventConcurrency=10` (with the documented max caps).
- Add platform lock acquisition for platform-wide runs.

```typescript
interface StartMigrationRequest {
	// Target selection (mutually exclusive)
	projectIds?: string[]; // Specific projects
	userId?: string; // All projects for user
	// If both omitted: platform-wide migration

	// Options
	includeArchived?: boolean; // Default: false
	skipAlreadyMigrated?: boolean; // Default: true
	skipCompletedTasks?: boolean; // Default: true (do not migrate tasks with status done)
	dryRun?: boolean; // Default: false

	// Concurrency controls
	projectConcurrency?: number; // Default: 3, max: 10
	phaseConcurrency?: number; // Default: 5, max: 15
	taskConcurrency?: number; // Default: 5, max: 20
	eventConcurrency?: number; // Default: 10, max: 30

	// LLM controls
	skipLLMClassification?: boolean; // Default: false (use fallback templates)
	maxTokenBudget?: number; // Optional: stop if exceeded
}

interface StartMigrationResponse {
	runId: string;
	batchId: string;
	status: 'started' | 'queued' | 'rejected';
	totalProjects: number;
	estimatedDuration?: string; // e.g., "~5 minutes"
	estimatedTokens?: number; // LLM token estimate
	lockAcquired?: boolean; // For platform-wide runs

	// If dryRun: true
	previews?: MigrationPreviewPayload[];

	// If rejected
	rejectionReason?: string; // e.g., "Platform migration already in progress"
}
```

### New Endpoints

#### 1. `GET /api/admin/migration/users`

Paginated list of users with migration statistics.

```typescript
// Query Parameters
interface UsersQueryParams {
	limit?: number; // Default: 50, max: 200
	offset?: number; // Pagination offset
	sortBy?: 'email' | 'totalProjects' | 'percentComplete' | 'lastMigrationAt';
	sortOrder?: 'asc' | 'desc'; // Default: 'asc'
	status?: 'not_started' | 'partial' | 'complete' | 'has_errors' | 'no_projects';
	search?: string; // Email/name search (ILIKE)
}

// Response
interface UsersResponse {
	users: UserMigrationStats[];
	pagination: {
		total: number;
		limit: number;
		offset: number;
		hasMore: boolean;
	};
	aggregates: {
		totalUsers: number;
		usersWithProjects: number;
		usersFullyMigrated: number;
		usersPartiallyMigrated: number;
		usersNotStarted: number;
		usersWithErrors: number;
	};
	refreshedAt: string; // When materialized view was last refreshed
}

interface UserMigrationStats {
	userId: string;
	email: string;
	name: string | null;
	avatarUrl: string | null;
	stats: {
		totalProjects: number;
		migratedProjects: number;
		pendingProjects: number;
		failedProjects: number; // distinct project_ids with failed project rows in migration_log
		totalTasks: number;
		migratedTasks: number;
		percentComplete: number;
		lastMigrationAt: string | null; // from legacy_entity_mappings.migrated_at
	};
	migrationStatus: 'not_started' | 'partial' | 'complete' | 'has_errors' | 'no_projects';
}
```

#### 2. `GET /api/admin/migration/progress`

Global migration progress statistics.

Projects are the source of truth; task/phase numbers are secondary and may be omitted/zero initially if not yet wired up.

```typescript
interface GlobalProgressResponse {
	projects: {
		total: number;
		migrated: number;
		pending: number;
		failed: number;
		percentComplete: number;
	};
	tasks: {
		total: number;
		migrated: number;
		pending: number;
		percentComplete: number;
	};
	users: {
		total: number;
		withProjects: number;
		fullyMigrated: number;
		partiallyMigrated: number;
		notStarted: number;
	};
	errors: {
		total: number;
		recoverable: number;
		dataErrors: number;
		fatal: number;
	};
	activeRun: {
		runId: string;
		status: string;
		startedAt: string;
		projectsProcessed: number;
		lockedBy: string;
	} | null;
	recentRuns: Array<{
		runId: string;
		status: MigrationStatus;
		startedAt: string;
		completedAt: string | null;
		projectsProcessed: number;
		projectsFailed: number;
		initiatedBy: string;
		initiatedByEmail: string;
	}>;
	lastRefreshed: string;
}
```

#### 3. `GET /api/admin/migration/errors`

Paginated, filterable error list.

```typescript
// Query Parameters
interface ErrorsQueryParams {
	limit?: number; // Default: 50, max: 200
	offset?: number;
	userId?: string; // Filter by user
	entityType?: 'project' | 'task' | 'phase' | 'calendar';
	errorCategory?: 'recoverable' | 'data' | 'fatal';
	runId?: string; // Filter by run
	projectId?: string; // Filter by project
	search?: string; // Search error message
	sortBy?: 'createdAt' | 'entityType' | 'errorCategory';
	sortOrder?: 'asc' | 'desc';
}

// Response
interface ErrorsResponse {
	errors: MigrationErrorDetail[];
	pagination: {
		total: number;
		limit: number;
		offset: number;
		hasMore: boolean;
	};
	categoryCounts: {
		recoverable: number;
		data: number;
		fatal: number;
	};
	filters: ErrorsQueryParams; // Echo back applied filters
}

interface MigrationErrorDetail {
	id: number;
	runId: string;
	batchId: string;
	entityType: 'project' | 'task' | 'phase' | 'calendar';
	legacyId: string;
	legacyTable: string;
	errorCategory: 'recoverable' | 'data' | 'fatal';
	errorMessage: string;
	retryCount: number;
	lastRetryAt: string | null;
	createdAt: string;

	// Enriched context
	userId: string;
	userEmail: string;
	userName: string | null;
	projectId: string;
	projectName: string;
	entityName: string; // Task title, phase name, etc.

	// Remediation hints
	canRetry: boolean;
	suggestedAction: 'retry' | 'retry_with_fallback' | 'manual_fix' | 'skip';
	suggestedActionDescription: string;

	// Full metadata
	metadata: Record<string, unknown>;
}
```

#### 4. `POST /api/admin/migration/retry`

Retry failed migrations.

```typescript
interface RetryRequest {
    // Target selection (one required)
    errorIds?: number[];            // Specific log entry IDs
    runId?: string;                 // All failed in a run
    userId?: string;                // All failed for a user
    projectId?: string;             // All failed for a project

    // Options
    entityType?: 'project' | 'task' | 'phase' | 'calendar'; // Filter
    errorCategory?: 'recoverable' | 'data';  // Filter (can't retry fatal)
    useFallbackTemplates?: boolean; // Default: false - use generic templates
    maxRetries?: number;            // Default: 3 - skip if retry_count >= this
}

interface RetryResponse {
    runId: string;
    batchId: string;
    targeted: number;               // How many errors matched filters
    skipped: number;                // Skipped due to maxRetries
    retrying: number;               // Actually being retried
    status: 'started' | 'completed' | 'partial_success';
    results?: {
        successful: number;
        failed: number;
    };
}

**Behavior:**
- Retries are issued by `(legacy_table, legacy_id)`; if a mapping already exists, the retry is a no-op (idempotent).
- When `runId` is provided, only failed rows from that run are retried; combine with `entityType` to further scope.
- `useFallbackTemplates` applies to LLM/template steps where available; recoverable vs data errors may be used to auto-filter.
```

#### 5. `POST /api/admin/migration/rollback`

**Enhanced:** Actually deletes ontology data, not just log status.

```typescript
interface RollbackRequest {
	runId: string;

	// Rollback scope
	mode: 'soft' | 'hard';
	// soft: Set deleted_at on onto_* entities, preserve for recovery
	// hard: Permanently delete onto_* entities

	// Optional filters
	entityTypes?: Array<'project' | 'task' | 'phase' | 'calendar'>;
	fromTimestamp?: string; // Only entities created after this

	// Safety
	confirmationCode: string; // Must match runId prefix (first 8 chars)
}

interface RollbackResponse {
	runId: string;
	mode: 'soft' | 'hard';
	deletedCounts: {
		projects: number;
		plans: number;
		tasks: number;
		events: number;
		edges: number;
		documents: number;
	};
	mappingsRemoved: number; // legacy_entity_mappings rows deleted
	logsUpdated: number; // migration_log rows marked rolled_back
	recoverable: boolean; // true if mode was 'soft'
	recoverableUntil?: string; // Timestamp when soft-deleted data expires
}
```

#### 6. `POST /api/admin/migration/refresh-stats`

Refresh the materialized view.

```typescript
interface RefreshStatsResponse {
	refreshed: boolean;
	duration: number; // milliseconds
	rowCount: number;
	previousRefresh: string;
}
```

#### 7. `GET /api/admin/migration/lock`

Check platform lock status.

```typescript
interface LockStatusResponse {
	isLocked: boolean;
	runId: string | null;
	lockedBy: string | null;
	lockedByEmail: string | null;
	lockedAt: string | null;
	expiresAt: string | null;
}
```

---

## UI Specification

### Design Requirements

Per BuildOS style guide:

- **Responsive**: Mobile-first with Tailwind breakpoints
- **Dark mode**: All components support light/dark via `dark:` prefix
- **High density**: Maximize information without overwhelming
- **Card system**: Use Card, CardHeader, CardBody components

Progress source of truth is projects. Task/phase metrics are secondary/optional; the UI can omit those cards initially, but the project progress bar/cards must be present.

### 1. Global Dashboard (`/admin/migration`)

#### Desktop Layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Ontology Migration Dashboard                    [Refresh] [⚡ Live]   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌────────────────┐ ┌────────────────┐ ┌────────────────┐ ┌───────────┐│
│  │    Projects    │ │     Tasks      │ │     Users      │ │  Errors   ││
│  │   127 / 156    │ │   892 / 1024   │ │    23 / 31     │ │    12     ││
│  │     81.4%      │ │     87.1%      │ │    with data   │ │  ⚠ View   ││
│  │  ██████████░░  │ │  ████████████░ │ │   74.2% done   │ │ 8 retry   ││
│  └────────────────┘ └────────────────┘ └────────────────┘ └───────────┘│
│                                                                         │
│  ┌─ Platform Actions ───────────────────────────────────────────────── │
│  │ [🚀 Migrate All Pending] [🔍 Dry Run All] [↻ Retry All Failed]     │
│  │                                                                     │
│  │ ⚠ Platform migration will process 29 pending projects (~15 min)    │
│  │ Estimated LLM cost: ~$0.45 (14,500 tokens)                         │
│  └─────────────────────────────────────────────────────────────────────│
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│  Users                      🔍 [Search...] [Status ▼] [Sort ▼] [1/3]   │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │ Avatar │ Email / Name          │ Progress    │ Status    │ Actions ││
│  ├────────┼───────────────────────┼─────────────┼───────────┼─────────┤│
│  │  👤    │ john@example.com      │ 12/12 (100%)│ ✓ Complete│ [View]  ││
│  │        │ John Smith            │ 45/45 tasks │           │         ││
│  ├────────┼───────────────────────┼─────────────┼───────────┼─────────┤│
│  │  👤    │ anna@example.com      │ 8/15 (53%)  │ ○ Partial │ [▶][👁] ││
│  │        │ Anna Wayne            │ 89/124 tasks│           │         ││
│  ├────────┼───────────────────────┼─────────────┼───────────┼─────────┤│
│  │  👤    │ bob@example.com       │ 5/8 (62%)   │ ⚠ Errors  │ [↻][👁] ││
│  │        │ Bob Jones             │ 34/56 tasks │ 2 failed  │         ││
│  ├────────┼───────────────────────┼─────────────┼───────────┼─────────┤│
│  │  👤    │ new@example.com       │ 0/3 (0%)    │ - Pending │ [▶][👁] ││
│  │        │                       │ 0/18 tasks  │           │         ││
│  └─────────────────────────────────────────────────────────────────────┘│
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│  Recent Runs                                                  [See All] │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │ run_abc123  │ 12 projects │ ✓ completed │ admin@...  │ 2 min ago   ││
│  │ run_def456  │ 8 projects  │ ⚠ partial   │ admin@...  │ 15 min ago  ││
│  │ run_ghi789  │ 3 projects  │ ✗ failed    │ admin@...  │ 1 hour ago  ││
│  └─────────────────────────────────────────────────────────────────────┘│
│                                                                         │
│  ┌─ Active Run ─────────────────────────────────────────────────────── │
│  │ ⟳ run_xyz789 in progress (started 2 min ago by admin@example.com)  │
│  │   Processing: 8/29 projects  ████████░░░░░░░░░░░░ 27.6%            │
│  │   [Pause] [View Details]                                           │
│  └─────────────────────────────────────────────────────────────────────│
└─────────────────────────────────────────────────────────────────────────┘
```

#### Mobile Layout (< 768px)

```
┌─────────────────────────────┐
│ Migration Dashboard    [⚡] │
├─────────────────────────────┤
│ ┌───────────┐ ┌───────────┐ │
│ │ Projects  │ │   Tasks   │ │
│ │ 127/156   │ │ 892/1024  │ │
│ │   81.4%   │ │   87.1%   │ │
│ └───────────┘ └───────────┘ │
│ ┌───────────┐ ┌───────────┐ │
│ │   Users   │ │  Errors   │ │
│ │  23/31    │ │    12     │ │
│ │   74.2%   │ │  ⚠ View   │ │
│ └───────────┘ └───────────┘ │
├─────────────────────────────┤
│ [Search users...]           │
│ ┌─────────────────────────┐ │
│ │ john@example.com        │ │
│ │ 12/12 ✓ Complete        │ │
│ │ [View]                  │ │
│ ├─────────────────────────┤ │
│ │ anna@example.com        │ │
│ │ 8/15 ○ Partial          │ │
│ │ [Migrate] [View]        │ │
│ └─────────────────────────┘ │
├─────────────────────────────┤
│ ╔═════════════════════════╗ │
│ ║ 🚀 Migrate All Pending  ║ │
│ ╚═════════════════════════╝ │
└─────────────────────────────┘
```

### 2. User Detail View (`/admin/migration/users/[userId]`)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  ← Back to Dashboard                                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  👤 anna@example.com                                                    │
│     Anna Wayne                                                          │
│                                                                         │
│  ┌─ Migration Progress ───────────────────────────────────────────────┐│
│  │ Projects: 8/15 (53%)  ████████████░░░░░░░░░░                       ││
│  │ Tasks:    89/124 (72%) ██████████████████░░░░░░░                   ││
│  │ Last migration: Dec 5, 2025 at 3:45 PM                             ││
│  └────────────────────────────────────────────────────────────────────┘│
│                                                                         │
│  [🚀 Migrate All Pending (7)] [🔍 Dry Run All] [↻ Retry Failed (2)]    │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│  Projects                                              [Filter ▼]       │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │ Status │ Project Name         │ Type         │ Progress  │ Actions ││
│  ├────────┼──────────────────────┼──────────────┼───────────┼─────────┤│
│  │   ✓    │ Book Writing Project │ writer.book  │ 45/45     │ [Open]  ││
│  │   ✓    │ Client Campaign      │ coach.client │ 23/23     │ [Open]  ││
│  │   ⚠    │ Startup MVP          │ --           │ 12/18     │ [↻][👁] ││
│  │        │                      │              │ 2 errors  │         ││
│  │   -    │ Personal Goals       │ --           │ 0/8       │ [▶][🔍] ││
│  │   -    │ Home Renovation      │ --           │ 0/15      │ [▶][🔍] ││
│  │   📦   │ Old Project (arch)   │ --           │ 0/5       │ [▶]     ││
│  └─────────────────────────────────────────────────────────────────────┘│
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│  Errors (2)                                                    [Retry] │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │ ⚠ Startup MVP → Task: "Design mockups"                             ││
│  │   Category: data | Schema validation failed                        ││
│  │   Missing required field 'priority' in task properties             ││
│  │   [↻ Retry] [🔧 Use Fallback] [👁 Details]                         ││
│  ├─────────────────────────────────────────────────────────────────────┤│
│  │ ⚠ Startup MVP → Task: "API integration"                            ││
│  │   Category: data | Template match below threshold (45%)            ││
│  │   Could not confidently classify task type                         ││
│  │   [↻ Retry] [🔧 Use Fallback] [👁 Details]                         ││
│  └─────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────┘
```

### 3. Error Browser (`/admin/migration/errors`)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Migration Errors                                       [📥 Export CSV] │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Filters:                                                               │
│  [All Users ▼] [All Types ▼] [All Categories ▼] [All Runs ▼] [🔍 ...]  │
│                                                                         │
│  Summary: 12 errors │ 8 recoverable │ 3 data │ 1 fatal                  │
│                                                                         │
│  [↻ Retry Selected (0)] [↻ Retry All Recoverable (8)]                   │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │ □ │ Cat.  │ Type    │ Entity          │ User      │ Error          ││
│  ├───┼───────┼─────────┼─────────────────┼───────────┼────────────────┤│
│  │ □ │ 🔄    │ task    │ Design mockups  │ anna@...  │ Schema fail    ││
│  │ □ │ 🔄    │ task    │ API integration │ anna@...  │ Low threshold  ││
│  │ □ │ 📊    │ project │ Test Project    │ bob@...   │ Missing data   ││
│  │ □ │ 📊    │ phase   │ Phase 2         │ bob@...   │ FK constraint  ││
│  │ □ │ ⛔    │ task    │ Corrupted Task  │ test@...  │ Invalid JSON   ││
│  │ □ │ 🔄    │ calendar│ Meeting sync    │ anna@...  │ API timeout    ││
│  └─────────────────────────────────────────────────────────────────────┘│
│  Showing 1-6 of 12                              [< Prev] [1] [2] [Next>]│
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│  ▼ Error Details                                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │ Entity: Design mockups                                              ││
│  │ Type: task                                                          ││
│  │ Category: 🔄 Recoverable                                            ││
│  │                                                                     ││
│  │ Legacy ID: 8f3a2b1c-4d5e-6f7a-8b9c-0d1e2f3a4b5c                    ││
│  │ Project: Startup MVP                                                ││
│  │ User: anna@example.com                                              ││
│  │ Run ID: run_abc123                                                  ││
│  │ Created: 2025-12-06 10:23:45                                        ││
│  │ Retry Count: 1                                                      ││
│  │ Last Retry: 2025-12-06 10:25:00                                     ││
│  │                                                                     ││
│  │ ┌─ Error Message ─────────────────────────────────────────────────┐ ││
│  │ │ Schema validation failed: field 'priority' expected number      │ ││
│  │ │ but received string "high"                                      │ ││
│  │ └─────────────────────────────────────────────────────────────────┘ ││
│  │                                                                     ││
│  │ ┌─ Suggested Action ──────────────────────────────────────────────┐ ││
│  │ │ Use fallback template 'task.execute' which has flexible schema  │ ││
│  │ └─────────────────────────────────────────────────────────────────┘ ││
│  │                                                                     ││
│  │ ┌─ Metadata ──────────────────────────────────────────────────────┐ ││
│  │ │ {                                                               │ ││
│  │ │   "recommendedTypeKey": "task.execute",                         │ ││
│  │ │   "classification": { "confidence": 0.78, ... },                │ ││
│  │ │   "sourceData": { "title": "Design mockups", ... }              │ ││
│  │ │ }                                                               │ ││
│  │ └─────────────────────────────────────────────────────────────────┘ ││
│  │                                                                     ││
│  │ [↻ Retry] [🔧 Retry with Fallback] [✓ Mark Resolved] [🗑 Skip]     ││
│  └─────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────┘
```

### Confirmation Modal

For destructive actions (platform migration, rollback):

```
┌─────────────────────────────────────────────────────┐
│ ⚠ Confirm Platform Migration                        │
├─────────────────────────────────────────────────────┤
│                                                     │
│ You are about to migrate ALL pending projects       │
│ across the entire platform.                         │
│                                                     │
│ ┌─ Impact Summary ─────────────────────────────────┐│
│ │ • 29 projects across 8 users                    ││
│ │ • ~145 tasks will be processed                  ││
│ │ • Estimated duration: ~15 minutes               ││
│ │ • Estimated LLM cost: ~$0.45                    ││
│ └───────────────────────────────────────────────────┘│
│                                                     │
│ Type "MIGRATE" to confirm:                          │
│ ┌─────────────────────────────────────────────────┐ │
│ │                                                 │ │
│ └─────────────────────────────────────────────────┘ │
│                                                     │
│              [Cancel]  [🚀 Start Migration]         │
└─────────────────────────────────────────────────────┘
```

---

## Error Handling & Recovery

### Error Categories

| Category      | Icon | Description            | Retry Strategy          |
| ------------- | ---- | ---------------------- | ----------------------- |
| `recoverable` | 🔄   | Transient failures     | Auto-retry with backoff |
| `data`        | 📊   | Data validation issues | Manual fix or fallback  |
| `fatal`       | ⛔   | Unrecoverable issues   | Skip and flag           |

### Error Classification Rules

```typescript
type ErrorClassifier = (error: Error, context: MigrationContext) => ErrorCategory;

const classifyError: ErrorClassifier = (error, context) => {
	const message = error.message.toLowerCase();

	// Recoverable: transient issues
	if (
		message.includes('timeout') ||
		message.includes('rate limit') ||
		message.includes('connection') ||
		message.includes('503') ||
		message.includes('429') ||
		message.includes('temporary')
	) {
		return 'recoverable';
	}

	// Fatal: unrecoverable issues
	if (
		message.includes('corrupted') ||
		message.includes('circular') ||
		message.includes('unsupported type') ||
		message.includes('json parse') ||
		context.retryCount >= 3
	) {
		return 'fatal';
	}

	// Default: data errors
	return 'data';
};
```

### Retry Strategy

```typescript
interface RetryConfig {
	maxAttempts: number; // Default: 3
	baseDelayMs: number; // Default: 1000
	maxDelayMs: number; // Default: 30000
	backoffMultiplier: number; // Default: 2
}

// Retry with exponential backoff
async function retryWithBackoff<T>(
	fn: () => Promise<T>,
	config: RetryConfig,
	onRetry?: (attempt: number, error: Error) => void
): Promise<T> {
	let lastError: Error;

	for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
		try {
			return await fn();
		} catch (error) {
			lastError = error as Error;

			if (attempt < config.maxAttempts) {
				const delay = Math.min(
					config.baseDelayMs * Math.pow(config.backoffMultiplier, attempt - 1),
					config.maxDelayMs
				);
				onRetry?.(attempt, lastError);
				await sleep(delay);
			}
		}
	}

	throw lastError!;
}
```

### Remediation Suggestions

```typescript
interface RemediationSuggestion {
	action: 'retry' | 'retry_with_fallback' | 'manual_fix' | 'skip';
	description: string;
	autoFixAvailable: boolean;
	fallbackTemplate?: string;
	manualFixInstructions?: string;
}

function suggestRemediation(error: MigrationErrorDetail): RemediationSuggestion {
	switch (error.errorCategory) {
		case 'recoverable':
			return {
				action: 'retry',
				description: 'Transient error. Retry should succeed.',
				autoFixAvailable: true
			};

		case 'data':
			if (error.errorMessage.includes('template match')) {
				return {
					action: 'retry_with_fallback',
					description: 'Use fallback template for this entity.',
					autoFixAvailable: true,
					fallbackTemplate: getFallbackTemplate(error.entityType)
				};
			}
			return {
				action: 'manual_fix',
				description: 'Data needs correction before retry.',
				autoFixAvailable: false,
				manualFixInstructions: generateFixInstructions(error)
			};

		case 'fatal':
			return {
				action: 'skip',
				description: 'Cannot be migrated. Will be skipped.',
				autoFixAvailable: false
			};
	}
}

function getFallbackTemplate(entityType: string): string {
	const fallbacks: Record<string, string> = {
		project: 'project.generic',
		task: 'task.execute',
		phase: 'plan.timebox.sprint',
		calendar: null // No fallback for calendar
	};
	return fallbacks[entityType];
}
```

---

## LLM Integration & Cost Controls

### Token Usage Tracking

Store token usage in `migration_log.metadata`:

```typescript
interface MigrationMetadata {
	// ... existing fields
	llm?: {
		provider: 'openai' | 'deepseek';
		model: string;
		inputTokens: number;
		outputTokens: number;
		totalTokens: number;
		estimatedCost: number; // USD
		durationMs: number;
	};
}
```

### Cost Estimation

```typescript
// Token costs (as of Dec 2025)
const TOKEN_COSTS: Record<string, { input: number; output: number }> = {
	'gpt-4o': { input: 0.0025 / 1000, output: 0.01 / 1000 },
	'gpt-4o-mini': { input: 0.00015 / 1000, output: 0.0006 / 1000 },
	'deepseek-chat': { input: 0.00014 / 1000, output: 0.00028 / 1000 }
};

// Estimate tokens per entity type
const TOKENS_PER_ENTITY: Record<string, { input: number; output: number }> = {
	project: { input: 800, output: 400 }, // Template inference + props
	task: { input: 200, output: 100 }, // Work mode classification
	phase: { input: 300, output: 150 } // Plan type inference
};

function estimateMigrationCost(
	projectCount: number,
	avgTasksPerProject: number,
	avgPhasesPerProject: number,
	model: string
): { tokens: number; cost: number } {
	const costs = TOKEN_COSTS[model] || TOKEN_COSTS['deepseek-chat'];

	const projectTokens =
		projectCount * (TOKENS_PER_ENTITY.project.input + TOKENS_PER_ENTITY.project.output);
	const taskTokens =
		projectCount *
		avgTasksPerProject *
		(TOKENS_PER_ENTITY.task.input + TOKENS_PER_ENTITY.task.output);
	const phaseTokens =
		projectCount *
		avgPhasesPerProject *
		(TOKENS_PER_ENTITY.phase.input + TOKENS_PER_ENTITY.phase.output);

	const totalTokens = projectTokens + taskTokens + phaseTokens;
	const totalCost =
		(projectCount * TOKENS_PER_ENTITY.project.input +
			projectCount * avgTasksPerProject * TOKENS_PER_ENTITY.task.input +
			projectCount * avgPhasesPerProject * TOKENS_PER_ENTITY.phase.input) *
			costs.input +
		(projectCount * TOKENS_PER_ENTITY.project.output +
			projectCount * avgTasksPerProject * TOKENS_PER_ENTITY.task.output +
			projectCount * avgPhasesPerProject * TOKENS_PER_ENTITY.phase.output) *
			costs.output;

	return { tokens: totalTokens, cost: totalCost };
}
```

### Rate Limiting & Circuit Breaker

```typescript
interface RateLimitConfig {
	maxRequestsPerMinute: number; // Default: 60
	maxTokensPerMinute: number; // Default: 100000
	circuitBreakerThreshold: number; // Errors before pause. Default: 5
	circuitBreakerResetMs: number; // Default: 60000
}

class LLMRateLimiter {
	private requestCount = 0;
	private tokenCount = 0;
	private errorCount = 0;
	private isCircuitOpen = false;
	private windowStart = Date.now();

	async acquire(estimatedTokens: number): Promise<void> {
		// Check circuit breaker
		if (this.isCircuitOpen) {
			throw new Error('Circuit breaker open. LLM requests paused.');
		}

		// Reset window if needed
		const now = Date.now();
		if (now - this.windowStart >= 60000) {
			this.requestCount = 0;
			this.tokenCount = 0;
			this.windowStart = now;
		}

		// Check limits
		if (this.requestCount >= this.config.maxRequestsPerMinute) {
			await this.waitForNextWindow();
		}

		if (this.tokenCount + estimatedTokens >= this.config.maxTokensPerMinute) {
			await this.waitForNextWindow();
		}

		this.requestCount++;
		this.tokenCount += estimatedTokens;
	}

	recordError(): void {
		this.errorCount++;
		if (this.errorCount >= this.config.circuitBreakerThreshold) {
			this.isCircuitOpen = true;
			setTimeout(() => {
				this.isCircuitOpen = false;
				this.errorCount = 0;
			}, this.config.circuitBreakerResetMs);
		}
	}

	recordSuccess(): void {
		this.errorCount = Math.max(0, this.errorCount - 1);
	}
}
```

### Fallback Mode

When LLM fails or is disabled:

```typescript
function migrateWithoutLLM(entity: LegacyEntity): OntoEntity {
	// Use deterministic fallback templates
	const fallbackTemplates: Record<string, string> = {
		project: 'project.generic',
		task: 'task.execute',
		phase: 'plan.timebox.sprint',
		goal: 'goal.outcome',
		document: 'document.note'
	};

	return {
		typeKey: fallbackTemplates[entity.type],
		stateKey: 'active',
		props: extractBasicProps(entity), // No LLM enrichment
		facets: inferFacetsFromData(entity) // Heuristic-based
	};
}
```

---

## Rollback Strategy

### Rollback Modes

| Mode   | Description                           | Use Case             | Recovery            |
| ------ | ------------------------------------- | -------------------- | ------------------- |
| `soft` | Set `deleted_at` on onto\_\* entities | Safe, reversible     | Yes, within 30 days |
| `hard` | Permanently delete onto\_\* entities  | After testing period | No                  |

### Soft Rollback Process

```sql
-- 1. Mark ontology entities as deleted
UPDATE onto_projects
SET deleted_at = now()
WHERE id IN (
    SELECT onto_id FROM legacy_entity_mappings
    WHERE run_id = $1 AND legacy_table = 'projects'
);

UPDATE onto_plans
SET deleted_at = now()
WHERE id IN (
    SELECT onto_id FROM legacy_entity_mappings
    WHERE run_id = $1 AND legacy_table = 'phases'
);

UPDATE onto_tasks
SET deleted_at = now()
WHERE id IN (
    SELECT onto_id FROM legacy_entity_mappings
    WHERE run_id = $1 AND legacy_table = 'tasks'
);

-- 2. Mark edges as deleted
UPDATE onto_edges
SET deleted_at = now()
WHERE src_id IN (...) OR dst_id IN (...);

-- 3. Remove mappings (so re-migration is possible)
DELETE FROM legacy_entity_mappings
WHERE run_id = $1;

-- 4. Update migration log
UPDATE migration_log
SET status = 'rolled_back',
    metadata = metadata || '{"rolledBackAt": "...", "rolledBackBy": "..."}'::jsonb
WHERE run_id = $1;
```

### Hard Rollback Process

Uses existing `delete_onto_project()` function which handles:

- Cascade delete of edges, assignments, documents
- Cleanup of related entities
- Audit trail preservation

```typescript
async function hardRollback(runId: string): Promise<RollbackResult> {
	// Get all project mappings for this run
	const { data: mappings } = await supabase
		.from('legacy_entity_mappings')
		.select('onto_id')
		.eq('run_id', runId)
		.eq('legacy_table', 'projects');

	const results = { deleted: 0, failed: 0, errors: [] };

	for (const mapping of mappings) {
		const { error } = await supabase.rpc('delete_onto_project', {
			project_id: mapping.onto_id
		});

		if (error) {
			results.failed++;
			results.errors.push({ id: mapping.onto_id, error: error.message });
		} else {
			results.deleted++;
		}
	}

	// Clean up mappings and logs
	await supabase.from('legacy_entity_mappings').delete().eq('run_id', runId);

	await supabase.from('migration_log').update({ status: 'rolled_back' }).eq('run_id', runId);

	return results;
}
```

### Rollback Safety Checks

```typescript
async function validateRollbackSafe(runId: string): Promise<{
	safe: boolean;
	warnings: string[];
	blockers: string[];
}> {
	const warnings: string[] = [];
	const blockers: string[] = [];

	// Check if any migrated entities have been modified
	const { data: modified } = await supabase
		.from('onto_projects')
		.select('id, updated_at, created_at')
		.in('id', mappedProjectIds)
		.gt('updated_at', 'created_at'); // Modified after creation

	if (modified?.length) {
		warnings.push(
			`${modified.length} projects have been modified after migration. ` +
				`User changes may be lost.`
		);
	}

	// Check if any edges were created outside migration
	const { data: externalEdges } = await supabase
		.from('onto_edges')
		.select('id')
		.in('src_id', mappedIds)
		.is('run_id', null); // Not created by migration

	if (externalEdges?.length) {
		blockers.push(
			`${externalEdges.length} relationships were created outside migration. ` +
				`Manual review required.`
		);
	}

	return {
		safe: blockers.length === 0,
		warnings,
		blockers
	};
}
```

---

## Performance & Scaling

### Concurrency Controls

| Parameter            | Default | Max | Description                 |
| -------------------- | ------- | --- | --------------------------- |
| `projectConcurrency` | 3       | 10  | Parallel projects           |
| `phaseConcurrency`   | 5       | 15  | Parallel phases per project |
| `taskConcurrency`    | 5       | 20  | Parallel tasks per phase    |
| `eventConcurrency`   | 10      | 30  | Parallel calendar events    |

### Batch Processing

```typescript
// Process projects in controllable batches
async function processPlatformMigration(
	projects: LegacyProject[],
	options: MigrationRunOptions
): Promise<void> {
	const batchSize = options.projectConcurrency || 3;
	const batches = chunk(projects, batchSize);

	for (const batch of batches) {
		// Process batch in parallel
		const results = await Promise.all(
			batch.map((project) => migrateProjectWithDependencies(project, options))
		);

		// Log progress
		await logBatchProgress(results);

		// Check for pause/stop signals
		if (await shouldPause()) {
			await pauseRun();
			return;
		}

		// Rate limit between batches
		await sleep(100);
	}
}
```

### Large Project Handling

Projects with >100 tasks get special treatment:

```typescript
const LARGE_PROJECT_THRESHOLD = 100;

async function migrateProjectWithDependencies(
	project: LegacyProject,
	options: MigrationRunOptions
): Promise<MigrationResult> {
	const taskCount = await getTaskCount(project.id);

	if (taskCount > LARGE_PROJECT_THRESHOLD) {
		// Process tasks in sub-batches with progress updates
		return await migratelargeProject(project, options, taskCount);
	}

	return await migrateNormalProject(project, options);
}

async function migrateLargeProject(
	project: LegacyProject,
	options: MigrationRunOptions,
	totalTasks: number
): Promise<MigrationResult> {
	const SUB_BATCH_SIZE = 25;
	const tasks = await fetchProjectTasks(project.id);
	const batches = chunk(tasks, SUB_BATCH_SIZE);

	let processedTasks = 0;

	for (const batch of batches) {
		await migrateTasks(batch, options);
		processedTasks += batch.length;

		// Emit progress event
		await emitProgress({
			projectId: project.id,
			tasksProcessed: processedTasks,
			totalTasks,
			percentComplete: (processedTasks / totalTasks) * 100
		});
	}
}
```

### Memory Management

```typescript
// Prefetch mappings in chunks to avoid memory issues
async function prefetchMappingsChunked(
	projectIds: string[],
	chunkSize = 100
): Promise<PrefetchedMappingsCache> {
	const cache: PrefetchedMappingsCache = {
		projects: new Map(),
		phases: new Map(),
		tasks: new Map(),
		events: new Map()
	};

	const chunks = chunk(projectIds, chunkSize);

	for (const projectChunk of chunks) {
		const chunkMappings = await fetchMappingsForProjects(projectChunk);

		// Merge into main cache
		for (const [key, value] of chunkMappings.projects) {
			cache.projects.set(key, value);
		}
		// ... repeat for other entity types
	}

	return cache;
}
```

### Platform Run Mutex

Prevents concurrent platform-wide migrations:

```typescript
async function acquirePlatformLock(
	userId: string,
	runId: string,
	durationMinutes = 60
): Promise<{ acquired: boolean; existingLock?: LockInfo }> {
	const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000);

	const { data, error } = await supabase
		.from('migration_platform_lock')
		.update({
			run_id: runId,
			locked_by: userId,
			locked_at: new Date().toISOString(),
			expires_at: expiresAt.toISOString()
		})
		.eq('id', 1)
		.or(`run_id.is.null,expires_at.lt.${new Date().toISOString()}`)
		.select()
		.single();

	if (error || !data) {
		// Lock held by someone else
		const { data: existing } = await supabase
			.from('migration_platform_lock')
			.select('*')
			.eq('id', 1)
			.single();

		return { acquired: false, existingLock: existing };
	}

	return { acquired: true };
}

async function releasePlatformLock(runId: string): Promise<void> {
	await supabase
		.from('migration_platform_lock')
		.update({
			run_id: null,
			locked_by: null,
			locked_at: null,
			expires_at: null
		})
		.eq('id', 1)
		.eq('run_id', runId);
}
```

---

## Real-Time Updates

### Supabase Realtime Subscription

```typescript
// In MigrationDashboard.svelte
let realtimeChannel: RealtimeChannel;

onMount(() => {
	// Subscribe to migration_log changes for active run
	realtimeChannel = supabase
		.channel('migration-progress')
		.on(
			'postgres_changes',
			{
				event: '*',
				schema: 'public',
				table: 'migration_log',
				filter: activeRunId ? `run_id=eq.${activeRunId}` : undefined
			},
			(payload) => {
				handleMigrationUpdate(payload);
			}
		)
		.subscribe();
});

onDestroy(() => {
	realtimeChannel?.unsubscribe();
});

function handleMigrationUpdate(payload: RealtimePayload) {
	const { eventType, new: newRow, old: oldRow } = payload;

	if (eventType === 'INSERT') {
		// New entity migrated
		updateProgressCounts(newRow);

		if (newRow.status === 'failed') {
			addToErrorList(newRow);
		}
	} else if (eventType === 'UPDATE') {
		// Status changed (e.g., retry succeeded)
		if (oldRow.status === 'failed' && newRow.status === 'completed') {
			removeFromErrorList(oldRow.id);
			updateProgressCounts(newRow);
		}
	}
}
```

### Live Indicator Component

```svelte
<!-- LiveIndicator.svelte -->
<script lang="ts">
	let isConnected = $state(false);
	let lastUpdate = $state<Date | null>(null);

	$effect(() => {
		const channel = supabase.channel('heartbeat');

		channel.on('presence', { event: 'sync' }, () => {
			isConnected = true;
			lastUpdate = new Date();
		});

		channel.subscribe((status) => {
			isConnected = status === 'SUBSCRIBED';
		});

		return () => channel.unsubscribe();
	});
</script>

<div class="flex items-center gap-2 text-sm">
	{#if isConnected}
		<span class="h-2 w-2 bg-green-500 rounded-full animate-pulse"></span>
		<span class="text-green-600 dark:text-green-400">Live</span>
	{:else}
		<span class="h-2 w-2 bg-gray-400 rounded-full"></span>
		<span class="text-gray-500 dark:text-gray-400">Connecting...</span>
	{/if}
</div>
```

### Fallback Polling

If WebSocket disconnects:

```typescript
const POLL_INTERVAL = 5000; // 5 seconds

let pollTimer: NodeJS.Timeout;
let isPolling = false;

function startPolling() {
	if (isPolling) return;
	isPolling = true;

	pollTimer = setInterval(async () => {
		const progress = await fetchProgress();
		updateUI(progress);
	}, POLL_INTERVAL);
}

function stopPolling() {
	isPolling = false;
	clearInterval(pollTimer);
}

// Switch between realtime and polling based on connection
$effect(() => {
	if (realtimeConnected) {
		stopPolling();
	} else {
		startPolling();
	}
});
```

---

## Security & Authorization

### Admin-Only Access

All migration endpoints require admin privileges:

```typescript
// Middleware for all /api/admin/migration/* routes
async function requireAdmin({ locals }: RequestEvent): Promise<void> {
	const { user } = await locals.safeGetSession();

	if (!user) {
		throw error(401, 'Authentication required');
	}

	if (!user.is_admin) {
		throw error(403, 'Admin access required');
	}
}
```

### RLS Bypass

Migration endpoints use admin client to bypass RLS:

```typescript
// All migration services use admin client
const supabase = createAdminSupabaseClient();
```

### Audit Trail

All actions are logged:

```typescript
interface AuditEntry {
	action: 'start' | 'pause' | 'resume' | 'rollback' | 'retry';
	runId: string;
	userId: string;
	userEmail: string;
	timestamp: string;
	details: Record<string, unknown>;
}

async function auditLog(entry: AuditEntry): Promise<void> {
	await supabase.from('migration_log').insert({
		run_id: entry.runId,
		entity_type: 'audit',
		operation: entry.action,
		metadata: {
			userId: entry.userId,
			userEmail: entry.userEmail,
			...entry.details
		}
	});
}
```

---

## Testing Strategy

### Unit Tests

| Component            | Test File                         | Coverage                   |
| -------------------- | --------------------------------- | -------------------------- |
| Error classification | `migration-error.service.test.ts` | Error categorization logic |
| Cost estimation      | `migration-cost.service.test.ts`  | Token/cost calculations    |
| Retry logic          | `migration-retry.service.test.ts` | Backoff, limits            |
| Stats aggregation    | `migration-stats.service.test.ts` | View queries               |

### Integration Tests

```typescript
// migration-orchestrator.integration.test.ts
describe('OntologyMigrationOrchestrator', () => {
    it('should migrate a project with all dependencies', async () => {
        const project = await createTestProject();

        const result = await orchestrator.start({
            projectIds: [project.id],
            dryRun: false
        });

        expect(result.status).toBe('started');

        // Wait for completion
        await waitForRunCompletion(result.runId);

        // Verify ontology entities exist
        const ontoProject = await getOntoProject(project.id);
        expect(ontoProject).toBeDefined();
        expect(ontoProject.typeKey).toMatch(/^project\./);
    });

    it('should handle concurrent runs with mutex', async () => {
        // Start first run
        const run1 = await orchestrator.start({ userId: 'user1' });
        expect(run1.lockAcquired).toBe(true);

        // Try to start platform-wide run while user run is active
        const run2 = await orchestrator.start({}); // platform-wide
        expect(run2.status).toBe('rejected');
    });

    it('should rollback cleanly', async () => {
        const result = await orchestrator.start({ projectIds: [...] });
        await waitForRunCompletion(result.runId);

        const rollback = await orchestrator.rollback({
            runId: result.runId,
            mode: 'hard',
            confirmationCode: result.runId.slice(0, 8)
        });

        expect(rollback.deletedCounts.projects).toBeGreaterThan(0);

        // Verify entities deleted
        const ontoProject = await getOntoProject(projectId);
        expect(ontoProject).toBeNull();
    });
});
```

### E2E Tests

```typescript
// migration-dashboard.e2e.test.ts
describe('Migration Dashboard', () => {
	beforeEach(async () => {
		await loginAsAdmin();
		await page.goto('/admin/migration');
	});

	it('should display global progress', async () => {
		await expect(page.locator('[data-testid="projects-card"]')).toBeVisible();
		await expect(page.locator('[data-testid="progress-bar"]')).toBeVisible();
	});

	it('should filter users by status', async () => {
		await page.selectOption('[data-testid="status-filter"]', 'partial');
		await expect(page.locator('[data-testid="user-row"]')).toHaveCount(5);
	});

	it('should show confirmation for platform migration', async () => {
		await page.click('[data-testid="migrate-all-btn"]');
		await expect(page.locator('[data-testid="confirmation-modal"]')).toBeVisible();
		await expect(page.locator('text=Type "MIGRATE" to confirm')).toBeVisible();
	});

	it('should update in real-time during migration', async () => {
		await page.fill('[data-testid="confirmation-input"]', 'MIGRATE');
		await page.click('[data-testid="confirm-migrate-btn"]');

		// Should show active run indicator
		await expect(page.locator('[data-testid="active-run"]')).toBeVisible();

		// Progress should update
		await expect(page.locator('[data-testid="progress-bar"]')).toHaveAttribute(
			'aria-valuenow',
			/[1-9]/ // Some progress
		);
	});
});
```

---

## Implementation Plan

### Phase 1: Database & Core APIs (Backend)

**Duration: ~3 days**

1. Schema migrations
    - Add `user_id`, `error_category`, `retry_count` to `migration_log`
    - Create `migration_platform_lock` table
    - Create `user_migration_stats` materialized view
    - Create `global_migration_progress` view

2. Core API endpoints
    - `GET /api/admin/migration/progress`
    - `GET /api/admin/migration/users` (with pagination/filters)
    - `GET /api/admin/migration/errors` (with pagination/filters)
    - `POST /api/admin/migration/retry`
    - `POST /api/admin/migration/refresh-stats`
    - `GET /api/admin/migration/lock`

3. Update existing endpoints
    - `POST /start`: Add userId filter, platform lock, remove cap
    - `POST /rollback`: Add soft/hard modes, actual data deletion

4. New services
    - `migration-stats.service.ts`
    - `migration-error.service.ts`
    - `migration-retry.service.ts`
    - `migration-rollback.service.ts`

### Phase 2: Global Dashboard UI

**Duration: ~2 days**

1. Components
    - `ProgressCards.svelte`
    - `GlobalProgressBar.svelte`
    - `UserList.svelte` with pagination, search, filters
    - `RecentRuns.svelte`
    - `ConfirmationModal.svelte`

2. Real-time integration
    - Supabase Realtime subscription
    - Live indicator
    - Fallback polling

3. Routes
    - Enhanced `/admin/migration/+page.svelte`
    - `/admin/migration/+page.server.ts`

### Phase 3: User Detail View

**Duration: ~2 days**

1. Components
    - `UserDetailView.svelte`
    - `ProjectList.svelte`
    - `UserErrorPanel.svelte`

2. Routes
    - `/admin/migration/users/[userId]/+page.svelte`
    - `/admin/migration/users/[userId]/+page.server.ts`

3. Actions
    - Migrate all for user
    - Retry failed for user
    - Dry run all

### Phase 4: Error Browser

**Duration: ~2 days**

1. Components
    - `ErrorBrowser.svelte`
    - `ErrorDetailPanel.svelte`
    - `ErrorFilters.svelte`

2. Routes
    - `/admin/migration/errors/+page.svelte`
    - `/admin/migration/errors/+page.server.ts`

3. Features
    - Multi-select retry
    - Export CSV
    - Remediation suggestions

### Phase 5: Error Handling & LLM Controls

**Duration: ~2 days**

1. Error classification
    - Implement `classifyError()`
    - Store category in `migration_log`
    - Add retry count tracking

2. LLM controls
    - Rate limiter implementation
    - Circuit breaker
    - Token tracking in metadata
    - Cost estimation API

3. Retry system
    - Exponential backoff
    - Fallback template mode
    - Max retry limits

### Phase 6: Rollback & Safety

**Duration: ~1 day**

1. Rollback implementation
    - Soft rollback (set deleted_at)
    - Hard rollback (cascade delete)
    - Safety validation

2. Platform lock
    - Mutex acquisition/release
    - Lock status display
    - Expiration handling

### Phase 7: Testing & Polish

**Duration: ~2 days**

1. Unit tests for new services
2. Integration tests for orchestrator
3. E2E tests for dashboard
4. Performance testing with large datasets
5. Mobile responsiveness polish
6. Dark mode verification

---

## Success Metrics & SLOs

### Key Metrics

| Metric                        | Target                | Measurement                         |
| ----------------------------- | --------------------- | ----------------------------------- |
| Migration coverage            | 100%                  | All projects have migration attempt |
| Success rate                  | >95%                  | Successfully migrated / Total       |
| Error visibility latency      | <1 second             | Time from failure to UI display     |
| Manual intervention rate      | <5%                   | Errors requiring manual fix         |
| Platform migration throughput | 50 projects in <5 min | Time for batch completion           |
| Dashboard load time           | <2 seconds            | Time to first meaningful paint      |
| Real-time update latency      | <500ms                | Time from DB change to UI update    |

### Service Level Objectives (SLOs)

| SLO                    | Target | Alerting                           |
| ---------------------- | ------ | ---------------------------------- |
| API availability       | 99.9%  | Alert on >0.1% error rate          |
| Migration success rate | >95%   | Alert when dropping below 90%      |
| Run completion         | 99%    | Alert on stuck runs (>30 min idle) |
| Rollback success       | 100%   | Alert on any rollback failure      |

### Monitoring

```typescript
// Prometheus-style metrics
const metrics = {
	migration_projects_total: Counter,
	migration_projects_success: Counter,
	migration_projects_failed: Counter,
	migration_run_duration_seconds: Histogram,
	migration_llm_tokens_total: Counter,
	migration_llm_cost_dollars: Counter,
	migration_errors_by_category: Counter
};
```

---

## Decision Log

Resolutions to open questions from the original spec:

| #   | Question                      | Decision                                                        | Rationale                                                                    |
| --- | ----------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 1   | Background worker vs sync?    | **Sync for <50 projects, worker for larger**                    | Request timeout limits; worker provides better fault tolerance for long runs |
| 2   | Email notifications?          | **No**                                                          | Not needed per stakeholder input                                             |
| 3   | Archived projects by default? | **No**, require explicit `includeArchived` flag                 | Most users don't want archived content migrated                              |
| 4   | Preserve legacy IDs as PKs?   | **No**, use `legacy_entity_mappings`                            | Decouples systems; allows parallel operation                                 |
| 5   | Rollback strategy?            | **Soft delete with 30-day recovery window, hard delete option** | Balance between safety and cleanup                                           |
| 6   | Concurrent admin runs?        | **Platform lock with per-user parallelism**                     | Prevents conflicts while allowing user-scoped work                           |
| 7   | LLM failures?                 | **Circuit breaker + fallback templates**                        | Graceful degradation over hard failure                                       |

---

## Related Documentation

### Ontology System

- [Ontology Data Models](./DATA_MODELS.md)
- [Type Key Taxonomy](./TYPE_KEY_TAXONOMY.md)
- [API Endpoints](./API_ENDPOINTS.md)
- [Implementation Summary](./IMPLEMENTATION_SUMMARY.md)

### Services

- [Migration Orchestrator](../../../src/lib/services/ontology/ontology-migration-orchestrator.ts)
- [Project Migration Service](../../../src/lib/services/ontology/project-migration.service.ts)
- [Task Migration Service](../../../src/lib/services/ontology/task-migration.service.ts)
- [Phase Migration Service](../../../src/lib/services/ontology/phase-migration.service.ts)
- [Calendar Migration Service](../../../src/lib/services/ontology/calendar-migration.service.ts)

### Database

- [migration_log schema](../../../../supabase/migrations/20251124_create_migration_log.sql)
- [legacy_entity_mappings schema](../../../../supabase/migrations/20251122_legacy_mapping_backfill.sql)

### Style Guide

- [BuildOS Style Guide](../../technical/components/BUILDOS_STYLE_GUIDE.md)
- [Modal Components](../../technical/components/modals/README.md)
