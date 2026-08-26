// packages/agentic-chat-runtime/src/mutating-tool-parity-fixture.ts
import type { AgenticChatParityRunV1 } from './parity';

const PROJECT_ID = 'da000000-0000-4000-8000-000000000001';
const TASK_ID = 'db000000-0000-4000-8000-000000000002';

export const AGENTIC_CHAT_MUTATING_TOOL_FIXTURE_V1 = {
	clockIso: '2026-08-04T12:00:00.000Z',
	request: {
		sessionId: '20000000-0000-4000-8000-000000000002',
		message: 'Rename the fixture task and move it into progress',
		contextType: 'project',
		entityId: PROJECT_ID
	},
	tool: {
		logicalOperationId: 'c3000000-0000-4000-8000-00000000003c',
		callId: 'mutation-tool-call-1',
		name: 'update_onto_task',
		operationName: 'onto.task.update',
		arguments: {
			project_id: PROJECT_ID,
			task_id: TASK_ID,
			title: 'Updated fixture task',
			state_key: 'in_progress'
		},
		result: {
			task: {
				id: TASK_ID,
				project_id: PROJECT_ID,
				title: 'Updated fixture task',
				description: 'Deterministic parity fixture.',
				type_key: 'task.default',
				state_key: 'in_progress',
				priority: 2,
				start_at: null,
				due_at: null,
				completed_at: null,
				props: {}
			},
			message: 'Task updated successfully.',
			requires_user_action: false
		},
		executionTimeMs: null,
		tokensConsumed: null,
		requiresUserAction: false,
		toolCategory: 'ontology_action',
		affectedEntities: [
			{
				kind: 'task',
				id: TASK_ID,
				title: 'Updated fixture task',
				projectId: PROJECT_ID,
				operation: 'updated',
				url: `/projects/${PROJECT_ID}?entity=task&entity_id=${TASK_ID}`
			}
		],
		downstreamIdempotencySupported: false
	},
	response: {
		assistantText: 'Updated the fixture task and moved it into progress.',
		finishedReason: 'stop',
		usage: { promptTokens: 10, completionTokens: 6, totalTokens: 16 }
	}
} as const;

/**
 * Legacy one-write success. The worker must match this contract everywhere
 * except its runtime-owned effect identity and replay evidence.
 */
