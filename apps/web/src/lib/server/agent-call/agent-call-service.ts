// apps/web/src/lib/server/agent-call/agent-call-service.ts
import { isValidUUID } from '@buildos/shared-types';
import type {
	AgentCallScope,
	AgentCallSessionRecord,
	BuildosAgentCallAcceptedResponse,
	BuildosAgentCallRejectedResponse,
	BuildosAgentDialParams,
	BuildosAgentHangupParams,
	BuildosAgentHangupResponse,
	BuildosAgentToolsCallParams,
	BuildosAgentToolCallResponse,
	BuildosAgentToolsListParams,
	BuildosAgentToolsListResponse,
	ExternalAgentCallerRecord,
	UserBuildosAgentRecord
} from '@buildos/shared-types';
import {
	ensureActorId,
	fetchProjectSummaries
} from '$lib/services/ontology/ontology-projects.service';
import {
	defaultAllowedOpsForMode,
	extractAllowedOpsFromPolicy,
	extractScopeModeFromPolicy,
	intersectAllowedOps,
	minimumScopeMode,
	normalizeAllowedOps,
	normalizeScopeMode,
	requiredScopeModeForOp
} from './agent-call-policy';
import { AgentCallAuthError, authenticateExternalAgentCaller } from './caller-auth';
import { AgentCallCalleeError, resolveCalleeForCaller } from './callee-resolution';
import { executeBuildosAgentGatewayTool } from './external-tool-gateway';
import { getPublicBuildosAgentTools } from './public-tool-registry';

