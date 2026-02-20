// apps/worker/src/workers/homework/homeworkWorker.ts
import type { ProcessingJob } from '../../lib/supabaseQueue';
import type { Database, HomeworkJobMetadata, Json } from '@buildos/shared-types';
import { supabase } from '../../lib/supabase';
import { SmartLLMService } from '../../lib/services/smart-llm-service';
import { runHomeworkIteration, type UsageEvent } from './engine/homeworkEngine';
import { createTrackedInAppNotification } from '../../lib/utils/trackedInAppNotification';

const DEFAULT_MAX_WALL_CLOCK_MS = 60 * 60 * 1000; // 60 minutes

type HomeworkRun = Database['public']['Tables']['homework_runs']['Row'];

type HomeworkRunStatus = Database['public']['Enums']['homework_run_status'];

type HomeworkIterationStatus = Database['public']['Enums']['homework_iteration_status'];
type HomeworkIterationRow = Database['public']['Tables']['homework_run_iterations']['Row'];

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

async function loadScratchpadContent(runId: string): Promise<string | null> {
	const { data } = await supabase
		.from('onto_documents')
		.select('content')
		.contains('props', { homework_run_id: runId, doc_role: 'scratchpad' })
		.order('updated_at', { ascending: false })
		.limit(1)
		.maybeSingle();
	return data?.content ?? null;
}

async function synthesizeRunReport(params: {
	llm: SmartLLMService;
	run: HomeworkRun;
	iteration: number;
	scratchpad: string;
	onUsage: (event: UsageEvent) => Promise<void>;
}): Promise<Json | null> {
	const { llm, run, iteration, scratchpad, onUsage } = params;
	const systemPrompt = `You are a BuildOS Homework summarizer. Return ONLY valid JSON with this schema:\n{\n  \"title\": string,\n  \"objective\": string,\n  \"status\": string,\n  \"summary\": string,\n  \"what_changed\": {\n    \"created\": [{ \"type\": string, \"id\": string, \"title\": string }],\n    \"updated\": [{ \"type\": string, \"id\": string, \"title\": string }],\n    \"linked\": [{ \"from_id\": string, \"to_id\": string, \"relationship\": string }]\n  },\n  \"artifacts\": {\n    \"documents\": [{ \"id\": string, \"title\": string }]\n  },\n  \"metrics\": {\n    \"iterations\": number,\n    \"duration_ms\": number,\n    \"total_tokens\": number,\n    \"total_cost_usd\": number\n  },\n  \"stopping_reason\": { \"type\": string, \"detail\": string }\n}\n\nRules:\n- Use only information present in the scratchpad and run metadata.\n- Keep summary 5-10 sentences.`;

	const userPrompt = `Run Objective: ${run.objective}\nStatus: ${run.status}\nIteration: ${iteration}\nScratchpad:\n${scratchpad.slice(-8000)}`;

	try {
		const report = await llm.getJSONResponse<Json>({
			systemPrompt,
			userPrompt,
			userId: run.user_id,
			profile: 'balanced',
			validation: { retryOnParseError: true, maxRetries: 2 },
			operationType: 'other',
			chatSessionId: run.chat_session_id ?? undefined,
			// Note: workspace_project_id is an onto_project ID, not a main project ID
			metadata: {
				homework_run_id: run.id,
				iteration,
				report: true,
				onto_project_id: run.workspace_project_id ?? undefined
			},
			onUsage
		});

		return report;
	} catch (error) {
		console.error('[Homework] Failed to synthesize report', error);
		return null;
	}
}

