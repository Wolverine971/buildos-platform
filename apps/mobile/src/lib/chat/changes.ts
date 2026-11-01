// apps/mobile/src/lib/chat/changes.ts
/**
 * What a turn changed: the things it created, the documents it edited, the tables it wrote.
 * Each travels inside a tool result as structured data — a `create_onto_*` result's entity
 * record, an `update_onto_document` result's `document_change`, a table write's
 * `table_change` — and the same readers run live (tool_result events) and when a chat is
 * reopened (stored tool executions), as on the website (apps/web/src/lib/components/agent/
 * agent-chat-tool-presenter.ts, document-change-cards.ts, table-change-cards.ts). Nothing here
 * reads tool or model text. Pure: no React Native or Expo imports, so vitest can load it.
 */
import type {
	ChatHistoryToolExecution,
	DocumentChangeHunk,
	DocumentChangeReceipt,
	DocumentRevertPatch,
	TableChangeReceipt,
	TableChangeSample
} from '@buildos/api-client';

export type CreatedEntityKind =
	| 'project'
	| 'task'
	| 'goal'
	| 'plan'
	| 'document'
	| 'milestone'
	| 'risk';

/** Something the agent made this conversation; a chip that opens it. */
export type CreatedEntity = {
	kind: CreatedEntityKind;
	id: string;
	name: string;
	/** The project it lives in (the id itself for a project). */
	projectId: string | null;
};

/** One card: every edit the turn made to one document, merged. */
export type DocumentChange = {
	/** `<document id>:<body hash the turn left behind>`. */
	id: string;
	documentId: string;
	projectId: string;
	title: string;
	linesAdded: number;
	linesRemoved: number;
	hunks: DocumentChangeHunk[];
	hunksTruncated: boolean;
	editCount: number;
	/** Body hash before the turn's first edit; Undo is idempotent against it. */
	beforeHash: string;
	afterHash: string;
	/** Inverse patches, newest edit first. Null when any edit was too large to carry one. */
	revertPatches: DocumentRevertPatch[] | null;
};

/** One card: every change the turn made to one table, merged. */
export type TableChange = {
	/** `<table id>:<revision the turn left behind>`. */
	id: string;
	documentId: string;
	projectId: string;
	title: string;
	rowsAdded: number;
	rowsUpdated: number;
	rowsDeleted: number;
	cellsChanged: number;
	columnsChanged: string[];
	sample: TableChangeSample[];
	changeCount: number;
	/** In applied order; Undo sends them all and the server reverts newest first. */
	receipts: TableChangeReceipt[];
};

export type TurnChanges = {
	created: CreatedEntity[];
	documents: DocumentChange[];
	tables: TableChange[];
};

/** Gathered while a turn runs; merged into cards when it ends. */
export type ChangeReceipts = {
	created: CreatedEntity[];
	documents: DocumentChangeReceipt[];
	tables: TableChangeReceipt[];
};

export const emptyReceipts = (): ChangeReceipts => ({ created: [], documents: [], tables: [] });

export function hasChanges(changes: TurnChanges): boolean {
	return changes.created.length + changes.documents.length + changes.tables.length > 0;
}

const CREATE_TOOL_KINDS: Record<string, CreatedEntityKind> = {
	create_onto_project: 'project',
	create_onto_task: 'task',
	create_onto_goal: 'goal',
	create_onto_plan: 'plan',
	create_onto_document: 'document',
	create_onto_milestone: 'milestone',
	create_onto_risk: 'risk',
	// A new table is a new document; its chip opens it like any document.
	create_onto_table: 'document'
};

const NAME_FIELDS = ['name', 'title', 'text', 'summary', 'label'] as const;

const PAYLOAD_KEYS = [
	'project',
	'task',
	'goal',
	'plan',
	'document',
	'milestone',
	'risk',
	'entity',
	'entity_id'
];

