// packages/shared-agent-ops/src/ontology/about-you.ts
//
// The About you note (tasker/146): one short document in the user's Workspace
// that BuildOS keeps from their own chat messages. It holds only what would
// change how BuildOS helps in chats about other things (the constraint, not the
// life story). The user can read, edit or delete any line; a line they delete
// never comes back, and a line they add is always kept.
//
// Format: `# About you`, an italic intro, then `## <heading>` sections of
// `- <line> _(Oct 2026)_` bullets. The date is the month the line was first
// noted. Everything here is pure so the worker (writer), the chat prompt
// (reader) and Jev (section gate) share one parser.

export const ABOUT_YOU_TYPE_KEY = 'document.context.about_you';
export const ABOUT_YOU_TITLE = 'About you';
export const ABOUT_YOU_INTRO =
	'_BuildOS keeps this note from your chats: only what changes how it should help you. Edit or delete anything. A line you delete stays gone._';

/** The one section every chat reads; every other section loads only when a turn needs it. */
export const ABOUT_YOU_ANSWERS_HEADING = 'How you like answers';

/** Headings the writer starts from. It may add others, within the section cap. */
export const ABOUT_YOU_SUGGESTED_HEADINGS = [
	ABOUT_YOU_ANSWERS_HEADING,
	'Schedule and constraints',
	"What you're focused on",
	'Where you are'
] as const;

export const ABOUT_YOU_LIMITS = {
	maxSections: 6,
	maxLinesPerSection: 5,
	maxLineChars: 160,
	maxHeadingChars: 48,
	maxTotalChars: 2000,
	maxSuppressedKeys: 200
} as const;

export type AboutYouLine = {
	text: string;
	/** Month first noted, e.g. "Oct 2026"; null when unknown (a line the user typed). */
	noted: string | null;
};

export type AboutYouSection = {
	heading: string;
	lines: AboutYouLine[];
};

const MONTHS = [
	'Jan',
	'Feb',
	'Mar',
	'Apr',
	'May',
	'Jun',
	'Jul',
	'Aug',
	'Sep',
	'Oct',
	'Nov',
	'Dec'
] as const;

/** "Oct 2026" for a date, in UTC (a month label needs no timezone precision). */
export function aboutYouNotedLabel(date: Date): string {
	return `${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

const NOTED_SUFFIX = /\s*_?\((Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4})\)_?\s*$/;
const HEADING = /^[ \t]{0,3}##[ \t]+(.+?)[ \t#]*$/;
const BULLET = /^[ \t]*(?:[-*+]|\d+[.)])[ \t]+(.*)$/;

/**
 * Equality key for one line or heading: case, spacing and punctuation folded.
 * Used only to compare lines this note itself stored (did the user delete it,
 * is it the same line again), never to interpret what a line means.
 */
export function aboutYouLineKey(text: string): string {
	return text
		.normalize('NFKC')
		.replace(NOTED_SUFFIX, '')
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.trim();
}

function cleanInline(text: string, maxChars: number): string {
	const cleaned = text
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/<[^>]*>/g, '')
		.replace(/[\r\n]+/g, ' ')
		.replace(/^#+\s*/, '')
		.replace(/\s+/g, ' ')
		.trim();
	if (cleaned.length <= maxChars) return cleaned;
	return `${cleaned.slice(0, maxChars - 3).trimEnd()}...`;
}

function cleanHeading(heading: string): string {
	return cleanInline(heading.replace(/[*_`[\]]/g, ''), ABOUT_YOU_LIMITS.maxHeadingChars);
}

function cleanLineText(text: string): string {
	return cleanInline(text, ABOUT_YOU_LIMITS.maxLineChars);
}

function splitNoted(raw: string): AboutYouLine {
	const match = NOTED_SUFFIX.exec(raw);
	if (!match) return { text: raw.trim(), noted: null };
	return { text: raw.slice(0, match.index).trim(), noted: `${match[1]} ${match[2]}` };
}

/**
 * Sections from the stored markdown. Text before the first `##` (title, intro)
 * is ignored; under a heading, bullets and plain paragraphs both become lines.
 */
