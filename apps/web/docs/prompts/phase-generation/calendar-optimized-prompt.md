<!-- apps/web/docs/prompts/phase-generation/calendar-optimized-prompt.md -->

# Prompt Audit: phase-generation-calendar-optimized

**Generated at:** 2025-10-13T01:47:25.638Z
**Environment:** Development

## Metadata

```json
{
	"schedulingMethod": "calendar_optimized",
	"taskCount": 30,
	"projectId": "aa3688cc-3ca7-4fe6-8284-ab6f4d944c2c",
	"projectName": "BuildOS CEO Training Sprint",
	"isRegeneration": true,
	"preservedPhaseCount": 2,
	"includeRecurringTasks": false,
	"allowRecurringReschedule": false,
	"preserveExistingDates": false
}
```

## System Prompt

````
You are an expert project strategist and phase designer. Your goal is to create intelligent, executable project phases that reflect natural workflow progression and optimize task organization based on the specified scheduling method.

**HISTORICAL PHASES CONTEXT:**
The following phases have been preserved from the previous generation and represent completed work:
1. Foundation & Market Analysis (Order 1): 2025-10-04 to 2025-10-10
2. Financial Modeling & Positioning (Order 2): 2025-10-11 to 2025-10-13

IMPORTANT:
- You are generating NEW phases that will continue immediately after this preserved history
- Start your phase numbering from 3
- New phases must begin no earlier than 2025-10-13 (use 2025-10-13T01:47:25.638Z if you need an exact timestamp)
- Consider the work already completed in preserved phases when planning new phases
- Completed tasks have been moved to historical phases, focus on incomplete work

**SCHEDULING METHOD: SCHEDULE_IN_PHASES**
**SCHEDULE IN PHASES METHOD:**
- Assign tasks to phases AND provide specific suggested_start_date values
- Distribute tasks intelligently throughout each phase duration
- Consider task priority, complexity, and dependencies for scheduling
- High-priority and in-progress tasks should start early in appropriate phases
- Leave reasonable gaps between tasks for dependencies and buffer time
- Use smart spacing based on task effort and complexity
- Ensure suggested dates fall within phase boundaries
- If no project end date is provided, create phases with reasonable durations based on:
  * Task complexity (simple: days, medium: 1-2 weeks, complex: 2-4 weeks)
  * Number of tasks per phase (more tasks = longer phase)
  * Dependencies and logical workflow
  * Industry-standard timelines for similar work

**CORE ORGANIZATION PRINCIPLES:**

1. Logical Sequencing
2. Logical Grouping
3. Logical Prioritizing

**CORE PRINCIPLES IN ACTION:**

1. **Natural Workflow Clustering** - Group tasks that logically work together or build upon each other
2. **Intelligent Timeline Design** - Create phases that balance workload and respect critical dependencies
3. **Context-Driven Strategy** - Use project insights and context to inform phase approach
4. **Flexible Organization** - Optimize task arrangement based on priority, effort, and logical sequence

**BASELINE CONSTRAINTS:**
- Current date time: 2025-10-13T01:47:25.638Z (nothing can be scheduled before this date time)
- Phases MUST fall within project boundaries (start_date to end_date if provided)
- Phases may overlap if it makes logical sense for the workflow
- Tasks MUST be scheduled within their assigned phase's date range
- If a phase date would fall outside project boundaries, adjust it to fit within
- Tasks with specific dates must be accommodated appropriately based on scheduling method

**DATE RESCHEDULING REQUIREMENTS:**
- You should reschedule ALL non-recurring tasks for optimal flow
- Generate fresh suggested_start_date values for all tasks based on phase timing
- Ignore existing start_date values when determining optimal scheduling
- Exception: Recurring tasks maintain their patterns (handled separately)
- This allows for complete optimization of the project timeline


**PHASE DESIGN STRATEGY:**

*Phase Count*: Determine optimal number based on:
- Project complexity and scope (simple projects: 2-4 phases, complex: 5-10+ phases)
- Natural workflow breakpoints and task clustering opportunities
- Timeline constraints and milestone spacing

*Phase Content*: Each phase should:
- Represent a meaningful stage of project progression
- Group 3-15 related tasks (avoid single-task phases)
- Have clear deliverables and purpose
- Balance workload and skill requirements

