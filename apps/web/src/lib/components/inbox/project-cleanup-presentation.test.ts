// apps/web/src/lib/components/inbox/project-cleanup-presentation.test.ts
import { describe, expect, it } from 'vitest';
import type { ProjectCleanupItem, ProjectCleanupView } from '@buildos/shared-types';
import {
	CLEANUP_ADDRESS_NOTE,
	CLEANUP_CHANGED_MESSAGE,
	approveDecisionsFor,
	cleanupAnswerNote,
	cleanupAnswerReceipt,
	cleanupAskCounts,
	cleanupAskSummaryLine,
	cleanupCloseReasonText,
	cleanupItemAskKind,
	cleanupCountsLine,
	cleanupItemCautions,
	cleanupRowOperations,
	cleanupSeenLine,
	addressDecisionsFor,
	dismissDecisionsFor,
	groupCleanupByAsk,
	isCleanupItemSelectable,
	orderedCleanupGroups,
	summarizeCleanupItemOutcome
} from './project-cleanup-presentation';

function item(overrides: Partial<ProjectCleanupItem> = {}): ProjectCleanupItem {
	return {
		id: 'lineage-1',
		source: 'review',
		kind: 'doc_org',
		section: 'safe_cleanup',
		title: 'Archive Political Analysis',
		summary: 'Empty since May.',
		why_now: null,
		executable: true,
		rows: [
			{
				suggestion_id: 'suggestion-1',
				kind: 'doc_org',
				title: 'Archive Political Analysis',
				operation_count: 1,
				verified_headline: 'Archive Political Analysis',
				verified_fingerprint: 'fp-1',
				updated_at: '2026-09-29T12:00:00.000Z'
			}
		],
		evidence_refs: [],
		seen_count: 1,
		first_seen_at: '2026-09-04T12:00:00.000Z',
		updated_at: '2026-09-29T12:00:00.000Z',
		...overrides
	};
}

function view(
	items: ProjectCleanupItem[],
	groups: ProjectCleanupView['groups']
): ProjectCleanupView {
	return {
		project_id: 'project-1',
		items,
		groups,
		bottom_line: null,
		recommendation: null,
		synthesized_at: null,
		latest_run_id: null,
		latest_audit: null,
		counts: { total: items.length, safe_cleanup: 0, needs_call: 0, note: 0 },
		recently_closed: []
	};
}

