---
date: 2025-10-15T00:00:00-04:00
researcher: Claude (AI Assistant)
git_commit: a33084ed
branch: main
repository: buildos-platform
topic: 'Dashboard Time Blocks Integration & Modal Design Specification'
tags: [research, time-play, dashboard, modal-design, calendar-integration, ui-ux]
status: complete
last_updated: 2025-10-15
last_updated_by: Claude (AI Assistant)
---

# Dashboard Time Blocks Integration & Modal Design Specification

**Date**: October 15, 2025
**Researcher**: Claude (AI Assistant)
**Git Commit**: a33084ed
**Branch**: main
**Repository**: buildos-platform

## Research Question

How should time blocks be integrated into the BuildOS dashboard to provide an intuitive, visually appealing experience similar to TaskModal? What design patterns, components, and data flows are needed?

## Executive Summary

This specification outlines the integration of Time Play time blocks into the BuildOS dashboard by transforming the existing TaskDetailsCard into a time-block-centric view. The proposed solution includes:

1. **TimeBlocksCard** (renamed TaskDetailsCard) - Primary dashboard component showing time blocks with tasks nested underneath
2. **TimeBlockModal** - A full-featured modal for creating/editing time blocks (similar to TaskModal)
3. **Time-first paradigm** - Time blocks are the primary organizational unit; tasks are secondary
4. **Integrated display** - Time blocks appear in Today/Tomorrow columns and Weekly Tasks section
5. **Progressive disclosure** - Time blocks shown to intermediate/experienced users; tasks-only view for new users
6. **Unified design language** - Matches existing dashboard aesthetics with Time Play's purple/gradient theme

**Key Architectural Change**: Instead of a separate widget, time blocks are integrated directly into the existing task card structure, shifting the mental model from "tasks with optional time blocks" to "time blocks containing tasks".

---

## 🔄 Key Changes from Original Spec

This spec has been updated based on user feedback to shift from a separate widget approach to an integrated approach:

### What Changed

| Aspect                     | Original Spec                          | Updated Spec                                               |
| -------------------------- | -------------------------------------- | ---------------------------------------------------------- |
| **Component Approach**     | Separate `TimeBlockDashboardWidget`    | Integrated into `TimeBlocksCard` (renamed TaskDetailsCard) |
| **Placement**              | Between Weekly Calendar and Stats Grid | Replaces/enhances TaskDetailsCard position                 |
| **Mental Model**           | Tasks + separate time blocks section   | Time blocks are primary, tasks are nested underneath       |
| **Today/Tomorrow Columns** | Not specified in original              | Time blocks shown chronologically with nested tasks        |
| **Past Column**            | Not specified in original              | Tasks only (no time blocks for historical view)            |
| **Weekly Calendar**        | Not included in original               | Time blocks integrated above tasks for each day            |
| **User Experience**        | Two separate views                     | Unified time-centric view                                  |

### Why This Approach is Better

1. **Reduced Cognitive Load** - Users see time blocks and tasks in one place, not scattered across different sections
2. **Natural Hierarchy** - Time blocks as containers naturally organize tasks within focus sessions
3. **Consistent Mental Model** - Reinforces "time-first" thinking throughout the dashboard
4. **Better Use of Space** - No need for additional dashboard real estate; enhances existing component
5. **Improved Discoverability** - Users see time blocks where they already look for tasks
6. **Seamless Integration** - Works with existing progressive disclosure patterns

### Implementation Impact

- **Fewer new components** - Enhance existing components rather than create new ones
- **Cleaner architecture** - Maintains existing dashboard structure
- **Easier maintenance** - Less code duplication
- **Better UX** - More cohesive, integrated experience

---

## 1. Dashboard Integration Strategy

### 1.1 Component Transformation: TaskDetailsCard → TimeBlocksCard

**Current State**: TaskDetailsCard shows tasks in three columns (Past | Today | Tomorrow)

**New State**: TimeBlocksCard shows time blocks as primary containers with tasks nested underneath

**Component Rename**:

- File: `TaskDetailsCard.svelte` → `TimeBlocksCard.svelte`
- Component name: "Task Details" → "Focus & Tasks" or "Time Blocks"
- Mental model shift: Tasks are organized by time blocks, not just by day

### 1.2 Display Logic by User Level

**Progressive Disclosure Pattern**:

```typescript
// Display mode determines what users see
const showTimeBlocks = $derived(displayMode === 'intermediate' || displayMode === 'experienced');

// Card title changes based on what's shown
const cardTitle = $derived(showTimeBlocks ? 'Focus & Tasks' : 'Task Details');
```

**Display Modes**:

- `first-time`: **Tasks-only view** (traditional TaskDetailsCard)
- `getting-started`: **Tasks-only view** (1 project, learning basics)
- `intermediate`: **Time blocks + tasks** (2+ projects, ready for focus sessions)
- `experienced`: **Time blocks + tasks** (3+ projects, power users)

### 1.3 Column Structure

**Past Column**:

- Shows only tasks (no time blocks)
- Rationale: Historical view focused on what was completed/missed
- Tasks displayed in existing format

**Today Column**:

- **Time blocks** (chronologically ordered by start_time)
- Each time block shows:
    - Time range (e.g., "2:00 PM - 4:00 PM")
    - Block type indicator (project name or "Build Block")
    - AI suggestions preview (if available)
    - Associated tasks (if any)
- **Unscheduled tasks** (shown below time blocks or in separate section)

**Tomorrow Column**:

- Same structure as Today column
- **Time blocks** for tomorrow (chronological)
- **Unscheduled tasks** for tomorrow

### 1.4 Data Loading Strategy

**Approach**: Load time blocks with initial dashboard data for intermediate+ users

```typescript
// In Dashboard.svelte
let timeBlocks = $state<TimeBlockWithProject[]>([]);
let timeBlocksLoaded = $state(false);

// Computed: filter time blocks by day
const todayBlocks = $derived.by(() => {
	return timeBlocks.filter((block) => isSameDay(block.start_time, today));
});

const tomorrowBlocks = $derived.by(() => {
	return timeBlocks.filter((block) => isSameDay(block.start_time, tomorrow));
});

// Load time blocks when card becomes visible
async function loadTimeBlocks() {
	if (timeBlocksLoaded || displayMode === 'first-time') return;

	// Fetch next 7 days (covers today, tomorrow, and weekly view)
	const startDate = startOfDay(new Date());
	const endDate = addDays(startDate, 7);

	const response = await fetch(
		`/api/time-play/blocks?start_date=${startDate.toISOString()}&end_date=${endDate.toISOString()}`
	);

	const { data } = await response.json();
	timeBlocks = data.blocks || [];
	timeBlocksLoaded = true;
}
```

**Loading Trigger**: Load when TaskDetailsCard section becomes visible (intersection observer) OR eagerly load for experienced users

---

## 2. Component Architecture

### 2.1 TimeBlocksCard Component (Enhanced TaskDetailsCard)

**File**: `/apps/web/src/lib/components/dashboard/TimeBlocksCard.svelte` (renamed from TaskDetailsCard.svelte)

**Purpose**: Primary dashboard component displaying time blocks as containers with tasks nested underneath

**Props**:

```typescript
interface Props {
	tasks: TaskWithDetails[]; // Existing tasks data
	timeBlocks: TimeBlockWithProject[]; // NEW: Time blocks data
	displayMode: DashboardDisplayMode; // Determines if time blocks are shown
	isLoading?: boolean;
	onTaskClick?: (task: TaskWithDetails) => void;
	onTimeBlockClick?: (block: TimeBlockWithProject) => void; // NEW
	onCreateTimeBlock?: () => void; // NEW
}
```

**Component Structure**:

