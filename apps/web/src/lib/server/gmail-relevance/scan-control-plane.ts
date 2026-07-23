// apps/web/src/lib/server/gmail-relevance/scan-control-plane.ts
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { isGmailRelevancePhaseAEnabled, isGmailRelevancePhaseAUserAllowed } from './config';
import {
	buildEmailRelevanceScanManifest,
	type CreateEmailRelevanceScanManifestInput,
	type EmailRelevanceScanManifest
} from './scan-manifest';
import {
	EMAIL_RELEVANCE_SCAN_CONNECTION_STATES,
	EMAIL_RELEVANCE_SCAN_RUN_STATES,
	EMAIL_RELEVANCE_SCAN_SAFE_ERROR_CODES,
	type EmailRelevanceScanConnectionState,
	type EmailRelevanceScanRunState,
	type EmailRelevanceScanSafeErrorCode
} from './scan-state';

const UUID_SCHEMA = z.string().uuid();
const PROCESSING_TOKEN_SCHEMA = z.string().uuid();
const LEASE_OWNER_SCHEMA = z.string().regex(/^[a-z0-9_-]{1,64}$/);
const RUN_STATE_SCHEMA = z.enum(EMAIL_RELEVANCE_SCAN_RUN_STATES);
const CONNECTION_STATE_SCHEMA = z.enum(EMAIL_RELEVANCE_SCAN_CONNECTION_STATES);
const SAFE_ERROR_CODE_SCHEMA = z.enum(EMAIL_RELEVANCE_SCAN_SAFE_ERROR_CODES);

const CREATE_RESULT_SCHEMA = z.object({ run_id: UUID_SCHEMA, created: z.boolean() }).strict();
const CLAIM_RESULT_SCHEMA = z
	.object({
		claimed: z.boolean(),
		operation_id: UUID_SCHEMA.nullable(),
		checkpoint_version: z.number().int().nonnegative(),
		scope_state: CONNECTION_STATE_SCHEMA,
		error_code: SAFE_ERROR_CODE_SCHEMA.nullable()
	})
	.strict();
const SETTLE_RESULT_SCHEMA = z
	.object({
		committed: z.boolean(),
		checkpoint_version: z.number().int().nonnegative(),
		scope_state: CONNECTION_STATE_SCHEMA,
		error_code: SAFE_ERROR_CODE_SCHEMA.nullable()
	})
	.strict();

type EnvironmentSource = Record<string, string | undefined>;

type SupabaseErrorLike = {
	code?: string;
	message?: string;
};

type SupabaseResultLike = {
	data: unknown;
	error: SupabaseErrorLike | null;
};

export type EmailRelevanceScanRpcClient = {
	rpc(name: string, parameters: Record<string, unknown>): PromiseLike<SupabaseResultLike>;
};

export type EmailRelevanceScanCreateResult = {
	run_id: string;
	created: boolean;
	manifest: EmailRelevanceScanManifest;
};

export type EmailRelevanceScanClaimResult = {
	claimed: boolean;
	operation_id: string | null;
	checkpoint_version: number;
	scope_state: EmailRelevanceScanConnectionState;
	error_code: EmailRelevanceScanSafeErrorCode | null;
};

export type EmailRelevanceScanSettlementResult = {
	committed: boolean;
	checkpoint_version: number;
	scope_state: EmailRelevanceScanConnectionState;
	error_code: EmailRelevanceScanSafeErrorCode | null;
};

export type EmailRelevanceScanSettlement = {
	result: 'success' | 'retryable_failure' | 'nonretryable_failure';
	actual_gmail_quota_units: number;
	actual_runtime_ms: number;
	error_code:
		| 'synthetic_retryable'
		| 'connection_disconnected'
		| 'project_unavailable'
		| 'internal_error'
		| null;
};

export type EmailRelevanceScanControlAction = 'pause' | 'resume' | 'cancel';

export type EmailRelevanceScanControlPlaneErrorCode =
	| 'phase_a_disabled'
	| 'user_not_allowed'
	| 'invalid_manifest'
	| 'idempotency_conflict'
	| 'ownership_mismatch'
	| 'connection_unavailable'
	| 'profile_unavailable'
	| 'manifest_expired'
	| 'internal_error';

export class EmailRelevanceScanControlPlaneError extends Error {
	constructor(public readonly code: EmailRelevanceScanControlPlaneErrorCode) {
		super(`Email relevance scan control plane rejected: ${code}`);
		this.name = 'EmailRelevanceScanControlPlaneError';
	}
}