async function notifyUserCompletion(params: {
	run: HomeworkRun;
	status: HomeworkRunStatus;
}): Promise<void> {
	const { run, status } = params;

	let title: string;
	let message: string;
	let eventType: string;

	switch (status) {
		case 'completed':
			title = 'Homework complete';
			message = 'Your homework run has finished.';
			eventType = 'homework.run_completed';
			break;
		case 'stopped':
			title = 'Homework stopped';
			message = 'Your homework run has stopped. You can continue anytime.';
			eventType = 'homework.run_stopped';
			break;
		case 'failed':
			title = 'Homework failed';
			message = 'Your homework run encountered an error.';
			eventType = 'homework.run_failed';
			break;
		case 'canceled':
			title = 'Homework canceled';
			message = 'Your homework run was canceled.';
			eventType = 'homework.run_canceled';
			break;
		default:
			title = 'Homework update';
			message = `Your homework run status: ${status}`;
			eventType = 'homework.run_updated';
	}

	const result = await createTrackedInAppNotification({
		supabase,
		recipientUserId: run.user_id,
		eventType,
		eventSource: 'worker_job',
		actorUserId: run.user_id,
		type: 'homework',
		title,
		message,
		actionUrl: `/homework/runs/${run.id}`,
		payload: {
			run_id: run.id,
			status,
			iterations: run.iteration,
			metrics: run.metrics ?? null
		},
		data: {
			run_id: run.id,
			status,
			iterations: run.iteration,
			metrics: run.metrics ?? null
		}
	});
	if (!result.success) {
		console.error('[Homework] Failed to create tracked completion notification', {
			runId: run.id,
			userId: run.user_id,
			status,
			error: result.error
		});
	}
}

