---
date: 2025-12-10T00:00:00-08:00
researcher: Claude
repository: buildos-platform
topic: Migration Flow System Design
tags: [research, migration, ontology, system-design, admin]
status: complete
---

<!-- todo -->

# BuildOS Migration System Design Document

## Executive Summary

The BuildOS migration system transforms legacy data structures (projects, phases, tasks, calendar events) into the new **Ontology** schema. It features a multi-tiered architecture with an orchestrator coordinating specialized migrators, LLM-powered template discovery, batch optimizations, comprehensive error handling, and an admin dashboard for monitoring and control.

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture Diagram](#architecture-diagram)
3. [Data Flow](#data-flow)
4. [Component Details](#component-details)
5. [Migration Pipeline](#migration-pipeline)
6. [Error Handling & Recovery](#error-handling--recovery)
7. [Performance Optimizations](#performance-optimizations)
8. [Admin Dashboard](#admin-dashboard)
9. [Database Schema](#database-schema)
10. [API Endpoints](#api-endpoints)

---

## System Overview

### Purpose

Migrate legacy BuildOS entities to the new Ontology-based schema:

| Legacy Entity | Ontology Entity | Key Transformation |
|--------------|-----------------|-------------------|
| `projects` | `onto_projects` | Template-typed with FSM states |
| `phases` | `onto_plans` | Linked via edges, schedule in props |
| `tasks` | `onto_tasks` | LLM-classified type_key, facets |
| `calendar_events` | `onto_tasks` (linked) | Associated via edges |

### Key Features

- **LLM-Powered Classification**: Tasks classified into work modes (execute, create, refine, research, review, coordinate, admin, plan) with optional specializations
- **Template Discovery**: Automatic template matching/creation via `FindOrCreateTemplateService`
- **Batch Processing**: Optimized batch operations minimize LLM calls and DB queries
- **Idempotent Operations**: Legacy mapping table prevents duplicate migrations
- **Platform Locking**: Ensures single migration run at a time
- **Error Categorization**: Recoverable, data, and fatal error classification with remediation suggestions

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              ADMIN DASHBOARD                                     │
│                         /admin/migration/+page.svelte                            │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │  Global Progress │ User Stats │ Error Management │ Run Controls          │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
└───────────────────────────────────────┬─────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                API LAYER                                         │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌───────────────┐  │
│  │ /api/admin/     │ │ /api/admin/     │ │ /api/admin/     │ │ /api/admin/   │  │
│  │ migration/start │ │ migration/stats │ │ migration/errors│ │ migration/    │  │
│  │                 │ │                 │ │                 │ │ preview       │  │
│  └────────┬────────┘ └────────┬────────┘ └────────┬────────┘ └───────┬───────┘  │
└───────────┼────────────────────┼────────────────────┼──────────────────┼─────────┘
            │                    │                    │                  │
            ▼                    ▼                    ▼                  ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           SERVICE LAYER                                          │
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                    OntologyMigrationOrchestrator                         │    │
│  │                ontology-migration-orchestrator.ts                        │    │
│  │                                                                          │    │
│  │  • Coordinates entire migration pipeline                                 │    │
│  │  • Manages run/batch context                                             │    │
│  │  • Handles concurrency (project, phase, task, event)                     │    │
│  │  • Pre-fetches mappings for performance                                  │    │
│  └────────────────────────────────┬────────────────────────────────────────┘    │
│                                   │                                              │
│  ┌────────────────────────────────┼────────────────────────────────────────┐    │
│  │                                │                                        │    │
│  │    ┌───────────────────────────┼───────────────────────────┐           │    │
│  │    │                           │                           │           │    │
│  │    ▼                           ▼                           ▼           │    │
│  │ ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐       │    │
│  │ │ ProjectMigration │  │  PhaseMigration  │  │  TaskMigration   │       │    │
│  │ │     Service      │  │     Service      │  │     Service      │       │    │
│  │ └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘       │    │
│  │          │                     │                     │                 │    │
│  │          ▼                     ▼                     ▼                 │    │
│  │ ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐       │    │
│  │ │ EnhancedProject  │  │  EnhancedPlan    │  │  EnhancedTask    │       │    │
│  │ │    Migrator      │  │    Migrator      │  │    Migrator      │       │    │
│  │ └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘       │    │
│  │          │                     │                     │                 │    │
│  │          └─────────────────────┼─────────────────────┘                 │    │
│  │                                │                                        │    │
│  │                                ▼                                        │    │
│  │          ┌─────────────────────────────────────────────────┐           │    │
│  │          │         BatchTaskMigrationService               │           │    │
│  │          │    (Optimized 4-phase batch processing)         │           │    │
│  │          │                                                 │           │    │
│  │          │  Phase 1: CLASSIFY  → Work mode + specialization│           │    │
│  │          │  Phase 2: RESOLVE   → Template lookup/creation  │           │    │
│  │          │  Phase 3: EXTRACT   → Property extraction       │           │    │
│  │          │  Phase 4: INSERT    → Batch DB operations       │           │    │
│  │          └────────────────────┬────────────────────────────┘           │    │
│  │                               │                                        │    │
│  └───────────────────────────────┼────────────────────────────────────────┘    │
│                                  │                                              │
│  ┌───────────────────────────────┼────────────────────────────────────────┐    │
│  │                               ▼                                        │    │
│  │  ┌──────────────────────────────────────────────────────────────────┐ │    │
│  │  │                    FindOrCreateTemplateService                    │ │    │
│  │  │                                                                   │ │    │
│  │  │  • Template discovery with LLM similarity matching                │ │    │
│  │  │  • Dynamic template creation when no match found                  │ │    │
│  │  │  • 70% match threshold for template selection                     │ │    │
│  │  └──────────────────────────────────────────────────────────────────┘ │    │
│  │                                                                        │    │
│  │  ┌──────────────────────────────────────────────────────────────────┐ │    │
│  │  │                    PropertyExtractorEngine                        │ │    │
│  │  │                                                                   │ │    │
│  │  │  • Intelligent property extraction from legacy data               │ │    │
│  │  │  • Type inference ($80k → 80000, "June 2026" → ISO date)         │ │    │
│  │  │  • Schema validation                                              │ │    │
│  │  │  • Deep merge with template defaults                              │ │    │
│  │  └──────────────────────────────────────────────────────────────────┘ │    │
│  │                                                                        │    │
│  │  ┌──────────────────────────────────────────────────────────────────┐ │    │
│  │  │                    SchemaAutoRepairService                        │ │    │
│  │  │                                                                   │ │    │
│  │  │  • Detects schema/default mismatches                              │ │    │
│  │  │  • LLM-powered schema repair suggestions                          │ │    │
│  │  │  • Auto-fixes validation errors                                   │ │    │
│  │  └──────────────────────────────────────────────────────────────────┘ │    │
│  └────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────┐    │
│  │                         SUPPORT SERVICES                               │    │
│  │                                                                        │    │
│  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────────────┐   │    │
│  │  │ MigrationStats │  │ MigrationError │  │ CalendarMigration      │   │    │
│  │  │    Service     │  │    Service     │  │      Service           │   │    │
│  │  │                │  │                │  │                        │   │    │
│  │  │ • User stats   │  │ • Error query  │  │ • Event linking        │   │    │
│  │  │ • Global prog  │  │ • Categorize   │  │ • Calendar sync        │   │    │
│  │  │ • Lock mgmt    │  │ • Remediation  │  │ • Edge creation        │   │    │
│  │  │ • Recent runs  │  │ • Delete/retry │  │                        │   │    │
│  │  └────────────────┘  └────────────────┘  └────────────────────────┘   │    │
│  │                                                                        │    │
│  │  ┌────────────────────────────────────────────────────────────────┐   │    │
│  │  │                    LegacyMappingService                         │   │    │
│  │  │                                                                 │   │    │
│  │  │  • Tracks legacy_id → onto_id mappings                          │   │    │
│  │  │  • Checksum-based change detection                              │   │    │
│  │  │  • Batch lookup for idempotency                                 │   │    │
│  │  └────────────────────────────────────────────────────────────────┘   │    │
│  └────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              DATABASE LAYER                                      │
│                                                                                  │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │                           LEGACY TABLES                                   │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────────┐               │   │
│  │  │ projects │ │  phases  │ │  tasks   │ │ calendar_events│               │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └────────────────┘               │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                        │                                         │
│                                        ▼                                         │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │                         MIGRATION TABLES                                  │   │
│  │  ┌─────────────────────┐ ┌──────────────────────────┐                    │   │
│  │  │    migration_log    │ │ legacy_entity_mappings   │                    │   │
│  │  │                     │ │                          │                    │   │
│  │  │ • run_id, batch_id  │ │ • legacy_table           │                    │   │
│  │  │ • entity_type       │ │ • legacy_id              │                    │   │
│  │  │ • status            │ │ • onto_table             │                    │   │
│  │  │ • error_message     │ │ • onto_id                │                    │   │
│  │  │ • metadata          │ │ • checksum               │                    │   │
│  │  └─────────────────────┘ └──────────────────────────┘                    │   │
│  │                                                                           │   │
│  │  ┌─────────────────────────┐ ┌──────────────────────────────────────┐    │   │
│  │  │ migration_platform_lock │ │ user_migration_stats (materialized)  │    │   │
│  │  └─────────────────────────┘ └──────────────────────────────────────┘    │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                        │                                         │
│                                        ▼                                         │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │                          ONTOLOGY TABLES                                  │   │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌────────────────┐   │   │
│  │  │onto_projects │ │ onto_plans   │ │ onto_tasks   │ │ onto_templates │   │   │
│  │  └──────────────┘ └──────────────┘ └──────────────┘ └────────────────┘   │   │
│  │                                                                           │   │
│  │  ┌──────────────────────────────────────────────────────────────────┐    │   │
│  │  │                         onto_edges                                │    │   │
│  │  │  (project ↔ plan, plan ↔ task, task ↔ calendar relationships)    │    │   │
│  │  └──────────────────────────────────────────────────────────────────┘    │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow

### Complete Migration Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                            MIGRATION RUN LIFECYCLE                               │
└─────────────────────────────────────────────────────────────────────────────────┘

   ┌──────────────────┐
   │   Admin Triggers │
   │    Migration     │
   └────────┬─────────┘
            │
            ▼
   ┌──────────────────────────────────────────────────────────────────┐
   │                    PRE-FLIGHT CHECKS                              │
   │  ┌────────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
   │  │ Auth Check     │─▶│ Admin Check  │─▶│ Lock Acquisition     │  │
   │  │ (user exists)  │  │ (is_admin)   │  │ (platform-wide runs) │  │
   │  └────────────────┘  └──────────────┘  └──────────────────────┘  │
   └───────────────────────────────┬──────────────────────────────────┘
                                   │
                                   ▼
   ┌──────────────────────────────────────────────────────────────────┐
   │                    ORCHESTRATOR INITIALIZATION                    │
   │                                                                   │
   │  1. Generate run_id (UUID)                                        │
   │  2. Generate batch_id (UUID)                                      │
   │  3. Create migration context with options:                        │
   │     • skipCompletedTasks                                          │
   │     • projectConcurrency (default: 3, max: 10)                    │
   │     • phaseConcurrency (default: 5, max: 15)                      │
   │     • taskConcurrency (default: 5, max: 20)                       │
   │     • eventConcurrency (default: 10, max: 30)                     │
   │  4. Pre-fetch existing legacy mappings (optimization)             │
   └───────────────────────────────┬──────────────────────────────────┘
                                   │
                                   ▼
   ┌──────────────────────────────────────────────────────────────────┐
   │                    LOG MIGRATION RUN START                        │
   │  INSERT INTO migration_log (entity_type='run', status='pending')  │
   └───────────────────────────────┬──────────────────────────────────┘
                                   │
            ┌──────────────────────┴──────────────────────┐
            │     FOR EACH PROJECT (with concurrency)     │
            ▼                                             │
   ┌──────────────────────────────────────────────────────┴───────────┐
   │                                                                   │
   │   ╔═══════════════════════════════════════════════════════════╗  │
   │   ║              PHASE 1: PROJECT MIGRATION                   ║  │
   │   ╚═══════════════════════════════════════════════════════════╝  │
   │                                                                   │
   │   ┌─────────────────────────────────────────────────────────┐    │
   │   │ ProjectMigrationService.migrateProject()                │    │
   │   │                                                          │    │
   │   │  1. Check legacy mapping (idempotency)                   │    │
   │   │     └─▶ If exists: Skip (already migrated)               │    │
   │   │                                                          │    │
   │   │  2. Load project with phases from legacy DB              │    │
   │   │                                                          │    │
   │   │  3. EnhancedProjectMigrator.migrate()                    │    │
   │   │     ├─▶ Build project narrative (name, desc, context,    │    │
   │   │     │    core values, tags, executive summary)           │    │
   │   │     ├─▶ Infer realm (writer, developer, event, etc.)     │    │
   │   │     ├─▶ FindOrCreateTemplateService.findOrCreate()       │    │
   │   │     │    • Match against existing templates (70% thresh) │    │
   │   │     │    • Create new template if no match               │    │
   │   │     ├─▶ PropertyExtractorEngine.extractProperties()      │    │
   │   │     ├─▶ SchemaAutoRepairService (if validation fails)    │    │
   │   │     ├─▶ Merge props with template defaults               │    │
   │   │     └─▶ INSERT INTO onto_projects                        │    │
   │   │                                                          │    │
   │   │  4. Create context document (if project has context)     │    │
   │   │     └─▶ INSERT INTO onto_documents (type='context')      │    │
   │   │     └─▶ Link via onto_edges                              │    │
   │   │                                                          │    │
   │   │  5. Record legacy mapping                                │    │
   │   │     └─▶ INSERT INTO legacy_entity_mappings               │    │
   │   │                                                          │    │
   │   │  6. Log success/failure                                  │    │
   │   │     └─▶ INSERT INTO migration_log                        │    │
   │   └─────────────────────────────────────────────────────────┘    │
   │                          │                                        │
   │                          ▼                                        │
   │   ╔═══════════════════════════════════════════════════════════╗  │
   │   ║              PHASE 2: PHASE → PLAN MIGRATION              ║  │
   │   ╚═══════════════════════════════════════════════════════════╝  │
   │                                                                   │
   │   ┌─────────────────────────────────────────────────────────┐    │
   │   │ PhaseMigrationService.migratePhasesForProject()         │    │
   │   │                                                          │    │
   │   │  FOR EACH PHASE (with phaseConcurrency):                 │    │
   │   │                                                          │    │
   │   │  1. Check legacy mapping (idempotency)                   │    │
   │   │     └─▶ If exists: Use cached onto_plan_id               │    │
   │   │                                                          │    │
   │   │  2. EnhancedPlanMigrator.migrate()                       │    │
   │   │     ├─▶ Build phase narrative                            │    │
   │   │     ├─▶ Infer realm from phase name/description          │    │
   │   │     ├─▶ FindOrCreateTemplateService (scope: 'plan')      │    │
   │   │     ├─▶ PropertyExtractorEngine for plan props           │    │
   │   │     ├─▶ Determine state (draft/active/complete)          │    │
   │   │     └─▶ INSERT INTO onto_plans                           │    │
   │   │                                                          │    │
   │   │  3. Create project→plan edge                             │    │
   │   │     └─▶ INSERT INTO onto_edges (rel='has_plan')          │    │
   │   │                                                          │    │
   │   │  4. Record legacy mapping & log                          │    │
   │   │                                                          │    │
   │   │  RETURNS: phaseToPlanMapping {legacy_phase_id → plan_id} │    │
   │   └─────────────────────────────────────────────────────────┘    │
   │                          │                                        │
   │                          ▼                                        │
   │   ╔═══════════════════════════════════════════════════════════╗  │
   │   ║              PHASE 3: TASK MIGRATION (BATCH)              ║  │
   │   ╚═══════════════════════════════════════════════════════════╝  │
   │                                                                   │
   │   ┌─────────────────────────────────────────────────────────┐    │
   │   │ TaskMigrationService.migrateTasksForProject()           │    │
   │   │                                                          │    │
   │   │  1. Load all tasks for project                           │    │
   │   │     └─▶ Filter out: deleted, completed (if skipCompleted)│    │
   │   │                                                          │    │
   │   │  2. Build taskToPhaseMapping {task_id → phase_id}        │    │
   │   │                                                          │    │
   │   │  3. BatchTaskMigrationService.migrateProjectTasks()      │    │
   │   │                                                          │    │
   │   │     ┌─────────────────────────────────────────────────┐  │    │
   │   │     │        BATCH CLASSIFICATION (Phase 1)           │  │    │
   │   │     │                                                  │  │    │
   │   │     │  Two-Phase Hierarchical Classification:          │  │    │
   │   │     │                                                  │  │    │
   │   │     │  Phase 1a: Work Mode (Fast LLM)                  │  │    │
   │   │     │  ├─▶ execute (default)                           │  │    │
   │   │     │  ├─▶ create (new artifacts)                      │  │    │
   │   │     │  ├─▶ refine (improve existing)                   │  │    │
   │   │     │  ├─▶ research (investigate)                      │  │    │
   │   │     │  ├─▶ review (evaluate)                           │  │    │
   │   │     │  ├─▶ coordinate (sync with others)               │  │    │
   │   │     │  ├─▶ admin (housekeeping)                        │  │    │
   │   │     │  └─▶ plan (strategic thinking)                   │  │    │
   │   │     │                                                  │  │    │
   │   │     │  Phase 1b: Specialization (Balanced LLM)         │  │    │
   │   │     │  └─▶ task.execute.deploy                         │  │    │
   │   │     │  └─▶ task.coordinate.meeting                     │  │    │
   │   │     │  └─▶ task.review.code                            │  │    │
   │   │     │  └─▶ (or base: task.execute)                     │  │    │
   │   │     └─────────────────────────────────────────────────┘  │    │
   │   │                                                          │    │
   │   │     ┌─────────────────────────────────────────────────┐  │    │
   │   │     │        TEMPLATE RESOLUTION (Phase 2)            │  │    │
   │   │     │                                                  │  │    │
   │   │     │  1. Single DB query for all task templates       │  │    │
   │   │     │  2. Separate existing vs new type_keys           │  │    │
   │   │     │  3. Resolve existing templates (no LLM)          │  │    │
   │   │     │  4. Create new templates via FindOrCreate        │  │    │
   │   │     │     └─▶ Or fallback to parent (task.execute)     │  │    │
   │   │     └─────────────────────────────────────────────────┘  │    │
   │   │                                                          │    │
   │   │     ┌─────────────────────────────────────────────────┐  │    │
   │   │     │        PROPERTY EXTRACTION (Phase 3)            │  │    │
   │   │     │                                                  │  │    │
   │   │     │  • Group tasks by type_key                       │  │    │
   │   │     │  • Batch extract per schema                      │  │    │
   │   │     │  • Type inference (currency, dates, arrays)      │  │    │
   │   │     │  • Merge with template defaults                  │  │    │
   │   │     └─────────────────────────────────────────────────┘  │    │
   │   │                                                          │    │
   │   │     ┌─────────────────────────────────────────────────┐  │    │
   │   │     │        DATABASE OPERATIONS (Phase 4)            │  │    │
   │   │     │                                                  │  │    │
   │   │     │  1. Check existing mappings (idempotency)        │  │    │
   │   │     │  2. Batch INSERT INTO onto_tasks                 │  │    │
   │   │     │  3. Batch INSERT INTO onto_edges (task→plan)     │  │    │
   │   │     │     └─▶ Per-task plan linkage via mapping        │  │    │
   │   │     │  4. Batch INSERT legacy_entity_mappings          │  │    │
   │   │     └─────────────────────────────────────────────────┘  │    │
   │   │                                                          │    │
   │   │  RETURNS: tasksMigrated count, errors array              │    │
   │   └─────────────────────────────────────────────────────────┘    │
   │                          │                                        │
   │                          ▼                                        │
   │   ╔═══════════════════════════════════════════════════════════╗  │
   │   ║              PHASE 4: CALENDAR EVENT MIGRATION            ║  │
   │   ╚═══════════════════════════════════════════════════════════╝  │
   │                                                                   │
   │   ┌─────────────────────────────────────────────────────────┐    │
   │   │ CalendarMigrationService.migrateCalendarForProject()    │    │
   │   │                                                          │    │
   │   │  1. Load calendar events linked to project tasks         │    │
   │   │                                                          │    │
   │   │  2. FOR EACH EVENT (with eventConcurrency):              │    │
   │   │     ├─▶ Look up task mapping (legacy → onto)             │    │
   │   │     ├─▶ Create edge linking event to onto_task           │    │
   │   │     │    └─▶ INSERT INTO onto_edges                      │    │
   │   │     │        (rel='has_calendar_event')                  │    │
   │   │     └─▶ Record legacy mapping                            │    │
   │   │                                                          │    │
   │   │  Note: Events stay in calendar_events table,             │    │
   │   │        linked via edges to onto_tasks                    │    │
   │   └─────────────────────────────────────────────────────────┘    │
   │                                                                   │
   └───────────────────────────────┬──────────────────────────────────┘
                                   │
                                   ▼
   ┌──────────────────────────────────────────────────────────────────┐
   │                    POST-MIGRATION                                 │
   │                                                                   │
   │  1. Release platform lock (if acquired)                           │
   │  2. Refresh materialized stats view                               │
   │     └─▶ CALL refresh_user_migration_stats()                       │
   │  3. Update run status                                             │
   │     └─▶ UPDATE migration_log SET status='completed'               │
   │  4. Return summary to caller                                      │
   │     └─▶ { runId, batchId, status, totalProjects, results }        │
   └──────────────────────────────────────────────────────────────────┘
```

---

## Component Details

### 1. OntologyMigrationOrchestrator

**Location**: `apps/web/src/lib/services/ontology/ontology-migration-orchestrator.ts`

**Responsibilities**:
- Main entry point for migration runs
- Coordinates all migration phases
- Manages concurrency settings
- Pre-fetches mappings for performance
- Handles dry-run mode

**Key Methods**:
```typescript
start(options: MigrationRunOptions): Promise<MigrationRunSummary>
```

### 2. Project Migration Service

**Location**: `apps/web/src/lib/services/ontology/project-migration.service.ts`

**Flow**:
1. Check idempotency via `getLegacyMapping()`
2. Load project with phases
3. Call `EnhancedProjectMigrator.migrate()`
4. Create context document if needed
5. Record mapping and log

### 3. Phase Migration Service

**Location**: `apps/web/src/lib/services/ontology/phase-migration.service.ts`

**Flow**:
1. Iterate phases with concurrency
2. Call `EnhancedPlanMigrator.migrate()`
3. Create project→plan edges
4. Build `phaseToPlanMapping` for task migration

### 4. Task Migration Service

**Location**: `apps/web/src/lib/services/ontology/task-migration.service.ts`

**Flow**:
1. Load tasks, filter completed if needed
2. Build `taskToPhaseMapping`
3. Delegate to `BatchTaskMigrationService`

### 5. BatchTaskMigrationService

**Location**: `apps/web/src/lib/services/ontology/batch-task-migration.service.ts`

**Optimization Pipeline**:
```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  CLASSIFY   │───▶│   RESOLVE   │───▶│   EXTRACT   │───▶│   INSERT    │
│ (1 LLM/batch)│    │  TEMPLATES  │    │ (N by schema)│    │  (batch DB) │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
```

**Two-Phase Classification**:
- Phase 1a: Fast LLM selects work_mode (8 options)
- Phase 1b: Balanced LLM adds specialization per work_mode group

### 6. Enhanced Migrators

All enhanced migrators follow the same pattern:

```
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│  Build Narrative │───▶│  Template Match  │───▶│  Property Extract│
│  (context-rich)  │    │  (FindOrCreate)  │    │  (LLM-powered)   │
└──────────────────┘    └──────────────────┘    └──────────────────┘
         │                                               │
         │              ┌──────────────────┐             │
         └─────────────▶│  Schema Validate │◀────────────┘
                        │  & Auto-Repair   │
                        └────────┬─────────┘
                                 │
                        ┌────────▼─────────┐
                        │   Merge Defaults │
                        │   & Insert       │
                        └──────────────────┘
```

### 7. FindOrCreateTemplateService

**Location**: `apps/web/src/lib/services/ontology/find-or-create-template.service.ts`

**Key Features**:
- 70% match threshold for template selection
- LLM-powered similarity matching
- Dynamic template creation with proper inheritance
- Scope-aware (project, plan, task, goal, document)

### 8. Support Services

| Service | Purpose |
|---------|---------|
| `MigrationStatsService` | User stats, global progress, lock management |
| `MigrationErrorService` | Error categorization, remediation suggestions |
| `LegacyMappingService` | Idempotent mapping tracking with checksums |
| `CalendarMigrationService` | Event linking via edges |

---

## Error Handling & Recovery

### Error Categories

```
┌─────────────────────────────────────────────────────────────────┐
│                      ERROR CLASSIFICATION                        │
├─────────────────┬───────────────────────────────────────────────┤
│   RECOVERABLE   │ Timeout, rate limit, connection errors        │
│                 │ → Action: retry                               │
├─────────────────┼───────────────────────────────────────────────┤
│      DATA       │ Template mismatch, validation, schema errors  │
│                 │ → Action: retry_with_fallback                 │
├─────────────────┼───────────────────────────────────────────────┤
│      FATAL      │ Corrupted data, circular refs, unsupported    │
│                 │ → Action: skip                                │
└─────────────────┴───────────────────────────────────────────────┘
```

### Fallback Templates

| Entity Type | Fallback Template |
|-------------|------------------|
| project | `project.generic` |
| task | `task.execute` |
| phase | `plan.timebox.sprint` |
| calendar | (none - skip) |

### Retry Logic

- Max 3 retries per entity
- Exponential backoff for recoverable errors
- Auto-repair for schema validation failures

---

## Performance Optimizations

### 1. Pre-fetched Mappings Cache

```typescript
interface PrefetchedMappingsCache {
  projects: Map<string, string>;  // legacy_id → onto_id
  phases: Map<string, string>;
  tasks: Map<string, string>;
  events: Map<string, string>;
}
```

### 2. Batch Operations

| Operation | Single | Batch | Improvement |
|-----------|--------|-------|-------------|
| Task Classification | N LLM calls | 1 LLM call/batch | ~95% reduction |
| Template Loading | N DB queries | 1 DB query | ~99% reduction |
| Property Extraction | N LLM calls | 1 per schema | ~80% reduction |
| DB Inserts | N queries | Batch insert | ~90% reduction |

### 3. Concurrency Controls

```typescript
{
  projectConcurrency: 3,   // max: 10
  phaseConcurrency: 5,     // max: 15
  taskConcurrency: 5,      // max: 20
  eventConcurrency: 10     // max: 30
}
```

### 4. Two-Phase Classification

- Phase 1: Fast LLM (8-way classification) - low latency
- Phase 2: Balanced LLM (specialization) - accuracy where needed

---

## Admin Dashboard

### Location
`apps/web/src/routes/admin/migration/+page.svelte`

### Features

```
┌─────────────────────────────────────────────────────────────────┐
│                    MIGRATION DASHBOARD                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              GLOBAL PROGRESS                             │    │
│  │  Projects: ████████████░░░░ 75%  (150/200)              │    │
│  │  Tasks:    ██████████░░░░░░ 62%  (1200/1940)            │    │
│  │  Users:    ██████████████░░ 88%  (44/50)                │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              ACTIVE RUN STATUS                           │    │
│  │  Run ID: abc-123-def                                     │    │
│  │  Started: 2 hours ago                                    │    │
│  │  Projects Processed: 45                                  │    │
│  │  Locked By: admin@buildos.io                            │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              USER MIGRATION STATS                        │    │
│  │  ┌──────────────────────────────────────────────────┐   │    │
│  │  │ User         │ Projects │ % Complete │ Status    │   │    │
│  │  ├──────────────┼──────────┼────────────┼───────────┤   │    │
│  │  │ user1@...    │ 15       │ 100%       │ complete  │   │    │
│  │  │ user2@...    │ 8        │ 75%        │ partial   │   │    │
│  │  │ user3@...    │ 3        │ 0%         │ pending   │   │    │
│  │  └──────────────┴──────────┴────────────┴───────────┘   │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              ERROR MANAGEMENT                            │    │
│  │  Recoverable: 12    Data: 8    Fatal: 2                 │    │
│  │                                                          │    │
│  │  [Retry Recoverable] [Retry with Fallback] [Clear All]  │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              RUN CONTROLS                                │    │
│  │                                                          │    │
│  │  Target: [○ All Users] [○ Specific User] [○ Projects]   │    │
│  │                                                          │    │
│  │  Options:                                                │    │
│  │  [x] Skip Completed Tasks                                │    │
│  │  [x] Skip Already Migrated                               │    │
│  │  [ ] Dry Run                                             │    │
│  │  [ ] Include Archived                                    │    │
│  │                                                          │    │
│  │  [Start Migration]                                       │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Database Schema

### Migration Tables

```sql
-- Migration run/entity logging
CREATE TABLE migration_log (
  id SERIAL PRIMARY KEY,
  run_id UUID NOT NULL,
  batch_id UUID,
  org_id UUID,
  user_id UUID,
  entity_type TEXT NOT NULL,  -- 'run', 'project', 'phase', 'task', 'calendar'
  operation TEXT,
  legacy_table TEXT,
  legacy_id UUID,
  onto_table TEXT,
  onto_id UUID,
  status TEXT NOT NULL,       -- 'pending', 'in_progress', 'completed', 'failed', 'skipped'
  error_message TEXT,
  error_category TEXT,        -- 'recoverable', 'data', 'fatal'
  retry_count INT DEFAULT 0,
  last_retry_at TIMESTAMPTZ,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Legacy to Ontology mapping (idempotency)
CREATE TABLE legacy_entity_mappings (
  id SERIAL PRIMARY KEY,
  legacy_table TEXT NOT NULL,
  legacy_id UUID NOT NULL,
  onto_table TEXT NOT NULL,
  onto_id UUID NOT NULL,
  checksum TEXT,              -- SHA256 of legacy record
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
  expires_at TIMESTAMPTZ,
  CHECK (id = 1)  -- Single row table
);

-- Materialized view for user stats
CREATE MATERIALIZED VIEW user_migration_stats AS
SELECT
  u.id as user_id,
  u.email,
  u.name,
  u.avatar_url,
  COUNT(DISTINCT p.id) as total_projects,
  COUNT(DISTINCT CASE WHEN m.onto_id IS NOT NULL THEN p.id END) as migrated_projects,
  -- ... more stats
FROM users u
LEFT JOIN projects p ON p.user_id = u.id
LEFT JOIN legacy_entity_mappings m ON m.legacy_table = 'projects' AND m.legacy_id = p.id
GROUP BY u.id;
```

---

## API Endpoints

### Migration Control

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/admin/migration/start` | POST | Start migration run |
| `/api/admin/migration/preview` | POST | Preview migration (dry-run) |
| `/api/admin/migration/stats` | GET | Get global progress |
| `/api/admin/migration/users` | GET | Get user migration stats |
| `/api/admin/migration/errors` | GET | Get migration errors |
| `/api/admin/migration/errors/retry` | POST | Retry failed migrations |
| `/api/admin/migration/errors/delete` | DELETE | Delete error records |
| `/api/admin/migration/lock` | GET | Get lock status |
| `/api/admin/migration/refresh-stats` | POST | Refresh materialized view |

### Start Migration Request

```typescript
POST /api/admin/migration/start
{
  // Target selection (mutually exclusive)
  projectIds?: string[],     // Specific projects
  userId?: string,           // All projects for user
  // (empty = platform-wide)

  // Options
  includeArchived?: boolean,
  skipAlreadyMigrated?: boolean,  // Default: true
  skipCompletedTasks?: boolean,   // Default: true
  dryRun?: boolean,

  // Concurrency
  projectConcurrency?: number,    // Default: 3, max: 10
  phaseConcurrency?: number,      // Default: 5, max: 15
  taskConcurrency?: number,       // Default: 5, max: 20
  eventConcurrency?: number       // Default: 10, max: 30
}
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
| Enhanced Plan Migrator | `apps/web/src/lib/services/ontology/migration/enhanced-plan-migrator.ts` |
| Enhanced Task Migrator | `apps/web/src/lib/services/ontology/migration/enhanced-task-migrator.ts` |
| Find/Create Template | `apps/web/src/lib/services/ontology/find-or-create-template.service.ts` |
| Property Extractor | `apps/web/src/lib/services/ontology/migration/property-extractor-engine.ts` |
| Schema Auto-Repair | `apps/web/src/lib/services/ontology/migration/schema-auto-repair.service.ts` |
| Stats Service | `apps/web/src/lib/services/ontology/migration-stats.service.ts` |
| Error Service | `apps/web/src/lib/services/ontology/migration-error.service.ts` |
| Legacy Mapping | `apps/web/src/lib/services/ontology/legacy-mapping.service.ts` |
| Calendar Migration | `apps/web/src/lib/services/ontology/calendar-migration.service.ts` |
| Types | `apps/web/src/lib/services/ontology/migration.types.ts` |

---

## Summary

The BuildOS migration system is a sophisticated, multi-layered architecture designed to:

1. **Transform** legacy entities to the new Ontology schema with full fidelity
2. **Classify** tasks intelligently using two-phase LLM classification
3. **Match** templates dynamically with 70% confidence threshold
4. **Extract** properties with intelligent type inference
5. **Handle errors** gracefully with categorization and remediation
6. **Optimize performance** through batching, caching, and concurrency
7. **Provide visibility** via comprehensive admin dashboard

The system balances accuracy (LLM-powered analysis) with efficiency (batch operations) to migrate large datasets while maintaining data integrity and providing clear progress visibility.
