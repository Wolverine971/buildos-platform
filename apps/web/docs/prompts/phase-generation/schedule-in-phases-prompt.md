<!-- apps/web/docs/prompts/phase-generation/schedule-in-phases-prompt.md -->

# Prompt Audit: phase-generation-schedule-in-phases

**Generated at:** 2025-10-13T01:49:40.022Z
**Environment:** Development

## Metadata

```json
{
	"schedulingMethod": "schedule_in_phases",
	"taskCount": 148,
	"projectId": "795ef317-aaae-4365-957d-ec443b11c83b",
	"projectName": "BuildOS",
	"isRegeneration": true,
	"preservedPhaseCount": 5,
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
1. Create MVP (Order 1): 2025-06-09 to 2025-06-29
2. Beta test (Order 2): 2025-06-30 to 2025-07-07
3. Acceleratee (Order 3): 2025-07-19 to 2025-08-21
4. Beta Testing and Feedback (Order 4): 2025-08-23 to 2025-09-15
5. Final Adjustments and Launch (Order 5): 2025-09-16 to 2025-09-16

IMPORTANT:
- You are generating NEW phases that will continue immediately after this preserved history
- Start your phase numbering from 6
- New phases must begin no earlier than 2025-10-13 (use 2025-10-13T01:49:40.022Z if you need an exact timestamp)
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
- Current date time: 2025-10-13T01:49:40.022Z (nothing can be scheduled before this date time)
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
- **suggested_start_date**: Optimal start datetime within the assigned phase in ISO 8601 format with time (e.g., "2024-03-15T14:30:00Z" for 2:30 PM). Schedule during working hours (9am-5pm). MUST fall within the phase's start_date and end_date. Must be ≥ 2025-10-13T01:49:40.022Z
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
Name: BuildOS
Description: A personal operating system designed to optimize how humans think, organize thoughts, manage tasks, and measure progress. It aims to minimize cognitive load by structuring information effectively.
Status: active

**TIMELINE:** 2025-10-13 to 2025-11-30 (48 days, ~7 weeks remaining)

**PHASE BOUNDARY REQUIREMENTS:**

- All phases MUST fall within the project timeline (2025-06-06 to 2025-11-30)
- Phases that would extend beyond project end will be auto-adjusted
- Phases may overlap if it serves the workflow
- Each task MUST be scheduled within its assigned phase's date range

**PRESERVED HISTORICAL PHASES:**
The following phases have been completed or are in progress and will be preserved:

- Phase 1: Create MVP (2025-06-09 to 2025-06-29)
- Phase 2: Beta test (2025-06-30 to 2025-07-07)
- Phase 3: Acceleratee (2025-07-19 to 2025-08-21)
- Phase 4: Beta Testing and Feedback (2025-08-23 to 2025-09-15)
- Phase 5: Final Adjustments and Launch (2025-09-16 to 2025-09-16)

Note: You are generating NEW phases that should pick up immediately from 2025-10-13 onward.

**PROJECT CONTEXT:**
Vision: The context has been updated to reflect a strategic change in the sequence of guide releases, prioritizing individuals with ADHD first, followed by Tech Project Managers, Writers, and High School Students. This adjustment aligns with the platform's origins and primary user needs, integrating the authorship strategy with existing War Room, onboarding, and marketing efforts.
Background: ## BuildOS Context Document

### 1. Situation & Environment

- **Current State**
  BuildOS is in active beta, preparing for a public launch. The platform converts unstructured brain dumps into organized projects with actionable next steps through AI-powered conversation.

- **Pain Points**
    - Scattered thoughts across multiple apps (Notion, Obsidian, Google Docs, etc.).
    - Repeating context to

**TASK LANDSCAPE (148 total tasks) - SCHEDULE_IN_PHASES METHOD:**

Scheduled Tasks (68) - will be rescheduled:
• [4e0d7dfb-cce7-4933-8728-c8bf50c872f2] Perform Comprehensive Regression Testing → 2025-10-12 🔴
• [4d9f8df2-953f-48fa-8cbd-fe72b6480375] Create worker queue for buildos → 2025-10-12
• [52226587-b3db-456c-b345-cf152e842e61] Demo prep → 2025-10-12
• [e78b3139-7258-41cd-86a1-1203a6b28af7] Add auto-save feature to Braindump page → 2025-10-12
• [33a5b9bc-cc01-48fc-9286-edf0c9df411c] Buildos Dev Demo → 2025-10-12
• [56a4e75d-96f4-468e-9e87-93272cc53b1e] Get email client for emails → 2025-10-12 🔴
• [fefdff1c-c0e9-4769-8c47-9e3bf332aee1] Remove outdated status column → 2025-10-12
• [60d3ff71-548f-40c5-b3d8-0adcb4aee819] Get Zach google email → 2025-10-12
• [e804e0c5-93f2-444a-a51b-44301571b359] Launch beta testing → 2025-10-12
• [41a6abc5-6a5d-4dd0-82e0-2b807bea33a1] bug- TASKS are creating duplicates when moving them around → 2025-10-12
• [d0d523df-2a0c-4b4a-845e-69ec688f5f2c] Dynamic Project Context Generation → 2025-10-12
• [8259b78f-faf3-4b49-961a-7845249b6d83] Add DKIM to Squarespace DNS → 2025-10-12
• [6e9036f8-c0ca-4aeb-8201-bbbc728f1f73] Retest Registration Flow & Onboarding Integration → 2025-10-12
• [8fbabcc9-e14f-4237-8020-4343cab89d89] Implement transcription streaming → 2025-10-12
• [3bff365b-3d47-4876-915c-7d42157e30c3] LLM Create Dynamic Project Brief Template → 2025-10-12
• [1efef626-ad79-4081-870c-f35dba0ab5ec] Implement settings for brief reception time → 2025-10-12
• [c2f1563f-60e7-43d2-b33e-b9167734f1f9] Finalize Roadmap → 2025-10-12 🔴
• [76738f08-3746-463c-8491-50016cb150d4] Repurpose Railway App → 2025-10-12
• [e2d1774e-23a8-4f16-a9f6-c99238082ebc] Fix Synthesis Process → 2025-10-12 🔴
• [7d2d1ad1-a4e2-45eb-a4c7-bb0e18d86fb5] Twitter thread → 2025-10-12
• [20c1aa34-d8f6-4e64-98ff-26aa23b4c27f] Conduct Initial User Research → 2025-10-12 🔴
• [0bff3c4d-bf35-4783-bfd3-f0c7b455ee23] Check Zach's Email Setup → 2025-10-12
• [61aa437c-d3f6-4dde-ba53-743aa86f7551] Send Emails to Beta Users → 2025-10-12 🔴
• [60fa050f-ca87-4669-a7ab-a9fd27d1abee] Sign Zach Up for GitHub → 2025-10-12
• [75217ec4-40ed-4fe1-abcd-c44b5609e2e5] Review Instagram Ads → 2025-10-12
• [e20aa294-1275-41a1-9e4e-7866822a0570] Test all features on Build OS → 2025-10-12
• [b8e6fba3-290a-47d2-9de1-ce0991563f61] Task sorting → 2025-10-12
• [b19f47f3-bb80-463e-8d56-24bf5a69a7fe] Demo briefing with participants @2 → 2025-10-12
• [0c73a2ee-c747-493c-b763-a27b81e0be87] Fix synthesizing of projects → 2025-10-12 🔴
• [b1caa998-4b90-4fc7-9262-017cc8f2401b] Consolidated Onboarding Process & Feedback Integration → 2025-10-12 🔴
• [c0a4e3fc-f755-4abe-856f-a0d046c5fea2] Upgrade Styles for Build-OS → 2025-10-12
• [eec11dff-ee8b-4f53-913c-365ee4f5cb0f] Test BuildLS context updates → 2025-10-12
• [196ea9fa-a388-42a1-9bd1-972d8c046a91] Update data model + APIs for reordering → 2025-10-12 🔴
• [3ae05299-1373-44b8-839e-22a619c68054] Define metrics and rollout plan → 2025-10-12
• [5678bf3f-f561-4337-83be-beabd282aaf2] Implement 'focus for the day' data model & UI → 2025-10-12 🔴
• [84c16256-24e6-473d-8052-f2198c332d97] Build notification center for to-do list reminders → 2025-10-12
• [bfb2d116-70c3-491c-bbdc-ba14ee342f49] Restructure project architecture → 2025-10-12 🔴
• [955867a7-e848-45e1-98db-30246b764ff6] Create Twitter post templates and layout → 2025-10-12 🔴
• [47c73c77-c543-48b7-aef9-b81cf144afda] Define default signup project schema → 2025-10-12 🔴
• [d6622f87-a5c2-414a-aaac-4db6b259c255] Reach out to Tim Hissa → 2025-10-12
• [9ef29ef9-cb11-419e-9c21-60a31be6cfb6] Reach out to Carl and EZ → 2025-10-12
• [7b971fff-2170-439e-9d40-34f5c6ac69ac] Create detailed BuildOS guide for people with ADHD → 2025-10-12 🔴
• [45130838-0b71-48a7-b45e-23e1dad915e3] Create detailed BuildOS guides for Developers → 2025-10-12 🔴 ▶️
• [b2a55e12-e2f1-43d2-97f6-b71462674941] Message Tim → 2025-10-12
• [8b15b1cf-9304-4546-a41a-be53c07e25c4] Create detailed BuildOS guides for Writers → 2025-10-12 🔴
• [410e3bbb-0447-4984-936a-27e65bc969b0] Create detailed BuildOS guides for Tech Project Managers → 2025-10-12 🔴
• [95ebf5f0-c7d7-4d81-b494-4e0775fdd1eb] Retest everything in BuildOS for stabilization → 2025-10-12 🔴
• [84cffc7e-3d51-49a1-81bc-9e1d1222e757] Finish pitch deck for investor Tim Hissa → 2025-10-12 🔴
• [60c3505e-beff-4fae-b3b5-1a693e811509] Clean up lingo on public pages → 2025-10-12 🔴
• [8c3edfc7-87ad-4ca6-a615-d98dee4f9be0] Link tasks back to original Braindump → 2025-10-12
• [cea2e9d2-3e2c-4f68-803b-5d06b05f1942] Enhance Blog Content with Productivity and Psychological Insights → 2025-10-12
• [394df517-9861-401f-a05e-b9c69be847ea] Content- Create 'Ruthless Prioritization Mode' Blog Post → 2025-10-12
• [a71adda5-f4bb-4b9e-b572-f75e0caf3b98] Update public page lingo for ADHD users and AI-first focus → 2025-10-12 🔴
• [2eccf375-7069-48ad-a3ee-a4589fe550b4] Track expenditure → 2025-10-12
• [2b6e9aa2-d81b-45f8-a393-331c62b9b44f] Conduct user testing for new features → 2025-10-12
• [11e05693-6499-4dd1-9f2e-7f3b0eaa63f0] Integrate DeepGram for Audio Transcription → 2025-10-12
• [0c0db777-d8ed-4dd8-b787-8bba8c9bd4a6] Implement profile setting for public username → 2025-10-12
• [e0c6d258-3e83-479a-8e1b-938679185c43] Move generate phases to Q system → 2025-10-12
• [fe973fcc-3438-4cf8-85df-7b6269ebee2c] Collaborate with Zack on reactivation emails → 2025-10-12 ▶️
• [42a7799e-bc72-4e28-8a81-0c7ec2f00188] Prepare for Product Hunt launch → 2025-10-12 🔴
• [e73d7f33-f2a9-40f7-90e5-a874074a291e] Fix project synthesis part → 2025-10-12
• [2b0fdb89-50c0-4d1b-be5e-bf56f9e90ab6] Task evaluation → 2025-10-12
• [4df7e2a2-2ed6-4586-9a2c-8c44c014a7f1] Comprehensive Security Enhancements for BuildOS → 2025-10-12 🔴
• [cb7a3438-d112-4ffb-8167-e161dfcdd823] Develop Education Hub for BuildOS → 2025-10-12 🔴 ▶️
• [b976c390-ba5f-4656-bcde-3aebf1989988] Finish Project War Room feature → 2025-10-12 🔴 ▶️
• [45eabf4e-9f89-4a73-9b7b-e9c8d93ac026] Start work on 'No More Game' for War Room feature → 2025-10-12 🔴
• [9cbdc79f-fec8-46f6-9c65-75b6b608081a] Integrate Stripe Payment System → 2025-10-12 🔴
• [27dd2557-0b89-469c-b7ee-dd8383deece0] Produce TikToks showing voice-to-organization → 2025-10-15T13:00:00+00:00 🔴

Active Work (37) - Should be prioritized in early phases:
• [012f68c0-637b-4854-8c9d-08b91981d8b5] Comprehensive Google Calendar Integration 🔴HIGH-PRIORITY
• [0e9b6f42-1c86-48ee-bbb3-899230a2c152] Develop History Component for Brain Dumps 🔴HIGH-PRIORITY
• [99d4c1ff-597d-42e4-8321-d0ef0c357437] Fix Recurring Tasks Issue 🔴HIGH-PRIORITY
• [08ef4a07-5bf2-4d29-9301-c711e716ad8f] Draft New User Personas 🔴HIGH-PRIORITY
• [6d4b4ab5-1766-41fc-9a9e-7ea6c3d93b72] Update daily briefs to show relevant task information 🔴HIGH-PRIORITY
• [9bd0bb26-b1c5-472a-9075-ab6d128162d9] Validate LLM Error Processing 🔴HIGH-PRIORITY
• [75cece49-c9c3-4f5d-84b7-5cafa6bf147b] Consolidated AI Context Engineering Workshop & Materials 🔴HIGH-PRIORITY
• [8f958ea3-62e5-486c-9f34-264e95b21af7] Integrate Elite knowledge update feature 🔴HIGH-PRIORITY
• [87514575-d257-478b-8913-a4ed8e239ca3] Develop frontend search UI 🔴HIGH-PRIORITY
• [a4ba6ac4-6fc3-4128-8677-f0c6854a7ed3] Create basic chat interface for LLM 🔴HIGH-PRIORITY
• [69f0cd18-24e4-4a60-9ba1-b7ada89fc8ea] Implement Project-Specific Calendar Integration 🔴HIGH-PRIORITY
• [f8a79b74-1119-4ea4-84ce-eb5b8a0f3f99] Ensure Fridge Actions Work with Face Calendar Actions 🔴HIGH-PRIORITY
• [e2334abe-64ab-4505-bb1c-fcff898c8e63] Create Twitter visual brand guidelines for BuildOS 🔴HIGH-PRIORITY
• [c83b0992-9917-4248-82a7-ab0e62658d5c] Design Twitter iconography/assets for BuildOS 🔴HIGH-PRIORITY
• [e44c19c5-9c20-4da7-9f13-4f626662689b] Create Project Context Document 🔴HIGH-PRIORITY
• [92816db3-9320-411d-aa4b-ca54bba70137] Define color palette and typography for Twitter posts 🔴HIGH-PRIORITY
• [59b1afaa-51a5-4a0e-8d05-adf5cadd2b7c] Reach out to friends for BuildOS testing 🔴HIGH-PRIORITY
• [ff307952-abf8-44d5-980a-2bae17087510] Implement signup hook to attach default project 🔴HIGH-PRIORITY
• [fd336d72-3fcf-43c8-bbc4-022e4f074437] Define success metrics for default project feature 🔴HIGH-PRIORITY
• [4edf971f-f32c-4684-bc8b-0d694a82548b] Create detailed BuildOS guide for people with ADHD 🔴HIGH-PRIORITY
• [72909876-7342-4945-88eb-da1c46fa0c57] Clarify top priorities for ruthless prioritization mode 🔴HIGH-PRIORITY
• [5a35bb94-7995-4b4f-8298-bb9b65531dca] Implement ruthless prioritization mode to identify and execute high-impact tasks 🔴HIGH-PRIORITY
• [0b29c8bd-d9d4-45f9-8bb7-8ba86f0eb162] Create detailed BuildOS guides for High Schoolers 🔴HIGH-PRIORITY
• [2b37e613-304c-43f0-b978-711b92a3dc21] Create 'I Did a Thing' Log Bar 🔴HIGH-PRIORITY
• [a090441a-1ec0-4f6c-aa4a-5b37bfec3a38] Implement Default Live Project for New Users 🔴HIGH-PRIORITY
• [bffeb53b-66ce-4200-a76f-864e073db3d8] Develop Project Frameworks Based on Enneagram 🔴HIGH-PRIORITY
• [e4468da6-75d9-4ef6-bbb8-676a8e4866c8] Review Feature Friction Against Golden Rule 🔴HIGH-PRIORITY
• [dcf1f18a-6253-4c6c-9347-154b5183e4c1] Hook up email for daily briefs 🔴HIGH-PRIORITY
• [b8723fbd-b2c8-46fc-87d4-9f664124b35e] Create audience-specific landing pages 🔴HIGH-PRIORITY
• [4f697b5d-fbbf-4ad6-b371-a81d347e2db6] Finish Project War Room feature 🔴HIGH-PRIORITY
• [e23e237c-56b4-4101-98f5-d12a6ce1db37] Create project completion functionality 🔴HIGH-PRIORITY
• [7aa0d3fb-4dd2-4f66-a5c9-2401ea3e3007] Finish Project War Room Feature Spec ▶️IN-PROGRESS 🔴HIGH-PRIORITY
• [8b2ddd2f-c99c-43ce-88a9-f0a7c0b3870c] Optimize task/project synthesis ▶️IN-PROGRESS
• [9df97d63-b0db-4260-aef6-e5c6a25ae262] Build Project War Room Feature 🔴HIGH-PRIORITY
• [9085c4a4-f023-4610-a822-300d5db3ec9b] Finish Spec for Project War Room Feature ▶️IN-PROGRESS 🔴HIGH-PRIORITY
• [d28aa9fc-5f37-4202-996e-87493909540b] Adjust Strategy for Project War Room Feature 🔴HIGH-PRIORITY
• [5748f428-2f64-439d-8029-a22e1b09086a] Start work on 'No More Game' for War Room feature 🔴HIGH-PRIORITY

Flexible Tasks (43) - Can be strategically organized:
one_off (43): [71175658-9121-49c7-83a5-2de5601d52e2] Create a blog about BuildOS, [397d6da5-deb7-421e-9fde-07b4042ea4e4] Call Dave Spencer, [74dd6f91-2550-446f-a32b-3bf577bc9ac7] Implement User Feedback Adjustments, [adc60f51-3e52-460d-a16c-7bc5bba0eda7] Add notification for recording start on brain dump page, [29897200-c237-4ce8-b19a-1769856e05f8] Draft 'How to Brain Dump Effectively' Blog Post, [d4ba1ebc-8c62-45b9-bf8e-d731d3c786d8] Add admin notifications for beta users and feedback, [dde399df-0c06-4dd5-9155-acd56f612320] Fix user onboarding process, [103bd1af-974a-41bd-88d2-f87cb374b61f] Define task synthesis system requirements, [d4656eaf-fb62-459a-8367-55e4e857797c] Integrated Google Calendar Functionality, [1fcf6ca6-57e8-410b-bb24-aaa7a40ef667] Set up a feedback mechanism for beta testing, [594903bb-0bc1-459e-b348-0a5ee54690b3] Create brain dump titles, [9cf84f4d-dd53-460e-b261-d75ed7c151df] Braindump page needs improved mobile styling, [b9dc255c-30ea-46fa-88f4-06a1cc0c0a58] Weekly Agenda Reassessment and Video Call with Zach, [b60622c3-9144-49ac-ad9c-557cc35e7f5a] Record talk on why productivity is broken today, [a1f81233-ff0e-4c25-a1e9-c67b7b8a913a] Plan rollout and documentation for Twitter branding, [f91f8da8-191e-4ddd-9fff-cac3c2f0ff15] Design UI for default project on onboarding, [92c93f4e-9f91-40a0-9dad-ac84549131b6] Plan migration for existing users, [51abc3cd-50a0-492e-8285-222a5a27ee1e] Create context chooser for brain dump, [9d45bcc7-d9dd-43b6-af27-23faf951bfaf] Create template ontologies for different project types in BuildOS, [e9e61989-f517-416a-b135-3a44153abe51] Implement Task Snooze Feature, [bc8276f0-0155-4b48-add7-2eb921a679a8] Revise Notification Language, [f603e783-665d-4f89-9387-043fb0ae5d6c] Implement Ring Visuals Instead of Bars, [937148ca-5780-41bf-82cf-00494f04bc2e] Ai should stop if it needs more direction or context, [d35d4f58-441c-4575-a830-bf21e8c707c3] Implement approval parameter for changes, [18b31939-0e68-483a-ac2c-92cd68fe718d] Create Optional Reminders as Questions, [1932fc47-b518-4e1b-afd6-94aa6beee8b0] Task details update, [c55a6e3e-f68d-477d-9122-f1687c8a0f5a] Add Custom Instructions for Generating Phases, [6619f6f5-e03c-4d60-b648-15ffe1b6c8bb] Context definition, [82d66a8d-3535-471a-8f2d-38834c3f9416] Conduct regression test, [c58aff89-3c62-48ac-a504-576de9381eab] Create functionality for shareable pages, [9fe538b4-a0fa-447f-a542-2736bb7631d8] Notifications should be different on mobile, [066b1de6-49e0-405b-ba6c-21dbf53583cd] Apply mental models to analyze project, [96fc3f20-f938-43df-8db3-10bd73628ee6] Retry prompt functionality, [37d957bf-3838-481d-93b6-93324412de86] Feature for big projects, [e32340dd-830c-479a-afc0-45c7b5392cf4] Join writing Facebook groups and startup Slacks, [7d240a34-edb2-46a4-90ff-28e193219157] Schedule local high school visits, [7da56379-949f-4396-be93-b521898f519f] Add bulk actions to projects and phases, [2b4c0c87-4830-45a9-861a-a573124913af] Review Agenda for Charging Strategy, [958a5bbc-0746-4546-a6af-4a917128f8ca] Implement prediction functionality for next steps, [37dd526e-b65f-4bd9-8ab3-ead80cc9a136] Create LLM Metrics View, [e470d4b0-c6dc-4f2d-9558-a1735b3c4f9b] Identify and reach out to potential beta users, [f484cc35-e3e1-4952-9a4c-38174c7c649b] Store LM API Call Updates, [470d81b5-17f1-4d70-9dc1-7efb35132554] BuildOS: OS for the Brain - Create compartmentalization feature...

**SCHEDULING GUIDANCE:**

- Distribute tasks throughout phase durations intelligently
- Use priority and complexity to determine task sequence within phases
- Leave buffer time between complex tasks
- Consider dependencies when scheduling within phases

**STRATEGIC CONTEXT:**
Project context preview: "## BuildOS Context Document

### 1. Situation & Environment

- **Current State**
  BuildOS is in active beta, preparing for a public launch. The platform converts unstructured brain dumps into organized projects with actionable next steps through AI-powered conversation.

- **Pain Points**
    - Scat..."
      Tasks with detailed context: 113/148

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

- **System Prompt:** ~1739 tokens
- **User Prompt:** ~4592 tokens
- **Total Estimate:** ~6331 tokens


---
*This file is automatically generated in development mode for prompt auditing purposes.*
```
