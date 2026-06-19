// packages/shared-agent-ops/src/gateway/op-execution.ts
//
// Worker-safe Agent Run op execution (Phase 1b foundation).
//
// A self-contained dispatcher the worker runner calls to execute BuildOS ops
// in-process — no SvelteKit, no chat session. It reuses the already-extracted
// ontology services and the shared scope/op policy.
//
// SCOPE (read-first): this initial cut implements READ ops only. Write ops and
// full convergence with the web agent-call gateway's handler catalog
// (external-tool-gateway.ts EXTERNAL_OP_HANDLERS) are tracked follow-on work —
// the gateway handler map is ~5,100 lines and entangled with the deferred
// calendar/GoogleOAuth code, so it is NOT carved here. See
// SHARED_AGENT_OPS_EXTRACTION_PLAN.md (Wave 7).

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, BuildosAgentScopeMode } from '@buildos/shared-types';
import { defaultAllowedOpsForMode, isReadOp, isSupportedOp, isWriteOp } from '../policy';
import { ensureActorId } from '../ontology/ontology-projects.service';
import { loadProjectGraphData, loadUserProjectSummaries } from '../ontology/project-graph-loader';
import { getDocTree } from '../ontology/doc-structure.service';

export interface AgentOpScope {
	mode: BuildosAgentScopeMode;
	allowed_ops?: string[] | null;
}

export interface AgentOpContext {
	admin: SupabaseClient<Database>;
	userId: string;
	scope: AgentOpScope;
	runContext?: {
		context_type: 'global' | 'project';
		project_id?: string | null;
	} | null;
}

export type AgentOpErrorCode =
	| 'VALIDATION_ERROR'
	| 'NOT_FOUND'
	| 'FORBIDDEN'
	| 'UNSUPPORTED'
	| 'NOT_IMPLEMENTED'
	| 'EXECUTION_ERROR';

export interface AgentOpResult {
	ok: boolean;
	op: string;
	data?: unknown;
	error?: { code: AgentOpErrorCode; message: string };
}

class AgentOpError extends Error {
	constructor(
		public code: AgentOpErrorCode,
		message: string
	) {
		super(message);
		this.name = 'AgentOpError';
	}
}

function requireProjectId(args: Record<string, unknown>): string {
	const id = typeof args.project_id === 'string' ? args.project_id.trim() : '';
	if (!id) {
		throw new AgentOpError('VALIDATION_ERROR', 'project_id is required');
	}
	return id;
}

async function assertProjectAccess(
	ctx: AgentOpContext,
	projectId: string,
	requiredAccess: 'read' | 'write' | 'admin' = 'read'
): Promise<void> {
	if (ctx.runContext?.context_type === 'project' && ctx.runContext.project_id !== projectId) {
		throw new AgentOpError('FORBIDDEN', 'Op project_id is outside this run scope');
	}

	const actorId = await ensureActorId(ctx.admin, ctx.userId);
	const { data, error } = await ctx.admin.rpc('actor_has_project_member_access', {
		p_actor_id: actorId,
		p_project_id: projectId,
		p_required_access: requiredAccess
	});

	if (error) {
		throw new AgentOpError(
			'EXECUTION_ERROR',
			`Failed to check project access: ${error.message}`
		);
	}
	if (!data) {
		throw new AgentOpError('FORBIDDEN', 'Project not found or access denied');
	}
}

type ReadHandler = (ctx: AgentOpContext, args: Record<string, unknown>) => Promise<unknown>;

const READ_OP_HANDLERS: Record<string, ReadHandler> = {
	'onto.project.list': async (ctx) => {
		const actorId = await ensureActorId(ctx.admin, ctx.userId);
		const summaries = await loadUserProjectSummaries(ctx.admin, actorId);
		const visibleSummaries =
			ctx.runContext?.context_type === 'project'
				? summaries.filter((s) => s.project.id === ctx.runContext?.project_id)
				: summaries;

		return {
			projects: visibleSummaries.map((s) => ({
				...s.project,
				task_count: s.taskCount,
				plan_count: s.planCount,
				edge_count: s.edgeCount
			}))
		};
	},
	'onto.project.graph.get': async (ctx, args) => {
		const projectId = requireProjectId(args);
		await assertProjectAccess(ctx, projectId, 'read');
		return await loadProjectGraphData(ctx.admin, projectId);
	},
	'onto.document.tree.get': async (ctx, args) => {
		const projectId = requireProjectId(args);
		await assertProjectAccess(ctx, projectId, 'read');
		return await getDocTree(ctx.admin, projectId, { includeContent: false });
	}
};

/** The read ops the worker op executor can currently run. */
export const AGENT_OP_READ_CATALOG: readonly string[] = Object.freeze(
	Object.keys(READ_OP_HANDLERS)
);

function fail(op: string, code: AgentOpErrorCode, message: string): AgentOpResult {
	return { ok: false, op, error: { code, message } };
}

/**
 * Execute a single BuildOS op for an Agent Run. Enforces scope/op policy, then
 * dispatches to the read handler. Errors are returned as structured results
 * (never thrown) so the runner's loop can surface them to the agent.
 */
export async function executeAgentOp(
	ctx: AgentOpContext,
	op: string,
	args: Record<string, unknown> = {}
): Promise<AgentOpResult> {
	const trimmed = typeof op === 'string' ? op.trim() : '';
	if (!trimmed) {
		return fail(trimmed, 'VALIDATION_ERROR', 'Missing op');
	}
	if (!isSupportedOp(trimmed)) {
		return fail(trimmed, 'NOT_FOUND', `Unknown op: ${trimmed}`);
	}
	// Write ops are not yet executable from the worker (read-first cut).
	if (isWriteOp(trimmed)) {
		return fail(
			trimmed,
			'UNSUPPORTED',
			`Op ${trimmed} is a write op; the worker op executor currently supports read ops only.`
		);
	}
	if (!isReadOp(trimmed)) {
		return fail(trimmed, 'UNSUPPORTED', `Op ${trimmed} is not a read op.`);
	}
	const allowed = ctx.scope.allowed_ops ?? defaultAllowedOpsForMode(ctx.scope.mode);
	if (!allowed.includes(trimmed)) {
		return fail(trimmed, 'FORBIDDEN', `Op ${trimmed} is outside the granted scope`);
	}
	const handler = READ_OP_HANDLERS[trimmed];
	if (!handler) {
		return fail(
			trimmed,
			'NOT_IMPLEMENTED',
			`Op ${trimmed} is allowed but has no worker handler yet.`
		);
	}
	try {
		const data = await handler(ctx, args);
		return { ok: true, op: trimmed, data };
	} catch (error) {
		const code = error instanceof AgentOpError ? error.code : 'EXECUTION_ERROR';
		return fail(trimmed, code, error instanceof Error ? error.message : String(error));
	}
}
