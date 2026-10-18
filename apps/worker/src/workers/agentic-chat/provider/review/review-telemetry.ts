// apps/worker/src/workers/agentic-chat/provider/review/review-telemetry.ts
//
// Durable, content-free receipts for the independent write review (M5) and
// the per-turn write-commission shadow log (S5, audit 2026-10-17). Both land
// in `agentic_chat_execution_observations` through the existing redacted
// observation RPC, whose allowlist validates every key below (migration
// 20261017202000). Payloads carry tool names, enum codes, counts and Jev's
// probability only: never reviewer prose, arguments, or user text.
//
// Where to query:
//   select payload from agentic_chat_execution_observations
//   where event_type = 'provider_review_decided'      -- one row per decision
//   where event_type = 'provider_commission_observed' -- one row per turn execution
//
// Writes are detached into the turn's pending-effects set, which the executor
// drains before the terminal fence, so they never sit on the model path and a
// failed write can never alter the turn.

import {
	APPROVE_MUTATION_BATCH_REVIEW_TOOL_NAME,
	APPROVE_TURN_CONTRACT_REVIEW_TOOL_NAME,
	DECLARE_READ_ONLY_TURN_TOOL_NAME,
	REQUEST_PROPOSAL_REVISION_TOOL_NAME,
	REQUEST_TURN_CLARIFICATION_TOOL_NAME
} from '@buildos/agentic-chat-runtime/catalog';
import { parseMutationReviewFindings } from '@buildos/agentic-chat-runtime/loop';
import type { JsonObject } from '@buildos/shared-types';
import {
	type AgenticChatExecutionObservationPortV1,
	createStableAgenticChatExecutionObservationKeyV1
} from '../../effects/execution-observation';
import { AGENTIC_CHAT_PENDING_EFFECTS_REGISTRY } from '../../effects/pending-effects';
import { reviewedAgenticChatMutationSpecV1 } from '../../mutations/tool-catalog';
import type { AgenticChatTurnProviderRequestV1 } from '../contracts';
import { readDefectiveCalls } from './decision-handling';

const OBSERVATION_TIMEOUT_MS = 5_000;
const MAX_TOOL_NAMES = 64;
const MAX_REVIEW_OUTCOMES = 24;
const MAX_STAGE_TOOLS = 40;
const SNAKE_CODE = /^[a-z][a-z0-9_]{0,63}$/;
const TOOL_NAME = /^[a-z][a-z0-9_]{0,127}$/;

export type ReviewOutcome =
	| 'approved'
	| 'revision_requested'
	| 'read_only'
	| 'clarification'
	| 'invalid';

export type ReviewLane = 'mutation_batch' | 'turn_contract';

/** The decision a reviewer control call stands for, by its structured tool name. */
export function reviewOutcomeOf(toolName: string | null | undefined): ReviewOutcome {
	switch (toolName) {
		case APPROVE_MUTATION_BATCH_REVIEW_TOOL_NAME:
		case APPROVE_TURN_CONTRACT_REVIEW_TOOL_NAME:
			return 'approved';
		case REQUEST_PROPOSAL_REVISION_TOOL_NAME:
			return 'revision_requested';
		case DECLARE_READ_ONLY_TURN_TOOL_NAME:
			return 'read_only';
		case REQUEST_TURN_CLARIFICATION_TOOL_NAME:
			return 'clarification';
		default:
			return 'invalid';
	}
}

export type ReviewDecisionRecord = {
	lane: ReviewLane;
	logicalProviderRound: number;
	/** 1 for the reviewer's first decision, 2 after one format repair. */
	attempt: number;
	outcome: ReviewOutcome;
	/** Our structured rejection code when the decision was refused, else null. */
	rejectionCode: string | null;
	/** The advertised control tool the reviewer called (also for a refused decision). */
	decisionToolName: string | null;
	/** The reviewer's own structured arguments (codes and numbers are read; prose never). */
	decisionArguments: JsonObject | null;
	/** Held calls under review (batch lane); empty for the contract lane. */
	stageToolNames: readonly string[];
	/** Batch revisions already spent this turn, before this decision. */
	priorRevisions: number;
	readOnlyOffered: boolean;
	durationMs: number;
};