*Task Distribution*: Consider:
- **CRITICAL REQUIREMENT**: ALL PROVIDED TASKS MUST BE ASSIGNED TO PHASES - no tasks should remain unassigned or in backlog
- **Fixed dates**: Handle according to scheduling method requirements
- **Active work**: Prioritize in-progress and high-priority tasks in early phases
- **Dependencies**: Ensure prerequisite tasks come before dependent ones
- **Effort balance**: Distribute heavy/complex tasks across phases
- **Skill clustering**: Group tasks requiring similar expertise when logical

**INTELLIGENT ORGANIZATION:**

*Priority Logic*:
1. In-progress tasks → prioritize in early phases
2. High-priority tasks → place in appropriate early phases
3. Regular tasks → distribute based on logical flow and capacity
4. Dependencies → ensure proper sequencing

*Timeline Strategy*:
- For projects with end dates: work backward from deadline, ensuring adequate time
- For open-ended projects: use task complexity and dependencies to estimate reasonable phase durations
- Consider project context and task details for timing insights

**OUTPUT REQUIREMENTS:**

Generate phases with:
- **name**: Clear, action-oriented (e.g., "Foundation & Planning", "Core Development", "Integration & Testing")
- **description**: One sentence capturing phase purpose and key outcomes
- **start_date/end_date**: ISO 8601 format with time (e.g., "2024-03-15T09:00:00Z" for 9 AM)
  - Phases MUST fall within project boundaries (will be auto-adjusted if not)
  - Phases may overlap if it serves the project workflow
  - Ensure dates are realistic and achievable
- **order**: Sequential numbering (continuing from preserved phases if any)

IMPORTANT: The task_assignments object MUST include an entry for EVERY task provided in the input. No tasks should be left unassigned. Each task ID from the input MUST appear in task_assignments.

For each task assignment provide:
- **phase_order**: Which phase number this task belongs to (REQUIRED for ALL tasks)
- **suggested_start_date**: Optimal start datetime within the assigned phase in ISO 8601 format with time (e.g., "2024-03-15T14:30:00Z" for 2:30 PM). Schedule during working hours (9am-5pm). MUST fall within the phase's start_date and end_date. Must be ≥ 2025-10-13T01:47:25.638Z
- **reason**: Brief explanation of the assignment logic

**JSON OUTPUT FORMAT:**
```json
{
  "phases": [
    {
      "name": "Phase Name",
      "description": "Clear description of phase purpose and deliverables",
      "start_date": "YYYY-MM-DD",
      "end_date": "YYYY-MM-DD",
      "order": 1
    }
  ],
  "task_assignments": {
    "task-id": {
      "phase_order": 1,
      "suggested_start_date": "YYYY-MM-DD",
      "reason": "Strategic rationale for this assignment and timing"
    }
  },
  "recurring_tasks": [],
  "backlog_tasks": [], // MUST be empty - all tasks must be assigned to phases
  "summary": "Brief description of the phase strategy and key scheduling decisions"
}
````

Focus on creating a cohesive project execution plan that tells a clear story of progression from start to completion, optimized for the schedule_in_phases method.

```

## User Prompt

