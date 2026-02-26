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
		ArrowLeft,
		Clock,
		MapPin,
		FolderOpen,
		Target,
		ListChecks,
		Milestone,
		FileText,
		ChevronRight,
		CircleDot,
		CheckCircle2,
		Circle,
		Ban,
		Pause
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

	interface ProjectInfo {
		id: string;
		name: string;
		state_key: string;
		description: string | null;
		facet_stage: string | null;
		facet_scale: string | null;
		facet_context: string | null;
	}

	interface LinkedEntity {
		id: string;
		name?: string;
		title?: string;
		state_key?: string;
		type_key?: string;
		due_at?: string;
		edge_rel?: string;
	}

	interface LinkedEntities {
		plans: LinkedEntity[];
		goals: LinkedEntity[];
		milestones: LinkedEntity[];
		documents: LinkedEntity[];
		dependentTasks: LinkedEntity[];
	}

	type ItemDetail =
		| {
				type: 'task';
				data: any;
				linkedEntities: LinkedEntities | null;
				project: ProjectInfo | null;
		  }
		| { type: 'event'; data: any; project: ProjectInfo | null }
		| null;

	const LOCAL_STORAGE_KEY = 'dashboard_calendar_state_v2';
	const BUFFER_DAYS = 7;

	let viewMode = $state<ViewMode>('month');
	let currentDate = $state(new Date());
	let items = $state<CalendarItem[]>([]);
	let isLoading = $state(true);
	let isRefreshing = $state(false);
	let hasLoadedInitialData = $state(false);
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
	const projectCache = new Map<string, ProjectInfo>();

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

		const shouldUseRefreshState = options?.refreshing || hasLoadedInitialData;
		if (shouldUseRefreshState) {
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
			hasLoadedInitialData = true;
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

	function handleDateChange(date: Date) {
		currentDate = date;
		saveLocalState();
		void loadCalendarItems();
	}

	function handleViewModeChange(mode: ViewMode) {
		viewMode = mode;
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

	async function fetchProjectInfo(projectId: string): Promise<ProjectInfo | null> {
		if (projectCache.has(projectId)) {
			return projectCache.get(projectId) ?? null;
		}
		try {
			const response = await fetch(`/api/onto/projects/${projectId}`);
			const json = await response.json();
			if (!response.ok || !json?.data?.project) return null;
			const p = json.data.project;
			const info: ProjectInfo = {
				id: p.id,
				name: p.name,
				state_key: p.state_key,
				description: p.description,
				facet_stage: p.facet_stage,
				facet_scale: p.facet_scale,
				facet_context: p.facet_context
			};
			projectCache.set(projectId, info);
			return info;
		} catch {
			return null;
		}
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
				const [taskResponse, projectInfo] = await Promise.all([
					fetch(`/api/onto/tasks/${item.task_id}`),
					item.project_id ? fetchProjectInfo(item.project_id) : Promise.resolve(null)
				]);
				const data = await taskResponse.json();
				if (!taskResponse.ok) {
					throw new Error(data?.error || 'Failed to load task');
				}
				const taskDetail: ItemDetail = {
					type: 'task',
					data: data.data?.task ?? data.task,
					linkedEntities: data.data?.linkedEntities ?? data.linkedEntities ?? null,
					project: projectInfo
				};
				detail = taskDetail;
				detailCache.set(cacheKey, taskDetail);
				return;
			}

			if (item.event_id) {
				const [eventResponse, projectInfo] = await Promise.all([
					fetch(`/api/onto/events/${item.event_id}`),
					item.project_id ? fetchProjectInfo(item.project_id) : Promise.resolve(null)
				]);
				const data = await eventResponse.json();
				if (!eventResponse.ok) {
					throw new Error(data?.error || 'Failed to load event');
				}
				const eventDetail: ItemDetail = {
					type: 'event',
					data: data.data?.event ?? data.event,
					project: projectInfo
				};
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

	async function handleEventClick(event: any) {
		const item = resolveCalendarItem(event);
		console.log('[DashboardCalendar] Event clicked:', {
			event,
			resolvedItem: item,
			hasTaskId: !!item?.task_id,
			hasProjectId: !!item?.project_id
		});
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
		console.log('[DashboardCalendar] openTaskEditor called:', {
			selectedItem,
			hasTaskId: !!selectedItem?.task_id,
			hasProjectId: !!selectedItem?.project_id
		});
		if (!selectedItem?.task_id || !selectedItem.project_id) {
			console.warn('[DashboardCalendar] Missing task_id or project_id', {
				task_id: selectedItem?.task_id,
				project_id: selectedItem?.project_id
			});
			return;
		}
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

	function getStateLabel(stateKey: string | null | undefined): string {
		if (!stateKey) return 'Unknown';
		const labels: Record<string, string> = {
			todo: 'To Do',
			in_progress: 'In Progress',
			blocked: 'Blocked',
			done: 'Done',
			planning: 'Planning',
			active: 'Active',
			paused: 'Paused',
			completed: 'Completed',
			cancelled: 'Cancelled',
			scheduled: 'Scheduled'
		};
		return (
			labels[stateKey] || stateKey.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
		);
	}

	function getStateColor(stateKey: string | null | undefined): string {
		if (!stateKey) return 'bg-muted text-muted-foreground';
		const colors: Record<string, string> = {
			todo: 'bg-muted text-muted-foreground',
			in_progress: 'bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300',
			blocked: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300',
			done: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300',
			planning: 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300',
			active: 'bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300',
			paused: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300',
			completed:
				'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300',
			cancelled: 'bg-muted text-muted-foreground line-through',
			scheduled: 'bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300'
		};
		return colors[stateKey] || 'bg-muted text-muted-foreground';
	}

	function getPriorityLabel(priority: number | null | undefined): string | null {
		if (priority == null) return null;
		if (priority >= 4) return 'Critical';
		if (priority === 3) return 'High';
		if (priority === 2) return 'Medium';
		if (priority === 1) return 'Low';
		return null;
	}

	function getPriorityColor(priority: number | null | undefined): string {
		if (priority == null) return '';
		if (priority >= 4) return 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300';
		if (priority === 3)
			return 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300';
		if (priority === 2)
			return 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300';
		return 'bg-muted text-muted-foreground';
	}

	function getScaleLabel(scale: string | null | undefined): string | null {
		if (!scale) return null;
		return scale.charAt(0).toUpperCase() + scale.slice(1);
	}

	function getStageLabel(stage: string | null | undefined): string | null {
		if (!stage) return null;
		return stage.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
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
	<div class="container mx-auto max-w-6xl px-3 py-3 sm:px-5 sm:py-6">
		<div class="flex flex-col gap-2 sm:gap-3 sm:flex-row sm:items-center sm:justify-between">
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
			<div class="mt-3 sm:mt-4 rounded-lg border border-border bg-card p-3 sm:p-4">
				<div class="flex items-center gap-2 mb-2 sm:mb-3">
					<SlidersHorizontal class="h-4 w-4 text-muted-foreground" />
					<span class="text-sm font-semibold text-foreground">Display Filters</span>
				</div>
				<div class="grid gap-2 sm:gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
		subtitle={selectedItem.item_type === 'task'
			? `Task · ${getTaskMarkerLabel(selectedItem.item_kind)}`
			: 'Event'}
	>
		<div class="space-y-5">
			<!-- Status badges row -->
			{#if detailLoading}
				<div
					class="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center"
				>
					<LoaderCircle class="h-4 w-4 animate-spin" />
					Loading details…
				</div>
			{:else if detailError}
				<div
					class="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20 p-3 text-sm text-red-700 dark:text-red-400"
				>
					{detailError}
				</div>
			{:else if detail}
				<!-- Badges -->
				<div class="flex flex-wrap items-center gap-2">
					{#if detail.data?.state_key}
						<span
							class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium {getStateColor(
								detail.data.state_key
							)}"
						>
							{#if detail.data.state_key === 'done' || detail.data.state_key === 'completed'}
								<CheckCircle2 class="h-3 w-3" />
							{:else if detail.data.state_key === 'in_progress' || detail.data.state_key === 'active'}
								<CircleDot class="h-3 w-3" />
							{:else if detail.data.state_key === 'blocked'}
								<Ban class="h-3 w-3" />
							{:else if detail.data.state_key === 'paused'}
								<Pause class="h-3 w-3" />
							{:else}
								<Circle class="h-3 w-3" />
							{/if}
							{getStateLabel(detail.data.state_key)}
						</span>
					{/if}
					{#if detail.type === 'task'}
						{@const priorityLabel = getPriorityLabel(detail.data?.priority)}
						{#if priorityLabel}
							<span
								class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium {getPriorityColor(
									detail.data?.priority
								)}"
							>
								{priorityLabel}
							</span>
						{/if}
						{@const scaleLabel = getScaleLabel(detail.data?.facet_scale)}
						{#if scaleLabel}
							<span
								class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-muted text-muted-foreground"
							>
								{scaleLabel}
							</span>
						{/if}
					{/if}
				</div>

				<!-- Date/time -->
				<div
					class="flex items-center gap-2 rounded-lg border border-border bg-muted/30 p-3 text-sm text-foreground"
				>
					<Clock class="h-4 w-4 shrink-0 text-muted-foreground" />
					<span
						>{formatRange(
							selectedItem.start_at,
							selectedItem.end_at,
							selectedItem.all_day
						)}</span
					>
				</div>

				<!-- Task-specific: due date and start date if different from calendar item -->
				{#if detail.type === 'task'}
					{#if detail.data?.due_at && detail.data.due_at !== selectedItem.end_at}
						<div class="flex items-center gap-2 text-sm text-muted-foreground">
							<Target class="h-3.5 w-3.5 shrink-0" />
							<span>Due: {format(new Date(detail.data.due_at), 'MMM d, yyyy')}</span>
						</div>
					{/if}
					{#if detail.data?.completed_at}
						<div
							class="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400"
						>
							<CheckCircle2 class="h-3.5 w-3.5 shrink-0" />
							<span
								>Completed: {format(
									new Date(detail.data.completed_at),
									'MMM d, yyyy'
								)}</span
							>
						</div>
					{/if}
				{/if}

				<!-- Event-specific: location -->
				{#if detail.type === 'event' && detail.data?.location}
					<div class="flex items-center gap-2 text-sm text-muted-foreground">
						<MapPin class="h-3.5 w-3.5 shrink-0" />
						<span>{detail.data.location}</span>
					</div>
				{/if}

				<!-- Description -->
				{@const description = getDescription(detail)}
				{#if description}
					<div class="rounded-lg border border-border bg-card p-3">
						<div class="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
							{description}
						</div>
					</div>
				{/if}

				<!-- External link -->
				{@const externalLink = getExternalLink(detail)}
				{#if externalLink}
					<a
						href={externalLink}
						target="_blank"
						rel="noreferrer"
						class="inline-flex items-center gap-2 text-sm font-medium text-accent hover:underline"
					>
						<ExternalLink class="h-3.5 w-3.5" />
						Open in external calendar
					</a>
				{/if}

				<!-- Linked entities (tasks only) -->
				{#if detail.type === 'task' && detail.linkedEntities}
					{@const le = detail.linkedEntities}
					{#if le.plans.length > 0 || le.goals.length > 0 || le.milestones.length > 0 || le.documents.length > 0 || le.dependentTasks.length > 0}
						<div class="space-y-2">
							<h3
								class="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
							>
								Linked Entities
							</h3>
							<div class="space-y-1">
								{#each le.plans as plan}
									<div
										class="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50"
									>
										<ListChecks class="h-3.5 w-3.5 shrink-0 text-violet-500" />
										<span class="text-foreground truncate"
											>{plan.name || plan.title || 'Untitled Plan'}</span
										>
									</div>
								{/each}
								{#each le.goals as goal}
									<div
										class="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50"
									>
										<Target class="h-3.5 w-3.5 shrink-0 text-amber-500" />
										<span class="text-foreground truncate"
											>{goal.name || goal.title || 'Untitled Goal'}</span
										>
									</div>
								{/each}
								{#each le.milestones as milestone}
									<div
										class="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50"
									>
										<Milestone class="h-3.5 w-3.5 shrink-0 text-teal-500" />
										<span class="text-foreground truncate"
											>{milestone.title ||
												milestone.name ||
												'Untitled Milestone'}</span
										>
										{#if milestone.due_at}
											<span
												class="ml-auto text-xs text-muted-foreground shrink-0"
											>
												{format(new Date(milestone.due_at), 'MMM d')}
											</span>
										{/if}
									</div>
								{/each}
								{#each le.documents as doc}
									<div
										class="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50"
									>
										<FileText class="h-3.5 w-3.5 shrink-0 text-sky-500" />
										<span class="text-foreground truncate"
											>{doc.title || doc.name || 'Untitled Document'}</span
										>
									</div>
								{/each}
								{#each le.dependentTasks as depTask}
									<div
										class="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50"
									>
										<ChevronRight
											class="h-3.5 w-3.5 shrink-0 text-muted-foreground"
										/>
										<span class="text-foreground truncate"
											>{depTask.title ||
												depTask.name ||
												'Untitled Task'}</span
										>
										{#if depTask.state_key}
											<span
												class="ml-auto inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium {getStateColor(
													depTask.state_key
												)}"
											>
												{getStateLabel(depTask.state_key)}
											</span>
										{/if}
									</div>
								{/each}
							</div>
						</div>
					{/if}
				{/if}

				<!-- Project section -->
				{#if detail.project}
					<div class="space-y-2 pt-1">
						<h3
							class="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
						>
							Project
						</h3>
						<button
							onclick={() => openProject(detail.project?.id ?? null)}
							class="w-full rounded-lg border border-border bg-card p-3 text-left hover:bg-muted/50 transition-colors"
						>
							<div class="flex items-center gap-2">
								<FolderOpen class="h-4 w-4 shrink-0 text-accent" />
								<span class="text-sm font-medium text-foreground truncate">
									{detail.project.name}
								</span>
							</div>
							<div class="mt-1.5 flex flex-wrap items-center gap-1.5">
								<span
									class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium {getStateColor(
										detail.project.state_key
									)}"
								>
									{getStateLabel(detail.project.state_key)}
								</span>
								{#if detail.project.facet_stage}
									<span
										class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground"
									>
										{getStageLabel(detail.project.facet_stage)}
									</span>
								{/if}
								{#if detail.project.facet_scale}
									<span
										class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground"
									>
										{getScaleLabel(detail.project.facet_scale)}
									</span>
								{/if}
							</div>
							{#if detail.project.description}
								<p class="mt-2 text-xs text-muted-foreground line-clamp-2">
									{detail.project.description}
								</p>
							{/if}
						</button>
					</div>
				{/if}

				<!-- Actions -->
				<div class="flex flex-wrap gap-2 pt-2 border-t border-border">
					{#if selectedItem.item_type === 'task'}
						<Button
							variant="primary"
							size="sm"
							onclick={openTaskEditor}
							disabled={!selectedItem.task_id || !selectedItem.project_id}
						>
							Edit Task
						</Button>
						<Button
							variant="ghost"
							size="sm"
							onclick={() =>
								openTaskPage(selectedItem.task_id, selectedItem.project_id)}
						>
							Full Page
						</Button>
					{:else}
						<Button
							variant="primary"
							size="sm"
							onclick={openEventEditor}
							disabled={!selectedItem.event_id || !selectedItem.project_id}
						>
							Edit Event
						</Button>
					{/if}
					{#if !detail.project && selectedItem.project_id}
						<Button
							variant="ghost"
							size="sm"
							onclick={() => openProject(selectedItem.project_id)}
						>
							Open Project
						</Button>
					{/if}
				</div>
			{/if}
		</div>
	</CalendarItemDrawer>
{/if}

{#if showTaskModal && editTaskId && editProjectId}
	{#await loadTaskEditModal() then TaskModal}
		<TaskModal
			taskId={editTaskId}
			projectId={editProjectId}
			onClose={handleEditorClosed}
			onUpdated={handleEditorClosed}
			onDeleted={handleEditorClosed}
		/>
	{/await}
{/if}

{#if showEventModal && editEventId && editProjectId}
	{#await loadEventEditModal() then EventModal}
		<EventModal
			eventId={editEventId}
			projectId={editProjectId}
			onClose={handleEditorClosed}
			onUpdated={handleEditorClosed}
			onDeleted={handleEditorClosed}
		/>
	{/await}
{/if}
