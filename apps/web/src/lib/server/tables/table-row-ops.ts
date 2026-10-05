// apps/web/src/lib/server/tables/table-row-ops.ts
//
// Validate and coerce row ops sent by the grid before they reach the apply RPC.
// Cells may be keyed by column id or (case-insensitive) column name; values are
// coerced by the column's declared type (never its name). A select value that
// is not yet a choice is kept and added to the column's choices, so typing a
// new status in the grid just works.
import { isValidUUID } from '$lib/utils/operations/validation-utils';
import {
	coerceCellValue,
	resolveColumn,
	withNewChoices,
	type TableCellMeta,
	type TableCellValue,
	type TableColumn,
	type TableRowOp,
	type TableSchema
} from '@buildos/shared-agent-ops/tables';
import { isPlainObject } from './table-api';

const ROW_OP_KINDS = new Set(['insert', 'update', 'delete', 'restore', 'move']);

type RowOpOf<K extends TableRowOp['op']> = Extract<TableRowOp, { op: K }>;

export type PreparedRowOps =
	| { ok: true; ops: TableRowOp[]; schema: TableSchema | null }
	| { ok: false; errors: string[] };

function findColumn(schema: TableSchema, key: string): TableColumn | null {
	return schema.columns.find((column) => column.id === key) ?? resolveColumn(schema, key);
}

function isEmptyInput(value: unknown): boolean {
	return value === null || value === undefined || (typeof value === 'string' && !value.trim());
}

function choiceValues(column: TableColumn): Set<string> {
	return new Set((column.options?.choices ?? []).map((choice) => choice.value.toLowerCase()));
}

function collectNewChoices(
	column: TableColumn,
	value: TableCellValue,
	into: Map<string, string[]>
): void {
	if (column.type !== 'select' && column.type !== 'multi_select') return;
	const values =
		typeof value === 'string' ? [value] : Array.isArray(value) ? (value as string[]) : [];
	if (values.length === 0) return;
	const known = choiceValues(column);
	const pending = into.get(column.id) ?? [];
	for (const candidate of values) {
		if (typeof candidate !== 'string' || !candidate) continue;
		const key = candidate.toLowerCase();
		if (known.has(key) || pending.some((entry) => entry.toLowerCase() === key)) continue;
		pending.push(candidate);
	}
	if (pending.length > 0) into.set(column.id, pending);
}

function coerceCells(
	schema: TableSchema,
	raw: unknown,
	mode: 'insert' | 'update',
	label: string,
	errors: string[],
	newChoices: Map<string, string[]>
): Record<string, TableCellValue> | undefined {
	if (raw === undefined) return undefined;
	if (!isPlainObject(raw)) {
		errors.push(`${label}: cells must be an object`);
		return undefined;
	}
	const cells: Record<string, TableCellValue> = {};
	for (const [key, value] of Object.entries(raw)) {
		const column = findColumn(schema, key);
		if (!column) {
			errors.push(`${label}: unknown column "${key}"`);
			continue;
		}
		if (isEmptyInput(value)) {
			// null clears a cell on update; empty inserts simply leave it out.
			if (mode === 'update') cells[column.id] = null;
			continue;
		}
		const coerced = coerceCellValue(column, value);
		if (coerced.error) {
			errors.push(`${label}: ${column.name}: ${coerced.error}`);
			continue;
		}
		if (coerced.value === null || coerced.value === undefined) {
			if (mode === 'update') cells[column.id] = null;
			continue;
		}
		cells[column.id] = coerced.value;
		collectNewChoices(column, coerced.value, newChoices);
	}
	return cells;
}

function remapCellMeta(
	schema: TableSchema,
	raw: unknown,
	label: string,
	errors: string[]
): Record<string, TableCellMeta | null> | undefined {
	if (raw === undefined) return undefined;
	if (!isPlainObject(raw)) {
		errors.push(`${label}: cell_meta must be an object`);
		return undefined;
	}
	const meta: Record<string, TableCellMeta | null> = {};
	for (const [key, value] of Object.entries(raw)) {
		const column = findColumn(schema, key);
		if (!column) {
			errors.push(`${label}: unknown column "${key}" in cell_meta`);
			continue;
		}
		if (value !== null && !isPlainObject(value)) {
			errors.push(`${label}: cell_meta for ${column.name} must be an object or null`);
			continue;
		}
		meta[column.id] = value as TableCellMeta | null;
	}
	return meta;
}

function readRowId(op: Record<string, unknown>, label: string, errors: string[]): string | null {
	const rowId = op.row_id;
	if (typeof rowId !== 'string' || !isValidUUID(rowId)) {
		errors.push(`${label}: row_id must be a row id`);
		return null;
	}
	return rowId;
}

