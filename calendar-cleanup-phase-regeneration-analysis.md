# Phase Regeneration Calendar Cleanup Analysis

**Date:** September 29, 2025
**Author:** System Analysis
**Status:** Ready for Implementation

## Executive Summary

When phases are regenerated in BuildOS, existing Google Calendar events are currently **updated in place** rather than being cleared and recreated. This leads to confusion when tasks are significantly rescheduled, potentially causing duplicate events and inconsistent calendar state. This document provides a comprehensive analysis and implementation plan for adding proper calendar cleanup during phase regeneration.

## Problem Statement

### Current Behavior

1. User initiates phase regeneration through the UI
2. System regenerates phases and reschedules tasks
3. **Existing calendar events are UPDATED with new times** via `syncCalendarEventsForUpdatedTasks()`
4. Old events persist in Google Calendar with modified dates

### Issues with Current Approach

- **User Confusion:** Tasks that move significantly in time appear to "jump" in the calendar
- **Potential Duplicates:** If scheduling logic creates new events before updating old ones
- **Inconsistent State:** When phase boundaries change dramatically, events may not align properly
- **No Clear History:** Users can't tell what changed in their calendar

## System Architecture Analysis

### Key Components

#### 1. Phase Generation Flow

```
User Action (UI)
    ↓
PhasesSection.svelte (handleGeneratePhases)
    ↓
PhaseGenerationConfirmationModal.svelte
    ↓
POST /api/projects/[id]/phases/generate
    ↓
PhaseGenerationOrchestrator
    ↓
Strategy (schedule-in-phases.strategy.ts)
    ↓
syncCalendarEventsForUpdatedTasks() [CURRENT UPDATE LOGIC]
```

#### 2. Database Architecture

- **`tasks`** - Core task data with scheduling info
- **`task_calendar_events`** - Links tasks to Google Calendar events
  - `calendar_event_id`: Google Calendar event ID
  - `sync_status`: Current sync state
  - `is_master_event`: For recurring events
- **`phase_tasks`** - Junction table linking tasks to phases
- **`phases`** - Phase definitions with project relationship

#### 3. Calendar Service Capabilities

- `bulkDeleteCalendarEvents()` - Already implemented and tested
- `bulkUpdateCalendarEvents()` - Current update mechanism
- `bulkScheduleTasks()` - For creating new events
- Batch processing with configurable sizes
- Error handling for 404s and connection issues

## Proposed Solution

### Architecture Design

#### Option 1: Strategy-Level Cleanup (RECOMMENDED)

Add cleanup directly in the scheduling strategy before regeneration:

**Location:** `/apps/web/src/lib/services/phase-generation/strategies/schedule-in-phases.strategy.ts`

```typescript
class ScheduleInPhasesStrategy extends BaseStrategy {
  async execute(): Promise<PhaseGenerationResult> {
    // NEW: Clear calendar events if configured
    if (this.config.calendarHandling === "clear_and_reschedule") {
      await this.clearExistingCalendarEvents();
    }

    // Continue with existing logic
    const assignments = await this.assignTasksToPhases();
    // ...
  }

  private async clearExistingCalendarEvents(): Promise<void> {
    // Implementation details below
  }
}
```

#### Option 2: Orchestrator-Level Cleanup

Add as preprocessing step in the orchestrator:

**Location:** `/apps/web/src/lib/services/phase-generation/orchestrator.ts`

```typescript
class PhaseGenerationOrchestrator {
  async generatePhases(): Promise<PhaseGenerationResult> {
    // NEW: Optional calendar cleanup
    if (this.config.clearCalendarBeforeRegeneration) {
      await this.preprocessCalendarCleanup();
    }
    // ...
  }
}
```

### Implementation Plan

#### Phase 1: Core Implementation

##### 1.1 Extend Configuration Interface

**File:** `/apps/web/src/lib/services/phase-generation/types.ts`

```typescript
export interface PhaseGenerationConfig {
  // Existing fields...
  projectId: string;
  userId: string;
  schedulingMethod: SchedulingMethod;
  selectedStatuses: TaskStatus[];

  // NEW: Calendar handling configuration
  calendarHandling: "update" | "clear_and_reschedule" | "preserve";
  preserveRecurringEvents?: boolean;
  calendarCleanupBatchSize?: number;
}
```

##### 1.2 Implement Calendar Cleanup Method

**File:** `/apps/web/src/lib/services/phase-generation/strategies/schedule-in-phases.strategy.ts`

Add around line 150 in the `execute()` method:

