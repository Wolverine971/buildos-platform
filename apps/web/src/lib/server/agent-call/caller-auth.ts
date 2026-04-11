// apps/web/src/lib/server/agent-call/caller-auth.ts
import { createHash } from 'crypto';
import type { ExternalAgentCallerRecord } from '@buildos/shared-types';
import {
	getSecurityRequestContext,
	logSecurityEvent,
	type SecurityEventLogOptions
} from '$lib/server/security-event-logger';

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
	request: Request,
	securityEventOptions: SecurityEventLogOptions = {}
): Promise<ExternalAgentCallerRecord> {
	let token: string;
	try {
		token = extractBearerToken(request);
	} catch (error) {
		await logSecurityEvent(
			{
				eventType: 'agent.auth.failed',
				category: 'agent',
				outcome: 'failure',
				severity: 'medium',
				actorType: 'external_agent',
				reason: error instanceof Error ? error.message : 'invalid_authorization',
				...getSecurityRequestContext(request)
			},
			{ ...securityEventOptions, supabase: admin }
		);
		throw error;
	}
	const tokenHash = hashAgentCallerToken(token);

	const { data, error } = await admin
		.from('external_agent_callers')
		.select('*')
		.eq('token_hash', tokenHash)
		.maybeSingle();

	if (error) {
		await logSecurityEvent(
			{
				eventType: 'agent.auth.failed',
				category: 'agent',
				outcome: 'failure',
				severity: 'medium',
				actorType: 'external_agent',
				reason: 'caller_lookup_failed',
				...getSecurityRequestContext(request),
				metadata: {
					credentialPrefix: token.slice(0, 12)
				}
			},
			{ ...securityEventOptions, supabase: admin }
		);
		throw new AgentCallAuthError('Failed to authenticate caller', 500, -32603, error.message);
	}

	if (!data) {
		await logSecurityEvent(
			{
				eventType: 'agent.auth.failed',
				category: 'agent',
				outcome: 'denied',
				severity: 'medium',
				actorType: 'external_agent',
				reason: 'unknown_caller',
				...getSecurityRequestContext(request),
				metadata: {
					credentialPrefix: token.slice(0, 12)
				}
			},
			{ ...securityEventOptions, supabase: admin }
		);
		throw new AgentCallAuthError('Unknown caller');
	}

	if (data.status !== 'trusted') {
		await logSecurityEvent(
			{
				eventType: 'agent.auth.failed',
				category: 'agent',
				outcome: 'denied',
				severity: 'medium',
				actorType: 'external_agent',
				actorUserId: data.user_id,
				externalAgentCallerId: data.id,
				reason: 'caller_not_trusted',
				...getSecurityRequestContext(request),
				metadata: {
					status: data.status,
					provider: data.provider,
					callerKey: data.caller_key
				}
			},
			{ ...securityEventOptions, supabase: admin }
		);
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
