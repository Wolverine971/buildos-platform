<!-- apps/web/docs/features/calendar-integration/README.md -->

# Calendar Integration Feature

Google Calendar sync with bidirectional updates for task scheduling and availability awareness.

## Documentation in This Folder

- `calendar-ingestion-integration-plan.md` - Original integration plan
- `calendar-analysis-implementation-status.md` - Implementation status
- `calendar-ingestion-buildos-implementation.md` - Detailed implementation guide
- `calendar-cleanup-phase-regeneration-analysis.md` - Phase regeneration analysis
- `calendar-analysis-bugs-investigation.md` - Bug investigation notes
- `calendar-analysis-task-improvement-research.md` - Task improvement research
- `dashboard-calendar-spec.md` - Dashboard calendar UI spec

## Features

- **OAuth Integration**: Google Calendar OAuth flow
- **Event Sync**: Two-way sync with Google Calendar
- **Webhook Notifications**: Real-time calendar change notifications
- **Project Calendars**: Per-project Google Calendar creation
- **Conflict Detection**: Identifies scheduling conflicts
- **Smart Scheduling**: Tasks scheduled around calendar commitments

## Key Files

**Services:**

- `/src/lib/services/calendar-service.ts` - Main calendar operations
- `/src/lib/services/calendar-webhook-service.ts` - Webhook handling

**Components:**

- `/src/lib/components/calendar/` - Calendar UI components

**API:**

- `/src/routes/api/calendar/` - Calendar API endpoints
- `/src/routes/api/webhooks/calendar/` - Webhook endpoints

## Production Route Verification — 2026-08-29

The authenticated connected-calendar route completed a real create, read, update, and delete
lifecycle against the primary Google Calendar source. The smoke scheduled a temporary weekly event,
read all three occurrences (August 31, September 7, and September 14), shifted the series from
3:00–3:30 PM to 3:15–3:45 PM, then deleted the Google series and its temporary BuildOS task.
Cleanup verification found zero live ontology events, zero non-cancelled mappings, and zero pending
orphans.

Two production defects were fixed during the smoke:

- Migration `20260829223736_restore_personal_onto_events_rls.sql` restores narrow RLS access for
  projectless personal events while keeping project events membership-scoped and preventing actor
  or ownership reassignment. It is applied and recorded in the production migration ledger.
- Commit `12af23f7c` routes ontology task schedules through `onto_events`, `onto_event_sync`, and a
  project-scoped `task -> has_event -> event` edge instead of the legacy `task_calendar_events`
  foreign key. Vercel deployment `dpl_4Ca3vHThfJUJFNWYnU98Gx2v5BrE` is Ready and aliased to
  `build-os.com`.
- Migration `20260829235830_add_onto_event_sync_event_user_provider_uniqueness.sql` adds the unique
  `(event_id, user_id, provider)` conflict target used by source-aware mapping upserts. It is applied
  and recorded in the production migration ledger.

Verification evidence:

- Focused calendar tests pass 41/41; the personal-event SQL contracts pass 17/17.
- `svelte-check` reports 0 errors and 0 warnings for the calendar implementation, the test-type
  debt gate remains at its accepted 538/538 baseline, and the server-route guard passes with 31
  grandfathered routes.
- CI run `33281881278` fails only on the same seven typecheck errors already present on parent run
  `33281310226`, in `gmail-database.types.ts` and the two ontology task route files. No calendar
  check failed.

The smoke also exposed two separate legacy-surface defects: `/time-blocks` reports no calendar
connection while the multi-source dashboard has two connected accounts, and the task recurrence
editor writes the removed `onto_tasks.plan_id` column. These remain tracked in Tasker 74 and do not
invalidate the verified calendar route lifecycle.

## Related Documentation

- Architecture: `/apps/web/docs/technical/architecture/calendar-sync.md`
- Calendar service flow: `/apps/web/docs/technical/architecture/CALENDAR_SERVICE_FLOW.md`
- Webhook flow: `/apps/web/docs/technical/architecture/CALENDAR_WEBHOOK_FLOW.md`

