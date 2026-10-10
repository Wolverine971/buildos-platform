// apps/web/src/lib/components/projects/desktop/ProjectDesktop.test.ts
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectListSummary } from '../project-list';

const mocks = vi.hoisted(() => ({
	setProjectParent: vi.fn(),
	toastAdd: vi.fn(
		(_toast: { message: string; action?: { label: string; onClick: () => void } }) => 'toast-1'
	),
	toastRemove: vi.fn(),
	toastSuccess: vi.fn(),
	toastError: vi.fn()
}));

vi.mock('$app/state', async () => await import('./__fixtures__/page-state.svelte'));
vi.mock('$app/navigation', async () => {
	const { page } = await import('./__fixtures__/page-state.svelte');
	return {
		pushState: vi.fn((_url: string, state: App.PageState) => (page.state = state)),
		replaceState: vi.fn((_url: string, state: App.PageState) => (page.state = state))
	};
});
vi.mock('$app/paths', () => ({
	resolve: (route: string, params?: Record<string, string>) =>
		route.replace('[id]', params?.id ?? '')
}));
vi.mock('$lib/components/project/project-family', () => ({
	setProjectParent: mocks.setProjectParent
}));
vi.mock('$lib/components/agent/AgentChatModal.svelte', async () => ({
	default: (await import('./__fixtures__/ModalStub.svelte')).default
}));
vi.mock('$lib/stores/toast.store', () => ({
	TOAST_DURATION: { STANDARD: 5000, LONG: 7000 },
	toastService: {
		add: mocks.toastAdd,
		remove: mocks.toastRemove,
		success: mocks.toastSuccess,
		error: mocks.toastError
	}
}));

import { pushState, replaceState } from '$app/navigation';
import { page } from './__fixtures__/page-state.svelte';
import ProjectDesktop from './ProjectDesktop.svelte';

const NOW = '2026-10-01T12:00:00.000Z';

function project(
	id: string,
	name: string,
	extra: Partial<ProjectListSummary> = {}
): ProjectListSummary {
	return {
		id,
		name,
		description: null,
		icon_svg: null,
		icon_concept: null,
		icon_generated_at: null,
		icon_generation_source: null,
		icon_generation_prompt: null,
		type_key: 'project.business.consulting',
		state_key: 'active',
		props: {},
		facet_context: null,
		facet_scale: null,
		facet_stage: null,
		created_at: NOW,
		updated_at: NOW,
		task_count: 2,
		goal_count: 0,
		plan_count: 0,
		document_count: 3,
		owner_actor_id: 'actor-1',
		access_role: 'owner',
		access_level: 'admin',
		is_shared: false,
		next_step_short: null,
		next_step_long: null,
		next_step_source: null,
		next_step_updated_at: null,
		has_collaborators: false,
		parent_project_id: null,
		...extra
	};
}

const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();
const PROJECTS = [
	// Finished tasks this week: moving.
	project('ws', 'Wayne Strategies', {
		signals: {
			last_touch_at: ago(0),
			done_recent: 3,
			overdue: 0,
			in_progress: 0,
			scheduled: 0,
			backlog: 10
		}
	}),
	project('redline', 'Redline', { parent_project_id: 'ws' }),
	// Worked on, nothing finished: being shaped, with overdue tasks.
	project('nine', '9takes', {
		document_count: 0,
		signals: {
			last_touch_at: ago(3),
			done_recent: 0,
			overdue: 11,
			in_progress: 2,
			scheduled: 0,
			backlog: 21
		}
	}),
	project('shared', 'Shared Thing', { access_level: 'read', access_role: 'viewer' })
];

function snapshot(id: string) {
	const name = PROJECTS.find((candidate) => candidate.id === id)?.name ?? id;
	if (id !== 'ws')
		return {
			id,
			name,
			updated_at: NOW,
			can_write: true,
			shared_folder_document_id: null,
			shared_with_count: null,
			structure: { version: 7, root: [] },
			documents: [],
			tasks: []
		};
	return {
		id,
		name,
		updated_at: NOW,
		can_write: true,
		shared_folder_document_id: null,
		shared_with_count: null,
		structure: {
			version: 3,
			root: [
				{
					id: 'd1',
					title: 'Pricing notes',
					order: 0,
					children: [{ id: 'd2', title: 'Old prices', order: 0 }]
				},
				{ id: 'start', title: 'START HERE', order: 1 }
			]
		},
		documents: [
			{ id: 'd1', title: 'Pricing notes', type_key: 'document.default', updated_at: NOW },
			{ id: 'd2', title: 'Old prices', type_key: 'document.default', updated_at: NOW },
			{
				id: 'start',
				title: 'START HERE',
				type_key: 'document.context.project',
				updated_at: NOW
			}
		],
		tasks: [
			{
				id: 't1',
				title: 'Call Ana',
				state_key: 'todo',
				updated_at: NOW,
				start_at: null,
				due_at: null
			},
			{
				id: 't2',
				title: 'Launch day',
				state_key: 'todo',
				updated_at: NOW,
				start_at: null,
				// Relative, so the task stays upcoming instead of turning overdue
				// (a fixed date here expired and broke the lock-tooltip assertion).
				due_at: ago(-8)
			}
		]
	};
}

