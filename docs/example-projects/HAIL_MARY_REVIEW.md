<!-- docs/example-projects/HAIL_MARY_REVIEW.md -->

# Project Hail Mary Example Project Review

**Project:** Project Hail Mary: Save Two Worlds
**UUID:** `33333333-3333-3333-3333-333333333333`
**Migration File:** `supabase/migrations/20251220_seed_hail_mary_example_project.sql`

## ✅ FIXED & ENHANCED (2024-12-21) - v4.0

### Data Consistency Fixes:

1. **Goals**: Added `state_key = 'achieved'` to all 6 goal INSERT statements
2. **Milestones**: Added `state_key = 'completed'` to all milestone INSERT statements
3. **Date Consistency**: Fixed chronological timeline:
    - Discovery/Launch phase: 2024
    - Tau Ceti arrival and events: 2028-2029 (after 4-year journey)
    - Journey to Erid: ~2033 (another ~4 years)
    - Epilogue (16 years later): 2045

### Comprehensive Content Enhancements:

**New Character Profile Documents (+9):**

- Commander Yáo Li-Jie (mission commander, chose firearm for death)
- Engineer Olesya Ilyukhina (chose heroin, brutally honest personality)
- Dr. Martin DuBois & Annie Shapiro Memorial (killed in explosion)
- Steve Hatch (beetle probe designer, named them after Beatles)
- Dimitri Komorov (discovered Astrophage as fuel)
- Dr. Lokken (centrifuge design)
- Dr. Lamai (coma technology developer)
- Dr. Redell (mass production, recruited from prison)
- Eva Stratt Authority and Ethics Report

**New Technical Documents (+4):**

- Coma Pod Technical Specifications
- Threeworld Planetary Analysis
- Eridian Numbering System Analysis (base-6)
- Grace Memory Recovery Log
- Rocky Trust Ritual Documentation

**New Pre-Launch Milestones (+5):**

- Grace Recruited by Stratt
- DuBois and Shapiro Killed in Explosion
- Grace Refuses Mission
- Crew Suicide Methods Selected
- Grace Drugged and Loaded onto Hail Mary

**New Decisions (+4):**

- Grace Initial Refusal of Mission
- Stratt Orders Grace Drugged and Loaded
- Implement Crew Suicide Protocol
- Recruit Redell Despite Criminal Past

**New Risks (+3):**

- Astrophage Testing Explosion
- Science Specialist Refuses Mission
- Coerced Crew Member Sabotage

**New Causal Edges (+25):**

- Complete pre-launch storyline connected
- Memory recovery narrative connected
- All new documents/decisions/risks linked to milestones

---

## Overview

Based on Andy Weir's 2021 hard science fiction novel. This migration seeds a fictional project tracking humanity's desperate mission to save Earth from the sun-consuming Astrophage and the unexpected alliance with an alien civilization.

---

## Entity Counts (v4.0)

| Entity Type | Count | Status                                  |
| ----------- | ----- | --------------------------------------- |
| Project     | 1     | ✓                                       |
| Goals       | 6     | ✓                                       |
| Milestones  | 37    | ✓ (+5 pre-launch)                       |
| Plans       | 15    | ✓                                       |
| Tasks       | 40    | ✓                                       |
| Decisions   | 15    | ✓ (+4 new)                              |
| Risks       | 17    | ✓ (+3 new)                              |
| Documents   | 28    | ✓ (+13 character profiles & tech specs) |
| Edges       | 170+  | ✓ (+25 new causal/hierarchical)         |

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

**Severity:** MEDIUM

All 6 goals have `props.state = 'achieved'` but no `state_key` column in INSERT.

**Result:**

- Database column: `state_key = 'draft'` (default)
- JSON props: `props.state = 'achieved'`

**Fix:** Add `state_key = 'achieved'` to goal INSERT statements.

### 2. Milestones Missing `state_key` in INSERT Statements

**Severity:** MEDIUM

All milestones have `props.state` but no `state_key` column in INSERT.

**Result:**

- Database column: `state_key = 'pending'` (default)
- JSON props: `props.state = 'achieved'`

**Fix:** Add `state_key = 'completed'` to milestone INSERT statements (note: use `'completed'` not `'achieved'` for milestones).

### 3. Date Inconsistency in Milestones

**Severity:** MEDIUM
**Lines:** 195-196

First Contact milestone dated `2024-01-05` but should likely be in 2028+ (after 4-year journey that started in 2024):

