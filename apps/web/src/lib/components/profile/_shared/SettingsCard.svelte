<!-- apps/web/src/lib/components/profile/_shared/SettingsCard.svelte -->
<script lang="ts">
	import type { Snippet, ComponentType } from 'svelte';

	let {
		title,
		description = '',
		icon: Icon,
		variant = 'default',
		bodyClass = '',
		labelledById = '',
		actions,
		children
	}: {
		title: string;
		description?: string;
		icon?: ComponentType;
		variant?: 'default' | 'danger';
		bodyClass?: string;
		labelledById?: string;
		actions?: Snippet;
		children: Snippet;
	} = $props();

	const containerClass = $derived(
		variant === 'danger'
			? 'bg-card border border-destructive/30 rounded-xl tx tx-static tx-weak overflow-hidden'
			: 'bg-card border border-border rounded-xl tx tx-frame tx-weak overflow-hidden'
	);

	const stripClass = $derived(
		variant === 'danger'
			? 'px-4 py-3 border-b border-destructive/30'
			: 'px-4 py-3 border-b border-border'
	);

	const iconClass = $derived(variant === 'danger' ? 'text-destructive' : 'text-muted-foreground');
</script>

<section class={containerClass} aria-labelledby={labelledById || undefined}>
	<div class={stripClass}>
		<div class="flex items-start gap-3">
			<div class="flex-1 min-w-0">
				<h3
					id={labelledById || undefined}
					class="text-sm sm:text-base font-medium text-foreground flex items-center gap-2 min-w-0"
				>
					{#if Icon}
						<Icon class="w-4 h-4 {iconClass} flex-shrink-0" />
					{/if}
					<span class="truncate">{title}</span>
				</h3>
				{#if description}
					<p class="text-xs text-muted-foreground mt-1">{description}</p>
				{/if}
			</div>
			{#if actions}
				<div class="flex items-center gap-2 flex-wrap flex-shrink-0">
					{@render actions()}
				</div>
			{/if}
		</div>
	</div>
	<div class="p-4 {bodyClass}">
		{@render children()}
	</div>
</section>
