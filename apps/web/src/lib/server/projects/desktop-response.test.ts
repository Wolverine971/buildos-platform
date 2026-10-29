// apps/web/src/lib/server/projects/desktop-response.test.ts
import { describe, expect, it } from 'vitest';
import type { ProjectSignals } from '$lib/components/projects/desktop/desktop-signals';
import type { WorkspaceHome } from '$lib/components/workspace/workspace-model';
import {
	buildDesktopResponse,
	type DesktopProject,
	type DesktopReads,
	type DesktopSummary
} from './desktop-response';

const NOW = Date.parse('2026-10-29T12:00:00Z');
const DAY = 86_400_000;
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();

function summary(overrides: Partial<DesktopSummary> & { id: string; name: string }) {
	return {
		kind: 'project',
		state_key: 'active',
		updated_at: ago(1),
		next_step_short: null,
		document_count: 1,
		task_count: 0,
		...overrides
	} as DesktopSummary;
}

function signals(overrides: Partial<ProjectSignals> = {}): ProjectSignals {
	return {
		last_touch_at: null,
		done_recent: 0,
		overdue: 0,
		in_progress: 0,
		scheduled: 0,
		backlog: 0,
		...overrides
	};
}

const SUMMARIES = [
	summary({
		id: 'a',
		name: 'Alpha',
		updated_at: ago(5),
		document_count: 4,
		task_count: 5,
		next_step_short: 'Draft the intro'
	}),
	summary({ id: 'b', name: 'Beta', updated_at: ago(1), document_count: 1, task_count: 6 }),
	summary({
		id: 'c',
		name: 'Gamma',
		state_key: 'paused',
		updated_at: ago(10),
		document_count: 2,
		next_step_short: '   '
	}),
	summary({ id: 'w', name: 'Workspace', kind: 'workspace', updated_at: ago(2), document_count: 3 }),
	summary({ id: 'd', name: 'Delta', updated_at: ago(0.5), document_count: 0 })
];

const SIGNALS = new Map<string, ProjectSignals>([
	[
		'a',
		signals({ last_touch_at: ago(1), done_recent: 2, overdue: 1, in_progress: 1, backlog: 1 })
	],
	['b', signals({ last_touch_at: ago(3), backlog: 6 })],
	['c', signals()],
	['w', signals({ last_touch_at: ago(0), backlog: 2 })],
	['d', signals({ last_touch_at: ago(30) })]
]);

function reads(overrides: Partial<DesktopReads> = {}): DesktopReads {
	return {
		summaries: SUMMARIES,
		parents: new Map([['d', 'a']]),
		signals: SIGNALS,
		emojis: new Map([
			['a', ['🚀', '📚']],
			['b', []]
		]),
		workspace: null,
		now: NOW,
		...overrides
	};
}

function byId(projects: DesktopProject[]): Record<string, DesktopProject> {
	return Object.fromEntries(projects.map((project) => [project.id, project]));
}

