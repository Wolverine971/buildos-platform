<!-- apps/web/src/lib/components/landing/public-project-preview/PublicPulseStrip.svelte -->
<!--
	Public, read-only mirror of project/v2/PulseStrip.

	Two layouts driven by the `viewport` prop (not viewport queries — the preview
	can be forced into a phone-frame at any screen width):

	- desktop: side-by-side "Recent activity" + "Up next" cards
	- mobile:  single card with a segmented tab strip

	Public projects don't have an activity-log endpoint, so "Recent activity"
	is synthesized from the most-recently-touched entities (completed_at /
	updated_at). Tiles are static — no click handlers — so this stays a pure
	preview surface.
-->
<script lang="ts">
	import {
		ArrowRight,
		Calendar,
		Clock,
		Flag,
		History,
		ListChecks,
		Sparkles,
		Target
	} from 'lucide-svelte';
	import type { PublicProjectSource, ViewportMode } from './lib/public-project-types';

	type ActivityKind = 'task' | 'milestone' | 'goal' | 'plan' | 'event' | 'risk';
	type UpcomingKind = 'task' | 'milestone' | 'goal' | 'event';

	let {
		source,
		viewport = 'desktop'
	}: {
		source: PublicProjectSource;
		viewport?: ViewportMode;
	} = $props();

	let mobileTab = $state<'recent' | 'next'>('recent');

	function parseDate(value: string | null | undefined): Date | null {
		if (!value) return null;
		const ms = new Date(value).getTime();
		return Number.isFinite(ms) ? new Date(ms) : null;
	}

	type RecentTile = {
		key: string;
		kind: ActivityKind;
		title: string;
		when: Date;
		action: 'completed' | 'updated';
	};

	const recentTiles = $derived.by<RecentTile[]>(() => {
		const items: RecentTile[] = [];

		for (const t of source.tasks ?? []) {
			const completed = parseDate(t.completed_at);
			const updated = parseDate(t.updated_at);
			const when = completed ?? updated;
			if (!when) continue;
			items.push({
				key: `task:${t.id}`,
				kind: 'task',
				title: t.title,
				when,
				action: completed ? 'completed' : 'updated'
			});
		}
		for (const m of source.milestones ?? []) {
			const completed = parseDate(m.completed_at);
			const updated = parseDate(m.updated_at);
			const when = completed ?? updated;
			if (!when) continue;
			items.push({
				key: `milestone:${m.id}`,
				kind: 'milestone',
				title: m.title,
				when,
				action: completed ? 'completed' : 'updated'
			});
		}
		for (const g of source.goals ?? []) {
			const updated = parseDate(g.updated_at);
			if (!updated) continue;
			items.push({
				key: `goal:${g.id}`,
				kind: 'goal',
				title: g.name,
				when: updated,
				action: 'updated'
			});
		}
		for (const p of source.plans ?? []) {
			const updated = parseDate(p.updated_at);
			if (!updated) continue;
			items.push({
				key: `plan:${p.id}`,
				kind: 'plan',
				title: p.name,
				when: updated,
				action: 'updated'
			});
		}
		for (const r of source.risks ?? []) {
			const updated = parseDate(r.updated_at);
			if (!updated) continue;
			items.push({
				key: `risk:${r.id}`,
				kind: 'risk',
				title: r.title,
				when: updated,
				action: 'updated'
			});
		}

		items.sort((a, b) => b.when.getTime() - a.when.getTime());
		return items.slice(0, 6);
	});

	type UpcomingItem = {
		id: string;
		kind: UpcomingKind;
		title: string;
		date: Date;
		state?: string | null;
		isOverdue: boolean;
	};

	const upcomingItems = $derived.by<UpcomingItem[]>(() => {
		const items: UpcomingItem[] = [];
		const nowMs = Date.now();

		for (const t of source.tasks ?? []) {
			if (t.state_key === 'done') continue;
			const ref = t.due_at || t.start_at;
			const date = parseDate(ref ?? null);
			if (!date) continue;
			items.push({
				id: t.id,
				kind: 'task',
				title: t.title,
				date,
				state: t.state_key,
				isOverdue: date.getTime() < nowMs
			});
		}
		for (const m of source.milestones ?? []) {
			if (m.state_key === 'completed') continue;
			const date = parseDate(m.due_at ?? null);
			if (!date) continue;
			items.push({
				id: m.id,
				kind: 'milestone',
				title: m.title,
				date,
				state: m.state_key,
				isOverdue: date.getTime() < nowMs
			});
		}
		for (const g of source.goals ?? []) {
			if (g.state_key === 'achieved' || g.state_key === 'abandoned') continue;
			const date = parseDate(g.target_date ?? null);
			if (!date) continue;
			items.push({
				id: g.id,
				kind: 'goal',
				title: g.name,
				date,
				state: g.state_key,
				isOverdue: date.getTime() < nowMs
			});
		}
		for (const e of source.events ?? []) {
			if (e.deleted_at) continue;
			const date = parseDate(e.start_at);
			if (!date) continue;
			items.push({
				id: e.id,
				kind: 'event',
				title: e.title,
				date,
				state: e.state_key,
				isOverdue: false
			});
		}

		items.sort((a, b) => {
			if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
			return a.date.getTime() - b.date.getTime();
		});

		return items.slice(0, 6);
	});

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
		return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}

	function relativeFuture(date: Date): { label: string; isOverdue: boolean } {
		const diffMin = Math.round((date.getTime() - Date.now()) / 60000);
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

	function iconFor(kind: ActivityKind | UpcomingKind) {
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
			default:
				return Sparkles;
		}
	}

	function accentFor(kind: ActivityKind | UpcomingKind): string {
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
			case 'risk':
				return 'text-red-500';
			default:
				return 'text-muted-foreground';
		}
	}
