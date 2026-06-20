<!-- apps/web/src/lib/components/agent/BrainDumpContextPanel.svelte -->
<script lang="ts">
	import { ExternalLink, FileText, LoaderCircle, Tag } from 'lucide-svelte';
	import type { AgentBrainDumpContext, AgentTimelineItem } from './agent-chat.types';

	interface Props {
		context: AgentBrainDumpContext;
		timelineItems: AgentTimelineItem[];
	}

	let { context, timelineItems }: Props = $props();

	const changes = $derived(timelineItems.filter((item) => item.kind === 'change'));
	const metadata = $derived(
		context.metadata && typeof context.metadata === 'object' ? context.metadata : {}
	);
	const projectId = $derived(
		typeof metadata.project_id === 'string'
			? metadata.project_id
			: typeof metadata.projectId === 'string'
				? metadata.projectId
				: typeof metadata.linked_project_id === 'string'
					? metadata.linked_project_id
					: null
	);
	const projectName = $derived(
		typeof metadata.project_name === 'string' && metadata.project_name.trim()
			? metadata.project_name.trim()
			: 'Project'
	);

	function formatStatus(status?: string | null): string {
		if (!status) return 'Saved';
		return status
			.split('_')
			.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
			.join(' ');
	}
</script>

<aside
	class="min-h-0 border-t border-border bg-background/80 tx tx-grid tx-weak lg:w-80 lg:border-l lg:border-t-0"
	aria-label="Brain Dump context"
>
	<div class="flex h-full min-h-0 flex-col">
		<div class="border-b border-border px-4 py-3">
			<div class="flex items-start gap-2">
				<FileText class="mt-0.5 h-4 w-4 shrink-0 text-accent" />
				<div class="min-w-0 flex-1">
					<h2 class="truncate text-sm font-semibold text-foreground">
						{context.title || 'Brain Dump'}
					</h2>
					<div
						class="mt-1 inline-flex items-center gap-1 rounded-md border border-border bg-card px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground"
					>
						{#if context.status === 'processing' || context.status === 'pending'}
							<LoaderCircle class="h-3 w-3 animate-spin" />
						{/if}
						<span>{formatStatus(context.status)}</span>
					</div>
				</div>
			</div>
			{#if context.summary}
				<p class="mt-2 text-xs leading-relaxed text-muted-foreground">{context.summary}</p>
			{/if}
			{#if context.error_message}
				<p class="mt-2 text-xs font-semibold text-destructive">{context.error_message}</p>
			{/if}
		</div>

		<div class="min-h-0 flex-1 overflow-y-auto px-4 py-3">
			<div class="space-y-4">
				{#if context.topics?.length}
					<section>
						<div
							class="mb-1.5 flex items-center gap-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground"
						>
							<Tag class="h-3 w-3" />
							<span>Topics</span>
						</div>
						<div class="flex flex-wrap gap-1.5">
							{#each context.topics as topic}
								<span
									class="rounded-md border border-border bg-card px-2 py-1 text-xs font-medium text-foreground"
								>
									{topic}
								</span>
							{/each}
						</div>
					</section>
				{/if}

				{#if projectId}
					<section>
						<div
							class="mb-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground"
						>
							Linked project
						</div>
						<a
							href={`/projects/${projectId}`}
							target="_blank"
							rel="noopener noreferrer"
							class="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1.5 text-xs font-semibold text-foreground hover:border-accent hover:text-accent"
						>
							<span class="truncate">{projectName}</span>
							<ExternalLink class="h-3 w-3 shrink-0" />
						</a>
					</section>
				{/if}

				<section>
					<div
						class="mb-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground"
					>
						Original dump
					</div>
					<details class="rounded-lg border border-border bg-card" open>
						<summary
							class="cursor-pointer px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
						>
							View text
						</summary>
						<div
							class="max-h-64 overflow-y-auto whitespace-pre-wrap border-t border-border p-3 text-xs leading-relaxed text-foreground"
						>
							{context.content}
						</div>
					</details>
				</section>

				<section>
					<div
						class="mb-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground"
					>
						Change history
					</div>
					{#if changes.length === 0}
						<p
							class="rounded-lg border border-dashed border-border bg-card/70 p-3 text-xs text-muted-foreground"
						>
							No linked changes have been recorded in this chat yet.
						</p>
					{:else}
						<div class="space-y-2">
							{#each changes as change (change.id)}
								<div class="rounded-lg border border-border bg-card p-2.5">
									<div class="text-xs font-semibold text-foreground">
										{change.title}
									</div>
									{#if change.summary}
										<div class="mt-1 text-xs text-muted-foreground">
											{change.summary}
										</div>
									{/if}
									<div class="mt-2 flex flex-wrap gap-1.5">
										{#each change.entityRefs as ref (`${ref.kind}:${ref.id}`)}
											{#if ref.url}
												<a
													href={ref.url}
													target="_blank"
													rel="noopener noreferrer"
													class="inline-flex max-w-full items-center gap-1 rounded-md border border-border bg-muted px-1.5 py-0.5 text-[0.65rem] font-semibold text-foreground hover:border-accent hover:text-accent"
												>
													<span class="truncate"
														>{ref.title || ref.id}</span
													>
													<ExternalLink class="h-3 w-3 shrink-0" />
												</a>
											{/if}
										{/each}
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</section>
			</div>
		</div>
	</div>
</aside>
