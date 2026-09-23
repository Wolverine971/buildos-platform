// packages/agentic-chat-runtime/src/context-finder/finder.ts
//
// The shared entry point: chat turns, Workflow Lab previews and research specialists all
// build packets, rank with Jev, select with one policy and materialize the same evidence.
import {
	materializeContextPlan,
	rankerSummary,
	unavailableContextEvidence,
	type ContextEvidenceV1
} from './evidence';
import {
	buildContextFinderEntities,
	type ContextFinderEntity,
	type ContextFinderKind,
	type ContextFinderProjectV1
} from './packets';
import {
	entityScoreKey,
	rankProjectContext,
	type ContextFinderDecider,
	type ContextFinderRankingV1
} from './rank';
import { selectProjectContext, type ContextPlanV1 } from './select';

/** START HERE is already in every project prompt; ranking it again only repeats it. */
export const START_HERE_TYPE_KEY = 'document.context.project';

export function startHereIds(project: ContextFinderProjectV1): Set<string> {
	return new Set(
		project.documents
			.filter((doc) => doc.type_key === START_HERE_TYPE_KEY)
			.map((doc) => String(doc.id))
	);
}

export type ContextFinderCandidateV1 = {
	kind: ContextFinderKind;
	id: string;
	title: string;
	p: number | null;
};

export type ContextFinderResultV1 = {
	evidence: ContextEvidenceV1;
	plan: ContextPlanV1 | null;
	ranking: ContextFinderRankingV1 | null;
	entities: ContextFinderEntity[];
};

/**
 * With a plan (curated in Workflow Lab), only materialize: no Jev call. Without one, rank and
 * select. A failed ranking returns `unavailable` evidence; the caller keeps its normal context.
 */
export async function findProjectContext(input: {
	project: ContextFinderProjectV1;
	message: string;
	decider?: ContextFinderDecider;
	plan?: ContextPlanV1;
	recentConversation?: readonly { role: string; content: string }[];
	skipIds?: ReadonlySet<string>;
	signal?: AbortSignal;
	timeoutMs?: number;
	usage?: { operationType: string; userId?: string; projectId?: string; chatSessionId?: string };
}): Promise<ContextFinderResultV1> {
	const entities = buildContextFinderEntities(input.project);
	if (input.plan)
		return {
			evidence: materializeContextPlan({ plan: input.plan, entities }),
			plan: input.plan,
			ranking: null,
			entities
		};
	if (!input.decider)
		return { evidence: unavailableContextEvidence(null), plan: null, ranking: null, entities };
	const skip = input.skipIds ?? startHereIds(input.project);
	const ranking = await rankProjectContext({
		decider: input.decider,
		project: input.project.project,
		entities: entities.filter((entity) => !skip.has(entity.id)),
		message: input.message,
		recentConversation: input.recentConversation,
		signal: input.signal,
		timeoutMs: input.timeoutMs,
		usage: input.usage
	});
	const ranker = rankerSummary(ranking);
	if (ranking.status === 'unavailable')
		return { evidence: unavailableContextEvidence(ranker), plan: null, ranking, entities };
	const plan = selectProjectContext({
		entities,
		scores: ranking.scores,
		checked: ranking.checked,
		unchecked: ranking.unchecked,
		skipIds: skip
	});
	return {
		evidence: materializeContextPlan({ plan, entities, ranker }),
		plan,
		ranking,
		entities
	};
}

/** Everything that was ranked, best first, so a person can add what Jev missed. */
export function contextFinderCandidates(
	entities: readonly ContextFinderEntity[],
	ranking: ContextFinderRankingV1 | null,
	limit = 400
): ContextFinderCandidateV1[] {
	return entities
		.map((entity) => {
			const p = ranking?.scores[entityScoreKey(entity)];
			return {
				kind: entity.kind,
				id: entity.id,
				title: entity.title,
				p: typeof p === 'number' ? Math.round(p * 1000) / 1000 : null
			};
		})
		.sort((a, b) => (b.p ?? -1) - (a.p ?? -1))
		.slice(0, limit);
}