describe('buildDesktopResponse', () => {
	it('gives each project the website tile look: pulse, reason, mix and open count', () => {
		const projects = byId(buildDesktopResponse(reads()).projects);

		expect(projects.a).toMatchObject({
			pulse: 'moving',
			pulse_reason: 'Finished 2 tasks in the last 14 days',
			mix: { overdue: 1, in_progress: 1, scheduled: 0, backlog: 1 },
			open_tasks: 3,
			last_touch_at: ago(1),
			next_step_short: 'Draft the intro',
			emoji: ['🚀', '📚'],
			parent_project_id: null,
			kind: 'project',
			document_count: 4,
			task_count: 5
		});
		expect(projects.b).toMatchObject({
			pulse: 'shaping',
			pulse_reason: 'Worked on 3 days ago, nothing finished yet',
			open_tasks: 6,
			emoji: null
		});
		expect(projects.c).toMatchObject({
			pulse: 'parked',
			pulse_reason: 'Marked paused',
			open_tasks: 0,
			next_step_short: null
		});
		expect(projects.d).toMatchObject({
			pulse: 'quiet',
			pulse_reason: 'Last change 30 days ago',
			parent_project_id: 'a'
		});
		expect(projects.w).toMatchObject({ kind: 'workspace', pulse: 'shaping' });
	});

	it('ranks the D and T bars across every project, START HERE not counting as a doc', () => {
		const projects = byId(buildDesktopResponse(reads()).projects);

		// Docs beyond START HERE: a 3, w 2, c 1, b and d none.
		expect(projects.a!.bars.docs).toBe(1);
		expect(projects.w!.bars.docs).toBeCloseTo(0.727, 3);
		expect(projects.c!.bars.docs).toBeCloseTo(0.453, 3);
		expect(projects.b!.bars.docs).toBe(0);
		expect(projects.d!.bars.docs).toBe(0);
		// Open tasks: b 6, a 3, w 2, c and d none.
		expect(projects.b!.bars.tasks).toBe(1);
		expect(projects.a!.bars.tasks).toBeCloseTo(0.727, 3);
		expect(projects.w!.bars.tasks).toBeCloseTo(0.453, 3);
		expect(projects.c!.bars.tasks).toBe(0);
	});

	it('orders by recent activity, a parent counting its sub-projects', () => {
		const order = buildDesktopResponse(reads()).projects.map((project) => project.name);

		// Delta (inside Alpha) changed 12 hours ago, so Alpha leads; ties go by name.
		expect(order).toEqual(['Alpha', 'Delta', 'Beta', 'Workspace', 'Gamma']);
	});

	it('falls back like the website when the signals read failed', () => {
		const projects = byId(buildDesktopResponse(reads({ signals: null, emojis: null })).projects);

		expect(projects.a).toMatchObject({
			pulse: null,
			pulse_reason: '',
			last_touch_at: null,
			mix: { overdue: 0, in_progress: 0, scheduled: 0, backlog: 5 },
			open_tasks: 5,
			emoji: null
		});
		// A paused project is parked from its state alone.
		expect(projects.c).toMatchObject({ pulse: 'parked', pulse_reason: 'Marked paused' });
		// T bars rank by task_count instead: b 6, a 5.
		expect(projects.b!.bars.tasks).toBe(1);
		expect(projects.a!.bars.tasks).toBeCloseTo(0.59, 3);
	});

	it('maps the Workspace loose items and totals, dropping what the phone does not show', () => {
		const workspace: WorkspaceHome = {
			workspaceId: 'w',
			items: [
				{
					id: 'n1',
					entity: 'document',
					kind: 'note',
					title: 'Call the printer',
					excerpt: 'Ask about the matte stock',
					created_at: ago(1),
					updated_at: ago(0.5),
					children: 2
				},
				{
					id: 't1',
					entity: 'task',
					kind: 'task',
					title: 'Renew domain',
					excerpt: null,
					created_at: ago(2),
					updated_at: ago(2),
					state_key: 'todo',
					due_at: ago(-3),
					start_at: null
				}
			],
			suggestions: [],
			totals: { notes: 1, docs: 0, tasks: 1 }
		};

		const response = buildDesktopResponse(reads({ workspace }));

		expect(response.workspace).toEqual({
			id: 'w',
			items: [
				{
					id: 'n1',
					kind: 'note',
					title: 'Call the printer',
					excerpt: 'Ask about the matte stock',
					updated_at: ago(0.5)
				},
				{ id: 't1', kind: 'task', title: 'Renew domain', excerpt: null, updated_at: ago(2) }
			],
			totals: { notes: 1, docs: 0, tasks: 1 }
		});
		expect(buildDesktopResponse(reads()).workspace).toBeNull();
	});

	it('answers an empty account with no projects', () => {
		expect(
			buildDesktopResponse(reads({ summaries: [], parents: new Map(), signals: new Map() }))
		).toEqual({ projects: [], workspace: null });
	});
});
