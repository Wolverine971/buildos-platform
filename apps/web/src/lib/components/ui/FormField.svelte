<!-- src/lib/components/ui/FormField.svelte -->
<script lang="ts">
	import { Info, AlertCircle } from 'lucide-svelte';

	export let label: string = '';
	export let labelFor: string = '';
	export let error: string = '';
	export let hint: string = '';
	export let required: boolean = false;
	export let showOptional: boolean = true;

	// Allow class prop to be passed through
	let className = '';
	export { className as class };

	$: containerClasses = ['space-y-1.5', className].filter(Boolean).join(' ');

	$: labelClasses = [
		'block text-sm font-semibold uppercase tracking-wider',
		'text-gray-900 dark:text-white',
		'mb-2'
	].join(' ');

	$: errorClasses = [
		'flex items-center gap-1.5 mt-1.5',
		'text-sm text-red-600 dark:text-red-400'
	].join(' ');

	$: hintClasses = [
		'flex items-center gap-1.5 mt-1.5',
		'text-sm text-gray-500 dark:text-gray-400'
	].join(' ');
</script>

<div class={containerClasses}>
	{#if label}
		<label for={labelFor} class={labelClasses}>
			{label}
			{#if required}
				<span class="text-red-500 ml-0.5">*</span>
			{:else if showOptional && !required}
				<span class="text-gray-400 dark:text-gray-500 ml-1 text-xs">(optional)</span>
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

	/* Ensure consistent focus behavior */
	:global(.form-field-focus) div:focus-within label {
		color: rgb(99 102 241);
	}

	:global(.dark .form-field-focus) div:focus-within label {
		color: rgb(129 140 248);
	}
</style>