```typescript
private async clearExistingCalendarEvents(): Promise<void> {
    try {
        // Get all tasks that will be rescheduled
        const taskIds = this.tasks.map(t => t.id);

        if (taskIds.length === 0) {
            console.log('No tasks to clear calendar events for');
            return;
        }

        // Fetch existing calendar events for these tasks
        const { data: calendarEvents, error } = await this.supabase
            .from('task_calendar_events')
            .select('*')
            .in('task_id', taskIds)
            .eq('user_id', this.userId)
            .eq('sync_status', 'synced'); // Only clear successfully synced events

        if (error) {
            console.error('Failed to fetch calendar events for cleanup:', error);
            throw new Error(`Calendar cleanup failed: ${error.message}`);
        }

        if (!calendarEvents || calendarEvents.length === 0) {
            console.log('No calendar events to clear');
            return;
        }

        console.log(`Clearing ${calendarEvents.length} calendar events before phase regeneration`);

        // Handle recurring events specially if configured
        let eventsToDelete = calendarEvents;
        if (this.config.preserveRecurringEvents) {
            eventsToDelete = calendarEvents.filter(e => !e.is_master_event);
            const preservedCount = calendarEvents.length - eventsToDelete.length;
            if (preservedCount > 0) {
                console.log(`Preserving ${preservedCount} recurring master events`);
            }
        }

        // Use existing bulk delete function
        const calendarService = new CalendarService(this.supabase);
        const result = await calendarService.bulkDeleteCalendarEvents(
            this.userId,
            eventsToDelete.map(e => ({
                id: e.id,
                calendar_event_id: e.calendar_event_id,
                calendar_id: e.calendar_id || 'primary'
            })),
            {
                batchSize: this.config.calendarCleanupBatchSize || 5,
                reason: 'phase_regeneration_cleanup'
            }
        );

        if (!result.success) {
            console.warn('Calendar cleanup had errors:', result.errors);
            // Don't fail the entire operation, but log warnings
            if (result.warnings?.length) {
                console.warn('Calendar cleanup warnings:', result.warnings);
            }
        }

        console.log(`Calendar cleanup complete: ${result.deletedCount} events deleted`);

    } catch (error) {
        console.error('Error during calendar cleanup:', error);
        // Decide whether to fail or continue
        if (this.config.calendarHandling === 'clear_and_reschedule') {
            throw error; // Fail if cleanup was explicitly requested
        }
        // Otherwise, log and continue
        console.warn('Continuing with phase regeneration despite calendar cleanup failure');
    }
}
```

##### 1.3 Modify the Execute Method

**File:** `/apps/web/src/lib/services/phase-generation/strategies/schedule-in-phases.strategy.ts`

Update the `execute()` method around line 150:

```typescript
async execute(): Promise<PhaseGenerationResult> {
    // Validate inputs
    this.validateInputs();

    // NEW: Clear existing calendar events if configured
    if (this.config.calendarHandling === 'clear_and_reschedule') {
        await this.clearExistingCalendarEvents();
    }

    // Assign tasks to phases based on workload
    const assignments = await this.assignTasksToPhases();

    // Build phase structures with assigned tasks
    const phases = this.buildPhases(assignments);

    // NEW: Schedule tasks to calendar (creates new events)
    if (this.config.calendarHandling === 'clear_and_reschedule') {
        await this.scheduleTasksToCalendar(assignments);
    } else if (this.config.calendarHandling === 'update') {
        // Use existing update logic
        await this.syncCalendarEventsForUpdatedTasks(assignments);
    }
    // If 'preserve', do nothing with calendar

    return {
        phases,
        assignments,
        summary: this.generateSummary(phases, assignments)
    };
}
```

#### Phase 2: UI Integration

##### 2.1 Update Configuration Modal

**File:** `/apps/web/src/lib/components/project/PhaseGenerationConfirmationModal.svelte`

Add calendar handling options:

```svelte
<script lang="ts">
    let calendarHandling = 'update'; // Default to current behavior
    let showCalendarWarning = false;

    $: if (calendarHandling === 'clear_and_reschedule') {
        showCalendarWarning = true;
    }
</script>

<!-- Add to the modal form -->
<div class="space-y-4">
    <div>
        <label class="text-sm font-medium text-gray-700">Calendar Event Handling</label>
        <select bind:value={calendarHandling} class="mt-1 block w-full rounded-md border-gray-300">
            <option value="update">Update existing events (current behavior)</option>
            <option value="clear_and_reschedule">Clear and recreate all events</option>
            <option value="preserve">Don't modify calendar events</option>
        </select>
    </div>

    {#if showCalendarWarning}
        <div class="bg-yellow-50 border-l-4 border-yellow-400 p-4">
            <div class="flex">
                <div class="flex-shrink-0">
                    <ExclamationTriangleIcon class="h-5 w-5 text-yellow-400" />
                </div>
                <div class="ml-3">
                    <p class="text-sm text-yellow-700">
                        This will delete {calendarEventCount} existing calendar events and create new ones.
                        This action cannot be undone.
                    </p>
                </div>
            </div>
        </div>
    {/if}

    {#if calendarHandling === 'clear_and_reschedule'}
        <div class="pl-4">
            <label class="flex items-center">
                <input type="checkbox" bind:checked={preserveRecurringEvents} class="mr-2" />
                <span class="text-sm text-gray-600">Preserve recurring event series</span>
            </label>
        </div>
    {/if}
</div>
```