function initMetrics(run: HomeworkRun) {
	const base =
		run.metrics && typeof run.metrics === 'object' ? (run.metrics as Record<string, any>) : {};
	const fallbackDuration =
		typeof run.duration_ms === 'number' && !isNaN(run.duration_ms) ? run.duration_ms : 0;
	return {
		metrics: base,
		tokensTotal: typeof base.tokens_total === 'number' ? base.tokens_total : 0,
		costTotal: typeof base.cost_total_usd === 'number' ? base.cost_total_usd : 0,
		runningMs: typeof base.running_ms === 'number' ? base.running_ms : fallbackDuration,
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

function getBudgetNumber(
	run: HomeworkRun,
	job: HomeworkJobMetadata,
	key: 'max_cost_usd' | 'max_total_tokens'
): number | null {
	const runBudget = (run.budgets as Record<string, unknown>)?.[key];
	const jobBudget = job.budgets?.[key];
	if (typeof jobBudget === 'number') return jobBudget;
	if (typeof runBudget === 'number') return runBudget;
	return null;
}

export async function processHomeworkJob(job: ProcessingJob<HomeworkJobMetadata>) {
	const { run_id, iteration } = job.data;
	const jobStart = Date.now();
	const iterationStart = jobStart;

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

	const runStartedAt = run.started_at ?? nowIso();
	const iterationStartedAt = nowIso();
	const updatedAt = nowIso();
	const nextIteration = Math.max(run.iteration ?? 0, iteration);

	// Mark run as running and set started_at if needed
	await supabase
		.from('homework_runs')
		.update({
			status: 'running',
			started_at: run.started_at ?? runStartedAt,
			iteration: nextIteration,
			updated_at: updatedAt
		})
		.eq('id', run_id);

	// Emit run_started once per run - use seq 0 for first event
	if (!run.started_at) {
		await insertRunEvent(run_id, iteration, { type: 'run_started', runId: run_id }, 0);
	}

	// Create iteration row; tolerate duplicate by selecting existing on conflict
	let iterationRow: HomeworkIterationRow | null = null;
	const insertResult = await supabase
		.from('homework_run_iterations')
		.insert({
			run_id,
			iteration,
			branch_id: 'main',
			status: 'success' as HomeworkIterationStatus,
			started_at: iterationStartedAt,
			metrics: {}
		})
		.select('*')
		.single();
	if (insertResult.error && insertResult.error.code === '23505') {
		const { data: existing } = await supabase
			.from('homework_run_iterations')
			.select('*')
			.eq('run_id', run_id)
			.eq('iteration', iteration)
			.limit(1)
			.maybeSingle();
		iterationRow = existing ?? null;
	} else {
		iterationRow = insertResult.data ?? null;
	}

	const iterationSeqBase = 1000 * iteration;
	await insertRunEvent(
		run_id,
		iteration,
		{ type: 'iteration_started', runId: run_id, iteration },
		iterationSeqBase + 1
	);

	const metricsState = initMetrics(run);
	let iterationTokens = 0;
	let iterationCost = 0;
	let costEventSeq = 20;
	const usageTracker = async (event: UsageEvent) => {
		metricsState.tokensTotal += event.totalTokens;
		metricsState.costTotal += event.totalCost;
		iterationTokens += event.totalTokens;
		iterationCost += event.totalCost;

		const existing = metricsState.byModel[event.model] || { tokens: 0, cost: 0 };
		existing.tokens += event.totalTokens;
		existing.cost += event.totalCost;
		metricsState.byModel[event.model] = existing;

		metricsState.metrics.tokens_total = metricsState.tokensTotal;
		metricsState.metrics.cost_total_usd = metricsState.costTotal;
		metricsState.metrics.running_ms = metricsState.runningMs;
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

	let iterationResult: Awaited<ReturnType<typeof runHomeworkIteration>>;
	try {
		iterationResult = await runHomeworkIteration({
			supabase,
			llm,
			run,
			userId: run.user_id,
			iteration,
			onUsage: usageTracker
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Homework iteration failed';
		const failedAt = nowIso();
		const elapsedRunningMs = metricsState.runningMs + (Date.now() - iterationStart);
		const stopReason = buildStopReason('error', message);

		if (iterationRow?.id) {
			await supabase
				.from('homework_run_iterations')
				.update({
					ended_at: failedAt,
					status: 'failed',
					error: message,
					metrics: {
						tokens: iterationTokens,
						cost_usd: iterationCost
					}
				})
				.eq('id', iterationRow.id);
		}

		await insertRunEvent(
			run_id,
			iteration,
			{ type: 'iteration_failed', runId: run_id, iteration, error: message },
			iterationSeqBase + 2
		);

		await insertRunEvent(
			run_id,
			iteration,
			{ type: 'run_failed', runId: run_id, stopReason },
			iterationSeqBase + 3
		);

		await supabase
			.from('homework_runs')
			.update({
				status: 'failed',
				completed_at: failedAt,
				duration_ms: elapsedRunningMs,
				stop_reason: stopReason,
				updated_at: failedAt,
				iteration
			})
			.eq('id', run_id);

		await job.log(`Homework run ${run_id} iteration ${iteration} failed: ${message}`);
		return { success: false, run_id, iteration, status: 'failed', message };
	}

	const summary = iterationResult.summary;
	const endedAt = nowIso();
	const waitingOnUser = iterationResult.status.needs_user_input;
	const iterationRunningMs = Date.now() - iterationStart;
	metricsState.runningMs += iterationRunningMs;

	if (iterationRow?.id) {
		await supabase
			.from('homework_run_iterations')
			.update({
				ended_at: endedAt,
				summary,
				status: waitingOnUser ? ('waiting_on_user' as HomeworkIterationStatus) : 'success',
				artifacts: {
					...((iterationResult.artifacts as Record<string, unknown>) ?? {}),
					plan: iterationResult.plan ?? null
				},
				metrics: {
					tokens: iterationTokens,
					cost_usd: iterationCost
				}
			})
			.eq('id', iterationRow.id);
	}

	await insertRunEvent(
		run_id,
		iteration,
		{ type: 'iteration_completed', runId: run_id, iteration, status: 'success', summary },
		iterationSeqBase + 2
	);

	const elapsedMs = metricsState.runningMs;
	const maxMs = getBudgetMs(run, job.data);
	const maxIterations = run.max_iterations ?? job.data.budgets?.max_iterations ?? null;
	const maxCostUsd = getBudgetNumber(run, job.data, 'max_cost_usd');
	const maxTotalTokens = getBudgetNumber(run, job.data, 'max_total_tokens');
	const exitSignal = iterationResult.status.exit_signal;
	const hasEvidence = (iterationResult.status.completion_evidence ?? []).length > 0;
	const progressMade = iterationResult.progressMade ?? false;

	const prevNoProgress =
		typeof metricsState.metrics.no_progress_streak === 'number'
			? metricsState.metrics.no_progress_streak
			: 0;
	const noProgressStreak = progressMade ? 0 : prevNoProgress + 1;
	metricsState.metrics.no_progress_streak = noProgressStreak;
	metricsState.metrics.running_ms = metricsState.runningMs;
	metricsState.metrics.tokens_total = metricsState.tokensTotal;
	metricsState.metrics.cost_total_usd = metricsState.costTotal;
	metricsState.metrics.plan = iterationResult.plan ?? metricsState.metrics.plan;

	let finalStatus: HomeworkRunStatus;
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
	} else if (maxCostUsd !== null && metricsState.costTotal >= maxCostUsd) {
		finalStatus = 'stopped';
		stopReason = buildStopReason(
			'budget_cost',
			`Reached max cost budget ($${maxCostUsd.toFixed(2)}).`
		);
		await insertRunEvent(
			run_id,
			iteration,
			{ type: 'run_stopped', runId: run_id, stopReason },
			iterationSeqBase + 3
		);
	} else if (maxTotalTokens !== null && metricsState.tokensTotal >= maxTotalTokens) {
		finalStatus = 'stopped';
		stopReason = buildStopReason(
			'budget_tokens',
			`Reached max token budget (${maxTotalTokens}).`
		);
		await insertRunEvent(
			run_id,
			iteration,
			{ type: 'run_stopped', runId: run_id, stopReason },
			iterationSeqBase + 3
		);
	} else if (maxIterations !== null && iteration > maxIterations) {
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
	} else if (noProgressStreak >= 2) {
		finalStatus = 'stopped';
		stopReason = buildStopReason('no_progress', 'No progress for 2 iterations.');
		await insertRunEvent(
			run_id,
			iteration,
			{ type: 'run_stopped', runId: run_id, stopReason },
			iterationSeqBase + 3
		);
	} else {
		// Bug #13: No exit condition matched - should continue
		finalStatus = 'queued';
		await insertRunEvent(
			run_id,
			iteration,
			{ type: 'iteration_completed_continuing', runId: run_id, iteration },
			iterationSeqBase + 3
		);
	}

	// Queue next job FIRST if needed, before updating status (Bug #10: prevent race condition)
	if (finalStatus === 'queued') {
		const nextJobIteration = iteration + 1;
		const { error: queueError } = await supabase.rpc('add_queue_job', {
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

		if (queueError) {
			// If queueing fails, mark as failed instead of queued to prevent stuck runs
			finalStatus = 'failed';
			stopReason = buildStopReason(
				'queue_error',
				`Failed to queue next iteration: ${queueError.message}`
			);
			await insertRunEvent(
				run_id,
				iteration,
				{ type: 'run_failed', runId: run_id, stopReason },
				iterationSeqBase + 5
			);
		}
	}

	// NOW update run status
	await supabase
		.from('homework_runs')
		.update({
			status: finalStatus,
			completed_at: finalStatus === 'completed' || finalStatus === 'stopped' ? endedAt : null,
			duration_ms: elapsedMs,
			stop_reason: stopReason,
			metrics: metricsState.metrics,
			updated_at: nowIso(),
			iteration
		})
		.eq('id', run_id);

	if (finalStatus !== 'queued' && finalStatus !== 'waiting_on_user') {
		const scratchpad = await loadScratchpadContent(run_id);
		const report =
			scratchpad && !run.report
				? await synthesizeRunReport({
						llm,
						run: { ...run, status: finalStatus, iteration },
						iteration,
						scratchpad,
						onUsage: usageTracker
					})
				: null;

		if (report) {
			await supabase
				.from('homework_runs')
				.update({ report, updated_at: nowIso() })
				.eq('id', run_id);

			await insertRunEvent(
				run_id,
				iteration,
				{ type: 'run_report_created', runId: run_id },
				iterationSeqBase + 4
			);
		} else if (scratchpad && !run.report) {
			// Bug #8: Log event on report synthesis failure
			await insertRunEvent(
				run_id,
				iteration,
				{ type: 'run_report_generation_failed', reason: 'report synthesis returned null' },
				iterationSeqBase + 4
			);
		}

		if (finalStatus === 'completed' || finalStatus === 'stopped') {
			await notifyUserCompletion({
				run: { ...run, status: finalStatus, iteration },
				status: finalStatus
			});
		}
	}

	await job.log(
		`Homework run ${run_id} iteration ${iteration} finished in ${Date.now() - jobStart}ms`
	);

	return { success: true, run_id, iteration, status: finalStatus, message: stopReason?.detail };
}
