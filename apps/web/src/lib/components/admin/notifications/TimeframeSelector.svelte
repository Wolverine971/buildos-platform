<!-- apps/web/src/lib/components/admin/notifications/TimeframeSelector.svelte -->
<script lang="ts">
	import { RefreshCw } from 'lucide-svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import type { Timeframe } from '$lib/services/notification-analytics.service';

	interface Props {
		value: Timeframe;
		autoRefresh?: boolean;
		loading?: boolean;
		onRefresh?: () => void;
		onAutoRefreshToggle?: (enabled: boolean) => void;
		onTimeframeChange?: (timeframe: Timeframe) => void;
	}

	let {
		value = $bindable('7d'),
		autoRefresh = $bindable(false),
		loading = false,
		onRefresh,
		onAutoRefreshToggle,
		onTimeframeChange
	}: Props = $props();

	function handleTimeframeChange(e: CustomEvent) {
		value = e.detail as Timeframe;
		onTimeframeChange?.(value);
	}

	function handleAutoRefreshToggle() {
		autoRefresh = !autoRefresh;
		onAutoRefreshToggle?.(autoRefresh);
	}

	function handleRefresh() {
		onRefresh?.();
	}
</script>

<div class="flex items-center space-x-4">
	<!-- Auto Refresh -->
	<label class="flex items-center space-x-2 cursor-pointer">
		<input
			type="checkbox"
			bind:checked={autoRefresh}
			onchange={handleAutoRefreshToggle}
			class="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 cursor-pointer dark:bg-gray-700"
		/>
		<span class="text-sm text-gray-600 dark:text-gray-400">Auto Refresh (30s)</span>
	</label>

	<!-- Timeframe Selector -->
	<Select bind:value on:change={handleTimeframeChange} size="md" placeholder="Select timeframe">
		<option value="24h">Last 24 Hours</option>
		<option value="7d">Last 7 Days</option>
		<option value="30d">Last 30 Days</option>
		<option value="90d">Last 90 Days</option>
	</Select>

	<!-- Refresh Button -->
	<Button
		on:click={handleRefresh}
		disabled={loading}
		variant="secondary"
		size="sm"
		icon={RefreshCw}
		{loading}
	>
		Refresh
	</Button>
</div>
