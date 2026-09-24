// apps/worker/src/workers/agentic-chat/provider/review/lanes.ts

import type { MutationBatch, TurnContract } from '@buildos/agentic-chat-runtime/loop';
import {
	AgenticChatProviderExecutionError,
	type AgenticChatProviderStepV1,
	type AgenticChatProviderUsageV1,
	type AgenticChatTurnProviderClientPortV1,
	type AgenticChatTurnProviderToolV1,
	type AgenticChatTurnProviderRequestV1 as ClientRequest
} from '../contracts';
import { createStableAgenticChatReadToolTransitionIdV1 } from '../../tools/read-tool-identity';
import { formatDocumentEditPreviewsForReview } from '../document-edit-preview';
import {
	type ProviderLaneContext,
	type ProviderPass,
	startProviderPass,
	streamForcedSynthesis
} from '../forced-synthesis';
import {
	canonicalError,
	canonicalFinishedReason,
	normalizeUsage,
	providerError
} from '../protocol';
import { throwIfAborted } from '../../shared/abortable-deadline';
import { appendSystemInstruction, combineUsage } from '../request-builders';
import {
	buildPlanningStep,
	buildProviderToolStep,
	normalizeCompletedProviderCalls
} from '../steps';
import {
	type CompletedProviderToolCall,
	appendToolCallDelta,
	createToolCallAccumulator
} from '../stream-tool-calls';
import { MAX_REVISIONS_PER_TURN, type ToolRoundStreamState } from '../turn-state';
import {
	completeMutationBatchReviewDecision,
	completeTurnContractReviewDecision
} from './decision-completion';
import {
	buildMutationBatchReviewRequest,
	constrainMutationBatchApprovalShaForRepair
} from './mutation-batch';
import { buildTurnContractReviewRequest } from './turn-contract';

/** Review lanes add the distinct reviewer model to the shared lane context. */
export type ReviewLaneContext = ProviderLaneContext & {
	readonly ports: { readonly semanticReviewer?: AgenticChatTurnProviderClientPortV1 };
};

/**
 * Independent review of a held batch of tool calls.
 *
 * Structurally the same ladder as contract review — one reviewer pass, one
 * bounded format repair, the decision executed as a durable control round —
 * but the artifact is the calls themselves, and approval leads straight to
 * executing those held calls rather than to another acting pass.
 */