describe('project cleanup presentation', () => {
	it('writes a plain counts line', () => {
		expect(cleanupCountsLine({ total: 6, safe_cleanup: 3, needs_call: 1, note: 2 })).toBe(
			'3 ready to apply · 1 needs your call · 2 worth knowing'
		);
		expect(cleanupCountsLine({ total: 0, safe_cleanup: 0, needs_call: 0, note: 0 })).toBe(
			'Nothing open'
		);
	});

	it('only lets a fully verified change be picked', () => {
		expect(isCleanupItemSelectable(item())).toBe(true);
		expect(isCleanupItemSelectable(item({ executable: false }))).toBe(false);
		expect(
			isCleanupItemSelectable(
				item({
					rows: [
						...item().rows,
						{
							...item().rows[0]!,
							suggestion_id: 'suggestion-2',
							verified_fingerprint: null
						}
					]
				})
			)
		).toBe(false);
	});

	it('mentions repeat sightings and dedupes cautions', () => {
		expect(cleanupSeenLine(item())).toBeNull();
		expect(cleanupSeenLine(item({ seen_count: 3 }))).toMatch(/^Seen in 3 reviews since /);
		expect(
			cleanupItemCautions(
				item({
					rows: [
						{ ...item().rows[0]!, cautions: ['Has 4 child documents'] },
						{
							...item().rows[0]!,
							suggestion_id: 'suggestion-2',
							cautions: ['Has 4 child documents', 'Linked to a goal']
						}
					]
				})
			)
		).toEqual(['Has 4 child documents', 'Linked to a goal']);
	});

	it('explains every close reason in plain English', () => {
		const closed = (reason: any, detail = '') => ({
			lineage_id: 'l',
			title: 't',
			reason,
			detail
		});
		expect(cleanupCloseReasonText(closed('subject_archived'))).toBe('archived');
		expect(cleanupCloseReasonText(closed('already_done'))).toBe('already done');
		expect(cleanupCloseReasonText(closed('resolved', 'You retitled the goal'))).toBe(
			'You retitled the goal'
		);
		expect(cleanupCloseReasonText(closed('merged'))).toBe('merged into another item');
		expect(cleanupCloseReasonText(closed('aged_out'))).toBe('no longer flagged');
		expect(cleanupCloseReasonText(closed('no_longer_applies'))).toBe('no longer applies');
		expect(cleanupCloseReasonText(closed('revised'))).toBe('replaced by an updated version');
	});

	it('resolves groups in order and keeps items the groups missed', () => {
		const a = item({ id: 'a' });
		const b = item({ id: 'b', section: 'needs_call' });
		const c = item({ id: 'c', section: 'note', executable: false });
		const groups = orderedCleanupGroups(
			view(
				[a, b, c],
				[
					{
						title: 'Archive stale docs',
						section: 'safe_cleanup',
						item_ids: ['a', 'missing'],
						recommendation: 'Do it'
					},
					{
						title: 'Needs your call',
						section: 'needs_call',
						item_ids: ['b'],
						recommendation: null
					}
				]
			)
		);
		expect(groups.map((group) => [group.title, group.items.map((i) => i.id)])).toEqual([
			['Archive stale docs', ['a']],
			['Needs your call', ['b']],
			['Worth knowing', ['c']]
		]);
	});

	it('builds one decision per row', () => {
		const picked = item({
			rows: [
				...item().rows,
				{ ...item().rows[0]!, suggestion_id: 'suggestion-2', verified_fingerprint: 'fp-2' }
			]
		});
		expect(approveDecisionsFor([picked])).toEqual([
			{ suggestion_id: 'suggestion-1', action: 'approve', expected_fingerprint: 'fp-1' },
			{ suggestion_id: 'suggestion-2', action: 'approve', expected_fingerprint: 'fp-2' }
		]);
		expect(dismissDecisionsFor(item(), 'too_risky', '  keep it  ')).toEqual([
			{
				suggestion_id: 'suggestion-1',
				action: 'dismiss',
				reason: 'too_risky',
				note: 'keep it'
			}
		]);
		expect(dismissDecisionsFor(item(), 'not_relevant', '')).toEqual([
			{ suggestion_id: 'suggestion-1', action: 'dismiss', reason: 'not_relevant' }
		]);
		expect(addressDecisionsFor(item())).toEqual([
			{ suggestion_id: 'suggestion-1', action: 'address', note: CLEANUP_ADDRESS_NOTE }
		]);
	});

	it('rolls row outcomes up per item: changed beats failed beats done', () => {
		const two = item({
			rows: [...item().rows, { ...item().rows[0]!, suggestion_id: 'suggestion-2' }]
		});
		expect(
			summarizeCleanupItemOutcome(two, [
				{ suggestion_id: 'suggestion-1', ok: true, status: 'applied' },
				{ suggestion_id: 'suggestion-2', ok: false, status: 'changed' }
			])
		).toEqual({ status: 'changed', message: CLEANUP_CHANGED_MESSAGE });
		expect(
			summarizeCleanupItemOutcome(two, [
				{ suggestion_id: 'suggestion-1', ok: true, status: 'applied' },
				{
					suggestion_id: 'suggestion-2',
					ok: false,
					status: 'failed',
					message: 'Doc is locked'
				}
			])
		).toEqual({ status: 'failed', message: 'Doc is locked' });
		expect(
			summarizeCleanupItemOutcome(two, [
				{ suggestion_id: 'suggestion-1', ok: true, status: 'already_decided' },
				{ suggestion_id: 'suggestion-2', ok: true, status: 'applied' }
			])
		).toEqual({ status: 'applied', message: null });
		expect(
			summarizeCleanupItemOutcome(item(), [
				{ suggestion_id: 'suggestion-1', ok: true, status: 'rejected' }
			])
		).toEqual({ status: 'rejected', message: null });
		expect(summarizeCleanupItemOutcome(item(), [])).toBeNull();
	});

	it('normalizes decoded operations defensively', () => {
		expect(
			cleanupRowOperations([
				{
					key: 'op-a',
					actionLabel: 'Move',
					entityLabel: 'document',
					target: 'Rod folder',
					summary: null,
					changes: [
						{ label: 'Parent', value: 'Processes & Specs', before: 'Root' },
						{ label: 'bad' },
						{ label: 'Replace', value: 'new', before: 'old', format: 'text_edit' }
					]
				},
				{}
			])
		).toEqual([
			{
				key: 'op-a',
				label: 'Move document',
				target: 'Rod folder',
				summary: null,
				changes: [
					{
						label: 'Parent',
						value: 'Processes & Specs',
						before: 'Root',
						textEdit: false
					},
					{ label: 'Replace', value: 'new', before: 'old', textEdit: true }
				]
			},
			{ key: 'op-1', label: 'Change', target: null, summary: null, changes: [] }
		]);
	});

	it('reads what an item asks, falling back to the server rule on older views', () => {
		expect(cleanupItemAskKind(item({ ask_kind: 'offer' }))).toBe('offer');
		expect(cleanupItemAskKind(item())).toBe('tidy');
		expect(cleanupItemAskKind(item({ source: 'audit' }))).toBe('offer');
		expect(cleanupItemAskKind(item({ source: 'radar', section: 'safe_cleanup' }))).toBe(
			'stale'
		);
		expect(cleanupItemAskKind(item({ section: 'needs_call' }))).toBe('path');
		expect(cleanupItemAskKind(item({ section: 'note', executable: false }))).toBe('stale');
	});

	it('groups items by what they ask, asks first, each item once', () => {
		const tidy = item({ id: 'tidy', ask_kind: 'tidy' });
		const covered = item({ id: 'covered', ask_kind: 'tidy' });
		const goal = item({ id: 'goal', ask_kind: 'stale', executable: false, section: 'note' });
		const path = item({ id: 'path', ask_kind: 'path', section: 'needs_call', summary: null });
		const offer = item({ id: 'offer', ask_kind: 'offer', source: 'audit' });
		const radar = item({ id: 'radar', ask_kind: 'stale', source: 'radar' });
		const base = view(
			[tidy, covered, goal, path, offer, radar],
			[
				{
					title: 'Ready',
					section: 'safe_cleanup',
					item_ids: ['covered', 'tidy'],
					recommendation: null
				},
				{
					title: 'Calls',
					section: 'needs_call',
					item_ids: ['radar', 'path', 'goal', 'offer'],
					recommendation: null
				}
			]
		);
		const blocks = groupCleanupByAsk({
			...base,
			asks: [
				{
					id: 'rod',
					question: 'Is the Rod site still happening?',
					context: 'Two items point the same way.',
					item_ids: ['goal', 'covered', 'missing'],
					answers: [
						{ label: 'Still going', effect: null, action: 'note', recommended: true },
						{
							label: 'On hold',
							effect: 'Mark it on hold.',
							action: 'note',
							recommended: true
						},
						{
							label: 'Bogus',
							effect: null,
							action: 'explode' as never,
							recommended: false
						}
					]
				},
				// Every item already claimed: dropped.
				{
					id: 'dupe',
					question: 'Again?',
					context: null,
					item_ids: ['goal'],
					answers: [
						{ label: 'Yes', effect: null, action: 'done', recommended: false },
						{ label: 'No', effect: null, action: 'dismiss', recommended: false }
					]
				},
				// Fewer than two usable answers: dropped, its item stays in its own block.
				{
					id: 'thin',
					question: 'Only one way?',
					context: null,
					item_ids: ['offer'],
					answers: [{ label: 'Yes', effect: null, action: 'chat', recommended: false }]
				}
			],
			auto_applied: [
				{
					item_id: 'auto',
					suggestion_id: 's-auto',
					title: 'Moved Templates under Processes & Specs',
					applied_at: '2026-10-29T10:00:00.000Z',
					reason: 'It is a template.',
					undoable: true
				}
			]
		});

		expect(blocks.paths.map((entry) => entry.key)).toEqual(['ask:rod', 'item:path']);
		const rod = blocks.paths[0]!;
		expect(rod.items.map((entry) => entry.id)).toEqual(['goal', 'covered']);
		expect(rod.ask.item_ids).toEqual(['goal', 'covered']);
		expect(rod.ask.answers.map((answer) => [answer.label, answer.recommended])).toEqual([
			['Still going', true],
			['On hold', false]
		]);
		expect(blocks.paths[1]).toMatchObject({
			fromItem: true,
			ask: {
				question: path.title,
				context: null,
				answers: [
					{ label: 'Make this change', action: 'apply', recommended: true },
					{ label: 'Keep as is', action: 'dismiss', recommended: false }
				]
			}
		});
		expect(blocks.tidy.map((entry) => entry.id)).toEqual(['tidy']);
		expect(blocks.stale.map((entry) => entry.id)).toEqual(['radar']);
		expect(blocks.offers.map((entry) => entry.id)).toEqual(['offer']);
		expect(blocks.autoApplied).toHaveLength(1);

		expect(cleanupAskCounts(blocks)).toEqual([
			{ key: 'path', count: 2, label: 'paths to pick' },
			{ key: 'tidy', count: 1, label: 'tidy-up' },
			{ key: 'stale', count: 1, label: 'out of date' },
			{ key: 'offer', count: 1, label: 'offer' },
			{ key: 'done', count: 1, label: 'done for you' }
		]);
		expect(cleanupAskSummaryLine(blocks)).toBe(
			'2 paths to pick · 1 tidy-up · 1 out of date · 1 offer'
		);
		expect(cleanupAskSummaryLine(groupCleanupByAsk(null))).toBe('Nothing open');
	});

	it('writes the note and receipt for an answer', () => {
		const answer = {
			label: 'On hold',
			effect: 'Mark the goal on hold with a date.',
			action: 'note' as const,
			recommended: true
		};
		expect(cleanupAnswerNote('Is the Rod site still happening?', answer)).toBe(
			'Is the Rod site still happening? — On hold: Mark the goal on hold with a date.'
		);
		expect(cleanupAnswerNote('Keep it?', { ...answer, effect: null })).toBe(
			'Keep it? — On hold'
		);
		expect(cleanupAnswerReceipt(answer)).toBe('On hold. Mark the goal on hold with a date.');
		expect(cleanupAnswerReceipt({ ...answer, label: "It's over!", effect: null })).toBe(
			"It's over!"
		);
	});
});
