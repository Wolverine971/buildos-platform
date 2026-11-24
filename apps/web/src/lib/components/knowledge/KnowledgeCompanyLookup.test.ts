// apps/web/src/lib/components/knowledge/KnowledgeCompanyLookup.test.ts
// @vitest-environment jsdom
//
// What the company lookup shows on /knowledge (tasker 170): the banner line and the "Which
// one?" card. The checks are the promises made to the user:
//   - the paid web search is offered only where it is turned on, and only when something is left
//   - a tap on a company answers with that company; "None of these" and "Skip" do what they say
//   - the user's own clue (who they know there) is on the card
import { canonicalPlace } from '@buildos/shared-agent-ops/knowledge';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import KnowledgeCompanyQuestion from './KnowledgeCompanyQuestion.svelte';
import KnowledgeLocateBanner from './KnowledgeLocateBanner.svelte';
import type {
	CompanyOption,
	KnowledgeCompanyQuestion as Question,
	KnowledgeLocateTray
} from './company-locate-client';
import { CompanyLocateWatch } from './company-locate.svelte';

afterEach(() => {
	cleanup();
	localStorage.clear();
});

function option(key: string, city: string, state: string, about: string): CompanyOption {
	return {
		key,
		name: 'Summit Consulting',
		domain: key,
		place: canonicalPlace({ city, region: state, country: 'US' }),
		street: null,
		industry: null,
		size: null,
		founded: null,
		linkedin: null,
		description: about,
		sources: [{ source: 'wikidata', label: 'Wikidata', url: null }],
		agreed: false
	};
}

const question: Question = {
	id: 'q1',
	entity_id: 'org-1',
	name: 'Summit Consulting',
	options: [
		option('summitllc.com', 'Washington', 'DC', 'Federal program evaluation'),
		option('summitcg.com', 'Denver', 'CO', 'IT staffing')
	],
	options_total: 5,
	people: [{ id: 'p1', name: 'Jane Doe', title: 'Senior Analyst' }],
	checked_at: '2026-11-24T12:00:00Z'
};

function tray(over: Partial<KnowledgeLocateTray> = {}): KnowledgeLocateTray {
	return {
		run_id: 'run-1',
		status: 'completed',
		stats: {
			total: 626,
			done: 626,
			placed: 480,
			unconfirmed: 60,
			ask: 60,
			common: 6,
			none: 20,
			failed: 0,
			skipped: 0
		},
		started_at: '2026-11-24T12:00:00Z',
		finished_at: '2026-11-24T12:12:00Z',
		open_questions: 60,
		leftover: 26,
		web_search: false,
		...over
	};
}

function watchWith(state: KnowledgeLocateTray | null) {
	const api = {
		tray: vi.fn(async () => ({ locate: state })),
		questions: vi.fn(async () => ({ questions: [] })),
		start: vi.fn(async () => ({ run_id: 'run-2', queued: 3, reason: null })),
		stop: vi.fn(async () => ({ stopped: true })),
		answer: vi.fn(),
		searchRest: vi.fn(async () => ({ queued: 26, remaining: 0, refused: null }))
	};
	const watch = new CompanyLocateWatch({ api: api as never, isHidden: () => false });
	watch.tray = state;
	watch.loaded = true;
	return { watch, api };
}

describe('KnowledgeCompanyQuestion', () => {
	it('shows who the user knows there and each company with its town, website and sources', () => {
		render(KnowledgeCompanyQuestion, { question, onAnswer: vi.fn() });
		expect(screen.getByRole('heading', { name: 'Which Summit Consulting?' })).toBeTruthy();
		expect(screen.getByText('Jane Doe works here · Senior Analyst')).toBeTruthy();
		expect(screen.getByText('Washington, DC · summitllc.com')).toBeTruthy();
		expect(screen.getByText('Denver, CO · summitcg.com')).toBeTruthy();
		expect(screen.getByText('Federal program evaluation')).toBeTruthy();
		expect(screen.getAllByText('From Wikidata')).toHaveLength(2);
		expect(screen.getByText('Showing the 2 best known of 5 with this name.')).toBeTruthy();
		expect(
			screen
				.getByRole('link', { name: 'Open summitcg.com in a new tab' })
				.getAttribute('href')
		).toBe('https://summitcg.com');
	});

	it('answers with the company that was tapped', async () => {
		const onAnswer = vi.fn();
		render(KnowledgeCompanyQuestion, { question, onAnswer });
		await fireEvent.click(screen.getByRole('button', { name: /Denver, CO/ }));
		expect(onAnswer).toHaveBeenCalledExactlyOnceWith({ choice: 'option', key: 'summitcg.com' });
	});

	it('"None of these" and "Skip for now" are separate, and Skip only shows in the stack', async () => {
		const onAnswer = vi.fn();
		const onSkip = vi.fn();
		const view = render(KnowledgeCompanyQuestion, { question, onAnswer, onSkip });
		await fireEvent.click(screen.getByRole('button', { name: 'None of these' }));
		expect(onAnswer).toHaveBeenCalledExactlyOnceWith({ choice: 'none_of_these' });
		await fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }));
		expect(onSkip).toHaveBeenCalledOnce();
		expect(onAnswer).toHaveBeenCalledOnce();
		view.unmount();

		render(KnowledgeCompanyQuestion, { question, onAnswer, compact: true });
		expect(screen.queryByRole('button', { name: 'Skip for now' })).toBeNull();
		expect(screen.getByText('5 companies have this name. Which one?')).toBeTruthy();
	});
});

