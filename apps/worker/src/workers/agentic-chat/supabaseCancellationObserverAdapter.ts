// apps/worker/src/workers/agentic-chat/supabaseCancellationObserverAdapter.ts

import type {
	AgenticChatCancellationObservationInputV1,
	AgenticChatCancellationObservationRpcResultV1
} from '@buildos/shared-types';
import type { AgenticChatCancellationObservationPortV1 } from './cancellationObserver';
import type { AgenticChatSupabaseRpcClient } from './supabaseStreamPublisherAdapters';

export class AgenticChatCancellationObservationRpcError extends Error {
	constructor(
		readonly code: string,
		message: string
	) {
		super(
			`observe_agentic_chat_turn_cancellations failed${code ? ` (${code})` : ''}: ${message}`
		);
		this.name = 'AgenticChatCancellationObservationRpcError';
	}
}

export class SupabaseAgenticChatCancellationObservationAdapter
	implements AgenticChatCancellationObservationPortV1
{
	constructor(private readonly client: AgenticChatSupabaseRpcClient) {}

	async observe(
		inputs: AgenticChatCancellationObservationInputV1[]
	): Promise<AgenticChatCancellationObservationRpcResultV1> {
		const { data, error } = await this.client.rpc('observe_agentic_chat_turn_cancellations', {
			p_turns: inputs
		});
		if (error) {
			throw new AgenticChatCancellationObservationRpcError(error.code ?? '', error.message);
		}
		if (!Array.isArray(data)) {
			throw new Error('observe_agentic_chat_turn_cancellations returned a non-array receipt');
		}
		return data as AgenticChatCancellationObservationRpcResultV1;
	}
}
