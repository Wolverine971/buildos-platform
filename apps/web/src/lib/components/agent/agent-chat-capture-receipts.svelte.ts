// apps/web/src/lib/components/agent/agent-chat-capture-receipts.svelte.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import { untrack } from 'svelte';
import type { UIMessage } from './agent-chat.types';
import {
	buildCaptureReceiptUIMessage,
	CAPTURE_RECEIPT_COLUMNS,
	upsertCaptureReceipt,
	type CaptureReceiptRow
} from './capture-receipt';

export type CaptureReceiptClient = Pick<
	SupabaseClient<Database>,
	'channel' | 'from' | 'removeChannel'
>;

/** Attach once during component setup; Svelte owns session-change and unmount cleanup. */
export function observeChatCaptureReceipts(deps: {
	client: () => CaptureReceiptClient | null;
	sessionId: () => string | null;
	receipts: () => UIMessage[];
	onReceipts: (receipts: UIMessage[]) => void;
}) {
	$effect(() => {
		const sid = deps.sessionId();
		const client = deps.client();
		untrack(() => deps.onReceipts([]));
		if (!client || !sid) return;
		let disposed = false;
		const apply = (row: unknown) => {
			if (disposed || deps.sessionId() !== sid) return;
			const record = row as Partial<CaptureReceiptRow> | null;
			if (record?.session_id !== sid) return;
			const receipt = buildCaptureReceiptUIMessage(record);
			if (receipt) {
				// Merge into the owner's latest state, including receipts inserted elsewhere.
				// A synchronous delivery must not make receipt changes restart this effect.
				untrack(() => deps.onReceipts(upsertCaptureReceipt(deps.receipts(), receipt)));
			}
		};
		const channel = client.channel(`chat-capture-receipts:${sid}`);
		channel.on(
			'postgres_changes',
			{
				event: '*',
				schema: 'public',
				table: 'chat_capture_checkpoints',
				filter: `session_id=eq.${sid}`
			},
			(payload) => apply(payload.new)
		);
		void channel.subscribe();
		void client
			.from('chat_capture_checkpoints')
			.select(CAPTURE_RECEIPT_COLUMNS)
			.eq('session_id', sid)
			.in('status', ['captured', 'undone'])
			.order('created_at', { ascending: true })
			.limit(50)
			.then(({ data }) => {
				for (const row of data ?? []) apply(row);
			});
		return () => {
			disposed = true;
			void client.removeChannel(channel);
		};
	});
}
