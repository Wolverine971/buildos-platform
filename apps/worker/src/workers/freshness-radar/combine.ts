// apps/worker/src/workers/freshness-radar/combine.ts
//
// Code, not the model, decides what happens (plan section 1, "How code
// combines the answers", and section 4). Jev supplies probabilities; this
// module applies FRESHNESS_POLICY_V1 thresholds, the auto-apply allowlist,
// deterministic grounding, suppression and caps, and returns one decision per
// evaluated subject. It is pure: every database fact arrives precomputed.

import type {
	FreshnessChangeKind,
	FreshnessDisposition,
	FreshnessEntityKind,
	FreshnessEvidence,
	FreshnessGauge,
	LoopOperation
} from '@buildos/shared-types';
import type { JevChoiceAnswer, JevNoulAnswer, JevScoreAnswer } from '@buildos/smart-llm';
import type { FreshnessDateMention, SourcedSentence } from './dates';
import type { FreshnessPolicyV1 } from './freshnessPolicy';
import {
	evidenceExcerpt,
	looseGround,
	strictGroundDueDate,
	strictGroundStateChange,
	type GroundingTargetState
} from './grounding';
import type { FreshnessCandidate, PrefilterFeatures } from './prefilter';
import { r1QuestionKeys, r2QuestionKeys, r3QuestionKey } from './questions';

export type JevAnswer = JevNoulAnswer | JevChoiceAnswer | JevScoreAnswer;
export type AnswerMap = Readonly<Record<string, JevAnswer | undefined>>;

function noulOf(answers: AnswerMap, key: string): number | null {
	const answer = answers[key];
	return answer?.type === 'noul' && Number.isFinite(answer.noul) ? answer.noul : null;
}

function choiceOf(
	answers: AnswerMap,
	key: string
): { choice: string; probability: number; probabilities: Readonly<Record<string, number>> } | null {
	const answer = answers[key];
	if (answer?.type !== 'choice') return null;
	const probabilities = answer.probabilities as Readonly<Record<string, number>>;
	const probability = probabilities[answer.choice];
	return typeof probability === 'number' && Number.isFinite(probability)
		? { choice: answer.choice, probability, probabilities }
		: null;
}

function round4(value: number): number {
	return Math.round(value * 10_000) / 10_000;
}

// ---------------------------------------------------------------------------
// Operation mapping (plan section 1 table) and the auto-apply allowlist
// ---------------------------------------------------------------------------

export type ProposalField = 'state_key' | 'due_at' | 'target_date';

export type FreshnessProposal = {
	field: ProposalField;
	/** Current value as shown to the user (state key or civil date). */
	from: string | null;
	/** Proposed value (state key or civil date). */
	to: string;
	/** Raw stored value before the change (full ISO for timestamps, or null) — undo uses it. */
	previousRaw: string | null;
	summary: string;
	operation: LoopOperation;
};

const TASK_STATE_TARGET: Partial<Record<FreshnessChangeKind, 'done' | 'in_progress' | 'blocked'>> =
	{
		mark_done: 'done',
		mark_in_progress: 'in_progress',
		mark_blocked: 'blocked'
	};
const GOAL_STATE_TARGET: Partial<Record<FreshnessChangeKind, 'achieved' | 'abandoned'>> = {
	mark_achieved: 'achieved',
	mark_abandoned: 'abandoned'
};
const MILESTONE_STATE_TARGET: Partial<
	Record<FreshnessChangeKind, 'completed' | 'in_progress' | 'missed'>
> = {
	mark_completed: 'completed',
	mark_in_progress: 'in_progress',
	mark_missed: 'missed'
};

/** Valid draft transitions (a no-op or a move backwards is never proposed). */
const VALID_FROM: Record<string, readonly string[]> = {
	'task:done': ['todo', 'in_progress', 'blocked'],
	'task:in_progress': ['todo', 'blocked'],
	'task:blocked': ['todo', 'in_progress'],
	'goal:achieved': ['draft', 'active'],
	'goal:abandoned': ['draft', 'active'],
	'milestone:completed': ['pending', 'in_progress'],
	'milestone:in_progress': ['pending'],
	'milestone:missed': ['pending', 'in_progress']
};

