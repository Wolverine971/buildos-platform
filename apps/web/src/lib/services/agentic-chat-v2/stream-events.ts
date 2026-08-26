// apps/web/src/lib/services/agentic-chat-v2/stream-events.ts
import type {
	ChatToolCall,
	ContextShiftPayload,
	ContextUsageSnapshot
} from '@buildos/shared-types';
import type {
	AgenticChatEventSinkPort,
	AgenticChatRuntimeEvent
} from '@buildos/agentic-chat-runtime';
import { SSEResponse } from '$lib/utils/sse-response';
import { createLogger } from '$lib/utils/logger';
import type { SkillActivityEvent } from './skill-activity';

export { extractContextShiftPayload } from '@buildos/agentic-chat-runtime/loop';

const logger = createLogger('API:AgentStreamV2');

export type AgentStreamEventPhase = 'prompt' | 'llm' | 'tool' | 'stream' | 'finalize';
export type AgentChatSSEStream = ReturnType<typeof SSEResponse.createChatStream>;
export type AgentChatEventPayload = AgenticChatRuntimeEvent;
export type AgentChatEventSink = AgenticChatEventSinkPort<AgentChatEventPayload> & {
	response: AgentChatSSEStream['response'];
	close(): Promise<void>;
};

export function resolveAgentStreamEventPhase(eventType: string): AgentStreamEventPhase {
	switch (eventType) {
		case 'text':
		case 'text_delta':
		case 'clarifying_questions':
			return 'llm';
		case 'tool_call':
		case 'tool_result':
		case 'skill_activity':
		case 'context_shift':
		case 'operation':
			return 'tool';
		case 'timing':
		case 'done':
		case 'error':
		case 'last_turn_context':
			return 'finalize';
		case 'context_usage':
		case 'session':
		case 'ontology_loaded':
		case 'focus_active':
		case 'focus_changed':
		case 'agent_state':
		case 'turn_phase':
		case 'draft_update':
		case 'dimension_update':
		case 'phase_update':
		case 'queue_update':
		default:
			return 'stream';
	}
}

export function createLegacySseEventSink(params: {
	baseStream: AgentChatSSEStream;
	streamRunId: string;
	clientTurnId: string | null | undefined;
	getTurnRunId: () => string | null;
}): AgentChatEventSink {
	let sequenceIndex = 0;

	return {
		response: params.baseStream.response,
		emit: async (payload: AgentChatEventPayload) => {
			const eventType = typeof payload.type === 'string' ? payload.type : 'message';
			const nextSequenceIndex = ++sequenceIndex;
			const turnRunId = params.getTurnRunId();
			const eventId = `${params.streamRunId}:${nextSequenceIndex}`;
			const sequencedPayload = {
				...payload,
				event_id: eventId,
				stream_run_id: params.streamRunId,
				client_turn_id: params.clientTurnId ?? undefined,
				turn_run_id: turnRunId,
				sequence_index: nextSequenceIndex,
				phase: resolveAgentStreamEventPhase(eventType),
				event_type: eventType,
				durable: Boolean(turnRunId)
			};
			await params.baseStream.sendMessage(sequencedPayload);
		},
		close: async () => {
			await params.baseStream.close();
		}
	};
}

export function emitContextUsage(
	eventSink: AgentChatEventSink,
	usage: ContextUsageSnapshot,
	options: {
		onError?: (error: unknown) => void;
		onMessageSent?: () => void;
	} = {}
): void {
	void eventSink
		.emit({ type: 'context_usage', usage })
		.then(() => {
			options.onMessageSent?.();
		})
		.catch((error) => {
			logger.warn('Failed to emit context usage', { error });
			options.onError?.(error);
		});
}

export function emitToolCall(
	eventSink: AgentChatEventSink,
	toolCall: ChatToolCall,
	options: {
		onError?: (error: unknown) => void;
		onMessageSent?: () => void;
	} = {}
): void {
	void eventSink
		.emit({ type: 'tool_call', tool_call: toolCall })
		.then(() => {
			options.onMessageSent?.();
		})
		.catch((error) => {
			logger.warn('Failed to emit tool_call', { error, toolCall });
			options.onError?.(error);
		});
}

export function emitSkillActivity(
	eventSink: AgentChatEventSink,
	event: SkillActivityEvent,
	options: {
		onError?: (error: unknown) => void;
		onMessageSent?: () => void;
	} = {}
): void {
	void eventSink
		.emit(event)
		.then(() => {
			options.onMessageSent?.();
		})
		.catch((error) => {
			logger.warn('Failed to emit skill_activity', { error, event });
			options.onError?.(error);
		});
}

export async function emitContextShift(
	eventSink: AgentChatEventSink,
	contextShift: ContextShiftPayload,
	options: {
		onError?: (error: unknown) => void;
		onMessageSent?: () => void;
	} = {}
): Promise<void> {
	try {
		await eventSink.emit({ type: 'context_shift', context_shift: contextShift });
		options.onMessageSent?.();
	} catch (error) {
		logger.warn('Failed to emit context_shift', { error, contextShift });
		options.onError?.(error);
	}
}
