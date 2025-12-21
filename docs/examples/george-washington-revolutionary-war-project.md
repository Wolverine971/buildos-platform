<!-- docs/examples/george-washington-revolutionary-war-project.md -->

# George Washington's Revolutionary War Project

## Example Ontology Project for BuildOS

This document defines a historically accurate example project demonstrating the **deeply nested graph structure** of the BuildOS ontology system. The project represents George Washington's campaign to defeat the British during the American Revolutionary War (1773-1783).

**Key Design Principle**: This graph is **deeply nested** - not everything connects directly to the project. Tasks connect to Plans or Milestones, Milestones connect to Goals, Sub-Plans connect to Plans, etc.

---

## Project Overview

| Field            | Value                                                                 |
| ---------------- | --------------------------------------------------------------------- |
| **Project Name** | Operation American Independence                                       |
| **Type Key**     | `project.military.campaign`                                           |
| **State**        | `complete`                                                            |
| **Owner**        | George Washington (Historical Figure)                                 |
| **Timeline**     | December 16, 1773 - December 23, 1783                                 |
| **Facets**       | context: `nonprofit` (public cause), scale: `epic`, stage: `complete` |

---

## Hierarchical Graph Structure

```
PROJECT: Operation American Independence
│
├── GOAL 1: Preserve the Continental Army
│   ├── MILESTONE: Survived New York Campaign (1776-11-16)
│   │   ├── PLAN: Defense of New York City
│   │   │   ├── TASK: Defend Long Island positions
│   │   │   ├── TASK: Execute retreat from Manhattan
│   │   │   └── TASK: Evacuate to New Jersey
│   │   ├── DECISION: Abandon New York City
│   │   └── RISK: Encirclement and army destruction
│   │
│   ├── MILESTONE: Army Revived at Trenton (1776-12-26)
│   │   ├── PLAN: Ten Crucial Days Campaign
│   │   │   ├── TASK: Cross Delaware River
│   │   │   ├── TASK: Assault Trenton garrison
│   │   │   └── TASK: Attack Princeton
│   │   ├── DECISION: Cross Delaware on Christmas Night
│   │   └── RISK: Army dissolution from expiring enlistments
│   │
│   └── MILESTONE: Army Professionalized at Valley Forge (1778-06-19)
│       ├── PLAN: Valley Forge Winter Encampment
│       │   ├── SUB-PLAN: Camp Construction
│       │   │   └── TASK: Build 1,500 log huts
│       │   ├── SUB-PLAN: Supply System Reform
│       │   │   ├── TASK: Appoint Nathanael Greene as Quartermaster
│       │   │   └── SUB-MILESTONE: Supply lines established (1778-03-15)
│       │   └── SUB-PLAN: Military Training Program
│       │       ├── TASK: Implement Steuben drill manual
│       │       ├── TASK: Train model company of 100 men
│       │       ├── SUB-MILESTONE: Model company trained (1778-03-01)
│       │       └── SUB-MILESTONE: Army-wide training complete (1778-05-01)
│       ├── DOCUMENT: Steuben's Blue Book
│       ├── DECISION: Encamp at Valley Forge
│       └── RISK: Critical supply shortages
│
├── GOAL 2: Secure Foreign Alliance
│   ├── MILESTONE: Victory at Saratoga (1777-10-17)
│   │   ├── SUB-MILESTONE: Freeman's Farm (1777-09-19)
│   │   ├── SUB-MILESTONE: Bemis Heights (1777-10-07)
│   │   └── SUB-MILESTONE: Burgoyne Surrender (1777-10-17)
│   │
│   └── MILESTONE: Treaty of Alliance with France (1778-02-06)
│       ├── PLAN: Diplomatic Mission to France
│       │   ├── TASK: Negotiate alliance terms (Franklin)
│       │   ├── TASK: Secure military aid commitments
│       │   └── TASK: Obtain financial support
│       ├── SUB-MILESTONE: Treaty ratified by Congress (1778-05-04)
│       ├── DOCUMENT: Treaty of Alliance
│       └── RISK: British naval superiority (mitigated by French fleet)
│
├── GOAL 3: Achieve American Independence
│   ├── MILESTONE: Boston Liberated (1776-03-17)
│   │   ├── PLAN: Boston Siege Campaign
│   │   │   ├── TASK: Assume command at Cambridge
│   │   │   ├── TASK: Assess army condition
│   │   │   ├── SUB-PLAN: Artillery Acquisition
│   │   │   │   ├── TASK: Transport cannons from Ticonderoga
│   │   │   │   └── SUB-MILESTONE: Artillery arrives (1776-01-25)
│   │   │   └── SUB-PLAN: Dorchester Heights Operation
│   │   │       ├── TASK: Fortify Dorchester Heights overnight
│   │   │       └── SUB-MILESTONE: Heights fortified (1776-03-04)
│   │   └── RISK: Inadequate supplies and ammunition
│   │
│   ├── MILESTONE: Independence Declared (1776-07-04)
│   │   ├── TASK: Coordinate with Continental Congress
│   │   └── DOCUMENT: Declaration of Independence
│   │
│   ├── MILESTONE: British Defeated at Yorktown (1781-10-19)
│   │   ├── PLAN: Yorktown Campaign
│   │   │   ├── SUB-PLAN: Strategic March to Virginia
│   │   │   │   ├── TASK: Execute secret march (600 miles)
│   │   │   │   ├── TASK: Coordinate deception operations
│   │   │   │   └── SUB-MILESTONE: Forces arrive at Yorktown (1781-09-28)
│   │   │   ├── SUB-PLAN: Franco-American Naval Coordination
│   │   │   │   ├── TASK: Synchronize with Admiral de Grasse
│   │   │   │   ├── TASK: Secure Chesapeake Bay control
│   │   │   │   └── SUB-MILESTONE: French fleet defeats British (1781-09-05)
│   │   │   └── SUB-PLAN: Siege Operations
│   │   │       ├── TASK: Construct first parallel
│   │   │       ├── TASK: Begin artillery bombardment
│   │   │       ├── TASK: Construct second parallel
│   │   │       ├── TASK: Assault Redoubts 9 and 10
│   │   │       ├── SUB-MILESTONE: Redoubts captured (1781-10-14)
│   │   │       ├── SUB-MILESTONE: British request parley (1781-10-17)
│   │   │       └── TASK: Accept British surrender
│   │   ├── DECISION: March to Yorktown instead of New York
│   │   └── RISK: French fleet timing and coordination
│   │
│   └── MILESTONE: Treaty of Paris Signed (1783-09-03)
│       ├── TASK: Support diplomatic negotiations
│       └── DOCUMENT: Treaty of Paris 1783
│
└── GOAL 4: Establish Civilian Control of Military
    ├── MILESTONE: Newburgh Conspiracy Defused (1783-03-15)
    │   ├── TASK: Address officers meeting
    │   ├── DECISION: Maintain subordination to Congress
    │   └── RISK: Officer mutiny threat
    │
    └── MILESTONE: Commission Returned to Congress (1783-12-23)
        ├── TASK: Resign military commission
        └── DOCUMENT: Resignation Address
```

