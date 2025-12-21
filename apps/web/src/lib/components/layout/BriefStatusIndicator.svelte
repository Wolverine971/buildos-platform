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

	// State (Svelte 5 runes)
	let elapsedTime = $state('');
	let lastJobId = $state<string | undefined>(undefined);

	// Derived values from store
	let isGenerating = $derived($briefNotificationStatus.isGenerating);
	let briefDate = $derived($briefNotificationStatus.briefDate);
	let progress = $derived($briefNotificationStatus.progress ?? 0);
	let message = $derived($briefNotificationStatus.message ?? '');
	let startedAt = $derived($briefNotificationStatus.startedAt);
	let jobId = $derived($briefNotificationStatus.jobId);

	// Detect job changes (regeneration)
	$effect(() => {
		if (jobId && jobId !== lastJobId) {
			lastJobId = jobId;
			elapsedTime = '';
		}
	});

	// Update elapsed time when generating
	$effect(() => {
		if (isGenerating && startedAt) {
			updateElapsedTime();
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
	});

	// Handle click navigation
	function handleClick() {
		if (isGenerating && briefDate) {
			goto(`/projects?tab=briefs&date=${briefDate}`);
		} else if (isGenerating) {
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

	// Format brief date for display
	function formatBriefDate(dateStr: string | undefined): string {
		if (!dateStr) return '';

		try {
			const [year, month, day] = dateStr.split('-').map(Number);
			const briefDateObj = new Date(year, month - 1, day);

			const today = new Date();
			today.setHours(0, 0, 0, 0);

			const briefDateMidnight = new Date(year, month - 1, day);
			briefDateMidnight.setHours(0, 0, 0, 0);

			if (briefDateMidnight.getTime() === today.getTime()) {
				return 'Today';
			}

			return briefDateObj.toLocaleDateString('en-US', {
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
		class="relative flex items-center gap-2 px-2 py-1.5 rounded-lg border border-border
			bg-card shadow-ink tx tx-grain tx-weak
			hover:border-accent hover:bg-accent/5
			transition-colors min-h-0 pressable
			focus:ring-2 focus:ring-ring focus:ring-offset-1"
		title={getTooltip()}
	>
		<!-- Icon -->
		<Loader2 class="w-4 h-4 text-accent animate-spin shrink-0" />

		<!-- Main content -->
		<div class="flex flex-col items-start min-w-0">
			<!-- Status label -->
			<span class="text-sm font-medium text-foreground truncate">
				Generating Brief
			</span>

			<!-- Secondary info -->
			{#if briefDate || elapsedTime}
				<span class="text-xs text-muted-foreground truncate">
					{#if elapsedTime && progress === 0}
						{elapsedTime}
					{:else if progress > 0}
						{progress}% · {formatBriefDate(briefDate)}
					{:else}
						{formatBriefDate(briefDate)}
					{/if}
				</span>
			{/if}
		</div>

		<!-- Progress bar -->
		{#if progress > 0}
			<div
				class="absolute bottom-0 left-0 right-0 h-0.5 bg-muted rounded-b-lg overflow-hidden"
			>
				<div
					class="h-full bg-accent transition-all duration-500 ease-out"
					style="width: {progress}%"
				></div>
			</div>
		{/if}

		<!-- Active generation indicator (pulse) -->
		<div class="absolute -top-1 -right-1">
			<span class="relative flex h-2.5 w-2.5">
				<span
					class="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent/75"
				></span>
				<span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-accent"></span>
			</span>
		</div>
	</Button>
{/if}
