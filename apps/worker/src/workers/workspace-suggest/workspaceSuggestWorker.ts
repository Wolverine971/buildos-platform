// apps/worker/src/workers/workspace-suggest/workspaceSuggestWorker.ts
//
// workspace_suggest: queued a few minutes after a loose item lands in a person's Workspace
// (trigger private.enqueue_workspace_suggest, one pending run per person), or when they
// tap "Suggest homes". Reads the loose items and the person's project cards, asks one
// cheap model for groupings ("this looks like a project") and filings ("this belongs in
// 9takes"), and writes them to workspace_suggestions. It never moves, files or creates
// anything: the person accepts or dismisses each suggestion in the Workspace.
//
// Cost guards: nothing runs for an empty Workspace, a run is skipped when nothing the
// model would read has changed since the last one (unless the person asked), and a
// person gets at most DAILY_RUN_CAP runs a day.
import type { WorkspaceSuggestJobMetadata, WorkspaceSuggestResult } from '@buildos/shared-types';
import type { ProcessingJob } from '../../lib/supabaseQueue';
import { SmartLLMService } from '../../lib/services/smart-llm-service';
import { supabase as defaultSupabase } from '../../lib/supabase';
import {
	type ExistingSuggestion,
	type JsonCaller,
	type LooseInput,
	type ProjectCardInput,
	WORKSPACE_SUGGEST_MODELS,
	askForWorkspaceSuggestions,
	buildWorkspaceSuggestPrompt,
	checkWorkspaceSuggestAnswer,
	planSuggestionWrites,
	refKey,
	workspaceInputHash
} from './workspace-suggest';

const NOTE_TYPE_KEY = 'document.note';
const DAILY_RUN_CAP = 8;
const DISMISSAL_MEMORY_DAYS = 120;
const LOOSE_LIMIT = 80;
const BODY_READ_CHARS = 600;

type Deps = { supabase: typeof defaultSupabase; llm: JsonCaller };

let sharedLlm: SmartLLMService | null = null;

type TreeNode = { id?: unknown; children?: TreeNode[] };

/** Docs nested inside another doc ride with it; only top-level docs are loose cards. */
function nestedDocIds(structure: unknown): Set<string> {
	const nested = new Set<string>();
	const root = (structure as { root?: unknown } | null)?.root;
	const walk = (nodes: TreeNode[] | undefined) => {
		for (const node of nodes ?? []) {
			if (typeof node?.id === 'string') nested.add(node.id);
			walk(node?.children);
		}
	};
	for (const node of Array.isArray(root) ? (root as TreeNode[]) : []) walk(node?.children);
	return nested;
}

