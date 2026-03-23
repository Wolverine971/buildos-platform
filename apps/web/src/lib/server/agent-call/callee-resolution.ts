// apps/web/src/lib/server/agent-call/callee-resolution.ts
import type { UserBuildosAgentRecord } from '@buildos/shared-types';
import { isValidUUID } from '@buildos/shared-types';

const BUILDOS_AGENT_HANDLE_PREFIX = 'buildos:user:';

export function buildUserBuildosAgentHandle(userId: string): string {
	return `${BUILDOS_AGENT_HANDLE_PREFIX}${userId}`;
}

export function parseUserIdFromAgentHandle(handle: string): string | null {
	if (!handle.startsWith(BUILDOS_AGENT_HANDLE_PREFIX)) {
		return null;
	}

	const userId = handle.slice(BUILDOS_AGENT_HANDLE_PREFIX.length);
	return isValidUUID(userId) ? userId : null;
}

export class AgentCallCalleeError extends Error {
	constructor(
		message: string,
		public readonly status = 403,
		public readonly code = -32004,
		public readonly reason = 'callee_not_allowed'
	) {
		super(message);
		this.name = 'AgentCallCalleeError';
	}
}

export async function ensureUserBuildosAgent(
	admin: any,
	userId: string
): Promise<UserBuildosAgentRecord> {
	const expectedHandle = buildUserBuildosAgentHandle(userId);

	const { data: existing, error: existingError } = await admin
		.from('user_buildos_agents')
		.select('*')
		.eq('user_id', userId)
		.maybeSingle();

	if (existingError) {
		throw new AgentCallCalleeError('Failed to resolve user BuildOS agent', 500, -32603);
	}

	if (existing) {
		return existing as UserBuildosAgentRecord;
	}

	const { data: inserted, error: insertError } = await admin
		.from('user_buildos_agents')
		.insert({
			user_id: userId,
			agent_handle: expectedHandle,
			status: 'active'
		})
		.select('*')
		.single();

	if (insertError || !inserted) {
		throw new AgentCallCalleeError('Failed to create user BuildOS agent', 500, -32603);
	}

	return inserted as UserBuildosAgentRecord;
}

export async function resolveCalleeForCaller(params: {
	admin: any;
	callerUserId: string;
	calleeHandle: string;
}): Promise<UserBuildosAgentRecord> {
	const targetUserId = parseUserIdFromAgentHandle(params.calleeHandle);

	if (!targetUserId) {
		throw new AgentCallCalleeError('Invalid callee handle', 400, -32602, 'invalid_callee');
	}

	if (targetUserId !== params.callerUserId) {
		throw new AgentCallCalleeError(
			'Caller is not allowed to dial another user BuildOS agent',
			403,
			-32004,
			'caller_not_allowed'
		);
	}

	const buildosAgent = await ensureUserBuildosAgent(params.admin, targetUserId);

	if (buildosAgent.agent_handle !== params.calleeHandle) {
		throw new AgentCallCalleeError('Callee handle mismatch', 403, -32004, 'invalid_callee');
	}

	if (buildosAgent.status !== 'active') {
		throw new AgentCallCalleeError(
			'User BuildOS agent is unavailable',
			403,
			-32004,
			'callee_unavailable'
		);
	}

	return buildosAgent;
}
