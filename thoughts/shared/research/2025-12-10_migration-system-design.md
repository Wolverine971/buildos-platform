---
date: 2025-12-10T00:00:00-08:00
updated: 2025-12-12T00:00:00-08:00
researcher: Claude
repository: buildos-platform
topic: Migration Flow System Design
tags: [research, migration, ontology, system-design, admin]
status: complete
path: thoughts/shared/research/2025-12-10_migration-system-design.md
---

# BuildOS Migration System Design Document

**Status**: Current (December 2025 - Post-Template Removal)

---

## Executive Summary

The BuildOS migration system transforms legacy projects, phases, and tasks into the new ontology schema. **As of December 2025, templates have been removed** from the migration flow, resulting in a significantly simplified architecture:

| Change | Old Approach | New Approach |
|--------|-------------|--------------|
| Template Discovery | LLM-powered matching + creation | **Removed** |
| Property Extraction | Schema-driven with type inference | **Minimal props only** |
| Project Type | Dynamically classified | Fixed: `project.base` |
| Plan Type | Template-matched | Fixed: `plan.phase.project` |
| Task Type | Two-phase classification | **Still active**: `task.{work_mode}[.{spec}]` |

---

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Data Flow Diagram](#data-flow-diagram)
3. [Service Components](#service-components)
4. [Migration Pipeline](#migration-pipeline)
5. [Database Schema](#database-schema)
6. [Error Handling](#error-handling)
7. [API Endpoints](#api-endpoints)
8. [Removed Components](#removed-components)

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         /admin/migration UI                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │  Project    │  │   Phase     │  │    Task     │  │  Progress   │        │
│  │  Selection  │  │  Preview    │  │  Preview    │  │  Monitor    │        │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘        │
└─────────┼────────────────┼────────────────┼────────────────┼────────────────┘
          │                │                │                │
          ▼                ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    API Layer (/api/admin/migration/*)                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │  /start     │  │  /preview   │  │  /status    │  │  /cancel    │        │
│  │  POST       │  │  POST       │  │  GET        │  │  POST       │        │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘        │
└─────────┼────────────────┼────────────────┼────────────────┼────────────────┘
          │                │                │                │
          ▼                ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                   OntologyMigrationOrchestrator                             │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  runMigration(options) → Full Pipeline Execution                     │   │
│  │                                                                       │   │
│  │  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐                 │   │
│  │  │ Project     │ → │ Phase       │ → │ Task        │                 │   │
│  │  │ Migration   │   │ Migration   │   │ Migration   │                 │   │
│  │  │ Service     │   │ Service     │   │ Service     │                 │   │
│  │  └─────────────┘   └─────────────┘   └─────────────┘                 │   │
│  │                                                                       │   │
│  │  Flow: Projects → Plans → Tasks (sequential, with parallel batches)  │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow Diagram

```
                              MIGRATION DATA FLOW
                            (December 2025 - Template-Free)

 ┌────────────────────────────────────────────────────────────────────────┐
 │                           LEGACY SCHEMA                                │
 │  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────────────┐ │
 │  │ projects │    │  phases  │    │  tasks   │    │ phase_tasks (M2M)│ │
 │  └────┬─────┘    └────┬─────┘    └────┬─────┘    └────────┬─────────┘ │
 └───────┼───────────────┼───────────────┼──────────────────┼────────────┘
         │               │               │                  │
         ▼               ▼               ▼                  ▼
 ┌────────────────────────────────────────────────────────────────────────┐
 │                         MIGRATION SERVICES                             │
 │                                                                        │
 │  ┌─────────────────────────────────────────────────────────────────┐  │
 │  │              ProjectMigrationService                             │  │
 │  │  ┌───────────────┐    ┌───────────────┐    ┌───────────────┐    │  │
 │  │  │ fetchCandidates│ →  │ buildAnalysis │ →  │migrateProject │    │  │
 │  │  │               │    │ (counts, etc) │    │ (Enhanced)    │    │  │
 │  │  └───────────────┘    └───────────────┘    └───────┬───────┘    │  │
 │  │                                                     │            │  │
 │  │  EnhancedProjectMigrator:                          │            │  │
 │  │  ┌─────────────────────────────────────────────────┤            │  │
 │  │  │ • type_key = 'project.base' (FIXED DEFAULT)    │            │  │
 │  │  │ • Derives facets from legacy data              │            │  │
 │  │  │ • NO template lookup                           │            │  │
 │  │  │ • NO property extraction                       │            │  │
 │  │  └─────────────────────────────────────────────────┘            │  │
 │  └─────────────────────────────────────────────────────┬────────────┘  │
 │                                                        │               │
 │  ┌─────────────────────────────────────────────────────┼────────────┐  │
 │  │              PhaseMigrationService                  ▼            │  │
 │  │  ┌───────────────┐    ┌───────────────┐    ┌───────────────┐    │  │
 │  │  │ fetchPhases   │ →  │ generatePlans │ →  │ insertPlans   │    │  │
 │  │  │               │    │ (LLM preview) │    │               │    │  │
 │  │  └───────────────┘    └───────────────┘    └───────┬───────┘    │  │
 │  │                                                     │            │  │
 │  │  PlanGenerationService:                            │            │  │
 │  │  ┌─────────────────────────────────────────────────┤            │  │
 │  │  │ • type_key = 'plan.phase.project' (FIXED)      │            │  │
 │  │  │ • LLM generates plan names/summaries           │            │  │
 │  │  │ • Creates onto_edges (has_plan)                │            │  │
 │  │  └─────────────────────────────────────────────────┘            │  │
 │  └─────────────────────────────────────────────────────┬────────────┘  │
 │                                                        │               │
 │  ┌─────────────────────────────────────────────────────┼────────────┐  │
 │  │              TaskMigrationService                   ▼            │  │
 │  │  ┌───────────────┐    ┌───────────────┐    ┌───────────────┐    │  │
 │  │  │ fetchTasks    │ →  │ classifyBatch │ →  │ batchInsert   │    │  │
 │  │  │ (skip done)   │    │ (LLM 2-phase) │    │ (tasks+edges) │    │  │
 │  │  └───────────────┘    └───────────────┘    └───────┬───────┘    │  │
 │  │                              │                     │            │  │
 │  │  BatchTaskMigrationService (TWO-PHASE LLM):       │            │  │
 │  │  ┌─────────────────────────────────────────────────┤            │  │
 │  │  │ Phase 1: Fast LLM → work_mode (8 options)      │            │  │
 │  │  │ Phase 2: Balanced LLM → specialization         │            │  │
 │  │  │ Final: task.{mode}[.{spec}]                    │            │  │
 │  │  │                                                │            │  │
 │  │  │ • Minimal props (no schema extraction)         │            │  │
 │  │  │ • Template resolution REMOVED                  │            │  │
 │  │  └─────────────────────────────────────────────────┘            │  │
 │  └─────────────────────────────────────────────────────┬────────────┘  │
 └────────────────────────────────────────────────────────┼───────────────┘
                                                          │
                                                          ▼
 ┌────────────────────────────────────────────────────────────────────────┐
 │                          ONTOLOGY SCHEMA                               │
 │  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐              │
 │  │ onto_projects │  │  onto_plans   │  │  onto_tasks   │              │
 │  │ • type_key    │  │ • type_key    │  │ • type_key    │              │
 │  │ • state_key   │  │ • state_key   │  │ • state_key   │              │
 │  │ • props       │  │ • props       │  │ • props       │              │
 │  │ • facets      │  │ • facets      │  │ • facet_scale │              │
 │  └───────┬───────┘  └───────┬───────┘  └───────┬───────┘              │
 │          │                  │                  │                       │
 │          ▼                  ▼                  ▼                       │
 │  ┌─────────────────────────────────────────────────────────────────┐  │
 │  │                      onto_edges                                  │  │
 │  │  • project ─[has_plan]→ plan                                    │  │
 │  │  • plan ─[has_task]→ task                                       │  │
 │  │  • task ─[belongs_to_plan]→ plan                                │  │
 │  └─────────────────────────────────────────────────────────────────┘  │
 │                                                                        │
 │  ┌───────────────────────────┐  ┌───────────────────────────────────┐ │
 │  │  legacy_entity_mappings   │  │       migration_log               │ │
 │  │  • legacy_table           │  │  • run_id, batch_id               │ │
 │  │  • legacy_id              │  │  • entity_type, entity_id         │ │
 │  │  • onto_table             │  │  • status, message                │ │
 │  │  • onto_id                │  │  • legacy_payload, metadata       │ │
 │  │  • metadata (JSON)        │  │                                   │ │
 │  └───────────────────────────┘  └───────────────────────────────────┘ │
 └────────────────────────────────────────────────────────────────────────┘
```

---

## Service Components

### 1. OntologyMigrationOrchestrator

**File**: `src/lib/services/ontology/ontology-migration-orchestrator.ts`

**Purpose**: Top-level coordinator for entire migration flow.

```typescript
interface MigrationOptions {
  projectIds?: string[];         // Specific projects or all
  dryRun: boolean;               // Preview mode
  initiatedBy: string;           // User ID
  skipCompletedTasks?: boolean;  // Default: true
  taskConcurrency?: number;      // Parallel task processing
}

interface MigrationResult {
  runId: string;
  status: 'completed' | 'partial' | 'failed';
  projects: ProjectMigrationResult[];
  phases: PhaseMigrationBatchResult[];
  tasks: TaskMigrationBatchResult[];
  summary: MigrationSummary;
}
```

**Flow**:
1. Acquire platform lock (prevents concurrent migrations)
2. Generate run_id and batch_id
3. Migrate projects → plans → tasks (in order)
4. Record all mappings to legacy_entity_mappings
5. Log all operations to migration_log
6. Release lock and return summary

---

### 2. ProjectMigrationService + EnhancedProjectMigrator

**File**: `src/lib/services/ontology/project-migration.service.ts`

**Purpose**: Migrates legacy projects to onto_projects.

**Current Behavior (Template-Free)**:
- Fixed type_key: `project.base`
- No template discovery or property extraction
- Derives facets heuristically from legacy data

```
Legacy Project
     │
     ▼
┌─────────────────┐
│ EnhancedProject │
│ Migrator        │
│                 │
│ • type_key =    │
│   'project.base'│     ┌─────────────────┐
│ • deriveFacets()│ ──▶ │  onto_projects  │
│ • mapStatus()   │     │  • name         │
└─────────────────┘     │  • description  │
                        │  • type_key     │
                        │  • state_key    │
                        │  • props{facets}│
                        └─────────────────┘
```

**Facet Derivation Logic**:
```typescript
// Context (from project.context text)
if (includes('client')) → 'client'
if (includes('work'))   → 'commercial'
if (includes('startup')) → 'startup'
if (includes('academic')) → 'academic'
else                    → 'personal'

// Scale (from description length + tags)
complexity = descLength + tagCount * 50
if (complexity > 1000)  → 'large'
if (complexity > 500)   → 'medium'
if (complexity > 200)   → 'small'
else                    → 'micro'

// Stage (from status)
'completed' → 'complete'
'active'    → 'execution'
'planning'  → 'planning'
default     → 'discovery'
```

---

### 3. PhaseMigrationService

**File**: `src/lib/services/ontology/phase-migration.service.ts`

**Purpose**: Migrates legacy phases to onto_plans.

**Flow**:
```
Legacy Phases (ordered)
        │
        ▼
┌───────────────────────┐
│ PlanGenerationService │
│ (LLM Enhancement)     │
│                       │
│ • Generates summaries │     ┌──────────────┐
│ • Suggests names      │ ──▶ │  onto_plans  │
│ • Preserves order     │     │  • name      │
└───────────────────────┘     │  • type_key  │
                              │  • state_key │
        │                     │  • props     │
        ▼                     └──────┬───────┘
┌───────────────────────┐            │
│    onto_edges         │            │
│  project ─[has_plan]→ │ ◀──────────┘
│  plan                 │
└───────────────────────┘
```

**Default type_key**: `plan.phase.project`

**State Mapping**:
```typescript
if (end_date < now)   → 'complete'
if (start_date <= now) → 'execution'
else                   → 'planning'
```

---

### 4. TaskMigrationService + BatchTaskMigrationService

**Files**:
- `src/lib/services/ontology/task-migration.service.ts`
- `src/lib/services/ontology/batch-task-migration.service.ts`

**Purpose**: Migrates legacy tasks using batch operations.

**Batch Threshold**: 5+ tasks triggers batch mode

**Two-Phase Classification Pipeline**:
```
Legacy Tasks (batch)
        │
        ▼
┌──────────────────────────────────────────┐
│          PHASE 1: Work Mode              │
│          (Fast LLM Model)                │
│                                          │
│  8 Work Modes:                           │
│  ┌────────┬────────────────────────────┐ │
│  │execute │ Action tasks (default)     │ │
│  │create  │ Produce NEW artifacts      │ │
│  │refine  │ Improve EXISTING work      │ │
│  │research│ Investigate/gather info    │ │
│  │review  │ Evaluate and feedback      │ │
│  │coordinate│ Sync with others         │ │
│  │admin   │ Administrative tasks       │ │
│  │plan    │ Strategic planning         │ │
│  └────────┴────────────────────────────┘ │
└──────────────────┬───────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────┐
│          PHASE 2: Specialization         │
│          (Balanced LLM Model)            │
│                                          │
│  Per work_mode group:                    │
│  • coordinate → .meeting, .standup, etc  │
│  • execute   → .deploy, .checklist, etc  │
│  • create    → .design, .prototype, etc  │
│  • (or null for base work mode)          │
└──────────────────┬───────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────┐
│        Final type_key:                   │
│        task.{work_mode}[.{specialization}]│
│                                          │
│        Examples:                         │
│        • task.execute                    │
│        • task.coordinate.meeting         │
│        • task.review.code                │
│        • task.create.design              │
└──────────────────┬───────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────┐
│          BATCH INSERT                    │
│                                          │
│  1. Insert all onto_tasks (batch)        │
│  2. Insert onto_edges (batch)            │
│     • task ─[belongs_to_plan]→ plan      │
│     • plan ─[has_task]→ task             │
│  3. Insert legacy_entity_mappings        │
└──────────────────────────────────────────┘
```

**Task Props Structure** (minimal):
```typescript
{
  title: string;
  description: string | null;
  type_key: string;  // From classification
  facets: {
    scale: 'micro' | 'small' | 'medium' | 'large'  // Inferred from content length
  }
}
```

---

## Migration Pipeline

### Entity Transformation Summary

| Legacy Entity | Ontology Entity | type_key | Source |
|--------------|-----------------|----------|--------|
| `projects` | `onto_projects` | `project.base` | Fixed default |
| `phases` | `onto_plans` | `plan.phase.project` | Fixed default |
| `tasks` | `onto_tasks` | `task.{work_mode}[.{spec}]` | LLM classification |

### Edge Creation

```
┌──────────────────────────────────────────────────────────────┐
│                    EDGE RELATIONSHIPS                        │
│                                                              │
│  onto_projects ────────────────────────► onto_plans          │
│       │           rel: 'has_plan'            │               │
│       │                                      │               │
│       │                                      ▼               │
│       │                              onto_tasks              │
│       │                                      ▲               │
│       │                                      │               │
│       └──────────────────────────────────────┘               │
│                   (implicit via plan)                        │
│                                                              │
│  onto_plans ◀────────────────────────► onto_tasks            │
│       │        rel: 'has_task'              │                │
│       └───────rel: 'belongs_to_plan'────────┘                │
│                   (bidirectional)                            │
└──────────────────────────────────────────────────────────────┘
```

---

## Database Schema

### Core Ontology Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `onto_projects` | Migrated projects | id, name, type_key, state_key, props, facet_* |
| `onto_plans` | Migrated phases | id, project_id, name, type_key, state_key, props |
| `onto_tasks` | Migrated tasks | id, project_id, type_key, title, state_key, priority, due_at, props |
| `onto_edges` | Graph relationships | src_kind, src_id, rel, dst_kind, dst_id |

### Migration Tracking Tables

```sql
-- Migration run/entity logging
CREATE TABLE migration_log (
  id SERIAL PRIMARY KEY,
  run_id UUID NOT NULL,
  batch_id UUID,
  entity_type TEXT NOT NULL,  -- 'run', 'project', 'phase', 'task'
  entity_id UUID,
  status TEXT NOT NULL,       -- 'pending', 'completed', 'failed', 'skipped'
  message TEXT,
  legacy_payload JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Legacy to Ontology mapping (idempotency)
CREATE TABLE legacy_entity_mappings (
  id SERIAL PRIMARY KEY,
  legacy_table TEXT NOT NULL,
  legacy_id UUID NOT NULL,
  onto_table TEXT NOT NULL,
  onto_id UUID NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(legacy_table, legacy_id)
);

-- Platform-wide migration lock
CREATE TABLE migration_platform_lock (
  id INT PRIMARY KEY DEFAULT 1,
  run_id UUID,
  locked_by UUID,
  locked_at TIMESTAMPTZ,
  CHECK (id = 1)  -- Single row table
);
```

---

## Error Handling

### Idempotency

All migrations check `legacy_entity_mappings` before creating new entities:

```typescript
// Before insert
const existing = await getLegacyMapping(client, 'tasks', task.id);
if (existing?.onto_id) {
  return { status: 'completed', message: 'Already migrated' };
}
```

### Batch Fallback

If batch migration fails, falls back to per-task processing:

```typescript
try {
  return await batchMigrator.migrateProjectTasks(tasks, ...);
} catch (error) {
  console.error('Batch migration failed, falling back to per-task');
  // Record fallback in migration_log
  // Falls through to single-task loop
}
```

### Edge Creation Failures

Edge creation failures are NOT silent - they throw errors:

```typescript
const { error: edgeError } = await client.from('onto_edges').insert(edges);
if (edgeError) {
  throw new Error(`Failed to create task-plan edges: ${edgeError.message}`);
}
```

---

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/admin/migration/start` | POST | Start migration run |
| `/api/admin/migration/preview` | POST | Dry-run preview |
| `/api/admin/migration/status` | GET | Check migration status |
| `/api/admin/migration/cancel` | POST | Cancel running migration |

### Start Migration Request

```typescript
POST /api/admin/migration/start
{
  projectIds?: string[],         // Specific projects
  includeArchived?: boolean,     // Include archived projects
  skipCompletedTasks?: boolean,  // Default: true
  dryRun?: boolean,              // Preview mode
  taskConcurrency?: number       // Default: 5
}
```

---

## Removed Components

The following were removed in December 2025:

| Component | Old Purpose | Status |
|-----------|-------------|--------|
| `FindOrCreateTemplateService` | Template discovery + creation | **REMOVED** |
| `PropertyExtractorEngine` | Schema-driven property extraction | **REMOVED** |
| `SchemaAutoRepairService` | Self-healing schema validation | **REMOVED** |
| `ProjectTemplateInferenceService` | LLM template matching | **REMOVED** |
| `onto_templates` table | Template definitions | **NOT USED** |
| Template confidence scores | Match quality tracking | **REMOVED** |

### Simplified Flow

**OLD (Template-Driven)**:
```
Legacy → Template Discovery → Schema Lookup → Property Extraction →
Schema Validation → Deep Merge with Defaults → Insert
```

**NEW (Template-Free)**:
```
Legacy → Classification (LLM for tasks only) → Minimal Props → Insert
```

---

## Key Files Reference

| Component | File Path |
|-----------|-----------|
| Admin Dashboard | `apps/web/src/routes/admin/migration/+page.svelte` |
| Start Endpoint | `apps/web/src/routes/api/admin/migration/start/+server.ts` |
| Orchestrator | `apps/web/src/lib/services/ontology/ontology-migration-orchestrator.ts` |
| Project Migration | `apps/web/src/lib/services/ontology/project-migration.service.ts` |
| Phase Migration | `apps/web/src/lib/services/ontology/phase-migration.service.ts` |
| Task Migration | `apps/web/src/lib/services/ontology/task-migration.service.ts` |
| Batch Task Migration | `apps/web/src/lib/services/ontology/batch-task-migration.service.ts` |
| Enhanced Project Migrator | `apps/web/src/lib/services/ontology/migration/enhanced-project-migrator.ts` |
| Enhanced Migration Types | `apps/web/src/lib/services/ontology/migration/enhanced-migration.types.ts` |
| Legacy Mapping Service | `apps/web/src/lib/services/ontology/legacy-mapping.service.ts` |
| Migration Types | `apps/web/src/lib/services/ontology/migration.types.ts` |

---

## Summary

The current migration system (December 2025) is **significantly simplified** from the original template-driven approach:

### What Works
1. **Project migration** with automatic facet derivation (no templates)
2. **Phase-to-plan migration** with LLM name/summary generation
3. **Task migration** with two-phase work mode classification
4. **Batch operations** for 5+ tasks (optimized LLM calls)
5. **Idempotency** via legacy_entity_mappings
6. **Audit logging** via migration_log

### What's Fixed/Simplified
1. Fixed type_keys for projects (`project.base`) and plans (`plan.phase.project`)
2. No template discovery or matching required
3. No schema-driven property extraction
4. No deep merge with template defaults
5. Tasks still use LLM classification for dynamic type_keys

### Future Considerations
1. Project type classification could be re-added if needed
2. Plan type variety could be added
3. Property extraction could return for specific use cases
4. Template system could be rebuilt with simpler approach

---

**Document Updated**: December 12, 2025
**Status**: Current - reflects post-template removal architecture
