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
import { PROJECT_LOOPS_ENABLED } from '../../config/projectLoops';
import { logWorkerError } from '../../lib/errorLogger';
import {
	type LoopContext,
	type LoopDocument,
	type LoopPriorDecision,
	type LoopTask,
	type UsageEvent,
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

async function failRun(
	runId: string,
	message: string,
	metrics?: { totalCost?: number }
): Promise<void> {
	const update: {
		status: 'failed';
		error_message: string;
		finished_at: string;
		cost_usd?: number;
	} = { status: 'failed', error_message: message, finished_at: nowIso() };
	if (metrics?.totalCost && metrics.totalCost > 0) {
		update.cost_usd = metrics.totalCost;
	}
	const { error } = await supabase.from('project_loop_runs').update(update).eq('id', runId);
	if (error) {
		console.error(
			`[ProjectLoops] Failed to persist failed status for run ${runId}: ${error.message}`
		);
	}
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

	// Status-fenced claim: atomically move the run from `queued` → `running`.
	// The stall sweeper (reset_stalled_jobs) can requeue a slow `processing`
	// queue job and start a SECOND concurrent execution of this same runId. Only
	// the execution that flips the row out of `queued` owns the work; any other
	// execution updates 0 rows here and returns without side effects, preventing
	// duplicate project_suggestions / inbox items. Mirrors agentRunWorker's
	// conditional-status claim.
	const { data: claimedRun, error: claimError } = await supabase
		.from('project_loop_runs')
		.update({ status: 'running', started_at: nowIso() })
		.eq('id', runId)
		.eq('status', 'queued')
		.select('*')
		.maybeSingle();

	if (claimError) throw new Error(`Failed to claim loop run: ${claimError.message}`);
	if (!claimedRun) {
		await job.log(
			`Project loop run ${runId} not claimed (already running/terminal); skipping to avoid duplicate execution.`
		);
		return { success: true, runId, skipped: true };
	}
	const run = claimedRun as ProjectLoopRun;

	// Heartbeat touches queue_jobs.updated_at so the 5-min stall sweeper never
	// sees this job as idle across the ~5 sequential LLM calls below. updateProgress
	// swallows its own failures, but guard defensively so a heartbeat never crashes
	// the loop.
	let heartbeatStep = 0;
	const HEARTBEAT_TOTAL = 8;
	const heartbeat = async (message: string): Promise<void> => {
		heartbeatStep += 1;
		try {
			await job.updateProgress({
				current: Math.min(heartbeatStep, HEARTBEAT_TOTAL),
				total: HEARTBEAT_TOTAL,
				message
			});
		} catch (progressError) {
			console.warn(
				`[ProjectLoops] Heartbeat failed for run ${runId}:`,
				progressError instanceof Error ? progressError.message : progressError
			);
		}
	};

	await heartbeat('Loading project context');

	let totalCost = 0;
	let totalPromptTokens = 0;
	let totalCompletionTokens = 0;
	let totalTokens = 0;
	let lastUsage: UsageEvent | null = null;
	const onUsage = async (event: UsageEvent) => {
		totalCost += event.totalCost ?? 0;
		totalPromptTokens += event.promptTokens ?? 0;
		totalCompletionTokens += event.completionTokens ?? 0;
		totalTokens += event.totalTokens ?? 0;
		lastUsage = event;
	};

	try {
		const ctx = await loadLoopContext(projectId);
		if (!ctx) {
			await job.log('Project inactive/archived; nothing to reconcile.');
			const { error: inactiveError } = await supabase
				.from('project_loop_runs')
				.update({
					status: 'completed',
					summary: 'Project inactive or archived; no suggestions.',
					suggestion_count: 0,
					finished_at: nowIso()
				})
				.eq('id', runId);
			if (inactiveError) {
				console.error(
					`[ProjectLoops] Failed to persist completed status for inactive run ${runId}: ${inactiveError.message}`
				);
				throw new Error(
					`Failed to persist completed status for run ${runId}: ${inactiveError.message}`
				);
			}
			return { success: true, runId, suggestionCount: 0 };
		}

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
			// Heartbeat before each LLM generator so the stall sweeper never
			// reclaims this job mid-run.
			await heartbeat(`Generating ${label}`);
			return generator();
		};

		await heartbeat('Generating project brief');
		const brief: ProjectLoopBrief = await generateProjectBrief({
			llm,
			ctx,
			userId: run.user_id,
			chatSessionId: run.chat_session_id ?? undefined,
			runId,
			onUsage
		});

		const docOrg = await runGenerator('doc organization', () =>
			generateDocOrganization({
				llm,
				ctx,
				userId: run.user_id,
				chatSessionId: run.chat_session_id ?? undefined,
				runId,
				onUsage
			})
		);
		const outdated = await runGenerator('outdated docs', () =>
			generateOutdatedDocs({
				llm,
				ctx,
				userId: run.user_id,
				chatSessionId: run.chat_session_id ?? undefined,
				runId,
				onUsage
			})
		);
		const drift = await runGenerator('drift', () =>
			generateDrift({
				llm,
				ctx,
				userId: run.user_id,
				chatSessionId: run.chat_session_id ?? undefined,
				runId,
				onUsage
			})
		);
		const taskConflicts = await runGenerator('task conflicts', () =>
			generateTaskConflicts({
				llm,
				ctx,
				userId: run.user_id,
				chatSessionId: run.chat_session_id ?? undefined,
				runId,
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
			await heartbeat('Writing suggestions');
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

		const { error: terminalError } = await supabase
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
		if (terminalError) {
			// The suggestions were written but the run row is still `running`.
			// Fail loudly and surface it through the catch path so the job does
			// NOT report success against a run row stuck in a non-terminal state.
			console.error(
				`[ProjectLoops] Failed to persist terminal status for run ${runId}: ${terminalError.message}`
			);
			throw new Error(
				`Failed to persist terminal status for run ${runId}: ${terminalError.message}`
			);
		}

		await job.log(`Project loop completed: ${summary}`);
		return { success: true, runId, suggestionCount: proposed.length };
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		const usageForError = lastUsage as UsageEvent | null;
		await job.log(`Project loop failed: ${message}`);
		await failRun(runId, message, { totalCost });
		await logWorkerError(error, {
			userId: run.user_id,
			projectId,
			operationType: 'project_loop_run',
			tableName: 'project_loop_runs',
			recordId: runId,
			llmProvider: usageForError?.model?.split('/')[0],
			llmModel: usageForError?.model,
			llmPromptTokens: totalPromptTokens,
			llmCompletionTokens: totalCompletionTokens,
			llmTotalTokens: totalTokens,
			severity: 'error',
			operationPayload: {
				runId,
				projectId,
				queueJobId: job.id,
				chatSessionId: run.chat_session_id,
				triggerReason: run.trigger_reason,
				totalCostUsd: totalCost,
				totalPromptTokens,
				totalCompletionTokens,
				totalTokens,
				lastModel: usageForError?.model ?? null
			},
			metadata: {
				errorSource: 'project_loop_worker',
				runId,
				projectId,
				queueJobId: job.id,
				chatSessionId: run.chat_session_id,
				triggerReason: run.trigger_reason,
				totalCostUsd: totalCost,
				costCapUsd: PROJECT_LOOP_COST_CAP_USD,
				totalPromptTokens,
				totalCompletionTokens,
				totalTokens,
				lastModel: usageForError?.model ?? null
			}
		});
		throw error;
	}
}
