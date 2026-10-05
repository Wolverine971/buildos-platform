// packages/shared-agent-ops/src/consolidation/consolidation.ts
//
// Document consolidation runs (docs/research/doc-task-consolidation-2026-10-03).
// A run surveys a project and its sub-projects, groups docs that belong
// together (twins, misfiled, fragments, versions, superseded), and decides what
// to do with each group. What the evidence settles is "decided for you"; what it
// doesn't becomes a question card in the style of Claude Code: a short header,
// the question, 2-4 options each bound to exact operations, the recommended one
// first, plus "type something" and "chat about this" in the UI.
//
// Rules the code enforces, not the model:
// - Every option is a list of operations from a closed set (see ConsolidationOp).
// - The skip option only keeps things: nothing that loses or closes anything
//   is ever applied on a default.
// - Archiving anything that is not an exact twin is always asked, and so is
//   every merge (docs or tasks) and every task closed (ALWAYS_ASKED_OPS).
//
// Client-safe: no Node imports. Readers parse structured fields only.

import { parseLedgerFate, safeEdits, type LedgerFate, type MergeStatus } from './ledger';

export const CONSOLIDATION_VERSION = 1 as const;

export const CONSOLIDATION_RUN_STATUSES = [
	'surveying',
	'waiting',
	'review',
	'applying',
	'applied',
	'undone',
	'failed',
	'cancelled'
] as const;
export type ConsolidationRunStatus = (typeof CONSOLIDATION_RUN_STATUSES)[number];

export const CONSOLIDATION_CLUSTER_KINDS = [
	'twins',
	'misfiled',
	'fragments',
	'versions',
	'superseded',
	// Task-only groups (DJ's picks, 2026-10-04: docs/research/doc-task-consolidation-2026-10-03).
	'duplicate_tasks',
	'task_parts',
	'task_sequence',
	'sibling_tasks',
	'finished_tasks'
] as const;
export type ConsolidationClusterKind = (typeof CONSOLIDATION_CLUSTER_KINDS)[number];

/**
 * One change the run can apply. Moves land at the destination's top level. A
 * merge writes one new doc from the sources' facts (see ledger.ts), puts it at
 * the top of the target project, and archives the sources pointing to it.
 */
export type ConsolidationOp =
	| { op: 'move'; document_ids: string[]; target_project_id: string }
	| { op: 'archive'; document_ids: string[]; replaced_by_id: string | null }
	| { op: 'merge'; document_ids: string[]; target_project_id: string; title: string }
	| { op: 'keep'; document_ids: string[]; task_ids?: string[] }
	/** Misfiled tasks move; they land at the top of the destination. */
	| { op: 'move_tasks'; task_ids: string[]; target_project_id: string }
	/**
	 * Duplicates become one task: `keep_id` gains a checklist line per merged
	 * task (its title and notes), and `task_ids` are archived pointing to it.
	 */
	| { op: 'merge_tasks'; task_ids: string[]; keep_id: string }
	/**
	 * A new plan in `project_id` holds `task_ids` in this order: the pieces of a
	 * bigger task (the big one first), or the steps of a sequence. With
	 * `sequence`, each task also waits on the one before it.
	 */
	| {
			op: 'plan_tasks';
			task_ids: string[];
			project_id: string;
			name: string;
			sequence: boolean;
	  }
	/**
	 * Siblings across sub-projects: one new task in `project_id` (their parent)
	 * with a checklist linking each of `task_ids`, which stay where they are.
	 */
	| { op: 'rollup_tasks'; task_ids: string[]; project_id: string; title: string }
	/**
	 * Tasks the evidence settles. `done`: the work happened, as the evidence
	 * doc shows; marked done as of that doc's date, citing it. `archived`:
	 * replaced or dropped. `note` says why, in the owner's words.
	 */
	| {
			op: 'close_tasks';
			task_ids: string[];
			how: 'done' | 'archived';
			evidence_document_id: string | null;
			note: string;
	  };

