<!-- apps/web/src/lib/components/trial/ReadOnlyOverlay.svelte -->
<script lang="ts">
	import { CreditCard, Lock } from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import Button from '$lib/components/ui/Button.svelte';

	export let show = false;
	export let message = 'Your account is in read-only mode. Subscribe to regain full access.';

	function handleSubscribe() {
		goto('/pricing');
	}
</script>

{#if show}
	<div
		class="fixed inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-[100]"
	>
		<div class="bg-card rounded-lg shadow-ink-strong p-6 m-4 max-w-md">
			<div class="flex items-center mb-4">
				<Lock class="h-8 w-8 text-red-500 mr-3" />
				<h3 class="text-xl font-semibold text-foreground">Read-Only Mode</h3>
			</div>

			<p class="text-muted-foreground mb-6">
				{message}
			</p>

			<div class="flex space-x-3">
				<Button
					onclick={handleSubscribe}
					variant="primary"
					size="md"
					icon={CreditCard}
					iconPosition="left"
					class="flex-1"
				>
					Subscribe Now
				</Button>
				<Button onclick={() => (show = false)} variant="secondary" size="md" class="flex-1">
					Cancel
				</Button>
			</div>
		</div>
	</div>
{/if}