/** Section 4 allowlist: task state transitions that may be auto-applied. */
const AUTO_APPLY_TASK_FROM: Record<'done' | 'in_progress' | 'blocked', readonly string[]> = {
	in_progress: ['todo'],
	blocked: ['todo', 'in_progress'],
	done: ['todo', 'in_progress', 'blocked']
};

const STATE_LABEL: Record<string, string> = {
	done: 'done',
	in_progress: 'in progress',
	blocked: 'blocked',
	achieved: 'achieved',
	abandoned: 'abandoned',
	completed: 'completed',
	missed: 'missed'
};

function quoted(title: string): string {
	return `"${title.replace(/\s+/g, ' ').trim()}"`;
}

function toolFor(kind: FreshnessEntityKind): { tool: string; idArg: string } | null {
	if (kind === 'task') return { tool: 'update_onto_task', idArg: 'task_id' };
	if (kind === 'goal') return { tool: 'update_onto_goal', idArg: 'goal_id' };
	if (kind === 'milestone') return { tool: 'update_onto_milestone', idArg: 'milestone_id' };
	return null;
}

export function buildProposal(params: {
	candidate: FreshnessCandidate;
	changeKind: FreshnessChangeKind;
	dateMention: FreshnessDateMention | null;
}): FreshnessProposal | null {
	const { candidate, changeKind } = params;
	const tool = toolFor(candidate.kind);
	if (!tool) return null; // documents never get an operation
	const title = candidate.title;

	const target =
		candidate.kind === 'task'
			? TASK_STATE_TARGET[changeKind]
			: candidate.kind === 'goal'
				? GOAL_STATE_TARGET[changeKind]
				: MILESTONE_STATE_TARGET[changeKind];
	if (target) {
		const allowedFrom = VALID_FROM[`${candidate.kind}:${target}`] ?? [];
		if (!allowedFrom.includes(candidate.state)) return null;
		return {
			field: 'state_key',
			from: candidate.state,
			to: target,
			previousRaw: candidate.state,
			summary: `Mark ${STATE_LABEL[target] ?? target}`,
			operation: {
				tool: tool.tool,
				args: { [tool.idArg]: candidate.id, state_key: target },
				label: `Mark ${quoted(title)} ${STATE_LABEL[target] ?? target}`
			}
		};
	}

	const isDateKind =
		(candidate.kind === 'task' && changeKind === 'reschedule_due') ||
		(candidate.kind === 'milestone' && changeKind === 'reschedule_due') ||
		(candidate.kind === 'goal' && changeKind === 'retarget_date');
	if (!isDateKind || !params.dateMention) return null;
	const field: ProposalField = candidate.kind === 'goal' ? 'target_date' : 'due_at';
	const currentCivil = candidate.kind === 'goal' ? candidate.targetCivil : candidate.dueCivil;
	const currentRaw = candidate.kind === 'goal' ? candidate.targetDate : candidate.dueAt;
	const to = params.dateMention.date;
	if (currentCivil === to) return null;
	const fieldLabel = field === 'target_date' ? 'target date' : 'due date';
	return {
		field,
		from: currentCivil,
		to,
		previousRaw: currentRaw,
		summary: `Move ${fieldLabel} to ${to}`,
		operation: {
			tool: tool.tool,
			args: { [tool.idArg]: candidate.id, [field]: to },
			label: `Move the ${fieldLabel} of ${quoted(title)} to ${to}`
		}
	};
}

/** The draft-in-chat composer text for a flag the radar will not draft itself. */
export function draftInChatPrompt(
	candidate: FreshnessCandidate,
	changeKind: FreshnessChangeKind | null
) {
	const title = quoted(candidate.title);
	if (changeKind === 'cancel_or_drop') return `Drop ${title}, it's no longer needed.`;
	if (changeKind === 'superseded') return `Update ${title}, what I just described replaces it.`;
	return `Update ${title} to reflect what I just said.`;
}

