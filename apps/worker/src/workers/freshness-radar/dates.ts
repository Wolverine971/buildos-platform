// apps/worker/src/workers/freshness-radar/dates.ts
//
// Deterministic civil-date handling for the freshness radar. Jev never does
// date arithmetic: code parses the user's absolute dates, infers years, and
// precomputes every "N days ago" phrase. Only absolute dates are parsed (ISO,
// or a month name with a day). Relative dates ("next Friday") and numeric
// forms ("10/3") are never turned into dates; they are only DETECTED, so the
// strict grounding rule can refuse a sentence that carries more than one date.

const MONTHS: Record<string, number> = {
	jan: 1,
	january: 1,
	feb: 2,
	february: 2,
	mar: 3,
	march: 3,
	apr: 4,
	april: 4,
	may: 5,
	jun: 6,
	june: 6,
	jul: 7,
	july: 7,
	aug: 8,
	august: 8,
	sep: 9,
	sept: 9,
	september: 9,
	oct: 10,
	october: 10,
	nov: 11,
	november: 11,
	dec: 12,
	december: 12
};

const MONTH_ALTERNATION =
	'january|february|march|april|may|june|july|august|september|october|november|december|sept|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec';

// "Oct 3", "October 3rd", "Oct. 3, 2026"
const MONTH_DAY = new RegExp(
	`\\b(${MONTH_ALTERNATION})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?(?![\\d:])`,
	'gi'
);
// "3 October", "3rd of Oct", "3 Oct 2026"
const DAY_MONTH = new RegExp(
	`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH_ALTERNATION})\\b\\.?(?:,?\\s+(\\d{4}))?`,
	'gi'
);
const ISO_DATE = /\b(\d{4})-(\d{2})-(\d{2})\b/g;

/** Date-like text that is never parsed but still counts as "a date in this sentence". */
const NUMERIC_DATE = /\b\d{1,2}[/.]\d{1,2}(?:[/.]\d{2,4})?\b/g;
const RELATIVE_DATE =
	/\b(?:today|tonight|tomorrow|yesterday|tmrw|eod|eow|eom|this (?:week|weekend|month|quarter|year)|next (?:week|weekend|month|quarter|year|mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:rs(?:day)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)|(?:mon|tues|wednes|thurs|fri|satur|sun)day|end of (?:the )?(?:day|week|month|quarter|year)|in (?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+) (?:days?|weeks?|months?)|(?:a|one|two|three|\d+) (?:days?|weeks?|months?) from now)\b/gi;

// Short month words that are also common English words: only a capitalized
// form counts ("May 3" yes, "may 3 people" no; "Mar 4" yes, "mar 4" no).
const CASE_SENSITIVE_MONTH_WORDS = new Set(['may', 'mar']);

export const CIVIL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type AbsoluteDateMatch = {
	/** The literal as written, e.g. "Oct 3". */
	literal: string;
	/** Civil ISO date, e.g. "2026-10-03". */
	iso: string;
	index: number;
	/** true when the user wrote the year. */
	explicitYear: boolean;
};

function pad(value: number, width = 2): string {
	return String(value).padStart(width, '0');
}

export function isValidCivilDate(year: number, month: number, day: number): boolean {
	if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
	if (month < 1 || month > 12 || day < 1 || day > 31) return false;
	const probe = new Date(Date.UTC(year, month - 1, day));
	return (
		probe.getUTCFullYear() === year &&
		probe.getUTCMonth() === month - 1 &&
		probe.getUTCDate() === day
	);
}

export function toCivilDate(year: number, month: number, day: number): string {
	return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

function isValidTimeZone(timeZone: string | null | undefined): timeZone is string {
	if (!timeZone) return false;
	try {
		new Intl.DateTimeFormat('en-US', { timeZone });
		return true;
	} catch {
		return false;
	}
}

/** The civil date of an instant in a timezone (invalid or missing zone → UTC). */
export function civilDateInZone(instant: Date | string, timeZone?: string | null): string | null {
	const date = typeof instant === 'string' ? new Date(instant) : instant;
	if (Number.isNaN(date.getTime())) return null;
	const zone = isValidTimeZone(timeZone) ? timeZone : 'UTC';
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone: zone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).formatToParts(date);
	const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
	return `${value('year')}-${value('month')}-${value('day')}`;
}

