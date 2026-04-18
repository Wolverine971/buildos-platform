<!-- apps/web/src/lib/components/dashboard/AnalyticsDashboard.svelte -->
<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import {
		ArrowRight,
		Calendar,
		FileText,
		FolderKanban,
		ListChecks,
		LoaderCircle,
		MessageSquare,
		RefreshCcw,
		Share2,
		Target,
		AlertTriangle
	} from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import DashboardBriefWidget from './DashboardBriefWidget.svelte';
	import { setNavigationData } from '$lib/stores/project-navigation.store';
	import { getTaskStateBadgeClass } from '$lib/utils/ontology-badge-styles';
	import type { UserDashboardAnalytics } from '$lib/types/dashboard-analytics';
	import type { DailyBrief } from '$lib/types/daily-brief';
	import type { DataMutationSummary } from '$lib/components/agent/agent-chat.types';
	import { briefChatSessionStore } from '$lib/stores/briefChatSession.store';
	import type { OverdueProjectBatch } from '$lib/types/overdue-triage';
	import PullToRefresh from '$lib/components/pwa/PullToRefresh.svelte';

	type User = {
		id: string;
		email?: string;
		name?: string | null;
		is_admin?: boolean;
		timezone?: string | null;
	};

	type Props = {
		user: User;
		analytics: UserDashboardAnalytics;
		onrefresh?: () => void;
	};

	type ActivityItem =
		| {
				kind: 'task';
				id: string;
				title: string;
				project_id: string;
				project_name: string;
				state_key: string;
				due_at: string | null;
				updated_at: string;
				href: string;
		  }
		| {
				kind: 'document';
				id: string;
				title: string;
				project_id: string;
				project_name: string;
				state_key: string;
				updated_at: string;
				href: string;
		  }
		| {
				kind: 'goal';
				id: string;
				title: string;
				project_id: string;
				project_name: string;
				state_key: string;
				target_date: string | null;
				updated_at: string;
				href: string;
		  };

	let { user, analytics, onrefresh: refreshHandler }: Props = $props();

	let isRefreshing = $state(false);
	let isOpeningCalendar = $state(false);
	let showBriefModal = $state(false);
	let selectedBrief = $state<DailyBrief | null>(null);
	let DailyBriefModal = $state<any>(null);
	let BriefChatModal = $state<any>(null);
	let OverdueTaskTriageModal = $state<any>(null);
	let showOverdueTaskTriageModal = $state(false);
	let isOpeningOverdueTriage = $state(false);
	let selectedOverdueProjectId = $state<string | null>(null);
	let overdueProjectBatches = $state<OverdueProjectBatch[]>([]);
	let overdueProjectBatchTotal = $state(0);
	let overdueProjectTaskTotal = $state(0);
	let isLoadingOverdueProjectBatches = $state(false);
	let overdueProjectBatchError = $state<string | null>(null);
	let overdueProjectBatchRequestToken = 0;

	// Brief chat state
	let showBriefChatModal = $state(false);
	let briefChatBrief = $state<DailyBrief | null>(null);
	let briefChatSessionId = $state<string | null>(null);

	const displayName = $derived(user?.name ?? user?.email?.split('@')[0] ?? 'there');

	const overdueTasks = $derived(analytics.attention.overdueTasks);
	const overdueProjectTaskCount = $derived(overdueProjectTaskTotal || overdueTasks);
	const overdueProjectBatchCount = $derived(
		overdueProjectBatchTotal || overdueProjectBatches.length
	);
	const overdueLabel = $derived(
		`${overdueTasks} overdue ${overdueTasks === 1 ? 'task' : 'tasks'}`
	);
	const overdueProjectBatchSummary = $derived.by(() => {
		const taskSummary = `${overdueProjectTaskCount} overdue ${overdueProjectTaskCount === 1 ? 'task' : 'tasks'}`;
		if (overdueProjectBatchCount <= 0) return taskSummary;
		return `${overdueProjectBatchCount} ${overdueProjectBatchCount === 1 ? 'project' : 'projects'} · ${taskSummary}`;
	});
	const overdueBatchByProjectId = $derived.by(() => {
		const batchesByProject = new Map<string, OverdueProjectBatch>();
		for (const batch of overdueProjectBatches) {
			batchesByProject.set(batch.project_id, batch);
		}
		return batchesByProject;
	});

	const TERMINAL_PROJECT_STATES = new Set([
		'done',
		'completed',
		'canceled',
		'cancelled',
		'closed',
		'archived',
		'abandoned'
	]);

	function normalizeStateKey(stateKey: string | null | undefined): string {
		return (stateKey ?? '').trim().toLowerCase();
	}

	function isActiveProjectState(stateKey: string | null | undefined): boolean {
		const normalized = normalizeStateKey(stateKey);
		if (!normalized) return true;
		return !TERMINAL_PROJECT_STATES.has(normalized);
	}

	const activeProjects = $derived(
		analytics.recent.projects.filter((p) => isActiveProjectState(p.state_key))
	);
	// True when the user has absolutely nothing (brand new account)
	const hasNoProjects = $derived(analytics.recent.projects.length === 0);
	const projectsToDisplay = $derived(
		activeProjects.length > 0 ? activeProjects : analytics.recent.projects.slice(0, 6)
	);
	const showingFallbackProjects = $derived(
		!hasNoProjects && activeProjects.length === 0 && projectsToDisplay.length > 0
	);
	const projectSectionTitle = $derived(showingFallbackProjects ? 'Projects' : 'Active projects');

	const sharedProjects = $derived(analytics.recent.projects.filter((p) => p.is_shared));

	// Shared projects not already visible in the active list
	const activeProjectIds = $derived(new Set(activeProjects.map((p) => p.id)));
	const sharedNotActive = $derived(sharedProjects.filter((p) => !activeProjectIds.has(p.id)));

	const recentChats = $derived(analytics.recent.chatSessions.slice(0, 4));

	const unifiedFeed: ActivityItem[] = $derived.by(() => {
		const items: ActivityItem[] = [];

		for (const t of analytics.recent.tasks) {
			items.push({
				kind: 'task',
				id: t.id,
				title: t.title,
				project_id: t.project_id,
				project_name: t.project_name,
				state_key: t.state_key,
				due_at: t.due_at,
				updated_at: t.updated_at,
				href: `/projects/${t.project_id}/tasks/${t.id}`
			});
		}

		for (const d of analytics.recent.documents) {
			items.push({
				kind: 'document',
				id: d.id,
				title: d.title,
				project_id: d.project_id,
				project_name: d.project_name,
				state_key: d.state_key,
				updated_at: d.updated_at,
				href: `/projects/${d.project_id}`
			});
		}

		for (const g of analytics.recent.goals) {
			items.push({
				kind: 'goal',
				id: g.id,
				title: g.name,
				project_id: g.project_id,
				project_name: g.project_name,
				state_key: g.state_key,
				target_date: g.target_date,
				updated_at: g.updated_at,
				href: `/projects/${g.project_id}`
			});
		}

		items.sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
		return items.slice(0, 8);
	});

	function formatRelativeTime(timestamp: string): string {
		const parsed = Date.parse(timestamp);
		if (Number.isNaN(parsed)) return 'Recently';

		const deltaMs = Date.now() - parsed;
		const deltaMinutes = Math.floor(deltaMs / (60 * 1000));
		if (deltaMinutes < 1) return 'Just now';
		if (deltaMinutes < 60) return `${deltaMinutes}m ago`;
		const deltaHours = Math.floor(deltaMinutes / 60);
		if (deltaHours < 24) return `${deltaHours}h ago`;
		const deltaDays = Math.floor(deltaHours / 24);
		if (deltaDays < 7) return `${deltaDays}d ago`;

		return new Date(parsed).toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric'
		});
	}

	function formatDueDate(value: string | null): string {
		if (!value) return 'No due date';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return 'No due date';
		return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}

	function formatStateLabel(state: string): string {
		return state
			.split('_')
			.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
			.join(' ');
	}

	function formatOverdueProjectTitle(batch: OverdueProjectBatch): string {
		const taskLabel = `${batch.overdue_count} overdue ${batch.overdue_count === 1 ? 'task' : 'tasks'}`;
		if (batch.assigned_to_me_count <= 0) return taskLabel;
		return `${taskLabel}, ${batch.assigned_to_me_count} assigned to me`;
	}

	function resolveProjectHref(project: { id?: string | null }): string {
		const projectId = typeof project.id === 'string' ? project.id.trim() : '';
		return projectId ? `/projects/${projectId}` : '/projects';
	}

	function handleProjectCardClick(
		event: MouseEvent,
		project: {
			id?: string | null;
			name: string;
			description: string | null;
			state_key: string;
			task_count: number;
			document_count: number;
			goal_count: number;
		}
	) {
		const projectId = typeof project.id === 'string' ? project.id.trim() : '';
		if (!projectId) {
			event.preventDefault();
			console.warn('[Dashboard] Project card clicked without a valid id');
			void goto('/projects');
			return;
		}

		handleProjectClick({
			...project,
			id: projectId
		});
	}

	function handleProjectClick(project: {
		id: string;
		name: string;
		description: string | null;
		state_key: string;
		task_count: number;
		document_count: number;
		goal_count: number;
	}) {
		setNavigationData({
			id: project.id,
			name: project.name,
			description: project.description,
			icon_svg: null,
			icon_concept: null,
			icon_generated_at: null,
			icon_generation_source: null,
			icon_generation_prompt: null,
			state_key: project.state_key,
			next_step_short: null,
			next_step_long: null,
			next_step_source: null,
			next_step_updated_at: null,
			task_count: project.task_count,
			document_count: project.document_count,
			goal_count: project.goal_count,
			plan_count: 0,
			milestone_count: 0,
			risk_count: 0
		});
	}

	async function handleViewBrief(brief: DailyBrief) {
		if (!DailyBriefModal) {
			try {
				const module = await import('$lib/components/briefs/DailyBriefModal.svelte');
				DailyBriefModal = module.default;
			} catch (err) {
				console.error('Failed to load DailyBriefModal:', err);
				return;
			}
		}
		selectedBrief = brief;
		showBriefModal = true;
	}

	function handleBriefModalClose() {
		showBriefModal = false;
		selectedBrief = null;
	}

	async function handleBriefChat(brief: DailyBrief) {
		// Close the brief modal first to avoid stacking
		showBriefModal = false;

		// Lazy load BriefChatModal (two-pane brief + chat modal)
		if (!BriefChatModal) {
			try {
				const module = await import('$lib/components/briefs/BriefChatModal.svelte');
				BriefChatModal = module.default;
			} catch (err) {
				console.error('Failed to load BriefChatModal:', err);
				return;
			}
		}

		briefChatSessionId = briefChatSessionStore.get(brief.id);
		briefChatBrief = brief;
		showBriefChatModal = true;
	}

	function handleBriefChatClose(summary?: DataMutationSummary) {
		if (briefChatBrief && summary?.sessionId) {
			briefChatSessionStore.set(briefChatBrief.id, summary.sessionId);
		}

		showBriefChatModal = false;

		if (summary?.hasChanges && refreshHandler) {
			refreshHandler();
		}

		briefChatBrief = null;
		briefChatSessionId = null;
	}

	async function loadOverdueProjectBatches() {
		const requestToken = ++overdueProjectBatchRequestToken;
		isLoadingOverdueProjectBatches = true;
		overdueProjectBatchError = null;

		try {
			const response = await fetch(
				'/api/onto/tasks/overdue/batches?limit=100&include_tasks=false'
			);
			const payload = (await response.json()) as {
				success?: boolean;
				error?: string;
				data?: {
					batches?: OverdueProjectBatch[];
					totalProjects?: number;
					totalTasks?: number;
				};
			};

			if (!response.ok || !payload.success) {
				throw new Error(payload.error || 'Failed to load overdue project batches');
			}

			if (requestToken !== overdueProjectBatchRequestToken) return;
			overdueProjectBatches = payload.data?.batches ?? [];
			overdueProjectBatchTotal = payload.data?.totalProjects ?? overdueProjectBatches.length;
			overdueProjectTaskTotal = payload.data?.totalTasks ?? overdueTasks;
		} catch (err) {
			console.error('[Dashboard] Failed to load overdue project batches:', err);
			if (requestToken !== overdueProjectBatchRequestToken) return;
			overdueProjectBatchError =
				err instanceof Error ? err.message : 'Failed to load overdue project batches';
			overdueProjectBatches = [];
			overdueProjectBatchTotal = 0;
			overdueProjectTaskTotal = overdueTasks;
		} finally {
			if (requestToken === overdueProjectBatchRequestToken) {
				isLoadingOverdueProjectBatches = false;
			}
		}
	}

	$effect(() => {
		if (!browser) return;
		if (overdueTasks <= 0) {
			overdueProjectBatches = [];
			overdueProjectBatchTotal = 0;
			overdueProjectTaskTotal = 0;
			overdueProjectBatchError = null;
			isLoadingOverdueProjectBatches = false;
			return;
		}

		void loadOverdueProjectBatches();
	});

	async function openOverdueTaskTriage(projectId: string | null = null) {
		if (isOpeningOverdueTriage) return;
		isOpeningOverdueTriage = true;
		selectedOverdueProjectId = projectId ?? overdueProjectBatches[0]?.project_id ?? null;

		try {
			if (!OverdueTaskTriageModal) {
				const module = await import('./OverdueTaskTriageModal.svelte');
				OverdueTaskTriageModal = module.default;
			}
			showOverdueTaskTriageModal = true;
		} catch (err) {
			console.error('Failed to load OverdueTaskTriageModal:', err);
			await goto('/projects');
		} finally {
			isOpeningOverdueTriage = false;
		}
	}

	function handleOverdueTaskTriageClose(summary?: { hasChanges: boolean; changedCount: number }) {
		showOverdueTaskTriageModal = false;
		selectedOverdueProjectId = null;
		if (summary?.hasChanges && refreshHandler) {
			void Promise.resolve(refreshHandler()).finally(() => {
				if (browser) {
					void loadOverdueProjectBatches();
				}
			});
		}
	}

	async function handleRefresh() {
		if (!refreshHandler || isRefreshing) return;
		isRefreshing = true;
		try {
			await refreshHandler();
		} finally {
			isRefreshing = false;
		}
	}

	async function openCalendarDashboard() {
		if (isOpeningCalendar) return;
		isOpeningCalendar = true;
		try {
			await goto('/dashboard/calendar');
		} finally {
			isOpeningCalendar = false;
		}
	}
