<!-- apps/web/src/routes/time-blocks/+page.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { timeBlocksStore } from '$lib/stores/timeBlocksStore';
	import TimeBlockCreateModal from '$lib/components/time-blocks/TimeBlockCreateModal.svelte';
	import TimeBlockList from '$lib/components/time-blocks/TimeBlockList.svelte';
	import TimeAllocationPanel from '$lib/components/time-blocks/TimeAllocationPanel.svelte';
	import TimeRangeSelector from '$lib/components/time-blocks/TimeRangeSelector.svelte';
	import TimePlayCalendar from '$lib/components/time-blocks/TimePlayCalendar.svelte';
	import TimeBlockDetailModal from '$lib/components/time-blocks/TimeBlockDetailModal.svelte';
	import CalendarEventDetailModal from '$lib/components/time-blocks/CalendarEventDetailModal.svelte';
	import AvailableSlotFinder from '$lib/components/time-blocks/AvailableSlotFinder.svelte';
	import AvailableSlotList from '$lib/components/time-blocks/AvailableSlotList.svelte';
	import CalendarConnectionOverlay from '$lib/components/calendar/CalendarConnectionOverlay.svelte';
	import type { PageData } from './$types';
	import type { TimeBlockWithProject } from '@buildos/shared-types';
	import type { CalendarEvent } from '$lib/services/calendar-service';
	import type { AvailableSlot } from '$lib/types/time-blocks';
	import { calculateAvailableSlots } from '$lib/utils/slot-finder';
	import Button from '$components/ui/Button.svelte';
	import { Plus } from 'lucide-svelte';

	let { data }: { data: PageData } = $props();

	let showCreateModal = $state(false);
	let draftStart = $state<Date | undefined>(undefined);
	let draftEnd = $state<Date | undefined>(undefined);
	let feedback = $state<string | null>(null);
	let displayMode = $state<'calendar' | 'list'>('calendar');
	let selectedBlock = $state<TimeBlockWithProject | null>(null);
	let showBlockDetailModal = $state(false);
	let selectedCalendarEvent = $state<CalendarEvent | null>(null);
	let showCalendarEventModal = $state(false);

	// Calendar events from child component (for slot calculation)
	let calendarEvents = $state<CalendarEvent[]>([]);

	// Calendar view state
	let calendarViewMode = $state<'day' | 'week' | 'month'>('week');
	let calendarSelectedDate = $state(new Date());

	// Calculate date range - use the store's selected date range
	let calendarDateRange = $derived($timeBlocksStore.selectedDateRange);

	// Calculate days array for calendar based on view mode and selected date
	let calendarDays = $derived.by(() => {
		if (calendarViewMode === 'day') {
			return [calendarSelectedDate];
		} else if (calendarViewMode === 'week') {
			// Get start of week (Monday)
			const start = new Date(calendarSelectedDate);
			const day = start.getDay();
			const diff = start.getDate() - day + (day === 0 ? -6 : 1);
			start.setDate(diff);
			start.setHours(0, 0, 0, 0);

			return Array.from({ length: 7 }, (_, i) => {
				const d = new Date(start);
				d.setDate(start.getDate() + i);
				return d;
			});
		} else {
			// Month view - return full 6-week calendar grid (42 days)
			const year = calendarSelectedDate.getFullYear();
			const month = calendarSelectedDate.getMonth();
			const firstDayOfMonth = new Date(year, month, 1);

			// Get the day of week for the first day (0 = Sunday)
			const firstDayOfWeek = firstDayOfMonth.getDay();

			// Calculate the start date (Sunday before or on the 1st)
			const startDate = new Date(firstDayOfMonth);
			startDate.setDate(firstDayOfMonth.getDate() - firstDayOfWeek);

			// Generate 42 days (6 weeks) for complete calendar grid
			return Array.from({ length: 42 }, (_, i) => {
				return new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
			});
		}
	});

	// Calculate available slots based on blocks, events, config, and days
	let availableSlots = $derived.by(() => {
		return calculateAvailableSlots(
			$timeBlocksStore.blocks,
			calendarEvents,
			$timeBlocksStore.slotFinderConfig,
			calendarDays
		);
	});

	onMount(() => {
		// Load display mode preference from localStorage
		const savedMode = localStorage.getItem('timeblocks-display-mode');
		if (savedMode === 'calendar' || savedMode === 'list') {
			displayMode = savedMode;
		}

		// Load initial data (blocks + allocation)
		// This ensures the allocation panel has data on first load
		timeBlocksStore.loadBlocks(calendarDateRange.start, calendarDateRange.end);
	});

	// Blocks are now loaded automatically by the store when selectedDateRange changes
	// No need for a separate effect since TimeRangeSelector controls the store directly

	// Save display mode preference
	$effect(() => {
		if (typeof localStorage !== 'undefined') {
			localStorage.setItem('timeblocks-display-mode', displayMode);
		}
	});

	function openCreateModal(start?: Date, end?: Date) {
		draftStart = start;
		draftEnd = end;
		showCreateModal = true;
	}

	async function handleCreateBlock(detail: {
		blockType: 'project' | 'build';
		projectId: string | null;
		startTime: Date;
		endTime: Date;
	}) {
		try {
			await timeBlocksStore.createBlock(
				detail.blockType,
				detail.projectId,
				detail.startTime,
				detail.endTime
			);
			showCreateModal = false;
			draftStart = undefined;
			draftEnd = undefined;
			feedback =
				detail.blockType === 'project'
					? 'Project focus block created with fresh suggestions.'
					: 'Build block created — flex time is now on your calendar.';
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to create time block';
			alert(message);
		}
	}

	async function handleRegenerateBlock(blockId: string) {
		try {
			await timeBlocksStore.regenerateSuggestions(blockId);
			feedback = 'Suggestions refreshed for this block.';
		} catch (error) {
			const message =
				error instanceof Error ? error.message : 'Failed to refresh block suggestions';
			alert(message);
		}
	}

	async function handleDeleteBlock(blockId: string) {
		try {
			await timeBlocksStore.deleteBlock(blockId);
			feedback = 'Time block deleted.';
			selectedBlock = null;
			showBlockDetailModal = false;
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to delete time block';
			alert(message);
		}
	}

	async function handleUpdateBlock(blockId: string, params: any) {
		try {
			await timeBlocksStore.updateBlock(blockId, params);
			feedback = 'Time block updated and calendar synced.';
			showBlockDetailModal = false;
			selectedBlock = null;
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to update time block';
			throw new Error(message);
		}
	}

	function handleBlockClick(block: TimeBlockWithProject) {
		selectedBlock = block;
		showBlockDetailModal = true;
	}

	function handleCalendarBlockCreate(startTime: Date, endTime: Date) {
		openCreateModal(startTime, endTime);
	}

	function handleCalendarEventClick(event: CalendarEvent) {
		selectedCalendarEvent = event;
		showCalendarEventModal = true;
	}

	function handleSlotClick(slot: AvailableSlot) {
		openCreateModal(slot.startTime, slot.endTime);
	}

	function handleCalendarNavigate(date: Date) {
		calendarSelectedDate = date;
		// Update the date range in the store to load blocks for new view
		if (calendarDays.length > 0) {
			const start = calendarDays[0];
			const end = calendarDays[calendarDays.length - 1];
			timeBlocksStore.setDateRange(start, end);
		}
	}

	function handleViewModeChange(mode: 'day' | 'week' | 'month') {
		calendarViewMode = mode;
		// Update the date range in the store to load blocks for new view
		if (calendarDays.length > 0) {
			const start = calendarDays[0];
			const end = calendarDays[calendarDays.length - 1];
			timeBlocksStore.setDateRange(start, end);
		}
	}

	$effect(() => {
		// Clear positive feedback if there's an error
		if ($timeBlocksStore.error && feedback) {
			feedback = null;
		}
	});