##### 2.2 Update API Endpoint

**File:** `/apps/web/src/routes/api/projects/[id]/phases/generate/+server.ts`

Pass calendar handling config to orchestrator:

```typescript
const config: PhaseGenerationConfig = {
  // Existing config...
  projectId: project.id,
  userId: user.id,
  schedulingMethod: body.scheduling_method,
  selectedStatuses: body.selected_statuses,

  // NEW: Calendar handling
  calendarHandling: body.calendar_handling || "update",
  preserveRecurringEvents: body.preserve_recurring_events,
  calendarCleanupBatchSize: 5,
};
```

#### Phase 3: Testing & Validation

##### 3.1 Unit Tests

**File:** `/apps/web/src/lib/services/phase-generation/strategies/schedule-in-phases.strategy.test.ts`

```typescript
describe("ScheduleInPhasesStrategy - Calendar Cleanup", () => {
  it("should clear calendar events when configured", async () => {
    // Mock setup
    const mockCalendarEvents = [
      { id: "1", calendar_event_id: "gcal_1", task_id: "task_1" },
      { id: "2", calendar_event_id: "gcal_2", task_id: "task_2" },
    ];

    // Configure for cleanup
    const config = {
      calendarHandling: "clear_and_reschedule",
      // ... other config
    };

    // Execute strategy
    const result = await strategy.execute();

    // Verify cleanup was called
    expect(mockCalendarService.bulkDeleteCalendarEvents).toHaveBeenCalledWith(
      userId,
      expect.arrayContaining(mockCalendarEvents),
      expect.objectContaining({ reason: "phase_regeneration_cleanup" }),
    );
  });

  it("should preserve recurring events when configured", async () => {
    // Test recurring event preservation logic
  });

  it("should handle cleanup failures gracefully", async () => {
    // Test error handling
  });
});
```

##### 3.2 Integration Tests

Test with real calendar integration:

1. Create project with scheduled tasks
2. Regenerate phases with cleanup
3. Verify old events deleted
4. Verify new events created
5. Check recurring event handling

## Risk Analysis

### High Risk Areas

1. **Data Loss:** Calendar events permanently deleted
   - **Mitigation:** Add confirmation dialog, log deleted event IDs

2. **Recurring Events:** Complex deletion scenarios
   - **Mitigation:** Special handling for recurring series

3. **Performance:** Large number of events
   - **Mitigation:** Batch processing, progress indicators

### Medium Risk Areas

1. **Partial Failures:** Some events delete, others fail
   - **Mitigation:** Comprehensive error handling, continue on failure

2. **User Confusion:** Unexpected calendar changes
   - **Mitigation:** Clear UI warnings, preview of changes

### Low Risk Areas

1. **API Rate Limits:** Too many calendar API calls
   - **Mitigation:** Already handled by batch processing

## Rollback Plan

If issues occur after deployment:

1. **Immediate:** Set default `calendarHandling` to 'update' (current behavior)
2. **Data Recovery:** Use `calendar_sync_logs` to identify deleted events
3. **Manual Restoration:** If needed, recreate events from `task_calendar_events` history

## Success Metrics

1. **Functional:**
   - ✅ Calendar events properly cleaned before regeneration
   - ✅ New events created with correct dates
   - ✅ No duplicate events in calendar

2. **Performance:**
   - Cleanup completes in < 5 seconds for 100 events
   - Batch processing prevents API timeouts

3. **User Experience:**
   - Clear indication of calendar impact
   - Option to preserve or clear events
   - No unexpected calendar changes

## Implementation Timeline

1. **Day 1:** Implement core cleanup method
2. **Day 2:** Add UI configuration options
3. **Day 3:** Testing and edge case handling
4. **Day 4:** Documentation and deployment prep

## Code Locations Reference

### Files to Modify:

1. `/apps/web/src/lib/services/phase-generation/strategies/schedule-in-phases.strategy.ts` - Main implementation
2. `/apps/web/src/lib/services/phase-generation/types.ts` - Config interface
3. `/apps/web/src/lib/components/project/PhaseGenerationConfirmationModal.svelte` - UI options
4. `/apps/web/src/routes/api/projects/[id]/phases/generate/+server.ts` - API endpoint

### Existing Functions to Use:

1. `CalendarService.bulkDeleteCalendarEvents()` - Line 983 in calendar-service.ts
2. `CalendarService.bulkScheduleTasks()` - Line 1108 in calendar-service.ts

## Next Steps

1. Review this analysis with the team
2. Confirm approach (Strategy-level vs Orchestrator-level)
3. Begin implementation with core cleanup method
4. Add comprehensive logging for debugging
5. Test with various project sizes and configurations

---

**Document Status:** Ready for implementation review
**Last Updated:** September 29, 2025
