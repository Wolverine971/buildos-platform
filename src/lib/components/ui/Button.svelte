<!-- src/lib/components/ui/Button.svelte -->
<script context="module" lang="ts">
	export type ButtonVariant =
		| 'primary'
		| 'secondary'
		| 'ghost'
		| 'danger'
		| 'outline'
		| 'success'
		| 'warning';
	export type ButtonSize = 'sm' | 'md' | 'lg' | 'xl';
</script>

<script lang="ts">
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import { LoaderCircle } from 'lucide-svelte';
	import { twMerge } from 'tailwind-merge';

	interface $$Props extends HTMLButtonAttributes {
		variant?: ButtonVariant;
		size?: ButtonSize;
		loading?: boolean;
		icon?: typeof LoaderCircle;
		iconPosition?: 'left' | 'right';
		fullWidth?: boolean;
		class?: string;
		btnType?: 'container' | 'regular';
	}

	export let variant: ButtonVariant = 'primary';
	export let size: ButtonSize = 'md';
	export let loading = false;
	export let icon: typeof LoaderCircle | undefined = undefined;
	export let iconPosition: 'left' | 'right' = 'left';
	export let fullWidth = false;
	export let disabled = false;
	export let btnType: 'container' | 'regular' = 'regular';

	// Allow class prop to be passed through
	let className = '';
	export { className as class };

	// Size classes ensuring minimum touch target of 44px
	const sizeClasses = {
		sm: 'px-3 py-2 text-sm min-h-[34px] min-w-[34px]',
		md: 'px-4 py-2.5 text-base min-h-[42px] min-w-[42px]',
		lg: 'px-6 py-3 text-lg min-h-[48px] min-w-[48px]',
		xl: 'px-8 py-4 text-xl min-h-[56px] min-w-[56px]'
	};

	// Variant classes with subtle gradients and solid borders inspired by ParseResultsDiffView
	const variantClasses = {
		primary: `
			bg-gradient-to-r from-blue-50 to-purple-50 text-blue-700 border-2 border-blue-600 font-semibold
			hover:from-blue-100 hover:to-purple-100 hover:border-purple-600 hover:text-purple-700 hover:shadow-xl
			focus:ring-2 focus:ring-purple-500 focus:ring-offset-2
			disabled:from-blue-50 disabled:to-purple-50 disabled:text-blue-400 disabled:border-blue-300 disabled:cursor-not-allowed
			dark:from-blue-950/30 dark:to-purple-950/30 dark:text-blue-300 dark:border-blue-500
			dark:hover:from-blue-900/40 dark:hover:to-purple-900/40 dark:hover:border-purple-500 dark:hover:text-purple-300
			transition-all duration-200 shadow-lg
		`,
		secondary: `
			bg-gradient-to-r from-blue-100 to-indigo-100 text-blue-900 border-2 border-blue-500
			hover:from-blue-200 hover:to-indigo-200 hover:border-indigo-600 hover:text-indigo-900 hover:shadow-lg
			focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2
			disabled:from-blue-50 disabled:to-indigo-50 disabled:text-blue-400 disabled:border-blue-300 disabled:cursor-not-allowed
			dark:from-blue-950/30 dark:to-indigo-950/30 dark:text-blue-300 dark:border-blue-600
			dark:hover:from-blue-900/40 dark:hover:to-indigo-900/40 dark:hover:border-indigo-500 dark:hover:text-indigo-300
			transition-all duration-200 shadow-md
		`,
		ghost: `
			bg-transparent text-gray-700 border border-transparent
			hover:bg-gradient-to-br hover:from-gray-50 hover:to-slate-50 hover:border-gray-200
			focus:ring-2 focus:ring-gray-400 focus:ring-offset-0
			disabled:text-gray-400 disabled:cursor-not-allowed
			dark:text-gray-300 dark:hover:from-gray-800/30 dark:hover:to-slate-800/30 dark:hover:border-gray-700
			transition-all duration-200
		`,
		danger: `
			bg-gradient-to-br from-rose-50 to-red-50 text-rose-700 border border-rose-200
			hover:from-rose-100 hover:to-red-100 hover:border-rose-300 hover:shadow-md
			focus:ring-2 focus:ring-rose-500 focus:ring-offset-2
			disabled:from-gray-50 disabled:to-gray-100 disabled:text-gray-400 disabled:border-gray-200 disabled:cursor-not-allowed
			dark:from-rose-900/20 dark:to-red-900/20 dark:text-rose-300 dark:border-rose-700
			dark:hover:from-rose-900/30 dark:hover:to-red-900/30 dark:hover:border-rose-600
			transition-all duration-200 shadow-sm
		`,
		warning: `
			bg-gradient-to-br from-amber-50 to-yellow-50 text-amber-700 border border-amber-200
			hover:from-amber-100 hover:to-yellow-100 hover:border-amber-300 hover:shadow-md
			focus:ring-2 focus:ring-amber-500 focus:ring-offset-2
			disabled:from-gray-50 disabled:to-gray-100 disabled:text-gray-400 disabled:border-gray-200 disabled:cursor-not-allowed
			dark:from-amber-900/20 dark:to-yellow-900/20 dark:text-amber-300 dark:border-amber-700
			dark:hover:from-amber-900/30 dark:hover:to-yellow-900/30 dark:hover:border-amber-600
			transition-all duration-200 shadow-sm
		`,
		outline: `
			bg-white text-gray-800 border-2 border-gray-400
			hover:bg-gradient-to-br hover:from-gray-50 hover:to-slate-50 hover:border-gray-500 hover:text-gray-900 hover:shadow-md
			focus:ring-2 focus:ring-gray-500 focus:ring-offset-2
			disabled:bg-gray-50 disabled:text-gray-400 disabled:border-gray-200 disabled:cursor-not-allowed
			dark:bg-transparent dark:text-gray-300 dark:border-gray-600
			dark:hover:from-gray-800/30 dark:hover:to-slate-800/30 dark:hover:border-gray-500
			transition-all duration-200 shadow-sm
		`,
		success: `
			bg-gradient-to-br from-emerald-50 to-green-50 text-emerald-700 border border-emerald-200
			hover:from-emerald-100 hover:to-green-100 hover:border-emerald-300 hover:shadow-md
			focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2
			disabled:from-gray-50 disabled:to-gray-100 disabled:text-gray-400 disabled:border-gray-200 disabled:cursor-not-allowed
			dark:from-emerald-900/20 dark:to-green-900/20 dark:text-emerald-300 dark:border-emerald-700
			dark:hover:from-emerald-900/30 dark:hover:to-green-900/30 dark:hover:border-emerald-600
			transition-all duration-200 shadow-sm
		`
	};

	// Icon size based on button size
	const iconSizes = {
		sm: 'w-4 h-4',
		md: 'w-5 h-5',
		lg: 'w-6 h-6',
		xl: 'w-7 h-7'
	};

	$: buttonClasses = twMerge(
		// Base classes
		'inline-flex items-center justify-center',
		'font-medium rounded-lg',
		'transition-all duration-200',
		'focus:outline-none focus-visible:ring-2',
		'touch-manipulation',

		// Size classes
		sizeClasses[size],

		// Variant classes
		variantClasses[variant],

		// Full width
		fullWidth && 'w-full',

		// Loading state
		loading && 'cursor-wait',

		// Custom classes (these will override conflicts)
		className
	);

	$: iconClass = [iconSizes[size], loading ? 'animate-spin' : ''].filter(Boolean).join(' ');

	$: iconSpacingClass = size === 'sm' ? 'gap-1.5' : 'gap-2';
</script>

<button
	type="button"
	class={buttonClasses}
	on:click
	on:mouseenter
	on:mouseleave
	on:focus
	on:blur
	on:keydown
	on:keyup
	on:keypress
	disabled={disabled || loading}
	{...$$restProps}
>
	{#if btnType === 'container'}
		<slot />
	{:else}
		<span class="inline-flex items-center {iconSpacingClass}">
			{#if loading}
				<LoaderCircle class="{iconClass} animate-spin" />
			{:else if icon && iconPosition === 'left'}
				<svelte:component this={icon} class={iconClass} />
			{/if}

			<slot />

			{#if !loading && icon && iconPosition === 'right'}
				<svelte:component this={icon} class={iconClass} />
			{/if}
		</span>
	{/if}
</button>

<style>
	/* Ensure touch targets meet accessibility standards */
	button {
		-webkit-tap-highlight-color: transparent;
	}

	/* Ensure proper focus ring offset in dark mode */
	:global(.dark) button:focus-visible {
		--tw-ring-offset-color: rgb(31 41 55);
	}
</style>
