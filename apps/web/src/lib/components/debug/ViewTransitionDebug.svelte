<!-- apps/web/src/lib/components/debug/ViewTransitionDebug.svelte -->
<script lang="ts">
	import { browser } from '$app/environment';
	import { page } from '$app/stores';

	let supported = false;
	let currentRoute = '';
	let transitionCount = 0;

	if (browser) {
		supported = !!document.startViewTransition;

		// Listen for view transition events
		if (supported) {
			// Track transitions
			const originalStartViewTransition = document.startViewTransition.bind(document);
			document.startViewTransition = function (callback) {
				transitionCount++;
				console.log(
					`[View Transition ${transitionCount}] Started at ${new Date().toLocaleTimeString()}`
				);
				return originalStartViewTransition(callback);
			};
		}
	}

	$: if (browser) {
		currentRoute = $page.route.id || 'unknown';
	}
</script>

{#if browser}
	<div
		class="fixed bottom-4 right-4 bg-black/90 text-white text-xs p-3 rounded-lg font-mono z-50 max-w-xs"
	>
		<div class="font-bold mb-2">🎬 View Transition Debug</div>
		<div class="space-y-1">
			<div>
				<span class="text-gray-400">Support:</span>
				<span class={supported ? 'text-green-400' : 'text-red-400'}>
					{supported ? '✓ Enabled' : '✗ Not Supported'}
				</span>
			</div>
			<div>
				<span class="text-gray-400">Route:</span>
				<span class="text-blue-400">{currentRoute}</span>
			</div>
			<div>
				<span class="text-gray-400">Transitions:</span>
				<span class="text-yellow-400">{transitionCount}</span>
			</div>
		</div>
		{#if !supported}
			<div class="mt-2 text-orange-400 text-[10px]">
				Try Chrome 111+, Edge 111+, or Safari 18+
			</div>
		{/if}
	</div>
{/if}
