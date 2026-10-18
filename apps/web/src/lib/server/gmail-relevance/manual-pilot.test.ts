// apps/web/src/lib/server/gmail-relevance/manual-pilot.test.ts
import { describe, expect, it, vi } from 'vitest';
import type { Json } from '@buildos/shared-types';
import {
	GmailRelevancePilotService,
	GmailRelevancePilotServiceError,
	type GmailRelevancePilotRepository
} from './manual-pilot';
import { ProjectEmailProfilePublicationError } from './project-email-profile-publication';

const USER_ID = '10000000-0000-4000-8000-000000000001';
const OTHER_USER_ID = '10000000-0000-4000-8000-000000000002';
const CONNECTION_ID = '20000000-0000-4000-8000-000000000001';
const FOREIGN_CONNECTION_ID = '20000000-0000-4000-8000-000000000002';
const PROJECT_ID = '30000000-0000-4000-8000-000000000001';
const PROFILE_ID = '31000000-0000-4000-8000-000000000001';
const RUN_ID = '40000000-0000-4000-8000-000000000001';
const SCOPE_ID = '50000000-0000-4000-8000-000000000001';
const IDEMPOTENCY_KEY = 'invented-pilot-key-0001';
const ENABLED_ENV = {
	GMAIL_RELEVANCE_PHASE_A_ENABLED: 'true',
	GMAIL_RELEVANCE_PHASE_A_USER_IDS: USER_ID
};

