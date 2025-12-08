<!-- apps/web/src/lib/components/ui/FormField.svelte -->
<script lang="ts">
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
		class: className = ''
	}: {
		label?: string;
		labelFor?: string;
		error?: string;
		hint?: string;
		required?: boolean;
		showOptional?: boolean;
		uppercase?: boolean;
		class?: string;
	} = $props();

	let containerClasses = $derived(['space-y-1.5', className].filter(Boolean).join(' '));

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

	let errorClasses = $derived(
		['flex items-center gap-1.5 mt-1.5', 'text-sm text-destructive'].join(' ')
	);

	let hintClasses = $derived(
		['flex items-center gap-1.5 mt-1.5', 'text-sm text-muted-foreground'].join(' ')
	);
</script>

<div class={containerClasses}>
	{#if label}
		<label for={labelFor} class={labelClasses}>
			{label}
			{#if required}
				<span class="text-destructive ml-0.5">*</span>
			{:else if showOptional && !required}
				<span class="text-muted-foreground ml-1 text-xs">(optional)</span>
			{/if}
		</label>
	{/if}

	<slot />

	<!-- Reserve space for error/hint messages to prevent layout shift -->
	<div class="min-h-[1.5rem] flex items-start">
		{#if error}
			<div class={errorClasses} role="alert" aria-live="polite">
				<AlertCircle class="w-4 h-4 flex-shrink-0" />
				<span>{error}</span>
			</div>
		{:else if hint}
			<div class={hintClasses}>
				<Info class="w-4 h-4 flex-shrink-0" />
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
