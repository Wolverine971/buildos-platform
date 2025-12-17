<!-- apps/web/src/lib/components/ontology/ProjectBriefsPanel.svelte -->
<!--
	Project Daily Briefs Panel

	Displays a collapsible panel showing recent daily briefs for the project.
	Briefs are expandable to show full content.
	Supports pagination with "Load More" button.

	Collapsed by default - loaded asynchronously when expanded.
-->
<script lang="ts">
	import { FileText, ChevronDown, ChevronRight, Loader2, Calendar } from 'lucide-svelte';

	// ============================================================
	// TYPES
	// ============================================================
	interface ProjectBrief {
		id: string;
		brief_content: string;
		metadata: Record<string, unknown> | null;
		created_at: string;
		brief_date: string | null;
		daily_brief_id: string | null;
		executive_summary: string | null;
		priority_actions: string[] | null;
	}

	interface BriefsResponse {
		briefs: ProjectBrief[];
		total: number;
		hasMore: boolean;
	}

	// ============================================================
	// PROPS
	// ============================================================
	interface Props {
		projectId: string;
	}

	let { projectId }: Props = $props();

	// ============================================================
	// STATE
	// ============================================================
	let isExpanded = $state(false);
	let isLoading = $state(false);
	let isLoadingMore = $state(false);
	let briefs = $state<ProjectBrief[]>([]);
	let total = $state(0);
	let hasMore = $state(false);
	let hasLoaded = $state(false);
	let error = $state<string | null>(null);
	let expandedBriefIds = $state<Set<string>>(new Set());

	const INITIAL_LIMIT = 5;

	// ============================================================
	// FUNCTIONS
	// ============================================================
	async function loadBriefs(offset = 0, append = false) {
		if (!append) {
			isLoading = true;
		} else {
			isLoadingMore = true;
		}
		error = null;

		try {
			const response = await fetch(
				`/api/onto/projects/${projectId}/briefs?limit=${INITIAL_LIMIT}&offset=${offset}`
			);
			const payload = await response.json();

			if (!response.ok) {
				throw new Error(payload?.error || 'Failed to fetch briefs');
			}

			const data = payload.data as BriefsResponse;

			if (append) {
				briefs = [...briefs, ...data.briefs];
			} else {
				briefs = data.briefs;
			}
			total = data.total;
			hasMore = data.hasMore;
			hasLoaded = true;
		} catch (err) {
			console.error('[BriefsPanel] Failed to load:', err);
			error = err instanceof Error ? err.message : 'Failed to load daily briefs';
		} finally {
			isLoading = false;
			isLoadingMore = false;
		}
	}

	function handleToggle() {
		isExpanded = !isExpanded;
		if (isExpanded && !hasLoaded) {
			loadBriefs();
		}
	}

	function handleLoadMore() {
		if (!isLoadingMore && hasMore) {
			loadBriefs(briefs.length, true);
		}
	}

	function toggleBriefExpanded(briefId: string) {
		const newSet = new Set(expandedBriefIds);
		if (newSet.has(briefId)) {
			newSet.delete(briefId);
		} else {
			newSet.add(briefId);
		}
		expandedBriefIds = newSet;
	}

	function formatBriefDate(dateString: string | null): string {
		if (!dateString) return 'Unknown date';
		const date = new Date(dateString);
		return date.toLocaleDateString(undefined, {
			weekday: 'long',
			month: 'long',
			day: 'numeric',
			year: 'numeric'
		});
	}

	function formatRelativeDate(dateString: string | null): string {
		if (!dateString) return '';
		const date = new Date(dateString);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

		if (diffDays === 0) return 'Today';
		if (diffDays === 1) return 'Yesterday';
		if (diffDays < 7) return `${diffDays} days ago`;
		if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
		return `${Math.floor(diffDays / 30)} months ago`;
	}

	function truncateContent(content: string, maxLength = 150): string {
		if (content.length <= maxLength) return content;
		return content.slice(0, maxLength).trim() + '...';
	}
</script>

<div
	class="bg-card/60 border border-border rounded-xl shadow-ink tx tx-frame tx-weak overflow-hidden"
