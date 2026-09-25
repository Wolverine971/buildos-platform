// apps/worker/src/workers/freshness-radar/scanStages.ts
//
// The pure stages between context [1] and side effects [4]/[5], shared by the
// live scan (signalJob.ts) and the backtest (scripts/freshness-radar-backtest.ts),
// so both run the SAME code (plan section 7, "Replay"):
//   [1b] targeting (tasker 106): Jev rates every pool record against the news;
//        the selected tasks/goals/milestones go to R1, the selected documents
//        to the section dig. The lexical top-N is the fallback when Jev fails;
//   [2] build the R1/dig/R2/R3 Jev requests from the context;
//   [3] combine Jev's (namespaced) answers into entity, gauge and inbox decisions.
// No I/O here: each caller owns its Jev transport and its writes.

import {
	type AnswerMap,
	type DocumentDigInput,
	combineDocumentDecisions,
	combineEntityDecisions,
	decideInboxCleanup
} from './combine';
import { type FreshnessScanContext, entityKey, trackSubjectView } from './context';
import type { FreshnessPolicyV1 } from './freshnessPolicy';
import type { PrefilteredCandidate } from './prefilter';
import {
	type FreshnessJevRequest,
	type JevSectionView,
	type R1Subject,
	buildDigRequest,
	buildR1Request,
	buildR2Request,
	buildR3Request,
	buildTargetingRequest,
	chatBearsQuestionKey,
	targetQuestionKey
} from './questions';
import { scoreTrackSubjects } from './trackScores';

export type ScanRequestName = 'target' | 'r1' | 'dig' | 'r2' | 'r3';

// ---------------------------------------------------------------------------
// [1b] Targeting
// ---------------------------------------------------------------------------

export type TargetingPlan = {
	request: FreshnessJevRequest | null;
	/** Pool entries actually sent (after byte trimming), index-aligned with records[i]. */
	records: PrefilteredCandidate[];
	droppedForSize: number;
};

export function planTargeting(
	context: FreshnessScanContext,
	model: string,
	policy: FreshnessPolicyV1
): TargetingPlan {
	const built = buildTargetingRequest({
		model,
		maxBytes: policy.jev.maxRequestBytes,
		today: context.today,
		project: context.project,
		newInformation: context.newInformation,
		decisions: context.decisionViews,
		titleChars: policy.jev.titleChars,
		records: context.pool.map(
			(entry) => context.targetViews.get(entityKey(entry.candidate.kind, entry.candidate.id))!
		)
	});
	return {
		request: built.request,
		records: context.pool.slice(0, built.subjects.length),
		droppedForSize: built.droppedForSize
	};
}

export type TargetingResult = {
	source: 'jev' | 'lexical_fallback' | 'none';
	/** Tasks, goals and milestones for R1, best first. */
	entities: PrefilteredCandidate[];
	/** Documents for the section dig, best first. */
	documents: PrefilteredCandidate[];
	/** Targeting probability per `${kind}:${id}` (Jev only). */
	scores: Map<string, number>;
};

function splitByKind(entries: readonly PrefilteredCandidate[], policy: FreshnessPolicyV1) {
	return {
		entities: entries.filter((entry) => entry.candidate.kind !== 'document'),
		documents: entries
			.filter((entry) => entry.candidate.kind === 'document')
			.slice(0, policy.dig.maxDocuments)
	};
}

/**
 * Jev's answers -> the evaluated set. Uncalibrated probabilities, so the cut is
 * relative to the best record as well as absolute (the chat context finder's
 * pattern). Forced keys (open concerns) are always evaluated, so a concern keeps
 * getting fresh evidence while it stays open. `answers: null` is the fallback.
 */
export function applyTargeting(params: {
	context: FreshnessScanContext;
	plan: TargetingPlan;
	answers: AnswerMap | null;
	forcedKeys: ReadonlySet<string>;
	policy: FreshnessPolicyV1;
}): TargetingResult {
	const { context, plan, policy } = params;
	if (!params.answers) {
		const fallback = splitByKind(context.prefiltered, policy);
		return {
			source: context.prefiltered.length ? 'lexical_fallback' : 'none',
			...fallback,
			scores: new Map()
		};
	}
	const scores = new Map<string, number>();
	plan.records.forEach((entry, index) => {
		const answer = params.answers![targetQuestionKey(index)];
		const p = answer?.type === 'noul' && Number.isFinite(answer.noul) ? answer.noul : 0;
		scores.set(entityKey(entry.candidate.kind, entry.candidate.id), p);
	});
	const top = Math.max(0, ...scores.values());
	const cut = Math.max(policy.targeting.floor, policy.targeting.relativeToTop * top);
	const selected = plan.records
		.map((entry) => ({
			entry,
			key: entityKey(entry.candidate.kind, entry.candidate.id)
		}))
		.filter(({ key }) => params.forcedKeys.has(key) || (scores.get(key) ?? 0) >= cut)
		.sort(
			(a, b) =>
				Number(params.forcedKeys.has(b.key)) - Number(params.forcedKeys.has(a.key)) ||
				(scores.get(b.key) ?? 0) - (scores.get(a.key) ?? 0) ||
				a.entry.features.rank - b.entry.features.rank
		)
		.slice(0, policy.targeting.maxSelected)
		.map(({ entry }) => entry);
	return { source: 'jev', ...splitByKind(selected, policy), scores };
}

