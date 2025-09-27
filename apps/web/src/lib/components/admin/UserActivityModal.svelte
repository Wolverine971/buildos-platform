<!-- src/lib/components/admin/UserActivityModal.svelte -->
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

<Modal {isOpen} onClose={handleClose} size="xl" customClasses="max-h-screen overflow-y-auto">
	<svelte:fragment slot="header">
		<div
			class="flex items-center space-x-3 px-6 py-4 border-b border-gray-200 dark:border-gray-700"
		>
			<div
				class="h-12 w-12 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center"
			>
				<span class="text-lg font-bold text-blue-800 dark:text-blue-200">
					{(user.name || user.email).charAt(0).toUpperCase()}
				</span>
			</div>
			<div>
				<h2 class="text-xl font-bold text-gray-900 dark:text-white">
					{user.name || 'User'} Activity Dashboard
				</h2>
				<p class="text-xs sm:text-sm text-gray-600 dark:text-gray-400">{user.email}</p>
			</div>
		</div>
	</svelte:fragment>

	<div class="px-3 sm:px-4 lg:px-6 py-3 sm:py-4 space-y-8">
		<!-- User Overview Cards -->
		<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
			<!-- Last Visit -->
			<div
				class="bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 rounded-lg p-4"
			>
				<div class="flex items-center justify-between">
					<div>
						<p class="text-xs sm:text-sm font-medium text-blue-600 dark:text-blue-400">
							Last Visit
						</p>
						<p class="text-base sm:text-lg font-bold text-blue-900 dark:text-blue-100">
							{formatLastVisit(user.last_visit)}
						</p>
					</div>
					<Clock class="h-8 w-8 text-blue-600 dark:text-blue-400" />
				</div>
			</div>

			<!-- Onboarding Status -->
			<div
				class="bg-gradient-to-r from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 rounded-lg p-4"
			>
				<div class="flex items-center justify-between">
					<div>
						<p
							class="text-xs sm:text-sm font-medium text-green-600 dark:text-green-400"
						>
							Onboarding
						</p>
						<p
							class="text-base sm:text-lg font-bold text-green-900 dark:text-green-100"
						>
							{user.completed_onboarding ? 'Complete' : 'Incomplete'}
						</p>
					</div>
					{#if user.completed_onboarding}
						<CheckCircle class="h-8 w-8 text-green-600 dark:text-green-400" />
					{:else}
						<XCircle class="h-8 w-8 text-red-600 dark:text-red-400" />
					{/if}
				</div>
			</div>

			<!-- Total Projects -->
			<div
				class="bg-gradient-to-r from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 rounded-lg p-4"
			>
				<div class="flex items-center justify-between">
					<div>
						<p
							class="text-xs sm:text-sm font-medium text-purple-600 dark:text-purple-400"
						>
							Projects
						</p>
						<p
							class="text-base sm:text-lg font-bold text-purple-900 dark:text-purple-100"
						>
							{activityStats.total_projects || 0}
						</p>
					</div>
					<FolderOpen class="h-8 w-8 text-purple-600 dark:text-purple-400" />
				</div>
			</div>

			<!-- Total Tasks -->
			<div
				class="bg-gradient-to-r from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-800/20 rounded-lg p-4"
			>
				<div class="flex items-center justify-between">
					<div>
						<p
							class="text-xs sm:text-sm font-medium text-orange-600 dark:text-orange-400"
						>
							Tasks
						</p>
						<p
							class="text-base sm:text-lg font-bold text-orange-900 dark:text-orange-100"
						>
							{activityStats.total_tasks || 0}
						</p>
					</div>
					<CheckSquare class="h-8 w-8 text-orange-600 dark:text-orange-400" />
				</div>
			</div>
		</div>

		<!-- Activity Stats Grid -->
		<div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 sm:gap-4">
			<div
				class="bg-white dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 p-3 sm:p-4 text-center"
			>
				<div class="flex items-center justify-center mb-2">
					<FileText class="h-6 w-6 text-blue-600" />
				</div>
				<p class="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
					{activityStats.total_briefs || 0}
				</p>
				<p class="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Briefs</p>
			</div>

			<div
				class="bg-white dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 p-3 sm:p-4 text-center"
			>
				<div class="flex items-center justify-center mb-2">
					<Brain class="h-6 w-6 text-purple-600" />
				</div>
				<p class="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
					{activityStats.total_brain_dumps || 0}
				</p>
				<p class="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Brain Dumps</p>
			</div>

			<div
				class="bg-white dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 p-3 sm:p-4 text-center"
			>
				<div class="flex items-center justify-center mb-2">
					<StickyNote class="h-6 w-6 text-green-600" />
				</div>
				<p class="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
					{activityStats.total_notes || 0}
				</p>
				<p class="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Notes</p>
			</div>

			<div
				class="bg-white dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 p-3 sm:p-4 text-center"
			>
				<div class="flex items-center justify-center mb-2">
					<Calendar class="h-6 w-6 text-indigo-600" />
				</div>
				<p class="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
					{activityStats.scheduled_briefs || 0}
				</p>
				<p class="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Scheduled</p>
			</div>

			<div
				class="bg-white dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 p-3 sm:p-4 text-center"
			>
				<div class="flex items-center justify-center mb-2">
					<CheckSquare class="h-6 w-6 text-emerald-600" />
				</div>
				<p class="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
					{activityStats.completed_tasks || 0}
				</p>
				<p class="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Completed</p>
			</div>
		</div>

		<!-- Enhanced Activity Stats with Context Data -->
		{#if userContext?.activity}
			<div
				class="bg-white dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 p-4 sm:p-6"
			>
				<h3
					class="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center"
				>
					<Activity class="mr-2 h-5 w-5 text-green-600" />
					Enhanced Activity Metrics
				</h3>
				<div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
					<div
						class="bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600 p-3 text-center"
					>
						<div class="flex items-center justify-center mb-2">
							<Layers class="h-5 w-5 text-orange-600" />
						</div>
						<p class="text-lg font-bold text-gray-900 dark:text-white">
							{userContext.activity.phases_generated_count || 0}
						</p>
						<p class="text-xs text-gray-600 dark:text-gray-400">Phases Generated</p>
					</div>

					<div
						class="bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600 p-3 text-center"
					>
						<div class="flex items-center justify-center mb-2">
							<StickyNote class="h-5 w-5 text-yellow-600" />
						</div>
						<p class="text-lg font-bold text-gray-900 dark:text-white">
							{userContext.activity.notes_count || 0}
						</p>
						<p class="text-xs text-gray-600 dark:text-gray-400">Notes</p>
					</div>

					<div
						class="bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600 p-3 text-center"
					>
						<div class="flex items-center justify-center mb-2">
							<Calendar
								class="h-5 w-5 text-{userContext.activity.calendar_connected
									? 'green'
									: 'gray'}-600"
							/>
						</div>
						<p class="text-lg font-bold text-gray-900 dark:text-white">
							{userContext.activity.calendar_connected ? 'Yes' : 'No'}
						</p>
						<p class="text-xs text-gray-600 dark:text-gray-400">Calendar</p>
					</div>

					<div
						class="bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600 p-3 text-center"
					>
						<div class="flex items-center justify-center mb-2">
							<CheckSquare class="h-5 w-5 text-blue-600" />
						</div>
						<p class="text-lg font-bold text-gray-900 dark:text-white">
							{userContext.activity.tasks_created || 0}
						</p>
						<p class="text-xs text-gray-600 dark:text-gray-400">Tasks Created</p>
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
				<Button on:click={loadUserContext} variant="outline" size="sm" class="mt-2">
					Retry
				</Button>
			</div>
		{:else if userContext}
			<UserContextPanel {userContext} expanded={true} />
		{/if}

		<!-- Charts Section -->
		<div class="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
			<!-- Project Activity Chart -->
			<div
				class="bg-white dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 p-4 sm:p-6"
			>
				<h3
					class="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center"
				>
					<BarChart3 class="mr-2 h-5 w-5 text-blue-600" />
					Project Activity
				</h3>
				<ProjectActivityChart {projects} />
			</div>

			<!-- Brain Dump Frequency -->
			<div
				class="bg-white dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 p-4 sm:p-6"
			>
				<h3
					class="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center"
				>
					<Brain class="mr-2 h-5 w-5 text-purple-600" />
					Brain Dump Activity
				</h3>
				<BrainDumpChart {brainDumps} />
			</div>
		</div>

		<!-- Activity Timeline -->
		<div
			class="bg-white dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 p-6"
		>
			<h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
				<Activity class="mr-2 h-5 w-5 text-green-600" />
				Recent Activity Timeline
			</h3>
			<ActivityTimelineChart activities={recentActivity} />
		</div>

		<!-- User Context -->
		{#if userContext && Object.keys(userContext).length > 0}
			<div
				class="bg-white dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 p-4 sm:p-6"
			>
				<h3
					class="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center"
				>
					<User class="mr-2 h-5 w-5 text-indigo-600" />
					User Context & Preferences
				</h3>

				<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
					{#if userContext.goals_overview}
						<div>
							<h4
								class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center"
							>
								<Target class="mr-1 h-4 w-4" />
								Goals Overview
							</h4>
							<p
								class="text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-600 p-3 rounded"
							>
								{userContext.goals_overview}
							</p>
						</div>
					{/if}

					{#if userContext.work_style}
						<div>
							<h4
								class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center"
							>
								<Settings class="mr-1 h-4 w-4" />
								Work Style
							</h4>
							<p
								class="text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-600 p-3 rounded"
							>
								{userContext.work_style}
							</p>
						</div>
					{/if}

					{#if userContext.focus_areas}
						<div>
							<h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
								Focus Areas
							</h4>
							<p
								class="text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-600 p-3 rounded"
							>
								{userContext.focus_areas}
							</p>
						</div>
					{/if}

					{#if userContext.active_projects}
						<div>
							<h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
								Active Projects
							</h4>
							<p
								class="text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-600 p-3 rounded"
							>
								{userContext.active_projects}
							</p>
						</div>
					{/if}

					{#if userContext.productivity_challenges}
						<div>
							<h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
								Challenges
							</h4>
							<p
								class="text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-600 p-3 rounded"
							>
								{userContext.productivity_challenges}
							</p>
						</div>
					{/if}

					{#if userContext.preferred_work_hours}
						<div>
							<h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
								Work Hours
							</h4>
							<p
								class="text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-600 p-3 rounded"
							>
								{userContext.preferred_work_hours}
							</p>
						</div>
					{/if}
				</div>

				{#if userContext.onboarding_completed_at}
					<div class="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
						<p class="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
							<CheckCircle class="inline h-4 w-4 text-green-500 mr-1" />
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
				class="bg-white dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 p-4 sm:p-6"
			>
				<h3
					class="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center"
				>
					<FolderOpen class="mr-2 h-5 w-5 text-purple-600" />
					Project Summary ({projects.length} projects)
				</h3>

				<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
					{#each projects.slice(0, 6) as project}
						<div class="border border-gray-200 dark:border-gray-600 rounded-lg p-4">
							<h4 class="font-medium text-gray-900 dark:text-white mb-2">
								{project.name || 'Untitled Project'}
							</h4>
							<div class="space-y-1 text-sm text-gray-600 dark:text-gray-400">
								<p>
									Status: <span class="font-medium"
										>{project.status || 'Unknown'}</span
									>
								</p>
								<p>
									Tasks: <span class="font-medium">{project.task_count || 0}</span
									>
								</p>
								<p>
									Notes: <span class="font-medium"
										>{project.notes_count || 0}</span
									>
								</p>
								<p>Created: {formatDate(project.created_at)}</p>
							</div>
						</div>
					{/each}
				</div>

				{#if projects.length > 6}
					<p class="text-sm text-gray-600 dark:text-gray-400 mt-4 text-center">
						And {projects.length - 6} more projects...
					</p>
				{/if}
			</div>
		{/if}
	</div>

	<svelte:fragment slot="footer">
		<div class="flex justify-end px-6 py-4 border-t border-gray-200 dark:border-gray-700">
			<Button on:click={handleClose} variant="secondary" size="md">Close</Button>
		</div>
	</svelte:fragment>
</Modal>
