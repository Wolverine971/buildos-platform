// apps/web/src/lib/server/gmail-relevance/metadata-driver.test.ts
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { encryptEmailRelevanceValue } from './metadata-crypto';
import {
	EmailRelevanceMetadataDriver,
	type EmailRelevanceMetadataDriverContext,
	type EmailRelevanceMetadataRepository
} from './metadata-driver';
import { normalizeEmailRelevanceMetadata } from './metadata-normalizer';
import type { ProjectEmailProfileGroups } from './project-email-profile';
import type { EmailRelevanceScanControlPlane } from './scan-control-plane';
import type { GmailRelevanceMetadataGateway } from './metadata-gateway';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const RUN_ID = '22222222-2222-4222-8222-222222222222';
const SCOPE_ID = '33333333-3333-4333-8333-333333333333';
const CONNECTION_ID = '44444444-4444-4444-8444-444444444444';
const PROJECT_ID = '55555555-5555-4555-8555-555555555551';
const PROFILE_ID = '55555555-5555-4555-8555-555555555552';
const VERSION_ID = '55555555-5555-4555-8555-555555555553';
const OPERATION_ID = '66666666-6666-4666-8666-666666666666';
const PROCESSING_TOKEN = '77777777-7777-4777-8777-777777777777';
const originalKey = process.env.PRIVATE_GMAIL_TOKEN_ENCRYPTION_KEY_V1;

function entry(field: string, value: string) {
	return {
		field,
		value,
		normalized_value: value.toLowerCase(),
		sources: [
			{ source_type: 'project' as const, source_id: PROJECT_ID, source_field: 'invented' }
		],
		value_truncated: false
	};
}

function groups(): ProjectEmailProfileGroups {
	return {
		identity: [entry('alias', 'orbital launch')],
		actors: [entry('email', 'invented@launch.test')],
		artifacts: [],
		identifiers: [entry('ticket', 'ZX-902')],
		semantic_context: [],
		negative_evidence: [],
		user_rules: [],
		recency: []
	};
}

function baseContext(
	overrides: Partial<EmailRelevanceMetadataDriverContext> = {}
): EmailRelevanceMetadataDriverContext {
	return {
		connection_id: CONNECTION_ID,
		window_start: '2026-06-21T00:00:00.000Z',
		window_end: '2026-07-21T00:00:00.000Z',
		checkpoint_version: 0,
		cursor_envelope: null,
		message_cap: 1_000,
		observations_discovered: 0,
		pending_observations: [],
		profiles: [
			{
				project_id: PROJECT_ID,
				profile_id: PROFILE_ID,
				profile_version_id: VERSION_ID,
				profile_version: 1,
				groups: groups()
			}
		],
		rules: [],
		...overrides
	};
}

function repository(context: EmailRelevanceMetadataDriverContext) {
	return {
		loadContext: vi.fn().mockResolvedValue(context)
	} satisfies EmailRelevanceMetadataRepository;
}

function claimed() {
	return {
		claimed: true,
		operation_id: OPERATION_ID,
		checkpoint_version: 0,
		scope_state: 'leased' as const,
		error_code: null,
		reservation: {
			operation_code: 'list_page' as const,
			gmail_quota_units: 5,
			runtime_ms: 15_000,
			message_count: 0
		}
	};
}

beforeAll(() => {
	process.env.PRIVATE_GMAIL_TOKEN_ENCRYPTION_KEY_V1 =
		'invented-driver-encryption-key-with-at-least-32-bytes';
});

afterAll(() => {
	if (originalKey === undefined) delete process.env.PRIVATE_GMAIL_TOKEN_ENCRYPTION_KEY_V1;
	else process.env.PRIVATE_GMAIL_TOKEN_ENCRYPTION_KEY_V1 = originalKey;
});