export type ConsolidationTaskOp = Extract<
	ConsolidationOp,
	{ op: 'move_tasks' | 'merge_tasks' | 'plan_tasks' | 'rollup_tasks' | 'close_tasks' }
>;
/** Ops that act on documents. */
export type ConsolidationDocOp = Exclude<ConsolidationOp, ConsolidationTaskOp>;

export function isTaskOp(op: ConsolidationOp): op is ConsolidationTaskOp {
	return (
		op.op === 'move_tasks' ||
		op.op === 'merge_tasks' ||
		op.op === 'plan_tasks' ||
		op.op === 'rollup_tasks' ||
		op.op === 'close_tasks'
	);
}

/** Ops that lose or close something, so they never apply without the owner's answer. */
export const ALWAYS_ASKED_OPS: readonly ConsolidationOp['op'][] = [
	'merge',
	'merge_tasks',
	'close_tasks'
];

export type ConsolidationEvidence = {
	document_id: string;
	/** Doc title as shown on the card. */
	source: string;
	/** Verbatim from the document; code checked it is there. */
	quote: string;
};

export type ConsolidationOption = {
	id: string;
	label: string;
	description: string;
	ops: ConsolidationOp[];
	/** Merge questions only: how the option changes facts in the merge ledger. */
	edits?: LedgerFate[];
};

export type ConsolidationReading = {
	/** The option the text maps to, or null for a custom instruction. */
	option_id: string | null;
	/** Set when the answer is not one of the options. */
	instruction: string | null;
	/** One sentence read back to the user before anything runs. */
	readback: string;
};

export type ConsolidationThreadLine = { role: 'user' | 'assistant'; text: string; at: string };

export type ConsolidationAnswer =
	| { via: 'option'; option_id: string }
	| { via: 'skip'; option_id: string }
	| { via: 'text'; text: string; reading: ConsolidationReading }
	| { via: 'chat'; reading: ConsolidationReading };

/** An unconfirmed reading of typed text or a chat thread. */
export type ConsolidationDraft = {
	via: 'text' | 'chat';
	text: string | null;
	thread: ConsolidationThreadLine[];
	reading: ConsolidationReading | null;
};

export const CONSOLIDATION_QUESTION_STATUSES = [
	'open',
	'answered',
	'skipped',
	'withdrawn'
] as const;
export type ConsolidationQuestionStatus = (typeof CONSOLIDATION_QUESTION_STATUSES)[number];

export type ConsolidationQuestion = {
	id: string;
	run_id: string;
	/** What the question holds up, e.g. `cluster:c3`. Everything else keeps going. */
	piece: string;
	header: string;
	question: string;
	evidence: ConsolidationEvidence[];
	options: ConsolidationOption[];
	recommended_option_id: string | null;
	/** The option a skip applies. Always keep-only. */
	skip_option_id: string;
	priority: number;
	status: ConsolidationQuestionStatus;
	answer: ConsolidationAnswer | null;
	draft: ConsolidationDraft | null;
	answered_at: string | null;
	created_at: string;
};

export type ConsolidationCluster = {
	key: string;
	kind: ConsolidationClusterKind;
	title: string;
	document_ids: string[];
	reason: string;
	/** What the run will do unless a question or the user says otherwise. */
	ops: ConsolidationOp[];
	/** Tasks in the group (misfiled work only); absent on older plans. */
	task_ids?: string[];
	/** Set when the cluster waits on a question. */
	question_id: string | null;
	/** True when the user flipped a decided-for-you cluster to "leave it". */
	vetoed: boolean;
};

export type ConsolidationPlan = {
	version: typeof CONSOLIDATION_VERSION;
	clusters: ConsolidationCluster[];
	/** Doc titles and projects the UI needs, keyed by id. */
	documents: Record<
		string,
		{
			title: string;
			project_id: string;
			/** Docs under this one in its tree at survey time; they move with it. */
			inside?: string[];
		}
	>;
	/** Task titles and projects, for groups that move tasks; absent on older plans. */
	tasks?: Record<string, { title: string; project_id: string }>;
	projects: Record<string, { name: string; parent: boolean }>;
};

