<!-- apps/web/src/lib/components/project/v2/PulseStrip.svelte -->
<!--
	PulseStrip — v2 PoC component

	Two-column "what's happening" header:
	- Left: Recently Done — derived from project activity logs (created/updated/deleted)
	- Right: Up Next — upcoming scheduled work, sorted by date

	Tiles are intentionally small and dense so the page reads as a status board,
	not a doc index. Click a tile to open its entity.
-->
<script lang="ts">
	import {
		ArrowRight,
		Calendar,
		Clock,
		FileText,
		Flag,
		History,
		ListChecks,
		Sparkles,
		Target
	} from 'lucide-svelte';
	import type { ProjectLogEntityType, ProjectLogEntryWithMeta } from '@buildos/shared-types';
	import type { Goal, Milestone, OntoEvent, Task } from '$lib/types/onto';
	import { fetchProjectLogs } from '$lib/components/project/project-page-data-controller';
	import { getEventStartMs, isEventPast } from '$lib/components/project/project-event-filters';

	type UpcomingKind = 'task' | 'milestone' | 'goal' | 'event';

	type UpcomingItem = {
		id: string;
		kind: UpcomingKind;
		title: string;
		date: Date;
		state?: string | null;
		isOverdue: boolean;
	};

	let {
		projectId,
		tasks,
		milestones,
		goals,
		events,
		onOpenEntity
	}: {
		projectId: string;
		tasks: Task[];
		milestones: Milestone[];
		goals: Goal[];
		events: OntoEvent[];
		onOpenEntity: (kind: ProjectLogEntityType, id: string) => void;
	} = $props();

	let logs = $state<ProjectLogEntryWithMeta[]>([]);
	let logsLoading = $state(true);
	let logsError = $state<string | null>(null);

	async function loadLogs() {
		logsLoading = true;
		logsError = null;
		try {
			const page = await fetchProjectLogs({ projectId, limit: 12, offset: 0 });
			logs = page.logs;
		} catch (err) {
			logsError = err instanceof Error ? err.message : 'Failed to load activity';
		} finally {
			logsLoading = false;
		}
	}

	// Effect runs once after first mount AND every time projectId changes.
	// (No `onMount(loadLogs)` — that would double-fetch on the initial render.)
	$effect(() => {
		void projectId;
		void loadLogs();
	});

	// ----------------------------------------------------------------
	// Recently Done — collapse logs into one tile per entity
	// ----------------------------------------------------------------

	type RecentTile = {
		key: string;
		entityType: ProjectLogEntityType;
		entityId: string;
		name: string;
		action: string;
		when: Date;
		actor?: string | null;
		source?: string | null;
	};

	const recentTiles = $derived.by<RecentTile[]>(() => {
		const seen = new Set<string>();
		const out: RecentTile[] = [];
		for (const log of logs) {
			const key = `${log.entity_type}:${log.entity_id}`;
			if (seen.has(key)) continue;
			seen.add(key);
			out.push({
				key,
				entityType: log.entity_type,
				entityId: log.entity_id,
				name: log.entity_name || `${log.entity_type}`,
				action: log.action,
				when: new Date(log.created_at),
				actor: log.actor_display_name ?? log.changed_by_name ?? null,
				source: log.change_source ?? null
			});
			if (out.length >= 6) break;
		}
		return out;
	});

	// ----------------------------------------------------------------
	// Up Next — upcoming dated work
	// ----------------------------------------------------------------

	const upcomingItems = $derived.by<UpcomingItem[]>(() => {
		const items: UpcomingItem[] = [];
		const nowMs = Date.now();

		for (const t of tasks) {
			if (t.state_key === 'done') continue;
			const ref = t.due_at || t.start_at;
			if (!ref) continue;
			const date = new Date(ref);
			const dateMs = date.getTime();
			if (!Number.isFinite(dateMs)) continue;
			items.push({
				id: t.id,
				kind: 'task',
				title: t.title,
				date,
				state: t.state_key,
				isOverdue: dateMs < nowMs
			});
		}

		for (const m of milestones) {
			const state = m.effective_state_key ?? m.state_key;
			if (state === 'completed') continue;
			if (!m.due_at) continue;
			const date = new Date(m.due_at);
			const dateMs = date.getTime();
			if (!Number.isFinite(dateMs)) continue;
			items.push({
				id: m.id,
				kind: 'milestone',
				title: m.title,
				date,
				state,
				isOverdue: dateMs < nowMs
			});
		}

		for (const g of goals) {
			if (g.state_key === 'achieved' || g.state_key === 'abandoned') continue;
			if (!g.target_date) continue;
			const date = new Date(g.target_date);
			const dateMs = date.getTime();
			if (!Number.isFinite(dateMs)) continue;
			items.push({
				id: g.id,
				kind: 'goal',
				title: g.name,
				date,
				state: g.state_key,
				isOverdue: dateMs < nowMs
			});
		}

		for (const event of events) {
			if (event.deleted_at) continue;
			if (event.state_key === 'cancelled' || event.state_key === 'canceled') continue;
			const startMs = getEventStartMs(event);
			if (startMs === null || isEventPast(event, nowMs)) continue;
			const date = new Date(startMs < nowMs ? nowMs : startMs);
			items.push({
				id: event.id,
				kind: 'event',
				title: event.title,
				date,
				state: event.state_key,
				isOverdue: false
			});
		}

		// Sort: overdue first (oldest first), then upcoming (soonest first)
		items.sort((a, b) => {
			if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
			return a.date.getTime() - b.date.getTime();
		});

		return items.slice(0, 6);
	});

	// ----------------------------------------------------------------
	// Display helpers
	// ----------------------------------------------------------------

	function relativeTime(date: Date): string {
		const diffMs = Date.now() - date.getTime();
		const diffSec = Math.round(diffMs / 1000);
		if (diffSec < 60) return 'just now';
		const diffMin = Math.round(diffSec / 60);
		if (diffMin < 60) return `${diffMin}m ago`;
		const diffHr = Math.round(diffMin / 60);
		if (diffHr < 24) return `${diffHr}h ago`;
		const diffDay = Math.round(diffHr / 24);
		if (diffDay < 7) return `${diffDay}d ago`;
		const diffWk = Math.round(diffDay / 7);
		if (diffWk < 4) return `${diffWk}w ago`;
		return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}

	function relativeFuture(date: Date): { label: string; isOverdue: boolean } {
		const diffMs = date.getTime() - Date.now();
		const diffMin = Math.round(diffMs / 60000);
		if (diffMin === 0) return { label: 'now', isOverdue: false };
		if (diffMin < 0) {
			const past = Math.abs(diffMin);
			if (past < 60) return { label: `${past}m late`, isOverdue: true };
			const hrs = Math.round(past / 60);
			if (hrs < 24) return { label: `${hrs}h late`, isOverdue: true };
			const days = Math.round(hrs / 24);
			return { label: `${days}d late`, isOverdue: true };
		}
		if (diffMin < 60) return { label: `in ${diffMin}m`, isOverdue: false };
		const diffHr = Math.round(diffMin / 60);
		if (diffHr < 24) return { label: `in ${diffHr}h`, isOverdue: false };
		const diffDay = Math.round(diffHr / 24);
		if (diffDay < 14) return { label: `in ${diffDay}d`, isOverdue: false };
		return {
			label: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
			isOverdue: false
		};
	}

	function entityIcon(kind: ProjectLogEntityType | UpcomingKind) {
		switch (kind) {
			case 'task':
				return ListChecks;
			case 'milestone':
				return Flag;
			case 'goal':
				return Target;
			case 'plan':
			case 'event':
				return Calendar;
			case 'document':
			case 'note':
			case 'requirement':
				return FileText;
			default:
				return Sparkles;
		}
	}

	function entityAccent(kind: ProjectLogEntityType | UpcomingKind): string {
		switch (kind) {
			case 'task':
				return 'text-sky-500';
			case 'milestone':
				return 'text-amber-500';
			case 'goal':
				return 'text-violet-500';
			case 'plan':
				return 'text-indigo-500';
			case 'event':
				return 'text-rose-500';
			case 'document':
			case 'note':
			case 'requirement':
				return 'text-emerald-500';
			default:
				return 'text-muted-foreground';
		}
	}

	function actionVerb(action: string): string {
		switch (action) {
			case 'created':
				return 'added';
			case 'updated':
				return 'updated';
			case 'deleted':
				return 'removed';
			default:
				return action;
		}
	}

	function sourceLabel(source: string | null): string {
		switch (source) {
			case 'chat':
				return 'chat';
			case 'brain_dump':
				return 'brain dump';
			case 'form':
				return 'form';
			case 'api':
				return 'api';
			case 'agent_call':
				return 'agent call';
			default:
				return '';
		}
	}

	function activityActorPhrase(tile: RecentTile): string {
		if (tile.actor) {
			return `${tile.actor} ${actionVerb(tile.action)}`;
		}
		return actionVerb(tile.action);
	}
