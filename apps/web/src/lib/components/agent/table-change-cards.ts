// apps/web/src/lib/components/agent/table-change-cards.ts
//
// User-facing half of agent table writes (BuildOS Tables, 2026-10-04). A
// successful create_onto_table / update_onto_table / update_onto_table_rows
// receipt carries a structured `table_change` (TableChangeReceipt: counts,
// sample cell diffs, inverse ops). This module reads that receipt out of a tool
// result (live SSE or a restored tool execution), merges a turn's changes into
// one card per table, builds the "Job applications · +3 rows · 7 cells" line,
// and calls the Undo endpoint.
//
// Detection reads the structured `table_change` field only; nothing here
// interprets tool or model text.

import type { TableChangeReceipt, TableChangeSample } from '@buildos/shared-agent-ops/tables';

export type { TableChangeReceipt } from '@buildos/shared-agent-ops/tables';

/** One chat card: every change the turn made to one table, in order. */
export interface TableChangeCard {
	/** Stable identity: the table plus the revision the turn left behind. */
	id: string;
	documentId: string;
	projectId: string;
	title: string;
	rowsAdded: number;
	rowsUpdated: number;
	rowsDeleted: number;
	cellsChanged: number;
	columnsChanged: string[];
	/** Sample cell diffs across the turn's changes, capped. */
	sample: TableChangeSample[];
	changeCount: number;
	/** Receipts in the order they were applied; Undo reverts them newest first. */
	receipts: TableChangeReceipt[];
	/** Set once Undo succeeded in this session. */
	undone?: boolean;
}

export type TableChangeUndoResult =
	| { status: 'undone'; reverted: number }
	| { status: 'conflict'; reason: string; message: string; reverted: number }
	| { status: 'error'; message: string; reverted: number };

const FALLBACK_TITLE = 'Untitled table';
const CARD_SAMPLE_LIMIT = 12;

function isRecord(value: unknown): value is Record<string, any> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isTableChangeReceipt(value: unknown): value is TableChangeReceipt {
	return (
		isRecord(value) &&
		value.kind === 'table_change' &&
		typeof value.document_id === 'string' &&
		value.document_id.length > 0 &&
		typeof value.project_id === 'string' &&
		Number.isFinite(value.rows_added) &&
		Number.isFinite(value.rows_updated) &&
		Number.isFinite(value.rows_deleted) &&
		Number.isFinite(value.cells_changed) &&
		Array.isArray(value.inverse_ops)
	);
}

/**
 * The change receipt of a successful table write, or null. Live SSE results
 * nest the receipt at `result`; stored tool executions may hold it directly or
 * under the legacy `data` alias.
 */
export function extractTableChangeReceipt(toolResult: unknown): TableChangeReceipt | null {
	if (!isRecord(toolResult)) return null;
	const candidates = [
		toolResult,
		toolResult.result,
		toolResult.data,
		isRecord(toolResult.result) ? toolResult.result.result : undefined
	];
	for (const candidate of candidates) {
		if (isRecord(candidate) && isTableChangeReceipt(candidate.table_change)) {
			return candidate.table_change;
		}
	}
	return null;
}

/** True when the receipt changed nothing a user would see (an empty batch). */
function isEmptyChange(receipt: TableChangeReceipt): boolean {
	return (
		receipt.rows_added === 0 &&
		receipt.rows_updated === 0 &&
		receipt.rows_deleted === 0 &&
		receipt.cells_changed === 0 &&
		(receipt.columns_changed?.length ?? 0) === 0
	);
}

function receiptTitle(receipt: TableChangeReceipt): string | null {
	return typeof receipt.title === 'string' && receipt.title.trim() ? receipt.title.trim() : null;
}

/**
 * Merge a turn's receipts into one card per table (first-change order): counts
 * summed, samples listed in change order, Undo chained newest change first.
 */
export function buildTableChangeCards(receipts: TableChangeReceipt[]): TableChangeCard[] {
	const groups = new Map<string, TableChangeReceipt[]>();
	for (const receipt of receipts) {
		if (isEmptyChange(receipt)) continue;
		const group = groups.get(receipt.document_id) ?? [];
		// A replayed tool result must not double the counts.
		if (group.some((seen) => seen.applied_revision === receipt.applied_revision)) continue;
		group.push(receipt);
		groups.set(receipt.document_id, group);
	}

	return [...groups.values()].map((group) => {
		const first = group[0]!;
		const last = group[group.length - 1]!;
		const title =
			[...group]
				.reverse()
				.map(receiptTitle)
				.find((value): value is string => Boolean(value)) ?? FALLBACK_TITLE;
		const columns = new Set<string>();
		for (const receipt of group) {
			for (const column of receipt.columns_changed ?? []) columns.add(column);
		}
		return {
			id: `${first.document_id}:${last.applied_revision}`,
			documentId: first.document_id,
			projectId: first.project_id,
			title,
			rowsAdded: group.reduce((sum, receipt) => sum + receipt.rows_added, 0),
			rowsUpdated: group.reduce((sum, receipt) => sum + receipt.rows_updated, 0),
			rowsDeleted: group.reduce((sum, receipt) => sum + receipt.rows_deleted, 0),
			cellsChanged: group.reduce((sum, receipt) => sum + receipt.cells_changed, 0),
			columnsChanged: [...columns],
			sample: group.flatMap((receipt) => receipt.sample ?? []).slice(0, CARD_SAMPLE_LIMIT),
			changeCount: group.length,
			receipts: group
		};
	});
}

