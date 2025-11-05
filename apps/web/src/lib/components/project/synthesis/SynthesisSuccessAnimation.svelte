<!-- apps/web/src/lib/components/project/synthesis/SynthesisSuccessAnimation.svelte -->
<script lang="ts">
	import { CheckCircle, Sparkles, TrendingUp } from 'lucide-svelte';
	import { onMount } from 'svelte';
	import { fade, scale } from 'svelte/transition';
	import Button from '$lib/components/ui/Button.svelte';

	export let stats = {
		consolidations: 0,
		newTasks: 0,
		archived: 0,
		total: 0
	};

	export let onDismiss: () => void;

	let visible = false;

	onMount(() => {
		// Trigger animation after mount
		setTimeout(() => {
			visible = true;
		}, 100);

		// Auto-dismiss after 5 seconds
		const dismissTimeout = setTimeout(() => {
			onDismiss();
		}, 5000);

		return () => clearTimeout(dismissTimeout);
	});
</script>

{#if visible}
	<div
		class="fixed top-4 right-4 z-50 max-w-sm"
		transition:scale={{ duration: 300, start: 0.95 }}
	>
		<div
			class="bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden"
		>
			<!-- Success Header -->
			<div class="bg-gradient-to-r from-green-500 to-emerald-500 p-4">
				<div class="flex items-center justify-between">
					<div class="flex items-center space-x-3">
						<div class="p-2 bg-white/20 rounded-lg backdrop-blur">
							<CheckCircle class="w-6 h-6 text-white" />
						</div>
						<div>
							<h3 class="text-white font-semibold">Synthesis Complete!</h3>
							<p class="text-green-100 text-sm">Your tasks have been analyzed</p>
						</div>
					</div>
					<Button
						onclick={onDismiss}
						aria-label="Dismiss"
						variant="ghost"
						size="sm"
						btnType="container"
						class="text-white/80 hover:text-white transition-colors min-h-0 min-w-0 p-0"
					>
						<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M6 18L18 6M6 6l12 12"
							/>
						</svg>
					</Button>
				</div>
			</div>

			<!-- Stats -->
			<div class="p-4">
				<div class="grid grid-cols-3 gap-3 mb-4">
					{#if stats.consolidations > 0}
						<div
							class="text-center p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg"
							transition:scale={{ delay: 100 }}
						>
							<div class="text-xl font-bold text-blue-600 dark:text-blue-400">
								{stats.consolidations}
							</div>
							<div class="text-xs text-blue-700 dark:text-blue-300">Merged</div>
						</div>
					{/if}

					{#if stats.newTasks > 0}
						<div
							class="text-center p-2 bg-green-50 dark:bg-green-900/20 rounded-lg"
							transition:scale={{ delay: 200 }}
						>
							<div class="text-xl font-bold text-green-600 dark:text-green-400">
								{stats.newTasks}
							</div>
							<div class="text-xs text-green-700 dark:text-green-300">Created</div>
						</div>
					{/if}

					{#if stats.archived > 0}
						<div
							class="text-center p-2 bg-orange-50 dark:bg-orange-900/20 rounded-lg"
							transition:scale={{ delay: 300 }}
						>
							<div class="text-xl font-bold text-orange-600 dark:text-orange-400">
								{stats.archived}
							</div>
							<div class="text-xs text-orange-700 dark:text-orange-300">Archived</div>
						</div>
					{/if}
				</div>

				<!-- Message -->
				<div class="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
					<TrendingUp class="w-4 h-4 text-green-500" />
					<span>Review and apply changes below</span>
				</div>
			</div>

			<!-- Sparkle animation -->
			<div class="absolute -top-1 -right-1">
				<Sparkles class="w-6 h-6 text-yellow-400 animate-pulse" />
			</div>
		</div>
	</div>
{/if}

<style>
	@keyframes sparkle {
		0%,
		100% {
			opacity: 0.5;
			transform: scale(1) rotate(0deg);
		}
		50% {
			opacity: 1;
			transform: scale(1.2) rotate(180deg);
		}
	}
</style>
