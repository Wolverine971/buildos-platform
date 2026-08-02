// apps/web/src/lib/services/question-tree/realtime.test.ts
import { describe, expect, it } from 'vitest';
import { applyQuestionTreeRealtimeChange, reconcileQuestionTreeDetail } from './realtime';
import type {
	QuestionTreeEvent,
	QuestionTreeNode,
	QuestionTreeProposal,
	QuestionTreeRun,
	QuestionTreeRunDetail
} from './types';

function fixture(): QuestionTreeRunDetail {
	const run = {
		id: 'run-1',
		root_node_id: 'node-0',
		status: 'running',
		phase: 'explore',
		updated_at: '2026-08-01T20:00:00.000Z'
	} as QuestionTreeRun;
	const root = {
		id: 'node-0',
		run_id: run.id,
		node_number: 0,
		updated_at: run.updated_at
	} as QuestionTreeNode;
	return { run, nodes: [root], proposals: [], events: [] };
}

describe('Question Tree realtime merging', () => {
	it('adds and updates nodes in node-number order', () => {
		const detail = fixture();
		const child = {
			id: 'node-2',
			run_id: detail.run.id,
			node_number: 2,
			status: 'queued',
			updated_at: '2026-08-01T20:00:01.000Z'
		} as QuestionTreeNode;
		const withChild = applyQuestionTreeRealtimeChange(
			detail,
			'question_tree_nodes',
			'INSERT',
			child as unknown as Record<string, unknown>
		);
		const runningChild = { ...child, status: 'running' as const };
		const updated = applyQuestionTreeRealtimeChange(
			withChild,
			'question_tree_nodes',
			'UPDATE',
			runningChild as unknown as Record<string, unknown>
		);

		expect(updated.nodes.map((node) => node.id)).toEqual(['node-0', 'node-2']);
		expect(updated.nodes[1]?.status).toBe('running');
	});

	it('keeps events newest-first and deduplicated', () => {
		const detail = fixture();
		const first = {
			id: 'event-1',
			run_id: detail.run.id,
			seq: 1,
			event_type: 'run.created'
		} as QuestionTreeEvent;
		const second = { ...first, id: 'event-2', seq: 2, event_type: 'node.started' };
		const afterFirst = applyQuestionTreeRealtimeChange(
			detail,
			'question_tree_events',
			'INSERT',
			first as unknown as Record<string, unknown>
		);
		const afterSecond = applyQuestionTreeRealtimeChange(
			afterFirst,
			'question_tree_events',
			'INSERT',
			second as unknown as Record<string, unknown>
		);

		expect(afterSecond.events.map((event) => event.seq)).toEqual([2, 1]);
	});

	it('does not let an older fetch snapshot overwrite a websocket update', () => {
		const current = fixture();
		current.run = {
			...current.run,
			status: 'synthesizing',
			updated_at: '2026-08-01T20:00:05.000Z'
		};
		const incoming = fixture();
		incoming.proposals = [
			{
				id: 'proposal-1',
				run_id: incoming.run.id,
				rank: 0,
				created_at: '2026-08-01T20:00:02.000Z',
				updated_at: '2026-08-01T20:00:02.000Z'
			} as QuestionTreeProposal
		];

		const reconciled = reconcileQuestionTreeDetail(current, incoming);
		expect(reconciled.run.status).toBe('synthesizing');
		expect(reconciled.proposals).toHaveLength(1);
	});
});
