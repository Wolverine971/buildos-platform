// apps/worker/src/workers/agent-run/agentRunCostLedger.ts
//
// Narrow worker adapter for the SECURITY DEFINER Agent Run cost-ledger RPCs.
// The database remains authoritative for root/leaf budget checks and attempt
// idempotency; callers must reserve before provider dispatch.

import type { Json } from '@buildos/shared-types';
import { supabase } from '../../lib/supabase';

export type AgentRunCostEntryStatus =
	| 'reserved'
	| 'settled'
	| 'released'
	| 'reconciliation_required';

export type AgentRunCostLedgerErrorCode =
	| 'budget_exceeded'
	| 'duplicate_attempt'
	| 'idempotency_conflict'
	| 'invalid_run_state'
	| 'reservation_not_found'
	| 'terminal_conflict'
	| 'lease_conflict'
	| 'rpc_error';

export class AgentRunCostLedgerError extends Error {
	constructor(
		message: string,
		readonly code: AgentRunCostLedgerErrorCode
	) {
		super(message);
		this.name = 'AgentRunCostLedgerError';
	}
}

export interface AgentRunCostEntry {
	id: string;
	root_run_id: string;
	leaf_run_id: string;
	attempt_key: string;
	provider: string;
	operation: string;
	resource: string;
	status: AgentRunCostEntryStatus;
	reserved_units: number | null;
	actual_units: number | null;
	unit_type: string | null;
	reserved_cost_usd: number;
	actual_cost_usd: number | null;
	provider_request_id: string | null;
	metadata: Record<string, unknown>;
	reconciliation_attempts: number;
	reconciliation_locked_at: string | null;
	reconciliation_lock_expires_at: string | null;
	reconciliation_lock_token: string | null;
	reconciliation_completed_token: string | null;
	reconciliation_next_attempt_at: string | null;
	reconciliation_last_error: string | null;
	reconciliation_needs_operator_at: string | null;
	idempotent: boolean;
}

interface RpcError {
	message: string;
}

interface AgentRunCostRpcClient {
	rpc(
		functionName: string,
		args: Record<string, unknown>
	): PromiseLike<{ data: unknown; error: RpcError | null }>;
}

export interface ReserveAgentRunCostParams {
	leafRunId: string;
	attemptKey: string;
	provider: string;
	operation: string;
	resource: string;
	reservedCostUsd: number;
	reservedUnits?: number;
	unitType?: string;
	metadata?: Record<string, unknown>;
	/**
	 * Provider dispatchers should reject an already-existing logical attempt.
	 * Reusing its reservation could pay for a duplicate provider request.
	 */
	requireNewAttempt?: boolean;
}

export interface SettleAgentRunCostParams {
	leafRunId: string;
	attemptKey: string;
	status: Exclude<AgentRunCostEntryStatus, 'reserved'>;
	actualCostUsd?: number;
	actualUnits?: number;
	providerRequestId?: string;
	metadata?: Record<string, unknown>;
	/** Reserved for explicit reconciliation tooling, never normal dispatch. */
	allowOverrun?: boolean;
}

export interface ClaimAgentRunCostReconciliationParams {
	staleBefore: Date;
	limit?: number;
	leaseSeconds?: number;
	maxAttempts?: number;
}

export interface ReleaseAgentRunCostReconciliationParams {
	entryId: string;
	lockToken: string;
	error: string;
	retryable: boolean;
	retryAfter?: Date;
}

export interface ReconcileAgentRunCostParams {
	entryId: string;
	lockToken: string;
	actualCostUsd: number;
	actualUnits?: number;
	providerRequestId?: string;
	metadata?: Record<string, unknown>;
}

