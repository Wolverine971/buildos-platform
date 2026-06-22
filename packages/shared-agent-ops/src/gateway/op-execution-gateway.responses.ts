// packages/shared-agent-ops/src/gateway/op-execution-gateway.responses.ts
//
// Response, error, and audit-shaping helpers for the gateway execution boundary.
import { isValidUUID } from '@buildos/shared-types';
import type { BuildosAgentAllowedOp } from '@buildos/shared-types';
import { AgentCallWritePendingError, AgentCallWriteReplayError } from './write-audit.service';
import { entityKindFromGatewayOp } from './op-execution-gateway.mutations';

export type GatewayErrorCode =
	| 'NOT_FOUND'
	| 'VALIDATION_ERROR'
	| 'FORBIDDEN'
	| 'CONFLICT'
	| 'INTERNAL';

export class ExternalToolGatewayError extends Error {
	constructor(
		public readonly code: GatewayErrorCode,
		message: string,
		public readonly details?: Record<string, unknown>
	) {
		super(message);
		this.name = 'ExternalToolGatewayError';
	}
}

export function normalizeGatewayError(error: unknown): ExternalToolGatewayError {
	if (error instanceof ExternalToolGatewayError) {
		return error;
	}

	if (error instanceof AgentCallWritePendingError) {
		return new ExternalToolGatewayError(
			'CONFLICT',
			'An idempotent write with this key is already in progress'
		);
	}

	if (error instanceof AgentCallWriteReplayError) {
		return new ExternalToolGatewayError('INTERNAL', error.message);
	}

	return new ExternalToolGatewayError(
		'INTERNAL',
		error instanceof Error ? error.message : 'Tool execution failed'
	);
}

export type WriteEntityMeta = {
	entityKind?: string;
	entityId?: string;
	entityProjectId?: string;
	entityTitle?: string;
};

function stringField(record: Record<string, unknown>, ...keys: string[]): string | undefined {
	for (const key of keys) {
		const value = record[key];
		if (typeof value === 'string' && value.trim()) {
			return value.trim();
		}
	}
	return undefined;
}

function metaFromEntityRecord(
	kind: string,
	record: Record<string, unknown>,
	options: { idField?: string; fallbackProjectId?: string; fallbackTitle?: string } = {}
): WriteEntityMeta {
	const rawId = record[options.idField ?? 'id'];
	const entityId = typeof rawId === 'string' && isValidUUID(rawId) ? rawId : undefined;
	const entityProjectId =
		kind === 'project'
			? entityId
			: (stringField(record, 'project_id') ?? options.fallbackProjectId);
	const entityTitle = stringField(record, 'title', 'name', 'summary') ?? options.fallbackTitle;
	return {
		entityKind: entityId ? kind : undefined,
		entityId,
		entityProjectId,
		entityTitle
	};
}

export function extractWriteEntityMeta(params: {
	op: BuildosAgentAllowedOp;
	result: Record<string, unknown>;
}): WriteEntityMeta {
	if (params.op === 'onto.edge.link') {
		const edge = params.result.edge;
		if (edge && typeof edge === 'object' && !Array.isArray(edge)) {
			const edgeRecord = edge as Record<string, unknown>;
			return metaFromEntityRecord('edge', edgeRecord, {
				fallbackTitle: [
					stringField(edgeRecord, 'src_kind'),
					stringField(edgeRecord, 'rel'),
					stringField(edgeRecord, 'dst_kind')
				]
					.filter(Boolean)
					.join(' ')
			});
		}
	}

	if (params.op === 'onto.edge.unlink') {
		const entityId = params.result.edge_id;
		if (typeof entityId === 'string' && isValidUUID(entityId)) {
			return {
				entityKind: 'edge',
				entityId,
				entityProjectId: stringField(params.result, 'project_id')
			};
		}
	}

	if (params.op === 'onto.task.docs.create_or_attach') {
		const document = params.result.document;
		if (document && typeof document === 'object' && !Array.isArray(document)) {
			return metaFromEntityRecord('document', document as Record<string, unknown>);
		}
	}

	if (params.op === 'onto.document.tree.move') {
		return metaFromEntityRecord('document', params.result, {
			idField: 'document_id',
			fallbackProjectId: stringField(params.result, 'project_id')
		});
	}

	const entityKeyMap: Array<{ prefix: string; kind: string; resultKey: string }> = [
		{ prefix: 'onto.task.', kind: 'task', resultKey: 'task' },
		{ prefix: 'onto.document.', kind: 'document', resultKey: 'document' },
		{ prefix: 'onto.project.', kind: 'project', resultKey: 'project' },
		{ prefix: 'onto.goal.', kind: 'goal', resultKey: 'goal' },
		{ prefix: 'onto.plan.', kind: 'plan', resultKey: 'plan' },
		{ prefix: 'onto.milestone.', kind: 'milestone', resultKey: 'milestone' },
		{ prefix: 'onto.risk.', kind: 'risk', resultKey: 'risk' },
		{ prefix: 'cal.event.', kind: 'event', resultKey: 'event' }
	];

	for (const { prefix, kind, resultKey } of entityKeyMap) {
		if (!params.op.startsWith(prefix)) continue;
		const entity = params.result[resultKey];
		if (entity && typeof entity === 'object' && !Array.isArray(entity)) {
			return metaFromEntityRecord(kind, entity as Record<string, unknown>);
		}
	}

	return {};
}

