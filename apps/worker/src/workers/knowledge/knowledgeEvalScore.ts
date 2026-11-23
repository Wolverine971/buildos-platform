// apps/worker/src/workers/knowledge/knowledgeEvalScore.ts
//
// Scoring for the research eval (tasker 164, part A; runner: scripts/knowledge-eval/run.ts).
// Compares what one research pass would save with hand-checked truth for that entry:
//   correct     an active detail that matches the truth
//   wrong       an active detail that contradicts it (website, place, employer, profile)
//   unsure      an active free-text detail (headline, industry) that doesn't share words with
//               the truth: free text can't be marked wrong by string comparison
//   missing     nothing found for a truth field
//   known       the user already had it before this research
// Wrong entity: an active detail came from a page the truth says is a different entity, or the
// website or place contradicts the truth.
//
// Comparing a found value with a truth value is string matching on two values for an offline
// score; it decides nothing in the product (AGENTS.md's no-regex-classification rule covers
// product behaviour).

import {
	type KnowledgeWriteBatch,
	domainOf,
	hostMatchesDomain,
	normalizeKnowledgeName,
	normalizeUrl
} from '@buildos/shared-agent-ops/knowledge';

export const EVAL_FIELDS = [
	'homepage',
	'located_in',
	'works_at',
	'headline',
	'industry',
	'profile_url'
] as const;
export type EvalField = (typeof EVAL_FIELDS)[number];
const STRUCTURED = new Set<EvalField>(['homepage', 'located_in', 'works_at', 'profile_url']);

export interface EvalTruthEntry {
	entity_id: string;
	name: string;
	kind: string;
	group: string;
	circle: string;
	bakeoff: boolean;
	truth: Partial<Record<EvalField, string>>;
	/** Other answers that also count as right ("Annapolis" for Tangled Balloons). */
	alternatives?: Partial<Record<EvalField, string[]>>;
	not?: Array<{ label: string; domains: string[]; urls?: string[] }>;
	confirmed?: boolean;
}

export interface EvalFound {
	predicate: string;
	value: string;
	status: 'active' | 'suggested';
	sourceUrl: string | null;
}

/** What a research batch would save, as predicate/value pairs with their source page. */
export function foundFromBatch(batch: KnowledgeWriteBatch, entityId: string): EvalFound[] {
	const names = new Map(batch.entities.map((e) => [e.ref, e.name]));
	const urls = new Map((batch.sources ?? []).map((s) => [s.ref, s.url ?? null]));
	return batch.facts
		.filter((f) => f.subject === entityId)
		.map((f) => ({
			predicate: f.predicate,
			value: f.object ? (names.get(f.object) ?? f.object) : String(f.value ?? ''),
			status: f.status === 'suggested' ? 'suggested' : 'active',
			sourceUrl: f.sources?.length ? (urls.get(f.sources[0]!) ?? null) : null
		}));
}

const FILLER = new Set([
	'the',
	'and',
	'of',
	'inc',
	'llc',
	'ltd',
	'co',
	'corp',
	'company',
	'services',
	'group',
	'at',
	'a',
	'an',
	'in'
]);

function words(value: string): string[] {
	return normalizeKnowledgeName(value)
		.split(/[^\p{L}\p{N}]+/u)
		.filter((w) => w.length >= 2 && !FILLER.has(w));
}

export function valueMatches(field: EvalField, truth: string, found: string): boolean {
	if (field === 'homepage') {
		const t = domainOf(truth);
		const f = domainOf(found);
		return Boolean(t && f && (hostMatchesDomain(f, t) || hostMatchesDomain(t, f)));
	}
	if (field === 'profile_url') {
		const t = normalizeUrl(truth);
		const f = normalizeUrl(found);
		return Boolean(t && f && (t === f || f.startsWith(t) || t.startsWith(f)));
	}
	if (field === 'located_in') {
		const city = words(truth.split(',')[0] ?? truth).join(' ');
		return Boolean(city) && words(found).join(' ').includes(city);
	}
	const t = words(truth);
	const f = new Set(words(found));
	if (!t.length || !f.size) return false;
	const shared = t.filter((w) => f.has(w)).length;
	return field === 'works_at' ? shared / t.length >= 0.5 : shared >= 1;
}

export type FieldResult = 'correct' | 'wrong' | 'unsure' | 'missing' | 'known';

