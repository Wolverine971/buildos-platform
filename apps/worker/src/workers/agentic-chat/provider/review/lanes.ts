// apps/worker/src/workers/agentic-chat/provider/review/lanes.ts

import type { JsonObject } from '@buildos/shared-types';
import {
	type MutationBatch,
	type MutationReviewFinding,
	renderMutationReviewFindings
} from '@buildos/agentic-chat-runtime/loop';
import type { AgenticChatExecutionObservationPortV1 } from '../../effects/execution-observation';
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
import { formatTableEditPreviewsForReview } from '../table-edit-preview';
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
import { buildProviderToolStep, normalizeCompletedProviderCalls } from '../steps';
import {
	type CompletedProviderToolCall,
	appendToolCallDelta,
	createToolCallAccumulator
} from '../stream-tool-calls';
import type { ToolRoundStreamState } from '../turn-state';
import { completeMutationBatchReviewDecision } from './decision-completion';
import {
	buildMutationBatchReviewRequest,
	constrainMutationBatchApprovalShaForRepair
} from './mutation-batch';
import {
	type ReviewDecisionRecord,
	buildReviewDecisionPayload,
	enqueueReviewTelemetryObservation,
	reviewOutcomeOf
} from './review-telemetry';

/** Review lanes add the distinct reviewer model to the shared lane context. */
export type ReviewLaneContext = ProviderLaneContext & {
	readonly ports: {
		readonly semanticReviewer?: AgenticChatTurnProviderClientPortV1;
		/** Durable, content-free receipt per review decision (M5); absent in fixtures. */
		readonly executionObservations?: AgenticChatExecutionObservationPortV1;
	};
};

/**
 * The one reviewer re-ask the stage rule earns (S5): the first decision was a
 * revision that named no wrong held call. The retry decision is accepted as
 * the reviewer gives it, and a retry that fails falls back to the first
 * revision, so this can cost one reviewer pass but never a turn.
 */
export const STAGE_RULE_RECHECK_INSTRUCTION =
	"Your previous revision named no held call as wrong. Revise a stage only for a defect in a held call. Commissioned work this stage leaves out is never a defect: the acting model proposes it in a later stage, and the request expectation keeps it owed. A missing prerequisite that makes a held call unsafe, or a held call that needs the user's informed authorization they have not given, is a defect in that held call: list it in defective_calls. Re-check each held call against the user request, the turn evidence, and your previous reason. If none is wrong, approve this exact batch; otherwise return a revision whose defective_calls lists the held calls that are wrong. No call has executed; this is an internal check, not user ambiguity.";

const MAX_RECHECK_QUOTE_CHARS = 600;

/**
 * The re-ask carries the reviewer's own first reason and correction back to it,
 * quoted, so the second look weighs what it objected to instead of starting
 * blind. Nothing reads the text; it only travels back to its author.
 */
export function buildStageRuleRecheckInstruction(previousDecision: JsonObject | null): string {
	const quote = (value: unknown): string | null =>
		typeof value === 'string' && value.trim()
			? JSON.stringify(value.trim().slice(0, MAX_RECHECK_QUOTE_CHARS))
			: null;
	const reason = quote(previousDecision?.reason);
	const correction = quote(previousDecision?.required_correction);
	if (!reason && !correction) return STAGE_RULE_RECHECK_INSTRUCTION;
	return [
		STAGE_RULE_RECHECK_INSTRUCTION,
		'Your previous revision said:',
		reason ? `reason: ${reason}` : null,
		correction ? `required_correction: ${correction}` : null
	]
		.filter((line): line is string => line !== null)
		.join('\n');
}

/** Record one review decision in the turn's commission ledger and as a durable receipt. */
function observeReviewDecision(
	context: ReviewLaneContext,
	request: ClientRequest,
	state: ToolRoundStreamState,
	record: ReviewDecisionRecord
): void {
	try {
		state.writeCommission.recordReviewOutcome(record.outcome);
		enqueueReviewTelemetryObservation(
			context.ports.executionObservations,
			request,
			'provider_review_decided',
			`review:${record.lane}:${record.logicalProviderRound}:${record.attempt}`,
			buildReviewDecisionPayload(record)
		);
	} catch {
		// Review telemetry can never alter the review.
	}
}

/**
 * The control tool a refused decision attempted, with its structured
 * arguments when they parse. Only advertised names are kept; the payload
 * builder reads codes and numbers from the arguments, never prose.
 */
