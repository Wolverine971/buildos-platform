<!-- apps/web/src/lib/components/dashboard/AnalyticsDashboard.svelte -->
<script lang="ts">
	import { browser } from '$app/environment';
	import { goto, invalidate } from '$app/navigation';
	import {
		ArrowRight,
		Calendar,
		FileText,
		FolderKanban,
		Inbox,
		ListChecks,
		LoaderCircle,
		MessageSquare,
		Plus,
		RefreshCcw,
		Share2,
		Sparkles,
		Target,
		AlertTriangle,
		CheckCircle2,
		UserPlus,
		XCircle
	} from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import DashboardBriefWidget from './DashboardBriefWidget.svelte';
	import ProjectOverdueIndicator from './ProjectOverdueIndicator.svelte';
	import AttentionBanner from './AttentionBanner.svelte';
	import { setNavigationData } from '$lib/stores/project-navigation.store';
	import { getTaskStateBadgeClass } from '$lib/utils/ontology-badge-styles';
	import { getDashboardGreeting } from '$lib/utils/dashboard-greeting';
	import type { UserDashboardAnalytics } from '$lib/types/dashboard-analytics';
	import type { DailyBrief } from '$lib/types/daily-brief';
	import type { DataMutationSummary } from '$lib/components/agent/agent-chat.types';
	import { briefChatSessionStore } from '$lib/stores/briefChatSession.store';
	import type { OverdueProjectBatch } from '$lib/types/overdue-triage';
	import PullToRefresh from '$lib/components/pwa/PullToRefresh.svelte';
	import { toastService } from '$lib/stores/toast.store';

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
		pendingInvites?: ProjectInviteRow[];
		showAgentConnectionCta?: boolean;
		onrefresh?: () => void;
	};

	type ProjectInviteRow = {
		invite_id: string;
		project_id: string | null;
		project_name: string;
		role_key: string | null;
		access: string | null;
		status: string;
		expires_at: string | null;
		created_at: string | null;
		declined_at?: string | null;
		recoverable_until?: string | null;
		can_accept?: boolean | null;
		invited_by_name?: string | null;
		invited_by_email?: string | null;
	};

	type DashboardInboxCountPayload = {
		total?: number;
		account?: number;
		by_project?: Record<string, number>;
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
				action_label: string;
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
				action_label: string;
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
				action_label: string;
				href: string;
		  };

	let {
		user,
		analytics,
		pendingInvites = [],
		showAgentConnectionCta = false,
		onrefresh: refreshHandler
	}: Props = $props();

	let isRefreshing = $state(false);
	let dashboardInviteRows = $state<ProjectInviteRow[]>([]);
	let inviteActionId = $state<string | null>(null);
	let inviteActionError = $state<string | null>(null);
	let isOpeningCalendar = $state(false);
	let showBriefModal = $state(false);
	let selectedBrief = $state<DailyBrief | null>(null);
	let DailyBriefModal = $state<any>(null);
	let BriefChatModal = $state<any>(null);
	let OverdueTaskTriageModal = $state<any>(null);
	let DashboardInboxModal = $state<any>(null);
	let showOverdueTaskTriageModal = $state(false);
	let showDashboardInboxModal = $state(false);
	let isOpeningOverdueTriage = $state(false);
	let isOpeningDashboardInbox = $state(false);
	let selectedOverdueProjectId = $state<string | null>(null);
	let overdueProjectBatches = $state<OverdueProjectBatch[]>([]);
	let overdueProjectBatchTotal = $state(0);
	let overdueProjectTaskTotal = $state(0);
	let isLoadingOverdueProjectBatches = $state(false);
	let overdueProjectBatchError = $state<string | null>(null);
	let overdueProjectBatchRequestToken = 0;
	let dashboardInboxCount = $state(0);
	let dashboardInboxProjectCount = $state(0);
	let dashboardInboxAccountCount = $state(0);
	let isLoadingDashboardInboxCount = $state(false);
	let dashboardInboxCountError = $state<string | null>(null);

	// Brief chat state
	let showBriefChatModal = $state(false);
	let briefChatBrief = $state<DailyBrief | null>(null);
	let briefChatSessionId = $state<string | null>(null);

	const displayName = $derived(user?.name ?? user?.email?.split('@')[0] ?? 'there');
	const dashboardGreeting = $derived(
		getDashboardGreeting({
			displayName,
			timezone: user?.timezone,
			seed: user?.id
		})
	);

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
	const dashboardInboxSummary = $derived.by(() => {
		const itemLabel = `${dashboardInboxCount} pending review item${dashboardInboxCount === 1 ? '' : 's'}`;
		const projectLabel =
			dashboardInboxProjectCount === 1
				? '1 project'
				: `${dashboardInboxProjectCount} projects`;

		if (dashboardInboxProjectCount > 0 && dashboardInboxAccountCount > 0) {
			return `${itemLabel} across ${projectLabel} and account`;
		}
		if (dashboardInboxProjectCount > 0) {
			return `${itemLabel} across ${projectLabel}`;
		}
		if (dashboardInboxAccountCount > 0) {
			return `${itemLabel} in account`;
		}
		return itemLabel;
	});

	const TERMINAL_PROJECT_STATES = new Set([
		'done',
		'completed',
		'canceled',
		'cancelled',
		'closed',
		'archived',
		'abandoned',
		'paused'
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
	const actionableInvites = $derived(
		dashboardInviteRows.filter((invite) => isActionableInvite(invite))
	);
	const pendingInviteCount = $derived(
		actionableInvites.filter((invite) => invite.status === 'pending').length
	);
	const declinedRecoverableInviteCount = $derived(
		actionableInvites.filter((invite) => invite.status === 'declined').length
	);
	const inviteSummary = $derived.by(() => {
		const pendingLabel = `${pendingInviteCount} ${pendingInviteCount === 1 ? 'pending invite' : 'pending invites'}`;
		const declinedLabel = `${declinedRecoverableInviteCount} recoverable`;
		if (pendingInviteCount > 0 && declinedRecoverableInviteCount > 0) {
			return `${pendingLabel} · ${declinedLabel}`;
		}
		if (pendingInviteCount > 0) return pendingLabel;
		return declinedLabel;
	});

	$effect(() => {
		dashboardInviteRows = Array.isArray(pendingInvites) ? [...pendingInvites] : [];
	});

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
				action_label: t.action_label,
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
				action_label: d.action_label,
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
				action_label: g.action_label,
				href: `/projects/${g.project_id}`
			});
		}

		items.sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
		return items.slice(0, 8);
	});

	function isActionableInvite(invite: ProjectInviteRow): boolean {
		if (invite.status === 'pending') return true;
		return invite.status === 'declined' && invite.can_accept === true;
	}

	function formatInviteRole(roleKey: string | null | undefined): string {
		return roleKey === 'viewer' ? 'Viewer' : 'Editor';
	}

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

	function formatInviteDate(value: string | null | undefined): string {
		if (!value) return 'soon';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return 'soon';
		return date.toLocaleDateString(undefined, {
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
		void loadDashboardInboxCount();
	});

	async function loadDashboardInboxCount() {
		isLoadingDashboardInboxCount = true;
		dashboardInboxCountError = null;
		try {
			const response = await fetch('/api/inbox/count?status=pending&limit=5000');
			const payload = await response.json();
			if (!response.ok || !payload.success) {
				throw new Error(payload.error || 'Failed to load inbox count');
			}
			const data = (payload.data ?? {}) as DashboardInboxCountPayload;
			dashboardInboxCount = Number(data.total ?? 0);
			dashboardInboxAccountCount = Number(data.account ?? 0);
			dashboardInboxProjectCount = Object.keys(data.by_project ?? {}).length;
		} catch (err) {
			console.error('[Dashboard] Failed to load inbox count:', err);
			dashboardInboxCountError =
				err instanceof Error ? err.message : 'Failed to load inbox count';
		} finally {
			isLoadingDashboardInboxCount = false;
		}
	}

	async function openDashboardInbox() {
		if (isOpeningDashboardInbox) return;
		isOpeningDashboardInbox = true;
		try {
			if (!DashboardInboxModal) {
				const module = await import('./DashboardInboxModal.svelte');
				DashboardInboxModal = module.default;
			}
			showDashboardInboxModal = true;
		} catch (err) {
			console.error('Failed to load DashboardInboxModal:', err);
			toastService.error('Failed to open inbox');
		} finally {
			isOpeningDashboardInbox = false;
		}
	}

	function handleDashboardInboxClose(summary?: {
		hasChanges: boolean;
		changedCount: number;
		remainingCount: number;
	}) {
		showDashboardInboxModal = false;
		if (summary) {
			dashboardInboxCount = summary.remainingCount;
		}
		if (summary?.hasChanges) {
			const refreshPromise = refreshHandler
				? Promise.resolve(refreshHandler())
				: Promise.resolve();
			void refreshPromise.finally(() => {
				if (browser) void loadDashboardInboxCount();
			});
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

	async function acceptInvite(invite: ProjectInviteRow) {
		if (!invite.invite_id || inviteActionId) return;
		inviteActionId = invite.invite_id;
		inviteActionError = null;

		try {
			const response = await fetch(`/api/onto/invites/${invite.invite_id}/accept`, {
				method: 'POST'
			});
			const payload = await response.json();

			if (!response.ok || !payload?.success) {
				throw new Error(payload?.error || 'Failed to accept invite');
			}

			toastService.success('Invite accepted');
			const projectId =
				payload?.data?.projectId ?? payload?.data?.project_id ?? invite.project_id;
			await goto(
				projectId
					? `/projects/${projectId}?message=${encodeURIComponent('Invite accepted')}`
					: `/projects?message=${encodeURIComponent('Invite accepted')}`,
				{ invalidateAll: true }
			);
		} catch (error) {
			console.error('[Dashboard] Failed to accept invite:', error);
			inviteActionError = error instanceof Error ? error.message : 'Failed to accept invite';
		} finally {
			inviteActionId = null;
		}
	}

	async function declineInvite(invite: ProjectInviteRow) {
		if (!invite.invite_id || inviteActionId || invite.status !== 'pending') return;
		inviteActionId = invite.invite_id;
		inviteActionError = null;

		try {
			const response = await fetch(`/api/onto/invites/${invite.invite_id}/decline`, {
				method: 'POST'
			});
			const payload = await response.json();

			if (!response.ok || !payload?.success) {
				throw new Error(payload?.error || 'Failed to decline invite');
			}

			const declinedAt = payload?.data?.declinedAt ?? new Date().toISOString();
			const recoverableUntil = payload?.data?.recoverableUntil ?? null;
			dashboardInviteRows = dashboardInviteRows.map((row) =>
				row.invite_id === invite.invite_id
					? {
							...row,
							status: 'declined',
							declined_at: declinedAt,
							recoverable_until: recoverableUntil,
							can_accept: true
						}
					: row
			);
			toastService.success('Invite declined. You can still accept it for 48 hours.');
			void invalidate('app:invites');
		} catch (error) {
			console.error('[Dashboard] Failed to decline invite:', error);
			inviteActionError = error instanceof Error ? error.message : 'Failed to decline invite';
		} finally {
			inviteActionId = null;
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
	disabled={isRefreshing ||
		showBriefModal ||
		showBriefChatModal ||
		showOverdueTaskTriageModal ||
		showDashboardInboxModal}
>
	<main class="min-h-screen bg-background transition-colors">
		<div
			class="container mx-auto px-2 sm:px-4 lg:px-6 py-2 sm:py-4 lg:py-6 max-w-7xl space-y-3 sm:space-y-4"
		>
			<!-- Header -->
			<header
				class="flex flex-col gap-2 sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:gap-4"
			>
				<h1
					class="min-w-0 max-w-5xl text-lg sm:text-xl lg:text-2xl font-bold text-foreground tracking-tight leading-snug [overflow-wrap:anywhere] [text-wrap:balance]"
				>
					{dashboardGreeting}
				</h1>
				<div class="flex w-full items-center gap-1.5 sm:w-auto sm:shrink-0 sm:gap-2">
					<Button
						variant="outline"
						size="sm"
						icon={Plus}
						onclick={() => goto('/projects/create')}
						class="flex-1 whitespace-nowrap border-accent/30 bg-card text-accent hover:border-accent/50 hover:bg-accent/10 hover:text-accent focus:ring-accent/40 sm:flex-none"
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
							<LoaderCircle
								class="h-3.5 w-3.5 sm:mr-1.5 animate-spin motion-reduce:animate-none"
							/>
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
							<LoaderCircle
								class="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
							/>
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

			{#if dashboardInboxCount > 0 || dashboardInboxCountError}
				<AttentionBanner
					tone="accent"
					icon={Inbox}
					title="AI Inbox"
					subtext={dashboardInboxCountError
						? 'Inbox count unavailable'
						: dashboardInboxSummary}
					action={dashboardInboxCountError
						? {
								label: 'Retry',
								onClick: loadDashboardInboxCount,
								disabled: isLoadingDashboardInboxCount,
								tone: 'neutral',
								showArrow: false
							}
						: {
								label: 'Review inbox',
								onClick: openDashboardInbox,
								loading: isOpeningDashboardInbox,
								disabled: isOpeningDashboardInbox
							}}
				/>
			{/if}

			{#if showAgentConnectionCta}
				<AttentionBanner
					tone="accent"
					icon={Sparkles}
					title="Do you have agents?"
					subtext="ChatGPT Codex, Claude Code, Open Claw."
					action={{
						label: 'Connect your agents here.',
						href: '/profile?tab=agent-keys'
					}}
				/>
			{/if}

			{#if actionableInvites.length > 0}
				<AttentionBanner
					tone="accent"
					icon={UserPlus}
					title="Project invites"
					subtext={inviteSummary}
					action={{ label: 'Review all', href: '/invites' }}
				>
					{#if inviteActionError}
						<div class="border-t border-accent/15 bg-background/60 px-3 py-2">
							<p class="text-xs text-destructive">{inviteActionError}</p>
						</div>
					{/if}

					<div class="border-t border-accent/15 bg-background/40">
						<div class="grid gap-2 p-3 lg:grid-cols-2">
							{#each actionableInvites.slice(0, 4) as invite (invite.invite_id)}
								<div class="wt-paper px-3 py-2.5">
									<div class="flex items-start justify-between gap-2">
										<div class="min-w-0">
											<p
												class="text-sm font-semibold text-foreground truncate"
											>
												{invite.project_name}
											</p>
											<p
												class="mt-0.5 text-[11px] text-muted-foreground truncate"
											>
												Invited by {invite.invited_by_name ||
													invite.invited_by_email ||
													'a teammate'}
											</p>
										</div>
										<span
											class="shrink-0 rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold text-foreground"
										>
											{formatInviteRole(invite.role_key)}
										</span>
									</div>

									<div
										class="mt-2 flex flex-wrap items-center justify-between gap-2"
									>
										<p class="text-[11px] text-muted-foreground">
											{#if invite.status === 'declined'}
												Declined · recoverable until {formatInviteDate(
													invite.recoverable_until
												)}
											{:else}
												Expires {formatInviteDate(invite.expires_at)}
											{/if}
										</p>
										<div class="flex items-center gap-1.5">
											<button
												type="button"
												onclick={() => acceptInvite(invite)}
												disabled={inviteActionId === invite.invite_id}
												class="inline-flex items-center gap-1 rounded-md bg-accent px-2.5 py-1 text-xs font-semibold text-accent-foreground shadow-ink pressable hover:bg-accent/90 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:opacity-60"
											>
												<CheckCircle2 class="h-3 w-3" />
												{invite.status === 'declined'
													? 'Accept anyway'
													: 'Accept'}
											</button>
											{#if invite.status === 'pending'}
												<button
													type="button"
													onclick={() => declineInvite(invite)}
													disabled={inviteActionId === invite.invite_id}
													class="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-semibold text-foreground shadow-ink pressable hover:bg-muted transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:opacity-60"
												>
													<XCircle class="h-3 w-3" />
													Decline
												</button>
											{/if}
										</div>
									</div>
								</div>
							{/each}
						</div>
					</div>
				</AttentionBanner>
			{/if}

			{#if overdueTasks > 0}
				<AttentionBanner
					tone="warning"
					icon={AlertTriangle}
					title="Overdue tasks need review"
					subtext={overdueProjectBatchSummary}
					action={{
						label: 'Review overdue',
						onClick: () => openOverdueTaskTriage(),
						loading: isOpeningOverdueTriage,
						disabled: isOpeningOverdueTriage,
						showArrow: false
					}}
				>
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
									class="rounded-sm text-xs font-medium text-accent hover:underline underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
									onclick={loadOverdueProjectBatches}
								>
									Retry
								</button>
							{/if}
						</div>
					{/if}
				</AttentionBanner>
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
							class="text-sm text-muted-foreground hover:text-accent transition-colors"
						>
							All projects &rarr;
						</a>
					{/if}
				</div>

				{#if hasNoProjects}
					<!-- Brand new user with nothing -->
					<div
						class="wt-paper p-5 sm:p-6 tx tx-bloom tx-weak border border-dashed border-accent/40 text-center space-y-3"
					>
						<div class="flex justify-center">
							<img
								src="/brain-bolt.webp"
								alt="BuildOS"
								class="w-10 h-10 rounded-md object-cover opacity-80"
							/>
						</div>
						<div>
							<p class="text-sm font-semibold text-foreground">
								Get it out of your head.
							</p>
							<p class="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
								Brain-dump the messy version of what you're working on —
								half-thoughts, voice memos, the 2am spiral. BuildOS turns it into a
								project with structure and memory.
							</p>
						</div>
						<Button
							variant="primary"
							size="sm"
							onclick={() => goto('/projects/create')}
						>
							Start a brain dump
						</Button>
					</div>
				{:else if projectsToDisplay.length === 0}
					<div class="wt-paper p-4 tx tx-frame tx-weak text-center">
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
								class="group relative block wt-paper px-3 py-2.5
								hover:border-accent/40 transition-colors pressable
								focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
							>
								<div class="flex items-center justify-between gap-2">
									<div class="flex items-center gap-2 min-w-0">
										<FolderKanban
											class="h-3.5 w-3.5 shrink-0 {project.is_shared
												? 'text-accent'
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
								<div class="mt-0.5 flex items-center gap-2 pl-[22px]">
									<p
										class="min-w-0 flex-1 truncate text-[11px] text-muted-foreground"
									>
										{project.task_count} tasks · {project.goal_count} goals · {project.document_count}
										docs
									</p>
									{#if overdueBatch}
										<ProjectOverdueIndicator
											batch={overdueBatch}
											class="shrink-0"
										/>
									{/if}
								</div>
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
							class="text-sm text-muted-foreground hover:text-accent transition-colors"
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
								class="group relative block wt-paper px-3 py-2.5
								hover:border-accent/40 transition-colors pressable
								focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
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
								<div class="mt-0.5 flex items-center gap-2 pl-[22px]">
									<p
										class="min-w-0 flex-1 truncate text-[11px] text-muted-foreground"
									>
										{project.task_count} tasks · {project.goal_count} goals · {project.document_count}
										docs
									</p>
									{#if overdueBatch}
										<ProjectOverdueIndicator
											batch={overdueBatch}
											class="shrink-0"
										/>
									{/if}
								</div>
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
						<div class="wt-paper p-4 tx tx-frame tx-weak text-center">
							<p class="text-sm text-muted-foreground">No recent activity yet.</p>
						</div>
					{:else}
						<div class="wt-paper divide-y divide-border overflow-hidden">
							{#each unifiedFeed as item (item.kind + '-' + item.id)}
								<a
									href={item.href}
									class="group flex items-start gap-3 px-3 py-2.5 hover:bg-muted/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
								>
									<div class="shrink-0 mt-0.5">
										{#if item.kind === 'task'}
											<ListChecks class="h-3.5 w-3.5 text-muted-foreground" />
										{:else if item.kind === 'document'}
											<FileText class="h-3.5 w-3.5 text-muted-foreground" />
										{:else}
											<Target class="h-3.5 w-3.5 text-muted-foreground" />
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
											<span
												class="text-[11px] font-medium {item.action_label ===
												'Created'
													? 'text-success'
													: item.action_label === 'Completed'
														? 'text-info'
														: 'text-muted-foreground'}"
												>{item.action_label} {item.kind}</span
											>
											<span class="text-[11px] text-muted-foreground">·</span>
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
							class="text-sm text-muted-foreground hover:text-accent transition-colors"
						>
							All chats &rarr;
						</a>
					</div>

					{#if recentChats.length === 0}
						<div class="wt-paper p-4 tx tx-frame tx-weak text-center">
							<p class="text-sm text-muted-foreground">No recent chats.</p>
						</div>
					{:else}
						<div class="wt-paper divide-y divide-border overflow-hidden">
							{#each recentChats as session (session.id)}
								<a
									href="/history?type=chats&id={session.id}&itemType=chat_session"
									class="group block px-3 py-2.5 hover:bg-muted/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
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

{#if DashboardInboxModal && showDashboardInboxModal}
	<DashboardInboxModal isOpen={showDashboardInboxModal} onClose={handleDashboardInboxClose} />
{/if}
