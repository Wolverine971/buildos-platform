// apps/web/src/lib/components/inbox/project-cleanup-presentation.test.ts
import { describe, expect, it } from 'vitest';
import type { ProjectCleanupItem, ProjectCleanupView } from '@buildos/shared-types';
import {
	CLEANUP_ADDRESS_NOTE,
	CLEANUP_CHANGED_MESSAGE,
	approveDecisionsFor,
	cleanupCloseReasonText,
	cleanupCountsLine,
	cleanupItemCautions,
	cleanupRowOperations,
	cleanupSeenLine,
	addressDecisionsFor,
	dismissDecisionsFor,
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
});
