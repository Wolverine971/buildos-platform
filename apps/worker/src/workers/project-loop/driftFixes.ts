// apps/worker/src/workers/project-loop/driftFixes.ts
//
// One-click fixes for drift (tasker 107). When one place is stale and another records the newer
// truth, the drift pass may propose exact-text edits to the stale document. Nothing here trusts
// the model: every edit must resolve uniquely against the document text the pass was shown, stay
// small, and have an exact reverse. Approval replays the edits through the reviewed gateway, and
// Project Review's integrity check re-resolves them against the live body first.
import type { LoopOperation } from '@buildos/shared-types';
import {
	type DocumentTextEditV1,
	largeDeletionRefusal,
	resolveDocumentEdits
} from '@buildos/shared-agent-ops';

export const DRIFT_FIX_LIMITS = Object.freeze({
	maxEdits: 5,
	/** An edit that needs more context than this is a rewrite, not a fix. */
	maxOldTextChars: 1_500,
	maxNewTextChars: 1_500,
	maxRevertChars: 40_000
});

export type DriftFixDocument = { id: string; title: string; content: string };

export type DriftFix = {
	operations: LoopOperation[];
	undoOperations: LoopOperation[];
	/** What the inbox preview shows before approval. */
	before: string[];
	after: string[];
	documentTitle: string;
};

export type DriftFixRejection =
	| 'no_operation'
	| 'invalid_shape'
	| 'unknown_document'
	| 'unresolved'
	| 'large_deletion'
	| 'no_reverse';

function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function parseEdits(value: unknown): DocumentTextEditV1[] | null {
	if (!Array.isArray(value) || value.length === 0 || value.length > DRIFT_FIX_LIMITS.maxEdits)
		return null;
	const edits: DocumentTextEditV1[] = [];
	for (const raw of value) {
		const edit = asRecord(raw);
		if (!edit) return null;
		const oldText = edit.old_text;
		const newText = edit.new_text ?? '';
		if (typeof oldText !== 'string' || !oldText.trim() || typeof newText !== 'string')
			return null;
		if (oldText === newText) return null;
		if (
			oldText.length > DRIFT_FIX_LIMITS.maxOldTextChars ||
			newText.length > DRIFT_FIX_LIMITS.maxNewTextChars
		)
			return null;
		edits.push({ old_text: oldText, new_text: newText });
	}
	return edits;
}

/**
 * The exact reverse of `before -> after` as one edit: the changed span plus one whole line of
 * context on each side, so even a deletion reverses by exact match. Verified by applying it.
 */
export function computeRevertEdit(before: string, after: string): DocumentTextEditV1 | null {
	if (before === after) return null;
	let prefix = 0;
	while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix])
		prefix += 1;
	let suffix = 0;
	while (
		suffix < before.length - prefix &&
		suffix < after.length - prefix &&
		before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
	)
		suffix += 1;

	// Start at the line before the one where the change begins.
	const lineStart = prefix > 0 ? before.lastIndexOf('\n', prefix - 1) : -1;
	const previousLineStart = lineStart > 0 ? before.lastIndexOf('\n', lineStart - 1) : -1;
	const start = lineStart < 0 ? 0 : previousLineStart + 1;
	// End after the line following the one where the change ends.
	const endInBefore = before.length - suffix;
	const lineEnd = before.indexOf('\n', endInBefore);
	const nextLineEnd = lineEnd < 0 ? -1 : before.indexOf('\n', lineEnd + 1);
	const tail = nextLineEnd < 0 ? 0 : before.length - nextLineEnd;
	if (tail > suffix) return null;

	const revert = {
		old_text: after.slice(start, after.length - tail),
		new_text: before.slice(start, before.length - tail)
	};
	if (!revert.old_text.trim() || revert.old_text.length > DRIFT_FIX_LIMITS.maxRevertChars)
		return null;
	const check = resolveDocumentEdits({
		project_id: 'revert-check',
		document_id: 'revert-check',
		content: after,
		edits: [revert]
	});
	return check.status === 'resolved' && check.next_content === before ? revert : null;
}

/**
 * Validate the model's proposed fix: at most one update_onto_document operation carrying only
 * exact-text edits to a document whose text the pass was shown. Returns the fix, or why not.
 */
export function buildDriftFix(input: {
	projectId: string;
	rawOperations: unknown;
	documents: ReadonlyMap<string, DriftFixDocument>;
}): { fix: DriftFix } | { rejected: DriftFixRejection } {
	const raws = Array.isArray(input.rawOperations) ? input.rawOperations : [];
	if (!raws.length) return { rejected: 'no_operation' };
	if (raws.length > 1) return { rejected: 'invalid_shape' };
	const raw = asRecord(raws[0]);
	const args = asRecord(raw?.args);
	if (raw?.tool !== 'update_onto_document' || !args) return { rejected: 'invalid_shape' };
	const documentId = typeof args.document_id === 'string' ? args.document_id : null;
	const document = documentId ? input.documents.get(documentId) : undefined;
	if (!documentId || !document) return { rejected: 'unknown_document' };
	const edits = parseEdits(args.edits);
	if (!edits) return { rejected: 'invalid_shape' };

	const resolved = resolveDocumentEdits({
		project_id: input.projectId,
		document_id: documentId,
		content: document.content,
		edits
	});
	if (resolved.status !== 'resolved') return { rejected: 'unresolved' };
	if (largeDeletionRefusal(document.content, resolved.next_content))
		return { rejected: 'large_deletion' };
	const revert = computeRevertEdit(document.content, resolved.next_content);
	if (!revert) return { rejected: 'no_reverse' };

	// Only document_id and edits are forwarded: no content, props, or section rewrites.
	const label = `Edit "${document.title}"`;
	return {
		fix: {
			operations: [
				{
					tool: 'update_onto_document',
					args: { project_id: input.projectId, document_id: documentId, edits },
					label
				}
			],
			undoOperations: [
				{
					tool: 'update_onto_document',
					args: { project_id: input.projectId, document_id: documentId, edits: [revert] },
					label: `Undo edit to "${document.title}"`
				}
			],
			before: edits.map((edit) => edit.old_text.trim()),
			after: edits.map((edit) => edit.new_text.trim() || '(removed)'),
			documentTitle: document.title
		}
	};
}

