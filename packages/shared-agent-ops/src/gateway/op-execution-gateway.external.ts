// packages/shared-agent-ops/src/gateway/op-execution-gateway.external.ts
import type { AgentCallScope, BuildosAgentAllowedOp, Database } from '@buildos/shared-types';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	defaultAllowedOpsForMode,
	isSupportedOp,
	isWriteOp,
	requiredScopeModeForOp
} from '../policy';
import {
	AgentCallWritePendingError,
	AgentCallWriteReplayError,
	recordToolExecutionFailure,
	recordToolExecutionSuccess,
	recordWriteExecutionFailure,
	recordWriteExecutionSuccess,
	reserveWriteExecution
} from './write-audit.service';
import { logSecurityEvent, type SecurityEventLogOptions } from '../ops/security-event-logger';
import {
	ARCHIVABLE_ENTITY_KINDS,
	CORE_ENTITY_CONFIG,
	EXTERNAL_CUSTOM_OPS,
	EXTERNAL_WRITE_OP_SCHEMAS,
	withExternalArchiveUpdateParameter,
	type ExternalLinkEntityKind
} from './op-execution-gateway.config';
import type {
	CalendarPort,
	ExternalGatewayRegistry,
	ExternalGatewayRegistryEntry,
	RegistryOp,
	TaskSyncPort,
	ToolExecutionContext
} from './op-execution-gateway.types';
import { entityKindFromGatewayOp } from './op-execution-gateway.mutations';
import {
	normalizeAndValidateGatewayArgs,
	type GatewayLegacyArgAliasUsage
} from './op-execution-gateway.validation';
import {
	ExternalToolGatewayError,
	buildExecError,
	buildGatewaySuccessResponse,
	buildToolExecutionAuditPayload,
	extractWriteEntityMeta,
	normalizeGatewayError
} from './op-execution-gateway.responses';
import {
	assertProjectWriteAccess,
	explainMergedProjectRefusal,
	getProjectIdsForVisibleContext,
	loadVisibleProjects
} from './op-execution-gateway.access';
import {
	createCalendarEvent,
	deleteCalendarEvent,
	getCalendarEventDetails,
	getProjectCalendar,
	listCalendarEvents,
	setProjectCalendar,
	updateCalendarEvent
} from './op-execution-gateway.calendar';
import { getProjectStatus } from './op-execution-gateway.project-status';
import { getAsset, searchAssets, updateAsset } from './op-execution-gateway.assets';
import { assertValidId } from './op-execution-gateway.ids';
import {
	getProject,
	listProjects,
	searchProjects,
	updateProject
} from './op-execution-gateway.projects';
import {
	createGoal,
	createMilestone,
	createPlan,
	createRisk,
	getGoal,
	getMilestone,
	getPlan,
	getRisk,
	listGoals,
	listMilestones,
	listPlans,
	listRisks,
	searchGoals,
	searchMilestones,
	searchPlans,
	searchRisks,
	updateGoal,
	updateMilestone,
	updatePlan,
	updateRisk
} from './op-execution-gateway.core-entities';
import {
	createTask,
	getTask,
	listTasks,
	searchTasks,
	updateTask
} from './op-execution-gateway.tasks';
import { linkOntoEntities, unlinkOntoEdge } from './op-execution-gateway.edges';
import { normalizeArchivedUpdate } from './op-execution-gateway.normalization';
import { searchOntology } from './op-execution-gateway.search';
import {
	createTable,
	getTable,
	listTables,
	queryTableRows,
	updateTable,
	updateTableRows
} from './op-execution-gateway.tables';
import {
	listTaskDocuments,
	createTaskDocument,
	listDocuments,
	searchDocuments,
	getDocument,
	createDocument,
	updateDocument,
	getDocumentTree,
	moveDocumentInTree,
	getDocumentPath
} from './op-execution-gateway.documents';
import { getProjectGraph, createProject } from './op-execution-gateway.projects';
import { getEntityRelationships, getLinkedEntities } from './op-execution-gateway.relationships';

type GatewaySupabaseClient = SupabaseClient<Database>;

