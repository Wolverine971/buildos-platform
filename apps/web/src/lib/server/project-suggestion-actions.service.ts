// apps/web/src/lib/server/project-suggestion-actions.service.ts
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import {
	isValidUUID,
	type BuildosAgentAllowedOp,
	type Json,
	type LoopOperation,
	type ProjectSuggestion,
	type ProjectSuggestionFeedback,
	type ProjectSuggestionResult
} from '@buildos/shared-types';
import {
	runGatewayWriteOp,
	type GatewayWriteOpResult,
	type TaskSyncPort
} from '@buildos/shared-agent-ops/gateway/op-execution-gateway';
import { assertNoDurableTextViolations } from '@buildos/agentic-chat-runtime/loop';
import {
	quarantineProjectSuggestionInboxItem,
	readProjectSuggestionStructuralFingerprint,
	syncInboxItemForProjectAudit,
	syncInboxItemForProjectSuggestion,
	verifyProjectSuggestionIntegrity
} from '@buildos/shared-agent-ops';
import { isProjectSuggestionFresh } from '$lib/server/project-loop-snapshot.service';
import { finalizeProjectLoopRunIfComplete } from '$lib/server/project-loop-run.service';
import { captureServerEvent } from '$lib/server/posthog';
import { runAfterResponse } from '$lib/server/background';
import { recordFreshnessBundleOutcome } from '$lib/server/freshness-radar.service';

type AnySupabase = any;

export type ProjectSuggestionDecisionAction = 'approve' | 'address' | 'dismiss';

export type ProjectSuggestionDecisionOutcome =
	| {
			ok: true;
			suggestion: Record<string, unknown>;
			result?: ProjectSuggestionResult;
			alreadyDecided?: boolean;
			superseded?: boolean;
	  }
	| {
			ok: false;
			status: number;
			message: string;
	  };

/**
 * Suggestion-lifecycle telemetry (audit Tier 1 #6). Pairs with the worker's
 * `project_suggestion_generated` so we can see whether the loop's output is
 * accepted, dismissed, superseded by staleness, or fails on apply. Never throws.
 */
function emitSuggestionDecisionEvent(
	userId: string,
	event:
		| 'project_suggestion_accepted'
		| 'project_suggestion_addressed'
		| 'project_suggestion_dismissed'
		| 'project_suggestion_superseded_freshness'
		| 'project_suggestion_application_failed',
	suggestion: Record<string, unknown>,
	extra?: Record<string, unknown>
): void {
	runAfterResponse(
		captureServerEvent(userId, event, {
			project_id: suggestion.project_id ?? null,
			suggestion_id: suggestion.id ?? null,
			run_id: suggestion.run_id ?? null,
			kind: suggestion.kind ?? null,
			risk_tier: suggestion.risk_tier ?? null,
			...extra
		}),
		`suggestion telemetry ${event}`
	);
}

async function syncProjectSuggestionInboxItem(suggestion: Record<string, unknown>): Promise<void> {
	try {
		const admin = createAdminSupabaseClient();
		await syncInboxItemForProjectSuggestion({
			supabase: admin as any,
			suggestion
		});
	} catch (error) {
		console.warn(
			`[AI Inbox] Failed to sync project suggestion ${suggestion.id}:`,
			error instanceof Error ? error.message : error
		);
	}
}

async function syncProjectAuditInboxItem(audit: Record<string, unknown>): Promise<void> {
	try {
		const admin = createAdminSupabaseClient();
		await syncInboxItemForProjectAudit({
			supabase: admin as any,
			audit
		});
	} catch (error) {
		console.warn(
			`[AI Inbox] Failed to sync project audit ${audit.id}:`,
			error instanceof Error ? error.message : error
		);
	}
}

async function loadSuggestion(params: {
	supabase: AnySupabase;
	projectId: string;
	suggestionId: string;
}): Promise<Record<string, unknown> | null> {
	const { data, error } = await params.supabase
		.from('project_suggestions')
		.select('*')
		.eq('id', params.suggestionId)
		.eq('project_id', params.projectId)
		.maybeSingle();
	if (error) throw error;
	return data ?? null;
}

async function loadRunChatSessionId(params: {
	supabase: AnySupabase;
	runId: string;
}): Promise<string | null> {
	const { data, error } = await params.supabase
		.from('project_loop_runs')
		.select('chat_session_id')
		.eq('id', params.runId)
		.maybeSingle();
	if (error) throw error;
	return typeof data?.chat_session_id === 'string' ? data.chat_session_id : null;
}