export async function processWorkspaceSuggestJob(
	job: ProcessingJob<WorkspaceSuggestJobMetadata>,
	deps: Partial<Deps> = {}
): Promise<WorkspaceSuggestResult> {
	const db = deps.supabase ?? defaultSupabase;
	const userId = typeof job.data?.userId === 'string' ? job.data.userId : '';
	const workspaceId =
		typeof job.data?.workspaceProjectId === 'string' ? job.data.workspaceProjectId : '';
	if (!userId || !workspaceId)
		throw new Error('workspace_suggest needs userId and workspaceProjectId');
	const requested = job.data?.reason === 'requested';
	const done = (
		outcome: WorkspaceSuggestResult['outcome'],
		extra: Partial<WorkspaceSuggestResult> = {}
	): WorkspaceSuggestResult => ({ success: outcome !== 'failed', userId, outcome, ...extra });

	// The workspace must still be this person's live Workspace.
	const { data: workspace, error: workspaceError } = await db
		.from('onto_projects')
		.select('id, kind, created_by, deleted_at, doc_structure')
		.eq('id', workspaceId)
		.maybeSingle();
	if (workspaceError) throw new Error(`Could not load the Workspace: ${workspaceError.message}`);
	if (!workspace || workspace.deleted_at || workspace.kind !== 'workspace')
		return done('skipped', { reason: 'no workspace' });
	const { data: owner, error: ownerError } = await db
		.from('onto_actors')
		.select('id, user_id')
		.eq('id', workspace.created_by)
		.maybeSingle();
	if (ownerError) throw new Error(`Could not load the owner: ${ownerError.message}`);
	if (!owner || owner.user_id !== userId) return done('skipped', { reason: 'not the owner' });

	// Daily cap, and the last run's input hash (skip when nothing changed).
	const since = new Date(Date.now() - 24 * 3600_000).toISOString();
	const { data: recentRuns, error: runsError } = await db
		.from('queue_jobs')
		.select('result, completed_at')
		.eq('user_id', userId)
		.eq('job_type', 'workspace_suggest')
		.eq('status', 'completed')
		.gte('completed_at', since)
		.order('completed_at', { ascending: false })
		.limit(DAILY_RUN_CAP + 1);
	if (runsError) throw new Error(`Could not read recent runs: ${runsError.message}`);
	const ran = (recentRuns ?? []).filter(
		(run) =>
			(run.result as { outcome?: string } | null)?.outcome === 'suggested' ||
			(run.result as { outcome?: string } | null)?.outcome === 'nothing_new'
	);
	if (ran.length >= DAILY_RUN_CAP) return done('skipped', { reason: 'daily cap' });
	const lastHash = (ran[0]?.result as { inputHash?: string } | null)?.inputHash ?? null;

	const nested = nestedDocIds(workspace.doc_structure);
	const [docs, tasks, summaries, existingRows] = await Promise.all([
		db
			.from('onto_documents')
			.select('id, title, type_key, content, description, created_at')
			.eq('project_id', workspaceId)
			.is('deleted_at', null)
			.is('archived_at', null)
			.neq('state_key', 'archived')
			.order('created_at', { ascending: false })
			.limit(LOOSE_LIMIT),
		db
			.from('onto_tasks')
			.select('id, title, description, created_at, due_at')
			.eq('project_id', workspaceId)
			.is('deleted_at', null)
			.is('archived_at', null)
			.neq('state_key', 'done')
			.order('created_at', { ascending: false })
			.limit(LOOSE_LIMIT),
		db.rpc('get_onto_project_summaries_v1', { p_actor_id: owner.id }),
		db
			.from('workspace_suggestions')
			.select('id, kind, status, item_key, target_project_id, items, decided_at')
			.eq('user_id', userId)
			.in('status', ['open', 'dismissed'])
			.order('created_at', { ascending: false })
			.limit(400)
	]);
	for (const result of [docs, tasks, summaries, existingRows]) {
		if (result.error) throw new Error(`Could not load the Workspace: ${result.error.message}`);
	}

	const loose: LooseInput[] = [
		...(docs.data ?? [])
			.filter((doc) => !nested.has(doc.id))
			.map(
				(doc): LooseInput => ({
					entity: 'document',
					id: doc.id,
					kind: doc.type_key === NOTE_TYPE_KEY ? 'note' : 'doc',
					title: doc.title?.trim() || 'Untitled',
					body: (doc.content ?? doc.description ?? '').slice(0, BODY_READ_CHARS) || null,
					created_at: doc.created_at
				})
			),
		...(tasks.data ?? []).map(
			(task): LooseInput => ({
				entity: 'task',
				id: task.id,
				kind: 'task',
				title: task.title,
				body: task.description?.slice(0, BODY_READ_CHARS) ?? null,
				created_at: task.created_at,
				due_at: task.due_at
			})
		)
	].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));

	type SummaryRow = {
		id: string;
		name: string;
		description: string | null;
		next_step_short: string | null;
		state_key: string;
		access_level: string | null;
		kind: string | null;
		updated_at: string;
	};
	const projects: ProjectCardInput[] = ((summaries.data ?? []) as SummaryRow[])
		.filter(
			(row) =>
				row.kind !== 'workspace' &&
				(row.access_level === 'write' || row.access_level === 'admin') &&
				['planning', 'active', 'paused'].includes(row.state_key)
		)
		.sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
		.map((row) => ({
			id: row.id,
			name: row.name,
			description: row.description,
			next_step: row.next_step_short
		}));

	const dismissalCutoff = Date.now() - DISMISSAL_MEMORY_DAYS * 86_400_000;
	const existing: ExistingSuggestion[] = (existingRows.data ?? [])
		.filter(
			(row) =>
				row.status === 'open' ||
				(row.decided_at ? Date.parse(row.decided_at) >= dismissalCutoff : true)
		)
		.map((row) => ({
			id: row.id,
			kind: row.kind as ExistingSuggestion['kind'],
			status: row.status as ExistingSuggestion['status'],
			item_key: row.item_key,
			target_project_id: row.target_project_id,
			items: (Array.isArray(row.items) ? (row.items as unknown[]) : []).flatMap((value) => {
				const ref = value as { entity?: unknown; kind?: unknown; id?: unknown };
				const entity = ref?.entity ?? ref?.kind;
				return (entity === 'document' || entity === 'task') && typeof ref.id === 'string'
					? [{ entity, id: ref.id } as { entity: 'document' | 'task'; id: string }]
					: [];
			})
		}));

	// Open suggestions whose items left the Workspace go stale whether or not the model runs.
	const looseKeys = new Set(loose.map(refKey));
	const staleOnly = planSuggestionWrites({ groups: [], filings: [], existing, looseKeys });
	const markStale = async (ids: string[]) => {
		if (!ids.length) return 0;
		const { error } = await db
			.from('workspace_suggestions')
			.update({ status: 'stale', updated_at: new Date().toISOString() })
			.in('id', ids)
			.eq('status', 'open');
		if (error) throw new Error(`Could not retire old suggestions: ${error.message}`);
		return ids.length;
	};

	if (loose.length === 0 || (loose.length < 2 && projects.length === 0)) {
		const staled = await markStale(staleOnly.staleIds);
		return done('skipped', { reason: 'nothing to suggest from', staled });
	}

	const inputHash = workspaceInputHash(loose, projects);
	if (!requested && lastHash === inputHash) {
		const staled = await markStale(staleOnly.staleIds);
		return done('nothing_new', { staled, inputHash });
	}

	if (job.signal.aborted) return done('skipped', { reason: 'job aborted' });
	const { prompt, aliases } = buildWorkspaceSuggestPrompt(loose, projects, existing);
	const llm = deps.llm ?? (sharedLlm ??= new SmartLLMService());
	let raw: unknown;
	try {
		raw = await askForWorkspaceSuggestions(llm, prompt, {
			userId,
			projectId: workspaceId,
			signal: job.signal
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : 'unknown';
		await job.log(`Workspace suggestions: model call failed (${message})`);
		return done('failed', { reason: message });
	}
	if (job.signal.aborted) return done('skipped', { reason: 'job aborted' });

	const checked = checkWorkspaceSuggestAnswer(raw, aliases);
	if (checked.notes.length) await job.log(`Workspace suggestions: ${checked.notes.join('; ')}`);
	const plan = planSuggestionWrites({
		groups: checked.groups,
		filings: checked.filings,
		existing,
		looseKeys
	});

	const runId = crypto.randomUUID();
	const model = WORKSPACE_SUGGEST_MODELS[0];
	const rows = [
		...plan.groups.map((group) => ({
			user_id: userId,
			workspace_project_id: workspaceId,
			kind: 'graduate',
			proposed_name: group.name,
			reason: group.why,
			confidence: group.confidence,
			items: group.items,
			item_key: group.item_key,
			model,
			run_id: runId,
			result: { proposal: { type_key: group.type_key } }
		})),
		...plan.filings.map((filing) => ({
			user_id: userId,
			workspace_project_id: workspaceId,
			kind: 'file',
			target_project_id: filing.project_id,
			reason: filing.why,
			confidence: filing.confidence,
			items: [filing.item],
			item_key: filing.item_key,
			model,
			run_id: runId
		}))
	];
	let created = 0;
	for (const row of rows) {
		const { error } = await db.from('workspace_suggestions').insert(row as never);
		// 23505: the same suggestion is already open (a concurrent run); fine.
		if (error && error.code !== '23505')
			throw new Error(`Could not save a suggestion: ${error.message}`);
		if (!error) created += 1;
	}
	const staled = await markStale(plan.staleIds);
	await job.log(
		`Workspace suggestions: ${created} new (${plan.groups.length} groups, ${plan.filings.length} filings), ${staled} retired, ${loose.length} loose / ${projects.length} projects read`
	);
	return done('suggested', { created, staled, runId, inputHash });
}
