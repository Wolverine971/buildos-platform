<!-- src/lib/components/analytics/BriefAnalyticsDashboard.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import {
		TrendingUp,
		Calendar,
		Target,
		FolderOpen,
		Clock,
		Zap,
		BarChart3,
		PieChart,
		Activity,
		Award,
		BookOpen,
		CheckCircle,
		AlertTriangle
	} from 'lucide-svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import type { BriefAnalytics } from '$lib/types/daily-brief';

	let analytics: BriefAnalytics | null = null;
	let isLoading = true;
	let selectedTimeframe: 'week' | 'month' | 'quarter' = 'month';
	let error: string | null = null;

	onMount(() => {
		loadAnalytics();
	});

	$: if (selectedTimeframe) {
		loadAnalytics();
	}

	async function loadAnalytics() {
		isLoading = true;
		error = null;

		try {
			const response = await fetch(`/api/analytics/briefs?timeframe=${selectedTimeframe}`);

			if (!response.ok) {
				throw new Error('Failed to load analytics');
			}

			analytics = await response.json();
		} catch (err) {
			console.error('Error loading analytics:', err);
			error = err instanceof Error ? err.message : 'Failed to load analytics';
		} finally {
			isLoading = false;
		}
	}

	function getStreakColor(streakDays: number): string {
		if (streakDays >= 30) return 'text-green-600 dark:text-green-400';
		if (streakDays >= 14) return 'text-blue-600 dark:text-blue-400';
		if (streakDays >= 7) return 'text-yellow-600 dark:text-yellow-400';
		return 'text-gray-600 dark:text-gray-400';
	}

	function getStreakBg(streakDays: number): string {
		if (streakDays >= 30) return 'bg-green-100 dark:bg-green-900/20';
		if (streakDays >= 14) return 'bg-blue-100 dark:bg-blue-900/20';
		if (streakDays >= 7) return 'bg-yellow-100 dark:bg-yellow-900/20';
		return 'bg-gray-100 dark:bg-gray-800';
	}

	function formatNumber(num: number): string {
		return new Intl.NumberFormat().format(num);
	}

	function getProgressBarWidth(value: number, max: number): number {
		return Math.min((value / Math.max(max, 1)) * 100, 100);
	}

	// Achievement checks
	function getAchievements(analytics: BriefAnalytics) {
		const achievements = [];

		if (analytics.generation_frequency.streak_days >= 7) {
			achievements.push({
				id: 'week_streak',
				title: 'Week Warrior',
				description: '7+ day streak',
				icon: Zap,
				color: 'yellow'
			});
		}

		if (analytics.generation_frequency.streak_days >= 30) {
			achievements.push({
				id: 'month_streak',
				title: 'Monthly Master',
				description: '30+ day streak',
				icon: Calendar,
				color: 'green'
			});
		}

		if (analytics.generation_frequency.total_briefs >= 100) {
			achievements.push({
				id: 'century_club',
				title: 'Century Club',
				description: '100+ total briefs',
				icon: Award,
				color: 'purple'
			});
		}

		if (analytics.template_usage.custom_template_count > 0) {
			achievements.push({
				id: 'template_creator',
				title: 'Template Creator',
				description: 'Created custom templates',
				icon: BookOpen,
				color: 'blue'
			});
		}

		return achievements;
	}

	$: achievements = analytics ? getAchievements(analytics) : [];
</script>