export async function* streamMutationBatchReview(
	context: ReviewLaneContext,
	request: ClientRequest,
	availableTools: readonly AgenticChatTurnProviderToolV1[],
	batch: MutationBatch,
	batchSha256: string,
	priorUsage: AgenticChatProviderUsageV1 | null,
	state: ToolRoundStreamState
): AsyncGenerator<AgenticChatProviderStepV1> {
	const reviewer = context.ports.semanticReviewer;
	if (!reviewer) throw providerError('provider_semantic_reviewer_unavailable', 'permanent');
	if (state.providerPassBudgetExhausted()) {
		state.advance({ type: 'budget', limit: 'force_synthesis' });
		yield* streamForcedSynthesis(
			context,
			appendSystemInstruction(request, state.buildProviderPassBudgetInstruction()),
			priorUsage,
			state
		);
		return;
	}
	// The reviewer must always be able to reject incorrect calls. The
	// continuation bounds actor corrections; exhaustion is not user ambiguity.
	const allowRevision = true;
	const allowReadOnlyCorrection = state.getBatchRevisionCount() === 0;
	let reviewRequest = buildMutationBatchReviewRequest(
		request,
		availableTools,
		batch,
		batchSha256,
		allowReadOnlyCorrection,
		allowRevision,
		state.getRequestExpectation(),
		formatDocumentEditPreviewsForReview(batch, state.getDocumentEditPreviews())
	);
	let accumulatedReviewUsage = priorUsage;
	let pendingReviewTool = false;
	try {
		// The first review request goes out while the executor persists the
		// review status; the status still reaches it before any review event.
		let primedReview: ReturnType<ProviderPass> | null = startProviderPass(
			context.providerPass(reviewRequest, state, reviewer)
		);
		yield {
			type: 'semantic',
			transitionId: createStableAgenticChatReadToolTransitionIdV1({
				turnRunId: request.turnRunId,
				providerToolCallId: `batch-review:${batchSha256}:${request.logicalProviderRound}`,
				stage: 'planning'
			}),
			phase: 'stream',
			eventType: 'agent_state',
			currentActivity: 'Checking the requested change...',
			eventPayload: {
				type: 'agent_state',
				state: 'thinking',
				contextType: request.contextType,
				details: 'Checking the requested change...',
				activity_visibility: 'activity_log',
				semantic_review: { contract_sha256: batchSha256 }
			}
		};
		for (let reviewAttempt = 0; reviewAttempt <= 1; reviewAttempt += 1) {
			const toolCalls = createToolCallAccumulator();
			let finished = false;
			let reviewerUsage: AgenticChatProviderUsageV1 | null = null;
			let fallbackReason: string | null = null;
			let reviewFinishedReason: string | null = null;
			try {
				const reviewPass =
					primedReview ?? context.providerPass(reviewRequest, state, reviewer);
				primedReview = null;
				for await (const event of reviewPass) {
					throwIfAborted(request.signal);
					if (finished) throw providerError('provider_event_after_done', 'unknown');
					if (event.type === 'text') continue;
					if (event.type === 'tool_call') {
						appendToolCallDelta(toolCalls, event.toolCall);
						continue;
					}
					if (event.type === 'error') {
						fallbackReason = `Independent semantic review was unavailable: ${canonicalError(event.error)}`;
						break;
					}
					finished = true;
					reviewerUsage = normalizeUsage(event.usage);
					const finishedReason = canonicalFinishedReason(event.finishedReason);
					reviewFinishedReason = finishedReason;
					if (finishedReason !== 'tool_calls' && finishedReason !== 'function_call') {
						fallbackReason =
							'Independent semantic review did not return a control decision.';
					}
				}
			} catch (error) {
				throwIfAborted(request.signal);
				if (!(error instanceof AgenticChatProviderExecutionError)) throw error;
				fallbackReason = error.code;
			}
			accumulatedReviewUsage = combineUsage(accumulatedReviewUsage, reviewerUsage);
			let calls: CompletedProviderToolCall[];
			try {
				calls = completeMutationBatchReviewDecision({
					actingRequest: request,
					reviewRequest,
					toolCalls,
					finished,
					finishedReason: reviewFinishedReason,
					fallbackReason,
					batchSha256,
					batch,
					allowRevision,
					requestExpectation: state.getRequestExpectation()
				});
			} catch (error) {
				if (
					!(error instanceof AgenticChatProviderExecutionError) ||
					error.diagnostic?.kind !== 'rejected_contract_review'
				)
					throw error;
				const diagnostic = error.diagnostic;
				yield {
					type: 'semantic',
					transitionId: createStableAgenticChatReadToolTransitionIdV1({
						turnRunId: request.turnRunId,
						providerToolCallId: `batch-review-rejection:${batchSha256}:${reviewRequest.logicalProviderRound}:${reviewAttempt}`,
						stage: 'planning'
					}),
					phase: 'stream',
					eventType: 'agent_state',
					currentActivity: 'Checking the requested change...',
					eventPayload: {
						type: 'agent_state',
						state: 'thinking',
						activity_visibility: 'activity_log',
						semantic_review: {
							contract_sha256: batchSha256,
							attempt: reviewAttempt + 1,
							rejection: diagnostic
						}
					}
				};
				if (
					reviewAttempt === 0 &&
					!state.providerPassBudgetExhausted() &&
					![
						'decision_truncated',
						'provider_failure',
						'missing_done',
						'unexpected_finish_reason'
					].includes(diagnostic.code)
				) {
					const repairBaseRequest =
						diagnostic.code === 'approval_sha_mismatch'
							? constrainMutationBatchApprovalShaForRepair(reviewRequest, batchSha256)
							: reviewRequest;
					reviewRequest = appendSystemInstruction(
						{
							...repairBaseRequest,
							providerAttempt: (repairBaseRequest.providerAttempt ?? 1) + 2
						},
						diagnostic.code === 'revision_value_unchanged'
							? 'Your previous revision asked to change an argument to the exact value already held in the proposal. Recheck the same calls against user intent and the schemas. Return a fresh approval only if every call is correct; otherwise return a supported revision, read-only decision, or clarification. No call has executed. A contradictory revision is not authorization.'
							: `Your previous decision could not be accepted (${diagnostic.code}). Return exactly one valid decision for the same proposed calls. Copy the exact batch SHA for approval. This is an internal format repair, not evidence of user ambiguity.`
					);
					continue;
				}
				yield state.textDelta(
					state.renderWriteReceiptFallback() ??
						describeUnappliedWrites(batch.calls.map((call) => call.name)),
					false
				);
				state.advance({ type: 'finish' });
				yield {
					type: 'finish',
					finishedReason: 'semantic_review_failed',
					usage: accumulatedReviewUsage
				};
				return;
			}
			const normalizedCalls = normalizeCompletedProviderCalls(reviewRequest, calls);
			state.setPendingToolRound({
				calls: normalizedCalls,
				usage: accumulatedReviewUsage
			});
			state.setCurrentRequest(request);
			// Review-start remains visible; tool_call is the next durable boundary.
			for (const call of normalizedCalls) {
				yield buildProviderToolStep(reviewRequest, call, state);
			}
			state.markToolRoundCompleted();
			pendingReviewTool = true;
			return;
		}
	} finally {
		if (!pendingReviewTool) state.release();
	}
}

