// apps/web/src/lib/components/workspace/workspace-model.test.ts
import { describe, expect, it } from 'vitest';
import {
	excerptOf,
	filingByItem,
	isLiveSuggestion,
	itemRef,
	matchesLooseFilter,
	noteTitleFromText,
	type LooseItem,
	type WorkspaceSuggestion
} from './workspace-model';

const item = (id: string, kind: LooseItem['kind']): LooseItem => ({
	id,
	entity: kind === 'task' ? 'task' : 'document',
	kind,
	title: id,
	excerpt: null,
	created_at: '2026-10-23T00:00:00Z',
	updated_at: '2026-10-23T00:00:00Z'
});
const suggestion = (
	kind: WorkspaceSuggestion['kind'],
	items: WorkspaceSuggestion['items'],
	target: string | null = null
): WorkspaceSuggestion => ({
	id: `${kind}-${items.map((ref) => ref.id).join('-')}`,
	kind,
	reason: '',
	confidence: 0.8,
	proposed_name: kind === 'graduate' ? 'AI Taste Buds' : null,
	target_project_id: target,
	items,
	created_at: '2026-10-23T00:00:00Z'
});

describe('noteTitleFromText', () => {
	it('takes the first non-empty line without heading marks', () => {
		expect(noteTitleFromText('\n\n## Taste Buds pricing\nFree tier, then $4')).toBe(
			'Taste Buds pricing'
		);
		expect(noteTitleFromText('   \n  ')).toBe('Untitled note');
	});

	it('cuts a long first line at a word', () => {
		const title = noteTitleFromText(`${'word '.repeat(30)}end`);
		expect(title.endsWith('…')).toBe(true);
		expect(title.length).toBeLessThanOrEqual(81);
		expect(title).not.toMatch(/wor…$/);
	});
});

describe('excerptOf', () => {
	it('drops the title line and folds markdown and whitespace', () => {
		expect(excerptOf('# Pricing\n\n**Free** tier,\n  then $4', 'Pricing')).toBe(
			'Free tier, then $4'
		);
		expect(excerptOf('Only a title', 'Only a title')).toBeNull();
		expect(excerptOf(null)).toBeNull();
	});
});

describe('suggestions', () => {
	const byRef = new Map([item('d1', 'note'), item('t1', 'task')].map((i) => [itemRef(i), i]));

	it('shows a new-project suggestion only while two of its items are still loose', () => {
		const both = suggestion('graduate', [
			{ entity: 'document', id: 'd1' },
			{ entity: 'task', id: 't1' }
		]);
		const oneLeft = suggestion('graduate', [
			{ entity: 'document', id: 'd1' },
			{ entity: 'document', id: 'gone' }
		]);
		expect(isLiveSuggestion(both, byRef)).toBe(true);
		expect(isLiveSuggestion(oneLeft, byRef)).toBe(false);
		expect(
			isLiveSuggestion(suggestion('file', [{ entity: 'task', id: 't1' }], 'p1'), byRef)
		).toBe(true);
		expect(
			isLiveSuggestion(suggestion('file', [{ entity: 'task', id: 'gone' }], 'p1'), byRef)
		).toBe(false);
	});

	it('maps each item to the first filing suggestion that names it', () => {
		const first = suggestion('file', [{ entity: 'task', id: 't1' }], 'p1');
		const second = suggestion('file', [{ entity: 'task', id: 't1' }], 'p2');
		const graduate = suggestion('graduate', [{ entity: 'document', id: 'd1' }]);
		const map = filingByItem([graduate, first, second]);
		expect(map.get('task:t1')).toBe(first);
		expect(map.has('document:d1')).toBe(false);
	});
});

describe('matchesLooseFilter', () => {
	it('filters by kind', () => {
		expect(matchesLooseFilter(item('a', 'note'), 'notes')).toBe(true);
		expect(matchesLooseFilter(item('a', 'note'), 'docs')).toBe(false);
		expect(matchesLooseFilter(item('a', 'doc'), 'docs')).toBe(true);
		expect(matchesLooseFilter(item('a', 'task'), 'all')).toBe(true);
	});
});
