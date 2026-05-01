// apps/web/src/lib/server/agent-call/caller-provisioning.service.ts
import { randomBytes } from 'crypto';
import { isValidUUID } from '@buildos/shared-types';
import type {
	AgentCallSessionRecord,
	BuildosAgentCallerListResponse,
	BuildosAgentCallerProvisionRequest,
	BuildosAgentCallerProvisionResponse,
	BuildosAgentCallerRevokeResponse,
	BuildosAgentCallerSummary,
	BuildosAgentCallerUsageDetailResponse,
	BuildosAgentCallerUsageSummary,
	BuildosAgentOperationBreakdown,
	BuildosAgentProjectBreakdown,
	BuildosAgentSecurityEventSummary,
	BuildosAgentUsageRangeKey,
	BuildosAgentUsageSession,
	BuildosAgentUsageTimeBucket,
	BuildosAgentUsageTotals,
	BuildosAgentUsageAction,
	BuildosAgentUsageEvent,
	BuildosAgentUsagePeriod,
	BuildosAgentUsageTrend,
	ExternalAgentCallerRecord
} from '@buildos/shared-types';
import {
	ensureActorId,
	fetchProjectSummaries
} from '$lib/services/ontology/ontology-projects.service';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import {
	buildCallerPolicy,
	defaultAllowedOpsForMode,
	extractAllowedOpsFromPolicy,
	extractScopeModeFromPolicy,
	isWriteOp,
	normalizeAllowedOps,
	normalizeScopeMode
} from './agent-call-policy';
import { AgentCallBootstrapLinkService } from './bootstrap-link.service';
import { ensureUserBuildosAgent } from './callee-resolution';
import { hashAgentCallerToken } from './caller-auth';
import { logSecurityEvent, type SecurityEventLogOptions } from '$lib/server/security-event-logger';

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validateStringField(value: unknown, fieldName: string, maxLength: number): string {
	if (typeof value !== 'string') {
		throw new CallerProvisioningError(`${fieldName} must be a string`, 400);
	}

	const normalized = value.trim();
	if (!normalized) {
		throw new CallerProvisioningError(`${fieldName} is required`, 400);
	}

	if (normalized.length > maxLength) {
		throw new CallerProvisioningError(
			`${fieldName} must be ${maxLength} characters or fewer`,
			400
		);
	}

	return normalized;
}

function normalizeProviderField(value: unknown): string {
	const normalized = validateStringField(value, 'provider', 64).toLowerCase();

	if (!/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/.test(normalized)) {
		throw new CallerProvisioningError(
			'provider must use lowercase letters, numbers, hyphens, or underscores',
			400
		);
	}

	return normalized;
}

function normalizeMetadata(value: unknown): Record<string, unknown> {
	if (value === undefined) {
		return {};
	}

	if (!isRecord(value)) {
		throw new CallerProvisioningError('metadata must be an object', 400);
	}

	return value;
}

function normalizeAllowedProjectIds(value: unknown): string[] | undefined {
	if (value === undefined) {
		return undefined;
	}

	if (!Array.isArray(value)) {
		throw new CallerProvisioningError('allowed_project_ids must be an array of UUIDs', 400);
	}

	const ids: string[] = [];
	const seen = new Set<string>();

	for (const item of value) {
		if (typeof item !== 'string' || !isValidUUID(item)) {
			throw new CallerProvisioningError('allowed_project_ids must contain valid UUIDs', 400);
		}

		if (seen.has(item)) {
			continue;
		}

		seen.add(item);
		ids.push(item);
	}

	return ids;
}

function parseProvisionRequest(body: unknown): BuildosAgentCallerProvisionRequest {
	if (!isRecord(body)) {
		throw new CallerProvisioningError('Request body must be an object', 400);
	}

	let scopeMode: BuildosAgentCallerProvisionRequest['scope_mode'];
	let allowedOps: BuildosAgentCallerProvisionRequest['allowed_ops'];

	try {
		scopeMode = normalizeScopeMode(body.scope_mode, 'scope_mode');
		allowedOps = normalizeAllowedOps(body.allowed_ops, 'allowed_ops', scopeMode);
	} catch (error) {
		throw new CallerProvisioningError(
			error instanceof Error ? error.message : 'Invalid caller permissions',
			400
		);
	}

	return {
		provider: normalizeProviderField(body.provider),
		caller_key: validateStringField(body.caller_key, 'caller_key', 255),
		scope_mode: scopeMode,
		allowed_ops: allowedOps,
		allowed_project_ids: normalizeAllowedProjectIds(body.allowed_project_ids),
		metadata: normalizeMetadata(body.metadata)
	};
}

function generateBearerToken(): { token: string; tokenPrefix: string } {
	const tokenBody = randomBytes(24).toString('base64url');
	const token = `boca_${tokenBody}`;
	return {
		token,
		tokenPrefix: token.slice(0, 12)
	};
}