/**
 * A stored date/timestamp as a civil date. Date-only strings are returned as is;
 * instants are read in the user's timezone (task due_at is stored as the end of
 * the civil day in that zone).
 */
export function storedCivilDate(value: string | null | undefined, timeZone?: string | null) {
	if (!value) return null;
	const trimmed = value.trim();
	if (CIVIL_DATE_PATTERN.test(trimmed)) return trimmed;
	return civilDateInZone(trimmed, timeZone);
}

function civilToUtcMs(civil: string): number {
	return Date.UTC(
		Number(civil.slice(0, 4)),
		Number(civil.slice(5, 7)) - 1,
		Number(civil.slice(8, 10))
	);
}

/** Whole civil days from `from` to `to` (negative when `to` is earlier). */
export function civilDaysBetween(from: string, to: string): number {
	return Math.round((civilToUtcMs(to) - civilToUtcMs(from)) / 86_400_000);
}

export function addCivilDays(civil: string, days: number): string {
	const date = new Date(civilToUtcMs(civil) + days * 86_400_000);
	return toCivilDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

/** "today", "yesterday", "3 days ago", "2 weeks ago", "4 months ago", "over a year ago". */
export function relativeAgePhrase(
	instant: string | null | undefined,
	now: Date,
	timeZone?: string | null
): string | null {
	if (!instant) return null;
	const then = storedCivilDate(instant, timeZone);
	const today = civilDateInZone(now, timeZone);
	if (!then || !today) return null;
	const days = civilDaysBetween(then, today);
	if (days <= 0) return 'today';
	if (days === 1) return 'yesterday';
	if (days < 14) return `${days} days ago`;
	if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
	if (days < 365) return `${Math.floor(days / 30)} months ago`;
	return 'over a year ago';
}

/** "in 15 days", "tomorrow", "today", "3 days ago". */
export function relativeDuePhrase(civil: string, today: string): string {
	const days = civilDaysBetween(today, civil);
	if (days === 0) return 'today';
	if (days === 1) return 'tomorrow';
	if (days === -1) return 'yesterday';
	return days > 0 ? `in ${days} days` : `${-days} days ago`;
}

/** Infer a month/day without a year to its next occurrence on or after `today`. */
export function inferNextOccurrence(month: number, day: number, today: string): string | null {
	const year = Number(today.slice(0, 4));
	for (const candidateYear of [year, year + 1, year + 2]) {
		if (!isValidCivilDate(candidateYear, month, day)) continue; // Feb 29
		const civil = toCivilDate(candidateYear, month, day);
		if (civil >= today) return civil;
	}
	return null;
}

function monthNumber(word: string): number | null {
	const key = word.toLowerCase().replace(/\.$/, '');
	return MONTHS[key] ?? null;
}

function acceptMonthWord(word: string): boolean {
	const lower = word.toLowerCase();
	if (!CASE_SENSITIVE_MONTH_WORDS.has(lower)) return true;
	return word[0] === word[0]!.toUpperCase();
}

/**
 * Every absolute date written in `text`, deterministically, with year inference
 * to the next occurrence on or after `today` (civil, user's timezone). Sorted by
 * position; overlapping matches keep the first/longest.
 */
export function parseAbsoluteDates(text: string, today: string): AbsoluteDateMatch[] {
	const found: AbsoluteDateMatch[] = [];
	const push = (match: AbsoluteDateMatch) => {
		const end = match.index + match.literal.length;
		const overlaps = found.some(
			(existing) =>
				match.index < existing.index + existing.literal.length && existing.index < end
		);
		if (!overlaps) found.push(match);
	};

	for (const match of text.matchAll(ISO_DATE)) {
		const year = Number(match[1]);
		const month = Number(match[2]);
		const day = Number(match[3]);
		if (!isValidCivilDate(year, month, day)) continue;
		push({
			literal: match[0],
			iso: toCivilDate(year, month, day),
			index: match.index ?? 0,
			explicitYear: true
		});
	}

	const fromParts = (
		literal: string,
		index: number,
		monthWord: string,
		dayText: string,
		yearText: string | undefined
	) => {
		if (!acceptMonthWord(monthWord)) return;
		const month = monthNumber(monthWord);
		const day = Number(dayText);
		if (!month) return;
		if (yearText) {
			const year = Number(yearText);
			if (!isValidCivilDate(year, month, day)) return;
			push({ literal, iso: toCivilDate(year, month, day), index, explicitYear: true });
			return;
		}
		if (!isValidCivilDate(2024, month, day)) return; // allows Feb 29 in leap years
		const iso = inferNextOccurrence(month, day, today);
		if (iso) push({ literal, iso, index, explicitYear: false });
	};

	for (const match of text.matchAll(MONTH_DAY)) {
		fromParts(match[0].trim(), match.index ?? 0, match[1]!, match[2]!, match[3]);
	}
	for (const match of text.matchAll(DAY_MONTH)) {
		fromParts(match[0].trim(), match.index ?? 0, match[2]!, match[1]!, match[3]);
	}

	return found.sort((a, b) => a.index - b.index);
}

/** Count of date-like phrases that are NOT absolute dates (relative words, 10/3). */
export function countNonAbsoluteDateMentions(text: string): number {
	let count = 0;
	for (const match of text.matchAll(NUMERIC_DATE)) {
		// "2026-10-03" never matches NUMERIC_DATE; version numbers like 1.2 do, which
		// only makes grounding stricter.
		if (match[0]) count += 1;
	}
	for (const match of text.matchAll(RELATIVE_DATE)) {
		if (match[0]) count += 1;
	}
	return count;
}

const ABBREVIATIONS = new Set(['mr', 'mrs', 'ms', 'dr', 'st', 'vs', 'etc', 'eg', 'ie', 'approx']);

/**
 * Split user text into sentences. Line breaks and bullets always split; ". ! ?"
 * split when followed by whitespace, except after a known abbreviation, a month
 * abbreviation followed by a day ("Oct. 3"), or a single initial.
 */
export function splitSentences(text: string): string[] {
	const sentences: string[] = [];
	for (const rawLine of text.split(/\r?\n+/)) {
		const line = rawLine.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim();
		if (!line) continue;
		let start = 0;
		const boundary = /[.!?]+(?=\s+|$)/g;
		for (const match of line.matchAll(boundary)) {
			const end = (match.index ?? 0) + match[0].length;
			const before = line.slice(start, match.index ?? 0);
			const lastWord = before
				.split(/\s+/)
				.pop()
				?.toLowerCase()
				.replace(/[^a-z]/g, '');
			const monthBeforeDay =
				lastWord !== undefined &&
				MONTHS[lastWord] !== undefined &&
				/^\s+\d/.test(line.slice(end));
			if (
				match[0] === '.' &&
				lastWord &&
				(ABBREVIATIONS.has(lastWord) || lastWord.length === 1 || monthBeforeDay)
			) {
				continue;
			}
			const sentence = line.slice(start, end).trim();
			if (sentence) sentences.push(sentence);
			start = end;
		}
		const tail = line.slice(start).trim();
		if (tail) sentences.push(tail);
	}
	return sentences;
}

export type SourcedSentence = {
	messageId: string;
	sessionId: string;
	text: string;
};

export type FreshnessDateMention = {
	/** "d1".."d12" — the Choice option key used in date_i questions. */
	id: string;
	date: string;
	as_written: string;
	sentence: string;
	messageId: string;
	sessionId: string;
};

/**
 * Absolute date mentions across the window, newest message first, deduplicated
 * by (date, sentence), capped (plan: 12).
 */
export function collectDateMentions(
	sentences: readonly SourcedSentence[],
	today: string,
	cap: number
): FreshnessDateMention[] {
	const mentions: FreshnessDateMention[] = [];
	const seen = new Set<string>();
	for (const sentence of sentences) {
		for (const match of parseAbsoluteDates(sentence.text, today)) {
			const key = `${match.iso}\u0000${sentence.text}`;
			if (seen.has(key)) continue;
			seen.add(key);
			if (mentions.length >= cap) return mentions;
			mentions.push({
				id: `d${mentions.length + 1}`,
				date: match.iso,
				as_written: match.literal,
				sentence: sentence.text,
				messageId: sentence.messageId,
				sessionId: sentence.sessionId
			});
		}
	}
	return mentions;
}
