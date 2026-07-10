<!-- apps/web/src/routes/today/+page.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { formatInTimeZone } from 'date-fns-tz';
	import type { ChatContextType, ProjectFocus } from '@buildos/shared-types';
	import type { PageData } from './$types';

	import Button from '$lib/components/ui/Button.svelte';
	import TodayAgendaRow from '$lib/components/today/TodayAgendaRow.svelte';
	import WhatChangedSection from '$lib/components/today/WhatChangedSection.svelte';
	import {
		AlertCircle,
		Calendar,
		Inbox,
		MessageCircle,
		RefreshCcw,
		Sparkles,
		Sun
	} from '$lib/icons/lucide';
	import { requireApiData } from '$lib/utils/api-client-helpers';
	import { toastService } from '$lib/stores/toast.store';
	import type { CalendarItem } from '$lib/types/calendar-items';
	import type { TodayFeed, TodayTask, WhatChangedFeed } from '$lib/types/today';

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
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let AgentChatModalComponent = $state<any>(null);
	let chatOpen = $state(false);
	let chatConfig = $state<{
		contextType?: ChatContextType;
		entityId?: string;
		focus?: ProjectFocus | null;
		draft?: string | null;
	}>({});

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let InboxModalComponent = $state<any>(null);
	let inboxOpen = $state(false);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let OverdueModalComponent = $state<any>(null);
	let overdueOpen = $state(false);

	const timezone = $derived(feed?.timezone ?? 'UTC');
	const dateLabel = $derived(
		feed ? formatInTimeZone(new Date(feed.dayStart), feed.timezone, 'EEEE, MMMM d') : ''
	);

	function fmtTime(iso: string): string {
		return formatInTimeZone(new Date(iso), timezone, 'h:mm a');
	}

	function hasClockTime(iso: string): boolean {
		// Midnight and 11:59 PM are date-only conventions ("today", "by end of day"),
		// not real clock times — those belong in "Anytime today", not on the time rail.
		const clock = formatInTimeZone(new Date(iso), timezone, 'HH:mm');
		return clock !== '00:00' && clock !== '23:59';
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
			const projectName = projectNameFor(event.project_id);
			const range = `${fmtTime(event.start_at)}${event.end_at ? ` – ${fmtTime(event.end_at)}` : ''}`;
			schedule.push({
				key: `event-${event.calendar_item_id}`,
				sortMs: startMs,
				endMs,
				kind: 'event',
				title: event.title ?? 'Untitled event',
				timeLabel: fmtTime(event.start_at),
				metaLabel: projectName ? `${range} · ${projectName}` : range,
				event,
				linkedTask: event.task_id ? (taskById.get(event.task_id) ?? null) : null
			});
		}

		const anytime: TodayTask[] = [];
		for (const task of feed.tasks) {
			if (scheduledTaskIds.has(task.id)) continue;
			if (task.bucket === 'due_today' && task.due_at && hasClockTime(task.due_at)) {
				schedule.push({
					key: `task-${task.id}`,
					sortMs: new Date(task.due_at).getTime(),
					endMs: null,
					kind: 'task',
					title: task.title,
					timeLabel: fmtTime(task.due_at),
					metaLabel: `Due ${fmtTime(task.due_at)} · ${task.project_name}`,
					task
				});
			} else if (task.bucket === 'starts_today' && task.start_at && hasClockTime(task.start_at)) {
				schedule.push({
					key: `task-${task.id}`,
					sortMs: new Date(task.start_at).getTime(),
					endMs: null,
					kind: 'task',
					title: task.title,
					timeLabel: fmtTime(task.start_at),
					metaLabel: `Starts ${fmtTime(task.start_at)} · ${task.project_name}`,
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

	const summaryLine = $derived.by(() => {
		if (!feed) return '';
		const parts: string[] = [];
		parts.push(`${eventCount} ${eventCount === 1 ? 'event' : 'events'}`);
		parts.push(`${openTaskCount} ${openTaskCount === 1 ? 'task' : 'tasks'}`);
		const next = agenda.schedule.find(
			(entry) => entry.sortMs > nowMs && !(entry.task && doneIds.has(entry.task.id))
		);
		if (next) {
			parts.push(`next: ${next.title} at ${next.timeLabel}`);
		}
		return parts.join(' · ');
	});

	const isClearDay = $derived(
		agenda.allDay.length === 0 && agenda.schedule.length === 0 && agenda.anytime.length === 0
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

	async function loadChanges() {
		if (!changesSince) return;
		try {
			const response = await fetch(
				`/api/today/changes?since=${encodeURIComponent(changesSince)}`
			);
			if (!response.ok) return;
			const result = await requireApiData<{ feed: WhatChangedFeed }>(response);
			changesFeed = result.feed;
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

	async function openTaskChat(task: TodayTask) {
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
	}

	async function openEventChat(entry: ScheduleEntry) {
		const event = entry.event;
		if (!event) return;
		if (entry.linkedTask) {
			await openTaskChat(entry.linkedTask);
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
				const project = entry.task?.project_name ?? projectNameFor(entry.event?.project_id ?? null);
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
			lines.push('', `I also have ${feed.overdueCount} overdue task${feed.overdueCount === 1 ? '' : 's'}.`);
		}
		lines.push('', 'Help me review my day and figure out what to focus on.');
		return lines.join('\n').slice(0, 2300);
	}

	async function openDayChat() {
		await ensureChatModal();
		chatConfig = { contextType: 'global', draft: buildDayDraft() };
		chatOpen = true;
	}

	function handleChatClose() {
		chatOpen = false;
		chatConfig = {};
		refresh();
		loadInboxCount();
		loadChanges();
	}

	async function openInbox() {
		if (!InboxModalComponent) {
			InboxModalComponent = (
				await import('$lib/components/dashboard/DashboardInboxModal.svelte')
			).default;
		}
		inboxOpen = true;
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
	<main class="mx-auto max-w-2xl px-3 sm:px-4 py-6 sm:py-10">
		<header>
			<div class="flex items-start justify-between gap-3">
				<div class="min-w-0">
					<p
						class="flex items-center gap-1.5 text-[10px] sm:text-xs font-semibold uppercase tracking-widest text-muted-foreground"
					>
						<Sun class="h-3 w-3 sm:h-3.5 sm:w-3.5 text-warning" />
						Today
					</p>
					<h1 class="mt-1 text-xl sm:text-3xl font-bold text-foreground">
						{dateLabel || 'Your day'}
					</h1>
					{#if summaryLine}
						<p class="mt-1 text-xs sm:text-sm text-muted-foreground">{summaryLine}</p>
					{/if}
				</div>
				<div class="flex-shrink-0 pt-4 sm:pt-5">
					<Button onclick={openDayChat} variant="primary" size="sm" icon={MessageCircle}>
						<span class="hidden sm:inline">Chat about my day</span>
						<span class="sm:hidden">My day</span>
					</Button>
				</div>
			</div>

			<div class="mt-3 sm:mt-4 flex flex-wrap items-center gap-1.5 sm:gap-2">
				{#if inboxCount > 0}
					<button
						onclick={openInbox}
						class="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-2.5 py-1 text-[11px] sm:text-xs font-medium text-accent hover:bg-accent/20 transition-colors pressable focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						<Inbox class="h-3 w-3 sm:h-3.5 sm:w-3.5" />
						{inboxCount} to review
					</button>
				{/if}
				{#if feed && feed.overdueCount > 0}
					<button
						onclick={openOverdue}
						class="inline-flex items-center gap-1.5 rounded-full border border-warning/40 bg-warning/10 px-2.5 py-1 text-[11px] sm:text-xs font-medium text-warning hover:bg-warning/20 transition-colors pressable focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						<AlertCircle class="h-3 w-3 sm:h-3.5 sm:w-3.5" />
						{feed.overdueCount} overdue
					</button>
				{/if}
				<a
					href="/dashboard"
					class="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] sm:text-xs font-medium text-muted-foreground hover:border-accent hover:text-accent transition-colors pressable focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					Full dashboard
				</a>
				<button
					onclick={refresh}
					disabled={refreshing}
					class="ml-auto p-1.5 rounded-md text-muted-foreground hover:text-accent hover:bg-accent/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					title="Refresh"
					aria-label="Refresh today's agenda"
				>
					<RefreshCcw
						class="h-3.5 w-3.5 sm:h-4 sm:w-4 {refreshing
							? 'animate-spin motion-reduce:animate-none'
							: ''}"
					/>
				</button>
			</div>
		</header>

		{#if changesFeed}
			<WhatChangedSection feed={changesFeed} />
		{/if}

		{#if !feed}
			<div class="mt-6 flex items-center gap-3 wt-paper p-3 sm:p-4 tx tx-static tx-weak">
				<div class="p-1.5 sm:p-2 rounded-md bg-destructive/10">
					<AlertCircle class="h-4 w-4 text-destructive" />
				</div>
				<p class="flex-1 text-xs sm:text-sm text-destructive">
					Couldn't load your day.
				</p>
				<Button onclick={refresh} variant="outline" size="sm" loading={refreshing}>
					Retry
				</Button>
			</div>
		{:else}
			{#if agenda.allDay.length > 0}
				<section class="mt-5 sm:mt-6" aria-label="All-day events">
					<div class="flex flex-wrap items-center gap-1.5 sm:gap-2">
						{#each agenda.allDay as event (event.calendar_item_id)}
							<span
								class="inline-flex items-center gap-1.5 rounded-full border border-accent/20 bg-accent/5 px-2.5 py-1 text-[11px] sm:text-xs text-foreground"
							>
								<Calendar class="h-3 w-3 text-accent" />
								{event.title ?? 'Untitled event'}
								{#if projectNameFor(event.project_id)}
									<span class="text-muted-foreground"
										>· {projectNameFor(event.project_id)}</span
									>
								{/if}
							</span>
						{/each}
					</div>
				</section>
			{/if}

			{#if agenda.schedule.length > 0}
				<section class="mt-5 sm:mt-6" aria-label="Today's schedule">
					<h2
						class="mb-2 sm:mb-3 text-[10px] sm:text-xs font-semibold uppercase tracking-widest text-muted-foreground"
					>
						Schedule
					</h2>
					<div class="space-y-2">
						{#each agenda.schedule as entry, index (entry.key)}
							{#if index === nowMarkerIndex}
								<div class="flex items-center gap-2 sm:gap-3" aria-hidden="true">
									<div
										class="w-12 sm:w-16 flex-shrink-0 text-right text-[10px] sm:text-xs font-semibold tabular-nums text-destructive"
									>
										{fmtTime(new Date(nowMs).toISOString())}
									</div>
									<div class="h-px flex-1 bg-destructive/50"></div>
								</div>
							{/if}
							<TodayAgendaRow
								kind={entry.kind}
								title={entry.title}
								timeLabel={entry.timeLabel}
								metaLabel={entry.metaLabel}
								stateKey={entry.task?.state_key ?? entry.linkedTask?.state_key ?? null}
								done={entry.task
									? doneIds.has(entry.task.id)
									: entry.linkedTask
										? doneIds.has(entry.linkedTask.id)
										: false}
								past={entryIsPast(entry)}
								current={entryIsCurrent(entry)}
								projectHref={entry.task
									? `/projects/${entry.task.project_id}`
									: entry.event?.project_id
										? `/projects/${entry.event.project_id}`
										: null}
								onChat={() =>
									entry.kind === 'task' && entry.task
										? openTaskChat(entry.task)
										: openEventChat(entry)}
								onToggleDone={entry.task
									? () => toggleDone(entry.task!)
									: entry.linkedTask
										? () => toggleDone(entry.linkedTask!)
										: null}
							/>
						{/each}
						{#if nowMarkerIndex === agenda.schedule.length}
							<div class="flex items-center gap-2 sm:gap-3" aria-hidden="true">
								<div
									class="w-12 sm:w-16 flex-shrink-0 text-right text-[10px] sm:text-xs font-semibold tabular-nums text-destructive"
								>
									{fmtTime(new Date(nowMs).toISOString())}
								</div>
								<div class="h-px flex-1 bg-destructive/50"></div>
							</div>
						{/if}
					</div>
				</section>
			{/if}

			{#if agenda.anytime.length > 0}
				<section class="mt-5 sm:mt-6" aria-label="Tasks without a set time">
					<h2
						class="mb-2 sm:mb-3 text-[10px] sm:text-xs font-semibold uppercase tracking-widest text-muted-foreground"
					>
						Anytime today
					</h2>
					<div class="space-y-2">
						{#each agenda.anytime as task (task.id)}
							<TodayAgendaRow
								kind="task"
								title={task.title}
								timeLabel={null}
								metaLabel={task.bucket === 'due_today'
									? `Due today · ${task.project_name}`
									: task.bucket === 'starts_today'
										? `Starts today · ${task.project_name}`
										: task.project_name}
								stateKey={task.state_key}
								done={doneIds.has(task.id)}
								projectHref={`/projects/${task.project_id}`}
								onChat={() => openTaskChat(task)}
								onToggleDone={() => toggleDone(task)}
							/>
						{/each}
					</div>
				</section>
			{/if}

			{#if isClearDay}
				<div
					class="mt-8 sm:mt-12 flex flex-col items-center gap-3 wt-ghost border-dashed p-6 sm:p-10 text-center"
				>
					<div class="p-2 sm:p-3 rounded-md bg-accent/10 border border-accent/20">
						<Sparkles class="h-4 w-4 sm:h-5 sm:w-5 text-accent" />
					</div>
					<div>
						<h2 class="text-sm sm:text-base font-semibold text-foreground">
							Clear day ahead
						</h2>
						<p class="mt-1 text-xs sm:text-sm text-muted-foreground">
							Nothing scheduled and no tasks due. Capture what's on your mind or plan
							the day with a chat.
						</p>
					</div>
					<Button onclick={openDayChat} variant="outline" size="sm" icon={MessageCircle}>
						Plan my day
					</Button>
				</div>
			{/if}
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
		onClose={handleChatClose}
	/>
{/if}

{#if InboxModalComponent}
	<InboxModalComponent isOpen={inboxOpen} onClose={handleInboxClose} />
{/if}

{#if OverdueModalComponent}
	<OverdueModalComponent isOpen={overdueOpen} onClose={handleOverdueClose} />
{/if}
