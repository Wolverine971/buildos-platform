// apps/worker/src/workers/agent-run/agentRunCostReport.ts
//
// Read-only operator reporting for unresolved Agent Run cost exposure.
// This deliberately does not settle, release, or claim rows.

import { supabase } from '../../lib/supabase';

const REPORT_COLUMNS = [
	'id',
	'root_run_id',
	'leaf_run_id',
	'attempt_key',
	'provider',
	'operation',
	'resource',
	'status',
	'reserved_cost_usd',
	'actual_cost_usd',
	'provider_request_id',
	'reserved_at',
	'updated_at',
	'reconciliation_attempts',
	'reconciliation_lock_expires_at',
	'reconciliation_next_attempt_at',
	'reconciliation_last_error',
	'reconciliation_needs_operator_at'
].join(',');

export type AgentRunCostReportDisposition =
	| 'operator_marked'
	| 'operator_missing_request_id'
	| 'operator_unsupported_provider'
	| 'automatic_retry_due'
	| 'automatic_retry_scheduled'
	| 'lease_in_flight';

export interface AgentRunCostReportRow {
	id: string;
	rootRunId: string;
	leafRunId: string;
	attemptKey: string;
	provider: string;
	operation: string;
	resource: string;
	status: 'reserved' | 'reconciliation_required';
	reservedCostUsd: number;
	actualCostUsd: number | null;
	exposureUsd: number;
	hasProviderRequestId: boolean;
	reservedAt: string;
	updatedAt: string;
	reconciliationAttempts: number;
	reconciliationLockExpiresAt: string | null;
	reconciliationNextAttemptAt: string | null;
	reconciliationLastError: string | null;
	reconciliationNeedsOperatorAt: string | null;
	disposition: AgentRunCostReportDisposition;
}

export interface AgentRunCostProviderSummary {
	provider: string;
	count: number;
	exposureUsd: number;
	operatorRequired: number;
}

export interface AgentRunCostReconciliationReport {
	generatedAt: string;
	cutoff: string;
	totalMatchingRows: number;
	returnedRows: number;
	truncated: boolean;
	invalidRows: number;
	totalExposureUsd: number;
	operatorRequiredCount: number;
	automaticRetryCount: number;
	leaseInFlightCount: number;
	oldestReservedAt: string | null;
	providers: AgentRunCostProviderSummary[];
	rows: AgentRunCostReportRow[];
}

interface ReportQueryResult {
	data: unknown[] | null;
	error: { message: string } | null;
	count: number | null;
}

interface ReportQuery {
	select(columns: string, options: { count: 'exact' }): ReportQuery;
	in(column: string, values: string[]): ReportQuery;
	lte(column: string, value: string): ReportQuery;
	order(column: string, options: { ascending: boolean }): ReportQuery;
	limit(value: number): PromiseLike<ReportQueryResult>;
}

interface ReportClient {
	from(table: string): ReportQuery;
}

export interface LoadAgentRunCostReportOptions {
	now?: Date;
	minAgeMinutes?: number;
	limit?: number;
	client?: ReportClient;
}

