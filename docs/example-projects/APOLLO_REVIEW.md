<!-- docs/example-projects/APOLLO_REVIEW.md -->

# Apollo Program Example Project Review

**Project:** Project Apollo: Race to the Moon
**UUID:** `22222222-2222-2222-2222-222222222222`
**Migration File:** `supabase/migrations/20251220_seed_apollo_program_example_project.sql`
**Status:** ✅ FIXED (2024-12-21)

---

## Overview

This is the most comprehensive example project, covering NASA's Apollo Program from Mercury (1958) through Apollo 17 (1972). It demonstrates deeply nested graph structures with extensive historical detail.

---

## Entity Counts

| Entity Type | Count | Status |
| ----------- | ----- | ------ |
| Project     | 1     | ✓      |
| Goals       | 6     | ✓      |
| Milestones  | 50+   | ✓      |
| Plans       | 10+   | ✓      |
| Tasks       | 15+   | ✓      |
| Decisions   | 10+   | ✓      |
| Risks       | 10+   | ✓      |
| Documents   | 10+   | ✓      |
| Edges       | 300+  | ✓      |

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

### 1. Goals Missing `state_key` in INSERT Statements ✅ FIXED

**Severity:** MEDIUM
**Lines:** 95-131

All 6 goals have `props.state = 'achieved'` but no `state_key` column in INSERT.

**Result:**

- Database column: `state_key = 'draft'` (default)
- JSON props: `props.state = 'achieved'`

**Fix:** ✅ Added `state_key = 'achieved'` to goal INSERT statements.

### 2. Milestones Missing `state_key` in INSERT Statements ✅ FIXED

**Severity:** MEDIUM

All milestones have `props.state = 'achieved'` but no `state_key` column in INSERT.

**Result:**

- Database column: `state_key = 'pending'` (default)
- JSON props: `props.state = 'achieved'`

**Fix:** ✅ Added `state_key = 'completed'` to milestone INSERT statements (note: use `'completed'` not `'achieved'` for milestones).

---

## Content Fact-Check Items

### Key Statistics to Verify:

| Statistic          | Claimed Value         | Source Needed |
| ------------------ | --------------------- | ------------- |
| Total investment   | $25.4 billion nominal |               |
| 2020 dollars       | $257 billion          |               |
| 2024 dollars       | $187 billion          |               |
| Peak employment    | 400,000+              |               |
| Astronauts on Moon | 12                    |               |
| Lunar samples      | 842 lbs (382 kg)      |               |
| Sample count       | 2,196                 |               |
| Landing sites      | 6                     |               |

### Key Dates to Verify:

| Date       | Event                             | Verified? |
| ---------- | --------------------------------- | --------- |
| 1958-10-01 | NASA Established                  |           |
| 1959-04-09 | Mercury Seven Selected            |           |
| 1961-05-05 | First American in Space (Shepard) |           |
| 1961-05-25 | Kennedy's Moon Challenge          |           |
| 1962-02-20 | First American in Orbit (Glenn)   |           |
| 1963-05-16 | Mercury Program Completed         |           |
| 1965-03-23 | First Gemini Crewed Flight        |           |
| 1965-06-03 | First American Spacewalk          |           |
| 1966-03-16 | First Space Docking               |           |
| 1966-11-15 | Gemini Program Completed          |           |
| 1967-01-27 | Apollo 1 Fire                     |           |
| 1968-10-11 | Apollo 7                          |           |
| 1968-12-21 | Apollo 8                          |           |
| 1969-03-03 | Apollo 9                          |           |
| 1969-05-18 | Apollo 10                         |           |
| 1969-07-20 | Apollo 11 Landing                 |           |
| 1969-11-19 | Apollo 12                         |           |
| 1970-04-13 | Apollo 13 Explosion               |           |
| 1971-02-05 | Apollo 14                         |           |
| 1971-07-30 | Apollo 15                         |           |
| 1972-04-21 | Apollo 16                         |           |
| 1972-12-11 | Apollo 17                         |           |