```svelte
<script lang="ts">
  import { resolveBlockAccentColor } from '$lib/utils/time-block-colors';
  import { formatTime, isSameDay } from '$lib/utils/date-helpers';
  import type { TaskWithDetails, TimeBlockWithProject, DashboardDisplayMode } from '@buildos/shared-types';

  let {
    tasks = [],
    timeBlocks = [],
    displayMode,
    isLoading = false,
    onTaskClick,
    onTimeBlockClick,
    onCreateTimeBlock
  }: Props = $props();

  // Show time blocks for intermediate+ users
  const showTimeBlocks = $derived(
    displayMode === 'intermediate' || displayMode === 'experienced'
  );

  // Card title changes based on what's displayed
  const cardTitle = $derived(
    showTimeBlocks ? '🎯 Focus & Tasks' : 'Task Details'
  );

  // Filter time blocks by day
  const todayBlocks = $derived.by(() => {
    const today = new Date();
    return timeBlocks
      .filter(block => isSameDay(new Date(block.start_time), today))
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
  });

  const tomorrowBlocks = $derived.by(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return timeBlocks
      .filter(block => isSameDay(new Date(block.start_time), tomorrow))
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
  });

  // Filter tasks by day (existing logic)
  const pastTasks = $derived.by(() => /* existing filter logic */);
  const todayTasks = $derived.by(() => /* existing filter logic */);
  const tomorrowTasks = $derived.by(() => /* existing filter logic */);

  // NEW: Separate scheduled vs unscheduled tasks
  const todayScheduledTasks = $derived.by(() => {
    // Tasks that have associated time blocks
    return todayTasks.filter(task => task.time_block_id);
  });

  const todayUnscheduledTasks = $derived.by(() => {
    // Tasks without time blocks
    return todayTasks.filter(task => !task.time_block_id);
  });

  // Same for tomorrow
  const tomorrowScheduledTasks = $derived.by(() => {
    return tomorrowTasks.filter(task => task.time_block_id);
  });

  const tomorrowUnscheduledTasks = $derived.by(() => {
    return tomorrowTasks.filter(task => !task.time_block_id);
  });

  // Get tasks for a specific time block
  function getTasksForBlock(blockId: string) {
    return tasks.filter(task => task.time_block_id === blockId);
  }
</script>

<section class="mb-4 sm:mb-6">
	<!-- Card Header -->
	<div class="flex items-center justify-between mb-3">
		<h2 class="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white">
			{cardTitle}
		</h2>
		{#if showTimeBlocks}
			<button
				type="button"
				class="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 flex items-center gap-1"
				onclick={onCreateTimeBlock}
			>
				<span>+</span>
				<span>New Focus Session</span>
			</button>
		{/if}
	</div>

	<!-- Three-column layout (existing structure, enhanced with time blocks) -->
	<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
		<!-- PAST COLUMN (tasks only, no time blocks) -->
		<div
			class="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700"
		>
			<h3 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Past</h3>

			{#if pastTasks.length > 0}
				<div class="space-y-2">
					{#each pastTasks as task}
						<button
							type="button"
							class="w-full text-left p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
							onclick={() => onTaskClick?.(task)}
						>
							<!-- Existing task display -->
							<div class="text-sm font-medium text-gray-900 dark:text-white">
								{task.title}
							</div>
							<div class="text-xs text-gray-500 dark:text-gray-400">
								{task.project_name}
							</div>
						</button>
					{/each}
				</div>
			{:else}
				<p class="text-sm text-gray-500 dark:text-gray-400">No past tasks</p>
			{/if}
		</div>

		<!-- TODAY COLUMN (time blocks + tasks) -->
		<div
			class="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700"
		>
			<h3 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Today</h3>

			<div class="space-y-3">
				<!-- Time Blocks Section (if enabled) -->
				{#if showTimeBlocks}
					{#if todayBlocks.length > 0}
						<!-- Render time blocks -->
						{#each todayBlocks as block}
							<div
								class="border-l-4 pl-3 py-2 rounded-r-lg
                          bg-gradient-to-r from-purple-50/30 to-transparent
                          dark:from-purple-900/20 dark:to-transparent
                          hover:from-purple-50/50 dark:hover:from-purple-900/30
                          transition-all"
								style="border-left-color: {resolveBlockAccentColor(block)}"
							>
								<!-- Time Block Header -->
								<button
									type="button"
									class="w-full text-left"
									onclick={() => onTimeBlockClick?.(block)}
								>
									<div class="flex items-center justify-between mb-1">
										<span
											class="text-xs font-semibold text-gray-700 dark:text-gray-300"
										>
											{formatTime(block.start_time)} - {formatTime(
												block.end_time
											)}
										</span>
										<span
											class="text-xs px-1.5 py-0.5 rounded
                                 bg-purple-100 text-purple-700
                                 dark:bg-purple-900/40 dark:text-purple-300"
										>
											{block.duration_minutes}m
										</span>
									</div>

									<div
										class="text-sm font-medium text-gray-900 dark:text-white mb-1"
									>
										{block.block_type === 'project'
											? block.project?.name
											: '🎯 Build Block'}
									</div>

									<!-- AI Suggestions preview -->
									{#if block.ai_suggestions && block.ai_suggestions.length > 0}
										<div class="text-xs text-gray-600 dark:text-gray-400">
											💡 {block.ai_suggestions.length} suggestions
										</div>
									{/if}
								</button>

								<!-- Tasks within this time block -->
								{#each getTasksForBlock(block.id) as task}
									<button
										type="button"
										class="w-full text-left pl-3 mt-2 p-1.5 rounded
                           hover:bg-white dark:hover:bg-gray-800 transition-colors"
										onclick={() => onTaskClick?.(task)}
									>
										<div class="text-xs text-gray-700 dark:text-gray-300">
											✓ {task.title}
										</div>
									</button>
								{/each}
							</div>
						{/each}

						<!-- Divider before unscheduled tasks -->
						{#if todayUnscheduledTasks.length > 0}
							<div class="border-t border-gray-200 dark:border-gray-700 my-3"></div>
							<p class="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">
								Unscheduled
							</p>
						{/if}
					{:else}
						<!-- Empty state for time blocks -->
						<button
							type="button"
							class="w-full p-3 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600
                     hover:border-purple-400 dark:hover:border-purple-500
                     text-center transition-all"
							onclick={onCreateTimeBlock}
						>
							<div class="text-2xl mb-1">🎯</div>
							<div class="text-xs text-gray-600 dark:text-gray-400">
								No focus sessions today
							</div>
							<div class="text-xs text-blue-600 dark:text-blue-400 mt-1">
								Click to schedule
							</div>
						</button>
					{/if}
				{/if}

				<!-- Unscheduled Tasks (or all tasks if time blocks disabled) -->
				{#each showTimeBlocks ? todayUnscheduledTasks : todayTasks as task}
					<button
						type="button"
						class="w-full text-left p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
						onclick={() => onTaskClick?.(task)}
					>
						<div class="text-sm font-medium text-gray-900 dark:text-white">
							{task.title}
						</div>
						<div class="text-xs text-gray-500 dark:text-gray-400">
							{task.project_name}
						</div>
					</button>
				{/each}
			</div>
		</div>

		<!-- TOMORROW COLUMN (same structure as Today) -->
		<div
			class="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700"
		>
			<h3 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Tomorrow</h3>

			<!-- Same structure as Today column -->
			<!-- [Implementation mirrors Today column logic] -->
		</div>
	</div>
</section>
```

**Key Features**:

- ✅ Time blocks as primary organizational containers
- ✅ Time blocks shown only in Today/Tomorrow columns (not Past)
- ✅ Tasks nested under their time blocks
- ✅ Unscheduled tasks shown separately
- ✅ Color-coded left border matching time block color
- ✅ Click time block → Opens TimeBlockModal
- ✅ Click task → Opens TaskModal
- ✅ Empty state with CTA to create first time block
- ✅ Progressive disclosure (tasks-only for new users)

### 2.2 TimeBlockModal Component

**File**: `/apps/web/src/lib/components/time-play/TimeBlockModal.svelte`

**Purpose**: Full-featured modal for creating/editing time blocks (similar to TaskModal)

**Design Pattern**: Follows TaskModal's two-column layout and visual patterns

**Props**:

```typescript
interface Props {
	isOpen: boolean;
	block?: TimeBlockWithProject | null; // undefined = create mode
	projects: Array<{
		id: string;
		name: string;
		calendar_color_id: string | null;
	}>;
	onClose: () => void;
	onCreate?: (block: TimeBlockWithProject) => void;
	onUpdate?: (block: TimeBlockWithProject) => void;
	onDelete?: (blockId: string) => void;
}
```

**Modal Structure**:

```svelte
<script lang="ts">
	import Modal from '$lib/components/ui/Modal.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { resolveBlockAccentColor } from '$lib/utils/time-block-colors';
	import { Calendar, Clock, Zap, Trash2 } from 'lucide-svelte';

	let {
		isOpen = false,
		block = null,
		projects = [],
		onClose,
		onCreate,
		onUpdate,
		onDelete
	}: Props = $props();

	// Local state (Svelte 5 runes)
	let blockType = $state<'project' | 'build'>(block?.block_type || 'project');
	let selectedProjectId = $state<string | null>(block?.project_id || null);
	let startDateTime = $state<string>('');
	let endDateTime = $state<string>('');
	let isSubmitting = $state(false);
	let isRegenerating = $state(false);

	const isEditing = $derived(!!block);
	const modalTitle = $derived(isEditing ? `Edit Focus Session` : `Schedule Focus Session`);

	// Calculate duration
	const durationMinutes = $derived.by(() => {
		if (!startDateTime || !endDateTime) return 0;
		const start = new Date(startDateTime);
		const end = new Date(endDateTime);
		return Math.floor((end.getTime() - start.getTime()) / 1000 / 60);
	});

	// Initialize values when block changes
	$effect(() => {
		if (block) {
			blockType = block.block_type;
			selectedProjectId = block.project_id;
			startDateTime = formatDateTimeForInput(block.start_time);
			endDateTime = formatDateTimeForInput(block.end_time);
		}
	});

	async function handleSubmit() {
		// Validation
		if (blockType === 'project' && !selectedProjectId) {
			alert('Please select a project');
			return;
		}

		if (!startDateTime || !endDateTime) {
			alert('Please select start and end times');
			return;
		}

		if (durationMinutes < 15) {
			alert('Focus session must be at least 15 minutes');
			return;
		}

		isSubmitting = true;

		try {
			const params = {
				block_type: blockType,
				project_id: blockType === 'project' ? selectedProjectId : null,
				start_time: new Date(startDateTime).toISOString(),
				end_time: new Date(endDateTime).toISOString()
			};

			if (isEditing && onUpdate) {
				// Update existing block
				const response = await fetch(`/api/time-play/blocks/${block.id}`, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(params)
				});

				const { data } = await response.json();
				onUpdate(data.time_block);
			} else if (!isEditing && onCreate) {
				// Create new block
				const response = await fetch('/api/time-play/create', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(params)
				});

				const { data } = await response.json();
				onCreate(data.time_block);
			}

			onClose();
		} catch (error) {
			console.error('Failed to save time block:', error);
			alert(error.message || 'Failed to save focus session');
		} finally {
			isSubmitting = false;
		}
	}

	async function handleRegenerate() {
		if (!block) return;

		isRegenerating = true;
		try {
			const response = await fetch(`/api/time-play/blocks/${block.id}/suggestions`, {
				method: 'POST'
			});

			const { data } = await response.json();
			if (onUpdate) {
				onUpdate(data.time_block);
			}
		} catch (error) {
			console.error('Failed to regenerate suggestions:', error);
		} finally {
			isRegenerating = false;
		}
	}

	async function handleDelete() {
		if (!block || !onDelete) return;

		if (!confirm('Delete this focus session? This will also remove it from your calendar.')) {
			return;
		}

		try {
			await fetch(`/api/time-play/delete/${block.id}`, { method: 'DELETE' });
			onDelete(block.id);
			onClose();
		} catch (error) {
			console.error('Failed to delete time block:', error);
			alert('Failed to delete focus session');
		}
	}
</script>

<Modal title={modalTitle} {isOpen} {onClose} size="xl">
	<form
		onsubmit={(e) => {
			e.preventDefault();
			handleSubmit();
		}}
	>
		<!-- Two-column layout (matches TaskModal) -->
		<div class="grid grid-cols-1 lg:grid-cols-4 gap-6">
			<!-- Left Column: Content (3/4 width) -->
			<div class="lg:col-span-3 space-y-5">
				<!-- Block Type Selector -->
				<div
					class="bg-gradient-to-r from-purple-50/50 to-blue-50/50
                    dark:from-purple-900/20 dark:to-blue-900/20
                    -m-4 sm:-m-5 mb-0 p-4 sm:p-5 rounded-t-xl
                    border-b border-gray-200/50 dark:border-gray-700/50"
				>
					<FormField label="Session Type" labelFor="block-type" required>
						<div class="flex gap-3">
							<button
								type="button"
								class="flex-1 p-3 rounded-lg border-2 transition-all
                       {blockType === 'project'
									? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
									: 'border-gray-300 dark:border-gray-600 hover:border-gray-400'}"
								onclick={() => (blockType = 'project')}
							>
								<div class="flex items-center gap-2">
									<div
										class="w-4 h-4 rounded-full border-2
                             {blockType === 'project'
											? 'border-blue-500 bg-blue-500'
											: 'border-gray-400'}"
									/>
									<span class="font-semibold text-sm">Project Focus</span>
								</div>
								<p class="text-xs text-gray-600 dark:text-gray-300 mt-1">
									Work on a specific project
								</p>
							</button>

							<button
								type="button"
								class="flex-1 p-3 rounded-lg border-2 transition-all
                       {blockType === 'build'
									? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
									: 'border-gray-300 dark:border-gray-600 hover:border-gray-400'}"
								onclick={() => (blockType = 'build')}
							>
								<div class="flex items-center gap-2">
									<div
										class="w-4 h-4 rounded-full border-2
                             {blockType === 'build'
											? 'border-purple-500 bg-purple-500'
											: 'border-gray-400'}"
									/>
									<span class="font-semibold text-sm">Build Block</span>
								</div>
								<p class="text-xs text-gray-600 dark:text-gray-300 mt-1">
									Flexible deep work time
								</p>
							</button>
						</div>
					</FormField>
				</div>

				<!-- Project Selector (conditional) -->
				{#if blockType === 'project'}
					<FormField label="Project" labelFor="project" required>
						<Select id="project" bind:value={selectedProjectId} size="lg">
							<option value="">Select a project...</option>
							{#each projects as project}
								<option value={project.id}>{project.name}</option>
							{/each}
						</Select>
					</FormField>
				{/if}

				<!-- Time Selection -->
				<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
					<FormField label="Start Time" labelFor="start-time" required>
						<TextInput
							id="start-time"
							type="datetime-local"
							bind:value={startDateTime}
							icon={Clock}
						/>
					</FormField>

					<FormField label="End Time" labelFor="end-time" required>
						<TextInput
							id="end-time"
							type="datetime-local"
							bind:value={endDateTime}
							icon={Clock}
						/>
					</FormField>
				</div>

				<!-- Duration Display -->
				{#if durationMinutes > 0}
					<div
						class="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20
                      border border-blue-200 dark:border-blue-700"
					>
						<div class="flex items-center gap-2 text-sm">
							<Clock class="w-4 h-4 text-blue-600 dark:text-blue-400" />
							<span class="font-medium text-blue-900 dark:text-blue-100">
								Duration: {Math.floor(durationMinutes / 60)}h {durationMinutes %
									60}m
							</span>
						</div>
					</div>
				{/if}

				<!-- AI Suggestions Section (edit mode only) -->
				{#if isEditing && block}
					<div class="mt-6">
						<div class="flex items-center justify-between mb-3">
							<h3 class="text-sm font-semibold text-gray-900 dark:text-white">
								<span class="mr-1.5">💡</span>Focus Suggestions
							</h3>
							<button
								type="button"
								class="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400
                       flex items-center gap-1"
								onclick={handleRegenerate}
								disabled={isRegenerating}
							>
								<Zap class="w-3 h-3" />
								{isRegenerating ? 'Regenerating...' : 'Regenerate'}
							</button>
						</div>

						{#if block.ai_suggestions && block.ai_suggestions.length > 0}
							<div class="space-y-2">
								{#each block.ai_suggestions as suggestion, index}
									<div
										class="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50
                              border border-gray-200 dark:border-gray-700"
									>
										<div class="flex items-start gap-3">
											<span
												class="flex-shrink-0 w-6 h-6 rounded-full
                                   bg-blue-500 text-white text-xs
                                   flex items-center justify-center font-bold"
											>
												{index + 1}
											</span>
											<div class="flex-1">
												<h4
													class="text-sm font-medium text-gray-900 dark:text-white"
												>
													{suggestion.title}
												</h4>
												<p
													class="text-xs text-gray-600 dark:text-gray-300 mt-1"
												>
													{suggestion.reason}
												</p>
												{#if suggestion.project_name || suggestion.estimated_minutes}
													<div
														class="flex items-center gap-2 mt-2 text-xs text-gray-500"
													>
														{#if suggestion.project_name}
															<span>{suggestion.project_name}</span>
														{/if}
														{#if suggestion.estimated_minutes}
															<span>•</span>
															<span
																>{suggestion.estimated_minutes} min</span
															>
														{/if}
														{#if suggestion.priority}
															<span>•</span>
															<span class="uppercase"
																>{suggestion.priority}</span
															>
														{/if}
													</div>
												{/if}
											</div>
										</div>
									</div>
								{/each}
							</div>
						{:else}
							<p class="text-sm text-gray-500 dark:text-gray-400">
								No suggestions yet. Click "Regenerate" to get AI-powered focus
								suggestions.
							</p>
						{/if}
					</div>
				{/if}
			</div>

			<!-- Right Column: Metadata Sidebar (1/4 width) -->
			<div class="lg:col-span-1">
				<div
					class="bg-gradient-to-br from-gray-50/50 to-gray-100/30
                    dark:from-gray-800/50 dark:to-gray-900/30
                    rounded-xl p-3 sm:p-4 space-y-4
                    border border-gray-200/50 dark:border-gray-700/50
                    shadow-sm"
				>
					<!-- Calendar Sync Status -->
					{#if isEditing && block}
						<div class="space-y-2">
							<h4
								class="text-xs font-semibold uppercase tracking-wider text-gray-500"
							>
								Calendar Sync
							</h4>
							<div class="flex items-center gap-2">
								<div
									class="w-2 h-2 rounded-full
                           {block.sync_status === 'synced' ? 'bg-green-500' : 'bg-yellow-500'}"
								/>
								<span class="text-xs text-gray-600 dark:text-gray-300">
									{block.sync_status === 'synced' ? 'Synced' : 'Pending'}
								</span>
							</div>
							{#if block.calendar_event_link}
								<a
									href={block.calendar_event_link}
									target="_blank"
									class="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400
                         flex items-center gap-1"
								>
									<Calendar class="w-3 h-3" />
									Open in Calendar
								</a>
							{/if}
						</div>
					{/if}

					<!-- Metadata -->
					<div class="space-y-2">
						<h4 class="text-xs font-semibold uppercase tracking-wider text-gray-500">
							Session Info
						</h4>
						<div class="text-xs space-y-1">
							<div class="flex justify-between">
								<span class="text-gray-500">Type</span>
								<span class="font-medium text-gray-900 dark:text-white">
									{blockType === 'project' ? 'Project' : 'Build'}
								</span>
							</div>
							{#if durationMinutes > 0}
								<div class="flex justify-between">
									<span class="text-gray-500">Duration</span>
									<span class="font-medium text-gray-900 dark:text-white">
										{durationMinutes} min
									</span>
								</div>
							{/if}
						</div>
					</div>

					<!-- Activity (edit mode only) -->
					{#if isEditing && block}
						<div class="space-y-2">
							<h4
								class="text-xs font-semibold uppercase tracking-wider text-gray-500"
							>
								Activity
							</h4>
							<div class="text-xs text-gray-600 dark:text-gray-300 space-y-1">
								<div>Created {formatRelativeTime(block.created_at)}</div>
								{#if block.updated_at !== block.created_at}
									<div>Updated {formatRelativeTime(block.updated_at)}</div>
								{/if}
							</div>
						</div>
					{/if}
				</div>
			</div>
		</div>

		<!-- Action Buttons -->
		<div class="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
			<!-- Mobile Layout -->
			<div class="sm:hidden space-y-3">
				<Button
					type="submit"
					variant="primary"
					size="lg"
					class="w-full"
					disabled={isSubmitting}
				>
					{isSubmitting
						? 'Saving...'
						: isEditing
							? 'Save Changes'
							: 'Create Focus Session'}
				</Button>
				<div class="grid grid-cols-2 gap-2">
					<Button type="button" variant="ghost" onclick={onClose}>Cancel</Button>
					{#if isEditing && onDelete}
						<Button type="button" variant="danger" onclick={handleDelete}>Delete</Button
						>
					{/if}
				</div>
			</div>

			<!-- Desktop Layout -->
			<div class="hidden sm:flex sm:justify-between">
				{#if isEditing && onDelete}
					<Button type="button" variant="danger" onclick={handleDelete}>
						<Trash2 class="w-4 h-4 mr-2" />
						Delete Session
					</Button>
				{:else}
					<div />
				{/if}

				<div class="flex gap-3">
					<Button type="button" variant="outline" onclick={onClose}>Cancel</Button>
					<Button type="submit" variant="primary" disabled={isSubmitting}>
						{isSubmitting
							? 'Saving...'
							: isEditing
								? 'Save Changes'
								: 'Create Focus Session'}
					</Button>
				</div>
			</div>
		</div>
	</form>
</Modal>
```

