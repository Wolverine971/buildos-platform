---
date: 2025-10-04T04:30:00-04:00
researcher: Claude Code (Sonnet 4.5)
git_commit: 77d2dd1ec881074cbf5b1257a14e8fa7d8302b60
branch: main
repository: Wolverine971/buildos-platform
topic: "TimeBlock Scheduling Feature - Architecture Research & Design Exploration"
tags:
  [
    research,
    codebase,
    calendar,
    scheduling,
    timeblock,
    ai-scheduling,
    ux-design,
  ]
status: complete
last_updated: 2025-10-04
last_updated_by: Claude Code
---

# Research: TimeBlock Scheduling Feature - Architecture Research & Design Exploration

**Date**: 2025-10-04T04:30:00-04:00
**Researcher**: Claude Code (Sonnet 4.5)
**Git Commit**: 77d2dd1ec881074cbf5b1257a14e8fa7d8302b60
**Branch**: main
**Repository**: Wolverine971/buildos-platform

## Research Question

**How can we implement "TimeBlock" scheduling in BuildOS—a guided flexibility system that identifies free time gaps and suggests what to do in those spaces based on context-aware AI?**

The timeblock-idea.md document proposes a system where:

- Humans set priorities, AI manages time
- Flow-based productivity (not rigid task lists)
- Context-aware AI scheduling based on energy, focus, and goals
- Free time gaps become "commitment zones" optimized for cognitive modes

This research explores how BuildOS's existing architecture can support this vision and identifies design decisions needed.

---

## Summary

**BuildOS has excellent infrastructure for time blocking** with sophisticated calendar integration, intelligent scheduling algorithms, and AI-powered decision-making. However, implementing the full TimeBlock vision requires:

### What Exists ✅

- **Google Calendar integration** with OAuth, event sync, and free/busy queries
- **Time gap detection** via `TaskTimeSlotFinder` and `CalendarService.findAvailableSlots()`
- **AI scheduling** using LLM for strategic planning + algorithms for tactical execution
- **User preferences** for working hours, working days, timezone
- **Sophisticated UI patterns** for calendar views, conflict resolution, and schedule editing
- **Two-stage scheduling**: LLM suggests optimal times → TaskTimeSlotFinder validates availability

### What Needs Building 🔨

- **Energy/context metadata** fields (energy_type, flexibility, focus_level, optimal_time_of_day)
- **User energy profiles** (peak hours, low energy times, preferred deep work windows)
- **Gap-to-task matching engine** that considers task energy type + time of day fitness
- **TimeBlock UI** for presenting gaps with AI suggestions + alternative options
- **Decision rationale** explaining why AI matched a specific task to a gap
- **Enhanced LLM prompts** for context-aware gap filling recommendations

### Key Architectural Decision Points 🎯

1. **Gap detection granularity**: 30-min increments (existing) vs custom block sizes?
2. **Energy learning**: Explicit user input vs ML inference from completion patterns?
3. **Suggestion multiplicity**: Show 1 AI pick vs 3 ranked alternatives per gap?
4. **Override persistence**: Remember user swaps to improve future AI suggestions?
5. **Real-time updates**: Webhook-based gap refresh vs manual refresh?
6. **Multi-calendar support**: Query all calendars vs primary only?

---

## Detailed Findings

### 1. Calendar Integration & Time Gap Detection

#### Current Capabilities

**Google Calendar OAuth Integration** (`/apps/web/src/lib/services/google-oauth-service.ts`)

- Full calendar read/write access via OAuth2
- Automatic token refresh with retry logic
- Connection status: `/profile?tab=calendar`
- Supports webhook notifications for real-time updates

**Calendar Event Fetching** (`/apps/web/src/lib/services/calendar-service.ts:370-424`)

```typescript
getCalendarEvents({
  timeMin: current_time,
  timeMax: 7_days_ahead,
  maxResults: 50,
  singleEvents: true  // Expands recurring events
})
```

**Free/Busy Time Gap Detection** (`calendar-service.ts:429-515`)

```typescript
findAvailableSlots({
  timeMin,
  timeMax,
  duration_minutes: 60,
  preferred_hours: [9, 10, 11, 14, 15, 16], // Optional filter
  increment: 30, // 30-minute slot increments
});
// Uses Google Calendar Free/Busy API
// Returns max 10 available slots by default
```

**Intelligent Task Scheduling** (`/apps/web/src/lib/services/task-time-slot-finder.ts:355-402`)

```typescript
findAvailableSlot(workDayStart, workDayEnd, durationMinutes, occupiedSlots) {
  // Algorithm: First-fit gap finding
  // 1. Check beginning of workday
  // 2. Find gaps between occupied slots
  // 3. Check after last occupied slot
  // 4. Return null if no fit (triggers bump to next day)
}
```

#### Database Schema

**user_calendar_preferences** (`database.schema.ts:1001-1016`)

```typescript
{
  timezone: 'America/New_York',
  work_start_time: '09:00:00',
  work_end_time: '17:00:00',
  working_days: [1,2,3,4,5],  // Mon-Fri
  default_task_duration_minutes: 60,
  min_task_duration_minutes: 30,
  max_task_duration_minutes: 240,
  prefer_morning_for_important_tasks: boolean,  // ⚠️ Only energy hint
  exclude_holidays: boolean
}
```

**task_calendar_events** (`database.schema.ts:920-946`)

- Links BuildOS tasks to Google Calendar events
- Tracks sync status, recurring events, exceptions
- Supports bidirectional sync

#### API Endpoints

**Main Calendar Proxy** (`/apps/web/src/routes/api/calendar/+server.ts`)

```typescript
POST /api/calendar
{
  method: 'findAvailableSlots',  // ← Already exists for TimeBlock!
  params: {
    timeMin, timeMax,
    duration_minutes,
    preferred_hours
  }
}
```

#### Gap Detection for TimeBlock: Ready to Use ✅

**Existing Foundation:**

- `CalendarService.findAvailableSlots()` queries Google Free/Busy API
- Returns available time windows matching duration requirements
- Can filter by preferred hours (e.g., deep work only in morning)
- Default 30-minute increment for slot generation

**Enhancement Needed:**

- Currently returns **all available slots**
- TimeBlock needs **gap prioritization** based on:
  - Gap duration (longer gaps = better for deep work)
  - Time of day fitness (morning gaps for high-focus tasks)
  - Adjacent event context (after meetings = low energy)

---

### 2. Task Scheduling & Time Slot Allocation

#### Two-Stage Scheduling Architecture

**Stage 1: LLM Strategic Planning** (`/apps/web/src/routes/api/projects/[id]/phases/[phaseId]/schedule/+server.ts:748-843`)

- Analyzes task dependencies, priorities, complexity
- Generates optimal task ordering with reasoning
- Suggests initial `suggested_start_date` values
- Validates against phase boundaries

**Stage 2: Time Slot Optimization** (`task-time-slot-finder.ts:41-139`)

