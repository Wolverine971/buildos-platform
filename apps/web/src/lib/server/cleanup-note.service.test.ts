// apps/web/src/lib/server/cleanup-note.service.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectCleanupItem } from '@buildos/shared-types';

const mocks = vi.hoisted(() => ({
	runCleanupDecisions: vi.fn(),
	decideProjectSuggestionWithClarification: vi.fn()
}));

vi.mock('$lib/server/project-cleanup-decisions.service', () => ({
	runCleanupDecisions: mocks.runCleanupDecisions
}));

vi.mock('$lib/server/clarified-decision.service', () => ({
	decideProjectSuggestionWithClarification: mocks.decideProjectSuggestionWithClarification
}));

import {
	actOnCleanupNote,
	buildCleanupNotePrompt,
	parseCleanupNoteReading,
	type CleanupNoteReading
} from './cleanup-note.service';

function row(id: string, fingerprint: string | null, headline: string | null = null) {
	return {
		suggestion_id: id,
		kind: 'doc_org' as const,
		title: `Row ${id}`,
		operation_count: fingerprint ? 1 : 0,
		verified_headline: headline,
		verified_fingerprint: fingerprint,
		verified_operations: fingerprint
			? [{ actionLabel: 'Archive', entityLabel: 'document', target: 'Genesis brief' }]
			: undefined,
		updated_at: '2026-09-29T12:00:00.000Z'
	};
}

function item(overrides: Partial<ProjectCleanupItem> = {}): ProjectCleanupItem {
	return {
		id: 'genesis',
		source: 'review',
		kind: 'doc_org',
		section: 'safe_cleanup',
		title: 'Archive the Genesis opportunity brief',
		summary: 'The take-home was never returned.',
		why_now: null,
		executable: true,
		rows: [row('s-1', 'fp-1', 'Archive "Genesis brief"')],
		evidence_refs: [],
		seen_count: 2,
		first_seen_at: '2026-10-03T12:00:00.000Z',
		updated_at: '2026-10-03T12:00:00.000Z',
		...overrides
	};
}

const reading = (overrides: Partial<CleanupNoteReading>): CleanupNoteReading => ({
	decision: 'not_needed',
	dismissReason: 'intentional',
	agentBrief: null,
	reply: 'Kept it.',
	...overrides
});

describe('buildCleanupNotePrompt', () => {
	it('gives the model the item, whether it can apply, the proposed change and the note', () => {
		const prompt = JSON.parse(
			buildCleanupNotePrompt({ projectName: 'Job Search', item: item(), note: 'keep it' })
		);
		expect(prompt).toEqual({
			project: 'Job Search',
			item: {
				title: 'Archive the Genesis opportunity brief',
				summary: 'The take-home was never returned.',
				why_now: null,
				section: 'safe_cleanup',
				can_apply: true,
				proposed_changes: ['Archive "Genesis brief"', 'Archive document Genesis brief']
			},
			note: 'keep it'
		});
	});
});

describe('parseCleanupNoteReading', () => {
	it('reads the decision fields and keeps the reply', () => {
		expect(
			parseCleanupNoteReading(
				{ decision: 'not_needed', dismiss_reason: 'intentional', reply: 'Kept it.' },
				true
			)
		).toEqual(reading({}));
	});

	it('rejects a reading with no valid decision', () => {
		expect(parseCleanupNoteReading({ decision: 'maybe' }, true)).toBeNull();
		expect(parseCleanupNoteReading(null, true)).toBeNull();
	});

	it('turns apply on an item with no ready change into an agent hand-off', () => {
		expect(
			parseCleanupNoteReading(
				{ decision: 'apply', reply: 'Applied.', agent_brief: 'Set the floor to 180k.' },
				false
			)
		).toEqual({
			decision: 'agent',
			dismissReason: 'other',
			agentBrief: 'Set the floor to 180k.',
			reply: 'Handed it to an agent.'
		});
	});
});

