// apps/web/src/routes/projects/page.data-refresh.test.ts
// @vitest-environment jsdom
//
// SvelteKit hands a page a new `data` object whenever any load re-runs, the root layout's
// included (declining an invite in the Today row does that). The page's own loads did not
// re-run then: `data.projects` and `data.workspace` are the same, already-answered promises.
// The page must not treat that as fresh data: doing so put the first load's list back over
// every change made since, and asked the server to auto-file the same notes again.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { invalidate } from '$app/navigation';
import ProjectsPage from './+page.svelte';

vi.mock('$app/navigation', () => ({
	goto: vi.fn(),
	invalidate: vi.fn(async () => undefined),
	invalidateAll: vi.fn(async () => undefined),
	refreshAll: vi.fn(async () => undefined),
	preloadData: vi.fn(async () => undefined),
	preloadCode: vi.fn(async () => undefined),
	pushState: vi.fn(),
	replaceState: vi.fn(),
	afterNavigate: vi.fn(),
	beforeNavigate: vi.fn(),
	onNavigate: vi.fn()
}));

vi.mock('$app/state', () => ({
	page: { state: {}, url: new URL('http://localhost/projects'), data: {} },
	navigating: { to: null }
}));

vi.mock('$lib/components/dashboard/TodayRow.svelte', async () => ({
	default: (await import('./__fixtures__/TodayRowStub.svelte')).default
}));

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const NOTE_ID = '22222222-2222-4222-8222-222222222222';
const PROJECT_ID = '33333333-3333-4333-8333-333333333333';
const at = '2026-11-19T12:00:00.000Z';

function workspaceHome() {
	return {
		workspaceId: WORKSPACE_ID,
		items: [
			{
				id: NOTE_ID,
				entity: 'document',
				kind: 'note',
				title: 'Call the venue',
				excerpt: null,
				created_at: at,
				updated_at: at
			}
		],
		// One suggestion the page files on its own: sure enough, and its note is still loose.
		suggestions: [
			{
				id: 'suggestion-1',
				kind: 'file',
				reason: 'About the launch event',
				confidence: 0.99,
				proposed_name: null,
				target_project_id: PROJECT_ID,
				items: [{ entity: 'document', id: NOTE_ID }],
				created_at: at
			}
		],
		totals: { notes: 1, docs: 0, tasks: 0 }
	};
}

/** A project as the tiles read it. */
function tileProject() {
	return {
		id: PROJECT_ID,
		name: 'Launch event',
		kind: 'project',
		description: null,
		icon_svg: null,
		icon_concept: null,
		icon_generated_at: null,
		icon_generation_source: null,
		icon_generation_prompt: null,
		type_key: 'project.business.event',
		state_key: 'active',
		props: {},
		facet_context: null,
		facet_scale: null,
		facet_stage: null,
		created_at: at,
		updated_at: at,
		task_count: 2,
		goal_count: 0,
		plan_count: 0,
		document_count: 1,
		owner_actor_id: 'actor-1',
		access_role: 'owner',
		access_level: 'admin',
		is_shared: false,
		next_step_short: null,
		next_step_long: null,
		next_step_source: null,
		next_step_updated_at: null,
		has_collaborators: false,
		parent_project_id: null
	};
}

function pageData() {
	return {
		user: { id: 'user-1', email: 'person@example.com', is_admin: false },
		actorId: 'actor-1',
		openTarget: null,
		projects: Promise.resolve([]),
		projectCount: 0,
		workspaceId: WORKSPACE_ID,
		workspace: Promise.resolve(workspaceHome()),
		dashboard: Promise.resolve(null),
		userTimezone: null,
		pendingInvites: [],
		hasConnectedAgents: false
	};
}

