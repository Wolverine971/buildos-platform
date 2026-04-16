// apps/web/src/routes/api/admin/chat/sessions/[id]/session-detail-payload.test.ts
import { describe, expect, it } from 'vitest';
import { buildSessionDetailPayload } from './session-detail-payload';

describe('buildSessionDetailPayload', () => {
	it('includes turn runs, prompt snapshots, and turn events in the payload and timeline', () => {
		const payload = buildSessionDetailPayload({
			sessionRow: {
				id: 'session-1',
				user_id: 'user-1',
				title: 'Test session',
				status: 'active',
				context_type: 'global',
				entity_id: null,
				message_count: 2,
				total_tokens_used: 1200,
				tool_call_count: 1,
				created_at: '2026-04-03T12:00:00.000Z',
				updated_at: '2026-04-03T12:01:00.000Z',
				last_message_at: '2026-04-03T12:01:00.000Z',
				agent_metadata: {
					libri_handoff: {
						status: 'sent',
						results: [
							{
								entity_type: 'person',
								canonical_query: 'James Clear',
								status: 'found'
							}
						]
					}
				},
				extracted_entities: {
					libri_candidates: [
						{
							entity_type: 'person',
							display_name: 'James Clear',
							canonical_query: 'James Clear',
							confidence: 0.96,
							relevance: 'primary',
							recommended_action: 'resolve_or_enqueue'
						}
					],
					extraction_version: 'libri_session_synthesis_v1',
					extracted_at: '2026-04-03T12:01:00.000Z'
				},
				users: {
					id: 'user-1',
					email: 'admin@example.com',
					name: 'Admin User'
				}
			},
			messages: [
				{
					id: 'message-user',
					role: 'user',
					content: 'What is happening with my project?',
					created_at: '2026-04-03T12:00:05.000Z'
				},
				{
					id: 'message-assistant',
					role: 'assistant',
					content: 'I checked the overview.',
					created_at: '2026-04-03T12:00:20.000Z'
				}
			],
			toolExecutions: [
				{
					id: 'tool-1',
					message_id: 'message-assistant',
					turn_run_id: 'run-1',
					stream_run_id: 'stream-1',
					client_turn_id: 'turn-1',
					tool_name: 'get_project_overview',
					tool_category: 'detail',
					gateway_op: 'util.project.overview',
					help_path: null,
					sequence_index: 1,
					success: true,
					execution_time_ms: 32,
					created_at: '2026-04-03T12:00:12.000Z',
					arguments: { query: '9takes' },
					result: { ok: true }
				}
			],
			llmCalls: [
				{
					id: 'llm-1',
					model_requested: 'gpt-5',
					model_used: 'gpt-5',
					provider: 'openrouter',
					status: 'success',
					total_tokens: 1200,
					total_cost_usd: 0.012,
					request_started_at: '2026-04-03T12:00:06.000Z',
					request_completed_at: '2026-04-03T12:00:18.000Z',
					created_at: '2026-04-03T12:00:18.000Z'
				}
			],
			operations: [],
			timingData: {
				id: 'timing-1',
				message_received_at: '2026-04-03T12:00:05.000Z',
				time_to_first_event_ms: 120,
				time_to_first_response_ms: 980
			},
			turnRuns: [
				{
					id: 'run-1',
					stream_run_id: 'stream-1',
					client_turn_id: 'turn-1',
					context_type: 'global',
					entity_id: null,
					project_id: null,
					gateway_enabled: true,
					request_message: 'What is happening with my project?',
					status: 'completed',
					finished_reason: 'stop',
					tool_round_count: 1,
					tool_call_count: 1,
					validation_failure_count: 0,
					llm_pass_count: 1,
					first_lane: 'overview',
					first_help_path: null,
					first_skill_path: null,
					first_canonical_op: 'util.project.overview',
					history_strategy: 'raw_history',
					history_compressed: false,
					raw_history_count: 0,
					history_for_model_count: 0,
					cache_source: 'fresh_load',
					cache_age_seconds: 0,
					request_prewarmed_context: false,
					started_at: '2026-04-03T12:00:05.000Z',
					finished_at: '2026-04-03T12:00:21.000Z',
					created_at: '2026-04-03T12:00:05.000Z',
					updated_at: '2026-04-03T12:00:21.000Z'
				}
			],
			promptSnapshots: [
				{
					id: 'snapshot-1',
					turn_run_id: 'run-1',
					snapshot_version: 'fastchat_prompt_v1',
					prompt_variant: 'lite_seed_v1',
					system_prompt_chars: 4000,
					message_chars: 120,
					approx_prompt_tokens: 1030,
					rendered_dump_text: 'FASTCHAT V2 PROMPT SNAPSHOT',
					created_at: '2026-04-03T12:00:05.500Z'
				}
			],
			turnEvents: [
				{
					id: 'event-1',
					turn_run_id: 'run-1',
					stream_run_id: 'stream-1',
					sequence_index: 1,
					phase: 'prompt',
					event_type: 'prompt_snapshot_created',
					payload: {
						prompt_snapshot_id: 'snapshot-1',
						approx_prompt_tokens: 1030
					},
					created_at: '2026-04-03T12:00:05.500Z'
				},
				{
					id: 'event-2',
					turn_run_id: 'run-1',
					stream_run_id: 'stream-1',
					sequence_index: 2,
					phase: 'tool',
					event_type: 'tool_result_received',
					payload: {
						tool_name: 'get_project_overview',
						canonical_op: 'util.project.overview'
					},
					created_at: '2026-04-03T12:00:12.000Z'
				}
			],
			evalRuns: [
				{
					id: 'eval-1',
					turn_run_id: 'run-1',
					scenario_slug: 'project.named_status',
					scenario_version: '1',
					runner_type: 'admin_manual',
					status: 'passed',
					summary: {
						assertion_counts: {
							passed: 6,
							failed: 0
						}
					},
					started_at: '2026-04-03T12:01:00.000Z',
					completed_at: '2026-04-03T12:01:01.000Z',
					created_by: 'admin-1',
					created_at: '2026-04-03T12:01:00.000Z'
				}
			],
			evalAssertions: [
				{
					id: 'assert-1',
					eval_run_id: 'eval-1',
					assertion_key: 'first_lane_matches',
					status: 'passed',
					expected: 'overview',
					actual: 'overview',
					details: null,
					created_at: '2026-04-03T12:01:00.500Z'
				}
			]
		});

		expect(payload.turn_runs).toHaveLength(1);
		expect(payload.turn_runs[0]).toMatchObject({
			id: 'run-1',
			turn_index: 1,
			stream_run_id: 'stream-1',
			first_lane: 'overview',
			first_canonical_op: 'util.project.overview'
		});
		expect(payload.turn_runs[0].prompt_snapshot).toMatchObject({
			id: 'snapshot-1',
			approx_prompt_tokens: 1030
		});
		expect(payload.turn_runs[0].events).toHaveLength(2);
		expect(payload.turn_runs[0].events[1]?.payload).toMatchObject({
			tool_result: { ok: true },
			tool_arguments: {
				query: '9takes'
			},
			tool_result_source: 'chat_tool_executions'
		});
		expect(payload.turn_runs[0].eval_runs).toHaveLength(1);
		expect(payload.turn_runs[0].eval_runs[0]).toMatchObject({
			id: 'eval-1',
			scenario_slug: 'project.named_status',
			status: 'passed'
		});
		expect(payload.session.extracted_entities).toMatchObject({
			libri_candidates: [
				expect.objectContaining({
					entity_type: 'person',
					display_name: 'James Clear'
				})
			]
		});
		expect(payload.session.agent_metadata).toMatchObject({
			libri_handoff: {
				status: 'sent'
			}
		});

		const timelineTypes = payload.timeline.map((event) => event.type);
		expect(timelineTypes).toContain('turn_run');
		expect(timelineTypes).toContain('prompt_snapshot');
		expect(timelineTypes).toContain('turn_event');
		expect(timelineTypes).toContain('eval_run');

		const turnRunEvent = payload.timeline.find((event) => event.type === 'turn_run');
		expect(turnRunEvent?.summary).toContain('lane=overview');

		const promptEvent = payload.timeline.find((event) => event.type === 'prompt_snapshot');
		expect(promptEvent?.summary).toContain('lite_seed_v1');
		expect(promptEvent?.payload).toMatchObject({
			prompt_variant: 'lite_seed_v1',
			rendered_dump_text: 'FASTCHAT V2 PROMPT SNAPSHOT'
		});

		const toolResultEvent = payload.timeline.find(
			(event) => event.type === 'turn_event' && event.id === 'turn_event:event-2'
		);
		expect(toolResultEvent?.payload).toMatchObject({
			tool_name: 'get_project_overview',
			result: { ok: true },
			arguments: {
				query: '9takes'
			},
			tool_result_source: 'chat_tool_executions'
		});
	});

	it('uses llm_usage_logs totals for billable session tokens', () => {
		const payload = buildSessionDetailPayload({
			sessionRow: {
				id: 'session-usage-ledger',
				user_id: 'user-1',
				title: 'Usage ledger session',
				status: 'active',
				context_type: 'project',
				entity_id: null,
				message_count: 2,
				total_tokens_used: 76_038,
				tool_call_count: 0,
				created_at: '2026-04-11T22:09:18.000Z',
				updated_at: '2026-04-11T22:19:55.000Z',
				last_message_at: '2026-04-11T22:18:50.000Z',
				agent_metadata: {},
				users: {
					id: 'user-1',
					email: 'admin@example.com',
					name: 'Admin User'
				}
			},
			messages: [
				{
					id: 'message-user',
					role: 'user',
					content: 'Create the project.',
					total_tokens: 0,
					created_at: '2026-04-11T22:09:19.000Z'
				},
				{
					id: 'message-assistant',
					role: 'assistant',
					content: 'Done.',
					total_tokens: 76_038,
					created_at: '2026-04-11T22:18:50.000Z'
				}
			],
			toolExecutions: [],
			llmCalls: [
				{
					id: 'llm-stream-1',
					operation_type: 'agentic_chat_v2_stream',
					model_requested: 'x-ai/grok-4.1-fast',
					model_used: 'x-ai/grok-4.1-fast',
					provider: 'openrouter',
					status: 'success',
					total_tokens: 76_038,
					total_cost_usd: 0.0175413,
					request_started_at: '2026-04-11T22:09:19.000Z',
					request_completed_at: '2026-04-11T22:18:50.000Z',
					created_at: '2026-04-11T22:18:50.000Z'
				},
				{
					id: 'llm-reconcile-1',
					operation_type: 'agent_state_reconciliation',
					model_requested: 'qwen/qwen3.6-plus',
					model_used: 'qwen/qwen3.6-plus',
					provider: 'qwen',
					status: 'success',
					total_tokens: 13_618,
					total_cost_usd: 0.01656623,
					request_started_at: '2026-04-11T22:18:51.000Z',
					request_completed_at: '2026-04-11T22:19:55.000Z',
					created_at: '2026-04-11T22:19:55.000Z'
				}
			],
			operations: [],
			timingData: null,
			turnRuns: [],
			promptSnapshots: [],
			turnEvents: [],
			evalRuns: [],
			evalAssertions: []
		});

		expect(payload.metrics.total_tokens).toBe(89_656);
		expect(payload.session.total_tokens).toBe(89_656);
		expect(payload.metrics.total_cost_usd).toBeCloseTo(0.03410753);
	});
});
