<!-- docs/example-projects/WASHINGTON_REVIEW.md -->

# Washington Revolutionary War Example Project Review

**Project:** George Washington's Revolutionary War Campaign
**UUID:** `11111111-1111-1111-1111-111111111111`
**Migration File:** `supabase/migrations/20251220_seed_washington_example_project.sql`

---

## Overview

This migration tracks George Washington's military leadership during the American Revolutionary War, with expanded coverage of the Continental Marines. It includes column addition checks that are now redundant (columns already exist) but harmless due to `IF NOT EXISTS` guards.

---

## Entity Counts

| Entity Type | Count | Status |
| ----------- | ----- | ------ |
| Project     | 1     | ✓      |
| Goals       | 5     | ✓      |
| Milestones  | 60+   | ✓      |
| Plans       | 15+   | ✓      |
| Tasks       | 25+   | ✓      |
| Decisions   | 12+   | ✓      |
| Risks       | 12+   | ✓      |
| Documents   | 10+   | ✓      |
| Edges       | 350+  | ✓      |

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

### Redundant Column Checks (Lines 27-49):

This migration includes `IF NOT EXISTS` column addition blocks:

```sql
-- Add is_public column to onto_projects if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (...) THEN
    ALTER TABLE onto_projects ADD COLUMN is_public BOOLEAN DEFAULT FALSE;
  END IF;
END$$;
```

**These are redundant but harmless** - the columns already exist, so the blocks will do nothing.

---

## Data Consistency Issues

### 1. Goals Missing `state_key` in INSERT Statements

**Severity:** MEDIUM

All goals have `props.state = 'achieved'` but no `state_key` column in INSERT.

**Result:**

- Database column: `state_key = 'draft'` (default)
- JSON props: `props.state = 'achieved'`

**Fix:** Add `state_key = 'achieved'` to goal INSERT statements.

### 2. Milestones Missing `state_key` in INSERT Statements

**Severity:** MEDIUM

All milestones have `props.state = 'achieved'` but no `state_key` column in INSERT.

**Result:**

- Database column: `state_key = 'pending'` (default)
- JSON props: `props.state = 'achieved'`

**Fix:** Add `state_key = 'completed'` to milestone INSERT statements (note: use `'completed'` not `'achieved'` for milestones).

---

## Content Fact-Check Items

### Key Dates to Verify:

| Date       | Event                                   | Verified? |
| ---------- | --------------------------------------- | --------- |
| 1775-04-19 | Battles of Lexington and Concord        |           |
| 1775-06-15 | Washington appointed Commander-in-Chief |           |
| 1775-07-03 | Washington takes command at Cambridge   |           |
| 1775-11-10 | Continental Marines established         |           |
| 1776-03-04 | Fortification of Dorchester Heights     |           |
| 1776-03-17 | British evacuate Boston                 |           |
| 1776-07-04 | Declaration of Independence             |           |
| 1776-08-27 | Battle of Long Island                   |           |
| 1776-12-26 | Crossing the Delaware / Trenton         |           |
| 1777-01-03 | Battle of Princeton                     |           |
| 1777-09-11 | Battle of Brandywine                    |           |
| 1777-10-04 | Battle of Germantown                    |           |
| 1777-12-19 | Valley Forge encampment begins          |           |
| 1778-02-06 | French Alliance signed                  |           |
| 1778-06-18 | British evacuate Philadelphia           |           |
| 1778-06-28 | Battle of Monmouth                      |           |
| 1779-09-23 | John Paul Jones / Bonhomme Richard      |           |
| 1780-01-01 | Mutiny of Pennsylvania Line             |           |
| 1781-01-17 | Battle of Cowpens                       |           |
| 1781-10-19 | Yorktown surrender                      |           |
| 1783-09-03 | Treaty of Paris                         |           |
| 1783-12-23 | Washington resigns commission           |           |

### Key Figures to Verify:

**Continental Army:**

- [ ] George Washington
- [ ] Nathanael Greene
- [ ] Henry Knox
- [ ] Alexander Hamilton
- [ ] Marquis de Lafayette
- [ ] Baron von Steuben

**Continental Marines:**

- [ ] Samuel Nicholas (first Commandant)
- [ ] John Paul Jones
- [ ] Captain Robert Mullan

**British:**

