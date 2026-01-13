<!-- apps/web/src/lib/tests/test-braindump-prompts.md -->

# Brain Dump Test Prompts- AUG 28 lez go

## Test Prompt 1: New Project Creation

**Scenario**: User wants to create a new project with initial context and tasks

### Brain Dump:

"I want to start a new project for redesigning my company's customer portal. The main goal is to improve user experience and reduce support tickets by 40%. We need to modernize the UI, add a proper search function, and integrate with our new API backend. The project should run for about 3 months starting next week. Initial tasks include conducting user interviews, creating wireframes, and setting up the development environment. We should also review our competitor's portals to see what they're doing well."

### Expected Results:

- **Project Created**: Name: "Customer Portal Redesign"
- **Project Context**: Should include goals, timeline, and strategic objectives
- **Initial Tasks**:
    - Conduct user interviews
    - Create wireframes
    - Set up development environment
    - Review competitor portals
- **Project Dates**: start_date: next week, end_date: 3 months from start

---

## Test Prompt 2: Adding Tasks to Existing Project

**Scenario**: User is adding specific tasks to current project

### Brain Dump:

"I need to add a couple of tasks to the project. First, we need to implement the authentication system with OAuth support - this is high priority and should take about 2 days. Second, create unit tests for the API endpoints, probably medium priority and will take a day. Both should start next Monday."

### Expected Results:

- **Task 1**:
    - Title: "Implement authentication system with OAuth support"
    - Priority: high
    - Duration: 960 minutes (2 days)
    - Start date: next Monday
    - task_type: "one_off"
- **Task 2**:
    - Title: "Create unit tests for API endpoints"
    - Priority: medium
    - Duration: 480 minutes (1 day)
    - Start date: next Monday
    - task_type: "one_off"

---

## Test Prompt 3: Creating Recurring Tasks

**Scenario**: User wants to set up recurring tasks for project management

### Brain Dump:

"We need to have a weekly team sync every Monday at 10am for the duration of the project. Also set up a daily standup every weekday at 9:30am. And I want to do a monthly retrospective on the last Friday of each month. The retrospectives should continue until the project ends."

### Expected Results:

- **Task 1**:
    - Title: "Weekly team sync"
    - task_type: "recurring"
    - recurrence_pattern: "weekly"
    - start_date: next Monday
    - recurrence_ends: project end date
- **Task 2**:
    - Title: "Daily standup"
    - task_type: "recurring"
    - recurrence_pattern: "weekdays"
    - start_date: tomorrow (or next weekday)
    - recurrence_ends: project end date
- **Task 3**:
    - Title: "Monthly retrospective"
    - task_type: "recurring"
    - recurrence_pattern: "monthly"
    - start_date: last Friday of month
    - recurrence_ends: project end date

---

## Test Prompt 4: Major Strategy Update (>1000 chars)

**Scenario**: User is documenting a significant project pivot

### Brain Dump:

"After the stakeholder meeting yesterday, we need to make some major changes to our approach. The CEO wants us to completely pivot from building a traditional web portal to creating a mobile-first progressive web app. This changes everything.

We need to scrap the desktop wireframes we've been working on and start fresh with mobile designs. The authentication system now needs to support biometric login on mobile devices, not just OAuth. We should also add push notifications as a core feature.

The timeline is getting compressed - they want a beta version in 6 weeks instead of the full 3 months we planned. This means we need to identify MVP features immediately. Core features for MVP: user login with biometrics, dashboard view, search functionality, and basic account management. Everything else moves to phase 2.

I'm thinking we should adopt a more agile approach with 2-week sprints. Each sprint should have clear milestones. We need to set up daily standups at 9am, sprint planning every other Monday, and retrospectives every other Friday.

The tech stack needs updating too. Instead of React, we should use Next.js for better mobile performance and SEO. The backend API remains the same but we need to add WebSocket support for real-time updates. Also need to integrate with Firebase for push notifications.

