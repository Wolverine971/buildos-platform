// apps/web/src/lib/components/task-entities/entity-mentions.ts
//
// Turns the names a model found in a task (people, organizations, places) into links inside the
// task's own words, so the text stays the one place to read and a tap opens the entity's card
// (docs/research/task-entity-layer-2026-10-07.md). Only the first mention of each entity is
// linked. The words come from the model's checked quote and label, never from reading the prose.
//
// Two forms: splitMentions() for plain text Svelte renders itself (the reader's title), and the
// entityMentions() attachment for markdown rendered with {@html}. The sanitizer strips buttons
// and data attributes from authored markdown, so task text cannot fake a mention.
import type { Attachment } from 'svelte/attachments';

export type MentionTarget = {
	/** Card id the mention opens. */
	id: string;
	/** Words to look for, longest first. */
	words: string[];
	label: string;
};

/** A fixed-format value (a phone number or email in plain text) that becomes a plain link. */
export type MentionLink = { text: string; href: string };

export type MentionSegment =
	| { kind: 'text'; text: string }
	| { kind: 'mention'; text: string; id: string; label: string }
	| { kind: 'link'; text: string; href: string };

const WORD_CHAR = /[\p{L}\p{N}]/u;

/** First case-insensitive match of `word` in `text` that is not part of a longer word. */
export function findWord(text: string, word: string, from = 0): number {
	if (!word) return -1;
	const haystack = text.toLowerCase();
	const needle = word.toLowerCase();
	let at = haystack.indexOf(needle, from);
	while (at !== -1) {
		const before = at > 0 ? text[at - 1] : '';
		const after = text[at + needle.length] ?? '';
		const startsWord = !WORD_CHAR.test(needle[0] ?? '') || !before || !WORD_CHAR.test(before);
		const endsWord =
			!WORD_CHAR.test(needle[needle.length - 1] ?? '') || !after || !WORD_CHAR.test(after);
		if (startsWord && endsWord) return at;
		at = haystack.indexOf(needle, at + 1);
	}
	return -1;
}

type Span = { start: number; end: number } & (
	| { kind: 'mention'; id: string; label: string }
	| { kind: 'link'; href: string }
);

/** Non-overlapping spans: links first, then each target's first (longest) word. */
function planSpans(text: string, targets: MentionTarget[], links: MentionLink[]): Span[] {
	const spans: Span[] = [];
	const free = (start: number, end: number) =>
		spans.every((span) => end <= span.start || start >= span.end);
	for (const link of links) {
		const at = findWord(text, link.text);
		if (at !== -1 && free(at, at + link.text.length)) {
			spans.push({ kind: 'link', start: at, end: at + link.text.length, href: link.href });
		}
	}
	for (const target of targets) {
		for (const word of target.words) {
			let at = findWord(text, word);
			while (at !== -1 && !free(at, at + word.length)) at = findWord(text, word, at + 1);
			if (at === -1) continue;
			spans.push({
				kind: 'mention',
				start: at,
				end: at + word.length,
				id: target.id,
				label: target.label
			});
			break;
		}
	}
	return spans.sort((a, b) => a.start - b.start);
}

/** Plain text → text, mention and link segments (for text Svelte renders, like a title). */
export function splitMentions(
	text: string,
	targets: MentionTarget[],
	links: MentionLink[] = []
): MentionSegment[] {
	if (!text) return [];
	const segments: MentionSegment[] = [];
	let cursor = 0;
	for (const span of planSpans(text, targets, links)) {
		if (span.start > cursor)
			segments.push({ kind: 'text', text: text.slice(cursor, span.start) });
		const words = text.slice(span.start, span.end);
		segments.push(
			span.kind === 'mention'
				? { kind: 'mention', text: words, id: span.id, label: span.label }
				: { kind: 'link', text: words, href: span.href }
		);
		cursor = span.end;
	}
	if (cursor < text.length) segments.push({ kind: 'text', text: text.slice(cursor) });
	return segments;
}

export const MENTION_CLASS = 'entity-mention';
const SKIP = 'a, button, code, pre, [data-entity-mention], .buildos-table-embed';

export type EntityMentionOptions = {
	/** The rendered HTML. Passing it re-runs the linking whenever the body changes. */
	html: string;
	targets: MentionTarget[];
	onOpen: (id: string, trigger: HTMLElement) => void;
};

/**
 * Links the first mention of each target inside rendered markdown. Text inside links, code and
 * buttons is left alone. Cleanup puts the plain words back, so a re-run never nests.
 */
export function entityMentions(options: EntityMentionOptions): Attachment<HTMLElement> {
	return (root) => {
		void options.html;
		const targets = options.targets;
		let disposed = false;
		const inserted: HTMLElement[] = [];

		const onClick = (event: MouseEvent) => {
			const button = (event.target as Element | null)?.closest<HTMLElement>(
				'[data-entity-mention]'
			);
			if (!button || !root.contains(button)) return;
			event.preventDefault();
			options.onOpen(button.dataset.entityMention ?? '', button);
		};
		root.addEventListener('click', onClick);

		// Run after Svelte has finished writing this flush's {@html} nodes.
		queueMicrotask(() => {
			if (disposed || !targets.length) return;
			const textNodes = (): Text[] => {
				const nodes: Text[] = [];
				const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
					acceptNode: (node) =>
						node.parentElement?.closest(SKIP) || !node.nodeValue?.trim()
							? NodeFilter.FILTER_REJECT
							: NodeFilter.FILTER_ACCEPT
				});
				while (walker.nextNode()) nodes.push(walker.currentNode as Text);
				return nodes;
			};
			for (const target of targets) {
				let placed = false;
				for (const word of target.words) {
					for (const node of textNodes()) {
						const at = findWord(node.data, word);
						if (at === -1) continue;
						const match = node.splitText(at);
						match.splitText(word.length);
						const button = document.createElement('button');
						button.type = 'button';
						button.className = MENTION_CLASS;
						button.dataset.entityMention = target.id;
						button.setAttribute('aria-haspopup', 'dialog');
						button.title = `About ${target.label}`;
						button.textContent = match.data;
						match.replaceWith(button);
						inserted.push(button);
						placed = true;
						break;
					}
					if (placed) break;
				}
			}
		});

		return () => {
			disposed = true;
			root.removeEventListener('click', onClick);
			for (const element of inserted) {
				if (!element.isConnected) continue;
				const parent = element.parentNode;
				element.replaceWith(document.createTextNode(element.textContent ?? ''));
				parent?.normalize();
			}
		};
	};
}