const UNTITLED_DOCUMENT = 'Untitled document';
const UNTITLED_TABLE = 'Untitled table';
const DOCUMENT_UNDO_LIMIT = 'This change is too large to undo from here.';

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function label(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

const count = (n: number) => Number.isFinite(n);

/** A tool's arguments as a record: the call's JSON string, or the stored record. */
export function parseToolArguments(value: unknown): Record<string, unknown> {
	if (isRecord(value)) return value;
	if (typeof value !== 'string' || !value) return {};
	try {
		const parsed: unknown = JSON.parse(value);
		return isRecord(parsed) ? parsed : {};
	} catch {
		return {};
	}
}

/**
 * The payload of a tool result: `result` is canonical, `data` a legacy alias; a bare record
 * that already holds an entity key is its own payload.
 */
function payloadOf(toolResult: unknown): Record<string, unknown> | null {
	if (!isRecord(toolResult)) return null;
	if (isRecord(toolResult.result)) return toolResult.result;
	if (isRecord(toolResult.data)) return toolResult.data;
	return PAYLOAD_KEYS.some((key) => key in toolResult) ? toolResult : null;
}

/** The entity a successful `create_onto_*` call made, or null for every other tool. */
export function extractCreatedEntity(
	toolName: string | null | undefined,
	args: unknown,
	toolResult: unknown
): CreatedEntity | null {
	const kind = toolName ? CREATE_TOOL_KINDS[toolName] : undefined;
	if (!kind) return null;
	const argRecord = parseToolArguments(args);
	const payload = payloadOf(toolResult);
	const nested = payload && isRecord(payload.result) ? payload.result : null;
	const record = [payload?.[kind], nested?.[kind], payload?.entity].find(isRecord) ?? null;

	const id =
		label(record?.id) ??
		label(record?.[`${kind}_id`]) ??
		label(payload?.entity_id) ??
		label(nested?.id);
	if (!id) return null;

	let name: string | null = null;
	for (const field of NAME_FIELDS) {
		name = record ? label(record[field]) : null;
		if (name) break;
	}
	name = name ?? label(argRecord.title) ?? label(argRecord.name) ?? 'Untitled';

	const projectId =
		kind === 'project'
			? id
			: (label(record?.project_id) ??
				label(argRecord.project_id) ??
				label(argRecord.projectId) ??
				null);

	return { kind, id, name, projectId };
}

function isDocumentChangeReceipt(value: unknown): value is DocumentChangeReceipt {
	return (
		isRecord(value) &&
		value.version === 1 &&
		typeof value.document_id === 'string' &&
		value.document_id.length > 0 &&
		typeof value.project_id === 'string' &&
		typeof value.before_hash === 'string' &&
		typeof value.after_hash === 'string' &&
		count(value.lines_added as number) &&
		count(value.lines_removed as number) &&
		Array.isArray(value.hunks)
	);
}

function isTableChangeReceipt(value: unknown): value is TableChangeReceipt {
	return (
		isRecord(value) &&
		value.kind === 'table_change' &&
		typeof value.document_id === 'string' &&
		value.document_id.length > 0 &&
		typeof value.project_id === 'string' &&
		count(value.rows_added as number) &&
		count(value.rows_updated as number) &&
		count(value.rows_deleted as number) &&
		count(value.cells_changed as number) &&
		Array.isArray(value.inverse_ops)
	);
}

/** Live results nest the receipt under `result`; stored ones may hold it at the top or under `data`. */
function receiptCandidates(toolResult: unknown): Record<string, unknown>[] {
	if (!isRecord(toolResult)) return [];
	const out: Record<string, unknown>[] = [toolResult];
	if (isRecord(toolResult.result)) {
		out.push(toolResult.result);
		if (isRecord(toolResult.result.result)) out.push(toolResult.result.result);
	}
	if (isRecord(toolResult.data)) out.push(toolResult.data);
	return out;
}

/** The change receipt of a successful document edit, or null (title-only updates carry none). */
export function extractDocumentChangeReceipt(toolResult: unknown): DocumentChangeReceipt | null {
	for (const candidate of receiptCandidates(toolResult)) {
		if (isDocumentChangeReceipt(candidate.document_change)) return candidate.document_change;
	}
	return null;
}

/** The change receipt of a successful table write, or null. */
export function extractTableChangeReceipt(toolResult: unknown): TableChangeReceipt | null {
	for (const candidate of receiptCandidates(toolResult)) {
		if (isTableChangeReceipt(candidate.table_change)) return candidate.table_change;
	}
	return null;
}

/**
 * Merge a turn's receipts into one card per document, in first-edit order: stats summed,
 * hunks in edit order, Undo chained newest edit first so one request restores the text from
 * before the turn's first edit.
 */
export function buildDocumentChanges(receipts: DocumentChangeReceipt[]): DocumentChange[] {
	const groups = new Map<string, DocumentChangeReceipt[]>();
	for (const receipt of receipts) {
		const group = groups.get(receipt.document_id) ?? [];
		// A replayed tool result must not double the stats.
		if (group.some((seen) => seen.after_hash === receipt.after_hash)) continue;
		group.push(receipt);
		groups.set(receipt.document_id, group);
	}
	return [...groups.values()].map((group) => {
		const first = group[0]!;
		const last = group[group.length - 1]!;
		const title =
			[...group]
				.reverse()
				.map((receipt) => label(receipt.title))
				.find((value): value is string => Boolean(value)) ?? UNTITLED_DOCUMENT;
		const revertPatches = group.every((receipt) => receipt.revert_patch)
			? group.map((receipt) => receipt.revert_patch as DocumentRevertPatch).reverse()
			: null;
		return {
			id: `${first.document_id}:${last.after_hash}`,
			documentId: first.document_id,
			projectId: first.project_id,
			title,
			linesAdded: group.reduce((sum, receipt) => sum + receipt.lines_added, 0),
			linesRemoved: group.reduce((sum, receipt) => sum + receipt.lines_removed, 0),
			hunks: group.flatMap((receipt) => receipt.hunks),
			hunksTruncated: group.some((receipt) => receipt.hunks_truncated),
			editCount: group.length,
			beforeHash: first.before_hash,
			afterHash: last.after_hash,
			revertPatches
		};
	});
}

/** True when the receipt changed nothing a person would see (an empty batch). */
function isEmptyTableChange(receipt: TableChangeReceipt): boolean {
	return (
		receipt.rows_added === 0 &&
		receipt.rows_updated === 0 &&
		receipt.rows_deleted === 0 &&
		receipt.cells_changed === 0 &&
		(receipt.columns_changed?.length ?? 0) === 0
	);
}

const SAMPLE_LIMIT = 12;

/** Merge a turn's receipts into one card per table, in first-change order. */
export function buildTableChanges(receipts: TableChangeReceipt[]): TableChange[] {
	const groups = new Map<string, TableChangeReceipt[]>();
	for (const receipt of receipts) {
		if (isEmptyTableChange(receipt)) continue;
		const group = groups.get(receipt.document_id) ?? [];
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
				.map((receipt) => label(receipt.title))
				.find((value): value is string => Boolean(value)) ?? UNTITLED_TABLE;
		const columns = new Set<string>();
		for (const receipt of group)
			for (const column of receipt.columns_changed ?? []) columns.add(column);
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
			sample: group.flatMap((receipt) => receipt.sample ?? []).slice(0, SAMPLE_LIMIT),
			changeCount: group.length,
			receipts: group
		};
	});
}

