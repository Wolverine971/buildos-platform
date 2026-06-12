<!-- apps/web/src/lib/components/landing/public-project-preview/PublicEntityTabStrip.svelte -->
<!--
	Public, read-only mirror of project/v2/EntityTabStrip.

	Pills wrap onto multiple rows when narrow. Clicking a pill expands it to a
	full-width body underneath with the read-only entity list. Public projects
	don't have briefs or chats, so those pills are dropped — what's left:
	Graph · Goals · Milestones · Plans · Risks · Events.

	Graph mounts PublicProjectGraphPanel lazily on first expand.
-->
<script lang="ts">
	import { slide } from 'svelte/transition';
	import {
		AlertTriangle,
		Calendar,
		ChevronDown,
		Clock,
		Flag,
		GitBranch,
		Target
	} from 'lucide-svelte';
	import PublicProjectGraphPanel from './PublicProjectGraphPanel.svelte';
	import type { PublicProjectSource, ViewportMode } from './lib/public-project-types';

	type TabKey = 'graph' | 'goals' | 'milestones' | 'plans' | 'risks' | 'events';

	let {
		source,
		viewport = 'desktop'
	}: {
		source: PublicProjectSource;
		viewport?: ViewportMode;
	} = $props();

	let expanded = $state<TabKey | null>(null);

	function toggle(key: TabKey) {
		expanded = expanded === key ? null : key;
	}

	const isCompact = $derived(viewport === 'mobile');

	const goals = $derived(source.goals ?? []);
	const milestones = $derived(source.milestones ?? []);
	const plans = $derived(source.plans ?? []);
	const risks = $derived(source.risks ?? []);
	const events = $derived(
		(source.events ?? []).filter((e) => {
			if (e.deleted_at) return false;
			const ms = new Date(e.start_at).getTime();
			return Number.isFinite(ms);
		})
	);

	type TabDef = {
		key: TabKey;
		label: string;
		count: number | null;
		icon: typeof Target;
		accent: string;
	};

	const tabs = $derived<TabDef[]>([
		{ key: 'graph', label: 'Graph', count: null, icon: GitBranch, accent: 'text-info' },
		{
			key: 'goals',
			label: 'Goals',
			count: goals.length,
			icon: Target,
			accent: 'text-accent'
		},
		{
			key: 'milestones',
			label: 'Milestones',
			count: milestones.length,
			icon: Flag,
			accent: 'text-success'
		},
		{
			key: 'plans',
			label: 'Plans',
			count: plans.length,
			icon: Calendar,
			accent: 'text-info'
		},
		{
			key: 'risks',
			label: 'Risks',
			count: risks.length,
			icon: AlertTriangle,
			accent: 'text-destructive'
		},
		{
			key: 'events',
			label: 'Events',
			count: events.length,
			icon: Clock,
			accent: 'text-info'
		}
	]);

	function formatState(state: string | null | undefined): string | null {
		if (!state) return null;
		return state.replace(/_/g, ' ');
	}

	function dueLabel(
		iso: string | null | undefined
	): { label: string; isOverdue: boolean } | null {
		if (!iso) return null;
		const date = new Date(iso);
		const diffMs = date.getTime() - Date.now();
		const diffDay = Math.round(diffMs / (1000 * 60 * 60 * 24));
		if (diffDay < 0) return { label: `${Math.abs(diffDay)}d late`, isOverdue: true };
		if (diffDay === 0) return { label: 'today', isOverdue: false };
		if (diffDay === 1) return { label: 'tomorrow', isOverdue: false };
		if (diffDay < 14) return { label: `in ${diffDay}d`, isOverdue: false };
		return {
			label: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
			isOverdue: false
		};
	}

	function eventDateLabel(iso: string, allDay: boolean): string {
		const date = new Date(iso);
		if (allDay) {
			return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
		}
		return date.toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}
</script>