---

## Pre-War Context (Linked to Project)

### Task: Organize Colonial Resistance (Boston Tea Party)

| Field         | Value                                                                                                             |
| ------------- | ----------------------------------------------------------------------------------------------------------------- |
| **ID**        | `task-boston-tea-party`                                                                                           |
| **Title**     | Coordinate Colonial Resistance Networks                                                                           |
| **Linked To** | Project (pre-war context)                                                                                         |
| **State**     | `done`                                                                                                            |
| **Due At**    | 1773-12-16                                                                                                        |
| **Props**     | `{"assigned_to": "Samuel Adams", "location": "Boston", "event": "Boston Tea Party", "tea_destroyed_chests": 342}` |

### Task: First Continental Congress

| Field      | Value                                                                                                                                |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **ID**     | `task-first-congress`                                                                                                                |
| **Title**  | Participate in First Continental Congress                                                                                            |
| **Due At** | 1774-10-26                                                                                                                           |
| **Props**  | `{"location": "Philadelphia, Carpenters' Hall", "duration_days": 51, "delegates": 56, "outcome": "Continental Association adopted"}` |

### Task: Receive Command Commission

| Field        | Value                                                                                             |
| ------------ | ------------------------------------------------------------------------------------------------- |
| **ID**       | `task-receive-commission`                                                                         |
| **Title**    | Accept Appointment as Commander-in-Chief                                                          |
| **Due At**   | 1775-06-19                                                                                        |
| **Props**    | `{"appointed_date": "1775-06-15", "commission_issued": "1775-06-19", "location": "Philadelphia"}` |
| **Document** | Washington's Commission                                                                           |

---

## GOAL 1: Preserve the Continental Army

**Strategic Principle**: "The army itself is more important than any individual battle"

| Field     | Value                                                |
| --------- | ---------------------------------------------------- |
| **ID**    | `goal-preserve-army`                                 |
| **Name**  | Maintain Continental Army as a Viable Fighting Force |
| **State** | `achieved`                                           |

### Milestone 1.1: Survived New York Campaign

| Field      | Value                                                                                                             |
| ---------- | ----------------------------------------------------------------------------------------------------------------- |
| **ID**     | `milestone-survived-ny`                                                                                           |
| **Title**  | Army Preserved Through Strategic Retreat                                                                          |
| **Due At** | 1776-11-16                                                                                                        |
| **Parent** | Goal: Preserve Army                                                                                               |
| **Props**  | `{"location": "New York/New Jersey", "outcome": "tactical defeats but army preserved", "troops_remaining": 3000}` |

#### Plan 1.1.1: Defense of New York City

| Field      | Value                                                                                                       |
| ---------- | ----------------------------------------------------------------------------------------------------------- |
| **ID**     | `plan-ny-defense`                                                                                           |
| **Name**   | Defense of New York City                                                                                    |
| **Parent** | Milestone: Survived NY Campaign                                                                             |
| **Props**  | `{"start_date": "1776-07-01", "end_date": "1776-11-16", "british_forces": 32000, "american_forces": 23000}` |

##### Task: Defend Long Island Positions

| Field      | Value                                                                                               |
| ---------- | --------------------------------------------------------------------------------------------------- |
| **ID**     | `task-defend-long-island`                                                                           |
| **Title**  | Defend Long Island Against British Landing                                                          |
| **Parent** | Plan: Defense of NYC                                                                                |
| **Due At** | 1776-08-27                                                                                          |
| **Props**  | `{"outcome": "defeat at Battle of Long Island", "casualties": 2000, "lesson": "British can flank"}` |

##### Task: Execute Retreat from Manhattan

| Field      | Value                                                                              |
| ---------- | ---------------------------------------------------------------------------------- |
| **ID**     | `task-retreat-manhattan`                                                           |
| **Title**  | Conduct Fighting Retreat from Manhattan                                            |
| **Parent** | Plan: Defense of NYC                                                               |
| **Due At** | 1776-09-15                                                                         |
| **Props**  | `{"kips_bay_panic": true, "harlem_heights_success": true, "army_preserved": true}` |

##### Task: Evacuate to New Jersey

| Field      | Value                                                                              |
| ---------- | ---------------------------------------------------------------------------------- |
| **ID**     | `task-evacuate-nj`                                                                 |
| **Title**  | Complete Evacuation from New York to New Jersey                                    |
| **Parent** | Plan: Defense of NYC                                                               |
| **Due At** | 1776-11-16                                                                         |
| **Props**  | `{"fort_washington_lost": true, "fort_lee_lost": true, "retreat_across_nj": true}` |

#### Decision: Abandon New York City

| Field           | Value                                                                                 |
| --------------- | ------------------------------------------------------------------------------------- |
| **ID**          | `decision-abandon-nyc`                                                                |
| **Title**       | Decision to Retreat from New York                                                     |
| **Parent**      | Milestone: Survived NY Campaign                                                       |
| **Decision At** | 1776-08-29                                                                            |
| **Rationale**   | British naval superiority made Manhattan indefensible; preservation of army paramount |

#### Risk: Encirclement and Army Destruction

| Field           | Value                                                              |
| --------------- | ------------------------------------------------------------------ |
| **ID**          | `risk-ny-encirclement`                                             |
| **Title**       | Encirclement and Destruction of Army                               |
| **Parent**      | Milestone: Survived NY Campaign                                    |
| **Probability** | 0.6                                                                |
| **Impact**      | `critical`                                                         |
| **State**       | `mitigated`                                                        |
| **Props**       | `{"mitigation": "Strategic retreat executed before encirclement"}` |

---

### Milestone 1.2: Army Revived at Trenton

| Field      | Value                                                                                          |
| ---------- | ---------------------------------------------------------------------------------------------- |
| **ID**     | `milestone-trenton-revival`                                                                    |
| **Title**  | Army Morale and Strength Restored                                                              |
| **Due At** | 1776-12-26                                                                                     |
| **Parent** | Goal: Preserve Army                                                                            |
| **Props**  | `{"hessians_captured": 900, "morale_impact": "critical boost", "reenlistments_secured": true}` |

#### Plan 1.2.1: Ten Crucial Days Campaign

| Field      | Value                                                                                                     |
| ---------- | --------------------------------------------------------------------------------------------------------- |
| **ID**     | `plan-ten-crucial-days`                                                                                   |
| **Name**   | Ten Crucial Days Campaign                                                                                 |
| **Parent** | Milestone: Trenton Revival                                                                                |
| **Props**  | `{"start_date": "1776-12-25", "end_date": "1777-01-03", "objective": "restore morale through victories"}` |

##### Task: Cross Delaware River

| Field      | Value                                                                                                                             |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **ID**     | `task-cross-delaware`                                                                                                             |
| **Title**  | Execute Christmas Night Crossing of Delaware                                                                                      |
| **Parent** | Plan: Ten Crucial Days                                                                                                            |
| **Due At** | 1776-12-25                                                                                                                        |
| **Props**  | `{"departure_time": "evening", "weather": "nor'easter, ice, snow", "troops_crossed": 2400, "crossing_point": "McConkey's Ferry"}` |