### Personnel to Verify:

**NASA Administrators:**

- [ ] James Webb (1961-68)
- [ ] Thomas Paine (1968-70)
- [ ] James C. Fletcher (1971-1977)

**Flight Directors:**

- [ ] Chris Kraft
- [ ] Gene Kranz
- [ ] Glynn Lunney
- [ ] Clifford Charlesworth

**Engineers:**

- [ ] Wernher von Braun
- [ ] Max Faget
- [ ] John Houbolt
- [ ] George Low
- [ ] Joseph Shea

---

## Completeness Analysis

### Goals (6):

1. "Prove Human Spaceflight is Possible" (Mercury) - achieved ✓
2. "Master Orbital Operations" (Gemini) - achieved ✓
3. "Land Humans on the Moon" (Apollo) - achieved ✓
4. "Return Astronauts Safely to Earth" - achieved ✓
5. "Conduct Lunar Science" - achieved ✓
6. "Win the Space Race" - achieved ✓

### Milestone Categories:

- Mercury Program: 6 milestones
- Gemini Program: 6 milestones
- Apollo Lunar Landings: 12 milestones
- Safe Return: 2 milestones
- Science: 2 milestones
- Space Race Competition: 10 milestones
- Infrastructure: 4 milestones
- Robotic Precursors: 3 milestones
- Training & Testing: 5 milestones

### Potentially Missing:

- [ ] Apollo 18, 19, 20 cancellation milestones
- [ ] Budget milestones (annual appropriations)
- [ ] Individual contractor milestones

### Documents to Add:

- [ ] Kennedy's Rice University Speech text
- [ ] Apollo 1 Review Board Report
- [ ] Mission reports for each Apollo flight

---

## Graph Integrity

### Edge Structure Verified:

- [x] Project → Goals (6 edges)
- [x] Goals → Milestones (nested correctly)
- [x] Milestones → Plans
- [x] Plans → Tasks
- [x] Milestones → Decisions
- [x] Milestones → Risks
- [x] Milestones → Documents

### Potential Issues:

- [ ] Verify all Soviet competition milestones connect to Goal 6
- [ ] Check infrastructure milestones have proper goal connections

---

## Type Key Taxonomy

### Used Type Keys:

| Entity     | Type Key Examples                                                                                                                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project    | `project.government.space`                                                                                                                                                                              |
| Goals      | `goal.strategic.foundation`, `goal.strategic.capability`, `goal.strategic.primary`, `goal.strategic.safety`, `goal.strategic.science`, `goal.strategic.political`                                       |
| Milestones | `milestone.program.*`, `milestone.mission.*`, `milestone.disaster.*`, `milestone.engineering.*`, `milestone.competition.*`, `milestone.infrastructure.*`, `milestone.robotic.*`, `milestone.training.*` |
| Plans      | `plan.engineering.*`, `plan.personnel.*`, `plan.operations.*`, `plan.mission.*`, `plan.safety.*`, `plan.emergency.*`                                                                                    |
| Tasks      | `task.engineering.*`, `task.training.*`, `task.operations.*`, `task.infrastructure.*`, `task.testing.*`                                                                                                 |

---

## Recommended Fixes

### Priority 1 (Data Integrity): ✅ COMPLETED

1. ✅ Added `state_key = 'achieved'` to all goal INSERT statements (6 goals)
2. ✅ Added `state_key = 'completed'` to all milestone INSERT statements (50 milestones)

### Priority 2 (Completeness):

3. Verify all dates against NASA historical records
4. Add Apollo cancellation milestones (18-20)
5. Add key document texts

### Priority 3 (Enhancements):

6. Add more granular contractor milestones
7. Add budget/funding milestones
8. Add post-Apollo legacy milestones (Skylab, Apollo-Soyuz)