<section class="flex flex-wrap gap-1.5 items-start" aria-label="Project context tabs">
	{#each tabs as tab (tab.key)}
		{@const isExpanded = expanded === tab.key}
		<div
			class="bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak overflow-hidden transition-all duration-150 ease-out {isExpanded
				? 'w-full'
				: isCompact
					? 'min-w-[72px] flex-1'
					: 'min-w-[88px] flex-1 sm:flex-none'}"
		>
			<button
				type="button"
				onclick={() => toggle(tab.key)}
				class="w-full flex items-center justify-between gap-1.5 px-2 py-1.5 hover:bg-muted/50 transition-colors pressable focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
				aria-expanded={isExpanded}
				aria-controls="public-tab-{tab.key}"
				title={tab.label}
			>
				<div class="flex items-center gap-1.5 min-w-0">
					<tab.icon class="w-3.5 h-3.5 shrink-0 {tab.accent}" />
					<span class="text-[11px] sm:text-xs font-semibold text-foreground truncate">
						{tab.label}
					</span>
					{#if tab.count !== null}
						<span class="text-[10px] text-muted-foreground shrink-0">
							{tab.count}
						</span>
					{/if}
				</div>
				{#if isExpanded}
					<ChevronDown
						class="w-3 h-3 text-muted-foreground shrink-0 rotate-180 transition-transform"
					/>
				{/if}
			</button>

			{#if isExpanded}
				<div
					id="public-tab-{tab.key}"
					class="border-t border-border"
					transition:slide={{ duration: 140 }}
				>
					{#if tab.key === 'graph'}
						<div class="p-2 sm:p-3">
							<PublicProjectGraphPanel {source} isLoading={false} />
						</div>
					{:else if tab.key === 'goals'}
						<ul class="divide-y divide-border">
							{#if goals.length === 0}
								<li class="px-3 py-3 text-xs text-muted-foreground italic">
									No goals on this example.
								</li>
							{:else}
								{#each goals as g (g.id)}
									{@const due = dueLabel(g.target_date)}
									<li class="px-3 py-2.5 flex items-start gap-2">
										<Target class="w-3.5 h-3.5 mt-0.5 shrink-0 text-accent" />
										<div class="min-w-0 flex-1">
											<p class="text-sm text-foreground leading-snug">
												{g.name}
											</p>
											{#if g.description ?? g.goal}
												<p
													class="text-xs text-muted-foreground line-clamp-2 mt-0.5"
												>
													{g.description ?? g.goal}
												</p>
											{/if}
											{#if due}
												<p
													class="text-[10px] mt-0.5 {due.isOverdue
														? 'text-destructive font-medium'
														: 'text-muted-foreground'}"
												>
													{due.label}
												</p>
											{/if}
										</div>
										{#if formatState(g.state_key)}
											<span
												class="text-[10px] uppercase tracking-wider text-muted-foreground border border-border rounded-full px-1.5 py-0.5 shrink-0"
											>
												{formatState(g.state_key)}
											</span>
										{/if}
									</li>
								{/each}
							{/if}
						</ul>
					{:else if tab.key === 'milestones'}
						<ul class="divide-y divide-border">
							{#if milestones.length === 0}
								<li class="px-3 py-3 text-xs text-muted-foreground italic">
									No milestones on this example.
								</li>
							{:else}
								{#each milestones as m (m.id)}
									{@const due = dueLabel(m.due_at)}
									<li class="px-3 py-2.5 flex items-start gap-2">
										<Flag class="w-3.5 h-3.5 mt-0.5 shrink-0 text-success" />
										<div class="min-w-0 flex-1">
											<p class="text-sm text-foreground leading-snug">
												{m.title}
											</p>
											{#if m.description ?? m.milestone}
												<p
													class="text-xs text-muted-foreground line-clamp-2 mt-0.5"
												>
													{m.description ?? m.milestone}
												</p>
											{/if}
											{#if due}
												<p
													class="text-[10px] mt-0.5 {due.isOverdue
														? 'text-destructive font-medium'
														: 'text-muted-foreground'}"
												>
													{due.label}
												</p>
											{/if}
										</div>
										{#if formatState(m.state_key)}
											<span
												class="text-[10px] uppercase tracking-wider text-muted-foreground border border-border rounded-full px-1.5 py-0.5 shrink-0"
											>
												{formatState(m.state_key)}
											</span>
										{/if}
									</li>
								{/each}
							{/if}
						</ul>
					{:else if tab.key === 'plans'}
						<ul class="divide-y divide-border">
							{#if plans.length === 0}
								<li class="px-3 py-3 text-xs text-muted-foreground italic">
									No plans on this example.
								</li>
							{:else}
								{#each plans as p (p.id)}
									<li class="px-3 py-2.5 flex items-start gap-2">
										<Calendar class="w-3.5 h-3.5 mt-0.5 shrink-0 text-info" />
										<div class="min-w-0 flex-1">
											<p class="text-sm text-foreground leading-snug">
												{p.name}
											</p>
											{#if p.description ?? p.plan}
												<p
													class="text-xs text-muted-foreground line-clamp-2 mt-0.5"
												>
													{p.description ?? p.plan}
												</p>
											{/if}
										</div>
										{#if formatState(p.state_key)}
											<span
												class="text-[10px] uppercase tracking-wider text-muted-foreground border border-border rounded-full px-1.5 py-0.5 shrink-0"
											>
												{formatState(p.state_key)}
											</span>
										{/if}
									</li>
								{/each}
							{/if}
						</ul>
					{:else if tab.key === 'risks'}
						<ul class="divide-y divide-border">
							{#if risks.length === 0}
								<li class="px-3 py-3 text-xs text-muted-foreground italic">
									No risks on this example.
								</li>
							{:else}
								{#each risks as r (r.id)}
									<li class="px-3 py-2.5 flex items-start gap-2">
										<AlertTriangle
											class="w-3.5 h-3.5 mt-0.5 shrink-0 text-destructive"
										/>
										<div class="min-w-0 flex-1">
											<p class="text-sm text-foreground leading-snug">
												{r.title}
											</p>
											{#if r.content}
												<p
													class="text-xs text-muted-foreground line-clamp-2 mt-0.5"
												>
													{r.content}
												</p>
											{/if}
										</div>
										{#if formatState(r.state_key)}
											<span
												class="text-[10px] uppercase tracking-wider text-muted-foreground border border-border rounded-full px-1.5 py-0.5 shrink-0"
											>
												{formatState(r.state_key)}
											</span>
										{/if}
									</li>
								{/each}
							{/if}
						</ul>
					{:else if tab.key === 'events'}
						<ul class="divide-y divide-border">
							{#if events.length === 0}
								<li class="px-3 py-3 text-xs text-muted-foreground italic">
									No events on this example.
								</li>
							{:else}
								{#each events as e (e.id)}
									<li class="px-3 py-2.5 flex items-start gap-2">
										<Clock class="w-3.5 h-3.5 mt-0.5 shrink-0 text-info" />
										<div class="min-w-0 flex-1">
											<p class="text-sm text-foreground leading-snug">
												{e.title}
											</p>
											<p class="text-[11px] text-muted-foreground mt-0.5">
												{eventDateLabel(e.start_at, e.all_day)}
												{#if e.location}
													<span class="text-muted-foreground/50 mx-1"
														>·</span
													>
													<span>{e.location}</span>
												{/if}
											</p>
										</div>
									</li>
								{/each}
							{/if}
						</ul>
					{/if}
				</div>
			{/if}
		</div>
	{/each}
</section>
