<!-- apps/web/src/routes/dashboard/calendar/+page.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { addDays, format, startOfDay } from 'date-fns';
	import {
		Calendar,
		SlidersHorizontal,
		LoaderCircle,
		ExternalLink,
		ArrowLeft
	} from 'lucide-svelte';
	import CalendarView from '$lib/components/scheduling/CalendarView.svelte';
	import CalendarItemDrawer from '$lib/components/scheduling/CalendarItemDrawer.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { debounce } from '$lib/utils/performance-optimization';
	import { getWeekDates, getMonthDates } from '$lib/utils/schedulingUtils';
	import { fetchCalendarItems } from '$lib/services/calendar-items.service';
	import { apiRequest } from '$lib/utils/api-client-helpers';
	import { toastService } from '$lib/stores/toast.store';
	import type { CalendarItem } from '$lib/types/calendar-items';
	import type { Component } from 'svelte';

	type ViewMode = 'day' | 'week' | 'month';

	type ItemDetail = { type: 'task'; data: any } | { type: 'event'; data: any } | null;

	const LOCAL_STORAGE_KEY = 'dashboard_calendar_state';
	const BUFFER_DAYS = 7;

	let viewMode = $state<ViewMode>('week');
	let currentDate = $state(new Date());
	let items = $state<CalendarItem[]>([]);
	let isLoading = $state(false);
	let isRefreshing = $state(false);
	let error = $state<string | null>(null);

	let includeEvents = $state(true);
	let includeTaskRange = $state(true);
	let includeTaskStart = $state(true);
	let includeTaskDue = $state(true);

	let showSettings = $state(false);
	let preferencesLoaded = $state(false);
	let suppressPreferenceSync = $state(false);

	let workingHours = $state({
		work_start_time: '09:00',
		work_end_time: '17:00',
		working_days: [1, 2, 3, 4, 5],
		default_task_duration_minutes: 60,
		min_task_duration_minutes: 30,
		max_task_duration_minutes: 240,
		exclude_holidays: true,
		holiday_country_code: 'US',
		prefer_morning_for_important_tasks: false
	});

	const calendarWorkingHours = $derived({
		work_start_time: '00:00',
		work_end_time: '24:00',
		working_days: workingHours.working_days
	});

	let selectedItem = $state<CalendarItem | null>(null);
	let detail = $state<ItemDetail>(null);
	let detailLoading = $state(false);
	let detailError = $state<string | null>(null);
	let showDetailDrawer = $state(false);

	type LazyComponent = Component<any, any, any> | null;
	let TaskEditModalComponent = $state<LazyComponent>(null);
	let EventEditModalComponent = $state<LazyComponent>(null);
	let showTaskModal = $state(false);
	let showEventModal = $state(false);
	let editTaskId = $state<string | null>(null);
	let editEventId = $state<string | null>(null);
	let editProjectId = $state<string | null>(null);

	const detailCache = new Map<string, ItemDetail>();

	const toggleKey = () =>
		`${includeEvents}-${includeTaskRange}-${includeTaskStart}-${includeTaskDue}`;

	let cache = $state<{
		start: Date;
		end: Date;
		key: string;
		items: CalendarItem[];
	} | null>(null);

	const calendarEvents = $derived(
		items.map((item) => ({
			summary: item.title || '(Untitled)',
			start: { dateTime: item.start_at },
			end: { dateTime: item.end_at || item.start_at },
			htmlLink: (item.props?.external_link as string | undefined) ?? undefined,
			externalLink: (item.props?.external_link as string | undefined) ?? undefined,
			colorClass: getItemColorClass(item),
			calendarItem: item
		}))
	);

	function getItemColorClass(item: CalendarItem): string {
		if (item.item_type === 'task') {
			if (item.item_kind === 'range') {
				return 'bg-emerald-100 dark:bg-emerald-900/30 border border-emerald-300 dark:border-emerald-700';
			}
			if (item.item_kind === 'start') {
				return 'bg-sky-100 dark:bg-sky-900/30 border border-sky-300 dark:border-sky-700';
			}
			return 'bg-amber-100 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700';
		}
		return 'bg-muted border border-border';
	}

	function getViewRange(date: Date, mode: ViewMode): { start: Date; end: Date } {
		if (mode === 'day') {
			const start = startOfDay(date);
			return { start, end: addDays(start, 1) };
		}
		if (mode === 'month') {
			const monthDates = getMonthDates(date);
			const start = startOfDay(monthDates[0]);
			const end = startOfDay(addDays(monthDates[monthDates.length - 1], 1));
			return { start, end };
		}
		const weekDates = getWeekDates(date);
		const start = startOfDay(weekDates[0]);
		const end = startOfDay(addDays(weekDates[weekDates.length - 1], 1));
		return { start, end };
	}

	async function loadPreferences() {
		suppressPreferenceSync = true;
		try {
			const result = await apiRequest('/api/users/calendar-preferences', {
				method: 'GET'
			});
			if (!result.success || !result.data) {
				throw new Error(result.error || 'Failed to load calendar preferences');
			}

			const prefs = result.data as Record<string, any>;
			workingHours = {
				...workingHours,
				work_start_time: prefs.work_start_time || workingHours.work_start_time,
				work_end_time: prefs.work_end_time || workingHours.work_end_time,
				working_days: prefs.working_days || workingHours.working_days,
				default_task_duration_minutes:
					prefs.default_task_duration_minutes ??
					workingHours.default_task_duration_minutes,
				min_task_duration_minutes:
					prefs.min_task_duration_minutes ?? workingHours.min_task_duration_minutes,
				max_task_duration_minutes:
					prefs.max_task_duration_minutes ?? workingHours.max_task_duration_minutes,
				exclude_holidays: prefs.exclude_holidays ?? workingHours.exclude_holidays,
				holiday_country_code:
					prefs.holiday_country_code || workingHours.holiday_country_code,
				prefer_morning_for_important_tasks:
					prefs.prefer_morning_for_important_tasks ??
					workingHours.prefer_morning_for_important_tasks
			};

			includeEvents = prefs.show_events ?? includeEvents;
			includeTaskRange = prefs.show_task_scheduled ?? includeTaskRange;
			includeTaskStart = prefs.show_task_start ?? includeTaskStart;
			includeTaskDue = prefs.show_task_due ?? includeTaskDue;

			preferencesLoaded = true;
		} catch (err) {
			console.error('[DashboardCalendar] Failed to load preferences:', err);
			toastService.error('Failed to load calendar preferences');
		} finally {
			suppressPreferenceSync = false;
		}
	}

	const persistPreferences = debounce(async () => {
		if (!preferencesLoaded || suppressPreferenceSync) return;

		const payload = {
			show_events: includeEvents,
			show_task_scheduled: includeTaskRange,
			show_task_start: includeTaskStart,
			show_task_due: includeTaskDue
		};

		const result = await apiRequest('/api/users/calendar-preferences', {
			method: 'PUT',
			body: JSON.stringify(payload)
		});

		if (!result.success) {
			console.warn('[DashboardCalendar] Failed to persist preferences:', result.error);
		}
	}, 600);

	async function loadCalendarItems(options?: { force?: boolean; refreshing?: boolean }) {
		const range = getViewRange(currentDate, viewMode);
		const bufferedStart = addDays(range.start, -BUFFER_DAYS);
		const bufferedEnd = addDays(range.end, BUFFER_DAYS);
		const key = toggleKey();

		if (
			!options?.force &&
			cache &&
			cache.key === key &&
			bufferedStart >= cache.start &&
			bufferedEnd <= cache.end
		) {
			items = cache.items;
			return;
		}

		if (options?.refreshing) {
			isRefreshing = true;
		} else {
			isLoading = true;
		}
		error = null;

		try {
			const fetched = await fetchCalendarItems({
				start: bufferedStart.toISOString(),
				end: bufferedEnd.toISOString(),
				includeEvents,
				includeTaskRange,
				includeTaskStart,
				includeTaskDue,
				limit: 2000
			});

			items = fetched;
			cache = {
				start: bufferedStart,
				end: bufferedEnd,
				key,
				items: fetched
			};
		} catch (err) {
			console.error('[DashboardCalendar] Failed to load items:', err);
			error = err instanceof Error ? err.message : 'Failed to load calendar items';
		} finally {
			isLoading = false;
			isRefreshing = false;
		}
	}

	function saveLocalState() {
		if (!browser) return;
		const payload = {
			viewMode,
			date: currentDate.toISOString()
		};
		localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(payload));
	}

	function restoreLocalState() {
		if (!browser) return;
		const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
		if (!raw) return;
		try {
			const parsed = JSON.parse(raw) as { viewMode?: ViewMode; date?: string };
			if (parsed.viewMode) {
				viewMode = parsed.viewMode;
			}
			if (parsed.date) {
				const parsedDate = new Date(parsed.date);
				if (!Number.isNaN(parsedDate.getTime())) {
					currentDate = parsedDate;
				}
			}
		} catch {
			// Ignore corrupted local storage
		}
	}

	function handleToggleChange() {
		if (suppressPreferenceSync) return;
		persistPreferences();
		void loadCalendarItems({ force: true });
	}

	function handleDateChange(event: CustomEvent<{ date: Date }>) {
		currentDate = event.detail.date;
		saveLocalState();
		void loadCalendarItems();
	}

	function handleViewModeChange(event: CustomEvent<{ mode: ViewMode }>) {
		viewMode = event.detail.mode;
		saveLocalState();
		void loadCalendarItems();
	}

	function handleRefresh() {
		void loadCalendarItems({ force: true, refreshing: true });
	}

	function resolveCalendarItem(event: any): CalendarItem | null {
		return (
			event?.calendarItem ||
			event?.originalEvent?.calendarItem ||
			event?.originalEvent ||
			null
		);
	}

	async function loadItemDetail(item: CalendarItem) {
		const cacheKey = `${item.item_type}:${item.task_id || item.event_id || item.calendar_item_id}`;
		if (detailCache.has(cacheKey)) {
			detail = detailCache.get(cacheKey) ?? null;
			return;
		}

		detailLoading = true;
		detailError = null;
		try {
			if (item.item_type === 'task' && item.task_id) {
				const response = await fetch(`/api/onto/tasks/${item.task_id}`);
				const data = await response.json();
				if (!response.ok) {
					throw new Error(data?.error || 'Failed to load task');
				}
				const taskDetail: ItemDetail = { type: 'task', data: data.task };
				detail = taskDetail;
				detailCache.set(cacheKey, taskDetail);
				return;
			}

			if (item.event_id) {
				const response = await fetch(`/api/onto/events/${item.event_id}`);
				const data = await response.json();
				if (!response.ok) {
					throw new Error(data?.error || 'Failed to load event');
				}
				const eventDetail: ItemDetail = { type: 'event', data: data.event };
				detail = eventDetail;
				detailCache.set(cacheKey, eventDetail);
			}
		} catch (err) {
			console.error('[DashboardCalendar] Failed to load item detail:', err);
			detailError = err instanceof Error ? err.message : 'Failed to load details';
		} finally {
			detailLoading = false;
		}
	}

	async function handleEventClick(event: CustomEvent<{ event: any }>) {
		const item = resolveCalendarItem(event.detail.event);
		if (!item) return;
		selectedItem = item;
		showDetailDrawer = true;
		detail = null;
		await loadItemDetail(item);
	}

	function closeDetail() {
		showDetailDrawer = false;
		selectedItem = null;
		detail = null;
		detailError = null;
		detailLoading = false;
	}

	async function loadTaskEditModal() {
		if (!TaskEditModalComponent) {
			const mod = await import('$lib/components/ontology/TaskEditModal.svelte');
			TaskEditModalComponent = mod.default;
		}
		return TaskEditModalComponent;
	}

	async function loadEventEditModal() {
		if (!EventEditModalComponent) {
			const mod = await import('$lib/components/ontology/EventEditModal.svelte');
			EventEditModalComponent = mod.default;
		}
		return EventEditModalComponent;
	}

	async function openTaskEditor() {
		if (!selectedItem?.task_id || !selectedItem.project_id) return;
		await loadTaskEditModal();
		editTaskId = selectedItem.task_id;
		editProjectId = selectedItem.project_id;
		showTaskModal = true;
		showDetailDrawer = false;
	}

	async function openEventEditor() {
		if (!selectedItem?.event_id || !selectedItem.project_id) return;
		await loadEventEditModal();
		editEventId = selectedItem.event_id;
		editProjectId = selectedItem.project_id;
		showEventModal = true;
		showDetailDrawer = false;
	}

	function handleEditorClosed() {
		showTaskModal = false;
		showEventModal = false;
		editTaskId = null;
		editEventId = null;
		editProjectId = null;
		void loadCalendarItems({ force: true });
	}

	function formatRange(start: string, end: string | null, allDay: boolean | null) {
		const startDate = new Date(start);
		const endDate = new Date(end ?? start);
		if (allDay) {
			return `${format(startDate, 'MMM d, yyyy')} (All day)`;
		}
		if (!end || end === start) {
			return format(startDate, 'MMM d, yyyy h:mm a');
		}
		return `${format(startDate, 'MMM d, yyyy h:mm a')} – ${format(endDate, 'h:mm a')}`;
	}

	function getDescription(detailData: ItemDetail): string | null {
		if (!detailData) return null;
		if (detailData.type === 'event') {
			return detailData.data?.description ?? null;
		}
		const props = detailData.data?.props ?? {};
		return props.description || props.details || (detailData.data?.description ?? null);
	}

	function getExternalLink(detailData: ItemDetail): string | null {
		if (!detailData) return null;
		if (detailData.type === 'event') {
			return detailData.data?.external_link || detailData.data?.props?.external_link || null;
		}
		return detailData.data?.props?.external_link || null;
	}

	function getTaskMarkerIcon(itemKind: string): string {
		if (itemKind === 'range') return '📅';
		if (itemKind === 'start') return '▶️';
		if (itemKind === 'due') return '🎯';
		return '📌';
	}

	function getTaskMarkerLabel(itemKind: string): string {
		if (itemKind === 'range') return 'Scheduled';
		if (itemKind === 'start') return 'Start marker';
		if (itemKind === 'due') return 'Due marker';
		return itemKind;
	}

	function openProject(projectId: string | null) {
		if (!projectId) return;
		const url = `/projects/${projectId}`;
		if (browser) {
			window.open(url, '_blank', 'noopener');
		} else {
			goto(url);
		}
	}

	function openTaskPage(taskId: string | null, projectId: string | null) {
		if (!taskId || !projectId) return;
		const url = `/projects/${projectId}/tasks/${taskId}`;
		if (browser) {
			window.open(url, '_blank', 'noopener');
		} else {
			goto(url);
		}
	}

	onMount(async () => {
		restoreLocalState();
		await loadPreferences();
		await loadCalendarItems();
	});
