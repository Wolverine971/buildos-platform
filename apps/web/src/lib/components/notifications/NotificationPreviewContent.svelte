<!-- apps/web/src/lib/components/notifications/NotificationPreviewContent.svelte -->
<svelte:options runes={true} />

<script lang="ts">
	import type { ComponentType } from 'svelte';

	interface Props {
		contextLabel: string;
		contextAriaLabel?: string;
		actionLabel: string;
		targetLabel?: string | null;
		preview?: string | null;
		icon?: ComponentType | null;
	}

	let {
		contextLabel,
		contextAriaLabel,
		actionLabel,
		targetLabel = null,
		preview = null,
		icon: Icon = null
	}: Props = $props();
</script>

<div class="min-w-0">
	<div
		class="truncate text-sm font-semibold text-foreground"
		aria-label={contextAriaLabel || contextLabel}
	>
		{contextLabel}
	</div>

	<div class="mt-0.5 flex min-w-0 items-center gap-1.5">
		{#if Icon}
			<Icon class="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
		{/if}
		<span class="min-w-0 truncate text-xs">
			<span class="font-medium text-foreground">{actionLabel}</span>
			{#if targetLabel}
				<span class="text-muted-foreground">
					<span aria-hidden="true"> · </span>{targetLabel}
				</span>
			{/if}
		</span>
	</div>

	{#if preview}
		<div class="mt-1 line-clamp-2 break-words text-xs leading-4 text-muted-foreground">
			{preview}
		</div>
	{/if}
</div>
