---
date: 2025-10-03T19:11:11Z
researcher: Claude Code
git_commit: 1affbd47e642822c878036bd8bf1ba83ce972b0a
branch: main
repository: buildos-platform
topic: 'Calendar Analysis Task Editing Enhancement - Full Field Support'
tags: [research, codebase, calendar-analysis, task-editing, ui-enhancement]
status: complete
last_updated: 2025-10-03
last_updated_by: Claude Code
---

# Research: Calendar Analysis Task Editing Enhancement - Full Field Support

**Date**: 2025-10-03T19:11:11Z
**Researcher**: Claude Code
**Git Commit**: 1affbd47e642822c878036bd8bf1ba83ce972b0a
**Branch**: main
**Repository**: buildos-platform

## Research Question

In the `CalendarAnalysisModalContent.svelte` and `CalendarAnalysisResults.svelte` components, suggested tasks are displayed but only some of the task data is shown in the UI. The user needs all task data properly shown so they can edit and update tasks similar to the `OperationEditModal` which provides comprehensive field editing for brain dump operations.

**Goal**: Assess the current functionality and create a plan to update the calendar analysis task editing to support all available task fields with the same comprehensive editing capabilities as OperationEditModal.

## Summary

**Current State**: Calendar analysis displays only **4 of 12 available task fields** in the UI (title, description, priority, start_date). The editing interface is basic with minimal validation and no support for advanced fields like `details`, `task_type`, `duration_minutes`, `status`, `tags`, `recurrence_pattern`, or `recurrence_ends`.

**OperationEditModal**: Provides a sophisticated, dynamic field editing system supporting **9 field types** (text, textarea, select, date, datetime-local, number, boolean, tags, jsonb) with markdown support, dual-mode JSON editing, comprehensive validation, and table-specific customization.

**Gap**: The calendar analysis task editing needs to be upgraded to match OperationEditModal's capabilities to provide full control over all 12 task fields with proper validation, type-specific inputs, and user-friendly editing.

---

## Detailed Findings

### 1. Current Task Display in Calendar Analysis

**File**: `/Users/annawayne/buildos-platform/apps/web/src/lib/components/calendar/CalendarAnalysisResults.svelte`

#### Fields Currently Displayed (Read-Only View)

Lines 843-912 show the task display in read-only mode:

| Field                   | Display Location | Format                               |
| ----------------------- | ---------------- | ------------------------------------ |
| `title`                 | Line 855         | Text (bold)                          |
| `description`           | Lines 865-870    | Text (gray, conditional)             |
| `priority`              | Lines 876-887    | Badge (colored by priority)          |
| `start_date`            | Lines 889-899    | Formatted date with Calendar icon    |
| `duration_minutes`      | Lines 901-910    | Text with Clock icon (e.g., "60min") |
| **Past Task Indicator** | Lines 857-862    | Badge (if task is in past)           |

#### Fields Currently Editable

Lines 769-817 show the task editing form:

| Field         | Input Type               | Validation                              |
| ------------- | ------------------------ | --------------------------------------- |
| `title`       | Text input               | Required, max 255 chars (lines 155-162) |
| `description` | Textarea (2 rows)        | None                                    |
| `priority`    | Select (low/medium/high) | None                                    |
| `start_date`  | datetime-local input     | Date format validation (lines 166-172)  |

#### Fields NOT Displayed or Editable

**Missing from UI** (8 fields):

1. ✗ `details` - Comprehensive task specifics (textarea/markdown)
2. ✗ `status` - Task status (select: backlog/in_progress/done/blocked)
3. ✗ `task_type` - One-off vs recurring (select: one_off/recurring)
4. ✗ `recurrence_pattern` - Recurrence frequency (select: daily/weekly/monthly/etc.)
5. ✗ `recurrence_ends` - End date for recurring tasks (date input)
6. ✗ `event_id` - Linked calendar event ID (read-only/text)
7. ✗ `tags` - Task tags array (tags input with comma separation)
8. ✗ `duration_minutes` - Only displayed in read-only, not editable (number input needed)

---

### 2. OperationEditModal Capabilities

**File**: `/Users/annawayne/buildos-platform/apps/web/src/lib/components/brain-dump/OperationEditModal.svelte`

#### Comprehensive Field Editing System

The OperationEditModal provides:

**9 Field Types Supported**:

1. **text** - Single-line text input (line 655-661)
2. **textarea** - Multi-line text area with markdown support (lines 406-436)
3. **select** - Dropdown with predefined options (lines 571-583)
4. **date** - Date picker (YYYY-MM-DD) (lines 584-591)
5. **datetime-local** - DateTime picker with ISO format (lines 592-607)
6. **number** - Numeric input with min/max constraints (lines 608-618)
7. **boolean** - Checkbox input (lines 619-636)
8. **tags** - Comma-separated tags → array conversion (lines 637-653)
9. **jsonb** - Dual-mode JSON editor (form view + JSON view) (lines 437-557)

