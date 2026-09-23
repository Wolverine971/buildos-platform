<!-- apps/web/src/routes/dashboard/calendar/+page.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { format } from 'date-fns';
	import {
		ArrowLeft,
		Ban,
		CheckCircle2,
		ChevronRight,
		Circle,
		CircleDot,
		Clock,
		ExternalLink,
		FileText,
		FolderOpen,
		ListChecks,
		LoaderCircle,
		MapPin,
		Milestone,
		Pause,
		SlidersHorizontal,
		Target
	} from '$lib/icons/lucide';
	import CalendarView from '$lib/components/scheduling/CalendarView.svelte';
	import CalendarItemDrawer from '$lib/components/scheduling/CalendarItemDrawer.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { debounce } from '$lib/utils/performance-optimization';
	import { parseLocalDate } from '$lib/utils/schedulingUtils';
	import {
		BUILDOS_CALENDAR_SOURCE_ID,
		decorateDashboardCalendarItems,
		getDashboardCalendarItemTitle,
		isConnectedGoogleCalendarItem,
		isDashboardCalendarItemVisible,
		isDashboardCalendarLayerVisible,
		mapConnectedGoogleEvent,
		mergeDashboardCalendarItems
	} from '$lib/services/dashboard-calendar-items';
	import {
		invalidateDashboardCalendar,
		loadDashboardCalendar,
		loadDashboardCalendarProviderEvents,
		peekDashboardCalendarItems,
		peekDashboardCalendarMeta,
		peekDashboardCalendarProviderEvents,
		readSavedDashboardCalendarState,
		saveDashboardCalendarState,
		updateDashboardCalendarPreferences,
		type DashboardCalendarViewMode
	} from '$lib/services/dashboard-calendar-cache';
	import { apiRequest } from '$lib/utils/api-client-helpers';
	import type { CalendarItem, DashboardCalendarMeta } from '$lib/types/calendar-items';
	import type {
		ConnectedGoogleCalendarEventsPayload,
		GoogleCalendarConnectionsPayload,
		GoogleCalendarSourceSummary
	} from '$lib/types/google-calendar-integration';
	import type { Component } from 'svelte';

	type ViewMode = DashboardCalendarViewMode;
	type LayerKey = 'events' | 'range' | 'start' | 'due';
	type DisplayCalendarSource = GoogleCalendarSourceSummary & {
		connectionId: string;
		connectionLabel: string;
		emailAddress: string;
	};

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

	const HEX_COLOR = /^#[0-9a-f]{6}$/i;
	// The dashboard calendar shows the full day; working hours only shape scheduling.
	const calendarWorkingHours = {
		work_start_time: '00:00',
		work_end_time: '24:00',
		working_days: [0, 1, 2, 3, 4, 5, 6]
	};

	let viewMode = $state<ViewMode>('month');
	let currentDate = $state(new Date());
	// BuildOS items for every layer; display toggles filter locally so they never refetch.
	let internalItems = $state.raw<CalendarItem[]>([]);
	let providerPayload = $state.raw<ConnectedGoogleCalendarEventsPayload | null>(null);
	let isLoading = $state(true);
	let isRefreshing = $state(false);
	let hasLoadedInitialData = $state(false);
	let error = $state<string | null>(null);
	let calendarReadWarning = $state<string | null>(null);
	let calendarConnections = $state.raw<GoogleCalendarConnectionsPayload | null>(null);
	let calendarConnectionsError = $state<string | null>(null);
	let hiddenCalendarSourceIds = $state<string[]>([]);

	let includeEvents = $state(true);
	let includeTaskRange = $state(true);
	let includeTaskStart = $state(true);
	let includeTaskDue = $state(true);
	let preferencesLoaded = $state(false);

	let showSettings = $state(false);

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
	// Latest-wins guards: only the newest range/provider/detail request may write state.
	let itemsRequestId = 0;
	let providerRequestId = 0;
	let detailRequestId = 0;

	let enabledCalendarSources = $derived.by((): DisplayCalendarSource[] => {
		if (!calendarConnections) return [];
		return calendarConnections.connections.flatMap((connection) =>
			connection.status === 'active'
				? connection.sources
						.filter((source) => source.readEnabled && !source.providerDeletedAt)
						.map((source) => ({
							...source,
							connectionId: connection.id,
							connectionLabel: connection.accountLabel,
							emailAddress: connection.emailAddress
						}))
				: []
		);
	});
	let hiddenCalendarSourceSet = $derived(new Set(hiddenCalendarSourceIds));
	let calendarSourceLookup = $derived(
		new Map(enabledCalendarSources.map((source) => [source.id, source] as const))
	);
	let isBuildOsVisible = $derived(!hiddenCalendarSourceSet.has(BUILDOS_CALENDAR_SOURCE_ID));

	let providerItems = $derived(
		providerPayload
			? providerPayload.events
					.map((event) => mapConnectedGoogleEvent(event, calendarSourceLookup))
					.filter((item): item is CalendarItem => item !== null)
			: []
	);
	let items = $derived(
		decorateDashboardCalendarItems(
			mergeDashboardCalendarItems(internalItems, providerItems),
			calendarSourceLookup
		)
	);
	let visibleItems = $derived.by(() => {
		const layers = {
			events: includeEvents,
			taskRange: includeTaskRange,
			taskStart: includeTaskStart,
			taskDue: includeTaskDue
		};
		return items.filter(
			(item) =>
				isDashboardCalendarLayerVisible(item, layers) &&
				isDashboardCalendarItemVisible(item, hiddenCalendarSourceSet)
		);
	});

	const layerOptions: { key: LayerKey; label: string }[] = [
		{ key: 'events', label: 'Events' },
		{ key: 'range', label: 'Scheduled tasks' },
		{ key: 'start', label: 'Task starts' },
		{ key: 'due', label: 'Due dates' }
	];

	function isLayerOn(layer: LayerKey): boolean {
		if (layer === 'events') return includeEvents;
		if (layer === 'range') return includeTaskRange;
		if (layer === 'start') return includeTaskStart;
		return includeTaskDue;
	}

	let hiddenLayerLabels = $derived(
		layerOptions.filter((option) => !isLayerOn(option.key)).map((option) => option.label)
	);
	let hiddenSourceLabels = $derived([
		...(isBuildOsVisible ? [] : ['BuildOS']),
		...enabledCalendarSources
			.filter((source) => hiddenCalendarSourceSet.has(source.id))
			.map(getCalendarSourceDisplayName)
	]);
	let hiddenCount = $derived(hiddenLayerLabels.length + hiddenSourceLabels.length);

	const calendarEvents = $derived(
		visibleItems.map((item) => ({
			summary: getDashboardCalendarItemTitle(item),
			start: { dateTime: item.start_at },
			end: { dateTime: item.end_at || item.start_at },
			allDay: item.all_day ?? false,
			itemType: item.item_type,
			itemKind: item.item_kind,
			htmlLink: (item.props?.external_link as string | undefined) ?? undefined,
			externalLink: (item.props?.external_link as string | undefined) ?? undefined,
			colorClass: getItemColorClass(item),
			colorStyle: getItemColorStyle(item),
			accentColor: getItemAccentColor(item),
			sourceLabel: item.calendar_source_label ?? undefined,
			calendarItem: item
		}))
	);

	function getItemColorClass(item: CalendarItem): string {
		if (item.item_type === 'task') {
			if (item.item_kind === 'range') return 'bg-success/10 border border-success/30';
			if (item.item_kind === 'start') return 'bg-info/10 border border-info/30';
			return 'bg-warning/15 border border-warning/35';
		}
		if (isConnectedGoogleCalendarItem(item)) {
			return 'calendar-source-event bg-muted/60 border border-border';
		}
		return 'bg-accent/10 border border-accent/25';
	}

	function getItemAccentColor(item: CalendarItem): string | undefined {
		if (!isConnectedGoogleCalendarItem(item)) return undefined;
		const color = item.calendar_source_color;
		return color && HEX_COLOR.test(color) ? color : undefined;
	}

	function getItemColorStyle(item: CalendarItem): string | undefined {
		const color = getItemAccentColor(item);
		if (!color) return undefined;
		return [
			`--calendar-source-color: ${color}`,
			'border-left-width: 3px',
			`border-left-color: ${color}`,
			`background-color: color-mix(in srgb, ${color} 12%, hsl(var(--card)))`
		].join('; ');
	}

	function getSafeCalendarColor(color: string | null): string {
		return color && HEX_COLOR.test(color) ? color : 'hsl(var(--muted-foreground))';
	}

	function getCalendarSourceDisplayName(source: DisplayCalendarSource): string {
		return source.summaryOverride || source.summary || source.emailAddress;
	}

	function applyMeta(meta: DashboardCalendarMeta | null | undefined) {
		if (!meta) return;
		includeEvents = meta.preferences.show_events;
		includeTaskRange = meta.preferences.show_task_scheduled;
		includeTaskStart = meta.preferences.show_task_start;
		includeTaskDue = meta.preferences.show_task_due;
		preferencesLoaded = true;

		calendarConnections = meta.connections;
		calendarConnectionsError = meta.connectionsError
			? 'Connected calendars could not be loaded.'
			: null;
		if (meta.connections) {
			const currentSourceIds = new Set(
				meta.connections.connections.flatMap((connection) =>
					connection.sources
						.filter((source) => source.readEnabled && !source.providerDeletedAt)
						.map((source) => source.id)
				)
			);
			currentSourceIds.add(BUILDOS_CALENDAR_SOURCE_ID);
			hiddenCalendarSourceIds = hiddenCalendarSourceIds.filter((id) =>
				currentSourceIds.has(id)
			);
		}
	}

	const persistPreferences = debounce(async () => {
		if (!preferencesLoaded) return;

		const result = await apiRequest('/api/users/calendar-preferences', {
			method: 'PUT',
			body: JSON.stringify({
				show_events: includeEvents,
				show_task_scheduled: includeTaskRange,
				show_task_start: includeTaskStart,
				show_task_due: includeTaskDue
			})
		});

		if (!result.success) {
			console.warn('[DashboardCalendar] Failed to persist preferences:', result.error);
		}
	}, 600);

	/**
	 * Paint from the session cache when it covers this view, then revalidate in the background
	 * when the data is stale or the neighbouring periods are not cached yet.
	 */
	async function loadCalendarItems(options: { force?: boolean } = {}) {
		const date = currentDate;
		const mode = viewMode;
		const activeRequestId = ++itemsRequestId;
		error = null;

		const cached = options.force ? null : peekDashboardCalendarItems(date, mode);
		if (cached) {
			internalItems = cached.items;
			isLoading = false;
			hasLoadedInitialData = true;
		} else if (!hasLoadedInitialData) {
			isLoading = true;
		}

		void loadProviderEvents({ force: options.force });

		if (cached?.fresh && cached.neighborsCached) {
			isRefreshing = false;
			return;
		}

		isRefreshing = !isLoading && (Boolean(options.force) || !cached);
		try {
			const payload = await loadDashboardCalendar(date, mode, { force: options.force });
			if (activeRequestId !== itemsRequestId) return;
			const hadMeta = preferencesLoaded;
			applyMeta(payload.meta);
			internalItems = payload.items;
			hasLoadedInitialData = true;
			// First visit: connected calendars are only known once meta arrives.
			if (!hadMeta) void loadProviderEvents();
		} catch (err) {
			if (activeRequestId !== itemsRequestId) return;
			console.error('[DashboardCalendar] Failed to load items:', err);
			error = err instanceof Error ? err.message : 'Failed to load calendar items';
		} finally {
			if (activeRequestId === itemsRequestId) {
				isLoading = false;
				isRefreshing = false;
			}
		}
	}

	async function loadProviderEvents(options: { force?: boolean } = {}) {
		const date = currentDate;
		const mode = viewMode;
		const activeRequestId = ++providerRequestId;
		if (!includeEvents || enabledCalendarSources.length === 0) {
			if (preferencesLoaded) calendarReadWarning = null;
			return;
		}

		const cached = options.force ? null : peekDashboardCalendarProviderEvents(date, mode);
		if (cached) {
			providerPayload = cached.payload;
			if (cached.fresh) return;
		}

		try {
			const payload = await loadDashboardCalendarProviderEvents(date, mode, {
				force: options.force
			});
			if (activeRequestId !== providerRequestId) return;
			providerPayload = payload;
			calendarReadWarning = payload.partial
				? 'Some connected calendars took too long to respond. The rest are shown.'
				: null;
		} catch (fetchError) {
			if (activeRequestId !== providerRequestId) return;
			console.warn(
				'[DashboardCalendar] Failed to load connected Google calendars:',
				fetchError
			);
			calendarReadWarning =
				'BuildOS items loaded, but connected Google calendars could not be refreshed.';
		}
	}

	function setLayer(layer: LayerKey, value: boolean) {
		if (layer === 'events') includeEvents = value;
		if (layer === 'range') includeTaskRange = value;
		if (layer === 'start') includeTaskStart = value;
		if (layer === 'due') includeTaskDue = value;
		updateDashboardCalendarPreferences({
			show_events: includeEvents,
			show_task_scheduled: includeTaskRange,
			show_task_start: includeTaskStart,
			show_task_due: includeTaskDue
		});
		persistPreferences();
		if (layer === 'events' && value) void loadProviderEvents();
	}

	function setHiddenCalendarSources(ids: string[]) {
		hiddenCalendarSourceIds = ids;
		saveDashboardCalendarState({ hiddenCalendarSourceIds: ids });
	}

	function toggleCalendarSource(calendarSourceId: string) {
		setHiddenCalendarSources(
			hiddenCalendarSourceSet.has(calendarSourceId)
				? hiddenCalendarSourceIds.filter((id) => id !== calendarSourceId)
				: [...hiddenCalendarSourceIds, calendarSourceId]
		);
	}

	function showEverything() {
		setHiddenCalendarSources([]);
		for (const option of layerOptions) {
			if (!isLayerOn(option.key)) setLayer(option.key, true);
		}
	}

	function handleDateChange(date: Date) {
		currentDate = date;
		void loadCalendarItems();
	}

	function handleViewModeChange(mode: ViewMode) {
		viewMode = mode;
		saveDashboardCalendarState({ viewMode: mode });
		void loadCalendarItems();
	}

	function handleRefresh() {
		invalidateDashboardCalendar({ meta: true });
		void loadCalendarItems({ force: true });
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
		// A slower detail for a previously clicked item must not replace this one.
		const requestId = ++detailRequestId;
		const isCurrent = () => requestId === detailRequestId;
		if (detailCache.has(cacheKey)) {
			detail = detailCache.get(cacheKey) ?? null;
			detailLoading = false;
			return;
		}

		detailLoading = true;
		detailError = null;
		try {
			if (item.source_table === 'google_calendar') {
				const providerDetail: ItemDetail = {
					type: 'event',
					data: {
						title: item.title,
						description: item.props?.description ?? null,
						location: item.props?.location ?? null,
						external_link: item.props?.external_link ?? null,
						organizer: item.props?.organizer ?? null
					},
					project: null
				};
				detail = providerDetail;
				detailCache.set(cacheKey, providerDetail);
				return;
			}

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
				detailCache.set(cacheKey, taskDetail);
				if (isCurrent()) detail = taskDetail;
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
				detailCache.set(cacheKey, eventDetail);
				if (isCurrent()) detail = eventDetail;
			}
		} catch (err) {
			if (!isCurrent()) return;
			console.error('[DashboardCalendar] Failed to load item detail:', err);
			detailError = err instanceof Error ? err.message : 'Failed to load details';
		} finally {
			if (isCurrent()) detailLoading = false;
		}
	}

	async function handleEventClick(event: any) {
		const item = resolveCalendarItem(event);
		if (!item) return;
		selectedItem = item;
		showDetailDrawer = true;
		detail = null;
		await loadItemDetail(item);
	}

	function closeDetail() {
		detailRequestId += 1;
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
		// The edit may have changed any cached detail (title, dates, links).
		detailCache.clear();
		invalidateDashboardCalendar();
		void loadCalendarItems({ force: true });
	}

	function formatRange(start: string, end: string | null, allDay: boolean | null) {
		const startDate = parseLocalDate(start);
		const endDate = parseLocalDate(end ?? start);
		const sameDay = startDate.toDateString() === endDate.toDateString();
		if (allDay) {
			const displayEnd =
				end && endDate > startDate ? new Date(endDate.getTime() - 1) : startDate;
			if (displayEnd.toDateString() === startDate.toDateString()) {
				return `${format(startDate, 'MMM d, yyyy')} (All day)`;
			}
			return `${format(startDate, 'MMM d, yyyy')} - ${format(
				displayEnd,
				'MMM d, yyyy'
			)} (All day)`;
		}
		if (!end || end === start) {
			return format(startDate, 'MMM d, yyyy h:mm a');
		}
		if (sameDay) {
			return `${format(startDate, 'MMM d, yyyy h:mm a')} - ${format(endDate, 'h:mm a')}`;
		}
		return `${format(startDate, 'MMM d, yyyy h:mm a')} - ${format(
			endDate,
			'MMM d, yyyy h:mm a'
		)}`;
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
			in_progress: 'bg-info/10 text-info',
			blocked: 'bg-destructive/10 text-destructive',
			done: 'bg-success/10 text-success',
			planning: 'bg-accent/10 text-accent',
			active: 'bg-info/10 text-info',
			paused: 'bg-warning/10 text-warning',
			completed: 'bg-success/10 text-success',
			cancelled: 'bg-muted text-muted-foreground line-through',
			scheduled: 'bg-info/10 text-info'
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
		if (priority >= 4) return 'bg-destructive/10 text-destructive';
		if (priority === 3) return 'bg-accent/10 text-accent';
		if (priority === 2) return 'bg-warning/10 text-warning';
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
		const url = resolve('/projects/[id]', { id: projectId });
		if (browser) {
			window.open(url, '_blank', 'noopener');
		} else {
			goto(url);
		}
	}

	function openTaskPage(taskId: string | null, projectId: string | null) {
		if (!taskId || !projectId) return;
		const params = new URLSearchParams({ entity: 'task', entity_id: taskId });
		const url = `${resolve('/projects/[id]', { id: projectId })}?${params}`;
		if (browser) {
			window.open(url, '_blank', 'noopener');
		} else {
			goto(url);
		}
	}

	onMount(() => {
		// The calendar always opens on today; the view and hidden calendars persist.
		const saved = readSavedDashboardCalendarState();
		viewMode = saved.viewMode;
		hiddenCalendarSourceIds = saved.hiddenCalendarSourceIds;
		applyMeta(peekDashboardCalendarMeta());
		void loadCalendarItems();
	});
