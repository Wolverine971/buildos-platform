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

	// Calculate date range - use the store's selected date range
	let calendarDateRange = $derived($timeBlocksStore.selectedDateRange);

	// Calculate days array for calendar based on the selected date range
	let calendarDays = $derived.by(() => {
		const start = new Date(calendarDateRange.start);
		const end = new Date(calendarDateRange.end);

		// Calculate number of days between start and end
		const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

		// Generate array of dates
		return Array.from({ length: daysDiff + 1 }, (_, i) => {
			const date = new Date(start);
			date.setDate(start.getDate() + i);
			return date;
		});
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

	$effect(() => {
		if ($timeBlocksStore.error) {
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

		{#if !data.isCalendarConnected}
			<div
				class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-500/40 dark:bg-amber-950/20 sm:px-4 sm:py-3"
			>
				<div class="flex items-center justify-between gap-3">
					<div class="flex items-center gap-2 flex-1 min-w-0">
						<svg
							class="h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-400"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
							/>
						</svg>
						<div class="min-w-0 flex-1">
							<p
								class="text-xs font-medium text-amber-900 dark:text-amber-100 sm:text-sm"
							>
								Connect Google Calendar to see your events
							</p>
						</div>
					</div>
					<a
						href="/profile?tab=calendar"
						class="flex-shrink-0 inline-flex items-center rounded-md bg-amber-600 px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-600 sm:px-3 sm:py-1.5"
					>
						Connect
					</a>
				</div>
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
					isCalendarConnected={data.isCalendarConnected}
					{availableSlots}
					bind:calendarEventsOut={calendarEvents}
					onBlockCreate={handleCalendarBlockCreate}
					onBlockClick={handleBlockClick}
					onCalendarEventClick={handleCalendarEventClick}
					onSlotClick={handleSlotClick}
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