- Verifies LLM times are actually available
- Finds exact slots within working hours
- Handles conflicts by bumping to next available day
- Batch-fetches existing tasks for performance

**Graceful Degradation:**

1. Best: LLM + TaskTimeSlotFinder (intelligent + optimized)
2. Good: TaskTimeSlotFinder only (optimized but not semantic)
3. Basic: Simple date assignment (always works)

#### Task Duration Handling

**Priority Order:**

1. Explicit `task.duration_minutes` (user-specified)
2. User default `preferences.default_task_duration_minutes`
3. System default: 60 minutes

**Validation** (`/apps/web/src/routes/api/users/calendar-preferences/+server.ts:72-80`)

- Min duration: 15 minutes (API enforced)
- Max duration: 480 minutes (API enforced)
- User customizable via preferences

#### Conflict Detection

**Conflict Types** (`schedulingUtils.ts:30-38`)

```typescript
type ConflictType =
  | "calendar" // Overlaps with calendar event
  | "task" // Overlaps with existing task
  | "phase_boundary" // Outside phase start/end dates
  | "project_boundary"; // Outside project start/end dates
```

**Resolution Strategies:**

- Automatic: Find alternative slot, bump to next day, iterative search (7 days)
- Manual: User edits time in UI, accepts conflict, or resets to AI suggestion

#### TimeBlock Scheduling: Adaptation Required 🔨

**Difference from Current System:**

- **Current**: Schedule known tasks to find time slots
- **TimeBlock**: Start with time gaps, suggest which task fits best

**Adaptation Strategy:**

```typescript
// New service: TimeBlockMatcher
interface TimeBlockMatch {
  gap: { start: Date, end: Date, duration_minutes: number };
  suggested_task: Task;
  alternatives: Task[];  // 2-3 other options
  rationale: string;     // Why this task for this gap
  fitness_score: number; // 0-1 based on energy/context match
}

async suggestTasksForGaps(
  gaps: TimeGap[],
  availableTasks: Task[],
  userProfile: UserEnergyProfile
): Promise<TimeBlockMatch[]>
```

**Required Logic:**

1. **Gap categorization**: Short (<60min), Medium (60-120min), Long (>120min)
2. **Task filtering**: Only backlog tasks or explicitly marked as "available for scheduling"
3. **Energy matching**: Morning gaps → high-focus tasks, afternoon → admin/light work
4. **Value density**: `priority_score / duration_minutes` for ranking
5. **LLM reasoning**: Generate rationale for each suggestion

---

### 3. Project & Task Data Models

#### Current Schema - Tasks Table

**Existing Fields** (`database.schema.ts:953-978`)

```typescript
tasks: {
  // Scheduling-relevant fields
  start_date: string | null,              // ✅ Scheduling timestamp
  duration_minutes: number | null,        // ✅ Time estimation
  priority: 'low' | 'medium' | 'high',    // ✅ String enum
  status: 'backlog' | 'in_progress' | 'done' | 'blocked',
  dependencies: string[],                 // ✅ Task relationships
  task_type: 'one_off' | 'recurring',

  // NOT TimeBlock-ready
  // ❌ No energy_type
  // ❌ No flexibility
  // ❌ No priority_score (numeric)
  // ❌ No optimal_time_of_day
  // ❌ No focus_level
}
```

#### TimeBlock Metadata Requirements

**Proposed Migration** (New fields needed):

```sql
-- File: supabase/migrations/20251004_add_timeblock_metadata.sql

ALTER TABLE tasks
  ADD COLUMN energy_type text CHECK (
    energy_type IN ('creative', 'analytical', 'admin', 'social', 'physical')
  ),
  ADD COLUMN flexibility text DEFAULT 'flexible' CHECK (
    flexibility IN ('fixed', 'flexible', 'moveable')
  ),
  ADD COLUMN priority_score integer CHECK (
    priority_score >= 0 AND priority_score <= 100
  ),
  ADD COLUMN optimal_time_of_day text CHECK (
    optimal_time_of_day IN ('morning', 'afternoon', 'evening', 'anytime')
  ),
  ADD COLUMN focus_level text CHECK (
    focus_level IN ('deep', 'moderate', 'light')
  );

-- Create index for TimeBlock queries
CREATE INDEX idx_tasks_timeblock ON tasks(
  energy_type, priority_score, focus_level
) WHERE status = 'backlog' AND deleted_at IS NULL;
```

**User Energy Profile** (New table):

```sql
CREATE TABLE user_energy_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id),
  peak_energy_hours text[],         -- ['09:00', '10:00', '11:00']
  low_energy_hours text[],          -- ['14:00', '15:00']
  preferred_deep_work_time text,    -- 'morning' | 'afternoon' | 'evening'
  context_switch_cost_minutes int,  -- Buffer between different energy types
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

#### TypeScript Type Updates

**New Task Type Extensions:**

```typescript
// /apps/web/src/lib/types/timeblock.types.ts

export type EnergyType =
  | "creative"
  | "analytical"
  | "admin"
  | "social"
  | "physical";
export type Flexibility = "fixed" | "flexible" | "moveable";
export type OptimalTime = "morning" | "afternoon" | "evening" | "anytime";
export type FocusLevel = "deep" | "moderate" | "light";

export interface TaskWithTimeBlockMetadata extends Task {
  energy_type?: EnergyType;
  flexibility?: Flexibility;
  priority_score?: number; // 0-100
  optimal_time_of_day?: OptimalTime;
  focus_level?: FocusLevel;
}

export interface UserEnergyProfile {
  user_id: string;
  peak_energy_hours: string[];
  low_energy_hours: string[];
  preferred_deep_work_time: OptimalTime;
  context_switch_cost_minutes: number;
}

export interface TimeGap {
  start: Date;
  end: Date;
  duration_minutes: number;
  time_of_day: OptimalTime;
  follows_event?: CalendarEvent;
  precedes_event?: CalendarEvent;
}
```

---

### 4. AI/LLM Integration for Scheduling Decisions

#### Current AI Scheduling Capabilities

**Multi-Model LLM Routing** (`smart-llm-service.ts:105-254`)

- Primary: DeepSeek Chat (complex JSON, instruction-following)
- Fast: Grok 4 Fast (free tier, quick prototyping)
- Powerful: Claude 3.5 Sonnet (complex reasoning)

**Phase Scheduling Prompts** (`promptTemplate.service.ts:694-862`)

```typescript
buildPhaseGenerationSystemPrompt(
  schedulingMethod: 'phases_only' | 'schedule_in_phases' | 'calendar_optimized'
)
// Current scheduling logic:
// - Analyzes dependencies, priorities, complexity
// - Generates ISO 8601 timestamps during working hours (9am-5pm)
// - Distributes tasks logically throughout phase duration
// - High-priority tasks scheduled earlier
// - Provides reasoning for each assignment
```

**Calendar Analysis AI** (`calendar-analysis.service.ts:283-591`)

```typescript
analyzeEventsWithAI(events) {
  // Analyzes past events for project context
  // Creates tasks from upcoming events
  // Generates 2-5 tasks per project suggestion
  // Returns confidence scores (0-1) with reasoning
}
```

#### AI Integration Points for TimeBlock

**New LLM Prompt Required: Gap-Task Matching**

```typescript
// /apps/web/src/lib/services/prompts/timeblock-matching-prompt.ts

