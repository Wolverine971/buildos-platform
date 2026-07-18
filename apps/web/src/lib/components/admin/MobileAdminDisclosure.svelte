<!-- apps/web/src/lib/components/admin/MobileAdminDisclosure.svelte -->
<script lang="ts">
	import type { ComponentType, Snippet } from 'svelte';
	import { ChevronDown } from '$lib/icons/lucide';

	let {
		title,
		subtitle = '',
		badge = '',
		icon: Icon,
		open = false,
		children
	}: {
		title: string;
		subtitle?: string;
		badge?: string;
		icon: ComponentType;
		open?: boolean;
		children?: Snippet;
	} = $props();
</script>

<details
	class="group overflow-hidden rounded-xl border border-border bg-card shadow-ink tx tx-frame tx-weak"
	{open}
>
	<summary
		class="flex min-h-12 cursor-pointer list-none items-center gap-3 px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
	>
		<span
			class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"
		>
			<Icon class="h-4 w-4" />
		</span>
		<span class="min-w-0 flex-1">
			<span class="block truncate text-sm font-semibold text-foreground">{title}</span>
			{#if subtitle}
				<span class="block truncate text-2xs text-muted-foreground">{subtitle}</span>
			{/if}
		</span>
		{#if badge}
			<span
				class="max-w-28 shrink-0 truncate rounded-md bg-muted px-2 py-1 text-2xs font-semibold text-foreground"
			>
				{badge}
			</span>
		{/if}
		<ChevronDown
			class="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none"
		/>
	</summary>

	<div class="border-t border-border">
		{@render children?.()}
	</div>
</details>

<style>
	summary::-webkit-details-marker {
		display: none;
	}
</style>
