// apps/worker/tests/freshnessRadarCombine.test.ts
// Tasker 88 Lane B: code decides (plan section 1 "How code combines the answers",
// section 4 auto-apply rules, section 6 inbox cleanup, gauge rules).
import { describe, expect, it } from 'vitest';
import {
	buildProposal,
	combineEntityDecisions,
	computeGauge,
	decideInboxCleanup,
	rankCardDecisions,
	type AnswerMap,
	type AutoApplyGate,
	type EntityDecisionInput
} from '../src/workers/freshness-radar/combine';
import type { FreshnessDateMention } from '../src/workers/freshness-radar/dates';
import { FRESHNESS_POLICY_V1 } from '../src/workers/freshness-radar/freshnessPolicy';
import type {
	FreshnessCandidate,
	PrefilterFeatures
} from '../src/workers/freshness-radar/prefilter';

const TODAY = '2026-09-18';
const policy = FRESHNESS_POLICY_V1;

const features: PrefilterFeatures = {
	score: 1,
	title: 1,
	description: 0,
	dateMention: 0,
	dueSoon: 0,
	edge: 0,
	kindBonus: 0,
	padded: false,
	rank: 0
};

function candidate(
	overrides: Partial<FreshnessCandidate> & Pick<FreshnessCandidate, 'id' | 'title'>
): FreshnessCandidate {
	return {
		kind: 'task',
		description: null,
		state: 'todo',
		startAt: null,
		dueAt: null,
		targetDate: null,
		startCivil: null,
		dueCivil: null,
		targetCivil: null,
		updatedAt: '2026-09-10T12:00:00.000Z',
		createdAt: '2026-09-01T12:00:00.000Z',
		partOf: null,
		summary: null,
		props: {},
		...overrides
	};
}

const gate = (overrides: Partial<AutoApplyGate> = {}): AutoApplyGate => ({
	enabled: true,
	changedInWindow: new Set(),
	newestWindowMessageAt: '2026-09-18T14:00:00.000Z',
	calendarLinkedTaskIds: new Set(),
	recurringTaskIds: new Set(),
	assignedToOthersTaskIds: new Set(),
	recentlyUndone: new Set(),
	projectAutoApplied24h: 0,
	...overrides
});

const noul = (value: number) => ({ type: 'noul' as const, noul: value });
function choice(chosen: string, probabilities: Record<string, number>) {
	return { type: 'choice' as const, choice: chosen, probabilities, confidence: 0.9 };
}

const mention: FreshnessDateMention = {
	id: 'd1',
	date: '2026-10-03',
	as_written: 'Oct 3',
	sentence: 'The venue contract is now due Oct 3.',
	messageId: 'm1',
	sessionId: 's1'
};

const deck = candidate({ id: 't-deck', title: 'Investor deck' });
const venue = candidate({
	id: 't-venue',
	title: 'Venue contract',
	dueAt: '2026-10-01T03:59:59.000Z',
	dueCivil: '2026-09-30'
});
const sentences = [
	{ messageId: 'm1', sessionId: 's1', text: 'The investor deck is done and sent.' },
	{ messageId: 'm1', sessionId: 's1', text: 'The venue contract is now due Oct 3.' }
];

function run(
	entities: FreshnessCandidate[],
	answers: AnswerMap,
	options: {
		gate?: AutoApplyGate;
		suppressed?: Map<string, 'marked_not_stale' | 'dismissed'>;
	} = {}
) {
	const inputs: EntityDecisionInput[] = entities.map((entity, index) => ({
		index,
		candidate: entity,
		prefilter: { ...features, rank: index }
	}));
	return combineEntityDecisions({
		entities: inputs,
		answers,
		dateMentions: [mention],
		sentences,
		suppressed: options.suppressed ?? new Map(),
		gate: options.gate ?? gate(),
		today: TODAY,
		policy
	});
}

const doneAnswers = (stale: number, kind: number): AnswerMap => ({
	status_news: noul(0.9),
	stale_0: noul(stale),
	change_0: choice('mark_done', { mark_done: kind, no_change_needed: 1 - kind })
});