function attemptedDecision(
	toolCalls: ReturnType<typeof createToolCallAccumulator>,
	advertised: readonly AgenticChatTurnProviderToolV1[]
): { decisionToolName: string | null; decisionArguments: JsonObject | null } {
	const [first] = [...toolCalls.values()];
	if (!first) return { decisionToolName: null, decisionArguments: null };
	const decisionToolName = advertised.some((tool) => tool.function.name === first.name)
		? first.name
		: null;
	try {
		const parsed: unknown = JSON.parse(first.argumentsText || '{}');
		return {
			decisionToolName,
			decisionArguments:
				parsed && typeof parsed === 'object' && !Array.isArray(parsed)
					? (parsed as JsonObject)
					: null
		};
	} catch {
		return { decisionToolName, decisionArguments: null };
	}
}

/**
 * Independent review of a held batch of tool calls.
 *
 * One reviewer pass, one bounded format repair, the decision executed as a
 * durable control round. The artifact is the calls themselves, and approval
 * leads straight to executing those held calls rather than to another acting
 * pass.
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
		// Document diffs and table row-batch previews share the one preview slot.
		[
			formatDocumentEditPreviewsForReview(batch, state.getDocumentEditPreviews()),
			formatTableEditPreviewsForReview(batch, state.getTableEditPreviews())
		]
			.filter((preview): preview is string => preview !== null)
			.join('\n') || null,
		[...state.getExternalContentSources()]
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
		const stageToolNames = batch.calls.map((call) => call.name);
		// A first revision the stage rule sent back for a second look. It passed
		// every check the old ladder applied, so if the second look fails the
		// turn goes on with it (an actor repair) instead of ending.
		let firstRevision: {
			calls: CompletedProviderToolCall[];
			request: ClientRequest;
		} | null = null;
		for (let reviewAttempt = 0; reviewAttempt <= 1; reviewAttempt += 1) {
			const toolCalls = createToolCallAccumulator();
			let finished = false;
			let reviewerUsage: AgenticChatProviderUsageV1 | null = null;
			let fallbackReason: string | null = null;
			let reviewFinishedReason: string | null = null;
			const attemptStartedAt = Date.now();
			const decisionRecord = (
				fields: Pick<
					ReviewDecisionRecord,
					'outcome' | 'rejectionCode' | 'decisionToolName' | 'decisionArguments'
				>
			): ReviewDecisionRecord => ({
				lane: 'mutation_batch',
				logicalProviderRound: reviewRequest.logicalProviderRound,
				attempt: reviewAttempt + 1,
				stageToolNames,
				priorRevisions: state.getBatchRevisionCount(),
				readOnlyOffered: allowReadOnlyCorrection,
				durationMs: Date.now() - attemptStartedAt,
				...fields
			});
			try {
				const reviewPass =
					primedReview ?? context.providerPass(reviewRequest, state, reviewer);
				primedReview = null;
				for await (const event of reviewPass) {
					throwIfAborted(request.signal);
					if (event.type === 'output_budget_recovery')
						throw providerError(
							'provider_semantic_reviewer_unexpected_recovery',
							'permanent'
						);
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
			const attemptRequest = reviewRequest;
			const completeDecision = (recheckRevision: boolean) =>
				completeMutationBatchReviewDecision({
					actingRequest: request,
					reviewRequest: attemptRequest,
					toolCalls,
					finished,
					finishedReason: reviewFinishedReason,
					fallbackReason,
					batchSha256,
					batch,
					allowRevision,
					requestExpectation: state.getRequestExpectation(),
					recheckRevision
				});
			let calls: CompletedProviderToolCall[];
			let decisionRequest = reviewRequest;
			let fellBackToFirstRevision = false;
			try {
				// Only when a re-ask can actually run: with the pass budget spent,
				// the revision is accepted as before rather than ending the turn.
				calls = completeDecision(
					reviewAttempt === 0 && !state.providerPassBudgetExhausted()
				);
			} catch (error) {
				if (
					!(error instanceof AgenticChatProviderExecutionError) ||
					error.diagnostic?.kind !== 'rejected_contract_review'
				)
					throw error;
				const diagnostic = error.diagnostic;
				observeReviewDecision(
					context,
					request,
					state,
					decisionRecord({
						outcome: 'invalid',
						rejectionCode: diagnostic.code,
						...attemptedDecision(toolCalls, reviewRequest.tools)
					})
				);
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
				if (reviewAttempt === 0 && diagnostic.code === 'revision_without_defective_call') {
					try {
						// The same decision without the stage check: what the old ladder accepted.
						firstRevision = { calls: completeDecision(false), request: attemptRequest };
					} catch (fallbackError) {
						if (!(fallbackError instanceof AgenticChatProviderExecutionError))
							throw fallbackError;
						firstRevision = null;
					}
				}
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
					// A stage recheck usually ends in an approval; pin its digest too.
					const repairBaseRequest =
						diagnostic.code === 'approval_sha_mismatch' ||
						diagnostic.code === 'revision_without_defective_call'
							? constrainMutationBatchApprovalShaForRepair(reviewRequest, batchSha256)
							: reviewRequest;
					reviewRequest = appendSystemInstruction(
						{
							...repairBaseRequest,
							providerAttempt: (repairBaseRequest.providerAttempt ?? 1) + 2
						},
						diagnostic.code === 'ungrounded_reference_id'
							? 'Your previous decision invented or mistyped a reference ID. Copy candidate IDs exactly from loaded records and server archive facts. Finding target IDs must come from loaded records or the exact affected calls you are rejecting. A proposed argument or assistant claim does not prove a candidate exists. Return one grounded decision for the same batch. No call has executed; this is an internal format repair, not user ambiguity.'
							: diagnostic.code === 'revision_value_unchanged'
								? 'Your previous revision asked to change an argument to the exact value already held in the proposal. Recheck the same calls against user intent and the schemas. Return a fresh approval only if every call is correct; otherwise return a supported revision, read-only decision, or clarification. No call has executed. A contradictory revision is not authorization.'
								: diagnostic.code === 'revision_without_defective_call'
									? buildStageRuleRecheckInstruction(
											attemptedDecision(toolCalls, attemptRequest.tools)
												.decisionArguments
										)
									: `Your previous decision could not be accepted (${diagnostic.code}). Return exactly one valid decision for the same proposed calls. Copy the exact batch SHA for approval. This is an internal format repair, not evidence of user ambiguity.`
					);
					continue;
				}
				if (!firstRevision) {
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
				// The second look failed (provider error, stall, bad SHA, invalid
				// revision): the first revision goes to the acting model, as before S5.
				calls = firstRevision.calls;
				decisionRequest = firstRevision.request;
				fellBackToFirstRevision = true;
			}
			if (fellBackToFirstRevision) {
				// Both attempts already have durable receipts; count the adopted one.
				try {
					state.writeCommission.recordReviewOutcome(reviewOutcomeOf(calls[0]?.name));
				} catch {
					// Review telemetry can never alter the review.
				}
			} else {
				observeReviewDecision(
					context,
					request,
					state,
					decisionRecord({
						outcome: reviewOutcomeOf(calls[0]?.name),
						rejectionCode: null,
						decisionToolName: calls[0]?.name ?? null,
						decisionArguments: calls[0]?.arguments ?? null
					})
				);
			}
			const normalizedCalls = normalizeCompletedProviderCalls(decisionRequest, calls);
			state.setPendingToolRound({
				calls: normalizedCalls,
				usage: accumulatedReviewUsage
			});
			state.setCurrentRequest(request);
			// Review-start remains visible; tool_call is the next durable boundary.
			for (const call of normalizedCalls) {
				yield buildProviderToolStep(decisionRequest, call, state);
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
	heldToolNames: readonly string[],
	reason: string,
	findings: readonly MutationReviewFinding[] = []
): AsyncGenerator<AgenticChatProviderStepV1> {
	try {
		const saved = state.renderWriteReceiptFallback('I saved these changes:');
		const attempted = describeAttemptedWrites(heldToolNames);
		const details = renderMutationReviewFindings(findings);
		yield state.textDelta(
			details
				? `${saved ? `${saved}\n\n` : 'Nothing was saved.\n\n'}I stopped before making the rejected changes:\n\n${details}\n\nNo additional changes were saved.`
				: saved
					? `${saved}\n\nI couldn't complete the remaining changes: ${reason} No additional changes were saved.`
					: `I couldn't complete ${attempted}: ${reason} Nothing was saved.`,
			false
		);
		state.advance({ type: 'finish' });
		yield { type: 'finish', finishedReason: 'semantic_review_failed', usage };
	} finally {
		state.release();
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