async function loadVerifiedInboxStructuralFingerprint(params: {
	supabase: AnySupabase;
	suggestionId: string;
}): Promise<string | null> {
	const { data, error } = await params.supabase
		.from('inbox_items')
		.select('source_status')
		.eq('source_type', 'project_suggestion')
		.eq('source_ref_id', params.suggestionId)
		.maybeSingle();
	if (error) throw error;
	return readProjectSuggestionStructuralFingerprint(data?.source_status);
}

const FEEDBACK_REASONS = new Set<ProjectSuggestionFeedback['reason']>([
	'not_relevant',
	'wrong_evidence',
	'intentional',
	'too_risky',
	'other'
]);
const UNRESOLVED_AUDIT_SUGGESTION_STATUSES = new Set([
	'pending',
	'approved',
	'delegated',
	'failed'
]);

function sanitizeFeedback(value: unknown): ProjectSuggestionFeedback | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const record = value as Record<string, unknown>;
	const reason = FEEDBACK_REASONS.has(record.reason as ProjectSuggestionFeedback['reason'])
		? (record.reason as ProjectSuggestionFeedback['reason'])
		: undefined;
	const note =
		typeof record.note === 'string' && record.note.trim()
			? record.note.trim().slice(0, 1000)
			: undefined;
	if (!reason && !note) return null;
	return {
		...(reason ? { reason } : {}),
		...(note ? { note } : {}),
		created_at: new Date().toISOString()
	};
}

