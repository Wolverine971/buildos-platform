// packages/agentic-chat-runtime/src/context-finder/finder.ts
//
// The shared entry point: chat turns, Workflow Lab previews and research specialists all
// build packets, rank with Jev, select with one policy and materialize the same evidence.
import { cardNeedsText } from './card';
import {
	materializeContextPlan,
	rankerSummary,
	unavailableContextEvidence,
	type ContextEvidenceV1
} from './evidence';
import {
	buildContextFinderEntities,
	withContextFinderText,
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
import { CONTEXT_FINDER_POLICY, selectProjectContext, type ContextPlanV1 } from './select';

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
	// Agents get document cards (summary, sections by anchor, Jev's flags) and read the text
	// themselves (tasker 152); the budget still caps how many cards and records fit.
	const budgetChars = Math.min(
		input.budgetChars ?? CONTEXT_FINDER_POLICY.agentBudgetChars,
		CONTEXT_FINDER_POLICY.agentBudgetChars
	);
	const outlined = buildContextFinderEntities(input.project);
	if (input.plan) {
		const entities = await loadContextFinderPlanText({
			project: input.project,
			entities: outlined,
			plan: input.plan,
			signal: input.signal,
			cards: true
		});
		return {
			evidence: materializeContextPlan({
				plan: input.plan,
				entities,
				budgetChars,
				documents: 'card'
			}),
			plan: input.plan,
			ranking: null,
			entities
		};
	}
	const entities = outlined;
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
		budgetChars,
		sectionsPerDoc: CONTEXT_FINDER_POLICY.agentSectionsPerDoc,
		documents: 'card',
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
	const loaded = await loadContextFinderPlanText({
		project: input.project,
		entities,
		plan,
		signal: input.signal,
		cards: true
	});
	return {
		evidence: materializeContextPlan({
			plan,
			entities: loaded,
			ranker,
			budgetChars,
			documents: 'card'
		}),
		plan,
		ranking,
		entities: loaded,
		...(input.askBroad ? { scope } : {})
	};
}

/**
 * Attaches text to the documents a plan loads in full (and any `extraIds`), read in one query
 * through the project's text source. Everything else stays an outline. A failed read leaves
 * those documents as cards (title, description, outline) rather than failing the turn; an
 * aborted one throws.
 */
export async function loadContextFinderPlanText(input: {
	project: ContextFinderProjectV1;
	entities: readonly ContextFinderEntity[];
	plan: ContextPlanV1 | null;
	extraIds?: readonly string[];
	signal?: AbortSignal;
	/** Card mode: plan documents need text only when pinned or when they have no headings and
	 * no summary (short notes, shown whole). */
	cards?: boolean;
}): Promise<ContextFinderEntity[]> {
	const byId = new Map(input.entities.map((entity) => [entity.id, entity]));
	const wanted = new Set([
		...(input.plan?.items ?? [])
			.filter((item) => item.tier === 'full' && item.kind === 'document')
			.filter((item) => {
				if (!input.cards || item.pinned) return true;
				const entity = byId.get(item.id);
				return entity ? cardNeedsText(entity) : false;
			})
			.map((item) => item.id),
		...(input.extraIds ?? [])
	]);
	const ids = input.entities
		.filter(
			(entity) => entity.kind === 'document' && !entity.textLoaded && wanted.has(entity.id)
		)
		.map((entity) => entity.id);
	const source = input.project.documentText;
	if (!ids.length || !source) return [...input.entities];
	let texts: Map<string, { content: string; contentHash: string | null }>;
	try {
		texts = await source(ids, input.signal);
	} catch (error) {
		input.signal?.throwIfAborted();
		console.warn('[context-finder] document text read failed; using outlines', error);
		return [...input.entities];
	}
	return input.entities.map((entity) => {
		const text = entity.kind === 'document' ? texts.get(entity.id) : undefined;
		return text ? withContextFinderText(entity, text) : entity;
	});
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