---

## 🎯 Calendar Analysis Flow - Improvement Recommendations

> **Research Date**: 2025-10-06
> **Full Research**: `/thoughts/shared/research/2025-10-06_02-30-00_calendar-analysis-flow-audit.md`

### Executive Summary

The calendar analysis system successfully detects project patterns from Google Calendar events using AI. However, research revealed **critical gaps** in deduplication and task density that impact user experience:

#### Key Issues Identified:

1. 🚨 **Zero Project Deduplication**
    - LLM has no knowledge of user's existing projects
    - Results in duplicate projects (e.g., "Marketing Campaign" created when "Q4 Marketing" already exists)
    - Infrastructure to fix this **already exists** but is unused

2. ⚠️ **Sparse Task Generation**
    - System generates 2-5 tasks per project regardless of event count
    - Users with 10+ related events may feel tasks are missing
    - Not all calendar events become tasks (some are context-only)

3. ✅ **Strong Quality Controls**
    - Excellent date validation (all tasks are future-dated)
    - Good confidence filtering (40% minimum threshold)
    - Proper event filtering (excludes declined, personal events)

### 🏆 Priority 1: Add Project Deduplication (High Impact, Medium Effort)

**Problem**: Calendar analysis creates new projects without checking if similar projects already exist.

**Solution**: Use existing deduplication infrastructure (currently unused):

#### Implementation Steps:

**1. Fetch existing projects** (in `calendar-analysis.service.ts:145`)

```typescript
const projectDataFetcher = ProjectDataFetcher.getInstance(this.supabase);
const existingProjects = await projectDataFetcher.getAllUserProjectsSummary(userId, {
	limit: 50,
	includeStatus: ['active', 'planning']
});

const projectsContext = formatProjectsSummaryList(existingProjects);
```

**2. Update AI prompt** (line 316)

```typescript
const userPrompt = `
## User's Existing Projects

${projectsContext}

---

When analyzing calendar events:
1. Check if detected patterns match existing projects (by name, tags, context)
2. If match found: suggest adding tasks to existing project
3. Only create new projects if meaningfully different
4. Include "add_to_existing: true" with "existing_project_id: <id>" when appropriate

<rest of prompt>
`;
```

**3. Update response schema**

```json
{
	"suggestions": [
		{
			"add_to_existing": false,
			"existing_project_id": null,
			"deduplication_reasoning": "..."
			// ... other fields
		}
	]
}
```

**4. Handle in acceptance logic**

```typescript
if (suggestion.add_to_existing && suggestion.existing_project_id) {
	// Add tasks to existing project instead of creating new one
}
```

**Expected Impact**:

- ✅ 60-80% reduction in duplicate projects
- ✅ Better task organization (consolidated)
- ✅ Improved user confidence

**Files to Modify**:

- `/src/lib/services/calendar-analysis.service.ts` (lines 145, 316, 433, 596)
- `/src/lib/components/calendar/CalendarAnalysisResults.svelte` (add deduplication UI)

---

### 🎯 Priority 2: Improve Task Generation Density (High Impact, Low Effort)

**Problem**: Fixed 2-5 task count feels sparse when user has 10+ related calendar events.

**Solution**: Make task count adaptive based on event count.

#### Implementation:

**1. Calculate adaptive task count** (line 290)

```typescript
const upcomingEventCount = upcomingEvents.length;
const targetTaskCount = Math.max(
	3, // Minimum
	Math.min(
		Math.ceil(upcomingEventCount * 0.5), // 50% of events
		12 // Maximum
	)
);
```

**2. Update prompt** (line 400)

```typescript
**You MUST generate ${targetTaskCount} tasks for this project.**

Guidelines:
- ${upcomingEventCount} upcoming events → target ~${targetTaskCount} tasks
- Convert key events to tasks (preserve dates/recurrence)
- Add inferred preparation/follow-up tasks
- Group similar recurring events if appropriate
```

