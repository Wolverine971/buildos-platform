<!-- apps/web/src/lib/components/briefs/ProjectBriefModal.svelte -->
<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { ExternalLink, Calendar, Target, CheckCircle, FileText } from 'lucide-svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import type { ProjectDailyBrief } from '$lib/types/daily-brief';
	import { renderMarkdown } from '$lib/utils/markdown';

	export let brief: ProjectDailyBrief | null = null;
	export let isOpen = false;

	const dispatch = createEventDispatcher();

	$: projectId = brief?.projects?.id || brief?.project_id;

	function close() {
		dispatch('close');
	}
</script>

{#if brief}
	<Modal {isOpen} onClose={close} size="xl" customClasses="!p-0">
		<!-- Custom Header -->
		<svelte:fragment slot="header">
			<div
				class="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 sm:p-6 border-b border-gray-200 dark:border-gray-700 space-y-3 sm:space-y-0"
			>
				<div class="flex items-center space-x-3">
					<div class="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg flex-shrink-0">
						<FileText
							class="w-5 h-5 sm:w-6 sm:h-6 text-primary-600 dark:!text-primary-400"
						/>
					</div>
					<div class="flex-1 min-w-0">
						<h2
							class="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900 dark:!text-white truncate"
						>
							{brief.project_name}
						</h2>
						{#if brief.metadata}
							<div
								class="flex flex-wrap items-center gap-2 sm:gap-4 mt-2 text-xs sm:text-sm text-gray-500 dark:!text-gray-400"
							>
								{#if brief.metadata.task_count}
									<span class="flex items-center">
										<Target class="w-4 h-4 mr-1" />
										{brief.metadata.task_count} tasks
									</span>
								{/if}
								{#if brief.metadata.completion_rate !== undefined}
									<span class="flex items-center">
										<CheckCircle class="w-4 h-4 mr-1" />
										{brief.metadata.completion_rate}% complete
									</span>
								{/if}
								{#if brief.metadata.last_updated}
									<span class="flex items-center">
										<Calendar class="w-4 h-4 mr-1" />
										{new Date(brief.metadata.last_updated).toLocaleDateString()}
									</span>
								{/if}
							</div>
						{/if}
					</div>
				</div>

				<div class="flex items-center gap-2 sm:ml-4">
					<a
						href="/projects/{projectId}"
						class="inline-flex items-center px-3 py-2 text-xs sm:text-sm bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors touch-manipulation min-h-[44px]"
					>
						<ExternalLink class="w-4 h-4 mr-1" />
						View Project
					</a>
				</div>
			</div>
		</svelte:fragment>

		<!-- Main Content - Let Modal handle the scrolling -->
		<div class="px-4 sm:px-6">
			<div
				class="prose prose-sm sm:prose-base prose-gray dark:prose-invert max-w-none overflow-x-auto
				prose-headings:text-gray-900 prose-p:text-gray-700 prose-li:text-gray-700
				prose-strong:text-gray-900 prose-a:text-primary-600 prose-blockquote:text-gray-700
				dark:prose-headings:text-white dark:prose-p:text-gray-300 dark:prose-li:text-gray-300
				dark:prose-strong:text-white dark:prose-a:text-primary-400 dark:prose-blockquote:text-gray-300
				dark:prose-hr:border-gray-700"
			>
				{@html renderMarkdown(brief.brief_content)}
			</div>

			{#if brief.metadata?.key_insights && brief.metadata.key_insights.length > 0}
				<div
					class="mt-4 sm:mt-6 p-3 sm:p-4 bg-primary-50 dark:bg-primary-900/20 rounded-lg"
				>
					<h3 class="font-semibold text-primary-900 dark:!text-primary-200 mb-2">
						Key Insights
					</h3>
					<ul class="space-y-1">
						{#each brief.metadata.key_insights as insight}
							<li class="flex items-start text-primary-800 dark:!text-primary-300">
								<span class="mr-2 flex-shrink-0">•</span>
								<span class="text-xs sm:text-sm">{insight}</span>
							</li>
						{/each}
					</ul>
				</div>
			{/if}
		</div>

		<!-- Custom Footer -->
		<svelte:fragment slot="footer">
			<div
				class="flex flex-col sm:flex-row items-center justify-between p-4 sm:p-6 border-t border-gray-200 dark:border-gray-700 space-y-3 sm:space-y-0"
			>
				<div
					class="text-xs sm:text-sm text-gray-500 dark:!text-gray-400 text-center sm:text-left"
				>
					Generated on {new Date(brief.created_at || brief.brief_date).toLocaleString()}
				</div>
				<Button
					type="button"
					on:click={close}
					variant="secondary"
					size="md"
					class="w-full sm:w-auto"
				>
					Close
				</Button>
			</div>
		</svelte:fragment>
	</Modal>
{/if}
