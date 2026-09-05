<!-- apps/web/src/routes/today/+page.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { formatInTimeZone } from 'date-fns-tz';
	import type { ChatContextType, ProjectFocus } from '@buildos/shared-types';
	import type { PageData } from './$types';

	import Button from '$lib/components/ui/Button.svelte';
	import TextareaWithVoice from '$lib/components/ui/TextareaWithVoice.svelte';
	import TodayAgendaRow from '$lib/components/today/TodayAgendaRow.svelte';
	import WhatChangedSection from '$lib/components/today/WhatChangedSection.svelte';
	import { loadTaskEditModal } from '$lib/components/project/project-entity-modal-loader';
	import { prepareEntityModalData } from '$lib/components/project/entity-modal-data';
	import {
		AlertCircle,
		ArrowUpRight,
		Calendar,
		Inbox,
		MessageCircle,
		RefreshCcw,
		Send,
		Sparkles
	} from '$lib/icons/lucide';
	import { requireApiData } from '$lib/utils/api-client-helpers';
	import { aiInboxPerformance } from '$lib/utils/ai-inbox-performance';
	import { getDateOnlyCalendarDate, type DateOnlyBoundary } from '$lib/utils/date-only-semantics';
	import { isActiveFacing } from '$lib/config/project-states';
	import { trackLoopEvent } from '$lib/services/loop-telemetry';
	import { toastService } from '$lib/stores/toast.store';
	import type { CalendarItem } from '$lib/types/calendar-items';
	import type { TodayFeed, TodayTask, WhatChangedEntry, WhatChangedFeed } from '$lib/types/today';

	let { data }: { data: PageData } = $props();

	// svelte-ignore state_referenced_locally -- intentional: server load seeds the
	// state once; client-side refresh() owns updates afterwards.
	let feed = $state<TodayFeed | null>(data.feed);
	let refreshing = $state(false);
	let inboxCount = $state(0);
	let changesFeed = $state<WhatChangedFeed | null>(null);
	let changesSince = $state<string | null>(null);

	// Session-local done tracking: tasks stay visible with a strike-through so the
	// day keeps its shape (and the action can be undone) until the next refresh.
	let doneIds = $state<Set<string>>(new Set());
	let pendingDoneIds = $state<Set<string>>(new Set());
	const prevStateById = new Map<string, string>();

	let nowMs = $state(Date.now());
	$effect(() => {
		const timer = setInterval(() => {
			nowMs = Date.now();
		}, 60_000);
		return () => clearInterval(timer);
	});

	// Lazy-mounted modals
	let AgentChatModalComponent = $state<any>(null);
	let chatOpen = $state(false);
	let chatConfig = $state<{
		contextType?: ChatContextType;
		entityId?: string;
		focus?: ProjectFocus | null;
		draft?: string | null;
		autoSend?: boolean;
	}>({});

	// Quick capture: "what changed?" text handed to the agent chat, which
	// structures it into project updates (the receipts section shows the result).
	let captureText = $state('');
	let captureVoiceRecording = $state(false);

	let InboxModalComponent = $state<any>(null);
	let inboxOpen = $state(false);
	let OverdueModalComponent = $state<any>(null);
	let overdueOpen = $state(false);
	type TaskEditModalLazy =
		| typeof import('$lib/components/ontology/TaskEditModal.svelte').default
		| null;
	let TaskEditModalComponent = $state<TaskEditModalLazy>(null);
	let selectedTask = $state<TodayTask | null>(null);

	const timezone = $derived(feed?.timezone ?? 'UTC');
	const dateLabel = $derived(
		feed ? formatInTimeZone(new Date(feed.dayStart), feed.timezone, 'EEEE, MMMM d') : ''
	);

	function fmtTime(iso: string): string {
		return formatInTimeZone(new Date(iso), timezone, 'h:mm a');
	}

	function hasClockTime(iso: string, boundary: DateOnlyBoundary): boolean {
		// UTC boundary sentinels carry a calendar date and must not be shifted into
		// a fake local clock time.
		return getDateOnlyCalendarDate(iso, boundary, timezone) === null;
	}

	function projectNameFor(projectId: string | null): string | null {
		if (!projectId || !feed) return null;
		return feed.projectNames[projectId] ?? null;
	}

	interface ScheduleEntry {
		key: string;
		sortMs: number;
		endMs: number | null;
		kind: 'event' | 'task';
		title: string;
		timeLabel: string;
		metaLabel: string | null;
		event?: CalendarItem;
		task?: TodayTask;
		linkedTask?: TodayTask | null;
	}

	const agenda = $derived.by(() => {
		if (!feed) {
			return {
				allDay: [] as CalendarItem[],
				schedule: [] as ScheduleEntry[],
				anytime: [] as TodayTask[]
			};
		}

		const taskById = new Map(feed.tasks.map((task) => [task.id, task]));
		const scheduledTaskIds = new Set<string>();
		for (const event of feed.events) {
			if (event.task_id && taskById.has(event.task_id)) {
				scheduledTaskIds.add(event.task_id);
			}
		}

		const allDay = feed.events.filter((event) => event.all_day);
		const schedule: ScheduleEntry[] = [];

		for (const event of feed.events) {
			if (event.all_day) continue;
			const startMs = new Date(event.start_at).getTime();
			const endMs = event.end_at ? new Date(event.end_at).getTime() : null;
			const range = `${fmtTime(event.start_at)}${event.end_at ? ` – ${fmtTime(event.end_at)}` : ''}`;
			schedule.push({
				key: `event-${event.calendar_item_id}`,
				sortMs: startMs,
				endMs,
				kind: 'event',
				title: event.title ?? 'Untitled event',
				timeLabel: fmtTime(event.start_at),
				metaLabel: range,
				event,
				linkedTask: event.task_id ? (taskById.get(event.task_id) ?? null) : null
			});
		}

		const anytime: TodayTask[] = [];
		for (const task of feed.tasks) {
			if (scheduledTaskIds.has(task.id)) continue;
			if (task.bucket === 'due_today' && task.due_at && hasClockTime(task.due_at, 'end')) {
				schedule.push({
					key: `task-${task.id}`,
					sortMs: new Date(task.due_at).getTime(),
					endMs: null,
					kind: 'task',
					title: task.title,
					timeLabel: fmtTime(task.due_at),
					metaLabel: `Due ${fmtTime(task.due_at)}`,
					task
				});
			} else if (
				task.bucket === 'starts_today' &&
				task.start_at &&
				hasClockTime(task.start_at, 'start')
			) {
				schedule.push({
					key: `task-${task.id}`,
					sortMs: new Date(task.start_at).getTime(),
					endMs: null,
					kind: 'task',
					title: task.title,
					timeLabel: fmtTime(task.start_at),
					metaLabel: `Starts ${fmtTime(task.start_at)}`,
					task
				});
			} else {
				anytime.push(task);
			}
		}

		schedule.sort((a, b) => a.sortMs - b.sortMs);

		const bucketOrder = { due_today: 0, starts_today: 1, in_progress: 2 } as const;
		anytime.sort((a, b) => {
			const byBucket = bucketOrder[a.bucket] - bucketOrder[b.bucket];
			if (byBucket !== 0) return byBucket;
			return a.title.localeCompare(b.title);
		});

		return { allDay, schedule, anytime };
	});

	const nowMarkerIndex = $derived.by(() => {
		if (agenda.schedule.length === 0) return -1;
		const index = agenda.schedule.findIndex((entry) => entry.sortMs > nowMs);
		return index === -1 ? agenda.schedule.length : index;
	});

	function entryIsCurrent(entry: ScheduleEntry): boolean {
		if (entry.kind !== 'event') return false;
		const endMs = entry.endMs ?? entry.sortMs + 60 * 60 * 1000;
		return entry.sortMs <= nowMs && endMs > nowMs;
	}

	function entryIsPast(entry: ScheduleEntry): boolean {
		if (entry.kind !== 'event') return false;
		const endMs = entry.endMs ?? entry.sortMs + 60 * 60 * 1000;
		return endMs <= nowMs;
	}

	const openTaskCount = $derived(
		feed ? feed.tasks.filter((task) => !doneIds.has(task.id)).length : 0
	);
	const eventCount = $derived(feed ? feed.events.length : 0);

	const nextEntry = $derived(
		agenda.schedule.find(
			(entry) => entry.sortMs > nowMs && !(entry.task && doneIds.has(entry.task.id))
		)
	);

	const degradedSections = $derived(feed?.degradedSections ?? []);
	const hasIncompleteFeed = $derived(degradedSections.length > 0);
	const degradedDetail = $derived.by(() => {
		const labels = degradedSections.map((section) => {
			if (section === 'events') return 'calendar events';
			if (section === 'tasks') return 'tasks';
			return 'overdue count';
		});
		return labels.length > 0 ? `${labels.join(', ')} may be incomplete.` : '';
	});
	const isClearDay = $derived(
		!hasIncompleteFeed &&
			agenda.allDay.length === 0 &&
			agenda.schedule.length === 0 &&
			agenda.anytime.length === 0
	);

	// Readiness: /today adapts to how much the user has. A brand-new (or explore/skip)
	// user with no projects gets a first-run hero instead of a bare "Clear day ahead";
	// a user with projects but no dated work today gets a "what's waiting" next-steps
	// list. The project list is already on the feed, so this costs no extra query.
	// isActiveFacing() is the canonical planning/active vs completed/cancelled/paused
	// classifier (case-normalized), so "what's waiting" never surfaces a finished project.
	const hasProjects = $derived((feed?.projects?.length ?? 0) > 0);
	const waitingProjects = $derived(
		(feed?.projects ?? [])
			.filter((project) => isActiveFacing(project.state_key) && !!project.next_step_short)
			.slice(0, 6)
	);

	async function refresh() {
		if (refreshing) return;
		refreshing = true;
		try {
			const response = await fetch('/api/today');
			const result = await requireApiData<{ feed: TodayFeed }>(
				response,
				'Failed to refresh your day'
			);
			feed = result.feed;
		} catch {
			toastService.error('Could not refresh your day');
		} finally {
			refreshing = false;
		}
	}

	async function loadInboxCount() {
		try {
			const response = await fetch('/api/inbox/count?status=pending');
			if (!response.ok) return;
			const result = await requireApiData<{ total: number }>(response);
			inboxCount = result.total ?? 0;
		} catch {
			// Chip is best-effort; leave the last known count in place.
		}
	}

	// "Since you were here": anchored to the previous visit (localStorage), held
	// steady across reloads within a browser session (sessionStorage) so the list
	// doesn't vanish on refresh. Clamped server-side to a 7-day window.
	const LAST_VISIT_KEY = 'buildos:today:last-visit-at';
	const SESSION_SINCE_KEY = 'buildos:today:changes-since';

	function resolveChangesSince(): string {
		const fallback = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
		try {
			const sessionSince = sessionStorage.getItem(SESSION_SINCE_KEY);
			if (sessionSince) return sessionSince;
			const since = localStorage.getItem(LAST_VISIT_KEY) ?? fallback;
			sessionStorage.setItem(SESSION_SINCE_KEY, since);
			return since;
		} catch {
			return fallback;
		}
	}

	// Receipt-viewed fires once per page view, on the first non-empty render —
	// loadChanges() also reruns after chat/inbox/task modals close.
	let receiptViewTracked = false;

	async function loadChanges() {
		if (!changesSince) return;
		try {
			const response = await fetch(
				`/api/today/changes?since=${encodeURIComponent(changesSince)}`
			);
			if (!response.ok) return;
			const result = await requireApiData<{ feed: WhatChangedFeed }>(response);
			changesFeed = result.feed;
			if (!receiptViewTracked && result.feed.entries.length > 0) {
				receiptViewTracked = true;
				trackLoopEvent('loop_receipt_viewed', 'today', {
					source_type: 'what_changed',
					entry_count: result.feed.entries.length,
					project_count: new Set(result.feed.entries.map((entry) => entry.project_id))
						.size,
					total_log_count: result.feed.totalLogCount,
					truncated: result.feed.truncated,
					since_hours: Math.round(
						(Date.now() - new Date(result.feed.since).getTime()) / (60 * 60 * 1000)
					)
				});
			}
		} catch {
			// Best-effort module; keep whatever we last showed.
		}
	}

	onMount(() => {
		loadInboxCount();
		changesSince = resolveChangesSince();
		try {
			localStorage.setItem(LAST_VISIT_KEY, new Date().toISOString());
		} catch {
			// Storage unavailable (private mode etc.) — the 24h fallback covers it.
		}
		loadChanges();
		trackLoopEvent('loop_surface_shown', 'today', {
			loaded: !!feed,
			event_count: eventCount,
			task_count: feed?.tasks.length ?? 0,
			overdue_count: feed?.overdueCount ?? 0,
			all_day_count: agenda.allDay.length,
			schedule_count: agenda.schedule.length,
			anytime_count: agenda.anytime.length,
			is_clear_day: isClearDay,
			project_count: feed?.projects.length ?? 0,
			// Readiness state: first_run (zero projects) | waiting (projects, no dated work) | agenda
			readiness_state: !feed
				? 'error'
				: !hasProjects
					? 'first_run'
					: isClearDay
						? 'waiting'
						: 'agenda'
		});
	});

	async function toggleDone(task: TodayTask) {
		if (pendingDoneIds.has(task.id)) return;
		const markingDone = !doneIds.has(task.id);
		pendingDoneIds = new Set(pendingDoneIds).add(task.id);
		if (markingDone) {
			prevStateById.set(task.id, task.state_key);
			doneIds = new Set(doneIds).add(task.id);
		} else {
			const next = new Set(doneIds);
			next.delete(task.id);
			doneIds = next;
		}
		try {
			const response = await fetch(`/api/onto/tasks/${task.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					state_key: markingDone ? 'done' : (prevStateById.get(task.id) ?? 'todo')
				})
			});
			if (!response.ok) {
				throw new Error(`Task update failed (${response.status})`);
			}
			trackLoopEvent('loop_decision_made', 'today', {
				source_type: 'task',
				action: markingDone ? 'done' : 'undo_done',
				source_ref_id: task.id,
				project_id: task.project_id,
				bucket: task.bucket
			});
		} catch {
			if (markingDone) {
				const next = new Set(doneIds);
				next.delete(task.id);
				doneIds = next;
			} else {
				doneIds = new Set(doneIds).add(task.id);
			}
			toastService.error('Could not update the task');
		} finally {
			const next = new Set(pendingDoneIds);
			next.delete(task.id);
			pendingDoneIds = next;
		}
	}

	async function ensureChatModal() {
		if (!AgentChatModalComponent) {
			AgentChatModalComponent = (await import('$lib/components/agent/AgentChatModal.svelte'))
				.default;
		}
	}

	async function openTaskChat(task: TodayTask, chatSource: 'task' | 'event_task' = 'task') {
		await ensureChatModal();
		chatConfig = {
			focus: {
				focusType: 'task',
				focusEntityId: task.id,
				focusEntityName: task.title,
				projectId: task.project_id,
				projectName: task.project_name
			}
		};
		chatOpen = true;
		trackLoopEvent('loop_chat_opened', 'today', {
			chat_source: chatSource,
			source_ref_id: task.id,
			project_id: task.project_id
		});
	}

	// "Chat about this change" on a task receipt: same task-focus contract as
	// agenda rows, built from the receipt's entity fields.
	async function openReceiptChat(entry: WhatChangedEntry) {
		await ensureChatModal();
		chatConfig = {
			focus: {
				focusType: 'task',
				focusEntityId: entry.entity_id,
				focusEntityName: entry.entity_name,
				projectId: entry.project_id,
				projectName: entry.project_name
			}
		};
		chatOpen = true;
		trackLoopEvent('loop_chat_opened', 'today', {
			chat_source: 'receipt_task',
			source_ref_id: entry.entity_id,
			project_id: entry.project_id
		});
	}

	async function openTask(task: TodayTask) {
		selectedTask = task;
		prepareEntityModalData('task', task.id);
		try {
			TaskEditModalComponent = (await loadTaskEditModal()).default;
			trackLoopEvent('loop_surface_opened', 'today', {
				source_type: 'task_details',
				source_ref_id: task.id,
				project_id: task.project_id
			});
		} catch {
			selectedTask = null;
			toastService.error('Could not open the task');
		}
	}

	function closeTask() {
		selectedTask = null;
	}

	function handleTaskChanged() {
		void refresh();
		void loadChanges();
	}

	async function openEventChat(entry: ScheduleEntry) {
		const event = entry.event;
		if (!event) return;
		if (entry.linkedTask) {
			await openTaskChat(entry.linkedTask, 'event_task');
			return;
		}
		await ensureChatModal();
		const title = event.title ?? 'this event';
		const projectName = projectNameFor(event.project_id);
		if (event.project_id) {
			chatConfig = {
				contextType: 'project',
				entityId: event.project_id,
				draft: `Let's talk about "${title}" at ${entry.timeLabel}${projectName ? ` (${projectName})` : ''}.`
			};
		} else {
			chatConfig = {
				contextType: 'calendar',
				entityId: event.event_id ?? event.calendar_item_id,
				draft: `Let's talk about my ${entry.timeLabel} event "${title}".`
			};
		}
		chatOpen = true;
		trackLoopEvent('loop_chat_opened', 'today', {
			chat_source: 'event',
			source_ref_id: event.calendar_item_id,
			project_id: event.project_id ?? null
		});
	}

	function buildDayDraft(): string {
		if (!feed) return 'Help me plan my day.';
		const lines: string[] = [`Here's my day (${dateLabel}):`];
		if (agenda.allDay.length > 0) {
			lines.push('', 'All day:');
			for (const event of agenda.allDay.slice(0, 6)) {
				lines.push(`- ${event.title ?? 'Untitled event'}`);
			}
		}
		if (agenda.schedule.length > 0) {
			lines.push('', 'Schedule:');
			for (const entry of agenda.schedule.slice(0, 14)) {
				const project =
					entry.task?.project_name ?? projectNameFor(entry.event?.project_id ?? null);
				lines.push(
					`- ${entry.timeLabel}: ${entry.title}${project ? ` (${project})` : ''}${entry.kind === 'task' ? ' [task]' : ''}`
				);
			}
		}
		if (agenda.anytime.length > 0) {
			lines.push('', 'Tasks for today (anytime):');
			for (const task of agenda.anytime.slice(0, 14)) {
				const status = task.bucket === 'in_progress' ? ' — in progress' : '';
				lines.push(`- ${task.title} (${task.project_name})${status}`);
			}
		}
		if (feed.overdueCount > 0) {
			lines.push(
				'',
				`I also have ${feed.overdueCount} overdue task${feed.overdueCount === 1 ? '' : 's'}.`
			);
		}
		lines.push('', 'Help me review my day and figure out what to focus on.');
		return lines.join('\n').slice(0, 2300);
	}

	async function openDayChat() {
		await ensureChatModal();
		chatConfig = { contextType: 'global', draft: buildDayDraft() };
		chatOpen = true;
		trackLoopEvent('loop_chat_opened', 'today', {
			chat_source: 'day',
			event_count: eventCount,
			task_count: openTaskCount
		});
	}

	async function submitCapture() {
		const text = captureText.trim();
		if (!text || captureVoiceRecording) return;
		await ensureChatModal();
		// 'general' (not 'global') skips the context selector and normalizes to
		// workspace-wide scope, so the auto-send fires straight into the chat.
		chatConfig = {
			contextType: 'general',
			draft: `Here's a quick update from my day. Figure out which projects and tasks this touches and apply the changes:\n\n${text}`,
			autoSend: true
		};
		chatOpen = true;
		captureText = '';
		trackLoopEvent('loop_capture_submitted', 'today', {
			source_type: 'quick_capture',
			capture_length: text.length
		});
		trackLoopEvent('loop_chat_opened', 'today', {
			chat_source: 'quick_capture'
		});
	}

	function handleCaptureKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			void submitCapture();
		}
	}

	// Zero-project first-run: same capture pipeline as submitCapture, but framed as
	// "structure my first project" so the agent creates a project rather than routing an
	// update to existing ones.
	async function submitFirstProject() {
		const text = captureText.trim();
		if (!text || captureVoiceRecording) return;
		await ensureChatModal();
		chatConfig = {
			contextType: 'general',
			draft: `This is my first project — here's the messy version. Turn it into a structured project with tasks and a clear next step:\n\n${text}`,
			autoSend: true
		};
		chatOpen = true;
		captureText = '';
		trackLoopEvent('loop_capture_submitted', 'today', {
			source_type: 'first_project',
			capture_length: text.length
		});
		trackLoopEvent('loop_chat_opened', 'today', {
			chat_source: 'first_project'
		});
	}

	function handleFirstProjectKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			void submitFirstProject();
		}
	}

	function handleChatClose() {
		chatOpen = false;
		chatConfig = {};
		refresh();
		loadInboxCount();
		loadChanges();
	}

	async function openInbox() {
		aiInboxPerformance.begin('today');
		try {
			if (!InboxModalComponent) {
				InboxModalComponent = (
					await import('$lib/components/dashboard/DashboardInboxModal.svelte')
				).default;
			}
			inboxOpen = true;
			trackLoopEvent('loop_surface_opened', 'today', {
				source_type: 'ai_inbox',
				pending_count: inboxCount
			});
		} catch (error) {
			aiInboxPerformance.cancel();
			throw error;
		}
	}

	function handleInboxClose() {
		inboxOpen = false;
		loadInboxCount();
		refresh();
		loadChanges();
	}

	async function openOverdue() {
		if (!OverdueModalComponent) {
			OverdueModalComponent = (
				await import('$lib/components/dashboard/OverdueTaskTriageModal.svelte')
			).default;
		}
		overdueOpen = true;
		trackLoopEvent('loop_surface_opened', 'today', {
			source_type: 'overdue_triage',
			overdue_count: feed?.overdueCount ?? 0
		});
	}

	function handleOverdueClose() {
		overdueOpen = false;
		refresh();
		loadChanges();
	}
