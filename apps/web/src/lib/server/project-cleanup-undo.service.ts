// apps/web/src/lib/server/project-cleanup-undo.service.ts
//
// Undo for a change a review pass applied without asking ("Done for you", tasker 149 lane C).
// The worker (apps/worker/src/workers/project-loop/cleanupAutoApply.ts) stores the exact undo on
// the suggestion row before it writes anything: restore archived documents, put documents back
// where they were (parents first, siblings in order), restore archived tasks. This replays those
// steps through the app's own write paths on the user's client, so access checks and activity
// logging apply, then records the undo as the user's decision ('undone_auto_apply'), which also
// pauses auto-apply of that kind of change on the project for 30 days.
//
// Undo is all-or-nothing up front: when anything it would touch changed since (a document moved
// again, already restored, a task restored by hand), it refuses before writing.

import { isValidUUID, type Json, type LoopOperation } from '@buildos/shared-types';
import { runGatewayWriteOp } from '@buildos/shared-agent-ops/gateway/op-execution-gateway';
import { restoreDocumentInTree } from '$lib/services/ontology/doc-structure.service';
import { logUpdateAsync } from '$lib/services/async-activity-logger';
import { replayLoopOperations } from '$lib/server/project-suggestion-actions.service';

type AnySupabase = any;

export const UNDO_AUTO_APPLY_REASON = 'undone_auto_apply';
export const UNDO_AUTO_APPLY_NOTE = 'Undone from Done for you';
export const UNDO_CHANGED_MESSAGE =
	'This changed since it was done for you, so it can no longer be undone in one tap. Change it back from the project.';

const RESTORABLE_DOCUMENT_STATES = new Set(['draft', 'in_review', 'ready', 'published']);

export type CleanupUndoStep =
	| {
			tool: 'restore_onto_document';
			documentId: string;
			restoreStateKey: string;
	  }
	| {
			tool: 'move_document_in_tree';
			documentId: string;
			newParentId: string | null;
			newPosition: number;
			/** Where the change left the document; absent for a document being restored. */
			expectedParentId?: string | null;
	  }
	| { tool: 'restore_onto_task'; taskId: string };

export type CleanupUndoOutcome =
	| { ok: true; suggestion: Record<string, unknown>; undoneSteps: number }
	| { ok: false; status: number; message: string };

function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function asUuid(value: unknown): string | null {
	return typeof value === 'string' && isValidUUID(value.trim()) ? value.trim() : null;
}

/**
 * The stored undo, validated before anything runs. Every step must name this project and
 * a known tool; anything else refuses the whole undo.
 */
export function parseCleanupUndoSteps(value: unknown, projectId: string): CleanupUndoStep[] | null {
	if (!Array.isArray(value) || !value.length) return null;
	const steps: CleanupUndoStep[] = [];
	for (const raw of value) {
		const operation = asRecord(raw);
		const args = asRecord(operation?.args);
		if (!operation || !args || args.project_id !== projectId) return null;
		if (operation.tool === 'restore_onto_document') {
			const documentId = asUuid(args.document_id);
			const state =
				typeof args.restore_state_key === 'string' ? args.restore_state_key : 'draft';
			if (!documentId) return null;
			steps.push({
				tool: 'restore_onto_document',
				documentId,
				restoreStateKey: RESTORABLE_DOCUMENT_STATES.has(state) ? state : 'draft'
			});
		} else if (operation.tool === 'move_document_in_tree') {
			const documentId = asUuid(args.document_id);
			const parent = args.new_parent_id;
			const newParentId = parent === null || parent === undefined ? null : asUuid(parent);
			if (!documentId || (parent !== null && parent !== undefined && !newParentId))
				return null;
			const position =
				typeof args.new_position === 'number' && Number.isInteger(args.new_position)
					? Math.max(0, args.new_position)
					: 0;
			const step: CleanupUndoStep = {
				tool: 'move_document_in_tree',
				documentId,
				newParentId,
				newPosition: position
			};
			if (Object.prototype.hasOwnProperty.call(args, 'expected_parent_id')) {
				const expected = args.expected_parent_id;
				if (expected !== null && !asUuid(expected)) return null;
				step.expectedParentId = expected === null ? null : asUuid(expected);
			}
			steps.push(step);
		} else if (operation.tool === 'restore_onto_task') {
			const taskId = asUuid(args.task_id);
			if (!taskId) return null;
			steps.push({ tool: 'restore_onto_task', taskId });
		} else {
			return null;
		}
	}
	return steps;
}

