// apps/worker/src/workers/project-loop/generators.ts
//
// LLM generators for the Project Loops reconciliation pass. Each generator
// produces ProposedSuggestion[] whose `operations` are declarative tool calls
// (validated against the real ChatToolExecutor write-tool arg shapes) that the
// web app replays on approval.
//
// v1 ships two generators: doc_org and doc_outdated. drift + task_conflict are
// later phases.

import type {
	LoopOperation,
	ProjectSuggestionEvidenceRef,
	ProjectSuggestionEvidenceType,
	ProjectSuggestionPreview,
	ProposedSuggestion
} from '@buildos/shared-types';
import type { SmartLLMService } from '../../lib/services/smart-llm-service';
import type { UsageEvent } from '../homework/engine/homeworkEngine';

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
	state_key: string | null;
	updated_at: string | null;
}

export interface LoopContext {
	projectId: string;
	projectName: string;
	projectDescription: string | null;
	goals: Array<{ name: string; description: string | null }>;
	documents: LoopDocument[];
	docStructureSummary: string;
	tasks: LoopTask[];
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
}

interface RawSuggestionEnvelope {
	suggestions?: RawSuggestion[];
}

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
	params: { projectId: string; allowedTools: Set<string>; knownDocIds: Set<string> }
): LoopOperation[] {
	if (!Array.isArray(rawOps)) return [];
	const ops: LoopOperation[] = [];
	for (const raw of rawOps) {
		if (!raw || typeof raw.tool !== 'string') continue;
		if (!params.allowedTools.has(raw.tool)) continue;
		const args: Record<string, unknown> = { ...(raw.args ?? {}) };
		args.project_id = params.projectId;

		const docId = typeof args.document_id === 'string' ? args.document_id : null;
		if (docId && !params.knownDocIds.has(docId)) continue;
		const parentId = typeof args.new_parent_id === 'string' ? args.new_parent_id : null;
		if (parentId && !params.knownDocIds.has(parentId)) continue;

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
		operationType: 'other',
		chatSessionId: params.chatSessionId,
		metadata: { project_loop: true, onto_project_id: params.projectId },
		onUsage: params.onUsage
	});
	return Array.isArray(result?.suggestions) ? result.suggestions : [];
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

const PROJECT_HEADER = (ctx: LoopContext): string => {
	const goals = ctx.goals.length
		? ctx.goals
				.map((g) => `- ${g.name}${g.description ? `: ${g.description.slice(0, 120)}` : ''}`)
				.join('\n')
		: '(none)';
	return `Project: ${ctx.projectName}\nDescription: ${ctx.projectDescription ?? '(none)'}\nGoals:\n${goals}`;
};

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

	const userPrompt = `${PROJECT_HEADER(ctx)}\n\nCurrent document tree:\n${ctx.docStructureSummary}\n\nDocuments:\n${describeDocuments(ctx.documents)}`;

	const raw = await callGenerator({
		llm: params.llm,
		userId: params.userId,
		chatSessionId: params.chatSessionId,
		projectId: ctx.projectId,
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
			reversible: false,
			operations
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
	onUsage: (event: UsageEvent) => Promise<void>;
}): Promise<ProposedSuggestion[]> {
	const { ctx } = params;
	if (ctx.documents.length === 0) return [];

	const systemPrompt = [
		'You are a BuildOS project archivist. Identify documents that appear OUTDATED',
		'or SUPERSEDED relative to the project goals and recent activity (e.g. old plans,',
		'drafts overtaken by newer docs, notes whose subject is clearly done).',
		'Be conservative — only flag documents you are reasonably confident are stale.',
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
							`- "${t.title}" (state=${t.state_key ?? 'n/a'}, updated=${t.updated_at ?? 'n/a'})`
					)
					.join('\n')
			: '(none)'
	}`;

	const raw = await callGenerator({
		llm: params.llm,
		userId: params.userId,
		chatSessionId: params.chatSessionId,
		projectId: ctx.projectId,
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
			operations
		});
	}
	return suggestions;
}