</script>

{#if viewport === 'mobile'}
	<section
		class="bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak overflow-hidden"
		aria-label="Project pulse"
	>
		<div role="tablist" aria-label="Pulse views" class="flex border-b border-border/60">
			<button
				role="tab"
				type="button"
				aria-selected={mobileTab === 'recent'}
				onclick={() => (mobileTab = 'recent')}
				class="flex-1 px-3 py-2 flex items-center justify-center gap-1.5 text-[11px] font-semibold transition-colors {mobileTab ===
				'recent'
					? 'text-foreground bg-muted/40 border-b-2 border-foreground/50 -mb-px'
					: 'text-muted-foreground hover:text-foreground hover:bg-muted/40'}"
			>
				<History
					class="w-3 h-3 {mobileTab === 'recent'
						? 'text-foreground'
						: 'text-muted-foreground'}"
				/>
				<span>Recent</span>
				{#if recentTiles.length > 0}
					<span class="text-[10px] text-muted-foreground/70">({recentTiles.length})</span>
				{/if}
			</button>
			<button
				role="tab"
				type="button"
				aria-selected={mobileTab === 'next'}
				onclick={() => (mobileTab = 'next')}
				class="flex-1 px-3 py-2 flex items-center justify-center gap-1.5 text-[11px] font-semibold transition-colors {mobileTab ===
				'next'
					? 'text-foreground bg-amber-500/5 border-b-2 border-amber-500 -mb-px'
					: 'text-muted-foreground hover:text-foreground hover:bg-muted/40'}"
			>
				<ArrowRight
					class="w-3 h-3 {mobileTab === 'next'
						? 'text-amber-500'
						: 'text-muted-foreground'}"
				/>
				<span>Up next</span>
				{#if upcomingItems.length > 0}
					<span class="text-[10px] text-muted-foreground/70"
						>({upcomingItems.length})</span
					>
				{/if}
			</button>
		</div>

		<div class="p-2 space-y-1.5">
			{#if mobileTab === 'recent'}
				{#if recentTiles.length === 0}
					<p class="text-[11px] text-muted-foreground px-2 py-3 text-center italic">
						Nothing recent yet.
					</p>
				{:else}
					{#each recentTiles as tile (tile.key)}
						{@const Icon = iconFor(tile.kind)}
						<div
							class="bg-background border border-border/60 rounded-md px-2.5 py-2 flex items-start gap-2"
						>
							<Icon class="w-3.5 h-3.5 mt-0.5 shrink-0 {accentFor(tile.kind)}" />
							<div class="min-w-0 flex-1">
								<p class="text-[12px] font-medium text-foreground line-clamp-1">
									{tile.title}
								</p>
								<p class="text-[10px] text-muted-foreground mt-0.5">
									<span>{tile.action}</span>
									<span class="mx-1 text-muted-foreground/50">·</span>
									<span class="capitalize">{tile.kind}</span>
									<span class="mx-1 text-muted-foreground/50">·</span>
									<span>{relativeTime(tile.when)}</span>
								</p>
							</div>
						</div>
					{/each}
				{/if}
			{:else if upcomingItems.length === 0}
				<p class="text-[11px] text-muted-foreground px-2 py-3 text-center italic">
					Nothing scheduled.
				</p>
			{:else}
				{#each upcomingItems as item (item.id)}
					{@const Icon = iconFor(item.kind)}
					{@const future = relativeFuture(item.date)}
					<div
						class="bg-background border border-border/60 rounded-md px-2.5 py-2 flex items-start gap-2"
					>
						<Icon class="w-3.5 h-3.5 mt-0.5 shrink-0 {accentFor(item.kind)}" />
						<div class="min-w-0 flex-1">
							<p class="text-[12px] font-medium text-foreground line-clamp-1">
								{item.title}
							</p>
							<p class="text-[10px] mt-0.5 flex items-center gap-1.5 flex-wrap">
								<span class="capitalize text-muted-foreground">{item.kind}</span>
								<span class="text-muted-foreground/50">·</span>
								<span
									class="inline-flex items-center gap-1 {future.isOverdue
										? 'text-destructive font-medium'
										: 'text-muted-foreground'}"
								>
									<Clock class="w-3 h-3 shrink-0" />
									{future.label}
								</span>
							</p>
						</div>
					</div>
				{/each}
			{/if}
		</div>
	</section>
{:else}
	<section class="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4" aria-label="Project pulse">
		<!-- Recently Done -->
		<div
			class="bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak overflow-hidden"
		>
			<header
				class="flex items-center justify-between gap-2 px-3 sm:px-4 py-2 sm:py-2.5 border-b border-border/60"
			>
				<div class="flex items-center gap-2">
					<div class="w-7 h-7 rounded-md bg-muted/60 flex items-center justify-center">
						<History class="w-3.5 h-3.5 text-muted-foreground" />
					</div>
					<div>
						<p class="text-xs sm:text-sm font-semibold text-foreground">
							Recent activity
						</p>
						<p class="text-[10px] sm:text-xs text-muted-foreground">
							What's moved most recently
						</p>
					</div>
				</div>
				<span class="text-[10px] uppercase tracking-widest text-muted-foreground/70">
					{recentTiles.length}
				</span>
			</header>

			<div class="p-2 sm:p-3 space-y-1.5">
				{#if recentTiles.length === 0}
					<p class="text-xs text-muted-foreground px-1 py-3 italic">
						Nothing logged yet.
					</p>
				{:else}
					{#each recentTiles as tile (tile.key)}
						{@const Icon = iconFor(tile.kind)}
						<div
							class="bg-background border border-border/60 rounded-md px-2.5 py-2 flex items-start gap-2"
						>
							<Icon class="w-3.5 h-3.5 mt-0.5 shrink-0 {accentFor(tile.kind)}" />
							<div class="min-w-0 flex-1">
								<p
									class="text-xs sm:text-sm font-medium text-foreground line-clamp-1"
								>
									{tile.title}
								</p>
								<p class="text-[10px] sm:text-xs text-muted-foreground mt-0.5">
									<span>{tile.action}</span>
									<span class="mx-1 text-muted-foreground/50">·</span>
									<span class="capitalize">{tile.kind}</span>
									<span class="mx-1 text-muted-foreground/50">·</span>
									<span>{relativeTime(tile.when)}</span>
								</p>
							</div>
						</div>
					{/each}
				{/if}
			</div>
		</div>

		<!-- Up Next -->
		<div
			class="bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak overflow-hidden"
		>
			<header
				class="flex items-center justify-between gap-2 px-3 sm:px-4 py-2 sm:py-2.5 border-b border-border/60"
			>
				<div class="flex items-center gap-2">
					<div
						class="w-7 h-7 rounded-md bg-amber-500/10 flex items-center justify-center"
					>
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
						Nothing scheduled in this example.
					</p>
				{:else}
					{#each upcomingItems as item (item.id)}
						{@const Icon = iconFor(item.kind)}
						{@const future = relativeFuture(item.date)}
						<div
							class="bg-background border border-border/60 rounded-md px-2.5 py-2 flex items-start gap-2"
						>
							<Icon class="w-3.5 h-3.5 mt-0.5 shrink-0 {accentFor(item.kind)}" />
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
								</p>
							</div>
						</div>
					{/each}
				{/if}
			</div>
		</div>
	</section>
{/if}
