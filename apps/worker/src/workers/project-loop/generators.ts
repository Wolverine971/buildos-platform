// apps/worker/src/workers/project-loop/generators.ts
//
// LLM generators for the Project Loops reconciliation pass. Each generator
// produces ProposedSuggestion[] whose `operations` are declarative tool calls
// (validated against the real ChatToolExecutor write-tool arg shapes) that the
// web app replays on approval.
//
// Current families: doc_org, doc_outdated, drift, and task_conflict. Drift is
// informational; task_conflict only writes reversible metadata flags.

import type {
	LoopOperation,
	ProjectLoopBrief,
	ProjectSuggestionEvidenceRef,
	ProjectSuggestionEvidenceType,
	ProjectSuggestionPreview,
	ProposedSuggestion
} from '@buildos/shared-types';
import { buildHeuristicProjectLoopBrief } from '@buildos/shared-agent-ops';
import type { SmartLLMService } from '../../lib/services/smart-llm-service';

/**
 * LLM usage/cost event emitted by the smart-llm service on each call. Relocated
 * here (previously imported from the now-removed homework engine) so the
 * project-loop worker owns its own dependency surface.
 */
export interface UsageEvent {
	model: string;
	promptTokens: number;
	completionTokens: number;
	totalTokens: number;
	inputCost: number;
	outputCost: number;
	totalCost: number;
}

export interface LoopDocument {
	id: string;
	title: string;
	type_key: string | null;
	state_key: string | null;
	description: string | null;
	updated_at: string | null;
	parent_id: string | null;
}

export interface LoopTask {
	id: string;
	title: string;
	description: string | null;
	type_key?: string | null;
	state_key: string | null;
	priority?: number | null;
	start_at?: string | null;
	due_at?: string | null;
	updated_at: string | null;
	goal_names?: string[];
}

export interface LoopPriorDecision {
	title: string;
	kind: string;
	status: string;
	reason?: string | null;
	note?: string | null;
	decided_at?: string | null;
}

export interface LoopContext {
	projectId: string;
	projectName: string;
	projectDescription: string | null;
	goals: Array<{ name: string; description: string | null }>;
	documents: LoopDocument[];
	docStructureSummary: string;
	tasks: LoopTask[];
	priorDecisions: LoopPriorDecision[];
}

interface RawSuggestion {
	title?: string;
	rationale?: string;
	why_now?: string;
	confidence?: number;
	evidence_refs?: RawEvidenceRef[];
	preview?: RawPreview;
	reversible?: boolean;
	operations?: Array<{ tool?: string; args?: Record<string, unknown>; label?: string }>;
	undo_operations?: Array<{ tool?: string; args?: Record<string, unknown>; label?: string }>;
}

interface RawSuggestionEnvelope {
	suggestions?: RawSuggestion[];
}

interface RawBriefEnvelope {
	brief?: Partial<ProjectLoopBrief>;
}

type ProjectLoopOperationType =
	| 'project_loop_brief'
	| 'project_loop_doc_organization'
	| 'project_loop_outdated_docs'
	| 'project_loop_drift'
	| 'project_loop_task_conflicts';

interface RawEvidenceRef {
	entity_type?: string;
	entity_id?: string;
	title?: string;
	reason?: string;
	excerpt?: string;
	updated_at?: string;
}

interface RawPreview {
	kind?: string;
	summary?: string;
	before?: string | string[];
	after?: string | string[];
	impact?: string;
}

const EVIDENCE_TYPES = new Set<ProjectSuggestionEvidenceType>([
	'project',
	'goal',
	'document',
	'task',
	'calendar_event',
	'external',
	'unknown'
]);

const PREVIEW_KINDS = new Set<NonNullable<ProjectSuggestionPreview['kind']>>([
	'doc_tree',
	'outdated_flag',
	'task_merge',
	'drift',
	'brief',
	'generic'
]);

const TASK_CONFLICT_KINDS = new Set(['duplicate', 'contradiction', 'blocked_by']);
const TASK_PAIR_STOP_WORDS = new Set([
	'a',
	'an',
	'and',
	'are',
	'as',
	'at',
	'be',
	'by',
	'for',
	'from',
	'in',
	'into',
	'is',
	'of',
	'on',
	'or',
	'our',
	'the',
	'to',
	'with'
]);
const TASK_PAIR_OPPOSING_TERMS: Array<[string, string]> = [
	['add', 'remove'],
	['allow', 'block'],
	['approve', 'reject'],
	['build', 'delete'],
	['create', 'delete'],
	['enable', 'disable'],
	['include', 'exclude'],
	['launch', 'delay'],
	['open', 'close'],
	['publish', 'unpublish'],
	['start', 'stop']
];

export interface TaskConflictCandidatePair {
	taskAId: string;
	taskBId: string;
	score: number;
	reasons: string[];
}

function normalizeEntityIds(ids: Array<string | null | undefined>): string[] {
	return Array.from(
		new Set(ids.filter((id): id is string => typeof id === 'string' && id.length > 0))
	).sort();
}

function taskPairKey(a: string, b: string): string {
	return [a, b].sort().join('|');
}

function tokenizeTaskText(value: string | null | undefined): string[] {
	if (!value) return [];
	return Array.from(
		new Set(
			value
				.toLowerCase()
				.replace(/[^a-z0-9\s-]/g, ' ')
				.split(/[\s-]+/)
				.map((token) => token.trim())
				.filter((token) => token.length >= 3 && !TASK_PAIR_STOP_WORDS.has(token))
		)
	);
}

function normalizedTaskTitle(value: string): string {
	return tokenizeTaskText(value).join(' ');
}

