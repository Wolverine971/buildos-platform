# Phase Intelligent Task Scheduling Plan

## Overview

Update the phase scheduling endpoint at `api/projects/[id]/phases/[phaseId]/schedule` to intelligently schedule tasks within a phase using an LLM, similar to the approach in `api/projects/[id]/tasks/assign-backlog`.

## Current State Analysis

### Current Phase Schedule Endpoint

- Uses `generateProposedSchedule` function with basic TaskTimeSlotFinder integration
- Simply distributes tasks across phase timeline without intelligent consideration
- No analysis of task relationships, dependencies, or optimal ordering
- Limited context about existing scheduled tasks

### Assign-Backlog Endpoint Approach

- Uses LLM to intelligently assign tasks to phases
- Considers task dependencies, complexity, and logical workflow
- Validates dates and uses TaskTimeSlotFinder for final time slot optimization
- Provides reasoning for assignments

## Implementation Plan

### 1. LLM Integration for Intelligent Scheduling

#### System Prompt Design

The LLM will analyze:

- Task titles, descriptions, and dependencies
- Existing scheduled tasks within the phase timeline (blocking time slots)
- User calendar preferences (working hours, working days)
- Phase boundaries (start_date, end_date)
- Task priorities and durations

#### Context Data Structure

```typescript
interface SchedulingContext {
	phase: {
		id: string;
		name: string;
		description: string;
		start_date: string;
		end_date: string;
	};

	tasksToSchedule: Array<{
		id: string;
		title: string;
		description: string;
		duration_minutes: number;
		priority: string;
		dependencies: any;
		suggested_start_date?: string;
	}>;

	existingSchedule: Array<{
		start_time: string;
		end_time: string;
		task_title: string; // Light reference for context
	}>;

	userPreferences: {
		work_start_time: string;
		work_end_time: string;
		working_days: number[];
		timezone: string;
	};

	currentDateTime: string;
}
```

#### LLM Output Format

```typescript
interface SchedulingResult {
	scheduled_tasks: Array<{
		task_id: string;
		suggested_date: string; // Date with suggested time
		priority_order: number;
		reasoning: string;
		dependencies_considered?: string[];
	}>;

	scheduling_strategy: string;
	warnings?: string[];
}
```

### 2. Two-Stage Scheduling Process

#### Stage 1: LLM Intelligence

1. Analyze all tasks to understand dependencies and relationships
2. Determine optimal task ordering based on:
    - Logical workflow progression
    - Dependencies between tasks
    - Task complexity and priority
    - Available time windows
3. Suggest initial dates/times respecting phase boundaries

#### Stage 2: TaskTimeSlotFinder Verification

1. Take LLM's suggested dates as starting points
2. Use TaskTimeSlotFinder to find exact available time slots
3. Ensure no conflicts with existing calendar events
4. Respect user's working hours and preferences

### 3. Implementation Steps

#### Step 1: Fetch Existing Schedule

- Get all tasks currently scheduled within the phase timeline
- Include tasks from other phases that fall within this phase's date range
- Get user's calendar events for the phase timeline

#### Step 2: Prepare LLM Prompt

- Build system prompt for intelligent task scheduling
- Include phase context and constraints
- Provide existing schedule as blocked time slots
- Include user preferences

#### Step 3: LLM Processing

- Send request to LLM with prepared context
- Parse and validate LLM response
- Handle edge cases and invalid suggestions

#### Step 4: Time Slot Optimization

- Use TaskTimeSlotFinder with LLM suggestions
- Find optimal time slots for each task
- Ensure no conflicts with existing schedule

#### Step 5: Update Tasks

- Update task start_dates in database
- Create/update calendar events if needed
- Return scheduled tasks with reasoning

### 4. Key Improvements Over Current Implementation

1. **Intelligent Task Ordering**: LLM analyzes task relationships and dependencies
2. **Context-Aware Scheduling**: Considers existing schedule and avoids conflicts
3. **Reasoning Transparency**: Provides explanations for scheduling decisions
4. **Workflow Optimization**: Groups related tasks and considers logical progression
5. **Better Time Distribution**: Intelligently spreads tasks based on complexity and duration

### 5. Error Handling

- Fallback to current scheduling method if LLM fails
- Validate all LLM suggestions before applying
- Ensure dates are within phase boundaries
- Handle calendar sync failures gracefully

### 6. Testing Strategy

1. Test with phases containing various numbers of tasks (5, 10, 20+)
2. Test with different phase durations (1 week, 1 month, 3 months)
3. Test with tasks having dependencies
4. Test with partially scheduled phases
5. Test edge cases (past phases, very short phases, etc.)

## API Changes

### Request Body (unchanged)

```json
{
  "preview": true,
  "schedule": [...],
  "timeZone": "America/New_York",
  "currentDateTime": "2025-01-15T10:00:00Z"
}
```

### Response (enhanced)

```json
{
	"schedule": [
		{
			"taskId": "uuid",
			"proposedStart": "2025-01-16T09:00:00Z",
			"proposedEnd": "2025-01-16T10:00:00Z",
			"reasoning": "Starting with foundational task",
			"hasConflict": false,
			"timeZone": "America/New_York"
		}
	],
	"scheduling_strategy": "Tasks ordered by dependencies and complexity",
	"warnings": []
}
```

## Next Steps

1. Implement LLM prompt builder functions
2. Add existing schedule fetching logic
3. Integrate LLM processing with error handling
4. Update generateProposedSchedule to use LLM + TaskTimeSlotFinder
5. Test with various phase configurations
