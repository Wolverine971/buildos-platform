<!-- apps/web/src/lib/components/scheduling/CalendarView.svelte -->
<script lang="ts">
	import { untrack, type Snippet } from 'svelte';
	import { format } from 'date-fns';
	import {
		Calendar,
		ChevronLeft,
		ChevronRight,
		Clock,
		ExternalLink,
		RefreshCw
	} from '$lib/icons/lucide';
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
		colorStyle?: string | null;
		/** Hex color for the event's dot/bar (e.g. its Google calendar color). */
		accentColor?: string | null;
		sourceLabel?: string | null;
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
		colorStyle?: string | null;
		accentColor?: string | null;
		sourceLabel?: string | null;
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

	/** An event with its dates parsed once; per-day copies are cut from this. */
	type NormalizedEvent = Omit<CalendarDayEvent, 'continuesBefore' | 'continuesAfter'>;

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

	interface WeekTimedEventLayout {
		event: CalendarDayEvent;
		columnIndex: number;
		columnCount: number;
		left: number;
		width: number;
	}

	type TaskMarkerKind = 'range' | 'start' | 'due';

	const monthSegmentIdentityCache = new WeakMap<object, string>();
	let monthSegmentIdentityCounter = 0;

	const HOUR_HEIGHT_PX = 48;
	const MONTH_LANE_PX = 22;
	const MONTH_MAX_LANES = 3;
	const VIEW_MODES = [
		{ mode: 'day', label: 'Day' },
		{ mode: 'week', label: 'Week' },
		{ mode: 'month', label: 'Month' }
	] as const;

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
		/** Leading toolbar content, e.g. a page title. */
		toolbarStart?: Snippet;
		/** Trailing toolbar content, e.g. a filter toggle. */
		toolbarEnd?: Snippet;
		/** Full-width row between the toolbar and the grid (filters, notices). */
		subbar?: Snippet;
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
		toolbarStart,
		toolbarEnd,
		subbar,
		ondateChange,
		onviewModeChange,
		onrefresh,
		oneventClick
	}: Props = $props();

	// Internal date state
	let internalDate = $state(new Date(untrack(() => currentDate)));

	// Calculate effective date boundaries
	let effectivePhaseStart = $derived(phaseStart ? parseLocalDate(phaseStart) : null);
	let effectivePhaseEnd = $derived(phaseEnd ? parseLocalDate(phaseEnd) : null);

	// Sync internal date when prop changes
	$effect(() => {
		if (currentDate && currentDate.getTime() !== internalDate.getTime()) {
			internalDate = new Date(currentDate);
		}
	});

	let workStartHour = $derived(parseInt(workingHours.work_start_time.split(':')[0] ?? '9'));
	let workEndHour = $derived(parseInt(workingHours.work_end_time.split(':')[0] ?? '17'));
	let visibleHours = $derived(
		Array.from(
			{ length: Math.max(0, workEndHour - workStartHour) },
			(_, i) => workStartHour + i
		)
	);

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

	function openDayView(date: Date) {
		const nextDate = new Date(date);
		internalDate = nextDate;
		viewMode = 'day';
		ondateChange?.(nextDate);
		onviewModeChange?.('day');
	}

	function handleEventClick(event: any) {
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

	function isToday(date: Date): boolean {
		return isSameLocalDay(date, new Date());
	}

	// Parse every event's dates once per input change. The grid asks for ~42 days, several
	// times each; re-parsing every event per call made month renders O(days × events × 3).
	let normalizedEvents = $derived.by((): NormalizedEvent[] => {
		const normalized: NormalizedEvent[] = [];

		for (const event of events) {
			const allDay = Boolean(
				event.allDay ?? event.all_day ?? event.calendarItem?.all_day ?? false
			);
			const dates = normalizeEventDates(
				event.start?.dateTime || event.start?.date,
				event.end?.dateTime || event.end?.date,
				allDay
			);
			if (!dates) continue;
			normalized.push({
				type: 'existing',
				title: event.summary || '(Untitled)',
				...dates,
				color:
					typeof event.colorClass === 'string'
						? event.colorClass
						: 'bg-muted border border-border',
				colorStyle: event.colorStyle,
				accentColor: event.accentColor,
				sourceLabel: event.sourceLabel,
				htmlLink: event.htmlLink ?? event.externalLink,
				originalEvent: event,
				calendarItem: event.calendarItem,
				allDay,
				spansMultipleDays: !isSameLocalDay(dates.start, dates.displayEnd)
			});
		}

		for (const schedule of proposedSchedules) {
			if (!schedule?.task?.title) continue;
			const dates = normalizeEventDates(schedule.proposedStart, schedule.proposedEnd, false);
			if (!dates) continue;
			const isHighlighted = highlightedTaskId === schedule.task.id;
			normalized.push({
				type: 'proposed',
				title: schedule.task.title,
				...dates,
				color: isHighlighted
					? 'bg-accent/20 ring-2 ring-accent'
					: schedule.hasConflict
						? 'bg-destructive/10 border border-destructive/40'
						: 'bg-accent/10 border border-accent/40',
				schedule,
				isHighlighted,
				allDay: false,
				spansMultipleDays: !isSameLocalDay(dates.start, dates.displayEnd)
			});
		}

		return normalized;
	});

	// Per-day memo, rebuilt whenever the normalized events change. A plain Map (not state)
	// so filling it during render never triggers reactivity.
	let dayEventsMemo = $derived.by(() => {
		void normalizedEvents;
		return new Map<string, CalendarDayEvent[]>();
	});

	function getEventsForDay(date: Date): CalendarDayEvent[] {
		const memo = dayEventsMemo;
		const { start: dayStart, end: dayEnd } = getDayBounds(date);
		const key = String(dayStart.getTime());
		const cached = memo.get(key);
		if (cached) return cached;

		const dayEvents: CalendarDayEvent[] = [];
		for (const event of normalizedEvents) {
			if (!(event.start < dayEnd && event.end > dayStart)) continue;
			dayEvents.push({
				...event,
				continuesBefore: event.start < dayStart,
				continuesAfter: event.end > dayEnd
			});
		}

		dayEvents.sort((a, b) => {
			const aMulti = shouldRenderInAllDayLane(a) ? 0 : 1;
			const bMulti = shouldRenderInAllDayLane(b) ? 0 : 1;
			if (aMulti !== bMulti) return aMulti - bMulti;
			return a.start.getTime() - b.start.getTime();
		});
		memo.set(key, dayEvents);
		return dayEvents;
	}

	function calculateWeekTimedEventLayouts(dayEvents: CalendarDayEvent[]): WeekTimedEventLayout[] {
		const sorted = [...dayEvents].sort((left, right) => {
			const startDifference = left.start.getTime() - right.start.getTime();
			if (startDifference !== 0) return startDifference;
			return right.end.getTime() - left.end.getTime();
		});
		const clusters: CalendarDayEvent[][] = [];
		let currentCluster: CalendarDayEvent[] = [];
		let clusterEnd = Number.NEGATIVE_INFINITY;

		for (const event of sorted) {
			if (currentCluster.length === 0 || event.start.getTime() < clusterEnd) {
				currentCluster.push(event);
				clusterEnd = Math.max(clusterEnd, event.end.getTime());
				continue;
			}
			clusters.push(currentCluster);
			currentCluster = [event];
			clusterEnd = event.end.getTime();
		}
		if (currentCluster.length > 0) clusters.push(currentCluster);

		return clusters.flatMap((cluster) => {
			const columnEnds: number[] = [];
			const assignments = cluster.map((event) => {
				let columnIndex = columnEnds.findIndex(
					(endTime) => endTime <= event.start.getTime()
				);
				if (columnIndex === -1) columnIndex = columnEnds.length;
				columnEnds[columnIndex] = event.end.getTime();
				return { event, columnIndex };
			});
			const columnCount = Math.max(1, columnEnds.length);
			return assignments.map(({ event, columnIndex }) => ({
				event,
				columnIndex,
				columnCount,
				left: (columnIndex / columnCount) * 100,
				width: 100 / columnCount
			}));
		});
	}

	function getWeekTimedEventStyle(layout: WeekTimedEventLayout): string {
		return [
			`left: calc(${layout.left}% + 2px)`,
			`width: calc(${layout.width}% - 4px)`,
			`top: ${getTimePosition(layout.event.start)}%`,
			`height: ${Math.max(
				5,
				getTimePosition(layout.event.end) - getTimePosition(layout.event.start)
			)}%`
		].join('; ');
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

	/** "8p", "9:30a" — month cells are too narrow for "8:00 PM". */
	function formatCompactTime(date: Date): string {
		const hours = date.getHours();
		const minutes = date.getMinutes();
		const hour12 = hours % 12 === 0 ? 12 : hours % 12;
		const suffix = hours < 12 ? 'a' : 'p';
		return minutes === 0
			? `${hour12}${suffix}`
			: `${hour12}:${String(minutes).padStart(2, '0')}${suffix}`;
	}

	function formatHourLabel(hour: number): string {
		const normalized = ((hour % 24) + 24) % 24;
		if (normalized === 0) return '12 AM';
		if (normalized === 12) return '12 PM';
		return normalized < 12 ? `${normalized} AM` : `${normalized - 12} PM`;
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
			return 'border-l-2 border-r-2 border-l-accent/50 border-r-accent/50';
		}
		if (event.continuesBefore) return 'border-l-2 border-l-accent/50';
		if (event.continuesAfter) return 'border-r-2 border-r-accent/50';
		return '';
	}

	function getEventTitle(event: CalendarDayEvent): string {
		const source = event.sourceLabel ? ` · ${event.sourceLabel}` : '';
		return `${event.title} - ${getEventDayLabel(event)}${source}`;
	}

	function getEventIdentity(event: CalendarDayEvent): string {
		const explicitIdentity =
			event.calendarItem?.calendar_item_id ||
			event.calendarItem?.event_id ||
			event.calendarItem?.task_id ||
			event.originalEvent?.calendarItem?.calendar_item_id ||
			event.schedule?.task?.id;
		if (explicitIdentity) return String(explicitIdentity);

		const sourceObject =
			(typeof event.originalEvent === 'object' &&
				event.originalEvent !== null &&
				event.originalEvent) ||
			(typeof event.schedule === 'object' && event.schedule !== null && event.schedule);
		if (sourceObject) {
			const existing = monthSegmentIdentityCache.get(sourceObject);
			if (existing) return existing;
			monthSegmentIdentityCounter += 1;
			const generated = `month-segment-${monthSegmentIdentityCounter}`;
			monthSegmentIdentityCache.set(sourceObject, generated);
			return generated;
		}

		return `${event.type}:${event.title}:${event.start.toISOString()}:${event.end.toISOString()}`;
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
		return segments.filter((segment) => segment.lane < MONTH_MAX_LANES);
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
				segment.lane >= MONTH_MAX_LANES &&
				segment.startCol <= columnIndex &&
				segment.endCol >= columnIndex
		).length;
	}

	function getMonthTimedEventsForDay(date: Date): CalendarDayEvent[] {
		return getTimedEvents(getEventsForDay(date));
	}

	function getCurrentMonthEventDates(date: Date): Date[] {
		return getMonthDates(date).filter(
			(monthDate) =>
				monthDate.getMonth() === date.getMonth() && getEventsForDay(monthDate).length > 0
		);
	}

	// Month cell geometry: 4px padding + 24px date badge, then 2px before the first lane.
	function getMonthSegmentTop(lane: number): number {
		return 30 + lane * MONTH_LANE_PX;
	}

	function getMonthCellEventOffset(laneCount: number): number {
		return 2 + laneCount * MONTH_LANE_PX;
	}

	function getMonthRowMinHeight(laneCount: number): number {
		return 108 + laneCount * MONTH_LANE_PX;
	}

	function getMonthSegmentStyle(segment: MonthEventSegment): string {
		const radiusLeft = segment.continuesBefore ? '0' : '4px';
		const radiusRight = segment.continuesAfter ? '0' : '4px';
		const leftInset = segment.continuesBefore ? 0 : 4;
		const rightInset = segment.continuesAfter ? 0 : 4;
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
		return `${formatCompactTime(segment.event.start)} ${segment.event.title}`;
	}

	function getTaskMarkerKind(event: CalendarDayEvent): TaskMarkerKind | null {
		const rawKind =
			event.calendarItem?.item_kind ??
			event.originalEvent?.itemKind ??
			event.originalEvent?.calendarItem?.item_kind ??
			null;
		if (rawKind === 'range' || rawKind === 'start' || rawKind === 'due') return rawKind;
		return null;
	}

	function getTaskMarkerLabel(kind: TaskMarkerKind): string {
		if (kind === 'range') return 'Scheduled';
		if (kind === 'start') return 'Start';
		return 'Due';
	}

	/**
	 * The glyph carries the item kind so chips can lead with the title:
	 * due = goldenrod diamond, start = teal ring, scheduled = sage bar,
	 * event = its calendar's color (BuildOS accent by default).
	 */
	function getGlyphClass(event: CalendarDayEvent): string {
		if (event.type === 'proposed') {
			return 'h-2 w-2 rounded-full border border-dashed border-accent';
		}
		const kind = getTaskMarkerKind(event);
		if (kind === 'due') return 'h-1.5 w-1.5 rotate-45 rounded-[1px] bg-warning';
		if (kind === 'start') return 'h-2 w-2 rounded-full border-[1.5px] border-info';
		if (kind === 'range') return 'h-1.5 w-2.5 rounded-sm bg-success';
		return event.accentColor ? 'h-2 w-2 rounded-full' : 'h-2 w-2 rounded-full bg-accent';
	}

	function getGlyphStyle(event: CalendarDayEvent): string | undefined {
		if (event.type === 'proposed' || getTaskMarkerKind(event)) return undefined;
		return event.accentColor ? `background-color: ${event.accentColor}` : undefined;
	}

	function getBarClass(event: CalendarDayEvent): string {
		if (event.type === 'proposed') return 'bg-accent/50';
		const kind = getTaskMarkerKind(event);
		if (kind === 'due') return 'bg-warning';
		if (kind === 'start') return 'bg-info';
		if (kind === 'range') return 'bg-success';
		return event.accentColor ? '' : 'bg-accent';
	}

	function getOpenDayAriaLabel(date: Date, hiddenCount: number): string {
		const eventLabel = hiddenCount === 1 ? 'event' : 'events';
		return `Open ${formatDate(date)} day view to see ${hiddenCount} more ${eventLabel}`;
	}

	function getTimePosition(date: Date): number {
		const hours = date.getHours() + date.getMinutes() / 60;
		const workDuration = workEndHour - workStartHour;
		return ((hours - workStartHour) / workDuration) * 100;
	}

	function formatDisplayDate(): string {
		if (viewMode === 'day') {
			return format(internalDate, 'EEEE, MMMM d, yyyy');
		}
		if (viewMode === 'week') {
			const weekDates = getWeekDates(internalDate);
			const first = weekDates[0] ?? internalDate;
			const last = weekDates[weekDates.length - 1] ?? first;
			if (first.getFullYear() !== last.getFullYear()) {
				return `${format(first, 'MMM d, yyyy')} – ${format(last, 'MMM d, yyyy')}`;
			}
			if (first.getMonth() !== last.getMonth()) {
				return `${format(first, 'MMM d')} – ${format(last, 'MMM d, yyyy')}`;
			}
			return `${format(first, 'MMM d')} – ${format(last, 'd, yyyy')}`;
		}
		return format(internalDate, 'MMMM yyyy');
	}

	// Check if navigation buttons should be disabled
	let canNavigateBack = $derived(!effectivePhaseStart || internalDate > effectivePhaseStart);
	let canNavigateForward = $derived(!effectivePhaseEnd || internalDate < effectivePhaseEnd);
	let currentMonthEventDates = $derived(getCurrentMonthEventDates(internalDate));
	let hourLinesStyle = $derived(
		`height: ${visibleHours.length * HOUR_HEIGHT_PX}px; background-image: repeating-linear-gradient(to bottom, transparent 0, transparent ${HOUR_HEIGHT_PX - 1}px, hsl(var(--border)) ${HOUR_HEIGHT_PX - 1}px, hsl(var(--border)) ${HOUR_HEIGHT_PX}px)`
	);

	const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
