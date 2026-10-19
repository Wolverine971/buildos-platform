<!-- apps/web/src/lib/components/agent/ChatShareButton.svelte -->
<script lang="ts">
	import { Share2 } from '$lib/icons/lucide';
	let { sessionId, active = true }: { sessionId: string; active?: boolean } = $props();
	let open = $state(false);
	// The host keeps hidden chats mounted. A portaled share sheet must close with it.
	$effect(() => {
		if (!active) open = false;
	});
</script>

<button
	type="button"
	onclick={() => (open = true)}
	aria-label="Share chat"
	title="Share chat"
	class="inline-flex h-11 w-11 sm:h-7 sm:w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-ink touch-manipulation pressable hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
>
	<Share2 class="h-4 w-4" />
</button>

{#if open && active}
	{#await import('./ChatShareSheet.svelte') then { default: ChatShareSheet }}
		<ChatShareSheet {sessionId} onClose={() => (open = false)} />
	{/await}
{/if}
