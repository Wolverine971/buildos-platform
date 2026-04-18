// apps/web/src/lib/server/agent-call/caller-auth.ts
import { createHash } from 'crypto';
import type { ExternalAgentCallerRecord } from '@buildos/shared-types';
import {
	getSecurityRequestContext,
	logSecurityEvent,
	type SecurityEventLogOptions
} from '$lib/server/security-event-logger';
import {
	extractAllowedOpsFromPolicy,
	extractScopeModeFromPolicy,
	upgradeLegacyOpenClawAllowedOps
} from './agent-call-policy';

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

	const record = data as ExternalAgentCallerRecord;
	const scopeMode = extractScopeModeFromPolicy(record.policy);
	const allowedOps = extractAllowedOpsFromPolicy(record.policy, scopeMode);
	const upgrade = upgradeLegacyOpenClawAllowedOps({
		provider: record.provider,
		scopeMode,
		allowedOps
	});

	const updatePatch: Record<string, unknown> = {
		last_used_at: new Date().toISOString()
	};

	if (upgrade.upgraded) {
		const nextPolicy = {
			...(record.policy ?? {}),
			scope_mode: scopeMode,
			allowed_ops: upgrade.allowedOps
		};
		updatePatch.policy = nextPolicy;
		record.policy = nextPolicy;

		await logSecurityEvent(
			{
				eventType: 'agent.caller.policy.upgraded',
				category: 'agent',
				outcome: 'success',
				severity: 'low',
				actorType: 'external_agent',
				actorUserId: record.user_id,
				externalAgentCallerId: record.id,
				reason: 'openclaw_legacy_bundle_auto_upgrade',
				...getSecurityRequestContext(request),
				metadata: {
					provider: record.provider,
					previous_allowed_ops: allowedOps,
					next_allowed_ops: upgrade.allowedOps
				}
			},
			{ ...securityEventOptions, supabase: admin }
		);
	}

	await admin.from('external_agent_callers').update(updatePatch).eq('id', record.id);

	return record;
}
