// apps/mobile/tests/desktop-fallback.test.ts
import {
	BuildOsApiError,
	type DesktopResponse,
	type ProjectFullResponse,
	type ProjectSummary
} from '@buildos/api-client';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
	buildFallbackDesktop,
	desktopFallbackReason,
	excerptOf,
	looseFromWorkspace,
	nestedDocIds,
	withParents
} from '@/lib/desktop-fallback';

const { desktop, list, full } = vi.hoisted(() => ({
	desktop: vi.fn(),
	list: vi.fn(),
	full: vi.fn()
}));

vi.mock('@/lib/api', () => ({ api: { projects: { desktop, list, full } } }));
vi.mock('@/providers/auth-provider', () => ({ useAuth: () => ({ session: null }) }));

const T0 = Date.parse('2026-10-29T12:00:00Z');
const HOUR = 3_600_000;
const at = (hoursAgo: number) => new Date(T0 - hoursAgo * HOUR).toISOString();

function project(overrides: Partial<ProjectSummary> & { id: string; name: string }) {
	return {
		description: null,
		type_key: 'project.creative.book',
		state_key: 'active',
		facet_context: null,
		facet_scale: null,
		facet_stage: null,
		created_at: at(1000),
		updated_at: at(1),
		task_count: 0,
		kind: 'project',
		...overrides
	} as ProjectSummary;
}

// GET /api/onto/projects: the Workspace row included, no parent ids.
const PROJECTS = [
	project({ id: 'p-old', name: 'Old book', updated_at: at(48), task_count: 3 }),
	project({ id: 'ws', name: 'Workspace', kind: 'workspace', updated_at: at(2), task_count: 2 }),
	project({ id: 'p-new', name: 'Launch', updated_at: at(1) })
];

// The same read with include=hierarchy: parents added, the Workspace dropped.
const HIERARCHY = [
	project({ id: 'p-old', name: 'Old book', parent_project_id: null, has_children: true }),
	project({
		id: 'p-new',
		name: 'Launch',
		parent_project_id: 'p-old',
		parent_project_name: 'Old book'
	})
];

function listResponse(params: { include?: string }) {
	return Promise.resolve({ projects: params.include === 'hierarchy' ? HIERARCHY : PROJECTS });
}

function doc(overrides: Record<string, unknown> & { id: string }) {
	return {
		title: 'A doc',
		type_key: 'document.note',
		description: null,
		state_key: 'draft',
		created_at: at(5),
		updated_at: at(5),
		...overrides
	};
}

function task(overrides: Record<string, unknown> & { id: string }) {
	return {
		title: 'A task',
		description: null,
		state_key: 'todo',
		created_at: at(5),
		updated_at: at(5),
		deleted_at: null,
		archived_at: null,
		...overrides
	};
}

function workspaceRead(): ProjectFullResponse {
	return {
		project: {
			id: 'ws',
			doc_structure: {
				version: 1,
				root: [
					{
						id: 'folder',
						order: 0,
						children: [{ id: 'inside', order: 0, children: [] }]
					},
					{ id: 'n1', order: 1 }
				]
			}
		},
		documents: [
			doc({
				id: 'n1',
				title: '  Call the printer ',
				description: '## Ask   about\n\nthe **matte** stock',
				created_at: at(1),
				updated_at: at(0.5)
			}),
			doc({ id: 'folder', title: 'Research', type_key: 'document.knowledge.research' }),
			doc({ id: 'inside', title: 'Filed inside the folder' }),
			doc({ id: 'gone', state_key: 'archived' }),
			doc({ id: 'blank', title: '   ', created_at: at(9) })
		],
		tasks: [
			task({ id: 't1', title: 'Renew domain', created_at: at(3), updated_at: at(3) }),
			task({ id: 't-done', state_key: 'done' }),
			task({ id: 't-deleted', deleted_at: at(1) })
		]
	} as unknown as ProjectFullResponse;
}

describe('desktopFallbackReason', () => {
	it('treats the missing route as missing, other server errors as failed, the rest as real', () => {
		const error = (status: number, code?: string, isNetworkError = false) =>
			new BuildOsApiError({ message: 'x', status, code, isNetworkError });

		expect(desktopFallbackReason(error(404, 'NOT_FOUND'))).toBe('missing');
		// Production today: /api/projects/[id] fails "desktop" as a uuid.
		expect(desktopFallbackReason(error(500, 'DATABASE_ERROR'))).toBe('missing');
		expect(desktopFallbackReason(error(500, 'INTERNAL_ERROR'))).toBe('failed');
		expect(desktopFallbackReason(error(502))).toBe('failed');
		expect(desktopFallbackReason(error(401, 'UNAUTHORIZED'))).toBeNull();
		expect(desktopFallbackReason(error(402, 'UPGRADE_REQUIRED'))).toBeNull();
		expect(desktopFallbackReason(error(400))).toBeNull();
		expect(desktopFallbackReason(error(0, undefined, true))).toBeNull();
		expect(desktopFallbackReason(new Error('boom'))).toBeNull();
	});
});