// ---------------------------------------------------------------------------
// Entity decisions
// ---------------------------------------------------------------------------

export type AutoApplyGate = {
	/** Env live + user flags `.surfaces` and `.auto_apply` (section 4, rule 1). */
	enabled: boolean;
	/** `${kind}:${id}` changed in the window by the sessions or the user. */
	changedInWindow: ReadonlySet<string>;
	newestWindowMessageAt: string | null;
	calendarLinkedTaskIds: ReadonlySet<string>;
	recurringTaskIds: ReadonlySet<string>;
	assignedToOthersTaskIds: ReadonlySet<string>;
	/** `${taskId}:${field}` undone by the user in the last 30 days. */
	recentlyUndone: ReadonlySet<string>;
	/** Auto-applies for this project in the last 24 hours. */
	projectAutoApplied24h: number;
};

export type SuppressionReason = 'marked_not_stale' | 'dismissed';

export type EntityDecisionInput = {
	index: number;
	candidate: FreshnessCandidate;
	prefilter: PrefilterFeatures;
};

export type EntityDecision = {
	index: number;
	candidate: FreshnessCandidate;
	probability: number;
	statusNews: number;
	changeKind: FreshnessChangeKind | null;
	changeKindProbability: number | null;
	dateChoice: string | null;
	dateChoiceProbability: number | null;
	dateMention: FreshnessDateMention | null;
	disposition: FreshnessDisposition;
	reason: string;
	proposal: FreshnessProposal | null;
	evidence: FreshnessEvidence | null;
	answers: Record<string, unknown>;
	features: Record<string, unknown>;
	/** Weighted card rank (probability × kind weight). */
	cardScore: number;
};

function evidenceFrom(
	sentence: SourcedSentence | null,
	excerptChars: number,
	date?: { literal?: string; iso?: string }
): FreshnessEvidence | null {
	if (!sentence) return null;
	return {
		message_id: sentence.messageId,
		session_id: sentence.sessionId,
		excerpt: evidenceExcerpt(sentence.text, excerptChars),
		...(date?.literal ? { date_literal: date.literal } : {}),
		...(date?.iso ? { date_iso: date.iso } : {})
	};
}

function isAfter(a: string | null, b: string | null): boolean {
	if (!a || !b) return false;
	const left = Date.parse(a);
	const right = Date.parse(b);
	return Number.isFinite(left) && Number.isFinite(right) && left > right;
}

type AutoApplyCheck = { ok: true; evidence: FreshnessEvidence } | { ok: false; reason: string };

