<!-- docs/example-projects/MANHATTAN_REVIEW.md -->

# Manhattan Project Example Project Review

**Project:** The Manhattan Project: Building the Atomic Bomb
**UUID:** `66666666-6666-6666-6666-666666666666`
**Migration File:** `supabase/migrations/20251220_seed_manhattan_project_example_project.sql`

**Status:** ✅ FIXED (2024-12-21)

---

## Overview

This migration seeds a historical project tracking the U.S. government's secret program to develop nuclear weapons during WWII, from the Einstein-Szilard Letter (1939) through the Atomic Energy Act (1946).

---

## Entity Counts

| Entity Type | Count | Status |
| ----------- | ----- | ------ |
| Project     | 1     | ✓      |
| Goals       | 6     | ✓      |
| Milestones  | 40+   | ✓      |
| Plans       | 8+    | ✓      |
| Tasks       | 12+   | ✓      |
| Decisions   | 8+    | ✓      |
| Risks       | 8+    | ✓      |
| Documents   | 8+    | ✓      |
| Edges       | 200+  | ✓      |

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

## Data Consistency Issues

### 1. Goals Missing `state_key` in INSERT Statements

**Severity:** MEDIUM → ✅ **FIXED**

All 6 goals have `props.state = 'achieved'` but no `state_key` column in INSERT.

**Result (before fix):**

- Database column: `state_key = 'draft'` (default)
- JSON props: `props.state = 'achieved'`

**Fix Applied:** Added `state_key = 'achieved'` to all 6 goal INSERT statements.

### 2. Milestones Missing `state_key` in INSERT Statements

**Severity:** MEDIUM → ✅ **FIXED**

All milestones have `props.state = 'achieved'` but no `state_key` column in INSERT.

**Result (before fix):**

- Database column: `state_key = 'pending'` (default)
- JSON props: `props.state = 'achieved'`

**Fix Applied:** Added `state_key = 'completed'` to all 52 milestone INSERT statements across all 6 goals.

---

## Content Fact-Check Items

### Key Statistics to Verify:

| Statistic       | Claimed Value                  | Source Needed |
| --------------- | ------------------------------ | ------------- |
| Total cost      | $1.889 billion (1945)          |               |
| 2024 dollars    | ~$30 billion                   |               |
| Peak employment | 130,000+                       |               |
| Major sites     | Oak Ridge, Hanford, Los Alamos |               |
| Casualties      | ~200,000                       |               |

### Key Dates to Verify:

| Date       | Event                                 | Verified? |
| ---------- | ------------------------------------- | --------- |
| 1939-08-02 | Einstein-Szilard Letter               |           |
| 1939-10-11 | FDR briefed by Sachs                  |           |
| 1939-10-21 | Advisory Committee on Uranium         |           |
| 1940-12-14 | Plutonium discovered at Berkeley      |           |
| 1941-03-28 | Pu-239 proven fissile                 |           |
| 1941-05-17 | NAS Report confirms feasibility       |           |
| 1941-06-28 | OSRD created                          |           |
| 1941-12-06 | FDR authorizes full-scale development |           |
| 1942-09-17 | Gen. Groves takes command             |           |
| 1942-12-02 | Chicago Pile-1 (first reactor)        |           |
| 1944-11-15 | Alsos Mission                         |           |
| 1945-05-08 | V-E Day                               |           |
| 1945-07-16 | Trinity Test                          |           |
| 1945-08-06 | Hiroshima                             |           |
| 1945-08-09 | Nagasaki                              |           |
| 1945-08-15 | Japan surrenders                      |           |
| 1946-08-01 | Atomic Energy Act                     |           |

### Personnel to Verify:

**Military:**

- [ ] Gen. Leslie Groves (commander)
- [ ] Col. Kenneth Nichols
- [ ] Gen. Thomas Farrell

**Scientific:**

- [ ] J. Robert Oppenheimer
- [ ] Enrico Fermi
- [ ] Leo Szilard
- [ ] Glenn Seaborg
- [ ] Hans Bethe

**Political:**

- [ ] FDR
- [ ] Truman
- [ ] Vannevar Bush
- [ ] Henry Stimson

---

## Completeness Analysis

### Goals (6):

1. "Develop Atomic Weapons Before Nazi Germany" - achieved ✓
2. "Produce Sufficient Fissile Material at Industrial Scale" - achieved ✓
3. "Design and Build Deliverable Nuclear Weapons" - achieved ✓
4. "Maintain Absolute Secrecy" - achieved ✓
5. "End the War with Japan" - achieved ✓
6. "Establish Post-War Nuclear Capability" - achieved ✓

### Milestone Categories (from file header):

- Goal 1: Beat Germany (8 milestones)
- Goal 2: Produce Fissile Material (~10 milestones)
- Goal 3: Design Weapons (~10 milestones)
- Goal 4: Maintain Secrecy (~5 milestones)
- Goal 5: End War (~5 milestones)
- Goal 6: Post-War (~4 milestones)

### Potentially Missing:

- [ ] Soviet espionage milestones (Klaus Fuchs, etc.)
- [ ] British collaboration (Tube Alloys)
- [ ] Canadian contribution

### Sensitive Content Notes:

- Appropriate historical framing of civilian casualties
- Includes ethical considerations through decisions/risks

---

## Graph Integrity

### Edge Structure:

- [x] Project → Goals
- [x] Goals → Milestones
- [x] Milestones → Plans
- [x] Plans → Tasks
- [x] Milestones → Decisions
- [x] Milestones → Risks
- [x] Milestones → Documents

### Potential Issues:

- [ ] Verify espionage/security milestones connect to Goal 4
- [ ] Check scientific milestones distribute properly across Goals 2 and 3

---

## Type Key Taxonomy

### Used Type Keys:

| Entity     | Type Key Examples                                                                                                                                                       |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project    | `project.government.military`                                                                                                                                           |
| Goals      | `goal.strategic`, `goal.operational`, `goal.technical`, `goal.security`, `goal.institutional`                                                                           |
| Milestones | `milestone.initiation`, `milestone.decision`, `milestone.organizational`, `milestone.scientific`, `milestone.technical`, `milestone.intelligence`, `milestone.external` |
| Plans      | `plan.organizational`, `plan.engineering`, `plan.production`, `plan.security`                                                                                           |
| Tasks      | `task.research`, `task.engineering`, `task.production`, `task.security`                                                                                                 |

---

## Recommended Fixes

### Priority 1 (Data Integrity): ✅ COMPLETED

1. ~~Add `state_key = 'achieved'` to all goal INSERT statements~~ ✅ Done
2. ~~Add `state_key = 'completed'` to all milestone INSERT statements~~ ✅ Done

### Priority 2 (Completeness):

3. Verify all dates against historical records
4. Add Soviet espionage thread (if appropriate)
5. Add British/Canadian collaboration milestones

### Priority 3 (Enhancements):

6. Add key document texts (Einstein letter, etc.)
7. Add more granular site milestones
8. Add ethical decision documentation
