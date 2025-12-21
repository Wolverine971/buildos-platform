<!-- docs/example-projects/ACOTAR_REVIEW.md -->

# ACOTAR Example Project Review

**Project:** A Court of Thorns and Roses (Sarah J. Maas)
**UUID:** `55555555-5555-5555-5555-555555555555`
**Migration File:** `supabase/migrations/20251220_seed_acotar_example_project.sql`
**Status:** ✅ **FIXED** (2024-12-21)

---

## Overview

This migration seeds a comprehensive writing project tracking Sarah J. Maas's ACOTAR fantasy series, covering the timeline from initial writing (2009) through the ongoing expansion of the universe (2025+).

---

## Entity Counts

| Entity Type | Count | Status |
| ----------- | ----- | ------ |
| Project     | 1     | ✓      |
| Goals       | 7     | ✓      |
| Milestones  | ~43   | ✓      |
| Plans       | 6     | ✓      |
| Tasks       | 14    | ✓      |
| Decisions   | 6     | ✓      |
| Risks       | 6     | ✓      |
| Documents   | 8     | ✓      |
| Edges       | ~160+ | ✓      |

---

## Schema Status (VERIFIED ✓)

The following columns already exist in the schema:

| Column       | Table             | Status                                          |
| ------------ | ----------------- | ----------------------------------------------- |
| `is_public`  | `onto_projects`   | Already exists in production                    |
| `project_id` | `onto_edges`      | Added by `20251216_add_project_id_to_edges.sql` |
| `state_key`  | `onto_goals`      | Added by `20251212_simplify_fsm_to_enums.sql`   |
| `state_key`  | `onto_milestones` | Added by `20251212_simplify_fsm_to_enums.sql`   |

**Migration will run successfully** - no blocking schema issues.

---

## Data Consistency Issues - ✅ ALL FIXED

### 1. Goals Missing `state_key` in INSERT Statements - ✅ FIXED

**Severity:** MEDIUM
**Lines:** 138-180 (updated)
**Status:** ✅ Fixed on 2024-12-21

**What was fixed:**

- Added `state_key` column to goal INSERT column list
- Added appropriate state_key values for each goal:
    - Goals 1-6: `state_key = 'achieved'`
    - Goal 7: `state_key = 'active'`

**Before:**

```sql
INSERT INTO onto_goals (id, project_id, name, type_key, props, created_by) VALUES
```

**After:**

```sql
INSERT INTO onto_goals (id, project_id, name, type_key, state_key, props, created_by) VALUES
```

### 2. Milestones Missing `state_key` in INSERT Statements - ✅ FIXED

**Severity:** MEDIUM
**Lines:** 185-426 (updated)
**Status:** ✅ Fixed on 2024-12-21

**What was fixed:**

- Added `state_key` column to milestone INSERT column list
- Added `state_key = 'completed'` for all 44 milestones
- Correctly used `'completed'` (not `'achieved'`) per milestone enum spec

**Before:**

```sql
INSERT INTO onto_milestones (id, project_id, title, type_key, due_at, props, created_by) VALUES
```

**After:**

```sql
INSERT INTO onto_milestones (id, project_id, title, type_key, state_key, due_at, props, created_by) VALUES
```

---

## Content Fact-Check Items

### Key Dates to Verify:

| Date     | Event                                                    | Verified?                   |
| -------- | -------------------------------------------------------- | --------------------------- |
| 2002     | SJM begins writing Throne of Glass at age 16             |                             |
| Dec 2008 | Signs with agent Tamar Rydzinski                         |                             |
| Aug 2012 | Throne of Glass published                                |                             |
| May 2015 | ACOTAR published                                         |                             |
| May 2016 | ACOMAF published                                         |                             |
| May 2017 | ACOWAR published                                         |                             |
| Dec 2018 | ACOFAS published                                         |                             |
| Feb 2021 | ACOSF published                                          |                             |
| Mar 2021 | Hulu announces ACOTAR TV adaptation with Ronald D. Moore |                             |
| Jan 2024 | House of Flame and Shadow crossover                      |                             |
| Jul 2024 | Ronald D. Moore leaves ACOTAR project                    |                             |
| Mar 2025 | Hulu cancels ACOTAR TV adaptation                        |                             |
| Jul 2025 | ACOTAR Book 6 first draft completed                      | FUTURE - needs verification |

### Sales Figures to Verify:

- [ ] "38+ million copies sold" - Verify current figure
- [ ] "8.5 billion TikTok views" - Verify current figure

---

## Completeness Analysis

### Goals (7):

1. "Complete and Publish Book 1" - achieved
2. "Complete and Publish Book 2" - achieved
3. "Complete and Publish Book 3" - achieved
4. "Expand with Novellas" - achieved
5. "TV Adaptation" - occurred (cancelled)
6. "Complete and Publish Book 5" - achieved
7. "Expand the Universe" - active

### Potentially Missing:

- [ ] Goal for Book 4 (ACOFAS) - seems to be grouped with "Expand with Novellas"
- [ ] Goal for Book 6 (in progress)

### Tasks Coverage:

- Book 1: 3 tasks
- Book 2: 4 tasks
- Book 5: 4 tasks
- Book 6: 3 tasks
- **Missing:** Tasks for Books 3 and 4

### Risks Present:

1. "Publisher Rejection" - mitigated ✓
2. "Creative Burnout" - identified ✓
3. "Series Fatigue" - identified ✓
4. "Adaptation Failure" - occurred ✓
5. "Fan Expectations" - identified ✓
6. "Market Changes" - identified ✓

### Documents Present:

1. Original Manuscript
2. Query Letter
3. Publishing Contract
4. World Bible
5. Series Timeline
6. TV Show Bible
7. Marketing Plan
8. Fan Engagement Guide

---

## Graph Integrity

### Edge Relationships to Verify:

- [ ] All goals connected to project
- [ ] All milestones connected to appropriate goals
- [ ] All plans connected to milestones
- [ ] All tasks connected to plans or milestones
- [ ] All decisions connected to milestones
- [ ] All risks connected to milestones
- [ ] All documents connected to milestones

### Potential Missing Edges:

- [ ] Verify bidirectional edges exist where expected
- [ ] Check for orphaned entities

---

## Type Key Taxonomy

### Used Type Keys:

| Entity     | Type Key                                                | Valid? |
| ---------- | ------------------------------------------------------- | ------ |
| Project    | `project.creative.writing`                              | ✓      |
| Goals      | `goal.strategic.*`                                      | ✓      |
| Milestones | `milestone.publication.*`, `milestone.creative.*`, etc. | ✓      |
| Plans      | `plan.creative.*`, `plan.business.*`                    | ✓      |
| Tasks      | `task.creative.*`, `task.business.*`, etc.              | ✓      |

---

## Recommended Fixes

### Priority 1 (Data Integrity) - ✅ COMPLETE:

1. ~~Add `state_key` to all goal INSERT statements~~ ✅ Done
2. ~~Add `state_key` to all milestone INSERT statements~~ ✅ Done

### Priority 2 (Completeness):

3. Add tasks for Books 3 and 4
4. Verify all dates are accurate
5. Update sales figures to current numbers

### Priority 3 (Nice to Have):

6. Add more detailed documents (chapter outlines, etc.)
7. Add sub-milestones for writing process stages
