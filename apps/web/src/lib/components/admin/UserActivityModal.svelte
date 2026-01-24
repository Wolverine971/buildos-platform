<!-- apps/web/src/lib/components/admin/UserActivityModal.svelte -->
<script lang="ts">
	import {
		User,
		Calendar,
		FileText,
		FolderOpen,
		CheckSquare,
		StickyNote,
		Clock,
		TrendingUp,
	Activity,
	Target,
	Settings,
	CheckCircle,
	XCircle,
	BarChart3,
	RefreshCw,
	MessageSquare
} from 'lucide-svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import ProjectActivityChart from './ProjectActivityChart.svelte';
	import ActivityTimelineChart from './ActivityTimelineChart.svelte';
	import UserContextPanel from './UserContextPanel.svelte';
	import { onMount } from 'svelte';
	import { toastService } from '$lib/stores/toast.store';

	let { user, onclose }: { user: any; onclose?: () => void } = $props();

	let timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	let userContext = $state<any>(null);
	let contextLoading = $state(true);
	let contextError = $state<string | null>(null);

	onMount(() => {
		timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
		loadUserContext();
	});

	let isOpen = $state(true);

	function handleClose() {
		isOpen = false;
		onclose?.();
	}

	async function loadUserContext() {
		contextLoading = true;
		contextError = null;
		try {
			const response = await fetch(`/api/admin/users/${user.id}/context`);
			if (!response.ok) throw new Error('Failed to load user context');
			const result = await response.json();
			if (result.success) {
				userContext = result.data;
			} else {
				throw new Error(result.error || 'Failed to load user context');
			}
		} catch (error) {
			console.error('Error loading user context:', error);
			contextError = error instanceof Error ? error.message : 'Failed to load user context';
			toastService.error('Failed to load user context');
		} finally {
			contextLoading = false;
		}
	}

	function formatDate(dateString: string | null): string {
		if (!dateString) return 'Not set';
		return new Date(dateString).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		});
	}

	function formatLastVisit(dateString: string | null): string {
		if (!dateString) return 'Never';

		const date = new Date(dateString);
		const now = new Date();
		const diffHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));

		if (diffHours < 1) return 'Just now';
		if (diffHours < 24) return `${diffHours} hours ago`;
		if (diffHours < 24 * 7) return `${Math.floor(diffHours / 24)} days ago`;

		return date.toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
			timeZone
		});
	}

let projects = $derived(user.projects || []);
let recentActivity = $derived(user.recent_activity || []);
let activityStats = $derived(user.activity_stats || {});
</script>