function errorCode(message: string): AgentRunCostLedgerErrorCode {
	if (message.includes('AGENT_RUN_COST_BUDGET_EXCEEDED')) return 'budget_exceeded';
	if (message.includes('AGENT_RUN_COST_IDEMPOTENCY_CONFLICT')) return 'idempotency_conflict';
	if (
		message.includes('AGENT_RUN_COST_INVALID_RUN_STATE') ||
		message.includes('AGENT_RUN_COST_BUDGET_REQUIRED') ||
		message.includes('AGENT_RUN_COST_LEAF_NOT_FOUND') ||
		message.includes('AGENT_RUN_COST_ROOT_NOT_FOUND')
	) {
		return 'invalid_run_state';
	}
	if (message.includes('AGENT_RUN_COST_RESERVATION_NOT_FOUND')) return 'reservation_not_found';
	if (
		message.includes('AGENT_RUN_COST_TERMINAL_CONFLICT') ||
		message.includes('AGENT_RUN_COST_PROVIDER_REQUEST_CONFLICT')
	) {
		return 'terminal_conflict';
	}
	if (message.includes('AGENT_RUN_COST_RECONCILIATION_LEASE_CONFLICT')) {
		return 'lease_conflict';
	}
	return 'rpc_error';
}

function finiteNumber(value: unknown): number | null {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string' && value.trim()) {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : null;
	}
	return null;
}

function parseEntry(value: unknown): AgentRunCostEntry {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new AgentRunCostLedgerError('Cost ledger returned an invalid entry.', 'rpc_error');
	}
	const row = value as Record<string, unknown>;
	const reservedCostUsd = finiteNumber(row.reserved_cost_usd);
	const actualCostUsd = row.actual_cost_usd === null ? null : finiteNumber(row.actual_cost_usd);
	const reservedUnits = row.reserved_units === null ? null : finiteNumber(row.reserved_units);
	const actualUnits = row.actual_units === null ? null : finiteNumber(row.actual_units);
	const reconciliationAttempts =
		row.reconciliation_attempts === undefined ? 0 : finiteNumber(row.reconciliation_attempts);
	const status = row.status;
	if (
		typeof row.id !== 'string' ||
		typeof row.root_run_id !== 'string' ||
		typeof row.leaf_run_id !== 'string' ||
		typeof row.attempt_key !== 'string' ||
		typeof row.provider !== 'string' ||
		typeof row.operation !== 'string' ||
		typeof row.resource !== 'string' ||
		!['reserved', 'settled', 'released', 'reconciliation_required'].includes(
			typeof status === 'string' ? status : ''
		) ||
		reservedCostUsd === null ||
		(row.actual_cost_usd !== null && actualCostUsd === null) ||
		(row.reserved_units !== null && reservedUnits === null) ||
		(row.actual_units !== null && actualUnits === null) ||
		reconciliationAttempts === null ||
		!Number.isInteger(reconciliationAttempts) ||
		reconciliationAttempts < 0
	) {
		throw new AgentRunCostLedgerError('Cost ledger returned a malformed entry.', 'rpc_error');
	}
	return {
		id: row.id,
		root_run_id: row.root_run_id,
		leaf_run_id: row.leaf_run_id,
		attempt_key: row.attempt_key,
		provider: row.provider,
		operation: row.operation,
		resource: row.resource,
		status: status as AgentRunCostEntryStatus,
		reserved_units: reservedUnits,
		actual_units: actualUnits,
		unit_type: typeof row.unit_type === 'string' ? row.unit_type : null,
		reserved_cost_usd: reservedCostUsd,
		actual_cost_usd: actualCostUsd,
		provider_request_id:
			typeof row.provider_request_id === 'string' ? row.provider_request_id : null,
		metadata:
			row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
				? (row.metadata as Record<string, unknown>)
				: {},
		reconciliation_attempts: reconciliationAttempts,
		reconciliation_locked_at:
			typeof row.reconciliation_locked_at === 'string' ? row.reconciliation_locked_at : null,
		reconciliation_lock_expires_at:
			typeof row.reconciliation_lock_expires_at === 'string'
				? row.reconciliation_lock_expires_at
				: null,
		reconciliation_lock_token:
			typeof row.reconciliation_lock_token === 'string'
				? row.reconciliation_lock_token
				: null,
		reconciliation_completed_token:
			typeof row.reconciliation_completed_token === 'string'
				? row.reconciliation_completed_token
				: null,
		reconciliation_next_attempt_at:
			typeof row.reconciliation_next_attempt_at === 'string'
				? row.reconciliation_next_attempt_at
				: null,
		reconciliation_last_error:
			typeof row.reconciliation_last_error === 'string'
				? row.reconciliation_last_error
				: null,
		reconciliation_needs_operator_at:
			typeof row.reconciliation_needs_operator_at === 'string'
				? row.reconciliation_needs_operator_at
				: null,
		idempotent: row.idempotent === true
	};
}