**Examples**:

- 2 upcoming events → 3 tasks (minimum)
- 6 upcoming events → 3 tasks (50%)
- 15 upcoming events → 8 tasks (50%)
- 30 upcoming events → 12 tasks (capped)

**Expected Impact**:

- ✅ More tasks when user has many events
- ✅ Better alignment with user expectations
- ✅ Reduced feeling of "missing tasks"

---

### 🎯 Priority 3: Provide Task Generation Transparency (Medium Impact, Low Effort)

**Problem**: User doesn't understand why only 3 tasks were created from 10 events.

**Solution**: Show event-to-task mapping and allow manual conversion.

#### Implementation:

**1. Track in LLM response**

```json
{
	"task_event_mapping": [
		{ "task_index": 0, "event_ids": ["event1", "event2"] },
		{ "task_index": 1, "event_ids": [] } // Inferred
	],
	"events_used_for_context_only": ["event3", "event4"]
}
```

**2. Show in UI** (CalendarAnalysisResults.svelte)

```svelte
<div class="text-xs text-gray-500 mt-2">
	📊 {taskCount} tasks from {eventCount} events ({contextOnlyCount} used for context)
	<button on:click={showDetails}>View breakdown</button>
</div>
```

**3. Allow conversion**

```svelte
<button on:click={convertRemainingEvents}>
	Convert {contextOnlyCount} unused events to tasks
</button>
```

**Expected Impact**:

- ✅ User understands what happened to each event
- ✅ Control to convert more events if desired
- ✅ Builds trust in system intelligence

---

### 🎯 Priority 4: Enrich Task Details from Events (Medium Impact, Low Effort)

**Problem**: Tasks from calendar events lack meeting context (attendees, location, links).

**Solution**: Include rich event metadata in task details.

#### Implementation:

**1. Update prompt** (line 405)

```typescript
When converting events to tasks, include:
- Title: Clear action from event
- Description: Brief summary
- Details: Event description + attendees + location + meeting link
- Duration: From event start-end time
```

**2. Enhance task creation** (line 677)

```typescript
if (task.event_id) {
	const event = events.find((e) => e.id === task.event_id);
	task.details = `
**Meeting Details:**
- Attendees: ${event.attendees?.join(', ')}
- Location: ${event.location || 'N/A'}
- Meeting Link: ${event.meetingLink || 'N/A'}

---

${task.details}
  `.trim();
}
```

**Expected Impact**:

- ✅ Richer task context
- ✅ Direct meeting access from tasks
- ✅ Better task execution

---

### 🎯 Priority 5: Smart Recurring Event Handling (Medium Impact, Medium Effort)

**Problem**: 10 recurring "Sprint Planning" events → 1 recurring task feels like information loss.

**Solution**: Provide options for recurring event conversion.

#### Implementation:

**1. Update prompt logic**

```typescript
When detecting recurring events:

Option 1: ONE recurring task (if all occurrences are identical)
- Example: "Weekly Team Standup"

Option 2: MULTIPLE one-off tasks (if occurrences have distinct milestones)
- Example: "Sprint 1 Planning", "Sprint 2 Planning", etc.

Decision criteria:
- Event title has numbers/dates → separate tasks
- Event description changes → separate tasks
- All identical → single recurring task
```

**2. UI conversion option**

```svelte
{#if task.task_type === 'recurring'}
	<button on:click={expandToSeparateTasks}>
		Expand to {eventOccurrenceCount} separate tasks
	</button>
{/if}
```

**Expected Impact**:

- ✅ Better representation of event series
- ✅ User control over recurring behavior
- ✅ Flexibility for milestone-based events

---

### 📊 Implementation Priority Matrix

