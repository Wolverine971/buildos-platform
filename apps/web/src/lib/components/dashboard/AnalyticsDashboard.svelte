<!-- apps/web/src/lib/components/dashboard/AnalyticsDashboard.svelte -->
<script lang="ts">
	import { goto } from '$app/navigation';
	import {
		ArrowRight,
		Calendar,
		FileText,
		FolderOpen,
		LoaderCircle,
		MessageSquare,
		RefreshCcw,
		Target,
		ListChecks,
		AlertTriangle
	} from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { formatFullDate } from '$lib/utils/date-utils';
	import { setNavigationData } from '$lib/stores/project-navigation.store';
	import type { UserDashboardAnalytics } from '$lib/types/dashboard-analytics';

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

	let { user, analytics, onrefresh: refreshHandler }: Props = $props();

	let isRefreshing = $state(false);

	const displayName = $derived(user?.name ?? user?.email?.split('@')[0] ?? 'there');

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

	function withFallback(text: string | null | undefined, fallback: string): string {
		const trimmed = text?.trim();
		return trimmed && trimmed.length > 0 ? trimmed : fallback;
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

	async function handleRefresh() {
		if (!refreshHandler || isRefreshing) return;
		isRefreshing = true;
		try {
			await refreshHandler();
		} finally {
			isRefreshing = false;
		}
	}
</script>

<main class="min-h-screen bg-background transition-colors rounded-md">
	<div
		class="container mx-auto px-2 sm:px-4 lg:px-6 py-2 sm:py-4 lg:py-6 max-w-7xl space-y-3 sm:space-y-4"
	>
		<header class="space-y-2">
			<div class="flex items-start justify-between gap-3">
				<div>
					<h1
						class="text-lg sm:text-2xl lg:text-3xl font-bold text-foreground tracking-tight"
					>
						Hi, {displayName}
					</h1>
					<p class="text-xs sm:text-sm text-muted-foreground mt-0.5">
						Cross-project analytics snapshot
					</p>
				</div>

				<div class="flex items-center gap-1.5 sm:gap-2">
					<time
						datetime={new Date().toISOString()}
						class="text-[10px] sm:text-sm text-muted-foreground font-medium"
					>
						{formatFullDate(new Date())}
					</time>
					<Button
						variant="outline"
						size="sm"
						onclick={handleRefresh}
						disabled={isRefreshing}
						class="px-2"
					>
						{#if isRefreshing}
							<LoaderCircle class="h-3.5 w-3.5 animate-spin" />
						{:else}
							<RefreshCcw class="h-3.5 w-3.5" />
						{/if}
					</Button>
					<Button variant="outline" size="sm" onclick={() => goto('/dashboard/calendar')}>
						<Calendar class="h-3.5 w-3.5 mr-1.5" />
						Calendar
					</Button>
					<Button variant="primary" size="sm" onclick={() => goto('/projects/create')}>
						New Project
					</Button>
				</div>
			</div>
		</header>

		<section class="grid grid-cols-2 lg:grid-cols-4 gap-1.5 sm:gap-3">
			<div class="wt-paper p-3 sm:p-4 tx tx-frame tx-weak">
				<div class="flex items-center justify-between">
					<p class="micro-label text-muted-foreground">PROJECTS</p>
					<FolderOpen class="h-3.5 w-3.5 text-muted-foreground" />
				</div>
				<p class="text-xl sm:text-2xl font-semibold text-foreground mt-1">
					{analytics.snapshot.totalProjects}
				</p>
				<p class="text-[11px] text-muted-foreground mt-1">
					{analytics.snapshot.activeProjects} active
				</p>
			</div>

			<div class="wt-paper p-3 sm:p-4 tx tx-grain tx-weak">
				<div class="flex items-center justify-between">
					<p class="micro-label text-muted-foreground">TASKS</p>
					<ListChecks class="h-3.5 w-3.5 text-muted-foreground" />
				</div>
				<p class="text-xl sm:text-2xl font-semibold text-foreground mt-1">
					{analytics.snapshot.totalTasks}
				</p>
				<p class="text-[11px] text-muted-foreground mt-1">
					{analytics.snapshot.tasksUpdated7d} updated in 7d
				</p>
			</div>

			<div class="wt-paper p-3 sm:p-4 tx tx-thread tx-weak">
				<div class="flex items-center justify-between">
					<p class="micro-label text-muted-foreground">DOCUMENTS</p>
					<FileText class="h-3.5 w-3.5 text-muted-foreground" />
				</div>
				<p class="text-xl sm:text-2xl font-semibold text-foreground mt-1">
					{analytics.snapshot.totalDocuments}
				</p>
				<p class="text-[11px] text-muted-foreground mt-1">
					{analytics.snapshot.documentsUpdated7d} updated in 7d
				</p>
			</div>

			<div class="wt-paper p-3 sm:p-4 tx tx-bloom tx-weak">
				<div class="flex items-center justify-between">
					<p class="micro-label text-muted-foreground">GOALS</p>
					<Target class="h-3.5 w-3.5 text-muted-foreground" />
				</div>
				<p class="text-xl sm:text-2xl font-semibold text-foreground mt-1">
					{analytics.snapshot.totalGoals}
				</p>
				<p class="text-[11px] text-muted-foreground mt-1">
					{analytics.snapshot.goalsUpdated7d} updated in 7d
				</p>
			</div>

			<div class="wt-paper p-3 sm:p-4 tx tx-pulse tx-weak border-accent/30 bg-accent/5">
				<div class="flex items-center justify-between">
					<p class="micro-label text-accent">CHATS</p>
					<MessageSquare class="h-3.5 w-3.5 text-accent" />
				</div>
				<p class="text-xl sm:text-2xl font-semibold text-accent mt-1">
					{analytics.snapshot.chatSessions7d}
				</p>
				<p class="text-[11px] text-accent/80 mt-1">
					{analytics.snapshot.chatSessions24h} in last 24h
				</p>
			</div>

			<div class="wt-paper p-3 sm:p-4 tx tx-static tx-weak">
				<div class="flex items-center justify-between">
					<p class="micro-label text-muted-foreground">UPDATES (24H)</p>
				</div>
				<p class="text-lg sm:text-xl font-semibold text-foreground mt-1">
					{analytics.snapshot.tasksUpdated24h +
						analytics.snapshot.documentsUpdated24h +
						analytics.snapshot.goalsUpdated24h}
				</p>
				<p class="text-[11px] text-muted-foreground mt-1">Tasks + docs + goals</p>
			</div>
		</section>

		<section class="wt-paper p-3 sm:p-4 tx tx-pulse tx-weak">
			<div class="flex items-center gap-2 mb-2">
				<AlertTriangle class="h-4 w-4 text-muted-foreground" />
				<h2 class="text-sm sm:text-base font-semibold text-foreground">Needs attention</h2>
			</div>
			<div class="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs sm:text-sm">
				<div class="rounded-md border border-border bg-card px-3 py-2">
					<p class="micro-label text-muted-foreground">OVERDUE TASKS</p>
					<p class="text-base font-semibold text-foreground mt-0.5">
						{analytics.attention.overdueTasks}
					</p>
				</div>
				<div class="rounded-md border border-border bg-card px-3 py-2">
					<p class="micro-label text-muted-foreground">STALE PROJECTS (7D+)</p>
					<p class="text-base font-semibold text-foreground mt-0.5">
						{analytics.attention.staleProjects7d}
					</p>
				</div>
				<div class="rounded-md border border-border bg-card px-3 py-2">
					<p class="micro-label text-muted-foreground">STALE PROJECTS (30D+)</p>
					<p class="text-base font-semibold text-foreground mt-0.5">
						{analytics.attention.staleProjects30d}
					</p>
				</div>
			</div>
		</section>

		<section class="grid gap-3 lg:grid-cols-2">
			<div class="wt-paper p-3 sm:p-4 tx tx-frame tx-weak">
				<div class="flex items-center justify-between mb-2">
					<h2 class="text-sm sm:text-base font-semibold text-foreground">
						Recently updated projects
					</h2>
					<span class="text-xs text-muted-foreground"
						>{analytics.recent.projects.length}</span
					>
				</div>
				{#if analytics.recent.projects.length === 0}
					<p class="text-xs sm:text-sm text-muted-foreground">
						No recent project activity.
					</p>
				{:else}
					<div class="space-y-1.5">
						{#each analytics.recent.projects as project (project.id)}
							<a
								href="/projects/{project.id}"
								onclick={() => handleProjectClick(project)}
								class="group block rounded-md border border-border bg-card px-3 py-2.5 hover:border-accent/40 transition-colors pressable"
							>
								<div class="flex items-start justify-between gap-2">
									<p class="text-sm font-semibold text-foreground truncate">
										{project.name}
									</p>
									<div class="flex items-center gap-1">
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
								<p class="mt-0.5 text-[11px] text-muted-foreground truncate">
									{project.task_count} tasks · {project.goal_count} goals · {project.document_count}
									docs
								</p>
								<p class="mt-0.5 text-[11px] text-muted-foreground truncate">
									{withFallback(
										project.description,
										project.is_shared ? 'Shared project' : 'No description'
									)}
								</p>
							</a>
						{/each}
					</div>
				{/if}
			</div>

			<div class="wt-paper p-3 sm:p-4 tx tx-grain tx-weak">
				<div class="flex items-center justify-between mb-2">
					<h2 class="text-sm sm:text-base font-semibold text-foreground">
						Recently updated tasks
					</h2>
					<span class="text-xs text-muted-foreground"
						>{analytics.recent.tasks.length}</span
					>
				</div>
				{#if analytics.recent.tasks.length === 0}
					<p class="text-xs sm:text-sm text-muted-foreground">No recent task updates.</p>
				{:else}
					<div class="space-y-1.5">
						{#each analytics.recent.tasks as task (task.id)}
							<a
								href="/projects/{task.project_id}/tasks/{task.id}"
								class="group block rounded-md border border-border bg-card px-3 py-2.5 hover:border-accent/40 transition-colors pressable"
							>
								<div class="flex items-start justify-between gap-2">
									<p class="text-sm font-semibold text-foreground truncate">
										{task.title}
									</p>
									<div class="flex items-center gap-1">
										<span
											class="text-[11px] text-muted-foreground whitespace-nowrap"
										>
											{formatRelativeTime(task.updated_at)}
										</span>
										<ArrowRight
											class="h-3 w-3 text-accent opacity-0 group-hover:opacity-100 transition-opacity"
										/>
									</div>
								</div>
								<p class="mt-0.5 text-[11px] text-muted-foreground truncate">
									{task.project_name} · due {formatDueDate(task.due_at)}
								</p>
								<p class="mt-0.5 text-[11px] text-muted-foreground truncate">
									{withFallback(task.description, 'No description')}
								</p>
							</a>
						{/each}
					</div>
				{/if}
			</div>

			<div class="wt-paper p-3 sm:p-4 tx tx-thread tx-weak">
				<div class="flex items-center justify-between mb-2">
					<h2 class="text-sm sm:text-base font-semibold text-foreground">
						Recently updated documents
					</h2>
					<span class="text-xs text-muted-foreground"
						>{analytics.recent.documents.length}</span
					>
				</div>
				{#if analytics.recent.documents.length === 0}
					<p class="text-xs sm:text-sm text-muted-foreground">
						No recent document updates.
					</p>
				{:else}
					<div class="space-y-1.5">
						{#each analytics.recent.documents as document (document.id)}
							<a
								href="/projects/{document.project_id}"
								class="group block rounded-md border border-border bg-card px-3 py-2.5 hover:border-accent/40 transition-colors pressable"
							>
								<div class="flex items-start justify-between gap-2">
									<p class="text-sm font-semibold text-foreground truncate">
										{document.title}
									</p>
									<div class="flex items-center gap-1">
										<span
											class="text-[11px] text-muted-foreground whitespace-nowrap"
										>
											{formatRelativeTime(document.updated_at)}
										</span>
										<ArrowRight
											class="h-3 w-3 text-accent opacity-0 group-hover:opacity-100 transition-opacity"
										/>
									</div>
								</div>
								<p class="mt-0.5 text-[11px] text-muted-foreground truncate">
									{document.project_name} · {document.state_key}
								</p>
								<p class="mt-0.5 text-[11px] text-muted-foreground truncate">
									{withFallback(document.description, 'No description')}
								</p>
							</a>
						{/each}
					</div>
				{/if}
			</div>

			<div class="wt-paper p-3 sm:p-4 tx tx-bloom tx-weak">
				<div class="flex items-center justify-between mb-2">
					<h2 class="text-sm sm:text-base font-semibold text-foreground">
						Recently updated goals
					</h2>
					<span class="text-xs text-muted-foreground"
						>{analytics.recent.goals.length}</span
					>
				</div>
				{#if analytics.recent.goals.length === 0}
					<p class="text-xs sm:text-sm text-muted-foreground">No recent goal updates.</p>
				{:else}
					<div class="space-y-1.5">
						{#each analytics.recent.goals as goal (goal.id)}
							<a
								href="/projects/{goal.project_id}"
								class="group block rounded-md border border-border bg-card px-3 py-2.5 hover:border-accent/40 transition-colors pressable"
							>
								<div class="flex items-start justify-between gap-2">
									<p class="text-sm font-semibold text-foreground truncate">
										{goal.name}
									</p>
									<div class="flex items-center gap-1">
										<span
											class="text-[11px] text-muted-foreground whitespace-nowrap"
										>
											{formatRelativeTime(goal.updated_at)}
										</span>
										<ArrowRight
											class="h-3 w-3 text-accent opacity-0 group-hover:opacity-100 transition-opacity"
										/>
									</div>
								</div>
								<p class="mt-0.5 text-[11px] text-muted-foreground truncate">
									{goal.project_name} · target {formatDueDate(goal.target_date)}
								</p>
								<p class="mt-0.5 text-[11px] text-muted-foreground truncate">
									{withFallback(goal.description, 'No description')}
								</p>
							</a>
						{/each}
					</div>
				{/if}
			</div>

			<div class="wt-paper p-3 sm:p-4 tx tx-pulse tx-weak lg:col-span-2">
				<div class="flex items-center justify-between mb-2">
					<h2 class="text-sm sm:text-base font-semibold text-foreground">
						Recent chat sessions
					</h2>
					<span class="text-xs text-muted-foreground">
						{analytics.recent.chatSessions.length}
					</span>
				</div>
				{#if analytics.recent.chatSessions.length === 0}
					<p class="text-xs sm:text-sm text-muted-foreground">
						No recent chat sessions yet.
					</p>
				{:else}
					<div class="grid gap-1.5 sm:grid-cols-2">
						{#each analytics.recent.chatSessions as session (session.id)}
							<a
								href="/history?type=chats&id={session.id}&itemType=chat_session"
								class="group block rounded-md border border-border bg-card px-3 py-2.5 hover:border-accent/40 transition-colors pressable"
							>
								<div class="flex items-start justify-between gap-2">
									<p class="text-sm font-semibold text-foreground truncate">
										{session.title}
									</p>
									<div class="flex items-center gap-1">
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
								<p class="mt-0.5 text-[11px] text-muted-foreground truncate">
									{session.context_label}
								</p>
								<p class="mt-0.5 text-[11px] text-muted-foreground truncate">
									{session.message_count} messages · {session.status}
								</p>
							</a>
						{/each}
					</div>
				{/if}
			</div>
		</section>
	</div>
</main>