function overlapCount(a: string[], b: string[]): number {
	const bSet = new Set(b);
	return a.filter((token) => bSet.has(token)).length;
}

function jaccard(a: string[], b: string[]): number {
	const union = new Set([...a, ...b]);
	if (!union.size) return 0;
	return overlapCount(a, b) / union.size;
}

function daysBetween(a: string | null | undefined, b: string | null | undefined): number | null {
	if (!a || !b) return null;
	const aMs = Date.parse(a);
	const bMs = Date.parse(b);
	if (!Number.isFinite(aMs) || !Number.isFinite(bMs)) return null;
	return Math.abs(aMs - bMs) / (24 * 60 * 60 * 1000);
}

function hasOpposingAction(aTokens: string[], bTokens: string[]): boolean {
	const aSet = new Set(aTokens);
	const bSet = new Set(bTokens);
	return TASK_PAIR_OPPOSING_TERMS.some(
		([left, right]) =>
			(aSet.has(left) && bSet.has(right)) || (aSet.has(right) && bSet.has(left))
	);
}

/**
 * Deterministic shortlist for task-conflict LLM classification. The model no
 * longer scans all open tasks and invents pair coverage; it only classifies
 * pairs with concrete signals (title overlap, same goal/date with overlap, or
 * opposing action language). This keeps coverage auditable and reduces noise.
 */
export function buildTaskConflictCandidatePairs(
	tasks: LoopTask[],
	maxPairs = 20
): TaskConflictCandidatePair[] {
	const candidates: TaskConflictCandidatePair[] = [];
	const prepared = tasks.map((task) => {
		const titleTokens = tokenizeTaskText(task.title);
		return {
			task,
			titleTokens,
			descriptionTokens: tokenizeTaskText(task.description),
			normalizedTitle: normalizedTaskTitle(task.title),
			goalNames: new Set((task.goal_names ?? []).map((goal) => goal.toLowerCase()))
		};
	});

	for (let i = 0; i < prepared.length; i += 1) {
		for (let j = i + 1; j < prepared.length; j += 1) {
			const left = prepared[i];
			const right = prepared[j];
			const titleOverlap = overlapCount(left.titleTokens, right.titleTokens);
			const titleSimilarity = jaccard(left.titleTokens, right.titleTokens);
			const descriptionOverlap = overlapCount(
				left.descriptionTokens,
				right.descriptionTokens
			);
			const sameGoal =
				left.goalNames.size > 0 &&
				Array.from(left.goalNames).some((goal) => right.goalNames.has(goal));
			const dueDistanceDays = daysBetween(left.task.due_at, right.task.due_at);
			const closeDueDates = dueDistanceDays !== null && dueDistanceDays <= 1;
			const containsTitle =
				Boolean(left.normalizedTitle && right.normalizedTitle) &&
				(left.normalizedTitle.includes(right.normalizedTitle) ||
					right.normalizedTitle.includes(left.normalizedTitle));
			const opposingAction = hasOpposingAction(left.titleTokens, right.titleTokens);

			let score = titleOverlap * 3 + titleSimilarity * 4 + Math.min(descriptionOverlap, 2);
			const reasons: string[] = [];
			if (titleOverlap >= 2 || titleSimilarity >= 0.34) {
				reasons.push(
					`title overlap (${titleOverlap} shared term${titleOverlap === 1 ? '' : 's'})`
				);
			}
			if (containsTitle) {
				score += 4;
				reasons.push('one title contains the other');
			}
			if (sameGoal && titleOverlap >= 1) {
				score += 2;
				reasons.push('same goal linkage');
			}
			if (closeDueDates && titleOverlap >= 1) {
				score += 1.5;
				reasons.push('nearby due dates');
			}
			if (opposingAction && titleOverlap >= 1) {
				score += 4;
				reasons.push('opposing action words');
			}

			if (reasons.length && score >= 4) {
				candidates.push({
					taskAId: left.task.id,
					taskBId: right.task.id,
					score: Number(score.toFixed(3)),
					reasons
				});
			}
		}
	}

	return candidates
		.sort(
			(a, b) =>
				b.score - a.score ||
				taskPairKey(a.taskAId, a.taskBId).localeCompare(taskPairKey(b.taskAId, b.taskBId))
		)
		.slice(0, maxPairs);
}

/**
 * Stable, order-insensitive identity for a suggestion, derived from the entities
 * its operations target — NOT its (regenerated-every-run) title. Two runs that
 * flag the same task pair or the same document produce the same key, so a fresh
 * proposal can be matched against already-open / already-decided suggestions and
 * dropped before insert. Returns null when no deterministic key exists (drift is
 * informational and operation-free), in which case prompt suppression is the only
 * guard. See project-loops-flow-audit-2026-07-04 §3/§4.
 */
export function suggestionSuppressionKey(input: {
	kind: string;
	operations: LoopOperation[] | null | undefined;
}): string | null {
	const ops = Array.isArray(input.operations) ? input.operations : [];
	switch (input.kind) {
		case 'task_conflict': {
			const taskIds: Array<string | null> = [];
			for (const op of ops) {
				const args = (op?.args ?? {}) as Record<string, unknown>;
				taskIds.push(typeof args.task_id === 'string' ? args.task_id : null);
				const props =
					args.props && typeof args.props === 'object'
						? (args.props as Record<string, unknown>)
						: null;
				taskIds.push(
					props && typeof props.loop_conflict_with_task_id === 'string'
						? props.loop_conflict_with_task_id
						: null
				);
			}
			const ids = normalizeEntityIds(taskIds);
			return ids.length ? `task_conflict:${ids.join('|')}` : null;
		}
		case 'doc_org':
		case 'doc_outdated': {
			const docIds = normalizeEntityIds(
				ops.map((op) => {
					const args = (op?.args ?? {}) as Record<string, unknown>;
					return typeof args.document_id === 'string' ? args.document_id : null;
				})
			);
			return docIds.length ? `${input.kind}:${docIds.join('|')}` : null;
		}
		default:
			return null;
	}
}