export interface EntryScore {
	name: string;
	fields: Partial<
		Record<
			EvalField,
			{ truth: string; found: string[]; result: FieldResult; suggested: string[] }
		>
	>;
	correct: number;
	wrong: number;
	unsure: number;
	missing: number;
	gapsFilled: number;
	/** Suggestions (saved for the user to check) that match the truth / contradict it. */
	suggestedCorrect: number;
	suggestedWrong: number;
	wrongEntity: boolean;
	wrongEntityWhy: string[];
	/** Active details for fields the truth doesn't cover. */
	extra: number;
}

export function scoreEntry(
	entry: EvalTruthEntry,
	found: EvalFound[],
	known: Array<{ predicate: string; value: string }> = []
): EntryScore {
	const score: EntryScore = {
		name: entry.name,
		fields: {},
		correct: 0,
		wrong: 0,
		unsure: 0,
		missing: 0,
		gapsFilled: 0,
		suggestedCorrect: 0,
		suggestedWrong: 0,
		wrongEntity: false,
		wrongEntityWhy: [],
		extra: 0
	};
	const answers = (field: EvalField) => [
		entry.truth[field]!,
		...(entry.alternatives?.[field] ?? [])
	];
	const matches = (field: EvalField, value: string) =>
		answers(field).some((t) => valueMatches(field, t, value));

	for (const field of EVAL_FIELDS) {
		const truth = entry.truth[field];
		if (!truth) continue;
		const active = found
			.filter((f) => f.predicate === field && f.status === 'active')
			.map((f) => f.value);
		const suggested = found
			.filter((f) => f.predicate === field && f.status === 'suggested')
			.map((f) => f.value);
		for (const s of suggested) {
			if (matches(field, s)) score.suggestedCorrect++;
			else if (STRUCTURED.has(field)) score.suggestedWrong++;
		}
		const alreadyKnown = known.some((k) => k.predicate === field && matches(field, k.value));
		let result: FieldResult;
		if (active.some((v) => matches(field, v))) result = 'correct';
		else if (active.length) result = STRUCTURED.has(field) ? 'wrong' : 'unsure';
		else result = alreadyKnown ? 'known' : 'missing';
		if (result === 'correct') {
			score.correct++;
			if (!alreadyKnown) score.gapsFilled++;
		} else if (result === 'wrong') score.wrong++;
		else if (result === 'unsure') score.unsure++;
		else if (result === 'missing') score.missing++;
		if ((field === 'homepage' || field === 'located_in') && result === 'wrong')
			score.wrongEntityWhy.push(`${field}: ${active.join(', ')}`);
		score.fields[field] = { truth, found: active, result, suggested };
	}
	for (const f of found) {
		if (f.status !== 'active') continue;
		if (!entry.truth[f.predicate as EvalField]) score.extra++;
		const host = f.sourceUrl ? domainOf(f.sourceUrl) : null;
		const wrongPage = (entry.not ?? []).find(
			(n) =>
				(host && n.domains.some((d) => hostMatchesDomain(host, d))) ||
				(f.sourceUrl &&
					(n.urls ?? []).some((u) => normalizeUrl(u) === normalizeUrl(f.sourceUrl!)))
		);
		if (wrongPage)
			score.wrongEntityWhy.push(`${f.predicate} from ${f.sourceUrl} (${wrongPage.label})`);
	}
	score.wrongEntity = score.wrongEntityWhy.length > 0;
	return score;
}

export interface EvalTotals {
	entries: number;
	scored: number;
	correct: number;
	wrong: number;
	unsure: number;
	missing: number;
	gapsFilled: number;
	suggestedCorrect: number;
	suggestedWrong: number;
	wrongEntityEntries: number;
	/** correct / (correct + wrong) over active structured + matched details. */
	precision: number | null;
	wrongEntityRate: number | null;
}

export function totals(scores: EntryScore[], entries: number): EvalTotals {
	const sum = (k: keyof EntryScore) => scores.reduce((n, s) => n + (s[k] as number), 0);
	const correct = sum('correct');
	const wrong = sum('wrong');
	const wrongEntityEntries = scores.filter((s) => s.wrongEntity).length;
	return {
		entries,
		scored: scores.length,
		correct,
		wrong,
		unsure: sum('unsure'),
		missing: sum('missing'),
		gapsFilled: sum('gapsFilled'),
		suggestedCorrect: sum('suggestedCorrect'),
		suggestedWrong: sum('suggestedWrong'),
		wrongEntityEntries,
		precision: correct + wrong ? correct / (correct + wrong) : null,
		wrongEntityRate: scores.length ? wrongEntityEntries / scores.length : null
	};
}