| Priority | Feature               | Effort | Impact       | Status                              |
| -------- | --------------------- | ------ | ------------ | ----------------------------------- |
| **P1**   | Project Deduplication | Medium | 🔥 Very High | Infrastructure exists, needs wiring |
| **P2**   | Adaptive Task Count   | Low    | High         | Straightforward prompt change       |
| **P3**   | Task Transparency     | Low    | Medium       | UI enhancement                      |
| **P4**   | Rich Task Details     | Low    | Medium       | Simple data enrichment              |
| **P5**   | Recurring Handling    | Medium | Medium       | Requires UX design                  |

### 🚀 Quick Win Strategy

**Week 1 (High Impact, Low Effort):**

1. ✅ Implement P1: Project Deduplication
2. ✅ Implement P4: Enrich Task Details
3. ✅ Implement P2: Adaptive Task Count

**Week 2 (Testing & Refinement):** 4. ⚠️ Test deduplication sensitivity with users 5. ⚠️ Tune task count formula based on feedback 6. ✅ Add P3: Task Transparency

**Week 3+ (Advanced Features):** 7. 🔨 Design and implement P5: Recurring Event Handling 8. 🔨 Consider post-analysis refinement options

---

### 🔍 Key Architectural Insights

**What's Working Well:**

- ✅ Event timeline separation (past = context, upcoming = tasks)
- ✅ Dual task generation (event-based + inferred)
- ✅ Strong date validation (no past tasks)
- ✅ Confidence-based filtering
- ✅ Operations-based execution pattern

**What Needs Improvement:**

- ❌ No project deduplication (infrastructure exists but unused)
- ❌ Fixed task count (doesn't scale with event count)
- ❌ Limited transparency (user doesn't see event → task logic)
- ❌ Sparse event metadata in tasks

**Unused Infrastructure (Ready to Use):**

- `ProjectDataFetcher.getAllUserProjectsSummary()` - Fetches existing projects with metadata
- `formatProjectsSummaryList()` - Formats projects for LLM context
- Both methods exist in `/src/lib/services/prompts/core/` but are never called by calendar analysis

---

### 📝 Technical Notes

**Current Prompt Location**:

- Inline in `calendar-analysis.service.ts` lines 316-496 (not external template)

**LLM Configuration**:

- Profile: 'balanced' (accuracy/speed)
- Temperature: 0.3 (consistent outputs)
- Confidence threshold: 0.4 (40% minimum)

**Task Generation Rules**:

- Current: 2-5 tasks per project (fixed)
- Recommended: 3-12 tasks (adaptive based on event count)
- Two approaches: event-based + inferred next steps

**Key Files for Modifications**:

- `/src/lib/services/calendar-analysis.service.ts` - Core logic
- `/src/lib/components/calendar/CalendarAnalysisResults.svelte` - UI
- `/src/lib/services/prompts/core/project-data-fetcher.ts` - Deduplication (exists, unused)
- `/src/lib/services/prompts/core/data-formatter.ts` - Formatting (exists, unused)

---

### 🎯 Expected Outcomes

**After implementing P1-P4:**

- 60-80% reduction in duplicate projects
- 30-50% increase in perceived task completeness
- Improved user confidence in AI intelligence
- Better task organization and consolidation
- Richer task context with meeting details

**User Experience Improvements:**

1. System suggests adding to existing projects instead of creating duplicates
2. More tasks when user has many calendar events
3. Transparency about event → task conversion
4. Meeting links and attendees included in tasks
5. Control over recurring event handling

---

### 📚 Additional Resources

**Full Research Document**: `/thoughts/shared/research/2025-10-06_02-30-00_calendar-analysis-flow-audit.md`

**Related Documentation**:

- Project Deduplication Infrastructure: `/thoughts/shared/research/2025-10-06_02-00-00_project-deduplication-research.md`
- Calendar Analysis Implementation: `calendar-analysis-implementation-status.md`
- Past Tasks Bug Fix: `PAST_TASKS_BUG_FIX.md`

**Key Learnings**:

1. Infrastructure for deduplication already exists (just needs connection)
2. Task count should be adaptive, not fixed
3. Transparency builds trust in AI decisions
4. Event metadata enriches task context significantly
