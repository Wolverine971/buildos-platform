<!-- apps/web/src/lib/components/agent/SharedChatTranscript.svelte -->
<script lang="ts">
	import type { SharedChatSnapshotV1 } from '$lib/types/chat-share';
	import SharedChatMessage from './SharedChatMessage.svelte';
	let { snapshot }: { snapshot: SharedChatSnapshotV1 } = $props();
</script>

<ol class="space-y-5 sm:space-y-7" aria-label="Shared conversation">
	{#each snapshot.messages as message (message)}
		<li
			class={message.role === 'user'
				? 'ml-4 rounded-xl border border-border bg-muted/50 p-4 sm:ml-12 sm:p-5'
				: 'rounded-xl border border-border bg-card p-4 shadow-ink sm:p-5'}
		>
			<p class="mb-3 micro-label text-muted-foreground">
				{message.role === 'user' ? 'Author' : 'BuildOS'}
			</p>
			<SharedChatMessage {message} />
		</li>
	{/each}
</ol>