export function buildReviewDecisionPayload(record: ReviewDecisionRecord): JsonObject {
	const args = record.decisionArguments ?? {};
	// Codes are read from a revision even when the decision was refused: a
	// refused "add the omitted work" revision is exactly what S5 measures.
	const revision = record.decisionToolName === REQUEST_PROPOSAL_REVISION_TOOL_NAME;
	const findings = revision ? (parseMutationReviewFindings(args.findings) ?? []) : [];
	const checks = Array.isArray(args.argument_checks) ? args.argument_checks.length : 0;
	return {
		logical_provider_round: positiveInteger(record.logicalProviderRound, 1000),
		review_lane: record.lane,
		review_attempt: Math.min(Math.max(1, Math.trunc(record.attempt)), 2),
		review_outcome: record.outcome,
		review_decision_tool:
			record.decisionToolName && TOOL_NAME.test(record.decisionToolName)
				? record.decisionToolName
				: null,
		review_rejection_code:
			record.rejectionCode && SNAKE_CODE.test(record.rejectionCode)
				? record.rejectionCode
				: null,
		review_finding_codes: findings.map((finding) => finding.code).slice(0, 8),
		review_defective_calls: revision
			? (readDefectiveCalls(args.defective_calls) ?? []).filter((call) => call <= 40)
			: [],
		review_argument_check_count: Math.min(checks, 20),
		review_stage_call_count: Math.min(record.stageToolNames.length, 100),
		review_stage_tools: distinctToolNames(record.stageToolNames, MAX_STAGE_TOOLS),
		review_prior_revisions: Math.min(Math.max(0, Math.trunc(record.priorRevisions)), 100),
		review_read_only_offered: record.readOnlyOffered,
		duration_ms: Math.max(0, Math.round(record.durationMs))
	};
}

/**
 * One turn execution's write-commission evidence: what Jev judged the
 * message to commission, which writes the acting model actually proposed,
 * and how review answered. Jev's answer is the shadow signal the
 * uncommissioned-write hold would enforce; this is the data that has to
 * justify turning the hold on. A proposal card (nest/combine) is the
 * fulfilment of a commissioned change that writes nothing, so
 * `awaiting_user_card` comes from the turn state's own `awaitingUserCard()`
 * and such turns are never counted as misses.
 */
export class TurnWriteCommissionLedger {
	private selectionStatus: 'selected' | 'fallback' | 'skipped' | 'absent' = 'absent';
	private writeCommission: number | null = null;
	private commissionedWriteToolNames: string[] = [];
	private readonly proposedWriteToolNames: string[] = [];
	private proposedWriteCallCount = 0;
	private readonly reviewOutcomes: ReviewOutcome[] = [];
	private heldWriteToolNames: string[] = [];
	private holdEnabled = false;
	private turnRulesPlaybook: string | null = null;
	private taken = false;

	recordSelection(
		request: Pick<
			AgenticChatTurnProviderRequestV1,
			'toolSelectionOutcome' | 'commissionedWriteToolNames' | 'heldWriteToolNames'
		>
	): void {
		const outcome = request.toolSelectionOutcome;
		this.selectionStatus = outcome?.status ?? 'absent';
		this.writeCommission =
			outcome &&
			typeof outcome.writeCommission === 'number' &&
			Number.isFinite(outcome.writeCommission)
				? Math.min(1, Math.max(0, outcome.writeCommission))
				: null;
		this.commissionedWriteToolNames = distinctToolNames(
			request.commissionedWriteToolNames ?? [],
			MAX_TOOL_NAMES
		);
		this.heldWriteToolNames = distinctToolNames(
			request.heldWriteToolNames ?? [],
			MAX_TOOL_NAMES
		);
		this.holdEnabled = outcome?.holdEnabled === true;
	}