**Key Features** (matching TaskModal patterns):

- ✅ Two-column layout (content + metadata sidebar)
- ✅ Gradient headers with visual hierarchy
- ✅ Block type selector with radio buttons
- ✅ Conditional project selector (only for project blocks)
- ✅ datetime-local inputs for scheduling
- ✅ Duration calculation and display
- ✅ AI suggestions section (edit mode)
- ✅ Regenerate suggestions button
- ✅ Calendar sync status in sidebar
- ✅ Activity timestamps
- ✅ Responsive: stacked buttons on mobile, horizontal on desktop
- ✅ Form validation
- ✅ Loading states for all async operations
- ✅ Svelte 5 runes throughout ($state, $derived, $effect, $props)

### 2.3 Weekly Tasks Integration

**File**: `/apps/web/src/lib/components/dashboard/WeeklyTaskCalendar.svelte` (existing component to enhance)

**Purpose**: Show time blocks alongside tasks in the weekly calendar view

**Current Structure**:

- Displays tasks grouped by day in a weekly grid
- Shows task count, completion status, and task items

**Enhanced Structure**:

```svelte
<script lang="ts">
	import type { WeeklyTasksData, TimeBlockWithProject } from '@buildos/shared-types';
	import { resolveBlockAccentColor } from '$lib/utils/time-block-colors';
	import { formatTime } from '$lib/utils/date-helpers';

	let {
		weeklyTasks,
		timeBlocks = [], // NEW: time blocks data
		displayMode,
		onTaskClick,
		onTimeBlockClick // NEW
	}: Props = $props();

	const showTimeBlocks = $derived(
		displayMode === 'intermediate' || displayMode === 'experienced'
	);

	// Group time blocks by day
	function getTimeBlocksForDay(date: Date): TimeBlockWithProject[] {
		return timeBlocks
			.filter((block) => isSameDay(new Date(block.start_time), date))
			.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
	}
</script>

<!-- For each day in weekly view -->
{#each daysOfWeek as day}
	<div class="day-column">
		<h3>{formatDayHeader(day)}</h3>

		<!-- NEW: Time Blocks Section (if enabled) -->
		{#if showTimeBlocks}
			{#each getTimeBlocksForDay(day) as block}
				<button
					type="button"
					class="time-block-item w-full text-left p-2 mb-2 rounded-lg
                 border-l-4 bg-gradient-to-r from-purple-50/20 to-transparent
                 dark:from-purple-900/10 dark:to-transparent
                 hover:from-purple-50/40 dark:hover:from-purple-900/20
                 transition-all"
					style="border-left-color: {resolveBlockAccentColor(block)}"
					onclick={() => onTimeBlockClick?.(block)}
				>
					<!-- Time range -->
					<div class="flex items-center justify-between text-xs mb-1">
						<span class="font-semibold text-gray-700 dark:text-gray-300">
							{formatTime(block.start_time)} - {formatTime(block.end_time)}
						</span>
						<span
							class="px-1.5 py-0.5 rounded text-xs
                         bg-purple-100 text-purple-700
                         dark:bg-purple-900/40 dark:text-purple-300"
						>
							{block.duration_minutes}m
						</span>
					</div>

					<!-- Block title -->
					<div class="text-sm font-medium text-gray-900 dark:text-white">
						🎯 {block.block_type === 'project' ? block.project?.name : 'Build Block'}
					</div>

					<!-- AI suggestions count -->
					{#if block.ai_suggestions && block.ai_suggestions.length > 0}
						<div class="text-xs text-gray-500 dark:text-gray-400 mt-1">
							💡 {block.ai_suggestions.length} suggestions
						</div>
					{/if}
				</button>
			{/each}

			<!-- Divider between time blocks and tasks -->
			{#if getTimeBlocksForDay(day).length > 0 && getTasksForDay(day).length > 0}
				<div class="border-t border-gray-200 dark:border-gray-700 my-2"></div>
				<p class="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Tasks</p>
			{/if}
		{/if}

		<!-- Existing tasks section -->
		{#each getTasksForDay(day) as task}
			<button type="button" class="task-item" onclick={() => onTaskClick?.(task)}>
				<!-- Existing task display -->
				{task.title}
			</button>
		{/each}
	</div>
{/each}
```

**Visual Integration**:

- Time blocks appear **above** tasks for each day
- Left border color matches time block's project color
- Compact design to fit alongside tasks
- Shows time range, duration, and AI suggestions count
- Click to open TimeBlockModal
- Divider separates time blocks from unscheduled tasks

**Data Flow**:

```typescript
// In Dashboard.svelte
<WeeklyTaskCalendar
  {weeklyTasks}
  timeBlocks={timeBlocks} // Pass time blocks data
  {displayMode}
  {onTaskClick}
  onTimeBlockClick={handleTimeBlockClick}
/>
```

**Key Design Decisions**:

1. **Placement**: Time blocks **above** tasks (chronological priority)
2. **Styling**: Lighter than main TimeBlocksCard to avoid visual competition
3. **Density**: More compact than TimeBlocksCard (fits weekly grid)
4. **Interaction**: Click opens TimeBlockModal (same as TimeBlocksCard)

---

## 3. Visual Design System

### 3.1 Color Palette

**Primary Colors** (Time Play theme):

```typescript
// Purple gradient (focus/concentration)
from-purple-500 to-indigo-600
from-purple-50 to-blue-50 (light mode background)
from-purple-900/20 to-blue-900/20 (dark mode background)

// Build blocks
#f97316 (Orange)

// Project blocks
Dynamic based on project.calendar_color_id

// Calendar events (external)
rgb(226 232 240) (Grey)

// Available slots
rgb(209 250 229) (Emerald green)
```

**Semantic Colors**:

- Success/Synced: `green-500`
- Warning/Pending: `yellow-500`
- Error/Failed: `red-500`
- Info: `blue-500`

### 3.2 Typography

**Dashboard Widget**:

```css
/* Header */
h2: text-lg sm:text-xl font-semibold

/* Block title */
h3: text-sm font-semibold

/* Metadata */
text-xs font-medium

/* Body text */
text-sm
```

**Modal**:

```css
/* Modal title */
text-2xl font-bold

/* Section headers */
text-sm font-semibold uppercase tracking-wider

/* Field labels */
text-sm font-medium

/* Input text */
text-base

/* Helper text */
text-xs text-gray-600
```

### 3.3 Spacing & Layout

**Widget Card**:

```css
padding: p-4 sm:p-5
gap: space-y-3
margin-bottom: mb-4 sm:mb-6
```

**Modal**:

```css
padding: p-4 sm:p-5 lg:p-6
gap: space-y-5 (content), space-y-4 (sidebar)
grid: lg:grid-cols-4 (3/4 content, 1/4 sidebar)
```

**Interactive Elements**:

```css
/* Minimum touch target */
min-height: 44px (mobile)
min-height: 36px (desktop)

/* Hover scale */
hover:scale-[1.01]

/* Shadow elevation */
shadow-sm → shadow-md (on hover)
```

### 3.4 Glass Morphism Effects

**Time Play Aesthetic** (matches existing TimePlay page):

```css
/* Widget card */
background: bg-gradient-to-br from-white/80 to-purple-50/60
backdrop-filter: backdrop-blur-xl
border: border-purple-200/60 with 60% opacity
shadow: shadow-lg shadow-purple-200/60

/* Dark mode */
background: from-gray-800/60 to-purple-900/40
border: border-purple-500/30
shadow: shadow-purple-900/50
```

**Inner Cards** (block items):

```css
background: from-white/70 to-gray-50/50
border: border-gray-200/50
hover: shadow-md
```

### 3.5 Icons

**Dashboard Widget**:

- Widget header: 🎯 (Focus emoji)
- Project blocks: Colored dot indicator
- Build blocks: Purple dot indicator
- AI suggestions: 💡 (Lightbulb emoji)

**Modal**:

- Calendar icon: `<Calendar />` (lucide-svelte)
- Clock icon: `<Clock />` (lucide-svelte)
- Regenerate: `<Zap />` (lucide-svelte)
- Delete: `<Trash2 />` (lucide-svelte)

---

## 4. Integration with Existing Dashboard

### 4.1 Dashboard.svelte Modifications

**File**: `/apps/web/src/lib/components/dashboard/Dashboard.svelte`

**Key Changes**:

1. **Replace** TaskDetailsCard import with TimeBlocksCard
2. **Add** TimeBlockModal for editing time blocks
3. **Add** time blocks state management
4. **Pass** time blocks data to TimeBlocksCard and WeeklyTaskCalendar
5. **Add** event handlers for time block interactions

**Code Changes**:

```svelte
<script lang="ts">
	// ... existing imports ...

	// CHANGED: Import renamed component
	import TimeBlocksCard from '$lib/components/dashboard/TimeBlocksCard.svelte';
	// Was: import TaskDetailsCard from '$lib/components/dashboard/TaskDetailsCard.svelte';

	// NEW: Import time block modal
	import TimeBlockModal from '$lib/components/time-play/TimeBlockModal.svelte';
	import type { TimeBlockWithProject } from '@buildos/shared-types';

	// ... existing props ...

	// NEW: Time block state
	let timeBlocks = $state<TimeBlockWithProject[]>([]);
	let timeBlocksLoaded = $state(false);
	let loadingTimeBlocks = $state(false);
	let showTimeBlockModal = $state(false);
	let selectedTimeBlock = $state<TimeBlockWithProject | null>(null);

	// NEW: Load time blocks function
	async function loadTimeBlocks() {
		if (timeBlocksLoaded || loadingTimeBlocks) return;

		loadingTimeBlocks = true;
		try {
			// Get next 7 days (covers today, tomorrow, and weekly view)
			const startDate = new Date();
			const endDate = new Date();
			endDate.setDate(endDate.getDate() + 7);

			const response = await fetch(
				`/api/time-play/blocks?start_date=${startDate.toISOString()}&end_date=${endDate.toISOString()}`
			);

			if (response.ok) {
				const { data } = await response.json();
				timeBlocks = data.blocks || [];
				timeBlocksLoaded = true;
			}
		} catch (error) {
			console.error('Failed to load time blocks:', error);
		} finally {
			loadingTimeBlocks = false;
		}
	}

	// NEW: Time block event handlers
	function handleTimeBlockClick(block: TimeBlockWithProject) {
		selectedTimeBlock = block;
		showTimeBlockModal = true;
	}

	function handleCreateTimeBlock() {
		selectedTimeBlock = null;
		showTimeBlockModal = true;
	}

	function handleTimeBlockUpdate(updatedBlock: TimeBlockWithProject) {
		// Update in local state
		const index = timeBlocks.findIndex((b) => b.id === updatedBlock.id);
		if (index !== -1) {
			timeBlocks[index] = updatedBlock;
			timeBlocks = [...timeBlocks]; // Trigger reactivity
		}
	}

	function handleTimeBlockCreate(newBlock: TimeBlockWithProject) {
		// Add to local state
		timeBlocks = [...timeBlocks, newBlock];
	}

	function handleTimeBlockDelete(blockId: string) {
		// Remove from local state
		timeBlocks = timeBlocks.filter((b) => b.id !== blockId);
	}

	// NEW: Load time blocks when task details section loads
	$effect(() => {
		// Load when intermediate+ user and section is visible
		if (
			!timeBlocksLoaded &&
			(displayMode === 'intermediate' || displayMode === 'experienced')
		) {
			loadTimeBlocks();
		}
	});
</script>

<!-- Existing dashboard sections ... -->

<!-- CHANGED: TaskDetailsCard → TimeBlocksCard (with time blocks data) -->
<TimeBlocksCard
	tasks={todayTasks.concat(tomorrowTasks, pastTasks)}
	{timeBlocks}
	{displayMode}
	isLoading={loadingTimeBlocks}
	onTaskClick={handleTaskClick}
	onTimeBlockClick={handleTimeBlockClick}
	onCreateTimeBlock={handleCreateTimeBlock}
/>

<!-- CHANGED: WeeklyTaskCalendar (now includes time blocks) -->
{#if weeklyTasksByDate && Object.keys(weeklyTasksByDate).length > 0}
	<section class="mb-4 sm:mb-6">
		<WeeklyTaskCalendar
			{weeklyTasksByDate}
			{timeBlocks}
			{displayMode}
			onTaskClick={handleTaskClick}
			onTimeBlockClick={handleTimeBlockClick}
		/>
	</section>
{/if}

<!-- Stats Grid (existing) -->
<div class="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5 mb-4 sm:mb-6">
	<!-- ... existing stats cards ... -->
</div>

<!-- Lazy-loaded bottom sections ... -->

<!-- NEW: Time Block Modal -->
{#if showTimeBlockModal}
	<TimeBlockModal
		isOpen={showTimeBlockModal}
		block={selectedTimeBlock}
		projects={activeProjects}
		onClose={() => {
			showTimeBlockModal = false;
			selectedTimeBlock = null;
		}}
		onCreate={handleTimeBlockCreate}
		onUpdate={handleTimeBlockUpdate}
		onDelete={handleTimeBlockDelete}
	/>
{/if}
```

**Summary of Changes**:

| Component              | Change                            | Impact                                          |
| ---------------------- | --------------------------------- | ----------------------------------------------- |
| **TaskDetailsCard**    | Renamed to TimeBlocksCard         | Now displays time blocks as primary containers  |
| **WeeklyTaskCalendar** | Enhanced with time blocks         | Shows time blocks above tasks for each day      |
| **Dashboard**          | Added time block state & handlers | Manages time blocks data and modal interactions |
| **TimeBlockModal**     | New component                     | Allows creating/editing time blocks             |

**Files Modified**:

- `/apps/web/src/lib/components/dashboard/Dashboard.svelte` (enhanced)
- `/apps/web/src/lib/components/dashboard/TaskDetailsCard.svelte` → `TimeBlocksCard.svelte` (renamed & enhanced)
- `/apps/web/src/lib/components/dashboard/WeeklyTaskCalendar.svelte` (enhanced)

**Files Created**:

- `/apps/web/src/lib/components/time-play/TimeBlockModal.svelte` (new)

### 4.2 Data Flow

**Creation Flow**:

```
User clicks "Schedule Focus Session"
  ↓
Opens TimeBlockModal (create mode)
  ↓
User fills form and submits
  ↓
POST /api/time-play/create
  ↓
TimeBlockService creates block + AI suggestions + calendar event
  ↓
Returns TimeBlockWithProject
  ↓
handleTimeBlockCreate adds to local state
  ↓
Widget updates to show new block
```

**Update Flow**:

```
User clicks block in widget
  ↓
Opens TimeBlockModal (edit mode) with block data
  ↓
User modifies and saves
  ↓
PATCH /api/time-play/blocks/{id}
  ↓
TimeBlockService updates block + calendar event
  ↓
Returns updated TimeBlockWithProject
  ↓
handleTimeBlockUpdate replaces in local state
  ↓
Widget updates to show changes
```

**Delete Flow**:

```
User clicks "Delete" in modal
  ↓
Confirmation dialog
  ↓
DELETE /api/time-play/delete/{id}
  ↓
TimeBlockService soft-deletes + removes calendar event
  ↓
handleTimeBlockDelete removes from local state
  ↓
Widget updates (may hide if no blocks remain)
```

---

## 5. API Integration

### 5.1 Required API Endpoints

All endpoints already exist (no new endpoints needed):

**Fetch Blocks**:

```
GET /api/time-play/blocks?start_date=...&end_date=...
Response: { success: true, data: { blocks: TimeBlockWithProject[] } }
```

