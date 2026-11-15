// apps/web/src/lib/components/workspace/find-model.test.ts
import { describe, expect, it } from 'vitest';
import {
	MARK_CLOSE,
	MARK_OPEN,
	displayKind,
	groupFindResults,
	isDone,
	normalizeFindQuery,
	openHref,
	parseOpenParam,
	shouldAskBestMatch,
	splitMarks,
	visibleFindItems,
	type BestMatchItem,
	type FindItem
} from './find-model';

const UUID = '6c76ab95-1111-4222-8333-444455556666';

function item(overrides: Partial<FindItem> = {}): FindItem {
	return {
		kind: 'task',
		id: UUID,
		project_id: 'p1',
		project_name: 'The Cadre',
		in_workspace: false,
		title: 'Call the gunsmith back',
		snippet: null,
		state_key: 'todo',
		type_key: 'task.default',
		due_at: null,
		updated_at: '2026-11-01T00:00:00Z',
		...overrides
	};
}

describe('find query', () => {
	it('folds whitespace and caps length', () => {
		expect(normalizeFindQuery('  gift \n list  ')).toBe('gift list');
		expect(normalizeFindQuery(42)).toBe('');
		expect(normalizeFindQuery('x'.repeat(500))).toHaveLength(200);
	});

	it('asks for a best match on 3+ words or thin word matches only', () => {
		expect(shouldAskBestMatch('gift ideas for mom', 12)).toBe(true);
		expect(shouldAskBestMatch('gunsmith', 4)).toBe(false);
		expect(shouldAskBestMatch('gunsmtih', 0)).toBe(true);
		// Too short to be worth a model call, even with nothing found.
		expect(shouldAskBestMatch('gu', 0)).toBe(false);
		expect(shouldAskBestMatch(' ', 0)).toBe(false);
	});
});

describe('snippet marks', () => {
	it('splits marked runs without markup', () => {
		expect(splitMarks(`ask the ${MARK_OPEN}gunsmith${MARK_CLOSE} about\nthe scope`)).toEqual([
			{ text: 'ask the ', mark: false },
			{ text: 'gunsmith', mark: true },
			{ text: ' about the scope', mark: false }
		]);
		expect(splitMarks('5 < 6 & <i')).toEqual([{ text: '5 < 6 & <i', mark: false }]);
		expect(splitMarks(`### The ${MARK_OPEN}Gunsmith${MARK_CLOSE} Saga`)).toEqual([
			{ text: ' The ', mark: false },
			{ text: 'Gunsmith', mark: true },
			{ text: ' Saga', mark: false }
		]);
		expect(splitMarks(null)).toEqual([]);
	});
});

describe('kinds', () => {
	it('tells notes from docs by type_key and marks done tasks', () => {
		expect(displayKind(item({ kind: 'document', type_key: 'document.note' }))).toBe('note');
		expect(displayKind(item({ kind: 'document', type_key: 'document.knowledge' }))).toBe('doc');
		expect(isDone(item({ state_key: 'done' }))).toBe(true);
		expect(isDone(item({ kind: 'project', state_key: 'completed' }))).toBe(false);
	});
});

describe('grouping', () => {
	it('puts the best match first and never repeats an item', () => {
		const ws = item({ id: 'a', in_workspace: true, project_name: 'Workspace' });
		const proj = item({ id: 'b', kind: 'project', title: 'The Cadre' });
		const rec = item({ id: 'c' });
		const best: BestMatchItem[] = [{ ...rec, p: 0.9 }];
		const groups = groupFindResults([ws, proj, rec], best);
		expect(groups.best.map((x) => x.id)).toEqual(['c']);
		expect(groups.workspace.map((x) => x.id)).toEqual(['a']);
		expect(groups.projects.map((x) => x.id)).toEqual(['b']);
		expect(groups.inProjects).toEqual([]);
	});

	it('lists what shows, top to bottom, within each group’s limit', () => {
		const groups = groupFindResults(
			[1, 2, 3]
				.map((n) => item({ id: `w${n}`, in_workspace: true }))
				.concat([1, 2].map((n) => item({ id: `r${n}` }))),
			[{ ...item({ id: 'b' }), p: 0.8 }]
		);
		expect(
			visibleFindItems(groups, { best: 5, workspace: 2, projects: 4, inProjects: 1 }).map(
				(x) => x.id
			)
		).toEqual(['b', 'w1', 'w2', 'r1']);
	});
});

describe('item links', () => {
	it('parses kind:id and accepts note/doc as documents', () => {
		expect(parseOpenParam(`task:${UUID}`)).toEqual({ kind: 'task', id: UUID });
		expect(parseOpenParam(`note:${UUID.toUpperCase()}`)).toEqual({
			kind: 'document',
			id: UUID
		});
		expect(parseOpenParam('task:not-a-uuid')).toBeNull();
		expect(parseOpenParam(`plan:${UUID}`)).toBeNull();
		expect(parseOpenParam(null)).toBeNull();
		expect(openHref({ kind: 'goal', id: UUID })).toBe(`/projects?open=goal:${UUID}`);
	});
});