	/** Every acting-model proposal, including calls later withheld, rejected, or bounced. */
	recordProposedCalls(calls: readonly { name: string }[]): void {
		for (const call of calls) {
			if (reviewedAgenticChatMutationSpecV1(call.name) === null) continue;
			this.proposedWriteCallCount += 1;
			if (!this.proposedWriteToolNames.includes(call.name)) {
				this.proposedWriteToolNames.push(call.name);
			}
		}
	}

	recordReviewOutcome(outcome: ReviewOutcome): void {
		if (this.reviewOutcomes.length < MAX_REVIEW_OUTCOMES) this.reviewOutcomes.push(outcome);
	}

	recordTurnRulesPlaybook(skillId: string | null): void {
		this.turnRulesPlaybook = skillId && SNAKE_CODE.test(skillId) ? skillId : null;
	}

	/** The single per-execution receipt; null once taken, so a turn writes it once. */
	takePayload(input: {
		awaitingUserCard: boolean;
		finishedReason: string | null;
	}): JsonObject | null {
		if (this.taken) return null;
		this.taken = true;
		return {
			jev_status: this.selectionStatus,
			jev_write_commission: this.writeCommission,
			jev_commissioned_write_tools: [...this.commissionedWriteToolNames],
			proposed_write_tools: distinctToolNames(this.proposedWriteToolNames, MAX_TOOL_NAMES),
			proposed_write_call_count: Math.min(this.proposedWriteCallCount, 1000),
			review_outcomes: [...this.reviewOutcomes],
			awaiting_user_card: input.awaitingUserCard,
			writes_held: this.heldWriteToolNames.length > 0,
			hold_enabled: this.holdEnabled,
			turn_rules_playbook: this.turnRulesPlaybook,
			finished_reason:
				input.finishedReason && SNAKE_CODE.test(input.finishedReason)
					? input.finishedReason
					: null
		};
	}
}

const reportedObservationFailures = new Set<string>();

/**
 * Detached, never-throwing observation write keyed into the turn's
 * pending-effects set. Until migration 20261017202000 is applied the RPC
 * refuses these event types; that is reported once per process and code,
 * and the turn is unaffected.
 */
export function enqueueReviewTelemetryObservation(
	port: AgenticChatExecutionObservationPortV1 | undefined,
	request: Pick<
		AgenticChatTurnProviderRequestV1,
		'turnRunId' | 'queueJobId' | 'processingToken' | 'userId' | 'executionGeneration'
	>,
	eventType: 'provider_review_decided' | 'provider_commission_observed',
	scope: string,
	payload: JsonObject
): void {
	if (!port) return;
	try {
		const observationKey = createStableAgenticChatExecutionObservationKeyV1({
			turnRunId: request.turnRunId,
			scope,
			boundary: eventType
		});
		const write = port.observe(
			{
				turnRunId: request.turnRunId,
				queueJobId: request.queueJobId,
				processingToken: request.processingToken,
				userId: request.userId,
				executionGeneration: request.executionGeneration,
				observationKey,
				phase: 'provider',
				eventType,
				payload
			},
			AbortSignal.timeout(OBSERVATION_TIMEOUT_MS)
		);
		AGENTIC_CHAT_PENDING_EFFECTS_REGISTRY.forTurn(request.turnRunId).enqueue(
			write.catch((error: unknown) => reportObservationFailure(eventType, error))
		);
	} catch (error) {
		reportObservationFailure(eventType, error);
	}
}

function reportObservationFailure(eventType: string, error: unknown): void {
	const code =
		error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
			? error.code
			: 'unknown';
	const key = `${eventType}:${code}`;
	if (reportedObservationFailures.has(key)) return;
	reportedObservationFailures.add(key);
	console.warn(
		JSON.stringify({ event: 'agentic_chat_review_telemetry_failed', eventType, code })
	);
}

function distinctToolNames(names: readonly string[], limit: number): string[] {
	const result: string[] = [];
	for (const name of names) {
		if (!TOOL_NAME.test(name) || result.includes(name)) continue;
		result.push(name);
		if (result.length >= limit) break;
	}
	return result;
}

function positiveInteger(value: number, max: number): number {
	return Number.isSafeInteger(value) && value >= 1 ? Math.min(value, max) : 1;
}
