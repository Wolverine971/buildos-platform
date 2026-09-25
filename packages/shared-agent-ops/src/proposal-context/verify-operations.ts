// packages/shared-agent-ops/src/proposal-context/verify-operations.ts
import { createHash } from 'node:crypto';
import type { LoopOperation, ProjectSuggestionPreview } from '@buildos/shared-types';
import { buildProjectLoopParentMap } from '../project-loops';
import {
	formatDocumentEditFailures,
	resolveDocumentEdits,
	type DocumentTextEditV1
} from '../ontology/document-edits';
import {
	formatLoopOperationValue,
	humanizeLoopOperationKey,
	type DecodedLoopOperation,
	type DecodedLoopOperationFieldChange
} from './decode-operations';

type AnySupabase = any;

type ResolvedEntityKind = 'document' | 'task' | 'goal' | 'milestone';

type ResolvedEntity = {
	id: string;
	project_id: string;
	title: string;
	state_key: string | null;
	deleted_at: string | null;
	archived_at: string | null;
	due_at: string | null;
	start_at: string | null;
	target_date: string | null;
	/** Raw document body, loaded only when an operation carries text edits. */
	content?: string | null;
};

export type ProjectSuggestionIntegrityCode =
	| 'INVALID_PROJECT'
	| 'INVALID_OPERATION'
	| 'UNSUPPORTED_OPERATION'
	| 'OPERATION_PROJECT_MISMATCH'
	| 'ENTITY_NOT_FOUND'
	| 'ENTITY_PROJECT_MISMATCH'
	| 'ENTITY_INACTIVE'
	| 'INVALID_DESTINATION'
	| 'NO_OP_OPERATION'
	| 'MODEL_ENTITY_MISMATCH'
	| 'EXPECTED_STATE_CHANGED'
	| 'DOCUMENT_EDIT_UNRESOLVED'
	| 'RESOLUTION_FAILED';

export type ProjectSuggestionIntegrityDiagnostic = {
	code: ProjectSuggestionIntegrityCode;
	message: string;
	operation_index?: number;
	tool?: string;
	entity_kind?: ResolvedEntityKind;
	entity_id?: string;
	expected_project_id?: string;
	actual_project_id?: string;
	resolved_entity_title?: string;
	resolved_destination_title?: string;
};

export type VerifiedProjectSuggestionChangeSummary = {
	headline: string;
	operation_count: number;
	operations: Array<DecodedLoopOperation & { key: string }>;
	structural_fingerprint: string;
	verified_at: string;
};

export type ProjectSuggestionIntegrityResult =
	| { ok: true; summary: VerifiedProjectSuggestionChangeSummary }
	| { ok: false; diagnostic: ProjectSuggestionIntegrityDiagnostic };

export type ProjectSuggestionIntegrityInput = {
	projectId: string;
	operations: LoopOperation[];
	title?: string | null;
	preview?: ProjectSuggestionPreview | Record<string, unknown> | null;
	checkModelAlignment?: boolean;
	expectedStructuralFingerprint?: string | null;
	/**
	 * IANA timezone used only to detect a civil-date (YYYY-MM-DD) proposal that
	 * already matches a stored timestamp. Without it such a proposal is never
	 * treated as a no-op (fail open to the user, never to a hidden write).
	 */
	timezone?: string | null;
};

type ScalarField = 'state_key' | 'due_at' | 'start_at' | 'target_date';

type UpdateToolSpec = {
	entityKind: ResolvedEntityKind;
	idArg: 'task_id' | 'document_id' | 'goal_id' | 'milestone_id';
	/** Title arguments tolerated only as an exact echo of the current title. */
	titleArgs: readonly string[];
	/** Scalar fields decoded with before and after values. */
	scalarFields: readonly ScalarField[];
	stateKeys: readonly string[];
	/**
	 * Every argument the ChatToolExecutor turns into a write (or a write side
	 * effect) for this tool, besides the entity id and project_id. An argument in
	 * this list that the verifier cannot decode fails closed: approval must never
	 * execute a change the user was not shown.
	 */
	mutatingArgs: readonly string[];
};

const UPDATE_TOOL_SPECS: Record<string, UpdateToolSpec> = {
	update_onto_task: {
		entityKind: 'task',
		idArg: 'task_id',
		titleArgs: ['title'],
		scalarFields: ['state_key', 'due_at', 'start_at'],
		stateKeys: ['todo', 'in_progress', 'blocked', 'done'],
		mutatingArgs: [
			'title',
			'description',
			'type_key',
			'state_key',
			'priority',
			'goal_id',
			'supporting_milestone_id',
			'start_at',
			'due_at',
			'props',
			'assignee_actor_ids',
			'assignee_handles',
			'calendar_sync'
		]
	},
	update_onto_document: {
		entityKind: 'document',
		idArg: 'document_id',
		titleArgs: ['title', 'name'],
		scalarFields: [],
		stateKeys: [],
		mutatingArgs: [
			'title',
			'name',
			'description',
			'summary',
			'type_key',
			'type',
			'state_key',
			'content',
			'body_markdown',
			'body',
			'text',
			'markdown',
			'props',
			'document',
			'updates',
			'document_update',
			// Decoded against the live body below; never replayed unshown.
			'edits',
			'section_edits'
		]
	},
	update_onto_goal: {
		entityKind: 'goal',
		idArg: 'goal_id',
		titleArgs: ['name'],
		scalarFields: ['state_key', 'target_date'],
		stateKeys: ['draft', 'active', 'achieved', 'abandoned'],
		mutatingArgs: [
			'name',
			'description',
			'type_key',
			'state_key',
			'priority',
			'target_date',
			'measurement_criteria',
			'props'
		]
	},
	update_onto_milestone: {
		entityKind: 'milestone',
		idArg: 'milestone_id',
		titleArgs: ['title'],
		scalarFields: ['state_key', 'due_at'],
		stateKeys: ['pending', 'in_progress', 'completed', 'missed'],
		mutatingArgs: ['title', 'due_at', 'state_key', 'description', 'props']
	}
};

