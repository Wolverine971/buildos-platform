<!-- apps/web/src/lib/components/ui/Radio.svelte -->
<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';
	import { getContext } from 'svelte';
	import { twMerge } from 'tailwind-merge';

	type RadioSize = 'sm' | 'md' | 'lg';

	interface Props extends Omit<HTMLInputAttributes, 'type' | 'size'> {
		value?: string | number;
		checked?: boolean;
		name?: string;
		disabled?: boolean;
		required?: boolean;
		size?: RadioSize;
		label?: string;
		description?: string;
		error?: boolean;
		class?: string;
		labelClass?: string;
		inputClass?: string;
		onchange?: (event: { value: string | number; checked: boolean }) => void;
	}

	let {
		value = '',
		checked = $bindable(false),
		name = '',
		disabled = false,
		required = false,
		size = 'md',
		label = '',
		description = '',
		error = false,
		class: className = '',
		labelClass = '',
		inputClass = '',
		onchange,
		...restProps
	}: Props = $props();

	// Get group context if available
	const groupContext = getContext<any>('radioGroup');

	// Derive values from group context
	let effectiveName = $derived(groupContext?.name || name);
	let effectiveDisabled = $derived(groupContext?.disabled || disabled);
	let effectiveError = $derived(groupContext?.error || error);
	let effectiveSize = $derived(groupContext?.size || size);
	let effectiveChecked = $derived(groupContext ? groupContext.value === value : checked);

	// Size classes for the radio input
	const sizeClasses = {
		sm: 'w-4 h-4',
		md: 'w-5 h-5',
		lg: 'w-6 h-6'
	};

	// Label size classes
	const labelSizeClasses = {
		sm: 'text-sm',
		md: 'text-base',
		lg: 'text-lg'
	};

	// Container padding based on size
	const containerPadding = {
		sm: 'p-2',
		md: 'p-3',
		lg: 'p-4'
	};

	let radioClasses = $derived(
		twMerge(
			// Base classes
			'appearance-none rounded-full border-2 transition-all duration-200',
			'focus:outline-none focus:ring-2 focus:ring-offset-2',
			'disabled:cursor-not-allowed disabled:opacity-50',
			'cursor-pointer',

			// Size classes
			sizeClasses[effectiveSize],

			// State classes - Inkprint design
			effectiveChecked ? 'bg-accent border-accent' : 'bg-card border-border',

			// Error state
			effectiveError && !effectiveChecked ? 'border-destructive' : '',

			// Focus ring color - Inkprint
			effectiveError ? 'focus:ring-destructive' : 'focus:ring-ring',

			// Hover state (only when not disabled)
			!effectiveDisabled && !effectiveChecked ? 'hover:border-muted-foreground' : '',

			// Custom input classes
			inputClass
		)
	);

	let containerClasses = $derived(
		twMerge(
			'flex items-start gap-3 group',
			effectiveDisabled ? 'cursor-not-allowed' : 'cursor-pointer',
			// Add hover effect to container - Inkprint
			!effectiveDisabled ? 'hover:bg-muted/50 rounded transition-colors' : '',
			containerPadding[effectiveSize],
			className
		)
	);

	let labelClasses = $derived(
		twMerge(
			'select-none',
			labelSizeClasses[effectiveSize],
			effectiveDisabled
				? 'text-muted-foreground/50 cursor-not-allowed'
				: 'text-foreground cursor-pointer font-bold',
			labelClass
		)
	);

	let descriptionClasses = $derived(
		twMerge(
			'text-sm mt-1',
			effectiveDisabled ? 'text-muted-foreground/50' : 'text-muted-foreground'
		)
	);

	function handleChange(event: Event) {
		const target = event.target as HTMLInputElement;
		checked = target.checked;

		if (groupContext) {
			groupContext.onChange(value);
		}

		onchange?.({ value, checked: target.checked });
	}

	function handleClick() {
		if (!effectiveDisabled && groupContext) {
			groupContext.onChange(value);
		}
	}
</script>

<label class={containerClasses}>
	<div class="relative flex items-center justify-center flex-shrink-0">
		<input
			type="radio"
			name={effectiveName}
			{value}
			checked={effectiveChecked}
			disabled={effectiveDisabled}
			{required}
			class={radioClasses}
			onchange={handleChange}
			onclick={handleClick}
			{...restProps}
		/>
		{#if effectiveChecked}
			<div
				class="absolute pointer-events-none rounded-full bg-accent-foreground"
				class:w-1.5={effectiveSize === 'sm'}
				class:h-1.5={effectiveSize === 'sm'}
				class:w-2={effectiveSize === 'md'}
				class:h-2={effectiveSize === 'md'}
				class:w-2.5={effectiveSize === 'lg'}
				class:h-2.5={effectiveSize === 'lg'}
			></div>
		{/if}
	</div>

	{#if label || description}
		<div class="flex-1">
			{#if label}
				<span class={labelClasses}>
					{label}
					{#if required}
						<span class="text-destructive ml-0.5">*</span>
					{/if}
				</span>
			{/if}
			{#if description}
				<p class={descriptionClasses}>
					{description}
				</p>
			{/if}
		</div>
	{/if}
</label>

<style>
	/* Ensure radio button appearance is consistent across browsers */
	input[type='radio'] {
		-webkit-appearance: none;
		-moz-appearance: none;
		appearance: none;
	}

	/* Focus ring offset - Inkprint design */
	input[type='radio']:focus {
		--tw-ring-offset-color: hsl(var(--background));
	}
</style>