// ---------------------------------------------------------------------------
// [2] Requests
// ---------------------------------------------------------------------------

export type DigSection = {
	documentId: string;
	segmentIndex: number;
};

export type ScanRequestPlan = {
	requests: Array<{ name: ScanRequestName; request: FreshnessJevRequest }>;
	/** The R1 subjects that made it into the request after byte trimming. */
	evaluatedEntities: PrefilteredCandidate[];
	/** The documents whose sections were sent to the dig (at least one section each). */
	evaluatedDocuments: PrefilteredCandidate[];
	/** Dig question index -> (document, segment). */
	digSections: DigSection[];
	trackSubjects: FreshnessScanContext['trackSubjects'];
	inboxSubjects: FreshnessScanContext['inboxSubjects'];
	droppedForSize: number;
};

/** [2] The four requests; a request with no subjects is omitted. */
export function planScanRequests(
	context: FreshnessScanContext,
	targeting: Pick<TargetingResult, 'entities' | 'documents'>,
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
		decisions: context.decisionViews,
		dateMentions: context.dateMentions,
		dateSentenceChars: policy.jev.dateSentenceChars,
		subjects: targeting.entities.map(
			(entry): R1Subject => ({
				kind: entry.candidate.kind,
				view: context.entityViews.get(entityKey(entry.candidate.kind, entry.candidate.id))!
			})
		)
	});

	// Dig: document by document, best first, so byte trimming drops the weakest document's tail.
	const sections: JevSectionView[] = [];
	const digSections: DigSection[] = [];
	for (const entry of targeting.documents) {
		const view = context.entityViews.get(entityKey('document', entry.candidate.id));
		const segments = (context.documentSegments.get(entry.candidate.id) ?? []).slice(
			0,
			policy.dig.maxSectionsPerDocument
		);
		segments.forEach((segment, segmentIndex) => {
			sections.push({
				document: entry.candidate.title,
				heading: segment.heading,
				text: segment.text,
				newer_decisions: view?.newer_decisions ?? []
			});
			digSections.push({ documentId: entry.candidate.id, segmentIndex });
		});
	}
	const dig = buildDigRequest({
		...common,
		decisions: context.decisionViews,
		sections,
		documents: targeting.documents.map((entry) => entry.candidate.title)
	});
	const sentSections = digSections.slice(0, dig.subjects.length);
	const sentDocumentIds = new Set(sentSections.map((section) => section.documentId));

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
	if (dig.request) requests.push({ name: 'dig', request: dig.request });
	if (r2.request) requests.push({ name: 'r2', request: r2.request });
	if (r3.request) requests.push({ name: 'r3', request: r3.request });
	return {
		requests,
		evaluatedEntities: targeting.entities.slice(0, r1.subjects.length),
		evaluatedDocuments: targeting.documents.filter((entry) =>
			sentDocumentIds.has(entry.candidate.id)
		),
		digSections: sentSections,
		trackSubjects: context.trackSubjects.slice(0, r2.subjects.length),
		inboxSubjects: context.inboxSubjects.slice(0, r3.subjects.length),
		droppedForSize:
			r1.droppedForSize + dig.droppedForSize + r2.droppedForSize + r3.droppedForSize
	};
}

/** Answers of one request, with its `r1.` / `dig.` / `r2.` / `r3.` namespace removed. */
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
			prefilter: entry.features,
			newerDecisions:
				context.entityViews.get(entityKey(entry.candidate.kind, entry.candidate.id))
					?.newer_decisions.length ?? 0
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
	const digAnswers = scopedAnswers(params.answers, 'dig');
	const documents: DocumentDigInput[] = plan.evaluatedDocuments.map((entry, documentIndex) => ({
		index: plan.evaluatedEntities.length + documentIndex,
		documentIndex,
		candidate: entry.candidate,
		prefilter: entry.features,
		segments: context.documentSegments.get(entry.candidate.id) ?? [],
		sectionIndexes: plan.digSections
			.map((section, questionIndex) => ({ section, questionIndex }))
			.filter(({ section }) => section.documentId === entry.candidate.id)
			.map(({ section, questionIndex }) => ({
				segmentIndex: section.segmentIndex,
				questionIndex
			}))
	}));
	const documentDecisions = combineDocumentDecisions({
		documents,
		answers: digAnswers,
		sentences: context.sentences,
		suppressed: context.suppressed,
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
	return {
		entityDecisions: [...entityDecisions, ...documentDecisions],
		trackDecisions,
		inboxDecisions
	};
}

/** Did Jev say the recent chat itself bears on this subject (R1 per entity, dig per document)? */
export function chatBearsOn(params: {
	plan: ScanRequestPlan;
	answers: AnswerMap;
	kind: string;
	index: number;
}): boolean {
	const scoped = scopedAnswers(params.answers, params.kind === 'document' ? 'dig' : 'r1');
	const answer = scoped[chatBearsQuestionKey(params.index)];
	return answer?.type === 'noul' && Number.isFinite(answer.noul) && answer.noul >= 0.5;
}