function checkAutoApply(params: {
	candidate: FreshnessCandidate;
	proposal: FreshnessProposal;
	stale: number;
	kindProbability: number;
	dateProbability: number | null;
	dateMention: FreshnessDateMention | null;
	gate: AutoApplyGate;
	sentences: readonly SourcedSentence[];
	today: string;
	policy: FreshnessPolicyV1;
}): AutoApplyCheck {
	const { candidate, proposal, gate, policy } = params;
	const rules = policy.autoApply;
	// Tasks only (coordinator default, plan section 10 item 2).
	if (candidate.kind !== 'task') return { ok: false, reason: 'not_a_task' };
	if (params.stale < rules.staleMin) return { ok: false, reason: 'stale_below_auto' };
	if (params.kindProbability < rules.kindMin) return { ok: false, reason: 'kind_below_auto' };
	if (proposal.field === 'state_key') {
		const target = proposal.to as 'done' | 'in_progress' | 'blocked';
		if (!AUTO_APPLY_TASK_FROM[target]?.includes(candidate.state)) {
			return { ok: false, reason: 'transition_not_allowlisted' };
		}
	} else if (proposal.field === 'due_at') {
		if ((params.dateProbability ?? 0) < rules.dateMin) {
			return { ok: false, reason: 'date_below_auto' };
		}
	} else {
		return { ok: false, reason: 'field_not_allowlisted' };
	}
	if (gate.changedInWindow.has(`${candidate.kind}:${candidate.id}`)) {
		return { ok: false, reason: 'changed_in_window' };
	}
	if (isAfter(candidate.updatedAt, gate.newestWindowMessageAt)) {
		return { ok: false, reason: 'updated_after_window' };
	}
	if (gate.calendarLinkedTaskIds.has(candidate.id))
		return { ok: false, reason: 'calendar_linked' };
	if (gate.recurringTaskIds.has(candidate.id)) return { ok: false, reason: 'recurring' };
	if (gate.assignedToOthersTaskIds.has(candidate.id)) {
		return { ok: false, reason: 'assigned_to_other' };
	}
	if (gate.recentlyUndone.has(`${candidate.id}:${proposal.field}`)) {
		return { ok: false, reason: 'recently_undone' };
	}

	if (proposal.field === 'state_key') {
		const grounding = strictGroundStateChange({
			title: candidate.title,
			targetState: proposal.to as GroundingTargetState,
			sentences: params.sentences,
			negationWindowTokens: rules.negationWindowTokens
		});
		if (!grounding.ok) return { ok: false, reason: `grounding_${grounding.reason}` };
		return {
			ok: true,
			evidence: evidenceFrom(grounding.sentence, policy.evidence.excerptChars)!
		};
	}
	const grounding = strictGroundDueDate({
		title: candidate.title,
		dateIso: proposal.to,
		currentDueCivil: candidate.dueCivil,
		sentences: params.sentences,
		today: params.today,
		horizonDays: rules.dateHorizonDays
	});
	if (!grounding.ok) return { ok: false, reason: `grounding_${grounding.reason}` };
	return {
		ok: true,
		evidence: evidenceFrom(grounding.sentence, policy.evidence.excerptChars, {
			literal: grounding.dateLiteral,
			iso: proposal.to
		})!
	};
}

/**
 * One decision per evaluated entity, in prefilter rank order. Applies the
 * ordered rules of plan section 1 step 1-5, then the per-scan and per-project
 * auto-apply caps (over-cap candidates fall back to drafts).
 */
