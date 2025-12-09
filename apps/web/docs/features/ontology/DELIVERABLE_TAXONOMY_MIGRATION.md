<!-- apps/web/docs/features/ontology/DELIVERABLE_TAXONOMY_MIGRATION.md -->

# Deliverable Taxonomy Migration

**Date:** 2025-12-08
**Status:** In Progress
**Migration File:** `supabase/migrations/20251208_deliverable_taxonomy_migration.sql`

## Overview

This document captures the architectural shift from task-centric to **deliverables-centric** project organization in BuildOS. The core insight is that outputs/deliverables should be the central organizing principle for projects, not tasks.

## Background & Motivation

### The Problem

The original BuildOS model treated tasks as the primary unit of work. However, this doesn't match how knowledge workers actually think about projects:

- People think in terms of **what they're creating** (a book, a course, a report)
- Tasks are just the means to produce deliverables
- The old model made it hard to track the lifecycle of actual outputs

### The Solution: Deliverables as Central Organizing Principle

Flip the model so that:

1. **Deliverables** are the central entities in projects
2. **Tasks** are grouped under deliverables (what work produces this output?)
3. **Documents/Events** can be "promoted" to formal deliverables
4. **Collections** group related deliverables (book → chapters)

## Design Decisions

### 1. Taxonomy Structure

**New Pattern:** `deliverable.{primitive}.{variant}`

Four primitives:

- `deliverable.document.*` - Text-based outputs (articles, chapters, reports)
- `deliverable.event.*` - Time-bound outputs (workshops, webinars, keynotes)
- `deliverable.collection.*` - Multi-document containers (books, courses, email sequences)
- `deliverable.external.*` - External artifacts (Figma files, GitHub PRs, dashboards)

**Legacy Pattern:** `output.*` (being migrated)

### 2. Collection Data Model: Option A (Edges)

Collections use the existing `onto_edges` table for parent-child relationships:

```
onto_edges:
  source_id: collection deliverable ID
  target_id: child deliverable ID
  edge_type: 'collection_item'
  metadata: { order: 1, ... }
```

**Why edges over a dedicated table:**

- Consistent with existing graph model
- Leverages existing edge infrastructure
- Flexible for different collection types
- No schema changes needed for relationships

### 3. Table Naming: Keep `onto_outputs`

Decision: Keep the table name `onto_outputs` rather than renaming to `onto_deliverables`.

**Rationale:**

- Avoids breaking changes to existing queries
- `type_key` prefix change (`deliverable.*`) is sufficient
- Less migration complexity

### 4. Events as Deliverables

Event deliverables live in `onto_outputs` table (not `onto_events`).

**Rationale:**

- Consistency - all deliverables in one table
- `onto_events` remains for calendar/scheduling events
- Event deliverables can link to source events via `source_event_id`

### 5. No Primitive Column

Decision: Don't add a `primitive` column to `onto_outputs`.

**Rationale:**

- Primitive is derivable from `type_key` (second segment)
- Added helper function `get_deliverable_primitive()` for queries
- TypeScript helper `getDeliverablePrimitive()` for frontend

### 6. Promotion Flow

Documents and events can be "promoted" to formal deliverables:

```
Working Document → Promote → Deliverable (with source_document_id link)
Calendar Event → Promote → Event Deliverable (with source_event_id link)
```

New columns added to `onto_outputs`:

- `source_document_id` - Links to promoted document
- `source_event_id` - Links to promoted event

## Migration Details

### What the Migration Does

1. **Fixes scope constraint** - Adds 'event' to valid template scopes
2. **Adds promotion columns** - `source_document_id`, `source_event_id`
3. **Cleans up duplicates** - Handles `output.written.*` → `output.*` consolidation
4. **Migrates templates** - `output.*` → `deliverable.*` type_keys
5. **Migrates production data** - Updates `onto_outputs` rows
6. **Adds new templates** - Collection, external, and event templates
7. **Creates helper function** - `get_deliverable_primitive()`

### Template Mappings

| Old Type Key              | New Type Key                            | Primitive  |
| ------------------------- | --------------------------------------- | ---------- |
| `output.base`             | `deliverable.base`                      | -          |
| `output.document`         | `deliverable.document.base`             | document   |
| `output.chapter`          | `deliverable.document.chapter`          | document   |
| `output.article`          | `deliverable.document.article`          | document   |
| `output.blog_post`        | `deliverable.document.blog_post`        | document   |
| `output.book`             | `deliverable.collection.book`           | collection |
| `output.software.feature` | `deliverable.external.software_feature` | external   |
| `output.media.video`      | `deliverable.external.video`            | external   |

### New Templates Added

**Collections:**

- `deliverable.collection.base` - Abstract base
- `deliverable.collection.book` - Book with chapters
- `deliverable.collection.course` - Online course
- `deliverable.collection.email_sequence` - Email drip campaign

**External:**

- `deliverable.external.base` - Abstract base
- `deliverable.external.design_file` - Figma/Sketch files

**Events:**

- `deliverable.event.base` - Abstract base
- `deliverable.event.workshop` - Interactive workshop
- `deliverable.event.webinar` - Virtual presentation
- `deliverable.event.masterclass` - Expert deep-dive
- `deliverable.event.keynote` - Conference keynote