<div class="space-y-6">
	<!-- Compact Header -->
	<div
		class="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700"
	>
		<div class="flex items-center justify-between">
			<div class="flex items-center">
				<BarChart3 class="mr-3 h-6 w-6 text-blue-600 dark:text-blue-400" />
				<div>
					<h2 class="text-xl font-bold text-gray-900 dark:text-white">Analytics</h2>
					<p class="text-sm text-gray-600 dark:text-gray-400">
						Track your brief generation patterns
					</p>
				</div>
			</div>

			<!-- Compact Timeframe Selector -->
			<FormField label="Timeframe" labelFor="timeframe-select" class="mb-0">
				<Select
					bind:value={selectedTimeframe}
					on:change={(e) => (selectedTimeframe = e.detail)}
					size="md"
					placeholder="Select timeframe"
					id="timeframe-select"
					class="text-sm font-medium"
				>
					<option value="week">Week</option>
					<option value="month">Month</option>
					<option value="quarter">Quarter</option>
				</Select>
			</FormField>
		</div>
	</div>

	{#if error}
		<div
			class="bg-red-50 border border-red-200 rounded-lg p-4 dark:bg-red-900/20 dark:border-red-800"
		>
			<div class="flex items-center">
				<AlertTriangle class="h-4 w-4 text-red-600 dark:text-red-400 mr-2 flex-shrink-0" />
				<p class="text-sm text-red-800 dark:text-red-200 font-medium">{error}</p>
			</div>
		</div>
	{/if}

	{#if isLoading}
		<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
			{#each Array(8) as _}
				<div
					class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 animate-pulse border border-gray-200 dark:border-gray-700"
				>
					<div class="h-3 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2"></div>
					<div class="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/2 mb-2"></div>
					<div class="h-2 bg-gray-200 dark:bg-gray-700 rounded w-2/3"></div>
				</div>
			{/each}
		</div>
	{:else if analytics}
		<!-- Compact Key Metrics Grid -->
		<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
			<!-- Total Briefs -->
			<div
				class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 border border-gray-200 dark:border-gray-700"
			>
				<div class="flex items-center justify-between mb-2">
					<div class="bg-blue-100 dark:bg-blue-900/20 rounded-lg p-2">
						<Calendar class="h-4 w-4 text-blue-600 dark:text-blue-400" />
					</div>
					<div class="text-right">
						<p class="text-xl font-bold text-gray-900 dark:text-white">
							{formatNumber(analytics.generation_frequency.total_briefs)}
						</p>
						<p class="text-xs text-gray-600 dark:text-gray-400">Total Briefs</p>
					</div>
				</div>
				<div class="flex items-center text-xs">
					<span class="text-green-600 dark:text-green-400 font-medium">
						+{analytics.generation_frequency.briefs_this_month}
					</span>
					<span class="text-gray-500 dark:text-gray-400 ml-1">this month</span>
				</div>
			</div>

			<!-- Current Streak -->
			<div
				class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 border border-gray-200 dark:border-gray-700"
			>
				<div class="flex items-center justify-between mb-2">
					<div
						class="{getStreakBg(
							analytics.generation_frequency.streak_days
						)} rounded-lg p-2"
					>
						<Zap
							class="h-4 w-4 {getStreakColor(
								analytics.generation_frequency.streak_days
							)}"
						/>
					</div>
					<div class="text-right">
						<p
							class="text-xl font-bold {getStreakColor(
								analytics.generation_frequency.streak_days
							)}"
						>
							{analytics.generation_frequency.streak_days}
						</p>
						<p class="text-xs text-gray-600 dark:text-gray-400">Day Streak</p>
					</div>
				</div>
				<div class="text-xs text-gray-500 dark:text-gray-400">
					{analytics.generation_frequency.streak_days > 0 ? 'Keep it up!' : 'Start today'}
				</div>
			</div>

			<!-- Average Length -->
			<div
				class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 border border-gray-200 dark:border-gray-700"
			>
				<div class="flex items-center justify-between mb-2">
					<div class="bg-green-100 dark:bg-green-900/20 rounded-lg p-2">
						<Activity class="h-4 w-4 text-green-600 dark:text-green-400" />
					</div>
					<div class="text-right">
						<p class="text-xl font-bold text-gray-900 dark:text-white">
							{Math.round(analytics.engagement_metrics.avg_brief_length)}
						</p>
						<p class="text-xs text-gray-600 dark:text-gray-400">Avg Words</p>
					</div>
				</div>
				<div class="text-xs text-gray-500 dark:text-gray-400">per brief</div>
			</div>

			<!-- Priority Actions -->
			<div
				class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 border border-gray-200 dark:border-gray-700"
			>
				<div class="flex items-center justify-between mb-2">
					<div class="bg-purple-100 dark:bg-purple-900/20 rounded-lg p-2">
						<Target class="h-4 w-4 text-purple-600 dark:text-purple-400" />
					</div>
					<div class="text-right">
						<p class="text-xl font-bold text-gray-900 dark:text-white">
							{Math.round(analytics.engagement_metrics.avg_priority_actions)}
						</p>
						<p class="text-xs text-gray-600 dark:text-gray-400">Priority Actions</p>
					</div>
				</div>
				<div class="text-xs text-gray-500 dark:text-gray-400">average per brief</div>
			</div>
		</div>

		<!-- Compact Charts Section -->
		<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
			<!-- Most Active Projects -->
			<div
				class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 border border-gray-200 dark:border-gray-700"
			>
				<h3
					class="text-base font-semibold text-gray-900 dark:text-white mb-4 flex items-center"
				>
					<FolderOpen class="mr-2 h-4 w-4 text-blue-600 dark:text-blue-400" />
					Most Active Projects
				</h3>

				{#if analytics.engagement_metrics.most_active_projects?.length}
					<div class="space-y-3">
						{#each analytics.engagement_metrics.most_active_projects.slice(0, 5) as project, index}
							<div class="flex items-center space-x-3">
								<div
									class="flex-shrink-0 w-6 h-6 bg-blue-100 dark:bg-blue-900/20 rounded-full flex items-center justify-center"
								>
									<span
										class="text-xs font-semibold text-blue-600 dark:text-blue-400"
									>
										{index + 1}
									</span>
								</div>
								<div class="flex-1 min-w-0">
									<p
										class="text-sm font-medium text-gray-900 dark:text-white truncate"
									>
										{project.project_name}
									</p>
									<div
										class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 mt-1"
									>
										<div
											class="bg-blue-600 h-1.5 rounded-full transition-all duration-500"
											style="width: {getProgressBarWidth(
												project.brief_count,
												analytics.engagement_metrics.most_active_projects[0]
													.brief_count
											)}%"
										></div>
									</div>
								</div>
								<span
									class="text-xs font-semibold text-gray-900 dark:text-white bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded flex-shrink-0"
								>
									{project.brief_count}
								</span>
							</div>
						{/each}
					</div>
				{:else}
					<div class="text-center py-6">
						<FolderOpen class="h-8 w-8 text-gray-400 mx-auto mb-2" />
						<p class="text-sm text-gray-500 dark:text-gray-400">
							No project data available
						</p>
					</div>
				{/if}
			</div>

			<!-- Most Active Goals -->
			<div
				class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 border border-gray-200 dark:border-gray-700"
			>
				<h3
					class="text-base font-semibold text-gray-900 dark:text-white mb-4 flex items-center"
				>
					<Target class="mr-2 h-4 w-4 text-purple-600 dark:text-purple-400" />
					Most Active Goals
				</h3>

				{#if analytics.engagement_metrics?.most_active_goals?.length}
					<div class="space-y-3">
						{#each analytics.engagement_metrics.most_active_goals.slice(0, 5) as goal, index}
							<div class="flex items-center space-x-3">
								<div
									class="flex-shrink-0 w-6 h-6 bg-purple-100 dark:bg-purple-900/20 rounded-full flex items-center justify-center"
								>
									<span
										class="text-xs font-semibold text-purple-600 dark:text-purple-400"
									>
										{index + 1}
									</span>
								</div>
								<div class="flex-1 min-w-0">
									<p
										class="text-sm font-medium text-gray-900 dark:text-white truncate"
									>
										{goal.goal_name}
									</p>
									<div
										class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 mt-1"
									>
										<div
											class="bg-purple-600 h-1.5 rounded-full transition-all duration-500"
											style="width: {getProgressBarWidth(
												goal.brief_count,
												analytics.engagement_metrics.most_active_goals[0]
													.brief_count
											)}%"
										></div>
									</div>
								</div>
								<span
									class="text-xs font-semibold text-gray-900 dark:text-white bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded flex-shrink-0"
								>
									{goal.brief_count}
								</span>
							</div>
						{/each}
					</div>
				{:else}
					<div class="text-center py-6">
						<Target class="h-8 w-8 text-gray-400 mx-auto mb-2" />
						<p class="text-sm text-gray-500 dark:text-gray-400">
							No goal data available
						</p>
					</div>
				{/if}
			</div>
		</div>

		<!-- Compact Stats Grid -->
		<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
			<!-- Template Usage -->
			<div
				class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 border border-gray-200 dark:border-gray-700"
			>
				<h3
					class="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center"
				>
					<PieChart class="mr-2 h-4 w-4 text-green-600 dark:text-green-400" />
					Template Usage
				</h3>

				<div class="space-y-2">
					<div
						class="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700/50 rounded"
					>
						<span class="text-xs font-medium text-gray-700 dark:text-gray-300"
							>Project</span
						>
						<span
							class="text-xs font-semibold text-gray-900 dark:text-white truncate ml-2"
						>
							{analytics.template_usage.most_used_project_template || 'Default'}
						</span>
					</div>
					<div
						class="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700/50 rounded"
					>
						<span class="text-xs font-medium text-gray-700 dark:text-gray-300"
							>Goal</span
						>
						<span
							class="text-xs font-semibold text-gray-900 dark:text-white truncate ml-2"
						>
							{analytics.template_usage.most_used_goal_template || 'Default'}
						</span>
					</div>
					<div
						class="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700/50 rounded"
					>
						<span class="text-xs font-medium text-gray-700 dark:text-gray-300"
							>Custom</span
						>
						<span class="text-xs font-semibold text-gray-900 dark:text-white">
							{analytics.template_usage.custom_template_count}
						</span>
					</div>
				</div>
			</div>

			<!-- Weekly Activity -->
			<div
				class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 border border-gray-200 dark:border-gray-700"
			>
				<h3
					class="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center"
				>
					<Clock class="mr-2 h-4 w-4 text-orange-600 dark:text-orange-400" />
					Weekly Activity
				</h3>

				<div class="space-y-3">
					<div class="flex items-center justify-between">
						<span class="text-xs font-medium text-gray-700 dark:text-gray-300"
							>This Week</span
						>
						<span class="text-sm font-bold text-gray-900 dark:text-white">
							{analytics.generation_frequency.briefs_this_week}
						</span>
					</div>
					<div class="flex items-center justify-between">
						<span class="text-xs font-medium text-gray-700 dark:text-gray-300"
							>Daily Avg</span
						>
						<span class="text-sm font-bold text-gray-900 dark:text-white">
							{Math.round(
								(analytics.generation_frequency.briefs_this_week / 7) * 10
							) / 10}
						</span>
					</div>
					<div class="mt-3">
						<div class="flex items-center space-x-1">
							{#each Array(7) as _, i}
								<div
									class="flex-1 h-3 rounded-sm transition-colors {i <
									analytics.generation_frequency.briefs_this_week
										? 'bg-orange-500'
										: 'bg-gray-200 dark:bg-gray-700'}"
									title="Day {i + 1}"
								></div>
							{/each}
						</div>
					</div>
				</div>
			</div>

			<!-- Achievements -->
			<div
				class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 border border-gray-200 dark:border-gray-700"
			>
				<h3
					class="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center"
				>
					<Award class="mr-2 h-4 w-4 text-yellow-600 dark:text-yellow-400" />
					Achievements
				</h3>

				<div class="space-y-2">
					{#if achievements?.length}
						{#each achievements as achievement}
							<div
								class="flex items-center space-x-2 p-2 bg-gray-50 dark:bg-gray-700/50 rounded"
							>
								<div
									class="w-6 h-6 bg-{achievement.color}-100 dark:bg-{achievement.color}-900/20 rounded-full flex items-center justify-center flex-shrink-0"
								>
									<svelte:component
										this={achievement.icon}
										class="w-3 h-3 text-{achievement.color}-600 dark:text-{achievement.color}-400"
									/>
								</div>
								<div class="min-w-0">
									<p class="text-xs font-medium text-gray-900 dark:text-white">
										{achievement.title}
									</p>
									<p class="text-xs text-gray-600 dark:text-gray-400">
										{achievement.description}
									</p>
								</div>
							</div>
						{/each}
					{:else}
						<div class="text-center py-3">
							<Award class="h-6 w-6 text-gray-400 mx-auto mb-1" />
							<p class="text-xs text-gray-500 dark:text-gray-400">
								Start generating briefs!
							</p>
						</div>
					{/if}
				</div>
			</div>
		</div>

		<!-- Compact Insights Section -->
		<div
			class="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/10 dark:to-indigo-900/10 rounded-lg p-4 border border-blue-200 dark:border-blue-800/50"
		>
			<h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
				<TrendingUp class="mr-2 h-5 w-5 text-blue-600 dark:text-blue-400" />
				Insights & Recommendations
			</h3>

			<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
				<div>
					<h4
						class="font-medium text-gray-800 dark:text-gray-200 mb-2 flex items-center text-sm"
					>
						<CheckCircle class="w-4 h-4 mr-1.5 text-green-600 dark:text-green-400" />
						Highlights
					</h4>
					<ul class="space-y-1.5">
						{#if analytics.generation_frequency.streak_days > 0}
							<li class="flex items-start space-x-2">
								<div
									class="w-1 h-1 bg-green-500 rounded-full mt-1.5 flex-shrink-0"
								></div>
								<span class="text-xs text-gray-700 dark:text-gray-300">
									{analytics.generation_frequency.streak_days}-day streak! 🔥
								</span>
							</li>
						{/if}
						{#if analytics.engagement_metrics.avg_priority_actions > 3}
							<li class="flex items-start space-x-2">
								<div
									class="w-1 h-1 bg-purple-500 rounded-full mt-1.5 flex-shrink-0"
								></div>
								<span class="text-xs text-gray-700 dark:text-gray-300">
									High action generation ({Math.round(
										analytics.engagement_metrics.avg_priority_actions
									)} per brief) 🎯
								</span>
							</li>
						{/if}
						{#if analytics.engagement_metrics.most_active_projects?.length}
							<li class="flex items-start space-x-2">
								<div
									class="w-1 h-1 bg-blue-500 rounded-full mt-1.5 flex-shrink-0"
								></div>
								<span class="text-xs text-gray-700 dark:text-gray-300">
									Most active: {analytics.engagement_metrics
										.most_active_projects[0].project_name} 🚀
								</span>
							</li>
						{/if}
					</ul>
				</div>

				<div>
					<h4
						class="font-medium text-gray-800 dark:text-gray-200 mb-2 flex items-center text-sm"
					>
						<Target class="w-4 h-4 mr-1.5 text-blue-600 dark:text-blue-400" />
						Suggestions
					</h4>
					<ul class="space-y-1.5">
						{#if analytics.generation_frequency.briefs_this_week < 5}
							<li class="flex items-start space-x-2">
								<div
									class="w-1 h-1 bg-orange-500 rounded-full mt-1.5 flex-shrink-0"
								></div>
								<span class="text-xs text-gray-700 dark:text-gray-300">
									Try more consistent daily generation ⏰
								</span>
							</li>
						{/if}
						{#if analytics.template_usage.custom_template_count === 0}
							<li class="flex items-start space-x-2">
								<div
									class="w-1 h-1 bg-indigo-500 rounded-full mt-1.5 flex-shrink-0"
								></div>
								<span class="text-xs text-gray-700 dark:text-gray-300">
									Create custom templates ✨
								</span>
							</li>
						{/if}
						{#if analytics.engagement_metrics.avg_brief_length < 200}
							<li class="flex items-start space-x-2">
								<div
									class="w-1 h-1 bg-green-500 rounded-full mt-1.5 flex-shrink-0"
								></div>
								<span class="text-xs text-gray-700 dark:text-gray-300">
									Add more context for richer briefs 📝
								</span>
							</li>
						{/if}
					</ul>
				</div>
			</div>
		</div>
	{:else}
		<div class="text-center py-12">
			<div
				class="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md mx-auto border border-gray-200 dark:border-gray-700"
			>
				<BarChart3 class="h-12 w-12 text-gray-400 mx-auto mb-3" />
				<h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">
					No Analytics Data
				</h3>
				<p class="text-sm text-gray-600 dark:text-gray-400">
					Generate some daily briefs to see your analytics.
				</p>
			</div>
		</div>
	{/if}
</div>