export function parseAboutYouDocument(content: string | null | undefined): AboutYouSection[] {
	const sections: AboutYouSection[] = [];
	let current: AboutYouSection | null = null;
	let paragraph: string[] = [];
	const flushParagraph = () => {
		if (current && paragraph.length > 0) {
			const line = splitNoted(paragraph.join(' '));
			if (line.text) current.lines.push(line);
		}
		paragraph = [];
	};
	for (const rawLine of (content ?? '').replace(/\r\n?/g, '\n').split('\n')) {
		const heading = HEADING.exec(rawLine);
		if (heading) {
			flushParagraph();
			const title = cleanHeading(heading[1] ?? '');
			current = title ? { heading: title, lines: [] } : null;
			if (current) sections.push(current);
			continue;
		}
		if (!current) continue;
		// Any other heading (a new h1, or h3 and deeper) is outside this format.
		if (/^[ \t]{0,3}(?:#|#{3,})[ \t]/.test(rawLine)) {
			flushParagraph();
			current = null;
			continue;
		}
		const bullet = BULLET.exec(rawLine);
		if (bullet) {
			flushParagraph();
			const line = splitNoted(bullet[1] ?? '');
			if (line.text) current.lines.push(line);
			continue;
		}
		if (!rawLine.trim()) {
			flushParagraph();
			continue;
		}
		paragraph.push(rawLine.trim());
	}
	flushParagraph();
	return sections.filter((section) => section.lines.length > 0);
}

export function renderAboutYouDocument(sections: AboutYouSection[]): string {
	const body = sections
		.filter((section) => section.lines.length > 0)
		.map((section) =>
			[
				`## ${section.heading}`,
				section.lines
					.map((line) => `- ${line.text}${line.noted ? ` _(${line.noted})_` : ''}`)
					.join('\n')
			].join('\n\n')
		);
	return [`# ${ABOUT_YOU_TITLE}`, ABOUT_YOU_INTRO, ...body].join('\n\n') + '\n';
}

function lineKeys(sections: AboutYouSection[]): Set<string> {
	const keys = new Set<string>();
	for (const section of sections) {
		for (const line of section.lines) keys.add(aboutYouLineKey(line.text));
	}
	return keys;
}

/** Lines BuildOS last wrote that are gone from the note now: the user deleted them. */
export function findUserRemovedAboutYouLines(
	lastWritten: AboutYouSection[],
	current: AboutYouSection[]
): string[] {
	const now = lineKeys(current);
	return [...lineKeys(lastWritten)].filter((key) => key && !now.has(key));
}

/** Lines in the note now that BuildOS never wrote: the user typed them. */
export function findUserAddedAboutYouLines(
	lastWritten: AboutYouSection[] | null,
	current: AboutYouSection[]
): Array<{ heading: string; line: AboutYouLine }> {
	const written = lastWritten ? lineKeys(lastWritten) : new Set<string>();
	const added: Array<{ heading: string; line: AboutYouLine }> = [];
	for (const section of current) {
		for (const line of section.lines) {
			if (!written.has(aboutYouLineKey(line.text))) {
				added.push({ heading: section.heading, line });
			}
		}
	}
	return added;
}

export type AboutYouProposalLine = { heading: string; text: string };

export type AboutYouMergeResult = {
	sections: AboutYouSection[];
	suppressedKeys: string[];
	/** Proposed lines left out, and why (for logs and tests). */
	dropped: Array<{ text: string; reason: 'suppressed' | 'duplicate' | 'empty' | 'over_cap' }>;
};

/**
 * Combine the writer's proposed note with what the user did since the last
 * write. The proposal is the writer's full view of the note, so a line it
 * leaves out is retired, except lines the user typed, which always stay.
 * Lines the user deleted are suppressed for good.
 *
 * `lastWritten` null means BuildOS has not written this note before, so every
 * line in it is the user's own.
 */
export function mergeAboutYouProposal(input: {
	current: AboutYouSection[];
	lastWritten: AboutYouSection[] | null;
	suppressedKeys: string[];
	proposed: AboutYouProposalLine[];
	now: Date;
}): AboutYouMergeResult {
	const removed = input.lastWritten
		? findUserRemovedAboutYouLines(input.lastWritten, input.current)
		: [];
	const suppressedKeys = [...new Set([...removed, ...input.suppressedKeys])]
		.filter(Boolean)
		.slice(0, ABOUT_YOU_LIMITS.maxSuppressedKeys);
	const suppressed = new Set(suppressedKeys);
	const userAdded = findUserAddedAboutYouLines(input.lastWritten, input.current);
	const userKeys = new Set(userAdded.map((entry) => aboutYouLineKey(entry.line.text)));
	const notedByKey = new Map<string, string | null>();
	for (const section of input.current) {
		for (const line of section.lines) notedByKey.set(aboutYouLineKey(line.text), line.noted);
	}
	const nowLabel = aboutYouNotedLabel(input.now);
	const dropped: AboutYouMergeResult['dropped'] = [];

	const byHeading = new Map<string, AboutYouSection & { userLines: number }>();
	const seen = new Set<string>();
	const sectionFor = (heading: string) => {
		const title = cleanHeading(heading) || ABOUT_YOU_ANSWERS_HEADING;
		const key = aboutYouLineKey(title);
		let section = byHeading.get(key);
		if (!section) {
			section = { heading: title, lines: [], userLines: 0 };
			byHeading.set(key, section);
		}
		return section;
	};

	// The user's own lines first, so caps never squeeze them out.
	for (const entry of userAdded) {
		const key = aboutYouLineKey(entry.line.text);
		if (!key || seen.has(key)) continue;
		seen.add(key);
		const section = sectionFor(entry.heading);
		section.lines.push({ text: cleanLineText(entry.line.text), noted: entry.line.noted });
		section.userLines += 1;
	}
	for (const proposal of input.proposed) {
		const text = cleanLineText(proposal.text ?? '');
		const key = aboutYouLineKey(text);
		if (!key) {
			dropped.push({ text, reason: 'empty' });
			continue;
		}
		if (suppressed.has(key) && !userKeys.has(key)) {
			dropped.push({ text, reason: 'suppressed' });
			continue;
		}
		if (seen.has(key)) {
			if (!userKeys.has(key)) dropped.push({ text, reason: 'duplicate' });
			continue;
		}
		seen.add(key);
		sectionFor(proposal.heading).lines.push({
			text,
			noted: notedByKey.get(key) ?? nowLabel
		});
	}

	// Answers first, then the order sections first appeared.
	const answersKey = aboutYouLineKey(ABOUT_YOU_ANSWERS_HEADING);
	const ordered = [...byHeading.entries()]
		.sort(([left], [right]) => Number(right === answersKey) - Number(left === answersKey))
		.map(([, section]) => section);

	const sections: AboutYouSection[] = [];
	let total = 0;
	for (const section of ordered) {
		if (sections.length >= ABOUT_YOU_LIMITS.maxSections && section.userLines === 0) {
			for (const line of section.lines) dropped.push({ text: line.text, reason: 'over_cap' });
			continue;
		}
		const kept: AboutYouLine[] = [];
		section.lines.forEach((line, index) => {
			const isUser = index < section.userLines;
			const size = line.text.length + 16;
			const overLines = kept.length >= ABOUT_YOU_LIMITS.maxLinesPerSection;
			const overTotal = total + size > ABOUT_YOU_LIMITS.maxTotalChars;
			if (!isUser && (overLines || overTotal)) {
				dropped.push({ text: line.text, reason: 'over_cap' });
				return;
			}
			kept.push(line);
			total += size;
		});
		if (kept.length > 0) sections.push({ heading: section.heading, lines: kept });
	}
	return { sections, suppressedKeys, dropped };
}

export function findAboutYouSection(
	sections: AboutYouSection[],
	heading: string
): AboutYouSection | null {
	const key = aboutYouLineKey(heading);
	return sections.find((section) => aboutYouLineKey(section.heading) === key) ?? null;
}

/** Sections other than the always-on answers section: the ones a turn must earn. */
export function gatedAboutYouSections(sections: AboutYouSection[]): AboutYouSection[] {
	const answersKey = aboutYouLineKey(ABOUT_YOU_ANSWERS_HEADING);
	return sections.filter((section) => aboutYouLineKey(section.heading) !== answersKey);
}

/** Compact prompt text: one line per section, lines joined with semicolons. */
export function renderAboutYouSectionsForPrompt(sections: AboutYouSection[]): string {
	return sections
		.filter((section) => section.lines.length > 0)
		.map(
			(section) =>
				`${section.heading}: ${section.lines
					.map((line) => line.text.replace(/[.;]\s*$/, ''))
					.join('; ')}.`
		)
		.join('\n');
}
