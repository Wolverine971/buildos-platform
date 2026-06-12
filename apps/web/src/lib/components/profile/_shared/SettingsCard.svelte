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
			? 'bg-card border border-destructive/30 rounded-lg shadow-ink tx tx-static tx-weak overflow-hidden'
			: 'bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak overflow-hidden'
	);

	const stripClass = $derived(
		variant === 'danger'
			? 'px-4 sm:px-5 py-3 border-b border-destructive/30 bg-destructive/5'
			: 'px-4 sm:px-5 py-3 border-b border-border'
	);

	const iconClass = $derived(variant === 'danger' ? 'text-destructive' : 'text-accent');
</script>

<section class={containerClass} aria-labelledby={labelledById || undefined}>
	<div class={stripClass}>
		<div class="flex items-start gap-3">
			<div class="flex-1 min-w-0">
				<h3
					id={labelledById || undefined}
					class="text-sm sm:text-base font-semibold text-foreground flex items-center gap-2"
				>
					{#if Icon}
						<Icon class="w-4 h-4 {iconClass} flex-shrink-0" />
					{/if}
					{title}
				</h3>
				{#if description}
					<p class="text-xs text-muted-foreground mt-0.5">{description}</p>
				{/if}
			</div>
			{#if actions}
				<div class="flex items-center gap-2 flex-wrap flex-shrink-0">
					{@render actions()}
				</div>
			{/if}
		</div>
	</div>
	<div class="p-4 sm:p-5 {bodyClass}">
		{@render children()}
	</div>
</section>
