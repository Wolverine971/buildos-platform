<!-- apps/web/src/lib/components/admin/AdminStatCard.svelte -->
<script lang="ts">
	import type { ComponentType } from 'svelte';
	import { TrendingUp, TrendingDown } from 'lucide-svelte';
	import { twMerge } from 'tailwind-merge';
	import AdminCard from './AdminCard.svelte';

	type Direction = 'up' | 'down' | 'neutral';

	let {
		label,
		value,
		icon = null,
		tone = 'default',
		suffix = '',
		change = null,
		changeLabel = 'vs last period',
		changeDirection = undefined,
		footnote = '',
		compact = false
	}: {
		label: string;
		value: string | number;
		icon?: ComponentType | null;
		tone?: 'default' | 'muted' | 'brand' | 'success' | 'danger' | 'warning' | 'info';
		suffix?: string;
		change?: number | string | null;
		changeLabel?: string;
		changeDirection?: Direction;
		footnote?: string;
		compact?: boolean;
	} = $props();

	const formattedValue = $derived(
		typeof value === 'number' ? new Intl.NumberFormat().format(value) : (value ?? '—')
	);

	const resolvedDirection: Direction = $derived(() => {
		if (changeDirection) return changeDirection;
		if (typeof change === 'number') {
			if (change > 0) return 'up';
			if (change < 0) return 'down';
		}
		return 'neutral';
	});

	const changeText = $derived(() => {
		if (change === null || change === undefined || change === '') return null;

		if (typeof change === 'number') {
			const numeric = Math.abs(change);
			return `${numeric % 1 === 0 ? numeric.toFixed(0) : numeric.toFixed(1)}%`;
		}

		return change;
	});

	const changeClasses = $derived(() => {
		switch (resolvedDirection) {
			case 'up':
				return 'text-emerald-600 dark:text-emerald-400';
			case 'down':
				return 'text-rose-600 dark:text-rose-400';
			default:
				return 'text-gray-600 dark:text-gray-400';
		}
	});

	const labelClasses = $derived(
		twMerge(
			'font-semibold uppercase tracking-[0.15em] text-gray-600 dark:text-gray-400',
			compact ? 'text-[0.65rem]' : 'text-[0.7rem]'
		)
	);

	const valueClasses = $derived(
		compact
			? 'text-2xl font-semibold text-gray-900 dark:text-white sm:text-[1.7rem]'
			: 'text-[2rem] font-semibold text-gray-900 dark:text-white sm:text-[2.35rem]'
	);

	const iconWrapperClasses = $derived(
		`flex ${compact ? 'h-10 w-10' : 'h-11 w-11'} items-center justify-center rounded-xl bg-gray-900/5 text-gray-700 dark:bg-white/5 dark:text-gray-200`
	);

	const iconSize = $derived(compact ? 'h-5 w-5' : 'h-6 w-6');
</script>

<AdminCard {tone} padding={compact ? 'md' : 'lg'} class="h-full">
	<div class="flex items-start justify-between gap-4">
		<div class={compact ? 'space-y-1.5' : 'space-y-2'}>
			<p class={labelClasses}>{label}</p>
			<p class={valueClasses}>
				{formattedValue}{suffix}
			</p>
		</div>

		{#if icon}
			{@const Icon = icon}
			<span class={iconWrapperClasses}>
				<Icon class={iconSize} />
			</span>
		{/if}
	</div>

	{#if changeText}
		<div class={`flex items-center gap-3 text-sm ${compact ? 'mt-3' : 'mt-4'}`}>
			{#if resolvedDirection === 'up'}
				<TrendingUp class="h-4 w-4 text-emerald-500" />
			{:else if resolvedDirection === 'down'}
				<TrendingDown class="h-4 w-4 text-rose-500" />
			{:else}
				<span class="h-2 w-2 rounded-full bg-gray-400"></span>
			{/if}
			<div class="flex items-baseline gap-2">
				<span class={changeClasses}>
					{resolvedDirection === 'down' && typeof change === 'number' ? '-' : ''}
					{resolvedDirection === 'up' && typeof change === 'number' ? '+' : ''}
					{changeText}
				</span>
				{#if changeLabel}
					<span class="text-gray-600 dark:text-gray-400">{changeLabel}</span>
				{/if}
			</div>
		</div>
	{/if}

	{#if footnote}
		<p class={`${compact ? 'mt-3' : 'mt-4'} text-sm text-gray-600 dark:text-gray-400`}>
			{footnote}
		</p>
	{/if}
</AdminCard>
