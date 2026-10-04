// apps/worker/src/workers/consolidation/consolidationJob.ts
//
// Queue job `consolidation_run` (docs/research/doc-task-consolidation-2026-10-03).
// - survey: load every doc in the run's project family, find groups (one model
//   call), decide each group (one call per group, 4 at a time), store the plan
//   and the question cards. Status ends at `waiting` (questions open) or `review`.
// - replan: the owner answered a card in their own words. Re-decide that one
//   group with their instruction; the result is either settled or a follow-up card.
// Nothing here changes a document: applying happens from the run page, on the
// owner's click, through Organize and archive (web).
import type { ConsolidationRunJobMetadata, Json } from '@buildos/shared-types';
import {
	type ConsolidationPlan,
	answeredOps,
	parseConsolidationQuestion
} from '@buildos/shared-agent-ops/consolidation';
import { START_HERE_DOCUMENT_TYPE_KEY } from '@buildos/shared-agent-ops/ontology/start-here';
import { THINKING_LOG_TYPE_KEY } from '@buildos/shared-agent-ops/ontology/thinking-log';
import { buildProjectLoopParentMap } from '@buildos/shared-agent-ops';
import { extractOutline } from '@buildos/shared-agent-ops/utils/document-outline';
import { supabase } from '../../lib/supabase';
import type { ProcessingJob } from '../../lib/supabaseQueue';
import { PermanentQueueError } from '../../lib/queueErrors';
import { type JSONUsageEvent, SmartLLMService } from '../../lib/services/smart-llm-service';
import { markMergeFailed, processMerge } from './mergeJob';
import {
	CostCapError,
	DECIDING,
	type RunRow,
	loadRun,
	loggedSpend,
	mapLimit,
	updateRun,
	usageTracker
} from './runtime';
import {
	DECIDE_SYSTEM_PROMPT,
	type FoundGroup,
	GROUPS_SYSTEM_PROMPT,
	type GroupDecision,
	type Inventory,
	type InventoryDocument,
	buildDecision,
	buildKeys,
	decideUserPrompt,
	emptyPlan,
	enforceTwinSurvivors,
	groupsUserPrompt,
	leaveAll,
	parseGroups,
	twinMap
} from './survey';

const DECIDE_CONCURRENCY = 4;

function headingsOf(outline: unknown): string[] {
	const nodes =
		outline &&
		typeof outline === 'object' &&
		Array.isArray((outline as { nodes?: unknown }).nodes)
			? ((outline as { nodes: unknown[] }).nodes as Array<Record<string, unknown>>)
			: [];
	const out: string[] = [];
	const visit = (list: Array<Record<string, unknown>>, depth: number) => {
		for (const node of list) {
			if (typeof node.text === 'string' && node.text.trim()) out.push(node.text.trim());
			if (depth < 1 && Array.isArray(node.children))
				visit(node.children as Array<Record<string, unknown>>, depth + 1);
		}
	};
	visit(nodes, 0);
	return out;
}

/** Every doc under each doc in a project's tree; a moved doc takes these with it. */
function subDocuments(docStructure: unknown): Map<string, string[]> {
	const parents = buildProjectLoopParentMap(docStructure);
	const out = new Map<string, string[]>();
	for (const id of parents.keys()) {
		const seen = new Set<string>();
		for (
			let parent = parents.get(id) ?? null;
			parent && !seen.has(parent);
			parent = parents.get(parent) ?? null
		) {
			seen.add(parent);
			out.set(parent, [...(out.get(parent) ?? []), id]);
		}
	}
	return out;
}