</script>

{#snippet glyph(event: CalendarDayEvent)}
	<span
		class="inline-block shrink-0 {getGlyphClass(event)}"
		style={getGlyphStyle(event)}
		aria-hidden="true"
	></span>
{/snippet}

<!-- Tints are translucent; this layer sits on an opaque card base so grid lines never
     show through bars and blocks that overlap them. -->
{#snippet tint(event: CalendarDayEvent)}
	<span
		class="pointer-events-none absolute inset-0 rounded-[inherit] {event.color}"
		style={event.colorStyle}
		aria-hidden="true"
	></span>
{/snippet}

{#snippet refreshButton()}
	<Button
		onclick={handleRefresh}
		disabled={refreshing || loading}
		variant="ghost"
		size="sm"
		class="p-1.5"
		aria-label="Refresh calendar"
		title="Refresh calendar data"
	>
		<RefreshCw
			class="h-4 w-4 shrink-0 text-muted-foreground {refreshing || loading
				? 'animate-spin motion-reduce:animate-none'
				: ''}"
		/>
	</Button>
{/snippet}

{#snippet dateBadge(date: Date, muted: boolean)}
	<span
		class="flex h-6 w-6 items-center justify-center rounded-full text-xs tabular-nums {isToday(
			date
		)
			? 'bg-accent font-semibold text-accent-foreground'
			: muted
				? 'font-medium text-muted-foreground'
				: 'font-medium text-foreground'}"
	>
		{date.getDate()}
	</span>
{/snippet}

<div class="flex h-full flex-col">
	<!-- Toolbar -->
	<div
		class="flex flex-wrap items-center gap-x-2 gap-y-2 border-b border-border px-3 py-2.5 sm:gap-x-3"
	>
		{#if toolbarStart}
			<div class="flex min-w-0 items-center gap-1.5">
				{@render toolbarStart()}
			</div>
		{/if}

		<div
			class="order-last flex w-full min-w-0 items-center gap-1 sm:order-none sm:w-auto sm:flex-1"
		>
			<button
				type="button"
				onclick={goToToday}
				class="mr-1 h-8 shrink-0 rounded-md border border-border-strong/60 bg-card px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none pressable"
			>
				Today
			</button>
			<Button
				onclick={() => navigatePeriod(-1)}
				variant="ghost"
				size="sm"
				class="shrink-0 p-1.5"
				disabled={!canNavigateBack}
				aria-label={`Previous ${viewMode}`}
			>
				<ChevronLeft class="h-4 w-4 shrink-0" />
			</Button>
			<Button
				onclick={() => navigatePeriod(1)}
				variant="ghost"
				size="sm"
				class="shrink-0 p-1.5"
				disabled={!canNavigateForward}
				aria-label={`Next ${viewMode}`}
			>
				<ChevronRight class="h-4 w-4 shrink-0" />
			</Button>
			<h2
				class="ml-1 min-w-0 flex-1 truncate text-sm font-semibold text-foreground sm:flex-none sm:text-base"
				aria-live="polite"
			>
				{formatDisplayDate()}
			</h2>
			<!-- Phones: refresh rides the date row so the title row fits at 360px. -->
			<span class="sm:hidden">{@render refreshButton()}</span>
		</div>

		<div class="ml-auto flex shrink-0 items-center gap-1.5">
			<span class="hidden sm:inline-flex">{@render refreshButton()}</span>

			<div
				class="flex items-center rounded-md border border-border bg-muted p-0.5"
				role="group"
				aria-label="Calendar view"
			>
				{#each VIEW_MODES as option (option.mode)}
					<button
						type="button"
						onclick={() => changeViewMode(option.mode)}
						aria-pressed={viewMode === option.mode}
						class="rounded px-2 py-1 text-xs font-medium transition-colors sm:px-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none {viewMode ===
						option.mode
							? 'bg-card text-foreground shadow-ink'
							: 'text-muted-foreground hover:text-foreground'}"
					>
						{option.label}
					</button>
				{/each}
			</div>

			{#if toolbarEnd}
				{@render toolbarEnd()}
			{/if}
		</div>
	</div>

	{#if subbar}
		{@render subbar()}
	{/if}

	<!-- Calendar Content -->
	<div
		class="relative flex-1 {viewMode === 'day' ? 'p-3' : 'p-3 md:p-0'}"
		aria-busy={loading || refreshing}
	>
		{#if loading}
			<div class="calendar-progress" aria-hidden="true"></div>
		{/if}

		{#if viewMode === 'day'}
			<!-- Day View -->
			<div class="mx-auto max-w-2xl space-y-4 py-1">
				{#each [getEventsForDay(internalDate)] as dayEvents}
					{@const allDayEvents = getAllDayLaneEvents(dayEvents)}
					{@const timedEvents = getTimedEvents(dayEvents)}

					{#if allDayEvents.length > 0}
						<section>
							<h3 class="micro-label mb-1.5">All day</h3>
							<div class="space-y-1">
								{#each allDayEvents as event}
									{@const markerKind = getTaskMarkerKind(event)}
									<button
										onclick={() => handleEventClick(event)}
										class="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left transition-[filter] hover:brightness-[0.97] motion-reduce:transition-none pressable {event.color} {getContinuationClass(
											event
										)}"
										style={event.colorStyle}
									>
										{@render glyph(event)}
										<div class="min-w-0 flex-1">
											<div class="flex min-w-0 items-center gap-2">
												{#if markerKind}
													<span
														class="shrink-0 text-2xs font-semibold uppercase tracking-wide text-muted-foreground"
														>{getTaskMarkerLabel(markerKind)}</span
													>
												{/if}
												<h4
													class="min-w-0 truncate text-sm font-medium text-foreground"
												>
													{event.title}
												</h4>
												{#if event.type === 'existing' && event.htmlLink}
													<ExternalLink
														class="h-3.5 w-3.5 shrink-0 text-muted-foreground"
													/>
												{/if}
											</div>
											<p class="mt-0.5 text-xs text-muted-foreground">
												{#if getContinuationLabel(event)}
													<span class="font-medium"
														>{getContinuationLabel(event)}</span
													>
													<span> - </span>
												{/if}
												{getEventRangeLabel(event)}
												{#if event.sourceLabel}
													<span> · {event.sourceLabel}</span>
												{/if}
											</p>
										</div>
									</button>
								{/each}
							</div>
						</section>
					{/if}

					{#if timedEvents.length > 0}
						<section class="space-y-0.5">
							{#each timedEvents as event}
								{@const markerKind = getTaskMarkerKind(event)}
								<button
									onclick={() => handleEventClick(event)}
									class="flex w-full items-stretch gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted/60 motion-reduce:transition-none pressable"
								>
									<span
										class="w-16 shrink-0 pt-px text-right text-xs tabular-nums text-muted-foreground"
									>
										{formatTime(event.start)}
									</span>
									<span
										class="w-1 shrink-0 rounded-full {getBarClass(event)}"
										style={event.accentColor
											? `background-color: ${event.accentColor}`
											: undefined}
										aria-hidden="true"
									></span>
									<span class="min-w-0 flex-1">
										<span class="flex min-w-0 items-center gap-2">
											{#if markerKind}
												<span
													class="shrink-0 text-2xs font-semibold uppercase tracking-wide text-muted-foreground"
													>{getTaskMarkerLabel(markerKind)}</span
												>
											{/if}
											<span
												class="min-w-0 truncate text-sm font-medium text-foreground"
											>
												{event.title}
											</span>
											{#if event.type === 'existing' && event.htmlLink}
												<ExternalLink
													class="h-3.5 w-3.5 shrink-0 text-muted-foreground"
												/>
											{/if}
											{#if event.type === 'proposed'}
												<Clock
													class="h-3.5 w-3.5 shrink-0 text-muted-foreground"
												/>
											{/if}
										</span>
										<span class="mt-0.5 block text-xs text-muted-foreground">
											{getEventDayLabel(event)}
											{#if event.sourceLabel}
												<span> · {event.sourceLabel}</span>
											{/if}
										</span>
										{#if event.type === 'proposed' && event.schedule?.hasConflict}
											<span class="mt-0.5 block text-xs text-destructive">
												{event.schedule.conflictReason}
											</span>
										{/if}
									</span>
								</button>
							{/each}
						</section>
					{/if}

					{#if dayEvents.length === 0}
						<div class="py-10 text-center text-muted-foreground">
							<Calendar class="mx-auto mb-2 h-8 w-8 opacity-40" />
							<p class="text-sm">
								{loading ? 'Loading…' : 'No events scheduled for this day'}
							</p>
						</div>
					{/if}
				{/each}
			</div>
		{:else if viewMode === 'week'}
			<!-- Week View - Desktop: time grid -->
			<div class="hidden grid-cols-[3.5rem_repeat(7,minmax(0,1fr))] gap-px bg-border md:grid">
				<!-- Time column -->
				<div class="bg-card">
					<div class="h-12"></div>
					<div
						class="flex h-[46px] items-end justify-end border-t border-border px-1.5 pb-1 text-2xs text-muted-foreground"
					>
						All day
					</div>
					<div class="border-t border-border">
						{#each visibleHours as hour, index (hour)}
							<div
								class="px-1.5 text-right text-2xs tabular-nums text-muted-foreground"
								style="height: {HOUR_HEIGHT_PX}px"
							>
								<!-- The first label would sit on the all-day row's edge. -->
								{#if index > 0}
									<span class="relative -top-1.5">{formatHourLabel(hour)}</span>
								{/if}
							</div>
						{/each}
					</div>
				</div>

				<!-- Day columns -->
				{#each getWeekDates(internalDate) as date}
					{@const dayEvents = getEventsForDay(date)}
					{@const allDayEvents = getAllDayLaneEvents(dayEvents)}
					{@const timedEvents = getTimedEvents(dayEvents)}
					{@const timedEventLayouts = calculateWeekTimedEventLayouts(timedEvents)}
					{@const today = isToday(date)}
					<div class="min-w-0 bg-card">
						<button
							type="button"
							onclick={() => openDayView(date)}
							aria-label={`Open ${formatDate(date)} day view`}
							class="flex h-12 w-full flex-col items-center justify-center gap-0.5 transition-colors hover:bg-muted/50 motion-reduce:transition-none"
						>
							<span
								class="text-2xs font-semibold uppercase tracking-wide {today
									? 'text-accent'
									: 'text-muted-foreground'}"
							>
								{dayNames[date.getDay()]}
							</span>
							{@render dateBadge(date, false)}
						</button>
						<div
							class="h-[46px] space-y-0.5 overflow-hidden border-t border-border p-1"
						>
							{#each allDayEvents.slice(0, 2) as event}
								{@const markerKind = getTaskMarkerKind(event)}
								<button
									onclick={() => handleEventClick(event)}
									class="flex w-full items-center gap-1 overflow-hidden rounded-sm px-1 py-0.5 text-left text-2xs leading-tight transition-[filter] hover:brightness-95 motion-reduce:transition-none pressable {event.color} {getContinuationClass(
										event
									)}"
									style={event.colorStyle}
									title={getEventTitle(event)}
								>
									{#if markerKind}
										<span class="sr-only"
											>{getTaskMarkerLabel(markerKind)}:</span
										>
									{/if}
									<span class="min-w-0 truncate font-medium text-foreground"
										>{event.title}</span
									>
								</button>
							{/each}
							{#if allDayEvents.length > 2}
								<button
									type="button"
									onclick={() => openDayView(date)}
									class="block w-full truncate rounded-sm px-1 text-left text-2xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground motion-reduce:transition-none"
									aria-label={getOpenDayAriaLabel(date, allDayEvents.length - 2)}
								>
									+{allDayEvents.length - 2} more
								</button>
							{/if}
						</div>
						<div
							class="relative border-t border-border {today
								? 'bg-accent/[0.03]'
								: ''}"
							style={hourLinesStyle}
						>
							{#if today}
								{@const nowPosition = getTimePosition(new Date())}
								{#if nowPosition >= 0 && nowPosition <= 100}
									<div
										class="pointer-events-none absolute inset-x-0 z-20 h-px bg-accent"
										style="top: {nowPosition}%"
										aria-hidden="true"
									>
										<span
											class="absolute -left-1 -top-[3px] h-[7px] w-[7px] rounded-full bg-accent"
										></span>
									</div>
								{/if}
							{/if}
							{#each timedEventLayouts as layout (getEventIdentity(layout.event))}
								{@const event = layout.event}
								{@const markerKind = getTaskMarkerKind(event)}
								<button
									onclick={() => handleEventClick(event)}
									class="absolute overflow-hidden rounded-md bg-card px-1.5 py-1 text-left text-2xs leading-tight transition-[filter] hover:z-10 hover:brightness-95 motion-reduce:transition-none pressable"
									style={getWeekTimedEventStyle(layout)}
									title={getEventTitle(event)}
								>
									{@render tint(event)}
									<span class="relative flex min-w-0 items-center gap-1">
										{@render glyph(event)}
										{#if markerKind}
											<span class="sr-only"
												>{getTaskMarkerLabel(markerKind)}:</span
											>
										{/if}
										<span class="min-w-0 truncate font-medium text-foreground"
											>{event.title}</span
										>
									</span>
									<span class="relative block tabular-nums text-muted-foreground">
										{formatCompactTime(event.start)}
									</span>
								</button>
							{/each}
						</div>
					</div>
				{/each}
			</div>

			<!-- Mobile Week View - day list -->
			<div class="space-y-2 md:hidden">
				{#each getWeekDates(internalDate) as date}
					{@const dayEvents = getEventsForDay(date)}
					{@const today = isToday(date)}
					<div
						class="rounded-lg border bg-card p-2.5 {today
							? 'border-accent/50'
							: 'border-border'}"
					>
						<div class="mb-1 flex items-center gap-2">
							{@render dateBadge(date, false)}
							<span class="micro-label">{dayNames[date.getDay()]}</span>
						</div>
						{#if dayEvents.length > 0}
							<div class="space-y-0.5">
								{#each dayEvents as event}
									{@const markerKind = getTaskMarkerKind(event)}
									<button
										onclick={() => handleEventClick(event)}
										class="flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left transition-colors hover:bg-muted motion-reduce:transition-none pressable"
									>
										{@render glyph(event)}
										<span class="min-w-0 flex-1">
											<span class="flex min-w-0 items-center gap-2">
												{#if markerKind}
													<span
														class="shrink-0 text-2xs font-semibold uppercase tracking-wide text-muted-foreground"
														>{getTaskMarkerLabel(markerKind)}</span
													>
												{/if}
												<span
													class="min-w-0 truncate text-sm font-medium text-foreground"
												>
													{event.title}
												</span>
											</span>
											<span
												class="block text-xs tabular-nums text-muted-foreground"
											>
												{#if getContinuationLabel(event)}
													<span class="font-medium"
														>{getContinuationLabel(event)}</span
													>
													<span> - </span>
												{/if}
												{getEventDayLabel(event)}
												{#if event.sourceLabel}
													<span> · {event.sourceLabel}</span>
												{/if}
											</span>
										</span>
									</button>
								{/each}
							</div>
						{:else}
							<p class="pl-8 text-2xs text-muted-foreground">
								{loading ? 'Loading…' : 'No events'}
							</p>
						{/if}
					</div>
				{/each}
			</div>
		{:else}
			<!-- Month View - Desktop: Grid -->
			<div class="hidden md:block">
				<div class="grid grid-cols-7 border-b border-border bg-card">
					{#each dayNames as day}
						<div
							class="px-2 py-1.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground"
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
								<div
									class="min-h-full min-w-0 p-1 {isCurrentMonth
										? 'bg-card'
										: 'bg-muted/30'}"
								>
									<button
										type="button"
										onclick={() => openDayView(date)}
										aria-label={`Open ${formatDate(date)} day view`}
										class="rounded-full transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
									>
										{@render dateBadge(date, !isCurrentMonth)}
									</button>
									<div
										class="space-y-px {isCurrentMonth ? '' : 'opacity-60'}"
										style="margin-top: {getMonthCellEventOffset(laneCount)}px"
									>
										{#if hiddenSegments > 0}
											<button
												type="button"
												onclick={() => openDayView(date)}
												class="block w-full truncate rounded-sm px-1 text-left text-2xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground motion-reduce:transition-none"
												aria-label={getOpenDayAriaLabel(
													date,
													hiddenSegments
												)}
											>
												+{hiddenSegments} more
											</button>
										{/if}
										{#each timedEvents.slice(0, 2) as event}
											{@const markerKind = getTaskMarkerKind(event)}
											<button
												onclick={() => handleEventClick(event)}
												class="flex h-5 w-full items-center gap-1.5 overflow-hidden rounded px-1 text-left text-2xs leading-none transition-colors hover:bg-muted motion-reduce:transition-none pressable"
												title={getEventTitle(event)}
											>
												{@render glyph(event)}
												{#if markerKind}
													<span class="sr-only"
														>{getTaskMarkerLabel(markerKind)}:</span
													>
												{/if}
												{#if !event.allDay && markerKind !== 'due'}
													<span
														class="shrink-0 tabular-nums text-muted-foreground"
														>{formatCompactTime(event.start)}</span
													>
												{/if}
												<span
													class="min-w-0 truncate font-medium text-foreground"
													>{event.title}</span
												>
											</button>
										{/each}
										{#if timedEvents.length > 2}
											<button
												type="button"
												onclick={() => openDayView(date)}
												class="block w-full truncate rounded-sm px-1 text-left text-2xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground motion-reduce:transition-none"
												aria-label={getOpenDayAriaLabel(
													date,
													timedEvents.length - 2
												)}
											>
												+{timedEvents.length - 2} more
											</button>
										{/if}
									</div>
								</div>
							{/each}

							{#each visibleSegments as segment}
								{@const markerKind = getTaskMarkerKind(segment.event)}
								<button
									onclick={() => handleEventClick(segment.event)}
									class="absolute z-10 flex h-5 items-center gap-1 overflow-hidden bg-card px-1.5 text-left text-2xs font-medium leading-5 text-foreground transition-[filter] hover:brightness-95 motion-reduce:transition-none pressable"
									style={getMonthSegmentStyle(segment)}
									title={`${segment.event.title} - ${getEventRangeLabel(segment.event)}${segment.event.sourceLabel ? ` · ${segment.event.sourceLabel}` : ''}`}
								>
									{@render tint(segment.event)}
									{#if markerKind}
										<span class="sr-only"
											>{getTaskMarkerLabel(markerKind)}:</span
										>
									{/if}
									<span class="relative min-w-0 truncate"
										>{getMonthSegmentLabel(segment)}</span
									>
								</button>
							{/each}
						</div>
					{/each}
				</div>
			</div>

			<!-- Mobile Month View - days with events -->
			<div class="space-y-2 md:hidden">
				{#if currentMonthEventDates.length > 0}
					{#each currentMonthEventDates as date}
						{@const dayEvents = getEventsForDay(date)}
						{@const today = isToday(date)}
						<div
							class="rounded-lg border bg-card p-2.5 {today
								? 'border-accent/50'
								: 'border-border'}"
						>
							<div class="mb-1 flex items-center gap-2">
								{@render dateBadge(date, false)}
								<span class="micro-label">{dayNames[date.getDay()]}</span>
							</div>
							<div class="space-y-0.5">
								{#each dayEvents.slice(0, 3) as event}
									{@const markerKind = getTaskMarkerKind(event)}
									<button
										onclick={() => handleEventClick(event)}
										class="flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-xs transition-colors hover:bg-muted motion-reduce:transition-none pressable"
									>
										{@render glyph(event)}
										<span class="min-w-0 flex-1">
											<span class="flex min-w-0 items-center gap-2">
												{#if markerKind}
													<span
														class="shrink-0 text-2xs font-semibold uppercase tracking-wide text-muted-foreground"
														>{getTaskMarkerLabel(markerKind)}</span
													>
												{/if}
												<span
													class="min-w-0 truncate text-sm font-medium text-foreground"
												>
													{event.title}
												</span>
											</span>
											<span class="block text-2xs text-muted-foreground">
												{#if getContinuationLabel(event)}
													<span class="font-medium"
														>{getContinuationLabel(event)}</span
													>
													<span> - </span>
												{/if}
												{getEventDayLabel(event)}
												{#if event.sourceLabel}
													<span> · {event.sourceLabel}</span>
												{/if}
											</span>
										</span>
									</button>
								{/each}
								{#if dayEvents.length > 3}
									<button
										type="button"
										onclick={() => openDayView(date)}
										class="block w-full truncate rounded-sm px-1.5 pt-0.5 text-left text-2xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground motion-reduce:transition-none"
										aria-label={getOpenDayAriaLabel(date, dayEvents.length - 3)}
									>
										+{dayEvents.length - 3} more
									</button>
								{/if}
							</div>
						</div>
					{/each}
				{:else}
					<div class="px-4 py-10 text-center text-muted-foreground">
						<Calendar class="mx-auto mb-2 h-8 w-8 opacity-40" />
						<p class="text-sm">
							{loading ? 'Loading…' : 'No events scheduled for this month'}
						</p>
					</div>
				{/if}
			</div>
		{/if}
	</div>
</div>

<style>
	/* Non-blocking load indicator: the grid renders immediately, items fill in. */
	.calendar-progress {
		position: absolute;
		inset: 0 0 auto 0;
		z-index: 30;
		height: 2px;
		overflow: hidden;
		pointer-events: none;
	}

	.calendar-progress::after {
		content: '';
		position: absolute;
		inset: 0;
		width: 35%;
		background: hsl(var(--accent) / 0.7);
		animation: calendar-progress 1.1s ease-in-out infinite;
	}

	@keyframes calendar-progress {
		from {
			transform: translateX(-100%);
		}
		to {
			transform: translateX(300%);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.calendar-progress::after {
			animation: none;
			width: 100%;
			opacity: 0.5;
		}
	}
</style>
