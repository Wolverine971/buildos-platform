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
	import Button from '$lib/components/ui/Button.svelte';
	import {
		formatTime,
		formatDate,
		getWeekDates,
		getMonthDates,
		parseLocalDate
	} from '$lib/utils/schedulingUtils';

	interface Props {
		viewMode?: 'day' | 'week' | 'month';
		currentDate?: Date;
		events?: any[];
		proposedSchedules?: any[];
		workingHours?: {
			work_start_time: string;
			work_end_time: string;
			working_days?: number[];
		};
		loading?: boolean;
		refreshing?: boolean;
		phaseStart?: Date | string | null;
		phaseEnd?: Date | string | null;
		highlightedTaskId?: string | null;
		ondateChange?: (date: Date) => void;
		onviewModeChange?: (mode: 'day' | 'week' | 'month') => void;
		onrefresh?: () => void;
		oneventClick?: (event: any) => void;
	}

	let {
		viewMode = 'week',
		currentDate = new Date(),
		events = [],
		proposedSchedules = [],
		workingHours = {
			work_start_time: '09:00',
			work_end_time: '17:00',
			working_days: [1, 2, 3, 4, 5]
		},
		loading = false,
		refreshing = false,
		phaseStart = null,
		phaseEnd = null,
		highlightedTaskId = null,
		ondateChange,
		onviewModeChange,
		onrefresh,
		oneventClick
	}: Props = $props();

	// Internal date state
	let internalDate = $state(new Date(currentDate));

	// Calculate effective date boundaries
	let effectivePhaseStart = $derived(phaseStart ? parseLocalDate(phaseStart) : null);
	let effectivePhaseEnd = $derived(phaseEnd ? parseLocalDate(phaseEnd) : null);

	// Sync internal date when prop changes
	$effect(() => {
		if (currentDate && currentDate.getTime() !== internalDate.getTime()) {
			internalDate = new Date(currentDate);
		}
	});

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

		ondateChange?.(internalDate);
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

		ondateChange?.(internalDate);
	}

	function handleRefresh() {
		onrefresh?.();
	}

	function changeViewMode(mode: 'day' | 'week' | 'month') {
		viewMode = mode;
		onviewModeChange?.(mode);
	}

	function handleEventClick(event: any) {
		console.log('[CalendarView] Event clicked:', {
			event,
			hasCalendarItem: !!event?.calendarItem,
			hasOriginalEvent: !!event?.originalEvent,
			calendarItemTaskId: event?.calendarItem?.task_id,
			calendarItemProjectId: event?.calendarItem?.project_id
		});
		oneventClick?.(event);
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
				const colorClass =
					typeof event.colorClass === 'string'
						? event.colorClass
						: 'bg-muted border border-border';
				const htmlLink = event.htmlLink ?? event.externalLink;
				dayEvents.push({
					type: 'existing',
					title: event.summary,
					start: eventStart,
					end: new Date(event.end?.dateTime || event.end?.date),
					color: colorClass,
					htmlLink,
					originalEvent: event,
					calendarItem: event.calendarItem
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
						? 'bg-accent/20 ring-2 ring-accent'
						: schedule.hasConflict
							? 'bg-destructive/10 border-destructive/40'
							: 'bg-accent/10 border-accent/40',
					schedule: schedule,
					isHighlighted
				});
			}
		}

		// Sort by start time
		dayEvents.sort((a, b) => a.start.getTime() - b.start.getTime());
		return dayEvents;
	}

	function calculateEventColumns(dayEvents: any[]): Map<number, any[]> {
		const columns: Map<number, any[]> = new Map();

		for (const event of dayEvents) {
			let columnIndex = 0;

			// Find the first available column where this event doesn't overlap
			while (columns.has(columnIndex)) {
				const eventsInColumn = columns.get(columnIndex) || [];
				let hasOverlap = false;

				for (const existingEvent of eventsInColumn) {
					// Check if events overlap
					if (!(event.end <= existingEvent.start || event.start >= existingEvent.end)) {
						hasOverlap = true;
						break;
					}
				}

				if (!hasOverlap) break;
				columnIndex++;
			}

			if (!columns.has(columnIndex)) {
				columns.set(columnIndex, []);
			}
			columns.get(columnIndex)!.push(event);
		}

		return columns;
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
	let canNavigateBack = $derived(!effectivePhaseStart || internalDate > effectivePhaseStart);
	let canNavigateForward = $derived(!effectivePhaseEnd || internalDate < effectivePhaseEnd);

	const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
</script>

<div class="flex flex-col h-full">
	<!-- View Controls -->
	<div
		class="flex flex-col sm:flex-row items-start sm:items-center justify-between px-3 py-2 border-b border-border gap-2 bg-muted/30 tx tx-strip tx-weak"
	>
		<div class="flex items-center gap-1.5 flex-1 min-w-0">
			<Button
				onclick={() => navigatePeriod(-1)}
				variant="ghost"
				size="sm"
				class="p-1 shrink-0"
				disabled={!canNavigateBack}
			>
				<ChevronLeft class="w-4 h-4 shrink-0" />
			</Button>

			<span class="text-sm font-semibold text-foreground min-w-0 text-center flex-1 truncate">
				{formatDisplayDate()}
			</span>

			<Button
				onclick={() => navigatePeriod(1)}
				variant="ghost"
				size="sm"
				class="p-1 shrink-0"
				disabled={!canNavigateForward}
			>
				<ChevronRight class="w-4 h-4 shrink-0" />
			</Button>

			<Button
				onclick={goToToday}
				variant="outline"
				size="sm"
				class="px-2 py-1 text-xs ml-1 pressable"
			>
				Today
			</Button>
		</div>

		<div class="flex items-center gap-1.5">
			<Button
				onclick={handleRefresh}
				disabled={refreshing || loading}
				variant="ghost"
				size="sm"
				class="p-1"
				title="Refresh calendar data"
			>
				<RefreshCw class="w-4 h-4 shrink-0 {refreshing ? 'animate-spin' : ''}" />
			</Button>

			<div
				class="flex items-center gap-0.5 bg-muted rounded-lg p-0.5 border border-border shadow-ink-inner"
			>
				<Button
					onclick={() => changeViewMode('day')}
					variant={viewMode === 'day' ? 'primary' : 'ghost'}
					size="sm"
					class="px-2.5 py-1 text-xs pressable"
				>
					Day
				</Button>
				<Button
					onclick={() => changeViewMode('week')}
					variant={viewMode === 'week' ? 'primary' : 'ghost'}
					size="sm"
					class="px-2.5 py-1 text-xs pressable"
				>
					Week
				</Button>
				<Button
					onclick={() => changeViewMode('month')}
					variant={viewMode === 'month' ? 'primary' : 'ghost'}
					size="sm"
					class="px-2.5 py-1 text-xs pressable"
				>
					Month
				</Button>
			</div>
		</div>
	</div>

	<!-- Calendar Content -->
	<div class="flex-1 overflow-auto p-3">
		{#if loading}
			<div class="flex items-center justify-center h-full">
				<div class="flex flex-col items-center gap-2">
					<Calendar class="w-10 h-10 text-muted-foreground animate-pulse" />
					<span class="text-xs text-muted-foreground">Loading calendar...</span>
				</div>
			</div>
		{:else if viewMode === 'day'}
			<!-- Day View -->
			<div class="max-w-2xl mx-auto space-y-2">
				{#each getEventsForDay(internalDate) as event}
					<button
						onclick={() => handleEventClick(event)}
						class="w-full text-left px-3 py-2.5 rounded-lg border border-border transition-colors hover:border-accent/50 hover:shadow-ink shadow-ink pressable tx tx-grain tx-weak {event.color}"
					>
						<div class="flex items-center justify-between gap-2">
							<div class="flex-1 min-w-0">
								<div class="flex items-center gap-2">
									<h4 class="text-sm font-medium text-foreground truncate">
										{event.title}
									</h4>
									{#if event.type === 'existing' && event.htmlLink}
										<ExternalLink
											class="w-3.5 h-3.5 text-muted-foreground shrink-0"
										/>
									{/if}
								</div>
								<p class="text-xs text-muted-foreground mt-0.5">
									{formatTime(event.start)} – {formatTime(event.end)}
								</p>
								{#if event.type === 'proposed' && event.schedule?.hasConflict}
									<p class="text-xs text-destructive mt-0.5">
										{event.schedule.conflictReason}
									</p>
								{/if}
							</div>
							{#if event.type === 'proposed'}
								<Clock class="w-4 h-4 text-muted-foreground shrink-0" />
							{/if}
						</div>
					</button>
				{/each}

				{#if getEventsForDay(internalDate).length === 0}
					<div class="text-center py-8 text-muted-foreground">
						<Calendar class="w-10 h-10 mx-auto mb-2 opacity-40" />
						<p class="text-sm">No events scheduled for this day</p>
					</div>
				{/if}
			</div>
		{:else if viewMode === 'week'}
			<!-- Week View - Desktop: Grid, Mobile: Card-based list -->
			<div
				class="hidden md:grid grid-cols-8 gap-px bg-border rounded-lg overflow-hidden shadow-ink tx tx-frame tx-weak"
			>
				<!-- Time column -->
				<div class="bg-muted/50">
					<div class="h-10 border-b border-border"></div>
					{#each Array(parseInt(workingHours.work_end_time.split(':')[0]) - parseInt(workingHours.work_start_time.split(':')[0])) as _, i}
						<div
							class="h-16 px-1.5 py-1 text-[10px] text-muted-foreground border-b border-border tabular-nums"
						>
							{parseInt(workingHours.work_start_time.split(':')[0]) + i}:00
						</div>
					{/each}
				</div>

				<!-- Day columns -->
				{#each getWeekDates(internalDate) as date, i}
					{@const dayEvents = getEventsForDay(date)}
					{@const eventColumns = calculateEventColumns(dayEvents)}
					{@const columnCount = eventColumns.size || 1}
					{@const isToday = date.toDateString() === new Date().toDateString()}
					<div class="bg-card {isToday ? 'bg-accent/[0.03]' : ''}">
						<div class="h-10 px-1.5 py-1 border-b border-border text-center">
							<div class="text-[10px] uppercase tracking-wide text-muted-foreground">
								{dayNames[date.getDay()]}
							</div>
							<div
								class="text-sm font-semibold leading-tight {isToday
									? 'text-accent'
									: 'text-foreground'}"
							>
								{date.getDate()}
							</div>
						</div>
						<div
							class="relative"
							style="height: {(parseInt(workingHours.work_end_time.split(':')[0]) -
								parseInt(workingHours.work_start_time.split(':')[0])) *
								64}px"
						>
							{#each Array.from(eventColumns.entries()) as [columnIndex, eventsInColumn]}
								{#each eventsInColumn as event}
									{@const left = (columnIndex / columnCount) * 100}
									{@const width = 100 / columnCount - 4}
									<button
										onclick={() => handleEventClick(event)}
										class="absolute px-1 py-0.5 rounded-sm text-[10px] leading-tight overflow-hidden transition-all hover:opacity-90 hover:shadow-ink pressable border border-transparent {event.color}"
										style="left: {left + 2}%; right: {100 -
											(left + width + 2)}%; top: {getTimePosition(
											event.start
										)}%; height: {Math.max(
											5,
											getTimePosition(event.end) -
												getTimePosition(event.start)
										)}%"
									>
										<div class="font-medium truncate">{event.title}</div>
										<div class="opacity-70 tabular-nums">
											{formatTime(event.start)}
										</div>
									</button>
								{/each}
							{/each}
						</div>
					</div>
				{/each}
			</div>

			<!-- Mobile Week View - Card-based layout -->
			<div class="md:hidden space-y-2">
				{#each getWeekDates(internalDate) as date}
					{@const dayEvents = getEventsForDay(date)}
					{@const isToday = date.toDateString() === new Date().toDateString()}
					<div
						class="rounded-lg border shadow-ink {isToday
							? 'border-accent/50 bg-accent/[0.03]'
							: 'border-border bg-card'} p-2.5"
					>
						<div class="mb-1.5 flex items-center justify-between">
							<div class="flex items-baseline gap-2">
								<div
									class="text-base font-semibold tabular-nums {isToday
										? 'text-accent'
										: 'text-foreground'}"
								>
									{date.getDate()}
								</div>
								<div
									class="text-[10px] uppercase tracking-wide text-muted-foreground"
								>
									{dayNames[date.getDay()]}
								</div>
							</div>
							{#if isToday}
								<span
									class="inline-block rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-accent-foreground"
								>
									Today
								</span>
							{/if}
						</div>
						{#if dayEvents.length > 0}
							<div class="space-y-1 border-t border-border pt-1.5">
								{#each dayEvents as event}
									<button
										onclick={() => handleEventClick(event)}
										class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted pressable {event.color}"
									>
										<div class="flex-1 min-w-0">
											<div
												class="text-sm font-medium text-foreground truncate"
											>
												{event.title}
											</div>
											<div class="text-xs text-muted-foreground tabular-nums">
												{formatTime(event.start)}
												{#if event.end && event.start.getTime() !== event.end.getTime()}
													– {formatTime(event.end)}
												{/if}
											</div>
										</div>
									</button>
								{/each}
							</div>
						{:else}
							<div
								class="border-t border-border pt-1.5 text-center text-[10px] text-muted-foreground"
							>
								No events
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{:else}
			<!-- Month View - Desktop: Grid, Mobile: List -->
			<div
				class="hidden md:grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden shadow-ink tx tx-frame tx-weak"
			>
				{#each dayNames as day}
					<div
						class="bg-muted/50 px-1.5 py-1.5 text-center text-[10px] uppercase tracking-wide font-medium text-muted-foreground"
					>
						{day}
					</div>
				{/each}

				{#each getMonthDates(internalDate) as date}
					{@const dayEvents = getEventsForDay(date)}
					{@const isCurrentMonth = date.getMonth() === internalDate.getMonth()}
					{@const isToday = date.toDateString() === new Date().toDateString()}
					<div
						class="bg-card p-1.5 min-h-[88px] {!isCurrentMonth
							? 'opacity-40'
							: ''} {isToday
							? 'ring-1 ring-inset ring-accent/50 bg-accent/[0.03]'
							: ''}"
					>
						<div
							class="text-xs font-semibold tabular-nums mb-1 {isToday
								? 'text-accent'
								: 'text-foreground'}"
						>
							{date.getDate()}
						</div>
						<div class="space-y-0.5">
							{#each dayEvents.slice(0, 3) as event}
								<button
									onclick={() => handleEventClick(event)}
									class="w-full text-[10px] leading-tight px-1 py-0.5 rounded-sm truncate text-left transition-all hover:opacity-90 hover:shadow-ink pressable {event.color}"
								>
									<span class="truncate">{event.title}</span>
								</button>
							{/each}
							{#if dayEvents.length > 3}
								<div class="text-[10px] text-muted-foreground pl-1">
									+{dayEvents.length - 3} more
								</div>
							{/if}
						</div>
					</div>
				{/each}
			</div>

			<!-- Mobile Month View - Card-based layout -->
			<div class="md:hidden space-y-1.5">
				{#each getMonthDates(internalDate) as date}
					{@const dayEvents = getEventsForDay(date)}
					{@const isCurrentMonth = date.getMonth() === internalDate.getMonth()}
					{@const isToday = date.toDateString() === new Date().toDateString()}
					{#if isCurrentMonth && dayEvents.length > 0}
						<div
							class="rounded-lg border shadow-ink {isToday
								? 'border-accent/50 bg-accent/[0.03]'
								: 'border-border bg-card'} p-2.5"
						>
							<div class="mb-1.5 flex items-center justify-between">
								<div class="flex items-baseline gap-2">
									<div
										class="text-base font-semibold tabular-nums {isToday
											? 'text-accent'
											: 'text-foreground'}"
									>
										{date.getDate()}
									</div>
									<div
										class="text-[10px] uppercase tracking-wide text-muted-foreground"
									>
										{dayNames[date.getDay()]}
									</div>
								</div>
								{#if isToday}
									<span
										class="inline-block rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-accent-foreground"
									>
										Today
									</span>
								{/if}
							</div>
							<div class="space-y-0.5 border-t border-border pt-1.5">
								{#each dayEvents as event}
									<button
										onclick={() => handleEventClick(event)}
										class="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs transition-colors hover:bg-muted pressable {event.color}"
									>
										<div
											class="flex-1 min-w-0 truncate text-foreground font-medium"
										>
											{event.title}
										</div>
									</button>
								{/each}
								{#if dayEvents.length > 3}
									<div class="text-[10px] text-muted-foreground px-1.5 pt-0.5">
										+{dayEvents.length - 3} more
									</div>
								{/if}
							</div>
						</div>
					{/if}
				{/each}
			</div>
		{/if}
	</div>
</div>
