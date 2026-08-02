// apps/worker/src/workers/agentic-chat/supabaseStreamPublisherAdapters.ts

import type {
	AgenticChatSemanticEventRpcResultV1,
	AgenticChatStreamDeliveryAckRpcResultV1,
	AgenticChatTextBatchFlushRpcResultV1,
	AgenticChatTextBatchInputV1
} from '@buildos/shared-types';
import type {
	AgenticChatBroadcastMessageV1,
	AgenticChatBroadcastPortV1,
	AgenticChatPersistencePortV1
} from './streamPublisher';

type RpcError = { code?: string; message: string };
type RpcResponse = PromiseLike<{ data: unknown; error: RpcError | null }>;

export class AgenticChatPersistenceRpcError extends Error {
	constructor(
		readonly rpcName: string,
		readonly code: string,
		message: string
	) {
		super(`${rpcName} failed${code ? ` (${code})` : ''}: ${message}`);
		this.name = 'AgenticChatPersistenceRpcError';
	}
}

export type AgenticChatSupabaseRpcClient = {
	rpc: (name: string, args: Record<string, unknown>) => RpcResponse;
};

export type AgenticChatRealtimeChannel = {
	send(message: { type: 'broadcast'; event: string; payload: unknown }): PromiseLike<string>;
};

export type AgenticChatRealtimeClient = {
	channel(
		topic: string,
		options: { config: { private: true; broadcast: { ack: true } } }
	): AgenticChatRealtimeChannel;
	removeChannel: (channel: AgenticChatRealtimeChannel) => PromiseLike<unknown>;
};

export class SupabaseAgenticChatPersistenceAdapter implements AgenticChatPersistencePortV1 {
	constructor(private readonly client: AgenticChatSupabaseRpcClient) {}

	flushTextBatches(
		inputs: AgenticChatTextBatchInputV1[]
	): Promise<AgenticChatTextBatchFlushRpcResultV1> {
		return this.call<AgenticChatTextBatchFlushRpcResultV1>('flush_agentic_chat_text_batches', {
			p_batches: inputs
		});
	}

	persistSemantic(input: {
		turn_run_id: string;
		queue_job_id: string;
		processing_token: string;
		execution_generation: number;
		transition_id: string;
		assistant_text: string;
		phase: string;
		event_type: string;
		projection: Record<string, unknown>;
		event_payload: Record<string, unknown>;
	}): Promise<AgenticChatSemanticEventRpcResultV1> {
		return this.call<AgenticChatSemanticEventRpcResultV1>(
			'persist_agentic_chat_semantic_event',
			{
				p_turn_run_id: input.turn_run_id,
				p_queue_job_id: input.queue_job_id,
				p_processing_token: input.processing_token,
				p_execution_generation: input.execution_generation,
				p_transition_id: input.transition_id,
				p_assistant_text: input.assistant_text,
				p_phase: input.phase,
				p_event_type: input.event_type,
				p_projection: input.projection,
				p_event_payload: input.event_payload
			}
		);
	}

	acknowledge(input: {
		turn_run_id: string;
		queue_job_id: string;
		processing_token: string;
		execution_generation: number;
		acknowledged_sequence: number;
	}): Promise<AgenticChatStreamDeliveryAckRpcResultV1> {
		return this.call<AgenticChatStreamDeliveryAckRpcResultV1>(
			'acknowledge_agentic_chat_stream_delivery',
			{
				p_turn_run_id: input.turn_run_id,
				p_queue_job_id: input.queue_job_id,
				p_processing_token: input.processing_token,
				p_execution_generation: input.execution_generation,
				p_acknowledged_sequence: input.acknowledged_sequence
			}
		);
	}

	private async call<T>(name: string, args: Record<string, unknown>): Promise<T> {
		const { data, error } = await this.client.rpc(name, args);
		if (error) {
			throw new AgenticChatPersistenceRpcError(name, error.code ?? '', error.message);
		}
		if (data === null || data === undefined) throw new Error(`${name} returned no receipt`);
		return data as T;
	}
}

export class SupabaseAgenticChatBroadcastAdapter implements AgenticChatBroadcastPortV1 {
	private readonly channels = new Map<string, AgenticChatRealtimeChannel>();

	constructor(
		private readonly client: AgenticChatRealtimeClient,
		private readonly maxCachedChannels = 256
	) {
		if (!Number.isSafeInteger(maxCachedChannels) || maxCachedChannels < 1) {
			throw new Error('maxCachedChannels must be a positive safe integer');
		}
	}

	async publish(message: AgenticChatBroadcastMessageV1): Promise<'sent' | 'failed'> {
		try {
			const channel = await this.channelFor(message.topic);
			return (await channel.send({
				type: 'broadcast',
				event: message.event,
				payload: message.payload
			})) === 'ok'
				? 'sent'
				: 'failed';
		} catch {
			return 'failed';
		}
	}

	async releaseTopic(topic: string): Promise<void> {
		const channel = this.channels.get(topic);
		if (!channel) return;
		this.channels.delete(topic);
		await this.client.removeChannel(channel);
	}

	async close(): Promise<void> {
		const channels = [...this.channels.values()];
		this.channels.clear();
		await Promise.all(channels.map((channel) => this.client.removeChannel(channel)));
	}

	private async channelFor(topic: string): Promise<AgenticChatRealtimeChannel> {
		const existing = this.channels.get(topic);
		if (existing) {
			this.channels.delete(topic);
			this.channels.set(topic, existing);
			return existing;
		}
		if (this.channels.size >= this.maxCachedChannels) {
			const oldest = this.channels.entries().next().value as
				| [string, AgenticChatRealtimeChannel]
				| undefined;
			if (oldest) {
				this.channels.delete(oldest[0]);
				await this.client.removeChannel(oldest[1]);
			}
		}
		const channel = this.client.channel(topic, {
			config: { private: true, broadcast: { ack: true } }
		});
		this.channels.set(topic, channel);
		return channel;
	}
}