**Create Block**:

```
POST /api/time-play/create
Body: { block_type, project_id, start_time, end_time, timezone }
Response: { success: true, data: { time_block: TimeBlockWithProject } }
```

**Update Block** (NEW - needs implementation):

```
PATCH /api/time-play/blocks/{id}
Body: { block_type?, project_id?, start_time?, end_time?, timezone? }
Response: { success: true, data: { time_block: TimeBlockWithProject } }
```

**Regenerate Suggestions**:

```
POST /api/time-play/blocks/{id}/suggestions
Response: { success: true, data: { time_block: TimeBlockWithProject } }
```

**Delete Block**:

```
DELETE /api/time-play/delete/{id}
Response: { success: true, message: '...' }
```

### 5.2 Update Endpoint Implementation

**File**: `/apps/web/src/routes/api/time-play/blocks/[id]/+server.ts`

```typescript
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { TimeBlockService } from '$lib/services/time-block.service';
import { CalendarService } from '$lib/services/calendar-service';
import { isFeatureEnabled } from '$lib/utils/feature-flags';

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	// 1. Check authentication
	const session = await locals.auth();
	if (!session?.user?.id) {
		throw error(401, 'Unauthorized');
	}

	// 2. Check feature flag
	const hasAccess = await isFeatureEnabled(locals.supabase, session.user.id, 'time_play');
	if (!hasAccess) {
		throw error(403, 'Time Play feature not enabled for this user');
	}

	// 3. Parse request body
	const body = await request.json();
	const { block_type, project_id, start_time, end_time, timezone } = body;

	// 4. Update time block
	try {
		const calendarService = new CalendarService(locals.supabase, session.user.id);
		const timeBlockService = new TimeBlockService(
			locals.supabase,
			session.user.id,
			calendarService
		);

		const updatedBlock = await timeBlockService.updateTimeBlock(params.id, {
			block_type,
			project_id,
			start_time: start_time ? new Date(start_time) : undefined,
			end_time: end_time ? new Date(end_time) : undefined,
			timezone
		});

		return json({
			success: true,
			data: {
				time_block: updatedBlock
			}
		});
	} catch (err) {
		console.error('Error updating time block:', err);
		throw error(500, err instanceof Error ? err.message : 'Failed to update time block');
	}
};
```

### 5.3 Service Method: updateTimeBlock

**File**: `/apps/web/src/lib/services/time-block.service.ts`

```typescript
/**
 * Update an existing time block
 */
async updateTimeBlock(
  blockId: string,
  params: UpdateTimeBlockParams
): Promise<TimeBlockWithProject> {
  // 1. Fetch existing block
  const { data: existingBlock, error: fetchError } = await this.supabase
    .from('time_blocks')
    .select('*, project:projects(id, name, calendar_color_id)')
    .eq('id', blockId)
    .eq('user_id', this.userId)
    .neq('sync_status', 'deleted')
    .single();

  if (fetchError || !existingBlock) {
    throw new Error('Time block not found');
  }

  // 2. Build update object (only changed fields)
  const updates: any = {
    updated_at: new Date().toISOString()
  };

  if (params.block_type !== undefined) {
    updates.block_type = params.block_type;
  }

  if (params.project_id !== undefined) {
    updates.project_id = params.project_id;
  }

  if (params.start_time !== undefined) {
    updates.start_time = params.start_time.toISOString();
  }

  if (params.end_time !== undefined) {
    updates.end_time = params.end_time.toISOString();
  }

  if (params.timezone !== undefined) {
    updates.timezone = params.timezone;
  }

  // Recalculate duration if times changed
  if (params.start_time || params.end_time) {
    const startTime = params.start_time || new Date(existingBlock.start_time);
    const endTime = params.end_time || new Date(existingBlock.end_time);
    updates.duration_minutes = this.calculateDuration(startTime, endTime);
  }

  // 3. Validate updated parameters
  const mergedBlock = { ...existingBlock, ...updates };
  this.validateTimeBlockParams({
    block_type: mergedBlock.block_type,
    project_id: mergedBlock.project_id,
    start_time: new Date(mergedBlock.start_time),
    end_time: new Date(mergedBlock.end_time)
  });

  // 4. Check for conflicts (exclude current block)
  if (params.start_time || params.end_time) {
    await this.checkConflicts(
      new Date(mergedBlock.start_time),
      new Date(mergedBlock.end_time),
      blockId // Exclude self from conflict check
    );
  }

  // 5. Update database
  const { data: updatedBlock, error: updateError } = await this.supabase
    .from('time_blocks')
    .update(updates)
    .eq('id', blockId)
    .eq('user_id', this.userId)
    .select('*, project:projects(id, name, calendar_color_id)')
    .single();

  if (updateError || !updatedBlock) {
    throw updateError || new Error('Failed to update time block');
  }

  // 6. Update Google Calendar event (if synced)
  if (updatedBlock.calendar_event_id && this.calendarService) {
    try {
      await this.updateCalendarEvent(updatedBlock);
    } catch (calendarError) {
      console.error('Failed to update calendar event:', calendarError);
      // Don't fail the whole operation if calendar update fails
      // Mark as needs sync
      await this.supabase
        .from('time_blocks')
        .update({ sync_status: 'pending' })
        .eq('id', blockId);
    }
  }

  return updatedBlock as TimeBlockWithProject;
}

/**
 * Update the Google Calendar event for a time block
 */
private async updateCalendarEvent(block: TimeBlockWithProject): Promise<void> {
  if (!this.calendarService || !block.calendar_event_id) return;

  const eventTitle = block.block_type === 'project'
    ? `${block.project?.name} — Focus Session`
    : 'Build Block — Focus Time';

  const eventDescription = this.buildCalendarDescription(block);

  const colorId = block.block_type === 'build'
    ? BUILD_BLOCK_COLOR
    : (block.project?.calendar_color_id || DEFAULT_PROJECT_COLOR);

  await this.calendarService.updateCalendarEvent(
    block.calendar_event_id,
    'primary',
    {
      summary: eventTitle,
      description: eventDescription,
      start: {
        dateTime: new Date(block.start_time).toISOString(),
        timeZone: block.timezone
      },
      end: {
        dateTime: new Date(block.end_time).toISOString(),
        timeZone: block.timezone
      },
      colorId
    }
  );

  // Update sync status
  await this.supabase
    .from('time_blocks')
    .update({
      sync_status: 'synced',
      last_synced_at: new Date().toISOString()
    })
    .eq('id', block.id);
}
```

---

## 6. Responsive Design

### 6.1 Mobile Layout (< 640px)

**Widget**:

- Single column cards
- Reduced padding (`p-3` instead of `p-4`)
- Larger tap targets (min 44px)
- Truncated text with line-clamp
- Simplified metadata (hide some details)

**Modal**:

- Single column (sidebar stacks below content)
- Stacked action buttons (full width)
- Larger form inputs (size="lg")
- Simplified date display

### 6.2 Tablet Layout (640px - 1024px)

**Widget**:

- Same as mobile but with more breathing room
- Padding increases (`p-4`)

**Modal**:

- Single column still
- Horizontal button layout appears

### 6.3 Desktop Layout (>= 1024px)

**Widget**:

- Same layout as tablet
- Hover effects enabled
- Tooltips show more detail

**Modal**:

- Two-column grid appears (3/4 + 1/4)
- Sidebar shows metadata
- Horizontal button layout
- Richer hover states

---

## 7. Accessibility

### 7.1 Keyboard Navigation

**Widget**:

- Tab through blocks
- Enter/Space to open modal
- Esc to close modal

**Modal**:

- Auto-focus first input on open
- Tab order: Block type → Project (if needed) → Start time → End time → Actions
- Esc to close
- Form submit on Enter (when focus in input)

### 7.2 Screen Readers

**ARIA Labels**:

```svelte
<!-- Widget -->
<section aria-label="Upcoming focus sessions">
	<h2 id="focus-sessions-heading">Focus Sessions</h2>
	<div role="list" aria-labelledby="focus-sessions-heading">
		{#each blocks as block}
			<button role="listitem" aria-label="Focus session for {blockTitle} on {date}">
				...
			</button>
		{/each}
	</div>
</section>

<!-- Modal -->
<Modal title="Schedule Focus Session" aria-label="Focus session creation form">
	<form aria-label="Focus session details">
		<FormField label="Session Type" required>
			<div role="radiogroup" aria-label="Select session type">
				<button role="radio" aria-checked={blockType === 'project'}> Project Focus </button>
				<button role="radio" aria-checked={blockType === 'build'}> Build Block </button>
			</div>
		</FormField>
	</form>
</Modal>
```

### 7.3 Focus Management

**Modal Open**:

```typescript
function handleOpenModal() {
	showTimeBlockModal = true;
	// Auto-focus first interactive element
	nextTick(() => {
		document.querySelector('[data-autofocus]')?.focus();
	});
}
```

**Modal Close**:

```typescript
function handleCloseModal() {
	showTimeBlockModal = false;
	// Return focus to trigger element
	triggerElement?.focus();
}
```