describe('buildFallbackDesktop', () => {
	it('makes plain monogram tiles, most recently updated first', () => {
		const { projects } = buildFallbackDesktop(withParents(PROJECTS, HIERARCHY), null);

		expect(projects.map((tile) => tile.id)).toEqual(['p-new', 'ws', 'p-old']);
		expect(projects[0]).toEqual({
			id: 'p-new',
			name: 'Launch',
			kind: 'project',
			state_key: 'active',
			updated_at: at(1),
			last_touch_at: null,
			next_step_short: null,
			emoji: null,
			parent_project_id: 'p-old',
			pulse: null,
			pulse_reason: '',
			bars: { docs: 0, tasks: 0 },
			mix: { overdue: 0, in_progress: 0, scheduled: 0, backlog: 0 },
			open_tasks: 0,
			document_count: 0,
			task_count: 0
		});
		expect(projects[1]).toMatchObject({ kind: 'workspace', task_count: 2 });
		expect(projects[2]).toMatchObject({ parent_project_id: null, task_count: 3 });
	});

	it('says the loose items could not load (null) rather than claiming there are none', () => {
		expect(buildFallbackDesktop(PROJECTS, null).workspace).toBeNull();
		expect(buildFallbackDesktop([], null)).toEqual({ projects: [], workspace: null });
	});

	it('lists the Workspace loose items newest first, skipping filed, archived and done', () => {
		const workspace = buildFallbackDesktop(PROJECTS, workspaceRead()).workspace;

		expect(workspace).toEqual({
			id: 'ws',
			items: [
				{
					id: 'n1',
					kind: 'note',
					title: 'Call the printer',
					excerpt: 'Ask about the matte stock',
					updated_at: at(0.5)
				},
				{
					id: 't1',
					kind: 'task',
					title: 'Renew domain',
					excerpt: null,
					updated_at: at(3)
				},
				{
					id: 'folder',
					kind: 'doc',
					title: 'Research',
					excerpt: null,
					updated_at: at(5)
				},
				{
					id: 'blank',
					kind: 'note',
					title: 'Untitled note',
					excerpt: null,
					updated_at: at(5)
				}
			],
			totals: { notes: 2, docs: 1, tasks: 1 }
		});
	});
});

describe('withParents', () => {
	it("adds each project's parent from the hierarchy read and keeps the Workspace row", () => {
		const merged = withParents(PROJECTS, HIERARCHY);
		expect(merged.map((row) => [row.id, row.parent_project_id ?? null])).toEqual([
			['p-old', null],
			['ws', null],
			['p-new', 'p-old']
		]);
		expect(merged.map((row) => row.kind)).toEqual(['project', 'workspace', 'project']);
	});

	it('leaves the list flat when the hierarchy read has nothing', () => {
		expect(withParents(PROJECTS, [])).toEqual(PROJECTS);
		expect(buildFallbackDesktop(PROJECTS, null).projects.every((tile) => !tile.parent_project_id))
			.toBe(true);
	});
});

describe('loose item helpers', () => {
	it('finds every doc filed under a top-level doc', () => {
		expect([...nestedDocIds(workspaceRead().project.doc_structure)]).toEqual(['inside']);
		expect(nestedDocIds(null).size).toBe(0);
		expect(nestedDocIds({ root: 'nope' }).size).toBe(0);
	});

	it('folds and clips an excerpt', () => {
		expect(excerptOf('  \n ')).toBeNull();
		expect(excerptOf(null)).toBeNull();
		const long = excerptOf('word '.repeat(80));
		expect(long?.endsWith('…')).toBe(true);
		expect(long!.length).toBeLessThanOrEqual(221);
	});

	it('reads the Workspace id from its project row', () => {
		expect(looseFromWorkspace(workspaceRead()).id).toBe('ws');
	});
});

