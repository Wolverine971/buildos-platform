<!-- apps/web/src/lib/components/time-blocks/TimeBlockList.svelte -->
<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import type { TimeBlockSuggestion, TimeBlockWithProject } from '@buildos/shared-types';
	import { resolveBlockAccentColor } from '$lib/utils/time-block-colors';

	let {
		blocks = [],
		regeneratingIds = []
	}: {
		blocks?: TimeBlockWithProject[];
		regeneratingIds?: string[];
	} = $props();

	const dispatch = createEventDispatcher<{
		delete: { blockId: string };
		regenerate: { blockId: string };
	}>();

	const formatter = new Intl.DateTimeFormat(undefined, {
		weekday: 'short',
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit'
	});

	const generatedFormatter = new Intl.DateTimeFormat(undefined, {
		dateStyle: 'medium',
		timeStyle: 'short'
	});

	function formatRange(block: TimeBlockWithProject) {
		const start = new Date(block.start_time);
		const end = new Date(block.end_time);
		return `${formatter.format(start)} – ${formatter.format(end)}`;
	}

	function blockTitle(block: TimeBlockWithProject): string {
		return block.block_type === 'project'
			? (block.project?.name ?? 'Project Block')
			: 'Build Block';
	}

	function blockTypeLabel(block: TimeBlockWithProject): string {
		return block.block_type === 'project' ? 'Project block' : 'Build block';
	}

	function getSuggestions(block: TimeBlockWithProject): TimeBlockSuggestion[] {
		return Array.isArray(block.ai_suggestions) ? block.ai_suggestions : [];
	}

	function formattedSuggestionsTimestamp(block: TimeBlockWithProject): string | null {
		if (!block.suggestions_generated_at) return null;
		const timestamp = new Date(block.suggestions_generated_at);
		if (Number.isNaN(timestamp.getTime())) return null;
		return generatedFormatter.format(timestamp);
	}

	function isRegenerating(blockId: string): boolean {
		return regeneratingIds.includes(blockId);
	}

	function suggestionMeta(
		block: TimeBlockWithProject,
		suggestion: TimeBlockSuggestion
	): string | null {
		const parts: string[] = [];

		if (block.block_type === 'build' && suggestion.project_name) {
			parts.push(suggestion.project_name);
		}

		if (suggestion.estimated_minutes) {
			parts.push(`${suggestion.estimated_minutes} min`);
		}

		if (suggestion.priority) {
			parts.push(suggestion.priority.toUpperCase());
		}

		return parts.length > 0 ? parts.join(' · ') : null;
	}

	function handleDelete(blockId: string) {
		if (confirm('Delete this time block?')) {
			dispatch('delete', { blockId });
		}
	}

	function handleRegenerate(blockId: string) {
		if (isRegenerating(blockId)) return;
		dispatch('regenerate', { blockId });
	}
</script>

