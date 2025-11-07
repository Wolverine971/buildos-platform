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
		default:
			'border-slate-200/70 bg-white/85 backdrop-blur-sm dark:border-slate-800/70 dark:bg-slate-900/70',
		muted:
			'border-transparent bg-slate-50/80 dark:bg-slate-900/60 dark:border-slate-800/60',
		brand:
			'border-blue-500/30 bg-gradient-to-br from-blue-500/10 via-indigo-500/10 to-cyan-400/10 dark:border-blue-400/30',
		success:
			'border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 via-green-500/10 to-teal-400/10 dark:border-emerald-400/30',
		danger:
			'border-rose-500/30 bg-gradient-to-br from-rose-500/10 via-red-500/10 to-orange-400/10 dark:border-rose-400/30',
		warning:
			'border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-yellow-500/10 to-orange-400/10 dark:border-amber-400/30',
		info: 'border-indigo-500/30 bg-gradient-to-br from-indigo-500/10 via-blue-500/10 to-cyan-400/10 dark:border-indigo-400/30'
	};

	const paddingClasses: Record<Padding, string> = {
		none: '',
		sm: 'px-4 py-3 sm:px-4 sm:py-4',
		md: 'px-5 py-4 sm:px-6 sm:py-5',
		lg: 'px-6 py-5 sm:px-7 sm:py-7'
	};

	let cardClasses = $derived(
		twMerge(
			'relative overflow-hidden rounded-3xl border shadow-sm transition-all duration-300',
			interactive && 'hover:-translate-y-1 hover:shadow-xl',
			toneClasses[tone],
			paddingClasses[padding],
			className
		)
	);
</script>

<div class={cardClasses} {...rest}>
	<div
		class="pointer-events-none absolute inset-0 opacity-75 blur-2xl"
		class:opacity-0={tone === 'default' || tone === 'muted'}
	/>
	<div class="relative">
		<slot />
	</div>
</div>
