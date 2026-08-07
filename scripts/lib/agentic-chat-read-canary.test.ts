// scripts/lib/agentic-chat-read-canary.test.ts

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	type AgenticChatReadCanaryEvidence,
	parseAgenticChatReadCanaryTurnIdArgument,
	verifyAgenticChatReadCanaryEvidence
} from './agentic-chat-read-canary.js';

const TURN_ID = 'a0000000-0000-4000-8000-000000000001';
const SESSION_ID = 'b0000000-0000-4000-8000-000000000001';
const USER_ID = 'c0000000-0000-4000-8000-000000000001';
const STREAM_ID = 'd0000000-0000-4000-8000-000000000001';
const ARTIFACT_ID = 'e0000000-0000-4000-8000-000000000001';
const PROMPT_ID = 'f0000000-0000-4000-8000-000000000001';
const ASSISTANT_ID = '10000000-0000-4000-8000-000000000001';
const QUEUE_ID = '20000000-0000-4000-8000-000000000001';
const TERMINAL_EVENT_ID = '30000000-0000-4000-8000-000000000011';
const PROJECT_ID = '40000000-0000-4000-8000-000000000001';
const PROVIDER_CALL_ID = 'provider-read-1';
const GENERATION = 1;

describe('Agentic Chat bounded production read canary verifier', () => {
	it('accepts only one explicit canonical turn id with an optional pnpm separator', () => {
		assert.equal(parseAgenticChatReadCanaryTurnIdArgument(['--turn-id', TURN_ID]), TURN_ID);
		assert.equal(
			parseAgenticChatReadCanaryTurnIdArgument(['--', '--turn-id', TURN_ID]),
			TURN_ID
		);
		assert.equal(
			parseAgenticChatReadCanaryTurnIdArgument(['--turn-id', TURN_ID, '--latest']),
			null
		);
		assert.equal(
			parseAgenticChatReadCanaryTurnIdArgument(['--turn-id', TURN_ID.toUpperCase()]),
			null
		);
	});

	it('stops at turn cardinality instead of cascading failures for an unmatched id', () => {
		const evidence = validEvidence();
		evidence.turns = [];

		const result = verifyAgenticChatReadCanaryEvidence(evidence, TURN_ID);

		assert.equal(result.ok, false);
		assert.deepEqual(result.failures, [
			{ code: 'turn.cardinality', message: 'Expected exactly one turn row.' }
		]);
	});

	it('accepts one internally consistent completed read round', () => {
		const result = verifyAgenticChatReadCanaryEvidence(validEvidence(), TURN_ID);

		assert.equal(result.ok, true);
		assert.deepEqual(result.failures, []);
		assert.deepEqual(result.summary, {
			turnRunId: TURN_ID,
			executionGeneration: 1,
			publicEventCount: 11,
			lastEventSequence: 11,
			toolExecutionCount: 1,
			toolRoundCount: 1,
			toolCallCount: 1,
			usageEvidence: 'exact',
			lifecycleObservationCount: 16,
			queueCompleted: true,
			mutationEffectCount: 0
		});
	});

	it('fails closed for mutation evidence or a second durable tool execution', () => {
		const evidence = validEvidence();
		evidence.effects.push({ id: '50000000-0000-4000-8000-000000000001' });
		evidence.toolExecutions.push(structuredClone(evidence.toolExecutions[0]));

		const result = verifyAgenticChatReadCanaryEvidence(evidence, TURN_ID);

		assert.equal(result.ok, false);
		assert.deepEqual(
			result.failures
				.map(({ code }) => code)
				.filter((code) => code.startsWith('tool.') || code.startsWith('effects.')),
			['tool.cardinality', 'effects.present']
		);
	});

	it('rejects a public result that is not bound to the provider call and durable result', () => {
		const evidence = validEvidence();
		const resultEvent = evidence.events[5] as { payload: { result: Record<string, unknown> } };
		resultEvent.payload.result.tool_call_id = 'provider-read-other';
		resultEvent.payload.result.result = { project: { id: PROJECT_ID, name: 'Changed' } };

		const result = verifyAgenticChatReadCanaryEvidence(evidence, TURN_ID);

		assert.equal(result.ok, false);
		assert.ok(result.failures.some(({ code }) => code === 'events.result_identity'));
		assert.ok(result.failures.some(({ code }) => code === 'tool.result'));
	});

	it('rejects partial usage and an incomplete lifecycle projection', () => {
		const evidence = validEvidence();
		const assistant = evidence.assistantMessages[0] as Record<string, unknown>;
		assistant.completion_tokens = null;
		evidence.lifecycleObservations.pop();

		const result = verifyAgenticChatReadCanaryEvidence(evidence, TURN_ID);

		assert.equal(result.ok, false);
		assert.ok(result.failures.some(({ code }) => code === 'assistant.usage'));
		assert.ok(result.failures.some(({ code }) => code === 'lifecycle.cardinality'));
		assert.ok(result.failures.some(({ code }) => code === 'lifecycle.sequence'));
	});

	it('accepts wholly unknown usage without presenting it as an exact aggregate', () => {
		const evidence = validEvidence();
		const assistant = evidence.assistantMessages[0] as Record<string, unknown>;
		assistant.prompt_tokens = null;
		assistant.completion_tokens = null;
		assistant.total_tokens = null;

		const result = verifyAgenticChatReadCanaryEvidence(evidence, TURN_ID);

		assert.equal(result.ok, true);
		assert.equal(result.summary.usageEvidence, 'unknown');
	});
});

