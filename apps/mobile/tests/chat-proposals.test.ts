// apps/mobile/tests/chat-proposals.test.ts
import { describe, expect, it } from 'vitest';
import type { ChatSessionHistoryResponse } from '@buildos/api-client';
import type { AgentSSEMessage } from '@buildos/shared-types';

import {
	parseProposalCard,
	proposalLines,
	proposalMainLabel,
	proposalProgress,
	proposalState,
	proposalTitle
} from '@/lib/chat/proposals';
import { createSessionStore, type CardRow, type WorkerTurnHandle } from '@/lib/chat/session-store';

const SESSION = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const TURN = '11111111-2222-4333-8444-555555555555';
const CARD = '22222222-3333-4444-8555-666666666666';

function envelope(overrides: Record<string, unknown> = {}, payload: Record<string, unknown> = {}) {
	return {
		card_rail: 'proposal_v1',
		status: 'proposal_ready',
		requires_user_action: true,
		saved: false,
		card_id: CARD,
		kind: 'workspace_file',
		message: 'Needs your choice.',
		model_view: {},
		client_action: {
			kind: 'proposal_card',
			card_kind: 'workspace_file',
			card_id: CARD,
			session_id: SESSION,
			expires_at: '2099-01-01T00:00:00Z',
			payload: {
				version: 1,
				target: { id: 'p1', name: 'Launch' },
				items: [{ id: 'i1', title: 'Pricing page' }],
				nested_documents: 1,
				reason: 'Mentions the launch.',
				...payload
			}
		},
		...overrides
	};
}

const handle: WorkerTurnHandle = {
	contractVersion: 'agentic_chat_worker_v1',
	executionMode: 'worker_realtime',
	streamRunId: 's',
	clientTurnId: 'turn_1',
	sessionId: SESSION,
	turnRunId: TURN
};

describe('proposal cards: reading the contract', () => {
	it('parses a ready card and rejects anything else', () => {
		const card = parseProposalCard(envelope());
		expect(card).toMatchObject({ card_id: CARD, kind: 'workspace_file', session_id: SESSION });
		expect(parseProposalCard(envelope({ status: 'blocked' }))).toBeNull();
		expect(parseProposalCard(envelope({ kind: 'mystery' }))).toBeNull();
		expect(parseProposalCard({ tool_call_id: 'x', success: true })).toBeNull();
	});

	it('words the card like the website', () => {
		const file = parseProposalCard(envelope())!;
		expect(proposalTitle(file)).toBe('File “Pricing page” into Launch');
		expect(proposalMainLabel(file)).toBe('File it');
		expect(proposalLines(file)).toEqual(['1 nested doc come along.', 'Mentions the launch.']);

		const nest = parseProposalCard(
			envelope({
				kind: 'project_parent',
				client_action: {
					kind: 'proposal_card',
					card_kind: 'project_parent',
					card_id: CARD,
					session_id: SESSION,
					expires_at: '2099-01-01T00:00:00Z',
					payload: {
						action: 'attach',
						project: { id: 'a', name: 'Cadre' },
						to_parent: { id: 'b', name: 'Wayne Strategies' },
						from_parent: null,
						child_only_members: { names: ['Sam'], count: 1 },
						note: null
					}
				}
			})
		)!;
		expect(proposalTitle(nest)).toBe('Put Cadre inside Wayne Strategies');
		expect(proposalMainLabel(nest)).toBe('Move under Wayne Strategies');
		expect(proposalLines(nest)).toEqual(['1 person on the parent gain access.']);
	});

	it('knows pending, expired, applied, undone', () => {
		const pending = parseProposalCard(envelope())!;
		expect(proposalState(pending, Date.parse('2026-01-01T00:00:00Z'))).toBe('pending');
		expect(proposalState(pending, Date.parse('2100-01-01T00:00:00Z'))).toBe('expired');
		const applied = parseProposalCard(
			envelope({
				card_resolution: {
					version: 1,
					card_id: CARD,
					kind: 'workspace_file',
					choice: 'apply',
					outcome: 'applied',
					resolved_at: 'x',
					reason_code: null,
					receipt: null
				}
			})
		)!;
		expect(proposalState(applied)).toBe('applied');
		expect(proposalProgress(applied)).toBe(1);
		const undone = parseProposalCard(
			envelope({
				card_resolution: applied.card_resolution,
				card_undo: {
					version: 1,
					card_id: CARD,
					kind: 'workspace_file',
					outcome: 'undone',
					undone_at: 'x',
					reason_code: null,
					receipt: null
				}
			})
		)!;
		expect(proposalState(undone)).toBe('undone');
		expect(proposalProgress(undone)).toBe(2);
	});
});

