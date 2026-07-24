import { beforeEach, describe, expect, it, vi } from 'vitest';

const USER_ID = '10000000-0000-4000-8000-000000000001';
const OTHER_USER_ID = '10000000-0000-4000-8000-000000000002';
const RUN_ID = '20000000-0000-4000-8000-000000000001';
const SAMPLE_ID = '30000000-0000-4000-8000-000000000001';
const PROJECT_ID = '40000000-0000-4000-8000-000000000001';

const state = vi.hoisted(() => ({
	env: {
		GMAIL_RELEVANCE_PHASE_A_REVIEW_ENABLED: 'true',
		GMAIL_RELEVANCE_PHASE_A_REVIEW_USER_IDS: '10000000-0000-4000-8000-000000000001'
	} as Record<string, string | undefined>,
	service: {
		dashboard: vi.fn(),
		prepareSample: vi.fn(),
		openSample: vi.fn(),
		adjudicate: vi.fn()
	},
	factory: vi.fn()
}));

vi.mock('$env/dynamic/private', () => ({ env: state.env }));
vi.mock('$lib/server/gmail-relevance/review-evaluation', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/gmail-relevance/review-evaluation')>()),
	createEmailRelevanceReviewService: state.factory
}));

import { actions, config, load } from './+page.server';

function event(input: { userId?: string | null; form?: FormData; runId?: string | null } = {}) {
	const url = new URL('https://buildos.invalid/admin/gmail-relevance/review');
	if (input.runId) url.searchParams.set('run_id', input.runId);
	return {
		request: new Request(url, {
			method: 'POST',
			body: input.form ?? new FormData()
		}),
		url,
		setHeaders: vi.fn(),
		locals: {
			safeGetSession: vi.fn().mockResolvedValue({
				user:
					input.userId === null
						? null
						: { id: input.userId === undefined ? USER_ID : input.userId }
			})
		}
	};
}

function form(values: Record<string, string>): FormData {
	const result = new FormData();
	for (const [key, value] of Object.entries(values)) result.append(key, value);
	return result;
}

beforeEach(() => {
	state.env.GMAIL_RELEVANCE_PHASE_A_REVIEW_ENABLED = 'true';
	state.env.GMAIL_RELEVANCE_PHASE_A_REVIEW_USER_IDS = USER_ID;
	for (const method of Object.values(state.service)) method.mockReset();
	state.factory.mockReset().mockReturnValue(state.service);
	state.service.dashboard.mockResolvedValue({
		runs: [],
		selected_run_id: null,
		projects: [],
		queue: [],
		metrics: null,
		source_retention_expires_at: null
	});
	state.service.prepareSample.mockResolvedValue({ total_samples: 300, scope_count: 3 });
	state.service.openSample.mockResolvedValue({
		sample_id: SAMPLE_ID,
		idempotency_key: '50000000-0000-4000-8000-000000000001',
		account_label: 'Selected account',
		project_label: 'Synthetic Project',
		internal_date: '2026-07-24T12:00:00.000Z',
		mailbox_categories: { inbox: true, sent: false },
		subject: 'Synthetic subject',
		snippet: 'Synthetic snippet',
		participant_addresses: ['person@synthetic.invalid']
	});
	state.service.adjudicate.mockResolvedValue({
		adjudication_id: '60000000-0000-4000-8000-000000000001',
		replayed: false,
		variant_reveal: { stratum: 'none', a: null, b: null }
	});
});