export const CONSOLIDATION_LIMITS = {
	maxDocuments: 300,
	maxClusters: 15,
	maxDocsPerCluster: 20,
	minOptions: 2,
	maxOptions: 4,
	maxHeader: 24,
	maxQuestion: 400,
	maxEvidence: 3,
	maxQuote: 280,
	maxThread: 12,
	maxTypedText: 2000,
	maxTasksPerCluster: 12,
	maxTaskTitle: 120,
	maxTaskNote: 240
} as const;

// ---------- parsing ----------

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function uuid(value: unknown): string | null {
	return typeof value === 'string' && UUID_PATTERN.test(value) ? value.toLowerCase() : null;
}
/** Length in characters as people (and Postgres `char_length`) count them: an emoji is one. */
function chars(text: string): number {
	return Array.from(text).length;
}
function str(value: unknown, max: number): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return trimmed && chars(trimmed) <= max ? trimmed : null;
}
function uuids(value: unknown): string[] | null {
	if (!Array.isArray(value) || value.length === 0) return null;
	const out: string[] = [];
	for (const item of value) {
		const id = uuid(item);
		if (!id) return null;
		if (!out.includes(id)) out.push(id);
	}
	return out;
}

export function parseConsolidationOp(value: unknown): ConsolidationOp | null {
	if (!isRecord(value)) return null;
	if (value.op === 'merge_tasks') {
		const taskIds = uuids(value.task_ids);
		const keep = uuid(value.keep_id);
		return taskIds && keep && !taskIds.includes(keep)
			? { op: 'merge_tasks', task_ids: taskIds, keep_id: keep }
			: null;
	}
	if (value.op === 'plan_tasks') {
		const taskIds = uuids(value.task_ids);
		const project = uuid(value.project_id);
		const name = str(value.name, CONSOLIDATION_LIMITS.maxTaskTitle);
		return taskIds && taskIds.length >= 2 && project && name
			? {
					op: 'plan_tasks',
					task_ids: taskIds,
					project_id: project,
					name,
					sequence: value.sequence === true
				}
			: null;
	}
	if (value.op === 'rollup_tasks') {
		const taskIds = uuids(value.task_ids);
		const project = uuid(value.project_id);
		const title = str(value.title, CONSOLIDATION_LIMITS.maxTaskTitle);
		return taskIds && taskIds.length >= 2 && project && title
			? { op: 'rollup_tasks', task_ids: taskIds, project_id: project, title }
			: null;
	}
	if (value.op === 'close_tasks') {
		const taskIds = uuids(value.task_ids);
		const how = value.how === 'done' || value.how === 'archived' ? value.how : null;
		const evidence =
			value.evidence_document_id == null ? null : uuid(value.evidence_document_id);
		const note = str(value.note, CONSOLIDATION_LIMITS.maxTaskNote);
		if (value.evidence_document_id != null && !evidence) return null;
		// "Done" only on evidence that the work happened.
		if (!taskIds || !how || !note || (how === 'done' && !evidence)) return null;
		return {
			op: 'close_tasks',
			task_ids: taskIds,
			how,
			evidence_document_id: evidence,
			note
		};
	}
	if (value.op === 'move_tasks') {
		const taskIds = uuids(value.task_ids);
		const target = uuid(value.target_project_id);
		return taskIds && target
			? { op: 'move_tasks', task_ids: taskIds, target_project_id: target }
			: null;
	}
	if (value.op === 'keep') {
		// A group of misfiled tasks has nothing but tasks to leave as they are.
		const empty = (list: unknown) =>
			list === undefined || (Array.isArray(list) && !list.length);
		const docIds = empty(value.document_ids) ? [] : uuids(value.document_ids);
		const taskIds = empty(value.task_ids) ? [] : uuids(value.task_ids);
		if (!docIds || !taskIds || docIds.length + taskIds.length === 0) return null;
		return taskIds.length
			? { op: 'keep', document_ids: docIds, task_ids: taskIds }
			: { op: 'keep', document_ids: docIds };
	}
	const ids = uuids(value.document_ids);
	if (!ids) return null;
	if (value.op === 'move') {
		const target = uuid(value.target_project_id);
		return target ? { op: 'move', document_ids: ids, target_project_id: target } : null;
	}
	if (value.op === 'archive') {
		const replaced = value.replaced_by_id == null ? null : uuid(value.replaced_by_id);
		if (value.replaced_by_id != null && !replaced) return null;
		return { op: 'archive', document_ids: ids, replaced_by_id: replaced };
	}
	if (value.op === 'merge') {
		const target = uuid(value.target_project_id);
		const title = str(value.title, 120);
		return target && title && ids.length >= 2
			? { op: 'merge', document_ids: ids, target_project_id: target, title }
			: null;
	}
	return null;
}