</script>

<main class="min-h-screen bg-background">
	<div class="container mx-auto max-w-6xl px-3 py-4 sm:px-5 sm:py-6">
		<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
			<div class="space-y-1">
				<button
					onclick={() => goto('/')}
					class="inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
				>
					<ArrowLeft class="h-3.5 w-3.5" />
					Dashboard
				</button>
				<h1 class="text-2xl font-bold text-foreground">Calendar</h1>
				<p class="text-sm text-muted-foreground">
					All events and scheduled task markers, loaded after the page renders.
				</p>
			</div>
			<div class="flex flex-wrap items-center gap-2">
				<Button variant="ghost" size="sm" onclick={() => (showSettings = !showSettings)}>
					<SlidersHorizontal class="h-4 w-4 mr-2" />
					Filters
				</Button>
				<Button variant="ghost" size="sm" disabled title="Event creation coming soon">
					<Calendar class="h-4 w-4 mr-2" />
					Add Event (soon)
				</Button>
			</div>
		</div>

		{#if showSettings}
			<div class="mt-4 rounded-lg border border-border bg-card p-4">
				<div class="flex items-center gap-2 mb-3">
					<SlidersHorizontal class="h-4 w-4 text-muted-foreground" />
					<span class="text-sm font-semibold text-foreground">Display Filters</span>
				</div>
				<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
					<label class="flex items-center gap-2 text-sm">
						<input
							type="checkbox"
							bind:checked={includeEvents}
							onchange={handleToggleChange}
							class="h-4 w-4 rounded border-border"
						/>
						<span>Events</span>
					</label>
					<label class="flex items-center gap-2 text-sm">
						<input
							type="checkbox"
							bind:checked={includeTaskRange}
							onchange={handleToggleChange}
							class="h-4 w-4 rounded border-border"
						/>
						<span>Task ranges</span>
					</label>
					<label class="flex items-center gap-2 text-sm">
						<input
							type="checkbox"
							bind:checked={includeTaskStart}
							onchange={handleToggleChange}
							class="h-4 w-4 rounded border-border"
						/>
						<span>Task start markers</span>
					</label>
					<label class="flex items-center gap-2 text-sm">
						<input
							type="checkbox"
							bind:checked={includeTaskDue}
							onchange={handleToggleChange}
							class="h-4 w-4 rounded border-border"
						/>
						<span>Task due markers</span>
					</label>
				</div>
			</div>
		{/if}

		{#if error}
			<div
				class="mt-4 rounded-lg border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/20 px-4 py-3 text-sm text-red-700 dark:text-red-400"
			>
				{error}
			</div>
		{/if}

		<div class="mt-4 rounded-lg border border-border bg-card">
			<CalendarView
				{viewMode}
				{currentDate}
				events={calendarEvents}
				workingHours={calendarWorkingHours}
				loading={isLoading}
				refreshing={isRefreshing}
				ondateChange={handleDateChange}
				onviewModeChange={handleViewModeChange}
				onrefresh={handleRefresh}
				oneventClick={handleEventClick}
			/>
		</div>
	</div>
</main>

{#if showDetailDrawer && selectedItem}
	<CalendarItemDrawer
		isOpen={showDetailDrawer}
		onClose={closeDetail}
		title={selectedItem.title || 'Calendar item'}
	>
		<div class="space-y-4">
			<div class="flex items-center gap-2">
				{#if selectedItem.item_type === 'task'}
					<span class="text-lg">{getTaskMarkerIcon(selectedItem.item_kind)}</span>
					<div>
						<div
							class="text-xs uppercase tracking-wide font-semibold text-muted-foreground"
						>
							Task · {getTaskMarkerLabel(selectedItem.item_kind)}
						</div>
					</div>
				{:else}
					<div
						class="text-xs uppercase tracking-wide text-muted-foreground font-semibold"
					>
						Event
					</div>
				{/if}
			</div>

			<div class="rounded-lg border border-border bg-muted/30 p-3 text-sm">
				{formatRange(selectedItem.start_at, selectedItem.end_at, selectedItem.all_day)}
			</div>

			{#if detailLoading}
				<div class="flex items-center gap-2 text-sm text-muted-foreground">
					<LoaderCircle class="h-4 w-4 animate-spin" />
					Loading details…
				</div>
			{:else if detailError}
				<div class="text-sm text-rose-600">{detailError}</div>
			{:else if detail}
				{@const description = getDescription(detail)}
				{#if description}
					<div class="text-sm text-foreground whitespace-pre-wrap">
						{description}
					</div>
				{/if}
				{@const externalLink = getExternalLink(detail)}
				{#if externalLink}
					<a
						href={externalLink}
						target="_blank"
						rel="noreferrer"
						class="inline-flex items-center gap-2 text-sm font-semibold text-primary-600 hover:text-primary-500"
					>
						<ExternalLink class="h-4 w-4" />
						Open in Calendar
					</a>
				{/if}
			{/if}

			<div class="flex flex-wrap gap-2 pt-2">
				{#if selectedItem.item_type === 'task'}
					<Button
						variant="primary"
						size="sm"
						onclick={openTaskEditor}
						disabled={!selectedItem.task_id || !selectedItem.project_id}
					>
						Open Task
					</Button>
					<Button
						variant="ghost"
						size="sm"
						onclick={() => openTaskPage(selectedItem.task_id, selectedItem.project_id)}
					>
						Open Task Page
					</Button>
				{:else}
					<Button
						variant="primary"
						size="sm"
						onclick={openEventEditor}
						disabled={!selectedItem.event_id || !selectedItem.project_id}
					>
						Open Event
					</Button>
				{/if}
				<Button
					variant="ghost"
					size="sm"
					onclick={() => openProject(selectedItem.project_id)}
					disabled={!selectedItem.project_id}
				>
					Open Project
				</Button>
			</div>
		</div>
	</CalendarItemDrawer>
{/if}

{#if showTaskModal && TaskEditModalComponent && editTaskId && editProjectId}
	{@const TaskModal = TaskEditModalComponent}
	<TaskModal
		taskId={editTaskId}
		projectId={editProjectId}
		onClose={handleEditorClosed}
		onUpdated={handleEditorClosed}
		onDeleted={handleEditorClosed}
	/>
{/if}

{#if showEventModal && EventEditModalComponent && editEventId && editProjectId}
	{@const EventModal = EventEditModalComponent}
	<EventModal
		eventId={editEventId}
		projectId={editProjectId}
		onClose={handleEditorClosed}
		onUpdated={handleEditorClosed}
		onDeleted={handleEditorClosed}
	/>
{/if}
