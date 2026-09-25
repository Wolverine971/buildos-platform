<!-- apps/web/src/lib/components/inbox/InboxFreshnessReviewItems.svelte -->
<!--
	The freshness roll-up's review items (tasker 106): records that look out of date with no
	automatic change proposed, each with a one-line code-authored reason. Fixing happens in chat
	(the item's Discuss button seeds the chat with every item's suggested request).
-->
<script lang="ts">
	import type { ProjectSuggestionReviewItem } from '@buildos/shared-types';
	import { CheckSquare, FileText, Flag, Target } from '$lib/icons/lucide';

	let { items = [] }: { items?: ProjectSuggestionReviewItem[] } = $props();

	const KIND_ICON = {
		task: CheckSquare,
		document: FileText,
		goal: Target,
		milestone: Flag
	} as const;
	const KIND_LABEL = {
		task: 'Task',
		document: 'Doc',
		goal: 'Goal',
		milestone: 'Milestone'
	} as const;
	const visible = $derived(
		items.filter((item) => item && typeof item.title === 'string').slice(0, 5)
	);
</script>

{#if visible.length}
	<ul class="mt-2 space-y-1.5" aria-label="Out of date">
		{#each visible as item (item.concern_id)}
			{@const Icon = KIND_ICON[item.entity_type] ?? FileText}
			<li
				class="flex min-w-0 items-start gap-2 rounded-md border border-border bg-muted/20 p-2"
			>
				<Icon
					class="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
					aria-hidden="true"
				/>
				<div class="min-w-0">
					<p class="truncate text-xs font-medium text-foreground" title={item.title}>
						{item.title}<span class="sr-only"
							>, {KIND_LABEL[item.entity_type] ?? 'record'}</span
						>
					</p>
					{#if item.reason}
						<p class="mt-0.5 line-clamp-2 break-words text-2xs text-muted-foreground">
							{item.reason}
						</p>
					{/if}
				</div>
			</li>
		{/each}
	</ul>
{/if}
