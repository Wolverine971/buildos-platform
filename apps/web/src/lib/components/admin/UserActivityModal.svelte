<!-- apps/web/src/lib/components/admin/UserActivityModal.svelte -->
<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import {
		User,
		Calendar,
		FileText,
		FolderOpen,
		CheckSquare,
		StickyNote,
		Brain,
		Clock,
		TrendingUp,
		Activity,
		Target,
		Settings,
		CheckCircle,
		XCircle,
		BarChart3,
		Layers,
		RefreshCw
	} from 'lucide-svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import ProjectActivityChart from './ProjectActivityChart.svelte';
	import BrainDumpChart from './BrainDumpChart.svelte';
	import ActivityTimelineChart from './ActivityTimelineChart.svelte';
	import UserContextPanel from './UserContextPanel.svelte';
	import { onMount } from 'svelte';

	export let user: any;
	let timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	let userContext: any = null;
	let contextLoading = true;
	let contextError: string | null = null;

	onMount(() => {
		timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
		loadUserContext();
	});

	const dispatch = createEventDispatcher();

	let isOpen = true;

	function handleClose() {
		isOpen = false;
		dispatch('close');
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

	$: userContext = user.user_context || {};
	$: projects = user.projects || [];
	$: brainDumps = user.brain_dumps || [];
	$: recentActivity = user.recent_activity || [];
	$: activityStats = user.activity_stats || {};
</script>

<Modal {isOpen} onClose={handleClose} size="xl" customClasses="max-h-[95vh] overflow-y-auto">
	<svelte:fragment slot="header">
		<div
			class="flex items-center gap-3 sm:gap-4 px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 dark:border-gray-700 min-w-0"
		>
			<div
				class="h-10 sm:h-12 w-10 sm:w-12 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center flex-shrink-0"
			>
				<span class="text-base sm:text-lg font-bold text-blue-800 dark:text-blue-200">
					{(user.name || user.email).charAt(0).toUpperCase()}
				</span>
			</div>
			<div class="min-w-0 flex-1">
				<h2 class="text-lg sm:text-xl font-bold text-gray-900 dark:text-white truncate">
					{user.name || 'User'}
				</h2>
				<p class="text-xs text-gray-600 dark:text-gray-400 truncate">{user.email}</p>
			</div>
		</div>
	</svelte:fragment>

	<div class="px-4 sm:px-6 py-4 space-y-3 sm:space-y-4">
		<!-- User Overview Cards -->
		<div class="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
			<!-- Last Visit -->
			<div
				class="bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 rounded-lg p-3 sm:p-4"
			>
				<div class="flex items-start sm:items-center justify-between gap-2">
					<div class="min-w-0 flex-1">
						<p class="text-xs font-medium text-blue-600 dark:text-blue-400 truncate">
							Last Visit
						</p>
						<p
							class="text-sm sm:text-lg font-bold text-blue-900 dark:text-blue-100 line-clamp-1"
						>
							{formatLastVisit(user.last_visit)}
						</p>
					</div>
					<Clock
						class="h-5 w-5 sm:h-8 sm:w-8 text-blue-600 dark:text-blue-400 flex-shrink-0"
					/>
				</div>
			</div>

			<!-- Onboarding Status -->
			<div
				class="bg-gradient-to-r from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 rounded-lg p-3 sm:p-4"
			>
				<div class="flex items-start sm:items-center justify-between gap-2">
					<div class="min-w-0 flex-1">
						<p class="text-xs font-medium text-green-600 dark:text-green-400 truncate">
							Onboarding
						</p>
						<p class="text-sm sm:text-lg font-bold text-green-900 dark:text-green-100">
							{user.completed_onboarding ? 'Done' : 'Pending'}
						</p>
					</div>
					{#if user.completed_onboarding}
						<CheckCircle
							class="h-5 w-5 sm:h-8 sm:w-8 text-green-600 dark:text-green-400 flex-shrink-0"
						/>
					{:else}
						<XCircle
							class="h-5 w-5 sm:h-8 sm:w-8 text-red-600 dark:text-red-400 flex-shrink-0"
						/>
					{/if}
				</div>
			</div>

			<!-- Total Projects -->
			<div
				class="bg-gradient-to-r from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 rounded-lg p-3 sm:p-4"
			>
				<div class="flex items-start sm:items-center justify-between gap-2">
					<div class="min-w-0 flex-1">
						<p
							class="text-xs font-medium text-purple-600 dark:text-purple-400 truncate"
						>
							Projects
						</p>
						<p
							class="text-sm sm:text-lg font-bold text-purple-900 dark:text-purple-100"
						>
							{activityStats.total_projects || 0}
						</p>
					</div>
					<FolderOpen
						class="h-5 w-5 sm:h-8 sm:w-8 text-purple-600 dark:text-purple-400 flex-shrink-0"
					/>
				</div>
			</div>

			<!-- Total Tasks -->
			<div
				class="bg-gradient-to-r from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-800/20 rounded-lg p-3 sm:p-4"
			>
				<div class="flex items-start sm:items-center justify-between gap-2">
					<div class="min-w-0 flex-1">
						<p
							class="text-xs font-medium text-orange-600 dark:text-orange-400 truncate"
						>
							Tasks
						</p>
						<p
							class="text-sm sm:text-lg font-bold text-orange-900 dark:text-orange-100"
						>
							{activityStats.total_tasks || 0}
						</p>
					</div>
					<CheckSquare
						class="h-5 w-5 sm:h-8 sm:w-8 text-orange-600 dark:text-orange-400 flex-shrink-0"
					/>
				</div>
			</div>
		</div>

		<!-- Activity Stats Grid - Compact on Mobile -->
		<div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 sm:gap-4">
			<div
				class="bg-white dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 p-2 sm:p-3 text-center"
			>
				<div class="flex items-center justify-center mb-1">
					<FileText class="h-4 sm:h-6 w-4 sm:w-6 text-blue-600" />
				</div>
				<p class="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">
					{activityStats.total_briefs || 0}
				</p>
				<p class="text-xs text-gray-600 dark:text-gray-400">Briefs</p>
			</div>

			<div
				class="bg-white dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 p-2 sm:p-3 text-center"
			>
				<div class="flex items-center justify-center mb-1">
					<Brain class="h-4 sm:h-6 w-4 sm:w-6 text-purple-600" />
				</div>
				<p class="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">
					{activityStats.total_brain_dumps || 0}
				</p>
				<p class="text-xs text-gray-600 dark:text-gray-400">Dumps</p>
			</div>

			<div
				class="bg-white dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 p-2 sm:p-3 text-center"
			>
				<div class="flex items-center justify-center mb-1">
					<StickyNote class="h-4 sm:h-6 w-4 sm:w-6 text-green-600" />
				</div>
				<p class="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">
					{activityStats.total_notes || 0}
				</p>
				<p class="text-xs text-gray-600 dark:text-gray-400">Notes</p>
			</div>

			<div
				class="bg-white dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 p-2 sm:p-3 text-center"
			>
				<div class="flex items-center justify-center mb-1">
					<Calendar class="h-4 sm:h-6 w-4 sm:w-6 text-indigo-600" />
				</div>
				<p class="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">
					{activityStats.scheduled_briefs || 0}
				</p>
				<p class="text-xs text-gray-600 dark:text-gray-400">Sched</p>
			</div>

			<div
				class="bg-white dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 p-2 sm:p-3 text-center"
			>
				<div class="flex items-center justify-center mb-1">
					<CheckSquare class="h-4 sm:h-6 w-4 sm:w-6 text-emerald-600" />
				</div>
				<p class="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">
					{activityStats.completed_tasks || 0}
				</p>
				<p class="text-xs text-gray-600 dark:text-gray-400">Done</p>
			</div>
		</div>

		<!-- Enhanced Activity Stats with Context Data -->
		{#if userContext?.activity}
			<div
				class="bg-white dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 p-3 sm:p-4"
			>
				<h3
					class="text-base sm:text-lg font-semibold text-gray-900 dark:text-white mb-3 flex items-center"
				>
					<Activity class="mr-2 h-4 sm:h-5 w-4 sm:w-5 text-green-600 flex-shrink-0" />
					Enhanced Activity Metrics
				</h3>
				<div class="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
					<div
						class="bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600 p-2 sm:p-3 text-center"
					>
						<div class="flex items-center justify-center mb-1">
							<Layers class="h-4 sm:h-5 w-4 sm:w-5 text-orange-600" />
						</div>
						<p class="text-base sm:text-lg font-bold text-gray-900 dark:text-white">
							{userContext.activity.phases_generated_count || 0}
						</p>
						<p class="text-xs text-gray-600 dark:text-gray-400">Phases</p>
					</div>

					<div
						class="bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600 p-2 sm:p-3 text-center"
					>
						<div class="flex items-center justify-center mb-1">
							<StickyNote class="h-4 sm:h-5 w-4 sm:w-5 text-yellow-600" />
						</div>
						<p class="text-base sm:text-lg font-bold text-gray-900 dark:text-white">
							{userContext.activity.notes_count || 0}
						</p>
						<p class="text-xs text-gray-600 dark:text-gray-400">Notes</p>
					</div>

					<div
						class="bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600 p-2 sm:p-3 text-center"
					>
						<div class="flex items-center justify-center mb-1">
							<Calendar
								class="h-4 sm:h-5 w-4 sm:w-5 text-{userContext.activity
									.calendar_connected
									? 'green'
									: 'gray'}-600"
							/>
						</div>
						<p class="text-base sm:text-lg font-bold text-gray-900 dark:text-white">
							{userContext.activity.calendar_connected ? 'Yes' : 'No'}
						</p>
						<p class="text-xs text-gray-600 dark:text-gray-400">Cal</p>
					</div>

					<div
						class="bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600 p-2 sm:p-3 text-center"
					>
						<div class="flex items-center justify-center mb-1">
							<CheckSquare class="h-4 sm:h-5 w-4 sm:w-5 text-blue-600" />
						</div>
						<p class="text-base sm:text-lg font-bold text-gray-900 dark:text-white">
							{userContext.activity.tasks_created || 0}
						</p>
						<p class="text-xs text-gray-600 dark:text-gray-400">Tasks</p>
					</div>
				</div>
			</div>
		{/if}

		<!-- Comprehensive User Context Panel -->
		{#if contextLoading}
			<div
				class="bg-white dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 p-6"
			>
				<div class="flex items-center justify-center">
					<RefreshCw class="w-6 h-6 animate-spin text-primary-500 mr-2" />
					<span class="text-gray-600 dark:text-gray-400"
						>Loading comprehensive user data...</span
					>
				</div>
			</div>
		{:else if contextError}
			<div
				class="bg-red-50 border border-red-200 rounded-lg p-4 dark:bg-red-900/20 dark:border-red-800"
			>
				<p class="text-red-800 dark:text-red-200">
					Error loading user context: {contextError}
				</p>
				<Button onclick={loadUserContext} variant="outline" size="sm" class="mt-2">
					Retry
				</Button>
			</div>
		{:else if userContext}
			<UserContextPanel {userContext} expanded={true} />
		{/if}

		<!-- Charts Section -->
		<div class="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
			<!-- Project Activity Chart -->
			<div
				class="bg-white dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 p-3 sm:p-4"
			>
				<h3
					class="text-base sm:text-lg font-semibold text-gray-900 dark:text-white mb-3 flex items-center"
				>
					<BarChart3 class="mr-2 h-4 sm:h-5 w-4 sm:w-5 text-blue-600 flex-shrink-0" />
					Project Activity
				</h3>
				<ProjectActivityChart {projects} />
			</div>

			<!-- Brain Dump Frequency -->
			<div
				class="bg-white dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 p-3 sm:p-4"
			>
				<h3
					class="text-base sm:text-lg font-semibold text-gray-900 dark:text-white mb-3 flex items-center"
				>
					<Brain class="mr-2 h-4 sm:h-5 w-4 sm:w-5 text-purple-600 flex-shrink-0" />
					Brain Dump Activity
				</h3>
				<BrainDumpChart {brainDumps} />
			</div>
		</div>

		<!-- Activity Timeline -->
		<div
			class="bg-white dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 p-3 sm:p-4"
		>
			<h3
				class="text-base sm:text-lg font-semibold text-gray-900 dark:text-white mb-3 flex items-center"
			>
				<Activity class="mr-2 h-4 sm:h-5 w-4 sm:w-5 text-green-600 flex-shrink-0" />
				Recent Activity Timeline
			</h3>
			<ActivityTimelineChart activities={recentActivity} />
		</div>

		<!-- User Context -->
		{#if userContext && Object.keys(userContext).length > 0}
			<div
				class="bg-white dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 p-3 sm:p-4"
			>
				<h3
					class="text-base sm:text-lg font-semibold text-gray-900 dark:text-white mb-3 flex items-center"
				>
					<User class="mr-2 h-4 sm:h-5 w-4 sm:w-5 text-indigo-600 flex-shrink-0" />
					User Context & Preferences
				</h3>

				<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
					{#if userContext.goals_overview}
						<div>
							<h4
								class="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-1"
							>
								<Target class="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
								<span class="truncate">Goals</span>
							</h4>
							<p
								class="text-xs sm:text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-600 p-2 sm:p-3 rounded line-clamp-2"
							>
								{userContext.goals_overview}
							</p>
						</div>
					{/if}

					{#if userContext.work_style}
						<div>
							<h4
								class="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-1"
							>
								<Settings class="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
								<span class="truncate">Work Style</span>
							</h4>
							<p
								class="text-xs sm:text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-600 p-2 sm:p-3 rounded line-clamp-2"
							>
								{userContext.work_style}
							</p>
						</div>
					{/if}

					{#if userContext.focus_areas}
						<div>
							<h4
								class="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 truncate"
							>
								Focus Areas
							</h4>
							<p
								class="text-xs sm:text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-600 p-2 sm:p-3 rounded line-clamp-2"
							>
								{userContext.focus_areas}
							</p>
						</div>
					{/if}

					{#if userContext.active_projects}
						<div>
							<h4
								class="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 truncate"
							>
								Active Projects
							</h4>
							<p
								class="text-xs sm:text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-600 p-2 sm:p-3 rounded line-clamp-2"
							>
								{userContext.active_projects}
							</p>
						</div>
					{/if}

					{#if userContext.productivity_challenges}
						<div>
							<h4
								class="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 truncate"
							>
								Challenges
							</h4>
							<p
								class="text-xs sm:text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-600 p-2 sm:p-3 rounded line-clamp-2"
							>
								{userContext.productivity_challenges}
							</p>
						</div>
					{/if}

					{#if userContext.preferred_work_hours}
						<div>
							<h4
								class="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 truncate"
							>
								Work Hours
							</h4>
							<p
								class="text-xs sm:text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-600 p-2 sm:p-3 rounded line-clamp-2"
							>
								{userContext.preferred_work_hours}
							</p>
						</div>
					{/if}
				</div>

				{#if userContext.onboarding_completed_at}
					<div class="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
						<p class="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
							<CheckCircle class="inline h-3 w-3 sm:h-4 sm:w-4 text-green-500 mr-1" />
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
				class="bg-white dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 p-3 sm:p-4"
			>
				<h3
					class="text-base sm:text-lg font-semibold text-gray-900 dark:text-white mb-3 flex items-center"
				>
					<FolderOpen class="mr-2 h-4 sm:h-5 w-4 sm:w-5 text-purple-600 flex-shrink-0" />
					<span class="truncate">Projects ({projects.length})</span>
				</h3>

				<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
					{#each projects.slice(0, 6) as project}
						<div
							class="border border-gray-200 dark:border-gray-600 rounded-lg p-2 sm:p-3"
						>
							<h4
								class="font-medium text-gray-900 dark:text-white mb-1 text-sm truncate"
							>
								{project.name || 'Untitled'}
							</h4>
							<div
								class="space-y-0.5 text-xs sm:text-sm text-gray-600 dark:text-gray-400"
							>
								<p class="truncate">
									<span class="font-medium">{project.status || 'Unknown'}</span>
								</p>
								<p>
									<span class="font-medium">{project.task_count || 0}</span> tasks
								</p>
								<p>
									<span class="font-medium">{project.notes_count || 0}</span> notes
								</p>
								<p class="text-xs">{formatDate(project.created_at)}</p>
							</div>
						</div>
					{/each}
				</div>

				{#if projects.length > 6}
					<p class="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-3 text-center">
						+{projects.length - 6} more...
					</p>
				{/if}
			</div>
		{/if}
	</div>

	<svelte:fragment slot="footer">
		<div
			class="flex justify-end px-4 sm:px-6 py-3 sm:py-4 border-t border-gray-200 dark:border-gray-700"
		>
			<Button onclick={handleClose} variant="secondary" size="sm" class="text-sm"
				>Close</Button
			>
		</div>
	</svelte:fragment>
</Modal>