- [ ] Gen. William Howe
- [ ] Gen. Henry Clinton
- [ ] Gen. Charles Cornwallis

---

## Completeness Analysis

### Goals (5):

1. "Win Independence from Britain" - achieved ✓
2. "Build a Continental Army" - achieved ✓
3. "Secure Foreign Alliance" - achieved ✓
4. "Maintain Army Through Hardship" - achieved ✓
5. "Establish Continental Naval & Marine Forces" - achieved ✓ (v2.0 addition)

### Version 2.0 Additions:

- Goal 5: Continental Marines story
- Nassau Raid operation details
- Bonhomme Richard engagement
- Expanded to 150+ total entities

### Milestone Categories:

- 1775: War begins, Army formation
- 1776: Declaration, Early battles
- 1777: Philadelphia campaign, Valley Forge
- 1778: French alliance, Monmouth
- 1779-1780: Southern campaign
- 1781: Yorktown
- 1783: Peace

### Potentially Missing:

- [ ] More detailed naval operations
- [ ] Spy networks (Culper Ring)
- [ ] Financial struggles (Robert Morris)
- [ ] State militias coordination

---

## Graph Integrity

### Edge Structure:

- [x] Project → Goals (5 edges)
- [x] Goals → Milestones
- [x] Milestones → Plans
- [x] Milestones → Sub-Milestones
- [x] Plans → Sub-Plans
- [x] Plans → Tasks
- [x] Milestones → Decisions
- [x] Milestones → Risks
- [x] Milestones → Documents

### Graph Depth:

- Claims "graph_depth": 6 in props
- Deepest nesting: Project → Goal → Milestone → Plan → Sub-Plan → Task

---

## Type Key Taxonomy

### Used Type Keys:

| Entity     | Type Key Examples                                                                                                                            |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Project    | `project.historical.military`                                                                                                                |
| Goals      | `goal.strategic.independence`, `goal.operational.army`, `goal.diplomatic.alliance`, `goal.operational.sustainment`, `goal.operational.naval` |
| Milestones | `milestone.battle.*`, `milestone.political.*`, `milestone.organizational.*`, `milestone.diplomatic.*`, `milestone.naval.*`                   |
| Plans      | `plan.military.*`, `plan.diplomatic.*`, `plan.logistical.*`                                                                                  |
| Tasks      | `task.military.*`, `task.logistical.*`, `task.diplomatic.*`                                                                                  |

---

## Recommended Fixes

### Priority 1 (Data Integrity):

1. Add `state_key = 'achieved'` to all goal INSERT statements
2. Add `state_key = 'completed'` to all milestone INSERT statements

### Priority 2 (Completeness):

3. Verify all historical dates
4. Add spy network milestones (Culper Ring)
5. Add financial/logistics milestones

### Priority 3 (Enhancements):

6. Add more naval operation details
7. Add diplomatic correspondence documents
8. Add post-war milestones (Constitutional Convention foreshadowing)

### Note on Column Checks:

The redundant column addition blocks (lines 27-49) can be removed for cleanliness, but they are harmless due to `IF NOT EXISTS` guards.

---

## Fixes Applied ✅

**Date:** 2025-12-21

### Priority 1 (Data Integrity) - COMPLETED:

1. ✅ Added `state_key = 'achieved'` to all 5 goal INSERT statements
2. ✅ Added `state_key = 'completed'` to all 59 milestone INSERT statements across 6 INSERT blocks:
    - Main milestones block (25 milestones)
    - Philadelphia Campaign milestones (6 milestones)
    - Southern Campaign milestones (8 milestones)
    - Intelligence milestones (7 milestones)
    - Logistics milestones (3 milestones)
    - Mutiny milestones (3 milestones)

### Verification:

- All goal `state_key` values use valid enum: `'achieved'`
- All milestone `state_key` values use valid enum: `'completed'` (NOT 'achieved')
- SQL syntax verified - column counts match value counts in all INSERT statements

---

## V4.0 Expansion Applied ✅

**Date:** 2025-12-21

### New Goal Added:

- **Goal 9:** Defend the Frontier from British-Allied Raids (Sullivan Expedition)

### New Milestones Added (18):

**Hardship & Disaster:**

- Morristown Hard Winter (1779-1780) - Worse than Valley Forge
- Fort Washington Disaster (November 1776) - 2,800 captured

**Naval Warfare:**

