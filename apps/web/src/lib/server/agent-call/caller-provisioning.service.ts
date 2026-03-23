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
import { ensureUserBuildosAgent } from './callee-resolution';
import { hashAgentCallerToken } from './caller-auth';

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

	return {
		provider: normalizeProviderField(body.provider),
		caller_key: validateStringField(body.caller_key, 'caller_key', 255),
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

function mapCallerSummary(record: ExternalAgentCallerRecord): BuildosAgentCallerSummary {
	const allowedProjectIds = Array.isArray(record.policy?.allowed_project_ids)
		? record.policy.allowed_project_ids.filter(
				(value): value is string => typeof value === 'string'
			)
		: undefined;

	return {
		id: record.id,
		provider: record.provider,
		caller_key: record.caller_key,
		status: record.status,
		token_prefix: record.token_prefix,
		allowed_project_ids: allowedProjectIds,
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
	constructor(private readonly admin: any = createAdminSupabaseClient()) {}

	async provisionForUser(
		userId: string,
		body: unknown
	): Promise<BuildosAgentCallerProvisionResponse> {
		const request = parseProvisionRequest(body);
		const buildosAgent = await ensureUserBuildosAgent(this.admin, userId);
		const allowedProjectIds = await this.resolveAllowedProjectIds(
			userId,
			request.allowed_project_ids
		);
		const { token, tokenPrefix } = generateBearerToken();
		const tokenHash = hashAgentCallerToken(token);
		const policy =
			allowedProjectIds === undefined ? {} : { allowed_project_ids: allowedProjectIds };

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
			}
		};
	}

	async listForUser(userId: string): Promise<BuildosAgentCallerListResponse> {
		const buildosAgent = await ensureUserBuildosAgent(this.admin, userId);
		const visibleProjects = await this.loadVisibleProjects(userId);
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
			callers: ((data ?? []) as ExternalAgentCallerRecord[]).map(mapCallerSummary),
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
