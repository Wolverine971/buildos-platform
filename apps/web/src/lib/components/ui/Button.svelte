<!-- apps/web/src/lib/components/ui/Button.svelte -->
<script module lang="ts">
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
	import type { Snippet } from 'svelte';
	import { LoaderCircle } from 'lucide-svelte';
	import { twMerge } from 'tailwind-merge';

	// Svelte 5 runes: Use $props() with rest syntax instead of export let and $$restProps
	let {
		variant = 'primary',
		size = 'md',
		loading = false,
		icon = undefined,
		iconPosition = 'left',
		fullWidth = false,
		disabled = false,
		btnType = 'regular',
		class: className = '',
		children,
		...restProps
	}: {
		variant?: ButtonVariant;
		size?: ButtonSize;
		loading?: boolean;
		icon?: typeof LoaderCircle;
		iconPosition?: 'left' | 'right';
		fullWidth?: boolean;
		disabled?: boolean;
		btnType?: 'container' | 'regular';
		class?: string;
		children?: Snippet;
	} & HTMLButtonAttributes = $props();

	// Size classes ensuring minimum touch target of 44x44px per WCAG AA standards
	const sizeClasses = {
		sm: 'px-3 py-2 text-sm min-h-[44px] min-w-[44px]',
		md: 'px-4 py-2.5 text-base min-h-[44px] min-w-[44px]',
		lg: 'px-6 py-3 text-lg min-h-[48px] min-w-[48px]',
		xl: 'px-8 py-4 text-xl min-h-[56px] min-w-[56px]'
	};

	// Variant classes with gradients + dithering for high-end texture
	// Note: Removed transition-all for performance - using GPU-optimized transitions in style tag
	const variantClasses = {
		primary: `
			bg-gradient-to-r from-blue-50 to-purple-50 text-blue-700 border-2 border-blue-600 font-semibold
			hover:from-blue-100 hover:to-purple-100 hover:border-purple-600 hover:text-purple-700 hover:shadow-xl
			focus:ring-2 focus:ring-purple-500 focus:ring-offset-2
			disabled:from-blue-50 disabled:to-purple-50 disabled:text-blue-400 disabled:border-blue-300 disabled:cursor-not-allowed
			dark:from-blue-950/30 dark:to-purple-950/30 dark:text-blue-300 dark:border-blue-500
			dark:hover:from-blue-900/40 dark:hover:to-purple-900/40 dark:hover:border-purple-500 dark:hover:text-purple-300
			shadow-lg
			dither-gradient dither-fade-hover
		`,
		secondary: `
			bg-gradient-to-r from-blue-100 to-indigo-100 text-blue-900 border-2 border-blue-500
			hover:from-blue-200 hover:to-indigo-200 hover:border-indigo-600 hover:text-indigo-900 hover:shadow-lg
			focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2
			disabled:from-blue-50 disabled:to-indigo-50 disabled:text-blue-400 disabled:border-blue-300 disabled:cursor-not-allowed
			dark:from-blue-950/30 dark:to-indigo-950/30 dark:text-blue-300 dark:border-blue-600
			dark:hover:from-blue-900/40 dark:hover:to-indigo-900/40 dark:hover:border-indigo-500 dark:hover:text-indigo-300
			shadow-md
			dither-gradient dither-fade-hover
		`,
		ghost: `
			bg-transparent text-gray-700 border border-transparent
			hover:bg-gradient-to-br hover:from-gray-50 hover:to-slate-50 hover:border-gray-200
			focus:ring-2 focus:ring-gray-400 focus:ring-offset-0
			disabled:text-gray-400 disabled:cursor-not-allowed
			dark:text-gray-300 dark:hover:from-gray-800/30 dark:hover:to-slate-800/30 dark:hover:border-gray-700
		`,
		danger: `
			bg-gradient-to-br from-rose-50 to-red-50 text-rose-700 border border-rose-200
			hover:from-rose-100 hover:to-red-100 hover:border-rose-300 hover:shadow-md
			focus:ring-2 focus:ring-rose-500 focus:ring-offset-2
			disabled:from-gray-50 disabled:to-gray-100 disabled:text-gray-400 disabled:border-gray-200 disabled:cursor-not-allowed
			dark:from-rose-900/20 dark:to-red-900/20 dark:text-rose-300 dark:border-rose-700
			dark:hover:from-rose-900/30 dark:hover:to-red-900/30 dark:hover:border-rose-600
			shadow-sm
			dither-gradient dither-fade-hover
		`,
		warning: `
			bg-gradient-to-br from-amber-50 to-yellow-50 text-amber-700 border border-amber-200
			hover:from-amber-100 hover:to-yellow-100 hover:border-amber-300 hover:shadow-md
			focus:ring-2 focus:ring-amber-500 focus:ring-offset-2
			disabled:from-gray-50 disabled:to-gray-100 disabled:text-gray-400 disabled:border-gray-200 disabled:cursor-not-allowed
			dark:from-amber-900/20 dark:to-yellow-900/20 dark:text-amber-300 dark:border-amber-700
			dark:hover:from-amber-900/30 dark:hover:to-yellow-900/30 dark:hover:border-amber-600
			shadow-sm
			dither-gradient dither-fade-hover
		`,
		outline: `
			bg-white text-gray-800 border-2 border-gray-400
			hover:bg-gradient-to-br hover:from-gray-50 hover:to-slate-50 hover:border-gray-500 hover:text-gray-900 hover:shadow-md
			focus:ring-2 focus:ring-gray-500 focus:ring-offset-2
			disabled:bg-gray-50 disabled:text-gray-400 disabled:border-gray-200 disabled:cursor-not-allowed
			dark:bg-transparent dark:text-gray-300 dark:border-gray-600
			dark:hover:from-gray-800/30 dark:hover:to-slate-800/30 dark:hover:border-gray-500
			shadow-sm
		`,
		success: `
			bg-gradient-to-br from-emerald-50 to-green-50 text-emerald-700 border border-emerald-200
			hover:from-emerald-100 hover:to-green-100 hover:border-emerald-300 hover:shadow-md
			focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2
			disabled:from-gray-50 disabled:to-gray-100 disabled:text-gray-400 disabled:border-gray-200 disabled:cursor-not-allowed
			dark:from-emerald-900/20 dark:to-green-900/20 dark:text-emerald-300 dark:border-emerald-700
			dark:hover:from-emerald-900/30 dark:hover:to-green-900/30 dark:hover:border-emerald-600
			shadow-sm
			dither-gradient dither-fade-hover
		`
	};

	// Icon size based on button size
	const iconSizes = {
		sm: 'w-4 h-4',
		md: 'w-5 h-5',
		lg: 'w-6 h-6',
		xl: 'w-7 h-7'
	};

	// Svelte 5 runes: Convert reactive declarations to $derived
	let buttonClasses = $derived(
		twMerge(
			// Base classes
			'inline-flex items-center justify-center',
			'font-medium rounded-lg',
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
		)
	);

	let iconClass = $derived(
		[iconSizes[size], loading ? 'animate-spin' : ''].filter(Boolean).join(' ')
	);

	let iconSpacingClass = $derived(size === 'sm' ? 'gap-1.5' : 'gap-2');