/**
 * A rejected batch past the revision cap ends on what was saved, not another
 * pass, and names what was held back (tasker 100: "I couldn't complete the
 * requested change" left the user guessing what had been tried).
 */
export async function* streamReviewExhaustion(
	usage: AgenticChatProviderUsageV1 | null,
	state: ToolRoundStreamState,
	heldToolNames: readonly string[]
): AsyncGenerator<AgenticChatProviderStepV1> {
	try {
		const saved = state.renderWriteReceiptFallback('I saved these changes:');
		const attempted = describeAttemptedWrites(heldToolNames);
		yield state.textDelta(
			saved
				? `${saved}\n\nI couldn't complete the remaining changes: my safety check still found problems with ${attempted} after repeated revisions. No additional changes were saved.`
				: `I couldn't complete ${attempted}: my safety check still found problems with it after repeated revisions. Nothing was saved. Try again, or tell me exactly what to change.`,
			false
		);
		state.advance({ type: 'finish' });
		yield { type: 'finish', finishedReason: 'semantic_review_failed', usage };
	} finally {
		state.release();
	}
}

/**
 * A proposed write contract is an untrusted model output. A distinct model
 * lane reviews the exact contract against the original turn record before
 * any write tool is restored. Its approve/clarify decision crosses the same
 * durable tool-result fence as every other control call.
 */