describe('proposal cards in the session store', () => {
	it("lands after its turn's work row, keeps the furthest-along copy, and settles", () => {
		const store = createSessionStore({ now: () => 1_000, makeId: () => 'row' });
		store.addUserMessage({ clientTurnId: 'turn_1', text: 'file these' });
		store.port.beginGeneration({ handle, executionGeneration: 0, status: 'running' });
		const event = {
			type: 'tool_result',
			turn_run_id: TURN,
			result: envelope()
		} as AgentSSEMessage;
		store.port.applySemanticEvent(event);
		expect(store.getState().rows.map((row) => row.kind)).toEqual([
			'user',
			'work',
			'card',
			'assistant'
		]);

		// An older copy (no decision) never overwrites a newer one.
		const resolution = {
			version: 1,
			card_id: CARD,
			kind: 'workspace_file',
			choice: 'apply',
			outcome: 'applied',
			resolved_at: 'x',
			reason_code: null,
			receipt: null
		} as const;
		store.port.applySemanticEvent({
			type: 'tool_result',
			turn_run_id: TURN,
			result: envelope({ card_resolution: resolution })
		} as AgentSSEMessage);
		store.port.applySemanticEvent(event);
		let card = store.getState().rows.find((row) => row.kind === 'card') as CardRow;
		expect(card.card.card_resolution?.outcome).toBe('applied');
		expect(store.getState().rows.filter((row) => row.kind === 'card')).toHaveLength(1);

		store.setCardBusy(CARD, 'undo');
		expect((store.getState().rows.find((row) => row.kind === 'card') as CardRow).busy).toBe(
			'undo'
		);
		store.settleCard(
			CARD,
			{
				...card.card,
				card_undo: {
					version: 1,
					card_id: CARD,
					kind: 'workspace_file',
					outcome: 'undone',
					undone_at: 'x',
					reason_code: null,
					receipt: null
				}
			},
			'Undone.'
		);
		card = store.getState().rows.find((row) => row.kind === 'card') as CardRow;
		expect(card.busy).toBeNull();
		expect(card.note).toBe('Undone.');
		expect(proposalState(card.card)).toBe('undone');
	});

	it('restores cards from stored tool results next to their turn', () => {
		const store = createSessionStore({ now: () => 1_000, makeId: () => 'row' });
		const history = {
			session: { id: SESSION },
			messages: [
				{
					id: 'm1',
					role: 'user',
					content: 'file these',
					created_at: '2026-10-30T10:00:00Z'
				},
				{
					id: 'm2',
					role: 'assistant',
					content: 'Want me to file them?',
					created_at: '2026-10-30T10:00:30Z',
					metadata: { turn_run_id: TURN }
				}
			],
			toolExecutions: [
				{
					id: 'x1',
					turn_run_id: TURN,
					result: envelope(),
					created_at: '2026-10-30T10:00:20Z'
				}
			],
			turnRuns: [
				{
					id: TURN,
					status: 'completed',
					client_turn_id: 'turn_1',
					assistant_message_id: 'm2',
					started_at: '2026-10-30T10:00:02Z',
					finished_at: '2026-10-30T10:00:29Z',
					created_at: '2026-10-30T10:00:01Z'
				}
			],
			timelineItems: [
				{
					id: 't1',
					kind: 'tool',
					turnRunId: TURN,
					title: 'Checking the Workspace',
					status: 'completed'
				}
			],
			voiceNoteGroups: [],
			voiceNotes: [],
			truncated: false,
			historyWindow: {},
			pendingChange: { key: 'k', createdAt: 'x', items: ['Create a doc in Launch'] }
		} as unknown as ChatSessionHistoryResponse;
		store.restore(history);
		expect(store.getState().rows.map((row) => `${row.kind}:${row.id}`)).toEqual([
			'user:m1',
			`work:work:${TURN}`,
			`card:card:${CARD}`,
			'assistant:m2'
		]);
		expect(store.getState().pendingChange?.items).toEqual(['Create a doc in Launch']);
	});

	it('asks for the strip again when a turn ends with a failed step', () => {
		const store = createSessionStore({ now: () => 1_000, makeId: () => 'row' });
		store.port.beginGeneration({ handle, executionGeneration: 0, status: 'running' });
		store.port.applySemanticEvent({
			type: 'tool_call',
			turn_run_id: TURN,
			tool_call: {
				id: 'c1',
				type: 'function',
				function: { name: 'update_onto_task', arguments: '{}' }
			}
		} as AgentSSEMessage);
		store.port.applySemanticEvent({
			type: 'tool_result',
			turn_run_id: TURN,
			result: { tool_call_id: 'c1', success: false }
		} as AgentSSEMessage);
		expect(store.getState().pendingChangeCheck).toBe(0);
		store.port.finishTurn({
			handle,
			status: 'completed',
			finishedReason: 'stop',
			failureCode: null
		});
		expect(store.getState().pendingChangeCheck).toBe(1);
		store.setPendingChange(null);
		expect(store.getState().pendingChange).toBeNull();
	});
});
