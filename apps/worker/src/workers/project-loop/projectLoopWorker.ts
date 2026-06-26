// apps/worker/src/workers/project-loop/projectLoopWorker.ts
//
// buildos_project_loop job processor. Runs a per-project reconciliation pass and
// writes reviewable suggestions to project_suggestions. It does NOT mutate the
// project — proposed changes are replayed by the web app on user approval.

import type {
	Json,
	ProjectLoopBrief,
	ProjectLoopJobMetadata,
	ProjectLoopRun,
	ProposedSuggestion
} from '@buildos/shared-types';
import type { ProcessingJob } from '../../lib/supabaseQueue';
import { supabase } from '../../lib/supabase';
import { SmartLLMService } from '../../lib/services/smart-llm-service';
import type { UsageEvent } from '../homework/engine/homeworkEngine';
import { PROJECT_LOOPS_ENABLED } from '../../config/projectLoops';
import {
	type LoopContext,
	type LoopDocument,
	type LoopPriorDecision,
	type LoopTask,
	generateDrift,
	generateDocOrganization,
	generateOutdatedDocs,
	generateProjectBrief,
	generateTaskConflicts
} from './generators';
import {
	buildProjectLoopParentMap,
	buildProjectLoopSourceFingerprint,
	summarizeProjectLoopDocTree,
	syncInboxItemForProjectSuggestion
} from '@buildos/shared-agent-ops';

const MAX_SUGGESTIONS = 25;
const PROJECT_LOOP_COST_CAP_USD = 0.35;
const PRIOR_DECISION_LOOKBACK_DAYS = 60;

function nowIso(): string {
	return new Date().toISOString();
}

function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function asString(value: unknown): string | null {
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function parseDecisionFeedback(value: unknown): {
	reason?: string | null;
	note?: string | null;
} {
	const record = asRecord(value);
	return {
		reason: asString(record?.reason),
		note: asString(record?.note)
	};
}

async function loadPriorDecisions(projectId: string): Promise<LoopPriorDecision[]> {
	const since = new Date(
		Date.now() - PRIOR_DECISION_LOOKBACK_DAYS * 24 * 60 * 60 * 1000
	).toISOString();
	const { data, error } = await supabase
		.from('project_suggestions')
		.select('title, kind, status, user_feedback, decided_at, updated_at')
		.eq('project_id', projectId)
		.in('status', ['rejected', 'applied', 'delegated', 'superseded'])
		.not('user_feedback', 'is', null)
		.gte('updated_at', since)
		.order('updated_at', { ascending: false })
		.limit(30);

	if (error) {
		console.warn(
			`[ProjectLoops] Failed to load prior decisions for project ${projectId}:`,
			error.message
		);
		return [];
	}

	return ((data ?? []) as Record<string, unknown>[])
		.map((row): LoopPriorDecision | null => {
			const title = asString(row.title);
			const kind = asString(row.kind);
			const status = asString(row.status);
			if (!title || !kind || !status) return null;
			const feedback = parseDecisionFeedback(row.user_feedback);
			return {
				title,
				kind,
				status,
				reason: feedback.reason,
				note: feedback.note,
				decided_at: asString(row.decided_at) ?? asString(row.updated_at)
			};
		})
		.filter((decision): decision is LoopPriorDecision => Boolean(decision));
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
	const priorDecisions = await loadPriorDecisions(projectId);

	const parentMap = buildProjectLoopParentMap(projectRow.doc_structure);
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
			description: t.description ?? null,
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
		docStructureSummary: summarizeProjectLoopDocTree(projectRow.doc_structure, titleById),
		tasks,
		priorDecisions
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

		const llm = new SmartLLMService({
			supabase,
			appName: 'BuildOS Project Loop Worker'
		});
		const sourceFingerprint = buildProjectLoopSourceFingerprint(ctx);
		const skippedGenerators: string[] = [];
		const runGenerator = async (
			label: string,
			generator: () => Promise<ProposedSuggestion[]>
		): Promise<ProposedSuggestion[]> => {
			if (totalCost >= PROJECT_LOOP_COST_CAP_USD) {
				skippedGenerators.push(label);
				await job.log(
					`Skipping ${label}; project loop cost cap reached ($${totalCost.toFixed(4)})`
				);
				return [];
			}
			return generator();
		};

		const brief: ProjectLoopBrief = await generateProjectBrief({
			llm,
			ctx,
			userId: run.user_id,
			chatSessionId: run.chat_session_id ?? undefined,
			onUsage
		});

		const docOrg = await runGenerator('doc organization', () =>
			generateDocOrganization({
				llm,
				ctx,
				userId: run.user_id,
				chatSessionId: run.chat_session_id ?? undefined,
				onUsage
			})
		);
		const outdated = await runGenerator('outdated docs', () =>
			generateOutdatedDocs({
				llm,
				ctx,
				userId: run.user_id,
				chatSessionId: run.chat_session_id ?? undefined,
				onUsage
			})
		);
		const drift = await runGenerator('drift', () =>
			generateDrift({
				llm,
				ctx,
				userId: run.user_id,
				chatSessionId: run.chat_session_id ?? undefined,
				onUsage
			})
		);
		const taskConflicts = await runGenerator('task conflicts', () =>
			generateTaskConflicts({
				llm,
				ctx,
				userId: run.user_id,
				chatSessionId: run.chat_session_id ?? undefined,
				onUsage
			})
		);

		const proposed: ProposedSuggestion[] = [
			...outdated,
			...taskConflicts,
			...docOrg,
			...drift
		].slice(0, MAX_SUGGESTIONS);

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
			const { data: insertedSuggestions, error: insertError } = await supabase
				.from('project_suggestions')
				.insert(rows)
				.select('*');
			if (insertError)
				throw new Error(`Failed to insert suggestions: ${insertError.message}`);
			for (const suggestion of insertedSuggestions ?? []) {
				try {
					await syncInboxItemForProjectSuggestion({
						supabase: supabase as any,
						suggestion: suggestion as unknown as Record<string, unknown>
					});
				} catch (syncError) {
					console.warn(
						`⚠️ Failed to sync AI Inbox item for project suggestion ${suggestion.id}:`,
						syncError instanceof Error ? syncError.message : syncError
					);
				}
			}
		}

		const summaryBase = proposed.length
			? `${proposed.length} suggestion${proposed.length === 1 ? '' : 's'}: ${docOrg.length} organization, ${outdated.length} outdated-doc, ${drift.length} drift, ${taskConflicts.length} task-conflict.`
			: 'No reconciliation suggestions — project looks tidy.';
		const summary = skippedGenerators.length
			? `${summaryBase} Skipped ${skippedGenerators.join(', ')} after cost cap.`
			: summaryBase;

		await supabase
			.from('project_loop_runs')
			.update({
				status: proposed.length ? 'waiting_review' : 'completed',
				brief: brief as unknown as Json,
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
