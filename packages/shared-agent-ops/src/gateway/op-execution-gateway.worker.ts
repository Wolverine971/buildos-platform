// packages/shared-agent-ops/src/gateway/op-execution-gateway.worker.ts
//
// Worker-facing adapters over the shared gateway handler catalog. Agent Runs use
// this lean path so the worker records its own telemetry while reusing the same
// operation handlers as the external gateway.
import type { AgentCallScope, BuildosAgentAllowedOp, Database } from '@buildos/shared-types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeGatewayOpName } from '../ops/gateway-op-aliases';
import { isReadOp, isWriteOp } from '../policy';
import {
	EXTERNAL_OP_HANDLERS,
	extractWriteEntityMeta,
	normalizeGatewayError,
	previewDocumentUpdate,
	type CalendarPort,
	type GatewayLookupMemo,
	type TaskSyncPort,
	type ToolExecutionContext
} from './op-execution-gateway.core';
import { normalizeAndValidateGatewayWriteArgs } from './op-execution-gateway.validation';

type GatewaySupabaseClient = SupabaseClient<Database>;

// Worker gateway adapter catalogs

/** Non-calendar read ops backed by the shared gateway handler map. */
export const AGENT_OP_GATEWAY_READ_CATALOG: readonly string[] = Object.freeze(
	Object.keys(EXTERNAL_OP_HANDLERS).filter((op) => isReadOp(op) && !op.startsWith('cal.'))
);

/** Calendar read ops that can run in a worker only when a CalendarPort is present. */
export const AGENT_OP_GATEWAY_CALENDAR_READ_CATALOG: readonly string[] = Object.freeze(
	Object.keys(EXTERNAL_OP_HANDLERS).filter((op) => isReadOp(op) && op.startsWith('cal.'))
);

/** Calendar write ops that can run in a worker only when a CalendarPort is present. */
export const AGENT_OP_GATEWAY_CALENDAR_WRITE_CATALOG: readonly string[] = Object.freeze(
	Object.keys(EXTERNAL_OP_HANDLERS).filter((op) => isWriteOp(op) && op.startsWith('cal.'))
);

/**
 * Non-calendar write ops that have a gateway handler — the set a worker Agent
 * Run can stage+commit without a CalendarPort. Calendar (`cal.*`) write ops
 * stay separate so the runner can advertise them only when the runtime has a
 * real calendar capability.
 */
export const AGENT_OP_GATEWAY_WRITE_CATALOG: readonly string[] = Object.freeze(
	Object.keys(EXTERNAL_OP_HANDLERS).filter((op) => isWriteOp(op) && !op.startsWith('cal.'))
);

export interface GatewayWriteOpResult {
	ok: boolean;
	data?: Record<string, unknown>;
	entityKind?: string | null;
	entityId?: string | null;
	entityProjectId?: string | null;
	entityTitle?: string | null;
	error?: {
		code: 'NOT_FOUND' | 'VALIDATION_ERROR' | 'FORBIDDEN' | 'CONFLICT' | 'INTERNAL';
		message: string;
		details?: Record<string, unknown>;
	};
}

export interface GatewayReadOpResult {
	ok: boolean;
	data?: Record<string, unknown>;
	error?: {
		code: 'NOT_FOUND' | 'VALIDATION_ERROR' | 'FORBIDDEN' | 'CONFLICT' | 'INTERNAL';
		message: string;
		details?: Record<string, unknown>;
	};
}

/**
 * Execute a single BuildOS read op through the shared gateway handler map for
 * INTERNAL Agent Runs. This is primarily used for calendar reads, whose logic is
 * already in the gateway behind CalendarPort and should not be duplicated in the
 * worker.
 */
export async function runGatewayReadOp(params: {
	admin: GatewaySupabaseClient;
	userId: string;
	scope: AgentCallScope;
	op: string;
	args?: Record<string, unknown>;
	callSessionId?: string;
	chatSessionId?: string;
	calendar?: CalendarPort;
	taskSync?: TaskSyncPort;
	signal?: AbortSignal;
}): Promise<GatewayReadOpResult> {
	const canonicalOp = normalizeGatewayOpName(
		typeof params.op === 'string' ? params.op.trim() : ''
	) as BuildosAgentAllowedOp;
	const handler = EXTERNAL_OP_HANDLERS[canonicalOp];
	if (!handler || !isReadOp(canonicalOp)) {
		return {
			ok: false,
			error: { code: 'NOT_FOUND', message: `No worker read handler for op: ${canonicalOp}` }
		};
	}

	const args =
		params.args && typeof params.args === 'object' && !Array.isArray(params.args)
			? params.args
			: {};

	const context: ToolExecutionContext = {
		admin: params.admin,
		userId: params.userId,
		callerId: undefined,
		callSessionId: params.callSessionId,
		chatSessionId: params.chatSessionId,
		scope: params.scope,
		calendar: params.calendar,
		taskSync: params.taskSync,
		signal: params.signal
	};

	try {
		const result = await handler(context, args);
		return { ok: true, data: result };
	} catch (error) {
		const normalized = normalizeGatewayError(error);
		return {
			ok: false,
			error: {
				code: normalized.code,
				message: normalized.message,
				details: normalized.details
			}
		};
	}
}