export const EXTERNAL_OP_HANDLERS: Record<
	BuildosAgentAllowedOp,
	(
		context: ToolExecutionContext,
		args: Record<string, unknown>
	) => Promise<Record<string, unknown>>
> = {
	'onto.project.list': listProjects,
	'onto.project.search': searchProjects,
	'onto.project.get': getProject,
	'onto.project.status.get': getProjectStatus,
	'onto.project.graph.get': getProjectGraph,
	'onto.task.list': listTasks,
	'onto.task.search': searchTasks,
	'onto.task.get': getTask,
	'onto.task.create': createTask,
	'onto.task.update': updateTask,
	'onto.task.docs.list': listTaskDocuments,
	'onto.task.docs.create_or_attach': createTaskDocument,
	'onto.document.list': listDocuments,
	'onto.document.search': searchDocuments,
	'onto.document.get': getDocument,
	'onto.document.create': createDocument,
	'onto.document.update': updateDocument,
	'onto.document.tree.get': getDocumentTree,
	'onto.document.tree.move': moveDocumentInTree,
	'onto.document.path.get': getDocumentPath,
	'onto.goal.list': listGoals,
	'onto.goal.search': searchGoals,
	'onto.goal.get': getGoal,
	'onto.plan.list': listPlans,
	'onto.plan.search': searchPlans,
	'onto.plan.get': getPlan,
	'onto.milestone.list': listMilestones,
	'onto.milestone.search': searchMilestones,
	'onto.milestone.get': getMilestone,
	'onto.risk.list': listRisks,
	'onto.risk.search': searchRisks,
	'onto.risk.get': getRisk,
	'onto.asset.search': searchAssets,
	'onto.asset.get': getAsset,
	'onto.table.get': getTable,
	'onto.table.rows.query': queryTableRows,
	'onto.table.list': listTables,
	'onto.entity.relationships.get': getEntityRelationships,
	'onto.entity.links.get': getLinkedEntities,
	'onto.search': searchOntology,
	'cal.event.list': listCalendarEvents,
	'cal.event.get': getCalendarEventDetails,
	'cal.event.create': createCalendarEvent,
	'cal.event.update': updateCalendarEvent,
	'cal.event.delete': deleteCalendarEvent,
	'cal.project.get': getProjectCalendar,
	'cal.project.set': setProjectCalendar,
	'onto.project.create': createProject,
	'onto.project.update': updateProject,
	'onto.goal.create': createGoal,
	'onto.goal.update': updateGoal,
	'onto.plan.create': createPlan,
	'onto.plan.update': updatePlan,
	'onto.milestone.create': createMilestone,
	'onto.milestone.update': updateMilestone,
	'onto.risk.create': createRisk,
	'onto.risk.update': updateRisk,
	'onto.edge.link': linkOntoEntities,
	'onto.edge.unlink': unlinkOntoEdge,
	'onto.asset.update': updateAsset,
	'onto.table.create': createTable,
	'onto.table.update': updateTable,
	'onto.table.rows.update': updateTableRows
};

export function buildRegistryVersion(registryVersion: string, opNames: string[]): string {
	return `${registryVersion}/external/${opNames.join(',')}`;
}

export function buildExternalToolDescription(entry: RegistryOp): string {
	const scopeNotice =
		'Only projects in the caller-approved BuildOS scope are visible; public project visibility does not grant connector access.';

	if (entry.op === 'onto.project.create') {
		return `${entry.description} Project creation requires read_write access with onto.project.create whitelisted. A project-scoped key may create projects; each project it creates is automatically added to the key's scope. ${scopeNotice}`;
	}

	if (entry.group !== 'cal') {
		return `${entry.description} ${scopeNotice}`;
	}

	return `${entry.description} External callers must scope calendar access to an allowed project_id or task_id; broad user calendar access is not exposed through the BuildOS call gateway. ${scopeNotice}`;
}

function ensureWriteExecutionContext(
	context: ToolExecutionContext,
	op: BuildosAgentAllowedOp
): { callerId: string; callSessionId: string } {
	if (!context.callerId || !context.callSessionId) {
		throw new ExternalToolGatewayError('INTERNAL', `Missing write execution context for ${op}`);
	}

	return {
		callerId: context.callerId,
		callSessionId: context.callSessionId
	};
}

