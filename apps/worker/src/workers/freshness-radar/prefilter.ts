// apps/worker/src/workers/freshness-radar/prefilter.ts
//
// Keeps Jev's state small (plan section 1, "Keeping state small"). Code scores
// every open candidate against the window text and keeps the top 24, padding
// with recently updated entities so paraphrased mentions still get a chance.

import type { FreshnessEntityKind } from '@buildos/shared-types';
import { civilDaysBetween, type FreshnessDateMention } from './dates';
import { sentenceNamesEntity } from './grounding';
import type { FreshnessPolicyV1 } from './freshnessPolicy';

/** One open project entity, normalized across kinds. */
export type FreshnessCandidate = {
	kind: FreshnessEntityKind;
	id: string;
	title: string;
	description: string | null;
	state: string;
	/** Raw stored values (ISO instant or date) — used for snapshots and undo. */
	startAt: string | null;
	dueAt: string | null;
	targetDate: string | null;
	/** Civil dates in the user's timezone. */
	startCivil: string | null;
	dueCivil: string | null;
	targetCivil: string | null;
	/** updated_at, falling back to created_at (goals and milestones allow null). */
	updatedAt: string | null;
	createdAt: string | null;
	/** Title of a goal or milestone this entity belongs to. */
	partOf: string | null;
	/** Documents: description or the head of content (<=400). */
	summary: string | null;
	props: Record<string, unknown>;
};

export type PrefilterFeatures = {
	score: number;
	title: number;
	description: number;
	dateMention: number;
	dueSoon: number;
	edge: number;
	kindBonus: number;
	padded: boolean;
	rank: number;
};

export type PrefilteredCandidate = { candidate: FreshnessCandidate; features: PrefilterFeatures };

const STOP_WORDS = new Set([
	'the',
	'and',
	'for',
	'with',
	'that',
	'this',
	'from',
	'into',
	'about',
	'have',
	'has',
	'had',
	'was',
	'were',
	'are',
	'but',
	'not',
	'you',
	'your',
	'our',
	'its',
	'they',
	'them',
	'then',
	'than',
	'just',
	'also',
	'will',
	'would',
	'should',
	'could',
	'can',
	'did',
	'does',
	'done',
	'get',
	'got',
	'all',
	'any',
	'some',
	'more',
	'most',
	'what',
	'when',
	'which',
	'who',
	'how',
	'why',
	'there',
	'here',
	'out',
	'off',
	'now',
	'new',
	'task',
	'tasks',
	'doc',
	'document',
	'goal',
	'milestone',
	'project'
]);

