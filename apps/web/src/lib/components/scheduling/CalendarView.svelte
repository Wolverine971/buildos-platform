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

	interface CalendarDateValue {
		dateTime?: string | null;
		date?: string | null;
	}

	interface CalendarViewEvent {
		summary?: string | null;
		start?: CalendarDateValue | null;
		end?: CalendarDateValue | null;
		htmlLink?: string | null;
		externalLink?: string | null;
		colorClass?: string | null;
		allDay?: boolean | null;
		all_day?: boolean | null;
		itemType?: string | null;
		itemKind?: string | null;
		calendarItem?: any;
	}

	interface CalendarDayEvent {
		type: 'existing' | 'proposed';
		title: string;
		start: Date;
		end: Date;
		displayEnd: Date;
		color: string;
		htmlLink?: string | null;
		originalEvent?: CalendarViewEvent;
		calendarItem?: any;
		schedule?: any;
		isHighlighted?: boolean;
		allDay: boolean;
		spansMultipleDays: boolean;
		continuesBefore: boolean;
		continuesAfter: boolean;
	}

	interface MonthEventSegment {
		id: string;
		event: CalendarDayEvent;
		startCol: number;
		endCol: number;
		colSpan: number;
		lane: number;
		continuesBefore: boolean;
		continuesAfter: boolean;
	}

	interface Props {
		viewMode?: 'day' | 'week' | 'month';
		currentDate?: Date;
		events?: CalendarViewEvent[];
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

	function getDayBounds(date: Date): { start: Date; end: Date } {
		const start = new Date(date);
		start.setHours(0, 0, 0, 0);
		const end = new Date(start);
		end.setDate(end.getDate() + 1);
		return { start, end };
	}

	function addLocalDays(date: Date, days: number): Date {
		const next = new Date(date);
		next.setDate(next.getDate() + days);
		return next;
	}

	function parseCalendarDateValue(value: string | Date | null | undefined): Date | null {
		if (!value) return null;
		const parsed = parseLocalDate(value);
		return Number.isNaN(parsed.getTime()) ? null : parsed;
	}

	function normalizeEventDates(
		startValue: string | Date | null | undefined,
		endValue: string | Date | null | undefined,
		allDay: boolean
	): { start: Date; end: Date; displayEnd: Date } | null {
		const start = parseCalendarDateValue(startValue);
		if (!start) return null;

		const parsedEnd = parseCalendarDateValue(endValue);
		let end = parsedEnd && parsedEnd > start ? parsedEnd : null;
		if (!end) {
			end = allDay ? addLocalDays(start, 1) : new Date(start.getTime() + 30 * 60 * 1000);
		}

		let displayEnd = end;
		if (allDay && end > start) {
			displayEnd = new Date(end.getTime() - 1);
			if (displayEnd < start) displayEnd = start;
		}

		return { start, end, displayEnd };
	}

	function isSameLocalDay(a: Date, b: Date): boolean {
		return (
			a.getFullYear() === b.getFullYear() &&
			a.getMonth() === b.getMonth() &&
			a.getDate() === b.getDate()
		);
	}

	function eventOverlapsDay(start: Date, end: Date, date: Date): boolean {
		const { start: dayStart, end: dayEnd } = getDayBounds(date);
		return start < dayEnd && end > dayStart;
	}

	function buildDayEvent(
		date: Date,
		input: {
			type: 'existing' | 'proposed';
			title: string;
			startValue: string | Date | null | undefined;
			endValue: string | Date | null | undefined;
			color: string;
			allDay?: boolean | null;
			htmlLink?: string | null;
			originalEvent?: CalendarViewEvent;
			calendarItem?: any;
			schedule?: any;
			isHighlighted?: boolean;
		}
	): CalendarDayEvent | null {
		const allDay = Boolean(input.allDay);
		const normalized = normalizeEventDates(input.startValue, input.endValue, allDay);
		if (!normalized || !eventOverlapsDay(normalized.start, normalized.end, date)) return null;

		const { start: dayStart, end: dayEnd } = getDayBounds(date);
		const spansMultipleDays = !isSameLocalDay(normalized.start, normalized.displayEnd);

		return {
			type: input.type,
			title: input.title,
			start: normalized.start,
			end: normalized.end,
			displayEnd: normalized.displayEnd,
			color: input.color,
			htmlLink: input.htmlLink,
			originalEvent: input.originalEvent,
			calendarItem: input.calendarItem,
			schedule: input.schedule,
			isHighlighted: input.isHighlighted,
			allDay,
			spansMultipleDays,
			continuesBefore: normalized.start < dayStart,
			continuesAfter: normalized.end > dayEnd
		};
	}

	function getEventsForDay(date: Date): CalendarDayEvent[] {
		const dayEvents: CalendarDayEvent[] = [];

		for (const event of events) {
			const colorClass =
				typeof event.colorClass === 'string'
					? event.colorClass
					: 'bg-muted border border-border';
			const htmlLink = event.htmlLink ?? event.externalLink;
			const allDay = event.allDay ?? event.all_day ?? event.calendarItem?.all_day ?? false;
			const dayEvent = buildDayEvent(date, {
				type: 'existing',
				title: event.summary || '(Untitled)',
				startValue: event.start?.dateTime || event.start?.date,
				endValue: event.end?.dateTime || event.end?.date,
				color: colorClass,
				allDay,
				htmlLink,
				originalEvent: event,
				calendarItem: event.calendarItem
			});
			if (dayEvent) dayEvents.push(dayEvent);
		}

		for (const schedule of proposedSchedules) {
			if (!schedule?.task?.title) continue;

			const isHighlighted = highlightedTaskId === schedule.task.id;
			const dayEvent = buildDayEvent(date, {
				type: 'proposed',
				title: schedule.task.title,
				startValue: schedule.proposedStart,
				endValue: schedule.proposedEnd,
				color: isHighlighted
					? 'bg-accent/20 ring-2 ring-accent'
					: schedule.hasConflict
						? 'bg-destructive/10 border-destructive/40'
						: 'bg-accent/10 border-accent/40',
				schedule,
				isHighlighted
			});
			if (dayEvent) dayEvents.push(dayEvent);
		}

		dayEvents.sort((a, b) => {
			const aMulti = shouldRenderInAllDayLane(a) ? 0 : 1;
			const bMulti = shouldRenderInAllDayLane(b) ? 0 : 1;
			if (aMulti !== bMulti) return aMulti - bMulti;
			return a.start.getTime() - b.start.getTime();
		});
		return dayEvents;
	}

	function calculateEventColumns(dayEvents: CalendarDayEvent[]): Map<number, CalendarDayEvent[]> {
		const columns: Map<number, CalendarDayEvent[]> = new Map();

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

	function shouldRenderInAllDayLane(event: CalendarDayEvent): boolean {
		return event.allDay || event.spansMultipleDays;
	}

	function getAllDayLaneEvents(dayEvents: CalendarDayEvent[]): CalendarDayEvent[] {
		return dayEvents.filter(shouldRenderInAllDayLane);
	}

	function getTimedEvents(dayEvents: CalendarDayEvent[]): CalendarDayEvent[] {
		return dayEvents.filter((event) => !shouldRenderInAllDayLane(event));
	}

	function formatShortDate(date: Date): string {
		return date.toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric'
		});
	}

	function getEventRangeLabel(event: CalendarDayEvent): string {
		if (event.allDay) {
			if (event.spansMultipleDays) {
				return `${formatShortDate(event.start)} - ${formatShortDate(event.displayEnd)}`;
			}
			return 'All day';
		}

		if (event.spansMultipleDays) {
			return `${formatShortDate(event.start)} ${formatTime(event.start)} - ${formatShortDate(
				event.end
			)} ${formatTime(event.end)}`;
		}

		return `${formatTime(event.start)} - ${formatTime(event.end)}`;
	}

	function getEventDayLabel(event: CalendarDayEvent): string {
		if (event.allDay) {
			if (event.spansMultipleDays) return getEventRangeLabel(event);
			return 'All day';
		}

		if (event.spansMultipleDays) {
			if (event.continuesBefore && event.continuesAfter) return 'Continues all day';
			if (event.continuesBefore) return `Until ${formatTime(event.end)}`;
			if (event.continuesAfter) return `${formatTime(event.start)} onward`;
		}

		return getEventRangeLabel(event);
	}

	function getContinuationLabel(event: CalendarDayEvent): string | null {
		if (!shouldRenderInAllDayLane(event)) return null;
		if (event.continuesBefore && event.continuesAfter) return 'Continues';
		if (event.continuesBefore) return 'Ends';
		if (event.continuesAfter) return 'Starts';
		return null;
	}

	function getContinuationClass(event: CalendarDayEvent): string {
		if (!shouldRenderInAllDayLane(event)) return '';
		if (event.continuesBefore && event.continuesAfter) {
			return 'border-l-4 border-r-4 border-l-accent/50 border-r-accent/50';
		}
		if (event.continuesBefore) return 'border-l-4 border-l-accent/50';
		if (event.continuesAfter) return 'border-r-4 border-r-accent/50';
		return '';
	}

	function getEventIdentity(event: CalendarDayEvent): string {
		return (
			event.calendarItem?.calendar_item_id ||
			event.calendarItem?.event_id ||
			event.calendarItem?.task_id ||
			event.originalEvent?.calendarItem?.calendar_item_id ||
			event.schedule?.task?.id ||
			`${event.type}:${event.title}:${event.start.toISOString()}:${event.end.toISOString()}`
		);
	}

	function getMonthWeeks(date: Date): Date[][] {
		const dates = getMonthDates(date);
		const weeks: Date[][] = [];
		for (let i = 0; i < dates.length; i += 7) {
			weeks.push(dates.slice(i, i + 7));
		}
		return weeks;
	}

	function getMonthWeekSegments(weekDates: Date[]): MonthEventSegment[] {
		const segmentsById = new Map<
			string,
			{
				event: CalendarDayEvent;
				startCol: number;
				endCol: number;
			}
		>();

		weekDates.forEach((date, columnIndex) => {
			for (const event of getAllDayLaneEvents(getEventsForDay(date))) {
				const id = getEventIdentity(event);
				const existing = segmentsById.get(id);
				if (existing) {
					existing.startCol = Math.min(existing.startCol, columnIndex);
					existing.endCol = Math.max(existing.endCol, columnIndex);
				} else {
					segmentsById.set(id, {
						event,
						startCol: columnIndex,
						endCol: columnIndex
					});
				}
			}
		});

		const laneEnds: number[] = [];
		const weekStart = getDayBounds(weekDates[0] ?? new Date()).start;
		const weekEnd = getDayBounds(weekDates[weekDates.length - 1] ?? new Date()).end;

		return Array.from(segmentsById.entries())
			.map(([id, segment]) => ({ id, ...segment }))
			.sort((a, b) => {
				if (a.startCol !== b.startCol) return a.startCol - b.startCol;
				if (a.endCol !== b.endCol) return b.endCol - a.endCol;
				return a.event.start.getTime() - b.event.start.getTime();
			})
			.map((segment) => {
				let lane = laneEnds.findIndex((endCol) => segment.startCol > endCol);
				if (lane === -1) {
					lane = laneEnds.length;
				}
				laneEnds[lane] = segment.endCol;
				return {
					...segment,
					continuesBefore: segment.event.start < weekStart,
					continuesAfter: segment.event.end > weekEnd,
					lane,
					colSpan: segment.endCol - segment.startCol + 1
				};
			});
	}

	function getVisibleMonthSegments(segments: MonthEventSegment[]): MonthEventSegment[] {
		return segments.filter((segment) => segment.lane < 3);
	}

	function getMonthLaneCount(segments: MonthEventSegment[]): number {
		const visible = getVisibleMonthSegments(segments);
		if (visible.length === 0) return 0;
		return Math.max(...visible.map((segment) => segment.lane + 1));
	}

	function getHiddenSegmentCountForColumn(
		segments: MonthEventSegment[],
		columnIndex: number
	): number {
		return segments.filter(
			(segment) =>
				segment.lane >= 3 &&
				segment.startCol <= columnIndex &&
				segment.endCol >= columnIndex
		).length;
	}

	function getMonthTimedEventsForDay(date: Date): CalendarDayEvent[] {
		return getTimedEvents(getEventsForDay(date));
	}

	function getMonthSegmentTop(lane: number): number {
		return 30 + lane * 23;
	}

	function getMonthCellEventOffset(laneCount: number): number {
		return laneCount === 0 ? 8 : 8 + laneCount * 23;
	}

	function getMonthRowMinHeight(laneCount: number): number {
		return 104 + laneCount * 23;
	}

	function getMonthSegmentStyle(segment: MonthEventSegment): string {
		const radiusLeft = segment.continuesBefore ? '0' : '4px';
		const radiusRight = segment.continuesAfter ? '0' : '4px';
		const leftInset = segment.continuesBefore ? 0 : 6;
		const rightInset = segment.continuesAfter ? 0 : 6;
		const leftPercent = (segment.startCol / 7) * 100;
		const widthPercent = (segment.colSpan / 7) * 100;
		return [
			`left: calc(${leftPercent}% + ${leftInset}px)`,
			`width: calc(${widthPercent}% - ${leftInset + rightInset}px)`,
			`top: ${getMonthSegmentTop(segment.lane)}px`,
			`border-top-left-radius: ${radiusLeft}`,
			`border-bottom-left-radius: ${radiusLeft}`,
			`border-top-right-radius: ${radiusRight}`,
			`border-bottom-right-radius: ${radiusRight}`
		].join('; ');
	}

	function getMonthSegmentLabel(segment: MonthEventSegment): string {
		if (segment.event.allDay) return segment.event.title;
		return `${formatTime(segment.event.start)} ${segment.event.title}`;
	}

	function getTimePosition(date: Date): number {
		const hours = date.getHours() + date.getMinutes() / 60;
		const workStart = parseInt(workingHours.work_start_time.split(':')[0] ?? '9');
		const workEnd = parseInt(workingHours.work_end_time.split(':')[0] ?? '17');
		const workDuration = workEnd - workStart;
		return ((hours - workStart) / workDuration) * 100;
	}

	function formatDisplayDate(): string {
		if (viewMode === 'day') {
			return formatDate(internalDate) + ', ' + internalDate.getFullYear();
		} else if (viewMode === 'week') {
			const weekDates = getWeekDates(internalDate);
			return `Week of ${formatDate(weekDates[0] ?? internalDate)}`;
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
				{#each [getEventsForDay(internalDate)] as dayEvents}
					{@const allDayEvents = getAllDayLaneEvents(dayEvents)}
					{@const timedEvents = getTimedEvents(dayEvents)}

					{#if allDayEvents.length > 0}
						<div
							class="rounded-lg border border-border bg-muted/20 p-2 shadow-ink-inner"
						>
							<div
								class="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
							>
								<Calendar class="h-3 w-3" />
								<span>All-day and multi-day</span>
							</div>
							<div class="space-y-1">
								{#each allDayEvents as event}
									<button
										onclick={() => handleEventClick(event)}
										class="w-full text-left px-3 py-2 rounded-md border border-border transition-colors hover:border-accent/50 hover:shadow-ink pressable tx tx-grain tx-weak {event.color} {getContinuationClass(
											event
										)}"
									>
										<div class="flex items-center justify-between gap-2">
											<div class="min-w-0 flex-1">
												<div class="flex items-center gap-2">
													<h4
														class="text-sm font-medium text-foreground truncate"
													>
														{event.title}
													</h4>
													{#if event.type === 'existing' && event.htmlLink}
														<ExternalLink
															class="w-3.5 h-3.5 text-muted-foreground shrink-0"
														/>
													{/if}
												</div>
												<p class="text-xs text-muted-foreground mt-0.5">
													{#if getContinuationLabel(event)}
														<span class="font-medium"
															>{getContinuationLabel(event)}</span
														>
														<span> - </span>
													{/if}
													{getEventRangeLabel(event)}
												</p>
											</div>
										</div>
									</button>
								{/each}
							</div>
						</div>
					{/if}

					{#each timedEvents as event}
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
										{getEventDayLabel(event)}
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

					{#if dayEvents.length === 0}
						<div class="text-center py-8 text-muted-foreground">
							<Calendar class="w-10 h-10 mx-auto mb-2 opacity-40" />
							<p class="text-sm">No events scheduled for this day</p>
						</div>
					{/if}
				{/each}
			</div>
		{:else if viewMode === 'week'}
			<!-- Week View - Desktop: Grid, Mobile: Card-based list -->
			<div
				class="hidden md:grid grid-cols-8 gap-px bg-border rounded-lg overflow-hidden shadow-ink tx tx-frame tx-weak"
			>
				<!-- Time column -->
				<div class="bg-muted/50">
					<div class="h-10 border-b border-border"></div>
					<div
						class="h-[46px] border-b border-border px-1.5 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
					>
						All day
					</div>
					{#each Array(parseInt(workingHours.work_end_time.split(':')[0] ?? '17') - parseInt(workingHours.work_start_time.split(':')[0] ?? '9')) as _, i}
						<div
							class="h-16 px-1.5 py-1 text-[10px] text-muted-foreground border-b border-border tabular-nums"
						>
							{parseInt(workingHours.work_start_time.split(':')[0] ?? '9') + i}:00
						</div>
					{/each}
				</div>

				<!-- Day columns -->
				{#each getWeekDates(internalDate) as date, i}
					{@const dayEvents = getEventsForDay(date)}
					{@const allDayEvents = getAllDayLaneEvents(dayEvents)}
					{@const timedEvents = getTimedEvents(dayEvents)}
					{@const eventColumns = calculateEventColumns(timedEvents)}
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
							class="h-[46px] border-b border-border p-1 space-y-0.5 overflow-hidden"
						>
							{#each allDayEvents.slice(0, 2) as event}
								<button
									onclick={() => handleEventClick(event)}
									class="w-full px-1 py-0.5 rounded-sm text-[10px] leading-tight text-left truncate transition-all hover:opacity-90 hover:shadow-ink pressable {event.color} {getContinuationClass(
										event
									)}"
									title={`${event.title} - ${getEventDayLabel(event)}`}
								>
									<span class="font-medium"
										>{getContinuationLabel(event) || 'All day'}</span
									>
									<span class="opacity-70"> - </span>
									<span>{event.title}</span>
								</button>
							{/each}
							{#if allDayEvents.length > 2}
								<div class="text-[10px] text-muted-foreground pl-1">
									+{allDayEvents.length - 2} more
								</div>
							{/if}
						</div>
						<div
							class="relative"
							style="height: {(parseInt(
								workingHours.work_end_time.split(':')[0] ?? '17'
							) -
								parseInt(workingHours.work_start_time.split(':')[0] ?? '9')) *
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
										class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted pressable {event.color} {getContinuationClass(
											event
										)}"
									>
										<div class="flex-1 min-w-0">
											<div
												class="text-sm font-medium text-foreground truncate"
											>
												{event.title}
											</div>
											<div class="text-xs text-muted-foreground tabular-nums">
												{#if getContinuationLabel(event)}
													<span class="font-medium"
														>{getContinuationLabel(event)}</span
													>
													<span> - </span>
												{/if}
												{getEventDayLabel(event)}
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
				class="hidden md:block rounded-lg bg-border overflow-hidden shadow-ink tx tx-frame tx-weak"
			>
				<div class="grid grid-cols-7 gap-px bg-border">
					{#each dayNames as day}
						<div
							class="bg-muted/50 px-1.5 py-1.5 text-center text-[10px] uppercase tracking-wide font-medium text-muted-foreground"
						>
							{day}
						</div>
					{/each}
				</div>

				<div class="space-y-px bg-border">
					{#each getMonthWeeks(internalDate) as weekDates}
						{@const weekSegments = getMonthWeekSegments(weekDates)}
						{@const visibleSegments = getVisibleMonthSegments(weekSegments)}
						{@const laneCount = getMonthLaneCount(weekSegments)}
						<div
							class="relative grid grid-cols-7 gap-px bg-border"
							style="min-height: {getMonthRowMinHeight(laneCount)}px"
						>
							{#each weekDates as date, columnIndex}
								{@const timedEvents = getMonthTimedEventsForDay(date)}
								{@const hiddenSegments = getHiddenSegmentCountForColumn(
									weekSegments,
									columnIndex
								)}
								{@const isCurrentMonth =
									date.getMonth() === internalDate.getMonth()}
								{@const isToday = date.toDateString() === new Date().toDateString()}
								<div
									class="min-h-full bg-card p-1.5 {!isCurrentMonth
										? 'opacity-40'
										: ''} {isToday
										? 'ring-1 ring-inset ring-accent/50 bg-accent/[0.03]'
										: ''}"
								>
									<div
										class="text-xs font-semibold tabular-nums {isToday
											? 'text-accent'
											: 'text-foreground'}"
									>
										{date.getDate()}
									</div>
									<div
										class="space-y-0.5"
										style="margin-top: {getMonthCellEventOffset(laneCount)}px"
									>
										{#if hiddenSegments > 0}
											<div class="text-[10px] text-muted-foreground pl-1">
												+{hiddenSegments} more
											</div>
										{/if}
										{#each timedEvents.slice(0, 2) as event}
											<button
												onclick={() => handleEventClick(event)}
												class="flex w-full items-center gap-1 truncate rounded-sm px-1 py-0.5 text-left text-[10px] leading-tight transition-all hover:bg-muted pressable"
												title={`${event.title} - ${getEventDayLabel(event)}`}
											>
												<span
													class="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/70"
												></span>
												<span class="truncate">
													{#if !event.allDay}
														<span class="tabular-nums"
															>{formatTime(event.start)}</span
														>
														<span> </span>
													{/if}
													{event.title}
												</span>
											</button>
										{/each}
										{#if timedEvents.length > 2}
											<div class="text-[10px] text-muted-foreground pl-1">
												+{timedEvents.length - 2} more
											</div>
										{/if}
									</div>
								</div>
							{/each}

							{#each visibleSegments as segment}
								<button
									onclick={() => handleEventClick(segment.event)}
									class="absolute z-10 h-5 truncate px-1.5 text-left text-[10px] font-semibold leading-5 text-foreground shadow-sm transition-all hover:brightness-95 hover:shadow-ink pressable {segment
										.event.color}"
									style={getMonthSegmentStyle(segment)}
									title={`${segment.event.title} - ${getEventRangeLabel(segment.event)}`}
								>
									<span class="truncate">{getMonthSegmentLabel(segment)}</span>
								</button>
							{/each}
						</div>
					{/each}
				</div>
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
										class="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs transition-colors hover:bg-muted pressable {event.color} {getContinuationClass(
											event
										)}"
									>
										<div class="min-w-0 flex-1">
											<div class="truncate text-foreground font-medium">
												{event.title}
											</div>
											<div class="text-[10px] text-muted-foreground">
												{#if getContinuationLabel(event)}
													<span class="font-medium"
														>{getContinuationLabel(event)}</span
													>
													<span> - </span>
												{/if}
												{getEventDayLabel(event)}
											</div>
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
