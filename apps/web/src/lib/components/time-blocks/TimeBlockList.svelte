<!-- apps/web/src/lib/components/time-blocks/TimeBlockList.svelte -->
<script lang="ts">
	import type { TimeBlockSuggestion, TimeBlockWithProject } from '@buildos/shared-types';
	import { resolveBlockAccentColor } from '$lib/utils/time-block-colors';

	let {
		blocks = [],
		regeneratingIds = [],
		ondelete,
		onregenerate
	}: {
		blocks?: TimeBlockWithProject[];
		regeneratingIds?: string[];
		ondelete?: (payload: { blockId: string }) => void;
		onregenerate?: (payload: { blockId: string }) => void;
	} = $props();

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
			ondelete?.({ blockId });
		}
	}

	function handleRegenerate(blockId: string) {
		if (isRegenerating(blockId)) return;
		onregenerate?.({ blockId });
	}
</script>

{#if blocks.length === 0}
	<div
		class="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted px-6 py-8 text-center text-muted-foreground shadow-ink-inner"
	>
		<p class="text-sm font-medium">No time blocks yet</p>
		<p class="max-w-xs text-xs text-muted-foreground">Create a focus session above</p>
	</div>
{:else}
	<div class="flex flex-col gap-2.5">
		{#each blocks as block (block.id)}
			<article
				class="group relative overflow-hidden rounded-lg border border-border bg-card px-3 py-3 shadow-ink transition hover:-translate-y-[1px] hover:border-info/30 hover:shadow-ink-strong tx tx-frame tx-weak sm:px-4 sm:py-4"
				style="content-visibility: auto; contain-intrinsic-size: 0 180px;"
			>
				<div
					class="absolute inset-y-2.5 left-2 w-[2px] rounded-full opacity-90 transition group-hover:scale-y-105"
					style={`background: ${resolveBlockAccentColor(block)}`}
				></div>
				<div class="ml-4 flex flex-col gap-2.5 sm:gap-3">
					<div class="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
						<div class="space-y-1.5">
							<div class="flex flex-wrap items-center gap-1.5">
								<h3 class="text-sm font-semibold text-foreground">
									{blockTitle(block)}
								</h3>
								<span
									class="rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground shadow-ink"
								>
									{blockTypeLabel(block)}
								</span>
								<span
									class="rounded-full bg-info/10 px-2 py-0.5 text-xs font-medium text-info shadow-ink"
								>
									{block.duration_minutes}m
								</span>
							</div>
							<p class="text-xs text-foreground">
								{formatRange(block)}
							</p>
							{#if block.suggestions_summary}
								<p class="text-xs text-foreground">
									{block.suggestions_summary}
								</p>
							{/if}
							{#if formattedSuggestionsTimestamp(block)}
								<p class="text-xs text-muted-foreground">
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
									class="inline-flex items-center justify-center rounded-md border border-info/30 bg-info/10 px-3 py-1.5 text-xs font-medium text-info transition hover:bg-info/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								>
									View
								</a>
							{/if}
							<div class="flex flex-wrap items-center gap-1.5">
								<button
									type="button"
									class="inline-flex items-center justify-center rounded-md border border-info/30 bg-info/10 px-3 py-1.5 text-xs font-medium text-info transition hover:bg-info/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
									onclick={() => handleRegenerate(block.id)}
									disabled={isRegenerating(block.id)}
								>
									{#if isRegenerating(block.id)}
										<span
											class="mr-1.5 h-3 w-3 animate-spin rounded-full border-2 border-info border-t-transparent"
										></span>
										Refreshing
									{:else}
										Regenerate
									{/if}
								</button>
								<button
									type="button"
									class="inline-flex items-center justify-center rounded-md border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive transition hover:bg-destructive/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
									onclick={() => handleDelete(block.id)}
								>
									Delete
								</button>
							</div>
						</div>
					</div>

					<div
						class="rounded-lg border border-border/80 bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground"
					>
						{#if getSuggestions(block).length > 0}
							<div class="space-y-2">
								<p class="text-xs font-semibold text-foreground">
									Focus suggestions
								</p>
								<ul class="space-y-2">
									{#each getSuggestions(block) as suggestion, index (block.id + ':' + index)}
										<li class="space-y-0.5">
											<div
												class="flex flex-wrap items-center gap-1.5 text-xs font-medium text-foreground"
											>
												<span>{index + 1}. {suggestion.title}</span>
												{#if suggestionMeta(block, suggestion)}
													<span
														class="rounded-full bg-card/70 px-1.5 py-0.5 text-xs font-medium text-muted-foreground shadow-ink/60 dark:text-muted-foreground"
													>
														{suggestionMeta(block, suggestion)}
													</span>
												{/if}
											</div>
											<p class="text-xs text-foreground">
												{suggestion.reason}
											</p>
										</li>
									{/each}
								</ul>
							</div>
						{:else}
							<div class="space-y-0.5 text-xs text-foreground">
								<p>No AI suggestions yet</p>
								<p class="text-xs text-muted-foreground">
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