##### Task: Assault Trenton Garrison

| Field      | Value                                                                                                                      |
| ---------- | -------------------------------------------------------------------------------------------------------------------------- |
| **ID**     | `task-attack-trenton`                                                                                                      |
| **Title**  | Assault Hessian Garrison at Trenton                                                                                        |
| **Parent** | Plan: Ten Crucial Days                                                                                                     |
| **Due At** | 1776-12-26                                                                                                                 |
| **Props**  | `{"attack_time": "08:00", "hessian_commander": "Colonel Johann Rall", "hessians_captured": 900, "american_casualties": 0}` |

##### Task: Attack Princeton

| Field      | Value                                                                                                       |
| ---------- | ----------------------------------------------------------------------------------------------------------- |
| **ID**     | `task-attack-princeton`                                                                                     |
| **Title**  | March on and Defeat British at Princeton                                                                    |
| **Parent** | Plan: Ten Crucial Days                                                                                      |
| **Due At** | 1777-01-03                                                                                                  |
| **Props**  | `{"night_march": true, "outflanked_cornwallis": true, "outcome": "victory", "washington_led_charge": true}` |

#### Decision: Cross Delaware on Christmas Night

| Field           | Value                                                                                                              |
| --------------- | ------------------------------------------------------------------------------------------------------------------ |
| **ID**          | `decision-cross-delaware`                                                                                          |
| **Title**       | Decision to Cross Delaware on Christmas Night                                                                      |
| **Parent**      | Milestone: Trenton Revival                                                                                         |
| **Decision At** | 1776-12-24                                                                                                         |
| **Rationale**   | Enlistments expiring Dec 31; dispersed Hessian garrisons vulnerable; small victory could revive cause              |
| **Props**       | `{"key_factors": ["expiring enlistments", "low morale", "enemy dispersion"], "risk_accepted": "army dissolution"}` |

#### Risk: Army Dissolution from Expiring Enlistments

| Field           | Value                                                                                           |
| --------------- | ----------------------------------------------------------------------------------------------- |
| **ID**          | `risk-enlistment-expiry`                                                                        |
| **Title**       | Army Dissolution from Expiring Enlistments                                                      |
| **Parent**      | Milestone: Trenton Revival                                                                      |
| **Probability** | 0.9                                                                                             |
| **Impact**      | `critical`                                                                                      |
| **State**       | `mitigated`                                                                                     |
| **Props**       | `{"crisis_point": "December 31, 1776", "mitigation": "Trenton victory inspired reenlistments"}` |

---

### Milestone 1.3: Army Professionalized at Valley Forge

| Field      | Value                                                                                                            |
| ---------- | ---------------------------------------------------------------------------------------------------------------- |
| **ID**     | `milestone-valley-forge-reform`                                                                                  |
| **Title**  | Continental Army Transformed into Professional Force                                                             |
| **Due At** | 1778-06-19                                                                                                       |
| **Parent** | Goal: Preserve Army                                                                                              |
| **Props**  | `{"location": "Valley Forge, Pennsylvania", "duration_months": 6, "troops_entered": 12000, "troops_lost": 2000}` |

#### Plan 1.3.1: Valley Forge Winter Encampment

| Field      | Value                                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------ |
| **ID**     | `plan-valley-forge`                                                                                          |
| **Name**   | Valley Forge Winter Encampment                                                                               |
| **Parent** | Milestone: Valley Forge Reform                                                                               |
| **Props**  | `{"start_date": "1777-12-19", "end_date": "1778-06-19", "objective": "reorganize and professionalize army"}` |

##### Sub-Plan: Camp Construction

| Field      | Value                                                            |
| ---------- | ---------------------------------------------------------------- |
| **ID**     | `plan-camp-construction`                                         |
| **Name**   | Winter Camp Construction                                         |
| **Parent** | Plan: Valley Forge                                               |
| **Props**  | `{"huts_required": 1500, "construction_deadline": "1777-12-25"}` |

###### Task: Build Log Huts

| Field      | Value                                                                               |
| ---------- | ----------------------------------------------------------------------------------- |
| **ID**     | `task-build-huts`                                                                   |
| **Title**  | Construct 1,500 Log Huts for Winter Quarters                                        |
| **Parent** | Sub-Plan: Camp Construction                                                         |
| **Due At** | 1777-12-25                                                                          |
| **Props**  | `{"huts_built": 1500, "troops_per_hut": 8, "conditions": "crowded but protective"}` |

##### Sub-Plan: Supply System Reform

| Field      | Value                                                                                  |
| ---------- | -------------------------------------------------------------------------------------- |
| **ID**     | `plan-supply-reform`                                                                   |
| **Name**   | Quartermaster Department Reform                                                        |
| **Parent** | Plan: Valley Forge                                                                     |
| **Props**  | `{"objective": "fix chronic supply shortages", "key_appointment": "Nathanael Greene"}` |

###### Task: Appoint New Quartermaster General

| Field      | Value                                                                              |
| ---------- | ---------------------------------------------------------------------------------- |
| **ID**     | `task-appoint-greene`                                                              |
| **Title**  | Appoint Nathanael Greene as Quartermaster General                                  |
| **Parent** | Sub-Plan: Supply Reform                                                            |
| **Due At** | 1778-03-02                                                                         |
| **Props**  | `{"appointee": "Nathanael Greene", "previous_qm": "Thomas Mifflin (ineffective)"}` |

###### Sub-Milestone: Supply Lines Established

| Field      | Value                                                                                                |
| ---------- | ---------------------------------------------------------------------------------------------------- |
| **ID**     | `milestone-supply-lines`                                                                             |
| **Title**  | Supply Transportation Networks Established                                                           |
| **Parent** | Sub-Plan: Supply Reform                                                                              |
| **Due At** | 1778-03-15                                                                                           |
| **Props**  | `{"improvements": ["systematic requisitioning", "transportation networks", "inventory management"]}` |

##### Sub-Plan: Military Training Program

| Field      | Value                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------- |
| **ID**     | `plan-steuben-training`                                                                     |
| **Name**   | Baron von Steuben Training Program                                                          |
| **Parent** | Plan: Valley Forge                                                                          |
| **Props**  | `{"trainer": "Baron von Steuben", "arrived": "1778-02-23", "method": "train the trainers"}` |

###### Task: Train Model Company

| Field      | Value                                                                                                           |
| ---------- | --------------------------------------------------------------------------------------------------------------- |
| **ID**     | `task-model-company`                                                                                            |
| **Title**  | Train Model Company of 100 Men                                                                                  |
| **Parent** | Sub-Plan: Training Program                                                                                      |
| **Due At** | 1778-03-01                                                                                                      |
| **Props**  | `{"company_size": 100, "skills": ["drill", "bayonet", "formations"], "purpose": "demonstrate for other units"}` |

###### Task: Implement Army-Wide Training

