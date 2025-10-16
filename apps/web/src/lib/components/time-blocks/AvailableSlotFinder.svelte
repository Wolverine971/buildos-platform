<!-- apps/web/src/lib/components/time-blocks/AvailableSlotFinder.svelte -->
<script lang="ts">
	import { timeBlocksStore } from '$lib/stores/timeBlocksStore';
	import type { SlotFinderConfig } from '$lib/types/time-blocks';

	let {
		availableSlotsCount = 0
	}: {
		availableSlotsCount?: number;
	} = $props();

	// Use derived to always read fresh config from store (for enabled and bufferTime)
	let config = $derived($timeBlocksStore.slotFinderConfig);

	// Initialize local state once from store for sliders
	// These are independent and only update the store after debounce
	let localMinDuration = $state($timeBlocksStore.slotFinderConfig.minDuration);
	let localMaxDuration = $state($timeBlocksStore.slotFinderConfig.maxDuration);
	let localEarliestStart = $state($timeBlocksStore.slotFinderConfig.earliestStart);
	let localLatestEnd = $state($timeBlocksStore.slotFinderConfig.latestEnd);

	// Debounce timers
	let durationDebounceTimer: ReturnType<typeof setTimeout> | null = null;
	let timeWindowDebounceTimer: ReturnType<typeof setTimeout> | null = null;

	function toggleEnabled() {
		timeBlocksStore.updateSlotFinderConfig({ enabled: !config.enabled });
	}

	function updateBufferTime(bufferTime: 0 | 15 | 30 | 60) {
		timeBlocksStore.updateSlotFinderConfig({ bufferTime });
	}

	function updateDurationRange() {
		// Debounce duration updates
		if (durationDebounceTimer) {
			clearTimeout(durationDebounceTimer);
		}

		durationDebounceTimer = setTimeout(() => {
			timeBlocksStore.updateSlotFinderConfig({
				minDuration: localMinDuration,
				maxDuration: localMaxDuration
			});
		}, 150);
	}

	function updateTimeWindow() {
		// Debounce time window updates
		if (timeWindowDebounceTimer) {
			clearTimeout(timeWindowDebounceTimer);
		}

		timeWindowDebounceTimer = setTimeout(() => {
			timeBlocksStore.updateSlotFinderConfig({
				earliestStart: localEarliestStart,
				latestEnd: localLatestEnd
			});
		}, 150);
	}

	function formatHour(hour: number): string {
		const period = hour >= 12 ? 'PM' : 'AM';
		const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
		return `${displayHour}:00 ${period}`;
	}

	function formatDuration(minutes: number): string {
		if (minutes < 60) {
			return `${minutes} mins`;
		}
		const hours = minutes / 60;
		return hours === Math.floor(hours) ? `${hours} hrs` : `${hours.toFixed(1)} hrs`;
	}
</script>