</script>

<svelte:head>
	<title>Today | BuildOS</title>
</svelte:head>

<div class="min-h-screen bg-background">
	<main class="mx-auto max-w-3xl px-3 py-4 sm:px-5 sm:py-6">
		<header>
			<div class="flex items-center justify-between gap-3">
				<div class="min-w-0">
					<div class="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
						<h1 class="text-2xl font-semibold tracking-tight text-foreground">Today</h1>
						<p class="text-xs text-muted-foreground">
							{dateLabel || 'Your day, at a glance'}
						</p>
					</div>
					{#if feed}
						<p class="mt-0.5 text-xs text-muted-foreground">
							<span class="font-medium tabular-nums text-foreground"
								>{eventCount}</span
							>
							{eventCount === 1 ? 'event' : 'events'}
							<span class="mx-1 text-muted-foreground/50" aria-hidden="true">·</span>
							<span class="font-medium tabular-nums text-foreground"
								>{openTaskCount}</span
							>
							{openTaskCount === 1 ? 'task' : 'tasks'}
						</p>
					{/if}
				</div>
				<Button
					onclick={openDayChat}
					variant="primary"
					size="sm"
					icon={MessageCircle}
					class="shrink-0 text-xs [@media(pointer:fine)]:min-h-8 [@media(pointer:fine)]:py-1.5"
				>
					Plan my day
				</Button>
			</div>
			{#if nextEntry}
				<p class="mt-1 flex min-w-0 items-baseline gap-2 text-xs text-muted-foreground">
					<span class="micro-label shrink-0 text-accent">Up next</span>
					<span class="truncate" title={nextEntry.title}>{nextEntry.title}</span>
					<span class="shrink-0 text-xs tabular-nums">{nextEntry.timeLabel}</span>
				</p>
			{/if}

			<div class="mt-2 flex flex-wrap items-center border-b border-border/70 pb-1">
				{#if inboxCount > 0}
					<Button
						onclick={openInbox}
						variant="ghost"
						size="sm"
						class="gap-1.5 px-1 text-xs font-medium sm:px-2 [@media(pointer:fine)]:min-h-8 [@media(pointer:fine)]:py-1"
					>
						<Inbox class="h-4 w-4 shrink-0 text-accent" />
						{inboxCount} to review
					</Button>
				{/if}
				{#if feed && feed.overdueCount > 0}
					<Button
						onclick={openOverdue}
						variant="ghost"
						size="sm"
						class="gap-1.5 px-1 text-xs font-medium sm:px-2 [@media(pointer:fine)]:min-h-8 [@media(pointer:fine)]:py-1"
					>
						<AlertCircle class="h-4 w-4 shrink-0 text-warning" />
						{feed.overdueCount} overdue
					</Button>
				{/if}
				<a
					href="/dashboard"
					class="ml-auto inline-flex min-h-11 min-w-11 [@media(pointer:fine)]:min-h-8 [@media(pointer:fine)]:min-w-8 items-center justify-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					title="Open dashboard"
					aria-label="Open dashboard"
				>
					<span class="hidden sm:inline">Dashboard</span>
					<ArrowUpRight class="h-4 w-4 shrink-0" />
				</a>
				<Button
					onclick={refresh}
					disabled={refreshing}
					variant="ghost"
					size="sm"
					class="px-2 [@media(pointer:fine)]:min-h-8 [@media(pointer:fine)]:min-w-8 [@media(pointer:fine)]:py-1"
					title="Refresh"
					aria-label="Refresh today's agenda"
				>
					<RefreshCcw
						class="h-4 w-4 {refreshing
							? 'animate-spin motion-reduce:animate-none'
							: ''}"
					/>
				</Button>
			</div>
		</header>

		{#if feed && !hasProjects}
			<!-- First-run: no projects yet. Lead with the relief promise and a prominent
			     first-project brain-dump instead of the generic "what changed?" bar. -->
			<section class="mt-4" aria-label="Start your first project">
				<div
					class="rounded-lg border border-border bg-card shadow-ink tx tx-grain tx-weak flex flex-col items-center gap-4 p-5 text-center sm:p-8"
				>
					<div class="rounded-md border border-accent/20 bg-accent/10 p-2.5">
						<Sparkles class="h-5 w-5 text-accent" />
					</div>
					<div class="max-w-md">
						<h2 class="text-lg font-semibold text-foreground sm:text-xl">
							Get it out of your head
						</h2>
						<p class="mt-1.5 text-sm text-muted-foreground">
							Brain-dump whatever you're working on — messy is fine. BuildOS turns it
							into a structured project with tasks and a clear next move.
						</p>
					</div>
					<div class="w-full max-w-md">
						<div
							class="rounded-md border border-border bg-background p-2 text-left focus-within:border-accent sm:p-2.5"
							onkeydown={handleFirstProjectKeydown}
							role="presentation"
						>
							<TextareaWithVoice
								bind:value={captureText}
								bind:isRecording={captureVoiceRecording}
								placeholder="What are you working on? Dump it all here…"
								rows={3}
								maxRows={10}
								autoResize={true}
								showStatusRow={false}
								aria-label="Describe your first project"
								textareaClass="border-0 bg-transparent px-1 py-1 text-base sm:text-sm shadow-none focus:ring-0"
							/>
						</div>
						<div class="mt-3 flex justify-center">
							<Button
								onclick={submitFirstProject}
								variant="primary"
								size="sm"
								icon={Send}
								disabled={!captureText.trim() || captureVoiceRecording}
							>
								Structure my first project
							</Button>
						</div>
					</div>
				</div>
			</section>
		{:else if hasProjects}
			<section class="mt-3" aria-label="Quick capture">
				<div
					class="rounded-lg border border-border bg-card px-2 py-1 focus-within:border-accent/60"
					onkeydown={handleCaptureKeydown}
					role="presentation"
				>
					<h2 class="sr-only">Quick capture</h2>
					<div class="flex items-end gap-2">
						<div class="min-w-0 flex-1">
							<TextareaWithVoice
								bind:value={captureText}
								bind:isRecording={captureVoiceRecording}
								aria-label="Quick update for your projects"
								placeholder="What changed today?"
								rows={1}
								maxRows={6}
								autoResize={true}
								showStatusRow={false}
								textareaClass="border-0 bg-transparent px-1 py-1.5 text-base sm:text-sm shadow-none focus:ring-0 [@media(pointer:fine)]:min-h-8"
							/>
						</div>
						<Button
							onclick={submitCapture}
							disabled={!captureText.trim() || captureVoiceRecording}
							variant="ghost"
							size="sm"
							class="shrink-0 px-2 text-accent [@media(pointer:fine)]:min-h-8 [@media(pointer:fine)]:min-w-8 [@media(pointer:fine)]:py-1"
							title="Send update to BuildOS"
							aria-label="Send update to BuildOS"
						>
							<Send class="h-4 w-4" />
						</Button>
					</div>
				</div>
			</section>
		{/if}

		{#if !feed}
			<div class="mt-6 flex items-center gap-3 wt-paper p-3 sm:p-4 tx tx-static tx-weak">
				<div class="p-1.5 sm:p-2 rounded-md bg-destructive/10">
					<AlertCircle class="h-4 w-4 text-destructive" />
				</div>
				<p class="flex-1 text-xs sm:text-sm text-destructive">Couldn't load your day.</p>
				<Button onclick={refresh} variant="outline" size="sm" loading={refreshing}>
					Retry
				</Button>
			</div>
		{:else}
			{#if hasIncompleteFeed}
				<div
					class="mt-6 flex items-center gap-3 wt-paper p-3 sm:p-4 tx tx-static tx-weak"
					role="alert"
				>
					<div class="p-1.5 sm:p-2 rounded-md bg-amber-500/10">
						<AlertCircle class="h-4 w-4 text-amber-700 dark:text-amber-300" />
					</div>
					<div class="min-w-0 flex-1">
						<p class="text-xs font-medium text-foreground sm:text-sm">
							Some of your day couldn't be loaded.
						</p>
						<p class="mt-0.5 text-2xs text-muted-foreground sm:text-xs">
							{degradedDetail}
						</p>
					</div>
					<Button onclick={refresh} variant="outline" size="sm" loading={refreshing}>
						Retry
					</Button>
				</div>
			{/if}

			{#if agenda.allDay.length > 0}
				<section class="mt-4" aria-label="All-day events">
					<h2 class="mb-3 text-sm font-semibold tracking-tight text-foreground">
						All day
					</h2>
					<div class="flex flex-wrap items-center gap-2">
						{#each agenda.allDay as event (event.calendar_item_id)}
							{@const eventTitle = event.title ?? 'Untitled event'}
							{@const eventProjectName = projectNameFor(event.project_id)}
							<span
								class="inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-xs text-foreground"
								title={eventProjectName
									? `${eventTitle} · ${eventProjectName}`
									: eventTitle}
							>
								<Calendar class="h-3 w-3 shrink-0 text-accent" />
								<span class="min-w-0 truncate">{eventTitle}</span>
								{#if eventProjectName}
									<span class="shrink-0 text-muted-foreground" aria-hidden="true"
										>·</span
									>
									<span class="min-w-0 truncate text-muted-foreground">
										{eventProjectName}
									</span>
								{/if}
							</span>
						{/each}
					</div>
				</section>
			{/if}

			{#if agenda.schedule.length > 0}
				<section class="mt-4" aria-label="Today's schedule">
					<div class="mb-1.5 flex items-center gap-2">
						<h2 class="text-sm font-semibold tracking-tight text-foreground">
							Schedule
						</h2>
						<span class="text-xs tabular-nums text-muted-foreground"
							>{agenda.schedule.length}</span
						>
					</div>
					<div class="space-y-1">
						{#each agenda.schedule as entry, index (entry.key)}
							{#if index === nowMarkerIndex}
								<div class="flex items-center gap-2" aria-hidden="true">
									<div
										class="w-12 shrink-0 text-right text-2xs sm:w-16 font-medium tabular-nums text-accent"
									>
										{fmtTime(new Date(nowMs).toISOString())}
									</div>
									<div class="h-px flex-1 bg-accent/40"></div>
								</div>
							{/if}
							<TodayAgendaRow
								kind={entry.kind}
								title={entry.title}
								timeLabel={entry.timeLabel}
								metaLabel={entry.metaLabel}
								stateKey={entry.task?.state_key ??
									entry.linkedTask?.state_key ??
									null}
								done={entry.task
									? doneIds.has(entry.task.id)
									: entry.linkedTask
										? doneIds.has(entry.linkedTask.id)
										: false}
								past={entryIsPast(entry)}
								current={entryIsCurrent(entry)}
								projectName={entry.task?.project_name ??
									entry.linkedTask?.project_name ??
									projectNameFor(entry.event?.project_id ?? null)}
								projectHref={entry.task
									? `/projects/${entry.task.project_id}`
									: entry.linkedTask
										? `/projects/${entry.linkedTask.project_id}`
										: entry.event?.project_id
											? `/projects/${entry.event.project_id}`
											: null}
								onChat={() =>
									entry.kind === 'task' && entry.task
										? openTaskChat(entry.task)
										: openEventChat(entry)}
								onOpenTask={entry.task
									? () => openTask(entry.task!)
									: entry.linkedTask
										? () => openTask(entry.linkedTask!)
										: null}
								onToggleDone={entry.task
									? () => toggleDone(entry.task!)
									: entry.linkedTask
										? () => toggleDone(entry.linkedTask!)
										: null}
							/>
						{/each}
						{#if nowMarkerIndex === agenda.schedule.length}
							<div class="flex items-center gap-2" aria-hidden="true">
								<div
									class="w-12 shrink-0 text-right text-2xs sm:w-16 font-medium tabular-nums text-accent"
								>
									{fmtTime(new Date(nowMs).toISOString())}
								</div>
								<div class="h-px flex-1 bg-accent/40"></div>
							</div>
						{/if}
					</div>
				</section>
			{/if}

			{#if agenda.anytime.length > 0}
				<section class="mt-4" aria-label="Tasks without a set time">
					<div class="mb-1.5 flex items-center gap-2">
						<h2 class="text-sm font-semibold tracking-tight text-foreground">
							Anytime today
						</h2>
						<span class="text-xs tabular-nums text-muted-foreground"
							>{agenda.anytime.length}</span
						>
					</div>
					<div class="space-y-1">
						{#each agenda.anytime as task (task.id)}
							<TodayAgendaRow
								kind="task"
								title={task.title}
								timeLabel={null}
								metaLabel={task.bucket === 'due_today'
									? 'Due today'
									: task.bucket === 'starts_today'
										? 'Starts today'
										: null}
								stateKey={task.state_key}
								done={doneIds.has(task.id)}
								projectName={task.project_name}
								projectHref={`/projects/${task.project_id}`}
								onChat={() => openTaskChat(task)}
								onOpenTask={() => openTask(task)}
								onToggleDone={() => toggleDone(task)}
							/>
						{/each}
					</div>
				</section>
			{/if}

			{#if isClearDay && hasProjects}
				{#if waitingProjects.length > 0}
					<!-- Nothing dated today, but there's undated work. Surface each project's
					     next move so the day is never a dead end. -->
					<section class="mt-4" aria-label="What's waiting">
						<div class="rounded-lg border border-border bg-card p-4 shadow-ink sm:p-6">
							<div class="mb-3 flex items-center gap-2">
								<Sparkles class="h-4 w-4 shrink-0 text-accent" />
								<h2 class="text-sm font-semibold tracking-tight text-foreground">
									Here's what's waiting
								</h2>
							</div>
							<ul class="flex flex-col gap-1">
								{#each waitingProjects as project (project.id)}
									<li>
										<a
											href={`/projects/${project.id}`}
											class="group flex min-h-11 items-start gap-3 rounded-md py-3 motion-reduce:transition-none hover:bg-accent/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
											title={project.next_step_long ??
												project.next_step_short ??
												project.name}
										>
											<span class="micro-label mt-1 shrink-0 text-accent">
												Next
											</span>
											<span class="min-w-0 flex-1">
												<span
													class="block text-sm leading-relaxed text-foreground [overflow-wrap:anywhere]"
												>
													{project.next_step_short}
												</span>
												<span
													class="mt-1 block truncate text-xs text-muted-foreground"
												>
													{project.name}
												</span>
											</span>
										</a>
									</li>
								{/each}
							</ul>
							<div class="mt-3">
								<Button
									onclick={openDayChat}
									variant="outline"
									size="sm"
									icon={MessageCircle}
								>
									Plan my day
								</Button>
							</div>
						</div>
					</section>
				{:else}
					<div
						class="mt-8 flex flex-col items-center gap-4 rounded-lg border border-border bg-card p-6 shadow-ink sm:p-10 text-center"
					>
						<div class="p-2 sm:p-3 rounded-md bg-accent/10 border border-accent/20">
							<Sparkles class="h-4 w-4 sm:h-5 sm:w-5 text-accent" />
						</div>
						<div>
							<h2 class="text-sm font-semibold tracking-tight text-foreground">
								{#if feed.overdueCount > 0}
									Nothing due today
								{:else}
									Clear day ahead
								{/if}
							</h2>
							<p class="mt-1 text-sm leading-relaxed text-muted-foreground">
								{#if feed.overdueCount > 0}
									Nothing scheduled today. You have {feed.overdueCount} overdue — triage
									them or plan the day with a chat.
								{:else}
									Nothing scheduled and no tasks due. Capture what's on your mind
									or plan the day with a chat.
								{/if}
							</p>
						</div>
						<Button
							onclick={openDayChat}
							variant="outline"
							size="sm"
							icon={MessageCircle}
						>
							Plan my day
						</Button>
					</div>
				{/if}
			{/if}
		{/if}
		{#if changesFeed}
			<WhatChangedSection feed={changesFeed} onChatAboutEntry={openReceiptChat} />
		{/if}
	</main>
</div>

{#if AgentChatModalComponent && chatOpen}
	<AgentChatModalComponent
		isOpen={true}
		contextType={chatConfig.contextType ?? 'global'}
		entityId={chatConfig.entityId}
		initialProjectFocus={chatConfig.focus ?? null}
		initialDraft={chatConfig.draft ?? null}
		autoSendInitialDraft={chatConfig.autoSend ?? false}
		onClose={handleChatClose}
	/>
{/if}

{#if InboxModalComponent}
	<InboxModalComponent isOpen={inboxOpen} onClose={handleInboxClose} />
{/if}

{#if OverdueModalComponent}
	<OverdueModalComponent isOpen={overdueOpen} onClose={handleOverdueClose} />
{/if}

{#if TaskEditModalComponent && selectedTask}
	<TaskEditModalComponent
		taskId={selectedTask.id}
		projectId={selectedTask.project_id}
		onClose={closeTask}
		onUpdated={handleTaskChanged}
		onDeleted={handleTaskChanged}
	/>
{/if}
