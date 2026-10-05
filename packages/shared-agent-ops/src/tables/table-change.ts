// packages/shared-agent-ops/src/tables/table-change.ts
// Change receipts for BuildOS Tables (the chat card + Undo) and dry-run
// previews of row ops (the chat worker's preview-before-review).
//
// Browser-safe.
import {
	cellToText,
	cellValuesEqual,
	isEmptyCellValue,
	isRecord,
	primaryColumn
} from './table-schema';
import {
	rowHandle,
	type LoadedTable,
	type TableApplyResult,
	type TableCellMeta,
	type TableCellValue,
	type TableChangeReceipt,
	type TableChangeSample,
	type TableColumn,
	type TableDocumentSummary,
	type TableRow,
	type TableRowOp,
	type TableSchema
} from './table-types';

const MAX_SAMPLES = 8;
const SAMPLE_TEXT_CHARS = 120;

function sampleText(column: TableColumn | undefined, value: unknown): string {
	const text = cellToText(column ?? null, (value ?? null) as TableCellValue);
	const flat = text.replace(/\s+/g, ' ').trim();
	return flat.length > SAMPLE_TEXT_CHARS ? `${flat.slice(0, SAMPLE_TEXT_CHARS - 1)}…` : flat;
}

function filledKeys(cells: unknown): string[] {
	if (!isRecord(cells)) return [];
	return Object.keys(cells).filter((key) => !isEmptyCellValue(cells[key]));
}

function comparableColumn(column: TableColumn): string {
	const { width: _width, ...rest } = column;
	return JSON.stringify(rest);
}

/** Names of columns added, removed, moved, or changed (width-only resizes ignored). */
function changedColumnNames(previous: TableSchema | null | undefined, next: TableSchema): string[] {
	if (!previous) return [];
	const previousById = new Map(
		previous.columns.map((column, index) => [column.id, { column, index }])
	);
	const nextIds = new Set(next.columns.map((column) => column.id));
	const names: string[] = [];
	const previousOrder = previous.columns
		.filter((column) => nextIds.has(column.id))
		.map((c) => c.id);
	const nextOrder = next.columns.filter((column) => previousById.has(column.id)).map((c) => c.id);
	next.columns.forEach((column) => {
		const before = previousById.get(column.id);
		const moved = before && previousOrder.indexOf(column.id) !== nextOrder.indexOf(column.id);
		if (!before || moved || comparableColumn(before.column) !== comparableColumn(column)) {
			names.push(column.name);
		}
	});
	for (const column of previous.columns) {
		if (!nextIds.has(column.id)) names.push(column.name);
	}
	return Array.from(new Set(names));
}

function schemaShapeChanged(previous: TableSchema, next: TableSchema): boolean {
	const shape = (schema: TableSchema) =>
		JSON.stringify({
			columns: schema.columns,
			views: schema.views ?? null,
			primary: schema.primary_column_id ?? null
		});
	return shape(previous) !== shape(next);
}

/**
 * The receipt for one apply: counts, up to 8 readable cell diffs, and the ops
 * that undo it. Inverse ops carry `expected_version` (the version this change
 * left the row at) so Undo refuses rows someone has edited since.
 */