</script>

<div class="relative min-h-[calc(100vh-4rem)] bg-white dark:bg-gray-900">
	<section
		class="relative mx-auto flex max-w-7xl flex-col gap-4 px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 md:py-8 lg:gap-5"
	>
		<header class="space-y-1">
			<h1
				class="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-1 sm:mb-2 tracking-tight"
			>
				Time Blocks
			</h1>
			<p class="text-sm sm:text-base text-gray-600 dark:text-gray-400">
				Focus sessions synced to your calendar
			</p>
		</header>

		<!-- Compact action bar -->
		<div
			class="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white px-3 py-3 dark:border-gray-700 dark:bg-gray-800 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
		>
			<!-- View mode toggle - Compact segmented control -->
			<div
				class="inline-flex rounded-md bg-gray-100 p-0.5 dark:bg-gray-800"
				role="group"
				aria-label="View mode"
			>
				<button
					type="button"
					class={`relative rounded px-3 py-1.5 text-xs font-medium transition-all ${
						displayMode === 'calendar'
							? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white'
							: 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
					}`}
					onclick={() => displayMode === 'calendar'}
					aria-pressed={displayMode === 'calendar'}
				>
					Calendar
				</button>
				<button
					type="button"
					class={`relative rounded px-3 py-1.5 text-xs font-medium transition-all ${
						displayMode === 'list'
							? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white'
							: 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
					}`}
					onclick={() => (displayMode = 'list')}
					aria-pressed={displayMode === 'list'}
				>
					List
				</button>
			</div>

			<div class="flex items-center gap-2">
				<Button
					class="inline-flex items-center justify-center rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:shadow-md hover:from-blue-700 hover:to-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 sm:px-4 sm:py-2 sm:text-sm"
					on:click={(e) => openCreateModal()}
					disabled={data.projects.length === 0}
					icon={Plus}
					type="button"
					variant="primary"
				>
					<span class="hidden sm:inline">Create</span> Block
				</Button>

				{#if data.projects.length === 0}
					<p class="text-xs text-blue-600 dark:text-blue-400">Add a project first</p>
				{/if}
			</div>
		</div>

		<!-- Time Range Selector Card -->
		<div
			class="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
		>
			<TimeRangeSelector
				dateRange={$timeBlocksStore.selectedDateRange}
				onDateRangeChange={(range) => timeBlocksStore.setDateRange(range.start, range.end)}
			/>
		</div>

		{#if $timeBlocksStore.error}
			<div
				class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-500/40 dark:bg-rose-950/20 dark:text-rose-300 sm:text-sm"
			>
				{$timeBlocksStore.error}
			</div>
		{:else if feedback}
			<div
				class="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-950/20 dark:text-emerald-300 sm:text-sm"
			>
				{feedback}
			</div>
		{/if}

		<!-- Time Allocation Summary -->
		<div
			class="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
		>
			<TimeAllocationPanel
				allocation={$timeBlocksStore.allocation}
				isLoading={$timeBlocksStore.isAllocationLoading}
				dateRange={$timeBlocksStore.selectedDateRange}
			/>
		</div>

		<!-- Calendar/List View (full width) -->
		<div
			class="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
		>
			{#if $timeBlocksStore.isLoading}
				<div class="flex flex-col items-center justify-center gap-3 px-8 py-16 text-center">
					<div
						class="h-12 w-12 animate-spin rounded-full border-[3px] border-gray-300 border-t-blue-600 dark:border-gray-600 dark:border-t-blue-400"
					></div>
					<p class="text-sm font-medium text-gray-600 dark:text-gray-400">
						Loading your upcoming time blocks…
					</p>
				</div>
			{:else if displayMode === 'calendar'}
				<TimePlayCalendar
					blocks={$timeBlocksStore.blocks}
					days={calendarDays}
					bind:viewMode={calendarViewMode}
					bind:selectedDate={calendarSelectedDate}
					isCalendarConnected={data.isCalendarConnected}
					{availableSlots}
					bind:calendarEventsOut={calendarEvents}
					onBlockCreate={handleCalendarBlockCreate}
					onBlockClick={handleBlockClick}
					onCalendarEventClick={handleCalendarEventClick}
					onSlotClick={handleSlotClick}
					onNavigate={handleCalendarNavigate}
					onViewModeChange={handleViewModeChange}
				/>
			{:else}
				<!-- List View: Show Available Slots List + Time Blocks List -->
				<div class="space-y-3 px-3 py-3 sm:px-4 sm:py-4">
					<AvailableSlotList {availableSlots} onSlotClick={handleSlotClick} />
					<TimeBlockList
						blocks={$timeBlocksStore.blocks}
						regeneratingIds={$timeBlocksStore.regeneratingIds}
						on:delete={(event) => handleDeleteBlock(event.detail.blockId)}
						on:regenerate={(event) => handleRegenerateBlock(event.detail.blockId)}
					/>
				</div>
			{/if}
		</div>

		<!-- Available Slot Finder Config Panel -->
		<AvailableSlotFinder availableSlotsCount={availableSlots.length} />
	</section>
</div>

{#if showCreateModal}
	<TimeBlockCreateModal
		projects={data.projects}
		initialStart={draftStart}
		initialEnd={draftEnd}
		isCreating={$timeBlocksStore.isCreating}
		on:create={(event) => handleCreateBlock(event.detail)}
		on:close={() => {
			showCreateModal = false;
			draftStart = undefined;
			draftEnd = undefined;
		}}
	/>
{/if}

{#if showBlockDetailModal && selectedBlock}
	{@const currentBlock = selectedBlock}
	<TimeBlockDetailModal
		block={currentBlock}
		isRegenerating={$timeBlocksStore.regeneratingIds.includes(currentBlock.id)}
		onClose={() => {
			showBlockDetailModal = false;
			selectedBlock = null;
		}}
		onDelete={() => handleDeleteBlock(currentBlock.id)}
		onRegenerate={() => handleRegenerateBlock(currentBlock.id)}
		onUpdate={(params) => handleUpdateBlock(currentBlock.id, params)}
	/>
{/if}

{#if showCalendarEventModal && selectedCalendarEvent}
	<CalendarEventDetailModal
		event={selectedCalendarEvent}
		onClose={() => {
			showCalendarEventModal = false;
			selectedCalendarEvent = null;
		}}
	/>
{/if}

<!-- Calendar Connection Overlay - blocks page usage when not connected -->
{#if !data.isCalendarConnected}
	<CalendarConnectionOverlay />
{/if}