#### Key Features

**Validation System**:

- Dynamic required field validation based on table and operation type (lines 165-181)
- JSON syntax validation for JSONB fields (lines 184-193)
- Special table-specific rules (e.g., notes: title OR content required) (lines 158-163)
- Visual error display with specific field feedback (lines 333-354)

**Markdown Support**:

- `MarkdownToggleField` component with dual-mode editing (lines 418-425)
- Preview/Edit toggle with keyboard shortcuts (Ctrl+Enter, Escape)
- Auto-enabled for semantic fields (description, content, context, details, etc.)

**Dynamic Field Configuration**:

- Pattern-based field type inference from field names
- Table-specific options for select fields
- Operation-aware required logic (create vs update)
- Custom override system for special cases

**File**: `/Users/annawayne/buildos-platform/apps/web/src/lib/utils/field-config-generator.ts`

- Provides `generateFieldConfig()` function for dynamic field configuration
- Supports excluded fields, pattern matching, select options, required logic

---

### 3. Task Data Structure - Complete Schema

**Database Schema**: `calendar_project_suggestions.suggested_tasks` (JSONB)
**Source**: `/Users/annawayne/buildos-platform/apps/web/src/lib/services/calendar-analysis.service.ts` (lines 78-98)

#### Complete Field List (12 fields)

| #   | Field                | Type     | Required | Editable? | Current UI            | Notes                                                                                           |
| --- | -------------------- | -------- | -------- | --------- | --------------------- | ----------------------------------------------------------------------------------------------- |
| 1   | `title`              | string   | ✅       | ✅        | Text input            | Max 255 chars                                                                                   |
| 2   | `description`        | string   | ✅       | ✅        | Textarea (2 rows)     | Brief description                                                                               |
| 3   | `details`            | string   | ❌       | ❌        | **MISSING**           | Comprehensive specifics - should be textarea/markdown                                           |
| 4   | `status`             | string   | ✅       | ❌        | **MISSING**           | Must be: backlog/in_progress/done/blocked                                                       |
| 5   | `priority`           | string   | ✅       | ✅        | Select                | Must be: low/medium/high                                                                        |
| 6   | `task_type`          | string   | ✅       | ❌        | **MISSING**           | Must be: one_off/recurring                                                                      |
| 7   | `duration_minutes`   | number   | ❌       | ❌        | **Read-only display** | Should be number input (15-480 range)                                                           |
| 8   | `start_date`         | string   | ❌       | ✅        | datetime-local        | Format: YYYY-MM-DDTHH:MM:SS                                                                     |
| 9   | `recurrence_pattern` | string   | ❌       | ❌        | **MISSING**           | Only if task_type='recurring'. Options: daily/weekdays/weekly/biweekly/monthly/quarterly/yearly |
| 10  | `recurrence_ends`    | string   | ❌       | ❌        | **MISSING**           | Only if task_type='recurring'. Format: YYYY-MM-DD                                               |
| 11  | `event_id`           | string   | ❌       | ❌        | **MISSING**           | Calendar event link - should be read-only/display only                                          |
| 12  | `tags`               | string[] | ❌       | ❌        | **MISSING**           | Array of tags - should use tags input (comma-separated)                                         |

**Field Coverage**: 4/12 fields editable (33% coverage) → **Need 100% coverage**

---

### 4. Architecture Insights

#### Data Flow: Calendar Analysis → Task Creation

```
1. Google Calendar Events
   ↓
2. AI Analysis (analyzeEventsWithAI)
   → Generates ProjectSuggestion with suggested_tasks (all 12 fields)
   ↓
3. Database Storage (calendar_project_suggestions.suggested_tasks as JSONB)
   ↓
4. UI Display (CalendarAnalysisResults.svelte)
   → User reviews tasks (ONLY 4/12 fields shown)
   → User edits tasks (ONLY 4/12 fields editable)
   ↓
5. Accept Suggestion (acceptSuggestion)
   → Reads suggested_tasks from DB
   → Applies user modifications (loses 8 fields if not edited)
   → Creates tasks in tasks table
   ↓
6. Tasks Table (12 corresponding fields)
```

**Problem**: The UI bottleneck (step 4) prevents users from editing 8 critical fields, resulting in:

- Lost data from AI analysis (details, task_type, status, etc.)
- Inability to control recurring task settings
- No way to add/edit tags
- Missing comprehensive task details

---

### 5. Current Editing Implementation Issues