/**
 * Execute a single BuildOS write op for an INTERNAL Agent Run.
 *
 * Unlike executeGatewayOp (the external-agent path, which carries
 * agent_call_tool_executions idempotency/replay audit keyed by an
 * external_agent_caller_id + agent_call_session), this is a lean path for the
 * worker runner: validate args, invoke the handler directly, return the entity
 * meta. The runner records its own agent_tool_executions telemetry, so there is
 * no external write-audit here. A caller may pass a stable key to a handler
 * with domain-level idempotency. The caller remains responsible for scope/allowed-op
 * enforcement (the worker's executeAgentOp does this before
 * dispatching); the handler additionally enforces project-level write access.
 *
 * Calendar/task-sync remain optional ports; when absent, task handlers skip
 * task-event syncing while other side effects continue.
 */
export async function runGatewayWriteOp(params: {
	admin: GatewaySupabaseClient;
	userId: string;
	scope: AgentCallScope;
	op: string;
	args?: Record<string, unknown>;
	callSessionId?: string;
	chatSessionId?: string;
	calendar?: CalendarPort;
	taskSync?: TaskSyncPort;
	downstreamIdempotencyKey?: string;
	/** Lookups shared across the writes of one chat turn. */
	memo?: GatewayLookupMemo;
}): Promise<GatewayWriteOpResult> {
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

	const context: ToolExecutionContext = {
		admin: params.admin,
		userId: params.userId,
		callerId: undefined,
		callSessionId: params.callSessionId,
		chatSessionId: params.chatSessionId,
		scope: params.scope,
		calendar: params.calendar,
		taskSync: params.taskSync,
		downstreamIdempotencyKey: params.downstreamIdempotencyKey,
		memo: params.memo
	};

	try {
		const result = await handler(context, args);
		// A project write can change which projects this turn may write to.
		if (params.memo && canonicalOp.startsWith('onto.project.')) {
			delete params.memo.projectSummaries;
		}
		const meta = extractWriteEntityMeta({ op: canonicalOp as BuildosAgentAllowedOp, result });
		return {
			ok: true,
			data: result,
			entityKind: meta.entityKind ?? null,
			entityId: meta.entityId ?? null,
			entityProjectId: meta.entityProjectId ?? null,
			entityTitle: meta.entityTitle ?? null
		};
	} catch (error) {
		const normalized = normalizeGatewayError(error);
		return {
			ok: false,
			error: {
				code: normalized.code,
				message: normalized.message,
				details: normalized.details
			}
		};
	}
}

export type GatewayDocumentUpdatePreviewResult =
	| { ok: true; data: Awaited<ReturnType<typeof previewDocumentUpdate>> }
	| { ok: false; error: NonNullable<GatewayWriteOpResult['error']> };

/**
 * Dry run of an update_onto_document call under the same argument validation,
 * scope, and access checks as `runGatewayWriteOp`. Nothing is written.
 */
export async function previewGatewayDocumentUpdate(params: {
	admin: GatewaySupabaseClient;
	userId: string;
	scope: AgentCallScope;
	args?: Record<string, unknown>;
	/** Preview against this body instead of the stored one (chained batch calls). */
	baseContent?: string;
}): Promise<GatewayDocumentUpdatePreviewResult> {
	const preparedArgs = normalizeAndValidateGatewayWriteArgs('onto.document.update', params.args);
	if (!preparedArgs.ok) return { ok: false, error: preparedArgs.error };
	const context: ToolExecutionContext = {
		admin: params.admin,
		userId: params.userId,
		callerId: undefined,
		scope: params.scope
	};
	try {
		return {
			ok: true,
			data: await previewDocumentUpdate(context, preparedArgs.args, {
				...(params.baseContent !== undefined ? { base_content: params.baseContent } : {})
			})
		};
	} catch (error) {
		const normalized = normalizeGatewayError(error);
		return {
			ok: false,
			error: {
				code: normalized.code,
				message: normalized.message,
				details: normalized.details
			}
		};
	}
}