export function parseConsolidationOps(value: unknown): ConsolidationOp[] | null {
	if (!Array.isArray(value) || value.length === 0) return null;
	const ops: ConsolidationOp[] = [];
	for (const item of value) {
		const op = parseConsolidationOp(item);
		if (!op) return null;
		ops.push(op);
	}
	return ops;
}

export function keepsOnly(ops: readonly ConsolidationOp[]): boolean {
	return ops.every((op) => op.op === 'keep');
}

function parseOption(value: unknown): ConsolidationOption | null {
	if (!isRecord(value)) return null;
	const id = str(value.id, 40);
	const label = str(value.label, 80);
	const description = typeof value.description === 'string' ? value.description.trim() : '';
	const ops = parseConsolidationOps(value.ops);
	if (!id || !label || !ops || chars(description) > 240) return null;
	if (value.edits === undefined) return { id, label, description, ops };
	if (!Array.isArray(value.edits)) return null;
	const edits = value.edits.map(parseLedgerFate);
	if (edits.some((edit) => edit === null)) return null;
	return { id, label, description, ops, edits: edits as LedgerFate[] };
}

function parseEvidence(value: unknown): ConsolidationEvidence[] {
	if (!Array.isArray(value)) return [];
	const out: ConsolidationEvidence[] = [];
	for (const item of value.slice(0, CONSOLIDATION_LIMITS.maxEvidence)) {
		if (!isRecord(item)) continue;
		const documentId = uuid(item.document_id);
		const source = str(item.source, 200);
		const quote = str(item.quote, CONSOLIDATION_LIMITS.maxQuote);
		if (documentId && source && quote) out.push({ document_id: documentId, source, quote });
	}
	return out;
}

function parseReading(value: unknown): ConsolidationReading | null {
	if (!isRecord(value)) return null;
	const readback = str(value.readback, 400);
	const optionId = value.option_id == null ? null : str(value.option_id, 40);
	const instruction = value.instruction == null ? null : str(value.instruction, 1000);
	if (!readback || (optionId === null && instruction === null)) return null;
	return { option_id: optionId, instruction, readback };
}

function parseThread(value: unknown): ConsolidationThreadLine[] {
	if (!Array.isArray(value)) return [];
	return value
		.filter(isRecord)
		.map((line) => ({
			role: line.role === 'assistant' ? ('assistant' as const) : ('user' as const),
			text: typeof line.text === 'string' ? line.text : '',
			at: typeof line.at === 'string' ? line.at : ''
		}))
		.filter((line) => line.text.length > 0)
		.slice(-CONSOLIDATION_LIMITS.maxThread * 2);
}