**Documents (new):**

- `deliverable.document.email` - Email content
- `deliverable.document.lesson` - Course lesson

### Migration Issues & Fixes

#### Issue 1: Duplicate Key Violation

**Error:**

```
duplicate key value violates unique constraint "onto_templates_scope_type_key_key"
Key (scope, type_key)=(output, deliverable.document.base) already exists
```

**Cause:** Multiple old type_keys mapping to same new type_key:

- `output.document` → `deliverable.document.base`
- `output.written.base` → `deliverable.document.base`

**Fix:** Added Part 3 to clean up redundant `output.written.*` templates before migration, with proper `WHERE NOT EXISTS` checks on all updates.

#### Issue 2: Foreign Key Constraint Violation

**Error:**

```
update or delete on table "onto_templates" violates foreign key constraint
"onto_templates_parent_template_id_fkey"
Key (id)=(...) is still referenced from table "onto_templates"
```

**Cause:** `output.written.base` had child templates referencing it via `parent_template_id`.

**Fix:** Updated Part 3 to:

1. Re-parent children to `output.document` before deleting
2. Only delete after all children are re-parented

## TypeScript Types

### New Types Added (`apps/web/src/lib/types/onto.ts`)

```typescript
// Deliverable primitives
export const DELIVERABLE_PRIMITIVES = ['document', 'event', 'collection', 'external'] as const;
export type DeliverablePrimitive = (typeof DELIVERABLE_PRIMITIVES)[number];

// Helper functions
export function getDeliverablePrimitive(typeKey: string): DeliverablePrimitive | null;
export function isCollectionDeliverable(typeKey: string): boolean;
export function isExternalDeliverable(typeKey: string): boolean;
export function isEventDeliverable(typeKey: string): boolean;
export function isDocumentDeliverable(typeKey: string): boolean;

// Enriched output for UI
export interface EnrichedOutput extends Output {
	primitive: DeliverablePrimitive;
	type_label: string;
	task_count?: number;
	child_count?: number;
	source_document?: Document;
	source_event?: OntoEvent;
}
```

### Updated Patterns

```typescript
export const TYPE_KEY_PATTERNS: Record<string, RegExp> = {
	// Output supports both legacy output.* and new deliverable.* patterns
	output: /^(output|deliverable)\.[a-z_]+(\.[a-z_]+)?$/,
	// Deliverable-specific pattern
	deliverable: /^deliverable\.(document|event|collection|external)\.[a-z_]+$/
};
```

### Updated OutputSchema

```typescript
export const OutputSchema = z.object({
	// ... existing fields
	source_document_id: z.string().uuid().nullable().optional(),
	source_event_id: z.string().uuid().nullable().optional()
});
```

## UI Prototype

**Location:** `apps/web/src/routes/projects/projects-v3/[id]/+page.svelte`

### Features

1. **Deliverable Cards** - Outputs shown as primary cards with primitive filter chips
2. **Documents Strip** - Lighter cards directly under outputs with promote CTA
3. **Right Rail** - Collapsible stacks for goals, plans, tasks, risks, milestones
4. **Sticky Header** - Project identity, state/type chips, and quick stats
5. **Create Modal** - Deliverable creation entry point (primitive selection)

### Design Patterns

- Uses Inkprint Design System
- Semantic color tokens (`bg-card`, `text-foreground`, etc.)
- Texture classes (`tx tx-frame tx-weak`)
- Responsive grid layouts
- Svelte 5 runes (`$state`, `$derived`)

## Database Helper Function

```sql
CREATE OR REPLACE FUNCTION get_deliverable_primitive(p_type_key text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  -- Extract primitive from deliverable.{primitive}.* pattern
  IF p_type_key LIKE 'deliverable.%' THEN
    RETURN split_part(p_type_key, '.', 2);
  END IF;

  -- Legacy output.* patterns (fallback)
  IF p_type_key LIKE 'output.written.%' ... THEN
    RETURN 'document';
  END IF;

  RETURN 'document'; -- default
END;
$$;
```

## Next Steps

After migration completes:

1. **Test UI Prototype** - Visit `/projects/projects-v3/{project-id}`
2. **Implement Promotion API** - Endpoints for document/event → deliverable promotion
3. **Wire Up Create Modal** - Connect to template selection and creation API
4. **Add Collection Management** - UI for adding/removing collection items via edges
5. **Update Existing Views** - Integrate deliverables-centric view into main project page

## Files Changed

| File                                                              | Change                |
| ----------------------------------------------------------------- | --------------------- |
| `supabase/migrations/20251208_deliverable_taxonomy_migration.sql` | Full migration script |
| `apps/web/src/lib/types/onto.ts`                                  | New types and helpers |
| `apps/web/src/routes/projects/projects-v3/[id]/+page.svelte`      | UI prototype          |
| `apps/web/src/routes/projects/projects-v3/[id]/+page.server.ts`   | Server load function  |

## Related Documentation

- [Ontology System Overview](./README.md)
- [Data Models](./DATA_MODELS.md)
- [Inkprint Design System](../../technical/components/INKPRINT_DESIGN_SYSTEM.md)
