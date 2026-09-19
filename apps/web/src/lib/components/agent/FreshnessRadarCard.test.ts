// apps/web/src/lib/components/agent/FreshnessRadarCard.test.ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import type { FreshnessScanStatusV1 } from '@buildos/shared-types';
import FreshnessRadarCard from './FreshnessRadarCard.svelte';
import { freshnessCardFixture } from './freshness-radar-card.fixture';

const mutationMocks = vi.hoisted(() => ({ notifyDataMutation: vi.fn() }));
vi.mock('$lib/stores/projectDataMutations', () => ({
	notifyDataMutation: mutationMocks.notifyDataMutation
}));

function apiResponse(data: unknown, status = 200): Response {
	return new Response(
		JSON.stringify(
			status < 400 ? { success: true, data } : { success: false, error: String(data) }
		),
		{ status, headers: { 'Content-Type': 'application/json' } }
	);
}

function statusFixture(overrides: Partial<FreshnessScanStatusV1> = {}): FreshnessScanStatusV1 {
	return {
		version: 'freshness_scan_status_v1',
		scanId: 'scan-1',
		flags: {
			'flag-task': { status: 'open', disposition: 'drafted', undoable: false },
			'flag-milestone': { status: 'open', disposition: 'drafted', undoable: false },
			'flag-doc': { status: 'open', disposition: 'surfaced', undoable: false },
			'flag-auto': { status: 'applied', disposition: 'auto_applied', undoable: true },
			'flag-retired': { status: 'open', disposition: 'retired', undoable: true }
		},
		bundle: { suggestionId: 'bundle-1', status: 'pending' },
		...overrides
	};
}

/** Routes each request by URL; `post` answers the card's actions in order. */
function makeFetch(status: FreshnessScanStatusV1 | null, post: Response[] = []) {
	return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input);
		if (!init?.method || init.method === 'GET') {
			return status ? apiResponse(status) : apiResponse('not found', 404);
		}
		const next = post.shift();
		if (!next) throw new Error(`unexpected POST ${url}`);
		return next;
	});
}

function bundleState(): string | null {
	return document.querySelector('[data-bundle-state]')?.getAttribute('data-bundle-state') ?? null;
}

afterEach(() => {
	vi.useRealTimers();
	mutationMocks.notifyDataMutation.mockReset();
});

