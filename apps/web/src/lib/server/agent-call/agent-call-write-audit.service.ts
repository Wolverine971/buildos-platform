// apps/web/src/lib/server/agent-call/agent-call-write-audit.service.ts
import type { BuildosAgentAllowedOp } from '@buildos/shared-types';
import { logSecurityEvent, type SecurityEventLogOptions } from '$lib/server/security-event-logger';

export type AgentCallWriteExecutionStatus = 'pending' | 'succeeded' | 'failed';

export type AgentCallWriteExecutionRecord = {
	id: string;
	agent_call_session_id: string;
	external_agent_caller_id: string;
	user_id: string;
	op: string;
	idempotency_key: string | null;
	status: AgentCallWriteExecutionStatus;
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

export class AgentCallWriteReplayError extends Error {
	constructor(public readonly responsePayload: Record<string, unknown>) {
		super('Idempotent write replayed');
		this.name = 'AgentCallWriteReplayError';
	}
}

export class AgentCallWritePendingError extends Error {
	constructor() {
		super('An idempotent write with this key is already in progress');
		this.name = 'AgentCallWritePendingError';
	}
}

async function loadExistingExecution(params: {
	admin: any;
	callerId: string;
	op: BuildosAgentAllowedOp;
	idempotencyKey: string;
}): Promise<AgentCallWriteExecutionRecord | null> {
	const { data, error } = await params.admin
		.from('agent_call_tool_executions')
		.select('*')
		.eq('external_agent_caller_id', params.callerId)
		.eq('op', params.op)
		.eq('idempotency_key', params.idempotencyKey)
		.order('created_at', { ascending: false })
		.limit(1)
		.maybeSingle();

	if (error) {
		throw new Error(error.message || 'Failed to load prior write execution');
	}

	return (data as AgentCallWriteExecutionRecord | null) ?? null;
}

export async function reserveWriteExecution(params: {
	admin: any;
	callSessionId: string;
	callerId: string;
	userId: string;
	op: BuildosAgentAllowedOp;
	args: Record<string, unknown>;
	idempotencyKey?: string;
	securityEventOptions?: SecurityEventLogOptions;
}): Promise<{ executionId: string | null }> {
	if (!params.idempotencyKey) {
		return { executionId: null };
	}

	const now = new Date().toISOString();
	const { data, error } = await params.admin
		.from('agent_call_tool_executions')
		.insert({
			agent_call_session_id: params.callSessionId,
			external_agent_caller_id: params.callerId,
			user_id: params.userId,
			op: params.op,
			idempotency_key: params.idempotencyKey,
			status: 'pending',
			args: params.args,
			started_at: now,
			updated_at: now
		})
		.select('*')
		.single();

	if (!error && data) {
		await logAgentWriteSecurityEvent(params.admin, {
			eventType: 'agent.write.reserved',
			outcome: 'info',
			severity: 'info',
			callerId: params.callerId,
			userId: params.userId,
			callSessionId: params.callSessionId,
			op: params.op,
			idempotencyKeyPresent: true,
			argumentKeys: Object.keys(params.args),
			securityEventOptions: params.securityEventOptions
		});
		return { executionId: String((data as AgentCallWriteExecutionRecord).id) };
	}

	if (error?.code !== '23505') {
		await logAgentWriteSecurityEvent(params.admin, {
			eventType: 'agent.write.reserve_failed',
			outcome: 'failure',
			severity: 'medium',
			callerId: params.callerId,
			userId: params.userId,
			callSessionId: params.callSessionId,
			op: params.op,
			idempotencyKeyPresent: true,
			reason: error?.message || 'reserve_failed',
			argumentKeys: Object.keys(params.args),
			securityEventOptions: params.securityEventOptions
		});
		throw new Error(error?.message || 'Failed to reserve idempotent write execution');
	}

	const existing = await loadExistingExecution({
		admin: params.admin,
		callerId: params.callerId,
		op: params.op,
		idempotencyKey: params.idempotencyKey
	});

	if (existing?.status === 'succeeded' && existing.response_payload) {
		await logAgentWriteSecurityEvent(params.admin, {
			eventType: 'agent.write.replayed',
			outcome: 'allowed',
			severity: 'low',
			callerId: params.callerId,
			userId: params.userId,
			callSessionId: params.callSessionId,
			op: params.op,
			idempotencyKeyPresent: true,
			targetType: existing.entity_kind ?? null,
			targetId: existing.entity_id ?? null,
			argumentKeys: Object.keys(params.args),
			securityEventOptions: params.securityEventOptions
		});
		throw new AgentCallWriteReplayError(existing.response_payload);
	}

	await logAgentWriteSecurityEvent(params.admin, {
		eventType: 'agent.write.pending_conflict',
		outcome: 'denied',
		severity: 'medium',
		callerId: params.callerId,
		userId: params.userId,
		callSessionId: params.callSessionId,
		op: params.op,
		idempotencyKeyPresent: true,
		reason: 'pending_idempotent_write',
		argumentKeys: Object.keys(params.args),
		securityEventOptions: params.securityEventOptions
	});
	throw new AgentCallWritePendingError();
}

export async function recordWriteExecutionSuccess(params: {
	admin: any;
	executionId: string | null;
	callSessionId: string;
	callerId: string;
	userId: string;
	op: BuildosAgentAllowedOp;
	idempotencyKey?: string;
	args: Record<string, unknown>;
	responsePayload: Record<string, unknown>;
	entityKind?: string;
	entityId?: string;
	securityEventOptions?: SecurityEventLogOptions;
}): Promise<void> {
	const completedAt = new Date().toISOString();

	if (params.executionId) {
		const { error } = await params.admin
			.from('agent_call_tool_executions')
			.update({
				status: 'succeeded',
				response_payload: params.responsePayload,
				error_payload: null,
				entity_kind: params.entityKind ?? null,
				entity_id: params.entityId ?? null,
				completed_at: completedAt,
				updated_at: completedAt
			})
			.eq('id', params.executionId);

		if (error) {
			throw new Error(error.message || 'Failed to finalize write execution');
		}

		await logAgentWriteSecurityEvent(params.admin, {
			eventType: 'agent.write.succeeded',
			outcome: 'success',
			severity: 'info',
			callerId: params.callerId,
			userId: params.userId,
			callSessionId: params.callSessionId,
			op: params.op,
			idempotencyKeyPresent: Boolean(params.idempotencyKey),
			targetType: params.entityKind ?? null,
			targetId: params.entityId ?? null,
			argumentKeys: Object.keys(params.args),
			securityEventOptions: params.securityEventOptions
		});
		return;
	}

	const { error } = await params.admin.from('agent_call_tool_executions').insert({
		agent_call_session_id: params.callSessionId,
		external_agent_caller_id: params.callerId,
		user_id: params.userId,
		op: params.op,
		idempotency_key: params.idempotencyKey ?? null,
		status: 'succeeded',
		args: params.args,
		response_payload: params.responsePayload,
		error_payload: null,
		entity_kind: params.entityKind ?? null,
		entity_id: params.entityId ?? null,
		started_at: completedAt,
		completed_at: completedAt,
		updated_at: completedAt
	});

	if (error) {
		throw new Error(error.message || 'Failed to record write execution');
	}

	await logAgentWriteSecurityEvent(params.admin, {
		eventType: 'agent.write.succeeded',
		outcome: 'success',
		severity: 'info',
		callerId: params.callerId,
		userId: params.userId,
		callSessionId: params.callSessionId,
		op: params.op,
		idempotencyKeyPresent: Boolean(params.idempotencyKey),
		targetType: params.entityKind ?? null,
		targetId: params.entityId ?? null,
		argumentKeys: Object.keys(params.args),
		securityEventOptions: params.securityEventOptions
	});
}

export async function recordWriteExecutionFailure(params: {
	admin: any;
	executionId: string | null;
	callSessionId: string;
	callerId: string;
	userId: string;
	op: BuildosAgentAllowedOp;
	idempotencyKey?: string;
	args: Record<string, unknown>;
	errorPayload: Record<string, unknown>;
	securityEventOptions?: SecurityEventLogOptions;
}): Promise<void> {
	const completedAt = new Date().toISOString();

	if (params.executionId) {
		const { error } = await params.admin
			.from('agent_call_tool_executions')
			.update({
				status: 'failed',
				error_payload: params.errorPayload,
				completed_at: completedAt,
				updated_at: completedAt
			})
			.eq('id', params.executionId);

		if (error) {
			throw new Error(error.message || 'Failed to record write failure');
		}

		await logAgentWriteSecurityEvent(params.admin, {
			eventType: 'agent.write.failed',
			outcome: 'failure',
			severity: 'medium',
			callerId: params.callerId,
			userId: params.userId,
			callSessionId: params.callSessionId,
			op: params.op,
			idempotencyKeyPresent: Boolean(params.idempotencyKey),
			reason: extractErrorReason(params.errorPayload),
			argumentKeys: Object.keys(params.args),
			securityEventOptions: params.securityEventOptions
		});
		return;
	}

	const { error } = await params.admin.from('agent_call_tool_executions').insert({
		agent_call_session_id: params.callSessionId,
		external_agent_caller_id: params.callerId,
		user_id: params.userId,
		op: params.op,
		idempotency_key: params.idempotencyKey ?? null,
		status: 'failed',
		args: params.args,
		response_payload: null,
		error_payload: params.errorPayload,
		started_at: completedAt,
		completed_at: completedAt,
		updated_at: completedAt
	});

	if (error) {
		throw new Error(error.message || 'Failed to record write failure');
	}

	await logAgentWriteSecurityEvent(params.admin, {
		eventType: 'agent.write.failed',
		outcome: 'failure',
		severity: 'medium',
		callerId: params.callerId,
		userId: params.userId,
		callSessionId: params.callSessionId,
		op: params.op,
		idempotencyKeyPresent: Boolean(params.idempotencyKey),
		reason: extractErrorReason(params.errorPayload),
		argumentKeys: Object.keys(params.args),
		securityEventOptions: params.securityEventOptions
	});
}

export async function recordToolExecutionSuccess(params: {
	admin: any;
	callSessionId?: string;
	callerId?: string;
	userId: string;
	op: string;
	args: Record<string, unknown>;
	responsePayload?: Record<string, unknown>;
	entityKind?: string;
	entityId?: string;
	startedAt?: string;
}): Promise<void> {
	if (!params.callSessionId || !params.callerId) {
		return;
	}

	const completedAt = new Date().toISOString();
	const startedAt = params.startedAt ?? completedAt;
	const { error } = await params.admin.from('agent_call_tool_executions').insert({
		agent_call_session_id: params.callSessionId,
		external_agent_caller_id: params.callerId,
		user_id: params.userId,
		op: params.op,
		idempotency_key: null,
		status: 'succeeded',
		args: params.args,
		response_payload: params.responsePayload ?? null,
		error_payload: null,
		entity_kind: params.entityKind ?? null,
		entity_id: params.entityId ?? null,
		started_at: startedAt,
		completed_at: completedAt,
		updated_at: completedAt
	});

	if (error) {
		throw new Error(error.message || 'Failed to record tool execution');
	}
}

export async function recordToolExecutionFailure(params: {
	admin: any;
	callSessionId?: string;
	callerId?: string;
	userId: string;
	op: string;
	args: Record<string, unknown>;
	errorPayload: Record<string, unknown>;
	entityKind?: string;
	entityId?: string;
	startedAt?: string;
}): Promise<void> {
	if (!params.callSessionId || !params.callerId) {
		return;
	}

	const completedAt = new Date().toISOString();
	const startedAt = params.startedAt ?? completedAt;
	const { error } = await params.admin.from('agent_call_tool_executions').insert({
		agent_call_session_id: params.callSessionId,
		external_agent_caller_id: params.callerId,
		user_id: params.userId,
		op: params.op,
		idempotency_key: null,
		status: 'failed',
		args: params.args,
		response_payload: null,
		error_payload: params.errorPayload,
		entity_kind: params.entityKind ?? null,
		entity_id: params.entityId ?? null,
		started_at: startedAt,
		completed_at: completedAt,
		updated_at: completedAt
	});

	if (error) {
		throw new Error(error.message || 'Failed to record tool execution failure');
	}
}

async function logAgentWriteSecurityEvent(
	admin: any,
	params: {
		eventType: string;
		outcome: 'success' | 'failure' | 'blocked' | 'allowed' | 'denied' | 'info';
		severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
		callerId: string;
		userId: string;
		callSessionId: string;
		op: BuildosAgentAllowedOp;
		idempotencyKeyPresent: boolean;
		targetType?: string | null;
		targetId?: string | null;
		reason?: string | null;
		argumentKeys: string[];
		securityEventOptions?: SecurityEventLogOptions;
	}
): Promise<void> {
	await logSecurityEvent(
		{
			eventType: params.eventType,
			category: 'agent',
			outcome: params.outcome,
			severity: params.severity,
			actorType: 'external_agent',
			actorUserId: params.userId,
			externalAgentCallerId: params.callerId,
			sessionId: params.callSessionId,
			targetType: params.targetType ?? null,
			targetId: params.targetId ?? null,
			reason: params.reason ?? null,
			metadata: {
				op: params.op,
				idempotencyKeyPresent: params.idempotencyKeyPresent,
				argumentKeys: params.argumentKeys
			}
		},
		{ ...(params.securityEventOptions ?? {}), supabase: admin }
	);
}

function extractErrorReason(errorPayload: Record<string, unknown>): string | null {
	const message = errorPayload.message ?? errorPayload.code ?? errorPayload.error;
	return typeof message === 'string' ? message : null;
}