| Field      | Value                                                                                  |
| ---------- | -------------------------------------------------------------------------------------- |
| **ID**     | `task-army-training`                                                                   |
| **Title**  | Execute Army-Wide Professional Training                                                |
| **Parent** | Sub-Plan: Training Program                                                             |
| **Due At** | 1778-05-01                                                                             |
| **Props**  | `{"manual": "Blue Book", "skills": ["drill", "bayonet", "discipline", "inspections"]}` |

###### Sub-Milestone: Model Company Trained

| Field      | Value                                                      |
| ---------- | ---------------------------------------------------------- |
| **ID**     | `milestone-model-company`                                  |
| **Title**  | Model Company Training Complete                            |
| **Parent** | Sub-Plan: Training Program                                 |
| **Due At** | 1778-03-01                                                 |
| **Props**  | `{"soldiers_trained": 100, "ready_to_train_others": true}` |

###### Sub-Milestone: Army-Wide Training Complete

| Field      | Value                                                                   |
| ---------- | ----------------------------------------------------------------------- |
| **ID**     | `milestone-training-complete`                                           |
| **Title**  | All Units Trained in Steuben Methods                                    |
| **Parent** | Sub-Plan: Training Program                                              |
| **Due At** | 1778-05-01                                                              |
| **Props**  | `{"outcome": "professional army capable of matching British regulars"}` |

#### Document: Steuben's Blue Book

| Field      | Value                                                                                                       |
| ---------- | ----------------------------------------------------------------------------------------------------------- |
| **ID**     | `doc-blue-book`                                                                                             |
| **Title**  | Regulations for the Order and Discipline of the Troops                                                      |
| **Parent** | Milestone: Valley Forge Reform                                                                              |
| **Props**  | `{"author": "Baron von Steuben", "translators": ["John Laurens", "Alexander Hamilton"], "adopted": "1779"}` |

#### Decision: Encamp at Valley Forge

| Field           | Value                                                                                                  |
| --------------- | ------------------------------------------------------------------------------------------------------ |
| **ID**          | `decision-valley-forge`                                                                                |
| **Title**       | Decision to Encamp at Valley Forge                                                                     |
| **Parent**      | Milestone: Valley Forge Reform                                                                         |
| **Decision At** | 1777-12-18                                                                                             |
| **Rationale**   | Defensible position 18 miles from Philadelphia; close enough to monitor British; allows reorganization |
| **Props**       | `{"congress_wanted": "continue campaign", "washington_insisted": "army needs rest"}`                   |

#### Risk: Critical Supply Shortages

| Field           | Value                                                                                                      |
| --------------- | ---------------------------------------------------------------------------------------------------------- |
| **ID**          | `risk-supply-shortage`                                                                                     |
| **Title**       | Critical Supply Shortages                                                                                  |
| **Parent**      | Milestone: Valley Forge Reform                                                                             |
| **Probability** | 0.9                                                                                                        |
| **Impact**      | `high`                                                                                                     |
| **State**       | `mitigated`                                                                                                |
| **Props**       | `{"shortages": ["food", "clothing", "shoes", "blankets"], "mitigation": "Greene appointed Quartermaster"}` |

---

## GOAL 2: Secure Foreign Alliance

| Field     | Value                           |
| --------- | ------------------------------- |
| **ID**    | `goal-foreign-alliance`         |
| **Name**  | Secure French Military Alliance |
| **State** | `achieved`                      |

### Milestone 2.1: Victory at Saratoga

| Field      | Value                                                                                                       |
| ---------- | ----------------------------------------------------------------------------------------------------------- |
| **ID**     | `milestone-saratoga`                                                                                        |
| **Title**  | British Army Surrenders at Saratoga                                                                         |
| **Due At** | 1777-10-17                                                                                                  |
| **Parent** | Goal: Foreign Alliance                                                                                      |
| **Props**  | `{"location": "Saratoga, New York", "commander": "Horatio Gates", "diplomatic_impact": "convinced France"}` |

#### Sub-Milestone: Freeman's Farm

