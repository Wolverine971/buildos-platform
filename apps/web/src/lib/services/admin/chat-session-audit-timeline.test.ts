// apps/web/src/lib/services/admin/chat-session-audit-timeline.test.ts
import { describe, expect, it } from 'vitest';
import {
	buildReplayTimeline,
	buildVisibleTimeline,
	buildVisibleTimelineGroups,
	compareTimelineEvents,
	eventTypeLabel
} from './chat-session-audit-timeline';
import type { AuditTimelineEvent, SessionTurnRun } from './chat-session-audit-types';

const baseEvent = (event: Partial<AuditTimelineEvent> & { id: string }): AuditTimelineEvent => ({
	timestamp: '2026-04-12T12:00:00.000Z',
	type: 'turn_event',
	severity: 'info',
	title: event.id,
	summary: '',
	turn_index: 1,
	payload: {},
	...event
});

const turnRun: SessionTurnRun = {
	id: 'turn-run-1',
	turn_index: 1,
	stream_run_id: 'stream-1',
	client_turn_id: 'client-turn-1',
	status: 'completed',
	finished_reason: 'stop',
	context_type: 'global',
	entity_id: null,
	project_id: null,
	gateway_enabled: true,
	request_message: 'What next?',
	user_message_id: 'message-user-1',
	assistant_message_id: 'message-assistant-1',
	tool_round_count: 1,
	tool_call_count: 1,
	validation_failure_count: 0,
	llm_pass_count: 1,
	first_lane: null,
	first_help_path: null,
	first_skill_path: null,
	first_canonical_op: null,
	history_strategy: null,
	history_compressed: false,
	raw_history_count: 0,
	history_for_model_count: 0,
	cache_source: null,
	cache_age_seconds: 0,
	request_prewarmed_context: false,
	started_at: '2026-04-12T12:00:00.000Z',
	finished_at: '2026-04-12T12:00:02.000Z',
	prompt_snapshot: null,
	events: [],
	eval_runs: []
};

describe('chat-session-audit-timeline', () => {
	it('filters replay-hidden events and visible timeline filters', () => {
		const events = [
			baseEvent({
				id: 'prompt-hidden',
				payload: { event_type: 'prompt_snapshot_created' }
			}),
			baseEvent({
				id: 'tool-error',
				severity: 'error',
				summary: 'project.search failed',
				payload: { event_type: 'tool_result_received' }
			})
		];
		const replay = buildReplayTimeline(events);
		expect(replay.map((event) => event.id)).toEqual(['tool-error']);
		expect(
			buildVisibleTimeline(replay, {
				eventTypeFilters: {
					session: true,
					message: true,
					tool_execution: true,
					llm_call: true,
					operation: true,
					context_shift: true,
					timing: true,
					turn_run: true,
					prompt_snapshot: true,
					turn_event: true,
					eval_run: true
				},
				showOnlyErrors: true,
				search: 'project.search'
			}).map((event) => event.id)
		).toEqual(['tool-error']);
	});

	it('sorts events and groups turn events with counts', () => {
		const events = [
			baseEvent({ id: 'b', payload: { sequence_index: 2 } }),
			baseEvent({ id: 'a', payload: { sequence_index: 1 } }),
			baseEvent({ id: 'standalone', turn_index: null, type: 'session' })
		];
		expect([...events].sort(compareTimelineEvents).map((event) => event.id)).toEqual([
			'a',
			'b',
			'standalone'
		]);
		const groups = buildVisibleTimelineGroups(events, [turnRun]);
		expect(groups).toHaveLength(2);
		expect(groups[1]).toMatchObject({
			id: 'turn:1',
			counts: { total: 2, turnEvents: 2 }
		});
		expect(eventTypeLabel('prompt_snapshot')).toBe('Prompt Snapshot');
	});
});
