// apps/worker/src/workers/freshness-radar/trackScores.ts
//
// On-track gauges (plan section 1, "On-track gauge"): one freshness_track_scores
// row per goal or milestone scored, and the gauge changes the card reports.

import type { FreshnessCardPayloadV1, FreshnessGauge } from '@buildos/shared-types';
import { type AnswerMap, type GaugeDecision, computeGauge } from './combine';
import type { FreshnessTrackSubject } from './context';
import type { FreshnessPolicyV1 } from './freshnessPolicy';
import type { TrackScoreInsert } from './ledger';

export type TrackScoreDecision = { subject: FreshnessTrackSubject; gauge: GaugeDecision };

export function scoreTrackSubjects(params: {
	subjects: readonly FreshnessTrackSubject[];
	answers: AnswerMap;
	policy: FreshnessPolicyV1;
}): TrackScoreDecision[] {
	return params.subjects.map((subject, index) => ({
		subject,
		gauge: computeGauge({
			index,
			answers: params.answers,
			hasTarget: subject.hasTarget,
			linkedTaskCount: subject.linkedTaskCount,
			policy: params.policy
		})
	}));
}

export function trackScoreRows(decisions: readonly TrackScoreDecision[]): TrackScoreInsert[] {
	return decisions.map(({ subject, gauge }) => ({
		subject_kind: subject.candidate.kind,
		subject_id: subject.candidate.id,
		subject_title: subject.candidate.title,
		gauge: gauge.gauge,
		previous_gauge: subject.previousGauge,
		score: gauge.score,
		score_confidence: gauge.scoreConfidence,
		evidence_probability: gauge.evidenceProbability,
		answers: { ...gauge.answers, reason: gauge.reason, looks_done: gauge.looksDone },
		facts: subject.facts,
		target_at: subject.targetAt
	}));
}

const WORRYING: ReadonlySet<FreshnessGauge> = new Set(['at_risk', 'off_track']);

/**
 * Changes worth a line on the card: a known gauge that moved, or a first reading
 * that is already at risk or off track. Unknown readings never make the card.
 */
export function gaugeChanges(
	decisions: readonly TrackScoreDecision[]
): FreshnessCardPayloadV1['gaugeChanges'] {
	const changes: FreshnessCardPayloadV1['gaugeChanges'] = [];
	for (const { subject, gauge } of decisions) {
		if (gauge.gauge === 'unknown') continue;
		const previous = (subject.previousGauge ?? null) as FreshnessGauge | null;
		const moved = previous !== null && previous !== 'unknown' && previous !== gauge.gauge;
		const firstWorrying =
			(previous === null || previous === 'unknown') && WORRYING.has(gauge.gauge);
		if (!moved && !firstWorrying) continue;
		changes.push({
			entity: {
				kind: subject.candidate.kind,
				id: subject.candidate.id,
				title: subject.candidate.title
			},
			from: previous === 'unknown' ? null : previous,
			to: gauge.gauge
		});
	}
	return changes;
}
