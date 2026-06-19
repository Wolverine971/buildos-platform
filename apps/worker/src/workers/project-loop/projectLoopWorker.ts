// apps/worker/src/workers/project-loop/projectLoopWorker.ts
//
// buildos_project_loop job processor. Runs a per-project reconciliation pass and
// writes reviewable suggestions to project_suggestions. It does NOT mutate the
// project — proposed changes are replayed by the web app on user approval.

import type {
	Json,
	ProjectLoopJobMetadata,
	ProjectLoopRun,
	ProposedSuggestion
} from '@buildos/shared-types';
import { createHash } from 'node:crypto';
import type { ProcessingJob } from '../../lib/supabaseQueue';
import { supabase } from '../../lib/supabase';
import { SmartLLMService } from '../../lib/services/smart-llm-service';
import type { UsageEvent } from '../homework/engine/homeworkEngine';
import { PROJECT_LOOPS_ENABLED } from '../../config/projectLoops';
import {
	type LoopContext,
	type LoopDocument,
	type LoopTask,
	generateDocOrganization,
	generateOutdatedDocs
} from './generators';

const MAX_SUGGESTIONS = 25;

function nowIso(): string {
	return new Date().toISOString();
}

function buildSourceFingerprint(ctx: LoopContext): string {
	return createHash('sha256')
		.update(
			JSON.stringify({
				project: {
					id: ctx.projectId,
					name: ctx.projectName,
					description: ctx.projectDescription
				},
				goals: ctx.goals.map((g) => ({ name: g.name, description: g.description })),
				documents: ctx.documents.map((d) => ({
					id: d.id,
					title: d.title,
					state_key: d.state_key,
					updated_at: d.updated_at,
					parent_id: d.parent_id
				})),
				tasks: ctx.tasks.map((t) => ({
					id: t.id,
					title: t.title,
					state_key: t.state_key,
					updated_at: t.updated_at
				}))
			})
		)
		.digest('hex');
}

