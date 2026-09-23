<!-- apps/web/src/routes/dashboard/calendar/+page.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { format } from 'date-fns';
	import { ArrowLeft, SlidersHorizontal } from '$lib/icons/lucide';
	import CalendarView from '$lib/components/scheduling/CalendarView.svelte';
	import CalendarItemPanel, {
		type CalendarPanelAction
	} from '$lib/components/scheduling/CalendarItemPanel.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { debounce } from '$lib/utils/performance-optimization';
	import {
		planQuickReschedule,
		type QuickReschedulePreset
	} from '$lib/utils/calendar-item-timing';
	import { toastService } from '$lib/stores/toast.store';
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
		peekDashboardCalendarProject,
		peekDashboardCalendarProviderEvents,
		readSavedDashboardCalendarState,
		saveDashboardCalendarState,
		updateDashboardCalendarPreferences,
		type DashboardCalendarViewMode
	} from '$lib/services/dashboard-calendar-cache';
	import { apiRequest } from '$lib/utils/api-client-helpers';
	import type {
		CalendarItem,
		CalendarItemDetail,
		DashboardCalendarMeta
	} from '$lib/types/calendar-items';
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
	let detail = $state<CalendarItemDetail | null>(null);
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

	const detailCache = new Map<string, CalendarItemDetail>();
	// Details load on hover (after a short rest) and on click; both share one request.
	const detailRequests = new Map<string, Promise<CalendarItemDetail | null>>();
	let intentTimer: ReturnType<typeof setTimeout> | null = null;
	let panelBusy = $state<CalendarPanelAction | null>(null);
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

	function getDetailKey(item: CalendarItem): string {
		return `${item.item_type}:${item.task_id || item.event_id || item.calendar_item_id}`;
	}

	async function readJson(response: Response, fallbackMessage: string) {
		const payload = await response.json().catch(() => null);
		if (!response.ok) throw new Error(payload?.error || fallbackMessage);
		return payload;
	}

	function fetchItemDetail(item: CalendarItem): Promise<CalendarItemDetail | null> {
		const key = getDetailKey(item);
		const cached = detailCache.get(key);
		if (cached) return Promise.resolve(cached);
		const inFlight = detailRequests.get(key);
		if (inFlight) return inFlight;

		const request = (async (): Promise<CalendarItemDetail | null> => {
			// Provider events already carry everything the panel shows.
			if (item.source_table === 'google_calendar') return { type: 'event', data: {} };
			if (item.item_type === 'task' && item.task_id) {
				const payload = await readJson(
					await fetch(`/api/onto/tasks/${item.task_id}`),
					'Failed to load task'
				);
				return {
					type: 'task',
					data: payload?.data?.task ?? payload?.task ?? {},
					linkedEntities: payload?.data?.linkedEntities ?? payload?.linkedEntities ?? null
				};
			}
			if (item.event_id) {
				const payload = await readJson(
					await fetch(`/api/onto/events/${item.event_id}`),
					'Failed to load event'
				);
				return { type: 'event', data: payload?.data?.event ?? payload?.event ?? {} };
			}
			return null;
		})()
			.then((result) => {
				if (result) detailCache.set(key, result);
				return result;
			})
			.finally(() => {
				detailRequests.delete(key);
			});
		detailRequests.set(key, request);
		return request;
	}

	async function loadItemDetail(item: CalendarItem) {
		// A slower detail for a previously clicked item must not replace this one.
		const requestId = ++detailRequestId;
		const cached = detailCache.get(getDetailKey(item));
		detail = cached ?? null;
		detailError = null;
		detailLoading = !cached;
		if (cached) return;

		try {
			const result = await fetchItemDetail(item);
			if (requestId === detailRequestId) detail = result;
		} catch (err) {
			if (requestId !== detailRequestId) return;
			console.error('[DashboardCalendar] Failed to load item detail:', err);
			detailError = err instanceof Error ? err.message : 'Failed to load details';
		} finally {
			if (requestId === detailRequestId) detailLoading = false;
		}
	}

	/** Resting on a chip warms its details so the panel opens already filled in. */
	function handleEventIntent(event: any) {
		if (intentTimer) clearTimeout(intentTimer);
		intentTimer = null;
		const item = resolveCalendarItem(event);
		if (!item || item.source_table === 'google_calendar') return;
		if (detailCache.has(getDetailKey(item))) return;
		intentTimer = setTimeout(() => {
			intentTimer = null;
			void fetchItemDetail(item).catch(() => undefined);
		}, 150);
	}

	async function patchTask(taskId: string, updates: Record<string, unknown>) {
		const payload = await readJson(
			await fetch(`/api/onto/tasks/${taskId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(updates)
			}),
			'Failed to update task'
		);
		return (payload?.data?.task ?? null) as Record<string, any> | null;
	}

	function applyTaskUpdate(taskId: string, updated: Record<string, any>) {
		for (const [key, cached] of detailCache) {
			if (cached.type === 'task' && cached.data?.id === taskId) {
				detailCache.set(key, { ...cached, data: { ...cached.data, ...updated } });
			}
		}
		if (detail?.type === 'task' && detail.data?.id === taskId) {
			detail = { ...detail, data: { ...detail.data, ...updated } };
		}
		if (selectedItem?.task_id === taskId && typeof updated.state_key === 'string') {
			selectedItem = { ...selectedItem, state_key: updated.state_key };
		}
		invalidateDashboardCalendar();
		void loadCalendarItems({ force: true });
	}

	async function undoTaskAction(taskId: string, undo: Record<string, unknown>) {
		try {
			const updated = await patchTask(taskId, undo);
			applyTaskUpdate(taskId, { ...undo, ...(updated ?? {}) });
			toastService.success('Undone');
		} catch (err) {
			toastService.error(err instanceof Error ? err.message : 'Could not undo that change');
		}
	}

	async function runTaskAction(
		action: CalendarPanelAction,
		updates: Record<string, unknown>,
		undo: Record<string, unknown>,
		message: string
	) {
		const taskId = selectedItem?.task_id;
		if (!taskId || panelBusy) return;
		panelBusy = action;
		try {
			const updated = await patchTask(taskId, updates);
			applyTaskUpdate(taskId, { ...updates, ...(updated ?? {}) });
			// The drawer makes the rest of the page inert, toasts included; close it so
			// the Undo action stays reachable.
			closeDetail();
			toastService.success(message, {
				action: { label: 'Undo', onClick: () => void undoTaskAction(taskId, undo) }
			});
		} catch (err) {
			console.error('[DashboardCalendar] Quick action failed:', err);
			toastService.error(err instanceof Error ? err.message : 'Could not update the task');
		} finally {
			panelBusy = null;
		}
	}

	function currentTask(): Record<string, any> | null {
		return detail?.type === 'task' ? detail.data : null;
	}

	function handleMarkDone() {
		const previous = currentTask()?.state_key ?? selectedItem?.state_key ?? 'todo';
		void runTaskAction(
			'done',
			{ state_key: 'done' },
			{ state_key: previous === 'done' ? 'todo' : previous },
			'Marked done'
		);
	}

	function handleReopen() {
		void runTaskAction('reopen', { state_key: 'todo' }, { state_key: 'done' }, 'Reopened');
	}

	function handleReschedule(preset: QuickReschedulePreset) {
		const task = currentTask();
		const plan = task ? planQuickReschedule(task, preset) : null;
		if (!task || !plan) return;
		const undo = Object.fromEntries(
			Object.keys(plan.patch).map((key) => [key, task[key] ?? null])
		);
		void runTaskAction(
			preset,
			plan.patch,
			undo,
			`Moved to ${format(plan.targetDay, 'EEE, MMM d')}`
		);
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

	onMount(() => {
		// The calendar always opens on today; the view and hidden calendars persist.
		const saved = readSavedDashboardCalendarState();
		viewMode = saved.viewMode;
		hiddenCalendarSourceIds = saved.hiddenCalendarSourceIds;
		applyMeta(peekDashboardCalendarMeta());
		void loadCalendarItems();
		return () => {
			if (intentTimer) clearTimeout(intentTimer);
		};
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
				oneventIntent={handleEventIntent}
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
	<CalendarItemPanel
		item={selectedItem}
		{detail}
		project={peekDashboardCalendarProject(selectedItem.project_id)}
		loading={detailLoading}
		error={detailError}
		busyAction={panelBusy}
		onClose={closeDetail}
		onMarkDone={handleMarkDone}
		onReopen={handleReopen}
		onReschedule={handleReschedule}
		onEditTask={openTaskEditor}
		onEditEvent={openEventEditor}
	/>
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
