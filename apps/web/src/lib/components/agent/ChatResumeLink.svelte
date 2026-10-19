<!-- apps/web/src/lib/components/agent/ChatResumeLink.svelte -->
<script lang="ts">
	import { Link } from '$lib/icons/lucide';
	import { toastService } from '$lib/stores/toast.store';
	import { captureEvent } from '$lib/services/posthog';
	import { buildChatResumeUrl } from './agent-chat-url.svelte';

	let {
		sessionId,
		surface = 'global'
	}: {
		sessionId: string;
		surface?: 'global' | 'embedded';
	} = $props();

	async function copyLink() {
		try {
			await navigator.clipboard.writeText(
				buildChatResumeUrl(new URL(window.location.href), sessionId)
			);
			toastService.success('Link copied');
			captureEvent('chat_link_copied', { surface });
		} catch {
			toastService.error("Couldn't copy that link. Try again.");
		}
	}
</script>

<button
	type="button"
	onclick={() => void copyLink()}
	class="inline-flex h-11 w-11 sm:h-7 sm:w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-ink touch-manipulation pressable hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
	aria-label="Copy link"
	title="Copy link"
>
	<Link class="h-4 w-4" />
</button>