/** Parent of each document in the canonical tree; a document not in the tree is absent. */
export function treeParentById(structure: unknown): Map<string, string | null> {
	const parents = new Map<string, string | null>();
	const visit = (nodes: unknown, parentId: string | null) => {
		if (!Array.isArray(nodes)) return;
		for (const raw of nodes) {
			const node = asRecord(raw);
			const id = typeof node?.id === 'string' ? node.id : null;
			if (!node || !id) continue;
			parents.set(id, parentId);
			visit(node.children, id);
		}
	};
	const record = asRecord(structure);
	visit(Array.isArray(structure) ? structure : record?.root, null);
	return parents;
}

/** Read-only check that every step still has the state the change left. */
async function checkUndoPreconditions(params: {
	supabase: AnySupabase;
	projectId: string;
	steps: CleanupUndoStep[];
}): Promise<{ ok: true; documentUpdatedAt: Map<string, string> } | { ok: false; error: string }> {
	const { supabase, projectId, steps } = params;
	const restoreIds = steps.flatMap((step) =>
		step.tool === 'restore_onto_document' ? [step.documentId] : []
	);
	const taskIds = steps.flatMap((step) =>
		step.tool === 'restore_onto_task' ? [step.taskId] : []
	);
	const checkedMoves = steps.filter(
		(step): step is Extract<CleanupUndoStep, { tool: 'move_document_in_tree' }> =>
			step.tool === 'move_document_in_tree' && step.expectedParentId !== undefined
	);
	const documentUpdatedAt = new Map<string, string>();

	if (restoreIds.length) {
		const { data, error } = await supabase
			.from('onto_documents')
			.select('id, project_id, state_key, updated_at, deleted_at')
			.in('id', restoreIds);
		if (error) return { ok: false, error: `Failed to load documents: ${error.message}` };
		const byId = new Map(
			((data ?? []) as Array<Record<string, unknown>>).map((row) => [String(row.id), row])
		);
		for (const id of restoreIds) {
			const row = byId.get(id);
			if (
				!row ||
				row.project_id !== projectId ||
				row.deleted_at ||
				row.state_key !== 'archived' ||
				typeof row.updated_at !== 'string'
			) {
				return { ok: false, error: UNDO_CHANGED_MESSAGE };
			}
			documentUpdatedAt.set(id, row.updated_at);
		}
	}

	if (taskIds.length) {
		const { data, error } = await supabase
			.from('onto_tasks')
			.select('id, project_id, archived_at')
			.in('id', taskIds);
		if (error) return { ok: false, error: `Failed to load tasks: ${error.message}` };
		const byId = new Map(
			((data ?? []) as Array<Record<string, unknown>>).map((row) => [String(row.id), row])
		);
		for (const id of taskIds) {
			const row = byId.get(id);
			if (!row || row.project_id !== projectId || !row.archived_at) {
				return { ok: false, error: UNDO_CHANGED_MESSAGE };
			}
		}
	}

	if (checkedMoves.length) {
		const { data, error } = await supabase
			.from('onto_projects')
			.select('doc_structure')
			.eq('id', projectId)
			.maybeSingle();
		if (error)
			return { ok: false, error: `Failed to load the document tree: ${error.message}` };
		const parents = treeParentById(asRecord(data)?.doc_structure);
		// Moves of one change run in order, so only the first move of each document is checked
		// against where the change left it.
		const seen = new Set<string>();
		for (const move of checkedMoves) {
			if (seen.has(move.documentId)) continue;
			seen.add(move.documentId);
			if (!parents.has(move.documentId)) return { ok: false, error: UNDO_CHANGED_MESSAGE };
			if ((parents.get(move.documentId) ?? null) !== (move.expectedParentId ?? null)) {
				return { ok: false, error: UNDO_CHANGED_MESSAGE };
			}
		}
	}

	return { ok: true, documentUpdatedAt };
}