New priorities: 1) Mobile wireframes (high priority, start immediately), 2) Update technical architecture doc (high priority), 3) Set up Next.js development environment (high priority), 4) Research biometric authentication libraries (medium priority), 5) Create new project timeline with sprints (high priority)."

### Expected Results:

- **Project Context Update**: Major update reflecting pivot to mobile-first PWA
- **Executive Summary Update**: Compressed timeline, new MVP focus
- **New Tasks Created**:
    - Mobile wireframes (high priority)
    - Update technical architecture doc (high priority)
    - Set up Next.js development environment (high priority)
    - Research biometric authentication libraries (medium priority)
    - Create new project timeline with sprints (high priority)
- **Recurring Tasks Created**:
    - Daily standups at 9am (weekdays pattern)
    - Sprint planning (biweekly pattern)
    - Sprint retrospectives (biweekly pattern)
- **Project End Date Update**: 6 weeks from now

---

## Additional Edge Cases to Test

### Edge Case 1: Ambiguous Recurring Language

"We should probably check in regularly on the progress, maybe have some kind of review now and then, and update the stakeholders when needed."

**Expected**: Should create one-off tasks since frequency is ambiguous

### Edge Case 2: Mixed Task Updates and Creates

"Mark the wireframe task as complete. The authentication task is blocked waiting for API specs. Add a new task to unblock the API specs issue by meeting with backend team."

**Expected**:

- Update task (wireframes) status to "done"
- Update task (authentication) status to "blocked"
- Create new task for meeting with backend team

### Edge Case 3: Past Tense References (Should Not Create)

"We used to have daily standups but stopped them. The weekly reviews were helpful when we had them."

**Expected**: No recurring tasks created (past tense)

### Edge Case 4: Conditional Recurring Tasks

"If the client approves, we'll have weekly check-ins. When we launch, we'll need daily monitoring."

**Expected**: Create as one-off tasks since they're conditional

### Edge Case 5: Specific Date Recurring Task

"Starting January 15th, we need quarterly business reviews for the whole year."

**Expected**:

- task_type: "recurring"
- recurrence_pattern: "quarterly"
- start_date: "2025-01-15"
- recurrence_ends: one year from start

### Edge Case 6: Task with Dependencies

"After we finish the authentication system, we need to implement user profiles, then the dashboard. These tasks depend on each other in sequence."

**Expected**: Three tasks with proper dependency chain

### Edge Case 7: Brain Dump with Meta Instructions

"Just capture these as notes, don't create tasks yet: Research notes on competitor analysis, thoughts on UI patterns, ideas for future features."

**Expected**: Operations should respect user instruction - create notes, not tasks

### Edge Case 8: Recurring Task with Specific End Date

"Daily deployment checks until the February 28th launch date."

**Expected**:

- task_type: "recurring"
- recurrence_pattern: "daily"
- recurrence_ends: "2025-02-28"

### Edge Case 9: Multiple Projects Mentioned

"For the portal project, add a task to review security. For the mobile app project (different project), we need to update the icons."

**Expected**: Should only create task for the selected project, ignore or note the other

### Edge Case 10: Very Short Brain Dump (<100 chars)

"Fix the login bug ASAP and update docs."

**Expected**:

- Two tasks created
- High priority for bug fix
- Normal priority for docs

### Edge Case 11: Recurring Task Variations

"Team meeting every Tuesday at 2pm. Code review every other week. Quarterly planning every 3 months. Status report on the 1st and 15th of each month."

**Expected**:

- Weekly pattern for Tuesday meeting
- Biweekly pattern for code review
- Quarterly pattern for planning
- Monthly pattern for status reports (might need special handling for twice monthly)

### Edge Case 12: Task Status Updates with Details

"The API integration task is now in progress. I've completed about 60% of it, mainly the authentication part is done but still working on data syncing. Should be done by end of week."

**Expected**:

- Update task status to "in_progress"
- Add progress details to task details field
- Consider adding completion date estimate
