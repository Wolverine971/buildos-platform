// apps/worker/src/workers/homework/homeworkWorker.ts
import type { ProcessingJob } from '../../lib/supabaseQueue';
import type { Database, HomeworkJobMetadata, Json } from '@buildos/shared-types';
import { supabase } from '../../lib/supabase';
import { SmartLLMService } from '../../lib/services/smart-llm-service';
import { runHomeworkIteration, type UsageEvent } from './engine/homeworkEngine';

const DEFAULT_MAX_WALL_CLOCK_MS = 60 * 60 * 1000; // 60 minutes

type HomeworkRun = Database['public']['Tables']['homework_runs']['Row'];

type HomeworkRunStatus = Database['public']['Enums']['homework_run_status'];

type HomeworkIterationStatus = Database['public']['Enums']['homework_iteration_status'];

const TERMINAL_STATUSES: HomeworkRunStatus[] = ['completed', 'stopped', 'canceled', 'failed'];

function nowIso() {
	return new Date().toISOString();
}

async function insertRunEvent(
	runId: string,
	iteration: number,
	event: Json,
	seq: number
): Promise<void> {
	await supabase.from('homework_run_events').insert({
		run_id: runId,
		iteration,
		seq,
		event
	});
}

function initMetrics(run: HomeworkRun) {
	const base =
		run.metrics && typeof run.metrics === 'object' ? (run.metrics as Record<string, any>) : {};
	return {
		metrics: base,
		tokensTotal: typeof base.tokens_total === 'number' ? base.tokens_total : 0,
		costTotal: typeof base.cost_total_usd === 'number' ? base.cost_total_usd : 0,
		byModel: (base.by_model as Record<string, { tokens: number; cost: number }>) || {}
	};
}

function buildStopReason(type: string, detail: string) {
	return { type, detail };
}

function getBudgetMs(run: HomeworkRun, job: HomeworkJobMetadata): number {
	const runBudget = (run.budgets as Record<string, unknown>)?.max_wall_clock_ms;
	const jobBudget = job.budgets?.max_wall_clock_ms;
	if (typeof jobBudget === 'number') return jobBudget;
	if (typeof runBudget === 'number') return runBudget;
	return DEFAULT_MAX_WALL_CLOCK_MS;
}