/** Walk a doc_structure tree into a childId -> parentId map. Tolerant of shape. */
function buildParentMap(docStructure: unknown): Map<string, string | null> {
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

/** Render a shallow indented outline of the doc tree using document titles. */
function summarizeDocTree(docStructure: unknown, titleById: Map<string, string>): string {
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
	return lines.length ? lines.join('\n') : '(flat — no hierarchy yet)';
}

async function loadLoopContext(projectId: string): Promise<LoopContext | null> {
	const { data: projectRow, error: projectError } = await supabase
		.from('onto_projects')
		.select('id, name, description, doc_structure, deleted_at, archived_at')
		.eq('id', projectId)
		.maybeSingle();

	if (projectError) throw new Error(`Failed to load project: ${projectError.message}`);
	if (!projectRow || projectRow.deleted_at || projectRow.archived_at) return null;

	const { data: graphData, error: graphError } = await supabase.rpc(
		'load_project_graph_context',
		{ p_project_id: projectId }
	);
	if (graphError) throw new Error(`Failed to load project graph: ${graphError.message}`);

	const payload = graphData as any;
	const rawDocs: any[] = Array.isArray(payload?.documents) ? payload.documents : [];
	const rawTasks: any[] = Array.isArray(payload?.tasks) ? payload.tasks : [];
	const rawGoals: any[] = Array.isArray(payload?.goals) ? payload.goals : [];

	const parentMap = buildParentMap(projectRow.doc_structure);
	const titleById = new Map<string, string>(
		rawDocs.map((d) => [d.id as string, (d.title as string) ?? 'Untitled'])
	);

	const documents: LoopDocument[] = rawDocs.map((d) => ({
		id: d.id,
		title: d.title ?? 'Untitled',
		type_key: d.type_key ?? null,
		state_key: d.state_key ?? null,
		description: d.description ?? null,
		updated_at: d.updated_at ?? d.created_at ?? null,
		parent_id: parentMap.get(d.id) ?? null
	}));

	const tasks: LoopTask[] = rawTasks
		.filter((t) => t.state_key !== 'done')
		.slice(0, 20)
		.map((t) => ({
			id: t.id,
			title: t.title ?? 'Untitled',
			state_key: t.state_key ?? null,
			updated_at: t.updated_at ?? t.created_at ?? null
		}));

	return {
		projectId,
		projectName: projectRow.name ?? 'Untitled project',
		projectDescription: projectRow.description ?? null,
		goals: rawGoals.slice(0, 10).map((g) => ({
			name: g.name ?? g.goal ?? 'Untitled goal',
			description: g.description ?? null
		})),
		documents,
		docStructureSummary: summarizeDocTree(projectRow.doc_structure, titleById),
		tasks
	};
}

async function failRun(runId: string, message: string): Promise<void> {
	await supabase
		.from('project_loop_runs')
		.update({ status: 'failed', error_message: message, finished_at: nowIso() })
		.eq('id', runId);
}

export async function processProjectLoopJob(
	job: ProcessingJob<ProjectLoopJobMetadata>
): Promise<{ success: boolean; runId?: string; suggestionCount?: number; skipped?: boolean }> {
	const { runId, projectId } = job.data;

	if (!PROJECT_LOOPS_ENABLED) {
		await job.log('Project loops disabled (ENABLE_PROJECT_LOOPS); skipping.');
		if (runId) await failRun(runId, 'feature_disabled');
		return { success: true, skipped: true };
	}

	if (!runId || !projectId) {
		throw new Error('runId and projectId are required');
	}

	await job.log(`Project loop started for project ${projectId} (run ${runId})`);

	const { data: runRow, error: runError } = await supabase
		.from('project_loop_runs')
		.select('*')
		.eq('id', runId)
		.maybeSingle();

	if (runError) throw new Error(`Failed to load loop run: ${runError.message}`);
	if (!runRow) throw new Error(`Loop run ${runId} not found`);
	const run = runRow as ProjectLoopRun;

	await supabase
		.from('project_loop_runs')
		.update({ status: 'running', started_at: nowIso() })
		.eq('id', runId);

	try {
		const ctx = await loadLoopContext(projectId);
		if (!ctx) {
			await job.log('Project inactive/archived; nothing to reconcile.');
			await supabase
				.from('project_loop_runs')
				.update({
					status: 'completed',
					summary: 'Project inactive or archived; no suggestions.',
					suggestion_count: 0,
					finished_at: nowIso()
				})
				.eq('id', runId);
			return { success: true, runId, suggestionCount: 0 };
		}

		let totalCost = 0;
		const onUsage = async (event: UsageEvent) => {
			totalCost += event.totalCost ?? 0;
		};

		const llm = new SmartLLMService({ supabase });
		const sourceFingerprint = buildSourceFingerprint(ctx);

		// v1 generators: doc organization + outdated docs.
		const [docOrg, outdated] = await Promise.all([
			generateDocOrganization({
				llm,
				ctx,
				userId: run.user_id,
				chatSessionId: run.chat_session_id ?? undefined,
				onUsage
			}),
			generateOutdatedDocs({
				llm,
				ctx,
				userId: run.user_id,
				chatSessionId: run.chat_session_id ?? undefined,
				onUsage
			})
		]);

		const proposed: ProposedSuggestion[] = [...docOrg, ...outdated].slice(0, MAX_SUGGESTIONS);

		if (proposed.length) {
			const rows = proposed.map((s, index) => ({
				run_id: runId,
				project_id: projectId,
				kind: s.kind,
				risk_tier: s.risk_tier,
				title: s.title,
				rationale: s.rationale ?? null,
				why_now: s.why_now ?? null,
				confidence: s.confidence ?? null,
				evidence_refs: (s.evidence_refs ?? []) as unknown as Json,
				preview: (s.preview ?? null) as unknown as Json | null,
				operations: s.operations as unknown as Json,
				freshness_state: s.freshness_state ?? 'fresh',
				reversible: s.reversible ?? null,
				undo_operations: (s.undo_operations ?? null) as unknown as Json | null,
				source_fingerprint: s.source_fingerprint ?? sourceFingerprint,
				status: 'pending' as const,
				sort_order: s.sort_order ?? index
			}));
			const { error: insertError } = await supabase.from('project_suggestions').insert(rows);
			if (insertError)
				throw new Error(`Failed to insert suggestions: ${insertError.message}`);
		}

		const summary = proposed.length
			? `${proposed.length} suggestion${proposed.length === 1 ? '' : 's'}: ${docOrg.length} organization, ${outdated.length} outdated-doc.`
			: 'No reconciliation suggestions — project looks tidy.';

		await supabase
			.from('project_loop_runs')
			.update({
				status: proposed.length ? 'waiting_review' : 'completed',
				summary,
				suggestion_count: proposed.length,
				cost_usd: totalCost || null,
				finished_at: nowIso()
			})
			.eq('id', runId);

		await job.log(`Project loop completed: ${summary}`);
		return { success: true, runId, suggestionCount: proposed.length };
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		await job.log(`Project loop failed: ${message}`);
		await failRun(runId, message);
		throw error;
	}
}