const SCAN_PROGRESS = {
	run_id: RUN_ID,
	state: 'running' as const,
	terminal_reason_code: null,
	created_at: '2026-07-23T18:42:31.000Z',
	expires_at: '2026-07-24T18:42:00.000Z',
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

function repository(overrides: Partial<GmailRelevancePilotRepository> = {}) {
	return {
		listEligibleConnectionIds: vi.fn().mockResolvedValue([CONNECTION_ID]),
		listOwnedProjects: vi
			.fn()
			.mockResolvedValue([{ id: PROJECT_ID, name: 'Synthetic Project' }]),
		loadConnectionLabels: vi
			.fn()
			.mockImplementation(async (_userId: string, ids: string[]) =>
				ids.map((id) => ({ id, label: `${id.slice(0, 4)}@synthetic.invalid` }))
			),
		loadScanProgress: vi.fn().mockResolvedValue(SCAN_PROGRESS),
		loadExistingRun: vi.fn().mockResolvedValue(null),
		loadConnectionScopeIds: vi.fn().mockResolvedValue([SCOPE_ID]),
		...overrides
	} satisfies GmailRelevancePilotRepository;
}

function dependencies(
	input: {
		repository?: GmailRelevancePilotRepository;
		existing?: { id: string; configuration: Json } | null;
		profileFailure?: Error;
	} = {}
) {
	const repo =
		input.repository ??
		repository(
			input.existing === undefined
				? {}
				: { loadExistingRun: vi.fn().mockResolvedValue(input.existing) }
		);
	const profilePublisher = {
		captureProfiles: input.profileFailure
			? vi.fn().mockRejectedValue(input.profileFailure)
			: vi.fn().mockResolvedValue([
					{
						project_id: PROJECT_ID,
						profile_id: PROFILE_ID,
						profile_version: 1,
						profile_hash: 'a'.repeat(64)
					}
				])
	};
	const controlPlane = {
		createRun: vi.fn().mockResolvedValue({
			run_id: RUN_ID,
			created: true,
			manifest: {}
		}),
		controlRun: vi.fn().mockResolvedValue('paused'),
		expireRun: vi.fn().mockResolvedValue('expired')
	};
	const driver = {
		runOneOperation: vi.fn().mockResolvedValue({
			status: 'committed',
			operation_code: 'list_page',
			checkpoint_version: 1,
			scope_state: 'pending',
			error_code: null,
			provider_calls_started: 1,
			observation_count: 2,
			candidate_count: 0
		})
	};
	return { repo, profilePublisher, controlPlane, driver };
}

function service(input: ReturnType<typeof dependencies>) {
	return new GmailRelevancePilotService({
		repository: input.repo,
		profilePublisher: input.profilePublisher,
		controlPlane: input.controlPlane as never,
		driver: input.driver,
		now: () => new Date('2026-07-23T18:42:31.000Z'),
		environment: ENABLED_ENV
	});
}

describe('GmailRelevancePilotService', () => {
	it('validates connections, captures profiles, and creates an immutable server-timed run', async () => {
		const deps = dependencies();
		const result = await service(deps).createOrResumeRun({
			user_id: USER_ID,
			idempotency_key: IDEMPOTENCY_KEY,
			connection_ids: [CONNECTION_ID],
			project_ids: [PROJECT_ID]
		});

		expect(result).toEqual({
			run_id: RUN_ID,
			created: true,
			connection_scope_ids: [SCOPE_ID]
		});
		expect(deps.profilePublisher.captureProfiles).toHaveBeenCalledWith({
			user_id: USER_ID,
			project_ids: [PROJECT_ID]
		});
		expect(deps.controlPlane.createRun).toHaveBeenCalledWith(
			expect.objectContaining({
				user_id: USER_ID,
				connection_ids: [CONNECTION_ID],
				window_start: '2026-06-23T18:42:00.000Z',
				window_end: '2026-07-23T18:42:00.000Z',
				expires_at: '2026-07-24T18:42:00.000Z'
			})
		);
	});

	it('resolves duplicate submissions from the original run without publishing again', async () => {
		const deps = dependencies({
			existing: {
				id: RUN_ID,
				configuration: {
					connection_ids: [CONNECTION_ID],
					projects: [{ project_id: PROJECT_ID }]
				}
			}
		});

		await expect(
			service(deps).createOrResumeRun({
				user_id: USER_ID,
				idempotency_key: IDEMPOTENCY_KEY,
				connection_ids: [CONNECTION_ID],
				project_ids: [PROJECT_ID]
			})
		).resolves.toEqual({
			run_id: RUN_ID,
			created: false,
			connection_scope_ids: [SCOPE_ID]
		});
		expect(deps.profilePublisher.captureProfiles).not.toHaveBeenCalled();
		expect(deps.controlPlane.createRun).not.toHaveBeenCalled();
	});

	it('fails foreign connections and inaccessible projects before run creation', async () => {
		const foreign = dependencies();
		await expect(
			service(foreign).createOrResumeRun({
				user_id: USER_ID,
				idempotency_key: IDEMPOTENCY_KEY,
				connection_ids: [FOREIGN_CONNECTION_ID],
				project_ids: [PROJECT_ID]
			})
		).rejects.toEqual(
			expect.objectContaining<Partial<GmailRelevancePilotServiceError>>({
				code: 'connection_unavailable'
			})
		);
		expect(foreign.profilePublisher.captureProfiles).not.toHaveBeenCalled();
		expect(foreign.controlPlane.createRun).not.toHaveBeenCalled();

		const inaccessible = dependencies({
			profileFailure: new ProjectEmailProfilePublicationError('project_unavailable')
		});
		await expect(
			service(inaccessible).createOrResumeRun({
				user_id: USER_ID,
				idempotency_key: IDEMPOTENCY_KEY,
				connection_ids: [CONNECTION_ID],
				project_ids: [PROJECT_ID]
			})
		).rejects.toEqual(expect.objectContaining({ code: 'project_unavailable' }));
		expect(inaccessible.controlPlane.createRun).not.toHaveBeenCalled();
	});

	it('runs exactly one driver operation and returns only the bounded result', async () => {
		const deps = dependencies();
		const result = await service(deps).runOneOperation({
			user_id: USER_ID,
			run_id: RUN_ID,
			connection_scope_id: SCOPE_ID
		});

		expect(deps.driver.runOneOperation).toHaveBeenCalledTimes(1);
		expect(deps.driver.runOneOperation).toHaveBeenCalledWith({
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
	});

	it('binds pause and expire controls to the authenticated user and opaque run', async () => {
		const deps = dependencies();
		const pilot = service(deps);

		await expect(
			pilot.controlRun({ user_id: USER_ID, run_id: RUN_ID, action: 'pause' })
		).resolves.toBe('paused');
		await expect(
			pilot.controlRun({ user_id: USER_ID, run_id: RUN_ID, action: 'expire' })
		).resolves.toBe('expired');
		expect(deps.controlPlane.controlRun).toHaveBeenCalledWith({
			user_id: USER_ID,
			run_id: RUN_ID,
			action: 'pause'
		});
		expect(deps.controlPlane.expireRun).toHaveBeenCalledWith({
			user_id: USER_ID,
			run_id: RUN_ID
		});
	});

	it('fails the global flag and exact-user allowlist before any repository call', async () => {
		const deps = dependencies();
		const disabled = new GmailRelevancePilotService({
			repository: deps.repo,
			profilePublisher: deps.profilePublisher,
			controlPlane: deps.controlPlane as never,
			driver: deps.driver,
			environment: {}
		});
		await expect(disabled.scanSetup(USER_ID)).rejects.toEqual(
			expect.objectContaining({ code: 'phase_a_disabled' })
		);

		const denied = new GmailRelevancePilotService({
			repository: deps.repo,
			profilePublisher: deps.profilePublisher,
			controlPlane: deps.controlPlane as never,
			driver: deps.driver,
			environment: ENABLED_ENV
		});
		await expect(denied.scanSetup(OTHER_USER_ID)).rejects.toEqual(
			expect.objectContaining({ code: 'user_not_allowed' })
		);
		await expect(
			denied.startScan({
				user_id: OTHER_USER_ID,
				idempotency_key: IDEMPOTENCY_KEY,
				project_ids: [PROJECT_ID]
			})
		).rejects.toEqual(expect.objectContaining({ code: 'user_not_allowed' }));
		await expect(denied.scanProgress(OTHER_USER_ID, RUN_ID)).rejects.toEqual(
			expect.objectContaining({ code: 'user_not_allowed' })
		);
		expect(deps.repo.listEligibleConnectionIds).not.toHaveBeenCalled();
		expect(deps.repo.loadScanProgress).not.toHaveBeenCalled();
	});

	it('loads scan choices: labelled accounts (max 3), owned projects, and the latest unexpired run', async () => {
		const ids = [
			CONNECTION_ID,
			'20000000-0000-4000-8000-000000000003',
			'20000000-0000-4000-8000-000000000004',
			'20000000-0000-4000-8000-000000000005'
		];
		const deps = dependencies({
			repository: repository({
				listEligibleConnectionIds: vi.fn().mockResolvedValue(ids)
			})
		});
		const setup = await service(deps).scanSetup(USER_ID);

		expect(setup.accounts.map((account) => account.id)).toEqual(ids.slice(0, 3));
		expect(setup.projects).toEqual([{ id: PROJECT_ID, name: 'Synthetic Project' }]);
		expect(setup.latest_run).toEqual(SCAN_PROGRESS);
		expect(deps.repo.loadScanProgress).toHaveBeenCalledWith({
			user_id: USER_ID,
			now: '2026-07-23T18:42:31.000Z'
		});
	});

	it('starts a scan of every eligible account without taking accounts from the caller', async () => {
		const second = '20000000-0000-4000-8000-000000000003';
		const deps = dependencies({
			repository: repository({
				listEligibleConnectionIds: vi.fn().mockResolvedValue([CONNECTION_ID, second])
			})
		});
		await expect(
			service(deps).startScan({
				user_id: USER_ID,
				idempotency_key: IDEMPOTENCY_KEY,
				project_ids: [PROJECT_ID]
			})
		).resolves.toEqual({ run_id: RUN_ID, created: true, connection_scope_ids: [SCOPE_ID] });
		expect(deps.controlPlane.createRun).toHaveBeenCalledWith(
			expect.objectContaining({ connection_ids: [CONNECTION_ID, second] })
		);

		await expect(
			service(deps).startScan({
				user_id: USER_ID,
				idempotency_key: IDEMPOTENCY_KEY,
				project_ids: [PROJECT_ID],
				connection_ids: [FOREIGN_CONNECTION_ID]
			} as never)
		).rejects.toEqual(expect.objectContaining({ code: 'invalid_input' }));
	});

	it('refuses to start without a connected account or with too many projects', async () => {
		const none = dependencies({
			repository: repository({ listEligibleConnectionIds: vi.fn().mockResolvedValue([]) })
		});
		await expect(
			service(none).startScan({
				user_id: USER_ID,
				idempotency_key: IDEMPOTENCY_KEY,
				project_ids: [PROJECT_ID]
			})
		).rejects.toEqual(expect.objectContaining({ code: 'connection_unavailable' }));
		expect(none.controlPlane.createRun).not.toHaveBeenCalled();

		const tooMany = dependencies();
		await expect(
			service(tooMany).startScan({
				user_id: USER_ID,
				idempotency_key: IDEMPOTENCY_KEY,
				project_ids: Array.from(
					{ length: 26 },
					(_, index) => `30000000-0000-4000-8000-${String(index + 10).padStart(12, '0')}`
				)
			})
		).rejects.toEqual(expect.objectContaining({ code: 'invalid_input' }));
	});

	it('reports progress only for a run the user owns', async () => {
		const missing = dependencies({
			repository: repository({ loadScanProgress: vi.fn().mockResolvedValue(null) })
		});
		await expect(service(missing).scanProgress(USER_ID, RUN_ID)).rejects.toEqual(
			expect.objectContaining({ code: 'scope_unavailable' })
		);
		expect(missing.repo.loadScanProgress).toHaveBeenCalledWith({
			user_id: USER_ID,
			run_id: RUN_ID,
			now: '2026-07-23T18:42:31.000Z'
		});
	});
});