type EmailRelevanceScanControlPlaneDependencies = {
	rpcClient?: EmailRelevanceScanRpcClient;
	environment?: EnvironmentSource;
	now?: () => Date;
};

function defaultRpcClient(): EmailRelevanceScanRpcClient {
	return createAdminSupabaseClient() as unknown as EmailRelevanceScanRpcClient;
}

function firstRpcRow(data: unknown): unknown {
	return Array.isArray(data) ? data[0] : data;
}

function hashProcessingToken(connectionScopeId: string, processingToken: string): string {
	return createHash('sha256')
		.update(
			`email-relevance-scan-processing-token-v1\u0000${connectionScopeId}\u0000${processingToken}`,
			'utf8'
		)
		.digest('hex');
}

function mapDatabaseError(error: SupabaseErrorLike): EmailRelevanceScanControlPlaneErrorCode {
	const message = error.message ?? '';
	if (message.includes('idempotency_conflict')) return 'idempotency_conflict';
	if (message.includes('manifest_expired')) return 'manifest_expired';
	if (message.includes('connection_scope_mismatch')) return 'connection_unavailable';
	if (message.includes('project_scope_mismatch')) return 'profile_unavailable';
	if (message.includes('owner_required') || error.code === '42501') return 'ownership_mismatch';
	if (message.includes('invalid_manifest') || error.code === '22023') return 'invalid_manifest';
	return 'internal_error';
}

export class EmailRelevanceScanControlPlane {
	private readonly rpcClient: EmailRelevanceScanRpcClient;
	private readonly environment: EnvironmentSource;
	private readonly now: () => Date;

	constructor(dependencies: EmailRelevanceScanControlPlaneDependencies = {}) {
		this.rpcClient = dependencies.rpcClient ?? defaultRpcClient();
		this.environment = dependencies.environment ?? process.env;
		this.now = dependencies.now ?? (() => new Date());
	}

	private assertAllowed(userId: string): void {
		if (!isGmailRelevancePhaseAEnabled(this.environment)) {
			throw new EmailRelevanceScanControlPlaneError('phase_a_disabled');
		}
		if (!isGmailRelevancePhaseAUserAllowed(userId, this.environment)) {
			throw new EmailRelevanceScanControlPlaneError('user_not_allowed');
		}
	}

	private async rpc<T>(
		name: string,
		parameters: Record<string, unknown>,
		schema: z.ZodType<T>
	): Promise<T> {
		const result = await this.rpcClient.rpc(name, parameters);
		if (result.error) {
			throw new EmailRelevanceScanControlPlaneError(mapDatabaseError(result.error));
		}
		const parsed = schema.safeParse(firstRpcRow(result.data));
		if (!parsed.success) {
			throw new EmailRelevanceScanControlPlaneError('internal_error');
		}
		return parsed.data;
	}

	async createRun(
		input: CreateEmailRelevanceScanManifestInput
	): Promise<EmailRelevanceScanCreateResult> {
		this.assertAllowed(input.user_id);
		let manifest: EmailRelevanceScanManifest;
		try {
			manifest = buildEmailRelevanceScanManifest(input, this.now());
		} catch {
			throw new EmailRelevanceScanControlPlaneError('invalid_manifest');
		}

		const created = await this.rpc(
			'create_email_relevance_scan_run',
			{
				p_user_id: input.user_id,
				p_idempotency_key_hash: manifest.idempotency_key_hash,
				p_manifest_hash: manifest.manifest_hash,
				p_configuration: manifest.configuration
			},
			CREATE_RESULT_SCHEMA
		);
		return { ...created, manifest };
	}