export function combineEntityDecisions(params: {
	entities: readonly EntityDecisionInput[];
	answers: AnswerMap;
	dateMentions: readonly FreshnessDateMention[];
	sentences: readonly SourcedSentence[];
	suppressed: ReadonlyMap<string, SuppressionReason>;
	gate: AutoApplyGate;
	today: string;
	policy: FreshnessPolicyV1;
}): EntityDecision[] {
	const { policy } = params;
	const combine = policy.combine;
	const statusNews = noulOf(params.answers, 'status_news') ?? 0;
	const mentionById = new Map(params.dateMentions.map((mention) => [mention.id, mention]));

	const decisions = params.entities.map((entity): EntityDecision => {
		const { candidate } = entity;
		const keys = r1QuestionKeys(entity.index);
		const stale = noulOf(params.answers, keys.stale) ?? 0;
		const change = choiceOf(params.answers, keys.change);
		const date = choiceOf(params.answers, keys.date);
		const changeKind = (change?.choice ?? null) as FreshnessChangeKind | null;
		const dateMention =
			date && date.choice !== 'none' ? (mentionById.get(date.choice) ?? null) : null;
		const weight = combine.cardWeights[candidate.kind] ?? 1;
		const base: EntityDecision = {
			index: entity.index,
			candidate,
			probability: round4(stale),
			statusNews: round4(statusNews),
			changeKind,
			changeKindProbability: change ? round4(change.probability) : null,
			dateChoice: date?.choice ?? null,
			dateChoiceProbability: date ? round4(date.probability) : null,
			dateMention,
			disposition: 'evaluated',
			reason: '',
			proposal: null,
			evidence: null,
			answers: {
				status_news: params.answers.status_news ?? null,
				stale: params.answers[keys.stale] ?? null,
				change: params.answers[keys.change] ?? null,
				...(params.answers[keys.date] ? { date: params.answers[keys.date] } : {})
			},
			features: { prefilter: entity.prefilter },
			cardScore: round4(stale * weight)
		};

		if (statusNews < combine.statusNewsMin) return { ...base, reason: 'no_status_news' };
		const suppression = params.suppressed.get(`${candidate.kind}:${candidate.id}`);
		if (suppression) return { ...base, disposition: 'suppressed', reason: suppression };
		if (stale < combine.staleMin) return { ...base, reason: 'below_stale_threshold' };

		const loose = looseGround(candidate.title, params.sentences);
		const looseEvidence = evidenceFrom(loose, policy.evidence.excerptChars);
		const noChange = change?.probabilities.no_change_needed ?? 0;
		if (noChange >= combine.noChangeDisagreeMin) {
			return {
				...base,
				disposition: 'surfaced',
				reason: 'kind_disagrees',
				evidence: looseEvidence
			};
		}

		const proposal = changeKind ? buildProposal({ candidate, changeKind, dateMention }) : null;
		if (!proposal) {
			return {
				...base,
				disposition: 'surfaced',
				reason: changeKind ? `no_operation_for_${changeKind}` : 'no_change_kind',
				evidence: looseEvidence
			};
		}

		const kindProbability = change?.probability ?? 0;
		const isDate = proposal.field !== 'state_key';
		const auto = checkAutoApply({
			candidate,
			proposal,
			stale,
			kindProbability,
			dateProbability: isDate ? (date?.probability ?? 0) : null,
			dateMention,
			gate: params.gate,
			sentences: params.sentences,
			today: params.today,
			policy
		});
		// The rules are always evaluated, so shadow scans and live scans without the
		// auto-apply flag still record what WOULD have been auto-applied.
		const features = { ...base.features, auto_apply_check: auto.ok ? 'passed' : auto.reason };
		if (auto.ok && params.gate.enabled) {
			return {
				...base,
				features,
				disposition: 'auto_apply_pending',
				reason: 'auto_apply_ready',
				proposal,
				evidence: auto.evidence
			};
		}

		const draftReason = auto.ok ? 'draft_auto_apply_disabled' : `draft_${auto.reason}`;
		const draftable =
			kindProbability >= combine.draftKindMin &&
			(!isDate || (date?.probability ?? 0) >= combine.draftDateMin) &&
			loose !== null;
		if (draftable) {
			return {
				...base,
				features,
				disposition: 'drafted',
				reason: draftReason,
				proposal,
				evidence: looseEvidence
			};
		}
		return {
			...base,
			features,
			disposition: 'surfaced',
			reason: loose ? 'draft_thresholds_not_met' : 'not_grounded',
			proposal,
			evidence: looseEvidence
		};
	});

	// Caps (section 4, rule 7): at most N per scan and M per project per 24h.
	const remaining = Math.max(
		0,
		Math.min(
			policy.autoApply.maxPerScan,
			policy.autoApply.maxPerProjectPer24h - params.gate.projectAutoApplied24h
		)
	);
	const autoOrder = decisions
		.filter((decision) => decision.disposition === 'auto_apply_pending')
		.sort((a, b) => b.probability - a.probability || a.index - b.index);
	const overCap = new Set(autoOrder.slice(remaining).map((decision) => decision.index));
	return decisions.map((decision) =>
		overCap.has(decision.index)
			? { ...decision, disposition: 'drafted', reason: 'draft_auto_apply_cap' }
			: decision
	);
}

/**
 * The card's top items: surfaced and drafted flags by probability weighted by
 * kind (goals and milestones 1.2, tasks 1.0, documents 0.9).
 */
export function rankCardDecisions(
	decisions: readonly EntityDecision[],
	max: number
): { top: EntityDecision[]; more: number } {
	const visible = decisions
		.filter(
			(decision) => decision.disposition === 'surfaced' || decision.disposition === 'drafted'
		)
		.sort((a, b) => b.cardScore - a.cardScore || a.index - b.index);
	return { top: visible.slice(0, max), more: Math.max(0, visible.length - max) };
}

// ---------------------------------------------------------------------------
// On-track gauge (plan section 1)
// ---------------------------------------------------------------------------

export type GaugeDecision = {
	gauge: FreshnessGauge;
	score: number | null;
	scoreConfidence: number | null;
	evidenceProbability: number | null;
	looksDone: boolean;
	reason: string;
	answers: Record<string, unknown>;
};