export function buildTableChangeReceipt(args: {
	table: LoadedTable | { document: TableDocumentSummary; schema: TableSchema };
	apply: TableApplyResult;
	previousSchema?: TableSchema | null;
}): TableChangeReceipt {
	const { document, schema } = args.table;
	const previousSchema = args.previousSchema ?? null;
	const results = Array.isArray(args.apply?.results) ? args.apply.results : [];
	const columnsById = new Map<string, TableColumn>();
	for (const column of previousSchema?.columns ?? []) columnsById.set(column.id, column);
	for (const column of schema.columns) columnsById.set(column.id, column);
	const title = primaryColumn(schema);
	const nameOf = (id: string) => columnsById.get(id)?.name ?? id;

	let rowsAdded = 0;
	let rowsDeleted = 0;
	let cellsChanged = 0;
	const updatedRows = new Set<string>();
	const updateSamples: TableChangeSample[] = [];
	const insertSamples: TableChangeSample[] = [];
	const deleteSamples: TableChangeSample[] = [];

	for (const result of results) {
		const handle = rowHandle(result.row_number);
		switch (result.op) {
			case 'insert':
			case 'restore': {
				rowsAdded += 1;
				const keys = filledKeys(result.after?.cells);
				cellsChanged += result.op === 'insert' ? keys.length : 0;
				const key = title && keys.includes(title.id) ? title.id : keys[0];
				if (key) {
					insertSamples.push({
						row: handle,
						column: nameOf(key),
						before: '',
						after: sampleText(columnsById.get(key), result.after?.cells?.[key])
					});
				}
				break;
			}
			case 'delete': {
				rowsDeleted += 1;
				const keys = filledKeys(result.before?.cells);
				const key = title && keys.includes(title.id) ? title.id : keys[0];
				if (key) {
					deleteSamples.push({
						row: handle,
						column: nameOf(key),
						before: sampleText(columnsById.get(key), result.before?.cells?.[key]),
						after: ''
					});
				}
				break;
			}
			case 'update': {
				updatedRows.add(result.row_id);
				const before = isRecord(result.before?.cells) ? result.before!.cells! : {};
				const after = isRecord(result.after?.cells) ? result.after!.cells! : {};
				for (const key of Object.keys(before)) {
					const previous = before[key] ?? null;
					const next = after[key] ?? null;
					if (cellValuesEqual(previous, next)) continue;
					cellsChanged += 1;
					updateSamples.push({
						row: handle,
						column: nameOf(key),
						before: sampleText(columnsById.get(key), previous),
						after: sampleText(columnsById.get(key), next)
					});
				}
				break;
			}
			case 'move':
				updatedRows.add(result.row_id);
				break;
		}
	}

	const inverseOps: TableRowOp[] = [];
	const seen = new Set<string>();
	for (const result of [...results].reverse()) {
		const firstForRow = !seen.has(result.row_id);
		seen.add(result.row_id);
		const guard = firstForRow ? { expected_version: result.version } : {};
		switch (result.op) {
			case 'insert':
			case 'restore':
				inverseOps.push({ op: 'delete', row_id: result.row_id, ...guard });
				break;
			case 'delete':
				inverseOps.push({ op: 'restore', row_id: result.row_id });
				break;
			case 'update': {
				const cells: Record<string, TableCellValue> = {};
				for (const [key, value] of Object.entries(result.before?.cells ?? {})) {
					cells[key] = value ?? null;
				}
				const cellMeta: Record<string, TableCellMeta | null> = {};
				for (const [key, value] of Object.entries(result.before?.cell_meta ?? {})) {
					cellMeta[key] = value ?? null;
				}
				inverseOps.push({
					op: 'update',
					row_id: result.row_id,
					cells,
					cell_meta: cellMeta,
					...guard
				});
				break;
			}
			case 'move': {
				const position = result.before?.position;
				inverseOps.push({
					op: 'move',
					row_id: result.row_id,
					...(typeof position === 'number' ? { position } : {})
				});
				break;
			}
		}
	}

	const columnsChanged = changedColumnNames(previousSchema, schema);
	const inverseSchema =
		previousSchema && schemaShapeChanged(previousSchema, schema) ? previousSchema : null;

	return {
		kind: 'table_change',
		document_id: document.id,
		project_id: document.project_id,
		title: document.title,
		revision: args.apply.revision,
		rows_added: rowsAdded,
		rows_updated: updatedRows.size,
		rows_deleted: rowsDeleted,
		cells_changed: cellsChanged,
		columns_changed: columnsChanged,
		sample: [...updateSamples, ...insertSamples, ...deleteSamples].slice(0, MAX_SAMPLES),
		inverse_ops: inverseOps,
		inverse_schema: inverseSchema,
		applied_revision: args.apply.revision
	};
}

/**
 * Dry run of row ops against a loaded table: what would change, without
 * writing. Unknown rows, unknown column ids, and stale expected_versions
 * become `errors`. Pass a table loaded with includeDeleted to check restores.
 */
