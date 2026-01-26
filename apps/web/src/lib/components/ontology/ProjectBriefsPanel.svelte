<!-- apps/web/src/lib/components/ontology/ProjectBriefsPanel.svelte -->
<!--
	Project Daily Briefs Panel

	Displays a collapsible panel showing recent daily briefs for the project.
	Briefs are expandable to show full content.
	Supports pagination with "Load More" button.

	Collapsed by default - loaded asynchronously when expanded.
-->
<script lang="ts">
	import { slide } from 'svelte/transition';
	import {
		FileText,
		ChevronDown,
		LoaderCircle,
		Calendar,
		Sparkles,
		ExternalLink
	} from 'lucide-svelte';
	import { renderMarkdown } from '$lib/utils/markdown';
	import ProjectBriefModal from '$lib/components/briefs/ProjectBriefModal.svelte';
	import type { ProjectDailyBrief } from '$lib/types/daily-brief';
	import { logOntologyClientError } from '$lib/utils/ontology-client-logger';

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
		projectName?: string;
	}

	let { projectId, projectName = 'Project' }: Props = $props();

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

	// Modal state
	let isModalOpen = $state(false);
	let selectedBrief = $state<ProjectDailyBrief | null>(null);

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
			void logOntologyClientError(err, {
				endpoint: `/api/onto/projects/${projectId}/briefs`,
				method: 'GET',
				projectId,
				entityType: 'project',
				operation: 'project_briefs_load',
				metadata: { offset, limit: INITIAL_LIMIT }
			});
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

	function openBriefModal(brief: ProjectBrief) {
		// Convert to ProjectDailyBrief format for the modal
		selectedBrief = {
			id: brief.id,
			user_id: '', // Not needed for display
			project_id: projectId,
			brief_content: brief.brief_content,
			brief_date: brief.brief_date || brief.created_at,
			metadata: brief.metadata as ProjectDailyBrief['metadata'],
			created_at: brief.created_at,
			project_name: projectName
		} as ProjectDailyBrief & { project_name: string };
		isModalOpen = true;
	}

	function closeBriefModal() {
		isModalOpen = false;
		selectedBrief = null;
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
	class="bg-card border border-border rounded-lg sm:rounded-xl shadow-ink tx tx-frame tx-weak overflow-hidden"
>
	<button
		onclick={handleToggle}
		class="w-full flex items-center justify-between gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-3 text-left hover:bg-muted transition-colors pressable"
	>
		<div class="flex items-center gap-2 sm:gap-3">
			<div
				class="w-7 h-7 sm:w-9 sm:h-9 rounded-md sm:rounded-lg bg-accent/10 flex items-center justify-center"
			>
				<FileText class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-accent" />
			</div>
			<div class="min-w-0">
				<p class="text-xs sm:text-sm font-semibold text-foreground">Daily Briefs</p>
				<p class="text-[10px] sm:text-xs text-muted-foreground">
					{#if hasLoaded}
						{total} {total === 1 ? 'brief' : 'briefs'}
					{:else}
						AI-generated summaries
					{/if}
				</p>
			</div>
		</div>
		<ChevronDown
			class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground transition-transform duration-[120ms] {isExpanded
				? 'rotate-180'
				: ''}"
		/>
	</button>

	{#if isExpanded}
		<div class="border-t border-border" transition:slide={{ duration: 120 }}>
			{#if isLoading}
				<div class="flex items-center justify-center py-4 sm:py-6">
					<LoaderCircle
						class="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground animate-spin"
					/>
				</div>
			{:else if error}
				<div
					class="px-3 sm:px-4 py-3 text-xs sm:text-sm text-destructive tx tx-static tx-weak"
				>
					{error}
				</div>
			{:else if briefs.length === 0}
				<div class="px-3 sm:px-4 py-3 sm:py-4 text-center tx tx-bloom tx-weak">
					<div
						class="w-8 h-8 sm:w-10 sm:h-10 rounded-md sm:rounded-lg bg-muted flex items-center justify-center mx-auto mb-2"
					>
						<Sparkles class="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground" />
					</div>
					<p class="text-xs sm:text-sm text-muted-foreground">No daily briefs yet</p>
					<p
						class="text-[10px] sm:text-xs text-muted-foreground/70 mt-0.5 hidden sm:block"
					>
						Briefs are generated automatically
					</p>
				</div>
			{:else}
				<div class="divide-y divide-border/80">
					{#each briefs as brief}
						<button
							onclick={() => openBriefModal(brief)}
							class="group w-full flex items-start gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-3 text-left hover:bg-accent/5 transition-colors pressable"
						>
							<div class="flex-1 min-w-0">
								<div class="flex items-center gap-1.5 sm:gap-2 mb-1 sm:mb-1.5">
									<Calendar
										class="w-3 h-3 sm:w-3.5 sm:h-3.5 text-muted-foreground"
									/>
									<span
										class="text-xs sm:text-sm font-medium text-foreground truncate"
									>
										{formatBriefDate(brief.brief_date)}
									</span>
									<span
										class="text-[10px] sm:text-xs text-muted-foreground hidden sm:inline"
									>
										{formatRelativeDate(brief.brief_date)}
									</span>
								</div>
								<!-- Preview as markdown (limited to 2 lines) -->
								<div
									class="text-[10px] sm:text-xs text-muted-foreground line-clamp-2 prose prose-xs prose-neutral dark:prose-invert max-w-none [&_*]:!text-muted-foreground [&_*]:!m-0 [&_*]:!p-0 [&_p]:!leading-snug hidden sm:block"
								>
									<!-- eslint-disable-next-line svelte/no-at-html-tags -->
									{@html renderMarkdown(
										truncateContent(brief.brief_content, 200)
									)}
								</div>
							</div>
							<!-- Open indicator -->
							<ExternalLink
								class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5 sm:mt-1"
							/>
						</button>
					{/each}
				</div>

				<!-- Load More -->
				{#if hasMore}
					<div class="px-3 sm:px-4 py-2 border-t border-border">
						<button
							onclick={handleLoadMore}
							disabled={isLoadingMore}
							class="w-full text-[10px] sm:text-xs text-muted-foreground hover:text-accent py-1.5 sm:py-2 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5 sm:gap-2 rounded-md hover:bg-accent/5 pressable"
						>
							{#if isLoadingMore}
								<LoaderCircle class="w-3 h-3 animate-spin" />
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

<!-- Brief Modal -->
<ProjectBriefModal brief={selectedBrief} isOpen={isModalOpen} on:close={closeBriefModal} />
