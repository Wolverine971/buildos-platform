// apps/web/src/lib/services/admin/chat-session-audit-export.test.ts
import { describe, expect, it } from 'vitest';
import { buildSessionDetailPayload } from '../../../routes/api/admin/chat/sessions/[id]/session-detail-payload';
import {
	buildChatSessionAuditFilename,
	buildChatSessionAuditMarkdown
} from './chat-session-audit-export';

describe('chat-session-audit-export', () => {
	it('formats a full markdown audit that includes timeline, tool calls, and turn runs', () => {
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
					fastchat_last_context_shift: {
						context_type: 'project',
						entity_id: 'project-1',
						shifted_at: '2026-04-03T12:00:30.000Z'
					}
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
					tool_name: 'tool_exec',
					tool_category: 'detail',
					gateway_op: 'util.project.overview',
					help_path: null,
					sequence_index: 1,
					success: true,
					execution_time_ms: 32,
					created_at: '2026-04-03T12:00:12.000Z',
					arguments: { op: 'util.project.overview', args: { query: '9takes' } },
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
					entity_id: 'project-1',
					project_id: 'project-1',
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
					system_prompt: 'System prompt body',
					model_messages: [
						{ role: 'user', content: 'What is happening with my project?' }
					],
					tool_definitions: [{ name: 'tool_exec' }],
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
						tool_name: 'tool_exec',
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

		const markdown = buildChatSessionAuditMarkdown(payload);

		expect(markdown).toContain('# Chat Session Audit: Test session');
		expect(markdown).toContain('## Conversation Transcript');
		expect(markdown).toContain('## Ordered Timeline');
		expect(markdown).toContain('Tool Execution: tool_exec');
		expect(markdown).toContain('"tool_name": "tool_exec"');
		expect(markdown).toContain('"op": "util.project.overview"');
		expect(markdown).toContain('## Turn Runs');
		expect(markdown).toContain('FASTCHAT V2 PROMPT SNAPSHOT');
		expect(markdown).toContain('project.named_status');
		expect(markdown).toContain('## Raw Collections');
	});

	it('builds a stable markdown filename', () => {
		const filename = buildChatSessionAuditFilename({
			session: {
				id: 'session-1',
				title: 'Session Title',
				user: { id: 'user-1', email: 'admin@example.com', name: 'Admin User' },
				context_type: 'global',
				context_id: null,
				status: 'active',
				message_count: 0,
				total_tokens: 0,
				tool_call_count: 0,
				llm_call_count: 0,
				cost_estimate: 0,
				has_errors: false,
				created_at: '2026-04-03T12:00:00.000Z',
				updated_at: '2026-04-03T12:00:00.000Z',
				last_message_at: null,
				agent_metadata: {}
			},
			metrics: {
				total_tokens: 0,
				total_cost_usd: 0,
				tool_calls: 0,
				tool_failures: 0,
				llm_calls: 0,
				llm_failures: 0,
				messages: 0
			},
			messages: [],
			tool_executions: [],
			llm_calls: [],
			operations: [],
			timeline: [],
			timing_metrics: null,
			turn_runs: []
		});

		expect(filename).toMatch(
			/^chat-session-audit-session-title-session-1-\d{4}-\d{2}-\d{2}\.md$/
		);
	});
});