export async function* streamTurnContractReview(
	context: ReviewLaneContext,
	request: ClientRequest,
	availableTools: readonly AgenticChatTurnProviderToolV1[],
	contract: TurnContract,
	contractReviewSha256: string,
	allowDispositionCorrection: boolean,
	priorUsage: AgenticChatProviderUsageV1 | null,
	state: ToolRoundStreamState
): AsyncGenerator<AgenticChatProviderStepV1> {
	const reviewer = context.ports.semanticReviewer;
	if (!reviewer) throw providerError('provider_semantic_reviewer_unavailable', 'permanent');
	if (state.providerPassBudgetExhausted()) {
		// No budget left to review, so no budget to execute what a review would
		// authorize. End the turn on what is already durable.
		state.advance({ type: 'budget', limit: 'force_synthesis' });
		yield* streamForcedSynthesis(
			context,
			appendSystemInstruction(request, state.buildProviderPassBudgetInstruction()),
			priorUsage,
			state
		);
		return;
	}
	const allowRevision = state.getContractRevisionCount() < MAX_REVISIONS_PER_TURN;
	const allowReadOnlyCorrection =
		allowDispositionCorrection && state.getContractRevisionCount() === 0;
	let reviewRequest = buildTurnContractReviewRequest(
		request,
		availableTools,
		contract,
		contractReviewSha256,
		allowReadOnlyCorrection,
		allowRevision
	);
	let accumulatedReviewUsage = priorUsage;
	let pendingReviewTool = false;
	try {
		// The first review request goes out while the executor persists the
		// review status; the status still reaches it before any review event.
		let primedReview: ReturnType<ProviderPass> | null = startProviderPass(
			context.providerPass(reviewRequest, state, reviewer)
		);
		yield {
			type: 'semantic',
			transitionId: createStableAgenticChatReadToolTransitionIdV1({
				turnRunId: request.turnRunId,
				// Keyed by attempt as well as content: the acting model may re-declare
				// an identical contract after a revision, and the second review's
				// durable transition must not collide with the first.
				providerToolCallId: `contract-review:${contractReviewSha256}:${request.logicalProviderRound}`,
				stage: 'planning'
			}),
			phase: 'stream',
			eventType: 'agent_state',
			currentActivity: 'Checking the requested change...',
			eventPayload: {
				type: 'agent_state',
				state: 'thinking',
				contextType: request.contextType,
				details: 'Checking the requested change...',
				activity_visibility: 'activity_log',
				semantic_review: { contract_sha256: contractReviewSha256 }
			}
		};
		for (let reviewAttempt = 0; reviewAttempt <= 1; reviewAttempt += 1) {
			const toolCalls = createToolCallAccumulator();
			let finished = false;
			let reviewerUsage: AgenticChatProviderUsageV1 | null = null;
			let fallbackReason: string | null = null;
			let reviewFinishedReason: string | null = null;
			try {
				const reviewPass =
					primedReview ?? context.providerPass(reviewRequest, state, reviewer);
				primedReview = null;
				for await (const event of reviewPass) {
					throwIfAborted(request.signal);
					if (finished) throw providerError('provider_event_after_done', 'unknown');
					if (event.type === 'text') continue;
					if (event.type === 'tool_call') {
						appendToolCallDelta(toolCalls, event.toolCall);
						continue;
					}
					if (event.type === 'error') {
						fallbackReason = `Independent semantic review was unavailable: ${canonicalError(event.error)}`;
						break;
					}

					finished = true;
					reviewerUsage = normalizeUsage(event.usage);
					const finishedReason = canonicalFinishedReason(event.finishedReason);
					reviewFinishedReason = finishedReason;
					if (finishedReason !== 'tool_calls' && finishedReason !== 'function_call') {
						fallbackReason =
							'Independent semantic review did not return a control decision.';
					}
				}
			} catch (error) {
				throwIfAborted(request.signal);
				if (!(error instanceof AgenticChatProviderExecutionError)) throw error;
				fallbackReason = error.code;
			}

			accumulatedReviewUsage = combineUsage(accumulatedReviewUsage, reviewerUsage);
			let calls: CompletedProviderToolCall[];
			try {
				calls = completeTurnContractReviewDecision({
					actingRequest: request,
					admittedTools: availableTools,
					reviewRequest,
					toolCalls,
					finished,
					finishedReason: reviewFinishedReason,
					fallbackReason,
					contract,
					contractReviewSha256,
					allowRevision
				});
			} catch (error) {
				if (
					!(error instanceof AgenticChatProviderExecutionError) ||
					error.diagnostic?.kind !== 'rejected_contract_review'
				)
					throw error;
				const diagnostic = error.diagnostic;
				yield {
					type: 'semantic',
					transitionId: createStableAgenticChatReadToolTransitionIdV1({
						turnRunId: request.turnRunId,
						providerToolCallId: `contract-review-rejection:${contractReviewSha256}:${reviewRequest.logicalProviderRound}:${reviewAttempt}`,
						stage: 'planning'
					}),
					phase: 'stream',
					eventType: 'agent_state',
					currentActivity: 'Checking the requested change...',
					eventPayload: {
						type: 'agent_state',
						state: 'thinking',
						activity_visibility: 'activity_log',
						semantic_review: {
							contract_sha256: contractReviewSha256,
							attempt: reviewAttempt + 1,
							rejection: diagnostic
						}
					}
				};
				if (
					reviewAttempt === 0 &&
					!state.providerPassBudgetExhausted() &&
					![
						'decision_truncated',
						'provider_failure',
						'missing_done',
						'unexpected_finish_reason'
					].includes(diagnostic.code)
				) {
					reviewRequest = appendSystemInstruction(
						{
							...reviewRequest,
							// The atomic transport pass reserves attempts 1–2.
							// Keep the logical round and use fresh physical identities.
							providerAttempt: (reviewRequest.providerAttempt ?? 1) + 2
						},
						`Your previous decision could not be accepted (${diagnostic.code}). Return exactly one valid decision for the same proposal. Copy its exact SHA for approval. For corrections use only applicable fields, omit unused labels, and preserve the complete user commission. This is an internal format repair, not evidence of user ambiguity.`
					);
					continue;
				}
				yield state.textDelta(
					state.renderWriteReceiptFallback() ?? describeUnappliedWrites([]),
					false
				);
				state.advance({ type: 'finish' });
				yield {
					type: 'finish',
					finishedReason: 'semantic_review_failed',
					usage: accumulatedReviewUsage
				};
				return;
			}
			const normalizedCalls = normalizeCompletedProviderCalls(reviewRequest, calls);
			state.setPendingToolRound({
				calls: normalizedCalls,
				usage: accumulatedReviewUsage
			});
			// Keep the main agent's request as the continuation base. The durable
			// reviewer call/result is appended by continueWithToolResults, while the
			// reviewer's private system prompt never contaminates the acting model.
			state.setCurrentRequest(request);
			yield buildPlanningStep(reviewRequest, normalizedCalls[0]!.id);
			for (const call of normalizedCalls) {
				yield buildProviderToolStep(reviewRequest, call, state);
			}
			state.markToolRoundCompleted();
			pendingReviewTool = true;
			return;
		}
	} finally {
		if (!pendingReviewTool) state.release();
	}
}

