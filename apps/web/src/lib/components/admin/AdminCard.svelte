<!-- apps/web/src/lib/components/admin/AdminCard.svelte -->
<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { twMerge } from 'tailwind-merge';

	type Tone = 'default' | 'muted' | 'brand' | 'success' | 'danger' | 'warning' | 'info';
	type Padding = 'none' | 'sm' | 'md' | 'lg';

	let {
		tone = 'default',
		padding = 'lg',
		interactive = false,
		class: className = '',
		...rest
	}: {
		tone?: Tone;
		padding?: Padding;
		interactive?: boolean;
		class?: string;
	} & HTMLAttributes<HTMLDivElement> = $props();

	const toneClasses: Record<Tone, string> = {
		default: 'border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900',
		muted: 'border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/60',
		brand: 'border-blue-200 bg-blue-50 dark:border-blue-500/40 dark:bg-blue-500/10',
		success:
			'border-emerald-200 bg-emerald-50 dark:border-emerald-500/40 dark:bg-emerald-500/10',
		danger: 'border-rose-200 bg-rose-50 dark:border-rose-500/40 dark:bg-rose-500/10',
		warning: 'border-amber-200 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10',
		info: 'border-sky-200 bg-sky-50 dark:border-sky-500/40 dark:bg-sky-500/10'
	};

	const paddingClasses: Record<Padding, string> = {
		none: '',
		sm: 'px-4 py-3 sm:px-4 sm:py-4',
		md: 'px-4 py-4 sm:px-6 sm:py-5',
		lg: 'px-6 py-5 sm:px-6 sm:py-6'
	};

	let cardClasses = $derived(
		twMerge(
			'relative overflow-hidden rounded-xl border shadow-sm transition-all duration-200',
			interactive && 'hover:-translate-y-[2px] hover:shadow-md',
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
		<slot />
	</div>
</div>
