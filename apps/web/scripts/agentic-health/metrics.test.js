import { describe, expect, it } from 'vitest';
import { buildHealthReport } from './metrics.mjs';

describe('agentic health metrics', () => {
	it('computes the audit metrics without placing source text in the report', () => {
		const turns = [
			turn({ id: 'direct', user_message_id: 'u1', assistant_message_id: 'a1' }),
			turn({
				id: 'reviewed',
				user_message_id: 'u2',
				assistant_message_id: 'a2',
				request_message: "cool. oh and the email one's done",
				finished_reason: 'mutation_unfulfilled'
			}),
			turn({
				id: 'invalid',
				status: 'failed',
				failure_code: 'provider_tool_finish_reason_invalid',
				assistant_message_id: null,
				user_message_id: null
			}),
			turn({
				id: 'legacy',
				execution_mode: 'legacy_sse',
				assistant_message_id: 'a3',
				user_message_id: 'u3'
			})
		];
		const report = buildHealthReport({
			window: {
				since: '2026-09-01T00:00:00.000Z',
				until: '2026-09-09T00:00:00.000Z',
				userId: 'user-id'
			},
			turns,
			usage: [
				usage({ turn_run_id: 'direct', total_cost_usd: 6 }),
				usage({
					turn_run_id: 'reviewed',
					metadata: { routeId: 'openrouter_semantic_reviewer' },
					prompt_tokens: 100,
					cached_prompt_tokens: 60,
					response_time_ms: 10_000,
					total_cost_usd: 1
				})
			],
			tools: [
				tool({ turn_run_id: 'direct', tool_name: 'update_task', effect_id: 'effect-1' }),
				tool({ turn_run_id: 'reviewed', tool_name: 'update_task', effect_id: 'effect-2' }),
				tool({ turn_run_id: 'reviewed', tool_name: 'approve_turn_contract_review' }),
				tool({ turn_run_id: 'direct', tool_name: 'delegate_task', success: true })
			],
			events: [timing('direct', 20_000), timing('reviewed', 50_000)],
			observations: [
				observation('reviewed', 'provider_tool_arguments_truncated'),
				observation('reviewed', 'provider_tool_not_allowlisted'),
				observation('reviewed', 'provider_throttle')
			],
			messages: [
				message('u1', 'user', 'write prompt', {
					skill_preloaded_id: 'task_management',
					skill_preload_source: 'operational_intent'
				}),
				message('a1', 'assistant', 'Safe answer.'),
				message('u2', 'user', 'canary text'),
				message('a2', 'assistant', 'Done: 2 of 3. One item needs review.'),
				message('u3', 'user', 'legacy prompt'),
				message('a3', 'assistant', 'Legacy answer.')
			],
			queueJobs: [
				{
					id: 'job-reviewed',
					error_message: 'provider_throttle',
					metadata: {},
					updated_at: '2026-09-02T00:00:00.000Z',
					scheduled_for: '2026-09-02T00:00:30.000Z'
				}
			],
			sanitize: (text) => text
		});

		expect(find(report, 'provider_finish_reason_invalid_kills').details.kills).toBe(1);
		expect(find(report, 'truncation_retry_completion').status).toBe('pass');
		expect(
			find(report, 'provider_tool_not_allowlisted').details.inferred_completed_repair_turns
		).toBe(1);
		expect(find(report, 'reviewer_cache_latency').status).toBe('pass');
		expect(find(report, 'write_lane_share').details).toMatchObject({
			direct_turns: 1,
			contract_turns: 1,
			restraint_canary_reviewed: 1
		});
		expect(find(report, 'mutation_unfulfilled_disclosure').status).toBe('pass');
		expect(find(report, 'worker_skill_preloads').details.preloaded_worker_write_turns).toBe(1);
		expect(find(report, 'delegate_task_success').status).toBe('pass');
		expect(find(report, 'throttle_requeue_delay').status).toBe('pass');
		expect(find(report, 'completed_worker_latency').details.p90_ms).toBe(50_000);
		expect(find(report, 'legacy_lane_share').details.legacy_turns).toBe(1);
		expect(JSON.stringify(report)).not.toContain('write prompt');
		expect(JSON.stringify(report)).not.toContain("email one's done");
	});

	it('flags sanitizer edits and missing partial-write disclosure', () => {
		const report = buildHealthReport({
			window: {
				since: '2026-09-01T00:00:00.000Z',
				until: '2026-09-02T00:00:00.000Z',
				userId: null
			},
			turns: [
				turn({
					id: 'partial',
					finished_reason: 'mutation_unfulfilled',
					assistant_message_id: 'a1'
				})
			],
			messages: [message('a1', 'assistant', 'leak this')],
			sanitize: (text) => text.replace('leak', '')
		});

		expect(find(report, 'sanitizer_edits').details.altered).toBe(1);
		expect(find(report, 'mutation_unfulfilled_disclosure').status).toBe('fail');
	});
});

function turn(overrides = {}) {
	return {
		id: 'turn',
		status: 'completed',
		execution_mode: 'worker_realtime',
		llm_pass_count: 1,
		failure_code: null,
		finished_reason: 'completed',
		assistant_message_id: 'assistant',
		user_message_id: 'user',
		queue_job_id: overrides.id === 'reviewed' ? 'job-reviewed' : null,
		request_message: 'request',
		...overrides
	};
}

function usage(overrides = {}) {
	return {
		turn_run_id: 'turn',
		operation_type: 'agentic_chat_worker_stream',
		metadata: { routeId: 'openrouter_primary' },
		prompt_tokens: 100,
		cached_prompt_tokens: 0,
		response_time_ms: 5_000,
		total_cost_usd: 1,
		...overrides
	};
}

function tool(overrides = {}) {
	return {
		turn_run_id: 'turn',
		tool_name: 'tool',
		tool_category: null,
		effect_id: null,
		success: true,
		...overrides
	};
}

function timing(turnRunId, totalMs) {
	return {
		turn_run_id: turnRunId,
		event_type: 'timing',
		payload: { timing: { phases: { total_request_ms: totalMs } } }
	};
}

function observation(turnRunId, errorClass) {
	return {
		turn_run_id: turnRunId,
		event_type: 'provider_attempt_ended',
		payload: { error_class: errorClass }
	};
}

function message(id, role, content, metadata = {}) {
	return { id, role, content, metadata, created_at: '2026-09-02T00:00:00.000Z' };
}

function find(report, id) {
	return report.metrics.find((metric) => metric.id === id);
}
