// apps/web/src/lib/components/builder-profile/BuilderProjectPage.test.ts
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import type {
	BuilderProfileProjectCard,
	BuilderProfileView,
	BuilderProjectPageView
} from '$lib/builder-profile/types';

vi.mock('$lib/stores/toast.store', () => ({
	toastService: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }
}));

import BuilderProjectPage from './BuilderProjectPage.svelte';
import BuilderProfilePage from './BuilderProfilePage.svelte';

const NINE = '05c40ed8-9dbe-4893-bd64-8aeec90eab40';
const BOS = 'f7824d94-0de0-460c-80dd-67bf11f6445a';
const RADAR = '7bb400ff-e299-40b0-9a4b-e6081f2e6ef8';

const nine: BuilderProfileProjectCard = {
	id: NINE,
	level: 'live',
	name: '9takes',
	pitch: 'Enneagram discussions where you answer first.',
	link_url: 'https://9takes.com/',
	audience: 'anyone',
	goals: ['Fill the free 1-on-1 beta'],
	next_milestone: { title: '5 beta signups', due_at: '2026-11-01T03:59:59+00:00' },
	looking_for: '5 people for a free 1-on-1 Enneagram beta session.',
	reply_url: 'https://9takes.com/beta',
	this_week: 'Scheduled the content series.',
	this_week_at: '2026-10-23T22:59:11Z',
	weekly: Array.from({ length: 12 }, (_, i) => [i, 0] as [number, number]),
	member_count: 3
};

function page(overrides: Partial<BuilderProfileView> = {}): BuilderProfileView {
	return {
		found: true,
		status: 'published',
		viewer: {
			signed_in: false,
			is_owner: false,
			works_with: false,
			follows: false,
			ask_pending: false
		},
		profile: { handle: 'djwayne', name: 'DJ Wayne', headline: 'Founder, BuildOS' },
		settings: {
			show_build_log: true,
			show_agent_split: true,
			show_writing: true,
			show_builds_with: true
		},
		links: [],
		projects: [
			{
				id: BOS,
				level: 'live',
				name: 'BuildOS',
				audience: 'anyone',
				pitch: 'A thinking environment.'
			},
			nine,
			{
				id: RADAR,
				level: 'listed',
				name: 'Radar',
				audience: 'anyone',
				link_url: 'https://radar.dev/'
			}
		],
		writing: [],
		builds_with: [],
		...overrides
	};
}

function projectView(overrides: Partial<BuilderProjectPageView> = {}): BuilderProjectPageView {
	return {
		found: true,
		page: page(),
		project: nine,
		activity: {
			includes_private: false,
			show_agent_split: true,
			today: '2026-10-25',
			days: [['2026-10-20', 4, 2]]
		},
		updates: [
			{
				body: 'Posted the Robert Greene piece.',
				week_of: '2026-10-12',
				at: '2026-10-16T12:00:00Z'
			}
		],
		writing: [{ title: 'Beta notes', url_path: '/p/dj-wayne/beta-notes' }],
		built_by: [{ handle: 'sam', name: 'Sam Lee' }],
		...overrides
	};
}

let assigned = '';
const realLocation = window.location;
beforeEach(() => {
	assigned = '';
	Object.defineProperty(window, 'location', {
		configurable: true,
		value: {
			...realLocation,
			get href() {
				return 'https://build-os.com/@djwayne/9takes';
			},
			set href(value: string) {
				assigned = value;
			}
		}
	});
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => new Response('{}', { status: 200 }))
	);
});
afterEach(() => {
	cleanup();
	Object.defineProperty(window, 'location', { configurable: true, value: realLocation });
	vi.unstubAllGlobals();
});

