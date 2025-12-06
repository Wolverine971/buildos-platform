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

	// Variant classes - Scratchpad Ops design
	// Tactile, tool-like buttons with strong borders and pressable shadows
	const variantClasses = {
		primary: `
			bg-accent-orange text-white border-2 border-slate-700 font-semibold tracking-tight
			hover:brightness-110 hover:shadow-pressable
			active:translate-y-[2px] active:shadow-none
			focus:ring-2 focus:ring-accent-orange focus:ring-offset-1
			disabled:bg-slate-400 disabled:text-slate-200 disabled:border-slate-500 disabled:cursor-not-allowed disabled:shadow-none
			dark:border-slate-500 dark:hover:brightness-110
			shadow-pressable
		`,
		secondary: `
			bg-accent-blue text-white border-2 border-slate-700 font-semibold tracking-tight
			hover:brightness-110 hover:shadow-pressable
			active:translate-y-[2px] active:shadow-none
			focus:ring-2 focus:ring-accent-blue focus:ring-offset-1
			disabled:bg-slate-400 disabled:text-slate-200 disabled:border-slate-500 disabled:cursor-not-allowed disabled:shadow-none
			dark:border-slate-500 dark:hover:brightness-110
			shadow-pressable
		`,
		ghost: `
			bg-transparent text-accent-olive border-2 border-transparent font-semibold tracking-tight
			hover:bg-surface-scratch hover:border-gray-300
			focus:ring-2 focus:ring-slate-400 focus:ring-offset-0
			disabled:text-slate-400 disabled:cursor-not-allowed
			dark:text-slate-400 dark:hover:bg-slate-700/30 dark:hover:border-gray-600
		`,
		danger: `
			bg-red-600 text-white border-2 border-red-800 font-semibold tracking-tight
			hover:bg-red-700 hover:shadow-pressable
			active:translate-y-[2px] active:shadow-none
			focus:ring-2 focus:ring-red-600 focus:ring-offset-1
			disabled:bg-slate-400 disabled:text-slate-200 disabled:border-slate-500 disabled:cursor-not-allowed disabled:shadow-none
			dark:border-red-700 dark:hover:bg-red-700
			shadow-pressable
		`,
		warning: `
			bg-amber-600 text-white border-2 border-amber-700 font-semibold tracking-tight
			hover:bg-amber-700 hover:shadow-pressable
			active:translate-y-[2px] active:shadow-none
			focus:ring-2 focus:ring-amber-600 focus:ring-offset-1
			disabled:bg-slate-400 disabled:text-slate-200 disabled:border-slate-500 disabled:cursor-not-allowed disabled:shadow-none
			dark:border-amber-700 dark:hover:bg-amber-700
			shadow-pressable
		`,
		outline: `
			bg-white text-slate-900 border-2 border-slate-700 font-semibold tracking-tight
			hover:bg-surface-scratch hover:border-slate-700 hover:shadow-subtle
			active:translate-y-[1px] active:shadow-none
			focus:ring-2 focus:ring-slate-700 focus:ring-offset-1
			disabled:bg-slate-50 disabled:text-slate-400 disabled:border-slate-300 disabled:cursor-not-allowed disabled:shadow-none
			dark:bg-transparent dark:text-slate-100 dark:border-slate-500
			dark:hover:bg-slate-700/30 dark:hover:border-accent-olive
			shadow-subtle
		`,
		success: `
			bg-emerald-600 text-white border-2 border-emerald-700 font-semibold tracking-tight
			hover:bg-emerald-700 hover:shadow-pressable
			active:translate-y-[2px] active:shadow-none
			focus:ring-2 focus:ring-emerald-600 focus:ring-offset-1
			disabled:bg-slate-400 disabled:text-slate-200 disabled:border-slate-500 disabled:cursor-not-allowed disabled:shadow-none
			dark:border-emerald-700 dark:hover:bg-emerald-700
			shadow-pressable
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
			// Base classes - Scratchpad Ops styling
			'inline-flex items-center justify-center',
			'font-semibold rounded', // 4px radius for industrial feel
			'focus:outline-none focus-visible:ring-2',
			'touch-manipulation',
			'transition-all duration-100', // Fast, tactile transitions

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