function mapCallerSummary(
	record: ExternalAgentCallerRecord,
	visibleProjectIds?: Set<string>,
	usage?: BuildosAgentCallerUsageSummary
): BuildosAgentCallerSummary {
	const scopeMode = extractScopeModeFromPolicy(record.policy);
	const allowedOps = extractAllowedOpsFromPolicy(record.policy, scopeMode);
	const storedAllowedProjectIds = Array.isArray(record.policy?.allowed_project_ids)
		? record.policy.allowed_project_ids.filter(
				(value): value is string => typeof value === 'string'
			)
		: undefined;
	const allowedProjectIds =
		storedAllowedProjectIds && visibleProjectIds
			? storedAllowedProjectIds.filter((projectId) => visibleProjectIds.has(projectId))
			: storedAllowedProjectIds;
	const unavailableProjectCount =
		storedAllowedProjectIds && visibleProjectIds
			? storedAllowedProjectIds.length - (allowedProjectIds?.length ?? 0)
			: 0;

	return {
		id: record.id,
		provider: record.provider,
		caller_key: record.caller_key,
		status: record.status,
		token_prefix: record.token_prefix,
		scope_mode: scopeMode,
		allowed_ops: allowedOps,
		allowed_project_ids: allowedProjectIds,
		...(unavailableProjectCount > 0
			? { unavailable_project_count: unavailableProjectCount }
			: {}),
		metadata: record.metadata ?? {},
		last_used_at: record.last_used_at,
		created_at: record.created_at,
		updated_at: record.updated_at,
		...(usage ? { usage } : {})
	};
}

type AgentCallToolExecutionUsageRow = {
	id: string;
	agent_call_session_id: string;
	external_agent_caller_id: string;
	user_id: string;
	op: string;
	status: 'pending' | 'succeeded' | 'failed';
	args: Record<string, unknown>;
	response_payload: Record<string, unknown> | null;
	error_payload: Record<string, unknown> | null;
	entity_kind: string | null;
	entity_id: string | null;
	started_at: string;
	completed_at: string | null;
	created_at: string;
	updated_at: string;
};

type UsageAccumulator = {
	callerId: string;
	lastActivityAt: string | null;
	lastWriteAt: string | null;
	totalSessionCount: number;
	totalToolCallCount: number;
	totalWriteCount: number;
	successfulToolCallCount: number;
	failedToolCallCount: number;
	successfulWriteCount: number;
	failedWriteCount: number;
	projectIds: Set<string>;
	recentActivity: BuildosAgentUsageEvent[];
	trends: Map<BuildosAgentUsagePeriod, BuildosAgentUsageTrend & { projectIds: Set<string> }>;
};

const USAGE_PERIODS: Array<{ period: BuildosAgentUsagePeriod; ms: number }> = [
	{ period: 'day', ms: 24 * 60 * 60 * 1000 },
	{ period: 'week', ms: 7 * 24 * 60 * 60 * 1000 },
	{ period: 'month', ms: 30 * 24 * 60 * 60 * 1000 }
];

function createUsageAccumulator(caller: ExternalAgentCallerRecord): UsageAccumulator {
	return {
		callerId: caller.id,
		lastActivityAt: caller.last_used_at,
		lastWriteAt: null,
		totalSessionCount: 0,
		totalToolCallCount: 0,
		totalWriteCount: 0,
		successfulToolCallCount: 0,
		failedToolCallCount: 0,
		successfulWriteCount: 0,
		failedWriteCount: 0,
		projectIds: new Set<string>(),
		recentActivity: [],
		trends: new Map(
			USAGE_PERIODS.map(({ period }) => [
				period,
				{
					period,
					session_count: 0,
					tool_call_count: 0,
					write_count: 0,
					successful_tool_call_count: 0,
					failed_tool_call_count: 0,
					successful_write_count: 0,
					failed_write_count: 0,
					project_count: 0,
					projectIds: new Set<string>()
				}
			])
		)
	};
}

function finalizeUsageAccumulator(accumulator: UsageAccumulator): BuildosAgentCallerUsageSummary {
	return {
		last_activity_at: accumulator.lastActivityAt,
		last_write_at: accumulator.lastWriteAt,
		total_session_count: accumulator.totalSessionCount,
		total_tool_call_count: accumulator.totalToolCallCount,
		total_write_count: accumulator.totalWriteCount,
		successful_tool_call_count: accumulator.successfulToolCallCount,
		failed_tool_call_count: accumulator.failedToolCallCount,
		successful_write_count: accumulator.successfulWriteCount,
		failed_write_count: accumulator.failedWriteCount,
		project_count: accumulator.projectIds.size,
		trends: USAGE_PERIODS.map(({ period }) => {
			const trend = accumulator.trends.get(period);
			return {
				period,
				session_count: trend?.session_count ?? 0,
				tool_call_count: trend?.tool_call_count ?? 0,
				write_count: trend?.write_count ?? 0,
				successful_tool_call_count: trend?.successful_tool_call_count ?? 0,
				failed_tool_call_count: trend?.failed_tool_call_count ?? 0,
				successful_write_count: trend?.successful_write_count ?? 0,
				failed_write_count: trend?.failed_write_count ?? 0,
				project_count: trend?.projectIds.size ?? 0
			};
		}),
		recent_activity: accumulator.recentActivity
			.sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at))
			.slice(0, 5)
	};
}

function touchTimestamp(
	current: string | null,
	candidate: string | null | undefined
): string | null {
	if (!candidate) return current;
	if (!current) return candidate;
	return Date.parse(candidate) > Date.parse(current) ? candidate : current;
}

function asRecord(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return null;
	}
	return value as Record<string, unknown>;
}