describe('KnowledgeLocateBanner', () => {
	it('offers to start when no lookup has ever run', async () => {
		const { watch, api } = watchWith(null);
		render(KnowledgeLocateBanner, { watch, onReview: vi.fn() });
		await fireEvent.click(
			screen.getByRole('button', { name: 'Find where your companies are' })
		);
		expect(api.start).toHaveBeenCalledExactlyOnceWith({ origin: 'manual' });
	});

	it('shows progress and Stop while it runs, with no web search', () => {
		const { watch } = watchWith(
			tray({
				status: 'running',
				finished_at: null,
				stats: { ...tray().stats, done: 212, placed: 170, unconfirmed: 10 },
				leftover: 0,
				web_search: true
			})
		);
		render(KnowledgeLocateBanner, { watch, onReview: vi.fn() });
		expect(screen.getByRole('status').textContent).toContain(
			'Finding where your companies are'
		);
		expect(screen.getByRole('status').textContent).toContain('212 of 626');
		expect(screen.getByRole('status').textContent).toContain('180 placed');
		expect(screen.getByRole('button', { name: 'Stop' })).toBeTruthy();
		expect(screen.queryByRole('button', { name: /Search the web/ })).toBeNull();
	});

	it('afterwards: placed, unconfirmed, not found, and the stack of questions', async () => {
		const onReview = vi.fn();
		const { watch } = watchWith(tray());
		render(KnowledgeLocateBanner, { watch, onReview });
		const line = screen.getByRole('status').textContent ?? '';
		expect(line).toContain('540 companies placed');
		expect(line).toContain('60 unconfirmed');
		expect(line).toContain('26 not found');
		await fireEvent.click(screen.getByRole('button', { name: '60 need a quick look' }));
		expect(onReview).toHaveBeenCalledOnce();
	});

	it('does not offer the paid web search where it is not turned on', () => {
		const { watch } = watchWith(tray({ web_search: false }));
		render(KnowledgeLocateBanner, { watch, onReview: vi.fn() });
		expect(screen.queryByRole('button', { name: /Search the web/ })).toBeNull();
	});

	it('offers the web search for what is left where it is turned on, and starts it on a click', async () => {
		const onSearchStarted = vi.fn();
		const { watch, api } = watchWith(tray({ web_search: true }));
		render(KnowledgeLocateBanner, { watch, onReview: vi.fn(), onSearchStarted });
		await fireEvent.click(
			screen.getByRole('button', { name: 'Search the web for the other 26' })
		);
		expect(api.searchRest).toHaveBeenCalledOnce();
		await vi.waitFor(() => expect(onSearchStarted).toHaveBeenCalledOnce());
	});

	it("names one click's worth when more is left than one click can search", () => {
		const { watch } = watchWith(tray({ web_search: true, leftover: 146 }));
		render(KnowledgeLocateBanner, { watch, onReview: vi.fn() });
		expect(screen.getByRole('button', { name: 'Search the web for 75 of them' })).toBeTruthy();
	});

	it('offers nothing to search when nothing is left', () => {
		const { watch } = watchWith(tray({ web_search: true, leftover: 0 }));
		render(KnowledgeLocateBanner, { watch, onReview: vi.fn() });
		expect(screen.queryByRole('button', { name: /Search the web/ })).toBeNull();
	});

	it('offers to continue a lookup that stopped part-way', () => {
		const { watch } = watchWith(
			tray({ status: 'cancelled', open_questions: 0, stats: { ...tray().stats, done: 200 } })
		);
		render(KnowledgeLocateBanner, { watch, onReview: vi.fn() });
		expect(screen.getByRole('status').textContent).toContain('stopped at 200 of 626');
		expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy();
	});

	it('can be put away once nothing is waiting, and stays away for that run', async () => {
		const { watch } = watchWith(tray({ open_questions: 0 }));
		const view = render(KnowledgeLocateBanner, { watch, onReview: vi.fn() });
		await fireEvent.click(screen.getByRole('button', { name: 'Put this away' }));
		expect(screen.queryByRole('status')).toBeNull();
		view.unmount();
		render(KnowledgeLocateBanner, { watch, onReview: vi.fn() });
		expect(screen.queryByRole('status')).toBeNull();
	});
});
