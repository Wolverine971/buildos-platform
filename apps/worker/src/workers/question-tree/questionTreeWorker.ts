// apps/worker/src/workers/question-tree/questionTreeWorker.ts
import { randomUUID } from 'node:crypto';
import type { ProcessingJob } from '../../lib/supabaseQueue';
import { OpenRouterQuestionTreeModel, isOpenRouterQuotaError } from './questionTreeModelAdapter';
import type {
	QuestionTreeContextEntry,
	QuestionTreeJobMetadata,
	QuestionTreeModelClient,
	QuestionTreeNode,
	QuestionTreeRun
} from './questionTreeContracts';
import {
	admitProposals,
	claimBatch,
	closeFrontier,
	completeNode,
	completeSeed,
	enqueueAdvance,
	failNode,
	finishRun,
	getRun,
	listNodes,
	listProposals,
	markRunFailed,
	markRunStarted,
	transitionToSynthesis,
	updateFrontierScores
} from './questionTreeRepository';
import { scoreQuestionTreeFrontier } from './questionTreeScheduler';

const TERMINAL_STATUSES = new Set(['completed', 'completed_partial', 'cancelled', 'failed']);

function canAcceptModelResult(run: QuestionTreeRun): boolean {
	return run.status === 'queued' || run.status === 'running' || run.status === 'synthesizing';
}

function buildAncestry(
	node: QuestionTreeNode,
	nodes: QuestionTreeNode[]
): QuestionTreeContextEntry[] {
	const byId = new Map(nodes.map((entry) => [entry.id, entry]));
	const path: QuestionTreeNode[] = [];
	let current: QuestionTreeNode | undefined = node;
	while (current?.parent_node_id) {
		const parent = byId.get(current.parent_node_id);
		if (!parent) break;
		path.unshift(parent);
		current = parent;
	}
	return path.map((entry) => ({
		nodeNumber: entry.node_number,
		question: entry.question,
		answer: entry.answer,
		thesis: entry.thesis
	}));
}

function availableRequestSlots(run: QuestionTreeRun, reserveSynthesis = true): number {
	return Math.max(
		0,
		run.max_provider_requests - run.provider_requests - (reserveSynthesis ? 1 : 0)
	);
}

function belowCostCap(run: QuestionTreeRun): boolean {
	const cost = Number(run.usage?.cost_usd ?? 0);
	const maxCost = Number(run.config?.max_cost_usd ?? 0.02);
	return !Number.isFinite(maxCost) || cost < maxCost;
}

function requestConcurrency(run: QuestionTreeRun): number {
	const configured = Number(run.config?.concurrency);
	const policyCap = run.model_policy === 'free_strict' ? 2 : 4;
	return Number.isFinite(configured)
		? Math.min(policyCap, Math.max(1, Math.floor(configured)))
		: policyCap;
}

async function scheduleFrontier(runId: string): Promise<number> {
	const [run, nodes, proposals] = await Promise.all([
		getRun(runId),
		listNodes(runId),
		listProposals(runId)
	]);
	const remainingSlots = Math.min(
		run.node_limit - run.nodes_created,
		availableRequestSlots(run),
		belowCostCap(run) ? 10 : 0
	);
	const configuredThreshold = Number(run.config?.min_scheduler_score);
	const schedule = scoreQuestionTreeFrontier({
		proposals,
		nodes,
		remainingSlots,
		batchLimit: requestConcurrency(run),
		minScore: Number.isFinite(configuredThreshold) ? configuredThreshold : 0.48
	});
	await updateFrontierScores({ runId, ...schedule });
	return admitProposals(runId, schedule.selectedIds);
}

async function continueOrSynthesize(params: {
	runId: string;
	advanceSequence: number;
}): Promise<void> {
	const admitted = await scheduleFrontier(params.runId);
	const [latestAfterSchedule, nodes, proposals] = await Promise.all([
		getRun(params.runId),
		listNodes(params.runId),
		listProposals(params.runId)
	]);
	const active = nodes.some(
		(node) =>
			node.node_kind === 'question' && (node.status === 'queued' || node.status === 'running')
	);
	const queued = nodes.some((node) => node.node_kind === 'question' && node.status === 'queued');
	const frontierOpen = proposals.some(
		(proposal) => proposal.status === 'proposed' || proposal.status === 'not_selected'
	);
	const exhausted =
		latestAfterSchedule.nodes_created >= latestAfterSchedule.node_limit ||
		availableRequestSlots(latestAfterSchedule) <= 0 ||
		!belowCostCap(latestAfterSchedule);
	if (admitted === 0 && !active && (!frontierOpen || exhausted)) {
		if (frontierOpen && exhausted) {
			await closeFrontier(params.runId, 'budget_exhausted');
		}
		await transitionToSynthesis(params.runId);
	}
	const latest = await getRun(params.runId);
	const earliestLeaseMs = nodes
		.filter((node) => node.status === 'running' && node.lease_expires_at)
		.map((node) => new Date(node.lease_expires_at as string).getTime())
		.filter(Number.isFinite)
		.sort((a, b) => a - b)[0];
	const delayMs =
		admitted === 0 && active && !queued && earliestLeaseMs
			? Math.max(1_000, earliestLeaseMs - Date.now() + 1_000)
			: 0;
	await enqueueAdvance({
		run: latest,
		expectedSequence: params.advanceSequence,
		delayMs
	});
}

