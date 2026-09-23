// packages/shared-agent-ops/src/ontology/thinking-log.ts
//
// The project thinking log (tasker/95): the user's own words from project chats,
// kept close to verbatim so drafting can quote them. One document per project,
// newest entry first. Each entry is `## YYYY-MM-DD · <topic>`, an italic source
// line, then the user's messages as paragraphs.

export const THINKING_LOG_TYPE_KEY = 'document.context.thinking_log';
export const THINKING_LOG_INTRO =
	'_Your own words from project chats, newest first. BuildOS adds an entry at each chat checkpoint._';

/** Share of a passage's word tokens the source message contains (0..1). */
export function passageFidelity(passage: string, source: string): number {
	const words = wordTokens(passage);
	if (words.length === 0) return 0;
	const available = new Map<string, number>();
	for (const word of wordTokens(source)) available.set(word, (available.get(word) ?? 0) + 1);
	let found = 0;
	for (const word of words) {
		const left = available.get(word) ?? 0;
		if (left <= 0) continue;
		found += 1;
		available.set(word, left - 1);
	}
	return found / words.length;
}

function wordTokens(text: string): string[] {
	return (
		text
			.normalize('NFKC')
			.toLowerCase()
			.match(/[\p{L}\p{N}]+/gu) ?? []
	);
}

// A cleaned passage may drop filler and fix typos, but must stay the user's
// words: nearly every word from the source, and no longer than it.
const MIN_PASSAGE_FIDELITY = 0.9;

/**
 * The text to log for one message: the model's lightly cleaned passage when it
 * is still the user's own wording, otherwise the message as written.
 */
export function faithfulPassage(passage: string | null, source: string): string {
	const cleaned = passage?.trim() ?? '';
	if (
		cleaned &&
		cleaned.length <= source.trim().length + 20 &&
		passageFidelity(cleaned, source) >= MIN_PASSAGE_FIDELITY
	) {
		return restoreParagraphBreaks(cleaned, source);
	}
	return source.trim();
}

const PARAGRAPH_BREAK = /\n[ \t]*\n/;
const ALIGN_WINDOW = 12;

/**
 * Put the source message's paragraph breaks back into a cleaned passage that
 * lost them. Each cleaned word is matched to the next equal word of the source
 * (within a small window, since cleanup drops filler), and a break goes into the
 * whitespace before the first word matched in a later source paragraph.
 */
export function restoreParagraphBreaks(cleaned: string, source: string): string {
	const paragraphs = source.trim().split(PARAGRAPH_BREAK);
	if (paragraphs.length < 2 || cleaned.split(PARAGRAPH_BREAK).length >= paragraphs.length) {
		return cleaned;
	}
	const sourceWords = paragraphs.flatMap((paragraph, index) =>
		wordTokens(paragraph).map((word) => ({ word, paragraph: index }))
	);
	const breaks: Array<{ from: number; to: number }> = [];
	let pointer = 0;
	let paragraph = 0;
	let previousEnd = 0;
	for (const match of cleaned.matchAll(/[\p{L}\p{N}]+/gu)) {
		const word = match[0].normalize('NFKC').toLowerCase();
		const start = match.index ?? 0;
		const limit = Math.min(sourceWords.length, pointer + ALIGN_WINDOW);
		for (let index = pointer; index < limit; index++) {
			if (sourceWords[index]!.word !== word) continue;
			pointer = index + 1;
			if (sourceWords[index]!.paragraph > paragraph) {
				paragraph = sourceWords[index]!.paragraph;
				const gap = cleaned.slice(previousEnd, start);
				const space = /\s+(?=\S*$)/.exec(gap);
				if (space) {
					breaks.push({
						from: previousEnd + space.index,
						to: previousEnd + space.index + space[0].length
					});
				}
			}
			break;
		}
		previousEnd = start + match[0].length;
	}
	let result = cleaned;
	for (const { from, to } of breaks.reverse()) {
		result = `${result.slice(0, from).trimEnd()}\n\n${result.slice(to)}`;
	}
	return result;
}

/** User text becomes entry paragraphs: no comments, and no headings that would split the log. */
function sanitizePassage(text: string): string {
	return text
		.replace(/\r\n?/g, '\n')
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/^[ \t]{0,3}#{1,6}[ \t]+(.*)$/gm, '**$1**')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

function sanitizeTopic(topic: string | null | undefined): string {
	const cleaned = (topic ?? '')
		.replace(/[#*_`[\]<>]/g, '')
		.replace(/\s+/g, ' ')
		.trim();
	if (!cleaned) return 'Project thinking';
	return cleaned.length <= 90 ? cleaned : `${cleaned.slice(0, 87).trimEnd()}...`;
}

export function buildThinkingLogEntry(params: {
	date: string;
	time: string | null;
	topic: string | null;
	chatTitle: string | null;
	passages: string[];
}): string {
	const title = params.chatTitle?.replace(/"/g, '').replace(/\s+/g, ' ').trim();
	const source = [title ? `From chat "${title}"` : 'From a project chat', params.time]
		.filter(Boolean)
		.join(' · ');
	return [
		`## ${params.date} · ${sanitizeTopic(params.topic)}`,
		`_${source}_`,
		...params.passages.map(sanitizePassage).filter(Boolean)
	].join('\n\n');
}

export function buildThinkingLogDocument(projectName: string | null, entry: string): string {
	const name = projectName?.trim() || 'Project';
	return [`# Thinking log — ${name}`, THINKING_LOG_INTRO, entry].join('\n\n');
}

/** Newest first: the entry goes above the first existing entry, below the title and intro. */
export function prependThinkingLogEntry(content: string, entry: string): string {
	const body = content.replace(/\r\n?/g, '\n').trimEnd();
	const firstEntry = /^##[ \t]+/m.exec(body);
	if (!firstEntry) return `${body}\n\n${entry}\n`;
	const before = body.slice(0, firstEntry.index).trimEnd();
	const after = body.slice(firstEntry.index);
	return `${before ? `${before}\n\n` : ''}${entry}\n\n${after}\n`;
}

/** Remove one entry this capture wrote (Undo); null when the log no longer holds it verbatim. */
export function removeThinkingLogEntry(content: string, entry: string): string | null {
	const body = content.replace(/\r\n?/g, '\n');
	const index = body.indexOf(entry);
	if (index < 0) return null;
	const next = `${body.slice(0, index).trimEnd()}\n\n${body.slice(index + entry.length).trimStart()}`;
	return `${next.trim()}\n`;
}