/** Every live doc in the run's projects, with what the survey needs to know about it. */
export async function loadInventory(run: RunRow): Promise<Inventory> {
	const { data: projects, error: projectError } = await supabase
		.from('onto_projects')
		.select(
			'id, name, description, parent_project_id, shared_folder_document_id, doc_structure'
		)
		.in('id', run.project_ids)
		.is('deleted_at', null);
	if (projectError) throw new Error(`Load projects: ${projectError.message}`);
	const live = (projects ?? []).filter((project) => run.project_ids.includes(project.id));
	if (!live.some((project) => project.id === run.root_project_id))
		throw new PermanentQueueError('consolidation_root_missing', 'The project is gone.');

	const { data: documents, error: documentError } = await supabase
		.from('onto_documents')
		.select(
			'id, project_id, title, description, type_key, content, content_hash, outline, props, created_at, updated_at, state_key'
		)
		.in(
			'project_id',
			live.map((project) => project.id)
		)
		.is('deleted_at', null)
		.is('archived_at', null)
		.neq('state_key', 'archived')
		.order('updated_at', { ascending: false })
		.limit(300);
	if (documentError) throw new Error(`Load documents: ${documentError.message}`);
	// Past the cap, the newest docs matter most (they are what supersedes the rest).
	const rows = [...(documents ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at));

	// Open tasks, for misfiled work only (tasks never archive or merge here).
	const { data: tasks, error: taskError } = await supabase
		.from('onto_tasks')
		.select('id, project_id, title, description, state_key')
		.in(
			'project_id',
			live.map((project) => project.id)
		)
		.is('deleted_at', null)
		.is('archived_at', null)
		.neq('state_key', 'done')
		.order('updated_at', { ascending: false })
		.limit(200);
	if (taskError) throw new Error(`Load tasks: ${taskError.message}`);

	const pinned = new Map<string, InventoryDocument['pinned']>();
	const titleById = new Map(rows.map((row) => [row.id, row.title ?? 'Untitled']));
	const folderOf = new Map<string, string | null>();
	const inside = new Map<string, string[]>();
	for (const project of live) {
		// Organize refuses to move any START HERE or thinking log, duplicates included.
		for (const row of rows.filter((item) => item.project_id === project.id)) {
			if (row.type_key === START_HERE_DOCUMENT_TYPE_KEY) pinned.set(row.id, 'start_here');
			if (row.type_key === THINKING_LOG_TYPE_KEY) pinned.set(row.id, 'thinking_log');
		}
		if (project.shared_folder_document_id)
			pinned.set(project.shared_folder_document_id, 'shared_folder');
		for (const [id, parent] of buildProjectLoopParentMap(project.doc_structure))
			folderOf.set(id, parent ? (titleById.get(parent) ?? null) : null);
		for (const [id, ids] of subDocuments(project.doc_structure)) inside.set(id, ids);
	}

	// Parent first, then sub-projects in name order, so keys read naturally.
	const ordered = [...live].sort((a, b) =>
		a.id === run.root_project_id
			? -1
			: b.id === run.root_project_id
				? 1
				: a.name.localeCompare(b.name)
	);
	return {
		projects: ordered.map((project) => ({
			id: project.id,
			name: project.name,
			description: project.description,
			parent: project.id === run.root_project_id
		})),
		tasks: (tasks ?? []).map((task) => ({
			id: task.id,
			project_id: task.project_id,
			title: task.title ?? 'Untitled task',
			description: task.description,
			state: task.state_key
		})),
		documents: rows.map((row) => ({
			id: row.id,
			project_id: row.project_id,
			title: row.title ?? 'Untitled',
			description: row.description,
			type_key: row.type_key,
			content: row.content ?? '',
			content_hash: row.content_hash,
			// Stored outlines are missing on older docs; read the markdown headings instead.
			headings: headingsOf(row.outline).length
				? headingsOf(row.outline)
				: headingsOf(extractOutline(row.content)),
			folder: folderOf.get(row.id) ?? null,
			has_children: inside.has(row.id),
			sub_document_ids: inside.get(row.id),
			created_at: row.created_at,
			updated_at: row.updated_at,
			pinned: pinned.get(row.id) ?? null
		}))
	};
}

async function decideGroup(params: {
	llm: SmartLLMService;
	run: RunRow;
	group: FoundGroup;
	key: string;
	inventory: Inventory;
	keys: ReturnType<typeof buildKeys>;
	twins: Map<string, string[]>;
	instruction?: string | null;
	signal: AbortSignal;
	onUsage: (event: JSONUsageEvent) => Promise<void>;
}): Promise<GroupDecision> {
	const raw = await params.llm.getJSONResponse<Record<string, unknown>>({
		systemPrompt: DECIDE_SYSTEM_PROMPT,
		userPrompt: decideUserPrompt({
			group: params.group,
			inventory: params.inventory,
			keys: params.keys,
			twins: params.twins,
			instruction: params.instruction
		}),
		userId: params.run.user_id,
		profile: 'balanced',
		signal: params.signal,
		validation: { retryOnParseError: true, maxRetries: 2 },
		operationType: 'consolidation_decide_group',
		timeoutMs: 150_000,
		projectId: params.run.root_project_id,
		metadata: { consolidation_run_id: params.run.id, consolidation_cluster: params.key },
		onUsage: params.onUsage
	});
	return buildDecision({
		key: params.key,
		group: params.group,
		raw,
		inventory: params.inventory,
		keys: params.keys,
		twins: params.twins
	});
}