export const AGENTIC_CHAT_MUTATING_TOOL_GOLDEN_V1: AgenticChatParityRunV1 = {
	events: [
		{
			type: 'turn_phase',
			phase: 'stream',
			payload: {
				message: 'Request received. Preparing the project context...',
				turn_phase: 'acknowledged'
			}
		},
		{
			type: 'session',
			phase: 'stream',
			payload: {
				session: {
					agent_metadata: {},
					id: AGENTIC_CHAT_MUTATING_TOOL_FIXTURE_V1.request.sessionId,
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
				activity_visibility: 'activity_log',
				contextType: 'project',
				details: 'Planning the first step...',
				state: 'thinking'
			}
		},
		{
			type: 'tool_call',
			phase: 'tool',
			payload: {
				tool_call: {
					function: {
						arguments: JSON.stringify(
							AGENTIC_CHAT_MUTATING_TOOL_FIXTURE_V1.tool.arguments
						),
						name: AGENTIC_CHAT_MUTATING_TOOL_FIXTURE_V1.tool.name
					},
					id: AGENTIC_CHAT_MUTATING_TOOL_FIXTURE_V1.tool.callId,
					type: 'function'
				}
			}
		},
		{
			type: 'tool_result',
			phase: 'tool',
			payload: {
				result: {
					affected_entities: [
						...AGENTIC_CHAT_MUTATING_TOOL_FIXTURE_V1.tool.affectedEntities
					],
					gateway_op: AGENTIC_CHAT_MUTATING_TOOL_FIXTURE_V1.tool.operationName,
					requires_user_action:
						AGENTIC_CHAT_MUTATING_TOOL_FIXTURE_V1.tool.requiresUserAction,
					result: AGENTIC_CHAT_MUTATING_TOOL_FIXTURE_V1.tool.result,
					success: true,
					tool_category: AGENTIC_CHAT_MUTATING_TOOL_FIXTURE_V1.tool.toolCategory,
					tool_call_id: AGENTIC_CHAT_MUTATING_TOOL_FIXTURE_V1.tool.callId,
					tool_name: AGENTIC_CHAT_MUTATING_TOOL_FIXTURE_V1.tool.name
				}
			}
		},
		{
			type: 'assistant_text',
			phase: 'llm',
			payload: { content: AGENTIC_CHAT_MUTATING_TOOL_FIXTURE_V1.response.assistantText }
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
					context_type: 'project',
					data_accessed: [AGENTIC_CHAT_MUTATING_TOOL_FIXTURE_V1.tool.name],
					entities: {
						project_id: PROJECT_ID,
						projects: [{ id: PROJECT_ID }],
						task_ids: [TASK_ID],
						tasks: [
							{
								description: 'Deterministic parity fixture.',
								id: TASK_ID,
								name: 'Updated fixture task'
							}
						]
					},
					summary: AGENTIC_CHAT_MUTATING_TOOL_FIXTURE_V1.response.assistantText,
					timestamp: AGENTIC_CHAT_MUTATING_TOOL_FIXTURE_V1.clockIso
				}
			}
		},
		{
			type: 'timing',
			phase: 'finalize',
			payload: {
				timing: {
					assistant_persisted_at: AGENTIC_CHAT_MUTATING_TOOL_FIXTURE_V1.clockIso,
					bypassed_context_cache: false,
					cache_age_seconds: 0,
					cache_source: 'fresh_load',
					context_load_source: 'none',
					context_ready_at: AGENTIC_CHAT_MUTATING_TOOL_FIXTURE_V1.clockIso,
					done_emitted_at: AGENTIC_CHAT_MUTATING_TOOL_FIXTURE_V1.clockIso,
					finished_reason: AGENTIC_CHAT_MUTATING_TOOL_FIXTURE_V1.response.finishedReason,
					first_event_at: AGENTIC_CHAT_MUTATING_TOOL_FIXTURE_V1.clockIso,
					first_response_at: AGENTIC_CHAT_MUTATING_TOOL_FIXTURE_V1.clockIso,
					history_composed_at: AGENTIC_CHAT_MUTATING_TOOL_FIXTURE_V1.clockIso,
					history_compressed: false,
					history_for_model_count: 0,
					history_loaded_at: AGENTIC_CHAT_MUTATING_TOOL_FIXTURE_V1.clockIso,
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
					request_started_at: AGENTIC_CHAT_MUTATING_TOOL_FIXTURE_V1.clockIso,
					session_resolved_at: AGENTIC_CHAT_MUTATING_TOOL_FIXTURE_V1.clockIso
				}
			}
		},
		{
			type: 'done',
			phase: 'finalize',
			payload: {
				answer_source: 'model',
				completion_status: 'completed',
				finished_reason: AGENTIC_CHAT_MUTATING_TOOL_FIXTURE_V1.response.finishedReason,
				usage: {
					completion_tokens:
						AGENTIC_CHAT_MUTATING_TOOL_FIXTURE_V1.response.usage.completionTokens,
					prompt_tokens:
						AGENTIC_CHAT_MUTATING_TOOL_FIXTURE_V1.response.usage.promptTokens,
					total_tokens: AGENTIC_CHAT_MUTATING_TOOL_FIXTURE_V1.response.usage.totalTokens
				}
			}
		}
	],
	messages: [
		{ content: AGENTIC_CHAT_MUTATING_TOOL_FIXTURE_V1.request.message, role: 'user' },
		{
			content: AGENTIC_CHAT_MUTATING_TOOL_FIXTURE_V1.response.assistantText,
			metadata: { answer_source: 'model', completion_status: 'completed' },
			role: 'assistant'
		}
	],
	toolExecutions: [
		{
			affected_entities: [...AGENTIC_CHAT_MUTATING_TOOL_FIXTURE_V1.tool.affectedEntities],
			arguments: AGENTIC_CHAT_MUTATING_TOOL_FIXTURE_V1.tool.arguments,
			effect_id: null,
			execution_time_ms: AGENTIC_CHAT_MUTATING_TOOL_FIXTURE_V1.tool.executionTimeMs,
			gateway_op: AGENTIC_CHAT_MUTATING_TOOL_FIXTURE_V1.tool.operationName,
			message_linked: true,
			provider_tool_call_id: AGENTIC_CHAT_MUTATING_TOOL_FIXTURE_V1.tool.callId,
			requires_user_action: AGENTIC_CHAT_MUTATING_TOOL_FIXTURE_V1.tool.requiresUserAction,
			result: AGENTIC_CHAT_MUTATING_TOOL_FIXTURE_V1.tool.result,
			sequence_index: 1,
			success: true,
			tokens_consumed: AGENTIC_CHAT_MUTATING_TOOL_FIXTURE_V1.tool.tokensConsumed,
			tool_category: AGENTIC_CHAT_MUTATING_TOOL_FIXTURE_V1.tool.toolCategory,
			tool_name: AGENTIC_CHAT_MUTATING_TOOL_FIXTURE_V1.tool.name
		}
	],
	checkpoints: [],
	outcome: {
		assistant_message_linked: true,
		finished_reason: AGENTIC_CHAT_MUTATING_TOOL_FIXTURE_V1.response.finishedReason,
		status: 'completed',
		tool_call_count: 1,
		tool_round_count: 1,
		total_tokens: AGENTIC_CHAT_MUTATING_TOOL_FIXTURE_V1.response.usage.totalTokens
	},
	metadata: {
		admission: { context_type: 'project', status: 'running', user_message_linked: true },
		lifecycle_events: [
			{ event_type: 'turn_intent_resolved', phase: 'prompt' },
			{ event_type: 'tool_surface_materialized', phase: 'tool' },
			{ event_type: 'prepared_prompt_cache_checked', phase: 'prompt' },
			{ event_type: 'tool_call_emitted', phase: 'tool' },
			{ event_type: 'first_tool_call_planning_cue_emitted', phase: 'stream' },
			{ event_type: 'tool_result_received', phase: 'tool' },
			{ event_type: 'turn_phase_changed', phase: 'stream' },
			{ event_type: 'turn_outcome_resolved', phase: 'finalize' },
			{ event_type: 'orchestration_interventions', phase: 'finalize' },
			{ event_type: 'done_emitted', phase: 'finalize' },
			{ event_type: 'prompt_snapshot_created', phase: 'prompt' }
		],
		prompt_snapshot_count: 1
	}
};
