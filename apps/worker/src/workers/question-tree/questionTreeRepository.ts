// apps/worker/src/workers/question-tree/questionTreeRepository.ts
import { supabase } from '../../lib/supabase';
import type {
	FollowUpQuestion,
	QuestionTreeModelTelemetry,
	QuestionTreeNode,
	QuestionTreeNodeOutput,
	QuestionTreeProposal,
	QuestionTreeRun,
	QuestionTreeSeedOutput,
	QuestionTreeSynthesisOutput,
	QuestionTreeUsage,
	SeedQuestion
} from './questionTreeContracts';

type AnySupabase = {
	// The experiment migration intentionally lands before the next generated Supabase type snapshot.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	from: (table: string) => any;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	rpc: (name: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

const db = supabase as unknown as AnySupabase;

function assertNoError(error: unknown, operation: string): void {
	if (error) {
		const message =
			typeof error === 'object' && error && 'message' in error
				? String((error as { message: unknown }).message)
				: String(error);
		throw new Error(`${operation}: ${message}`);
	}
}

export function normalizeQuestion(question: string): string {
	return question
		.trim()
		.toLowerCase()
		.replace(/[?!.]+$/, '')
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}

function usageWithTelemetry(
	usage: QuestionTreeUsage | null | undefined,
	telemetry: QuestionTreeModelTelemetry
): QuestionTreeUsage {
	return {
		prompt_tokens: (usage?.prompt_tokens ?? 0) + telemetry.prompt_tokens,
		completion_tokens: (usage?.completion_tokens ?? 0) + telemetry.completion_tokens,
		total_tokens: (usage?.total_tokens ?? 0) + telemetry.total_tokens,
		cost_usd: (usage?.cost_usd ?? 0) + telemetry.cost_usd,
		latency_ms: (usage?.latency_ms ?? 0) + telemetry.latency_ms
	};
}

function proposalRow(
	runId: string,
	sourceNodeId: string,
	rank: number,
	proposal: SeedQuestion | FollowUpQuestion,
	duplicate?: { nodeId?: string; reason: string }
): Record<string, unknown> {
	const seed = 'unknownAddressed' in proposal;
	return {
		run_id: runId,
		source_node_id: sourceNodeId,
		rank,
		question: proposal.question.trim().slice(0, 4000),
		normalized_question: normalizeQuestion(proposal.question),
		purpose: proposal.purpose,
		target_claim: seed ? proposal.unknownAddressed : proposal.targetClaim,
		why_it_matters: proposal.whyItMatters,
		expected_information_gain: proposal.expectedInformationGain,
		model_priority: seed ? 0.75 : proposal.priority,
		status: duplicate ? 'duplicate' : 'proposed',
		duplicate_of_node_id: duplicate?.nodeId ?? null,
		validation_error: duplicate?.reason ?? null
	};
}

async function insertEvent(params: {
	runId: string;
	nodeId?: string;
	eventType: string;
	payload?: Record<string, unknown>;
}): Promise<void> {
	const { error } = await db.from('question_tree_events').insert({
		run_id: params.runId,
		node_id: params.nodeId ?? null,
		seq: 0,
		event_type: params.eventType,
		payload: params.payload ?? {}
	});
	assertNoError(error, `insert ${params.eventType} event`);
}

async function insertProposals(params: {
	run: QuestionTreeRun;
	sourceNodeId: string;
	proposals: Array<SeedQuestion | FollowUpQuestion>;
	max: number;
}): Promise<number> {
	const existingNodes = await listNodes(params.run.id);
	const existingProposals = await listProposals(params.run.id);
	const knownNodes = new Map(existingNodes.map((node) => [node.normalized_question, node.id]));
	const knownProposals = new Map(
		existingProposals.map((proposal) => [proposal.normalized_question, proposal.id])
	);

	const rows: Record<string, unknown>[] = [];
	for (const [rank, proposal] of params.proposals.slice(0, params.max).entries()) {
		const normalized = normalizeQuestion(proposal.question);
		if (normalized.length < 3) continue;
		const duplicateNodeId = knownNodes.get(normalized);
		const duplicateProposalId = knownProposals.get(normalized);
		const duplicate = duplicateNodeId
			? { nodeId: duplicateNodeId, reason: `Duplicates node ${duplicateNodeId}` }
			: duplicateProposalId
				? { reason: `Duplicates proposal ${duplicateProposalId}` }
				: undefined;
		rows.push(proposalRow(params.run.id, params.sourceNodeId, rank, proposal, duplicate));
		if (!duplicate) knownProposals.set(normalized, `pending:${params.sourceNodeId}:${rank}`);
	}

	if (rows.length === 0) return 0;
	const { error } = await db.from('question_tree_proposals').insert(rows);
	assertNoError(error, 'insert question tree proposals');
	for (const row of rows) {
		await insertEvent({
			runId: params.run.id,
			nodeId: params.sourceNodeId,
			eventType: 'proposal.recorded',
			payload: {
				question: row.question,
				purpose: row.purpose,
				rank: row.rank,
				status: row.status
			}
		});
	}
	return rows.length;
}

export async function getRun(runId: string): Promise<QuestionTreeRun> {
	const { data, error } = await db
		.from('question_tree_runs')
		.select('*')
		.eq('id', runId)
		.single();
	assertNoError(error, 'load question tree run');
	if (!data) throw new Error(`Question Tree run ${runId} not found`);
	return data as QuestionTreeRun;
}

export async function listNodes(runId: string): Promise<QuestionTreeNode[]> {
	const { data, error } = await db
		.from('question_tree_nodes')
		.select('*')
		.eq('run_id', runId)
		.order('node_number', { ascending: true });
	assertNoError(error, 'load question tree nodes');
	return (data ?? []) as QuestionTreeNode[];
}

export async function listProposals(runId: string): Promise<QuestionTreeProposal[]> {
	const { data, error } = await db
		.from('question_tree_proposals')
		.select('*')
		.eq('run_id', runId)
		.order('created_at', { ascending: true });
	assertNoError(error, 'load question tree proposals');
	return (data ?? []) as QuestionTreeProposal[];
}

export async function markRunStarted(runId: string): Promise<void> {
	const { error } = await db
		.from('question_tree_runs')
		.update({ status: 'running', started_at: new Date().toISOString(), pause_reason: null })
		.eq('id', runId)
		.in('status', ['queued', 'running']);
	assertNoError(error, 'mark question tree run started');
}

export async function completeSeed(params: {
	run: QuestionTreeRun;
	output: QuestionTreeSeedOutput;
	telemetry: QuestionTreeModelTelemetry;
}): Promise<void> {
	await insertProposals({
		run: params.run,
		sourceNodeId: params.run.root_node_id,
		proposals: params.output.questions,
		max: 5
	});
	const current = await getRun(params.run.id);
	const proposals = await listProposals(params.run.id);
	const { data: updatedRun, error } = await db
		.from('question_tree_runs')
		.update({
			status: 'running',
			phase: 'explore',
			provider_requests: current.provider_requests + 1,
			frontier_count: proposals.filter(
				(proposal) => proposal.status === 'proposed' || proposal.status === 'not_selected'
			).length,
			usage: usageWithTelemetry(current.usage, params.telemetry),
			started_at: current.started_at ?? new Date().toISOString()
		})
		.eq('id', params.run.id)
		.eq('phase', 'seed')
		.in('status', ['queued', 'running'])
		.select('id')
		.maybeSingle();
	assertNoError(error, 'complete question tree seed');
	if (!updatedRun) {
		const { error: cancelError } = await db
			.from('question_tree_proposals')
			.update({ status: 'cancelled' })
			.eq('run_id', params.run.id)
			.eq('source_node_id', params.run.root_node_id)
			.eq('status', 'proposed');
		assertNoError(cancelError, 'fence late question tree seed result');
		return;
	}
	await insertEvent({
		runId: params.run.id,
		nodeId: params.run.root_node_id,
		eventType: 'run.phase_changed',
		payload: { phase: 'explore', proposal_count: params.output.questions.length }
	});
}

export async function claimBatch(params: {
	runId: string;
	workerId: string;
	limit: number;
}): Promise<QuestionTreeNode[]> {
	const { data, error } = await db.rpc('claim_question_tree_batch', {
		p_run_id: params.runId,
		p_worker_id: params.workerId,
		p_limit: params.limit
	});
	assertNoError(error, 'claim question tree batch');
	return (data ?? []) as QuestionTreeNode[];
}

export async function completeNode(params: {
	runId: string;
	node: QuestionTreeNode;
	output: QuestionTreeNodeOutput;
	telemetry: QuestionTreeModelTelemetry;
}): Promise<boolean> {
	const { data: updatedNode, error: nodeError } = await db
		.from('question_tree_nodes')
		.update({
			status: 'completed',
			answer: params.output.answer,
			thesis: params.output.thesis,
			epistemic_assessment: params.output.claims,
			confidence: params.output.confidence,
			stop_reason: params.output.stopReason,
			model_requested: params.telemetry.model_requested,
			model_used: params.telemetry.model_used,
			provider_request_id: params.telemetry.provider_request_id,
			prompt_tokens: params.telemetry.prompt_tokens,
			completion_tokens: params.telemetry.completion_tokens,
			reasoning_tokens: params.telemetry.reasoning_tokens,
			cost_usd: params.telemetry.cost_usd,
			latency_ms: params.telemetry.latency_ms,
			lease_owner: null,
			lease_expires_at: null,
			completed_at: new Date().toISOString()
		})
		.eq('id', params.node.id)
		.eq('status', 'running')
		.select('id')
		.maybeSingle();
	assertNoError(nodeError, 'complete question tree node');
	if (!updatedNode) return false;

	await insertProposals({
		run: await getRun(params.runId),
		sourceNodeId: params.node.id,
		proposals: params.output.followUpQuestions,
		max: 3
	});

	const current = await getRun(params.runId);
	const nodes = await listNodes(params.runId);
	const proposals = await listProposals(params.runId);
	const { data: updatedRun, error: runError } = await db
		.from('question_tree_runs')
		.update({
			nodes_completed: nodes.filter(
				(node) => node.node_kind === 'question' && node.status === 'completed'
			).length,
			provider_requests: current.provider_requests + 1,
			frontier_count: proposals.filter(
				(proposal) => proposal.status === 'proposed' || proposal.status === 'not_selected'
			).length,
			usage: usageWithTelemetry(current.usage, params.telemetry)
		})
		.eq('id', params.runId)
		.in('status', ['queued', 'running', 'paused', 'synthesizing'])
		.select('id')
		.maybeSingle();
	assertNoError(runError, 'update question tree run after node');
	if (!updatedRun) {
		const { error: cancelError } = await db
			.from('question_tree_proposals')
			.update({ status: 'cancelled' })
			.eq('run_id', params.runId)
			.eq('source_node_id', params.node.id)
			.in('status', ['proposed', 'not_selected']);
		assertNoError(cancelError, 'fence late question tree node proposals');
		return false;
	}

	await insertEvent({
		runId: params.runId,
		nodeId: params.node.id,
		eventType: 'node.completed',
		payload: {
			node_number: params.node.node_number,
			follow_up_count: params.output.followUpQuestions.length,
			confidence: params.output.confidence
		}
	});
	return true;
}

export async function failNode(params: {
	runId: string;
	node: QuestionTreeNode;
	error: unknown;
}): Promise<void> {
	const message = params.error instanceof Error ? params.error.message : String(params.error);
	const { data: updatedNode, error: nodeError } = await db
		.from('question_tree_nodes')
		.update({
			status: 'failed',
			error_code: 'model_call_failed',
			error_message: message.slice(0, 4000),
			lease_owner: null,
			lease_expires_at: null,
			completed_at: new Date().toISOString()
		})
		.eq('id', params.node.id)
		.eq('status', 'running')
		.select('id')
		.maybeSingle();
	assertNoError(nodeError, 'fail question tree node');
	if (!updatedNode) return;
	const current = await getRun(params.runId);
	const nodes = await listNodes(params.runId);
	const { data: updatedRun, error: runError } = await db
		.from('question_tree_runs')
		.update({
			nodes_failed: nodes.filter(
				(node) => node.node_kind === 'question' && node.status === 'failed'
			).length,
			provider_requests: current.provider_requests + 1
		})
		.eq('id', params.runId)
		.in('status', ['queued', 'running', 'paused', 'synthesizing'])
		.select('id')
		.maybeSingle();
	assertNoError(runError, 'update question tree failure count');
	if (!updatedRun) return;
	await insertEvent({
		runId: params.runId,
		nodeId: params.node.id,
		eventType: 'node.failed',
		payload: { node_number: params.node.node_number, error: message.slice(0, 1000) }
	});
}

export async function markRunFailed(params: {
	runId: string;
	error: unknown;
	quotaPaused?: boolean;
	countProviderRequest?: boolean;
}): Promise<void> {
	const message = params.error instanceof Error ? params.error.message : String(params.error);
	const current = await getRun(params.runId);
	const status = params.quotaPaused ? 'quota_paused' : 'failed';
	const { data: updatedRun, error } = await db
		.from('question_tree_runs')
		.update({
			status,
			phase: params.quotaPaused ? current.phase : 'done',
			pause_reason: message.slice(0, 4000),
			provider_requests:
				current.provider_requests + (params.countProviderRequest === false ? 0 : 1),
			next_retry_at: params.quotaPaused
				? new Date(Date.now() + 60 * 60 * 1000).toISOString()
				: null,
			completed_at: params.quotaPaused ? null : new Date().toISOString()
		})
		.eq('id', params.runId)
		.in('status', ['queued', 'running', 'synthesizing'])
		.select('id')
		.maybeSingle();
	assertNoError(error, 'mark question tree run failed');
	if (!updatedRun) return;
	await insertEvent({
		runId: params.runId,
		eventType: params.quotaPaused ? 'run.quota_paused' : 'run.failed',
		payload: { error: message.slice(0, 1000) }
	});
}

export async function closeFrontier(
	runId: string,
	status: 'budget_exhausted' | 'below_threshold'
): Promise<void> {
	const { error } = await db
		.from('question_tree_proposals')
		.update({ status })
		.eq('run_id', runId)
		.in('status', ['proposed', 'not_selected']);
	assertNoError(error, 'close question tree frontier');
}

export async function updateFrontierScores(params: {
	runId: string;
	scores: Record<string, number>;
	selectedIds: string[];
	belowThresholdIds: string[];
}): Promise<void> {
	const selected = new Set(params.selectedIds);
	const below = new Set(params.belowThresholdIds);
	await Promise.all(
		Object.entries(params.scores).map(async ([id, score]) => {
			const status = selected.has(id)
				? 'proposed'
				: below.has(id)
					? 'below_threshold'
					: 'not_selected';
			const { error } = await db
				.from('question_tree_proposals')
				.update({ scheduler_score: score, status })
				.eq('id', id)
				.eq('run_id', params.runId)
				.in('status', ['proposed', 'not_selected']);
			assertNoError(error, 'score question tree proposal');
		})
	);
}

export async function admitProposals(runId: string, proposalIds: string[]): Promise<number> {
	if (proposalIds.length === 0) return 0;
	const { data, error } = await db.rpc('admit_question_tree_proposals', {
		p_run_id: runId,
		p_proposal_ids: proposalIds
	});
	assertNoError(error, 'admit question tree proposals');
	return Number(data?.admitted ?? 0);
}

export async function transitionToSynthesis(runId: string): Promise<void> {
	const { data: updatedRun, error } = await db
		.from('question_tree_runs')
		.update({ status: 'synthesizing', phase: 'synthesize', frontier_count: 0 })
		.eq('id', runId)
		.in('status', ['queued', 'running'])
		.select('id')
		.maybeSingle();
	assertNoError(error, 'transition question tree to synthesis');
	if (!updatedRun) return;
	await insertEvent({
		runId,
		eventType: 'run.phase_changed',
		payload: { phase: 'synthesize' }
	});
}

export async function finishRun(params: {
	run: QuestionTreeRun;
	synthesis: QuestionTreeSynthesisOutput;
	telemetry: QuestionTreeModelTelemetry;
}): Promise<void> {
	const current = await getRun(params.run.id);
	const usage = usageWithTelemetry(current.usage, params.telemetry);
	const { error } = await db.rpc('complete_question_tree_run', {
		p_run_id: params.run.id,
		p_synthesis: params.synthesis,
		p_telemetry: params.telemetry,
		p_usage: usage
	});
	assertNoError(error, 'complete question tree run');
}

export async function enqueueAdvance(params: {
	run: QuestionTreeRun;
	expectedSequence: number;
	delayMs?: number;
}): Promise<void> {
	const isFree = params.run.model_policy === 'free_strict';
	const delayMs = Math.max(params.delayMs ?? 0, isFree ? 35_000 : 0);
	const scheduledFor = new Date(Date.now() + delayMs).toISOString();
	const { error } = await db.rpc('enqueue_question_tree_advance', {
		p_run_id: params.run.id,
		p_expected_sequence: params.expectedSequence,
		p_scheduled_for: scheduledFor
	});
	assertNoError(error, 'enqueue question tree advance');
	if (isFree) {
		const { error: updateError } = await db
			.from('question_tree_runs')
			.update({ next_batch_not_before: scheduledFor })
			.eq('id', params.run.id);
		assertNoError(updateError, 'store question tree free-lane throttle');
	}
}
