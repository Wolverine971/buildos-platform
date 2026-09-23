<!-- apps/web/src/lib/components/scheduling/CalendarItemPanel.svelte -->
<!--
	Side panel for a clicked calendar item. Everything the calendar row already knows
	(title, when, how long) renders instantly; task/event details fill in as they load.
	Quick actions (done, move, join) are callbacks so the page owns writes and refreshes.
-->
<script lang="ts" module>
	export type CalendarPanelAction = 'done' | 'reopen' | 'tomorrow' | 'nextWeek';
</script>

<script lang="ts">
	import { format, formatDistanceToNowStrict } from 'date-fns';
	import {
		ArrowUpRight,
		CalendarDays,
		CheckCircle2,
		ChevronRight,
		Circle,
		CircleHelp,
		Clock,
		FileText,
		FolderOpen,
		ListChecks,
		MapPin,
		Milestone,
		Pencil,
		Repeat,
		RotateCcw,
		Target,
		TriangleAlert,
		User,
		Users,
		Video,
		XCircle
	} from '$lib/icons/lucide';
	import CalendarItemDrawer from './CalendarItemDrawer.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { parseLocalDate } from '$lib/utils/schedulingUtils';
	import {
		describeCalendarItemTiming,
		htmlToPlainText,
		planQuickReschedule,
		type CalendarItemTiming,
		type CalendarTimingInput,
		type QuickReschedulePreset
	} from '$lib/utils/calendar-item-timing';
	import {
		getDashboardCalendarAttendees,
		getDashboardCalendarItemTitle,
		isConnectedGoogleCalendarItem,
		type DashboardCalendarAttendee
	} from '$lib/services/dashboard-calendar-items';
	import type {
		CalendarItem,
		CalendarItemDetail,
		CalendarLinkedEntity,
		DashboardCalendarProjectSummary
	} from '$lib/types/calendar-items';

	interface Props {
		item: CalendarItem;
		detail: CalendarItemDetail | null;
		project: DashboardCalendarProjectSummary | null;
		loading?: boolean;
		error?: string | null;
		busyAction?: CalendarPanelAction | null;
		onClose: () => void;
		onMarkDone?: () => void;
		onReopen?: () => void;
		onReschedule?: (preset: QuickReschedulePreset) => void;
		onEditTask?: () => void;
		onEditEvent?: () => void;
	}

	let {
		item,
		detail,
		project,
		loading = false,
		error = null,
		busyAction = null,
		onClose,
		onMarkDone,
		onReopen,
		onReschedule,
		onEditTask,
		onEditEvent
	}: Props = $props();

	const GUEST_PREVIEW_COUNT = 6;
	const NOTES_CLAMP_CHARS = 420;
	const HEX_COLOR = /^#[0-9a-f]{6}$/i;

	let showAllGuests = $state(false);
	let notesExpanded = $state(false);

	let isTask = $derived(item.item_type === 'task');
	let isGoogle = $derived(item.source_table === 'google_calendar');
	let task = $derived(detail?.type === 'task' ? detail.data : null);
	let eventData = $derived(detail?.type === 'event' ? detail.data : null);
	let stateKey = $derived<string | null>(task?.state_key ?? item.state_key ?? null);
	let isDone = $derived(isTask && stateKey === 'done');
	let busy = $derived(busyAction !== null);

	function parseDate(value: unknown): Date | null {
		if (typeof value !== 'string' || !value) return null;
		const parsed = parseLocalDate(value);
		return Number.isNaN(parsed.getTime()) ? null : parsed;
	}

	let timingInput = $derived.by((): CalendarTimingInput | null => {
		if (isTask) {
			const kind = item.item_kind === 'event' ? 'range' : item.item_kind;
			// Due markers are drawn as a 30-minute block ending at the deadline.
			const due = parseDate(task?.due_at) ?? (kind === 'due' ? parseDate(item.end_at) : null);
			const start =
				parseDate(task?.start_at) ?? (kind !== 'due' ? parseDate(item.start_at) : null);
			const completedAt = isDone
				? (parseDate(task?.completed_at) ?? parseDate(task?.updated_at) ?? new Date())
				: null;
			if (kind === 'due') return due ? { kind, start: due, completedAt } : null;
			if (kind === 'start') return start ? { kind, start, completedAt } : null;
			return start ? { kind: 'range', start, end: due, completedAt } : null;
		}
		const start = parseDate(eventData?.start_at) ?? parseDate(item.start_at);
		if (!start) return null;
		return {
			kind: 'event',
			start,
			end: parseDate(eventData?.end_at) ?? parseDate(item.end_at),
			allDay: Boolean(eventData?.all_day ?? item.all_day)
		};
	});
	let timing = $derived<CalendarItemTiming | null>(
		timingInput ? describeCalendarItemTiming(timingInput) : null
	);

	let eyebrowLabel = $derived.by(() => {
		if (isTask) {
			if (item.item_kind === 'due') return 'Task · Due date';
			if (item.item_kind === 'start') return 'Task · Start date';
			return 'Task · Scheduled';
		}
		if (isGoogle) return 'Google Calendar';
		return 'BuildOS event';
	});

	let accentColor = $derived(
		item.calendar_source_color && HEX_COLOR.test(item.calendar_source_color)
			? item.calendar_source_color
			: null
	);
	let calendarLabel = $derived(
		isConnectedGoogleCalendarItem(item)
			? (item.calendar_source_label ?? 'Google Calendar')
			: 'BuildOS'
	);

	let tomorrowPlan = $derived(task ? planQuickReschedule(task, 'tomorrow') : null);
	let nextWeekPlan = $derived(task ? planQuickReschedule(task, 'nextWeek') : null);

	let meetingUrl = $derived(
		typeof item.props?.meeting_url === 'string' ? (item.props.meeting_url as string) : null
	);
	let externalLink = $derived(
		(eventData?.external_link as string | undefined) ??
			(item.props?.external_link as string | undefined) ??
			null
	);
	let location = $derived(
		(eventData?.location as string | undefined) ??
			(item.props?.location as string | undefined) ??
			null
	);
	let organizer = $derived(
		(item.props?.organizer as { displayName?: string | null; email?: string | null } | null) ??
			null
	);
	let isRecurring = $derived(
		item.props?.is_recurring === true ||
			(Array.isArray(eventData?.recurrence) && eventData.recurrence.length > 0) ||
			Boolean(
				eventData?.recurrence &&
					typeof eventData.recurrence === 'object' &&
					!Array.isArray(eventData.recurrence) &&
					Object.keys(eventData.recurrence).length > 0
			)
	);
	let syncError = $derived(
		eventData?.sync_status === 'failed'
			? ((eventData.sync_error as string | null) ?? 'Google sync failed')
			: null
	);

	let attendees = $derived(getDashboardCalendarAttendees(item));
	let visibleAttendees = $derived(
		showAllGuests ? attendees : attendees.slice(0, GUEST_PREVIEW_COUNT)
	);
	let attendeeSummary = $derived.by(() => {
		const counts = { accepted: 0, tentative: 0, declined: 0, needsAction: 0 };
		for (const attendee of attendees) counts[attendee.response] += 1;
		return [
			counts.accepted ? `${counts.accepted} yes` : null,
			counts.tentative ? `${counts.tentative} maybe` : null,
			counts.declined ? `${counts.declined} no` : null,
			counts.needsAction ? `${counts.needsAction} awaiting` : null
		]
			.filter(Boolean)
			.join(' · ');
	});

	let notes = $derived.by((): string | null => {
		if (isGoogle) {
			const raw = item.props?.description;
			return typeof raw === 'string' && raw.trim() ? htmlToPlainText(raw) : null;
		}
		const source = task ?? eventData;
		const props = (source?.props ?? {}) as Record<string, unknown>;
		const value = source?.description ?? props.description ?? props.details;
		if (typeof value !== 'string' || !value.trim()) return null;
		// Some agent-written notes store escaped "\n" sequences; show them as line breaks.
		return value.replace(/\\n/g, '\n').trim();
	});
	let notesTooLong = $derived((notes?.length ?? 0) > NOTES_CLAMP_CHARS);

	let assignees = $derived(
		Array.isArray(task?.assignees)
			? (task.assignees as { name?: string | null; email?: string | null }[])
					.map((assignee) => assignee.name || assignee.email)
					.filter((name): name is string => Boolean(name))
			: []
	);

	type LinkedGroup = {
		key: string;
		label: string;
		entity: string;
		items: CalendarLinkedEntity[];
	};
	let linkedGroups = $derived.by((): LinkedGroup[] => {
		if (detail?.type !== 'task' || !detail.linkedEntities) return [];
		const linked = detail.linkedEntities;
		return [
			{ key: 'goals', label: 'Goals', entity: 'goal', items: linked.goals },
			{
				key: 'milestones',
				label: 'Milestones',
				entity: 'milestone',
				items: linked.milestones
			},
			{ key: 'plans', label: 'Plans', entity: 'plan', items: linked.plans },
			{ key: 'documents', label: 'Documents', entity: 'document', items: linked.documents },
			{
				key: 'dependentTasks',
				label: 'Related tasks',
				entity: 'task',
				items: linked.dependentTasks
			}
		].filter((group) => group.items.length > 0);
	});

	let updatedAt = $derived(parseDate(task?.updated_at ?? eventData?.updated_at));
	let createdAt = $derived(parseDate(task?.created_at ?? eventData?.created_at));

	function projectHref(projectId: string, entity?: string, entityId?: string): string {
		const base = `/projects/${encodeURIComponent(projectId)}`;
		if (!entity || !entityId) return base;
		return `${base}?${new URLSearchParams({ entity, entity_id: entityId })}`;
	}

	function mapsHref(value: string): string {
		return /^https?:\/\//i.test(value)
			? value
			: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(value)}`;
	}

	function formatDateTime(value: unknown): string | null {
		const date = parseDate(value);
		if (!date) return null;
		const sameYear = date.getFullYear() === new Date().getFullYear();
		return format(date, sameYear ? "EEE, MMM d 'at' h:mm a" : "EEE, MMM d, yyyy 'at' h:mm a");
	}

	function stateLabel(value: string | null | undefined): string {
		const labels: Record<string, string> = {
			todo: 'To do',
			in_progress: 'In progress',
			blocked: 'Blocked',
			done: 'Done',
			planning: 'Planning',
			active: 'Active',
			paused: 'Paused',
			completed: 'Completed',
			cancelled: 'Cancelled',
			scheduled: 'Scheduled'
		};
		if (!value) return 'Unknown';
		return labels[value] ?? value.replace(/_/g, ' ');
	}

	function stateClass(value: string | null | undefined): string {
		const classes: Record<string, string> = {
			in_progress: 'bg-info/10 text-info',
			active: 'bg-info/10 text-info',
			scheduled: 'bg-info/10 text-info',
			blocked: 'bg-destructive/10 text-destructive',
			done: 'bg-success/10 text-success',
			completed: 'bg-success/10 text-success',
			planning: 'bg-accent/10 text-accent',
			paused: 'bg-warning/15 text-foreground'
		};
		return (value && classes[value]) || 'bg-muted text-muted-foreground';
	}

	// Same scale as the task editor: 1 = P1 Critical … 5 = P5 Nice to have.
	const PRIORITY_LABELS: Record<number, string> = {
		1: 'P1 Critical',
		2: 'P2 High',
		3: 'P3 Medium',
		4: 'P4 Low',
		5: 'P5 Nice to have'
	};

	function priorityLabel(value: unknown): string | null {
		return typeof value === 'number' ? (PRIORITY_LABELS[value] ?? null) : null;
	}

	function toneClass(tone: CalendarItemTiming['tone']): string {
		if (tone === 'overdue') return 'text-destructive';
		if (tone === 'now' || tone === 'done') return 'text-success';
		if (tone === 'soon') return 'text-accent';
		return 'text-muted-foreground';
	}

	function toneDotClass(tone: CalendarItemTiming['tone']): string {
		if (tone === 'overdue') return 'bg-destructive';
		if (tone === 'now' || tone === 'done') return 'bg-success';
		if (tone === 'soon') return 'bg-accent';
		return 'bg-muted-foreground/60';
	}

	function glyphClass(): string {
		if (item.item_kind === 'due') return 'h-2 w-2 rotate-45 rounded-[1px] bg-warning';
		if (item.item_kind === 'start') return 'h-2.5 w-2.5 rounded-full border-2 border-info';
		if (item.item_kind === 'range') return 'h-2 w-3 rounded-sm bg-success';
		return accentColor ? 'h-2.5 w-2.5 rounded-full' : 'h-2.5 w-2.5 rounded-full bg-accent';
	}

	function attendeeLabel(attendee: DashboardCalendarAttendee): string {
		return attendee.name || attendee.email || 'Guest';
	}

	function attendeeInitial(attendee: DashboardCalendarAttendee): string {
		return attendeeLabel(attendee).trim().charAt(0).toUpperCase() || '?';
	}

	function linkedLabel(entity: CalendarLinkedEntity): string {
		return entity.title || entity.name || 'Untitled';
	}

	function planTitle(plan: ReturnType<typeof planQuickReschedule>): string {
		if (!task) return 'Loading task…';
		if (!plan) return 'Already there';
		return `Move to ${format(plan.targetDay, 'EEE, MMM d')}`;
	}

	const linkButtonClass =
		'inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-border-strong/60 bg-card px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none';
</script>

{#snippet detailRow(label: string, Icon: typeof Clock)}
	<dt class="flex items-center gap-1.5 pt-0.5 text-xs text-muted-foreground">
		<Icon class="h-3.5 w-3.5 shrink-0" />
		{label}
	</dt>
{/snippet}

<CalendarItemDrawer isOpen={true} {onClose} title={getDashboardCalendarItemTitle(item)}>
	{#snippet eyebrow()}
		<span
			class="inline-block shrink-0 {glyphClass()}"
			style={accentColor && !isTask ? `background-color: ${accentColor}` : undefined}
			aria-hidden="true"
		></span>
		<span class="truncate">{eyebrowLabel}</span>
	{/snippet}

	{#snippet summary()}
		{#if timing}
			<div class="space-y-1.5">
				<p class="flex items-center gap-2 text-sm font-medium text-foreground">
					<CalendarDays class="h-4 w-4 shrink-0 text-muted-foreground" />
					<span class="min-w-0">{timing.dateLabel}</span>
				</p>
				<p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-foreground">
					<Clock class="h-4 w-4 shrink-0 text-muted-foreground" />
					<span class="tabular-nums">{timing.timeLabel}</span>
					{#if timing.durationLabel}
						<span
							class="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-foreground"
						>
							{timing.durationLabel}
						</span>
					{/if}
				</p>
				{#if timing.relativeLabel}
					<p
						class="flex items-center gap-2 text-xs font-semibold {toneClass(
							timing.tone
						)}"
					>
						<span
							class="mx-[5px] h-1.5 w-1.5 shrink-0 rounded-full {toneDotClass(
								timing.tone
							)}"
						></span>
						{timing.relativeLabel}
					</p>
				{/if}
			</div>
		{/if}
	{/snippet}

	<div class="space-y-5">
		<!-- Quick actions -->
		{#if isTask && item.task_id}
			<div class="flex flex-wrap items-center gap-2">
				{#if isDone}
					<Button
						variant="outline"
						size="sm"
						icon={RotateCcw}
						loading={busyAction === 'reopen'}
						disabled={busy}
						onclick={() => onReopen?.()}
					>
						Reopen
					</Button>
				{:else}
					<Button
						variant="primary"
						size="sm"
						icon={CheckCircle2}
						loading={busyAction === 'done'}
						disabled={busy}
						onclick={() => onMarkDone?.()}
					>
						Mark done
					</Button>
					<span class="ml-1 text-xs text-muted-foreground">Move to</span>
					<Button
						variant="outline"
						size="sm"
						loading={busyAction === 'tomorrow'}
						disabled={busy || !tomorrowPlan}
						title={planTitle(tomorrowPlan)}
						onclick={() => onReschedule?.('tomorrow')}
					>
						Tomorrow
					</Button>
					<Button
						variant="outline"
						size="sm"
						loading={busyAction === 'nextWeek'}
						disabled={busy || !nextWeekPlan}
						title={planTitle(nextWeekPlan)}
						onclick={() => onReschedule?.('nextWeek')}
					>
						Next week
					</Button>
				{/if}
			</div>
		{:else if meetingUrl}
			<div class="flex flex-wrap items-center gap-2">
				<a
					href={meetingUrl}
					target="_blank"
					rel="noopener noreferrer"
					class="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-accent bg-accent px-4 text-sm font-semibold text-accent-foreground shadow-ink transition-colors hover:bg-accent/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
				>
					<Video class="h-4 w-4" />
					Join meeting
				</a>
			</div>
		{/if}

		<!-- Status -->
		{#if isTask}
			<div class="flex flex-wrap items-center gap-1.5">
				<span
					class="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold {stateClass(
						stateKey
					)}"
				>
					{#if isDone}
						<CheckCircle2 class="h-3 w-3" />
					{:else}
						<Circle class="h-3 w-3" />
					{/if}
					{stateLabel(stateKey)}
				</span>
				{#if priorityLabel(task?.priority)}
					<span
						class="rounded-full px-2.5 py-0.5 text-xs font-semibold {task?.priority ===
							1 || task?.priority === 2
							? 'bg-destructive/10 text-destructive'
							: 'bg-muted text-muted-foreground'}"
					>
						{priorityLabel(task?.priority)}
					</span>
				{/if}
				{#if task?.facet_scale}
					<span
						class="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium capitalize text-muted-foreground"
					>
						{task.facet_scale}
					</span>
				{/if}
			</div>
		{/if}

		{#if error}
			<p
				class="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
			>
				{error}
			</p>
		{/if}

		<!-- Details -->
		<dl class="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 gap-y-3 text-sm">
			{#if item.project_id}
				{@render detailRow('Project', FolderOpen)}
				<dd class="min-w-0">
					<a
						href={projectHref(item.project_id)}
						target="_blank"
						rel="noopener"
						class="group inline-flex max-w-full items-center gap-1.5 font-medium text-foreground hover:text-accent"
					>
						<span class="truncate">{project?.name ?? 'Open project'}</span>
						<ArrowUpRight
							class="h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-accent"
						/>
					</a>
					{#if project?.description}
						<p class="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
							{project.description}
						</p>
					{/if}
				</dd>
			{/if}

			{#if !isTask}
				{@render detailRow('Calendar', CalendarDays)}
				<dd class="flex min-w-0 items-center gap-2">
					<span
						class="h-2.5 w-2.5 shrink-0 rounded-full {accentColor ? '' : 'bg-accent'}"
						style={accentColor ? `background-color: ${accentColor}` : undefined}
						aria-hidden="true"
					></span>
					<span class="truncate text-foreground">{calendarLabel}</span>
				</dd>
			{/if}

			{#if isTask && task}
				{@render detailRow('Assigned', User)}
				<dd class="min-w-0 text-foreground">
					{assignees.length > 0 ? assignees.join(', ') : 'Unassigned'}
				</dd>
				{#if task.start_at}
					{@render detailRow('Starts', CalendarDays)}
					<dd class="text-foreground">{formatDateTime(task.start_at)}</dd>
				{/if}
				{#if task.due_at}
					{@render detailRow('Due', Target)}
					<dd class="text-foreground">{formatDateTime(task.due_at)}</dd>
				{/if}
				{#if task.completed_at}
					{@render detailRow('Completed', CheckCircle2)}
					<dd class="text-success">{formatDateTime(task.completed_at)}</dd>
				{/if}
			{/if}

			{#if location}
				{@render detailRow('Where', MapPin)}
				<dd class="min-w-0">
					<a
						href={mapsHref(location)}
						target="_blank"
						rel="noopener noreferrer"
						class="break-words text-foreground underline decoration-border-strong underline-offset-2 hover:text-accent"
					>
						{location}
					</a>
				</dd>
			{/if}

			{#if organizer && (organizer.displayName || organizer.email)}
				{@render detailRow('Organizer', User)}
				<dd class="min-w-0 truncate text-foreground">
					{organizer.displayName || organizer.email}
				</dd>
			{/if}

			{#if isRecurring}
				{@render detailRow('Repeats', Repeat)}
				<dd class="text-foreground">Recurring event</dd>
			{/if}
		</dl>

		{#if loading && !detail}
			<div class="space-y-2" aria-label="Loading details">
				<div
					class="h-3 w-2/3 animate-pulse rounded bg-muted motion-reduce:animate-none"
				></div>
				<div
					class="h-3 w-1/2 animate-pulse rounded bg-muted motion-reduce:animate-none"
				></div>
				<div
					class="h-3 w-3/4 animate-pulse rounded bg-muted motion-reduce:animate-none"
				></div>
			</div>
		{/if}

		{#if syncError}
			<p
				class="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-foreground"
			>
				<TriangleAlert class="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
				<span>Not synced to Google Calendar: {syncError}</span>
			</p>
		{/if}

		<!-- Guests -->
		{#if attendees.length > 0}
			<section>
				<div class="mb-2 flex items-baseline justify-between gap-2">
					<h3 class="flex items-center gap-1.5 text-sm font-semibold text-foreground">
						<Users class="h-4 w-4 text-muted-foreground" />
						{attendees.length}
						{attendees.length === 1 ? 'guest' : 'guests'}
					</h3>
					<span class="truncate text-xs text-muted-foreground">{attendeeSummary}</span>
				</div>
				<ul class="space-y-1.5">
					{#each visibleAttendees as attendee, index (`${attendee.email ?? attendee.name}-${index}`)}
						<li class="flex min-w-0 items-center gap-2.5">
							<span
								class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground"
								aria-hidden="true"
							>
								{attendeeInitial(attendee)}
							</span>
							<span class="min-w-0 flex-1">
								<span class="block truncate text-sm text-foreground">
									{attendeeLabel(attendee)}
									{#if attendee.self}<span class="text-muted-foreground">
											(you)</span
										>{/if}
								</span>
								{#if attendee.organizer || attendee.optional || (attendee.name && attendee.email)}
									<span class="block truncate text-xs text-muted-foreground">
										{[
											attendee.organizer ? 'Organizer' : null,
											attendee.optional ? 'Optional' : null,
											attendee.name ? attendee.email : null
										]
											.filter(Boolean)
											.join(' · ')}
									</span>
								{/if}
							</span>
							{#if attendee.response === 'accepted'}
								<CheckCircle2 class="h-4 w-4 shrink-0 text-success" />
								<span class="sr-only">Going</span>
							{:else if attendee.response === 'declined'}
								<XCircle class="h-4 w-4 shrink-0 text-destructive" />
								<span class="sr-only">Not going</span>
							{:else if attendee.response === 'tentative'}
								<CircleHelp class="h-4 w-4 shrink-0 text-warning" />
								<span class="sr-only">Maybe</span>
							{:else}
								<Circle class="h-4 w-4 shrink-0 text-muted-foreground/60" />
								<span class="sr-only">Awaiting reply</span>
							{/if}
						</li>
					{/each}
				</ul>
				{#if attendees.length > GUEST_PREVIEW_COUNT}
					<button
						type="button"
						onclick={() => (showAllGuests = !showAllGuests)}
						class="mt-2 text-xs font-medium text-accent hover:underline"
					>
						{showAllGuests ? 'Show fewer' : `Show all ${attendees.length} guests`}
					</button>
				{/if}
			</section>
		{/if}

		<!-- Notes -->
		{#if notes}
			<section>
				<h3 class="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-foreground">
					<FileText class="h-4 w-4 text-muted-foreground" />
					Notes
				</h3>
				<p
					class="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground {notesTooLong &&
					!notesExpanded
						? 'line-clamp-6'
						: ''}"
				>
					{notes}
				</p>
				{#if notesTooLong}
					<button
						type="button"
						onclick={() => (notesExpanded = !notesExpanded)}
						class="mt-1 text-xs font-medium text-accent hover:underline"
					>
						{notesExpanded ? 'Show less' : 'Show more'}
					</button>
				{/if}
			</section>
		{/if}

		<!-- Linked work -->
		{#if linkedGroups.length > 0 && item.project_id}
			<section class="space-y-3">
				<h3 class="flex items-center gap-1.5 text-sm font-semibold text-foreground">
					<ListChecks class="h-4 w-4 text-muted-foreground" />
					Connected work
				</h3>
				{#each linkedGroups as group (group.key)}
					<div>
						<p class="micro-label mb-1">{group.label}</p>
						<ul class="space-y-0.5">
							{#each group.items as entity (entity.id)}
								<li>
									<a
										href={projectHref(item.project_id, group.entity, entity.id)}
										target="_blank"
										rel="noopener"
										class="flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted motion-reduce:transition-none"
									>
										{#if group.key === 'goals'}
											<Target class="h-3.5 w-3.5 shrink-0 text-warning" />
										{:else if group.key === 'milestones'}
											<Milestone class="h-3.5 w-3.5 shrink-0 text-info" />
										{:else if group.key === 'plans'}
											<ListChecks class="h-3.5 w-3.5 shrink-0 text-accent" />
										{:else if group.key === 'documents'}
											<FileText class="h-3.5 w-3.5 shrink-0 text-info" />
										{:else}
											<ChevronRight
												class="h-3.5 w-3.5 shrink-0 text-muted-foreground"
											/>
										{/if}
										<span class="min-w-0 flex-1 truncate text-foreground"
											>{linkedLabel(entity)}</span
										>
										{#if entity.due_at}
											<span class="shrink-0 text-xs text-muted-foreground">
												{format(new Date(entity.due_at), 'MMM d')}
											</span>
										{:else if entity.state_key}
											<span
												class="shrink-0 rounded-full px-1.5 py-0.5 text-2xs font-medium {stateClass(
													entity.state_key
												)}"
											>
												{stateLabel(entity.state_key)}
											</span>
										{/if}
									</a>
								</li>
							{/each}
						</ul>
					</div>
				{/each}
			</section>
		{/if}

		{#if updatedAt || createdAt}
			<p class="border-t border-border pt-3 text-xs text-muted-foreground">
				{#if createdAt}Created {format(createdAt, 'MMM d, yyyy')}{/if}
				{#if createdAt && updatedAt}
					·
				{/if}
				{#if updatedAt}Updated {formatDistanceToNowStrict(updatedAt, {
						addSuffix: true
					})}{/if}
			</p>
		{/if}
	</div>

	{#snippet footer()}
		<div class="flex flex-wrap items-center gap-2">
			{#if isTask && item.task_id && item.project_id}
				<Button variant="outline" size="sm" icon={Pencil} onclick={() => onEditTask?.()}>
					Edit task
				</Button>
				<a
					href={projectHref(item.project_id, 'task', item.task_id)}
					target="_blank"
					rel="noopener"
					class={linkButtonClass}
				>
					Open task
					<ArrowUpRight class="h-3.5 w-3.5" />
				</a>
			{:else if item.event_id && item.project_id}
				<Button variant="outline" size="sm" icon={Pencil} onclick={() => onEditEvent?.()}>
					Edit event
				</Button>
			{/if}
			{#if externalLink}
				<a
					href={externalLink}
					target="_blank"
					rel="noopener noreferrer"
					class={linkButtonClass}
				>
					Open in Google Calendar
					<ArrowUpRight class="h-3.5 w-3.5" />
				</a>
			{/if}
		</div>
	{/snippet}
</CalendarItemDrawer>