function linkedSuggestionStatus(link: Record<string, unknown>): string | null {
	const nested = link.project_suggestions;
	if (Array.isArray(nested)) {
		const first = nested[0];
		return first && typeof first === 'object'
			? typeof (first as Record<string, unknown>).status === 'string'
				? ((first as Record<string, unknown>).status as string)
				: null
			: null;
	}
	if (nested && typeof nested === 'object') {
		const status = (nested as Record<string, unknown>).status;
		return typeof status === 'string' ? status : null;
	}
	return null;
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// ---------------------------------------------------------------------------
// Loop operation replay (suggestion approval + freshness undo)
// ---------------------------------------------------------------------------

/**
 * The only stored operations approval and undo may replay, each mapped to the
 * reviewed gateway op it runs as. This is the complete set of tools the
 * producers emit, inverses included:
 *   - project-loop generators (apps/worker/src/workers/project-loop/generators.ts
 *     `allowedTools` + `docMoveUndoOperations` / `outdatedFlagUndoOperations` /
 *     `taskConflictUndoOperations`): move_document_in_tree, update_onto_document,
 *     update_onto_task;
 *   - freshness radar (apps/worker/src/workers/freshness-radar/combine.ts `toolFor`
 *     + `undoPayloadFor` / `draftUndoOperation`): update_onto_task, update_onto_goal,
 *     update_onto_milestone.
 * It equals the set Project Review's integrity check can resolve
 * (packages/shared-agent-ops/src/proposal-context/verify-operations.ts). No
 * deletes, calendar, email, or external tools: anything else is refused before
 * any write.
 */
export const REPLAYABLE_LOOP_OPERATION_OPS = Object.freeze({
	update_onto_task: 'onto.task.update',
	update_onto_document: 'onto.document.update',
	update_onto_goal: 'onto.goal.update',
	update_onto_milestone: 'onto.milestone.update',
	move_document_in_tree: 'onto.document.tree.move'
} as const satisfies Record<string, BuildosAgentAllowedOp>);

export type ReplayableLoopOperationTool = keyof typeof REPLAYABLE_LOOP_OPERATION_OPS;

export function isReplayableLoopOperationTool(tool: unknown): tool is ReplayableLoopOperationTool {
	return (
		typeof tool === 'string' &&
		Object.prototype.hasOwnProperty.call(REPLAYABLE_LOOP_OPERATION_OPS, tool)
	);
}

function unreplayableToolMessage(tool: unknown): string {
	const name = typeof tool === 'string' && tool.trim() ? tool.trim() : '(missing tool)';
	return `Operation ${name} cannot be replayed from a review item; nothing was changed.`;
}

// The fields each legacy tool forwarded to its /api/onto route, so a replay writes
// exactly what approval wrote before. Anything else in stored args is ignored.
const TASK_UPDATE_FIELDS = [
	'task_id',
	'title',
	'description',
	'type_key',
	'state_key',
	'priority',
	'goal_id',
	'supporting_milestone_id',
	'start_at',
	'due_at',
	'props',
	'assignee_actor_ids',
	'assignee_handles'
] as const;
const GOAL_UPDATE_FIELDS = [
	'goal_id',
	'name',
	'description',
	'type_key',
	'state_key',
	'priority',
	'target_date',
	'measurement_criteria',
	'props'
] as const;
const MILESTONE_UPDATE_FIELDS = [
	'milestone_id',
	'title',
	'due_at',
	'state_key',
	'description',
	'props'
] as const;
const DOCUMENT_UPDATE_FIELDS = [
	'document_id',
	'title',
	'type_key',
	'state_key',
	'description',
	'content',
	'edits',
	'section_edits',
	'update_strategy',
	'merge_instructions',
	'props'
] as const;

function pickDefined(
	source: Record<string, unknown>,
	fields: readonly string[]
): Record<string, unknown> {
	const picked: Record<string, unknown> = {};
	for (const field of fields) {
		if (source[field] !== undefined) picked[field] = source[field];
	}
	return picked;
}

/** The legacy document tool accepted nested and renamed fields; keep reading them. */
function documentUpdateArgs(args: Record<string, unknown>): Record<string, unknown> {
	const merged: Record<string, unknown> = { ...args };
	for (const nested of [args.document, args.updates, args.document_update]) {
		if (!isJsonObject(nested)) continue;
		for (const [key, value] of Object.entries(nested)) {
			if (merged[key] === undefined) merged[key] = value;
		}
	}
	if (merged.title === undefined && typeof merged.name === 'string') merged.title = merged.name;
	if (merged.description === undefined && typeof merged.summary === 'string') {
		merged.description = merged.summary;
	}
	if (merged.type_key === undefined && typeof merged.type === 'string') {
		merged.type_key = merged.type;
	}
	if (merged.content === undefined) {
		const body = [merged.body_markdown, merged.body, merged.text, merged.markdown].find(
			(value) => typeof value === 'string'
		);
		if (body !== undefined) merged.content = body;
	}

	const picked = pickDefined(merged, DOCUMENT_UPDATE_FIELDS);
	// An empty or non-object props patch was never sent; the gateway would count it as a change.
	if (!isJsonObject(picked.props) || Object.keys(picked.props).length === 0) delete picked.props;
	return picked;
}

function documentTreeMoveArgs(
	args: Record<string, unknown>,
	projectId: string
): Record<string, unknown> {
	const nestedDocument = isJsonObject(args.document) ? args.document.id : undefined;
	const documentId =
		args.document_id ?? args.id ?? args.doc_id ?? args.documentId ?? nestedDocument;
	const rawParentId = args.new_parent_id ?? args.parent_id ?? args.parentId;
	const rawParentTitle = args.new_parent_title ?? args.parent_title ?? args.new_parent_name;
	const rawPosition = args.new_position ?? args.position;

	let newParentId: string | null = null;
	let newParentTitle: string | null = null;
	if (typeof rawParentId === 'string' && rawParentId.trim()) {
		// A non-UUID parent was always treated as a grouping title.
		if (isValidUUID(rawParentId.trim())) newParentId = rawParentId.trim();
		else newParentTitle = rawParentId.trim();
	}
	if (!newParentId && !newParentTitle && typeof rawParentTitle === 'string') {
		newParentTitle = rawParentTitle.trim() || null;
	}

	return {
		project_id: projectId,
		document_id: documentId,
		new_parent_id: newParentId,
		...(newParentTitle ? { new_parent_title: newParentTitle } : {}),
		new_position: typeof rawPosition === 'number' ? rawPosition : 0
	};
}

function gatewayArgsFor(
	tool: ReplayableLoopOperationTool,
	args: Record<string, unknown>,
	projectId: string
): Record<string, unknown> {
	switch (tool) {
		case 'update_onto_task':
			return {
				...pickDefined(args, TASK_UPDATE_FIELDS),
				// A replay never creates calendar events unless the operation asked for it.
				calendar_sync: args.calendar_sync === 'auto' ? 'auto' : 'none'
			};
		case 'update_onto_goal':
			return pickDefined(args, GOAL_UPDATE_FIELDS);
		case 'update_onto_milestone':
			return pickDefined(args, MILESTONE_UPDATE_FIELDS);
		case 'update_onto_document':
			return documentUpdateArgs(args);
		case 'move_document_in_tree':
			return documentTreeMoveArgs(args, projectId);
	}
}

type PreparedLoopOperation = {
	tool: ReplayableLoopOperationTool;
	op: BuildosAgentAllowedOp;
	args: Record<string, unknown>;
};

/**
 * Validate the whole batch before anything is written: every tool must be
 * replayable and every operation must target one project, which becomes the
 * gateway's read and write fence.
 */
function prepareLoopOperations(
	operations: readonly LoopOperation[],
	expectedProjectId: string | undefined
):
	| { ok: true; projectId: string; prepared: PreparedLoopOperation[] }
	| { ok: false; tool: string; error: string } {
	for (const operation of operations) {
		if (!isReplayableLoopOperationTool(operation?.tool)) {
			return {
				ok: false,
				tool: typeof operation?.tool === 'string' ? operation.tool : '(missing tool)',
				error: unreplayableToolMessage(operation?.tool)
			};
		}
		if (!isJsonObject(operation.args)) {
			return {
				ok: false,
				tool: operation.tool,
				error: `Operation ${operation.tool} has no arguments; nothing was changed.`
			};
		}
	}

	// The fence only narrows the gateway's project set; the gateway still resolves
	// the project from the user's memberships and checks write access itself.
	let projectId = expectedProjectId;
	for (const operation of operations) {
		const operationProjectId = operation.args.project_id;
		if (operationProjectId === undefined || operationProjectId === null) continue;
		if (typeof operationProjectId !== 'string' || !operationProjectId.trim()) {
			return {
				ok: false,
				tool: operation.tool,
				error: `Operation ${operation.tool} has an invalid project_id; nothing was changed.`
			};
		}
		projectId ??= operationProjectId;
		if (operationProjectId !== projectId) {
			return {
				ok: false,
				tool: operation.tool,
				error: `Operation ${operation.tool} targets a different project; nothing was changed.`
			};
		}
	}
	if (!projectId || !projectId.trim()) {
		return {
			ok: false,
			tool: operations[0]?.tool ?? '(missing tool)',
			error: 'Replayed operations must name their project; nothing was changed.'
		};
	}
	const fence: string = projectId;

	return {
		ok: true,
		projectId: fence,
		prepared: operations.map((operation) => {
			const tool = operation.tool as ReplayableLoopOperationTool;
			return {
				tool,
				op: REPLAYABLE_LOOP_OPERATION_OPS[tool],
				args: gatewayArgsFor(tool, operation.args, fence)
			};
		})
	};
}

// A doc-tree move reloads the latest tree on every attempt, so one retry after a
// concurrent structure edit is safe (the legacy move tool did the same).
const STRUCTURE_VERSION_CONFLICT_PREFIX = 'Structure version conflict';

async function createReplayTaskSync(supabase: AnySupabase): Promise<TaskSyncPort> {
	// Loaded only when an operation opts into calendar sync, which no producer does today.
	const { TaskEventSyncService } = await import('$lib/services/ontology/task-event-sync.service');
	return new TaskEventSyncService(supabase);
}

export type LoopOperationReplayResult = {
	appliedCount: number;
	errors: Array<{ tool: string; error: string }>;
	/** Per-operation success, aligned with the input operations. */
	outcomes: boolean[];
};

/**
 * Replay stored loop operations through the reviewed write gateway
 * (`runGatewayWriteOp`, the path the worker's freshness auto-apply uses),
 * sequentially, never throwing. Used by suggestion approval and by the freshness
 * radar's undo (Tasker 88).
 *
 * The batch is refused before any write when a tool is outside
 * REPLAYABLE_LOOP_OPERATION_OPS or the operations do not share one project. The
 * gateway runs on the caller's user-scoped client, fenced to that project, and
 * checks the user's write access itself. Gateway writes never queue a Project
 * Review burst, so replays need no review-suppression context.
 */
export async function replayLoopOperations(params: {
	supabase: AnySupabase;
	userId: string;
	chatSessionId: string | null;
	operations: LoopOperation[];
	operationId: string;
	operationKind?: string;
	/** The project every operation must target. Derived from the operations when omitted. */
	projectId?: string;
	/** @deprecated Ignored: replays no longer self-fetch /api/onto routes. */
	fetchFn?: typeof fetch;
}): Promise<LoopOperationReplayResult> {
	const { operations } = params;
	const batch = prepareLoopOperations(operations, params.projectId);
	if (!batch.ok) {
		console.warn(
			`[ProjectSuggestions] Refused replay ${params.operationId} (${params.operationKind ?? 'suggestion_apply'}): ${batch.error}`
		);
		return {
			appliedCount: 0,
			errors: [{ tool: batch.tool, error: batch.error }],
			outcomes: operations.map(() => false)
		};
	}

	const errors: Array<{ tool: string; error: string }> = [];
	const outcomes: boolean[] = [];
	let appliedCount = 0;
	let taskSync: TaskSyncPort | undefined;

	for (const operation of batch.prepared) {
		try {
			if (operation.tool !== 'move_document_in_tree') {
				assertNoDurableTextViolations(operation.args, operation.tool);
			}
			if (operation.args.calendar_sync === 'auto') {
				taskSync ??= await createReplayTaskSync(params.supabase);
			}
			const run = () =>
				runGatewayWriteOp({
					admin: params.supabase,
					userId: params.userId,
					scope: {
						mode: 'read_write',
						allowed_ops: [operation.op],
						project_ids: [batch.projectId],
						write_project_ids: [batch.projectId]
					},
					op: operation.op,
					args: operation.args,
					chatSessionId: params.chatSessionId ?? undefined,
					...(operation.args.calendar_sync === 'auto' ? { taskSync } : {})
				});
			let result: GatewayWriteOpResult = await run();
			if (
				!result.ok &&
				operation.tool === 'move_document_in_tree' &&
				result.error?.message.startsWith(STRUCTURE_VERSION_CONFLICT_PREFIX)
			) {
				result = await run();
			}

			if (result.ok) {
				appliedCount += 1;
				outcomes.push(true);
				emitReplayTaskCompleted(params.userId, batch.projectId, operation, result);
			} else {
				errors.push({
					tool: operation.tool,
					error: result.error?.message ?? 'Operation failed'
				});
				outcomes.push(false);
			}
		} catch (error) {
			errors.push({
				tool: operation.tool,
				error: error instanceof Error ? error.message : 'Operation threw'
			});
			outcomes.push(false);
		}
	}

	return { appliedCount, errors, outcomes };
}

/** The task route emitted task_completed on a transition to done; keep that signal. */
function emitReplayTaskCompleted(
	userId: string,
	projectId: string,
	operation: PreparedLoopOperation,
	result: GatewayWriteOpResult
): void {
	if (operation.tool !== 'update_onto_task' || operation.args.state_key === undefined) return;
	const task = result.data?.task;
	if (!isJsonObject(task) || task.state_key !== 'done') return;
	runAfterResponse(
		captureServerEvent(userId, 'task_completed', {
			task_id: typeof task.id === 'string' ? task.id : operation.args.task_id,
			project_id: projectId
		}),
		'replay task_completed telemetry'
	);
}

export async function refreshLinkedAuditSuggestionCounts(params: {
	supabase: AnySupabase;
	suggestionId: string;
}): Promise<void> {
	const { data: links, error: linksError } = await params.supabase
		.from('project_audit_suggestions')
		.select('audit_id')
		.eq('suggestion_id', params.suggestionId);
	if (linksError) {
		console.warn(
			`[ProjectSuggestions] Failed to load linked audits for suggestion ${params.suggestionId}:`,
			linksError.message
		);
		return;
	}

	const auditIds = Array.from(
		new Set(
			((links ?? []) as Record<string, unknown>[])
				.map((link) => (typeof link.audit_id === 'string' ? link.audit_id : null))
				.filter((id): id is string => Boolean(id))
		)
	);
	for (const auditId of auditIds) {
		const { data: auditLinks, error: auditLinksError } = await params.supabase
			.from('project_audit_suggestions')
			.select('project_suggestions(status)')
			.eq('audit_id', auditId);
		if (auditLinksError) {
			console.warn(
				`[ProjectSuggestions] Failed to load audit suggestion statuses for audit ${auditId}:`,
				auditLinksError.message
			);
			continue;
		}

		const rows = (auditLinks ?? []) as Record<string, unknown>[];
		const unresolvedCount = rows.filter((link) =>
			UNRESOLVED_AUDIT_SUGGESTION_STATUSES.has(linkedSuggestionStatus(link) ?? '')
		).length;
		const { error: updateError } = await params.supabase
			.from('project_audits')
			.update({
				generated_suggestion_count: rows.length,
				unresolved_suggestion_count: unresolvedCount
			})
			.eq('id', auditId);
		if (updateError) {
			console.warn(
				`[ProjectSuggestions] Failed to refresh audit suggestion counts for audit ${auditId}:`,
				updateError.message
			);
			continue;
		}

		// The parent audit is a packet around its child recommendations. Once every
		// child has reached a terminal decision, close the packet automatically so
		// users are not left with a second, meaningless "mark reviewed" chore.
		if (rows.length > 0 && unresolvedCount === 0) {
			const { data: reviewedAudit, error: reviewError } = await params.supabase
				.from('project_audits')
				.update({
					status: 'reviewed',
					reviewed_at: new Date().toISOString()
				})
				.eq('id', auditId)
				.eq('status', 'ready')
				.select('*')
				.maybeSingle();
			if (reviewError) {
				console.warn(
					`[ProjectSuggestions] Failed to close completed audit ${auditId}:`,
					reviewError.message
				);
				continue;
			}
			if (reviewedAudit) {
				await syncProjectAuditInboxItem(reviewedAudit as Record<string, unknown>);
			}
		}
	}
}

export async function decideProjectSuggestion(params: {
	supabase: AnySupabase;
	userId: string;
	projectId: string;
	suggestionId: string;
	action: ProjectSuggestionDecisionAction;
	feedback?: unknown;
	/** @deprecated Ignored: approval replays through the write gateway, not /api/onto. */
	fetchFn?: typeof fetch;
}): Promise<ProjectSuggestionDecisionOutcome> {
	const { supabase, userId, projectId, suggestionId, action } = params;
	const nowIso = new Date().toISOString();

	let current: Record<string, unknown> | null;
	try {
		current = await loadSuggestion({ supabase, projectId, suggestionId });
	} catch (error) {
		return {
			ok: false,
			status: 500,
			message: error instanceof Error ? error.message : 'Failed to load suggestion'
		};
	}

	if (!current) {
		return { ok: false, status: 404, message: 'Suggestion not found' };
	}
	if (current.status !== 'pending') {
		await syncProjectSuggestionInboxItem(current);
		return { ok: true, suggestion: current, alreadyDecided: true };
	}
	const proposedOperations: LoopOperation[] = Array.isArray(current.operations)
		? (current.operations as LoopOperation[])
		: [];

	if (action === 'address') {
		const feedback = sanitizeFeedback(params.feedback);
		if (!feedback?.note) {
			return {
				ok: false,
				status: 400,
				message: 'A one-line response is required to address this finding'
			};
		}
		const addressedFeedback: ProjectSuggestionFeedback = {
			...feedback,
			reason: 'other',
			created_at: nowIso
		};
		const { data: updated, error: updateError } = await supabase
			.from('project_suggestions')
			.update({
				status: 'addressed',
				decided_at: nowIso,
				user_feedback: addressedFeedback as unknown as Json
			})
			.eq('id', suggestionId)
			.eq('project_id', projectId)
			.eq('status', 'pending')
			.select('*')
			.maybeSingle();
		if (updateError) return { ok: false, status: 500, message: updateError.message };
		if (!updated) {
			const latest = await loadSuggestion({ supabase, projectId, suggestionId });
			if (latest) await syncProjectSuggestionInboxItem(latest);
			return latest
				? { ok: true, suggestion: latest, alreadyDecided: true }
				: { ok: false, status: 404, message: 'Suggestion not found' };
		}
		await syncProjectSuggestionInboxItem(updated);
		await refreshLinkedAuditSuggestionCounts({ supabase, suggestionId });
		await finalizeProjectLoopRunIfComplete(supabase, (updated as { run_id?: string }).run_id);
		emitSuggestionDecisionEvent(userId, 'project_suggestion_addressed', updated, {
			has_note: true
		});
		return { ok: true, suggestion: updated };
	}

	if (action === 'dismiss') {
		// Always record feedback on a dismissal. When the surface sends no reason
		// or note (e.g. the dashboard inbox modal), synthesize an implicit one so
		// the row still qualifies for the loop's prior-decision memory instead of
		// being an invisible bare rejection.
		const feedback: ProjectSuggestionFeedback = sanitizeFeedback(params.feedback) ?? {
			reason: 'dismissed_without_note',
			created_at: nowIso
		};
		const { data: updated, error: updateError } = await supabase
			.from('project_suggestions')
			.update({
				status: 'rejected',
				decided_at: nowIso,
				user_feedback: feedback as unknown as Json
			})
			.eq('id', suggestionId)
			.eq('project_id', projectId)
			.eq('status', 'pending')
			.select('*')
			.maybeSingle();
		if (updateError) return { ok: false, status: 500, message: updateError.message };
		if (!updated) {
			const latest = await loadSuggestion({ supabase, projectId, suggestionId });
			if (latest) await syncProjectSuggestionInboxItem(latest);
			return latest
				? { ok: true, suggestion: latest, alreadyDecided: true }
				: { ok: false, status: 404, message: 'Suggestion not found' };
		}
		await syncProjectSuggestionInboxItem(updated);
		await refreshLinkedAuditSuggestionCounts({ supabase, suggestionId });
		await finalizeProjectLoopRunIfComplete(supabase, (updated as { run_id?: string }).run_id);
		if (updated.kind === 'freshness_update') {
			await recordFreshnessBundleOutcome({
				admin: createAdminSupabaseClient(),
				suggestion: updated,
				action: 'dismiss'
			});
		}
		emitSuggestionDecisionEvent(userId, 'project_suggestion_dismissed', updated, {
			reason: feedback.reason ?? null,
			has_note: Boolean(feedback.note)
		});
		return { ok: true, suggestion: updated };
	}

	if (proposedOperations.length === 0) {
		return {
			ok: false,
			status: 422,
			message:
				'This item is a finding, not an executable proposal. Address it, chat about it, or dismiss it.'
		};
	}

	// Resolve every target and destination again immediately before approval.
	// This is deliberately separate from the display-time verification: entities
	// can be moved, archived, deleted, or transferred after the inbox was read.
	const admin = createAdminSupabaseClient();
	let expectedStructuralFingerprint: string | null;
	try {
		expectedStructuralFingerprint = await loadVerifiedInboxStructuralFingerprint({
			supabase: admin,
			suggestionId
		});
	} catch (error) {
		return {
			ok: false,
			status: 500,
			message:
				error instanceof Error
					? `Failed to load proposal verification state: ${error.message}`
					: 'Failed to load proposal verification state'
		};
	}
	const integrity = await verifyProjectSuggestionIntegrity(admin as any, {
		projectId,
		operations: proposedOperations,
		title: typeof current.title === 'string' ? current.title : null,
		preview:
			current.preview &&
			typeof current.preview === 'object' &&
			!Array.isArray(current.preview)
				? (current.preview as Record<string, unknown>)
				: null,
		checkModelAlignment: !expectedStructuralFingerprint,
		expectedStructuralFingerprint
	});
	if (!integrity.ok) {
		try {
			await quarantineProjectSuggestionInboxItem({
				supabase: admin as any,
				suggestion: current,
				diagnostic: integrity.diagnostic
			});
		} catch (error) {
			console.warn(
				`[ProjectSuggestions] Failed to quarantine invalid proposal ${suggestionId}:`,
				error instanceof Error ? error.message : error
			);
		}
		return {
			ok: false,
			status: 409,
			message: `This proposal can no longer be applied safely (${integrity.diagnostic.code}). Rerun Project Review.`
		};
	}

	// Refuse any tool outside the replay allowlist before the claim or any entity
	// write. The integrity check above should already reject these; this keeps the
	// write boundary closed even if its resolvable-tool list ever grows.
	const unreplayable = proposedOperations.find(
		(operation) => !isReplayableLoopOperationTool(operation?.tool)
	);
	if (unreplayable) {
		return {
			ok: false,
			status: 422,
			message: `This proposal includes an operation BuildOS cannot apply (${
				typeof unreplayable?.tool === 'string' ? unreplayable.tool : 'unknown'
			}). Chat about it or dismiss it.`
		};
	}

	const suggestionBeforeClaim = current as unknown as ProjectSuggestion;
	if (!expectedStructuralFingerprint && suggestionBeforeClaim.source_fingerprint) {
		let fresh: boolean;
		try {
			fresh = await isProjectSuggestionFresh(supabase, projectId, suggestionBeforeClaim);
		} catch (error) {
			return {
				ok: false,
				status: 500,
				message:
					error instanceof Error
						? `Failed to check suggestion freshness: ${error.message}`
						: 'Failed to check suggestion freshness'
			};
		}

		if (!fresh) {
			const result: ProjectSuggestionResult = {
				ok: false,
				applied_operations: 0,
				errors: [
					{
						tool: 'freshness_guard',
						error: 'Project changed since this review item was generated. Rerun Project Review.'
					}
				]
			};
			const { data: updated, error: updateError } = await supabase
				.from('project_suggestions')
				.update({
					status: 'superseded',
					freshness_state: 'changed',
					decided_at: nowIso,
					result: result as unknown as Json
				})
				.eq('id', suggestionId)
				.eq('project_id', projectId)
				.eq('status', 'pending')
				.select('*')
				.maybeSingle();
			if (updateError) return { ok: false, status: 500, message: updateError.message };
			if (updated) {
				await syncProjectSuggestionInboxItem(updated);
				await refreshLinkedAuditSuggestionCounts({ supabase, suggestionId });
				await finalizeProjectLoopRunIfComplete(
					supabase,
					(updated as { run_id?: string }).run_id
				);
				emitSuggestionDecisionEvent(
					userId,
					'project_suggestion_superseded_freshness',
					updated
				);
				return { ok: true, suggestion: updated, result, superseded: true };
			}
			const latest = await loadSuggestion({ supabase, projectId, suggestionId });
			if (latest) await syncProjectSuggestionInboxItem(latest);
			return latest
				? { ok: true, suggestion: latest, alreadyDecided: true }
				: { ok: false, status: 404, message: 'Suggestion not found' };
		}
	}

	const { data: claimed, error: claimError } = await supabase
		.from('project_suggestions')
		.update({ status: 'approved', decided_at: nowIso })
		.eq('id', suggestionId)
		.eq('project_id', projectId)
		.eq('status', 'pending')
		.select('*')
		.maybeSingle();
	if (claimError) return { ok: false, status: 500, message: claimError.message };
	if (!claimed) {
		const latest = await loadSuggestion({ supabase, projectId, suggestionId });
		if (latest) await syncProjectSuggestionInboxItem(latest);
		return latest
			? { ok: true, suggestion: latest, alreadyDecided: true }
			: { ok: false, status: 404, message: 'Suggestion not found' };
	}
	await syncProjectSuggestionInboxItem(claimed);

	const suggestion = claimed as unknown as ProjectSuggestion;
	// Loop suggestions replay in their run's chat session. Freshness bundles (Tasker 88) have
	// no run: they carry the trigger chat session themselves.
	let chatSessionId: string | null = suggestion.run_id ? null : suggestion.chat_session_id;
	if (suggestion.run_id) {
		try {
			chatSessionId = await loadRunChatSessionId({ supabase, runId: suggestion.run_id });
		} catch (error) {
			console.warn(
				`[ProjectSuggestions] Failed to load loop chat session ${suggestion.run_id}:`,
				error instanceof Error ? error.message : error
			);
		}
	}
	const operations: LoopOperation[] = Array.isArray(suggestion.operations)
		? suggestion.operations
		: [];
	const replay = await replayLoopOperations({
		supabase,
		userId,
		chatSessionId,
		operations,
		operationId: `project_suggestion:${suggestionId}`,
		projectId
	});
	const { appliedCount, errors } = replay;

	const result: ProjectSuggestionResult = {
		ok: errors.length === 0,
		applied_operations: appliedCount,
		execution_policy: 'prevalidated_sequential',
		partial_failure: appliedCount > 0 && errors.length > 0,
		...(errors.length ? { errors } : {})
	};

	const { data: updated, error: updateError } = await supabase
		.from('project_suggestions')
		.update({
			status: result.ok ? 'applied' : 'failed',
			applied_at: result.ok ? nowIso : null,
			result: result as unknown as Json
		})
		.eq('id', suggestionId)
		.eq('project_id', projectId)
		.select('*')
		.single();

	if (updateError || !updated) {
		return {
			ok: false,
			status: 500,
			message: updateError?.message ?? 'Failed to update suggestion result'
		};
	}

	await syncProjectSuggestionInboxItem(updated);
	await refreshLinkedAuditSuggestionCounts({ supabase, suggestionId });
	await finalizeProjectLoopRunIfComplete(supabase, (updated as { run_id?: string }).run_id);
	await recordFreshnessBundleOutcome({
		admin,
		suggestion: updated,
		action: 'approve',
		result,
		operationOutcomes: replay.outcomes
	});
	emitSuggestionDecisionEvent(
		userId,
		result.ok ? 'project_suggestion_accepted' : 'project_suggestion_application_failed',
		updated,
		{ applied_operations: result.applied_operations, error_count: errors.length }
	);
	return { ok: true, suggestion: updated, result };
}