- Battle of Valcour Island (October 1776) - Arnold delays invasion
- Battle of the Chesapeake (September 1781) - De Grasse seals Yorktown

**Northern Campaigns:**

- Quebec Expedition (1775-1776) - Arnold/Montgomery invasion
- Siege of Savannah (October 1779) - Franco-American defeat

**Frontier Warfare:**

- Battle of Oriskany (August 1777) - Bloodiest battle
- Cherry Valley Massacre (November 1778) - Prompted retaliation
- Wyoming Valley Massacre (July 1778) - Frontier atrocity
- Sullivan Expedition (1779) - Punitive campaign
- Battle of Newtown (August 1779) - Expedition's victory
- 40 Iroquois Villages Destroyed (1779) - Expedition result

**Financing:**

- Robert Morris Appointed (1781) - Superintendent of Finance
- Haym Salomon Financing (1781) - Critical fundraising

**Diversity & Alliance:**

- 1st Rhode Island Regiment (1778) - First integrated Black regiment
- Battle of Rhode Island (August 1778) - Black soldiers prove valor
- Oneida Nation Alliance (1777) - Only Iroquois allies
- Oneida Valley Forge Aid (1778) - Food saves army

### New Plans Added (4):

- Sullivan Campaign Plan
- Robert Morris Financial Plan
- Kosciuszko Fortification Plan
- Rhode Island Recruitment Plan

### New Tasks Added (12):

- Sullivan Expedition operational tasks (3)
- Fort Washington defense tasks (2)
- Financial tasks (2)
- Valcour Island construction tasks (3)
- 1st Rhode Island recruitment tasks (2)

### New Decisions Added (4):

- Authorize Sullivan Expedition
- Appoint Morris as Superintendent
- Recruit enslaved for freedom
- Accept de Grasse's plan

### New Risks Added (4):

- Frontier settlements vulnerable
- Morristown starvation
- Rhode Island regiment resistance
- French fleet availability

### New Documents Added (6):

- Sullivan Expedition Report
- 1st Rhode Island Roster
- Kosciuszko West Point Plans
- Pulaski Cavalry Manual
- Kosciuszko Fortification Treatise
- De Kalb Camden Battle Notes

### New Cross-Cutting Edges Added:

| From                 | Relation | To                  | Context                                |
| -------------------- | -------- | ------------------- | -------------------------------------- |
| Cherry Valley        | led_to   | Sullivan Expedition | Massacre prompted punitive expedition  |
| Wyoming Valley       | led_to   | Sullivan Expedition | Atrocity demanded response             |
| Battle of Newtown    | enabled  | Village Destruction | Victory broke resistance               |
| Valcour Island       | enabled  | Saratoga            | Delayed invasion by one year           |
| Battle of Chesapeake | enabled  | Yorktown            | French naval victory blocked relief    |
| Morris Financing     | enabled  | Yorktown            | Personal credit funded march/siege     |
| Oneida Aid           | enabled  | Valley Forge        | Food sustained starving army           |
| Oriskany             | enabled  | Saratoga            | Stopped St. Leger, concentrated forces |
| 1st Rhode Island     | enabled  | Yorktown            | Black soldiers served in assault       |

### Updated Entity Counts:

| Entity Type | Previous | New | Total |
| ----------- | -------- | --- | ----- |
| Goals       | 8        | +1  | 9     |
| Milestones  | 48+      | +18 | 66+   |
| Plans       | 21+      | +4  | 25+   |
| Tasks       | 68+      | +12 | 80+   |
| Decisions   | 16       | +4  | 20    |
| Risks       | 16       | +4  | 20    |
| Documents   | 16       | +6  | 22    |
| Edges       | 180+     | +40 | 220+  |

### V4.0 Themes Covered:

1. **Frontier Warfare:** Complete Sullivan Expedition arc with causes and outcomes
2. **Naval Warfare:** Valcour Island strategic delay, Chesapeake decisive victory
3. **Financial Crisis:** Robert Morris and Haym Salomon's critical role
4. **Diversity:** 1st Rhode Island Regiment (Black soldiers) and Oneida Nation alliance
5. **Foreign Volunteers:** Documents for Pulaski, Kosciuszko, and de Kalb
6. **Hardship:** Morristown Hard Winter (worse than Valley Forge)
7. **Disasters:** Fort Washington catastrophe, Quebec expedition failure
