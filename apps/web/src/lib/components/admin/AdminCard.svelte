<!-- apps/web/src/lib/components/admin/AdminCard.svelte -->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { twMerge } from 'tailwind-merge';

	type Tone = 'default' | 'muted' | 'brand' | 'success' | 'danger' | 'warning' | 'info';
	type Padding = 'none' | 'sm' | 'md' | 'lg';

	let {
		tone = 'default',
		padding = 'lg',
		interactive = false,
		class: className = '',
		children,
		...rest
	}: {
		tone?: Tone;
		padding?: Padding;
		interactive?: boolean;
		class?: string;
		children?: Snippet;
	} & HTMLAttributes<HTMLDivElement> = $props();

	const toneClasses: Record<Tone, string> = {
		default: 'border-border bg-card',
		muted: 'border-border bg-muted',
		brand: 'border-accent/40 bg-accent/10',
		success: 'border-emerald-500/40 bg-emerald-500/10',
		danger: 'border-destructive/40 bg-destructive/10',
		warning: 'border-amber-500/40 bg-amber-500/10',
		info: 'border-sky-500/40 bg-sky-500/10'
	};

	const paddingClasses: Record<Padding, string> = {
		none: '',
		sm: 'px-4 py-3 sm:px-4 sm:py-4',
		md: 'px-4 py-4 sm:px-6 sm:py-5',
		lg: 'px-6 py-5 sm:px-6 sm:py-6'
	};

	let cardClasses = $derived(
		twMerge(
			'relative overflow-hidden rounded-xl border shadow-ink transition-all duration-200 tx tx-frame tx-weak',
			interactive && 'hover:-translate-y-[2px] hover:shadow-ink-strong pressable',
			toneClasses[tone],
			paddingClasses[padding],
			className
		)
	);
</script>

<div class={cardClasses} {...rest}>
	<div
		class="pointer-events-none absolute inset-0 opacity-40 blur-xl"
		class:opacity-0={tone === 'default' || tone === 'muted'}
	></div>
	<div class="relative">
		{@render children?.()}
	</div>
</div>