const UNAPPLIED_WRITE_VERBS: Readonly<Record<string, string>> = {
	create: 'create',
	update: 'update',
	delete: 'delete',
	move: 'move',
	link: 'link',
	unlink: 'unlink'
};

/**
 * Honest copy when review cannot finish: say what was held, that nothing
 * changed, and how to proceed. Built from tool names (structured identifiers),
 * never from user or model prose.
 */
export function describeUnappliedWrites(toolNames: readonly string[]): string {
	return `I didn't apply this: my safety check couldn't confirm that ${describeAttemptedWrites(toolNames)} matched exactly what you asked. Nothing was changed. Try again, or tell me the exact text to change.`;
}

/** "the plan to update a document and update a task", or "this change". */
function describeAttemptedWrites(toolNames: readonly string[]): string {
	const counts = new Map<string, { verb: string; noun: string; count: number }>();
	for (const name of toolNames) {
		const [verb, ...rest] = name.split('_');
		const noun = rest.filter((part) => part !== 'onto').join(' ');
		const knownVerb = verb ? UNAPPLIED_WRITE_VERBS[verb] : undefined;
		if (!knownVerb || !noun) continue;
		const key = `${knownVerb} ${noun}`;
		const entry = counts.get(key) ?? { verb: knownVerb, noun, count: 0 };
		entry.count += 1;
		counts.set(key, entry);
	}
	const parts = [...counts.values()].map(({ verb, noun, count }) =>
		// link_onto_entities / unlink_onto_entities name a plural already.
		noun === 'entities'
			? `${verb} records`
			: `${verb} ${count === 1 ? 'a' : count} ${noun}${count === 1 ? '' : 's'}`
	);
	return parts.length === 0
		? 'this change'
		: `the plan to ${
				parts.length === 1
					? parts[0]
					: `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
			}`;
}