export type DriftFixGoal = { id: string; name: string; state_key: string | null };
export type DriftFixProject = {
	id: string;
	description: string | null;
	type_key: string | null;
};

/** Goal states the review may set; the verifier accepts the same list. */
const GOAL_STATES = new Set(['draft', 'active', 'achieved', 'abandoned']);
/** project.{realm}.{initiative}[.{variant}] — the verifier enforces the same shape. */
const PROJECT_TYPE_KEY = /^project\.[a-z0-9_]+\.[a-z0-9_]+(\.[a-z0-9_]+)?$/;
const MAX_GOAL_NAME_CHARS = 200;
const MAX_PROJECT_DESCRIPTION_CHARS = 2_000;

/**
 * Tasker 112: drift whose stale place is a goal or the project itself. A goal gets a rename or a
 * state change; the project gets a new description or type. The label, preview and undo come
 * from code and the values the pass was shown, never from the model's wording.
 */
export function buildRecordFix(input: {
	projectId: string;
	rawOperations: unknown;
	goals: ReadonlyMap<string, DriftFixGoal>;
	project: DriftFixProject;
}): { fix: DriftFix } | { rejected: DriftFixRejection } {
	const raws = Array.isArray(input.rawOperations) ? input.rawOperations : [];
	if (!raws.length) return { rejected: 'no_operation' };
	if (raws.length > 1) return { rejected: 'invalid_shape' };
	const raw = asRecord(raws[0]);
	const args = asRecord(raw?.args);
	if (!args) return { rejected: 'invalid_shape' };

	if (raw?.tool === 'update_onto_goal') {
		const goalId = typeof args.goal_id === 'string' ? args.goal_id : null;
		const goal = goalId ? input.goals.get(goalId) : undefined;
		if (!goalId || !goal) return { rejected: 'unknown_document' };
		const name = typeof args.name === 'string' ? args.name.trim() : null;
		const state = typeof args.state_key === 'string' ? args.state_key : null;
		// One change per fix, so the card says exactly what approval does.
		if ((name ? 1 : 0) + (state ? 1 : 0) !== 1) return { rejected: 'invalid_shape' };
		if (name) {
			if (name.length > MAX_GOAL_NAME_CHARS || name === goal.name)
				return { rejected: 'invalid_shape' };
			return recordFix(
				input.projectId,
				'update_onto_goal',
				{ goal_id: goalId },
				{
					field: 'name',
					next: name,
					previous: goal.name,
					label: `Rename goal "${goal.name}" to "${name}"`,
					undoLabel: `Rename goal back to "${goal.name}"`,
					title: goal.name
				}
			);
		}
		if (!state || !GOAL_STATES.has(state) || state === goal.state_key || !goal.state_key)
			return { rejected: 'invalid_shape' };
		return recordFix(
			input.projectId,
			'update_onto_goal',
			{ goal_id: goalId },
			{
				field: 'state_key',
				next: state,
				previous: goal.state_key,
				label: `Mark goal "${goal.name}" ${state}`,
				undoLabel: `Mark goal "${goal.name}" ${goal.state_key} again`,
				title: goal.name
			}
		);
	}

	if (raw?.tool === 'update_onto_project') {
		const description = typeof args.description === 'string' ? args.description.trim() : null;
		const typeKey = typeof args.type_key === 'string' ? args.type_key : null;
		if ((description ? 1 : 0) + (typeKey ? 1 : 0) !== 1) return { rejected: 'invalid_shape' };
		if (description) {
			if (
				description.length > MAX_PROJECT_DESCRIPTION_CHARS ||
				description === (input.project.description ?? '').trim()
			)
				return { rejected: 'invalid_shape' };
			return recordFix(
				input.projectId,
				'update_onto_project',
				{},
				{
					field: 'description',
					next: description,
					previous: input.project.description ?? '',
					label: 'Update the project description',
					undoLabel: 'Restore the previous project description',
					title: 'Project description'
				}
			);
		}
		if (!typeKey || !PROJECT_TYPE_KEY.test(typeKey) || typeKey === input.project.type_key)
			return { rejected: 'invalid_shape' };
		if (!input.project.type_key) return { rejected: 'no_reverse' };
		return recordFix(
			input.projectId,
			'update_onto_project',
			{},
			{
				field: 'type_key',
				next: typeKey,
				previous: input.project.type_key,
				label: `Change the project type to ${typeKey}`,
				undoLabel: `Change the project type back to ${input.project.type_key}`,
				title: 'Project type'
			}
		);
	}

	return { rejected: 'invalid_shape' };
}

function recordFix(
	projectId: string,
	tool: 'update_onto_goal' | 'update_onto_project',
	target: Record<string, string>,
	change: {
		field: string;
		next: string;
		previous: string;
		label: string;
		undoLabel: string;
		title: string;
	}
): { fix: DriftFix } {
	return {
		fix: {
			operations: [
				{
					tool,
					args: { project_id: projectId, ...target, [change.field]: change.next },
					label: change.label
				}
			],
			undoOperations: [
				{
					tool,
					args: { project_id: projectId, ...target, [change.field]: change.previous },
					label: change.undoLabel
				}
			],
			before: [change.previous || '(empty)'],
			after: [change.next],
			documentTitle: change.title
		}
	};
}
