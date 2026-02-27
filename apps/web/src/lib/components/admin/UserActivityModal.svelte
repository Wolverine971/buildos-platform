<!-- apps/web/src/lib/components/admin/UserActivityModal.svelte -->
<script lang="ts">
	import { FolderOpen, Activity, BarChart3, RefreshCw } from 'lucide-svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import ProjectActivityChart from './ProjectActivityChart.svelte';
	import ActivityTimelineChart from './ActivityTimelineChart.svelte';
	import UserContextPanel from './UserContextPanel.svelte';
	import { onMount } from 'svelte';
	import { toastService } from '$lib/stores/toast.store';

	let { user, onclose }: { user: any; onclose?: () => void } = $props();

	let userContext = $state<any>(null);
	let contextLoading = $state(true);
	let contextError = $state<string | null>(null);
	let isOpen = $state(true);

	onMount(() => {
		loadUserContext();
	});

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

	function formatLastVisit(dateString: string | null): string {
		if (!dateString) return 'Never';
		const date = new Date(dateString);
		const now = new Date();
		const diffHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
		if (diffHours < 1) return 'Just now';
		if (diffHours < 24) return `${diffHours}h ago`;
		if (diffHours < 24 * 7) return `${Math.floor(diffHours / 24)}d ago`;
		return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}

	let projects = $derived(user.projects || []);
	let recentActivity = $derived(user.recent_activity || []);
	let activityStats = $derived(user.activity_stats || {});
</script>

