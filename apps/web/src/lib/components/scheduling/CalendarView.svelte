<!-- apps/web/src/lib/components/scheduling/CalendarView.svelte -->
<script lang="ts">
	import {
		ChevronLeft,
		ChevronRight,
		Clock,
		ExternalLink,
		Calendar,
		RefreshCw
	} from 'lucide-svelte';
	import { createEventDispatcher } from 'svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import {
		formatTime,
		formatDate,
		getWeekDates,
		getMonthDates,
		parseLocalDate
	} from '$lib/utils/schedulingUtils';

	export let viewMode: 'day' | 'week' | 'month' = 'week';
	export let currentDate = new Date();
	export let events: any[] = [];
	export let proposedSchedules: any[] = [];
	export let workingHours = {
		work_start_time: '09:00',
		work_end_time: '17:00',
		working_days: [1, 2, 3, 4, 5]
	};
	export let loading = false;
	export let refreshing = false;
	export let phaseStart: Date | string | null = null;
	export let phaseEnd: Date | string | null = null;
	export let highlightedTaskId: string | null = null;

	const dispatch = createEventDispatcher();

	// Internal date state
	let internalDate = new Date(currentDate);

	// Sync internal date when prop changes
	$: if (currentDate && currentDate.getTime() !== internalDate.getTime()) {
		internalDate = new Date(currentDate);
	}

	// Calculate effective date boundaries
	$: effectivePhaseStart = phaseStart ? parseLocalDate(phaseStart) : null;
	$: effectivePhaseEnd = phaseEnd ? parseLocalDate(phaseEnd) : null;

	function navigatePeriod(direction: 1 | -1) {
		const newDate = new Date(internalDate);

		switch (viewMode) {
			case 'day':
				newDate.setDate(newDate.getDate() + direction);
				break;
			case 'week':
				newDate.setDate(newDate.getDate() + 7 * direction);
				break;
			case 'month':
				newDate.setMonth(newDate.getMonth() + direction);
				break;
		}

		// Constrain to phase boundaries if provided
		if (effectivePhaseStart && newDate < effectivePhaseStart) {
			internalDate = new Date(effectivePhaseStart);
		} else if (effectivePhaseEnd && newDate > effectivePhaseEnd) {
			internalDate = new Date(effectivePhaseEnd);
		} else {
			internalDate = newDate;
		}

		dispatch('dateChange', { date: internalDate });
	}

	function goToToday() {
		const now = new Date();

		// Constrain to phase boundaries if provided
		if (effectivePhaseStart && now < effectivePhaseStart) {
			internalDate = new Date(effectivePhaseStart);
		} else if (effectivePhaseEnd && now > effectivePhaseEnd) {
			internalDate = new Date(effectivePhaseEnd);
		} else {
			internalDate = now;
		}

		dispatch('dateChange', { date: internalDate });
	}

	function handleRefresh() {
		dispatch('refresh');
	}

	function changeViewMode(mode: 'day' | 'week' | 'month') {
		viewMode = mode;
		dispatch('viewModeChange', { mode });
	}

	function handleEventClick(event: any) {
		dispatch('eventClick', { event });
	}

	function getEventsForDay(date: Date): any[] {
		const dayStart = new Date(date);
		dayStart.setHours(0, 0, 0, 0);
		const dayEnd = new Date(date);
		dayEnd.setHours(23, 59, 59, 999);

		const dayEvents = [];

		// Add existing calendar events
		for (const event of events) {
			const eventStart = new Date(event.start?.dateTime || event.start?.date);
			if (eventStart >= dayStart && eventStart <= dayEnd) {
				dayEvents.push({
					type: 'existing',
					title: event.summary,
					start: eventStart,
					end: new Date(event.end?.dateTime || event.end?.date),
					color: 'bg-gray-200 dark:bg-gray-700',
					htmlLink: event.htmlLink,
					originalEvent: event
				});
			}
		}

		// Add proposed task schedules
		for (const schedule of proposedSchedules) {
			if (!schedule?.task?.title) continue;

			const scheduleStart = new Date(schedule.proposedStart);
			if (scheduleStart >= dayStart && scheduleStart <= dayEnd) {
				const isHighlighted = highlightedTaskId === schedule.task.id;

				dayEvents.push({
					type: 'proposed',
					title: schedule.task.title,
					start: scheduleStart,
					end: new Date(schedule.proposedEnd),
					color: isHighlighted
						? 'bg-primary-200 dark:bg-primary-700 ring-2 ring-primary-500'
						: schedule.hasConflict
							? 'bg-amber-100 dark:bg-amber-900/30 border-amber-400'
							: 'bg-primary-100 dark:bg-primary-900/30 border-primary-500',
					schedule: schedule,
					isHighlighted
				});
			}
		}

		// Sort by start time
		dayEvents.sort((a, b) => a.start.getTime() - b.start.getTime());
		return dayEvents;
	}

	function getTimePosition(date: Date): number {
		const hours = date.getHours() + date.getMinutes() / 60;
		const workStart = parseInt(workingHours.work_start_time.split(':')[0]);
		const workEnd = parseInt(workingHours.work_end_time.split(':')[0]);
		const workDuration = workEnd - workStart;
		return ((hours - workStart) / workDuration) * 100;
	}

	function formatDisplayDate(): string {
		if (viewMode === 'day') {
			return formatDate(internalDate) + ', ' + internalDate.getFullYear();
		} else if (viewMode === 'week') {
			const weekDates = getWeekDates(internalDate);
			return `Week of ${formatDate(weekDates[0])}`;
		} else {
			const monthNames = [
				'January',
				'February',
				'March',
				'April',
				'May',
				'June',
				'July',
				'August',
				'September',
				'October',
				'November',
				'December'
			];
			return monthNames[internalDate.getMonth()] + ' ' + internalDate.getFullYear();
		}
	}

	// Check if navigation buttons should be disabled
	$: canNavigateBack = !effectivePhaseStart || internalDate > effectivePhaseStart;
	$: canNavigateForward = !effectivePhaseEnd || internalDate < effectivePhaseEnd;

	const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
