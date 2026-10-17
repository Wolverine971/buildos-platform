// apps/web/src/lib/services/agentic-chat-v2/proposal-card-history.test.ts
import { describe, expect, it } from 'vitest';
import { buildProposalCardEnvelopeV1 } from '@buildos/shared-agent-ops/chat-cards/proposal-card';
import {
	PROPOSAL_CARD_CONTINUITY_FILTER,
	PROPOSAL_CARD_NOTE_LIMIT,
	isProposalCardRow,
	proposalCardNotes
} from './proposal-card-history';
import type { InterruptedToolExecutionSummaryRow } from './session-service';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function card(n: number, extra: Record<string, unknown> = {}) {
	const envelope = buildProposalCardEnvelopeV1({
		kind: 'project_parent',
		cardId: id(100 + n),
		sessionId: id(1),
		proposedAt: '2026-10-17T12:00:00.000Z',
		payload: {
			version: 1,
			action: 'attach',
			project: { id: id(2), name: 'DJ Internal' },
			from_parent: null,
			to_parent: { id: id(3), name: 'Wayne Strategies' },
			child_only_members: { names: [], count: 0 },
			effects: ['nothing_moves'],
			undo_needs_admin_on_both: false,
			duplicate_check: { run_id: id(4), root_project_id: id(3) },
			note: null
		},
		message: 'Needs your choice.'
	});
	return { ...envelope, ...extra };
}

function row(
	n: number,
	result: unknown,
	messageId = id(200 + n)
): InterruptedToolExecutionSummaryRow {
	return {
		message_id: messageId,
		tool_name: 'propose_project_parent',
		gateway_op: null,
		sequence_index: n,
		success: true,
		error_message: null,
		arguments: {},
		result: result as any
	};
}

const resolution = (n: number, outcome: string) => ({
	version: 1,
	card_id: id(100 + n),
	kind: 'project_parent',
	choice: outcome === 'cancelled' ? 'cancel' : 'apply',
	outcome,
	resolved_at: '2026-10-17T12:05:00.000Z',
	reason_code: null,
	receipt: null
});

function noteJson(content: string) {
	return JSON.parse(content.slice(content.indexOf('{')));
}

describe('proposal card history', () => {
	it('filters on the rail, never the tool name', () => {
		expect(PROPOSAL_CARD_CONTINUITY_FILTER).toBe(
			'and(result->>card_rail.eq.proposal_v1,result->>status.eq.proposal_ready)'
		);
		expect(isProposalCardRow(row(1, card(1)))).toBe(true);
		expect(isProposalCardRow({ ...row(1, card(1)), success: false })).toBe(false);
		expect(
			isProposalCardRow(
				row(1, { card_rail: 'proposal_v1', status: 'blocked', kind: 'project_parent' })
			)
		).toBe(false);
	});

	it('writes one structured note per card after the reply that showed it', () => {
		const notes = proposalCardNotes([
			row(1, card(1)),
			row(2, card(2, { card_resolution: resolution(2, 'applied') })),
			row(3, { not: 'a card' })
		]);
		expect([...notes.keys()]).toEqual([id(201), id(202)]);
		const [pending] = notes.get(id(201))!;
		expect(pending).toMatchObject({
			role: 'system',
			continuityKind: 'proposal_card_v1',
			sourceMessageId: null
		});
		expect(noteJson(pending!.content)).toMatchObject({
			card_id: id(101),
			kind: 'project_parent',
			state: 'pending',
			expires_at: '2026-10-18T12:00:00.000Z',
			duplicate_check_run_id: id(4),
			subjects: [
				{ role: 'project', id: id(2), name: 'DJ Internal' },
				{ role: 'to_parent', id: id(3), name: 'Wayne Strategies' }
			]
		});
		expect(noteJson(pending!.content).meaning).toContain('has not chosen yet');
		const applied = noteJson(notes.get(id(202))![0]!.content);
		expect(applied).toMatchObject({ state: 'applied', choice: 'apply' });
		expect(applied).not.toHaveProperty('expires_at');
	});

	it('marks undone cards and keeps only the latest cards', () => {
		const undone = card(1, {
			card_resolution: resolution(1, 'applied'),
			card_undo: {
				version: 1,
				card_id: id(101),
				kind: 'project_parent',
				outcome: 'undone',
				undone_at: '2026-10-17T13:00:00.000Z',
				reason_code: null,
				receipt: null
			}
		});
		const rows = [row(1, undone), row(2, card(2)), row(3, card(3)), row(4, card(4))];
		const notes = proposalCardNotes(rows);
		expect(notes.size).toBe(PROPOSAL_CARD_NOTE_LIMIT);
		expect(notes.has(id(201))).toBe(false);
		expect(
			noteJson(proposalCardNotes([row(1, undone)]).get(id(201))![0]!.content)
		).toMatchObject({
			state: 'undone',
			undone_at: '2026-10-17T13:00:00.000Z'
		});
	});
});
