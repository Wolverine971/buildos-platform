// apps/worker/tests/workspaceBriefSection.test.ts
import { describe, expect, it } from 'vitest';
import {
	buildWorkspaceBriefSection,
	formatWorkspaceLooseEnds,
	isWorkspaceProjectRow
} from '../src/workers/brief/workspaceBriefSection';
import type { OntoDocument, OntoProject, OntoTask } from '../src/workers/brief/ontologyBriefTypes';

const now = new Date('2026-10-23T12:00:00Z');
const task = (id: string, overrides: Partial<OntoTask> = {}) =>
	({
		id,
		project_id: 'ws-1',
		title: `Task ${id}`,
		state_key: 'todo',
		due_at: null,
		created_at: '2026-10-20T00:00:00Z',
		...overrides
	}) as OntoTask;
const doc = (id: string, title: string | null, created_at: string) =>
	({ id, project_id: 'ws-1', title, created_at }) as OntoDocument;
const workspace = { id: 'ws-1', kind: 'workspace' } as OntoProject;

describe('buildWorkspaceBriefSection', () => {
	it('lists open tasks soonest due first and notes saved this week, newest first', () => {
		const section = buildWorkspaceBriefSection(
			{
				project: workspace,
				tasks: [
					task('undated'),
					task('done', { state_key: 'done', due_at: '2026-10-22T00:00:00Z' }),
					task('later', { due_at: '2026-11-03T00:00:00Z' }),
					task('soon', { due_at: '2026-10-24T00:00:00Z' })
				],
				documents: [
					doc('old', 'Last month', '2026-09-20T00:00:00Z'),
					doc('n1', 'Taste Buds pricing', '2026-10-21T00:00:00Z'),
					doc('n2', null, '2026-10-22T00:00:00Z')
				]
			},
			now
		);
		expect(section.openTasks.map((t) => t.id)).toEqual(['soon', 'later', 'undated']);
		expect(section.openTaskCount).toBe(3);
		expect(section.recentNotes).toEqual([
			{ id: 'n2', title: 'Untitled note', created_at: '2026-10-22T00:00:00Z' },
			{ id: 'n1', title: 'Taste Buds pricing', created_at: '2026-10-21T00:00:00Z' }
		]);
		expect(section.recentNoteCount).toBe(2);
	});
});

describe('formatWorkspaceLooseEnds', () => {
	it('says nothing when the Workspace holds nothing loose', () => {
		expect(formatWorkspaceLooseEnds(null)).toBe('');
		expect(
			formatWorkspaceLooseEnds({
				projectId: 'ws-1',
				openTasks: [],
				openTaskCount: 0,
				recentNotes: [],
				recentNoteCount: 0
			})
		).toBe('');
	});

	it('links each loose task and note and counts what is not listed', () => {
		const markdown = formatWorkspaceLooseEnds(
			{
				projectId: 'ws-1',
				openTasks: [
					task('t1', { title: 'Renew [passport]', due_at: '2026-11-03T02:00:00Z' })
				],
				openTaskCount: 6,
				recentNotes: [
					{ id: 'n1', title: 'Taste Buds', created_at: '2026-10-21T00:00:00Z' }
				],
				recentNoteCount: 1
			},
			'America/New_York'
		);
		expect(markdown).toContain('## Loose Ends');
		expect(markdown).toContain(
			'6 open tasks and 1 note saved this week in your [Workspace](/projects)'
		);
		expect(markdown).toContain('- [Renew \\[passport\\]](/projects/ws-1/tasks/t1) — due Nov 2');
		expect(markdown).toContain('- ... and 5 more');
		expect(markdown).toContain('- 📝 [Taste Buds](/projects/ws-1/documents/n1)');
	});
});

describe('isWorkspaceProjectRow', () => {
	it('is true only for the Workspace row', () => {
		expect(isWorkspaceProjectRow(workspace)).toBe(true);
		expect(isWorkspaceProjectRow({ kind: 'project' } as OntoProject)).toBe(false);
		expect(isWorkspaceProjectRow(undefined)).toBe(false);
	});
});
