// apps/web/src/lib/server/tables/table-revert.ts
/**
 * Folds several table change receipts (one agent turn: "add a column, then fill
 * it") into a single undo: inverse ops newest first, and the schema as it was
 * before the earliest column change. Undoing them one request at a time fails,
 * because each undo moves the table to a new revision and the next receipt's
 * revision guard no longer matches.
 *
 * The combined undo is only safe while the table is still at the newest
 * receipt's revision, so the caller guards the apply with that revision. That
 * guard makes per-row versions redundant, and they would be wrong anyway: two
 * receipts touching the same row each carry the version from their own moment.
 */
import type { TableSchema } from '@buildos/shared-agent-ops/tables';
import { isPlainObject } from './table-api';

export type CombinedRevert =
	| {
			ok: true;
			/** Revision the table must still be at (the newest receipt's). */
			newestRevision: number;
			/** Inverse ops of every receipt, newest receipt first, without per-row versions. */
			ops: unknown[];
			/** Schema before the earliest column change, when any receipt changed columns. */
			inverseSchema: Record<string, unknown> | null;
	  }
	| { ok: false; error: string };

export function combineTableChangeReceipts(
	documentId: string,
	receipts: unknown[]
): CombinedRevert {
	const parsed: Array<{
		revision: number;
		ops: unknown[];
		schema: Record<string, unknown> | null;
	}> = [];
	for (const receipt of receipts) {
		if (!isPlainObject(receipt) || receipt.kind !== 'table_change') {
			return { ok: false, error: 'receipts must be table change receipts' };
		}
		if (receipt.document_id !== documentId) {
			return { ok: false, error: 'A receipt belongs to a different table' };
		}
		if (
			typeof receipt.applied_revision !== 'number' ||
			!Number.isInteger(receipt.applied_revision)
		) {
			return { ok: false, error: 'Every receipt needs its applied_revision' };
		}
		if (!Array.isArray(receipt.inverse_ops)) {
			return { ok: false, error: 'receipt.inverse_ops is missing' };
		}
		parsed.push({
			revision: receipt.applied_revision,
			ops: receipt.inverse_ops,
			schema: isPlainObject(receipt.inverse_schema) ? receipt.inverse_schema : null
		});
	}
	if (parsed.length === 0) return { ok: false, error: 'Nothing to undo' };

	const newestFirst = [...parsed].sort((a, b) => b.revision - a.revision);
	const ops = newestFirst.flatMap((entry) =>
		entry.ops.map((op) => {
			if (!isPlainObject(op) || !('expected_version' in op)) return op;
			const { expected_version: _ignored, ...rest } = op;
			return rest;
		})
	);
	const earliestSchema =
		[...newestFirst].reverse().find((entry) => entry.schema !== null)?.schema ?? null;

	if (ops.length === 0 && !earliestSchema) return { ok: false, error: 'Nothing to undo' };
	return {
		ok: true,
		newestRevision: newestFirst[0]!.revision,
		ops,
		inverseSchema: earliestSchema
	};
}

/**
 * Inverse ops may clear cells of a column the restored schema no longer has (the
 * "fill the new column" half of the change). Validate against the restored
 * columns plus the current ones so those clears pass; the apply then installs
 * the restored schema.
 */
export function schemaForRevertValidation(
	restored: TableSchema,
	current: TableSchema
): TableSchema {
	const known = new Set(restored.columns.map((column) => column.id));
	return {
		...restored,
		columns: [...restored.columns, ...current.columns.filter((column) => !known.has(column.id))]
	};
}