**File**: `/Users/annawayne/buildos-platform/apps/web/src/lib/components/calendar/CalendarAnalysisResults.svelte`

#### Task Editing State Management (Lines 72-76)

```typescript
let tasksExpanded = $state(new Set<string>());
let enabledTasks = $state<Record<string, boolean>>({});
let editingTask = $state<string | null>(null);
let taskEdits = $state<Record<number, any>>({}); // ❌ Uses array index, not task ID
```

**Issue**: `taskEdits` uses array index as key, making it fragile if task order changes.

#### Edit Form (Lines 769-841)

```svelte
{#if isTaskEditing && taskEdits[index]}
	<div class="space-y-3">
		<!-- Title -->
		<input type="text" bind:value={taskEdits[index].title} ... />

		<!-- Description -->
		<textarea bind:value={taskEdits[index].description} rows="2" ... />

		<!-- Priority and Start Date in 2-column grid -->
		<div class="grid grid-cols-2 gap-3">
			<select bind:value={taskEdits[index].priority}>
				<option value="low">Low Priority</option>
				<option value="medium">Medium Priority</option>
				<option value="high">High Priority</option>
			</select>
			<input type="datetime-local" bind:value={taskEdits[index].start_date} />
		</div>

		<!-- Save/Cancel buttons -->
	</div>
{/if}
```

**Limitations**:

1. Only 4 fields editable (title, description, priority, start_date)
2. No validation for `task_type`, `status`, or recurring fields
3. No markdown support for `details` field (field doesn't exist)
4. No tags input
5. No conditional display for recurring task fields
6. Hardcoded field types instead of dynamic configuration

#### Validation (Lines 145-194)

```typescript
function saveTaskEdit(suggestionId: string, taskIndex: number) {
	const taskEdit = taskEdits[taskIndex];

	// Basic validations
	if (!taskEdit.title || taskEdit.title.trim().length === 0) {
		toastService.error('Task title is required');
		return;
	}

	if (taskEdit.title.length > 255) {
		toastService.error('Task title must be 255 characters or less');
		return;
	}

	if (taskEdit.start_date) {
		const date = new Date(taskEdit.start_date);
		if (isNaN(date.getTime())) {
			toastService.error('Please enter a valid date');
			return;
		}
	}

	// Update suggestion in place
	suggestion.suggested_tasks[taskIndex] = { ...taskEdit };
	suggestions = [...suggestions]; // Trigger reactivity

	editingTask = null;
	delete taskEdits[taskIndex];
}
```

**Missing Validations**:

- No validation for `status` enum values
- No validation for `priority` enum values
- No validation for `task_type` enum values
- No validation for `recurrence_pattern` enum values
- No validation for `recurrence_ends` date format
- No conditional validation (e.g., `recurrence_pattern` required if `task_type='recurring'`)

---

## Code References

### Primary Files Analyzed

1. **CalendarAnalysisResults.svelte**
    - Path: `/Users/annawayne/buildos-platform/apps/web/src/lib/components/calendar/CalendarAnalysisResults.svelte`
    - Current task display: Lines 843-912
    - Current task editing: Lines 769-841
    - Task validation: Lines 145-194
    - Task state management: Lines 72-76

2. **OperationEditModal.svelte**
    - Path: `/Users/annawayne/buildos-platform/apps/web/src/lib/components/brain-dump/OperationEditModal.svelte`
    - Dynamic field rendering: Lines 400-667
    - Markdown support: Lines 418-425
    - JSONB editing: Lines 437-557
    - Validation system: Lines 153-206

3. **field-config-generator.ts**
    - Path: `/Users/annawayne/buildos-platform/apps/web/src/lib/utils/field-config-generator.ts`
    - Main generator: `generateFieldConfig()` function
    - Field type patterns and select options
    - Required field logic by table and operation

4. **calendar-analysis.service.ts**
    - Path: `/Users/annawayne/buildos-platform/apps/web/src/lib/services/calendar-analysis.service.ts`
    - Task structure definition: Lines 78-98
    - AI prompt for task generation: Lines 376-391
    - Task acceptance and creation: Lines 527-593

5. **Database Schema**
    - Path: `/Users/annawayne/buildos-platform/apps/web/supabase/migrations/20250129_calendar_intelligence_integration.sql`
    - `calendar_project_suggestions` table definition
    - `suggested_tasks` JSONB field: Lines 113-124

---

## Implementation Plan

### Phase 1: Create Reusable Task Edit Modal Component

**Goal**: Build a dedicated `CalendarTaskEditModal.svelte` component similar to `OperationEditModal` but optimized for calendar task editing.

#### 1.1 Component Structure

**New File**: `/Users/annawayne/buildos-platform/apps/web/src/lib/components/calendar/CalendarTaskEditModal.svelte`

**Props**:

```typescript
interface Props {
	isOpen: boolean;
	task: SuggestedTask | null; // Current task being edited
	onSave: (updatedTask: SuggestedTask) => void;
	onClose: () => void;
}
```

**Features**:

- Modal wrapper (reuse `Modal.svelte` component)
- Dynamic field configuration based on task schema
- Conditional field display (e.g., show recurrence fields only if `task_type='recurring'`)
- Comprehensive validation
- Error display
- Markdown support for `details` field

#### 1.2 Field Configuration

Create a new field config generator specifically for calendar tasks:

**New File**: `/Users/annawayne/buildos-platform/apps/web/src/lib/utils/calendar-task-field-config.ts`

```typescript
import type { FieldConfig } from '$lib/utils/field-config-generator';

export interface CalendarTaskFieldConfig extends FieldConfig {
	conditionalDisplay?: (task: any) => boolean; // Show field based on conditions
	group?: string; // Group related fields (basic, scheduling, recurrence)
}

export function generateCalendarTaskFieldConfig(
	task?: any
): Record<string, CalendarTaskFieldConfig> {
	return {
		// Group 1: Basic Information
		title: {
			type: 'text',
			label: 'Task Title',
			required: true,
			placeholder: 'Enter a clear, actionable task title',
			group: 'basic'
		},
		description: {
			type: 'textarea',
			label: 'Brief Description',
			required: true,
			placeholder: 'Brief description of what needs to be done',
			rows: 2,
			group: 'basic'
		},
		details: {
			type: 'textarea',
			label: 'Detailed Information',
			required: false,
			placeholder: 'Comprehensive specifics about the task...',
			rows: 4,
			markdown: true, // Enable markdown toggle
			group: 'basic'
		},

		// Group 2: Status and Priority
		status: {
			type: 'select',
			label: 'Status',
			required: true,
			options: ['backlog', 'in_progress', 'done', 'blocked'],
			group: 'status'
		},
		priority: {
			type: 'select',
			label: 'Priority',
			required: true,
			options: ['low', 'medium', 'high'],
			group: 'status'
		},

		// Group 3: Scheduling
		task_type: {
			type: 'select',
			label: 'Task Type',
			required: true,
			options: ['one_off', 'recurring'],
			group: 'scheduling'
		},
		duration_minutes: {
			type: 'number',
			label: 'Duration (minutes)',
			required: false,
			min: 15,
			max: 480,
			placeholder: '60',
			group: 'scheduling'
		},
		start_date: {
			type: 'datetime-local',
			label: 'Start Date & Time',
			required: false,
			group: 'scheduling'
		},

		// Group 4: Recurrence (conditional)
		recurrence_pattern: {
			type: 'select',
			label: 'Recurrence Pattern',
			required: false, // Required if task_type='recurring'
			options: ['daily', 'weekdays', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'],
			conditionalDisplay: (task) => task?.task_type === 'recurring',
			group: 'recurrence'
		},
		recurrence_ends: {
			type: 'date',
			label: 'Recurrence End Date',
			required: false,
			conditionalDisplay: (task) => task?.task_type === 'recurring',
			group: 'recurrence'
		},

		// Group 5: Metadata
		event_id: {
			type: 'text',
			label: 'Linked Calendar Event',
			required: false,
			readonly: true, // Display only, not editable
			group: 'metadata'
		},
		tags: {
			type: 'tags',
			label: 'Tags',
			required: false,
			placeholder: 'Enter tags separated by commas',
			group: 'metadata'
		}
	};
}
```

#### 1.3 Validation Logic

**In CalendarTaskEditModal.svelte**:

```typescript
function validateTask(task: SuggestedTask): string[] {
	const errors: string[] = [];

	// Required fields
	if (!task.title || task.title.trim().length === 0) {
		errors.push('Task title is required');
	}
	if (task.title && task.title.length > 255) {
		errors.push('Task title must be 255 characters or less');
	}
	if (!task.description || task.description.trim().length === 0) {
		errors.push('Brief description is required');
	}

	// Enum validations
	const validStatuses = ['backlog', 'in_progress', 'done', 'blocked'];
	if (task.status && !validStatuses.includes(task.status)) {
		errors.push('Invalid status value');
	}

	const validPriorities = ['low', 'medium', 'high'];
	if (task.priority && !validPriorities.includes(task.priority)) {
		errors.push('Invalid priority value');
	}

	const validTaskTypes = ['one_off', 'recurring'];
	if (task.task_type && !validTaskTypes.includes(task.task_type)) {
		errors.push('Invalid task type');
	}

	// Conditional validations
	if (task.task_type === 'recurring') {
		if (!task.recurrence_pattern) {
			errors.push('Recurrence pattern is required for recurring tasks');
		} else {
			const validPatterns = [
				'daily',
				'weekdays',
				'weekly',
				'biweekly',
				'monthly',
				'quarterly',
				'yearly'
			];
			if (!validPatterns.includes(task.recurrence_pattern)) {
				errors.push('Invalid recurrence pattern');
			}
		}
	}

	// Date validations
	if (task.start_date) {
		const date = new Date(task.start_date);
		if (isNaN(date.getTime())) {
			errors.push('Invalid start date format');
		}
	}

	if (task.recurrence_ends) {
		const date = new Date(task.recurrence_ends);
		if (isNaN(date.getTime())) {
			errors.push('Invalid recurrence end date format');
		}
	}

	// Number validations
	if (task.duration_minutes !== undefined && task.duration_minutes !== null) {
		if (task.duration_minutes < 15 || task.duration_minutes > 480) {
			errors.push('Duration must be between 15 and 480 minutes');
		}
	}

	return errors;
}
```

---

### Phase 2: Update CalendarAnalysisResults Component

**Goal**: Replace inline task editing with modal-based editing using `CalendarTaskEditModal`.

#### 2.1 Import and State Setup

**File**: `/Users/annawayne/buildos-platform/apps/web/src/lib/components/calendar/CalendarAnalysisResults.svelte`

```typescript
import CalendarTaskEditModal from './CalendarTaskEditModal.svelte';

// Updated state (replace lines 72-76)
let tasksExpanded = $state(new Set<string>());
let enabledTasks = $state<Record<string, boolean>>({});
let editingTaskKey = $state<string | null>(null); // Changed from editingTask
let editingTaskData = $state<SuggestedTask | null>(null); // New: Full task object
let isTaskEditModalOpen = $state(false); // New: Modal open state
```

#### 2.2 Edit Modal Handler

```typescript
function startEditingTask(suggestionId: string, taskIndex: number) {
	const suggestion = suggestions.find((s) => s.id === suggestionId);
	const task = suggestion?.suggested_tasks?.[taskIndex];

	if (task) {
		editingTaskKey = `${suggestionId}-${taskIndex}`;
		editingTaskData = { ...task }; // Clone task data
		isTaskEditModalOpen = true;
	}
}

function handleTaskSave(updatedTask: SuggestedTask) {
	if (!editingTaskKey) return;

	const [suggestionId, indexStr] = editingTaskKey.split('-');
	const taskIndex = parseInt(indexStr, 10);

	const suggestion = suggestions.find((s) => s.id === suggestionId);
	if (suggestion && suggestion.suggested_tasks && Array.isArray(suggestion.suggested_tasks)) {
		suggestion.suggested_tasks[taskIndex] = updatedTask;
		suggestions = [...suggestions]; // Trigger reactivity
		toastService.success('Task updated successfully');
	}

	isTaskEditModalOpen = false;
	editingTaskKey = null;
	editingTaskData = null;
}

function handleTaskEditClose() {
	isTaskEditModalOpen = false;
	editingTaskKey = null;
	editingTaskData = null;
}
```

#### 2.3 Update Task Display UI

**Remove inline editing form** (lines 769-841), replace with edit button that opens modal:

```svelte
<div class="flex items-start justify-between">
	<div class="flex-1">
		<!-- Task title, description, metadata display -->
		<!-- ... existing read-only display code ... -->
	</div>

	<!-- Edit button -->
	<Button
		size="sm"
		variant="ghost"
		icon={Edit3}
		on:click={() => startEditingTask(suggestion.id, index)}
		disabled={processing}
		class="ml-2 !p-1.5"
		title="Edit task"
	/>
</div>
```

#### 2.4 Add Modal Component

**At end of file** (after line 1139):

```svelte
<!-- Task Edit Modal -->
{#if isTaskEditModalOpen && editingTaskData}
	<CalendarTaskEditModal
		isOpen={isTaskEditModalOpen}
		task={editingTaskData}
		onSave={handleTaskSave}
		onClose={handleTaskEditClose}
	/>
{/if}
```

---

### Phase 3: Enhanced Task Display - Show All Fields

**Goal**: Update read-only task display to show all 12 fields in organized groups.

#### 3.1 Expanded Task Display

**Update lines 843-912** in CalendarAnalysisResults.svelte:

```svelte
<div class="flex-1 min-w-0">
	<!-- Header: Title + Status Badge -->
	<div class="flex items-center gap-2 mb-2">
		<h5 class="font-medium text-gray-900 dark:text-white text-sm">
			{task.title}
		</h5>
		{#if task.status}
			<span
				class="px-2 py-0.5 text-xs rounded-full font-medium
        {task.status === 'done'
					? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
					: task.status === 'in_progress'
						? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
						: task.status === 'blocked'
							? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
							: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300'}"
			>
				{task.status}
			</span>
		{/if}
		{#if isPastTask}
			<span
				class="px-2 py-0.5 text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-full"
			>
				Past Event
			</span>
		{/if}
	</div>

	<!-- Description -->
	{#if task.description}
		<p class="text-sm text-gray-600 dark:text-gray-400 mb-2">
			{task.description}
		</p>
	{/if}

	<!-- Details (if present) -->
	{#if task.details}
		<div
			class="text-xs text-gray-500 dark:text-gray-400 mb-2 p-2 bg-gray-50 dark:bg-gray-800/50 rounded border border-gray-200 dark:border-gray-700"
		>
			<strong>Details:</strong>
			<p class="mt-1">{task.details}</p>
		</div>
	{/if}

	<!-- Metadata Grid -->
	<div class="flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
		<!-- Priority -->
		{#if task.priority}
			<span
				class="inline-flex px-2 py-0.5 rounded-full font-medium
        {task.priority === 'high'
					? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
					: task.priority === 'medium'
						? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
						: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'}"
			>
				{task.priority} priority
			</span>
		{/if}

		<!-- Task Type -->
		{#if task.task_type}
			<span class="flex items-center gap-1">
				<TrendingUp class="w-3 h-3" />
				{task.task_type === 'recurring' ? 'Recurring' : 'One-time'}
			</span>
		{/if}

		<!-- Start Date -->
		{#if task.start_date}
			<span class="flex items-center gap-1">
				<Calendar class="w-3 h-3" />
				{formatDate(task.start_date)}
			</span>
		{/if}

		<!-- Duration -->
		{#if task.duration_minutes}
			<span class="flex items-center gap-1">
				<Clock class="w-3 h-3" />
				{task.duration_minutes}min
			</span>
		{/if}

		<!-- Recurrence (if recurring) -->
		{#if task.task_type === 'recurring' && task.recurrence_pattern}
			<span
				class="flex items-center gap-1 px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full"
			>
				<Repeat class="w-3 h-3" />
				{task.recurrence_pattern}
				{#if task.recurrence_ends}
					until {new Date(task.recurrence_ends).toLocaleDateString()}
				{/if}
			</span>
		{/if}
	</div>

	<!-- Tags (if present) -->
	{#if task.tags && task.tags.length > 0}
		<div class="flex flex-wrap gap-1.5 mt-2">
			{#each task.tags as tag}
				<span
					class="inline-flex px-2 py-0.5 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full"
				>
					{tag}
				</span>
			{/each}
		</div>
	{/if}

	<!-- Linked Event (if present) -->
	{#if task.event_id}
		<div class="text-xs text-gray-400 dark:text-gray-500 mt-2">
			Linked to calendar event: {task.event_id}
		</div>
	{/if}
</div>
```

**New Icon Import** (add to line 7-20):

```typescript
import { Repeat } from 'lucide-svelte'; // For recurrence indicator
```

---

### Phase 4: Testing and Validation

#### 4.1 Unit Tests

**New File**: `/Users/annawayne/buildos-platform/apps/web/src/lib/components/calendar/CalendarTaskEditModal.test.ts`

Test cases:

- ✅ All 12 fields render correctly
- ✅ Required field validation (title, description, status, priority, task_type)
- ✅ Enum validation (status, priority, task_type, recurrence_pattern)
- ✅ Date format validation (start_date, recurrence_ends)
- ✅ Number range validation (duration_minutes: 15-480)
- ✅ Conditional field display (recurrence fields only when task_type='recurring')
- ✅ Conditional required validation (recurrence_pattern required if recurring)
- ✅ Tags input conversion (comma-separated → array)
- ✅ Markdown support for details field
- ✅ Save handler updates task correctly
- ✅ Cancel handler discards changes

#### 4.2 Integration Tests

**File**: `/Users/annawayne/buildos-platform/apps/web/src/lib/components/calendar/CalendarAnalysisResults.test.ts`

Test cases:

- ✅ Edit button opens CalendarTaskEditModal
- ✅ Modal receives correct task data
- ✅ Modal save updates suggestion in parent component
- ✅ Modal cancel closes without updating
- ✅ Task modifications persist through suggestion acceptance
- ✅ All 12 fields displayed correctly in read-only view
- ✅ Recurring task fields shown conditionally

#### 4.3 E2E Tests

Test flow:

1. Start calendar analysis
2. View suggestions with tasks
3. Expand tasks section
4. Click edit on a task
5. Verify all 12 fields are editable
6. Edit multiple fields (title, description, details, status, priority, task_type, duration_minutes, start_date, tags)
7. Change task_type to 'recurring'
8. Verify recurrence fields appear
9. Set recurrence_pattern and recurrence_ends
10. Save task
11. Verify changes reflected in task display
12. Accept suggestion
13. Navigate to created project
14. Verify all edited task fields are present in created task

---

### Phase 5: Documentation Updates

#### 5.1 Component Documentation

**New File**: `/Users/annawayne/buildos-platform/apps/web/src/lib/components/calendar/README.md`

Document:

- CalendarTaskEditModal component API
- Field configuration system
- Validation rules
- Conditional field display logic
- Integration with CalendarAnalysisResults

#### 5.2 Feature Documentation

**Update File**: `/Users/annawayne/buildos-platform/apps/web/docs/features/calendar-integration/README.md`

Add section:

- Full task editing capabilities
- Field-by-field description
- Screenshots of new UI
- Recurring task configuration guide

---

## Implementation Checklist

### Phase 1: Task Edit Modal Component

- [ ] Create `CalendarTaskEditModal.svelte` component
- [ ] Create `calendar-task-field-config.ts` utility
- [ ] Implement field rendering for all 12 fields
- [ ] Add conditional field display logic (recurrence fields)
- [ ] Implement comprehensive validation
- [ ] Add markdown support for details field
- [ ] Add tags input conversion
- [ ] Style modal to match design system
- [ ] Add error display

### Phase 2: Integration with CalendarAnalysisResults

- [ ] Update state management (remove inline editing state)
- [ ] Add modal open/close handlers
- [ ] Add task save handler
- [ ] Replace inline edit form with edit button
- [ ] Integrate CalendarTaskEditModal component
- [ ] Test modal integration

### Phase 3: Enhanced Task Display

- [ ] Update read-only task display to show all fields
- [ ] Add status badge
- [ ] Add task type indicator
- [ ] Add recurrence pattern display (conditional)
- [ ] Add tags display
- [ ] Add event_id display
- [ ] Add details preview
- [ ] Update styling for enhanced display

### Phase 4: Testing

- [ ] Write unit tests for CalendarTaskEditModal
- [ ] Write unit tests for field config generator
- [ ] Write integration tests for CalendarAnalysisResults
- [ ] Write E2E test for full edit flow
- [ ] Test recurring task editing specifically
- [ ] Test validation for all fields
- [ ] Test conditional field display
- [ ] Manual testing across browsers

### Phase 5: Documentation

- [ ] Document CalendarTaskEditModal component
- [ ] Document field configuration system
- [ ] Update feature documentation
- [ ] Add screenshots to docs
- [ ] Create migration guide if needed

---

## Risk Assessment

### Low Risk

- ✅ Creating new modal component (no breaking changes)
- ✅ Enhanced task display (additive changes)
- ✅ Validation improvements (better UX)

### Medium Risk

- ⚠️ State management changes in CalendarAnalysisResults (test thoroughly)
- ⚠️ Field configuration system complexity (ensure maintainability)
- ⚠️ Conditional field logic (test edge cases)

### Mitigation Strategies

1. **Incremental rollout**: Implement phase by phase with testing after each
2. **Feature flag**: Add `ENABLE_FULL_TASK_EDITING` flag to toggle between old/new UI during testing
3. **Backward compatibility**: Ensure existing task data without new fields still works
4. **Comprehensive testing**: Unit + integration + E2E tests before release
5. **Documentation**: Clear docs for developers and users

---

## Open Questions

1. **UI Layout**: Should recurring task fields be in a collapsible section or always visible when task_type='recurring'?
    - **Recommendation**: Always visible to avoid extra click for common use case

2. **Validation Strictness**: Should we allow tasks with missing non-required fields to be saved?
    - **Recommendation**: Yes, follow current behavior (only validate required fields)

3. **Default Values**: When creating new tasks, what defaults should be used?
    - **Recommendation**: status='backlog', priority='medium', task_type='one_off' (match AI defaults)

4. **Markdown Preview**: Should details field default to edit or preview mode?
    - **Recommendation**: Edit mode by default (user opening edit modal expects to edit)

5. **Event ID Field**: Should it be completely hidden or shown as read-only info?
    - **Recommendation**: Show as read-only with link icon to indicate calendar connection

---

## Success Metrics

### Functionality

- ✅ All 12 task fields are editable
- ✅ All fields display correctly in read-only view
- ✅ Validation prevents invalid data from being saved
- ✅ Conditional fields (recurrence) work correctly
- ✅ Markdown editing works for details field
- ✅ Tags input conversion works

### User Experience

- ✅ Edit modal opens quickly (<200ms)
- ✅ Field changes save successfully
- ✅ Error messages are clear and actionable
- ✅ Modal is keyboard accessible
- ✅ UI matches design system

### Quality

- ✅ 90%+ test coverage for new components
- ✅ No regression bugs in existing functionality
- ✅ Passes accessibility audit
- ✅ Works across all supported browsers

---

## Related Research

- Brain Dump System: `/apps/web/docs/features/brain-dump/README.md`
- Task Management: `/apps/web/docs/features/tasks/`
- Field Configuration System: `/apps/web/src/lib/utils/field-config-generator.ts`
- Calendar Integration: `/apps/web/docs/features/calendar-integration/README.md`

---

## Appendices

### A. Complete Task Field Reference

| Field              | Type       | UI Component                 | Validation            | Notes                                                   |
| ------------------ | ---------- | ---------------------------- | --------------------- | ------------------------------------------------------- |
| title              | string     | TextInput                    | Required, max 255     | -                                                       |
| description        | string     | Textarea (2 rows)            | Required              | Brief description                                       |
| details            | string     | Textarea (4 rows) + Markdown | Optional              | Comprehensive details                                   |
| status             | enum       | Select                       | Required, valid enum  | backlog/in_progress/done/blocked                        |
| priority           | enum       | Select                       | Required, valid enum  | low/medium/high                                         |
| task_type          | enum       | Select                       | Required, valid enum  | one_off/recurring                                       |
| duration_minutes   | number     | Number input                 | Optional, 15-480      | Estimated duration                                      |
| start_date         | ISO string | datetime-local               | Optional, valid ISO   | YYYY-MM-DDTHH:MM:SS                                     |
| recurrence_pattern | enum       | Select (conditional)         | Required if recurring | daily/weekdays/weekly/biweekly/monthly/quarterly/yearly |
| recurrence_ends    | ISO string | date input (conditional)     | Optional, valid date  | YYYY-MM-DD                                              |
| event_id           | string     | TextInput (read-only)        | N/A                   | Calendar event link                                     |
| tags               | string[]   | Tags input                   | Optional              | Comma-separated → array                                 |

### B. Validation Rules Summary

**Required Fields** (Always):

- title, description, status, priority, task_type

**Conditionally Required**:

- recurrence_pattern (if task_type='recurring')

**Format Validations**:

- title: max 255 characters
- status: must be in ['backlog', 'in_progress', 'done', 'blocked']
- priority: must be in ['low', 'medium', 'high']
- task_type: must be in ['one_off', 'recurring']
- recurrence_pattern: must be in ['daily', 'weekdays', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly']
- start_date: valid ISO datetime string (YYYY-MM-DDTHH:MM:SS)
- recurrence_ends: valid ISO date string (YYYY-MM-DD)
- duration_minutes: integer, 15-480 range

### C. Component Architecture Diagram

```
CalendarAnalysisResults.svelte (Parent)
  │
  ├─ Suggestions Display
  │   └─ Tasks List (Expandable)
  │       ├─ Task Display (Read-Only) [Shows all 12 fields]
  │       │   ├─ Title + Status Badge
  │       │   ├─ Description
  │       │   ├─ Details Preview
  │       │   ├─ Metadata Grid (Priority, Task Type, Duration, etc.)
  │       │   ├─ Recurrence Info (conditional)
  │       │   ├─ Tags
  │       │   └─ Event Link
  │       │
  │       └─ Edit Button → Opens Modal
  │
  └─ CalendarTaskEditModal.svelte (Child)
      ├─ Modal Header
      ├─ Field Groups
      │   ├─ Basic Info (title, description, details)
      │   ├─ Status (status, priority)
      │   ├─ Scheduling (task_type, duration, start_date)
      │   ├─ Recurrence (pattern, ends) [Conditional]
      │   └─ Metadata (event_id, tags)
      ├─ Validation & Error Display
      └─ Save/Cancel Actions
```

### D. File Structure

```
apps/web/src/lib/
├── components/
│   ├── calendar/
│   │   ├── CalendarAnalysisResults.svelte [UPDATE]
│   │   ├── CalendarTaskEditModal.svelte [NEW]
│   │   ├── CalendarTaskEditModal.test.ts [NEW]
│   │   └── README.md [NEW]
│   └── ui/
│       ├── MarkdownToggleField.svelte [REUSE]
│       └── ...
├── utils/
│   ├── calendar-task-field-config.ts [NEW]
│   ├── calendar-task-field-config.test.ts [NEW]
│   └── field-config-generator.ts [REFERENCE]
└── types/
    └── calendar.types.ts [UPDATE - add SuggestedTask type]
```

---

**End of Research Document**
