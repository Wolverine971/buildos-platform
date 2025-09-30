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
	class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200/50 dark:border-gray-700/50 p-5 sm:p-6 backdrop-blur-sm hover:shadow-md transition-shadow"
>
	{#if brief}
		<!-- Brief Available - Ultra Compact Mobile View -->
		<div class="space-y-2 sm:space-y-3">
			<!-- Header with icon and time -->
			<div class="flex items-start justify-between">
				<div class="flex items-center flex-1 min-w-0">
					<Calendar
						class="mr-1.5 sm:mr-2 h-4 w-4 sm:h-5 sm:w-5 text-blue-600 flex-shrink-0"
					/>
					<div class="flex-1 min-w-0">
						<h2
							class="text-sm sm:text-base md:text-lg font-semibold text-gray-900 dark:text-white truncate"
						>
							Daily Brief
						</h2>
						<p
							class="text-xs text-gray-500 dark:text-gray-400 flex items-center mt-0.5"
						>
							<Clock class="mr-1 h-3 w-3" />
							{formatTimeOnly(brief.created_at)}
						</p>
					</div>
				</div>

				<!-- Quick stats badges -->
				{#if quickStats && (quickStats.priorities > 0 || quickStats.tasks > 0)}
					<div class="flex items-center gap-2 flex-shrink-0">
						{#if quickStats.priorities > 0}
							<span
								class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200/50 dark:border-gray-700/50"
							>
								{quickStats.priorities} priorities
							</span>
						{/if}
					</div>
				{/if}
			</div>

			<!-- Brief preview with markdown rendering -->
			<div
				class="prose prose-sm dark:prose-invert max-w-none line-clamp-3 leading-relaxed
				prose-headings:text-sm prose-headings:font-semibold prose-headings:text-gray-900 dark:prose-headings:text-white
				prose-p:text-xs sm:prose-p:text-sm prose-p:text-gray-600 dark:prose-p:text-gray-400 prose-p:mb-1
				prose-li:text-xs sm:prose-li:text-sm prose-li:text-gray-600 dark:prose-li:text-gray-400 prose-li:mb-0.5
				prose-strong:text-gray-700 dark:prose-strong:text-gray-300 prose-strong:font-semibold
				prose-ul:mt-1 prose-ul:mb-1 prose-ol:mt-1 prose-ol:mb-1
				prose-blockquote:text-gray-600 dark:prose-blockquote:text-gray-400 prose-blockquote:border-gray-300 dark:prose-blockquote:border-gray-600"
			>
				{@html renderMarkdown(getBriefPreview(brief.summary_content))}
			</div>

			<!-- Action button -->
			<Button
				on:click={openBriefModal}
				variant="outline"
				class="w-full text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-semibold shadow-sm hover:shadow-md transition-all"
			>
				View Full Brief
				<ArrowRight class="ml-1 h-4 w-4" />
			</Button>
		</div>
	{:else}
		<!-- No Brief - Compact Prompt -->
		<div class="space-y-2 sm:space-y-3">
			<!-- Header with Apple-style gradient -->
			<div class="flex items-center">
				<div
					class="p-2 bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/30 dark:to-indigo-900/30 rounded-xl mr-3"
				>
					<Sparkles class="h-5 w-5 text-blue-600 dark:text-blue-400" />
				</div>
				<h2
					class="text-base sm:text-lg font-semibold text-gray-900 dark:text-white tracking-tight"
				>
					Ready to start your day?
				</h2>
			</div>

			<!-- Prompt text with better typography -->
			<p class="text-xs sm:text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
				Generate your AI-powered daily brief with priorities and insights tailored to your
				projects
			</p>

			<!-- Generate button with Apple-style gradient -->
			<Button
				on:click={navigateToBriefs}
				variant="primary"
				class="w-full mt-auto bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold shadow-md hover:shadow-lg transition-all"
				icon={Sparkles}
			>
				Generate Brief
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
