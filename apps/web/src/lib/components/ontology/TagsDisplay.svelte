<!-- apps/web/src/lib/components/ontology/TagsDisplay.svelte -->
<!--
	Tags Display Component

	Displays tags from entity props.tags (populated by the classification worker).
	Shows as read-only chips/badges with optional edit callback for future expansion.

	Usage:
	<TagsDisplay props={entity.props} />
-->
<script lang="ts">
	import { Tag } from 'lucide-svelte';
	import Badge from '$lib/components/ui/Badge.svelte';

	interface Props {
		/** Entity props object containing optional tags array */
		props?: Record<string, unknown> | null;
		/** Maximum number of tags to display before truncating */
		maxDisplay?: number;
		/** Size of the badges */
		size?: 'xs' | 'sm' | 'md';
		/** Optional label to show before tags */
		showLabel?: boolean;
		/** Compact mode - inline with less spacing */
		compact?: boolean;
	}

	let {
		props = null,
		maxDisplay = 7,
		size = 'sm',
		showLabel = false,
		compact = false
	}: Props = $props();

	const tags = $derived.by((): string[] => {
		if (!props || typeof props !== 'object') return [];
		const tagsValue = (props as Record<string, unknown>).tags;
		if (!Array.isArray(tagsValue)) return [];
		return tagsValue.filter((t): t is string => typeof t === 'string' && t.length > 0);
	});

	const displayTags = $derived(tags.slice(0, maxDisplay));
	const remainingCount = $derived(Math.max(0, tags.length - maxDisplay));

	const classificationInfo = $derived.by(() => {
		if (!props || typeof props !== 'object') return null;
		const classification = (props as Record<string, unknown>)._classification;
		if (!classification || typeof classification !== 'object') return null;
		return classification as Record<string, unknown>;
	});
</script>

{#if tags.length > 0}
	<div class={compact ? 'flex flex-wrap items-center gap-1.5' : 'flex flex-col gap-2'}>
		{#if showLabel && !compact}
			<div class="flex items-center gap-1.5 text-xs text-muted-foreground">
				<Tag class="w-3 h-3" />
				<span class="font-medium uppercase tracking-wide">Tags</span>
				{#if classificationInfo?.confidence}
					<span class="text-[10px] opacity-70">
						({Math.round((classificationInfo.confidence as number) * 100)}% confidence)
					</span>
				{/if}
			</div>
		{/if}
		<div class="flex flex-wrap gap-1.5">
			{#each displayTags as tag}
				<Badge
					variant="secondary"
					{size}
					class="font-normal bg-accent/10 text-accent-foreground/80 border-accent/20"
				>
					{tag}
				</Badge>
			{/each}
			{#if remainingCount > 0}
				<Badge
					variant="secondary"
					{size}
					class="font-normal bg-muted text-muted-foreground"
				>
					+{remainingCount} more
				</Badge>
			{/if}
		</div>
	</div>
{/if}