{#if blocks.length === 0}
	<div
		class="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300/60 bg-white/70 px-6 py-8 text-center text-slate-600 backdrop-blur-sm dark:border-slate-700/60 dark:bg-slate-900/40 dark:text-slate-300"
	>
		<p class="text-sm font-medium">No time blocks yet</p>
		<p class="max-w-xs text-xs text-slate-500 dark:text-slate-400">
			Create a focus session above
		</p>
	</div>
{:else}
	<div class="flex flex-col gap-2.5">
		{#each blocks as block (block.id)}
			<article
				class="group relative overflow-hidden rounded-lg border border-slate-200/70 bg-white/80 px-3 py-3 shadow-sm shadow-slate-200/50 transition hover:-translate-y-[1px] hover:border-blue-200/80 hover:shadow-md hover:shadow-blue-200/40 dark:border-slate-800/70 dark:bg-slate-900/60 dark:shadow-black/20 sm:px-4 sm:py-4"
			>
				<div
					class="absolute inset-y-2.5 left-2 w-[2px] rounded-full opacity-90 transition group-hover:scale-y-105"
					style={`background: ${resolveBlockAccentColor(block)}`}
				></div>
				<div class="ml-4 flex flex-col gap-2.5 sm:gap-3">
					<div class="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
						<div class="space-y-1.5">
							<div class="flex flex-wrap items-center gap-1.5">
								<h3 class="text-sm font-semibold text-slate-900 dark:text-slate-50">
									{blockTitle(block)}
								</h3>
								<span
									class="rounded-full border border-slate-200/80 bg-slate-100/70 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300"
								>
									{blockTypeLabel(block)}
								</span>
								<span
									class="rounded-full bg-blue-100/80 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-500/20 dark:text-blue-200"
								>
									{block.duration_minutes}m
								</span>
							</div>
							<p class="text-xs text-slate-600 dark:text-slate-300">
								{formatRange(block)}
							</p>
							{#if block.suggestions_summary}
								<p class="text-xs text-slate-600 dark:text-slate-300">
									{block.suggestions_summary}
								</p>
							{/if}
							{#if formattedSuggestionsTimestamp(block)}
								<p class="text-xs text-slate-400 dark:text-slate-500">
									Updated {formattedSuggestionsTimestamp(block)}
								</p>
							{/if}
						</div>

						<div class="flex flex-col items-start gap-1.5 md:items-end">
							{#if block.calendar_event_link}
								<a
									href={block.calendar_event_link}
									target="_blank"
									rel="noreferrer"
									class="inline-flex items-center justify-center rounded-md border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-xs font-medium text-blue-600 transition hover:bg-blue-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 dark:border-blue-400/40 dark:bg-blue-400/10 dark:text-blue-200 dark:hover:bg-blue-400/20"
								>
									View
								</a>
							{/if}
							<div class="flex flex-wrap items-center gap-1.5">
								<button
									type="button"
									class="inline-flex items-center justify-center rounded-md border border-blue-400/40 bg-blue-500/10 px-3 py-1.5 text-xs font-medium text-blue-600 transition hover:bg-blue-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:cursor-not-allowed disabled:opacity-50 dark:border-blue-500/40 dark:bg-blue-500/20 dark:text-blue-100 dark:hover:bg-blue-500/30"
									onclick={() => handleRegenerate(block.id)}
									disabled={isRegenerating(block.id)}
								>
									{#if isRegenerating(block.id)}
										<span
											class="mr-1.5 h-3 w-3 animate-spin rounded-full border-2 border-blue-400 border-t-transparent"
										></span>
										Refreshing
									{:else}
										Regenerate
									{/if}
								</button>
								<button
									type="button"
									class="inline-flex items-center justify-center rounded-md border border-rose-400/40 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-600 transition hover:bg-rose-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/40 dark:border-rose-400/40 dark:bg-rose-400/10 dark:text-rose-200 dark:hover:bg-rose-400/20"
									onclick={() => handleDelete(block.id)}
								>
									Delete
								</button>
							</div>
						</div>
					</div>

					<div
						class="rounded-lg border border-slate-200/80 bg-slate-50/80 px-3 py-2.5 text-xs shadow-sm dark:border-slate-700/70 dark:bg-slate-900/40 dark:text-slate-200"
					>
						{#if getSuggestions(block).length > 0}
							<div class="space-y-2">
								<p class="text-xs font-semibold text-slate-800 dark:text-slate-100">
									Focus suggestions
								</p>
								<ul class="space-y-2">
									{#each getSuggestions(block) as suggestion, index (block.id + ':' + index)}
										<li class="space-y-0.5">
											<div
												class="flex flex-wrap items-center gap-1.5 text-xs font-medium text-slate-800 dark:text-slate-100"
											>
												<span>{index + 1}. {suggestion.title}</span>
												{#if suggestionMeta(block, suggestion)}
													<span
														class="rounded-full bg-white/70 px-1.5 py-0.5 text-xs font-medium text-slate-600 shadow-sm dark:bg-slate-800/60 dark:text-slate-300"
													>
														{suggestionMeta(block, suggestion)}
													</span>
												{/if}
											</div>
											<p class="text-xs text-slate-600 dark:text-slate-300">
												{suggestion.reason}
											</p>
										</li>
									{/each}
								</ul>
							</div>
						{:else}
							<div class="space-y-0.5 text-xs text-slate-600 dark:text-slate-300">
								<p>No AI suggestions yet</p>
								<p class="text-xs text-slate-500 dark:text-slate-400">
									Click Regenerate to get ideas
								</p>
							</div>
						{/if}
					</div>
				</div>
			</article>
		{/each}
	</div>
{/if}