async function runUndoStep(params: {
	supabase: AnySupabase;
	userId: string;
	actorId: string;
	projectId: string;
	suggestionId: string;
	step: CleanupUndoStep;
	documentUpdatedAt: Map<string, string>;
}): Promise<{ ok: true } | { ok: false; error: string }> {
	const { supabase, userId, projectId, step } = params;
	if (step.tool === 'restore_onto_document') {
		const expectedUpdatedAt = params.documentUpdatedAt.get(step.documentId);
		if (!expectedUpdatedAt) return { ok: false, error: UNDO_CHANGED_MESSAGE };
		try {
			// The same restore the document API uses: state back, legacy tree node cleaned up.
			const restored = await restoreDocumentInTree(
				supabase,
				projectId,
				step.documentId,
				{ restoreStateKey: step.restoreStateKey, expectedUpdatedAt },
				params.actorId
			);
			logUpdateAsync(
				supabase,
				projectId,
				'document',
				step.documentId,
				{ state_key: 'archived' },
				{
					title: restored.document.title,
					state_key: restored.document.state_key,
					type_key: restored.document.type_key
				},
				userId,
				'form'
			);
			return { ok: true };
		} catch (error) {
			return {
				ok: false,
				error: error instanceof Error ? error.message : 'Failed to restore document'
			};
		}
	}
	if (step.tool === 'move_document_in_tree') {
		// The reviewed tree move approval uses (gateway onto.document.tree.move).
		const operation: LoopOperation = {
			tool: 'move_document_in_tree',
			args: {
				project_id: projectId,
				document_id: step.documentId,
				new_parent_id: step.newParentId,
				new_position: step.newPosition
			}
		};
		const replay = await replayLoopOperations({
			supabase,
			userId,
			chatSessionId: null,
			operations: [operation],
			operationId: `cleanup_undo:${params.suggestionId}`,
			operationKind: 'cleanup_undo',
			projectId
		});
		return replay.appliedCount === 1
			? { ok: true }
			: { ok: false, error: replay.errors[0]?.error ?? 'Failed to move document back' };
	}
	// The board's canonical restore (archived_at and deleted_at cleared together) through the
	// gateway's task update, which checks write access and logs the change.
	const result = await runGatewayWriteOp({
		admin: supabase,
		userId,
		scope: {
			mode: 'read_write',
			allowed_ops: ['onto.task.update'],
			project_ids: [projectId],
			write_project_ids: [projectId]
		},
		op: 'onto.task.update',
		args: { task_id: step.taskId, archived: false, calendar_sync: 'none' }
	});
	return result.ok
		? { ok: true }
		: { ok: false, error: result.error?.message ?? 'Failed to restore task' };
}

/**
 * Undo one auto-applied change. The row must be applied without asking and not undone yet.
 * The row is claimed first (status 'rejected'), so a second tap cannot replay it again; when no
 * step could run, the claim is released and the change stays as it was.
 */