function stem(token: string): string {
	if (token.length > 5 && token.endsWith('ing')) return token.slice(0, -3);
	if (token.length > 4 && token.endsWith('ed')) return token.slice(0, -2);
	if (token.length > 4 && token.endsWith('es')) return token.slice(0, -2);
	if (token.length > 3 && token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
	return token;
}

export function prefilterTokens(text: string | null | undefined): string[] {
	if (!text) return [];
	return (
		text
			.normalize('NFKD')
			.replace(/[\u0300-\u036f]/g, '')
			.toLowerCase()
			.match(/[a-z0-9]+/g) ?? []
	)
		.filter((token) => token.length >= 3 && !STOP_WORDS.has(token))
		.map(stem);
}

function idfTable(candidates: readonly FreshnessCandidate[]): Map<string, number> {
	const documentFrequency = new Map<string, number>();
	for (const candidate of candidates) {
		const tokens = new Set([
			...prefilterTokens(candidate.title),
			...prefilterTokens(candidate.description)
		]);
		for (const token of tokens) {
			documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
		}
	}
	const total = Math.max(1, candidates.length);
	const idf = new Map<string, number>();
	for (const [token, df] of documentFrequency) {
		idf.set(token, Math.log(1 + total / (1 + df)));
	}
	return idf;
}

/** idf-weighted fraction of `text`'s distinct tokens present in the window. */
function weightedCoverage(
	text: string | null,
	windowTokens: ReadonlySet<string>,
	idf: ReadonlyMap<string, number>
): number {
	const tokens = [...new Set(prefilterTokens(text))];
	if (!tokens.length) return 0;
	let total = 0;
	let matched = 0;
	for (const token of tokens) {
		const weight = idf.get(token) ?? Math.log(2);
		total += weight;
		if (windowTokens.has(token)) matched += weight;
	}
	return total > 0 ? matched / total : 0;
}

function dueCivilOf(candidate: FreshnessCandidate): string | null {
	return candidate.dueCivil ?? candidate.targetCivil;
}

function recencyMs(candidate: FreshnessCandidate): number {
	const value = Date.parse(candidate.updatedAt ?? candidate.createdAt ?? '');
	return Number.isFinite(value) ? value : 0;
}

/**
 * Score, keep entities scoring above 0 (top N), pad to the minimum with the most
 * recently updated open entities, and return them in rank order. Deterministic:
 * ties break by recency, then id.
 */
export function prefilterCandidates(params: {
	candidates: readonly FreshnessCandidate[];
	windowText: string;
	dateMentions: readonly FreshnessDateMention[];
	/** `${kind}:${id}` of entities with an edge to an entity changed in the window. */
	linkedToChanged: ReadonlySet<string>;
	today: string;
	policy: FreshnessPolicyV1;
}): PrefilteredCandidate[] {
	const config = params.policy.prefilter;
	const windowTokens = new Set(prefilterTokens(params.windowText));
	const idf = idfTable(params.candidates);

	const scored = params.candidates.map((candidate) => {
		const title = weightedCoverage(candidate.title, windowTokens, idf) * config.titleWeight;
		const description =
			weightedCoverage(candidate.description ?? candidate.summary, windowTokens, idf) *
			config.descriptionWeight;
		const dateMention = params.dateMentions.some((mention) =>
			sentenceNamesEntity(mention.sentence, candidate.title)
		)
			? config.dateMentionBonus
			: 0;
		const due = dueCivilOf(candidate);
		const dueSoon =
			due && Math.abs(civilDaysBetween(params.today, due)) <= config.dueSoonDays
				? config.dueSoonBonus
				: 0;
		const edge = params.linkedToChanged.has(`${candidate.kind}:${candidate.id}`)
			? config.edgeBonus
			: 0;
		const kindBonus =
			candidate.kind === 'goal' || candidate.kind === 'milestone'
				? config.goalMilestoneBonus
				: 0;
		const score = title + description + dateMention + dueSoon + edge + kindBonus;
		return {
			candidate,
			features: {
				score: Math.round(score * 10_000) / 10_000,
				title: Math.round(title * 10_000) / 10_000,
				description: Math.round(description * 10_000) / 10_000,
				dateMention,
				dueSoon,
				edge,
				kindBonus,
				padded: false,
				rank: 0
			}
		};
	});

	const byRank = (a: PrefilteredCandidate, b: PrefilteredCandidate) =>
		b.features.score - a.features.score ||
		recencyMs(b.candidate) - recencyMs(a.candidate) ||
		a.candidate.id.localeCompare(b.candidate.id);

	const kept = scored
		.filter((entry) => entry.features.score > 0)
		.sort(byRank)
		.slice(0, config.maxEntities);

	if (kept.length < config.minEntities) {
		const keptIds = new Set(kept.map((entry) => entry.candidate.id));
		const padding = scored
			.filter((entry) => !keptIds.has(entry.candidate.id))
			.sort(
				(a, b) =>
					recencyMs(b.candidate) - recencyMs(a.candidate) ||
					a.candidate.id.localeCompare(b.candidate.id)
			)
			.slice(0, config.minEntities - kept.length)
			.map((entry) => ({ ...entry, features: { ...entry.features, padded: true } }));
		kept.push(...padding);
	}

	return kept.map((entry, index) => ({
		candidate: entry.candidate,
		features: { ...entry.features, rank: index }
	}));
}