</script>

<button type="button" class={buttonClasses} disabled={disabled || loading} {...restProps}>
	{#if btnType === 'container'}
		{@render children?.()}
	{:else}
		<span class="inline-flex items-center {iconSpacingClass}">
			{#if loading}
				<LoaderCircle class="{iconClass} animate-spin" />
			{:else if icon && iconPosition === 'left'}
				{@const IconComponent = icon}
				<IconComponent class={iconClass} />
			{/if}

			{@render children?.()}

			{#if !loading && icon && iconPosition === 'right'}
				{@const IconComponent = icon}
				<IconComponent class={iconClass} />
			{/if}
		</span>
	{/if}
</button>

<style>
	/* ==================== GPU-Optimized Button Animations ==================== */

	button {
		/* Ensure touch targets meet accessibility standards */
		-webkit-tap-highlight-color: transparent;

		/* GPU acceleration for smooth animations */
		transform: translateZ(0);
		backface-visibility: hidden;

		/* Only animate GPU-friendly properties */
		transition-property: border-color, box-shadow, opacity, color;
		transition-duration: 200ms;
		transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);

		/* Pre-warm GPU for hover transitions */
		will-change: border-color, box-shadow;
	}

	/* Remove will-change when not hovering for better performance */
	button:not(:hover):not(:focus-visible) {
		will-change: auto;
	}

	/* Ensure proper focus ring offset in dark mode */
	:global(.dark) button:focus-visible {
		--tw-ring-offset-color: rgb(31 41 55);
	}

	/* Respect reduced motion preferences */
	@media (prefers-reduced-motion: reduce) {
		button {
			transition: none !important;
			will-change: auto !important;
		}
	}
</style>