const READ_ONLY_SCOPE: AgentCallScope = {
	mode: 'read_only'
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeProjectIds(value: unknown, fieldName: string): string[] | undefined {
	if (value === undefined) {
		return undefined;
	}

	if (!Array.isArray(value)) {
		throw new AgentCallServiceError(`${fieldName} must be an array of UUIDs`, 400, -32602);
	}

	const ids: string[] = [];
	const seen = new Set<string>();

	for (const entry of value) {
		if (typeof entry !== 'string' || !isValidUUID(entry)) {
			throw new AgentCallServiceError(`${fieldName} must contain valid UUIDs`, 400, -32602);
		}

		if (seen.has(entry)) {
			continue;
		}

		seen.add(entry);
		ids.push(entry);
	}

	return ids;
}

function normalizeScope(value: unknown, fieldName: string): AgentCallScope {
	if (value === undefined || value === null) {
		return READ_ONLY_SCOPE;
	}

	if (!isRecord(value)) {
		throw new AgentCallServiceError(`${fieldName} must be an object`, 400, -32602);
	}

	let mode: AgentCallScope['mode'];
	let allowedOps: AgentCallScope['allowed_ops'];

	try {
		mode = normalizeScopeMode(value.mode, `${fieldName}.mode`);
		allowedOps = normalizeAllowedOps(value.allowed_ops, `${fieldName}.allowed_ops`, mode);
	} catch (error) {
		throw new AgentCallServiceError(
			error instanceof Error ? error.message : 'Invalid call scope',
			400,
			-32602
		);
	}

	const projectIds = normalizeProjectIds(value.project_ids, `${fieldName}.project_ids`);

	return {
		mode,
		...(projectIds === undefined ? {} : { project_ids: projectIds }),
		...(allowedOps === undefined ? {} : { allowed_ops: allowedOps })
	};
}

function extractAllowedProjectIds(policy: unknown, fieldName: string): string[] | null {
	if (!isRecord(policy)) {
		return null;
	}

	if (policy.allowed_project_ids === undefined || policy.allowed_project_ids === null) {
		return null;
	}

	return (
		normalizeProjectIds(policy.allowed_project_ids, `${fieldName}.allowed_project_ids`) ?? []
	);
}

function intersectProjectIds(currentIds: string[], allowedIds: string[] | null): string[] {
	if (allowedIds === null) {
		return currentIds;
	}

	const allowedSet = new Set(allowedIds);
	return currentIds.filter((projectId) => allowedSet.has(projectId));
}

function buildScopeRejection(params: {
	requestedScope: AgentCallScope;
	callerPolicy: unknown;
	agentPolicy: unknown;
	visibleProjectIds: string[];
	disallowedProjectIds?: string[];
	disallowedOps?: string[];
	maxScopeMode?: AgentCallScope['mode'];
}) {
	const callerScopeMode = extractScopeModeFromPolicy(params.callerPolicy);
	const agentScopeMode = extractScopeModeFromPolicy(params.agentPolicy, 'read_write');
	const callerProjectIds = extractAllowedProjectIds(params.callerPolicy, 'caller_policy');
	const agentProjectIds = extractAllowedProjectIds(params.agentPolicy, 'agent_policy');
	let allowedProjectIds = [...params.visibleProjectIds];
	allowedProjectIds = intersectProjectIds(allowedProjectIds, callerProjectIds);
	allowedProjectIds = intersectProjectIds(allowedProjectIds, agentProjectIds);
	const allowedOps = intersectAllowedOps(
		extractAllowedOpsFromPolicy(params.callerPolicy, callerScopeMode),
		extractAllowedOpsFromPolicy(
			params.agentPolicy,
			minimumScopeMode(callerScopeMode, agentScopeMode)
		)
	);

	return {
		reason: 'scope_not_allowed',
		details: {
			requested_scope: params.requestedScope,
			caller_scope_mode: callerScopeMode,
			agent_scope_mode: agentScopeMode,
			max_scope_mode:
				params.maxScopeMode ?? minimumScopeMode(callerScopeMode, agentScopeMode),
			allowed_project_ids: allowedProjectIds,
			allowed_ops: allowedOps,
			...(params.disallowedProjectIds && params.disallowedProjectIds.length > 0
				? { disallowed_project_ids: params.disallowedProjectIds }
				: {}),
			...(params.disallowedOps && params.disallowedOps.length > 0
				? { disallowed_ops: params.disallowedOps }
				: {})
		}
	};
}

function ensureObjectParams<T>(params: unknown, method: string): T {
	if (!isRecord(params)) {
		throw new AgentCallServiceError(`${method} params must be an object`, 400, -32602);
	}

	return params as T;
}

function ensureMatchingClientDescriptor(
	authenticatedCaller: ExternalAgentCallerRecord,
	client: unknown
): void {
	if (client === undefined) {
		return;
	}

	if (!isRecord(client)) {
		throw new AgentCallServiceError('client must be an object', 400, -32602);
	}

	if (
		client.provider !== authenticatedCaller.provider ||
		client.caller_key !== authenticatedCaller.caller_key
	) {
		throw new AgentCallServiceError(
			'client descriptor does not match authenticated caller',
			403,
			-32003
		);
	}
}

function normalizeGrantedScope(params: {
	requestedScope: AgentCallScope;
	visibleProjectIds: string[];
	callerPolicy: unknown;
	agentPolicy: unknown;
}):
	| {
			grantedScope: AgentCallScope;
	  }
	| {
			rejection: {
				reason: string;
				details: Record<string, unknown>;
			};
	  } {
	const callerProjectIds = extractAllowedProjectIds(params.callerPolicy, 'caller_policy');
	const agentProjectIds = extractAllowedProjectIds(params.agentPolicy, 'agent_policy');
	const callerScopeMode = extractScopeModeFromPolicy(params.callerPolicy);
	const agentScopeMode = extractScopeModeFromPolicy(params.agentPolicy, 'read_write');
	const maxScopeMode = minimumScopeMode(callerScopeMode, agentScopeMode);

	if (params.requestedScope.mode === 'read_write' && maxScopeMode !== 'read_write') {
		return {
			rejection: buildScopeRejection({
				requestedScope: params.requestedScope,
				callerPolicy: params.callerPolicy,
				agentPolicy: params.agentPolicy,
				visibleProjectIds: params.visibleProjectIds,
				maxScopeMode
			})
		};
	}

	const grantedMode =
		params.requestedScope.mode === 'read_write' && maxScopeMode === 'read_write'
			? 'read_write'
			: 'read_only';

	const callerAllowedOps = extractAllowedOpsFromPolicy(params.callerPolicy, callerScopeMode);
	const agentAllowedOps = extractAllowedOpsFromPolicy(params.agentPolicy, agentScopeMode);
	let grantedAllowedOps = intersectAllowedOps(callerAllowedOps, agentAllowedOps).filter((op) =>
		grantedMode === 'read_write' ? true : requiredScopeModeForOp(op) === 'read_only'
	);

	if (params.requestedScope.allowed_ops !== undefined) {
		const grantedOpSet = new Set(grantedAllowedOps);
		const disallowedOps = params.requestedScope.allowed_ops.filter(
			(op) => !grantedOpSet.has(op)
		);
		if (disallowedOps.length > 0) {
			return {
				rejection: buildScopeRejection({
					requestedScope: params.requestedScope,
					callerPolicy: params.callerPolicy,
					agentPolicy: params.agentPolicy,
					visibleProjectIds: params.visibleProjectIds,
					disallowedOps
				})
			};
		}

		grantedAllowedOps = params.requestedScope.allowed_ops;
	}

	let grantedProjectIds = [...params.visibleProjectIds];
	grantedProjectIds = intersectProjectIds(grantedProjectIds, callerProjectIds);
	grantedProjectIds = intersectProjectIds(grantedProjectIds, agentProjectIds);

	if (params.requestedScope.project_ids !== undefined) {
		const requestedSet = new Set(params.requestedScope.project_ids);
		const grantedSet = new Set(grantedProjectIds);
		const disallowedProjectIds: string[] = [];

		for (const projectId of params.requestedScope.project_ids) {
			if (!grantedSet.has(projectId)) {
				disallowedProjectIds.push(projectId);
			}
		}

		if (disallowedProjectIds.length > 0) {
			return {
				rejection: buildScopeRejection({
					requestedScope: params.requestedScope,
					callerPolicy: params.callerPolicy,
					agentPolicy: params.agentPolicy,
					visibleProjectIds: params.visibleProjectIds,
					disallowedProjectIds
				})
			};
		}

		grantedProjectIds = grantedProjectIds.filter((projectId) => requestedSet.has(projectId));
	}

	if (
		params.visibleProjectIds.length > 0 &&
		grantedProjectIds.length === 0 &&
		params.requestedScope.project_ids === undefined
	) {
		return {
			rejection: buildScopeRejection({
				requestedScope: params.requestedScope,
				callerPolicy: params.callerPolicy,
				agentPolicy: params.agentPolicy,
				visibleProjectIds: params.visibleProjectIds
			})
		};
	}

	return {
		grantedScope: {
			mode: grantedMode,
			project_ids: grantedProjectIds,
			allowed_ops: grantedAllowedOps
		}
	};
}

function ensureCallId(value: unknown): string {
	if (typeof value !== 'string' || !isValidUUID(value)) {
		throw new AgentCallServiceError('call_id must be a valid UUID', 400, -32602);
	}

	return value;
}

function normalizeToolArguments(args: unknown): Record<string, unknown> | undefined {
	if (args === undefined) {
		return undefined;
	}

	if (!isRecord(args)) {
		throw new AgentCallServiceError('tool arguments must be an object', 400, -32602);
	}

	return args;
}

function ensureToolName(value: unknown): BuildosAgentToolsCallParams['name'] {
	if (value !== 'tool_help' && value !== 'tool_exec') {
		throw new AgentCallServiceError('Unsupported tool name', 400, -32602);
	}

	return value;
}

function errorMessage(error: unknown, fallback: string): string {
	return error instanceof Error && error.message ? error.message : fallback;
}

export class AgentCallServiceError extends Error {
	constructor(
		message: string,
		public readonly status = 400,
		public readonly code = -32603,
		public readonly data?: unknown
	) {
		super(message);
		this.name = 'AgentCallServiceError';
	}
}

export class BuildosAgentCallService {
	constructor(private readonly admin: any) {}

	async dial(
		request: Request,
		rawParams: unknown
	): Promise<BuildosAgentCallAcceptedResponse | BuildosAgentCallRejectedResponse> {
		const caller = await authenticateExternalAgentCaller(this.admin, request);
		const params = ensureObjectParams<BuildosAgentDialParams>(rawParams, 'call.dial');

		if (typeof params.callee_handle !== 'string' || !params.callee_handle.trim()) {
			throw new AgentCallServiceError('callee_handle is required', 400, -32602);
		}

		ensureMatchingClientDescriptor(caller, params.client);

		const buildosAgent = await resolveCalleeForCaller({
			admin: this.admin,
			callerUserId: caller.user_id,
			calleeHandle: params.callee_handle
		});

		const requestedScope = normalizeScope(params.requested_scope, 'requested_scope');
		const visibleProjects = await this.loadVisibleProjects(caller.user_id);
		const scopeResolution = normalizeGrantedScope({
			requestedScope,
			visibleProjectIds: visibleProjects.map((project) => project.id),
			callerPolicy: caller.policy,
			agentPolicy: buildosAgent.default_policy
		});

		if ('rejection' in scopeResolution) {
			const rejectedCall = await this.insertCallSession({
				userId: caller.user_id,
				buildosAgent,
				caller,
				status: 'rejected',
				requestedScope,
				grantedScope: null,
				rejectionReason: scopeResolution.rejection.reason,
				rejectionDetails: scopeResolution.rejection.details
			});

			return {
				call: {
					id: rejectedCall.id,
					status: 'rejected',
					reason: rejectedCall.rejection_reason ?? 'scope_not_allowed',
					details:
						rejectedCall.metadata &&
						typeof rejectedCall.metadata === 'object' &&
						!Array.isArray(rejectedCall.metadata)
							? ((rejectedCall.metadata.rejection_details as
									| Record<string, unknown>
									| undefined) ?? scopeResolution.rejection.details)
							: scopeResolution.rejection.details
				}
			};
		}

		const grantedScope = scopeResolution.grantedScope;

		const acceptedCall = await this.insertCallSession({
			userId: caller.user_id,
			buildosAgent,
			caller,
			status: 'accepted',
			requestedScope,
			grantedScope
		});

		return {
			call: {
				id: acceptedCall.id,
				status: 'accepted',
				callee_handle: buildosAgent.agent_handle,
				granted_scope: normalizeScope(acceptedCall.granted_scope, 'granted_scope')
			}
		};
	}

	async listTools(request: Request, rawParams: unknown): Promise<BuildosAgentToolsListResponse> {
		const caller = await authenticateExternalAgentCaller(this.admin, request);
		const params = ensureObjectParams<BuildosAgentToolsListParams>(rawParams, 'tools/list');
		const session = await this.loadUsableCallSession(
			caller,
			ensureCallId(params.call_id),
			'tools/list'
		);
		const grantedScope = normalizeScope(session.granted_scope, 'granted_scope');

		return {
			tools: getPublicBuildosAgentTools(grantedScope)
		};
	}

	async callTool(request: Request, rawParams: unknown): Promise<BuildosAgentToolCallResponse> {
		const caller = await authenticateExternalAgentCaller(this.admin, request);
		const params = ensureObjectParams<BuildosAgentToolsCallParams>(rawParams, 'tools/call');
		const session = await this.loadUsableCallSession(
			caller,
			ensureCallId(params.call_id),
			'tools/call'
		);
		const toolName = ensureToolName(params.name);
		const result = await executeBuildosAgentGatewayTool({
			admin: this.admin,
			userId: session.user_id,
			callerId: caller.id,
			callSessionId: session.id,
			scope: normalizeScope(session.granted_scope, 'granted_scope'),
			toolName,
			arguments: normalizeToolArguments(params.arguments)
		});

		return {
			content: [
				{
					type: 'text',
					text: JSON.stringify(result, null, 2)
				}
			],
			structuredContent: result
		};
	}

	async hangup(request: Request, rawParams: unknown): Promise<BuildosAgentHangupResponse> {
		const caller = await authenticateExternalAgentCaller(this.admin, request);
		const params = ensureObjectParams<BuildosAgentHangupParams>(rawParams, 'call.hangup');
		const callId = ensureCallId(params.call_id);
		const session = await this.loadCallSessionForCaller(caller, callId);

		if (session.status === 'ended') {
			return {
				call: {
					id: session.id,
					status: 'ended'
				}
			};
		}

		const { data, error } = await this.admin
			.from('agent_call_sessions')
			.update({
				status: 'ended',
				ended_at: new Date().toISOString()
			})
			.eq('id', session.id)
			.eq('external_agent_caller_id', caller.id)
			.select('*')
			.single();

		if (error || !data) {
			throw new AgentCallServiceError(
				errorMessage(error, 'Failed to end call session'),
				500,
				-32603
			);
		}

		return {
			call: {
				id: data.id,
				status: 'ended'
			}
		};
	}

	private async loadVisibleProjects(userId: string) {
		const actorId = await ensureActorId(this.admin, userId);
		return fetchProjectSummaries(this.admin, actorId);
	}

	private async insertCallSession(params: {
		userId: string;
		buildosAgent: UserBuildosAgentRecord;
		caller: ExternalAgentCallerRecord;
		status: AgentCallSessionRecord['status'];
		requestedScope: AgentCallScope;
		grantedScope: AgentCallScope | null;
		rejectionReason?: string;
		rejectionDetails?: Record<string, unknown>;
	}): Promise<AgentCallSessionRecord> {
		const { data, error } = await this.admin
			.from('agent_call_sessions')
			.insert({
				user_id: params.userId,
				user_buildos_agent_id: params.buildosAgent.id,
				external_agent_caller_id: params.caller.id,
				direction: 'inbound',
				status: params.status,
				requested_scope: params.requestedScope,
				granted_scope: params.grantedScope ?? {},
				rejection_reason: params.rejectionReason ?? null,
				metadata: {
					provider: params.caller.provider,
					caller_key: params.caller.caller_key,
					...(params.rejectionDetails
						? { rejection_details: params.rejectionDetails }
						: {})
				}
			})
			.select('*')
			.single();

		if (error || !data) {
			throw new AgentCallServiceError(
				errorMessage(error, 'Failed to create call session'),
				500,
				-32603
			);
		}

		return data as AgentCallSessionRecord;
	}

	private async loadCallSessionForCaller(
		caller: ExternalAgentCallerRecord,
		callId: string
	): Promise<AgentCallSessionRecord> {
		const { data, error } = await this.admin
			.from('agent_call_sessions')
			.select('*')
			.eq('id', callId)
			.eq('external_agent_caller_id', caller.id)
			.maybeSingle();

		if (error) {
			throw new AgentCallServiceError(
				errorMessage(error, 'Failed to load call session'),
				500,
				-32603
			);
		}

		if (!data) {
			throw new AgentCallServiceError('Call session not found', 404, -32004);
		}

		return data as AgentCallSessionRecord;
	}

	private async loadUsableCallSession(
		caller: ExternalAgentCallerRecord,
		callId: string,
		methodName: string
	): Promise<AgentCallSessionRecord> {
		const session = await this.loadCallSessionForCaller(caller, callId);

		if (session.status === 'rejected') {
			throw new AgentCallServiceError(
				`Call session was rejected and cannot be used for ${methodName}`,
				403,
				-32004,
				{
					status: session.status,
					rejection_reason: session.rejection_reason
				}
			);
		}

		if (session.status === 'ended') {
			throw new AgentCallServiceError(
				`Call session has ended and cannot be used for ${methodName}`,
				403,
				-32004,
				{
					status: session.status
				}
			);
		}

		if (session.status === 'active') {
			return session;
		}

		if (session.status !== 'accepted') {
			throw new AgentCallServiceError(
				`Call session is not usable for ${methodName}`,
				403,
				-32004,
				{
					status: session.status
				}
			);
		}

		const { data, error } = await this.admin
			.from('agent_call_sessions')
			.update({ status: 'active' })
			.eq('id', session.id)
			.eq('external_agent_caller_id', caller.id)
			.select('*')
			.single();

		if (error || !data) {
			throw new AgentCallServiceError(
				errorMessage(error, 'Failed to activate call session'),
				500,
				-32603
			);
		}

		return data as AgentCallSessionRecord;
	}
}

export function toBuildosAgentErrorResponse(error: unknown): {
	status: number;
	body: {
		error: {
			code: number;
			message: string;
			data?: unknown;
		};
	};
} {
	if (
		error instanceof AgentCallServiceError ||
		error instanceof AgentCallAuthError ||
		error instanceof AgentCallCalleeError
	) {
		return {
			status: error.status,
			body: {
				error: {
					code: error.code,
					message: error.message,
					data:
						error instanceof AgentCallCalleeError
							? { reason: error.reason }
							: error.data
				}
			}
		};
	}

	return {
		status: 500,
		body: {
			error: {
				code: -32603,
				message: errorMessage(error, 'BuildOS agent call failed')
			}
		}
	};
}
