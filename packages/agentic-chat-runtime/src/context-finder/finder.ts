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
	BROAD_REQUEST_FULL_FLOOR,
	BROAD_REQUEST_THRESHOLD,
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
	/**
	 * The off-ramp's answer when the caller asked it: `broad` is a whole-project request
	 * (only records Jev is sure about load; the caller adds the project snapshot).
	 */
	scope?: 'broad' | 'specific' | null;
};

/** A whole-project request loads in full only records at least this likely to matter. */
export const BROAD_REQUEST_ITEM_FLOOR = BROAD_REQUEST_FULL_FLOOR;
/**
 * And names at most this many more as one-line summaries: the safety net when Jev
 * misreads a specific request as broad (6 prod receipts since 10-01 topped at 0.57-0.92).
 */
export const BROAD_REQUEST_MAX_SUMMARIES = 5;

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
	/** Budget share when several projects split one prompt (workspace.ts). */
	budgetChars?: number;
	maxSummaries?: number;
	signal?: AbortSignal;
	timeoutMs?: number;
	usage?: { operationType: string; userId?: string; projectId?: string; chatSessionId?: string };
	/** Also ask Jev whether the request is about the project as a whole (rank.ts). */
	askBroad?: boolean;
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
		usage: input.usage,
		...(input.askBroad ? { askBroad: true } : {})
	});
	const ranker = rankerSummary(ranking);
	const broadP = ranking.broadP;
	const scope =
		typeof broadP === 'number'
			? broadP >= BROAD_REQUEST_THRESHOLD
				? ('broad' as const)
				: ('specific' as const)
			: null;
	if (ranking.status === 'unavailable')
		return {
			evidence: unavailableContextEvidence(ranker),
			plan: null,
			ranking,
			entities,
			...(input.askBroad ? { scope: null } : {})
		};
	const plan = selectProjectContext({
		entities,
		scores: ranking.scores,
		checked: ranking.checked,
		unchecked: ranking.unchecked,
		skipIds: skip,
		budgetChars: input.budgetChars,
		maxSummaries: input.maxSummaries,
		...(scope === 'broad'
			? {
					fullFloor: BROAD_REQUEST_ITEM_FLOOR,
					maxSummaries: Math.min(
						input.maxSummaries ?? BROAD_REQUEST_MAX_SUMMARIES,
						BROAD_REQUEST_MAX_SUMMARIES
					)
				}
			: {})
	});
	return {
		evidence: materializeContextPlan({ plan, entities, ranker }),
		plan,
		ranking,
		entities,
		...(input.askBroad ? { scope } : {})
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