async function logGatewayCompatibilityAliasUsage(params: {
	admin: GatewaySupabaseClient;
	userId: string;
	callerId?: string;
	callSessionId?: string;
	scope: AgentCallScope;
	requestedOp: string;
	canonicalOp: string;
	argAliasesUsed?: GatewayLegacyArgAliasUsage[];
	securityEventOptions?: SecurityEventLogOptions;
}): Promise<void> {
	// Legacy ARGUMENT aliases only. The op-name alias table was deleted in
	// one-engine stage S9; there is one op name space now.
	const argAliasesUsed = params.argAliasesUsed ?? [];
	if (argAliasesUsed.length === 0) {
		return;
	}

	await logSecurityEvent(
		{
			eventType: 'agent.tool.alias_used',
			category: 'agent',
			outcome: 'info',
			severity: 'low',
			actorType: 'external_agent',
			actorUserId: params.userId,
			externalAgentCallerId: params.callerId ?? null,
			sessionId: params.callSessionId ?? null,
			reason: 'gateway_compatibility_alias',
			metadata: {
				requestedOp: params.requestedOp,
				canonicalOp: params.canonicalOp,
				scopeMode: params.scope.mode,
				argAliasesUsed
			}
		},
		{ ...(params.securityEventOptions ?? {}), supabase: params.admin }
	);
}

export function buildExternalGatewayRegistry(
	scope: AgentCallScope,
	registryOps: Record<string, RegistryOp>,
	registryVersion: string
): ExternalGatewayRegistry {
	const allowedOps = (scope.allowed_ops ?? defaultAllowedOpsForMode(scope.mode)).filter((op) =>
		scope.mode === 'read_write' ? true : !isWriteOp(op)
	);
	const ops: Record<string, ExternalGatewayRegistryEntry> = {};

	for (const op of allowedOps) {
		// A gateway custom op owns its external contract even when the chat
		// catalog also mounts a leaner tool for the same op (the asset reads,
		// 2026-09-22): MCP callers keep the exact schema they were given.
		const entry = EXTERNAL_CUSTOM_OPS[op] ?? registryOps[op];
		const handler = EXTERNAL_OP_HANDLERS[op];
		if (!entry || !handler) continue;
		const parametersSchema =
			EXTERNAL_WRITE_OP_SCHEMAS[op] ??
			withExternalArchiveUpdateParameter(op, entry.parameters_schema);
		ops[op] = {
			...entry,
			parameters_schema: parametersSchema,
			required_scope_mode: isWriteOp(op) ? 'read_write' : 'read_only',
			handler
		};
	}

	return {
		version: buildRegistryVersion(registryVersion, Object.keys(ops).sort()),
		ops
	};
}