const IMPACT = {
	source_project_id: 'ws',
	destination_project_id: 'nine',
	blockers: [],
	items: 2,
	relationships_to_detach: 0,
	assignees_to_remove: 0,
	finished_proposals_to_remove: 0,
	task_links_to_clear: 0,
	events_to_rebuild: 0,
	tasks_to_reconcile: 0,
	assets_to_move: 0,
	comments_to_move: 0,
	public_pages_to_move: 0,
	relationships_to_move: 0
};

function ok(data: unknown) {
	return new Response(JSON.stringify({ success: true, data }), {
		status: 200,
		headers: { 'Content-Type': 'application/json' }
	});
}

const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
	if (url.endsWith('/card')) return ok({ project: snapshot(url.split('/')[4]!), goals: [] });
	const full = url.match(/^\/api\/onto\/(documents|tasks)\/([^/]+)\/full/);
	if (full?.[1] === 'documents')
		return ok({
			document: {
				id: full[2],
				title: full[2],
				content: `Body of ${full[2]}`,
				state_key: 'draft',
				updated_at: NOW
			},
			editor_revision: 'r1'
		});
	if (full?.[1] === 'tasks')
		return ok({
			task: {
				id: full[2],
				title: 'Call Ana',
				description: 'Ask about the pilot.',
				state_key: 'todo',
				priority: 2,
				due_at: null,
				start_at: null,
				updated_at: NOW
			}
		});
	if (url.startsWith('/api/onto/tasks/') && init?.method === 'PATCH')
		return ok({ task: { id: url.split('/')[4], state_key: 'done' } });
	const body = init?.body ? JSON.parse(String(init.body)) : {};
	if (url === '/api/onto/organize/preview')
		return ok({
			confirmation_token: 'a'.repeat(32),
			impact: [IMPACT],
			manifest: [],
			skipped: []
		});
	if (url === '/api/onto/organize/apply')
		return ok({
			status: 'applied',
			batch_id: body.batch_id,
			inverse_of: null,
			operations: 2,
			impact: [IMPACT],
			skipped: [],
			restoration: {},
			calendar_sync: 'not_needed',
			replayed: false
		});
	throw new Error(`Unexpected fetch ${url}`);
});

function renderDesktop() {
	const onPatch = vi.fn();
	const onOpenFull = vi.fn();
	const onDataChanged = vi.fn();
	render(ProjectDesktop, {
		props: {
			projects: PROJECTS,
			visible: PROJECTS,
			completed: [],
			searching: false,
			onPatch,
			onOpenFull,
			onDataChanged
		}
	});
	return { onPatch, onOpenFull, onDataChanged };
}