<div class="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
	<!-- Header with Toggle -->
	<div
		class="flex items-center justify-between border-b border-gray-200 px-3 py-2.5 dark:border-gray-700 sm:px-4 sm:py-3"
	>
		<div class="flex items-center gap-2">
			<div
				class="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40"
			>
				<svg
					class="h-4 w-4 text-emerald-600 dark:text-emerald-400"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
					/>
				</svg>
			</div>
			<div class="min-w-0 flex-1">
				<h3 class="text-xs font-semibold text-slate-900 dark:text-white sm:text-sm">
					Available Slots
				</h3>
				<p class="hidden text-xs text-slate-600 dark:text-slate-400 sm:block">
					Find gaps in your schedule
				</p>
			</div>
		</div>

		<!-- Toggle Switch -->
		<button
			type="button"
			role="switch"
			aria-checked={config.enabled}
			class={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-500/40 ${
				config.enabled
					? 'bg-emerald-500 dark:bg-emerald-600'
					: 'bg-slate-300 dark:bg-slate-700'
			}`}
			onclick={toggleEnabled}
		>
			<span
				class={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-150 ease-in-out ${
					config.enabled ? 'translate-x-5' : 'translate-x-0'
				}`}
			/>
		</button>
	</div>

	<!-- Configuration Panel (visible when enabled) -->
	{#if config.enabled}
		<div class="space-y-3 px-3 py-3 sm:px-4 sm:py-4">
			<!-- Buffer Time -->
			<div class="space-y-1.5">
				<label class="block text-xs font-semibold text-slate-700 dark:text-slate-200">
					Buffer Time
				</label>
				<div class="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
					{#each [0, 15, 30, 60] as time}
						<button
							type="button"
							class={`rounded-md px-3 py-2 text-xs font-medium transition touch-manipulation ${
								config.bufferTime === time
									? 'bg-emerald-500 text-white shadow-sm dark:bg-emerald-600'
									: 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
							}`}
							onclick={() => updateBufferTime(time as 0 | 15 | 30 | 60)}
						>
							{time === 0 ? 'None' : time === 60 ? '1h' : `${time}m`}
						</button>
					{/each}
				</div>
			</div>

			<!-- Slot Duration -->
			<div class="space-y-1.5">
				<label class="block text-xs font-semibold text-slate-700 dark:text-slate-200">
					Slot Duration
				</label>
				<div
					class="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400"
				>
					<span
						>Min: <strong class="text-slate-900 dark:text-white"
							>{formatDuration(localMinDuration)}</strong
						></span
					>
					<span
						>Max: <strong class="text-slate-900 dark:text-white"
							>{formatDuration(localMaxDuration)}</strong
						></span
					>
				</div>
				<div class="space-y-1.5">
					<!-- Min Duration Slider -->
					<div class="flex items-center gap-2">
						<span class="text-xs text-slate-600 dark:text-slate-400 w-10">Min:</span>
						<input
							type="range"
							min="15"
							max="600"
							step="15"
							bind:value={localMinDuration}
							oninput={updateDurationRange}
							class="flex-1 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer dark:bg-slate-700
								[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5
								[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-emerald-500
								[&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-sm
								[&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:rounded-full
								[&::-moz-range-thumb]:bg-emerald-500 [&::-moz-range-thumb]:cursor-pointer
								[&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:shadow-sm"
						/>
					</div>
					<!-- Max Duration Slider -->
					<div class="flex items-center gap-2">
						<span class="text-xs text-slate-600 dark:text-slate-400 w-10">Max:</span>
						<input
							type="range"
							min="30"
							max="600"
							step="15"
							bind:value={localMaxDuration}
							oninput={updateDurationRange}
							class="flex-1 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer dark:bg-slate-700
								[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5
								[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-emerald-500
								[&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-sm
								[&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:rounded-full
								[&::-moz-range-thumb]:bg-emerald-500 [&::-moz-range-thumb]:cursor-pointer
								[&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:shadow-sm"
						/>
					</div>
				</div>
				{#if localMinDuration > localMaxDuration}
					<p class="text-xs font-medium text-rose-600 dark:text-rose-400">
						⚠️ Min must be &lt; max
					</p>
				{/if}
			</div>

			<!-- Time Window -->
			<div class="space-y-1.5">
				<label class="block text-xs font-semibold text-slate-700 dark:text-slate-200">
					Time Window
				</label>
				<div
					class="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400"
				>
					<span
						>Earliest: <strong class="text-slate-900 dark:text-white"
							>{formatHour(localEarliestStart)}</strong
						></span
					>
					<span
						>Latest: <strong class="text-slate-900 dark:text-white"
							>{formatHour(localLatestEnd)}</strong
						></span
					>
				</div>
				<div class="space-y-1.5">
					<!-- Earliest Start Slider -->
					<div class="flex items-center gap-2">
						<span class="text-xs text-slate-600 dark:text-slate-400 w-14"
							>Earliest:</span
						>
						<input
							type="range"
							min="0"
							max="23"
							step="1"
							bind:value={localEarliestStart}
							oninput={updateTimeWindow}
							class="flex-1 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer dark:bg-slate-700
								[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5
								[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-emerald-500
								[&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-sm
								[&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:rounded-full
								[&::-moz-range-thumb]:bg-emerald-500 [&::-moz-range-thumb]:cursor-pointer
								[&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:shadow-sm"
						/>
					</div>
					<!-- Latest End Slider -->
					<div class="flex items-center gap-2">
						<span class="text-xs text-slate-600 dark:text-slate-400 w-14">Latest:</span>
						<input
							type="range"
							min="1"
							max="24"
							step="1"
							bind:value={localLatestEnd}
							oninput={updateTimeWindow}
							class="flex-1 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer dark:bg-slate-700
								[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5
								[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-emerald-500
								[&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-sm
								[&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:rounded-full
								[&::-moz-range-thumb]:bg-emerald-500 [&::-moz-range-thumb]:cursor-pointer
								[&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:shadow-sm"
						/>
					</div>
				</div>
				{#if localEarliestStart >= localLatestEnd}
					<p class="text-xs font-medium text-rose-600 dark:text-rose-400">
						⚠️ Earliest &lt; latest
					</p>
				{/if}
			</div>

			<!-- Slot Count Display -->
			<div
				class="rounded-md border border-emerald-200 bg-gradient-to-r from-emerald-50/50 to-green-50/50 px-3 py-2 text-xs dark:border-emerald-700 dark:from-emerald-900/10 dark:to-green-900/10"
			>
				{#if availableSlotsCount > 0}
					<div class="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300">
						<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
							/>
						</svg>
						<span class="font-medium">
							{availableSlotsCount} slot{availableSlotsCount !== 1 ? 's' : ''} found
						</span>
					</div>
				{:else}
					<div class="space-y-1">
						<div class="flex items-center gap-1.5 text-amber-700 dark:text-amber-300">
							<svg
								class="h-4 w-4"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
								/>
							</svg>
							<span class="font-medium">No slots found</span>
						</div>
						<p class="text-xs text-amber-600 dark:text-amber-400">
							Adjust buffer time, time window, or duration
						</p>
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>