function finiteNonNegative(value: unknown): number | null {
	const parsed =
		typeof value === 'number'
			? value
			: typeof value === 'string' && value.trim()
				? Number(value)
				: Number.NaN;
	return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function text(value: unknown): string | null {
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isoTimestamp(value: unknown): string | null {
	const raw = text(value);
	if (!raw) return null;
	const timestamp = Date.parse(raw);
	return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function boundedInteger(value: number | undefined, fallback: number, min: number, max: number) {
	return typeof value === 'number' && Number.isInteger(value)
		? Math.min(Math.max(value, min), max)
		: fallback;
}

function disposition(
	row: Omit<AgentRunCostReportRow, 'disposition'>,
	now: Date
): AgentRunCostReportDisposition {
	if (row.reconciliationNeedsOperatorAt) return 'operator_marked';
	if (row.provider !== 'openrouter') return 'operator_unsupported_provider';
	if (!row.hasProviderRequestId) return 'operator_missing_request_id';
	if (
		row.reconciliationLockExpiresAt &&
		Date.parse(row.reconciliationLockExpiresAt) > now.getTime()
	) {
		return 'lease_in_flight';
	}
	if (
		row.reconciliationNextAttemptAt &&
		Date.parse(row.reconciliationNextAttemptAt) > now.getTime()
	) {
		return 'automatic_retry_scheduled';
	}
	return 'automatic_retry_due';
}

function parseRow(value: unknown, now: Date): AgentRunCostReportRow | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const row = value as Record<string, unknown>;
	const id = text(row.id);
	const rootRunId = text(row.root_run_id);
	const leafRunId = text(row.leaf_run_id);
	const attemptKey = text(row.attempt_key);
	const provider = text(row.provider);
	const operation = text(row.operation);
	const resource = text(row.resource);
	const status =
		row.status === 'reserved' || row.status === 'reconciliation_required' ? row.status : null;
	const reservedCostUsd = finiteNonNegative(row.reserved_cost_usd);
	const actualCostUsd =
		row.actual_cost_usd === null ? null : finiteNonNegative(row.actual_cost_usd);
	const reservedAt = isoTimestamp(row.reserved_at);
	const updatedAt = isoTimestamp(row.updated_at);
	const reconciliationAttempts = finiteNonNegative(row.reconciliation_attempts);
	if (
		!id ||
		!rootRunId ||
		!leafRunId ||
		!attemptKey ||
		!provider ||
		!operation ||
		!resource ||
		!status ||
		reservedCostUsd === null ||
		(row.actual_cost_usd !== null && actualCostUsd === null) ||
		!reservedAt ||
		!updatedAt ||
		reconciliationAttempts === null ||
		!Number.isInteger(reconciliationAttempts)
	) {
		return null;
	}

	const base: Omit<AgentRunCostReportRow, 'disposition'> = {
		id,
		rootRunId,
		leafRunId,
		attemptKey,
		provider,
		operation,
		resource,
		status,
		reservedCostUsd,
		actualCostUsd,
		exposureUsd:
			status === 'reconciliation_required'
				? Math.max(reservedCostUsd, actualCostUsd ?? reservedCostUsd)
				: reservedCostUsd,
		hasProviderRequestId: Boolean(text(row.provider_request_id)),
		reservedAt,
		updatedAt,
		reconciliationAttempts,
		reconciliationLockExpiresAt: isoTimestamp(row.reconciliation_lock_expires_at),
		reconciliationNextAttemptAt: isoTimestamp(row.reconciliation_next_attempt_at),
		reconciliationLastError: text(row.reconciliation_last_error)?.slice(0, 1000) ?? null,
		reconciliationNeedsOperatorAt: isoTimestamp(row.reconciliation_needs_operator_at)
	};
	return { ...base, disposition: disposition(base, now) };
}

export function buildAgentRunCostReconciliationReport(params: {
	values: unknown[];
	now: Date;
	cutoff: Date;
	totalMatchingRows?: number | null;
}): AgentRunCostReconciliationReport {
	const parsed = params.values.flatMap((value) => {
		const row = parseRow(value, params.now);
		return row ? [row] : [];
	});
	const providerMap = new Map<string, AgentRunCostProviderSummary>();
	for (const row of parsed) {
		const summary = providerMap.get(row.provider) ?? {
			provider: row.provider,
			count: 0,
			exposureUsd: 0,
			operatorRequired: 0
		};
		summary.count += 1;
		summary.exposureUsd += row.exposureUsd;
		if (row.disposition.startsWith('operator_')) summary.operatorRequired += 1;
		providerMap.set(row.provider, summary);
	}
	const totalMatchingRows = Math.max(params.totalMatchingRows ?? parsed.length, parsed.length);
	return {
		generatedAt: params.now.toISOString(),
		cutoff: params.cutoff.toISOString(),
		totalMatchingRows,
		returnedRows: parsed.length,
		truncated: totalMatchingRows > params.values.length,
		invalidRows: params.values.length - parsed.length,
		totalExposureUsd: parsed.reduce((total, row) => total + row.exposureUsd, 0),
		operatorRequiredCount: parsed.filter((row) => row.disposition.startsWith('operator_'))
			.length,
		automaticRetryCount: parsed.filter((row) => row.disposition.startsWith('automatic_retry_'))
			.length,
		leaseInFlightCount: parsed.filter((row) => row.disposition === 'lease_in_flight').length,
		oldestReservedAt: parsed[0]?.reservedAt ?? null,
		providers: Array.from(providerMap.values()).sort(
			(left, right) => right.exposureUsd - left.exposureUsd
		),
		rows: parsed
	};
}

export async function loadAgentRunCostReconciliationReport(
	options: LoadAgentRunCostReportOptions = {}
): Promise<AgentRunCostReconciliationReport> {
	const now = options.now ?? new Date();
	const minAgeMinutes = boundedInteger(options.minAgeMinutes, 10, 1, 7 * 24 * 60);
	const limit = boundedInteger(options.limit, 200, 1, 1000);
	const cutoff = new Date(now.getTime() - minAgeMinutes * 60_000);
	const client = options.client ?? (supabase as unknown as ReportClient);
	const { data, error, count } = await client
		.from('agent_run_cost_entries')
		.select(REPORT_COLUMNS, { count: 'exact' })
		.in('status', ['reserved', 'reconciliation_required'])
		.lte('reserved_at', cutoff.toISOString())
		.order('reserved_at', { ascending: true })
		.limit(limit);
	if (error) {
		throw new Error(`Failed to load Agent Run cost reconciliation report: ${error.message}`);
	}
	return buildAgentRunCostReconciliationReport({
		values: data ?? [],
		now,
		cutoff,
		totalMatchingRows: count
	});
}
