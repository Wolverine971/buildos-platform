// apps/web/src/routes/admin/gmail-relevance/review/page.server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const USER_ID = '10000000-0000-4000-8000-000000000001';
const OTHER_USER_ID = '10000000-0000-4000-8000-000000000002';
const RUN_ID = '20000000-0000-4000-8000-000000000001';
const SAMPLE_ID = '30000000-0000-4000-8000-000000000001';
const PROJECT_ID = '40000000-0000-4000-8000-000000000001';
const SCOPE_ID = '70000000-0000-4000-8000-000000000001';
const START_KEY = '80000000-0000-4000-8000-000000000001';
const PROGRESS = {
	run_id: RUN_ID,
	state: 'running',
	terminal_reason_code: null,
	created_at: '2026-08-30T12:00:00.000Z',
	expires_at: '2026-08-31T12:00:00.000Z',
	scopes: [
		{
			id: SCOPE_ID,
			account_label: 'person@synthetic.invalid',
			state: 'pending',
			terminal_reason_code: null,
			message_cap: 1000,
			observations_discovered: 100,
			observations_processed: 50
		}
	]
};

const state = vi.hoisted(() => ({
	env: {
		GMAIL_RELEVANCE_PHASE_A_REVIEW_ENABLED: 'true',
		GMAIL_RELEVANCE_PHASE_A_REVIEW_USER_IDS: '10000000-0000-4000-8000-000000000001',
		GMAIL_RELEVANCE_PHASE_A_ENABLED: 'true',
		GMAIL_RELEVANCE_PHASE_A_USER_IDS: '10000000-0000-4000-8000-000000000001'
	} as Record<string, string | undefined>,
	pilot: {
		scanSetup: vi.fn(),
		startScan: vi.fn(),
		scanProgress: vi.fn(),
		runOneOperation: vi.fn(),
		controlRun: vi.fn()
	},
	pilotFactory: vi.fn(),
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

vi.mock('$lib/server/gmail-relevance/manual-pilot', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/gmail-relevance/manual-pilot')>()),
	createGmailRelevancePilotService: state.pilotFactory
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
	state.env.GMAIL_RELEVANCE_PHASE_A_ENABLED = 'true';
	state.env.GMAIL_RELEVANCE_PHASE_A_USER_IDS = USER_ID;
	for (const method of Object.values(state.service)) method.mockReset();
	for (const method of Object.values(state.pilot)) method.mockReset();
	state.factory.mockReset().mockReturnValue(state.service);
	state.pilotFactory.mockReset().mockReturnValue(state.pilot);
	state.pilot.scanSetup.mockResolvedValue({
		accounts: [
			{ id: '90000000-0000-4000-8000-000000000001', label: 'person@synthetic.invalid' }
		],
		projects: [{ id: PROJECT_ID, name: 'Synthetic Project' }],
		latest_run: null
	});
	state.pilot.startScan.mockResolvedValue({
		run_id: RUN_ID,
		created: true,
		connection_scope_ids: [SCOPE_ID]
	});
	state.pilot.scanProgress.mockResolvedValue(PROGRESS);
	state.pilot.runOneOperation.mockResolvedValue({
		status: 'committed',
		operation_code: 'list_page',
		checkpoint_version: 2,
		scope_state: 'pending',
		error_code: null,
		provider_calls_started: 1,
		observation_count: 100,
		candidate_count: 0
	});
	state.pilot.controlRun.mockResolvedValue('cancelled');
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
	it('reserves enough serverless time for one bounded scan step', () => {
		expect(config).toEqual({ maxDuration: 120 });
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
		expect(state.pilotFactory).not.toHaveBeenCalled();
	});

	it('loads the scan step next to the review queue', async () => {
		const data = await (load as never as Function)(event());
		expect(state.pilot.scanSetup).toHaveBeenCalledWith(USER_ID);
		expect(data.scan).toMatchObject({
			enabled: true,
			unavailable: false,
			max_projects: 25,
			accounts: [{ label: 'person@synthetic.invalid' }],
			projects: [{ id: PROJECT_ID, name: 'Synthetic Project' }],
			latest_run: null
		});
		expect(data.scan.start_key).toMatch(/^[0-9a-f-]{36}$/);
		expect(data.runs).toEqual([]);
	});

	it('keeps the review usable when scanning is switched off or its choices fail to load', async () => {
		state.env.GMAIL_RELEVANCE_PHASE_A_ENABLED = 'false';
		const off = await (load as never as Function)(event());
		expect(off.scan).toMatchObject({ enabled: false, accounts: [], projects: [] });
		expect(state.pilotFactory).not.toHaveBeenCalled();

		state.env.GMAIL_RELEVANCE_PHASE_A_ENABLED = 'true';
		state.pilot.scanSetup.mockRejectedValue(new Error('storage down'));
		const failed = await (load as never as Function)(event());
		expect(failed.scan).toMatchObject({ enabled: true, unavailable: true });
		expect(state.service.dashboard).toHaveBeenCalledTimes(2);
	});

	it('starts a scan with only a key and project ids, never an account id', async () => {
		const result = await (actions.startScan as never as Function)(
			event({ form: form({ idempotency_key: START_KEY, project_id: PROJECT_ID }) })
		);
		expect(state.pilot.startScan).toHaveBeenCalledWith({
			user_id: USER_ID,
			idempotency_key: START_KEY,
			project_ids: [PROJECT_ID]
		});
		expect(result).toEqual({ kind: 'scan_started', progress: PROGRESS });

		const withAccount = new FormData();
		withAccount.append('idempotency_key', START_KEY);
		withAccount.append('project_id', PROJECT_ID);
		withAccount.append('connection_id', '90000000-0000-4000-8000-000000000001');
		const rejected = await (actions.startScan as never as Function)(
			event({ form: withAccount })
		);
		expect(rejected).toMatchObject({ status: 400, data: { error_code: 'invalid_input' } });
		expect(state.pilot.startScan).toHaveBeenCalledTimes(1);
	});

	it('runs exactly one scan step per request and returns fresh progress', async () => {
		const result = await (actions.scanStep as never as Function)(
			event({ form: form({ run_id: RUN_ID, connection_scope_id: SCOPE_ID }) })
		);
		expect(state.pilot.runOneOperation).toHaveBeenCalledTimes(1);
		expect(state.pilot.runOneOperation).toHaveBeenCalledWith({
			user_id: USER_ID,
			run_id: RUN_ID,
			connection_scope_id: SCOPE_ID
		});
		expect(result).toEqual({
			kind: 'scan_step',
			status: 'committed',
			step_error_code: null,
			progress: PROGRESS
		});

		const rejected = await (actions.scanStep as never as Function)(
			event({
				form: form({ run_id: RUN_ID, connection_scope_id: SCOPE_ID, page_token: 'x' })
			})
		);
		expect(rejected).toMatchObject({ status: 400 });
		expect(state.pilot.runOneOperation).toHaveBeenCalledTimes(1);
	});

	it('cancels a scan for the session user and hides unknown scan errors', async () => {
		await expect(
			(actions.cancelScan as never as Function)(event({ form: form({ run_id: RUN_ID }) }))
		).resolves.toEqual({ kind: 'scan_cancelled' });
		expect(state.pilot.controlRun).toHaveBeenCalledWith({
			user_id: USER_ID,
			run_id: RUN_ID,
			action: 'cancel'
		});

		state.pilot.runOneOperation.mockRejectedValue({
			code: 'raw_provider_diagnostic',
			message: 'restricted upstream detail'
		});
		const failed = await (actions.scanStep as never as Function)(
			event({ form: form({ run_id: RUN_ID, connection_scope_id: SCOPE_ID }) })
		);
		expect(failed).toMatchObject({
			status: 500,
			data: { kind: 'error', error_code: 'internal_error' }
		});
		expect(JSON.stringify(failed)).not.toContain('restricted upstream detail');

		state.pilot.startScan.mockRejectedValue({ code: 'phase_a_disabled' });
		await expect(
			(actions.startScan as never as Function)(
				event({ form: form({ idempotency_key: START_KEY, project_id: PROJECT_ID }) })
			)
		).resolves.toMatchObject({ status: 403, data: { error_code: 'phase_a_disabled' } });
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

	it('sets cache headers only during load so enhanced actions can safely rerun load', async () => {
		const prepareEvent = event({ form: form({ run_id: RUN_ID }) });
		const openEvent = event({ form: form({ run_id: RUN_ID, sample_id: SAMPLE_ID }) });
		const adjudicateEvent = event({
			form: form({
				run_id: RUN_ID,
				sample_id: SAMPLE_ID,
				idempotency_key: '50000000-0000-4000-8000-000000000001',
				decision: 'correct_project',
				correction_reason: '',
				corrected_project_id: '',
				rule_proposal: ''
			})
		});

		await (actions.prepare as never as Function)(prepareEvent);
		await (actions.open as never as Function)(openEvent);
		await (actions.adjudicate as never as Function)(adjudicateEvent);

		expect(prepareEvent.setHeaders).not.toHaveBeenCalled();
		expect(openEvent.setHeaders).not.toHaveBeenCalled();
		expect(adjudicateEvent.setHeaders).not.toHaveBeenCalled();
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