<Modal {isOpen} onClose={handleClose} size="xl" customClasses="max-h-[95vh] overflow-y-auto">
	{#snippet header()}
		<div
			class="flex items-center gap-3 px-4 py-3 border-b border-border min-w-0"
		>
			<div
				class="h-9 w-9 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0"
			>
				<span class="text-sm font-bold text-accent">
					{(user.name || user.email).charAt(0).toUpperCase()}
				</span>
			</div>
			<div class="min-w-0 flex-1">
				<h2 class="text-base font-semibold text-foreground truncate">
					{user.name || 'User'}
				</h2>
				<p class="text-xs text-muted-foreground truncate">{user.email}</p>
			</div>
		</div>
	{/snippet}
	{#snippet children()}
		<div class="px-4 py-3 space-y-3">
			<!-- User Overview Cards -->
			<div class="grid grid-cols-2 lg:grid-cols-4 gap-2">
				<!-- Last Visit -->
				<div
					class="bg-accent/5 border border-accent/20 rounded-lg p-2.5"
				>
					<div class="flex items-center justify-between gap-2">
						<div class="min-w-0 flex-1">
							<p
								class="text-[0.65rem] font-medium uppercase tracking-wide text-accent truncate"
							>
								Last Visit
							</p>
							<p
								class="text-sm font-bold text-foreground line-clamp-1"
							>
								{formatLastVisit(user.last_visit)}
							</p>
						</div>
						<Clock
							class="h-5 w-5 text-accent flex-shrink-0"
						/>
					</div>
				</div>

				<!-- Onboarding Status -->
				<div
					class="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-2.5"
				>
					<div class="flex items-center justify-between gap-2">
						<div class="min-w-0 flex-1">
							<p
								class="text-[0.65rem] font-medium uppercase tracking-wide text-emerald-600 dark:text-emerald-400 truncate"
							>
								Onboarding
							</p>
							<p
								class="text-sm font-bold text-foreground"
							>
								{user.completed_onboarding ? 'Done' : 'Pending'}
							</p>
						</div>
						{#if user.completed_onboarding}
							<CheckCircle
								class="h-5 w-5 text-emerald-500 flex-shrink-0"
							/>
						{:else}
							<XCircle
								class="h-5 w-5 text-rose-500 flex-shrink-0"
							/>
						{/if}
					</div>
				</div>

				<!-- Total Projects -->
				<div
					class="bg-purple-500/5 border border-purple-500/20 rounded-lg p-2.5"
				>
					<div class="flex items-center justify-between gap-2">
						<div class="min-w-0 flex-1">
							<p
								class="text-[0.65rem] font-medium uppercase tracking-wide text-purple-600 dark:text-purple-400 truncate"
							>
								Projects
							</p>
							<p
								class="text-sm font-bold text-foreground"
							>
								{activityStats.total_projects || 0}
							</p>
						</div>
						<FolderOpen
							class="h-5 w-5 text-purple-600 dark:text-purple-400 flex-shrink-0"
						/>
					</div>
				</div>

				<!-- Total Tasks -->
				<div
					class="bg-amber-500/5 border border-amber-500/20 rounded-lg p-2.5"
				>
					<div class="flex items-center justify-between gap-2">
						<div class="min-w-0 flex-1">
							<p
								class="text-[0.65rem] font-medium uppercase tracking-wide text-amber-600 dark:text-amber-400 truncate"
							>
								Tasks
							</p>
							<p
								class="text-sm font-bold text-foreground"
							>
								{activityStats.total_tasks || 0}
							</p>
						</div>
						<CheckSquare
							class="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0"
						/>
					</div>
				</div>
			</div>

			<!-- Activity Stats Grid - Compact on Mobile -->
			<div class="grid grid-cols-3 sm:grid-cols-5 gap-2">
				<div
					class="bg-card rounded-lg border border-border p-2 text-center shadow-ink"
				>
					<div class="flex items-center justify-center mb-0.5">
						<FileText class="h-4 w-4 text-accent" />
					</div>
					<p class="text-base font-bold text-foreground">
						{activityStats.total_briefs || 0}
					</p>
					<p class="text-[0.65rem] text-muted-foreground uppercase tracking-wide">Briefs</p>
				</div>

				<div
					class="bg-card rounded-lg border border-border p-2 text-center shadow-ink"
				>
					<div class="flex items-center justify-center mb-0.5">
						<MessageSquare class="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
					</div>
					<p class="text-base font-bold text-foreground">
						{activityStats.total_agentic_sessions || 0}
					</p>
					<p class="text-[0.65rem] text-muted-foreground uppercase tracking-wide">Agentic</p>
				</div>

				<div
					class="bg-card rounded-lg border border-border p-2 text-center shadow-ink"
				>
					<div class="flex items-center justify-center mb-0.5">
						<StickyNote class="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
					</div>
					<p class="text-base font-bold text-foreground">
						{activityStats.total_notes || 0}
					</p>
					<p class="text-[0.65rem] text-muted-foreground uppercase tracking-wide">Notes</p>
				</div>

				<div
					class="bg-card rounded-lg border border-border p-2 text-center shadow-ink"
				>
					<div class="flex items-center justify-center mb-0.5">
						<Calendar class="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
					</div>
					<p class="text-base font-bold text-foreground">
						{activityStats.scheduled_briefs || 0}
					</p>
					<p class="text-[0.65rem] text-muted-foreground uppercase tracking-wide">Sched</p>
				</div>

				<div
					class="bg-card rounded-lg border border-border p-2 text-center shadow-ink"
				>
					<div class="flex items-center justify-center mb-0.5">
						<CheckSquare class="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
					</div>
					<p class="text-base font-bold text-foreground">
						{activityStats.completed_tasks || 0}
					</p>
					<p class="text-[0.65rem] text-muted-foreground uppercase tracking-wide">Done</p>
				</div>
			</div>

			<!-- Enhanced Activity Stats with Context Data -->
			{#if userContext?.activity}
				<div
					class="bg-card rounded-lg border border-border p-3 shadow-ink"
				>
					<h3
						class="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5"
					>
						<Activity class="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
						Enhanced Activity Metrics
					</h3>
					<div class="grid grid-cols-2 md:grid-cols-4 gap-2">
						<div
							class="bg-muted/50 rounded-md border border-border/50 p-2 text-center"
						>
							<div class="flex items-center justify-center mb-0.5">
								<MessageSquare class="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
							</div>
							<p class="text-sm font-bold text-foreground">
								{userContext.activity.agentic_sessions_count || 0}
							</p>
							<p class="text-[0.65rem] text-muted-foreground uppercase tracking-wide">Agentic</p>
						</div>

						<div
							class="bg-muted/50 rounded-md border border-border/50 p-2 text-center"
						>
							<div class="flex items-center justify-center mb-0.5">
								<StickyNote class="h-4 w-4 text-amber-500" />
							</div>
							<p class="text-sm font-bold text-foreground">
								{userContext.activity.notes_count || 0}
							</p>
							<p class="text-[0.65rem] text-muted-foreground uppercase tracking-wide">Notes</p>
						</div>

						<div
							class="bg-muted/50 rounded-md border border-border/50 p-2 text-center"
						>
							<div class="flex items-center justify-center mb-0.5">
								<MessageSquare class="h-4 w-4 text-accent" />
							</div>
							<p class="text-sm font-bold text-foreground">
								{userContext.activity.agentic_messages_count || 0}
							</p>
							<p class="text-[0.65rem] text-muted-foreground uppercase tracking-wide">Messages</p>
						</div>

						<div
							class="bg-muted/50 rounded-md border border-border/50 p-2 text-center"
						>
							<div class="flex items-center justify-center mb-0.5">
								<CheckSquare class="h-4 w-4 text-accent" />
							</div>
							<p class="text-sm font-bold text-foreground">
								{userContext.activity.tasks_created || 0}
							</p>
							<p class="text-[0.65rem] text-muted-foreground uppercase tracking-wide">Tasks</p>
						</div>
					</div>
				</div>
			{/if}

			<!-- Comprehensive User Context Panel -->
			{#if contextLoading}
				<div
					class="bg-card rounded-lg border border-border p-4 shadow-ink"
				>
					<div class="flex items-center justify-center gap-2">
						<RefreshCw class="w-4 h-4 animate-spin text-accent" />
						<span class="text-sm text-muted-foreground"
							>Loading comprehensive user data...</span
						>
					</div>
				</div>
			{:else if contextError}
				<div
					class="bg-rose-500/5 border border-rose-500/20 rounded-lg p-3 tx tx-static tx-weak"
				>
					<p class="text-sm text-rose-600 dark:text-rose-400">
						Error loading user context: {contextError}
					</p>
					<Button onclick={loadUserContext} variant="outline" size="sm" class="mt-2 pressable">
						Retry
					</Button>
				</div>
			{:else if userContext}
				<UserContextPanel {userContext} expanded={true} />
			{/if}

			<!-- Charts Section -->
			<div class="grid grid-cols-1 lg:grid-cols-2 gap-2">
				<!-- Project Activity Chart -->
				<div
					class="bg-card rounded-lg border border-border p-3 shadow-ink"
				>
					<h3
						class="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5"
					>
						<BarChart3 class="h-3.5 w-3.5 text-accent flex-shrink-0" />
						Project Activity
					</h3>
					<ProjectActivityChart {projects} />
				</div>
			</div>

			<!-- Activity Timeline -->
			<div
				class="bg-card rounded-lg border border-border p-3 shadow-ink"
			>
				<h3
					class="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5"
				>
					<Activity class="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
					Recent Activity Timeline
				</h3>
				<ActivityTimelineChart activities={recentActivity} />
			</div>

			<!-- User Context -->
			{#if userContext && Object.keys(userContext).length > 0}
				<div
					class="bg-card rounded-lg border border-border p-3 shadow-ink"
				>
					<h3
						class="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5"
					>
						<User class="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400 flex-shrink-0" />
						User Context & Preferences
					</h3>

					<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
						{#if userContext.goals_overview}
							<div>
								<h4
									class="text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1"
								>
									<Target class="h-3 w-3 flex-shrink-0" />
									<span class="truncate">Goals</span>
								</h4>
								<p
									class="text-xs text-foreground bg-muted/50 p-2 rounded border border-border/50 line-clamp-2"
								>
									{userContext.goals_overview}
								</p>
							</div>
						{/if}

						{#if userContext.work_style}
							<div>
								<h4
									class="text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1"
								>
									<Settings class="h-3 w-3 flex-shrink-0" />
									<span class="truncate">Work Style</span>
								</h4>
								<p
									class="text-xs text-foreground bg-muted/50 p-2 rounded border border-border/50 line-clamp-2"
								>
									{userContext.work_style}
								</p>
							</div>
						{/if}

						{#if userContext.focus_areas}
							<div>
								<h4
									class="text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground mb-1 truncate"
								>
									Focus Areas
								</h4>
								<p
									class="text-xs text-foreground bg-muted/50 p-2 rounded border border-border/50 line-clamp-2"
								>
									{userContext.focus_areas}
								</p>
							</div>
						{/if}

						{#if userContext.active_projects}
							<div>
								<h4
									class="text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground mb-1 truncate"
								>
									Active Projects
								</h4>
								<p
									class="text-xs text-foreground bg-muted/50 p-2 rounded border border-border/50 line-clamp-2"
								>
									{userContext.active_projects}
								</p>
							</div>
						{/if}

						{#if userContext.productivity_challenges}
							<div>
								<h4
									class="text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground mb-1 truncate"
								>
									Challenges
								</h4>
								<p
									class="text-xs text-foreground bg-muted/50 p-2 rounded border border-border/50 line-clamp-2"
								>
									{userContext.productivity_challenges}
								</p>
							</div>
						{/if}

						{#if userContext.preferred_work_hours}
							<div>
								<h4
									class="text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground mb-1 truncate"
								>
									Work Hours
								</h4>
								<p
									class="text-xs text-foreground bg-muted/50 p-2 rounded border border-border/50 line-clamp-2"
								>
									{userContext.preferred_work_hours}
								</p>
							</div>
						{/if}
					</div>

					{#if userContext.onboarding_completed_at}
						<div class="mt-2 pt-2 border-t border-border">
							<p class="text-xs text-muted-foreground flex items-center gap-1">
								<CheckCircle
									class="h-3 w-3 text-emerald-500"
								/>
								Onboarding completed on {formatDate(
									userContext.onboarding_completed_at
								)}
							</p>
						</div>
					{/if}
				</div>
			{/if}

			<!-- Projects Summary -->
			{#if projects.length > 0}
				<div
					class="bg-card rounded-lg border border-border p-3 shadow-ink"
				>
					<h3
						class="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5"
					>
						<FolderOpen
							class="h-3.5 w-3.5 text-purple-600 dark:text-purple-400 flex-shrink-0"
						/>
						<span class="truncate">Projects ({projects.length})</span>
					</h3>

					<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
						{#each projects.slice(0, 6) as project}
							<div
								class="border border-border rounded-md p-2 bg-muted/30 hover:bg-muted/50 transition-colors"
							>
								<h4
									class="font-medium text-foreground mb-1 text-sm truncate"
								>
									{project.name || 'Untitled'}
								</h4>
								<div
									class="space-y-0.5 text-xs text-muted-foreground"
								>
									<p class="truncate">
										<span class="font-medium text-foreground"
											>{project.status || 'Unknown'}</span
										>
									</p>
									<p>
										<span class="font-medium text-foreground">{project.task_count || 0}</span> tasks
									</p>
									<p>
										<span class="font-medium text-foreground">{project.notes_count || 0}</span> notes
									</p>
									<p class="text-[0.65rem]">{formatDate(project.created_at)}</p>
								</div>
							</div>
						{/each}
					</div>

					{#if projects.length > 6}
						<p
							class="text-xs text-muted-foreground mt-2 text-center"
						>
							+{projects.length - 6} more...
						</p>
					{/if}
				</div>
			{/if}
		</div>
	{/snippet}
	{#snippet footer()}
		<div
			class="flex justify-end px-4 py-3 border-t border-border"
		>
			<Button onclick={handleClose} variant="secondary" size="sm" class="pressable"
				>Close</Button
			>
		</div>
	{/snippet}
</Modal>
