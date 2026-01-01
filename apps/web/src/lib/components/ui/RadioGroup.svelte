<!-- apps/web/src/lib/components/ui/RadioGroup.svelte -->
<!--
	Inkprint RadioGroup Component (Svelte 5)
	- Migrated to Svelte 5 runes
	- Responsive spacing for mobile density
	- Uses Inkprint semantic tokens
-->
<script lang="ts">
	import { setContext } from 'svelte';
	import { twMerge } from 'tailwind-merge';
	import Radio from './Radio.svelte';
	import type { Snippet } from 'svelte';

	type RadioGroupOrientation = 'vertical' | 'horizontal';
	type RadioSize = 'sm' | 'md' | 'lg';

	interface RadioOption {
		value: string | number;
		label: string;
		description?: string;
		disabled?: boolean;
	}

	interface Props {
		value?: string | number;
		name?: string;
		options?: RadioOption[];
		orientation?: RadioGroupOrientation;
		size?: RadioSize;
		disabled?: boolean;
		required?: boolean;
		error?: boolean;
		label?: string;
		helperText?: string;
		errorText?: string;
		class?: string;
		children?: Snippet;
		onchange?: (value: string | number) => void;
	}

	let {
		value = $bindable(''),
		name = '',
		options = [],
		orientation = 'vertical',
		size = 'md',
		disabled = false,
		required = false,
		error = false,
		label = '',
		helperText = '',
		errorText = '',
		class: className = '',
		children,
		onchange
	}: Props = $props();

	const generatedLabelId = crypto.randomUUID();
	let labelId = $derived(label ? `${(name || generatedLabelId).toString()}-label` : undefined);

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
			onchange?.(value);
		}
	}

	// Responsive spacing: tighter on mobile
	let containerClasses = $derived(twMerge('space-y-1 sm:space-y-2', className));

	// Responsive gap and padding for mobile density
	let groupClasses = $derived(
		twMerge(
			'flex gap-2 sm:gap-3',
			orientation === 'vertical' ? 'flex-col' : 'flex-row flex-wrap',
			// Inkprint styling with responsive padding
			'border border-border rounded-lg p-3 sm:p-4 shadow-ink bg-card tx tx-frame tx-weak',
			error ? 'border-destructive' : '',
			disabled ? 'opacity-50' : ''
		)
	);

	// Responsive label sizing
	let labelClasses = $derived(
		twMerge(
			'block font-semibold mb-1 sm:mb-1.5',
			size === 'sm' ? 'text-xs sm:text-sm' : size === 'lg' ? 'text-base sm:text-lg' : 'text-sm sm:text-base',
			disabled ? 'text-muted-foreground/50' : 'text-foreground'
		)
	);

	// Responsive helper text
	let helperTextClasses = $derived(
		twMerge(
			'text-xs sm:text-sm mt-1',
			error ? 'text-destructive' : 'text-muted-foreground'
		)
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
		<p id={labelId} class={labelClasses}>
			{label}
			{#if required}
				<span class="text-destructive ml-0.5">*</span>
			{/if}
		</p>
	{/if}

	<div
		class={groupClasses}
		role="radiogroup"
		aria-label={labelId ? undefined : label || undefined}
		aria-labelledby={labelId}
		aria-required={required}
		aria-invalid={error}
		aria-describedby={error && errorText
			? 'error-text'
			: helperText
				? 'helper-text'
				: undefined}
		onkeydown={handleKeyDown}
	>
		{#if options.length > 0}
			{#each options as option}
				<Radio
					name={name || 'radio-group'}
					value={option.value}
					checked={value === option.value}
					label={option.label}
					description={option.description}
					disabled={disabled || option.disabled}
					{size}
					{error}
					onchange={() => handleChange(option.value)}
				/>
			{/each}
		{:else if children}
			{@render children()}
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
	/* Ensure consistent focus styles - Inkprint design */
	[role='radiogroup'] {
		--tw-ring-offset-color: hsl(var(--background));
	}
</style>