function compactRecordForAudit(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return null;
	}

	const record = value as Record<string, unknown>;
	const compact: Record<string, unknown> = {};

	for (const key of ['id', 'project_id', 'project_name', 'title', 'name']) {
		const entry = record[key];
		if (typeof entry === 'string' && entry.trim()) {
			compact[key] = entry;
		}
	}

	return Object.keys(compact).length > 0 ? compact : null;
}

export function buildToolExecutionAuditPayload(params: {
	response: Record<string, unknown>;
	canonicalOp: BuildosAgentAllowedOp;
	result: Record<string, unknown>;
}): {
	responsePayload: Record<string, unknown>;
	entityKind?: string;
	entityId?: string;
} {
	const entityMeta = extractWriteEntityMeta({
		op: params.canonicalOp,
		result: params.result
	});
	const entityKind = entityMeta.entityKind ?? entityKindFromGatewayOp(params.canonicalOp);
	const responseMeta =
		params.response.meta &&
		typeof params.response.meta === 'object' &&
		!Array.isArray(params.response.meta)
			? (params.response.meta as Record<string, unknown>)
			: null;
	const resultSummary: Record<string, unknown> = {};

	if (entityKind) {
		const compactEntity = compactRecordForAudit(params.result[entityKind]);
		if (compactEntity) {
			resultSummary[entityKind] = compactEntity;
		}
	}

	const compactProject = compactRecordForAudit(params.result.project);
	if (compactProject) {
		resultSummary.project = compactProject;
	}

	for (const countKey of ['total', 'count']) {
		const value = params.result[countKey];
		if (typeof value === 'number' && Number.isFinite(value)) {
			resultSummary[countKey] = value;
		}
	}

	if (Array.isArray(params.result.results)) {
		resultSummary.result_count = params.result.results.length;
	}

	return {
		responsePayload: {
			op: params.response.op ?? params.canonicalOp,
			ok: params.response.ok === true,
			result: resultSummary,
			...(responseMeta ? { meta: responseMeta } : {})
		},
		...(entityKind ? { entityKind } : {}),
		...(entityMeta.entityId ? { entityId: entityMeta.entityId } : {})
	};
}

export function buildGatewayResponseMeta(params: {
	requestedOp: string;
	canonicalOp: string;
	warnings: string[];
	extra?: Record<string, unknown>;
}): Record<string, unknown> | undefined {
	const meta: Record<string, unknown> = {
		...(params.canonicalOp !== params.requestedOp ? { executed_op: params.canonicalOp } : {}),
		...(params.warnings.length > 0 ? { warnings: params.warnings } : {}),
		...(params.extra ?? {})
	};

	return Object.keys(meta).length > 0 ? meta : undefined;
}

export function buildGatewaySuccessResponse(params: {
	requestedOp: string;
	canonicalOp: string;
	result: Record<string, unknown>;
	warnings: string[];
	meta?: Record<string, unknown>;
}): Record<string, unknown> {
	const responseMeta = buildGatewayResponseMeta({
		requestedOp: params.requestedOp,
		canonicalOp: params.canonicalOp,
		warnings: params.warnings,
		extra: params.meta
	});

	return {
		op: params.requestedOp,
		ok: true,
		result: params.result,
		...(responseMeta ? { meta: responseMeta } : {})
	};
}

export function buildExecError(
	requestedOp: string,
	code: GatewayErrorCode,
	message: string,
	helpPath?: string,
	details?: Record<string, unknown>
) {
	return {
		op: requestedOp,
		ok: false,
		error: {
			code,
			message,
			...(helpPath ? { help_path: helpPath } : {}),
			...(details ? { details } : {})
		}
	};
}