export function mergeChanges(receipts: ChangeReceipts): TurnChanges {
	return {
		created: receipts.created,
		documents: buildDocumentChanges(receipts.documents),
		tables: buildTableChanges(receipts.tables)
	};
}

/**
 * Read one successful tool result into a turn's receipts. `seenCreated` holds the ids of
 * entities already shown this conversation, so a replayed result does not add a second chip.
 */
export function collectReceipts(
	receipts: ChangeReceipts,
	toolName: string | null | undefined,
	args: unknown,
	toolResult: unknown,
	seenCreated: Set<string>
): void {
	const created = extractCreatedEntity(toolName, args, toolResult);
	if (created && !seenCreated.has(created.id)) {
		seenCreated.add(created.id);
		receipts.created.push(created);
	}
	const document = extractDocumentChangeReceipt(toolResult);
	if (document) receipts.documents.push(document);
	const table = extractTableChangeReceipt(toolResult);
	if (table) receipts.tables.push(table);
}

const bySequence = (a: ChatHistoryToolExecution, b: ChatHistoryToolExecution) =>
	(a.sequence_index ?? 0) - (b.sequence_index ?? 0) ||
	Date.parse(a.created_at ?? '') - Date.parse(b.created_at ?? '');

/** Everything a stored turn changed, from its tool executions in the order they ran. */
export function changesFromExecutions(
	executions: ChatHistoryToolExecution[],
	seenCreated: Set<string> = new Set()
): TurnChanges {
	const receipts = emptyReceipts();
	for (const execution of [...executions].sort(bySequence)) {
		if (!execution.success) continue;
		collectReceipts(
			receipts,
			execution.tool_name,
			execution.arguments,
			execution.result,
			seenCreated
		);
	}
	return mergeChanges(receipts);
}

