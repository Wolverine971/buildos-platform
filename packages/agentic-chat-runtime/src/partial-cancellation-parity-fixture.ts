// packages/agentic-chat-runtime/src/partial-cancellation-parity-fixture.ts

import type { AgenticChatParityRunV1 } from './parity';

export const AGENTIC_CHAT_PARTIAL_CANCELLATION_FIXTURE_V1 = {
	clockIso: '2026-08-04T12:05:00.000Z',
	request: {
		sessionId: '20000000-0000-4000-8000-000000000002',
		message: 'Stop after a partial response',
		contextType: 'global'
	},
	response: {
		assistantText: 'Partial answer.',
		finishedReason: 'cancelled',
		interruptedReason: 'cancelled',
		usage: null
	}
} as const;

/** Legacy partial cancellation is the Phase 4 cancellation product golden. */
export const AGENTIC_CHAT_PARTIAL_CANCELLATION_GOLDEN_V1: AgenticChatParityRunV1 = {
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
					id: AGENTIC_CHAT_PARTIAL_CANCELLATION_FIXTURE_V1.request.sessionId,
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
			payload: {
				content: AGENTIC_CHAT_PARTIAL_CANCELLATION_FIXTURE_V1.response.assistantText
			}
		},
		{
			type: 'last_turn_context',
			phase: 'finalize',
			payload: {
				context: {
					context_type: 'global',
					data_accessed: [],
					entities: {},
					summary: AGENTIC_CHAT_PARTIAL_CANCELLATION_FIXTURE_V1.response.assistantText,
					timestamp: AGENTIC_CHAT_PARTIAL_CANCELLATION_FIXTURE_V1.clockIso
				}
			}
		},
		{
			type: 'timing',
			phase: 'finalize',
			payload: {
				timing: {
					assistant_persisted_at: AGENTIC_CHAT_PARTIAL_CANCELLATION_FIXTURE_V1.clockIso,
					bypassed_context_cache: false,
					cache_age_seconds: 0,
					cache_source: 'fresh_load',
					context_load_source: 'none',
					context_ready_at: AGENTIC_CHAT_PARTIAL_CANCELLATION_FIXTURE_V1.clockIso,
					done_emitted_at: AGENTIC_CHAT_PARTIAL_CANCELLATION_FIXTURE_V1.clockIso,
					finished_reason:
						AGENTIC_CHAT_PARTIAL_CANCELLATION_FIXTURE_V1.response.finishedReason,
					first_event_at: AGENTIC_CHAT_PARTIAL_CANCELLATION_FIXTURE_V1.clockIso,
					first_response_at: AGENTIC_CHAT_PARTIAL_CANCELLATION_FIXTURE_V1.clockIso,
					history_composed_at: AGENTIC_CHAT_PARTIAL_CANCELLATION_FIXTURE_V1.clockIso,
					history_compressed: false,
					history_for_model_count: 0,
					history_loaded_at: AGENTIC_CHAT_PARTIAL_CANCELLATION_FIXTURE_V1.clockIso,
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
					request_started_at: AGENTIC_CHAT_PARTIAL_CANCELLATION_FIXTURE_V1.clockIso,
					session_resolved_at: AGENTIC_CHAT_PARTIAL_CANCELLATION_FIXTURE_V1.clockIso
				}
			}
		},
		{
			type: 'done',
			phase: 'finalize',
			payload: {
				finished_reason:
					AGENTIC_CHAT_PARTIAL_CANCELLATION_FIXTURE_V1.response.finishedReason,
				usage: null
			}
		}
	],
	messages: [
		{
			content: AGENTIC_CHAT_PARTIAL_CANCELLATION_FIXTURE_V1.request.message,
			role: 'user'
		},
		{
			content: AGENTIC_CHAT_PARTIAL_CANCELLATION_FIXTURE_V1.response.assistantText,
			metadata: {
				finished_reason:
					AGENTIC_CHAT_PARTIAL_CANCELLATION_FIXTURE_V1.response.finishedReason,
				interrupted: true,
				interrupted_reason:
					AGENTIC_CHAT_PARTIAL_CANCELLATION_FIXTURE_V1.response.interruptedReason,
				partial_tokens: 4
			},
			role: 'assistant'
		}
	],
	toolExecutions: [],
	checkpoints: [],
	outcome: {
		assistant_message_linked: true,
		finished_reason: AGENTIC_CHAT_PARTIAL_CANCELLATION_FIXTURE_V1.response.finishedReason,
		status: 'cancelled',
		total_tokens: null
	},
	metadata: {
		admission: { context_type: 'global', status: 'running', user_message_linked: true },
		lifecycle_events: [
			{ event_type: 'turn_intent_resolved', phase: 'prompt' },
			{ event_type: 'prepared_prompt_cache_checked', phase: 'prompt' },
			{ event_type: 'turn_outcome_resolved', phase: 'finalize' },
			{ event_type: 'orchestration_interventions', phase: 'finalize' },
			{ event_type: 'done_emitted', phase: 'finalize' },
			{ event_type: 'prompt_snapshot_created', phase: 'prompt' }
		],
		prompt_snapshot_count: 1
	}
};