describe('FreshnessRadarCard', () => {
	it('shows the headline, up to three items with percentages, and the model-estimate hint', async () => {
		const fetchFn = makeFetch(statusFixture());
		render(FreshnessRadarCard, { card: freshnessCardFixture(), fetchFn });

		const card = screen.getByRole('region', { name: '3 things may be out of date' });
		expect(within(card).getByText('Launch')).toBeInTheDocument();
		expect(within(card).getByText('Model estimate')).toBeInTheDocument();
		const items = within(card).getAllByRole('listitem').slice(0, 3);
		expect(items).toHaveLength(3);
		expect(
			within(card).getByLabelText('93% likely out of date, model estimate')
		).toHaveTextContent('93%');
		expect(within(card).getByText('Mark done')).toBeInTheDocument();
		expect(within(card).getByText('Due Oct 3 (was Sep 26)')).toBeInTheDocument();
		expect(within(card).getByText('“we dropped the webinar”')).toBeInTheDocument();
		expect(within(card).getByRole('link', { name: /Send investor deck/ })).toHaveAttribute(
			'href',
			'/projects/project-1?entity=task&entity_id=task-1'
		);
		expect(within(card).getByText('+2 more on the project')).toBeInTheDocument();
		await waitFor(() =>
			expect(fetchFn).toHaveBeenCalledWith(
				'/api/onto/projects/project-1/freshness/scans/scan-1',
				expect.anything()
			)
		);
	});

	it('never renders more than three items', () => {
		const base = freshnessCardFixture();
		const fourth = {
			...base.items[2]!,
			flagId: 'flag-4',
			entity: { ...base.items[2]!.entity, id: 'doc-4', title: 'Fourth' }
		};
		render(FreshnessRadarCard, {
			card: { ...base, items: [...base.items, fourth] },
			fetchFn: makeFetch(null)
		});
		expect(screen.queryByText('Fourth')).toBeNull();
	});

	it('offers Draft in chat only for items without a proposal and pre-fills through the handler', async () => {
		const onDraftInChat = vi.fn();
		render(FreshnessRadarCard, {
			card: freshnessCardFixture(),
			onDraftInChat,
			fetchFn: makeFetch(statusFixture())
		});
		const drafts = screen.getAllByRole('button', { name: /Draft an update/ });
		expect(drafts).toHaveLength(1);
		await fireEvent.click(drafts[0]!);
		expect(onDraftInChat).toHaveBeenCalledWith(
			'Update "Launch plan" to reflect what I just said.'
		);
	});

	it('hides Draft in chat when no composer handler is wired', () => {
		render(FreshnessRadarCard, { card: freshnessCardFixture(), fetchFn: makeFetch(null) });
		expect(screen.queryByRole('button', { name: /Draft an update/ })).toBeNull();
	});

	it('approves the bundle in one tap and marks drafted items updated', async () => {
		const fetchFn = makeFetch(statusFixture(), [
			apiResponse({
				suggestion: { id: 'bundle-1', status: 'applied' },
				result: { ok: true, applied_operations: 2 }
			})
		]);
		render(FreshnessRadarCard, { card: freshnessCardFixture(), fetchFn });

		const update = screen.getByRole('button', { name: 'Update these 2 items' });
		expect(update).toHaveTextContent('Update these');
		await fireEvent.click(update);

		await waitFor(() => expect(bundleState()).toBe('applied'));
		expect(screen.queryByRole('button', { name: /Update these/ })).toBeNull();
		const postCall = fetchFn.mock.calls.find(([, init]) => init?.method === 'POST')!;
		expect(postCall[0]).toBe('/api/onto/projects/project-1/suggestions/bundle-1');
		expect(screen.getAllByText('Updated').length).toBeGreaterThanOrEqual(2);
		expect(mutationMocks.notifyDataMutation).toHaveBeenCalledWith(
			expect.objectContaining({ affectedProjectIds: ['project-1'] })
		);
	});

	it('explains a refused approval without claiming anything changed', async () => {
		const fetchFn = makeFetch(statusFixture(), [apiResponse('stale', 409)]);
		render(FreshnessRadarCard, { card: freshnessCardFixture(), fetchFn });
		await fireEvent.click(screen.getByRole('button', { name: 'Update these 2 items' }));
		expect(await screen.findByRole('alert')).toHaveTextContent(
			'Things changed since this check. Nothing was updated.'
		);
		expect(mutationMocks.notifyDataMutation).not.toHaveBeenCalled();
	});

	it('shows a superseded bundle as replaced and offers no approval', async () => {
		render(FreshnessRadarCard, {
			card: freshnessCardFixture(),
			fetchFn: makeFetch(
				statusFixture({
					bundle: { suggestionId: 'bundle-1', status: 'superseded' },
					flags: {
						...statusFixture().flags,
						'flag-task': {
							status: 'superseded',
							disposition: 'drafted',
							undoable: false
						}
					}
				})
			)
		});
		await waitFor(() =>
			expect(screen.getAllByText('Replaced by a newer check').length).toBeGreaterThanOrEqual(
				2
			)
		);
		expect(screen.queryByRole('button', { name: /Update these/ })).toBeNull();
		expect(
			screen.queryByRole('button', { name: 'Send investor deck is not out of date' })
		).toBeNull();
	});

	it('disables every action while one is in flight', async () => {
		let resolvePost: (value: Response) => void = () => {};
		const fetchFn = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
			if (!init?.method) return apiResponse(statusFixture());
			return new Promise<Response>((resolve) => {
				resolvePost = resolve;
			});
		});
		render(FreshnessRadarCard, { card: freshnessCardFixture(), fetchFn });
		await fireEvent.click(screen.getByRole('button', { name: 'Update these 2 items' }));
		for (const button of screen.getAllByRole('button', { name: /not out of date|Undo/ })) {
			expect(button).toBeDisabled();
		}
		resolvePost(apiResponse({ suggestion: { status: 'applied' }, result: { ok: true } }));
		await waitFor(() => expect(bundleState()).toBe('applied'));
	});

	it('marks one item not out of date and follows the rebuilt bundle', async () => {
		const fetchFn = makeFetch(statusFixture(), [
			apiResponse({ flag: { status: 'dismissed' }, suggestionId: 'bundle-2' }),
			apiResponse({ suggestion: { status: 'applied' }, result: { ok: true } })
		]);
		render(FreshnessRadarCard, { card: freshnessCardFixture(), fetchFn });
		await fireEvent.click(
			screen.getByRole('button', { name: 'Send investor deck is not out of date' })
		);
		await waitFor(() => expect(screen.getByText('Marked current')).toBeInTheDocument());
		const update = screen.getByRole('button', { name: 'Update these 1 item' });
		await fireEvent.click(update);
		await waitFor(() => expect(bundleState()).toBe('applied'));
		const posts = fetchFn.mock.calls.filter(([, init]) => init?.method === 'POST');
		expect(posts[0]![0]).toBe('/api/onto/projects/project-1/freshness/flags/flag-task');
		expect(posts[1]![0]).toBe('/api/onto/projects/project-1/suggestions/bundle-2');
	});

	it('undoes the automatic updates and reports what happened', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-09-18T16:00:00.000Z'));
		const fetchFn = makeFetch(statusFixture(), [
			apiResponse({ version: 'freshness_undo_v1', undone: ['flag-auto'], skipped: [] })
		]);
		render(FreshnessRadarCard, { card: freshnessCardFixture(), fetchFn });
		expect(screen.getByText('Auto-updated 1')).toBeInTheDocument();
		expect(screen.getByText('Marked in progress', { exact: false })).toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: 'Undo 1 automatic update' }));
		await waitFor(() => expect(screen.getByText('· Undid 1 auto-update')).toBeInTheDocument());
		expect(screen.queryByRole('button', { name: 'Undo 1 automatic update' })).toBeNull();
		const post = fetchFn.mock.calls.find(([, init]) => init?.method === 'POST')!;
		expect(post[0]).toBe('/api/onto/projects/project-1/freshness/scans/scan-1/undo');
		expect(JSON.parse(String(post[1]!.body))).toEqual({ flag_ids: ['flag-auto'] });
		expect(mutationMocks.notifyDataMutation).toHaveBeenCalled();
	});

	it('drops Undo once the 72-hour window has passed', () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-09-22T16:00:00.000Z'));
		render(FreshnessRadarCard, { card: freshnessCardFixture(), fetchFn: makeFetch(null) });
		expect(screen.getByText('Auto-updated 1')).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: /Undo/ })).toBeNull();
		expect(screen.queryByRole('button', { name: /Restore/ })).toBeNull();
	});

	it('shows inbox cleanup with restore, the possibly-stale count, and gauge changes', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-09-18T16:00:00.000Z'));
		const fetchFn = makeFetch(statusFixture(), [
			apiResponse({ version: 'freshness_undo_v1', undone: ['flag-retired'], skipped: [] })
		]);
		render(FreshnessRadarCard, { card: freshnessCardFixture(), fetchFn });
		expect(screen.getByText('Retired 1 stale inbox item')).toBeInTheDocument();
		expect(screen.getByText('2 inbox items possibly stale')).toBeInTheDocument();
		expect(
			screen.getByRole('img', { name: 'Pricing page live: at risk (model estimate)' })
		).toBeInTheDocument();
		expect(screen.getByText('was on track')).toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: 'Restore 1 retired inbox item' }));
		await waitFor(() => expect(screen.getByText('· Undid 1 inbox item')).toBeInTheDocument());
		const post = fetchFn.mock.calls.find(([, init]) => init?.method === 'POST')!;
		expect(JSON.parse(String(post[1]!.body))).toEqual({ flag_ids: ['flag-retired'] });
	});

	it('renders a card with nothing to approve as a quiet summary', () => {
		render(FreshnessRadarCard, {
			card: freshnessCardFixture({
				headline: 'Auto-updated 1 task',
				items: [],
				bundle: null,
				moreCount: 0,
				inboxCleanup: { retired: [], possiblyStaleCount: 0 },
				gaugeChanges: []
			}),
			fetchFn: makeFetch(null)
		});
		expect(screen.getByRole('region', { name: 'Auto-updated 1 task' })).toBeInTheDocument();
		expect(screen.queryByText('Model estimate')).toBeNull();
		expect(screen.queryByRole('button', { name: /Update these/ })).toBeNull();
	});
});

describe('Review deeper', () => {
	it('prepares a review through its host without approving any changes', async () => {
		const card = freshnessCardFixture();
		const onReviewDeeper = vi.fn();
		const fetchFn = makeFetch(statusFixture());
		render(FreshnessRadarCard, { props: { card, onReviewDeeper, fetchFn } });
		await fireEvent.click(screen.getByRole('button', { name: 'Review deeper' }));
		expect(onReviewDeeper).toHaveBeenCalledWith(card);
		expect(fetchFn.mock.calls.every(([, init]) => !init?.method || init.method === 'GET')).toBe(
			true
		);
	});
});
