// apps/worker/src/workers/freshness-radar/grounding.ts
//
// Deterministic grounding for the freshness radar (plan section 4, rule 3).
// Jev's probabilities decide what is LIKELY stale; this module decides, in
// code only, whether the user's own words literally support a change:
// - strict grounding gates auto-apply: one user sentence names the entity and
//   carries the target-state lexicon (no nearby negation) or exactly one
//   absolute, in-range date;
// - loose grounding gates drafts: some user sentence names the entity.

import { projectSuggestionTextNamesEntity } from '@buildos/shared-agent-ops/proposal-context';
import {
	type SourcedSentence,
	addCivilDays,
	countNonAbsoluteDateMentions,
	parseAbsoluteDates
} from './dates';

export type GroundingTargetState = 'done' | 'in_progress' | 'blocked';

const NAME_STOP_WORDS = new Set([
	'a',
	'an',
	'and',
	'as',
	'at',
	'by',
	'for',
	'from',
	'in',
	'into',
	'of',
	'on',
	'or',
	'the',
	'to',
	'under',
	'with'
]);

/** Same normalization as verify-operations' entity naming check. */
function normalizedPhrase(value: string): string {
	return value
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim()
		.split(/\s+/)
		.filter((token) => token.length >= 2 && !NAME_STOP_WORDS.has(token))
		.join(' ');
}

/**
 * Does this user sentence name the entity? The normalized full title, or token
 * coverage via `projectSuggestionTextNamesEntity`. Its reverse-containment
 * branch (a short sentence that is a fragment of the title, e.g. "Launch" vs
 * "Launch plan") is excluded: a fragment does not name a specific record.
 */
export function sentenceNamesEntity(sentence: string, title: string): boolean {
	const text = normalizedPhrase(sentence);
	const name = normalizedPhrase(title);
	if (!text || !name) return false;
	if (` ${text} `.includes(` ${name} `)) return true;
	if (name.includes(text)) {
		// Only token coverage may still pass; containment of the fragment may not.
		const textTokens = new Set(text.split(' '));
		const titleTokens = name.split(' ');
		const overlap = titleTokens.filter((token) => textTokens.has(token)).length;
		const required = Math.min(3, Math.max(2, Math.ceil(titleTokens.length * 0.5)));
		return overlap >= required;
	}
	return projectSuggestionTextNamesEntity(sentence, title);
}

const STATE_LEXICON: Record<GroundingTargetState, readonly string[]> = {
	done: [
		'done',
		'finished',
		'shipped',
		'sent',
		'completed',
		'wrapped up',
		'submitted',
		'delivered'
	],
	in_progress: ['started', 'underway', 'under way', 'in progress', 'working on', 'kicked off'],
	blocked: ['blocked', 'stuck', 'waiting on', 'waiting for', 'on hold']
};

const NEGATION_SINGLE = new Set(['not', 'never', 'no', 'nor', 'cannot', 'haven', 'hasn']);
// Future, modal, and conditional markers: "will be done", "need to ship", "once
// it's finished" describe intent, not a finished fact, so they block like a
// negation inside the same window.
const HEDGE_TOKENS = new Set([
	'will',
	'would',
	'should',
	'could',
	'might',
	'may',
	'must',
	'need',
	'needs',
	'going',
	'gonna',
	'hope',
	'hoping',
	'plan',
	'planning',
	'want',
	'wants',
	'if',
	'once',
	'until',
	'when'
]);

