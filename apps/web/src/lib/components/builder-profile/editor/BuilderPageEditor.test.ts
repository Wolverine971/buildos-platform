// apps/web/src/lib/components/builder-profile/editor/BuilderPageEditor.test.ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import type {
	BuilderEditorData,
	BuilderPageSection,
	BuilderProfileView
} from '$lib/builder-profile/types';

vi.mock('$lib/stores/toast.store', () => ({
	toastService: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }
}));
vi.mock('$app/navigation', () => ({ beforeNavigate: vi.fn(), goto: vi.fn() }));

import BuilderPageEditor from './BuilderPageEditor.svelte';

const P1 = '00000000-0000-4000-8000-000000000001';
const P2 = '00000000-0000-4000-8000-000000000002';
/** Links and projects save 800 ms after the last change. */
const AUTOSAVE = { timeout: 3000 };

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
			cover_url: null,
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
			{
				id: 'l1',
				kind: 'link',
				url: 'https://a.com/',
				label: 'Newsletter',
				note: null,
				audience: 'anyone'
			},
			{
				id: 'l2',
				kind: 'link',
				url: 'https://b.com/',
				label: 'Team notes',
				note: null,
				audience: 'collaborators'
			}
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
					reply_url: null,
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
		viewer: {
			signed_in: true,
			is_owner: true,
			works_with: false,
			follows: false,
			ask_pending: false
		},
		profile: { handle: 'dj', name: 'DJ Wayne', headline: 'Founder, BuildOS' },
		settings: {
			show_build_log: false,
			show_agent_split: true,
			show_writing: true,
			show_builds_with: true
		},
		links: [],
		projects: [
			{
				id: P1,
				level: 'listed',
				name: '9takes',
				pitch: 'Answer before you see anyone else.',
				audience: 'anyone'
			}
		],
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

const previewRoute = {
	'GET /api/profile/builder/preview': {
		body: { success: true, data: { view: previewView(), origin: 'https://build-os.com' } }
	}
};

function calls(fetchMock: ReturnType<typeof mockApi>, key: string) {
	return fetchMock.mock.calls.filter(([url, init]) => `${init?.method ?? 'GET'} ${url}` === key);
}

function bodyOf(fetchMock: ReturnType<typeof mockApi>, key: string, index = 0) {
	const [, init] = calls(fetchMock, key)[index]!;
	return JSON.parse(String(init?.body));
}

function renderEditor(
	data = editorData(),
	preview: BuilderProfileView | null = previewView(),
	initialSection: BuilderPageSection = 'profile'
) {
	return render(BuilderPageEditor, {
		props: { data, preview, origin: 'https://build-os.com', initialSection }
	});
}

function canvas() {
	return screen.getByRole('main', { name: 'Your page' });
}