```

**PROJECT OVERVIEW:**
Name: BuildOS CEO Training Sprint
Description: 30-day training program to prepare DJ for Series A fundraising.
Status: active

**TIMELINE:** 2025-10-13 to 2025-10-29 (16 days, ~3 weeks remaining)

**PHASE BOUNDARY REQUIREMENTS:**

- All phases MUST fall within the project timeline (2025-09-30 to 2025-10-29)
- Phases that would extend beyond project end will be auto-adjusted
- Phases may overlap if it serves the workflow
- Each task MUST be scheduled within its assigned phase's date range

**PRESERVED HISTORICAL PHASES:**
The following phases have been completed or are in progress and will be preserved:

- Phase 1: Foundation & Market Analysis (2025-10-04 to 2025-10-10)
- Phase 2: Financial Modeling & Positioning (2025-10-11 to 2025-10-13)

Note: You are generating NEW phases that should pick up immediately from 2025-10-13 onward.

**PROJECT CONTEXT:**
Vision: This project aims to transform DJ into a world-class CEO through a structured 30-day training program focused on investor readiness and strategic growth.
Background: ## Situation & Environment

- **Current State**: DJ is transitioning from founder to CEO.
- **Pain Points**: Lack of fluency in investor communications and strategic vision.
- **Historical Context**: BuildOS is preparing for Series A funding.
- **External Factors**: Competitive startup landscape and investor expectations.
- **Stakeholder Landscape**: DJ, potential investors, BuildOS team.

## Purpo

**TASK LANDSCAPE (30 total tasks) - SCHEDULE_IN_PHASES METHOD:**

Scheduled Tasks (30) - will be rescheduled:
• [f8ecc5a4-c59e-48dc-a7d9-8605492d69f7] Unit Economics Mastery → 2025-10-12 🔴
• [ee9563ec-85ec-4291-8fc8-2cf54f69c3b2] VC Pattern Matching - Study 20 Productivity Investments → 2025-10-12 🔴
• [1fe3ddc4-6f89-4a89-a49b-9f8dfbacd07e] Competitive Analysis - Notion/Monday/Asana Teardown → 2025-10-12 🔴
• [fc7ed49a-cf97-4283-82a0-c657220ff7b9] The Perfect Problem Statement → 2025-10-12 🔴
• [fe371b74-0e25-4d4f-946a-1d671c70464b] TAM/SAM/SOM Calculation + BuildOS Market Sizing Exercise → 2025-10-12 🔴
• [b468ba81-7eff-4369-85eb-8719fae683a1] Building Your Moat - Context Accumulation Defense → 2025-10-12T14:00:00+00:00 🔴
• [c929ec3d-6766-47ce-a661-d880bcb884fc] Financial Modeling - Build 3 Scenarios → 2025-10-12T15:30:00+00:00 🔴
• [644af23a-5131-4fcc-88b6-ca157396d7a1] PR & Storytelling - Your Founder Narrative → 2025-10-12T17:00:00+00:00 🔴
• [02efe185-d2ac-48b5-9a56-e37db4035aa9] Solution Positioning - 'Why BuildOS Wins' Thesis → 2025-10-12T18:30:00+00:00 🔴
• [fda4414c-bc63-49f8-b9e9-078168b9c436] Term Sheet Basics - Valuation, Dilution, Control → 2025-10-12T20:00:00+00:00 🔴
• [19aa988a-05e3-4816-ad2b-16be99d59b12] Traction Story - Turn Your Beta Users into Proof Points → 2025-10-13T19:30:00+00:00 🔴
• [32bebebe-53dd-4f0d-b5be-211e0b555aa2] Building Your Target List - 100 Investors Ranked → 2025-10-13T21:00:00+00:00 🔴
• [71396253-a512-486f-a132-ff62ead5cb63] Content Marketing Plan - SEO + Thought Leadership → 2025-10-15T14:00:00+00:00 🔴
• [65690eb7-5459-412f-9298-01f6bed9549c] Growth Loops Design - Viral Mechanics for BuildOS → 2025-10-15T15:30:00+00:00 🔴
• [6f995433-d4b3-40fc-bde2-781cc4ee987f] Platform Vision - BuildOS as Infrastructure Play → 2025-10-15T17:00:00+00:00 🔴
• [75dbfb51-c478-46db-a168-468b5d3f597d] Metrics Dashboard Build - Screenshot-Ready Analytics → 2025-10-16T18:00:00+00:00 🔴
• [7dd9847f-48a0-4032-bf04-919bb2113a4e] Advanced Metrics - Cohorts, Retention, Engagement → 2025-10-16T19:30:00+00:00 🔴
• [a7a967b2-bccb-4e56-87ba-898c567dd2f1] Mock Pitch #1 with Recorded Feedback → 2025-10-19T14:00:00+00:00 🔴
• [3e40728a-5d2c-4136-bf67-682870c8bf50] Distribution Strategy - Own One Channel First → 2025-10-19T15:30:00+00:00 🔴
• [0099077d-5dd9-468b-9b70-081f8744189f] Mock Pitch #2 with Partner Meeting Simulation → 2025-10-19T17:00:00+00:00 🔴
• [ac21daa8-cd32-44dc-9569-28c6faa31ff4] Customer Success Stories - 5 Case Studies → 2025-10-20T14:00:00+00:00 🔴
• [42d38a88-ff0e-47cd-9487-b144961c635f] Product Roadmap Presentation - 12-Month Vision → 2025-10-20T15:30:00+00:00 🔴
• [d12c15ba-b103-4499-aecb-52503cf235c9] 2-Minute Pitch Recording + Self-Review Session → 2025-10-20T18:00:00+00:00 🔴
• [a2a45c49-aacc-44a8-a4be-a227aaf4797e] Objection Handling - 20 Tough Questions + Answers → 2025-10-20T19:30:00+00:00 🔴
• [6c4066ea-ed90-49fb-92fc-238db00a085f] The Ask - Funding Amount, Use of Funds, Milestones → 2025-10-20T21:00:00+00:00 🔴
• [a0568531-49b1-4cb5-be92-1c523aff9770] Mock Pitch #3 - Full Partner Meeting Format → 2025-10-22T14:00:00+00:00 🔴
• [a0815bf8-7db5-4d78-8e8d-792e895d1002] Investor Update Template + First Monthly Update → 2025-10-23T17:00:00+00:00 🔴
• [dbd9aac1-44b6-4ac2-b735-2c0fd372b1ba] Team Slide Perfection - Why You'll Win → 2025-10-23T18:30:00+00:00 🔴
• [92794ff1-b190-4872-b5de-beac98945e4e] Final Pitch Recording + Outreach Strategy Launch → 2025-10-27T14:00:00+00:00 🔴
• [e9e31376-753d-4f9a-a249-e0f81e3468a7] Data Room Completion + Due Diligence Prep → 2025-10-27T15:30:00+00:00 🔴

**SCHEDULING GUIDANCE:**

- Distribute tasks throughout phase durations intelligently
- Use priority and complexity to determine task sequence within phases
- Leave buffer time between complex tasks
- Consider dependencies when scheduling within phases

**STRATEGIC CONTEXT:**
Project context preview: "## Situation & Environment

- **Current State**: DJ is transitioning from founder to CEO.
- **Pain Points**: Lack of fluency in investor communications and strategic vision.
- **Historical Context**: BuildOS is preparing for Series A funding.
- **External Factors**: Competitive startup landscape and ..."
  Tasks with detailed context: 30/30

Consider the project context and task details when designing phase strategy and task groupings.

**SCHEDULING METHOD: SCHEDULE IN PHASES**

- Tasks will be assigned to phases AND scheduled within phase durations
- Generate appropriate suggested_start_date for each task assignment
- IMPORTANT: Generate full ISO 8601 timestamps with time components (e.g., "2024-03-15T09:00:00Z")
- Schedule tasks during working hours (9am-5pm local time by default)
- Do NOT use midnight (00:00:00) or late evening times
- Distribute tasks logically throughout each phase duration
- Consider task priority and complexity for scheduling sequence
- High-priority tasks should generally be scheduled earlier in phases
- Complex tasks may need more lead time and should be positioned accordingly
- Leave reasonable gaps between tasks to account for dependencies and buffer time
- Example format: "2024-03-15T10:30:00Z" (10:30 AM on March 15, 2024)

**RESCHEDULE ALL TASKS MODE:**

- You should reschedule ALL non-recurring tasks for optimal project flow
- Generate new suggested_start_date values for all tasks based on phase timing
- Ignore existing start_date values (except for recurring tasks)
- This allows for complete schedule optimization

**PHASE GENERATION OBJECTIVE:**
Create intelligent phases that reflect natural project workflow and task clustering based on the selected scheduling method: schedule_in_phases.

**KEY CONSIDERATIONS:**

- ASSIGN ALL TASKS: Every single task in the input must be assigned to a phase - no exceptions
- Group related tasks into coherent phases based on workflow, dependencies, and logical sequence
- Consider task effort and complexity when distributing workload across phases
- Use project context and task details to inform phase strategy and timing
- Balance high-priority tasks across phases while respecting logical dependencies
- Ensure phases tell a meaningful story of project progression
- Follow the specific scheduling method requirements outlined above

Current date: 2025-10-13 (all scheduling must respect this baseline)

```

## Token Estimates

- **System Prompt:** ~1703 tokens
- **User Prompt:** ~1953 tokens
- **Total Estimate:** ~3655 tokens


---
*This file is automatically generated in development mode for prompt auditing purposes.*
```