describe('fetchDesktop', () => {
	const DESKTOP: DesktopResponse = { projects: [], workspace: null };

	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(T0);
		list.mockImplementation(listResponse);
		full.mockResolvedValue(workspaceRead());
	});

	afterEach(() => vi.useRealTimers());

	const load = async () => (await import('@/hooks/use-desktop')).fetchDesktop;

	it('returns the desktop route answer when it exists', async () => {
		desktop.mockResolvedValue(DESKTOP);
		const fetchDesktop = await load();

		await expect(fetchDesktop()).resolves.toBe(DESKTOP);
		expect(list).not.toHaveBeenCalled();
	});

	it('falls back when the route is missing and skips it for ten minutes', async () => {
		desktop.mockRejectedValue(
			new BuildOsApiError({ message: 'db', status: 500, code: 'DATABASE_ERROR' })
		);
		const fetchDesktop = await load();

		const first = await fetchDesktop();
		expect(first.projects.map((tile) => tile.id)).toEqual(['p-new', 'ws', 'p-old']);
		// Nesting comes from the hierarchy read, asked for alongside the plain list.
		expect(first.projects[0]?.parent_project_id).toBe('p-old');
		expect(first.workspace?.items).toHaveLength(4);
		expect(list).toHaveBeenCalledWith({ limit: 100 }, { signal: undefined });
		expect(list).toHaveBeenCalledWith(
			{ limit: 100, include: 'hierarchy' },
			{ signal: undefined }
		);
		expect(full).toHaveBeenCalledWith('ws', { profile: 'v2-initial' }, { signal: undefined });

		await fetchDesktop();
		expect(desktop).toHaveBeenCalledTimes(1);

		vi.setSystemTime(T0 + 10 * 60_000);
		desktop.mockResolvedValue(DESKTOP);
		await expect(fetchDesktop()).resolves.toBe(DESKTOP);
		expect(desktop).toHaveBeenCalledTimes(2);
	});

	it('falls back once for any other server error, trying the route again next time', async () => {
		desktop.mockRejectedValueOnce(new BuildOsApiError({ message: 'down', status: 503 }));
		desktop.mockResolvedValueOnce(DESKTOP);
		const fetchDesktop = await load();

		expect((await fetchDesktop()).projects).toHaveLength(3);
		await expect(fetchDesktop()).resolves.toBe(DESKTOP);
	});

	it('keeps flat tiles when the hierarchy read fails', async () => {
		desktop.mockRejectedValue(new BuildOsApiError({ message: 'nope', status: 404 }));
		list.mockImplementation((params: { include?: string }) =>
			params.include === 'hierarchy'
				? Promise.reject(new BuildOsApiError({ message: 'down', status: 500 }))
				: listResponse(params)
		);
		const fetchDesktop = await load();

		const result = await fetchDesktop();
		expect(result.projects).toHaveLength(3);
		expect(result.projects.every((tile) => tile.parent_project_id === null)).toBe(true);
		expect(result.workspace?.items).toHaveLength(4);
	});

	it('keeps the tiles when the Workspace read fails, with loose items unknown', async () => {
		desktop.mockRejectedValue(new BuildOsApiError({ message: 'nope', status: 404 }));
		full.mockRejectedValue(new BuildOsApiError({ message: 'down', status: 500 }));
		const fetchDesktop = await load();

		const result = await fetchDesktop();
		expect(result.projects).toHaveLength(3);
		expect(result.workspace).toBeNull();
	});

	it('shows signed-out and offline errors instead of falling back', async () => {
		desktop.mockRejectedValueOnce(
			new BuildOsApiError({ message: 'signed out', status: 401, code: 'UNAUTHORIZED' })
		);
		desktop.mockRejectedValueOnce(
			new BuildOsApiError({ message: 'offline', status: 0, isNetworkError: true })
		);
		const fetchDesktop = await load();

		await expect(fetchDesktop()).rejects.toMatchObject({ status: 401 });
		await expect(fetchDesktop()).rejects.toMatchObject({ status: 0 });
		expect(list).not.toHaveBeenCalled();
	});
});

describe('invalidateDesktop', () => {
	it('marks only that account desktop stale', async () => {
		const { invalidateDesktop } = await import('@/hooks/use-desktop');
		const queryClient = new QueryClient();
		queryClient.setQueryData(['desktop', 'u1'], { projects: [], workspace: null });
		queryClient.setQueryData(['desktop', 'u2'], { projects: [], workspace: null });

		await invalidateDesktop(queryClient, 'u1');

		expect(queryClient.getQueryState(['desktop', 'u1'])?.isInvalidated).toBe(true);
		expect(queryClient.getQueryState(['desktop', 'u2'])?.isInvalidated).toBe(false);

		await invalidateDesktop(queryClient, null);
		expect(queryClient.getQueryState(['desktop', 'u2'])?.isInvalidated).toBe(true);
	});

	it('only marks stale without refetching when refetch is false', async () => {
		const { invalidateDesktop } = await import('@/hooks/use-desktop');
		const queryClient = new QueryClient();
		const queryFn = vi.fn(async () => ({ projects: [], workspace: null }));
		const observer = new QueryObserver(queryClient, { queryKey: ['desktop', 'u1'], queryFn });
		const unsubscribe = observer.subscribe(() => {});
		await vi.waitFor(() =>
			expect(queryClient.getQueryState(['desktop', 'u1'])).toMatchObject({
				status: 'success',
				fetchStatus: 'idle'
			})
		);
		expect(queryFn).toHaveBeenCalledTimes(1);

		await invalidateDesktop(queryClient, 'u1', { refetch: false });
		expect(queryClient.getQueryState(['desktop', 'u1'])?.isInvalidated).toBe(true);
		expect(queryFn).toHaveBeenCalledTimes(1);

		await invalidateDesktop(queryClient, 'u1');
		expect(queryFn).toHaveBeenCalledTimes(2);
		unsubscribe();
	});
});
