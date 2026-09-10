<!-- apps/web/src/lib/components/onboarding-v2/ProjectCreationChat.test-harness.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	let {
		initialChatSessionId = null,
		autoSendInitialDraft = false,
		initialDraft = null,
		onSessionChange,
		onClose
	} = $props();
	onMount(() => onSessionChange?.(initialChatSessionId ?? 'creation-session'));
</script>

<section aria-label="Fixture setup chat">
	<p>Session: {initialChatSessionId ?? 'new'}</p>
	<p>Auto send: {String(autoSendInitialDraft)}</p>
	<p>Draft: {initialDraft ?? 'none'}</p>
	<button
		onclick={() =>
			onClose?.({
				hasChanges: false,
				affectedProjectIds: [],
				totalMutations: 0,
				hasMessagesSent: true,
				sessionId: initialChatSessionId ?? 'creation-session'
			})}>Minimize setup</button
	>
</section>
