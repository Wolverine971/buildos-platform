// packages/shared-agent-ops/src/gateway/op-execution-gateway.staging.ts
//
// Review-mode staging for gateway writes. This validates and snapshots proposed
// mutations without applying them; commit still flows through runGatewayWriteOp.
import type {
	AgentCallScope,
	BuildosAgentAllowedOp,
	Database,
	ProposedChange
} from '@buildos/shared-types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeGatewayOpName } from '../ops/gateway-op-aliases';
import {
	EXTERNAL_OP_HANDLERS,
	loadStageBeforeSnapshot,
	normalizeGatewayError
} from './op-execution-gateway.core';
import { prepareEdgeMutation } from './op-execution-gateway.edges';
import {
	loadEntityForAccess,
	normalizeEntityKind,
	resolveEntityProjectId
} from './op-execution-gateway.entity-access';
import {
	entityKindFromGatewayOp,
	proposedChangeActionForGatewayOp
} from './op-execution-gateway.mutations';
import { normalizeAndValidateGatewayWriteArgs } from './op-execution-gateway.validation';
import { ExternalToolGatewayError } from './op-execution-gateway.responses';
import type { ToolExecutionContext } from './op-execution-gateway.types';

type GatewaySupabaseClient = SupabaseClient<Database>;

async function validateStagedCreateReferences(params: {
	context: ToolExecutionContext;
	op: BuildosAgentAllowedOp;
	args: Record<string, unknown>;
}): Promise<void> {
	if (params.op !== 'onto.task.create' && params.op !== 'onto.document.create') return;
	const projectId = params.args.project_id;
	if (typeof projectId !== 'string') return;

	const refs: Array<{ kind: string; id: unknown; field: string }> = [];
	if (params.op === 'onto.document.create' && params.args.parent_document_id != null) {
		refs.push({
			kind: 'document',
			id: params.args.parent_document_id,
			field: 'parent_document_id'
		});
	}
	if (params.op === 'onto.task.create') {
		for (const [field, kind] of [
			['plan_id', 'plan'],
			['goal_id', 'goal'],
			['supporting_milestone_id', 'milestone']
		] as const) {
			if (params.args[field] != null) refs.push({ kind, id: params.args[field], field });
		}
		const parent = params.args.parent;
		if (parent && typeof parent === 'object' && !Array.isArray(parent)) {
			const record = parent as Record<string, unknown>;
			refs.push({ kind: String(record.kind ?? ''), id: record.id, field: 'parent.id' });
		}
	}

	for (const ref of refs) {
		const kind = normalizeEntityKind(ref.kind, ref.field.replace('.id', '.kind'));
		const access = await loadEntityForAccess(params.context, kind, ref.id, 'write');
		if (resolveEntityProjectId(access) !== projectId) {
			throw new ExternalToolGatewayError(
				'VALIDATION_ERROR',
				`${ref.field} must reference an entity in project_id`
			);
		}
	}
}

// Staged write ops for review-before-commit

/** Derive the ProposedChange action from the op name. */
export const deriveProposedChangeAction = proposedChangeActionForGatewayOp;

export type StageWriteOpResult =
	| { ok: true; change: Omit<ProposedChange, 'id'> }
	| {
			ok: false;
			error: {
				code: 'NOT_FOUND' | 'VALIDATION_ERROR' | 'FORBIDDEN' | 'CONFLICT' | 'INTERNAL';
				message: string;
			};
	  };

/**
 * Compute a ProposedChange for a write op WITHOUT performing the mutation
 * in review mode. Validates args the same way the commit path does,
 * derives the action/entity, and fetches a compact `before` snapshot for
 * update/delete ops so the review UI can render a diff. The `after` payload is
 * the proposed op args (what the commit will re-apply verbatim). Returns the
 * change minus its `id` — the caller (runner) assigns a stable id and records
 * telemetry against it.
 */
export async function stageGatewayWriteOp(params: {
	admin: GatewaySupabaseClient;
	userId: string;
	scope: AgentCallScope;
	op: string;
	args?: Record<string, unknown>;
	rationale?: string;
}): Promise<StageWriteOpResult> {
	const canonicalOp = normalizeGatewayOpName(
		typeof params.op === 'string' ? params.op.trim() : ''
	) as BuildosAgentAllowedOp;
	const handler = EXTERNAL_OP_HANDLERS[canonicalOp];
	if (!handler) {
		return {
			ok: false,
			error: { code: 'NOT_FOUND', message: `No worker write handler for op: ${canonicalOp}` }
		};
	}

	const preparedArgs = normalizeAndValidateGatewayWriteArgs(canonicalOp, params.args);
	if (!preparedArgs.ok) {
		return {
			ok: false,
			error: preparedArgs.error
		};
	}
	let args = preparedArgs.args;
	if (canonicalOp === 'onto.edge.link') {
		try {
			const preparedEdge = await prepareEdgeMutation(
				{
					admin: params.admin,
					userId: params.userId,
					scope: params.scope
				} as ToolExecutionContext,
				args
			);
			args = {
				...preparedEdge.normalized,
				project_id: preparedEdge.project.id
			};
		} catch (error) {
			const normalized = normalizeGatewayError(error);
			return {
				ok: false,
				error: {
					code: normalized.code,
					message: normalized.message
				}
			};
		}
	}
	try {
		await validateStagedCreateReferences({
			context: {
				admin: params.admin,
				userId: params.userId,
				scope: params.scope
			} as ToolExecutionContext,
			op: canonicalOp,
			args
		});
	} catch (error) {
		const normalized = normalizeGatewayError(error);
		return {
			ok: false,
			error: {
				code: normalized.code,
				message: normalized.message
			}
		};
	}

	const action = deriveProposedChangeAction(canonicalOp);
	const entityKind = entityKindFromGatewayOp(canonicalOp) ?? 'unknown';

	let entityId: string | undefined;
	let before: Record<string, unknown> | undefined;

	// For update/delete of a core entity, fetch a compact current snapshot.
	if (action !== 'create') {
		try {
			const snapshot = await loadStageBeforeSnapshot({
				admin: params.admin,
				userId: params.userId,
				scope: params.scope,
				entityKind,
				args
			});
			entityId = snapshot.entityId;
			before = snapshot.before;
		} catch (error) {
			const normalized = normalizeGatewayError(error);
			return {
				ok: false,
				error: {
					code: normalized.code,
					message: normalized.message
				}
			};
		}
	}

	return {
		ok: true,
		change: {
			op: canonicalOp,
			entity_type: entityKind,
			entity_id: entityId,
			action,
			before,
			after: args,
			rationale: params.rationale ?? `Proposed ${action} of ${entityKind}`,
			decision: 'pending'
		}
	};
}
