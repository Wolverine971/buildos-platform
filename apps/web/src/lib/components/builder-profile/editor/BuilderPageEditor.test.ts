// apps/web/src/lib/components/builder-profile/editor/BuilderPageEditor.test.ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import type { BuilderEditorData, BuilderProfileView } from '$lib/builder-profile/types';

vi.mock('$lib/stores/toast.store', () => ({
	toastService: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }
}));

import BuilderPageEditor from './BuilderPageEditor.svelte';

const P1 = '00000000-0000-4000-8000-000000000001';
const P2 = '00000000-0000-4000-8000-000000000002';

function editorData(overrides: Partial<BuilderEditorData> = {}): BuilderEditorData {
	return {
		handle: 'dj',
		name: 'DJ Wayne',
		status: 'draft',
		published_at: null,
		discoverability: 'none',
		settings: {
			headline: 'Founder, BuildOS',
			location: null,
			avatar_url: null,
			now_text: null,
			bio: null,
			show_build_log: true,
			build_log_includes_private: false,
			show_agent_split: true,
			show_writing: true,
			show_builds_with: true,
			show_on_collaborator_pages: true,
			weekly_drafts: false
		},
		links: [
			{ id: 'l1', kind: 'link', url: 'https://a.com/', label: 'Newsletter', note: null, audience: 'anyone' },
			{ id: 'l2', kind: 'link', url: 'https://b.com/', label: 'Team notes', note: null, audience: 'collaborators' }
		],
		projects: [
			{
				project_id: P1,
				name: '9takes',
				description: null,
				glyphs: ['🧠'],
				stage: 'execution',
				state: null,
				member_count: 1,
				last_active_at: null,
				changes_year: 0,
				by_agents_year: 0,
				goals: [],
				next_milestone: null,
				placement: {
					level: 'listed',
					public_name: null,
					pitch: 'Answer before you see anyone else.',
					looking_for: null,
					link_url: null,
					goal_ids: [],
					show_next_milestone: true,
					this_week: null,
					audience: 'anyone',
					position: 0
				}
			},
			{
				project_id: P2,
				name: 'Client portal',
				description: null,
				glyphs: [],
				stage: null,
				state: null,
				member_count: 3,
				last_active_at: null,
				changes_year: 0,
				by_agents_year: 0,
				goals: [],
				next_milestone: null,
				placement: null
			}
		],
		drafts: [],
		sign_in_avatar_url: null,
		...overrides
	};
}

function previewView(): BuilderProfileView {
	return {
		found: true,
		status: 'draft',
		viewer: { signed_in: true, is_owner: true, works_with: false, follows: false, ask_pending: false },
		profile: { handle: 'dj', name: 'DJ Wayne', headline: 'Founder, BuildOS' },
		settings: { show_build_log: false, show_agent_split: true, show_writing: true, show_builds_with: true },
		links: [
			{ id: 'l1', kind: 'link', url: 'https://a.com/', label: 'Newsletter', audience: 'anyone' },
			{ id: 'l2', kind: 'link', url: 'https://b.com/', label: 'Team notes', audience: 'collaborators' }
		],
		projects: [],
		writing: [],
		builds_with: []
	};
}

type Route = { status?: number; body: unknown };

function mockApi(routes: Record<string, Route | ((init?: RequestInit) => Route)>) {
	const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
		const key = `${init?.method ?? 'GET'} ${url}`;
		const entry = routes[key];
		if (!entry) throw new Error(`Unexpected request: ${key}`);
		const { status = 200, body } = typeof entry === 'function' ? entry(init) : entry;
		return { ok: status < 400, status, json: async () => body } as Response;
	});
	vi.stubGlobal('fetch', fetchMock);
	return fetchMock;
}

function baseRoutes(data = editorData()) {
	return {
		'GET /api/profile/builder': { body: { success: true, data } },
		'GET /api/profile/builder/preview': {
			body: { success: true, data: { view: previewView(), origin: 'https://build-os.com' } }
		}
	};
}