export function parseConsolidationAnswer(value: unknown): ConsolidationAnswer | null {
	if (!isRecord(value)) return null;
	if (value.via === 'option' || value.via === 'skip') {
		const optionId = str(value.option_id, 40);
		return optionId ? { via: value.via, option_id: optionId } : null;
	}
	const reading = parseReading(value.reading);
	if (!reading) return null;
	if (value.via === 'text') {
		const text = str(value.text, CONSOLIDATION_LIMITS.maxTypedText);
		return text ? { via: 'text', text, reading } : null;
	}
	if (value.via === 'chat') return { via: 'chat', reading };
	return null;
}

export function parseConsolidationDraft(value: unknown): ConsolidationDraft | null {
	if (!isRecord(value) || (value.via !== 'text' && value.via !== 'chat')) return null;
	return {
		via: value.via,
		text: typeof value.text === 'string' ? value.text : null,
		thread: parseThread(value.thread),
		reading: value.reading == null ? null : parseReading(value.reading)
	};
}

/**
 * Validates a question as stored. Returns null for anything that breaks the
 * card's rules, so a malformed row never renders as an answerable card.
 */
export function parseConsolidationQuestion(row: unknown): ConsolidationQuestion | null {
	if (!isRecord(row)) return null;
	const id = uuid(row.id);
	const runId = uuid(row.run_id);
	const piece = str(row.piece, 120);
	const header = str(row.header, CONSOLIDATION_LIMITS.maxHeader);
	const question = str(row.question, CONSOLIDATION_LIMITS.maxQuestion);
	if (!id || !runId || !piece || !header || !question) return null;
	if (!Array.isArray(row.options)) return null;
	const options = row.options.map(parseOption);
	if (
		options.length < CONSOLIDATION_LIMITS.minOptions ||
		options.length > CONSOLIDATION_LIMITS.maxOptions ||
		options.some((option) => option === null)
	)
		return null;
	const valid = options as ConsolidationOption[];
	if (new Set(valid.map((option) => option.id)).size !== valid.length) return null;
	const recommended =
		row.recommended_option_id == null ? null : str(row.recommended_option_id, 40);
	if (recommended && !valid.some((option) => option.id === recommended)) return null;
	const skipId = str(row.skip_option_id, 40);
	const skip = valid.find((option) => option.id === skipId);
	if (!skip || !keepsOnly(skip.ops)) return null;
	const status = CONSOLIDATION_QUESTION_STATUSES.includes(
		row.status as ConsolidationQuestionStatus
	)
		? (row.status as ConsolidationQuestionStatus)
		: null;
	if (!status) return null;
	return {
		id,
		run_id: runId,
		piece,
		header,
		question,
		evidence: parseEvidence(row.evidence),
		options: valid,
		recommended_option_id: recommended,
		skip_option_id: skip.id,
		priority: typeof row.priority === 'number' ? row.priority : 0,
		status,
		answer: row.answer == null ? null : parseConsolidationAnswer(row.answer),
		draft: row.draft == null ? null : parseConsolidationDraft(row.draft),
		answered_at: typeof row.answered_at === 'string' ? row.answered_at : null,
		created_at: typeof row.created_at === 'string' ? row.created_at : ''
	};
}

/** Recommended option first, then the rest in their stored order. */
export function orderedOptions(question: ConsolidationQuestion): ConsolidationOption[] {
	const recommended = question.options.find(
		(option) => option.id === question.recommended_option_id
	);
	return recommended
		? [recommended, ...question.options.filter((option) => option !== recommended)]
		: question.options;
}

/** The operations an answered (or skipped) question resolves to; null while open or custom. */
export function answeredOps(question: ConsolidationQuestion): ConsolidationOp[] | null {
	const answer = question.answer;
	if (!answer) return null;
	const optionId =
		answer.via === 'option' || answer.via === 'skip'
			? answer.option_id
			: answer.reading.option_id;
	if (!optionId) return null;
	return question.options.find((option) => option.id === optionId)?.ops ?? null;
}

// ---------- words ----------