const PLACEHOLDER_ID = '00000000-0000-4000-8000-000000000000';

/**
 * Inserts the decision's card. A card the web could not read would leave its
 * group waiting forever, so one that fails the web's parser is not written:
 * the caller leaves that group alone instead (null).
 */
async function insertQuestion(
	runId: string,
	decision: GroupDecision,
	piece = `cluster:${decision.cluster.key}`
): Promise<string | null> {
	const question = decision.question!;
	const row = {
		run_id: runId,
		piece,
		header: question.header,
		question: question.question,
		evidence: question.evidence as unknown as Json,
		options: question.options as unknown as Json,
		recommended_option_id: question.recommended_option_id,
		skip_option_id: question.skip_option_id,
		priority: question.priority
	};
	if (!parseConsolidationQuestion({ ...row, id: PLACEHOLDER_ID, status: 'open' })) return null;
	const { data, error } = await supabase
		.from('consolidation_questions')
		.insert(row)
		.select('id')
		.single();
	if (error || !data) throw new Error(`Insert question: ${error?.message ?? 'no row'}`);
	return data.id;
}

function leaveAlone(cluster: ConsolidationPlan['clusters'][number]) {
	cluster.ops = [leaveAll(cluster.document_ids, cluster.task_ids)];
	cluster.question_id = null;
}

async function openQuestionCount(runId: string): Promise<number> {
	const { count, error } = await supabase
		.from('consolidation_questions')
		.select('id', { count: 'exact', head: true })
		.eq('run_id', runId)
		.eq('status', 'open');
	if (error) throw new Error(`Count questions: ${error.message}`);
	return count ?? 0;
}

async function survey(job: ProcessingJob<ConsolidationRunJobMetadata>, run: RunRow) {
	const llm = new SmartLLMService({ supabase, appName: 'BuildOS Consolidation Worker' });
	// The cap counts what earlier attempts really spent, not only this one. Merges have their own.
	const usage = usageTracker(await loggedSpend(run, 'run'));
	// A retried survey starts over: drop cards an earlier attempt wrote before failing.
	const { error: clearError } = await supabase
		.from('consolidation_questions')
		.delete()
		.eq('run_id', run.id);
	if (clearError) throw new Error(`Clear earlier questions: ${clearError.message}`);
	await job.updateProgress({ current: 1, total: 3, message: 'Reading documents' });
	const inventory = await loadInventory(run);
	const keys = buildKeys(inventory);
	const twins = twinMap(inventory);
	await updateRun(run.id, {
		progress: {
			stage: 'grouping',
			projects: inventory.projects.length,
			documents: inventory.documents.length
		}
	});

	await job.updateProgress({ current: 2, total: 3, message: 'Finding groups' });
	usage.check();
	const raw = await llm.getJSONResponse<Record<string, unknown>>({
		systemPrompt: GROUPS_SYSTEM_PROMPT,
		userPrompt: groupsUserPrompt(inventory, keys),
		userId: run.user_id,
		profile: 'balanced',
		signal: job.signal,
		validation: { retryOnParseError: true, maxRetries: 2 },
		operationType: 'consolidation_find_groups',
		// One call over the whole family (88 docs ≈ 36K chars) ran past the 120 s default on 10-04.
		timeoutMs: 240_000,
		projectId: run.root_project_id,
		metadata: { consolidation_run_id: run.id },
		onUsage: usage.onUsage
	});
	usage.check();
	const groups = parseGroups(raw, inventory, keys);
	await updateRun(run.id, {
		progress: {
			stage: 'deciding',
			projects: inventory.projects.length,
			documents: inventory.documents.length,
			groups: groups.length
		},
		cost_usd: usage.total
	});

	await job.updateProgress({ current: 3, total: 3, message: `Deciding ${groups.length} groups` });
	const decisions = await mapLimit(
		groups,
		DECIDE_CONCURRENCY,
		async (group, index, signal) => {
			usage.check();
			try {
				return await decideGroup({
					llm,
					run,
					group,
					key: `c${index + 1}`,
					inventory,
					keys,
					twins,
					signal,
					onUsage: usage.onUsage
				});
			} catch (error) {
				// An aborted job (timeout, deploy) must not write a plan missing its groups.
				if (error instanceof CostCapError || signal.aborted) throw error;
				await job.log(
					`Group ${index + 1} skipped: ${error instanceof Error ? error.message : error}`
				);
				return null;
			}
		},
		job.signal
	);

	job.signal.throwIfAborted();
	const plan: ConsolidationPlan = emptyPlan(inventory);
	const decided = enforceTwinSurvivors(
		decisions.filter((decision): decision is GroupDecision => decision !== null),
		twins
	);
	for (const decision of decided) {
		if (decision.question) {
			const questionId = await insertQuestion(run.id, decision);
			if (questionId) decision.cluster.question_id = questionId;
			else leaveAlone(decision.cluster);
		}
		plan.clusters.push(decision.cluster);
	}
	const open = plan.clusters.filter((cluster) => cluster.question_id).length;
	const written = await updateRun(
		run.id,
		{
			plan: plan as unknown as Json,
			status: open > 0 ? 'waiting' : 'review',
			progress: {
				stage: 'done',
				projects: inventory.projects.length,
				documents: inventory.documents.length,
				groups: plan.clusters.length,
				questions: open
			},
			cost_usd: usage.total
		},
		['surveying']
	);
	if (!written) return { skipped: 'run was cancelled during the survey' };
	const spent = await loggedSpend(run).catch(() => usage.total);
	await updateRun(run.id, { cost_usd: spent }).catch(() => false);
	return { groups: plan.clusters.length, questions: open, cost_usd: spent };
}

