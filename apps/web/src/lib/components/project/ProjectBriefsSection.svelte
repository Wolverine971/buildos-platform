<!-- apps/web/src/lib/components/project/ProjectBriefsSection.svelte -->
<script lang="ts">
	import { CheckCircle2, AlertCircle, FileText, Calendar, LoaderCircle } from 'lucide-svelte';
	import { formatDistanceToNow } from 'date-fns';
	import Button from '$lib/components/ui/Button.svelte';
	import { onMount } from 'svelte';
	import { projectStoreV2 } from '$lib/stores/project.store';

	// Props - only callbacks and configuration (following the standard pattern)
	export let briefsLoaded: boolean = false;
	export let briefsLoading: boolean = false;
	export let briefsError: string | null = null;
	export let onViewBrief: (brief: any) => void;
	export let onRetryLoad: () => void;

	// Get data from store (following the standard pattern)
	$: storeState = $projectStoreV2;
	$: briefs = storeState.briefs || [];
	let timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

	onMount(() => {
		timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	});
</script>

<div class="space-y-6">
	<!-- Loading State -->
	{#if briefsLoading}
		<div class="flex items-center justify-center py-12">
			<div
				class="bg-white dark:bg-gray-800 rounded-xl p-8 shadow-sm border border-gray-200 dark:border-gray-700"
			>
				<LoaderCircle
					class="w-6 h-6 animate-spin text-blue-600 dark:text-blue-400 mx-auto mb-3"
				/>
				<span class="text-gray-600 dark:text-gray-400">Loading daily briefs...</span>
			</div>
		</div>

		<!-- Error State -->
	{:else if briefsError}
		<div class="text-center py-12">
			<div
				class="bg-white dark:bg-gray-800 rounded-xl p-8 shadow-sm border border-gray-200 dark:border-gray-700"
			>
				<AlertCircle class="w-12 h-12 text-red-500 mx-auto mb-4" />
				<p class="text-red-600 dark:text-red-400 mb-4">Failed to load daily briefs</p>
				<Button
					onclick={onRetryLoad}
					variant="ghost"
					size="sm"
					class="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 underline"
				>
					Try again
				</Button>
			</div>
		</div>

		<!-- Empty State -->
	{:else if briefsLoaded && briefs.length === 0}
		<div class="text-center py-12">
			<div
				class="bg-white dark:bg-gray-800 rounded-xl p-8 shadow-sm border border-gray-200 dark:border-gray-700"
			>
				<FileText class="w-12 h-12 text-gray-400 mx-auto mb-4" />
				<h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">
					No Daily Briefs Yet
				</h3>
				<p class="text-gray-500 dark:text-gray-400 mb-4">
					Daily briefs provide AI-generated summaries of your project progress
				</p>
				<p class="text-sm text-gray-400 dark:text-gray-500">
					Briefs are automatically generated based on your project activity
				</p>
			</div>
		</div>

		<!-- Briefs List -->
	{:else if briefsLoaded}
		<div class="grid gap-4">
			{#each briefs as brief}
				<Button
					onclick={() => onViewBrief(brief)}
					variant="ghost"
					btnType="container"
					size="lg"
					class="w-full text-left bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 group"
				>
					<div class="flex items-start justify-between mb-3 w-full">
						<div class="flex items-center space-x-3">
							<Calendar class="w-5 h-5 text-blue-500" />
							<div>
								<h3 class="text-lg font-semibold text-gray-900 dark:text-white">
									{new Date(brief.brief_date).toLocaleDateString('en-US', {
										weekday: 'long',
										year: 'numeric',
										month: 'long',
										day: 'numeric',
										timeZone
									})}
								</h3>
								<p class="text-sm text-gray-500 dark:text-gray-400">
									Generated {formatDistanceToNow(new Date(brief.created_at), {
										addSuffix: true
									})}
								</p>
							</div>
						</div>

						<!-- Status Badge -->
						<div class="flex items-center space-x-2">
							{#if brief.generation_status === 'completed'}
								<span
									class="flex items-center px-2 py-1 text-xs font-medium bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 rounded-full"
								>
									<CheckCircle2 class="w-3 h-3 mr-1" />
									Complete
								</span>
							{:else if brief.generation_status === 'failed'}
								<span
									class="flex items-center px-2 py-1 text-xs font-medium bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded-full"
								>
									<AlertCircle class="w-3 h-3 mr-1" />
									Failed
								</span>
							{:else if brief.generation_status === 'processing' || brief.generation_status === 'pending'}
								<span
									class="flex items-center px-2 py-1 text-xs font-medium bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300 rounded-full"
								>
									<LoaderCircle class="w-3 h-3 mr-1 animate-spin" />
									Processing
								</span>
							{:else}
								<!-- Handle null or unknown status -->
								<span
									class="flex items-center px-2 py-1 text-xs font-medium bg-gray-100 dark:bg-gray-900 text-gray-700 dark:text-gray-300 rounded-full"
								>
									<FileText class="w-3 h-3 mr-1" />
									{brief.generation_status || 'Ready'}
								</span>
							{/if}
						</div>
					</div>

					<!-- Brief Summary -->
					{#if brief.brief_summary}
						<p class="text-gray-600 dark:text-gray-300 mb-4 line-clamp-3">
							{brief.brief_summary}
						</p>
					{/if}

					<!-- Key Highlights -->
					{#if brief.key_highlights && brief.key_highlights.length > 0}
						<div class="mb-4">
							<h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
								Key Highlights
							</h4>
							<div class="space-y-1">
								{#each brief.key_highlights.slice(0, 3) as highlight}
									<div class="flex items-start space-x-2">
										<div
											class="w-1.5 h-1.5 bg-blue-500 rounded-full mt-2 flex-shrink-0"
										></div>
										<p class="text-sm text-gray-600 dark:text-gray-400">
											{highlight}
										</p>
									</div>
								{/each}
								{#if brief.key_highlights.length > 3}
									<p class="text-xs text-gray-500 dark:text-gray-500 pl-3.5">
										+{brief.key_highlights.length - 3} more highlights
									</p>
								{/if}
							</div>
						</div>
					{/if}

					<!-- Metrics -->
					{#if brief.tasks_completed || brief.tasks_added}
						<div
							class="flex items-center space-x-4 text-sm text-gray-500 dark:text-gray-400"
						>
							{#if brief.tasks_completed}
								<span class="flex items-center">
									<CheckCircle2 class="w-4 h-4 mr-1 text-green-500" />
									{brief.tasks_completed} completed
								</span>
							{/if}
							{#if brief.tasks_added}
								<span class="flex items-center">
									<Calendar class="w-4 h-4 mr-1 text-blue-500" />
									{brief.tasks_added} added
								</span>
							{/if}
						</div>
					{/if}
				</Button>
			{/each}
		</div>
	{/if}
</div>

<style>
	.line-clamp-3 {
		display: -webkit-box;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
</style>
