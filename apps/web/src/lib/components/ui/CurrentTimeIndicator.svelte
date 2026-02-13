<!-- apps/web/src/lib/components/ui/CurrentTimeIndicator.svelte -->
<script lang="ts">
	import { onMount, onDestroy } from 'svelte';

	// Props
	export let label: string = '';
	export let showTime: boolean = true;
	export let updateInterval: number = 60000; // Update every minute by default
	export let className: string = '';

	// State
	let currentTime = new Date();
	let intervalId: number;

	// Format time for display
	function formatTime(date: Date): string {
		const options: Intl.DateTimeFormatOptions = {
			hour: 'numeric',
			minute: '2-digit',
			hour12: true
		};
		return date.toLocaleTimeString(undefined, options);
	}

	// Format date for display
	function formatDate(date: Date): string {
		const options: Intl.DateTimeFormatOptions = {
			month: 'short',
			day: 'numeric'
		};
		return date.toLocaleDateString(undefined, options);
	}

	// Update current time
	function updateTime() {
		currentTime = new Date();
	}

	onMount(() => {
		// Update time immediately
		updateTime();

		// Set up interval to update time
		intervalId = window.setInterval(updateTime, updateInterval);
	});

	onDestroy(() => {
		if (intervalId) {
			clearInterval(intervalId);
		}
	});
</script>

<div
	class="relative flex items-center justify-center py-3 {className}"
	role="separator"
	aria-label="Current time indicator"
>
	<!-- Left line -->
	<div class="absolute left-0 w-full h-0.5 bg-red-500 opacity-75 z-0 animate-pulse"></div>

	<!-- Center badge -->
	<div
		class="relative z-1 flex items-center gap-2 px-3 py-1 bg-red-500 text-white text-xs font-medium rounded-full shadow-ink"
	>
		{#if label}
			<span>{label}</span>
		{/if}
		<span>{formatDate(currentTime)}</span>
		{#if showTime}
			<span class="opacity-90">•</span>
			<span>{formatTime(currentTime)}</span>
		{/if}
	</div>
</div>