/**
 * The owner answered a card in their own words. Re-decide its group with that
 * instruction. A clear result replaces the group's operations; an unclear one
 * becomes a follow-up card.
 */
async function replan(job: ProcessingJob<ConsolidationRunJobMetadata>, run: RunRow) {
	const questionId = job.data.questionId!;
	const { data: row, error } = await supabase
		.from('consolidation_questions')
		.select('*')
		.eq('id', questionId)
		.eq('run_id', run.id)
		.maybeSingle();
	if (error) throw new Error(`Load question: ${error.message}`);
	const question = row ? parseConsolidationQuestion(row) : null;
	const plan = run.plan as ConsolidationPlan | null;
	const cluster = plan?.clusters.find((item) => item.question_id === questionId);
	if (!question || !plan || !cluster) return { skipped: 'question no longer on the plan' };
	if (answeredOps(question)) return { skipped: 'answer already maps to an option' };
	const instruction =
		question.answer && (question.answer.via === 'text' || question.answer.via === 'chat')
			? question.answer.reading.instruction
			: null;
	if (!instruction) return { skipped: 'no instruction' };

	const llm = new SmartLLMService({ supabase, appName: 'BuildOS Consolidation Worker' });
	const usage = usageTracker(await loggedSpend(run, 'run'));
	usage.check();
	const inventory = await loadInventory(run);
	const keys = buildKeys(inventory);
	const live = new Set(inventory.documents.map((document) => document.id));
	const liveTasks = new Set((inventory.tasks ?? []).map((task) => task.id));
	const group: FoundGroup = {
		kind: cluster.kind,
		title: cluster.title,
		document_ids: cluster.document_ids.filter((id) => live.has(id)),
		task_ids: (cluster.task_ids ?? []).filter((id) => liveTasks.has(id)),
		belongs_in: null,
		newer_id: null,
		reason: cluster.reason
	};
	const decision = await decideGroup({
		llm,
		run,
		group,
		key: cluster.key,
		inventory,
		keys,
		twins: twinMap(inventory),
		instruction,
		signal: job.signal,
		onUsage: usage.onUsage
	});
	job.signal.throwIfAborted();
	// One follow-up per answered card: a retried replan replaces its earlier draft.
	const followPiece = `cluster:${cluster.key}:after:${questionId.slice(0, 8)}`;
	await supabase
		.from('consolidation_questions')
		.delete()
		.eq('run_id', run.id)
		.eq('piece', followPiece)
		.eq('status', 'open');
	const followUp = decision.question ? await insertQuestion(run.id, decision, followPiece) : null;
	// A follow-up the web could not read becomes "leave it", never a silent change.
	const ops =
		decision.question && !followUp
			? [{ op: 'keep' as const, document_ids: [...cluster.document_ids] }]
			: decision.cluster.ops;
	const patched = await patchCluster(run.id, cluster.key, questionId, (target) => {
		target.ops = ops;
		target.question_id = followUp;
	});
	if (!patched) {
		// The owner applied or cancelled meanwhile: the follow-up card is moot.
		if (followUp) await supabase.from('consolidation_questions').delete().eq('id', followUp);
		return { skipped: 'run moved on during the replan' };
	}
	const open = await openQuestionCount(run.id);
	await updateRun(
		run.id,
		{
			status: open > 0 ? 'waiting' : 'review',
			cost_usd: await loggedSpend(run).catch(() => usage.total)
		},
		DECIDING
	);
	return { follow_up: Boolean(followUp), open };
}

