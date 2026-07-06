// packages/shared-agent-ops/src/project-loops.ts
import { createHash } from 'node:crypto';
import type { LoopOperation, ProjectLoopBrief } from '@buildos/shared-types';

type AnySupabase = any;

/**
 * Cap on the number of documents fed into light-loop generator prompts (and the
 * whole-project fingerprint). Doc-heavy projects otherwise carry an unbounded
 * doc list into every LLM call, blowing prompt size/cost/latency. We keep the
 * most-recently-updated N. See project-loops-flow-audit-2026-07-04 §6 / Tier 1 #8.
 */
export const MAX_PROJECT_LOOP_CONTEXT_DOCUMENTS = 40;

/**
 * Recency (ms) of a raw graph document row, preferring updated_at then
 * created_at. Rows with neither sort last (0). Used to pick the most-recent N.
 */
export function projectLoopDocumentRecencyMs(row: {
	updated_at?: string | null;
	created_at?: string | null;
}): number {
	const parsed = Date.parse(row.updated_at ?? row.created_at ?? '');
	return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Stable queue dedup key for a project's light loop within one UTC calendar day.
 * Deliberately excludes the run id and trigger reason so a manual web trigger,
 * an activity burst, and the end-of-day cron collapse onto the same
 * add_queue_job dedup slot instead of double-running — closing the TOCTOU window
 * on the select-then-insert active-run guard (audit Tier 1 #5). add_queue_job
 * only dedups against pending/processing jobs, so a fresh run later the same day
 * (after the prior job completes) is still allowed. The web service and the
 * worker scheduler both key on this so all three triggers share one slot.
 */
export function projectLoopDedupKey(projectId: string, at: Date = new Date()): string {
	const day = at.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
	return `project-loop:${projectId}:${day}`;
}

/**
 * Stable queue dedup key for a project's complete-audit within one UTC day —
 * the audit analogue of projectLoopDedupKey. The evaluate-then-insert audit
 * guard has the same TOCTOU window as the light loop; a shared per-day slot
 * collapses concurrent manual/burst/scheduled audit triggers (audit Tier 1 #5).
 */
export function projectAuditDedupKey(projectId: string, at: Date = new Date()): string {
	const day = at.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
	return `project-audit:${projectId}:${day}`;
}

export interface ProjectLoopQueueMetadata {
	mode?: string;
	runId?: string;
	auditId?: string;
	projectId?: string;
	userId?: string;
	triggerReason?: string;
}

function readQueueMetadataString(
	record: Record<string, unknown>,
	key: keyof ProjectLoopQueueMetadata
): string | undefined {
	const value = record[key];
	return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function readProjectLoopQueueMetadata(metadata: unknown): ProjectLoopQueueMetadata {
	if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {};
	const record = metadata as Record<string, unknown>;
	return {
		mode: readQueueMetadataString(record, 'mode'),
		runId: readQueueMetadataString(record, 'runId'),
		auditId: readQueueMetadataString(record, 'auditId'),
		projectId: readQueueMetadataString(record, 'projectId'),
		userId: readQueueMetadataString(record, 'userId'),
		triggerReason: readQueueMetadataString(record, 'triggerReason')
	};
}

export interface ProjectLoopFingerprintGoal {
	name: string;
	description: string | null;
}

export interface ProjectLoopFingerprintDocument {
	id: string;
	title: string;
	state_key: string | null;
	updated_at: string | null;
	parent_id: string | null;
}

export interface ProjectLoopFingerprintTask {
	id: string;
	title: string;
	state_key: string | null;
	updated_at: string | null;
}

export interface ProjectLoopFingerprintContext {
	projectId: string;
	projectName: string;
	projectDescription: string | null;
	goals: ProjectLoopFingerprintGoal[];
	documents: ProjectLoopFingerprintDocument[];
	tasks: ProjectLoopFingerprintTask[];
}

function compareText(a: string | null | undefined, b: string | null | undefined): number {
	return (a ?? '').localeCompare(b ?? '');
}

export function buildProjectLoopSourceFingerprint(ctx: ProjectLoopFingerprintContext): string {
	return createHash('sha256')
		.update(
			JSON.stringify({
				project: {
					id: ctx.projectId,
					name: ctx.projectName,
					description: ctx.projectDescription
				},
				goals: [...ctx.goals]
					.sort(
						(a, b) =>
							compareText(a.name, b.name) || compareText(a.description, b.description)
					)
					.map((g) => ({ name: g.name, description: g.description })),
				documents: [...ctx.documents]
					.sort((a, b) => compareText(a.id, b.id))
					.map((d) => ({
						id: d.id,
						title: d.title,
						state_key: d.state_key,
						updated_at: d.updated_at,
						parent_id: d.parent_id
					})),
				tasks: [...ctx.tasks]
					.sort((a, b) => compareText(a.id, b.id))
					.map((t) => ({
						id: t.id,
						title: t.title,
						state_key: t.state_key,
						updated_at: t.updated_at
					}))
			})
		)
		.digest('hex');
}

// ---------------------------------------------------------------------------
// Per-suggestion (scoped) freshness fingerprints
//
// The original freshness guard hashed the WHOLE project (all goals + docs +
// first-20 tasks) once per run and stamped that on every suggestion, so ANY
// edit to ANY entity superseded the entire pending queue — prod showed a 100%
// supersede rate on applies. These helpers scope the fingerprint to just the
// entities a suggestion's operations MUTATE, so an edit to an unrelated entity
// no longer invalidates it. See project-loops-flow-audit-2026-07-04 (Tier 1 #4).
// ---------------------------------------------------------------------------

/** Current state of one entity a suggestion mutates, in fingerprint form. */
export interface ProjectLoopScopedEntity {
	kind: 'task' | 'document';
	id: string;
	title: string | null;
	state_key: string | null;
	updated_at: string | null;
	/** Document tree parent (null for tasks). */
	parent_id: string | null;
}

function dedupeSortedIds(ids: Array<string | null | undefined>): string[] {
	return Array.from(
		new Set(ids.filter((id): id is string => typeof id === 'string' && id.length > 0))
	).sort();
}

/**
 * The task/document ids a suggestion's operations directly mutate. We key on
 * operation TARGETS (not evidence refs): the freshness guard only needs to know
 * whether the entities we are about to WRITE have shifted. task_conflict writes
 * both the operation's `task_id` and the paired `props.loop_conflict_with_task_id`;
 * doc operations write `document_id`. Informational suggestions (drift,
 * audit_recommendation) carry no operations → no targets.
 */
export function extractProjectLoopSuggestionEntities(
	operations: LoopOperation[] | null | undefined
): { taskIds: string[]; docIds: string[] } {
	const ops = Array.isArray(operations) ? operations : [];
	const taskIds: Array<string | null> = [];
	const docIds: Array<string | null> = [];
	for (const op of ops) {
		const args = (op?.args ?? {}) as Record<string, unknown>;
		if (typeof args.task_id === 'string') taskIds.push(args.task_id);
		if (typeof args.document_id === 'string') docIds.push(args.document_id);
		const props =
			args.props && typeof args.props === 'object'
				? (args.props as Record<string, unknown>)
				: null;
		if (props && typeof props.loop_conflict_with_task_id === 'string') {
			taskIds.push(props.loop_conflict_with_task_id);
		}
	}
	return { taskIds: dedupeSortedIds(taskIds), docIds: dedupeSortedIds(docIds) };
}

/**
 * Deterministic hash of the CURRENT state of exactly the entities a suggestion
 * mutates. Order-insensitive. Returns null when the suggestion touches no
 * concrete entity — such suggestions get NO freshness guard (there is nothing
 * to apply against stale state). Both the worker (stamp at generation) and the
 * web decide paths (check at approval) call this over entity state loaded the
 * SAME way (loadProjectLoopSuggestionEntityStates), so the two values are
 * directly comparable.
 */
export function buildScopedSuggestionFingerprint(
	entities: ProjectLoopScopedEntity[]
): string | null {
	if (!entities.length) return null;
	const sorted = [...entities].sort(
		(a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id)
	);
	return createHash('sha256')
		.update(
			JSON.stringify(
				sorted.map((e) => ({
					kind: e.kind,
					id: e.id,
					title: e.title ?? null,
					state_key: e.state_key ?? null,
					updated_at: e.updated_at ?? null,
					parent_id: e.kind === 'document' ? (e.parent_id ?? null) : null
				}))
			)
		)
		.digest('hex');
}

/**
 * Load the current state of referenced tasks/documents by id (project-scoped).
 * Every requested id gets an entry: a missing entity (deleted, or a task that
 * was completed and fell out of scope) comes back with null fields — a distinct,
 * deterministic "gone" state that changes the fingerprint, so its suggestion is
 * correctly superseded. Loading by id (rather than reusing a capped snapshot)
 * keeps the stamp and the check sourcing entity state identically.
 */
export async function loadProjectLoopSuggestionEntityStates(
	supabase: AnySupabase,
	projectId: string,
	refs: { taskIds: string[]; docIds: string[] }
): Promise<ProjectLoopScopedEntity[]> {
	const entities: ProjectLoopScopedEntity[] = [];

	if (refs.taskIds.length) {
		const { data } = await supabase
			.from('onto_tasks')
			.select('id, title, state_key, updated_at, created_at')
			.eq('project_id', projectId)
			.in('id', refs.taskIds);
		const byId = new Map<string, any>((data ?? []).map((t: any) => [t.id as string, t]));
		for (const id of refs.taskIds) {
			const t = byId.get(id);
			entities.push({
				kind: 'task',
				id,
				title: t?.title ?? null,
				state_key: t?.state_key ?? null,
				updated_at: t ? (t.updated_at ?? t.created_at ?? null) : null,
				parent_id: null
			});
		}
	}

	if (refs.docIds.length) {
		const { data: projectRow } = await supabase
			.from('onto_projects')
			.select('doc_structure')
			.eq('id', projectId)
			.maybeSingle();
		const parentMap = buildProjectLoopParentMap(projectRow?.doc_structure);
		const { data } = await supabase
			.from('onto_documents')
			.select('id, title, state_key, updated_at, created_at')
			.eq('project_id', projectId)
			.in('id', refs.docIds);
		const byId = new Map<string, any>((data ?? []).map((d: any) => [d.id as string, d]));
		for (const id of refs.docIds) {
			const d = byId.get(id);
			entities.push({
				kind: 'document',
				id,
				title: d?.title ?? null,
				state_key: d?.state_key ?? null,
				updated_at: d ? (d.updated_at ?? d.created_at ?? null) : null,
				parent_id: parentMap.get(id) ?? null
			});
		}
	}

	return entities;
}

/**
 * The scoped freshness fingerprint for one suggestion's operations, loading
 * current entity state. Returns null when the suggestion mutates no concrete
 * entity (no freshness guard applies). Used by the generation stamp and the
 * approval-time check alike so the two are always comparable.
 */
export async function computeProjectSuggestionFreshnessFingerprint(
	supabase: AnySupabase,
	projectId: string,
	operations: LoopOperation[] | null | undefined
): Promise<string | null> {
	const refs = extractProjectLoopSuggestionEntities(operations);
	if (!refs.taskIds.length && !refs.docIds.length) return null;
	const entities = await loadProjectLoopSuggestionEntityStates(supabase, projectId, refs);
	return buildScopedSuggestionFingerprint(entities);
}

export function buildProjectLoopParentMap(docStructure: unknown): Map<string, string | null> {
	const map = new Map<string, string | null>();
	const root =
		docStructure && typeof docStructure === 'object' && 'root' in (docStructure as any)
			? (docStructure as any).root
			: docStructure;
	const visit = (nodes: any, parentId: string | null) => {
		if (!Array.isArray(nodes)) return;
		for (const node of nodes) {
			if (!node || typeof node.id !== 'string') continue;
			map.set(node.id, parentId);
			if (Array.isArray(node.children)) visit(node.children, node.id);
		}
	};
	visit(root, null);
	return map;
}

export function summarizeProjectLoopDocTree(
	docStructure: unknown,
	titleById: Map<string, string>
): string {
	const root =
		docStructure && typeof docStructure === 'object' && 'root' in (docStructure as any)
			? (docStructure as any).root
			: docStructure;
	const lines: string[] = [];
	const visit = (nodes: any, depth: number) => {
		if (!Array.isArray(nodes)) return;
		for (const node of nodes) {
			if (!node || typeof node.id !== 'string') continue;
			lines.push(`${'  '.repeat(depth)}- ${titleById.get(node.id) ?? node.id}`);
			if (Array.isArray(node.children)) visit(node.children, depth + 1);
		}
	};
	visit(root, 0);
	return lines.length ? lines.join('\n') : '(flat - no hierarchy yet)';
}

export function buildHeuristicProjectLoopBrief(
	ctx: ProjectLoopFingerprintContext,
	now = new Date()
): ProjectLoopBrief {
	const activeTasks = ctx.tasks.filter((task) => task.state_key !== 'done');
	const staleDocs = ctx.documents
		.filter((doc) => {
			if (!doc.updated_at) return false;
			const updatedAt = Date.parse(doc.updated_at);
			if (!Number.isFinite(updatedAt)) return false;
			return now.getTime() - updatedAt > 45 * 24 * 60 * 60 * 1000;
		})
		.slice(0, 3);
	const currentGoal =
		ctx.goals.find((goal) => goal.name.trim())?.name ??
		ctx.projectDescription ??
		`Keep ${ctx.projectName} moving`;

	return {
		current_goal: currentGoal,
		recent_changes: [
			`${ctx.documents.length} document${ctx.documents.length === 1 ? '' : 's'} in scope`,
			`${activeTasks.length} open task${activeTasks.length === 1 ? '' : 's'} tracked`
		],
		open_decisions: activeTasks.slice(0, 3).map((task) => task.title),
		stale_assumptions: staleDocs.map((doc) => doc.title),
		contradictions_or_drift: [],
		next_best_action: activeTasks[0]?.title ?? 'Add the next concrete task',
		generated_at: now.toISOString(),
		source: 'heuristic'
	};
}