	async claimStep(input: {
		user_id: string;
		run_id: string;
		connection_scope_id: string;
		expected_checkpoint: number;
		processing_token: string;
		lease_owner: string;
		gmail_quota_units: number;
		runtime_ms: number;
	}): Promise<EmailRelevanceScanClaimResult> {
		this.assertAllowed(input.user_id);
		const parsed = z
			.object({
				user_id: UUID_SCHEMA,
				run_id: UUID_SCHEMA,
				connection_scope_id: UUID_SCHEMA,
				expected_checkpoint: z.number().int().nonnegative(),
				processing_token: PROCESSING_TOKEN_SCHEMA,
				lease_owner: LEASE_OWNER_SCHEMA,
				gmail_quota_units: z.number().int().min(1).max(1000),
				runtime_ms: z.number().int().min(1).max(60000)
			})
			.strict()
			.safeParse(input);
		if (!parsed.success) throw new EmailRelevanceScanControlPlaneError('invalid_manifest');

		return this.rpc(
			'claim_email_relevance_scan_step',
			{
				p_user_id: parsed.data.user_id,
				p_run_id: parsed.data.run_id,
				p_connection_scope_id: parsed.data.connection_scope_id,
				p_expected_checkpoint: parsed.data.expected_checkpoint,
				p_processing_token_hash: hashProcessingToken(
					parsed.data.connection_scope_id,
					parsed.data.processing_token
				),
				p_lease_owner: parsed.data.lease_owner,
				p_gmail_quota_units: parsed.data.gmail_quota_units,
				p_runtime_ms: parsed.data.runtime_ms
			},
			CLAIM_RESULT_SCHEMA
		);
	}

	async settleStep(input: {
		user_id: string;
		run_id: string;
		connection_scope_id: string;
		expected_checkpoint: number;
		processing_token: string;
		operation_id: string;
		settlement: EmailRelevanceScanSettlement;
	}): Promise<EmailRelevanceScanSettlementResult> {
		this.assertAllowed(input.user_id);
		const parsed = z
			.object({
				user_id: UUID_SCHEMA,
				run_id: UUID_SCHEMA,
				connection_scope_id: UUID_SCHEMA,
				expected_checkpoint: z.number().int().nonnegative(),
				processing_token: PROCESSING_TOKEN_SCHEMA,
				operation_id: UUID_SCHEMA,
				settlement: z
					.object({
						result: z.enum(['success', 'retryable_failure', 'nonretryable_failure']),
						actual_gmail_quota_units: z.number().int().nonnegative().max(1000),
						actual_runtime_ms: z.number().int().nonnegative().max(60000),
						error_code: z
							.enum([
								'synthetic_retryable',
								'connection_disconnected',
								'project_unavailable',
								'internal_error'
							])
							.nullable()
					})
					.strict()
			})
			.strict()
			.safeParse(input);
		if (!parsed.success) throw new EmailRelevanceScanControlPlaneError('invalid_manifest');

		return this.rpc(
			'settle_email_relevance_scan_step',
			{
				p_user_id: parsed.data.user_id,
				p_run_id: parsed.data.run_id,
				p_connection_scope_id: parsed.data.connection_scope_id,
				p_expected_checkpoint: parsed.data.expected_checkpoint,
				p_processing_token_hash: hashProcessingToken(
					parsed.data.connection_scope_id,
					parsed.data.processing_token
				),
				p_operation_id: parsed.data.operation_id,
				p_result: parsed.data.settlement.result,
				p_actual_gmail_quota_units: parsed.data.settlement.actual_gmail_quota_units,
				p_actual_runtime_ms: parsed.data.settlement.actual_runtime_ms,
				p_error_code: parsed.data.settlement.error_code
			},
			SETTLE_RESULT_SCHEMA
		);
	}

	async controlRun(input: {
		user_id: string;
		run_id: string;
		action: EmailRelevanceScanControlAction;
	}): Promise<EmailRelevanceScanRunState> {
		this.assertAllowed(input.user_id);
		const parsed = z
			.object({
				user_id: UUID_SCHEMA,
				run_id: UUID_SCHEMA,
				action: z.enum(['pause', 'resume', 'cancel'])
			})
			.strict()
			.safeParse(input);
		if (!parsed.success) throw new EmailRelevanceScanControlPlaneError('invalid_manifest');
		return this.rpc(
			'control_email_relevance_scan_run',
			{
				p_user_id: parsed.data.user_id,
				p_run_id: parsed.data.run_id,
				p_action: parsed.data.action
			},
			RUN_STATE_SCHEMA
		);
	}

	async expireRun(input: {
		user_id: string;
		run_id: string;
	}): Promise<EmailRelevanceScanRunState> {
		this.assertAllowed(input.user_id);
		const parsed = z
			.object({ user_id: UUID_SCHEMA, run_id: UUID_SCHEMA })
			.strict()
			.safeParse(input);
		if (!parsed.success) throw new EmailRelevanceScanControlPlaneError('invalid_manifest');
		return this.rpc(
			'expire_email_relevance_scan_run',
			{ p_user_id: parsed.data.user_id, p_run_id: parsed.data.run_id },
			RUN_STATE_SCHEMA
		);
	}
}
