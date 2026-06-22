// packages/shared-agent-ops/src/gateway/op-execution-gateway.staging.ts
//
// Review-mode staging for gateway writes. This validates and snapshots proposed
// mutations without applying them; commit still flows through runGatewayWriteOp.
import type {
	BuildosAgentAllowedOp,
	ProposedChange,
	ProposedChangeAction
} from '@buildos/shared-types';
import { normalizeGatewayOpName } from '../ops/gateway-op-aliases';
import {
	EXTERNAL_OP_HANDLERS,
	entityKindFromGatewayOp,
	loadStageBeforeSnapshot
} from './op-execution-gateway.core';
import { normalizeAndValidateGatewayWriteArgs } from './op-execution-gateway.validation';

// Staged write ops for review-before-commit

/** Derive the ProposedChange action from the op name. */
export function deriveProposedChangeAction(op: string): ProposedChangeAction {
	if (op === 'onto.edge.unlink') return 'delete';
	if (
		op.endsWith('.create') ||
		op === 'onto.edge.link' ||
		op === 'onto.task.docs.create_or_attach'
	) {
		return 'create';
	}
	// *.update, onto.document.tree.move, archive-via-update
	return 'update';
}

export type StageWriteOpResult =
	| { ok: true; change: Omit<ProposedChange, 'id'> }
	| {
			ok: false;
			error: { code: 'NOT_FOUND' | 'VALIDATION_ERROR' | 'INTERNAL'; message: string };
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
	// `any` matches ToolExecutionContext.admin (see runGatewayWriteOp); callers
	// pass a real SupabaseClient<Database>.
	admin: any;
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
	const args = preparedArgs.args;

	const action = deriveProposedChangeAction(canonicalOp);
	const entityKind = entityKindFromGatewayOp(canonicalOp) ?? 'unknown';

	let entityId: string | undefined;
	let before: Record<string, unknown> | undefined;

	// For update/delete of a core entity, fetch a compact current snapshot.
	if (action !== 'create') {
		const snapshot = await loadStageBeforeSnapshot({
			admin: params.admin,
			entityKind,
			args
		});
		entityId = snapshot.entityId;
		before = snapshot.before;
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