/** Lowercase word tokens with contractions kept intact ("isn't", "haven't"). */
function wordTokens(sentence: string): string[] {
	return (
		sentence
			.toLowerCase()
			.replace(/[’‘]/g, "'")
			.match(/[a-z0-9]+(?:'[a-z]+)?/g) ?? []
	);
}

function isNegationAt(tokens: readonly string[], index: number): boolean {
	const token = tokens[index]!;
	if (NEGATION_SINGLE.has(token) || HEDGE_TOKENS.has(token)) return true;
	if (token.endsWith("n't")) return true;
	// "yet to", "not yet"
	if (token === 'yet' && (tokens[index + 1] === 'to' || tokens[index - 1] === 'not')) return true;
	return false;
}

/**
 * The first position of a lexicon term for `state` in the sentence that has no
 * negation within `window` tokens before it. Null when the only matches are
 * negated or absent.
 */
export function findUnnegatedStateTerm(
	sentence: string,
	state: GroundingTargetState,
	window: number
): { term: string; tokenIndex: number } | null {
	const tokens = wordTokens(sentence);
	for (const term of STATE_LEXICON[state]) {
		const termTokens = term.split(' ');
		for (let index = 0; index + termTokens.length <= tokens.length; index += 1) {
			if (!termTokens.every((part, offset) => tokens[index + offset] === part)) continue;
			let negated = false;
			for (let back = Math.max(0, index - window); back < index; back += 1) {
				if (isNegationAt(tokens, back)) {
					negated = true;
					break;
				}
			}
			// "yet to finish" puts "yet to" right before the term.
			if (!negated) return { term, tokenIndex: index };
		}
	}
	return null;
}

export type StrictGroundingResult =
	| { ok: true; sentence: SourcedSentence; term?: string; dateLiteral?: string }
	| {
			ok: false;
			reason:
				| 'no_anchor_sentence'
				| 'question_sentence'
				| 'no_state_term'
				| 'date_not_in_anchor'
				| 'multiple_dates'
				| 'date_out_of_range'
				| 'date_unchanged';
	  };

function anchorSentences(title: string, sentences: readonly SourcedSentence[]) {
	return sentences.filter((sentence) => sentenceNamesEntity(sentence.text, title));
}

/** Strict grounding for a task state change (auto-apply only). */
export function strictGroundStateChange(params: {
	title: string;
	targetState: GroundingTargetState;
	sentences: readonly SourcedSentence[];
	negationWindowTokens: number;
}): StrictGroundingResult {
	const anchors = anchorSentences(params.title, params.sentences);
	if (!anchors.length) return { ok: false, reason: 'no_anchor_sentence' };
	let sawQuestion = false;
	for (const sentence of anchors) {
		// A question ("is the deck done?") never grounds a change.
		if (sentence.text.trim().endsWith('?')) {
			sawQuestion = true;
			continue;
		}
		const term = findUnnegatedStateTerm(
			sentence.text,
			params.targetState,
			params.negationWindowTokens
		);
		if (term) return { ok: true, sentence, term: term.term };
	}
	return { ok: false, reason: sawQuestion ? 'question_sentence' : 'no_state_term' };
}

/**
 * Strict grounding for an absolute due date (auto-apply only): the literal is
 * parsed from the SAME user sentence that names the entity, it is the only date
 * of any kind in that sentence, it lies in [today, today + horizon], and it
 * differs from the current civil due date.
 */
export function strictGroundDueDate(params: {
	title: string;
	dateIso: string;
	currentDueCivil: string | null;
	sentences: readonly SourcedSentence[];
	today: string;
	horizonDays: number;
}): StrictGroundingResult {
	if (
		params.dateIso < params.today ||
		params.dateIso > addCivilDays(params.today, params.horizonDays)
	) {
		return { ok: false, reason: 'date_out_of_range' };
	}
	if (params.currentDueCivil === params.dateIso) return { ok: false, reason: 'date_unchanged' };
	const anchors = anchorSentences(params.title, params.sentences);
	if (!anchors.length) return { ok: false, reason: 'no_anchor_sentence' };
	let reason: 'date_not_in_anchor' | 'multiple_dates' | 'question_sentence' =
		'date_not_in_anchor';
	for (const sentence of anchors) {
		if (sentence.text.trim().endsWith('?')) {
			reason = 'question_sentence';
			continue;
		}
		const absolute = parseAbsoluteDates(sentence.text, params.today);
		if (!absolute.some((match) => match.iso === params.dateIso)) continue;
		if (absolute.length !== 1 || countNonAbsoluteDateMentions(sentence.text) > 0) {
			reason = 'multiple_dates';
			continue;
		}
		return { ok: true, sentence, dateLiteral: absolute[0]!.literal };
	}
	return { ok: false, reason };
}

/** Loose grounding for drafts: the newest user sentence that names the entity. */
export function looseGround(
	title: string,
	sentences: readonly SourcedSentence[]
): SourcedSentence | null {
	return anchorSentences(title, sentences)[0] ?? null;
}

/** A <=`max` character excerpt of the user's own words (never paraphrased). */
export function evidenceExcerpt(text: string, max: number): string {
	const clean = text.replace(/\s+/g, ' ').trim();
	if (clean.length <= max) return clean;
	return `${clean.slice(0, max - 1).trimEnd()}…`;
}
