// packages/agentic-chat-runtime/src/supervisor-question-parity-fixture.ts

import type { AgenticChatParityRunV1 } from './parity';

const TURN_RUN_ID = '30000000-0000-4000-8000-000000000003';
const SESSION_ID = '20000000-0000-4000-8000-000000000002';
const USER_ID = '10000000-0000-4000-8000-000000000001';

const digest = {
	turnRunId: TURN_RUN_ID,
	sessionId: SESSION_ID,
	userId: USER_ID,
	contextType: 'global',
	entityId: null,
	projectId: null,
	userMessage: 'Update the task',
	elapsedMs: 12_000,
	msSinceVisibleText: 8_000,
	assistantTextChars: 0,
	finalCandidateChars: 0,
	llmPassCount: 3,
	toolRoundCount: 2,
	toolCallCount: 2,
	validationFailureCount: 2,
	recentTools: [
		{
			sequence: 1,
			toolName: 'update_onto_task',
			success: false,
			errorClass: 'validation',
			resultSummary: 'missing task_id'
		}
	],
	progress: {
		successfulWrites: 0,
		failedWrites: 2,
		readRounds: 0,
		lowNoveltyReadRounds: 0,
		repeatedToolPatternCount: 1,
		repeatedFailureCount: 2,
		discoveredEntityCount: 0
	},
	risks: ['repeated_failures']
};

const resumeContext = {
	missing_field: 'task_id',
	last_failed_tool: 'update_onto_task',
	instruction: 'Continue from this checkpoint after the user answers.'
} as const;

const decision = {
	action: 'ask_user',
	question: 'Which exact task should I update?',
	reason: 'repeated_validation_failures',
	checkpoint: { digest, resumeContext }
} as const;

export const AGENTIC_CHAT_SUPERVISOR_QUESTION_FIXTURE_V1 = {
	clockIso: '2026-08-04T12:00:00.000Z',
	request: {
		sessionId: SESSION_ID,
		userId: USER_ID,
		turnRunId: TURN_RUN_ID,
		message: 'Update the task',
		contextType: 'global'
	},
	response: {
		question: decision.question,
		finishedReason: 'supervisor_question',
		usage: { promptTokens: 9, completionTokens: 3, totalTokens: 12 }
	},
	decision,
	checkpoint: {
		checkpointType: 'supervisor_question',
		status: 'active',
		reason: decision.reason,
		question: decision.question,
		digest,
		resumeContext,
		supervisorDecision: decision
	}
} as const;

/**
 * Legacy supervisor clarification terminal captured at the route's real
 * persistence/SSE seams. Worker-only fence identity is deliberately projected
 * outside this semantic row and is independently pinned by its SQL contract.
 */
export const AGENTIC_CHAT_SUPERVISOR_QUESTION_GOLDEN_V1: AgenticChatParityRunV1 = {
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
					id: SESSION_ID,
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
			type: 'agent_state',
			phase: 'stream',
			payload: {
				contextType: 'global',
				details: 'Waiting on your direction to continue.',
				state: 'waiting_on_user'
			}
		},
		{
			type: 'assistant_text',
			phase: 'llm',
			payload: { content: decision.question }
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
					summary: decision.question,
					timestamp: AGENTIC_CHAT_SUPERVISOR_QUESTION_FIXTURE_V1.clockIso
				}
			}
		},
		{
			type: 'timing',
			phase: 'finalize',
			payload: {
				timing: {
					assistant_persisted_at: AGENTIC_CHAT_SUPERVISOR_QUESTION_FIXTURE_V1.clockIso,
					bypassed_context_cache: false,
					cache_age_seconds: 0,
					cache_source: 'fresh_load',
					context_load_source: 'none',
					context_ready_at: AGENTIC_CHAT_SUPERVISOR_QUESTION_FIXTURE_V1.clockIso,
					done_emitted_at: AGENTIC_CHAT_SUPERVISOR_QUESTION_FIXTURE_V1.clockIso,
					finished_reason: 'supervisor_question',
					first_event_at: AGENTIC_CHAT_SUPERVISOR_QUESTION_FIXTURE_V1.clockIso,
					first_response_at: AGENTIC_CHAT_SUPERVISOR_QUESTION_FIXTURE_V1.clockIso,
					history_composed_at: AGENTIC_CHAT_SUPERVISOR_QUESTION_FIXTURE_V1.clockIso,
					history_compressed: false,
					history_for_model_count: 0,
					history_loaded_at: AGENTIC_CHAT_SUPERVISOR_QUESTION_FIXTURE_V1.clockIso,
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
					request_started_at: AGENTIC_CHAT_SUPERVISOR_QUESTION_FIXTURE_V1.clockIso,
					session_resolved_at: AGENTIC_CHAT_SUPERVISOR_QUESTION_FIXTURE_V1.clockIso
				}
			}
		},
		{
			type: 'done',
			phase: 'finalize',
			payload: {
				answer_source: 'model',
				completion_status: 'completed',
				finished_reason: 'supervisor_question',
				usage: {
					completion_tokens: 3,
					prompt_tokens: 9,
					total_tokens: 12
				}
			}
		}
	],
	messages: [
		{ content: 'Update the task', role: 'user' },
		{
			content: decision.question,
			metadata: {
				answer_source: 'model',
				completion_status: 'completed',
				supervisor_question_checkpoint: { failed: false }
			},
			role: 'assistant'
		}
	],
	toolExecutions: [],
	checkpoints: [
		{
			checkpoint_type: 'supervisor_question',
			digest,
			question: decision.question,
			reason: decision.reason,
			resume_context: resumeContext,
			status: 'active',
			supervisor_decision: decision
		}
	],
	outcome: {
		assistant_message_linked: true,
		finished_reason: 'supervisor_question',
		status: 'completed',
		tool_call_count: 0,
		tool_round_count: 0,
		total_tokens: 12
	},
	metadata: { checkpoint_count: 1 }
};
