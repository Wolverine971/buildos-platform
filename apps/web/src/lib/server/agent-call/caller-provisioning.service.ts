// apps/web/src/lib/server/agent-call/caller-provisioning.service.ts
import { randomBytes } from 'crypto';
import { isValidUUID } from '@buildos/shared-types';
import type {
	BuildosAgentCallerListResponse,
	BuildosAgentCallerProvisionRequest,
	BuildosAgentCallerProvisionResponse,
	BuildosAgentCallerRevokeResponse,
	BuildosAgentCallerSummary,
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
	visibleProjectIds?: Set<string>
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
		updated_at: record.updated_at
	};
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

		return {
			buildos_agent: {
				id: buildosAgent.id,
				handle: buildosAgent.agent_handle,
				status: buildosAgent.status
			},
			callers: ((data ?? []) as ExternalAgentCallerRecord[]).map((caller) =>
				mapCallerSummary(caller, visibleProjectIds)
			),
			available_projects: visibleProjects.map((project) => ({
				id: project.id,
				name: project.name,
				description: project.description ?? null
			}))
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
}
