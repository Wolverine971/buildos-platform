// packages/shared-agent-ops/src/gateway/op-execution.ts
//
// Worker-safe Agent Run op execution.
//
// A self-contained dispatcher the worker runner calls to execute BuildOS ops
// in-process — no SvelteKit, no chat session. It reuses the already-extracted
// ontology services and the shared scope/op policy.

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
	AgentCallScope,
	AgentRunMutationMode,
	Database,
	BuildosAgentScopeMode,
	ProposedChange
} from '@buildos/shared-types';
import { defaultAllowedOpsForMode, isReadOp, isSupportedOp, isWriteOp } from '../policy';
import {
	AGENT_OP_GATEWAY_CALENDAR_READ_CATALOG,
	AGENT_OP_GATEWAY_CALENDAR_WRITE_CATALOG,
	AGENT_OP_GATEWAY_READ_CATALOG,
	AGENT_OP_GATEWAY_WRITE_CATALOG,
	type CalendarPort,
	runGatewayReadOp,
	runGatewayWriteOp,
	stageGatewayWriteOp
} from './op-execution-gateway';

export {
	AGENT_OP_GATEWAY_READ_CATALOG,
	AGENT_OP_GATEWAY_CALENDAR_READ_CATALOG,
	AGENT_OP_GATEWAY_CALENDAR_WRITE_CATALOG
} from './op-execution-gateway';

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
	/**
	 * Write disposition. 'commit' (default) applies writes immediately;
	 * 'stage' computes a ProposedChange and returns it WITHOUT mutating, for
	 * review-before-commit runs (review_required).
	 */
	mutationMode?: AgentRunMutationMode;
	/** Optional runtime capability for calendar reads/writes in Agent Runs. */
	calendar?: CalendarPort;
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
	/** Write ops surface the touched entity so the runner can record it. */
	entityKind?: string | null;
	entityId?: string | null;
	entityProjectId?: string | null;
	entityTitle?: string | null;
	/**
	 * Set when a write op was STAGED instead of committed (mutationMode='stage').
	 * The change minus its id — the runner assigns a stable id and accumulates
	 * these into the run's Change Set.
	 */
	proposedChange?: Omit<ProposedChange, 'id'>;
	error?: { code: AgentOpErrorCode; message: string };
}

/** The read ops the worker op executor can currently run. */
export const AGENT_OP_READ_CATALOG: readonly string[] = AGENT_OP_GATEWAY_READ_CATALOG;

/**
 * The write ops the worker op executor can run, sourced from the shared gateway
 * handler map (non-calendar writes). Exposed to the runner so it can build the
 * tool surface for `read_write` runs.
 */
export const AGENT_OP_WRITE_CATALOG: readonly string[] = AGENT_OP_GATEWAY_WRITE_CATALOG;

export interface BuildAgentRunOpCatalogParams {
	scope: AgentOpScope;
	mutationMode?: AgentRunMutationMode;
	calendar?: CalendarPort | null;
}

/**
 * Build the concrete op surface an Agent Run should see at runtime. Policy says
 * what a run may do; this helper intersects that with worker capabilities.
 *
 * Calendar reads/writes are only included when a CalendarPort exists. Calendar
 * writes are additionally hidden from staged review runs until external
 * side-effect staging has a faithful commit representation.
 */
export function buildAgentRunOpCatalog(params: BuildAgentRunOpCatalogParams): string[] {
	const grantedOps = params.scope.allowed_ops ?? defaultAllowedOpsForMode(params.scope.mode);
	const hasCalendar = Boolean(params.calendar);
	const canWrite = params.scope.mode === 'read_write';
	const canRunCalendarWrites = canWrite && hasCalendar && params.mutationMode !== 'stage';

	return grantedOps.filter((op) => {
		if (AGENT_OP_READ_CATALOG.includes(op)) return true;
		if (hasCalendar && AGENT_OP_GATEWAY_CALENDAR_READ_CATALOG.includes(op)) return true;
		if (!canWrite) return false;
		if (AGENT_OP_WRITE_CATALOG.includes(op)) return true;
		return canRunCalendarWrites && AGENT_OP_GATEWAY_CALENDAR_WRITE_CATALOG.includes(op);
	});
}

function fail(op: string, code: AgentOpErrorCode, message: string): AgentOpResult {
	return { ok: false, op, error: { code, message } };
}

function explicitProjectId(args: Record<string, unknown>): string {
	return typeof args.project_id === 'string' ? args.project_id.trim() : '';
}

function enforceExplicitProjectFence(
	ctx: AgentOpContext,
	op: string,
	args: Record<string, unknown>
): AgentOpResult | null {
	const projectId = explicitProjectId(args);
	if (
		ctx.runContext?.context_type === 'project' &&
		projectId &&
		ctx.runContext.project_id !== projectId
	) {
		return fail(op, 'FORBIDDEN', 'Op project_id is outside this run scope');
	}
	return null;
}

function buildGatewayScope(ctx: AgentOpContext): AgentCallScope {
	return {
		mode: ctx.scope.mode,
		allowed_ops: (ctx.scope.allowed_ops ?? undefined) as AgentCallScope['allowed_ops'],
		project_ids:
			ctx.runContext?.context_type === 'project' && ctx.runContext.project_id
				? [ctx.runContext.project_id]
				: undefined
	};
}

