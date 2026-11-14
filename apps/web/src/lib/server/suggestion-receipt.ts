// apps/web/src/lib/server/suggestion-receipt.ts
//
// The receipt of an applied suggestion (tasker 156): for each step that was written, what it
// did, to which record, and every field before → after. The before values come from the
// integrity check that runs against live state just before the write, so the receipt says
// what actually changed, not what the review guessed days earlier. Pure.

import type { LoopOperation, ProjectSuggestionReceiptOperation } from '@buildos/shared-types';

/** The verified, decoded form of one operation (shared-agent-ops `DecodedLoopOperation`). */
export type VerifiedOperation = {
	actionLabel: string;
	entityLabel: string;
	target: string | null;
	changes: Array<{ label: string; value: string; before?: string }>;
};

/** The verifier's labels for where a moved document sits and where it goes. */
export const MOVE_FROM_LABEL = 'Current location';
export const MOVE_TO_LABEL = 'New location';

const MAX_OPERATIONS = 20;
const MAX_CHANGES = 8;
const MAX_TEXT = 240;

/** Which argument names the record each tool changes. Ids only; never text. */
const SUBJECT_ARGS: ReadonlyArray<[arg: string, kind: string]> = [
	['task_id', 'task'],
	['document_id', 'document'],
	['goal_id', 'goal'],
	['milestone_id', 'milestone'],
	['plan_id', 'plan'],
	['risk_id', 'risk']
];

function clip(value: string): string {
	const text = value.trim();
	return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT).trimEnd()}…` : text;
}

function subjectOf(operation: LoopOperation): { kind: string; id: string } | null {
	const args = operation.args ?? {};
	for (const [arg, kind] of SUBJECT_ARGS) {
		const id = args[arg];
		if (typeof id === 'string' && id) return { kind, id };
	}
	if (operation.tool === 'update_onto_project' && typeof args.project_id === 'string') {
		return { kind: 'project', id: args.project_id };
	}
	return null;
}

/**
 * The steps that were written, in order. `applied[i]` says whether operation `i` landed.
 * Returns nothing when the verified list does not line up with the operations one to one.
 */
export function buildSuggestionReceipt(params: {
	operations: readonly LoopOperation[];
	verified: readonly VerifiedOperation[];
	applied: readonly boolean[];
}): ProjectSuggestionReceiptOperation[] {
	const { operations, verified, applied } = params;
	if (!operations.length || verified.length !== operations.length) return [];
	const receipt: ProjectSuggestionReceiptOperation[] = [];
	for (const [index, operation] of operations.entries()) {
		if (!applied[index]) continue;
		if (receipt.length >= MAX_OPERATIONS) break;
		const step = verified[index];
		if (!step) continue;
		receipt.push({
			action_label: step.entityLabel
				? `${step.actionLabel} ${step.entityLabel}`
				: step.actionLabel,
			target: step.target ? clip(step.target) : null,
			entity: subjectOf(operation),
			changes: step.changes.slice(0, MAX_CHANGES).map((change) => ({
				label: change.label,
				...(change.before !== undefined ? { before: clip(change.before) } : {}),
				value: clip(change.value)
			}))
		});
	}
	return receipt;
}

/** One line per step for a compact surface: `Move document · Brand Direction (Top level → Strategy)`. */
export function receiptLines(
	receipt: readonly ProjectSuggestionReceiptOperation[] | null | undefined
): string[] {
	return (receipt ?? []).map((step) => {
		const head = step.target ? `${step.action_label} · ${step.target}` : step.action_label;
		const change = step.changes.find((entry) => entry.before !== undefined);
		if (change) return `${head} (${change.label}: ${change.before} → ${change.value})`;
		// A move is decoded as two code-written rows instead of one before → after.
		const from = step.changes.find((entry) => entry.label === MOVE_FROM_LABEL);
		const to = step.changes.find((entry) => entry.label === MOVE_TO_LABEL);
		return from && to ? `${head} (${from.value} → ${to.value})` : head;
	});
}
