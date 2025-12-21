<!-- docs/example-projects/MIGRATION_REVIEW_MASTER.md -->

# Example Project Migration Review - Master Document

**Review Date:** 2025-12-21 (Updated)
**Reviewed By:** Claude (Automated Analysis)
**Migration Files Location:** `supabase/migrations/20251220_seed_*.sql`
**Reference Guide:** `docs/research/EXAMPLE_PROJECT_CREATION_GUIDE.md`

---

## Executive Summary

Six example project migrations were reviewed for data model integrity, schema compliance, and completeness. **The migrations will run successfully** - the required schema columns already exist. However, there are **data consistency issues** that should be addressed.

### Projects Reviewed:

| Project                        | UUID                                   | Status            |
| ------------------------------ | -------------------------------------- | ----------------- |
| ACOTAR (Sarah J. Maas)         | `55555555-5555-5555-5555-555555555555` | Data fixes needed |
| Apollo Program                 | `22222222-2222-2222-2222-222222222222` | Data fixes needed |
| Manhattan Project              | `66666666-6666-6666-6666-666666666666` | Data fixes needed |
| GRRM Writing (Game of Thrones) | `44444444-4444-4444-4444-444444444444` | Data fixes needed |
| Project Hail Mary              | `33333333-3333-3333-3333-333333333333` | Data fixes needed |
| Washington Revolutionary War   | `11111111-1111-1111-1111-111111111111` | Data fixes needed |

---

## Schema Status (VERIFIED ✓)

### Columns Already Exist:

| Column       | Table             | Added By                               |
| ------------ | ----------------- | -------------------------------------- |
| `is_public`  | `onto_projects`   | Already exists in production           |
| `project_id` | `onto_edges`      | `20251216_add_project_id_to_edges.sql` |
| `state_key`  | `onto_goals`      | `20251212_simplify_fsm_to_enums.sql`   |
| `state_key`  | `onto_milestones` | `20251212_simplify_fsm_to_enums.sql`   |

**The Washington migration's column checks are redundant but harmless** - they use `IF NOT EXISTS` so won't cause errors.

---

## DATA CONSISTENCY ISSUES

### 1. Goals Missing `state_key` in INSERT Statements

**Severity:** MEDIUM - Data inconsistency
**Affected Files:** ALL

**Problem:**
All goal INSERT statements use this pattern:

```sql
INSERT INTO onto_goals (id, project_id, name, type_key, props, created_by) VALUES ...
```

The `state_key` column is NOT included, so all goals default to `'draft'`.

Meanwhile, `props.state` contains values like `'achieved'`, `'active'`, etc.

**Result:**

- Database column: `state_key = 'draft'`
- JSON props: `props.state = 'achieved'`

**Per Creation Guide (line 293):** Goals SHOULD include `state_key` in INSERT.

**Fix:** Add `state_key` column to goal INSERT statements with correct enum values:

- `'achieved'` for completed goals
- `'active'` for in-progress goals
- `'draft'` for not-yet-started goals

---

### 2. Milestones Missing `state_key` in INSERT Statements

**Severity:** MEDIUM - Data inconsistency
**Affected Files:** ALL

**Problem:**
All milestone INSERT statements use this pattern:

```sql
INSERT INTO onto_milestones (id, project_id, title, type_key, due_at, props, created_by) VALUES ...
```

The `state_key` column is NOT included, so all milestones default to `'pending'`.

Meanwhile, `props.state` contains `'achieved'` for completed milestones.

**Result:**

- Database column: `state_key = 'pending'`
- JSON props: `props.state = 'achieved'`

**Critical:** The value `'achieved'` is NOT a valid `milestone_state` enum.

Per the Creation Guide (line 483):

> ❌ `'achieved'` for milestones → use `'completed'` (put "achieved" in props if needed)

Valid `milestone_state` values: `'pending'`, `'in_progress'`, `'completed'`, `'missed'`

**Fix Options:**

1. Add `state_key = 'completed'` to milestone INSERT statements for completed milestones
2. OR leave `state_key` defaulting to `'pending'` and rely on `props.state` (current approach)
3. OR add a post-migration to sync:

```sql
UPDATE onto_milestones SET state_key = 'completed' WHERE props->>'state' = 'achieved';
```

---

### 3. GRRM Goals Use Non-Standard State Values

**Severity:** LOW - Intentionally humorous
**Affected File:** GRRM Writing

**Problem:**
Some GRRM goals use creative `props.state` values that don't map to standard enums:

- `'not_started'` → should map to `'draft'`
- `'failed_spectacularly'` → should map to `'abandoned'`
- `'philosophical'` → should map to `'draft'` or `'active'`

These are intentionally humorous but don't match the schema.

---

## Enum Validation

### Valid Enum Values (from schema):

