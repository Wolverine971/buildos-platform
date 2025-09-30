<!-- apps/web/src/lib/components/ui/RadioGroup.svelte -->
<script lang="ts">
	import { createEventDispatcher, setContext } from 'svelte';
	import { twMerge } from 'tailwind-merge';

	type RadioGroupOrientation = 'vertical' | 'horizontal';
	type RadioSize = 'sm' | 'md' | 'lg';

	interface RadioOption {
		value: string | number;
		label: string;
		description?: string;
		disabled?: boolean;
	}

	export let value: string | number = '';
	export let name = '';
	export let options: RadioOption[] = [];
	export let orientation: RadioGroupOrientation = 'vertical';
	export let size: RadioSize = 'md';
	export let disabled = false;
	export let required = false;
	export let error = false;
	export let label = '';
	export let helperText = '';
	export let errorText = '';

	// Allow class prop to be passed through
	let className = '';
	export { className as class };

	const dispatch = createEventDispatcher();

	// Create context for child Radio components
	setContext('radioGroup', {
		name,
		get value() {
			return value;
		},
		disabled,
		error,
		size,
		onChange: handleChange
	});

	function handleChange(newValue: string | number) {
		if (!disabled) {
			value = newValue;
			dispatch('change', value);
		}
	}

	$: containerClasses = twMerge('space-y-2', className);

	$: groupClasses = twMerge(
		'flex gap-4',
		orientation === 'vertical' ? 'flex-col' : 'flex-row flex-wrap',
		// Add border and padding for better visual grouping
		'border border-gray-200 dark:border-gray-700 rounded-lg p-4',
		error ? 'border-red-500 dark:border-red-400' : '',
		disabled ? 'opacity-50' : ''
	);

	$: labelClasses = twMerge(
		'block font-medium mb-2',
		size === 'sm' ? 'text-sm' : size === 'lg' ? 'text-lg' : 'text-base',
		disabled ? 'text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-gray-100'
	);

	$: helperTextClasses = twMerge(
		'text-sm mt-1',
		error ? 'text-red-600 dark:text-red-400' : 'text-gray-600 dark:text-gray-400'
	);

	// Handle keyboard navigation
	function handleKeyDown(event: KeyboardEvent) {
		if (disabled) return;

		const currentIndex = options.findIndex((opt) => opt.value === value);
		let newIndex = currentIndex;

		switch (event.key) {
			case 'ArrowDown':
			case 'ArrowRight':
				event.preventDefault();
				newIndex = (currentIndex + 1) % options.length;
				// Skip disabled options
				while (options[newIndex]?.disabled && newIndex !== currentIndex) {
					newIndex = (newIndex + 1) % options.length;
				}
				break;
			case 'ArrowUp':
			case 'ArrowLeft':
				event.preventDefault();
				newIndex = currentIndex - 1;
				if (newIndex < 0) newIndex = options.length - 1;
				// Skip disabled options
				while (options[newIndex]?.disabled && newIndex !== currentIndex) {
					newIndex--;
					if (newIndex < 0) newIndex = options.length - 1;
				}
				break;
			case ' ':
			case 'Enter':
				event.preventDefault();
				// Keep current selection
				return;
			default:
				return;
		}

		if (newIndex !== currentIndex && !options[newIndex]?.disabled) {
			handleChange(options[newIndex].value);
		}
	}
</script>

<div class={containerClasses}>
	{#if label}
		<label class={labelClasses}>
			{label}
			{#if required}
				<span class="text-red-500 ml-0.5">*</span>
			{/if}
		</label>
	{/if}

	<div
		class={groupClasses}
		role="radiogroup"
		aria-label={label}
		aria-required={required}
		aria-invalid={error}
		aria-describedby={error && errorText
			? 'error-text'
			: helperText
				? 'helper-text'
				: undefined}
		on:keydown={handleKeyDown}
	>
		{#if options.length > 0}
			<!-- Render options using Radio component -->
			{#each options as option}
				{#await import('./Radio.svelte') then Radio}
					<svelte:component
						this={Radio.default}
						name={name || 'radio-group'}
						value={option.value}
						checked={value === option.value}
						label={option.label}
						description={option.description}
						disabled={disabled || option.disabled}
						{size}
						{error}
						on:change={() => handleChange(option.value)}
					/>
				{/await}
			{/each}
		{:else}
			<!-- Slot for custom Radio components -->
			<slot />
		{/if}
	</div>

	{#if error && errorText}
		<p id="error-text" class={helperTextClasses} role="alert">
			{errorText}
		</p>
	{:else if helperText}
		<p id="helper-text" class={helperTextClasses}>
			{helperText}
		</p>
	{/if}
</div>

<style>
	/* Ensure consistent focus styles */
	:global(.dark) [role='radiogroup'] {
		--tw-ring-offset-color: rgb(31 41 55);
	}
</style>
