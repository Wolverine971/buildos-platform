<!-- apps/web/src/lib/components/project/v2/EntityTabStrip.svelte -->
<!--
	EntityTabStrip — v2 component

	A horizontal strip of pill tabs for project context that wasn't moved into
	the kanban or pulse strip:

	  [📔 Briefs]  [💬 Chats]  [🌿 Graph]  [🎯 Goals]  [🚩 Milestones]  [📅 Plans]  [⚠️ Risks]  [🕒 Events]

	Single-expansion model: click a pill, it expands to full width with its
	content body underneath. Other pills wrap above and below via flex-wrap
	(any pill takes `w-full` when expanded, which forces a line break).

	Briefs lazy-fetches on first expand; Graph mounts ProjectGraphSection on
	first expand; entity tabs render from props passed in by the page.

	Note: there used to be an "Activity" tab here, but PulseStrip's
	"Recently done" surfaces the same activity-log signal in a more
	action-oriented way, so the dedicated Activity tab was removed.
-->
<script lang="ts">
	import { slide } from 'svelte/transition';
	import {
		AlertTriangle,
		Calendar,
		ChevronDown,
		Clock,
		ExternalLink,
		Flag,
		GitBranch,
		LoaderCircle,
		MessagesSquare,
		Plus,
		Sparkles,
		Target
	} from 'lucide-svelte';
	import {
		fetchProjectBriefs,
		type ProjectBriefSummary
	} from '$lib/components/project/project-page-data-controller';
	import { resolveMilestoneState } from '$lib/utils/milestone-state';
	import type { ProjectLogEntityType } from '@buildos/shared-types';
	import type { Goal, Milestone, OntoEvent, Plan, Risk } from '$lib/types/onto';
	import type { GraphNode } from '$lib/components/ontology/graph/lib/graph.types';

	type TabKey = 'briefs' | 'graph' | 'goals' | 'milestones' | 'plans' | 'risks';
	type TabActionKey = 'chats' | 'events';
	type TabItemKey = TabKey | TabActionKey;

	let {
		projectId,
		canEdit,
		goals = [],
		milestones = [],
		plans = [],
		risks = [],
		events = [],
		milestonesByGoalId = new Map<string, Milestone[]>(),
		onEditGoal,
		onEditMilestone,
		onEditPlan,
		onEditRisk,
		onEntityClick,
		onGraphNodeClick,
		onAddGoal,
		onAddMilestoneFromGoal,
		onAddPlan,
		onAddRisk,
		onOpenRecentChats,
		onOpenEvents
	}: {
		projectId: string;
		canEdit: boolean;
		goals: Goal[];
		milestones: Milestone[];
		plans: Plan[];
		risks: Risk[];
		events: OntoEvent[];
		milestonesByGoalId: Map<string, Milestone[]>;
		onEditGoal: (id: string) => void;
		onEditMilestone: (id: string) => void;
		onEditPlan: (id: string) => void;
		onEditRisk: (id: string) => void;
		onEntityClick: (kind: ProjectLogEntityType, id: string) => void;
		onGraphNodeClick?: (node: GraphNode) => void;
		onAddGoal?: () => void;
		onAddMilestoneFromGoal?: (goalId: string, goalName: string) => void;
		onAddPlan?: () => void;
		onAddRisk?: () => void;
		onOpenRecentChats?: () => void;
		onOpenEvents?: () => void;
	} = $props();

	let expanded = $state<TabKey | null>(null);

	function toggle(key: TabKey) {
		expanded = expanded === key ? null : key;
	}

	// ----------------------------------------------------------------
	// Briefs (lazy fetch on first expand)
	// ----------------------------------------------------------------
	let briefs = $state<ProjectBriefSummary[]>([]);
	let briefsLoaded = $state(false);
	let briefsLoading = $state(false);
	let briefsError = $state<string | null>(null);
	let briefsHasMore = $state(false);
	let briefsTotal = $state(0);
	let expandedBriefId = $state<string | null>(null);

	async function loadBriefs(reset = false) {
		if (briefsLoading) return;
		briefsLoading = true;
		briefsError = null;
		try {
			const offset = reset ? 0 : briefs.length;
			const page = await fetchProjectBriefs({ projectId, limit: 5, offset });
			briefs = reset ? page.briefs : [...briefs, ...page.briefs];
			briefsHasMore = page.hasMore;
			briefsTotal = page.total;
			briefsLoaded = true;
		} catch (err) {
			briefsError = err instanceof Error ? err.message : 'Failed to load briefs';
		} finally {
			briefsLoading = false;
		}
	}

	$effect(() => {
		if (expanded === 'briefs' && !briefsLoaded && !briefsLoading) {
			void loadBriefs(true);
		}
	});

	// ----------------------------------------------------------------
	// Counts and tab config
	// ----------------------------------------------------------------

	type TabDef = {
		key: TabItemKey;
		label: string;
		count: number | null;
		icon: typeof Target;
		accent: string;
		bg: string;
		action?: true;
		hidden?: boolean;
	};

	const tabs = $derived.by<TabDef[]>(() => {
		const all: TabDef[] = [
			{
				key: 'briefs',
				label: 'Briefs',
				count: briefsLoaded ? briefsTotal : null,
				icon: Sparkles,
				accent: 'text-violet-500',
				bg: 'bg-violet-500/10'
			},
			{
				key: 'chats',
				label: 'Chats',
				count: null,
				icon: MessagesSquare,
				accent: 'text-teal-500',
				bg: 'bg-teal-500/10',
				action: true,
				hidden: !onOpenRecentChats
			},
			{
				key: 'graph',
				label: 'Graph',
				count: null,
				icon: GitBranch,
				accent: 'text-sky-500',
				bg: 'bg-sky-500/10'
			},
			{
				key: 'goals',
				label: 'Goals',
				count: goals.length,
				icon: Target,
				accent: 'text-amber-500',
				bg: 'bg-amber-500/10'
			},
			{
				key: 'milestones',
				label: 'Milestones',
				count: milestones.length,
				icon: Flag,
				accent: 'text-emerald-500',
				bg: 'bg-emerald-500/10'
			},
			{
				key: 'plans',
				label: 'Plans',
				count: plans.length,
				icon: Calendar,
				accent: 'text-indigo-500',
				bg: 'bg-indigo-500/10'
			},
			{
				key: 'risks',
				label: 'Risks',
				count: risks.length,
				icon: AlertTriangle,
				accent: 'text-rose-500',
				bg: 'bg-rose-500/10'
			},
			{
				key: 'events',
				label: 'Events',
				count: events.length,
				icon: Clock,
				accent: 'text-teal-500',
				bg: 'bg-teal-500/10',
				action: true,
				hidden: !onOpenEvents
			}
		];
		return all.filter((t) => !t.hidden);
	});

	// ----------------------------------------------------------------
	// Display helpers
	// ----------------------------------------------------------------

	function relativeTime(iso: string): string {
		const date = new Date(iso);
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

	function stateChip(
		state: string | null | undefined,
		accentMap: Record<string, string>
	): {
		label: string;
		className: string;
	} | null {
		if (!state) return null;
		const className = accentMap[state] ?? 'bg-muted/40 text-muted-foreground border-border/60';
		return { label: state.replace(/_/g, ' '), className };
	}

	const goalStateAccents: Record<string, string> = {
		draft: 'bg-muted/40 text-muted-foreground border-border/60',
		active: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30',
		achieved: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
		abandoned: 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30'
	};
	const planStateAccents: Record<string, string> = {
		draft: 'bg-muted/40 text-muted-foreground border-border/60',
		active: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/30',
		completed: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
	};
	const milestoneStateAccents: Record<string, string> = {
		pending: 'bg-muted/40 text-muted-foreground border-border/60',
		in_progress: 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30',
		completed: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
		missed: 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30'
	};
	const riskStateAccents: Record<string, string> = {
		identified: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30',
		mitigated: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
		occurred: 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30',
		closed: 'bg-muted/40 text-muted-foreground border-border/60'
	};

	// Sort milestones inside each goal by due date
	function sortMilestones(list: Milestone[]): Milestone[] {
		return [...list].sort((a, b) => {
			const da = a.due_at ? new Date(a.due_at).getTime() : Infinity;
			const db = b.due_at ? new Date(b.due_at).getTime() : Infinity;
			return da - db;
		});
	}

	function isMilestoneStandalone(m: Milestone): boolean {
		return !m.goal_id;
	}
</script>

<section class="flex flex-wrap gap-1.5 sm:gap-2 items-start" aria-label="Project context tabs">
	{#each tabs as tab (tab.key)}
		{@const isExpanded = !tab.action && expanded === tab.key}
		<div
			class="bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak overflow-hidden transition-all duration-[140ms] ease-out {isExpanded
				? 'w-full'
				: 'min-w-[88px] flex-1 sm:flex-none'}"
		>
			<!-- Pill header (compact: small icon, label, optional count, no chevron when collapsed) -->
			{#if tab.action}
				<button
					type="button"
					onclick={() =>
						tab.key === 'chats' ? onOpenRecentChats?.() : onOpenEvents?.()}
					class="w-full flex items-center justify-between gap-1.5 px-2 py-1.5 hover:bg-muted/50 transition-colors pressable focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
					aria-haspopup="dialog"
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
				</button>
			{:else}
				<button
					type="button"
					onclick={() => toggle(tab.key as TabKey)}
					class="w-full flex items-center justify-between gap-1.5 px-2 py-1.5 hover:bg-muted/50 transition-colors pressable focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
					aria-expanded={isExpanded}
					aria-controls="entity-tab-{tab.key}"
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
							class="w-3 h-3 text-muted-foreground shrink-0 rotate-180 transition-transform duration-[140ms]"
						/>
					{/if}
				</button>
			{/if}

			<!-- Expanded body -->
			{#if isExpanded}
				<div
					id="entity-tab-{tab.key}"
					class="border-t border-border"
					transition:slide={{ duration: 140 }}
				>
					{#if tab.key === 'briefs'}
						<div class="p-2 sm:p-3 space-y-2 max-h-[60vh] overflow-y-auto">
							{#if briefsLoading && briefs.length === 0}
								<div class="flex items-center justify-center py-6">
									<LoaderCircle
										class="w-4 h-4 animate-spin text-muted-foreground"
									/>
								</div>
							{:else if briefsError}
								<p class="text-xs text-destructive px-1 py-2">{briefsError}</p>
							{:else if briefs.length === 0}
								<p class="text-xs text-muted-foreground italic px-1 py-3">
									No daily briefs yet. They'll show up after your next morning
									brief.
								</p>
							{:else}
								{#each briefs as brief (brief.id)}
									{@const isOpen = expandedBriefId === brief.id}
									<article class="rounded-md border border-border bg-background">
										<button
											type="button"
											onclick={() =>
												(expandedBriefId = isOpen ? null : brief.id)}
											class="w-full text-left px-3 py-2 flex items-center justify-between gap-2 hover:bg-muted/40 transition-colors pressable"
										>
											<div class="min-w-0 flex-1">
												<p class="text-xs font-medium text-foreground">
													{brief.brief_date
														? new Date(
																brief.brief_date
															).toLocaleDateString(undefined, {
																weekday: 'short',
																month: 'short',
																day: 'numeric'
															})
														: relativeTime(brief.created_at)}
												</p>
												{#if brief.executive_summary}
													<p
														class="text-[11px] text-muted-foreground line-clamp-1 mt-0.5"
													>
														{brief.executive_summary}
													</p>
												{/if}
											</div>
											<ChevronDown
												class="w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform {isOpen
													? 'rotate-180'
													: ''}"
											/>
										</button>
										{#if isOpen}
											<div
												class="border-t border-border/60 px-3 py-2 space-y-2"
												transition:slide={{ duration: 120 }}
											>
												{#if brief.priority_actions && brief.priority_actions.length}
													<div>
														<p
															class="text-[10px] uppercase tracking-widest text-muted-foreground/70 mb-1"
														>
															Priority actions
														</p>
														<ul
															class="list-disc list-inside text-xs text-foreground space-y-0.5"
														>
															{#each brief.priority_actions as action, i (i)}
																<li>{action}</li>
															{/each}
														</ul>
													</div>
												{/if}
												<div
													class="text-xs text-foreground whitespace-pre-wrap leading-relaxed"
												>
													{brief.brief_content}
												</div>
											</div>
										{/if}
									</article>
								{/each}
								{#if briefsHasMore}
									<button
										type="button"
										onclick={() => loadBriefs(false)}
										disabled={briefsLoading}
										class="w-full text-xs font-medium text-foreground/80 hover:text-foreground py-2 rounded-md hover:bg-muted/40 transition-colors pressable disabled:opacity-50"
									>
										{briefsLoading ? 'Loading…' : 'Load more briefs'}
									</button>
								{/if}
							{/if}
						</div>
					{:else if tab.key === 'graph'}
						<div class="h-[60vh] min-h-[420px]">
							{#await import('$lib/components/ontology/ProjectGraphSection.svelte')}
								<div class="flex items-center justify-center h-full">
									<LoaderCircle
										class="w-4 h-4 animate-spin text-muted-foreground"
									/>
								</div>
							{:then { default: ProjectGraphSection }}
								<ProjectGraphSection
									{projectId}
									onNodeClick={(node) => {
										if (onGraphNodeClick) {
											onGraphNodeClick(node);
										} else {
											onEntityClick(
												node.type as ProjectLogEntityType,
												node.id
											);
										}
									}}
								/>
							{:catch}
								<div
									class="flex items-center justify-center h-full text-xs text-muted-foreground italic"
								>
									Unable to load graph.
								</div>
							{/await}
						</div>
					{:else if tab.key === 'goals'}
						<div class="p-2 sm:p-3 space-y-2 max-h-[60vh] overflow-y-auto">
							{#if canEdit && onAddGoal}
								<div class="flex justify-end">
									<button
										type="button"
										onclick={onAddGoal}
										class="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-foreground/80 hover:bg-muted/50 pressable"
									>
										<Plus class="w-3 h-3" /> New goal
									</button>
								</div>
							{/if}
							{#if goals.length === 0}
								<p class="text-xs text-muted-foreground italic px-1 py-3">
									No goals yet. Define what success looks like for this project.
								</p>
							{:else}
								{#each goals as goal (goal.id)}
									{@const goalMilestones = sortMilestones(
										milestonesByGoalId.get(goal.id) ?? []
									)}
									{@const completedCount = goalMilestones.filter(
										(m) => resolveMilestoneState(m).state === 'completed'
									).length}
									{@const chip = stateChip(goal.state_key, goalStateAccents)}
									<article
										class="rounded-md border border-border bg-background overflow-hidden"
									>
										<button
											type="button"
											onclick={() => onEditGoal(goal.id)}
											class="w-full text-left px-3 py-2 hover:bg-muted/40 transition-colors pressable"
										>
											<div
												class="flex items-start justify-between gap-2 min-w-0"
											>
												<div class="min-w-0 flex-1">
													<p
														class="text-xs sm:text-sm font-medium text-foreground line-clamp-2"
													>
														{goal.name}
													</p>
													{#if goal.goal && goal.goal !== goal.name}
														<p
															class="text-[11px] text-muted-foreground line-clamp-1 mt-0.5"
														>
															{goal.goal}
														</p>
													{/if}
													<div
														class="flex items-center gap-2 mt-1.5 flex-wrap"
													>
														{#if chip}
															<span
																class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border {chip.className}"
																>{chip.label}</span
															>
														{/if}
														{#if goalMilestones.length > 0}
															<span
																class="text-[10px] text-muted-foreground inline-flex items-center gap-1"
															>
																<Flag class="w-2.5 h-2.5" />
																{completedCount}/{goalMilestones.length}
																milestones
															</span>
														{/if}
														{#if goal.target_date}
															{@const due = dueLabel(
																goal.target_date
															)}
															{#if due}
																<span
																	class="text-[10px] inline-flex items-center gap-1 {due.isOverdue
																		? 'text-destructive font-medium'
																		: 'text-muted-foreground'}"
																>
																	<Clock class="w-2.5 h-2.5" />
																	{due.label}
																</span>
															{/if}
														{/if}
													</div>
												</div>
												<ExternalLink
													class="w-3.5 h-3.5 text-muted-foreground/70 shrink-0 mt-0.5"
												/>
											</div>
										</button>
										{#if goalMilestones.length > 0}
											<div class="border-t border-border/60 bg-muted/20">
												{#each goalMilestones as m (m.id)}
													{@const mState = resolveMilestoneState(m).state}
													{@const mChip = stateChip(
														mState,
														milestoneStateAccents
													)}
													{@const mDue = dueLabel(m.due_at)}
													<button
														type="button"
														onclick={() => onEditMilestone(m.id)}
														class="w-full text-left px-3 py-1.5 flex items-center justify-between gap-2 hover:bg-muted/40 border-t border-border/40 first:border-t-0 transition-colors pressable"
													>
														<div
															class="flex items-center gap-2 min-w-0"
														>
															<Flag
																class="w-2.5 h-2.5 shrink-0 {mState ===
																'completed'
																	? 'text-emerald-500'
																	: 'text-muted-foreground'}"
															/>
															<span
																class="text-[11px] text-foreground truncate {mState ===
																'completed'
																	? 'line-through text-muted-foreground'
																	: ''}">{m.title}</span
															>
														</div>
														<div
															class="flex items-center gap-1.5 shrink-0"
														>
															{#if mDue}
																<span
																	class="text-[10px] {mDue.isOverdue
																		? 'text-destructive font-medium'
																		: 'text-muted-foreground'}"
																	>{mDue.label}</span
																>
															{/if}
															{#if mChip}
																<span
																	class="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium border {mChip.className}"
																	>{mChip.label}</span
																>
															{/if}
														</div>
													</button>
												{/each}
												{#if canEdit && onAddMilestoneFromGoal}
													<button
														type="button"
														onclick={() =>
															onAddMilestoneFromGoal(
																goal.id,
																goal.name
															)}
														class="w-full text-left px-3 py-1.5 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/40 border-t border-border/40 transition-colors pressable inline-flex items-center gap-1"
													>
														<Plus class="w-2.5 h-2.5" /> Add milestone
													</button>
												{/if}
											</div>
										{/if}
									</article>
								{/each}
							{/if}
						</div>
					{:else if tab.key === 'milestones'}
						<div class="p-2 sm:p-3 space-y-1.5 max-h-[60vh] overflow-y-auto">
							{#if milestones.length === 0}
								<p class="text-xs text-muted-foreground italic px-1 py-3">
									No milestones yet.
								</p>
							{:else}
								{#each [...milestones].sort((a, b) => {
									const da = a.due_at ? new Date(a.due_at).getTime() : Infinity;
									const db = b.due_at ? new Date(b.due_at).getTime() : Infinity;
									return da - db;
								}) as m (m.id)}
									{@const mState = resolveMilestoneState(m).state}
									{@const mChip = stateChip(mState, milestoneStateAccents)}
									{@const mDue = dueLabel(m.due_at)}
									{@const standalone = isMilestoneStandalone(m)}
									<button
										type="button"
										onclick={() => onEditMilestone(m.id)}
										class="w-full text-left rounded-md border border-border bg-background hover:bg-muted/40 px-3 py-2 transition-colors pressable"
									>
										<div class="flex items-start justify-between gap-2 min-w-0">
											<div class="min-w-0 flex-1">
												<div class="flex items-center gap-2 min-w-0">
													<Flag
														class="w-3 h-3 shrink-0 {mState ===
														'completed'
															? 'text-emerald-500'
															: 'text-amber-500'}"
													/>
													<p
														class="text-xs sm:text-sm font-medium text-foreground line-clamp-1 {mState ===
														'completed'
															? 'line-through text-muted-foreground'
															: ''}"
													>
														{m.title}
													</p>
												</div>
												<div class="flex items-center gap-2 mt-1 flex-wrap">
													{#if mChip}
														<span
															class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border {mChip.className}"
															>{mChip.label}</span
														>
													{/if}
													{#if mDue}
														<span
															class="text-[10px] inline-flex items-center gap-1 {mDue.isOverdue
																? 'text-destructive font-medium'
																: 'text-muted-foreground'}"
														>
															<Clock class="w-2.5 h-2.5" />
															{mDue.label}
														</span>
													{/if}
													{#if standalone}
														<span
															class="text-[10px] text-muted-foreground/70 italic"
															>standalone</span
														>
													{/if}
												</div>
											</div>
										</div>
									</button>
								{/each}
							{/if}
						</div>
					{:else if tab.key === 'plans'}
						<div class="p-2 sm:p-3 space-y-1.5 max-h-[60vh] overflow-y-auto">
							{#if canEdit && onAddPlan}
								<div class="flex justify-end">
									<button
										type="button"
										onclick={onAddPlan}
										class="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-foreground/80 hover:bg-muted/50 pressable"
									>
										<Plus class="w-3 h-3" /> New plan
									</button>
								</div>
							{/if}
							{#if plans.length === 0}
								<p class="text-xs text-muted-foreground italic px-1 py-3">
									No plans yet. Plans group related work into a phase or scope.
								</p>
							{:else}
								{#each plans as plan (plan.id)}
									{@const chip = stateChip(plan.state_key, planStateAccents)}
									<button
										type="button"
										onclick={() => onEditPlan(plan.id)}
										class="w-full text-left rounded-md border border-border bg-background hover:bg-muted/40 px-3 py-2 transition-colors pressable"
									>
										<div class="flex items-start justify-between gap-2 min-w-0">
											<div class="min-w-0 flex-1">
												<div class="flex items-center gap-2 min-w-0">
													<Calendar
														class="w-3 h-3 shrink-0 text-indigo-500"
													/>
													<p
														class="text-xs sm:text-sm font-medium text-foreground line-clamp-1"
													>
														{plan.name}
													</p>
												</div>
												{#if plan.description}
													<p
														class="text-[11px] text-muted-foreground line-clamp-1 mt-0.5"
													>
														{plan.description}
													</p>
												{/if}
												{#if chip}
													<div class="mt-1">
														<span
															class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border {chip.className}"
															>{chip.label}</span
														>
													</div>
												{/if}
											</div>
										</div>
									</button>
								{/each}
							{/if}
						</div>
					{:else if tab.key === 'risks'}
						<div class="p-2 sm:p-3 space-y-1.5 max-h-[60vh] overflow-y-auto">
							{#if canEdit && onAddRisk}
								<div class="flex justify-end">
									<button
										type="button"
										onclick={onAddRisk}
										class="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-foreground/80 hover:bg-muted/50 pressable"
									>
										<Plus class="w-3 h-3" /> New risk
									</button>
								</div>
							{/if}
							{#if risks.length === 0}
								<p class="text-xs text-muted-foreground italic px-1 py-3">
									No risks tracked. Surface things that could derail the project
									here.
								</p>
							{:else}
								{#each risks as risk (risk.id)}
									{@const chip = stateChip(risk.state_key, riskStateAccents)}
									<button
										type="button"
										onclick={() => onEditRisk(risk.id)}
										class="w-full text-left rounded-md border border-border bg-background hover:bg-muted/40 px-3 py-2 transition-colors pressable"
									>
										<div class="flex items-start justify-between gap-2 min-w-0">
											<div class="min-w-0 flex-1">
												<div class="flex items-center gap-2 min-w-0">
													<AlertTriangle
														class="w-3 h-3 shrink-0 text-rose-500"
													/>
													<p
														class="text-xs sm:text-sm font-medium text-foreground line-clamp-1"
													>
														{risk.title}
													</p>
												</div>
												{#if risk.content}
													<p
														class="text-[11px] text-muted-foreground line-clamp-1 mt-0.5"
													>
														{risk.content}
													</p>
												{/if}
												{#if chip}
													<div class="mt-1">
														<span
															class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border {chip.className}"
															>{chip.label}</span
														>
													</div>
												{/if}
											</div>
										</div>
									</button>
								{/each}
							{/if}
						</div>
					{/if}
				</div>
			{/if}
		</div>
	{/each}
</section>