<Modal {isOpen} onClose={handleClose} size="xl" customClasses="max-h-[95vh] overflow-y-auto">
	{#snippet header()}
		<div class="flex items-center gap-2 px-3 py-2 border-b border-border min-w-0">
			<div
				class="h-8 w-8 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0"
			>
				<span class="text-xs font-bold text-accent">
					{(user.name || user.email).charAt(0).toUpperCase()}
				</span>
			</div>
			<div class="min-w-0 flex-1">
				<h2 class="text-sm font-semibold text-foreground truncate">
					{user.name || 'User'}
				</h2>
				<p class="text-[0.65rem] text-muted-foreground truncate">{user.email}</p>
			</div>
			<!-- Inline status badges -->
			<div class="flex items-center gap-1.5 shrink-0">
				<span
					class="px-1.5 py-0.5 text-[0.6rem] rounded border {user.onboarding_completed_at
						? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
						: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30'}"
				>
					{user.onboarding_completed_at ? 'Onboarded' : 'Pending'}
				</span>
				<span class="text-[0.6rem] text-muted-foreground"
					>{formatLastVisit(user.last_visit)}</span
				>
			</div>
		</div>
	{/snippet}
	{#snippet children()}
		<div class="px-3 py-2 space-y-2">
			<!-- Unified Stats Row - All key metrics in one dense row -->
			<div class="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
				<div class="bg-card rounded border border-border p-1.5 text-center shadow-ink">
					<p class="text-sm font-bold text-foreground">
						{activityStats.total_projects || 0}
					</p>
					<p class="text-[0.55rem] text-muted-foreground uppercase tracking-wide">Proj</p>
				</div>
				<div class="bg-card rounded border border-border p-1.5 text-center shadow-ink">
					<p class="text-sm font-bold text-foreground">
						{activityStats.total_tasks || 0}
					</p>
					<p class="text-[0.55rem] text-muted-foreground uppercase tracking-wide">
						Tasks
					</p>
				</div>
				<div class="bg-card rounded border border-border p-1.5 text-center shadow-ink">
					<p class="text-sm font-bold text-emerald-600 dark:text-emerald-400">
						{activityStats.completed_tasks || 0}
					</p>
					<p class="text-[0.55rem] text-muted-foreground uppercase tracking-wide">Done</p>
				</div>
				<div class="bg-card rounded border border-border p-1.5 text-center shadow-ink">
					<p class="text-sm font-bold text-foreground">
						{activityStats.total_briefs || 0}
					</p>
					<p class="text-[0.55rem] text-muted-foreground uppercase tracking-wide">
						Briefs
					</p>
				</div>
				<div class="bg-card rounded border border-border p-1.5 text-center shadow-ink">
					<p class="text-sm font-bold text-foreground">
						{activityStats.total_agentic_sessions || 0}
					</p>
					<p class="text-[0.55rem] text-muted-foreground uppercase tracking-wide">
						Agent
					</p>
				</div>
				<div class="bg-card rounded border border-border p-1.5 text-center shadow-ink">
					<p class="text-sm font-bold text-foreground">
						{activityStats.total_notes || 0}
					</p>
					<p class="text-[0.55rem] text-muted-foreground uppercase tracking-wide">
						Notes
					</p>
				</div>
				<div class="bg-card rounded border border-border p-1.5 text-center shadow-ink">
					<p class="text-sm font-bold text-foreground">
						{activityStats.scheduled_briefs || 0}
					</p>
					<p class="text-[0.55rem] text-muted-foreground uppercase tracking-wide">
						Sched
					</p>
				</div>
				<div class="bg-card rounded border border-border p-1.5 text-center shadow-ink">
					<p class="text-sm font-bold text-foreground">
						{userContext?.activity?.agentic_messages_count || 0}
					</p>
					<p class="text-[0.55rem] text-muted-foreground uppercase tracking-wide">Msgs</p>
				</div>
			</div>

			<!-- User Context Panel -->
			{#if contextLoading}
				<div
					class="bg-card rounded border border-border p-2 shadow-ink flex items-center justify-center gap-2"
				>
					<RefreshCw class="w-3.5 h-3.5 animate-spin text-accent" />
					<span class="text-xs text-muted-foreground">Loading user data...</span>
				</div>
			{:else if contextError}
				<div
					class="bg-rose-500/5 border border-rose-500/20 rounded p-2 tx tx-static tx-weak flex items-center justify-between gap-2"
				>
					<p class="text-xs text-rose-600 dark:text-rose-400">Error: {contextError}</p>
					<Button
						onclick={loadUserContext}
						variant="outline"
						size="sm"
						class="pressable text-xs px-2 py-1">Retry</Button
					>
				</div>
			{:else if userContext}
				<UserContextPanel {userContext} expanded={true} showActions={true} />
			{/if}

			<!-- Charts Row - Both charts side by side -->
			<div class="grid grid-cols-1 lg:grid-cols-2 gap-1.5">
				<div class="bg-card rounded border border-border p-2 shadow-ink">
					<h3
						class="text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground mb-1.5 flex items-center gap-1"
					>
						<BarChart3 class="h-3 w-3 text-accent flex-shrink-0" />
						Project Activity
					</h3>
					<ProjectActivityChart {projects} />
				</div>
				<div class="bg-card rounded border border-border p-2 shadow-ink">
					<h3
						class="text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground mb-1.5 flex items-center gap-1"
					>
						<Activity class="h-3 w-3 text-emerald-500 flex-shrink-0" />
						Activity Timeline
					</h3>
					<ActivityTimelineChart activities={recentActivity} />
				</div>
			</div>

			<!-- Projects Summary - Compact table-like layout -->
			{#if projects.length > 0}
				<div class="bg-card rounded border border-border shadow-ink overflow-hidden">
					<div
						class="px-2 py-1.5 border-b border-border bg-muted/30 flex items-center justify-between"
					>
						<h3
							class="text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-1"
						>
							<FolderOpen
								class="h-3 w-3 text-purple-600 dark:text-purple-400 flex-shrink-0"
							/>
							Projects
						</h3>
						<span class="text-[0.6rem] text-muted-foreground"
							>{projects.length} total</span
						>
					</div>
					<div class="divide-y divide-border">
						{#each projects.slice(0, 4) as project}
							<div
								class="px-2 py-1.5 flex items-center justify-between gap-2 hover:bg-muted/30 transition-colors"
							>
								<div class="min-w-0 flex-1">
									<p class="text-xs font-medium text-foreground truncate">
										{project.name || 'Untitled'}
									</p>
								</div>
								<div
									class="flex items-center gap-2 text-[0.6rem] text-muted-foreground shrink-0"
								>
									<span class="px-1 py-0.5 rounded bg-muted"
										>{project.status || '—'}</span
									>
									<span>{project.task_count || 0}t</span>
									<span>{project.notes_count || 0}n</span>
								</div>
							</div>
						{/each}
					</div>
					{#if projects.length > 4}
						<div class="px-2 py-1 border-t border-border bg-muted/20 text-center">
							<span class="text-[0.6rem] text-muted-foreground"
								>+{projects.length - 4} more</span
							>
						</div>
					{/if}
				</div>
			{/if}
		</div>
	{/snippet}
	{#snippet footer()}
		<div class="flex justify-end px-3 py-2 border-t border-border">
			<Button onclick={handleClose} variant="secondary" size="sm" class="pressable text-xs"
				>Close</Button
			>
		</div>
	{/snippet}
</Modal>