async function handleSeed(params: {
	run: QuestionTreeRun;
	job: ProcessingJob<QuestionTreeJobMetadata>;
	model: QuestionTreeModelClient;
}): Promise<void> {
	await params.job.log('Decomposing the root question');
	await markRunStarted(params.run.id);
	try {
		const result = await params.model.seed({ run: params.run, signal: params.job.signal });
		if (params.job.signal.aborted) return;
		const current = await getRun(params.run.id);
		if (!canAcceptModelResult(current)) return;
		await completeSeed({ run: params.run, output: result.value, telemetry: result.telemetry });
		await continueOrSynthesize({
			runId: params.run.id,
			advanceSequence: params.job.data.advance_sequence
		});
	} catch (error) {
		if (params.job.signal.aborted) throw error;
		const current = await getRun(params.run.id);
		if (!canAcceptModelResult(current)) return;
		await markRunFailed({
			runId: params.run.id,
			error,
			quotaPaused: isOpenRouterQuotaError(error, params.run.model_policy)
		});
	}
}

async function handleExplore(params: {
	run: QuestionTreeRun;
	job: ProcessingJob<QuestionTreeJobMetadata>;
	model: QuestionTreeModelClient;
}): Promise<void> {
	const allowed = Math.min(requestConcurrency(params.run), availableRequestSlots(params.run));
	if (allowed <= 0 || !belowCostCap(params.run)) {
		await params.job.log('Exploration budget settled; starting synthesis');
		await transitionToSynthesis(params.run.id);
		const latest = await getRun(params.run.id);
		await enqueueAdvance({
			run: latest,
			expectedSequence: params.job.data.advance_sequence
		});
		return;
	}

	const workerId = `question-tree:${process.pid}:${randomUUID()}`;
	const claimed = await claimBatch({ runId: params.run.id, workerId, limit: allowed });
	if (claimed.length === 0) {
		await continueOrSynthesize({
			runId: params.run.id,
			advanceSequence: params.job.data.advance_sequence
		});
		return;
	}

	await params.job.log(
		`Running ${claimed.length} question agent${claimed.length === 1 ? '' : 's'}`
	);
	const allNodes = await listNodes(params.run.id);
	const settled = await Promise.allSettled(
		claimed.map(async (node) => ({
			node,
			result: await params.model.answer({
				run: params.run,
				node,
				ancestry: buildAncestry(node, allNodes),
				signal: params.job.signal
			})
		}))
	);

	if (params.job.signal.aborted) {
		throw params.job.signal.reason ?? new Error('Question Tree worker lost job ownership');
	}

	let quotaError: unknown = null;
	for (let index = 0; index < settled.length; index += 1) {
		const outcome = settled[index];
		const node = claimed[index];
		if (!node) continue;
		if (outcome?.status === 'fulfilled') {
			await completeNode({
				runId: params.run.id,
				node,
				output: outcome.value.result.value,
				telemetry: outcome.value.result.telemetry
			});
		} else {
			const error = outcome?.reason ?? new Error('Unknown Question Tree model error');
			if (isOpenRouterQuotaError(error, params.run.model_policy)) quotaError = error;
			await failNode({ runId: params.run.id, node, error });
		}
	}

	if (quotaError) {
		const current = await getRun(params.run.id);
		if (!canAcceptModelResult(current)) return;
		await markRunFailed({
			runId: params.run.id,
			error: quotaError,
			quotaPaused: true,
			countProviderRequest: false
		});
		return;
	}

	await continueOrSynthesize({
		runId: params.run.id,
		advanceSequence: params.job.data.advance_sequence
	});
}

async function handleSynthesis(params: {
	run: QuestionTreeRun;
	job: ProcessingJob<QuestionTreeJobMetadata>;
	model: QuestionTreeModelClient;
}): Promise<void> {
	await params.job.log('Synthesizing the completed question tree');
	try {
		const [nodes, proposals] = await Promise.all([
			listNodes(params.run.id),
			listProposals(params.run.id)
		]);
		const result = await params.model.synthesize({
			run: params.run,
			nodes,
			proposals,
			signal: params.job.signal
		});
		if (params.job.signal.aborted) return;
		const current = await getRun(params.run.id);
		if (current.status !== 'synthesizing' || current.phase !== 'synthesize') return;
		await finishRun({ run: params.run, synthesis: result.value, telemetry: result.telemetry });
	} catch (error) {
		if (params.job.signal.aborted) throw error;
		const current = await getRun(params.run.id);
		if (!canAcceptModelResult(current)) return;
		await markRunFailed({
			runId: params.run.id,
			error,
			quotaPaused: isOpenRouterQuotaError(error, params.run.model_policy)
		});
	}
}

export async function processQuestionTreeJob(
	job: ProcessingJob<QuestionTreeJobMetadata>,
	dependencies?: { model?: QuestionTreeModelClient }
): Promise<{ status: string; phase: string }> {
	if (!job.data?.run_id || !Number.isInteger(job.data.advance_sequence)) {
		throw new Error('Invalid Question Tree job metadata');
	}
	const run = await getRun(job.data.run_id);
	if (run.advance_sequence !== job.data.advance_sequence) {
		await job.log(
			`Skipping stale advance ${job.data.advance_sequence}; current is ${run.advance_sequence}`
		);
		return { status: run.status, phase: run.phase };
	}
	if (
		TERMINAL_STATUSES.has(run.status) ||
		run.status === 'paused' ||
		run.status === 'quota_paused'
	) {
		await job.log(`Skipping run in ${run.status} status`);
		return { status: run.status, phase: run.phase };
	}

	const model = dependencies?.model ?? new OpenRouterQuestionTreeModel();
	if (run.phase === 'seed') {
		await handleSeed({ run, job, model });
	} else if (run.phase === 'explore') {
		await handleExplore({ run, job, model });
	} else if (run.phase === 'synthesize') {
		await handleSynthesis({ run, job, model });
	}
	const finished = await getRun(run.id);
	return { status: finished.status, phase: finished.phase };
}
