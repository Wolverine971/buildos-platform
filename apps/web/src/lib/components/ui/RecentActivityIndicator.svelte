<!-- apps/web/src/lib/components/ui/RecentActivityIndicator.svelte -->
<script lang="ts">
	import { Sparkles, RefreshCw } from 'lucide-svelte';
	import { isWithinLast24Hours, getTimeAgoText } from '$lib/utils/date-utils';

	export let createdAt: string | null = null;
	export let updatedAt: string | null = null;
	export let size: 'xs' | 'sm' | 'md' = 'xs';
	export let showTooltip: boolean = true;

	// Determine if we should show the indicator
	$: isRecentlyCreated = isWithinLast24Hours(createdAt);
	$: isRecentlyUpdated = isWithinLast24Hours(updatedAt) && updatedAt !== createdAt;
	$: showIndicator = isRecentlyCreated || isRecentlyUpdated;

	// Determine which indicator to show (prioritize updated if both are true)
	$: indicatorType = isRecentlyUpdated ? 'updated' : 'created';
	$: timeAgoText =
		indicatorType === 'updated' ? getTimeAgoText(updatedAt!) : getTimeAgoText(createdAt!);

	// Size classes
	$: sizeClasses = {
		xs: 'w-3 h-3',
		sm: 'w-4 h-4',
		md: 'w-5 h-5'
	}[size];

	// Color classes
	$: colorClasses =
		indicatorType === 'updated'
			? 'text-green-500 dark:text-green-400'
			: 'text-blue-500 dark:text-blue-400';

	// Tooltip text
	$: tooltipText =
		indicatorType === 'updated' ? `Updated ${timeAgoText}` : `Created ${timeAgoText}`;
</script>

{#if showIndicator}
	<span
		class="inline-flex items-center {colorClasses}"
		title={showTooltip ? tooltipText : ''}
		aria-label={tooltipText}
	>
		{#if indicatorType === 'updated'}
			<RefreshCw class="{sizeClasses} animate-pulse" />
		{:else}
			<Sparkles class="{sizeClasses} animate-pulse" />
		{/if}
	</span>
{/if}

<style>
</style>
