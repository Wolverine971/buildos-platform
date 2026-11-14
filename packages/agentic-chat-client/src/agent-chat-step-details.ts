// packages/agentic-chat-client/src/agent-chat-step-details.ts
//
// "Where it went" for one chat step (tasker 155): what it read or changed, as links that open
// in a new tab, with before → after for updates and the words of the user's message the change
// came from. Pure: built from the step's activity, the same way live and after a reload. Every
// field comes from structured tool data (arguments, receipts, affected entities), never from
// reading the reply text.

import {
	ONTO_TASK_PRIORITY_LABELS,
	buildEntityHref,
	type RecordLinkKind
} from '@buildos/shared-types';
import type { ActivityEntry } from './agent-chat.types';

export type StepEntity = {
	kind: RecordLinkKind;
	id: string;
	title: string;
	projectId: string | null;
	href: string | null;
};

export type StepAction = 'created' | 'updated' | 'archived' | 'deleted' | 'moved' | 'linked';

export type StepFieldChange = {
	field: string;
	label: string;
	before: string | null;
	after: string | null;
};

/** A changed record that has no page of its own (a calendar event, table rows). */
export type StepOtherRecord = { kind: string; id: string | null; title: string };

export type StepDetails = {
	/** What a write did; null for reads, and for a change still waiting on the person. */
	action: StepAction | null;
	/**
	 * The write is held for the person's choice (`requires_user_action`): nothing was saved.
	 * `intended` says what it would do; `action`, `changes` and `docChange` stay empty.
	 */
	held: boolean;
	intended: StepAction | null;
	/** Records this step read or changed, first few. */
	entities: StepEntity[];
	/** How many more records the step touched than `entities` shows. */
	more: number;
	/**
	 * Records whose text this read actually returned (a details read, a section read). A list
	 * or a search names records without opening them, so it opens none.
	 */
	opened: StepEntity[];
	/** Headings a section read returned. */
	openedSections: string[];
	/** Changed records with no page: counted in the receipt, shown as plain chips. */
	others: StepOtherRecord[];
	/** The badge word when it is more exact than the action ("Unlinked", "Delegated"). */
	actionLabel: string | null;
	/** Table writes: how many rows changed. */
	rowsChanged: number | null;
	changes: StepFieldChange[];
	/** Body edit size for document writes. */
	docChange: { added: number; removed: number } | null;
	/** The user's words this write came from (`from_quote`). */
	quote: string | null;
	durationMs: number | null;
};

const ENTITY_KINDS: readonly RecordLinkKind[] = [
	'project',
	'task',
	'document',
	'goal',
	'milestone',
	'plan',
	'risk'
];
const KIND_SET: ReadonlySet<string> = new Set(ENTITY_KINDS);
const PLURAL_KEYS: Record<string, RecordLinkKind> = {
	projects: 'project',
	tasks: 'task',
	documents: 'document',
	goals: 'goal',
	milestones: 'milestone',
	plans: 'plan',
	risks: 'risk'
};
const MAX_ENTITIES = 4;

const FIELD_LABELS: Record<string, string> = {
	title: 'Title',
	name: 'Name',
	state_key: 'Status',
	priority: 'Priority',
	start_at: 'Start',
	due_at: 'Due',
	target_date: 'Target',
	end_at: 'End',
	description: 'Description',
	archived_at: 'Archived',
	project: 'Project'
};
const DATE_FIELDS = new Set(['start_at', 'due_at', 'target_date', 'end_at', 'archived_at']);
const OPERATIONS: Record<string, StepAction> = {
	created: 'created',
	updated: 'updated',
	deleted: 'deleted',
	moved: 'moved',
	linked: 'linked',
	// Changes with no badge colour of their own; `actionLabel` carries the exact word.
	unlinked: 'updated',
	mentioned: 'updated',
	delegated: 'updated'
};
/** The exact word for operations that share another action's colour. */
const OPERATION_LABELS: Record<string, string> = {
	unlinked: 'Unlinked',
	mentioned: 'Mentioned',
	delegated: 'Delegated'
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): string | null =>
	typeof value === 'string' && value.trim() ? value.trim() : null;