function plural(count: number, noun: string): string {
	return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/** "+3 rows · 7 cells · 1 deleted · 1 column" from structured counts. */
export function describeTableChange(change: {
	rowsAdded: number;
	cellsChanged: number;
	rowsDeleted: number;
	rowsUpdated: number;
	columnsChanged: string[];
}): string {
	const parts = [
		change.rowsAdded > 0 ? `+${plural(change.rowsAdded, 'row')}` : null,
		change.cellsChanged > 0
			? plural(change.cellsChanged, 'cell')
			: change.rowsUpdated > 0
				? `${plural(change.rowsUpdated, 'row')} changed`
				: null,
		change.rowsDeleted > 0 ? `${change.rowsDeleted} deleted` : null,
		change.columnsChanged.length > 0 ? plural(change.columnsChanged.length, 'column') : null
	].filter((part): part is string => part !== null);
	return parts.length > 0 ? parts.join(' · ') : 'Updated';
}

export function describeTableChangeReceipt(receipt: TableChangeReceipt): string {
	return describeTableChange({
		rowsAdded: receipt.rows_added,
		rowsUpdated: receipt.rows_updated,
		rowsDeleted: receipt.rows_deleted,
		cellsChanged: receipt.cells_changed,
		columnsChanged: receipt.columns_changed ?? []
	});
}

/** "Job applications · +3 rows · 7 cells" — the toast line for one change. */
export function buildTableChangeToastMessage(receipt: TableChangeReceipt): string {
	return `${receiptTitle(receipt) ?? FALLBACK_TITLE} · ${describeTableChangeReceipt(receipt)}`;
}

/** Opens the table (same deep link as the created-entity chips and document cards). */
export function tableChangeHref(ref: { projectId: string; documentId: string }): string {
	return `/projects/${ref.projectId}?doc=${ref.documentId}`;
}

/** Plain-language copy for the structured conflict codes the Undo endpoint returns. */
export function describeTableUndoConflict(reason: string): string {
	switch (reason) {
		case 'ROW_CONFLICT':
			return 'Some of these rows were edited since, so Undo can’t restore them cleanly.';
		case 'TABLE_CONFLICT':
			return 'The table changed since, so Undo can’t apply cleanly. Check the table and fix it by hand.';
		case 'ROW_NOT_FOUND':
			return 'Some of these rows no longer exist, so Undo can’t restore them.';
		default:
			return 'The table changed since, so Undo can’t apply cleanly.';
	}
}

async function revertReceipts(
	receipts: TableChangeReceipt[],
	fetchImpl: typeof fetch
): Promise<
	{ status: 'ok' } | { status: 'conflict'; reason: string } | { status: 'error'; message: string }
> {
	let response: Response;
	try {
		response = await fetchImpl(
			`/api/onto/tables/${encodeURIComponent(receipts[0]!.document_id)}/revert-change`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(
					receipts.length === 1 ? { receipt: receipts[0] } : { receipts }
				)
			}
		);
	} catch {
		return {
			status: 'error',
			message: 'Couldn’t reach BuildOS. Check your connection and try again.'
		};
	}
	const payload = (await response.json().catch(() => null)) as Record<string, any> | null;
	if (response.ok && payload?.success !== false) return { status: 'ok' };
	if (response.status === 409) {
		const code =
			typeof payload?.code === 'string'
				? payload.code
				: typeof payload?.data?.code === 'string'
					? payload.data.code
					: 'TABLE_CONFLICT';
		return { status: 'conflict', reason: code };
	}
	return {
		status: 'error',
		message:
			typeof payload?.error === 'string' && payload.error
				? payload.error
				: 'Undo failed. Try again.'
	};
}

/**
 * Undo every change on the card in one request: the server folds the receipts
 * (newest first) into a single guarded apply, so "add a column, then fill it"
 * reverts as a unit instead of stalling after the first step.
 */
export async function undoTableChange(
	card: TableChangeCard,
	fetchImpl: typeof fetch = fetch
): Promise<TableChangeUndoResult> {
	if (card.receipts.length === 0) return { status: 'undone', reverted: 0 };
	const result = await revertReceipts(card.receipts, fetchImpl);
	if (result.status === 'conflict') {
		return {
			status: 'conflict',
			reason: result.reason,
			message: describeTableUndoConflict(result.reason),
			reverted: 0
		};
	}
	if (result.status === 'error') return { status: 'error', message: result.message, reverted: 0 };
	return { status: 'undone', reverted: card.receipts.length };
}