function asText(value: unknown): string | null {
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function truncateSummaryText(value: string, maxLength = 80): string {
	return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}...`;
}

function entityKindFromOp(op: string): string | null {
	const parts = op.split('.');
	if (parts[0] === 'onto' && parts[1]) return parts[1];
	if (parts[0] === 'cal' && parts[1] === 'event') return 'event';
	if (parts[0] === 'cal' && parts[1] === 'project') return 'calendar';
	return null;
}

function actionFromExecution(execution: AgentCallToolExecutionUsageRow): BuildosAgentUsageAction {
	if (execution.status !== 'succeeded') return 'attempted';
	if (execution.op.endsWith('.create')) return 'created';
	if (execution.op.endsWith('.update') || execution.op.endsWith('.set')) return 'updated';
	if (execution.op.endsWith('.delete')) return 'deleted';
	return 'used';
}

function actionVerbForAttempt(op: string): string {
	if (op.endsWith('.create')) return 'create';
	if (op.endsWith('.update') || op.endsWith('.set')) return 'update';
	if (op.endsWith('.delete')) return 'delete';
	return 'use';
}

function displayEntityKind(kind: string | null): string {
	if (!kind) return 'item';
	if (kind === 'calendar') return 'project calendar';
	return kind.replace(/_/g, ' ');
}

function extractExecutionResult(
	execution: AgentCallToolExecutionUsageRow
): Record<string, unknown> {
	const responsePayload = asRecord(execution.response_payload);
	const result = asRecord(responsePayload?.result);
	return result ?? {};
}

function extractEntityRecord(params: {
	execution: AgentCallToolExecutionUsageRow;
	entityKind: string | null;
	result: Record<string, unknown>;
}): Record<string, unknown> | null {
	const candidates = [
		params.entityKind,
		'task',
		'document',
		'project',
		'goal',
		'plan',
		'milestone',
		'risk',
		'event',
		'calendar'
	].filter((value): value is string => Boolean(value));

	for (const key of candidates) {
		const record = asRecord(params.result[key]);
		if (record) return record;
	}

	return null;
}

function extractErrorMessage(execution: AgentCallToolExecutionUsageRow): string | null {
	const errorPayload = asRecord(execution.error_payload);
	const responseError = asRecord(asRecord(execution.response_payload)?.error);
	return (
		asText(errorPayload?.message) ??
		asText(errorPayload?.error) ??
		asText(errorPayload?.code) ??
		asText(responseError?.message) ??
		null
	);
}

function extractProjectMeta(params: {
	args: Record<string, unknown>;
	result: Record<string, unknown>;
	entity: Record<string, unknown> | null;
	projectNameById: Map<string, string>;
}): { projectId: string | null; projectName: string | null } {
	const projectRecord = asRecord(params.result.project);
	const projectId =
		asText(params.entity?.project_id) ??
		asText(projectRecord?.id) ??
		asText(params.result.project_id) ??
		asText(params.args.project_id) ??
		asText(params.args.projectId) ??
		null;
	const projectName =
		asText(params.entity?.project_name) ??
		asText(projectRecord?.name) ??
		asText(params.result.project_name) ??
		(projectId ? (params.projectNameById.get(projectId) ?? null) : null);

	return { projectId, projectName };
}

function buildUsageEvent(
	execution: AgentCallToolExecutionUsageRow,
	projectNameById: Map<string, string>
): BuildosAgentUsageEvent {
	const result = extractExecutionResult(execution);
	const entityKind = execution.entity_kind ?? entityKindFromOp(execution.op);
	const entity = extractEntityRecord({ execution, entityKind, result });
	const entityTitle =
		asText(entity?.title) ??
		asText(entity?.name) ??
		asText(result.title) ??
		asText(execution.args?.title) ??
		asText(execution.args?.name) ??
		null;
	const entityId = execution.entity_id ?? asText(entity?.id);
	const { projectId, projectName } = extractProjectMeta({
		args: execution.args ?? {},
		result,
		entity,
		projectNameById
	});
	const action = actionFromExecution(execution);
	const kindLabel = displayEntityKind(entityKind);
	const titleSuffix = entityTitle ? ` "${truncateSummaryText(entityTitle, 72)}"` : '';
	const projectSuffix = projectName ? ` in ${projectName}` : '';
	const errorMessage = extractErrorMessage(execution);
	const summary =
		action === 'attempted'
			? `Tried to ${actionVerbForAttempt(execution.op)} ${kindLabel}${titleSuffix}${projectSuffix}${errorMessage ? `: ${errorMessage}` : ''}`
			: `${action.charAt(0).toUpperCase()}${action.slice(1)} ${kindLabel}${titleSuffix}${projectSuffix}`;

	return {
		id: execution.id,
		occurred_at: execution.completed_at ?? execution.created_at,
		op: execution.op,
		action,
		status: execution.status,
		summary,
		project_id: projectId,
		project_name: projectName,
		entity_kind: entityKind,
		entity_id: entityId,
		entity_title: entityTitle,
		error_message: errorMessage
	};
}

function addSessionToUsage(
	accumulator: UsageAccumulator,
	session: Pick<AgentCallSessionRecord, 'started_at' | 'updated_at'>
): void {
	const timestamp = session.started_at;
	const timestampMs = Date.parse(timestamp);
	const now = Date.now();
	accumulator.totalSessionCount += 1;
	accumulator.lastActivityAt = touchTimestamp(
		accumulator.lastActivityAt,
		session.updated_at ?? timestamp
	);

	for (const { period, ms } of USAGE_PERIODS) {
		if (Number.isNaN(timestampMs) || now - timestampMs > ms) continue;
		const trend = accumulator.trends.get(period);
		if (trend) {
			trend.session_count += 1;
		}
	}
}

function addExecutionToUsage(
	accumulator: UsageAccumulator,
	execution: AgentCallToolExecutionUsageRow,
	projectNameById: Map<string, string>
): void {
	const event = buildUsageEvent(execution, projectNameById);
	const timestampMs = Date.parse(event.occurred_at);
	const now = Date.now();
	const isWriteExecution = isWriteOp(execution.op);

	accumulator.totalToolCallCount += 1;
	accumulator.lastActivityAt = touchTimestamp(accumulator.lastActivityAt, event.occurred_at);

	if (event.status === 'succeeded') {
		accumulator.successfulToolCallCount += 1;
	} else if (event.status === 'failed') {
		accumulator.failedToolCallCount += 1;
	}

	if (isWriteExecution) {
		accumulator.totalWriteCount += 1;
		accumulator.lastWriteAt = touchTimestamp(accumulator.lastWriteAt, event.occurred_at);

		if (event.status === 'succeeded') {
			accumulator.successfulWriteCount += 1;
		} else if (event.status === 'failed') {
			accumulator.failedWriteCount += 1;
		}
	}

	if (event.project_id) {
		accumulator.projectIds.add(event.project_id);
	}

	accumulator.recentActivity.push(event);

	for (const { period, ms } of USAGE_PERIODS) {
		if (Number.isNaN(timestampMs) || now - timestampMs > ms) continue;
		const trend = accumulator.trends.get(period);
		if (!trend) continue;
		trend.tool_call_count = (trend.tool_call_count ?? 0) + 1;
		if (event.status === 'succeeded') {
			trend.successful_tool_call_count = (trend.successful_tool_call_count ?? 0) + 1;
		} else if (event.status === 'failed') {
			trend.failed_tool_call_count = (trend.failed_tool_call_count ?? 0) + 1;
		}

		if (isWriteExecution) {
			trend.write_count += 1;
			if (event.status === 'succeeded') {
				trend.successful_write_count += 1;
			} else if (event.status === 'failed') {
				trend.failed_write_count += 1;
			}
		}
		if (event.project_id) {
			trend.projectIds.add(event.project_id);
		}
	}
}

type AgentCallSessionUsageRow = Pick<
	AgentCallSessionRecord,
	| 'id'
	| 'external_agent_caller_id'
	| 'status'
	| 'requested_scope'
	| 'granted_scope'
	| 'rejection_reason'
	| 'started_at'
	| 'ended_at'
	| 'updated_at'
>;

type SecurityEventUsageRow = {
	id: string;
	created_at: string;
	event_type: string;
	outcome: 'success' | 'failure' | 'blocked' | 'allowed' | 'denied' | 'info';
	severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
	reason: string | null;
	session_id: string | null;
	target_type: string | null;
	target_id: string | null;
	metadata: Record<string, unknown>;
};

const USAGE_RANGE_DAYS: Record<BuildosAgentUsageRangeKey, number> = {
	'7d': 7,
	'30d': 30,
	'90d': 90
};

function normalizeUsageRangeKey(value: unknown): BuildosAgentUsageRangeKey {
	return value === '7d' || value === '90d' ? value : '30d';
}

function dateKeyFor(value: string): string {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return new Date().toISOString().slice(0, 10);
	}
	return date.toISOString().slice(0, 10);
}

function createUsageTimeBuckets(params: {
	startAt: Date;
	days: number;
}): Map<string, BuildosAgentUsageTimeBucket> {
	const buckets = new Map<string, BuildosAgentUsageTimeBucket>();

	for (let index = 0; index < params.days; index += 1) {
		const date = new Date(params.startAt.getTime() + index * 24 * 60 * 60 * 1000);
		const key = date.toISOString().slice(0, 10);
		buckets.set(key, {
			date: key,
			session_count: 0,
			tool_call_count: 0,
			write_count: 0,
			successful_tool_call_count: 0,
			failed_tool_call_count: 0,
			successful_write_count: 0,
			failed_write_count: 0,
			error_count: 0,
			denied_count: 0
		});
	}

	return buckets;
}

function bucketForTimestamp(
	buckets: Map<string, BuildosAgentUsageTimeBucket>,
	timestamp: string
): BuildosAgentUsageTimeBucket | null {
	return buckets.get(dateKeyFor(timestamp)) ?? null;
}

function durationMs(
	start: string | null | undefined,
	end: string | null | undefined
): number | null {
	if (!start || !end) return null;
	const startMs = Date.parse(start);
	const endMs = Date.parse(end);
	if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs < startMs) return null;
	return endMs - startMs;
}

function latencyMs(execution: AgentCallToolExecutionUsageRow): number | null {
	return durationMs(execution.started_at, execution.completed_at);
}

function scopeModeFromScope(value: unknown): BuildosAgentUsageSession['requested_scope_mode'] {
	const record = asRecord(value);
	const mode = record?.mode;
	if (mode === 'read_only' || mode === 'read_write') {
		return mode;
	}
	return null;
}

function isSecurityProblem(event: SecurityEventUsageRow): boolean {
	return (
		event.outcome === 'failure' ||
		event.outcome === 'blocked' ||
		event.outcome === 'denied' ||
		event.severity === 'high' ||
		event.severity === 'critical'
	);
}

function securityEventOp(event: SecurityEventUsageRow): string | null {
	const metadata = asRecord(event.metadata);
	return (
		asText(metadata?.op) ??
		asText(metadata?.canonicalOp) ??
		asText(metadata?.requestedOp) ??
		null
	);
}

function summarizeSecurityEvent(event: SecurityEventUsageRow): BuildosAgentSecurityEventSummary {
	const op = securityEventOp(event);
	const label = event.event_type
		.replace(/^agent\./, '')
		.replace(/\./g, ' ')
		.replace(/_/g, ' ');
	const reason = asText(event.reason);
	const message = [label, op, reason].filter(Boolean).join(' - ');

	return {
		id: event.id,
		created_at: event.created_at,
		event_type: event.event_type,
		outcome: event.outcome,
		severity: event.severity,
		reason: reason ?? null,
		session_id: event.session_id,
		target_type: event.target_type,
		target_id: event.target_id,
		op,
		message
	};
}

function incrementOperationBreakdown(
	breakdown: Map<string, BuildosAgentOperationBreakdown>,
	execution: AgentCallToolExecutionUsageRow
): void {
	const isWriteExecution = isWriteOp(execution.op);
	const current =
		breakdown.get(execution.op) ??
		({
			op: execution.op,
			tool_call_count: 0,
			write_count: 0,
			successful_count: 0,
			failed_count: 0,
			failure_rate: 0,
			last_used_at: null
		} satisfies BuildosAgentOperationBreakdown);

	current.tool_call_count += 1;
	if (isWriteExecution) current.write_count += 1;
	if (execution.status === 'succeeded') current.successful_count += 1;
	if (execution.status === 'failed') current.failed_count += 1;
	current.last_used_at = touchTimestamp(
		current.last_used_at,
		execution.completed_at ?? execution.created_at
	);
	breakdown.set(execution.op, current);
}

function finalizeOperationBreakdown(
	breakdown: Map<string, BuildosAgentOperationBreakdown>
): BuildosAgentOperationBreakdown[] {
	return Array.from(breakdown.values())
		.map((entry) => ({
			...entry,
			failure_rate:
				entry.tool_call_count > 0
					? Math.round((entry.failed_count / entry.tool_call_count) * 1000) / 10
					: 0
		}))
		.sort((a, b) => {
			if (b.tool_call_count !== a.tool_call_count) {
				return b.tool_call_count - a.tool_call_count;
			}
			return Date.parse(b.last_used_at ?? '') - Date.parse(a.last_used_at ?? '');
		});
}

function incrementProjectBreakdown(
	breakdown: Map<string, BuildosAgentProjectBreakdown>,
	event: BuildosAgentUsageEvent
): void {
	const key = event.project_id ?? '__workspace__';
	const current =
		breakdown.get(key) ??
		({
			project_id: event.project_id ?? null,
			project_name: event.project_name ?? (event.project_id ? event.project_id : 'Workspace'),
			tool_call_count: 0,
			write_count: 0,
			successful_count: 0,
			failed_count: 0,
			last_activity_at: null
		} satisfies BuildosAgentProjectBreakdown);

	current.tool_call_count += 1;
	if (isWriteOp(event.op)) current.write_count += 1;
	if (event.status === 'succeeded') current.successful_count += 1;
	if (event.status === 'failed') current.failed_count += 1;
	current.last_activity_at = touchTimestamp(current.last_activity_at, event.occurred_at);
	breakdown.set(key, current);
}

export class CallerProvisioningError extends Error {
	constructor(
		message: string,
		public readonly status = 400,
		public readonly data?: unknown
	) {
		super(message);
		this.name = 'CallerProvisioningError';
	}
}

export class CallerProvisioningService {
	constructor(
		private readonly admin: any = createAdminSupabaseClient(),
		private readonly securityEventOptions: SecurityEventLogOptions = {}
	) {}

	async provisionForUser(
		userId: string,
		body: unknown,
		options?: {
			baseUrl?: string;
		}
	): Promise<BuildosAgentCallerProvisionResponse> {
		const request = parseProvisionRequest(body);
		const buildosAgent = await ensureUserBuildosAgent(this.admin, userId);
		const allowedProjectIds = await this.resolveAllowedProjectIds(
			userId,
			request.allowed_project_ids
		);
		const scopeMode = request.scope_mode ?? 'read_only';
		const allowedOps = request.allowed_ops ?? defaultAllowedOpsForMode(scopeMode);
		const { token, tokenPrefix } = generateBearerToken();
		const tokenHash = hashAgentCallerToken(token);
		const policy = buildCallerPolicy({
			scopeMode,
			allowedProjectIds,
			allowedOps
		});

		const { data, error } = await this.admin
			.from('external_agent_callers')
			.upsert(
				{
					user_id: userId,
					provider: request.provider,
					caller_key: request.caller_key,
					token_prefix: tokenPrefix,
					token_hash: tokenHash,
					status: 'trusted',
					policy,
					metadata: request.metadata ?? {}
				},
				{
					onConflict: 'user_id,provider,caller_key'
				}
			)
			.select('*')
			.single();

		if (error || !data) {
			throw new CallerProvisioningError(
				'Failed to provision external caller',
				500,
				error?.message
			);
		}

		const caller = data as ExternalAgentCallerRecord;
		const bootstrap =
			typeof options?.baseUrl === 'string' && options.baseUrl.trim()
				? await new AgentCallBootstrapLinkService(this.admin).createBootstrap({
						userId,
						baseUrl: options.baseUrl,
						caller,
						bearerToken: token
					})
				: undefined;

		await logSecurityEvent(
			{
				eventType: 'agent.caller.provisioned',
				category: 'agent',
				outcome: 'success',
				severity: 'medium',
				actorType: 'user',
				actorUserId: userId,
				externalAgentCallerId: caller.id,
				targetType: 'external_agent_caller',
				targetId: caller.id,
				metadata: {
					provider: caller.provider,
					callerKey: caller.caller_key,
					scopeMode,
					allowedOpsCount: allowedOps.length,
					projectCount: Array.isArray(allowedProjectIds) ? allowedProjectIds.length : 0,
					bootstrapLinkCreated: Boolean(bootstrap)
				}
			},
			{ ...this.securityEventOptions, supabase: this.admin }
		);

		return {
			buildos_agent: {
				id: buildosAgent.id,
				handle: buildosAgent.agent_handle,
				status: buildosAgent.status
			},
			caller: mapCallerSummary(caller),
			credentials: {
				auth_scheme: 'Bearer',
				bearer_token: token
			},
			bootstrap
		};
	}

	async listForUser(userId: string): Promise<BuildosAgentCallerListResponse> {
		const buildosAgent = await ensureUserBuildosAgent(this.admin, userId);
		const visibleProjects = await this.loadVisibleProjects(userId);
		const visibleProjectIds = new Set(visibleProjects.map((project) => project.id));
		const visibleProjectNames = new Map(
			visibleProjects.map((project) => [project.id, project.name])
		);
		const { data, error } = await this.admin
			.from('external_agent_callers')
			.select('*')
			.eq('user_id', userId)
			.order('updated_at', { ascending: false });

		if (error) {
			throw new CallerProvisioningError(
				'Failed to list external callers',
				500,
				error.message
			);
		}

		const callerRecords = (data ?? []) as ExternalAgentCallerRecord[];
		const usageByCallerId = await this.loadUsageForCallers(
			userId,
			callerRecords,
			visibleProjectNames
		);

		return {
			buildos_agent: {
				id: buildosAgent.id,
				handle: buildosAgent.agent_handle,
				status: buildosAgent.status
			},
			callers: callerRecords.map((caller) =>
				mapCallerSummary(caller, visibleProjectIds, usageByCallerId.get(caller.id))
			),
			available_projects: visibleProjects.map((project) => ({
				id: project.id,
				name: project.name,
				description: project.description ?? null
			}))
		};
	}

	async getUsageDetailForUser(
		userId: string,
		callerId: string,
		options?: {
			range?: unknown;
		}
	): Promise<BuildosAgentCallerUsageDetailResponse> {
		if (!isValidUUID(callerId)) {
			throw new CallerProvisioningError('caller_id must be a valid UUID', 400);
		}

		const rangeKey = normalizeUsageRangeKey(options?.range);
		const days = USAGE_RANGE_DAYS[rangeKey];
		const endAt = new Date();
		const startAt = new Date(endAt.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
		startAt.setUTCHours(0, 0, 0, 0);
		const startIso = startAt.toISOString();
		const endIso = endAt.toISOString();

		const visibleProjects = await this.loadVisibleProjects(userId);
		const visibleProjectIds = new Set(visibleProjects.map((project) => project.id));
		const visibleProjectNames = new Map(
			visibleProjects.map((project) => [project.id, project.name])
		);

		const { data: callerData, error: callerError } = await this.admin
			.from('external_agent_callers')
			.select('*')
			.eq('id', callerId)
			.eq('user_id', userId)
			.maybeSingle();

		if (callerError) {
			throw new CallerProvisioningError(
				'Failed to load external caller',
				500,
				callerError.message
			);
		}

		if (!callerData) {
			throw new CallerProvisioningError('External caller not found', 404);
		}

		const caller = callerData as ExternalAgentCallerRecord;
		const [sessionsResult, executionsResult, securityEventsResult, usageByCallerId] =
			await Promise.all([
				this.admin
					.from('agent_call_sessions')
					.select(
						'id, external_agent_caller_id, status, requested_scope, granted_scope, rejection_reason, started_at, ended_at, updated_at'
					)
					.eq('user_id', userId)
					.eq('external_agent_caller_id', callerId)
					.gte('started_at', startIso)
					.order('started_at', { ascending: false })
					.limit(1000),
				this.admin
					.from('agent_call_tool_executions')
					.select(
						'id, agent_call_session_id, external_agent_caller_id, user_id, op, status, args, response_payload, error_payload, entity_kind, entity_id, started_at, completed_at, created_at, updated_at'
					)
					.eq('user_id', userId)
					.eq('external_agent_caller_id', callerId)
					.gte('created_at', startIso)
					.order('created_at', { ascending: false })
					.limit(2000),
				this.admin
					.from('security_events')
					.select(
						'id, created_at, event_type, outcome, severity, reason, session_id, target_type, target_id, metadata'
					)
					.eq('external_agent_caller_id', callerId)
					.gte('created_at', startIso)
					.order('created_at', { ascending: false })
					.limit(500),
				this.loadUsageForCallers(userId, [caller], visibleProjectNames)
			]);

		if (sessionsResult.error) {
			throw new CallerProvisioningError(
				'Failed to load agent call sessions',
				500,
				sessionsResult.error.message
			);
		}

		if (executionsResult.error) {
			throw new CallerProvisioningError(
				'Failed to load agent tool executions',
				500,
				executionsResult.error.message
			);
		}

		if (securityEventsResult.error) {
			throw new CallerProvisioningError(
				'Failed to load agent security events',
				500,
				securityEventsResult.error.message
			);
		}

		const sessions = (sessionsResult.data ?? []) as AgentCallSessionUsageRow[];
		const executions = (executionsResult.data ?? []) as AgentCallToolExecutionUsageRow[];
		const securityEvents = (securityEventsResult.data ?? []) as SecurityEventUsageRow[];
		const buckets = createUsageTimeBuckets({ startAt, days });
		const operationBreakdown = new Map<string, BuildosAgentOperationBreakdown>();
		const projectBreakdown = new Map<string, BuildosAgentProjectBreakdown>();
		const executionEvents = executions.map((execution) =>
			buildUsageEvent(execution, visibleProjectNames)
		);
		const sessionMetrics = new Map<
			string,
			{ toolCallCount: number; writeCount: number; failedToolCallCount: number }
		>();
		const touchedProjectIds = new Set<string>();
		const sessionDurations: number[] = [];
		const toolLatencies: number[] = [];

		for (const session of sessions) {
			const bucket = bucketForTimestamp(buckets, session.started_at);
			if (bucket) {
				bucket.session_count += 1;
			}

			const sessionDuration = durationMs(session.started_at, session.ended_at);
			if (sessionDuration !== null) {
				sessionDurations.push(sessionDuration);
			}
		}

		for (const execution of executions) {
			const event = buildUsageEvent(execution, visibleProjectNames);
			const isWriteExecution = isWriteOp(execution.op);
			const bucket = bucketForTimestamp(buckets, event.occurred_at);
			const currentSessionMetrics = sessionMetrics.get(execution.agent_call_session_id) ?? {
				toolCallCount: 0,
				writeCount: 0,
				failedToolCallCount: 0
			};
			currentSessionMetrics.toolCallCount += 1;
			if (isWriteExecution) currentSessionMetrics.writeCount += 1;
			if (execution.status === 'failed') currentSessionMetrics.failedToolCallCount += 1;
			sessionMetrics.set(execution.agent_call_session_id, currentSessionMetrics);

			incrementOperationBreakdown(operationBreakdown, execution);
			incrementProjectBreakdown(projectBreakdown, event);
			if (event.project_id) {
				touchedProjectIds.add(event.project_id);
			}

			const executionLatency = latencyMs(execution);
			if (executionLatency !== null) {
				toolLatencies.push(executionLatency);
			}

			if (!bucket) continue;
			bucket.tool_call_count += 1;
			if (isWriteExecution) bucket.write_count += 1;
			if (execution.status === 'succeeded') {
				bucket.successful_tool_call_count += 1;
				if (isWriteExecution) bucket.successful_write_count += 1;
			} else if (execution.status === 'failed') {
				bucket.failed_tool_call_count += 1;
				bucket.error_count += 1;
				if (isWriteExecution) bucket.failed_write_count += 1;
			}
		}

		for (const event of securityEvents) {
			const bucket = bucketForTimestamp(buckets, event.created_at);
			if (!bucket || !isSecurityProblem(event)) continue;
			if (event.outcome === 'denied' || event.outcome === 'blocked') {
				bucket.denied_count += 1;
			}
			if (event.event_type !== 'agent.write.failed') {
				bucket.error_count += 1;
			}
		}

		const activeSessionCount = sessions.filter((session) => session.status === 'active').length;
		const endedSessionCount = sessions.filter((session) => session.status === 'ended').length;
		const rejectedSessionCount = sessions.filter(
			(session) => session.status === 'rejected'
		).length;
		const successfulToolCallCount = executions.filter(
			(execution) => execution.status === 'succeeded'
		).length;
		const failedToolCallCount = executions.filter(
			(execution) => execution.status === 'failed'
		).length;
		const writeExecutions = executions.filter((execution) => isWriteOp(execution.op));
		const successfulWriteCount = writeExecutions.filter(
			(execution) => execution.status === 'succeeded'
		).length;
		const failedWriteCount = writeExecutions.filter(
			(execution) => execution.status === 'failed'
		).length;
		const deniedCount = securityEvents.filter(
			(event) => event.outcome === 'denied' || event.outcome === 'blocked'
		).length;
		const authFailureCount = securityEvents.filter(
			(event) => event.event_type === 'agent.auth.failed'
		).length;
		const extraSecurityProblemCount = securityEvents.filter(
			(event) => isSecurityProblem(event) && event.event_type !== 'agent.write.failed'
		).length;
		const latestExecutionActivity = executionEvents.reduce<string | null>(
			(current, event) => touchTimestamp(current, event.occurred_at),
			null
		);
		const latestSecurityProblem = securityEvents.reduce<string | null>(
			(current, event) =>
				isSecurityProblem(event) ? touchTimestamp(current, event.created_at) : current,
			null
		);
		const latestSessionActivity = sessions.reduce<string | null>(
			(current, session) => touchTimestamp(current, session.updated_at ?? session.started_at),
			null
		);

		const totals: BuildosAgentUsageTotals = {
			session_count: sessions.length,
			active_session_count: activeSessionCount,
			ended_session_count: endedSessionCount,
			rejected_session_count: rejectedSessionCount,
			tool_call_count: executions.length,
			successful_tool_call_count: successfulToolCallCount,
			failed_tool_call_count: failedToolCallCount,
			write_count: writeExecutions.length,
			successful_write_count: successfulWriteCount,
			failed_write_count: failedWriteCount,
			error_count: failedToolCallCount + extraSecurityProblemCount,
			denied_count: deniedCount,
			auth_failure_count: authFailureCount,
			project_count: touchedProjectIds.size,
			avg_session_duration_ms:
				sessionDurations.length > 0
					? Math.round(
							sessionDurations.reduce((sum, value) => sum + value, 0) /
								sessionDurations.length
						)
					: null,
			avg_tool_latency_ms:
				toolLatencies.length > 0
					? Math.round(
							toolLatencies.reduce((sum, value) => sum + value, 0) /
								toolLatencies.length
						)
					: null,
			last_activity_at: [
				caller.last_used_at,
				latestSessionActivity,
				latestExecutionActivity
			].reduce<string | null>((current, value) => touchTimestamp(current, value), null),
			last_error_at: latestSecurityProblem
		};

		const usageSessions: BuildosAgentUsageSession[] = sessions.map((session) => {
			const metrics = sessionMetrics.get(session.id) ?? {
				toolCallCount: 0,
				writeCount: 0,
				failedToolCallCount: 0
			};

			return {
				id: session.id,
				status: session.status,
				started_at: session.started_at,
				ended_at: session.ended_at,
				updated_at: session.updated_at,
				duration_ms: durationMs(session.started_at, session.ended_at),
				requested_scope_mode: scopeModeFromScope(session.requested_scope),
				granted_scope_mode: scopeModeFromScope(session.granted_scope),
				write_count: metrics.writeCount,
				tool_call_count: metrics.toolCallCount,
				failed_tool_call_count: metrics.failedToolCallCount,
				rejection_reason: session.rejection_reason
			};
		});

		return {
			caller: mapCallerSummary(caller, visibleProjectIds, usageByCallerId.get(caller.id)),
			range: {
				key: rangeKey,
				days,
				start_at: startIso,
				end_at: endIso
			},
			totals,
			time_series: Array.from(buckets.values()),
			operation_breakdown: finalizeOperationBreakdown(operationBreakdown).slice(0, 20),
			project_breakdown: Array.from(projectBreakdown.values())
				.sort((a, b) => b.tool_call_count - a.tool_call_count)
				.slice(0, 20),
			sessions: usageSessions.slice(0, 50),
			events: executionEvents
				.sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at))
				.slice(0, 75),
			security_events: securityEvents.map(summarizeSecurityEvent).slice(0, 50)
		};
	}

	async revokeForUser(
		userId: string,
		callerId: string
	): Promise<BuildosAgentCallerRevokeResponse> {
		if (!isValidUUID(callerId)) {
			throw new CallerProvisioningError('caller_id must be a valid UUID', 400);
		}

		const { data, error } = await this.admin
			.from('external_agent_callers')
			.update({ status: 'revoked' })
			.eq('id', callerId)
			.eq('user_id', userId)
			.select('*')
			.maybeSingle();

		if (error) {
			throw new CallerProvisioningError(
				'Failed to revoke external caller',
				500,
				error.message
			);
		}

		if (!data) {
			throw new CallerProvisioningError('External caller not found', 404);
		}

		await logSecurityEvent(
			{
				eventType: 'agent.caller.revoked',
				category: 'agent',
				outcome: 'success',
				severity: 'medium',
				actorType: 'user',
				actorUserId: userId,
				externalAgentCallerId: callerId,
				targetType: 'external_agent_caller',
				targetId: callerId,
				metadata: {
					provider: (data as ExternalAgentCallerRecord).provider,
					callerKey: (data as ExternalAgentCallerRecord).caller_key
				}
			},
			{ ...this.securityEventOptions, supabase: this.admin }
		);

		return {
			caller: mapCallerSummary(data as ExternalAgentCallerRecord)
		};
	}

	private async resolveAllowedProjectIds(
		userId: string,
		requestedProjectIds: string[] | undefined
	): Promise<string[] | undefined> {
		if (requestedProjectIds === undefined) {
			return undefined;
		}

		const visibleProjects = await this.loadVisibleProjects(userId);
		const visibleProjectIds = new Set(visibleProjects.map((project) => project.id));

		for (const projectId of requestedProjectIds) {
			if (!visibleProjectIds.has(projectId)) {
				throw new CallerProvisioningError(
					'allowed_project_ids contains a project outside the user workspace',
					403,
					{ project_id: projectId }
				);
			}
		}

		return requestedProjectIds;
	}

	private async loadVisibleProjects(userId: string) {
		const actorId = await ensureActorId(this.admin, userId);
		return fetchProjectSummaries(this.admin, actorId);
	}

	private async loadUsageForCallers(
		userId: string,
		callers: ExternalAgentCallerRecord[],
		projectNameById: Map<string, string>
	): Promise<Map<string, BuildosAgentCallerUsageSummary>> {
		const usageByCallerId = new Map<string, UsageAccumulator>(
			callers.map((caller) => [caller.id, createUsageAccumulator(caller)])
		);
		const callerIds = callers.map((caller) => caller.id);

		if (callerIds.length === 0) {
			return new Map();
		}

		const [sessionsResult, executionsResult] = await Promise.all([
			this.admin
				.from('agent_call_sessions')
				.select('id, external_agent_caller_id, status, started_at, ended_at, updated_at')
				.eq('user_id', userId)
				.in('external_agent_caller_id', callerIds)
				.order('started_at', { ascending: false })
				.limit(500),
			this.admin
				.from('agent_call_tool_executions')
				.select(
					'id, agent_call_session_id, external_agent_caller_id, user_id, op, status, args, response_payload, error_payload, entity_kind, entity_id, started_at, completed_at, created_at, updated_at'
				)
				.eq('user_id', userId)
				.in('external_agent_caller_id', callerIds)
				.order('created_at', { ascending: false })
				.limit(500)
		]);

		if (sessionsResult.error) {
			console.warn('[CallerProvisioningService] Failed to load agent call sessions usage', {
				userId,
				error: sessionsResult.error
			});
		} else {
			for (const session of (sessionsResult.data ?? []) as Array<
				Pick<
					AgentCallSessionRecord,
					'external_agent_caller_id' | 'started_at' | 'updated_at'
				>
			>) {
				const accumulator = usageByCallerId.get(session.external_agent_caller_id);
				if (!accumulator) continue;
				addSessionToUsage(accumulator, session);
			}
		}

		if (executionsResult.error) {
			console.warn('[CallerProvisioningService] Failed to load agent tool usage', {
				userId,
				error: executionsResult.error
			});
		} else {
			for (const execution of (executionsResult.data ??
				[]) as AgentCallToolExecutionUsageRow[]) {
				const accumulator = usageByCallerId.get(execution.external_agent_caller_id);
				if (!accumulator) continue;
				addExecutionToUsage(accumulator, execution, projectNameById);
			}
		}

		return new Map(
			Array.from(usageByCallerId.entries()).map(([callerId, accumulator]) => [
				callerId,
				finalizeUsageAccumulator(accumulator)
			])
		);
	}
}
