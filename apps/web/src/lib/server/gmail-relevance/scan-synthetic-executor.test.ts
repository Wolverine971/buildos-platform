// apps/web/src/lib/server/gmail-relevance/scan-synthetic-executor.test.ts
import { describe, expect, it, vi } from 'vitest';
import { SYNTHETIC_SCAN_USER_IDS } from './scan-control-plane.fixtures';
import {
	EMAIL_RELEVANCE_SYNTHETIC_LEASE_OWNER,
	executeEmailRelevanceSyntheticStep,
	type EmailRelevanceSyntheticControlPlane
} from './scan-synthetic-executor';

const JOB = {
	run_id: '50000000-0000-4000-8000-000000000001',
	connection_scope_id: '60000000-0000-4000-8000-000000000001',
	checkpoint_version: 0,
	processing_token: '70000000-0000-4000-8000-000000000001'
} as const;

describe('executeEmailRelevanceSyntheticStep', () => {
	it('reserves before its deterministic operation and settles exactly once', async () => {
		const callOrder: string[] = [];
		const claimStep = vi.fn(async () => {
			callOrder.push('claim');
			return {
				claimed: true,
				operation_id: '80000000-0000-4000-8000-000000000001',
				checkpoint_version: 0,
				scope_state: 'leased' as const,
				error_code: null
			};
		});
		const settleStep = vi.fn(async () => {
			callOrder.push('settle');
			return {
				committed: true,
				checkpoint_version: 1,
				scope_state: 'pending' as const,
				error_code: null
			};
		});
		const controlPlane = {
			claimStep,
			settleStep
		} satisfies EmailRelevanceSyntheticControlPlane;

		const result = await executeEmailRelevanceSyntheticStep({
			user_id: SYNTHETIC_SCAN_USER_IDS.primary,
			job: JOB,
			control_plane: controlPlane
		});

		expect(callOrder).toEqual(['claim', 'settle']);
		expect(claimStep).toHaveBeenCalledWith({
			user_id: SYNTHETIC_SCAN_USER_IDS.primary,
			run_id: JOB.run_id,
			connection_scope_id: JOB.connection_scope_id,
			expected_checkpoint: 0,
			processing_token: JOB.processing_token,
			lease_owner: EMAIL_RELEVANCE_SYNTHETIC_LEASE_OWNER,
			gmail_quota_units: 1000,
			runtime_ms: 60000
		});
		expect(settleStep).toHaveBeenCalledWith(
			expect.objectContaining({
				operation_id: '80000000-0000-4000-8000-000000000001',
				settlement: {
					result: 'success',
					actual_gmail_quota_units: 1000,
					actual_runtime_ms: 60000,
					error_code: null
				}
			})
		);
		expect(result).toEqual({
			status: 'committed',
			checkpoint_version: 1,
			scope_state: 'pending'
		});
	});

	it('treats a repeated or paused delivery as a no-op without executing settlement', async () => {
		const claimStep = vi.fn(async () => ({
			claimed: false,
			operation_id: null,
			checkpoint_version: 1,
			scope_state: 'pending' as const,
			error_code: 'stale_checkpoint' as const
		}));
		const settleStep = vi.fn();

		const result = await executeEmailRelevanceSyntheticStep({
			user_id: SYNTHETIC_SCAN_USER_IDS.primary,
			job: JOB,
			control_plane: { claimStep, settleStep } as EmailRelevanceSyntheticControlPlane
		});

		expect(result).toEqual({
			status: 'no_op',
			checkpoint_version: 1,
			scope_state: 'pending',
			error_code: 'stale_checkpoint'
		});
		expect(settleStep).not.toHaveBeenCalled();
	});

	it('uses only the fixed retry result when a synthetic failure is requested', async () => {
		const claimStep = vi.fn(async () => ({
			claimed: true,
			operation_id: '80000000-0000-4000-8000-000000000001',
			checkpoint_version: 0,
			scope_state: 'leased' as const,
			error_code: null
		}));
		const settleStep = vi.fn(async () => ({
			committed: true,
			checkpoint_version: 0,
			scope_state: 'retry_wait' as const,
			error_code: 'synthetic_retryable' as const
		}));

		await executeEmailRelevanceSyntheticStep({
			user_id: SYNTHETIC_SCAN_USER_IDS.primary,
			job: JOB,
			control_plane: { claimStep, settleStep },
			settlement: {
				result: 'retryable_failure',
				actual_gmail_quota_units: 0,
				actual_runtime_ms: 1,
				error_code: 'synthetic_retryable'
			}
		});

		expect(settleStep).toHaveBeenCalledWith(
			expect.objectContaining({
				settlement: {
					result: 'retryable_failure',
					actual_gmail_quota_units: 0,
					actual_runtime_ms: 1,
					error_code: 'synthetic_retryable'
				}
			})
		);
	});
});
