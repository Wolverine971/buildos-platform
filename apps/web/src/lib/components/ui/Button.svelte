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

	// Variant classes - Inkprint design system
	// Tactile buttons with brushed-alum texture and subtle shadows
	const variantClasses = {
		primary: `
			bg-accent text-accent-foreground border border-accent font-semibold tracking-tight
			hover:bg-accent/90 hover:shadow-ink-strong
			active:translate-y-[1px] active:shadow-ink-inner
			focus:ring-2 focus:ring-ring focus:ring-offset-1
			disabled:bg-muted disabled:text-muted-foreground disabled:border-border disabled:cursor-not-allowed disabled:shadow-none
			shadow-ink tx-button relative
		`,
		secondary: `
			bg-foreground text-background border border-foreground font-semibold tracking-tight
			hover:bg-foreground/90 hover:shadow-ink-strong
			active:translate-y-[1px] active:shadow-ink-inner
			focus:ring-2 focus:ring-ring focus:ring-offset-1
			disabled:bg-muted disabled:text-muted-foreground disabled:border-border disabled:cursor-not-allowed disabled:shadow-none
			shadow-ink tx-button relative
		`,
		ghost: `
			bg-transparent text-muted-foreground border border-transparent font-semibold tracking-tight
			hover:bg-muted hover:text-foreground hover:border-border
			focus:ring-2 focus:ring-ring focus:ring-offset-0
			disabled:text-muted-foreground/50 disabled:cursor-not-allowed
		`,
		danger: `
			bg-red-600 text-white border border-red-700 font-semibold tracking-tight
			hover:bg-red-700 hover:shadow-ink-strong
			active:translate-y-[1px] active:shadow-ink-inner
			focus:ring-2 focus:ring-red-600 focus:ring-offset-1
			disabled:bg-muted disabled:text-muted-foreground disabled:border-border disabled:cursor-not-allowed disabled:shadow-none
			shadow-ink tx-button relative
		`,
		warning: `
			bg-amber-600 text-white border border-amber-700 font-semibold tracking-tight
			hover:bg-amber-700 hover:shadow-ink-strong
			active:translate-y-[1px] active:shadow-ink-inner
			focus:ring-2 focus:ring-amber-600 focus:ring-offset-1
			disabled:bg-muted disabled:text-muted-foreground disabled:border-border disabled:cursor-not-allowed disabled:shadow-none
			shadow-ink tx-button relative
		`,
		outline: `
			bg-card text-foreground border border-border font-semibold tracking-tight
			hover:bg-muted hover:border-accent hover:text-accent
			active:translate-y-[1px] active:shadow-ink-inner
			focus:ring-2 focus:ring-ring focus:ring-offset-1
			disabled:bg-muted disabled:text-muted-foreground disabled:border-border disabled:cursor-not-allowed disabled:shadow-none
			shadow-ink tx-button relative
		`,
		success: `
			bg-emerald-600 text-white border border-emerald-700 font-semibold tracking-tight
			hover:bg-emerald-700 hover:shadow-ink-strong
			active:translate-y-[1px] active:shadow-ink-inner
			focus:ring-2 focus:ring-emerald-600 focus:ring-offset-1
			disabled:bg-muted disabled:text-muted-foreground disabled:border-border disabled:cursor-not-allowed disabled:shadow-none
			shadow-ink tx-button relative
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
			// Base classes - Inkprint design system
			'inline-flex items-center justify-center',
			'font-semibold rounded-lg', // Slightly rounded for softer feel
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

	let iconSpacingClass = $derived('gap-2'); // Consistent 8px spacing for all sizes
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

	/* Ensure proper focus ring offset - Inkprint design */
	button:focus-visible {
		--tw-ring-offset-color: hsl(var(--background));
	}

	/* Respect reduced motion preferences */
	@media (prefers-reduced-motion: reduce) {
		button {
			transition: none !important;
			will-change: auto !important;
		}
	}
</style>
