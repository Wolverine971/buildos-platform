// apps/web/src/lib/components/knowledge/knowledge-sort.test.ts
import { describe, expect, it } from 'vitest';
import {
	knowledgeSortLabel,
	nextKnowledgeSort,
	sortKnowledgeRows,
	type KnowledgeSortState
} from './knowledge-sort';
import { emptyWhere, type KnowledgeWhere } from './where-types';

const task = (id: string) => ({
	id,
	kind: 'task' as const,
	title: id,
	project_id: null,
	project_name: null,
	done: false,
	quote: null
});
const doc = (id: string) => ({ ...task(id), kind: 'document' as const });
const project = (id: string) => ({ id, name: id, count: 1, quote: null });

// Same shape as the database check (knowledge_list_column_sorts.check.sql), so the browser's
// order for a project's entries can be read against the server's.
const rows = [
	{ id: 'e', name: 'Eve', updated_at: '2026-11-05T00:00:00Z', researched_at: null },
	{ id: 'c', name: 'Cy', updated_at: '2026-11-03T00:00:00Z', researched_at: null },
	{
		id: 'a',
		name: 'Ann',
		updated_at: '2026-11-01T00:00:00Z',
		researched_at: '2026-11-10T00:00:00Z'
	},
	{
		id: 'd',
		name: 'dee',
		updated_at: '2026-11-04T00:00:00Z',
		researched_at: '2026-11-20T00:00:00Z'
	},
	{ id: 'b', name: 'Ben', updated_at: '2026-11-02T00:00:00Z', researched_at: null }
];
const where = new Map<string, KnowledgeWhere>([
	[
		'a',
		{
			projects: [project('alpha'), project('beta')],
			tasks: [task('t1'), task('t2'), task('t3')],
			documents: [doc('d2')]
		}
	],
	[
		'b',
		{
			projects: [project('alpha'), project('beta')],
			tasks: [task('t4')],
			documents: [doc('d1'), doc('d2')]
		}
	],
	['c', { ...emptyWhere(), projects: [project('beta')] }],
	['d', emptyWhere()]
	// Eve's "where" hasn't loaded: counts as none.
]);

const order = (key: KnowledgeSortState['key'], dir: KnowledgeSortState['dir']) =>
	sortKnowledgeRows(rows, { key, dir }, where)
		.map((r) => r.name)
		.join(',');

describe('sortKnowledgeRows', () => {
	it('puts the most first, and A–Z inside a tie', () => {
		expect(order('tasks', 'desc')).toBe('Ann,Ben,Cy,dee,Eve');
		expect(order('documents', 'desc')).toBe('Ben,Ann,Cy,dee,Eve');
		expect(order('projects', 'desc')).toBe('Ann,Ben,Cy,dee,Eve');
	});

	it('flips to the fewest first and keeps ties A–Z', () => {
		expect(order('tasks', 'asc')).toBe('Cy,dee,Eve,Ben,Ann');
		expect(order('documents', 'asc')).toBe('Cy,dee,Eve,Ann,Ben');
		expect(order('projects', 'asc')).toBe('dee,Eve,Cy,Ann,Ben');
	});

	it('sorts names both ways without minding capitals', () => {
		expect(order('name', 'asc')).toBe('Ann,Ben,Cy,dee,Eve');
		expect(order('name', 'desc')).toBe('Eve,dee,Cy,Ben,Ann');
	});

	it('sorts by last update both ways', () => {
		expect(order('recent', 'desc')).toBe('Eve,dee,Cy,Ben,Ann');
		expect(order('recent', 'asc')).toBe('Ann,Ben,Cy,dee,Eve');
	});

	it('keeps never-researched entries last in both directions', () => {
		expect(order('researched', 'desc')).toBe('dee,Ann,Eve,Cy,Ben');
		expect(order('researched', 'asc')).toBe('Ann,dee,Eve,Cy,Ben');
	});

	it('leaves the list it was given untouched', () => {
		const before = rows.map((r) => r.id).join('');
		sortKnowledgeRows(rows, { key: 'name', dir: 'asc' }, where);
		expect(rows.map((r) => r.id).join('')).toBe(before);
	});
});

describe('nextKnowledgeSort', () => {
	it('starts a new column in its usual direction', () => {
		expect(nextKnowledgeSort({ key: 'recent', dir: 'desc' }, 'name')).toEqual({
			key: 'name',
			dir: 'asc'
		});
		expect(nextKnowledgeSort({ key: 'name', dir: 'desc' }, 'tasks')).toEqual({
			key: 'tasks',
			dir: 'desc'
		});
	});

	it('flips the column already in use, and back', () => {
		const once = nextKnowledgeSort({ key: 'tasks', dir: 'desc' }, 'tasks');
		expect(once).toEqual({ key: 'tasks', dir: 'asc' });
		expect(nextKnowledgeSort(once, 'tasks')).toEqual({ key: 'tasks', dir: 'desc' });
	});
});

describe('knowledgeSortLabel', () => {
	it('names the direction in use', () => {
		expect(knowledgeSortLabel('name')).toBe('Name A–Z');
		expect(knowledgeSortLabel('name', 'desc')).toBe('Name Z–A');
		expect(knowledgeSortLabel('tasks')).toBe('Most tasks');
		expect(knowledgeSortLabel('documents', 'asc')).toBe('Fewest docs');
	});
});