</script>

<svelte:head>
	<title>Calendar - BuildOS</title>
</svelte:head>

{#snippet togglePill(pressed: boolean, label: string, onclick: () => void, dotColor: string | null)}
	<button
		type="button"
		aria-pressed={pressed}
		{onclick}
		class="inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none pressable {pressed
			? 'border-border-strong bg-background text-foreground'
			: 'border-border bg-transparent text-muted-foreground line-through decoration-muted-foreground/50'}"
	>
		{#if dotColor}
			<span
				class="h-2 w-2 shrink-0 rounded-full {pressed ? '' : 'opacity-40'}"
				style:background-color={dotColor}
				aria-hidden="true"
			></span>
		{/if}
		<span class="truncate">{label}</span>
	</button>
{/snippet}

<div class="min-h-screen bg-background">
	<div class="mx-auto max-w-7xl px-2 py-3 sm:px-4 sm:py-5 lg:px-6">
		<div class="overflow-clip rounded-lg border border-border bg-card shadow-ink">
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
			>
				{#snippet toolbarStart()}
					<a
						href={resolve('/dashboard')}
						data-sveltekit-preload-data="hover"
						aria-label="Back to dashboard"
						class="-ml-1 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
					>
						<ArrowLeft class="h-4 w-4" />
					</a>
					<h1 class="text-base font-semibold text-foreground">Calendar</h1>
				{/snippet}

				{#snippet toolbarEnd()}
					<Button
						variant="ghost"
						size="sm"
						onclick={() => (showSettings = !showSettings)}
						aria-expanded={showSettings}
						aria-controls="calendar-filters"
						class="relative p-1.5 sm:px-2.5 {showSettings ? 'bg-muted' : ''}"
						title="Filter what the calendar shows"
					>
						<SlidersHorizontal class="h-4 w-4 shrink-0 sm:mr-1.5" />
						<span class="sr-only sm:not-sr-only">Filters</span>
						{#if hiddenCount > 0}
							<span
								class="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-2xs font-semibold text-accent-foreground"
								aria-label={`${hiddenCount} hidden`}
							>
								{hiddenCount}
							</span>
						{/if}
					</Button>
				{/snippet}

				{#snippet subbar()}
					{#if showSettings}
						<div
							id="calendar-filters"
							class="space-y-2.5 border-b border-border bg-background/60 px-3 py-3"
						>
							<div class="flex flex-wrap items-center gap-1.5">
								<span class="micro-label mr-1 w-20 shrink-0">Show</span>
								{#each layerOptions as option (option.key)}
									{@render togglePill(
										isLayerOn(option.key),
										option.label,
										() => setLayer(option.key, !isLayerOn(option.key)),
										null
									)}
								{/each}
							</div>
							<div class="flex flex-wrap items-center gap-1.5">
								<span class="micro-label mr-1 w-20 shrink-0">Calendars</span>
								{@render togglePill(
									isBuildOsVisible,
									'BuildOS',
									() => toggleCalendarSource(BUILDOS_CALENDAR_SOURCE_ID),
									'hsl(var(--accent))'
								)}
								{#each enabledCalendarSources as source (source.id)}
									{@render togglePill(
										!hiddenCalendarSourceSet.has(source.id),
										getCalendarSourceDisplayName(source),
										() => toggleCalendarSource(source.id),
										getSafeCalendarColor(source.backgroundColor)
									)}
								{/each}
								{#if calendarConnections}
									<a
										href={resolve('/profile?tab=calendar&calendar=1')}
										class="ml-1 inline-flex min-h-8 items-center rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
									>
										Manage calendars
									</a>
								{/if}
							</div>
						</div>
					{:else if hiddenCount > 0}
						<div
							class="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border bg-background/60 px-3 py-1.5 text-xs text-muted-foreground"
						>
							<span class="min-w-0 truncate">
								Hidden: {[...hiddenLayerLabels, ...hiddenSourceLabels].join(' · ')}
							</span>
							<button
								type="button"
								onclick={showEverything}
								class="shrink-0 rounded font-medium text-accent hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							>
								Show all
							</button>
						</div>
					{/if}

					{#if error || calendarReadWarning || calendarConnectionsError}
						<div
							class="space-y-1 border-b border-border px-3 py-2 text-xs"
							role="status"
						>
							{#if error}
								<p class="text-destructive">{error}</p>
							{/if}
							{#if calendarReadWarning}
								<p class="text-foreground">{calendarReadWarning}</p>
							{/if}
							{#if calendarConnectionsError}
								<p class="text-foreground">{calendarConnectionsError}</p>
							{/if}
						</div>
					{/if}
				{/snippet}
			</CalendarView>
		</div>
	</div>
</div>

{#if showDetailDrawer && selectedItem}
	<CalendarItemDrawer
		isOpen={showDetailDrawer}
		onClose={closeDetail}
		title={getDashboardCalendarItemTitle(selectedItem)}
		subtitle={selectedItem.item_type === 'task'
			? `Task · ${getTaskMarkerLabel(selectedItem.item_kind)}`
			: isConnectedGoogleCalendarItem(selectedItem)
				? `Google Calendar · ${selectedItem.calendar_source_label || 'Connected calendar'}`
				: 'BuildOS event'}
	>
		<div class="space-y-3">
			<!-- Status badges row -->
			{#if detailLoading}
				<div
					class="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center"
				>
					<LoaderCircle class="h-4 w-4 animate-spin motion-reduce:animate-none" />
					Loading details…
				</div>
			{:else if detailError}
				<div
					class="rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-sm text-destructive tx tx-static tx-weak"
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
					class="flex min-w-0 items-start gap-2 rounded-lg border border-border bg-muted/30 p-3 text-sm text-foreground"
				>
					<Clock class="h-4 w-4 shrink-0 text-muted-foreground" />
					<span class="min-w-0 break-words"
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
						<div class="flex min-w-0 items-start gap-2 text-sm text-muted-foreground">
							<Target class="h-3.5 w-3.5 shrink-0" />
							<span class="min-w-0 break-words"
								>Due: {format(new Date(detail.data.due_at), 'MMM d, yyyy')}</span
							>
						</div>
					{/if}
					{#if detail.data?.completed_at}
						<div class="flex min-w-0 items-start gap-2 text-sm text-success">
							<CheckCircle2 class="h-3.5 w-3.5 shrink-0" />
							<span class="min-w-0 break-words"
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
					<div class="flex min-w-0 items-start gap-2 text-sm text-muted-foreground">
						<MapPin class="h-3.5 w-3.5 shrink-0" />
						<span class="min-w-0 break-words">{detail.data.location}</span>
					</div>
				{/if}

				<!-- Description -->
				{@const description = getDescription(detail)}
				{#if description}
					<div class="rounded-lg border border-border bg-card p-3">
						<div
							class="break-words text-sm text-foreground whitespace-pre-wrap leading-relaxed"
						>
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
							<h3 class="micro-label">Linked entities</h3>
							<div class="space-y-1">
								{#each le.plans as plan (plan.id)}
									<div
										class="flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-sm"
									>
										<ListChecks class="h-3.5 w-3.5 shrink-0 text-accent" />
										<span class="min-w-0 truncate text-foreground"
											>{plan.name || plan.title || 'Untitled Plan'}</span
										>
									</div>
								{/each}
								{#each le.goals as goal (goal.id)}
									<div
										class="flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-sm"
									>
										<Target class="h-3.5 w-3.5 shrink-0 text-warning" />
										<span class="min-w-0 truncate text-foreground"
											>{goal.name || goal.title || 'Untitled Goal'}</span
										>
									</div>
								{/each}
								{#each le.milestones as milestone (milestone.id)}
									<div
										class="flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-sm"
									>
										<Milestone class="h-3.5 w-3.5 shrink-0 text-info" />
										<span class="min-w-0 truncate text-foreground"
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
								{#each le.documents as doc (doc.id)}
									<div
										class="flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-sm"
									>
										<FileText class="h-3.5 w-3.5 shrink-0 text-info" />
										<span class="min-w-0 truncate text-foreground"
											>{doc.title || doc.name || 'Untitled Document'}</span
										>
									</div>
								{/each}
								{#each le.dependentTasks as depTask (depTask.id)}
									<div
										class="flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-sm"
									>
										<ChevronRight
											class="h-3.5 w-3.5 shrink-0 text-muted-foreground"
										/>
										<span class="min-w-0 truncate text-foreground"
											>{depTask.title ||
												depTask.name ||
												'Untitled Task'}</span
										>
										{#if depTask.state_key}
											<span
												class="ml-auto inline-flex items-center rounded-full px-1.5 py-0.5 text-2xs font-medium {getStateColor(
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
						<h3 class="micro-label">Project</h3>
						<button
							onclick={() => openProject(detail?.project?.id ?? null)}
							class="w-full rounded-lg border border-border bg-card p-2.5 text-left hover:border-accent/50 hover:bg-muted/50 transition-colors motion-reduce:transition-none shadow-ink pressable"
						>
							<div class="flex min-w-0 items-center gap-2">
								<FolderOpen class="h-4 w-4 shrink-0 text-accent" />
								<span class="min-w-0 truncate text-sm font-medium text-foreground">
									{detail.project.name}
								</span>
							</div>
							<div class="mt-1.5 flex flex-wrap items-center gap-1.5">
								<span
									class="inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-medium {getStateColor(
										detail.project.state_key
									)}"
								>
									{getStateLabel(detail.project.state_key)}
								</span>
								{#if detail.project.facet_stage}
									<span
										class="inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-medium bg-muted text-muted-foreground"
									>
										{getStageLabel(detail.project.facet_stage)}
									</span>
								{/if}
								{#if detail.project.facet_scale}
									<span
										class="inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-medium bg-muted text-muted-foreground"
									>
										{getScaleLabel(detail.project.facet_scale)}
									</span>
								{/if}
							</div>
							{#if detail.project.description}
								<p
									class="mt-2 break-words text-xs text-muted-foreground line-clamp-2"
								>
									{detail.project.description}
								</p>
							{/if}
						</button>
					</div>
				{/if}

				<!-- Actions -->
				{#if selectedItem?.item_type === 'task' || (selectedItem?.event_id && selectedItem?.project_id)}
					<div class="flex flex-wrap gap-2 pt-2 border-t border-border">
						{#if selectedItem?.item_type === 'task'}
							<Button
								variant="primary"
								size="sm"
								onclick={openTaskEditor}
								disabled={!selectedItem?.task_id || !selectedItem?.project_id}
							>
								Edit Task
							</Button>
							<Button
								variant="ghost"
								size="sm"
								onclick={() =>
									openTaskPage(
										selectedItem?.task_id ?? null,
										selectedItem?.project_id ?? null
									)}
							>
								Full Page
							</Button>
						{:else if selectedItem?.event_id && selectedItem?.project_id}
							<Button
								variant="primary"
								size="sm"
								onclick={openEventEditor}
								disabled={!selectedItem?.event_id || !selectedItem?.project_id}
							>
								Edit Event
							</Button>
						{/if}
						{#if !detail.project && selectedItem?.project_id}
							<Button
								variant="ghost"
								size="sm"
								onclick={() => openProject(selectedItem?.project_id ?? null)}
							>
								Open Project
							</Button>
						{/if}
					</div>
				{/if}
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
