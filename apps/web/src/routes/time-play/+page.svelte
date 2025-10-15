<!-- apps/web/src/routes/time-play/+page.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { timePlayStore } from '$lib/stores/timePlayStore';
	import TimeBlockCreateModal from '$lib/components/time-play/TimeBlockCreateModal.svelte';
	import TimeBlockList from '$lib/components/time-play/TimeBlockList.svelte';
	import TimeAllocationPanel from '$lib/components/time-play/TimeAllocationPanel.svelte';
	import TimePlayCalendar from '$lib/components/time-play/TimePlayCalendar.svelte';
	import TimeBlockDetailModal from '$lib/components/time-play/TimeBlockDetailModal.svelte';
	import CalendarEventDetailModal from '$lib/components/time-play/CalendarEventDetailModal.svelte';
	import AvailableSlotFinder from '$lib/components/time-play/AvailableSlotFinder.svelte';
	import AvailableSlotList from '$lib/components/time-play/AvailableSlotList.svelte';
	import type { PageData } from './$types';
	import type { TimeBlockWithProject } from '@buildos/shared-types';
	import type { CalendarEvent } from '$lib/services/calendar-service';
	import type { AvailableSlot } from '$lib/types/time-play';
	import { calculateAvailableSlots } from '$lib/utils/slot-finder';

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

	// Calendar view state (bindable with child component)
	let calendarSelectedDate = $state(new Date());
	let calendarViewMode = $state<'day' | 'week' | 'month'>('week');

	// Calendar events from child component (for slot calculation)
	let calendarEvents = $state<CalendarEvent[]>([]);

	// Calculate date range based on calendar view settings
	let calendarDateRange = $derived.by(() => {
		if (calendarViewMode === 'day') {
			const start = new Date(calendarSelectedDate);
			start.setHours(0, 0, 0, 0);
			const end = new Date(calendarSelectedDate);
			end.setHours(23, 59, 59, 999);
			return { start, end };
		} else if (calendarViewMode === 'week') {
			// Get start of week (Monday)
			const start = new Date(calendarSelectedDate);
			const day = start.getDay();
			const diff = start.getDate() - day + (day === 0 ? -6 : 1);
			start.setDate(diff);
			start.setHours(0, 0, 0, 0);

			// Get end of week (Sunday)
			const end = new Date(start);
			end.setDate(start.getDate() + 6);
			end.setHours(23, 59, 59, 999);
			return { start, end };
		} else {
			// Month view - include full 6-week calendar grid (42 days)
			// This matches the logic in TimePlayCalendar.getMonthCalendarGrid()
			const year = calendarSelectedDate.getFullYear();
			const month = calendarSelectedDate.getMonth();
			const firstDayOfMonth = new Date(year, month, 1);

			// Get the day of week for the first day (0 = Sunday)
			const firstDayOfWeek = firstDayOfMonth.getDay();

			// Calculate the start date (Sunday before or on the 1st)
			const start = new Date(firstDayOfMonth);
			start.setDate(firstDayOfMonth.getDate() - firstDayOfWeek);
			start.setHours(0, 0, 0, 0);

			// Calculate the end date (42 days from start = 6 weeks)
			const end = new Date(start);
			end.setDate(start.getDate() + 41); // 41 days after start = 42 days total
			end.setHours(23, 59, 59, 999);

			return { start, end };
		}
	});

	// Calculate days array for calendar
	let calendarDays = $derived.by(() => {
		if (calendarViewMode === 'day') {
			return [calendarSelectedDate];
		} else if (calendarViewMode === 'week') {
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
			// Month view
			const year = calendarSelectedDate.getFullYear();
			const month = calendarSelectedDate.getMonth();
			const firstDayOfMonth = new Date(year, month, 1);
			const firstDayOfWeek = firstDayOfMonth.getDay();

			const startDate = new Date(firstDayOfMonth);
			startDate.setDate(firstDayOfMonth.getDate() - firstDayOfWeek);

			return Array.from({ length: 42 }, (_, i) => {
				return new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
			});
		}
	});

	// Calculate available slots based on blocks, events, config, and days
	let availableSlots = $derived.by(() => {
		return calculateAvailableSlots(
			$timePlayStore.blocks,
			calendarEvents,
			$timePlayStore.slotFinderConfig,
			calendarDays
		);
	});

	onMount(() => {
		// Load display mode preference from localStorage
		const savedMode = localStorage.getItem('timeplay-display-mode');
		if (savedMode === 'calendar' || savedMode === 'list') {
			displayMode = savedMode;
		}

		// Load initial data (blocks + allocation)
		// This ensures the allocation panel has data on first load
		timePlayStore.loadBlocks(calendarDateRange.start, calendarDateRange.end);
	});

	// Load blocks when calendar date range changes (user navigation)
	// Use loadBlocksOnly to avoid reloading the allocation panel unnecessarily
	$effect(() => {
		if (displayMode === 'calendar') {
			timePlayStore.loadBlocksOnly(calendarDateRange.start, calendarDateRange.end);
		}
	});

	// Save display mode preference
	$effect(() => {
		if (typeof localStorage !== 'undefined') {
			localStorage.setItem('timeplay-display-mode', displayMode);
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
			await timePlayStore.createBlock(
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
			await timePlayStore.regenerateSuggestions(blockId);
			feedback = 'Suggestions refreshed for this block.';
		} catch (error) {
			const message =
				error instanceof Error ? error.message : 'Failed to refresh block suggestions';
			alert(message);
		}
	}

	async function handleDeleteBlock(blockId: string) {
		try {
			await timePlayStore.deleteBlock(blockId);
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
		if ($timePlayStore.error) {
			feedback = null;
		}
	});
</script>

<div
	class="relative min-h-[calc(100vh-4rem)] overflow-hidden bg-gradient-to-br from-slate-50 via-white to-blue-50 dark:from-slate-950 dark:via-slate-900 dark:to-blue-950 rounded-md"
>
	<!-- Subtle top fade-in gradient - lightens the top for smooth transition -->
	<div
		class="pointer-events-none absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-slate-100/80 via-slate-50/30 to-transparent dark:from-slate-800/40 dark:via-slate-850/15 dark:to-transparent"
	></div>

	<div
		class="pointer-events-none absolute inset-0 opacity-40 blur-3xl saturate-150 dark:opacity-60"
	>
		<div
			class="absolute -top-20 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-blue-400/40 dark:bg-blue-500/20"
		></div>
		<div
			class="absolute top-32 -right-10 h-56 w-56 rounded-full bg-purple-300/40 dark:bg-purple-500/20"
		></div>
	</div>

	<section class="relative mx-auto flex max-w-5xl flex-col gap-10 px-4 py-12 lg:px-8">
		<header class="space-y-4">
			<div
				class="inline-flex items-center gap-2 rounded-full border border-slate-200/60 bg-white/80 px-4 py-1.5 text-sm font-medium text-slate-700 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
			>
				<span
					class="h-2 w-2 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 shadow-[0_0_0.45rem_rgba(59,130,246,0.6)]"
				></span>
				Time Play Beta
			</div>
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
			class="overflow-hidden rounded-2xl border border-blue-100/80 bg-gradient-to-br from-blue-50/70 via-white/70 to-indigo-50/70 shadow-lg shadow-blue-200/60 backdrop-blur-xl dark:border-blue-500/30 dark:from-blue-950/50 dark:via-slate-900/60 dark:to-indigo-950/40 dark:shadow-blue-900/50"
		>
			<div
				class="flex flex-col gap-6 px-6 py-6 md:flex-row md:items-center md:justify-between md:px-8 md:py-8"
			>
				<div class="space-y-2">
					<h2 class="text-lg font-semibold text-slate-900 dark:text-white">
						Plan a new focus block
					</h2>
					<p class="text-sm text-slate-600 dark:text-slate-300">
						{#if displayMode === 'calendar'}
							Drag on the calendar below to create a block, or click the button to
							schedule one.
						{:else}
							Pick a project and we'll create a polished calendar event with BuildOS'
							signature aesthetic.
						{/if}
					</p>
				</div>
				<div class="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
					<!-- View mode toggle -->
					<div
						class="flex rounded-lg border border-slate-200/80 bg-white/80 dark:border-slate-700 dark:bg-slate-900/60"
					>
						<button
							type="button"
							class={`rounded-l-lg px-3 py-2 text-xs font-medium transition ${
								displayMode === 'calendar'
									? 'bg-blue-500 text-white'
									: 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
							}`}
							onclick={() => (displayMode = 'calendar')}
						>
							Calendar
						</button>
						<button
							type="button"
							class={`rounded-r-lg px-3 py-2 text-xs font-medium transition ${
								displayMode === 'list'
									? 'bg-blue-500 text-white'
									: 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
							}`}
							onclick={() => (displayMode = 'list')}
						>
							List
						</button>
					</div>

					<button
						class="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 px-5 py-3 text-sm font-medium text-white shadow-lg shadow-blue-500/30 transition hover:scale-[1.02] hover:shadow-blue-500/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 disabled:cursor-not-allowed disabled:opacity-60"
						onclick={() => openCreateModal()}
						disabled={data.projects.length === 0}
					>
						<span class="mr-2 text-base leading-none">＋</span>
						Create time block
					</button>

					{#if data.projects.length === 0}
						<p class="text-xs font-medium text-blue-600 dark:text-blue-300">
							Add or reactivate a project to unlock Time Play.
						</p>
					{/if}
				</div>
			</div>
		</div>

		{#if $timePlayStore.error}
			<div
				class="rounded-2xl border border-rose-200/70 bg-gradient-to-r from-rose-50 to-red-50 px-6 py-4 text-sm font-medium text-rose-700 shadow-sm dark:border-rose-500/40 dark:from-rose-950/30 dark:to-red-950/30 dark:text-rose-200"
			>
				{$timePlayStore.error}
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

		<!-- Time Allocation Summary (moved to top for more calendar space) -->
		<div
			class="rounded-2xl border border-slate-200/80 bg-white/80 shadow-lg backdrop-blur-xl dark:border-slate-800/70 dark:bg-slate-900/60"
		>
			<TimeAllocationPanel
				allocation={$timePlayStore.allocation}
				isLoading={$timePlayStore.isAllocationLoading}
				dateRange={$timePlayStore.selectedDateRange}
				onDateRangeChange={(range) => timePlayStore.setDateRange(range.start, range.end)}
			/>
		</div>

		<!-- Calendar/List View (full width) -->
		<div
			class="rounded-3xl border border-slate-200/80 bg-white/80 shadow-xl shadow-slate-200/60 backdrop-blur-xl dark:border-slate-800/70 dark:bg-slate-900/60 dark:shadow-black/40"
		>
			{#if $timePlayStore.isLoading}
				<div class="flex flex-col items-center justify-center gap-3 px-8 py-16 text-center">
					<div
						class="h-12 w-12 animate-spin rounded-full border-[3px] border-slate-300 border-t-blue-500 dark:border-slate-600 dark:border-t-blue-400"
					></div>
					<p class="text-sm font-medium text-slate-600 dark:text-slate-300">
						Loading your upcoming time blocks…
					</p>
				</div>
			{:else if displayMode === 'calendar'}
				<TimePlayCalendar
					blocks={$timePlayStore.blocks}
					isCalendarConnected={data.isCalendarConnected}
					{availableSlots}
					bind:selectedDate={calendarSelectedDate}
					bind:viewMode={calendarViewMode}
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
						blocks={$timePlayStore.blocks}
						regeneratingIds={$timePlayStore.regeneratingIds}
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
		isCreating={$timePlayStore.isCreating}
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
		isRegenerating={$timePlayStore.regeneratingIds.includes(currentBlock.id)}
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
