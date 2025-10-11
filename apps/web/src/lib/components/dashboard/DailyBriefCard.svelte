<!-- apps/web/src/lib/components/dashboard/DailyBriefCard.svelte -->
<script lang="ts">
	import { Calendar, Sparkles, ArrowRight, Clock, CheckCircle } from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import { createEventDispatcher } from 'svelte';
	import type { DailyBrief } from '$lib/types/daily-brief';
	import Button from '$lib/components/ui/Button.svelte';
	import { formatTimeOnly } from '$lib/utils/date-utils';
	import { renderMarkdown, getMarkdownPreview } from '$lib/utils/markdown';

	export let brief: DailyBrief | null = null;

	const dispatch = createEventDispatcher();

	function navigateToBriefs() {
		goto('/briefs');
	}

	function openBriefModal() {
		if (brief) {
			dispatch('openBrief', { brief });
		}
	}

	function getBriefPreview(content: string): string {
		// Extract first few meaningful lines, preserving markdown for rendering
		const lines = content.split('\n').filter((line) => line.trim() && !line.startsWith('# '));
		if (lines.length > 0) {
			// Take first 3-4 lines for preview, preserving markdown
			const previewLines = lines.slice(0, 4);
			const preview = previewLines.join('\n');
			// Return markdown content for rendering
			return preview;
		}
		return 'Your daily brief is ready';
	}

	function getBriefPlainPreview(content: string): string {
		// Get plain text preview for fallback
		return getMarkdownPreview(content, 200);
	}

	function getPriorityCount(content: string): number {
		const priorityMatch = content.match(/### 🎯 Top Priorities Today\s*\n((?:- .+\n?)+)/);
		if (priorityMatch) {
			return priorityMatch[1].split('\n').filter((line) => line.trim().startsWith('-'))
				.length;
		}
		return 0;
	}

	// Extract quick stats from brief content
	function getQuickStats(brief: DailyBrief | null) {
		if (!brief) return null;

		const priorityCount =
			brief.priority_actions?.length || getPriorityCount(brief.summary_content);

		// Try to extract task count from content
		const taskMatch = brief.summary_content.match(/(\d+)\s+task/i);
		const taskCount = taskMatch ? parseInt(taskMatch[1]) : 0;

		return {
			priorities: priorityCount,
			tasks: taskCount
		};
	}

	$: quickStats = getQuickStats(brief);
</script>

<div
	class="bg-white dark:bg-gray-800 rounded-xl sm:rounded-2xl shadow-sm border border-gray-200/50 dark:border-gray-700/50 p-4 sm:p-5 md:p-6 backdrop-blur-sm hover:shadow-md transition-all"
>
	{#if brief}
		<!-- Brief Available - Clean Mobile-First Design -->
		<div class="space-y-3 sm:space-y-4">
			<!-- Header - Simplified for mobile -->
			<div class="flex items-start justify-between gap-2">
				<div class="flex items-start flex-1 min-w-0">
					<div
						class="p-1.5 sm:p-2 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg sm:rounded-xl mr-2 sm:mr-3 flex-shrink-0"
					>
						<Calendar
							class="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 dark:text-blue-400"
						/>
					</div>
					<div class="flex-1 min-w-0">
						<h2
							class="text-base sm:text-lg font-semibold text-gray-900 dark:text-white tracking-tight"
						>
							Daily Brief
						</h2>
						<p
							class="text-xs sm:text-sm text-gray-500 dark:text-gray-400 flex items-center mt-0.5 sm:mt-1"
						>
							<Clock class="mr-1 h-3 w-3 flex-shrink-0" />
							<span>{formatTimeOnly(brief.created_at)}</span>
						</p>
					</div>
				</div>

				<!-- Quick stats badge - more compact -->
				{#if quickStats && quickStats.priorities > 0}
					<span
						class="inline-flex items-center px-2 py-1 rounded-full text-[10px] sm:text-xs font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-100 dark:border-blue-800/50 whitespace-nowrap"
					>
						{quickStats.priorities}
						<span class="hidden sm:inline ml-1">priorities</span>
					</span>
				{/if}
			</div>

			<!-- Brief preview - optimized typography for mobile -->
			<div
				class="prose prose-sm dark:prose-invert max-w-none line-clamp-3 leading-relaxed
				prose-headings:text-sm prose-headings:font-semibold prose-headings:text-gray-900 dark:prose-headings:text-white prose-headings:tracking-tight
				prose-p:text-xs sm:prose-p:text-sm prose-p:text-gray-700 dark:prose-p:text-gray-300 prose-p:mb-1 prose-p:leading-relaxed
				prose-li:text-xs sm:prose-li:text-sm prose-li:text-gray-700 dark:prose-li:text-gray-300 prose-li:mb-0.5
				prose-strong:text-gray-900 dark:prose-strong:text-white prose-strong:font-semibold
				prose-ul:mt-1 prose-ul:mb-1 prose-ul:space-y-0.5 prose-ol:mt-1 prose-ol:mb-1
				prose-blockquote:text-gray-600 dark:prose-blockquote:text-gray-400 prose-blockquote:border-gray-300 dark:prose-blockquote:border-gray-600"
			>
				{@html renderMarkdown(getBriefPreview(brief.summary_content))}
			</div>

			<!-- Action button - Apple-like styling -->
			<Button
				on:click={openBriefModal}
				variant="outline"
				class="w-full text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-semibold border-blue-200 dark:border-blue-800 hover:bg-blue-50 dark:hover:bg-blue-900/20 shadow-sm hover:shadow transition-all"
			>
				<span class="text-sm">View Full Brief</span>
				<ArrowRight class="ml-1.5 h-4 w-4" />
			</Button>
		</div>
	{:else}
		<!-- No Brief - Clean Prompt with Apple Aesthetics -->
		<div class="space-y-3 sm:space-y-4">
			<!-- Header with refined gradient -->
			<div class="flex items-start">
				<div
					class="p-2 sm:p-2.5 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl mr-3 flex-shrink-0"
				>
					<Sparkles class="h-5 w-5 sm:h-6 sm:w-6 text-blue-600 dark:text-blue-400" />
				</div>
				<div>
					<h2
						class="text-base sm:text-lg font-semibold text-gray-900 dark:text-white tracking-tight leading-tight"
					>
						Ready to start your day?
					</h2>
					<p class="text-xs sm:text-sm text-gray-600 dark:text-gray-400 leading-relaxed mt-1">
						Generate your AI-powered daily brief with priorities and insights
					</p>
				</div>
			</div>

			<!-- Generate button - refined Apple styling -->
			<Button
				on:click={navigateToBriefs}
				variant="primary"
				class="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold shadow-md hover:shadow-lg transition-all"
				icon={Sparkles}
			>
				<span class="text-sm">Generate Brief</span>
			</Button>
		</div>
	{/if}
</div>

<style>
	.line-clamp-3 {
		display: -webkit-box;
		-webkit-line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
		word-break: break-word;
	}
</style>