export function buildTimeBlockMatchingPrompt(
  gaps: TimeGap[],
  availableTasks: TaskWithTimeBlockMetadata[],
  userProfile: UserEnergyProfile,
  recentCompletions: Task[]  // Learn from patterns
): string {
  return `
You are BuildOS's TimeBlock scheduling assistant. Your role is to match
available time gaps with appropriate tasks based on energy, context, and flow.

# User Energy Profile
- Peak energy hours: ${userProfile.peak_energy_hours.join(', ')}
- Low energy hours: ${userProfile.low_energy_hours.join(', ')}
- Preferred deep work time: ${userProfile.preferred_deep_work_time}

# Available Time Gaps (Next 7 Days)
${gaps.map(g => \`
Gap ${g.start} - ${g.end} (${g.duration_minutes}min)
- Time of day: ${g.time_of_day}
- Follows: ${g.follows_event?.summary || 'None'}
- Precedes: ${g.precedes_event?.summary || 'None'}
\`).join('\n')}

# Tasks Available for Scheduling (Backlog)
${availableTasks.map(t => \`
Task: ${t.title}
- Energy type: ${t.energy_type}
- Focus level: ${t.focus_level}
- Duration: ${t.duration_minutes}min
- Priority: ${t.priority_score}/100
- Flexibility: ${t.flexibility}
- Optimal time: ${t.optimal_time_of_day}
\`).join('\n')}

# Matching Principles
1. **Energy alignment**: Match high-focus tasks to peak energy gaps
2. **Duration fit**: Task duration should fit comfortably in gap (leave 10min buffer)
3. **Context awareness**: Admin tasks work well after meetings; creative work needs clear space
4. **Flow optimization**: Group similar energy types when possible
5. **Priority weighting**: Higher priority_score = prefer earlier/better gaps

# Output Format
For each gap, suggest 1 primary task + 2 alternatives:

{
  "gap_matches": [
    {
      "gap_start": "2025-10-04T09:00:00Z",
      "gap_end": "2025-10-04T11:00:00Z",
      "primary_suggestion": {
        "task_id": "uuid",
        "task_title": "string",
        "rationale": "This is your peak energy window (morning), perfect for deep focus work on the marketing site redesign",
        "fitness_score": 0.95
      },
      "alternatives": [
        { "task_id": "uuid", "task_title": "string", "rationale": "...", "fitness_score": 0.82 },
        { "task_id": "uuid", "task_title": "string", "rationale": "...", "fitness_score": 0.76 }
      ]
    }
  ],
  "unscheduled_tasks": ["task-id-1", "task-id-2"],  // Tasks that didn't fit well
  "scheduling_strategy": "Prioritized high-impact creative work in morning gaps, reserved afternoon for admin tasks"
}
`;
}
```

**Usage:**

```typescript
const response = await smartLLMService.getJSONResponse({
  systemPrompt: "TimeBlock scheduling assistant",
  userPrompt: buildTimeBlockMatchingPrompt(gaps, tasks, profile, recentTasks),
  userId,
  profile: "balanced", // DeepSeek or GPT-4o-mini
  temperature: 0.3,
  operationType: "timeblock_matching",
});
```

#### Hybrid Approach: LLM + Algorithm

**LLM Strengths:**

- Semantic understanding of task context
- Energy-time-of-day matching logic
- Explaining rationale in human terms
- Learning from user patterns (via prompt context)

**Algorithm Strengths:**

- Exact time calculations
- Conflict detection
- Working hours enforcement
- Deterministic validation

**Recommended Architecture:**

```
User opens TimeBlock view
  ↓
1. Fetch calendar gaps (CalendarService.findAvailableSlots)
2. Fetch backlog tasks with TimeBlock metadata
3. Fetch user energy profile
  ↓
4. LLM: Match tasks to gaps (strategic)
  → Returns 1 primary + 2 alternatives per gap
  → Provides fitness scores and rationale
  ↓
5. Algorithm: Validate suggestions (tactical)
  → Ensure no conflicts
  → Verify duration fits
  → Check working hours alignment
  ↓
6. Present to user:
  → Show gaps with AI suggestions
  → Allow swaps between alternatives
  → Provide "accept all" or manual editing
  ↓
7. User confirms → Save to database
  → Update task.start_date
  → Create calendar events
  → Track acceptance for future learning
```

---

### 5. UI/UX Patterns for Calendar & Scheduling

#### Existing Scheduling UI Components

**PhaseSchedulingModal.svelte** (`/apps/web/src/lib/components/project/PhaseSchedulingModal.svelte:1-530`)

- **Layout**: Two-panel desktop (task list left, calendar right)
- **Mobile**: Collapsible calendar, always-visible task list
- **State**: `schedulingStore.ts` with status tracking (idle/loading/ready/saving/error)
- **Interaction**: Click calendar event → scroll to task + 3s highlight
- **Editing**: Expand task → datetime-local input + duration slider

**TaskScheduleItem.svelte** (`/apps/web/src/lib/components/scheduling/TaskScheduleItem.svelte:1-289`)

- **Two states**: Collapsed (show time + conflict badge) / Expanded (edit fields)
- **Preserves AI suggestion**: originalStart/originalEnd with reset button
- **Real-time validation**: Inline error messages, conflict detection
- **Duration control**: 15-480 minute range with 15-min increments

**ScheduleConflictAlert.svelte** (`/apps/web/src/lib/components/scheduling/ScheduleConflictAlert.svelte:1-327`)

- **Hierarchical severity**: Phase warnings (orange), Errors (red), Warnings (amber), Info (blue)
- **Expandable sections**: Group conflicts by type
- **Task badges**: Clickable, scroll-to-task on click
- **Auto-collapse**: After navigation completes

**CalendarView.svelte** (`/apps/web/src/lib/components/scheduling/CalendarView.svelte:1-436`)

- **Three modes**: Day, Week, Month
- **Time positioning**: Calculates % offset within working hours
- **Color coding**: Gray (existing), Blue (proposed), Amber (conflicts), Highlighted (ring)
- **Phase boundaries**: Visual indicators for phase start/end dates

#### TimeBlock UI Adaptation Strategy

**New Component: TimeBlockView.svelte**

```svelte
<!-- Inspired by PhaseSchedulingModal but gap-centric -->

