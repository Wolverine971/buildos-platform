// apps/web/src/routes/admin/gmail-relevance/review/page.svelte.test.ts
// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import type { PageData } from './$types';
import ReviewPage from './+page.svelte';

const RUN_ID = '20000000-0000-4000-8000-000000000001';
const SAMPLE_ID = '30000000-0000-4000-8000-000000000001';
const PROJECT_ID = '40000000-0000-4000-8000-000000000001';

type QueueState = 'pending' | 'reviewed' | 'expired';

function queueItem(index: number, state: QueueState) {
	return {
		id: index === 1 ? SAMPLE_ID : `30000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
		account_label: 'Account 1',
		project_label: 'Synthetic Project',
		sample_order: index,
		quick_review_order: index,
		state
	};
}

function pageData(queue: ReturnType<typeof queueItem>[]): PageData {
	return {
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

afterEach(cleanup);

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
