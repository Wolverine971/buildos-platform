// apps/web/src/routes/projects/page.data-refresh.test.ts
// @vitest-environment jsdom
//
// SvelteKit hands a page a new `data` object whenever any load re-runs, the root layout's
// included (declining an invite in the Today row does that). The page's own loads did not
// re-run then: `data.projects` and `data.workspace` are the same, already-answered promises.
// The page must not treat that as fresh data: doing so put the first load's list back over
// every change made since, and asked the server to auto-file the same notes again.
import { cleanup, render, waitFor } from '@testing-library/svelte';
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
});