function entityFrom(
	kind: RecordLinkKind,
	raw: unknown,
	fallbackProjectId: string | null
): StepEntity | null {
	if (!isRecord(raw)) return null;
	const id = text(raw.id) ?? text(raw[`${kind}_id`]);
	const title = text(raw.title) ?? text(raw.name) ?? text(raw.label);
	if (!id || !title) return null;
	const projectId =
		kind === 'project'
			? id
			: (text(raw.project_id) ?? text(raw.projectId) ?? fallbackProjectId);
	return { kind, id, title, projectId, href: buildEntityHref(kind, id, projectId) };
}

/** Records named in a read's result: `task: {...}`, `tasks: [...]` and the like. */
function entitiesFromResult(result: unknown, fallbackProjectId: string | null): StepEntity[] {
	if (!isRecord(result)) return [];
	const out: StepEntity[] = [];
	const projectId = text(result.project_id) ?? fallbackProjectId;
	for (const [key, value] of Object.entries(result)) {
		const single = KIND_SET.has(key) ? (key as RecordLinkKind) : null;
		const plural = PLURAL_KEYS[key] ?? null;
		if (single) {
			const entity = entityFrom(single, value, projectId);
			if (entity) out.push(entity);
		} else if (plural && Array.isArray(value)) {
			for (const item of value) {
				const entity = entityFrom(plural, item, projectId);
				if (entity) out.push(entity);
			}
		}
	}
	return out;
}

function entitiesFromAffected(value: unknown): StepEntity[] {
	if (!Array.isArray(value)) return [];
	const out: StepEntity[] = [];
	for (const raw of value) {
		if (!isRecord(raw)) continue;
		const kind = text(raw.kind);
		if (!kind || !KIND_SET.has(kind)) continue;
		const entity = entityFrom(kind as RecordLinkKind, raw, null);
		if (entity) out.push(entity);
	}
	return out;
}

/** Affected records of kinds with no page (calendar events, table rows, links). */
function othersFromAffected(value: unknown): StepOtherRecord[] {
	if (!Array.isArray(value)) return [];
	const out: StepOtherRecord[] = [];
	for (const raw of value) {
		if (!isRecord(raw)) continue;
		const kind = text(raw.kind);
		if (!kind || KIND_SET.has(kind)) continue;
		const title =
			text(raw.title) ?? text(raw.name) ?? text(raw.label) ?? kind.replace(/_/g, ' ');
		out.push({ kind, id: text(raw.id), title });
	}
	return out;
}

/**
 * Records whose text a read returned. Two structured shapes count: a result that is one record
 * (`task: {...}` with no lists beside it), and a section read (`document_id` plus `content`).
 * Lists, searches, overviews and an outline name records without opening them.
 */
function openedFromResult(
	result: unknown,
	fallbackProjectId: string | null
): { entities: StepEntity[]; sections: string[] } {
	if (!isRecord(result)) return { entities: [], sections: [] };
	const projectId = text(result.project_id) ?? fallbackProjectId;
	const documentId = text(result.document_id);
	if (documentId && typeof result.content === 'string' && result.content.trim()) {
		const title = text(result.title) ?? 'Document';
		const sections = Array.isArray(result.sections)
			? result.sections
					.map((section) => (isRecord(section) ? text(section.heading) : null))
					.filter((heading): heading is string => heading !== null)
			: [];
		const single = text(result.heading);
		return {
			entities: [
				{
					kind: 'document',
					id: documentId,
					title,
					projectId,
					href: buildEntityHref('document', documentId, projectId)
				}
			],
			sections: sections.length ? sections.slice(0, 8) : single ? [single] : []
		};
	}
	if (Object.keys(result).some((key) => PLURAL_KEYS[key] && Array.isArray(result[key])))
		return { entities: [], sections: [] };
	const singles: StepEntity[] = [];
	for (const kind of ENTITY_KINDS) {
		const entity = entityFrom(kind, result[kind], projectId);
		if (entity) singles.push(entity);
	}
	// A record usually comes with its project for context; the project isn't what was opened.
	const focal =
		singles.length > 1 ? singles.filter((entity) => entity.kind !== 'project') : singles;
	return { entities: focal.length === 1 ? focal : [], sections: [] };
}

const hasAwaitFlag = (value: unknown, depth = 0): boolean =>
	isRecord(value) &&
	(value.requires_user_action === true || (depth < 2 && hasAwaitFlag(value.result, depth + 1)));

