// packages/shared-agent-ops/src/inbox-index.freshness.test.ts
// Tasker 106: the freshness roll-up's single inbox item counts review items
// (fixed in chat) as well as operations, and never offers approve without one.
import { describe, expect, it } from 'vitest';
import {
	freshnessBundleInboxSummary,
	freshnessBundleInboxTitle,
	mapProjectSuggestionToInboxItem
} from './inbox-index';

const reviewItem = (id: string, entityType = 'document') => ({
	concern_id: `concern-${id}`,
	entity_type: entityType,
	entity_id: id,
	title: `Record ${id}`,
	reason: 'A section looks out of date.',
	fix_in_chat_prompt: 'Update it.'
});

function bundle(extra: Record<string, unknown> = {}) {
	return {
		id: 'bundle-1',
		project_id: 'project-1',
		kind: 'freshness_update',
		status: 'pending',
		title: 'ignored model-free title',
		operations: [],
		preview: { kind: 'generic', summary: 'x', review_items: [reviewItem('doc-1')] },
		created_at: '2026-09-24T12:00:00.000Z',
		updated_at: '2026-09-24T12:00:00.000Z',
		...extra
	};
}

describe('freshness roll-up inbox item', () => {
	it('titles by operations plus review items', () => {
		expect(freshnessBundleInboxTitle(1)).toBe('1 thing looks out of date');
		expect(freshnessBundleInboxTitle(3)).toBe('3 things look out of date');
	});

	it('a review-only item offers dismiss (and chat), never approve', () => {
		const row = mapProjectSuggestionToInboxItem(bundle());
		expect(row).toMatchObject({
			title: '1 thing looks out of date',
			action_kinds: ['reject'],
			audience: 'project_members',
			status: 'pending'
		});
	});

	it('a mixed item approves its operations and counts every kind in the summary', () => {
		const suggestion = bundle({
			operations: [{ tool: 'update_onto_task', args: { task_id: 't1', state_key: 'done' } }],
			preview: {
				kind: 'generic',
				summary: 'x',
				review_items: [reviewItem('doc-1'), reviewItem('t2', 'task')]
			}
		});
		const row = mapProjectSuggestionToInboxItem(suggestion);
		expect(row).toMatchObject({
			title: '3 things look out of date',
			action_kinds: ['approve', 'reject']
		});
		expect(freshnessBundleInboxSummary(suggestion)).toBe(
			'From your update on Sep 24 · 2 tasks, 1 document'
		);
	});
});
