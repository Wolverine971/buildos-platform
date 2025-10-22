---
date: 2025-10-21T21:28:57Z
researcher: Claude Code
git_commit: 34d8bf7145f90038e7fa18b45ac7e7b7be423a39
branch: main
repository: buildos-platform
topic: 'Onboarding V2 Update - Research for New Flow Structure'
tags: [research, onboarding, ui/ux, user-experience, features]
status: complete
last_updated: 2025-10-21
last_updated_by: Claude Code
---

# Research: Onboarding V2 Update - New Flow Structure

**Date**: 2025-10-21T21:28:57Z
**Researcher**: Claude Code
**Git Commit**: 34d8bf7145f90038e7fa18b45ac7e7b7be423a39
**Branch**: main
**Repository**: buildos-platform

## Research Question

How can we restructure the onboarding v2 flow to better showcase BuildOS's flexibility and combine the usage profile and productivity challenges steps?

**User's Requirements:**

1. Update first 3 steps to "Clarity", "Focus", and "Flexibility"
2. Add new "Flexibility" step showing:
    - Braindump flexibility (updating tasks, rescheduling)
    - Flexible organization with project phases
    - Flexibility in scheduling with Google Calendar
3. Add "Admin" step showing profile page, history, project history (with "feel free to skip")
4. Combine usage profile + productivity challenges into one step

## Summary

The research revealed:

1. **Current Structure:** Onboarding v2 has 6 steps (Welcome, Projects, Notifications, Archetype, Challenges, Summary)
2. **New Structure Proposed:** 7 steps (Welcome, Clarity, Focus, Flexibility, Combined Profile, Admin Tour, Summary)
3. **Key Features Identified:** Phase management, calendar integration, timeblocks, braindump task updates, profile page tabs, history tracking
4. **Implementation Path:** Modify 4 existing components, create 3 new components, update configuration

The research provided comprehensive details on all features needed for the flexibility and admin tour steps, including specific file paths, API endpoints, and UI component patterns.

## Detailed Findings

### Current Onboarding V2 Implementation

**Route File:** `/Users/annawayne/buildos-platform/apps/web/src/routes/onboarding/+page.svelte`

**Current Steps:**

1. **Welcome** (step 0) - `WelcomeStep.svelte` - Introduces BuildOS philosophy
2. **Projects** (step 1) - `ProjectsCaptureStep.svelte` - Brain dump and project capture
3. **Notifications** (step 2) - `NotificationsStep.svelte` - SMS and email preferences
4. **Archetype** (step 3) - `ArchetypeStep.svelte` - How user wants to use BuildOS
5. **Challenges** (step 4) - `ChallengesStep.svelte` - Productivity challenges
6. **Summary** (step 5) - `SummaryStep.svelte` - Review and complete

**Configuration:** `/Users/annawayne/buildos-platform/apps/web/src/lib/config/onboarding.config.ts`

### Phase Management Features

**Phase Generation:**

- **API Endpoint:** `/Users/annawayne/buildos-platform/apps/web/src/routes/api/projects/[id]/phases/generate/+server.ts` (lines 21-92)
- **Orchestrator:** `/Users/annawayne/buildos-platform/apps/web/src/lib/services/phase-generation/orchestrator.ts` (lines 18-102)
- **UI Modal:** `/Users/annawayne/buildos-platform/apps/web/src/lib/components/project/PhaseGenerationConfirmationModal.svelte`

**Three Generation Strategies:**

1. `phases_only` - Organize tasks into phases WITHOUT scheduling
2. `schedule_in_phases` - Generate phases AND schedule tasks
3. `calendar_optimized` - Advanced scheduling around calendar events

**Phase Regeneration:**

- Preserves completed/current phases
- Reallocates completed tasks to historical phases
- Releases incomplete tasks for regeneration
- Adjusts phase dates intelligently

**Phase Scheduling:**