/**
 * The step is a change held for the person's choice: the worker's structured
 * `requires_user_action` flag, live (`displayStatus`) or restored (`line.tone`).
 */
export function stepIsHeld(activity: ActivityEntry): boolean {
	const metadata = activity.metadata ?? {};
	return (
		metadata.requiresUserAction === true ||
		metadata.displayStatus === 'awaiting_user' ||
		(isRecord(metadata.line) && metadata.line.tone === 'awaiting') ||
		hasAwaitFlag(metadata.result) ||
		hasAwaitFlag(metadata.response)
	);
}

function unique(entities: StepEntity[]): StepEntity[] {
	const seen = new Set<string>();
	return entities.filter((entity) => {
		const key = `${entity.kind}:${entity.id}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
// Dates saved as midnight UTC are whole days ("due Nov 9"), not 7 PM the night before.
const MIDNIGHT_UTC = /^\d{4}-\d{2}-\d{2}T00:00(?::00(?:\.0+)?)?(?:Z|[+-]00:?00)$/;

/** "Nov 9", or "Nov 9, 2027" outside this year; times only when one was set. */
export function formatChangeDate(value: string, now = new Date(), timeZone?: string): string {
	const dateOnly = DATE_ONLY.test(value) || MIDNIGHT_UTC.test(value);
	const date = new Date(dateOnly ? `${value.slice(0, 10)}T12:00:00Z` : value);
	if (Number.isNaN(date.getTime())) return value;
	const zone = dateOnly ? 'UTC' : timeZone;
	const sameYear =
		date.toLocaleDateString('en-US', { year: 'numeric', timeZone: zone }) ===
		now.toLocaleDateString('en-US', { year: 'numeric', timeZone: zone });
	const day = date.toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		...(sameYear ? {} : { year: 'numeric' }),
		timeZone: zone
	});
	if (dateOnly) return day;
	const time = date.toLocaleTimeString('en-US', {
		hour: 'numeric',
		minute: '2-digit',
		timeZone: zone
	});
	// Midnight usually means "a day", not a meeting time.
	return time === '12:00 AM' ? day : `${day}, ${time}`;
}

function formatValue(field: string, value: unknown, now: Date, timeZone?: string): string | null {
	if (value === null || value === undefined || value === '') return null;
	if (field === 'priority' && typeof value === 'number') {
		return (
			ONTO_TASK_PRIORITY_LABELS[value as keyof typeof ONTO_TASK_PRIORITY_LABELS] ??
			String(value)
		);
	}
	if (field === 'state_key' && typeof value === 'string') {
		const words = value.replace(/_/g, ' ');
		return words.charAt(0).toUpperCase() + words.slice(1);
	}
	if (DATE_FIELDS.has(field) && typeof value === 'string')
		return formatChangeDate(value, now, timeZone);
	return typeof value === 'string' ? value : String(value);
}

function fieldChanges(result: unknown, now: Date, timeZone?: string): StepFieldChange[] {
	if (!isRecord(result) || !Array.isArray(result.field_changes)) return [];
	const out: StepFieldChange[] = [];
	for (const raw of result.field_changes) {
		if (!isRecord(raw)) continue;
		const field = text(raw.field);
		if (!field) continue;
		// Archiving reads as the action, not a date row.
		if (field === 'archived_at') continue;
		out.push({
			field,
			label: FIELD_LABELS[field] ?? field,
			before: formatValue(field, raw.before, now, timeZone),
			after: formatValue(field, raw.after, now, timeZone)
		});
	}
	return out;
}

function archivedNow(result: unknown): boolean | null {
	if (!isRecord(result) || !Array.isArray(result.field_changes)) return null;
	const change = result.field_changes.find(
		(raw) => isRecord(raw) && raw.field === 'archived_at'
	) as Record<string, unknown> | undefined;
	if (!change) return null;
	return change.after !== null && change.after !== undefined;
}

function docChange(result: unknown): StepDetails['docChange'] {
	if (!isRecord(result) || !isRecord(result.document_change)) return null;
	const change = result.document_change;
	const added = typeof change.lines_added === 'number' ? change.lines_added : null;
	const removed = typeof change.lines_removed === 'number' ? change.lines_removed : null;
	return added === null || removed === null ? null : { added, removed };
}

/** Rows a table write changed (`rows_changed` on its affected document). */
function rowsChanged(value: unknown): number | null {
	if (!Array.isArray(value)) return null;
	let total: number | null = null;
	for (const raw of value) {
		if (isRecord(raw) && typeof raw.rows_changed === 'number' && raw.rows_changed >= 0)
			total = (total ?? 0) + raw.rows_changed;
	}
	return total;
}

export function buildStepDetails(
	activity: ActivityEntry,
	options: { projectId?: string | null; now?: Date; timeZone?: string } = {}
): StepDetails {
	const metadata = activity.metadata ?? {};
	const now = options.now ?? new Date();
	const result = metadata.result;
	const affected = entitiesFromAffected(metadata.affectedEntities);
	const firstOperation = Array.isArray(metadata.affectedEntities)
		? text((metadata.affectedEntities[0] as Record<string, unknown> | undefined)?.operation)
		: null;
	let intended: StepAction | null = firstOperation ? (OPERATIONS[firstOperation] ?? null) : null;
	const archived = archivedNow(result);
	if (intended === 'updated' && archived === true) intended = 'archived';
	// A held change saved nothing: no action, no before → after, nothing for the receipt.
	const held = stepIsHeld(activity);
	const action = held ? null : intended;
	let all = unique(
		affected.length ? affected : entitiesFromResult(result, options.projectId ?? null)
	);
	// A deleted record has no page left to open.
	if (action === 'deleted') all = all.map((entity) => ({ ...entity, href: null }));
	const opened =
		action || held || affected.length
			? { entities: [], sections: [] }
			: openedFromResult(result, options.projectId ?? null);
	const quote =
		text(metadata.sourceQuote) ??
		(isRecord(metadata.response) ? text(metadata.response.source_quote) : null);
	return {
		action,
		held,
		intended,
		entities: all.slice(0, MAX_ENTITIES),
		more: Math.max(0, all.length - MAX_ENTITIES),
		opened: opened.entities,
		openedSections: opened.sections,
		others: action ? othersFromAffected(metadata.affectedEntities) : [],
		actionLabel: action && firstOperation ? (OPERATION_LABELS[firstOperation] ?? null) : null,
		rowsChanged: action ? rowsChanged(metadata.affectedEntities) : null,
		changes: action ? fieldChanges(result, now, options.timeZone) : [],
		docChange: action ? docChange(result) : null,
		quote,
		durationMs: typeof metadata.durationMs === 'number' ? metadata.durationMs : null
	};
}

export type TurnReceipt = {
	created: number;
	updated: number;
	/** Archived and deleted records together (the count older hosts print as "archived"). */
	archived: number;
	/** The part of `archived` that was deleted outright. */
	deleted: number;
	/** Records whose text a step actually opened; lists and searches open none. */
	read: number;
};

/**
 * "3 updated · 2 created · 6 read": counted per record, not per step. A change counts by the
 * records the worker says it touched (`affected_entities`, including ones with no page, such
 * as calendar events). "Read" counts records a step opened, never the rows of a list. Pass
 * only steps that finished; held changes carry no action and count for nothing.
 */
export function buildTurnReceipt(details: readonly StepDetails[]): TurnReceipt {
	const keys = {
		created: new Set<string>(),
		updated: new Set<string>(),
		archived: new Set<string>(),
		deleted: new Set<string>(),
		read: new Set<string>()
	};
	for (const step of details) {
		if (!step.action) {
			if (!step.held)
				for (const entity of step.opened ?? [])
					keys.read.add(`${entity.kind}:${entity.id}`);
			continue;
		}
		const bucket =
			step.action === 'created'
				? keys.created
				: step.action === 'archived' || step.action === 'deleted'
					? keys.archived
					: keys.updated;
		const touched = [
			...step.entities.map((entity) => `${entity.kind}:${entity.id}`),
			...(step.others ?? []).map((other) => `${other.kind}:${other.id ?? other.title}`)
		];
		for (const key of touched) {
			bucket.add(key);
			if (step.action === 'deleted') keys.deleted.add(key);
		}
	}
	for (const changed of [keys.updated, keys.created, keys.archived])
		for (const key of changed) keys.read.delete(key);
	return {
		created: keys.created.size,
		updated: keys.updated.size,
		archived: keys.archived.size,
		deleted: keys.deleted.size,
		read: keys.read.size
	};
}
