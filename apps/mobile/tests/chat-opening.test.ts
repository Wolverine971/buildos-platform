// apps/mobile/tests/chat-opening.test.ts
// How the chat opens and what a chosen context sends, mirroring the website's chat modal.
import type { DesktopProject, ProjectFullResponse } from '@buildos/api-client';
import { describe, expect, it } from 'vitest';

import {
	type ChatTarget,
	describeTarget,
	focusLabel,
	GLOBAL_TARGET,
	parseTargetParams,
	projectFocusFor,
	targetParams,
	turnContextFor
} from '@/lib/chat/context';
import { demoHasSession, parseDemoParam } from '@/lib/chat/demo';
import {
	focusOptionLabel,
	focusSections,
	initialStage,
	pickableProjects,
	projectAside
} from '@/lib/chat/opening';

const project = (over: Partial<DesktopProject> & { id: string; name: string }): DesktopProject =>
	({
		kind: 'project',
		state_key: 'active',
		updated_at: '2026-10-01T00:00:00Z',
		last_touch_at: null,
		next_step_short: null,
		emoji: null,
		parent_project_id: null,
		pulse: 'moving',
		pulse_reason: '',
		bars: [],
		mix: { overdue: 0, today: 0, soon: 0, later: 0 },
		open_tasks: 0,
		document_count: 0,
		task_count: 0,
		...over
	}) as DesktopProject;

const launch: ChatTarget = { type: 'project', projectId: 'p1', projectName: 'Launch' };

describe('initialStage', () => {
	it('asks what the chat is about when opened from the nav (global, no stored chat)', () => {
		expect(initialStage({ target: GLOBAL_TARGET, sessionId: null })).toBe('pick');
	});
	it('opens Workspace chat directly when Today hands it words to send (follow-up, close-out)', () => {
		expect(
			initialStage({ target: GLOBAL_TARGET, sessionId: null, draft: 'Help me plan' })
		).toBe('chat');
		expect(initialStage({ target: GLOBAL_TARGET, sessionId: null, draft: '   ' })).toBe('pick');
	});
	it('goes straight in from a project page, the reader, or a stored chat', () => {
		expect(initialStage({ target: launch, sessionId: null })).toBe('chat');
		expect(
			initialStage({
				target: { ...launch, focus: { kind: 'task', id: 't1', name: 'Ship' } },
				sessionId: null
			})
		).toBe('chat');
		expect(initialStage({ target: GLOBAL_TARGET, sessionId: 's1' })).toBe('chat');
	});
	it('lets the dev demo land on each opening screen', () => {
		expect(initialStage({ target: launch, sessionId: null, demo: 'pick' })).toBe('pick');
		expect(initialStage({ target: launch, sessionId: null, demo: 'projects' })).toBe(
			'projects'
		);
		expect(initialStage({ target: GLOBAL_TARGET, sessionId: null, demo: 'history' })).toBe(
			'chat'
		);
		expect(initialStage({ target: GLOBAL_TARGET, sessionId: null, demo: 'idle' })).toBe('chat');
		expect(parseDemoParam('focus')).toBe('focus');
		expect(demoHasSession('pick')).toBe(false);
		expect(demoHasSession('focus')).toBe(true);
	});
});

describe('the chosen context is what gets sent', () => {
	it('Workspace chat sends the global context and no focus', () => {
		expect(turnContextFor(GLOBAL_TARGET)).toEqual({
			type: 'global',
			entityId: null,
			projectId: null
		});
		expect(projectFocusFor(GLOBAL_TARGET)).toBeNull();
	});
	it('a project picked in the picker sends that project, project-wide', () => {
		const chosen = project({ id: 'p9', name: 'Garden' });
		const target: ChatTarget = {
			type: 'project',
			projectId: chosen.id,
			projectName: chosen.name
		};
		expect(turnContextFor(target)).toEqual({
			type: 'project',
			entityId: 'p9',
			projectId: 'p9'
		});
		expect(projectFocusFor(target)).toMatchObject({
			focusType: 'project-wide',
			projectId: 'p9'
		});
	});
	it('a focus picked in the focus sheet rides on the same project', () => {
		for (const kind of ['task', 'document', 'goal', 'plan', 'milestone', 'risk'] as const) {
			const target: ChatTarget = {
				...launch,
				focus: { kind, id: `${kind}-1`, name: 'Thing' }
			};
			expect(turnContextFor(target)).toEqual({
				type: 'project',
				entityId: 'p1',
				projectId: 'p1'
			});
			expect(projectFocusFor(target)).toEqual({
				focusType: kind,
				focusEntityId: `${kind}-1`,
				focusEntityName: 'Thing',
				projectId: 'p1',
				projectName: 'Launch'
			});
		}
	});
	it('clearing the focus goes back to project-wide', () => {
		const focused: ChatTarget = { ...launch, focus: { kind: 'goal', id: 'g1', name: 'Grow' } };
		const cleared: ChatTarget = { ...focused, focus: undefined };
		expect(projectFocusFor(cleared)?.focusType).toBe('project-wide');
	});
	it('every focus kind survives the reader → chat URL round trip', () => {
		const target: ChatTarget = {
			...launch,
			focus: { kind: 'milestone', id: 'm1', name: 'Beta' }
		};
		expect(parseTargetParams(targetParams(target))).toEqual(target);
		expect(parseTargetParams({ ...targetParams(target), focusKind: 'nonsense' })).toEqual(
			launch
		);
	});
});

