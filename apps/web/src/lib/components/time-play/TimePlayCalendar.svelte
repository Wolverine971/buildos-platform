<!-- apps/web/src/lib/components/time-play/TimePlayCalendar.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import type { TimeBlockWithProject } from '@buildos/shared-types';
	import { resolveBlockAccentColor } from '$lib/utils/time-block-colors';
	import type { CalendarEvent } from '$lib/services/calendar-service';

	let {
		blocks = [],
		viewMode = $bindable('week'),
		selectedDate = $bindable(new Date()),
		isCalendarConnected = false,
		onBlockCreate,
		onBlockClick,
		onCalendarEventClick
	}: {
		blocks?: TimeBlockWithProject[];
		viewMode?: 'day' | 'week' | 'month';
		selectedDate?: Date;
		isCalendarConnected?: boolean;
		onBlockCreate?: (startTime: Date, endTime: Date) => void;
		onBlockClick?: (block: TimeBlockWithProject) => void;
		onCalendarEventClick?: (event: CalendarEvent) => void;
	} = $props();

	// Calendar configuration
	const HOURS_START = 6; // 6 AM
	const HOURS_END = 22; // 10 PM
	const HOUR_HEIGHT = 60; // pixels per hour

	// State for drag interactions
	let isDragging = $state(false);
	let dragStart = $state<{ day: number; hour: number; minute: number } | null>(null);
	let dragEnd = $state<{ day: number; hour: number; minute: number } | null>(null);

	// State for Google Calendar events
	let calendarEvents = $state<CalendarEvent[]>([]);
	let isLoadingEvents = $state(false);

	// Computed properties
	let hours = $derived(
		Array.from({ length: HOURS_END - HOURS_START }, (_, i) => HOURS_START + i)
	);

	let days = $derived.by(() => {
		if (viewMode === 'day') {
			return [selectedDate];
		} else if (viewMode === 'week') {
			// Get start of week (Monday)
			const start = new Date(selectedDate);
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
			// Month view - return all days in month
			const year = selectedDate.getFullYear();
			const month = selectedDate.getMonth();
			const lastDay = new Date(year, month + 1, 0);
			const daysInMonth = lastDay.getDate();

			return Array.from({ length: daysInMonth }, (_, i) => {
				return new Date(year, month, i + 1);
			});
		}
	});

	// Format functions
	function formatDayHeader(date: Date): string {
		if (viewMode === 'day') {
			return date.toLocaleDateString('en-US', {
				weekday: 'long',
				month: 'long',
				day: 'numeric',
				year: 'numeric'
			});
		} else {
			return date.toLocaleDateString('en-US', {
				weekday: 'short',
				month: 'short',
				day: 'numeric'
			});
		}
	}

	function formatHour(hour: number): string {
		const period = hour >= 12 ? 'PM' : 'AM';
		const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
		return `${displayHour} ${period}`;
	}

	function isSameDay(date1: Date, date2: Date): boolean {
		return (
			date1.getFullYear() === date2.getFullYear() &&
			date1.getMonth() === date2.getMonth() &&
			date1.getDate() === date2.getDate()
		);
	}

	function isToday(date: Date): boolean {
		return isSameDay(date, new Date());
	}

	// Block positioning functions
	function getBlockStyle(block: TimeBlockWithProject, dayIndex: number): string | null {
		const blockStart = new Date(block.start_time);
		const blockEnd = new Date(block.end_time);
		const dayDate = days[dayIndex];

		// Check if dayDate exists and block is on this day
		if (!dayDate || !isSameDay(blockStart, dayDate)) {
			return null;
		}

		const startHour = blockStart.getHours();
		const startMinute = blockStart.getMinutes();
		const endHour = blockEnd.getHours();
		const endMinute = blockEnd.getMinutes();

		// Calculate position
		const top = ((startHour - HOURS_START) * 60 + startMinute) * (HOUR_HEIGHT / 60);
		const duration = (endHour - startHour) * 60 + (endMinute - startMinute);
		const height = duration * (HOUR_HEIGHT / 60);

		// Check if block is within visible hours
		if (startHour < HOURS_START || endHour > HOURS_END) {
			return null;
		}

		return `top: ${top}px; height: ${height}px;`;
	}

	function getBlocksForDay(dayIndex: number): TimeBlockWithProject[] {
		const dayDate = days[dayIndex];
		if (!dayDate) return [];
		return blocks.filter((block) => {
			const blockStart = new Date(block.start_time);
			return isSameDay(blockStart, dayDate);
		});
	}

	// Mouse event handlers for drag-to-create
	function handleSlotMouseDown(dayIndex: number, hour: number, minute: number) {
		isDragging = true;
		dragStart = { day: dayIndex, hour, minute };
		dragEnd = { day: dayIndex, hour, minute };
	}

	function handleSlotMouseMove(dayIndex: number, hour: number, minute: number) {
		if (isDragging) {
			dragEnd = { day: dayIndex, hour, minute };
		}
	}

	function handleSlotMouseUp() {
		if (isDragging && dragStart && dragEnd) {
			// Calculate start and end times
			const startDay = days[dragStart.day];
			const endDay = days[dragEnd.day];

			if (!startDay || !endDay) {
				isDragging = false;
				dragStart = null;
				dragEnd = null;
				return;
			}

			const startTime = new Date(startDay);
			startTime.setHours(dragStart.hour, dragStart.minute, 0, 0);

			const endTime = new Date(endDay);
			endTime.setHours(dragEnd.hour, dragEnd.minute, 0, 0);

			// Ensure end is after start
			if (endTime > startTime) {
				// Round to 30-minute increments
				const duration = Math.round(
					(endTime.getTime() - startTime.getTime()) / (30 * 60 * 1000)
				);
				endTime.setTime(startTime.getTime() + duration * 30 * 60 * 1000);

				if (onBlockCreate) {
					onBlockCreate(startTime, endTime);
				}
			}
		}

		// Reset drag state
		isDragging = false;
		dragStart = null;
		dragEnd = null;
	}

	// Get drag preview style
	function getDragPreviewStyle(): string | null {
		if (!isDragging || !dragStart || !dragEnd) {
			return null;
		}

		const startHour = Math.min(dragStart.hour, dragEnd.hour);
		const endHour = Math.max(dragStart.hour, dragEnd.hour);
		const startMinute = dragStart.hour === startHour ? dragStart.minute : dragEnd.minute;
		const endMinute = dragStart.hour === endHour ? dragStart.minute : dragEnd.minute;

		const top = ((startHour - HOURS_START) * 60 + startMinute) * (HOUR_HEIGHT / 60);
		const duration = (endHour - startHour) * 60 + (endMinute - startMinute);
		const height = Math.max(30, duration * (HOUR_HEIGHT / 60)); // Minimum 30px

		return `top: ${top}px; height: ${height}px;`;
	}

	function handleBlockClick(block: TimeBlockWithProject) {
		if (onBlockClick) {
			onBlockClick(block);
		}
	}

	function handleCalendarEventClick(event: CalendarEvent) {
		if (onCalendarEventClick) {
			onCalendarEventClick(event);
		}
	}

	// Fetch Google Calendar events and filter out BuildOS-created events
	async function fetchCalendarEvents() {
		if (!isCalendarConnected) {
			return;
		}

		try {
			isLoadingEvents = true;

			// Calculate date range based on view mode
			const startDate = days[0];
			const endDate = days[days.length - 1];

			if (!startDate || !endDate) {
				return;
			}

			// Set time to start and end of day
			const timeMin = new Date(startDate);
			timeMin.setHours(0, 0, 0, 0);

			const timeMax = new Date(endDate);
			timeMax.setHours(23, 59, 59, 999);

			// Fetch both Google Calendar events and task calendar event IDs in parallel
			const [calendarResponse, taskEventsResponse] = await Promise.all([
				fetch(
					`/api/calendar/events?timeMin=${timeMin.toISOString()}&timeMax=${timeMax.toISOString()}`
				),
				fetch(
					`/api/calendar/task-events?timeMin=${timeMin.toISOString()}&timeMax=${timeMax.toISOString()}`
				)
			]);

			if (!calendarResponse.ok) {
				throw new Error('Failed to fetch calendar events');
			}

			const calendarData = await calendarResponse.json();
			const allCalendarEvents = calendarData.events || [];

			// Collect BuildOS calendar event IDs (time blocks + tasks)
			const buildOSEventIds = new Set<string>();

			// Add time block calendar event IDs
			blocks.forEach((block) => {
				if (block.calendar_event_id) {
					buildOSEventIds.add(block.calendar_event_id);
				}
			});

			// Add task calendar event IDs
			if (taskEventsResponse.ok) {
				const taskEventsData = await taskEventsResponse.json();
				const taskEventIds = taskEventsData.data?.calendar_event_ids || [];
				taskEventIds.forEach((id: string) => {
					if (id) {
						buildOSEventIds.add(id);
					}
				});
			}

			// Filter out BuildOS-created events - only show external calendar events in grey
			calendarEvents = allCalendarEvents.filter((event) => !buildOSEventIds.has(event.id));
		} catch (error) {
			console.error('Error fetching calendar events:', error);
			calendarEvents = [];
		} finally {
			isLoadingEvents = false;
		}
	}

	// Navigation functions
	function navigatePrevious() {
		const newDate = new Date(selectedDate);
		if (viewMode === 'day') {
			newDate.setDate(newDate.getDate() - 1);
		} else if (viewMode === 'week') {
			newDate.setDate(newDate.getDate() - 7);
		} else {
			newDate.setMonth(newDate.getMonth() - 1);
		}
		selectedDate = newDate;
	}

	function navigateNext() {
		const newDate = new Date(selectedDate);
		if (viewMode === 'day') {
			newDate.setDate(newDate.getDate() + 1);
		} else if (viewMode === 'week') {
			newDate.setDate(newDate.getDate() + 7);
		} else {
			newDate.setMonth(newDate.getMonth() + 1);
		}
		selectedDate = newDate;
	}

	function navigateToday() {
		selectedDate = new Date();
	}

	// Keyboard shortcuts
	onMount(() => {
		function handleKeyDown(event: KeyboardEvent) {
			// Only handle if not in an input
			if (
				event.target instanceof HTMLInputElement ||
				event.target instanceof HTMLTextAreaElement
			) {
				return;
			}

			switch (event.key.toLowerCase()) {
				case 'd':
					viewMode = 'day';
					break;
				case 'w':
					viewMode = 'week';
					break;
				case 'm':
					viewMode = 'month';
					break;
				case 'arrowleft':
					navigatePrevious();
					break;
				case 'arrowright':
					navigateNext();
					break;
				case 't':
					navigateToday();
					break;
			}
		}

		window.addEventListener('keydown', handleKeyDown);
		return () => {
			window.removeEventListener('keydown', handleKeyDown);
		};
	});

	// Fetch calendar events when date range or connection status changes
	$effect(() => {
		if (days.length > 0) {
			fetchCalendarEvents();
		}
	});

	// Function to get calendar events for a specific day
	function getCalendarEventsForDay(dayIndex: number): CalendarEvent[] {
		const dayDate = days[dayIndex];
		if (!dayDate) return [];

		return calendarEvents.filter((event) => {
			const eventStart = new Date(event.start.dateTime || event.start.date || '');
			return isSameDay(eventStart, dayDate);
		});
	}

	// Function to get calendar event style (position on calendar)
	function getCalendarEventStyle(event: CalendarEvent, dayIndex: number): string | null {
		const dayDate = days[dayIndex];
		if (!dayDate) return null;

		const eventStart = new Date(event.start.dateTime || event.start.date || '');
		const eventEnd = new Date(event.end.dateTime || event.end.date || '');

		// Check if event is on this day
		if (!isSameDay(eventStart, dayDate)) {
			return null;
		}

		// For all-day events, show at the top
		if (event.start.date && !event.start.dateTime) {
			return 'top: 0px; height: 30px;';
		}

		const startHour = eventStart.getHours();
		const startMinute = eventStart.getMinutes();
		const endHour = eventEnd.getHours();
		const endMinute = eventEnd.getMinutes();

		// Calculate position
		const top = ((startHour - HOURS_START) * 60 + startMinute) * (HOUR_HEIGHT / 60);
		const duration = (endHour - startHour) * 60 + (endMinute - startMinute);
		const height = duration * (HOUR_HEIGHT / 60);

		// Check if event is within visible hours
		if (startHour < HOURS_START || endHour > HOURS_END) {
			return null;
		}

		return `top: ${top}px; height: ${height}px;`;
	}
