// apps/web/src/lib/server/gmail-relevance/scan-control-plane.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
	EmailRelevanceScanControlPlane,
	EmailRelevanceScanControlPlaneError,
	type EmailRelevanceScanRpcClient
} from './scan-control-plane';
import {
	SYNTHETIC_SCAN_REFERENCE_TIME,
	SYNTHETIC_SCAN_USER_IDS,
	syntheticScanManifestInput
} from './scan-control-plane.fixtures';

const ENABLED_ENVIRONMENT = {
	GMAIL_RELEVANCE_PHASE_A_ENABLED: 'true',
	GMAIL_RELEVANCE_PHASE_A_USER_IDS: SYNTHETIC_SCAN_USER_IDS.primary
};

function rpcClientWith(response: {
	data: unknown;
	error: { code?: string; message?: string } | null;
}) {
	const rpc = vi.fn().mockResolvedValue(response);
	return { rpcClient: { rpc } as EmailRelevanceScanRpcClient, rpc };
}

describe('EmailRelevanceScanControlPlane', () => {
	it('stops before persistence when the exact-user gate is disabled', async () => {
		const { rpcClient, rpc } = rpcClientWith({ data: null, error: null });
		const controlPlane = new EmailRelevanceScanControlPlane({
			rpcClient,
			environment: {}
		});

		await expect(controlPlane.createRun(syntheticScanManifestInput())).rejects.toMatchObject({
			code: 'phase_a_disabled'
		});
		expect(rpc).not.toHaveBeenCalled();
	});

	it('creates a canonical manifest through the atomic RPC', async () => {
		const runId = '50000000-0000-4000-8000-000000000001';
		const { rpcClient, rpc } = rpcClientWith({
			data: [{ run_id: runId, created: true }],
			error: null
		});
		const controlPlane = new EmailRelevanceScanControlPlane({
			rpcClient,
			environment: ENABLED_ENVIRONMENT,
			now: () => new Date(SYNTHETIC_SCAN_REFERENCE_TIME)
		});

		const result = await controlPlane.createRun(syntheticScanManifestInput());

		expect(result.run_id).toBe(runId);
		expect(result.created).toBe(true);
		expect(result.manifest.configuration.connection_ids).toEqual([
			'20000000-0000-4000-8000-000000000001',
			'20000000-0000-4000-8000-000000000002',
			'20000000-0000-4000-8000-000000000003'
		]);
		expect(rpc).toHaveBeenCalledWith(
			'create_email_relevance_scan_run',
			expect.objectContaining({
				p_user_id: SYNTHETIC_SCAN_USER_IDS.primary,
				p_idempotency_key_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
				p_manifest_hash: expect.stringMatching(/^[a-f0-9]{64}$/)
			})
		);
	});

	it('binds a claim to run and scope while persisting only a token hash', async () => {
		const { rpcClient, rpc } = rpcClientWith({
			data: [
				{
					claimed: true,
					operation_id: '80000000-0000-4000-8000-000000000001',
					checkpoint_version: 0,
					scope_state: 'leased',
					error_code: null
				}
			],
			error: null
		});
		const controlPlane = new EmailRelevanceScanControlPlane({
			rpcClient,
			environment: ENABLED_ENVIRONMENT
		});
		const processingToken = '70000000-0000-4000-8000-000000000001';

		await controlPlane.claimStep({
			user_id: SYNTHETIC_SCAN_USER_IDS.primary,
			run_id: '50000000-0000-4000-8000-000000000001',
			connection_scope_id: '60000000-0000-4000-8000-000000000001',
			expected_checkpoint: 0,
			processing_token: processingToken,
			lease_owner: 'synthetic_executor_v1',
			gmail_quota_units: 1000,
			runtime_ms: 60000
		});

		const parameters = rpc.mock.calls[0]?.[1] as Record<string, unknown>;
		expect(parameters).toMatchObject({
			p_run_id: '50000000-0000-4000-8000-000000000001',
			p_connection_scope_id: '60000000-0000-4000-8000-000000000001'
		});
		expect(parameters.p_processing_token_hash).toMatch(/^[a-f0-9]{64}$/);
		expect(parameters.p_processing_token_hash).not.toBe(processingToken);
		expect(JSON.stringify(parameters)).not.toContain(processingToken);
	});

	it('claims a real metadata batch by operation code without application-supplied pricing', async () => {
		const { rpcClient, rpc } = rpcClientWith({
			data: [
				{
					claimed: true,
					operation_id: '80000000-0000-4000-8000-000000000002',
					checkpoint_version: 4,
					scope_state: 'leased',
					error_code: null
				}
			],
			error: null
		});
		const controlPlane = new EmailRelevanceScanControlPlane({
			rpcClient,
			environment: ENABLED_ENVIRONMENT
		});
		const result = await controlPlane.claimOperation({
			user_id: SYNTHETIC_SCAN_USER_IDS.primary,
			run_id: '50000000-0000-4000-8000-000000000001',
			connection_scope_id: '60000000-0000-4000-8000-000000000001',
			expected_checkpoint: 4,
			processing_token: '70000000-0000-4000-8000-000000000002',
			lease_owner: 'metadata_driver_v1',
			operation: { operation_code: 'metadata_batch', message_count: 37 }
		});

		expect(result.reservation).toEqual({
			operation_code: 'metadata_batch',
			gmail_quota_units: 740,
			runtime_ms: 60_000,
			message_count: 37
		});
		expect(rpc).toHaveBeenCalledWith(
			'claim_email_relevance_scan_operation',
			expect.objectContaining({
				p_operation_code: 'metadata_batch',
				p_message_count: 37
			})
		);
		const parameters = rpc.mock.calls[0]?.[1] as Record<string, unknown>;
		expect(parameters).not.toHaveProperty('p_gmail_quota_units');
		expect(parameters).not.toHaveProperty('p_runtime_ms');
	});

	it('maps database failures to fixed content-free codes', async () => {
		const { rpcClient } = rpcClientWith({
			data: null,
			error: {
				code: '23505',
				message: 'email_relevance_scan_idempotency_conflict: untrusted detail'
			}
		});
		const controlPlane = new EmailRelevanceScanControlPlane({
			rpcClient,
			environment: ENABLED_ENVIRONMENT,
			now: () => new Date(SYNTHETIC_SCAN_REFERENCE_TIME)
		});

		let caught: unknown;
		try {
			await controlPlane.createRun(syntheticScanManifestInput());
		} catch (error) {
			caught = error;
		}
		expect(caught).toBeInstanceOf(EmailRelevanceScanControlPlaneError);
		expect(caught).toMatchObject({ code: 'idempotency_conflict' });
		expect((caught as Error).message).not.toContain('untrusted detail');
	});
});
