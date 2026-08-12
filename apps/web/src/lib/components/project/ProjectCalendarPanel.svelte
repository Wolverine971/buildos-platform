<!-- apps/web/src/lib/components/project/ProjectCalendarPanel.svelte -->
<script lang="ts">
	import { addDays, startOfDay } from 'date-fns';
	import { AlertCircle } from 'lucide-svelte';
	import CalendarView from '$lib/components/scheduling/CalendarView.svelte';
	import { fetchCalendarItems } from '$lib/services/calendar-items.service';
	import type { CalendarItem } from '$lib/types/calendar-items';
	import { getMonthDates, getWeekDates } from '$lib/utils/schedulingUtils';

	type CalendarViewMode = 'day' | 'week' | 'month';

	let {
		projectId,
		refreshKey = 0,
		onItemSelect
	}: {
		projectId: string | null;
		refreshKey?: number;
		onItemSelect?: (item: CalendarItem) => void;
	} = $props();

	const BUFFER_DAYS = 7;

	let viewMode = $state<CalendarViewMode>('month');
	let currentDate = $state(new Date());
	let calendarItems = $state.raw<CalendarItem[]>([]);
	let loading = $state(false);
	let refreshing = $state(false);
	let error = $state<string | null>(null);
	let requestId = 0;

	const workingHours = {
		work_start_time: '00:00',
		work_end_time: '24:00',
		working_days: [0, 1, 2, 3, 4, 5, 6]
	};

	function getItemColorClass(item: CalendarItem): string {
		if (item.item_type === 'task') {
			if (item.item_kind === 'range') {
				return 'bg-success/10 border border-success/30';
			}
			if (item.item_kind === 'start') {
				return 'bg-info/10 border border-info/30';
			}
			return 'bg-warning/10 border border-warning/30';
		}
		return 'bg-muted border border-border';
	}

	let calendarEvents = $derived(
		calendarItems.map((item) => ({
			summary: item.title || '(Untitled)',
			start: { dateTime: item.start_at },
			end: { dateTime: item.end_at || item.start_at },
			allDay: item.all_day ?? false,
			itemType: item.item_type,
			itemKind: item.item_kind,
			htmlLink: (item.props?.external_link as string | undefined) ?? undefined,
			externalLink: (item.props?.external_link as string | undefined) ?? undefined,
			colorClass: getItemColorClass(item),
			calendarItem: item
		}))
	);

	function getViewRange(date: Date, mode: CalendarViewMode): { start: Date; end: Date } {
		if (mode === 'day') {
			const start = startOfDay(date);
			return { start, end: addDays(start, 1) };
		}

		if (mode === 'month') {
			const monthDates = getMonthDates(date);
			const monthStart = monthDates[0] ?? date;
			const monthEnd = monthDates[monthDates.length - 1] ?? monthStart;
			const start = startOfDay(monthStart);
			return { start, end: startOfDay(addDays(monthEnd, 1)) };
		}

		const weekDates = getWeekDates(date);
		const weekStart = weekDates[0] ?? date;
		const weekEnd = weekDates[weekDates.length - 1] ?? weekStart;
		const start = startOfDay(weekStart);
		return { start, end: startOfDay(addDays(weekEnd, 1)) };
	}

	async function loadProjectCalendar(
		selectedProjectId: string,
		selectedDate: Date,
		selectedView: CalendarViewMode,
		options: { isRefresh?: boolean } = {}
	) {
		const activeRequestId = ++requestId;
		if (options.isRefresh) refreshing = true;
		else loading = true;
		error = null;

		try {
			const range = getViewRange(selectedDate, selectedView);
			const items = await fetchCalendarItems({
				start: addDays(range.start, -BUFFER_DAYS).toISOString(),
				end: addDays(range.end, BUFFER_DAYS).toISOString(),
				includeEvents: true,
				includeTaskRange: true,
				includeTaskStart: false,
				includeTaskDue: false,
				projectIds: [selectedProjectId]
			});

			if (activeRequestId !== requestId || selectedProjectId !== projectId) return;
			calendarItems = items;
		} catch (loadError) {
			if (activeRequestId !== requestId || selectedProjectId !== projectId) return;
			console.error(
				'[ProjectCalendarPanel] Failed to load project calendar items:',
				loadError
			);
			error =
				loadError instanceof Error
					? loadError.message
					: 'Failed to load project calendar items';
			calendarItems = [];
		} finally {
			if (activeRequestId === requestId) {
				loading = false;
				refreshing = false;
			}
		}
	}

	$effect(() => {
		const selectedProjectId = projectId;
		const selectedDate = currentDate;
		const selectedView = viewMode;
		void refreshKey;

		if (!selectedProjectId) {
			calendarItems = [];
			return;
		}

		void loadProjectCalendar(selectedProjectId, selectedDate, selectedView);
	});

	function handleRefresh() {
		if (!projectId) return;
		void loadProjectCalendar(projectId, currentDate, viewMode, { isRefresh: true });
	}

	function resolveCalendarItem(event: any): CalendarItem | null {
		return event?.calendarItem || event?.originalEvent?.calendarItem || null;
	}

	function handleEventClick(event: any) {
		const item = resolveCalendarItem(event);
		if (item) onItemSelect?.(item);
	}
</script>

<div class="space-y-2">
	{#if error}
		<div
			class="rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 tx tx-static tx-weak"
			role="alert"
		>
			<div class="flex items-start gap-2">
				<AlertCircle class="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
				<div class="min-w-0 flex-1">
					<h3 class="text-xs font-semibold text-destructive">Error loading calendar</h3>
					<p class="mt-0.5 text-xs text-destructive/80">{error}</p>
				</div>
			</div>
		</div>
	{/if}

	<div
		class="min-h-[28rem] overflow-hidden rounded-lg border border-border bg-card shadow-ink sm:min-h-[32rem]"
	>
		<CalendarView
			{viewMode}
			{currentDate}
			events={calendarEvents}
			{workingHours}
			{loading}
			{refreshing}
			ondateChange={(date) => (currentDate = date)}
			onviewModeChange={(mode) => (viewMode = mode)}
			onrefresh={handleRefresh}
			oneventClick={handleEventClick}
		/>
	</div>
</div>