</script>

<section class="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4" aria-label="Project pulse">
	<!-- Recently Done -->
	<div
		class="bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak overflow-hidden"
	>
		<header
			class="flex items-center justify-between gap-2 px-3 sm:px-4 py-2 sm:py-3 border-b border-border/60"
		>
			<div class="flex items-center gap-2">
				<div class="w-7 h-7 rounded-md bg-muted/60 flex items-center justify-center">
					<History class="w-3.5 h-3.5 text-muted-foreground" />
				</div>
				<div>
					<p class="text-xs sm:text-sm font-semibold text-foreground">Recent activity</p>
					<p class="text-[10px] sm:text-xs text-muted-foreground">
						What's moved in the last few days
					</p>
				</div>
			</div>
			{#if !logsLoading}
				<span class="text-[10px] uppercase tracking-widest text-muted-foreground/70">
					{recentTiles.length}
				</span>
			{/if}
		</header>

		<div class="p-2 sm:p-3 space-y-1.5">
			{#if logsLoading}
				{#each Array(3) as _, i (i)}
					<div
						class="h-12 bg-muted/40 border border-border/60 rounded-md animate-pulse"
					></div>
				{/each}
			{:else if logsError}
				<p class="text-xs text-destructive px-1 py-2">{logsError}</p>
			{:else if recentTiles.length === 0}
				<p class="text-xs text-muted-foreground px-1 py-3 italic">
					Nothing logged yet. As you work, recent edits show up here.
				</p>
			{:else}
				{#each recentTiles as tile (tile.key)}
					{@const Icon = entityIcon(tile.entityType)}
					<button
						type="button"
						onclick={() => onOpenEntity(tile.entityType, tile.entityId)}
						class="group w-full text-left bg-background hover:bg-muted/50 border border-border/60 hover:border-border rounded-md px-2.5 py-2 transition-colors pressable"
					>
						<div class="flex items-start gap-2 min-w-0">
							<Icon
								class="w-3.5 h-3.5 mt-0.5 shrink-0 {entityAccent(tile.entityType)}"
							/>
							<div class="min-w-0 flex-1">
								<p
									class="text-xs sm:text-sm font-medium text-foreground line-clamp-1"
								>
									{tile.name}
								</p>
								<p class="text-[10px] sm:text-xs text-muted-foreground mt-0.5">
									<span>{activityActorPhrase(tile)}</span>
									<span class="mx-1 text-muted-foreground/50">·</span>
									<span class="capitalize">{tile.entityType}</span>
									<span class="mx-1 text-muted-foreground/50">·</span>
									<span>{relativeTime(tile.when)}</span>
									{#if tile.source && sourceLabel(tile.source)}
										<span class="mx-1 text-muted-foreground/50">·</span>
										<span class="text-muted-foreground/80"
											>via {sourceLabel(tile.source)}</span
										>
									{/if}
								</p>
							</div>
						</div>
					</button>
				{/each}
			{/if}
		</div>
	</div>

	<!-- Up Next -->
	<div
		class="bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak overflow-hidden"
	>
		<header
			class="flex items-center justify-between gap-2 px-3 sm:px-4 py-2 sm:py-3 border-b border-border/60"
		>
			<div class="flex items-center gap-2">
				<div class="w-7 h-7 rounded-md bg-amber-500/10 flex items-center justify-center">
					<ArrowRight class="w-3.5 h-3.5 text-amber-500" />
				</div>
				<div>
					<p class="text-xs sm:text-sm font-semibold text-foreground">Up next</p>
					<p class="text-[10px] sm:text-xs text-muted-foreground">
						Scheduled tasks, milestones, goals &amp; events
					</p>
				</div>
			</div>
			{#if upcomingItems.length > 0}
				<span class="text-[10px] uppercase tracking-widest text-muted-foreground/70">
					{upcomingItems.length}
				</span>
			{/if}
		</header>

		<div class="p-2 sm:p-3 space-y-1.5">
			{#if upcomingItems.length === 0}
				<p class="text-xs text-muted-foreground px-1 py-3 italic">
					Nothing scheduled. Add a date to a task, milestone, goal, or event to see it
					here.
				</p>
			{:else}
				{#each upcomingItems as item (item.id)}
					{@const Icon = entityIcon(item.kind)}
					{@const future = relativeFuture(item.date)}
					<button
						type="button"
						onclick={() => onOpenEntity(item.kind, item.id)}
						class="group w-full text-left bg-background hover:bg-muted/50 border border-border/60 hover:border-border rounded-md px-2.5 py-2 transition-colors pressable"
					>
						<div class="flex items-start gap-2 min-w-0">
							<Icon class="w-3.5 h-3.5 mt-0.5 shrink-0 {entityAccent(item.kind)}" />
							<div class="min-w-0 flex-1">
								<p
									class="text-xs sm:text-sm font-medium text-foreground line-clamp-1"
								>
									{item.title}
								</p>
								<p class="text-[10px] sm:text-xs mt-0.5 flex items-center gap-1.5">
									<span class="capitalize text-muted-foreground">{item.kind}</span
									>
									<span class="text-muted-foreground/50">·</span>
									<Clock
										class="w-3 h-3 shrink-0 {future.isOverdue
											? 'text-destructive'
											: 'text-muted-foreground'}"
									/>
									<span
										class={future.isOverdue
											? 'text-destructive font-medium'
											: 'text-muted-foreground'}
									>
										{future.label}
									</span>
									{#if item.kind === 'task' && item.state === 'in_progress'}
										<span class="text-muted-foreground/50">·</span>
										<span class="text-sky-600 dark:text-sky-400 font-medium"
											>in progress</span
										>
									{:else if item.kind === 'task' && item.state === 'blocked'}
										<span class="text-muted-foreground/50">·</span>
										<span class="text-rose-600 dark:text-rose-400 font-medium"
											>blocked</span
										>
									{/if}
								</p>
							</div>
						</div>
					</button>
				{/each}
			{/if}
		</div>
	</div>
</section>