```sql
'Detection of Alien Spacecraft', ... '2024-01-05'::timestamptz
```

Similar issues may exist with other Tau Ceti milestones - need to verify timeline consistency.

---

## Content Fact-Check Items

### Scientific Accuracy (from novel):

| Fact                      | Claimed Value      | Book Accurate? |
| ------------------------- | ------------------ | -------------- |
| Tau Ceti distance         | 12 light-years     |                |
| 40 Eridani distance       | 16.3 light-years   |                |
| Astrophage energy density | 10^15 J/kg         |                |
| Storage temperature       | 2 Kelvin           |                |
| Spacecraft acceleration   | 1.5g               |                |
| Journey time              | 4 years subjective |                |
| Eridian atmosphere        | 29 atm ammonia     |                |
| Rocky's mass              | ~400 kg            |                |

### Timeline to Verify:

The novel uses fictional dates, but internal consistency matters:

| Phase               | Expected Duration          | Verify Consistency |
| ------------------- | -------------------------- | ------------------ |
| Discovery to Launch | ~1 year                    |                    |
| Journey to Tau Ceti | ~4 years                   |                    |
| Mission at Tau Ceti | Months to 1 year           |                    |
| Return journey      | Variable (depends on fuel) |                    |

### Key Plot Points to Verify:

- [ ] Petrova Line discovery method
- [ ] Crew selection process
- [ ] Coma protocol details
- [ ] Rocky communication method (musical tones)
- [ ] Taumoeba nitrogen problem
- [ ] Beetle probe design

---

## Completeness Analysis

### Goals (6):

1. "Understand the Petrova Problem" - achieved ✓
2. "Build and Launch Hail Mary" - achieved ✓
3. "Reach Tau Ceti and Investigate" - achieved ✓
4. "Find a Solution to Save Earth" - achieved ✓
5. "Develop Nitrogen-Resistant Taumoeba" - achieved ✓
6. "Save Earth and Erid" - achieved ✓

### Milestone Categories:

- Goal 1 (Understanding Threat): 5 milestones
- Goal 2 (Build Mission): 5 milestones
- Goal 3 (Reach Tau Ceti): 5+ milestones
- Goal 4 (Find Solution): 5+ milestones
- Goal 5 (Nitrogen Problem): 5+ milestones
- Goal 6 (Save Both Worlds): 5+ milestones

### Novel-Specific Elements:

- [ ] Memory recovery flashbacks
- [ ] Rocky relationship development
- [ ] Eridian ship mechanics
- [ ] Xenonite material properties
- [ ] Grace's sacrifice decision

### Potentially Missing:

- [ ] Adrian (Tau Ceti e) exploration milestones
- [ ] Beetle probe deployment details
- [ ] Earth-side preparations/alternatives
- [ ] Epilogue milestones (16 years later)

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

### Special Considerations:

- Fiction project - no real-world verification needed
- Should be internally consistent with novel
- First contact thread is unique narrative element

---

## Type Key Taxonomy

### Used Type Keys:

| Entity     | Type Key Examples                                                                                                                                                            |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project    | `project.fiction.scifi`                                                                                                                                                      |
| Goals      | `goal.strategic.research`, `goal.strategic.engineering`, `goal.strategic.exploration`, `goal.strategic.primary`, `goal.strategic.cooperation`                                |
| Milestones | `milestone.discovery.*`, `milestone.crisis.*`, `milestone.organization.*`, `milestone.engineering.*`, `milestone.mission.*`, `milestone.personal.*`, `milestone.diplomacy.*` |
| Plans      | `plan.research.*`, `plan.engineering.*`, `plan.mission.*`, `plan.emergency.*`                                                                                                |
| Tasks      | `task.research.*`, `task.engineering.*`, `task.mission.*`                                                                                                                    |

---

## Recommended Fixes

### Priority 1 (Data Integrity): ✅ COMPLETED

1. ~~Add `state_key = 'achieved'` to all goal INSERT statements~~ ✅
2. ~~Add `state_key = 'completed'` to all milestone INSERT statements~~ ✅
3. ~~Fix date inconsistencies in Tau Ceti arrival milestones~~ ✅

### Priority 2 (Completeness):

4. Add epilogue milestones (Grace on Erid)
5. Add more Rocky relationship milestones
6. Verify scientific values against novel

### Priority 3 (Enhancements):

7. Add Earth-side parallel storyline
8. Add alternative solutions that were rejected
9. Add more technical document content