describe('/admin/gmail-relevance/review', () => {
	it('reserves enough serverless time for one bounded metadata re-fetch', () => {
		expect(config).toEqual({ maxDuration: 60 });
	});

	it('rejects unauthenticated, disabled, and non-allowlisted requests before service-role work', async () => {
		await expect((load as never as Function)(event({ userId: null }))).rejects.toMatchObject({
			status: 303,
			location: '/auth/login'
		});
		state.env.GMAIL_RELEVANCE_PHASE_A_REVIEW_ENABLED = 'false';
		await expect((load as never as Function)(event())).rejects.toMatchObject({ status: 404 });
		state.env.GMAIL_RELEVANCE_PHASE_A_REVIEW_ENABLED = 'true';
		await expect(
			(load as never as Function)(event({ userId: OTHER_USER_ID }))
		).rejects.toMatchObject({
			status: 404
		});
		expect(state.factory).not.toHaveBeenCalled();
	});

	it('loads one owned dashboard with no-store response headers', async () => {
		const requestEvent = event({ runId: RUN_ID });
		await (load as never as Function)(requestEvent);
		expect(state.service.dashboard).toHaveBeenCalledWith(USER_ID, RUN_ID);
		expect(requestEvent.setHeaders).toHaveBeenCalledWith(
			expect.objectContaining({
				'cache-control': 'private, no-store, max-age=0',
				'referrer-policy': 'no-referrer'
			})
		);
	});

	it('prepares only the session-owned run and rejects extra fields', async () => {
		const accepted = await (actions.prepare as never as Function)(
			event({ form: form({ run_id: RUN_ID }) })
		);
		expect(accepted).toEqual({ kind: 'prepared', total_samples: 300, scope_count: 3 });
		expect(state.service.prepareSample).toHaveBeenCalledWith(USER_ID, RUN_ID);

		const rejected = await (actions.prepare as never as Function)(
			event({ form: form({ run_id: RUN_ID, user_id: OTHER_USER_ID }) })
		);
		expect(rejected).toMatchObject({
			status: 400,
			data: { kind: 'error', error_code: 'invalid_input' }
		});
		expect(state.service.prepareSample).toHaveBeenCalledTimes(1);
	});

	it('opens one sample without accepting a provider ID or variant field from the browser', async () => {
		const accepted = await (actions.open as never as Function)(
			event({ form: form({ run_id: RUN_ID, sample_id: SAMPLE_ID }) })
		);
		expect(state.service.openSample).toHaveBeenCalledWith({
			user_id: USER_ID,
			run_id: RUN_ID,
			sample_id: SAMPLE_ID
		});
		expect(accepted).toMatchObject({
			kind: 'opened',
			review_context: { sample_id: SAMPLE_ID, subject: 'Synthetic subject' }
		});

		const rejected = await (actions.open as never as Function)(
			event({
				form: form({
					run_id: RUN_ID,
					sample_id: SAMPLE_ID,
					provider_message_id: 'forbidden'
				})
			})
		);
		expect(rejected).toMatchObject({ status: 400 });
		expect(state.service.openSample).toHaveBeenCalledTimes(1);
	});

	it('derives reviewer identity from the session and forwards only bounded adjudication fields', async () => {
		await (actions.adjudicate as never as Function)(
			event({
				form: form({
					run_id: RUN_ID,
					sample_id: SAMPLE_ID,
					idempotency_key: '50000000-0000-4000-8000-000000000001',
					decision: 'relevant_missing_project',
					correction_reason: 'missing_profile_signal',
					corrected_project_id: PROJECT_ID,
					rule_proposal: ''
				})
			})
		);
		expect(state.service.adjudicate).toHaveBeenCalledWith({
			user_id: USER_ID,
			run_id: RUN_ID,
			sample_id: SAMPLE_ID,
			idempotency_key: '50000000-0000-4000-8000-000000000001',
			decision: 'relevant_missing_project',
			correction_reason: 'missing_profile_signal',
			corrected_project_id: PROJECT_ID,
			rule_proposal: null
		});
	});

	it('maps unknown failures to one fixed response code', async () => {
		state.service.openSample.mockRejectedValue({
			code: 'raw_provider_diagnostic',
			message: 'restricted upstream detail'
		});
		const result = await (actions.open as never as Function)(
			event({ form: form({ run_id: RUN_ID, sample_id: SAMPLE_ID }) })
		);
		expect(result).toMatchObject({
			status: 500,
			data: { kind: 'error', error_code: 'storage_unavailable' }
		});
		expect(JSON.stringify(result)).not.toContain('restricted upstream detail');
	});
});
