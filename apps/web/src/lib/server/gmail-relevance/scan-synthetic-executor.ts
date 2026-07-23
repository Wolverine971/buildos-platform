// apps/web/src/lib/server/gmail-relevance/scan-synthetic-executor.ts
import { EMAIL_RELEVANCE_SCAN_BUDGET_POLICY } from './scan-budget';
import type {
	EmailRelevanceScanClaimResult,
	EmailRelevanceScanSettlement,
	EmailRelevanceScanSettlementResult
} from './scan-control-plane';
import { parseEmailRelevanceScanJobMetadata } from './scan-job';

export const EMAIL_RELEVANCE_SYNTHETIC_LEASE_OWNER = 'synthetic_executor_v1';

const SYNTHETIC_RESERVATION = {
	gmail_quota_units: EMAIL_RELEVANCE_SCAN_BUDGET_POLICY.metadata_batch_ceiling * 20,
	runtime_ms: 60_000
} as const;

export type EmailRelevanceSyntheticControlPlane = {
	claimStep(input: {
		user_id: string;
		run_id: string;
		connection_scope_id: string;
		expected_checkpoint: number;
		processing_token: string;
		lease_owner: string;
		gmail_quota_units: number;
		runtime_ms: number;
	}): Promise<EmailRelevanceScanClaimResult>;
	settleStep(input: {
		user_id: string;
		run_id: string;
		connection_scope_id: string;
		expected_checkpoint: number;
		processing_token: string;
		operation_id: string;
		settlement: EmailRelevanceScanSettlement;
	}): Promise<EmailRelevanceScanSettlementResult>;
};

export type EmailRelevanceSyntheticStepResult =
	| {
			status: 'committed';
			checkpoint_version: number;
			scope_state: EmailRelevanceScanSettlementResult['scope_state'];
	  }
	| {
			status: 'no_op';
			checkpoint_version: number;
			scope_state: EmailRelevanceScanClaimResult['scope_state'];
			error_code:
				| EmailRelevanceScanClaimResult['error_code']
				| EmailRelevanceScanSettlementResult['error_code'];
	  };

export async function executeEmailRelevanceSyntheticStep(input: {
	user_id: string;
	job: unknown;
	control_plane: EmailRelevanceSyntheticControlPlane;
	settlement?: EmailRelevanceScanSettlement;
}): Promise<EmailRelevanceSyntheticStepResult> {
	const job = parseEmailRelevanceScanJobMetadata(input.job);
	const claim = await input.control_plane.claimStep({
		user_id: input.user_id,
		run_id: job.run_id,
		connection_scope_id: job.connection_scope_id,
		expected_checkpoint: job.checkpoint_version,
		processing_token: job.processing_token,
		lease_owner: EMAIL_RELEVANCE_SYNTHETIC_LEASE_OWNER,
		gmail_quota_units: SYNTHETIC_RESERVATION.gmail_quota_units,
		runtime_ms: SYNTHETIC_RESERVATION.runtime_ms
	});

	if (!claim.claimed || !claim.operation_id) {
		return {
			status: 'no_op',
			checkpoint_version: claim.checkpoint_version,
			scope_state: claim.scope_state,
			error_code: claim.error_code
		};
	}

	// This is the complete synthetic operation. It is deterministic, has no I/O,
	// and consumes only the reservation fixed above.
	const settlement: EmailRelevanceScanSettlement = input.settlement ?? {
		result: 'success',
		actual_gmail_quota_units: SYNTHETIC_RESERVATION.gmail_quota_units,
		actual_runtime_ms: SYNTHETIC_RESERVATION.runtime_ms,
		error_code: null
	};
	const settled = await input.control_plane.settleStep({
		user_id: input.user_id,
		run_id: job.run_id,
		connection_scope_id: job.connection_scope_id,
		expected_checkpoint: job.checkpoint_version,
		processing_token: job.processing_token,
		operation_id: claim.operation_id,
		settlement
	});

	if (!settled.committed) {
		return {
			status: 'no_op',
			checkpoint_version: settled.checkpoint_version,
			scope_state: settled.scope_state,
			error_code: settled.error_code
		};
	}

	return {
		status: 'committed',
		checkpoint_version: settled.checkpoint_version,
		scope_state: settled.scope_state
	};
}
