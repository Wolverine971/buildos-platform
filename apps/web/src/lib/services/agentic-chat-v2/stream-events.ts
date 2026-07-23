// apps/web/src/lib/services/agentic-chat-v2/stream-events.ts
import type {
	AgentSSEMessage,
	ChatContextType,
	ChatToolCall,
	ChatToolResult,
	ContextShiftPayload,
	ContextUsageSnapshot
} from '@buildos/shared-types';
import { SSEResponse } from '$lib/utils/sse-response';
import { createLogger } from '$lib/utils/logger';
import { normalizeFastContextType } from './scope';
import type { SkillActivityEvent } from './skill-activity';

const logger = createLogger('API:AgentStreamV2');

export type AgentStreamEventPhase = 'prompt' | 'llm' | 'tool' | 'stream' | 'finalize';
export type AgentChatSSEStream = ReturnType<typeof SSEResponse.createChatStream>;

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

export function createSequencedAgentStream(params: {
	baseStream: AgentChatSSEStream;
	streamRunId: string;
	clientTurnId: string | null | undefined;
	getTurnRunId: () => string | null;
}): AgentChatSSEStream {
	let sequenceIndex = 0;

	return {
		response: params.baseStream.response,
		sendMessage: async (
			payload: AgentSSEMessage | (Record<string, unknown> & { type: string })
		) => {
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
	agentStream: AgentChatSSEStream,
	usage: ContextUsageSnapshot,
	options: {
		onError?: (error: unknown) => void;
		onMessageSent?: () => void;
	} = {}
): void {
	void agentStream
		.sendMessage({ type: 'context_usage', usage })
		.then(() => {
			options.onMessageSent?.();
		})
		.catch((error) => {
			logger.warn('Failed to emit context usage', { error });
			options.onError?.(error);
		});
}

export function emitToolCall(
	agentStream: AgentChatSSEStream,
	toolCall: ChatToolCall,
	options: {
		onError?: (error: unknown) => void;
		onMessageSent?: () => void;
	} = {}
): void {
	void agentStream
		.sendMessage({ type: 'tool_call', tool_call: toolCall })
		.then(() => {
			options.onMessageSent?.();
		})
		.catch((error) => {
			logger.warn('Failed to emit tool_call', { error, toolCall });
			options.onError?.(error);
		});
}

export function emitSkillActivity(
	agentStream: AgentChatSSEStream,
	event: SkillActivityEvent,
	options: {
		onError?: (error: unknown) => void;
		onMessageSent?: () => void;
	} = {}
): void {
	void agentStream
		.sendMessage(event)
		.then(() => {
			options.onMessageSent?.();
		})
		.catch((error) => {
			logger.warn('Failed to emit skill_activity', { error, event });
			options.onError?.(error);
		});
}

const CONTEXT_SHIFT_ENTITY_TYPES: ContextShiftPayload['entity_type'][] = [
	'workspace',
	'project',
	'task',
	'plan',
	'goal',
	'document',
	'milestone',
	'risk'
];

const CONTEXT_SHIFT_NESTED_KEYS = ['result', 'data', 'payload'];

function isContextShiftEntityType(
	value: string | null | undefined
): value is ContextShiftPayload['entity_type'] {
	if (!value) return false;
	return CONTEXT_SHIFT_ENTITY_TYPES.includes(value as ContextShiftPayload['entity_type']);
}

function extractContextShiftObject(value: unknown, depth = 0): Record<string, unknown> | null {
	if (!value || typeof value !== 'object' || depth > 4) return null;

	const record = value as Record<string, unknown>;
	if (record.context_shift && typeof record.context_shift === 'object') {
		return record.context_shift as Record<string, unknown>;
	}

	for (const key of CONTEXT_SHIFT_NESTED_KEYS) {
		const nested = record[key];
		const extracted = extractContextShiftObject(nested, depth + 1);
		if (extracted) {
			return extracted;
		}
	}

	return null;
}

export function extractContextShiftPayload(result: ChatToolResult): ContextShiftPayload | null {
	const contextShift = extractContextShiftObject(result);
	if (!contextShift) return null;

	const rawContext =
		typeof contextShift.new_context === 'string' ? contextShift.new_context.trim() : '';
	const rawEntityId =
		typeof contextShift.entity_id === 'string' ? contextShift.entity_id.trim() : '';
	if (!rawContext) return null;

	const normalizedContext = normalizeFastContextType(rawContext as ChatContextType);
	const isGlobalContext = normalizedContext === 'global' || normalizedContext === 'general';
	if (!isGlobalContext && !rawEntityId) return null;
	const entityName =
		typeof contextShift.entity_name === 'string' && contextShift.entity_name.trim()
			? contextShift.entity_name.trim()
			: isGlobalContext
				? 'Workspace'
				: 'Project';
	const entityType =
		typeof contextShift.entity_type === 'string' &&
		isContextShiftEntityType(contextShift.entity_type)
			? contextShift.entity_type
			: isGlobalContext
				? 'workspace'
				: 'project';
	const message =
		typeof contextShift.message === 'string' && contextShift.message.trim()
			? contextShift.message.trim()
			: isGlobalContext
				? 'Zoomed out to workspace context.'
				: `Context updated to ${entityName}`;

	return {
		new_context: normalizedContext,
		entity_id: rawEntityId || null,
		entity_name: entityName,
		entity_type: entityType,
		message
	};
}

export async function emitContextShift(
	agentStream: AgentChatSSEStream,
	contextShift: ContextShiftPayload,
	options: {
		onError?: (error: unknown) => void;
		onMessageSent?: () => void;
	} = {}
): Promise<void> {
	try {
		await agentStream.sendMessage({ type: 'context_shift', context_shift: contextShift });
		options.onMessageSent?.();
	} catch (error) {
		logger.warn('Failed to emit context_shift', { error, contextShift });
		options.onError?.(error);
	}
}
