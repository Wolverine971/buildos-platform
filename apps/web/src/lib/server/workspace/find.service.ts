// apps/web/src/lib/server/workspace/find.service.ts
//
// Workspace search (tasker 159), server side. Two lanes behind one model
// ($lib/components/workspace/find-model.ts):
//   findItems      word matches from onto_find_items (one RPC, free, ~100–250 ms on prod).
//   findBestMatch  Jev hop 1 (which projects, Workspace included) + hop 2 (which records
//                  inside the top ones), about $0.0008 a search. Fail-open: any failure is an
//                  empty "unavailable" answer and the word matches stand on their own.
// Both read with the signed-in person's session, so they see exactly what that person can.
import {
	buildContextFinderEntities,
	entityScoreKey,
	rankProjectContext,
	rankWorkspaceProjects,
	selectWorkspaceProjects,
	type ContextFinderDecider,
	type ContextFinderProjectV1,
	type WorkspaceFinderDecider,
	type WorkspaceProjectInputV1,
	type WorkspaceRankingV1
} from '@buildos/agentic-chat-runtime/context-finder';
import {
	BEST_MATCH_MAX_ITEMS,
	FIND_QUERY_MIN,
	normalizeFindQuery,
	type BestMatchItem,
	type BestMatchResponse,
	type FindItem,
	type FindKind,
	type OpenRef
} from '$lib/components/workspace/find-model';

export class FindError extends Error {
	constructor(
		message: string,
		readonly status = 400
	) {
		super(message);
	}
}

// ---------- Word matches ----------

type RpcClient = {
	rpc: (
		fn: string,
		args: Record<string, unknown>
	) => PromiseLike<{ data: unknown; error: unknown }> & {
		abortSignal?: (signal: AbortSignal) => PromiseLike<{ data: unknown; error: unknown }>;
	};
};

const FIND_KINDS = new Set<FindKind>(['project', 'document', 'task', 'goal']);
export const FIND_DEFAULT_LIMIT = 40;

const str = (value: unknown): string | null =>
	typeof value === 'string' && value.length > 0 ? value : null;

export function toFindItem(row: Record<string, unknown>): FindItem | null {
	const kind = row.kind as FindKind;
	const id = str(row.id);
	const projectId = str(row.project_id);
	if (!FIND_KINDS.has(kind) || !id || !projectId) return null;
	return {
		kind,
		id,
		project_id: projectId,
		project_name: str(row.project_name),
		in_workspace: row.in_workspace === true,
		title: str(row.title) ?? 'Untitled',
		snippet: str(row.snippet),
		state_key: str(row.state_key),
		type_key: str(row.type_key),
		due_at: str(row.due_at),
		updated_at: str(row.updated_at)
	};
}

export async function findItems(input: {
	session: RpcClient;
	query: string;
	limit?: number;
	signal?: AbortSignal;
}): Promise<FindItem[]> {
	const query = normalizeFindQuery(input.query);
	if (query.length < FIND_QUERY_MIN) return [];
	const limit = Math.min(60, Math.max(1, Math.floor(input.limit ?? FIND_DEFAULT_LIMIT)));
	const call = input.session.rpc('onto_find_items', { p_query: query, p_limit: limit });
	const { data, error } = await (input.signal && call.abortSignal
		? call.abortSignal(input.signal)
		: call);
	if (error) {
		console.error('[Workspace find] onto_find_items failed:', error);
		throw new FindError('Search is unavailable right now.', 500);
	}
	return ((Array.isArray(data) ? data : []) as Record<string, unknown>[])
		.map(toFindItem)
		.filter((item): item is FindItem => item !== null);
}

// ---------- Item links ----------

type SelectClient = {
	from: (table: string) => {
		select: (columns: string) => {
			eq: (
				column: string,
				value: string
			) => {
				is: (
					column: string,
					value: null
				) => { maybeSingle: () => PromiseLike<{ data: unknown; error: unknown }> };
			};
		};
	};
};

const OPEN_TABLES: Record<Exclude<FindKind, 'project'>, string> = {
	document: 'onto_documents',
	task: 'onto_tasks',
	goal: 'onto_goals'
};