/**
 * Re-reads the plan and changes one cluster, guarded by updated_at and status,
 * so a "Leave it" the owner clicked meanwhile is never overwritten and an
 * applied or cancelled run is never touched. False when the run moved on.
 */
async function patchCluster(
	runId: string,
	key: string,
	expectedQuestionId: string,
	change: (cluster: ConsolidationPlan['clusters'][number]) => void
): Promise<boolean> {
	for (let attempt = 0; attempt < 4; attempt++) {
		const { data, error } = await supabase
			.from('consolidation_runs')
			.select('plan, status, updated_at')
			.eq('id', runId)
			.single();
		if (error || !data) throw new Error(`Reload plan: ${error?.message ?? 'missing'}`);
		if (!DECIDING.includes(data.status)) return false;
		const plan = data.plan as unknown as ConsolidationPlan | null;
		const cluster = plan?.clusters.find((item) => item.key === key);
		if (!plan || !cluster || cluster.question_id !== expectedQuestionId) return false;
		change(cluster);
		const { data: written, error: writeError } = await supabase
			.from('consolidation_runs')
			.update({ plan: plan as unknown as Json, updated_at: new Date().toISOString() })
			.eq('id', runId)
			.eq('updated_at', data.updated_at)
			.in('status', DECIDING)
			.select('id');
		if (writeError) throw new Error(`Write plan: ${writeError.message}`);
		if (written?.length) return true;
	}
	throw new Error('The plan kept changing; will retry.');
}

const REPLAN_FAILED = 'I could not turn that answer into a plan. Pick an option, or say it another way.';
const REPLAN_CAPPED =
	'This consolidation reached its spending cap, so I can’t re-plan this group from your words. Pick one of the options.';

/**
 * A replan that failed for good hands the card back to the owner, with a note,
 * instead of leaving its group waiting on an answer nothing will act on.
 */
async function reopenQuestion(runId: string, questionId: string, note = REPLAN_FAILED) {
	const run = await loadRun(runId);
	if (!run || !DECIDING.includes(run.status)) return;
	const now = new Date().toISOString();
	await supabase
		.from('consolidation_questions')
		.update({
			status: 'open',
			answer: null,
			answered_at: null,
			draft: {
				via: 'chat',
				text: null,
				thread: [
					{
						role: 'assistant',
						text: note,
						at: now
					}
				],
				reading: null
			} as unknown as Json,
			updated_at: now
		})
		.eq('id', questionId)
		.eq('run_id', runId)
		.eq('status', 'answered');
	await updateRun(runId, { status: 'waiting' }, DECIDING);
}

export async function processConsolidationRun(job: ProcessingJob<ConsolidationRunJobMetadata>) {
	const { runId, userId, action } = job.data;
	const run = await loadRun(runId);
	if (!run || run.user_id !== userId)
		throw new PermanentQueueError(
			'consolidation_run_missing',
			`Run ${runId} not found for this user`
		);
	try {
		if (action === 'survey') {
			if (run.status !== 'surveying') return { skipped: `status is ${run.status}` };
			return await survey(job, run);
		}
		if (run.status !== 'waiting' && run.status !== 'review')
			return { skipped: `status is ${run.status}` };
		if (action === 'merge' || action === 'merge_write')
			return await processMerge(job, run, action);
		return await replan(job, run);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		const final =
			error instanceof PermanentQueueError ||
			error instanceof CostCapError ||
			job.attempts + 1 >= (job.maxAttempts ?? 3);
		if (final && action === 'survey')
			await updateRun(
				runId,
				{
					status: 'failed',
					error: message.slice(0, 500),
					finished_at: new Date().toISOString()
				},
				['surveying']
			).catch(() => undefined);
		if (final && action === 'replan' && job.data.questionId)
			await reopenQuestion(
				runId,
				job.data.questionId,
				error instanceof CostCapError ? REPLAN_CAPPED : REPLAN_FAILED
			).catch(() => undefined);
		// A merge that failed for good says so on its group; the owner can retry or leave it.
		if (final && (action === 'merge' || action === 'merge_write') && job.data.clusterKey)
			await markMergeFailed(runId, job.data.clusterKey, message).catch(() => undefined);
		if (error instanceof CostCapError)
			throw new PermanentQueueError('consolidation_cost_cap', message);
		throw error;
	}
}
