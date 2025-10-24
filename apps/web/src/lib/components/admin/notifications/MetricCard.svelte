<!-- apps/web/src/lib/components/admin/notifications/MetricCard.svelte -->
<script lang="ts">
	import { TrendingUp, TrendingDown } from 'lucide-svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import CardBody from '$lib/components/ui/CardBody.svelte';

	interface Props {
		title: string;
		value: number | string;
		trend?: number | null;
		loading?: boolean;
		icon?: any;
		color?: 'blue' | 'green' | 'red' | 'yellow' | 'purple' | 'orange';
		suffix?: string;
	}

	let {
		title,
		value,
		trend = null,
		loading = false,
		icon: Icon = null,
		color = 'blue',
		suffix = ''
	}: Props = $props();

	let colorClasses = $derived(
		{
			blue: 'text-blue-600',
			green: 'text-green-600',
			red: 'text-red-600',
			yellow: 'text-yellow-600',
			purple: 'text-purple-600',
			orange: 'text-orange-600'
		}[color]
	);

	let formattedValue = $derived(
		typeof value === 'number' ? new Intl.NumberFormat().format(value) : value
	);
</script>

<Card>
	<CardBody padding="lg">
		{#if loading}
			<div class="animate-pulse">
				<div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2"></div>
				<div class="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
			</div>
		{:else}
			<div class="flex items-center justify-between">
				<div class="flex-1">
					<p class="text-sm font-medium text-gray-600 dark:text-gray-400">
						{title}
					</p>
					<p class="text-3xl font-bold {colorClasses} mt-1">
						{formattedValue}{suffix}
					</p>
				</div>
				{#if Icon}
					<svelte:component
						this={Icon}
						class="h-8 w-8 {colorClasses} flex-shrink-0 ml-3"
					/>
				{/if}
			</div>

			{#if trend !== null && trend !== undefined}
				<div class="mt-2 flex items-center text-sm">
					{#if trend > 0}
						<TrendingUp class="w-4 h-4 text-green-500 mr-1" />
						<span class="text-green-600">+{trend.toFixed(1)}%</span>
					{:else if trend < 0}
						<TrendingDown class="w-4 h-4 text-red-500 mr-1" />
						<span class="text-red-600">{trend.toFixed(1)}%</span>
					{:else}
						<span class="text-gray-500">No change</span>
					{/if}
					<span class="text-gray-500 ml-2">vs previous period</span>
				</div>
			{/if}
		{/if}
	</CardBody>
</Card>