export async function executeGatewayOp(params: {
	admin: GatewaySupabaseClient;
	userId: string;
	callerId?: string;
	oauthGrantId?: string;
	projectScopeMode?: import('@buildos/shared-types').BuildosAgentProjectScopeMode;
	callSessionId?: string;
	scope: AgentCallScope;
	arguments?: Record<string, unknown>;
	securityEventOptions?: SecurityEventLogOptions;
	registryOps: Record<string, RegistryOp>;
	registryVersion: string;
	calendar?: CalendarPort;
	taskSync?: TaskSyncPort;
}): Promise<Record<string, unknown>> {
	const registry = buildExternalGatewayRegistry(
		params.scope,
		params.registryOps,
		params.registryVersion
	);
	const input = params.arguments ?? {};
	const requestedOp = typeof input.op === 'string' ? input.op.trim() : '';

	if (!requestedOp) {
		return buildExecError('', 'VALIDATION_ERROR', 'Missing op', 'root');
	}

	// One op name space (2026-09-04, one-engine stage S9). The 33-entry legacy
	// alias table that used to sit here already only produced a NOT_FOUND, and 90
	// days of `agent_call_tool_executions` (964 ops) and `chat_tool_executions`
	// (3,537 tool names) contain no alias form. The requested op IS the canonical
	// op; an unrecognized one falls through to the same unknown-op error below,
	// which names it.
	const canonicalOp = requestedOp;
	const allowedOps = params.scope.allowed_ops ?? defaultAllowedOpsForMode(params.scope.mode);
	const entry = registry.ops[canonicalOp];
	if (!entry) {
		if (isSupportedOp(canonicalOp)) {
			await logSecurityEvent(
				{
					eventType: 'agent.tool.denied',
					category: 'agent',
					outcome: 'denied',
					severity: 'medium',
					actorType: 'external_agent',
					actorUserId: params.userId,
					externalAgentCallerId: params.callerId ?? null,
					sessionId: params.callSessionId ?? null,
					reason: 'op_outside_granted_scope',
					metadata: {
						requestedOp,
						canonicalOp,
						grantedScopeMode: params.scope.mode,
						requiredScopeMode: requiredScopeModeForOp(canonicalOp),
						allowedOps
					}
				},
				{ ...(params.securityEventOptions ?? {}), supabase: params.admin }
			);
			return buildExecError(
				requestedOp,
				'FORBIDDEN',
				`Op ${canonicalOp} is outside the granted BuildOS call scope`,
				canonicalOp,
				{
					granted_scope_mode: params.scope.mode,
					required_scope_mode: requiredScopeModeForOp(canonicalOp),
					allowed_ops: allowedOps
				}
			);
		}

		return buildExecError(requestedOp, 'NOT_FOUND', `Unknown op: ${requestedOp}`, 'root');
	}

	const preparedArgs = normalizeAndValidateGatewayArgs({
		op: canonicalOp as BuildosAgentAllowedOp,
		args: input.args,
		schema: entry.parameters_schema,
		allowLegacyAliases: false
	});
	await logGatewayCompatibilityAliasUsage({
		admin: params.admin,
		userId: params.userId,
		callerId: params.callerId,
		callSessionId: params.callSessionId,
		scope: params.scope,
		requestedOp,
		canonicalOp,
		argAliasesUsed: preparedArgs.legacyAliasesUsed,
		securityEventOptions: params.securityEventOptions
	});
	if (!preparedArgs.ok) {
		return buildExecError(
			requestedOp,
			preparedArgs.error.code,
			preparedArgs.error.message,
			canonicalOp
		);
	}
	const opArgs = preparedArgs.args;

	const warnings: string[] = [];
	if (canonicalOp !== requestedOp) {
		warnings.push(`Normalized legacy op "${requestedOp}" to "${canonicalOp}".`);
	}
	if (input.dry_run === true && !isWriteOp(canonicalOp)) {
		warnings.push('dry_run ignored for external read operations.');
	}
	if (
		typeof input.idempotency_key === 'string' &&
		input.idempotency_key.trim() &&
		!isWriteOp(canonicalOp)
	) {
		warnings.push('idempotency_key ignored for external read operations.');
	}

	if (input.dry_run === true && isWriteOp(canonicalOp)) {
		return buildGatewaySuccessResponse({
			requestedOp,
			canonicalOp,
			result: {
				dry_run: true,
				op: canonicalOp,
				args: opArgs
			},
			warnings
		});
	}

	let executionContext: { callerId: string; callSessionId: string } | null = null;
	if (isWriteOp(canonicalOp)) {
		try {
			executionContext = ensureWriteExecutionContext(
				{
					admin: params.admin,
					userId: params.userId,
					callerId: params.callerId,
					callSessionId: params.callSessionId,
					scope: params.scope
				},
				canonicalOp
			);
		} catch (error) {
			const normalized = normalizeGatewayError(error);
			return buildExecError(
				requestedOp,
				normalized.code,
				normalized.message,
				canonicalOp,
				normalized.details
			);
		}
	}
	const rawIdempotencyKey =
		typeof input.idempotency_key === 'string' ? input.idempotency_key.trim() : '';
	const idempotencyKey = rawIdempotencyKey.length > 0 ? rawIdempotencyKey : undefined;
	let executionId: string | null = null;

	if (isWriteOp(canonicalOp) && executionContext) {
		try {
			const reservation = await reserveWriteExecution({
				admin: params.admin,
				callSessionId: executionContext.callSessionId,
				callerId: executionContext.callerId,
				userId: params.userId,
				op: canonicalOp,
				args: opArgs,
				idempotencyKey,
				securityEventOptions: params.securityEventOptions
			});
			executionId = reservation.executionId;
		} catch (error) {
			if (error instanceof AgentCallWriteReplayError) {
				const replayedResponse = error.responsePayload;
				const replayedMeta =
					replayedResponse.meta &&
					typeof replayedResponse.meta === 'object' &&
					!Array.isArray(replayedResponse.meta)
						? (replayedResponse.meta as Record<string, unknown>)
						: {};

				return {
					...replayedResponse,
					meta: {
						...replayedMeta,
						replayed: true
					}
				};
			}

			if (error instanceof AgentCallWritePendingError) {
				return buildExecError(
					requestedOp,
					'CONFLICT',
					error.message,
					canonicalOp,
					idempotencyKey ? { idempotency_key: idempotencyKey } : undefined
				);
			}

			const normalized = normalizeGatewayError(error);
			return buildExecError(
				requestedOp,
				normalized.code,
				normalized.message,
				canonicalOp,
				normalized.details
			);
		}
	}
	const downstreamIdempotencyKey =
		idempotencyKey && executionContext
			? `agent-call:${executionContext.callerId}:${canonicalOp}:${idempotencyKey}`
			: undefined;

	const executionStartedAt = new Date().toISOString();

	try {
		const result = await entry.handler(
			{
				admin: params.admin,
				userId: params.userId,
				callerId: params.callerId,
				oauthGrantId: params.oauthGrantId,
				projectScopeMode: params.projectScopeMode,
				callSessionId: params.callSessionId,
				scope: params.scope,
				calendar: params.calendar,
				taskSync: params.taskSync,
				downstreamIdempotencyKey
			},
			opArgs
		);
		const response = buildGatewaySuccessResponse({
			requestedOp,
			canonicalOp,
			result,
			warnings
		});

		if (isWriteOp(canonicalOp) && executionContext) {
			const entityMeta = extractWriteEntityMeta({ op: canonicalOp, result });
			try {
				await recordWriteExecutionSuccess({
					admin: params.admin,
					executionId,
					callSessionId: executionContext.callSessionId,
					callerId: executionContext.callerId,
					userId: params.userId,
					op: canonicalOp,
					idempotencyKey,
					args: opArgs,
					responsePayload: response,
					entityKind: entityMeta.entityKind,
					entityId: entityMeta.entityId,
					startedAt: executionStartedAt,
					securityEventOptions: params.securityEventOptions
				});
			} catch (auditError) {
				console.error(
					'[External Tool Gateway] Failed to record write success:',
					auditError
				);
			}
		} else if (!isWriteOp(canonicalOp)) {
			const auditPayload = buildToolExecutionAuditPayload({
				response,
				canonicalOp: canonicalOp as BuildosAgentAllowedOp,
				result
			});
			try {
				await recordToolExecutionSuccess({
					admin: params.admin,
					callSessionId: params.callSessionId,
					callerId: params.callerId,
					userId: params.userId,
					op: canonicalOp,
					args: opArgs,
					responsePayload: auditPayload.responsePayload,
					entityKind: auditPayload.entityKind,
					entityId: auditPayload.entityId,
					startedAt: executionStartedAt
				});
			} catch (auditError) {
				console.error('[External Tool Gateway] Failed to record tool success:', auditError);
			}
		}

		return response;
	} catch (error) {
		// A call aimed at a combined project says where it went (tasker 122).
		const normalized = await explainMergedProjectRefusal(
			{ admin: params.admin, userId: params.userId, scope: params.scope },
			normalizeGatewayError(error)
		);
		if (normalized.code === 'FORBIDDEN') {
			await logSecurityEvent(
				{
					eventType: 'agent.tool.denied',
					category: 'agent',
					outcome: 'denied',
					severity: 'medium',
					actorType: 'external_agent',
					actorUserId: params.userId,
					externalAgentCallerId: params.callerId ?? null,
					sessionId: params.callSessionId ?? null,
					reason: normalized.message,
					metadata: {
						requestedOp,
						canonicalOp,
						grantedScopeMode: params.scope.mode,
						errorCode: normalized.code,
						details: normalized.details ?? null
					}
				},
				{ ...(params.securityEventOptions ?? {}), supabase: params.admin }
			);
		}
		const response = buildExecError(
			requestedOp,
			normalized.code,
			normalized.message,
			canonicalOp,
			normalized.details
		);

		if (isWriteOp(canonicalOp) && executionContext) {
			try {
				await recordWriteExecutionFailure({
					admin: params.admin,
					executionId,
					callSessionId: executionContext.callSessionId,
					callerId: executionContext.callerId,
					userId: params.userId,
					op: canonicalOp,
					idempotencyKey,
					args: opArgs,
					errorPayload: response.error,
					securityEventOptions: params.securityEventOptions
				});
			} catch (auditError) {
				console.error(
					'[External Tool Gateway] Failed to record write failure:',
					auditError
				);
			}
		} else if (!isWriteOp(canonicalOp)) {
			try {
				await recordToolExecutionFailure({
					admin: params.admin,
					callSessionId: params.callSessionId,
					callerId: params.callerId,
					userId: params.userId,
					op: canonicalOp,
					args: opArgs,
					errorPayload: response.error,
					entityKind: entityKindFromGatewayOp(canonicalOp) ?? undefined,
					startedAt: executionStartedAt
				});
			} catch (auditError) {
				console.error('[External Tool Gateway] Failed to record tool failure:', auditError);
			}
		}

		return response;
	}
}