function panel() {
	return screen.getByRole('complementary', { name: 'Edit your page' });
}

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe('BuilderPageEditor', () => {
	it('opens ready: status, address, and the page as anyone sees it', async () => {
		mockApi({});
		renderEditor();

		expect(screen.getByText('build-os.com/@dj')).toBeInTheDocument();
		expect(screen.getByText('Draft')).toBeInTheDocument();
		const page = canvas();
		expect(within(page).getByRole('heading', { name: 'DJ Wayne' })).toBeInTheDocument();
		// Anyone: the link kept for people you work with stays off the page.
		expect(within(page).getByText('Newsletter')).toBeInTheDocument();
		expect(within(page).queryByText('Team notes')).toBeNull();
		await fireEvent.click(within(page).getByRole('button', { name: 'People I work with' }));
		expect(within(page).getByText('Team notes')).toBeInTheDocument();
	});

	it('opens the panel for whatever part of the page you click', async () => {
		mockApi({});
		renderEditor();
		expect(screen.getByRole('tab', { name: 'Profile' })).toHaveAttribute(
			'aria-selected',
			'true'
		);

		await fireEvent.click(within(canvas()).getByRole('button', { name: 'Edit links' }));
		expect(screen.getByRole('tab', { name: 'Links' })).toHaveAttribute('aria-selected', 'true');
		expect(
			within(panel()).getByRole('heading', { name: 'Links', level: 2 })
		).toBeInTheDocument();

		await fireEvent.click(within(canvas()).getByRole('button', { name: 'Edit 9takes' }));
		expect(screen.getByRole('tab', { name: 'Projects' })).toHaveAttribute(
			'aria-selected',
			'true'
		);
		expect(screen.getByRole('button', { name: 'All projects' })).toBeInTheDocument();
		expect(screen.getByLabelText('Pitch')).toHaveValue('Answer before you see anyone else.');
	});

	it('asks for an address first when there is no handle', async () => {
		mockApi({});
		renderEditor(editorData({ handle: null }), null);
		expect(screen.getByText('Pick your address first.')).toBeInTheDocument();
		expect(screen.getByText('No address yet')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled();
	});

	it('shows typing on the page at once, and saves only the field you changed on blur', async () => {
		const fetchMock = mockApi({
			'PATCH /api/profile/builder': { body: { success: true, data: { saved: true } } }
		});
		renderEditor();
		await fireEvent.blur(screen.getByLabelText('Headline'));
		expect(calls(fetchMock, 'PATCH /api/profile/builder')).toHaveLength(0);

		const location = screen.getByLabelText('Location');
		await fireEvent.input(location, { target: { value: '  Glen Burnie,  MD ' } });
		expect(within(canvas()).getByText('Glen Burnie, MD')).toBeInTheDocument();
		await fireEvent.blur(location);
		await waitFor(() => expect(calls(fetchMock, 'PATCH /api/profile/builder')).toHaveLength(1));
		expect(bodyOf(fetchMock, 'PATCH /api/profile/builder')).toEqual({
			location: 'Glen Burnie, MD'
		});
		expect(await screen.findByText('Saved')).toBeInTheDocument();
	});

	it('keeps typed text and shows the server message when a save fails', async () => {
		mockApi({
			'PATCH /api/profile/builder': {
				status: 400,
				body: { success: false, error: 'Headline can be at most 120 characters' }
			}
		});
		renderEditor();
		const headline = screen.getByLabelText('Headline');
		await fireEvent.input(headline, { target: { value: 'Something new' } });
		await fireEvent.blur(headline);
		expect(
			await screen.findAllByText('Headline can be at most 120 characters')
		).not.toHaveLength(0);
		expect(screen.getByText('Not saved')).toBeInTheDocument();
		expect((headline as HTMLInputElement).value).toBe('Something new');
	});

	it('won’t save an empty name', async () => {
		const fetchMock = mockApi({});
		renderEditor();
		const name = screen.getByLabelText('Name');
		await fireEvent.input(name, { target: { value: '   ' } });
		await fireEvent.blur(name);
		expect(screen.getByText('Add your name.')).toBeInTheDocument();
		expect(calls(fetchMock, 'PATCH /api/profile/builder')).toHaveLength(0);
	});

	it('adds a project from the picker and saves the page’s projects in order on its own', async () => {
		const fetchMock = mockApi({
			...previewRoute,
			'PUT /api/profile/builder/projects': { body: { success: true, data: { saved: 2 } } }
		});
		renderEditor(editorData(), previewView(), 'projects');
		await fireEvent.click(screen.getByRole('button', { name: 'Add a project' }));
		await fireEvent.click(screen.getByRole('button', { name: /Client portal/ }));

		// It opens, on the page as Listed, with a warning because others are in it.
		expect(screen.getByText(/2 other people are in this project/)).toBeInTheDocument();
		expect(
			within(canvas()).getByRole('heading', { name: 'Client portal' })
		).toBeInTheDocument();

		await waitFor(
			() => expect(calls(fetchMock, 'PUT /api/profile/builder/projects')).toHaveLength(1),
			AUTOSAVE
		);
		expect(bodyOf(fetchMock, 'PUT /api/profile/builder/projects')).toEqual({
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
		// A newly shown project needs its numbers from the server.
		await waitFor(() =>
			expect(calls(fetchMock, 'GET /api/profile/builder/preview')).toHaveLength(1)
		);
	});

	it('saves links a moment after you stop typing', async () => {
		const fetchMock = mockApi({
			'PUT /api/profile/builder/links': { body: { success: true, data: { saved: 2 } } }
		});
		renderEditor(editorData(), previewView(), 'links');
		await fireEvent.click(
			within(panel()).getByRole('button', { name: /Newsletter/, expanded: false })
		);
		await fireEvent.input(screen.getByLabelText('Title'), {
			target: { value: 'Friday notes' }
		});
		expect(within(canvas()).getByText('Friday notes')).toBeInTheDocument();

		await waitFor(
			() => expect(calls(fetchMock, 'PUT /api/profile/builder/links')).toHaveLength(1),
			AUTOSAVE
		);
		expect(bodyOf(fetchMock, 'PUT /api/profile/builder/links')).toEqual({
			links: [
				{ kind: 'link', url: 'https://a.com/', label: 'Friday notes', audience: 'anyone' },
				{
					kind: 'link',
					url: 'https://b.com/',
					label: 'Team notes',
					audience: 'collaborators'
				}
			]
		});
	});

	it('holds a link back until its address is a web address', async () => {
		const fetchMock = mockApi({});
		renderEditor(editorData(), previewView(), 'links');
		await fireEvent.click(screen.getByRole('button', { name: 'Add social' }));
		const input = screen.getByLabelText('Social link 1');
		await fireEvent.input(input, { target: { value: 'javascript:alert(1)' } });
		await fireEvent.blur(input);
		expect(
			screen.getByText('Needs a web address that starts with https://')
		).toBeInTheDocument();
		await new Promise((resolve) => setTimeout(resolve, 1000));
		expect(calls(fetchMock, 'PUT /api/profile/builder/links')).toHaveLength(0);
	});

	it('uses drafted words one by one or all at once', async () => {
		const fetchMock = mockApi({
			'POST /api/profile/builder/draft': {
				body: {
					success: true,
					data: {
						headline: 'Founder and builder',
						bio: 'I build tools for people making complex things.',
						pitches: [
							{
								project_id: P2,
								pitch: 'A portal where clients see where things stand.'
							}
						]
					}
				}
			},
			'PATCH /api/profile/builder': { body: { success: true, data: { saved: true } } },
			'PUT /api/profile/builder/projects': { body: { success: true, data: { saved: 2 } } },
			...previewRoute
		});
		renderEditor();
		await fireEvent.click(screen.getByRole('button', { name: 'Draft for me' }));
		await waitFor(() =>
			expect(calls(fetchMock, 'POST /api/profile/builder/draft')).toHaveLength(1)
		);
		expect(bodyOf(fetchMock, 'POST /api/profile/builder/draft')).toEqual({ project_ids: [P1] });

		await fireEvent.click(await screen.findByRole('button', { name: 'Use all' }));
		await waitFor(() => expect(calls(fetchMock, 'PATCH /api/profile/builder')).toHaveLength(2));
		expect(bodyOf(fetchMock, 'PATCH /api/profile/builder', 0)).toEqual({
			headline: 'Founder and builder'
		});
		expect(bodyOf(fetchMock, 'PATCH /api/profile/builder', 1)).toEqual({
			bio: 'I build tools for people making complex things.'
		});
		await waitFor(
			() => expect(calls(fetchMock, 'PUT /api/profile/builder/projects')).toHaveLength(1),
			AUTOSAVE
		);
		expect(bodyOf(fetchMock, 'PUT /api/profile/builder/projects').projects[1]).toEqual({
			project_id: P2,
			level: 'listed',
			audience: 'anyone',
			pitch: 'A portal where clients see where things stand.'
		});
		expect((screen.getByLabelText('Headline') as HTMLInputElement).value).toBe(
			'Founder and builder'
		);
		expect(screen.getAllByText('Used')).toHaveLength(3);
	});

	it('shows why publishing failed', async () => {
		mockApi({
			'POST /api/profile/builder/publish': {
				status: 409,
				body: {
					success: false,
					error: 'Pick a handle first. Your page lives at build-os.com/@handle.'
				}
			}
		});
		renderEditor();
		await fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
		expect(
			await screen.findByText('Pick a handle first. Your page lives at build-os.com/@handle.')
		).toBeInTheDocument();
		expect(screen.getByText('Draft')).toBeInTheDocument();
	});

	it('says so when nothing moved this week', async () => {
		mockApi({
			'POST /api/profile/builder/updates': { body: { success: true, data: { created: 0 } } }
		});
		renderEditor(editorData(), previewView(), 'updates');
		await fireEvent.click(screen.getByRole('button', { name: 'Draft this week now' }));
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
			...previewRoute,
			'PATCH /api/profile/builder/updates': {
				body: { success: true, data: { decided: 'publish' } }
			}
		});
		renderEditor(data, previewView(), 'updates');
		expect(screen.getByRole('tab', { name: /Updates/ })).toHaveTextContent('1');
		const line = screen.getByLabelText('Now line');
		await fireEvent.input(line, { target: { value: 'Five beta users onboarded.' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Publish all' }));
		await waitFor(() =>
			expect(calls(fetchMock, 'PATCH /api/profile/builder/updates')).toHaveLength(1)
		);
		expect(bodyOf(fetchMock, 'PATCH /api/profile/builder/updates')).toEqual({
			id: 'd1',
			action: 'publish',
			body: 'Five beta users onboarded.'
		});
		await waitFor(() => expect(screen.queryByLabelText('Now line')).toBeNull());
		expect(within(canvas()).getByText('Five beta users onboarded.')).toBeInTheDocument();
	});

	it('saves a section switch at once', async () => {
		const fetchMock = mockApi({
			...previewRoute,
			'PATCH /api/profile/builder': { body: { success: true, data: { saved: true } } }
		});
		renderEditor(editorData(), previewView(), 'settings');
		await fireEvent.click(screen.getByRole('switch', { name: 'Writing' }));
		await waitFor(() => expect(calls(fetchMock, 'PATCH /api/profile/builder')).toHaveLength(1));
		expect(bodyOf(fetchMock, 'PATCH /api/profile/builder')).toEqual({ show_writing: false });
	});
});