describe('threshold matrix', () => {
	it('walks evaluated -> suppressed -> surfaced -> drafted -> auto_apply_pending', () => {
		expect(
			run([deck], { ...doneAnswers(0.95, 0.95), status_news: noul(0.1) })[0]
		).toMatchObject({
			disposition: 'evaluated',
			reason: 'no_status_news'
		});
		expect(
			run([deck], doneAnswers(0.95, 0.95), {
				suppressed: new Map([['task:t-deck', 'marked_not_stale']])
			})[0]
		).toMatchObject({ disposition: 'suppressed', reason: 'marked_not_stale' });
		expect(run([deck], doneAnswers(0.59, 0.95))[0]).toMatchObject({
			disposition: 'evaluated',
			reason: 'below_stale_threshold'
		});
		expect(run([deck], doneAnswers(0.7, 0.45))[0]).toMatchObject({
			disposition: 'surfaced',
			reason: 'kind_disagrees'
		});
		expect(run([deck], doneAnswers(0.7, 0.7))[0]).toMatchObject({
			disposition: 'drafted',
			reason: 'draft_stale_below_auto'
		});
		const auto = run([deck], doneAnswers(0.95, 0.95))[0]!;
		expect(auto).toMatchObject({
			disposition: 'auto_apply_pending',
			reason: 'auto_apply_ready'
		});
		expect(auto.proposal?.operation).toEqual({
			tool: 'update_onto_task',
			args: { task_id: 't-deck', state_key: 'done' },
			label: 'Mark "Investor deck" done'
		});
		expect(auto.evidence).toMatchObject({
			message_id: 'm1',
			excerpt: 'The investor deck is done and sent.'
		});
	});

	it('drafts when auto-apply is switched off but records that the check passed', () => {
		const decision = run([deck], doneAnswers(0.95, 0.95), {
			gate: gate({ enabled: false })
		})[0]!;
		expect(decision).toMatchObject({
			disposition: 'drafted',
			reason: 'draft_auto_apply_disabled'
		});
		expect(decision.features.auto_apply_check).toBe('passed');
	});

	it('surfaces an ungrounded draft and documents without operations', () => {
		const ghost = candidate({ id: 't-ghost', title: 'Quarterly taxes' });
		expect(run([ghost], doneAnswers(0.8, 0.8))[0]).toMatchObject({
			disposition: 'surfaced',
			reason: 'not_grounded'
		});
		const doc = candidate({
			id: 'd-plan',
			kind: 'document',
			title: 'Launch plan',
			state: 'draft'
		});
		expect(
			run([doc], {
				status_news: noul(0.9),
				stale_0: noul(0.95),
				change_0: choice('content_outdated', {
					content_outdated: 0.95,
					no_change_needed: 0.05
				})
			})[0]
		).toMatchObject({
			disposition: 'surfaced',
			reason: 'no_operation_for_content_outdated',
			proposal: null
		});
	});
});