type Names = {
	project: (id: string) => string;
	document: (id: string) => string;
	/** Docs under a doc in its tree, which travel with it when it moves. */
	inside?: (id: string) => readonly string[];
	task?: (id: string) => string;
};

function docs(count: number): string {
	return `${count} doc${count === 1 ? '' : 's'}`;
}
function tasks(count: number): string {
	return `${count} task${count === 1 ? '' : 's'}`;
}

/** " and the 4 inside it": sub-docs a move carries along that the op does not list itself. */
function carried(documentIds: readonly string[], names: Names): string {
	if (!names.inside) return '';
	const listed = new Set(documentIds);
	const along = new Set<string>();
	for (const id of documentIds)
		for (const sub of names.inside(id)) if (!listed.has(sub)) along.add(sub);
	if (along.size === 0) return '';
	return ` and the ${along.size} inside ${documentIds.length === 1 ? 'it' : 'them'}`;
}

/** "Moves 11 docs to Beyond Exit Planning · archives 1 doc". */
export function describeOps(ops: readonly ConsolidationOp[], names: Names): string {
	const parts = ops
		.filter((op) => op.op !== 'keep')
		.map((op) => {
			if (op.op === 'move')
				return `moves ${docs(op.document_ids.length)}${carried(op.document_ids, names)} to ${names.project(op.target_project_id)}`;
			if (op.op === 'archive')
				return op.replaced_by_id
					? `archives ${docs(op.document_ids.length)}, pointing to “${names.document(op.replaced_by_id)}”`
					: `archives ${docs(op.document_ids.length)}`;
			if (op.op === 'merge')
				return `merges ${docs(op.document_ids.length)} into “${op.title}” in ${names.project(op.target_project_id)}, archiving the originals`;
			if (op.op === 'move_tasks')
				return `moves ${tasks(op.task_ids.length)} to ${names.project(op.target_project_id)}`;
			if (op.op === 'merge_tasks')
				return `merges ${tasks(op.task_ids.length + 1)} into “${names.task?.(op.keep_id) ?? 'one task'}”, archiving the other ${op.task_ids.length === 1 ? 'one' : op.task_ids.length}`;
			if (op.op === 'plan_tasks')
				return op.sequence
					? `puts ${tasks(op.task_ids.length)} in order in a new plan “${op.name}”, each waiting on the one before`
					: `gathers ${tasks(op.task_ids.length)} in a new plan “${op.name}”`;
			if (op.op === 'rollup_tasks')
				return `adds “${op.title}” to ${names.project(op.project_id)}, with a checklist of ${tasks(op.task_ids.length)} that stay where they are`;
			if (op.op === 'close_tasks')
				return op.how === 'done'
					? `marks ${tasks(op.task_ids.length)} done, citing “${op.evidence_document_id ? names.document(op.evidence_document_id) : 'the evidence'}”`
					: `archives ${tasks(op.task_ids.length)}: ${op.note}`;
			return '';
		})
		.filter(Boolean);
	if (parts.length === 0) return 'No change.';
	const sentence = parts.join(' · ');
	return sentence.charAt(0).toUpperCase() + sentence.slice(1) + '.';
}

/** Every doc a set of operations changes, for overlap checks. */
export function touchedDocuments(ops: readonly ConsolidationOp[]): string[] {
	const out = new Set<string>();
	for (const op of ops)
		if (op.op !== 'keep' && !isTaskOp(op)) for (const id of op.document_ids) out.add(id);
	return [...out];
}

/** Every task a set of operations changes or links, for overlap checks. */
export function touchedTasks(ops: readonly ConsolidationOp[]): string[] {
	const out = new Set<string>();
	for (const op of ops) {
		if (!isTaskOp(op)) continue;
		for (const id of op.task_ids) out.add(id);
		if (op.op === 'merge_tasks') out.add(op.keep_id);
	}
	return [...out];
}

