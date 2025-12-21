<!-- docs/example-projects/APOLLO_REVIEW.md -->

# Apollo Program Example Project Review

**Project:** Project Apollo: Race to the Moon
**UUID:** `22222222-2222-2222-2222-222222222222`
**Migration File:** `supabase/migrations/20251220_seed_apollo_program_example_project.sql`
**Status:** ✅ COMPLETE v4.0 (2024-12-21)

---

## Overview

This is the most comprehensive example project, covering NASA's Apollo Program from Mercury (1958) through Apollo-Soyuz (1975). It demonstrates deeply nested graph structures with extensive historical detail, including:

- **Mercury, Gemini, Apollo** core programs
- **Skylab** space station and all 3 crewed missions
- **Apollo-Soyuz Test Project** (first international crewed mission)
- **Cancelled missions** (Apollo 18, 19, 20)
- **Budget history** and program wind-down
- **Diplomacy** (Giant Leap World Tour, Moon Rock gifts)
- **Key personnel** (Margaret Hamilton, Katherine Johnson)

---

## Entity Counts

| Entity Type | Count | Status |
| ----------- | ----- | ------ |
| Project     | 1     | ✓      |
| Goals       | 7     | ✓      |
| Milestones  | 63+   | ✓      |
| Plans       | 11    | ✓      |
| Tasks       | 45+   | ✓      |
| Decisions   | 18    | ✓      |
| Risks       | 19    | ✓      |
| Documents   | 23    | ✓      |
| Edges       | 230+  | ✓      |

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

### Goals (7):

1. "Prove Human Spaceflight is Possible" (Mercury) - achieved ✓
2. "Master Orbital Operations" (Gemini) - achieved ✓
3. "Land Humans on the Moon" (Apollo) - achieved ✓
4. "Return Astronauts Safely to Earth" - achieved ✓
5. "Conduct Lunar Science" - achieved ✓
6. "Win the Space Race" - achieved ✓
7. "Establish Apollo Legacy" (Skylab + ASTP) - achieved ✓ **NEW**

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
- **Cancelled Missions: 2 milestones (Apollo 18/19/20)** **NEW**
- **Skylab Program: 5 milestones (Launch + 3 crews + ASTP)** **NEW**
- **Budget History: 2 milestones (Peak + Decline)** **NEW**
- **Diplomacy: 2 milestones (World Tour + Moon Rocks)** **NEW**
- **Key Personnel: 2 milestones (Hamilton + Johnson)** **NEW**

### Previously Missing (Now Added ✅):

- [x] Apollo 18, 19, 20 cancellation milestones ✅
- [x] Budget milestones (Peak FY1966, Decline) ✅
- [x] Skylab & Apollo-Soyuz legacy milestones ✅
- [x] Diplomacy milestones (World Tour, Moon Rocks) ✅
- [x] Key personnel (Hamilton, Johnson) ✅

### Documents to Add (Future Enhancement):

- [ ] Kennedy's Rice University Speech text
- [ ] Apollo 1 Review Board Report
- [ ] Mission reports for each Apollo flight

---

## Graph Integrity

### Edge Structure Verified:

- [x] Project → Goals (7 edges)
- [x] Goals → Milestones (nested correctly)
- [x] Milestones → Plans
- [x] Plans → Tasks
- [x] Milestones → Decisions
- [x] Milestones → Risks
- [x] Milestones → Documents
- [x] Causal relationships (`enabled`, `led_to`) between milestones

### New Edges Added (v4.0):

- [x] Goal 3 → Cancelled mission milestones (0014-*)
- [x] Goal 7 → Skylab & ASTP milestones (0015-*)
- [x] Goal 7 → Budget milestones (0016-*)
- [x] Goal 6 → Diplomacy milestones (0017-*)
- [x] Goal 3 → Personnel milestones (0018-*)
- [x] Cancellation → Skylab causal link
- [x] Budget decline → Cancellation causal link
- [x] Apollo 11 → World Tour → Moon Rocks causal chain
- [x] Software → Apollo 11 enabling link (Hamilton)
- [x] Human computers → Glenn orbit enabling link (Johnson)

---

## Type Key Taxonomy

### Used Type Keys:

| Entity     | Type Key Examples                                                                                                                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project    | `project.government.space`                                                                                                                                                                              |
| Goals      | `goal.strategic.foundation`, `goal.strategic.capability`, `goal.strategic.primary`, `goal.strategic.safety`, `goal.strategic.science`, `goal.strategic.political`, `goal.strategic.legacy`              |
| Milestones | `milestone.program.*`, `milestone.mission.*`, `milestone.disaster.*`, `milestone.engineering.*`, `milestone.competition.*`, `milestone.infrastructure.*`, `milestone.robotic.*`, `milestone.training.*`, `milestone.budget.*`, `milestone.diplomacy.*` |
| Plans      | `plan.engineering.*`, `plan.personnel.*`, `plan.operations.*`, `plan.mission.*`, `plan.safety.*`, `plan.emergency.*`                                                                                    |
| Tasks      | `task.engineering.*`, `task.training.*`, `task.operations.*`, `task.infrastructure.*`, `task.testing.*`                                                                                                 |

### New Type Keys Added (v4.0):

- `goal.strategic.legacy` - Post-Apollo legacy programs
- `milestone.program.cancellation` - Cancelled missions
- `milestone.program.station` - Skylab launch
- `milestone.mission.station` - Skylab crewed missions
- `milestone.mission.international` - Apollo-Soyuz
- `milestone.budget.peak` - Peak funding
- `milestone.budget.decline` - Budget reduction
- `milestone.diplomacy.goodwill` - World tour
- `milestone.diplomacy.science` - Moon rock gifts
- `milestone.engineering.software` - Software development (Hamilton)
- `milestone.engineering.computation` - Human computers (Johnson)

---

## Recommended Fixes

### Priority 1 (Data Integrity): ✅ COMPLETED

1. ✅ Added `state_key = 'achieved'` to all goal INSERT statements (7 goals)
2. ✅ Added `state_key = 'completed'` to all milestone INSERT statements (63+ milestones)

### Priority 2 (Completeness): ✅ COMPLETED

3. ✅ Added Apollo cancellation milestones (18, 19, 20)
4. ✅ Added budget/funding milestones (Peak FY1966, Decline)
5. ✅ Added post-Apollo legacy milestones (Skylab, Apollo-Soyuz)
6. ✅ Added diplomacy milestones (World Tour, Moon Rocks)
7. ✅ Added key personnel milestones (Hamilton, Johnson)
8. ✅ Added Goal 7: "Establish Apollo Legacy"
9. ✅ Added 30+ new graph edges with causal relationships

### Priority 3 (Future Enhancements):

10. Verify all dates against NASA historical records
11. Add key document texts (Kennedy speeches, mission reports)
12. Add more granular contractor milestones

---

## Version History

| Version | Date       | Changes                                                      |
| ------- | ---------- | ------------------------------------------------------------ |
| v3.0    | 2024-12-21 | Fixed state_key columns for goals and milestones             |
| v4.0    | 2024-12-21 | Added Skylab, ASTP, cancellations, budget, diplomacy, personnel |
