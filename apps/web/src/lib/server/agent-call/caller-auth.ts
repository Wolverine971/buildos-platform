// apps/web/src/lib/server/agent-call/caller-auth.ts
import { createHash } from 'crypto';
import type { ExternalAgentCallerRecord } from '@buildos/shared-types';

export class AgentCallAuthError extends Error {
	constructor(
		message: string,
		public readonly status = 401,
		public readonly code = -32001,
		public readonly data?: unknown
	) {
		super(message);
		this.name = 'AgentCallAuthError';
	}
}

function extractBearerToken(request: Request): string {
	const authHeader = request.headers.get('authorization');
	if (!authHeader) {
		throw new AgentCallAuthError('Missing authorization header');
	}

	const [scheme, token] = authHeader.split(' ');
	if (scheme !== 'Bearer' || !token?.trim()) {
		throw new AgentCallAuthError('Invalid authorization header');
	}

	return token.trim();
}

export function hashAgentCallerToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

export async function authenticateExternalAgentCaller(
	admin: any,
	request: Request
): Promise<ExternalAgentCallerRecord> {
	const token = extractBearerToken(request);
	const tokenHash = hashAgentCallerToken(token);

	const { data, error } = await admin
		.from('external_agent_callers')
		.select('*')
		.eq('token_hash', tokenHash)
		.maybeSingle();

	if (error) {
		throw new AgentCallAuthError('Failed to authenticate caller', 500, -32603, error.message);
	}

	if (!data) {
		throw new AgentCallAuthError('Unknown caller');
	}

	if (data.status !== 'trusted') {
		throw new AgentCallAuthError('Caller is not trusted', 403, -32003, {
			status: data.status
		});
	}

	await admin
		.from('external_agent_callers')
		.update({ last_used_at: new Date().toISOString() })
		.eq('id', data.id);

	return data as ExternalAgentCallerRecord;
}