| Entity    | Column      | Valid Values                                            |
| --------- | ----------- | ------------------------------------------------------- |
| Task      | `state_key` | `'todo'`, `'in_progress'`, `'blocked'`, `'done'`        |
| Project   | `state_key` | `'planning'`, `'active'`, `'completed'`, `'cancelled'`  |
| Plan      | `state_key` | `'draft'`, `'active'`, `'completed'`                    |
| Document  | `state_key` | `'draft'`, `'review'`, `'published'`                    |
| Goal      | `state_key` | `'draft'`, `'active'`, `'achieved'`, `'abandoned'`      |
| Milestone | `state_key` | `'pending'`, `'in_progress'`, `'completed'`, `'missed'` |
| Risk      | `state_key` | `'identified'`, `'mitigated'`, `'occurred'`, `'closed'` |

### Validation Results:

| Project    | Tasks                                    | Plans                       | Documents                  | Risks                                         |
| ---------- | ---------------------------------------- | --------------------------- | -------------------------- | --------------------------------------------- |
| ACOTAR     | `'done'`, `'todo'` ✓                     | `'completed'`, `'active'` ✓ | `'published'` ✓            | `'mitigated'`, `'occurred'`, `'identified'` ✓ |
| Apollo     | `'done'` ✓                               | `'completed'` ✓             | `'published'` ✓            | `'mitigated'`, `'identified'` ✓               |
| Manhattan  | `'done'` ✓                               | `'completed'`, `'active'` ✓ | `'published'` ✓            | `'identified'`, `'occurred'`, `'mitigated'` ✓ |
| GRRM       | `'done'`, `'in_progress'`, `'blocked'` ✓ | `'completed'`, `'active'` ✓ | `'published'`, `'draft'` ✓ | `'identified'`, `'occurred'` ✓                |
| Hail Mary  | `'done'` ✓                               | `'completed'` ✓             | `'published'` ✓            | `'mitigated'`, `'identified'` ✓               |
| Washington | `'done'` ✓                               | `'completed'` ✓             | `'published'` ✓            | `'mitigated'`, `'occurred'`, `'identified'` ✓ |

**All enum values used in Tasks, Plans, Documents, and Risks are VALID ✓**

---

## Individual Project Reviews

See individual documentation files:

- [ACOTAR Review](./ACOTAR_REVIEW.md)
- [Apollo Review](./APOLLO_REVIEW.md)
- [Manhattan Review](./MANHATTAN_REVIEW.md)
- [GRRM Review](./GRRM_REVIEW.md)
- [Hail Mary Review](./HAIL_MARY_REVIEW.md)
- [Washington Review](./WASHINGTON_REVIEW.md)

---

## Recommended Actions

### High Priority (Data Consistency):

1. [ ] Add `state_key` column to goal INSERT statements (map `props.state` values to valid enums)
2. [ ] Add `state_key` column to milestone INSERT statements (use `'completed'` not `'achieved'`)
3. [ ] Verify edge relationships are complete and bidirectional

### Medium Priority (Fact-Checking):

4. [ ] Fact-check historical dates in Apollo, Manhattan, Washington
5. [ ] Verify publication dates in ACOTAR and GRRM
6. [ ] Check scientific accuracy in Hail Mary (vs. novel)

### Low Priority (Completeness):

7. [ ] Ensure consistent `type_key` taxonomy across projects
8. [ ] Add missing entity types (documents, decisions) where sparse
9. [ ] Add more detailed documents (chapter outlines, reports, etc.)

---

## Post-Migration Fix Script

If desired, run this after migrations to sync `state_key` from `props.state`:

```sql
-- Sync goal state_key from props.state
UPDATE onto_goals
SET state_key = CASE
  WHEN props->>'state' = 'achieved' THEN 'achieved'::text
  WHEN props->>'state' = 'active' THEN 'active'::text
  WHEN props->>'state' = 'abandoned' THEN 'abandoned'::text
  ELSE 'draft'::text
END
WHERE props->>'state' IS NOT NULL;

-- Sync milestone state_key from props.state
UPDATE onto_milestones
SET state_key = CASE
  WHEN props->>'state' IN ('achieved', 'completed') THEN 'completed'::text
  WHEN props->>'state' = 'in_progress' THEN 'in_progress'::text
  WHEN props->>'state' = 'missed' THEN 'missed'::text
  ELSE 'pending'::text
END
WHERE props->>'state' IS NOT NULL;
```

---

## Migration Order Reference

Relevant migrations run in this order:

```
20251212_simplify_fsm_to_enums.sql           ← Adds state_key to goals/milestones
20251216_add_project_id_to_edges.sql          ← Adds project_id to edges
20251220_cleanup_washington_example_project.sql
20251220_onto_plans_goals_milestones_risks_schema.sql
20251220_onto_projects_documents_schema.sql
20251220_onto_tasks_schema_enhancement.sql
20251220_ontology_rls_policies.sql
20251220_seed_acotar_example_project.sql
20251220_seed_apollo_program_example_project.sql
20251220_seed_grrm_writing_example_project.sql
20251220_seed_hail_mary_example_project.sql
20251220_seed_manhattan_project_example_project.sql
20251220_seed_washington_example_project.sql   ← Redundant column checks (harmless)
```
