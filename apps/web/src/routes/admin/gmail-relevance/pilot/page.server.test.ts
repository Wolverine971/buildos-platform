import { beforeEach, describe, expect, it, vi } from 'vitest';

const USER_ID = '10000000-0000-4000-8000-000000000001';
const OTHER_USER_ID = '10000000-0000-4000-8000-000000000002';
const CONNECTION_ID = '20000000-0000-4000-8000-000000000001';
const PROJECT_ID = '30000000-0000-4000-8000-000000000001';
const RUN_ID = '40000000-0000-4000-8000-000000000001';
const SCOPE_ID = '50000000-0000-4000-8000-000000000001';

const state = vi.hoisted(() => ({
	env: {
		GMAIL_RELEVANCE_PHASE_A_ENABLED: 'true',
		GMAIL_RELEVANCE_PHASE_A_USER_IDS: '10000000-0000-4000-8000-000000000001'
	} as Record<string, string | undefined>,
	service: {
		listOptions: vi.fn(),
		createOrResumeRun: vi.fn(),
		runOneOperation: vi.fn(),
		controlRun: vi.fn()
	},
	factory: vi.fn()
}));

vi.mock('$env/dynamic/private', () => ({ env: state.env }));
vi.mock('$lib/server/gmail-relevance/manual-pilot', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/gmail-relevance/manual-pilot')>()),
	createGmailRelevancePilotService: state.factory
}));

import { actions, load } from './+page.server';

function event(input: { userId?: string | null; form?: FormData } = {}) {
	return {
		request: new Request('https://buildos.invalid/admin/gmail-relevance/pilot', {
			method: 'POST',
			body: input.form ?? new FormData()
		}),
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

function createForm() {
	const form = new FormData();
	form.append('idempotency_key', 'invented-pilot-key-0001');
	form.append('connection_id', CONNECTION_ID);
	form.append('project_id', PROJECT_ID);
	return form;
}

beforeEach(() => {
	state.env.GMAIL_RELEVANCE_PHASE_A_ENABLED = 'true';
	state.env.GMAIL_RELEVANCE_PHASE_A_USER_IDS = USER_ID;
	for (const method of Object.values(state.service)) method.mockReset();
	state.factory.mockReset().mockReturnValue(state.service);
	state.service.listOptions.mockResolvedValue({
		connection_ids: [CONNECTION_ID],
		project_ids: [PROJECT_ID]
	});
	state.service.createOrResumeRun.mockResolvedValue({
		run_id: RUN_ID,
		created: true,
		connection_scope_ids: [SCOPE_ID]
	});
	state.service.runOneOperation.mockResolvedValue({
		status: 'committed',
		operation_code: 'list_page',
		checkpoint_version: 1,
		scope_state: 'pending',
		error_code: null,
		provider_calls_started: 1,
		observation_count: 2,
		candidate_count: 0
	});
	state.service.controlRun.mockResolvedValue('paused');
});

describe('/admin/gmail-relevance/pilot actions', () => {
	it('redirects unauthenticated requests before constructing a service', async () => {
		await expect((actions.createRun as never as Function)(event({ userId: null, form: createForm() }))).rejects.toMatchObject({
			status: 303,
			location: '/auth/login'
		});
		expect(state.factory).not.toHaveBeenCalled();
	});

	it('returns 404 for flag-off and non-allowlisted users before service-role work', async () => {
		state.env.GMAIL_RELEVANCE_PHASE_A_ENABLED = 'false';
		await expect((load as never as Function)(event())).rejects.toMatchObject({ status: 404 });
		state.env.GMAIL_RELEVANCE_PHASE_A_ENABLED = 'true';
		await expect((load as never as Function)(event({ userId: OTHER_USER_ID }))).rejects.toMatchObject({
			status: 404
		});
		expect(state.factory).not.toHaveBeenCalled();
	});

	it('accepts only the create allowlist and derives user_id from the session', async () => {
		const result = await (actions.createRun as never as Function)(event({ form: createForm() }));
		expect(result).toEqual({
			run_id: RUN_ID,
			created: true,
			connection_scope_ids: [SCOPE_ID]
		});
		expect(state.service.createOrResumeRun).toHaveBeenCalledWith({
			user_id: USER_ID,
			idempotency_key: 'invented-pilot-key-0001',
			connection_ids: [CONNECTION_ID],
			project_ids: [PROJECT_ID]
		});

		const malformed = createForm();
		malformed.append('user_id', OTHER_USER_ID);
		const rejected = await (actions.createRun as never as Function)(event({ form: malformed }));
		expect(rejected).toMatchObject({ status: 400, data: { error_code: 'invalid_input' } });
		expect(state.service.createOrResumeRun).toHaveBeenCalledTimes(1);
	});

	it('submits at most one bounded driver call and returns the exact safe result shape', async () => {
		const form = new FormData();
		form.append('run_id', RUN_ID);
		form.append('connection_scope_id', SCOPE_ID);
		const result = await (actions.runOne as never as Function)(event({ form }));

		expect(state.service.runOneOperation).toHaveBeenCalledTimes(1);
		expect(state.service.runOneOperation).toHaveBeenCalledWith({
			user_id: USER_ID,
			run_id: RUN_ID,
			connection_scope_id: SCOPE_ID
		});
		expect(Object.keys(result).sort()).toEqual(
			[
				'candidate_count',
				'checkpoint_version',
				'error_code',
				'observation_count',
				'operation_code',
				'provider_calls_started',
				'scope_state',
				'status'
			].sort()
		);
		for (const forbiddenKey of [
			'user_id',
			'provider_message_id',
			'page_token',
			'query',
			'metadata',
			'subject',
			'snippet'
		]) {
			expect(JSON.stringify(result)).not.toContain(forbiddenKey);
		}
	});

	it('rejects malformed or extra run-one fields without a driver call', async () => {
		const form = new FormData();
		form.append('run_id', RUN_ID);
		form.append('connection_scope_id', SCOPE_ID);
		form.append('cursor', 'forbidden');
		const result = await (actions.runOne as never as Function)(event({ form }));

		expect(result).toMatchObject({ status: 400, data: { error_code: 'invalid_input' } });
		expect(state.service.runOneOperation).not.toHaveBeenCalled();
	});

	it('maps unapproved upstream codes to one fixed internal error', async () => {
		state.service.runOneOperation.mockRejectedValueOnce({
			code: 'raw_provider_diagnostic',
			message: 'restricted upstream detail'
		});
		const form = new FormData();
		form.append('run_id', RUN_ID);
		form.append('connection_scope_id', SCOPE_ID);

		const result = await (actions.runOne as never as Function)(event({ form }));
		expect(result).toMatchObject({ status: 500, data: { error_code: 'internal_error' } });
		expect(JSON.stringify(result)).not.toContain('restricted upstream detail');
		expect(JSON.stringify(result)).not.toContain('raw_provider_diagnostic');
	});

	it('binds each control action to one authenticated run and no scope/provider payload', async () => {
		const form = new FormData();
		form.append('run_id', RUN_ID);
		const result = await (actions.pause as never as Function)(event({ form }));

		expect(result).toEqual({ state: 'paused' });
		expect(state.service.controlRun).toHaveBeenCalledWith({
			user_id: USER_ID,
			run_id: RUN_ID,
			action: 'pause'
		});
		expect(state.service.runOneOperation).not.toHaveBeenCalled();
	});
});