describe('auto-apply allowlist and rules', () => {
	const venueAnswers = (date: number): AnswerMap => ({
		status_news: noul(0.9),
		stale_0: noul(0.95),
		change_0: choice('reschedule_due', { reschedule_due: 0.95, no_change_needed: 0.05 }),
		date_0: choice('d1', { d1: date, none: 1 - date })
	});

	it('auto-applies a grounded absolute due date and keeps the previous raw value', () => {
		const decision = run([venue], venueAnswers(0.95))[0]!;
		expect(decision.disposition).toBe('auto_apply_pending');
		expect(decision.proposal).toMatchObject({
			field: 'due_at',
			from: '2026-09-30',
			to: '2026-10-03',
			previousRaw: '2026-10-01T03:59:59.000Z'
		});
		expect(decision.evidence).toMatchObject({ date_literal: 'Oct 3', date_iso: '2026-10-03' });
		expect(run([venue], venueAnswers(0.8))[0]).toMatchObject({
			disposition: 'drafted',
			reason: 'draft_date_below_auto'
		});
		expect(run([venue], venueAnswers(0.5))[0]).toMatchObject({ disposition: 'surfaced' });
	});

	it('never auto-applies calendar-linked, recurring, assigned, changed or undone tasks', () => {
		const cases: Array<[Partial<AutoApplyGate>, string]> = [
			[{ calendarLinkedTaskIds: new Set(['t-deck']) }, 'draft_calendar_linked'],
			[{ recurringTaskIds: new Set(['t-deck']) }, 'draft_recurring'],
			[{ assignedToOthersTaskIds: new Set(['t-deck']) }, 'draft_assigned_to_other'],
			[{ changedInWindow: new Set(['task:t-deck']) }, 'draft_changed_in_window'],
			[{ newestWindowMessageAt: '2026-09-01T00:00:00.000Z' }, 'draft_updated_after_window'],
			[{ recentlyUndone: new Set(['t-deck:state_key']) }, 'draft_recently_undone']
		];
		for (const [overrides, reason] of cases) {
			expect(
				run([deck], doneAnswers(0.95, 0.95), { gate: gate(overrides) })[0]
			).toMatchObject({
				disposition: 'drafted',
				reason
			});
		}
	});

	it('only drafts goals and milestones, and refuses invalid transitions', () => {
		const goal = candidate({ id: 'g1', kind: 'goal', title: 'Investor deck', state: 'active' });
		const decision = run([goal], {
			status_news: noul(0.9),
			stale_0: noul(0.99),
			change_0: choice('mark_achieved', { mark_achieved: 0.99, no_change_needed: 0.01 })
		})[0]!;
		expect(decision).toMatchObject({ disposition: 'drafted', reason: 'draft_not_a_task' });
		expect(decision.proposal?.operation.tool).toBe('update_onto_goal');
		expect(
			buildProposal({
				candidate: { ...deck, state: 'done' },
				changeKind: 'mark_done',
				dateMention: null
			})
		).toBeNull();
		const blocked = candidate({ id: 't-b', title: 'Investor deck', state: 'blocked' });
		expect(
			buildProposal({ candidate: blocked, changeKind: 'mark_in_progress', dateMention: null })
				?.to
		).toBe('in_progress');
		// blocked -> in_progress may be drafted, but is not on the auto-apply allowlist.
		expect(
			run([blocked], {
				status_news: noul(0.9),
				stale_0: noul(0.99),
				change_0: choice('mark_in_progress', {
					mark_in_progress: 0.99,
					no_change_needed: 0.01
				})
			})[0]
		).toMatchObject({ disposition: 'drafted', reason: 'draft_transition_not_allowlisted' });
	});

	it('caps auto-apply at 3 per scan and 6 per project per 24h', () => {
		const tasks = Array.from({ length: 5 }, (_, index) =>
			candidate({ id: `t${index}`, title: `Investor deck` })
		);
		const answers: Record<string, unknown> = { status_news: noul(0.9) };
		tasks.forEach((_, index) => {
			answers[`stale_${index}`] = noul(0.9 + index * 0.01);
			answers[`change_${index}`] = choice('mark_done', {
				mark_done: 0.95,
				no_change_needed: 0.05
			});
		});
		const decisions = run(tasks, answers as AnswerMap);
		expect(
			decisions
				.filter((d) => d.disposition === 'auto_apply_pending')
				.map((d) => d.candidate.id)
		).toEqual(['t2', 't3', 't4']);
		expect(decisions.filter((d) => d.reason === 'draft_auto_apply_cap')).toHaveLength(2);
		const nearDaily = run(tasks, answers as AnswerMap, {
			gate: gate({ projectAutoApplied24h: 5 })
		});
		expect(nearDaily.filter((d) => d.disposition === 'auto_apply_pending')).toHaveLength(1);
	});
});