export function computeGauge(params: {
	index: number;
	answers: AnswerMap;
	hasTarget: boolean;
	linkedTaskCount: number;
	policy: FreshnessPolicyV1;
}): GaugeDecision {
	const keys = r2QuestionKeys(params.index);
	const trackAnswer = params.answers[keys.track];
	const score =
		trackAnswer?.type === 'score' && Number.isFinite(trackAnswer.score)
			? trackAnswer.score
			: null;
	const confidence =
		trackAnswer?.type === 'score' && Number.isFinite(trackAnswer.confidence)
			? trackAnswer.confidence
			: null;
	const evidence = noulOf(params.answers, keys.evidence);
	const answers = {
		track: trackAnswer ?? null,
		evidence: params.answers[keys.evidence] ?? null
	};
	const result = (gauge: FreshnessGauge, reason: string, looksDone = false): GaugeDecision => ({
		gauge,
		score: score === null ? null : Math.round(score * 1000) / 1000,
		scoreConfidence: confidence === null ? null : round4(confidence),
		evidenceProbability: evidence === null ? null : round4(evidence),
		looksDone,
		reason,
		answers
	});
	const gauge = params.policy.gauge;
	if (!params.hasTarget && params.linkedTaskCount === 0)
		return result('unknown', 'no_target_no_tasks');
	if (evidence === null || evidence < gauge.evidenceMin) return result('unknown', 'low_evidence');
	if (score === null || confidence === null || confidence < gauge.confidenceMin) {
		return result('unknown', 'low_confidence');
	}
	if (score < gauge.offTrackBelow) return result('off_track', 'score');
	if (score < gauge.atRiskBelow) return result('at_risk', 'score');
	return result('on_track', 'score', score >= gauge.doneHintAtOrAbove);
}

// ---------------------------------------------------------------------------
// Inbox cleanup (plan section 6)
// ---------------------------------------------------------------------------

export type InboxCleanupAction = 'retire' | 'mark' | 'reset_fresh' | 'none';

export type InboxDecision = {
	index: number;
	probability: number;
	action: InboxCleanupAction;
	disposition: FreshnessDisposition;
	reason: string;
	answers: Record<string, unknown>;
};

export function decideInboxCleanup(params: {
	items: ReadonlyArray<{ eligibleForRetire: boolean; currentlyPossiblyStale: boolean }>;
	answers: AnswerMap;
	policy: FreshnessPolicyV1;
}): InboxDecision[] {
	const rules = params.policy.inbox;
	let retired = 0;
	const order = params.items
		.map((item, index) => ({
			item,
			index,
			probability: noulOf(params.answers, r3QuestionKey(index)) ?? 0
		}))
		.sort((a, b) => b.probability - a.probability || a.index - b.index);
	const decisions = new Map<number, InboxDecision>();
	for (const { item, index, probability } of order) {
		const answers = { obsolete: params.answers[r3QuestionKey(index)] ?? null };
		const base = { index, probability: round4(probability), answers };
		if (probability >= rules.retireMin) {
			if (item.eligibleForRetire && retired < rules.maxRetiredPerScan) {
				retired += 1;
				decisions.set(index, {
					...base,
					action: 'retire',
					disposition: 'retired',
					reason: 'obsolete'
				});
				continue;
			}
			decisions.set(index, {
				...base,
				action: 'mark',
				disposition: 'marked_possibly_stale',
				reason: item.eligibleForRetire ? 'retire_cap' : 'not_retire_eligible'
			});
			continue;
		}
		if (probability >= rules.markMin) {
			decisions.set(index, {
				...base,
				action: 'mark',
				disposition: 'marked_possibly_stale',
				reason: 'possibly_obsolete'
			});
			continue;
		}
		decisions.set(index, {
			...base,
			action: item.currentlyPossiblyStale ? 'reset_fresh' : 'none',
			disposition: 'evaluated',
			reason: item.currentlyPossiblyStale ? 'no_longer_stale' : 'not_obsolete'
		});
	}
	return params.items.map((_, index) => decisions.get(index)!);
}
