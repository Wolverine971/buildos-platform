// apps/web/src/lib/components/agent/DuplicateCheckStrip.test.ts
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import DuplicateCheckStrip from './DuplicateCheckStrip.svelte';
import {
	DUPLICATE_CHECK_FAST_POLLS,
	DUPLICATE_CHECK_MAX_POLLS,
	DUPLICATE_CHECK_POLL_MS,
	DUPLICATE_CHECK_SLOW_POLL_MS
} from './duplicate-check-strip';
import { CHAT_REVIEW_PANEL_KEY, type ChatReviewPanel } from './chat-review-panel';

/** Fake time for every poll up to and including poll number `polls`. */
function pollTime(polls: number): number {
	const fast = Math.min(polls, DUPLICATE_CHECK_FAST_POLLS);
	return (
		fast * DUPLICATE_CHECK_POLL_MS + Math.max(0, polls - fast) * DUPLICATE_CHECK_SLOW_POLL_MS
	);
}
import { DEST, RUN, SOURCE, fixtureId, jsonResponse } from './proposal-cards.fixture';

const DOC_A = fixtureId(30);
const DOC_B = fixtureId(31);

function runView(status: string) {
	return {
		success: true,
		data: {
			run: {
				id: RUN,
				root_project_id: DEST,
				project_ids: [DEST, SOURCE],
				status,
				mode: 'check',
				progress: {},
				cost_usd: 0.01,
				error: null,
				plan:
					status === 'checked'
						? {
								projects: {
									[DEST]: { name: 'DJ Internal' },
									[SOURCE]: { name: 'Content Ops' }
								},
								documents: {
									[DOC_A]: { title: 'Rate card', project_id: DEST },
									[DOC_B]: { title: 'Rate card (copy)', project_id: SOURCE }
								},
								tasks: {},
								clusters: [
									{
										key: 'twins:1',
										kind: 'twins',
										title: 'Rate card',
										reason: 'Same text',
										document_ids: [DOC_A, DOC_B]
									}
								]
							}
						: null
			}
		}
	};
}

let visibility: DocumentVisibilityState = 'visible';

async function settle() {
	await vi.advanceTimersByTimeAsync(0);
	await tick();
}

