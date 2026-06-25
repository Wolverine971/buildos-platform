<!-- apps/web/src/lib/components/project/v2/EntityTabStrip.svelte -->
<!--
	EntityTabStrip — v2 component

	A horizontal strip of pill tabs for project context that wasn't moved into
	the kanban or pulse strip:

	  [📔 Briefs]  [💬 Chats]  [🌿 Graph]  [🎯 Goals]  [🚩 Milestones]  [📅 Plans]  [⚠️ Risks]  [🕒 Events]

	Single-expansion model: click a pill, it expands to full width with its
	content body underneath. Other pills wrap above and below via flex-wrap
	(any pill takes `w-full` when expanded, which forces a line break).
	Chats, Graph, and Events are action pills that open modals instead of
	expanding inline.

	Briefs lazy-fetches on first expand; entity tabs render from props
	passed in by the page.

	Note: there used to be an "Activity" tab here, but PulseStrip's
	"Recently done" surfaces the same activity-log signal in a more
	action-oriented way, so the dedicated Activity tab was removed.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { slide } from 'svelte/transition';
	import {
		AlertTriangle,
		Calendar,
		ChevronDown,
		Clock,
		ExternalLink,
		Flag,
		GitBranch,
		Inbox,
		LoaderCircle,
		MessageCircle,
		MessagesSquare,
		Plus,
		Sparkles,
		Target
	} from 'lucide-svelte';
	import {
		fetchProjectBriefs,
		type ProjectBriefSummary
	} from '$lib/components/project/project-page-data-controller';
	import ProjectInboxPanel from '$lib/components/project/ProjectInboxPanel.svelte';
	import { getUpcomingEvents } from '$lib/components/project/project-event-filters';
	import { resolveMilestoneState } from '$lib/utils/milestone-state';
	import type { ProjectLogEntityType } from '@buildos/shared-types';
	import { briefChatSessionStore } from '$lib/stores/briefChatSession.store';
	import { getRecentlyCreatedContext } from '$lib/stores/recentlyCreatedContext';
	import type { DataMutationSummary } from '$lib/components/agent/agent-chat.types';
	import type { DailyBrief } from '$lib/types/daily-brief';
	import type { Goal, Milestone, OntoEvent, Plan, Risk } from '$lib/types/onto';

	const recentlyCreated = getRecentlyCreatedContext();

	type TabKey = 'briefs' | 'inbox' | 'goals' | 'milestones' | 'plans' | 'risks';
	type TabActionKey = 'chats' | 'graph' | 'events';
	type TabItemKey = TabKey | TabActionKey;

	let {
		projectId,
		projectName = 'Project',
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
		onOpenGraph,
		onAddGoal,
		onAddMilestoneFromGoal,
		onAddPlan,
		onAddRisk,
		onOpenRecentChats,
		onOpenEvents
	}: {
		projectId: string;
		projectName?: string;
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
		onOpenGraph?: () => void;
		onAddGoal?: () => void;
		onAddMilestoneFromGoal?: (goalId: string, goalName: string) => void;
		onAddPlan?: () => void;
		onAddRisk?: () => void;
		onOpenRecentChats?: () => void;
		onOpenEvents?: () => void;
	} = $props();

	let expanded = $state<TabKey | null>(null);

	function toggle(key: TabKey) {
		const nextExpanded = expanded === key ? null : key;
		expanded = nextExpanded;
		if (nextExpanded === 'inbox') void loadInboxCount();
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
	let BriefChatModal = $state<any>(null);
	let showBriefChatModal = $state(false);
	let briefChatBrief = $state<DailyBrief | null>(null);
	let briefChatSessionId = $state<string | null>(null);
	let briefChatTitle = $state<string | null>(null);
	let openingBriefId = $state<string | null>(null);
	let inboxCount = $state(0);
	let inboxCountLoaded = $state(false);

	async function loadInboxCount() {
		try {
			const url = new URL('/api/inbox/count', window.location.origin);
			url.searchParams.set('project_id', projectId);
			url.searchParams.set('status', 'pending');
			const res = await fetch(url);
			const json = await res.json();
			if (!res.ok) throw new Error(json?.error ?? 'Failed to load inbox count');
			inboxCount = Number(json.data?.total ?? 0);
			inboxCountLoaded = true;
		} catch (error) {
			console.warn('[EntityTabStrip] Failed to load inbox count', error);
			inboxCountLoaded = false;
		}
	}

	onMount(() => {
		void loadInboxCount();
	});

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

	function dateFromDateOnly(value: string): Date {
		const [dateOnly] = value.split('T');
		return new Date(`${dateOnly}T00:00:00`);
	}

	function formatBriefDateLabel(dateString: string | null): string {
		if (!dateString) return 'Unknown date';
		const date = dateFromDateOnly(dateString);
		return date.toLocaleDateString(undefined, {
			weekday: 'short',
			month: 'short',
			day: 'numeric'
		});
	}

	function formatBriefChatTitle(brief: ProjectBriefSummary): string {
		const dateLabel = brief.brief_date
			? formatBriefDateLabel(brief.brief_date)
			: relativeTime(brief.created_at);
		return `${projectName} brief - ${dateLabel}`;
	}

	function markdownToPlainText(markdown: string | null | undefined, maxLength = 220): string {
		if (!markdown) return '';

		const text = markdown
			.replace(/```[\s\S]*?```/g, ' ')
			.replace(/`([^`]+)`/g, '$1')
			.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
			.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
			.replace(/^#{1,6}\s+/gm, '')
			.replace(/^>\s?/gm, '')
			.replace(/^\s*[-*+]\s+/gm, '')
			.replace(/^\s*\d+\.\s+/gm, '')
			.replace(/[*_~|]/g, '')
			.replace(/\s+/g, ' ')
			.trim();

		if (text.length <= maxLength) return text;
		return `${text.slice(0, maxLength).trim()}...`;
	}

	function briefPreview(brief: ProjectBriefSummary): string {
		return markdownToPlainText(brief.executive_summary || brief.brief_content);
	}

	function getBriefChatKey(brief: ProjectBriefSummary): string {
		return brief.daily_brief_id || brief.id;
	}

	function dateOnlyFromBrief(brief: ProjectBriefSummary): string {
		const source = brief.brief_date || brief.created_at;
		return source.split('T')[0] || source;
	}

	function toDailyBriefForChat(brief: ProjectBriefSummary): DailyBrief {
		return {
			id: brief.daily_brief_id || brief.id,
			chat_brief_id: brief.daily_brief_id || brief.id,
			user_id: '',
			brief_date: dateOnlyFromBrief(brief),
			summary_content: brief.brief_content || brief.executive_summary || '',
			executive_summary: brief.executive_summary || brief.brief_content || '',
			priority_actions: brief.priority_actions || [],
			generation_status: 'completed',
			metadata: {
				...(brief.metadata ?? {}),
				project_id: projectId,
				project_name: projectName,
				project_brief_id: brief.id
			},
			created_at: brief.created_at
		};
	}

	async function openBriefChat(brief: ProjectBriefSummary) {
		if (openingBriefId) return;
		openingBriefId = brief.id;

		if (!BriefChatModal) {
			try {
				const module = await import('$lib/components/briefs/BriefChatModal.svelte');
				BriefChatModal = module.default;
			} catch (err) {
				console.error('Failed to load BriefChatModal:', err);
				openingBriefId = null;
				return;
			}
		}

		const chatKey = getBriefChatKey(brief);
		briefChatSessionId = briefChatSessionStore.get(chatKey);
		briefChatTitle = formatBriefChatTitle(brief);
		briefChatBrief = toDailyBriefForChat(brief);
		showBriefChatModal = true;
		openingBriefId = null;
	}

	function handleBriefChatClose(summary?: DataMutationSummary) {
		const chatKey = briefChatBrief?.chat_brief_id || briefChatBrief?.id;
		if (chatKey && summary?.sessionId) {
			briefChatSessionStore.set(chatKey, summary.sessionId);
		}

		showBriefChatModal = false;
		briefChatBrief = null;
		briefChatSessionId = null;
		briefChatTitle = null;

		if (summary?.hasChanges) {
			void loadBriefs(true);
		}
	}

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
				accent: 'text-accent',
				bg: 'bg-accent/10'
			},
			{
				key: 'inbox',
				label: 'Inbox',
				count: inboxCountLoaded ? inboxCount : null,
				icon: Inbox,
				accent: inboxCount > 0 ? 'text-warning' : 'text-muted-foreground',
				bg: inboxCount > 0 ? 'bg-warning/10' : 'bg-muted/20'
			},
			{
				key: 'chats',
				label: 'Chats',
				count: null,
				icon: MessagesSquare,
				accent: 'text-info',
				bg: 'bg-info/10',
				action: true,
				hidden: !onOpenRecentChats
			},
			{
				key: 'graph',
				label: 'Graph',
				count: null,
				icon: GitBranch,
				accent: 'text-info',
				bg: 'bg-info/10',
				action: true,
				hidden: !onOpenGraph
			},
			{
				key: 'goals',
				label: 'Goals',
				count: goals.length,
				icon: Target,
				accent: 'text-warning',
				bg: 'bg-warning/10'
			},
			{
				key: 'milestones',
				label: 'Milestones',
				count: milestones.length,
				icon: Flag,
				accent: 'text-success',
				bg: 'bg-success/10'
			},
			{
				key: 'plans',
				label: 'Plans',
				count: plans.length,
				icon: Calendar,
				accent: 'text-accent',
				bg: 'bg-accent/10'
			},
			{
				key: 'risks',
				label: 'Risks',
				count: risks.length,
				icon: AlertTriangle,
				accent: 'text-destructive',
				bg: 'bg-destructive/10'
			},
			{
				key: 'events',
				label: 'Events',
				count: getUpcomingEvents(events).length,
				icon: Clock,
				accent: 'text-info',
				bg: 'bg-info/10',
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
		active: 'bg-warning/10 text-warning border-warning/30',
		achieved: 'bg-success/10 text-success border-success/30',
		abandoned: 'bg-destructive/10 text-destructive border-destructive/30'
	};
	const planStateAccents: Record<string, string> = {
		draft: 'bg-muted/40 text-muted-foreground border-border/60',
		active: 'bg-accent/10 text-accent border-accent/30',
		completed: 'bg-success/10 text-success border-success/30'
	};
	const milestoneStateAccents: Record<string, string> = {
		pending: 'bg-muted/40 text-muted-foreground border-border/60',
		in_progress: 'bg-info/10 text-info border-info/30',
		completed: 'bg-success/10 text-success border-success/30',
		missed: 'bg-destructive/10 text-destructive border-destructive/30'
	};
	const riskStateAccents: Record<string, string> = {
		identified: 'bg-warning/10 text-warning border-warning/30',
		mitigated: 'bg-success/10 text-success border-success/30',
		occurred: 'bg-destructive/10 text-destructive border-destructive/30',
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

	function handleAction(key: TabActionKey) {
		if (key === 'chats') onOpenRecentChats?.();
		else if (key === 'graph') onOpenGraph?.();
		else onOpenEvents?.();
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
					onclick={() => handleAction(tab.key as TabActionKey)}
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
									{@const preview = briefPreview(brief)}
									<article class="rounded-md border border-border bg-background">
										<button
											type="button"
											onclick={() => openBriefChat(brief)}
											disabled={openingBriefId === brief.id}
											class="w-full text-left px-3 py-2 flex items-center justify-between gap-2 hover:bg-muted/40 transition-colors pressable"
											aria-haspopup="dialog"
										>
											<div class="min-w-0 flex-1">
												<p class="text-xs font-medium text-foreground">
													{brief.brief_date
														? formatBriefDateLabel(brief.brief_date)
														: relativeTime(brief.created_at)}
												</p>
												{#if preview}
													<p
														class="text-[11px] text-muted-foreground line-clamp-1 mt-0.5"
													>
														{preview}
													</p>
												{/if}
											</div>
											{#if openingBriefId === brief.id}
												<LoaderCircle
													class="w-3.5 h-3.5 text-muted-foreground shrink-0 animate-spin"
												/>
											{:else}
												<MessageCircle
													class="w-3.5 h-3.5 text-muted-foreground shrink-0"
												/>
											{/if}
										</button>
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
					{:else if tab.key === 'inbox'}
						<div class="max-h-[60vh] overflow-y-auto">
							<ProjectInboxPanel
								{projectId}
								{canEdit}
								onCountChange={(count) => {
									inboxCount = count;
									inboxCountLoaded = true;
								}}
							/>
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
									{@const justCreated = recentlyCreated?.has(goal.id) ?? false}
									<article
										class="rounded-md border border-border bg-background overflow-hidden {justCreated
											? 'entity-just-created'
											: ''}"
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
																	? 'text-success'
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
									{@const justCreated = recentlyCreated?.has(m.id) ?? false}
									<button
										type="button"
										onclick={() => onEditMilestone(m.id)}
										class="w-full text-left rounded-md border border-border bg-background hover:bg-muted/40 px-3 py-2 transition-colors pressable {justCreated
											? 'entity-just-created'
											: ''}"
									>
										<div class="flex items-start justify-between gap-2 min-w-0">
											<div class="min-w-0 flex-1">
												<div class="flex items-center gap-2 min-w-0">
													<Flag
														class="w-3 h-3 shrink-0 {mState ===
														'completed'
															? 'text-success'
															: 'text-warning'}"
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
									{@const justCreated = recentlyCreated?.has(plan.id) ?? false}
									<button
										type="button"
										onclick={() => onEditPlan(plan.id)}
										class="w-full text-left rounded-md border border-border bg-background hover:bg-muted/40 px-3 py-2 transition-colors pressable {justCreated
											? 'entity-just-created'
											: ''}"
									>
										<div class="flex items-start justify-between gap-2 min-w-0">
											<div class="min-w-0 flex-1">
												<div class="flex items-center gap-2 min-w-0">
													<Calendar
														class="w-3 h-3 shrink-0 text-accent"
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
									{@const justCreated = recentlyCreated?.has(risk.id) ?? false}
									<button
										type="button"
										onclick={() => onEditRisk(risk.id)}
										class="w-full text-left rounded-md border border-border bg-background hover:bg-muted/40 px-3 py-2 transition-colors pressable {justCreated
											? 'entity-just-created'
											: ''}"
									>
										<div class="flex items-start justify-between gap-2 min-w-0">
											<div class="min-w-0 flex-1">
												<div class="flex items-center gap-2 min-w-0">
													<AlertTriangle
														class="w-3 h-3 shrink-0 text-destructive"
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

{#if BriefChatModal && showBriefChatModal && briefChatBrief}
	<BriefChatModal
		isOpen={showBriefChatModal}
		brief={briefChatBrief}
		title={briefChatTitle ?? undefined}
		initialTab="brief"
		initialChatSessionId={briefChatSessionId}
		onClose={handleBriefChatClose}
	/>
{/if}