/** Map the gateway's error codes onto the worker AgentOpResult error codes. */
function mapGatewayErrorCode(
	code: 'NOT_FOUND' | 'VALIDATION_ERROR' | 'FORBIDDEN' | 'CONFLICT' | 'INTERNAL'
): AgentOpErrorCode {
	switch (code) {
		case 'NOT_FOUND':
			return 'NOT_FOUND';
		case 'VALIDATION_ERROR':
			return 'VALIDATION_ERROR';
		case 'FORBIDDEN':
			return 'FORBIDDEN';
		default:
			// CONFLICT / INTERNAL collapse to a generic execution error.
			return 'EXECUTION_ERROR';
	}
}

/**
 * Execute a write op via the shared gateway handler map. Scope/allowed-op policy
 * is enforced by the caller (executeAgentOp); here we add run-scope project
 * fencing (mirroring the read path) and delegate to runGatewayWriteOp. No
 * external write-audit/idempotency — the runner records agent_tool_executions.
 */
async function executeWriteOp(
	ctx: AgentOpContext,
	op: string,
	args: Record<string, unknown>
): Promise<AgentOpResult> {
	if (ctx.scope.mode !== 'read_write') {
		return fail(op, 'FORBIDDEN', `Op ${op} requires a read_write run scope`);
	}

	// Run-scope project fence: a project-scoped run can only write to its project
	// (best-effort — applies when the op carries an explicit project_id).
	const fenced = enforceExplicitProjectFence(ctx, op, args);
	if (fenced) {
		return fenced;
	}

	if (ctx.mutationMode === 'stage' && AGENT_OP_GATEWAY_CALENDAR_WRITE_CATALOG.includes(op)) {
		return fail(
			op,
			'UNSUPPORTED',
			`Calendar write op ${op} is not available in review mode until calendar staging is implemented`
		);
	}
	if (AGENT_OP_GATEWAY_CALENDAR_WRITE_CATALOG.includes(op) && !ctx.calendar) {
		return fail(op, 'UNSUPPORTED', `Calendar op ${op} requires a CalendarPort`);
	}

	const scope = buildGatewayScope(ctx);

	// Stage mode: compute a ProposedChange and return WITHOUT mutating.
	// Scope/fence checks above still apply — a staged write must be one the run
	// is actually allowed to make.
	if (ctx.mutationMode === 'stage') {
		const staged = await stageGatewayWriteOp({
			admin: ctx.admin,
			userId: ctx.userId,
			scope,
			op,
			args
		});
		if (!staged.ok) {
			return fail(op, mapGatewayErrorCode(staged.error.code), staged.error.message);
		}
		return {
			ok: true,
			op,
			// Synthetic success so the LLM loop continues unaware of commit-vs-stage.
			data: {
				staged: true,
				op,
				action: staged.change.action,
				entity_type: staged.change.entity_type
			},
			proposedChange: staged.change
		};
	}

	const result = await runGatewayWriteOp({
		admin: ctx.admin,
		userId: ctx.userId,
		scope,
		op,
		args,
		calendar: ctx.calendar
	});

	if (result.ok) {
		return {
			ok: true,
			op,
			data: result.data,
			entityKind: result.entityKind ?? null,
			entityId: result.entityId ?? null,
			entityProjectId: result.entityProjectId ?? null,
			entityTitle: result.entityTitle ?? null
		};
	}

	return {
		ok: false,
		op,
		error: {
			code: result.error ? mapGatewayErrorCode(result.error.code) : 'EXECUTION_ERROR',
			message: result.error?.message ?? 'Write op failed'
		}
	};
}

/**
 * Execute a single BuildOS op for an Agent Run. Enforces scope/op policy, then
 * dispatches through the shared gateway handlers. Errors are returned as
 * structured results (never thrown) so the runner's loop can surface them to
 * the agent.
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
	const allowed = ctx.scope.allowed_ops ?? defaultAllowedOpsForMode(ctx.scope.mode);
	if (!allowed.includes(trimmed)) {
		return fail(trimmed, 'FORBIDDEN', `Op ${trimmed} is outside the granted scope`);
	}
	// Write ops dispatch to the shared gateway handler map (read_write runs only).
	if (isWriteOp(trimmed)) {
		return executeWriteOp(ctx, trimmed, args);
	}
	if (!isReadOp(trimmed)) {
		return fail(trimmed, 'UNSUPPORTED', `Op ${trimmed} is not a read op.`);
	}
	if (AGENT_OP_GATEWAY_CALENDAR_READ_CATALOG.includes(trimmed) && !ctx.calendar) {
		return fail(trimmed, 'UNSUPPORTED', `Calendar op ${trimmed} requires a CalendarPort`);
	}
	if (
		AGENT_OP_READ_CATALOG.includes(trimmed) ||
		AGENT_OP_GATEWAY_CALENDAR_READ_CATALOG.includes(trimmed)
	) {
		const fenced = enforceExplicitProjectFence(ctx, trimmed, args);
		if (fenced) {
			return fenced;
		}

		const scope = buildGatewayScope(ctx);
		const result = await runGatewayReadOp({
			admin: ctx.admin,
			userId: ctx.userId,
			scope,
			op: trimmed,
			args,
			calendar: ctx.calendar
		});
		if (result.ok) {
			return { ok: true, op: trimmed, data: result.data };
		}
		return fail(
			trimmed,
			result.error ? mapGatewayErrorCode(result.error.code) : 'EXECUTION_ERROR',
			result.error?.message ?? 'Read op failed'
		);
	}
	return fail(
		trimmed,
		'NOT_IMPLEMENTED',
		`Op ${trimmed} is allowed but has no worker handler yet.`
	);
}