export function previewTableRowChanges(
	table: LoadedTable,
	ops: TableRowOp[]
): {
	rows_added: number;
	rows_updated: number;
	rows_deleted: number;
	cells_changed: number;
	sample: TableChangeSample[];
	errors: string[];
} {
	const schema = table.schema;
	const columnsById = new Map(schema.columns.map((column) => [column.id, column]));
	const live = new Map<string, TableRow>();
	const deleted = new Map<string, TableRow>();
	for (const row of Array.isArray(table.rows) ? table.rows : []) {
		const copy: TableRow = { ...row, cells: { ...row.cells } };
		(row.deleted_at ? deleted : live).set(row.id, copy);
	}
	const errors: string[] = [];
	const samples: TableChangeSample[] = [];
	const updatedRows = new Set<string>();
	let rowsAdded = 0;
	let rowsDeleted = 0;
	let cellsChanged = 0;
	let newRowCounter = 0;

	const checkColumns = (cells: unknown, label: string): Record<string, TableCellValue> => {
		if (cells === undefined) return {};
		if (!isRecord(cells)) {
			errors.push(`${label}: cells must be an object keyed by column id.`);
			return {};
		}
		const valid: Record<string, TableCellValue> = {};
		for (const [key, value] of Object.entries(cells)) {
			if (!columnsById.has(key)) {
				errors.push(`${label}: unknown column id "${key}".`);
				continue;
			}
			valid[key] = (value ?? null) as TableCellValue;
		}
		return valid;
	};

	(Array.isArray(ops) ? ops : []).forEach((op, index) => {
		if (!isRecord(op)) {
			errors.push(`Op ${index + 1} is not an object.`);
			return;
		}
		switch (op.op) {
			case 'insert': {
				newRowCounter += 1;
				const label = `new row ${newRowCounter}`;
				const cells = checkColumns(op.cells, label);
				rowsAdded += 1;
				for (const [key, value] of Object.entries(cells)) {
					if (isEmptyCellValue(value)) continue;
					cellsChanged += 1;
					samples.push({
						row: label,
						column: columnsById.get(key)!.name,
						before: '',
						after: sampleText(columnsById.get(key), value)
					});
				}
				break;
			}
			case 'update': {
				const row = live.get(String(op.row_id));
				if (!row) {
					errors.push(
						`Row ${String(op.row_id)} was not found (it may have been deleted).`
					);
					return;
				}
				const handle = rowHandle(row.row_number);
				if (
					typeof op.expected_version === 'number' &&
					op.expected_version !== row.version
				) {
					errors.push(`Row ${handle} changed since it was read; read it again.`);
				}
				const cells = checkColumns(op.cells, handle);
				let touched = false;
				for (const [key, value] of Object.entries(cells)) {
					const previous = row.cells[key] ?? null;
					if (cellValuesEqual(previous, value)) continue;
					touched = true;
					cellsChanged += 1;
					samples.push({
						row: handle,
						column: columnsById.get(key)!.name,
						before: sampleText(columnsById.get(key), previous),
						after: sampleText(columnsById.get(key), value)
					});
					if (value === null) delete row.cells[key];
					else row.cells[key] = value;
				}
				if (touched || isRecord(op.cell_meta)) {
					updatedRows.add(row.id);
					row.version += 1;
				}
				break;
			}
			case 'delete': {
				const row = live.get(String(op.row_id));
				if (!row) {
					errors.push(
						`Row ${String(op.row_id)} was not found (it may already be deleted).`
					);
					return;
				}
				const handle = rowHandle(row.row_number);
				if (
					typeof op.expected_version === 'number' &&
					op.expected_version !== row.version
				) {
					errors.push(`Row ${handle} changed since it was read; read it again.`);
				}
				rowsDeleted += 1;
				live.delete(row.id);
				deleted.set(row.id, row);
				const title = primaryColumn(schema);
				if (title) {
					samples.push({
						row: handle,
						column: title.name,
						before: sampleText(title, row.cells[title.id]),
						after: ''
					});
				}
				break;
			}
			case 'restore': {
				const row = deleted.get(String(op.row_id));
				if (!row) {
					errors.push(`Row ${String(op.row_id)} is not a deleted row of this table.`);
					return;
				}
				deleted.delete(row.id);
				live.set(row.id, row);
				rowsAdded += 1;
				break;
			}
			case 'move': {
				const row = live.get(String(op.row_id));
				if (!row) {
					errors.push(`Row ${String(op.row_id)} was not found.`);
					return;
				}
				if (op.after_row_id && !live.has(String(op.after_row_id))) {
					errors.push(`Row ${String(op.after_row_id)} (after_row_id) was not found.`);
				}
				updatedRows.add(row.id);
				break;
			}
			default:
				errors.push(
					`Op ${index + 1} has an unknown kind "${String((op as { op?: unknown }).op)}".`
				);
		}
	});

	const updateSamples = samples.filter((sample) => sample.before !== '' && sample.after !== '');
	const rest = samples.filter((sample) => !updateSamples.includes(sample));
	return {
		rows_added: rowsAdded,
		rows_updated: updatedRows.size,
		rows_deleted: rowsDeleted,
		cells_changed: cellsChanged,
		sample: [...updateSamples, ...rest].slice(0, MAX_SAMPLES),
		errors
	};
}