describe('actOnCleanupNote', () => {
	beforeEach(() => {
		mocks.runCleanupDecisions.mockReset();
		mocks.decideProjectSuggestionWithClarification.mockReset();
	});

	const base = { supabase: {}, userId: 'user-1', projectId: 'project-1' };

	it('dismisses with the note as feedback when the owner says keep it', async () => {
		mocks.runCleanupDecisions.mockResolvedValue([
			{ suggestion_id: 's-1', ok: true, status: 'rejected' }
		]);
		const result = await actOnCleanupNote({
			...base,
			item: item(),
			note: "Keep it, I'm still talking to Genesis",
			reading: reading({})
		});
		expect(mocks.runCleanupDecisions).toHaveBeenCalledWith({
			...base,
			decisions: [
				{
					suggestion_id: 's-1',
					action: 'dismiss',
					reason: 'intentional',
					note: "Keep it, I'm still talking to Genesis"
				}
			]
		});
		expect(result).toMatchObject({ ok: true, decision: 'not_needed', reply: 'Kept it.' });
	});

	it('applies against the fingerprint the owner saw and reports a changed item honestly', async () => {
		mocks.runCleanupDecisions.mockResolvedValue([
			{ suggestion_id: 's-1', ok: false, status: 'changed' }
		]);
		const result = await actOnCleanupNote({
			...base,
			item: item(),
			note: 'yes archive it',
			reading: reading({ decision: 'apply', reply: 'Archived it.' }),
			expectedFingerprints: { 's-1': 'fp-seen' }
		});
		expect(mocks.runCleanupDecisions.mock.calls[0]![0].decisions).toEqual([
			{ suggestion_id: 's-1', action: 'approve', expected_fingerprint: 'fp-seen' }
		]);
		expect(result).toMatchObject({
			ok: true,
			reply: 'It changed since you saw it, so I left it in the list for another look.'
		});
	});

	it('hands a complicated note to an agent with the owner’s words, and the other rows ride along', async () => {
		mocks.decideProjectSuggestionWithClarification.mockResolvedValue({
			ok: true,
			suggestion: {},
			agent_run_id: 'run-9',
			delegated: true
		});
		mocks.runCleanupDecisions.mockResolvedValue([
			{ suggestion_id: 's-2', ok: true, status: 'addressed' }
		]);
		const result = await actOnCleanupNote({
			...base,
			item: item({
				rows: [row('s-1', 'fp-1', 'Archive brief'), row('s-2', 'fp-2', 'Archive FDE doc')]
			}),
			note: 'Archive the brief but move the FDE doc under Applications',
			reading: reading({
				decision: 'agent',
				agentBrief: 'Move the FDE document under Applications, then archive the brief.',
				reply: 'Handed it to an agent.'
			})
		});
		expect(mocks.decideProjectSuggestionWithClarification).toHaveBeenCalledWith({
			...base,
			suggestionId: 's-1',
			action: 'approve',
			clarification: [
				"Owner's note: Archive the brief but move the FDE doc under Applications",
				'What to do: Move the FDE document under Applications, then archive the brief.',
				'This item also covers: Archive FDE doc. Handle them the same way.'
			].join('\n')
		});
		expect(mocks.runCleanupDecisions.mock.calls[0]![0].decisions).toEqual([
			{
				suggestion_id: 's-2',
				action: 'address',
				note: 'Handed to an agent with "Archive the Genesis opportunity brief": Archive the brief but move the FDE doc under Applications'
			}
		]);
		expect(result).toMatchObject({ ok: true, decision: 'agent', agentRunId: 'run-9' });
	});

	it('says plainly when agents are busy', async () => {
		mocks.decideProjectSuggestionWithClarification.mockResolvedValue({
			ok: false,
			status: 429,
			message: 'capacity'
		});
		const result = await actOnCleanupNote({
			...base,
			item: item(),
			note: 'rename it first',
			reading: reading({ decision: 'agent', agentBrief: 'Rename it.' })
		});
		expect(result).toEqual({
			ok: false,
			status: 429,
			message: 'Agents are busy right now. Try again in a minute.'
		});
		expect(mocks.runCleanupDecisions).not.toHaveBeenCalled();
	});
});