export type OpenTarget = OpenRef & { project_id: string; workspace: boolean };

/**
 * Where `?open=kind:id` points: the item's project, read with the person's session (RLS
 * hides what they can't open, which reads as not found). Null when it's gone or hidden.
 */
export async function resolveOpenTarget(
	session: SelectClient,
	ref: OpenRef
): Promise<OpenTarget | null> {
	let projectId = ref.id;
	if (ref.kind !== 'project') {
		const { data, error } = await session
			.from(OPEN_TABLES[ref.kind])
			.select('id, project_id')
			.eq('id', ref.id)
			.is('deleted_at', null)
			.maybeSingle();
		const found = data as { project_id?: string } | null;
		if (error || !found?.project_id) return null;
		projectId = found.project_id;
	}
	const { data, error } = await session
		.from('onto_projects')
		.select('id, kind')
		.eq('id', projectId)
		.is('deleted_at', null)
		.maybeSingle();
	const project = data as { id?: string; kind?: string } | null;
	if (error || !project?.id) return null;
	return { ...ref, project_id: projectId, workspace: project.kind === 'workspace' };
}

// ---------- Best match ----------

export const BEST_MATCH_HOP1_TIMEOUT_MS = 2_500;
export const BEST_MATCH_HOP2_TIMEOUT_MS = 2_000;
/** Whole request: the pane drops a late answer anyway. */
export const BEST_MATCH_DEADLINE_MS = 6_000;
/** A record makes the best match at this score, and within this share of the top one. */
export const BEST_MATCH_FLOOR = 0.5;
export const BEST_MATCH_RELATIVE = 0.6;
export const BEST_MATCH_OPERATION = 'workspace_find_best_match';
/** Kinds the reader opens; plans, milestones and risks stay with the word matches. */
const BEST_MATCH_KINDS = new Set(['document', 'task', 'goal']);

type Row = Record<string, unknown>;

export type BestMatchDeps = {
	decider: WorkspaceFinderDecider & ContextFinderDecider;
	/** Hop-1 cards: every project the person can open, Workspace included. */
	loadProjects: (signal: AbortSignal) => Promise<WorkspaceProjectInputV1[]>;
	/** Hop-2 records for one project the cards already authorized. */
	loadProject: (projectId: string, signal: AbortSignal) => Promise<ContextFinderProjectV1>;
	userId?: string;
	now?: () => number;
};

/**
 * The search box's text, framed as a request so Jev's chat-calibrated questions ("is the
 * request about this project?") read a bare query the same way. No interpretation here.
 */
export function bestMatchMessage(query: string): string {
	return `Find the saved note, doc, task or project this search is looking for: ${query}`;
}

/** Hop 1 for search: every query looks for something specific, so the scope is projects
 * and hop 2 always runs. The policy's floor, relative bar and zoom cap still apply. */
export function searchSelection(ranking: WorkspaceRankingV1) {
	return selectWorkspaceProjects({
		...ranking,
		scope: ranking.scope
			? { ...ranking.scope, choice: 'projects' }
			: { choice: 'projects', probabilities: {}, confidence: null },
		dig: 1,
		save: 0
	});
}

function rowsById(project: ContextFinderProjectV1): Map<string, Row> {
	const map = new Map<string, Row>();
	for (const row of [...project.documents, ...project.tasks, ...project.goals])
		if (typeof row.id === 'string') map.set(row.id, row);
	return map;
}