export async function undoAutoAppliedCleanup(params: {
	supabase: AnySupabase;
	userId: string;
	actorId: string;
	projectId: string;
	suggestionId: string;
	now?: () => Date;
}): Promise<CleanupUndoOutcome> {
	const { supabase, projectId, suggestionId } = params;
	const now = params.now ?? (() => new Date());
	const { data: row, error: loadError } = await supabase
		.from('project_suggestions')
		.select('id, project_id, kind, status, result, undo_operations, user_feedback, decided_at')
		.eq('id', suggestionId)
		.eq('project_id', projectId)
		.maybeSingle();
	if (loadError) return { ok: false, status: 500, message: loadError.message };
	if (!row) return { ok: false, status: 404, message: 'Change not found' };

	const result = asRecord(row.result) ?? {};
	if (result.applied_via !== 'auto') {
		return {
			ok: false,
			status: 400,
			message: 'Only changes made without asking can be undone here.'
		};
	}
	if (result.undone_at || asRecord(row.user_feedback)?.reason === UNDO_AUTO_APPLY_REASON) {
		return { ok: false, status: 409, message: 'This change was already undone.' };
	}
	if (row.status !== 'applied') {
		return { ok: false, status: 409, message: 'This change is not applied.' };
	}
	const steps = parseCleanupUndoSteps(row.undo_operations, projectId);
	if (!steps) {
		return { ok: false, status: 422, message: 'This change has no undo on record.' };
	}

	const precheck = await checkUndoPreconditions({ supabase, projectId, steps });
	if (!precheck.ok) {
		return {
			ok: false,
			status: precheck.error === UNDO_CHANGED_MESSAGE ? 409 : 500,
			message: precheck.error
		};
	}

	const startedAt = now().toISOString();
	const feedback = {
		reason: UNDO_AUTO_APPLY_REASON,
		note: UNDO_AUTO_APPLY_NOTE,
		created_at: startedAt
	};
	const { data: claimed, error: claimError } = await supabase
		.from('project_suggestions')
		.update({
			status: 'rejected',
			decided_at: startedAt,
			user_feedback: feedback as unknown as Json,
			result: { ...result, undo_started_at: startedAt } as unknown as Json
		})
		.eq('id', suggestionId)
		.eq('project_id', projectId)
		.eq('status', 'applied')
		.select('id')
		.maybeSingle();
	if (claimError) return { ok: false, status: 500, message: claimError.message };
	if (!claimed) return { ok: false, status: 409, message: 'This change was already undone.' };

	let undoneSteps = 0;
	let failure: string | null = null;
	for (const step of steps) {
		const outcome = await runUndoStep({
			supabase,
			userId: params.userId,
			actorId: params.actorId,
			projectId,
			suggestionId,
			step,
			documentUpdatedAt: precheck.documentUpdatedAt
		}).catch((error: unknown) => ({
			ok: false as const,
			error: error instanceof Error ? error.message : 'Undo step failed'
		}));
		if (!outcome.ok) {
			failure = outcome.error;
			break;
		}
		undoneSteps += 1;
	}

	if (failure && undoneSteps === 0) {
		// Nothing changed: the change stays applied, with its Undo.
		await supabase
			.from('project_suggestions')
			.update({
				status: 'applied',
				decided_at: row.decided_at ?? null,
				user_feedback: row.user_feedback ?? null,
				result: result as unknown as Json
			})
			.eq('id', suggestionId)
			.eq('status', 'rejected');
		return { ok: false, status: 500, message: `Nothing was undone: ${failure}` };
	}

	const finishedAt = now().toISOString();
	const { data: updated, error: recordError } = await supabase
		.from('project_suggestions')
		.update({
			result: {
				...result,
				undo_started_at: startedAt,
				undone_at: finishedAt,
				...(failure
					? { undo_partial: true, undo_errors: [failure], undone_steps: undoneSteps }
					: {})
			} as unknown as Json
		})
		.eq('id', suggestionId)
		.eq('project_id', projectId)
		.select('*')
		.maybeSingle();
	if (recordError || !updated) {
		return {
			ok: false,
			status: 500,
			message: recordError?.message ?? 'Undone, but the record could not be saved.'
		};
	}
	if (failure) {
		return {
			ok: false,
			status: 500,
			message: `Partly undone (${undoneSteps} of ${steps.length} steps): ${failure}`
		};
	}
	return { ok: true, suggestion: updated, undoneSteps };
}