function readExpectedVersion(
	op: Record<string, unknown>,
	label: string,
	errors: string[]
): number | undefined {
	const value = op.expected_version;
	if (value === undefined || value === null) return undefined;
	if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
		errors.push(`${label}: expected_version must be a non-negative integer`);
		return undefined;
	}
	return value;
}

function readAfterRowId(
	op: Record<string, unknown>,
	label: string,
	errors: string[]
): string | null | undefined {
	const value = op.after_row_id;
	if (value === undefined) return undefined;
	if (value === null) return null;
	if (typeof value !== 'string' || !isValidUUID(value)) {
		errors.push(`${label}: after_row_id must be a row id`);
		return undefined;
	}
	return value;
}

function readPosition(
	op: Record<string, unknown>,
	label: string,
	errors: string[]
): number | undefined {
	const value = op.position;
	if (value === undefined || value === null) return undefined;
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		errors.push(`${label}: position must be a number`);
		return undefined;
	}
	return value;
}

/**
 * Shape-check every op, key cells by column id and coerce values by column type.
 * Returns the cleaned ops plus a schema to save alongside them when new select
 * choices were introduced (null when the schema is unchanged).
 */
export function prepareRowOps(schema: TableSchema, rawOps: unknown[]): PreparedRowOps {
	const errors: string[] = [];
	const newChoices = new Map<string, string[]>();
	const ops: TableRowOp[] = [];

	rawOps.forEach((raw, index) => {
		const label = `ops[${index}]`;
		if (!isPlainObject(raw) || typeof raw.op !== 'string' || !ROW_OP_KINDS.has(raw.op)) {
			errors.push(`${label}: op must be one of insert, update, delete, restore, move`);
			return;
		}
		switch (raw.op) {
			case 'insert': {
				const cells = coerceCells(
					schema,
					raw.cells ?? {},
					'insert',
					label,
					errors,
					newChoices
				);
				const cellMeta = remapCellMeta(schema, raw.cell_meta, label, errors);
				const position = readPosition(raw, label, errors);
				const afterRowId = readAfterRowId(raw, label, errors);
				const op: RowOpOf<'insert'> = { op: 'insert', cells: cells ?? {} };
				if (typeof raw.ref === 'string' && raw.ref) op.ref = raw.ref.slice(0, 64);
				if (cellMeta) {
					const filled = Object.fromEntries(
						Object.entries(cellMeta).filter(([, value]) => value !== null)
					) as Record<string, TableCellMeta>;
					if (Object.keys(filled).length > 0) op.cell_meta = filled;
				}
				if (position !== undefined) op.position = position;
				if (afterRowId) op.after_row_id = afterRowId;
				ops.push(op);
				return;
			}
			case 'update': {
				const rowId = readRowId(raw, label, errors);
				const cells = coerceCells(schema, raw.cells, 'update', label, errors, newChoices);
				const cellMeta = remapCellMeta(schema, raw.cell_meta, label, errors);
				const expectedVersion = readExpectedVersion(raw, label, errors);
				if (!rowId) return;
				if (!cells && !cellMeta) {
					errors.push(`${label}: update needs cells or cell_meta`);
					return;
				}
				const op: RowOpOf<'update'> = { op: 'update', row_id: rowId };
				if (cells) op.cells = cells;
				if (cellMeta) op.cell_meta = cellMeta;
				if (expectedVersion !== undefined) op.expected_version = expectedVersion;
				ops.push(op);
				return;
			}
			case 'delete': {
				const rowId = readRowId(raw, label, errors);
				const expectedVersion = readExpectedVersion(raw, label, errors);
				if (!rowId) return;
				const op: RowOpOf<'delete'> = { op: 'delete', row_id: rowId };
				if (expectedVersion !== undefined) op.expected_version = expectedVersion;
				ops.push(op);
				return;
			}
			case 'restore': {
				const rowId = readRowId(raw, label, errors);
				if (!rowId) return;
				ops.push({ op: 'restore', row_id: rowId });
				return;
			}
			case 'move': {
				const rowId = readRowId(raw, label, errors);
				const position = readPosition(raw, label, errors);
				const afterRowId = readAfterRowId(raw, label, errors);
				if (!rowId) return;
				if (position === undefined && afterRowId === undefined) {
					errors.push(`${label}: move needs position or after_row_id`);
					return;
				}
				const op: RowOpOf<'move'> = { op: 'move', row_id: rowId };
				if (position !== undefined) op.position = position;
				if (afterRowId !== undefined) op.after_row_id = afterRowId;
				ops.push(op);
				return;
			}
		}
	});

	if (errors.length > 0) return { ok: false, errors };
	return {
		ok: true,
		ops,
		schema: newChoices.size > 0 ? withNewChoices(schema, Object.fromEntries(newChoices)) : null
	};
}