export async function findBestMatch(
	input: BestMatchDeps & { query: string; signal?: AbortSignal }
): Promise<BestMatchResponse> {
	const now = input.now ?? (() => performance.now());
	const started = now();
	const query = normalizeFindQuery(input.query);
	const finish = (status: BestMatchResponse['status'], items: BestMatchItem[] = []) => ({
		query,
		status,
		items,
		ms: Math.max(0, Math.round(now() - started))
	});
	if (query.length < FIND_QUERY_MIN) return finish('skipped');

	const controller = new AbortController();
	const timer = setTimeout(
		() => controller.abort(new Error('Best match deadline')),
		BEST_MATCH_DEADLINE_MS
	);
	const signal = input.signal
		? AbortSignal.any([input.signal, controller.signal])
		: controller.signal;
	const usage = { operationType: BEST_MATCH_OPERATION, userId: input.userId };
	const message = bestMatchMessage(query);
	try {
		const projects = await input.loadProjects(signal);
		if (!projects.length) return finish('empty');
		const ranking = await rankWorkspaceProjects({
			decider: input.decider,
			projects,
			message,
			signal,
			timeoutMs: BEST_MATCH_HOP1_TIMEOUT_MS,
			usage
		});
		if (ranking.status !== 'ranked') return finish('unavailable');
		const selection = searchSelection(ranking);
		if (!selection.zoom.length) return finish('empty');
		const workspaceIds = new Set(
			projects
				.filter((project) => project.project.kind === 'workspace')
				.map((project) => project.project.id)
		);

		const zoomed = await Promise.allSettled(
			selection.zoom.map(async (pick) => {
				const project = await input.loadProject(pick.id, signal);
				// Record questions only: the heading stage picks sections for a reply, which
				// search doesn't need. Headings still show in each record's packet.
				const entities = buildContextFinderEntities(project).map((entity) => ({
					...entity,
					packetHeadings: []
				}));
				const ranked = await rankProjectContext({
					decider: input.decider,
					project: project.project,
					entities,
					message,
					signal,
					timeoutMs: BEST_MATCH_HOP2_TIMEOUT_MS,
					usage: { ...usage, projectId: pick.id }
				});
				const rows = rowsById(project);
				return entities.map((entity) => ({
					entity,
					row: rows.get(entity.id) ?? {},
					p: ranked.scores[entityScoreKey(entity)] ?? 0,
					project: pick
				}));
			})
		);
		const scored = zoomed
			.flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
			.filter((candidate) => BEST_MATCH_KINDS.has(candidate.entity.kind));
		if (!scored.length) {
			const anyRan = zoomed.some((result) => result.status === 'fulfilled');
			return finish(anyRan ? 'empty' : 'unavailable');
		}
		const top = Math.max(...scored.map((candidate) => candidate.p));
		const bar = Math.max(BEST_MATCH_FLOOR, BEST_MATCH_RELATIVE * top);
		const items = scored
			.filter((candidate) => candidate.p >= bar)
			.sort((a, b) => b.p - a.p || b.project.p - a.project.p)
			.slice(0, BEST_MATCH_MAX_ITEMS)
			.map(({ entity, row, p, project }): BestMatchItem => {
				const inWorkspace = workspaceIds.has(project.id);
				return {
					kind: entity.kind as FindKind,
					id: entity.id,
					project_id: project.id,
					project_name: inWorkspace ? 'Workspace' : project.name,
					in_workspace: inWorkspace,
					title: entity.title || 'Untitled',
					snippet: null,
					state_key: str(row.state_key),
					type_key: str(row.type_key),
					due_at: str(row.due_at),
					updated_at: str(row.updated_at) ?? str(entity.version),
					p
				};
			});
		return finish(items.length ? 'selected' : 'empty', items);
	} catch (error) {
		if (input.signal?.aborted) throw error;
		console.warn('[Workspace find] best match failed open:', error);
		return finish('unavailable');
	} finally {
		clearTimeout(timer);
	}
}

/** Best-effort per-instance memo, so a retyped query isn't paid for twice in a few minutes. */
export function createBestMatchMemo(ttlMs = 5 * 60_000, max = 300) {
	const entries = new Map<string, { at: number; value: BestMatchResponse }>();
	return {
		get(key: string, now = Date.now()): BestMatchResponse | null {
			const hit = entries.get(key);
			if (!hit) return null;
			if (now - hit.at > ttlMs) {
				entries.delete(key);
				return null;
			}
			return hit.value;
		},
		set(key: string, value: BestMatchResponse, now = Date.now()) {
			if (value.status === 'unavailable') return;
			entries.delete(key);
			entries.set(key, { at: now, value });
			while (entries.size > max) entries.delete(entries.keys().next().value!);
		}
	};
}
