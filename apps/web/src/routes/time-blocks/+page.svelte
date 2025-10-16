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
	<section class="relative mx-auto flex max-w-5xl flex-col gap-10 px-4 py-12 lg:px-8">
		<header class="space-y-4">
			<div class="space-y-2">
				<h1 class="text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
					Block immersive focus sessions for the work that matters
				</h1>
				<p class="max-w-2xl text-base text-slate-600 dark:text-slate-300">
					Select an active project, reserve a window, and BuildOS mirrors the block on
					your calendar with premium styling and automatic clean-up when plans shift.
				</p>
			</div>
		</header>

		<div
			class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800"
		>
			<!-- Card Header with Subtle Gradient -->
			<div
				class="border-b border-gray-100 bg-gradient-to-r from-blue-50/50 to-indigo-50/50 px-6 py-4 dark:border-gray-700 dark:from-blue-900/10 dark:to-indigo-900/10"
			>
				<div class="space-y-2">
					<h2 class="text-lg font-semibold text-gray-900 dark:text-white">
						Plan a new focus block
					</h2>
					<p class="text-sm text-gray-600 dark:text-gray-400">
						{#if displayMode === 'calendar'}
							Drag on the calendar below to create a block, or click the button to
							schedule one.
						{:else}
							Pick a project and we'll create a polished calendar event with BuildOS'
							signature aesthetic.
						{/if}
					</p>
				</div>
			</div>

			<!-- Card Body -->
			<div class="px-6 py-6 md:px-8">
				<div
					class="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-end"
				>
					<!-- View mode toggle - Segmented Control -->
					<div
						class="inline-flex rounded-lg bg-gray-100 p-1 dark:bg-gray-800"
						role="group"
						aria-label="View mode"
					>
						<button
							type="button"
							class={`relative rounded-md px-4 py-2 text-sm font-semibold transition-all duration-200 ${
								displayMode === 'calendar'
									? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white'
									: 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
							}`}
							onclick={() => (displayMode = 'calendar')}
							aria-pressed={displayMode === 'calendar'}
						>
							Calendar
						</button>
						<button
							type="button"
							class={`relative rounded-md px-4 py-2 text-sm font-semibold transition-all duration-200 ${
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

					<Button
						class="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:shadow-lg hover:from-blue-700 hover:to-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
						on:click={(e) => openCreateModal()}
						disabled={data.projects.length === 0}
						icon={Plus}
						type="button"
						variant="primary"
					>
						Create time block
					</Button>

					{#if data.projects.length === 0}
						<p class="text-xs font-medium text-blue-600 dark:text-blue-300">
							Add or reactivate a project to unlock Time Play.
						</p>
					{/if}
				</div>
			</div>
		</div>

		<!-- Time Range Selector Card -->
		<div
			class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800"
		>
			<TimeRangeSelector
				dateRange={$timeBlocksStore.selectedDateRange}
				onDateRangeChange={(range) => timeBlocksStore.setDateRange(range.start, range.end)}
			/>
		</div>

		{#if $timeBlocksStore.error}
			<div
				class="rounded-2xl border border-rose-200/70 bg-gradient-to-r from-rose-50 to-red-50 px-6 py-4 text-sm font-medium text-rose-700 shadow-sm dark:border-rose-500/40 dark:from-rose-950/30 dark:to-red-950/30 dark:text-rose-200"
			>
				{$timeBlocksStore.error}
			</div>
		{:else if feedback}
			<div
				class="rounded-2xl border border-emerald-200/70 bg-gradient-to-r from-emerald-50 to-green-50 px-6 py-4 text-sm font-medium text-emerald-700 shadow-sm dark:border-emerald-500/40 dark:from-emerald-950/20 dark:to-green-950/20 dark:text-emerald-200"
			>
				{feedback}
			</div>
		{/if}

		{#if !data.isCalendarConnected}
			<div
				class="rounded-2xl border border-amber-200/70 bg-gradient-to-r from-amber-50 to-yellow-50 px-6 py-5 shadow-sm dark:border-amber-500/40 dark:from-amber-950/20 dark:to-yellow-950/20"
			>
				<div class="flex items-start gap-4">
					<div
						class="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40"
					>
						<svg
							class="h-5 w-5 text-amber-600 dark:text-amber-400"
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
					</div>
					<div class="flex-1">
						<h3 class="mb-1 font-semibold text-amber-900 dark:text-amber-100">
							Connect Google Calendar
						</h3>
						<p class="mb-3 text-sm text-amber-700 dark:text-amber-200">
							See your existing calendar events alongside time blocks. Connect your
							Google Calendar to view all your commitments in one place.
						</p>
						<a
							href="/profile?tab=calendar"
							class="inline-flex items-center rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-600"
						>
							Connect Calendar
							<svg
								class="ml-2 h-4 w-4"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M13 7l5 5m0 0l-5 5m5-5H6"
								/>
							</svg>
						</a>
					</div>
				</div>
			</div>
		{/if}

		<!-- Time Allocation Summary -->
		<div
			class="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800"
		>
			<TimeAllocationPanel
				allocation={$timeBlocksStore.allocation}
				isLoading={$timeBlocksStore.isAllocationLoading}
				dateRange={$timeBlocksStore.selectedDateRange}
			/>
		</div>

		<!-- Calendar/List View (full width) -->
		<div
			class="rounded-xl border border-gray-200 bg-white shadow-md dark:border-gray-700 dark:bg-gray-800"
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
				<div class="space-y-4 px-6 py-4">
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
