<!-- apps/web/src/lib/components/time-blocks/TimePlayCalendar.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import type { TimeBlockWithProject } from '@buildos/shared-types';
	import { resolveBlockAccentColor } from '$lib/utils/time-block-colors';
	import type { CalendarEvent } from '$lib/services/calendar-service';
	import type { AvailableSlot } from '$lib/types/time-blocks';
	import { formatSlotDuration, formatTimeRange } from '$lib/utils/slot-finder';
	import { requireApiData } from '$lib/utils/api-client-helpers';
	import { toastService } from '$lib/stores/toast.store';

	let {
		blocks = [],
		days = [],
		viewMode = $bindable('week'),
		selectedDate = $bindable(new Date()),
		isCalendarConnected = false,
		availableSlots = [],
		calendarEventsOut = $bindable([]),
		onBlockCreate,
		onBlockClick,
		onCalendarEventClick,
		onSlotClick,
		onNavigate,
		onViewModeChange
	}: {
		blocks?: TimeBlockWithProject[];
		days?: Date[];
		viewMode?: 'day' | 'week' | 'month';
		selectedDate?: Date;
		isCalendarConnected?: boolean;
		availableSlots?: AvailableSlot[];
		calendarEventsOut?: CalendarEvent[];
		onBlockCreate?: (startTime: Date, endTime: Date) => void;
		onBlockClick?: (block: TimeBlockWithProject) => void;
		onCalendarEventClick?: (event: CalendarEvent) => void;
		onSlotClick?: (slot: AvailableSlot) => void;
		onNavigate?: (date: Date) => void;
		onViewModeChange?: (mode: 'day' | 'week' | 'month') => void;
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

	// days array is now passed as a prop from parent component
	// This ensures slot dayIndex values match the displayed columns

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
			// Unwrap Svelte 5 proxy to pass plain object to parent
			// This prevents "Proxy" objects from appearing in callbacks
			const plainEvent = $state.snapshot(event);
			onCalendarEventClick(plainEvent);
		}
	}

	function handleSlotClick(slot: AvailableSlot) {
		if (onSlotClick) {
			onSlotClick(slot);
		}
	}

	// Get available slots for a specific day
	function getSlotsForDay(dayIndex: number): AvailableSlot[] {
		const daySlots = availableSlots.filter((slot) => slot.dayIndex === dayIndex);

		return daySlots;
	}

	// Get slot style for positioning in calendar grid
	function getSlotStyle(slot: AvailableSlot, dayIndex: number): string | null {
		if (slot.dayIndex !== dayIndex) {
			return null;
		}

		const slotStart = new Date(slot.startTime);
		const slotEnd = new Date(slot.endTime);

		const startHour = slotStart.getHours();
		const startMinute = slotStart.getMinutes();
		const endHour = slotEnd.getHours();
		const endMinute = slotEnd.getMinutes();

		// Calculate position
		const top = ((startHour - HOURS_START) * 60 + startMinute) * (HOUR_HEIGHT / 60);
		const duration = (endHour - startHour) * 60 + (endMinute - startMinute);
		const height = duration * (HOUR_HEIGHT / 60);

		// Check if slot is within visible hours
		if (startHour < HOURS_START || endHour > HOURS_END) {
			return null;
		}

		return `top: ${top}px; height: ${height}px;`;
	}

	// Get slots for a specific date (month view)
	function getSlotsForDate(date: Date): AvailableSlot[] {
		return availableSlots.filter((slot) => {
			return isSameDay(new Date(slot.dayDate), date);
		});
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

			const calendarData = await requireApiData<{ events?: CalendarEvent[] }>(
				calendarResponse,
				'Failed to fetch calendar events'
			);
			const allCalendarEvents: CalendarEvent[] = calendarData.events || [];

			// Collect BuildOS calendar event IDs (time blocks + tasks)
			const buildOSEventIds = new Set<string>();

			// Add time block calendar event IDs
			blocks.forEach((block) => {
				if (block.calendar_event_id) {
					buildOSEventIds.add(block.calendar_event_id);
				}
			});

			// Add task calendar event IDs
			try {
				const taskEventsData = await requireApiData<{ calendar_event_ids?: string[] }>(
					taskEventsResponse,
					'Failed to fetch task calendar events'
				);
				const taskEventIds = taskEventsData.calendar_event_ids || [];
				taskEventIds.forEach((id: string) => {
					if (id) {
						buildOSEventIds.add(id);
					}
				});
			} catch (taskError) {
				console.error('Error loading task calendar events:', taskError);
			}

			// Filter out BuildOS-created events - only show external calendar events in grey
			calendarEvents = allCalendarEvents.filter(
				(event: CalendarEvent) => !buildOSEventIds.has(event.id)
			);
		} catch (error) {
			console.error('Error fetching calendar events:', error);
			toastService.error('Failed to load calendar events');
			calendarEvents = [];
		} finally {
			isLoadingEvents = false;
		}
	}

	// View mode change handler
	function changeViewMode(mode: 'day' | 'week' | 'month') {
		if (onViewModeChange) {
			onViewModeChange(mode);
		} else {
			viewMode = mode;
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

		if (onNavigate) {
			onNavigate(newDate);
		} else {
			selectedDate = newDate;
		}
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

		if (onNavigate) {
			onNavigate(newDate);
		} else {
			selectedDate = newDate;
		}
	}

	function navigateToday() {
		const today = new Date();
		if (onNavigate) {
			onNavigate(today);
		} else {
			selectedDate = today;
		}
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
					event.preventDefault();
					changeViewMode('day');
					break;
				case 'w':
					event.preventDefault();
					changeViewMode('week');
					break;
				case 'm':
					event.preventDefault();
					changeViewMode('month');
					break;
				case 'arrowleft':
					event.preventDefault();
					navigatePrevious();
					break;
				case 'arrowright':
					event.preventDefault();
					navigateNext();
					break;
				case 't':
					event.preventDefault();
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
		if (!browser) return;
		if (days.length > 0) {
			fetchCalendarEvents();
		}
	});

	// Expose calendar events to parent component
	$effect(() => {
		calendarEventsOut = calendarEvents;
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

	// Month view helpers
	function getMonthCalendarGrid(): Date[] {
		// Get the first day of the month
		const year = selectedDate.getFullYear();
		const month = selectedDate.getMonth();
		const firstDay = new Date(year, month, 1);

		// Get the day of week for the first day (0 = Sunday)
		const firstDayOfWeek = firstDay.getDay();

		// Calculate the start date (may be in previous month)
		const startDate = new Date(firstDay);
		startDate.setDate(startDate.getDate() - firstDayOfWeek);

		// Generate 42 days (6 weeks) for complete calendar grid
		return Array.from({ length: 42 }, (_, i) => {
			return new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
		});
	}

	function isCurrentMonth(date: Date): boolean {
		return date.getMonth() === selectedDate.getMonth();
	}

	function getEventsForDate(date: Date): Array<TimeBlockWithProject | CalendarEvent> {
		const timeBlocks = blocks.filter((block) => {
			const blockStart = new Date(block.start_time);
			return isSameDay(blockStart, date);
		});

		const calEvents = calendarEvents.filter((event) => {
			const eventStart = new Date(event.start.dateTime || event.start.date || '');
			return isSameDay(eventStart, date);
		});

		return [...timeBlocks, ...calEvents];
	}

	function isTimeBlock(
		event: TimeBlockWithProject | CalendarEvent
	): event is TimeBlockWithProject {
		return 'block_type' in event;
	}

	function formatEventTime(event: TimeBlockWithProject | CalendarEvent): string {
		if (isTimeBlock(event)) {
			return new Date(event.start_time).toLocaleTimeString('en-US', {
				hour: 'numeric',
				minute: '2-digit'
			});
		} else {
			if (event.start.date && !event.start.dateTime) {
				return 'All day';
			}
			return new Date(event.start.dateTime || '').toLocaleTimeString('en-US', {
				hour: 'numeric',
				minute: '2-digit'
			});
		}
	}

	function getEventTitle(event: TimeBlockWithProject | CalendarEvent): string {
		if (isTimeBlock(event)) {
			return event.block_type === 'project'
				? event.project?.name || 'Build Block'
				: 'Build Block';
		} else {
			return event.summary || '(No title)';
		}
	}

	function getEventColor(event: TimeBlockWithProject | CalendarEvent): string {
		if (isTimeBlock(event)) {
			return resolveBlockAccentColor(event);
		} else {
			return 'rgb(148 163 184)'; // Gray for calendar events
		}
	}
</script>

<div class="time-blocks-calendar">
	<!-- Calendar Header -->
	<div class="calendar-header">
		<!-- Mobile Header (< 768px) -->
		<div class="mobile-header md:hidden">
			<div class="flex items-center justify-between gap-3">
				<button type="button" class="today-btn shrink-0" onclick={navigateToday}>
					Today
				</button>

				<h2 class="header-title min-w-0 flex-1 truncate text-center">
					{#if viewMode === 'month'}
						{selectedDate.toLocaleDateString('en-US', {
							month: 'short',
							year: 'numeric'
						})}
					{:else if viewMode === 'week' && days[0] && days[6]}
						{days[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {days[6].getDate()}
					{:else}
						{selectedDate.toLocaleDateString('en-US', {
							month: 'short',
							day: 'numeric'
						})}
					{/if}
				</h2>

				<div class="flex items-center gap-1 shrink-0">
					<button
						type="button"
						class="nav-btn"
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
					<button type="button" class="nav-btn" onclick={navigateNext} aria-label="Next">
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
			</div>

			<!-- Mobile View Toggle -->
			<div class="mt-3 flex items-center gap-2">
				<button
					type="button"
					class={`view-toggle ${viewMode === 'day' ? 'active' : ''}`}
					onclick={() => changeViewMode('day')}
				>
					Day
				</button>
				<button
					type="button"
					class={`view-toggle ${viewMode === 'week' ? 'active' : ''}`}
					onclick={() => changeViewMode('week')}
				>
					Week
				</button>
				<button
					type="button"
					class={`view-toggle ${viewMode === 'month' ? 'active' : ''}`}
					onclick={() => changeViewMode('month')}
				>
					Month
				</button>
			</div>
		</div>

		<!-- Desktop Header (≥ 768px) -->
		<div class="desktop-header hidden md:flex">
			<div class="flex items-center gap-4">
				<button type="button" class="today-btn" onclick={navigateToday}> Today </button>
				<div class="flex items-center gap-2">
					<button
						type="button"
						class="nav-btn"
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
					<button type="button" class="nav-btn" onclick={navigateNext} aria-label="Next">
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
				<h2 class="header-title">
					{#if viewMode === 'month'}
						{selectedDate.toLocaleDateString('en-US', {
							month: 'long',
							year: 'numeric'
						})}
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
					class={`view-toggle ${viewMode === 'day' ? 'active' : ''}`}
					onclick={() => changeViewMode('day')}
				>
					Day
				</button>
				<button
					type="button"
					class={`view-toggle ${viewMode === 'week' ? 'active' : ''}`}
					onclick={() => changeViewMode('week')}
				>
					Week
				</button>
				<button
					type="button"
					class={`view-toggle ${viewMode === 'month' ? 'active' : ''}`}
					onclick={() => changeViewMode('month')}
				>
					Month
				</button>
			</div>
		</div>
	</div>

	<!-- Calendar Grid -->
	{#if viewMode === 'week' || viewMode === 'day'}
		<div class="calendar-grid-container">
			<div class="calendar-grid">
				<!-- Time labels column -->
				<div class="time-labels">
					<div class="day-header-spacer"></div>
					<!-- Spacer for day headers -->
					{#each hours as hour}
						<div class="time-label" style="height: {HOUR_HEIGHT}px;">
							<span class="time-label-text">{formatHour(hour)}</span>
						</div>
					{/each}
				</div>

				<!-- Day columns -->
				<div class="days-container z-0">
					<!-- Day headers -->
					<div class="day-headers">
						{#each days as day, dayIndex}
							<div class={`day-header ${isToday(day) ? 'is-today' : ''}`}>
								<div class="day-header-content">
									<div class="day-header-weekday">
										{day.toLocaleDateString('en-US', { weekday: 'short' })}
									</div>
									<div
										class={`day-header-date ${isToday(day) ? 'is-today-date' : ''}`}
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
								class={`day-column ${isToday(day) ? 'is-today-column' : ''}`}
								role="button"
								tabindex="0"
								onmouseup={handleSlotMouseUp}
							>
								<!-- Hour slots -->
								{#each hours as hour}
									{#each [0, 30] as minute}
										<div
											class="time-slot"
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

								<!-- Available Slots (shown in emerald) -->
								{#each getSlotsForDay(dayIndex) as slot}
									{@const slotStyle = getSlotStyle(slot, dayIndex)}
									{#if slotStyle}
										<button
											type="button"
											class="available-slot group"
											style={slotStyle}
											onclick={() => handleSlotClick(slot)}
											aria-label={`Available time slot from ${formatTimeRange(slot.startTime, slot.endTime)}, duration ${formatSlotDuration(slot.duration)}`}
										>
											{#if slot.duration >= 60}
												<div class="slot-duration-text">
													{formatSlotDuration(slot.duration)}
												</div>
											{/if}
											<!-- Tooltip on hover -->
											<div class="slot-tooltip">
												<div class="tooltip-title">Available Slot</div>
												<div class="tooltip-time">
													{formatTimeRange(slot.startTime, slot.endTime)}
												</div>
												<div class="tooltip-duration">
													Duration: {formatSlotDuration(slot.duration)}
												</div>
												<div class="tooltip-action">
													Click to create time block
												</div>
											</div>
										</button>
									{/if}
								{/each}

								<!-- Google Calendar Events (shown in grey) -->
								{#if isCalendarConnected}
									{#each getCalendarEventsForDay(dayIndex) as event}
										{@const style = getCalendarEventStyle(event, dayIndex)}
										{#if style}
											<button
												type="button"
												class="calendar-event"
												{style}
												onclick={() => handleCalendarEventClick(event)}
											>
												<div class="event-title">
													{event.summary || '(No title)'}
												</div>
												{#if event.start.dateTime}
													<div class="event-time">
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
											class="time-block"
											style={`${style} background: ${resolveBlockAccentColor(block)};`}
											onclick={() => handleBlockClick(block)}
										>
											<div class="block-title">
												{block.block_type === 'project'
													? block.project?.name
													: 'Build Block'}
											</div>
											<div class="block-time">
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
										<div class="drag-preview" style={previewStyle}></div>
									{/if}
								{/if}
							</div>
						{/each}
					</div>
				</div>
			</div>
		</div>
	{:else}
		<!-- Month view -->
		<div class="month-view-container z-0">
			<div class="month-grid">
				<!-- Day of week headers -->
				<div class="month-grid-header">
					{#each ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as dayName}
						<div class="month-day-name">{dayName}</div>
					{/each}
				</div>

				<!-- Calendar grid -->
				<div class="month-grid-days">
					{#each getMonthCalendarGrid() as date}
						{@const events = getEventsForDate(date)}
						{@const isCurrentMonthDay = isCurrentMonth(date)}
						{@const isTodayDay = isToday(date)}
						{@const daySlots = getSlotsForDate(date)}
						<div
							class="month-day-cell"
							class:other-month={!isCurrentMonthDay}
							class:today={isTodayDay}
						>
							<!-- Day number -->
							<div class="month-day-number">
								{date.getDate()}
							</div>

							<!-- Available slots badge -->
							{#if daySlots.length > 0}
								<div
									class="available-slots-badge"
									title="{daySlots.length} available slot{daySlots.length !== 1
										? 's'
										: ''}"
								>
									{daySlots.length}
								</div>
							{/if}

							<!-- Events preview (condensed) -->
							{#if events.length > 0}
								<div class="month-events">
									{#each events.slice(0, 3) as event}
										<button
											type="button"
											class="month-event-item"
											style="background: {getEventColor(event)};"
											onclick={() => {
												if (isTimeBlock(event)) {
													handleBlockClick(event);
												} else {
													handleCalendarEventClick(event);
												}
											}}
										>
											<div class="month-event-content">
												<span class="month-event-time"
													>{formatEventTime(event)}</span
												>
												<span class="month-event-title"
													>{getEventTitle(event)}</span
												>
											</div>
											<!-- Hover expansion tooltip -->
											<div class="month-event-hover-detail">
												<div class="hover-detail-time">
													{formatEventTime(event)}
												</div>
												<div class="hover-detail-title">
													{getEventTitle(event)}
												</div>
											</div>
										</button>
									{/each}
									{#if events.length > 3}
										<div class="month-event-more">
											+{events.length - 3} more
										</div>
									{/if}
								</div>
							{/if}
						</div>
					{/each}
				</div>
			</div>
		</div>
	{/if}

	<!-- Keyboard shortcuts hint -->
	<div class="shortcuts-hint">
		<span class="shortcuts-label">Shortcuts:</span>
		<span class="shortcut hidden sm:inline">D = Day</span>
		<span class="shortcut hidden sm:inline">W = Week</span>
		<span class="shortcut hidden sm:inline">M = Month</span>
		<span class="shortcut">← / → = Navigate</span>
		<span class="shortcut hidden sm:inline">T = Today</span>
	</div>
</div>

<style lang="postcss">
	/* ========================================
	   MAIN CONTAINER
	   ======================================== */
	.time-blocks-calendar {
		@apply relative overflow-hidden;
		border-radius: 0;
		background: transparent;
	}

	/* ========================================
	   HEADER STYLES
	   ======================================== */
	.calendar-header {
		@apply border-b;
		border-color: rgb(226 232 240);
		background: rgb(255 255 255);
	}

	:global(.dark) .calendar-header {
		border-color: rgb(51 65 85);
		background: rgb(15 23 42);
	}

	.mobile-header {
		@apply px-3 py-2;
	}

	.desktop-header {
		@apply items-center justify-between px-4 py-2.5;
	}

	/* Header buttons */
	.today-btn {
		@apply rounded-md px-2.5 py-1.5 text-xs font-medium transition-all duration-150;
		background: rgb(241 245 249 / 0.8);
		color: rgb(51 65 85);
		border: 1px solid rgb(226 232 240 / 0.8);
		min-height: 32px; /* Touch-friendly on mobile */
	}

	.today-btn:hover {
		background: rgb(226 232 240);
		border-color: rgb(203 213 225);
		transform: translateY(-1px);
	}

	.today-btn:active {
		transform: translateY(0);
	}

	@media (min-width: 768px) {
		.today-btn {
			min-height: 28px;
			padding: 0.375rem 0.625rem;
		}
	}

	:global(.dark) .today-btn {
		background: rgb(51 65 85 / 0.6);
		color: rgb(226 232 240);
		border-color: rgb(71 85 105 / 0.6);
	}

	:global(.dark) .today-btn:hover {
		background: rgb(71 85 105 / 0.8);
		border-color: rgb(100 116 139);
	}

	.nav-btn {
		@apply rounded-md p-1.5 transition-all duration-150;
		color: rgb(100 116 139);
		min-height: 32px; /* Touch-friendly */
		min-width: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.nav-btn:hover {
		background: rgb(241 245 249 / 0.8);
		color: rgb(51 65 85);
	}

	.nav-btn:active {
		transform: scale(0.95);
	}

	@media (min-width: 768px) {
		.nav-btn {
			min-height: 28px;
			min-width: 28px;
			padding: 0.25rem;
		}
	}

	:global(.dark) .nav-btn {
		color: rgb(148 163 184);
	}

	:global(.dark) .nav-btn:hover {
		background: rgb(51 65 85 / 0.6);
		color: rgb(226 232 240);
	}

	.header-title {
		@apply font-semibold;
		color: rgb(15 23 42);
		font-size: 0.8125rem;
		line-height: 1.3;
	}

	@media (min-width: 768px) {
		.header-title {
			font-size: 0.875rem;
		}
	}

	:global(.dark) .header-title {
		color: rgb(248 250 252);
	}

	/* View toggle buttons */
	.view-toggle {
		@apply rounded-md px-2.5 py-1.5 text-xs font-medium transition-all duration-150;
		background: transparent;
		color: rgb(100 116 139);
		flex: 1;
		min-height: 32px; /* Touch-friendly */
	}

	@media (min-width: 768px) {
		.view-toggle {
			flex: none;
			min-height: 28px;
			padding: 0.375rem 0.625rem;
		}
	}

	.view-toggle:hover {
		background: rgb(241 245 249 / 0.8);
		color: rgb(51 65 85);
	}

	.view-toggle.active {
		background: linear-gradient(135deg, rgb(59 130 246), rgb(37 99 235));
		color: white;
		box-shadow:
			0 1px 2px rgb(0 0 0 / 0.05),
			0 4px 12px rgb(59 130 246 / 0.3);
	}

	:global(.dark) .view-toggle {
		color: rgb(148 163 184);
	}

	:global(.dark) .view-toggle:hover {
		background: rgb(51 65 85 / 0.6);
		color: rgb(226 232 240);
	}

	:global(.dark) .view-toggle.active {
		background: linear-gradient(135deg, rgb(37 99 235), rgb(29 78 216));
		color: white;
	}

	/* ========================================
	   CALENDAR GRID
	   ======================================== */
	.calendar-grid-container {
		@apply relative overflow-auto;
		max-height: 500px;
	}

	@media (min-width: 640px) {
		.calendar-grid-container {
			max-height: 600px;
		}
	}

	@media (min-width: 1024px) {
		.calendar-grid-container {
			max-height: 700px;
		}
	}

	.calendar-grid {
		@apply grid;
		grid-template-columns: 48px 1fr;
	}

	@media (min-width: 768px) {
		.calendar-grid {
			grid-template-columns: 64px 1fr;
		}
	}

	@media (min-width: 1024px) {
		.calendar-grid {
			grid-template-columns: 72px 1fr;
		}
	}

	/* ========================================
	   TIME LABELS
	   ======================================== */
	.time-labels {
		@apply border-r;
		background: rgb(248 250 252);
		border-color: rgb(226 232 240);
	}

	:global(.dark) .time-labels {
		background: rgb(15 23 42);
		border-color: rgb(51 65 85);
	}

	.day-header-spacer {
		height: 52px;
	}

	@media (min-width: 768px) {
		.day-header-spacer {
			height: 56px;
		}
	}

	.time-label {
		@apply relative flex items-start justify-end border-t;
		padding-right: 0.5rem;
		padding-top: 0.25rem;
		border-color: rgb(226 232 240 / 0.3);
	}

	@media (min-width: 768px) {
		.time-label {
			padding-right: 0.75rem;
		}
	}

	:global(.dark) .time-label {
		border-color: rgb(51 65 85 / 0.3);
	}

	.time-label-text {
		@apply font-medium;
		font-size: 0.6875rem;
		color: rgb(100 116 139);
	}

	@media (min-width: 768px) {
		.time-label-text {
			font-size: 0.75rem;
		}
	}

	:global(.dark) .time-label-text {
		color: rgb(148 163 184);
	}

	/* ========================================
	   DAY HEADERS
	   ======================================== */
	.day-headers {
		@apply sticky top-0 z-0 grid;
		grid-template-columns: repeat(auto-fit, minmax(0, 1fr));
		background: rgb(255 255 255);
		border-bottom: 1px solid rgb(226 232 240);
	}

	:global(.dark) .day-headers {
		background: rgb(15 23 42);
		border-bottom-color: rgb(51 65 85);
	}

	.day-header {
		@apply border-l text-center;
		border-color: rgb(226 232 240);
		transition: background-color 200ms ease;
	}

	.day-header.is-today {
		background: rgb(219 234 254);
	}

	:global(.dark) .day-header {
		border-color: rgb(51 65 85);
	}

	:global(.dark) .day-header.is-today {
		background: rgb(30 58 138 / 0.2);
	}

	.day-header-content {
		padding: 0.375rem 0.375rem;
	}

	@media (min-width: 768px) {
		.day-header-content {
			padding: 0.5rem 0.5rem;
		}
	}

	.day-header-weekday {
		@apply font-medium;
		font-size: 0.5625rem;
		color: rgb(100 116 139);
		text-transform: uppercase;
		letter-spacing: 0.025em;
	}

	@media (min-width: 768px) {
		.day-header-weekday {
			font-size: 0.625rem;
		}
	}

	:global(.dark) .day-header-weekday {
		color: rgb(148 163 184);
	}

	.day-header-date {
		@apply mt-0.5 font-semibold;
		font-size: 0.75rem;
		color: rgb(15 23 42);
	}

	@media (min-width: 768px) {
		.day-header-date {
			margin-top: 0.25rem;
			font-size: 0.875rem;
		}
	}

	.day-header-date.is-today-date {
		color: rgb(37 99 235);
	}

	:global(.dark) .day-header-date {
		color: rgb(248 250 252);
	}

	:global(.dark) .day-header-date.is-today-date {
		color: rgb(96 165 250);
	}

	/* ========================================
	   DAY COLUMNS
	   ======================================== */
	.day-columns {
		@apply relative grid;
		grid-template-columns: repeat(auto-fit, minmax(0, 1fr));
	}

	.day-column {
		@apply relative border-l;
		border-color: rgb(226 232 240);
		transition: background-color 150ms ease;
	}

	.day-column.is-today-column {
		background: rgb(219 234 254);
	}

	:global(.dark) .day-column {
		border-color: rgb(51 65 85);
	}

	:global(.dark) .day-column.is-today-column {
		background: rgb(30 58 138 / 0.1);
	}

	/* ========================================
	   TIME SLOTS
	   ======================================== */
	.time-slot {
		@apply cursor-pointer border-t;
		border-color: rgb(226 232 240 / 0.25);
		transition: background-color 150ms ease;
	}

	.time-slot:hover {
		background: rgb(219 234 254 / 0.4);
	}

	.time-slot:active {
		background: rgb(191 219 254 / 0.5);
	}

	:global(.dark) .time-slot {
		border-color: rgb(51 65 85 / 0.25);
	}

	:global(.dark) .time-slot:hover {
		background: rgb(30 58 138 / 0.2);
	}

	:global(.dark) .time-slot:active {
		background: rgb(30 64 175 / 0.3);
	}

	/* ========================================
	   CALENDAR EVENTS (Google Calendar)
	   ======================================== */
	.calendar-event {
		@apply absolute cursor-pointer rounded-lg border text-left transition-all duration-200;
		left: 2px;
		right: 2px;
		padding: 0.375rem 0.5rem;
		background: rgb(226 232 240 / 0.9);
		border-color: rgb(203 213 225 / 0.6);
		box-shadow: 0 1px 2px rgb(0 0 0 / 0.05);
		z-index: 8;
	}

	@media (min-width: 768px) {
		.calendar-event {
			left: 4px;
			right: 4px;
			padding: 0.5rem 0.625rem;
		}
	}

	.calendar-event:hover {
		background: rgb(203 213 225);
		box-shadow:
			0 2px 4px rgb(0 0 0 / 0.08),
			0 4px 12px rgb(0 0 0 / 0.08);
		transform: translateY(-1px);
		z-index: 18;
	}

	.calendar-event:active {
		transform: translateY(0);
	}

	:global(.dark) .calendar-event {
		background: rgb(51 65 85 / 0.9);
		border-color: rgb(71 85 105 / 0.6);
	}

	:global(.dark) .calendar-event:hover {
		background: rgb(71 85 105);
	}

	.event-title {
		@apply truncate font-medium;
		font-size: 0.75rem;
		color: rgb(51 65 85);
	}

	@media (min-width: 768px) {
		.event-title {
			font-size: 0.8125rem;
		}
	}

	:global(.dark) .event-title {
		color: rgb(226 232 240);
	}

	.event-time {
		font-size: 0.6875rem;
		color: rgb(100 116 139);
		margin-top: 0.125rem;
	}

	:global(.dark) .event-time {
		color: rgb(148 163 184);
	}

	/* ========================================
	   TIME BLOCKS (BuildOS blocks)
	   ======================================== */
	.time-block {
		@apply absolute cursor-pointer rounded-lg border text-left transition-all duration-200;
		left: 2px;
		right: 2px;
		padding: 0.375rem 0.5rem;
		border-color: rgb(255 255 255 / 0.25);
		color: white;
		box-shadow:
			0 2px 4px rgb(0 0 0 / 0.1),
			0 4px 8px rgb(0 0 0 / 0.08);
		z-index: 10;
	}

	@media (min-width: 768px) {
		.time-block {
			left: 4px;
			right: 4px;
			padding: 0.5rem 0.625rem;
		}
	}

	.time-block:hover {
		box-shadow:
			0 4px 8px rgb(0 0 0 / 0.15),
			0 8px 20px rgb(0 0 0 / 0.12),
			0 0 0 1px rgb(255 255 255 / 0.3) inset;
		transform: translateY(-2px) scale(1.01);
		z-index: 20;
	}

	.time-block:active {
		transform: translateY(-1px) scale(1);
	}

	.block-title {
		@apply truncate font-semibold;
		font-size: 0.75rem;
	}

	@media (min-width: 768px) {
		.block-title {
			font-size: 0.8125rem;
		}
	}

	.block-time {
		font-size: 0.6875rem;
		color: rgb(255 255 255 / 0.85);
		margin-top: 0.125rem;
	}

	/* ========================================
	   DRAG PREVIEW
	   ======================================== */
	.drag-preview {
		@apply absolute rounded-lg border-2 border-dashed;
		left: 2px;
		right: 2px;
		background: rgb(59 130 246 / 0.2);
		border-color: rgb(59 130 246);
		z-index: 5;
		pointer-events: none;
		animation: pulse 1.5s ease-in-out infinite;
	}

	@media (min-width: 768px) {
		.drag-preview {
			left: 4px;
			right: 4px;
		}
	}

	:global(.dark) .drag-preview {
		background: rgb(59 130 246 / 0.25);
		border-color: rgb(96 165 250);
	}

	@keyframes pulse {
		0%,
		100% {
			opacity: 0.6;
		}
		50% {
			opacity: 1;
		}
	}

	/* ========================================
	   MONTH VIEW
	   ======================================== */
	.month-view-container {
		@apply overflow-auto;
		max-height: 600px;
		padding: 0.75rem 0;
		position: relative;
	}

	@media (min-width: 768px) {
		.month-view-container {
			padding: 1rem;
			max-height: 700px;
		}
	}

	@media (min-width: 1024px) {
		.month-view-container {
			max-height: 750px;
		}
	}

	.month-grid {
		@apply w-full;
		min-width: 280px;
	}

	/* Day of week headers */
	.month-grid-header {
		@apply grid gap-px mb-px;
		grid-template-columns: repeat(7, 1fr);
		background: rgb(226 232 240 / 0.4);
		border-radius: 10px 10px 0 0;
		overflow: hidden;
	}

	:global(.dark) .month-grid-header {
		background: rgb(51 65 85 / 0.4);
	}

	.month-day-name {
		@apply text-center font-semibold;
		padding: 0.5rem 0.25rem;
		font-size: 0.625rem;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: rgb(100 116 139);
		background: rgb(248 250 252);
	}

	@media (min-width: 768px) {
		.month-day-name {
			padding: 0.625rem 0.5rem;
			font-size: 0.6875rem;
		}
	}

	@media (min-width: 1024px) {
		.month-day-name {
			padding: 0.75rem 0.625rem;
			font-size: 0.75rem;
		}
	}

	:global(.dark) .month-day-name {
		color: rgb(148 163 184);
		background: rgb(15 23 42 / 0.6);
	}

	/* Calendar grid */
	.month-grid-days {
		@apply grid gap-px;
		grid-template-columns: repeat(7, 14.3%);
		background: rgb(226 232 240 / 0.4);
		border-radius: 0 0 10px 10px;
		overflow: hidden;
	}

	:global(.dark) .month-grid-days {
		background: rgb(51 65 85 / 0.4);
	}

	/* Individual day cell */
	.month-day-cell {
		@apply relative;
		min-height: 55px;
		padding: 0.375rem 0.5rem;
		background: rgb(255 255 255);
		transition: all 200ms ease;
		border: 1px solid transparent;
	}

	@media (min-width: 768px) {
		.month-day-cell {
			min-height: 70px;
			padding: 0.5rem 0.625rem;
		}
	}

	@media (min-width: 1024px) {
		.month-day-cell {
			min-height: 85px;
			padding: 0.625rem 0.75rem;
		}
	}

	.month-day-cell:hover {
		background: rgb(249 250 251);
		border-color: rgb(203 213 225);
		transform: scale(1.02);
		z-index: 10;
		box-shadow:
			0 4px 12px rgb(0 0 0 / 0.08),
			0 2px 6px rgb(0 0 0 / 0.04);
	}

	:global(.dark) .month-day-cell {
		background: rgb(15 23 42);
	}

	:global(.dark) .month-day-cell:hover {
		background: rgb(30 41 59);
		border-color: rgb(71 85 105);
	}

	/* Today highlight */
	.month-day-cell.today {
		background: rgb(219 234 254);
		border-color: rgb(59 130 246);
	}

	.month-day-cell.today:hover {
		background: rgb(191 219 254);
		border-color: rgb(37 99 235);
	}

	:global(.dark) .month-day-cell.today {
		background: rgb(30 58 138);
		border-color: rgb(59 130 246);
	}

	:global(.dark) .month-day-cell.today:hover {
		background: rgb(30 64 175);
		border-color: rgb(96 165 250);
	}

	/* Other month days (grayed out) */
	.month-day-cell.other-month {
		opacity: 0.4;
	}

	.month-day-cell.other-month:hover {
		opacity: 0.6;
	}

	/* Day number */
	.month-day-number {
		@apply font-semibold;
		font-size: 0.8125rem;
		color: rgb(15 23 42);
		line-height: 1;
		margin-bottom: 0.375rem;
	}

	@media (min-width: 768px) {
		.month-day-number {
			font-size: 0.875rem;
			margin-bottom: 0.5rem;
		}
	}

	@media (min-width: 1024px) {
		.month-day-number {
			font-size: 0.9375rem;
			margin-bottom: 0.625rem;
		}
	}

	.month-day-cell.today .month-day-number {
		color: rgb(37 99 235);
	}

	:global(.dark) .month-day-number {
		color: rgb(248 250 252);
	}

	:global(.dark) .month-day-cell.today .month-day-number {
		color: rgb(96 165 250);
	}

	/* Events container */
	.month-events {
		@apply flex flex-col;
		gap: 0.25rem;
	}

	@media (min-width: 768px) {
		.month-events {
			gap: 0.375rem;
		}
	}

	/* Individual event item (condensed) */
	.month-event-item {
		@apply relative rounded text-left transition-all duration-300 ease-out;
		padding: 0.1875rem 0.3125rem;
		border: 1px solid rgb(255 255 255 / 0.2);
		box-shadow: 0 1px 2px rgb(0 0 0 / 0.1);
		overflow: hidden;
		cursor: pointer;
	}

	@media (min-width: 768px) {
		.month-event-item {
			padding: 0.25rem 0.375rem;
			border-radius: 0.25rem;
		}
	}

	@media (min-width: 1024px) {
		.month-event-item {
			padding: 0.3125rem 0.4375rem;
		}
	}

	.month-event-item:hover {
		transform: translateY(-2px) scale(1.05);
		box-shadow:
			0 8px 20px rgb(0 0 0 / 0.15),
			0 4px 8px rgb(0 0 0 / 0.1),
			0 0 0 1px rgb(255 255 255 / 0.3) inset;
		z-index: 20;
		border-color: rgb(255 255 255 / 0.4);
	}

	.month-event-item:active {
		transform: translateY(-1px) scale(1.02);
	}

	/* Event content (condensed view) */
	.month-event-content {
		@apply flex items-center gap-1;
		color: white;
		font-size: 0.625rem;
		line-height: 1.2;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	@media (min-width: 768px) {
		.month-event-content {
			font-size: 0.6875rem;
			gap: 0.375rem;
		}
	}

	@media (min-width: 1024px) {
		.month-event-content {
			font-size: 0.75rem;
			gap: 0.5rem;
		}
	}

	.month-event-time {
		@apply font-medium;
		opacity: 0.9;
		flex-shrink: 0;
	}

	.month-event-title {
		@apply truncate;
		flex: 1;
		min-width: 0;
	}

	/* Hover expansion tooltip */
	.month-event-hover-detail {
		@apply absolute left-0 right-0 bottom-full mb-2 rounded-lg shadow-ink-strong;
		padding: 0.75rem 1rem;
		background: rgb(15 23 42);
		border: 1px solid rgb(51 65 85);
		opacity: 0;
		transform: translateY(4px) scale(0.95);
		transition: all 250ms cubic-bezier(0.4, 0, 0.2, 1);
		pointer-events: none;
		z-index: 50;
		min-width: 200px;
		max-width: 280px;
	}

	.month-event-item:hover .month-event-hover-detail {
		opacity: 1;
		transform: translateY(0) scale(1);
	}

	:global(.dark) .month-event-hover-detail {
		background: rgb(15 23 42);
		border-color: rgb(71 85 105);
	}

	.hover-detail-time {
		@apply font-medium mb-1;
		font-size: 0.75rem;
		color: rgb(148 163 184);
		letter-spacing: 0.015em;
	}

	.hover-detail-title {
		@apply font-semibold;
		font-size: 0.875rem;
		color: rgb(248 250 252);
		line-height: 1.4;
		word-break: break-word;
	}

	/* More events indicator */
	.month-event-more {
		@apply text-center rounded;
		padding: 0.125rem 0.25rem;
		margin-top: 0.125rem;
		font-size: 0.625rem;
		font-weight: 600;
		color: rgb(100 116 139);
		background: rgb(241 245 249 / 0.8);
		border: 1px solid rgb(226 232 240 / 0.6);
		letter-spacing: 0.015em;
	}

	@media (min-width: 768px) {
		.month-event-more {
			font-size: 0.6875rem;
			padding: 0.1875rem 0.3125rem;
			border-radius: 0.25rem;
		}
	}

	@media (min-width: 1024px) {
		.month-event-more {
			font-size: 0.75rem;
			padding: 0.25rem 0.375rem;
		}
	}

	:global(.dark) .month-event-more {
		color: rgb(148 163 184);
		background: rgb(51 65 85 / 0.6);
		border-color: rgb(71 85 105 / 0.6);
	}

	/* ========================================
	   KEYBOARD SHORTCUTS
	   ======================================== */
	.shortcuts-hint {
		@apply border-t px-3 py-1.5 text-xs;
		background: rgb(248 250 252);
		border-color: rgb(226 232 240);
		color: rgb(100 116 139);
	}

	@media (min-width: 768px) {
		.shortcuts-hint {
			@apply px-4 py-2;
		}
	}

	:global(.dark) .shortcuts-hint {
		background: rgb(15 23 42);
		border-color: rgb(51 65 85);
		color: rgb(148 163 184);
	}

	.shortcuts-label {
		@apply font-medium;
	}

	.shortcut {
		margin-left: 0.5rem;
	}

	@media (min-width: 768px) {
		.shortcut {
			margin-left: 0.75rem;
		}
	}

	/* ========================================
	   AVAILABLE SLOTS
	   ======================================== */
	.available-slot {
		@apply absolute cursor-pointer rounded-lg border-2 border-dashed text-center transition-all duration-200;
		left: 2px;
		right: 2px;
		background: rgb(209 250 229 / 0.5);
		border-color: rgb(52 211 153);
		z-index: 5;
		display: flex;
		align-items: center;
		justify-content: center;
		animation: slot-fade-in 200ms ease-out;
	}

	@media (min-width: 768px) {
		.available-slot {
			left: 4px;
			right: 4px;
		}
	}

	.available-slot:hover {
		background: rgb(209 250 229 / 0.7);
		border-color: rgb(16 185 129);
		box-shadow:
			0 2px 4px rgb(0 0 0 / 0.1),
			0 4px 8px rgb(16 185 129 / 0.15);
		transform: translateY(-1px) scaleY(1.02);
		z-index: 15;
	}

	.available-slot:active {
		transform: translateY(0) scaleY(1);
	}

	:global(.dark) .available-slot {
		background: rgb(6 78 59 / 0.3);
		border-color: rgb(52 211 153);
	}

	:global(.dark) .available-slot:hover {
		background: rgb(6 78 59 / 0.4);
		border-color: rgb(16 185 129);
	}

	/* Slot duration text */
	.slot-duration-text {
		@apply font-medium;
		font-size: 0.6875rem;
		color: rgb(5 150 105);
		pointer-events: none;
	}

	:global(.dark) .slot-duration-text {
		color: rgb(167 243 208);
	}

	/* Slot tooltip (hidden by default, shown on hover) */
	.slot-tooltip {
		@apply absolute left-0 right-0 bottom-full mb-2 rounded-lg shadow-ink-strong;
		padding: 0.625rem 0.875rem;
		background: rgb(15 23 42);
		border: 1px solid rgb(51 65 85);
		opacity: 0;
		transform: translateY(4px) scale(0.95);
		transition: all 250ms cubic-bezier(0.4, 0, 0.2, 1);
		pointer-events: none;
		z-index: 50;
		min-width: 180px;
		max-width: 240px;
	}

	.available-slot:hover .slot-tooltip {
		opacity: 1;
		transform: translateY(0) scale(1);
	}

	.tooltip-title {
		@apply font-semibold mb-1;
		font-size: 0.75rem;
		color: rgb(167 243 208);
	}

	.tooltip-time {
		@apply font-medium mb-0.5;
		font-size: 0.6875rem;
		color: rgb(203 213 225);
	}

	.tooltip-duration {
		font-size: 0.6875rem;
		color: rgb(148 163 184);
		margin-bottom: 0.375rem;
	}

	.tooltip-action {
		font-size: 0.625rem;
		color: rgb(148 163 184);
		font-style: italic;
	}

	/* Slot fade-in animation */
	@keyframes slot-fade-in {
		from {
			opacity: 0;
			transform: scaleY(0.95);
		}
		to {
			opacity: 1;
			transform: scaleY(1);
		}
	}

	/* ========================================
	   MONTH VIEW - AVAILABLE SLOTS BADGE
	   ======================================== */
	.available-slots-badge {
		@apply absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold;
		background: rgb(16 185 129);
		color: white;
		box-shadow: 0 1px 3px rgb(0 0 0 / 0.2);
		z-index: 10;
	}

	:global(.dark) .available-slots-badge {
		background: rgb(52 211 153);
		color: rgb(6 78 59);
	}

	/* ========================================
	   ACCESSIBILITY & ANIMATIONS
	   ======================================== */
	@media (prefers-reduced-motion: reduce) {
		.time-blocks-calendar,
		.time-blocks-calendar * {
			animation-duration: 0.01ms !important;
			animation-iteration-count: 1 !important;
			transition-duration: 0.01ms !important;
		}
	}

	/* Focus styles for accessibility */
	.today-btn:focus-visible,
	.nav-btn:focus-visible,
	.view-toggle:focus-visible,
	.available-slot:focus-visible {
		outline: 2px solid rgb(59 130 246);
		outline-offset: 2px;
	}

	:global(.dark) .today-btn:focus-visible,
	:global(.dark) .nav-btn:focus-visible,
	:global(.dark) .view-toggle:focus-visible,
	:global(.dark) .available-slot:focus-visible {
		outline-color: rgb(96 165 250);
	}
</style>