function validEvidence(): AgenticChatReadCanaryEvidence {
	const argumentsValue = { project_id: PROJECT_ID };
	const readResult = { project: { id: PROJECT_ID, name: 'Fixture project' } };
	const events = [
		event(1, 'turn_phase', {
			type: 'turn_phase',
			turn_phase: 'acknowledged'
		}),
		event(2, 'session', { type: 'session', session: { id: SESSION_ID } }),
		event(3, 'context_usage', { type: 'context_usage', usage: {} }),
		event(4, 'agent_state', {
			type: 'agent_state',
			state: 'thinking',
			details: 'Planning the first step...'
		}),
		event(5, 'tool_call', {
			type: 'tool_call',
			tool_call: {
				id: PROVIDER_CALL_ID,
				type: 'function',
				function: {
					name: 'get_project_overview',
					arguments: JSON.stringify(argumentsValue)
				}
			}
		}),
		event(
			6,
			'tool_result',
			{
				type: 'tool_result',
				result: {
					tool_call_id: PROVIDER_CALL_ID,
					tool_name: 'get_project_overview',
					success: true,
					result: readResult,
					result_count: 1,
					zero_result: false
				}
			},
			'2026-08-04T22:42:00.200Z'
		),
		event(7, 'text_delta', { type: 'text_delta', delta: 'Ready.' }),
		event(8, 'turn_phase', { type: 'turn_phase', turn_phase: 'finalizing' }),
		event(9, 'last_turn_context', { type: 'last_turn_context', context: {} }),
		event(10, 'timing', { type: 'timing', timing: {} }),
		{
			...event(11, 'done', {
				type: 'done',
				status: 'completed',
				finished_reason: 'stop',
				failure_code: null,
				assistant_message_id: ASSISTANT_ID
			}),
			event_id: TERMINAL_EVENT_ID
		}
	];
	const lifecycleNames = [
		['turn_intent_resolved', 'prompt'],
		['prepared_prompt_cache_checked', 'prompt'],
		['provider_attempt_started', 'provider'],
		['provider_attempt_ended', 'provider'],
		['tool_call_emitted', 'tool'],
		['first_tool_call_planning_cue_emitted', 'stream'],
		['tool_execution_started', 'tool'],
		['tool_execution_ended', 'tool'],
		['tool_result_received', 'tool'],
		['provider_attempt_started', 'provider'],
		['provider_attempt_ended', 'provider'],
		['turn_phase_changed', 'stream'],
		['turn_outcome_resolved', 'finalize'],
		['orchestration_interventions', 'finalize'],
		['done_emitted', 'finalize'],
		['prompt_snapshot_created', 'prompt']
	];

	return {
		turns: [
			{
				id: TURN_ID,
				assistant_message_id: ASSISTANT_ID,
				correlation_id: '60000000-0000-4000-8000-000000000001',
				execution_generation: GENERATION,
				execution_mode: 'worker_realtime',
				failure_code: null,
				finished_reason: 'stop',
				input_artifact_id: ARTIFACT_ID,
				last_event_sequence: 11,
				prompt_snapshot_id: PROMPT_ID,
				queue_job_id: QUEUE_ID,
				session_id: SESSION_ID,
				status: 'completed',
				stream_run_id: STREAM_ID,
				terminal_event_id: TERMINAL_EVENT_ID,
				tool_call_count: 1,
				tool_round_count: 1,
				transport_contract_version: 'agentic_chat_worker_v1',
				user_id: USER_ID
			}
		],
		artifacts: [
			{
				id: ARTIFACT_ID,
				artifact_version: 'agentic_chat_input_v3',
				prepared: { toolSurface: { toolNames: ['get_project_overview'] } },
				session_id: SESSION_ID,
				turn_run_id: TURN_ID,
				user_id: USER_ID
			}
		],
		toolExecutions: [
			{
				affected_entities: [{ type: 'project', id: PROJECT_ID, name: 'Fixture project' }],
				arguments: argumentsValue,
				created_at: '2026-08-04T22:42:00.100Z',
				effect_id: null,
				error_message: null,
				message_id: ASSISTANT_ID,
				provider_tool_call_id: PROVIDER_CALL_ID,
				requires_user_action: false,
				result: readResult,
				result_count: 1,
				sequence_index: 1,
				session_id: SESSION_ID,
				stream_run_id: STREAM_ID,
				success: true,
				tool_category: 'read',
				tool_name: 'get_project_overview',
				turn_run_id: TURN_ID,
				zero_result: false
			}
		],
		events,
		streamStates: [
			{
				assistant_text: 'Ready.',
				durable_through_sequence: 11,
				execution_generation: GENERATION,
				projection: {
					terminal: {
						eventId: TERMINAL_EVENT_ID,
						sequenceIndex: 11,
						status: 'completed',
						assistantMessageId: ASSISTANT_ID
					}
				},
				projection_durable_sequence: 11,
				reconcile_required: false,
				session_id: SESSION_ID,
				snapshot_sequence: 11,
				turn_run_id: TURN_ID,
				user_id: USER_ID
			}
		],
		promptSnapshots: [
			{
				id: PROMPT_ID,
				messages_sha256: 'a'.repeat(64),
				model_messages: [
					{ role: 'system', content: 'System' },
					{ role: 'user', content: 'Status?' }
				],
				session_id: SESSION_ID,
				snapshot_version: 'agentic_chat_worker_prompt_v1',
				system_prompt_sha256: 'b'.repeat(64),
				tool_definitions: null,
				turn_run_id: TURN_ID,
				user_id: USER_ID
			}
		],
		assistantMessages: [
			{
				completion_tokens: 4,
				content: 'Ready.',
				id: ASSISTANT_ID,
				metadata: {
					turn_run_id: TURN_ID,
					execution_generation: GENERATION,
					transport_contract_version: 'agentic_chat_worker_v1',
					tool_round_count: 1,
					tool_call_count: 1
				},
				prompt_tokens: 12,
				role: 'assistant',
				session_id: SESSION_ID,
				total_tokens: 16,
				user_id: USER_ID
			}
		],
		effects: [],
		queueJobs: [
			{
				completed_at: '2026-08-04T22:42:01.000Z',
				error_message: null,
				id: QUEUE_ID,
				job_type: 'agentic_chat_turn',
				metadata: {
					turnRunId: TURN_ID,
					correlationId: '60000000-0000-4000-8000-000000000001'
				},
				result: {
					turnRunId: TURN_ID,
					status: 'completed',
					terminalEventId: TERMINAL_EVENT_ID
				},
				status: 'completed',
				user_id: USER_ID
			}
		],
		lifecycleObservations: lifecycleNames.map(([event_type, phase], index) => ({
			event_type,
			execution_generation: GENERATION,
			observation_sequence_index: index + 1,
			phase,
			session_id: SESSION_ID,
			stream_run_id: STREAM_ID,
			turn_run_id: TURN_ID,
			user_id: USER_ID
		}))
	};
}

function event(
	sequence_index: number,
	event_type: string,
	payload: Record<string, unknown>,
	created_at = `2026-08-04T22:42:${String(sequence_index).padStart(2, '0')}.000Z`
): Record<string, unknown> {
	return {
		created_at,
		event_id: `30000000-0000-4000-8000-${String(sequence_index).padStart(12, '0')}`,
		event_type,
		execution_generation: GENERATION,
		payload,
		phase: event_type === 'done' ? 'finalize' : 'stream',
		sequence_index,
		session_id: SESSION_ID,
		stream_run_id: STREAM_ID,
		turn_run_id: TURN_ID,
		user_id: USER_ID
	};
}