function rpcFailure(error: RpcError | null): never | void {
	if (error) {
		throw new AgentRunCostLedgerError(error.message, errorCode(error.message));
	}
}

function rpcClient(client?: AgentRunCostRpcClient): AgentRunCostRpcClient {
	return client ?? (supabase as unknown as AgentRunCostRpcClient);
}

export async function reserveAgentRunCost(
	params: ReserveAgentRunCostParams,
	client?: AgentRunCostRpcClient
): Promise<AgentRunCostEntry> {
	const { data, error } = await rpcClient(client).rpc('reserve_agent_run_cost', {
		p_leaf_run_id: params.leafRunId,
		p_attempt_key: params.attemptKey,
		p_provider: params.provider,
		p_operation: params.operation,
		p_resource: params.resource,
		p_reserved_cost_usd: params.reservedCostUsd,
		p_reserved_units: params.reservedUnits ?? null,
		p_unit_type: params.unitType ?? null,
		p_metadata: (params.metadata ?? {}) as Json
	});
	rpcFailure(error);
	const entry = parseEntry(data);
	if (params.requireNewAttempt && entry.idempotent) {
		throw new AgentRunCostLedgerError(
			`Cost attempt ${params.attemptKey} already exists with status ${entry.status}.`,
			'duplicate_attempt'
		);
	}
	return entry;
}

export async function settleAgentRunCost(
	params: SettleAgentRunCostParams,
	client?: AgentRunCostRpcClient
): Promise<AgentRunCostEntry> {
	const { data, error } = await rpcClient(client).rpc('settle_agent_run_cost', {
		p_leaf_run_id: params.leafRunId,
		p_attempt_key: params.attemptKey,
		p_terminal_status: params.status,
		p_actual_cost_usd: params.actualCostUsd ?? null,
		p_actual_units: params.actualUnits ?? null,
		p_provider_request_id: params.providerRequestId ?? null,
		p_metadata: (params.metadata ?? {}) as Json,
		p_allow_overrun: params.allowOverrun ?? false
	});
	rpcFailure(error);
	return parseEntry(data);
}

export async function claimAgentRunCostReconciliations(
	params: ClaimAgentRunCostReconciliationParams,
	client?: AgentRunCostRpcClient
): Promise<AgentRunCostEntry[]> {
	const { data, error } = await rpcClient(client).rpc('claim_agent_run_cost_reconciliation', {
		p_stale_before: params.staleBefore.toISOString(),
		p_limit: params.limit ?? 20,
		p_lease_seconds: params.leaseSeconds ?? 120,
		p_max_attempts: params.maxAttempts ?? 8
	});
	rpcFailure(error);
	if (!Array.isArray(data)) {
		throw new AgentRunCostLedgerError(
			'Cost reconciliation claim returned an invalid result.',
			'rpc_error'
		);
	}
	return data.map(parseEntry);
}

export async function releaseAgentRunCostReconciliation(
	params: ReleaseAgentRunCostReconciliationParams,
	client?: AgentRunCostRpcClient
): Promise<AgentRunCostEntry> {
	const { data, error } = await rpcClient(client).rpc('release_agent_run_cost_reconciliation', {
		p_entry_id: params.entryId,
		p_lock_token: params.lockToken,
		p_error: params.error,
		p_retryable: params.retryable,
		p_retry_after: params.retryAfter?.toISOString() ?? null
	});
	rpcFailure(error);
	return parseEntry(data);
}

export async function reconcileAgentRunCost(
	params: ReconcileAgentRunCostParams,
	client?: AgentRunCostRpcClient
): Promise<AgentRunCostEntry> {
	const { data, error } = await rpcClient(client).rpc('reconcile_agent_run_cost', {
		p_entry_id: params.entryId,
		p_lock_token: params.lockToken,
		p_actual_cost_usd: params.actualCostUsd,
		p_actual_units: params.actualUnits ?? null,
		p_provider_request_id: params.providerRequestId ?? null,
		p_metadata: (params.metadata ?? {}) as Json
	});
	rpcFailure(error);
	return parseEntry(data);
}
