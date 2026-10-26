<!-- apps/web/src/lib/components/agent/ChatCaptureReceipts.test-harness.svelte -->
<script lang="ts">
	import {
		observeChatCaptureReceipts,
		type CaptureReceiptClient
	} from './agent-chat-capture-receipts.svelte';
	import type { UIMessage } from './agent-chat.types';
	import { upsertCaptureReceipt } from './capture-receipt';
	let {
		client,
		sessionId,
		onReceipts
	}: {
		client: CaptureReceiptClient;
		sessionId: string | null;
		onReceipts: (receipts: UIMessage[]) => void;
	} = $props();
	let receipts = $state.raw<UIMessage[]>([]);
	export function insertReceipt(receipt: UIMessage) {
		receipts = upsertCaptureReceipt(receipts, receipt);
		onReceipts(receipts);
	}
	observeChatCaptureReceipts({
		client: () => client,
		sessionId: () => sessionId,
		receipts: () => receipts,
		onReceipts: (rows) => {
			receipts = rows;
			onReceipts(rows);
		}
	});
</script>