</script>

<div class="time-play-calendar">
	<!-- Calendar Header -->
	<div
		class="calendar-header flex items-center justify-between rounded-t-2xl border-b border-slate-200/80 bg-white/90 px-6 py-4 backdrop-blur-xl dark:border-slate-800/70 dark:bg-slate-900/60"
	>
		<div class="flex items-center gap-4">
			<button
				type="button"
				class="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
				onclick={navigateToday}
			>
				Today
			</button>
			<div class="flex items-center gap-2">
				<button
					type="button"
					class="rounded-lg p-2 text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
					onclick={navigatePrevious}
					aria-label="Previous"
				>
					<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M15 19l-7-7 7-7"
						/>
					</svg>
				</button>
				<button
					type="button"
					class="rounded-lg p-2 text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
					onclick={navigateNext}
					aria-label="Next"
				>
					<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M9 5l7 7-7 7"
						/>
					</svg>
				</button>
			</div>
			<h2 class="text-lg font-semibold text-slate-900 dark:text-slate-50">
				{#if viewMode === 'month'}
					{selectedDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
				{:else if viewMode === 'week' && days[0] && days[6]}
					{days[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {days[6].toLocaleDateString(
						'en-US',
						{ month: 'short', day: 'numeric', year: 'numeric' }
					)}
				{:else}
					{formatDayHeader(selectedDate)}
				{/if}
			</h2>
		</div>

		<div class="flex items-center gap-2">
			<button
				type="button"
				class={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
					viewMode === 'day'
						? 'bg-blue-500 text-white'
						: 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200'
				}`}
				onclick={() => (viewMode = 'day')}
			>
				Day
			</button>
			<button
				type="button"
				class={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
					viewMode === 'week'
						? 'bg-blue-500 text-white'
						: 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200'
				}`}
				onclick={() => (viewMode = 'week')}
			>
				Week
			</button>
			<button
				type="button"
				class={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
					viewMode === 'month'
						? 'bg-blue-500 text-white'
						: 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200'
				}`}
				onclick={() => (viewMode = 'month')}
			>
				Month
			</button>
		</div>
	</div>

	<!-- Calendar Grid -->
	{#if viewMode === 'week' || viewMode === 'day'}
		<div class="calendar-grid-container relative overflow-auto">
			<div class="calendar-grid">
				<!-- Time labels column -->
				<div class="time-labels">
					<div class="h-12"></div>
					<!-- Spacer for day headers -->
					{#each hours as hour}
						<div
							class="time-label border-t border-slate-200/50 text-xs font-medium text-slate-500 dark:border-slate-700/50 dark:text-slate-400"
							style="height: {HOUR_HEIGHT}px;"
						>
							{formatHour(hour)}
						</div>
					{/each}
				</div>

				<!-- Day columns -->
				<div class="days-container">
					<!-- Day headers -->
					<div class="day-headers">
						{#each days as day, dayIndex}
							<div
								class={`day-header border-l border-slate-200/50 text-center dark:border-slate-700/50 ${
									isToday(day) ? 'bg-blue-50/50 dark:bg-blue-900/20' : ''
								}`}
							>
								<div class="py-3">
									<div
										class="text-xs font-medium text-slate-600 dark:text-slate-300"
									>
										{day.toLocaleDateString('en-US', { weekday: 'short' })}
									</div>
									<div
										class={`mt-1 text-sm font-semibold ${
											isToday(day)
												? 'text-blue-600 dark:text-blue-300'
												: 'text-slate-900 dark:text-slate-100'
										}`}
									>
										{day.getDate()}
									</div>
								</div>
							</div>
						{/each}
					</div>

					<!-- Day columns with slots -->
					<div class="day-columns">
						{#each days as day, dayIndex}
							<div
								class={`day-column relative border-l border-slate-200/50 dark:border-slate-700/50 ${
									isToday(day) ? 'bg-blue-50/30 dark:bg-blue-900/10' : ''
								}`}
								role="button"
								tabindex="0"
								onmouseup={handleSlotMouseUp}
							>
								<!-- Hour slots -->
								{#each hours as hour}
									{#each [0, 30] as minute}
										<div
											class="time-slot border-t border-slate-200/30 transition hover:bg-blue-50/50 dark:border-slate-700/30 dark:hover:bg-blue-900/20"
											style="height: {HOUR_HEIGHT / 2}px;"
											role="button"
											tabindex="0"
											onmousedown={() =>
												handleSlotMouseDown(dayIndex, hour, minute)}
											onmousemove={() =>
												handleSlotMouseMove(dayIndex, hour, minute)}
										></div>
									{/each}
								{/each}

								<!-- Google Calendar Events (shown in grey) -->
								{#if isCalendarConnected}
									{#each getCalendarEventsForDay(dayIndex) as event}
										{@const style = getCalendarEventStyle(event, dayIndex)}
										{#if style}
											<button
												type="button"
												class="calendar-event absolute inset-x-1 cursor-pointer rounded-lg border border-slate-300/50 bg-slate-200/80 px-2 py-1 text-left text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-300/80 hover:shadow-md dark:border-slate-600/50 dark:bg-slate-700/80 dark:text-slate-200 dark:hover:bg-slate-600/80"
												{style}
												onclick={() => handleCalendarEventClick(event)}
											>
												<div class="event-title truncate font-medium">
													{event.summary || '(No title)'}
												</div>
												{#if event.start.dateTime}
													<div
														class="event-time text-slate-600 dark:text-slate-300"
													>
														{new Date(
															event.start.dateTime
														).toLocaleTimeString('en-US', {
															hour: 'numeric',
															minute: '2-digit'
														})}
													</div>
												{/if}
											</button>
										{/if}
									{/each}
								{/if}

								<!-- Time blocks -->
								{#each getBlocksForDay(dayIndex) as block}
									{@const style = getBlockStyle(block, dayIndex)}
									{#if style}
										<button
											type="button"
											class="time-block absolute inset-x-1 cursor-pointer rounded-lg border border-white/20 px-2 py-1 text-left text-xs font-medium text-white shadow-lg transition hover:shadow-xl"
											style={`${style} background: ${resolveBlockAccentColor(block)};`}
											onclick={() => handleBlockClick(block)}
										>
											<div class="block-title truncate font-semibold">
												{block.block_type === 'project'
													? block.project?.name
													: 'Build Block'}
											</div>
											<div class="block-time text-white/80">
												{new Date(block.start_time).toLocaleTimeString(
													'en-US',
													{
														hour: 'numeric',
														minute: '2-digit'
													}
												)}
											</div>
										</button>
									{/if}
								{/each}

								<!-- Drag preview -->
								{#if isDragging && dragStart?.day === dayIndex}
									{@const previewStyle = getDragPreviewStyle()}
									{#if previewStyle}
										<div
											class="drag-preview absolute inset-x-1 rounded-lg border-2 border-dashed border-blue-400 bg-blue-500/20 dark:border-blue-500 dark:bg-blue-500/30"
											style={previewStyle}
										></div>
									{/if}
								{/if}
							</div>
						{/each}
					</div>
				</div>
			</div>
		</div>
	{:else}
		<!-- Month view (simplified for now) -->
		<div class="month-view p-6">
			<div class="text-center text-slate-600 dark:text-slate-300">
				<p class="text-sm">Month view coming soon!</p>
				<p class="mt-2 text-xs text-slate-500 dark:text-slate-400">
					Use week or day view for now to manage your time blocks.
				</p>
			</div>
		</div>
	{/if}

	<!-- Keyboard shortcuts hint -->
	<div
		class="shortcuts-hint border-t border-slate-200/80 bg-slate-50/80 px-6 py-3 text-xs text-slate-600 backdrop-blur-xl dark:border-slate-800/70 dark:bg-slate-900/40 dark:text-slate-400"
	>
		<span class="font-medium">Shortcuts:</span>
		<span class="ml-2">D = Day</span>
		<span class="ml-2">W = Week</span>
		<span class="ml-2">M = Month</span>
		<span class="ml-2">← / → = Navigate</span>
		<span class="ml-2">T = Today</span>
	</div>
</div>

<style>
	.time-play-calendar {
		@apply overflow-hidden rounded-2xl border border-slate-200/80 bg-white/80 shadow-xl shadow-slate-200/60 backdrop-blur-xl dark:border-slate-800/70 dark:bg-slate-900/60 dark:shadow-black/40;
	}

	.calendar-grid-container {
		@apply max-h-[600px];
	}

	.calendar-grid {
		@apply grid grid-cols-[80px_1fr];
	}

	.time-labels {
		@apply border-r border-slate-200/50 bg-slate-50/50 dark:border-slate-700/50 dark:bg-slate-900/20;
	}

	.time-label {
		@apply flex items-start justify-end pr-3 pt-1;
	}

	.day-headers {
		@apply sticky top-0 z-10 grid bg-white/90 backdrop-blur-xl dark:bg-slate-900/80;
		grid-template-columns: repeat(auto-fit, minmax(0, 1fr));
	}

	.day-columns {
		@apply relative grid;
		grid-template-columns: repeat(auto-fit, minmax(0, 1fr));
	}

	.time-slot {
		@apply cursor-pointer;
	}

	.calendar-event {
		z-index: 8;
	}

	.calendar-event:hover {
		z-index: 18;
	}

	.time-block {
		z-index: 10;
	}

	.time-block:hover {
		z-index: 20;
	}

	.drag-preview {
		z-index: 5;
		pointer-events: none;
	}
</style>
