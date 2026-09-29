<!-- apps/web/src/lib/components/inbox/InboxCleanupChangeList.svelte -->
<!--
	Compact "What changes" list for one Project cleanup item: each row's verified headline and
	its decoded operations (before → after). Only server-verified wording reaches this list.
-->
<script lang="ts">
	import type { ProjectCleanupItemRow } from '@buildos/shared-types';
	import { cleanupRowOperations } from './project-cleanup-presentation';

	let {
		rows = [],
		showHeadlines = true
	}: {
		rows?: ProjectCleanupItemRow[];
		showHeadlines?: boolean;
	} = $props();

	const entries = $derived(
		rows.map((row) => ({
			id: row.suggestion_id,
			headline: row.verified_headline,
			operations: cleanupRowOperations(row.verified_operations)
		}))
	);
</script>

<div class="space-y-2">
	{#each entries as entry (entry.id)}
		<div class="space-y-1.5">
			{#if showHeadlines && entry.headline}
				<p class="break-words text-xs font-semibold text-foreground">{entry.headline}</p>
			{/if}
			{#if entry.operations.length}
				<ul class="space-y-1.5">
					{#each entry.operations as op (op.key)}
						<li class="rounded-md border border-border bg-card px-2 py-1.5">
							<p class="min-w-0 break-words text-2xs">
								<span class="font-semibold text-foreground">{op.label}</span>
								{#if op.target}
									<span class="text-muted-foreground">·</span>
									<span class="text-foreground/90">{op.target}</span>
								{/if}
							</p>
							{#if op.summary}
								<p class="mt-0.5 break-words text-2xs text-muted-foreground">
									{op.summary}
								</p>
							{/if}
							{#if op.changes.length}
								<ul class="mt-1 space-y-1">
									{#each op.changes as change, index (index)}
										<li class="text-2xs">
											{#if change.textEdit && change.before !== undefined}
												<span class="font-medium text-muted-foreground"
													>{change.label}:</span
												>
												<span
													class="mt-0.5 block overflow-hidden rounded border border-border font-mono leading-relaxed"
												>
													<span
														class="block whitespace-pre-wrap break-words bg-destructive/10 px-1.5 py-0.5 text-foreground/90"
														><span class="sr-only">Before:</span
														>{change.before}</span
													>
													{#if change.label !== 'Remove'}
														<span
															class="block whitespace-pre-wrap break-words bg-success/10 px-1.5 py-0.5 text-foreground/90"
															><span class="sr-only">After:</span
															>{change.value}</span
														>
													{/if}
												</span>
											{:else}
												<span class="font-medium text-muted-foreground"
													>{change.label}:</span
												>
												<span class="break-words text-foreground/90">
													{#if change.before !== undefined}
														<span class="text-muted-foreground"
															>{change.before}</span
														>
														<span
															class="text-muted-foreground"
															aria-hidden="true">→</span
														>
														<span class="sr-only">changes to</span>
													{/if}
													{change.value}
												</span>
											{/if}
										</li>
									{/each}
								</ul>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/each}
</div>