const SUPPORTED_TOOLS = new Set(['move_document_in_tree', ...Object.keys(UPDATE_TOOL_SPECS)]);

const SCALAR_FIELD_LABELS: Record<ScalarField, string> = {
	state_key: 'Status',
	due_at: 'Due date',
	start_at: 'Start date',
	target_date: 'Target date'
};

const STATE_LABELS: Record<string, string> = {
	todo: 'To do',
	in_progress: 'In progress',
	blocked: 'Blocked',
	done: 'Done',
	draft: 'Draft',
	active: 'Active',
	achieved: 'Achieved',
	abandoned: 'Abandoned',
	pending: 'Pending',
	completed: 'Completed',
	missed: 'Missed'
};

const CIVIL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const NAME_STOP_WORDS = new Set([
	'a',
	'an',
	'and',
	'as',
	'at',
	'by',
	'for',
	'from',
	'in',
	'into',
	'of',
	'on',
	'or',
	'the',
	'to',
	'under',
	'with'
]);

function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function asString(value: unknown): string | null {
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function previewText(preview: ProjectSuggestionIntegrityInput['preview']): string {
	const record = asRecord(preview);
	if (!record) return '';
	return [
		record.summary,
		record.impact,
		...(Array.isArray(record.before) ? record.before : []),
		...(Array.isArray(record.after) ? record.after : [])
	]
		.filter((value): value is string => typeof value === 'string')
		.join(' ');
}

function normalizedTokens(value: string): string[] {
	return value
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim()
		.split(/\s+/)
		.filter((token) => token.length >= 2 && !NAME_STOP_WORDS.has(token));
}

/**
 * Entity titles often carry a descriptive suffix while model labels use the
 * concise prefix (for example, "Instagram Saves Engine — Architecture"). A
 * normalized containment check handles that case; token coverage is the
 * fallback for punctuation and small wording differences.
 */
export function projectSuggestionTextNamesEntity(text: string, entityTitle: string): boolean {
	const normalizedText = normalizedTokens(text).join(' ');
	const normalizedTitle = normalizedTokens(entityTitle).join(' ');
	if (!normalizedText || !normalizedTitle) return false;
	if (normalizedText.includes(normalizedTitle) || normalizedTitle.includes(normalizedText)) {
		return true;
	}

	const textTokens = new Set(normalizedTokens(text));
	const titleTokens = normalizedTokens(entityTitle);
	const overlap = titleTokens.filter((token) => textTokens.has(token)).length;
	const required = Math.min(3, Math.max(2, Math.ceil(titleTokens.length * 0.5)));
	return overlap >= required;
}

function readTreeState(docStructure: unknown): {
	parentById: Map<string, string | null>;
	positionById: Map<string, number>;
} {
	const parentById = buildProjectLoopParentMap(docStructure);
	const positionById = new Map<string, number>();
	const root =
		docStructure && typeof docStructure === 'object' && 'root' in (docStructure as object)
			? (docStructure as { root?: unknown }).root
			: docStructure;
	const visit = (nodes: unknown) => {
		if (!Array.isArray(nodes)) return;
		for (let index = 0; index < nodes.length; index += 1) {
			const node = asRecord(nodes[index]);
			const id = asString(node?.id);
			if (!id) continue;
			positionById.set(id, index);
			visit(node?.children);
		}
	};
	visit(root);
	return { parentById, positionById };
}

function isInactive(entity: ResolvedEntity): boolean {
	return (
		Boolean(entity.deleted_at) || Boolean(entity.archived_at) || entity.state_key === 'archived'
	);
}

function entityDiagnostic(params: {
	entity: ResolvedEntity | undefined;
	entityId: string;
	entityKind: ResolvedEntityKind;
	projectId: string;
	operationIndex: number;
	tool: string;
}): ProjectSuggestionIntegrityDiagnostic | null {
	if (!params.entity) {
		return {
			code: 'ENTITY_NOT_FOUND',
			message: `${params.entityKind} ${params.entityId} no longer exists`,
			operation_index: params.operationIndex,
			tool: params.tool,
			entity_kind: params.entityKind,
			entity_id: params.entityId,
			expected_project_id: params.projectId
		};
	}
	if (params.entity.project_id !== params.projectId) {
		return {
			code: 'ENTITY_PROJECT_MISMATCH',
			message: `${params.entityKind} ${params.entityId} belongs to another project`,
			operation_index: params.operationIndex,
			tool: params.tool,
			entity_kind: params.entityKind,
			entity_id: params.entityId,
			expected_project_id: params.projectId,
			actual_project_id: params.entity.project_id
		};
	}
	if (isInactive(params.entity)) {
		return {
			code: 'ENTITY_INACTIVE',
			message: `${params.entityKind} "${params.entity.title}" is archived or deleted`,
			operation_index: params.operationIndex,
			tool: params.tool,
			entity_kind: params.entityKind,
			entity_id: params.entityId,
			expected_project_id: params.projectId,
			actual_project_id: params.entity.project_id
		};
	}
	return null;
}

function modelTextForOperation(
	operation: LoopOperation,
	input: ProjectSuggestionIntegrityInput
): string {
	return [operation.label, input.title, previewText(input.preview)]
		.filter((value): value is string => typeof value === 'string')
		.join(' ');
}

function targetTextForOperation(
	operation: LoopOperation,
	input: ProjectSuggestionIntegrityInput
): string {
	const args = asRecord(operation.args);
	const operationSpecificText = [operation.label, args?.title, args?.name]
		.filter((value): value is string => typeof value === 'string')
		.join(' ');
	// A multi-operation proposal must identify each operation's own target. Using
	// the aggregate preview here would let swapped IDs pass whenever both entity
	// names happened to appear somewhere in the proposal.
	return input.operations.length > 1
		? operationSpecificText
		: modelTextForOperation(operation, input);
}

function updateChanges(args: Record<string, unknown>): DecodedLoopOperationFieldChange[] {
	const props = asRecord(args.props);
	if (!props) return [];
	return Object.entries(props).map(([key, value]) => ({
		label: humanizeLoopOperationKey(key),
		value: formatLoopOperationValue(value)
	}));
}

function structuralFingerprint(parts: unknown[]): string {
	const canonicalize = (value: unknown): unknown => {
		if (Array.isArray(value)) return value.map(canonicalize);
		const record = asRecord(value);
		if (!record) return value;
		return Object.fromEntries(
			Object.keys(record)
				.sort()
				.map((key) => [key, canonicalize(record[key])])
		);
	};
	return createHash('sha256')
		.update(JSON.stringify(canonicalize(parts)))
		.digest('hex');
}

function listWithAnd(values: string[]): string {
	if (values.length <= 1) return values[0] ?? '';
	if (values.length === 2) return `${values[0]} and ${values[1]}`;
	return `${values.slice(0, -1).join(', ')}, and ${values.at(-1)}`;
}

function verifiedHeadline(operations: DecodedLoopOperation[]): string {
	if (operations.length === 1) return operations[0]?.summary ?? 'Apply 1 verified change.';
	const moves = operations.filter((operation) => operation.action === 'move');
	const destinations = new Set(
		moves.map(
			(operation) =>
				operation.changes.find((change) => change.label === 'New location')?.value
		)
	);
	if (moves.length === operations.length && destinations.size === 1) {
		const destination = [...destinations][0] ?? 'the verified destination';
		return `Move ${listWithAnd(moves.map((operation) => `"${operation.target}"`))} under "${destination}".`;
	}
	return `Apply ${operations.length} verified changes.`;
}

function normalizeEntityRows(rows: unknown): Map<string, ResolvedEntity> {
	const byId = new Map<string, ResolvedEntity>();
	for (const value of Array.isArray(rows) ? rows : []) {
		const row = asRecord(value);
		const id = asString(row?.id);
		const projectId = asString(row?.project_id);
		const title = asString(row?.title) ?? asString(row?.name);
		if (!id || !projectId || !title) continue;
		byId.set(id, {
			id,
			project_id: projectId,
			title,
			state_key: asString(row?.state_key),
			deleted_at: asString(row?.deleted_at),
			archived_at: asString(row?.archived_at),
			due_at: asString(row?.due_at),
			start_at: asString(row?.start_at),
			target_date: asString(row?.target_date),
			// Untrimmed: edit anchors are exact offsets into the stored body.
			...(typeof row?.content === 'string' ? { content: row.content } : {})
		});
	}
	return byId;
}

function idsForOperations(operations: LoopOperation[]): {
	documentIds: Set<string>;
	taskIds: Set<string>;
	goalIds: Set<string>;
	milestoneIds: Set<string>;
} {
	const documentIds = new Set<string>();
	const taskIds = new Set<string>();
	const goalIds = new Set<string>();
	const milestoneIds = new Set<string>();
	for (const operation of operations) {
		const args = asRecord(operation.args) ?? {};
		const documentId = asString(args.document_id);
		const parentId = asString(args.new_parent_id);
		const taskId = asString(args.task_id);
		const conflictTaskId = asString(asRecord(args.props)?.loop_conflict_with_task_id);
		if (documentId) documentIds.add(documentId);
		if (parentId) documentIds.add(parentId);
		if (taskId) taskIds.add(taskId);
		if (conflictTaskId) taskIds.add(conflictTaskId);
		// goal_id is also a mutating task argument, so only the goal tool's own
		// target is resolved as a goal.
		if (operation.tool === 'update_onto_goal') {
			const goalId = asString(args.goal_id);
			if (goalId) goalIds.add(goalId);
		}
		if (operation.tool === 'update_onto_milestone') {
			const milestoneId = asString(args.milestone_id);
			if (milestoneId) milestoneIds.add(milestoneId);
		}
	}
	return { documentIds, taskIds, goalIds, milestoneIds };
}

function hasOwnArg(args: Record<string, unknown>, key: string): boolean {
	return Object.prototype.hasOwnProperty.call(args, key) && args[key] !== undefined;
}

/** Most text edits one review proposal may carry; each is shown to the user. */
export const REVIEW_DOCUMENT_EDITS_MAX = 10;
const REVIEW_EDIT_DISPLAY_CHARS = 600;

/**
 * Review proposals carry plain exact-text edits only: no replace_all, no section
 * edits, no whole-body writes. Anything else fails closed.
 */
function parseReviewDocumentEdits(value: unknown): DocumentTextEditV1[] | null {
	if (!Array.isArray(value) || value.length === 0 || value.length > REVIEW_DOCUMENT_EDITS_MAX)
		return null;
	const edits: DocumentTextEditV1[] = [];
	for (const raw of value) {
		const edit = asRecord(raw);
		if (!edit || Object.keys(edit).some((key) => key !== 'old_text' && key !== 'new_text'))
			return null;
		if (typeof edit.old_text !== 'string' || !edit.old_text.trim()) return null;
		if (typeof edit.new_text !== 'string') return null;
		if (edit.old_text === edit.new_text) return null;
		edits.push({ old_text: edit.old_text, new_text: edit.new_text });
	}
	return edits;
}

function editDisplayText(value: string): string {
	const text = value.trim();
	return text.length > REVIEW_EDIT_DISPLAY_CHARS
		? `${text.slice(0, REVIEW_EDIT_DISPLAY_CHARS - 1).trimEnd()}…`
		: text;
}

function operationsCarryEdits(operations: LoopOperation[]): boolean {
	return operations.some((operation) => hasOwnArg(asRecord(operation.args) ?? {}, 'edits'));
}

function isValidCivilDate(value: string): boolean {
	const match = CIVIL_DATE_PATTERN.exec(value);
	if (!match) return false;
	const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
	const date = new Date(Date.UTC(year, month - 1, day));
	return (
		date.getUTCFullYear() === year &&
		date.getUTCMonth() === month - 1 &&
		date.getUTCDate() === day
	);
}

function civilDateInZone(value: string, timeZone: string): string | null {
	const instant = Date.parse(value);
	if (!Number.isFinite(instant)) return null;
	try {
		const parts = new Intl.DateTimeFormat('en-US', {
			timeZone,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit'
		}).formatToParts(new Date(instant));
		const part = (type: string) => parts.find((entry) => entry.type === type)?.value;
		const year = part('year');
		const month = part('month');
		const day = part('day');
		return year && month && day ? `${year}-${month}-${day}` : null;
	} catch {
		return null;
	}
}

/** A proposed scalar value, validated; `invalid` when the executor must not see it. */
function readProposedScalar(
	field: ScalarField,
	value: unknown,
	spec: UpdateToolSpec
): { ok: true; value: string | null } | { ok: false } {
	if (field === 'state_key') {
		const state = asString(value);
		return state && spec.stateKeys.includes(state) ? { ok: true, value: state } : { ok: false };
	}
	if (value === null) return { ok: true, value: null };
	const text = asString(value);
	if (!text) return { ok: false };
	if (CIVIL_DATE_PATTERN.test(text)) {
		return isValidCivilDate(text) ? { ok: true, value: text } : { ok: false };
	}
	return /^\d{4}-\d{2}-\d{2}T/.test(text) && Number.isFinite(Date.parse(text))
		? { ok: true, value: text }
		: { ok: false };
}

function scalarValueIsCurrent(
	field: ScalarField,
	proposed: string | null,
	current: string | null,
	timezone: string | null | undefined
): boolean {
	if (field === 'state_key') return proposed === current;
	if (proposed === null || current === null) return proposed === current;
	const proposedCivil = CIVIL_DATE_PATTERN.test(proposed);
	const currentCivil = CIVIL_DATE_PATTERN.test(current);
	if (proposedCivil && currentCivil) return proposed === current;
	if (!proposedCivil && !currentCivil) return Date.parse(proposed) === Date.parse(current);
	if (proposedCivil && timezone) return civilDateInZone(current, timezone) === proposed;
	return false;
}

function formatScalarValue(field: ScalarField, value: string | null): string {
	if (field === 'state_key' && value)
		return STATE_LABELS[value] ?? humanizeLoopOperationKey(value);
	return formatLoopOperationValue(value);
}

function scalarSummary(
	entityKind: ResolvedEntityKind,
	title: string,
	scalars: Array<{ field: ScalarField; proposed: string | null }>
): string {
	if (scalars.length !== 1) return `Update ${entityKind} "${title}".`;
	const only = scalars[0]!;
	if (only.field === 'state_key') {
		return `Mark ${entityKind} "${title}" as ${formatScalarValue('state_key', only.proposed).toLowerCase()}.`;
	}
	const label = SCALAR_FIELD_LABELS[only.field].toLowerCase();
	return only.proposed === null
		? `Clear the ${label} of ${entityKind} "${title}".`
		: `Change the ${label} of ${entityKind} "${title}" to ${formatScalarValue(only.field, only.proposed)}.`;
}

function isDescendant(
	parentById: Map<string, string | null>,
	candidateId: string,
	ancestorId: string
): boolean {
	let current: string | null | undefined = candidateId;
	const visited = new Set<string>();
	while (current && !visited.has(current)) {
		if (current === ancestorId) return true;
		visited.add(current);
		current = parentById.get(current);
	}
	return false;
}

export async function verifyProjectSuggestionIntegrity(
	supabase: AnySupabase,
	input: ProjectSuggestionIntegrityInput
): Promise<ProjectSuggestionIntegrityResult> {
	if (!input.projectId || !Array.isArray(input.operations) || input.operations.length === 0) {
		return {
			ok: false,
			diagnostic: {
				code: 'INVALID_OPERATION',
				message: 'Executable proposals require a project and at least one operation'
			}
		};
	}

	try {
		for (let index = 0; index < input.operations.length; index += 1) {
			const operation = input.operations[index];
			if (!operation || !SUPPORTED_TOOLS.has(operation.tool)) {
				return {
					ok: false,
					diagnostic: {
						code: 'UNSUPPORTED_OPERATION',
						message: `Project Review cannot safely resolve operation ${operation?.tool ?? '(missing)'}`,
						operation_index: index,
						tool: operation?.tool
					}
				};
			}
			const args = asRecord(operation.args);
			if (!args) {
				return {
					ok: false,
					diagnostic: {
						code: 'INVALID_OPERATION',
						message: `Operation ${index + 1} has no arguments`,
						operation_index: index,
						tool: operation.tool
					}
				};
			}
			const operationProjectId = asString(args.project_id);
			if (operationProjectId !== input.projectId) {
				return {
					ok: false,
					diagnostic: {
						code: 'OPERATION_PROJECT_MISMATCH',
						message: `Operation ${index + 1} is not scoped to the suggestion project`,
						operation_index: index,
						tool: operation.tool,
						expected_project_id: input.projectId,
						actual_project_id: operationProjectId ?? undefined
					}
				};
			}
		}

		const { data: project, error: projectError } = await supabase
			.from('onto_projects')
			.select('id, doc_structure, deleted_at, archived_at')
			.eq('id', input.projectId)
			.maybeSingle();
		if (projectError) throw projectError;
		if (!project || project.deleted_at || project.archived_at) {
			return {
				ok: false,
				diagnostic: {
					code: 'INVALID_PROJECT',
					message: 'The proposal project is missing, archived, or deleted',
					expected_project_id: input.projectId
				}
			};
		}

		const tree = readTreeState(project.doc_structure);
		const ids = idsForOperations(input.operations);
		for (const documentId of [...ids.documentIds]) {
			const parentId = tree.parentById.get(documentId);
			if (parentId) ids.documentIds.add(parentId);
		}

		const [documentResult, taskResult, goalResult, milestoneResult] = await Promise.all([
			ids.documentIds.size
				? supabase
						.from('onto_documents')
						.select(
							operationsCarryEdits(input.operations)
								? 'id, project_id, title, state_key, deleted_at, archived_at, content'
								: 'id, project_id, title, state_key, deleted_at, archived_at'
						)
						.in('id', [...ids.documentIds])
				: Promise.resolve({ data: [], error: null }),
			ids.taskIds.size
				? supabase
						.from('onto_tasks')
						.select(
							'id, project_id, title, state_key, due_at, start_at, deleted_at, archived_at'
						)
						.in('id', [...ids.taskIds])
				: Promise.resolve({ data: [], error: null }),
			ids.goalIds.size
				? supabase
						.from('onto_goals')
						.select(
							'id, project_id, name, state_key, target_date, deleted_at, archived_at'
						)
						.in('id', [...ids.goalIds])
				: Promise.resolve({ data: [], error: null }),
			ids.milestoneIds.size
				? supabase
						.from('onto_milestones')
						.select('id, project_id, title, state_key, due_at, deleted_at, archived_at')
						.in('id', [...ids.milestoneIds])
				: Promise.resolve({ data: [], error: null })
		]);
		if (documentResult.error) throw documentResult.error;
		if (taskResult.error) throw taskResult.error;
		if (goalResult.error) throw goalResult.error;
		if (milestoneResult.error) throw milestoneResult.error;
		const documents = normalizeEntityRows(documentResult.data);
		const tasks = normalizeEntityRows(taskResult.data);
		const goals = normalizeEntityRows(goalResult.data);
		const milestones = normalizeEntityRows(milestoneResult.data);
		const entitiesByKind: Record<ResolvedEntityKind, Map<string, ResolvedEntity>> = {
			document: documents,
			task: tasks,
			goal: goals,
			milestone: milestones
		};

		const decoded: Array<DecodedLoopOperation & { key: string }> = [];
		const structuralParts: unknown[] = [];
		for (const [index, operation] of input.operations.entries()) {
			const args = asRecord(operation.args) ?? {};
			const modelText = modelTextForOperation(operation, input);
			const targetText = targetTextForOperation(operation, input);

			if (operation.tool === 'move_document_in_tree') {
				const documentId = asString(args.document_id);
				if (!documentId) {
					return {
						ok: false,
						diagnostic: {
							code: 'INVALID_OPERATION',
							message: 'move_document_in_tree requires document_id',
							operation_index: index,
							tool: operation.tool
						}
					};
				}
				const target = documents.get(documentId);
				const targetError = entityDiagnostic({
					entity: target,
					entityId: documentId,
					entityKind: 'document',
					projectId: input.projectId,
					operationIndex: index,
					tool: operation.tool
				});
				if (targetError) return { ok: false, diagnostic: targetError };

				const rawParent = args.new_parent_id;
				if (
					rawParent !== null &&
					rawParent !== undefined &&
					typeof rawParent !== 'string'
				) {
					return {
						ok: false,
						diagnostic: {
							code: 'INVALID_DESTINATION',
							message: 'Move destination must be a document ID or top level',
							operation_index: index,
							tool: operation.tool
						}
					};
				}
				const parentId = asString(rawParent);
				const destination = parentId ? documents.get(parentId) : undefined;
				if (parentId) {
					const destinationError = entityDiagnostic({
						entity: destination,
						entityId: parentId,
						entityKind: 'document',
						projectId: input.projectId,
						operationIndex: index,
						tool: operation.tool
					});
					if (destinationError) return { ok: false, diagnostic: destinationError };
					if (
						parentId === documentId ||
						isDescendant(tree.parentById, parentId, documentId)
					) {
						return {
							ok: false,
							diagnostic: {
								code: 'INVALID_DESTINATION',
								message: `Document "${target!.title}" cannot move under itself or a descendant`,
								operation_index: index,
								tool: operation.tool,
								entity_kind: 'document',
								entity_id: parentId
							}
						};
					}
				}

				const currentParentId = tree.parentById.get(documentId) ?? null;
				const currentPosition = tree.positionById.get(documentId) ?? null;
				const nextPosition =
					typeof args.new_position === 'number' && Number.isInteger(args.new_position)
						? args.new_position
						: 0;
				if (currentParentId === parentId && currentPosition === nextPosition) {
					return {
						ok: false,
						diagnostic: {
							code: 'NO_OP_OPERATION',
							message: `Document "${target!.title}" is already at the proposed destination and position`,
							operation_index: index,
							tool: operation.tool,
							entity_kind: 'document',
							entity_id: documentId,
							resolved_entity_title: target!.title,
							resolved_destination_title: destination?.title
						}
					};
				}

				if (
					input.checkModelAlignment !== false &&
					(!projectSuggestionTextNamesEntity(targetText, target!.title) ||
						(destination &&
							!projectSuggestionTextNamesEntity(modelText, destination.title)))
				) {
					return {
						ok: false,
						diagnostic: {
							code: 'MODEL_ENTITY_MISMATCH',
							message: `Model-authored proposal text does not name the resolved move target or destination`,
							operation_index: index,
							tool: operation.tool,
							entity_kind: 'document',
							entity_id: documentId,
							resolved_entity_title: target!.title,
							resolved_destination_title: destination?.title
						}
					};
				}

				const currentParent = currentParentId ? documents.get(currentParentId) : undefined;
				const destinationName = destination?.title ?? 'Top level';
				const changes: DecodedLoopOperationFieldChange[] = [
					{ label: 'Current location', value: currentParent?.title ?? 'Top level' },
					{ label: 'New location', value: destinationName },
					{ label: 'Position', value: String(nextPosition) }
				];
				decoded.push({
					key: `${operation.tool}:${documentId}:${index}`,
					action: 'move',
					actionLabel: 'Move',
					entityLabel: 'document',
					target: target!.title,
					summary: `Move "${target!.title}" ${destination ? `under "${destination.title}"` : 'to the top level'}.`,
					changes
				});
				structuralParts.push({
					tool: operation.tool,
					target_id: documentId,
					target_project_id: target!.project_id,
					target_state: target!.state_key,
					current_parent_id: currentParentId,
					current_position: currentPosition,
					destination_id: parentId,
					destination_project_id: destination?.project_id ?? null,
					destination_state: destination?.state_key ?? null,
					new_position: nextPosition
				});
				continue;
			}

			const spec = UPDATE_TOOL_SPECS[operation.tool]!;
			const entityKind = spec.entityKind;
			const entityId = asString(args[spec.idArg]);
			if (!entityId) {
				return {
					ok: false,
					diagnostic: {
						code: 'INVALID_OPERATION',
						message: `${operation.tool} requires ${entityKind}_id`,
						operation_index: index,
						tool: operation.tool,
						entity_kind: entityKind
					}
				};
			}
			const entity = entitiesByKind[entityKind].get(entityId);
			const targetError = entityDiagnostic({
				entity,
				entityId,
				entityKind,
				projectId: input.projectId,
				operationIndex: index,
				tool: operation.tool
			});
			if (targetError) return { ok: false, diagnostic: targetError };

			const conflictId = asString(asRecord(args.props)?.loop_conflict_with_task_id);
			const conflictTask = conflictId ? tasks.get(conflictId) : undefined;
			if (conflictId) {
				const conflictError = entityDiagnostic({
					entity: conflictTask,
					entityId: conflictId,
					entityKind: 'task',
					projectId: input.projectId,
					operationIndex: index,
					tool: operation.tool
				});
				if (conflictError) return { ok: false, diagnostic: conflictError };
			}

			if (
				input.checkModelAlignment !== false &&
				(!projectSuggestionTextNamesEntity(targetText, entity!.title) ||
					(conflictTask &&
						!projectSuggestionTextNamesEntity(modelText, conflictTask.title)))
			) {
				return {
					ok: false,
					diagnostic: {
						code: 'MODEL_ENTITY_MISMATCH',
						message: `Model-authored proposal text does not name the resolved ${entityKind} target`,
						operation_index: index,
						tool: operation.tool,
						entity_kind: entityKind,
						entity_id: entityId,
						resolved_entity_title: entity!.title,
						resolved_destination_title: conflictTask?.title
					}
				};
			}

			// Document text edits: resolve every anchor against the live body now, so
			// the user sees exactly the text that approval replaces.
			let documentEdits: DocumentTextEditV1[] | null = null;
			if (entityKind === 'document' && hasOwnArg(args, 'edits')) {
				documentEdits = parseReviewDocumentEdits(args.edits);
				if (!documentEdits) {
					return {
						ok: false,
						diagnostic: {
							code: 'INVALID_OPERATION',
							message: `${operation.tool} edits must be 1-${REVIEW_DOCUMENT_EDITS_MAX} exact {old_text, new_text} pairs`,
							operation_index: index,
							tool: operation.tool,
							entity_kind: entityKind,
							entity_id: entityId
						}
					};
				}
				const resolved = resolveDocumentEdits({
					project_id: input.projectId,
					document_id: entityId,
					content: entity!.content ?? '',
					edits: documentEdits
				});
				if (resolved.status !== 'resolved') {
					return {
						ok: false,
						diagnostic: {
							code: 'DOCUMENT_EDIT_UNRESOLVED',
							message:
								`Edits no longer match "${entity!.title}": ${formatDocumentEditFailures(resolved.failures, resolved.matched_edits)}`.slice(
									0,
									1_000
								),
							operation_index: index,
							tool: operation.tool,
							entity_kind: entityKind,
							entity_id: entityId,
							resolved_entity_title: entity!.title
						}
					};
				}
				if (resolved.next_content === (entity!.content ?? '')) {
					return {
						ok: false,
						diagnostic: {
							code: 'NO_OP_OPERATION',
							message: `Document "${entity!.title}" already reads as proposed`,
							operation_index: index,
							tool: operation.tool,
							entity_kind: entityKind,
							entity_id: entityId,
							resolved_entity_title: entity!.title
						}
					};
				}
			}

			// Fail closed on any argument the executor would write that this
			// verifier cannot show the user (for example an undisplayed title
			// rename or state change riding along with a props flag).
			for (const key of spec.mutatingArgs) {
				if (!hasOwnArg(args, key)) continue;
				if (key === 'edits' && documentEdits) continue;
				if (key === 'props') {
					if (asRecord(args.props)) continue;
				} else if ((spec.scalarFields as readonly string[]).includes(key)) {
					continue;
				} else if (spec.titleArgs.includes(key)) {
					if (asString(args[key]) === entity!.title) continue;
				} else if (key === 'calendar_sync') {
					if (args.calendar_sync === 'none') continue;
				}
				return {
					ok: false,
					diagnostic: {
						code: 'INVALID_OPERATION',
						message: `${operation.tool} argument "${key}" would change ${entityKind} "${entity!.title}" without being shown`,
						operation_index: index,
						tool: operation.tool,
						entity_kind: entityKind,
						entity_id: entityId
					}
				};
			}

			const scalars: Array<{
				field: ScalarField;
				proposed: string | null;
				current: string | null;
			}> = [];
			for (const field of spec.scalarFields) {
				if (!hasOwnArg(args, field)) continue;
				const proposed = readProposedScalar(field, args[field], spec);
				if (!proposed.ok) {
					return {
						ok: false,
						diagnostic: {
							code: 'INVALID_OPERATION',
							message: `${operation.tool} has an invalid ${field} value`,
							operation_index: index,
							tool: operation.tool,
							entity_kind: entityKind,
							entity_id: entityId
						}
					};
				}
				const current = entity![field];
				if (scalarValueIsCurrent(field, proposed.value, current, input.timezone)) {
					return {
						ok: false,
						diagnostic: {
							code: 'NO_OP_OPERATION',
							message: `${entityKind} "${entity!.title}" already has this ${SCALAR_FIELD_LABELS[field].toLowerCase()}`,
							operation_index: index,
							tool: operation.tool,
							entity_kind: entityKind,
							entity_id: entityId,
							resolved_entity_title: entity!.title
						}
					};
				}
				scalars.push({ field, proposed: proposed.value, current });
			}

			const changes: DecodedLoopOperationFieldChange[] = [
				...scalars.map(({ field, proposed, current }) => ({
					label: SCALAR_FIELD_LABELS[field],
					value: formatScalarValue(field, proposed),
					before: formatScalarValue(field, current)
				})),
				...updateChanges(args),
				...(documentEdits ?? []).map((edit) => ({
					label: edit.new_text.trim() ? 'Change' : 'Remove',
					format: 'text_edit' as const,
					before: editDisplayText(edit.old_text),
					value: edit.new_text.trim() ? editDisplayText(edit.new_text) : '(removed)'
				}))
			];
			if (changes.length === 0) {
				return {
					ok: false,
					diagnostic: {
						code: 'INVALID_OPERATION',
						message: `${operation.tool} has no property changes`,
						operation_index: index,
						tool: operation.tool,
						entity_kind: entityKind,
						entity_id: entityId
					}
				};
			}
			const isOutdatedFlag =
				entityKind === 'document' && asRecord(args.props)?.loop_flagged_outdated === true;
			const summary = isOutdatedFlag
				? `Mark "${entity!.title}" as outdated.`
				: documentEdits
					? `Edit "${entity!.title}" (${documentEdits.length} change${documentEdits.length === 1 ? '' : 's'}).`
					: conflictTask
						? `Flag "${entity!.title}" for review against "${conflictTask.title}".`
						: scalars.length && !asRecord(args.props)
							? scalarSummary(entityKind, entity!.title, scalars)
							: `Update ${entityKind} "${entity!.title}".`;
			decoded.push({
				key: `${operation.tool}:${entityId}:${index}`,
				action: 'update',
				actionLabel: 'Update',
				entityLabel: entityKind,
				target: entity!.title,
				summary,
				changes
			});
			const structuralPart: Record<string, unknown> = {
				tool: operation.tool,
				target_id: entityId,
				target_project_id: entity!.project_id,
				target_state: entity!.state_key,
				target_parent_id:
					entityKind === 'document' ? (tree.parentById.get(entityId) ?? null) : null,
				target_position:
					entityKind === 'document' ? (tree.positionById.get(entityId) ?? null) : null,
				proposed_props: asRecord(args.props),
				referenced_task_id: conflictId,
				referenced_task_project_id: conflictTask?.project_id ?? null,
				referenced_task_state: conflictTask?.state_key ?? null
			};
			// Scalar keys exist only on scalar-carrying shapes, so the fingerprint of
			// every props-only operation stays byte-identical to the pre-scalar one.
			if (scalars.length) {
				structuralPart.proposed_scalars = Object.fromEntries(
					scalars.map(({ field, proposed }) => [field, proposed])
				);
				structuralPart.current_scalars = Object.fromEntries(
					scalars.map(({ field, current }) => [field, current])
				);
			}
			// Only edit-carrying shapes gain the key, so every other fingerprint is unchanged.
			if (documentEdits) structuralPart.proposed_edits = documentEdits;
			structuralParts.push(structuralPart);
		}

		const fingerprint = structuralFingerprint(structuralParts);
		if (
			input.expectedStructuralFingerprint &&
			input.expectedStructuralFingerprint !== fingerprint
		) {
			return {
				ok: false,
				diagnostic: {
					code: 'EXPECTED_STATE_CHANGED',
					message:
						'The proposal structure or resolved entity state changed after verification'
				}
			};
		}

		return {
			ok: true,
			summary: {
				headline: verifiedHeadline(decoded),
				operation_count: decoded.length,
				operations: decoded,
				structural_fingerprint: fingerprint,
				verified_at: new Date().toISOString()
			}
		};
	} catch (error) {
		return {
			ok: false,
			diagnostic: {
				code: 'RESOLUTION_FAILED',
				message:
					error instanceof Error
						? `Failed to resolve proposal operations: ${error.message}`
						: 'Failed to resolve proposal operations'
			}
		};
	}
}

export const PROJECT_SUGGESTION_VERIFIED_PREFIX = 'proposal_verified:';
export const PROJECT_SUGGESTION_QUARANTINED_PREFIX = 'proposal_quarantined:';

export function projectSuggestionVerifiedSourceStatus(structuralFingerprint: string): string {
	return `${PROJECT_SUGGESTION_VERIFIED_PREFIX}${structuralFingerprint}`;
}

export function readProjectSuggestionStructuralFingerprint(sourceStatus: unknown): string | null {
	const value = asString(sourceStatus);
	return value?.startsWith(PROJECT_SUGGESTION_VERIFIED_PREFIX)
		? value.slice(PROJECT_SUGGESTION_VERIFIED_PREFIX.length) || null
		: null;
}

export function projectSuggestionQuarantinedSourceStatus(
	diagnostic: ProjectSuggestionIntegrityDiagnostic
): string {
	return `${PROJECT_SUGGESTION_QUARANTINED_PREFIX}${diagnostic.code.toLowerCase()}`;
}

export function serializeProjectSuggestionIntegrityDiagnostic(
	diagnostic: ProjectSuggestionIntegrityDiagnostic
): string {
	return JSON.stringify({
		type: 'project_suggestion_integrity',
		...diagnostic
	});
}