function truncate(value: unknown, max = 240): string | undefined {
	if (typeof value !== 'string') return undefined;
	const text = value.trim();
	if (!text) return undefined;
	return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function stringList(value: unknown, maxItems = 4): string[] | undefined {
	const raw = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
	const items = raw
		.map((item) => truncate(item, 180))
		.filter((item): item is string => Boolean(item))
		.slice(0, maxItems);
	return items.length ? items : undefined;
}

function sanitizeEvidenceRefs(rawRefs: unknown, ctx: LoopContext): ProjectSuggestionEvidenceRef[] {
	if (!Array.isArray(rawRefs)) return [];

	const documentsById = new Map(ctx.documents.map((d) => [d.id, d]));
	const tasksById = new Map(ctx.tasks.map((t) => [t.id, t]));
	const refs: ProjectSuggestionEvidenceRef[] = [];

	for (const raw of rawRefs.slice(0, 6)) {
		if (!raw || typeof raw !== 'object') continue;
		const ref = raw as RawEvidenceRef;
		const entityType = EVIDENCE_TYPES.has(ref.entity_type as ProjectSuggestionEvidenceType)
			? (ref.entity_type as ProjectSuggestionEvidenceType)
			: 'unknown';
		const entityId = typeof ref.entity_id === 'string' ? ref.entity_id : undefined;

		let knownTitle: string | undefined;
		let knownUpdatedAt: string | null | undefined;
		if (entityType === 'document') {
			if (!entityId || !documentsById.has(entityId)) continue;
			const doc = documentsById.get(entityId);
			knownTitle = doc?.title;
			knownUpdatedAt = doc?.updated_at;
		}
		if (entityType === 'task') {
			if (!entityId || !tasksById.has(entityId)) continue;
			const task = tasksById.get(entityId);
			knownTitle = task?.title;
			knownUpdatedAt = task?.updated_at;
		}

		const title = truncate(knownTitle ?? ref.title, 160);
		if (!title) continue;

		refs.push({
			entity_type: entityType,
			...(entityId ? { entity_id: entityId } : {}),
			title,
			...(truncate(ref.reason, 220) ? { reason: truncate(ref.reason, 220) } : {}),
			...(truncate(ref.excerpt, 240) ? { excerpt: truncate(ref.excerpt, 240) } : {}),
			...(knownUpdatedAt || ref.updated_at
				? { updated_at: knownUpdatedAt ?? ref.updated_at }
				: {})
		});
	}

	return refs;
}

function sanitizePreview(rawPreview: unknown): ProjectSuggestionPreview | undefined {
	if (!rawPreview || typeof rawPreview !== 'object') return undefined;
	const raw = rawPreview as RawPreview;
	const summary = truncate(raw.summary, 260);
	if (!summary) return undefined;
	const kind = PREVIEW_KINDS.has(raw.kind as NonNullable<ProjectSuggestionPreview['kind']>)
		? (raw.kind as NonNullable<ProjectSuggestionPreview['kind']>)
		: 'generic';

	return {
		kind,
		summary,
		...(stringList(raw.before) ? { before: stringList(raw.before) } : {}),
		...(stringList(raw.after) ? { after: stringList(raw.after) } : {}),
		...(truncate(raw.impact, 220) ? { impact: truncate(raw.impact, 220) } : {})
	};
}

/**
 * Sanitize a model-proposed operation set against a known tool allowlist and
 * the known document ids. project_id is always forced to the loop's project so
 * the model can't target another project. Operations that reference unknown
 * documents or disallowed tools are dropped.
 */
function sanitizeOperations(
	rawOps: RawSuggestion['operations'],
	params: {
		projectId: string;
		allowedTools: Set<string>;
		knownDocIds?: Set<string>;
		knownTaskIds?: Set<string>;
	}
): LoopOperation[] {
	if (!Array.isArray(rawOps)) return [];
	const ops: LoopOperation[] = [];
	for (const raw of rawOps) {
		if (!raw || typeof raw.tool !== 'string') continue;
		if (!params.allowedTools.has(raw.tool)) continue;
		const args: Record<string, unknown> = { ...(raw.args ?? {}) };
		args.project_id = params.projectId;

		const docId = typeof args.document_id === 'string' ? args.document_id : null;
		if (docId && params.knownDocIds && !params.knownDocIds.has(docId)) continue;
		const parentId = typeof args.new_parent_id === 'string' ? args.new_parent_id : null;
		if (parentId && params.knownDocIds && !params.knownDocIds.has(parentId)) continue;
		const taskId = typeof args.task_id === 'string' ? args.task_id : null;
		if (taskId && params.knownTaskIds && !params.knownTaskIds.has(taskId)) continue;
		if (raw.tool === 'update_onto_task' && !taskId) continue;
		if (raw.tool === 'update_onto_document' && !docId) continue;
		if (raw.tool === 'create_onto_task') {
			if (typeof args.title !== 'string' || !args.title.trim()) continue;
		}

		ops.push({
			tool: raw.tool,
			args,
			label: typeof raw.label === 'string' ? raw.label : undefined
		});
	}
	return ops;
}

async function callGenerator(params: {
	llm: SmartLLMService;
	userId: string;
	chatSessionId?: string;
	projectId: string;
	runId?: string;
	generator: Exclude<ProjectLoopOperationType, 'project_loop_brief'>;
	systemPrompt: string;
	userPrompt: string;
	onUsage: (event: UsageEvent) => Promise<void>;
}): Promise<RawSuggestion[]> {
	const result = await params.llm.getJSONResponse<RawSuggestionEnvelope>({
		systemPrompt: params.systemPrompt,
		userPrompt: params.userPrompt,
		userId: params.userId,
		profile: 'balanced',
		validation: { retryOnParseError: true, maxRetries: 2 },
		operationType: params.generator,
		projectId: params.projectId,
		chatSessionId: params.chatSessionId,
		metadata: {
			project_loop: true,
			project_loop_run_id: params.runId ?? null,
			project_loop_generator: params.generator,
			onto_project_id: params.projectId
		},
		onUsage: params.onUsage
	});
	return Array.isArray(result?.suggestions) ? result.suggestions : [];
}

async function callBriefGenerator(params: {
	llm: SmartLLMService;
	userId: string;
	chatSessionId?: string;
	projectId: string;
	runId?: string;
	systemPrompt: string;
	userPrompt: string;
	onUsage: (event: UsageEvent) => Promise<void>;
}): Promise<Partial<ProjectLoopBrief> | null> {
	const result = await params.llm.getJSONResponse<RawBriefEnvelope>({
		systemPrompt: params.systemPrompt,
		userPrompt: params.userPrompt,
		userId: params.userId,
		profile: 'balanced',
		validation: { retryOnParseError: true, maxRetries: 2 },
		operationType: 'project_loop_brief',
		projectId: params.projectId,
		chatSessionId: params.chatSessionId,
		metadata: {
			project_loop: true,
			project_loop_brief: true,
			project_loop_run_id: params.runId ?? null,
			project_loop_generator: 'project_loop_brief',
			onto_project_id: params.projectId
		},
		onUsage: params.onUsage
	});
	return result?.brief && typeof result.brief === 'object' ? result.brief : null;
}

function describeDocuments(documents: LoopDocument[]): string {
	if (!documents.length) return '(none)';
	return documents
		.map((d) => {
			const parent = d.parent_id ? ` parent=${d.parent_id}` : ' parent=ROOT';
			const desc = d.description ? ` — ${d.description.slice(0, 140)}` : '';
			return `- [${d.id}] "${d.title}" (type=${d.type_key ?? 'n/a'}, state=${d.state_key ?? 'n/a'}, updated=${d.updated_at ?? 'n/a'}${parent})${desc}`;
		})
		.join('\n');
}

function describeTasks(tasks: LoopTask[]): string {
	if (!tasks.length) return '(none)';
	return tasks
		.map((t) => {
			const desc = t.description ? ` — ${t.description.slice(0, 160)}` : '';
			const metadata = [
				`state=${t.state_key ?? 'n/a'}`,
				t.type_key ? `type=${t.type_key}` : null,
				t.priority !== null && t.priority !== undefined ? `priority=${t.priority}` : null,
				t.start_at ? `start=${t.start_at}` : null,
				t.due_at ? `due=${t.due_at}` : null,
				t.updated_at ? `updated=${t.updated_at}` : 'updated=n/a',
				t.goal_names?.length ? `goals=${t.goal_names.join(', ')}` : null
			].filter(Boolean);
			return `- [${t.id}] "${t.title}" (${metadata.join(', ')})${desc}`;
		})
		.join('\n');
}

function describeTaskConflictCandidatePairs(
	pairs: TaskConflictCandidatePair[],
	ctx: LoopContext
): string {
	if (!pairs.length) return '(none)';
	const taskById = new Map(ctx.tasks.map((task) => [task.id, task]));
	return pairs
		.map((pair, index) => {
			const taskA = taskById.get(pair.taskAId);
			const taskB = taskById.get(pair.taskBId);
			return `- Pair ${index + 1}: [${pair.taskAId}] "${taskA?.title ?? 'Unknown'}" <-> [${pair.taskBId}] "${taskB?.title ?? 'Unknown'}" (signals=${pair.reasons.join('; ')}, score=${pair.score})`;
		})
		.join('\n');
}

function describePriorDecisions(decisions: LoopPriorDecision[] | undefined): string {
	if (!decisions?.length) return '(none)';
	return decisions
		.map((decision) => {
			const note = truncate(decision.note, 180);
			const reason = truncate(decision.reason, 80);
			const feedback = [
				reason ? `reason=${reason}` : null,
				note ? `note=${note}` : null
			].filter(Boolean);
			const suffix = feedback.length ? ` — ${feedback.join('; ')}` : '';
			const decidedAt = decision.decided_at ? `, decided=${decision.decided_at}` : '';
			return `- ${decision.kind}: "${decision.title}" (${decision.status}${decidedAt})${suffix}`;
		})
		.join('\n');
}

function priorDecisionContext(ctx: LoopContext): string {
	return `Previously reviewed decisions:\n${describePriorDecisions(ctx.priorDecisions)}`;
}

function docMoveUndoOperations(operations: LoopOperation[], ctx: LoopContext): LoopOperation[] {
	const parentById = new Map(ctx.documents.map((doc) => [doc.id, doc.parent_id]));
	const undo: LoopOperation[] = [];
	for (const op of operations) {
		if (op.tool !== 'move_document_in_tree') continue;
		const documentId = typeof op.args.document_id === 'string' ? op.args.document_id : null;
		if (!documentId || !parentById.has(documentId)) continue;
		undo.push({
			tool: 'move_document_in_tree',
			args: {
				document_id: documentId,
				new_parent_id: parentById.get(documentId) ?? null,
				new_position: 0,
				project_id: ctx.projectId
			},
			label: 'Move document back to its previous parent'
		});
	}
	return undo;
}

function outdatedFlagUndoOperations(
	operations: LoopOperation[],
	ctx: LoopContext
): LoopOperation[] {
	return operations
		.map((op) => (typeof op.args.document_id === 'string' ? op.args.document_id : null))
		.filter((documentId): documentId is string =>
			Boolean(documentId && ctx.documents.some((doc) => doc.id === documentId))
		)
		.map((documentId) => ({
			tool: 'update_onto_document',
			args: {
				document_id: documentId,
				project_id: ctx.projectId,
				props: {
					loop_flagged_outdated: false,
					loop_outdated_reason: null
				}
			},
			label: 'Remove outdated-document flag'
		}));
}

function taskConflictUndoOperations(
	operations: LoopOperation[],
	ctx: LoopContext
): LoopOperation[] {
	return operations
		.map((op) => (typeof op.args.task_id === 'string' ? op.args.task_id : null))
		.filter((taskId): taskId is string =>
			Boolean(taskId && ctx.tasks.some((task) => task.id === taskId))
		)
		.map((taskId) => ({
			tool: 'update_onto_task',
			args: {
				task_id: taskId,
				project_id: ctx.projectId,
				props: {
					loop_flagged_conflict: false,
					loop_conflict_kind: null,
					loop_conflict_with_task_id: null,
					loop_conflict_reason: null
				}
			},
			label: 'Remove task-conflict flag'
		}));
}

function taskConflictPair(
	operation: LoopOperation
): { taskId: string; otherTaskId: string } | null {
	if (operation.tool !== 'update_onto_task') return null;
	const taskId = typeof operation.args.task_id === 'string' ? operation.args.task_id : null;
	const props =
		operation.args.props && typeof operation.args.props === 'object'
			? (operation.args.props as Record<string, unknown>)
			: null;
	const otherTaskId =
		props && typeof props.loop_conflict_with_task_id === 'string'
			? props.loop_conflict_with_task_id
			: null;
	const kind =
		props && typeof props.loop_conflict_kind === 'string' ? props.loop_conflict_kind : null;

	if (!taskId || !otherTaskId || taskId === otherTaskId) return null;
	if (kind && !TASK_CONFLICT_KINDS.has(kind)) return null;
	return { taskId, otherTaskId };
}

function filterTaskConflictOperations(
	operations: LoopOperation[],
	params: {
		knownTaskIds: Set<string>;
		evidenceRefs: ProjectSuggestionEvidenceRef[];
		candidatePairKeys: Set<string>;
	}
): LoopOperation[] {
	const evidenceTaskIds = new Set(
		params.evidenceRefs
			.filter((ref) => ref.entity_type === 'task' && typeof ref.entity_id === 'string')
			.map((ref) => ref.entity_id as string)
	);

	return operations.filter((operation) => {
		const pair = taskConflictPair(operation);
		if (!pair) return false;
		if (!params.knownTaskIds.has(pair.taskId) || !params.knownTaskIds.has(pair.otherTaskId)) {
			return false;
		}
		if (!params.candidatePairKeys.has(taskPairKey(pair.taskId, pair.otherTaskId))) return false;
		return evidenceTaskIds.has(pair.taskId) && evidenceTaskIds.has(pair.otherTaskId);
	});
}

function sanitizeBrief(raw: Partial<ProjectLoopBrief> | null, ctx: LoopContext): ProjectLoopBrief {
	const fallback = buildHeuristicProjectLoopBrief(ctx);
	if (!raw) return fallback;
	const list = (value: unknown, maxItems = 5): string[] =>
		Array.isArray(value)
			? value
					.map((item) => truncate(item, 180))
					.filter((item): item is string => Boolean(item))
					.slice(0, maxItems)
			: [];

	return {
		current_goal: truncate(raw.current_goal, 220) ?? fallback.current_goal,
		recent_changes: list(raw.recent_changes).length
			? list(raw.recent_changes)
			: fallback.recent_changes,
		open_decisions: list(raw.open_decisions),
		stale_assumptions: list(raw.stale_assumptions),
		contradictions_or_drift: list(raw.contradictions_or_drift),
		next_best_action: truncate(raw.next_best_action, 220) ?? fallback.next_best_action,
		generated_at: new Date().toISOString(),
		source: 'llm'
	};
}

const PROJECT_HEADER = (ctx: LoopContext): string => {
	const goals = ctx.goals.length
		? ctx.goals
				.map((g) => `- ${g.name}${g.description ? `: ${g.description.slice(0, 120)}` : ''}`)
				.join('\n')
		: '(none)';
	return `Project: ${ctx.projectName}\nDescription: ${ctx.projectDescription ?? '(none)'}\nGoals:\n${goals}`;
};

export async function generateProjectBrief(params: {
	llm: SmartLLMService;
	ctx: LoopContext;
	userId: string;
	chatSessionId?: string;
	runId?: string;
	onUsage: (event: UsageEvent) => Promise<void>;
}): Promise<ProjectLoopBrief> {
	const { ctx } = params;
	const systemPrompt = [
		'You write a compact BuildOS Project Review brief.',
		'Use only the project evidence provided. Be specific, cautious, and concise.',
		'Do not invent dates, documents, tasks, or facts.',
		'Respect previously reviewed decisions; do not present dismissed/applied items as new unless current evidence materially changes them.',
		'',
		'Return ONLY JSON: { "brief": {',
		'  "current_goal": string|null,',
		'  "recent_changes": string[],',
		'  "open_decisions": string[],',
		'  "stale_assumptions": string[],',
		'  "contradictions_or_drift": string[],',
		'  "next_best_action": string|null',
		'} }'
	].join('\n');

	const userPrompt = `${PROJECT_HEADER(ctx)}\n\nCurrent document tree:\n${ctx.docStructureSummary}\n\nDocuments:\n${describeDocuments(ctx.documents)}\n\nOpen tasks:\n${describeTasks(ctx.tasks)}\n\n${priorDecisionContext(ctx)}`;

	try {
		const raw = await callBriefGenerator({
			llm: params.llm,
			userId: params.userId,
			chatSessionId: params.chatSessionId,
			projectId: ctx.projectId,
			runId: params.runId,
			systemPrompt,
			userPrompt,
			onUsage: params.onUsage
		});
		return sanitizeBrief(raw, ctx);
	} catch (error) {
		console.warn(
			'[ProjectLoops] brief generator failed, falling back to heuristic:',
			error instanceof Error ? error.message : error
		);
		return buildHeuristicProjectLoopBrief(ctx);
	}
}

/**
 * DOC ORGANIZATION (tier 2)
 * Proposes nesting/reordering of EXISTING documents in the project's doc tree.
 * v1 only moves existing documents under existing documents — it does not create
 * new container documents (that requires resolving a not-yet-created id at replay
 * time). Each suggestion bundles the move operations for one logical grouping.
 */
export async function generateDocOrganization(params: {
	llm: SmartLLMService;
	ctx: LoopContext;
	userId: string;
	chatSessionId?: string;
	runId?: string;
	onUsage: (event: UsageEvent) => Promise<void>;
}): Promise<ProposedSuggestion[]> {
	const { ctx } = params;
	if (ctx.documents.length < 3) return []; // nothing meaningful to organize

	const systemPrompt = [
		'You are a BuildOS project librarian. You reorganize a flat pile of project',
		'documents into a clean, shallow hierarchy by nesting related documents under',
		'a natural "hub" document and ordering siblings sensibly.',
		'',
		'Rules:',
		'- You may ONLY move EXISTING documents. Do not invent documents or ids.',
		'- A parent must be one of the existing document ids provided.',
		'- Prefer shallow trees (1-2 levels). Group only when there is a clear theme.',
		'- Do NOT propose a move that keeps a document exactly where it already is.',
		'- Do NOT re-raise a previously reviewed decision unless materially new evidence changes the recommendation.',
		'- Each suggestion = one coherent grouping, with its move operations.',
		'',
		'The only tool you may emit is move_document_in_tree with args:',
		'{ "document_id": "<uuid>", "new_parent_id": "<uuid|null>", "new_position": <int> }',
		'(project_id is added automatically — do not include it.)',
		'',
		'Return ONLY JSON: { "suggestions": [ {',
		'  "title": string,            // e.g. "Group research notes under \\"Research\\""',
		'  "why_now": string,          // why this surfaced in this review',
		'  "rationale": string,        // why this grouping helps',
		'  "confidence": number,       // 0..1',
		'  "evidence_refs": [ { "entity_type": "document", "entity_id": "<uuid>", "reason": string } ],',
		'  "preview": { "kind": "doc_tree", "summary": string, "before": [string], "after": [string], "impact": string },',
		'  "operations": [ { "tool": "move_document_in_tree", "args": {…}, "label": string } ]',
		'} ] }',
		'If the documents are already well organized, return { "suggestions": [] }.'
	].join('\n');

	const userPrompt = `${PROJECT_HEADER(ctx)}\n\nCurrent document tree:\n${ctx.docStructureSummary}\n\nDocuments:\n${describeDocuments(ctx.documents)}\n\n${priorDecisionContext(ctx)}`;

	const raw = await callGenerator({
		llm: params.llm,
		userId: params.userId,
		chatSessionId: params.chatSessionId,
		projectId: ctx.projectId,
		runId: params.runId,
		generator: 'project_loop_doc_organization',
		systemPrompt,
		userPrompt,
		onUsage: params.onUsage
	});

	const knownDocIds = new Set(ctx.documents.map((d) => d.id));
	const allowedTools = new Set(['move_document_in_tree']);

	const suggestions: ProposedSuggestion[] = [];
	for (const s of raw) {
		const operations = sanitizeOperations(s.operations, {
			projectId: ctx.projectId,
			allowedTools,
			knownDocIds
		});
		if (!operations.length || !s.title) continue;
		suggestions.push({
			kind: 'doc_org',
			risk_tier: 2,
			title: s.title.slice(0, 200),
			rationale: s.rationale,
			why_now: truncate(s.why_now, 220),
			confidence: typeof s.confidence === 'number' ? s.confidence : undefined,
			evidence_refs: sanitizeEvidenceRefs(s.evidence_refs, ctx),
			preview: sanitizePreview(s.preview),
			freshness_state: 'fresh',
			reversible: true,
			operations,
			undo_operations: docMoveUndoOperations(operations, ctx)
		});
	}
	return suggestions;
}

/**
 * OUTDATED DOCUMENTS (tier 1)
 * Flags documents that look stale/superseded. The applied operation is a
 * non-destructive props flag on the document (reversible). v1 flags one
 * document per suggestion so each can be reviewed independently.
 */
export async function generateOutdatedDocs(params: {
	llm: SmartLLMService;
	ctx: LoopContext;
	userId: string;
	chatSessionId?: string;
	runId?: string;
	onUsage: (event: UsageEvent) => Promise<void>;
}): Promise<ProposedSuggestion[]> {
	const { ctx } = params;
	if (ctx.documents.length === 0) return [];

	const systemPrompt = [
		'You are a BuildOS project archivist. Identify documents that appear OUTDATED',
		'or SUPERSEDED relative to the project goals and recent activity (e.g. old plans,',
		'drafts overtaken by newer docs, notes whose subject is clearly done).',
		'Be conservative — only flag documents you are reasonably confident are stale.',
		'Do not re-raise documents that were previously dismissed/applied unless materially new evidence changes the stale/outdated judgment.',
		'',
		'For each flagged document emit ONE suggestion whose single operation marks the',
		'document with a non-destructive props flag using update_onto_document:',
		'{ "document_id": "<uuid>", "props": { "loop_flagged_outdated": true, "loop_outdated_reason": "<short reason>" } }',
		'(project_id is added automatically — do not include it. Do not change content or state.)',
		'',
		'Return ONLY JSON: { "suggestions": [ {',
		'  "title": string,        // e.g. "Looks outdated: \\"Q1 launch plan\\""',
		'  "why_now": string,      // why this document surfaced in this review',
		'  "rationale": string,    // why it seems stale',
		'  "confidence": number,   // 0..1',
		'  "evidence_refs": [ { "entity_type": "document"|"task", "entity_id": "<uuid>", "reason": string } ],',
		'  "preview": { "kind": "outdated_flag", "summary": string, "impact": string },',
		'  "operations": [ { "tool": "update_onto_document", "args": {…}, "label": string } ]',
		'} ] }',
		'If nothing looks outdated, return { "suggestions": [] }.'
	].join('\n');

	const userPrompt = `${PROJECT_HEADER(ctx)}\n\nDocuments:\n${describeDocuments(ctx.documents)}\n\nRecent tasks (signal of where the project is now):\n${
		ctx.tasks.length
			? ctx.tasks
					.map(
						(t) =>
							`- "${t.title}" (state=${t.state_key ?? 'n/a'}, updated=${t.updated_at ?? 'n/a'})${t.description ? ` — ${t.description.slice(0, 160)}` : ''}`
					)
					.join('\n')
			: '(none)'
	}\n\n${priorDecisionContext(ctx)}`;

	const raw = await callGenerator({
		llm: params.llm,
		userId: params.userId,
		chatSessionId: params.chatSessionId,
		projectId: ctx.projectId,
		runId: params.runId,
		generator: 'project_loop_outdated_docs',
		systemPrompt,
		userPrompt,
		onUsage: params.onUsage
	});

	const knownDocIds = new Set(ctx.documents.map((d) => d.id));
	const allowedTools = new Set(['update_onto_document']);

	const suggestions: ProposedSuggestion[] = [];
	for (const s of raw) {
		const operations = sanitizeOperations(s.operations, {
			projectId: ctx.projectId,
			allowedTools,
			knownDocIds
		});
		// Outdated-doc operations don't carry project_id in the tool schema, but
		// forcing it is harmless and ignored by update_onto_document.
		if (!operations.length || !s.title) continue;
		suggestions.push({
			kind: 'doc_outdated',
			risk_tier: 1,
			title: s.title.slice(0, 200),
			rationale: s.rationale,
			why_now: truncate(s.why_now, 220),
			confidence: typeof s.confidence === 'number' ? s.confidence : undefined,
			evidence_refs: sanitizeEvidenceRefs(s.evidence_refs, ctx),
			preview: sanitizePreview(s.preview),
			freshness_state: 'fresh',
			reversible: true,
			operations,
			undo_operations: outdatedFlagUndoOperations(operations, ctx)
		});
	}
	return suggestions;
}

/**
 * DRIFT (tier 2 informational)
 * Surfaces evidence-backed mismatches between the stated project intent and
 * the current docs/tasks. Drift items are no-op review decisions: applying them
 * acknowledges the item; dismissing with feedback teaches later runs.
 */
export async function generateDrift(params: {
	llm: SmartLLMService;
	ctx: LoopContext;
	userId: string;
	chatSessionId?: string;
	runId?: string;
	onUsage: (event: UsageEvent) => Promise<void>;
}): Promise<ProposedSuggestion[]> {
	const { ctx } = params;
	if (ctx.documents.length === 0 && ctx.tasks.length === 0) return [];

	const systemPrompt = [
		'You are a BuildOS project reviewer. Find PROJECT DRIFT: places where',
		'the stated goals/description and the current documents or tasks appear',
		'to point in different directions, contain stale assumptions, or leave an',
		'important decision unresolved.',
		'',
		'Rules:',
		'- Be conservative. Only raise drift that is supported by specific evidence.',
		'- Do NOT propose writes. Drift items are informational review decisions.',
		'- Prefer 0-3 high-signal items.',
		'- Attach evidence_refs from documents, tasks, goals, or project.',
		'- Do NOT re-raise previously reviewed drift unless materially new evidence changes the assessment.',
		'',
		'Return ONLY JSON: { "suggestions": [ {',
		'  "title": string,',
		'  "why_now": string,',
		'  "rationale": string,',
		'  "confidence": number,',
		'  "evidence_refs": [ { "entity_type": "project"|"goal"|"document"|"task", "entity_id": "<uuid optional>", "title": string, "reason": string } ],',
		'  "preview": { "kind": "drift", "summary": string, "before": [string], "after": [string], "impact": string },',
		'  "operations": []',
		'} ] }',
		'If no clear drift exists, return { "suggestions": [] }.'
	].join('\n');

	const userPrompt = `${PROJECT_HEADER(ctx)}\n\nDocuments:\n${describeDocuments(ctx.documents)}\n\nOpen tasks:\n${describeTasks(ctx.tasks)}\n\n${priorDecisionContext(ctx)}`;

	const raw = await callGenerator({
		llm: params.llm,
		userId: params.userId,
		chatSessionId: params.chatSessionId,
		projectId: ctx.projectId,
		runId: params.runId,
		generator: 'project_loop_drift',
		systemPrompt,
		userPrompt,
		onUsage: params.onUsage
	});

	const suggestions: ProposedSuggestion[] = [];
	for (const s of raw.slice(0, 5)) {
		if (!s.title) continue;
		const evidenceRefs = sanitizeEvidenceRefs(s.evidence_refs, ctx);
		if (!evidenceRefs.length) continue;
		suggestions.push({
			kind: 'drift',
			risk_tier: 2,
			title: s.title.slice(0, 200),
			rationale: s.rationale,
			why_now: truncate(s.why_now, 220),
			confidence: typeof s.confidence === 'number' ? s.confidence : undefined,
			evidence_refs: evidenceRefs,
			preview: sanitizePreview(s.preview),
			freshness_state: 'fresh',
			reversible: true,
			operations: [],
			undo_operations: []
		});
	}
	return suggestions;
}

/**
 * TASK CONFLICTS (tier 1)
 * Flags duplicate/contradictory open tasks non-destructively. The operation
 * writes conflict metadata to one task; it does not delete, merge, or complete.
 */
export async function generateTaskConflicts(params: {
	llm: SmartLLMService;
	ctx: LoopContext;
	userId: string;
	chatSessionId?: string;
	runId?: string;
	onUsage: (event: UsageEvent) => Promise<void>;
}): Promise<ProposedSuggestion[]> {
	const { ctx } = params;
	if (ctx.tasks.length < 2) return [];
	const candidatePairs = buildTaskConflictCandidatePairs(ctx.tasks);
	if (!candidatePairs.length) return [];
	const candidatePairKeys = new Set(
		candidatePairs.map((pair) => taskPairKey(pair.taskAId, pair.taskBId))
	);

	const systemPrompt = [
		'You are a BuildOS task reviewer. Find open tasks that appear duplicated,',
		'contradictory, or mutually blocking by classifying the provided candidate pairs',
		'against the task list and project goals.',
		'',
		'Rules:',
		'- Be conservative. Prefer no suggestion over a weak match.',
		'- Do not delete, merge, or mark tasks done.',
		'- Do NOT re-raise a task conflict that was already reviewed unless materially new evidence changes the conflict.',
		'- Only raise conflicts from the candidate pairs listed in the prompt.',
		'- Do not treat parent/subtask relationships or intentionally parallel work as duplicates.',
		'- For each conflict, emit one non-destructive update_onto_task operation',
		'  that flags ONE task with props:',
		'  { "loop_flagged_conflict": true, "loop_conflict_kind": "duplicate|contradiction|blocked_by", "loop_conflict_with_task_id": "<other task id>", "loop_conflict_reason": "<short reason>" }',
		'- Only use task ids provided in the task list.',
		'',
		'Return ONLY JSON: { "suggestions": [ {',
		'  "title": string,',
		'  "why_now": string,',
		'  "rationale": string,',
		'  "confidence": number,',
		'  "evidence_refs": [ { "entity_type": "task", "entity_id": "<uuid>", "reason": string } ],',
		'  "preview": { "kind": "task_merge", "summary": string, "before": [string], "after": [string], "impact": string },',
		'  "operations": [ { "tool": "update_onto_task", "args": { "task_id": "<uuid>", "props": {…} }, "label": string } ]',
		'} ] }',
		'If no clear conflicts exist, return { "suggestions": [] }.'
	].join('\n');

	const userPrompt = `${PROJECT_HEADER(ctx)}\n\nOpen tasks:\n${describeTasks(ctx.tasks)}\n\nCandidate pairs to classify:\n${describeTaskConflictCandidatePairs(candidatePairs, ctx)}\n\n${priorDecisionContext(ctx)}`;

	const raw = await callGenerator({
		llm: params.llm,
		userId: params.userId,
		chatSessionId: params.chatSessionId,
		projectId: ctx.projectId,
		runId: params.runId,
		generator: 'project_loop_task_conflicts',
		systemPrompt,
		userPrompt,
		onUsage: params.onUsage
	});

	const knownTaskIds = new Set(ctx.tasks.map((task) => task.id));
	const allowedTools = new Set(['update_onto_task']);

	const suggestions: ProposedSuggestion[] = [];
	for (const s of raw) {
		const sanitizedOperations = sanitizeOperations(s.operations, {
			projectId: ctx.projectId,
			allowedTools,
			knownTaskIds
		});
		const evidenceRefs = sanitizeEvidenceRefs(s.evidence_refs, ctx);
		if (evidenceRefs.filter((ref) => ref.entity_type === 'task').length < 2) continue;
		const operations = filterTaskConflictOperations(sanitizedOperations, {
			knownTaskIds,
			evidenceRefs,
			candidatePairKeys
		});
		if (operations.length !== 1 || !s.title) continue;
		suggestions.push({
			kind: 'task_conflict',
			risk_tier: 1,
			title: s.title.slice(0, 200),
			rationale: s.rationale,
			why_now: truncate(s.why_now, 220),
			confidence: typeof s.confidence === 'number' ? s.confidence : undefined,
			evidence_refs: evidenceRefs,
			preview: sanitizePreview(s.preview),
			freshness_state: 'fresh',
			reversible: true,
			operations,
			undo_operations: taskConflictUndoOperations(operations, ctx)
		});
	}
	return suggestions;
}