</script>

<div class="flex flex-col h-full">
	<!-- View Controls -->
	<div
		class="flex flex-col sm:flex-row items-start sm:items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 gap-3"
	>
		<div class="flex items-center gap-2 flex-1">
			<Button
				on:click={() => navigatePeriod(-1)}
				variant="ghost"
				size="sm"
				class="p-1.5"
				disabled={!canNavigateBack}
			>
				<ChevronLeft class="w-4 h-4 sm:w-5 sm:h-5" />
			</Button>

			<span
				class="text-sm sm:text-base font-medium text-gray-900 dark:text-white min-w-0 text-center flex-1 truncate"
			>
				{formatDisplayDate()}
			</span>

			<Button
				on:click={() => navigatePeriod(1)}
				variant="ghost"
				size="sm"
				class="p-1.5"
				disabled={!canNavigateForward}
			>
				<ChevronRight class="w-4 h-4 sm:w-5 sm:h-5" />
			</Button>

			<Button on:click={goToToday} variant="ghost" size="sm" class="px-2 py-1 text-xs">
				Today
			</Button>
		</div>

		<div class="flex items-center gap-2">
			<Button
				on:click={handleRefresh}
				disabled={refreshing || loading}
				variant="ghost"
				size="sm"
				class="p-1.5"
				title="Refresh calendar data"
			>
				<RefreshCw class="w-4 h-4 sm:w-5 sm:h-5 {refreshing ? 'animate-spin' : ''}" />
			</Button>

			<div class="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
				<Button
					on:click={() => changeViewMode('day')}
					variant={viewMode === 'day' ? 'primary' : 'ghost'}
					size="sm"
					class="px-2 sm:px-3 py-1.5 text-xs sm:text-sm"
				>
					Day
				</Button>
				<Button
					on:click={() => changeViewMode('week')}
					variant={viewMode === 'week' ? 'primary' : 'ghost'}
					size="sm"
					class="px-2 sm:px-3 py-1.5 text-xs sm:text-sm"
				>
					Week
				</Button>
				<Button
					on:click={() => changeViewMode('month')}
					variant={viewMode === 'month' ? 'primary' : 'ghost'}
					size="sm"
					class="px-2 sm:px-3 py-1.5 text-xs sm:text-sm"
				>
					Month
				</Button>
			</div>
		</div>
	</div>

	<!-- Calendar Content -->
	<div class="flex-1 overflow-auto p-4">
		{#if loading}
			<div class="flex items-center justify-center h-full">
				<div class="flex flex-col items-center gap-3">
					<Calendar class="w-12 h-12 text-gray-400 animate-pulse" />
					<span class="text-gray-500 dark:text-gray-400">Loading calendar...</span>
				</div>
			</div>
		{:else if viewMode === 'day'}
			<!-- Day View -->
			<div class="max-w-2xl mx-auto space-y-3">
				{#each getEventsForDay(internalDate) as event}
					<button
						on:click={() => handleEventClick(event)}
						class="w-full text-left p-4 rounded-lg border transition-colors hover:shadow-md {event.type ===
						'proposed'
							? 'border-primary-200 dark:border-primary-800'
							: 'border-gray-200 dark:border-gray-700'} {event.color}"
					>
						<div class="flex items-center justify-between">
							<div class="flex-1">
								<div class="flex items-center gap-2">
									<h4 class="font-medium text-gray-900 dark:text-white">
										{event.title}
									</h4>
									{#if event.type === 'existing'}
										<ExternalLink class="w-4 h-4 text-gray-500" />
									{/if}
								</div>
								<p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
									{formatTime(event.start)} - {formatTime(event.end)}
								</p>
								{#if event.type === 'proposed' && event.schedule?.hasConflict}
									<p class="text-sm text-rose-600 dark:text-rose-400 mt-1">
										⚠️ {event.schedule.conflictReason}
									</p>
								{/if}
							</div>
							{#if event.type === 'proposed'}
								<Clock class="w-5 h-5 text-gray-400" />
							{/if}
						</div>
					</button>
				{/each}

				{#if getEventsForDay(internalDate).length === 0}
					<div class="text-center py-12 text-gray-500 dark:text-gray-400">
						<Calendar class="w-12 h-12 mx-auto mb-3 opacity-50" />
						<p>No events scheduled for this day</p>
					</div>
				{/if}
			</div>
		{:else if viewMode === 'week'}
			<!-- Week View -->
			<div
				class="grid grid-cols-8 gap-px bg-gray-200 dark:bg-gray-700 rounded-lg overflow-hidden min-w-[640px]"
			>
				<!-- Time column -->
				<div class="bg-gray-50 dark:bg-gray-800">
					<div class="h-12 border-b border-gray-200 dark:border-gray-700"></div>
					{#each Array(parseInt(workingHours.work_end_time.split(':')[0]) - parseInt(workingHours.work_start_time.split(':')[0])) as _, i}
						<div
							class="h-20 p-2 text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700"
						>
							{parseInt(workingHours.work_start_time.split(':')[0]) + i}:00
						</div>
					{/each}
				</div>

				<!-- Day columns -->
				{#each getWeekDates(internalDate) as date, i}
					{@const dayEvents = getEventsForDay(date)}
					<div class="bg-white dark:bg-gray-900">
						<div
							class="h-12 p-2 border-b border-gray-200 dark:border-gray-700 text-center"
						>
							<div class="text-xs text-gray-500 dark:text-gray-400">
								{dayNames[date.getDay()]}
							</div>
							<div
								class="text-sm font-medium {date.toDateString() ===
								new Date().toDateString()
									? 'text-primary-600 dark:text-primary-400'
									: 'text-gray-900 dark:text-white'}"
							>
								{date.getDate()}
							</div>
						</div>
						<div
							class="relative"
							style="height: {(parseInt(workingHours.work_end_time.split(':')[0]) -
								parseInt(workingHours.work_start_time.split(':')[0])) *
								80}px"
						>
							{#each dayEvents as event}
								<button
									on:click={() => handleEventClick(event)}
									class="absolute left-1 right-1 p-1 rounded text-xs overflow-hidden transition-opacity hover:opacity-90 {event.color}"
									style="top: {getTimePosition(event.start)}%; height: {Math.max(
										5,
										getTimePosition(event.end) - getTimePosition(event.start)
									)}%"
								>
									<div class="font-medium truncate">{event.title}</div>
									<div class="text-xs opacity-75">
										{formatTime(event.start)}
									</div>
								</button>
							{/each}
						</div>
					</div>
				{/each}
			</div>
		{:else}
			<!-- Month View -->
			<div
				class="grid grid-cols-7 gap-px bg-gray-200 dark:bg-gray-700 rounded-lg overflow-hidden"
			>
				{#each dayNames as day}
					<div
						class="bg-gray-50 dark:bg-gray-800 p-2 text-center text-sm font-medium text-gray-700 dark:text-gray-300"
					>
						{day}
					</div>
				{/each}

				{#each getMonthDates(internalDate) as date}
					{@const dayEvents = getEventsForDay(date)}
					{@const isCurrentMonth = date.getMonth() === internalDate.getMonth()}
					{@const isToday = date.toDateString() === new Date().toDateString()}
					<div
						class="bg-white dark:bg-gray-900 p-2 min-h-[100px] {!isCurrentMonth
							? 'opacity-50'
							: ''} {isToday ? 'ring-2 ring-primary-500' : ''}"
					>
						<div class="text-sm font-medium text-gray-900 dark:text-white mb-1">
							{date.getDate()}
						</div>
						<div class="space-y-1">
							{#each dayEvents.slice(0, 3) as event}
								<button
									on:click={() => handleEventClick(event)}
									class="w-full text-xs p-1 rounded truncate text-left transition-opacity hover:opacity-90 {event.color}"
								>
									<span class="truncate">{event.title}</span>
								</button>
							{/each}
							{#if dayEvents.length > 3}
								<div class="text-xs text-gray-500 dark:text-gray-400 pl-1">
									+{dayEvents.length - 3} more
								</div>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>
