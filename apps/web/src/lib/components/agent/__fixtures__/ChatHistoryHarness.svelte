<!-- apps/web/src/lib/components/agent/__fixtures__/ChatHistoryHarness.svelte -->
<script lang="ts">
	import { untrack } from 'svelte';
	import { createChatHistory } from '../agent-chat-history.svelte';
	let {
		visible = true,
		embedded = false,
		sessionId = null,
		instanceId = 'chat',
		onBack = () => {},
		onClosed = () => {}
	}: {
		visible?: boolean;
		embedded?: boolean;
		sessionId?: string | null;
		instanceId?: string;
		onBack?: () => void;
		onClosed?: () => void;
	} = $props();
	const controller = createChatHistory({
		instanceId: untrack(() => instanceId),
		isVisible: () => visible,
		isEmbedded: () => embedded,
		sessionId: () => sessionId,
		onBack: () => onBack()
	});
</script>
<button onclick={() => controller.close(() => onClosed())}>Close {instanceId}</button>