describe('what the strip and the empty state say', () => {
	it('names the context and the focus', () => {
		expect(describeTarget(GLOBAL_TARGET).title).toBe('Workspace');
		expect(describeTarget(launch)).toEqual({
			title: 'Launch',
			subtitle: 'Answer questions, explore insights, or update Launch.'
		});
		const focused: ChatTarget = { ...launch, focus: { kind: 'risk', id: 'r1', name: 'Slip' } };
		expect(describeTarget(focused).title).toBe('Slip');
		expect(describeTarget(focused).subtitle).toContain('Risk in Launch');
		expect(focusLabel(focused)).toBe('Risk · Slip');
		expect(focusOptionLabel({ kind: 'plan', id: 'x', name: '  ' })).toBe('Plan · Untitled');
	});
});

describe('pickableProjects', () => {
	const rows = [
		project({
			id: 'w',
			name: 'Workspace',
			kind: 'workspace',
			last_touch_at: '2026-10-30T00:00:00Z'
		}),
		project({ id: 'a', name: 'Album', last_touch_at: '2026-10-20T00:00:00Z' }),
		project({ id: 'b', name: 'Book tour', updated_at: '2026-10-29T00:00:00Z' }),
		project({ id: 'c', name: 'Cabin', last_touch_at: '2026-10-25T00:00:00Z', open_tasks: 3 })
	];
	it('hides the Workspace row and puts the most recently touched first', () => {
		expect(pickableProjects(rows).map((row) => row.id)).toEqual(['b', 'c', 'a']);
	});
	it('filters by name, case-insensitively', () => {
		expect(pickableProjects(rows, 'BOO').map((row) => row.id)).toEqual(['b']);
		expect(pickableProjects(undefined, 'x')).toEqual([]);
	});
	it('says the next step, else the open task count', () => {
		expect(projectAside(rows[3])).toBe('3 open tasks');
		expect(projectAside(project({ id: 'n', name: 'N', next_step_short: ' Call Sam ' }))).toBe(
			'Call Sam'
		);
		expect(projectAside(project({ id: 'n', name: 'N', open_tasks: 1 }))).toBe('1 open task');
		expect(projectAside(project({ id: 'n', name: 'N' }))).toBeNull();
	});
});

describe('focusSections', () => {
	const full = {
		tasks: [
			{
				id: 't1',
				title: 'Write intro',
				completed_at: '2026-10-01',
				archived_at: null,
				deleted_at: null
			},
			{
				id: 't2',
				title: 'Edit draft',
				completed_at: null,
				archived_at: null,
				deleted_at: null
			},
			{
				id: 't3',
				title: 'Old',
				completed_at: null,
				archived_at: '2026-09-01',
				deleted_at: null
			}
		],
		documents: [
			{ id: 'd1', title: 'Outline', archived_at: null, deleted_at: null },
			{ id: 'd2', title: 'Gone', archived_at: null, deleted_at: '2026-09-01' }
		],
		goals: [{ id: 'g1', name: 'Publish by spring', archived_at: null, deleted_at: null }],
		plans: [],
		milestones: [
			{
				id: 'm1',
				title: 'Beta readers',
				is_missed: true,
				archived_at: null,
				deleted_at: null
			}
		],
		risks: [{ id: 'r1', title: 'Editor leaves', archived_at: null, deleted_at: null }]
	} as unknown as ProjectFullResponse;

	it('lists the live items in the web tab order, open tasks before done ones', () => {
		const sections = focusSections(full);
		expect(sections.map((section) => section.label)).toEqual([
			'Tasks',
			'Docs',
			'Goals',
			'Milestones',
			'Risks'
		]);
		expect(sections[0].items.map((item) => item.id)).toEqual(['t2', 't1']);
		expect(sections[0].items[1].meta).toBe('Done');
		expect(sections[1].items.map((item) => item.id)).toEqual(['d1']);
		expect(sections[3].items[0]).toEqual({
			kind: 'milestone',
			id: 'm1',
			name: 'Beta readers',
			meta: 'Missed'
		});
	});
	it('searches across every section and caps each', () => {
		expect(focusSections(full, 'ed').flatMap((s) => s.items.map((i) => i.id))).toEqual([
			't2',
			'r1'
		]);
		expect(focusSections(full, '', 1)[0].items).toHaveLength(1);
		expect(focusSections(undefined)).toEqual([]);
	});
});