describe('/projects: a new data object with the same loads', () => {
	beforeEach(() => {
		vi.stubGlobal('scrollTo', vi.fn());
		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () =>
					new Response(JSON.stringify({ success: true, data: { filed: [] } }), {
						status: 200,
						headers: { 'Content-Type': 'application/json' }
					})
			)
		);
	});
	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
		vi.clearAllMocks();
	});

	it('does not replay the first Workspace load (no second auto-file) when only the layout reloaded', async () => {
		const data = pageData();
		const autoFiles = () =>
			vi
				.mocked(fetch)
				.mock.calls.filter(([url]) => String(url).includes('/suggestions/auto-file'))
				.length;
		const { rerender } = render(ProjectsPage, { props: { data: data as never } });
		await waitFor(() => expect(autoFiles()).toBe(1));
		// Let that request finish: while one is in flight the page never starts another.
		await new Promise((resolve) => setTimeout(resolve, 20));

		// The root layout re-ran: a new object, the very same promises.
		await rerender({ data: { ...data, pendingInvites: [] } as never });
		await new Promise((resolve) => setTimeout(resolve, 20));

		expect(autoFiles()).toBe(1);
	});
	it('re-reads only the tiles after a note is filed, without re-running the page load', async () => {
		// The server files the note this time, so the page refreshes its tiles.
		vi.mocked(fetch).mockImplementation(async (input) => {
			const url = String(input);
			const data = url.includes('/suggestions/auto-file')
				? {
						filed: [
							{
								suggestion_id: 'suggestion-1',
								project_id: PROJECT_ID,
								batch_id: 'batch-1',
								item_ids: [NOTE_ID],
								titles: ['Call the venue']
							}
						]
					}
				: url.includes('/api/projects/summaries')
					? { projects: [] }
					: workspaceHome();
			return new Response(JSON.stringify({ success: true, data }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			});
		});
		render(ProjectsPage, { props: { data: pageData() as never } });

		await waitFor(() =>
			expect(
				vi
					.mocked(fetch)
					.mock.calls.some(([url]) => String(url).includes('/api/projects/summaries'))
			).toBe(true)
		);
		// invalidate() re-runs every load on the page and resets page.state (an open card).
		expect(invalidate).not.toHaveBeenCalled();
	});

	// The trash is read once when the page opens. It used to be read again every time a
	// project card closed; now only a project leaving the list (deleted by a chat, say)
	// reads it again.
	for (const { name, afterRefresh, reads } of [
		{
			name: 'reads the trash again when a project leaves the list',
			afterRefresh: [],
			reads: 2
		},
		{
			name: 'does not read the trash again when every project is still there',
			afterRefresh: [tileProject()],
			reads: 1
		}
	]) {
		it(name, async () => {
			let answerAutoFile!: () => void;
			const autoFileHeld = new Promise<void>((resolve) => (answerAutoFile = resolve));
			const calls = (path: string) =>
				vi.mocked(fetch).mock.calls.filter(([url]) => String(url).includes(path)).length;
			vi.mocked(fetch).mockImplementation(async (input) => {
				const url = String(input);
				let data: unknown = workspaceHome();
				if (url.includes('/projects/trash')) data = { projects: [] };
				else if (url.includes('/api/projects/summaries')) data = { projects: afterRefresh };
				else if (url.includes('/suggestions/auto-file')) {
					// Filing a note is what makes the page re-read its tiles; held until the
					// trash has been read the first time.
					await autoFileHeld;
					data = {
						filed: [
							{
								suggestion_id: 'suggestion-1',
								project_id: PROJECT_ID,
								batch_id: 'batch-1',
								item_ids: [NOTE_ID],
								titles: ['Call the venue']
							}
						]
					};
				}
				return new Response(JSON.stringify({ success: true, data }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' }
				});
			});
			render(ProjectsPage, {
				props: {
					data: {
						...pageData(),
						projects: Promise.resolve([tileProject()]),
						projectCount: 1
					} as never
				}
			});
			await waitFor(() => expect(calls('/projects/trash')).toBe(1));

			answerAutoFile();
			await waitFor(() => expect(calls('/api/projects/summaries')).toBe(1));
			await new Promise((resolve) => setTimeout(resolve, 20));

			expect(calls('/projects/trash')).toBe(reads);
		});
	}

	// Closing the overdue, inbox or brief-chat window after a change. invalidate() re-ran
	// the page's whole load and emptied page.state, closing the project card open under it.
	it('re-reads Today, the tiles and the Workspace on their own, without invalidate', async () => {
		const asked = () => vi.mocked(fetch).mock.calls.map(([url]) => String(url));
		vi.mocked(fetch).mockImplementation(async (input) => {
			const url = String(input);
			let data: unknown = { filed: [] };
			if (url === '/api/projects/dashboard') {
				data = { dashboard: { attention: { overdueTasks: 3 }, recent: null } };
			} else if (url === '/api/projects/summaries') data = { projects: [tileProject()] };
			else if (url === '/api/workspace') data = { ...workspaceHome(), suggestions: [] };
			return new Response(JSON.stringify({ success: true, data }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			});
		});
		render(ProjectsPage, {
			props: {
				data: {
					...pageData(),
					projects: Promise.resolve([tileProject()]),
					projectCount: 1
				} as never
			}
		});
		// The first load streamed no Today numbers.
		expect((await screen.findByTestId('overdue-count')).textContent).toBe('none');

		await fireEvent.click(screen.getByRole('button', { name: 'Something changed in Today' }));

		await waitFor(() => expect(screen.getByTestId('overdue-count').textContent).toBe('3'));
		expect(asked()).toEqual(
			expect.arrayContaining([
				'/api/projects/dashboard',
				'/api/projects/summaries',
				'/api/workspace'
			])
		);
		expect(invalidate).not.toHaveBeenCalled();
	});
});