describe('ProjectDesktop', () => {
	beforeEach(() => {
		page.state = {};
		localStorage.clear();
		vi.stubGlobal('fetch', fetchMock);
		Element.prototype.scrollIntoView = vi.fn();
		vi.stubGlobal(
			'ResizeObserver',
			class {
				observe() {}
				unobserve() {}
				disconnect() {}
			}
		);
		mocks.setProjectParent.mockResolvedValue({});
		// jsdom has no matchMedia; the card asks whether it is on a phone.
		vi.stubGlobal('matchMedia', (query: string) => ({
			matches: false,
			media: query,
			onchange: null,
			addEventListener: () => undefined,
			removeEventListener: () => undefined,
			addListener: () => undefined,
			removeListener: () => undefined,
			dispatchEvent: () => false
		}));
	});

	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
		vi.unstubAllGlobals();
	});

	it('shows top-level projects as tiles and sub-projects inside their folder', () => {
		renderDesktop();

		expect(
			screen.getByRole('link', {
				name: 'Wayne Strategies, holds 1 project, moving, 10 open tasks, 3 docs'
			})
		).toBeTruthy();
		expect(screen.getByText('1 nested')).toBeTruthy();
		const nine = screen.getByRole('link', {
			name: '9takes, being shaped, 11 overdue, 34 open tasks, 0 docs'
		});
		// The red overdue count sits on the tile.
		expect(nine.querySelector('.badge')?.textContent).toBe('11');
		expect(screen.getByRole('group', { name: 'What the colors mean' })).toBeTruthy();
		expect(screen.queryByRole('link', { name: /^Redline/ })).toBeNull();
	});

	it('nests a project from the keyboard: M, pick, confirm, then Undo', async () => {
		const { onPatch } = renderDesktop();
		const tile = screen.getByRole('link', { name: /^9takes/ });
		tile.focus();

		await fireEvent.keyDown(tile, { key: 'm' });
		const picker = screen.getByRole('dialog', { name: 'Move “9takes” to…' });
		const shared = within(picker).getByRole('button', { name: /Shared Thing/ });
		expect((shared as HTMLButtonElement).disabled).toBe(true);
		expect(shared.textContent).toContain('needs admin access on both');

		await fireEvent.click(within(picker).getByRole('button', { name: /Wayne Strategies/ }));
		const confirm = screen.getByRole('dialog', { name: 'Put 9takes inside Wayne Strategies?' });
		await fireEvent.click(within(confirm).getByRole('button', { name: 'Move inside' }));

		await waitFor(() => expect(mocks.setProjectParent).toHaveBeenCalledWith('nine', 'ws'));
		await waitFor(() =>
			expect(onPatch).toHaveBeenCalledWith([
				{ id: 'nine', patch: { parent_project_id: 'ws' } }
			])
		);
		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
		const toast = mocks.toastAdd.mock.calls.at(-1)![0];
		expect(toast.message).toBe('9takes is now inside Wayne Strategies.');

		toast.action!.onClick();
		// Undo spends the toast so it can't be pressed twice.
		expect(mocks.toastRemove).toHaveBeenCalledWith('toast-1');
		await waitFor(() => expect(mocks.setProjectParent).toHaveBeenLastCalledWith('nine', null));
	});

	it('groups tiles by what actually happened', async () => {
		renderDesktop();

		await fireEvent.click(screen.getByRole('button', { name: 'By activity' }));

		const headings = screen
			.getAllByRole('heading', { level: 2 })
			.map((h) => h.textContent?.trim());
		expect(headings).toEqual(['MOVING · 1', 'BEING SHAPED · 1', 'NO HISTORY YET · 1']);
	});

	it('explains why a project that holds others cannot go inside one', async () => {
		renderDesktop();
		const tile = screen.getByRole('link', { name: /^Wayne Strategies/ });
		tile.focus();

		await fireEvent.keyDown(tile, { key: 'M' });
		const option = within(screen.getByRole('dialog')).getByRole('button', { name: /9takes/ });
		expect((option as HTMLButtonElement).disabled).toBe(true);
		expect(option.textContent).toContain('Wayne Strategies holds projects');
	});

	it('opens a card in shallow history and moves a doc with its nested docs', async () => {
		const { onPatch } = renderDesktop();

		await fireEvent.click(screen.getByRole('link', { name: /^Wayne Strategies/ }));
		expect(pushState).toHaveBeenCalledWith('', { desktopCard: 'ws', desktopDepth: 1 });
		// A project that holds others opens on its nested projects, first in line.
		const inside = await screen.findByRole('tab', { name: /Nested projects/ });
		expect(inside.getAttribute('aria-selected')).toBe('true');
		expect(screen.getAllByRole('tab')[0]).toBe(inside);
		expect(screen.getByRole('button', { name: /Redline/ })).toBeTruthy();

		await fireEvent.click(screen.getByRole('tab', { name: /Docs/ }));
		await screen.findByText('Pricing notes');
		// START HERE never leaves its project.
		expect(screen.getByTitle('START HERE stays in this project.')).toBeTruthy();
		// Dated tasks are locked while calendar moves are off.
		await fireEvent.click(screen.getByRole('tab', { name: /Tasks/ }));
		expect(
			screen.getByTitle("Dated tasks can't move yet: calendar moves are off.")
		).toBeTruthy();
		await fireEvent.click(screen.getByRole('tab', { name: /Docs/ }));

		const row = screen.getByText('Pricing notes').closest('[data-drag-kind]') as HTMLElement;
		await fireEvent.click(within(row).getByRole('button', { name: 'Move' }));
		const picker = screen.getByRole('dialog', { name: 'Move “Pricing notes” to…' });
		expect(within(picker).getByRole('button', { name: /Shared Thing/ }).textContent).toContain(
			'You can view Shared Thing but not add to it.'
		);
		await fireEvent.click(within(picker).getByRole('button', { name: /9takes/ }));

		const confirm = screen.getByRole('dialog', { name: 'Move “Pricing notes” to 9takes?' });
		await within(confirm).findByText('Its 1 nested doc moves with it. Links keep working.');
		const move = within(confirm).getByRole('button', { name: 'Move' }) as HTMLButtonElement;
		await waitFor(() => expect(move.disabled).toBe(false));
		await fireEvent.click(move);

		await waitFor(() =>
			expect(onPatch).toHaveBeenCalledWith([
				{ id: 'ws', patch: { document_count: 1 } },
				{ id: 'nine', patch: { document_count: 2 } }
			])
		);
		const apply = fetchMock.mock.calls.find(([url]) => url === '/api/onto/organize/apply')!;
		expect(JSON.parse(String(apply[1]!.body))).toMatchObject({
			confirmation_token: 'a'.repeat(32),
			moves: [
				{
					kind: 'document',
					id: 'd1',
					project_id: 'ws',
					destination_project_id: 'nine',
					parent_id: null,
					position: 0
				}
			],
			project_versions: { ws: '3', nine: '7' }
		});
		expect(mocks.toastAdd.mock.calls.at(-1)![0].message).toBe(
			'Moved “Pricing notes” to 9takes.'
		);
	});

	it('reads docs and tasks beside the list, walks them and chats about them', async () => {
		const back = vi.spyOn(history, 'back').mockImplementation(() => undefined);
		page.state = { desktopCard: 'ws', desktopDepth: 1 };
		const { onDataChanged } = renderDesktop();

		await fireEvent.click(await screen.findByRole('tab', { name: /Docs/ }));
		await fireEvent.click(await screen.findByRole('button', { name: 'Pricing notes' }));
		// Opening pushes one entry, so Back closes the reader before the card.
		expect(pushState).toHaveBeenLastCalledWith('', {
			desktopCard: 'ws',
			desktopDepth: 2,
			desktopPeek: { kind: 'document', id: 'd1' },
			desktopPeekPushed: true
		});
		expect(await screen.findByText('Body of d1')).toBeTruthy();
		// The card stays a card: no modal opened.
		expect(screen.queryByRole('dialog')).toBeNull();

		// J walks into the folder: the next doc is nested, and its folder opens.
		await fireEvent.keyDown(window, { key: 'j' });
		expect(replaceState).toHaveBeenLastCalledWith(
			'',
			expect.objectContaining({ desktopPeek: { kind: 'document', id: 'd2' } })
		);
		expect(await screen.findByText('Body of d2')).toBeTruthy();
		const nested = screen.getByRole('button', { name: 'Old prices' });
		expect(nested.getAttribute('aria-current')).toBe('true');

		// A task changes state in one tap; the list and tiles catch up.
		await fireEvent.click(screen.getByRole('tab', { name: /Tasks/ }));
		await fireEvent.click(screen.getByRole('button', { name: 'Call Ana' }));
		const markDone = (await screen.findByRole('button', {
			name: 'Mark done'
		})) as HTMLButtonElement;
		// The reader renders this control before its full task has loaded.
		await waitFor(() => expect(markDone.disabled).toBe(false));
		await fireEvent.click(markDone);
		await waitFor(() =>
			expect(
				fetchMock.mock.calls.find(
					([url, init]) => url === '/api/onto/tasks/t1' && init?.method === 'PATCH'
				)?.[1]?.body
			).toBe(JSON.stringify({ state_key: 'done' }))
		);
		await waitFor(() => expect(onDataChanged).toHaveBeenCalled());

		// The reader's brain bolt chats about the task, beside it.
		await fireEvent.click(screen.getByRole('button', { name: 'Chat about this task' }));
		expect(await screen.findByRole('region', { name: 'chat task in ws' })).toBeTruthy();

		// Esc backs out one step at a time: chat, then the reader.
		await fireEvent.keyDown(window, { key: 'Escape' });
		expect(screen.queryByRole('region', { name: 'chat task in ws' })).toBeNull();
		await fireEvent.keyDown(window, { key: 'Escape' });
		await waitFor(() => expect(back).toHaveBeenCalledTimes(1));
	});

	it('collapses back past every card it pushed', async () => {
		const go = vi.spyOn(history, 'go').mockImplementation(() => undefined);
		page.state = { desktopCard: 'redline', desktopDepth: 2 };
		renderDesktop();

		await screen.findByRole('heading', { name: 'Redline' });
		// One button for wide screens, one under the header on phones.
		expect(
			screen.getAllByRole('button', { name: /Take out of Wayne Strategies/ })
		).toHaveLength(2);
		await fireEvent.keyDown(window, { key: 'Escape' });

		expect(go).toHaveBeenCalledWith(-2);
	});
});
