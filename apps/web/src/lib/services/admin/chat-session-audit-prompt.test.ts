import { describe, expect, it } from 'vitest';
import { capturedPromptMessages, timelineGroupRequestMessage } from './chat-session-audit-prompt';
import type { SessionTurnRun, TimelineGroup } from './chat-session-audit-types';

function createTurnRun(overrides: Partial<SessionTurnRun> = {}): SessionTurnRun {
	return {
		id: 'run-1',
		turn_index: 1,
		stream_run_id: 'stream-1',
		client_turn_id: 'client-turn-1',
		status: 'completed',
		finished_reason: 'stop',
		context_type: 'project',
		entity_id: 'project-1',
		project_id: 'project-1',
		gateway_enabled: true,
		request_message: 'Review this plan and tell the other agent what to change.',
		user_message_id: 'message-user',
		assistant_message_id: 'message-assistant',
		tool_round_count: 0,
		tool_call_count: 0,
		validation_failure_count: 0,
		llm_pass_count: 1,
		first_lane: 'tool_calling',
		first_help_path: null,
		first_skill_path: null,
		first_canonical_op: null,
		history_strategy: 'raw_history',
		history_compressed: false,
		raw_history_count: 1,
		history_for_model_count: 1,
		cache_source: 'fresh_load',
		cache_age_seconds: 0,
		request_prewarmed_context: false,
		started_at: '2026-08-03T16:52:37.000Z',
		finished_at: '2026-08-03T16:52:56.000Z',
		prompt_snapshot: null,
		events: [],
		eval_runs: [],
		...overrides
	};
}

function createTimelineGroup(overrides: Partial<TimelineGroup> = {}): TimelineGroup {
	return {
		id: 'turn:1',
		kind: 'turn',
		title: 'Turn 1',
		summary: '',
		timestamp: '2026-08-03T16:52:37.000Z',
		severity: 'info',
		turnIndex: 1,
		run: createTurnRun(),
		items: [],
		counts: {
			total: 0,
			messages: 0,
			promptSnapshots: 0,
			llmCalls: 0,
			toolExecutions: 0,
			turnEvents: 0,
			operations: 0,
			evalRuns: 0,
			errors: 0
		},
		...overrides
	};
}

describe('chat session prompt audit helpers', () => {
	it('returns readable role-by-role model messages from the captured prompt snapshot', () => {
		const turnRun = createTurnRun({
			prompt_snapshot: {
				model_messages: [
					{ role: 'system', content: 'Follow the project operating rules.' },
					{
						role: 'assistant',
						content: '',
						tool_calls: [{ id: 'tool-1', function: { name: 'onto_project_get' } }]
					},
					{
						role: 'user',
						content: [{ type: 'text', text: 'Send the status to the planning agent.' }]
					}
				]
			}
		});

		expect(capturedPromptMessages(turnRun)).toEqual([
			expect.objectContaining({
				roleLabel: 'System',
				content: 'Follow the project operating rules.',
				characterCount: 35,
				extra: null
			}),
			expect.objectContaining({
				roleLabel: 'Assistant',
				content: '',
				extra: {
					tool_calls: [{ id: 'tool-1', function: { name: 'onto_project_get' } }]
				}
			}),
			expect.objectContaining({
				roleLabel: 'User / calling agent',
				content: 'Send the status to the planning agent.'
			})
		]);
	});

	it('prefers the exact recorded turn request over the copied model-message history', () => {
		const group = createTimelineGroup();
		expect(timelineGroupRequestMessage(group)).toBe(
			'Review this plan and tell the other agent what to change.'
		);
	});

	it('falls back to the user timeline message for historical turns without a turn-run request', () => {
		const group = createTimelineGroup({
			run: null,
			items: [
				{
					id: 'message:user-1',
					timestamp: '2026-08-03T16:52:37.000Z',
					type: 'message',
					severity: 'info',
					title: 'User Message',
					summary: 'Delegate this work.',
					turn_index: 1,
					payload: { role: 'user', content: 'Delegate this work to the research agent.' }
				}
			]
		});

		expect(timelineGroupRequestMessage(group)).toBe(
			'Delegate this work to the research agent.'
		);
	});
});