const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;

/** "+3 rows · 7 cells · 1 deleted · 1 column", from the counts alone. */
export function describeTableChange(change: {
	rowsAdded: number;
	rowsUpdated: number;
	rowsDeleted: number;
	cellsChanged: number;
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

/** The subline under a document card's title. */
export function describeDocumentChange(change: DocumentChange): string {
	return change.editCount > 1 ? `${change.editCount} edits` : 'Updated';
}

/** Plain words for the document Undo route's 409 codes. */
export function describeDocumentUndoConflict(code: string | undefined): string {
	switch (code) {
		case 'WRITE_RACE':
			return 'The document was being saved at the same moment. Try Undo again.';
		case 'MANAGED_REGION_BOUNDARY':
			return 'This edit now overlaps a section BuildOS manages, so it can’t be undone from here.';
		default:
			return 'The text has changed since, so Undo can’t apply cleanly. Restore it from version history on the website.';
	}
}

/** Plain words for the table Undo route's 409 codes. */
export function describeTableUndoConflict(code: string | undefined): string {
	switch (code) {
		case 'ROW_NOT_FOUND':
			return 'Some of these rows no longer exist, so Undo can’t restore them.';
		default:
			return 'The table has changed since, so Undo can’t apply cleanly. Check it and fix it by hand.';
	}
}

export const DOCUMENT_UNDO_TOO_LARGE = DOCUMENT_UNDO_LIMIT;

export const ENTITY_KIND_LABEL: Record<CreatedEntityKind, string> = {
	project: 'Project',
	task: 'Task',
	goal: 'Goal',
	plan: 'Plan',
	document: 'Document',
	milestone: 'Milestone',
	risk: 'Risk'
};

/** "2 tasks · 1 document": what else the turn saved into a project it created. */
export function describeSavedInProject(related: CreatedEntity[]): string | null {
	const order: CreatedEntityKind[] = ['goal', 'task', 'document', 'plan', 'milestone', 'risk'];
	const parts = order.flatMap((kind) => {
		const n = related.filter((entity) => entity.kind === kind).length;
		return n ? [plural(n, kind)] : [];
	});
	return parts.length ? parts.join(' · ') : null;
}

/**
 * The website page for an entity the phone has no screen for (goals, plans, milestones,
 * risks): the project page's entity editor. Null when the project is unknown.
 */
export function entityWebPath(entity: CreatedEntity): string | null {
	if (entity.kind === 'project') return `/projects/${encodeURIComponent(entity.id)}`;
	if (!entity.projectId) return null;
	const project = encodeURIComponent(entity.projectId);
	if (entity.kind === 'document')
		return `/projects/${project}?doc=${encodeURIComponent(entity.id)}`;
	return `/projects/${project}?entity=${entity.kind}&entity_id=${encodeURIComponent(entity.id)}`;
}
