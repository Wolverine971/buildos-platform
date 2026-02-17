<!-- apps/web/src/lib/components/briefs/ProjectBriefModal.svelte -->
<!--
	Project Daily Brief Modal

	Displays a full daily brief for a project in a modal dialog.
	Uses the standard Modal component with Inkprint design tokens.

	Props:
	- brief: ProjectDailyBrief | null - The brief to display
	- isOpen: boolean - Controls visibility
	- onClose: () => void - Close callback
-->
<script lang="ts">
	import { ExternalLink, Calendar, Target, CircleCheck } from 'lucide-svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import type { ProjectDailyBrief } from '$lib/types/daily-brief';
	import { renderMarkdown } from '$lib/utils/markdown';

	interface Props {
		brief: ProjectDailyBrief | null;
		isOpen?: boolean;
		projectName?: string;
		onClose?: () => void;
	}

	let {
		brief,
		isOpen = $bindable(false),
		projectName = 'Daily Brief',
		onClose
	}: Props = $props();

	const projectId = $derived(brief?.projects?.id || brief?.project_id);
	const displayName = $derived(brief?.projects?.name || projectName);
</script>

{#if brief}
	<Modal {isOpen} {onClose} title={displayName} size="xl">
		{#snippet children()}
			<div class="px-3 sm:px-4 py-3 sm:py-4 space-y-3 sm:space-y-4">
				<!-- Metadata Bar -->
				{#if brief.metadata}
					<div
						class="flex flex-wrap items-center gap-2 sm:gap-3 text-[10px] sm:text-xs text-muted-foreground"
					>
						{#if brief.metadata.task_count}
							<span class="flex items-center gap-1">
								<Target class="w-3 h-3 sm:w-3.5 sm:h-3.5" />
								{brief.metadata.task_count} tasks
							</span>
						{/if}
						{#if brief.metadata.completion_rate !== undefined}
							<span class="flex items-center gap-1">
								<CircleCheck class="w-3 h-3 sm:w-3.5 sm:h-3.5" />
								{brief.metadata.completion_rate}% complete
							</span>
						{/if}
						{#if brief.metadata.last_updated}
							<span class="flex items-center gap-1">
								<Calendar class="w-3 h-3 sm:w-3.5 sm:h-3.5" />
								{new Date(brief.metadata.last_updated).toLocaleDateString()}
							</span>
						{/if}
					</div>
				{/if}

				<!-- Brief Content -->
				<div
					class="prose prose-sm max-w-none overflow-x-auto
						prose-headings:text-foreground prose-p:text-foreground prose-li:text-foreground
						prose-strong:text-foreground prose-a:text-accent prose-blockquote:text-muted-foreground
						prose-hr:border-border"
				>
					<!-- eslint-disable-next-line svelte/no-at-html-tags -->
					{@html renderMarkdown(brief.brief_content)}
				</div>

				<!-- Key Insights -->
				{#if brief.metadata?.key_insights && brief.metadata.key_insights.length > 0}
					<div
						class="p-3 sm:p-4 bg-accent/5 border border-accent/20 rounded-lg tx tx-bloom tx-weak"
					>
						<h3 class="text-xs sm:text-sm font-semibold text-foreground mb-2">
							Key Insights
						</h3>
						<ul class="space-y-1">
							{#each brief.metadata.key_insights as insight}
								<li
									class="flex items-start gap-1.5 text-xs sm:text-sm text-muted-foreground"
								>
									<span class="shrink-0 mt-0.5 text-accent">&#8226;</span>
									<span>{insight}</span>
								</li>
							{/each}
						</ul>
					</div>
				{/if}
			</div>
		{/snippet}

		{#snippet footer()}
			<div
				class="flex items-center justify-between gap-2 px-3 sm:px-4 py-2 sm:py-3 border-t border-border"
			>
				<p class="text-[10px] sm:text-xs text-muted-foreground truncate">
					Generated {new Date(brief.created_at || brief.brief_date).toLocaleDateString(
						undefined,
						{ month: 'short', day: 'numeric', year: 'numeric' }
					)}
				</p>
				{#if projectId}
					<a
						href="/projects/{projectId}"
						class="inline-flex items-center gap-1 px-2.5 py-1.5 text-[10px] sm:text-xs font-medium rounded-md bg-accent text-accent-foreground hover:bg-accent/90 transition-colors pressable shrink-0"
					>
						<ExternalLink class="w-3 h-3 sm:w-3.5 sm:h-3.5" />
						View Project
					</a>
				{/if}
			</div>
		{/snippet}
	</Modal>
{/if}
