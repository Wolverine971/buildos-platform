// apps/worker/src/workers/project-loop/driftFixes.ts
//
// One-click fixes for drift (tasker 107). When one place is stale and another records the newer
// truth, the drift pass may propose exact-text edits to the stale document. Nothing here trusts
// the model: every edit must resolve uniquely against the document text the pass was shown, stay
// small, and have an exact reverse. Approval replays the edits through the reviewed gateway, and
// Project Review's integrity check re-resolves them against the live body first.
import type { LoopOperation } from '@buildos/shared-types';
import {
	largeDeletionRefusal,
	resolveDocumentEdits,
	type DocumentTextEditV1
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
