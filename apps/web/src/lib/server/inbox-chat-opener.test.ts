// apps/web/src/lib/server/inbox-chat-opener.test.ts
import { describe, expect, it } from 'vitest';
import type { ProjectCleanupItem } from '@buildos/shared-types';
import { buildCleanupItemOpener } from './inbox-chat-opener';

function item(overrides: Partial<ProjectCleanupItem> = {}): ProjectCleanupItem {
	return {
		id: 'lineage-1',
		source: 'review',
		kind: 'drift',
		section: 'needs_call',
		title: 'Wayne Strategies project type still labels it a website service',
		summary:
			'Decide whether to change the project type from a website service to a strategy service.',
		why_now: 'The September rebrand reframed Wayne Strategies as a strategy practice.',
		executable: true,
		rows: [
			{
				suggestion_id: 'suggestion-1',
				kind: 'drift',
				title: 'Change project type',
				operation_count: 1,
				verified_headline: 'Change project type: Website service → Strategy service',
				verified_fingerprint: 'fp-1',
				updated_at: '2026-10-20T00:00:00Z'
			}
		],
		evidence_refs: [],
		seen_count: 3,
		first_seen_at: '2026-10-01T00:00:00Z',
		updated_at: '2026-10-20T00:00:00Z',
		...overrides
	};
}

describe('buildCleanupItemOpener', () => {
	it('proposes the verified change and asks for a go-ahead', () => {
		const text = buildCleanupItemOpener({ item: item() });
		expect(text.split('\n')[0]).toBe(
			'Decide whether to change the project type from a website service to a strategy service.'
		);
		expect(text).toContain('The September rebrand reframed Wayne Strategies');
		expect(text).toContain("Here's what I'd change:");
		expect(text).toContain('- Change project type: Website service → Strategy service');
		expect(text.trim().endsWith('Say yes, or tell me what to do differently.')).toBe(true);
		// Never the whole-list report.
		expect(text).not.toContain('project cleanup');
		expect(text).not.toContain('Bottom line');
	});

	it('surfaces cautions on a change', () => {
		const text = buildCleanupItemOpener({
			item: item({
				rows: [
					{
						...item().rows[0]!,
						cautions: ['This document has a live public page.']
					}
				]
			})
		});
		expect(text).toContain('Heads up: This document has a live public page.');
	});

	it('offers to do the legwork for an audit recommendation instead of assigning it', () => {
		const text = buildCleanupItemOpener({
			item: item({
				source: 'audit',
				kind: 'audit_recommendation',
				executable: false,
				title: 'Create a risk and decision register',
				summary:
					'Document potential risks (engagement, time, materials) and key decisions.',
				why_now: null,
				rows: [
					{
						suggestion_id: 'suggestion-2',
						kind: 'audit_recommendation',
						title: 'Create a risk and decision register',
						operation_count: 0,
						verified_headline: null,
						verified_fingerprint: null,
						updated_at: '2026-07-07T00:00:00Z'
					}
				]
			})
		});
		expect(text).toContain(
			'The last audit suggested: **Create a risk and decision register**.'
		);
		expect(text).toContain('Document potential risks');
		expect(text).toContain('I can do the legwork');
		expect(text).toContain('Want me to start?');
	});

	it('speaks first about one out-of-date record', () => {
		const text = buildCleanupItemOpener({
			item: item({
				source: 'radar',
				kind: 'freshness_update',
				executable: false,
				rows: []
			}),
			reviewItem: {
				concern_id: 'concern-1',
				entity_type: 'document',
				entity_id: 'doc-1',
				title: 'Client Work',
				reason: 'May be out of date. Seen in 3 separate checks.',
				fix_in_chat_prompt: '"Client Work" looks out of date.'
			}
		});
		expect(text.split('\n')[0]).toBe('I think the **Client Work** doc is out of date.');
		expect(text).toContain('My note on it: May be out of date. Seen in 3 separate checks.');
		expect(text).toContain('update only the parts that changed');
		// The user's pre-filled request is not the opener.
		expect(text).not.toContain('"Client Work" looks out of date.');
	});

	it('asks where a finding stands when there is nothing to apply', () => {
		const text = buildCleanupItemOpener({
			item: item({
				kind: 'drift',
				section: 'note',
				executable: false,
				title: 'Project Context and Strategy still describes the business as Tacemus',
				summary: 'Update its description so it reflects Wayne Strategies',
				why_now: null,
				rows: [
					{
						suggestion_id: 'suggestion-3',
						kind: 'drift',
						title: 'Project Context description',
						operation_count: 0,
						verified_headline: null,
						verified_fingerprint: null,
						updated_at: '2026-10-20T00:00:00Z'
					}
				]
			})
		});
		expect(text).toContain(
			'Project Context and Strategy still describes the business as Tacemus.'
		);
		expect(text).toContain('Update its description so it reflects Wayne Strategies.');
		expect(text).toContain("Where does this stand now? Tell me and I'll update the project");
	});

	it('leads with a pre-written question and what each answer would do', () => {
		const text = buildCleanupItemOpener({
			item: item({ title: 'Rod Chamberlin', executable: false }),
			ask: {
				id: 'ask:rod',
				question: 'Is the Rod Chamberlin website still happening?',
				context: 'The Rod doc and the book-site goal both look out of date.',
				item_ids: ['lineage-1', 'lineage-2'],
				answers: [
					{
						label: 'Still going',
						effect: 'I update the Rod doc.',
						action: 'note',
						recommended: false
					},
					{
						label: 'On hold',
						effect: 'Marks the goal on hold',
						action: 'note',
						recommended: true
					},
					{
						label: "It's over",
						effect: 'Closes the goal.',
						action: 'note',
						recommended: false
					}
				]
			},
			askItemTitles: ['"Rod Chamberlin" doc', 'Goal: Launch Rob Chamberlin book website']
		});
		const lines = text.split('\n');
		expect(lines[0]).toBe('Is the Rod Chamberlin website still happening?');
		expect(text).toContain(
			'This settles 2 things: "Rod Chamberlin" doc; Goal: Launch Rob Chamberlin book website.'
		);
		expect(text).toContain('- **On hold** (my pick): Marks the goal on hold.');
		expect(text).toContain('- **Still going**: I update the Rod doc.');
		expect(
			text
				.trim()
				.endsWith('Which one? Or tell me what is different and I will work from that.')
		).toBe(true);
	});

	it('ignores an ask with fewer than two answers', () => {
		const text = buildCleanupItemOpener({
			item: item(),
			ask: {
				id: 'ask:x',
				question: 'Q?',
				context: null,
				item_ids: ['lineage-1'],
				answers: []
			}
		});
		expect(text).toContain("Here's what I'd change:");
	});
});
