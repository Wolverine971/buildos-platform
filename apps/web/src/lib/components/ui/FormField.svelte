<!-- apps/web/src/lib/components/ui/FormField.svelte -->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Info, AlertCircle } from 'lucide-svelte';

	// Svelte 5 runes: Use $props()
	let {
		label = '',
		labelFor = '',
		error = '',
		hint = '',
		required = false,
		showOptional = true,
		uppercase = true,
		class: className = '',
		children
	}: {
		label?: string;
		labelFor?: string;
		error?: string;
		hint?: string;
		required?: boolean;
		showOptional?: boolean;
		uppercase?: boolean;
		class?: string;
		children?: Snippet;
	} = $props();

	// Consistent spacing on 8px grid
	let containerClasses = $derived(['space-y-2', className].filter(Boolean).join(' '));

	// Consistent label styling
	let labelClasses = $derived(
		[
			'block text-sm font-semibold',
			uppercase && 'uppercase tracking-wider',
			'text-foreground',
			'mb-2'
		]
			.filter(Boolean)
			.join(' ')
	);

	// Error styling with consistent spacing
	let errorClasses = $derived(
		['flex items-center gap-2 mt-2', 'text-sm text-destructive'].join(' ')
	);

	// Hint styling with consistent spacing
	let hintClasses = $derived(
		['flex items-center gap-2 mt-2', 'text-sm text-muted-foreground'].join(' ')
	);
</script>

<div class={containerClasses}>
	{#if label}
		<label for={labelFor} class={labelClasses}>
			{label}
			{#if required}
				<span class="text-destructive ml-0.5">*</span>
			{:else if showOptional && !required}
				<span class="text-muted-foreground ml-1 text-xs hidden sm:inline">(optional)</span>
			{/if}
		</label>
	{/if}

	{@render children?.()}

	<!--
		Error/hint message space:
		- Mobile: No reserved space (min-h-0) - layout shifts acceptable, density is priority
		- Desktop: Reserve space (sm:min-h-5) to prevent layout shift during typing
	-->
	<div class="min-h-0 sm:min-h-5 flex items-start">
		{#if error}
			<div class={errorClasses} role="alert" aria-live="polite">
				<!-- Icon hidden on mobile for density, shown on desktop -->
				<AlertCircle class="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0 hidden sm:block" />
				<span>{error}</span>
			</div>
		{:else if hint}
			<div class={hintClasses}>
				<!-- Icon hidden on mobile for density, shown on desktop -->
				<Info class="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0 hidden sm:block" />
				<span>{hint}</span>
			</div>
		{/if}
	</div>
</div>

<style>
	/* Ensure proper spacing in forms */
	:global(.form-field-group) {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	/* For horizontal form layouts */
	:global(.form-field-row) {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
		gap: 1rem;
	}

	/* Ensure consistent focus behavior - Inkprint design */
	:global(.form-field-focus) div:focus-within label {
		color: hsl(var(--accent));
	}
</style>
