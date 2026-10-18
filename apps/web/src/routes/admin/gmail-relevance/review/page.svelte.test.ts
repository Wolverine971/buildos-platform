// apps/web/src/routes/admin/gmail-relevance/review/page.svelte.test.ts
// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PageData } from './$types';

const app = vi.hoisted(() => ({
	invalidateAll: vi.fn(),
	deserialize: vi.fn()
}));
vi.mock('$app/navigation', () => ({ invalidateAll: app.invalidateAll }));
vi.mock('$app/forms', () => ({
	enhance: () => ({ destroy() {} }),
	deserialize: app.deserialize
}));

import ReviewPage from './+page.svelte';

const RUN_ID = '20000000-0000-4000-8000-000000000001';
const SAMPLE_ID = '30000000-0000-4000-8000-000000000001';
const PROJECT_ID = '40000000-0000-4000-8000-000000000001';

type QueueState = 'pending' | 'reviewed' | 'expired';

function queueItem(
	index: number,
	state: QueueState,
	decision: string | null = state === 'reviewed' ? 'correct_project' : null,
	projectLabel = 'Synthetic Project'
) {
	return {
		id: index === 1 ? SAMPLE_ID : `30000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
		account_label: 'Account 1',
		project_label: projectLabel,
		sample_order: index,
		quick_review_order: index,
		state,
		decision
	};
}

const SCOPE_ID = '70000000-0000-4000-8000-000000000001';

function progress(state: string, scopeState: string, processed: number) {
	return {
		run_id: RUN_ID,
		state,
		terminal_reason_code: null,
		created_at: '2026-08-30T12:00:00.000Z',
		expires_at: '2026-08-31T12:00:00.000Z',
		scopes: [
			{
				id: SCOPE_ID,
				account_label: 'person@synthetic.invalid',
				state: scopeState,
				terminal_reason_code: null,
				message_cap: 1000,
				observations_discovered: processed,
				observations_processed: processed
			}
		]
	};
}

function scanSection(overrides: Record<string, unknown> = {}) {
	return {
		enabled: true,
		unavailable: false,
		start_key: '80000000-0000-4000-8000-000000000001',
		max_projects: 25,
		accounts: [
			{ id: '90000000-0000-4000-8000-000000000001', label: 'person@synthetic.invalid' }
		],
		projects: [{ id: PROJECT_ID, name: 'Synthetic Project' }],
		latest_run: null,
		...overrides
	};
}

function emptyPageData(scan = scanSection()): PageData {
	return {
		runs: [],
		selected_run_id: null,
		projects: [],
		queue: [],
		metrics: null,
		source_retention_expires_at: null,
		scan
	} as unknown as PageData;
}

beforeEach(() => {
	app.invalidateAll.mockReset().mockResolvedValue(undefined);
	app.deserialize.mockReset();
});

function pageData(queue: ReturnType<typeof queueItem>[]): PageData {
	return {
		scan: scanSection(),
		runs: [
			{
				id: RUN_ID,
				label: 'Run 1',
				state: 'completed',
				created_at: '2026-08-30T12:00:00.000Z',
				expires_at: '2026-09-06T12:00:00.000Z'
			}
		],
		selected_run_id: RUN_ID,
		projects: [{ id: PROJECT_ID, label: 'Synthetic Project', profile_version: 1 }],
		queue,
		metrics: null,
		source_retention_expires_at: '2026-09-06T12:00:00.000Z'
	} as unknown as PageData;
}

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe('email relevance scan step', () => {
	it('offers a scan of every connected account against the most recent projects', () => {
		render(ReviewPage, { props: { data: emptyPageData() } });
		const button = screen.getByRole('button', { name: 'Scan last 30 days' });
		expect(button.closest('form')).toHaveAttribute('action', '?/startScan');
		expect(screen.getByText('person@synthetic.invalid')).toBeInTheDocument();
		expect(screen.getByRole('checkbox', { name: 'Synthetic Project' })).toBeChecked();
		expect(
			screen.queryByRole('button', { name: 'Prepare suggestions' })
		).not.toBeInTheDocument();
	});

	it('sends people to Profile → Email when no Gmail account is ready', () => {
		render(ReviewPage, { props: { data: emptyPageData(scanSection({ accounts: [] })) } });
		expect(screen.getByRole('link', { name: /Connect or reconnect Gmail/ })).toHaveAttribute(
			'href',
			'/profile?tab=email'
		);
		expect(screen.queryByRole('button', { name: 'Scan last 30 days' })).not.toBeInTheDocument();
	});

	it('says plainly when scanning is switched off', () => {
		render(ReviewPage, { props: { data: emptyPageData(scanSection({ enabled: false })) } });
		expect(screen.getByText(/Scanning is switched off on this server/)).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Scan last 30 days' })).not.toBeInTheDocument();
	});

	it('resumes an unfinished scan one step at a time, then reloads when every account is done', async () => {
		const fetchMock = vi.fn().mockResolvedValue({ text: async () => 'serialized' });
		vi.stubGlobal('fetch', fetchMock);
		app.deserialize.mockReturnValue({
			type: 'success',
			status: 200,
			data: {
				kind: 'scan_step',
				status: 'committed',
				step_error_code: null,
				progress: progress('completed', 'completed', 640)
			}
		});

		render(ReviewPage, {
			props: {
				data: emptyPageData(
					scanSection({ latest_run: progress('running', 'pending', 200) })
				)
			}
		});

		await waitFor(() => expect(app.invalidateAll).toHaveBeenCalledTimes(1));
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0]!;
		expect(url).toBe('?/scanStep');
		expect([...(init.body as FormData).entries()]).toEqual([
			['run_id', RUN_ID],
			['connection_scope_id', SCOPE_ID]
		]);
	});

	it('stops and explains when a step fails, offering to continue', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ text: async () => 'serialized' }));
		app.deserialize.mockReturnValue({
			type: 'failure',
			status: 404,
			data: { kind: 'error', error_code: 'connection_unavailable' }
		});

		render(ReviewPage, {
			props: {
				data: emptyPageData(
					scanSection({ latest_run: progress('running', 'pending', 200) })
				)
			}
		});

		expect(
			await screen.findByText('Gmail needs to be reconnected before it can be scanned.')
		).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Continue scan' })).toBeInTheDocument();
		expect(screen.getByText('200 emails read')).toBeInTheDocument();
		expect(app.invalidateAll).not.toHaveBeenCalled();
	});
});

describe('email relevance scorecard', () => {
	it('tallies answers overall and by project', () => {
		render(ReviewPage, {
			props: {
				data: pageData([
					queueItem(1, 'reviewed', 'correct_project', 'Cadre'),
					queueItem(2, 'reviewed', 'not_project_relevant', 'Cadre'),
					queueItem(3, 'reviewed', 'correct_project', '9takes'),
					queueItem(4, 'pending')
				])
			}
		});
		expect(screen.getByRole('heading', { name: 'Results so far' })).toBeInTheDocument();
		expect(screen.getByText('Right 2 of 3')).toBeInTheDocument();
		expect(screen.getByText('1 / 2 right')).toBeInTheDocument();
		expect(screen.getByText('1 / 1 right')).toBeInTheDocument();
	});
});

describe('email relevance review page state', () => {
	it('keeps the selected scan in every action URL', () => {
		render(ReviewPage, { props: { data: pageData([]) } });
		expect(
			screen.getByRole('button', { name: 'Prepare suggestions' }).closest('form')
		).toHaveAttribute('action', `?/prepare&run_id=${RUN_ID}`);

		cleanup();
		render(ReviewPage, { props: { data: pageData([queueItem(1, 'pending')]) } });
		expect(
			screen.getByRole('button', { name: 'Show email and choices' }).closest('form')
		).toHaveAttribute('action', `?/open&run_id=${RUN_ID}`);

		cleanup();
		render(ReviewPage, {
			props: {
				data: pageData([queueItem(1, 'pending')]),
				form: {
					kind: 'opened',
					review_context: {
						sample_id: SAMPLE_ID,
						project_id: PROJECT_ID,
						idempotency_key: '50000000-0000-4000-8000-000000000001',
						account_label: 'Account 1',
						project_label: 'Synthetic Project',
						internal_date: '2026-08-30T12:00:00.000Z',
						mailbox_categories: { inbox: false, sent: false },
						subject: 'Synthetic subject',
						snippet: 'Synthetic snippet',
						participant_addresses: ['person@synthetic.invalid']
					}
				}
			}
		});
		for (const buttonName of ['Yes, related', 'No, unrelated', 'Not sure']) {
			expect(
				screen.getByRole('button', { name: buttonName }).closest('form')
			).toHaveAttribute('action', `?/adjudicate&run_id=${RUN_ID}`);
		}
		expect(screen.getByText(/· Other$/)).toBeInTheDocument();
		expect(
			screen.getByText('No other projects were included in this scan.')
		).toBeInTheDocument();
		expect(screen.queryByText('It belongs to a different project')).not.toBeInTheDocument();
	});

	it('finishes cleanly when fewer than twenty suggestions were available', () => {
		render(ReviewPage, {
			props: {
				data: pageData([queueItem(1, 'reviewed'), queueItem(2, 'reviewed')])
			}
		});

		expect(screen.getByRole('heading', { name: '2 suggestions reviewed' })).toBeInTheDocument();
		expect(screen.queryByText('Twenty suggestions reviewed')).not.toBeInTheDocument();
	});

	it('does not promise another suggestion after the final answer is saved', () => {
		render(ReviewPage, {
			props: {
				data: pageData([queueItem(1, 'reviewed')]),
				form: {
					kind: 'adjudicated',
					adjudication_id: '60000000-0000-4000-8000-000000000001',
					replayed: false,
					variant_reveal: { stratum: 'a_only', a: null, b: null }
				}
			}
		});

		expect(screen.getByText('The review is complete.')).toBeInTheDocument();
		expect(screen.queryByText('The next suggestion is ready below.')).not.toBeInTheDocument();
	});

	it('explains a terminal queue that contains expired suggestions', () => {
		render(ReviewPage, {
			props: {
				data: pageData([queueItem(1, 'reviewed'), queueItem(2, 'expired')])
			}
		});

		expect(screen.getByRole('heading', { name: 'Review window finished' })).toBeInTheDocument();
		expect(
			screen.getByText(/1 answer saved; 1 suggestion expired before review/)
		).toBeInTheDocument();
		expect(
			screen.queryByRole('button', { name: 'Show email and choices' })
		).not.toBeInTheDocument();
	});
});