describe('EmailRelevanceMetadataDriver', () => {
	it('claims, lists, protects provider links, and settles one bounded page', async () => {
		const controlPlane = {
			claimOperation: vi.fn().mockResolvedValue(claimed()),
			settleListPage: vi.fn().mockResolvedValue({
				committed: true,
				checkpoint_version: 1,
				scope_state: 'pending',
				error_code: null
			}),
			settleOperationFailure: vi.fn()
		};
		const gateway = {
			listPage: vi.fn().mockResolvedValue({
				messages: [
					{
						provider_message_id: 'synthetic_provider_message',
						provider_thread_id: 'synthetic_provider_thread'
					}
				],
				next_page_token: 'synthetic_provider_cursor'
			})
		};
		const driver = new EmailRelevanceMetadataDriver({
			controlPlane: controlPlane as unknown as EmailRelevanceScanControlPlane,
			gateway: gateway as unknown as GmailRelevanceMetadataGateway,
			repository: repository(baseContext()),
			now: vi.fn().mockReturnValueOnce(1_000).mockReturnValueOnce(1_800),
			processingToken: () => PROCESSING_TOKEN
		});

		await expect(
			driver.runOneOperation({
				user_id: USER_ID,
				run_id: RUN_ID,
				connection_scope_id: SCOPE_ID
			})
		).resolves.toMatchObject({
			status: 'committed',
			operation_code: 'list_page',
			provider_calls_started: 1,
			observation_count: 1
		});
		const settlement = controlPlane.settleListPage.mock.calls[0]?.[0];
		expect(settlement.observations[0]).toMatchObject({
			provider_message_id_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
			provider_message_id_ciphertext: expect.stringMatching(/^enc:gmail-relevance:v1\./),
			provider_thread_id_ciphertext: expect.stringMatching(/^enc:gmail-relevance:v1\./)
		});
		expect(JSON.stringify(settlement)).not.toContain('synthetic_provider_message');
		expect(JSON.stringify(settlement)).not.toContain('synthetic_provider_thread');
		expect(JSON.stringify(settlement)).not.toContain('synthetic_provider_cursor');
	});

	it('decrypts only the claimed pending IDs, scores A/B, and persists fixed evidence', async () => {
		const providerId = 'synthetic_pending_message';
		const pendingCiphertext = encryptEmailRelevanceValue(providerId, {
			userId: USER_ID,
			connectionScopeId: SCOPE_ID,
			kind: 'provider_message'
		});
		const context = baseContext({
			checkpoint_version: 3,
			observations_discovered: 1,
			pending_observations: [
				{
					id: '88888888-8888-4888-8888-888888888888',
					provider_message_id_ciphertext: pendingCiphertext
				}
			]
		});
		const controlPlane = {
			claimOperation: vi.fn().mockResolvedValue({
				...claimed(),
				checkpoint_version: 3,
				reservation: {
					operation_code: 'metadata_batch',
					gmail_quota_units: 20,
					runtime_ms: 60_000,
					message_count: 1
				}
			}),
			settleMetadataBatch: vi.fn().mockResolvedValue({
				committed: true,
				checkpoint_version: 4,
				scope_state: 'pending',
				error_code: null
			}),
			settleOperationFailure: vi.fn()
		};
		const metadata = normalizeEmailRelevanceMetadata({
			id: providerId,
			threadId: 'synthetic_thread',
			internalDate: '1781568000000',
			labelIds: ['INBOX'],
			snippet: 'orbital launch ZX-902',
			payload: {
				headers: [
					{ name: 'From', value: 'invented@launch.test' },
					{ name: 'Subject', value: 'ZX-902 launch' }
				]
			}
		});
		const gateway = {
			getMetadataBatch: vi.fn().mockResolvedValue({ messages: [metadata] })
		};
		const driver = new EmailRelevanceMetadataDriver({
			controlPlane: controlPlane as unknown as EmailRelevanceScanControlPlane,
			gateway: gateway as unknown as GmailRelevanceMetadataGateway,
			repository: repository(context),
			now: vi.fn().mockReturnValueOnce(2_000).mockReturnValueOnce(3_000),
			processingToken: () => PROCESSING_TOKEN
		});

		const result = await driver.runOneOperation({
			user_id: USER_ID,
			run_id: RUN_ID,
			connection_scope_id: SCOPE_ID
		});
		expect(result).toMatchObject({
			operation_code: 'metadata_batch',
			observation_count: 1,
			candidate_count: 2
		});
		expect(gateway.getMetadataBatch).toHaveBeenCalledWith(
			expect.objectContaining({ provider_message_ids: [providerId] })
		);
		const settlement = controlPlane.settleMetadataBatch.mock.calls[0]?.[0];
		expect(settlement.results[0].candidates).toHaveLength(2);
		expect(settlement.results[0].evidence_fingerprints[0]).toMatch(/^[a-f0-9]{64}$/);
		const durablePayload = JSON.stringify(settlement.results);
		expect(durablePayload).not.toContain(providerId);
		expect(durablePayload).not.toContain('orbital launch');
		expect(durablePayload).not.toContain('invented@launch.test');
		expect(durablePayload).not.toContain('ZX-902 launch');
	});

	it('makes zero provider calls when the database reservation is denied', async () => {
		const gateway = { listPage: vi.fn() };
		const controlPlane = {
			claimOperation: vi.fn().mockResolvedValue({
				...claimed(),
				claimed: false,
				operation_id: null,
				scope_state: 'quota_stopped',
				error_code: 'budget_exceeded'
			})
		};
		const driver = new EmailRelevanceMetadataDriver({
			controlPlane: controlPlane as unknown as EmailRelevanceScanControlPlane,
			gateway: gateway as unknown as GmailRelevanceMetadataGateway,
			repository: repository(baseContext()),
			processingToken: () => PROCESSING_TOKEN
		});

		await expect(
			driver.runOneOperation({
				user_id: USER_ID,
				run_id: RUN_ID,
				connection_scope_id: SCOPE_ID
			})
		).resolves.toMatchObject({ status: 'no_op', provider_calls_started: 0 });
		expect(gateway.listPage).not.toHaveBeenCalled();
	});

	it('settles provider failures with only a fixed code and started-call count', async () => {
		const controlPlane = {
			claimOperation: vi.fn().mockResolvedValue(claimed()),
			settleOperationFailure: vi.fn().mockResolvedValue({
				committed: true,
				checkpoint_version: 0,
				scope_state: 'retry_wait',
				error_code: 'provider_timeout'
			})
		};
		const gateway = {
			listPage: vi.fn().mockRejectedValue(
				Object.assign(new Error('fixed'), {
					name: 'GmailRelevanceMetadataGatewayError',
					code: 'provider_timeout',
					providerCallsStarted: 1
				})
			)
		};
		// Use the real error prototype so the driver maps it without inspecting its message.
		const { GmailRelevanceMetadataGatewayError } = await import('./metadata-gateway');
		gateway.listPage.mockRejectedValueOnce(
			new GmailRelevanceMetadataGatewayError('provider_timeout', 1)
		);
		const driver = new EmailRelevanceMetadataDriver({
			controlPlane: controlPlane as unknown as EmailRelevanceScanControlPlane,
			gateway: gateway as unknown as GmailRelevanceMetadataGateway,
			repository: repository(baseContext()),
			now: vi.fn().mockReturnValueOnce(5_000).mockReturnValueOnce(5_500),
			processingToken: () => PROCESSING_TOKEN
		});

		await driver.runOneOperation({
			user_id: USER_ID,
			run_id: RUN_ID,
			connection_scope_id: SCOPE_ID
		});
		expect(controlPlane.settleOperationFailure).toHaveBeenCalledWith(
			expect.objectContaining({
				provider_calls_started: 1,
				error_code: 'provider_timeout'
			})
		);
		const failurePayload = JSON.stringify(
			controlPlane.settleOperationFailure.mock.calls[0]?.[0]
		);
		expect(failurePayload).not.toContain('fixed');
	});

	it('accounts for a completed provider call when later processing fails', async () => {
		const controlPlane = {
			claimOperation: vi.fn().mockResolvedValue(claimed()),
			settleListPage: vi.fn().mockRejectedValue(new Error('synthetic storage failure')),
			settleOperationFailure: vi.fn().mockResolvedValue({
				committed: true,
				checkpoint_version: 0,
				scope_state: 'retry_wait',
				error_code: 'internal_error'
			})
		};
		const gateway = {
			listPage: vi.fn().mockResolvedValue({ messages: [], next_page_token: null })
		};
		const driver = new EmailRelevanceMetadataDriver({
			controlPlane: controlPlane as unknown as EmailRelevanceScanControlPlane,
			gateway: gateway as unknown as GmailRelevanceMetadataGateway,
			repository: repository(baseContext()),
			now: vi.fn().mockReturnValueOnce(8_000).mockReturnValueOnce(8_500),
			processingToken: () => PROCESSING_TOKEN
		});

		await driver.runOneOperation({
			user_id: USER_ID,
			run_id: RUN_ID,
			connection_scope_id: SCOPE_ID
		});
		expect(controlPlane.settleOperationFailure).toHaveBeenCalledWith(
			expect.objectContaining({
				provider_calls_started: 1,
				error_code: 'internal_error'
			})
		);
	});
});