export async function loadStageBeforeSnapshot(params: {
	admin: any;
	userId: string;
	scope: AgentCallScope;
	entityKind: string;
	args: Record<string, unknown>;
}): Promise<{ entityId?: string; before?: Record<string, unknown> }> {
	const cfg = (
		CORE_ENTITY_CONFIG as Record<string, { table: string; idArg: string; select: string }>
	)[params.entityKind];
	if (!cfg) {
		return {};
	}

	const idVal = params.args[cfg.idArg];
	if (typeof idVal !== 'string' || !idVal) {
		return {};
	}

	const entityId = assertValidId(idVal, cfg.idArg);
	const visible = await loadVisibleProjects({
		admin: params.admin,
		userId: params.userId,
		scope: params.scope
	});
	const projectIds = getProjectIdsForVisibleContext(visible);
	if (projectIds.length === 0) {
		throw new ExternalToolGatewayError('NOT_FOUND', `${params.entityKind} not found`);
	}

	let query = params.admin.from(cfg.table).select(cfg.select).eq('id', entityId);
	query =
		params.entityKind === 'project'
			? query.in('id', projectIds)
			: query.in('project_id', projectIds);
	if (ARCHIVABLE_ENTITY_KINDS.has(params.entityKind as ExternalLinkEntityKind)) {
		const archivedAtUpdate = normalizeArchivedUpdate(params.args.archived);
		if (archivedAtUpdate !== null) {
			query = query.is('archived_at', null);
		}
	}

	const { data, error } = await query.maybeSingle();
	if (error) {
		throw new ExternalToolGatewayError(
			'INTERNAL',
			error.message || `Failed to load ${params.entityKind}`
		);
	}
	if (!data) {
		throw new ExternalToolGatewayError('NOT_FOUND', `${params.entityKind} not found`);
	}

	const before = data as Record<string, unknown>;
	const projectId = params.entityKind === 'project' ? entityId : before.project_id;
	if (typeof projectId !== 'string') {
		throw new ExternalToolGatewayError('INTERNAL', 'Entity project_id is invalid');
	}
	const project = visible.projects.find((candidate) => candidate.id === projectId);
	if (!project) {
		throw new ExternalToolGatewayError('NOT_FOUND', `${params.entityKind} not found`);
	}
	assertProjectWriteAccess(project, params.scope);

	return { entityId, before };
}
