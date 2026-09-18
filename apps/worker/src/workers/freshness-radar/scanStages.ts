// apps/worker/src/workers/freshness-radar/scanStages.ts
//
// The pure stages between context [1] and side effects [4]/[5], shared by the
// live scan (signalJob.ts) and the backtest (scripts/freshness-radar-backtest.ts),
// so both run the SAME code (plan section 7, "Replay"):
//   [2] build the R1/R2/R3 Jev requests from the context;
//   [3] combine Jev's (namespaced) answers into entity, gauge and inbox decisions.
// No I/O here: each caller owns its Jev transport and its writes.

import { type AnswerMap, combineEntityDecisions, decideInboxCleanup } from './combine';
import { type FreshnessScanContext, entityKey, trackSubjectView } from './context';
import type { FreshnessPolicyV1 } from './freshnessPolicy';
import {
	type FreshnessJevRequest,
	type R1Subject,
	buildR1Request,
	buildR2Request,
	buildR3Request
} from './questions';
import { scoreTrackSubjects } from './trackScores';

export type ScanRequestName = 'r1' | 'r2' | 'r3';

export type ScanRequestPlan = {
	requests: Array<{ name: ScanRequestName; request: FreshnessJevRequest }>;
	/** The subjects that made it into each request after byte trimming. */
	evaluatedEntities: FreshnessScanContext['prefiltered'];
	trackSubjects: FreshnessScanContext['trackSubjects'];
	inboxSubjects: FreshnessScanContext['inboxSubjects'];
	droppedForSize: number;
};

/** [2] The three requests; a request with no subjects is omitted. */
export function planScanRequests(
	context: FreshnessScanContext,
	model: string,
	policy: FreshnessPolicyV1
): ScanRequestPlan {
	const common = {
		model,
		maxBytes: policy.jev.maxRequestBytes,
		today: context.today,
		project: context.project,
		newInformation: context.newInformation,
		titleChars: policy.jev.titleChars
	};
	const r1 = buildR1Request({
		...common,
		dateMentions: context.dateMentions,
		dateSentenceChars: policy.jev.dateSentenceChars,
		subjects: context.prefiltered.map(
			(entry): R1Subject => ({
				kind: entry.candidate.kind,
				view: context.entityViews.get(entityKey(entry.candidate.kind, entry.candidate.id))!
			})
		)
	});
	const r2 = buildR2Request({
		...common,
		subjects: context.trackSubjects.map((subject) => ({ view: trackSubjectView(subject) }))
	});
	const r3 = buildR3Request({
		...common,
		subjects: context.inboxSubjects.map((subject) => ({ view: subject.view }))
	});
	const requests: ScanRequestPlan['requests'] = [];
	if (r1.request) requests.push({ name: 'r1', request: r1.request });
	if (r2.request) requests.push({ name: 'r2', request: r2.request });
	if (r3.request) requests.push({ name: 'r3', request: r3.request });
	return {
		requests,
		evaluatedEntities: context.prefiltered.slice(0, r1.subjects.length),
		trackSubjects: context.trackSubjects.slice(0, r2.subjects.length),
		inboxSubjects: context.inboxSubjects.slice(0, r3.subjects.length),
		droppedForSize: r1.droppedForSize + r2.droppedForSize + r3.droppedForSize
	};
}

/** Answers of one request, with its `r1.` / `r2.` / `r3.` namespace removed. */
export function scopedAnswers(answers: AnswerMap, name: ScanRequestName): AnswerMap {
	const prefix = `${name}.`;
	const scoped: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(answers)) {
		if (key.startsWith(prefix)) scoped[key.slice(prefix.length)] = value;
	}
	return scoped as AnswerMap;
}

/** Namespace one request's answers (the inverse of scopedAnswers). */
export function namespaceAnswers(
	name: ScanRequestName,
	answers: Record<string, unknown>
): Record<string, unknown> {
	return Object.fromEntries(
		Object.entries(answers).map(([key, value]) => [`${name}.${key}`, value])
	);
}

/** [3] Code combine: every threshold, grounding and safety rule lives here. */
export function decideScan(params: {
	context: FreshnessScanContext;
	plan: ScanRequestPlan;
	projectId: string;
	answers: AnswerMap;
	/** live mode with the surfaces and auto_apply flags. */
	gateEnabled: boolean;
	policy: FreshnessPolicyV1;
}) {
	const { context, plan, policy } = params;
	const entityDecisions = combineEntityDecisions({
		projectId: params.projectId,
		entities: plan.evaluatedEntities.map((entry, index) => ({
			index,
			candidate: entry.candidate,
			prefilter: entry.features
		})),
		answers: scopedAnswers(params.answers, 'r1'),
		dateMentions: context.dateMentions,
		sentences: context.sentences,
		suppressed: context.suppressed,
		gate: { ...context.gate, enabled: params.gateEnabled },
		today: context.today,
		timeZone: context.timeZone,
		policy
	});
	const trackDecisions = scoreTrackSubjects({
		subjects: plan.trackSubjects,
		answers: scopedAnswers(params.answers, 'r2'),
		policy
	});
	const inboxDecisions = decideInboxCleanup({
		items: plan.inboxSubjects,
		answers: scopedAnswers(params.answers, 'r3'),
		policy
	});
	return { entityDecisions, trackDecisions, inboxDecisions };
}