describe('card ranking', () => {
	it('weights goals and milestones 1.2, tasks 1.0 and documents 0.9', () => {
		const goal = candidate({ id: 'g', kind: 'goal', title: 'G goal', state: 'active' });
		const doc = candidate({ id: 'd', kind: 'document', title: 'D doc', state: 'draft' });
		const task = candidate({ id: 't', title: 'T task' });
		const decisions = run([doc, task, goal], {
			status_news: noul(0.9),
			stale_0: noul(0.8),
			change_0: choice('content_outdated', { content_outdated: 0.8, no_change_needed: 0.2 }),
			stale_1: noul(0.75),
			change_1: choice('rewrite_details', { rewrite_details: 0.8, no_change_needed: 0.2 }),
			stale_2: noul(0.7),
			change_2: choice('rewrite_details', { rewrite_details: 0.8, no_change_needed: 0.2 })
		});
		const ranked = rankCardDecisions(decisions, 2);
		expect(ranked.top.map((d) => d.candidate.id)).toEqual(['g', 't']);
		expect(ranked.more).toBe(1);
	});
});

describe('gauge rules', () => {
	const score = (value: number, confidence = 0.8) => ({
		type: 'score' as const,
		score: value,
		confidence,
		probabilities: { '0': 0.25, '1': 0.25, '2': 0.25, '3': 0.25 }
	});
	const gauge = (answers: AnswerMap, hasTarget = true, linkedTaskCount = 3) =>
		computeGauge({ index: 0, answers, hasTarget, linkedTaskCount, policy });

	it('maps the score to off track, at risk and on track with a done hint', () => {
		expect(gauge({ track_0: score(0.5), evidence_0: noul(0.9) }).gauge).toBe('off_track');
		expect(gauge({ track_0: score(0.75), evidence_0: noul(0.9) }).gauge).toBe('at_risk');
		expect(gauge({ track_0: score(1.5), evidence_0: noul(0.9) }).gauge).toBe('on_track');
		expect(gauge({ track_0: score(2.6), evidence_0: noul(0.9) })).toMatchObject({
			gauge: 'on_track',
			looksDone: true
		});
	});

	it('is unknown without target and tasks, with low evidence or low confidence', () => {
		expect(gauge({ track_0: score(2), evidence_0: noul(0.9) }, false, 0).reason).toBe(
			'no_target_no_tasks'
		);
		expect(gauge({ track_0: score(2), evidence_0: noul(0.4) }).reason).toBe('low_evidence');
		expect(gauge({ track_0: score(2, 0.3), evidence_0: noul(0.9) }).reason).toBe(
			'low_confidence'
		);
	});
});

describe('inbox cleanup decisions', () => {
	it('retires eligible items >= 0.9 (max 3), marks the rest, and resets fresh', () => {
		const items = [
			{ eligibleForRetire: true, currentlyPossiblyStale: false },
			{ eligibleForRetire: false, currentlyPossiblyStale: false },
			{ eligibleForRetire: true, currentlyPossiblyStale: false },
			{ eligibleForRetire: true, currentlyPossiblyStale: true },
			{ eligibleForRetire: true, currentlyPossiblyStale: false },
			{ eligibleForRetire: true, currentlyPossiblyStale: false },
			{ eligibleForRetire: true, currentlyPossiblyStale: false }
		];
		const decisions = decideInboxCleanup({
			items,
			answers: {
				obsolete_0: noul(0.95),
				obsolete_1: noul(0.99),
				obsolete_2: noul(0.7),
				obsolete_3: noul(0.2),
				obsolete_4: noul(0.97),
				obsolete_5: noul(0.96),
				obsolete_6: noul(0.91)
			},
			policy
		});
		expect(decisions.map((decision) => [decision.action, decision.reason])).toEqual([
			['retire', 'obsolete'],
			['mark', 'not_retire_eligible'],
			['mark', 'possibly_obsolete'],
			['reset_fresh', 'no_longer_stale'],
			['retire', 'obsolete'],
			['retire', 'obsolete'],
			['mark', 'retire_cap']
		]);
	});
});
