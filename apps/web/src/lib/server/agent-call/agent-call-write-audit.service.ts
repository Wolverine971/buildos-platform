// apps/web/src/lib/server/agent-call/agent-call-write-audit.service.ts
import type { BuildosAgentAllowedOp } from '@buildos/shared-types';

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
		return { executionId: String((data as AgentCallWriteExecutionRecord).id) };
	}

	if (error?.code !== '23505') {
		throw new Error(error?.message || 'Failed to reserve idempotent write execution');
	}

	const existing = await loadExistingExecution({
		admin: params.admin,
		callerId: params.callerId,
		op: params.op,
		idempotencyKey: params.idempotencyKey
	});

	if (existing?.status === 'succeeded' && existing.response_payload) {
		throw new AgentCallWriteReplayError(existing.response_payload);
	}

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
}