describe('BuilderProjectPage', () => {
	it('shows the project with its reply link, updates, docs, people and other projects', () => {
		render(BuilderProjectPage, { data: projectView(), origin: 'https://build-os.com' });

		expect(screen.getByRole('heading', { level: 1, name: '9takes' })).toBeTruthy();
		expect(screen.getByRole('link', { name: /I’m interested/ }).getAttribute('href')).toBe(
			'https://9takes.com/beta'
		);
		const updates = screen.getByRole('heading', { name: 'Updates' }).closest('section')!;
		// The current line leads, then the published history.
		const lines = within(updates)
			.getAllByRole('listitem')
			.map((li) => li.textContent);
		expect(lines[0]).toContain('Scheduled the content series.');
		expect(lines[1]).toContain('Posted the Robert Greene piece.');
		expect(screen.getByRole('link', { name: /Beta notes/ }).getAttribute('href')).toBe(
			'/p/dj-wayne/beta-notes'
		);
		const people = screen.getByRole('heading', { name: 'Built by' }).closest('section')!;
		expect(
			within(people)
				.getByRole('link', { name: /Sam Lee/ })
				.getAttribute('href')
		).toBe('/@sam');
		expect(within(people).getByText(/\+1/)).toBeTruthy();

		const more = screen.getByRole('heading', { name: 'More from DJ' }).closest('section')!;
		expect(
			within(more)
				.getByRole('link', { name: /BuildOS/ })
				.getAttribute('href')
		).toBe('/@djwayne/buildos');
		const radar = within(more).getByRole('link', { name: /Radar/ });
		expect(radar.getAttribute('href')).toBe('https://radar.dev/');
		expect(radar.getAttribute('target')).toBe('_blank');
		expect(screen.getByText('Counting work on 9takes only.')).toBeTruthy();
	});

	it('sends a signed-out Follow to sign-in and back to this project, ready to follow', async () => {
		render(BuilderProjectPage, { data: projectView(), origin: 'https://build-os.com' });
		await fireEvent.click(screen.getByRole('button', { name: 'Follow 9takes' }));
		const back = decodeURIComponent(
			new URL(assigned, 'https://x.test').searchParams.get('redirect')!
		);
		expect(back).toBe(`/@djwayne/9takes?intent=follow&project=${NINE}`);
	});

	it('gives the owner an edit link to this project instead of Follow and Ask to join', () => {
		render(BuilderProjectPage, {
			data: projectView({
				page: page({
					viewer: {
						signed_in: true,
						is_owner: true,
						works_with: false,
						follows: false,
						ask_pending: false
					}
				})
			}),
			origin: 'https://build-os.com'
		});
		expect(screen.getByRole('link', { name: /Edit project/ }).getAttribute('href')).toBe(
			`/profile/page?section=projects&project=${NINE}`
		);
		expect(screen.queryByRole('button', { name: /Follow/ })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Ask to join' })).toBeNull();
	});
});

describe('BuilderProfilePage project cards', () => {
	it('opens a Live project’s page from its card and a Listed one’s website', () => {
		render(BuilderProfilePage, { view: page(), origin: 'https://build-os.com' });
		expect(screen.getByRole('link', { name: '9takes' }).getAttribute('href')).toBe(
			'/@djwayne/9takes'
		);
		const radar = screen.getByRole('link', { name: 'Radar' });
		expect(radar.getAttribute('href')).toBe('https://radar.dev/');
		expect(screen.getByRole('link', { name: /I’m interested/ }).getAttribute('href')).toBe(
			'https://9takes.com/beta'
		);
	});

	it('brings a signed-out project Follow back to follow, not to ask to join', async () => {
		render(BuilderProfilePage, { view: page(), origin: 'https://build-os.com' });
		const card = screen.getByRole('article', { name: '9takes' });
		await fireEvent.click(within(card).getByRole('button', { name: 'Follow' }));
		const back = decodeURIComponent(
			new URL(assigned, 'https://x.test').searchParams.get('redirect')!
		);
		expect(back).toBe(`/@djwayne?intent=follow&project=${NINE}`);
		expect(back).not.toContain('ask=');
	});
});