/** Docs and tasks an Apply would change: what the Apply button counts. */
export function changeCount(ops: readonly ConsolidationOp[]): number {
	return ops.reduce((total, op) => {
		if (op.op === 'keep') return total;
		if (op.op === 'merge_tasks') return total + op.task_ids.length + 1;
		// The new task counts too.
		if (op.op === 'rollup_tasks') return total + op.task_ids.length + 1;
		if (isTaskOp(op)) return total + op.task_ids.length;
		return total + op.document_ids.length;
	}, 0);
}

/** Final operations for the whole plan, given its questions. Clusters still waiting are left out. */
export function planOps(
	plan: ConsolidationPlan,
	questions: readonly ConsolidationQuestion[],
	/** Merge draft status by cluster key: a merge is ready only once its draft is written. */
	merges: ReadonlyMap<string, MergeStatus> = new Map()
): { ready: ConsolidationOp[]; waiting: string[] } {
	const byId = new Map(questions.map((question) => [question.id, question]));
	const ready: ConsolidationOp[] = [];
	const waiting: string[] = [];
	for (const cluster of plan.clusters) {
		if (cluster.vetoed) continue;
		let ops: ConsolidationOp[] = cluster.ops;
		if (cluster.question_id) {
			const question = byId.get(cluster.question_id);
			const answered = question ? answeredOps(question) : null;
			if (!question || question.status === 'open' || !answered) {
				if (question?.status !== 'withdrawn') waiting.push(cluster.key);
				continue;
			}
			ops = answered;
		}
		if (ops.some((op) => op.op === 'merge') && merges.get(cluster.key) !== 'ready') {
			waiting.push(cluster.key);
			continue;
		}
		ready.push(...ops.filter((op) => op.op !== 'keep'));
	}
	return { ready, waiting };
}

/** The merge op a cluster's answer chose, if any. */
export function chosenMerge(
	cluster: ConsolidationCluster,
	questions: readonly ConsolidationQuestion[]
): Extract<ConsolidationOp, { op: 'merge' }> | null {
	const question = cluster.question_id
		? questions.find((item) => item.id === cluster.question_id)
		: null;
	const ops = question ? answeredOps(question) : cluster.question_id ? null : cluster.ops;
	const merge = ops?.find((op) => op.op === 'merge');
	return merge?.op === 'merge' ? merge : null;
}

/** Merge questions are keyed `merge:<cluster key>:<n>`; they hold up only that merge's draft. */
export function mergePieceKey(piece: string): string | null {
	const parts = piece.split(':');
	return parts[0] === 'merge' && parts[1] ? parts[1] : null;
}

/**
 * What the owner has said so far on one merge's live (not withdrawn) cards. The
 * worker stores it with each draft as `written_for`; a draft written from an
 * older state gets another pass, and Apply holds it until then.
 */
export function answersFingerprint(questions: readonly ConsolidationQuestion[]): string {
	return JSON.stringify(
		questions
			.filter((question) => question.status !== 'withdrawn')
			.map((question) => [question.id, question.status, question.answer])
			.sort((a, b) => String(a[0]).localeCompare(String(b[0])))
	);
}

/**
 * The fact edits a merge question contributes to the draft: the chosen
 * option's, or, while unanswered, the recommended option's when it only keeps
 * or notes facts (an unanswered card never drops, replaces or folds in a fact).
 */
export function questionEdits(question: ConsolidationQuestion): LedgerFate[] {
	// A withdrawn card belongs to a draft that was left alone or started over.
	if (question.status === 'withdrawn') return [];
	const byId = (id: string | null) =>
		id ? question.options.find((option) => option.id === id) : undefined;
	if (question.status === 'answered' || question.status === 'skipped') {
		const answer = question.answer;
		const optionId = !answer
			? null
			: answer.via === 'option' || answer.via === 'skip'
				? answer.option_id
				: answer.reading.option_id;
		return byId(optionId)?.edits ?? [];
	}
	const recommended = byId(question.recommended_option_id)?.edits ?? [];
	return safeEdits(recommended) ? recommended : [];
}

export * from './ledger';