| Field      | Value                                                                                 |
| ---------- | ------------------------------------------------------------------------------------- |
| **ID**     | `milestone-freemans-farm`                                                             |
| **Title**  | First Battle of Saratoga (Freeman's Farm)                                             |
| **Parent** | Milestone: Saratoga                                                                   |
| **Due At** | 1777-09-19                                                                            |
| **Props**  | `{"british_commander": "Burgoyne", "outcome": "tactical British victory but costly"}` |

#### Sub-Milestone: Bemis Heights

| Field      | Value                                                                                              |
| ---------- | -------------------------------------------------------------------------------------------------- |
| **ID**     | `milestone-bemis-heights`                                                                          |
| **Title**  | Second Battle of Saratoga (Bemis Heights)                                                          |
| **Parent** | Milestone: Saratoga                                                                                |
| **Due At** | 1777-10-07                                                                                         |
| **Props**  | `{"hero": "Benedict Arnold", "outcome": "decisive American victory", "burgoyne_surrounded": true}` |

#### Sub-Milestone: Burgoyne Surrender

| Field      | Value                                                             |
| ---------- | ----------------------------------------------------------------- |
| **ID**     | `milestone-burgoyne-surrender`                                    |
| **Title**  | General Burgoyne Surrenders 5,900 Troops                          |
| **Parent** | Milestone: Saratoga                                               |
| **Due At** | 1777-10-17                                                        |
| **Props**  | `{"troops_surrendered": 5900, "first_full_army_surrender": true}` |

---

### Milestone 2.2: Treaty of Alliance with France

| Field      | Value                                                            |
| ---------- | ---------------------------------------------------------------- |
| **ID**     | `milestone-french-alliance`                                      |
| **Title**  | Treaty of Alliance Signed with France                            |
| **Due At** | 1778-02-06                                                       |
| **Parent** | Goal: Foreign Alliance                                           |
| **Props**  | `{"location": "Paris", "french_minister": "Comte de Vergennes"}` |

#### Plan 2.2.1: Diplomatic Mission to France

| Field      | Value                                                                             |
| ---------- | --------------------------------------------------------------------------------- |
| **ID**     | `plan-diplomatic-mission`                                                         |
| **Name**   | Diplomatic Mission to France                                                      |
| **Parent** | Milestone: French Alliance                                                        |
| **Props**  | `{"lead_negotiator": "Benjamin Franklin", "team": ["Silas Deane", "Arthur Lee"]}` |

##### Task: Negotiate Alliance Terms

| Field      | Value                                                                                                    |
| ---------- | -------------------------------------------------------------------------------------------------------- |
| **ID**     | `task-negotiate-france`                                                                                  |
| **Title**  | Negotiate Alliance Terms with France                                                                     |
| **Parent** | Plan: Diplomatic Mission                                                                                 |
| **Due At** | 1778-02-06                                                                                               |
| **Props**  | `{"negotiators": ["Benjamin Franklin", "Silas Deane", "Arthur Lee"], "french_counterpart": "Vergennes"}` |

##### Task: Secure Military Aid

| Field      | Value                                                                         |
| ---------- | ----------------------------------------------------------------------------- |
| **ID**     | `task-secure-military-aid`                                                    |
| **Title**  | Secure French Military Aid Commitments                                        |
| **Parent** | Plan: Diplomatic Mission                                                      |
| **Due At** | 1778-02-06                                                                    |
| **Props**  | `{"aid_secured": ["troops", "naval support", "supplies", "financial loans"]}` |

#### Sub-Milestone: Treaty Ratified by Congress

| Field      | Value                                   |
| ---------- | --------------------------------------- |
| **ID**     | `milestone-treaty-ratified`             |
| **Title**  | Treaty Ratified by Continental Congress |
| **Parent** | Milestone: French Alliance              |
| **Due At** | 1778-05-04                              |

#### Document: Treaty of Alliance

| Field      | Value                                                                                   |
| ---------- | --------------------------------------------------------------------------------------- |
| **ID**     | `doc-french-treaty`                                                                     |
| **Title**  | Treaty of Alliance with France                                                          |
| **Parent** | Milestone: French Alliance                                                              |
| **Props**  | `{"key_terms": ["mutual defense", "no separate peace", "recognition of independence"]}` |

#### Risk: British Naval Superiority

| Field           | Value                                                                                  |
| --------------- | -------------------------------------------------------------------------------------- |
| **ID**          | `risk-naval-superiority`                                                               |
| **Title**       | British Naval Dominance                                                                |
| **Parent**      | Milestone: French Alliance                                                             |
| **Probability** | 1.0                                                                                    |
| **Impact**      | `high`                                                                                 |
| **State**       | `mitigated`                                                                            |
| **Props**       | `{"mitigation": "French alliance provided naval capability to counter British fleet"}` |

---

## GOAL 3: Achieve American Independence

| Field     | Value                                            |
| --------- | ------------------------------------------------ |
| **ID**    | `goal-independence`                              |
| **Name**  | Achieve American Independence from Great Britain |
| **State** | `achieved`                                       |

### Milestone 3.1: Boston Liberated

| Field      | Value                                                                               |
| ---------- | ----------------------------------------------------------------------------------- |
| **ID**     | `milestone-boston`                                                                  |
| **Title**  | British Evacuation of Boston                                                        |
| **Due At** | 1776-03-17                                                                          |
| **Parent** | Goal: Independence                                                                  |
| **Props**  | `{"british_evacuated": 11000, "method": "artillery positioning forced evacuation"}` |

#### Plan 3.1.1: Boston Siege Campaign

| Field      | Value                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------------- |
| **ID**     | `plan-boston-siege`                                                                                     |
| **Name**   | Boston Siege Campaign                                                                                   |
| **Parent** | Milestone: Boston Liberation                                                                            |
| **Props**  | `{"start_date": "1775-04-19", "end_date": "1776-03-17", "strategy": "siege and artillery positioning"}` |

##### Task: Assume Command at Cambridge

| Field      | Value                                                                                    |
| ---------- | ---------------------------------------------------------------------------------------- |
| **ID**     | `task-assume-command`                                                                    |
| **Title**  | Take Command of Continental Forces at Cambridge                                          |
| **Parent** | Plan: Boston Siege                                                                       |
| **Due At** | 1775-07-03                                                                               |
| **Props**  | `{"appointed": "1775-06-15", "commissioned": "1775-06-19", "location": "Cambridge, MA"}` |

##### Task: Assess Army Condition

| Field      | Value                                                                            |
| ---------- | -------------------------------------------------------------------------------- |
| **ID**     | `task-assess-army`                                                               |
| **Title**  | Complete Assessment of Army Readiness                                            |
| **Parent** | Plan: Boston Siege                                                               |
| **Due At** | 1775-07-10                                                                       |
| **Props**  | `{"issues": ["uniform shortage", "ammunition shortage", "discipline problems"]}` |

##### Sub-Plan: Artillery Acquisition

| Field      | Value                                                                         |
| ---------- | ----------------------------------------------------------------------------- |
| **ID**     | `plan-artillery-acquisition`                                                  |
| **Name**   | Fort Ticonderoga Artillery Acquisition                                        |
| **Parent** | Plan: Boston Siege                                                            |
| **Props**  | `{"commander": "Henry Knox", "objective": "bring siege artillery to Boston"}` |

###### Task: Transport Cannons from Ticonderoga

| Field      | Value                                                                                                                               |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **ID**     | `task-knox-artillery`                                                                                                               |
| **Title**  | Transport Cannons from Fort Ticonderoga                                                                                             |
| **Parent** | Sub-Plan: Artillery Acquisition                                                                                                     |
| **Due At** | 1776-01-25                                                                                                                          |
| **Props**  | `{"departed": "1775-11-16", "arrived_ticonderoga": "1775-12-05", "cannons": 59, "distance_miles": 300, "method": "ox-drawn sleds"}` |

###### Sub-Milestone: Artillery Arrives at Boston

| Field      | Value                                           |
| ---------- | ----------------------------------------------- |
| **ID**     | `milestone-artillery-arrives`                   |
| **Title**  | Knox's Artillery Train Reaches Boston Lines     |
| **Parent** | Sub-Plan: Artillery Acquisition                 |
| **Due At** | 1776-01-25                                      |
| **Props**  | `{"cannons_delivered": 59, "journey_days": 56}` |

##### Sub-Plan: Dorchester Heights Operation

| Field      | Value                                                                                                    |
| ---------- | -------------------------------------------------------------------------------------------------------- |
| **ID**     | `plan-dorchester-heights`                                                                                |
| **Name**   | Dorchester Heights Fortification                                                                         |
| **Parent** | Plan: Boston Siege                                                                                       |
| **Props**  | `{"objective": "position artillery to threaten British harbor", "execution": "overnight fortification"}` |

###### Task: Fortify Dorchester Heights

| Field      | Value                                                      |
| ---------- | ---------------------------------------------------------- |
| **ID**     | `task-fortify-dorchester`                                  |
| **Title**  | Fortify Dorchester Heights Overnight                       |
| **Parent** | Sub-Plan: Dorchester Heights                               |
| **Due At** | 1776-03-04                                                 |
| **Props**  | `{"executed_overnight": true, "cannons_positioned": true}` |

###### Sub-Milestone: Heights Fortified

| Field      | Value                                                             |
| ---------- | ----------------------------------------------------------------- |
| **ID**     | `milestone-heights-fortified`                                     |
| **Title**  | Dorchester Heights Fortified and Armed                            |
| **Parent** | Sub-Plan: Dorchester Heights                                      |
| **Due At** | 1776-03-04                                                        |
| **Props**  | `{"british_response": "decided to evacuate rather than assault"}` |

#### Risk: Inadequate Supplies

| Field           | Value                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------ |
| **ID**          | `risk-boston-supplies`                                                                     |
| **Title**       | Inadequate Supplies and Ammunition                                                         |
| **Parent**      | Milestone: Boston Liberation                                                               |
| **Probability** | 0.8                                                                                        |
| **Impact**      | `high`                                                                                     |
| **State**       | `mitigated`                                                                                |
| **Props**       | `{"mitigation": "Knox artillery solved siege capability; careful conservation of powder"}` |

---

### Milestone 3.2: Independence Declared

| Field      | Value                                                                               |
| ---------- | ----------------------------------------------------------------------------------- |
| **ID**     | `milestone-declaration`                                                             |
| **Title**  | Declaration of Independence Adopted                                                 |
| **Due At** | 1776-07-04                                                                          |
| **Parent** | Goal: Independence                                                                  |
| **Props**  | `{"location": "Philadelphia", "signers": 56, "primary_author": "Thomas Jefferson"}` |

#### Task: Coordinate with Continental Congress

| Field      | Value                                                                              |
| ---------- | ---------------------------------------------------------------------------------- |
| **ID**     | `task-coordinate-congress`                                                         |
| **Title**  | Coordinate Military Activities with Congress                                       |
| **Parent** | Milestone: Independence Declared                                                   |
| **Due At** | 1776-07-04                                                                         |
| **Props**  | `{"washington_location": "New York preparing defenses", "symbolic_support": true}` |

#### Document: Declaration of Independence

| Field      | Value                                                                             |
| ---------- | --------------------------------------------------------------------------------- |
| **ID**     | `doc-declaration`                                                                 |
| **Title**  | Declaration of Independence                                                       |
| **Parent** | Milestone: Independence Declared                                                  |
| **Props**  | `{"author": "Thomas Jefferson", "adopted": "1776-07-04", "signed": "1776-08-02"}` |

---

### Milestone 3.3: British Defeated at Yorktown

| Field      | Value                                                                              |
| ---------- | ---------------------------------------------------------------------------------- |
| **ID**     | `milestone-yorktown`                                                               |
| **Title**  | British Surrender at Yorktown                                                      |
| **Due At** | 1781-10-19                                                                         |
| **Parent** | Goal: Independence                                                                 |
| **Props**  | `{"british_surrendered": 7000, "cornwallis": true, "effectively_ended_war": true}` |

#### Plan 3.3.1: Yorktown Campaign

| Field      | Value                                                                                          |
| ---------- | ---------------------------------------------------------------------------------------------- |
| **ID**     | `plan-yorktown`                                                                                |
| **Name**   | Combined Franco-American Yorktown Campaign                                                     |
| **Parent** | Milestone: Yorktown                                                                            |
| **Props**  | `{"start_date": "1781-08-19", "end_date": "1781-10-19", "franco_american_coordination": true}` |

##### Sub-Plan: Strategic March to Virginia

| Field      | Value                                                                        |
| ---------- | ---------------------------------------------------------------------------- |
| **ID**     | `plan-march-virginia`                                                        |
| **Name**   | Strategic March from New York to Virginia                                    |
| **Parent** | Plan: Yorktown Campaign                                                      |
| **Props**  | `{"distance_miles": 600, "deception_used": true, "departure": "1781-08-19"}` |

###### Task: Execute Secret March

| Field      | Value                                                                  |
| ---------- | ---------------------------------------------------------------------- |
| **ID**     | `task-secret-march`                                                    |
| **Title**  | Execute Secret 600-Mile March to Virginia                              |
| **Parent** | Sub-Plan: March to Virginia                                            |
| **Due At** | 1781-09-28                                                             |
| **Props**  | `{"troops_american": 4000, "troops_french": 3000, "rochambeau": true}` |

###### Task: Coordinate Deception Operations

| Field      | Value                                                                |
| ---------- | -------------------------------------------------------------------- |
| **ID**     | `task-deception`                                                     |
| **Title**  | Execute Deception to Mask True Objective                             |
| **Parent** | Sub-Plan: March to Virginia                                          |
| **Due At** | 1781-08-25                                                           |
| **Props**  | `{"false_dispatches": "attack on New York", "clinton_fooled": true}` |

###### Sub-Milestone: Forces Arrive at Yorktown

| Field      | Value                                                 |
| ---------- | ----------------------------------------------------- |
| **ID**     | `milestone-forces-arrive`                             |
| **Title**  | Franco-American Forces Arrive at Yorktown             |
| **Parent** | Sub-Plan: March to Virginia                           |
| **Due At** | 1781-09-28                                            |
| **Props**  | `{"total_forces": 19000, "cornwallis_trapped": true}` |

##### Sub-Plan: Franco-American Naval Coordination

| Field      | Value                                                                                     |
| ---------- | ----------------------------------------------------------------------------------------- |
| **ID**     | `plan-naval-coordination`                                                                 |
| **Name**   | Coordination with French Fleet                                                            |
| **Parent** | Plan: Yorktown Campaign                                                                   |
| **Props**  | `{"admiral": "Comte de Grasse", "fleet_size": 28, "objective": "control Chesapeake Bay"}` |

###### Task: Synchronize with Admiral de Grasse

| Field      | Value                                                             |
| ---------- | ----------------------------------------------------------------- |
| **ID**     | `task-coordinate-degrasse`                                        |
| **Title**  | Synchronize Land Operations with French Fleet                     |
| **Parent** | Sub-Plan: Naval Coordination                                      |
| **Due At** | 1781-09-05                                                        |
| **Props**  | `{"communication_method": "messengers", "timing_critical": true}` |

###### Task: Secure Chesapeake Bay Control

| Field      | Value                                                                                 |
| ---------- | ------------------------------------------------------------------------------------- |
| **ID**     | `task-secure-chesapeake`                                                              |
| **Title**  | Ensure French Fleet Controls Chesapeake Bay                                           |
| **Parent** | Sub-Plan: Naval Coordination                                                          |
| **Due At** | 1781-09-05                                                                            |
| **Props**  | `{"battle_of_chesapeake": "1781-09-05", "british_fleet_commander": "Admiral Graves"}` |

###### Sub-Milestone: French Fleet Defeats British

| Field      | Value                                                                                 |
| ---------- | ------------------------------------------------------------------------------------- |
| **ID**     | `milestone-chesapeake-victory`                                                        |
| **Title**  | French Fleet Defeats British at Battle of Chesapeake                                  |
| **Parent** | Sub-Plan: Naval Coordination                                                          |
| **Due At** | 1781-09-05                                                                            |
| **Props**  | `{"british_retreat": true, "bay_controlled": true, "cornwallis_cannot_escape": true}` |

##### Sub-Plan: Siege Operations

| Field      | Value                                                                                                         |
| ---------- | ------------------------------------------------------------------------------------------------------------- |
| **ID**     | `plan-siege-operations`                                                                                       |
| **Name**   | Yorktown Siege Operations                                                                                     |
| **Parent** | Plan: Yorktown Campaign                                                                                       |
| **Props**  | `{"start_date": "1781-09-28", "end_date": "1781-10-19", "siege_method": "parallel trenches and bombardment"}` |

###### Task: Construct First Parallel

| Field      | Value                                                                              |
| ---------- | ---------------------------------------------------------------------------------- |
| **ID**     | `task-first-parallel`                                                              |
| **Title**  | Construct First Siege Parallel                                                     |
| **Parent** | Sub-Plan: Siege Operations                                                         |
| **Due At** | 1781-10-06                                                                         |
| **Props**  | `{"distance_from_enemy": "600 yards", "construction_method": "nighttime digging"}` |

###### Task: Begin Artillery Bombardment

| Field      | Value                                                              |
| ---------- | ------------------------------------------------------------------ |
| **ID**     | `task-bombardment`                                                 |
| **Title**  | Begin Artillery Bombardment of British Lines                       |
| **Parent** | Sub-Plan: Siege Operations                                         |
| **Due At** | 1781-10-09                                                         |
| **Props**  | `{"washington_fired_first": true, "continuous_bombardment": true}` |

###### Task: Construct Second Parallel

| Field      | Value                                                                  |
| ---------- | ---------------------------------------------------------------------- |
| **ID**     | `task-second-parallel`                                                 |
| **Title**  | Construct Second Siege Parallel                                        |
| **Parent** | Sub-Plan: Siege Operations                                             |
| **Due At** | 1781-10-11                                                             |
| **Props**  | `{"distance_from_enemy": "300 yards", "blocked_by_redoubts": [9, 10]}` |

###### Task: Assault Redoubts 9 and 10

| Field      | Value                                                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------------------------------------- |
| **ID**     | `task-assault-redoubts`                                                                                                   |
| **Title**  | Night Assault on British Redoubts 9 and 10                                                                                |
| **Parent** | Sub-Plan: Siege Operations                                                                                                |
| **Due At** | 1781-10-14                                                                                                                |
| **Props**  | `{"redoubt_10_commander": "Alexander Hamilton", "password": "Rochambeau", "bayonets_only": true, "duration_minutes": 10}` |

###### Task: Accept British Surrender

| Field      | Value                                                                                    |
| ---------- | ---------------------------------------------------------------------------------------- |
| **ID**     | `task-accept-surrender`                                                                  |
| **Title**  | Receive British Capitulation                                                             |
| **Parent** | Sub-Plan: Siege Operations                                                               |
| **Due At** | 1781-10-19                                                                               |
| **Props**  | `{"british_surrendered": 7000, "cornwallis_absent": true, "honors_of_war_denied": true}` |

###### Sub-Milestone: Redoubts Captured

| Field      | Value                                                               |
| ---------- | ------------------------------------------------------------------- |
| **ID**     | `milestone-redoubts-captured`                                       |
| **Title**  | British Redoubts 9 and 10 Captured                                  |
| **Parent** | Sub-Plan: Siege Operations                                          |
| **Due At** | 1781-10-14                                                          |
| **Props**  | `{"hamilton_heroism": true, "path_to_second_parallel_clear": true}` |

###### Sub-Milestone: British Request Parley

| Field      | Value                                                                        |
| ---------- | ---------------------------------------------------------------------------- |
| **ID**     | `milestone-parley-requested`                                                 |
| **Title**  | British Drummer Signals Request for Negotiations                             |
| **Parent** | Sub-Plan: Siege Operations                                                   |
| **Due At** | 1781-10-17                                                                   |
| **Props**  | `{"drummer_appeared": true, "white_flag": true, "negotiations_began": true}` |

#### Decision: March to Yorktown Instead of New York

| Field           | Value                                                                                                      |
| --------------- | ---------------------------------------------------------------------------------------------------------- |
| **ID**          | `decision-yorktown-march`                                                                                  |
| **Title**       | Decision to March South to Virginia                                                                        |
| **Parent**      | Milestone: Yorktown                                                                                        |
| **Decision At** | 1781-08-14                                                                                                 |
| **Rationale**   | De Grasse signaled fleet availability for Virginia; Cornwallis trapped; decisive victory possible          |
| **Props**       | `{"original_plan": "attack New York", "catalyst": "de Grasse message", "coordination_with": "Rochambeau"}` |

#### Risk: French Fleet Timing

| Field           | Value                                                                              |
| --------------- | ---------------------------------------------------------------------------------- |
| **ID**          | `risk-fleet-timing`                                                                |
| **Title**       | French Fleet Timing and Coordination                                               |
| **Parent**      | Milestone: Yorktown                                                                |
| **Probability** | 0.4                                                                                |
| **Impact**      | `critical`                                                                         |
| **State**       | `mitigated`                                                                        |
| **Props**       | `{"mitigation": "de Grasse arrived on schedule; Battle of Chesapeake successful"}` |

---

### Milestone 3.4: Treaty of Paris Signed

| Field      | Value                                                                                   |
| ---------- | --------------------------------------------------------------------------------------- |
| **ID**     | `milestone-treaty-paris`                                                                |
| **Title**  | Treaty of Paris Signed                                                                  |
| **Due At** | 1783-09-03                                                                              |
| **Parent** | Goal: Independence                                                                      |
| **Props**  | `{"negotiators": ["Franklin", "Adams", "Jay"], "territory": "Atlantic to Mississippi"}` |

#### Task: Support Diplomatic Negotiations

| Field      | Value                                                                                 |
| ---------- | ------------------------------------------------------------------------------------- |
| **ID**     | `task-support-diplomacy`                                                              |
| **Title**  | Maintain Army While Diplomats Negotiate Peace                                         |
| **Parent** | Milestone: Treaty of Paris                                                            |
| **Due At** | 1783-09-03                                                                            |
| **Props**  | `{"army_maintained": true, "no_major_operations": true, "pressure_on_britain": true}` |

#### Document: Treaty of Paris 1783

| Field      | Value                                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------ |
| **ID**     | `doc-treaty-paris`                                                                                           |
| **Title**  | Treaty of Paris 1783                                                                                         |
| **Parent** | Milestone: Treaty of Paris                                                                                   |
| **Props**  | `{"signed": "1783-09-03", "terms": ["independence recognized", "territorial boundaries", "fishing rights"]}` |

---

## GOAL 4: Establish Civilian Control of Military

| Field     | Value                                     |
| --------- | ----------------------------------------- |
| **ID**    | `goal-civilian-control`                   |
| **Name**  | Maintain Civilian Authority Over Military |
| **State** | `achieved`                                |

### Milestone 4.1: Newburgh Conspiracy Defused

| Field      | Value                                                                                                                |
| ---------- | -------------------------------------------------------------------------------------------------------------------- |
| **ID**     | `milestone-newburgh`                                                                                                 |
| **Title**  | Newburgh Conspiracy Defused                                                                                          |
| **Due At** | 1783-03-15                                                                                                           |
| **Parent** | Goal: Civilian Control                                                                                               |
| **Props**  | `{"location": "Newburgh, New York", "issue": "unpaid wages and pensions", "outcome": "officers supported Congress"}` |

#### Task: Address Officers Meeting

| Field      | Value                                                                                                                                    |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **ID**     | `task-newburgh-address`                                                                                                                  |
| **Title**  | Address Officers at Newburgh Meeting                                                                                                     |
| **Parent** | Milestone: Newburgh Conspiracy                                                                                                           |
| **Due At** | 1783-03-15                                                                                                                               |
| **Props**  | `{"spectacles_moment": true, "quote": "I have grown gray in your service and now find myself growing blind", "impact": "officers wept"}` |

#### Decision: Maintain Subordination to Congress

| Field           | Value                                                                                    |
| --------------- | ---------------------------------------------------------------------------------------- |
| **ID**          | `decision-subordination`                                                                 |
| **Title**       | Maintain Subordination to Congressional Authority                                        |
| **Parent**      | Milestone: Newburgh Conspiracy                                                           |
| **Decision At** | 1783-03-15                                                                               |
| **Rationale**   | Military coup would betray cause; precedent of civilian control essential for new nation |
| **Props**       | `{"officers_followed_lead": true, "mutiny_averted": true}`                               |

#### Risk: Officer Mutiny Threat

| Field           | Value                                                                |
| --------------- | -------------------------------------------------------------------- |
| **ID**          | `risk-mutiny`                                                        |
| **Title**       | Officer Mutiny and Potential Coup                                    |
| **Parent**      | Milestone: Newburgh Conspiracy                                       |
| **Probability** | 0.5                                                                  |
| **Impact**      | `critical`                                                           |
| **State**       | `mitigated`                                                          |
| **Props**       | `{"mitigation": "Washington's personal appeal and moral authority"}` |

---

### Milestone 4.2: Commission Returned to Congress

| Field      | Value                                                                                                                      |
| ---------- | -------------------------------------------------------------------------------------------------------------------------- |
| **ID**     | `milestone-resignation`                                                                                                    |
| **Title**  | Washington Resigns Commission                                                                                              |
| **Due At** | 1783-12-23                                                                                                                 |
| **Parent** | Goal: Civilian Control                                                                                                     |
| **Props**  | `{"location": "Annapolis, Maryland", "congress_president": "Thomas Mifflin", "precedent": "civilian control established"}` |

#### Task: Resign Military Commission

| Field      | Value                                                                                              |
| ---------- | -------------------------------------------------------------------------------------------------- |
| **ID**     | `task-resign-commission`                                                                           |
| **Title**  | Return Commission to Congress                                                                      |
| **Parent** | Milestone: Commission Returned                                                                     |
| **Due At** | 1783-12-23                                                                                         |
| **Props**  | `{"quote": "Having now finished the work assigned me, I retire from the great theatre of Action"}` |

#### Document: Resignation Address

| Field      | Value                                                                                                         |
| ---------- | ------------------------------------------------------------------------------------------------------------- |
| **ID**     | `doc-resignation-address`                                                                                     |
| **Title**  | Address to Congress Upon Resignation                                                                          |
| **Parent** | Milestone: Commission Returned                                                                                |
| **Props**  | `{"delivered": "1783-12-23", "significance": "established precedent of peaceful transfer of military power"}` |

---

## Metrics (onto_metrics)

### Metric: Continental Army Strength

| Field    | Value                           |
| -------- | ------------------------------- |
| **Name** | Continental Army Troop Strength |
| **Unit** | `soldiers`                      |

**Data Points:**

- 1775-07-03: 14,000 (Cambridge)
- 1776-08-22: 23,000 (New York, peak)
- 1776-12-01: 3,000 (Retreat through NJ - lowest)
- 1777-12-19: 12,000 (Valley Forge entry)
- 1778-06-19: 11,000 (Valley Forge exit)
- 1781-09-28: 8,800 (Yorktown)

### Metric: Enemy Prisoners Captured

| Field    | Value                              |
| -------- | ---------------------------------- |
| **Name** | British/Hessian Prisoners Captured |
| **Unit** | `prisoners`                        |

**Data Points:**

- 1776-12-26: 900 (Trenton)
- 1777-10-17: 5,900 (Saratoga)
- 1781-10-19: 7,000 (Yorktown)

---

## Graph Edge Summary

### Hierarchical Relationships (Parent → Child)

```
Project
├── has_goal → Goal 1: Preserve Army
│   ├── has_milestone → Milestone: Survived NY Campaign
│   │   ├── has_plan → Plan: Defense of NYC
│   │   │   ├── has_task → Task: Defend Long Island
│   │   │   ├── has_task → Task: Retreat Manhattan
│   │   │   └── has_task → Task: Evacuate to NJ
│   │   ├── has_decision → Decision: Abandon NYC
│   │   └── has_risk → Risk: Encirclement
│   ├── has_milestone → Milestone: Trenton Revival
│   │   ├── has_plan → Plan: Ten Crucial Days
│   │   │   ├── has_task → Task: Cross Delaware
│   │   │   ├── has_task → Task: Attack Trenton
│   │   │   └── has_task → Task: Attack Princeton
│   │   ├── has_decision → Decision: Cross Delaware
│   │   └── has_risk → Risk: Enlistment Expiry
│   └── has_milestone → Milestone: Valley Forge Reform
│       ├── has_plan → Plan: Valley Forge Encampment
│       │   ├── has_sub_plan → Sub-Plan: Camp Construction
│       │   │   └── has_task → Task: Build Huts
│       │   ├── has_sub_plan → Sub-Plan: Supply Reform
│       │   │   ├── has_task → Task: Appoint Greene
│       │   │   └── has_sub_milestone → Sub-Milestone: Supply Lines
│       │   └── has_sub_plan → Sub-Plan: Training Program
│       │       ├── has_task → Task: Model Company
│       │       ├── has_task → Task: Army Training
│       │       ├── has_sub_milestone → Sub-Milestone: Model Trained
│       │       └── has_sub_milestone → Sub-Milestone: Training Complete
│       ├── has_document → Document: Blue Book
│       ├── has_decision → Decision: Encamp Valley Forge
│       └── has_risk → Risk: Supply Shortages
... (continues for all goals)
```

### Cross-Cutting Relationships

```
Decision: Cross Delaware → led_to → Milestone: Trenton Revival
Milestone: Saratoga → enabled → Milestone: French Alliance
Document: French Treaty → enabled → Plan: Yorktown Campaign
Risk: Naval Superiority → mitigated_by → Milestone: French Alliance
Milestone: French Alliance → enabled → Sub-Milestone: Chesapeake Victory
```

---

## Implementation Notes

### Database Model

- Sub-Milestones are stored in `onto_milestones` with `parent_milestone` edge
- Sub-Plans are stored in `onto_plans` with `parent_plan` edge
- All parent-child relationships use `onto_edges`
- `project_id` on child tables is for RLS, not hierarchy

### Public Access

- `onto_projects.is_public = TRUE` for this project
- RLS policies allow read access to all child entities of public projects

### Graph Visualization

The deeply nested structure creates an impressive tree visualization:

- **Level 0**: Project (1 node)
- **Level 1**: Goals (4 nodes)
- **Level 2**: Milestones under goals (10+ nodes)
- **Level 3**: Plans under milestones + Sub-milestones (15+ nodes)
- **Level 4**: Sub-plans + Tasks under plans (30+ nodes)
- **Level 5**: Tasks under sub-plans + Sub-sub-milestones (40+ nodes)

Total: ~100+ nodes with rich interconnections