export async function processHomeworkJob(job: ProcessingJob<HomeworkJobMetadata>) {
	const { run_id, iteration } = job.data;
	const jobStart = Date.now();

	await job.log(`Homework run ${run_id} iteration ${iteration} started`);

	const { data: run, error } = await supabase
		.from('homework_runs')
		.select('*')
		.eq('id', run_id)
		.single();

	if (error || !run) {
		await job.log(`Homework run ${run_id} not found: ${error?.message ?? 'missing'}`);
		return { success: false, run_id, iteration, status: 'failed', message: 'Run not found' };
	}

	if (TERMINAL_STATUSES.includes(run.status)) {
		await job.log(`Homework run ${run_id} already terminal (${run.status})`);
		return {
			success: true,
			run_id,
			iteration,
			status: run.status,
			message: 'Run already terminal'
		};
	}

	const startedAt = run.started_at ?? nowIso();
	const updatedAt = nowIso();
	const nextIteration = Math.max(run.iteration ?? 0, iteration);

	// Mark run as running and set started_at if needed
	await supabase
		.from('homework_runs')
		.update({
			status: 'running',
			started_at: run.started_at ?? startedAt,
			iteration: nextIteration,
			updated_at: updatedAt
		})
		.eq('id', run_id);

	// Emit run_started once per run
	if (!run.started_at) {
		await insertRunEvent(run_id, iteration, { type: 'run_started', runId: run_id }, 1);
	}

	// Create iteration row
	const { data: iterationRow } = await supabase
		.from('homework_run_iterations')
		.insert({
			run_id,
			iteration,
			status: 'success' as HomeworkIterationStatus,
			started_at: startedAt,
			metrics: {}
		})
		.select('*')
		.single();

	const iterationSeqBase = 1000 * iteration;
	await insertRunEvent(
		run_id,
		iteration,
		{ type: 'iteration_started', runId: run_id, iteration },
		iterationSeqBase + 1
	);

	const metricsState = initMetrics(run);
	let costEventSeq = 20;
	const usageTracker = async (event: UsageEvent) => {
		metricsState.tokensTotal += event.totalTokens;
		metricsState.costTotal += event.totalCost;

		const existing = metricsState.byModel[event.model] || { tokens: 0, cost: 0 };
		existing.tokens += event.totalTokens;
		existing.cost += event.totalCost;
		metricsState.byModel[event.model] = existing;

		metricsState.metrics.tokens_total = metricsState.tokensTotal;
		metricsState.metrics.cost_total_usd = metricsState.costTotal;
		metricsState.metrics.by_model = metricsState.byModel;

		await supabase
			.from('homework_runs')
			.update({ metrics: metricsState.metrics, updated_at: nowIso() })
			.eq('id', run_id);

		await insertRunEvent(
			run_id,
			iteration,
			{
				type: 'iteration_cost_update',
				runId: run_id,
				iteration,
				delta: {
					model: event.model,
					tokens: event.totalTokens,
					cost_usd: event.totalCost
				},
				totals: {
					tokens: metricsState.tokensTotal,
					cost_usd: metricsState.costTotal
				}
			},
			iterationSeqBase + costEventSeq++
		);
	};

	const llm = new SmartLLMService({
		supabase,
		httpReferer: 'https://buildos.com',
		appName: 'BuildOS Homework Engine'
	});

	const iterationResult = await runHomeworkIteration({
		supabase,
		llm,
		run,
		userId: run.user_id,
		iteration,
		onUsage: usageTracker
	});

	const summary = iterationResult.summary;
	const endedAt = nowIso();
	const waitingOnUser = iterationResult.status.needs_user_input;

	if (iterationRow?.id) {
		await supabase
			.from('homework_run_iterations')
			.update({
				ended_at: endedAt,
				summary,
				status: waitingOnUser ? ('waiting_on_user' as HomeworkIterationStatus) : 'success'
			})
			.eq('id', iterationRow.id);
	}

	await insertRunEvent(
		run_id,
		iteration,
		{ type: 'iteration_completed', runId: run_id, iteration, status: 'success', summary },
		iterationSeqBase + 2
	);

	const elapsedMs = Date.now() - new Date(startedAt).getTime();
	const maxMs = getBudgetMs(run, job.data);
	const maxIterations = run.max_iterations ?? job.data.budgets?.max_iterations ?? null;
	const exitSignal = iterationResult.status.exit_signal;
	const hasEvidence = (iterationResult.status.completion_evidence ?? []).length > 0;

	let finalStatus: HomeworkRunStatus = 'queued';
	let stopReason: { type: string; detail: string } | null = null;

	if (waitingOnUser) {
		finalStatus = 'waiting_on_user';
		stopReason = buildStopReason('waiting_on_user', 'Run waiting on user input.');
		await insertRunEvent(
			run_id,
			iteration,
			{
				type: 'run_waiting_on_user',
				runId: run_id,
				questions: iterationResult.status.blocking_questions ?? []
			},
			iterationSeqBase + 3
		);
	} else if (exitSignal && hasEvidence) {
		finalStatus = 'completed';
		stopReason = buildStopReason('completed', 'Run completed with exit signal and evidence.');
		await insertRunEvent(
			run_id,
			iteration,
			{ type: 'run_completed', runId: run_id, stopReason },
			iterationSeqBase + 3
		);
	} else if (elapsedMs >= maxMs) {
		finalStatus = 'stopped';
		stopReason = buildStopReason(
			'budget_wall_clock',
			`Reached max wall-clock budget (${Math.round(maxMs / 60000)} minutes).`
		);
		await insertRunEvent(
			run_id,
			iteration,
			{ type: 'run_stopped', runId: run_id, stopReason },
			iterationSeqBase + 3
		);
	} else if (maxIterations !== null && iteration >= maxIterations) {
		finalStatus = 'stopped';
		stopReason = buildStopReason(
			'max_iterations',
			`Reached max iterations (${maxIterations}).`
		);
		await insertRunEvent(
			run_id,
			iteration,
			{ type: 'run_stopped', runId: run_id, stopReason },
			iterationSeqBase + 3
		);
	}

	await supabase
		.from('homework_runs')
		.update({
			status: finalStatus,
			completed_at: finalStatus === 'queued' ? null : endedAt,
			duration_ms: finalStatus === 'queued' ? null : elapsedMs,
			stop_reason: stopReason,
			updated_at: nowIso(),
			iteration
		})
		.eq('id', run_id);

	if (finalStatus === 'queued') {
		const nextJobIteration = iteration + 1;
		await supabase.rpc('add_queue_job', {
			p_user_id: run.user_id,
			p_job_type: 'buildos_homework',
			p_metadata: {
				...job.data,
				iteration: nextJobIteration,
				chat_session_id: run.chat_session_id
			},
			p_priority: 7,
			p_scheduled_for: new Date(Date.now() + 5000).toISOString(),
			p_dedup_key: `homework:${run_id}:${nextJobIteration}`
		});
	}

	await job.log(
		`Homework run ${run_id} iteration ${iteration} finished in ${Date.now() - jobStart}ms`
	);

	return { success: true, run_id, iteration, status: finalStatus, message: stopReason?.detail };
}
