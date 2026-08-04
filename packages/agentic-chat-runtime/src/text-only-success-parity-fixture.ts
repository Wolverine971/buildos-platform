// packages/agentic-chat-runtime/src/text-only-success-parity-fixture.ts
import type { AgenticChatParityRunV1 } from './parity';

export const AGENTIC_CHAT_TEXT_ONLY_SUCCESS_FIXTURE_V1 = {
	clockIso: '2026-08-04T12:00:00.000Z',
	request: {
		sessionId: '20000000-0000-4000-8000-000000000002',
		message: 'Snapshot this lifecycle',
		contextType: 'global'
	},
	response: {
		assistantText: 'Hello back.',
		finishedReason: 'stop',
		usage: { promptTokens: 8, completionTokens: 4, totalTokens: 12 }
	}
} as const;

/**
 * Legacy text-only success is the Phase 4 product-behavior golden. Adapters
 * must construct this projection from their real event and persistence seams;
 * they must not return this object directly.
 */
export const AGENTIC_CHAT_TEXT_ONLY_SUCCESS_GOLDEN_V1: AgenticChatParityRunV1 = {
	events: [
		{
			type: 'turn_phase',
			phase: 'stream',
			payload: {
				message: 'Request received. Preparing the workspace context...',
				turn_phase: 'acknowledged'
			}
		},
		{
			type: 'session',
			phase: 'stream',
			payload: {
				session: {
					agent_metadata: {},
					id: AGENTIC_CHAT_TEXT_ONLY_SUCCESS_FIXTURE_V1.request.sessionId,
					summary: null
				}
			}
		},
		{
			type: 'context_usage',
			phase: 'stream',
			payload: {
				usage: {
					estimatedTokens: 12,
					lastCompressedAt: null,
					lastCompression: null,
					status: 'ok',
					tokenBudget: 1000,
					tokensRemaining: 988,
					usagePercent: 1
				}
			}
		},
		{
			type: 'assistant_text',
			phase: 'llm',
			payload: { content: AGENTIC_CHAT_TEXT_ONLY_SUCCESS_FIXTURE_V1.response.assistantText }
		},
		{
			type: 'turn_phase',
			phase: 'stream',
			payload: { message: 'Finalizing the response...', turn_phase: 'finalizing' }
		},
		{
			type: 'last_turn_context',
			phase: 'finalize',
			payload: {
				context: {
					context_type: 'global',
					data_accessed: [],
					entities: {},
					summary: AGENTIC_CHAT_TEXT_ONLY_SUCCESS_FIXTURE_V1.response.assistantText,
					timestamp: '2026-05-24T00:00:00.000Z'
				}
			}
		},
		{
			type: 'timing',
			phase: 'finalize',
			payload: {
				timing: {
					assistant_persisted_at: AGENTIC_CHAT_TEXT_ONLY_SUCCESS_FIXTURE_V1.clockIso,
					bypassed_context_cache: false,
					cache_age_seconds: 0,
					cache_source: 'fresh_load',
					context_load_source: 'none',
					context_ready_at: AGENTIC_CHAT_TEXT_ONLY_SUCCESS_FIXTURE_V1.clockIso,
					done_emitted_at: AGENTIC_CHAT_TEXT_ONLY_SUCCESS_FIXTURE_V1.clockIso,
					finished_reason:
						AGENTIC_CHAT_TEXT_ONLY_SUCCESS_FIXTURE_V1.response.finishedReason,
					first_event_at: AGENTIC_CHAT_TEXT_ONLY_SUCCESS_FIXTURE_V1.clockIso,
					first_response_at: AGENTIC_CHAT_TEXT_ONLY_SUCCESS_FIXTURE_V1.clockIso,
					history_composed_at: AGENTIC_CHAT_TEXT_ONLY_SUCCESS_FIXTURE_V1.clockIso,
					history_compressed: false,
					history_for_model_count: 0,
					history_loaded_at: AGENTIC_CHAT_TEXT_ONLY_SUCCESS_FIXTURE_V1.clockIso,
					history_strategy: 'raw_history',
					phases: {
						assistant_persist_ms: 0,
						context_build_ms: 0,
						finalization_ms: 0,
						history_compose_ms: 0,
						history_load_ms: 0,
						prepared_prompt_consume_ms: 0,
						request_to_context_ready_ms: 0,
						response_generation_ms: 0,
						session_resolve_ms: 0,
						time_to_first_event_ms: 0,
						time_to_first_response_ms: 0,
						tool_selection_ms: 0,
						total_request_ms: 0,
						turn_admission_ms: 0
					},
					raw_history_count: 0,
					request_started_at: AGENTIC_CHAT_TEXT_ONLY_SUCCESS_FIXTURE_V1.clockIso,
					session_resolved_at: AGENTIC_CHAT_TEXT_ONLY_SUCCESS_FIXTURE_V1.clockIso
				}
			}
		},
		{
			type: 'done',
			phase: 'finalize',
			payload: {
				answer_source: 'model',
				completion_status: 'completed',
				finished_reason: AGENTIC_CHAT_TEXT_ONLY_SUCCESS_FIXTURE_V1.response.finishedReason,
				usage: {
					completion_tokens:
						AGENTIC_CHAT_TEXT_ONLY_SUCCESS_FIXTURE_V1.response.usage.completionTokens,
					prompt_tokens:
						AGENTIC_CHAT_TEXT_ONLY_SUCCESS_FIXTURE_V1.response.usage.promptTokens,
					total_tokens:
						AGENTIC_CHAT_TEXT_ONLY_SUCCESS_FIXTURE_V1.response.usage.totalTokens
				}
			}
		}
	],
	messages: [
		{
			content: AGENTIC_CHAT_TEXT_ONLY_SUCCESS_FIXTURE_V1.request.message,
			role: 'user'
		},
		{
			content: AGENTIC_CHAT_TEXT_ONLY_SUCCESS_FIXTURE_V1.response.assistantText,
			metadata: { answer_source: 'model', completion_status: 'completed' },
			role: 'assistant'
		}
	],
	toolExecutions: [],
	checkpoints: [],
	outcome: {
		assistant_message_linked: true,
		finished_reason: AGENTIC_CHAT_TEXT_ONLY_SUCCESS_FIXTURE_V1.response.finishedReason,
		status: 'completed',
		total_tokens: AGENTIC_CHAT_TEXT_ONLY_SUCCESS_FIXTURE_V1.response.usage.totalTokens
	},
	metadata: {
		admission: { context_type: 'global', status: 'running', user_message_linked: true },
		lifecycle_events: [
			{ event_type: 'turn_intent_resolved', phase: 'prompt' },
			{ event_type: 'prepared_prompt_cache_checked', phase: 'prompt' },
			{ event_type: 'turn_phase_changed', phase: 'stream' },
			{ event_type: 'turn_outcome_resolved', phase: 'finalize' },
			{ event_type: 'orchestration_interventions', phase: 'finalize' },
			{ event_type: 'done_emitted', phase: 'finalize' },
			{ event_type: 'prompt_snapshot_created', phase: 'prompt' }
		],
		prompt_snapshot_count: 1
	}
};