beforeEach(() => {
	vi.useFakeTimers();
	visibility = 'visible';
	Object.defineProperty(document, 'visibilityState', {
		configurable: true,
		get: () => visibility
	});
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe('DuplicateCheckStrip', () => {
	it('checks at once, polls every 3 s, then shows the headline, top groups and the review link', async () => {
		const fetchMock = vi
			.fn()
			.mockImplementationOnce(async () => jsonResponse(200, runView('surveying')))
			.mockImplementationOnce(async () => jsonResponse(200, runView('checked')));
		vi.stubGlobal('fetch', fetchMock);
		render(DuplicateCheckStrip, { check: { run_id: RUN, root_project_id: DEST } });
		await settle();
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/consolidation/runs/${RUN}`);
		expect(screen.getByText(/Checking for duplicates…/)).toBeTruthy();

		await vi.advanceTimersByTimeAsync(DUPLICATE_CHECK_POLL_MS);
		await tick();
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(
			screen.getByText('Found 2 identical docs across DJ Internal and Content Ops.')
		).toBeTruthy();
		expect(screen.getByRole('list', { name: 'Top duplicate groups' }).textContent).toContain(
			'Rate card'
		);
		// Outside the chat modal there is no panel, so the review is a link.
		expect(screen.getByRole('link', { name: /Review duplicates/ }).getAttribute('href')).toBe(
			`/projects/${DEST}/consolidate/${RUN}`
		);

		// Done: no more polling.
		await vi.advanceTimersByTimeAsync(DUPLICATE_CHECK_POLL_MS * 3);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('stays quiet when the check cannot be read', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
				jsonResponse(404, { success: false, error: 'Consolidation not found.' })
			)
		);
		render(DuplicateCheckStrip, { check: { run_id: RUN, root_project_id: DEST } });
		await settle();
		expect(screen.getByText('Couldn’t check for duplicates.')).toBeTruthy();
		expect(screen.queryByRole('link')).toBeNull();
	});

	it('keeps polling past two minutes and shows a slow check when it finishes', async () => {
		// Measured 2026-10-17: a check over two busy projects took 2.5–3.5 minutes,
		// and the old 2-minute cap left the card on "Still checking" for good.
		const slowPolls = DUPLICATE_CHECK_FAST_POLLS + 12; // ≈ 3 minutes in
		let calls = 0;
		const fetchMock = vi.fn(async () =>
			jsonResponse(200, runView(++calls < slowPolls ? 'surveying' : 'checked'))
		);
		vi.stubGlobal('fetch', fetchMock);
		render(DuplicateCheckStrip, { check: { run_id: RUN, root_project_id: DEST } });
		await settle();
		await vi.advanceTimersByTimeAsync(pollTime(slowPolls));
		await tick();
		expect(fetchMock).toHaveBeenCalledTimes(slowPolls);
		expect(
			screen.getByText('Found 2 identical docs across DJ Internal and Content Ops.')
		).toBeTruthy();
	});

	it(`gives up after ${DUPLICATE_CHECK_MAX_POLLS} polls and offers the run instead`, async () => {
		const fetchMock = vi.fn(async () => jsonResponse(200, runView('surveying')));
		vi.stubGlobal('fetch', fetchMock);
		render(DuplicateCheckStrip, { check: { run_id: RUN, root_project_id: DEST } });
		await settle();
		await vi.advanceTimersByTimeAsync(pollTime(DUPLICATE_CHECK_MAX_POLLS + 5));
		await tick();
		expect(fetchMock).toHaveBeenCalledTimes(DUPLICATE_CHECK_MAX_POLLS);
		expect(screen.getByText(/Still checking for duplicates\./)).toBeTruthy();
		expect(screen.getByRole('link', { name: 'See progress' }).getAttribute('href')).toBe(
			`/projects/${DEST}/consolidate/${RUN}`
		);
	});

	it('opens the review in the chat panel instead of navigating when the modal provides one', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => jsonResponse(200, runView('checked')))
		);
		const open = vi.fn<ChatReviewPanel['open']>();
		render(DuplicateCheckStrip, {
			props: { check: { run_id: RUN, root_project_id: DEST } },
			context: new Map([[CHAT_REVIEW_PANEL_KEY, { open }]])
		});
		await settle();
		expect(screen.queryByRole('link')).toBeNull();
		screen.getByRole('button', { name: /Review duplicates/ }).click();
		expect(open).toHaveBeenCalledWith(RUN);
	});

	it('pauses while the tab is hidden and resumes when it is shown', async () => {
		const fetchMock = vi.fn(async () => jsonResponse(200, runView('surveying')));
		vi.stubGlobal('fetch', fetchMock);
		render(DuplicateCheckStrip, { check: { run_id: RUN, root_project_id: DEST } });
		await settle();
		expect(fetchMock).toHaveBeenCalledTimes(1);

		visibility = 'hidden';
		await vi.advanceTimersByTimeAsync(DUPLICATE_CHECK_POLL_MS * 5);
		// The timer that was already set fires once and finds the tab hidden.
		expect(fetchMock).toHaveBeenCalledTimes(1);

		visibility = 'visible';
		document.dispatchEvent(new Event('visibilitychange'));
		await settle();
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('stops polling when it unmounts', async () => {
		const fetchMock = vi.fn(async () => jsonResponse(200, runView('surveying')));
		vi.stubGlobal('fetch', fetchMock);
		const { unmount } = render(DuplicateCheckStrip, {
			check: { run_id: RUN, root_project_id: DEST }
		});
		await settle();
		unmount();
		await vi.advanceTimersByTimeAsync(DUPLICATE_CHECK_POLL_MS * 5);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});