- **API Endpoint:** `/Users/annawayne/buildos-platform/apps/web/src/routes/api/projects/[id]/phases/[phaseId]/schedule/+server.ts` (lines 277-993)
- **Two-mode operation:** Preview (propose schedule) and Execute (save schedule)
- **LLM-powered:** Uses AI to analyze tasks and generate intelligent schedules
- **Conflict-aware:** Considers existing calendar events
- **Unschedule support:** Can remove all schedules from a phase

### Calendar Integration Features

**Task Scheduling:**

- **Service:** `/Users/annawayne/buildos-platform/apps/web/src/lib/services/calendar-service.ts` (lines 631-779)
- Schedules tasks to Google Calendar
- Handles recurring tasks with recurrence patterns
- Creates calendar events with task metadata
- Tracks in `task_calendar_events` table

**Task Unscheduling:**

- **API Endpoint:** `/Users/annawayne/buildos-platform/apps/web/src/routes/api/calendar/remove-task/+server.ts`
- Removes task from calendar
- Soft deletes tracking record
- Silent notifications (doesn't email attendees)

**Timeblocks (Time Play):**

- **API Endpoint:** `/Users/annawayne/buildos-platform/apps/web/src/routes/api/time-blocks/create/+server.ts` (lines 1-70)
- **Service:** `/Users/annawayne/buildos-platform/apps/web/src/lib/services/time-block.service.ts` (lines 63-150+)
- Block off time on calendar for focused work
- Two types: 'project' (specific project) and 'build' (personal work)
- **AI-powered suggestions:** Automatically suggests what to work on during block
- **UI Components:**
    - `TimeBlockCreateModal.svelte` - Creation form
    - `TimePlayCalendar.svelte` - Calendar view
    - `TimeBlockList.svelte` - List display

**Calendar Analysis:**

- **Service:** `/Users/annawayne/buildos-platform/apps/web/src/lib/services/calendar-analysis.service.ts`
- **API Endpoint:** `/Users/annawayne/buildos-platform/apps/web/src/routes/api/calendar/analyze/+server.ts`
- Two-part analysis: Event grouping → Project creation
- Analyzes recurring meetings and patterns
- Suggests projects based on calendar events
- Can add tasks to existing projects

### Profile Page Structure

**Route:** `/Users/annawayne/buildos-platform/apps/web/src/routes/profile/+page.svelte`

**Six Tabs:**

1. **Work Profile** (`about`) - Onboarding responses organized by AI
    - Current Projects & Initiatives
    - Work Style & Preferences
    - Current Challenges & Blockers
    - BuildOS Focus Areas

2. **Brief Settings** (`briefs`) - Daily brief preferences
    - `BriefsTab.svelte`
    - Frequency, time, timezone, email opt-in

3. **Calendar** (`calendar`) - Google Calendar integration
    - `CalendarTab.svelte`
    - Connection, preferences, analysis, scheduling

4. **Notifications** (`notifications`) - Email/SMS preferences
    - `NotificationsTab.svelte`
    - Notification types, scheduled SMS list

5. **Account** (`account`) - Account management
    - `AccountTab.svelte`
    - Account settings

6. **Billing** (`billing`) - Subscription management (if Stripe enabled)
    - Payment history, invoices

### History Page Features

**Route:** `/Users/annawayne/buildos-platform/apps/web/src/routes/history/+page.svelte` (762 lines)

**Features:**

- **GitHub-style contribution chart** - Shows braindump activity over time
- **Braindump history** - All past braindumps with search/filter
- **Daily view** - Click on date to see that day's braindumps
- **Search** - Keyword search across braindumps
- **Statistics** - Total braindumps, days active, max daily count

**Components:**

- `ContributionChart.svelte` - Activity visualization
- `BraindumpHistoryCard.svelte` - Card display for braindumps
- `BraindumpModalHistory.svelte` - Detailed braindump view

### Project History Features

**API Endpoint:** `/Users/annawayne/buildos-platform/apps/web/src/routes/api/projects/[id]/history/+server.ts`

**UI Component:** `/Users/annawayne/buildos-platform/apps/web/src/lib/components/project/ProjectHistoryModal.svelte` (465 lines)

**Features:**

- **Version-by-version tracking** - All project changes stored
- **Sequential comparison** - Compare v1→v2, v2→v3, etc.
- **Field-level diffs** - See exactly what changed
- **Related braindumps** - Shows which braindump triggered changes
- **Core dimensions tracking** - Tracks 9 strategic project dimensions
- **Navigation** - Previous/Next version controls

**Tracked Data:**

- Project metadata (name, description, context, status)
- Core dimension fields (Integrity, People, Goals, Meaning, Reality, Trust, Opportunity, Power, Harmony)
- Calendar settings
- Version numbers and timestamps
- Creator information

### Braindump Flexibility Features

**Task Updates via Braindump:**

- **File:** `/Users/annawayne/buildos-platform/apps/web/src/lib/utils/braindump-processor.ts` (lines 1286-1421)
- Braindumps can UPDATE existing tasks when explicitly mentioned
- Supports operations: CREATE and UPDATE
- Update criteria: Task mentioned by ID/title, content suggests modifications
- Fields updatable: title, description, details, status, priority, duration, start_date

**Task Rescheduling via Braindump:**

- **Scheduling logic:** `/Users/annawayne/buildos-platform/apps/web/src/lib/utils/braindump-processor.ts` (lines 924-984)
- **Smart scheduler:** `/Users/annawayne/buildos-platform/apps/web/src/lib/services/task-time-slot-finder.ts` (lines 56-58)
- Automatically finds available calendar slots
- Considers work hours, working days, timezone
- Checks calendar conflicts
- Supports recurring task scheduling

**Processing Modes:**

1. **New Project Mode** - Creates new project with tasks
2. **Existing Project Mode** - Updates project context and tasks
    - Preparatory analysis (fast classification)
    - Core dimension updates
    - Task filtering (only relevant tasks)
    - 20-30% token savings

**Short Braindump Mode:**

- Threshold: 500 characters
- Endpoint: `/api/braindumps/stream-short`
- Single-pass extraction (faster)
- For quick updates to existing projects

## Code References

### Onboarding Components

- `/apps/web/src/routes/onboarding/+page.svelte` - Main route
- `/apps/web/src/lib/components/onboarding-v2/WelcomeStep.svelte` - Welcome step
- `/apps/web/src/lib/components/onboarding-v2/ProjectsCaptureStep.svelte` - Projects step
- `/apps/web/src/lib/components/onboarding-v2/NotificationsStep.svelte` - Notifications step
- `/apps/web/src/lib/components/onboarding-v2/ArchetypeStep.svelte` - Archetype step
- `/apps/web/src/lib/components/onboarding-v2/ChallengesStep.svelte` - Challenges step
- `/apps/web/src/lib/components/onboarding-v2/SummaryStep.svelte` - Summary step
- `/apps/web/src/lib/components/onboarding-v2/ProgressIndicator.svelte` - Progress indicator
- `/apps/web/src/lib/config/onboarding.config.ts` - Configuration

### Phase Management

- `/apps/web/src/routes/api/projects/[id]/phases/generate/+server.ts` - Generation API
- `/apps/web/src/routes/api/projects/[id]/phases/[phaseId]/schedule/+server.ts` - Scheduling API
- `/apps/web/src/lib/services/phase-generation/orchestrator.ts` - Orchestrator
- `/apps/web/src/lib/components/project/PhaseGenerationConfirmationModal.svelte` - UI modal
- `/apps/web/src/lib/components/project/PhaseSchedulingModal.svelte` - Scheduling modal
- `/apps/web/src/lib/components/project/ScheduleAllPhasesModal.svelte` - Batch scheduling

### Calendar Integration

- `/apps/web/src/lib/services/calendar-service.ts:631-779` - Task scheduling
- `/apps/web/src/routes/api/calendar/remove-task/+server.ts` - Unscheduling
- `/apps/web/src/routes/api/time-blocks/create/+server.ts` - Timeblock creation
- `/apps/web/src/lib/services/time-block.service.ts:63-150` - Timeblock service
- `/apps/web/src/lib/components/time-blocks/TimeBlockCreateModal.svelte` - Creation UI
- `/apps/web/src/lib/services/calendar-analysis.service.ts` - Analysis service

### Profile & History

- `/apps/web/src/routes/profile/+page.svelte` - Profile page
- `/apps/web/src/routes/history/+page.svelte` - History page (762 lines)
- `/apps/web/src/lib/components/project/ProjectHistoryModal.svelte` - Project history (465 lines)
- `/apps/web/src/lib/components/history/ContributionChart.svelte` - Contribution chart
- `/apps/web/src/routes/api/projects/[id]/history/+server.ts` - Project history API

### Braindump Flexibility

- `/apps/web/src/lib/utils/braindump-processor.ts:1286-1421` - Task updates
- `/apps/web/src/lib/utils/braindump-processor.ts:924-984` - Task rescheduling
- `/apps/web/src/lib/utils/braindump-processor.ts:1423-1631` - Existing project processing
- `/apps/web/src/lib/services/task-time-slot-finder.ts:56-58` - Smart scheduling
- `/apps/web/docs/prompts/existing-project/dual-processing/tasks/existing-project-task-extraction-prompt.md` - Prompt template

## Architecture Insights

### Key Patterns

1. **Dual Processing Pipeline** - Parallel context and task extraction for accuracy
2. **Preparatory Analysis** - Fast classification before full processing (existing projects only)
3. **Intelligent Scheduling** - LLM-powered + calendar-aware time slot finder
4. **Historical Preservation** - Phase regeneration preserves completed work
5. **Real-time Sync** - Calendar webhook integration for live updates

### Component Organization

```
apps/web/src/
├── routes/
│   ├── onboarding/+page.svelte           # Main onboarding route
│   ├── profile/+page.svelte              # Profile page with tabs
│   ├── history/+page.svelte              # History page with contribution chart
│   └── api/
│       ├── projects/[id]/
│       │   ├── phases/generate/          # Phase generation
│       │   └── phases/[id]/schedule/     # Phase scheduling
│       ├── calendar/
│       │   ├── remove-task/              # Unschedule task
│       │   └── analyze/                  # Calendar analysis
│       └── time-blocks/create/           # Timeblock creation
└── lib/
    ├── components/
    │   ├── onboarding-v2/                # All onboarding components
    │   ├── project/                      # Phase modals, history modal
    │   ├── time-blocks/                  # Timeblock UI
    │   ├── calendar/                     # Calendar UI
    │   ├── history/                      # History UI
    │   └── profile/                      # Profile tabs
    ├── services/
    │   ├── phase-generation/             # Phase generation logic
    │   ├── calendar-service.ts           # Calendar operations
    │   ├── time-block.service.ts         # Timeblock operations
    │   └── task-time-slot-finder.ts      # Smart scheduling
    ├── utils/
    │   └── braindump-processor.ts        # Braindump processing
    └── config/
        └── onboarding.config.ts          # Onboarding configuration
```

### Data Flow

**Onboarding Flow:**

```
User → Welcome → Clarity → Focus → Flexibility → Profile → Admin Tour → Summary → Complete
         ↓         ↓         ↓         ↓            ↓           ↓          ↓
      Update    Brain    SMS/Email  Showcase   Archetype +  Features   Review
      Welcome   Dump     Prefs      Features   Challenges    Tour      & Done
```

**Phase Generation Flow:**

```
User Request → PhaseGenerationOrchestrator → Strategy Selection → LLM Processing →
Historical Preservation → Task Scheduling → Calendar Sync → Database Save →
Notification Update → UI Refresh
```

**Braindump Processing Flow:**

```
User Input → Validation → Preparatory Analysis (existing only) →
Parallel (Context + Tasks) → Merge Results → Task Scheduling →
Operations Execution → Database Save → UI Update
```

## Implementation Recommendations

### New Component Structure

1. **FlexibilityStep.svelte** (NEW)
    - Three sections: Braindump, Phases, Calendar
    - Tab navigation between sections
    - Use screenshots or interactive demos
    - Showcase flexibility without requiring user action

2. **CombinedProfileStep.svelte** (NEW)
    - Merge ArchetypeStep and ChallengesStep
    - Two-section layout (vertical stack on mobile)
    - Archetype selection (required)
    - Challenges selection (optional but recommended)
    - Single save action

3. **AdminTourStep.svelte** (NEW)
    - Three sections: Profile, History, Project History
    - Prominent "Skip Tour" button
    - Screenshots with CTAs to actual pages
    - Completely optional

### Configuration Updates

Update `onboarding.config.ts`:

```typescript
steps: {
  welcome: { id: 'welcome', order: 0, title: 'Welcome' },
  clarity: { id: 'clarity', order: 1, title: 'Clarity' },
  focus: { id: 'focus', order: 2, title: 'Focus' },
  flexibility: { id: 'flexibility', order: 3, title: 'Flexibility' }, // NEW
  profile: { id: 'profile', order: 4, title: 'Your Profile' },  // RENAMED
  admin_tour: { id: 'admin_tour', order: 5, title: 'Explore More' }, // NEW
  summary: { id: 'summary', order: 6, title: 'Summary' }
}
```

### Assets Required

**Screenshots needed:**

1. Braindump updating a task
2. Braindump rescheduling tasks
3. Phase generation modal
4. Phase regeneration before/after
5. Phase scheduling with AI
6. Task schedule/unschedule buttons
7. Timeblock creation modal
8. Timeblock with AI suggestions
9. Profile page overview
10. History page with contribution chart
11. Project history modal

**Placeholder strategy:** Use `ONBOARDING_V2_CONFIG.features.showPlaceholderAssets` flag

### Testing Plan

1. **Unit Tests:**
    - FlexibilityStep component rendering
    - CombinedProfileStep validation logic
    - AdminTourStep skip functionality

2. **Integration Tests:**
    - Complete flow navigation
    - Data persistence across steps
    - Step skipping behavior

3. **E2E Tests:**
    - Full onboarding completion
    - Skip optional steps path
    - Mobile responsiveness

4. **Manual QA:**
    - Desktop browsers (Chrome, Firefox, Safari)
    - Mobile browsers (iOS Safari, Chrome)
    - Tablet layouts
    - Dark mode

## Related Research

This research builds upon:

- Notification system design (NOTIFICATION_SYSTEM_DOCS_MAP.md)
- Brain dump system architecture
- Calendar integration patterns
- Phase management architecture

## Open Questions

1. **Should FlexibilityStep be interactive or purely informational?**
    - Recommendation: Start informational, add interactivity in v2.1
    - Rationale: Simpler to implement, faster to complete

2. **Should AdminTourStep be completely optional?**
    - Recommendation: Yes, prominent skip button
    - Rationale: Not core to getting started, reduces friction

3. **What's the priority order for screenshots?**
    - Recommendation:
        1. Phase generation modal (most important)
        2. Timeblock with suggestions (most visually compelling)
        3. Profile page overview (easiest to capture)
        4. Others can use placeholders initially

4. **Should we track analytics on step completion rates?**
    - Recommendation: Yes
    - Metrics: Completion rate per step, skip rate, time to complete, drop-off points

## Next Steps

1. ✅ **Review Spec** - Validate specification with stakeholders
2. **Implement Phase 1** - Update config and foundation
3. **Implement Phase 2** - Modify existing components
4. **Implement Phase 3** - Create new components
5. **Implement Phase 4** - Integration and testing
6. **Implement Phase 5** - Assets and polish
7. **Deploy** - Roll out to production
8. **Monitor** - Track completion rates and user feedback

---

**Complete specification available at:**
`/apps/web/docs/features/onboarding/ONBOARDING_V2_UPDATED_SPEC.md`
