<!-- apps/web/src/lib/components/project/ProjectBriefCard.svelte -->
<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { Calendar, FileText, ExternalLink, Eye, AlertTriangle } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import CardHeader from '$lib/components/ui/CardHeader.svelte';
	import CardBody from '$lib/components/ui/CardBody.svelte';
	import { formatRelativeTime, formatTimeOnly } from '$lib/utils/date-utils';
	import { goto } from '$app/navigation';

	export let brief: any;

	const dispatch = createEventDispatcher();

	// Simple date formatting
	function formatDate(dateString: string): string {
		return formatRelativeTime(dateString);
	}

	function truncateContent(content: string, maxLength: number = 200): string {
		if (!content) return '';
		return content.length <= maxLength ? content : content.substring(0, maxLength) + '...';
	}

	function handleViewBrief() {
		dispatch('viewBrief', brief);
	}

	async function goToProject() {
		if (brief.projects?.id) {
			await goto(`/projects/${brief.projects.id}`);
		}
	}

	// Check if brief generation failed or is in progress
	$: isGenerating = brief.generation_status === 'processing';
	$: hasFailed = brief.generation_status === 'failed';
	$: isCompleted = brief.generation_status === 'completed';
</script>

<Card variant="default">
	<!-- Header -->
	<CardHeader variant="default">
		<div class="flex items-start justify-between">
			<div class="flex-1 min-w-0">
				<div class="flex items-center space-x-2 mb-1">
					<h3 class="text-lg font-semibold text-gray-900 dark:text-white truncate">
						{brief.project_name || brief.projects?.name || 'Unknown Project'}
					</h3>
					{#if brief.projects?.slug}
						<Button
							type="button"
							onclick={goToProject}
							variant="ghost"
							size="sm"
							class="p-1 text-gray-400 hover:text-primary-600 dark:hover:text-primary-400"
							title="Go to project"
						>
							<ExternalLink class="w-4 h-4" />
						</Button>
					{/if}
				</div>

				<div class="flex items-center text-sm text-gray-600 dark:text-gray-400 space-x-3">
					<div class="flex items-center">
						<Calendar class="w-4 h-4 mr-1" />
						{formatDate(brief.brief_date)}
					</div>

					{#if brief.created_at}
						<div class="flex items-center">
							<FileText class="w-4 h-4 mr-1" />
							{formatTimeOnly(brief.created_at)}
						</div>
					{/if}

					<!-- Generation status indicator -->
					{#if isGenerating}
						<div class="flex items-center text-yellow-600 dark:text-yellow-400">
							<div
								class="w-2 h-2 bg-yellow-500 rounded-full mr-1 animate-pulse"
							></div>
							Generating...
						</div>
					{:else if hasFailed}
						<div class="flex items-center text-red-600 dark:text-red-400">
							<AlertTriangle class="w-4 h-4 mr-1" />
							Failed
						</div>
					{/if}
				</div>
			</div>

			<!-- Action button -->
			<div class="flex items-center ml-4 flex-shrink-0">
				{#if isCompleted && brief.brief_content}
					<Button
						type="button"
						onclick={handleViewBrief}
						variant="ghost"
						size="sm"
						title="View brief"
					>
						<Eye class="w-4 h-4" />
					</Button>
				{/if}
			</div>
		</div>
	</CardHeader>

	<!-- Content -->
	<CardBody padding="md">
		{#if isGenerating}
			<div class="flex items-center justify-center py-8 text-gray-500 dark:text-gray-400">
				<div
					class="w-6 h-6 animate-spin rounded-full border-2 border-gray-300 border-t-primary-600 mr-3"
				></div>
				<span>Generating daily brief...</span>
			</div>
		{:else if hasFailed}
			<div class="text-center py-8">
				<AlertTriangle class="w-8 h-8 text-red-500 mx-auto mb-2" />
				<p class="text-red-600 dark:text-red-400 text-sm">Brief generation failed</p>
				{#if brief.generation_error}
					<p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
						{brief.generation_error}
					</p>
				{/if}
			</div>
		{:else if brief.brief_content}
			<!-- Brief content preview -->
			<div class="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">
				{truncateContent(brief.brief_content)}
			</div>

			{#if brief.brief_content.length > 200}
				<Button
					type="button"
					onclick={handleViewBrief}
					variant="ghost"
					size="sm"
					class="mt-3 text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
				>
					Read full brief →
				</Button>
			{/if}

			<!-- Metadata in collapsed view -->
			{#if brief.metadata}
				<div
					class="mt-3 flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400"
				>
					{#if brief.metadata.task_count}
						<span
							class="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full"
						>
							{brief.metadata.task_count} tasks
						</span>
					{/if}

					{#if brief.metadata.completion_rate !== undefined}
						<span
							class="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full"
						>
							{brief.metadata.completion_rate}% complete
						</span>
					{/if}

					{#if brief.metadata.priority_level}
						<span
							class="px-2 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded-full"
						>
							{brief.metadata.priority_level} priority
						</span>
					{/if}
				</div>
			{/if}
		{:else}
			<div class="text-center py-8 text-gray-500 dark:text-gray-400">
				<FileText class="w-8 h-8 mx-auto mb-2" />
				<p class="text-sm">No content available</p>
			</div>
		{/if}
	</CardBody>
</Card>