</script>

<PullToRefresh
	onRefresh={handleRefresh}
	disabled={isRefreshing || showBriefModal || showBriefChatModal || showOverdueTaskTriageModal}
>
	<main class="min-h-screen bg-background transition-colors rounded-md">
		<div
			class="container mx-auto px-2 sm:px-4 lg:px-6 py-2 sm:py-4 lg:py-6 max-w-7xl space-y-3 sm:space-y-4"
		>
			<!-- Header -->
			<header
				class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
			>
				<h1
					class="min-w-0 text-lg sm:text-2xl font-bold text-foreground tracking-tight truncate"
				>
					Hi, {displayName}
				</h1>
				<div class="flex w-full items-center gap-1.5 sm:w-auto sm:justify-end sm:gap-2">
					<Button
						variant="primary"
						size="sm"
						onclick={() => goto('/projects/create')}
						class="flex-1 sm:flex-none"
					>
						New Project
					</Button>
					<Button
						variant="outline"
						size="sm"
						onclick={openCalendarDashboard}
						disabled={isOpeningCalendar}
						class="shrink-0 px-2.5 sm:px-3"
						aria-label="Open calendar"
						title="Calendar"
					>
						{#if isOpeningCalendar}
							<LoaderCircle class="h-3.5 w-3.5 sm:mr-1.5 animate-spin" />
							<span class="hidden sm:inline">Opening...</span>
						{:else}
							<Calendar class="h-3.5 w-3.5 sm:mr-1.5" />
							<span class="hidden sm:inline">Calendar</span>
						{/if}
					</Button>
					<Button
						variant="outline"
						size="sm"
						onclick={handleRefresh}
						disabled={isRefreshing}
						class="shrink-0 px-2.5"
						aria-label="Refresh dashboard"
						title="Refresh"
					>
						{#if isRefreshing}
							<LoaderCircle class="h-3.5 w-3.5 animate-spin" />
						{:else}
							<RefreshCcw class="h-3.5 w-3.5" />
						{/if}
					</Button>
				</div>
			</header>

			<!-- Daily Brief -->
			<section>
				<DashboardBriefWidget {user} onviewbrief={handleViewBrief} />
			</section>

			{#if overdueTasks > 0}
				<section
					class="rounded-lg border border-border bg-card shadow-ink wt-card overflow-hidden"
				>
					<div class="flex flex-wrap items-start justify-between gap-3 px-3 py-3">
						<div class="min-w-0 flex items-start gap-2.5">
							<div
								class="flex items-center justify-center h-8 w-8 rounded-md bg-warning/10 shrink-0"
							>
								<AlertTriangle class="h-4 w-4 text-warning" />
							</div>
							<div class="min-w-0">
								<p class="text-sm font-semibold text-foreground">
									Overdue tasks need review
								</p>
								<p class="text-xs text-muted-foreground mt-0.5">
									{overdueProjectBatchSummary}
								</p>
							</div>
						</div>
						<div class="flex items-center gap-1.5 shrink-0">
							<button
								type="button"
								onclick={() => openOverdueTaskTriage()}
								disabled={isOpeningOverdueTriage}
								class="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold
								rounded-md border border-warning/30 bg-warning/10 text-warning shadow-ink pressable
								hover:bg-warning/15 hover:border-warning/50 transition-colors
								disabled:opacity-60 disabled:pointer-events-none
								focus:outline-none focus:ring-1 focus:ring-ring"
							>
								{#if isOpeningOverdueTriage}
									<LoaderCircle class="h-3 w-3 animate-spin" />
									<span class="hidden sm:inline">Opening...</span>
								{:else}
									Review overdue
								{/if}
							</button>
						</div>
					</div>

					{#if isLoadingOverdueProjectBatches || overdueProjectBatchError}
						<div
							class="border-t border-border bg-background/40 px-3 py-2.5 flex flex-wrap items-center justify-between gap-2"
						>
							{#if isLoadingOverdueProjectBatches}
								<p class="text-xs text-muted-foreground">
									Checking affected projects...
								</p>
							{:else if overdueProjectBatchError}
								<p class="text-xs text-muted-foreground">
									Project details unavailable. {overdueLabel}.
								</p>
								<button
									type="button"
									class="text-xs font-medium text-accent hover:underline underline-offset-2"
									onclick={loadOverdueProjectBatches}
								>
									Retry
								</button>
							{/if}
						</div>
					{/if}
				</section>
			{/if}

			<!-- Active Projects -->
			<section>
				<div class="flex items-center justify-between mb-2">
					<h2 class="text-sm sm:text-base font-semibold text-foreground">
						{projectSectionTitle}
					</h2>
					{#if !hasNoProjects}
						<a
							href="/projects"
							class="text-xs text-muted-foreground hover:text-accent transition-colors"
						>
							All projects &rarr;
						</a>
					{/if}
				</div>

				{#if hasNoProjects}
					<!-- Brand new user with nothing -->
					<div
						class="wt-paper p-5 sm:p-6 tx tx-bloom tx-weak rounded-lg border border-dashed border-accent/40 text-center space-y-3"
					>
						<div class="flex justify-center">
							<img
								src="/brain-bolt.webp"
								alt="BuildOS"
								class="w-10 h-10 rounded-md object-cover opacity-80"
							/>
						</div>
						<div>
							<p class="text-sm font-semibold text-foreground">Welcome to BuildOS!</p>
							<p class="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
								Create your first project and BuildOS will help you shape goals,
								tasks, and milestones.
							</p>
						</div>
						<Button
							variant="primary"
							size="sm"
							onclick={() => goto('/projects/create')}
						>
							Create your first project
						</Button>
					</div>
				{:else if projectsToDisplay.length === 0}
					<div
						class="wt-paper p-4 tx tx-frame tx-weak rounded-lg border border-border text-center"
					>
						<p class="text-sm text-muted-foreground">No projects to show right now.</p>
						<Button
							variant="outline"
							size="sm"
							onclick={() => goto('/projects')}
							class="mt-2"
						>
							View all projects
						</Button>
					</div>
				{:else}
					{#if showingFallbackProjects}
						<div class="mb-2 text-xs text-muted-foreground px-1">
							No active projects right now. Showing your most recent projects.
						</div>
					{/if}
					<div class="grid gap-2 sm:gap-3 lg:grid-cols-2">
						{#each projectsToDisplay as project (project.id)}
							{@const overdueBatch = overdueBatchByProjectId.get(project.id)}
							<a
								href={resolveProjectHref(project)}
								onclick={(event) => handleProjectCardClick(event, project)}
								class="group block wt-paper rounded-lg border border-border bg-card px-3 py-2.5
								hover:border-accent/40 transition-colors pressable"
							>
								<div class="flex items-center justify-between gap-2">
									<div class="flex items-center gap-2 min-w-0">
										<FolderKanban
											class="h-3.5 w-3.5 shrink-0 {project.is_shared
												? 'text-accent'
												: isActiveProjectState(project.state_key)
													? 'text-success'
													: 'text-muted-foreground'}"
										/>
										<p class="text-sm font-semibold text-foreground truncate">
											{project.name}
										</p>
										{#if project.is_shared}
											<span
												class="shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-accent/15 text-accent border border-accent/20"
											>
												<Share2 class="h-2.5 w-2.5" />
												Shared
											</span>
										{/if}
										{#if !isActiveProjectState(project.state_key)}
											<span
												class="shrink-0 text-[10px] font-medium text-muted-foreground"
											>
												{formatStateLabel(project.state_key)}
											</span>
										{/if}
									</div>
									<div class="flex items-center gap-1 shrink-0">
										<span
											class="text-[11px] text-muted-foreground whitespace-nowrap"
										>
											{formatRelativeTime(project.updated_at)}
										</span>
										<ArrowRight
											class="h-3 w-3 text-accent opacity-0 group-hover:opacity-100 transition-opacity"
										/>
									</div>
								</div>
								<p class="mt-0.5 text-[11px] text-muted-foreground pl-[22px]">
									{project.task_count} tasks · {project.goal_count} goals · {project.document_count}
									docs
								</p>
								{#if overdueBatch}
									<div class="mt-1 pl-[22px]">
										<span
											class="inline-flex max-w-full items-center gap-1 rounded-md border border-warning/25 bg-warning/10 px-1.5 py-0.5 text-[10px] font-semibold text-warning"
											title={formatOverdueProjectTitle(overdueBatch)}
											aria-label={formatOverdueProjectTitle(overdueBatch)}
										>
											<AlertTriangle class="h-2.5 w-2.5 shrink-0" />
											<span class="truncate">Has overdue tasks</span>
										</span>
									</div>
								{/if}
							</a>
						{/each}
					</div>
				{/if}
			</section>

			<!-- Shared With Me (projects not already in active list) -->
			{#if sharedNotActive.length > 0 && !showingFallbackProjects}
				<section>
					<div class="flex items-center justify-between mb-2">
						<div class="flex items-center gap-2">
							<h2 class="text-sm sm:text-base font-semibold text-foreground">
								Shared with me
							</h2>
							<span
								class="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-accent/15 text-accent border border-accent/20"
							>
								{sharedNotActive.length}
							</span>
						</div>
						<a
							href="/projects"
							class="text-xs text-muted-foreground hover:text-accent transition-colors"
						>
							View all &rarr;
						</a>
					</div>

					<div class="grid gap-2 sm:gap-3 lg:grid-cols-2">
						{#each sharedNotActive as project (project.id)}
							{@const overdueBatch = overdueBatchByProjectId.get(project.id)}
							<a
								href={resolveProjectHref(project)}
								onclick={(event) => handleProjectCardClick(event, project)}
								class="group block wt-paper rounded-lg border border-border bg-card px-3 py-2.5
								hover:border-accent/40 transition-colors pressable"
							>
								<div class="flex items-center justify-between gap-2">
									<div class="flex items-center gap-2 min-w-0">
										<FolderKanban class="h-3.5 w-3.5 text-accent shrink-0" />
										<p class="text-sm font-semibold text-foreground truncate">
											{project.name}
										</p>
										<span
											class="shrink-0 text-[10px] font-medium text-muted-foreground"
										>
											{formatStateLabel(project.state_key)}
										</span>
									</div>
									<div class="flex items-center gap-1 shrink-0">
										<span
											class="text-[11px] text-muted-foreground whitespace-nowrap"
										>
											{formatRelativeTime(project.updated_at)}
										</span>
										<ArrowRight
											class="h-3 w-3 text-accent opacity-0 group-hover:opacity-100 transition-opacity"
										/>
									</div>
								</div>
								<p class="mt-0.5 text-[11px] text-muted-foreground pl-[22px]">
									{project.task_count} tasks · {project.goal_count} goals · {project.document_count}
									docs
								</p>
								{#if overdueBatch}
									<div class="mt-1 pl-[22px]">
										<span
											class="inline-flex max-w-full items-center gap-1 rounded-md border border-warning/25 bg-warning/10 px-1.5 py-0.5 text-[10px] font-semibold text-warning"
											title={formatOverdueProjectTitle(overdueBatch)}
											aria-label={formatOverdueProjectTitle(overdueBatch)}
										>
											<AlertTriangle class="h-2.5 w-2.5 shrink-0" />
											<span class="truncate">Has overdue tasks</span>
										</span>
									</div>
								{/if}
							</a>
						{/each}
					</div>
				</section>
			{/if}

			<!-- Recent Activity + Recent Chats side by side on desktop -->
			<div class="grid gap-3 lg:grid-cols-3">
				<!-- Unified Activity Feed (2/3 width on desktop) -->
				<section class="lg:col-span-2">
					<h2 class="text-sm sm:text-base font-semibold text-foreground mb-2">
						Recent activity
					</h2>

					{#if unifiedFeed.length === 0}
						<div
							class="wt-paper p-4 tx tx-frame tx-weak rounded-lg border border-border text-center"
						>
							<p class="text-sm text-muted-foreground">No recent activity yet.</p>
						</div>
					{:else}
						<div
							class="wt-paper rounded-lg border border-border divide-y divide-border"
						>
							{#each unifiedFeed as item (item.kind + '-' + item.id)}
								<a
									href={item.href}
									class="group flex items-start gap-3 px-3 py-2.5 hover:bg-muted/50 transition-colors first:rounded-t-lg last:rounded-b-lg"
								>
									<div class="shrink-0 mt-0.5">
										{#if item.kind === 'task'}
											<ListChecks class="h-3.5 w-3.5 text-muted-foreground" />
										{:else if item.kind === 'document'}
											<FileText class="h-3.5 w-3.5 text-info" />
										{:else}
											<Target class="h-3.5 w-3.5 text-warning" />
										{/if}
									</div>

									<div class="min-w-0 flex-1">
										<div class="flex items-center gap-2">
											<p class="text-sm font-medium text-foreground truncate">
												{item.title}
											</p>
											{#if item.kind === 'task'}
												<span
													class="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium border {getTaskStateBadgeClass(
														item.state_key
													)}"
												>
													{formatStateLabel(item.state_key)}
												</span>
											{/if}
										</div>
										<div class="flex items-center gap-1.5 mt-0.5">
											<span class="text-[11px] text-muted-foreground truncate"
												>{item.project_name}</span
											>
											{#if item.kind === 'task' && item.due_at}
												<span class="text-[11px] text-muted-foreground"
													>· due {formatDueDate(item.due_at)}</span
												>
											{/if}
											{#if item.kind === 'goal' && item.target_date}
												<span class="text-[11px] text-muted-foreground"
													>· target {formatDueDate(
														item.target_date
													)}</span
												>
											{/if}
										</div>
									</div>

									<div class="flex items-center gap-1 shrink-0">
										<span
											class="text-[11px] text-muted-foreground whitespace-nowrap"
										>
											{formatRelativeTime(item.updated_at)}
										</span>
										<ArrowRight
											class="h-3 w-3 text-accent opacity-0 group-hover:opacity-100 transition-opacity"
										/>
									</div>
								</a>
							{/each}
						</div>
					{/if}
				</section>

				<!-- Recent Chats (1/3 width on desktop) -->
				<section>
					<div class="flex items-center justify-between mb-2">
						<h2 class="text-sm sm:text-base font-semibold text-foreground">
							Recent chats
						</h2>
						<a
							href="/history?type=chats"
							class="text-xs text-muted-foreground hover:text-accent transition-colors"
						>
							All chats &rarr;
						</a>
					</div>

					{#if recentChats.length === 0}
						<div
							class="wt-paper p-4 tx tx-frame tx-weak rounded-lg border border-border text-center"
						>
							<p class="text-sm text-muted-foreground">No recent chats.</p>
						</div>
					{:else}
						<div
							class="wt-paper rounded-lg border border-border divide-y divide-border"
						>
							{#each recentChats as session (session.id)}
								<a
									href="/history?type=chats&id={session.id}&itemType=chat_session"
									class="group block px-3 py-2.5 hover:bg-muted/50 transition-colors first:rounded-t-lg last:rounded-b-lg"
								>
									<div class="flex items-start justify-between gap-2">
										<div class="flex items-start gap-2 min-w-0">
											<MessageSquare
												class="h-3.5 w-3.5 text-accent shrink-0 mt-0.5"
											/>
											<div class="min-w-0">
												<p
													class="text-sm font-medium text-foreground truncate"
												>
													{session.title}
												</p>
												<p
													class="text-[11px] text-muted-foreground truncate mt-0.5"
												>
													{#if session.project_name}
														{session.project_name}
													{:else}
														{session.context_label}
													{/if}
												</p>
											</div>
										</div>
										<div class="flex items-center gap-1 shrink-0">
											<span
												class="text-[11px] text-muted-foreground whitespace-nowrap"
											>
												{formatRelativeTime(session.last_activity_at)}
											</span>
											<ArrowRight
												class="h-3 w-3 text-accent opacity-0 group-hover:opacity-100 transition-opacity"
											/>
										</div>
									</div>
								</a>
							{/each}
						</div>
					{/if}
				</section>
			</div>

			<!-- Compact Stats -->
			<footer
				class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground px-1"
			>
				<span>{analytics.snapshot.totalProjects} projects</span>
				<span class="text-border">&middot;</span>
				<span>{analytics.snapshot.totalTasks} tasks</span>
				<span class="text-border">&middot;</span>
				<span>{analytics.snapshot.totalGoals} goals</span>
				<span class="text-border">&middot;</span>
				<span>{analytics.snapshot.totalDocuments} docs</span>
			</footer>
		</div>
	</main>
</PullToRefresh>

<!-- Daily Brief Modal (lazy loaded) -->
{#if DailyBriefModal && showBriefModal}
	<DailyBriefModal
		isOpen={showBriefModal}
		brief={selectedBrief}
		briefDate={selectedBrief?.brief_date}
		onClose={handleBriefModalClose}
		onchat={handleBriefChat}
	/>
{/if}

<!-- Brief Chat Modal (two-pane: brief + chat) -->
{#if BriefChatModal && showBriefChatModal && briefChatBrief}
	<BriefChatModal
		isOpen={showBriefChatModal}
		brief={briefChatBrief}
		initialChatSessionId={briefChatSessionId}
		onClose={handleBriefChatClose}
	/>
{/if}

{#if OverdueTaskTriageModal && showOverdueTaskTriageModal}
	<OverdueTaskTriageModal
		isOpen={showOverdueTaskTriageModal}
		initialProjectId={selectedOverdueProjectId}
		onClose={handleOverdueTaskTriageClose}
	/>
{/if}