### 7.4 Color Contrast

All text meets **WCAG AA** standards:

- Light mode: `text-gray-900` (>= 4.5:1)
- Dark mode: `text-white` (>= 4.5:1)
- Colored text uses darker shades (e.g., `text-blue-700` not `text-blue-400`)

---

## 8. Performance Considerations

### 8.1 Lazy Loading Strategy

**Rationale**: Time blocks are an advanced feature used by intermediate/experienced users only

**Implementation**:

```typescript
// Load with intersection observer (same pattern as bottom sections)
$effect(() => {
	if (bottomSectionsLoaded && !timeBlocksLoaded && shouldShowTimeBlocks) {
		loadTimeBlocks();
	}
});
```

**Benefits**:

- Reduces initial dashboard load time
- Only fetches data for users who will see the widget
- Prevents unnecessary API calls

### 8.2 Component Code Splitting

**Modal Lazy Import**:

```typescript
// In Dashboard.svelte
let TimeBlockModal = $state<any>(null);

async function loadTimeBlockModal() {
	if (!TimeBlockModal) {
		TimeBlockModal = (await import('$lib/components/time-play/TimeBlockModal.svelte')).default;
	}
	return TimeBlockModal;
}

async function handleCreateTimeBlock() {
	await loadTimeBlockModal();
	showTimeBlockModal = true;
}
```

**Benefits**:

- Modal JS only loaded when needed
- Smaller initial bundle size
- Faster dashboard render

### 8.3 Data Caching

**Client-side Cache**:

```typescript
// Cache time blocks for 5 minutes
const CACHE_DURATION = 5 * 60 * 1000;
let lastFetchTime = 0;

async function loadTimeBlocks(force = false) {
	const now = Date.now();
	if (!force && timeBlocksLoaded && now - lastFetchTime < CACHE_DURATION) {
		return; // Use cached data
	}

	// Fetch fresh data...
	lastFetchTime = now;
}
```

### 8.4 Optimistic Updates

**Pattern**:

```typescript
async function handleTimeBlockUpdate(updatedBlock: TimeBlockWithProject) {
	// 1. Update UI immediately (optimistic)
	const index = timeBlocks.findIndex((b) => b.id === updatedBlock.id);
	if (index !== -1) {
		timeBlocks[index] = updatedBlock;
	}

	// 2. Send to server (async)
	try {
		await fetch(`/api/time-play/blocks/${updatedBlock.id}`, {
			method: 'PATCH',
			body: JSON.stringify(updatedBlock)
		});
	} catch (error) {
		// 3. Rollback on failure
		await loadTimeBlocks(true); // Force refresh
		toastService.error('Failed to update focus session');
	}
}
```

---

## 9. Testing Strategy

### 9.1 Unit Tests

**Component Tests** (Vitest + Svelte Testing Library):

```typescript
// TimeBlockDashboardWidget.test.ts
describe('TimeBlockDashboardWidget', () => {
	it('displays upcoming time blocks', () => {
		const blocks = [createMockBlock(), createMockBlock()];
		const { getByText } = render(TimeBlockDashboardWidget, {
			props: { timeBlocks: blocks }
		});

		expect(getByText('5 upcoming')).toBeInTheDocument();
	});

	it('shows empty state when no blocks', () => {
		const { getByText } = render(TimeBlockDashboardWidget, {
			props: { timeBlocks: [] }
		});

		expect(getByText('No upcoming focus sessions')).toBeInTheDocument();
	});

	it('calls onBlockClick when block is clicked', async () => {
		const mockOnClick = vi.fn();
		const blocks = [createMockBlock()];
		const { getByRole } = render(TimeBlockDashboardWidget, {
			props: { timeBlocks: blocks, onBlockClick: mockOnClick }
		});

		await fireEvent.click(getByRole('button', { name: /Project Name/i }));

		expect(mockOnClick).toHaveBeenCalledWith(blocks[0]);
	});
});

// TimeBlockModal.test.ts
describe('TimeBlockModal', () => {
	it('validates required fields', async () => {
		const { getByRole } = render(TimeBlockModal, {
			props: { isOpen: true, projects: [] }
		});

		await fireEvent.click(getByRole('button', { name: /Create/i }));

		// Should show validation error
		expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('select a project'));
	});

	it('creates time block with valid data', async () => {
		const mockOnCreate = vi.fn();
		const projects = [{ id: '1', name: 'Test Project' }];

		const { getByLabelText, getByRole } = render(TimeBlockModal, {
			props: { isOpen: true, projects, onCreate: mockOnCreate }
		});

		// Fill form
		await fireEvent.click(getByLabelText('Project Focus'));
		await selectOption(getByLabelText('Project'), 'Test Project');
		await typeDateTime(getByLabelText('Start Time'), '2025-10-15T14:00');
		await typeDateTime(getByLabelText('End Time'), '2025-10-15T16:00');

		// Submit
		await fireEvent.click(getByRole('button', { name: /Create/i }));

		await waitFor(() => {
			expect(mockOnCreate).toHaveBeenCalled();
		});
	});
});
```

### 9.2 Integration Tests

**Dashboard Integration**:

```typescript
describe('Dashboard Time Blocks Integration', () => {
	it('loads time blocks for intermediate users', async () => {
		const user = createMockUser({ projects: 2 }); // intermediate mode

		const { findByText } = render(Dashboard, {
			props: { user, initialData: mockDashboardData }
		});

		// Wait for lazy load
		await waitFor(() => {
			expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/time-play/blocks'));
		});

		expect(await findByText('Focus Sessions')).toBeInTheDocument();
	});

	it('hides time blocks for first-time users', () => {
		const user = createMockUser({ projects: 0 }); // first-time mode

		const { queryByText } = render(Dashboard, {
			props: { user, initialData: mockDashboardData }
		});

		expect(queryByText('Focus Sessions')).not.toBeInTheDocument();
	});
});
```

### 9.3 E2E Tests (Playwright)

**User Flows**:

```typescript
test.describe('Time Block Dashboard Integration', () => {
	test('user can create focus session from dashboard', async ({ page }) => {
		await page.goto('/');

		// Click "Schedule Focus Session" button
		await page.click('text=Schedule Focus Session');

		// Fill modal form
		await page.click('text=Project Focus');
		await page.selectOption('[data-testid="project-select"]', 'Project 1');
		await page.fill('[data-testid="start-time"]', '2025-10-15T14:00');
		await page.fill('[data-testid="end-time"]', '2025-10-15T16:00');

		// Submit
		await page.click('button:has-text("Create Focus Session")');

		// Verify widget updates
		await expect(page.locator('text=Project 1')).toBeVisible();
		await expect(page.locator('text=120 min')).toBeVisible();
	});

	test('user can edit focus session', async ({ page }) => {
		await page.goto('/');

		// Click existing block
		await page.click('[data-testid="time-block-item"]');

		// Modify end time
		await page.fill('[data-testid="end-time"]', '2025-10-15T17:00');

		// Save
		await page.click('button:has-text("Save Changes")');

		// Verify updated duration
		await expect(page.locator('text=180 min')).toBeVisible();
	});
});
```

---

## 10. Design Decisions & Rationale

### 10.1 Architectural Decisions (Based on User Feedback)

**D1: Integrated vs Separate Widget**
**Decision**: ✅ Integrated into TaskDetailsCard (renamed TimeBlocksCard)
**Rationale**:

- Reduces cognitive load by showing time blocks and tasks together
- Better use of dashboard space
- More cohesive user experience
- Reinforces "time-first" mental model

**D2: Time Blocks in Today/Tomorrow Columns Only**
**Decision**: ✅ Show time blocks in Today/Tomorrow; tasks-only in Past
**Rationale**:

- Past column is for historical review of completed/missed tasks
- Time blocks are forward-looking planning tools
- Cleaner separation between planning (future) and review (past)

**D3: Time Blocks in Weekly Calendar**
**Decision**: ✅ Integrate time blocks above tasks for each day
**Rationale**:

- Provides weekly overview of focus sessions
- Consistent placement (time blocks always above tasks)
- Allows quick navigation to any day's focus sessions

**D4: Progressive Disclosure**
**Decision**: ✅ Tasks-only for new users; time blocks for intermediate+ users
**Rationale**:

- Prevents overwhelming new users learning basic task management
- Introduces advanced features when users are ready
- Matches existing dashboard displayMode patterns

### 10.2 Implementation Decisions

**D5: Data Loading Strategy**
**Decision**: ✅ Lazy load when TaskDetailsCard becomes visible
**Rationale**: Matches existing pattern; keeps initial load lightweight

**D6: Date Range for Time Blocks**
**Decision**: ✅ Next 7 days
**Rationale**: Covers Today, Tomorrow, and full weekly calendar view

**D7: Update Endpoint**
**Decision**: ✅ Implement `PATCH /api/time-play/blocks/{id}` for editing
**Rationale**: Currently missing; needed for full CRUD functionality

**D8: Task-Time Block Association**
**Decision**: ✅ Separate scheduled vs unscheduled tasks
**Rationale**:

- Tasks with `time_block_id` are shown nested under time blocks
- Tasks without `time_block_id` are shown in "Unscheduled" section
- Clear visual separation between planned and unplanned work

### 10.3 Future Enhancements

**Phase 2 Features** (post-MVP):

1. **Inline Editing**: Edit block time directly in widget (without modal)
2. **Drag to Reschedule**: Drag blocks to new times
3. **Quick Actions**: Right-click context menu (duplicate, delete, regenerate)
4. **Filters**: Filter by project, block type, or date range
5. **Calendar View Toggle**: Switch between list and mini-calendar view

**Integration Opportunities**:

1. **Weekly Calendar Integration**: Show time blocks on WeeklyTaskCalendar component
2. **Stats Integration**: Add "Focus Hours This Week" stat to stats grid
3. **Daily Brief Integration**: Include upcoming focus sessions in daily brief
4. **Notification Integration**: Remind user 15 min before focus session starts

---

## 11. Implementation Checklist

### Phase 1: Core Components (Week 1)

- [ ] **Rename** `TaskDetailsCard.svelte` → `TimeBlocksCard.svelte`
- [ ] **Enhance** TimeBlocksCard with time block display logic
    - [ ] Add time block props and state
    - [ ] Implement time block rendering in Today/Tomorrow columns
    - [ ] Add color-coded left borders
    - [ ] Implement "unscheduled tasks" separator
    - [ ] Add empty state with CTA
- [ ] **Create** `TimeBlockModal.svelte` component
    - [ ] Implement two-column layout
    - [ ] Add block type selector
    - [ ] Add time/date inputs with validation
    - [ ] Add AI suggestions display
    - [ ] Add calendar sync status
- [ ] **Enhance** `WeeklyTaskCalendar.svelte`
    - [ ] Add time blocks display above tasks
    - [ ] Implement compact time block cards
    - [ ] Add divider between time blocks and tasks
- [ ] **Implement** `PATCH /api/time-play/blocks/{id}` endpoint
- [ ] **Add** `updateTimeBlock()` method to TimeBlockService
- [ ] **Update** Dashboard.svelte
    - [ ] Add time block state management
    - [ ] Add time block event handlers
    - [ ] Pass time blocks to TimeBlocksCard and WeeklyTaskCalendar
    - [ ] Add TimeBlockModal integration

### Phase 2: Visual Polish (Week 2)

- [ ] Apply gradient styling to time block cards in TimeBlocksCard
- [ ] Implement hover effects and transitions
- [ ] Add loading states and skeletons
- [ ] Polish empty states (both TimeBlocksCard and WeeklyTaskCalendar)
- [ ] Add responsive layouts (mobile/tablet/desktop)
- [ ] Ensure color contrast meets WCAG AA
- [ ] Polish time block appearance in WeeklyTaskCalendar
- [ ] Add visual hierarchy (time blocks above tasks)

### Phase 3: Functionality (Week 2)

- [ ] Implement form validation in TimeBlockModal
- [ ] Add AI suggestion display in modal
- [ ] Add regenerate suggestions button
- [ ] Implement calendar sync status display
- [ ] Add activity timestamps
- [ ] Implement optimistic updates
- [ ] Add task association with time blocks
- [ ] Implement scheduled vs unscheduled task separation

### Phase 4: Testing (Week 3)

- [ ] Write unit tests for TimeBlocksCard
- [ ] Write unit tests for TimeBlockModal
- [ ] Write unit tests for enhanced WeeklyTaskCalendar
- [ ] Write integration tests for dashboard with time blocks
- [ ] Write E2E tests for user flows
    - [ ] Create time block from dashboard
    - [ ] Edit time block
    - [ ] Delete time block
    - [ ] View time blocks in weekly calendar
- [ ] Test accessibility (keyboard, screen reader)
- [ ] Test responsive layouts on devices
- [ ] Test progressive disclosure (different user levels)

### Phase 5: Performance & Polish (Week 3)

- [ ] Implement code splitting for modal
- [ ] Add client-side caching
- [ ] Optimize re-renders with memoization
- [ ] Add loading indicators
- [ ] Test performance with large datasets (100+ blocks)
- [ ] Fix any accessibility issues

### Phase 6: Documentation (Week 4)

- [ ] Update component README files
- [ ] Document props and usage
- [ ] Add Storybook stories
- [ ] Update feature documentation
- [ ] Create user guide for focus sessions

---

## 12. File Paths Reference

### Files to Rename

```
/apps/web/src/lib/components/dashboard/
  TaskDetailsCard.svelte → TimeBlocksCard.svelte
```

### New Components to Create

```
/apps/web/src/lib/components/time-play/
  └── TimeBlockModal.svelte (new modal for creating/editing time blocks)

/apps/web/src/routes/api/time-play/blocks/[id]/
  └── +server.ts (new API endpoint for updating time blocks)
```

### Existing Files to Modify

```
/apps/web/src/lib/components/dashboard/
  ├── Dashboard.svelte (add time block state & handlers)
  ├── TaskDetailsCard.svelte → TimeBlocksCard.svelte (rename & enhance with time blocks)
  └── WeeklyTaskCalendar.svelte (add time blocks above tasks)

/apps/web/src/lib/services/
  └── time-block.service.ts (add updateTimeBlock method)

/apps/web/src/lib/stores/
  └── timePlayStore.ts (optional: add updateBlock method)
```

### Reference Files (Study for Patterns)

```
/apps/web/src/lib/components/project/
  └── TaskModal.svelte (two-column modal design patterns)

/apps/web/src/lib/components/time-play/
  ├── TimeBlockDetailModal.svelte (existing time block modal - may be replaced)
  ├── TimeBlockList.svelte (time block list rendering)
  └── TimePlayCalendar.svelte (calendar integration patterns)

/apps/web/src/lib/components/dashboard/
  ├── WeeklyTaskCalendar.svelte (weekly grid pattern)
  └── TaskDetailsCard.svelte (base card design - to be enhanced)
```

### Component Hierarchy After Implementation

```
Dashboard.svelte
├── TimeBlocksCard.svelte (renamed from TaskDetailsCard)
│   ├── Past column (tasks only)
│   ├── Today column (time blocks + unscheduled tasks)
│   └── Tomorrow column (time blocks + unscheduled tasks)
│
├── WeeklyTaskCalendar.svelte
│   └── For each day:
│       ├── Time blocks (above)
│       ├── Divider
│       └── Tasks (below)
│
└── TimeBlockModal.svelte (modal for create/edit)
    ├── Left: Form content
    └── Right: Metadata sidebar
```

---

## Summary

This specification provides a comprehensive plan for integrating Time Play time blocks into the BuildOS dashboard by transforming the existing TaskDetailsCard into a time-block-centric view. The proposed solution:

1. **Integrated approach** - Time blocks are embedded directly into existing task views (not a separate widget)
2. **Time-first paradigm** - Time blocks are the primary organizational unit; tasks are nested underneath
3. **Follows existing patterns** - Maintains TaskDetailsCard structure while enhancing it with time blocks
4. **Uses progressive disclosure** - New users see tasks-only; experienced users see time blocks + tasks
5. **Dual integration** - Time blocks appear in both TimeBlocksCard and WeeklyTaskCalendar
6. **Maintains visual consistency** - Matches existing dashboard aesthetics with Time Play's purple/gradient theme
7. **Provides full CRUD** - TimeBlockModal for creating/editing with calendar sync
8. **Ensures accessibility** - Proper ARIA labels, keyboard navigation, and screen reader support
9. **Optimizes performance** - Lazy loading and code splitting strategies
10. **Includes comprehensive testing** - Unit, integration, and E2E test coverage

**Key Architectural Shift**: Instead of creating a separate TimeBlockDashboardWidget, we enhance the existing TaskDetailsCard (renamed to TimeBlocksCard) to display time blocks as primary containers with tasks nested underneath. This provides a more integrated, cohesive user experience where time blocks and tasks coexist naturally.

The implementation is estimated at 3-4 weeks with the following breakdown:

- **Week 1**: Core components (rename TaskDetailsCard, create TimeBlockModal, enhance WeeklyTaskCalendar, add API endpoint)
- **Week 2**: Visual polish and functionality (styling, validation, AI suggestions, task association)
- **Week 3**: Testing and performance optimization (unit tests, E2E tests, accessibility, performance)
- **Week 4**: Documentation and final polish (component docs, user guide, refinements)

All design decisions are backed by research from existing BuildOS components, ensuring seamless integration with the current codebase while shifting the mental model toward time-block-centric task management.

---

## Related Research

- [Time Play README](/apps/web/docs/features/time-play/README.md) - Feature specification
- [Time Play Implementation Plan](/apps/web/docs/features/time-play/IMPLEMENTATION_PLAN.md) - Implementation phases
- [TaskModal Component](/apps/web/src/lib/components/project/TaskModal.svelte) - Reference modal design
- [Dashboard Component](/apps/web/src/lib/components/dashboard/Dashboard.svelte) - Dashboard structure

---

**Next Steps**: Review this specification and approve for implementation. Once approved, create implementation tickets and assign to development team.
