<!-- apps/web/src/lib/components/ErrorBoundary.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { AlertTriangle, RefreshCw } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';

	export let name: string = 'Component';
	export let onReset: (() => void) | null = null;
	export let showDetails: boolean = false;

	let error: Error | null = null;
	let hasError = false;

	// Error boundary implementation
	function handleError(event: ErrorEvent) {
		error = event.error;
		hasError = true;
		event.preventDefault();

		// Log to console for debugging
		console.error(`Error in ${name}:`, error);

		// Report to error tracking service if available
		if (typeof window !== 'undefined' && (window as any).errorReporter) {
			(window as any).errorReporter.report(error, {
				component: name,
				timestamp: new Date().toISOString()
			});
		}
	}

	function reset() {
		error = null;
		hasError = false;

		if (onReset) {
			onReset();
		} else {
			// Default: reload the component
			window.location.reload();
		}
	}

	onMount(() => {
		window.addEventListener('error', handleError);

		return () => {
			window.removeEventListener('error', handleError);
		};
	});
</script>

{#if hasError && error}
	<div class="error-boundary min-h-[200px] flex items-center justify-center p-4">
		<div
			class="max-w-md w-full bg-card rounded-lg shadow-ink-strong border border-red-200 dark:border-red-800 p-6"
		>
			<div class="flex items-start gap-4">
				<div class="flex-shrink-0">
					<AlertTriangle class="w-6 h-6 text-red-600 dark:text-red-400" />
				</div>
				<div class="flex-1">
					<h3 class="text-lg font-semibold text-foreground mb-2">
						{name} Error
					</h3>
					<p class="text-sm text-muted-foreground mb-4">
						Something went wrong while loading this component. You can try refreshing or
						contact support if the problem persists.
					</p>

					{#if showDetails && error}
						<details class="mb-4">
							<summary
								class="text-sm font-medium text-foreground cursor-pointer hover:text-foreground dark:hover:text-foreground"
							>
								Error Details
							</summary>
							<div
								class="mt-2 p-3 bg-muted rounded text-xs font-mono text-muted-foreground overflow-auto"
							>
								<p class="font-semibold">{error.name}:</p>
								<p>{error.message}</p>
								{#if error.stack}
									<pre class="mt-2 whitespace-pre-wrap">{error.stack}</pre>
								{/if}
							</div>
						</details>
					{/if}

					<div class="flex gap-3">
						<Button
							onclick={reset}
							variant="primary"
							size="sm"
							class="flex items-center gap-2"
						>
							<RefreshCw class="w-4 h-4" />
							Try Again
						</Button>
						<Button onclick={() => window.history.back()} variant="outline" size="sm">
							Go Back
						</Button>
					</div>
				</div>
			</div>
		</div>
	</div>
{:else}
	<slot />
{/if}

<style>
	.error-boundary {
		animation: fadeIn 0.3s ease-out;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	details summary::-webkit-details-marker {
		display: none;
	}

	details summary::before {
		content: '▶';
		display: inline-block;
		margin-right: 0.5rem;
		transition: transform 0.2s ease-out;
	}

	details[open] summary::before {
		transform: rotate(90deg);
	}
</style>