function calls(fetchMock: ReturnType<typeof mockApi>, key: string) {
	return fetchMock.mock.calls.filter(([url, init]) => `${init?.method ?? 'GET'} ${url}` === key);
}

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe('BuilderPageEditor', () => {
	it('shows the draft status, the address and the live preview', async () => {
		mockApi(baseRoutes());
		render(BuilderPageEditor);

		expect(await screen.findByText('build-os.com/@dj')).toBeInTheDocument();
		expect(screen.getByText('Draft')).toBeInTheDocument();
		expect(
			screen.getByText(
				'Nothing is public until you publish. Publishing also lets people find you by @handle.'
			)
		).toBeInTheDocument();
		const preview = screen.getAllByRole('region', { name: 'Preview of your page' })[0]!;
		expect(within(preview).getByRole('heading', { name: 'DJ Wayne' })).toBeInTheDocument();
		// Anyone: the link kept for people you work with stays out of the preview.
		expect(within(preview).getByText('Newsletter')).toBeInTheDocument();
		expect(within(preview).queryByText('Team notes')).toBeNull();
		await fireEvent.click(within(preview.parentElement!).getByRole('button', { name: 'People I work with' }));
		expect(within(preview).getByText('Team notes')).toBeInTheDocument();
	});

	it('points to the handle field when there is no handle yet', async () => {
		mockApi({
			'GET /api/profile/builder': { body: { success: true, data: editorData({ handle: null }) } },
			'GET /api/profile/builder/preview': {
				body: { success: true, data: { view: null, origin: 'https://build-os.com' } }
			}
		});
		render(BuilderPageEditor);
		expect(await screen.findByText('Pick a handle above.')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled();
	});

	it('saves only the header field you changed, on blur', async () => {
		const fetchMock = mockApi({
			...baseRoutes(),
			'PATCH /api/profile/builder': { body: { success: true, data: { saved: true } } }
		});
		render(BuilderPageEditor);
		const location = await screen.findByLabelText('Location');
		await fireEvent.blur(screen.getByLabelText('Headline'));
		expect(calls(fetchMock, 'PATCH /api/profile/builder')).toHaveLength(0);

		await fireEvent.input(location, { target: { value: '  Glen Burnie,  MD ' } });
		await fireEvent.blur(location);
		await waitFor(() => expect(calls(fetchMock, 'PATCH /api/profile/builder')).toHaveLength(1));
		const [, init] = calls(fetchMock, 'PATCH /api/profile/builder')[0]!;
		expect(JSON.parse(String(init?.body))).toEqual({ location: 'Glen Burnie, MD' });
		await waitFor(() => expect(calls(fetchMock, 'GET /api/profile/builder/preview')).toHaveLength(2));
	});

	it('keeps typed text and shows the server message when a save fails', async () => {
		mockApi({
			...baseRoutes(),
			'PATCH /api/profile/builder': {
				status: 400,
				body: { success: false, error: 'Headline can be at most 120 characters' }
			}
		});
		render(BuilderPageEditor);
		const headline = await screen.findByLabelText('Headline');
		await fireEvent.input(headline, { target: { value: 'Something new' } });
		await fireEvent.blur(headline);
		expect(await screen.findByText('Headline can be at most 120 characters')).toBeInTheDocument();
		expect((headline as HTMLInputElement).value).toBe('Something new');
	});

	it('puts a hidden project on the page and saves the placed projects in order', async () => {
		const fetchMock = mockApi({
			...baseRoutes(),
			'PUT /api/profile/builder/projects': { body: { success: true, data: { saved: 2 } } }
		});
		render(BuilderPageEditor);
		expect(await screen.findByText('Shared with 2 people. Check the public name.')).toBeInTheDocument();
		const save = screen.getByRole('button', { name: 'Save projects' });
		expect(save).toBeDisabled();

		const group = screen.getByRole('group', { name: 'Show Client portal on your page' });
		const listed = within(group).getByRole('button', { name: 'Listed' });
		expect(listed).toHaveAttribute('aria-pressed', 'false');
		await fireEvent.click(listed);
		const moved = screen.getByRole('group', { name: 'Show Client portal on your page' });
		expect(within(moved).getByRole('button', { name: 'Listed' })).toHaveAttribute('aria-pressed', 'true');
		expect(screen.getByText('On your page · 2')).toBeInTheDocument();
		expect(save).toBeEnabled();

		await fireEvent.click(save);
		await waitFor(() => expect(calls(fetchMock, 'PUT /api/profile/builder/projects')).toHaveLength(1));
		const [, init] = calls(fetchMock, 'PUT /api/profile/builder/projects')[0]!;
		expect(JSON.parse(String(init?.body))).toEqual({
			projects: [
				{
					project_id: P1,
					level: 'listed',
					audience: 'anyone',
					pitch: 'Answer before you see anyone else.'
				},
				{ project_id: P2, level: 'listed', audience: 'anyone' }
			]
		});
		expect(await screen.findByText('Saved')).toBeInTheDocument();
	});

	it('drafts the page from your projects and uses every suggestion at once', async () => {
		const fetchMock = mockApi({
			...baseRoutes(),
			'POST /api/profile/builder/draft': {
				body: {
					success: true,
					data: {
						headline: 'Founder and builder',
						bio: 'I build tools for people making complex things.',
						pitches: [{ project_id: P2, pitch: 'A portal where clients see where things stand.' }]
					}
				}
			},
			'PATCH /api/profile/builder': { body: { success: true, data: { saved: true } } },
			'PUT /api/profile/builder/projects': { body: { success: true, data: { saved: 2 } } }
		});
		render(BuilderPageEditor);
		await fireEvent.click(await screen.findByRole('button', { name: 'Draft my page' }));

		await waitFor(() => expect(calls(fetchMock, 'POST /api/profile/builder/draft')).toHaveLength(1));
		const [, draftInit] = calls(fetchMock, 'POST /api/profile/builder/draft')[0]!;
		expect(JSON.parse(String(draftInit?.body))).toEqual({ project_ids: [P1] });
		expect(await screen.findByText('Using it adds this project as Listed.')).toBeInTheDocument();

		await fireEvent.click(screen.getByRole('button', { name: 'Use all' }));
		await waitFor(() => expect(calls(fetchMock, 'PUT /api/profile/builder/projects')).toHaveLength(1));
		const [, patchInit] = calls(fetchMock, 'PATCH /api/profile/builder')[0]!;
		expect(JSON.parse(String(patchInit?.body))).toEqual({
			headline: 'Founder and builder',
			bio: 'I build tools for people making complex things.'
		});
		const [, putInit] = calls(fetchMock, 'PUT /api/profile/builder/projects')[0]!;
		expect(JSON.parse(String(putInit?.body)).projects[1]).toEqual({
			project_id: P2,
			level: 'listed',
			audience: 'anyone',
			pitch: 'A portal where clients see where things stand.'
		});
		expect((screen.getByLabelText('Headline') as HTMLInputElement).value).toBe('Founder and builder');
		expect(screen.getAllByText('Used')).toHaveLength(3);
	});

	it('shows why publishing failed', async () => {
		mockApi({
			...baseRoutes(),
			'POST /api/profile/builder/publish': {
				status: 409,
				body: { success: false, error: 'Pick a handle first. Your page lives at build-os.com/@handle.' }
			}
		});
		render(BuilderPageEditor);
		await fireEvent.click(await screen.findByRole('button', { name: 'Publish' }));
		expect(
			await screen.findByText('Pick a handle first. Your page lives at build-os.com/@handle.')
		).toBeInTheDocument();
		expect(screen.getByText('Draft')).toBeInTheDocument();
	});

	it('says so when nothing moved this week', async () => {
		mockApi({
			...baseRoutes(),
			'POST /api/profile/builder/updates': { body: { success: true, data: { created: 0 } } }
		});
		render(BuilderPageEditor);
		await fireEvent.click(await screen.findByRole('button', { name: 'Draft this week now' }));
		expect(await screen.findByText(/Nothing moved this week/)).toBeInTheDocument();
	});

	it('publishes an edited weekly line with its new text', async () => {
		const data = editorData({
			drafts: [
				{
					id: 'd1',
					project_id: null,
					project_name: null,
					body: 'Getting five beta users through onboarding.',
					status: 'drafted',
					week_of: '2026-10-19',
					created_at: '2026-10-23T12:00:00Z'
				}
			]
		});
		const fetchMock = mockApi({
			...baseRoutes(data),
			'PATCH /api/profile/builder/updates': { body: { success: true, data: { decided: 'publish' } } }
		});
		render(BuilderPageEditor);
		const line = await screen.findByLabelText('Now line');
		await fireEvent.input(line, { target: { value: 'Five beta users onboarded.' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Publish all' }));
		await waitFor(() => expect(calls(fetchMock, 'PATCH /api/profile/builder/updates')).toHaveLength(1));
		const [, init] = calls(fetchMock, 'PATCH /api/profile/builder/updates')[0]!;
		expect(JSON.parse(String(init?.body))).toEqual({
			id: 'd1',
			action: 'publish',
			body: 'Five beta users onboarded.'
		});
		await waitFor(() => expect(screen.queryByLabelText('Now line')).toBeNull());
		expect((screen.getByLabelText('Now') as HTMLInputElement).value).toBe('Five beta users onboarded.');
	});
});