<script lang="ts">
  import { timeBlockStore } from '$lib/stores/timeBlockStore';
  import TimeBlockGapCard from './TimeBlockGapCard.svelte';
  import TaskAlternativeSelector from './TaskAlternativeSelector.svelte';

  let view: 'next_3_days' | 'next_week' | 'next_month' = 'next_3_days';

  onMount(async () => {
    await timeBlockStore.initialize(userId, view);
  });
</script>

<div class="timeblock-container">
  <!-- Left Panel: Gap List -->
  <div class="gap-list">
    <h2>Available Time Blocks</h2>
    <p class="subtitle">You have {$timeBlockStore.gaps.length} free blocks in the next {view}</p>

    {#each $timeBlockStore.gapMatches as gapMatch}
      <TimeBlockGapCard
        gap={gapMatch.gap}
        primarySuggestion={gapMatch.primary_suggestion}
        alternatives={gapMatch.alternatives}
        on:swap={(e) => timeBlockStore.swapTask(gapMatch.gap.id, e.detail.taskId)}
        on:remove={() => timeBlockStore.removeBlock(gapMatch.gap.id)}
      />
    {/each}
  </div>

  <!-- Right Panel: Calendar Visualization -->
  <div class="calendar-panel">
    <CalendarView
      events={$timeBlockStore.proposedEvents}
      highlightedEventId={$timeBlockStore.highlightedEventId}
      on:eventClick={(e) => timeBlockStore.highlightGap(e.detail.gapId)}
    />
  </div>

  <!-- Footer Actions -->
  <div class="actions">
    <button on:click={() => timeBlockStore.refreshGaps()}>Refresh Gaps</button>
    <button on:click={() => timeBlockStore.acceptAll()} disabled={$timeBlockStore.status === 'saving'}>
      Accept All Suggestions
    </button>
  </div>
</div>
```

**New Component: TimeBlockGapCard.svelte**

```svelte
<script lang="ts">
  export let gap: TimeGap;
  export let primarySuggestion: TaskSuggestion;
  export let alternatives: TaskSuggestion[];

  let expanded = false;
  let selectedTaskId = primarySuggestion.task_id;

  function handleSwap(taskId: string) {
    selectedTaskId = taskId;
    dispatch('swap', { taskId });
  }
</script>

<div class="gap-card" class:expanded>
  <div class="gap-header" on:click={() => expanded = !expanded}>
    <div class="gap-time">
      <span class="badge {gap.time_of_day}">{gap.time_of_day}</span>
      {formatTime(gap.start)} - {formatTime(gap.end)}
      <span class="duration">{gap.duration_minutes}min</span>
    </div>

    <div class="suggested-task">
      <span class="task-title">{primarySuggestion.task_title}</span>
      <span class="fitness-score">{Math.round(primarySuggestion.fitness_score * 100)}% fit</span>
    </div>

    <button class="expand-icon">{expanded ? '▲' : '▼'}</button>
  </div>

  {#if expanded}
    <div class="gap-body">
      <!-- AI Rationale -->
      <div class="rationale">
        <strong>Why this task?</strong>
        <p>{primarySuggestion.rationale}</p>
      </div>

      <!-- Alternative Options -->
      {#if alternatives.length > 0}
        <div class="alternatives">
          <strong>Other options:</strong>
          {#each alternatives as alt}
            <button
              class="alternative-task"
              class:selected={selectedTaskId === alt.task_id}
              on:click={() => handleSwap(alt.task_id)}
            >
              <span class="task-title">{alt.task_title}</span>
              <span class="fitness">{Math.round(alt.fitness_score * 100)}%</span>
            </button>
          {/each}
        </div>
      {/if}

      <!-- Context Info -->
      {#if gap.follows_event}
        <div class="context">After: {gap.follows_event.summary}</div>
      {/if}
      {#if gap.precedes_event}
        <div class="context">Before: {gap.precedes_event.summary}</div>
      {/if}
    </div>
  {/if}
</div>
```

#### Design Patterns to Follow

**From existing UI research:**

1. **Progressive disclosure**: Collapsed cards expand for details (like TaskScheduleItem)
2. **Real-time feedback**: Live validation and conflict updates (like schedulingStore)
3. **Preservation of intent**: AI suggestions always accessible (like originalStart/originalEnd)
4. **Accessibility first**: ARIA labels, keyboard nav, focus management (like Modal.svelte)
5. **Mobile-first**: Touch-optimized, responsive layouts (like PhaseSchedulingModal)

**Color System** (extend existing):

```css
/* Gap types */
.gap.morning {
  @apply bg-amber-50 dark:bg-amber-900/20;
}
.gap.afternoon {
  @apply bg-blue-50 dark:bg-blue-900/20;
}
.gap.evening {
  @apply bg-purple-50 dark:bg-purple-900/20;
}

/* Fitness scores */
.fitness-high {
  @apply text-green-600 dark:text-green-400;
} /* >80% */
.fitness-medium {
  @apply text-amber-600 dark:text-amber-400;
} /* 50-80% */
.fitness-low {
  @apply text-red-600 dark:text-red-400;
} /* <50% */

/* Task energy types */
.energy-creative {
  @apply border-l-4 border-purple-500;
}
.energy-analytical {
  @apply border-l-4 border-blue-500;
}
.energy-admin {
  @apply border-l-4 border-gray-500;
}
.energy-social {
  @apply border-l-4 border-green-500;
}
.energy-physical {
  @apply border-l-4 border-orange-500;
}
```

---

## Architecture Insights

### 1. Guided Flexibility Philosophy Alignment

The timeblock-idea.md emphasizes **"Guided Flexibility"** - BuildOS already implements this:

**User Agency Preserved:**

- AI suggests optimal schedule
- User can edit, swap, or reject suggestions
- Original AI suggestions always accessible for reset
- Warnings inform but don't block

**AI Assists, Doesn't Dictate:**

- LLM provides reasoning for decisions
- Multiple alternatives presented
- User preferences learned over time
- Graceful degradation when AI unavailable

### 2. Two-Stage Architecture Pattern

**Established Pattern: Strategic AI + Tactical Algorithm**

This pattern successfully used in phase scheduling can extend to TimeBlock:

```
Stage 1 (LLM): "What should I do with this time?"
  → Understands task semantics (creative vs admin)
  → Matches energy levels to time of day
  → Considers project priorities and flow
  → Outputs: Task suggestions with rationale

Stage 2 (Algorithm): "Can I actually do this?"
  → Validates time conflicts
  → Ensures working hours alignment
  → Checks task availability (not already scheduled)
  → Outputs: Validated schedule ready to save
```

**Advantage:**

- LLM handles nuanced human decision-making
- Algorithm ensures technical correctness
- Separation of concerns = easier testing/debugging

### 3. Database Schema Evolution Path

**Incremental Enhancement Strategy:**

**Phase 1: Minimal Viable TimeBlock**

- Add only `energy_type` and `flexibility` to tasks
- Use existing `priority` string as proxy for priority_score
- Rely on `prefer_morning_for_important_tasks` for energy hints

**Phase 2: Enhanced Metadata**

- Add `priority_score` (0-100) for fine-grained ranking
- Add `optimal_time_of_day` for explicit timing preferences
- Add `focus_level` for cognitive load matching

**Phase 3: User Energy Profiles**

- Create `user_energy_profiles` table
- Track peak/low energy hours explicitly
- Learn patterns from task completion times

**Phase 4: Adaptive Learning**

- Track user swap decisions (rejected AI suggestions)
- Feed swap patterns back into future prompts
- Create `timeblock_feedback` table for ML training data

### 4. Frontend State Management Pattern

**Recommended Store Structure: timeBlockStore.ts**

```typescript
// Based on schedulingStore.ts pattern

interface TimeBlockState {
  status: "idle" | "loading" | "ready" | "saving" | "error";
  gaps: TimeGap[];
  gapMatches: GapTaskMatch[];
  userProfile: UserEnergyProfile | null;
  availableTasks: TaskWithTimeBlockMetadata[];
  highlightedGapId: string | null;
  error: string | null;
}

export const timeBlockStore = {
  ...writable<TimeBlockState>(initialState),

  async initialize(userId: string, timeRange: string) {
    // 1. Fetch calendar gaps
    // 2. Fetch backlog tasks with metadata
    // 3. Fetch user energy profile
    // 4. Call LLM for gap-task matching
    // 5. Validate suggestions
    // 6. Set state to 'ready'
  },

  async swapTask(gapId: string, newTaskId: string) {
    // 1. Update gapMatches in-memory
    // 2. Re-validate conflicts
    // 3. Track swap for learning (optional)
  },

  async acceptAll() {
    // 1. Batch update task.start_date for all gaps
    // 2. Create calendar events
    // 3. Sync to Google Calendar
    // 4. Redirect to calendar view
  },

  async refreshGaps() {
    // Re-fetch calendar and re-run matching
  },
};
```

### 5. LLM Prompt Engineering Insights

**From existing brain dump and phase generation prompts:**

**Critical Success Factors:**

1. **Explicit output schema** - JSON with typed fields prevents ambiguity
2. **Context richness** - Include user preferences, recent patterns, calendar context
3. **Constraint clarity** - State working hours, duration limits, conflict rules explicitly
4. **Reasoning transparency** - Require `rationale` field for every suggestion
5. **Temperature tuning** - 0.3 for scheduling (deterministic), 0.7 for creative tasks
6. **Model selection** - DeepSeek for complex JSON, Grok for speed, Claude for nuanced reasoning

**Recommended TimeBlock Prompt Structure:**

```markdown
# Role

You are BuildOS's TimeBlock scheduling assistant...

# User Context

- Energy profile: ...
- Recent completions: ...
- Current project priorities: ...

# Available Resources

## Time Gaps (Next 7 Days)

[Structured gap data]

## Tasks Available for Scheduling

[Filtered backlog with metadata]

# Matching Principles

[Energy alignment, duration fit, context awareness...]

# Constraints

- Only suggest tasks with status='backlog'
- Respect working hours: {work_start_time} - {work_end_time}
- Leave 10min buffer in each gap
- Max 1 task per gap

# Output Format

{JSON schema with examples}

# Examples

[2-3 example gap-task matches with reasoning]
```

---

## Open-Ended Design Questions

### 1. Gap Detection Granularity

**Question:** What is the minimum useful time gap?

**Options:**

- **A. 30 minutes** (existing increment, good for short admin tasks)
- **B. 45 minutes** (enough for meaningful work session)
- **C. 60 minutes** (align with calendar hour blocks)
- **D. User-configurable** (let each user decide their minimum)

**Considerations:**

- ADHD context: Shorter blocks might feel less overwhelming
- Context switching cost: Shorter gaps = more mental overhead
- Calendar aesthetics: Hour-aligned blocks look cleaner

**Recommendation:** Start with **30 minutes** (existing system default), add user preference later

---

### 2. Energy Type: Explicit vs Inferred

**Question:** How should we capture task energy types?

**Option A: Explicit User Input**

- User selects energy_type when creating task
- Dropdown: Creative / Analytical / Admin / Social / Physical
- Pros: Accurate, immediate
- Cons: Adds friction to task creation

**Option B: ML Inference**

- Analyze task title/description with LLM during brain dump
- Learn from user corrections over time
- Pros: Zero user effort
- Cons: Requires training data, may be inaccurate initially

**Option C: Hybrid**

- LLM suggests energy_type during brain dump
- User can edit/confirm in task details
- Show energy badge on task cards for quick visual reference
- Pros: Best of both worlds
- Cons: More complex to implement

**Recommendation:** **Option C (Hybrid)** - LLM inference with manual override

---

### 3. Suggestion Multiplicity

**Question:** How many task suggestions per gap?

**Option A: Single Best Match**

- Show only AI's top pick
- Pros: Simple, decisive
- Cons: Removes user agency

**Option B: 1 Primary + 2-3 Alternatives**

- Primary is highlighted, alternatives in dropdown/expansion
- Pros: Guided flexibility, user choice
- Cons: More UI complexity

**Option C: Ranked List (5+)**

- Show all viable options sorted by fitness
- Pros: Maximum flexibility
- Cons: Decision paralysis, overwhelming

**Recommendation:** **Option B (1 + 2-3)** - aligns with "Guided Flexibility" philosophy

---

### 4. Time of Day Energy Profiles

**Question:** How granular should energy profiles be?

**Option A: Simple (Morning/Afternoon/Evening)**

```typescript
{
  preferred_deep_work_time: "morning" | "afternoon" | "evening";
}
```

**Option B: Hourly Blocks**

```typescript
{
  peak_energy_hours: ['09:00', '10:00', '11:00'],
  low_energy_hours: ['14:00', '15:00']
}
```

**Option C: Continuous Energy Curve**

```typescript
{
  energy_by_hour: {
    '09:00': 0.9,
    '10:00': 0.95,
    '11:00': 0.85,
    // ... for each hour
  }
}
```

**Recommendation:** Start with **Option A (Simple)**, evolve to **Option B (Hourly)** as users engage

---

### 5. Gap Refresh Strategy

**Question:** When should time gaps be recalculated?

**Option A: Manual Refresh Only**

- User clicks "Refresh Gaps" button
- Pros: Predictable, low server load
- Cons: Stale data if calendar changes

**Option B: Webhook-Triggered Auto-Refresh**

- Google Calendar webhook notifies on event changes
- Auto-refresh gaps in background
- Pros: Always up-to-date
- Cons: Complex, requires webhook infrastructure (already exists!)

**Option C: Periodic Polling (Every 15 minutes)**

- Check for calendar updates on interval
- Pros: Balance between fresh and performant
- Cons: Can miss immediate changes

**Recommendation:** **Option B (Webhooks)** - BuildOS already has webhook endpoint at `/api/calendar/webhook/+server.ts`

---

### 6. Multi-Calendar Support

**Question:** Should TimeBlock consider all user calendars or just primary?

**Current State:** Only queries primary Google Calendar

**Enhancement:**

```typescript
// CalendarService.findAvailableSlots enhancement
findAvailableSlots({
  calendarIds: ["primary", "work-calendar-id", "family-calendar-id"],
  mergeStrategy: "union", // Combine busy times from all calendars
});
```

**Consideration:**

- Work/personal calendar separation is common
- Users may want to protect personal time from work task scheduling
- Need UI to select which calendars influence gap detection

**Recommendation:** **Phase 2 feature** - Start with primary, add multi-calendar later

---

### 7. Flexibility Field Usage

**Question:** How should the `flexibility` field affect scheduling?

**Proposed Behavior:**

**Fixed Tasks:**

- User explicitly sets time (e.g., "Call at 2pm")
- TimeBlock **never suggests moving** these
- Treated as occupied slots for gap detection

**Flexible Tasks:**

- Can be scheduled in any available gap
- AI suggests optimal time based on energy/context
- Default for most tasks

**Moveable Tasks:**

- Currently scheduled but open to better placement
- AI can suggest "move this from Tuesday 2pm to Monday 10am for better energy match"
- Requires user approval to move

**Recommendation:** Implement **Fixed** and **Flexible** first, add **Moveable** in Phase 2 with more sophisticated rescheduling logic

---

### 8. Priority Score Calculation

**Question:** Should priority_score be manual or computed?

**Option A: User Input (0-100 slider)**

- Direct control
- Cons: Decision fatigue

**Option B: Computed from Multiple Factors**

```typescript
priority_score = weighted_sum(
  project.importance * 0.4,
  task.urgency * 0.3,
  task.impact * 0.2,
  task.dependencies_blocked_count * 0.1,
);
```

**Option C: LLM-Assigned During Brain Dump**

- AI infers from context
- User can override

**Recommendation:** **Option C (LLM-Assigned)** with manual override, display as colored badge rather than numeric score (reduce cognitive load)

---

## Specification: TimeBlock Feature Implementation

### Phase 1: MVP - Foundation (1-2 weeks)

#### Database Changes

**Migration: `20251004_add_timeblock_metadata.sql`**

```sql
-- Add TimeBlock fields to tasks
ALTER TABLE tasks
  ADD COLUMN energy_type text,
  ADD COLUMN flexibility text DEFAULT 'flexible';

ALTER TABLE tasks
  ADD CONSTRAINT tasks_energy_type_check
    CHECK (energy_type IN ('creative', 'analytical', 'admin', 'social', 'physical')),
  ADD CONSTRAINT tasks_flexibility_check
    CHECK (flexibility IN ('fixed', 'flexible'));

-- Add user energy preferences to existing table
ALTER TABLE user_calendar_preferences
  ADD COLUMN preferred_deep_work_time text DEFAULT 'morning';

ALTER TABLE user_calendar_preferences
  ADD CONSTRAINT preferred_time_check
    CHECK (preferred_deep_work_time IN ('morning', 'afternoon', 'evening'));

-- Index for TimeBlock queries
CREATE INDEX idx_tasks_backlog_timeblock ON tasks(status, energy_type)
  WHERE status = 'backlog' AND deleted_at IS NULL;
```

#### TypeScript Types

**File: `/apps/web/src/lib/types/timeblock.types.ts`**

```typescript
export type EnergyType =
  | "creative"
  | "analytical"
  | "admin"
  | "social"
  | "physical";
export type Flexibility = "fixed" | "flexible";
export type OptimalTime = "morning" | "afternoon" | "evening";

export interface TimeGap {
  id: string;
  start: Date;
  end: Date;
  duration_minutes: number;
  time_of_day: OptimalTime;
  follows_event?: { summary: string; end: Date };
  precedes_event?: { summary: string; start: Date };
}

export interface TaskSuggestion {
  task_id: string;
  task_title: string;
  energy_type: EnergyType;
  duration_minutes: number;
  rationale: string;
  fitness_score: number; // 0-1
}

export interface GapTaskMatch {
  gap: TimeGap;
  primary_suggestion: TaskSuggestion;
  alternatives: TaskSuggestion[];
}
```

#### Backend Service

**File: `/apps/web/src/lib/services/timeblock-matcher.service.ts`**

```typescript
export class TimeBlockMatcherService {
  async findGapsWithSuggestions(
    userId: string,
    timeRange: { start: Date; end: Date },
  ): Promise<GapTaskMatch[]> {
    // 1. Fetch calendar gaps using existing CalendarService
    const gaps = await this.calendarService.findAvailableSlots({
      userId,
      timeMin: timeRange.start,
      timeMax: timeRange.end,
      duration_minutes: 30, // Minimum gap size
      increment: 30,
    });

    // 2. Fetch backlog tasks with TimeBlock metadata
    const availableTasks = await this.supabase
      .from("tasks")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "backlog")
      .is("deleted_at", null)
      .is("start_date", null); // Not already scheduled

    // 3. Fetch user preferences
    const preferences = await this.getUserPreferences(userId);

    // 4. Categorize gaps by time of day
    const categorizedGaps = gaps.map((g) => ({
      ...g,
      time_of_day: this.categorizeTimeOfDay(g.start),
    }));

    // 5. Call LLM for intelligent matching
    const llmMatches = await this.getLLMMatches(
      categorizedGaps,
      availableTasks,
      preferences,
    );

    // 6. Validate and return
    return this.validateMatches(llmMatches);
  }

  private categorizeTimeOfDay(date: Date): OptimalTime {
    const hour = date.getHours();
    if (hour >= 6 && hour < 12) return "morning";
    if (hour >= 12 && hour < 17) return "afternoon";
    return "evening";
  }

  private async getLLMMatches(
    gaps: TimeGap[],
    tasks: Task[],
    preferences: UserCalendarPreferences,
  ): Promise<GapTaskMatch[]> {
    const prompt = this.buildMatchingPrompt(gaps, tasks, preferences);

    const response = await this.smartLLMService.getJSONResponse({
      systemPrompt: "TimeBlock scheduling assistant",
      userPrompt: prompt,
      userId: this.userId,
      profile: "balanced",
      temperature: 0.3,
      operationType: "timeblock_matching",
    });

    return response.gap_matches;
  }
}
```

#### API Endpoint

**File: `/apps/web/src/routes/api/timeblocks/+server.ts`**

```typescript
export async function GET({ locals, url }: RequestEvent) {
  const session = await locals.auth();
  if (!session?.user?.id) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const timeRange = url.searchParams.get("range") || "next_3_days";
  const { start, end } = calculateTimeRange(timeRange);

  const matcherService = new TimeBlockMatcherService(
    locals.supabase,
    session.user.id,
  );

  const gapMatches = await matcherService.findGapsWithSuggestions(
    session.user.id,
    { start, end },
  );

  return json({ gap_matches: gapMatches });
}

export async function POST({ locals, request }: RequestEvent) {
  // Accept user's TimeBlock selections and schedule tasks
  const session = await locals.auth();
  if (!session?.user?.id) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const { accepted_matches } = await request.json();

  // Update task.start_date for each accepted match
  // Create calendar events
  // Return success

  return json({ success: true, scheduled_count: accepted_matches.length });
}
```

#### Frontend Store

**File: `/apps/web/src/lib/stores/timeBlockStore.ts`**

```typescript
interface TimeBlockState {
  status: "idle" | "loading" | "ready" | "saving" | "error";
  gapMatches: GapTaskMatch[];
  highlightedGapId: string | null;
  error: string | null;
}

function createTimeBlockStore() {
  const { subscribe, set, update } = writable<TimeBlockState>({
    status: "idle",
    gapMatches: [],
    highlightedGapId: null,
    error: null,
  });

  return {
    subscribe,

    async initialize(timeRange: string = "next_3_days") {
      update((s) => ({ ...s, status: "loading" }));

      try {
        const response = await fetch(`/api/timeblocks?range=${timeRange}`);
        const data = await response.json();

        set({
          status: "ready",
          gapMatches: data.gap_matches,
          highlightedGapId: null,
          error: null,
        });
      } catch (error) {
        set({
          status: "error",
          gapMatches: [],
          highlightedGapId: null,
          error: error.message,
        });
      }
    },

    swapTask(gapId: string, newTaskId: string) {
      update((state) => {
        const gapMatch = state.gapMatches.find((gm) => gm.gap.id === gapId);
        if (!gapMatch) return state;

        // Find task in alternatives
        const newTask = gapMatch.alternatives.find(
          (a) => a.task_id === newTaskId,
        );
        if (!newTask) return state;

        // Swap primary with alternative
        const updatedMatch = {
          ...gapMatch,
          primary_suggestion: newTask,
          alternatives: [
            gapMatch.primary_suggestion,
            ...gapMatch.alternatives.filter((a) => a.task_id !== newTaskId),
          ],
        };

        return {
          ...state,
          gapMatches: state.gapMatches.map((gm) =>
            gm.gap.id === gapId ? updatedMatch : gm,
          ),
        };
      });
    },

    async acceptAll() {
      update((s) => ({ ...s, status: "saving" }));

      try {
        const acceptedMatches = get(this).gapMatches.map((gm) => ({
          gap_id: gm.gap.id,
          task_id: gm.primary_suggestion.task_id,
          scheduled_start: gm.gap.start,
        }));

        await fetch("/api/timeblocks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accepted_matches: acceptedMatches }),
        });

        update((s) => ({ ...s, status: "idle" }));
        goto("/calendar"); // Redirect to calendar view
      } catch (error) {
        update((s) => ({ ...s, status: "error", error: error.message }));
      }
    },
  };
}

export const timeBlockStore = createTimeBlockStore();
```

#### UI Component

**File: `/apps/web/src/lib/components/timeblock/TimeBlockView.svelte`**

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { timeBlockStore } from '$lib/stores/timeBlockStore';
  import TimeBlockGapCard from './TimeBlockGapCard.svelte';
  import CalendarView from '$lib/components/scheduling/CalendarView.svelte';

  export let timeRange: 'next_3_days' | 'next_week' = 'next_3_days';

  onMount(() => {
    timeBlockStore.initialize(timeRange);
  });

  $: isLoading = $timeBlockStore.status === 'loading';
  $: isSaving = $timeBlockStore.status === 'saving';
  $: hasGaps = $timeBlockStore.gapMatches.length > 0;
</script>

<div class="timeblock-view">
  <header class="page-header">
    <h1>TimeBlocks</h1>
    <p class="subtitle">
      {#if hasGaps}
        You have {$timeBlockStore.gapMatches.length} free blocks available
      {:else}
        No available time blocks found
      {/if}
    </p>
  </header>

  {#if isLoading}
    <div class="loading-state">
      <Spinner />
      <p>Finding your free time blocks...</p>
    </div>
  {:else if $timeBlockStore.error}
    <div class="error-state">
      <AlertTriangle />
      <p>{$timeBlockStore.error}</p>
    </div>
  {:else if hasGaps}
    <div class="timeblock-content">
      <!-- Left Panel: Gap Cards -->
      <div class="gap-list">
        {#each $timeBlockStore.gapMatches as gapMatch (gapMatch.gap.id)}
          <TimeBlockGapCard
            gap={gapMatch.gap}
            primarySuggestion={gapMatch.primary_suggestion}
            alternatives={gapMatch.alternatives}
            on:swap={(e) => timeBlockStore.swapTask(gapMatch.gap.id, e.detail.taskId)}
          />
        {/each}
      </div>

      <!-- Right Panel: Calendar Visualization -->
      <div class="calendar-panel">
        <CalendarView
          events={$timeBlockStore.gapMatches.map(gm => ({
            id: gm.gap.id,
            title: gm.primary_suggestion.task_title,
            start: gm.gap.start,
            end: gm.gap.end
          }))}
        />
      </div>
    </div>

    <!-- Footer Actions -->
    <footer class="action-bar">
      <button
        class="btn-secondary"
        on:click={() => timeBlockStore.initialize(timeRange)}
      >
        Refresh
      </button>
      <button
        class="btn-primary"
        disabled={isSaving}
        on:click={() => timeBlockStore.acceptAll()}
      >
        {isSaving ? 'Scheduling...' : 'Accept All Suggestions'}
      </button>
    </footer>
  {:else}
    <div class="empty-state">
      <Calendar />
      <h2>No free time blocks found</h2>
      <p>Your calendar is fully booked for the selected time range.</p>
    </div>
  {/if}
</div>

<style>
  .timeblock-view {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .timeblock-content {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2rem;
    flex: 1;
    overflow: hidden;
  }

  @media (max-width: 768px) {
    .timeblock-content {
      grid-template-columns: 1fr;
    }
    .calendar-panel {
      display: none; /* Hide calendar on mobile */
    }
  }

  .gap-list {
    overflow-y: auto;
    padding-right: 1rem;
  }

  .action-bar {
    display: flex;
    justify-content: flex-end;
    gap: 1rem;
    padding: 1rem;
    border-top: 1px solid var(--border-color);
  }
</style>
```

---

### Phase 2: Enhanced Metadata (1 week)

**Add:**

- `priority_score` (0-100) to tasks
- `optimal_time_of_day` to tasks
- `focus_level` to tasks
- Hourly energy profile (`peak_energy_hours`, `low_energy_hours`)
- UI for editing task metadata in task detail modal
- LLM prompt enhancement to use new fields

---

### Phase 3: Adaptive Learning (2 weeks)

**Add:**

- `timeblock_feedback` table to track user swaps
- Feedback loop: when user swaps Task A for Task B, store the decision
- Enhance LLM prompts with recent swap patterns
- Analytics: "You tend to prefer creative work in the morning, admin in afternoon"

---

### Phase 4: Advanced Features (3 weeks)

**Add:**

- Multi-calendar support (select which calendars influence gaps)
- "Moveable tasks" - AI suggests rescheduling existing tasks for better flow
- Energy curve visualization - show user's energy levels throughout the day
- Weekly planning mode - "Here's your week, optimize all TimeBlocks at once"
- Notification system - "You have 2 free hours tomorrow morning, schedule your deep work task?"

---

## Code References

### Calendar & Gap Detection

- `CalendarService.findAvailableSlots()` - `/apps/web/src/lib/services/calendar-service.ts:429-515`
- `TaskTimeSlotFinder.findAvailableSlot()` - `/apps/web/src/lib/services/task-time-slot-finder.ts:355-402`
- Free/Busy API integration - `calendar-service.ts:429-459`

### Task Scheduling

- Phase scheduling endpoint - `/apps/web/src/routes/api/projects/[id]/phases/[phaseId]/schedule/+server.ts`
- Two-stage scheduling (LLM + Algorithm) - Lines 748-992
- Conflict validation - `/apps/web/src/lib/utils/schedulingUtils.ts:137-232`

### Data Models

- Tasks table schema - `/packages/shared-types/src/database.schema.ts:953-978`
- User preferences schema - `database.schema.ts:1001-1016`
- Task types - `/apps/web/src/lib/types/project.ts:10-188`

### AI/LLM Integration

- SmartLLMService - `/apps/web/src/lib/services/smart-llm-service.ts`
- Phase generation prompts - `/apps/web/src/lib/services/promptTemplate.service.ts:694-862`
- Calendar analysis AI - `/apps/web/src/lib/services/calendar-analysis.service.ts:283-591`

### UI/UX Patterns

- PhaseSchedulingModal - `/apps/web/src/lib/components/project/PhaseSchedulingModal.svelte:1-530`
- TaskScheduleItem - `/apps/web/src/lib/components/scheduling/TaskScheduleItem.svelte:1-289`
- ScheduleConflictAlert - `/apps/web/src/lib/components/scheduling/ScheduleConflictAlert.svelte:1-327`
- CalendarView - `/apps/web/src/lib/components/scheduling/CalendarView.svelte:1-436`
- schedulingStore - `/apps/web/src/lib/stores/schedulingStore.ts:1-379`

### Documentation

- TimeBlock idea document - `/timeblock-idea.md`
- Phase scheduling plan - `/apps/web/docs/development/phase-intelligent-scheduling-plan.md`
- Calendar integration docs - `/apps/web/docs/features/calendar-integration/`

---

## Related Research

**Existing Research Documents:**

- Task time slot finder null preferences bug - `thoughts/shared/research/2025-10-03_21-45-00_task-time-slot-finder-null-preferences-bug.md`
- Phase scheduling continuous loading bug - `thoughts/shared/research/2025-10-03_22-00-00_phase-scheduling-continuous-loading-bug.md`
- Phase scheduling modal redesign - `thoughts/shared/research/2025-10-03_phase-scheduling-modal-redesign.md`
- Notification system completion assessment - `thoughts/shared/research/2025-10-04_03-45-44_notification-system-completion-assessment.md`

---

## Open Questions

### Technical Implementation

1. **Gap categorization algorithm:** Should gaps immediately following meetings be automatically marked as "low energy" and deprioritized for deep work?

2. **Fitness score calculation:** What weights should we assign to different factors?

   ```
   fitness_score =
     energy_match * 0.4 +
     duration_fit * 0.3 +
     priority_urgency * 0.2 +
     context_appropriateness * 0.1
   ```

3. **LLM cost optimization:** TimeBlock matching might be called frequently. Should we:
   - Cache matches for 15 minutes?
   - Use faster/cheaper model (Grok) for simple cases?
   - Fall back to algorithmic matching if LLM quota exceeded?

4. **Real-time sync:** When user's calendar changes (new event added), should:
   - Auto-refresh gaps immediately (via webhook)?
   - Show notification "Your TimeBlocks have changed"?
   - Or only refresh on manual request?

### Product & UX

5. **Task visibility:** Should TimeBlock only suggest backlog tasks, or also:
   - In-progress tasks (that need continuation)?
   - Tasks from specific projects (user-selected)?
   - Recurring tasks that need rescheduling?

6. **Energy profile onboarding:** How do we capture user energy preferences?
   - Explicit survey during onboarding?
   - Infer from task completion times over first 2 weeks?
   - Ask users to rate their energy level when completing tasks?

7. **Gap density:** If calendar is very busy with many small gaps (15-30 min), should we:
   - Show all gaps (might be overwhelming)?
   - Only show "meaningful" gaps (60+ minutes)?
   - Combine adjacent small gaps if possible?

8. **Notification strategy:** When should users be notified about TimeBlocks?
   - Daily morning: "Here are your 3 free blocks today"?
   - When new gap appears (meeting canceled)?
   - Only when user explicitly visits TimeBlock page?

### Future Enhancements

9. **Week-level optimization:** Instead of gap-by-gap matching, should we offer:
   - "Optimize my entire week" mode?
   - Show before/after comparison of proposed schedule?
   - Allow bulk acceptance/rejection?

10. **Team coordination:** For future team features, should TimeBlock:
    - Suggest collaborative work blocks when teammates are free?
    - Respect "focus time" blocks set by user?
    - Integrate with team project priorities?

11. **Habit building:** Should TimeBlock learn and reinforce patterns?
    - "You always do creative work Monday mornings - protect this time?"
    - "Your admin tasks tend to slip - want me to auto-schedule 30min Friday afternoon?"

12. **Energy tracking evolution:** Should we eventually:
    - Ask user to rate energy level when completing tasks?
    - Build ML model to predict energy patterns?
    - Correlate with sleep data (future integration)?

---

## Next Steps

**Immediate Actions:**

1. Review this research with team/stakeholders
2. Prioritize open design questions (create ADRs for key decisions)
3. Validate LLM prompt approach with small prototype
4. Design database migration (start with minimal fields)
5. Create UI mockups for TimeBlockView component
6. Estimate engineering effort for each phase

**Week 1:**

- Implement Phase 1 database migration
- Build TimeBlockMatcherService backend
- Create basic LLM prompt for gap-task matching
- Test with sample data

**Week 2:**

- Build TimeBlockView UI component
- Implement timeBlockStore state management
- Create API endpoints
- Manual QA with real user calendar data

**Week 3:**

- User testing with 5-10 beta users
- Collect feedback on AI suggestions quality
- Iterate on fitness score algorithm
- Prepare for broader rollout

---

**Research complete.** Ready to proceed with implementation planning and design decisions.