>
	<button
		onclick={handleToggle}
		class="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/60 transition-colors"
	>
		<div class="flex items-start gap-3">
			<div class="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
				<FileText class="w-4 h-4 text-foreground" />
			</div>
			<div class="min-w-0">
				<p class="text-sm font-semibold text-foreground">Daily Briefs</p>
				<p class="text-xs text-muted-foreground">
					{#if hasLoaded}
						{total} {total === 1 ? 'brief' : 'briefs'}
					{:else}
						AI-generated summaries
					{/if}
				</p>
			</div>
		</div>
		<ChevronDown
			class="w-4 h-4 text-muted-foreground transition-transform {isExpanded
				? 'rotate-180'
				: ''}"
		/>
	</button>

	{#if isExpanded}
		<div class="border-t border-border">
			{#if isLoading}
				<div class="flex items-center justify-center py-8">
					<Loader2 class="w-5 h-5 text-muted-foreground animate-spin" />
				</div>
			{:else if error}
				<div class="px-4 py-3 text-sm text-red-500">
					{error}
				</div>
			{:else if briefs.length === 0}
				<p class="px-4 py-3 text-sm text-muted-foreground">No daily briefs generated yet</p>
			{:else}
				<div class="divide-y divide-border/80">
					{#each briefs as brief}
						{@const isBriefExpanded = expandedBriefIds.has(brief.id)}
						<div class="group">
							<!-- Brief header - always visible -->
							<button
								onclick={() => toggleBriefExpanded(brief.id)}
								class="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-muted/60 transition-colors"
							>
								<span class="shrink-0 mt-0.5 text-muted-foreground">
									{#if isBriefExpanded}
										<ChevronDown class="w-4 h-4" />
									{:else}
										<ChevronRight class="w-4 h-4" />
									{/if}
								</span>
								<div class="flex-1 min-w-0">
									<div class="flex items-center gap-2 mb-1">
										<Calendar class="w-3.5 h-3.5 text-muted-foreground" />
										<span class="text-sm font-medium text-foreground">
											{formatBriefDate(brief.brief_date)}
										</span>
										<span class="text-xs text-muted-foreground">
											{formatRelativeDate(brief.brief_date)}
										</span>
									</div>
									{#if !isBriefExpanded}
										<p class="text-xs text-muted-foreground line-clamp-2">
											{truncateContent(brief.brief_content)}
										</p>
									{/if}
								</div>
							</button>

							<!-- Expanded content -->
							{#if isBriefExpanded}
								<div class="px-4 pb-4 pt-0 pl-11">
									<!-- Brief content -->
									<div class="prose prose-sm dark:prose-invert max-w-none">
										<div class="text-sm text-foreground whitespace-pre-wrap">
											{brief.brief_content}
										</div>
									</div>

									<!-- Priority actions if available -->
									{#if brief.priority_actions && brief.priority_actions.length > 0}
										<div class="mt-3 pt-3 border-t border-border/50">
											<p
												class="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2"
											>
												Priority Actions
											</p>
											<ul class="space-y-1">
												{#each brief.priority_actions as action}
													<li
														class="text-sm text-foreground flex items-start gap-2"
													>
														<span class="text-accent shrink-0">•</span>
														<span>{action}</span>
													</li>
												{/each}
											</ul>
										</div>
									{/if}

									<!-- Executive summary if available -->
									{#if brief.executive_summary}
										<div class="mt-3 pt-3 border-t border-border/50">
											<p
												class="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2"
											>
												Daily Summary
											</p>
											<p class="text-sm text-muted-foreground">
												{brief.executive_summary}
											</p>
										</div>
									{/if}
								</div>
							{/if}
						</div>
					{/each}
				</div>

				<!-- Load More -->
				{#if hasMore}
					<div class="px-4 py-2 border-t border-border">
						<button
							onclick={handleLoadMore}
							disabled={isLoadingMore}
							class="w-full text-xs text-muted-foreground hover:text-foreground py-1.5 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
						>
							{#if isLoadingMore}
								<Loader2 class="w-3 h-3 animate-spin" />
								Loading...
							{:else}
								Load more ({total - briefs.length} remaining)
							{/if}
						</button>
					</div>
				{/if}
			{/if}
		</div>
	{/if}
</div>
