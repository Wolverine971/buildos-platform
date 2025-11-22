<!-- apps/web/src/lib/components/layout/BriefStatusIndicator.svelte -->
<script lang="ts">
	import { Loader2 } from 'lucide-svelte';
	import { briefNotificationStatus } from '$lib/services/realtimeBrief.service';
	import { goto } from '$app/navigation';
	import { onDestroy } from 'svelte';
	import Button from '$lib/components/ui/Button.svelte';

	// Timer management
	class TimerManager {
		private timers: Map<string, NodeJS.Timeout> = new Map();

		set(key: string, callback: () => void, delay: number): void {
			this.clear(key);
			const timer = setTimeout(() => {
				callback();
				this.timers.delete(key);
			}, delay);
			this.timers.set(key, timer);
		}

		clear(key: string): void {
			const timer = this.timers.get(key);
			if (timer) {
				clearTimeout(timer);
				this.timers.delete(key);
			}
		}

		clearAll(): void {
			this.timers.forEach((timer) => clearTimeout(timer));
			this.timers.clear();
		}
	}

	const timerManager = new TimerManager();

	// State
	let elapsedTime = '';
	let lastJobId: string | undefined;

	// Reactive variables from store
	$: ({
		isGenerating,
		briefDate,
		progress = 0,
		message = '',
		startedAt,
		jobId
	} = $briefNotificationStatus);

	// Detect job changes (regeneration)
	$: if (jobId && jobId !== lastJobId) {
		lastJobId = jobId;
		// If we detect a new job, refresh the elapsed time
		elapsedTime = '';
	}

	// Handle click navigation
	function handleClick() {
		if (isGenerating && briefDate) {
			// Navigate to projects page Daily Briefs tab while generating
			goto(`/projects?tab=briefs&date=${briefDate}`);
		} else if (isGenerating) {
			// No specific date, just go to Daily Briefs tab
			goto('/projects?tab=briefs');
		}
	}

	// Calculate elapsed time
	function updateElapsedTime(): void {
		if (!startedAt) {
			elapsedTime = '';
			return;
		}

		const elapsed = Date.now() - new Date(startedAt).getTime();
		const seconds = Math.floor(elapsed / 1000);
		const minutes = Math.floor(seconds / 60);

		elapsedTime = minutes > 0 ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
	}

	// Update elapsed time when generating
	$: if (isGenerating && startedAt) {
		updateElapsedTime();
		// Update every second
		timerManager.set(
			'elapsed',
			function updateTimer() {
				updateElapsedTime();
				if (isGenerating) {
					timerManager.set('elapsed', updateTimer, 1000);
				}
			},
			1000
		);
	} else {
		timerManager.clear('elapsed');
		elapsedTime = '';
	}

	// Format brief date for display
	function formatBriefDate(dateStr: string | undefined): string {
		if (!dateStr) return '';

		try {
			// Parse the date string (YYYY-MM-DD format)
			const [year, month, day] = dateStr.split('-').map(Number);
			const briefDate = new Date(year, month - 1, day);

			// Get today at midnight
			const today = new Date();
			today.setHours(0, 0, 0, 0);

			// Get brief date at midnight
			const briefDateMidnight = new Date(year, month - 1, day);
			briefDateMidnight.setHours(0, 0, 0, 0);

			// Compare dates
			if (briefDateMidnight.getTime() === today.getTime()) {
				return 'Today';
			}

			// Format date
			return briefDate.toLocaleDateString('en-US', {
				month: 'short',
				day: 'numeric'
			});
		} catch (error) {
			console.error('Error formatting date:', error);
			return dateStr;
		}
	}

	// Get tooltip text
	function getTooltip(): string {
		const progressText = progress > 0 ? `${progress}% complete` : elapsedTime || 'Starting...';
		return `Generating brief... ${progressText}`;
	}

	// Cleanup on destroy
	onDestroy(() => {
		timerManager.clearAll();
	});
</script>

{#if isGenerating}
	<Button
		onclick={handleClick}
		variant="ghost"
		btnType="container"
		class="relative flex items-center space-x-2 px-2 py-1 rounded-lg transition-all duration-200 transform hover:scale-105 min-h-0 dither-subtle hover:bg-blue-200 dark:hover:bg-blue-900/50"
		title={getTooltip()}
	>
		<!-- Icon -->
		<Loader2 class="w-4 h-4 text-blue-600 dark:text-blue-400 animate-spin" />

		<!-- Main content -->
		<div class="flex flex-col items-start min-w-0">
			<!-- Status label -->
			<span class="text-sm font-medium truncate text-blue-700 dark:text-blue-300">
				Generating Brief
			</span>

			<!-- Secondary info -->
			{#if briefDate || elapsedTime}
				<span class="text-xs opacity-75 truncate">
					{#if elapsedTime && progress === 0}
						{elapsedTime}
					{:else if progress > 0}
						{progress}% - {formatBriefDate(briefDate)}
					{:else}
						{formatBriefDate(briefDate)}
					{/if}
				</span>
			{/if}
		</div>

		<!-- Progress bar -->
		{#if progress > 0}
			<div
				class="absolute bottom-0 left-0 right-0 h-1 bg-blue-200 dark:bg-blue-800 rounded-b-lg overflow-hidden"
			>
				<div
					class="h-full dither-subtle bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-500 ease-out"
					style="width: {progress}%"
				></div>
			</div>
		{/if}

		<!-- Active generation indicator -->
		<div class="absolute -top-1 -right-1">
			<span class="relative flex h-3 w-3">
				<span
					class="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"
				></span>
				<span class="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
			</span>
		</div>
	</Button>
{/if}

<style>
	/* Component is self-contained with Tailwind classes */
</style>
